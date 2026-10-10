import { prisma } from '../../db/prisma.js';
import { requireUser, requireAdmin } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';

const STALE_30_DAYS = 30 * 24 * 60 * 60 * 1000;
const STALE_90_DAYS = 90 * 24 * 60 * 60 * 1000;

function isOutdated(pluginVersion, currentVersion) {
  if (!pluginVersion || !currentVersion) return false;
  const [, minor] = pluginVersion.replace('v', '').split('.').map(Number);
  const [, currentMinor] = currentVersion.replace('v', '').split('.').map(Number);
  return (currentMinor ?? 0) - (minor ?? 0) > 2;
}

export default async function adminSitesRoutes(fastify, opts) {
  fastify.get('/v1/admin/sites', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { search = '', status = 'all', page = '1' } = request.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 50;

    const where = search ? { siteUrl: { contains: search, mode: 'insensitive' } } : {};

    const [activations, total, latestRelease] = await Promise.all([
      prisma.activation.findMany({
        where,
        include: { license: { include: { user: true } } },
        orderBy: { lastSeenAt: 'desc' },
        skip: (pageNum - 1) * pageSize,
        take: pageSize
      }),
      prisma.activation.count({ where }),
      prisma.release.findFirst({ where: { status: 'published', channel: 'stable' }, orderBy: { publishedAt: 'desc' } })
    ]);

    const now = Date.now();
    let rows = activations.map(a => ({
      id: a.id,
      domain: a.siteUrl,
      customerEmail: a.license.user.email,
      licenseKeyHint: a.license.keyHint,
      wpVersion: a.wpVersion,
      pluginVersion: a.pluginVersion,
      lastSeenAt: a.lastSeenAt,
      deactivatedAt: a.deactivatedAt,
      outdated: isOutdated(a.pluginVersion, latestRelease?.version),
      status: a.deactivatedAt
        ? 'removed'
        : (now - new Date(a.lastSeenAt).getTime() > STALE_90_DAYS ? 'stale90'
          : (now - new Date(a.lastSeenAt).getTime() > STALE_30_DAYS ? 'stale30' : 'active'))
    }));

    if (status === 'active') rows = rows.filter(r => r.status === 'active');
    if (status === 'stale30') rows = rows.filter(r => r.status === 'stale30' || r.status === 'stale90');
    if (status === 'stale90') rows = rows.filter(r => r.status === 'stale90');
    if (status === 'outdated') rows = rows.filter(r => r.outdated);

    const allActivations = await prisma.activation.findMany({ select: { deactivatedAt: true, lastSeenAt: true } });
    const activeCount = allActivations.filter(a => !a.deactivatedAt).length;
    const stale30Count = allActivations.filter(a => !a.deactivatedAt && now - new Date(a.lastSeenAt).getTime() > STALE_30_DAYS).length;
    const stale90Count = allActivations.filter(a => !a.deactivatedAt && now - new Date(a.lastSeenAt).getTime() > STALE_90_DAYS).length;

    return reply.status(200).send({
      ok: true,
      sites: rows,
      total,
      page: pageNum,
      pageSize,
      stats: { total: allActivations.length, active: activeCount, stale30: stale30Count, stale90: stale90Count }
    });
  });

  fastify.get('/v1/admin/sites/export.csv', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const activations = await prisma.activation.findMany({
      include: { license: { include: { user: true } } },
      orderBy: { lastSeenAt: 'desc' }
    });

    const rows = activations.map(a => [
      a.siteUrl, a.license.user.email, a.license.keyHint, a.wpVersion ?? '', a.pluginVersion ?? '',
      a.deactivatedAt ? 'removed' : 'active', a.lastSeenAt ? new Date(a.lastSeenAt).toISOString() : ''
    ].join(','));

    const csv = ['domain,customer,license,wp_version,plugin_version,status,last_seen', ...rows].join('\n');
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="sites.csv"');
    return reply.status(200).send(csv);
  });

  fastify.post('/v1/admin/sites/:activationId/deactivate', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const activation = await prisma.activation.findUnique({ where: { id: request.params.activationId } });
    if (!activation) throw new AppError('not_found', 404, 'Site not found');

    if (!activation.deactivatedAt) {
      await prisma.$transaction([
        prisma.activation.update({
          where: { id: activation.id },
          data: { deactivatedAt: new Date(), deactivatedBy: `admin:${request.user.id}` }
        }),
        prisma.licenseEvent.create({
          data: {
            licenseId: activation.licenseId,
            type: 'site_deactivated',
            actor: `admin:${request.user.id}`,
            meta: { activationId: activation.id, siteUrl: activation.siteUrl }
          }
        })
      ]);

      await writeAuditLog({
        actorUserId: request.user.id,
        action: 'site.deactivate',
        targetType: 'activation',
        targetId: activation.id,
        meta: { siteUrl: activation.siteUrl },
        ip: request.ip
      });
    }

    return reply.status(200).send({ ok: true });
  });

  fastify.delete('/v1/admin/sites/:activationId', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const activation = await prisma.activation.findUnique({ where: { id: request.params.activationId } });
    if (!activation) throw new AppError('not_found', 404, 'Site not found');
    if (!activation.deactivatedAt) {
      throw new AppError('validation_failed', 400, 'Deactivate this site before deleting it.');
    }

    await prisma.activation.delete({ where: { id: activation.id } });

    await writeAuditLog({
      actorUserId: request.user.id,
      action: 'site.delete',
      targetType: 'activation',
      targetId: activation.id,
      meta: { siteUrl: activation.siteUrl },
      ip: request.ip
    });

    return reply.status(200).send({ ok: true });
  });
}
