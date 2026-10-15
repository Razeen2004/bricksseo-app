import { z } from 'zod';
import crypto from 'crypto';
import argon2 from '@node-rs/argon2';
import { prisma } from '../../db/prisma.js';
import { requireUser, requireAdmin } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { verifyAdminPassword } from '../../lib/verify-admin-password.js';
import { writeAuditLog } from '../../lib/audit.js';
import { issuePasswordResetToken } from '../auth/auth.routes.js';
import { sendEmail } from '../email/mailer.js';
import { encryptKey, encryptValue, generateLicenseKey, hashKey } from '../licenses/keygen.js';

function randomString(length) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let str = '';
  for (let i = 0; i < length; i++) str += chars[crypto.randomInt(0, chars.length)];
  return str;
}

const PasswordConfirmSchema = z.object({ password: z.string().min(1) });
const DeleteCustomersSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), password: z.string().min(1) });
const CreateCustomerLicenseSchema = z.object({
  email: z.string().trim().email().max(320).transform(email => email.toLowerCase()),
  name: z.string().trim().max(160).optional().default(''),
  planCode: z.string().trim().min(1).max(50),
  siteLimit: z.number().int().min(1).max(10000).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(2000).optional().default('')
});

function generateTemporaryPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const group = () => Array.from({ length: 4 }, () => chars[crypto.randomInt(0, chars.length)]).join('');
  return `${group()}-${group()}-${group()}-${group()}`;
}

export default async function adminCustomersRoutes(fastify, opts) {
  fastify.post('/v1/admin/customers/create-license', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const input = CreateCustomerLicenseSchema.parse(request.body);
    const plan = await prisma.plan.findUnique({ where: { code: input.planCode } });
    if (!plan || !plan.active) throw new AppError('validation_failed', 400, 'Choose an active plan.');

    const requestedExpiry = input.expiresAt ? new Date(input.expiresAt) : null;
    if (requestedExpiry && requestedExpiry <= new Date()) {
      throw new AppError('validation_failed', 400, 'Expiry date must be in the future.');
    }
    const expiresAt = requestedExpiry || (plan.interval === 'year'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      : null);
    const siteLimit = input.siteLimit === undefined ? plan.siteLimit : input.siteLimit;

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing && existing.role !== 'customer') throw new AppError('conflict', 409, 'That email belongs to an administrator account.');
    if (existing?.status !== undefined && existing.status !== 'active') throw new AppError('conflict', 409, 'This customer account is disabled. Enable it before issuing a license.');

    const key = generateLicenseKey();
    const manualTransactionId = `admin_${crypto.randomUUID()}`;
    const isNewCustomer = !existing;
    const tempPassword = isNewCustomer ? generateTemporaryPassword() : null;
    const now = new Date();

    const result = await prisma.$transaction(async tx => {
      let user = existing;
      if (!user) {
        user = await tx.user.create({
          data: {
            email: input.email,
            name: input.name || null,
            passwordHash: await argon2.hash(tempPassword),
            mustChangePassword: true,
            tempPasswordCiphertext: encryptValue(tempPassword),
            tempPasswordExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          }
        });
      } else if (input.name && !user.name) {
        user = await tx.user.update({ where: { id: user.id }, data: { name: input.name } });
      }

      const license = await tx.license.create({
        data: {
          userId: user.id,
          planCode: plan.code,
          keyHash: hashKey(key),
          keyCiphertext: encryptKey(key),
          keyHint: `${key.substring(0, 9)}...${key.substring(key.length - 4)}`,
          status: 'active',
          siteLimit,
          issuedAt: now,
          expiresAt,
          paddleTransactionId: manualTransactionId,
          itemIndex: 0,
          unitIndex: 0,
          notes: input.notes || null
        }
      });

      await tx.licenseEvent.create({
        data: { licenseId: license.id, type: 'issued', actor: `admin:${request.user.id}`, meta: { source: 'manual_admin_issue', planCode: plan.code } }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: request.user.id,
          actorLabel: `admin:${request.user.id}`,
          action: isNewCustomer ? 'customer.create_with_license' : 'license.issue_manual',
          targetType: 'license',
          targetId: license.id,
          meta: { email: user.email, planCode: plan.code, keyHint: license.keyHint, isNewCustomer, siteLimit, expiresAt },
          ip: request.ip
        }
      });
      return { user, license };
    });

    let emailSent = false;
    let emailError = null;
    try {
      await sendEmail({
        to: result.user.email,
        userId: result.user.id,
        template: isNewCustomer ? 'admin_license_new_customer' : 'admin_license_existing_customer',
        data: isNewCustomer
          ? { email: result.user.email, tempPassword, licenseKeys: [{ key, plan: plan.name }] }
          : { licenseKeys: [{ key, plan: plan.name }] },
        idempotencyKey: `admin-manual-license:${result.license.id}`
      });
      emailSent = true;
    } catch (error) {
      emailError = error.message;
      await writeAuditLog({
        actorUserId: request.user.id,
        action: 'license.issue_email_failed',
        targetType: 'license',
        targetId: result.license.id,
        meta: { email: result.user.email, error: error.message },
        ip: request.ip
      });
    }

    return reply.status(201).send({
      ok: true,
      customer: { id: result.user.id, email: result.user.email, name: result.user.name, created: isNewCustomer },
      license: { id: result.license.id, keyHint: result.license.keyHint, planCode: plan.code, planName: plan.name, siteLimit, expiresAt },
      emailSent,
      emailError
    });
  });

  fastify.get('/v1/admin/customers/license-options', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { sort: 'asc' }, select: { code: true, name: true, siteLimit: true, interval: true } });
    return reply.status(200).send({ ok: true, plans });
  });

  fastify.delete('/v1/admin/customers', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { ids, password } = DeleteCustomersSchema.parse(request.body);
    if (new Set(ids).size !== ids.length) throw new AppError('validation_failed', 400, 'Customer IDs must be unique.');
    if (ids.includes(request.user.id)) throw new AppError('forbidden', 403, 'You cannot delete your own admin account.');
    await verifyAdminPassword(request.user, password);

    const deleted = await prisma.$transaction(async tx => {
      const users = await tx.user.findMany({ where: { id: { in: ids }, role: 'customer' }, select: { id: true, email: true } });
      if (users.length !== ids.length) throw new AppError('not_found', 404, 'One or more selected customers do not exist.');
      await tx.user.deleteMany({ where: { id: { in: ids }, role: 'customer' } });
      await tx.auditLog.createMany({ data: users.map(user => ({
        actorUserId: request.user.id,
        actorLabel: `admin:${request.user.id}`,
        action: 'customer.delete',
        targetType: 'user',
        targetId: user.id,
        meta: { email: user.email },
        ip: request.ip
      })) });
      return users;
    });

    return reply.send({ ok: true, deleted: deleted.length });
  });

  fastify.get('/v1/admin/customers', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { search = '', status = 'all', sort = 'newest', page = '1' } = request.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 50;

    // Status filtering happens in the `where` clause (not after the page is
    // fetched) so pagination and the `total` count both reflect the filtered
    // set, not the unfiltered one. "expired" requires at least one license —
    // a customer with zero licenses has never purchased, which isn't the same
    // thing as a license that lapsed.
    const STATUS_WHERE = {
      active: { licenses: { some: { status: 'active' } } },
      expired: { AND: [{ licenses: { some: {} } }, { licenses: { none: { status: 'active' } } }] },
      refunded: { transactions: { some: { status: 'refunded' } } }
    };

    const where = {
      role: 'customer',
      ...(search ? { email: { contains: search, mode: 'insensitive' } } : {}),
      ...(STATUS_WHERE[status] || {})
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { licenses: { include: { activations: true, plan: true } }, transactions: true },
        orderBy: { createdAt: sort === 'oldest' ? 'asc' : 'desc' },
        skip: (pageNum - 1) * pageSize,
        take: pageSize
      }),
      prisma.user.count({ where })
    ]);

    const rows = users.map(u => {
      const ltv = u.transactions.filter(t => t.status === 'completed').reduce((s, t) => s + t.totalMinor, 0);
      const primaryLicense = u.licenses[0];
      const sitesUsed = u.licenses.reduce((n, l) => n + l.activations.filter(a => !a.deactivatedAt).length, 0);
      const sitesLimit = u.licenses.reduce((n, l) => n + (l.siteLimit ?? 0), 0);
      const hasActiveLicense = u.licenses.some(l => l.status === 'active');
      const hasRefund = u.transactions.some(t => t.status === 'refunded');
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        plan: primaryLicense?.plan?.name ?? '—',
        licenses: u.licenses.length,
        sitesUsed,
        sitesLimit,
        ltvMinor: ltv,
        lastActive: u.lastLoginAt ?? u.createdAt,
        status: u.status,
        flagged: u.flagged,
        hasActiveLicense,
        hasRefund
      };
    });

    const [totalCustomers, activeCustomers, churnedCustomers, ltvAgg] = await Promise.all([
      prisma.user.count({ where: { role: 'customer' } }),
      prisma.license.findMany({ where: { status: 'active', user: { role: 'customer' } }, select: { userId: true }, distinct: ['userId'] }),
      prisma.user.count({ where: { role: 'customer', licenses: { none: { status: 'active' } } } }),
      prisma.transaction.aggregate({ where: { status: 'completed' }, _avg: { totalMinor: true } })
    ]);

    return reply.status(200).send({
      ok: true,
      customers: rows,
      total,
      page: pageNum,
      pageSize,
      stats: {
        total: totalCustomers,
        active: activeCustomers.length,
        churned: churnedCustomers,
        avgLtvMinor: Math.round(ltvAgg._avg.totalMinor ?? 0)
      }
    });
  });

  fastify.get('/v1/admin/customers/export.csv', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const users = await prisma.user.findMany({
      where: { role: 'customer' },
      include: { licenses: { include: { activations: true, plan: true } }, transactions: true },
      orderBy: { createdAt: 'desc' }
    });

    const rows = users.map(u => {
      const ltv = u.transactions.filter(t => t.status === 'completed').reduce((s, t) => s + t.totalMinor, 0);
      const sitesUsed = u.licenses.reduce((n, l) => n + l.activations.filter(a => !a.deactivatedAt).length, 0);
      return [u.email, u.name ?? '', u.licenses[0]?.plan?.name ?? '', u.licenses.length, sitesUsed, (ltv / 100).toFixed(2), u.status].join(',');
    });

    const csv = ['email,name,plan,licenses,sites,ltv_usd,status', ...rows].join('\n');
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="customers.csv"');
    return reply.status(200).send(csv);
  });

  fastify.post('/v1/admin/customers/:id/resend-credentials', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.params.id } });
    if (!user) throw new AppError('not_found', 404, 'Customer not found');

    const tempPasswordRaw = `${randomString(4)}-${randomString(4)}-${randomString(4)}-${randomString(4)}`;
    const passwordHash = await argon2.hash(tempPasswordRaw);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: true, tempPasswordExpiresAt: expiresAt }
    });

    await sendEmail({
      to: user.email,
      template: 'welcome',
      userId: user.id,
      data: { email: user.email, tempPassword: tempPasswordRaw, licenseKey: '(see your dashboard)' },
      idempotencyKey: `resend-credentials:${user.id}:${Date.now()}`
    });

    await writeAuditLog({
      actorUserId: request.user.id,
      action: 'customer.resend_credentials',
      targetType: 'user',
      targetId: user.id,
      ip: request.ip
    });

    return reply.status(200).send({ ok: true });
  });

  fastify.post('/v1/admin/customers/:id/reset-password', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.params.id } });
    if (!user) throw new AppError('not_found', 404, 'Customer not found');

    await issuePasswordResetToken(user, request.ip);

    await writeAuditLog({
      actorUserId: request.user.id,
      action: 'customer.reset_password',
      targetType: 'user',
      targetId: user.id,
      ip: request.ip
    });

    return reply.status(200).send({ ok: true });
  });

  fastify.post('/v1/admin/customers/:id/toggle-status', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { password } = PasswordConfirmSchema.parse(request.body);
    await verifyAdminPassword(request.user, password);

    const user = await prisma.user.findUnique({ where: { id: request.params.id } });
    if (!user) throw new AppError('not_found', 404, 'Customer not found');

    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    await prisma.user.update({ where: { id: user.id }, data: { status: newStatus } });

    await writeAuditLog({
      actorUserId: request.user.id,
      action: 'customer.toggle_status',
      targetType: 'user',
      targetId: user.id,
      meta: { from: user.status, to: newStatus },
      ip: request.ip
    });

    return reply.status(200).send({ ok: true, status: newStatus });
  });

  fastify.post('/v1/admin/customers/:id/toggle-flag', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { password } = PasswordConfirmSchema.parse(request.body);
    await verifyAdminPassword(request.user, password);

    const user = await prisma.user.findUnique({ where: { id: request.params.id } });
    if (!user) throw new AppError('not_found', 404, 'Customer not found');

    await prisma.user.update({ where: { id: user.id }, data: { flagged: !user.flagged } });

    await writeAuditLog({
      actorUserId: request.user.id,
      action: 'customer.toggle_flag',
      targetType: 'user',
      targetId: user.id,
      meta: { flagged: !user.flagged },
      ip: request.ip
    });

    return reply.status(200).send({ ok: true, flagged: !user.flagged });
  });
}
