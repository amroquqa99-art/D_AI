import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  projectSideEffectFact,
  type SideEffectState,
} from '../src/side-effect-state.ts'

const digestA = 'a'.repeat(64)
const digestB = 'b'.repeat(64)
const digestC = 'c'.repeat(64)

function event(data: unknown): SessionEvent {
  return {
    type: 'd_ai/side-effect-fact',
    data,
    id: 'event-1',
    timestamp: '2026-10-06T10:00:00.000Z',
  } as unknown as SessionEvent
}

function reserveFact() {
  return {
    version: 1 as const,
    operation: 'RESERVE' as const,
    actorId: 'owner',
    ledger: {
      ownerAgentId: 'owner',
      revision: 1,
      records: [{
        id: 'effect-1',
        idempotencyKey: 'effect:key',
        taskId: 'task-1',
        missionId: 'mission-1',
        systemId: 'investigation' as const,
        leaseId: 'lease-1',
        fence: 1,
        toolName: 'fixture.mutable',
        targetDigest: digestA,
        requestDigest: digestB,
        state: 'RESERVED' as const,
        createdAt: '2026-10-06T10:00:00.000Z',
        artifactRefs: [],
      }],
    },
  }
}

describe('D_AI side-effect projection', () => {
  it('accepts a valid reserve then dispatch and commit sequence', () => {
    const initial: SideEffectState = { ledgers: [] }
    const reserved = projectSideEffectFact(initial, event(reserveFact()))
    expect(reserved.failure).toBeUndefined()

    const dispatchedRecord = {
      ...reserveFact().ledger.records[0],
      state: 'DISPATCHED' as const,
      dispatchedAt: '2026-10-06T10:01:00.000Z',
    }
    const dispatched = projectSideEffectFact(reserved, event({
      version: 1,
      operation: 'MARK_DISPATCHED',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 2,
        records: [dispatchedRecord],
      },
    }))
    expect(dispatched.failure).toBeUndefined()

    const committed = projectSideEffectFact(dispatched, event({
      version: 1,
      operation: 'COMMIT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 3,
        records: [{
          ...dispatchedRecord,
          state: 'COMMITTED',
          committedAt: '2026-10-06T10:02:00.000Z',
          resultDigest: digestC,
        }],
      },
    }))
    expect(committed.failure).toBeUndefined()
    expect(committed.ledgers[0]?.records[0]?.state).toBe('COMMITTED')
  })

  it('rejects duplicate idempotency keys', () => {
    const first = reserveFact()
    const state = projectSideEffectFact({ ledgers: [] }, event(first))
    const duplicate = {
      ...first.ledger.records[0],
      id: 'effect-2',
      leaseId: 'lease-2',
      fence: 2,
    }

    const next = projectSideEffectFact(state, event({
      version: 1,
      operation: 'RESERVE',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 2,
        records: [...first.ledger.records, duplicate],
      },
    }))

    expect(next.failure).toContain('duplicate side-effect idempotency key')
  })

  it('rejects non-monotonic reservation rebinds', () => {
    const first = reserveFact()
    const state = projectSideEffectFact({ ledgers: [] }, event(first))

    const next = projectSideEffectFact(state, event({
      version: 1,
      operation: 'REBIND',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 2,
        records: [{
          ...first.ledger.records[0],
          leaseId: 'lease-2',
          fence: 1,
        }],
      },
    }))

    expect(next.failure).toContain('invalid side-effect transition')
  })

  it('rejects direct replay from DISPATCHED to RESERVED', () => {
    const first = reserveFact()
    const reserved = projectSideEffectFact({ ledgers: [] }, event(first))
    const dispatchedRecord = {
      ...first.ledger.records[0],
      state: 'DISPATCHED' as const,
      dispatchedAt: '2026-10-06T10:01:00.000Z',
    }
    const dispatched = projectSideEffectFact(reserved, event({
      version: 1,
      operation: 'MARK_DISPATCHED',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 2,
        records: [dispatchedRecord],
      },
    }))

    const replay = projectSideEffectFact(dispatched, event({
      version: 1,
      operation: 'REBIND',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 3,
        records: [{
          ...first.ledger.records[0],
          leaseId: 'lease-2',
          fence: 2,
        }],
      },
    }))

    expect(replay.failure).toContain('invalid side-effect transition')
  })
})
