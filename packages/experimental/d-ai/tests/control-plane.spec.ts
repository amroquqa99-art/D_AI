/** Native durable task/control-plane integration tests. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
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
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import DAI, { verifyAuditChain } from '../src/index.ts'

async function boot(
  root: string,
  script: ConstructorParameters<typeof MockAdapter>[0],
  approval: 'allow' | 'never',
) {
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
  await ctx.plugin(Approval, { policy: approval === 'allow' ? 'ask' : 'never' })
  if (approval === 'allow') {
    ctx.on('approval/request', async () => 'allowed-once')
  }
  await ctx.plugin(DAI, { allowedTools: [] })
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

async function temporary<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-control-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI durable task and control plane', () => {
  it('persists task transitions plus human-approved grants and audit across restart', async () => temporary(async root => {
    let ctxRef: Context | undefined
    let agentRef: Agent | undefined
    const script: ConstructorParameters<typeof MockAdapter>[0] = [
      toolCallResponse('add', 'd_ai_task_add', {
        mission_id: 'mission-1',
        system_id: 'scientific-research',
        title: 'Map primary literature',
        priority: 7,
        max_attempts: 3,
      }),
      () => toolCallResponse('ready', 'd_ai_task_transition', {
        task_id: ctxRef!.dai.readTaskLedger(agentRef!).ledgers[0]!.tasks[0]!.id,
        next_state: 'READY',
      }),
      () => toolCallResponse('run', 'd_ai_task_transition', {
        task_id: ctxRef!.dai.readTaskLedger(agentRef!).ledgers[0]!.tasks[0]!.id,
        next_state: 'RUNNING',
      }),
      toolCallResponse('grant', 'd_ai_control_grant', {
        system_id: 'scientific-research',
        capability: 'scholarly.search',
        scope: 'MISSION',
        scope_id: 'mission-1',
        decision: 'ALLOW',
        reason: 'Approved research mission needs scholarly search',
      }),
      textResponse('Core control state updated'),
    ]

    const first = await boot(root, script, 'allow')
    ctxRef = first.ctx
    agentRef = await first.ctx.agentLoop.create(SessionId('core-owner'), { provider: 'mock', model: 'fixture' })

    let expectedTasks: ReturnType<typeof first.ctx.dai.readTaskLedger>
    let expectedControl: ReturnType<typeof first.ctx.dai.readControlPlane>
    try {
      agentRef.followup(createUserMessage({
        content: [{ type: 'text', text: 'Manage the approved D_AI core task and capability grant' }],
        source: { kind: 'user' },
      }))
      await agentRef.whenIdle()

      expectedTasks = first.ctx.dai.readTaskLedger(agentRef)
      expectedControl = first.ctx.dai.readControlPlane(agentRef)
      const ledger = expectedTasks.ledgers[0]!
      const control = expectedControl.controls[0]!

      expect(ledger.revision).toBe(3)
      expect(ledger.tasks[0]?.state).toBe('RUNNING')
      expect(control.revision).toBe(1)
      expect(control.grants[0]).toMatchObject({
        systemId: 'scientific-research',
        capability: 'scholarly.search',
        scope: 'MISSION',
        scopeId: 'mission-1',
        decision: 'ALLOW',
      })
      expect(control.auditRecords).toHaveLength(1)
      expect(verifyAuditChain({ records: control.auditRecords, headHash: control.auditHeadHash })).toBe(true)
      expect(agentRef.session.snapshotEvents().filter(event => event.type === 'approval/decided')).toHaveLength(1)
      await first.ctx.sessions.flush(agentRef.session)
    } finally {
      await first.ctx.fiber.dispose()
    }

    const second = await boot(root, [], 'never')
    try {
      const handle = await second.ctx.agents.resume({
        resumeSessionId: SessionId('core-owner'),
        agentOptions: { provider: 'mock', model: 'fixture' },
      })
      expect(second.ctx.dai.readTaskLedger(handle.agent)).toEqual(expectedTasks!)
      expect(second.ctx.dai.readControlPlane(handle.agent)).toEqual(expectedControl!)
      await handle.dispose()
    } finally {
      await second.ctx.fiber.dispose()
    }
  }), 15000)

  it('fails closed when no approval is allowed for a capability policy change', async () => temporary(async root => {
    const { ctx } = await boot(root, [
      toolCallResponse('grant', 'd_ai_control_grant', {
        system_id: 'investigation',
        capability: 'restricted.source',
        scope: 'GLOBAL',
        decision: 'ALLOW',
        reason: 'attempted policy change',
      }),
      textResponse('Approval denied'),
    ], 'never')
    try {
      const agent = await ctx.agentLoop.create(SessionId('core-owner'), { provider: 'mock', model: 'fixture' })
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Inspect current control state only' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()
      expect(ctx.dai.readControlPlane(agent).controls).toEqual([])
      expect(agent.session.snapshotEvents().filter(event => event.type === 'approval/decided')).toHaveLength(1)
    } finally {
      await ctx.fiber.dispose()
    }
  }))
})
