import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  runFencedSideEffect,
  SideEffectReplayBlockedError,
  type SideEffectGatewayRuntime,
} from '../src/side-effect-gateway.ts'
import type { SideEffectRecord } from '../src/side-effect-state.ts'
import type { SideEffectReservationInput } from '../src/side-effect-runtime.ts'

const agent = {} as Agent
const digestA = 'a'.repeat(64)
const digestB = 'b'.repeat(64)
const digestC = 'c'.repeat(64)

const input: SideEffectReservationInput = {
  idempotencyKey: 'effect:key',
  taskId: 'task-1',
  missionId: 'mission-1',
  systemId: 'investigation',
  leaseId: 'lease-1',
  fence: 1,
  toolName: 'fixture.mutable',
  targetDigest: digestA,
  requestDigest: digestB,
}

function record(state: SideEffectRecord['state']): SideEffectRecord {
  const base: SideEffectRecord = {
    id: 'effect-1',
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
    createdAt: '2026-10-06T10:00:00.000Z',
    artifactRefs: [],
  }

  if (state === 'RESERVED') return base
  if (state === 'DISPATCHED') {
    return { ...base, state, dispatchedAt: '2026-10-06T10:01:00.000Z' }
  }
  if (state === 'OUTCOME_UNKNOWN') {
    return {
      ...base,
      state,
      dispatchedAt: '2026-10-06T10:01:00.000Z',
      unknownAt: '2026-10-06T10:02:00.000Z',
    }
  }
  if (state === 'COMMITTED') {
    return {
      ...base,
      state,
      dispatchedAt: '2026-10-06T10:01:00.000Z',
      committedAt: '2026-10-06T10:02:00.000Z',
      resultDigest: digestC,
    }
  }
  return {
    ...base,
    state: 'ABORTED',
    abortedAt: '2026-10-06T10:01:00.000Z',
  }
}

describe('D_AI side-effect gateway', () => {
  it('dispatches exactly once and commits the confirmed result', async () => {
    const calls: string[] = []
    const runtime: SideEffectGatewayRuntime = {
      reserveSideEffect: async () => {
        calls.push('reserve')
        return record('RESERVED')
      },
      markSideEffectDispatched: async () => {
        calls.push('dispatch-mark')
        return record('DISPATCHED')
      },
      commitSideEffect: async () => {
        calls.push('commit')
        return record('COMMITTED')
      },
      markSideEffectOutcomeUnknown: async () => {
        calls.push('unknown')
        return record('OUTCOME_UNKNOWN')
      },
    }

    let dispatchCalls = 0
    const result = await runFencedSideEffect(runtime, agent, input, async () => {
      dispatchCalls += 1
      return { resultDigest: digestC }
    })

    expect(dispatchCalls).toBe(1)
    expect(calls).toEqual(['reserve', 'dispatch-mark', 'commit'])
    expect(result.record.state).toBe('COMMITTED')
    expect(result.replaySuppressed).toBe(false)
  })

  it('suppresses replay when the idempotency key is already committed', async () => {
    let dispatchCalls = 0
    const runtime: SideEffectGatewayRuntime = {
      reserveSideEffect: async () => record('COMMITTED'),
      markSideEffectDispatched: async () => { throw new Error('must not dispatch') },
      commitSideEffect: async () => { throw new Error('must not commit') },
      markSideEffectOutcomeUnknown: async () => { throw new Error('must not mark unknown') },
    }

    const result = await runFencedSideEffect(runtime, agent, input, async () => {
      dispatchCalls += 1
      return { resultDigest: digestC }
    })

    expect(dispatchCalls).toBe(0)
    expect(result.replaySuppressed).toBe(true)
    expect(result.record.state).toBe('COMMITTED')
  })

  it('blocks replay while a prior dispatch is unresolved', async () => {
    let dispatchCalls = 0
    const runtime: SideEffectGatewayRuntime = {
      reserveSideEffect: async () => record('OUTCOME_UNKNOWN'),
      markSideEffectDispatched: async () => { throw new Error('must not dispatch') },
      commitSideEffect: async () => { throw new Error('must not commit') },
      markSideEffectOutcomeUnknown: async () => { throw new Error('must not mark unknown') },
    }

    await expect(runFencedSideEffect(runtime, agent, input, async () => {
      dispatchCalls += 1
      return { resultDigest: digestC }
    })).rejects.toBeInstanceOf(SideEffectReplayBlockedError)

    expect(dispatchCalls).toBe(0)
  })

  it('records outcome unknown when the connector throws after DISPATCHED', async () => {
    const calls: string[] = []
    const runtime: SideEffectGatewayRuntime = {
      reserveSideEffect: async () => record('RESERVED'),
      markSideEffectDispatched: async () => {
        calls.push('dispatch-mark')
        return record('DISPATCHED')
      },
      commitSideEffect: async () => {
        calls.push('commit')
        return record('COMMITTED')
      },
      markSideEffectOutcomeUnknown: async () => {
        calls.push('unknown')
        return record('OUTCOME_UNKNOWN')
      },
    }

    await expect(runFencedSideEffect(runtime, agent, input, async () => {
      throw new Error('connector timeout')
    })).rejects.toThrow('connector timeout')

    expect(calls).toEqual(['dispatch-mark', 'unknown'])
  })

  it('recovers success when commit became durable before its caller observed an error', async () => {
    const calls: string[] = []
    const runtime: SideEffectGatewayRuntime = {
      reserveSideEffect: async () => record('RESERVED'),
      markSideEffectDispatched: async () => record('DISPATCHED'),
      commitSideEffect: async () => {
        calls.push('commit-ack-lost')
        throw new Error('commit acknowledgement lost')
      },
      markSideEffectOutcomeUnknown: async () => {
        calls.push('journal-readback')
        return record('COMMITTED')
      },
    }

    const result = await runFencedSideEffect(runtime, agent, input, async () => ({
      resultDigest: digestC,
    }))

    expect(calls).toEqual(['commit-ack-lost', 'journal-readback'])
    expect(result.record.state).toBe('COMMITTED')
    expect(result.replaySuppressed).toBe(false)
  })

  it('records outcome unknown if durable commit fails after the connector returns', async () => {
    const calls: string[] = []
    const runtime: SideEffectGatewayRuntime = {
      reserveSideEffect: async () => record('RESERVED'),
      markSideEffectDispatched: async () => record('DISPATCHED'),
      commitSideEffect: async () => {
        calls.push('commit-failed')
        throw new Error('lease fence expired before commit')
      },
      markSideEffectOutcomeUnknown: async () => {
        calls.push('unknown')
        return record('OUTCOME_UNKNOWN')
      },
    }

    await expect(runFencedSideEffect(runtime, agent, input, async () => ({
      resultDigest: digestC,
    }))).rejects.toThrow('lease fence expired before commit')

    expect(calls).toEqual(['commit-failed', 'unknown'])
  })
})
