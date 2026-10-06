import { describe, expect, it } from 'vitest'
import {
  locateActiveLeaseFence,
  locateLeaseFence,
  nextLeaseFence,
} from '../src/execution-fencing.ts'
import type { TaskLease } from '../src/execution-state.ts'

function lease(
  id: string,
  taskId: string,
  fence: number,
  overrides: Partial<TaskLease> = {},
): TaskLease {
  return {
    id,
    taskId,
    missionId: 'mission-1',
    holderId: 'owner',
    fence,
    acquiredAt: '2026-10-06T10:00:00.000Z',
    expiresAt: '2026-10-06T10:10:00.000Z',
    ...overrides,
  }
}

describe('D_AI execution fencing', () => {
  it('allocates a monotonically increasing fence per task', () => {
    const leases = [
      lease('a1', 'task-a', 1),
      lease('b1', 'task-b', 1),
      lease('a2', 'task-a', 2, { releasedAt: '2026-10-06T10:05:00.000Z' }),
    ]

    expect(nextLeaseFence(leases, 'task-a')).toBe(3)
    expect(nextLeaseFence(leases, 'task-b')).toBe(2)
    expect(nextLeaseFence(leases, 'task-c')).toBe(1)
  })

  it('requires exact task, lease id and fence identity', () => {
    const leases = [lease('lease-2', 'task-a', 2)]

    expect(locateLeaseFence(leases, {
      taskId: 'task-a',
      leaseId: 'lease-2',
      fence: 2,
    })?.index).toBe(0)

    expect(locateLeaseFence(leases, {
      taskId: 'task-a',
      leaseId: 'lease-2',
      fence: 1,
    })).toBeUndefined()
  })

  it('rejects released, expired, wrong-holder and stale generations', () => {
    const active = lease('lease-2', 'task-a', 2)

    expect(locateActiveLeaseFence(
      [active],
      { taskId: 'task-a', leaseId: 'lease-2', fence: 2 },
      'owner',
      Date.parse('2026-10-06T10:05:00.000Z'),
    )?.lease.id).toBe('lease-2')

    expect(locateActiveLeaseFence(
      [{ ...active, releasedAt: '2026-10-06T10:04:00.000Z' }],
      { taskId: 'task-a', leaseId: 'lease-2', fence: 2 },
      'owner',
      Date.parse('2026-10-06T10:05:00.000Z'),
    )).toBeUndefined()

    expect(locateActiveLeaseFence(
      [active],
      { taskId: 'task-a', leaseId: 'lease-2', fence: 2 },
      'other-executor',
      Date.parse('2026-10-06T10:05:00.000Z'),
    )).toBeUndefined()

    expect(locateActiveLeaseFence(
      [active],
      { taskId: 'task-a', leaseId: 'lease-2', fence: 2 },
      'owner',
      Date.parse('2026-10-06T10:10:00.000Z'),
    )).toBeUndefined()

    expect(locateActiveLeaseFence(
      [active],
      { taskId: 'task-a', leaseId: 'lease-1', fence: 1 },
      'owner',
      Date.parse('2026-10-06T10:05:00.000Z'),
    )).toBeUndefined()
  })
})
