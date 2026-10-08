import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireUser, requireAdmin } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { verifyAdminPassword } from '../../lib/verify-admin-password.js';
import { writeAuditLog } from '../../lib/audit.js';
import { effectiveLicenseStatus } from '../licenses/effective-status.js';
import { decryptKey } from '../licenses/keygen.js';

const PasswordConfirmSchema = z.object({ password: z.string().min(1) });

function serialize(l) {
  const sitesUsed = l.activations.filter(a => !a.deactivatedAt).length;
  return {
    id: l.id,
    keyHint: l.keyHint,
    customerEmail: l.user.email,
    planCode: l.plan.code,
    planName: l.plan.name,
    status: effectiveLicenseStatus(l),
    rawStatus: l.status,
    siteLimit: l.siteLimit,
    sitesUsed,
    expiresAt: l.expiresAt,
    issuedAt: l.issuedAt
  };
}

export default async function adminLicensesRoutes(fastify, opts) {
  fastify.get('/v1/admin/licenses', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { search = '', status = 'all', sort = 'newest', page = '1' } = request.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 50;

    const where = search
      ? { OR: [{ keyHint: { contains: search, mode: 'insensitive' } }, { user: { email: { contains: search, mode: 'insensitive' } } }] }
      : {};

    const [licenses, total, allForStats] = await Promise.all([
      prisma.license.findMany({
        where,
        include: { user: true, plan: true, activations: true },
        orderBy: { createdAt: sort === 'oldest' ? 'asc' : 'desc' },
        skip: (pageNum - 1) * pageSize,
        take: pageSize
      }),
      prisma.license.count({ where }),
      prisma.license.findMany({ select: { status: true, expiresAt: true } })
    ]);

    let rows = licenses.map(serialize);

    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (status === 'active') rows = rows.filter(r => r.status === 'active');
    if (status === 'expires_soon') rows = rows.filter(r => r.status === 'active' && r.expiresAt && new Date(r.expiresAt) < thirtyDays);
    if (status === 'expired') rows = rows.filter(r => r.status === 'expired');
    if (status === 'revoked') rows = rows.filter(r => r.status === 'revoked');

    const activeCount = allForStats.filter(l => effectiveLicenseStatus(l) === 'active').length;
    const expiringSoonCount = allForStats.filter(l => effectiveLicenseStatus(l) === 'active' && l.expiresAt && new Date(l.expiresAt) < thirtyDays).length;
    const customerCount = await prisma.user.count({ where: { role: 'customer' } });

    return reply.status(200).send({
      ok: true,
      licenses: rows,
      total,
      page: pageNum,
      pageSize,
      stats: { total: allForStats.length, active: activeCount, expiringSoon: expiringSoonCount, customers: customerCount }
    });
  });

  fastify.get('/v1/admin/licenses/export.csv', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const licenses = await prisma.license.findMany({
      include: { user: true, plan: true, activations: true },
      orderBy: { createdAt: 'desc' }
    });

    const rows = licenses.map(l => {
      const s = serialize(l);
      return [s.keyHint, s.customerEmail, s.planName, s.sitesUsed, s.siteLimit ?? '', s.status, s.expiresAt ? new Date(s.expiresAt).toISOString() : ''].join(',');
    });

    const csv = ['key_hint,customer,plan,sites_used,site_limit,status,renews', ...rows].join('\n');
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="licenses.csv"');
    return reply.status(200).send(csv);
  });

  fastify.post('/v1/admin/licenses/:id/reveal', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const license = await prisma.license.findUnique({ where: { id: request.params.id } });
    if (!license) throw new AppError('not_found', 404, 'License not found');

    const key = decryptKey(license.keyCiphertext);

    await writeAuditLog({
      actorUserId: request.user.id,
      action: 'license.reveal',
      targetType: 'license',
      targetId: license.id,
      ip: request.ip
    });

    return reply.status(200).send({ ok: true, key });
  });

  fastify.post('/v1/admin/licenses/:id/revoke', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { password } = PasswordConfirmSchema.parse(request.body);
    await verifyAdminPassword(request.user, password);

    const license = await prisma.license.findUnique({ where: { id: request.params.id } });
    if (!license) throw new AppError('not_found', 404, 'License not found');

    await prisma.$transaction([
      prisma.license.update({ where: { id: license.id }, data: { status: 'revoked', statusReason: 'admin' } }),
      prisma.activation.updateMany({ where: { licenseId: license.id, deactivatedAt: null }, data: { deactivatedAt: new Date(), deactivatedBy: 'system_revoked' } }),
      prisma.licenseEvent.create({ data: { licenseId: license.id, type: 'revoked', actor: `admin:${request.user.id}` } })
    ]);

    await writeAuditLog({
      actorUserId: request.user.id,
      action: 'license.revoke',
      targetType: 'license',
      targetId: license.id,
      ip: request.ip
    });

    return reply.status(200).send({ ok: true });
  });

  fastify.post('/v1/admin/licenses/:id/reinstate', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { password } = PasswordConfirmSchema.parse(request.body);
    await verifyAdminPassword(request.user, password);

    const license = await prisma.license.findUnique({ where: { id: request.params.id } });
    if (!license) throw new AppError('not_found', 404, 'License not found');

    await prisma.$transaction([
      prisma.license.update({ where: { id: license.id }, data: { status: 'active', statusReason: null } }),
      prisma.licenseEvent.create({ data: { licenseId: license.id, type: 'reinstated', actor: `admin:${request.user.id}` } })
    ]);

    await writeAuditLog({
      actorUserId: request.user.id,
      action: 'license.reinstate',
      targetType: 'license',
      targetId: license.id,
      ip: request.ip
    });

    return reply.status(200).send({ ok: true });
  });
}
