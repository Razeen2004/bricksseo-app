import { prisma } from '../../db/prisma.js';
import { requireUser, requireAdmin } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { getQueue } from '../../jobs/queue.js';

function extractCustomerEmail(payload) {
  return payload?.data?.custom_data?.email || payload?.data?.email || null;
}

export default async function adminWebhooksRoutes(fastify, opts) {
  fastify.get('/v1/admin/webhooks', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const { search = '', status = 'all', page = '1' } = request.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 50;

    const where = {
      ...(status !== 'all' ? { status } : {}),
      ...(search ? { OR: [{ paddleEventId: { contains: search, mode: 'insensitive' } }, { eventType: { contains: search, mode: 'insensitive' } }] } : {})
    };

    const [events, total] = await Promise.all([
      prisma.webhookEvent.findMany({ where, orderBy: { receivedAt: 'desc' }, skip: (pageNum - 1) * pageSize, take: pageSize }),
      prisma.webhookEvent.count({ where })
    ]);

    const rows = events.map(e => ({
      id: e.id,
      eventId: e.paddleEventId,
      eventType: e.eventType,
      customerEmail: extractCustomerEmail(e.payload),
      status: e.status,
      receivedAt: e.receivedAt,
      processedAt: e.processedAt,
      attempts: e.attempts,
      lastError: e.lastError
    }));

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [received24h, failed24h, lastEvent] = await Promise.all([
      prisma.webhookEvent.count({ where: { receivedAt: { gte: since24h } } }),
      prisma.webhookEvent.count({ where: { status: 'failed', receivedAt: { gte: since24h } } }),
      prisma.webhookEvent.findFirst({ orderBy: { receivedAt: 'desc' } })
    ]);

    return reply.status(200).send({
      ok: true,
      webhooks: rows,
      total,
      page: pageNum,
      pageSize,
      stats: {
        received24h,
        failed24h,
        lastEventAt: lastEvent?.receivedAt ?? null,
        lastEventType: lastEvent?.eventType ?? null
      }
    });
  });

  fastify.get('/v1/admin/webhooks/:id', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const event = await prisma.webhookEvent.findUnique({ where: { id: request.params.id } });
    if (!event) throw new AppError('not_found', 404, 'Webhook event not found');

    return reply.status(200).send({
      ok: true,
      webhook: {
        id: event.id,
        eventId: event.paddleEventId,
        eventType: event.eventType,
        receivedAt: event.receivedAt,
        occurredAt: event.occurredAt,
        status: event.status,
        payload: event.payload
      }
    });
  });

  fastify.post('/v1/admin/webhooks/:id/replay', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const event = await prisma.webhookEvent.findUnique({ where: { id: request.params.id } });
    if (!event) throw new AppError('not_found', 404, 'Webhook event not found');

    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: 'pending', lastError: null } });

    const queue = await getQueue();
    await queue.send('paddle.process_event', { paddleEventId: event.paddleEventId }, { retryLimit: 8, retryBackoff: true });

    return reply.status(200).send({ ok: true });
  });

  fastify.post('/v1/admin/webhooks/replay-failed', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const failed = await prisma.webhookEvent.findMany({ where: { status: 'failed' } });

    const queue = await getQueue();
    for (const event of failed) {
      await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: 'pending', lastError: null } });
      await queue.send('paddle.process_event', { paddleEventId: event.paddleEventId }, { retryLimit: 8, retryBackoff: true });
    }

    return reply.status(200).send({ ok: true, replayed: failed.length });
  });
}
