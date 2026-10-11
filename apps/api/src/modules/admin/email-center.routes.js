import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireUser, requireAdmin } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { sendEmail } from '../email/mailer.js';

const SendSchema = z.object({
  recipients: z.array(z.string().trim().email().transform(email => email.toLowerCase())).min(1).max(50),
  subject: z.string().trim().min(1).max(300),
  html: z.string().max(100000).optional().default(''),
  text: z.string().max(100000).optional().default(''),
  replyTo: z.union([z.string().trim().email(), z.literal('')]).optional().default('')
}).refine(message => message.html.trim() || message.text.trim(), {
  message: 'Add an HTML or plain-text email body.'
});

function textFromHtml(html) {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\s*br\s*\/?>|<\/(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default async function adminEmailCenterRoutes(fastify) {
  fastify.get('/v1/admin/email-center/recipients', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const search = String(request.query.search ?? '').trim().slice(0, 100);
    const where = {
      role: 'customer',
      deletedAt: null,
      ...(search ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } }
        ]
      } : {})
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, email: true, name: true, status: true }
      }),
      prisma.user.count({ where })
    ]);

    return reply.status(200).send({ ok: true, customers: users, total, limit: 50 });
  });

  fastify.get('/v1/admin/email-center/messages', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const page = Math.max(1, parseInt(request.query.page, 10) || 1);
    const pageSize = 50;
    const [messages, total] = await Promise.all([
      prisma.emailLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, userId: true, to: true, template: true, subject: true,
          provider: true, providerMessageId: true, status: true, error: true,
          createdAt: true, sentAt: true
        }
      }),
      prisma.emailLog.count()
    ]);

    return reply.status(200).send({ ok: true, messages, total, page, pageSize });
  });

  fastify.get('/v1/admin/email-center/messages/:id', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const message = await prisma.emailLog.findUnique({ where: { id: request.params.id } });
    if (!message) throw new AppError('not_found', 404, 'Email message not found.');

    return reply.status(200).send({
      ok: true,
      message: {
        id: message.id,
        to: message.to,
        subject: message.subject,
        template: message.template,
        provider: message.provider,
        providerMessageId: message.providerMessageId,
        status: message.status,
        error: message.error,
        createdAt: message.createdAt,
        sentAt: message.sentAt,
        html: message.htmlBody,
        text: message.textBody
      }
    });
  });

  fastify.post('/v1/admin/email-center/send', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const message = SendSchema.parse(request.body);
    const recipients = [...new Set(message.recipients)];
    if (recipients.length > 50) throw new AppError('validation_failed', 400, 'Send to no more than 50 recipients at a time.');

    const users = await prisma.user.findMany({
      where: { email: { in: recipients }, role: 'customer', deletedAt: null },
      select: { id: true, email: true }
    });
    const userIdByEmail = new Map(users.map(user => [user.email.toLowerCase(), user.id]));
    const html = message.html.trim();
    const text = message.text.trim() || textFromHtml(html);
    const requestId = crypto.randomUUID();
    const results = [];

    // Send each recipient separately so their addresses are never exposed to one another.
    for (let index = 0; index < recipients.length; index += 1) {
      const to = recipients[index];
      try {
        await sendEmail({
          to,
          userId: userIdByEmail.get(to) ?? null,
          replyTo: message.replyTo || null,
          idempotencyKey: `admin-email:${requestId}:${index}`,
          customContent: { subject: message.subject, html, text }
        });
        results.push({ to, status: 'sent' });
      } catch (error) {
        results.push({ to, status: 'failed', error: error.message });
      }
    }

    const sent = results.filter(result => result.status === 'sent').length;
    const failed = results.length - sent;
    await writeAuditLog({
      actorUserId: request.user.id,
      action: 'email.admin_send',
      targetType: 'email',
      targetId: requestId,
      meta: { subject: message.subject, recipientCount: recipients.length, sent, failed },
      ip: request.ip
    });

    return reply.status(200).send({ ok: failed === 0, sent, failed, results });
  });
}
