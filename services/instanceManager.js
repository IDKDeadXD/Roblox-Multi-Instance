'use strict';

const { exec } = require('child_process');

// accountId -> { pid, launchedAt }
const trackedInstances = new Map();

function getRunningInstances() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve([]);
      return;
    }

    const ps = [
      'Get-Process -Name RobloxPlayerBeta -ErrorAction SilentlyContinue',
      '| Select-Object Id,Name,@{N="StartTime";E={$_.StartTime.ToString("o")}},CPU',
      '| ConvertTo-Json -Compress'
    ].join(' ');

    exec(
      `powershell -NonInteractive -NoProfile -Command "${ps}"`,
      { timeout: 5000 },
      (err, stdout) => {
        if (err || !stdout?.trim()) {
          resolve([]);
          return;
        }
        try {
          let procs = JSON.parse(stdout.trim());
          if (!Array.isArray(procs)) procs = [procs];

          resolve(procs.map(p => ({
            pid:       p.Id,
            name:      p.Name,
            startTime: p.StartTime || null,
            cpu:       p.CPU || 0,
            accountId: getAccountForPid(p.Id)
          })));
        } catch {
          resolve([]);
        }
      }
    );
  });
}

function getAccountForPid(pid) {
  for (const [accountId, info] of trackedInstances) {
    if (info.pid === pid) return accountId;
  }
  return null;
}

function trackInstance(accountId, pid) {
  trackedInstances.set(accountId, { pid, launchedAt: Date.now() });
}

function killInstance(pid) {
  const safePid = parseInt(pid, 10);
  if (!Number.isFinite(safePid) || safePid <= 0) {
    return Promise.reject(new Error('Invalid PID'));
  }

  return new Promise((resolve, reject) => {
    const cmd = process.platform === 'win32'
      ? `taskkill /PID ${safePid} /F`
      : `kill -9 ${safePid}`;

    exec(cmd, { timeout: 5000 }, (err) => {
      if (err) { reject(err); return; }

      for (const [accountId, info] of trackedInstances) {
        if (info.pid === safePid) { trackedInstances.delete(accountId); break; }
      }
      resolve(true);
    });
  });
}

module.exports = { getRunningInstances, trackInstance, killInstance };
