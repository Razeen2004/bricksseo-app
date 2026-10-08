import { verifyPaddleSignature } from './verify.js';
import { PaddleEnvelope } from './events.schemas.js';
import { prisma } from '../../db/prisma.js';
import { getQueue } from '../../jobs/queue.js';

export default async function paddleWebhookRoutes(fastify, opts) {
  fastify.post('/v1/webhooks/paddle', async (request, reply) => {
    // 1. Verify Signature
    const signatureHeader = request.headers['paddle-signature'];
    verifyPaddleSignature(signatureHeader, request.rawBody);

    // 2. Parse Envelope via Zod
    const payload = PaddleEnvelope.parse(request.body);

    // 3. Store event (Idempotent: unique on paddle_event_id)
    try {
      await prisma.webhookEvent.create({
        data: {
          paddleEventId: payload.event_id,
          paddleNotificationId: payload.notification_id,
          eventType: payload.event_type,
          occurredAt: payload.occurred_at,
          payload: request.body,
          status: 'pending'
        }
      });
      
      // 4. Enqueue Job
      const queue = await getQueue();
      await queue.send('paddle.process_event', { paddleEventId: payload.event_id }, {
        singletonKey: payload.event_id,
        retryLimit: 8,
        retryBackoff: true
      });
      
    } catch (err) {
      // P2002 is Prisma's unique constraint violation error code
      if (err.code === 'P2002') {
        // We've already seen this event. That's fine, we return 200.
        request.log.info(`Duplicate webhook event ignored: ${payload.event_id}`);
      } else {
        throw err;
      }
    }

    // Always return 200 within 5 seconds for Paddle
    return reply.status(200).send({ ok: true });
  });
}
