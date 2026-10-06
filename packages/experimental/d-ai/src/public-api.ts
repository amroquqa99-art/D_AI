export { factSchema, missionProjection, projectFact, SYSTEMS } from './state.ts'
export type { Mission, MissionFact, EvidenceClaim, EvidenceSource, MissionState } from './state.ts'

export { getSystemManifest, listSystemManifests, LOCAL_INTELLIGENCE_CORE } from './systems.ts'
export type {
  SystemManifest,
  SystemId,
  SystemCapabilityStatus,
  SystemRiskClass,
  LocalIntelligenceCoreManifest,
} from './systems.ts'

export { buildTaskGraph, runnableTasks, transitionTask, taskIsTerminal } from './task-dag.ts'
export type { MissionTask, TaskGraph, TaskState } from './task-dag.ts'

export { evaluateTrainingEligibility, buildDatasetLineage } from './training-governance.ts'
export type {
  TrainingDataCandidate,
  EligibilityResult,
  EligibilityDecision,
  DataSensitivity,
  DatasetLineage,
} from './training-governance.ts'

export { authorizeCapability, validateGrant } from './capability-grants.ts'
export type {
  CapabilityGrant,
  CapabilityRequest,
  AuthorizationResult,
  GrantScope,
  GrantDecision,
} from './capability-grants.ts'

export { addResourceUsage, checkBudget, scoreInformationOption, rankInformationOptions } from './resource-value.ts'
export type {
  ResourceBudget,
  ResourceUsage,
  BudgetCheck,
  InformationOption,
  InformationValue,
} from './resource-value.ts'

export { createMissionPlan, selectNextWork, deriveMissionPhase } from './mission-director.ts'
export type {
  MissionPlan,
  MissionPlanInput,
  MissionPhase,
  NextWorkSelection,
  DirectorPlanStatus,
} from './mission-director.ts'

export {
  createEvidenceGraph,
  addEvidenceNode,
  addEvidenceEdge,
  neighbors,
  claimTension,
} from './evidence-graph.ts'
export type {
  EvidenceGraph,
  EvidenceNode,
  EvidenceEdge,
  EvidenceNodeKind,
  EvidenceEdgeKind,
  ClaimTension,
} from './evidence-graph.ts'

export { routeModels, chooseModel } from './model-router.ts'
export type {
  ModelProfile,
  ModelLocation,
  ModelCapability,
  RoutingRequest,
  RoutedModel,
} from './model-router.ts'

export { createAuditChain, appendAuditRecord, verifyAuditChain } from './audit-log.ts'
export type {
  AuditChain,
  AuditRecord,
  AuditEventInput,
  AuditAction,
} from './audit-log.ts'

export { CROSS_SYSTEM_TASK_EXECUTION_CAPABILITY, authorizeCrossSystemHandoff, deriveTaskHandoffSources } from './cross-system.ts'
export type {
  CrossSystemRequest,
  CrossSystemHandoff,
} from './cross-system.ts'

export { evaluateModelPromotion, createModelReleasePointer } from './model-evaluation.ts'
export type {
  ModelEvaluationMetrics,
  ModelEvaluationResult,
  PromotionPolicy,
  ModelPromotionDecision,
  ModelReleasePointer,
} from './model-evaluation.ts'

export { scientificFactSchema, scientificProjection, projectScientificFact } from './scientific-state.ts'
export type {
  ScientificExperiment,
  ScientificFact,
  ScientificHypothesis,
  ScientificProject,
  ScientificState,
} from './scientific-state.ts'
export { runScientificDelegates } from './scientific-orchestration.ts'
export type {
  ScientificDelegationConfig,
  ScientificDelegates,
  ScientificWorkerOutput,
} from './scientific-orchestration.ts'

export { investorFactSchema, investorProjection, projectInvestorFact } from './investor-state.ts'
export type {
  InvestmentThesis,
  InvestorCase,
  InvestorFact,
  InvestorSource,
  InvestorState,
} from './investor-state.ts'
export { runInvestorDelegates } from './investor-orchestration.ts'
export type {
  InvestorDelegationConfig,
  InvestorDelegates,
  InvestorWorkerOutput,
} from './investor-orchestration.ts'

export { cyberFactSchema, cyberProjection, projectCyberFact } from './cyber-state.ts'
export type {
  CyberAuthorizationScope,
  CyberEngagement,
  CyberFact,
  CyberFinding,
  CyberState,
} from './cyber-state.ts'
export { runCyberDelegates } from './cyber-orchestration.ts'
export type {
  CyberDelegationConfig,
  CyberDelegates,
  CyberWorkerOutput,
} from './cyber-orchestration.ts'

export { operationsFactSchema, operationsProjection, projectOperationsFact } from './operations-state.ts'
export type {
  IntelligenceGap,
  OperationalOption,
  OperationsCase,
  OperationsEntity,
  OperationsFact,
  OperationsRelationship,
  OperationsState,
  OperationsTimelineEvent,
} from './operations-state.ts'
export { runOperationsDelegates } from './operations-orchestration.ts'
export type {
  OperationsDelegationConfig,
  OperationsDelegates,
  OperationsWorkerOutput,
} from './operations-orchestration.ts'

export { innovationFactSchema, innovationProjection, projectInnovationFact } from './innovation-state.ts'
export type {
  InnovationCandidate,
  InnovationExperiment,
  InnovationFact,
  InnovationProject,
  InnovationState,
} from './innovation-state.ts'
export { runInnovationDelegates } from './innovation-orchestration.ts'
export type {
  InnovationDelegationConfig,
  InnovationDelegates,
  InnovationWorkerOutput,
} from './innovation-orchestration.ts'

export { taskLedgerFactSchema, taskLedgerProjection, projectTaskLedgerFact } from './task-ledger-state.ts'
export type {
  DurableTaskLedger,
  TaskLedgerFact,
  TaskLedgerState,
} from './task-ledger-state.ts'

export { controlPlaneFactSchema, controlPlaneProjection, projectControlPlaneFact } from './control-plane-state.ts'
export type {
  ControlPlane,
  ControlPlaneFact,
  ControlPlaneState,
} from './control-plane-state.ts'

export { budgetProfilesForTask, selectDurableRunnableTasks } from './runtime-scheduler.ts'
export type {
  SchedulerSelection,
  SchedulerBlockedTask,
} from './runtime-scheduler.ts'

export {
  budgetFactSchema,
  budgetProjection,
  projectBudgetFact,
  budgetProfileSchema,
  resourceBudgetSchema,
  resourceUsageSchema,
} from './budget-state.ts'
export type {
  BudgetFact,
  BudgetLedger,
  BudgetProfile,
  BudgetState,
} from './budget-state.ts'

export {
  evidenceStoreFactSchema,
  evidenceStoreProjection,
  projectEvidenceStoreFact,
  durableEvidenceNodeSchema,
  durableEvidenceEdgeSchema,
} from './evidence-store-state.ts'
export type {
  EvidenceStore,
  EvidenceStoreFact,
  EvidenceStoreState,
} from './evidence-store-state.ts'

export {
  executionFactSchema,
  executionProjection,
  normalizeExecutionFact,
  projectExecutionFact,
  taskLeaseSchema,
  taskCheckpointSchema,
} from './execution-state.ts'
export type {
  ExecutionFact,
  ExecutionLedger,
  ExecutionState,
  TaskCheckpoint,
  TaskLease,
} from './execution-state.ts'

export {
  sideEffectFactSchema,
  sideEffectLedgerSchema,
  sideEffectProjection,
  sideEffectRecordSchema,
  projectSideEffectFact,
} from './side-effect-state.ts'
export type {
  SideEffectFact,
  SideEffectLedger,
  SideEffectRecord,
  SideEffectState,
} from './side-effect-state.ts'

export {
  runFencedSideEffect,
  SideEffectReplayBlockedError,
} from './side-effect-gateway.ts'
export type {
  SideEffectDispatchResult,
  SideEffectGatewayResult,
  SideEffectGatewayRuntime,
} from './side-effect-gateway.ts'
export type { SideEffectReservationInput } from './side-effect-runtime.ts'

export {
  modelRegistryFactSchema,
  modelRegistryProjection,
  projectModelRegistryFact,
  durableModelProfileSchema,
  modelRoutingPolicySchema,
} from './model-registry-state.ts'
export type {
  ModelRegistry,
  ModelRegistryFact,
  ModelRegistryState,
  ModelRoutingPolicy,
} from './model-registry-state.ts'

export {
  trainingFactSchema,
  trainingProjection,
  projectTrainingFact,
  trainingCandidateSchema,
  governedTrainingCandidateSchema,
  governedDatasetSchema,
} from './training-state.ts'
export type {
  GovernedDataset,
  GovernedTrainingCandidate,
  TrainingFact,
  TrainingLedger,
  TrainingState,
} from './training-state.ts'

export {
  modelLifecycleFactSchema,
  modelLifecycleProjection,
  projectModelLifecycleFact,
  governedModelEvaluationSchema,
  governedPromotionSchema,
} from './model-lifecycle-state.ts'
export type {
  GovernedModelEvaluation,
  GovernedPromotion,
  ModelLifecycleFact,
  ModelLifecycleLedger,
  ModelLifecycleState,
} from './model-lifecycle-state.ts'

export {
  directorFactSchema,
  directorProjection,
  projectDirectorFact,
  directorPlanSchema,
} from './director-state.ts'
export type {
  DirectorFact,
  DirectorLedger,
  DirectorPlan,
  DirectorState,
} from './director-state.ts'
export { runDirectorPlanner } from './director-orchestration.ts'
export type {
  DirectorPlanningConfig,
  DirectorPlanningResult,
} from './director-orchestration.ts'
export { runDirectorTaskExecutor } from './director-executor.ts'
export type { DirectorCycleResult, DirectorPlanRuntimeView, DirectorTaskExecution } from './director-runtime.ts'
export type {
  TaskExecutionConfig,
  TaskExecutionOutcome,
  TaskExecutionResult,
} from './director-executor.ts'

export type { Config, DAILimits, RuntimeConfiguration } from './config.ts'
