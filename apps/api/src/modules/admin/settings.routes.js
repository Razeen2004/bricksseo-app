import { z } from 'zod';
import argon2 from '@node-rs/argon2';
import { prisma } from '../../db/prisma.js';
import { requireUser, requireAdmin } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { sendEmail } from '../email/mailer.js';
import { env } from '../../config/env.js';
import { getSettingSection } from '../../lib/settings.js';
import { encryptValue } from '../licenses/keygen.js';
import { createTotpUri, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, verifyTotp } from '../../lib/totp.js';
import { decryptValue } from '../licenses/keygen.js';

const DEFAULTS = {
  store: { name: 'Bricks SEO', supportEmail: 'support@bricksseo.com', timezone: 'UTC' },
  maintenance: { enabled: false },
  licensing: { gracePeriodDays: 7, maxSiteActivationsOverride: null, domainValidation: true, allowLocalhost: true },
  smtp: { host: '', port: 587, username: '', password: '', fromName: 'Bricks SEO', fromAddress: env.EMAIL_FROM },
  email: { provider: 'env' },
  notifications: {
    customerEmails: { purchaseConfirmation: true, licenseExpiryReminder: true, paymentFailed: true, refundProcessed: true },
    adminAlerts: { newPurchase: false, newCustomerSignup: false, paymentFailure: true, refundIssued: true },
    weeklyDigest: { enabled: true, sendOn: 'Monday' }
  }
};

const SECTIONS = ['store', 'admin', 'maintenance', 'licensing', 'smtp', 'email', 'notifications'];

async function getSection(key) {
  return getSettingSection(key, DEFAULTS[key]);
}

const SaveSchema = z.object({
  section: z.enum(SECTIONS),
  values: z.record(z.string(), z.any())
});

export default async function adminSettingsRoutes(fastify, opts) {
  fastify.get('/v1/admin/settings', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const [store, maintenance, licensing, smtp, emailSettings, notifications, plans, planPrices] = await Promise.all([
      getSection('store'),
      getSection('maintenance'),
      getSection('licensing'),
      getSection('smtp'),
      getSection('email'),
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
        require2fa: store.require2fa ?? false,
        twoFactorEnabled: !!request.user.totpEnabledAt
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
        email: {
          provider: emailSettings.provider,
          envDefault: env.EMAIL_PROVIDER,
          resendConfigured: !!env.RESEND_API_KEY
        },
        smtp
      },
      notifications
    });
  });

  fastify.put('/v1/admin/settings', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { section, values } = SaveSchema.parse(request.body);

    if (section === 'email' && !['env', 'resend', 'smtp'].includes(values.provider)) {
      throw new AppError('validation_failed', 400, 'Invalid email provider.');
    }

    if (section === 'admin') {
      const enableTwoFactor = !!values.require2fa;
      if (enableTwoFactor) {
        const unconfiguredAdmins = await prisma.user.count({
          where: { role: 'admin', status: 'active', totpEnabledAt: null }
        });
        if (unconfiguredAdmins > 0) {
          throw new AppError('admin_2fa_setup_required', 400, 'Every active administrator must enroll in two-factor authentication before it can be required.');
        }
      }
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

  fastify.post('/v1/admin/settings/2fa/setup', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { password } = z.object({ password: z.string().min(1) }).parse(request.body);
    const user = await prisma.user.findUnique({ where: { id: request.user.id } });
    if (user.totpEnabledAt) throw new AppError('already_enrolled', 409, 'Two-factor authentication is already enabled for this account.');
    if (!await argon2.verify(user.passwordHash, password)) throw new AppError('invalid_credentials', 401, 'Your current password is incorrect.');
    const secret = generateTotpSecret();
    return reply.status(200).send({ ok: true, secret, otpauthUri: createTotpUri(secret, user.email) });
  });

  fastify.post('/v1/admin/settings/2fa/confirm', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { secret, code } = z.object({ secret: z.string().min(16).max(64), code: z.string().regex(/^\d{6}$/) }).parse(request.body);
    const user = await prisma.user.findUnique({ where: { id: request.user.id } });
    if (user.totpEnabledAt) throw new AppError('already_enrolled', 409, 'Two-factor authentication is already enabled for this account.');
    if (!verifyTotp(secret, code)) throw new AppError('invalid_2fa_code', 400, 'That code did not verify. Check your authenticator and try again.');
    const recoveryCodes = generateRecoveryCodes();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecretCiphertext: encryptValue(secret),
        totpEnabledAt: new Date(),
        recoveryCodesHash: recoveryCodes.map(hashRecoveryCode)
      }
    });
    await writeAuditLog({ actorUserId: user.id, action: 'admin.2fa.enabled', targetType: 'user', targetId: user.id, ip: request.ip });
    return reply.status(200).send({ ok: true, recoveryCodes });
  });

  fastify.post('/v1/admin/settings/2fa/disable', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { password, code } = z.object({ password: z.string().min(1), code: z.string().min(1).max(32) }).parse(request.body);
    const [user, store] = await Promise.all([
      prisma.user.findUnique({ where: { id: request.user.id } }),
      getSection('store')
    ]);
    if (store.require2fa) throw new AppError('two_factor_required', 400, 'Turn off the global administrator two-factor requirement before removing your enrollment.');
    if (!user.totpEnabledAt || !user.totpSecretCiphertext) throw new AppError('not_enrolled', 400, 'This account has no authenticator enrollment.');
    if (!await argon2.verify(user.passwordHash, password)) throw new AppError('invalid_credentials', 401, 'Your current password is incorrect.');
    const validTotp = verifyTotp(decryptValue(user.totpSecretCiphertext), code);
    const recoveryHashes = Array.isArray(user.recoveryCodesHash) ? user.recoveryCodesHash : [];
    const recoveryHash = hashRecoveryCode(code);
    const validRecovery = recoveryHashes.includes(recoveryHash);
    if (!validTotp && !validRecovery) throw new AppError('invalid_2fa_code', 401, 'The authenticator code or recovery code is invalid.');
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecretCiphertext: null, totpEnabledAt: null, recoveryCodesHash: null }
    });
    await writeAuditLog({ actorUserId: user.id, action: 'admin.2fa.disabled', targetType: 'user', targetId: user.id, ip: request.ip });
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
