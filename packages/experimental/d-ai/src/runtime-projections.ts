import type { Context } from '@deepseek-ai/cordis'
import { missionProjection } from './state.ts'
import { scientificProjection } from './scientific-state.ts'
import { investorProjection } from './investor-state.ts'
import { cyberProjection } from './cyber-state.ts'
import { operationsProjection } from './operations-state.ts'
import { innovationProjection } from './innovation-state.ts'
import { taskLedgerProjection } from './task-ledger-state.ts'
import { controlPlaneProjection } from './control-plane-state.ts'
import { budgetProjection } from './budget-state.ts'
import { evidenceStoreProjection } from './evidence-store-state.ts'
import { executionProjection } from './execution-state.ts'
import { modelRegistryProjection } from './model-registry-state.ts'
import { trainingProjection } from './training-state.ts'
import { modelLifecycleProjection } from './model-lifecycle-state.ts'
import { directorProjection } from './director-state.ts'
import { directorScheduleProjection } from './director-schedule-state.ts'
import { sideEffectProjection } from './side-effect-state.ts'

/**
 * Mount every persistent D_AI projection at the native Session boundary.
 * Keeping this list centralized makes persistence additions reviewable and
 * prevents the service constructor from silently becoming a second registry.
 */
export function mountDaiProjections(ctx: Context): void {
  ctx.effect(() => ctx.sessionProjections.register(missionProjection), 'dai.projection()')
  ctx.effect(() => ctx.sessionProjections.register(scientificProjection), 'dai.scientificProjection()')
  ctx.effect(() => ctx.sessionProjections.register(investorProjection), 'dai.investorProjection()')
  ctx.effect(() => ctx.sessionProjections.register(cyberProjection), 'dai.cyberProjection()')
  ctx.effect(() => ctx.sessionProjections.register(operationsProjection), 'dai.operationsProjection()')
  ctx.effect(() => ctx.sessionProjections.register(innovationProjection), 'dai.innovationProjection()')
  ctx.effect(() => ctx.sessionProjections.register(taskLedgerProjection), 'dai.taskLedgerProjection()')
  ctx.effect(() => ctx.sessionProjections.register(controlPlaneProjection), 'dai.controlPlaneProjection()')
  ctx.effect(() => ctx.sessionProjections.register(budgetProjection), 'dai.budgetProjection()')
  ctx.effect(() => ctx.sessionProjections.register(evidenceStoreProjection), 'dai.evidenceStoreProjection()')
  ctx.effect(() => ctx.sessionProjections.register(executionProjection), 'dai.executionProjection()')
  ctx.effect(() => ctx.sessionProjections.register(modelRegistryProjection), 'dai.modelRegistryProjection()')
  ctx.effect(() => ctx.sessionProjections.register(trainingProjection), 'dai.trainingProjection()')
  ctx.effect(() => ctx.sessionProjections.register(modelLifecycleProjection), 'dai.modelLifecycleProjection()')
  ctx.effect(() => ctx.sessionProjections.register(directorProjection), 'dai.directorProjection()')
  ctx.effect(() => ctx.sessionProjections.register(directorScheduleProjection), 'dai.directorScheduleProjection()')
  ctx.effect(() => ctx.sessionProjections.register(sideEffectProjection), 'dai.sideEffectProjection()')
}
