import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
// fallback if ran directly from apps/api
dotenv.config();

const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding plans and plan_prices...');

  // Upsert Plans
  const plans = [
    { code: 'solo', name: 'Solo', siteLimit: 1, interval: 'year', sort: 10, active: true },
    { code: 'studio', name: 'Studio', siteLimit: 5, interval: 'year', sort: 20, active: true },
    { code: 'agency', name: 'Agency', siteLimit: null, interval: 'year', sort: 30, active: true },
    { code: 'lifetime', name: 'Lifetime', siteLimit: null, interval: 'lifetime', sort: 40, active: true }
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan,
    });
  }

  // Upsert Sandbox Prices
  const prices = [
    { paddlePriceId: 'pri_01j95w', planCode: 'solo', environment: 'sandbox', paddleProductId: 'pro_1', active: true },
    { paddlePriceId: 'pri_01j95x', planCode: 'studio', environment: 'sandbox', paddleProductId: 'pro_2', active: true },
    { paddlePriceId: 'pri_01j95y', planCode: 'agency', environment: 'sandbox', paddleProductId: 'pro_3', active: true },
    { paddlePriceId: 'pri_01m4ddea2vr6yjn0zen7ee1kgy', planCode: 'lifetime', environment: 'sandbox', paddleProductId: 'pro_4', active: true }
  ];

  for (const price of prices) {
    await prisma.planPrice.upsert({
      where: { paddlePriceId: price.paddlePriceId },
      update: price,
      create: price,
    });
  }

  console.log('Seeding complete.');
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
