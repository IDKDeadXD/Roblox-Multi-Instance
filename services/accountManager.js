'use strict';

const crypto = require('crypto');
const storage = require('./storage');
const encryption = require('./encryption');

function getAll() {
  const { accounts } = storage.read();
  // Strip encrypted token before returning to renderer
  return accounts.map(({ encryptedToken: _, ...safe }) => safe);
}

function getById(id) {
  const { accounts } = storage.read();
  return accounts.find(a => a.id === id) || null;
}

function add({ username, displayName, userId, avatarUrl, token }) {
  const data = storage.read();
  const encryptedToken = encryption.encrypt(token);

  const account = {
    id: crypto.randomUUID(),
    username,
    displayName: displayName || username,
    userId,
    avatarUrl: avatarUrl || null,
    encryptedToken,
    addedAt: new Date().toISOString()
  };

  data.accounts.push(account);
  storage.write(data);

  const { encryptedToken: _, ...safe } = account;
  return safe;
}

function remove(id) {
  const data = storage.read();
  data.accounts = data.accounts.filter(a => a.id !== id);
  storage.write(data);
  return true;
}

function update(id, updates) {
  const data = storage.read();
  const idx = data.accounts.findIndex(a => a.id === id);
  if (idx === -1) return null;

  // Never allow overwriting encryptedToken via update()
  const { encryptedToken: _, ...safeUpdates } = updates;
  data.accounts[idx] = { ...data.accounts[idx], ...safeUpdates };
  storage.write(data);

  const { encryptedToken: __, ...safe } = data.accounts[idx];
  return safe;
}

module.exports = { getAll, getById, add, remove, update };
