import { prisma } from '../../db/prisma.js';
import { requireUser, requireAdmin } from '../../http/auth.js';

const PURCHASE_WINDOW_DAYS = 7;
const ITEM_LIMIT = 5;

export default async function adminNotificationsRoutes(fastify) {
  fastify.get('/v1/admin/notifications', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const purchasesSince = new Date(Date.now() - PURCHASE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [purchases, purchaseCount, failedWebhooks, failedWebhookCount] = await Promise.all([
      prisma.transaction.findMany({
        where: { status: 'completed', billedAt: { gte: purchasesSince } },
        orderBy: { billedAt: 'desc' },
        take: ITEM_LIMIT,
        include: { user: { select: { email: true } } }
      }),
      prisma.transaction.count({ where: { status: 'completed', billedAt: { gte: purchasesSince } } }),
      prisma.webhookEvent.findMany({
        where: { status: 'failed' },
        orderBy: { receivedAt: 'desc' },
        take: ITEM_LIMIT
      }),
      prisma.webhookEvent.count({ where: { status: 'failed' } })
    ]);

    return reply.status(200).send({
      ok: true,
      total: purchaseCount + failedWebhookCount,
      purchases: purchases.map(transaction => ({
        id: transaction.paddleTransactionId,
        email: transaction.user.email,
        totalMinor: transaction.totalMinor,
        currency: transaction.currency,
        createdAt: transaction.billedAt
      })),
      purchaseCount,
      failedWebhooks: failedWebhooks.map(event => ({
        id: event.id,
        eventType: event.eventType,
        receivedAt: event.receivedAt
      })),
      failedWebhookCount,
      purchaseWindowDays: PURCHASE_WINDOW_DAYS
    });
  });
}
