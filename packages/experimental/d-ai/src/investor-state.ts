/** Durable Investor system facts and deterministic projection. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const identity = z.string().min(1).max(240)

export const investorSourceSchema = z.object({
  id: identity,
  category: z.enum(['FILING', 'MARKET', 'MACRO', 'NEWS', 'SOCIAL', 'OTHER']),
  requestedUrl: z.string().url(),
  finalUrl: z.string().url(),
  capturedAt: z.string().datetime(),
  statusCode: z.number().int(),
  content: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  actorId: identity,
}).strict()

export const investmentThesisSchema = z.object({
  id: identity,
  statement: z.string().min(1).max(16000),
  horizon: z.enum(['SHORT', 'MEDIUM', 'LONG']),
  rationale: z.string().min(1).max(16000),
  invalidationConditions: z.string().min(1).max(16000),
  state: z.enum(['OPEN', 'INVALIDATED', 'CLOSED']),
  actorId: identity,
  createdAt: z.string().datetime(),
}).strict()

export const investorDelegationSchema = z.object({
  fundamental: z.object({ agentId: identity, content: z.string() }).strict(),
  risk: z.object({ agentId: identity, content: z.string() }).strict(),
}).strict()

export const investorCaseSchema = z.object({
  id: identity,
  system: z.literal('investor'),
  objective: z.string().min(1).max(16000),
  ownerAgentId: identity,
  status: z.enum(['ACTIVE', 'WAITING_FOR_DATA', 'PAUSED', 'COMPLETE']),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  sources: z.array(investorSourceSchema),
  theses: z.array(investmentThesisSchema),
  delegations: z.array(investorDelegationSchema),
}).strict()

export type InvestorSource = z.infer<typeof investorSourceSchema>
export type InvestmentThesis = z.infer<typeof investmentThesisSchema>
export type InvestorCase = z.infer<typeof investorCaseSchema>
export type InvestorDelegation = z.infer<typeof investorDelegationSchema>

export const investorFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum(['CREATE', 'CAPTURE_SOURCE', 'ADD_THESIS', 'DELEGATE', 'STATUS']),
  actorId: identity,
  case: investorCaseSchema,
}).strict()

export type InvestorFact = z.infer<typeof investorFactSchema>
export interface InvestorState {
  readonly cases: readonly InvestorCase[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change Investor case fact retaining captured source provenance, explicit theses and independent fundamental/risk review state. */
    'd_ai/investor-fact': InvestorFact
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiInvestor: InvestorState }
  interface SessionProjectionMap { daiInvestor: InvestorState }
}

const stateSchema: z.ZodType<InvestorState> = z.object({
  cases: z.array(investorCaseSchema),
  failure: z.string().optional(),
}).strict()

export function projectInvestorFact(state: InvestorState, event: SessionEvent): InvestorState {
  if (state.failure !== undefined || event.type !== 'd_ai/investor-fact') return state
  try {
    const fact = investorFactSchema.parse(event.data)
    if (fact.actorId !== fact.case.ownerAgentId) throw new Error('investor fact actor does not own case')
    if (new Set(fact.case.sources.map(item => item.id)).size !== fact.case.sources.length) throw new Error('duplicate investor source identity')
    if (new Set(fact.case.theses.map(item => item.id)).size !== fact.case.theses.length) throw new Error('duplicate investment thesis identity')
    for (const source of fact.case.sources) {
      if (createHash('sha256').update(source.content, 'utf8').digest('hex') !== source.sha256) throw new Error('investor source checksum mismatch')
    }

    const prior = state.cases.find(item => item.id === fact.case.id)
    if ((prior?.revision ?? 0) + 1 !== fact.case.revision) throw new Error('investor case revision is not contiguous')
    if (prior === undefined && fact.operation !== 'CREATE') throw new Error('investor case must begin with CREATE')

    if (prior !== undefined) {
      if (
        fact.operation === 'CREATE'
        || prior.ownerAgentId !== fact.case.ownerAgentId
        || prior.objective !== fact.case.objective
        || prior.createdAt !== fact.case.createdAt
      ) throw new Error('immutable investor case identity changed')
      for (const source of prior.sources) {
        if (JSON.stringify(fact.case.sources.find(item => item.id === source.id)) !== JSON.stringify(source)) throw new Error('prior investor source changed or disappeared')
      }
      for (const thesis of prior.theses) {
        if (JSON.stringify(fact.case.theses.find(item => item.id === thesis.id)) !== JSON.stringify(thesis)) throw new Error('prior investment thesis changed or disappeared')
      }
      if (JSON.stringify(fact.case.delegations.slice(0, prior.delegations.length)) !== JSON.stringify(prior.delegations)) {
        throw new Error('prior investor delegation changed or disappeared')
      }
    }

    return { cases: [...state.cases.filter(item => item.id !== fact.case.id), fact.case] }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

export const investorProjection = {
  key: 'daiInvestor',
  stateVersion: 1,
  stateSchema,
  init: () => ({ cases: [] }),
  apply: projectInvestorFact,
  wire: { viewSchema: stateSchema, view: (state: InvestorState) => state },
} satisfies ProjectionDefinition<'daiInvestor', InvestorState>
