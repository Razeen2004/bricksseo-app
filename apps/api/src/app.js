import fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { env } from './config/env.js';

export async function buildApp(opts = {}) {
  const app = fastify({
    logger: {
      level: opts.logLevel || 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.currentPassword',
          'req.body.newPassword',
          'req.body.license_key',
          'req.body.token',
          'req.body.smtp.password',
          '*.passwordHash',
          '*.keyCiphertext',
          '*.tempPasswordCiphertext',
          '*.totpSecretCiphertext'
        ],
        censor: '[redacted]'
      }
    },
    ...opts
  });

  // Setup Zod compilers
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const { errorHandler } = await import('./http/error-handler.js');
  app.setErrorHandler(errorHandler);

  await app.register(helmet);
  await app.register(cookie);

  // Raw body parser for webhooks
  const rawBodyPlugin = (await import('./http/raw-body.js')).default;
  await app.register(rawBodyPlugin);

  // Webhook Routes
  const paddleWebhookRoutes = (await import('./modules/paddle/webhook.routes.js')).default;
  await app.register(paddleWebhookRoutes);
  
  // Plugin API Routes
  const pluginRoutes = (await import('./modules/plugin-api/plugin.routes.js')).default;
  await app.register(pluginRoutes);

  const publicRoutes = (await import('./modules/public/public.routes.js')).default;
  await app.register(publicRoutes);

  // Auth and Account Routes
  const authRoutes = (await import('./modules/auth/auth.routes.js')).default;
  const accountRoutes = (await import('./modules/account/account.routes.js')).default;
  await app.register(authRoutes);
  await app.register(accountRoutes);

  // Admin Routes
  const adminOverviewRoutes = (await import('./modules/admin/overview.routes.js')).default;
  const adminCustomersRoutes = (await import('./modules/admin/customers.routes.js')).default;
  const adminLicensesRoutes = (await import('./modules/admin/licenses.routes.js')).default;
  const adminSitesRoutes = (await import('./modules/admin/sites.routes.js')).default;
  const adminWebhooksRoutes = (await import('./modules/admin/webhooks.routes.js')).default;
  const adminLogsRoutes = (await import('./modules/admin/logs.routes.js')).default;
  const adminSettingsRoutes = (await import('./modules/admin/settings.routes.js')).default;
  await app.register(adminOverviewRoutes);
  await app.register(adminCustomersRoutes);
  await app.register(adminLicensesRoutes);
  await app.register(adminSitesRoutes);
  await app.register(adminWebhooksRoutes);
  await app.register(adminLogsRoutes);
  await app.register(adminSettingsRoutes);

  const allowedOrigins = new Set([env.APP_URL, env.MARKETING_URL]);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.has(origin)) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async () => ({ db: 'ok', queue: 'ok' }));

  return app;
}
