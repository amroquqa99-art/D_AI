import { describe, expect, it } from 'vitest'
import { budgetProfilesForTask, selectDurableRunnableTasks } from '../src/runtime-scheduler.ts'
import type { DurableTaskLedger } from '../src/task-ledger-state.ts'

function ledger(): DurableTaskLedger {
  return {
    ownerAgentId: 'owner',
    revision: 4,
    tasks: [
      {
        id: 'a',
        missionId: 'm1',
        systemId: 'investigation',
        title: 'root',
        dependsOn: [],
        state: 'COMPLETED',
        priority: 1,
        attempt: 0,
        maxAttempts: 3,
      },
      {
        id: 'b',
        missionId: 'm1',
        systemId: 'scientific-research',
        title: 'dependent',
        dependsOn: ['a'],
        state: 'READY',
        priority: 10,
        attempt: 0,
        maxAttempts: 3,
      },
      {
        id: 'c',
        missionId: 'm1',
        systemId: 'investor',
        title: 'blocked by dependency',
        dependsOn: ['b'],
        state: 'PENDING',
        priority: 100,
        attempt: 0,
        maxAttempts: 3,
      },
      {
        id: 'd',
        missionId: 'm1',
        systemId: 'innovation-discovery',
        title: 'paused branch',
        dependsOn: [],
        state: 'PAUSED',
        priority: 50,
        attempt: 0,
        maxAttempts: 3,
      },
    ],
  }
}

describe('D_AI durable scheduler admission', () => {
  it('selects only dependency-satisfied runnable tasks and reports blocked reasons', () => {
    const result = selectDurableRunnableTasks(ledger(), 4)
    expect(result.selected.map(task => task.id)).toEqual(['b'])
    expect(result.blocked).toEqual(expect.arrayContaining([
      { taskId: 'c', reason: 'dependency', details: [] },
      { taskId: 'd', reason: 'state', details: [] },
    ]))
  })

  it('selects task, mission and system budgets while excluding unrelated profiles', () => {
    const task = ledger().tasks[1]!
    const usage = {
      tokens: 0,
      moneyUsd: 0,
      wallClockMs: 0,
      humanAttentionMinutes: 0,
      dataAccessCostUsd: 0,
    }
    const base = {
      ownerAgentId: 'owner',
      limits: { wallClockMs: 1000 },
      usage,
      createdAt: '2026-10-06T00:00:00Z',
      updatedAt: '2026-10-06T00:00:00Z',
      updatedBy: 'owner',
    } as const

    const matching = budgetProfilesForTask(task, [
      { ...base, id: 'task', scope: 'TASK', scopeId: task.id },
      { ...base, id: 'mission', scope: 'MISSION', scopeId: task.missionId },
      { ...base, id: 'system', scope: 'SYSTEM', scopeId: task.systemId },
      { ...base, id: 'other-system', scope: 'SYSTEM', scopeId: 'investor' },
      { ...base, id: 'other-task', scope: 'TASK', scopeId: 'different-task' },
    ])

    expect(matching.map(profile => profile.id)).toEqual(['task', 'mission', 'system'])
  })

  it('blocks structurally runnable work when a matching persisted budget is exceeded', () => {
    const result = selectDurableRunnableTasks(ledger(), 4, [{
      id: 'budget-1',
      ownerAgentId: 'owner',
      scope: 'MISSION',
      scopeId: 'm1',
      limits: { moneyLimitUsd: 10 },
      usage: {
        tokens: 0,
        moneyUsd: 12,
        wallClockMs: 0,
        humanAttentionMinutes: 0,
        dataAccessCostUsd: 0,
      },
      createdAt: '2026-10-06T00:00:00Z',
      updatedAt: '2026-10-06T01:00:00Z',
      updatedBy: 'owner',
    }])
    expect(result.selected).toEqual([])
    expect(result.blocked).toContainEqual({
      taskId: 'b',
      reason: 'budget',
      details: ['money-limit-exceeded'],
    })
  })

  it('respects maxTasks deterministically', () => {
    const value = ledger()
    const expanded: DurableTaskLedger = {
      ...value,
      tasks: [
        ...value.tasks,
        {
          id: 'e',
          missionId: 'm1',
          systemId: 'cybersecurity',
          title: 'other root',
          dependsOn: [],
          state: 'READY',
          priority: 5,
          attempt: 0,
          maxAttempts: 2,
        },
      ],
    }
    expect(selectDurableRunnableTasks(expanded, 1).selected.map(task => task.id)).toEqual(['b'])
  })
})
