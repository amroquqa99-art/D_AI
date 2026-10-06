import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import {
  createDirectorSchedulerWake,
  directorSchedulerRemainingSlots,
  hasPendingDirectorSchedulerWake,
  isCurrentDirectorScheduleWake,
  orderDirectorSchedulesForFairness,
  shouldWakeDirectorSchedule,
} from '../src/director-scheduler.ts'
import type { DirectorPlanRuntimeView } from '../src/director-runtime.ts'
import type { DirectorSchedule } from '../src/director-schedule-state.ts'
import type { ExecutionState } from '../src/execution-state.ts'

function schedule(overrides: Partial<DirectorSchedule> = {}): DirectorSchedule {
  return {
    id: overrides.id ?? 'schedule-1',
    planId: overrides.planId ?? 'plan-1',
    ownerAgentId: overrides.ownerAgentId ?? 'owner',
    enabled: overrides.enabled ?? true,
    intervalMs: overrides.intervalMs ?? 1000,
    maxTasksPerCycle: overrides.maxTasksPerCycle ?? 4,
    leaseTtlMs: overrides.leaseTtlMs ?? 60000,
    nextWakeAt: overrides.nextWakeAt ?? '2026-10-07T00:00:01.000Z',
    createdAt: overrides.createdAt ?? '2026-10-07T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-10-07T00:00:00.000Z',
    ...(overrides.lastCycle === undefined ? {} : { lastCycle: overrides.lastCycle }),
  }
}

function planView(
  options: {
    status?: 'ACTIVE' | 'PAUSED' | 'COMPLETE'
    selected?: readonly string[]
    taskIds?: readonly string[]
  } = {},
): DirectorPlanRuntimeView {
  const taskIds = options.taskIds ?? ['task-1']
  const tasks = taskIds.map((id, index) => ({
    id,
    missionId: 'plan-1',
    systemId: 'investigation' as const,
    title: id,
    dependsOn: [],
    state: 'PENDING' as const,
    priority: 10 - index,
    attempt: 0,
    maxAttempts: 3,
  }))
  const selected = new Set(options.selected ?? ['task-1'])

  return {
    plan: {
      id: 'plan-1',
      objective: 'fixture objective',
      primarySystem: 'investigation',
      ownerAgentId: 'owner',
      createdAt: '2026-10-07T00:00:00.000Z',
      status: options.status ?? 'ACTIVE',
      stopConditions: [],
    },
    phase: 'EXECUTING',
    tasks,
    next: {
      ownerAgentId: 'owner',
      ledgerRevision: 1,
      selected: tasks.filter(task => selected.has(task.id)),
      blocked: [],
    },
  }
}

function execution(
  leases: ExecutionState['ledgers'][number]['leases'] = [],
): ExecutionState {
  return {
    ledgers: [{
      ownerAgentId: 'owner',
      revision: leases.length,
      leases,
      checkpoints: [],
    }],
  }
}

describe('D_AI unattended Director scheduler admission', () => {
  it('bounds active plus queued unattended work to the configured capacity', () => {
    expect(directorSchedulerRemainingSlots(1, 0, 0)).toBe(1)
    expect(directorSchedulerRemainingSlots(4, 2, 1)).toBe(1)
    expect(directorSchedulerRemainingSlots(4, 3, 2)).toBe(0)
    expect(() => directorSchedulerRemainingSlots(0, 0, 0)).toThrow('maxConcurrentCycles')
    expect(() => directorSchedulerRemainingSlots(4, -1, 0)).toThrow('activeCount')
  })

  it('creates a typed, model-empty scheduler wake message', () => {
    const wake = createDirectorSchedulerWake(schedule())

    expect(wake.role).toBe('user')
    expect(wake.content).toEqual([])
    expect(wake.source).toEqual({
      kind: 'd-ai-scheduler',
      form: 'notice',
      summary: 'D_AI unattended Director schedule wake',
      scheduleId: 'schedule-1',
      planId: 'plan-1',
      dueAt: '2026-10-07T00:00:01.000Z',
    })
  })

  it('orders never-run and least-recently-attempted schedules before newer work', () => {
    const neverRun = schedule({
      id: 'never-run',
      planId: 'plan-never',
      nextWakeAt: '2026-10-07T00:00:03.000Z',
    })
    const old = schedule({
      id: 'old',
      planId: 'plan-old',
      nextWakeAt: '2026-10-07T00:00:01.000Z',
      lastCycle: {
        attemptedAt: '2026-10-06T23:50:00.000Z',
        outcome: 'EXECUTED',
        executedTasks: 1,
        phase: 'EXECUTING',
      },
    })
    const recent = schedule({
      id: 'recent',
      planId: 'plan-recent',
      nextWakeAt: '2026-10-07T00:00:00.500Z',
      lastCycle: {
        attemptedAt: '2026-10-06T23:59:00.000Z',
        outcome: 'EXECUTED',
        executedTasks: 1,
        phase: 'EXECUTING',
      },
    })

    expect(orderDirectorSchedulesForFairness([recent, old, neverRun]).map(item => item.id))
      .toEqual(['never-run', 'old', 'recent'])
  })

  it('uses oldest due time then stable identity when fairness timestamps tie', () => {
    const attemptedAt = '2026-10-06T23:50:00.000Z'
    const same = (id: string, due: string) => schedule({
      id,
      planId: 'plan-' + id,
      nextWakeAt: due,
      lastCycle: {
        attemptedAt,
        outcome: 'IDLE',
        executedTasks: 0,
        phase: 'EXECUTING',
      },
    })

    expect(orderDirectorSchedulesForFairness([
      same('z', '2026-10-07T00:00:02.000Z'),
      same('b', '2026-10-07T00:00:01.000Z'),
      same('a', '2026-10-07T00:00:01.000Z'),
    ]).map(item => item.id)).toEqual(['a', 'b', 'z'])
  })

  it('wakes a due active schedule when runnable work exists', () => {
    expect(shouldWakeDirectorSchedule(
      schedule(),
      planView(),
      execution(),
      Date.parse('2026-10-07T00:00:02.000Z'),
    )).toBe(true)
  })

  it('rejects stale and early wake tokens after schedule reconfiguration', () => {
    const current = schedule({ nextWakeAt: '2026-10-07T00:00:05.000Z' })

    expect(isCurrentDirectorScheduleWake(
      current,
      '2026-10-07T00:00:01.000Z',
      Date.parse('2026-10-07T00:00:06.000Z'),
    )).toBe(false)

    expect(isCurrentDirectorScheduleWake(
      current,
      current.nextWakeAt,
      Date.parse('2026-10-07T00:00:04.999Z'),
    )).toBe(false)

    expect(isCurrentDirectorScheduleWake(
      current,
      current.nextWakeAt,
      Date.parse('2026-10-07T00:00:05.000Z'),
    )).toBe(true)
  })

  it('does not wake before due time or while the plan is paused', () => {
    expect(shouldWakeDirectorSchedule(
      schedule(),
      planView(),
      execution(),
      Date.parse('2026-10-07T00:00:00.500Z'),
    )).toBe(false)

    expect(shouldWakeDirectorSchedule(
      schedule(),
      planView({ status: 'PAUSED' }),
      execution(),
      Date.parse('2026-10-07T00:00:02.000Z'),
    )).toBe(false)
  })

  it('wakes an otherwise idle plan when an unreleased task lease has expired', () => {
    expect(shouldWakeDirectorSchedule(
      schedule(),
      planView({ selected: [] }),
      execution([{
        id: 'lease-1',
        taskId: 'task-1',
        missionId: 'plan-1',
        holderId: 'owner',
        fence: 1,
        acquiredAt: '2026-10-06T23:59:00.000Z',
        expiresAt: '2026-10-07T00:00:00.000Z',
      }]),
      Date.parse('2026-10-07T00:00:02.000Z'),
    )).toBe(true)
  })

  it('detects an already queued wake across both inbox boundaries', () => {
    const wake = createDirectorSchedulerWake(schedule())
    const inbox = {
      nextTurn: [wake],
      nextStep: [] as UserMessage[],
    }
    const agent = { inbox } as Pick<Agent, 'inbox'> as Agent

    expect(hasPendingDirectorSchedulerWake(agent, 'schedule-1')).toBe(true)
    expect(hasPendingDirectorSchedulerWake(agent, 'other')).toBe(false)
  })
})
