/** Failed native responses must not become passing replay or promotion evidence. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { datasetSha256, decisionCases, gradeDecisionRow, outcomeSchema, promptSha256 } from './helpers/local-decision-evaluation.ts'
import NativeDecisionReplay from './helpers/promptfoo-replay.ts'

const vars = decisionCases[0]!.vars
const advice = { action: 'EXPLORE', confidence: 0.8, rationale: 'Collect available approved sources.', evidence_refs: [] }
const toolAdvice = { ...advice, advisory: true, verified: false, provider: 'local', model: 'fixture', agentId: 'child' }
const row = outcomeSchema.parse({
  caseId: vars.caseId, rawOutput: JSON.stringify(advice), toolOutput: JSON.stringify(toolAdvice),
  toolIsError: false, elapsedMs: 100, modelRequests: 1,
})

describe('native decision grading', () => {
  it('keeps acceptance separate from expected-action correctness and unreported usage', () => {
    expect(gradeDecisionRow(row, vars)).toMatchObject({ contractAccepted: true, nativeAdviceElapsedMs: 100 })
    expect(gradeDecisionRow(row, vars)).not.toHaveProperty('usage')
    const low = { ...advice, confidence: 0.2 }
    const lowRow = { ...row, rawOutput: JSON.stringify(low), toolOutput: JSON.stringify({ ...toolAdvice, ...low }) }
    expect(gradeDecisionRow(lowRow, vars).contractAccepted).toBe(false)
    const wrong = { ...advice, action: 'WAIT' }
    const wrongRow = { ...row, rawOutput: JSON.stringify(wrong), toolOutput: JSON.stringify({ ...toolAdvice, ...wrong }) }
    const grade = gradeDecisionRow(wrongRow, vars)
    expect(grade.contractAccepted).toBe(true)
    expect(vars.expectedActions).not.toContain(grade.response!.action)
  })

  it.each([
    { rawOutput: 'not JSON' },
    { toolIsError: true },
    { modelRequests: 2 },
    { caseId: 'another-case' },
    { rawOutput: JSON.stringify({ ...advice, evidence_refs: ['invented'] }) },
    { rawOutput: JSON.stringify({ ...advice, complete: true }) },
    { toolOutput: JSON.stringify({ ...toolAdvice, verified: true }) },
    { toolOutput: JSON.stringify({ ...toolAdvice, rationale: 'Native rejection' }) },
    { toolOutput: JSON.stringify({ ...toolAdvice, action: 'ESCALATE', confidence: 0 }) },
  ])('rejects invalid acceptance evidence: %j', (patch) => {
    expect(gradeDecisionRow({ ...row, ...patch }, vars).contractAccepted).toBe(false)
  })

  it('replays each recorded case and rejects stale or incomplete receipts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'd-ai-replay-'))
    const path = join(root, 'receipt.json')
    const receipt = {
      schemaVersion: 1, split: 'development', completedAt: new Date().toISOString(), datasetSha256, promptSha256,
      modelSha256: 'a'.repeat(64), serverSha256: 'b'.repeat(64), device: 'CPU', contextWindow: 4096, threads: 4,
      outcomes: decisionCases.map(test => ({ ...row, caseId: test.vars.caseId })),
    }
    try {
      await writeFile(path, JSON.stringify(receipt))
      const provider = new NativeDecisionReplay({}, path)
      const replay = await provider.callApi('ignored', { vars: { caseId: vars.caseId } })
      expect(JSON.parse(replay.output!)).toMatchObject({ caseId: vars.caseId, contractAccepted: true })
      expect(replay.metadata?.nativeAdviceElapsedMs).toBe(100)
      expect(await provider.callApi('ignored', { vars: { caseId: 'unknown' } })).toHaveProperty('error')
      for (const patch of [
        { datasetSha256: 'c'.repeat(64) }, { promptSha256: 'c'.repeat(64) },
        { outcomes: receipt.outcomes.slice(1) },
        { outcomes: [...receipt.outcomes.slice(1), receipt.outcomes[1]] },
        { outcomes: [{ ...row, caseId: 'unknown' }, ...receipt.outcomes.slice(1)] },
        { outcomes: [{ ...row, modelRequests: -1 }, ...receipt.outcomes.slice(1)] },
      ]) {
        await writeFile(path, JSON.stringify({ ...receipt, ...patch }))
        expect(() => new NativeDecisionReplay({}, path)).toThrow()
      }
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
