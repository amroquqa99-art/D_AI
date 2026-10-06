import type { TaskLease } from './execution-state.ts'

export interface LeaseFenceIdentity {
  readonly taskId: string
  readonly leaseId: string
  readonly fence: number
}

export interface LocatedLease {
  readonly index: number
  readonly lease: TaskLease
}

/** Allocate the next monotonically increasing fence for one logical task. */
export function nextLeaseFence(
  leases: readonly TaskLease[],
  taskId: string,
): number {
  return leases
    .filter(lease => lease.taskId === taskId)
    .reduce((max, lease) => Math.max(max, lease.fence), 0) + 1
}

/** Locate one exact lease generation; task identity alone is intentionally insufficient. */
export function locateLeaseFence(
  leases: readonly TaskLease[],
  identity: LeaseFenceIdentity,
): LocatedLease | undefined {
  const index = leases.findIndex(lease =>
    lease.id === identity.leaseId
    && lease.taskId === identity.taskId
    && lease.fence === identity.fence)

  if (index < 0) return undefined
  return Object.freeze({ index, lease: leases[index]! })
}

/**
 * Resolve the exact currently valid execution generation.
 *
 * A stale worker must not be able to act on a newer lease merely because both
 * executions belong to the same root Agent.
 */
export function locateActiveLeaseFence(
  leases: readonly TaskLease[],
  identity: LeaseFenceIdentity,
  holderId: string,
  nowMs: number,
): LocatedLease | undefined {
  const located = locateLeaseFence(leases, identity)
  if (located === undefined) return undefined

  const { lease } = located
  if (
    lease.holderId !== holderId
    || lease.releasedAt !== undefined
    || Date.parse(lease.expiresAt) <= nowMs
  ) return undefined

  return located
}
