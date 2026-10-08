import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import nodemailer from 'nodemailer';

// Simplified Mailer logic
export async function sendEmail({ to, template, data, idempotencyKey, userId = null, replyTo = null }) {
  // 1. Render template (simplified)
  let subject = '';
  let text = '';
  let html = '';

  if (template === 'welcome') {
    subject = 'Welcome to Bricks SEO - Your License Key';
    text = `Hello,\n\nYour username is: ${data.email}\nYour temporary password is: ${data.tempPassword}\n\nYour License Key: ${data.licenseKey}\n\nDashboard: ${env.APP_URL}`;
    html = `<p>Hello,</p><p>Your username is: ${data.email}</p><p>Your temporary password is: <strong>${data.tempPassword}</strong></p><p>Your License Key: <strong>${data.licenseKey}</strong></p><p>Dashboard: <a href="${env.APP_URL}">${env.APP_URL}</a></p>`;
  } else if (template === 'new_license') {
    subject = 'Your New Bricks SEO License';
    text = `Hello,\n\nHere is your new License Key: ${data.licenseKey}\n\nLog in at ${env.APP_URL} with your existing password.`;
    html = `<p>Hello,</p><p>Here is your new License Key: <strong>${data.licenseKey}</strong></p><p>Log in at <a href="${env.APP_URL}">${env.APP_URL}</a> with your existing password.</p>`;
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
