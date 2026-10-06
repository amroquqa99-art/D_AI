/** Durable idempotency journal for external side effects. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const identity = z.string().min(1).max(240)
const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const systemId = z.enum([
  'investigation',
  'scientific-research',
  'investor',
  'cybersecurity',
  'operations-intelligence',
  'innovation-discovery',
])

export const sideEffectRecordSchema = z.object({
  id: identity,
  idempotencyKey: z.string().min(1).max(512),
  taskId: identity,
  missionId: identity,
  systemId,
  leaseId: identity,
  fence: z.number().int().positive(),
  toolName: z.string().min(1).max(1000),
  targetDigest: sha256,
  requestDigest: sha256,
  state: z.enum(['RESERVED', 'DISPATCHED', 'COMMITTED', 'OUTCOME_UNKNOWN', 'ABORTED']),
  createdAt: z.string().datetime(),
  dispatchedAt: z.string().datetime().optional(),
  committedAt: z.string().datetime().optional(),
  unknownAt: z.string().datetime().optional(),
  abortedAt: z.string().datetime().optional(),
  resultDigest: sha256.optional(),
  artifactRefs: z.array(z.string().min(1).max(4000)).default([]),
  resolution: z.object({
    at: z.string().datetime(),
    by: identity,
    note: z.string().min(1).max(12000),
  }).strict().optional(),
}).strict()

export const sideEffectLedgerSchema = z.object({
  ownerAgentId: identity,
  revision: z.number().int().nonnegative(),
  records: z.array(sideEffectRecordSchema),
}).strict()

export type SideEffectRecord = z.infer<typeof sideEffectRecordSchema>
export type SideEffectLedger = z.infer<typeof sideEffectLedgerSchema>

export const sideEffectFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum([
    'RESERVE',
    'MARK_DISPATCHED',
    'COMMIT',
    'MARK_UNKNOWN',
    'ABORT',
    'RECONCILE',
  ]),
  actorId: identity,
  ledger: sideEffectLedgerSchema,
}).strict()

export type SideEffectFact = z.infer<typeof sideEffectFactSchema>
export interface SideEffectState {
  readonly ledgers: readonly SideEffectLedger[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change D_AI side-effect journal fact. DISPATCHED records are never safe to replay automatically without connector-level idempotency or explicit reconciliation. */
    'd_ai/side-effect-fact': SideEffectFact
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiSideEffects: SideEffectState }
  interface SessionProjectionMap { daiSideEffects: SideEffectState }
}

const stateSchema: z.ZodType<SideEffectState> = z.object({
  ledgers: z.array(sideEffectLedgerSchema),
  failure: z.string().optional(),
}).strict()

const immutableFields = [
  'id',
  'idempotencyKey',
  'taskId',
  'missionId',
  'systemId',
  'leaseId',
  'fence',
  'toolName',
  'targetDigest',
  'requestDigest',
  'createdAt',
] as const

function changedIndexes<T>(before: readonly T[], after: readonly T[]): number[] {
  if (before.length !== after.length) return []
  const changed: number[] = []
  for (let index = 0; index < before.length; index += 1) {
    if (JSON.stringify(before[index]) !== JSON.stringify(after[index])) changed.push(index)
  }
  return changed
}

function assertRecordShape(record: SideEffectRecord): void {
  const timestamps = [
    record.createdAt,
    record.dispatchedAt,
    record.committedAt,
    record.unknownAt,
    record.abortedAt,
    record.resolution?.at,
  ].filter((value): value is string => value !== undefined)
  if (timestamps.some(value => !Number.isFinite(Date.parse(value)))) {
    throw new Error('invalid side-effect timestamp')
  }

  if (record.state === 'RESERVED') {
    if (
      record.dispatchedAt !== undefined
      || record.committedAt !== undefined
      || record.unknownAt !== undefined
      || record.abortedAt !== undefined
      || record.resultDigest !== undefined
      || record.resolution !== undefined
    ) throw new Error('RESERVED side effect contains later-state fields')
  }

  if (record.state === 'DISPATCHED') {
    if (
      record.dispatchedAt === undefined
      || record.committedAt !== undefined
      || record.unknownAt !== undefined
      || record.abortedAt !== undefined
      || record.resultDigest !== undefined
      || record.resolution !== undefined
    ) throw new Error('DISPATCHED side effect has invalid fields')
  }

  if (record.state === 'OUTCOME_UNKNOWN') {
    if (
      record.dispatchedAt === undefined
      || record.unknownAt === undefined
      || record.committedAt !== undefined
      || record.abortedAt !== undefined
      || record.resultDigest !== undefined
      || record.resolution !== undefined
    ) throw new Error('OUTCOME_UNKNOWN side effect has invalid fields')
  }

  if (record.state === 'COMMITTED') {
    if (
      record.dispatchedAt === undefined
      || record.committedAt === undefined
      || record.resultDigest === undefined
      || record.unknownAt !== undefined
      || record.abortedAt !== undefined
    ) throw new Error('COMMITTED side effect has invalid fields')
  }

  if (record.state === 'ABORTED') {
    if (
      record.abortedAt === undefined
      || record.committedAt !== undefined
      || record.resultDigest !== undefined
    ) throw new Error('ABORTED side effect has invalid fields')
  }

  const ordered = [
    record.createdAt,
    record.dispatchedAt,
    record.unknownAt,
    record.committedAt,
    record.abortedAt,
    record.resolution?.at,
  ].filter((value): value is string => value !== undefined)
  for (let index = 1; index < ordered.length; index += 1) {
    if (Date.parse(ordered[index]!) < Date.parse(ordered[index - 1]!)) {
      throw new Error('side-effect timestamps are not monotonic')
    }
  }
}

function assertTransition(
  operation: SideEffectFact['operation'],
  before: SideEffectRecord,
  after: SideEffectRecord,
): void {
  for (const field of immutableFields) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      throw new Error('immutable side-effect field changed: ' + field)
    }
  }

  const allowed =
    (operation === 'MARK_DISPATCHED' && before.state === 'RESERVED' && after.state === 'DISPATCHED')
    || (operation === 'COMMIT' && before.state === 'DISPATCHED' && after.state === 'COMMITTED')
    || (operation === 'MARK_UNKNOWN' && before.state === 'DISPATCHED' && after.state === 'OUTCOME_UNKNOWN')
    || (operation === 'ABORT' && before.state === 'RESERVED' && after.state === 'ABORTED')
    || (
      operation === 'RECONCILE'
      && before.state === 'OUTCOME_UNKNOWN'
      && (after.state === 'COMMITTED' || after.state === 'ABORTED')
      && after.resolution !== undefined
    )

  if (!allowed) {
    throw new Error(
      'invalid side-effect transition: ' + operation + ' ' + before.state + ' -> ' + after.state,
    )
  }
}

export function projectSideEffectFact(
  state: SideEffectState,
  event: SessionEvent,
): SideEffectState {
  if (state.failure !== undefined || event.type !== 'd_ai/side-effect-fact') return state

  try {
    const fact = sideEffectFactSchema.parse(event.data)
    if (fact.actorId !== fact.ledger.ownerAgentId) {
      throw new Error('side-effect fact actor does not own ledger')
    }

    if (new Set(fact.ledger.records.map(record => record.id)).size !== fact.ledger.records.length) {
      throw new Error('duplicate side-effect record identity')
    }
    if (new Set(fact.ledger.records.map(record => record.idempotencyKey)).size !== fact.ledger.records.length) {
      throw new Error('duplicate side-effect idempotency key')
    }
    for (const record of fact.ledger.records) assertRecordShape(record)

    const prior = state.ledgers.find(item => item.ownerAgentId === fact.ledger.ownerAgentId)
    if ((prior?.revision ?? 0) + 1 !== fact.ledger.revision) {
      throw new Error('side-effect ledger revision is not contiguous')
    }

    if (prior === undefined) {
      if (
        fact.operation !== 'RESERVE'
        || fact.ledger.revision !== 1
        || fact.ledger.records.length !== 1
        || fact.ledger.records[0]!.state !== 'RESERVED'
      ) {
        throw new Error('side-effect ledger must begin by reserving exactly one effect')
      }
    } else if (fact.operation === 'RESERVE') {
      if (JSON.stringify(fact.ledger.records.slice(0, prior.records.length)) !== JSON.stringify(prior.records)) {
        throw new Error('prior side-effect records changed during reservation')
      }
      if (fact.ledger.records.length !== prior.records.length + 1) {
        throw new Error('RESERVE must append exactly one side-effect record')
      }
      if (fact.ledger.records.at(-1)!.state !== 'RESERVED') {
        throw new Error('new side-effect reservation must begin in RESERVED state')
      }
    } else {
      const changed = changedIndexes(prior.records, fact.ledger.records)
      if (changed.length !== 1) {
        throw new Error(fact.operation + ' must update exactly one side-effect record')
      }
      const before = prior.records[changed[0]!]!
      const after = fact.ledger.records[changed[0]!]!
      assertTransition(fact.operation, before, after)
    }

    return {
      ledgers: [
        ...state.ledgers.filter(item => item.ownerAgentId !== fact.ledger.ownerAgentId),
        fact.ledger,
      ],
    }
  } catch (error) {
    return {
      ...state,
      failure: error instanceof Error ? error.message : String(error),
    }
  }
}

export const sideEffectProjection = {
  key: 'daiSideEffects',
  stateVersion: 1,
  stateSchema,
  init: () => ({ ledgers: [] }),
  apply: projectSideEffectFact,
  wire: {
    viewSchema: stateSchema,
    view: (state: SideEffectState) => state,
  },
} satisfies ProjectionDefinition<'daiSideEffects', SideEffectState>
