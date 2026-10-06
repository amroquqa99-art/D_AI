/** Durable resource-budget profiles for D_AI projects, missions, systems and tasks. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { checkBudget, type ResourceBudget, type ResourceUsage } from './resource-value.ts'

const identity = z.string().min(1).max(240)
const nonNegative = z.number().finite().nonnegative()

export const resourceBudgetSchema = z.object({
  tokenLimit: nonNegative.optional(),
  moneyLimitUsd: nonNegative.optional(),
  wallClockMs: nonNegative.optional(),
  humanAttentionMinutes: nonNegative.optional(),
  dataAccessCostUsd: nonNegative.optional(),
}).strict()

export const resourceUsageSchema = z.object({
  tokens: nonNegative,
  moneyUsd: nonNegative,
  wallClockMs: nonNegative,
  humanAttentionMinutes: nonNegative,
  dataAccessCostUsd: nonNegative,
}).strict()

export const budgetProfileSchema = z.object({
  id: identity,
  ownerAgentId: identity,
  scope: z.enum(['SYSTEM', 'PROJECT', 'MISSION', 'TASK']),
  scopeId: identity,
  limits: resourceBudgetSchema,
  usage: resourceUsageSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  updatedBy: identity,
}).strict()

export type BudgetProfile = z.infer<typeof budgetProfileSchema>

export const budgetLedgerSchema = z.object({
  ownerAgentId: identity,
  revision: z.number().int().nonnegative(),
  profiles: z.array(budgetProfileSchema),
}).strict()

export type BudgetLedger = z.infer<typeof budgetLedgerSchema>

export const budgetFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum(['SET_BUDGET', 'ADD_USAGE']),
  actorId: identity,
  ledger: budgetLedgerSchema,
}).strict()

export type BudgetFact = z.infer<typeof budgetFactSchema>
export interface BudgetState {
  readonly ledgers: readonly BudgetLedger[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change D_AI resource-budget fact retaining scoped limits and monotonic usage for deterministic replay and scheduling admission. */
    'd_ai/budget-fact': BudgetFact
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiBudgets: BudgetState }
  interface SessionProjectionMap { daiBudgets: BudgetState }
}

const stateSchema: z.ZodType<BudgetState> = z.object({
  ledgers: z.array(budgetLedgerSchema),
  failure: z.string().optional(),
}).strict()

function validateProfile(profile: BudgetProfile): void {
  checkBudget(profile.limits as ResourceBudget, profile.usage as ResourceUsage)
  if (Object.keys(profile.limits).length === 0) throw new Error('budget profile requires at least one limit')
  if (Date.parse(profile.updatedAt) < Date.parse(profile.createdAt)) throw new Error('budget updatedAt precedes createdAt')
}

function usageDidNotDecrease(before: BudgetProfile, after: BudgetProfile): boolean {
  return after.usage.tokens >= before.usage.tokens
    && after.usage.moneyUsd >= before.usage.moneyUsd
    && after.usage.wallClockMs >= before.usage.wallClockMs
    && after.usage.humanAttentionMinutes >= before.usage.humanAttentionMinutes
    && after.usage.dataAccessCostUsd >= before.usage.dataAccessCostUsd
}

export function projectBudgetFact(state: BudgetState, event: SessionEvent): BudgetState {
  if (state.failure !== undefined || event.type !== 'd_ai/budget-fact') return state
  try {
    const fact = budgetFactSchema.parse(event.data)
    if (fact.actorId !== fact.ledger.ownerAgentId) throw new Error('budget fact actor does not own ledger')
    if (new Set(fact.ledger.profiles.map(profile => profile.id)).size !== fact.ledger.profiles.length) throw new Error('duplicate budget profile identity')
    for (const profile of fact.ledger.profiles) validateProfile(profile)

    const prior = state.ledgers.find(item => item.ownerAgentId === fact.ledger.ownerAgentId)
    if ((prior?.revision ?? 0) + 1 !== fact.ledger.revision) throw new Error('budget ledger revision is not contiguous')

    if (prior !== undefined) {
      const beforeById = new Map(prior.profiles.map(profile => [profile.id, profile]))
      const afterById = new Map(fact.ledger.profiles.map(profile => [profile.id, profile]))

      for (const before of prior.profiles) {
        const after = afterById.get(before.id)
        if (after === undefined) throw new Error('budget profile disappeared')
        for (const field of ['id', 'ownerAgentId', 'scope', 'scopeId', 'createdAt'] as const) {
          if (after[field] !== before[field]) throw new Error('immutable budget profile field changed: ' + field)
        }
        if (!usageDidNotDecrease(before, after)) throw new Error('budget usage cannot decrease')

        if (fact.operation === 'ADD_USAGE') {
          if (JSON.stringify(after.limits) !== JSON.stringify(before.limits)) throw new Error('ADD_USAGE cannot change budget limits')
        }
        if (fact.operation === 'SET_BUDGET') {
          if (JSON.stringify(after.usage) !== JSON.stringify(before.usage)) throw new Error('SET_BUDGET cannot rewrite accumulated usage')
        }
      }

      if (fact.operation === 'ADD_USAGE' && fact.ledger.profiles.length !== prior.profiles.length) {
        throw new Error('ADD_USAGE cannot add budget profiles')
      }

      if (fact.operation === 'SET_BUDGET') {
        const newProfiles = fact.ledger.profiles.filter(profile => !beforeById.has(profile.id))
        if (newProfiles.length > 1) throw new Error('SET_BUDGET may add at most one profile per fact')
      }
    } else if (fact.ledger.revision !== 1) {
      throw new Error('budget ledger must begin at revision 1')
    }

    return {
      ledgers: [...state.ledgers.filter(item => item.ownerAgentId !== fact.ledger.ownerAgentId), fact.ledger],
    }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

export const budgetProjection = {
  key: 'daiBudgets',
  stateVersion: 1,
  stateSchema,
  init: () => ({ ledgers: [] }),
  apply: projectBudgetFact,
  wire: { viewSchema: stateSchema, view: (state: BudgetState) => state },
} satisfies ProjectionDefinition<'daiBudgets', BudgetState>
