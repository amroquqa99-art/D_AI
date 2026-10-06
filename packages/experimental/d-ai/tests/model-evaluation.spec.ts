import { describe, expect, it } from 'vitest'
import { createModelReleasePointer, evaluateModelPromotion, type ModelEvaluationResult } from '../src/model-evaluation.ts'

function evaluation(modelId: string, overrides: Partial<ModelEvaluationResult> = {}): ModelEvaluationResult {
  return {
    modelId,
    datasetId: overrides.datasetId ?? 'eval-v1',
    holdoutId: overrides.holdoutId ?? 'holdout-v1',
    independentEvaluator: overrides.independentEvaluator ?? `judge-${modelId}`,
    completedAt: overrides.completedAt ?? '2026-10-06T00:00:00Z',
    metrics: overrides.metrics ?? {
      correctness: 0.85,
      domainQuality: 0.85,
      toolUseReliability: 0.85,
      robustness: 0.85,
      safety: 0.95,
      latencyScore: 0.7,
      efficiencyScore: 0.7,
    },
  }
}

const policy = {
  minCorrectness: 0.8,
  minDomainQuality: 0.8,
  minToolUseReliability: 0.8,
  minRobustness: 0.8,
  minSafety: 0.9,
  maxAllowedRegression: 0.03,
  requireDistinctEvaluator: true,
}

describe('Local Intelligence Core model promotion', () => {
  it('promotes a candidate that passes absolute and regression gates', () => {
    const baseline = evaluation('baseline')
    const candidate = evaluation('candidate', {
      metrics: {
        correctness: 0.88,
        domainQuality: 0.9,
        toolUseReliability: 0.87,
        robustness: 0.86,
        safety: 0.96,
        latencyScore: 0.72,
        efficiencyScore: 0.75,
      },
    })
    const decision = evaluateModelPromotion(baseline, candidate, policy)
    expect(decision.promote).toBe(true)

    expect(createModelReleasePointer(baseline, candidate, decision, '2026-10-06T01:00:00Z')).toEqual({
      activeModelId: 'candidate',
      rollbackModelId: 'baseline',
      promotedAt: '2026-10-06T01:00:00Z',
      evaluationDatasetId: 'eval-v1',
    })
  })

  it('blocks unsafe or materially regressed candidates', () => {
    const baseline = evaluation('baseline')
    const candidate = evaluation('candidate', {
      metrics: {
        correctness: 0.75,
        domainQuality: 0.84,
        toolUseReliability: 0.7,
        robustness: 0.84,
        safety: 0.7,
        latencyScore: 0.9,
        efficiencyScore: 0.9,
      },
    })
    const decision = evaluateModelPromotion(baseline, candidate, policy)
    expect(decision.promote).toBe(false)
    expect(decision.reasons).toContain('safety-below-threshold')
    expect(decision.reasons).toContain('correctness-regression')
    expect(decision.reasons).toContain('toolUseReliability-regression')
  })

  it('requires matched holdouts and independent evaluation when configured', () => {
    expect(() => evaluateModelPromotion(
      evaluation('baseline'),
      evaluation('candidate', { holdoutId: 'other' }),
      policy,
    )).toThrow('same evaluation and holdout')

    const baseline = evaluation('baseline', { independentEvaluator: 'same' })
    const candidate = evaluation('candidate', { independentEvaluator: 'same' })
    expect(evaluateModelPromotion(baseline, candidate, policy).reasons).toContain('independent-evaluator-required')
  })
})
