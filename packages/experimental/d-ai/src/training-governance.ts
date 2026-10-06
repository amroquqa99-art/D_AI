/** Governance primitives for data that may become Local Intelligence Core training material. */

export type DataSensitivity = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED'
export type EligibilityDecision = 'ELIGIBLE' | 'REJECTED'

export interface TrainingDataCandidate {
  readonly id: string
  readonly projectId: string
  readonly sourceType: 'mission' | 'tool-trace' | 'expert-correction' | 'evaluation' | 'artifact' | 'conversation'
  readonly sensitivity: DataSensitivity
  readonly explicitTrainingOptIn: boolean
  readonly ownershipAllowsTraining: boolean
  readonly licenseAllowsTraining: boolean
  readonly containsSecret: boolean
  readonly containsPersonalData: boolean
  readonly personalDataRedacted: boolean
  readonly qualityScore: number
  readonly humanApproved: boolean
}

export interface EligibilityResult {
  readonly decision: EligibilityDecision
  readonly reasons: readonly string[]
  readonly candidateId: string
  readonly policyVersion: 1
}

const QUALITY_FLOOR = 0.7

function validScore(score: number): void {
  if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error('qualityScore must be between 0 and 1')
}

/**
 * Fail-closed training eligibility. Usage data is never assumed trainable.
 * A future policy service may add organization-specific rules, but may not
 * silently weaken source ownership, license, secret or explicit opt-in checks.
 */
export function evaluateTrainingEligibility(candidate: TrainingDataCandidate): EligibilityResult {
  validScore(candidate.qualityScore)
  const reasons: string[] = []

  if (!candidate.explicitTrainingOptIn) reasons.push('training-opt-in-missing')
  if (!candidate.ownershipAllowsTraining) reasons.push('ownership-does-not-allow-training')
  if (!candidate.licenseAllowsTraining) reasons.push('license-does-not-allow-training')
  if (candidate.containsSecret) reasons.push('contains-secret')
  if (candidate.sensitivity === 'RESTRICTED') reasons.push('restricted-data')
  if (candidate.containsPersonalData && !candidate.personalDataRedacted) reasons.push('personal-data-not-redacted')
  if (candidate.qualityScore < QUALITY_FLOOR) reasons.push('quality-below-threshold')
  if (!candidate.humanApproved) reasons.push('human-approval-missing')

  return Object.freeze({
    decision: reasons.length === 0 ? 'ELIGIBLE' : 'REJECTED',
    reasons: Object.freeze(reasons),
    candidateId: candidate.id,
    policyVersion: 1,
  })
}

export interface DatasetLineage {
  readonly datasetId: string
  readonly version: number
  readonly candidateIds: readonly string[]
  readonly holdoutCandidateIds: readonly string[]
  readonly policyVersion: 1
}

/** Build immutable lineage only from candidates that independently passed policy. */
export function buildDatasetLineage(
  datasetId: string,
  version: number,
  accepted: readonly TrainingDataCandidate[],
  holdout: readonly TrainingDataCandidate[],
): DatasetLineage {
  if (datasetId.trim().length === 0) throw new Error('datasetId is required')
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('dataset version must be a positive safe integer')

  const all = [...accepted, ...holdout]
  const ids = all.map(item => item.id)
  if (new Set(ids).size !== ids.length) throw new Error('dataset candidates must be unique across training and holdout')

  for (const candidate of all) {
    const result = evaluateTrainingEligibility(candidate)
    if (result.decision !== 'ELIGIBLE') throw new Error(`candidate ${candidate.id} is not training-eligible: ${result.reasons.join(',')}`)
  }

  if (accepted.length === 0) throw new Error('dataset requires at least one training candidate')
  if (holdout.length === 0) throw new Error('dataset requires an independent holdout candidate')

  return Object.freeze({
    datasetId,
    version,
    candidateIds: Object.freeze(accepted.map(item => item.id)),
    holdoutCandidateIds: Object.freeze(holdout.map(item => item.id)),
    policyVersion: 1,
  })
}
