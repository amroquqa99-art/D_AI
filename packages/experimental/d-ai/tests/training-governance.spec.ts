import { describe, expect, it } from 'vitest'
import { buildDatasetLineage, evaluateTrainingEligibility, type TrainingDataCandidate } from '../src/training-governance.ts'

function candidate(overrides: Partial<TrainingDataCandidate> = {}): TrainingDataCandidate {
  return {
    id: overrides.id ?? 'candidate-1',
    projectId: overrides.projectId ?? 'project-1',
    sourceType: overrides.sourceType ?? 'expert-correction',
    sensitivity: overrides.sensitivity ?? 'INTERNAL',
    explicitTrainingOptIn: overrides.explicitTrainingOptIn ?? true,
    ownershipAllowsTraining: overrides.ownershipAllowsTraining ?? true,
    licenseAllowsTraining: overrides.licenseAllowsTraining ?? true,
    containsSecret: overrides.containsSecret ?? false,
    containsPersonalData: overrides.containsPersonalData ?? false,
    personalDataRedacted: overrides.personalDataRedacted ?? true,
    qualityScore: overrides.qualityScore ?? 0.9,
    humanApproved: overrides.humanApproved ?? true,
  }
}

describe('Local Intelligence Core training governance', () => {
  it('accepts only explicitly eligible, high-quality governed data', () => {
    expect(evaluateTrainingEligibility(candidate())).toEqual({
      decision: 'ELIGIBLE',
      reasons: [],
      candidateId: 'candidate-1',
      policyVersion: 1,
    })
  })

  it('fails closed for missing consent, licensing, secrets, restricted data and raw personal data', () => {
    const result = evaluateTrainingEligibility(candidate({
      explicitTrainingOptIn: false,
      ownershipAllowsTraining: false,
      licenseAllowsTraining: false,
      containsSecret: true,
      sensitivity: 'RESTRICTED',
      containsPersonalData: true,
      personalDataRedacted: false,
      qualityScore: 0.2,
      humanApproved: false,
    }))

    expect(result.decision).toBe('REJECTED')
    expect(result.reasons).toEqual([
      'training-opt-in-missing',
      'ownership-does-not-allow-training',
      'license-does-not-allow-training',
      'contains-secret',
      'restricted-data',
      'personal-data-not-redacted',
      'quality-below-threshold',
      'human-approval-missing',
    ])
  })

  it('requires separate training and holdout lineage', () => {
    const lineage = buildDatasetLineage(
      'dataset-1',
      1,
      [candidate({ id: 'train-1' })],
      [candidate({ id: 'holdout-1', sourceType: 'evaluation' })],
    )

    expect(lineage.candidateIds).toEqual(['train-1'])
    expect(lineage.holdoutCandidateIds).toEqual(['holdout-1'])
  })

  it('rejects ineligible or duplicated dataset candidates', () => {
    expect(() => buildDatasetLineage(
      'dataset-1',
      1,
      [candidate({ id: 'bad', containsSecret: true })],
      [candidate({ id: 'holdout' })],
    )).toThrow('not training-eligible')

    expect(() => buildDatasetLineage(
      'dataset-1',
      1,
      [candidate({ id: 'same' })],
      [candidate({ id: 'same' })],
    )).toThrow('unique')
  })
})
