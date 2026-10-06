/** D_AI shared Evidence Graph runtime integration tests. */
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
import type { EvidenceStoreState } from '../src/evidence-store-state.ts'

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
  const root = await mkdtemp(join(tmpdir(), 'd-ai-evidence-store-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI shared Evidence Graph native slice', () => {
  it('persists provenance-carrying nodes and relations across restart', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const agent = await ctx.agentLoop.create(SessionId('evidence-owner'), { provider: 'mock', model: 'fixture' })
    const store = () => ctx.dai.readEvidenceStore(agent).stores[0]!

    script.push(
      toolCallResponse('source', 'd_ai_evidence_add_node', {
        kind: 'SOURCE',
        system_id: 'investigation',
        label: 'Captured primary source',
        provenance: 'https://example.org/source',
        confidence: 1,
      }),
      () => toolCallResponse('claim', 'd_ai_evidence_add_node', {
        kind: 'CLAIM',
        system_id: 'investigation',
        label: 'Claim anchored to the captured source',
        provenance: store().nodes[0]!.id,
        confidence: 0.8,
      }),
      () => toolCallResponse('edge', 'd_ai_evidence_add_edge', {
        from: store().nodes[0]!.id,
        to: store().nodes[1]!.id,
        kind: 'SUPPORTS',
      }),
      textResponse('Evidence graph updated'),
    )

    let expected: EvidenceStoreState
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Add the supplied source and its anchored claim to the shared evidence graph.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()
      expected = ctx.dai.readEvidenceStore(agent)
      expect(expected.stores[0]?.revision).toBe(3)
      expect(expected.stores[0]?.nodes).toHaveLength(2)
      expect(expected.stores[0]?.edges).toHaveLength(1)
      expect(expected.stores[0]?.edges[0]).toMatchObject({ kind: 'SUPPORTS' })
      expect(expected.stores[0]?.nodes[1]?.provenance).toEqual([expected.stores[0]?.nodes[0]?.id])
      await ctx.sessions.flush(agent.session)
    } finally {
      await ctx.fiber.dispose()
    }

    const second = await boot(root, [])
    try {
      const handle = await second.ctx.agents.resume({
        resumeSessionId: SessionId('evidence-owner'),
        agentOptions: { provider: 'mock', model: 'fixture' },
      })
      expect(second.ctx.dai.readEvidenceStore(handle.agent)).toEqual(expected!)
      await handle.dispose()
    } finally {
      await second.ctx.fiber.dispose()
    }
  }), 15000)

  it('rejects relations whose endpoints are absent', async () => temporary(async root => {
    const { ctx } = await boot(root, [
      toolCallResponse('bad-edge', 'd_ai_evidence_add_edge', {
        from: 'missing-a',
        to: 'missing-b',
        kind: 'RELATES_TO',
      }),
      textResponse('Invalid edge rejected'),
    ])
    try {
      const agent = await ctx.agentLoop.create(SessionId('evidence-owner'), { provider: 'mock', model: 'fixture' })
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Read the evidence graph.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()
      expect(ctx.dai.readEvidenceStore(agent).stores).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  }))
})
