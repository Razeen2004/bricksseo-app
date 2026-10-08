import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import { AppError } from '../lib/errors.js';

export async function requireUser(request, reply) {
  const token = request.cookies['__Host-bsid'];
  if (!token) throw new AppError('unauthenticated', 401, 'Not logged in');

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!session || session.revokedAt || new Date(session.idleExpiresAt) < new Date() || new Date(session.absoluteExpiresAt) < new Date()) {
    if (session && (!session.revokedAt)) {
      await prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() }
      });
    }
    reply.clearCookie('__Host-bsid', { path: '/', secure: true, httpOnly: true, sameSite: 'Lax' });
    throw new AppError('unauthenticated', 401, 'Session expired');
  }

  // Update idle expiry in background (simplified here)
  request.session = session;
  request.user = session.user;
}

export async function requireAdmin(request, reply) {
  if (request.user.role !== 'admin') {
    throw new AppError('forbidden', 403, 'Admin access required');
  }
}
