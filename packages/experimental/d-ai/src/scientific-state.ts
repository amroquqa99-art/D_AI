/** Durable Scientific Research project facts and deterministic projection. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const identity = z.string().min(1).max(240)

export const scientificHypothesisSchema = z.object({
  id: identity,
  statement: z.string().min(1).max(12000),
  rationale: z.string().min(1).max(12000),
  state: z.enum(['OPEN', 'SUPPORTED_WITH_SCOPE', 'REFUTED', 'SUPERSEDED']),
  actorId: identity,
  createdAt: z.string().datetime(),
}).strict()

export const scientificExperimentSchema = z.object({
  id: identity,
  title: z.string().min(1).max(1000),
  objective: z.string().min(1).max(12000),
  protocol: z.string().min(1).max(24000),
  expectedEvidence: z.string().min(1).max(12000),
  budgetUsd: z.number().nonnegative().optional(),
  status: z.enum(['PROPOSED', 'WAITING_FOR_HUMAN', 'RESULT_RECORDED']),
  observation: z.string().max(24000).optional(),
  artifactRef: z.string().max(4000).optional(),
  actorId: identity,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
}).strict()

export const scientificDelegationSchema = z.object({
  literature: z.object({ agentId: identity, content: z.string() }).strict(),
  methodology: z.object({ agentId: identity, content: z.string() }).strict(),
}).strict()

export const scientificProjectSchema = z.object({
  id: identity,
  system: z.literal('scientific-research'),
  question: z.string().min(1).max(16000),
  ownerAgentId: identity,
  status: z.enum(['ACTIVE', 'WAITING_FOR_HUMAN', 'PAUSED', 'COMPLETE']),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  hypotheses: z.array(scientificHypothesisSchema),
  experiments: z.array(scientificExperimentSchema),
  delegations: z.array(scientificDelegationSchema),
}).strict()

export type ScientificHypothesis = z.infer<typeof scientificHypothesisSchema>
export type ScientificExperiment = z.infer<typeof scientificExperimentSchema>
export type ScientificDelegation = z.infer<typeof scientificDelegationSchema>
export type ScientificProject = z.infer<typeof scientificProjectSchema>

export const scientificFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum(['CREATE', 'ADD_HYPOTHESIS', 'REQUEST_EXPERIMENT', 'RECORD_RESULT', 'DELEGATE', 'STATUS']),
  actorId: identity,
  project: scientificProjectSchema,
}).strict()

export type ScientificFact = z.infer<typeof scientificFactSchema>

export interface ScientificState {
  readonly projects: readonly ScientificProject[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change Scientific Research project fact used to rebuild hypotheses, experiment handoffs/results and independent review state. */
    'd_ai/scientific-fact': ScientificFact
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiScientificResearch: ScientificState }
  interface SessionProjectionMap { daiScientificResearch: ScientificState }
}

const stateSchema: z.ZodType<ScientificState> = z.object({
  projects: z.array(scientificProjectSchema),
  failure: z.string().optional(),
}).strict()

export function projectScientificFact(state: ScientificState, event: SessionEvent): ScientificState {
  if (state.failure !== undefined || event.type !== 'd_ai/scientific-fact') return state
  try {
    const fact = scientificFactSchema.parse(event.data)
    if (fact.actorId !== fact.project.ownerAgentId) throw new Error('scientific fact actor does not own project')
    if (new Set(fact.project.hypotheses.map(item => item.id)).size !== fact.project.hypotheses.length) throw new Error('duplicate scientific hypothesis identity')
    if (new Set(fact.project.experiments.map(item => item.id)).size !== fact.project.experiments.length) throw new Error('duplicate scientific experiment identity')

    const prior = state.projects.find(project => project.id === fact.project.id)
    if ((prior?.revision ?? 0) + 1 !== fact.project.revision) throw new Error('scientific project revision is not contiguous')
    if (prior === undefined && fact.operation !== 'CREATE') throw new Error('scientific project must begin with CREATE')

    if (prior !== undefined) {
      if (
        fact.operation === 'CREATE'
        || prior.ownerAgentId !== fact.project.ownerAgentId
        || prior.question !== fact.project.question
        || prior.createdAt !== fact.project.createdAt
      ) throw new Error('immutable scientific project identity changed')

      for (const hypothesis of prior.hypotheses) {
        if (JSON.stringify(fact.project.hypotheses.find(item => item.id === hypothesis.id)) !== JSON.stringify(hypothesis)) {
          throw new Error('prior scientific hypothesis changed or disappeared')
        }
      }
      for (const experiment of prior.experiments) {
        const next = fact.project.experiments.find(item => item.id === experiment.id)
        if (next === undefined) throw new Error('prior scientific experiment disappeared')
        if (experiment.status === 'RESULT_RECORDED' && JSON.stringify(next) !== JSON.stringify(experiment)) {
          throw new Error('recorded scientific result is immutable')
        }
        const immutableFields = ['id', 'title', 'objective', 'protocol', 'expectedEvidence', 'budgetUsd', 'actorId', 'createdAt'] as const
        for (const field of immutableFields) {
          if (JSON.stringify(next[field]) !== JSON.stringify(experiment[field])) throw new Error(`scientific experiment ${field} changed`)
        }
      }
      if (JSON.stringify(fact.project.delegations.slice(0, prior.delegations.length)) !== JSON.stringify(prior.delegations)) {
        throw new Error('prior scientific delegation changed or disappeared')
      }
    }

    return { projects: [...state.projects.filter(project => project.id !== fact.project.id), fact.project] }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

export const scientificProjection = {
  key: 'daiScientificResearch',
  stateVersion: 1,
  stateSchema,
  init: () => ({ projects: [] }),
  apply: projectScientificFact,
  wire: { viewSchema: stateSchema, view: (state: ScientificState) => state },
} satisfies ProjectionDefinition<'daiScientificResearch', ScientificState>
