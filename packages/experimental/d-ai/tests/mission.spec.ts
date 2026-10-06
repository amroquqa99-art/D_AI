/** Native Loader, AgentLoop, JSONL and domain-storage integration; model/web boundaries are labeled fixtures. */
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
import { projectFact } from '../src/state.ts'
import type { MissionState } from '../src/state.ts'

async function boot(root: string, script: ConstructorParameters<typeof MockAdapter>[0], maxSourceBytes = 200000) {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(Storage)
  await ctx.plugin(JsonStorage, { root: join(root, 'data') })
  await ctx.plugin(DomainStorage, { backend: 'json' })
  await ctx.plugin(WebRuntime)
  ctx.web.registerFetchProvider({ id: 'test-fixture', available: () => true, fetch: async request => ({
    url: request.url, statusCode: 200, body: { kind: 'text', content: 'Original fixture observation: water is liquid.' }, truncated: false,
  }) })
  await ctx.plugin(Subagents)
  await ctx.plugin(Spawn, { providerName: 'spawn' })
  await ctx.plugin(Approval, { policy: 'never' })
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, `- name: '@deepseek-ai/dsh-experimental-d-ai'\n  config:\n    allowedTools: []\n    maxSourceBytes: ${maxSourceBytes}\n`)
  ctx.baseUrl = `${pathToFileURL(root).href}/`
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = ({ version: 'v2', import: async (specifier: string) => {
    if (specifier !== '@deepseek-ai/dsh-experimental-d-ai') throw new Error(`Unexpected Loader plugin ${specifier}`)
    return { default: DAI }
  } } as never)
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  expect([...ctx.loader.entries()].filter(entry => !entry.disabled && entry.fiber === undefined)).toEqual([])
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

async function temporary<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-mission-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI native missions (fixture model and fixture public source)', () => {
  it('runs user -> mission -> captured source -> anchored claim -> independent children -> durable replay', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx, adapter } = await boot(root, script)
    const manager = await ctx.agentLoop.create(SessionId('owner'), { provider: 'mock', model: 'fixture' })
    const objective = 'Investigate the supplied public observation'
    const mission = () => ctx.dai.read(manager).missions[0]!
    script.push(
      toolCallResponse('create', 'd_ai_mission_create', { objective }),
      () => toolCallResponse('capture', 'd_ai_capture_source', { mission_id: mission().id, url: 'https://example.org/public' }),
      () => toolCallResponse('claim', 'd_ai_add_claim', { mission_id: mission().id, source_id: mission().sources[0]!.id, text: 'The fixture says water is liquid', excerpt: 'water is liquid' }),
      () => toolCallResponse('delegate', 'd_ai_delegate', { mission_id: mission().id }),
      textResponse('research fixture assessment'), textResponse('independent verifier fixture assessment'),
      textResponse('Fixture case retained for review'),
    )
    let expected: MissionState
    try {
      manager.followup(createUserMessage({ content: [{ type: 'text', text: objective }], source: { kind: 'user' } }))
      await manager.whenIdle()
      expected = ctx.dai.read(manager)
      if (expected.missions[0]?.revision !== 4) {
        const diagnosticEvents = manager.session.snapshotEvents().map(event => ({
          type: event.type,
          ...event.type === 'tool/result' ? { data: event.data } : {},
        }))
        const diagnosticRequests = adapter.requests.map(request => ({
          provider: request.provider,
          model: request.model,
          tools: request.tools?.map(tool => tool.name),
        }))
        throw new Error(`Expected delegated revision 4; diagnostic=${JSON.stringify({ diagnosticRequests, diagnosticEvents })}`)
      }
      expect(expected.missions[0]?.sources[0]?.hashEncoding).toBe('utf8-decoded-content')
      expect(expected.missions[0]?.claims[0]?.state).toBe('OBSERVED')
      expect(expected.missions[0]?.delegations[0]?.research.agentId).not.toBe(expected.missions[0]?.delegations[0]?.verification.agentId)
      expect(adapter.requests).toHaveLength(7)
      expect(JSON.stringify(adapter.requests[5]?.messages)).not.toContain('research fixture assessment')
      expect(ctx.sessionProjections.snapshot(manager.session).values.dai).toEqual(expected)
      await ctx.sessions.flush(manager.session)
    } finally { await ctx.fiber.dispose() }
    const second = await boot(root, [])
    try {
      const handle = await second.ctx.agents.resume({ resumeSessionId: SessionId('owner'), agentOptions: { provider: 'mock', model: 'fixture' } })
      expect(second.ctx.dai.read(handle.agent)).toEqual(expected!)
      expect(second.adapter.requests).toEqual([])
      await handle.dispose()
    } finally { await second.ctx.fiber.dispose() }
  }), 15000)

  it('denies a model-proposed independent mission despite a legitimate root identity', async () => temporary(async root => {
    const { ctx } = await boot(root, [toolCallResponse('bad', 'd_ai_mission_create', { objective: 'Unrelated autonomous new mission' }), textResponse('Approval required')])
    try {
      const agent = await ctx.agentLoop.create(SessionId('owner'), { provider: 'mock', model: 'fixture' })
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Read my existing mission' }], source: { kind: 'user' } }))
      await agent.whenIdle()
      expect(ctx.dai.read(agent).missions).toEqual([])
      expect(agent.session.snapshotEvents().filter(event => event.type === 'approval/decided')).toHaveLength(1)
    } finally { await ctx.fiber.dispose() }
  }))

  it('rejects source budget overflow without appending evidence and rejects mutation outside a turn', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script, 4)
    const agent = await ctx.agentLoop.create(SessionId('owner'), { provider: 'mock', model: 'fixture' })
    try {
      script.push(toolCallResponse('create', 'd_ai_mission_create', { objective: 'Question' }),
        () => toolCallResponse('capture', 'd_ai_capture_source', { mission_id: ctx.dai.read(agent).missions[0]!.id, url: 'https://example.org' }), textResponse('Source needs budget approval'))
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Question' }], source: { kind: 'user' } }))
      await agent.whenIdle()
      expect(ctx.dai.read(agent).missions[0]?.sources).toEqual([])
      await expect(ctx.dai.create(agent, 'Question')).rejects.toThrow('open native Agent turn')
    } finally { await ctx.fiber.dispose() }
  }))

  it('rejects forged identities and preserves raw facts against caller mutation', async () => temporary(async root => {
    const { ctx } = await boot(root, [toolCallResponse('create', 'd_ai_mission_create', { objective: 'Question' }), textResponse('Created')])
    try {
      const agent = await ctx.agentLoop.create(SessionId('owner'), { provider: 'mock', model: 'fixture' })
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Question' }], source: { kind: 'user' } }))
      await agent.whenIdle()
      const detached = ctx.dai.read(agent)
      expect(() => { detached.missions[0]!.objective = 'mutated' }).toThrow()
      expect(() => ctx.dai.read({ ...agent })).toThrow('exact live owner')
      let replay: MissionState = { missions: [] }
      for (const event of agent.session.snapshotEvents()) replay = projectFact(replay, event)
      expect(replay).toEqual(detached)
    } finally { await ctx.fiber.dispose() }
  }))
})
