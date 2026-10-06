/** D_AI shared-core runtime integration tests: durable task ledger and control plane. */
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
  const root = await mkdtemp(join(tmpdir(), 'd-ai-core-runtime-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI durable shared core', () => {
  it('persists task DAG state and approved capability grants with a valid audit chain across restart', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))

    const agent = await ctx.agentLoop.create(SessionId('core-owner'), { provider: 'mock', model: 'fixture' })
    const ledger = () => ctx.dai.readTaskLedger(agent).ledgers[0]!

    script.push(
      toolCallResponse('task-add', 'd_ai_task_add', {
        mission_id: 'mission-1',
        system_id: 'investigation',
        title: 'Collect and verify source evidence',
        priority: 10,
        max_attempts: 3,
      }),
      () => toolCallResponse('task-ready', 'd_ai_task_transition', {
        task_id: ledger().tasks[0]!.id,
        next_state: 'READY',
      }),
      () => toolCallResponse('task-running', 'd_ai_task_transition', {
        task_id: ledger().tasks[0]!.id,
        next_state: 'RUNNING',
      }),
      toolCallResponse('grant', 'd_ai_control_grant', {
        system_id: 'investor',
        capability: 'financial.company-analysis',
        scope: 'MISSION',
        scope_id: 'mission-1',
        decision: 'ALLOW',
        reason: 'Approved financial analysis handoff for this investigation mission',
      }),
      toolCallResponse('handoff', 'd_ai_cross_system_handoff', {
        from_system: 'investigation',
        to_system: 'investor',
        capability: 'financial.company-analysis',
        mission_id: 'mission-1',
        reason: 'Analyze company financial evidence inside the investigation',
      }),
      toolCallResponse('budget', 'd_ai_budget_set', {
        scope: 'MISSION',
        scope_id: 'mission-1',
        token_limit: 50000,
        money_limit_usd: 25,
        wall_clock_ms: 3600000,
      }),
      textResponse('Shared core updated'),
    )

    let expectedLedger: ReturnType<typeof ctx.dai.readTaskLedger>
    let expectedControl: ReturnType<typeof ctx.dai.readControlPlane>
    let expectedBudgets: ReturnType<typeof ctx.dai.readBudgets>
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Create the mission task and approved scoped capability grant.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      expectedLedger = ctx.dai.readTaskLedger(agent)
      expectedControl = ctx.dai.readControlPlane(agent)
      expectedBudgets = ctx.dai.readBudgets(agent)

      expect(expectedLedger.ledgers[0]?.revision).toBe(3)
      expect(expectedLedger.ledgers[0]?.tasks[0]?.state).toBe('RUNNING')
      expect(expectedLedger.ledgers[0]?.tasks[0]?.attempt).toBe(1)

      expect(expectedControl.controls[0]?.revision).toBe(2)
      expect(expectedControl.controls[0]?.grants[0]).toMatchObject({
        systemId: 'investor',
        capability: 'financial.company-analysis',
        scope: 'MISSION',
        scopeId: 'mission-1',
        decision: 'ALLOW',
      })
      expect(expectedControl.controls[0]?.auditRecords).toHaveLength(2)
      expect(expectedControl.controls[0]?.auditRecords[0]?.action).toBe('CAPABILITY_GRANT')
      expect(expectedControl.controls[0]?.auditRecords[0]?.subjectId).toBe(expectedControl.controls[0]?.grants[0]?.id)
      expect(expectedControl.controls[0]?.auditRecords[1]).toMatchObject({
        action: 'CROSS_SYSTEM_HANDOFF',
        systemId: 'investigation',
        missionId: 'mission-1',
        subjectId: 'investor',
      })

      expect(expectedBudgets.ledgers[0]?.revision).toBe(1)
      expect(expectedBudgets.ledgers[0]?.profiles[0]).toMatchObject({
        scope: 'MISSION',
        scopeId: 'mission-1',
        limits: {
          tokenLimit: 50000,
          moneyLimitUsd: 25,
          wallClockMs: 3600000,
        },
        usage: {
          tokens: 0,
          moneyUsd: 0,
          wallClockMs: 0,
          humanAttentionMinutes: 0,
          dataAccessCostUsd: 0,
        },
      })
      await ctx.sessions.flush(agent.session)
    } finally {
      await ctx.fiber.dispose()
    }

    const second = await boot(root, [])
    try {
      const handle = await second.ctx.agents.resume({
        resumeSessionId: SessionId('core-owner'),
        agentOptions: { provider: 'mock', model: 'fixture' },
      })
      expect(second.ctx.dai.readTaskLedger(handle.agent)).toEqual(expectedLedger!)
      expect(second.ctx.dai.readControlPlane(handle.agent)).toEqual(expectedControl!)
      expect(second.ctx.dai.readBudgets(handle.agent)).toEqual(expectedBudgets!)
      await handle.dispose()
    } finally {
      await second.ctx.fiber.dispose()
    }
  }), 15000)

  it('fails capability changes closed when no human approval answerer grants them', async () => temporary(async root => {
    const { ctx } = await boot(root, [
      toolCallResponse('grant', 'd_ai_control_grant', {
        system_id: 'investigation',
        capability: 'evidence.capture',
        scope: 'GLOBAL',
        decision: 'ALLOW',
        reason: 'model attempted policy change',
      }),
      textResponse('Approval was not granted'),
    ])

    try {
      const agent = await ctx.agentLoop.create(SessionId('core-owner'), { provider: 'mock', model: 'fixture' })
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Inspect the current control plane.' }],
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
