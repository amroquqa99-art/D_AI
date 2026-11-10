import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { searchResources, readResource } from '../adapters/opencode/router/resources.js';

async function fixture(t, content = 'Body MUST_NOT_APPEAR_IN_SEARCH') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dai-resource-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = path.join(root, 'resources/agenticskills');
  await mkdir(base, { recursive: true });
  const entry = { id: 'sample', category: 'skills', title: 'Debug تشخيص', summary: 'Bounded metadata', status: 'ADAPTED', path: 'resources/agenticskills/page.md' };
  const catalog = { schema_version: 1, resources: [entry] };
  const save = () => writeFile(path.join(base, 'catalog.json'), JSON.stringify(catalog));
  await save();
  await writeFile(path.join(base, 'page.md'), content);
  return { root, base, entry, catalog, save };
}
const bytes = result => Buffer.byteLength(JSON.stringify(result));

test('metadata search supports Arabic and category, never leaks bodies or unknown catalog fields', async t => {
  const f = await fixture(t);
  f.entry.body = 'PRIVATE_CATALOG_FIELD'; await f.save();
  const result = await searchResources(f.root, { query: 'تشخيص', category: 'skills', limit: 1 });
  assert.equal(result.resources[0].id, 'sample'); assert.equal(result.untrusted, true);
  assert.doesNotMatch(JSON.stringify(result), /MUST_NOT_APPEAR|PRIVATE_CATALOG_FIELD/);
  assert.deepEqual((await searchResources(f.root, { query: 'debug', category: 'learn' })).resources, []);
  assert.ok(bytes(result) <= 6000);
});

test('real catalog covers all five categories, pages exist, optional MCP is not enabled', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const catalog = JSON.parse(await readFile(path.join(root, 'resources/agenticskills/catalog.json'), 'utf8'));
  assert.deepEqual(new Set(catalog.resources.map(r => r.category)), new Set(['skills', 'mcp', 'workflows', 'tools', 'learn']));
  for (const entry of catalog.resources) {
    const page = await readResource(root, { id: entry.id });
    assert.ok(page.content.length > 0); assert.ok(bytes(page) <= 6000);
    if (entry.category === 'mcp') assert.equal(entry.status, 'OPTIONAL_NOT_ENABLED');
    if (entry.commit) assert.match(entry.commit, /^[a-f0-9]{40}$/);
  }
});

test('UTF8/JSON escaping byte caps and cursor round-trip preserve Arabic and emoji', async t => {
  const text = ('سياق 🧠 "\\\n\t' + String.fromCharCode(1)).repeat(800);
  const f = await fixture(t, text);
  let offset = 0, assembled = '', calls = 0;
  do {
    const page = await readResource(f.root, { id: 'sample', offset, max_bytes: 4000 });
    assert.ok(bytes(page) <= 6000); assert.ok(Buffer.byteLength(page.content) <= 4000);
    assert.equal(page.untrusted, true); assert.doesNotMatch(page.content, /\uFFFD/);
    assembled += page.content; offset = page.next_offset;
    assert.ok(++calls < 100);
  } while (offset !== null);
  assert.equal(assembled, text);
});

test('invalid inputs fail before access; unknown IDs cannot become paths', async t => {
  const f = await fixture(t, '😀test');
  for (const input of [{ query: '' }, { query: 'x'.repeat(201) }, { query: 'debug', limit: 9 }, { query: 'debug', limit: 0.5 }, { query: 'debug', category: 'all' }]) {
    await assert.rejects(searchResources(f.root, input));
  }
  for (const input of [{ id: '../page.md' }, { id: 'missing' }, { id: 'sample', offset: -1 }, { id: 'sample', offset: 1 }, { id: 'sample', offset: 99 }, { id: 'sample', max_bytes: 4001 }]) {
    await assert.rejects(readResource(f.root, input));
  }
});

test('catalog traversal, absolute escape and symlink escape are rejected', async t => {
  const f = await fixture(t);
  const outside = path.join(f.root, 'outside.md'); await writeFile(outside, 'OUTSIDE_SECRET');
  for (const badPath of ['../../outside.md', outside]) {
    f.entry.path = badPath; await f.save();
    await assert.rejects(readResource(f.root, { id: 'sample' }), error => !error.message.includes('OUTSIDE_SECRET'));
  }
  await symlink(outside, path.join(f.base, 'escape.md'));
  f.entry.path = 'resources/agenticskills/escape.md'; await f.save();
  await assert.rejects(readResource(f.root, { id: 'sample' }), /escapes/);
  await rm(path.join(f.base, 'catalog.json'));
  await symlink(outside, path.join(f.base, 'catalog.json'));
  await assert.rejects(searchResources(f.root, { query: 'debug' }), /escapes/);
});

test('file size cap, malformed catalog and duplicate IDs fail closed', async t => {
  const f = await fixture(t, 'x'.repeat(65537));
  await assert.rejects(readResource(f.root, { id: 'sample' }), /64KiB/);
  f.catalog.resources.push({ ...f.entry }); await f.save();
  await assert.rejects(searchResources(f.root, { query: 'debug' }), /duplicate/);
  await writeFile(path.join(f.base, 'catalog.json'), 'invalid');
  await assert.rejects(searchResources(f.root, { query: 'debug' }), /JSON/);
  await writeFile(path.join(f.base, 'catalog.json'), 'x'.repeat(65537));
  await assert.rejects(searchResources(f.root, { query: 'debug' }), /64KiB/);
});

test('search final JSON envelope respects budget even with large metadata', async t => {
  const f = await fixture(t);
  f.catalog.resources = Array.from({ length: 8 }, (_, i) => ({ ...f.entry, id: `sample-${i}`, title: 'س'.repeat(400), summary: 'د'.repeat(400) }));
  await f.save();
  const result = await searchResources(f.root, { query: 'sample', limit: 8 });
  assert.equal(result.matched_count, 8); assert.ok(result.resources.length < 8); assert.ok(bytes(result) <= 6000);
});
