'use strict';

const crypto = require('crypto');

let _key = null;

function getKey() {
  if (_key) return _key;

  try {
    const { machineIdSync } = require('node-machine-id');
    const machineId = machineIdSync({ original: true });
    _key = crypto.createHash('sha256')
      .update(machineId + ':rbx-mgr-v1:salt-9f3a')
      .digest();
  } catch {
    // Fallback: derive from a stable app-level secret stored on disk
    const path = require('path');
    const fs = require('fs');
    const { app } = require('electron');
    const keyFile = path.join(app.getPath('userData'), '.keymat');

    if (fs.existsSync(keyFile)) {
      _key = Buffer.from(fs.readFileSync(keyFile, 'utf8'), 'hex');
    } else {
      _key = crypto.randomBytes(32);
      fs.writeFileSync(keyFile, _key.toString('hex'), 'utf8');
    }
  }

  return _key;
}

function encrypt(plaintext) {
  if (typeof plaintext !== 'string') throw new Error('plaintext must be a string');
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${ciphertext}`;
}

function decrypt(encryptedData) {
  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Invalid encrypted data');
  }

  const parts = encryptedData.split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted data');

  const [ivHex, authTagHex, ciphertext] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

module.exports = { encrypt, decrypt };
