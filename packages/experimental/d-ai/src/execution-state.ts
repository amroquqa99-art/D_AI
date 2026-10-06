/** Durable execution leases and checkpoints for long-running D_AI tasks. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const identity = z.string().min(1).max(240)

export const taskLeaseSchema = z.object({
  id: identity,
  taskId: identity,
  missionId: identity,
  holderId: identity,
  acquiredAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  releasedAt: z.string().datetime().optional(),
}).strict()

export const taskCheckpointSchema = z.object({
  id: identity,
  taskId: identity,
  sequence: z.number().int().positive(),
  at: z.string().datetime(),
  summary: z.string().min(1).max(24000),
  artifactRefs: z.array(z.string().min(1).max(4000)),
}).strict()

export const executionLedgerSchema = z.object({
  ownerAgentId: identity,
  revision: z.number().int().nonnegative(),
  leases: z.array(taskLeaseSchema),
  checkpoints: z.array(taskCheckpointSchema),
}).strict()

export type TaskLease = z.infer<typeof taskLeaseSchema>
export type TaskCheckpoint = z.infer<typeof taskCheckpointSchema>
export type ExecutionLedger = z.infer<typeof executionLedgerSchema>

export const executionFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum(['ACQUIRE_LEASE', 'RENEW_LEASE', 'RELEASE_LEASE', 'CHECKPOINT']),
  actorId: identity,
  ledger: executionLedgerSchema,
}).strict()

export type ExecutionFact = z.infer<typeof executionFactSchema>
export interface ExecutionState {
  readonly ledgers: readonly ExecutionLedger[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change D_AI execution fact retaining task leases and checkpoints so long-running work can resume deterministically after restart. */
    'd_ai/execution-fact': ExecutionFact
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiExecution: ExecutionState }
  interface SessionProjectionMap { daiExecution: ExecutionState }
}

const stateSchema: z.ZodType<ExecutionState> = z.object({
  ledgers: z.array(executionLedgerSchema),
  failure: z.string().optional(),
}).strict()

function assertLeaseTimes(lease: TaskLease): void {
  const acquired = Date.parse(lease.acquiredAt)
  const expires = Date.parse(lease.expiresAt)
  if (expires <= acquired) throw new Error('task lease expiry must follow acquisition')
  if (lease.releasedAt !== undefined && Date.parse(lease.releasedAt) < acquired) {
    throw new Error('task lease release precedes acquisition')
  }
}

function changedIndexes<T>(before: readonly T[], after: readonly T[]): number[] {
  if (before.length !== after.length) return []
  const changed: number[] = []
  for (let index = 0; index < before.length; index += 1) {
    if (JSON.stringify(before[index]) !== JSON.stringify(after[index])) changed.push(index)
  }
  return changed
}

export function projectExecutionFact(state: ExecutionState, event: SessionEvent): ExecutionState {
  if (state.failure !== undefined || event.type !== 'd_ai/execution-fact') return state
  try {
    const fact = executionFactSchema.parse(event.data)
    if (fact.actorId !== fact.ledger.ownerAgentId) throw new Error('execution fact actor does not own ledger')
    if (new Set(fact.ledger.leases.map(lease => lease.id)).size !== fact.ledger.leases.length) throw new Error('duplicate task lease identity')
    if (new Set(fact.ledger.checkpoints.map(checkpoint => checkpoint.id)).size !== fact.ledger.checkpoints.length) throw new Error('duplicate task checkpoint identity')
    for (const lease of fact.ledger.leases) assertLeaseTimes(lease)

    const prior = state.ledgers.find(item => item.ownerAgentId === fact.ledger.ownerAgentId)
    if ((prior?.revision ?? 0) + 1 !== fact.ledger.revision) throw new Error('execution ledger revision is not contiguous')

    if (prior === undefined) {
      if (fact.ledger.revision !== 1) throw new Error('execution ledger must begin at revision 1')
      if (fact.operation !== 'ACQUIRE_LEASE' || fact.ledger.leases.length !== 1 || fact.ledger.checkpoints.length !== 0) {
        throw new Error('execution ledger must begin by acquiring exactly one lease')
      }
    } else if (fact.operation === 'ACQUIRE_LEASE') {
      if (JSON.stringify(fact.ledger.leases.slice(0, prior.leases.length)) !== JSON.stringify(prior.leases)) {
        throw new Error('prior task leases changed while acquiring lease')
      }
      if (fact.ledger.leases.length !== prior.leases.length + 1 || JSON.stringify(fact.ledger.checkpoints) !== JSON.stringify(prior.checkpoints)) {
        throw new Error('ACQUIRE_LEASE must append exactly one lease')
      }
      const lease = fact.ledger.leases.at(-1)!
      const acquired = Date.parse(lease.acquiredAt)
      const conflicting = prior.leases.some(previous =>
        previous.taskId === lease.taskId
        && previous.releasedAt === undefined
        && Date.parse(previous.expiresAt) > acquired)
      if (conflicting) throw new Error('task already has an active execution lease')
    } else if (fact.operation === 'RENEW_LEASE') {
      if (JSON.stringify(fact.ledger.checkpoints) !== JSON.stringify(prior.checkpoints)) throw new Error('RENEW_LEASE cannot change checkpoints')
      const changed = changedIndexes(prior.leases, fact.ledger.leases)
      if (changed.length !== 1) throw new Error('RENEW_LEASE must update exactly one lease')
      const before = prior.leases[changed[0]!]!
      const after = fact.ledger.leases[changed[0]!]!
      for (const field of ['id', 'taskId', 'missionId', 'holderId', 'acquiredAt', 'releasedAt'] as const) {
        if (before[field] !== after[field]) throw new Error('immutable task lease field changed: ' + field)
      }
      if (before.releasedAt !== undefined) throw new Error('released lease cannot be renewed')
      if (Date.parse(after.expiresAt) <= Date.parse(before.expiresAt)) throw new Error('renewed lease must extend expiry')
    } else if (fact.operation === 'RELEASE_LEASE') {
      if (JSON.stringify(fact.ledger.checkpoints) !== JSON.stringify(prior.checkpoints)) throw new Error('RELEASE_LEASE cannot change checkpoints')
      const changed = changedIndexes(prior.leases, fact.ledger.leases)
      if (changed.length !== 1) throw new Error('RELEASE_LEASE must update exactly one lease')
      const before = prior.leases[changed[0]!]!
      const after = fact.ledger.leases[changed[0]!]!
      for (const field of ['id', 'taskId', 'missionId', 'holderId', 'acquiredAt', 'expiresAt'] as const) {
        if (before[field] !== after[field]) throw new Error('immutable task lease field changed: ' + field)
      }
      if (before.releasedAt !== undefined || after.releasedAt === undefined) throw new Error('lease must transition from active to released')
    } else if (fact.operation === 'CHECKPOINT') {
      if (JSON.stringify(fact.ledger.leases) !== JSON.stringify(prior.leases)) throw new Error('CHECKPOINT cannot change leases')
      if (JSON.stringify(fact.ledger.checkpoints.slice(0, prior.checkpoints.length)) !== JSON.stringify(prior.checkpoints)) {
        throw new Error('prior task checkpoints changed')
      }
      if (fact.ledger.checkpoints.length !== prior.checkpoints.length + 1) throw new Error('CHECKPOINT must append exactly one checkpoint')
      const checkpoint = fact.ledger.checkpoints.at(-1)!
      const priorSequence = prior.checkpoints
        .filter(item => item.taskId === checkpoint.taskId)
        .reduce((max, item) => Math.max(max, item.sequence), 0)
      if (checkpoint.sequence !== priorSequence + 1) throw new Error('task checkpoint sequence is not contiguous')
    }

    return {
      ledgers: [...state.ledgers.filter(item => item.ownerAgentId !== fact.ledger.ownerAgentId), fact.ledger],
    }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

export const executionProjection = {
  key: 'daiExecution',
  stateVersion: 1,
  stateSchema,
  init: () => ({ ledgers: [] }),
  apply: projectExecutionFact,
  wire: { viewSchema: stateSchema, view: (state: ExecutionState) => state },
} satisfies ProjectionDefinition<'daiExecution', ExecutionState>
