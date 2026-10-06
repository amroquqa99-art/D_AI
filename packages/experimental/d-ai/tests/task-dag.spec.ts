import { describe, expect, it } from 'vitest'
import { buildTaskGraph, runnableTasks, taskIsTerminal, transitionTask, type MissionTask } from '../src/task-dag.ts'

function task(overrides: Partial<MissionTask> & Pick<MissionTask, 'id'>): MissionTask {
  return {
    id: overrides.id,
    missionId: overrides.missionId ?? 'mission-1',
    systemId: overrides.systemId ?? 'investigation',
    title: overrides.title ?? overrides.id,
    dependsOn: overrides.dependsOn ?? [],
    state: overrides.state ?? 'PENDING',
    priority: overrides.priority ?? 0,
    attempt: overrides.attempt ?? 0,
    maxAttempts: overrides.maxAttempts ?? 2,
  }
}

describe('D_AI task DAG foundation', () => {
  it('builds a deterministic graph and returns only dependency-satisfied tasks', () => {
    const graph = buildTaskGraph([
      task({ id: 'collect', state: 'COMPLETED' }),
      task({ id: 'verify', dependsOn: ['collect'], priority: 5 }),
      task({ id: 'synthesize', dependsOn: ['verify'], priority: 10 }),
      task({ id: 'parallel', priority: 1 }),
    ])

    expect(graph.topologicalOrder).toEqual(['collect', 'parallel', 'verify', 'synthesize'])
    expect(runnableTasks(graph).map(item => item.id)).toEqual(['verify', 'parallel'])
  })

  it('rejects cycles, unknown dependencies and cross-mission dependencies', () => {
    expect(() => buildTaskGraph([
      task({ id: 'a', dependsOn: ['b'] }),
      task({ id: 'b', dependsOn: ['a'] }),
    ])).toThrow('dependency cycle')

    expect(() => buildTaskGraph([task({ id: 'a', dependsOn: ['missing'] })])).toThrow('unknown task')

    expect(() => buildTaskGraph([
      task({ id: 'root', missionId: 'm1' }),
      task({ id: 'child', missionId: 'm2', dependsOn: ['root'] }),
    ])).toThrow('another mission')
  })

  it('enforces state transitions and retry budgets', () => {
    const running = transitionTask(task({ id: 'x', state: 'READY' }), 'RUNNING')
    const failed = transitionTask(running, 'FAILED')
    const retried = transitionTask(failed, 'PENDING')

    expect(retried.attempt).toBe(1)
    expect(() => transitionTask({ ...failed, attempt: 2, maxAttempts: 2 }, 'PENDING')).toThrow('retry budget exhausted')
    expect(() => transitionTask(task({ id: 'y', state: 'COMPLETED' }), 'RUNNING')).toThrow('Invalid task transition')
  })

  it('recognizes terminal states', () => {
    expect(taskIsTerminal(task({ id: 'a', state: 'COMPLETED' }))).toBe(true)
    expect(taskIsTerminal(task({ id: 'b', state: 'FAILED' }))).toBe(true)
    expect(taskIsTerminal(task({ id: 'c', state: 'RUNNING' }))).toBe(false)
  })
})
