import { z } from 'zod';
import argon2 from '@node-rs/argon2';
import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../lib/errors.js';
import { sendEmail } from '../email/mailer.js';
import { requireUser } from '../../http/auth.js';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const ForgotSchema = z.object({
  email: z.string().email()
});

const PasswordSchema = z.string().min(8).regex(/[A-Z]/, 'Must contain an uppercase letter').regex(/[0-9]/, 'Must contain a number');

const ResetSchema = z.object({
  token: z.string().min(1),
  password: PasswordSchema
});

const ChangePasswordSchema = z.object({
  password: PasswordSchema
});

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function issuePasswordResetToken(user, ip = null) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.authToken.create({
    data: { userId: user.id, purpose: 'password_reset', tokenHash, expiresAt, ip }
  });

  await sendEmail({
    to: user.email,
    template: 'password_reset',
    userId: user.id,
    data: { token },
    idempotencyKey: `password_reset:${user.id}:${tokenHash}`
  });
}

export default async function authRoutes(fastify, opts) {
  fastify.post('/v1/auth/login', async (request, reply) => {
    const { email, password } = LoginSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user || user.status !== 'active') {
      throw new AppError('invalid_credentials', 401, 'Invalid email or password');
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      throw new AppError('account_locked', 423, 'Account temporarily locked. Please try again later.');
    }

    const isValid = await argon2.verify(user.passwordHash, password);

    if (!isValid) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: { increment: 1 },
          lockedUntil: user.failedLoginCount >= 4 ? new Date(Date.now() + 15 * 60 * 1000) : null
        }
      });
      throw new AppError('invalid_credentials', 401, 'Invalid email or password');
    }

    // Success
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const idleExpiresAt = new Date();
    idleExpiresAt.setDate(idleExpiresAt.getDate() + 7);
    
    const absoluteExpiresAt = new Date();
    absoluteExpiresAt.setDate(absoluteExpiresAt.getDate() + 30);

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        ip: request.headers['x-forwarded-for'] || request.ip,
        userAgent: request.headers['user-agent'],
        idleExpiresAt,
        absoluteExpiresAt,
        passwordChangeRequired: user.mustChangePassword
      }
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }
    });

    reply.setCookie('__Host-bsid', token, {
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });

    return reply.status(200).send({ 
      ok: true, 
      mustChangePassword: user.mustChangePassword 
    });
  });

  fastify.post('/v1/auth/logout', async (request, reply) => {
    const token = request.cookies['__Host-bsid'];
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await prisma.session.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }
    reply.clearCookie('__Host-bsid', { path: '/', secure: true, httpOnly: true, sameSite: 'Lax' });
    return reply.status(204).send();
  });

  fastify.post('/v1/auth/forgot', async (request, reply) => {
    const { email } = ForgotSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (user && user.status === 'active') {
      await issuePasswordResetToken(user, request.headers['x-forwarded-for'] || request.ip);
    }

    // Always the same response — no account enumeration.
    return reply.status(200).send({ ok: true, message: 'If that email exists, a reset link is on its way.' });
  });

  fastify.post('/v1/auth/reset', async (request, reply) => {
    const { token, password } = ResetSchema.parse(request.body);
    const tokenHash = hashToken(token);

    const authToken = await prisma.authToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (!authToken || authToken.purpose !== 'password_reset' || authToken.usedAt || new Date(authToken.expiresAt) < new Date()) {
      throw new AppError('invalid_token', 400, 'This reset link is invalid or has expired.');
    }

    const passwordHash = await argon2.hash(password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: authToken.userId },
        data: { passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null }
      }),
      prisma.authToken.update({
        where: { id: authToken.id },
        data: { usedAt: new Date() }
      }),
      prisma.session.updateMany({
        where: { userId: authToken.userId, revokedAt: null },
        data: { revokedAt: new Date() }
      })
    ]);

    return reply.status(200).send({ ok: true });
  });

  fastify.post('/v1/auth/change-password', { preHandler: [requireUser] }, async (request, reply) => {
    const { password } = ChangePasswordSchema.parse(request.body);
    const passwordHash = await argon2.hash(password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: request.user.id },
        data: { passwordHash, mustChangePassword: false }
      }),
      prisma.session.update({
        where: { id: request.session.id },
        data: { passwordChangeRequired: false }
      })
    ]);

    return reply.status(200).send({ ok: true });
  });
}
