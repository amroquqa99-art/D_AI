import type { DirectorPlan } from './director-state.ts'
import type { TaskExecutionResult } from './director-executor.ts'
import type { MissionPhase } from './mission-director.ts'
import type { SchedulerSelection } from './runtime-scheduler.ts'
import type { MissionTask } from './task-dag.ts'

export interface DirectorPlanRuntimeView {
  readonly plan: DirectorPlan
  readonly phase: MissionPhase
  readonly tasks: readonly MissionTask[]
  readonly next: SchedulerSelection
}

export interface DirectorTaskExecution {
  readonly task: MissionTask
  readonly execution: TaskExecutionResult
}

export interface DirectorCycleResult {
  readonly planId: string
  readonly executed: readonly DirectorTaskExecution[]
  readonly phase: MissionPhase
  readonly limitReached: boolean
  readonly next: SchedulerSelection
  readonly waves: number
  readonly peakParallelism: number
  readonly serializedByBudgetProfileIds: readonly string[]
}
