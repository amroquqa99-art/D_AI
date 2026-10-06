/** D_AI Mission Director durable runtime integration tests. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
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
import type { DirectorState } from '../src/director-state.ts'
import type { TaskLedgerState } from '../src/task-ledger-state.ts'
import { DirectorScheduler } from '../src/director-scheduler.ts'

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
  await ctx.plugin(DAI, { allowedTools: [] })
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

async function temporary<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-director-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI durable Mission Director', () => {
  it('coordinates cross-system task dependencies and derives plan phase from authoritative task state', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))

    const agent = await ctx.agentLoop.create(SessionId('director-owner'), { provider: 'mock', model: 'fixture' })
    const objective = 'Investigate a company and then analyze its financial evidence'
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!
    const tasks = () => ctx.dai.readTaskLedger(agent).ledgers[0]!.tasks

    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', {
        objective,
        primary_system: 'investigation',
        stop_conditions: 'Evidence chain is auditable\nFinancial analysis has independent support',
      }),
      () => toolCallResponse('investigate', 'd_ai_director_task_add', {
        plan_id: plan().id,
        system_id: 'investigation',
        title: 'Collect and verify the company evidence',
        priority: 20,
        max_attempts: 3,
      }),
      () => toolCallResponse('finance', 'd_ai_director_task_add', {
        plan_id: plan().id,
        system_id: 'investor',
        title: 'Analyze the verified company financial evidence',
        depends_on: tasks()[0]!.id,
        priority: 10,
        max_attempts: 3,
      }),
      () => toolCallResponse('view-initial', 'd_ai_director_plan_view', {
        plan_id: plan().id,
        max_tasks: 8,
      }),
      () => toolCallResponse('ready', 'd_ai_task_transition', {
        task_id: tasks()[0]!.id,
        next_state: 'READY',
      }),
      () => toolCallResponse('running', 'd_ai_task_transition', {
        task_id: tasks()[0]!.id,
        next_state: 'RUNNING',
      }),
      () => toolCallResponse('complete', 'd_ai_task_transition', {
        task_id: tasks()[0]!.id,
        next_state: 'COMPLETED',
      }),
      () => toolCallResponse('view-next', 'd_ai_director_plan_view', {
        plan_id: plan().id,
        max_tasks: 8,
      }),
      () => toolCallResponse('pause', 'd_ai_director_plan_status', {
        plan_id: plan().id,
        status: 'PAUSED',
      }),
      () => toolCallResponse('resume', 'd_ai_director_plan_status', {
        plan_id: plan().id,
        status: 'ACTIVE',
      }),
      textResponse('Mission Director plan updated'),
    )

    let expectedDirector: DirectorState
    let expectedTasks: TaskLedgerState
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: objective }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      expectedDirector = ctx.dai.readDirector(agent)
      expectedTasks = ctx.dai.readTaskLedger(agent)
      const view = ctx.dai.directorPlanView(agent, plan().id)

      expect(expectedDirector.ledgers[0]?.revision).toBe(3)
      expect(expectedDirector.ledgers[0]?.plans[0]).toMatchObject({
        objective,
        primarySystem: 'investigation',
        status: 'ACTIVE',
      })
      expect(expectedTasks.ledgers[0]?.tasks).toHaveLength(2)
      expect(expectedTasks.ledgers[0]?.tasks[0]?.state).toBe('COMPLETED')
      expect(expectedTasks.ledgers[0]?.tasks[1]?.state).toBe('PENDING')
      expect(view).toMatchObject({ phase: 'EXECUTING' })

      const next = view.next.selected
      expect(next.map(item => item.id)).toEqual([expectedTasks.ledgers[0]!.tasks[1]!.id])
      await ctx.sessions.flush(agent.session)
    } finally {
      await ctx.fiber.dispose()
    }

    const second = await boot(root, [])
    try {
      const handle = await second.ctx.agents.resume({
        resumeSessionId: SessionId('director-owner'),
        agentOptions: { provider: 'mock', model: 'fixture' },
      })
      expect(second.ctx.dai.readDirector(handle.agent)).toEqual(expectedDirector!)
      expect(second.ctx.dai.readTaskLedger(handle.agent)).toEqual(expectedTasks!)
      expect(second.ctx.dai.directorPlanView(handle.agent, expectedDirector!.ledgers[0]!.plans[0]!.id))
        .toMatchObject({ phase: 'EXECUTING' })
      await handle.dispose()
    } finally {
      await second.ctx.fiber.dispose()
    }
  }), 20000)

  it('uses an isolated planner Agent and commits only a runtime-validated DAG', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const agent = await ctx.agentLoop.create(SessionId('director-planner-owner'), { provider: 'mock', model: 'fixture' })
    const objective = 'Research a company and evaluate its long-term investment case'
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!

    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', {
        objective,
        primary_system: 'investigation',
      }),
      () => toolCallResponse('generate', 'd_ai_director_generate_tasks', { plan_id: plan().id }),
      textResponse(JSON.stringify({
        tasks: [
          {
            tempId: 'research',
            systemId: 'investigation',
            title: 'Build the evidence-backed company profile',
            dependsOn: [],
            priority: 20,
            maxAttempts: 3,
          },
          {
            tempId: 'finance',
            systemId: 'investor',
            title: 'Evaluate the investment thesis from verified company evidence',
            dependsOn: ['research'],
            priority: 10,
            maxAttempts: 3,
          },
        ],
        rationale: 'Verify company facts before financial analysis.',
      })),
      textResponse('Planner DAG committed'),
    )

    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: objective }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      const tasks = ctx.dai.readTaskLedger(agent).ledgers[0]!.tasks
      expect(tasks).toHaveLength(2)
      expect(tasks[0]?.systemId).toBe('investigation')
      expect(tasks[1]?.systemId).toBe('investor')
      expect(tasks[1]?.dependsOn).toEqual([tasks[0]?.id])
      expect(tasks[0]?.id).not.toBe('research')
      expect(tasks[1]?.id).not.toBe('finance')
      expect(ctx.dai.directorPlanView(agent, plan().id)).toMatchObject({ phase: 'EXECUTING' })
    } finally {
      await ctx.fiber.dispose()
    }
  }), 15000)

  it('rejects an invalid planner DAG before any task is persisted', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const agent = await ctx.agentLoop.create(SessionId('director-planner-owner'), { provider: 'mock', model: 'fixture' })
    const objective = 'Plan a bounded investigation'
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!

    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', {
        objective,
        primary_system: 'investigation',
      }),
      () => toolCallResponse('generate', 'd_ai_director_generate_tasks', { plan_id: plan().id }),
      textResponse(JSON.stringify({
        tasks: [{
          tempId: 'a',
          systemId: 'investigation',
          title: 'Invalid dependency task',
          dependsOn: ['missing'],
          priority: 1,
          maxAttempts: 2,
        }],
        rationale: 'Invalid fixture',
      })),
      textResponse('Invalid plan rejected'),
    )

    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: objective }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()
      expect(ctx.dai.readTaskLedger(agent).ledgers).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  }))

  it('executes Director tasks one at a time with durable checkpoints and dependency-context reconstruction', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx, adapter } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))
    const agent = await ctx.agentLoop.create(SessionId('director-executor-owner'), { provider: 'mock', model: 'fixture' })
    const objective = 'Research evidence first, then synthesize its implications'
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!
    const tasks = () => ctx.dai.readTaskLedger(agent).ledgers[0]!.tasks

    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', {
        objective,
        primary_system: 'investigation',
      }),
      () => toolCallResponse('first', 'd_ai_director_task_add', {
        plan_id: plan().id,
        system_id: 'investigation',
        title: 'Collect the primary evidence',
        priority: 20,
      }),
      () => toolCallResponse('second', 'd_ai_director_task_add', {
        plan_id: plan().id,
        system_id: 'scientific-research',
        title: 'Synthesize the verified evidence',
        depends_on: tasks()[0]!.id,
        priority: 10,
      }),
      () => toolCallResponse('execute-first', 'd_ai_director_execute_next', {
        plan_id: plan().id,
        ttl_ms: 600000,
      }),
      textResponse(JSON.stringify({
        outcome: 'COMPLETED',
        summary: 'Primary evidence collection completed and anchored.',
        artifactRefs: ['artifact://fixture/primary-evidence.json'],
      })),
      () => toolCallResponse('grant-scientific', 'd_ai_control_grant', {
        system_id: 'scientific-research',
        capability: 'runtime.task-execute',
        scope: 'TASK',
        scope_id: tasks()[1]!.id,
        decision: 'ALLOW',
        reason: 'Allow the approved synthesis task to consume investigation context',
      }),
      () => toolCallResponse('execute-second', 'd_ai_director_execute_next', {
        plan_id: plan().id,
        ttl_ms: 600000,
      }),
      textResponse(JSON.stringify({
        outcome: 'COMPLETED',
        summary: 'Synthesis completed using the dependency checkpoint.',
        artifactRefs: ['artifact://fixture/synthesis.json'],
      })),
      textResponse('Director execution completed'),
    )

    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: objective }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      const taskState = ctx.dai.readTaskLedger(agent).ledgers[0]!
      const execution = ctx.dai.readExecution(agent).ledgers[0]!
      expect(taskState.tasks.map(task => task.state)).toEqual(['COMPLETED', 'COMPLETED'])
      expect(execution.checkpoints).toHaveLength(2)
      expect(execution.checkpoints[0]).toMatchObject({
        taskId: taskState.tasks[0]?.id,
        summary: 'Primary evidence collection completed and anchored.',
        artifactRefs: ['artifact://fixture/primary-evidence.json'],
      })
      expect(execution.checkpoints[1]).toMatchObject({
        taskId: taskState.tasks[1]?.id,
        summary: 'Synthesis completed using the dependency checkpoint.',
      })
      expect(execution.leases.every(lease => lease.releasedAt !== undefined)).toBe(true)
      expect(ctx.dai.directorPlanView(agent, plan().id)).toMatchObject({ phase: 'COMPLETE' })

      // The second child request is reconstructed from durable dependency state.
      expect(JSON.stringify(adapter.requests)).toContain('Primary evidence collection completed and anchored.')
      expect(ctx.dai.readControlPlane(agent).controls[0]?.auditRecords.map(record => record.action))
        .toEqual(['CAPABILITY_GRANT', 'CROSS_SYSTEM_HANDOFF'])
    } finally {
      await ctx.fiber.dispose()
    }
  }), 20000)

  it('executes a bounded Director cycle across dependent tasks in one invocation', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx, adapter } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))
    const agent = await ctx.agentLoop.create(SessionId('director-cycle-owner'), { provider: 'mock', model: 'fixture' })
    const objective = 'Collect evidence and then synthesize it in one bounded cycle'
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!
    const tasks = () => ctx.dai.readTaskLedger(agent).ledgers[0]!.tasks

    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', {
        objective,
        primary_system: 'investigation',
      }),
      () => toolCallResponse('first', 'd_ai_director_task_add', {
        plan_id: plan().id,
        system_id: 'investigation',
        title: 'Collect the primary evidence',
        priority: 20,
      }),
      () => toolCallResponse('second', 'd_ai_director_task_add', {
        plan_id: plan().id,
        system_id: 'scientific-research',
        title: 'Synthesize the evidence',
        depends_on: tasks()[0]!.id,
        priority: 10,
      }),
      () => toolCallResponse('grant-scientific', 'd_ai_control_grant', {
        system_id: 'scientific-research',
        capability: 'runtime.task-execute',
        scope: 'TASK',
        scope_id: tasks()[1]!.id,
        decision: 'ALLOW',
        reason: 'Allow the approved synthesis task to consume investigation context',
      }),
      () => toolCallResponse('cycle', 'd_ai_director_execute_cycle', {
        plan_id: plan().id,
        max_tasks: 4,
        ttl_ms: 600000,
      }),
      textResponse(JSON.stringify({
        outcome: 'COMPLETED',
        summary: 'Primary evidence collected and anchored.',
        artifactRefs: ['artifact://fixture/cycle-evidence.json'],
      })),
      textResponse(JSON.stringify({
        outcome: 'COMPLETED',
        summary: 'Evidence synthesis completed from the durable dependency checkpoint.',
        artifactRefs: ['artifact://fixture/cycle-synthesis.json'],
      })),
      textResponse('Bounded cycle completed'),
    )

    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: objective }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      const taskState = ctx.dai.readTaskLedger(agent).ledgers[0]!
      const execution = ctx.dai.readExecution(agent).ledgers[0]!
      expect(taskState.tasks.map(task => task.state)).toEqual(['COMPLETED', 'COMPLETED'])
      expect(execution.checkpoints).toHaveLength(2)
      expect(execution.leases).toHaveLength(2)
      expect(execution.leases.every(lease => lease.releasedAt !== undefined)).toBe(true)
      expect(ctx.dai.directorPlanView(agent, plan().id)).toMatchObject({ phase: 'COMPLETE' })
      expect(JSON.stringify(adapter.requests)).toContain('Primary evidence collected and anchored.')
      expect(ctx.dai.readControlPlane(agent).controls[0]?.auditRecords.map(record => record.action))
        .toEqual(['CAPABILITY_GRANT', 'CROSS_SYSTEM_HANDOFF'])
    } finally {
      await ctx.fiber.dispose()
    }
  }), 20000)

  it('meters Director wall-clock usage into task, mission and system budgets atomically', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))

    const agent = await ctx.agentLoop.create(SessionId('director-budget-owner'), { provider: 'mock', model: 'fixture' })
    const objective = 'Execute one bounded investigation task under measured budgets'
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!
    const task = () => ctx.dai.readTaskLedger(agent).ledgers[0]!.tasks[0]!

    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', {
        objective,
        primary_system: 'investigation',
      }),
      () => toolCallResponse('task', 'd_ai_director_task_add', {
        plan_id: plan().id,
        system_id: 'investigation',
        title: 'Execute the measured task',
      }),
      () => toolCallResponse('task-budget', 'd_ai_budget_set', {
        scope: 'TASK',
        scope_id: task().id,
        wall_clock_ms: 600000,
      }),
      () => toolCallResponse('mission-budget', 'd_ai_budget_set', {
        scope: 'MISSION',
        scope_id: plan().id,
        wall_clock_ms: 600000,
      }),
      toolCallResponse('system-budget', 'd_ai_budget_set', {
        scope: 'SYSTEM',
        scope_id: 'investigation',
        wall_clock_ms: 600000,
      }),
      toolCallResponse('unrelated-budget', 'd_ai_budget_set', {
        scope: 'SYSTEM',
        scope_id: 'investor',
        wall_clock_ms: 600000,
      }),
      () => toolCallResponse('execute', 'd_ai_director_execute_next', {
        plan_id: plan().id,
        ttl_ms: 600000,
      }),
      textResponse(JSON.stringify({
        outcome: 'COMPLETED',
        summary: 'Measured task completed.',
        artifactRefs: [],
      })),
      textResponse('Measured execution completed'),
    )

    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: objective }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      const budget = ctx.dai.readBudgets(agent).ledgers[0]!
      const taskProfile = budget.profiles.find(profile => profile.scope === 'TASK')!
      const missionProfile = budget.profiles.find(profile => profile.scope === 'MISSION')!
      const systemProfile = budget.profiles.find(profile =>
        profile.scope === 'SYSTEM' && profile.scopeId === 'investigation')!
      const unrelated = budget.profiles.find(profile =>
        profile.scope === 'SYSTEM' && profile.scopeId === 'investor')!

      expect(budget.revision).toBe(5)
      expect(taskProfile.usage.wallClockMs).toBeGreaterThan(0)
      expect(missionProfile.usage.wallClockMs).toBe(taskProfile.usage.wallClockMs)
      expect(systemProfile.usage.wallClockMs).toBe(taskProfile.usage.wallClockMs)
      expect(unrelated.usage.wallClockMs).toBe(0)
      expect(taskProfile.usage.tokens).toBe(0)
      expect(taskProfile.usage.moneyUsd).toBe(0)
      expect(ctx.dai.readTaskLedger(agent).ledgers[0]?.tasks[0]?.state).toBe('COMPLETED')
    } finally {
      await ctx.fiber.dispose()
    }
  }), 20000)

  it('never exceeds the explicit Director cycle task limit', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const agent = await ctx.agentLoop.create(SessionId('director-cycle-limit-owner'), { provider: 'mock', model: 'fixture' })
    const objective = 'Execute only one of two independent tasks'
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!

    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', {
        objective,
        primary_system: 'investigation',
      }),
      () => toolCallResponse('first', 'd_ai_director_task_add', {
        plan_id: plan().id,
        system_id: 'investigation',
        title: 'Higher priority task',
        priority: 20,
      }),
      () => toolCallResponse('second', 'd_ai_director_task_add', {
        plan_id: plan().id,
        system_id: 'investor',
        title: 'Lower priority task',
        priority: 10,
      }),
      () => toolCallResponse('cycle', 'd_ai_director_execute_cycle', {
        plan_id: plan().id,
        max_tasks: 1,
      }),
      textResponse(JSON.stringify({
        outcome: 'COMPLETED',
        summary: 'Only the first task was executed.',
        artifactRefs: [],
      })),
      textResponse('Cycle stopped at configured limit'),
    )

    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: objective }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      const taskState = ctx.dai.readTaskLedger(agent).ledgers[0]!
      expect(taskState.tasks.filter(task => task.state === 'COMPLETED')).toHaveLength(1)
      expect(taskState.tasks.filter(task => task.state === 'PENDING')).toHaveLength(1)
      expect(ctx.dai.directorPlanView(agent, plan().id).next.selected).toHaveLength(1)
    } finally {
      await ctx.fiber.dispose()
    }
  }), 15000)

  it('blocks cross-system task execution when no matching capability grant exists', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const agent = await ctx.agentLoop.create(SessionId('director-policy-owner'), { provider: 'mock', model: 'fixture' })
    const objective = 'Delegate one approved financial-analysis task'
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!

    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', {
        objective,
        primary_system: 'investigation',
      }),
      () => toolCallResponse('financial', 'd_ai_director_task_add', {
        plan_id: plan().id,
        system_id: 'investor',
        title: 'Analyze the financial evidence',
      }),
      () => toolCallResponse('execute', 'd_ai_director_execute_next', {
        plan_id: plan().id,
      }),
      textResponse('Cross-system execution is blocked pending authorization'),
    )

    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: objective }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      const task = ctx.dai.readTaskLedger(agent).ledgers[0]!.tasks[0]!
      const execution = ctx.dai.readExecution(agent).ledgers[0]!
      expect(task.state).toBe('BLOCKED_POLICY')
      expect(execution.checkpoints).toEqual([])
      expect(execution.leases).toHaveLength(1)
      expect(execution.leases[0]?.releasedAt).toBeDefined()
      expect(ctx.dai.readControlPlane(agent).controls).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  }), 15000)

  it('stops a Director task at WAITING_FOR_HUMAN when real-world input is required', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const agent = await ctx.agentLoop.create(SessionId('director-human-owner'), { provider: 'mock', model: 'fixture' })
    const objective = 'Evaluate a question that requires one physical measurement'
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!

    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', {
        objective,
        primary_system: 'scientific-research',
      }),
      () => toolCallResponse('task', 'd_ai_director_task_add', {
        plan_id: plan().id,
        system_id: 'scientific-research',
        title: 'Obtain the required real-world measurement',
      }),
      () => toolCallResponse('execute', 'd_ai_director_execute_next', {
        plan_id: plan().id,
      }),
      textResponse(JSON.stringify({
        outcome: 'WAITING_FOR_HUMAN',
        summary: 'The analysis reached the point where a physical measurement is required.',
        artifactRefs: [],
        nextNeed: 'Researcher must perform the specified measurement and return the raw observation.',
      })),
      textResponse('Human input requested'),
    )

    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: objective }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      const task = ctx.dai.readTaskLedger(agent).ledgers[0]!.tasks[0]!
      const execution = ctx.dai.readExecution(agent).ledgers[0]!
      expect(task.state).toBe('WAITING_FOR_HUMAN')
      expect(execution.checkpoints[0]?.summary).toContain('Researcher must perform the specified measurement')
      expect(execution.leases[0]?.releasedAt).toBeDefined()
      expect(ctx.dai.directorPlanView(agent, plan().id)).toMatchObject({ phase: 'WAITING_FOR_HUMAN' })
    } finally {
      await ctx.fiber.dispose()
    }
  }), 15000)

  it('reclaims an expired running task through the cycle after a native Session restart', async () => temporary(async root => {
    const objective = 'Resume the approved investigation after worker loss'
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const first = await boot(root, script)
    const agent = await first.ctx.agentLoop.create(SessionId('director-recovery-owner'), { provider: 'mock', model: 'fixture' })
    const plan = () => first.ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!
    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', { objective, primary_system: 'investigation' }),
      () => toolCallResponse('task', 'd_ai_director_task_add', { plan_id: plan().id, system_id: 'investigation', title: 'Recover stranded work', max_attempts: 1 }),
      toolCallResponse('claim', 'd_ai_task_claim_next', { ttl_ms: 1000 }),
      textResponse('Worker stopped before completion'),
    )
    let planId = ''
    let expiredAt = 0
    try {
      agent.followup(createUserMessage({ content: [{ type: 'text', text: objective }], source: { kind: 'user' } }))
      await agent.whenIdle()
      expect(first.ctx.dai.readTaskLedger(agent).ledgers[0]?.tasks[0]?.state).toBe('RUNNING')
      planId = plan().id
      expiredAt = Date.parse(first.ctx.dai.readExecution(agent).ledgers[0]!.leases[0]!.expiresAt) + 1
    } finally { await first.ctx.fiber.dispose() }

    const second = await boot(root, [
      toolCallResponse('resume-cycle', 'd_ai_director_execute_cycle', { plan_id: planId, max_tasks: 1 }),
      textResponse(JSON.stringify({ outcome: 'COMPLETED', summary: 'Recovered work completed under a new fence.', artifactRefs: [] })),
      textResponse('Resumed cycle finished'),
    ])
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(expiredAt)
    try {
      const handle = await second.ctx.agents.resume({ resumeSessionId: agent.id, agentOptions: { provider: 'mock', model: 'fixture' } })
      try {
        handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Resume the approved cycle.' }], source: { kind: 'user' } }))
        await handle.agent.whenIdle()
        const task = second.ctx.dai.readTaskLedger(handle.agent).ledgers[0]!.tasks[0]!
        const execution = second.ctx.dai.readExecution(handle.agent).ledgers[0]!
        expect(task).toMatchObject({ state: 'COMPLETED', attempt: 1 })
        expect(execution.leases.map(lease => lease.fence)).toEqual([1, 2])
        expect(execution.leases.every(lease => lease.releasedAt !== undefined)).toBe(true)
        expect(execution.checkpoints).toHaveLength(1)
        expect(execution.checkpoints[0]?.fence).toBe(2)
      } finally { await handle.dispose() }
    } finally { vi.useRealTimers(); await second.ctx.fiber.dispose() }
  }))

  it('releases an expired human-wait lease without treating missing input as runnable work', async () => temporary(async root => {
    const objective = 'Wait for a physical measurement before continuing'
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const agent = await ctx.agentLoop.create(SessionId('director-human-recovery'), { provider: 'mock', model: 'fixture' })
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!
    const task = () => ctx.dai.readTaskLedger(agent).ledgers[0]!.tasks[0]!
    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', { objective, primary_system: 'investigation' }),
      () => toolCallResponse('task', 'd_ai_director_task_add', { plan_id: plan().id, system_id: 'investigation', title: 'Await measured observation' }),
      toolCallResponse('claim', 'd_ai_task_claim_next', { ttl_ms: 1000 }),
      () => toolCallResponse('wait', 'd_ai_task_transition', { task_id: task().id, next_state: 'WAITING_FOR_HUMAN' }),
      textResponse('Measurement is still required'),
    )
    let recovered: Awaited<ReturnType<DAI['recoverExpiredTaskLeases']>> | undefined
    ctx.on('agent/pre-step', async ({ agent: current, step }, next) => {
      if (current === agent && step === 5) {
        const lease = ctx.dai.readExecution(agent).ledgers[0]!.leases[0]!
        recovered = await ctx.dai.recoverExpiredTaskLeases(agent, Date.parse(lease.expiresAt) + 1)
      }
      return next()
    })
    try {
      agent.followup(createUserMessage({ content: [{ type: 'text', text: objective }], source: { kind: 'user' } }))
      await agent.whenIdle()
      expect(recovered).toEqual({ recoveredTaskIds: [], retryExhaustedTaskIds: [] })
      expect(task()).toMatchObject({ state: 'WAITING_FOR_HUMAN', attempt: 0 })
      expect(ctx.dai.readExecution(agent).ledgers[0]?.leases[0]?.releasedAt).toBeDefined()
      expect(ctx.dai.directorPlanView(agent, plan().id)).toMatchObject({ phase: 'WAITING_FOR_HUMAN', next: { selected: [] } })
    } finally { await ctx.fiber.dispose() }
  }))

  it('does not claim or fail a task when its execution signal is already cancelled', async () => temporary(async root => {
    const objective = 'Preserve pending work when execution is cancelled'
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const agent = await ctx.agentLoop.create(SessionId('director-cancel-before-claim'), { provider: 'mock', model: 'fixture' })
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!
    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', { objective, primary_system: 'investigation' }),
      () => toolCallResponse('task', 'd_ai_director_task_add', { plan_id: plan().id, system_id: 'investigation', title: 'Leave this task pending' }),
      textResponse('Execution cancelled before dispatch'),
    )
    const reason = new Error('Cancelled before lease acquisition')
    let cancellationObserved = false
    ctx.on('agent/pre-step', async ({ agent: current, step }, next) => {
      if (current === agent && step === 3) {
        await expect(ctx.dai.executeNextDirectorTask(agent, plan().id, AbortSignal.abort(reason))).rejects.toBe(reason)
        cancellationObserved = true
      }
      return next()
    })
    try {
      agent.followup(createUserMessage({ content: [{ type: 'text', text: objective }], source: { kind: 'user' } }))
      await agent.whenIdle()
      expect(cancellationObserved).toBe(true)
      expect(ctx.dai.readTaskLedger(agent).ledgers[0]?.tasks[0]?.state).toBe('PENDING')
      expect(ctx.dai.readExecution(agent).ledgers).toEqual([])
    } finally { await ctx.fiber.dispose() }
  }))

  it('restores an approved schedule and wakes native work without changing Session source contracts', async () => temporary(async root => {
    const objective = 'Run approved investigation work after schedule restart'
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const first = await boot(root, script)
    first.ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))
    const agent = await first.ctx.agentLoop.create(SessionId('director-schedule-restart'), { provider: 'mock', model: 'fixture' })
    const plan = () => first.ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!
    let scheduleId = ''
    let planId = ''
    first.ctx.on('agent/pre-step', async ({ agent: current, step }, next) => {
      if (current === agent && step === 3) {
        const ledger = await first.ctx.dai.setDirectorSchedule(agent, plan().id, {
          enabled: true, intervalMs: 60000, leaseTtlMs: 600000, maxTasksPerCycle: 1, startImmediately: true,
        })
        scheduleId = ledger.schedules[0]!.id
        planId = plan().id
      }
      return next()
    })
    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', { objective, primary_system: 'investigation' }),
      () => toolCallResponse('task', 'd_ai_director_task_add', { plan_id: plan().id, system_id: 'investigation', title: 'Execute the approved scheduled task' }),
      textResponse('Schedule approved'),
    )
    try {
      agent.followup(createUserMessage({ content: [{ type: 'text', text: objective }], source: { kind: 'user' } }))
      await agent.whenIdle()
      expect(scheduleId).not.toBe('')
    } finally { await first.ctx.fiber.dispose() }

    const second = await boot(root, [textResponse(JSON.stringify({ outcome: 'COMPLETED', summary: 'Scheduled work completed.', artifactRefs: [] }))])
    const scheduler = new DirectorScheduler(second.ctx, second.ctx.dai, { pollMs: 60000 })
    try {
      const handle = await second.ctx.agents.resume({ resumeSessionId: agent.id, agentOptions: { provider: 'mock', model: 'fixture' } })
      try {
        expect(second.ctx.dai.readDirectorSchedule(handle.agent).ledgers[0]?.schedules[0]).toMatchObject({ id: scheduleId, planId, enabled: true })
        scheduler.scan(Date.now())
        scheduler.scan(Date.now())
        await handle.agent.whenIdle()
        expect(second.ctx.dai.readTaskLedger(handle.agent).ledgers[0]?.tasks[0]?.state).toBe('COMPLETED')
        expect(second.ctx.dai.readDirectorSchedule(handle.agent).ledgers[0]?.schedules[0]?.lastCycle).toMatchObject({ outcome: 'EXECUTED', executedTasks: 1, phase: 'COMPLETE' })
        const wakes = handle.agent.session.snapshotEvents().flatMap(event => event.type === 'agent/inbox/spliced' ? event.data.inserted : []).filter(message => message.source.kind === 'schedule')
        expect(wakes).toHaveLength(1)
        scheduler.scan(Date.now())
        expect(handle.agent.inbox.nextTurn).toEqual([])
      } finally { await handle.dispose() }
    } finally { await scheduler.dispose(); await second.ctx.fiber.dispose() }
  }))

  it('records and propagates an undefined rejection from a scheduled cycle', async () => temporary(async root => {
    const objective = 'Preserve any scheduled execution failure'
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))
    const agent = await ctx.agentLoop.create(SessionId('director-schedule-undefined'), { provider: 'mock', model: 'fixture' })
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!
    let rejected = false
    ctx.on('agent/pre-step', async ({ agent: current, step }, next) => {
      if (current === agent && step === 2) {
        const ledger = await ctx.dai.setDirectorSchedule(agent, plan().id, { enabled: true, startImmediately: true })
        const schedule = ledger.schedules[0]!
        const staleDueAt = new Date(Date.parse(schedule.nextWakeAt) - 1).toISOString()
        await expect(ctx.dai.runScheduledDirectorCycle(agent, schedule.id, staleDueAt, new AbortController().signal)).resolves.toMatchObject({ outcome: 'IDLE' })
        expect(ctx.dai.readDirectorSchedule(agent).ledgers[0]?.revision).toBe(1)
        const failure = vi.spyOn(ctx.dai, 'executeDirectorCycle').mockRejectedValueOnce(undefined)
        try {
          await ctx.dai.runScheduledDirectorCycle(agent, ledger.schedules[0]!.id, ledger.schedules[0]!.nextWakeAt, new AbortController().signal).then(
            () => { throw new Error('scheduled failure was reported as success') },
            reason => { expect(reason).toBeUndefined(); rejected = true },
          )
        } finally { failure.mockRestore() }
      }
      return next()
    })
    script.push(toolCallResponse('plan', 'd_ai_director_plan_create', { objective, primary_system: 'investigation' }), textResponse('Failure recorded'))
    try {
      agent.followup(createUserMessage({ content: [{ type: 'text', text: objective }], source: { kind: 'user' } }))
      await agent.whenIdle()
      expect(rejected).toBe(true)
      expect(ctx.dai.readDirectorSchedule(agent).ledgers[0]?.schedules[0]?.lastCycle).toMatchObject({ outcome: 'FAILED', error: 'undefined' })
    } finally { await ctx.fiber.dispose() }
  }))

  it('does not let a model silently create an unrelated Director plan', async () => temporary(async root => {
    const { ctx } = await boot(root, [
      toolCallResponse('bad-plan', 'd_ai_director_plan_create', {
        objective: 'Unrelated autonomous mission',
        primary_system: 'investigation',
      }),
      textResponse('Approval was not granted'),
    ])

    try {
      const agent = await ctx.agentLoop.create(SessionId('director-owner'), { provider: 'mock', model: 'fixture' })
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Read the current Mission Director plans.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()
      expect(ctx.dai.readDirector(agent).ledgers).toEqual([])
      expect(agent.session.snapshotEvents().filter(event => event.type === 'approval/decided')).toHaveLength(1)
    } finally {
      await ctx.fiber.dispose()
    }
  }))
})
