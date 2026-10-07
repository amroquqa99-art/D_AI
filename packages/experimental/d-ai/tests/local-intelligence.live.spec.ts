/** Opt-in real GGUF inference; the parent only supplies a deterministic tool call. */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { describe, expect, it } from 'vitest'
import { resolveProfiles } from '../../../llm/llm-pi-ai/src/config.ts'
import { z } from 'zod'
import { memoryAuth } from '../../../llm/llm-pi-ai/tests/auth-double.ts'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import * as Local from '../src/local-intelligence.ts'

const executable = process.env.D_AI_LLAMA_SERVER
const model = process.env.D_AI_GGUF
const expectedHash = process.env.D_AI_GGUF_SHA256

describe.skipIf(!executable || !model || !expectedHash)('D_AI real local decision inference', () => {
  it('runs a hash-verified local model through the native pi-ai adapter and decision tool', async () => {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(model!)) {
      if (!Buffer.isBuffer(chunk)) throw new Error('Unexpected model stream chunk')
      hash.update(chunk)
    }
    expect(hash.digest('hex')).toBe(expectedHash)
    const child = spawn(executable!, [
      '-m', model!, '-c', '4096', '-ngl', '0', '-t', '4', '--parallel', '1',
      '--host', '127.0.0.1', '--port', '0', '--alias', 'dai-decision', '--jinja', '--reasoning', 'off', '--temp', '0',
    ], { env: { PATH: process.env.PATH ?? '' }, stdio: ['ignore', 'ignore', 'pipe'] })
    let diagnostic = ''
    let boundURL: string | undefined
    child.stderr.on('data', (chunk) => {
      diagnostic = (diagnostic + String(chunk)).slice(-4096)
      boundURL ??= /listening on (http:\/\/127\.0\.0\.1:[1-9][0-9]*)/.exec(diagnostic)?.[1]
    })
    const exit = new Promise<void>((resolve, reject) => {
      child.once('exit', () =>{  resolve() })
      child.once('error', reject)
    })
    // Attach a rejection observer before startup to keep spawn failures contained.
    void exit.catch(() => undefined)
    const root = await mkdtemp(join(tmpdir(), 'd-ai-live-local-'))
    const ctx = new Context()
    try {
      const deadline = AbortSignal.timeout(30000)
      while (boundURL === undefined) {
        deadline.throwIfAborted()
        if (child.exitCode !== null) throw new Error('Local server exited: ' + diagnostic)
        await delay(100)
      }
      const baseURL = boundURL
      while (true) {
        deadline.throwIfAborted()
        if (child.exitCode !== null) throw new Error('Local server exited: ' + diagnostic)
        try {
          const ready = await fetch(baseURL + '/health', { signal: AbortSignal.any([deadline, AbortSignal.timeout(1000)]) })
          if (ready.ok) break
          await ready.body?.cancel()
        } catch (_notReady) {
          // The server has not bound its port while model loading is in progress.
          deadline.throwIfAborted()
        }
        await delay(100)
      }
      await mountAgentLoopTestDependencies(ctx)
      await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
      await ctx.plugin(AgentLoop, { agents: [] })
      await ctx.plugin(Subagents)
      await ctx.plugin(Spawn, { providerName: 'spawn' })
      await ctx.plugin(Local, { provider: 'dai-local-decision', model: 'dai-decision', timeoutMs: 60000 })
      ctx.on('agent/assistant-stream', ({ agent, frame }) => {
        if (agent.session.header.parentSession !== undefined && frame.type === 'chunk'
          && frame.chunk.type === 'block-end' && frame.chunk.block.type === 'text') {
          console.info('LOCAL_RAW_ADVICE', frame.chunk.block.text)
        }
      })
      const profiles = resolveProfiles({ 'dai-local-decision': {
        api: 'openai-completions', baseURL: baseURL + '/v1',
        compat: { maxTokensField: 'max_tokens' },
        models: [{ id: 'dai-decision', contextWindow: 4096, maxTokens: 512 }],
      } })
      const localAdapter = new PiAiAdapter({
        profiles: () => profiles, resolveApiKey: async () => 'local-only', auth: memoryAuth(),
      })
      ctx.llm.registerAdapter(['dai-local-decision'], localAdapter)
      ctx.llm.registerAdapter(['parent-fixture'], new MockAdapter([
        toolCallResponse('local-advice', 'd_ai_local_advise', {
          objective: 'Check whether water boils at 100 degrees Celsius at standard atmospheric pressure.',
          situation: 'Source source:1 reports that water boils at 100 degrees Celsius at standard atmospheric pressure. This is a supplied but unverified observation. Independent corroboration is missing. The next step is to check the claim against independent evidence before accepting it.',
          evidence_refs: ['source:1'],
        }),
        textResponse('Unverified model recommendation retained.'),
      ]))
      const owner = await ctx.agentLoop.create(SessionId('live-owner'), { provider: 'parent-fixture', model: 'fixture' })
      owner.followup(createUserMessage({ content: [{ type: 'text', text: 'Request local advice.' }], source: { kind: 'user' } }))
      await owner.whenIdle()
      const event = owner.session.snapshotEvents().find(event => event.type === 'tool/result')
      if (event?.type !== 'tool/result') throw new Error('Decision tool did not settle')
      const text = event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
      expect(event.data.message.isError, text).toBe(false)
      const result = z.object({
        action: z.enum(['EXPLORE', 'VERIFY', 'ASK_HUMAN', 'WAIT', 'STOP', 'ESCALATE']),
        confidence: z.number().min(0).max(1), rationale: z.string(),
        evidence_refs: z.array(z.string()), advisory: z.literal(true), verified: z.literal(false),
        provider: z.string(), model: z.string(), agentId: z.string(),
      }).strict().parse(JSON.parse(text))
      expect(result).toMatchObject({ action: 'VERIFY', advisory: true, verified: false, model: 'dai-decision' })
      expect(result.evidence_refs.every((ref: string) => ref === 'source:1')).toBe(true)
      expect(result.confidence).toBeGreaterThanOrEqual(0.7)
      console.info('LOCAL_MODEL_ACCEPTANCE', JSON.stringify({ ...result, agentId: 'recorded-child', artifactSha256: expectedHash, device: 'CPU', contextWindow: 4096 }))
      await ctx.sessions.flush(owner.session)
    } finally {
      await ctx.fiber.dispose()
      if (child.exitCode === null) child.kill('SIGTERM')
      const force = setTimeout(() => child.kill('SIGKILL'), 5000)
      try { await exit } finally { clearTimeout(force) }
      await rm(root, { recursive: true, force: true })
    }
  }, 120000)
})
