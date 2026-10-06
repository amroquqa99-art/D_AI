import type { Context } from '@deepseek-ai/cordis'
import type { PlatformToolRuntime } from './platform-tools.ts'
import { registerPlatformTools } from './platform-tools.ts'
import type { TasksDirectorToolRuntime } from './tasks-director-tools.ts'
import { registerTasksDirectorTools } from './tasks-director-tools.ts'
import type { ModelsTrainingToolRuntime } from './models-training-tools.ts'
import { registerModelsTrainingTools } from './models-training-tools.ts'
import type { ExecutionToolRuntime } from './execution-tools.ts'
import { registerExecutionTools } from './execution-tools.ts'
import type { EvidenceControlToolRuntime } from './evidence-control-tools.ts'
import { registerEvidenceControlTools } from './evidence-control-tools.ts'
import type { ScientificToolRuntime } from './scientific-tools.ts'
import { registerScientificTools } from './scientific-tools.ts'
import type { InvestorToolRuntime } from './investor-tools.ts'
import { registerInvestorTools } from './investor-tools.ts'
import type { CyberToolRuntime } from './cyber-tools.ts'
import { registerCyberTools } from './cyber-tools.ts'
import type { OperationsToolRuntime } from './operations-tools.ts'
import { registerOperationsTools } from './operations-tools.ts'
import type { InnovationToolRuntime } from './innovation-tools.ts'
import { registerInnovationTools } from './innovation-tools.ts'
import type { InvestigationToolRuntime } from './investigation-tools.ts'
import { registerInvestigationTools } from './investigation-tools.ts'
import type { ToolOwnerResolver } from './tool-support.ts'

export type DaiToolRuntime =
  PlatformToolRuntime
  & TasksDirectorToolRuntime
  & ModelsTrainingToolRuntime
  & ExecutionToolRuntime
  & EvidenceControlToolRuntime
  & ScientificToolRuntime
  & InvestorToolRuntime
  & CyberToolRuntime
  & OperationsToolRuntime
  & InnovationToolRuntime
  & InvestigationToolRuntime

export interface DaiToolTimeouts {
  readonly director: number
  readonly investigation: number
  readonly scientific: number
  readonly investor: number
  readonly cyber: number
  readonly operations: number
  readonly innovation: number
}

/** Compose the complete native D_AI tool surface from bounded-context registrars. */
export function registerDaiTools(
  ctx: Context,
  runtime: DaiToolRuntime,
  owner: ToolOwnerResolver,
  timeouts: DaiToolTimeouts,
): void {
  registerPlatformTools(ctx, runtime, owner)
  registerTasksDirectorTools(ctx, runtime, owner, timeouts.director)
  registerModelsTrainingTools(ctx, runtime, owner)
  registerExecutionTools(ctx, runtime, owner)
  registerEvidenceControlTools(ctx, runtime, owner)

  registerScientificTools(ctx, runtime, owner, timeouts.scientific)
  registerInvestorTools(ctx, runtime, owner, timeouts.investor)
  registerCyberTools(ctx, runtime, owner, timeouts.cyber)
  registerOperationsTools(ctx, runtime, owner, timeouts.operations)
  registerInnovationTools(ctx, runtime, owner, timeouts.innovation)
  registerInvestigationTools(ctx, runtime, owner, timeouts.investigation)
}
