'use strict';

const https  = require('https');
const { spawn } = require('child_process');
const { shell } = require('electron');
const { getRobloxPlayerPath } = require('./robloxPath');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function httpsPost(hostname, path, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent':    UA,
      'Content-Type':  'application/json',
      'Content-Length': '0',
      'Accept':        'application/json, text/plain, */*',
      'Origin':        'https://www.roblox.com',
      'Referer':       'https://www.roblox.com/',
      ...extraHeaders
    };

    const req = https.request(
      { hostname, path, method: 'POST', headers },
      (res) => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          console.log(`[launcher] POST ${hostname}${path} → ${res.statusCode}`);
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.end();
  });
}

// Only strip CR/LF — pipes (|) are a required part of .ROBLOSECURITY tokens
function sanitizeToken(token) {
  return token.replace(/[\r\n]/g, '');
}

async function getCsrfToken(token) {
  // Roblox returns 403 with x-csrf-token header on an unauthenticated first POST
  const res = await httpsPost('auth.roblox.com', '/v1/authentication-ticket', {
    Cookie: `.ROBLOSECURITY=${token}`
  });
  const csrf = res.headers['x-csrf-token'];
  console.log('[launcher] CSRF token:', csrf ? `${csrf.slice(0, 8)}…` : 'MISSING', `(HTTP ${res.status})`);
  return csrf || null;
}

async function getAuthTicket(token, csrfToken) {
  const res = await httpsPost('auth.roblox.com', '/v1/authentication-ticket', {
    Cookie:                         `.ROBLOSECURITY=${token}`,
    'X-CSRF-TOKEN':                 csrfToken,
    'rbxauthenticationnegotiation': '1'
  });

  console.log('[launcher] Auth ticket HTTP', res.status);
  console.log('[launcher] Headers:', JSON.stringify(Object.keys(res.headers)));
  console.log('[launcher] Body:', res.body.slice(0, 200));

  // Ticket may arrive in header or body depending on API version
  const ticketFromHeader = res.headers['rbx-authentication-ticket'];
  let ticketFromBody = null;
  try {
    const parsed = JSON.parse(res.body);
    ticketFromBody = parsed?.authenticationTicket || parsed?.ticket || null;
  } catch { /* not JSON */ }

  const ticket = ticketFromHeader || ticketFromBody;

  if (!ticket) {
    throw new Error(
      `Auth ticket request failed (HTTP ${res.status}). ` +
      `Body: ${res.body.slice(0, 300)}`
    );
  }
  return ticket;
}

async function launch(roblosecurityToken, useBloxstrap = false) {
  const safeToken = sanitizeToken(roblosecurityToken);
  if (safeToken.length < 100) throw new Error('Token appears invalid or incomplete');

  const csrfToken = await getCsrfToken(safeToken);
  if (!csrfToken) throw new Error('Could not get CSRF token from Roblox');

  const ticket = await getAuthTicket(safeToken, csrfToken);

  const launchUrl = [
    'roblox-player://1',
    '+launchmode:app',
    `+gameinfo:${ticket}`,
    '+browsertrackerid:0',
    '+robloxLocale:en_us',
    '+gameLocale:en_us',
    '+channel:',
    '+LaunchExp:InApp'
  ].join('');

  if (useBloxstrap) {
    // Bloxstrap path — goes through the registered roblox-player:// handler.
    // Requires Bloxstrap's "Multi-instance launching" setting to be ON, otherwise
    // Bloxstrap will kill the existing instance. Use this if direct launch fails.
    console.log('[launcher] Opening via Bloxstrap:', launchUrl.slice(0, 120) + '…');
    await shell.openExternal(launchUrl);
  } else {
    // Direct path — spawns RobloxPlayerBeta.exe directly, bypassing Bloxstrap.
    // Our mutex holder must be running before any Roblox instance starts.
    const exePath = getRobloxPlayerPath();
    if (!exePath) throw new Error('Could not locate RobloxPlayerBeta.exe');

    console.log('[launcher] Spawning directly:', exePath);
    console.log('[launcher] URL:', launchUrl.slice(0, 120) + '…');

    const child = spawn(exePath, [launchUrl], { detached: true, stdio: 'ignore' });
    child.unref();
  }

  return { success: true };
}

module.exports = { launch };
