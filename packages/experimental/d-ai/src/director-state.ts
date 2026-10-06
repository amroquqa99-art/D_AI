/** Durable cross-system Mission Director plan metadata for D_AI. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const identity = z.string().min(1).max(240)
const systemId = z.enum([
  'investigation',
  'scientific-research',
  'investor',
  'cybersecurity',
  'operations-intelligence',
  'innovation-discovery',
])

export const directorPlanSchema = z.object({
  id: identity,
  objective: z.string().min(1).max(16000),
  primarySystem: systemId,
  ownerAgentId: identity,
  createdAt: z.string().datetime(),
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETE']),
  stopConditions: z.array(z.string().min(1).max(4000)),
}).strict()

export const directorLedgerSchema = z.object({
  ownerAgentId: identity,
  revision: z.number().int().nonnegative(),
  plans: z.array(directorPlanSchema),
}).strict()

export type DirectorPlan = z.infer<typeof directorPlanSchema>
export type DirectorLedger = z.infer<typeof directorLedgerSchema>

export const directorFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum(['CREATE_PLAN', 'SET_STATUS']),
  actorId: identity,
  ledger: directorLedgerSchema,
}).strict()

export type DirectorFact = z.infer<typeof directorFactSchema>
export interface DirectorState {
  readonly ledgers: readonly DirectorLedger[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change D_AI Mission Director fact retaining cross-system plan identity, stop conditions and explicit pause/complete lifecycle state. */
    'd_ai/director-fact': DirectorFact
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiDirector: DirectorState }
  interface SessionProjectionMap { daiDirector: DirectorState }
}

const stateSchema: z.ZodType<DirectorState> = z.object({
  ledgers: z.array(directorLedgerSchema),
  failure: z.string().optional(),
}).strict()

export function projectDirectorFact(state: DirectorState, event: SessionEvent): DirectorState {
  if (state.failure !== undefined || event.type !== 'd_ai/director-fact') return state
  try {
    const fact = directorFactSchema.parse(event.data)
    if (fact.actorId !== fact.ledger.ownerAgentId) throw new Error('director fact actor does not own ledger')
    if (new Set(fact.ledger.plans.map(plan => plan.id)).size !== fact.ledger.plans.length) throw new Error('duplicate director plan identity')

    const prior = state.ledgers.find(item => item.ownerAgentId === fact.ledger.ownerAgentId)
    if ((prior?.revision ?? 0) + 1 !== fact.ledger.revision) throw new Error('director ledger revision is not contiguous')

    if (prior !== undefined) {
      const before = new Map(prior.plans.map(plan => [plan.id, plan]))
      const after = new Map(fact.ledger.plans.map(plan => [plan.id, plan]))

      if (fact.operation === 'CREATE_PLAN') {
        if (fact.ledger.plans.length !== prior.plans.length + 1) throw new Error('CREATE_PLAN must append exactly one plan')
        for (const plan of prior.plans) {
          if (JSON.stringify(after.get(plan.id)) !== JSON.stringify(plan)) throw new Error('CREATE_PLAN cannot mutate existing plans')
        }
      } else {
        if (fact.ledger.plans.length !== prior.plans.length) throw new Error('SET_STATUS cannot add or remove plans')
        const changed = prior.plans.filter(plan => JSON.stringify(after.get(plan.id)) !== JSON.stringify(plan))
        if (changed.length !== 1) throw new Error('SET_STATUS must change exactly one plan')
        const oldPlan = changed[0]!
        const newPlan = after.get(oldPlan.id)!
        for (const field of ['id', 'objective', 'primarySystem', 'ownerAgentId', 'createdAt', 'stopConditions'] as const) {
          if (JSON.stringify(oldPlan[field]) !== JSON.stringify(newPlan[field])) throw new Error('immutable director plan field changed: ' + field)
        }
        if (oldPlan.status === 'COMPLETE' && newPlan.status !== 'COMPLETE') throw new Error('completed director plan cannot be reopened')
      }

      if (before.size !== prior.plans.length || after.size !== fact.ledger.plans.length) throw new Error('duplicate director plan identity')
    } else {
      if (fact.ledger.revision !== 1) throw new Error('director ledger must begin at revision 1')
      if (fact.operation !== 'CREATE_PLAN' || fact.ledger.plans.length !== 1) throw new Error('director ledger must begin with exactly one plan')
    }

    return {
      ledgers: [...state.ledgers.filter(item => item.ownerAgentId !== fact.ledger.ownerAgentId), fact.ledger],
    }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

export const directorProjection = {
  key: 'daiDirector',
  stateVersion: 1,
  stateSchema,
  init: () => ({ ledgers: [] }),
  apply: projectDirectorFact,
  wire: { viewSchema: stateSchema, view: (state: DirectorState) => state },
} satisfies ProjectionDefinition<'daiDirector', DirectorState>
