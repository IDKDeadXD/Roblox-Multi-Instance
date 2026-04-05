'use strict';

/**
 * Guards Roblox's shared LocalStorage against multi-instance session clobbering.
 *
 * All Roblox instances read and write auth state from the same directory:
 *   %LocalAppData%\Roblox\LocalStorage\
 *
 * Two things corrupt that state in a multi-instance setup:
 *
 *   1. LAUNCH:  The Roblox bootstrapper (RobloxPlayerLauncher.exe) writes the
 *               new account's session into LocalStorage before handing off to
 *               RobloxPlayerBeta.exe. This overwrites any existing session data,
 *               so existing instances lose their auth when they next read from disk.
 *
 *   2. EXIT:    When any Roblox process exits it clears or rewrites LocalStorage
 *               with a logged-out state. Remaining instances then see "no user"
 *               the next time they navigate to the home screen.
 *
 * Fix:
 *   - Take a snapshot of LocalStorage immediately before each launch.
 *   - Restore that snapshot once the bootstrapper has finished (RobloxPlayerBeta
 *     is running), undoing the bootstrapper's overwrites.
 *   - Restore again whenever the running instance count drops (an instance exited)
 *     and at least one other instance is still alive.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROBLOX_LS = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'Roblox', 'LocalStorage'
);

let _backupPath = null;

function backupPath(userData) {
  if (!_backupPath) _backupPath = path.join(userData, 'roblox-ls-backup');
  return _backupPath;
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
      count++;
    }
  }
  return count;
}

/**
 * Snapshot the current LocalStorage into the app's userData.
 * Call this BEFORE launching a new instance.
 */
function backup(userData) {
  try {
    const n = copyDir(ROBLOX_LS, backupPath(userData));
    console.log(`[state-guard] Snapshot: ${n} file(s) from LocalStorage`);
    return true;
  } catch (err) {
    console.warn('[state-guard] Snapshot failed:', err.message);
    return false;
  }
}

/**
 * Restore the snapshot back into LocalStorage.
 * Call this after the bootstrapper finishes AND whenever an instance exits
 * while other instances are still running.
 */
function restore(userData) {
  const bp = backupPath(userData);
  if (!fs.existsSync(bp)) {
    console.warn('[state-guard] No snapshot to restore from');
    return false;
  }
  try {
    const n = copyDir(bp, ROBLOX_LS);
    console.log(`[state-guard] Restored: ${n} file(s) to LocalStorage`);
    return true;
  } catch (err) {
    console.warn('[state-guard] Restore failed:', err.message);
    return false;
  }
}

module.exports = { backup, restore };
