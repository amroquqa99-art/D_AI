/** Native Innovation & Discovery vertical-slice integration tests. */
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
import type { InnovationState } from '../src/innovation-state.ts'

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
  const root = await mkdtemp(join(tmpdir(), 'd-ai-innovation-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI Innovation & Discovery native slice', () => {
  it('persists testable candidates, experiment handoff/results and independent explorer/critic review', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const manager = await ctx.agentLoop.create(SessionId('innovation-owner'), { provider: 'mock', model: 'fixture' })
    const problem = 'Find a lower-energy mechanism for the specified technical process'
    const project = () => ctx.dai.readInnovation(manager).projects[0]!

    script.push(
      toolCallResponse('create', 'd_ai_innovation_create', { problem }),
      () => toolCallResponse('candidate', 'd_ai_innovation_add_candidate', {
        project_id: project().id,
        title: 'Candidate mechanism A',
        description: 'A testable alternative mechanism derived from first-principles constraints.',
        mechanism: 'The candidate changes the process pathway rather than increasing input energy.',
        falsification_test: 'Measure whether the predicted intermediate appears under controlled conditions.',
        novelty_status: 'UNKNOWN',
      }),
      () => toolCallResponse('experiment', 'd_ai_innovation_request_experiment', {
        project_id: project().id,
        title: 'Mechanism discrimination experiment',
        objective: 'Distinguish the candidate mechanism from the baseline mechanism.',
        protocol: 'Run matched baseline and candidate conditions and retain raw measurements.',
        success_criteria: 'Predicted intermediate appears only under candidate conditions with reproducible measurement.',
        failure_criteria: 'Predicted intermediate is absent or equally present in baseline conditions.',
      }),
      () => toolCallResponse('delegate', 'd_ai_innovation_delegate', { project_id: project().id }),
      textResponse('Explorer worker generates alternative mechanisms and explicit assumptions.'),
      textResponse('Critic worker identifies counterexamples, prior-art risks and decisive tests.'),
      () => toolCallResponse('result', 'd_ai_innovation_record_result', {
        project_id: project().id,
        experiment_id: project().experiments[0]!.id,
        observation: 'Human researcher returned the controlled observations without interpreting them as proof.',
        artifact_ref: 'artifact://fixture/innovation.csv',
      }),
      textResponse('Innovation project updated'),
    )

    let expected: InnovationState
    try {
      manager.followup(createUserMessage({ content: [{ type: 'text', text: problem }], source: { kind: 'user' } }))
      await manager.whenIdle()
      expected = ctx.dai.readInnovation(manager)
      expect(expected.projects[0]?.revision).toBe(5)
      expect(expected.projects[0]?.candidates[0]?.state).toBe('OPEN')
      expect(expected.projects[0]?.candidates[0]?.noveltyStatus).toBe('UNKNOWN')
      expect(expected.projects[0]?.experiments[0]?.status).toBe('RESULT_RECORDED')
      expect(expected.projects[0]?.delegations[0]?.explorer.agentId)
        .not.toBe(expected.projects[0]?.delegations[0]?.critic.agentId)
      await ctx.sessions.flush(manager.session)
    } finally {
      await ctx.fiber.dispose()
    }

    const second = await boot(root, [])
    try {
      const handle = await second.ctx.agents.resume({
        resumeSessionId: SessionId('innovation-owner'),
        agentOptions: { provider: 'mock', model: 'fixture' },
      })
      expect(second.ctx.dai.readInnovation(handle.agent)).toEqual(expected!)
      await handle.dispose()
    } finally {
      await second.ctx.fiber.dispose()
    }
  }), 15000)

  it('does not expose a tool that can self-promote generated ideas to verified discoveries', async () => temporary(async root => {
    const { ctx, adapter } = await boot(root, [textResponse('Capabilities inspected')])
    try {
      const agent = await ctx.agentLoop.create(SessionId('innovation-owner'), { provider: 'mock', model: 'fixture' })
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Inspect innovation capabilities' }], source: { kind: 'user' } }))
      await agent.whenIdle()
      const tools = adapter.requests[0]?.tools?.map(tool => tool.name) ?? []
      expect(tools).toContain('d_ai_innovation_add_candidate')
      expect(tools.some(name => /verify_discovery|declare_discovery|promote_candidate/i.test(name))).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  }))
})
