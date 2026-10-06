import { describe, expect, it } from 'vitest'
import { createAuditChain, verifyAuditChain } from '../src/audit-log.ts'
import { CROSS_SYSTEM_TASK_EXECUTION_CAPABILITY, authorizeCrossSystemHandoff, deriveTaskHandoffSources } from '../src/cross-system.ts'
import type { CapabilityGrant } from '../src/capability-grants.ts'
import type { MissionTask } from '../src/task-dag.ts'

const grant: CapabilityGrant = {
  id: 'g1',
  actorId: 'agent-1',
  systemId: 'investor',
  capability: 'financial.company-analysis',
  scope: 'MISSION',
  scopeId: 'm1',
  decision: 'ALLOW',
  issuedBy: 'owner',
  issuedAt: '2026-10-06T00:00:00Z',
  reason: 'investigation needs financial analysis',
}


function task(
  id: string,
  systemId: MissionTask['systemId'],
  dependsOn: readonly string[] = [],
): MissionTask {
  return {
    id,
    missionId: 'm1',
    systemId,
    title: id,
    dependsOn,
    state: 'PENDING',
    priority: 0,
    attempt: 0,
    maxAttempts: 3,
  }
}

describe('D_AI cross-system handoff', () => {

  it('derives task handoff sources from durable dependency systems', () => {
    expect(CROSS_SYSTEM_TASK_EXECUTION_CAPABILITY).toBe('runtime.task-execute')

    expect(deriveTaskHandoffSources(
      'investigation',
      task('financial', 'investor'),
      [],
    )).toEqual(['investigation'])

    const target = task('synthesis', 'investor', ['evidence', 'method', 'same-target'])
    expect(deriveTaskHandoffSources('investigation', target, [
      task('evidence', 'investigation'),
      task('method', 'scientific-research'),
      task('same-target', 'investor'),
    ])).toEqual(['investigation', 'scientific-research'])

    expect(() => deriveTaskHandoffSources(
      'investigation',
      task('broken', 'investor', ['missing']),
      [],
    )).toThrow('missing from durable task state')
  })

  it('requires declared system collaboration plus an explicit capability grant', () => {
    const handoff = authorizeCrossSystemHandoff([grant], createAuditChain(), {
      id: 'x1',
      actorId: 'agent-1',
      fromSystem: 'investigation',
      toSystem: 'investor',
      capability: 'financial.company-analysis',
      missionId: 'm1',
      at: '2026-10-06T00:10:00Z',
      reason: 'analyze company accounts',
    })

    expect(handoff.authorizedByGrant).toBe('g1')
    expect(handoff.audit.records[0]?.action).toBe('CROSS_SYSTEM_HANDOFF')
    expect(verifyAuditChain(handoff.audit)).toBe(true)
  })

  it('fails closed without a grant', () => {
    expect(() => authorizeCrossSystemHandoff([], createAuditChain(), {
      id: 'x1',
      actorId: 'agent-1',
      fromSystem: 'investigation',
      toSystem: 'investor',
      capability: 'financial.company-analysis',
      missionId: 'm1',
      at: '2026-10-06T00:10:00Z',
      reason: 'analyze company accounts',
    })).toThrow('denied')
  })

  it('rejects undeclared collaboration edges even if a grant exists', () => {
    const unsupported: CapabilityGrant = { ...grant, systemId: 'innovation-discovery' }
    expect(() => authorizeCrossSystemHandoff([unsupported], createAuditChain(), {
      id: 'x1',
      actorId: 'agent-1',
      fromSystem: 'investor',
      toSystem: 'innovation-discovery',
      capability: 'financial.company-analysis',
      missionId: 'm1',
      at: '2026-10-06T00:10:00Z',
      reason: 'unsupported edge',
    })).toThrow('does not declare cross-system access')
  })
})
