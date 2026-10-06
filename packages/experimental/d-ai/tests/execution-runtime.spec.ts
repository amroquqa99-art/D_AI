/** D_AI long-running execution lease/checkpoint integration tests. */
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
import Approval from '@deepseek-ai/dsh-user-approval'
import { describe, expect, it } from 'vitest'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import DAI from '../src/index.ts'
import type { ExecutionState } from '../src/execution-state.ts'
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
  await ctx.plugin(Approval, { policy: 'never' })
  await ctx.plugin(DAI, { allowedTools: [] })
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

async function temporary<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-execution-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI long-running task execution', () => {
  it('claims one runnable task, checkpoints it, renews/release its lease and replays after restart', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const agent = await ctx.agentLoop.create(SessionId('execution-owner'), { provider: 'mock', model: 'fixture' })
    const task = () => ctx.dai.readTaskLedger(agent).ledgers[0]!.tasks[0]!
    const lease = () => ctx.dai.readExecution(agent).ledgers[0]!.leases.at(-1)!

    script.push(
      toolCallResponse('task-add', 'd_ai_task_add', {
        mission_id: 'mission-long',
        system_id: 'scientific-research',
        title: 'Long-running literature and experiment synthesis',
        priority: 20,
        max_attempts: 3,
      }),
      toolCallResponse('claim', 'd_ai_task_claim_next', { ttl_ms: 600000 }),
      () => toolCallResponse('checkpoint', 'd_ai_task_checkpoint', {
        task_id: task().id,
        lease_id: lease().id,
        fence: lease().fence,
        summary: 'Literature map completed; waiting to continue with synthesis.',
        artifact_refs: 'artifact://fixture/literature-map.json',
      }),
      () => toolCallResponse('renew', 'd_ai_task_renew_lease', {
        task_id: task().id,
        lease_id: lease().id,
        fence: lease().fence,
        ttl_ms: 1200000,
      }),
      () => toolCallResponse('complete', 'd_ai_task_transition', {
        task_id: task().id,
        next_state: 'COMPLETED',
      }),
      () => toolCallResponse('release', 'd_ai_task_release_lease', {
        task_id: task().id,
        lease_id: lease().id,
        fence: lease().fence,
      }),
      textResponse('Long-running task persisted'),
    )

    let expectedExecution: ExecutionState
    let expectedTasks: TaskLedgerState
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Create and execute the approved long-running task with a durable checkpoint.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      expectedExecution = ctx.dai.readExecution(agent)
      expectedTasks = ctx.dai.readTaskLedger(agent)

      expect(expectedTasks.ledgers[0]?.tasks[0]?.state).toBe('COMPLETED')
      expect(expectedTasks.ledgers[0]?.revision).toBe(4)
      expect(expectedExecution.ledgers[0]?.revision).toBe(4)
      expect(expectedExecution.ledgers[0]?.leases).toHaveLength(1)
      expect(expectedExecution.ledgers[0]?.leases[0]?.releasedAt).toBeDefined()
      expect(expectedExecution.ledgers[0]?.leases[0]?.holderId).toBe(agent.id)
      expect(expectedExecution.ledgers[0]?.checkpoints).toHaveLength(1)
      expect(expectedExecution.ledgers[0]?.checkpoints[0]).toMatchObject({
        taskId: expectedTasks.ledgers[0]?.tasks[0]?.id,
        leaseId: expectedExecution.ledgers[0]?.leases[0]?.id,
        fence: expectedExecution.ledgers[0]?.leases[0]?.fence,
        sequence: 1,
        summary: 'Literature map completed; waiting to continue with synthesis.',
        artifactRefs: ['artifact://fixture/literature-map.json'],
      })
      await ctx.sessions.flush(agent.session)
    } finally {
      await ctx.fiber.dispose()
    }

    const second = await boot(root, [])
    try {
      const handle = await second.ctx.agents.resume({
        resumeSessionId: SessionId('execution-owner'),
        agentOptions: { provider: 'mock', model: 'fixture' },
      })
      expect(second.ctx.dai.readExecution(handle.agent)).toEqual(expectedExecution!)
      expect(second.ctx.dai.readTaskLedger(handle.agent)).toEqual(expectedTasks!)
      await handle.dispose()
    } finally {
      await second.ctx.fiber.dispose()
    }
  }), 15000)

  it('rejects stale lease generations after a task is reclaimed', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const agent = await ctx.agentLoop.create(SessionId('execution-fence-owner'), { provider: 'mock', model: 'fixture' })
    const task = () => ctx.dai.readTaskLedger(agent).ledgers[0]!.tasks[0]!
    const latestLease = () => ctx.dai.readExecution(agent).ledgers[0]!.leases.at(-1)!

    let firstLeaseId = ''
    let firstFence = 0

    script.push(
      toolCallResponse('task-add', 'd_ai_task_add', {
        mission_id: 'mission-fence',
        system_id: 'investigation',
        title: 'Fence stale executor generations',
        max_attempts: 3,
      }),
      toolCallResponse('claim-first', 'd_ai_task_claim_next', { ttl_ms: 600000 }),
      () => {
        firstLeaseId = latestLease().id
        firstFence = latestLease().fence
        return toolCallResponse('release-first', 'd_ai_task_release_lease', {
          task_id: task().id,
          lease_id: firstLeaseId,
          fence: firstFence,
        })
      },
      () => toolCallResponse('fail-first', 'd_ai_task_transition', {
        task_id: task().id,
        next_state: 'FAILED',
      }),
      () => toolCallResponse('retry-first', 'd_ai_task_transition', {
        task_id: task().id,
        next_state: 'PENDING',
      }),
      toolCallResponse('claim-second', 'd_ai_task_claim_next', { ttl_ms: 600000 }),
      () => toolCallResponse('stale-checkpoint', 'd_ai_task_checkpoint', {
        task_id: task().id,
        lease_id: firstLeaseId,
        fence: firstFence,
        summary: 'This stale executor must not be allowed to write.',
      }),
      textResponse('Stale executor rejected'),
    )

    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Exercise lease fencing for the approved task.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      const execution = ctx.dai.readExecution(agent).ledgers[0]!
      expect(execution.leases).toHaveLength(2)
      expect(execution.leases[0]?.fence).toBe(1)
      expect(execution.leases[0]?.releasedAt).toBeDefined()
      expect(execution.leases[1]?.fence).toBe(2)
      expect(execution.leases[1]?.releasedAt).toBeUndefined()
      expect(execution.checkpoints).toEqual([])
      expect(ctx.dai.readTaskLedger(agent).ledgers[0]?.tasks[0]?.state).toBe('RUNNING')
    } finally {
      await ctx.fiber.dispose()
    }
  }), 15000)

  it('will not claim a second task while the only runnable task is already running', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const agent = await ctx.agentLoop.create(SessionId('execution-owner'), { provider: 'mock', model: 'fixture' })

    script.push(
      toolCallResponse('task-add', 'd_ai_task_add', {
        mission_id: 'mission-long',
        system_id: 'investigation',
        title: 'Single runnable task',
      }),
      toolCallResponse('claim', 'd_ai_task_claim_next', { ttl_ms: 600000 }),
      toolCallResponse('claim-again', 'd_ai_task_claim_next', { ttl_ms: 600000 }),
      textResponse('No second runnable task'),
    )

    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Run the one approved task.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()
      expect(ctx.dai.readTaskLedger(agent).ledgers[0]?.tasks[0]?.state).toBe('RUNNING')
      expect(ctx.dai.readExecution(agent).ledgers[0]?.leases).toHaveLength(1)
    } finally {
      await ctx.fiber.dispose()
    }
  }))
})
