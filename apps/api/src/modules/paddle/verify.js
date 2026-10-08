import crypto from 'crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';

export function verifyPaddleSignature(signatureHeader, rawBody) {
  if (!signatureHeader) {
    throw new AppError('webhook_signature_invalid', 401, 'Missing Paddle-Signature header');
  }

  // Parse signature header: ts=1234567890;h1=abcd...
  const parts = signatureHeader.split(';');
  let ts = '';
  let h1 = '';

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 'ts') ts = value;
    if (key === 'h1') h1 = value;
  }

  if (!ts || !h1) {
    throw new AppError('webhook_signature_invalid', 401, 'Malformed Paddle-Signature header');
  }

  // Check tolerance
  const now = Math.floor(Date.now() / 1000);
  const eventTime = parseInt(ts, 10);
  if (Math.abs(now - eventTime) > env.PADDLE_WEBHOOK_TOLERANCE_SECONDS) {
    throw new AppError('webhook_signature_invalid', 401, 'Webhook timestamp out of tolerance');
  }

  // Verify HMAC
  const payload = `${ts}:${rawBody.toString('utf8')}`;
  const hmac = crypto.createHmac('sha256', env.PADDLE_WEBHOOK_SECRET);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');

  let isValid = false;
  try {
    isValid = crypto.timingSafeEqual(Buffer.from(expectedSignature, 'utf8'), Buffer.from(h1, 'utf8'));
  } catch (e) {
    // Buffer length mismatch
    isValid = false;
  }

  if (!isValid) {
    throw new AppError('webhook_signature_invalid', 401, 'Invalid webhook signature');
  }

  return true;
}
