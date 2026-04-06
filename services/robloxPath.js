'use strict';

const fs   = require('fs');
const path = require('path');

const LOCAL = process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local');

/**
 * Returns the path to RobloxPlayerBeta.exe.
 *
 * Checks Bloxstrap's versioned install first (most common), then falls back
 * to the standard Roblox install directory.
 *
 * We bypass the roblox-player:// protocol handler entirely so that Bloxstrap
 * cannot intercept the launch and kill any existing Roblox instance.
 */
function getRobloxPlayerPath() {
  // --- Bloxstrap ---
  const bloxstrapState = path.join(LOCAL, 'Bloxstrap', 'PlayerState.json');
  if (fs.existsSync(bloxstrapState)) {
    try {
      const { VersionGuid } = JSON.parse(fs.readFileSync(bloxstrapState, 'utf8'));
      if (VersionGuid) {
        const candidate = path.join(LOCAL, 'Bloxstrap', 'Versions', VersionGuid, 'RobloxPlayerBeta.exe');
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch { /* fall through */ }

    // Bloxstrap installed but PlayerState unreadable — scan versions dir
    const versionsDir = path.join(LOCAL, 'Bloxstrap', 'Versions');
    const found = findNewestExe(versionsDir);
    if (found) return found;
  }

  // --- Standard Roblox install ---
  const robloxVersions = path.join(LOCAL, 'Roblox', 'Versions');
  const found = findNewestExe(robloxVersions);
  if (found) return found;

  return null;
}

function findNewestExe(versionsDir) {
  if (!fs.existsSync(versionsDir)) return null;
  const entries = fs.readdirSync(versionsDir, { withFileTypes: true });
  const dirs = entries
    .filter(e => e.isDirectory())
    .map(e => ({
      name: e.name,
      mtime: fs.statSync(path.join(versionsDir, e.name)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime); // newest first

  for (const dir of dirs) {
    const exe = path.join(versionsDir, dir.name, 'RobloxPlayerBeta.exe');
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

module.exports = { getRobloxPlayerPath };
