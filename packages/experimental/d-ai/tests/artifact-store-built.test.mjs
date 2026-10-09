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
import { defineTool } from '@deepseek-ai/dsh-tools'
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
    let backup
    ctx.tools.register(defineTool({
      name: 'artifact_built_restore', parameters: {},
      description: 'Test-only restoration through the published artifact service.',
      output: {
        schema: { type: 'object', properties: { json: { type: 'string', required: true } }, additionalProperties: false },
        render: (_args, value) => [{ type: 'text', text: value.json }],
      },
      execute: async (_args, exec) => {
        if (backup === undefined || exec.agent === undefined) throw new Error('Built archive fixture is not ready')
        return { json: JSON.stringify(await ctx.daiArtifacts.importArchive(exec.agent, backup, exec.signal)) }
      },
    }))
    const script = [
      toolCallResponse('store', 'd_ai_artifact_put_text', { title: 'Built experiment', media_type: 'text/plain', text }),
      textResponse('Stored'),
    ]
    const adapter = new MockAdapter(script)
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
    const archive = await ctx.daiArtifacts.exportArchive(agent)
    const decoded = JSON.parse(Buffer.from(archive).toString())
    assert.equal(decoded.format, 'd_ai.artifact.archive.v1')
    assert.equal(decoded.ownerSessionId, agent.id)
    assert.deepEqual(decoded.records, records)
    assert.deepEqual(Buffer.from(decoded.contents[0].base64, 'base64'), Buffer.from(text))
    await assert.rejects(ctx.daiArtifacts.importArchive(agent, archive), { code: 'D_AI_OPEN_TURN_REQUIRED' })
    backup = archive
    script.push(toolCallResponse('restore', 'artifact_built_restore', {}), textResponse('Restored exact receipts'))
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Restore the operator backup.' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    const result = agent.session.snapshotEvents().findLast(event => event.type === 'tool/result')
    assert.equal(result.data.message.isError, false)
    assert.deepEqual(await ctx.daiArtifacts.list(agent), records)
    assert.equal(adapter.requests.length, 4)
  } finally {
    try { await ctx.fiber.dispose() } finally { await rm(root, { recursive: true, force: true }) }
  }
})
