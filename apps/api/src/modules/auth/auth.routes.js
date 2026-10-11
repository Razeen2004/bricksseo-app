import { z } from 'zod';
import argon2 from '@node-rs/argon2';
import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../lib/errors.js';
import { sendEmail } from '../email/mailer.js';
import { requireUser } from '../../http/auth.js';
import { getSettingSection } from '../../lib/settings.js';
import { decryptValue } from '../licenses/keygen.js';
import { hashRecoveryCode, verifyTotp } from '../../lib/totp.js';

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

async function createSession(user, request, reply) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const idleExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const absoluteExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({
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
    path: '/', secure: true, httpOnly: true, sameSite: 'Lax', maxAge: 30 * 24 * 60 * 60
  });
  return reply.status(200).send({ ok: true, mustChangePassword: user.mustChangePassword });
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

    const security = await getSettingSection('store', { require2fa: false });
    if (user.role === 'admin' && security.require2fa) {
      if (!user.totpEnabledAt || !user.totpSecretCiphertext) {
        throw new AppError('admin_2fa_not_enrolled', 403, 'Two-factor authentication is required for this administrator. Contact another administrator to complete enrollment.');
      }
      const challengeToken = crypto.randomBytes(32).toString('hex');
      await prisma.authToken.create({
        data: {
          userId: user.id,
          purpose: 'admin_2fa_login',
          tokenHash: hashToken(challengeToken),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          ip: request.headers['x-forwarded-for'] || request.ip
        }
      });
      return reply.status(200).send({ ok: true, requiresTwoFactor: true, challengeToken });
    }

    return createSession(user, request, reply);
  });

  fastify.post('/v1/auth/login/2fa', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { challengeToken, code } = z.object({ challengeToken: z.string().min(1), code: z.string().min(1).max(32) }).parse(request.body);
    const challenge = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(challengeToken) }, include: { user: true } });
    if (!challenge || challenge.purpose !== 'admin_2fa_login' || challenge.usedAt || challenge.expiresAt < new Date() || challenge.user.status !== 'active' || challenge.user.role !== 'admin' || (challenge.user.lockedUntil && challenge.user.lockedUntil > new Date()) || !challenge.user.totpEnabledAt || !challenge.user.totpSecretCiphertext) {
      throw new AppError('invalid_2fa_challenge', 401, 'Your verification session has expired. Sign in again.');
    }

    const user = challenge.user;
    const secret = decryptValue(user.totpSecretCiphertext);
    const validTotp = verifyTotp(secret, code);
    let remainingRecoveryHashes = Array.isArray(user.recoveryCodesHash) ? user.recoveryCodesHash : [];
    let validRecovery = false;
    if (!validTotp) {
      const codeHash = hashRecoveryCode(code);
      const index = remainingRecoveryHashes.indexOf(codeHash);
      if (index >= 0) {
        remainingRecoveryHashes = remainingRecoveryHashes.filter((_, i) => i !== index);
        validRecovery = true;
      }
    }
    if (!validTotp && !validRecovery) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: { increment: 1 },
          ...(user.failedLoginCount >= 4 ? { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } : {})
        }
      });
      throw new AppError('invalid_2fa_code', 401, 'The authenticator code or recovery code is invalid.');
    }

    await prisma.$transaction(async (tx) => {
      const consumed = await tx.authToken.updateMany({ where: { id: challenge.id, usedAt: null }, data: { usedAt: new Date() } });
      if (consumed.count !== 1) throw new AppError('invalid_2fa_challenge', 401, 'This verification session has already been used. Sign in again.');
      if (validRecovery) {
        const recoveryUpdate = await tx.user.updateMany({
          where: { id: user.id, recoveryCodesHash: { equals: user.recoveryCodesHash } },
          data: { recoveryCodesHash: remainingRecoveryHashes }
        });
        if (recoveryUpdate.count !== 1) throw new AppError('invalid_2fa_code', 401, 'That recovery code has already been used.');
      }
    });
    return createSession(user, request, reply);
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
