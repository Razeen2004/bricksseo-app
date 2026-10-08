import { effectiveLicenseStatus } from '../licenses/effective-status.js';

export async function recomputeLicensesForSubscription(tx, paddleSubscriptionId) {
  const subscription = await tx.subscription.findUnique({ where: { paddleSubscriptionId } });
  if (!subscription) return;

  const licenses = await tx.license.findMany({ where: { paddleSubscriptionId } });

  for (const license of licenses) {
    const nextEffectiveStatus = effectiveLicenseStatus(license, subscription);

    let nextDbStatus = license.status;
    let nextStatusReason = license.statusReason;
    let nextExpiresAt = license.expiresAt;
    let eventType = null;

    if (nextEffectiveStatus === 'active') {
      nextDbStatus = 'active';
      nextStatusReason = null;
      if (subscription.currentPeriodEnd && (!license.expiresAt || new Date(subscription.currentPeriodEnd) > new Date(license.expiresAt))) {
        nextExpiresAt = subscription.currentPeriodEnd;
        eventType = 'renewed';
      } else if (license.status !== 'active') {
        eventType = 'reinstated';
      }
    } else if (nextEffectiveStatus === 'suspended') {
      nextDbStatus = 'suspended';
      nextStatusReason = subscription.status === 'paused' ? 'paused' : 'past_due';
      if (license.status !== 'suspended') eventType = 'suspended';
    } else if (nextEffectiveStatus === 'expired') {
      nextDbStatus = 'expired';
      nextStatusReason = 'canceled';
      nextExpiresAt = subscription.canceledAt ?? license.expiresAt;
      if (license.status !== 'expired') eventType = 'expired';
    }

    if (license.planCode !== subscription.planCode) {
      const newPlan = await tx.plan.findUnique({ where: { code: subscription.planCode } });
      await tx.license.update({
        where: { id: license.id },
        data: { planCode: subscription.planCode, siteLimit: newPlan?.siteLimit ?? license.siteLimit }
      });
      await tx.licenseEvent.create({
        data: {
          licenseId: license.id,
          type: 'plan_changed',
          actor: 'paddle',
          meta: { from: license.planCode, to: subscription.planCode }
        }
      });
    }

    const changed = nextDbStatus !== license.status || nextStatusReason !== license.statusReason ||
      (nextExpiresAt?.getTime?.() ?? nextExpiresAt) !== (license.expiresAt?.getTime?.() ?? license.expiresAt);

    if (changed) {
      await tx.license.update({
        where: { id: license.id },
        data: { status: nextDbStatus, statusReason: nextStatusReason, expiresAt: nextExpiresAt }
      });
    }

    if (eventType) {
      await tx.licenseEvent.create({
        data: {
          licenseId: license.id,
          type: eventType,
          actor: 'paddle',
          meta: { paddleSubscriptionId, subscriptionStatus: subscription.status }
        }
      });
    }
  }
}
