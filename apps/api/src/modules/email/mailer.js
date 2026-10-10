import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import nodemailer from 'nodemailer';
import { getEffectiveTemplate, buildTemplateVars, renderAll } from './templates.js';
import { getSettingSection } from '../../lib/settings.js';

const DEFAULT_SMTP = { host: '', port: 587, username: '', password: '', fromName: '', fromAddress: '' };

// The provider actually used each send: an admin can override the env var's
// default live from Settings → Integrations, without a redeploy. "env" means
// "use whatever EMAIL_PROVIDER is set to in the environment" (the default,
// so existing deployments are unaffected until someone opts into an override).
async function resolveProvider() {
  const { provider } = await getSettingSection('email', { provider: 'env' });
  return provider === 'env' ? env.EMAIL_PROVIDER : provider;
}

export async function sendEmail({ to, template, data, idempotencyKey, userId = null, replyTo = null }) {
  // 1. Render template (admin-edited copy if one exists, else the built-in default)
  const tpl = await getEffectiveTemplate(template);
  const vars = await buildTemplateVars(template, data);
  const { subject, text, html } = renderAll(tpl, vars);

  const provider = await resolveProvider();

  // 2. Insert into email_log
  const log = await prisma.emailLog.create({
    data: {
      userId,
      to,
      template,
      subject,
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
