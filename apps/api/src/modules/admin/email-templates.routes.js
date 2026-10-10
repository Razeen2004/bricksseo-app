import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireUser, requireAdmin } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { sendEmail } from '../email/mailer.js';
import {
  TEMPLATE_KEYS,
  TEMPLATE_INFO,
  TEMPLATE_SAMPLE_DATA,
  getEffectiveTemplate,
  buildTemplateVars,
  renderAll,
  varsLegend,
  findUnknownPlaceholders
} from '../email/templates.js';

function requireKnownKey(key) {
  if (!TEMPLATE_KEYS.includes(key)) {
    throw new AppError('not_found', 404, 'Unknown email template');
  }
}

const SaveSchema = z.object({
  subject: z.string().trim().min(1).max(300),
  html: z.string().trim().min(1).max(50000),
  text: z.string().trim().min(1).max(50000)
});

export default async function adminEmailTemplatesRoutes(fastify, opts) {
  fastify.get('/v1/admin/email-templates', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    const rows = await prisma.emailTemplate.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));

    const templates = await Promise.all(
      TEMPLATE_KEYS.map(async (key) => {
        const tpl = await getEffectiveTemplate(key);
        const row = byKey.get(key);
        return {
          key,
          label: TEMPLATE_INFO[key].label,
          description: TEMPLATE_INFO[key].description,
          subject: tpl.subject,
          isCustom: !!row,
          updatedAt: row?.updatedAt ?? null
        };
      })
    );

    return reply.status(200).send({ ok: true, templates });
  });

  fastify.get('/v1/admin/email-templates/:key', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    requireKnownKey(request.params.key);
    const key = request.params.key;

    const tpl = await getEffectiveTemplate(key);
    const sampleVars = await buildTemplateVars(key, TEMPLATE_SAMPLE_DATA[key]);
    const preview = renderAll(tpl, sampleVars);

    return reply.status(200).send({
      ok: true,
      key,
      label: TEMPLATE_INFO[key].label,
      description: TEMPLATE_INFO[key].description,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      isCustom: tpl.isCustom,
      updatedAt: tpl.updatedAt,
      vars: await varsLegend(key),
      preview
    });
  });

  fastify.post('/v1/admin/email-templates/:key/preview', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    requireKnownKey(request.params.key);
    const key = request.params.key;
    const draft = SaveSchema.parse(request.body);

    const sampleVars = await buildTemplateVars(key, TEMPLATE_SAMPLE_DATA[key]);
    const preview = renderAll(draft, sampleVars);

    return reply.status(200).send({ ok: true, preview });
  });

  fastify.put('/v1/admin/email-templates/:key', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    requireKnownKey(request.params.key);
    const key = request.params.key;
    const values = SaveSchema.parse(request.body);

    const unknown = await findUnknownPlaceholders(key, values);
    if (unknown.length > 0) {
      throw new AppError(
        'unknown_placeholder',
        400,
        `Unknown placeholder${unknown.length > 1 ? 's' : ''}: ${unknown.map((u) => `{{${u}}}`).join(', ')}`
      );
    }

    await prisma.emailTemplate.upsert({
      where: { key },
      create: { key, ...values, updatedBy: request.user.id },
      update: { ...values, updatedBy: request.user.id }
    });

    await writeAuditLog({
      actorUserId: request.user.id,
      action: 'email_template.update',
      targetType: 'email_template',
      targetId: key,
      ip: request.ip
    });

    const tpl = await getEffectiveTemplate(key);
    const sampleVars = await buildTemplateVars(key, TEMPLATE_SAMPLE_DATA[key]);
    const preview = renderAll(tpl, sampleVars);

    return reply.status(200).send({ ok: true, updatedAt: tpl.updatedAt, preview });
  });

  fastify.post('/v1/admin/email-templates/:key/reset', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    requireKnownKey(request.params.key);
    const key = request.params.key;

    await prisma.emailTemplate.deleteMany({ where: { key } });

    await writeAuditLog({
      actorUserId: request.user.id,
      action: 'email_template.reset',
      targetType: 'email_template',
      targetId: key,
      ip: request.ip
    });

    const tpl = await getEffectiveTemplate(key);
    return reply.status(200).send({ ok: true, subject: tpl.subject, html: tpl.html, text: tpl.text });
  });

  fastify.post('/v1/admin/email-templates/:key/test', { preHandler: [requireUser, requireAdmin] }, async (request, reply) => {
    requireKnownKey(request.params.key);
    const key = request.params.key;

    await sendEmail({
      to: request.user.email,
      template: key,
      userId: request.user.id,
      data: TEMPLATE_SAMPLE_DATA[key],
      idempotencyKey: `template-test:${key}:${request.user.id}:${Date.now()}`
    });

    return reply.status(200).send({ ok: true });
  });
}
