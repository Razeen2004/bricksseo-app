import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { recomputeLicensesForSubscription } from './recompute.js';
import { getQueue } from '../../jobs/queue.js';

export async function processSubscriptionEvent(payload, occurredAt) {
  const sub = payload.data;

  const user = await prisma.user.findUnique({ where: { paddleCustomerId: sub.customer_id } });
  if (!user) {
    throw new Error(`No user found for Paddle customer ${sub.customer_id} yet — will retry`);
  }

  const planPrices = await prisma.planPrice.findMany({ where: { environment: env.PADDLE_ENV } });
  const priceId = sub.items?.[0]?.price?.id;
  const planPrice = planPrices.find(p => p.paddlePriceId === priceId);
  if (!planPrice) {
    throw new Error(`Unknown price id on subscription: ${priceId}`);
  }

  let justCanceled = false;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findUnique({ where: { paddleSubscriptionId: sub.id } });
    if (existing && existing.lastEventAt && new Date(occurredAt) <= new Date(existing.lastEventAt)) {
      return;
    }

    // Only the first time status actually flips to canceled — not on every
    // retried/duplicate webhook delivery for an already-canceled subscription.
    justCanceled = existing?.status !== 'canceled' && sub.status === 'canceled';

    await tx.subscription.upsert({
      where: { paddleSubscriptionId: sub.id },
      create: {
        paddleSubscriptionId: sub.id,
        userId: user.id,
        planCode: planPrice.planCode,
        paddlePriceId: priceId,
        status: sub.status,
        currentPeriodStart: new Date(sub.current_billing_period?.starts_at ?? sub.started_at ?? Date.now()),
        currentPeriodEnd: new Date(sub.current_billing_period?.ends_at ?? Date.now()),
        scheduledChangeAction: sub.scheduled_change?.action ?? null,
        scheduledChangeEffectiveAt: sub.scheduled_change?.effective_at ? new Date(sub.scheduled_change.effective_at) : null,
        canceledAt: sub.canceled_at ? new Date(sub.canceled_at) : null,
        currency: sub.currency_code ?? 'USD',
        unitPriceMinor: parseInt(sub.items?.[0]?.price?.unit_price?.amount ?? '0', 10),
        lastEventAt: new Date(occurredAt)
      },
      update: {
        planCode: planPrice.planCode,
        paddlePriceId: priceId,
        status: sub.status,
        currentPeriodStart: new Date(sub.current_billing_period?.starts_at ?? sub.started_at ?? Date.now()),
        currentPeriodEnd: new Date(sub.current_billing_period?.ends_at ?? Date.now()),
        scheduledChangeAction: sub.scheduled_change?.action ?? null,
        scheduledChangeEffectiveAt: sub.scheduled_change?.effective_at ? new Date(sub.scheduled_change.effective_at) : null,
        canceledAt: sub.canceled_at ? new Date(sub.canceled_at) : null,
        lastEventAt: new Date(occurredAt)
      }
    });

    await recomputeLicensesForSubscription(tx, sub.id);
  });

  // Sent after the transaction commits, so a rolled-back write can't still
  // trigger an email about a cancellation that didn't actually save.
  if (justCanceled) {
    const plan = await prisma.plan.findUnique({ where: { code: planPrice.planCode } });
    const queue = await getQueue();
    await queue.send('email.send', {
      to: user.email,
      template: 'subscription_canceled',
      userId: user.id,
      data: {
        planName: plan?.name ?? planPrice.planCode,
        planCode: planPrice.planCode,
        canceledAt: sub.canceled_at ?? new Date().toISOString()
      },
      idempotencyKey: `subscription-canceled:${sub.id}`
    }, { singletonKey: `email:subscription-canceled:${sub.id}` });
  }
}
