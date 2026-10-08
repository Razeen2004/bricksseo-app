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

function randomString(length) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let str = '';
  for (let i = 0; i < length; i++) str += chars[crypto.randomInt(0, chars.length)];
  return str;
}

const PasswordConfirmSchema = z.object({ password: z.string().min(1) });

export default async function adminCustomersRoutes(fastify, opts) {
  fastify.get('/v1/admin/customers', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { search = '', status = 'all', sort = 'newest', page = '1' } = request.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 50;

    const where = {
      role: 'customer',
      ...(search ? { email: { contains: search, mode: 'insensitive' } } : {})
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

    let rows = users.map(u => {
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

    if (status === 'active') rows = rows.filter(r => r.hasActiveLicense);
    if (status === 'expired') rows = rows.filter(r => !r.hasActiveLicense);
    if (status === 'refunded') rows = rows.filter(r => r.hasRefund);

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
