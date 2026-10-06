/** Native Scientific Research vertical-slice integration tests with fixture model boundaries. */
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
import Approval from '@deepseek-ai/dsh-user-approval'
import { describe, expect, it } from 'vitest'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import DAI from '../src/index.ts'
import type { ScientificState } from '../src/scientific-state.ts'

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
    id: 'scientific-fixture',
    available: () => true,
    fetch: async request => ({
      url: request.url,
      statusCode: 200,
      body: { kind: 'text', content: 'Fixture scientific source.' },
      truncated: false,
    }),
  })
  await ctx.plugin(Subagents)
  await ctx.plugin(Spawn, { providerName: 'spawn' })
  await ctx.plugin(Approval, { policy: 'never' })

  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, "- name: '@deepseek-ai/dsh-experimental-d-ai'\n  config:\n    allowedTools: []\n")
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = ({
    version: 'v2',
    import: async (specifier: string) => {
      if (specifier !== '@deepseek-ai/dsh-experimental-d-ai') throw new Error('Unexpected Loader plugin ' + specifier)
      return { default: DAI }
    },
  } as never)
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()

  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

async function temporary<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-scientific-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI Scientific Research native slice', () => {
  it('persists hypothesis, real experiment handoff, independent review and returned observation', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx, adapter } = await boot(root, script)
    const manager = await ctx.agentLoop.create(SessionId('scientific-owner'), { provider: 'mock', model: 'fixture' })
    const question = 'Does the intervention change the measured outcome?'
    const project = () => ctx.dai.readScientific(manager).projects[0]!

    script.push(
      toolCallResponse('create', 'd_ai_scientific_create', { question }),
      () => toolCallResponse('hypothesis', 'd_ai_scientific_add_hypothesis', {
        project_id: project().id,
        statement: 'The intervention changes the outcome',
        rationale: 'A plausible mechanism exists but still requires testing',
      }),
      () => toolCallResponse('experiment', 'd_ai_scientific_request_experiment', {
        project_id: project().id,
        title: 'Controlled observation',
        objective: 'Measure the outcome under controlled conditions',
        protocol: 'Collect baseline, apply intervention, collect matched follow-up, retain raw measurements.',
        expected_evidence: 'Paired raw measurements with timestamps',
        budget_usd: 25,
      }),
      () => toolCallResponse('delegate', 'd_ai_scientific_delegate', { project_id: project().id }),
      textResponse('Literature worker: evidence is mixed; primary studies and gaps listed.'),
      textResponse('Methodology worker: control confounders and predefine analysis.'),
      () => toolCallResponse('result', 'd_ai_scientific_record_result', {
        project_id: project().id,
        experiment_id: project().experiments[0]!.id,
        observation: 'Observed paired measurements were returned by the human researcher.',
        artifact_ref: 'artifact://fixture/measurements.csv',
      }),
      textResponse('Scientific project updated'),
    )

    let expected: ScientificState
    try {
      manager.followup(createUserMessage({ content: [{ type: 'text', text: question }], source: { kind: 'user' } }))
      await manager.whenIdle()
      expected = ctx.dai.readScientific(manager)
      expect(expected.projects[0]?.revision).toBe(5)
      expect(expected.projects[0]?.hypotheses[0]?.state).toBe('OPEN')
      expect(expected.projects[0]?.experiments[0]?.status).toBe('RESULT_RECORDED')
      expect(expected.projects[0]?.experiments[0]?.artifactRef).toBe('artifact://fixture/measurements.csv')
      expect(expected.projects[0]?.status).toBe('ACTIVE')
      expect(expected.projects[0]?.delegations[0]?.literature.agentId)
        .not.toBe(expected.projects[0]?.delegations[0]?.methodology.agentId)
      expect(adapter.requests.map(request => request.model)).toContain('fixture')
      expect(JSON.stringify(adapter.requests)).not.toContain('Literature worker: evidence is mixed; primary studies and gaps listed.Methodology worker')
      await ctx.sessions.flush(manager.session)
    } finally {
      await ctx.fiber.dispose()
    }

    const second = await boot(root, [])
    try {
      const handle = await second.ctx.agents.resume({
        resumeSessionId: SessionId('scientific-owner'),
        agentOptions: { provider: 'mock', model: 'fixture' },
      })
      expect(second.ctx.dai.readScientific(handle.agent)).toEqual(expected!)
      expect(second.adapter.requests).toEqual([])
      await handle.dispose()
    } finally {
      await second.ctx.fiber.dispose()
    }
  }), 15000)

  it('does not allow a model to silently create an unrelated scientific project', async () => temporary(async root => {
    const { ctx } = await boot(root, [
      toolCallResponse('bad', 'd_ai_scientific_create', { question: 'Unrelated new research project' }),
      textResponse('Approval required'),
    ])
    try {
      const agent = await ctx.agentLoop.create(SessionId('scientific-owner'), { provider: 'mock', model: 'fixture' })
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Read the existing project' }], source: { kind: 'user' } }))
      await agent.whenIdle()
      expect(ctx.dai.readScientific(agent).projects).toEqual([])
      expect(agent.session.snapshotEvents().filter(event => event.type === 'approval/decided')).toHaveLength(1)
    } finally {
      await ctx.fiber.dispose()
    }
  }))
})
