import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareDockerEnv } from './env.mjs';

test('container routing preserves encoded credentials, database and query options', () => {
  const original = 'postgresql://user:p%40ss%3Aword@localhost:5544/dineflow?schema=public&sslmode=require';
  const env = { DATABASE_URL: original, DATABASE_HOST: 'postgres', DATABASE_PORT: '5432' };
  prepareDockerEnv(env);
  const url = new URL(env.DATABASE_URL);
  assert.equal(url.hostname, 'postgres');
  assert.equal(url.port, '5432');
  assert.equal(url.username, 'user');
  assert.equal(url.password, 'p%40ss%3Aword');
  assert.equal(url.pathname, '/dineflow');
  assert.equal(url.search, '?schema=public&sslmode=require');
});
test('host connection is unchanged without a container override', () => {
  const env = { DATABASE_URL: 'postgres://user:pass@remote:5544/existing' };
  prepareDockerEnv(env);
  assert.equal(env.DATABASE_URL, 'postgres://user:pass@remote:5544/existing');
});
test('invalid connections fail without exposing their value', () => {
  for (const secret of ['my-secret', 'https://user:my-secret@example.com']) {
    assert.throws(() => prepareDockerEnv({ DATABASE_URL: secret, DATABASE_HOST: 'postgres' }), (error) => !error.message.includes('my-secret'));
  }
});
