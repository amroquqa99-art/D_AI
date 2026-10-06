/** Durable Operations & Intelligence case facts and deterministic projection. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const identity = z.string().min(1).max(240)

export const operationsEntitySchema = z.object({
  id: identity,
  type: z.enum(['PERSON', 'ORGANIZATION', 'ASSET', 'LOCATION', 'DEVICE', 'ACCOUNT', 'OTHER']),
  label: z.string().min(1).max(4000),
  summary: z.string().max(12000),
  actorId: identity,
  createdAt: z.string().datetime(),
}).strict()

export const operationsRelationshipSchema = z.object({
  id: identity,
  fromEntityId: identity,
  toEntityId: identity,
  type: z.string().min(1).max(1000),
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(identity),
  actorId: identity,
  createdAt: z.string().datetime(),
}).strict()

export const operationsTimelineSchema = z.object({
  id: identity,
  occurredAt: z.string().datetime(),
  label: z.string().min(1).max(4000),
  details: z.string().max(12000),
  evidenceRefs: z.array(identity),
  actorId: identity,
  createdAt: z.string().datetime(),
}).strict()

export const intelligenceGapSchema = z.object({
  id: identity,
  question: z.string().min(1).max(12000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  state: z.enum(['OPEN', 'RESOLVED', 'SUPERSEDED']),
  actorId: identity,
  createdAt: z.string().datetime(),
}).strict()

export const operationalOptionSchema = z.object({
  id: identity,
  title: z.string().min(1).max(2000),
  description: z.string().min(1).max(12000),
  expectedBenefit: z.string().min(1).max(12000),
  risks: z.string().min(1).max(12000),
  requiresHumanApproval: z.literal(true),
  state: z.enum(['PROPOSED', 'APPROVED', 'REJECTED', 'SUPERSEDED']),
  actorId: identity,
  createdAt: z.string().datetime(),
}).strict()

export const operationsDelegationSchema = z.object({
  fusion: z.object({ agentId: identity, content: z.string() }).strict(),
  adversarial: z.object({ agentId: identity, content: z.string() }).strict(),
}).strict()

export const operationsCaseSchema = z.object({
  id: identity,
  system: z.literal('operations-intelligence'),
  objective: z.string().min(1).max(16000),
  ownerAgentId: identity,
  classification: z.enum(['UNCLASSIFIED', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']),
  status: z.enum(['ACTIVE', 'WAITING_FOR_DATA', 'PAUSED', 'COMPLETE']),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  entities: z.array(operationsEntitySchema),
  relationships: z.array(operationsRelationshipSchema),
  timeline: z.array(operationsTimelineSchema),
  gaps: z.array(intelligenceGapSchema),
  options: z.array(operationalOptionSchema),
  delegations: z.array(operationsDelegationSchema),
}).strict()

export type OperationsEntity = z.infer<typeof operationsEntitySchema>
export type OperationsRelationship = z.infer<typeof operationsRelationshipSchema>
export type OperationsTimelineEvent = z.infer<typeof operationsTimelineSchema>
export type IntelligenceGap = z.infer<typeof intelligenceGapSchema>
export type OperationalOption = z.infer<typeof operationalOptionSchema>
export type OperationsCase = z.infer<typeof operationsCaseSchema>
export type OperationsDelegation = z.infer<typeof operationsDelegationSchema>

export const operationsFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum(['CREATE', 'ADD_ENTITY', 'ADD_RELATIONSHIP', 'ADD_TIMELINE', 'ADD_GAP', 'ADD_OPTION', 'DELEGATE', 'STATUS']),
  actorId: identity,
  case: operationsCaseSchema,
}).strict()

export type OperationsFact = z.infer<typeof operationsFactSchema>
export interface OperationsState {
  readonly cases: readonly OperationsCase[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change Operations & Intelligence case fact retaining entities, relationships, timeline, information gaps, human-gated options and analysis state. */
    'd_ai/operations-fact': OperationsFact
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiOperationsIntelligence: OperationsState }
  interface SessionProjectionMap { daiOperationsIntelligence: OperationsState }
}

const stateSchema: z.ZodType<OperationsState> = z.object({
  cases: z.array(operationsCaseSchema),
  failure: z.string().optional(),
}).strict()

export function projectOperationsFact(state: OperationsState, event: SessionEvent): OperationsState {
  if (state.failure !== undefined || event.type !== 'd_ai/operations-fact') return state
  try {
    const fact = operationsFactSchema.parse(event.data)
    if (fact.actorId !== fact.case.ownerAgentId) throw new Error('operations fact actor does not own case')
    for (const collection of [fact.case.entities, fact.case.relationships, fact.case.timeline, fact.case.gaps, fact.case.options]) {
      const ids = collection.map(item => item.id)
      if (new Set(ids).size !== ids.length) throw new Error('duplicate operations object identity')
    }
    for (const relation of fact.case.relationships) {
      if (!fact.case.entities.some(entity => entity.id === relation.fromEntityId) || !fact.case.entities.some(entity => entity.id === relation.toEntityId)) {
        throw new Error('operations relationship references unknown entity')
      }
    }

    const prior = state.cases.find(item => item.id === fact.case.id)
    if ((prior?.revision ?? 0) + 1 !== fact.case.revision) throw new Error('operations case revision is not contiguous')
    if (prior === undefined && fact.operation !== 'CREATE') throw new Error('operations case must begin with CREATE')
    if (prior !== undefined) {
      if (
        fact.operation === 'CREATE'
        || prior.ownerAgentId !== fact.case.ownerAgentId
        || prior.objective !== fact.case.objective
        || prior.createdAt !== fact.case.createdAt
        || prior.classification !== fact.case.classification
      ) throw new Error('immutable operations case identity changed')

      const assertAppendOnly = <T extends { readonly id: string }>(
        label: string,
        before: readonly T[],
        after: readonly T[],
      ): void => {
        for (const item of before) {
          if (JSON.stringify(after.find(next => next.id === item.id)) !== JSON.stringify(item)) {
            throw new Error('prior operations ' + label + ' changed or disappeared')
          }
        }
      }
      assertAppendOnly('entity', prior.entities, fact.case.entities)
      assertAppendOnly('relationship', prior.relationships, fact.case.relationships)
      assertAppendOnly('timeline event', prior.timeline, fact.case.timeline)
      assertAppendOnly('gap', prior.gaps, fact.case.gaps)
      assertAppendOnly('option', prior.options, fact.case.options)
      if (JSON.stringify(fact.case.delegations.slice(0, prior.delegations.length)) !== JSON.stringify(prior.delegations)) {
        throw new Error('prior operations delegation changed or disappeared')
      }
    }

    return { cases: [...state.cases.filter(item => item.id !== fact.case.id), fact.case] }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

export const operationsProjection = {
  key: 'daiOperationsIntelligence',
  stateVersion: 1,
  stateSchema,
  init: () => ({ cases: [] }),
  apply: projectOperationsFact,
  wire: { viewSchema: stateSchema, view: (state: OperationsState) => state },
} satisfies ProjectionDefinition<'daiOperationsIntelligence', OperationsState>
