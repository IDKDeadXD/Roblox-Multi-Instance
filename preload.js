'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  window: {
    minimize:  () => ipcRenderer.send('window:minimize'),
    maximize:  () => ipcRenderer.send('window:maximize'),
    close:     () => ipcRenderer.send('window:close'),
    hide:      () => ipcRenderer.send('window:hide')
  },

  accounts: {
    list:          ()                    => ipcRenderer.invoke('accounts:list'),
    add:           (data)                => ipcRenderer.invoke('accounts:add', data),
    remove:        (id)                  => ipcRenderer.invoke('accounts:remove', { id }),
    loginBrowser:  ()                    => ipcRenderer.invoke('accounts:login-browser'),
    refreshAvatar: (id)                  => ipcRenderer.invoke('accounts:refresh-avatar', { id }),
    checkHealth:   (id)                  => ipcRenderer.invoke('accounts:check-health', { id }),
    updateLabel:   (id, label, color)    => ipcRenderer.invoke('accounts:update-label', { id, label, color })
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
