import { describe, expect, it } from 'vitest'
import { directorScheduleStagnationReason, projectDirectorScheduleFact, type DirectorScheduleFact, type DirectorScheduleState } from '../src/director-schedule-state.ts'

function event(fact: DirectorScheduleFact): never {
  return {
    type: 'd_ai/director-schedule-fact',
    data: fact,
  } as never
}

function baseState(): DirectorScheduleState {
  return { ledgers: [] }
}

function schedule(overrides: Partial<DirectorScheduleFact['ledger']['schedules'][number]> = {}) {
  return {
    id: overrides.id ?? 'schedule-1',
    planId: overrides.planId ?? 'plan-1',
    ownerAgentId: overrides.ownerAgentId ?? 'owner',
    enabled: overrides.enabled ?? true,
    intervalMs: overrides.intervalMs ?? 1000,
    maxTasksPerCycle: overrides.maxTasksPerCycle ?? 4,
    maxParallelTasks: overrides.maxParallelTasks ?? 1,
    maxConsecutiveFailures: overrides.maxConsecutiveFailures ?? 0,
    maxConsecutiveIdleCycles: overrides.maxConsecutiveIdleCycles ?? 0,
    consecutiveFailures: overrides.consecutiveFailures ?? 0,
    consecutiveIdleCycles: overrides.consecutiveIdleCycles ?? 0,
    leaseTtlMs: overrides.leaseTtlMs ?? 60000,
    nextWakeAt: overrides.nextWakeAt ?? '2026-10-07T00:00:01.000Z',
    createdAt: overrides.createdAt ?? '2026-10-07T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-10-07T00:00:00.000Z',
    ...(overrides.lastCycle === undefined ? {} : { lastCycle: overrides.lastCycle }),
  }
}

describe('D_AI Director schedule projection', () => {
  it('replays a legacy v1 schedule without requiring later parallelism or stagnation settings', () => {
    const { maxParallelTasks, ...legacy } = schedule()
    expect(maxParallelTasks).toBe(1)
    const state = projectDirectorScheduleFact(baseState(), event({
      version: 1, operation: 'UPSERT', actorId: 'owner',
      ledger: { ownerAgentId: 'owner', revision: 1, schedules: [legacy] },
    }))
    expect(state.failure).toBeUndefined()
    expect(state.ledgers[0]?.schedules[0]).toMatchObject({
      maxParallelTasks: 1, maxConsecutiveFailures: 0, maxConsecutiveIdleCycles: 0,
      consecutiveFailures: 0, consecutiveIdleCycles: 0,
    })
  })

  it('creates one durable unattended schedule and records a cycle receipt', () => {
    const created = projectDirectorScheduleFact(baseState(), event({
      version: 1,
      operation: 'UPSERT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 1,
        schedules: [schedule()],
      },
    }))

    expect(created.failure).toBeUndefined()
    expect(created.ledgers[0]?.schedules[0]).toMatchObject({
      planId: 'plan-1',
      enabled: true,
      intervalMs: 1000,
    })

    const recorded = projectDirectorScheduleFact(created, event({
      version: 1,
      operation: 'RECORD_CYCLE',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 2,
        schedules: [schedule({
          nextWakeAt: '2026-10-07T00:00:03.000Z',
          updatedAt: '2026-10-07T00:00:02.000Z',
          lastCycle: {
            attemptedAt: '2026-10-07T00:00:02.000Z',
            outcome: 'EXECUTED',
            executedTasks: 2,
            phase: 'EXECUTING',
          },
        })],
      },
    }))

    expect(recorded.failure).toBeUndefined()
    expect(recorded.ledgers[0]?.schedules[0]?.lastCycle).toMatchObject({
      outcome: 'EXECUTED',
      executedTasks: 2,
    })
  })

  it('rejects schedule parallelism larger than its cycle bound', () => {
    const invalid = projectDirectorScheduleFact(baseState(), event({
      version: 1,
      operation: 'UPSERT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 1,
        schedules: [schedule({
          maxTasksPerCycle: 2,
          maxParallelTasks: 3,
        })],
      },
    }))

    expect(invalid.failure).toContain('parallelism cannot exceed maxTasksPerCycle')
  })

  it('rejects duplicate schedules for one plan and invalid TTL bounds', () => {
    const duplicate = projectDirectorScheduleFact(baseState(), event({
      version: 1,
      operation: 'UPSERT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 1,
        schedules: [
          schedule({ id: 'a' }),
          schedule({ id: 'b' }),
        ],
      },
    }))
    expect(duplicate.failure).toContain('one Director plan can have only one unattended schedule')

    const invalidTtl = projectDirectorScheduleFact(baseState(), event({
      version: 1,
      operation: 'UPSERT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 1,
        schedules: [schedule({ intervalMs: 1000, leaseTtlMs: 1000 })],
      },
    }))
    expect(invalidTtl.failure).toContain('lease TTL must exceed')
  })

  it('records a task failure without misclassifying it as scheduler failure', () => {
    const created = projectDirectorScheduleFact(baseState(), event({
      version: 1,
      operation: 'UPSERT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 1,
        schedules: [schedule()],
      },
    }))

    const state = projectDirectorScheduleFact(created, event({
      version: 1,
      operation: 'RECORD_CYCLE',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 2,
        schedules: [schedule({
          consecutiveFailures: 1,
          nextWakeAt: '2026-10-07T00:00:03.000Z',
          updatedAt: '2026-10-07T00:00:02.000Z',
          lastCycle: {
            attemptedAt: '2026-10-07T00:00:02.000Z',
            outcome: 'FAILED',
            error: 'D_AI_TASK_FAILED',
            executedTasks: 1,
            phase: 'BLOCKED',
          },
        })],
      },
    }))

    expect(state.failure).toBeUndefined()
    expect(state.ledgers[0]?.schedules[0]?.lastCycle?.outcome).toBe('FAILED')
    expect(state.ledgers[0]?.schedules[0]?.lastCycle?.error).toBe('D_AI_TASK_FAILED')
    expect(state.ledgers[0]?.schedules[0]?.consecutiveFailures).toBe(1)
    expect(state.ledgers[0]?.schedules[0]?.consecutiveIdleCycles).toBe(0)
  })

  it('increments and resets stagnation counters from authoritative cycle outcomes', () => {
    const created = projectDirectorScheduleFact(baseState(), event({
      version: 1,
      operation: 'UPSERT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 1,
        schedules: [schedule({
          maxConsecutiveFailures: 2,
          maxConsecutiveIdleCycles: 2,
        })],
      },
    }))

    const failed = projectDirectorScheduleFact(created, event({
      version: 1,
      operation: 'RECORD_CYCLE',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 2,
        schedules: [schedule({
          maxConsecutiveFailures: 2,
          maxConsecutiveIdleCycles: 2,
          consecutiveFailures: 1,
          nextWakeAt: '2026-10-07T00:00:03.000Z',
          updatedAt: '2026-10-07T00:00:02.000Z',
          lastCycle: {
            attemptedAt: '2026-10-07T00:00:02.000Z',
            outcome: 'FAILED',
            executedTasks: 0,
            phase: 'EXECUTING',
            error: 'fixture failure',
          },
        })],
      },
    }))
    expect(failed.failure).toBeUndefined()
    expect(failed.ledgers[0]?.schedules[0]).toMatchObject({
      consecutiveFailures: 1,
      consecutiveIdleCycles: 0,
    })

    const idle = projectDirectorScheduleFact(failed, event({
      version: 1,
      operation: 'RECORD_CYCLE',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 3,
        schedules: [schedule({
          maxConsecutiveFailures: 2,
          maxConsecutiveIdleCycles: 2,
          consecutiveFailures: 0,
          consecutiveIdleCycles: 1,
          nextWakeAt: '2026-10-07T00:00:05.000Z',
          updatedAt: '2026-10-07T00:00:04.000Z',
          lastCycle: {
            attemptedAt: '2026-10-07T00:00:04.000Z',
            outcome: 'IDLE',
            executedTasks: 0,
            phase: 'EXECUTING',
          },
        })],
      },
    }))
    expect(idle.failure).toBeUndefined()
    expect(idle.ledgers[0]?.schedules[0]).toMatchObject({
      consecutiveFailures: 0,
      consecutiveIdleCycles: 1,
    })

    const executed = projectDirectorScheduleFact(idle, event({
      version: 1,
      operation: 'RECORD_CYCLE',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 4,
        schedules: [schedule({
          maxConsecutiveFailures: 2,
          maxConsecutiveIdleCycles: 2,
          consecutiveFailures: 0,
          consecutiveIdleCycles: 0,
          nextWakeAt: '2026-10-07T00:00:07.000Z',
          updatedAt: '2026-10-07T00:00:06.000Z',
          lastCycle: {
            attemptedAt: '2026-10-07T00:00:06.000Z',
            outcome: 'EXECUTED',
            executedTasks: 1,
            phase: 'EXECUTING',
          },
        })],
      },
    }))
    expect(executed.failure).toBeUndefined()
    expect(executed.ledgers[0]?.schedules[0]).toMatchObject({
      consecutiveFailures: 0,
      consecutiveIdleCycles: 0,
    })
  })

  it('derives explicit stagnation reasons and treats zero thresholds as disabled', () => {
    expect(directorScheduleStagnationReason(schedule({
      maxConsecutiveFailures: 0,
      consecutiveFailures: 99,
    }))).toBeUndefined()

    expect(directorScheduleStagnationReason(schedule({
      maxConsecutiveFailures: 2,
      consecutiveFailures: 2,
    }))).toBe('FAILURE_LIMIT')

    expect(directorScheduleStagnationReason(schedule({
      maxConsecutiveIdleCycles: 3,
      consecutiveIdleCycles: 3,
    }))).toBe('IDLE_LIMIT')
  })

  it('rejects fabricated counter updates but permits an explicit full reset through UPSERT', () => {
    const created = projectDirectorScheduleFact(baseState(), event({
      version: 1,
      operation: 'UPSERT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 1,
        schedules: [schedule({
          maxConsecutiveFailures: 3,
        })],
      },
    }))

    const failed = projectDirectorScheduleFact(created, event({
      version: 1,
      operation: 'RECORD_CYCLE',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 2,
        schedules: [schedule({
          maxConsecutiveFailures: 3,
          consecutiveFailures: 1,
          nextWakeAt: '2026-10-07T00:00:03.000Z',
          updatedAt: '2026-10-07T00:00:02.000Z',
          lastCycle: {
            attemptedAt: '2026-10-07T00:00:02.000Z',
            outcome: 'FAILED',
            executedTasks: 0,
            phase: 'EXECUTING',
            error: 'fixture failure',
          },
        })],
      },
    }))
    expect(failed.failure).toBeUndefined()

    const fabricated = projectDirectorScheduleFact(failed, event({
      version: 1,
      operation: 'UPSERT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 3,
        schedules: [schedule({
          maxConsecutiveFailures: 3,
          consecutiveFailures: 2,
          nextWakeAt: '2026-10-07T00:00:04.000Z',
          updatedAt: '2026-10-07T00:00:03.000Z',
          lastCycle: failed.ledgers[0]!.schedules[0]!.lastCycle,
        })],
      },
    }))
    expect(fabricated.failure).toContain('may only preserve or reset stagnation counters')

    const reset = projectDirectorScheduleFact(failed, event({
      version: 1,
      operation: 'UPSERT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 3,
        schedules: [schedule({
          maxConsecutiveFailures: 3,
          consecutiveFailures: 0,
          consecutiveIdleCycles: 0,
          nextWakeAt: '2026-10-07T00:00:04.000Z',
          updatedAt: '2026-10-07T00:00:03.000Z',
          lastCycle: failed.ledgers[0]!.schedules[0]!.lastCycle,
        })],
      },
    }))
    expect(reset.failure).toBeUndefined()
    expect(reset.ledgers[0]?.schedules[0]?.consecutiveFailures).toBe(0)
  })

  it('rejects historical cycle state on initial schedule creation', () => {
    const invalid = projectDirectorScheduleFact(baseState(), event({
      version: 1,
      operation: 'UPSERT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 1,
        schedules: [schedule({
          consecutiveFailures: 1,
        })],
      },
    }))
    expect(invalid.failure).toContain('cannot contain historical cycle state')
  })

  it('prevents cycle receipts from mutating schedule configuration', () => {
    const prior = projectDirectorScheduleFact(baseState(), event({
      version: 1,
      operation: 'UPSERT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 1,
        schedules: [schedule()],
      },
    }))

    const corrupted = projectDirectorScheduleFact(prior, event({
      version: 1,
      operation: 'RECORD_CYCLE',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 2,
        schedules: [schedule({
          intervalMs: 2000,
          nextWakeAt: '2026-10-07T00:00:04.000Z',
          updatedAt: '2026-10-07T00:00:02.000Z',
          lastCycle: {
            attemptedAt: '2026-10-07T00:00:02.000Z',
            outcome: 'IDLE',
            executedTasks: 0,
            phase: 'PLANNING',
          },
        })],
      },
    }))

    expect(corrupted.failure).toContain('cannot change Director schedule configuration')
  })

  it('requires failed receipts to carry an error and successful receipts not to carry one', () => {
    const failedWithoutError = projectDirectorScheduleFact(baseState(), event({
      version: 1,
      operation: 'UPSERT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 1,
        schedules: [schedule({
          lastCycle: {
            attemptedAt: '2026-10-07T00:00:00.000Z',
            outcome: 'FAILED',
            executedTasks: 0,
            phase: 'BLOCKED',
          },
        })],
      },
    }))
    expect(failedWithoutError.failure).toContain('failed Director schedule cycle requires an error')
  })
})
