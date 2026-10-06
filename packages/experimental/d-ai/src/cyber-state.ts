/** Durable authorized Cybersecurity engagement facts and deterministic projection. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const identity = z.string().min(1).max(240)

export const authorizationScopeSchema = z.object({
  targetDescription: z.string().min(1).max(12000),
  permittedActions: z.array(z.string().min(1).max(1000)).min(1),
  approvedBy: identity,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
}).strict()

export const cyberFindingSchema = z.object({
  id: identity,
  title: z.string().min(1).max(2000),
  severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  evidence: z.string().min(1).max(24000),
  remediation: z.string().min(1).max(24000),
  status: z.enum(['OPEN', 'REMEDIATED', 'RETEST_PASSED', 'ACCEPTED_RISK']),
  actorId: identity,
  createdAt: z.string().datetime(),
  remediationNote: z.string().max(24000).optional(),
  retestEvidence: z.string().max(24000).optional(),
  updatedAt: z.string().datetime().optional(),
}).strict()

export const cyberDelegationSchema = z.object({
  assessment: z.object({ agentId: identity, content: z.string() }).strict(),
  remediationReview: z.object({ agentId: identity, content: z.string() }).strict(),
}).strict()

export const cyberEngagementSchema = z.object({
  id: identity,
  system: z.literal('cybersecurity'),
  objective: z.string().min(1).max(16000),
  ownerAgentId: identity,
  authorization: authorizationScopeSchema,
  status: z.enum(['ACTIVE', 'WAITING_FOR_REMEDIATION', 'PAUSED', 'COMPLETE']),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  findings: z.array(cyberFindingSchema),
  delegations: z.array(cyberDelegationSchema),
}).strict()

export type CyberAuthorizationScope = z.infer<typeof authorizationScopeSchema>
export type CyberFinding = z.infer<typeof cyberFindingSchema>
export type CyberEngagement = z.infer<typeof cyberEngagementSchema>
export type CyberDelegation = z.infer<typeof cyberDelegationSchema>

export const cyberFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum(['CREATE', 'ADD_FINDING', 'RECORD_REMEDIATION', 'RETEST', 'DELEGATE', 'STATUS']),
  actorId: identity,
  engagement: cyberEngagementSchema,
}).strict()

export type CyberFact = z.infer<typeof cyberFactSchema>
export interface CyberState {
  readonly engagements: readonly CyberEngagement[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change authorized Cybersecurity engagement fact retaining immutable authorization scope, findings, remediation, retest and review state. */
    'd_ai/cyber-fact': CyberFact
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiCybersecurity: CyberState }
  interface SessionProjectionMap { daiCybersecurity: CyberState }
}

const stateSchema: z.ZodType<CyberState> = z.object({
  engagements: z.array(cyberEngagementSchema),
  failure: z.string().optional(),
}).strict()

export function projectCyberFact(state: CyberState, event: SessionEvent): CyberState {
  if (state.failure !== undefined || event.type !== 'd_ai/cyber-fact') return state
  try {
    const fact = cyberFactSchema.parse(event.data)
    if (fact.actorId !== fact.engagement.ownerAgentId) throw new Error('cyber fact actor does not own engagement')
    const issued = Date.parse(fact.engagement.authorization.issuedAt)
    const expires = fact.engagement.authorization.expiresAt === undefined ? undefined : Date.parse(fact.engagement.authorization.expiresAt)
    if (expires !== undefined && expires <= issued) throw new Error('cyber authorization expiry must follow issuance')
    if (new Set(fact.engagement.findings.map(item => item.id)).size !== fact.engagement.findings.length) throw new Error('duplicate cyber finding identity')

    const prior = state.engagements.find(item => item.id === fact.engagement.id)
    if ((prior?.revision ?? 0) + 1 !== fact.engagement.revision) throw new Error('cyber engagement revision is not contiguous')
    if (prior === undefined && fact.operation !== 'CREATE') throw new Error('cyber engagement must begin with CREATE')

    if (prior !== undefined) {
      if (
        fact.operation === 'CREATE'
        || prior.ownerAgentId !== fact.engagement.ownerAgentId
        || prior.objective !== fact.engagement.objective
        || prior.createdAt !== fact.engagement.createdAt
        || JSON.stringify(prior.authorization) !== JSON.stringify(fact.engagement.authorization)
      ) throw new Error('immutable cyber engagement identity or authorization changed')

      for (const finding of prior.findings) {
        const next = fact.engagement.findings.find(item => item.id === finding.id)
        if (next === undefined) throw new Error('prior cyber finding disappeared')
        for (const field of ['id', 'title', 'severity', 'evidence', 'remediation', 'actorId', 'createdAt'] as const) {
          if (JSON.stringify(next[field]) !== JSON.stringify(finding[field])) throw new Error('immutable cyber finding field changed: ' + field)
        }
        if (finding.status === 'RETEST_PASSED' && JSON.stringify(next) !== JSON.stringify(finding)) throw new Error('passed cyber retest is immutable')
      }
      if (JSON.stringify(fact.engagement.delegations.slice(0, prior.delegations.length)) !== JSON.stringify(prior.delegations)) {
        throw new Error('prior cyber delegation changed or disappeared')
      }
    }

    return { engagements: [...state.engagements.filter(item => item.id !== fact.engagement.id), fact.engagement] }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

export const cyberProjection = {
  key: 'daiCybersecurity',
  stateVersion: 1,
  stateSchema,
  init: () => ({ engagements: [] }),
  apply: projectCyberFact,
  wire: { viewSchema: stateSchema, view: (state: CyberState) => state },
} satisfies ProjectionDefinition<'daiCybersecurity', CyberState>
