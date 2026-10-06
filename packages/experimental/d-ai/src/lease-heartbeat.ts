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

  const interval = options.intervalMs ?? Math.max(250, Math.floor(options.ttlMs / 3))
  if (!Number.isSafeInteger(interval) || interval < 1 || interval >= options.ttlMs) {
    throw new TypeError('lease heartbeat interval must be a positive integer below ttlMs')
  }
  return interval
}

/**
 * Run one leased operation while periodically renewing its durable lease.
 *
 * Renewal failure aborts the operation and is surfaced to the caller. The
 * helper owns no task state itself; acquisition/release/recovery stay in the
 * execution service so this mechanism can be reused by future workers.
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

  const heartbeat = (async (): Promise<never> => {
    while (true) {
      await sleep(intervalMs, undefined, { signal: combined })
      combined.throwIfAborted()
      try {
        await renew()
      } catch (error) {
        controller.abort(error)
        throw error
      }
    }
  })()

  const operation = Promise.resolve().then(() => work(combined))

  try {
    return await Promise.race([operation, heartbeat])
  } finally {
    controller.abort(new Error('leased operation completed'))
    await heartbeat.catch(() => undefined)
  }
}
