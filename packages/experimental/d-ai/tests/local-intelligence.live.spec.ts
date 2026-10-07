/** Opt-in real GGUF inference; the parent only supplies a deterministic tool call. */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, type TokenUsage } from '@deepseek-ai/dsh-llm'
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
import { advicePersona } from '../src/local-advice-contract.ts'
import { datasetSha256, decisionCases, decisionEvaluationConfig, evaluationConfigSha256, gradeDecisionRow, outcomeSchema, receiptSchema } from './helpers/local-decision-evaluation.ts'

const executable = process.env.D_AI_LLAMA_SERVER
const model = process.env.D_AI_GGUF
const expectedHash = process.env.D_AI_GGUF_SHA256
const receiptPath = process.env.D_AI_EVAL_RECEIPT
const contextSetting = process.env.D_AI_EVAL_INCLUDE_EXECUTION_CONTEXT
if (contextSetting !== undefined && contextSetting !== 'true' && contextSetting !== 'false') {
  throw new Error('D_AI_EVAL_INCLUDE_EXECUTION_CONTEXT must be true or false')
}
const includeExecutionContext = contextSetting === 'true'

describe.skipIf(!executable || !model || !expectedHash)('D_AI real local decision inference', () => {
  it('runs a hash-verified local model through the native pi-ai adapter and decision tool', async () => {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(model!)) {
      if (!Buffer.isBuffer(chunk)) throw new Error('Unexpected model stream chunk')
      hash.update(chunk)
    }
    expect(hash.digest('hex')).toBe(expectedHash)
    const root = await mkdtemp(join(tmpdir(), 'd-ai-live-local-'))
    const ctx = new Context()
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
    let startupFailure: unknown
    void exit.catch((error: unknown) => { startupFailure = error })
    try {
      const deadline = AbortSignal.timeout(30000)
      while (boundURL === undefined) {
        deadline.throwIfAborted()
        if (startupFailure !== undefined) throw startupFailure
        if (child.exitCode !== null) throw new Error('Local server exited: ' + diagnostic)
        await delay(100)
      }
      const baseURL = boundURL
      while (true) {
        deadline.throwIfAborted()
        if (startupFailure !== undefined) throw startupFailure
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
      await ctx.plugin(Local, decisionEvaluationConfig(includeExecutionContext))
      let rawOutput = ''
      let modelRequests = 0
      let modelInput = ''
      let requestContextBytes = 0
      let usage: TokenUsage | undefined
      let finishReason: { kind: string; failureCode?: string; failureMessage?: string } | undefined
      ctx.on('llm/stream', (options, next) => {
        if (options.provider === 'dai-local-decision') {
          modelRequests++
          modelInput = JSON.stringify({ messages: options.messages.map(message => ({ role: message.role, content: message.content })),
            tools: options.tools ?? [], maxTokens: options.maxTokens })
          requestContextBytes = Buffer.byteLength(JSON.stringify({ messages: options.messages, tools: options.tools ?? [] }), 'utf8')
        }
        return next()
      })
      ctx.on('agent/assistant-stream', ({ agent, frame }) => {
        if (agent.session.header.parentSession !== undefined && frame.type === 'chunk' && frame.chunk.type === 'usage') {
          usage = frame.chunk.usage
        }
        if (agent.session.header.parentSession !== undefined && frame.type === 'chunk' && frame.chunk.type === 'finish') {
          const reason = frame.chunk.reason
          finishReason = { kind: reason.kind, ...('failure' in reason ? {
            failureCode: reason.failure.code, failureMessage: reason.failure.message.slice(0, 1024),
          } : {}) }
        }
        if (agent.session.header.parentSession !== undefined && frame.type === 'chunk'
          && frame.chunk.type === 'block-end' && frame.chunk.block.type === 'text') {
          rawOutput += frame.chunk.block.text
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
      if (receiptPath !== undefined) {
        const outcomes = []
        for (const { vars } of decisionCases) {
          // Expected actions and locale labels stay outside model input.
          const input = { objective: vars.objective, situation: vars.situation, evidence_refs: vars.evidence_refs }
          const provider = 'parent-' + vars.caseId
          ctx.llm.registerAdapter([provider], new MockAdapter([
            toolCallResponse('advice-' + vars.caseId, 'd_ai_local_advise', input),
            textResponse('Recommendation retained as unverified advice.'),
          ]))
          rawOutput = ''
          usage = undefined
          finishReason = undefined
          modelRequests = 0
          modelInput = ''
          requestContextBytes = 0
          const started = performance.now()
          const caseOwner = await ctx.agentLoop.create(SessionId('evaluation-' + vars.caseId), { provider, model: 'fixture' })
          caseOwner.followup(createUserMessage({ content: [{ type: 'text', text: 'Request local advice.' }], source: { kind: 'user' } }))
          await caseOwner.whenIdle()
          const event = caseOwner.session.snapshotEvents().find(event => event.type === 'tool/result')
          if (event?.type !== 'tool/result') throw new Error('Decision case did not settle: ' + vars.caseId)
          const row = outcomeSchema.parse({
            caseId: vars.caseId, rawOutput: rawOutput.trim(),
            toolOutput: event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join(''),
            toolIsError: event.data.message.isError ?? false, elapsedMs: performance.now() - started, modelRequests,
            ...(usage === undefined ? {} : { usage }),
            ...(finishReason === undefined ? {} : { finishReason }),
          })
          outcomes.push({ ...row, modelInput, requestContextBytes,
            requestSha256: createHash('sha256').update(modelInput).digest('hex') })
          console.info('LOCAL_DECISION_CASE', JSON.stringify({ ...gradeDecisionRow(row, vars), response: gradeDecisionRow(row, vars).response?.action }))
          await ctx.sessions.flush(caseOwner.session)
        }
        let peakServerRssKiB: number | undefined
        if (process.platform === 'linux' && child.pid !== undefined) {
          const status = await readFile('/proc/' + String(child.pid) + '/status', 'utf8').catch((error: unknown) => {
            // Optional OS counters are unavailable in some sandbox/PID namespaces.
            if (error instanceof Error && 'code' in error && ['ENOENT', 'EACCES', 'EPERM'].includes(String(error.code))) return ''
            throw error
          })
          const match = /^VmHWM:\s+(\d+) kB$/m.exec(status)
          if (match) peakServerRssKiB = Number(match[1])
        }
        const receipt = receiptSchema.parse({
          schemaVersion: 2, split: 'development', completedAt: new Date().toISOString(),
          includeExecutionContext, evaluationConfigSha256: evaluationConfigSha256(includeExecutionContext),
          datasetSha256, promptSha256: createHash('sha256').update(advicePersona).digest('hex'),
          modelSha256: expectedHash, serverSha256: createHash('sha256').update(await readFile(executable!)).digest('hex'),
          device: 'CPU', contextWindow: 4096, threads: 4, outcomes,
          ...(peakServerRssKiB === undefined ? {} : { peakServerRssKiB }),
        })
        await mkdir(dirname(receiptPath), { recursive: true })
        // Refuse to overwrite a prior experiment, including after a failed rerun.
        await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' })
      }
    } finally {
      try { await ctx.fiber.dispose() } finally {
        if (child.exitCode === null) child.kill('SIGTERM')
        const force = setTimeout(() => child.kill('SIGKILL'), 5000)
        try { await exit } finally {
          clearTimeout(force)
          await rm(root, { recursive: true, force: true })
        }
      }
    }
  }, receiptPath === undefined ? 120000 : 1200000)
})
