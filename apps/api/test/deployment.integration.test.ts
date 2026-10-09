import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/bootstrap';
import { CONFIG, type AppConfig } from '../src/config/env';
import { testDatabaseUrl } from './test-env';

test('Production split origins, scoped CORS and trusted proxy rate limits', async (t) => {
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.NODE_ENV = 'test';
  process.env.TRUST_PROXY_HOPS = '1';
  const app = await createApp(false),
    config = app.get<AppConfig>(CONFIG);
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const post = (origin: string, site: string, ip: string) =>
    fetch(`${base}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Sec-Fetch-Site': site,
        'X-Forwarded-For': ip,
        'Content-Type': 'application/json',
        'X-DineFlow-Client': 'web',
      },
      body: JSON.stringify({ email: 'deployment-missing@dineflow.test' }),
    });
  try {
    await t.test(
      'credentialed REST preflight allows the tenant header and exposes scope mismatch',
      async () => {
        const response = await fetch(`${base}/api/v1/auth/login`, {
          method: 'OPTIONS',
          headers: {
            Origin: config.APP_ORIGIN,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers':
              'content-type,x-dineflow-client,x-dineflow-restaurant',
          },
        });
        assert.equal(response.status, 204);
        assert.equal(response.headers.get('access-control-allow-origin'), config.APP_ORIGIN);
        assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
        assert.match(
          response.headers.get('access-control-allow-headers')!,
          /X-DineFlow-Restaurant/i,
        );
        const read = await fetch(`${base}/api/v1/health/ready`, {
          headers: { Origin: config.APP_ORIGIN },
        });
        assert.match(
          read.headers.get('access-control-expose-headers')!,
          /X-DineFlow-Scope-Mismatch/i,
        );
      },
    );
    await t.test(
      'same-site sibling frontend is accepted while foreign or cross-site mutation is denied',
      async () => {
        assert.equal((await post(config.APP_ORIGIN, 'same-site', '192.0.2.10')).status, 201);
        assert.equal(
          (await post('https://bad.example', 'same-site', '192.0.2.11')).status,
          403,
        );
        assert.equal((await post(config.APP_ORIGIN, 'cross-site', '192.0.2.12')).status, 403);
      },
    );
    await t.test(
      'the single trusted proxy supplies separate client IP throttling buckets',
      async () => {
        const statuses = [];
        for (let i = 0; i < 6; i++)
          statuses.push((await post(config.APP_ORIGIN, 'same-site', '192.0.2.20')).status);
        assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
        assert.equal((await post(config.APP_ORIGIN, 'same-site', '192.0.2.21')).status, 201);
      },
    );
    await t.test(
      'direct Socket.IO polling has approved origin CORS without cookie credentials',
      async () => {
        const response = await fetch(
          `${base}/api/v1/realtime/socket.io?EIO=4&transport=polling`,
          { headers: { Origin: config.APP_ORIGIN, 'Sec-Fetch-Site': 'same-site' } },
        );
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('access-control-allow-origin'), config.APP_ORIGIN);
        assert.equal(response.headers.get('access-control-allow-credentials'), null);
        assert.ok((await response.text()).startsWith('0'));
        const rejected = await fetch(
          `${base}/api/v1/realtime/socket.io?EIO=4&transport=polling`,
          { headers: { Origin: 'https://bad.example', 'Sec-Fetch-Site': 'cross-site' } },
        );
        assert.equal(rejected.status, 403);
      },
    );
  } finally {
    await app.close();
  }
});
