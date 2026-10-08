import { prisma } from '../../db/prisma.js';
import { requireUser, requireAdmin } from '../../http/auth.js';

export default async function adminLogsRoutes(fastify, opts) {
  fastify.get('/v1/admin/logs', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { page = '1' } = request.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 50;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSize,
        take: pageSize
      }),
      prisma.auditLog.count()
    ]);

    return reply.status(200).send({
      ok: true,
      logs: logs.map(l => ({
        id: l.id,
        actor: l.user?.email ?? l.actorLabel,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        meta: l.meta,
        createdAt: l.createdAt
      })),
      total,
      page: pageNum,
      pageSize
    });
  });
}
