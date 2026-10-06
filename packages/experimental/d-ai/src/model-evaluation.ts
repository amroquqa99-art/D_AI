/** Local Intelligence Core evaluation and promotion gates. */

export interface ModelEvaluationMetrics {
  readonly correctness: number
  readonly domainQuality: number
  readonly toolUseReliability: number
  readonly robustness: number
  readonly safety: number
  readonly latencyScore: number
  readonly efficiencyScore: number
}

export interface ModelEvaluationResult {
  readonly modelId: string
  readonly datasetId: string
  readonly holdoutId: string
  readonly metrics: ModelEvaluationMetrics
  readonly completedAt: string
  readonly independentEvaluator: string
}

export interface PromotionPolicy {
  readonly minCorrectness: number
  readonly minDomainQuality: number
  readonly minToolUseReliability: number
  readonly minRobustness: number
  readonly minSafety: number
  readonly maxAllowedRegression: number
  readonly requireDistinctEvaluator: boolean
}

export interface ModelPromotionDecision {
  readonly promote: boolean
  readonly reasons: readonly string[]
  readonly candidateModelId: string
  readonly baselineModelId: string
}

function unit(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be between 0 and 1`)
}

function validateMetrics(metrics: ModelEvaluationMetrics): void {
  for (const [name, value] of Object.entries(metrics)) unit(name, value)
}

function validateEvaluation(result: ModelEvaluationResult): void {
  if (result.modelId.trim().length === 0 || result.datasetId.trim().length === 0 || result.holdoutId.trim().length === 0) {
    throw new Error('evaluation identities are required')
  }
  if (result.independentEvaluator.trim().length === 0) throw new Error('independent evaluator is required')
  if (!Number.isFinite(Date.parse(result.completedAt))) throw new Error('completedAt must be an ISO timestamp')
  validateMetrics(result.metrics)
}

/**
 * Decide whether a candidate may replace a baseline. Promotion is fail-closed:
 * absolute thresholds and bounded regression both apply. The caller is
 * responsible for persisting model artifacts and rollback pointers.
 */
export function evaluateModelPromotion(
  baseline: ModelEvaluationResult,
  candidate: ModelEvaluationResult,
  policy: PromotionPolicy,
): ModelPromotionDecision {
  validateEvaluation(baseline)
  validateEvaluation(candidate)
  for (const [name, value] of Object.entries(policy)) {
    if (name === 'requireDistinctEvaluator') continue
    unit(name, value as number)
  }
  if (baseline.datasetId !== candidate.datasetId || baseline.holdoutId !== candidate.holdoutId) {
    throw new Error('baseline and candidate must use the same evaluation and holdout sets')
  }

  const reasons: string[] = []
  const c = candidate.metrics
  if (c.correctness < policy.minCorrectness) reasons.push('correctness-below-threshold')
  if (c.domainQuality < policy.minDomainQuality) reasons.push('domain-quality-below-threshold')
  if (c.toolUseReliability < policy.minToolUseReliability) reasons.push('tool-use-below-threshold')
  if (c.robustness < policy.minRobustness) reasons.push('robustness-below-threshold')
  if (c.safety < policy.minSafety) reasons.push('safety-below-threshold')

  const guarded: Array<keyof ModelEvaluationMetrics> = [
    'correctness', 'domainQuality', 'toolUseReliability', 'robustness', 'safety',
  ]
  for (const metric of guarded) {
    if (baseline.metrics[metric] - candidate.metrics[metric] > policy.maxAllowedRegression) {
      reasons.push(`${metric}-regression`)
    }
  }

  if (policy.requireDistinctEvaluator && baseline.independentEvaluator === candidate.independentEvaluator) {
    reasons.push('independent-evaluator-required')
  }

  return Object.freeze({
    promote: reasons.length === 0,
    reasons: Object.freeze(reasons),
    candidateModelId: candidate.modelId,
    baselineModelId: baseline.modelId,
  })
}

export interface ModelReleasePointer {
  readonly activeModelId: string
  readonly rollbackModelId: string
  readonly promotedAt: string
  readonly evaluationDatasetId: string
}

export function createModelReleasePointer(
  baseline: ModelEvaluationResult,
  candidate: ModelEvaluationResult,
  decision: ModelPromotionDecision,
  promotedAt: string,
): ModelReleasePointer {
  if (!decision.promote || decision.candidateModelId !== candidate.modelId || decision.baselineModelId !== baseline.modelId) {
    throw new Error('model release requires a matching successful promotion decision')
  }
  if (!Number.isFinite(Date.parse(promotedAt))) throw new Error('promotedAt must be an ISO timestamp')
  return Object.freeze({
    activeModelId: candidate.modelId,
    rollbackModelId: baseline.modelId,
    promotedAt,
    evaluationDatasetId: candidate.datasetId,
  })
}
