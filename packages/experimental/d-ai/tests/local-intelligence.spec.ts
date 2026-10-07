/** Real Loader and native child Sessions; only model inference is scripted. */
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
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import * as Local from '../src/local-intelligence.ts'

const input = { objective: 'Verify a reported observation', situation: 'One unverified source; independent corroboration is missing.', evidence_refs: ['source:1'] }
const advice = { action: 'VERIFY', confidence: 0.8, rationale: 'Seek independent corroboration.', evidence_refs: ['source:1'] }

async function fixture<T>(output: string, run: (ctx: Context, adapter: MockAdapter) => Promise<T>, config: Partial<Local.Config> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-local-'))
  const ctx = new Context()
  try {
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(Subagents)
    await ctx.plugin(Spawn, { providerName: 'spawn' })
    await writeFile(join(root, 'cordis.yml'), `- name: 'fixture:local'\n  config: ${JSON.stringify({ provider: 'mock-local', model: 'small-decision', ...config })}\n`)
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.internal = ({ version: 'v2', import: async (specifier: string) => {
      if (specifier !== 'fixture:local') throw new Error('Unexpected Loader plugin ' + specifier)
      return Local
    } } as never)
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(join(root, 'cordis.yml')).href } })
    await ctx.loader.await()
    expect([...ctx.loader.entries()].filter(entry => !entry.disabled && !entry.fiber)).toEqual([])
    const adapter = new MockAdapter([
      toolCallResponse('advice', 'd_ai_local_advise', input),
      ...(config.maxInputBytes ? [] : [output === 'hang' ? 'hang' as const : textResponse(output)]),
      textResponse('Recommendation retained as unverified advice.'),
    ])
    ctx.llm.registerAdapter(['mock-parent', 'mock-local'], adapter)
    return await run(ctx, adapter)
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
}

async function ask(ctx: Context) {
  const owner = await ctx.agentLoop.create(SessionId('decision-owner'), { provider: 'mock-parent', model: 'parent-model' })
  owner.followup(createUserMessage({ content: [{ type: 'text', text: 'Private parent context must not enter the adviser.' }], source: { kind: 'user' } }))
  await owner.whenIdle()
  const event = owner.session.snapshotEvents().find(event => event.type === 'tool/result')
  if (event?.type !== 'tool/result') throw new Error('Advice tool did not settle')
  return { owner, event }
}

describe('D_AI opt-in local decision advice', () => {
  it('uses an isolated tool-free child, records the result, and removes its tool on disposal', async () => fixture(JSON.stringify(advice), async (ctx, adapter) => {
    const { owner, event } = await ask(ctx)
    expect(event.data).toMatchObject({ message: { isError: false } })
    expect(event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')).toContain('"advisory":true')
    expect(event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')).toContain('"verified":false')
    expect(adapter.requests).toHaveLength(3)
    const request = adapter.requests[1]!
    expect(request.provider).toBe('mock-local')
    expect(request.model).toBe('small-decision')
    expect(request.maxTokens).toBe(512)
    expect(request.tools ?? []).toEqual([])
    expect(JSON.stringify(request.messages)).not.toContain('Private parent context')
    expect(request.messages.map(message => ({ role: message.role, content: message.content }))).toMatchSnapshot('bounded model-visible decision context')
    await ctx.sessions.flush(owner.session)
    expect(owner.session.snapshotEvents().filter(event => event.type.startsWith('d_ai/'))).toEqual([])
    const contribution = [...ctx.loader.entries()].find(entry => entry.options.name === 'fixture:local')!
    await contribution.fiber!.dispose()
    expect(ctx.tools.get('d_ai_local_advise')).toBeUndefined()
  }))

  it.each([
    ['malformed JSON', '```json\n{}\n```'],
    ['unknown evidence', JSON.stringify({ ...advice, evidence_refs: ['invented:9'] })],
    ['authority field', JSON.stringify({ ...advice, grant_permission: true })],
    ['low confidence', JSON.stringify({ ...advice, confidence: 0.2 })],
    ['oversized multibyte result', JSON.stringify({ ...advice, rationale: 'ع'.repeat(5000) })],
  ])('escalates %s without accepting an authoritative decision', async (_name, output) => fixture(output, async (ctx) => {
    const { event } = await ask(ctx)
    expect(event.data).toMatchObject({ message: { isError: false } })
    expect(event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')).toContain('"action":"ESCALATE"')
    expect(event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')).toContain('"verified":false')
  }))

  it('rejects an oversized prompt before any child model request', async () => fixture(JSON.stringify(advice), async (ctx, adapter) => {
    const { event } = await ask(ctx)
    expect(event.data).toMatchObject({ message: { isError: true } })
    expect(event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')).toContain('Decision prompt exceeds byte budget')
    expect(adapter.requests).toHaveLength(2)
  }, { maxInputBytes: 32 }))

  it('bounds the complete native context including child instructions and metadata', async () => fixture(JSON.stringify(advice), async (ctx, adapter) => {
    const { event } = await ask(ctx)
    expect(event.data.message.isError).toBe(true)
    expect(event.data.message.content).toContainEqual({ type: 'text', text: 'Error: Decision model did not complete: error' })
    expect(adapter.requests.map(request => request.provider)).toEqual(['mock-parent', 'mock-parent'])
  }, { maxInputBytes: 1700 }))

  it('restricts the owner tool catalog and releases that restriction with its plugin', async () => fixture(JSON.stringify(advice), async (ctx, adapter) => {
    ctx.tools.register(defineTool({
      name: 'fixture_other', description: 'Unrelated fixture capability.', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: async () => 'unused',
    }))
    const { owner } = await ask(ctx)
    expect(adapter.requests[0]?.tools?.map(tool => tool.name)).toEqual(['d_ai_local_advise'])
    expect(ctx.tools.get('fixture_other', owner)).toBeUndefined()
    const contribution = [...ctx.loader.entries()].find(entry => entry.options.name === 'fixture:local')!
    await contribution.fiber!.dispose()
    expect(ctx.tools.get('fixture_other', owner)).toBeDefined()
  }, { rootTools: ['d_ai_local_advise'] }))

  it('cancels stalled inference and settles the child rather than falling back to a provider', async () => fixture('hang', async (ctx, adapter) => {
    const { event } = await ask(ctx)
    expect(event.data).toMatchObject({ message: { isError: true } })
    expect(adapter.requests[1]?.signal?.aborted).toBe(true)
    expect(adapter.requests.map(request => request.provider)).toEqual(['mock-parent', 'mock-local', 'mock-parent'])
  }, { timeoutMs: 200 }))
})
