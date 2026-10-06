import { describe, expect, it } from 'vitest'
import { authorizeCapability, validateGrant, type CapabilityGrant } from '../src/capability-grants.ts'

function grant(overrides: Partial<CapabilityGrant> = {}): CapabilityGrant {
  return {
    id: overrides.id ?? 'g1',
    actorId: overrides.actorId ?? 'actor-1',
    systemId: overrides.systemId ?? 'investigation',
    capability: overrides.capability ?? 'web.fetch',
    scope: overrides.scope ?? 'GLOBAL',
    scopeId: overrides.scopeId,
    decision: overrides.decision ?? 'ALLOW',
    issuedBy: overrides.issuedBy ?? 'owner',
    issuedAt: overrides.issuedAt ?? '2026-10-06T00:00:00Z',
    expiresAt: overrides.expiresAt,
    reason: overrides.reason ?? 'approved',
  }
}

describe('D_AI capability grants', () => {
  it('fails closed without a matching grant', () => {
    expect(authorizeCapability([], {
      actorId: 'actor-1', systemId: 'investigation', capability: 'web.fetch', at: '2026-10-06T01:00:00Z',
    })).toEqual({ allowed: false, reason: 'no-matching-grant' })
  })

  it('prefers specific mission grants over broader global grants', () => {
    const result = authorizeCapability([
      grant({ id: 'global-deny', decision: 'DENY' }),
      grant({ id: 'mission-allow', scope: 'MISSION', scopeId: 'm1', decision: 'ALLOW' }),
    ], {
      actorId: 'actor-1', systemId: 'investigation', capability: 'web.fetch', missionId: 'm1', at: '2026-10-06T01:00:00Z',
    })
    expect(result).toEqual({ allowed: true, grantId: 'mission-allow', reason: 'explicit-grant' })
  })

  it('lets DENY win at equal specificity and ignores expired grants', () => {
    const result = authorizeCapability([
      grant({ id: 'allow', scope: 'SYSTEM', decision: 'ALLOW' }),
      grant({ id: 'deny', scope: 'SYSTEM', decision: 'DENY' }),
      grant({ id: 'expired', scope: 'TASK', scopeId: 't1', decision: 'ALLOW', expiresAt: '2026-10-06T00:30:00Z' }),
    ], {
      actorId: 'actor-1', systemId: 'investigation', capability: 'web.fetch', taskId: 't1', at: '2026-10-06T01:00:00Z',
    })
    expect(result).toEqual({ allowed: false, grantId: 'deny', reason: 'explicit-deny' })
  })

  it('validates scoped and expiring grants', () => {
    expect(() => validateGrant(grant({ scope: 'MISSION' }))).toThrow('scopeId')
    expect(() => validateGrant(grant({ expiresAt: '2026-10-05T23:00:00Z' }))).toThrow('expiration')
    expect(validateGrant(grant({ scope: 'TASK', scopeId: 't1' })).scopeId).toBe('t1')
  })
})
