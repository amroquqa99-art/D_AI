/** D_AI durable model registry and routing integration tests. */
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
import type { ModelRegistryState } from '../src/model-registry-state.ts'

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
  const root = await mkdtemp(join(tmpdir(), 'd-ai-model-registry-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI durable model registry', () => {
  it('persists model profiles/policies and routes by hard requirements after restart', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))
    const agent = await ctx.agentLoop.create(SessionId('model-owner'), { provider: 'mock', model: 'fixture' })

    script.push(
      toolCallResponse('local', 'd_ai_model_upsert', {
        id: 'local-reasoner',
        provider: 'local-runtime',
        location: 'LOCAL',
        capabilities: 'reasoning,tool-use,arabic',
        quality_score: 0.82,
        reliability_score: 0.9,
        latency_score: 0.7,
        cost_score: 0.95,
        privacy_score: 1,
        max_context_tokens: 65536,
        enabled: true,
      }),
      toolCallResponse('cloud', 'd_ai_model_upsert', {
        id: 'cloud-reasoner',
        provider: 'cloud-provider',
        location: 'CLOUD',
        capabilities: 'reasoning,tool-use,arabic,long-context',
        quality_score: 0.95,
        reliability_score: 0.94,
        latency_score: 0.8,
        cost_score: 0.5,
        privacy_score: 0.4,
        max_context_tokens: 200000,
        enabled: true,
      }),
      toolCallResponse('policy', 'd_ai_model_policy_set', {
        system_id: 'investigation',
        role: 'mission-director',
        required_capabilities: 'reasoning,tool-use',
        min_context_tokens: 32000,
        local_only: true,
        weight_quality: 0.4,
        weight_reliability: 0.3,
        weight_cost: 0.1,
        weight_privacy: 0.2,
      }),
      toolCallResponse('route', 'd_ai_model_route', {
        system_id: 'investigation',
        role: 'mission-director',
      }),
      textResponse('Model registry configured'),
    )

    let expected: ModelRegistryState
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Configure the approved local-first models and routing policy.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()
      expected = ctx.dai.readModelRegistry(agent)

      expect(expected.registries[0]?.revision).toBe(3)
      expect(expected.registries[0]?.models).toHaveLength(2)
      expect(expected.registries[0]?.policies).toHaveLength(1)
      expect(ctx.dai.routeRegisteredModel(agent, 'investigation', 'mission-director').model.id).toBe('local-reasoner')
      await ctx.sessions.flush(agent.session)
    } finally {
      await ctx.fiber.dispose()
    }

    const second = await boot(root, [])
    try {
      const handle = await second.ctx.agents.resume({
        resumeSessionId: SessionId('model-owner'),
        agentOptions: { provider: 'mock', model: 'fixture' },
      })
      expect(second.ctx.dai.readModelRegistry(handle.agent)).toEqual(expected!)
      expect(second.ctx.dai.routeRegisteredModel(handle.agent, 'investigation', 'mission-director').model.id).toBe('local-reasoner')
      await handle.dispose()
    } finally {
      await second.ctx.fiber.dispose()
    }
  }), 15000)

  it('fails closed when no model satisfies the persisted hard requirements', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))
    const agent = await ctx.agentLoop.create(SessionId('model-owner'), { provider: 'mock', model: 'fixture' })

    script.push(
      toolCallResponse('model', 'd_ai_model_upsert', {
        id: 'cloud-only',
        provider: 'cloud-provider',
        location: 'CLOUD',
        capabilities: 'reasoning',
        quality_score: 0.9,
        reliability_score: 0.9,
        latency_score: 0.9,
        cost_score: 0.5,
        privacy_score: 0.5,
        max_context_tokens: 64000,
        enabled: true,
      }),
      toolCallResponse('policy', 'd_ai_model_policy_set', {
        system_id: 'scientific-research',
        role: 'methodology',
        required_capabilities: 'reasoning',
        min_context_tokens: 32000,
        local_only: true,
      }),
      textResponse('Policy configured'),
    )

    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Configure the approved model policy.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()
      expect(() => ctx.dai.routeRegisteredModel(agent, 'scientific-research', 'methodology')).toThrow()
    } finally {
      await ctx.fiber.dispose()
    }
  }))
})
