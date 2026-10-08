import { prisma } from '../../db/prisma.js';
import { requireUser, requireAdmin } from '../../http/auth.js';
import { effectiveLicenseStatus } from '../licenses/effective-status.js';

const RANGE_WEEKS = { '7d': 1, '30d': 5, '90d': 13, '12w': 12 };

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export default async function adminOverviewRoutes(fastify, opts) {
  fastify.get('/v1/admin/overview', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const [revenueAgg, licenses, subscriptions, activations, customerCount] = await Promise.all([
      prisma.transaction.aggregate({ where: { status: 'completed' }, _sum: { totalMinor: true } }),
      prisma.license.findMany({ select: { status: true, expiresAt: true } }),
      prisma.subscription.findMany({ where: { status: { in: ['active', 'past_due', 'trialing'] } }, select: { unitPriceMinor: true } }),
      prisma.activation.count({ where: { deactivatedAt: null } }),
      prisma.user.count({ where: { role: 'customer' } })
    ]);

    const activeLicenses = licenses.filter(l => effectiveLicenseStatus(l) === 'active').length;
    const mrrMinor = subscriptions.reduce((sum, s) => sum + Math.round(s.unitPriceMinor / 12), 0);

    const since = new Date();
    since.setDate(since.getDate() - 7);
    const newLicensesThisWeek = await prisma.license.count({ where: { issuedAt: { gte: since } } });

    const recentLicenseEvents = await prisma.licenseEvent.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: { license: { include: { user: true } } }
    });

    const recentActivity = recentLicenseEvents.map(e => ({
      id: e.id,
      type: e.type,
      actor: e.actor,
      email: e.license.user.email,
      planCode: e.license.planCode,
      meta: e.meta,
      createdAt: e.createdAt
    }));

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [webhookFailures24h, emailFailures24h, lastEmail] = await Promise.all([
      prisma.webhookEvent.count({ where: { status: 'failed', receivedAt: { gte: since24h } } }),
      prisma.emailLog.count({ where: { status: 'failed', createdAt: { gte: since24h } } }),
      prisma.emailLog.findFirst({ orderBy: { createdAt: 'desc' } })
    ]);

    const topCustomersRaw = await prisma.transaction.groupBy({
      by: ['userId'],
      where: { status: 'completed' },
      _sum: { totalMinor: true },
      orderBy: { _sum: { totalMinor: 'desc' } },
      take: 5
    });

    const topUserIds = topCustomersRaw.map(t => t.userId);
    const topUsers = await prisma.user.findMany({
      where: { id: { in: topUserIds } },
      include: { licenses: { include: { activations: true, plan: true } } }
    });

    const topCustomers = topCustomersRaw.map(t => {
      const user = topUsers.find(u => u.id === t.userId);
      const primaryPlan = user?.licenses?.[0]?.plan?.name ?? '—';
      const sites = user?.licenses?.reduce((n, l) => n + l.activations.filter(a => !a.deactivatedAt).length, 0) ?? 0;
      return {
        email: user?.email ?? 'unknown',
        plan: primaryPlan,
        lifetimeValueMinor: t._sum.totalMinor,
        licenses: user?.licenses?.length ?? 0,
        sites,
        lastActive: user?.lastLoginAt ?? user?.createdAt ?? null
      };
    });

    return reply.status(200).send({
      ok: true,
      revenueAllTimeMinor: revenueAgg._sum.totalMinor ?? 0,
      activeLicenses,
      newLicensesThisWeek,
      activeSites: activations,
      customerCount,
      mrrMinor,
      recentActivity,
      systemHealth: {
        webhookQueue: { failed24h: webhookFailures24h, healthy: webhookFailures24h === 0 },
        emailDelivery: { lastSentAt: lastEmail?.sentAt ?? null, failed24h: emailFailures24h, healthy: emailFailures24h === 0 },
        database: { healthy: true }
      },
      topCustomers
    });
  });

  fastify.get('/v1/admin/overview/chart', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const range = ['7d', '30d', '90d', '12w'].includes(request.query.range) ? request.query.range : '12w';
    const weeks = RANGE_WEEKS[range];

    const since = startOfWeek(new Date());
    since.setDate(since.getDate() - weeks * 7);

    const licenses = await prisma.license.findMany({
      where: { issuedAt: { gte: since } },
      select: { issuedAt: true }
    });

    const buckets = new Map();
    for (let i = 0; i <= weeks; i++) {
      const weekStart = startOfWeek(new Date());
      weekStart.setDate(weekStart.getDate() - (weeks - i) * 7);
      buckets.set(weekStart.toISOString().slice(0, 10), 0);
    }

    for (const l of licenses) {
      const weekStart = startOfWeek(l.issuedAt).toISOString().slice(0, 10);
      if (buckets.has(weekStart)) buckets.set(weekStart, buckets.get(weekStart) + 1);
    }

    const points = Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));

    return reply.status(200).send({ ok: true, range, points });
  });
}
