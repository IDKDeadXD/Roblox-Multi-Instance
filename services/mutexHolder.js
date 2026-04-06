'use strict';

/**
 * Holds the Roblox singleton mutexes for the lifetime of the app.
 *
 * Roblox uses CreateMutex() on two named objects to detect a running instance:
 *   - ROBLOX_singletonMutex
 *   - ROBLOX_singletonEvent  (named Mutex despite the "Event" suffix)
 * When CreateMutex returns ERROR_ALREADY_EXISTS, Roblox skips the singleton
 * guard and runs normally as a non-primary instance.
 *
 * We also lock RobloxCookies.dat with FileShare.None so that when any Roblox
 * instance exits it cannot clear the cookie file — which is what causes other
 * running instances to get signed out.
 */

const { spawn } = require('child_process');

const MUTEX_NAME = 'ROBLOX_singletonEvent';

let holderProcess = null;

// PowerShell script that:
// 1. Closes any leftover singleton objects from a previous crashed run
// 2. Creates BOTH ROBLOX_singletonMutex AND ROBLOX_singletonEvent as owned Mutexes.
//    Roblox calls CreateMutex() and checks GetLastError()==ERROR_ALREADY_EXISTS —
//    finding an existing owned mutex puts it in non-singleton mode so it runs normally.
// 3. Locks RobloxCookies.dat with exclusive read (FileShare.None) so that when any
//    Roblox instance exits it cannot clear/overwrite the cookie file, which is what
//    causes other instances to get signed out.
const PS_SCRIPT = `
try { [System.Threading.Mutex]::OpenExisting("ROBLOX_singletonMutex").Close() } catch {}
try { [System.Threading.Mutex]::OpenExisting("ROBLOX_singletonEvent").Close() } catch {}
$m1 = New-Object System.Threading.Mutex($true, "ROBLOX_singletonMutex")
$m2 = New-Object System.Threading.Mutex($true, "ROBLOX_singletonEvent")
$cookiePath = [System.IO.Path]::Combine($env:LOCALAPPDATA, "Roblox", "LocalStorage", "RobloxCookies.dat")
$cookieLock = $null
if ([System.IO.File]::Exists($cookiePath)) {
    try { $cookieLock = [System.IO.File]::Open($cookiePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None) } catch {}
}
Write-Output "held"
[Console]::In.ReadLine() | Out-Null
if ($cookieLock) { $cookieLock.Close() }
try { $m1.ReleaseMutex() } catch {}; $m1.Close()
try { $m2.ReleaseMutex() } catch {}; $m2.Close()
`.trim();

function start() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ ok: false, reason: 'not_win32' });
      return;
    }

    holderProcess = spawn(
      'powershell',
      ['-NonInteractive', '-NoProfile', '-WindowStyle', 'Hidden', '-Command', PS_SCRIPT],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    let resolved = false;

    holderProcess.stdout.on('data', (data) => {
      const out = data.toString().trim();
      console.log('[mutex-holder]', out);
      if (!resolved) {
        resolved = true;
        resolve({ ok: out === 'held', reason: out });
      }
    });

    holderProcess.stderr.on('data', (data) => {
      console.warn('[mutex-holder] stderr:', data.toString().trim());
    });

    holderProcess.on('exit', (code) => {
      console.log('[mutex-holder] process exited, code:', code);
      holderProcess = null;
    });

    holderProcess.on('error', (err) => {
      console.error('[mutex-holder] spawn error:', err.message);
      if (!resolved) { resolved = true; resolve({ ok: false, reason: err.message }); }
    });

    // Fallback timeout
    setTimeout(() => {
      if (!resolved) { resolved = true; resolve({ ok: false, reason: 'timeout' }); }
    }, 6000);
  });
}

function stop() {
  if (!holderProcess) return;
  try {
    // Writing to stdin then closing it lets the PowerShell script exit cleanly
    holderProcess.stdin.write('\n');
    holderProcess.stdin.end();
  } catch (_) {}
  // Hard kill after 1 second if it hasn't exited
  setTimeout(() => {
    try { holderProcess?.kill(); } catch (_) {}
    holderProcess = null;
  }, 1000);
}

function isRunning() {
  return holderProcess !== null && !holderProcess.killed;
}

module.exports = { start, stop, isRunning, MUTEX_NAME };
