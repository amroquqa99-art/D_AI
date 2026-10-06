import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import {
  createDirectorSchedulerWake,
  hasPendingDirectorSchedulerWake,
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
  it('encodes a typed scheduler wake using the existing Harness schedule source', () => {
    const wake = createDirectorSchedulerWake(schedule())

    expect(wake.role).toBe('user')
    expect(wake.source).toEqual({ kind: 'schedule', form: 'notice', summary: 'D_AI Director schedule wake' })
    expect(wake.content).toHaveLength(1)
    expect(wake.content[0]?.type).toBe('text')
    if (wake.content[0]?.type !== 'text') throw new Error('missing typed wake content')
    expect(JSON.parse(wake.content[0].text)).toEqual({ protocol: 'd_ai.director-wake.v1', scheduleId: 'schedule-1', planId: 'plan-1', dueAt: '2026-10-07T00:00:01.000Z' })
  })

  it('wakes a due active schedule when runnable work exists', () => {
    expect(shouldWakeDirectorSchedule(
      schedule(),
      planView(),
      execution(),
      Date.parse('2026-10-07T00:00:02.000Z'),
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
    const agent = { inbox } as unknown as Agent

    expect(hasPendingDirectorSchedulerWake(agent, 'schedule-1')).toBe(true)
    expect(hasPendingDirectorSchedulerWake(agent, 'other')).toBe(false)
  })
})
