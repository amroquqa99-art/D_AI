import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { withLeaseHeartbeat } from '../src/lease-heartbeat.ts'

describe('D_AI lease heartbeat', () => {
  it('renews repeatedly while leased work is still running', async () => {
    const controller = new AbortController()
    let renewals = 0

    const result = await withLeaseHeartbeat(
      controller.signal,
      { ttlMs: 30, intervalMs: 5 },
      async () => { renewals += 1 },
      async signal => {
        await sleep(24, undefined, { signal })
        return 'done'
      },
    )

    expect(result).toBe('done')
    expect(renewals).toBeGreaterThanOrEqual(2)
  })

  it('fails closed and aborts work when renewal fails', async () => {
    const controller = new AbortController()
    let workObservedAbort = false

    await expect(withLeaseHeartbeat(
      controller.signal,
      { ttlMs: 40, intervalMs: 5 },
      async () => { throw new Error('lease renewal failed') },
      async signal => {
        try {
          await sleep(100, undefined, { signal })
          return 'unexpected'
        } catch {
          workObservedAbort = signal.aborted
          throw signal.reason
        }
      },
    )).rejects.toThrow('lease renewal failed')

    expect(workObservedAbort).toBe(true)
  })

  it('rejects invalid heartbeat timing', async () => {
    const signal = new AbortController().signal
    await expect(withLeaseHeartbeat(
      signal,
      { ttlMs: 100, intervalMs: 100 },
      async () => undefined,
      async () => undefined,
    )).rejects.toThrow('lease heartbeat interval must be a positive integer below ttlMs')
  })
})
