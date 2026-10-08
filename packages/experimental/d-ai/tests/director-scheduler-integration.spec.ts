/** D_AI unattended Mission Director integration tests. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
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
import { DirectorScheduler } from '../src/director-scheduler.ts'
import type { DirectorScheduleState } from '../src/director-schedule-state.ts'
import type { TaskLedgerState } from '../src/task-ledger-state.ts'

async function boot(root: string, script: ConstructorParameters<typeof MockAdapter>[0]) {
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
  await ctx.plugin(DAI, {
    allowedTools: [],
    directorSchedulerEnabled: false,
  })

  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

async function temporary<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-director-scheduler-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI unattended Mission Director', () => {
  it('admits another due owner before repeating a still-runnable owner at capacity one', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx, adapter } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))
    let scheduler: DirectorScheduler | undefined
    let clockOwned = false
    try {
      const owners: Agent[] = []
      for (const id of ['fair-owner-a', 'fair-owner-b']) {
        const agent = await ctx.agentLoop.create(SessionId(id), { provider: 'mock', model: 'fixture' })
        owners.push(agent)
        const objective = 'Run two approved tasks for ' + id
        const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!
        script.push(
          toolCallResponse('plan-' + id, 'd_ai_director_plan_create', { objective, primary_system: 'investigation' }),
          () => toolCallResponse('task-one-' + id, 'd_ai_director_task_add', {
            plan_id: plan().id, system_id: 'investigation', title: 'First task for ' + id,
          }),
          () => toolCallResponse('task-two-' + id, 'd_ai_director_task_add', {
            plan_id: plan().id, system_id: 'investigation', title: 'Second task for ' + id,
          }),
          () => toolCallResponse('schedule-' + id, 'd_ai_director_schedule_set', {
            plan_id: plan().id, enabled: true, interval_ms: 1000,
            max_tasks_per_cycle: 1, lease_ttl_ms: 60000, start_immediately: true,
          }),
          textResponse('Schedule approved'),
        )
        agent.followup(createUserMessage({ content: [{ type: 'text', text: objective }], source: { kind: 'user' } }))
        await agent.whenIdle()
      }

      script.push(...owners.map(() => textResponse(JSON.stringify({
        outcome: 'COMPLETED', summary: 'One scheduled task completed.', artifactRefs: [],
      }))))
      scheduler = new DirectorScheduler(ctx, ctx.dai, { pollMs: 60000, maxConcurrentCycles: 1 })
      scheduler.scan(Date.now())
      await Promise.all(owners.map(agent => agent.whenIdle()))
      expect(owners.map(agent => ctx.dai.readTaskLedger(agent).ledgers[0]!.tasks.filter(task => task.state === 'COMPLETED').length))
        .toEqual([1, 0])

      // Make the first owner's next interval due without advancing poll timers.
      const nextDue = ctx.dai.readDirectorSchedule(owners[0]!).ledgers[0]!.schedules[0]!.nextWakeAt
      vi.useFakeTimers({ toFake: ['Date'] })
      clockOwned = true
      vi.setSystemTime(Date.parse(nextDue))
      scheduler.scan(Date.now())
      await Promise.all(owners.map(agent => agent.whenIdle()))

      expect(adapter.requests).toHaveLength(12)
      expect(owners.map(agent => ctx.dai.readTaskLedger(agent).ledgers[0]!.tasks.filter(task => task.state === 'COMPLETED').length))
        .toEqual([1, 1])
      expect(owners.map(agent => ctx.dai.readDirectorSchedule(agent).ledgers[0]!.schedules[0]!.lastCycle?.outcome))
        .toEqual(['EXECUTED', 'EXECUTED'])
    } finally {
      if (clockOwned) vi.useRealTimers()
      await scheduler?.dispose()
      await ctx.fiber.dispose()
    }
  }), 20000)

  it('wakes an idle owner, executes inside a native turn, persists a cycle receipt and replays after restart', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx, adapter } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))

    const agent = await ctx.agentLoop.create(
      SessionId('director-scheduler-owner'),
      { provider: 'mock', model: 'fixture' },
    )
    const objective = 'Execute one approved investigation task unattended'
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!

    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', {
        objective,
        primary_system: 'investigation',
      }),
      () => toolCallResponse('task', 'd_ai_director_task_add', {
        plan_id: plan().id,
        system_id: 'investigation',
        title: 'Collect the approved evidence',
      }),
      () => toolCallResponse('schedule', 'd_ai_director_schedule_set', {
        plan_id: plan().id,
        enabled: true,
        interval_ms: 1000,
        max_tasks_per_cycle: 1,
        max_consecutive_failures: 3,
        max_consecutive_idle_cycles: 2,
        lease_ttl_ms: 60000,
        start_immediately: true,
      }),
      textResponse('Unattended schedule configured'),
      textResponse(JSON.stringify({
        outcome: 'COMPLETED',
        summary: 'Scheduled evidence task completed.',
        artifactRefs: ['artifact://fixture/scheduled-evidence.json'],
      })),
    )

    let expectedSchedule: DirectorScheduleState
    let expectedTasks: TaskLedgerState
    let scheduler: DirectorScheduler | undefined
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: objective }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      expect(adapter.requests).toHaveLength(4)
      const configured = ctx.dai.readDirectorSchedule(agent).ledgers[0]!.schedules[0]!
      expect(configured).toMatchObject({
        planId: plan().id,
        enabled: true,
        maxTasksPerCycle: 1,
        maxParallelTasks: 1,
        maxConsecutiveFailures: 3,
        maxConsecutiveIdleCycles: 2,
        consecutiveFailures: 0,
        consecutiveIdleCycles: 0,
        leaseTtlMs: 60000,
      })

      scheduler = new DirectorScheduler(ctx, ctx.dai, { pollMs: 60000, maxConcurrentCycles: 1 })
      scheduler.scan(Date.now())
      await agent.whenIdle()

      expectedSchedule = ctx.dai.readDirectorSchedule(agent)
      expectedTasks = ctx.dai.readTaskLedger(agent)

      expect(adapter.requests).toHaveLength(5)
      expect(expectedTasks.ledgers[0]?.tasks[0]?.state).toBe('COMPLETED')
      expect(expectedSchedule.ledgers[0]?.revision).toBe(2)
      expect(expectedSchedule.ledgers[0]?.schedules[0]?.lastCycle).toMatchObject({
        outcome: 'EXECUTED',
        executedTasks: 1,
        phase: 'COMPLETE',
      })
      expect(Date.parse(expectedSchedule.ledgers[0]!.schedules[0]!.nextWakeAt))
        .toBeGreaterThan(Date.parse(expectedSchedule.ledgers[0]!.schedules[0]!.lastCycle!.attemptedAt))

      const schedulerMessages = agent.session.snapshotEvents().flatMap(event =>
        event.type === 'agent/inbox/spliced' ? event.data.inserted : []).filter(message => message.source.kind === 'schedule')
      expect(schedulerMessages).toHaveLength(1)
      await ctx.sessions.flush(agent.session)
    } finally {
      await scheduler?.dispose()
      await ctx.fiber.dispose()
    }

    const second = await boot(root, [])
    try {
      const handle = await second.ctx.agents.resume({
        resumeSessionId: SessionId('director-scheduler-owner'),
        agentOptions: { provider: 'mock', model: 'fixture' },
      })
      expect(second.ctx.dai.readDirectorSchedule(handle.agent)).toEqual(expectedSchedule!)
      expect(second.ctx.dai.readTaskLedger(handle.agent)).toEqual(expectedTasks!)
      await handle.dispose()
    } finally {
      await second.ctx.fiber.dispose()
    }
  }), 20000)

  it('requires human approval before unattended execution is enabled', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const agent = await ctx.agentLoop.create(
      SessionId('director-scheduler-denied'),
      { provider: 'mock', model: 'fixture' },
    )
    const objective = 'Create a plan but do not approve unattended execution'
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!

    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', {
        objective,
        primary_system: 'investigation',
      }),
      () => toolCallResponse('schedule', 'd_ai_director_schedule_set', {
        plan_id: plan().id,
        enabled: true,
        interval_ms: 1000,
        lease_ttl_ms: 60000,
      }),
      textResponse('Schedule was not enabled'),
    )

    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: objective }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      expect(plan().status).toBe('ACTIVE')
      expect(ctx.dai.readDirectorSchedule(agent).ledgers).toEqual([])
      expect(agent.session.snapshotEvents().filter(event => event.type === 'approval/decided')).toHaveLength(1)
    } finally {
      await ctx.fiber.dispose()
    }
  }))

  it('aborts an active cycle and waits for its cleanup before disposal completes', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))
    const agent = await ctx.agentLoop.create(SessionId('scheduler-disposal-owner'), { provider: 'mock', model: 'fixture' })
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!
    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', { objective: 'Exercise scheduler shutdown', primary_system: 'investigation' }),
      () => toolCallResponse('task', 'd_ai_director_task_add', { plan_id: plan().id, system_id: 'investigation', title: 'Owned scheduled work' }),
      () => toolCallResponse('schedule', 'd_ai_director_schedule_set', { plan_id: plan().id, enabled: true, interval_ms: 1000, start_immediately: true }),
      textResponse('Schedule approved'),
    )
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    let finish!: () => void
    const cleanup = new Promise<void>(resolve => { finish = resolve })
    let cycleSignal: AbortSignal | undefined
    let scheduler: DirectorScheduler | undefined
    let disposal: Promise<void> | undefined
    let disposed = false
    try {
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Configure shutdown test' }], source: { kind: 'user' } }))
      await agent.whenIdle()
      scheduler = new DirectorScheduler(ctx, {
        readDirectorSchedule: current => ctx.dai.readDirectorSchedule(current),
        directorPlanView: (current, id, limit) => ctx.dai.directorPlanView(current, id, limit),
        readExecution: current => ctx.dai.readExecution(current),
        runScheduledDirectorCycle: async (current, scheduleId, _dueAt, signal) => {
          expect(current).toBe(agent)
          cycleSignal = signal
          entered()
          await cleanup
          signal.throwIfAborted()
          return { scheduleId, planId: plan().id, outcome: 'IDLE' }
        },
      }, { pollMs: 60000, maxConcurrentCycles: 1 })
      scheduler.scan(Date.now())
      await started
      disposal = scheduler.dispose().then(() => { disposed = true })
      expect(cycleSignal?.aborted).toBe(true)
      expect(disposed).toBe(false)
      finish()
      await disposal
      await agent.whenIdle()
      expect(disposed).toBe(true)
      scheduler.scan(Date.now())
      expect(agent.inbox.nextTurn).toEqual([])
      expect(ctx.dai.readDirectorSchedule(agent).ledgers[0]?.revision).toBe(1)
    } finally {
      finish()
      await disposal
      await scheduler?.dispose()
      await ctx.fiber.dispose()
    }
  }), 20000)
})
