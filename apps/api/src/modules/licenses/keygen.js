import crypto from 'crypto';
import { env } from '../../config/env.js';

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateLicenseKey() {
  const randomBytes = crypto.randomBytes(15); // Gives enough entropy for 20 chars
  let keyChars = '';
  
  for (let i = 0; i < 20; i++) {
    // Very simple mapping for the Crockford Base32.
    // Each character represents 5 bits. 15 bytes = 120 bits = 24 chars (we only need 20).
    // A simple robust approach is to just select random chars uniformly:
    const randomByte = crypto.randomBytes(1)[0];
    keyChars += CROCKFORD_ALPHABET[randomByte % CROCKFORD_ALPHABET.length];
  }
  
  return `BSEO-${keyChars.slice(0, 5)}-${keyChars.slice(5, 10)}-${keyChars.slice(10, 15)}-${keyChars.slice(15, 20)}`;
}

export function normalizeKey(key) {
  if (!key) return '';
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashKey(key) {
  const normalized = normalizeKey(key);
  const hmac = crypto.createHmac('sha256', env.LICENSE_KEY_PEPPER);
  hmac.update(normalized);
  return hmac.digest();
}

export function encryptKey(key) {
  // Uses APP_ENCRYPTION_KEYS (v1:base64)
  const currentKeyStr = env.APP_ENCRYPTION_KEYS.split(',')[0];
  const [version, base64Key] = currentKeyStr.split(':');
  
  const encryptionKey = Buffer.from(base64Key, 'base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  
  let encrypted = cipher.update(key, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');
  
  return `${version}:${iv.toString('base64')}:${authTag}:${encrypted}`;
}

export function decryptKey(ciphertext) {
  const parts = ciphertext.split(':');
  if (parts.length !== 4) throw new Error('Invalid ciphertext format');
  
  const [version, ivBase64, authTagBase64, encryptedBase64] = parts;
  
  // Find matching key from APP_ENCRYPTION_KEYS
  const keys = env.APP_ENCRYPTION_KEYS.split(',');
  let encryptionKey;
  for (const k of keys) {
    const [v, base64Key] = k.split(':');
    if (v === version) {
      encryptionKey = Buffer.from(base64Key, 'base64');
      break;
    }
  }
  
  if (!encryptionKey) throw new Error(`Encryption key version ${version} not found`);
  
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm', 
    encryptionKey, 
    Buffer.from(ivBase64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));
  
  let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
