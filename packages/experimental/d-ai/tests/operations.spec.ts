/** Native Operations & Intelligence vertical-slice integration tests. */
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
import Approval from '@deepseek-ai/dsh-user-approval'
import { describe, expect, it } from 'vitest'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import DAI from '../src/index.ts'
import type { OperationsState } from '../src/operations-state.ts'

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
  await ctx.plugin(Approval, { policy: 'never' })
  await ctx.plugin(DAI, { allowedTools: [] })
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

async function temporary<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-operations-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI Operations & Intelligence native slice', () => {
  it('persists entities, relations, timeline, gaps, human-gated options and independent review', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const manager = await ctx.agentLoop.create(SessionId('operations-owner'), { provider: 'mock', model: 'fixture' })
    const objective = 'Build an auditable operational picture from the supplied case information'
    const value = () => ctx.dai.readOperations(manager).cases[0]!

    script.push(
      toolCallResponse('create', 'd_ai_operations_create', { objective, classification: 'INTERNAL' }),
      () => toolCallResponse('entity-a', 'd_ai_operations_add_entity', {
        case_id: value().id, type: 'ORGANIZATION', label: 'Entity A', summary: 'Case organization',
      }),
      () => toolCallResponse('entity-b', 'd_ai_operations_add_entity', {
        case_id: value().id, type: 'ACCOUNT', label: 'Account B', summary: 'Account linked in supplied evidence',
      }),
      () => toolCallResponse('relation', 'd_ai_operations_add_relationship', {
        case_id: value().id,
        from_entity_id: value().entities[0]!.id,
        to_entity_id: value().entities[1]!.id,
        type: 'associated-with',
        confidence: 0.7,
        evidence_refs: 'evidence-1',
      }),
      () => toolCallResponse('timeline', 'd_ai_operations_add_timeline', {
        case_id: value().id,
        occurred_at: '2026-10-05T10:00:00Z',
        label: 'Observed case event',
        details: 'Event from supplied case evidence',
        evidence_refs: 'evidence-1',
      }),
      () => toolCallResponse('gap', 'd_ai_operations_add_gap', {
        case_id: value().id,
        question: 'What independent evidence confirms the relationship?',
        priority: 'HIGH',
      }),
      () => toolCallResponse('option', 'd_ai_operations_add_option', {
        case_id: value().id,
        title: 'Collect an independent confirming source',
        description: 'Seek a separate authorized source before drawing a stronger conclusion.',
        expected_benefit: 'Reduce uncertainty and mistaken-identity risk.',
        risks: 'Additional time and data-access cost.',
      }),
      () => toolCallResponse('delegate', 'd_ai_operations_delegate', { case_id: value().id }),
      textResponse('Fusion worker builds a sourced picture with explicit confidence and gaps.'),
      textResponse('Adversarial worker identifies alternative explanations and missing evidence.'),
      textResponse('Operations case updated'),
    )

    let expected: OperationsState
    try {
      manager.followup(createUserMessage({ content: [{ type: 'text', text: objective }], source: { kind: 'user' } }))
      await manager.whenIdle()
      expected = ctx.dai.readOperations(manager)
      expect(expected.cases[0]?.revision).toBe(8)
      expect(expected.cases[0]?.relationships[0]?.confidence).toBe(0.7)
      expect(expected.cases[0]?.gaps[0]?.state).toBe('OPEN')
      expect(expected.cases[0]?.options[0]?.requiresHumanApproval).toBe(true)
      expect(expected.cases[0]?.options[0]?.state).toBe('PROPOSED')
      expect(expected.cases[0]?.delegations[0]?.fusion.agentId)
        .not.toBe(expected.cases[0]?.delegations[0]?.adversarial.agentId)
      await ctx.sessions.flush(manager.session)
    } finally {
      await ctx.fiber.dispose()
    }

    const second = await boot(root, [])
    try {
      const handle = await second.ctx.agents.resume({
        resumeSessionId: SessionId('operations-owner'),
        agentOptions: { provider: 'mock', model: 'fixture' },
      })
      expect(second.ctx.dai.readOperations(handle.agent)).toEqual(expected!)
      await handle.dispose()
    } finally {
      await second.ctx.fiber.dispose()
    }
  }), 15000)

  it('keeps proposed options separate from action execution', async () => temporary(async root => {
    const { ctx, adapter } = await boot(root, [textResponse('Capabilities inspected')])
    try {
      const agent = await ctx.agentLoop.create(SessionId('operations-owner'), { provider: 'mock', model: 'fixture' })
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Inspect operations capabilities' }], source: { kind: 'user' } }))
      await agent.whenIdle()
      const tools = adapter.requests[0]?.tools?.map(tool => tool.name) ?? []
      expect(tools).toContain('d_ai_operations_add_option')
      expect(tools.some(name => /execute_operation|strike|attack|target_action/i.test(name))).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  }))
})
