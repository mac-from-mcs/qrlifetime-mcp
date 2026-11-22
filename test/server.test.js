import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { buildServer } from '../src/server.js';
import { createClient } from '../src/api.js';

async function connect(client) {
  const server = buildServer({ client });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(a), c.connect(b)]);
  return c;
}

test('lists the six tools', async () => {
  const c = await connect(createClient({}));
  const { tools } = await c.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    'create_dynamic_qr_code', 'delete_dynamic_qr_code', 'generate_qr_code',
    'get_dynamic_qr_code', 'list_dynamic_qr_codes', 'update_dynamic_qr_code',
  ]);
});

test('generate_qr_code returns an SVG and writes a file', async () => {
  const c = await connect(createClient({}));
  const r = await c.callTool({ name: 'generate_qr_code', arguments: { text: 'https://example.com/café', size: 300, foreground: '#112233' } });
  assert.ok(!r.isError);
  assert.match(r.content[0].text, /^<svg [^>]*width="300"/);
  assert.match(r.content[0].text, /fill="#112233"/);
  const dir = await mkdtemp(join(tmpdir(), 'qrl-'));
  const out = join(dir, 'code.svg');
  const w = await c.callTool({ name: 'generate_qr_code', arguments: { text: 'hello', output_path: out } });
  assert.ok(!w.isError, w.content[0].text);
  assert.match(await readFile(out, 'utf8'), /^<svg/);
  const bad = await c.callTool({ name: 'generate_qr_code', arguments: { text: 'hello', output_path: 'relative.svg' } });
  assert.ok(bad.isError);
});

test('API tools without a key explain how to get one', async () => {
  const c = await connect(createClient({}));
  const r = await c.callTool({ name: 'list_dynamic_qr_codes', arguments: {} });
  assert.ok(r.isError);
  assert.match(r.content[0].text, /QRLIFETIME_API_KEY/);
});

test('API tools call the REST API with the key', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.Authorization, body: init.body });
    if (url.endsWith('/codes/nope')) return new Response(JSON.stringify({ error: 'QR code not found.' }), { status: 404 });
    return new Response(JSON.stringify({ slug: 'ab3k7mx', shortUrl: 'https://q.qrlifetime.com/ab3k7mx' }), { status: 200 });
  };
  const c = await connect(createClient({ apiKey: 'qrl_test1234_secretsecretsecretsecret', baseUrl: 'https://api.test/v1', fetchImpl }));
  const created = await c.callTool({ name: 'create_dynamic_qr_code', arguments: { destination: 'https://example.com', name: 'Flyer' } });
  assert.ok(!created.isError);
  assert.equal(calls[0].url, 'https://api.test/v1/codes');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].auth, 'Bearer qrl_test1234_secretsecretsecretsecret');
  assert.deepEqual(JSON.parse(calls[0].body), { destination: 'https://example.com', name: 'Flyer' });
  await c.callTool({ name: 'update_dynamic_qr_code', arguments: { slug: 'ab3k7mx', destination: 'https://example.com/b' } });
  assert.equal(calls[1].method, 'PATCH');
  const missing = await c.callTool({ name: 'get_dynamic_qr_code', arguments: { slug: 'nope' } });
  assert.ok(missing.isError);
  assert.equal(missing.content[0].text, 'QR code not found.');
  const badSlug = await c.callTool({ name: 'delete_dynamic_qr_code', arguments: { slug: '../x' } });
  assert.ok(badSlug.isError);
  assert.equal(calls.length, 3);
  const empty = await c.callTool({ name: 'update_dynamic_qr_code', arguments: { slug: 'ab3k7mx' } });
  assert.ok(empty.isError);
});
