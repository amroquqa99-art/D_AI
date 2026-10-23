import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const CLASSES = ['retrieval', 'implementation', 'review'];
export const TARGETS = {
  retrieval: 'dai/shared/explorer',
  implementation: 'dai/engineer/implementer',
  review: 'dai/shared/reviewer',
};
export const LABELS = { retrieval: 'البحث وجمع الملفات', implementation: 'تنفيذ الكود', review: 'المراجعة المستقلة' };
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function classify(text) {
  if (/(?:لا\s+تفوض|لا\s+تفوّض|بدون\s+تفويض|بنفسك\s+بدون|no delegation|do it yourself)/iu.test(text)) return 'disabled';
  // High-confidence intake only. Ambiguous multi-step tasks use the typed route tool.
  if (/(?:راجع\s+(?:الكود|التغييرات|التنفيذ)|دقق\s+الكود|code review|review (?:the )?(?:code|changes|implementation))/iu.test(text)) return 'review';
  // Shell commands / installation / setup / environment / basic file ops — NOT implementation
  if (/(?:نف[ّ]?ذ\s+(?:الخطة|الكود|التعديل|المطلوب)|اصلح\s+|أصلح\s+|برمج\s+|implement\s|fix (?:the |a )?(?:bug|code|test)|build (?:a |the )?(?:app|feature))/iu.test(text)) return 'implementation';
  // Specific shell/install patterns that should NOT be classified as implementation
  if (/(?:cd\s+|ls|mkdir|rm\s+|cp\s+|mv\s+|cat\s+|grep\s+|find\s+|chmod\s+|chown\s+|ps|kill|top|free|df|du)\s/iu.test(text)) return 'shell';
  if (/(?:npm\s+|yarn\s+|pip\s+|pip3\s+|composer\s+|npm install|npm i|pip install|pip3 install)\s/iu.test(text)) return 'shell';
  if (/(?:python\s+|node\s+|bash|sh|zsh)\s/iu.test(text)) return 'shell';
  if (/(?:لا\s+تفوض|لا\s+تفوّض|بدون\s+تفويض)/iu.test(text)) return 'disabled';
  if (/(?:اجراء\s+بحث|إجراء\s+بحث|ابحث\s|إبحث\s|اجمع\s+(?:المصادر|الملفات|المراجع)|بحث\s+(?:شامل|في\s+جميع)|research\s|search (?:the |for )|scan (?:the |all )|extract (?:the |all ))/iu.test(text)) return 'retrieval';
  return null;
}

export function modelRef(id) {
  if (typeof id !== 'string' || !/^[^\s/#]+\/[^\s#]+(?:#[^\s#]+)?$/u.test(id)) throw new Error('Expected exact provider/model[#variant]');
  const [base, variant] = id.split('#');
  const split = base.indexOf('/');
  const provider = base.slice(0, split);
  const model = base.slice(split + 1);
  return { providerID: provider, id: model, ...(variant ? { variant } : {}) };
}

/** Verify a manual provider/model[#variant] against the native OpenCode catalog.
 * OpenCode V2 publishes model variants in the `variants` array, not `variant`.
 * Reject unknown variants instead of throwing or silently dropping a pin.
 */
export function catalogSupportsRef(model, ref) {
  if (!model || !ref || model.enabled === false ||
      model.providerID !== ref.providerID || model.id !== ref.id) return false;
  if (!ref.variant) return true;
  if (!Array.isArray(model.variants)) return false;
  return model.variants.some(v => (typeof v === 'string' ? v : v?.id) === ref.variant);
}

// One lock for every plugin location/process. Never guess that an old lock is safe to remove.
export class Registry {
  constructor(home) { this.home = home; this.state = path.join(home, 'runtime', 'router'); }
  async init() { await fs.mkdir(this.state, { recursive: true, mode: 0o700 }); }
  async read(name, fallback) {
    try { return JSON.parse(await fs.readFile(path.join(this.home, name), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return structuredClone(fallback); throw error; }
  }
  async write(name, data) {
    const file = path.join(this.home, name);
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      const handle = await fs.open(tmp, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(data, null, 2) + '\n'); await handle.sync(); }
      finally { await handle.close(); }
      await fs.rename(tmp, file);
      // Node cannot open directory handles with fs.open('r') on Windows.
      // The file itself was fsync'ed above; POSIX also syncs the rename's
      // directory entry. Windows power-loss durability remains unverified.
      if (process.platform !== 'win32') {
        const directory = await fs.open(path.dirname(file), 'r');
        try { await directory.sync(); } finally { await directory.close(); }
      }
    } finally { await fs.unlink(tmp).catch(() => {}); }
  }
  async locked(fn) {
    await this.init();
    const lock = path.join(this.state, 'registry.lock');
    let fd;
    for (let n = 0; n < 100; n++) {
      try { fd = await fs.open(lock, 'wx', 0o600); break; }
      catch (error) { if (error.code !== 'EEXIST') throw error; await sleep(10); }
    }
    if (!fd) throw new Error('DAI registry busy; no action sent. A crash lock requires human inspection.');
    try { return await fn(); } finally { await fd.close(); await fs.unlink(lock); }
  }
  async preference(kind, directory) {
    const p = await this.read('config/routing-preferences.json', { global: {}, projects: {} });
    return p.projects?.[directory]?.[kind] ?? p.global?.[kind] ?? null;
  }
  async savePreference(kind, directory, model, global) {
    if (!CLASSES.includes(kind)) throw new Error('Unknown task class');
    modelRef(model);
    return this.locked(async () => {
      const p = await this.read('config/routing-preferences.json', { schema_version: 1, global: {}, projects: {} });
      p.global ??= {}; p.projects ??= {};
      const scope = global ? p.global : (p.projects[directory] ??= {});
      scope[kind] = { model, approved_at: new Date().toISOString(), source: 'native-owner-form' };
      if (global && p.projects[directory]) delete p.projects[directory][kind];
      await this.write('config/routing-preferences.json', p);
      return scope[kind];
    });
  }
  async saveAutoPreference(kind, directory, global) {
    if (!CLASSES.includes(kind)) throw new Error('Unknown task class');
    return this.locked(async () => {
      const p = await this.read('config/routing-preferences.json', { schema_version: 1, global: {}, projects: {} });
      p.global ??= {}; p.projects ??= {};
      const scope = global ? p.global : (p.projects[directory] ??= {});
      scope[kind] = { mode: 'auto', approved_at: new Date().toISOString(), source: 'native-owner-form' };
      if (global && p.projects[directory]) delete p.projects[directory][kind];
      await this.write('config/routing-preferences.json', p);
      return scope[kind];
    });
  }
  async record(id) { return this.read(`runtime/router/jobs/${id}.json`, null); }
  async update(id, update) {
    return this.locked(async () => {
      const old = await this.record(id);
      if (!old) throw new Error('Missing dispatch reservation');
      const next = { ...old, ...update, updated_at: new Date().toISOString() };
      await this.write(`runtime/router/jobs/${id}.json`, next);
      return next;
    });
  }
  async reserve(plan, model) {
    return this.locked(async () => {
      const old = await this.record(plan.id);
      const digest = hash({ plan, model });
      if (old) {
        if (old.digest !== digest) throw new Error('Dispatch ID reused for a changed contract');
        return { fresh: false, job: old };
      }
      // At most one implementation writer per actual location; an uncertain writer stays reserved.
      const writerKey = hash(plan.directory);
      if (plan.kind === 'implementation') {
        const writer = await this.read(`runtime/router/writers/${writerKey}.json`, null);
        if (writer && writer.id !== plan.id) throw new Error('Another implementation owns this workspace; wait for its receipt.');
        await this.write(`runtime/router/writers/${writerKey}.json`, { id: plan.id });
      }
      const job = { ...plan, model, digest, status: 'RESERVED', created_at: new Date().toISOString() };
      await this.write(`runtime/router/jobs/${plan.id}.json`, job);
      return { fresh: true, job };
    });
  }
  async releaseWriter(job) {
    if (job.kind !== 'implementation') return;
    await this.locked(async () => {
      const key = `runtime/router/writers/${hash(job.directory)}.json`;
      const record = await this.read(key, null);
      if (record?.id === job.id) await fs.unlink(path.join(this.home, key));
    });
  }
}

export function workerPermissions(kind, directory) {
  const rules = [
    { action: 'subagent', resource: '*', effect: 'deny' },
    { action: 'dai_delegate_native', resource: '*', effect: 'deny' },
    { action: 'dai_route', resource: '*', effect: 'deny' },
    { action: 'edit', resource: '*', effect: 'deny' },
    { action: 'shell', resource: '*', effect: kind === 'implementation' ? 'ask' : 'deny' },
    { action: 'external_directory', resource: '*', effect: 'ask' },
    { action: 'external_directory', resource: `${directory}/**`, effect: 'allow' },
  ];
  if (kind === 'implementation') rules.push({ action: 'edit', resource: `${directory}/**`, effect: 'allow' });
  // Last-match semantics: secret exclusions must follow workspace allows.
  for (const action of ['read', 'edit']) for (const resource of ['**/.env*', '**/secrets/**', '**/*credentials*', '**/auth.json', '**/service.json']) {
    rules.push({ action, resource, effect: 'deny' });
  }
  return rules;
}

export function compactResult(messages) {
  const out = [];
  for (const message of messages ?? []) {
    if ((message.type ?? message.role) !== 'assistant') continue;
    for (const part of message.content ?? []) if (part.type === 'text' && typeof part.text === 'string') out.push(part.text);
  }
  const text = out.join('\n');
  return text.length > 12000 ? text.slice(-12000) + '\n[Output bounded; inspect child session for the complete result.]' : text;
}
