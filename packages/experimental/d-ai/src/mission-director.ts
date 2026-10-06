/** Domain-neutral Mission Director planning primitives. */
import { buildTaskGraph, runnableTasks, type MissionTask, type TaskGraph } from './task-dag.ts'
import { checkBudget, rankInformationOptions, type InformationOption, type ResourceBudget, type ResourceUsage } from './resource-value.ts'
import { getSystemManifest, type SystemId } from './systems.ts'

export type MissionPhase = 'PLANNING' | 'EXECUTING' | 'WAITING_FOR_HUMAN' | 'BLOCKED' | 'PAUSED' | 'COMPLETE'


export type DirectorPlanStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETE'

/** Derive the visible mission phase from durable plan/task state only. */
export function deriveMissionPhase(
  planStatus: DirectorPlanStatus,
  tasks: readonly MissionTask[],
): MissionPhase {
  if (planStatus === 'PAUSED') return 'PAUSED'
  if (planStatus === 'COMPLETE') return 'COMPLETE'
  if (tasks.length === 0) return 'PLANNING'
  if (tasks.every(task => task.state === 'COMPLETED' || task.state === 'CANCELLED')) return 'COMPLETE'
  if (tasks.some(task => task.state === 'WAITING_FOR_HUMAN')) return 'WAITING_FOR_HUMAN'
  if (tasks.some(task =>
    task.state === 'BLOCKED_POLICY'
    || task.state === 'BLOCKED_BUDGET'
    || task.state === 'FAILED')) return 'BLOCKED'
  return 'EXECUTING'
}

export interface MissionPlan {
  readonly id: string
  readonly objective: string
  readonly primarySystem: SystemId
  readonly phase: MissionPhase
  readonly graph: TaskGraph
  readonly createdAt: string
  readonly stopConditions: readonly string[]
}

export interface MissionPlanInput {
  readonly id: string
  readonly objective: string
  readonly primarySystem: SystemId
  readonly tasks: readonly MissionTask[]
  readonly createdAt: string
  readonly stopConditions?: readonly string[]
}

export interface NextWorkSelection {
  readonly blockedByBudget: boolean
  readonly budgetReasons: readonly string[]
  readonly tasks: readonly MissionTask[]
  readonly informationOptions: readonly ReturnType<typeof rankInformationOptions>[number][]
}

function nonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) throw new Error(`${name} is required`)
}

export function createMissionPlan(input: MissionPlanInput): MissionPlan {
  nonEmpty('mission id', input.id)
  nonEmpty('objective', input.objective)
  if (!Number.isFinite(Date.parse(input.createdAt))) throw new Error('createdAt must be an ISO timestamp')
  getSystemManifest(input.primarySystem)

  for (const task of input.tasks) {
    if (task.missionId !== input.id) throw new Error(`Task ${task.id} does not belong to mission ${input.id}`)
  }

  const graph = buildTaskGraph(input.tasks)
  return Object.freeze({
    id: input.id,
    objective: input.objective,
    primarySystem: input.primarySystem,
    phase: 'PLANNING',
    graph,
    createdAt: input.createdAt,
    stopConditions: Object.freeze([...(input.stopConditions ?? [])]),
  })
}

/**
 * Select currently runnable work without mutating durable state.
 * Scheduler admission, leases and execution are separate runtime responsibilities.
 */
export function selectNextWork(
  plan: MissionPlan,
  budget: ResourceBudget,
  usage: ResourceUsage,
  options: readonly InformationOption[],
  maxTasks: number,
): NextWorkSelection {
  if (!Number.isSafeInteger(maxTasks) || maxTasks < 1) throw new Error('maxTasks must be a positive safe integer')

  const budgetCheck = checkBudget(budget, usage)
  if (!budgetCheck.allowed) {
    return Object.freeze({
      blockedByBudget: true,
      budgetReasons: budgetCheck.reasons,
      tasks: Object.freeze([]),
      informationOptions: rankInformationOptions(options),
    })
  }

  return Object.freeze({
    blockedByBudget: false,
    budgetReasons: Object.freeze([]),
    tasks: Object.freeze(runnableTasks(plan.graph).slice(0, maxTasks)),
    informationOptions: rankInformationOptions(options),
  })
}
