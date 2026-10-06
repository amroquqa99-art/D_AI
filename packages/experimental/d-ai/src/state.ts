/** Immutable investigative facts and deterministic replay over native Session history. */
import { z } from 'zod'
import { createHash } from 'node:crypto'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

/** Product system registry lives in a dedicated first-class contract module. */
export { SYSTEMS } from './systems.ts'

const identity = z.string().min(1).max(200)
const sourceSchema = z.object({
  id: identity, requestedUrl: z.string().url(), finalUrl: z.string().url(), capturedAt: z.string().datetime(),
  statusCode: z.number().int(), kind: z.enum(['html', 'text']), content: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  hashEncoding: z.literal('utf8-decoded-content'), truncated: z.boolean(), actorId: identity,
  originSystem: z.literal('investigation'), originTool: z.literal('d_ai_capture_source'),
}).strict()
const claimSchema = z.object({
  id: identity, text: z.string().min(1).max(8000), state: z.enum(['OBSERVED', 'DERIVED', 'CONTESTED', 'VERIFIED_WITH_SCOPE', 'SUPERSEDED', 'ARCHIVED']),
  sourceId: identity, excerpt: z.string().min(1).max(8000), actorId: identity,
  scope: z.string().max(8000).optional(), verifierId: identity.optional(), contradicts: identity.optional(),
}).strict()
const delegationSchema = z.object({
  research: z.object({ agentId: identity, content: z.string() }).strict(),
  verification: z.object({ agentId: identity, content: z.string() }).strict(),
}).strict()
const missionSchema = z.object({
  id: identity, system: z.literal('investigation'), objective: z.string().min(1).max(16000), ownerAgentId: identity,
  status: z.enum(['ACTIVE', 'WAITING_FOR_HUMAN', 'BLOCKED_POLICY', 'BLOCKED_BUDGET', 'PAUSED', 'COMPLETE']),
  revision: z.number().int().positive(), createdAt: z.string().datetime(),
  sources: z.array(sourceSchema), claims: z.array(claimSchema), delegations: z.array(delegationSchema),
}).strict()

/** Captured decoded source; hash does not identify original HTTP bytes. */
export type EvidenceSource = z.infer<typeof sourceSchema>
/** Anchored claim retained through contested or archived lifecycle states. */
export type EvidenceClaim = z.infer<typeof claimSchema>
/** One durable investigative mission value. */
export type Mission = z.infer<typeof missionSchema>
/** Auditable operation carrying its complete committed mission state. */
export const factSchema = z.object({
  version: z.literal(1), operation: z.enum(['CREATE', 'CAPTURE_SOURCE', 'ADD_CLAIM', 'DELEGATE', 'STATUS']),
  actorId: identity, mission: missionSchema,
}).strict()
/** Complete post-change fact carried in native Session history. */
export type MissionFact = z.infer<typeof factSchema>
/** Projection from immutable Session facts. */
export interface MissionState { readonly missions: readonly Mission[]; readonly failure?: string | undefined }

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete audited investigation state after one owner-authorized operation; never a conversation surface message. */
    'd_ai/fact': MissionFact
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { dai: MissionState }
  interface SessionProjectionMap { dai: MissionState }
}

const stateSchema: z.ZodType<MissionState> = z.object({ missions: z.array(missionSchema), failure: z.string().optional() }).strict()

/**
 * Fold one Session event, refusing inconsistent revisions or rewritten raw sources.
 * @param state - prior deterministic state.
 * @param event - committed native Session event.
 * @returns next immutable projection or a sticky validation failure.
 */
export function projectFact(state: MissionState, event: SessionEvent): MissionState {
  if (state.failure !== undefined || event.type !== 'd_ai/fact') return state
  try {
    const fact = factSchema.parse(event.data)
    if (fact.actorId !== fact.mission.ownerAgentId) throw new Error('fact actor does not own mission')
    if (new Set(fact.mission.sources.map(s => s.id)).size !== fact.mission.sources.length || new Set(fact.mission.claims.map(c => c.id)).size !== fact.mission.claims.length) throw new Error('duplicate evidence identity')
    for (const source of fact.mission.sources) {
      if (createHash('sha256').update(source.content, 'utf8').digest('hex') !== source.sha256) throw new Error('source checksum mismatch')
    }
    for (const claim of fact.mission.claims) {
      if (claim.state === 'VERIFIED_WITH_SCOPE') throw new Error('claim verification is not implemented in this milestone')
      const source = fact.mission.sources.find(s => s.id === claim.sourceId)
      if (source === undefined || !source.content.includes(claim.excerpt)) throw new Error('claim has no captured-source anchor')
      if (claim.contradicts !== undefined && !fact.mission.claims.some(c => c.id === claim.contradicts && c.id !== claim.id)) throw new Error('invalid counterclaim reference')
    }
    const prior = state.missions.find(m => m.id === fact.mission.id)
    if ((prior?.revision ?? 0) + 1 !== fact.mission.revision) throw new Error('mission revision is not contiguous')
    if (prior === undefined && fact.operation !== 'CREATE') throw new Error('mission must begin with CREATE')
    if (prior !== undefined) {
      if (fact.operation === 'CREATE' || prior.ownerAgentId !== fact.mission.ownerAgentId || prior.objective !== fact.mission.objective || prior.createdAt !== fact.mission.createdAt) throw new Error('immutable mission identity changed')
      for (const source of prior.sources) {
        if (JSON.stringify(fact.mission.sources.find(s => s.id === source.id)) !== JSON.stringify(source)) throw new Error('raw source changed or disappeared')
      }
      if (JSON.stringify(fact.mission.delegations.slice(0, prior.delegations.length)) !== JSON.stringify(prior.delegations)) throw new Error('prior delegation changed or disappeared')
      for (const claim of prior.claims) {
        if (JSON.stringify(fact.mission.claims.find(c => c.id === claim.id)) !== JSON.stringify(claim)) throw new Error('original claim changed or disappeared')
      }
    }
    return { missions: [...state.missions.filter(m => m.id !== fact.mission.id), fact.mission] }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

/** Native projection exposed to the existing Web session transport. */
export const missionProjection = {
  key: 'dai', stateVersion: 1, stateSchema, init: () => ({ missions: [] }), apply: projectFact,
  wire: { viewSchema: stateSchema, view: (state: MissionState) => state },
} satisfies ProjectionDefinition<'dai', MissionState>
