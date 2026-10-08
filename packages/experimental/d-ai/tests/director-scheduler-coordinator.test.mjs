/** Isolated tests of the production coordinator; Context/Agent/runtime are fixtures. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDirectorSchedulerWake,
  DirectorScheduler,
  isDirectorSchedulerWake,
} from '../src/director-scheduler.ts'
import { directorScheduleSchema } from '../src/director-schedule-state.ts'

const dueAt = '2026-10-08T00:00:00.000Z'
const nowMs = Date.parse(dueAt)

function fixture(t, ids = ['a', 'b', 'c'], capacity = 1) {
  const owners = ids.map(id => ({
    id,
    status: 'idle',
    inbox: { nextTurn: [], nextStep: [] },
    followup(message) { this.inbox.nextTurn.push(message) },
  }))
  const schedules = new Map(owners.map(owner => [owner.id, [directorScheduleSchema.parse({
    id: 'schedule-' + owner.id,
    planId: 'plan-' + owner.id,
    ownerAgentId: owner.id,
    enabled: true,
    intervalMs: 1000,
    maxTasksPerCycle: 1,
    leaseTtlMs: 1000,
    nextWakeAt: dueAt,
    createdAt: dueAt,
    updatedAt: dueAt,
  })]]))
  const cycles = []
  const warnings = []
  const errors = []
  let hook
  let removals = 0
  const cleanup = []
  const runtime = {
    readDirectorSchedule(agent) {
      return { ledgers: [{ ownerAgentId: agent.id, schedules: schedules.get(agent.id) ?? [] }] }
    },
    directorPlanView(agent, planId) {
      return {
        plan: { id: planId, ownerAgentId: agent.id, status: 'ACTIVE' },
        tasks: [],
        next: { selected: [{ id: 'task-' + agent.id }] },
      }
    },
    readExecution() { return { ledgers: [] } },
    async runScheduledDirectorCycle(agent, scheduleId, expectedDueAt, signal) {
      cycles.push({ agentId: agent.id, scheduleId, expectedDueAt, signal })
      return { scheduleId, planId: 'plan-' + agent.id, outcome: 'EXECUTED' }
    },
  }
  const ctx = {
    agents: { roots: () => owners.values() },
    logger: { warn: message => warnings.push(message), error: message => errors.push(message) },
    on(event, listener) {
      assert.equal(event, 'agent/pre-step')
      hook = listener
      return () => { removals++ }
    },
  }
  const scheduler = new DirectorScheduler(ctx, runtime, {
    pollMs: 60_000,
    maxConcurrentCycles: capacity,
  })
  t.after(async () => {
    for (const release of cleanup) release()
    await scheduler.dispose()
  })
  return {
    owners, schedules, cycles, runtime, scheduler, warnings, errors,
    onCleanup(release) { cleanup.push(release) },
    get removals() { return removals },
    dispatch(agent, messages, signal = new AbortController().signal, next = () => {
      assert.fail('a sole valid wake must not reach the model')
    }) { return hook({ agent, messages, signal }, next) },
    async consume(agent) {
      const message = agent.inbox.nextTurn.shift()
      assert.ok(message, 'expected a queued wake')
      assert.deepEqual(await this.dispatch(agent, [message]), { kind: 'reject' })
    },
  }
}

test('capacity one gives every continuously due owner a pre-step admission in turn', { timeout: 5_000 }, async t => {
  const h = fixture(t, ['a', 'b', 'c'])
  for (let i = 0; i < 90; i++) {
    h.scheduler.scan(nowMs)
    const queued = h.owners.filter(owner => owner.inbox.nextTurn.length > 0)
    assert.equal(queued.length, 1)
    assert.equal(queued[0].id, ['a', 'b', 'c'][i % 3])
    assert.ok(Object.isFrozen(queued[0].inbox.nextTurn[0]))
    await h.consume(queued[0])
  }
  assert.deepEqual(h.cycles.slice(0, 6).map(cycle => cycle.agentId), ['a', 'b', 'c', 'a', 'b', 'c'])
  assert.equal(h.cycles.length, 90)
  assert.ok(h.cycles.every(cycle => cycle.expectedDueAt === dueAt))
  assert.deepEqual(h.errors, [])
})

test('a scan admits one schedule per owner and preserves within-owner least-attempted ordering', { timeout: 5_000 }, t => {
  const h = fixture(t, ['a', 'b'], 3)
  const first = h.schedules.get('a')[0]
  h.schedules.set('a', [
    { ...first, id: 'previously-run', lastCycle: {
      attemptedAt: dueAt, outcome: 'EXECUTED', executedTasks: 1, phase: 'EXECUTING',
    } },
    { ...first, id: 'never-run' },
  ])
  h.scheduler.scan(nowMs)
  assert.deepEqual(h.owners.map(owner => owner.inbox.nextTurn.length), [1, 1])
  assert.equal(JSON.parse(h.owners[0].inbox.nextTurn[0].content[0].text).scheduleId, 'never-run')
  h.scheduler.scan(nowMs)
  assert.deepEqual(h.owners.map(owner => owner.inbox.nextTurn.length), [1, 1])
})

test('queued wakes in both inbox lanes and active cycles share the global capacity', { timeout: 5_000 }, async t => {
  const h = fixture(t, ['a', 'b', 'c'], 2)
  const [a, b, c] = h.owners
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  const original = h.runtime.runScheduledDirectorCycle
  h.runtime.runScheduledDirectorCycle = async (...args) => {
    if (args[0].id === 'a') { entered.resolve(); await release.promise }
    return original(...args)
  }
  h.onCleanup(() => release.resolve())
  h.scheduler.scan(nowMs)
  b.inbox.nextStep.push(b.inbox.nextTurn.shift())
  const pending = h.dispatch(a, [a.inbox.nextTurn.shift()])
  await entered.promise
  h.scheduler.scan(nowMs)
  assert.equal(c.inbox.nextTurn.length, 0)
  assert.equal(b.inbox.nextStep.length, 1)
  assert.deepEqual(await h.dispatch(b, [b.inbox.nextStep.shift()]), { kind: 'reject' })
  h.scheduler.scan(nowMs)
  assert.equal(c.inbox.nextTurn.length, 1)
  h.scheduler.scan(nowMs)
  assert.equal(c.inbox.nextTurn.length, 1)
  release.resolve()
  await pending
})

test('busy owners and queued human work do not block eligible owners or get overwritten', { timeout: 5_000 }, t => {
  const h = fixture(t)
  const [a, b, c] = h.owners
  a.status = 'running'
  const human = { source: { kind: 'human' }, content: [{ type: 'text', text: 'continue' }] }
  b.inbox.nextTurn.push(human)
  h.scheduler.scan(nowMs)
  assert.equal(a.inbox.nextTurn.length, 0)
  assert.deepEqual(b.inbox.nextTurn, [human])
  assert.equal(c.inbox.nextTurn.length, 1)
})

test('enqueue failure retains the cursor until an owner is successfully admitted', { timeout: 5_000 }, async t => {
  const h = fixture(t)
  const [a, b, c] = h.owners
  h.scheduler.scan(nowMs)
  await h.consume(a)
  a.status = 'running'
  const followup = b.followup
  b.followup = () => { throw new Error('owner closing') }
  c.status = 'running'
  h.scheduler.scan(nowMs)
  assert.equal(b.inbox.nextTurn.length, 0)
  b.followup = followup
  c.status = 'idle'
  h.scheduler.scan(nowMs)
  assert.equal(b.inbox.nextTurn.length, 1)
  assert.equal(c.inbox.nextTurn.length, 0)
  assert.equal(h.warnings.length, 1)
})

test('owner removal and later joining preserve rotation after the last admitted identity', { timeout: 5_000 }, async t => {
  const h = fixture(t)
  h.scheduler.scan(nowMs)
  await h.consume(h.owners[0])
  h.owners.shift()
  h.scheduler.scan(nowMs)
  await h.consume(h.owners[0])
  const newcomer = { ...h.owners[0], id: 'bb', inbox: { nextTurn: [], nextStep: [] } }
  const schedule = h.schedules.get('b')[0]
  h.schedules.set('bb', [{ ...schedule, id: 'schedule-bb', planId: 'plan-bb', ownerAgentId: 'bb' }])
  h.owners.push(newcomer)
  h.scheduler.scan(nowMs)
  assert.equal(newcomer.inbox.nextTurn.length, 1)
  assert.equal(h.owners.find(owner => owner.id === 'c').inbox.nextTurn.length, 0)
})

test('an unreadable owner state or plan is contained and does not prevent another admission', { timeout: 5_000 }, t => {
  const h = fixture(t)
  const read = h.runtime.readDirectorSchedule
  h.runtime.readDirectorSchedule = agent => {
    if (agent.id === 'a') throw new Error('projection unavailable')
    return read(agent)
  }
  const plan = h.runtime.directorPlanView
  h.runtime.directorPlanView = (agent, ...args) => {
    if (agent.id === 'b') throw new Error('plan unavailable')
    return plan(agent, ...args)
  }
  h.scheduler.scan(nowMs)
  assert.deepEqual(h.owners.map(owner => owner.inbox.nextTurn.length), [0, 0, 1])
  assert.equal(h.warnings.length, 2)
  assert.deepEqual(h.errors, [])
})

test('disabled, future, stagnant and completed schedules never enter the inbox', { timeout: 5_000 }, t => {
  const h = fixture(t, ['disabled', 'future', 'stagnant', 'complete', 'ready'], 4)
  for (const id of ['disabled', 'future', 'stagnant']) {
    const schedule = h.schedules.get(id)[0]
    h.schedules.set(id, [{ ...schedule,
      ...(id === 'disabled' ? { enabled: false } : {}),
      ...(id === 'future' ? { nextWakeAt: '2026-10-08T01:00:00.000Z' } : {}),
      ...(id === 'stagnant' ? { maxConsecutiveFailures: 2, consecutiveFailures: 2 } : {}),
    }])
  }
  const plan = h.runtime.directorPlanView
  h.runtime.directorPlanView = (agent, ...args) => {
    const view = plan(agent, ...args)
    return agent.id === 'complete' ? { ...view, plan: { ...view.plan, status: 'COMPLETE' } } : view
  }
  h.scheduler.scan(nowMs)
  assert.deepEqual(h.owners.map(owner => owner.inbox.nextTurn.length), [0, 0, 0, 0, 1])
})

test('the real wake schema rejects malformed, non-schedule, extra-field and invalid-date messages', { timeout: 5_000 }, async t => {
  const h = fixture(t, ['a'])
  const valid = createDirectorSchedulerWake(h.schedules.get('a')[0])
  const payload = JSON.parse(valid.content[0].text)
  const variants = [
    { ...valid, source: { kind: 'human' } },
    { ...valid, content: [{ type: 'text', text: '{broken' }] },
    { ...valid, content: [{ type: 'text', text: JSON.stringify({ ...payload, extra: true }) }] },
    { ...valid, content: [{ type: 'text', text: JSON.stringify({ ...payload, dueAt: 'not-a-date' }) }] },
    { ...valid, content: [{ type: 'text', text: JSON.stringify({ ...payload, scheduleId: '' }) }] },
    { ...valid, content: [{ type: 'text', text: JSON.stringify({ ...payload, protocol: 'unknown' }) }] },
    { ...valid, content: [valid.content[0], valid.content[0]] },
  ]
  let forwarded = 0
  for (const message of variants) {
    assert.equal(isDirectorSchedulerWake(message), false)
    assert.deepEqual(await h.dispatch(h.owners[0], [message], undefined, () => {
      forwarded++
      return { kind: 'continue' }
    }), { kind: 'continue' })
  }
  assert.equal(forwarded, variants.length)
  assert.equal(h.cycles.length, 0)
})

test('a failing cycle releases admission and a duplicate active wake never starts another cycle', { timeout: 5_000 }, async t => {
  const h = fixture(t, ['a', 'b'])
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  let calls = 0
  h.runtime.runScheduledDirectorCycle = async () => {
    calls++
    entered.resolve()
    await release.promise
    throw new Error('cycle failed')
  }
  h.onCleanup(() => release.resolve())
  h.scheduler.scan(nowMs)
  const wake = h.owners[0].inbox.nextTurn.shift()
  const pending = h.dispatch(h.owners[0], [wake])
  await entered.promise
  assert.deepEqual(await h.dispatch(h.owners[0], [wake]), { kind: 'reject' })
  assert.equal(calls, 1)
  h.scheduler.scan(nowMs)
  assert.equal(h.owners[1].inbox.nextTurn.length, 0)
  release.resolve()
  assert.deepEqual(await pending, { kind: 'reject' })
  h.scheduler.scan(nowMs)
  assert.equal(h.owners[1].inbox.nextTurn.length, 1)
  assert.equal(h.warnings.length, 1)
})

test('dispose aborts in-flight work and waits for its cleanup before returning', { timeout: 5_000 }, async t => {
  const h = fixture(t, ['a'])
  const entered = Promise.withResolvers()
  const cleanupStarted = Promise.withResolvers()
  const cleanupFinished = Promise.withResolvers()
  let cycleSignal
  h.runtime.runScheduledDirectorCycle = async (_agent, scheduleId, _due, signal) => {
    cycleSignal = signal
    entered.resolve()
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    cleanupStarted.resolve()
    await cleanupFinished.promise
    return { scheduleId, planId: 'plan-a', outcome: 'IDLE' }
  }
  h.onCleanup(() => cleanupFinished.resolve())
  h.scheduler.scan(nowMs)
  const pending = h.dispatch(h.owners[0], [h.owners[0].inbox.nextTurn.shift()])
  await entered.promise
  let disposed = false
  const disposal = h.scheduler.dispose().then(() => { disposed = true })
  await cleanupStarted.promise
  assert.equal(cycleSignal.aborted, true)
  assert.equal(disposed, false)
  assert.equal(h.removals, 1)
  h.scheduler.scan(nowMs)
  assert.equal(h.owners[0].inbox.nextTurn.length, 0)
  cleanupFinished.resolve()
  await Promise.all([pending, disposal])
  assert.equal(disposed, true)
  assert.deepEqual(h.errors, [])
})

test('cancellation before deferred startup does not dispatch a Director cycle', { timeout: 5_000 }, async t => {
  const h = fixture(t, ['a'])
  const cancelled = new AbortController()
  h.scheduler.scan(nowMs)
  const pending = h.dispatch(h.owners[0], [h.owners[0].inbox.nextTurn.shift()], cancelled.signal)
  cancelled.abort(new Error('turn cancelled'))
  assert.deepEqual(await pending, { kind: 'reject' })
  assert.equal(h.cycles.length, 0)
  assert.equal(h.warnings.length, 1)
  h.scheduler.scan(nowMs)
  assert.equal(h.owners[0].inbox.nextTurn.length, 1)
})
