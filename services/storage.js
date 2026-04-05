'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function getDataPath() {
  return path.join(app.getPath('userData'), 'accounts.json');
}

function defaultSettings() {
  return {
    multiInstanceEnabled: true,
    launchDelay: 800
  };
}

function read() {
  const p = getDataPath();
  if (!fs.existsSync(p)) return { accounts: [], settings: defaultSettings() };
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
      settings: { ...defaultSettings(), ...(raw.settings || {}) }
    };
  } catch {
    return { accounts: [], settings: defaultSettings() };
  }
}

function write(data) {
  fs.writeFileSync(getDataPath(), JSON.stringify(data, null, 2), 'utf8');
}

function getSettings() {
  return read().settings;
}

function getSetting(key) {
  return read().settings[key];
}

function setSettings(updates) {
  const data = read();
  data.settings = { ...data.settings, ...updates };
  write(data);
  return data.settings;
}

module.exports = { read, write, getSettings, getSetting, setSettings };
