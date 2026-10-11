import { prisma } from '../db/prisma.js';
import { getSettingSection } from '../lib/settings.js';
import { env } from '../config/env.js';
import { getQueue } from './queue.js';

function utcDayOffset(now, days) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

async function enqueueNotice(queue, license, template, stage) {
  const idempotencyKey = `license-expiry:${license.id}:${stage}:${license.expiresAt.toISOString()}`;
  const prior = await prisma.emailLog.findFirst({ where: { idempotencyKey, status: 'sent' }, select: { id: true } });
  if (prior) return false;

  await queue.send('email.send', {
    to: license.user.email,
    userId: license.userId,
    template,
    idempotencyKey,
    data: {
      planName: license.plan.name,
      expiresAt: license.expiresAt.toISOString(),
      renewalUrl: `${env.APP_URL}/billing`,
      daysRemaining: stage === '7_days' ? 7 : stage === '1_day' ? 1 : 0
    }
  }, { singletonKey: idempotencyKey, singletonSeconds: 36 * 60 * 60 });
  return true;
}

async function hasRenewedPastExpiry(license) {
  if (!license.paddleSubscriptionId) return false;
  const subscription = await prisma.subscription.findUnique({
    where: { paddleSubscriptionId: license.paddleSubscriptionId },
    select: { currentPeriodEnd: true }
  });
  return Boolean(subscription && subscription.currentPeriodEnd > license.expiresAt);
}

export async function processLicenseExpiryScan(now = new Date()) {
  const notificationSettings = await getSettingSection('notifications', { customerEmails: { licenseExpiryReminder: true } });
  if (notificationSettings.customerEmails?.licenseExpiryReminder === false) return { scanned: 0, queued: 0 };

  const startToday = utcDayOffset(now, 0);
  const startTomorrow = utcDayOffset(now, 1);
  const startInSevenDays = utcDayOffset(now, 7);
  const startInEightDays = utcDayOffset(now, 8);
  const queue = await getQueue();
  let scanned = 0;
  let queued = 0;

  const dueWindows = [
    { start: startInSevenDays, end: startInEightDays, template: 'license_expiry_7d', stage: '7_days' },
    { start: startTomorrow, end: utcDayOffset(now, 2), template: 'license_expiry_1d', stage: '1_day' }
  ];

  for (const window of dueWindows) {
    const licenses = await prisma.license.findMany({
      where: { status: 'active', expiresAt: { gte: window.start, lt: window.end } },
      include: { user: { select: { id: true, email: true, status: true } }, plan: { select: { name: true } } }
    });
    scanned += licenses.length;
    for (const license of licenses) {
      if (license.user.status !== 'active') continue;
      if (await hasRenewedPastExpiry(license)) continue;
      if (await enqueueNotice(queue, license, window.template, window.stage)) queued += 1;
    }
  }

  const expiredLicenses = await prisma.license.findMany({
    where: { status: { in: ['active', 'expired'] }, expiresAt: { lt: now } },
    include: { user: { select: { id: true, email: true, status: true } }, plan: { select: { name: true } } }
  });
  scanned += expiredLicenses.length;
  for (const license of expiredLicenses) {
    if (license.user.status !== 'active') continue;
    // A newer Paddle period means the customer renewed; do not send a stale expiry notice.
    if (await hasRenewedPastExpiry(license)) continue;
    if (await enqueueNotice(queue, license, 'license_expired', 'expired')) queued += 1;
  }

  return { scanned, queued };
}
