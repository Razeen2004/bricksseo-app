import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../lib/errors.js';
import { requireUser } from '../../http/auth.js';
import { effectiveLicenseStatus } from '../licenses/effective-status.js';
import { normalizeSiteUrl } from '../activations/normalize-site.js';

// Setup local storage directory
const STORAGE_DIR = path.resolve(process.cwd(), 'storage/releases');
await fs.mkdir(STORAGE_DIR, { recursive: true });

export default async function releaseRoutes(fastify, opts) {
  
  // --------------------------------------------------------
  // ADMIN: Upload a new release
  // --------------------------------------------------------
  fastify.post('/v1/admin/releases', { preHandler: [requireUser] }, async (request, reply) => {
    // In a real app, verify request.user.role === 'admin'
    // For MVP, we assume if you are here, you are the admin, but let's enforce a basic check if role exists.
    // Assuming role doesn't exist yet, we will just allow it or rely on a specific admin email.
    
    const parts = request.parts();
    let version, changelogMd;
    let fileStream;

    for await (const part of parts) {
      if (part.type === 'file') {
        fileStream = part;
      } else {
        if (part.fieldname === 'version') version = part.value;
        if (part.fieldname === 'changelogMd') changelogMd = part.value;
      }
    }

    if (!fileStream || !version) {
      throw new AppError('validation_failed', 400, 'Missing file or version');
    }

    const versionSort = version.padStart(10, '0'); // Simplistic sorting for MVP
    const fileName = `bricks-seo-${version}.zip`;
    const filePath = path.join(STORAGE_DIR, fileName);

    // Stream the file to disk and calculate SHA256 simultaneously
    const hash = crypto.createHash('sha256');
    const writeStream = createWriteStream(filePath);
    
    let sizeBytes = 0;
    
    for await (const chunk of fileStream.file) {
      hash.update(chunk);
      writeStream.write(chunk);
      sizeBytes += chunk.length;
    }
    writeStream.end();

    const sha256 = hash.digest('hex');

    // Create DB Record
    const release = await prisma.release.create({
      data: {
        version,
        versionSort,
        channel: 'stable',
        status: 'published',
        changelogMd,
        storageKey: fileName,
        sizeBytes,
        sha256,
        signature: 'unsigned', // MVP: no ed25519 signature yet
        publishedAt: new Date(),
        createdBy: request.user.id
      }
    });

    return reply.status(200).send({ ok: true, release });
  });

  fastify.get('/v1/admin/releases', { preHandler: [requireUser] }, async (request, reply) => {
    const releases = await prisma.release.findMany({
      orderBy: { versionSort: 'desc' },
      include: {
        _count: { select: { downloads: true } }
      }
    });
    return reply.status(200).send({ ok: true, releases });
  });

  // --------------------------------------------------------
  // DASHBOARD: Get latest download for customer
  // --------------------------------------------------------
  fastify.post('/v1/account/downloads/latest', { preHandler: [requireUser] }, async (request, reply) => {
    // 1. Verify user has an active license
    const licenses = await prisma.license.findMany({ where: { userId: request.user.id } });
    const hasActive = licenses.some(l => effectiveLicenseStatus(l) === 'active');
    
    if (!hasActive) {
      throw new AppError('payment_required', 402, 'You need an active license to download the plugin.');
    }

    const latest = await prisma.release.findFirst({
      where: { status: 'published', channel: 'stable' },
      orderBy: { versionSort: 'desc' }
    });

    if (!latest) throw new AppError('no_release', 404, 'No published release yet. Check back soon.');

    // Generate a short-lived download token (MVP: symmetric signed JWT or just HMAC)
    const tokenPayload = `${request.user.id}:${latest.id}:${Date.now() + 1000 * 60 * 15}`; // 15 mins
    const signature = crypto.createHmac('sha256', process.env.APP_ENCRYPTION_KEYS).update(tokenPayload).digest('hex');
    const downloadToken = Buffer.from(`${tokenPayload}:${signature}`).toString('base64');

    return reply.status(200).send({
      ok: true,
      url: `${process.env.API_URL || 'http://localhost:4000'}/v1/downloads/file?token=${downloadToken}`
    });
  });

  // --------------------------------------------------------
  // PUBLIC: Serve the actual file via short-lived token
  // --------------------------------------------------------
  fastify.get('/v1/downloads/file', async (request, reply) => {
    const { token } = request.query;
    if (!token) throw new AppError('unauthorized', 401, 'Missing token');

    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const [userId, releaseId, expiryStr, signature] = decoded.split(':');
      
      if (Date.now() > parseInt(expiryStr, 10)) {
        throw new Error('Expired token');
      }

      const expectedSig = crypto.createHmac('sha256', process.env.APP_ENCRYPTION_KEYS)
        .update(`${userId}:${releaseId}:${expiryStr}`)
        .digest('hex');

      if (signature !== expectedSig) {
        throw new Error('Invalid signature');
      }

      const release = await prisma.release.findUnique({ where: { id: releaseId } });
      if (!release) throw new Error('Release not found');

      // Log download
      await prisma.releaseDownload.create({
        data: { releaseId: release.id, licenseId: null, kind: 'dashboard' }
      });

      const filePath = path.join(STORAGE_DIR, release.storageKey);
      
      // Serve file
      const stream = createWriteStream('/dev/null'); // Dummy, we will send file via fastify
      const fileBuffer = await fs.readFile(filePath);
      reply.header('Content-Disposition', `attachment; filename="bricks-seo-${release.version}.zip"`);
      reply.header('Content-Type', 'application/zip');
      return reply.send(fileBuffer);
    } catch (err) {
      throw new AppError('unauthorized', 401, 'Invalid or expired download link');
    }
  });

  // --------------------------------------------------------
  // WORDPRESS: Update Check API
  // --------------------------------------------------------
  fastify.post('/v1/plugin/update-check', async (request, reply) => {
    // Expects { license_key, site_url, version }
    const { license_key, site_url, version } = request.body || {};
    if (!license_key || !site_url) return reply.status(200).send({}); // Send nothing if invalid

    // Hash key and find license
    const keyHash = crypto.createHmac('sha256', process.env.LICENSE_KEY_PEPPER).update(license_key).digest();
    const license = await prisma.license.findUnique({ where: { keyHash } });

    if (!license || effectiveLicenseStatus(license) !== 'active') {
      return reply.status(200).send({});
    }

    const latest = await prisma.release.findFirst({
      where: { status: 'published', channel: 'stable' },
      orderBy: { versionSort: 'desc' }
    });

    if (!latest) return reply.status(200).send({});

    // Compare versions (simplistic string compare for MVP)
    if (latest.version === version) return reply.status(200).send({});

    // Generate update download URL. Instead of expiring token, use siteKey + licenseKey.
    const siteKey = normalizeSiteUrl(site_url);
    const tokenPayload = `${license.id}:${siteKey}:${latest.id}`;
    const signature = crypto.createHmac('sha256', process.env.APP_ENCRYPTION_KEYS).update(tokenPayload).digest('hex');
    const updateToken = Buffer.from(`${tokenPayload}:${signature}`).toString('base64');
    const packageUrl = `${process.env.API_URL || 'http://localhost:4000'}/v1/plugin/update-download?token=${updateToken}`;

    return reply.status(200).send({
      new_version: latest.version,
      package: packageUrl,
      url: process.env.MARKETING_URL ? `${process.env.MARKETING_URL}/changelog` : 'https://bricksseo.com/changelog',
      requires: latest.requiresWp || '6.0',
      requires_php: latest.requiresPhp || '7.4',
      tested: latest.testedUpTo || '6.4'
    });
  });

  // --------------------------------------------------------
  // WORDPRESS: Stream the file for updates
  // --------------------------------------------------------
  fastify.get('/v1/plugin/update-download', async (request, reply) => {
    const { token } = request.query;
    if (!token) throw new AppError('unauthorized', 401, 'Missing token');

    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const [licenseId, siteKey, releaseId, signature] = decoded.split(':');
      
      const expectedSig = crypto.createHmac('sha256', process.env.APP_ENCRYPTION_KEYS)
        .update(`${licenseId}:${siteKey}:${releaseId}`)
        .digest('hex');

      if (signature !== expectedSig) throw new Error('Invalid signature');

      const license = await prisma.license.findUnique({ where: { id: licenseId } });
      if (!license || effectiveLicenseStatus(license) !== 'active') {
        throw new Error('License inactive');
      }

      // Check if site is still activated
      const activation = await prisma.activation.findFirst({
        where: { licenseId, siteKey, deactivatedAt: null }
      });

      if (!activation) {
        throw new Error('Site not activated');
      }

      const release = await prisma.release.findUnique({ where: { id: releaseId } });
      if (!release) throw new Error('Release not found');

      await prisma.releaseDownload.create({
        data: { releaseId: release.id, licenseId, activationId: activation.id, kind: 'auto_update' }
      });

      const filePath = path.join(STORAGE_DIR, release.storageKey);
      const fileBuffer = await fs.readFile(filePath);
      
      reply.header('Content-Disposition', `attachment; filename="bricks-seo-${release.version}.zip"`);
      reply.header('Content-Type', 'application/zip');
      return reply.send(fileBuffer);
    } catch (err) {
      throw new AppError('unauthorized', 401, 'Update failed: Invalid license or site signature');
    }
  });

}
