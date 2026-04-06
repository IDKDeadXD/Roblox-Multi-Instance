'use strict';

const { app, BrowserWindow, ipcMain, shell, session, nativeImage } = require('electron');
const path = require('path');
const mutexHolder = require('./services/mutexHolder');

let mainWindow;

// Lazy-load services after app is ready (needs app.getPath)
let encryption, storage, accountManager, instanceManager, robloxApi, robloxLauncher;

function loadServices() {
  encryption = require('./services/encryption');
  storage = require('./services/storage');
  accountManager = require('./services/accountManager');
  instanceManager = require('./services/instanceManager');
  robloxApi = require('./services/robloxApi');
  robloxLauncher = require('./services/robloxLauncher');
}

const APP_ICON = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));

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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

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

  // Poll for running instances every 3 seconds
  setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const instances = await instanceManager.getRunningInstances();
      mainWindow.webContents.send('instances:update', instances);
    } catch (_) {}
  }, 3000);
});

app.on('before-quit', () => {
  mutexHolder.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Window controls ──────────────────────────────────────────────────────────

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// ── Accounts ─────────────────────────────────────────────────────────────────

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
    username: userInfo.username,
    displayName: userInfo.displayName,
    userId: userInfo.userId,
    avatarUrl: userInfo.avatarUrl,
    token: cleanToken
  });
});

ipcMain.handle('accounts:remove', async (_event, { id }) => {
  if (!id || typeof id !== 'string') throw new Error('Invalid account ID');
  return accountManager.remove(id);
});

ipcMain.handle('accounts:login-browser', async () => {
  return new Promise((resolve) => {
    const partition = 'temp:roblox-login-' + Date.now();
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
        name: '.ROBLOSECURITY'
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
  const token = encryption.decrypt(account.encryptedToken);
  const userInfo = await robloxApi.getUserInfo(token);
  accountManager.update(id, { avatarUrl: userInfo.avatarUrl });
  return userInfo.avatarUrl;
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
  // of the singleton mutexes before Roblox ever started. If Roblox is already
  // running and none of those instances were launched by us, Roblox owns the
  // mutexes — a second direct-launch will get wrong singleton state.
  if (!useBloxstrap) {
    const running = await instanceManager.getRunningInstances();
    const external = running.filter(i => i.accountId === null);
    if (external.length > 0 && running.every(i => i.accountId === null)) {
      throw new Error(
        'Roblox is already open.\n\nClose all Roblox windows first — multi-instance requires this app to start before Roblox so it can hold the singleton. Then relaunch from here.\n\nAlternatively, use "Launch via Bloxstrap" (requires Bloxstrap multi-instance to be enabled).'
      );
    }
  }

  const token = encryption.decrypt(account.encryptedToken);
  const settings = storage.getSettings();

  // Small delay between launches so the Roblox bootstrapper has time to read
  // the mutex before the next instance starts.
  if (settings.multiInstanceEnabled) {
    await delay(settings.launchDelay || 800);
  }

  return robloxLauncher.launch(token, useBloxstrap);
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

// Renderer calls this once on boot to check if Roblox was already running
// before our app started. Pull pattern — avoids race conditions from push.
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

// ── App icon ──────────────────────────────────────────────────────────────────


function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
