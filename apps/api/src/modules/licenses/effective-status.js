export function effectiveLicenseStatus(license, subscription = null, now = new Date()) {
  if (license.status === 'revoked') return 'revoked';
  if (license.status === 'suspended') return 'suspended';

  if (subscription) {
    if (subscription.status === 'active' || subscription.status === 'trialing' || subscription.status === 'past_due') {
      return 'active';
    }
    if (subscription.status === 'paused') {
      return 'suspended';
    }
    if (subscription.status === 'canceled') {
      if (subscription.canceledAt && new Date(subscription.canceledAt) > now) {
         // Has access until effective cancellation date, wait, actually if status is canceled, paddle says it's done. 
         // But let's check `expiresAt`
      }
      // Rely on license.expiresAt
    }
  }

  if (license.expiresAt) {
    if (new Date(license.expiresAt) < now) {
      return 'expired';
    }
    return 'active'; // Future expiry date = still active
  }

  // No subscription, no expiry = lifetime
  return 'active';
}

export function getEndsOnDate(subscription) {
  if (subscription && subscription.scheduledChangeAction === 'cancel' && subscription.scheduledChangeEffectiveAt) {
    return subscription.scheduledChangeEffectiveAt;
  }
  return null;
}
