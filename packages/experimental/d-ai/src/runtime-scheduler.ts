/** Durable scheduler admission helpers for D_AI task ledgers. */
import { buildTaskGraph, runnableTasks, type MissionTask } from './task-dag.ts'
import type { DurableTaskLedger } from './task-ledger-state.ts'

export interface SchedulerSelection {
  readonly ownerAgentId: string
  readonly ledgerRevision: number
  readonly selected: readonly MissionTask[]
  readonly blocked: readonly {
    readonly taskId: string
    readonly reason: 'dependency' | 'state'
  }[]
}

export function selectDurableRunnableTasks(
  ledger: DurableTaskLedger,
  maxTasks: number,
): SchedulerSelection {
  if (!Number.isSafeInteger(maxTasks) || maxTasks < 1) {
    throw new Error('maxTasks must be a positive safe integer')
  }

  const graph = buildTaskGraph(ledger.tasks as readonly MissionTask[])
  const runnable = runnableTasks(graph)
  const runnableIds = new Set(runnable.map(task => task.id))

  const blocked = graph.topologicalOrder.flatMap((id) => {
    const task = graph.tasks.get(id)!
    if (runnableIds.has(id)) return []
    if (task.state !== 'PENDING' && task.state !== 'READY') {
      return [{ taskId: id, reason: 'state' as const }]
    }
    const dependencyIncomplete = task.dependsOn.some(dep => graph.tasks.get(dep)?.state !== 'COMPLETED')
    return dependencyIncomplete ? [{ taskId: id, reason: 'dependency' as const }] : []
  })

  return Object.freeze({
    ownerAgentId: ledger.ownerAgentId,
    ledgerRevision: ledger.revision,
    selected: Object.freeze(runnable.slice(0, maxTasks)),
    blocked: Object.freeze(blocked),
  })
}
