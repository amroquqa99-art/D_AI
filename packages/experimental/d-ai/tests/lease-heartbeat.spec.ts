import { describe, expect, it } from 'vitest'
import { withLeaseHeartbeat } from '../src/lease-heartbeat.ts'

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
}

describe('D_AI lease heartbeat', () => {
  it('renews repeatedly until leased work completes', async () => {
    const done = Promise.withResolvers<string>()
    let renewals = 0
    const result = await withLeaseHeartbeat(
      new AbortController().signal,
      { ttlMs: 30, intervalMs: 5 },
      async () => {
        renewals += 1
        if (renewals === 2) done.resolve('done')
      },
      async () => done.promise,
    )
    expect(result).toBe('done')
    expect(renewals).toBe(2)
  })

  it('fails closed and aborts work when renewal fails', async () => {
    const failure = new Error('lease renewal failed')
    let workObservedAbort = false
    await expect(withLeaseHeartbeat(
      new AbortController().signal,
      { ttlMs: 40, intervalMs: 5 },
      async () => { throw failure },
      async signal => {
        await waitForAbort(signal)
        workObservedAbort = signal.aborted
        throw signal.reason
      },
    )).rejects.toBe(failure)
    expect(workObservedAbort).toBe(true)
  })

  it('preserves a renewal rejection that arrives during worker cleanup', async () => {
    const renewing = Promise.withResolvers<void>()
    const releaseRenewal = Promise.withResolvers<void>()
    const workerStopped = Promise.withResolvers<void>()
    const failure = new Error('renewal failed while worker was stopping')
    const running = withLeaseHeartbeat(
      new AbortController().signal,
      { ttlMs: 40, intervalMs: 5 },
      async () => {
        renewing.resolve()
        await releaseRenewal.promise
        throw failure
      },
      async signal => {
        await renewing.promise
        signal.addEventListener('abort', () => workerStopped.resolve(), { once: true })
        return 'finished'
      },
    )
    const rejected = expect(running).rejects.toBe(failure)
    try {
      await workerStopped.promise
    } finally {
      releaseRenewal.resolve()
      await rejected
    }
  })

  it('rejects parent cancellation during cleanup even when work returned a result', async () => {
    const parent = new AbortController()
    const renewing = Promise.withResolvers<void>()
    const releaseRenewal = Promise.withResolvers<void>()
    const workerStopped = Promise.withResolvers<void>()
    const failure = new Error('owner cancelled')
    const running = withLeaseHeartbeat(
      parent.signal,
      { ttlMs: 40, intervalMs: 5 },
      async () => {
        renewing.resolve()
        await releaseRenewal.promise
      },
      async signal => {
        await renewing.promise
        signal.addEventListener('abort', () => workerStopped.resolve(), { once: true })
        return 'finished'
      },
    )
    const rejected = expect(running).rejects.toBe(failure)
    try {
      await workerStopped.promise
      parent.abort(failure)
    } finally {
      releaseRenewal.resolve()
      await rejected
    }
  })

  it('does not invoke work cancelled before its deferred start', async () => {
    const parent = new AbortController()
    const failure = new Error('cancelled before start')
    let started = false
    const running = withLeaseHeartbeat(
      parent.signal,
      { ttlMs: 40, intervalMs: 5 },
      async () => undefined,
      async () => { started = true },
    )
    parent.abort(failure)
    await expect(running).rejects.toBe(failure)
    expect(started).toBe(false)
  })

  it('does not return before aborted work finishes unwinding', async () => {
    const aborted = Promise.withResolvers<void>()
    const unwind = Promise.withResolvers<void>()
    const failure = new Error('lease lost')
    let settled = false
    const running = withLeaseHeartbeat(
      new AbortController().signal,
      { ttlMs: 40, intervalMs: 5 },
      async () => { throw failure },
      async signal => {
        await waitForAbort(signal)
        aborted.resolve()
        await unwind.promise
        throw signal.reason
      },
    )
    const observed = running.then(
      () => { settled = true },
      () => { settled = true },
    )
    const rejected = expect(running).rejects.toBe(failure)
    try {
      await aborted.promise
      expect(settled).toBe(false)
    } finally {
      unwind.resolve()
      await Promise.all([observed, rejected])
    }
    expect(settled).toBe(true)
  })

  it('preserves work rejection even when the rejection value is undefined', async () => {
    await expect(withLeaseHeartbeat(
      new AbortController().signal,
      { ttlMs: 40, intervalMs: 5 },
      async () => undefined,
      async () => { throw undefined },
    )).rejects.toBeUndefined()
  })

  it('uses a valid default heartbeat interval for short leases', async () => {
    await expect(withLeaseHeartbeat(
      new AbortController().signal,
      { ttlMs: 30 },
      async () => undefined,
      async () => 'done',
    )).resolves.toBe('done')
  })

  it('returns successful work after normal heartbeat shutdown', async () => {
    let renewals = 0
    await expect(withLeaseHeartbeat(
      new AbortController().signal,
      { ttlMs: 1000 },
      async () => { renewals += 1 },
      async () => 'done',
    )).resolves.toBe('done')
    expect(renewals).toBe(0)
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
