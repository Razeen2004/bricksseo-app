import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import nodemailer from 'nodemailer';
import { getEffectiveTemplate, buildTemplateVars, renderAll } from './templates.js';

export async function sendEmail({ to, template, data, idempotencyKey, userId = null, replyTo = null }) {
  // 1. Render template (admin-edited copy if one exists, else the built-in default)
  const tpl = await getEffectiveTemplate(template);
  const vars = buildTemplateVars(template, data);
  const { subject, text, html } = renderAll(tpl, vars);

  // 2. Insert into email_log
  const log = await prisma.emailLog.create({
    data: {
      userId,
      to,
      template,
      subject,
      provider: env.EMAIL_PROVIDER,
      idempotencyKey,
      status: 'queued'
    }
  });

  try {
    // 3. Send email via SMTP (Mailpit locally, or others in Prod)
    if (env.EMAIL_PROVIDER === 'smtp') {
      const transporter = nodemailer.createTransport({
        host: 'localhost',
        port: 1025, // Mailpit default SMTP
        secure: false,
        ignoreTLS: true,
      });

      const info = await transporter.sendMail({
        from: env.EMAIL_FROM,
        to,
        replyTo: replyTo || undefined,
        subject,
        text,
        html
      });

      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          providerMessageId: info.messageId
        }
      });
    } else if (env.EMAIL_PROVIDER === 'resend') {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [to],
          reply_to: replyTo || undefined,
          subject,
          text,
          html
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || `Resend API error (${response.status})`);
      }

      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          providerMessageId: result.id
        }
      });
    } else {
      // Postmark not implemented yet.
      throw new Error(`Email provider "${env.EMAIL_PROVIDER}" is not implemented`);
    }
  } catch (err) {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: 'failed',
        error: err.message
      }
    });
    throw err;
  }
}
