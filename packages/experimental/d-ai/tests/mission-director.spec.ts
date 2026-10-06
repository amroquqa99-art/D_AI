import { describe, expect, it } from 'vitest'
import { createMissionPlan, deriveMissionPhase, selectNextWork } from '../src/mission-director.ts'
import type { MissionTask } from '../src/task-dag.ts'

function task(overrides: Partial<MissionTask> & Pick<MissionTask, 'id'>): MissionTask {
  return {
    id: overrides.id,
    missionId: overrides.missionId ?? 'm1',
    systemId: overrides.systemId ?? 'investigation',
    title: overrides.title ?? overrides.id,
    dependsOn: overrides.dependsOn ?? [],
    state: overrides.state ?? 'PENDING',
    priority: overrides.priority ?? 0,
    attempt: overrides.attempt ?? 0,
    maxAttempts: overrides.maxAttempts ?? 2,
  }
}

describe('D_AI Mission Director foundation', () => {
  it('creates a mission plan only from same-mission tasks', () => {
    const plan = createMissionPlan({
      id: 'm1',
      objective: 'Investigate a complex claim',
      primarySystem: 'investigation',
      createdAt: '2026-10-06T00:00:00Z',
      tasks: [
        task({ id: 'collect', state: 'COMPLETED' }),
        task({ id: 'verify', dependsOn: ['collect'], priority: 9 }),
      ],
      stopConditions: ['evidence-saturated'],
    })
    expect(plan.primarySystem).toBe('investigation')
    expect(plan.graph.topologicalOrder).toEqual(['collect', 'verify'])
    expect(plan.stopConditions).toEqual(['evidence-saturated'])

    expect(() => createMissionPlan({
      id: 'm1',
      objective: 'bad',
      primarySystem: 'investigation',
      createdAt: '2026-10-06T00:00:00Z',
      tasks: [task({ id: 'foreign', missionId: 'm2' })],
    })).toThrow('does not belong')
  })


  it('derives lifecycle phase from durable plan and task state', () => {
    expect(deriveMissionPhase('ACTIVE', [])).toBe('PLANNING')
    expect(deriveMissionPhase('ACTIVE', [task({ id: 'running', state: 'RUNNING' })])).toBe('EXECUTING')
    expect(deriveMissionPhase('ACTIVE', [task({ id: 'human', state: 'WAITING_FOR_HUMAN' })])).toBe('WAITING_FOR_HUMAN')
    expect(deriveMissionPhase('ACTIVE', [task({ id: 'failed', state: 'FAILED' })])).toBe('BLOCKED')
    expect(deriveMissionPhase('ACTIVE', [
      task({ id: 'done', state: 'COMPLETED' }),
      task({ id: 'cancelled', state: 'CANCELLED' }),
    ])).toBe('COMPLETE')
    expect(deriveMissionPhase('PAUSED', [task({ id: 'ready', state: 'READY' })])).toBe('PAUSED')
    expect(deriveMissionPhase('COMPLETE', [task({ id: 'ready', state: 'READY' })])).toBe('COMPLETE')
  })

  it('selects runnable work when budget is available', () => {
    const plan = createMissionPlan({
      id: 'm1',
      objective: 'Question',
      primarySystem: 'investigation',
      createdAt: '2026-10-06T00:00:00Z',
      tasks: [
        task({ id: 'a', priority: 1 }),
        task({ id: 'b', priority: 5 }),
      ],
    })
    const selected = selectNextWork(
      plan,
      { tokenLimit: 1000, moneyLimitUsd: 10 },
      { tokens: 100, moneyUsd: 1, wallClockMs: 0, humanAttentionMinutes: 0, dataAccessCostUsd: 0 },
      [{
        id: 'source-1',
        expectedDecisionImpact: 0.8,
        uncertaintyReduction: 0.7,
        evidenceReliability: 0.9,
        executionProbability: 0.9,
        moneyCostUsd: 1,
        timeCostHours: 0.2,
        humanAttentionHours: 0.1,
        riskPenalty: 0,
      }],
      1,
    )
    expect(selected.blockedByBudget).toBe(false)
    expect(selected.tasks.map(item => item.id)).toEqual(['b'])
    expect(selected.informationOptions[0]?.id).toBe('source-1')
  })

  it('blocks scheduling when a configured budget is exceeded', () => {
    const plan = createMissionPlan({
      id: 'm1',
      objective: 'Question',
      primarySystem: 'investigation',
      createdAt: '2026-10-06T00:00:00Z',
      tasks: [task({ id: 'a' })],
    })
    const selected = selectNextWork(
      plan,
      { moneyLimitUsd: 2 },
      { tokens: 0, moneyUsd: 3, wallClockMs: 0, humanAttentionMinutes: 0, dataAccessCostUsd: 0 },
      [],
      1,
    )
    expect(selected.blockedByBudget).toBe(true)
    expect(selected.tasks).toEqual([])
    expect(selected.budgetReasons).toEqual(['money-limit-exceeded'])
  })
})
