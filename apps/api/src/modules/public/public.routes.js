import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';

export default async function publicRoutes(fastify) {
  fastify.get('/v1/public/checkout-config', async () => {
    const prices = await prisma.planPrice.findMany({
      where: { environment: env.PADDLE_ENV, active: true, plan: { active: true } },
      include: { plan: true },
      orderBy: { plan: { sort: 'asc' } }
    });

    return {
      environment: env.PADDLE_ENV,
      clientToken: env.PADDLE_CLIENT_TOKEN || null,
      successUrl: `${env.MARKETING_URL}/thank-you`,
      plans: prices.map((p) => ({
        code: p.plan.code,
        name: p.plan.name,
        siteLimit: p.plan.siteLimit,
        interval: p.plan.interval,
        priceId: p.paddlePriceId
      }))
    };
  });
}
