/** Domain-agnostic mission Task DAG primitives for D_AI. */
import type { SystemId } from './systems.ts'

export type TaskState =
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'WAITING_FOR_HUMAN'
  | 'WAITING_FOR_TOOL'
  | 'BLOCKED_POLICY'
  | 'BLOCKED_BUDGET'
  | 'PAUSED'
  | 'FAILED'
  | 'COMPLETED'
  | 'CANCELLED'

export interface MissionTask {
  readonly id: string
  readonly missionId: string
  readonly systemId: SystemId
  readonly title: string
  readonly dependsOn: readonly string[]
  readonly state: TaskState
  readonly priority: number
  readonly attempt: number
  readonly maxAttempts: number
}

export interface TaskGraph {
  readonly tasks: ReadonlyMap<string, MissionTask>
  readonly topologicalOrder: readonly string[]
}

const terminalStates = new Set<TaskState>(['FAILED', 'COMPLETED', 'CANCELLED'])

const transitions: Readonly<Record<TaskState, readonly TaskState[]>> = Object.freeze({
  PENDING: ['READY', 'BLOCKED_POLICY', 'BLOCKED_BUDGET', 'PAUSED', 'CANCELLED'],
  READY: ['RUNNING', 'BLOCKED_POLICY', 'BLOCKED_BUDGET', 'PAUSED', 'CANCELLED'],
  RUNNING: ['WAITING_FOR_HUMAN', 'WAITING_FOR_TOOL', 'BLOCKED_POLICY', 'BLOCKED_BUDGET', 'PAUSED', 'FAILED', 'COMPLETED', 'CANCELLED'],
  WAITING_FOR_HUMAN: ['READY', 'PAUSED', 'CANCELLED'],
  WAITING_FOR_TOOL: ['READY', 'PAUSED', 'FAILED', 'CANCELLED'],
  BLOCKED_POLICY: ['READY', 'PAUSED', 'CANCELLED'],
  BLOCKED_BUDGET: ['READY', 'PAUSED', 'CANCELLED'],
  PAUSED: ['PENDING', 'READY', 'CANCELLED'],
  FAILED: ['PENDING', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
})

function assertIdentity(value: string, field: string): void {
  if (value.trim().length === 0 || value.length > 240) throw new Error(`Invalid ${field}`)
}

function freezeTask(task: MissionTask): MissionTask {
  assertIdentity(task.id, 'task id')
  assertIdentity(task.missionId, 'mission id')
  assertIdentity(task.title, 'task title')
  if (!Number.isSafeInteger(task.priority)) throw new Error('Task priority must be a safe integer')
  if (!Number.isSafeInteger(task.attempt) || task.attempt < 0) throw new Error('Task attempt must be a non-negative safe integer')
  if (!Number.isSafeInteger(task.maxAttempts) || task.maxAttempts < 1) throw new Error('Task maxAttempts must be a positive safe integer')
  if (task.attempt > task.maxAttempts) throw new Error('Task attempt exceeds maxAttempts')
  if (new Set(task.dependsOn).size !== task.dependsOn.length) throw new Error(`Task ${task.id} contains duplicate dependencies`)
  if (task.dependsOn.includes(task.id)) throw new Error(`Task ${task.id} cannot depend on itself`)
  return Object.freeze({ ...task, dependsOn: Object.freeze([...task.dependsOn]) })
}

/**
 * Validate task identity/dependencies and compute a deterministic topological
 * order. A cycle is rejected before scheduler admission.
 */
export function buildTaskGraph(input: readonly MissionTask[]): TaskGraph {
  const tasks = new Map<string, MissionTask>()
  for (const raw of input) {
    const task = freezeTask(raw)
    if (tasks.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`)
    tasks.set(task.id, task)
  }

  for (const task of tasks.values()) {
    for (const dependency of task.dependsOn) {
      const parent = tasks.get(dependency)
      if (parent === undefined) throw new Error(`Task ${task.id} depends on unknown task ${dependency}`)
      if (parent.missionId !== task.missionId) throw new Error(`Task ${task.id} cannot depend on a task from another mission`)
    }
  }

  const indegree = new Map<string, number>()
  const children = new Map<string, string[]>()
  for (const task of tasks.values()) {
    indegree.set(task.id, task.dependsOn.length)
    for (const dependency of task.dependsOn) {
      const list = children.get(dependency) ?? []
      list.push(task.id)
      children.set(dependency, list)
    }
  }

  const ready = [...tasks.keys()].filter(id => indegree.get(id) === 0).sort()
  const order: string[] = []
  while (ready.length > 0) {
    const id = ready.shift()!
    order.push(id)
    for (const child of (children.get(id) ?? []).sort()) {
      const next = (indegree.get(child) ?? 0) - 1
      indegree.set(child, next)
      if (next === 0) {
        ready.push(child)
        ready.sort()
      }
    }
  }
  if (order.length !== tasks.size) throw new Error('Task graph contains a dependency cycle')

  return Object.freeze({
    tasks,
    topologicalOrder: Object.freeze(order),
  })
}

/** Return tasks that can be admitted now without ignoring policy/runtime state. */
export function runnableTasks(graph: TaskGraph): readonly MissionTask[] {
  return Object.freeze(
    graph.topologicalOrder
      .map(id => graph.tasks.get(id)!)
      .filter(task => (task.state === 'PENDING' || task.state === 'READY')
        && task.dependsOn.every(id => graph.tasks.get(id)?.state === 'COMPLETED'))
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)),
  )
}

export function transitionTask(task: MissionTask, next: TaskState): MissionTask {
  if (task.state === next) return task
  if (!transitions[task.state].includes(next)) throw new Error(`Invalid task transition ${task.state} -> ${next}`)
  if (task.state === 'FAILED' && next === 'PENDING' && task.attempt >= task.maxAttempts) {
    throw new Error('Task retry budget exhausted')
  }
  return freezeTask({
    ...task,
    state: next,
    attempt: task.state === 'FAILED' && next === 'PENDING' ? task.attempt + 1 : task.attempt,
  })
}

export function taskIsTerminal(task: MissionTask): boolean {
  return terminalStates.has(task.state)
}
