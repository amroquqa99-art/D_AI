import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionProjectionStateMap } from '@deepseek-ai/dsh-session-projection/types'
import { DaiRuntimeKernel } from './runtime-kernel.ts'
import { failDai } from './runtime-errors.ts'

/** Projection keys owned by the D_AI runtime. */
export type DaiProjectionKey =
  | 'dai'
  | 'daiScientificResearch'
  | 'daiInvestor'
  | 'daiCybersecurity'
  | 'daiOperationsIntelligence'
  | 'daiInnovationDiscovery'
  | 'daiTaskLedger'
  | 'daiDirector'
  | 'daiModelLifecycle'
  | 'daiTraining'
  | 'daiModelRegistry'
  | 'daiExecution'
  | 'daiEvidenceStore'
  | 'daiBudgets'
  | 'daiControlPlane'

const projectionLabels: Readonly<Record<DaiProjectionKey, string>> = Object.freeze({
  dai: 'D_AI',
  daiScientificResearch: 'Scientific Research',
  daiInvestor: 'Investor',
  daiCybersecurity: 'Cybersecurity',
  daiOperationsIntelligence: 'Operations & Intelligence',
  daiInnovationDiscovery: 'Innovation & Discovery',
  daiTaskLedger: 'Task ledger',
  daiDirector: 'Mission Director',
  daiModelLifecycle: 'Model lifecycle',
  daiTraining: 'Training governance',
  daiModelRegistry: 'Model registry',
  daiExecution: 'Execution',
  daiEvidenceStore: 'Evidence store',
  daiBudgets: 'Budget',
  daiControlPlane: 'Control plane',
})

type DaiProjectionState = SessionProjectionStateMap[DaiProjectionKey]

/**
 * Detach and recursively freeze a plain runtime value before returning it
 * across a service boundary. Session projections remain internally owned.
 */
export function immutableSnapshot<T>(value: T): T {
  const copy = structuredClone(value)

  const freeze = (item: unknown): void => {
    if (item === null || typeof item !== 'object') return
    for (const child of Object.values(item)) freeze(child)
    Object.freeze(item)
  }

  freeze(copy)
  return copy
}

function projectionFailure(state: DaiProjectionState): string | undefined {
  return state.failure
}

/**
 * Typed read boundary for all D_AI Session projections.
 *
 * The generic key is preserved through SessionProjectionStateMap, so callers
 * receive the exact projection state type without casts or duplicated schema
 * knowledge.
 */
export class DaiProjectionReader {
  constructor(
    private readonly ctx: Context,
    private readonly kernel: DaiRuntimeKernel,
  ) {}

  read<K extends DaiProjectionKey>(
    agent: Agent,
    key: K,
  ): SessionProjectionStateMap[K] {
    this.kernel.authorizeOwner(agent)

    const state = this.ctx.sessionProjections.stateOf(agent.session, key)
    if (state === undefined) {
      failDai(
        projectionLabels[key] + ' projection is not mounted',
        'D_AI_PROJECTION_MISSING',
      )
    }

    const failure = projectionFailure(state)
    if (failure !== undefined) {
      failDai(failure, 'D_AI_CORRUPT_STATE')
    }

    return immutableSnapshot(state)
  }
}
