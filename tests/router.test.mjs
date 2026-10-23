import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Registry, classify, modelRef, workerPermissions, compactResult, hash } from '../adapters/opencode/router/core.js';
import { makeRouter } from '../adapters/opencode/router/index.js';
import { selectValueModel, estimateModelCost } from '../adapters/opencode/router/value.js';

async function fixture() {
  const home = await mkdtemp(path.join(os.tmpdir(), 'dai-router-test-'));
  const registry = new Registry(home);
  await mkdir(path.join(home, 'config'));
  await registry.write('config/routing-preferences.json', { schema_version: 1, global: {}, projects: {} });
  const sessions = { ses_parent: { id: 'ses_parent', agent: 'build', model: { providerID: 'owner', id: 'primary' }, location: { directory: '/workspace' } } };
  const calls = { create: [], prompt: [], form: [], hooks: [], permission: [], interrupts: [], tools: {}, commands: {} };
  const available = [{ providerID: 'worker', id: 'free', capabilities: { tools: true }, cost: [{ input: 0, output: 0 }] }];
  let outcome = 'succeeded';
  const ctx = {
    location: { directory: '/workspace' }, model: { list: async () => available },
    permission: { assert: async input => { calls.permission.push(input); } },
    session: {
      get: async ({ sessionID }) => sessions[sessionID],
      create: async input => { calls.create.push(input); const s = { ...input, id: `ses_child${calls.create.length}` }; sessions[s.id] = s; return s; },
      prompt: async input => { calls.prompt.push(input); return { id: 'inbox_test' }; },
      wait: async ({ sessionID }) => { sessions[sessionID].time = { idle: 1 }; sessions[sessionID].outcome = outcome; },
      interrupt: async ({ sessionID }) => { calls.interrupts.push(sessionID); },
      context: async ({ sessionID }) => sessionID === 'ses_parent' ? [{ type: 'user', text: 'Original goal context' }] : [{ type: 'assistant', content: [{ type: 'text', text: 'Outcome with file:line/test receipt' }, { type: 'reasoning', text: 'PRIVATE' }] }],
      hook: async (name, cb) => { calls.hooks.push(name); return { dispose: async () => {} }; },
    },
    tool: { hook: async name => { calls.hooks.push(`tool.${name}`); return { dispose: async () => {} }; }, transform: async cb => { cb({ add: tool => { calls.tools[tool.name] = tool; } }); return { dispose: async () => {} }; } },
    command: { transform: async cb => { cb({ add: c => { calls.commands[c.name] = c; } }); return { dispose: async () => {} }; } },
  };
  let answer = { model: 'worker/free', scope: 'global' };
  let formStatus = 'answered';
  const formAPI = async (method, url, body) => {
    calls.form.push({ method, url, body });
    return method === 'post' ? { id: body.id } : { state: { status: formStatus, answer } };
  };
  const router = makeRouter(ctx, { registry, formAPI, sleep: async () => {}, choiceWait: 2 });
  const event = (text, messageID = 'msg_owner1') => ({ sessionID: 'ses_parent', messageID, prompt: { text } });
  return { home, registry, ctx, calls, router, event, sessions, available, setOutcome: x => outcome = x, setAnswer: x => answer = x, setFormStatus: x => formStatus = x };
}

test('classifies Arabic/English intake and explicit owner opt-out', () => {
  assert.equal(classify('ابحث عن مصادر أصلية'), 'retrieval');
  assert.equal(classify('نفذ الخطة'), 'implementation');
  assert.equal(classify('راجع الكود'), 'review');
  assert.equal(classify('ابحث لكن لا تفوض'), 'disabled');
  assert.equal(classify('كم 2+2؟'), null);
});
test('DAI OS primary retains routing authority instead of preemptive keyword dispatch', async () => {
  const f = await fixture();
  f.sessions.ses_parent.agent = 'dai-os';
  await f.router.intake(f.event('ابحث عن مصادر أصلية'));
  const e = { sessionID: 'ses_parent', system: [] };
  await f.router.context(e);
  assert.equal(f.calls.create.length, 0);
  assert.match(e.system[0].text, /dai_route/);
  await f.router.intake(f.event('ابحث عن مصادر لكن لا تفوض', 'msg_owner_no_delegate'));
  assert.equal((await f.registry.read('runtime/router/active/' + hash('ses_parent') + '.json', null)).kind, 'disabled');
});

test('exact model IDs including nested IDs and variant; malformed IDs rejected', () => {
  assert.deepEqual(modelRef('lmstudio/vendor/model#fast'), { providerID: 'lmstudio', id: 'vendor/model', variant: 'fast' });
  assert.throws(() => modelRef('guess')); assert.throws(() => modelRef('worker/a b'));
});
test('project preference overrides global and survives a new Registry instance', async () => {
  const f = await fixture();
  await f.registry.savePreference('retrieval', '/workspace', 'worker/free', true);
  await f.registry.savePreference('retrieval', '/workspace', 'worker/project', false);
  const fresh = new Registry(f.home);
  assert.equal((await fresh.preference('retrieval', '/workspace')).model, 'worker/project');
  assert.equal((await fresh.preference('retrieval', '/another')).model, 'worker/free');
});
test('missing choice creates native form and saves only actual owner answer', async () => {
  const f = await fixture();
  await f.router.choice('retrieval', 'ses_parent', '/workspace');
  await f.router.choice('retrieval', 'ses_parent', '/workspace');
  assert.equal(f.calls.form.filter(x => x.method === 'post').length, 1);
  assert.equal((await f.registry.preference('retrieval', '/workspace')).source, 'native-owner-form');
});
test('unknown owner-selected model never dispatches or falls back', async () => {
  const f = await fixture(); f.setAnswer({ model: 'bad/model', scope: 'global' });
  await assert.rejects(f.router.choice('retrieval', 'ses_parent', '/workspace'), /not in native catalog/);
  assert.equal(f.calls.create.length, 0);
});
test('normal research dispatches before parent generation; preserves primary and verifies child model', async () => {
  const f = await fixture(); await f.router.intake(f.event('ابحث عن مصادر أصلية'));
  const e = { sessionID: 'ses_parent', system: [] }; await f.router.context(e);
  assert.equal(f.calls.create.length, 1); assert.equal(f.calls.create[0].agent, 'dai/shared/explorer');
  assert.deepEqual(f.calls.create[0].model, { providerID: 'worker', id: 'free' });
  assert.deepEqual(f.sessions.ses_parent.model, { providerID: 'owner', id: 'primary' });
  assert.match(f.calls.prompt[0].text, /Original goal context/);
  assert.match(e.system[0].text, /Outcome with/); assert.doesNotMatch(e.system[0].text, /PRIVATE/);
});
test('same prompt replay and repeated continuation do not create or send another child', async () => {
  const f = await fixture(); const e = f.event('ابحث عن مصادر أصلية');
  await f.router.intake(e); await f.router.context({ sessionID: 'ses_parent', system: [] });
  await f.router.intake(e); await f.router.context({ sessionID: 'ses_parent', system: [] });
  assert.equal(f.calls.create.length, 1); assert.equal(f.calls.prompt.length, 1);
});
test('concurrent model continuations share one dispatch', async () => {
  const f = await fixture(); await f.router.intake(f.event('ابحث عن مصادر أصلية'));
  await Promise.all([f.router.context({ sessionID: 'ses_parent', system: [] }), f.router.context({ sessionID: 'ses_parent', system: [] })]);
  assert.equal(f.calls.create.length, 1);
});
test('implementation is followed by independent read-only review with a separate choice', async () => {
  const f = await fixture(); await f.router.intake(f.event('نفذ الخطة'));
  await f.router.context({ sessionID: 'ses_parent', system: [] });
  assert.deepEqual(f.calls.create.map(x => x.agent), ['dai/engineer/implementer', 'dai/shared/reviewer']);
  assert.equal(f.calls.form.filter(x => x.method === 'post').length, 2);
  assert.equal(f.calls.create[1].permissions.find(x => x.action === 'edit').effect, 'deny');
});
test('native worker failure is recorded; no alternate worker or parent fallback', async () => {
  const f = await fixture(); f.setOutcome('failed'); await f.router.intake(f.event('ابحث عن مصادر أصلية'));
  await assert.rejects(f.router.context({ sessionID: 'ses_parent', system: [] }), /Worker failed/);
  await assert.rejects(f.router.context({ sessionID: 'ses_parent', system: [] }), /Worker failed/);
  assert.equal(f.calls.create.length, 1);
});
test('uncertain send is never retried even after restoring another router instance', async () => {
  const f = await fixture(); f.ctx.session.prompt = async () => { throw new Error('transport lost'); };
  await f.router.intake(f.event('ابحث عن مصادر أصلية'));
  await assert.rejects(f.router.context({ sessionID: 'ses_parent', system: [] }), /UNCERTAIN/);
  const other = makeRouter(f.ctx, { registry: new Registry(f.home) });
  await assert.rejects(other.context({ sessionID: 'ses_parent', system: [] }), /uncertain dispatch/);
  assert.equal(f.calls.create.length, 1);
});
test('owner opt-out suppresses dispatch and prevents direct delegation bypass', async () => {
  const f = await fixture(); await f.router.intake(f.event('ابحث لكن لا تفوض'));
  await f.router.context({ sessionID: 'ses_parent', system: [] });
  await assert.rejects(f.router.before({ sessionID: 'ses_parent', tool: 'subagent' }), /Owner disabled all delegation/);
  assert.equal(f.calls.create.length, 0); assert.equal(f.calls.form.length, 0);
});
test('workers do not re-route themselves and direct root delegation is gated', async () => {
  const f = await fixture();
  f.sessions.ses_child = { id: 'ses_child', parentID: 'ses_parent' };
  await f.router.intake({ ...f.event('ابحث عن مصادر أصلية'), sessionID: 'ses_child' });
  await f.router.context({ sessionID: 'ses_child', system: [] });
  assert.equal(f.calls.create.length, 0);
  await assert.rejects(f.router.before({ sessionID: 'ses_parent', tool: 'subagent' }), /Use dai_route/);
});
test('changed contract with same dispatch ID is rejected', async () => {
  const f = await fixture(); const p = { id: 'same', directory: '/workspace', kind: 'review', text: 'a' };
  await f.registry.reserve(p, 'worker/free');
  await assert.rejects(f.registry.reserve({ ...p, text: 'b' }, 'worker/free'), /changed contract/);
});
test('one implementation writer per workspace, including uncertain reservations', async () => {
  const f = await fixture(); const p = { id: 'a', directory: '/workspace', kind: 'implementation', text: 'a' };
  await f.registry.reserve(p, 'worker/free');
  await assert.rejects(f.registry.reserve({ ...p, id: 'b' }, 'worker/free'), /Another implementation/);
});
test('secret denies override implementation workspace allow; reviewers have no writes', () => {
  const impl = workerPermissions('implementation', '/workspace');
  assert.equal(impl.at(-1).effect, 'deny');
  assert.ok(impl.some(r => r.action === 'edit' && r.resource === '/workspace/**' && r.effect === 'allow'));
  assert.ok(!workerPermissions('review', '/workspace').some(r => r.action === 'edit' && r.effect === 'allow'));
});
test('result extraction excludes reasoning/tools/user content and bounds retained text', () => {
  assert.equal(compactResult([{ role: 'user', content: [{ type: 'text', text: 'USER' }] }, { role: 'assistant', content: [{ type: 'reasoning', text: 'SECRET' }, { type: 'text', text: 'OK' }] }]), 'OK');
  assert.ok(compactResult([{ role: 'assistant', content: [{ type: 'text', text: 'x'.repeat(15000) }] }]).length < 12200);
});
test('actual setup registers hooks and records their identity', async () => {
  const f = await fixture(); const cleanup = await f.router.setup();
  assert.deepEqual(f.calls.hooks, ['prompt', 'context', 'tool.execute.before', 'tool.execute.after', 'compaction']);
  await cleanup();
});
test('typed implementation tool also enforces independent review', async () => {
  const f = await fixture(); await f.router.setup();
  await f.router.intake(f.event('Improve the helper in the attached file'));
  const response = await f.calls.tools.dai_route.execute({ task_class: 'implementation', objective: 'Implement bounded helper' }, { sessionID: 'ses_parent', signal: new AbortController().signal });
  assert.equal(JSON.parse(response.content).review.status, 'SUCCEEDED');
  assert.deepEqual(f.calls.create.map(x => x.agent), ['dai/engineer/implementer', 'dai/shared/reviewer']);
});
test('global selection removes the current project override and stays effective', async () => {
  const f = await fixture();
  await f.registry.savePreference('retrieval', '/workspace', 'worker/old', false);
  await f.registry.savePreference('retrieval', '/workspace', 'worker/free', true);
  assert.equal((await f.registry.preference('retrieval', '/workspace')).model, 'worker/free');
});
test('cancelled form halts current request but a later explicit request can reopen choice', async () => {
  const f = await fixture(); f.setFormStatus('cancelled');
  await assert.rejects(f.router.choice('retrieval', 'ses_parent', '/workspace'), /Owner cancelled/);
  assert.equal(f.calls.create.length, 0);
  f.setFormStatus('answered'); await f.router.choice('retrieval', 'ses_parent', '/workspace');
  assert.equal(f.calls.form.filter(x => x.method === 'post').length, 2);
});
test('tool cancellation interrupts its child, preserves uncertainty, and never resends', async () => {
  const f = await fixture(); await f.router.setup();
  await f.router.intake(f.event('Find relevant sources'));
  const controller = new AbortController();
  f.ctx.session.prompt = async () => { controller.abort(); return { id: 'admitted' }; };
  f.ctx.session.wait = async () => new Promise(() => {});
  await assert.rejects(f.calls.tools.dai_route.execute({ task_class: 'retrieval', objective: 'Collect sources' }, { sessionID: 'ses_parent', signal: controller.signal }), /child interruption requested/);
  assert.deepEqual(f.calls.interrupts, ['ses_child1']);
  assert.equal(f.calls.create.length, 1);
});
test('implementation writer remains reserved until independent review finishes', async () => {
  const f = await fixture();
  const wait = f.ctx.session.wait;
  f.ctx.session.wait = async input => {
    if (input.sessionID === 'ses_child2') {
      await assert.rejects(f.registry.reserve({ id: 'competing-writer', directory: '/workspace', kind: 'implementation', text: 'different task' }, 'worker/free'), /Another implementation/);
    }
    return wait(input);
  };
  await f.router.intake(f.event('نفذ الخطة')); await f.router.context({ sessionID: 'ses_parent', system: [] });
  const newJob = await f.registry.reserve({ id: 'new-after-review', directory: '/workspace', kind: 'implementation', text: 'next task' }, 'worker/free');
  assert.equal(newJob.fresh, true);
});
test('literal resume keeps the stable original contract instead of dispatching a second child', async () => {
  const f = await fixture(); await f.router.intake(f.event('ابحث عن مصادر أصلية'));
  await f.router.context({ sessionID: 'ses_parent', system: [] });
  await f.router.intake(f.event('تابع', 'msg_next')); await f.router.context({ sessionID: 'ses_parent', system: [] });
  assert.equal(f.calls.create.length, 1);
});
test('cancellation during owner form answering sends no child or prompt', async () => {
  const f = await fixture(); const controller = new AbortController();
  const router = makeRouter(f.ctx, { registry: f.registry, formAPI: async (method, url, body) => {
    if (method === 'post') return { id: body.id };
    controller.abort(); return { state: { status: 'answered', answer: { model: 'worker/free', scope: 'global' } } };
  } });
  await router.setup(); await router.intake(f.event('Collect sources'));
  await assert.rejects(f.calls.tools.dai_route.execute({ task_class: 'retrieval', objective: 'Collect sources' }, { sessionID: 'ses_parent', signal: controller.signal }), /Owner cancelled before dispatch/);
  assert.equal(f.calls.create.length, 0); assert.equal(f.calls.prompt.length, 0);
});
test('cancellation while creating an empty child prevents the worker prompt', async () => {
  const f = await fixture(); const controller = new AbortController(); const create = f.ctx.session.create;
  f.ctx.session.create = async input => { const child = await create(input); controller.abort(); return child; };
  await f.router.setup(); await f.router.intake(f.event('Collect sources'));
  await assert.rejects(f.calls.tools.dai_route.execute({ task_class: 'retrieval', objective: 'Collect sources' }, { sessionID: 'ses_parent', signal: controller.signal }), /UNCERTAIN/);
  assert.equal(f.calls.create.length, 1); assert.equal(f.calls.prompt.length, 0);
});

test('dai-models audit mode returns audit instructions without opening forms', async () => {
  const f = await fixture(); await f.router.setup();
  const cmd = f.calls.commands['dai-models'];
  assert.ok(cmd, 'dai-models command registered');
  const out = await cmd.execute({ sessionID: 'ses_parent', prompt: { text: 'audit' } });
  assert.match(out, /تدقيق/);
  const scoped = await cmd.execute({ sessionID: 'ses_parent', prompt: { text: 'audit retrieval' } });
  assert.match(scoped, /retrieval/);
  assert.equal(f.calls.form.length, 0);
});

test('E7 owner can approve value routing; paid model wins when measured quality is materially better', async () => {
  const f = await fixture();
  f.available.push({ providerID: 'worker', id: 'paid', capabilities: { tools: true }, cost: [{ input: 5, output: 15 }] });
  await f.registry.write('config/model-profiles.json', { profiles: [
    { id: 'worker/free', benchmark_status: 'VERIFIED_OK', benchmark_evidence: 'free-run',
      quality_by_task: { retrieval: 75 } },
    { id: 'worker/paid', benchmark_status: 'VERIFIED_OK', benchmark_evidence: 'paid-run',
      quality_by_task: { retrieval: 98 } },
  ] });
  f.setAnswer({ model: '__delegate__', scope: 'global' });
  await f.router.choice('retrieval', 'ses_parent', '/workspace');
  assert.equal((await f.registry.preference('retrieval', '/workspace')).mode, 'auto');
  await f.router.dispatch({ id: 'paid-quality-run', session_id: 'ses_parent', directory: '/workspace',
    kind: 'retrieval', target_agent: 'dai/shared/explorer', text: 'Find verified sources' });
  assert.equal(f.calls.create[0].model.id, 'paid');
  const record = await f.registry.read('runtime/router/delegated/' + hash('paid-quality-run') + '.json', null);
  assert.equal(record.model, 'worker/paid');
  assert.equal(record.reason.candidates, 2);
  assert.equal(record.reason.rule, 'verified_task_quality_within_band_then_estimated_cost');
});
test('E7 value choice respects allow_worker=false and declines dispatch with no priced candidates', async () => {
  const f = await fixture();
  await f.registry.write('config/model-profiles.json', { profiles: [{ id: 'worker/free', allow_worker: false }] });
  f.setAnswer({ model: '__delegate__', scope: 'global' });
  await assert.rejects(f.router.choice('retrieval', 'ses_parent', '/workspace'), /No eligible model/);
  assert.ok(!(await f.registry.preference('retrieval', '/workspace')));
});
test('E7 missing cost data is unknown, never free; value mode is saved, not a frozen model', async () => {
  const f = await fixture();
  f.available.push({ providerID: 'worker', id: 'unknown', capabilities: { tools: true } });
  f.setAnswer({ model: '__delegate__', scope: 'global' });
  await f.router.choice('retrieval', 'ses_parent', '/workspace');
  assert.equal((await f.registry.preference('retrieval', '/workspace')).mode, 'auto');
  await f.router.dispatch({ id: 'unknown-cost-run', session_id: 'ses_parent', directory: '/workspace',
    kind: 'retrieval', target_agent: 'dai/shared/explorer', text: 'Find source files' });
  const record = await f.registry.read('runtime/router/delegated/' + hash('unknown-cost-run') + '.json', null);
  assert.equal(record.model, 'worker/free');
  assert.equal(record.reason.candidates, 1);
  assert.equal(record.reason.unknown_cost_excluded, 1);
});
test('E7 value choice refuses a catalog containing only models with unknown prices', async () => {
  const f = await fixture();
  f.available.splice(0, f.available.length, { providerID: 'worker', id: 'unknown', capabilities: { tools: true } });
  f.setAnswer({ model: '__delegate__', scope: 'global' });
  await assert.rejects(f.router.choice('retrieval', 'ses_parent', '/workspace'), /known estimated input\/output price/);
});

test('fresh child with server-assigned default variant still verifies (live regression)', async () => {
  const f = await fixture();
  const orig = f.ctx.session.create;
  f.ctx.session.create = async input => {
    const s = await orig(input);
    f.sessions[s.id].model = { providerID: input.model.providerID, id: input.model.id, variant: 'default' };
    return s;
  };
  await f.router.intake(f.event('ابحث عن مصادر أصلية'));
  await f.router.context({ sessionID: 'ses_parent', system: [] });
  assert.equal(f.calls.create.length, 1);
  assert.equal(f.calls.prompt.length, 1);
});


test('value router selects a paid model when verified task quality is materially better', () => {
  const models = [
    { providerID: 'opencode', id: 'free', capabilities: { tools: true }, cost: [{ input: 0, output: 0 }] },
    { providerID: 'opencode', id: 'paid', capabilities: { tools: true }, cost: [{ input: 1, output: 3 }] },
  ];
  const profiles = [
    { id: 'opencode/free', benchmark_status: 'VERIFIED_OK', benchmark_evidence: 'bench://retrieval/free/1', quality_by_task: { retrieval: 78 } },
    { id: 'opencode/paid', benchmark_status: 'VERIFIED_OK', benchmark_evidence: 'bench://retrieval/paid/1', quality_by_task: { retrieval: 97 } },
  ];
  const picked = selectValueModel(models, profiles, 'retrieval');
  assert.equal(picked.model, 'opencode/paid');
  assert.equal(picked.reason.selected_verified_quality, 97);
  assert.ok(picked.reason.estimated_usd > 0);
});

test('value router prefers free model when verified quality is within near-best band', () => {
  const models = [
    { providerID: 'opencode', id: 'free', cost: [{ input: 0, output: 0 }] },
    { providerID: 'opencode', id: 'paid', cost: [{ input: 1, output: 3 }] },
  ];
  const profiles = [
    { id: 'opencode/free', benchmark_status: 'VERIFIED_OK', benchmark_evidence: 'receipt-1', quality_by_task: { review: 93 } },
    { id: 'opencode/paid', benchmark_status: 'VERIFIED_OK', benchmark_evidence: 'receipt-2', quality_by_task: { review: 97 } },
  ];
  assert.equal(selectValueModel(models, profiles, 'review').model, 'opencode/free');
  assert.equal(selectValueModel(models, profiles, 'review', { quality_slack: 0 }).model, 'opencode/paid');
});

test('value router does not infer quality from a verified label without benchmark evidence', () => {
  const models = [
    { providerID: 'worker', id: 'free', cost: [{ input: 0, output: 0 }] },
    { providerID: 'worker', id: 'paid', cost: [{ input: 2, output: 4 }] },
  ];
  const profiles = [{ id: 'worker/paid', benchmark_status: 'VERIFIED_OK', quality_by_task: { implementation: 100 } }];
  const result = selectValueModel(models, profiles, 'implementation');
  assert.equal(result.model, 'worker/free');
  assert.equal(result.reason.rule, 'cost_only_quality_unverified');
  assert.equal(result.reason.selected_verified_quality, null);
});

test('unknown-cost model is never assumed free, even with a quality score', () => {
  const result = selectValueModel([
    { providerID: 'worker', id: 'unknown', cost: [] },
    { providerID: 'worker', id: 'paid', cost: [{ input: 1, output: 2 }] },
  ], [{ id: 'worker/unknown', benchmark_status: 'VERIFIED_OK',
    benchmark_evidence: 'bench://unknown', quality_by_task: { review: 100 } }], 'review');
  assert.equal(result.model, 'worker/paid');
  assert.equal(result.reason.unknown_cost_excluded, 1);
  assert.throws(() => selectValueModel([{ providerID: 'worker', id: 'unknown' }], [], 'review'), /No eligible model/);
});

test('value routing conservatively takes the most expensive catalog tier and respects budget', () => {
  const tiered = { providerID: 'worker', id: 'tiered', cost: [
    { input: 0, output: 0 }, { input: 5, output: 10 },
  ] };
  assert.equal(estimateModelCost(tiered, { input: 1000, output: 1000 }), 0.015);
  assert.throws(() => selectValueModel([tiered], [], 'retrieval',
    { max_estimated_usd_per_task: 0.001 }), /No eligible model/);
  assert.equal(selectValueModel([tiered], [], 'review',
    { max_estimated_usd_per_task: 0.1 }).model, 'worker/tiered');
  assert.throws(() => selectValueModel([tiered], [], 'review',
    { max_estimated_usd_per_task: -1 }), /nonnegative/);
});

test('owner-approved auto selection re-evaluates for every delegated task; manual choices stay pinned', async () => {
  const f = await fixture();
  f.setAnswer({ model: '__delegate__', scope: 'project' });
  f.available.push({ providerID: 'worker', id: 'paid', capabilities: { tools: true },
    cost: [{ input: 1, output: 2 }] });
  await f.registry.write('config/model-profiles.json', {
    profiles: [
      { id: 'worker/free', benchmark_status: 'VERIFIED_OK', benchmark_evidence: 'measured-free',
        quality_by_task: { retrieval: 75 } },
      { id: 'worker/paid', benchmark_status: 'VERIFIED_OK', benchmark_evidence: 'measured-paid',
        quality_by_task: { retrieval: 95 } },
    ],
  });
  const plan = n => ({ id: 'auto-job-' + n, session_id: 'ses_parent', directory: '/workspace',
    kind: 'retrieval', text: 'Find project source files', target_agent: 'dai/shared/explorer' });
  await f.router.dispatch(plan(1));
  assert.equal(f.calls.create[0].model.id, 'paid');
  assert.equal((await f.registry.preference('retrieval', '/workspace')).mode, 'auto');
  const receipt = await f.registry.read('runtime/router/delegated/' + hash('auto-job-1') + '.json', null);
  assert.equal(receipt.reason.rule, 'verified_task_quality_within_band_then_estimated_cost');
  // Catalog and verified results change; a model name must not be silently frozen by old auto policy.
  await f.registry.write('config/model-profiles.json', {
    profiles: [
      { id: 'worker/free', benchmark_status: 'VERIFIED_OK', benchmark_evidence: 'new-free-bench',
        quality_by_task: { retrieval: 98 } },
      { id: 'worker/paid', benchmark_status: 'VERIFIED_OK', benchmark_evidence: 'new-paid-bench',
        quality_by_task: { retrieval: 95 } },
    ],
  });
  await f.router.dispatch(plan(2));
  assert.equal(f.calls.create[1].model.id, 'free');
  await f.registry.savePreference('retrieval', '/workspace', 'worker/paid', false);
  await f.router.dispatch(plan(3));
  assert.equal(f.calls.create[2].model.id, 'paid');
});
