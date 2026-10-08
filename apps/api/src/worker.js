import { getQueue } from './jobs/queue.js';
import { processTransactionCompleted } from './modules/paddle/fulfillment.js';
import { processSubscriptionEvent } from './modules/paddle/subscription-events.js';
import { processAdjustmentEvent } from './modules/paddle/adjustment-events.js';
import { sendEmail } from './modules/email/mailer.js';
import { prisma } from './db/prisma.js';

const SUBSCRIPTION_EVENT_TYPES = new Set([
  'subscription.created',
  'subscription.activated',
  'subscription.updated',
  'subscription.resumed',
  'subscription.trialing',
  'subscription.past_due',
  'subscription.paused',
  'subscription.canceled'
]);

const ADJUSTMENT_EVENT_TYPES = new Set(['adjustment.created', 'adjustment.updated']);

async function handleCustomerUpdated(payload) {
  const customer = payload.data;
  const user = await prisma.user.findUnique({ where: { paddleCustomerId: customer.id } });
  if (!user) return;

  if (customer.email && customer.email.toLowerCase() !== user.email) {
    console.log(`customer.updated for ${user.id}: email changed on Paddle (${customer.email}) — not auto-applying, login identifier stays as-is`);
  }

  if (customer.name && customer.name !== user.name) {
    await prisma.user.update({ where: { id: user.id }, data: { name: customer.name } });
  }
}

async function handlePaymentFailed(payload) {
  const txn = payload.data;
  await prisma.transaction.updateMany({
    where: { paddleTransactionId: txn.id },
    data: { status: txn.status ?? 'payment_failed' }
  });
}

async function startWorker() {
  const queue = await getQueue();

  await queue.work('paddle.process_event', async (job) => {
    const { paddleEventId } = job.data;

    const event = await prisma.webhookEvent.findUnique({
      where: { paddleEventId }
    });

    if (!event || event.status === 'processed') return;

    try {
      if (event.eventType === 'transaction.completed') {
        await processTransactionCompleted(event.payload);
      } else if (event.eventType === 'transaction.payment_failed') {
        await handlePaymentFailed(event.payload);
      } else if (SUBSCRIPTION_EVENT_TYPES.has(event.eventType)) {
        await processSubscriptionEvent(event.payload, event.occurredAt);
      } else if (ADJUSTMENT_EVENT_TYPES.has(event.eventType)) {
        await processAdjustmentEvent(event.payload);
      } else if (event.eventType === 'customer.updated') {
        await handleCustomerUpdated(event.payload);
      } else {
        console.log(`Unhandled event type: ${event.eventType}`);
      }

      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: 'processed',
          processedAt: new Date(),
          attempts: { increment: 1 }
        }
      });
    } catch (err) {
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: 'failed',
          lastError: err.message,
          attempts: { increment: 1 }
        }
      });
      throw err; // Trigger pg-boss retry
    }
  });

  // Email sender processor
  await queue.work('email.send', async (job) => {
    await sendEmail(job.data);
  });

  console.log('Worker is running and listening for jobs...');
}

startWorker().catch(err => {
  console.error('Worker failed to start', err);
  process.exit(1);
});
