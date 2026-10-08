import { z } from 'zod';

export const PaddleEnvelope = z.object({
  event_id: z.string(),
  event_type: z.string(),
  occurred_at: z.string().datetime({ offset: true }),
  notification_id: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
}).passthrough();

export const TransactionCompleted = z.object({
  id: z.string().startsWith('txn_'),
  customer_id: z.string().startsWith('ctm_'),
  subscription_id: z.string().nullish(),
  custom_data: z.record(z.string(), z.unknown()).nullish(),
  currency_code: z.string().length(3),
  items: z.array(z.object({
    price: z.object({ id: z.string().startsWith('pri_') }).passthrough(),
    quantity: z.number().int().min(1),
  }).passthrough()).min(1),
  billing_period: z.object({ ends_at: z.string().datetime({ offset: true }) }).passthrough().nullish(),
  details: z.object({
    totals: z.object({ total: z.string() }).passthrough(),
    payout_totals: z.object({ earnings: z.string(), fee: z.string(), currency_code: z.string() }).passthrough().nullish(),
  }).passthrough(),
}).passthrough();
