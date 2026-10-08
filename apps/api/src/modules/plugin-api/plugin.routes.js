import { PluginRequest } from '@bricksseo/shared';
import { prisma } from '../../db/prisma.js';
import { hashKey } from '../licenses/keygen.js';
import { AppError } from '../../lib/errors.js';
import { normalizeSiteUrl } from '../activations/normalize-site.js';
import { classifySite } from '../activations/classify-site.js';
import { effectiveLicenseStatus, getEndsOnDate } from '../licenses/effective-status.js';

export default async function pluginRoutes(fastify, opts) {
  
  async function resolveLicense(licenseKey) {
    const hashed = hashKey(licenseKey);
    const license = await prisma.license.findUnique({
      where: { keyHash: hashed },
      include: { plan: true }
    });

    if (!license) {
      throw new AppError('invalid_key', 404, 'Invalid license key');
    }

    let subscription = null;
    if (license.paddleSubscriptionId) {
      subscription = await prisma.subscription.findUnique({
        where: { paddleSubscriptionId: license.paddleSubscriptionId }
      });
    }

    const effectiveStatus = effectiveLicenseStatus(license, subscription);
    const endsOn = getEndsOnDate(subscription);

    return { license, subscription, effectiveStatus, endsOn };
  }

  fastify.post('/v1/plugin/license/activate', async (request, reply) => {
    const payload = PluginRequest.parse(request.body);
    const { license, subscription, effectiveStatus, endsOn } = await resolveLicense(payload.license_key);

    if (effectiveStatus !== 'active') {
      throw new AppError(`license_${effectiveStatus}`, 403, `License is ${effectiveStatus}`);
    }

    const siteKey = normalizeSiteUrl(payload.site.url);
    const classification = classifySite(payload.site.environment, payload.site.url);
    
    const clientIp = request.headers['x-forwarded-for'] || request.ip;
    
    // Concurrency control via interactive transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get current active count
      // Need to count how many active slots use limit
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 45); // 45 days stale reclaim

      const activeSitesCount = await tx.activation.count({
        where: {
          licenseId: license.id,
          deactivatedAt: null,
          countsTowardLimit: true,
          lastSeenAt: { gt: staleDate }
        }
      });

      // 2. Check if already activated
      let activation = await tx.activation.findFirst({
        where: {
          licenseId: license.id,
          siteKey,
          deactivatedAt: null
        }
      });

      if (activation) {
        // Just refresh metadata
        activation = await tx.activation.update({
          where: { id: activation.id },
          data: {
            siteUrl: payload.site.url,
            siteName: payload.site.name,
            environment: payload.site.environment,
            pluginVersion: payload.client.plugin_version,
            wpVersion: payload.client.wp_version,
            phpVersion: payload.client.php_version,
            bricksVersion: payload.client.bricks_version,
            locale: payload.site.locale,
            lastSeenAt: new Date(),
            lastIp: clientIp
          }
        });
      } else {
        // Enforce Limits
        if (classification.countsTowardLimit && license.siteLimit !== null) {
          if (activeSitesCount >= license.siteLimit) {
            throw new AppError('site_limit_reached', 409, `All ${license.siteLimit} site activations are in use. Deactivate a site in your dashboard.`);
          }
        }
        
        // Also max_dev_activations_per_license check here if needed...

        activation = await tx.activation.create({
          data: {
            licenseId: license.id,
            siteKey,
            siteUrl: payload.site.url,
            siteName: payload.site.name,
            environment: payload.site.environment,
            countsTowardLimit: classification.countsTowardLimit,
            pluginVersion: payload.client.plugin_version,
            wpVersion: payload.client.wp_version,
            phpVersion: payload.client.php_version,
            bricksVersion: payload.client.bricks_version,
            locale: payload.site.locale,
            lastIp: clientIp
          }
        });

        await tx.licenseEvent.create({
          data: {
            licenseId: license.id,
            type: 'site_activated',
            actor: `site:${activation.id}`,
            meta: { siteUrl: payload.site.url }
          }
        });
      }

      return { activation, sitesUsed: classification.countsTowardLimit && !activation.countsTowardLimit ? activeSitesCount : activeSitesCount + (activation.countsTowardLimit ? 1 : 0) }; // Slightly inaccurate if refreshing, but good enough for response
    });

    // Re-query accurately for the response
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 45);
    const sitesUsed = await prisma.activation.count({
        where: { licenseId: license.id, deactivatedAt: null, countsTowardLimit: true, lastSeenAt: { gt: staleDate } }
    });

    return reply.status(200).send({
      ok: true,
      license: {
        status: effectiveStatus,
        plan: license.plan.code,
        plan_name: license.plan.name,
        expires_at: license.expiresAt ? license.expiresAt.toISOString() : null,
        renews: !!subscription && subscription.status === 'active' && subscription.scheduledChangeAction !== 'cancel',
        ends_on: endsOn ? endsOn.toISOString() : null,
        site_limit: license.siteLimit,
        sites_used: sitesUsed
      },
      site: {
        activation_id: result.activation.id,
        counts_toward_limit: classification.countsTowardLimit
      },
      message: 'License activated.',
      server_time: new Date().toISOString()
    });
  });

  fastify.post('/v1/plugin/license/validate', async (request, reply) => {
    const payload = PluginRequest.parse(request.body);
    const { license, subscription, effectiveStatus, endsOn } = await resolveLicense(payload.license_key);

    const siteKey = normalizeSiteUrl(payload.site.url);
    const activation = await prisma.activation.findFirst({
      where: {
        licenseId: license.id,
        siteKey,
        deactivatedAt: null
      }
    });

    if (activation) {
      const clientIp = request.headers['x-forwarded-for'] || request.ip;
      await prisma.activation.update({
        where: { id: activation.id },
        data: {
          pluginVersion: payload.client.plugin_version,
          wpVersion: payload.client.wp_version,
          phpVersion: payload.client.php_version,
          bricksVersion: payload.client.bricks_version,
          lastSeenAt: new Date(),
          lastIp: clientIp
        }
      });
    }

    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 45);
    const sitesUsed = await prisma.activation.count({
        where: { licenseId: license.id, deactivatedAt: null, countsTowardLimit: true, lastSeenAt: { gt: staleDate } }
    });

    return reply.status(200).send({
      ok: true,
      license: {
        status: activation ? effectiveStatus : 'inactive',
        plan: license.plan.code,
        plan_name: license.plan.name,
        expires_at: license.expiresAt ? license.expiresAt.toISOString() : null,
        renews: !!subscription && subscription.status === 'active' && subscription.scheduledChangeAction !== 'cancel',
        ends_on: endsOn ? endsOn.toISOString() : null,
        site_limit: license.siteLimit,
        sites_used: sitesUsed
      },
      site: activation ? {
        activation_id: activation.id,
        counts_toward_limit: activation.countsTowardLimit
      } : null,
      message: 'License validated.',
      server_time: new Date().toISOString()
    });
  });

  fastify.post('/v1/plugin/license/deactivate', async (request, reply) => {
    const payload = PluginRequest.parse(request.body);
    const { license } = await resolveLicense(payload.license_key);

    const siteKey = normalizeSiteUrl(payload.site.url);
    const activation = await prisma.activation.findFirst({
      where: { licenseId: license.id, siteKey, deactivatedAt: null }
    });

    if (activation) {
      await prisma.activation.update({
        where: { id: activation.id },
        data: { deactivatedAt: new Date(), deactivatedBy: 'site' }
      });

      await prisma.licenseEvent.create({
        data: {
          licenseId: license.id,
          type: 'site_deactivated',
          actor: `site:${activation.id}`,
          meta: { siteUrl: payload.site.url, reason: 'plugin_request' }
        }
      });
    }

    return reply.status(200).send({
      ok: true,
      message: 'License deactivated for this site.'
    });
  });
}
