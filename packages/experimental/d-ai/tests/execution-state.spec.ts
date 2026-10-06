import { describe, expect, it } from 'vitest'
import { normalizeExecutionFact } from '../src/execution-state.ts'

describe('D_AI execution persistence migration', () => {
  it('migrates a v1 lease to fenced v2 deterministically', () => {
    const fact = normalizeExecutionFact({
      version: 1,
      operation: 'ACQUIRE_LEASE',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 1,
        leases: [{
          id: 'lease-1',
          taskId: 'task-1',
          missionId: 'mission-1',
          holderId: 'owner',
          acquiredAt: '2026-10-06T10:00:00.000Z',
          expiresAt: '2026-10-06T10:10:00.000Z',
        }],
        checkpoints: [],
      },
    })

    expect(fact.version).toBe(2)
    expect(fact.ledger.leases[0]?.fence).toBe(1)
  })

  it('binds a legacy checkpoint to the only lease generation valid at that time', () => {
    const fact = normalizeExecutionFact({
      version: 1,
      operation: 'CHECKPOINT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 4,
        leases: [
          {
            id: 'lease-1',
            taskId: 'task-1',
            missionId: 'mission-1',
            holderId: 'owner',
            acquiredAt: '2026-10-06T10:00:00.000Z',
            expiresAt: '2026-10-06T10:10:00.000Z',
            releasedAt: '2026-10-06T10:05:00.000Z',
          },
          {
            id: 'lease-2',
            taskId: 'task-1',
            missionId: 'mission-1',
            holderId: 'owner',
            acquiredAt: '2026-10-06T10:06:00.000Z',
            expiresAt: '2026-10-06T10:20:00.000Z',
          },
        ],
        checkpoints: [{
          id: 'checkpoint-1',
          taskId: 'task-1',
          sequence: 1,
          at: '2026-10-06T10:08:00.000Z',
          summary: 'Legacy checkpoint',
          artifactRefs: [],
        }],
      },
    })

    expect(fact.ledger.leases.map(lease => lease.fence)).toEqual([1, 2])
    expect(fact.ledger.checkpoints[0]).toMatchObject({
      leaseId: 'lease-2',
      fence: 2,
    })
  })

  it('fails closed when a legacy checkpoint maps to multiple overlapping leases', () => {
    expect(() => normalizeExecutionFact({
      version: 1,
      operation: 'CHECKPOINT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 3,
        leases: [
          {
            id: 'lease-1',
            taskId: 'task-1',
            missionId: 'mission-1',
            holderId: 'owner',
            acquiredAt: '2026-10-06T10:00:00.000Z',
            expiresAt: '2026-10-06T10:20:00.000Z',
          },
          {
            id: 'lease-2',
            taskId: 'task-1',
            missionId: 'mission-1',
            holderId: 'owner',
            acquiredAt: '2026-10-06T10:05:00.000Z',
            expiresAt: '2026-10-06T10:25:00.000Z',
          },
        ],
        checkpoints: [{
          id: 'checkpoint-1',
          taskId: 'task-1',
          sequence: 1,
          at: '2026-10-06T10:10:00.000Z',
          summary: 'Ambiguous legacy checkpoint',
          artifactRefs: [],
        }],
      },
    })).toThrow('legacy checkpoint cannot be mapped to exactly one task lease generation')
  })
})
