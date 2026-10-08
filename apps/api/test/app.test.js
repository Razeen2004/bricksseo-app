import { test, expect } from 'vitest';
import { buildApp } from '../src/app.js';

test('healthz returns ok', async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({
    method: 'GET',
    url: '/healthz'
  });
  
  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.payload)).toEqual({ status: 'ok' });
});
