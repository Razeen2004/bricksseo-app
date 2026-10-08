import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export const EnvSchema = z.object({
  APP_ENV: z.enum(['local', 'staging', 'production']),
  PORT: z.coerce.number().int().default(4000),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  MARKETING_URL: z.string().url(),
  DATABASE_URL: z.string().startsWith('postgres'),
  APP_ENCRYPTION_KEYS: z.string().regex(/^v\d+:[A-Za-z0-9+/=]{43,}(,v\d+:[A-Za-z0-9+/=]{43,})*$/),
  LICENSE_KEY_PEPPER: z.string().min(32),
  PADDLE_ENV: z.enum(['sandbox', 'production']),
  PADDLE_API_KEY: z.string().min(10),
  PADDLE_WEBHOOK_SECRET: z.string().startsWith('pdl_ntfset_'),
  PADDLE_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().min(5).default(300),
  PADDLE_CLIENT_TOKEN: z.string().optional(),
  AUTO_CANCEL_SUBSCRIPTION_ON_REFUND: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
  EMAIL_PROVIDER: z.enum(['smtp', 'postmark', 'resend']),
  EMAIL_FROM: z.string().min(3),
  ADMIN_ALERT_EMAIL: z.string().email(),
  RESEND_API_KEY: z.string().startsWith('re_').optional(),
  STORAGE_DRIVER: z.enum(['local', 'r2']),
  RELEASE_SIGNING_PUBLIC_KEY: z.string().min(40),
}).superRefine((env, ctx) => {
  if (env.APP_ENV === 'production' && env.PADDLE_ENV !== 'production') {
    ctx.addIssue({ code: 'custom', message: 'production APP_ENV must use PADDLE_ENV=production' });
  }
  if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
    ctx.addIssue({ code: 'custom', message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend', path: ['RESEND_API_KEY'] });
  }
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
