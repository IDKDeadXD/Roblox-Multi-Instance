'use strict';

/**
 * Holds the ROBLOX_singletonEvent mutex for the lifetime of the app.
 *
 * Roblox uses this named mutex to detect if another instance is already running.
 * By creating it first (with false = no initial ownership), Roblox always sees it
 * as pre-existing and runs without raising a singleton conflict.
 * This mirrors exactly what MultiBloxy (github.com/Zgoly/MultiBloxy) does.
 */

const { spawn } = require('child_process');

const MUTEX_NAME = 'ROBLOX_singletonEvent';

let holderProcess = null;

// PowerShell: create the mutex then block on stdin so it stays alive
// until we close stdin (on app quit).
const PS_SCRIPT = `
$m = New-Object System.Threading.Mutex($false, "${MUTEX_NAME}")
Write-Output "held"
[Console]::In.ReadLine() | Out-Null
$m.Close()
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
