import { prisma } from '../db/prisma.js';

export async function writeAuditLog({ actorUserId, actorLabel, action, targetType, targetId, meta = null, ip = null }) {
  await prisma.auditLog.create({
    data: {
      actorUserId: actorUserId ?? null,
      actorLabel: actorLabel ?? `admin:${actorUserId}`,
      action,
      targetType,
      targetId,
      meta,
      ip
    }
  });
}
