/** Published artifact-store export exercised with built native providers. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AttachmentLocal from '@deepseek-ai/dsh-attachment-local'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as DomainStorage from '@deepseek-ai/dsh-storage-domain'
import ArtifactStore, { Config } from '@deepseek-ai/dsh-experimental-d-ai/artifact-store'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

test('published artifact entry preserves bytes using built native services', async () => {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-artifact-built-'))
  const ctx = new Context()
  try {
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(Storage)
    await ctx.plugin(JsonStorage, { root: join(root, 'data') })
    await ctx.plugin(DomainStorage, { backend: 'json' })
    await ctx.plugin(AttachmentLocal, { dshHome: join(root, 'home') })
    await ctx.plugin(ArtifactStore, Config({}))
    const text = 'نتيجة مبنية\n'
    const adapter = new MockAdapter([
      toolCallResponse('store', 'd_ai_artifact_put_text', { title: 'Built experiment', media_type: 'text/plain', text }),
      textResponse('Stored'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = await ctx.agentLoop.create(SessionId('built-artifact-owner'), { provider: 'mock', model: 'fixture' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Preserve the experiment.' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    const records = await ctx.daiArtifacts.list(agent)
    assert.equal(records.length, 1)
    await assert.rejects(ctx.daiArtifacts.list(Object.create(agent)), { code: 'D_AI_POLICY_DENIED' })
    const value = await ctx.daiArtifacts.read(agent, records[0].manifest.attachmentId)
    assert.deepEqual(Buffer.from(value.data), Buffer.from(text))
    assert.equal(value.record.document.title, 'Built experiment')
    assert.equal(adapter.requests.length, 2)
  } finally {
    try { await ctx.fiber.dispose() } finally { await rm(root, { recursive: true, force: true }) }
  }
})
