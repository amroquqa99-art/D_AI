/** Durable governed training-data metadata and dataset lineage for the Local Intelligence Core. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import {
  buildDatasetLineage,
  evaluateTrainingEligibility,
  type TrainingDataCandidate,
} from './training-governance.ts'

const identity = z.string().min(1).max(240)
const sourceType = z.enum(['mission', 'tool-trace', 'expert-correction', 'evaluation', 'artifact', 'conversation'])
const sensitivity = z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'])

export const trainingCandidateSchema = z.object({
  id: identity,
  projectId: identity,
  sourceType,
  sensitivity,
  explicitTrainingOptIn: z.boolean(),
  ownershipAllowsTraining: z.boolean(),
  licenseAllowsTraining: z.boolean(),
  containsSecret: z.boolean(),
  containsPersonalData: z.boolean(),
  personalDataRedacted: z.boolean(),
  qualityScore: z.number().min(0).max(1),
  humanApproved: z.boolean(),
}).strict()

export const eligibilityResultSchema = z.object({
  decision: z.enum(['ELIGIBLE', 'REJECTED']),
  reasons: z.array(z.string()),
  candidateId: identity,
  policyVersion: z.literal(1),
}).strict()

export const governedTrainingCandidateSchema = z.object({
  candidate: trainingCandidateSchema,
  artifactRef: z.string().min(1).max(4000),
  registeredAt: z.string().datetime(),
  registeredBy: identity,
  eligibility: eligibilityResultSchema,
}).strict()

export const datasetLineageSchema = z.object({
  datasetId: identity,
  version: z.number().int().positive(),
  candidateIds: z.array(identity),
  holdoutCandidateIds: z.array(identity),
  policyVersion: z.literal(1),
}).strict()

export const governedDatasetSchema = z.object({
  lineage: datasetLineageSchema,
  createdAt: z.string().datetime(),
  createdBy: identity,
}).strict()

export const trainingLedgerSchema = z.object({
  ownerAgentId: identity,
  revision: z.number().int().nonnegative(),
  candidates: z.array(governedTrainingCandidateSchema),
  datasets: z.array(governedDatasetSchema),
}).strict()

export type GovernedTrainingCandidate = z.infer<typeof governedTrainingCandidateSchema>
export type GovernedDataset = z.infer<typeof governedDatasetSchema>
export type TrainingLedger = z.infer<typeof trainingLedgerSchema>

export const trainingFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum(['REGISTER_CANDIDATE', 'BUILD_DATASET']),
  actorId: identity,
  ledger: trainingLedgerSchema,
}).strict()

export type TrainingFact = z.infer<typeof trainingFactSchema>
export interface TrainingState {
  readonly ledgers: readonly TrainingLedger[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change Local Intelligence Core training-governance fact retaining metadata eligibility decisions and dataset lineage without embedding raw training content. */
    'd_ai/training-fact': TrainingFact
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiTraining: TrainingState }
  interface SessionProjectionMap { daiTraining: TrainingState }
}

const stateSchema: z.ZodType<TrainingState> = z.object({
  ledgers: z.array(trainingLedgerSchema),
  failure: z.string().optional(),
}).strict()

function validateCandidate(item: GovernedTrainingCandidate): void {
  const expected = evaluateTrainingEligibility(item.candidate as TrainingDataCandidate)
  if (JSON.stringify(expected) !== JSON.stringify(item.eligibility)) throw new Error('stored training eligibility does not match policy evaluation')
}

function validateDataset(ledger: TrainingLedger, dataset: GovernedDataset): void {
  const training = dataset.lineage.candidateIds.map((id) => {
    const item = ledger.candidates.find(candidate => candidate.candidate.id === id)
    if (item === undefined) throw new Error('dataset references unknown training candidate: ' + id)
    return item.candidate as TrainingDataCandidate
  })
  const holdout = dataset.lineage.holdoutCandidateIds.map((id) => {
    const item = ledger.candidates.find(candidate => candidate.candidate.id === id)
    if (item === undefined) throw new Error('dataset references unknown holdout candidate: ' + id)
    return item.candidate as TrainingDataCandidate
  })
  const expected = buildDatasetLineage(dataset.lineage.datasetId, dataset.lineage.version, training, holdout)
  if (JSON.stringify(expected) !== JSON.stringify(dataset.lineage)) throw new Error('stored dataset lineage does not match governed candidates')
}

export function projectTrainingFact(state: TrainingState, event: SessionEvent): TrainingState {
  if (state.failure !== undefined || event.type !== 'd_ai/training-fact') return state
  try {
    const fact = trainingFactSchema.parse(event.data)
    if (fact.actorId !== fact.ledger.ownerAgentId) throw new Error('training fact actor does not own ledger')
    if (new Set(fact.ledger.candidates.map(item => item.candidate.id)).size !== fact.ledger.candidates.length) throw new Error('duplicate training candidate identity')
    const datasetKeys = fact.ledger.datasets.map(item => item.lineage.datasetId + ':' + item.lineage.version)
    if (new Set(datasetKeys).size !== datasetKeys.length) throw new Error('duplicate training dataset version')
    for (const candidate of fact.ledger.candidates) validateCandidate(candidate)
    for (const dataset of fact.ledger.datasets) validateDataset(fact.ledger, dataset)

    const prior = state.ledgers.find(item => item.ownerAgentId === fact.ledger.ownerAgentId)
    if ((prior?.revision ?? 0) + 1 !== fact.ledger.revision) throw new Error('training ledger revision is not contiguous')

    if (prior !== undefined) {
      if (JSON.stringify(fact.ledger.candidates.slice(0, prior.candidates.length)) !== JSON.stringify(prior.candidates)) {
        throw new Error('prior training candidates changed or disappeared')
      }
      if (JSON.stringify(fact.ledger.datasets.slice(0, prior.datasets.length)) !== JSON.stringify(prior.datasets)) {
        throw new Error('prior training datasets changed or disappeared')
      }
      if (fact.operation === 'REGISTER_CANDIDATE') {
        if (fact.ledger.candidates.length !== prior.candidates.length + 1 || fact.ledger.datasets.length !== prior.datasets.length) {
          throw new Error('REGISTER_CANDIDATE must append exactly one candidate')
        }
      } else if (fact.ledger.candidates.length !== prior.candidates.length || fact.ledger.datasets.length !== prior.datasets.length + 1) {
        throw new Error('BUILD_DATASET must append exactly one dataset')
      }
    } else {
      if (fact.ledger.revision !== 1) throw new Error('training ledger must begin at revision 1')
      if (fact.operation !== 'REGISTER_CANDIDATE' || fact.ledger.candidates.length !== 1 || fact.ledger.datasets.length !== 0) {
        throw new Error('training ledger must begin with exactly one candidate registration')
      }
    }

    return {
      ledgers: [...state.ledgers.filter(item => item.ownerAgentId !== fact.ledger.ownerAgentId), fact.ledger],
    }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

export const trainingProjection = {
  key: 'daiTraining',
  stateVersion: 1,
  stateSchema,
  init: () => ({ ledgers: [] }),
  apply: projectTrainingFact,
  wire: { viewSchema: stateSchema, view: (state: TrainingState) => state },
} satisfies ProjectionDefinition<'daiTraining', TrainingState>
