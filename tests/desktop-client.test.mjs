import test from 'node:test';
import assert from 'node:assert/strict';
import { createDaiDesktopClient } from '../adapters/opencode/desktop/client.mjs';
const token = '0123456789abcdef0123456789abcdef';

test('rejects remote, implicit-port and credentialed URLs', () => {
  for (const baseUrl of [
    'http://example.com:2345/', 'https://127.0.0.1:2345/', 'http://127.0.0.1/',
    'http://user:pass@127.0.0.1:1234/', 'http://127.0.0.1:1234/private',
  ]) assert.throws(() => createDaiDesktopClient({ baseUrl, token }));
  assert.throws(() => createDaiDesktopClient({ baseUrl: 'http://127.0.0.1:1234/', token: 'short' }));
});

test('uses GET and token header, never puts token in URL', async () => {
  const seen = [];
  const client = createDaiDesktopClient({
    baseUrl: 'http://127.0.0.1:1234/', token,
    fetchImpl: async (url, options) => {
      seen.push({ url: String(url), options });
      return { ok: true, json: async () => ({ status: 'ok' }) };
    },
  });
  assert.deepEqual(await client.health(), { status: 'ok' });
  await client.systems();
  await client.capabilities();
  assert.deepEqual(Object.keys(client), ['health', 'systems', 'capabilities']);
  assert.deepEqual(seen.map(x => x.url.split('/').at(-1)), ['health', 'systems', 'capabilities']);
  for (const item of seen) {
    assert.equal(item.options.method, 'GET');
    assert.equal(item.options.headers['X-DAI-Bridge-Token'], token);
    assert.ok(!item.url.includes(token));
  }
});

test('does not invent success for failed authentication', async () => {
  const client = createDaiDesktopClient({
    baseUrl: 'http://127.0.0.1:1234/', token,
    fetchImpl: async () => ({ ok: false, status: 401 }),
  });
  await assert.rejects(client.health(), /401/);
});
