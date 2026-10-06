import { describe, expect, it } from 'vitest'
import { selectDurableRunnableTasks } from '../src/runtime-scheduler.ts'
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
      { taskId: 'c', reason: 'dependency' },
      { taskId: 'd', reason: 'state' },
    ]))
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
