/** Integration coverage for the internal D_AI side-effect journal. */
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
import { defineTool } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import DAI from '../src/index.ts'
import { encodeToolResult, jsonToolOutput } from '../src/tool-support.ts'
import type { SideEffectState } from '../src/side-effect-state.ts'

const targetDigest = 'a'.repeat(64)
const requestDigest = 'b'.repeat(64)
const resultDigest = 'c'.repeat(64)

function registerTestSideEffectTools(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'test_side_effect_reserve',
    description: 'Test-only side-effect reservation adapter.',
    parameters: { key: { type: 'string', required: true } },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const agent = exec.agent!
      const task = ctx.dai.readTaskLedger(agent).ledgers[0]!.tasks[0]!
      const lease = ctx.dai.readExecution(agent).ledgers[0]!.leases.at(-1)!
      return encodeToolResult(ctx.dai.reserveSideEffect(agent, {
        idempotencyKey: args.key,
        taskId: task.id,
        missionId: task.missionId,
        systemId: task.systemId,
        leaseId: lease.id,
        fence: lease.fence,
        toolName: 'fixture.mutable-operation',
        targetDigest,
        requestDigest,
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'test_side_effect_dispatch',
    description: 'Test-only dispatch marker.',
    parameters: { key: { type: 'string', required: true } },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const agent = exec.agent!
      const record = ctx.dai.readSideEffects(agent).ledgers[0]!.records
        .find(item => item.idempotencyKey === args.key)!
      return encodeToolResult(ctx.dai.markSideEffectDispatched(
        agent,
        args.key,
        record.leaseId,
        record.fence,
      ))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'test_side_effect_unknown',
    description: 'Test-only unknown-outcome marker.',
    parameters: { key: { type: 'string', required: true } },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(
      ctx.dai.markSideEffectOutcomeUnknown(exec.agent!, args.key),
    ),
  }))

  ctx.tools.register(defineTool({
    name: 'test_side_effect_reconcile',
    description: 'Test-only approved reconciliation adapter.',
    parameters: { key: { type: 'string', required: true } },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(ctx.dai.reconcileSideEffect(
      exec.agent!,
      {
        idempotencyKey: args.key,
        outcome: 'COMMITTED',
        note: 'Fixture connector independently confirmed the original dispatch.',
        resultDigest,
        artifactRefs: ['artifact://fixture/side-effect-result.json'],
      },
      exec.signal,
    )),
  }))
}

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
  registerTestSideEffectTools(ctx)

  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

async function temporary<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-side-effect-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI side-effect journal integration', () => {
  it('is idempotent, reconciles uncertain dispatch with approval and replays after restart', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))

    const agent = await ctx.agentLoop.create(SessionId('side-effect-owner'), { provider: 'mock', model: 'fixture' })
    const key = 'fixture:mission-side-effect:task:notify'

    script.push(
      toolCallResponse('task-add', 'd_ai_task_add', {
        mission_id: 'mission-side-effect',
        system_id: 'investigation',
        title: 'Exercise one mutable connector operation',
      }),
      toolCallResponse('claim', 'd_ai_task_claim_next', { ttl_ms: 600000 }),
      toolCallResponse('reserve', 'test_side_effect_reserve', { key }),
      toolCallResponse('reserve-again', 'test_side_effect_reserve', { key }),
      toolCallResponse('dispatch', 'test_side_effect_dispatch', { key }),
      toolCallResponse('unknown', 'test_side_effect_unknown', { key }),
      toolCallResponse('reconcile', 'test_side_effect_reconcile', { key }),
      textResponse('Side-effect journal reconciled'),
    )

    let expected: SideEffectState
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Exercise the approved side-effect journal fixture.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      expected = ctx.dai.readSideEffects(agent)
      const ledger = expected.ledgers[0]!
      expect(ledger.revision).toBe(4)
      expect(ledger.records).toHaveLength(1)
      expect(ledger.records[0]).toMatchObject({
        idempotencyKey: key,
        state: 'COMMITTED',
        fence: 1,
        resultDigest,
        artifactRefs: ['artifact://fixture/side-effect-result.json'],
        resolution: {
          by: 'side-effect-owner',
          note: 'Fixture connector independently confirmed the original dispatch.',
        },
      })
      expect(ledger.records[0]?.unknownAt).toBeDefined()
      expect(agent.session.snapshotEvents().filter(event => event.type === 'approval/decided'))
        .toHaveLength(1)
      await ctx.sessions.flush(agent.session)
    } finally {
      await ctx.fiber.dispose()
    }

    const second = await boot(root, [])
    try {
      const handle = await second.ctx.agents.resume({
        resumeSessionId: SessionId('side-effect-owner'),
        agentOptions: { provider: 'mock', model: 'fixture' },
      })
      expect(second.ctx.dai.readSideEffects(handle.agent)).toEqual(expected!)
      await handle.dispose()
    } finally {
      await second.ctx.fiber.dispose()
    }
  }), 15000)

  it('rebinds an undispatched key to a newer lease generation without duplicating the effect', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const agent = await ctx.agentLoop.create(SessionId('side-effect-rebind-owner'), { provider: 'mock', model: 'fixture' })
    const key = 'fixture:mission-side-effect:task:rebind'
    const task = () => ctx.dai.readTaskLedger(agent).ledgers[0]!.tasks[0]!
    const lease = () => ctx.dai.readExecution(agent).ledgers[0]!.leases.at(-1)!

    let firstRecordId = ''

    script.push(
      toolCallResponse('task-add', 'd_ai_task_add', {
        mission_id: 'mission-side-effect',
        system_id: 'investigation',
        title: 'Rebind an undispatched connector reservation',
        max_attempts: 3,
      }),
      toolCallResponse('claim-first', 'd_ai_task_claim_next', { ttl_ms: 600000 }),
      toolCallResponse('reserve-first', 'test_side_effect_reserve', { key }),
      () => {
        firstRecordId = ctx.dai.readSideEffects(agent).ledgers[0]!.records[0]!.id
        return toolCallResponse('release-first', 'd_ai_task_release_lease', {
          task_id: task().id,
          lease_id: lease().id,
          fence: lease().fence,
        })
      },
      () => toolCallResponse('fail-first', 'd_ai_task_transition', {
        task_id: task().id,
        next_state: 'FAILED',
      }),
      () => toolCallResponse('retry', 'd_ai_task_transition', {
        task_id: task().id,
        next_state: 'PENDING',
      }),
      toolCallResponse('claim-second', 'd_ai_task_claim_next', { ttl_ms: 600000 }),
      toolCallResponse('reserve-rebind', 'test_side_effect_reserve', { key }),
      textResponse('Reservation rebound'),
    )

    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Exercise safe reservation rebind.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      const ledger = ctx.dai.readSideEffects(agent).ledgers[0]!
      expect(ledger.revision).toBe(2)
      expect(ledger.records).toHaveLength(1)
      expect(ledger.records[0]).toMatchObject({
        id: firstRecordId,
        idempotencyKey: key,
        state: 'RESERVED',
        fence: 2,
        leaseId: ctx.dai.readExecution(agent).ledgers[0]!.leases[1]!.id,
      })
    } finally {
      await ctx.fiber.dispose()
    }
  }), 15000)
})
