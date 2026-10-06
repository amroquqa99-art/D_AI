/** Durable scheduler admission helpers for D_AI task ledgers. */
import { buildTaskGraph, runnableTasks, type MissionTask } from './task-dag.ts'
import type { DurableTaskLedger } from './task-ledger-state.ts'
import type { BudgetProfile } from './budget-state.ts'
import { checkBudget } from './resource-value.ts'

export interface SchedulerBlockedTask {
  readonly taskId: string
  readonly reason: 'dependency' | 'state' | 'budget'
  readonly details: readonly string[]
}

export interface SchedulerSelection {
  readonly ownerAgentId: string
  readonly ledgerRevision: number
  readonly selected: readonly MissionTask[]
  readonly blocked: readonly SchedulerBlockedTask[]
}

/** Budget profiles whose scope applies directly to one durable task. */
export function budgetProfilesForTask(task: MissionTask, budgets: readonly BudgetProfile[]): readonly BudgetProfile[] {
  return budgets.filter(profile =>
    (profile.scope === 'TASK' && profile.scopeId === task.id)
    || (profile.scope === 'MISSION' && profile.scopeId === task.missionId)
    || (profile.scope === 'SYSTEM' && profile.scopeId === task.systemId))
}

export function selectDurableRunnableTasks(
  ledger: DurableTaskLedger,
  maxTasks: number,
  budgets: readonly BudgetProfile[] = [],
): SchedulerSelection {
  if (!Number.isSafeInteger(maxTasks) || maxTasks < 1) {
    throw new Error('maxTasks must be a positive safe integer')
  }

  const graph = buildTaskGraph(ledger.tasks as readonly MissionTask[])
  const structurallyRunnable = runnableTasks(graph)
  const runnableIds = new Set(structurallyRunnable.map(task => task.id))
  const budgetBlocked = new Map<string, readonly string[]>()

  const admitted = structurallyRunnable.filter((task) => {
    const reasons = budgetProfilesForTask(task, budgets)
      .flatMap(profile => checkBudget(profile.limits, profile.usage).reasons)
    if (reasons.length === 0) return true
    budgetBlocked.set(task.id, Object.freeze([...new Set(reasons)].sort()))
    return false
  })

  const blocked = graph.topologicalOrder.flatMap((id): SchedulerBlockedTask[] => {
    const task = graph.tasks.get(id)!
    const budgetReasons = budgetBlocked.get(id)
    if (budgetReasons !== undefined) {
      return [{ taskId: id, reason: 'budget', details: budgetReasons }]
    }
    if (runnableIds.has(id)) return []
    if (task.state !== 'PENDING' && task.state !== 'READY') {
      return [{ taskId: id, reason: 'state', details: [] }]
    }
    const dependencyIncomplete = task.dependsOn.some(dep => graph.tasks.get(dep)?.state !== 'COMPLETED')
    return dependencyIncomplete ? [{ taskId: id, reason: 'dependency', details: [] }] : []
  })

  return Object.freeze({
    ownerAgentId: ledger.ownerAgentId,
    ledgerRevision: ledger.revision,
    selected: Object.freeze(admitted.slice(0, maxTasks)),
    blocked: Object.freeze(blocked),
  })
}
