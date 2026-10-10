import { describe, expect, test } from 'vitest';
import { validateBackup } from '../src/modules/admin/data.routes.js';
import { decryptKey, encryptKey, hashKey } from '../src/modules/licenses/keygen.js';

const validBackup = () => ({
  format: 'bricksseo-data-export',
  version: 1,
  exportedAt: '2026-01-01T00:00:00.000Z',
  customers: [{
    email: 'customer@example.com',
    name: 'Example Customer',
    status: 'active',
    flagged: false,
    licenses: [{
      key: 'BSEO-01234-56789-ABCDE-FGHJK',
      planCode: 'studio',
      status: 'active',
      siteLimit: 3,
      issuedAt: '2025-01-01T00:00:00.000Z',
      expiresAt: null,
      activations: [{
        siteKey: 'example.com',
        siteUrl: 'https://example.com',
        siteName: 'Example',
        environment: 'production',
        countsTowardLimit: true,
        firstActivatedAt: '2025-01-02T00:00:00.000Z',
        lastSeenAt: '2025-01-03T00:00:00.000Z',
        deactivatedAt: null,
        lastIp: '192.0.2.1'
      }]
    }]
  }]
});

describe('portable data backup validation', () => {
  test('accepts a valid customer, working license key, and restorable activation', () => {
    const result = validateBackup(validBackup());

    expect(result.errors).toEqual([]);
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0].email).toBe('customer@example.com');
    expect(result.customers[0].licenses[0].key).toBe('BSEO-01234-56789-ABCDE-FGHJK');
    expect(result.customers[0].licenses[0].activations[0].siteKey).toBe('example.com');
    expect(result.customers[0].licenses[0].issuedAt).toBeInstanceOf(Date);
  });

  test('rejects malformed keys and repeated customers or keys before import', () => {
    const backup = validBackup();
    backup.customers.push(structuredClone(backup.customers[0]));
    backup.customers[0].licenses[0].key = 'not-a-license-key';
    backup.customers[1].licenses[0].key = 'not-a-license-key';
    const result = validateBackup(backup);

    expect(result.errors).toContain('Customer 1, license 1 has an invalid license key.');
    expect(result.errors.some(error => error.includes('duplicates customer@example.com'))).toBe(true);
    expect(result.errors.some(error => error.includes('duplicates a license key'))).toBe(true);
  });
});

test('an exported license key can be re-hashed and re-encrypted for import', () => {
  const exportedKey = 'BSEO-01234-56789-ABCDE-FGHJK';
  const importedCiphertext = encryptKey(exportedKey);

  expect(decryptKey(importedCiphertext)).toBe(exportedKey);
  expect(hashKey(exportedKey)).toEqual(hashKey(decryptKey(importedCiphertext)));
});
