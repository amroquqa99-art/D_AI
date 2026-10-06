import type { SideEffectRecord } from './side-effect-state.ts'

export interface SideEffectReservationInput {
  readonly idempotencyKey: string
  readonly taskId: string
  readonly missionId: string
  readonly systemId: SideEffectRecord['systemId']
  readonly leaseId: string
  readonly fence: number
  readonly toolName: string
  readonly targetDigest: string
  readonly requestDigest: string
}

const sha256Pattern = /^[a-f0-9]{64}$/

export function assertSha256Digest(name: string, value: string): void {
  if (!sha256Pattern.test(value)) {
    throw new TypeError(name + ' must be a lowercase SHA-256 hex digest')
  }
}

export function sameSideEffectRequest(
  record: SideEffectRecord,
  input: SideEffectReservationInput,
): boolean {
  return record.idempotencyKey === input.idempotencyKey
    && record.taskId === input.taskId
    && record.missionId === input.missionId
    && record.systemId === input.systemId
    && record.toolName === input.toolName
    && record.targetDigest === input.targetDigest
    && record.requestDigest === input.requestDigest
}

export function createReservedSideEffect(
  id: string,
  at: string,
  input: SideEffectReservationInput,
): SideEffectRecord {
  assertSha256Digest('targetDigest', input.targetDigest)
  assertSha256Digest('requestDigest', input.requestDigest)
  if (
    id.trim().length === 0
    || input.idempotencyKey.trim().length === 0
    || input.taskId.trim().length === 0
    || input.missionId.trim().length === 0
    || input.leaseId.trim().length === 0
    || input.toolName.trim().length === 0
    || !Number.isSafeInteger(input.fence)
    || input.fence < 1
    || !Number.isFinite(Date.parse(at))
  ) {
    throw new TypeError('invalid side-effect reservation input')
  }

  return Object.freeze({
    id,
    idempotencyKey: input.idempotencyKey,
    taskId: input.taskId,
    missionId: input.missionId,
    systemId: input.systemId,
    leaseId: input.leaseId,
    fence: input.fence,
    toolName: input.toolName,
    targetDigest: input.targetDigest,
    requestDigest: input.requestDigest,
    state: 'RESERVED',
    createdAt: at,
    artifactRefs: Object.freeze([]),
  })
}

export function rebindReservedSideEffect(
  record: SideEffectRecord,
  leaseId: string,
  fence: number,
): SideEffectRecord {
  if (record.state !== 'RESERVED') {
    throw new Error('only RESERVED side effects can be rebound')
  }
  if (leaseId.trim().length === 0 || !Number.isSafeInteger(fence) || fence < 1) {
    throw new TypeError('invalid side-effect lease fence')
  }
  if (record.leaseId === leaseId && record.fence === fence) return record

  return Object.freeze({
    ...record,
    leaseId,
    fence,
  })
}

export function markSideEffectDispatched(
  record: SideEffectRecord,
  at: string,
): SideEffectRecord {
  if (record.state !== 'RESERVED') throw new Error('side effect must be RESERVED before dispatch')
  if (!Number.isFinite(Date.parse(at))) throw new TypeError('invalid dispatch timestamp')
  return Object.freeze({
    ...record,
    state: 'DISPATCHED',
    dispatchedAt: at,
  })
}

export function commitSideEffectRecord(
  record: SideEffectRecord,
  at: string,
  resultDigest: string,
  artifactRefs: readonly string[] = [],
): SideEffectRecord {
  if (record.state !== 'DISPATCHED') throw new Error('side effect must be DISPATCHED before commit')
  assertSha256Digest('resultDigest', resultDigest)
  if (!Number.isFinite(Date.parse(at)) || artifactRefs.some(ref => ref.trim().length === 0)) {
    throw new TypeError('invalid side-effect commit input')
  }
  return Object.freeze({
    ...record,
    state: 'COMMITTED',
    committedAt: at,
    resultDigest,
    artifactRefs: Object.freeze([...artifactRefs]),
  })
}

export function markSideEffectOutcomeUnknown(
  record: SideEffectRecord,
  at: string,
): SideEffectRecord {
  if (record.state !== 'DISPATCHED') {
    throw new Error('side effect must be DISPATCHED before outcome becomes unknown')
  }
  if (!Number.isFinite(Date.parse(at))) throw new TypeError('invalid unknown-outcome timestamp')
  return Object.freeze({
    ...record,
    state: 'OUTCOME_UNKNOWN',
    unknownAt: at,
  })
}

export function abortReservedSideEffect(
  record: SideEffectRecord,
  at: string,
): SideEffectRecord {
  if (record.state !== 'RESERVED') throw new Error('only RESERVED side effects can be aborted directly')
  if (!Number.isFinite(Date.parse(at))) throw new TypeError('invalid abort timestamp')
  return Object.freeze({
    ...record,
    state: 'ABORTED',
    abortedAt: at,
  })
}

export function reconcileUnknownSideEffect(
  record: SideEffectRecord,
  input: {
    readonly outcome: 'COMMITTED' | 'ABORTED'
    readonly at: string
    readonly by: string
    readonly note: string
    readonly resultDigest?: string
    readonly artifactRefs?: readonly string[]
  },
): SideEffectRecord {
  if (record.state !== 'OUTCOME_UNKNOWN') {
    throw new Error('only OUTCOME_UNKNOWN side effects can be reconciled')
  }
  if (
    !Number.isFinite(Date.parse(input.at))
    || input.by.trim().length === 0
    || input.note.trim().length === 0
  ) {
    throw new TypeError('invalid side-effect reconciliation input')
  }

  const resolution = Object.freeze({
    at: input.at,
    by: input.by,
    note: input.note,
  })

  if (input.outcome === 'COMMITTED') {
    if (input.resultDigest === undefined) {
      throw new TypeError('committed reconciliation requires resultDigest')
    }
    assertSha256Digest('resultDigest', input.resultDigest)
    const artifactRefs = input.artifactRefs ?? []
    if (artifactRefs.some(ref => ref.trim().length === 0)) {
      throw new TypeError('invalid reconciliation artifact reference')
    }
    return Object.freeze({
      ...record,
      state: 'COMMITTED',
      committedAt: input.at,
      resultDigest: input.resultDigest,
      artifactRefs: Object.freeze([...artifactRefs]),
      resolution,
    })
  }

  return Object.freeze({
    ...record,
    state: 'ABORTED',
    abortedAt: input.at,
    resolution,
  })
}
