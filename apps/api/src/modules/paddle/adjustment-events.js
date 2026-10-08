import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { paddleClient } from './client.js';
import { writeAuditLog } from '../../lib/audit.js';

function adjustmentTotalMinor(data) {
  if (data.total) return parseInt(data.total, 10);
  if (Array.isArray(data.items)) {
    return data.items.reduce((sum, item) => sum + parseInt(item.totals?.total ?? '0', 10), 0);
  }
  return 0;
}

export async function processAdjustmentEvent(payload) {
  const adj = payload.data;

  const transaction = await prisma.transaction.findUnique({ where: { paddleTransactionId: adj.transaction_id } });
  if (!transaction) {
    throw new Error(`No transaction found for adjustment ${adj.id} (txn ${adj.transaction_id}) — will retry`);
  }

  const totalMinor = adjustmentTotalMinor(adj);
  const fullRefund = totalMinor >= transaction.totalMinor;

  await prisma.adjustment.upsert({
    where: { paddleAdjustmentId: adj.id },
    create: {
      paddleAdjustmentId: adj.id,
      paddleTransactionId: adj.transaction_id,
      action: adj.action,
      status: adj.status,
      totalMinor,
      currency: adj.currency_code ?? transaction.currency,
      reason: adj.reason ?? '',
      fullRefund
    },
    update: {
      status: adj.status,
      totalMinor,
      fullRefund
    }
  });

  const isChargeback = adj.action === 'chargeback';
  const isApprovedFullRefund = adj.action === 'refund' && adj.status === 'approved' && fullRefund;

  if (!isChargeback && !isApprovedFullRefund) {
    if (adj.action === 'refund' && adj.status === 'approved' && !fullRefund) {
      await writeAuditLog({
        actorUserId: null,
        actorLabel: 'paddle',
        action: 'adjustment.partial_refund',
        targetType: 'transaction',
        targetId: transaction.paddleTransactionId,
        meta: { adjustmentId: adj.id, totalMinor }
      });
    }
    return;
  }

  const licenses = await prisma.license.findMany({
    where: { paddleTransactionId: transaction.paddleTransactionId, status: { not: 'revoked' } }
  });

  await prisma.$transaction(async (tx) => {
    for (const license of licenses) {
      await tx.license.update({
        where: { id: license.id },
        data: { status: 'revoked', statusReason: isChargeback ? 'chargeback' : 'refunded' }
      });
      await tx.activation.updateMany({
        where: { licenseId: license.id, deactivatedAt: null },
        data: { deactivatedAt: new Date(), deactivatedBy: 'system_revoked' }
      });
      await tx.licenseEvent.create({
        data: {
          licenseId: license.id,
          type: 'revoked',
          actor: 'paddle',
          meta: { adjustmentId: adj.id, reason: isChargeback ? 'chargeback' : 'refunded' }
        }
      });
    }

    if (isChargeback) {
      await tx.user.update({ where: { id: transaction.userId }, data: { flagged: true } });
    }
  });

  await writeAuditLog({
    actorUserId: null,
    actorLabel: 'paddle',
    action: isChargeback ? 'adjustment.chargeback' : 'adjustment.full_refund',
    targetType: 'transaction',
    targetId: transaction.paddleTransactionId,
    meta: { adjustmentId: adj.id, licenseIds: licenses.map(l => l.id) }
  });

  if (env.AUTO_CANCEL_SUBSCRIPTION_ON_REFUND && transaction.paddleSubscriptionId) {
    try {
      await paddleClient.cancelSubscription(transaction.paddleSubscriptionId, 'immediately');
    } catch (err) {
      await writeAuditLog({
        actorUserId: null,
        actorLabel: 'system',
        action: 'adjustment.auto_cancel_failed',
        targetType: 'subscription',
        targetId: transaction.paddleSubscriptionId,
        meta: { error: err.message }
      });
    }
  }
}
