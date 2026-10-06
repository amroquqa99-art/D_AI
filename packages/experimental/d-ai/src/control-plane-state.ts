/** Durable capability grants and audit chain for the D_AI control plane. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { verifyAuditChain, type AuditChain, type AuditRecord } from './audit-log.ts'
import type { CapabilityGrant } from './capability-grants.ts'

const identity = z.string().min(1).max(240)
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
const systemId = z.enum([
  'investigation',
  'scientific-research',
  'investor',
  'cybersecurity',
  'operations-intelligence',
  'innovation-discovery',
])

export const durableGrantSchema = z.object({
  id: identity,
  actorId: identity,
  systemId,
  capability: z.string().min(1).max(1000),
  scope: z.enum(['TASK', 'MISSION', 'PROJECT', 'SYSTEM', 'GLOBAL']),
  scopeId: identity.optional(),
  decision: z.enum(['ALLOW', 'DENY']),
  issuedBy: identity,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().min(1).max(12000),
}).strict()

export const durableAuditRecordSchema = z.object({
  id: identity,
  at: z.string().datetime(),
  actorId: identity,
  action: z.enum([
    'MISSION_CREATE',
    'TASK_TRANSITION',
    'CAPABILITY_GRANT',
    'CAPABILITY_DENY',
    'CROSS_SYSTEM_HANDOFF',
    'MODEL_ROUTE',
    'TRAINING_DATA_DECISION',
    'HUMAN_APPROVAL',
    'TOOL_EXECUTION',
  ]),
  systemId: systemId.optional(),
  missionId: identity.optional(),
  taskId: identity.optional(),
  subjectId: identity.optional(),
  details: z.record(z.string(), scalar),
  sequence: z.number().int().positive(),
  previousHash: z.string().regex(/^[a-f0-9]{64}$/),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

export const controlPlaneSchema = z.object({
  ownerAgentId: identity,
  revision: z.number().int().nonnegative(),
  grants: z.array(durableGrantSchema),
  auditRecords: z.array(durableAuditRecordSchema),
  auditHeadHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

export type ControlPlane = z.infer<typeof controlPlaneSchema>

export const controlPlaneFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum(['APPEND_GRANT', 'APPEND_AUDIT']),
  actorId: identity,
  control: controlPlaneSchema,
}).strict()

export type ControlPlaneFact = z.infer<typeof controlPlaneFactSchema>
export interface ControlPlaneState {
  readonly controls: readonly ControlPlane[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change D_AI control-plane fact retaining append-only capability grants and a verifiable audit hash chain for deterministic restart. */
    'd_ai/control-plane-fact': ControlPlaneFact
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiControlPlane: ControlPlaneState }
  interface SessionProjectionMap { daiControlPlane: ControlPlaneState }
}

const stateSchema: z.ZodType<ControlPlaneState> = z.object({
  controls: z.array(controlPlaneSchema),
  failure: z.string().optional(),
}).strict()

function asAuditChain(control: ControlPlane): AuditChain {
  return {
    records: control.auditRecords as readonly AuditRecord[],
    headHash: control.auditHeadHash,
  }
}

export function projectControlPlaneFact(state: ControlPlaneState, event: SessionEvent): ControlPlaneState {
  if (state.failure !== undefined || event.type !== 'd_ai/control-plane-fact') return state
  try {
    const fact = controlPlaneFactSchema.parse(event.data)
    if (fact.actorId !== fact.control.ownerAgentId) throw new Error('control-plane actor does not own control state')
    if (new Set(fact.control.grants.map(grant => grant.id)).size !== fact.control.grants.length) throw new Error('duplicate durable capability grant identity')
    if (new Set(fact.control.auditRecords.map(record => record.id)).size !== fact.control.auditRecords.length) throw new Error('duplicate durable audit identity')
    if (!verifyAuditChain(asAuditChain(fact.control))) throw new Error('durable audit chain verification failed')

    const prior = state.controls.find(item => item.ownerAgentId === fact.control.ownerAgentId)
    if ((prior?.revision ?? 0) + 1 !== fact.control.revision) throw new Error('control-plane revision is not contiguous')

    if (prior !== undefined) {
      if (JSON.stringify(fact.control.grants.slice(0, prior.grants.length)) !== JSON.stringify(prior.grants)) {
        throw new Error('prior capability grants changed or disappeared')
      }
      if (JSON.stringify(fact.control.auditRecords.slice(0, prior.auditRecords.length)) !== JSON.stringify(prior.auditRecords)) {
        throw new Error('prior audit records changed or disappeared')
      }
      if (fact.operation === 'APPEND_GRANT' && fact.control.grants.length !== prior.grants.length + 1) {
        throw new Error('APPEND_GRANT must append exactly one grant')
      }
      if (fact.operation === 'APPEND_AUDIT' && fact.control.auditRecords.length !== prior.auditRecords.length + 1) {
        throw new Error('APPEND_AUDIT must append exactly one audit record')
      }
    } else {
      if (fact.control.revision !== 1) throw new Error('control-plane must begin at revision 1')
      if (fact.operation === 'APPEND_GRANT' && fact.control.grants.length !== 1) throw new Error('initial APPEND_GRANT must contain exactly one grant')
      if (fact.operation === 'APPEND_AUDIT' && fact.control.auditRecords.length !== 1) throw new Error('initial APPEND_AUDIT must contain exactly one audit record')
    }

    for (const grant of fact.control.grants as readonly CapabilityGrant[]) {
      if (grant.scope !== 'GLOBAL' && grant.scope !== 'SYSTEM' && grant.scopeId === undefined) throw new Error('scoped durable grant requires scopeId')
    }

    return {
      controls: [...state.controls.filter(item => item.ownerAgentId !== fact.control.ownerAgentId), fact.control],
    }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

export const controlPlaneProjection = {
  key: 'daiControlPlane',
  stateVersion: 1,
  stateSchema,
  init: () => ({ controls: [] }),
  apply: projectControlPlaneFact,
  wire: { viewSchema: stateSchema, view: (state: ControlPlaneState) => state },
} satisfies ProjectionDefinition<'daiControlPlane', ControlPlaneState>
