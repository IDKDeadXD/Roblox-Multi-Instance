'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close')
  },

  accounts: {
    list:          ()        => ipcRenderer.invoke('accounts:list'),
    add:           (data)    => ipcRenderer.invoke('accounts:add', data),
    remove:        (id)      => ipcRenderer.invoke('accounts:remove', { id }),
    loginBrowser:  ()        => ipcRenderer.invoke('accounts:login-browser'),
    refreshAvatar: (id)      => ipcRenderer.invoke('accounts:refresh-avatar', { id })
  },

  instances: {
    list:     ()                              => ipcRenderer.invoke('instances:list'),
    launch:   (accountId, useBloxstrap=false) => ipcRenderer.invoke('instances:launch', { accountId, useBloxstrap }),
    kill:     (pid)                           => ipcRenderer.invoke('instances:kill', { pid }),
    onUpdate: (cb) => {
      ipcRenderer.on('instances:update', (_e, data) => cb(data));
    }
  },

  roblox: {
    checkStartup: ()   => ipcRenderer.invoke('roblox:check-startup'),
    closeAll:     ()   => ipcRenderer.invoke('roblox:close-all')
  },

  settings: {
    get: ()        => ipcRenderer.invoke('settings:get'),
    set: (data)    => ipcRenderer.invoke('settings:set', data)
  }
});
