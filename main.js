'use strict';

const { app, BrowserWindow, ipcMain, shell, session, nativeImage, Tray, Menu } = require('electron');
const path = require('path');
const mutexHolder = require('./services/mutexHolder');

// ── Single-instance lock ──────────────────────────────────────────────────────
// Quit immediately if another instance is already running.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  // eslint-disable-next-line no-process-exit
  process.exit(0);
}

let mainWindow;
let tray = null;
let appIsQuitting = false;

// Lazy-load services after app is ready (needs app.getPath)
let encryption, storage, accountManager, instanceManager, robloxApi, robloxLauncher;

function loadServices() {
  encryption     = require('./services/encryption');
  storage        = require('./services/storage');
  accountManager = require('./services/accountManager');
  instanceManager= require('./services/instanceManager');
  robloxApi      = require('./services/robloxApi');
  robloxLauncher = require('./services/robloxLauncher');
}

const APP_ICON = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));

// ── Tray ──────────────────────────────────────────────────────────────────────

function createTray() {
  const trayImg = nativeImage.createFromPath(path.join(__dirname, 'icon.png'))
    .resize({ width: 16, height: 16 });
  tray = new Tray(trayImg);
  tray.setToolTip('Roblox Instance Manager');

  // Single-click: toggle window visibility
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  updateTrayMenu([]);
}

function updateTrayMenu(instances = []) {
  if (!tray) return;

  const runningCount = instances.length;
  const accounts = accountManager ? accountManager.getAll() : [];

  const launchItems = accounts.map(acc => ({
    label: `@${acc.username}`,
    click: async () => {
      try {
        const fullAcc = accountManager.getById(acc.id);
        if (!fullAcc) return;
        const token = encryption.decrypt(fullAcc.encryptedToken);
        const settings = storage.getSettings();
        if (settings.multiInstanceEnabled) await delay(settings.launchDelay || 800);
        await robloxLauncher.launch(token, false);
        // Record launch history
        accountManager.update(acc.id, {
          lastLaunchedAt: new Date().toISOString(),
          launchCount: (fullAcc.launchCount || 0) + 1
        });
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
      } catch (err) {
        console.error('[tray] launch error:', err.message);
      }
    }
  }));

  const template = [
    { label: 'Roblox Instance Manager', enabled: false },
    {
      label: runningCount > 0
        ? `${runningCount} instance${runningCount !== 1 ? 's' : ''} running`
        : 'No instances running',
      enabled: false
    },
    { type: 'separator' },
    ...(launchItems.length > 0
      ? [{ label: 'Quick Launch', enabled: false }, ...launchItems, { type: 'separator' }]
      : [{ label: 'No accounts saved', enabled: false }, { type: 'separator' }]
    ),
    {
      label: 'Show Window',
      click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => { appIsQuitting = true; app.quit(); }
    }
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(
    runningCount > 0
      ? `Roblox Manager — ${runningCount} instance${runningCount !== 1 ? 's' : ''} running`
      : 'Roblox Instance Manager'
  );
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: false
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!appIsQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

// When a second instance is launched, focus the existing window instead
app.on('second-instance', () => {
  if (mainWindow) {
    mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  loadServices();

  // Hold the ROBLOX_singletonEvent mutex for the lifetime of the app so that
  // each Roblox instance sees it as pre-existing and skips the singleton check.
  const mutexResult = await mutexHolder.start();
  if (!mutexResult.ok) {
    console.warn('[main] Mutex holder failed to start:', mutexResult.reason,
      '— multi-instance may not work');
  } else {
    console.log('[main] Mutex holder started successfully');
  }

  createWindow();
  createTray();

  // Poll for running instances every 3 seconds
  setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const instances = await instanceManager.getRunningInstances();
      mainWindow.webContents.send('instances:update', instances);
      updateTrayMenu(instances);
    } catch (_) {}
  }, 3000);
});

app.on('before-quit', () => {
  appIsQuitting = true;
  mutexHolder.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Window controls ───────────────────────────────────────────────────────────

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => {
  // Honour the close button: hide to tray (same as clicking X)
  mainWindow?.hide();
});
ipcMain.on('window:hide', () => mainWindow?.hide());

// ── Accounts ──────────────────────────────────────────────────────────────────

ipcMain.handle('accounts:list', async () => {
  return accountManager.getAll();
});

ipcMain.handle('accounts:add', async (_event, { token }) => {
  if (!token || typeof token !== 'string' || token.trim().length < 100) {
    throw new Error('Invalid session token');
  }
  const cleanToken = token.trim();
  const userInfo = await robloxApi.getUserInfo(cleanToken);
  return accountManager.add({
    username:    userInfo.username,
    displayName: userInfo.displayName,
    userId:      userInfo.userId,
    avatarUrl:   userInfo.avatarUrl,
    token:       cleanToken
  });
});

ipcMain.handle('accounts:remove', async (_event, { id }) => {
  if (!id || typeof id !== 'string') throw new Error('Invalid account ID');
  return accountManager.remove(id);
});

ipcMain.handle('accounts:login-browser', async () => {
  return new Promise((resolve) => {
    const partition  = 'temp:roblox-login-' + Date.now();
    const loginSession = session.fromPartition(partition);

    const loginWindow = new BrowserWindow({
      width: 960,
      height: 700,
      parent: mainWindow,
      modal: true,
      title: 'Login to Roblox',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        session: loginSession
      }
    });

    loginWindow.setMenuBarVisibility(false);
    loginWindow.loadURL('https://www.roblox.com/login');

    const tryCapture = async () => {
      const cookies = await loginSession.cookies.get({
        domain: '.roblox.com',
        name:   '.ROBLOSECURITY'
      });
      if (cookies.length > 0) {
        const token = cookies[0].value;
        loginWindow.close();
        resolve(token);
      }
    };

    loginSession.cookies.on('changed', (_e, cookie) => {
      if (cookie.name === '.ROBLOSECURITY' && !cookie.removed) {
        setTimeout(tryCapture, 600);
      }
    });

    loginWindow.on('closed', () => resolve(null));
  });
});

ipcMain.handle('accounts:refresh-avatar', async (_event, { id }) => {
  if (!id || typeof id !== 'string') throw new Error('Invalid account ID');
  const account = accountManager.getById(id);
  if (!account) throw new Error('Account not found');
  const token   = encryption.decrypt(account.encryptedToken);
  const userInfo = await robloxApi.getUserInfo(token);
  accountManager.update(id, { avatarUrl: userInfo.avatarUrl });
  return userInfo.avatarUrl;
});

ipcMain.handle('accounts:check-health', async (_event, { id }) => {
  if (!id || typeof id !== 'string') throw new Error('Invalid account ID');
  const account = accountManager.getById(id);
  if (!account) throw new Error('Account not found');
  const token  = encryption.decrypt(account.encryptedToken);
  const status = await robloxApi.checkTokenHealth(token);
  accountManager.update(id, { tokenStatus: status, tokenCheckedAt: new Date().toISOString() });
  return status;
});

const VALID_LABEL_COLORS = new Set([
  '', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#94a3b8'
]);

ipcMain.handle('accounts:update-label', async (_event, { id, label, color }) => {
  if (!id || typeof id !== 'string') throw new Error('Invalid account ID');
  const safeLabel = typeof label === 'string'
    ? label.slice(0, 20).replace(/[<>&"]/g, '')
    : '';
  const safeColor = VALID_LABEL_COLORS.has(color) ? color : '';
  return accountManager.update(id, { label: safeLabel, labelColor: safeColor });
});

// ── Instances ─────────────────────────────────────────────────────────────────

ipcMain.handle('instances:list', async () => {
  return instanceManager.getRunningInstances();
});

ipcMain.handle('instances:launch', async (_event, { accountId, useBloxstrap = false }) => {
  if (!accountId || typeof accountId !== 'string') throw new Error('Invalid account ID');

  const account = accountManager.getById(accountId);
  if (!account) throw new Error('Account not found');

  // If launching directly (not via Bloxstrap), our app must have taken ownership
  // of the singleton mutexes before Roblox ever started.
  if (!useBloxstrap) {
    const running  = await instanceManager.getRunningInstances();
    const external = running.filter(i => i.accountId === null);
    if (external.length > 0 && running.every(i => i.accountId === null)) {
      throw new Error(
        'Roblox is already open.\n\nClose all Roblox windows first — multi-instance requires this app to start before Roblox so it can hold the singleton. Then relaunch from here.\n\nAlternatively, use "Launch via Bloxstrap" (requires Bloxstrap multi-instance to be enabled).'
      );
    }
  }

  const token    = encryption.decrypt(account.encryptedToken);
  const settings = storage.getSettings();

  if (settings.multiInstanceEnabled) {
    await delay(settings.launchDelay || 800);
  }

  await robloxLauncher.launch(token, useBloxstrap);

  // Record launch history and return updated account to renderer
  const updated = accountManager.update(accountId, {
    lastLaunchedAt: new Date().toISOString(),
    launchCount:    (account.launchCount || 0) + 1
  });

  return updated; // safe object (encryptedToken stripped by accountManager.update)
});

ipcMain.handle('instances:kill', async (_event, { pid }) => {
  const safePid = parseInt(pid, 10);
  if (!Number.isFinite(safePid) || safePid <= 0) throw new Error('Invalid PID');
  return instanceManager.killInstance(safePid);
});

// ── Settings ──────────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', async () => {
  return storage.getSettings();
});

ipcMain.handle('settings:set', async (_event, settings) => {
  if (typeof settings !== 'object' || settings === null) throw new Error('Invalid settings');
  return storage.setSettings(settings);
});

// ── Roblox process management ─────────────────────────────────────────────────

ipcMain.handle('roblox:check-startup', async () => {
  const instances = await instanceManager.getRunningInstances();
  return instances.length;
});

ipcMain.handle('roblox:close-all', async () => {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    exec('taskkill /IM RobloxPlayerBeta.exe /F', { timeout: 5000 }, () => resolve(true));
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
