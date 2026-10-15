import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import nodemailer from 'nodemailer';
import { getEffectiveTemplate, buildTemplateVars, renderAll } from './templates.js';
import { getSettingSection } from '../../lib/settings.js';
import { decryptValue } from '../licenses/keygen.js';

const DEFAULT_SMTP = { host: '', port: 587, username: '', password: '', fromName: '', fromAddress: '' };
const DEFAULT_RESEND = { apiKeyCiphertext: null, fromName: '', fromAddress: '' };

// The provider actually used each send. Configuration lives in Settings →
// Integrations (the DB), not the environment — "env" is kept only as a legacy
// escape hatch for anyone who still sets EMAIL_PROVIDER, and falls back to
// "resend" (the real default) if that env var was never set either.
async function resolveProvider() {
  const { provider } = await getSettingSection('email', { provider: 'resend' });
  if (provider === 'env') return env.EMAIL_PROVIDER || 'resend';
  return provider;
}

export async function sendEmail({ to, template, data, idempotencyKey, userId = null, replyTo = null, customContent = null }) {
  // 1. Render a template or use an administrator-composed message.
  let subject, text, html;
  if (customContent) {
    ({ subject, text, html } = customContent);
  } else {
    const tpl = await getEffectiveTemplate(template);
    const vars = await buildTemplateVars(template, data);
    ({ subject, text, html } = renderAll(tpl, vars));
  }
  const logTemplate = customContent ? 'admin_custom' : template;

  const provider = await resolveProvider();

  // 2. Insert into email_log
  const log = await prisma.emailLog.create({
    data: {
      userId,
      to,
      template: logTemplate,
      subject,
      ...(customContent ? { htmlBody: html, textBody: text } : {}),
      provider,
      idempotencyKey,
      status: 'queued'
    }
  });

  try {
    // 3. Send via whichever provider is active
    if (provider === 'smtp') {
      const smtp = await getSettingSection('smtp', DEFAULT_SMTP);
      if (!smtp.host) {
        throw new Error('SMTP is selected as the email provider, but no SMTP host is configured in Settings → Integrations.');
      }

      const port = Number(smtp.port) || 587;
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port,
        secure: port === 465,
        auth: smtp.username ? { user: smtp.username, pass: smtp.password } : undefined
      });

      const fromAddress = smtp.fromAddress || env.EMAIL_FROM;
      const info = await transporter.sendMail({
        from: smtp.fromName ? `"${smtp.fromName}" <${fromAddress}>` : fromAddress,
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
    } else if (provider === 'resend') {
      const resend = await getSettingSection('resend', DEFAULT_RESEND);
      const apiKey = resend.apiKeyCiphertext ? decryptValue(resend.apiKeyCiphertext) : env.RESEND_API_KEY;
      const fromAddress = resend.fromAddress || env.EMAIL_FROM;
      if (!apiKey) {
        throw new Error('Resend is selected as the email provider, but no Resend API key is configured in Settings → Integrations.');
      }
      if (!fromAddress) {
        throw new Error('Resend is selected as the email provider, but no "from" address is configured in Settings → Integrations.');
      }
      const from = resend.fromName ? `${resend.fromName} <${fromAddress}>` : fromAddress;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
        },
        body: JSON.stringify({
          from,
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
      throw new Error(`Email provider "${provider}" is not implemented`);
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
