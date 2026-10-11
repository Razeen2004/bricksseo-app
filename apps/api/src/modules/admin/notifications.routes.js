import { prisma } from '../../db/prisma.js';
import { requireUser, requireAdmin } from '../../http/auth.js';

const PURCHASE_WINDOW_DAYS = 7;
const ITEM_LIMIT = 5;

export default async function adminNotificationsRoutes(fastify) {
  fastify.get('/v1/admin/notifications', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const purchasesSince = new Date(Date.now() - PURCHASE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const readSetting = await prisma.setting.findUnique({
      where: { key: `admin.notifications.last_read.${request.user.id}` }
    });
    const readAt = readSetting?.value?.readAt ? new Date(readSetting.value.readAt) : null;

    const [purchases, purchaseCount, unreadPurchaseCount, failedWebhooks, failedWebhookCount, unreadFailedWebhookCount] = await Promise.all([
      prisma.transaction.findMany({
        where: { status: 'completed', billedAt: { gte: purchasesSince } },
        orderBy: { billedAt: 'desc' },
        take: ITEM_LIMIT,
        include: { user: { select: { email: true } } }
      }),
      prisma.transaction.count({ where: { status: 'completed', billedAt: { gte: purchasesSince } } }),
      prisma.transaction.count({
        where: {
          status: 'completed',
          billedAt: { gte: readAt && readAt > purchasesSince ? readAt : purchasesSince }
        }
      }),
      prisma.webhookEvent.findMany({
        where: { status: 'failed' },
        orderBy: { receivedAt: 'desc' },
        take: ITEM_LIMIT
      }),
      prisma.webhookEvent.count({ where: { status: 'failed' } }),
      prisma.webhookEvent.count({
        where: {
          status: 'failed',
          ...(readAt ? { receivedAt: { gt: readAt } } : {})
        }
      })
    ]);

    return reply.status(200).send({
      ok: true,
      total: unreadPurchaseCount + unreadFailedWebhookCount,
      readAt,
      purchases: purchases.map(transaction => ({
        id: transaction.paddleTransactionId,
        email: transaction.user.email,
        totalMinor: transaction.totalMinor,
        currency: transaction.currency,
        createdAt: transaction.billedAt
      })),
      purchaseCount,
      unreadPurchaseCount,
      failedWebhooks: failedWebhooks.map(event => ({
        id: event.id,
        eventType: event.eventType,
        receivedAt: event.receivedAt
      })),
      failedWebhookCount,
      unreadFailedWebhookCount,
      purchaseWindowDays: PURCHASE_WINDOW_DAYS
    });
  });

  fastify.post('/v1/admin/notifications/read', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const readAt = new Date();
    const key = `admin.notifications.last_read.${request.user.id}`;
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: { readAt: readAt.toISOString() }, updatedBy: request.user.id },
      update: { value: { readAt: readAt.toISOString() }, updatedBy: request.user.id }
    });

    return reply.status(200).send({ ok: true, readAt });
  });
}
