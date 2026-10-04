/** Real Agent loops and spawn transport with a scripted model boundary; no live-provider claim. */
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { MockAdapter, maxTokensResponse, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { runInvestigationDelegates, type InvestigationDelegationConfig } from '../src/orchestration.ts'

const config: InvestigationDelegationConfig = {
  provider: 'spawn', maxDepth: 2, maxOutputTokens: 128, maxRequestsPerChild: 2, timeoutMs: 5000,
  researchModel: 'research-fixture', verificationModel: 'verification-fixture',
  allowedTools: [], maxResultBytes: 4096,
}

async function setup(script: ConstructorParameters<typeof MockAdapter>[0]) {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  await ctx.plugin(Spawn, { providerName: 'spawn' })
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  const manager = await ctx.agentLoop.create(SessionId('investigative-manager'), { provider: 'mock', model: 'manager-fixture' })
  return { ctx, adapter, manager }
}

describe('investigative native delegation', () => {
  it('invokes independent child model calls with separate sessions, routes and bounded output', async () => {
    const { ctx, adapter, manager } = await setup([textResponse('AUTHOR_PRIVATE_CONCLUSION'), textResponse('independent open assessment')])
    const lineage: Array<{ id: string; parent?: string }> = []
    const disposeObserver = ctx.on('agent/created', ({ agent }) => {
      lineage.push({ id: agent.id, ...(agent.session.header.parentSession === undefined ? {} : { parent: agent.session.header.parentSession }) })
    })
    try {
      const result = await runInvestigationDelegates(ctx, manager, 'Investigate a public research question', new AbortController().signal, config)
      expect(result.research.agentId).not.toBe(result.verification.agentId)
      expect(result.research.content).toBe('AUTHOR_PRIVATE_CONCLUSION')
      expect(result.verification.content).toBe('independent open assessment')
      expect(adapter.requests).toHaveLength(2)
      expect(adapter.requests.map(request => request.model)).toEqual(['research-fixture', 'verification-fixture'])
      expect(adapter.requests.every(request => request.maxTokens === 128)).toBe(true)
      expect(JSON.stringify(adapter.requests[1]?.messages)).not.toContain('AUTHOR_PRIVATE_CONCLUSION')
      expect(lineage).toEqual([
        { id: result.research.agentId, parent: manager.id },
        { id: result.verification.agentId, parent: manager.id },
      ])
      expect(ctx.agents.list().map(agent => agent.id)).toEqual([manager.id])
    } finally {
      disposeObserver()
      await ctx.fiber.dispose()
    }
  })

  it('rejects partial output and releases the child before any verifier starts', async () => {
    const { ctx, adapter, manager } = await setup([maxTokensResponse('partial claim')])
    try {
      await expect(runInvestigationDelegates(ctx, manager, 'Question', new AbortController().signal, config))
        .rejects.toThrow('research worker stopped: max-tokens')
      expect(adapter.requests).toHaveLength(1)
      expect(ctx.agents.list().map(agent => agent.id)).toEqual([manager.id])
    } finally { await ctx.fiber.dispose() }
  })

  it('stops a hanging request at its configured deadline and drains the child', async () => {
    const { ctx, manager } = await setup(['hang'])
    try {
      await expect(runInvestigationDelegates(ctx, manager, 'Question', new AbortController().signal, { ...config, timeoutMs: 100 }))
        .rejects.toThrow('time budget exceeded')
      expect(ctx.agents.list().map(agent => agent.id)).toEqual([manager.id])
    } finally { await ctx.fiber.dispose() }
  })

  it('blocks a further model request when the worker request budget is exhausted', async () => {
    const { ctx, adapter, manager } = await setup([toolCallResponse('call-fixture', 'missing_tool', {}), textResponse('must not run')])
    try {
      await expect(runInvestigationDelegates(ctx, manager, 'Question', new AbortController().signal, { ...config, maxRequestsPerChild: 1 }))
        .rejects.toThrow('request budget exceeded')
      expect(adapter.requests).toHaveLength(1)
      expect(ctx.agents.list().map(agent => agent.id)).toEqual([manager.id])
    } finally { await ctx.fiber.dispose() }
  })

  it('enforces native depth admission without invoking a model', async () => {
    const { ctx, adapter, manager } = await setup([])
    try {
      await expect(runInvestigationDelegates(ctx, manager, 'Question', new AbortController().signal, { ...config, maxDepth: 0 }))
        .rejects.toThrow('exceeds maxDepth')
      expect(adapter.requests).toHaveLength(0)
    } finally { await ctx.fiber.dispose() }
  })

  it('denies an inherited mutation tool through the native executor', async () => {
    const { ctx, adapter, manager } = await setup([
      toolCallResponse('mutation-attempt', 'dangerous_fixture', {}),
      textResponse('tool denied'), textResponse('independent assessment'),
    ])
    let executions = 0
    const removeTool = ctx.tools.register(defineContentToolFixture({
      name: 'dangerous_fixture', description: 'Mutation fixture',
      parameters: {},
      execute: async () => { executions += 1; return [{ type: 'text', text: 'mutation performed' }] },
    }))
    try {
      await runInvestigationDelegates(ctx, manager, 'Question', new AbortController().signal, config)
      expect(executions).toBe(0)
      expect(adapter.requests[0]?.tools?.some(tool => tool.name === 'dangerous_fixture')).not.toBe(true)
    } finally { removeTool(); await ctx.fiber.dispose() }
  })

  it('rejects oversized multibyte final output without starting verification', async () => {
    const { ctx, adapter, manager } = await setup([textResponse('عربي')])
    try {
      await expect(runInvestigationDelegates(ctx, manager, 'Question', new AbortController().signal, { ...config, maxResultBytes: 4 }))
        .rejects.toThrow('result byte budget exceeded')
      expect(adapter.requests).toHaveLength(1)
    } finally { await ctx.fiber.dispose() }
  })
})
