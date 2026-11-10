import { promises as fs } from 'node:fs';
import path from 'node:path';
import { constants } from 'node:fs';

const ALLOWED_CATEGORIES = new Set(['skills', 'mcp', 'workflows', 'tools', 'learn']);
const MAX_FILE_BYTES = 64 * 1024;
const MAX_SEARCH_BYTES = 6000;
const MAX_READ_BYTES = 6000;
const DEFAULT_SEARCH_LIMIT = 5;

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}

async function resolveRoot(root) {
  if (typeof root !== 'string' || root.trim() === '') fail('root must be a non-empty string');
  const resolved = path.resolve(root);
  let stat;
  try {
    stat = await fs.lstat(resolved);
  } catch {
    fail('root does not exist');
  }
  if (stat.isSymbolicLink()) fail('root must not be a symlink');
  if (!stat.isDirectory()) fail('root must be a directory');
  return fs.realpath(resolved);
}

async function resolveBase(rootReal) {
  const candidate = path.join(rootReal, 'resources', 'agenticskills');
  let stat;
  try {
    stat = await fs.lstat(candidate);
  } catch {
    fail('resources/agenticskills directory is missing');
  }
  if (stat.isSymbolicLink()) fail('resources/agenticskills must not be a symlink');
  if (!stat.isDirectory()) fail('resources/agenticskills must be a directory');
  const real = await fs.realpath(candidate);
  if (real !== candidate) fail('resources/agenticskills path is not contained');
  return real;
}

function isContained(child, parent) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function readBoundedFile(filePath, baseReal) {
  let realPath;
  try {
    realPath = await fs.realpath(filePath);
  } catch {
    fail('file not found');
  }
  if (!isContained(realPath, baseReal)) fail('path escapes resources/agenticskills');
  const handle = await fs.open(realPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) fail('not a regular file');
    if (stat.size > MAX_FILE_BYTES) fail('file exceeds 64KiB limit');
    const buffer = Buffer.alloc(stat.size);
    let position = 0;
    while (position < stat.size) {
      const result = await handle.read(buffer, position, stat.size - position, position);
      if (result.bytesRead === 0) fail('unexpected end of file');
      position += result.bytesRead;
    }
    return { buffer, size: stat.size, realPath };
  } finally {
    await handle.close();
  }
}

async function loadCatalog(root) {
  const rootReal = await resolveRoot(root);
  const baseReal = await resolveBase(rootReal);
  const catalogPath = path.join(baseReal, 'catalog.json');
  const { buffer } = await readBoundedFile(catalogPath, baseReal);
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  } catch {
    fail('catalog JSON is invalid');
  }
  if (!isPlainObject(parsed)) fail('catalog must be an object');
  if (!Array.isArray(parsed.resources)) fail('catalog resources must be an array');
  const resources = parsed.resources.map((entry, index) => {
    if (!isPlainObject(entry)) fail(`catalog resource ${index} must be an object`);
    if (typeof entry.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(entry.id)) fail(`catalog resource ${index} has invalid id`);
    if (!ALLOWED_CATEGORIES.has(entry.category)) fail(`catalog resource ${index} has invalid category`);
    if (typeof entry.path !== 'string' || entry.path.trim() === '') fail(`catalog resource ${index} has invalid path`);
    for (const field of ['title', 'summary', 'status']) {
      if (typeof entry[field] !== 'string' || entry[field].length > 500) fail('invalid resource metadata');
    }
    return entry;
  });
  if (new Set(resources.map(entry => entry.id)).size !== resources.length) fail('duplicate resource ID');
  return { rootReal, baseReal, catalog: { ...parsed, resources } };
}

function toMetadata(entry) {
  return Object.fromEntries(['id', 'category', 'title', 'summary', 'status', 'directory_url', 'upstream', 'commit', 'license']
    .filter(key => entry[key] !== undefined).map(key => [key, entry[key]]));
}

export async function searchResources(root, input) {
  if (!isPlainObject(input)) fail('input must be an object');
  const query = input.query;
  if (typeof query !== 'string' || query.trim() === '' || query.length > 200 || query.trim().length > 200) {
    fail('query must be a non-empty string of at most 200 characters');
  }
  let category = input.category;
  if (category !== undefined && category !== null) {
    if (typeof category !== 'string' || !ALLOWED_CATEGORIES.has(category)) {
      fail('category must be one of skills, mcp, workflows, tools, learn');
    }
  } else {
    category = null;
  }
  let limit = input.limit;
  if (limit === undefined) limit = DEFAULT_SEARCH_LIMIT;
  if (!isInteger(limit) || limit < 1 || limit > 8) fail('limit must be an integer from 1 to 8');

  const { catalog } = await loadCatalog(root);
  let candidates = catalog.resources;
  if (category) candidates = candidates.filter((entry) => entry.category === category);
  const term = query.trim().toLowerCase();
  const matched = candidates
    .filter((entry) => {
      const haystack = [entry.id, entry.category, entry.title, entry.summary, ...(Array.isArray(entry.tags) ? entry.tags : [])]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const metadataItems = matched.map(toMetadata);
  const result = { resources: [], matched_count: matched.length, untrusted: true };
  for (let count = Math.min(limit, metadataItems.length); count >= 0; count -= 1) {
    result.resources = metadataItems.slice(0, count);
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') <= MAX_SEARCH_BYTES) return result;
  }
  fail('search response exceeds byte budget');
}

export async function readResource(root, input) {
  if (!isPlainObject(input)) fail('input must be an object');
  const id = input.id;
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(id)) fail('id must be a catalog ID');

  const offset = input.offset ?? 0;
  if (!isInteger(offset) || offset < 0) fail('offset must be an integer >= 0');

  const maxBytes = input.max_bytes ?? 3000;
  if (!isInteger(maxBytes) || maxBytes < 256 || maxBytes > 4000) fail('max_bytes must be an integer from 256 to 4000');

  const { rootReal, baseReal, catalog } = await loadCatalog(root);
  const entry = catalog.resources.find((item) => item.id === id);
  if (!entry) fail('unknown catalog ID');

  const candidatePath = path.resolve(rootReal, entry.path);
  const { buffer } = await readBoundedFile(candidatePath, baseReal);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  if (offset > text.length) fail('offset exceeds resource length');
  if (offset > 0 && /[\uDC00-\uDFFF]/.test(text[offset] ?? '') && /[\uD800-\uDBFF]/.test(text[offset - 1])) fail('offset splits a Unicode character');

  let end = offset;
  if (offset < text.length) {
    while (end < text.length) {
      const width = text.codePointAt(end) > 0xffff ? 2 : 1;
      const next = text.slice(offset, end + width);
      if (Buffer.byteLength(next, 'utf8') > maxBytes) break;
      end += width;
    }
    if (end === offset && offset < text.length) {
      // Ensure at least one character is returned when max_bytes allows it.
      end = Math.min(offset + 1, text.length);
    }
  }
  let content = text.slice(offset, end);
  let nextOffset = end < text.length ? end : null;

  const source = toMetadata(entry);
  const result = {
    id: entry.id,
    path: entry.path,
    offset,
    content,
    next_offset: nextOffset,
    source,
    untrusted: true,
    total_characters: text.length,
    total_bytes: Buffer.byteLength(text, 'utf8'),
  };

  // Enforce the final serialized size, shrinking content if escaping expands it.
  let finalContent = content;
  while (true) {
    result.content = finalContent;
    result.next_offset = offset + finalContent.length < text.length ? offset + finalContent.length : null;
    const serialized = JSON.stringify(result);
    if (Buffer.byteLength(serialized, 'utf8') <= MAX_READ_BYTES) break;
    if (finalContent.length === 0) fail('read response exceeds byte budget');
    const nextLength = Math.max(0, Math.floor(finalContent.length * 0.8));
    finalContent = finalContent.slice(0, nextLength === finalContent.length ? finalContent.length - 1 : nextLength);
    if (/[\uD800-\uDBFF]/.test(finalContent.at(-1) ?? '')) finalContent = finalContent.slice(0, -1);
  }
  result.content = finalContent;
  result.next_offset = offset + finalContent.length < text.length ? offset + finalContent.length : null;

  return result;
}
