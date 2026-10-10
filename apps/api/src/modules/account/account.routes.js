import { z } from 'zod';
import argon2 from '@node-rs/argon2';
import { prisma } from '../../db/prisma.js';
import { requireUser } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { effectiveLicenseStatus } from '../licenses/effective-status.js';
import { decryptKey } from '../licenses/keygen.js';
import { paddleClient } from '../paddle/client.js';
import { sendEmail } from '../email/mailer.js';
import { env } from '../../config/env.js';

const STALE_ACTIVATION_DAYS = 45;

function requirePasswordChanged(request) {
  if (request.session.passwordChangeRequired) {
    throw new AppError('password_change_required', 403, 'You must change your password');
  }
}

function serializeLicense(l) {
  return {
    id: l.id,
    planCode: l.plan.code,
    planName: l.plan.name,
    keyHint: l.keyHint,
    status: effectiveLicenseStatus(l),
    siteLimit: l.siteLimit,
    issuedAt: l.issuedAt,
    expiresAt: l.expiresAt,
    sitesUsed: l.activations.filter(a => !a.deactivatedAt).length,
    activations: l.activations
  };
}

export default async function accountRoutes(fastify, opts) {

  fastify.get('/v1/account/me', { preHandler: [requireUser] }, async (request, reply) => {
    requirePasswordChanged(request);

    const user = {
      id: request.user.id,
      email: request.user.email,
      name: request.user.name,
      role: request.user.role
    };

    const dbLicenses = await prisma.license.findMany({
      where: { userId: request.user.id },
      include: { activations: true, plan: true },
      orderBy: { createdAt: 'desc' }
    });

    const licenses = dbLicenses.map(serializeLicense);

    return reply.status(200).send({ ok: true, user, licenses });
  });

  fastify.get('/v1/account/licenses', { preHandler: [requireUser] }, async (request, reply) => {
    requirePasswordChanged(request);

    const dbLicenses = await prisma.license.findMany({
      where: { userId: request.user.id },
      include: { activations: true, plan: true },
      orderBy: { createdAt: 'desc' }
    });

    return reply.status(200).send({ ok: true, licenses: dbLicenses.map(serializeLicense) });
  });

  fastify.post('/v1/account/licenses/:id/reveal', { preHandler: [requireUser] }, async (request, reply) => {
    requirePasswordChanged(request);

    const license = await prisma.license.findFirst({
      where: { id: request.params.id, userId: request.user.id }
    });

    if (!license) throw new AppError('not_found', 404, 'License not found');

    const key = decryptKey(license.keyCiphertext);

    return reply.status(200).send({ ok: true, key });
  });

  fastify.get('/v1/account/sites', { preHandler: [requireUser] }, async (request, reply) => {
    requirePasswordChanged(request);

    const status = request.query.status || 'all';
    const staleCutoff = new Date(Date.now() - STALE_ACTIVATION_DAYS * 24 * 60 * 60 * 1000);

    const licenses = await prisma.license.findMany({
      where: { userId: request.user.id },
      include: { activations: true }
    });

    let sites = licenses.flatMap(l => l.activations.map(a => ({
      id: a.id,
      licenseId: l.id,
      licenseKeyHint: l.keyHint,
      domain: a.siteUrl,
      siteName: a.siteName,
      wpVersion: a.wpVersion,
      pluginVersion: a.pluginVersion,
      phpVersion: a.phpVersion,
      bricksVersion: a.bricksVersion,
      firstActivatedAt: a.firstActivatedAt,
      lastSeenAt: a.lastSeenAt,
      deactivatedAt: a.deactivatedAt,
      status: a.deactivatedAt ? 'removed' : (a.lastSeenAt < staleCutoff ? 'stale' : 'active')
    })));

    if (status !== 'all') {
      sites = sites.filter(s => s.status === status);
    }

    sites.sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));

    const activeSites = sites.filter(s => s.status === 'active');

    return reply.status(200).send({
      ok: true,
      sites,
      stats: {
        activeSites: activeSites.length,
        needsAttention: sites.filter(s => s.status === 'stale').length
      }
    });
  });

  fastify.post('/v1/account/sites/:activationId/deactivate', { preHandler: [requireUser] }, async (request, reply) => {
    requirePasswordChanged(request);

    const activation = await prisma.activation.findFirst({
      where: {
        id: request.params.activationId,
        license: { userId: request.user.id }
      }
    });

    if (!activation) throw new AppError('not_found', 404, 'Site not found');

    if (!activation.deactivatedAt) {
      await prisma.$transaction([
        prisma.activation.update({
          where: { id: activation.id },
          data: { deactivatedAt: new Date(), deactivatedBy: 'customer' }
        }),
        prisma.licenseEvent.create({
          data: {
            licenseId: activation.licenseId,
            type: 'site_deactivated',
            actor: `customer:${request.user.id}`,
            meta: { activationId: activation.id, siteUrl: activation.siteUrl }
          }
        })
      ]);
    }

    return reply.status(200).send({ ok: true });
  });

  fastify.delete('/v1/account/sites/:activationId', { preHandler: [requireUser] }, async (request, reply) => {
    requirePasswordChanged(request);

    const activation = await prisma.activation.findFirst({
      where: {
        id: request.params.activationId,
        license: { userId: request.user.id }
      }
    });

    if (!activation) throw new AppError('not_found', 404, 'Site not found');
    if (!activation.deactivatedAt) {
      throw new AppError('validation_failed', 400, 'Deactivate this site before deleting it.');
    }

    await prisma.activation.delete({ where: { id: activation.id } });

    return reply.status(200).send({ ok: true });
  });

  fastify.get('/v1/account/billing', { preHandler: [requireUser] }, async (request, reply) => {
    requirePasswordChanged(request);

    const [licenses, subscriptions, transactions] = await Promise.all([
      prisma.license.findMany({
        where: { userId: request.user.id },
        include: { plan: true },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.subscription.findMany({
        where: { userId: request.user.id },
        include: { plan: true },
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.transaction.findMany({
        where: { userId: request.user.id },
        orderBy: { billedAt: 'desc' },
        take: 25
      })
    ]);

    const primarySubscription = subscriptions.find(s => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due') || subscriptions[0] || null;

    return reply.status(200).send({
      ok: true,
      subscription: primarySubscription ? {
        planCode: primarySubscription.planCode,
        planName: primarySubscription.plan.name,
        status: primarySubscription.status,
        currentPeriodEnd: primarySubscription.currentPeriodEnd,
        currency: primarySubscription.currency,
        unitPriceMinor: primarySubscription.unitPriceMinor,
        scheduledChangeAction: primarySubscription.scheduledChangeAction,
        scheduledChangeEffectiveAt: primarySubscription.scheduledChangeEffectiveAt
      } : null,
      licenses: licenses.map(l => ({
        id: l.id,
        planCode: l.plan.code,
        planName: l.plan.name,
        status: effectiveLicenseStatus(l),
        expiresAt: l.expiresAt
      })),
      invoices: transactions.map(t => ({
        id: t.paddleTransactionId,
        date: t.billedAt,
        amountMinor: t.totalMinor,
        currency: t.currency,
        status: t.status
      }))
    });
  });

  fastify.post('/v1/account/billing/portal', { preHandler: [requireUser] }, async (request, reply) => {
    requirePasswordChanged(request);

    if (!request.user.paddleCustomerId) {
      throw new AppError('not_found', 404, 'No billing account found yet. Contact support.');
    }

    const subscriptions = await prisma.subscription.findMany({
      where: { userId: request.user.id },
      select: { paddleSubscriptionId: true }
    });

    try {
      const session = await paddleClient.createPortalSession(
        request.user.paddleCustomerId,
        subscriptions.map(s => s.paddleSubscriptionId)
      );
      return reply.status(200).send({ ok: true, url: session.urls?.general?.overview || session.url });
    } catch (err) {
      request.log.error(err);
      throw new AppError('portal_unavailable', 502, 'Could not open the billing portal right now. Please try again shortly.');
    }
  });

  const SupportSchema = z.object({
    subject: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(5000)
  });

  fastify.post('/v1/account/support', { preHandler: [requireUser] }, async (request, reply) => {
    requirePasswordChanged(request);

    const { subject, message } = SupportSchema.parse(request.body);

    await sendEmail({
      to: env.ADMIN_ALERT_EMAIL,
      template: 'support_request',
      userId: request.user.id,
      replyTo: request.user.email,
      data: { subject, message, fromEmail: request.user.email },
      idempotencyKey: `support:${request.user.id}:${Date.now()}`
    });

    return reply.status(200).send({ ok: true });
  });

  fastify.get('/v1/account/invoices/:transactionId/pdf', { preHandler: [requireUser] }, async (request, reply) => {
    requirePasswordChanged(request);

    const transaction = await prisma.transaction.findFirst({
      where: { paddleTransactionId: request.params.transactionId, userId: request.user.id }
    });

    if (!transaction) throw new AppError('not_found', 404, 'Invoice not found');

    try {
      const invoice = await paddleClient.getTransactionInvoice(transaction.paddleTransactionId);
      return reply.status(200).send({ ok: true, url: invoice.url });
    } catch (err) {
      request.log.error(err);
      throw new AppError('invoice_unavailable', 502, "Couldn't fetch this invoice from Paddle right now. Please try again shortly.");
    }
  });

  fastify.post('/v1/account/downloads/latest', { preHandler: [requireUser] }, async (request, reply) => {
    requirePasswordChanged(request);
    throw new AppError('no_release', 404, 'No published release yet. Check back soon.');
  });

  const ChangePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).regex(/[A-Z]/, 'Must contain an uppercase letter').regex(/[0-9]/, 'Must contain a number')
  });

  fastify.post('/v1/account/change-password', { preHandler: [requireUser] }, async (request, reply) => {
    requirePasswordChanged(request);

    const { currentPassword, newPassword } = ChangePasswordSchema.parse(request.body);

    const isValid = await argon2.verify(request.user.passwordHash, currentPassword);
    if (!isValid) {
      throw new AppError('invalid_credentials', 401, 'Current password is incorrect');
    }

    const passwordHash = await argon2.hash(newPassword);

    await prisma.$transaction([
      prisma.user.update({ where: { id: request.user.id }, data: { passwordHash } }),
      prisma.session.updateMany({
        where: { userId: request.user.id, id: { not: request.session.id }, revokedAt: null },
        data: { revokedAt: new Date() }
      })
    ]);

    return reply.status(200).send({ ok: true });
  });

  fastify.get('/v1/account/sessions', { preHandler: [requireUser] }, async (request, reply) => {
    requirePasswordChanged(request);

    const sessions = await prisma.session.findMany({
      where: { userId: request.user.id, revokedAt: null },
      orderBy: { lastUsedAt: 'desc' }
    });

    return reply.status(200).send({
      ok: true,
      sessions: sessions.map(s => ({
        id: s.id,
        ip: s.ip,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        current: s.id === request.session.id
      }))
    });
  });

  fastify.delete('/v1/account/sessions/:id', { preHandler: [requireUser] }, async (request, reply) => {
    requirePasswordChanged(request);

    if (request.params.id === request.session.id) {
      throw new AppError('validation_failed', 400, 'Use sign out to end your current session.');
    }

    const session = await prisma.session.findFirst({
      where: { id: request.params.id, userId: request.user.id, revokedAt: null }
    });
    if (!session) throw new AppError('not_found', 404, 'Session not found');

    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });

    return reply.status(200).send({ ok: true });
  });

  fastify.post('/v1/account/sessions/revoke-all', { preHandler: [requireUser] }, async (request, reply) => {
    requirePasswordChanged(request);

    await prisma.session.updateMany({
      where: { userId: request.user.id, id: { not: request.session.id }, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    return reply.status(200).send({ ok: true });
  });

}
