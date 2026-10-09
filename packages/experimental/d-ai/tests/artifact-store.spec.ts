/** Native artifact tool, persistence, isolation and teardown acceptance. */
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AttachmentLocal from '@deepseek-ai/dsh-attachment-local'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as DomainStorage from '@deepseek-ai/dsh-storage-domain'
import { describe, expect, it, vi } from 'vitest'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import ArtifactStore, { Config } from '../src/artifact-store.ts'
import type { ArtifactRecord } from '../src/artifact-store.ts'
import { encodeToolResult, jsonToolOutput } from '../src/tool-support.ts'
import { artifactCatalogKey } from '../src/artifact-record.ts'
import { artifactArchiveSchema } from '../src/artifact-archive.ts'

const text = '\uFEFFنتيجة التجربة: λ = 3\nKeep every byte.\n'
const put = (title = 'تجربة أولى', content = text, parents: string[] = []) => toolCallResponse('put', 'd_ai_artifact_put_text', {
  title, media_type: 'text/plain; charset=utf-8', text: content, parent_ids: parents,
})

async function boot(root: string, script: ConstructorParameters<typeof MockAdapter>[0], limits = {}, resume = false, binary = false,
  archiveAction?: (ctx: Context, agent: Agent) => Promise<unknown>) {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(Storage)
  await ctx.plugin(JsonStorage, { root: join(root, 'data') })
  await ctx.plugin(DomainStorage, { backend: 'json' })
  await ctx.plugin(AttachmentLocal, { dshHome: join(root, 'home') })
  let fiber: Awaited<ReturnType<Context['plugin']>>
  try {
    if (archiveAction === undefined) fiber = await ctx.plugin(ArtifactStore, Config(limits))
    else {
      const path = join(root, 'cordis.yml')
      await writeFile(path, JSON.stringify([{ name: 'fixture:artifacts', config: limits }]))
      ctx.baseUrl = pathToFileURL(root).href + '/'
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      ctx.loader.internal = ({ version: 'v2', import: async (name: string) => {
        if (name !== 'fixture:artifacts') throw new Error('Unexpected artifact Loader plugin ' + name)
        return { default: ArtifactStore }
      } } as never)
      await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
      await ctx.loader.await()
      const entry = [...ctx.loader.entries()].find(item => item.options.name === 'fixture:artifacts')
      if (entry?.fiber === undefined || entry.disabled) throw new Error('Artifact Loader entry did not activate')
      fiber = entry.fiber
    }
  } catch (error) {
    await Promise.allSettled([ctx.fiber.dispose()])
    throw error
  }
  if (binary) ctx.tools.register(defineTool({
    name: 'artifact_test_put_binary', parameters: {}, output: jsonToolOutput,
    description: 'Test-only binary artifact upload through the host service.',
    execute: (_args, exec) => {
      if (exec.agent === undefined) throw new Error('binary fixture requires an Agent')
      return encodeToolResult(ctx.daiArtifacts.put(exec.agent, {
        title: 'Binary experiment', mediaType: 'application/octet-stream', parents: [], data: Uint8Array.of(0xff, 0),
      }))
    },
  }))
  if (archiveAction !== undefined) ctx.tools.register(defineTool({
    name: 'artifact_test_restore', parameters: {}, output: jsonToolOutput,
    description: 'Test-only operator artifact archive restoration in a native turn.',
    execute: (_args, exec) => {
      if (exec.agent === undefined) throw new Error('archive fixture requires an Agent')
      return encodeToolResult(archiveAction(ctx, exec.agent))
    },
  }))
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  const agent = resume
    ? (await ctx.agents.withoutInitiator(() => ctx.agents.resume({
      resumeSessionId: SessionId('artifact-owner'), agentOptions: { provider: 'mock', model: 'fixture' },
    }))).agent
    : await ctx.agentLoop.create(SessionId('artifact-owner'), { provider: 'mock', model: 'fixture' })
  return { ctx, agent, adapter, fiber }
}

async function temporary(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-artifacts-'))
  try { await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

async function turn(agent: Awaited<ReturnType<typeof boot>>['agent']) {
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Preserve the experiment artifact.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
}

describe('D_AI native artifact store', () => {
  it('refuses a catalog whose stored key disagrees with its owner and manifest', async () => temporary(async (root) => {
    const { ctx, agent } = await boot(root, [put(), textResponse('Saved')])
    let key: string
    try {
      await turn(agent)
      const record = (await ctx.daiArtifacts.list(agent))[0]
      if (record === undefined) throw new Error('catalog receipt missing')
      key = artifactCatalogKey(agent.id, record.manifest.attachmentId)
    } finally { await ctx.fiber.dispose() }
    const path = join(root, 'data', 'd_ai_artifact_catalog.json')
    const original = await readFile(path, 'utf8')
    expect(original).toContain(key)
    await writeFile(path, original.replace(key, '0'.repeat(64)))
    await expect(boot(root, [], {}, true)).rejects.toMatchObject({ code: 'D_AI_ARTIFACT_CORRUPT' })
  }))

  it('logs exact UTF-8 tool output, deduplicates manifests and restores parent lineage after restart', async () => temporary(async (root) => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx, agent } = await boot(root, script, { maxArtifactsPerOwner: 2 })
    let records: readonly ArtifactRecord[] = []
    script.push(put(), textResponse('First artifact preserved'))
    try {
      await turn(agent)
      const first = (await ctx.daiArtifacts.list(agent))[0]
      if (first === undefined) throw new Error('first native put did not publish a receipt')
      script.push(put('Follow-up experiment', 'new observation', [first.manifest.attachmentId]), put(),
        toolCallResponse('read', 'd_ai_artifact_read_text', { artifact_id: first.manifest.attachmentId }), textResponse('Artifacts preserved'))
      await turn(agent)
      records = await ctx.daiArtifacts.list(agent)
      expect(records).toHaveLength(2)
      const firstRecord = records.find(record => record.document.title === 'تجربة أولى')
      expect(firstRecord).toBeDefined()
      const result = agent.session.snapshotEvents().findLast(event => event.type === 'tool/result')
      if (result?.type !== 'tool/result') throw new Error('native read result missing')
      expect(result.data.message.content).toEqual([{ type: 'text', text: JSON.stringify({ record: firstRecord, text }) }])
      expect(records.find(record => record.document.title === 'Follow-up experiment')?.document.parents).toEqual([firstRecord?.manifest.attachmentId])
      await expect(ctx.daiArtifacts.put(agent, { title: 'Outside turn', mediaType: 'text/plain', parents: [], data: Buffer.from('x') })).rejects.toMatchObject({ code: 'D_AI_OPEN_TURN_REQUIRED' })
    } finally { await ctx.fiber.dispose() }

    const restarted = await boot(root, [], {}, true)
    try {
      expect(await restarted.ctx.daiArtifacts.list(restarted.agent)).toEqual(records)
      const record = records.find(item => item.document.title === 'تجربة أولى')
      if (record === undefined) throw new Error('restored first artifact missing')
      const value = await restarted.ctx.daiArtifacts.read(restarted.agent, record.manifest.attachmentId)
      expect(Buffer.from(value.data)).toEqual(Buffer.from(text))
      expect(value.record).toEqual(record)
    } finally { await restarted.ctx.fiber.dispose() }
  }), 20000)

  it('refuses foreign roots and forged owners through the public service', async () => temporary(async (root) => {
    const { ctx, agent } = await boot(root, [put(), textResponse('Saved')])
    try {
      await turn(agent)
      expect(agent.session.snapshotEvents().filter(event => event.type === 'tool/result')).toMatchObject([{ data: { message: { isError: false } } }])
      const record = (await ctx.daiArtifacts.list(agent))[0]
      if (record === undefined) throw new Error('artifact missing')
      const other = await ctx.agentLoop.create(SessionId('foreign-owner'), { provider: 'mock', model: 'fixture' })
      expect(await ctx.daiArtifacts.list(other)).toEqual([])
      await expect(ctx.daiArtifacts.read(other, record.manifest.attachmentId)).rejects.toMatchObject({ code: 'D_AI_ARTIFACT_NOT_FOUND' })
      await expect(ctx.daiArtifacts.list(Object.create(agent) as typeof agent)).rejects.toMatchObject({ code: 'D_AI_POLICY_DENIED' })
    } finally { await ctx.fiber.dispose() }
  }))

  it('rejects corrupted native files and a manifest that disagrees with its catalog', async () => temporary(async (root) => {
    const { ctx, agent } = await boot(root, [put(), textResponse('Saved')])
    try {
      await turn(agent)
      const record = (await ctx.daiArtifacts.list(agent))[0]
      if (record === undefined) throw new Error('artifact missing')
      const read = ctx.attachments.readFileStream.bind(ctx.attachments)
      const interception = vi.spyOn(ctx.attachments, 'readFileStream').mockImplementation((ref, signal) => {
        if (ref.attachmentId !== record.manifest.attachmentId) return read(ref, signal)
        return (async function* () { yield Buffer.alloc(ref.bytes, 32) })()
      })
      try {
        await expect(ctx.daiArtifacts.read(agent, record.manifest.attachmentId)).rejects.toMatchObject({ code: 'D_AI_ARTIFACT_CORRUPT' })
      } finally { interception.mockRestore() }
      const path = ctx.attachments.fileHostPath(record.document.content)
      if (path === undefined) throw new Error('native attachment has no host path')
      await chmod(path, 0o600)
      await writeFile(path, Buffer.alloc(record.document.content.bytes, 0))
      await expect(ctx.daiArtifacts.read(agent, record.manifest.attachmentId)).rejects.toMatchObject({ code: 'ATTACHMENT_CORRUPT' })
    } finally { await ctx.fiber.dispose() }
  }))

  it('applies exact UTF-8 byte admission, catalog capacity and same-owner parent checks', async () => temporary(async (root) => {
    const script = [put('Exact bytes', 'λ'), put('Too large', 'λλ'), put('Full', 'a'), put('Bad lineage', 'b', ['sha256:' + '0'.repeat(64)]), textResponse('Limits checked')]
    const { ctx, agent } = await boot(root, script, { maxArtifactBytes: 2, maxArtifactsPerOwner: 1 })
    try {
      const admissionWrites = vi.spyOn(ctx.attachments, 'saveFile')
      await turn(agent)
      expect(admissionWrites).toHaveBeenCalledTimes(2)
      admissionWrites.mockRestore()
      expect((await ctx.daiArtifacts.list(agent)).map(record => record.document.title)).toEqual(['Exact bytes'])
      const outputs = agent.session.snapshotEvents().filter(event => event.type === 'tool/result')
      expect(outputs).toHaveLength(4)
      expect(outputs.slice(1).every(event => event.data.message.isError)).toBe(true)
      const saves = vi.spyOn(ctx.attachments, 'saveFile')
      const cancellation = new AbortController(); cancellation.abort(new Error('canceled before write'))
      await expect(ctx.daiArtifacts.put(agent, { title: 'Canceled', mediaType: 'text/plain', parents: [], data: Buffer.from('a') }, cancellation.signal)).rejects.toThrow('canceled before write')
      expect(saves).not.toHaveBeenCalled()
    } finally { await ctx.fiber.dispose() }
  }))

  it('rejects oversized manifests and complete tool envelopes without publishing partial results', async () => temporary(async (root) => {
    const first = await boot(root, [put(), textResponse('Rejected')], { maxManifestBytes: 1 })
    try {
      await turn(first.agent)
      expect(await first.ctx.daiArtifacts.list(first.agent)).toEqual([])
    } finally { await first.ctx.fiber.dispose() }
    const script = [put(), toolCallResponse('list', 'd_ai_artifact_list', {}), textResponse('Bounded')]
    const second = await boot(root, script, { maxToolResultBytes: 1 }, true)
    try {
      const boundary = second.agent.session.seq
      await turn(second.agent)
      expect(await second.ctx.daiArtifacts.list(second.agent)).toHaveLength(1)
      const outputs = second.agent.session.snapshotEvents().filter(event => event.type === 'tool/result' && event.seq >= boundary)
      expect(outputs).toHaveLength(2)
      expect(outputs).toMatchObject([
        { data: { message: { isError: true } } }, { data: { message: { isError: true } } },
      ])
    } finally { await second.ctx.fiber.dispose() }
  }))

  it('denies cross-owner lineage before writing either content or manifest', async () => temporary(async (root) => {
    const script = [put(), textResponse('Saved')]
    const { ctx, agent } = await boot(root, script)
    try {
      await turn(agent)
      const parent = (await ctx.daiArtifacts.list(agent))[0]
      if (parent === undefined) throw new Error('parent missing')
      const other = await ctx.agentLoop.create(SessionId('other-owner'), { provider: 'mock', model: 'fixture' })
      const writes = vi.spyOn(ctx.attachments, 'saveFile')
      script.push(put('Foreign lineage', 'claim', [parent.manifest.attachmentId]), textResponse('Denied'))
      await turn(other)
      expect(await ctx.daiArtifacts.list(other)).toEqual([])
      expect(writes).not.toHaveBeenCalled()
      const result = other.session.snapshotEvents().find(event => event.type === 'tool/result')
      expect(result).toMatchObject({ data: { message: { isError: true } } })
      expect(JSON.stringify(result)).toContain('artifact is absent or not owned by this root')
    } finally { await ctx.fiber.dispose() }
  }))

  it('preserves binary host uploads and refuses to render invalid UTF-8 as text', async () => temporary(async (root) => {
    const script = [toolCallResponse('binary', 'artifact_test_put_binary', {}), textResponse('Stored binary')]
    const { ctx, agent } = await boot(root, script, {}, false, true)
    try {
      await turn(agent)
      expect(agent.session.snapshotEvents().filter(event => event.type === 'tool/result')).toMatchObject([
        { data: { message: { isError: false } } },
      ])
      const record = (await ctx.daiArtifacts.list(agent))[0]
      if (record === undefined) throw new Error('binary receipt missing')
      expect(Buffer.from((await ctx.daiArtifacts.read(agent, record.manifest.attachmentId)).data)).toEqual(Buffer.from([0xff, 0]))
      script.push(toolCallResponse('read', 'd_ai_artifact_read_text', { artifact_id: record.manifest.attachmentId }), textResponse('Binary refused'))
      await turn(agent)
      expect(agent.session.snapshotEvents().findLast(event => event.type === 'tool/result'))
        .toMatchObject({ data: { message: { isError: true } } })
    } finally { await ctx.fiber.dispose() }
  }))

  it('removes tool contributions and drains an interrupted read before provider disposal', async () => temporary(async (root) => {
    const { ctx, agent, fiber } = await boot(root, [put(), textResponse('Saved')])
    try {
      await turn(agent)
      const record = (await ctx.daiArtifacts.list(agent))[0]
      if (record === undefined) throw new Error('artifact missing')
      let entered!: () => void
      let release!: () => void
      const ready = new Promise<void>((resolve) => { entered = resolve })
      const barrier = new Promise<void>((resolve) => { release = resolve })
      let exited = false
      const interception = vi.spyOn(ctx.attachments, 'readFileStream').mockImplementation((_ref, signal) => (async function* () {
        try { entered(); await barrier; signal?.throwIfAborted(); yield new Uint8Array() } finally { exited = true }
      })())
      const reading = ctx.daiArtifacts.read(agent, record.manifest.attachmentId)
      const rejected = expect(reading).rejects.toThrow('D_AI artifact store disposed')
      let disposed: Promise<void> | undefined
      try {
        await ready
        disposed = fiber.dispose()
        await Promise.resolve()
        expect(exited).toBe(false)
        release()
        await rejected
        await disposed
      } finally {
        release()
        await Promise.allSettled([reading, rejected, disposed])
        interception.mockRestore()
      }
      expect(exited).toBe(true)
      expect(ctx.tools.schemas().some(tool => tool.name.startsWith('d_ai_artifact_'))).toBe(false)
    } finally { await ctx.fiber.dispose() }
  }))


  it('exports verified deduplicated bytes and restores exact lineage through a Loader on an isolated host', async () => temporary(async (root) => {
    const script = [put(), textResponse('Parent saved')]
    const source = await boot(root, script, {}, false, true)
    let archive: Uint8Array
    let records: readonly ArtifactRecord[]
    try {
      await turn(source.agent)
      const parent = (await source.ctx.daiArtifacts.list(source.agent))[0]!
      script.push(put('Derived experiment', text, [parent.manifest.attachmentId]),
        toolCallResponse('binary', 'artifact_test_put_binary', {}), textResponse('Lineage and binary saved'))
      await turn(source.agent)
      records = await source.ctx.daiArtifacts.list(source.agent)
      archive = await source.ctx.daiArtifacts.exportArchive(source.agent)
      expect(Buffer.from(await source.ctx.daiArtifacts.exportArchive(source.agent))).toEqual(Buffer.from(archive))
      expect(JSON.parse(Buffer.from(archive).toString())).toMatchObject({ format: 'd_ai.artifact.archive.v1', ownerSessionId: source.agent.id })
      expect(artifactArchiveSchema.parse(JSON.parse(Buffer.from(archive).toString())).contents).toHaveLength(2)
      await expect(source.ctx.daiArtifacts.importArchive(source.agent, archive)).rejects.toMatchObject({ code: 'D_AI_OPEN_TURN_REQUIRED' })
    } finally { await source.ctx.fiber.dispose() }
    const destination = join(root, 'destination')
    await mkdir(destination)
    const restoreScript = [toolCallResponse('restore', 'artifact_test_restore', {}), textResponse('Restored')]
    const target = await boot(destination, restoreScript, { maxArtifactsPerOwner: 3 }, false, false,
      (ctx, agent) => ctx.daiArtifacts.importArchive(agent, archive))
    try {
      await turn(target.agent)
      expect(target.agent.session.snapshotEvents().find(event => event.type === 'tool/result')).toMatchObject({ data: { message: { isError: false } } })
      expect(await target.ctx.daiArtifacts.list(target.agent)).toEqual(records)
      for (const record of records) {
        const value = await target.ctx.daiArtifacts.read(target.agent, record.manifest.attachmentId)
        expect(Buffer.from(value.data)).toEqual(record.document.mediaType === 'application/octet-stream' ? Buffer.from([0xff, 0]) : Buffer.from(text))
      }
      restoreScript.push(toolCallResponse('repeat', 'artifact_test_restore', {}), textResponse('Retry returned same receipts'))
      await turn(target.agent)
      expect(await target.ctx.daiArtifacts.list(target.agent)).toEqual(records)
    } finally { await target.ctx.fiber.dispose() }
    const restarted = await boot(destination, [], {}, true)
    try {
      expect(await restarted.ctx.daiArtifacts.list(restarted.agent)).toEqual(records)
      expect(Buffer.from(await restarted.ctx.daiArtifacts.exportArchive(restarted.agent))).toEqual(Buffer.from(archive))
    } finally { await restarted.ctx.fiber.dispose() }
  }))

  it('rejects corrupt bytes, receipts, duplicate identities and incomplete lineage before any writes', async () => temporary(async (root) => {
    const script = [put(), textResponse('Saved')]
    let input = new Uint8Array()
    const fixture = await boot(root, script, {}, false, false, (ctx, agent) => ctx.daiArtifacts.importArchive(agent, input))
    try {
      await turn(fixture.agent)
      const original = Buffer.from(await fixture.ctx.daiArtifacts.exportArchive(fixture.agent)).toString()
      const mutators = [
        (value: ReturnType<typeof artifactArchiveSchema.parse>) => { value.contents[0]!.base64 = Buffer.from('tampered').toString('base64') },
        (value: ReturnType<typeof artifactArchiveSchema.parse>) => { value.contents[0]!.base64 += '\n' },
        (value: ReturnType<typeof artifactArchiveSchema.parse>) => { value.records[0]!.document.title = 'Changed' },
        (value: ReturnType<typeof artifactArchiveSchema.parse>) => { value.records.push(value.records[0]!) },
        (value: ReturnType<typeof artifactArchiveSchema.parse>) => { value.contents.push(value.contents[0]!) },
        (value: ReturnType<typeof artifactArchiveSchema.parse>) => {
          value.records[0]!.document.parents = [AttachmentId('sha256:' + '0'.repeat(64))]
          const bytes = Buffer.from(JSON.stringify(value.records[0]!.document))
          value.records[0]!.manifest.attachmentId = AttachmentId('sha256:' + createHash('sha256').update(bytes).digest('hex'))
          value.records[0]!.manifest.bytes = bytes.byteLength
        },
        (value: ReturnType<typeof artifactArchiveSchema.parse>) => { value.records[0]!.document.content.bytes++ },
        (value: ReturnType<typeof artifactArchiveSchema.parse>) => { value.ownerSessionId = 'another-root' },
      ]
      const writes = vi.spyOn(fixture.ctx.attachments, 'saveFile')
      for (const mutate of mutators) {
        const altered = artifactArchiveSchema.parse(JSON.parse(original)); mutate(altered); input = Buffer.from(JSON.stringify(altered))
        script.push(toolCallResponse('reject', 'artifact_test_restore', {}), textResponse('Denied'))
        await turn(fixture.agent)
        expect(fixture.agent.session.snapshotEvents().findLast(event => event.type === 'tool/result'))
          .toMatchObject({ data: { message: { isError: true } } })
      }
      expect(writes).not.toHaveBeenCalled()
      expect(await fixture.ctx.daiArtifacts.list(fixture.agent)).toHaveLength(1)
      await expect(fixture.ctx.daiArtifacts.exportArchive(Object.create(fixture.agent) as Agent)).rejects.toMatchObject({ code: 'D_AI_POLICY_DENIED' })
      await expect(fixture.ctx.daiArtifacts.importArchive(Object.create(fixture.agent) as Agent, Buffer.from(original))).rejects.toMatchObject({ code: 'D_AI_POLICY_DENIED' })
    } finally { await fixture.ctx.fiber.dispose() }
  }))

  it('keeps a committed parent after a provider failure and retries an import after native restart', async () => temporary(async (root) => {
    const script = [put(), textResponse('Parent')]
    const source = await boot(root, script)
    let archive: Uint8Array
    let records: readonly ArtifactRecord[]
    try {
      await turn(source.agent)
      const parent = (await source.ctx.daiArtifacts.list(source.agent))[0]!
      script.push(put('Child', 'Derived result', [parent.manifest.attachmentId]), textResponse('Child'))
      await turn(source.agent)
      records = await source.ctx.daiArtifacts.list(source.agent)
      archive = await source.ctx.daiArtifacts.exportArchive(source.agent)
    } finally { await source.ctx.fiber.dispose() }
    const destination = join(root, 'interrupted')
    await mkdir(destination)
    const initial = await boot(destination, [toolCallResponse('restore', 'artifact_test_restore', {}), textResponse('Storage failed')], {}, false, false,
      (ctx, agent) => ctx.daiArtifacts.importArchive(agent, archive))
    try {
      const save = initial.ctx.attachments.saveFile.bind(initial.ctx.attachments)
      let count = 0
      const interception = vi.spyOn(initial.ctx.attachments, 'saveFile').mockImplementation((input) => {
        if (++count === 3) throw new Error('Injected second artifact storage failure')
        return save(input)
      })
      try { await turn(initial.agent) } finally { interception.mockRestore() }
      const partial = await initial.ctx.daiArtifacts.list(initial.agent)
      expect(partial).toHaveLength(1)
      expect(partial[0]!.document.parents).toEqual([])
      expect(initial.agent.session.snapshotEvents().findLast(event => event.type === 'tool/result'))
        .toMatchObject({ data: { message: { isError: true } } })
    } finally { await initial.ctx.fiber.dispose() }
    const retry = await boot(destination, [toolCallResponse('retry', 'artifact_test_restore', {}), textResponse('Recovered')], {}, true, false,
      (ctx, agent) => ctx.daiArtifacts.importArchive(agent, archive))
    try {
      await turn(retry.agent)
      expect(await retry.ctx.daiArtifacts.list(retry.agent)).toEqual(records)
      for (const record of records) await retry.ctx.daiArtifacts.read(retry.agent, record.manifest.attachmentId)
    } finally { await retry.ctx.fiber.dispose() }
  }))

  it('charges the exact complete archive envelope and refuses destination limits before writes', async () => temporary(async (root) => {
    const source = await boot(root, [put(), textResponse('Saved')])
    let archive: Uint8Array
    try {
      await turn(source.agent)
      archive = await source.ctx.daiArtifacts.exportArchive(source.agent)
    } finally { await source.ctx.fiber.dispose() }
    for (const [name, limits, accepted] of [
      ['exact', { maxArchiveBytes: archive.byteLength }, true],
      ['one-short', { maxArchiveBytes: archive.byteLength - 1 }, false],
      ['content', { maxArtifactBytes: 1 }, false],
      ['manifest', { maxManifestBytes: 1 }, false],
    ] as const) {
      const destination = join(root, name)
      await mkdir(destination)
      const fixture = await boot(destination, [toolCallResponse('restore', 'artifact_test_restore', {}), textResponse('Checked')], limits, false, false,
        (ctx, agent) => ctx.daiArtifacts.importArchive(agent, archive))
      try {
        const writes = vi.spyOn(fixture.ctx.attachments, 'saveFile')
        await turn(fixture.agent)
        expect((await fixture.ctx.daiArtifacts.list(fixture.agent)).length).toBe(accepted ? 1 : 0)
        expect(fixture.agent.session.snapshotEvents().findLast(event => event.type === 'tool/result'))
          .toMatchObject({ data: { message: { isError: !accepted } } })
        if (accepted) expect((await fixture.ctx.daiArtifacts.exportArchive(fixture.agent)).byteLength).toBe(archive.byteLength)
        else expect(writes).not.toHaveBeenCalled()
      } finally { await fixture.ctx.fiber.dispose() }
    }
    const tiny = await boot(root, [], { maxArchiveBytes: 1 }, true)
    try {
      const reads = vi.spyOn(tiny.ctx.attachments, 'readFileStream')
      await expect(tiny.ctx.daiArtifacts.exportArchive(tiny.agent)).rejects.toMatchObject({ code: 'D_AI_ARTIFACT_LIMIT' })
      expect(reads).not.toHaveBeenCalled()
    } finally { await tiny.ctx.fiber.dispose() }
  }))


  it('rejects combined catalog capacity and cancellation before archive storage', async () => temporary(async (root) => {
    const source = await boot(root, [put(), textResponse('Saved')])
    let archive: Uint8Array
    try {
      await turn(source.agent)
      archive = await source.ctx.daiArtifacts.exportArchive(source.agent)
    } finally { await source.ctx.fiber.dispose() }
    const destination = join(root, 'full'); await mkdir(destination)
    const script = [put('Existing', 'Unrelated content'), textResponse('Already full')]
    const target = await boot(destination, script, { maxArtifactsPerOwner: 1 }, false, false,
      (ctx, agent) => ctx.daiArtifacts.importArchive(agent, archive))
    try {
      await turn(target.agent)
      const writes = vi.spyOn(target.ctx.attachments, 'saveFile')
      script.push(toolCallResponse('restore', 'artifact_test_restore', {}), textResponse('Capacity refused'))
      await turn(target.agent)
      expect(target.agent.session.snapshotEvents().findLast(event => event.type === 'tool/result'))
        .toMatchObject({ data: { message: { isError: true } } })
      expect((await target.ctx.daiArtifacts.list(target.agent)).map(record => record.document.title)).toEqual(['Existing'])
      const cancellation = new AbortController(); cancellation.abort(new Error('Backup canceled'))
      await expect(target.ctx.daiArtifacts.importArchive(target.agent, archive, cancellation.signal)).rejects.toThrow('Backup canceled')
      await expect(target.ctx.daiArtifacts.exportArchive(target.agent, cancellation.signal)).rejects.toThrow('Backup canceled')
      expect(writes).not.toHaveBeenCalled()
    } finally { await target.ctx.fiber.dispose() }
  }))
})
