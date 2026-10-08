import { PrismaClient } from '@prisma/client';
import argon2 from '@node-rs/argon2';
import dotenv from 'dotenv';
import path from 'path';
import { generateLicenseKey, hashKey, encryptKey } from '../modules/licenses/keygen.js';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const prisma = new PrismaClient();

async function createTestCustomer() {
  const email = 'test@bricksseo.com';
  const password = 'password123';

  const passwordHash = await argon2.hash(password);

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: 'Razeen',
        passwordHash,
        mustChangePassword: false,
      }
    });
    console.log(`Created user: ${email} with password: ${password}`);
  } else {
    await prisma.user.update({
      where: { email },
      data: { passwordHash, mustChangePassword: false }
    });
    console.log(`Updated user: ${email} with password: ${password}`);
  }

  const plan = await prisma.plan.findUnique({ where: { code: 'studio' } });
  if (!plan) {
    console.log('No "studio" plan found — run the main seed script first.');
    await prisma.$disconnect();
    return;
  }

  let license = await prisma.license.findFirst({ where: { userId: user.id } });

  if (!license) {
    const keyRaw = generateLicenseKey();
    const keyHash = hashKey(keyRaw);
    const keyCiphertext = encryptKey(keyRaw);
    const keyHint = `${keyRaw.slice(0, 4)}-${'•'.repeat(4)}-${keyRaw.slice(-4)}`;

    const renewsAt = new Date();
    renewsAt.setFullYear(renewsAt.getFullYear() + 1);

    license = await prisma.license.create({
      data: {
        userId: user.id,
        planCode: plan.code,
        keyHash,
        keyCiphertext,
        keyHint,
        status: 'active',
        siteLimit: plan.siteLimit,
        expiresAt: renewsAt,
        paddleTransactionId: 'txn_test123',
        itemIndex: 0,
        unitIndex: 0
      }
    });

    await prisma.licenseEvent.create({
      data: { licenseId: license.id, type: 'issued', actor: 'system', meta: { seed: true } }
    });

    console.log(`Issued a Studio license for the test account: ${keyRaw}`);

    await prisma.activation.createMany({
      data: [
        {
          licenseId: license.id,
          siteKey: 'clientsite.com',
          siteUrl: 'https://clientsite.com',
          siteName: 'Client Site',
          environment: 'production',
          countsTowardLimit: true,
          pluginVersion: '0.4.1',
          wpVersion: '6.7.1',
          phpVersion: '8.3.6',
          bricksVersion: '1.12.4',
          lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
        },
        {
          licenseId: license.id,
          siteKey: 'studio-demo.dev',
          siteUrl: 'https://studio-demo.dev',
          siteName: 'Studio Demo',
          environment: 'staging',
          countsTowardLimit: true,
          pluginVersion: '0.4.1',
          wpVersion: '6.7.1',
          phpVersion: '8.3.6',
          bricksVersion: '1.12.4',
          lastSeenAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      ]
    });

    await prisma.transaction.create({
      data: {
        paddleTransactionId: 'txn_test123',
        userId: user.id,
        origin: 'web',
        status: 'completed',
        currency: 'USD',
        subtotalMinor: 8900,
        discountMinor: 0,
        taxMinor: 0,
        totalMinor: 8900,
        items: [{ price_id: 'pri_test_studio', quantity: 1, plan_code: 'studio' }],
        billedAt: new Date()
      }
    });
  } else {
    console.log('Test account already has a license — leaving it as is.');
  }

  await prisma.$disconnect();
}

createTestCustomer().catch(console.error);
