import crypto from 'crypto';
import net from 'net';
import argon2 from '@node-rs/argon2';
import { prisma } from '../../db/prisma.js';
import { requireUser, requireAdmin } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { decryptKey, encryptKey, hashKey, normalizeKey } from '../licenses/keygen.js';

const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const MAX_CUSTOMERS = 10_000;
const MAX_LICENSES = 50_000;
const MAX_ACTIVATIONS = 100_000;
const LICENSE_STATUSES = new Set(['active', 'suspended', 'revoked']);

function optionalString(value, field, errors, maxLength = 500) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > maxLength) {
    errors.push(`${field} must be text with at most ${maxLength} characters.`);
    return null;
  }
  return value;
}

function parseDate(value, field, errors, nullable = true) {
  if (value === null || value === undefined || value === '') {
    if (!nullable) errors.push(`${field} is required.`);
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    errors.push(`${field} must be a valid date.`);
    return null;
  }
  return date;
}

export function validateBackup(input) {
  const errors = [];
  const customers = [];
  const seenEmails = new Set();
  const seenKeys = new Set();
  let licenseCount = 0;
  let activationCount = 0;

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: ['Backup must be a JSON object.'], customers };
  }
  if (input.format !== 'bricksseo-data-export' || ![1, 2].includes(input.version)) {
    errors.push('Unsupported backup format or version. Export a fresh backup from Bricks SEO.');
  }
  if (!Array.isArray(input.customers) || input.customers.length > MAX_CUSTOMERS) {
    errors.push(`customers must be an array with no more than ${MAX_CUSTOMERS} entries.`);
    return { errors, customers };
  }

  input.customers.forEach((customer, customerIndex) => {
    const row = customerIndex + 1;
    if (!customer || typeof customer !== 'object' || Array.isArray(customer)) {
      errors.push(`Customer ${row} must be an object.`);
      return;
    }
    const email = typeof customer.email === 'string' ? customer.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`Customer ${row} has an invalid email.`);
    if (email && seenEmails.has(email)) errors.push(`Customer ${row} duplicates ${email} in this backup.`);
    if (email) seenEmails.add(email);
    const name = optionalString(customer.name, `Customer ${row} name`, errors, 200);
    const status = customer.status ?? 'active';
    if (!['active', 'disabled'].includes(status)) errors.push(`Customer ${row} has an invalid status.`);
    if (customer.flagged !== undefined && typeof customer.flagged !== 'boolean') errors.push(`Customer ${row} flagged must be a boolean.`);
    if (!Array.isArray(customer.licenses)) errors.push(`Customer ${row} licenses must be an array.`);

    const licenses = (Array.isArray(customer.licenses) ? customer.licenses : []).map((license, licenseIndex) => {
      licenseCount++;
      const label = `Customer ${row}, license ${licenseIndex + 1}`;
      if (!license || typeof license !== 'object' || Array.isArray(license)) {
        errors.push(`${label} must be an object.`);
        return null;
      }
      const key = typeof license.key === 'string' ? license.key.trim().toUpperCase() : '';
      const normalized = normalizeKey(key);
      if (!/^BSEO-[0-9A-HJKMNP-TV-Z]{5}(?:-[0-9A-HJKMNP-TV-Z]{5}){3}$/.test(key)) errors.push(`${label} has an invalid license key.`);
      if (normalized && seenKeys.has(normalized)) errors.push(`${label} duplicates a license key in this backup.`);
      if (normalized) seenKeys.add(normalized);
      if (typeof license.planCode !== 'string' || !license.planCode.trim()) errors.push(`${label} requires planCode.`);
      const licenseStatus = license.status ?? 'active';
      if (!LICENSE_STATUSES.has(licenseStatus)) errors.push(`${label} has an invalid status.`);
      const siteLimit = license.siteLimit === null || license.siteLimit === undefined || license.siteLimit === '' ? null : Number(license.siteLimit);
      if (siteLimit !== null && (!Number.isInteger(siteLimit) || siteLimit < 0)) errors.push(`${label} siteLimit must be a non-negative integer or null.`);
      const issuedAt = parseDate(license.issuedAt, `${label} issuedAt`, errors, false);
      const expiresAt = parseDate(license.expiresAt, `${label} expiresAt`, errors);
      const statusReason = optionalString(license.statusReason, `${label} statusReason`, errors, 200);
      const notes = optionalString(license.notes, `${label} notes`, errors, 4000);
      const keyHint = optionalString(license.keyHint, `${label} keyHint`, errors, 100);
      let events = null;
      if (license.events !== undefined) {
        if (!Array.isArray(license.events)) errors.push(`${label} events must be an array.`);
        events = (Array.isArray(license.events) ? license.events : []).map((event, eventIndex) => {
          const eventLabel = `${label}, event ${eventIndex + 1}`;
          if (!event || typeof event !== 'object' || Array.isArray(event)) {
            errors.push(`${eventLabel} must be an object.`);
            return null;
          }
          if (typeof event.type !== 'string' || !event.type) errors.push(`${eventLabel} requires type.`);
          if (typeof event.actor !== 'string' || !event.actor) errors.push(`${eventLabel} requires actor.`);
          const meta = event.meta === undefined ? null : event.meta;
          if (meta !== null && (typeof meta !== 'object' || Array.isArray(meta))) errors.push(`${eventLabel} meta must be an object or null.`);
          return {
            type: event.type,
            actor: event.actor,
            meta,
            createdAt: parseDate(event.createdAt, `${eventLabel} createdAt`, errors, false)
          };
        }).filter(Boolean);
      }
      if (!Array.isArray(license.activations)) errors.push(`${label} activations must be an array.`);
      const activations = (Array.isArray(license.activations) ? license.activations : []).map((activation, activationIndex) => {
        activationCount++;
        const activationLabel = `${label}, activation ${activationIndex + 1}`;
        if (!activation || typeof activation !== 'object' || Array.isArray(activation)) {
          errors.push(`${activationLabel} must be an object.`);
          return null;
        }
        for (const field of ['siteKey', 'siteUrl', 'siteName', 'environment']) {
          if (typeof activation[field] !== 'string' || !activation[field].trim()) errors.push(`${activationLabel} requires ${field}.`);
        }
        if (typeof activation.countsTowardLimit !== 'boolean') errors.push(`${activationLabel} countsTowardLimit must be a boolean.`);
        const lastIp = optionalString(activation.lastIp, `${activationLabel} lastIp`, errors, 64);
        if (lastIp && !net.isIP(lastIp)) errors.push(`${activationLabel} lastIp must be an IP address.`);
        return {
          siteKey: activation.siteKey,
          siteUrl: activation.siteUrl,
          siteName: activation.siteName,
          environment: activation.environment,
          countsTowardLimit: activation.countsTowardLimit,
          pluginVersion: optionalString(activation.pluginVersion, `${activationLabel} pluginVersion`, errors, 100),
          wpVersion: optionalString(activation.wpVersion, `${activationLabel} wpVersion`, errors, 100),
          phpVersion: optionalString(activation.phpVersion, `${activationLabel} phpVersion`, errors, 100),
          bricksVersion: optionalString(activation.bricksVersion, `${activationLabel} bricksVersion`, errors, 100),
          locale: optionalString(activation.locale, `${activationLabel} locale`, errors, 100),
          firstActivatedAt: parseDate(activation.firstActivatedAt, `${activationLabel} firstActivatedAt`, errors, false),
          lastSeenAt: parseDate(activation.lastSeenAt, `${activationLabel} lastSeenAt`, errors, false),
          deactivatedAt: parseDate(activation.deactivatedAt, `${activationLabel} deactivatedAt`, errors),
          deactivatedBy: optionalString(activation.deactivatedBy, `${activationLabel} deactivatedBy`, errors, 200),
          lastIp
        };
      });
      return {
        key, planCode: typeof license.planCode === 'string' ? license.planCode.trim() : '',
        keyHint, status: licenseStatus, statusReason, siteLimit, issuedAt, expiresAt, notes,
        activations: activations.filter(Boolean), events
      };
    }).filter(Boolean);
    customers.push({ email, name, status, flagged: customer.flagged ?? false, licenses });
  });

  if (licenseCount > MAX_LICENSES) errors.push(`Backup contains more than ${MAX_LICENSES} licenses.`);
  if (activationCount > MAX_ACTIVATIONS) errors.push(`Backup contains more than ${MAX_ACTIVATIONS} activations.`);
  return { errors, customers };
}

function asIso(value) {
  return value ? new Date(value).toISOString() : null;
}

export async function restoreActivations(tx, licenseId, activations) {
  const current = await tx.activation.findMany({ where: { licenseId }, select: { id: true, siteKey: true } });
  const bySiteKey = new Map();
  for (const activation of current) {
    const queue = bySiteKey.get(activation.siteKey) ?? [];
    queue.push(activation.id);
    bySiteKey.set(activation.siteKey, queue);
  }
  const keptIds = [];
  for (const activation of activations) {
    const id = bySiteKey.get(activation.siteKey)?.shift();
    if (id) {
      await tx.activation.update({ where: { id }, data: activation });
      keptIds.push(id);
    } else {
      const created = await tx.activation.create({ data: { ...activation, licenseId }, select: { id: true } });
      keptIds.push(created.id);
    }
  }
  await tx.activation.deleteMany({ where: { licenseId, ...(keptIds.length ? { id: { notIn: keptIds } } : {}) } });
}

export default async function adminDataRoutes(fastify) {
  fastify.get('/v1/admin/data/export.json', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const users = await prisma.user.findMany({
      where: { role: 'customer', deletedAt: null },
      orderBy: { email: 'asc' },
      include: {
        licenses: {
          orderBy: { issuedAt: 'asc' },
          include: {
            activations: { orderBy: { firstActivatedAt: 'asc' } },
            events: { orderBy: { createdAt: 'asc' } }
          }
        }
      }
    });
    const customers = users.map(user => ({
      email: user.email,
      name: user.name,
      status: user.status,
      flagged: user.flagged,
      licenses: user.licenses.map(license => ({
        key: decryptKey(license.keyCiphertext),
        keyHint: license.keyHint,
        planCode: license.planCode,
        status: license.status,
        statusReason: license.statusReason,
        siteLimit: license.siteLimit,
        issuedAt: asIso(license.issuedAt),
        expiresAt: asIso(license.expiresAt),
        notes: license.notes,
        events: license.events.map(event => ({
          type: event.type,
          actor: event.actor,
          meta: event.meta,
          createdAt: asIso(event.createdAt)
        })),
        activations: license.activations.map(activation => ({
          siteKey: activation.siteKey,
          siteUrl: activation.siteUrl,
          siteName: activation.siteName,
          environment: activation.environment,
          countsTowardLimit: activation.countsTowardLimit,
          pluginVersion: activation.pluginVersion,
          wpVersion: activation.wpVersion,
          phpVersion: activation.phpVersion,
          bricksVersion: activation.bricksVersion,
          locale: activation.locale,
          firstActivatedAt: asIso(activation.firstActivatedAt),
          lastSeenAt: asIso(activation.lastSeenAt),
          deactivatedAt: asIso(activation.deactivatedAt),
          deactivatedBy: activation.deactivatedBy,
          lastIp: activation.lastIp
        }))
      }))
    }));
    const backup = { format: 'bricksseo-data-export', version: 2, exportedAt: new Date().toISOString(), customers };

    await writeAuditLog({
      actorUserId: request.user.id,
      action: 'data.export',
      targetType: 'data_backup',
      targetId: 'customers_and_licenses',
      meta: { customers: customers.length, licenses: customers.reduce((sum, customer) => sum + customer.licenses.length, 0) },
      ip: request.ip
    });
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="bricksseo-backup.json"');
    reply.header('Cache-Control', 'no-store');
    return reply.send(backup);
  });

  fastify.post('/v1/admin/data/import', {
    preHandler: [requireUser, requireAdmin],
    bodyLimit: MAX_BACKUP_BYTES
  }, async (request, reply) => {
    const validated = validateBackup(request.body);
    if (validated.errors.length) {
      return reply.status(400).send({ ok: false, errors: validated.errors.slice(0, 100), errorCount: validated.errors.length });
    }

    const dryRun = request.query.dryRun === 'true';
    const emails = validated.customers.map(customer => customer.email);
    const hashes = validated.customers.flatMap(customer => customer.licenses.map(license => hashKey(license.key)));
    const [users, existingLicenses, plans] = await Promise.all([
      prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true, role: true, deletedAt: true } }),
      prisma.license.findMany({ where: { keyHash: { in: hashes } }, select: { userId: true, keyHash: true } }),
      prisma.plan.findMany({ select: { code: true } })
    ]);
    const usersByEmail = new Map(users.map(user => [user.email.toLowerCase(), user]));
    const plansSet = new Set(plans.map(plan => plan.code));
    const errors = [];
    const existingHashOwner = new Map(existingLicenses.map(license => [Buffer.from(license.keyHash).toString('hex'), license.userId]));
    let newCustomerCount = 0;
    let existingCustomerCount = 0;
    let newLicenseCount = 0;
    let existingLicenseCount = 0;
    let activationCount = 0;

    for (const customer of validated.customers) {
      const user = usersByEmail.get(customer.email);
      if (user?.role !== undefined && user.role !== 'customer') errors.push(`${customer.email} already belongs to a non-customer account.`);
      else if (user) existingCustomerCount++;
      else newCustomerCount++;

      for (const license of customer.licenses) {
        if (!plansSet.has(license.planCode)) errors.push(`${customer.email}: plan "${license.planCode}" does not exist on this server.`);
        const hashHex = hashKey(license.key).toString('hex');
        const existingOwner = existingHashOwner.get(hashHex);
        if (existingOwner) {
          if (!user || existingOwner !== user.id) errors.push(`${customer.email}: this license key is already assigned to another account.`);
          else existingLicenseCount++;
        } else newLicenseCount++;
        activationCount += license.activations.length;
      }
    }
    if (errors.length) return reply.status(409).send({ ok: false, errors: errors.slice(0, 100), errorCount: errors.length });

    const summary = {
      customersToCreate: newCustomerCount,
      customersToRestore: existingCustomerCount,
      licensesToCreate: newLicenseCount,
      licensesToRestore: existingLicenseCount,
      activationsToRestore: activationCount
    };
    if (dryRun) return reply.send({ ok: true, dryRun: true, summary });

    // Restore the exported customer/license state. New accounts get an inaccessible random
    // password; the owner can set one using the password reset flow.
    const importedPasswordHash = newCustomerCount
      ? await argon2.hash(crypto.randomBytes(32).toString('base64url'))
      : null;
    const imported = await prisma.$transaction(async tx => {
      const txUsers = await tx.user.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true, role: true, deletedAt: true }
      });
      const txUsersByEmail = new Map(txUsers.map(user => [user.email.toLowerCase(), user]));
      const importedUsers = new Map();
      for (const customer of validated.customers) {
        let user = txUsersByEmail.get(customer.email);
        if (user && user.role !== 'customer') {
          throw new AppError('import_conflict', 409, `Customer ${customer.email} cannot be imported into the existing account.`);
        }
        if (!user) {
          user = await tx.user.create({
            data: {
              email: customer.email,
              name: customer.name,
              role: 'customer',
              status: customer.status,
              flagged: customer.flagged,
              passwordHash: importedPasswordHash,
              mustChangePassword: true
            },
            select: { id: true, email: true, role: true, deletedAt: true }
          });
          txUsersByEmail.set(customer.email, user);
        } else {
          user = await tx.user.update({
            where: { id: user.id },
            data: { name: customer.name, status: customer.status, flagged: customer.flagged, deletedAt: null },
            select: { id: true, email: true, role: true, deletedAt: true }
          });
          txUsersByEmail.set(customer.email, user);
        }
        importedUsers.set(customer.email, user);
      }

      const txExistingLicenses = await tx.license.findMany({
        where: { keyHash: { in: hashes } },
        select: { id: true, userId: true, keyHash: true }
      });
      const importedHashOwner = new Map(txExistingLicenses.map(license => [Buffer.from(license.keyHash).toString('hex'), license]));
      let licensesCreated = 0;
      let licensesRestored = 0;
      let activationsRestored = 0;
      for (const customer of validated.customers) {
        const user = importedUsers.get(customer.email);
        for (const license of customer.licenses) {
          const keyHash = hashKey(license.key);
          const hashHex = keyHash.toString('hex');
          const existingLicense = importedHashOwner.get(hashHex);
          const existingOwner = existingLicense?.userId;
          if (existingOwner) {
            if (existingOwner !== user.id) throw new AppError('import_conflict', 409, `A license key for ${customer.email} is assigned to another account.`);
          }
          const licenseData = {
            userId: user.id,
            planCode: license.planCode,
            keyHash,
            keyCiphertext: encryptKey(license.key),
            keyHint: license.keyHint || `${license.key.slice(0, 4)}-••••-••••-${license.key.slice(-4)}`,
            status: license.status,
            statusReason: license.statusReason,
            siteLimit: license.siteLimit,
            issuedAt: license.issuedAt,
            expiresAt: license.expiresAt,
            notes: license.notes
          };
          let restoredLicense;
          if (existingLicense) {
            restoredLicense = await tx.license.update({ where: { id: existingLicense.id }, data: licenseData });
            licensesRestored++;
          } else {
            restoredLicense = await tx.license.create({
              data: {
                ...licenseData,
                paddleTransactionId: `import:${crypto.randomUUID()}`,
                itemIndex: 0,
                unitIndex: 0
              }
            });
            importedHashOwner.set(hashHex, { id: restoredLicense.id, userId: user.id });
            licensesCreated++;
          }
          await restoreActivations(tx, restoredLicense.id, license.activations);
          activationsRestored += license.activations.length;
          if (license.events !== null) {
            await tx.licenseEvent.deleteMany({ where: { licenseId: restoredLicense.id } });
            if (license.events.length) {
              await tx.licenseEvent.createMany({ data: license.events.map(event => ({
                licenseId: restoredLicense.id,
                type: event.type,
                actor: event.actor,
                ...(event.meta !== null ? { meta: event.meta } : {}),
                createdAt: event.createdAt
              })) });
            }
          }
        }
      }
      return { licensesCreated, licensesRestored, activationsRestored };
    }, { maxWait: 10_000, timeout: 120_000 });

    await writeAuditLog({
      actorUserId: request.user.id,
      action: 'data.import',
      targetType: 'data_backup',
      targetId: 'customers_and_licenses',
      meta: { ...summary, ...imported },
      ip: request.ip
    });
    return reply.send({ ok: true, summary: { ...summary, ...imported } });
  });
}
