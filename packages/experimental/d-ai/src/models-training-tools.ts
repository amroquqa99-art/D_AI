import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { CapabilityGrant } from './capability-grants.ts'
import type { ModelEvaluationResult, PromotionPolicy } from './model-evaluation.ts'
import type { ModelLifecycleLedger, ModelLifecycleState } from './model-lifecycle-state.ts'
import type { ModelRegistry, ModelRegistryState, ModelRoutingPolicy } from './model-registry-state.ts'
import type { ModelCapability, ModelProfile, RoutedModel } from './model-router.ts'
import { SYSTEMS } from './state.ts'
import type { DataSensitivity, TrainingDataCandidate } from './training-governance.ts'
import type { TrainingLedger, TrainingState } from './training-state.ts'
import { encodeToolResult, jsonToolOutput, rejectInvalidInput } from './tool-support.ts'
import type { ToolOwnerResolver } from './tool-support.ts'

export interface ModelsTrainingToolRuntime {
  readModelLifecycle(agent: Agent): ModelLifecycleState
  recordModelEvaluation(
    agent: Agent,
    input: { readonly result: ModelEvaluationResult; readonly artifactRef: string },
    signal?: AbortSignal,
  ): Promise<ModelLifecycleLedger>
  evaluateGovernedModelPromotion(
    agent: Agent,
    input: {
      readonly baselineEvaluationId: string
      readonly candidateEvaluationId: string
      readonly policy: PromotionPolicy
    },
    signal?: AbortSignal,
  ): Promise<ModelLifecycleLedger>
  readTraining(agent: Agent): TrainingState
  registerTrainingCandidate(
    agent: Agent,
    input: Omit<TrainingDataCandidate, 'id' | 'humanApproved'> & { readonly artifactRef: string },
    signal?: AbortSignal,
  ): Promise<TrainingLedger>
  buildTrainingDataset(
    agent: Agent,
    input: {
      readonly datasetId: string
      readonly version: number
      readonly candidateIds: readonly string[]
      readonly holdoutCandidateIds: readonly string[]
    },
    signal?: AbortSignal,
  ): Promise<TrainingLedger>
  readModelRegistry(agent: Agent): ModelRegistryState
  upsertModelProfile(agent: Agent, profile: ModelProfile, signal?: AbortSignal): Promise<ModelRegistry>
  setModelRoutingPolicy(
    agent: Agent,
    input: Omit<ModelRoutingPolicy, 'id' | 'updatedAt' | 'updatedBy'>,
    signal?: AbortSignal,
  ): Promise<ModelRegistry>
  routeRegisteredModel(
    agent: Agent,
    systemId: CapabilityGrant['systemId'],
    role: string,
  ): RoutedModel
}

export function registerModelsTrainingTools(
  ctx: Context,
  runtime: ModelsTrainingToolRuntime,
  owner: ToolOwnerResolver,
): void {
  ctx.tools.register(defineTool({
    name: 'd_ai_model_lifecycle_read',
    description: 'Read governed Local Intelligence Core model evaluations, promotion decisions and rollback pointers. No model artifact bytes are stored here.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.readModelLifecycle(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_model_evaluation_record',
    description: 'Record one externally produced model evaluation by artifact reference after human approval. The evaluation must reference an existing governed dataset.',
    parameters: {
      model_id: { type: 'string', required: true },
      dataset_id: { type: 'string', required: true },
      holdout_id: { type: 'string', required: true },
      artifact_ref: { type: 'string', required: true },
      completed_at: { type: 'string', required: true },
      independent_evaluator: { type: 'string', required: true },
      correctness: { type: 'number', required: true },
      domain_quality: { type: 'number', required: true },
      tool_use_reliability: { type: 'number', required: true },
      robustness: { type: 'number', required: true },
      safety: { type: 'number', required: true },
      latency_score: { type: 'number', required: true },
      efficiency_score: { type: 'number', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(runtime.recordModelEvaluation(owner(exec.agent), {
      artifactRef: args.artifact_ref,
      result: {
        modelId: args.model_id,
        datasetId: args.dataset_id,
        holdoutId: args.holdout_id,
        completedAt: args.completed_at,
        independentEvaluator: args.independent_evaluator,
        metrics: {
          correctness: args.correctness,
          domainQuality: args.domain_quality,
          toolUseReliability: args.tool_use_reliability,
          robustness: args.robustness,
          safety: args.safety,
          latencyScore: args.latency_score,
          efficiencyScore: args.efficiency_score,
        },
      },
    }, exec.signal)),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_model_promotion_evaluate',
    description: 'Recompute and persist a baseline/candidate promotion decision after human approval. Successful decisions create rollback pointers but do not deploy models.',
    parameters: {
      baseline_evaluation_id: { type: 'string', required: true },
      candidate_evaluation_id: { type: 'string', required: true },
      min_correctness: { type: 'number', required: true },
      min_domain_quality: { type: 'number', required: true },
      min_tool_use_reliability: { type: 'number', required: true },
      min_robustness: { type: 'number', required: true },
      min_safety: { type: 'number', required: true },
      max_allowed_regression: { type: 'number', required: true },
      require_distinct_evaluator: { type: 'boolean', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(runtime.evaluateGovernedModelPromotion(
      owner(exec.agent),
      {
        baselineEvaluationId: args.baseline_evaluation_id,
        candidateEvaluationId: args.candidate_evaluation_id,
        policy: {
          minCorrectness: args.min_correctness,
          minDomainQuality: args.min_domain_quality,
          minToolUseReliability: args.min_tool_use_reliability,
          minRobustness: args.min_robustness,
          minSafety: args.min_safety,
          maxAllowedRegression: args.max_allowed_regression,
          requireDistinctEvaluator: args.require_distinct_evaluator,
        },
      },
      exec.signal,
    )),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_training_read',
    description: 'Read governed Local Intelligence Core training-candidate metadata and dataset lineage. Raw training content is not stored in this state.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.readTraining(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_training_register_candidate',
    description: 'Register one potential training artifact by reference plus governance metadata after human approval. This tool never accepts raw training content.',
    parameters: {
      project_id: { type: 'string', required: true },
      artifact_ref: { type: 'string', required: true },
      source_type: { type: 'string', required: true },
      sensitivity: { type: 'string', required: true },
      explicit_training_opt_in: { type: 'boolean', required: true },
      ownership_allows_training: { type: 'boolean', required: true },
      license_allows_training: { type: 'boolean', required: true },
      contains_secret: { type: 'boolean', required: true },
      contains_personal_data: { type: 'boolean', required: true },
      personal_data_redacted: { type: 'boolean', required: true },
      quality_score: { type: 'number', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const sourceTypes = [
        'mission',
        'tool-trace',
        'expert-correction',
        'evaluation',
        'artifact',
        'conversation',
      ] as const
      const sensitivities = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] as const
      if (!sourceTypes.includes(args.source_type as typeof sourceTypes[number])) {
        rejectInvalidInput('invalid training source type')
      }
      if (!sensitivities.includes(args.sensitivity as typeof sensitivities[number])) {
        rejectInvalidInput('invalid training sensitivity')
      }

      return encodeToolResult(runtime.registerTrainingCandidate(owner(exec.agent), {
        projectId: args.project_id,
        artifactRef: args.artifact_ref,
        sourceType: args.source_type as TrainingDataCandidate['sourceType'],
        sensitivity: args.sensitivity as DataSensitivity,
        explicitTrainingOptIn: args.explicit_training_opt_in,
        ownershipAllowsTraining: args.ownership_allows_training,
        licenseAllowsTraining: args.license_allows_training,
        containsSecret: args.contains_secret,
        containsPersonalData: args.contains_personal_data,
        personalDataRedacted: args.personal_data_redacted,
        qualityScore: args.quality_score,
      }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_training_build_dataset',
    description: 'Build versioned dataset lineage from already registered ELIGIBLE training and holdout candidates after human approval. Rejected candidates fail closed.',
    parameters: {
      dataset_id: { type: 'string', required: true },
      version: { type: 'number', required: true },
      candidate_ids: { type: 'string', required: true },
      holdout_candidate_ids: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const candidateIds = args.candidate_ids
        .split(/[\n,]+/)
        .map(value => value.trim())
        .filter(Boolean)
      const holdoutCandidateIds = args.holdout_candidate_ids
        .split(/[\n,]+/)
        .map(value => value.trim())
        .filter(Boolean)

      return encodeToolResult(runtime.buildTrainingDataset(owner(exec.agent), {
        datasetId: args.dataset_id,
        version: args.version,
        candidateIds,
        holdoutCandidateIds,
      }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_models_read',
    description: 'Read the durable non-secret D_AI model registry and system/role routing policies.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.readModelRegistry(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_model_upsert',
    description: 'Register or update a model capability/evaluation profile after human approval. Provider API keys are not accepted or stored here.',
    parameters: {
      id: { type: 'string', required: true },
      provider: { type: 'string', required: true },
      location: { type: 'string', required: true },
      capabilities: { type: 'string', required: true },
      quality_score: { type: 'number', required: true },
      reliability_score: { type: 'number', required: true },
      latency_score: { type: 'number', required: true },
      cost_score: { type: 'number', required: true },
      privacy_score: { type: 'number', required: true },
      max_context_tokens: { type: 'number', required: true },
      enabled: { type: 'boolean', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const locations = ['LOCAL', 'CLOUD'] as const
      const capabilities = [
        'reasoning',
        'research',
        'coding',
        'vision',
        'long-context',
        'tool-use',
        'arabic',
      ] as const
      if (!locations.includes(args.location as typeof locations[number])) {
        rejectInvalidInput('invalid model location')
      }
      const requested = args.capabilities
        .split(/[\n,]+/)
        .map(value => value.trim())
        .filter(Boolean)
      if (requested.length === 0
        || requested.some(value => !capabilities.includes(value as typeof capabilities[number]))) {
        rejectInvalidInput('invalid model capability list')
      }

      return encodeToolResult(runtime.upsertModelProfile(owner(exec.agent), {
        id: args.id,
        provider: args.provider,
        location: args.location as ModelProfile['location'],
        capabilities: requested as ModelCapability[],
        qualityScore: args.quality_score,
        reliabilityScore: args.reliability_score,
        latencyScore: args.latency_score,
        costScore: args.cost_score,
        privacyScore: args.privacy_score,
        maxContextTokens: args.max_context_tokens,
        enabled: args.enabled,
      }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_model_policy_set',
    description: 'Create or update the routing requirements/weights for one D_AI system role after human approval.',
    parameters: {
      system_id: { type: 'string', required: true },
      role: { type: 'string', required: true },
      required_capabilities: { type: 'string', required: true },
      min_context_tokens: { type: 'number', required: true },
      local_only: { type: 'boolean', required: true },
      weight_quality: { type: 'number' },
      weight_reliability: { type: 'number' },
      weight_latency: { type: 'number' },
      weight_cost: { type: 'number' },
      weight_privacy: { type: 'number' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      if (!SYSTEMS.some(system => system.id === args.system_id)) {
        rejectInvalidInput('unknown D_AI system id')
      }
      const allowed = [
        'reasoning',
        'research',
        'coding',
        'vision',
        'long-context',
        'tool-use',
        'arabic',
      ] as const
      const required = args.required_capabilities
        .split(/[\n,]+/)
        .map(value => value.trim())
        .filter(Boolean)
      if (required.some(value => !allowed.includes(value as typeof allowed[number]))) {
        rejectInvalidInput('invalid routing capability requirement')
      }
      const weights = {
        ...(args.weight_quality === undefined ? {} : { quality: args.weight_quality }),
        ...(args.weight_reliability === undefined ? {} : { reliability: args.weight_reliability }),
        ...(args.weight_latency === undefined ? {} : { latency: args.weight_latency }),
        ...(args.weight_cost === undefined ? {} : { cost: args.weight_cost }),
        ...(args.weight_privacy === undefined ? {} : { privacy: args.weight_privacy }),
      }

      return encodeToolResult(runtime.setModelRoutingPolicy(owner(exec.agent), {
        systemId: args.system_id as ModelRoutingPolicy['systemId'],
        role: args.role,
        requiredCapabilities: required as ModelCapability[],
        minContextTokens: args.min_context_tokens,
        localOnly: args.local_only,
        ...(Object.keys(weights).length === 0 ? {} : { weights }),
      }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_model_route',
    description: 'Route a D_AI system role to the highest-ranked enabled registered model that satisfies its hard capability/context/locality policy.',
    parameters: {
      system_id: { type: 'string', required: true },
      role: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      if (!SYSTEMS.some(system => system.id === args.system_id)) {
        rejectInvalidInput('unknown D_AI system id')
      }
      return encodeToolResult(runtime.routeRegisteredModel(
        owner(exec.agent),
        args.system_id as CapabilityGrant['systemId'],
        args.role,
      ))
    },
  }))
}
