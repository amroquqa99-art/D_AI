import { describe, expect, it } from 'vitest'
import {
  abortReservedSideEffect,
  commitSideEffectRecord,
  createReservedSideEffect,
  markSideEffectDispatched,
  markSideEffectOutcomeUnknown,
  rebindReservedSideEffect,
  reconcileUnknownSideEffect,
  sameSideEffectRequest,
  type SideEffectReservationInput,
} from '../src/side-effect-runtime.ts'

const digestA = 'a'.repeat(64)
const digestB = 'b'.repeat(64)
const digestC = 'c'.repeat(64)

function reservation(overrides: Partial<SideEffectReservationInput> = {}): SideEffectReservationInput {
  return {
    idempotencyKey: 'effect:mission-1:task-1:notify',
    taskId: 'task-1',
    missionId: 'mission-1',
    systemId: 'investigation',
    leaseId: 'lease-1',
    fence: 1,
    toolName: 'connector.notify',
    targetDigest: digestA,
    requestDigest: digestB,
    ...overrides,
  }
}

describe('D_AI side-effect runtime primitives', () => {
  it('creates a stable reservation identity and compares retries by logical request', () => {
    const input = reservation()
    const record = createReservedSideEffect(
      'effect-1',
      '2026-10-06T10:00:00.000Z',
      input,
    )

    expect(record).toMatchObject({
      id: 'effect-1',
      state: 'RESERVED',
      idempotencyKey: input.idempotencyKey,
      leaseId: 'lease-1',
      fence: 1,
    })
    expect(sameSideEffectRequest(record, input)).toBe(true)
    expect(sameSideEffectRequest(record, reservation({ requestDigest: digestC }))).toBe(false)
  })

  it('allows only a newer lease generation to rebind an undispatched reservation', () => {
    const record = createReservedSideEffect(
      'effect-1',
      '2026-10-06T10:00:00.000Z',
      reservation(),
    )

    const rebound = rebindReservedSideEffect(record, 'lease-2', 2)
    expect(rebound).toMatchObject({ state: 'RESERVED', leaseId: 'lease-2', fence: 2 })

    expect(() => rebindReservedSideEffect(record, 'lease-2', 1))
      .toThrow('newer lease fence')
    expect(() => rebindReservedSideEffect(record, 'lease-1', 2))
      .toThrow('newer lease fence')
  })

  it('moves a confirmed dispatch to COMMITTED with an immutable result digest', () => {
    const reserved = createReservedSideEffect(
      'effect-1',
      '2026-10-06T10:00:00.000Z',
      reservation(),
    )
    const dispatched = markSideEffectDispatched(reserved, '2026-10-06T10:01:00.000Z')
    const committed = commitSideEffectRecord(
      dispatched,
      '2026-10-06T10:02:00.000Z',
      digestC,
      ['artifact://connector/result.json'],
    )

    expect(committed).toMatchObject({
      state: 'COMMITTED',
      resultDigest: digestC,
      artifactRefs: ['artifact://connector/result.json'],
    })
    expect(() => markSideEffectDispatched(dispatched, '2026-10-06T10:03:00.000Z'))
      .toThrow('RESERVED')
  })

  it('does not replay an uncertain dispatch and requires explicit reconciliation data', () => {
    const reserved = createReservedSideEffect(
      'effect-1',
      '2026-10-06T10:00:00.000Z',
      reservation(),
    )
    const dispatched = markSideEffectDispatched(reserved, '2026-10-06T10:01:00.000Z')
    const unknown = markSideEffectOutcomeUnknown(dispatched, '2026-10-06T10:02:00.000Z')

    expect(unknown.state).toBe('OUTCOME_UNKNOWN')
    expect(() => commitSideEffectRecord(
      unknown,
      '2026-10-06T10:03:00.000Z',
      digestC,
    )).toThrow('DISPATCHED')

    const reconciled = reconcileUnknownSideEffect(unknown, {
      outcome: 'COMMITTED',
      at: '2026-10-06T10:04:00.000Z',
      by: 'owner',
      note: 'Connector provider confirmed the original request succeeded.',
      resultDigest: digestC,
    })

    expect(reconciled).toMatchObject({
      state: 'COMMITTED',
      unknownAt: '2026-10-06T10:02:00.000Z',
      resolution: {
        by: 'owner',
        note: 'Connector provider confirmed the original request succeeded.',
      },
    })
  })

  it('permits direct abort only before dispatch', () => {
    const reserved = createReservedSideEffect(
      'effect-1',
      '2026-10-06T10:00:00.000Z',
      reservation(),
    )
    expect(abortReservedSideEffect(reserved, '2026-10-06T10:01:00.000Z').state)
      .toBe('ABORTED')

    const dispatched = markSideEffectDispatched(reserved, '2026-10-06T10:01:00.000Z')
    expect(() => abortReservedSideEffect(dispatched, '2026-10-06T10:02:00.000Z'))
      .toThrow('RESERVED')
  })
})
