/** REAL Loader composition coverage for unattended Mission Director scheduling. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as DomainStorage from '@deepseek-ai/dsh-storage-domain'
import WebRuntime from '@deepseek-ai/dsh-web'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import Approval, { type ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { describe, expect, it, vi } from 'vitest'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import DAI from '../src/index.ts'
import { DirectorScheduler, createDirectorSchedulerWake } from '../src/director-scheduler.ts'
import { DirectorOwnerRecovery } from '../src/director-recovery.ts'
import type { Config } from '../src/config.ts'

async function boot(root: string, script: ConstructorParameters<typeof MockAdapter>[0], config: Config = {}) {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(Storage)
  await ctx.plugin(JsonStorage, { root: join(root, 'data') })
  await ctx.plugin(DomainStorage, { backend: 'json' })
  await ctx.plugin(WebRuntime)
  await ctx.plugin(Subagents)
  await ctx.plugin(Spawn, { providerName: 'spawn' })
  await ctx.plugin(Approval, { policy: 'ask' })

  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, JSON.stringify([{
    name: '@deepseek-ai/dsh-experimental-d-ai',
    config: { allowedTools: [], directorSchedulerEnabled: false, ...config },
  }]))
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)

  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = ({
    version: 'v2',
    import: async (specifier: string) => {
      if (specifier !== '@deepseek-ai/dsh-experimental-d-ai') {
        throw new Error('Unexpected Loader plugin ' + specifier)
      }
      return { default: DAI }
    },
  } as never)
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  expect([...ctx.loader.entries()].filter(entry => !entry.disabled && entry.fiber === undefined)).toEqual([])

  return { ctx, adapter }
}

async function temporary<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-scheduler-loader-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI unattended Director REAL composition', () => {
  it('loads through Cordis, wakes a native turn and commits one scheduled task without a parent model request', async () => temporary(async (root) => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx, adapter } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))

    const agent = await ctx.agentLoop.create(
      SessionId('scheduler-loader-owner'),
      { provider: 'mock', model: 'fixture' },
    )
    const objective = 'Run one Loader-composed unattended investigation task'
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!

    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', {
        objective,
        primary_system: 'investigation',
      }),
      () => toolCallResponse('task', 'd_ai_director_task_add', {
        plan_id: plan().id,
        system_id: 'investigation',
        title: 'Execute the Loader-composed scheduled task',
      }),
      () => toolCallResponse('schedule', 'd_ai_director_schedule_set', {
        plan_id: plan().id,
        enabled: true,
        interval_ms: 1000,
        max_tasks_per_cycle: 1,
        lease_ttl_ms: 60000,
        start_immediately: true,
      }),
      textResponse('Schedule configured through the Loader-composed D_AI plugin'),
      textResponse(JSON.stringify({
        outcome: 'COMPLETED',
        summary: 'Loader-composed scheduled task completed.',
        artifactRefs: [],
      })),
    )

    let scheduler: DirectorScheduler | undefined
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: objective }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()
      expect(adapter.requests).toHaveLength(4)

      scheduler = new DirectorScheduler(ctx, ctx.dai, { pollMs: 60000, maxConcurrentCycles: 1 })
      scheduler.scan(Date.now())
      await agent.whenIdle()

      expect(adapter.requests).toHaveLength(5)
      expect(ctx.dai.readTaskLedger(agent).ledgers[0]?.tasks[0]?.state).toBe('COMPLETED')
      expect(ctx.dai.readDirectorSchedule(agent).ledgers[0]?.schedules[0]?.lastCycle)
        .toMatchObject({ outcome: 'EXECUTED', executedTasks: 1, phase: 'COMPLETE' })

      const schedulerTurns = agent.session.snapshotEvents().flatMap(event =>
        event.type === 'agent/inbox/spliced' ? event.data.inserted : []).filter(message => message.source.kind === 'schedule')
      expect(schedulerTurns).toHaveLength(1)
    } finally {
      await scheduler?.dispose()
      await ctx.fiber.dispose()
    }
  }), 20000)
})

const recoveryRoute = { sessionId: 'cold-scheduler-owner', provider: 'mock', model: 'fixture', maxEvents: 10000 }
const completedResponse = () => textResponse(JSON.stringify({
  outcome: 'COMPLETED', summary: 'Recovered scheduled task completed.', artifactRefs: [],
}))

async function saveColdOwner(root: string, options: { enabled?: boolean; pending?: 'wake' | 'human' } = {}) {
  const script: ConstructorParameters<typeof MockAdapter>[0] = []
  const { ctx } = await boot(root, script)
  ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))
  const handle = await ctx.agents.withoutInitiator(() => ctx.agents.create({
    sessionId: SessionId(recoveryRoute.sessionId), agentOptions: { provider: 'mock', model: 'fixture' },
  }))
  try {
    const agent = handle.agent
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!
    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', {
        objective: 'Recover an approved scheduled task', primary_system: 'investigation',
      }),
      () => toolCallResponse('task', 'd_ai_director_task_add', {
        plan_id: plan().id, system_id: 'investigation', title: 'Run after restart',
      }),
      () => toolCallResponse('schedule', 'd_ai_director_schedule_set', {
        plan_id: plan().id, enabled: options.enabled ?? true, interval_ms: 1000,
        max_tasks_per_cycle: 1, lease_ttl_ms: 60000, start_immediately: true,
      }), textResponse('Approved schedule saved'),
    )
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Set up the schedule' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    const schedule = ctx.dai.readDirectorSchedule(agent).ledgers[0]!.schedules[0]!
    // Disposal drains the native inbox. A crash fixture appends the exact
    // native splice afterward so pending input survives without rewriting history.
    const message = options.pending === 'wake' ? createDirectorSchedulerWake(schedule)
      : createUserMessage({ content: [{ type: 'text', text: 'Human input must survive' }], source: { kind: 'user' } })
    const before = agent.session.snapshotEvents().length
    agent.inbox.append('next-turn', message)
    const splice = agent.session.snapshotEvents()[before]!
    await handle.dispose()
    if (options.pending !== undefined) {
      const writer = await ctx.sessionPersistence.open(SessionId(recoveryRoute.sessionId), 'write')
      try {
        const read = await writer.read()
        await writer.append([{ ...splice, seq: SessionSeq(read.events.length) }])
        await writer.flush()
      } finally { await writer.close() }
    }
  } finally { await ctx.fiber.dispose() }
}

for (const pending of [undefined, 'wake'] as const) {
  it('recovers a cold Loader owner with ' + (pending ?? 'empty inbox') + ' and leaves completed owners cold', async () => temporary(async (root) => {
    await saveColdOwner(root, pending === undefined ? {} : { pending })
    const { ctx, adapter } = await boot(root, [completedResponse()], {
      directorSchedulerEnabled: true, directorSchedulerPollMs: 10,
      directorSchedulerResumeOwners: [recoveryRoute],
    })
    try {
      await expect.poll(() => {
        const agent = ctx.agents.get(SessionId(recoveryRoute.sessionId))
        return agent === undefined ? undefined : ctx.dai.readTaskLedger(agent).ledgers[0]?.tasks[0]?.state
      }).toBe('COMPLETED')
      const agent = ctx.agents.get(SessionId(recoveryRoute.sessionId))!
      await agent.whenIdle()
      expect(adapter.requests).toHaveLength(1)
      expect(ctx.dai.readDirectorSchedule(agent).ledgers[0]?.schedules[0]?.lastCycle?.outcome).toBe('EXECUTED')
    } finally { await ctx.fiber.dispose() }
    const final = await boot(root, [])
    const recovery = new DirectorOwnerRecovery(final.ctx, [recoveryRoute])
    try {
      await recovery.scan(Date.now() + 100000, new AbortController().signal, 1)
      expect([...final.ctx.agents.roots()]).toHaveLength(0)
      expect(final.adapter.requests).toHaveLength(0)
    } finally { await recovery.dispose(); await final.ctx.fiber.dispose() }
  }), 20000)
}

for (const options of [{ enabled: false }, { pending: 'human' as const }]) {
  it('keeps an ineligible cold owner inactive: ' + JSON.stringify(options), async () => temporary(async (root) => {
    await saveColdOwner(root, options)
    const { ctx, adapter } = await boot(root, [])
    const recovery = new DirectorOwnerRecovery(ctx, [recoveryRoute])
    const opens = vi.spyOn(ctx.sessionPersistence, 'open')
    try {
      await recovery.scan(Date.now(), new AbortController().signal, 1)
      await recovery.scan(Date.now() + 100, new AbortController().signal, 1)
      expect([...ctx.agents.roots()]).toHaveLength(0)
      expect(adapter.requests).toHaveLength(0)
      expect(opens).toHaveBeenCalledTimes(1)
      expect(opens.mock.calls[0]?.[1]).toBe('read')
    } finally { opens.mockRestore(); await recovery.dispose(); await ctx.fiber.dispose() }
  }), 20000)
}

it('refuses replay overflow and respects zero capacity and explicitly excluded owners', async () => temporary(async (root) => {
  await saveColdOwner(root)
  const { ctx } = await boot(root, [])
  const overflow = new DirectorOwnerRecovery(ctx, [{ ...recoveryRoute, maxEvents: 1 }])
  const excluded = new DirectorOwnerRecovery(ctx, [{ ...recoveryRoute, sessionId: 'other-owner' }])
  const recovery = new DirectorOwnerRecovery(ctx, [recoveryRoute])
  try {
    await overflow.scan(Date.now(), new AbortController().signal, 1)
    await excluded.scan(Date.now(), new AbortController().signal, 1)
    await recovery.scan(Date.now(), new AbortController().signal, 0)
    expect([...ctx.agents.roots()]).toHaveLength(0)
  } finally { await overflow.dispose(); await excluded.dispose(); await recovery.dispose(); await ctx.fiber.dispose() }
}), 20000)

it('leaves pre-existing live roots owned by their original caller', async () => temporary(async (root) => {
  await saveColdOwner(root)
  const { ctx } = await boot(root, [])
  const handle = await ctx.agents.withoutInitiator(() => ctx.agents.resume({
    resumeSessionId: SessionId(recoveryRoute.sessionId), agentOptions: { provider: 'mock', model: 'fixture' },
  }))
  const recovery = new DirectorOwnerRecovery(ctx, [recoveryRoute])
  try {
    await recovery.scan(Date.now(), new AbortController().signal, 1)
    await recovery.dispose()
    expect(ctx.agents.get(handle.agent.id)).toBe(handle.agent)
  } finally { await handle.dispose(); await ctx.fiber.dispose() }
}), 20000)

it('revalidates human input arriving after inspection before native publication', async () => temporary(async (root) => {
  await saveColdOwner(root)
  const { ctx, adapter } = await boot(root, [])
  const recovery = new DirectorOwnerRecovery(ctx, [recoveryRoute])
  const resume = ctx.agents.resume.bind(ctx.agents)
  const message = createUserMessage({ content: [{ type: 'text', text: 'Late human input' }], source: { kind: 'user' } })
  const interception = vi.spyOn(ctx.agents, 'resume').mockImplementation(async (options) => {
    const writer = await ctx.sessionPersistence.open(options.resumeSessionId, 'write')
    try {
      const read = await writer.read()
      await writer.append([{
        seq: SessionSeq(read.events.length), time: Date.now(), type: 'agent/inbox/spliced',
        data: { target: 'next-turn', start: 0, removedCount: 0, inserted: [message] },
      }])
      await writer.flush()
    } finally { await writer.close() }
    return resume(options)
  })
  try {
    await recovery.scan(Date.now(), new AbortController().signal, 1)
    expect(interception).toHaveBeenCalledTimes(1)
    expect([...ctx.agents.roots()]).toHaveLength(0)
    expect(adapter.requests).toHaveLength(0)
    const reader = await ctx.sessionPersistence.open(SessionId(recoveryRoute.sessionId), 'read')
    try {
      const read = await reader.read()
      const session = ctx.sessions.prepare(SessionId(recoveryRoute.sessionId), { seed: read.events, meta: reader.header })
      expect(ctx.sessionProjections.stateOf(session, 'inbox')?.['next-turn'].map(item => item.id)).toEqual([message.id])
    } finally { await reader.close() }
  } finally { interception.mockRestore(); await recovery.dispose(); await ctx.fiber.dispose() }
}), 20000)

it('closes inspection on cancellation without publishing a root', async () => temporary(async (root) => {
  await saveColdOwner(root)
  const { ctx } = await boot(root, [])
  const recovery = new DirectorOwnerRecovery(ctx, [recoveryRoute])
  const controller = new AbortController()
  const open = ctx.sessionPersistence.open.bind(ctx.sessionPersistence)
  let closed = false
  const interception = vi.spyOn(ctx.sessionPersistence, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args)
    const read = handle.read.bind(handle)
    const close = handle.close.bind(handle)
    vi.spyOn(handle, 'read').mockImplementation(async (...readArgs) => {
      const result = await read(...readArgs)
      controller.abort(new Error('cancelled at inspection barrier'))
      return result
    })
    vi.spyOn(handle, 'close').mockImplementation(async () => { await close(); closed = true })
    return handle
  })
  try {
    await expect(recovery.scan(Date.now(), controller.signal, 1)).rejects.toThrow('cancelled at inspection barrier')
    expect(closed).toBe(true)
    expect([...ctx.agents.roots()]).toHaveLength(0)
  } finally { interception.mockRestore(); await recovery.dispose(); await ctx.fiber.dispose() }
}), 20000)
