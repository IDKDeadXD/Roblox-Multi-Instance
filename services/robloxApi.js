'use strict';

const https = require('https');

const ROBLOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function httpsGet(hostname, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path,
        method: 'GET',
        headers: { 'User-Agent': ROBLOX_UA, ...headers }
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.end();
  });
}

/**
 * Strip only characters that could cause HTTP header injection (CR/LF).
 * .ROBLOSECURITY tokens contain pipes (|), hyphens, underscores, and alphanumerics —
 * these must NOT be stripped.
 */
function sanitizeToken(token) {
  return token.replace(/[\r\n]/g, '');
}

async function getUserInfo(roblosecurityToken) {
  const safeToken = sanitizeToken(roblosecurityToken);

  const { status, body: userInfo } = await httpsGet(
    'users.roblox.com',
    '/v1/users/authenticated',
    {
      Cookie:  `.ROBLOSECURITY=${safeToken}`,
      Referer: 'https://www.roblox.com/'
    }
  );

  if (status === 401) {
    throw new Error('Token is invalid or has expired. Please log in again.');
  }
  if (status !== 200 || !userInfo || !userInfo.id) {
    throw new Error(`Roblox API error (HTTP ${status}). Check that the token is correct.`);
  }

  const userId = userInfo.id;
  const avatarUrl = await getAvatarUrl(userId);

  return {
    userId,
    username:    userInfo.name,
    displayName: userInfo.displayName || userInfo.name,
    avatarUrl
  };
}

async function getAvatarUrl(userId) {
  const safeId = parseInt(userId, 10);
  if (!Number.isFinite(safeId) || safeId <= 0) return null;

  try {
    const { body: data } = await httpsGet(
      'thumbnails.roblox.com',
      `/v1/users/avatar-headshot?userIds=${safeId}&size=150x150&format=Png&isCircular=true`
    );
    return data?.data?.[0]?.imageUrl || null;
  } catch {
    return null;
  }
}

async function checkTokenHealth(roblosecurityToken) {
  const safeToken = sanitizeToken(roblosecurityToken);
  try {
    const { status } = await httpsGet(
      'users.roblox.com',
      '/v1/users/authenticated',
      { Cookie: `.ROBLOSECURITY=${safeToken}`, Referer: 'https://www.roblox.com/' }
    );
    return status === 200 ? 'valid' : 'expired';
  } catch {
    return 'unknown';
  }
}

module.exports = { getUserInfo, getAvatarUrl, checkTokenHealth };
