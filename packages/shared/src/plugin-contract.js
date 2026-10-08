import { z } from 'zod';

export const LicenseKey = z
  .string()
  .transform((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .pipe(z.string().regex(/^BSEO[0-9A-HJKMNP-TV-Z]{20}$/, 'invalid_key'))
  .transform((s) => `BSEO-${s.slice(4, 9)}-${s.slice(9, 14)}-${s.slice(14, 19)}-${s.slice(19, 24)}`);

export const PluginRequest = z.object({
  license_key: LicenseKey,
  site: z.object({
    url: z.string().url().max(255),
    name: z.string().trim().max(120).default(''),
    environment: z.enum(['production', 'staging', 'development', 'local']).default('production'),
    locale: z.string().max(16).optional(),
  }),
  client: z.object({
    plugin_version: z.string().max(32),
    wp_version: z.string().max(32).optional(),
    php_version: z.string().max(32).optional(),
    bricks_version: z.string().max(32).optional(),
  }),
});

export const LicenseSummary = z.object({
  status: z.enum(['active', 'expired', 'suspended', 'revoked', 'inactive']),
  plan: z.enum(['solo', 'studio', 'agency', 'lifetime']),
  plan_name: z.string(),
  expires_at: z.string().datetime().nullable(),
  renews: z.boolean(),
  ends_on: z.string().datetime().nullable(),
  site_limit: z.number().int().nullable(), // null = unlimited
  sites_used: z.number().int(),
});
