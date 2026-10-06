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
import { SessionId } from '@deepseek-ai/dsh-session'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as DomainStorage from '@deepseek-ai/dsh-storage-domain'
import WebRuntime from '@deepseek-ai/dsh-web'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import Approval, { type ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { describe, expect, it } from 'vitest'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import DAI from '../src/index.ts'
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

  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-experimental-d-ai'",
    '  config:',
    '    allowedTools: []',
    '    directorSchedulerEnabled: false',
    '',
  ].join('\n'))

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

  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

async function temporary<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-scheduler-loader-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI unattended Director REAL composition', () => {
  it('loads through Cordis, wakes a native turn and commits one scheduled task without a parent model request', async () => temporary(async root => {
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

      const schedulerTurns = agent.session.snapshotEvents().filter(event =>
        event.type === 'user/message' && event.data.source.kind === 'd-ai-scheduler')
      expect(schedulerTurns).toHaveLength(1)
    } finally {
      await scheduler?.dispose()
      await ctx.fiber.dispose()
    }
  }), 20000)
})
