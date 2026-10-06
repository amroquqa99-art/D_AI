/** Native Investor vertical-slice integration tests with fixture model/web boundaries. */
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
import type { InvestorState } from '../src/investor-state.ts'

async function boot(root: string, script: ConstructorParameters<typeof MockAdapter>[0]) {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(Storage)
  await ctx.plugin(JsonStorage, { root: join(root, 'data') })
  await ctx.plugin(DomainStorage, { backend: 'json' })
  await ctx.plugin(WebRuntime)
  ctx.web.registerFetchProvider({
    id: 'investor-fixture',
    available: () => true,
    fetch: async request => ({
      url: request.url,
      statusCode: 200,
      body: { kind: 'text', content: 'Revenue 120. Debt 20. Cash flow 18. Fixture filing data.' },
      truncated: false,
    }),
  })
  await ctx.plugin(Subagents)
  await ctx.plugin(Spawn, { providerName: 'spawn' })
  await ctx.plugin(Approval, { policy: 'never' })
  await ctx.plugin(DAI, { allowedTools: [] })

  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

async function temporary<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-investor-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI Investor native slice', () => {
  it('persists sourced evidence, explicit thesis and independent fundamental/risk review', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const manager = await ctx.agentLoop.create(SessionId('investor-owner'), { provider: 'mock', model: 'fixture' })
    const objective = 'Analyze ExampleCo as a long-term investment'
    const value = () => ctx.dai.readInvestor(manager).cases[0]!

    script.push(
      toolCallResponse('create', 'd_ai_investor_create', { objective }),
      () => toolCallResponse('source', 'd_ai_investor_capture_source', {
        case_id: value().id,
        url: 'https://example.org/filing',
        category: 'FILING',
      }),
      () => toolCallResponse('thesis', 'd_ai_investor_add_thesis', {
        case_id: value().id,
        statement: 'Cash generation may support long-term value creation',
        horizon: 'LONG',
        rationale: 'The captured filing indicates positive cash flow relative to debt',
        invalidation_conditions: 'Material deterioration in cash generation or leverage beyond the thesis assumptions',
      }),
      () => toolCallResponse('delegate', 'd_ai_investor_delegate', { case_id: value().id }),
      textResponse('Fundamental worker assessment with valuation assumptions and cited data.'),
      textResponse('Risk worker assessment with downside cases and invalidation triggers.'),
      textResponse('Investor case updated'),
    )

    let expected: InvestorState
    try {
      manager.followup(createUserMessage({ content: [{ type: 'text', text: objective }], source: { kind: 'user' } }))
      await manager.whenIdle()
      expected = ctx.dai.readInvestor(manager)
      expect(expected.cases[0]?.revision).toBe(4)
      expect(expected.cases[0]?.sources[0]?.category).toBe('FILING')
      expect(expected.cases[0]?.sources[0]?.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(expected.cases[0]?.theses[0]?.horizon).toBe('LONG')
      expect(expected.cases[0]?.theses[0]?.state).toBe('OPEN')
      expect(expected.cases[0]?.delegations[0]?.fundamental.agentId)
        .not.toBe(expected.cases[0]?.delegations[0]?.risk.agentId)
      await ctx.sessions.flush(manager.session)
    } finally {
      await ctx.fiber.dispose()
    }

    const second = await boot(root, [])
    try {
      const handle = await second.ctx.agents.resume({
        resumeSessionId: SessionId('investor-owner'),
        agentOptions: { provider: 'mock', model: 'fixture' },
      })
      expect(second.ctx.dai.readInvestor(handle.agent)).toEqual(expected!)
      await handle.dispose()
    } finally {
      await second.ctx.fiber.dispose()
    }
  }), 15000)

  it('keeps real capital execution outside the Investor tool surface', async () => temporary(async root => {
    const { ctx, adapter } = await boot(root, [textResponse('No execution requested')])
    try {
      const agent = await ctx.agentLoop.create(SessionId('investor-owner'), { provider: 'mock', model: 'fixture' })
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Inspect Investor capabilities' }], source: { kind: 'user' } }))
      await agent.whenIdle()
      const tools = adapter.requests[0]?.tools?.map(tool => tool.name) ?? []
      expect(tools).toContain('d_ai_investor_create')
      expect(tools.some(name => /buy|sell|trade|order|execute/i.test(name))).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  }))
})
