/** Durable Local Intelligence Core evaluation and promotion lifecycle. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import {
  createModelReleasePointer,
  evaluateModelPromotion,
  type ModelEvaluationResult,
  type PromotionPolicy,
} from './model-evaluation.ts'

const identity = z.string().min(1).max(240)
const unit = z.number().min(0).max(1)

export const modelEvaluationMetricsSchema = z.object({
  correctness: unit,
  domainQuality: unit,
  toolUseReliability: unit,
  robustness: unit,
  safety: unit,
  latencyScore: unit,
  efficiencyScore: unit,
}).strict()

export const modelEvaluationResultSchema = z.object({
  modelId: identity,
  datasetId: identity,
  holdoutId: identity,
  metrics: modelEvaluationMetricsSchema,
  completedAt: z.string().datetime(),
  independentEvaluator: identity,
}).strict()

export const governedModelEvaluationSchema = z.object({
  id: identity,
  result: modelEvaluationResultSchema,
  artifactRef: z.string().min(1).max(4000),
  recordedAt: z.string().datetime(),
  recordedBy: identity,
}).strict()

export const promotionPolicySchema = z.object({
  minCorrectness: unit,
  minDomainQuality: unit,
  minToolUseReliability: unit,
  minRobustness: unit,
  minSafety: unit,
  maxAllowedRegression: unit,
  requireDistinctEvaluator: z.boolean(),
}).strict()

export const modelPromotionDecisionSchema = z.object({
  promote: z.boolean(),
  reasons: z.array(z.string()),
  candidateModelId: identity,
  baselineModelId: identity,
}).strict()

export const modelReleasePointerSchema = z.object({
  activeModelId: identity,
  rollbackModelId: identity,
  promotedAt: z.string().datetime(),
  evaluationDatasetId: identity,
}).strict()

export const governedPromotionSchema = z.object({
  id: identity,
  baselineEvaluationId: identity,
  candidateEvaluationId: identity,
  policy: promotionPolicySchema,
  decision: modelPromotionDecisionSchema,
  release: modelReleasePointerSchema.optional(),
  decidedAt: z.string().datetime(),
  decidedBy: identity,
}).strict()

export const modelLifecycleLedgerSchema = z.object({
  ownerAgentId: identity,
  revision: z.number().int().nonnegative(),
  evaluations: z.array(governedModelEvaluationSchema),
  promotions: z.array(governedPromotionSchema),
}).strict()

export type GovernedModelEvaluation = z.infer<typeof governedModelEvaluationSchema>
export type GovernedPromotion = z.infer<typeof governedPromotionSchema>
export type ModelLifecycleLedger = z.infer<typeof modelLifecycleLedgerSchema>

export const modelLifecycleFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum(['RECORD_EVALUATION', 'EVALUATE_PROMOTION']),
  actorId: identity,
  ledger: modelLifecycleLedgerSchema,
}).strict()

export type ModelLifecycleFact = z.infer<typeof modelLifecycleFactSchema>
export interface ModelLifecycleState {
  readonly ledgers: readonly ModelLifecycleLedger[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change Local Intelligence Core model-lifecycle fact retaining governed evaluation records, promotion decisions and rollback pointers without embedding model artifacts. */
    'd_ai/model-lifecycle-fact': ModelLifecycleFact
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiModelLifecycle: ModelLifecycleState }
  interface SessionProjectionMap { daiModelLifecycle: ModelLifecycleState }
}

const stateSchema: z.ZodType<ModelLifecycleState> = z.object({
  ledgers: z.array(modelLifecycleLedgerSchema),
  failure: z.string().optional(),
}).strict()

function validatePromotion(ledger: ModelLifecycleLedger, promotion: GovernedPromotion): void {
  const baseline = ledger.evaluations.find(item => item.id === promotion.baselineEvaluationId)
  const candidate = ledger.evaluations.find(item => item.id === promotion.candidateEvaluationId)
  if (baseline === undefined || candidate === undefined) throw new Error('promotion references unknown evaluation')

  const expected = evaluateModelPromotion(
    baseline.result as ModelEvaluationResult,
    candidate.result as ModelEvaluationResult,
    promotion.policy as PromotionPolicy,
  )
  if (JSON.stringify(expected) !== JSON.stringify(promotion.decision)) throw new Error('stored promotion decision does not match evaluation policy')

  if (expected.promote) {
    if (promotion.release === undefined) throw new Error('successful promotion requires a rollback-capable release pointer')
    const release = createModelReleasePointer(
      baseline.result as ModelEvaluationResult,
      candidate.result as ModelEvaluationResult,
      expected,
      promotion.release.promotedAt,
    )
    if (JSON.stringify(release) !== JSON.stringify(promotion.release)) throw new Error('stored model release pointer does not match promotion decision')
  } else if (promotion.release !== undefined) {
    throw new Error('rejected promotion cannot contain a release pointer')
  }
}

export function projectModelLifecycleFact(state: ModelLifecycleState, event: SessionEvent): ModelLifecycleState {
  if (state.failure !== undefined || event.type !== 'd_ai/model-lifecycle-fact') return state
  try {
    const fact = modelLifecycleFactSchema.parse(event.data)
    if (fact.actorId !== fact.ledger.ownerAgentId) throw new Error('model-lifecycle actor does not own ledger')
    if (new Set(fact.ledger.evaluations.map(item => item.id)).size !== fact.ledger.evaluations.length) throw new Error('duplicate governed evaluation identity')
    if (new Set(fact.ledger.promotions.map(item => item.id)).size !== fact.ledger.promotions.length) throw new Error('duplicate governed promotion identity')
    for (const promotion of fact.ledger.promotions) validatePromotion(fact.ledger, promotion)

    const prior = state.ledgers.find(item => item.ownerAgentId === fact.ledger.ownerAgentId)
    if ((prior?.revision ?? 0) + 1 !== fact.ledger.revision) throw new Error('model-lifecycle revision is not contiguous')

    if (prior !== undefined) {
      if (JSON.stringify(fact.ledger.evaluations.slice(0, prior.evaluations.length)) !== JSON.stringify(prior.evaluations)) {
        throw new Error('prior governed evaluations changed or disappeared')
      }
      if (JSON.stringify(fact.ledger.promotions.slice(0, prior.promotions.length)) !== JSON.stringify(prior.promotions)) {
        throw new Error('prior governed promotions changed or disappeared')
      }
      if (fact.operation === 'RECORD_EVALUATION') {
        if (fact.ledger.evaluations.length !== prior.evaluations.length + 1 || fact.ledger.promotions.length !== prior.promotions.length) {
          throw new Error('RECORD_EVALUATION must append exactly one evaluation')
        }
      } else if (fact.ledger.evaluations.length !== prior.evaluations.length || fact.ledger.promotions.length !== prior.promotions.length + 1) {
        throw new Error('EVALUATE_PROMOTION must append exactly one promotion decision')
      }
    } else {
      if (fact.ledger.revision !== 1) throw new Error('model-lifecycle ledger must begin at revision 1')
      if (fact.operation !== 'RECORD_EVALUATION' || fact.ledger.evaluations.length !== 1 || fact.ledger.promotions.length !== 0) {
        throw new Error('model-lifecycle ledger must begin with one evaluation record')
      }
    }

    return {
      ledgers: [...state.ledgers.filter(item => item.ownerAgentId !== fact.ledger.ownerAgentId), fact.ledger],
    }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

export const modelLifecycleProjection = {
  key: 'daiModelLifecycle',
  stateVersion: 1,
  stateSchema,
  init: () => ({ ledgers: [] }),
  apply: projectModelLifecycleFact,
  wire: { viewSchema: stateSchema, view: (state: ModelLifecycleState) => state },
} satisfies ProjectionDefinition<'daiModelLifecycle', ModelLifecycleState>
