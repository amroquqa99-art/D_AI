import z from '@deepseek-ai/schemastery'
import type { InvestigationDelegationConfig } from './orchestration.ts'
import type { ScientificDelegationConfig } from './scientific-orchestration.ts'
import type { InvestorDelegationConfig } from './investor-orchestration.ts'
import type { CyberDelegationConfig } from './cyber-orchestration.ts'
import type { OperationsDelegationConfig } from './operations-orchestration.ts'
import type { InnovationDelegationConfig } from './innovation-orchestration.ts'

/** Deployment-owned configuration. Model output must never mutate these bounds. */
export interface Config {
  subagentProvider?: string
  maxDepth?: number
  maxOutputTokens?: number
  maxRequestsPerChild?: number
  timeoutMs?: number
  maxSourceBytes?: number
  maxMissionBytes?: number
  maxSources?: number
  researchModel?: string
  verificationModel?: string
  literatureModel?: string
  methodologyModel?: string
  fundamentalModel?: string
  riskModel?: string
  cyberAssessmentModel?: string
  cyberRemediationModel?: string
  operationsFusionModel?: string
  operationsAdversarialModel?: string
  innovationExplorerModel?: string
  innovationCriticModel?: string
  allowedTools?: string[]
  maxResultBytes?: number
  directorSchedulerEnabled?: boolean
  directorSchedulerPollMs?: number
  directorSchedulerMaxConcurrentCycles?: number
}

export interface DAILimits {
  readonly maxSourceBytes: number
  readonly maxMissionBytes: number
  readonly maxSources: number
}

export interface DelegationConfiguration {
  readonly investigation: InvestigationDelegationConfig
  readonly scientific: ScientificDelegationConfig
  readonly investor: InvestorDelegationConfig
  readonly cyber: CyberDelegationConfig
  readonly operations: OperationsDelegationConfig
  readonly innovation: InnovationDelegationConfig
}

export interface DirectorSchedulerConfiguration {
  readonly enabled: boolean
  readonly pollMs: number
  readonly maxConcurrentCycles: number
}

export interface RuntimeConfiguration {
  readonly limits: DAILimits
  readonly delegations: DelegationConfiguration
  readonly scheduler: DirectorSchedulerConfiguration
}

/**
 * Cordis-facing schema. Keep defaults aligned with buildRuntimeConfiguration;
 * the builder also supports direct programmatic construction in tests.
 */
export const configSchema: z<Config> = z.object({
  subagentProvider: z.string().default('spawn'),
  maxDepth: z.number().step(1).min(1).default(3),
  maxOutputTokens: z.number().step(1).min(1).default(4096),
  maxRequestsPerChild: z.number().step(1).min(1).default(8),
  timeoutMs: z.number().step(1).min(1).default(120000),
  maxSourceBytes: z.number().step(1).min(1).default(200000),
  maxMissionBytes: z.number().step(1).min(1).default(2000000),
  maxSources: z.number().step(1).min(1).default(32),
  researchModel: z.string(),
  verificationModel: z.string(),
  literatureModel: z.string(),
  methodologyModel: z.string(),
  fundamentalModel: z.string(),
  riskModel: z.string(),
  cyberAssessmentModel: z.string(),
  cyberRemediationModel: z.string(),
  operationsFusionModel: z.string(),
  operationsAdversarialModel: z.string(),
  innovationExplorerModel: z.string(),
  innovationCriticModel: z.string(),
  allowedTools: z.array(z.string()).default(['web_search', 'web_fetch']),
  maxResultBytes: z.number().step(1).min(1).default(65536),
  directorSchedulerEnabled: z.boolean().default(false),
  directorSchedulerPollMs: z.number().step(1).min(10).default(1000),
  directorSchedulerMaxConcurrentCycles: z.number().step(1).min(1).max(32).default(1),
})

function positiveSafeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer`)
  }
  return value
}

interface DelegationBase {
  readonly provider: string
  readonly maxDepth: number
  readonly maxOutputTokens: number
  readonly maxRequestsPerChild: number
  readonly timeoutMs: number
  readonly allowedTools: readonly string[]
  readonly maxResultBytes: number
}

function baseDelegation(config: Config, allowedTools: readonly string[]): DelegationBase {
  return {
    provider: config.subagentProvider ?? 'spawn',
    maxDepth: positiveSafeInteger('maxDepth', config.maxDepth ?? 3),
    maxOutputTokens: positiveSafeInteger('maxOutputTokens', config.maxOutputTokens ?? 4096),
    maxRequestsPerChild: positiveSafeInteger('maxRequestsPerChild', config.maxRequestsPerChild ?? 8),
    timeoutMs: positiveSafeInteger('timeoutMs', config.timeoutMs ?? 120000),
    allowedTools: [...allowedTools],
    maxResultBytes: positiveSafeInteger('maxResultBytes', config.maxResultBytes ?? 65536),
  }
}

/** Normalize deployment config once so the service constructor stays a composition root. */
export function buildRuntimeConfiguration(config: Config = {}): RuntimeConfiguration {
  const limits: DAILimits = {
    maxSourceBytes: positiveSafeInteger('maxSourceBytes', config.maxSourceBytes ?? 200000),
    maxMissionBytes: positiveSafeInteger('maxMissionBytes', config.maxMissionBytes ?? 2000000),
    maxSources: positiveSafeInteger('maxSources', config.maxSources ?? 32),
  }

  const defaultTools = config.allowedTools ?? ['web_search', 'web_fetch']
  const standard = baseDelegation(config, defaultTools)
  const defensive = baseDelegation(config, config.allowedTools ?? [])

  const investigation: InvestigationDelegationConfig = {
    ...standard,
    ...(config.researchModel === undefined ? {} : { researchModel: config.researchModel }),
    ...(config.verificationModel === undefined ? {} : { verificationModel: config.verificationModel }),
  }
  const scientific: ScientificDelegationConfig = {
    ...standard,
    ...(config.literatureModel === undefined ? {} : { literatureModel: config.literatureModel }),
    ...(config.methodologyModel === undefined ? {} : { methodologyModel: config.methodologyModel }),
  }
  const investor: InvestorDelegationConfig = {
    ...standard,
    ...(config.fundamentalModel === undefined ? {} : { fundamentalModel: config.fundamentalModel }),
    ...(config.riskModel === undefined ? {} : { riskModel: config.riskModel }),
  }
  const cyber: CyberDelegationConfig = {
    ...defensive,
    ...(config.cyberAssessmentModel === undefined ? {} : { assessmentModel: config.cyberAssessmentModel }),
    ...(config.cyberRemediationModel === undefined ? {} : { remediationModel: config.cyberRemediationModel }),
  }
  const operations: OperationsDelegationConfig = {
    ...standard,
    ...(config.operationsFusionModel === undefined ? {} : { fusionModel: config.operationsFusionModel }),
    ...(config.operationsAdversarialModel === undefined ? {} : { adversarialModel: config.operationsAdversarialModel }),
  }
  const innovation: InnovationDelegationConfig = {
    ...standard,
    ...(config.innovationExplorerModel === undefined ? {} : { explorerModel: config.innovationExplorerModel }),
    ...(config.innovationCriticModel === undefined ? {} : { criticModel: config.innovationCriticModel }),
  }

  const scheduler: DirectorSchedulerConfiguration = {
    enabled: config.directorSchedulerEnabled ?? false,
    pollMs: positiveSafeInteger('directorSchedulerPollMs', config.directorSchedulerPollMs ?? 1000),
    maxConcurrentCycles: positiveSafeInteger(
      'directorSchedulerMaxConcurrentCycles',
      config.directorSchedulerMaxConcurrentCycles ?? 1,
    ),
  }
  if (scheduler.pollMs < 10) throw new TypeError('directorSchedulerPollMs must be at least 10 ms')
  if (scheduler.maxConcurrentCycles > 32) {
    throw new TypeError('directorSchedulerMaxConcurrentCycles must be at most 32')
  }

  return Object.freeze({
    limits: Object.freeze(limits),
    scheduler: Object.freeze(scheduler),
    delegations: Object.freeze({
      investigation: Object.freeze(investigation),
      scientific: Object.freeze(scientific),
      investor: Object.freeze(investor),
      cyber: Object.freeze(cyber),
      operations: Object.freeze(operations),
      innovation: Object.freeze(innovation),
    }),
  })
}
