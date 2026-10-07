/** Development-case receipts, not model-promotion evidence or a semantic judge. */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { adviceInputSchema, adviceOutputSchema, advicePersona } from '../../src/local-advice-contract.ts'
import type { Config as LocalConfig } from '../../src/local-intelligence.ts'

/** Fixed native fixture threshold, passed explicitly to its adviser plugin. */
export const evaluationMinConfidence = 0.7

/** Explicit fixed experiment settings; only executor-context admission varies.
 * @param includeExecutionContext - whether the baseline executor snapshot enters advice.
 * @returns the exact configuration supplied to the native adviser.
 */
export function decisionEvaluationConfig(includeExecutionContext: boolean): LocalConfig {
  return {
    provider: 'dai-local-decision', model: 'dai-decision', subagentProvider: 'spawn',
    timeoutMs: 60000, maxOutputTokens: 512, maxInputBytes: 4096, maxResultBytes: 8192,
    minConfidence: evaluationMinConfidence, maxConcurrentCalls: 1, rootTools: [], includeExecutionContext,
  }
}

/** Hash the fixed settings separately from the unchanged adviser instruction.
 * @param includeExecutionContext - the experiment's admitted context policy.
 * @returns a SHA-256 digest of the canonical experiment configuration.
 */
export function evaluationConfigSha256(includeExecutionContext: boolean): string {
  return createHash('sha256').update(JSON.stringify(decisionEvaluationConfig(includeExecutionContext))).digest('hex')
}

export const caseFile = new URL('../fixtures/local-decision-cases.json', import.meta.url)
export const caseSchema = z.object({
  description: z.string(),
  vars: adviceInputSchema.extend({
    caseId: z.string().min(1), locale: z.enum(['ar', 'en']),
    expectedActions: z.array(adviceOutputSchema.shape.action).nonempty(),
  }),
}).strict()
const caseBytes = readFileSync(caseFile)
export const datasetSha256 = createHash('sha256').update(caseBytes).digest('hex')
export const decisionCases = z.array(caseSchema).nonempty().parse(JSON.parse(caseBytes.toString('utf8')))

export const outcomeSchema = z.object({
  caseId: z.string().min(1), rawOutput: z.string().max(8192),
  toolOutput: z.string().max(8192), toolIsError: z.boolean(),
  elapsedMs: z.number().nonnegative(),
  modelRequests: z.number().int().nonnegative(),
  finishReason: z.object({ kind: z.string().min(1).max(64), failureCode: z.string().max(256).optional(),
    failureMessage: z.string().max(1024).optional() }).strict().optional(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative().optional(),
    cacheReadTokens: z.number().int().nonnegative().optional(), cacheWriteTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
  }).strict().optional(),
}).strict()

export const promptSha256 = createHash('sha256').update(advicePersona).digest('hex')

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const legacyReceiptSchema = z.object({
  schemaVersion: z.literal(1), split: z.literal('development'),
  completedAt: z.iso.datetime(), datasetSha256: hash, promptSha256: hash,
  modelSha256: hash, serverSha256: hash,
  device: z.literal('CPU'), contextWindow: z.literal(4096), threads: z.literal(4),
  peakServerRssKiB: z.number().int().positive().optional(),
  outcomes: z.array(outcomeSchema).nonempty().max(128),
}).strict()

const currentOutcomeSchema = outcomeSchema.extend({
  modelInput: z.string().max(8192), requestSha256: hash,
  requestContextBytes: z.number().int().nonnegative(),
}).strict().refine(row => row.modelRequests === 0
  ? row.modelInput === '' && row.requestContextBytes === 0
  : row.modelInput.length > 0 && row.requestContextBytes > 0,
{ message: 'Request metadata must distinguish observed requests from failures before inference' })

export const receiptSchema = z.discriminatedUnion('schemaVersion', [
  legacyReceiptSchema,
  legacyReceiptSchema.extend({
    schemaVersion: z.literal(2), includeExecutionContext: z.boolean(), evaluationConfigSha256: hash,
    outcomes: z.array(currentOutcomeSchema).nonempty().max(128),
  }).strict(),
])

const toolAdviceSchema = adviceOutputSchema.extend({
  advisory: z.literal(true), verified: z.literal(false),
  provider: z.string().min(1), model: z.string().min(1), agentId: z.string().min(1),
}).strict()

function readJson(text: string): unknown {
  try { return JSON.parse(text) } catch (_invalidJSON) { return null /* Recorded failures must grade as failures. */ }
}

/** Validate native acceptance independently of the expected next-action label. */
export function gradeDecisionRow(row: z.infer<typeof outcomeSchema>, vars: z.infer<typeof caseSchema>['vars']) {
  const raw = adviceOutputSchema.safeParse(readJson(row.rawOutput))
  const tool = toolAdviceSchema.safeParse(readJson(row.toolOutput))
  const contractAccepted = row.caseId === vars.caseId && !row.toolIsError && row.modelRequests === 1 && raw.success && tool.success
    && raw.data.confidence >= evaluationMinConfidence
    && raw.data.evidence_refs.every(ref => vars.evidence_refs.includes(ref))
    && raw.data.action === tool.data.action && raw.data.confidence === tool.data.confidence
    && raw.data.rationale === tool.data.rationale
    && JSON.stringify(raw.data.evidence_refs) === JSON.stringify(tool.data.evidence_refs)
  return {
    caseId: row.caseId, contractAccepted,
    response: tool.success ? tool.data : null,
    nativeAdviceElapsedMs: row.elapsedMs,
    // Absence means the provider did not expose counters, never zero usage.
    ...(row.usage === undefined ? {} : { usage: row.usage }),
  }
}

/** Reject stale, partial or duplicate recordings before any case is graded. */
export function readDecisionReceipt(path: string) {
  const bytes = readFileSync(path)
  if (bytes.length > 1024 * 1024) throw new Error('Decision receipt exceeds 1 MiB')
  const receipt = receiptSchema.parse(JSON.parse(bytes.toString('utf8')))
  if (receipt.datasetSha256 !== datasetSha256 || receipt.promptSha256 !== promptSha256) {
    throw new Error('Decision receipt belongs to a different dataset or adviser prompt')
  }
  if (receipt.schemaVersion === 2) {
    if (receipt.evaluationConfigSha256 !== evaluationConfigSha256(receipt.includeExecutionContext)
      || receipt.outcomes.some(row => createHash('sha256').update(row.modelInput).digest('hex') !== row.requestSha256)) {
      throw new Error('Decision receipt configuration or recorded model-input hash does not match')
    }
  }
  const expectedIds = new Set(decisionCases.map(test => test.vars.caseId))
  const recordedIds = new Set(receipt.outcomes.map(row => row.caseId))
  if (expectedIds.size !== decisionCases.length || recordedIds.size !== receipt.outcomes.length
    || expectedIds.size !== recordedIds.size || [...recordedIds].some(id => !expectedIds.has(id))) {
    throw new Error('Decision receipt must contain each development case exactly once')
  }
  return receipt
}
