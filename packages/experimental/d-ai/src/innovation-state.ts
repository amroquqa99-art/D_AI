/** Durable Innovation & Discovery project facts and deterministic projection. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const identity = z.string().min(1).max(240)

export const innovationCandidateSchema = z.object({
  id: identity,
  title: z.string().min(1).max(3000),
  description: z.string().min(1).max(24000),
  mechanism: z.string().min(1).max(24000),
  falsificationTest: z.string().min(1).max(24000),
  noveltyStatus: z.enum(['UNKNOWN', 'KNOWN_VARIANT', 'POTENTIALLY_NOVEL']),
  state: z.enum(['OPEN', 'REFUTED', 'NEEDS_EXPERIMENT', 'VERIFIED_WITH_SCOPE']),
  actorId: identity,
  createdAt: z.string().datetime(),
}).strict()

export const innovationExperimentSchema = z.object({
  id: identity,
  title: z.string().min(1).max(3000),
  objective: z.string().min(1).max(12000),
  protocol: z.string().min(1).max(24000),
  successCriteria: z.string().min(1).max(12000),
  failureCriteria: z.string().min(1).max(12000),
  status: z.enum(['WAITING_FOR_HUMAN', 'RESULT_RECORDED']),
  observation: z.string().max(24000).optional(),
  artifactRef: z.string().max(4000).optional(),
  actorId: identity,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
}).strict()

export const innovationDelegationSchema = z.object({
  explorer: z.object({ agentId: identity, content: z.string() }).strict(),
  critic: z.object({ agentId: identity, content: z.string() }).strict(),
}).strict()

export const innovationProjectSchema = z.object({
  id: identity,
  system: z.literal('innovation-discovery'),
  problem: z.string().min(1).max(16000),
  ownerAgentId: identity,
  status: z.enum(['ACTIVE', 'NEEDS_EXPERIMENT', 'PAUSED', 'COMPLETE']),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  candidates: z.array(innovationCandidateSchema),
  experiments: z.array(innovationExperimentSchema),
  delegations: z.array(innovationDelegationSchema),
}).strict()

export type InnovationCandidate = z.infer<typeof innovationCandidateSchema>
export type InnovationExperiment = z.infer<typeof innovationExperimentSchema>
export type InnovationProject = z.infer<typeof innovationProjectSchema>
export type InnovationDelegation = z.infer<typeof innovationDelegationSchema>

export const innovationFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum(['CREATE', 'ADD_CANDIDATE', 'REQUEST_EXPERIMENT', 'RECORD_RESULT', 'DELEGATE', 'STATUS']),
  actorId: identity,
  project: innovationProjectSchema,
}).strict()

export type InnovationFact = z.infer<typeof innovationFactSchema>
export interface InnovationState {
  readonly projects: readonly InnovationProject[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change Innovation & Discovery project fact retaining testable candidates, experiment handoffs/results and independent explorer/critic state. */
    'd_ai/innovation-fact': InnovationFact
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiInnovationDiscovery: InnovationState }
  interface SessionProjectionMap { daiInnovationDiscovery: InnovationState }
}

const stateSchema: z.ZodType<InnovationState> = z.object({
  projects: z.array(innovationProjectSchema),
  failure: z.string().optional(),
}).strict()

export function projectInnovationFact(state: InnovationState, event: SessionEvent): InnovationState {
  if (state.failure !== undefined || event.type !== 'd_ai/innovation-fact') return state
  try {
    const fact = innovationFactSchema.parse(event.data)
    if (fact.actorId !== fact.project.ownerAgentId) throw new Error('innovation fact actor does not own project')
    if (new Set(fact.project.candidates.map(item => item.id)).size !== fact.project.candidates.length) throw new Error('duplicate innovation candidate identity')
    if (new Set(fact.project.experiments.map(item => item.id)).size !== fact.project.experiments.length) throw new Error('duplicate innovation experiment identity')

    const prior = state.projects.find(item => item.id === fact.project.id)
    if ((prior?.revision ?? 0) + 1 !== fact.project.revision) throw new Error('innovation project revision is not contiguous')
    if (prior === undefined && fact.operation !== 'CREATE') throw new Error('innovation project must begin with CREATE')

    if (prior !== undefined) {
      if (
        fact.operation === 'CREATE'
        || prior.ownerAgentId !== fact.project.ownerAgentId
        || prior.problem !== fact.project.problem
        || prior.createdAt !== fact.project.createdAt
      ) throw new Error('immutable innovation project identity changed')

      for (const candidate of prior.candidates) {
        if (JSON.stringify(fact.project.candidates.find(item => item.id === candidate.id)) !== JSON.stringify(candidate)) {
          throw new Error('prior innovation candidate changed or disappeared')
        }
      }
      for (const experiment of prior.experiments) {
        const next = fact.project.experiments.find(item => item.id === experiment.id)
        if (next === undefined) throw new Error('prior innovation experiment disappeared')
        for (const field of ['id', 'title', 'objective', 'protocol', 'successCriteria', 'failureCriteria', 'actorId', 'createdAt'] as const) {
          if (JSON.stringify(next[field]) !== JSON.stringify(experiment[field])) throw new Error('immutable innovation experiment field changed: ' + field)
        }
        if (experiment.status === 'RESULT_RECORDED' && JSON.stringify(next) !== JSON.stringify(experiment)) {
          throw new Error('recorded innovation result is immutable')
        }
      }
      if (JSON.stringify(fact.project.delegations.slice(0, prior.delegations.length)) !== JSON.stringify(prior.delegations)) {
        throw new Error('prior innovation delegation changed or disappeared')
      }
    }

    return { projects: [...state.projects.filter(item => item.id !== fact.project.id), fact.project] }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

export const innovationProjection = {
  key: 'daiInnovationDiscovery',
  stateVersion: 1,
  stateSchema,
  init: () => ({ projects: [] }),
  apply: projectInnovationFact,
  wire: { viewSchema: stateSchema, view: (state: InnovationState) => state },
} satisfies ProjectionDefinition<'daiInnovationDiscovery', InnovationState>
