import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { paddleClient } from './client.js';
import { generateLicenseKey, hashKey, encryptKey } from '../licenses/keygen.js';
import { recomputeLicensesForSubscription } from './recompute.js';
import { getQueue } from '../../jobs/queue.js';
import crypto from 'crypto';
import argon2 from '@node-rs/argon2';

function randomString(length) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let str = '';
  for(let i=0; i<length; i++) {
    str += chars[crypto.randomInt(0, chars.length)];
  }
  return str;
}

export async function processTransactionCompleted(payload) {
  const txn = payload.data;
  
  // 1. Map items
  const planPrices = await prisma.planPrice.findMany({
    where: { environment: env.PADDLE_ENV }
  });
  
  const mappedItems = [];
  for (const item of txn.items) {
    const price = planPrices.find(p => p.paddlePriceId === item.price.id);
    if (!price) {
      console.error(`Unknown price id: ${item.price.id}`);
      return; // Could throw or alert admin
    }
    mappedItems.push({ ...item, planCode: price.planCode });
  }

  // 2. Customer
  let email, name;
  const paddleCustomer = await paddleClient.getCustomer(txn.customer_id);
  email = paddleCustomer.email.toLowerCase();
  name = paddleCustomer.name || '';

  // 3. BEGIN TX (Using Prisma interactive transaction)
  let user = await prisma.user.findUnique({ where: { email } });
  let isNewUser = false;
  let tempPasswordRaw = null;

  await prisma.$transaction(async (tx) => {
    // a. Upsert User
    if (user) {
      if (!user.paddleCustomerId) {
        user = await tx.user.update({
          where: { id: user.id },
          data: { paddleCustomerId: txn.customer_id }
        });
      }
    } else {
      isNewUser = true;
      tempPasswordRaw = `${randomString(4)}-${randomString(4)}-${randomString(4)}-${randomString(4)}`;
      const passwordHash = await argon2.hash(tempPasswordRaw);
      
      const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(env.APP_ENCRYPTION_KEYS.split(',')[0].split(':')[1], 'base64'), crypto.randomBytes(12));
      let tempPasswordCiphertext = cipher.update(tempPasswordRaw, 'utf8', 'base64');
      tempPasswordCiphertext += cipher.final('base64');
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      user = await tx.user.create({
        data: {
          email,
          name,
          paddleCustomerId: txn.customer_id,
          passwordHash,
          mustChangePassword: true,
          tempPasswordCiphertext,
          tempPasswordExpiresAt: expiresAt
        }
      });
    }

    // b. Upsert transaction
    await tx.transaction.upsert({
      where: { paddleTransactionId: txn.id },
      create: {
        paddleTransactionId: txn.id,
        userId: user.id,
        paddleSubscriptionId: txn.subscription_id,
        origin: txn.origin || 'web',
        status: txn.status,
        currency: txn.currency_code,
        subtotalMinor: parseInt(txn.details.totals.subtotal, 10),
        discountMinor: parseInt(txn.details.totals.discount, 10),
        taxMinor: parseInt(txn.details.totals.tax, 10),
        totalMinor: parseInt(txn.details.totals.total, 10),
        items: txn.items,
        billedAt: new Date(txn.billed_at || txn.created_at || Date.now())
      },
      update: {
        status: txn.status
      }
    });

    // c. Issue licenses
    const generatedKeys = [];
    if (txn.subscription_id) {
      const existing = await tx.license.findFirst({
        where: { paddleSubscriptionId: txn.subscription_id }
      });
      if (existing) {
        await recomputeLicensesForSubscription(tx, txn.subscription_id);
        return;
      }
    }

    for (let itemIdx = 0; itemIdx < mappedItems.length; itemIdx++) {
      const item = mappedItems[itemIdx];
      const plan = await tx.plan.findUnique({ where: { code: item.planCode } });
      
      for (let unitIdx = 0; unitIdx < item.quantity; unitIdx++) {
        const keyRaw = generateLicenseKey();
        
        const keyHash = hashKey(keyRaw);
        const keyCiphertext = encryptKey(keyRaw);
        const keyHint = keyRaw.substring(0, 8) + '...' + keyRaw.substring(keyRaw.length - 4);
        
        let expiresAt = null;
        if (plan.interval === 'year' && txn.billing_period) {
          expiresAt = new Date(txn.billing_period.ends_at);
        }

        const license = await tx.license.upsert({
          where: {
            paddleTransactionId_itemIndex_unitIndex: {
              paddleTransactionId: txn.id,
              itemIndex: itemIdx,
              unitIndex: unitIdx
            }
          },
          create: {
            userId: user.id,
            planCode: plan.code,
            keyHash,
            keyCiphertext,
            keyHint,
            siteLimit: plan.siteLimit,
            expiresAt,
            paddleSubscriptionId: txn.subscription_id,
            paddleTransactionId: txn.id,
            itemIndex: itemIdx,
            unitIndex: unitIdx
          },
          update: {} // Idempotent
        });

        await tx.licenseEvent.create({
          data: {
            licenseId: license.id,
            type: 'issued',
            actor: 'paddle',
            meta: { paddleTransactionId: txn.id }
          }
        });

        generatedKeys.push({ key: keyRaw, plan: plan.name });
      }
    }

    // 4. Enqueue email job
    if (generatedKeys.length > 0) {
      const queue = await getQueue();
      await queue.send('email.send', {
        to: email,
        template: isNewUser ? 'welcome' : 'new_license',
        userId: user.id,
        data: {
          email,
          tempPassword: tempPasswordRaw,
          licenseKey: generatedKeys[0].key,
          licenseKeys: generatedKeys
        },
        idempotencyKey: `fulfil:${txn.id}`
      }, { singletonKey: `email:fulfil:${txn.id}` });
    }
  });
}
