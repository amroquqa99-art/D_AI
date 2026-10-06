import { describe, expect, it } from 'vitest'
import { selectDirectorParallelWave } from '../src/director-parallelism.ts'
import type { BudgetProfile } from '../src/budget-state.ts'
import type { MissionTask } from '../src/task-dag.ts'

function task(id: string, systemId: MissionTask['systemId'] = 'investigation'): MissionTask {
  return {
    id,
    missionId: 'plan-1',
    systemId,
    title: id,
    dependsOn: [],
    state: 'PENDING',
    priority: 10,
    attempt: 0,
    maxAttempts: 3,
  }
}

function budget(
  id: string,
  scope: BudgetProfile['scope'],
  scopeId: string,
): BudgetProfile {
  return {
    id,
    ownerAgentId: 'owner',
    scope,
    scopeId,
    limits: { wallClockMs: 60000 },
    usage: {
      tokens: 0,
      moneyUsd: 0,
      wallClockMs: 0,
      humanAttentionMinutes: 0,
      dataAccessCostUsd: 0,
    },
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    updatedBy: 'owner',
  }
}

describe('D_AI Director parallel-wave planner', () => {
  it('admits independent tasks up to the explicit parallelism bound', () => {
    const wave = selectDirectorParallelWave(
      [task('a'), task('b', 'investor'), task('c', 'scientific-research')],
      [],
      2,
    )

    expect(wave.tasks.map(item => item.id)).toEqual(['a', 'b'])
    expect(wave.serializedByBudgetProfileIds).toEqual([])
  })

  it('serializes tasks that share a mission budget before usage can be over-admitted', () => {
    const wave = selectDirectorParallelWave(
      [task('a'), task('b', 'investor')],
      [budget('mission-budget', 'MISSION', 'plan-1')],
      2,
    )

    expect(wave.tasks.map(item => item.id)).toEqual(['a'])
    expect(wave.serializedByBudgetProfileIds).toEqual(['mission-budget'])
  })

  it('does not skip a higher-priority conflicting task to parallelize a lower one', () => {
    const wave = selectDirectorParallelWave(
      [task('a'), task('b'), task('c', 'investor')],
      [budget('investigation-budget', 'SYSTEM', 'investigation')],
      3,
    )

    expect(wave.tasks.map(item => item.id)).toEqual(['a'])
    expect(wave.serializedByBudgetProfileIds).toEqual(['investigation-budget'])
  })

  it('allows independent task-scoped budgets to execute together', () => {
    const wave = selectDirectorParallelWave(
      [task('a'), task('b')],
      [
        budget('task-a-budget', 'TASK', 'a'),
        budget('task-b-budget', 'TASK', 'b'),
      ],
      2,
    )

    expect(wave.tasks.map(item => item.id)).toEqual(['a', 'b'])
    expect(wave.serializedByBudgetProfileIds).toEqual([])
  })

  it('rejects invalid parallelism bounds', () => {
    expect(() => selectDirectorParallelWave([task('a')], [], 0))
      .toThrow('maxParallelTasks must be an integer from 1 to 8')
    expect(() => selectDirectorParallelWave([task('a')], [], 9))
      .toThrow('maxParallelTasks must be an integer from 1 to 8')
  })
})
