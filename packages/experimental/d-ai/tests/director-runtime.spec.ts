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
import Approval, { type ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { describe, expect, it } from 'vitest'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import DAI from '../src/index.ts'
import type { DirectorState } from '../src/director-state.ts'
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

      const next = (view.next as { selected: Array<{ id: string }> }).selected
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
