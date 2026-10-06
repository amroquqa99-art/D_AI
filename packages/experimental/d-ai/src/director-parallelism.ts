/** Safe same-plan parallel-wave selection for Mission Director execution. */
import type { BudgetProfile } from './budget-state.ts'
import { budgetProfilesForTask } from './runtime-scheduler.ts'
import type { MissionTask } from './task-dag.ts'

export interface DirectorParallelWave {
  readonly tasks: readonly MissionTask[]
  readonly serializedByBudgetProfileIds: readonly string[]
}

/**
 * Select a deterministic prefix for concurrent execution.
 *
 * Concurrent tasks may not share an applicable durable budget profile. Usage
 * is committed after each task finishes, so allowing shared MISSION/SYSTEM
 * profiles in one wave could over-admit before either worker records usage.
 * The first conflict ends the wave rather than skipping a higher-priority task.
 */
export function selectDirectorParallelWave(
  candidates: readonly MissionTask[],
  budgets: readonly BudgetProfile[],
  maxParallelTasks: number,
): DirectorParallelWave {
  if (!Number.isSafeInteger(maxParallelTasks) || maxParallelTasks < 1 || maxParallelTasks > 8) {
    throw new TypeError('maxParallelTasks must be an integer from 1 to 8')
  }

  const selected: MissionTask[] = []
  const usedProfileIds = new Set<string>()
  const serializedByBudgetProfileIds = new Set<string>()

  for (const task of candidates) {
    if (selected.length >= maxParallelTasks) break
    const profileIds = budgetProfilesForTask(task, budgets).map(profile => profile.id)
    const conflicts = profileIds.filter(id => usedProfileIds.has(id))
    if (conflicts.length > 0) {
      for (const id of conflicts) serializedByBudgetProfileIds.add(id)
      break
    }
    selected.push(task)
    for (const id of profileIds) usedProfileIds.add(id)
  }

  return Object.freeze({
    tasks: Object.freeze([...selected]),
    serializedByBudgetProfileIds: Object.freeze([...serializedByBudgetProfileIds].sort()),
  })
}
