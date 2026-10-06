/** Runtime proof for same-plan Mission Director parallel worker waves. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import {
  createUserMessage,
  LlmAdapter,
  type GenerateOptions,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as DomainStorage from '@deepseek-ai/dsh-storage-domain'
import WebRuntime from '@deepseek-ai/dsh-web'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import Approval from '@deepseek-ai/dsh-user-approval'
import { describe, expect, it } from 'vitest'
import { textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import DAI from '../src/index.ts'

type ParentEntry = StreamChunk[] | ((options: GenerateOptions) => StreamChunk[])

class ParallelProbeAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  maxActiveChildren = 0
  private activeChildren = 0
  private waiters: Array<() => void> = []

  constructor(private readonly parentScript: ParentEntry[]) {
    super()
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }

  private isDirectorChild(options: GenerateOptions): boolean {
    const serialized = JSON.stringify(options.messages)
    return serialized.includes('"outputContract"')
      && serialized.includes('"task"')
      && serialized.includes('COMPLETED | WAITING_FOR_HUMAN | WAITING_FOR_TOOL | FAILED')
  }

  private async awaitPeer(signal?: AbortSignal): Promise<void> {
    if (this.activeChildren >= 2) {
      const waiters = this.waiters
      this.waiters = []
      for (const resolve of waiters) resolve()
      return
    }

    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }
      const onAbort = () => {
        this.waiters = this.waiters.filter(item => item !== finish)
        reject(signal?.reason ?? new Error('aborted'))
      }
      if (signal?.aborted) {
        onAbort()
        return
      }
      this.waiters.push(finish)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)

    if (this.isDirectorChild(options)) {
      this.activeChildren += 1
      this.maxActiveChildren = Math.max(this.maxActiveChildren, this.activeChildren)
      try {
        await this.awaitPeer(options.signal)
        for (const chunk of textResponse(JSON.stringify({
          outcome: 'COMPLETED',
          summary: 'Parallel worker completed its independent task.',
          artifactRefs: [],
        }))) {
          if (options.signal?.aborted) throw options.signal.reason ?? new Error('aborted')
          yield chunk
        }
      } finally {
        this.activeChildren -= 1
      }
      return
    }

    const entry = this.parentScript.shift()
    if (entry === undefined) throw new Error('ParallelProbeAdapter: parent script exhausted')
    const chunks = typeof entry === 'function' ? entry(options) : entry
    for (const chunk of chunks) yield chunk
  }
}

async function boot(root: string, script: ParentEntry[]) {
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
  await ctx.plugin(Approval, { policy: 'never' })
  await ctx.plugin(DAI, {
    allowedTools: [],
    directorSchedulerEnabled: false,
  })

  const adapter = new ParallelProbeAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

async function temporary<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-director-parallel-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI same-plan Director parallel execution', () => {
  it('runs two independent exact-task workers concurrently and settles both leases', async () => temporary(async root => {
    const script: ParentEntry[] = []
    const { ctx, adapter } = await boot(root, script)
    const agent = await ctx.agentLoop.create(
      SessionId('director-parallel-owner'),
      { provider: 'mock', model: 'fixture' },
    )
    const objective = 'Execute two independent investigation tasks in one parallel Director wave'
    const plan = () => ctx.dai.readDirector(agent).ledgers[0]!.plans[0]!

    script.push(
      toolCallResponse('plan', 'd_ai_director_plan_create', {
        objective,
        primary_system: 'investigation',
      }),
      () => toolCallResponse('task-a', 'd_ai_director_task_add', {
        plan_id: plan().id,
        system_id: 'investigation',
        title: 'Independent task A',
        priority: 20,
      }),
      () => toolCallResponse('task-b', 'd_ai_director_task_add', {
        plan_id: plan().id,
        system_id: 'investigation',
        title: 'Independent task B',
        priority: 10,
      }),
      () => toolCallResponse('parallel-cycle', 'd_ai_director_execute_cycle', {
        plan_id: plan().id,
        max_tasks: 2,
        max_parallel_tasks: 2,
        ttl_ms: 60000,
      }),
      textResponse('Parallel cycle completed'),
    )

    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: objective }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      const tasks = ctx.dai.readTaskLedger(agent).ledgers[0]!.tasks
      const execution = ctx.dai.readExecution(agent).ledgers[0]!

      expect(tasks.map(task => task.state)).toEqual(['COMPLETED', 'COMPLETED'])
      expect(adapter.maxActiveChildren).toBe(2)
      expect(execution.leases).toHaveLength(2)
      expect(new Set(execution.leases.map(lease => lease.holderId)).size).toBe(2)
      expect(execution.leases.every(lease =>
        lease.holderId.startsWith('director-worker:')
        && lease.holderId !== agent.id)).toBe(true)
      expect(execution.leases.every(lease => lease.releasedAt !== undefined)).toBe(true)
      expect(execution.checkpoints).toHaveLength(2)
      expect(ctx.dai.directorPlanView(agent, plan().id)).toMatchObject({ phase: 'COMPLETE' })
    } finally {
      await ctx.fiber.dispose()
    }
  }), 20000)
})
