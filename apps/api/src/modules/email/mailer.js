import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import nodemailer from 'nodemailer';

// Simplified Mailer logic
export async function sendEmail({ to, template, data, idempotencyKey, userId = null, replyTo = null }) {
  // 1. Render template (simplified)
  let subject = '';
  let text = '';
  let html = '';

  const keys = data.licenseKeys?.length ? data.licenseKeys : data.licenseKey ? [{ key: data.licenseKey }] : [];
  const keysText = keys.map((k) => `${k.plan ? `${k.plan}: ` : ''}${k.key}`).join('\n');
  const keysHtml = keys
    .map((k) => `<p style="margin:4px 0">${k.plan ? `${k.plan}: ` : ''}<code style="font-size:15px"><strong>${k.key}</strong></code></p>`)
    .join('');
  const plural = keys.length > 1 ? 's' : '';

  if (template === 'welcome') {
    subject = 'Welcome to Bricks SEO - Your account and license key';
    text = `Hello,\n\nThanks for your purchase. Your Bricks SEO account is ready.\n\nLog in: ${env.APP_URL}/login\nEmail: ${data.email}\nTemporary password: ${data.tempPassword}\n\nYou will be asked to choose a new password the first time you log in.\n\nYour license key${plural}:\n${keysText}\n\nPaste the key into Bricks SEO > License in your WordPress admin to activate it.`;
    html = `<p>Hello,</p><p>Thanks for your purchase. Your Bricks SEO account is ready.</p><p><a href="${env.APP_URL}/login">Log in to your dashboard</a></p><p>Email: <strong>${data.email}</strong><br>Temporary password: <code><strong>${data.tempPassword}</strong></code></p><p>You will be asked to choose a new password the first time you log in.</p><p>Your license key${plural}:</p>${keysHtml}<p>Paste the key into Bricks SEO &gt; License in your WordPress admin to activate it.</p>`;
  } else if (template === 'new_license') {
    subject = 'Your new Bricks SEO license';
    text = `Hello,\n\nThanks for your purchase. Your new license key${plural}:\n${keysText}\n\nLog in at ${env.APP_URL}/login with your existing password to manage it.`;
    html = `<p>Hello,</p><p>Thanks for your purchase. Your new license key${plural}:</p>${keysHtml}<p><a href="${env.APP_URL}/login">Log in to your dashboard</a> with your existing password to manage it.</p>`;
  } else if (template === 'password_reset') {
    const resetUrl = `${env.APP_URL}/reset-password?token=${data.token}`;
    subject = 'Reset your Bricks SEO password';
    text = `Hello,\n\nWe received a request to reset your password. This link expires in 1 hour:\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`;
    html = `<p>Hello,</p><p>We received a request to reset your password. This link expires in 1 hour:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`;
  } else if (template === 'test') {
    subject = 'Bricks SEO — test email';
    text = `This is a test email from your Bricks SEO admin settings. If you received this, your SMTP configuration works.`;
    html = `<p>This is a test email from your Bricks SEO admin settings.</p><p>If you received this, your SMTP configuration works.</p>`;
  } else if (template === 'support_request') {
    subject = `[Support] ${data.subject}`;
    text = `From: ${data.fromEmail}\n\n${data.message}`;
    html = `<p>From: ${data.fromEmail}</p><p>${data.message.replace(/\n/g, '<br>')}</p>`;
  } else {
    subject = 'Bricks SEO Notification';
    text = JSON.stringify(data);
    html = `<p>${JSON.stringify(data)}</p>`;
  }

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
