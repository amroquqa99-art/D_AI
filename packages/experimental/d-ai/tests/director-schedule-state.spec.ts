import { describe, expect, it } from 'vitest'
import { projectDirectorScheduleFact, type DirectorScheduleFact, type DirectorScheduleState } from '../src/director-schedule-state.ts'

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
    leaseTtlMs: overrides.leaseTtlMs ?? 60000,
    nextWakeAt: overrides.nextWakeAt ?? '2026-10-07T00:00:01.000Z',
    createdAt: overrides.createdAt ?? '2026-10-07T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-10-07T00:00:00.000Z',
    ...(overrides.lastCycle === undefined ? {} : { lastCycle: overrides.lastCycle }),
  }
}

describe('D_AI Director schedule projection', () => {
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
    const state = projectDirectorScheduleFact(baseState(), event({
      version: 1,
      operation: 'UPSERT',
      actorId: 'owner',
      ledger: {
        ownerAgentId: 'owner',
        revision: 1,
        schedules: [schedule({
          lastCycle: {
            attemptedAt: '2026-10-07T00:00:00.000Z',
            outcome: 'TASK_FAILED',
            executedTasks: 1,
            phase: 'BLOCKED',
          },
        })],
      },
    }))

    expect(state.failure).toBeUndefined()
    expect(state.ledgers[0]?.schedules[0]?.lastCycle?.outcome).toBe('TASK_FAILED')
    expect(state.ledgers[0]?.schedules[0]?.lastCycle?.error).toBeUndefined()
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
