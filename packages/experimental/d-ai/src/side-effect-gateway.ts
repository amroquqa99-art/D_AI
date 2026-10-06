import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SideEffectRecord } from './side-effect-state.ts'
import type { SideEffectReservationInput } from './side-effect-runtime.ts'

export interface SideEffectGatewayRuntime {
  reserveSideEffect(
    agent: Agent,
    input: SideEffectReservationInput,
  ): Promise<SideEffectRecord>
  markSideEffectDispatched(
    agent: Agent,
    idempotencyKey: string,
    leaseId: string,
    fence: number,
  ): Promise<SideEffectRecord>
  commitSideEffect(
    agent: Agent,
    idempotencyKey: string,
    leaseId: string,
    fence: number,
    resultDigest: string,
    artifactRefs?: readonly string[],
  ): Promise<SideEffectRecord>
  markSideEffectOutcomeUnknown(
    agent: Agent,
    idempotencyKey: string,
  ): Promise<SideEffectRecord>
}

export interface SideEffectDispatchResult {
  readonly resultDigest: string
  readonly artifactRefs?: readonly string[]
}

export interface SideEffectGatewayResult {
  readonly record: SideEffectRecord
  /** True only when a previously COMMITTED idempotency key suppressed replay. */
  readonly replaySuppressed: boolean
}

export class SideEffectReplayBlockedError extends Error {
  readonly record: SideEffectRecord

  constructor(record: SideEffectRecord) {
    super(
      record.state === 'OUTCOME_UNKNOWN' || record.state === 'DISPATCHED'
        ? 'side-effect outcome must be reconciled before any retry'
        : 'side-effect idempotency key cannot be replayed from state ' + record.state,
    )
    this.name = 'SideEffectReplayBlockedError'
    this.record = record
  }
}

/**
 * Execute one external mutable operation behind the D_AI idempotency journal.
 *
 * The callback is invoked only after the durable record reaches DISPATCHED.
 * Any exception after that point is conservatively persisted as
 * OUTCOME_UNKNOWN; the gateway never retries the external call automatically.
 */
export async function runFencedSideEffect(
  runtime: SideEffectGatewayRuntime,
  agent: Agent,
  input: SideEffectReservationInput,
  dispatch: () => Promise<SideEffectDispatchResult>,
): Promise<SideEffectGatewayResult> {
  const reserved = await runtime.reserveSideEffect(agent, input)

  if (reserved.state === 'COMMITTED') {
    return Object.freeze({
      record: reserved,
      replaySuppressed: true,
    })
  }
  if (reserved.state !== 'RESERVED') {
    throw new SideEffectReplayBlockedError(reserved)
  }

  const dispatched = await runtime.markSideEffectDispatched(
    agent,
    input.idempotencyKey,
    reserved.leaseId,
    reserved.fence,
  )

  let result: SideEffectDispatchResult
  try {
    result = await dispatch()
  } catch (error) {
    try {
      await runtime.markSideEffectOutcomeUnknown(agent, input.idempotencyKey)
    } catch (journalError) {
      throw new AggregateError(
        [error, journalError],
        'external side effect failed after dispatch and outcome-unknown journaling also failed',
      )
    }
    throw error
  }

  try {
    const committed = await runtime.commitSideEffect(
      agent,
      input.idempotencyKey,
      dispatched.leaseId,
      dispatched.fence,
      result.resultDigest,
      result.artifactRefs ?? [],
    )
    return Object.freeze({
      record: committed,
      replaySuppressed: false,
    })
  } catch (error) {
    try {
      await runtime.markSideEffectOutcomeUnknown(agent, input.idempotencyKey)
    } catch (journalError) {
      throw new AggregateError(
        [error, journalError],
        'external side effect returned but durable commit and outcome-unknown journaling both failed',
      )
    }
    throw error
  }
}
