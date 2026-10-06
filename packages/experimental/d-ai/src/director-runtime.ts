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

/**
 * A Director cycle may fail after some workers have already committed durable
 * task results. Preserve that partial cycle so scheduler receipts and callers
 * never report zero work merely because a later worker failed.
 */
export class DirectorCycleExecutionError extends Error {
  readonly partial: DirectorCycleResult

  constructor(partial: DirectorCycleResult, cause: unknown) {
    super('D_AI Director cycle failed after partial execution', { cause })
    this.name = 'DirectorCycleExecutionError'
    this.partial = partial
  }
}
