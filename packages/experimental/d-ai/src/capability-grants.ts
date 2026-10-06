/** Auditable capability grants shared by all D_AI systems. */
import type { SystemId } from './systems.ts'

export type GrantScope = 'TASK' | 'MISSION' | 'PROJECT' | 'SYSTEM' | 'GLOBAL'
export type GrantDecision = 'ALLOW' | 'DENY'

export interface CapabilityGrant {
  readonly id: string
  readonly actorId: string
  readonly systemId: SystemId
  readonly capability: string
  readonly scope: GrantScope
  readonly scopeId?: string
  readonly decision: GrantDecision
  readonly issuedBy: string
  readonly issuedAt: string
  readonly expiresAt?: string
  readonly reason: string
}

export interface CapabilityRequest {
  readonly actorId: string
  readonly systemId: SystemId
  readonly capability: string
  readonly taskId?: string
  readonly missionId?: string
  readonly projectId?: string
  readonly at: string
}

export interface AuthorizationResult {
  readonly allowed: boolean
  readonly grantId?: string
  readonly reason: string
}

function validIso(value: string): number {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid ISO timestamp: ${value}`)
  return timestamp
}

function scopeMatches(grant: CapabilityGrant, request: CapabilityRequest): boolean {
  switch (grant.scope) {
    case 'GLOBAL': return true
    case 'SYSTEM': return grant.systemId === request.systemId
    case 'PROJECT': return grant.scopeId !== undefined && grant.scopeId === request.projectId
    case 'MISSION': return grant.scopeId !== undefined && grant.scopeId === request.missionId
    case 'TASK': return grant.scopeId !== undefined && grant.scopeId === request.taskId
  }
}

function specificity(scope: GrantScope): number {
  switch (scope) {
    case 'TASK': return 5
    case 'MISSION': return 4
    case 'PROJECT': return 3
    case 'SYSTEM': return 2
    case 'GLOBAL': return 1
  }
}

/**
 * Evaluate grants fail-closed. More specific grants override broader grants;
 * at equal specificity DENY wins. Expired grants are ignored.
 */
export function authorizeCapability(
  grants: readonly CapabilityGrant[],
  request: CapabilityRequest,
): AuthorizationResult {
  const now = validIso(request.at)
  const candidates = grants
    .filter(grant => grant.actorId === request.actorId)
    .filter(grant => grant.systemId === request.systemId)
    .filter(grant => grant.capability === request.capability)
    .filter(grant => scopeMatches(grant, request))
    .filter(grant => grant.expiresAt === undefined || validIso(grant.expiresAt) > now)
    .sort((a, b) => {
      const bySpecificity = specificity(b.scope) - specificity(a.scope)
      if (bySpecificity !== 0) return bySpecificity
      if (a.decision !== b.decision) return a.decision === 'DENY' ? -1 : 1
      return validIso(b.issuedAt) - validIso(a.issuedAt)
    })

  const winner = candidates[0]
  if (winner === undefined) return Object.freeze({ allowed: false, reason: 'no-matching-grant' })

  return Object.freeze({
    allowed: winner.decision === 'ALLOW',
    grantId: winner.id,
    reason: winner.decision === 'ALLOW' ? 'explicit-grant' : 'explicit-deny',
  })
}

export function validateGrant(grant: CapabilityGrant): CapabilityGrant {
  if (grant.id.trim().length === 0) throw new Error('grant id is required')
  if (grant.actorId.trim().length === 0) throw new Error('actor id is required')
  if (grant.capability.trim().length === 0) throw new Error('capability is required')
  if (grant.issuedBy.trim().length === 0) throw new Error('issuer is required')
  if (grant.reason.trim().length === 0) throw new Error('grant reason is required')
  const issued = validIso(grant.issuedAt)
  if (grant.expiresAt !== undefined && validIso(grant.expiresAt) <= issued) throw new Error('grant expiration must be after issuance')
  if ((grant.scope === 'TASK' || grant.scope === 'MISSION' || grant.scope === 'PROJECT') && grant.scopeId === undefined) {
    throw new Error(`${grant.scope} grant requires scopeId`)
  }
  return Object.freeze({ ...grant })
}
