import { z } from 'zod';
import argon2 from '@node-rs/argon2';
import { prisma } from '../../db/prisma.js';
import { requireUser, requireAdmin } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { sendEmail } from '../email/mailer.js';
import { env } from '../../config/env.js';
import { getSettingSection } from '../../lib/settings.js';

const DEFAULTS = {
  store: { name: 'Bricks SEO', supportEmail: 'support@bricksseo.com', timezone: 'UTC' },
  maintenance: { enabled: false },
  licensing: { gracePeriodDays: 7, maxSiteActivationsOverride: null, domainValidation: true, allowLocalhost: true },
  smtp: { host: '', port: 587, username: '', password: '', fromName: 'Bricks SEO', fromAddress: env.EMAIL_FROM },
  notifications: {
    customerEmails: { purchaseConfirmation: true, licenseExpiryReminder: true, paymentFailed: true, refundProcessed: true },
    adminAlerts: { newPurchase: false, newCustomerSignup: false, paymentFailure: true, refundIssued: true },
    weeklyDigest: { enabled: true, sendOn: 'Monday' }
  }
};

const SECTIONS = ['store', 'admin', 'maintenance', 'licensing', 'smtp', 'notifications'];

async function getSection(key) {
  return getSettingSection(key, DEFAULTS[key]);
}

const SaveSchema = z.object({
  section: z.enum(SECTIONS),
  values: z.record(z.string(), z.any())
});

export default async function adminSettingsRoutes(fastify, opts) {
  fastify.get('/v1/admin/settings', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const [store, maintenance, licensing, smtp, notifications, plans, planPrices] = await Promise.all([
      getSection('store'),
      getSection('maintenance'),
      getSection('licensing'),
      getSection('smtp'),
      getSection('notifications'),
      prisma.plan.findMany({ orderBy: { sort: 'asc' } }),
      prisma.planPrice.findMany({ where: { environment: env.PADDLE_ENV, active: true } })
    ]);

    const priceByPlan = new Map(planPrices.map((p) => [p.planCode, p]));

    const [firstName, ...lastNameParts] = (request.user.name || '').split(' ');

    return reply.status(200).send({
      ok: true,
      store,
      admin: {
        firstName: firstName || '',
        lastName: lastNameParts.join(' ') || '',
        email: request.user.email,
        require2fa: store.require2fa ?? false
      },
      maintenance,
      licensing: {
        ...licensing,
        paddleEnv: env.PADDLE_ENV,
        plans: plans.map(p => {
          const price = priceByPlan.get(p.code);
          return {
            code: p.code,
            name: p.name,
            siteLimit: p.siteLimit,
            interval: p.interval,
            paddlePriceId: price?.paddlePriceId ?? '',
            paddleProductId: price?.paddleProductId ?? ''
          };
        })
      },
      integrations: {
        paddle: {
          apiKeyLive: env.PADDLE_ENV === 'production' ? env.PADDLE_API_KEY : '',
          apiKeySandbox: env.PADDLE_ENV === 'sandbox' ? env.PADDLE_API_KEY : '',
          webhookSecret: env.PADDLE_WEBHOOK_SECRET,
          webhookUrl: `${env.API_URL}/v1/webhooks/paddle`
        },
        smtp
      },
      notifications
    });
  });

  fastify.put('/v1/admin/settings', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { section, values } = SaveSchema.parse(request.body);

    if (section === 'admin') {
      const data = {
        name: [values.firstName, values.lastName].filter(Boolean).join(' ')
      };
      if (values.password) {
        data.passwordHash = await argon2.hash(values.password);
      }
      await prisma.user.update({ where: { id: request.user.id }, data });

      const currentStore = await getSection('store');
      const nextStore = { ...currentStore, require2fa: !!values.require2fa };
      await prisma.setting.upsert({
        where: { key: 'settings.store' },
        create: { key: 'settings.store', value: nextStore, updatedBy: request.user.id },
        update: { value: nextStore, updatedBy: request.user.id }
      });
    } else {
      await prisma.setting.upsert({
        where: { key: `settings.${section}` },
        create: { key: `settings.${section}`, value: values, updatedBy: request.user.id },
        update: { value: values, updatedBy: request.user.id }
      });
    }

    await writeAuditLog({
      actorUserId: request.user.id,
      action: 'settings.update',
      targetType: 'settings',
      targetId: section,
      ip: request.ip
    });

    return reply.status(200).send({ ok: true });
  });

  const PlanPriceSaveSchema = z.object({
    plans: z.array(z.object({
      code: z.string().min(1),
      paddlePriceId: z.string().trim().max(64),
      paddleProductId: z.string().trim().max(64)
    }))
  });

  fastify.put('/v1/admin/settings/plan-prices', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { plans: incoming } = PlanPriceSaveSchema.parse(request.body);

    const validCodes = new Set((await prisma.plan.findMany({ select: { code: true } })).map((p) => p.code));
    for (const p of incoming) {
      if (!validCodes.has(p.code)) {
        throw new AppError('validation_failed', 400, `Unknown plan code: ${p.code}`);
      }
      if (!p.paddlePriceId && p.paddleProductId) {
        throw new AppError('validation_failed', 400, `${p.code}: enter a Price ID before saving a Product ID.`);
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const p of incoming) {
        if (!p.paddlePriceId) {
          // No price set for this plan — deactivate whatever was there before, leave it unconfigured.
          await tx.planPrice.updateMany({
            where: { planCode: p.code, environment: env.PADDLE_ENV },
            data: { active: false }
          });
          continue;
        }

        // Replacing a plan's price ID shouldn't leave the old row active.
        await tx.planPrice.updateMany({
          where: { planCode: p.code, environment: env.PADDLE_ENV, paddlePriceId: { not: p.paddlePriceId } },
          data: { active: false }
        });

        await tx.planPrice.upsert({
          where: { paddlePriceId: p.paddlePriceId },
          create: {
            paddlePriceId: p.paddlePriceId,
            planCode: p.code,
            environment: env.PADDLE_ENV,
            paddleProductId: p.paddleProductId || null,
            active: true
          },
          update: {
            planCode: p.code,
            environment: env.PADDLE_ENV,
            paddleProductId: p.paddleProductId || null,
            active: true
          }
        });
      }
    });

    await writeAuditLog({
      actorUserId: request.user.id,
      action: 'settings.plan_prices.update',
      targetType: 'settings',
      targetId: 'licensing.plan_prices',
      meta: { environment: env.PADDLE_ENV, plans: incoming },
      ip: request.ip
    });

    return reply.status(200).send({ ok: true });
  });

  fastify.post('/v1/admin/settings/send-test-email', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    await sendEmail({
      to: request.user.email,
      template: 'test',
      userId: request.user.id,
      data: {},
      idempotencyKey: `test-email:${request.user.id}:${Date.now()}`
    });

    return reply.status(200).send({ ok: true });
  });

  fastify.post('/v1/admin/settings/delete-store', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    throw new AppError('not_available', 400, "Store deletion isn't available yet — contact engineering.");
  });
}
