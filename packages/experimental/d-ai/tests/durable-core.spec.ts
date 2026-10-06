import { describe, expect, it } from 'vitest'
import { appendAuditRecord, createAuditChain } from '../src/audit-log.ts'
import { projectControlPlaneFact, type ControlPlaneState } from '../src/control-plane-state.ts'
import { projectTaskLedgerFact, type TaskLedgerState } from '../src/task-ledger-state.ts'

describe('D_AI durable shared core projections', () => {
  it('replays task DAG state and rejects mutation of immutable task identity', () => {
    let state: TaskLedgerState = { ledgers: [] }
    const baseTask = {
      id: 'task-1',
      missionId: 'mission-1',
      systemId: 'investigation' as const,
      title: 'Collect evidence',
      dependsOn: [],
      state: 'PENDING' as const,
      priority: 5,
      attempt: 0,
      maxAttempts: 2,
    }

    state = projectTaskLedgerFact(state, {
      type: 'd_ai/task-ledger-fact',
      data: {
        version: 1,
        operation: 'ADD_TASKS',
        actorId: 'owner',
        ledger: { ownerAgentId: 'owner', revision: 1, tasks: [baseTask] },
      },
    } as never)

    expect(state.failure).toBeUndefined()
    expect(state.ledgers[0]?.tasks[0]?.state).toBe('PENDING')

    state = projectTaskLedgerFact(state, {
      type: 'd_ai/task-ledger-fact',
      data: {
        version: 1,
        operation: 'TRANSITION',
        actorId: 'owner',
        ledger: {
          ownerAgentId: 'owner',
          revision: 2,
          tasks: [{ ...baseTask, state: 'READY' }],
        },
      },
    } as never)

    expect(state.failure).toBeUndefined()
    expect(state.ledgers[0]?.tasks[0]?.state).toBe('READY')

    const corrupt = projectTaskLedgerFact(state, {
      type: 'd_ai/task-ledger-fact',
      data: {
        version: 1,
        operation: 'TRANSITION',
        actorId: 'owner',
        ledger: {
          ownerAgentId: 'owner',
          revision: 3,
          tasks: [{ ...baseTask, title: 'Silently rewritten task', state: 'RUNNING' }],
        },
      },
    } as never)

    expect(corrupt.failure).toContain('immutable durable task field changed')
  })

  it('persists grants only with matching audit records and verifies the hash chain', () => {
    let state: ControlPlaneState = { controls: [] }
    const grant = {
      id: 'grant-1',
      actorId: 'owner',
      systemId: 'investigation' as const,
      capability: 'web.fetch',
      scope: 'MISSION' as const,
      scopeId: 'mission-1',
      decision: 'ALLOW' as const,
      issuedBy: 'owner',
      issuedAt: '2026-10-06T00:00:00.000Z',
      reason: 'approved mission research',
    }

    const firstAudit = appendAuditRecord(createAuditChain(), {
      id: 'audit-1',
      at: '2026-10-06T00:00:00.000Z',
      actorId: 'owner',
      action: 'CAPABILITY_GRANT',
      systemId: 'investigation',
      subjectId: grant.id,
      details: {
        capability: grant.capability,
        scope: grant.scope,
        decision: grant.decision,
        reason: grant.reason,
      },
    })

    state = projectControlPlaneFact(state, {
      type: 'd_ai/control-plane-fact',
      data: {
        version: 1,
        operation: 'APPEND_GRANT',
        actorId: 'owner',
        control: {
          ownerAgentId: 'owner',
          revision: 1,
          grants: [grant],
          auditRecords: [...firstAudit.records],
          auditHeadHash: firstAudit.headHash,
        },
      },
    } as never)

    expect(state.failure).toBeUndefined()
    expect(state.controls[0]?.grants[0]?.id).toBe('grant-1')

    const secondAudit = appendAuditRecord(firstAudit, {
      id: 'audit-2',
      at: '2026-10-06T00:01:00.000Z',
      actorId: 'owner',
      action: 'TOOL_EXECUTION',
      systemId: 'investigation',
      missionId: 'mission-1',
      details: { tool: 'web.fetch' },
    })

    state = projectControlPlaneFact(state, {
      type: 'd_ai/control-plane-fact',
      data: {
        version: 1,
        operation: 'APPEND_AUDIT',
        actorId: 'owner',
        control: {
          ownerAgentId: 'owner',
          revision: 2,
          grants: [grant],
          auditRecords: [...secondAudit.records],
          auditHeadHash: secondAudit.headHash,
        },
      },
    } as never)

    expect(state.failure).toBeUndefined()
    expect(state.controls[0]?.auditRecords).toHaveLength(2)

    const tamperedRecords = state.controls[0]!.auditRecords.map((record, index) =>
      index === 0 ? { ...record, actorId: 'forged-actor' } : record)

    const corrupt = projectControlPlaneFact(state, {
      type: 'd_ai/control-plane-fact',
      data: {
        version: 1,
        operation: 'APPEND_AUDIT',
        actorId: 'owner',
        control: {
          ownerAgentId: 'owner',
          revision: 3,
          grants: [grant],
          auditRecords: tamperedRecords,
          auditHeadHash: state.controls[0]!.auditHeadHash,
        },
      },
    } as never)

    expect(corrupt.failure).toContain('audit chain verification failed')
  })
})
