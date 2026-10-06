import { setTimeout as sleep } from 'node:timers/promises'

export interface LeaseHeartbeatOptions {
  /** Lease duration used by the durable execution layer. */
  readonly ttlMs: number
  /** Override used mainly by tests; production defaults to one third of TTL. */
  readonly intervalMs?: number
}

function heartbeatInterval(options: LeaseHeartbeatOptions): number {
  if (!Number.isSafeInteger(options.ttlMs) || options.ttlMs < 1) {
    throw new TypeError('lease heartbeat ttlMs must be a positive safe integer')
  }

  const interval = options.intervalMs ?? Math.max(1, Math.floor(options.ttlMs / 3))
  if (!Number.isSafeInteger(interval) || interval < 1 || interval >= options.ttlMs) {
    throw new TypeError('lease heartbeat interval must be a positive integer below ttlMs')
  }
  return interval
}

/**
 * Run one leased operation while periodically renewing its durable lease.
 *
 * Renewal failure, including one settling during cleanup, is surfaced to the
 * caller. Parent cancellation prevents a successful return. The
 * helper owns no task state itself; acquisition/release/recovery stay in the
 * execution service so this mechanism can be reused by future workers.
 * @param signal - caller cancellation; cancelled work cannot report success.
 * @param options - lease duration and optional renewal interval.
 * @param renew - durable renewal of the exact current lease generation.
 * @param work - leased operation that must settle after cancellation.
 * @returns the result after worker and renewal cleanup have both settled.
 */
export async function withLeaseHeartbeat<T>(
  signal: AbortSignal,
  options: LeaseHeartbeatOptions,
  renew: () => Promise<unknown>,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted()
  const intervalMs = heartbeatInterval(options)
  const controller = new AbortController()
  const combined = AbortSignal.any([signal, controller.signal])
  let renewalFailure: { readonly reason: unknown } | undefined

  const heartbeat = (async (): Promise<never> => {
    while (true) {
      await sleep(intervalMs, undefined, { signal: combined })
      combined.throwIfAborted()
      try {
        await renew()
      } catch (error) {
        renewalFailure = { reason: error }
        controller.abort(error)
        throw error
      }
    }
  })()

  const operation = Promise.resolve().then(() => {
    combined.throwIfAborted()
    return work(combined)
  })

  let outcome: PromiseSettledResult<T>
  try {
    outcome = { status: 'fulfilled', value: await Promise.race([operation, heartbeat]) }
  } catch (error) {
    outcome = { status: 'rejected', reason: error }
  } finally {
    controller.abort(new Error('leased operation completed'))
    // Do not return while an aborted worker is still unwinding. This keeps
    // lease ownership and actual execution lifetime aligned.
    await Promise.allSettled([operation, heartbeat])
  }

  if (outcome.status === 'rejected') throw outcome.reason
  if (renewalFailure !== undefined) throw renewalFailure.reason
  signal.throwIfAborted()
  return outcome.value
}
