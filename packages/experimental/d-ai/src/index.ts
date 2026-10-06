/** Native D_AI mission service, investigative tools, and auditable Session facts. */
import { createHash, randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { Context, Service } from '@deepseek-ai/cordis'
import { z as schema } from 'zod'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-user-approval'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-web'
import { factSchema, SYSTEMS } from './state.ts'
import { LOCAL_INTELLIGENCE_CORE } from './systems.ts'
import type { Mission, MissionFact, EvidenceClaim, MissionState } from './state.ts'
import { runInvestigationDelegates } from './orchestration.ts'
import type { InvestigationDelegationConfig } from './orchestration.ts'
import { scientificFactSchema } from './scientific-state.ts'
import type { ScientificExperiment, ScientificFact, ScientificHypothesis, ScientificProject, ScientificState } from './scientific-state.ts'
import { runScientificDelegates } from './scientific-orchestration.ts'
import type { ScientificDelegationConfig } from './scientific-orchestration.ts'
import { investorFactSchema } from './investor-state.ts'
import type { InvestmentThesis, InvestorCase, InvestorFact, InvestorSource, InvestorState } from './investor-state.ts'
import { runInvestorDelegates } from './investor-orchestration.ts'
import type { InvestorDelegationConfig } from './investor-orchestration.ts'
import { cyberFactSchema } from './cyber-state.ts'
import type { CyberAuthorizationScope, CyberEngagement, CyberFact, CyberFinding, CyberState } from './cyber-state.ts'
import { runCyberDelegates } from './cyber-orchestration.ts'
import type { CyberDelegationConfig } from './cyber-orchestration.ts'
import { operationsFactSchema } from './operations-state.ts'
import type { IntelligenceGap, OperationalOption, OperationsCase, OperationsEntity, OperationsFact, OperationsRelationship, OperationsState, OperationsTimelineEvent } from './operations-state.ts'
import { runOperationsDelegates } from './operations-orchestration.ts'
import type { OperationsDelegationConfig } from './operations-orchestration.ts'
import { innovationFactSchema } from './innovation-state.ts'
import type { InnovationCandidate, InnovationExperiment, InnovationFact, InnovationProject, InnovationState } from './innovation-state.ts'
import { runInnovationDelegates } from './innovation-orchestration.ts'
import type { InnovationDelegationConfig } from './innovation-orchestration.ts'
import { taskLedgerFactSchema } from './task-ledger-state.ts'
import type { DurableTaskLedger, TaskLedgerFact, TaskLedgerState } from './task-ledger-state.ts'
import { controlPlaneFactSchema } from './control-plane-state.ts'
import type { ControlPlane, ControlPlaneFact, ControlPlaneState } from './control-plane-state.ts'
import { appendAuditRecord as appendAuditRecordInternal, createAuditChain as createAuditChainInternal } from './audit-log.ts'
import { validateGrant as validateGrantInternal } from './capability-grants.ts'
import type { CapabilityGrant } from './capability-grants.ts'
import { transitionTask as transitionTaskInternal } from './task-dag.ts'
import { CROSS_SYSTEM_TASK_EXECUTION_CAPABILITY, authorizeCrossSystemHandoff as authorizeCrossSystemHandoffInternal, deriveTaskHandoffSources } from './cross-system.ts'
import { budgetProfilesForTask, selectDurableRunnableTasks } from './runtime-scheduler.ts'
import { budgetFactSchema } from './budget-state.ts'
import type { BudgetFact, BudgetLedger, BudgetProfile, BudgetState } from './budget-state.ts'
import { addResourceUsage } from './resource-value.ts'
import type { ResourceBudget, ResourceUsage } from './resource-value.ts'
import { evidenceStoreFactSchema } from './evidence-store-state.ts'
import type { EvidenceStore, EvidenceStoreFact, EvidenceStoreState } from './evidence-store-state.ts'
import type { EvidenceEdge, EvidenceNode } from './evidence-graph.ts'
import { executionFactSchema } from './execution-state.ts'
import type { ExecutionFact, ExecutionLedger, ExecutionState, TaskCheckpoint, TaskLease } from './execution-state.ts'
import { sideEffectFactSchema } from './side-effect-state.ts'
import type { SideEffectFact, SideEffectLedger, SideEffectRecord, SideEffectState } from './side-effect-state.ts'
import { modelRegistryFactSchema } from './model-registry-state.ts'
import type { ModelRegistry, ModelRegistryFact, ModelRegistryState, ModelRoutingPolicy } from './model-registry-state.ts'
import { chooseModel as chooseModelInternal } from './model-router.ts'
import type { ModelCapability, ModelProfile } from './model-router.ts'
import { trainingFactSchema } from './training-state.ts'
import type { GovernedDataset, GovernedTrainingCandidate, TrainingFact, TrainingLedger, TrainingState } from './training-state.ts'
import { buildDatasetLineage as buildDatasetLineageInternal, evaluateTrainingEligibility as evaluateTrainingEligibilityInternal } from './training-governance.ts'
import type { TrainingDataCandidate } from './training-governance.ts'
import { modelLifecycleFactSchema } from './model-lifecycle-state.ts'
import type { GovernedModelEvaluation, GovernedPromotion, ModelLifecycleFact, ModelLifecycleLedger, ModelLifecycleState } from './model-lifecycle-state.ts'
import { createModelReleasePointer as createModelReleasePointerInternal, evaluateModelPromotion as evaluateModelPromotionInternal } from './model-evaluation.ts'
import type { ModelEvaluationResult, PromotionPolicy } from './model-evaluation.ts'
import { directorFactSchema } from './director-state.ts'
import type { DirectorFact, DirectorLedger, DirectorPlan, DirectorState } from './director-state.ts'
import { directorScheduleFactSchema } from './director-schedule-state.ts'
import type { DirectorSchedule, DirectorScheduleCycle, DirectorScheduleFact, DirectorScheduleLedger, DirectorScheduleState } from './director-schedule-state.ts'
import { DirectorScheduler } from './director-scheduler.ts'
import type { ScheduledDirectorCycleResult } from './director-scheduler.ts'
import { deriveMissionPhase } from './mission-director.ts'
import { runDirectorPlanner } from './director-orchestration.ts'
import type { DirectorPlanningResult } from './director-orchestration.ts'
import { runDirectorTaskExecutor } from './director-executor.ts'
import type { TaskExecutionResult } from './director-executor.ts'
import type { DirectorCycleResult, DirectorPlanRuntimeView, DirectorTaskExecution } from './director-runtime.ts'
import type { MissionTask, TaskState } from './task-dag.ts'
import { buildRuntimeConfiguration, configSchema } from './config.ts'
import type { Config } from './config.ts'
import { mountDaiProjections } from './runtime-projections.ts'
import { registerDaiTools } from './runtime-tools.ts'
import { DaiRuntimeKernel } from './runtime-kernel.ts'
import { failDai, hasDaiErrorCode } from './runtime-errors.ts'
import { DaiProjectionReader, immutableSnapshot } from './runtime-state.ts'
import { withLeaseHeartbeat } from './lease-heartbeat.ts'
import { locateActiveLeaseFence, locateLeaseFence, nextLeaseFence } from './execution-fencing.ts'
import {
  abortReservedSideEffect,
  commitSideEffectRecord,
  createReservedSideEffect,
  markSideEffectDispatched as markSideEffectDispatchedRecord,
  markSideEffectOutcomeUnknown as markSideEffectOutcomeUnknownRecord,
  rebindReservedSideEffect,
  reconcileUnknownSideEffect,
  sameSideEffectRequest,
} from './side-effect-runtime.ts'
import type { SideEffectReservationInput } from './side-effect-runtime.ts'

export * from './public-api.ts'

const indexSpec = defineDomain({ name: 'd_ai_mission_index', version: 1, tables: {
  missions: domainTable(schema.object({ id: schema.string(), rootSessionId: schema.string() }).strict()),
} })

const fail = failDai

/** Single-owner native service; raw Session history is authoritative, index is discoverability only. */
export class DAI extends Service {
  static inject = ['agents', 'sessions', 'sessionProjections', 'storageDomain', 'web', 'subagents', 'tools', 'approval']
  static Config = configSchema
  private readonly limits: { maxSourceBytes: number; maxMissionBytes: number; maxSources: number }
  private readonly delegation: InvestigationDelegationConfig
  private readonly scientificDelegation: ScientificDelegationConfig
  private readonly investorDelegation: InvestorDelegationConfig
  private readonly cyberDelegation: CyberDelegationConfig
  private readonly operationsDelegation: OperationsDelegationConfig
  private readonly innovationDelegation: InnovationDelegationConfig
  private readonly kernel: DaiRuntimeKernel
  private readonly projections: DaiProjectionReader
  private readonly delegating = new Set<string>()
  private readonly directorCycles = new Set<string>()
  private readonly index: ReturnType<Context['storageDomain']['open']>

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'dai')
    this.kernel = new DaiRuntimeKernel(ctx)
    this.projections = new DaiProjectionReader(ctx, this.kernel)
    const runtime = buildRuntimeConfiguration(config)
    this.limits = runtime.limits
    this.delegation = runtime.delegations.investigation
    this.scientificDelegation = runtime.delegations.scientific
    this.investorDelegation = runtime.delegations.investor
    this.cyberDelegation = runtime.delegations.cyber
    this.operationsDelegation = runtime.delegations.operations
    this.innovationDelegation = runtime.delegations.innovation
    this.index = ctx.storageDomain.open(indexSpec)
    mountDaiProjections(ctx)
    ctx.effect(() => async () => { await this.kernel.drain(); await (await this.index).close() }, 'dai.index()')
    this.registerTools()
    if (runtime.scheduler.enabled) {
      const scheduler = new DirectorScheduler(ctx, this, { pollMs: runtime.scheduler.pollMs })
      ctx.effect(() => async () => scheduler.dispose(), 'dai.directorScheduler()')
    }
  }

  /**
   * List explicitly registered domain readiness, without activating future systems.
   * @returns immutable system registrations.
   */
  systems(): typeof SYSTEMS { return SYSTEMS }

  private authorize(agent: Agent): void {
    this.kernel.authorizeOwner(agent)
  }

  /**
   * Read all missions owned by one exact live root Agent.
   * @param agent - authenticated owner runtime identity.
   * @returns detached immutable projected missions.
   */
  read(agent: Agent): MissionState {
    return this.projections.read(agent, 'dai')
  }

  private mission(agent: Agent, id: string): Mission {
    const mission = this.read(agent).missions.find(m => m.id === id)
    if (mission === undefined || mission.ownerAgentId !== agent.id) fail('mission is absent or not owned by this Agent')
    return mission
  }

  /** Read durable Scientific Research projects for the exact live owner Agent. */
  readScientific(agent: Agent): ScientificState {
    return this.projections.read(agent, 'daiScientificResearch')
  }

  private scientificProject(agent: Agent, id: string): ScientificProject {
    const project = this.readScientific(agent).projects.find(item => item.id === id)
    if (project === undefined || project.ownerAgentId !== agent.id) fail('scientific project is absent or not owned by this Agent')
    return project
  }

  /** Read durable Investor cases for the exact live owner Agent. */
  readInvestor(agent: Agent): InvestorState {
    return this.projections.read(agent, 'daiInvestor')
  }

  private investorCase(agent: Agent, id: string): InvestorCase {
    const value = this.readInvestor(agent).cases.find(item => item.id === id)
    if (value === undefined || value.ownerAgentId !== agent.id) fail('investor case is absent or not owned by this Agent')
    return value
  }

  /** Read durable authorized Cybersecurity engagements for the exact live owner Agent. */
  readCybersecurity(agent: Agent): CyberState {
    return this.projections.read(agent, 'daiCybersecurity')
  }

  private cyberEngagement(agent: Agent, id: string): CyberEngagement {
    const engagement = this.readCybersecurity(agent).engagements.find(item => item.id === id)
    if (engagement === undefined || engagement.ownerAgentId !== agent.id) fail('cybersecurity engagement is absent or not owned by this Agent')
    return engagement
  }

  /** Read durable Operations & Intelligence cases for the exact live owner Agent. */
  readOperations(agent: Agent): OperationsState {
    return this.projections.read(agent, 'daiOperationsIntelligence')
  }

  private operationsCase(agent: Agent, id: string): OperationsCase {
    const value = this.readOperations(agent).cases.find(item => item.id === id)
    if (value === undefined || value.ownerAgentId !== agent.id) fail('operations case is absent or not owned by this Agent')
    return value
  }

  /** Read durable Innovation & Discovery projects for the exact live owner Agent. */
  readInnovation(agent: Agent): InnovationState {
    return this.projections.read(agent, 'daiInnovationDiscovery')
  }

  private innovationProject(agent: Agent, id: string): InnovationProject {
    const value = this.readInnovation(agent).projects.find(item => item.id === id)
    if (value === undefined || value.ownerAgentId !== agent.id) fail('innovation project is absent or not owned by this Agent')
    return value
  }

  /** Read durable shared task ledgers for the exact live owner Agent. */
  readTaskLedger(agent: Agent): TaskLedgerState {
    return this.projections.read(agent, 'daiTaskLedger')
  }

  private taskLedger(agent: Agent): DurableTaskLedger {
    const existing = this.readTaskLedger(agent).ledgers.find(item => item.ownerAgentId === agent.id)
    return existing ?? {
      ownerAgentId: agent.id,
      revision: 0,
      tasks: [],
    }
  }

  /** Read durable cross-system Mission Director plans. */
  readDirector(agent: Agent): DirectorState {
    return this.projections.read(agent, 'daiDirector')
  }

  private directorLedger(agent: Agent): DirectorLedger {
    const existing = this.readDirector(agent).ledgers.find(item => item.ownerAgentId === agent.id)
    return existing ?? {
      ownerAgentId: agent.id,
      revision: 0,
      plans: [],
    }
  }

  private directorPlan(agent: Agent, id: string): DirectorPlan {
    const plan = this.directorLedger(agent).plans.find(item => item.id === id)
    if (plan === undefined) fail('unknown Mission Director plan', 'D_AI_INVALID_INPUT')
    return plan
  }

  /** Read durable unattended Mission Director schedules. */
  readDirectorSchedule(agent: Agent): DirectorScheduleState {
    return this.projections.read(agent, 'daiDirectorSchedule')
  }

  private directorScheduleLedger(agent: Agent): DirectorScheduleLedger {
    const existing = this.readDirectorSchedule(agent).ledgers.find(item => item.ownerAgentId === agent.id)
    return existing ?? {
      ownerAgentId: agent.id,
      revision: 0,
      schedules: [],
    }
  }

  private directorSchedule(agent: Agent, id: string): DirectorSchedule {
    const schedule = this.directorScheduleLedger(agent).schedules.find(item => item.id === id)
    if (schedule === undefined) fail('unknown Mission Director schedule', 'D_AI_INVALID_INPUT')
    return schedule
  }

  /** Read governed Local Intelligence Core evaluation/promotion lifecycle. */
  readModelLifecycle(agent: Agent): ModelLifecycleState {
    return this.projections.read(agent, 'daiModelLifecycle')
  }

  private modelLifecycleLedger(agent: Agent): ModelLifecycleLedger {
    const existing = this.readModelLifecycle(agent).ledgers.find(item => item.ownerAgentId === agent.id)
    return existing ?? {
      ownerAgentId: agent.id,
      revision: 0,
      evaluations: [],
      promotions: [],
    }
  }

  /** Read governed Local Intelligence Core training metadata and dataset lineage. */
  readTraining(agent: Agent): TrainingState {
    return this.projections.read(agent, 'daiTraining')
  }

  private trainingLedger(agent: Agent): TrainingLedger {
    const existing = this.readTraining(agent).ledgers.find(item => item.ownerAgentId === agent.id)
    return existing ?? {
      ownerAgentId: agent.id,
      revision: 0,
      candidates: [],
      datasets: [],
    }
  }

  /** Read the durable D_AI model registry and role routing policies. */
  readModelRegistry(agent: Agent): ModelRegistryState {
    return this.projections.read(agent, 'daiModelRegistry')
  }

  private modelRegistry(agent: Agent): ModelRegistry {
    const existing = this.readModelRegistry(agent).registries.find(item => item.ownerAgentId === agent.id)
    return existing ?? {
      ownerAgentId: agent.id,
      revision: 0,
      models: [],
      policies: [],
    }
  }

  /** Read durable long-running task leases and checkpoints. */
  readExecution(agent: Agent): ExecutionState {
    return this.projections.read(agent, 'daiExecution')
  }

  private executionLedger(agent: Agent): ExecutionLedger {
    const existing = this.readExecution(agent).ledgers.find(item => item.ownerAgentId === agent.id)
    return existing ?? {
      ownerAgentId: agent.id,
      revision: 0,
      leases: [],
      checkpoints: [],
    }
  }

  /** Read the durable external side-effect idempotency journal. */
  readSideEffects(agent: Agent): SideEffectState {
    return this.projections.read(agent, 'daiSideEffects')
  }

  private sideEffectLedger(agent: Agent): SideEffectLedger {
    const existing = this.readSideEffects(agent).ledgers.find(item => item.ownerAgentId === agent.id)
    return existing ?? {
      ownerAgentId: agent.id,
      revision: 0,
      records: [],
    }
  }

  /** Read the durable shared Evidence/Knowledge Graph for the owner. */
  readEvidenceStore(agent: Agent): EvidenceStoreState {
    return this.projections.read(agent, 'daiEvidenceStore')
  }

  private evidenceStore(agent: Agent): EvidenceStore {
    const existing = this.readEvidenceStore(agent).stores.find(item => item.ownerAgentId === agent.id)
    return existing ?? {
      ownerAgentId: agent.id,
      revision: 0,
      nodes: [],
      edges: [],
    }
  }

  /** Read durable scoped resource budgets and accumulated usage. */
  readBudgets(agent: Agent): BudgetState {
    return this.projections.read(agent, 'daiBudgets')
  }

  private budgetLedger(agent: Agent): BudgetLedger {
    const existing = this.readBudgets(agent).ledgers.find(item => item.ownerAgentId === agent.id)
    return existing ?? {
      ownerAgentId: agent.id,
      revision: 0,
      profiles: [],
    }
  }

  /** Read the deterministic scheduler admission set from the durable task ledger. */
  selectRunnableTasks(agent: Agent, maxTasks: number): ReturnType<typeof selectDurableRunnableTasks> {
    this.authorize(agent)
    return immutableSnapshot(selectDurableRunnableTasks(this.taskLedger(agent), maxTasks, this.budgetLedger(agent).profiles))
  }

  /** Build one read-only platform snapshot for control-center/dashboard consumers. */
  platformSnapshot(agent: Agent): Readonly<Record<string, unknown>> {
    this.authorize(agent)
    const missions = this.read(agent)
    const scientific = this.readScientific(agent)
    const investor = this.readInvestor(agent)
    const cyber = this.readCybersecurity(agent)
    const operations = this.readOperations(agent)
    const innovation = this.readInnovation(agent)
    const taskLedger = this.taskLedger(agent)
    const control = this.controlPlane(agent)
    const budgets = this.budgetLedger(agent)
    const evidence = this.evidenceStore(agent)

    const taskStates: Record<string, number> = {}
    for (const task of taskLedger.tasks) taskStates[task.state] = (taskStates[task.state] ?? 0) + 1

    return immutableSnapshot({
      generatedAt: new Date().toISOString(),
      systems: SYSTEMS,
      localIntelligenceCore: LOCAL_INTELLIGENCE_CORE,
      domains: {
        investigation: missions.missions.length,
        scientificResearch: scientific.projects.length,
        investor: investor.cases.length,
        cybersecurity: cyber.engagements.length,
        operationsIntelligence: operations.cases.length,
        innovationDiscovery: innovation.projects.length,
      },
      missionDirector: (() => {
        const ledger = this.directorLedger(agent)
        const schedules = this.directorScheduleLedger(agent)
        return {
          revision: ledger.revision,
          plans: ledger.plans.length,
          activePlans: ledger.plans.filter(plan => plan.status === 'ACTIVE').length,
          pausedPlans: ledger.plans.filter(plan => plan.status === 'PAUSED').length,
          completedPlans: ledger.plans.filter(plan => plan.status === 'COMPLETE').length,
          scheduleRevision: schedules.revision,
          schedules: schedules.schedules.length,
          enabledSchedules: schedules.schedules.filter(schedule => schedule.enabled).length,
          failedLastCycles: schedules.schedules.filter(schedule => schedule.lastCycle?.outcome === 'FAILED').length,
        }
      })(),
      tasks: {
        revision: taskLedger.revision,
        total: taskLedger.tasks.length,
        byState: taskStates,
      },
      controlPlane: {
        revision: control.revision,
        grants: control.grants.length,
        auditRecords: control.auditRecords.length,
        auditHeadHash: control.auditHeadHash,
      },
      budgets: {
        revision: budgets.revision,
        profiles: budgets.profiles.length,
      },
      evidenceGraph: {
        revision: evidence.revision,
        nodes: evidence.nodes.length,
        edges: evidence.edges.length,
      },
      execution: (() => {
        const ledger = this.executionLedger(agent)
        const now = Date.now()
        return {
          revision: ledger.revision,
          leases: ledger.leases.length,
          activeLeases: ledger.leases.filter(lease => lease.releasedAt === undefined && Date.parse(lease.expiresAt) > now).length,
          checkpoints: ledger.checkpoints.length,
        }
      })(),
      sideEffects: (() => {
        const ledger = this.sideEffectLedger(agent)
        return {
          revision: ledger.revision,
          records: ledger.records.length,
          reserved: ledger.records.filter(record => record.state === 'RESERVED').length,
          dispatched: ledger.records.filter(record => record.state === 'DISPATCHED').length,
          committed: ledger.records.filter(record => record.state === 'COMMITTED').length,
          outcomeUnknown: ledger.records.filter(record => record.state === 'OUTCOME_UNKNOWN').length,
          aborted: ledger.records.filter(record => record.state === 'ABORTED').length,
        }
      })(),
      modelRegistry: (() => {
        const registry = this.modelRegistry(agent)
        return {
          revision: registry.revision,
          models: registry.models.length,
          enabledModels: registry.models.filter(model => model.enabled).length,
          policies: registry.policies.length,
        }
      })(),
      trainingGovernance: (() => {
        const ledger = this.trainingLedger(agent)
        return {
          revision: ledger.revision,
          candidates: ledger.candidates.length,
          eligibleCandidates: ledger.candidates.filter(item => item.eligibility.decision === 'ELIGIBLE').length,
          rejectedCandidates: ledger.candidates.filter(item => item.eligibility.decision === 'REJECTED').length,
          datasets: ledger.datasets.length,
        }
      })(),
      modelLifecycle: (() => {
        const ledger = this.modelLifecycleLedger(agent)
        return {
          revision: ledger.revision,
          evaluations: ledger.evaluations.length,
          promotions: ledger.promotions.length,
          successfulPromotions: ledger.promotions.filter(item => item.decision.promote).length,
          latestRelease: [...ledger.promotions].reverse().find(item => item.release !== undefined)?.release ?? null,
        }
      })(),
    })
  }

  /** Read durable capability grants and audit records for the exact live owner Agent. */
  readControlPlane(agent: Agent): ControlPlaneState {
    return this.projections.read(agent, 'daiControlPlane')
  }

  private controlPlane(agent: Agent): ControlPlane {
    const existing = this.readControlPlane(agent).controls.find(item => item.ownerAgentId === agent.id)
    return existing ?? {
      ownerAgentId: agent.id,
      revision: 0,
      grants: [],
      auditRecords: [],
      auditHeadHash: createAuditChainInternal().headHash,
    }
  }

  private transact<T>(agent: Agent, operation: () => Promise<T>): Promise<T> {
    return this.kernel.transact(agent, operation)
  }

  private requireOpenTurn(agent: Agent): number {
    return this.kernel.requireOpenTurn(agent)
  }

  private async append(agent: Agent, operation: MissionFact['operation'], mission: Mission): Promise<Mission> {
    this.authorize(agent)
    const fact = immutableSnapshot(factSchema.parse({ version: 1, operation, actorId: agent.id, mission }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) fail('mission storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.mission)
  }

  private async appendScientific(agent: Agent, operation: ScientificFact['operation'], project: ScientificProject): Promise<ScientificProject> {
    this.authorize(agent)
    const fact = immutableSnapshot(scientificFactSchema.parse({ version: 1, operation, actorId: agent.id, project }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) fail('scientific project storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/scientific-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.project)
  }

  private async appendInvestor(agent: Agent, operation: InvestorFact['operation'], value: InvestorCase): Promise<InvestorCase> {
    this.authorize(agent)
    const fact = immutableSnapshot(investorFactSchema.parse({ version: 1, operation, actorId: agent.id, case: value }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) fail('investor case storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/investor-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.case)
  }

  private async appendCyber(agent: Agent, operation: CyberFact['operation'], engagement: CyberEngagement): Promise<CyberEngagement> {
    this.authorize(agent)
    const fact = immutableSnapshot(cyberFactSchema.parse({ version: 1, operation, actorId: agent.id, engagement }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) fail('cybersecurity engagement storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/cyber-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.engagement)
  }

  private async appendOperations(agent: Agent, operation: OperationsFact['operation'], value: OperationsCase): Promise<OperationsCase> {
    this.authorize(agent)
    const fact = immutableSnapshot(operationsFactSchema.parse({ version: 1, operation, actorId: agent.id, case: value }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) fail('operations case storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/operations-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.case)
  }

  private async appendInnovation(agent: Agent, operation: InnovationFact['operation'], project: InnovationProject): Promise<InnovationProject> {
    this.authorize(agent)
    const fact = immutableSnapshot(innovationFactSchema.parse({ version: 1, operation, actorId: agent.id, project }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) fail('innovation project storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/innovation-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.project)
  }

  private async appendTaskLedger(agent: Agent, operation: TaskLedgerFact['operation'], ledger: DurableTaskLedger): Promise<DurableTaskLedger> {
    this.authorize(agent)
    const fact = immutableSnapshot(taskLedgerFactSchema.parse({ version: 1, operation, actorId: agent.id, ledger }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) fail('task ledger storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/task-ledger-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.ledger)
  }

  private async appendControlPlane(agent: Agent, operation: ControlPlaneFact['operation'], control: ControlPlane): Promise<ControlPlane> {
    this.authorize(agent)
    const fact = immutableSnapshot(controlPlaneFactSchema.parse({ version: 1, operation, actorId: agent.id, control }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) fail('control-plane storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/control-plane-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.control)
  }

  private async appendBudgetLedger(agent: Agent, operation: BudgetFact['operation'], ledger: BudgetLedger): Promise<BudgetLedger> {
    this.authorize(agent)
    const fact = immutableSnapshot(budgetFactSchema.parse({ version: 1, operation, actorId: agent.id, ledger }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) fail('budget ledger storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/budget-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.ledger)
  }

  private async appendEvidenceStore(agent: Agent, operation: EvidenceStoreFact['operation'], store: EvidenceStore): Promise<EvidenceStore> {
    this.authorize(agent)
    const fact = immutableSnapshot(evidenceStoreFactSchema.parse({ version: 1, operation, actorId: agent.id, store }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) fail('evidence store storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/evidence-store-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.store)
  }

  private async appendExecutionLedger(agent: Agent, operation: ExecutionFact['operation'], ledger: ExecutionLedger): Promise<ExecutionLedger> {
    this.authorize(agent)
    const fact = immutableSnapshot(executionFactSchema.parse({ version: 2, operation, actorId: agent.id, ledger }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) fail('execution ledger storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/execution-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.ledger)
  }

  private async appendSideEffectLedger(
    agent: Agent,
    operation: SideEffectFact['operation'],
    ledger: SideEffectLedger,
  ): Promise<SideEffectLedger> {
    this.authorize(agent)
    const fact = immutableSnapshot(sideEffectFactSchema.parse({
      version: 1,
      operation,
      actorId: agent.id,
      ledger,
    }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) {
      fail('side-effect journal storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    }
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/side-effect-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.ledger)
  }

  private async appendModelRegistry(agent: Agent, operation: ModelRegistryFact['operation'], registry: ModelRegistry): Promise<ModelRegistry> {
    this.authorize(agent)
    const fact = immutableSnapshot(modelRegistryFactSchema.parse({ version: 1, operation, actorId: agent.id, registry }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) fail('model registry storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/model-registry-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.registry)
  }

  private async appendTrainingLedger(agent: Agent, operation: TrainingFact['operation'], ledger: TrainingLedger): Promise<TrainingLedger> {
    this.authorize(agent)
    const fact = immutableSnapshot(trainingFactSchema.parse({ version: 1, operation, actorId: agent.id, ledger }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) fail('training ledger storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/training-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.ledger)
  }

  private async appendModelLifecycle(agent: Agent, operation: ModelLifecycleFact['operation'], ledger: ModelLifecycleLedger): Promise<ModelLifecycleLedger> {
    this.authorize(agent)
    const fact = immutableSnapshot(modelLifecycleFactSchema.parse({ version: 1, operation, actorId: agent.id, ledger }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) fail('model lifecycle storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/model-lifecycle-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.ledger)
  }

  private async appendDirectorLedger(agent: Agent, operation: DirectorFact['operation'], ledger: DirectorLedger): Promise<DirectorLedger> {
    this.authorize(agent)
    const fact = immutableSnapshot(directorFactSchema.parse({ version: 1, operation, actorId: agent.id, ledger }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) fail('Mission Director ledger storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/director-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.ledger)
  }

  private async appendDirectorScheduleLedger(
    agent: Agent,
    operation: DirectorScheduleFact['operation'],
    ledger: DirectorScheduleLedger,
  ): Promise<DirectorScheduleLedger> {
    this.authorize(agent)
    const fact = immutableSnapshot(directorScheduleFactSchema.parse({
      version: 1,
      operation,
      actorId: agent.id,
      ledger,
    }))
    if (Buffer.byteLength(JSON.stringify(fact), 'utf8') > this.limits.maxMissionBytes) {
      fail('Mission Director schedule storage budget exceeded', 'D_AI_BUDGET_EXCEEDED')
    }
    this.requireOpenTurn(agent)
    agent.session.append('d_ai/director-schedule-fact', fact)
    await this.ctx.sessions.flush(agent.session)
    return immutableSnapshot(fact.ledger)
  }








  /** Create one approved cross-system Mission Director plan. */
  async createDirectorPlan(
    agent: Agent,
    input: {
      readonly objective: string
      readonly primarySystem: DirectorPlan['primarySystem']
      readonly stopConditions?: readonly string[]
    },
    signal?: AbortSignal,
  ): Promise<DirectorPlan> {
    this.authorize(agent)
    if (input.objective.trim().length === 0) fail('Mission Director objective is required', 'D_AI_INVALID_INPUT')
    if ((input.stopConditions ?? []).some(condition => condition.trim().length === 0)) fail('Mission Director stop conditions must be non-empty', 'D_AI_INVALID_INPUT')

    const boundary = this.requireOpenTurn(agent)
    const explicit = agent.session.snapshotEvents().slice(boundary + 1).some(event =>
      event.type === 'user/message'
      && event.data.source.kind === 'user'
      && event.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n').includes(input.objective.trim()))
    if (!explicit) {
      const outcome = await this.ctx.approval.request({
        agent,
        toolName: 'd_ai_director_plan_create',
        reason: 'Create independent D_AI Mission Director plan: ' + input.objective,
        ...(signal === undefined ? {} : { signal }),
      })
      if (outcome !== 'allowed-once') fail('owner approval is required for an independent Mission Director plan')
    }

    const plan: DirectorPlan = {
      id: randomUUID(),
      objective: input.objective,
      primarySystem: input.primarySystem,
      ownerAgentId: agent.id,
      createdAt: new Date().toISOString(),
      status: 'ACTIVE',
      stopConditions: [...(input.stopConditions ?? [])],
    }
    await this.transact(agent, async () => {
      const current = this.directorLedger(agent)
      await this.appendDirectorLedger(agent, 'CREATE_PLAN', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        plans: [...current.plans, plan],
      })
    })
    return immutableSnapshot(plan)
  }

  /** Add one task to an approved Director plan; dependencies must stay inside that plan. */
  async addDirectorTask(
    agent: Agent,
    planId: string,
    input: {
      readonly systemId: MissionTask['systemId']
      readonly title: string
      readonly dependsOn?: readonly string[]
      readonly priority?: number
      readonly maxAttempts?: number
    },
  ): Promise<DurableTaskLedger> {
    const plan = this.directorPlan(agent, planId)
    if (plan.status !== 'ACTIVE') fail('tasks can be added only to an active Mission Director plan', 'D_AI_INVALID_TRANSITION')
    if (input.title.trim().length === 0) fail('Director task title is required', 'D_AI_INVALID_INPUT')
    const dependencies = [...(input.dependsOn ?? [])]
    const existing = this.taskLedger(agent)
    for (const dependency of dependencies) {
      const task = existing.tasks.find(item => item.id === dependency)
      if (task === undefined || task.missionId !== plan.id) fail('Director task dependency must belong to the same plan', 'D_AI_INVALID_INPUT')
    }
    const priority = input.priority ?? 0
    const maxAttempts = input.maxAttempts ?? 3
    if (!Number.isSafeInteger(priority) || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
      fail('invalid Director task priority or retry budget', 'D_AI_INVALID_INPUT')
    }
    return this.addDurableTasks(agent, [{
      id: randomUUID(),
      missionId: plan.id,
      systemId: input.systemId,
      title: input.title,
      dependsOn: dependencies,
      state: 'PENDING',
      priority,
      attempt: 0,
      maxAttempts,
    }])
  }

  /**
   * Run one isolated planner Agent for an empty approved Director plan, validate
   * its proposed DAG in runtime code, then append all tasks atomically to the
   * durable Task Ledger.
   */
  async generateDirectorTasks(
    agent: Agent,
    planId: string,
    signal: AbortSignal,
  ): Promise<Readonly<{ planning: DirectorPlanningResult; ledger: DurableTaskLedger }>> {
    const plan = this.directorPlan(agent, planId)
    if (plan.status !== 'ACTIVE') fail('Mission Director planner requires an active plan', 'D_AI_INVALID_TRANSITION')
    const existing = this.taskLedger(agent).tasks.filter(task => task.missionId === plan.id)
    if (existing.length > 0) fail('initial Mission Director planner requires a plan with no existing tasks', 'D_AI_INVALID_TRANSITION')

    const route = this.optionalRoutedModel(agent, plan.primarySystem, 'mission-director')
    const planning = await runDirectorPlanner(
      this.ctx,
      agent,
      plan,
      SYSTEMS,
      signal,
      {
        subagentProvider: this.delegation.provider,
        maxDepth: this.delegation.maxDepth,
        maxOutputTokens: this.delegation.maxOutputTokens,
        maxRequests: this.delegation.maxRequestsPerChild,
        timeoutMs: this.delegation.timeoutMs,
        maxResultBytes: this.delegation.maxResultBytes,
        ...(route === undefined ? {} : { model: route.id, llmProvider: route.provider }),
      },
    )
    signal.throwIfAborted()
    const ledger = await this.addDurableTasks(agent, planning.tasks)
    return immutableSnapshot({ planning, ledger })
  }

  /**
   * Execute one runnable task from an approved Director plan using a fresh
   * isolated Agent. The child sees only reconstructed plan/task/dependency
   * context, not the parent's full conversation history.
   */
  async executeNextDirectorTask(
    agent: Agent,
    planId: string,
    signal: AbortSignal,
    ttlMs = 600000,
  ): Promise<Readonly<{ task: MissionTask; execution: TaskExecutionResult }>> {
    const plan = this.directorPlan(agent, planId)
    if (plan.status !== 'ACTIVE') fail('Mission Director execution requires an active plan', 'D_AI_INVALID_TRANSITION')

    await this.recoverExpiredTaskLeases(agent)
    const claimed = await this.claimNextRunnableTask(agent, ttlMs, plan.id)
    const startedAt = performance.now()

    let execution: TaskExecutionResult | undefined
    let primaryFailure: unknown
    const cleanupFailures: unknown[] = []

    try {
      const system = SYSTEMS.find(item => item.id === claimed.task.systemId)
      if (system === undefined) fail('claimed task references unknown D_AI system', 'D_AI_CORRUPT_STATE')

      const taskLedger = this.taskLedger(agent)
      const dependencyTasks = claimed.task.dependsOn.map((dependencyId) => {
        const dependency = taskLedger.tasks.find(task => task.id === dependencyId)
        if (dependency === undefined) {
          fail('claimed task references a missing durable dependency', 'D_AI_CORRUPT_STATE')
        }
        return dependency
      })

      const executionLedger = this.executionLedger(agent)
      const dependencyCheckpoints = claimed.task.dependsOn.flatMap((dependencyId) => {
        const matching = executionLedger.checkpoints
          .filter(checkpoint => checkpoint.taskId === dependencyId)
          .sort((a, b) => b.sequence - a.sequence)
        return matching[0] === undefined ? [] : [matching[0]]
      })

      const handoffSources = deriveTaskHandoffSources(plan.primarySystem, claimed.task, dependencyTasks)
      if (handoffSources.length > 0) {
        try {
          for (const fromSystem of handoffSources) {
            await this.authorizeDurableCrossSystemHandoff(agent, {
              fromSystem,
              toSystem: claimed.task.systemId,
              capability: CROSS_SYSTEM_TASK_EXECUTION_CAPABILITY,
              missionId: plan.id,
              taskId: claimed.task.id,
              reason: 'Mission Director task execution requires cross-system context handoff',
            })
          }
        } catch (error) {
          const latest = this.taskLedger(agent).tasks.find(task => task.id === claimed.task.id)
          if (latest?.state === 'RUNNING' && hasDaiErrorCode(error, 'D_AI_POLICY_DENIED')) {
            try {
              await this.transitionLeasedTask(
                agent,
                claimed.task.id,
                claimed.lease.id,
                claimed.lease.fence,
                'BLOCKED_POLICY',
              )
            } catch (transitionError) {
              cleanupFailures.push(transitionError)
            }
          }
          throw error
        }
      }

      const route = this.optionalRoutedModel(agent, claimed.task.systemId, 'task-executor')
      const allowedTools = system.riskClass === 'authorized-cyber' || system.riskClass === 'sensitive-operations'
        ? []
        : this.delegation.allowedTools

      execution = await withLeaseHeartbeat(
        signal,
        { ttlMs },
        () => this.renewTaskLease(
          agent,
          claimed.task.id,
          claimed.lease.id,
          claimed.lease.fence,
          ttlMs,
        ),
        async (executionSignal) => {
          const result = await runDirectorTaskExecutor(
            this.ctx,
            agent,
            plan,
            claimed.task,
            system,
            dependencyCheckpoints,
            executionSignal,
            {
              subagentProvider: this.delegation.provider,
              maxDepth: this.delegation.maxDepth,
              maxOutputTokens: this.delegation.maxOutputTokens,
              maxRequests: this.delegation.maxRequestsPerChild,
              timeoutMs: this.delegation.timeoutMs,
              maxResultBytes: this.delegation.maxResultBytes,
              allowedTools,
              ...(route === undefined ? {} : { model: route.id, llmProvider: route.provider }),
            },
          )
          executionSignal.throwIfAborted()

          await this.checkpointTask(
            agent,
            claimed.task.id,
            claimed.lease.id,
            claimed.lease.fence,
            result.nextNeed === undefined ? result.summary : result.summary + '\nNext need: ' + result.nextNeed,
            result.artifactRefs,
          )
          await this.transitionLeasedTask(
            agent,
            claimed.task.id,
            claimed.lease.id,
            claimed.lease.fence,
            result.outcome,
          )
          return result
        },
      )
    } catch (error) {
      primaryFailure = error
      const latest = this.taskLedger(agent).tasks.find(task => task.id === claimed.task.id)
      if (latest?.state === 'RUNNING') {
        try {
          await this.transitionLeasedTask(
            agent,
            claimed.task.id,
            claimed.lease.id,
            claimed.lease.fence,
            'FAILED',
          )
        } catch (transitionError) {
          // A stale/expired fence means recovery owns the task now. Do not let
          // the old executor mutate the newer generation or turn that expected
          // fencing rejection into a secondary cleanup failure.
          if (!hasDaiErrorCode(transitionError, 'D_AI_POLICY_DENIED')) {
            cleanupFailures.push(transitionError)
          }
        }
      }
    } finally {
      const elapsedMs = Math.max(0, performance.now() - startedAt)

      const claimedLease = locateLeaseFence(
        this.executionLedger(agent).leases,
        {
          taskId: claimed.task.id,
          leaseId: claimed.lease.id,
          fence: claimed.lease.fence,
        },
      )
      if (claimedLease?.lease.releasedAt === undefined) {
        try {
          await this.releaseTaskLease(
            agent,
            claimed.task.id,
            claimed.lease.id,
            claimed.lease.fence,
          )
        } catch (releaseError) {
          if (!hasDaiErrorCode(releaseError, 'D_AI_POLICY_DENIED')) {
            cleanupFailures.push(releaseError)
          }
        }
      }

      try {
        await this.recordTaskResourceUsage(agent, claimed.task, {
          tokens: 0,
          moneyUsd: 0,
          wallClockMs: elapsedMs,
          humanAttentionMinutes: 0,
          dataAccessCostUsd: 0,
        })
      } catch (meteringError) {
        cleanupFailures.push(meteringError)
      }
    }

    if (primaryFailure !== undefined) {
      if (cleanupFailures.length > 0) {
        throw new AggregateError(
          [primaryFailure, ...cleanupFailures],
          'D_AI task execution failed and cleanup reported additional failures',
        )
      }
      throw primaryFailure
    }

    if (cleanupFailures.length === 1) throw cleanupFailures[0]
    if (cleanupFailures.length > 1) {
      throw new AggregateError(cleanupFailures, 'D_AI task execution cleanup failed')
    }
    if (execution === undefined) {
      fail('D_AI task execution ended without a result', 'D_AI_EXECUTION_INCOMPLETE')
    }

    return immutableSnapshot({ task: claimed.task, execution })
  }

  /**
   * Execute a bounded batch of runnable tasks for one active Director plan.
   * The cycle is request-bound: it never becomes an unattended background
   * daemon and never exceeds maxTasks without a new explicit invocation.
   */
  async executeDirectorCycle(
    agent: Agent,
    planId: string,
    signal: AbortSignal,
    maxTasks = 4,
    ttlMs = 600000,
  ): Promise<DirectorCycleResult> {
    this.authorize(agent)
    if (!Number.isSafeInteger(maxTasks) || maxTasks < 1 || maxTasks > 8) {
      fail('Director cycle maxTasks must be an integer from 1 to 8', 'D_AI_INVALID_INPUT')
    }

    const key = agent.id + ':' + planId
    if (this.directorCycles.has(key)) {
      fail('a Director execution cycle is already running for this plan', 'D_AI_BUSY')
    }
    this.directorCycles.add(key)

    try {
      const executed: DirectorTaskExecution[] = []

      while (executed.length < maxTasks) {
        signal.throwIfAborted()

        const view = this.directorPlanView(agent, planId, 1)
        if (view.plan.status !== 'ACTIVE' || view.next.selected.length === 0) break

        const result = await this.executeNextDirectorTask(agent, planId, signal, ttlMs)
        executed.push(result)

        if (result.execution.outcome === 'FAILED') break
      }

      const finalView = this.directorPlanView(agent, planId, 1)
      return immutableSnapshot({
        planId,
        executed,
        phase: finalView.phase,
        limitReached: executed.length === maxTasks && finalView.next.selected.length > 0,
        next: finalView.next,
      })
    } finally {
      this.directorCycles.delete(key)
    }
  }

  /**
   * Configure or disable unattended execution for one approved Director plan.
   * Configuration changes are human-approved because they alter future
   * autonomous execution cadence.
   */
  async setDirectorSchedule(
    agent: Agent,
    planId: string,
    input: {
      readonly enabled: boolean
      readonly intervalMs?: number
      readonly maxTasksPerCycle?: number
      readonly leaseTtlMs?: number
      readonly startImmediately?: boolean
    },
    signal?: AbortSignal,
  ): Promise<DirectorScheduleLedger> {
    this.authorize(agent)
    const plan = this.directorPlan(agent, planId)
    if (input.enabled && plan.status !== 'ACTIVE') {
      fail('unattended execution can be enabled only for an active Director plan', 'D_AI_INVALID_TRANSITION')
    }

    const current = this.directorScheduleLedger(agent)
    const previous = current.schedules.find(item => item.planId === planId)
    const intervalMs = input.intervalMs ?? previous?.intervalMs ?? 60000
    const maxTasksPerCycle = input.maxTasksPerCycle ?? previous?.maxTasksPerCycle ?? 4
    const leaseTtlMs = input.leaseTtlMs ?? previous?.leaseTtlMs ?? 600000

    if (!Number.isSafeInteger(intervalMs) || intervalMs < 10
      || !Number.isSafeInteger(maxTasksPerCycle) || maxTasksPerCycle < 1 || maxTasksPerCycle > 8
      || !Number.isSafeInteger(leaseTtlMs) || leaseTtlMs <= intervalMs) {
      fail('invalid unattended Director schedule bounds', 'D_AI_INVALID_INPUT')
    }

    const outcome = await this.ctx.approval.request({
      agent,
      toolName: 'd_ai_director_schedule_set',
      reason: (input.enabled ? 'Enable or update' : 'Disable')
        + ' unattended execution for Director plan '
        + planId,
      ...(signal === undefined ? {} : { signal }),
    })
    if (outcome !== 'allowed-once') {
      fail('human approval is required to change unattended Director scheduling')
    }

    return this.transact(agent, async () => {
      const latest = this.directorScheduleLedger(agent)
      const existing = latest.schedules.find(item => item.planId === planId)
      const nowMs = Date.now()
      const now = new Date(nowMs).toISOString()
      const nextWakeAt = new Date(
        nowMs + (input.enabled && input.startImmediately === true ? 0 : intervalMs),
      ).toISOString()

      const schedule: DirectorSchedule = existing === undefined
        ? {
            id: randomUUID(),
            planId,
            ownerAgentId: agent.id,
            enabled: input.enabled,
            intervalMs,
            maxTasksPerCycle,
            leaseTtlMs,
            nextWakeAt,
            createdAt: now,
            updatedAt: now,
          }
        : {
            ...existing,
            enabled: input.enabled,
            intervalMs,
            maxTasksPerCycle,
            leaseTtlMs,
            nextWakeAt,
            updatedAt: now,
          }

      return this.appendDirectorScheduleLedger(agent, 'UPSERT', {
        ownerAgentId: agent.id,
        revision: latest.revision + 1,
        schedules: existing === undefined
          ? [...latest.schedules, schedule]
          : latest.schedules.map(item => item.id === existing.id ? schedule : item),
      })
    })
  }

  /**
   * Execute one scheduler wake inside the already-open native Agent turn and
   * persist a receipt before the turn closes.
   */
  async runScheduledDirectorCycle(
    agent: Agent,
    scheduleId: string,
    expectedDueAt: string,
    signal: AbortSignal,
  ): Promise<ScheduledDirectorCycleResult> {
    this.authorize(agent)
    this.requireOpenTurn(agent)
    const schedule = this.directorSchedule(agent, scheduleId)
    const plan = this.directorPlan(agent, schedule.planId)
    const attemptedAt = new Date().toISOString()

    // A queued wake is a capability token for one exact durable due time.
    // Reconfiguration or disablement invalidates the old token rather than
    // letting stale background work execute under new settings.
    if (!schedule.enabled
      || plan.status !== 'ACTIVE'
      || schedule.nextWakeAt !== expectedDueAt
      || Date.parse(schedule.nextWakeAt) > Date.parse(attemptedAt)) {
      return immutableSnapshot({
        scheduleId,
        planId: schedule.planId,
        outcome: 'IDLE' as const,
      })
    }

    let cycle: DirectorCycleResult | undefined
    let failure: unknown
    try {
      cycle = await this.executeDirectorCycle(
        agent,
        schedule.planId,
        signal,
        schedule.maxTasksPerCycle,
        schedule.leaseTtlMs,
      )
    } catch (error) {
      failure = error
    }

    const finalView = this.directorPlanView(agent, schedule.planId, 1)
    const receipt: DirectorScheduleCycle = failure === undefined
      ? {
          attemptedAt,
          outcome: (cycle?.executed.length ?? 0) > 0 ? 'EXECUTED' : 'IDLE',
          executedTasks: cycle?.executed.length ?? 0,
          phase: finalView.phase,
        }
      : {
          attemptedAt,
          outcome: 'FAILED',
          executedTasks: cycle?.executed.length ?? 0,
          phase: finalView.phase,
          error: failure instanceof Error ? failure.message : String(failure),
        }

    await this.transact(agent, async () => {
      const latest = this.directorScheduleLedger(agent)
      const current = latest.schedules.find(item => item.id === scheduleId)
      if (current === undefined) fail('Director schedule disappeared during cycle', 'D_AI_CORRUPT_STATE')
      const completedMs = Date.now()
      const updatedAt = new Date(completedMs).toISOString()
      const nextWakeAt = new Date(completedMs + current.intervalMs).toISOString()

      await this.appendDirectorScheduleLedger(agent, 'RECORD_CYCLE', {
        ownerAgentId: agent.id,
        revision: latest.revision + 1,
        schedules: latest.schedules.map(item => item.id === scheduleId
          ? { ...item, nextWakeAt, updatedAt, lastCycle: receipt }
          : item),
      })
    })

    if (failure !== undefined) throw failure

    return immutableSnapshot({
      scheduleId,
      planId: schedule.planId,
      outcome: receipt.outcome,
    })
  }

  /** Change explicit plan lifecycle state after human approval. */
  async setDirectorPlanStatus(
    agent: Agent,
    planId: string,
    status: DirectorPlan['status'],
    signal?: AbortSignal,
  ): Promise<DirectorLedger> {
    this.authorize(agent)
    const currentPlan = this.directorPlan(agent, planId)
    if (currentPlan.status === status) return this.directorLedger(agent)
    const outcome = await this.ctx.approval.request({
      agent,
      toolName: 'd_ai_director_plan_status',
      reason: 'Change Mission Director plan ' + planId + ' status to ' + status,
      ...(signal === undefined ? {} : { signal }),
    })
    if (outcome !== 'allowed-once') fail('human approval is required for Mission Director lifecycle changes')

    return this.transact(agent, async () => {
      const current = this.directorLedger(agent)
      const plan = current.plans.find(item => item.id === planId)
      if (plan === undefined) fail('unknown Mission Director plan', 'D_AI_INVALID_INPUT')
      return this.appendDirectorLedger(agent, 'SET_STATUS', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        plans: current.plans.map(item => item.id === planId ? { ...item, status } : item),
      })
    })
  }

  /** Build a derived Director view from the plan plus authoritative Task Ledger state. */
  directorPlanView(
    agent: Agent,
    planId: string,
    maxTasks = 8,
  ): DirectorPlanRuntimeView {
    const plan = this.directorPlan(agent, planId)
    const fullLedger = this.taskLedger(agent)
    const tasks = fullLedger.tasks.filter(task => task.missionId === plan.id)

    const phase = deriveMissionPhase(plan.status, tasks)

    const scopedLedger: DurableTaskLedger = {
      ownerAgentId: agent.id,
      revision: fullLedger.revision,
      tasks,
    }
    const next = selectDurableRunnableTasks(scopedLedger, maxTasks, this.budgetLedger(agent).profiles)
    return immutableSnapshot({
      plan,
      phase,
      tasks,
      next,
    })
  }

  /** Record one externally produced model evaluation against a governed dataset. */
  async recordModelEvaluation(
    agent: Agent,
    input: { readonly result: ModelEvaluationResult; readonly artifactRef: string },
    signal?: AbortSignal,
  ): Promise<ModelLifecycleLedger> {
    this.authorize(agent)
    if (input.artifactRef.trim().length === 0) fail('model evaluation artifactRef is required', 'D_AI_INVALID_INPUT')

    const training = this.trainingLedger(agent)
    if (!training.datasets.some(dataset => dataset.lineage.datasetId === input.result.datasetId)) {
      fail('model evaluation must reference an existing governed dataset', 'D_AI_INVALID_INPUT')
    }

    const outcome = await this.ctx.approval.request({
      agent,
      toolName: 'd_ai_model_evaluation_record',
      reason: 'Record governed evaluation for model ' + input.result.modelId + ' on dataset ' + input.result.datasetId,
      ...(signal === undefined ? {} : { signal }),
    })
    if (outcome !== 'allowed-once') fail('human approval is required to record model evaluations')

    return this.transact(agent, async () => {
      const current = this.modelLifecycleLedger(agent)
      const evaluation: GovernedModelEvaluation = {
        id: randomUUID(),
        result: input.result,
        artifactRef: input.artifactRef,
        recordedAt: new Date().toISOString(),
        recordedBy: agent.id,
      }
      return this.appendModelLifecycle(agent, 'RECORD_EVALUATION', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        evaluations: [...current.evaluations, evaluation],
        promotions: [...current.promotions],
      })
    })
  }

  /**
   * Recompute a baseline/candidate promotion decision from persisted
   * evaluations. A successful decision records an explicit rollback pointer;
   * it does not deploy or activate the model by itself.
   */
  async evaluateGovernedModelPromotion(
    agent: Agent,
    input: {
      readonly baselineEvaluationId: string
      readonly candidateEvaluationId: string
      readonly policy: PromotionPolicy
    },
    signal?: AbortSignal,
  ): Promise<ModelLifecycleLedger> {
    this.authorize(agent)
    const current = this.modelLifecycleLedger(agent)
    const baseline = current.evaluations.find(item => item.id === input.baselineEvaluationId)
    const candidate = current.evaluations.find(item => item.id === input.candidateEvaluationId)
    if (baseline === undefined || candidate === undefined) fail('promotion requires known baseline and candidate evaluations', 'D_AI_INVALID_INPUT')

    let decision
    try {
      decision = evaluateModelPromotionInternal(
        baseline.result as ModelEvaluationResult,
        candidate.result as ModelEvaluationResult,
        input.policy,
      )
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error), 'D_AI_MODEL_PROMOTION_INVALID')
    }

    const outcome = await this.ctx.approval.request({
      agent,
      toolName: 'd_ai_model_promotion_evaluate',
      reason: 'Persist model promotion decision ' + baseline.result.modelId + ' -> ' + candidate.result.modelId,
      ...(signal === undefined ? {} : { signal }),
    })
    if (outcome !== 'allowed-once') fail('human approval is required to persist model promotion decisions')

    return this.transact(agent, async () => {
      const latest = this.modelLifecycleLedger(agent)
      if (latest.revision !== current.revision) fail('model lifecycle changed during promotion approval; retry with current state', 'D_AI_STALE_STATE')
      const now = new Date().toISOString()
      const release = decision.promote
        ? createModelReleasePointerInternal(
            baseline.result as ModelEvaluationResult,
            candidate.result as ModelEvaluationResult,
            decision,
            now,
          )
        : undefined
      const promotion: GovernedPromotion = {
        id: randomUUID(),
        baselineEvaluationId: baseline.id,
        candidateEvaluationId: candidate.id,
        policy: input.policy,
        decision,
        ...(release === undefined ? {} : { release }),
        decidedAt: now,
        decidedBy: agent.id,
      }
      return this.appendModelLifecycle(agent, 'EVALUATE_PROMOTION', {
        ownerAgentId: agent.id,
        revision: latest.revision + 1,
        evaluations: [...latest.evaluations],
        promotions: [...latest.promotions, promotion],
      })
    })
  }

  /**
   * Register metadata for one possible training artifact after explicit human
   * approval. Raw training content is never accepted here; only an artifactRef
   * plus governance metadata enters the durable Session log.
   */
  async registerTrainingCandidate(
    agent: Agent,
    input: Omit<TrainingDataCandidate, 'id' | 'humanApproved'> & { readonly artifactRef: string },
    signal?: AbortSignal,
  ): Promise<TrainingLedger> {
    this.authorize(agent)
    if (input.artifactRef.trim().length === 0) fail('training artifactRef is required', 'D_AI_INVALID_INPUT')

    const outcome = await this.ctx.approval.request({
      agent,
      toolName: 'd_ai_training_register_candidate',
      reason: 'Register training-governance metadata for project ' + input.projectId + ' from ' + input.artifactRef,
      ...(signal === undefined ? {} : { signal }),
    })
    if (outcome !== 'allowed-once') fail('human approval is required to register training candidates')

    return this.transact(agent, async () => {
      const current = this.trainingLedger(agent)
      const candidate: TrainingDataCandidate = {
        id: randomUUID(),
        projectId: input.projectId,
        sourceType: input.sourceType,
        sensitivity: input.sensitivity,
        explicitTrainingOptIn: input.explicitTrainingOptIn,
        ownershipAllowsTraining: input.ownershipAllowsTraining,
        licenseAllowsTraining: input.licenseAllowsTraining,
        containsSecret: input.containsSecret,
        containsPersonalData: input.containsPersonalData,
        personalDataRedacted: input.personalDataRedacted,
        qualityScore: input.qualityScore,
        humanApproved: true,
      }
      const governed: GovernedTrainingCandidate = {
        candidate,
        artifactRef: input.artifactRef,
        registeredAt: new Date().toISOString(),
        registeredBy: agent.id,
        eligibility: evaluateTrainingEligibilityInternal(candidate),
      }
      return this.appendTrainingLedger(agent, 'REGISTER_CANDIDATE', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        candidates: [...current.candidates, governed],
        datasets: [...current.datasets],
      })
    })
  }

  /**
   * Build immutable dataset lineage from previously registered eligible
   * candidates. Training and holdout identities must be disjoint and both are
   * re-evaluated against the current fail-closed policy before commit.
   */
  async buildTrainingDataset(
    agent: Agent,
    input: {
      readonly datasetId: string
      readonly version: number
      readonly candidateIds: readonly string[]
      readonly holdoutCandidateIds: readonly string[]
    },
    signal?: AbortSignal,
  ): Promise<TrainingLedger> {
    this.authorize(agent)
    if (input.datasetId.trim().length === 0) fail('training dataset id is required', 'D_AI_INVALID_INPUT')
    if (!Number.isSafeInteger(input.version) || input.version < 1) fail('training dataset version must be a positive safe integer', 'D_AI_INVALID_INPUT')

    const current = this.trainingLedger(agent)
    const byId = new Map(current.candidates.map(item => [item.candidate.id, item]))
    const resolve = (id: string): GovernedTrainingCandidate => {
      const item = byId.get(id)
      if (item === undefined) fail('unknown training candidate: ' + id, 'D_AI_INVALID_INPUT')
      return item
    }
    const accepted = input.candidateIds.map(id => resolve(id).candidate as TrainingDataCandidate)
    const holdout = input.holdoutCandidateIds.map(id => resolve(id).candidate as TrainingDataCandidate)

    let lineage
    try {
      lineage = buildDatasetLineageInternal(input.datasetId, input.version, accepted, holdout)
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error), 'D_AI_TRAINING_POLICY_DENIED')
    }

    if (current.datasets.some(item => item.lineage.datasetId === input.datasetId && item.lineage.version === input.version)) {
      fail('training dataset version already exists', 'D_AI_INVALID_INPUT')
    }

    const outcome = await this.ctx.approval.request({
      agent,
      toolName: 'd_ai_training_build_dataset',
      reason: 'Build governed Local Intelligence Core dataset ' + input.datasetId + ' v' + input.version,
      ...(signal === undefined ? {} : { signal }),
    })
    if (outcome !== 'allowed-once') fail('human approval is required to build training datasets')

    return this.transact(agent, async () => {
      const latest = this.trainingLedger(agent)
      if (latest.revision !== current.revision) fail('training ledger changed during dataset approval; retry with current state', 'D_AI_STALE_STATE')
      const dataset: GovernedDataset = {
        lineage,
        createdAt: new Date().toISOString(),
        createdBy: agent.id,
      }
      return this.appendTrainingLedger(agent, 'BUILD_DATASET', {
        ownerAgentId: agent.id,
        revision: latest.revision + 1,
        candidates: [...latest.candidates],
        datasets: [...latest.datasets, dataset],
      })
    })
  }

  /** Register or update one non-secret model capability/evaluation profile after human approval. */
  async upsertModelProfile(
    agent: Agent,
    profile: ModelProfile,
    signal?: AbortSignal,
  ): Promise<ModelRegistry> {
    this.authorize(agent)
    const outcome = await this.ctx.approval.request({
      agent,
      toolName: 'd_ai_model_upsert',
      reason: 'Change D_AI model registry profile: ' + profile.id,
      ...(signal === undefined ? {} : { signal }),
    })
    if (outcome !== 'allowed-once') fail('human approval is required for model registry changes')

    return this.transact(agent, async () => {
      const current = this.modelRegistry(agent)
      const existing = current.models.find(item => item.id === profile.id)
      return this.appendModelRegistry(agent, 'UPSERT_MODEL', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        models: existing === undefined
          ? [...current.models, profile]
          : current.models.map(item => item.id === profile.id ? profile : item),
        policies: [...current.policies],
      })
    })
  }

  /** Create or update one system/role routing policy after human approval. */
  async setModelRoutingPolicy(
    agent: Agent,
    input: Omit<ModelRoutingPolicy, 'id' | 'updatedAt' | 'updatedBy'>,
    signal?: AbortSignal,
  ): Promise<ModelRegistry> {
    this.authorize(agent)
    const outcome = await this.ctx.approval.request({
      agent,
      toolName: 'd_ai_model_policy_set',
      reason: 'Change model routing policy for ' + input.systemId + ':' + input.role,
      ...(signal === undefined ? {} : { signal }),
    })
    if (outcome !== 'allowed-once') fail('human approval is required for model routing policy changes')

    return this.transact(agent, async () => {
      const current = this.modelRegistry(agent)
      const existing = current.policies.find(policy => policy.systemId === input.systemId && policy.role === input.role)
      const policy: ModelRoutingPolicy = {
        ...input,
        id: existing?.id ?? randomUUID(),
        updatedAt: new Date().toISOString(),
        updatedBy: agent.id,
      }
      return this.appendModelRegistry(agent, 'SET_POLICY', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        models: [...current.models],
        policies: existing === undefined
          ? [...current.policies, policy]
          : current.policies.map(item => item.id === existing.id ? policy : item),
      })
    })
  }

  /**
   * Resolve an optional persisted model route. Absence of a policy preserves
   * deployment fallback configuration; presence of an unsatisfied policy fails
   * closed instead of silently ignoring the control-plane decision.
   */
  private optionalRoutedModel(
    agent: Agent,
    systemId: CapabilityGrant['systemId'],
    role: string,
  ): ModelProfile | undefined {
    const registry = this.modelRegistry(agent)
    const policy = registry.policies.find(item => item.systemId === systemId && item.role === role)
    if (policy === undefined) return undefined
    try {
      return chooseModelInternal(registry.models as readonly ModelProfile[], {
        requiredCapabilities: policy.requiredCapabilities as readonly ModelCapability[],
        minContextTokens: policy.minContextTokens,
        localOnly: policy.localOnly,
        ...(policy.weights === undefined ? {} : { weights: policy.weights }),
      }).model
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error), 'D_AI_MODEL_ROUTE_FAILED')
    }
  }

  /** Route one system/role to the best enabled registered model meeting hard requirements. */
  routeRegisteredModel(
    agent: Agent,
    systemId: CapabilityGrant['systemId'],
    role: string,
  ): ReturnType<typeof chooseModelInternal> {
    this.authorize(agent)
    const registry = this.modelRegistry(agent)
    const policy = registry.policies.find(item => item.systemId === systemId && item.role === role)
    if (policy === undefined) fail('no model routing policy exists for this system/role', 'D_AI_INVALID_INPUT')
    try {
      return immutableSnapshot(chooseModelInternal(registry.models as readonly ModelProfile[], {
        requiredCapabilities: policy.requiredCapabilities as readonly ModelCapability[],
        minContextTokens: policy.minContextTokens,
        localOnly: policy.localOnly,
        ...(policy.weights === undefined ? {} : { weights: policy.weights }),
      }))
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error), 'D_AI_MODEL_ROUTE_FAILED')
    }
  }

  /** Claim the highest-priority runnable task and acquire a durable execution lease. */
  async claimNextRunnableTask(
    agent: Agent,
    ttlMs = 300000,
    missionId?: string,
  ): Promise<{ readonly task: MissionTask; readonly lease: TaskLease }> {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 3600000) {
      fail('task lease ttl must be an integer from 1000 to 3600000 ms', 'D_AI_INVALID_INPUT')
    }

    return this.transact(agent, async () => {
      const tasks = this.taskLedger(agent)
      const budgets = this.budgetLedger(agent)
      const scopedTasks: DurableTaskLedger = missionId === undefined ? tasks : {
        ownerAgentId: tasks.ownerAgentId,
        revision: tasks.revision,
        tasks: tasks.tasks.filter(task => task.missionId === missionId),
      }
      const selection = selectDurableRunnableTasks(scopedTasks, 1, budgets.profiles)
      const selected = selection.selected[0]
      if (selected === undefined) {
        const budgetBlocked = selection.blocked.filter(item => item.reason === 'budget')
        if (budgetBlocked.length > 0) fail('no runnable task: matching resource budget is exhausted', 'D_AI_BUDGET_EXCEEDED')
        fail('no runnable D_AI task is available', 'D_AI_NO_RUNNABLE_TASK')
      }

      const now = new Date()
      const nowIso = now.toISOString()
      const executions = this.executionLedger(agent)
      const active = executions.leases.find(lease =>
        lease.taskId === selected.id
        && lease.releasedAt === undefined
        && Date.parse(lease.expiresAt) > now.getTime())
      if (active !== undefined) fail('selected task already has an active execution lease', 'D_AI_BUSY')

      let taskLedger = tasks
      let task = selected
      if (task.state === 'PENDING') {
        const ready = transitionTaskInternal(task, 'READY')
        taskLedger = await this.appendTaskLedger(agent, 'TRANSITION', {
          ownerAgentId: agent.id,
          revision: taskLedger.revision + 1,
          tasks: taskLedger.tasks.map(item => item.id === task.id ? ready : item),
        })
        task = ready
      }
      const running = transitionTaskInternal(task, 'RUNNING')
      taskLedger = await this.appendTaskLedger(agent, 'TRANSITION', {
        ownerAgentId: agent.id,
        revision: taskLedger.revision + 1,
        tasks: taskLedger.tasks.map(item => item.id === task.id ? running : item),
      })

      const lease: TaskLease = {
        id: randomUUID(),
        taskId: running.id,
        missionId: running.missionId,
        holderId: agent.id,
        fence: nextLeaseFence(executions.leases, running.id),
        acquiredAt: nowIso,
        expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      }
      await this.appendExecutionLedger(agent, 'ACQUIRE_LEASE', {
        ownerAgentId: agent.id,
        revision: executions.revision + 1,
        leases: [...executions.leases, lease],
        checkpoints: [...executions.checkpoints],
      })

      return immutableSnapshot({ task: running, lease })
    })
  }

  /** Extend one exact active task-lease generation. */
  async renewTaskLease(
    agent: Agent,
    taskId: string,
    leaseId: string,
    fence: number,
    ttlMs = 300000,
  ): Promise<TaskLease> {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 3600000) {
      fail('task lease ttl must be an integer from 1000 to 3600000 ms', 'D_AI_INVALID_INPUT')
    }
    if (!Number.isSafeInteger(fence) || fence < 1 || leaseId.trim().length === 0) {
      fail('valid lease id and fence are required', 'D_AI_INVALID_INPUT')
    }
    return this.transact(agent, async () => {
      const current = this.executionLedger(agent)
      const now = Date.now()
      const located = locateActiveLeaseFence(current.leases, { taskId, leaseId, fence }, agent.id, now)
      if (located === undefined) {
        fail('task lease fence is stale, expired, released or owned by another executor', 'D_AI_POLICY_DENIED')
      }
      const nextExpiry = new Date(Math.max(Date.parse(located.lease.expiresAt) + 1, now + ttlMs)).toISOString()
      const renewed: TaskLease = { ...located.lease, expiresAt: nextExpiry }
      await this.appendExecutionLedger(agent, 'RENEW_LEASE', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        leases: current.leases.map((item, itemIndex) => itemIndex === located.index ? renewed : item),
        checkpoints: [...current.checkpoints],
      })
      return immutableSnapshot(renewed)
    })
  }

  /** Append a durable checkpoint bound to one exact active lease generation. */
  async checkpointTask(
    agent: Agent,
    taskId: string,
    leaseId: string,
    fence: number,
    summary: string,
    artifactRefs: readonly string[] = [],
  ): Promise<TaskCheckpoint> {
    if (summary.trim().length === 0 || artifactRefs.some(ref => ref.trim().length === 0)) {
      fail('checkpoint summary and artifact references must be non-empty', 'D_AI_INVALID_INPUT')
    }
    if (!Number.isSafeInteger(fence) || fence < 1 || leaseId.trim().length === 0) {
      fail('valid lease id and fence are required', 'D_AI_INVALID_INPUT')
    }
    return this.transact(agent, async () => {
      const current = this.executionLedger(agent)
      const now = Date.now()
      const located = locateActiveLeaseFence(current.leases, { taskId, leaseId, fence }, agent.id, now)
      if (located === undefined) {
        fail('checkpoint requires the current active task lease fence', 'D_AI_POLICY_DENIED')
      }
      const task = this.taskLedger(agent).tasks.find(item => item.id === taskId)
      if (task === undefined || !['RUNNING', 'WAITING_FOR_HUMAN', 'WAITING_FOR_TOOL'].includes(task.state)) {
        fail('checkpoint requires a running or waiting task', 'D_AI_INVALID_TRANSITION')
      }
      const sequence = current.checkpoints
        .filter(item => item.taskId === taskId)
        .reduce((max, item) => Math.max(max, item.sequence), 0) + 1
      const checkpoint: TaskCheckpoint = {
        id: randomUUID(),
        taskId,
        leaseId,
        fence,
        sequence,
        at: new Date(now).toISOString(),
        summary,
        artifactRefs: [...artifactRefs],
      }
      await this.appendExecutionLedger(agent, 'CHECKPOINT', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        leases: [...current.leases],
        checkpoints: [...current.checkpoints, checkpoint],
      })
      return immutableSnapshot(checkpoint)
    })
  }

  /** Release one exact lease generation; never release a newer executor's lease. */
  async releaseTaskLease(
    agent: Agent,
    taskId: string,
    leaseId: string,
    fence: number,
  ): Promise<TaskLease> {
    if (!Number.isSafeInteger(fence) || fence < 1 || leaseId.trim().length === 0) {
      fail('valid lease id and fence are required', 'D_AI_INVALID_INPUT')
    }
    return this.transact(agent, async () => {
      const current = this.executionLedger(agent)
      const located = locateLeaseFence(current.leases, { taskId, leaseId, fence })
      if (
        located === undefined
        || located.lease.holderId !== agent.id
        || located.lease.releasedAt !== undefined
      ) {
        fail('task has no releasable matching lease fence owned by this executor', 'D_AI_POLICY_DENIED')
      }
      const released: TaskLease = { ...located.lease, releasedAt: new Date().toISOString() }
      await this.appendExecutionLedger(agent, 'RELEASE_LEASE', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        leases: current.leases.map((item, itemIndex) => itemIndex === located.index ? released : item),
        checkpoints: [...current.checkpoints],
      })
      return immutableSnapshot(released)
    })
  }

  /**
   * Recover tasks stranded by expired leases. Expired RUNNING/WAITING_FOR_TOOL
   * work is failed then retried within its maxAttempts budget; WAITING_FOR_HUMAN
   * returns to READY without consuming a retry.
   */
  async recoverExpiredTaskLeases(
    agent: Agent,
    nowMs = Date.now(),
  ): Promise<Readonly<{ recoveredTaskIds: readonly string[]; retryExhaustedTaskIds: readonly string[] }>> {
    if (!Number.isFinite(nowMs) || nowMs < 0) fail('invalid recovery clock', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => {
      let executions = this.executionLedger(agent)
      let tasks = this.taskLedger(agent)
      const nowIso = new Date(nowMs).toISOString()
      const activeTaskIds = new Set(
        executions.leases
          .filter(lease => lease.releasedAt === undefined && Date.parse(lease.expiresAt) > nowMs)
          .map(lease => lease.taskId),
      )
      const expired = executions.leases.filter(lease =>
        lease.releasedAt === undefined
        && Date.parse(lease.expiresAt) <= nowMs
        && !activeTaskIds.has(lease.taskId))

      const recovered = new Set<string>()
      const exhausted = new Set<string>()

      for (const lease of expired) {
        const leaseIndex = executions.leases.findIndex(item => item.id === lease.id)
        if (leaseIndex < 0) continue
        const released: TaskLease = { ...lease, releasedAt: nowIso }
        executions = await this.appendExecutionLedger(agent, 'RELEASE_LEASE', {
          ownerAgentId: agent.id,
          revision: executions.revision + 1,
          leases: executions.leases.map((item, index) => index === leaseIndex ? released : item),
          checkpoints: [...executions.checkpoints],
        })

        if (recovered.has(lease.taskId) || exhausted.has(lease.taskId)) continue
        const task = tasks.tasks.find(item => item.id === lease.taskId)
        if (task === undefined) continue

        if (task.state === 'RUNNING' || task.state === 'WAITING_FOR_TOOL') {
          const failed = transitionTaskInternal(task as MissionTask, 'FAILED')
          tasks = await this.appendTaskLedger(agent, 'TRANSITION', {
            ownerAgentId: agent.id,
            revision: tasks.revision + 1,
            tasks: tasks.tasks.map(item => item.id === task.id ? failed : item),
          })
          try {
            const pending = transitionTaskInternal(failed, 'PENDING')
            tasks = await this.appendTaskLedger(agent, 'TRANSITION', {
              ownerAgentId: agent.id,
              revision: tasks.revision + 1,
              tasks: tasks.tasks.map(item => item.id === task.id ? pending : item),
            })
            recovered.add(task.id)
          } catch {
            exhausted.add(task.id)
          }
        } else if (task.state === 'WAITING_FOR_HUMAN') {
          const ready = transitionTaskInternal(task as MissionTask, 'READY')
          tasks = await this.appendTaskLedger(agent, 'TRANSITION', {
            ownerAgentId: agent.id,
            revision: tasks.revision + 1,
            tasks: tasks.tasks.map(item => item.id === task.id ? ready : item),
          })
          recovered.add(task.id)
        } else if (task.state === 'FAILED') {
          try {
            const pending = transitionTaskInternal(task as MissionTask, 'PENDING')
            tasks = await this.appendTaskLedger(agent, 'TRANSITION', {
              ownerAgentId: agent.id,
              revision: tasks.revision + 1,
              tasks: tasks.tasks.map(item => item.id === task.id ? pending : item),
            })
            recovered.add(task.id)
          } catch {
            exhausted.add(task.id)
          }
        }
      }

      return immutableSnapshot({
        recoveredTaskIds: [...recovered].sort(),
        retryExhaustedTaskIds: [...exhausted].sort(),
      })
    })
  }

  private assertActiveSideEffectLease(
    agent: Agent,
    input: Pick<SideEffectReservationInput, 'taskId' | 'missionId' | 'systemId' | 'leaseId' | 'fence'>,
  ): TaskLease {
    const task = this.taskLedger(agent).tasks.find(item => item.id === input.taskId)
    if (
      task === undefined
      || task.missionId !== input.missionId
      || task.systemId !== input.systemId
    ) {
      fail('side effect does not match the durable task identity', 'D_AI_POLICY_DENIED')
    }

    const located = locateActiveLeaseFence(
      this.executionLedger(agent).leases,
      {
        taskId: input.taskId,
        leaseId: input.leaseId,
        fence: input.fence,
      },
      agent.id,
      Date.now(),
    )
    if (
      located === undefined
      || located.lease.missionId !== input.missionId
    ) {
      fail('side effect requires the current active task lease fence', 'D_AI_POLICY_DENIED')
    }
    return located.lease
  }

  /**
   * Reserve one external side effect under a stable idempotency key.
   *
   * Repeating the same reservation returns the existing record. An undispatched
   * reservation may be rebound to a newer active lease generation after
   * recovery; dispatched/terminal records are never silently replayed.
   */
  async reserveSideEffect(
    agent: Agent,
    input: SideEffectReservationInput,
  ): Promise<SideEffectRecord> {
    return this.transact(agent, async () => {
      this.assertActiveSideEffectLease(agent, input)
      const current = this.sideEffectLedger(agent)
      const existing = current.records.find(record => record.idempotencyKey === input.idempotencyKey)

      if (existing !== undefined) {
        if (!sameSideEffectRequest(existing, input)) {
          fail('idempotency key already belongs to a different side-effect request', 'D_AI_IDEMPOTENCY_CONFLICT')
        }
        if (existing.state !== 'RESERVED') return immutableSnapshot(existing)
        if (existing.leaseId === input.leaseId && existing.fence === input.fence) {
          return immutableSnapshot(existing)
        }

        let rebound: SideEffectRecord
        try {
          rebound = rebindReservedSideEffect(existing, input.leaseId, input.fence)
        } catch (error) {
          fail(error instanceof Error ? error.message : String(error), 'D_AI_INVALID_TRANSITION')
        }
        const next = await this.appendSideEffectLedger(agent, 'REBIND', {
          ownerAgentId: agent.id,
          revision: current.revision + 1,
          records: current.records.map(record => record.id === existing.id ? rebound : record),
        })
        return immutableSnapshot(next.records.find(record => record.id === existing.id)!)
      }

      let reserved: SideEffectRecord
      try {
        reserved = createReservedSideEffect(randomUUID(), new Date().toISOString(), input)
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error), 'D_AI_INVALID_INPUT')
      }

      const next = await this.appendSideEffectLedger(agent, 'RESERVE', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        records: [...current.records, reserved],
      })
      return immutableSnapshot(next.records.at(-1)!)
    })
  }

  /** Mark the exact reserved effect as dispatched immediately before connector I/O. */
  async markSideEffectDispatched(
    agent: Agent,
    idempotencyKey: string,
    leaseId: string,
    fence: number,
  ): Promise<SideEffectRecord> {
    return this.transact(agent, async () => {
      const current = this.sideEffectLedger(agent)
      const record = current.records.find(item => item.idempotencyKey === idempotencyKey)
      if (record === undefined) fail('unknown side-effect idempotency key', 'D_AI_INVALID_INPUT')
      this.assertActiveSideEffectLease(agent, {
        taskId: record.taskId,
        missionId: record.missionId,
        systemId: record.systemId,
        leaseId,
        fence,
      })
      if (record.leaseId !== leaseId || record.fence !== fence) {
        fail('side-effect reservation belongs to a different lease fence', 'D_AI_POLICY_DENIED')
      }

      let dispatched: SideEffectRecord
      try {
        dispatched = markSideEffectDispatchedRecord(record, new Date().toISOString())
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error), 'D_AI_INVALID_TRANSITION')
      }

      const next = await this.appendSideEffectLedger(agent, 'MARK_DISPATCHED', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        records: current.records.map(item => item.id === record.id ? dispatched : item),
      })
      return immutableSnapshot(next.records.find(item => item.id === record.id)!)
    })
  }

  /** Commit a confirmed connector result while the exact dispatch fence is active. */
  async commitSideEffect(
    agent: Agent,
    idempotencyKey: string,
    leaseId: string,
    fence: number,
    resultDigest: string,
    artifactRefs: readonly string[] = [],
  ): Promise<SideEffectRecord> {
    return this.transact(agent, async () => {
      const current = this.sideEffectLedger(agent)
      const record = current.records.find(item => item.idempotencyKey === idempotencyKey)
      if (record === undefined) fail('unknown side-effect idempotency key', 'D_AI_INVALID_INPUT')
      if (record.state === 'COMMITTED') {
        if (
          record.resultDigest !== resultDigest
          || JSON.stringify(record.artifactRefs) !== JSON.stringify([...artifactRefs])
        ) {
          fail('committed idempotency key conflicts with a different result', 'D_AI_IDEMPOTENCY_CONFLICT')
        }
        return immutableSnapshot(record)
      }
      this.assertActiveSideEffectLease(agent, {
        taskId: record.taskId,
        missionId: record.missionId,
        systemId: record.systemId,
        leaseId,
        fence,
      })
      if (record.leaseId !== leaseId || record.fence !== fence) {
        fail('side-effect dispatch belongs to a different lease fence', 'D_AI_POLICY_DENIED')
      }

      let committed: SideEffectRecord
      try {
        committed = commitSideEffectRecord(
          record,
          new Date().toISOString(),
          resultDigest,
          artifactRefs,
        )
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error), 'D_AI_INVALID_TRANSITION')
      }

      const next = await this.appendSideEffectLedger(agent, 'COMMIT', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        records: current.records.map(item => item.id === record.id ? committed : item),
      })
      return immutableSnapshot(next.records.find(item => item.id === record.id)!)
    })
  }

  /**
   * Record uncertainty after dispatch. This transition is deliberately allowed
   * even after lease loss because it reduces risk and never repeats the effect.
   */
  async markSideEffectOutcomeUnknown(
    agent: Agent,
    idempotencyKey: string,
  ): Promise<SideEffectRecord> {
    return this.transact(agent, async () => {
      const current = this.sideEffectLedger(agent)
      const record = current.records.find(item => item.idempotencyKey === idempotencyKey)
      if (record === undefined) fail('unknown side-effect idempotency key', 'D_AI_INVALID_INPUT')
      if (record.state === 'COMMITTED' || record.state === 'OUTCOME_UNKNOWN') {
        return immutableSnapshot(record)
      }

      let unknown: SideEffectRecord
      try {
        unknown = markSideEffectOutcomeUnknownRecord(record, new Date().toISOString())
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error), 'D_AI_INVALID_TRANSITION')
      }

      const next = await this.appendSideEffectLedger(agent, 'MARK_UNKNOWN', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        records: current.records.map(item => item.id === record.id ? unknown : item),
      })
      return immutableSnapshot(next.records.find(item => item.id === record.id)!)
    })
  }

  /** Abort an undispatched reservation while its exact lease generation is active. */
  async abortReservedSideEffect(
    agent: Agent,
    idempotencyKey: string,
    leaseId: string,
    fence: number,
  ): Promise<SideEffectRecord> {
    return this.transact(agent, async () => {
      const current = this.sideEffectLedger(agent)
      const record = current.records.find(item => item.idempotencyKey === idempotencyKey)
      if (record === undefined) fail('unknown side-effect idempotency key', 'D_AI_INVALID_INPUT')
      this.assertActiveSideEffectLease(agent, {
        taskId: record.taskId,
        missionId: record.missionId,
        systemId: record.systemId,
        leaseId,
        fence,
      })
      if (record.leaseId !== leaseId || record.fence !== fence) {
        fail('side-effect reservation belongs to a different lease fence', 'D_AI_POLICY_DENIED')
      }

      let aborted: SideEffectRecord
      try {
        aborted = abortReservedSideEffect(record, new Date().toISOString())
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error), 'D_AI_INVALID_TRANSITION')
      }

      const next = await this.appendSideEffectLedger(agent, 'ABORT', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        records: current.records.map(item => item.id === record.id ? aborted : item),
      })
      return immutableSnapshot(next.records.find(item => item.id === record.id)!)
    })
  }

  /** Resolve an uncertain dispatched effect only after explicit human approval. */
  async reconcileSideEffect(
    agent: Agent,
    input: {
      readonly idempotencyKey: string
      readonly outcome: 'COMMITTED' | 'ABORTED'
      readonly note: string
      readonly resultDigest?: string
      readonly artifactRefs?: readonly string[]
    },
    signal?: AbortSignal,
  ): Promise<SideEffectRecord> {
    this.authorize(agent)
    const outcome = await this.ctx.approval.request({
      agent,
      toolName: 'd_ai_side_effect_reconcile',
      reason: 'Reconcile uncertain side effect ' + input.idempotencyKey + ' as ' + input.outcome,
      ...(signal === undefined ? {} : { signal }),
    })
    if (outcome !== 'allowed-once') {
      fail('human approval is required to reconcile an uncertain side effect')
    }

    return this.transact(agent, async () => {
      const current = this.sideEffectLedger(agent)
      const record = current.records.find(item => item.idempotencyKey === input.idempotencyKey)
      if (record === undefined) fail('unknown side-effect idempotency key', 'D_AI_INVALID_INPUT')

      let reconciled: SideEffectRecord
      try {
        reconciled = reconcileUnknownSideEffect(record, {
          outcome: input.outcome,
          at: new Date().toISOString(),
          by: agent.id,
          note: input.note,
          ...(input.resultDigest === undefined ? {} : { resultDigest: input.resultDigest }),
          ...(input.artifactRefs === undefined ? {} : { artifactRefs: input.artifactRefs }),
        })
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error), 'D_AI_INVALID_TRANSITION')
      }

      const next = await this.appendSideEffectLedger(agent, 'RECONCILE', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        records: current.records.map(item => item.id === record.id ? reconciled : item),
      })
      return immutableSnapshot(next.records.find(item => item.id === record.id)!)
    })
  }

  /** Append one provenance-carrying node to the shared D_AI evidence graph. */
  async addSharedEvidenceNode(
    agent: Agent,
    input: Omit<EvidenceNode, 'id' | 'createdAt'>,
  ): Promise<EvidenceStore> {
    if (input.label.trim().length === 0 || input.provenance.length === 0 || input.provenance.some(item => item.trim().length === 0)) {
      fail('evidence node requires a label and non-empty provenance references', 'D_AI_INVALID_INPUT')
    }
    if (input.confidence !== undefined && (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)) {
      fail('evidence confidence must be between 0 and 1', 'D_AI_INVALID_INPUT')
    }
    return this.transact(agent, async () => {
      const current = this.evidenceStore(agent)
      const node: EvidenceNode = {
        id: randomUUID(),
        kind: input.kind,
        systemId: input.systemId,
        label: input.label,
        createdAt: new Date().toISOString(),
        provenance: [...input.provenance],
        ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
      }
      return this.appendEvidenceStore(agent, 'ADD_NODE', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        nodes: [...current.nodes, node],
        edges: [...current.edges],
      })
    })
  }

  /** Append one relation between existing shared evidence nodes. */
  async addSharedEvidenceEdge(
    agent: Agent,
    input: Omit<EvidenceEdge, 'id' | 'createdAt' | 'actorId'>,
  ): Promise<EvidenceStore> {
    return this.transact(agent, async () => {
      const current = this.evidenceStore(agent)
      if (!current.nodes.some(node => node.id === input.from) || !current.nodes.some(node => node.id === input.to)) {
        fail('shared evidence edge endpoints must already exist', 'D_AI_INVALID_INPUT')
      }
      const edge: EvidenceEdge = {
        id: randomUUID(),
        from: input.from,
        to: input.to,
        kind: input.kind,
        createdAt: new Date().toISOString(),
        actorId: agent.id,
      }
      return this.appendEvidenceStore(agent, 'ADD_EDGE', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        nodes: [...current.nodes],
        edges: [...current.edges, edge],
      })
    })
  }

  /**
   * Create or update one scoped resource budget after native human approval.
   * Accumulated usage is preserved when limits change.
   */
  async setResourceBudget(
    agent: Agent,
    input: { scope: BudgetProfile['scope']; scopeId: string; limits: ResourceBudget },
    signal?: AbortSignal,
  ): Promise<BudgetLedger> {
    this.authorize(agent)
    if (input.scopeId.trim().length === 0 || Object.keys(input.limits).length === 0) {
      fail('budget scope id and at least one resource limit are required', 'D_AI_INVALID_INPUT')
    }

    const outcome = await this.ctx.approval.request({
      agent,
      toolName: 'd_ai_budget_set',
      reason: 'Change D_AI resource budget for ' + input.scope + ':' + input.scopeId,
      ...(signal === undefined ? {} : { signal }),
    })
    if (outcome !== 'allowed-once') fail('human approval is required for budget changes')

    return this.transact(agent, async () => {
      const current = this.budgetLedger(agent)
      const now = new Date().toISOString()
      const existing = current.profiles.find(profile => profile.scope === input.scope && profile.scopeId === input.scopeId)
      const zeroUsage: ResourceUsage = {
        tokens: 0,
        moneyUsd: 0,
        wallClockMs: 0,
        humanAttentionMinutes: 0,
        dataAccessCostUsd: 0,
      }
      const profile: BudgetProfile = existing === undefined ? {
        id: randomUUID(),
        ownerAgentId: agent.id,
        scope: input.scope,
        scopeId: input.scopeId,
        limits: input.limits,
        usage: zeroUsage,
        createdAt: now,
        updatedAt: now,
        updatedBy: agent.id,
      } : {
        ...existing,
        limits: input.limits,
        updatedAt: now,
        updatedBy: agent.id,
      }

      return this.appendBudgetLedger(agent, 'SET_BUDGET', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        profiles: existing === undefined
          ? [...current.profiles, profile]
          : current.profiles.map(item => item.id === existing.id ? profile : item),
      })
    })
  }

  /**
   * Runtime-only accounting seam. Tool/model code should not call this
   * directly; instrumentation records measured deltas here.
   */
  async recordResourceUsage(
    agent: Agent,
    profileId: string,
    delta: ResourceUsage,
  ): Promise<BudgetLedger> {
    return this.transact(agent, async () => {
      const current = this.budgetLedger(agent)
      const existing = current.profiles.find(profile => profile.id === profileId)
      if (existing === undefined) fail('unknown budget profile', 'D_AI_INVALID_INPUT')
      const next: BudgetProfile = {
        ...existing,
        usage: addResourceUsage(existing.usage, delta),
        updatedAt: new Date().toISOString(),
        updatedBy: agent.id,
      }
      return this.appendBudgetLedger(agent, 'ADD_USAGE', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        profiles: current.profiles.map(item => item.id === existing.id ? next : item),
      })
    })
  }

  /**
   * Apply one measured task-execution delta to every configured budget scope
   * that governs that task. All matching profiles advance in one durable fact.
   */
  async recordTaskResourceUsage(
    agent: Agent,
    task: MissionTask,
    delta: ResourceUsage,
  ): Promise<BudgetLedger> {
    return this.transact(agent, async () => {
      const current = this.budgetLedger(agent)
      const matching = budgetProfilesForTask(task, current.profiles)
      if (matching.length === 0) return current

      const matchingIds = new Set(matching.map(profile => profile.id))
      const now = new Date().toISOString()
      return this.appendBudgetLedger(agent, 'ADD_USAGE', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        profiles: current.profiles.map((profile) => matchingIds.has(profile.id)
          ? {
              ...profile,
              usage: addResourceUsage(profile.usage, delta),
              updatedAt: now,
              updatedBy: agent.id,
            }
          : profile),
      })
    })
  }

  /** Append new shared tasks to the durable owner ledger. */
  async addDurableTasks(agent: Agent, tasks: readonly MissionTask[]): Promise<DurableTaskLedger> {
    if (tasks.length === 0) fail('at least one durable task is required', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => {
      const current = this.taskLedger(agent)
      const existingIds = new Set(current.tasks.map(task => task.id))
      for (const task of tasks) {
        if (existingIds.has(task.id)) fail('durable task identity already exists: ' + task.id, 'D_AI_INVALID_INPUT')
      }
      return this.appendTaskLedger(agent, 'ADD_TASKS', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        tasks: [...current.tasks, ...tasks],
      })
    })
  }

  /** Apply one validated state transition to a durable task. */
  async transitionDurableTask(agent: Agent, taskId: string, next: TaskState): Promise<DurableTaskLedger> {
    return this.transact(agent, async () => {
      const current = this.taskLedger(agent)
      const task = current.tasks.find(item => item.id === taskId)
      if (task === undefined) fail('unknown durable task', 'D_AI_INVALID_INPUT')
      let transitioned: MissionTask
      try {
        transitioned = transitionTaskInternal(task as MissionTask, next)
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error), 'D_AI_INVALID_TRANSITION')
      }
      return this.appendTaskLedger(agent, 'TRANSITION', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        tasks: current.tasks.map(item => item.id === taskId ? transitioned : item),
      })
    })
  }

  /**
   * Apply an executor-owned task transition only while the exact claimed lease
   * generation is still active. This is the task-state half of lease fencing.
   */
  private async transitionLeasedTask(
    agent: Agent,
    taskId: string,
    leaseId: string,
    fence: number,
    next: TaskState,
  ): Promise<DurableTaskLedger> {
    return this.transact(agent, async () => {
      const executions = this.executionLedger(agent)
      const located = locateActiveLeaseFence(
        executions.leases,
        { taskId, leaseId, fence },
        agent.id,
        Date.now(),
      )
      if (located === undefined) {
        fail('task transition requires the current active lease fence', 'D_AI_POLICY_DENIED')
      }

      const current = this.taskLedger(agent)
      const task = current.tasks.find(item => item.id === taskId)
      if (task === undefined) fail('unknown durable task', 'D_AI_INVALID_INPUT')

      let transitioned: MissionTask
      try {
        transitioned = transitionTaskInternal(task as MissionTask, next)
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error), 'D_AI_INVALID_TRANSITION')
      }

      return this.appendTaskLedger(agent, 'TRANSITION', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        tasks: current.tasks.map(item => item.id === taskId ? transitioned : item),
      })
    })
  }

  /**
   * Append a capability grant/deny only after native human approval and pair it
   * with an immutable audit record in the same control-plane fact.
   */
  async grantCapability(
    agent: Agent,
    input: Omit<CapabilityGrant, 'id' | 'issuedBy' | 'issuedAt'>,
    signal?: AbortSignal,
  ): Promise<ControlPlane> {
    this.authorize(agent)
    const outcome = await this.ctx.approval.request({
      agent,
      toolName: 'd_ai_control_grant',
      reason: 'Change D_AI capability policy for ' + input.systemId + ':' + input.capability + ' to ' + input.decision,
      ...(signal === undefined ? {} : { signal }),
    })
    if (outcome !== 'allowed-once') fail('human approval is required for capability policy changes')

    return this.transact(agent, async () => {
      const current = this.controlPlane(agent)
      const now = new Date().toISOString()
      const grant = validateGrantInternal({
        ...input,
        id: randomUUID(),
        issuedBy: agent.id,
        issuedAt: now,
      })
      const chain = {
        records: current.auditRecords,
        headHash: current.auditHeadHash,
      }
      const nextAudit = appendAuditRecordInternal(chain, {
        id: randomUUID(),
        at: now,
        actorId: agent.id,
        action: grant.decision === 'ALLOW' ? 'CAPABILITY_GRANT' : 'CAPABILITY_DENY',
        systemId: grant.systemId,
        subjectId: grant.id,
        details: {
          capability: grant.capability,
          scope: grant.scope,
          decision: grant.decision,
          reason: grant.reason,
        },
      })
      return this.appendControlPlane(agent, 'APPEND_GRANT', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        grants: [...current.grants, grant],
        auditRecords: [...nextAudit.records],
        auditHeadHash: nextAudit.headHash,
      })
    })
  }

  /**
   * Authorize and durably audit one cross-system handoff using persisted grants.
   * This records authorization only; the target-system action remains a
   * separate validated tool/task execution.
   */
  async authorizeDurableCrossSystemHandoff(
    agent: Agent,
    input: {
      fromSystem: CapabilityGrant['systemId']
      toSystem: CapabilityGrant['systemId']
      capability: string
      missionId: string
      projectId?: string
      taskId?: string
      reason: string
    },
  ): Promise<ControlPlane> {
    if (input.capability.trim().length === 0 || input.missionId.trim().length === 0 || input.reason.trim().length === 0) {
      fail('cross-system capability, mission and reason are required', 'D_AI_INVALID_INPUT')
    }
    return this.transact(agent, async () => {
      const current = this.controlPlane(agent)
      const now = new Date().toISOString()
      let handoff
      try {
        handoff = authorizeCrossSystemHandoffInternal(
          current.grants as readonly CapabilityGrant[],
          { records: current.auditRecords, headHash: current.auditHeadHash },
          {
            id: randomUUID(),
            actorId: agent.id,
            fromSystem: input.fromSystem,
            toSystem: input.toSystem,
            capability: input.capability,
            missionId: input.missionId,
            ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
            ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
            at: now,
            reason: input.reason,
          },
        )
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error), 'D_AI_POLICY_DENIED')
      }

      return this.appendControlPlane(agent, 'APPEND_AUDIT', {
        ownerAgentId: agent.id,
        revision: current.revision + 1,
        grants: [...current.grants],
        auditRecords: [...handoff.audit.records],
        auditHeadHash: handoff.audit.headHash,
      })
    })
  }

  /**
   * Create a user-requested mission on its owner root Session.
   * @param agent - exact owner root Agent.
   * @param objective - approved investigative question.
   * @returns revision-one mission after native session flush.
   */
  async create(agent: Agent, objective: string, signal?: AbortSignal): Promise<Mission> {
    this.authorize(agent)
    const boundary = this.requireOpenTurn(agent)
    const explicit = agent.session.snapshotEvents().slice(boundary + 1).some(event =>
      event.type === 'user/message' && event.data.source.kind === 'user'
      && event.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim() === objective.trim())
    if (!explicit) {
      const outcome = await this.ctx.approval.request({ agent, toolName: 'd_ai_mission_create', reason: `Activate independent mission: ${objective}`, ...(signal === undefined ? {} : { signal }) })
      if (outcome !== 'allowed-once') fail('owner approval is required for this independent mission')
    }
    if (objective.trim().length === 0) fail('objective must contain text', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => {
      const mission = await this.append(agent, 'CREATE', {
        id: randomUUID(), system: 'investigation', objective, ownerAgentId: agent.id, status: 'ACTIVE', revision: 1,
        createdAt: new Date().toISOString(), sources: [], claims: [], delegations: [],
      })
      // Index is recoverable discoverability, never mission truth.
      const index = await this.index
      await index.table('missions').put(mission.id, { id: mission.id, rootSessionId: agent.id })
      return mission
    })
  }

  /** Create a user-requested Scientific Research project. */
  async createScientific(agent: Agent, question: string, signal?: AbortSignal): Promise<ScientificProject> {
    this.authorize(agent)
    const boundary = this.requireOpenTurn(agent)
    const explicit = agent.session.snapshotEvents().slice(boundary + 1).some(event =>
      event.type === 'user/message' && event.data.source.kind === 'user'
      && event.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim() === question.trim())
    if (!explicit) {
      const outcome = await this.ctx.approval.request({
        agent,
        toolName: 'd_ai_scientific_create',
        reason: 'Activate independent Scientific Research project: ' + question,
        ...(signal === undefined ? {} : { signal }),
      })
      if (outcome !== 'allowed-once') fail('owner approval is required for this independent scientific project')
    }
    if (question.trim().length === 0) fail('scientific question must contain text', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => this.appendScientific(agent, 'CREATE', {
      id: randomUUID(),
      system: 'scientific-research',
      question,
      ownerAgentId: agent.id,
      status: 'ACTIVE',
      revision: 1,
      createdAt: new Date().toISOString(),
      hypotheses: [],
      experiments: [],
      delegations: [],
    }))
  }

  /** Append a researcher hypothesis without promoting it to a finding. */
  async addScientificHypothesis(
    agent: Agent,
    id: string,
    input: { statement: string; rationale: string },
  ): Promise<ScientificProject> {
    if (input.statement.trim().length === 0 || input.rationale.trim().length === 0) fail('hypothesis statement and rationale are required', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => {
      const project = this.scientificProject(agent, id)
      const hypothesis: ScientificHypothesis = {
        id: randomUUID(),
        statement: input.statement,
        rationale: input.rationale,
        state: 'OPEN',
        actorId: agent.id,
        createdAt: new Date().toISOString(),
      }
      return this.appendScientific(agent, 'ADD_HYPOTHESIS', {
        ...project,
        revision: project.revision + 1,
        hypotheses: [...project.hypotheses, hypothesis],
      })
    })
  }

  /** Convert a knowledge gap into an explicit real-world experiment request. */
  async requestScientificExperiment(
    agent: Agent,
    id: string,
    input: { title: string; objective: string; protocol: string; expectedEvidence: string; budgetUsd?: number },
  ): Promise<ScientificProject> {
    if ([input.title, input.objective, input.protocol, input.expectedEvidence].some(value => value.trim().length === 0)) {
      fail('experiment title, objective, protocol and expected evidence are required', 'D_AI_INVALID_INPUT')
    }
    if (input.budgetUsd !== undefined && (!Number.isFinite(input.budgetUsd) || input.budgetUsd < 0)) {
      fail('experiment budget must be a non-negative finite number', 'D_AI_INVALID_INPUT')
    }
    return this.transact(agent, async () => {
      const project = this.scientificProject(agent, id)
      const experiment: ScientificExperiment = {
        id: randomUUID(),
        title: input.title,
        objective: input.objective,
        protocol: input.protocol,
        expectedEvidence: input.expectedEvidence,
        ...(input.budgetUsd === undefined ? {} : { budgetUsd: input.budgetUsd }),
        status: 'WAITING_FOR_HUMAN',
        actorId: agent.id,
        createdAt: new Date().toISOString(),
      }
      return this.appendScientific(agent, 'REQUEST_EXPERIMENT', {
        ...project,
        status: 'WAITING_FOR_HUMAN',
        revision: project.revision + 1,
        experiments: [...project.experiments, experiment],
      })
    })
  }

  /** Record human/lab observation against the exact requested experiment. */
  async recordScientificResult(
    agent: Agent,
    id: string,
    experimentId: string,
    observation: string,
    artifactRef?: string,
  ): Promise<ScientificProject> {
    if (observation.trim().length === 0) fail('scientific observation is required', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => {
      const project = this.scientificProject(agent, id)
      const experiment = project.experiments.find(item => item.id === experimentId)
      if (experiment === undefined) fail('unknown scientific experiment', 'D_AI_INVALID_INPUT')
      if (experiment.status === 'RESULT_RECORDED') fail('scientific experiment result is already recorded', 'D_AI_INVALID_INPUT')
      const updated: ScientificExperiment = {
        ...experiment,
        status: 'RESULT_RECORDED',
        observation,
        ...(artifactRef === undefined ? {} : { artifactRef }),
        completedAt: new Date().toISOString(),
      }
      return this.appendScientific(agent, 'RECORD_RESULT', {
        ...project,
        status: 'ACTIVE',
        revision: project.revision + 1,
        experiments: project.experiments.map(item => item.id === experimentId ? updated : item),
      })
    })
  }

  /** Run independent literature and methodology workers for the Scientific Research project. */
  async delegateScientific(agent: Agent, id: string, signal: AbortSignal): Promise<ScientificProject> {
    const project = this.scientificProject(agent, id)
    const key = agent.id + ':scientific'
    if (this.delegating.has(key)) fail('a scientific delegation is already running for this owner', 'D_AI_BUSY')
    this.delegating.add(key)
    try {
      const literatureRoute = this.optionalRoutedModel(agent, 'scientific-research', 'literature')
      const methodologyRoute = this.optionalRoutedModel(agent, 'scientific-research', 'methodology')
      const result = await runScientificDelegates(this.ctx, agent, project.question, signal, {
        ...this.scientificDelegation,
        ...(literatureRoute === undefined ? {} : { literatureModel: literatureRoute.id, literatureProvider: literatureRoute.provider }),
        ...(methodologyRoute === undefined ? {} : { methodologyModel: methodologyRoute.id, methodologyProvider: methodologyRoute.provider }),
      })
      signal.throwIfAborted()
      return await this.transact(agent, async () => {
        const current = this.scientificProject(agent, id)
        return this.appendScientific(agent, 'DELEGATE', {
          ...current,
          revision: current.revision + 1,
          delegations: [...current.delegations, result],
        })
      })
    } finally {
      this.delegating.delete(key)
    }
  }

  /** Create a user-requested Investor analysis case. */
  async createInvestor(agent: Agent, objective: string, signal?: AbortSignal): Promise<InvestorCase> {
    this.authorize(agent)
    const boundary = this.requireOpenTurn(agent)
    const explicit = agent.session.snapshotEvents().slice(boundary + 1).some(event =>
      event.type === 'user/message' && event.data.source.kind === 'user'
      && event.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim() === objective.trim())
    if (!explicit) {
      const outcome = await this.ctx.approval.request({
        agent,
        toolName: 'd_ai_investor_create',
        reason: 'Activate independent Investor case: ' + objective,
        ...(signal === undefined ? {} : { signal }),
      })
      if (outcome !== 'allowed-once') fail('owner approval is required for this independent investor case')
    }
    if (objective.trim().length === 0) fail('investment objective must contain text', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => this.appendInvestor(agent, 'CREATE', {
      id: randomUUID(),
      system: 'investor',
      objective,
      ownerAgentId: agent.id,
      status: 'ACTIVE',
      revision: 1,
      createdAt: new Date().toISOString(),
      sources: [],
      theses: [],
      delegations: [],
    }))
  }

  /** Capture an authorized investment source with immutable provenance. */
  async captureInvestorSource(
    agent: Agent,
    id: string,
    url: string,
    category: InvestorSource['category'],
    signal: AbortSignal,
  ): Promise<InvestorCase> {
    this.investorCase(agent, id)
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('investor source URL must be credential-free HTTP(S)', 'D_AI_INVALID_INPUT')
    const result = await this.ctx.web.fetch({ url }, signal)
    signal.throwIfAborted()
    if (result.statusCode < 200 || result.statusCode >= 300) fail('investor source retrieval failed with HTTP ' + result.statusCode, 'D_AI_RETRIEVAL_FAILED')
    if (Buffer.byteLength(result.body.content, 'utf8') > this.limits.maxSourceBytes) fail('investor source exceeds captured-content budget', 'D_AI_BUDGET_EXCEEDED')

    return this.transact(agent, async () => {
      const value = this.investorCase(agent, id)
      if (value.sources.length >= this.limits.maxSources) fail('investor source-count budget exceeded', 'D_AI_BUDGET_EXCEEDED')
      const source: InvestorSource = {
        id: randomUUID(),
        category,
        requestedUrl: url,
        finalUrl: result.url,
        capturedAt: new Date().toISOString(),
        statusCode: result.statusCode,
        content: result.body.content,
        sha256: createHash('sha256').update(result.body.content, 'utf8').digest('hex'),
        actorId: agent.id,
      }
      return this.appendInvestor(agent, 'CAPTURE_SOURCE', {
        ...value,
        revision: value.revision + 1,
        sources: [...value.sources, source],
      })
    })
  }

  /** Append an explicit investment thesis with its own invalidation conditions. */
  async addInvestmentThesis(
    agent: Agent,
    id: string,
    input: { statement: string; horizon: InvestmentThesis['horizon']; rationale: string; invalidationConditions: string },
  ): Promise<InvestorCase> {
    if ([input.statement, input.rationale, input.invalidationConditions].some(value => value.trim().length === 0)) {
      fail('investment thesis, rationale and invalidation conditions are required', 'D_AI_INVALID_INPUT')
    }
    return this.transact(agent, async () => {
      const value = this.investorCase(agent, id)
      const thesis: InvestmentThesis = {
        id: randomUUID(),
        statement: input.statement,
        horizon: input.horizon,
        rationale: input.rationale,
        invalidationConditions: input.invalidationConditions,
        state: 'OPEN',
        actorId: agent.id,
        createdAt: new Date().toISOString(),
      }
      return this.appendInvestor(agent, 'ADD_THESIS', {
        ...value,
        revision: value.revision + 1,
        theses: [...value.theses, thesis],
      })
    })
  }

  /** Run independent fundamental and adversarial-risk Investor workers. */
  async delegateInvestor(agent: Agent, id: string, signal: AbortSignal): Promise<InvestorCase> {
    const value = this.investorCase(agent, id)
    const key = agent.id + ':investor'
    if (this.delegating.has(key)) fail('an investor delegation is already running for this owner', 'D_AI_BUSY')
    this.delegating.add(key)
    try {
      const fundamentalRoute = this.optionalRoutedModel(agent, 'investor', 'fundamental')
      const riskRoute = this.optionalRoutedModel(agent, 'investor', 'risk')
      const result = await runInvestorDelegates(this.ctx, agent, value.objective, signal, {
        ...this.investorDelegation,
        ...(fundamentalRoute === undefined ? {} : { fundamentalModel: fundamentalRoute.id, fundamentalProvider: fundamentalRoute.provider }),
        ...(riskRoute === undefined ? {} : { riskModel: riskRoute.id, riskProvider: riskRoute.provider }),
      })
      signal.throwIfAborted()
      return await this.transact(agent, async () => {
        const current = this.investorCase(agent, id)
        return this.appendInvestor(agent, 'DELEGATE', {
          ...current,
          revision: current.revision + 1,
          delegations: [...current.delegations, result],
        })
      })
    } finally {
      this.delegating.delete(key)
    }
  }

  /** Create an authorized defensive Cybersecurity engagement. */
  async createCybersecurity(
    agent: Agent,
    objective: string,
    authorization: CyberAuthorizationScope,
    signal?: AbortSignal,
  ): Promise<CyberEngagement> {
    this.authorize(agent)
    const boundary = this.requireOpenTurn(agent)
    const explicit = agent.session.snapshotEvents().slice(boundary + 1).some(event =>
      event.type === 'user/message' && event.data.source.kind === 'user'
      && event.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n').includes(objective.trim()))
    if (!explicit) {
      const outcome = await this.ctx.approval.request({
        agent,
        toolName: 'd_ai_cyber_create',
        reason: 'Activate Cybersecurity engagement: ' + objective,
        ...(signal === undefined ? {} : { signal }),
      })
      if (outcome !== 'allowed-once') fail('owner approval is required for this cybersecurity engagement')
    }
    if (objective.trim().length === 0 || authorization.targetDescription.trim().length === 0 || authorization.permittedActions.length === 0) {
      fail('cybersecurity objective and explicit authorization scope are required', 'D_AI_INVALID_INPUT')
    }
    const issued = Date.parse(authorization.issuedAt)
    const expires = authorization.expiresAt === undefined ? undefined : Date.parse(authorization.expiresAt)
    if (!Number.isFinite(issued) || (expires !== undefined && (!Number.isFinite(expires) || expires <= issued))) {
      fail('invalid cybersecurity authorization dates', 'D_AI_INVALID_INPUT')
    }

    return this.transact(agent, async () => this.appendCyber(agent, 'CREATE', {
      id: randomUUID(),
      system: 'cybersecurity',
      objective,
      ownerAgentId: agent.id,
      authorization,
      status: 'ACTIVE',
      revision: 1,
      createdAt: new Date().toISOString(),
      findings: [],
      delegations: [],
    }))
  }

  /** Append a defensive finding with evidence and remediation. */
  async addCyberFinding(
    agent: Agent,
    id: string,
    input: { title: string; severity: CyberFinding['severity']; evidence: string; remediation: string },
  ): Promise<CyberEngagement> {
    if ([input.title, input.evidence, input.remediation].some(value => value.trim().length === 0)) {
      fail('cyber finding title, evidence and remediation are required', 'D_AI_INVALID_INPUT')
    }
    return this.transact(agent, async () => {
      const engagement = this.cyberEngagement(agent, id)
      const finding: CyberFinding = {
        id: randomUUID(),
        title: input.title,
        severity: input.severity,
        evidence: input.evidence,
        remediation: input.remediation,
        status: 'OPEN',
        actorId: agent.id,
        createdAt: new Date().toISOString(),
      }
      return this.appendCyber(agent, 'ADD_FINDING', {
        ...engagement,
        status: 'WAITING_FOR_REMEDIATION',
        revision: engagement.revision + 1,
        findings: [...engagement.findings, finding],
      })
    })
  }

  /** Record remediation applied by the engineer or authorized operator. */
  async recordCyberRemediation(agent: Agent, id: string, findingId: string, remediationNote: string): Promise<CyberEngagement> {
    if (remediationNote.trim().length === 0) fail('remediation note is required', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => {
      const engagement = this.cyberEngagement(agent, id)
      const finding = engagement.findings.find(item => item.id === findingId)
      if (finding === undefined) fail('unknown cyber finding', 'D_AI_INVALID_INPUT')
      if (finding.status === 'RETEST_PASSED') fail('passed finding cannot be rewritten', 'D_AI_INVALID_INPUT')
      const updated: CyberFinding = {
        ...finding,
        status: 'REMEDIATED',
        remediationNote,
        updatedAt: new Date().toISOString(),
      }
      return this.appendCyber(agent, 'RECORD_REMEDIATION', {
        ...engagement,
        status: 'ACTIVE',
        revision: engagement.revision + 1,
        findings: engagement.findings.map(item => item.id === findingId ? updated : item),
      })
    })
  }

  /** Record a safe authorized retest result after remediation. */
  async recordCyberRetest(agent: Agent, id: string, findingId: string, retestEvidence: string): Promise<CyberEngagement> {
    if (retestEvidence.trim().length === 0) fail('retest evidence is required', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => {
      const engagement = this.cyberEngagement(agent, id)
      const finding = engagement.findings.find(item => item.id === findingId)
      if (finding === undefined) fail('unknown cyber finding', 'D_AI_INVALID_INPUT')
      if (finding.status !== 'REMEDIATED') fail('cyber retest requires a remediated finding', 'D_AI_INVALID_INPUT')
      const updated: CyberFinding = {
        ...finding,
        status: 'RETEST_PASSED',
        retestEvidence,
        updatedAt: new Date().toISOString(),
      }
      return this.appendCyber(agent, 'RETEST', {
        ...engagement,
        status: 'ACTIVE',
        revision: engagement.revision + 1,
        findings: engagement.findings.map(item => item.id === findingId ? updated : item),
      })
    })
  }

  /** Run independent authorized assessment and remediation-review workers. */
  async delegateCybersecurity(agent: Agent, id: string, signal: AbortSignal): Promise<CyberEngagement> {
    const engagement = this.cyberEngagement(agent, id)
    const key = agent.id + ':cybersecurity'
    if (this.delegating.has(key)) fail('a cybersecurity delegation is already running for this owner', 'D_AI_BUSY')
    this.delegating.add(key)
    try {
      const assessmentRoute = this.optionalRoutedModel(agent, 'cybersecurity', 'assessment')
      const remediationRoute = this.optionalRoutedModel(agent, 'cybersecurity', 'remediation-review')
      const result = await runCyberDelegates(
        this.ctx,
        agent,
        engagement.objective,
        JSON.stringify(engagement.authorization),
        signal,
        {
          ...this.cyberDelegation,
          ...(assessmentRoute === undefined ? {} : { assessmentModel: assessmentRoute.id, assessmentProvider: assessmentRoute.provider }),
          ...(remediationRoute === undefined ? {} : { remediationModel: remediationRoute.id, remediationProvider: remediationRoute.provider }),
        },
      )
      signal.throwIfAborted()
      return await this.transact(agent, async () => {
        const current = this.cyberEngagement(agent, id)
        return this.appendCyber(agent, 'DELEGATE', {
          ...current,
          revision: current.revision + 1,
          delegations: [...current.delegations, result],
        })
      })
    } finally {
      this.delegating.delete(key)
    }
  }

  /** Create a user-approved Operations & Intelligence analysis case. */
  async createOperations(
    agent: Agent,
    objective: string,
    classification: OperationsCase['classification'],
    signal?: AbortSignal,
  ): Promise<OperationsCase> {
    this.authorize(agent)
    const boundary = this.requireOpenTurn(agent)
    const explicit = agent.session.snapshotEvents().slice(boundary + 1).some(event =>
      event.type === 'user/message' && event.data.source.kind === 'user'
      && event.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n').includes(objective.trim()))
    if (!explicit) {
      const outcome = await this.ctx.approval.request({
        agent,
        toolName: 'd_ai_operations_create',
        reason: 'Activate Operations & Intelligence case: ' + objective,
        ...(signal === undefined ? {} : { signal }),
      })
      if (outcome !== 'allowed-once') fail('owner approval is required for this operations case')
    }
    if (objective.trim().length === 0) fail('operations objective must contain text', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => this.appendOperations(agent, 'CREATE', {
      id: randomUUID(),
      system: 'operations-intelligence',
      objective,
      ownerAgentId: agent.id,
      classification,
      status: 'ACTIVE',
      revision: 1,
      createdAt: new Date().toISOString(),
      entities: [],
      relationships: [],
      timeline: [],
      gaps: [],
      options: [],
      delegations: [],
    }))
  }

  async addOperationsEntity(
    agent: Agent,
    id: string,
    input: { type: OperationsEntity['type']; label: string; summary: string },
  ): Promise<OperationsCase> {
    if (input.label.trim().length === 0) fail('operations entity label is required', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => {
      const value = this.operationsCase(agent, id)
      const entity: OperationsEntity = {
        id: randomUUID(),
        type: input.type,
        label: input.label,
        summary: input.summary,
        actorId: agent.id,
        createdAt: new Date().toISOString(),
      }
      return this.appendOperations(agent, 'ADD_ENTITY', {
        ...value,
        revision: value.revision + 1,
        entities: [...value.entities, entity],
      })
    })
  }

  async addOperationsRelationship(
    agent: Agent,
    id: string,
    input: { fromEntityId: string; toEntityId: string; type: string; confidence: number; evidenceRefs?: readonly string[] },
  ): Promise<OperationsCase> {
    if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) fail('relationship confidence must be between 0 and 1', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => {
      const value = this.operationsCase(agent, id)
      if (!value.entities.some(item => item.id === input.fromEntityId) || !value.entities.some(item => item.id === input.toEntityId)) {
        fail('operations relationship requires existing entities', 'D_AI_INVALID_INPUT')
      }
      const relationship: OperationsRelationship = {
        id: randomUUID(),
        fromEntityId: input.fromEntityId,
        toEntityId: input.toEntityId,
        type: input.type,
        confidence: input.confidence,
        evidenceRefs: [...(input.evidenceRefs ?? [])],
        actorId: agent.id,
        createdAt: new Date().toISOString(),
      }
      return this.appendOperations(agent, 'ADD_RELATIONSHIP', {
        ...value,
        revision: value.revision + 1,
        relationships: [...value.relationships, relationship],
      })
    })
  }

  async addOperationsTimelineEvent(
    agent: Agent,
    id: string,
    input: { occurredAt: string; label: string; details: string; evidenceRefs?: readonly string[] },
  ): Promise<OperationsCase> {
    if (!Number.isFinite(Date.parse(input.occurredAt)) || input.label.trim().length === 0) fail('valid timeline time and label are required', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => {
      const value = this.operationsCase(agent, id)
      const event: OperationsTimelineEvent = {
        id: randomUUID(),
        occurredAt: input.occurredAt,
        label: input.label,
        details: input.details,
        evidenceRefs: [...(input.evidenceRefs ?? [])],
        actorId: agent.id,
        createdAt: new Date().toISOString(),
      }
      return this.appendOperations(agent, 'ADD_TIMELINE', {
        ...value,
        revision: value.revision + 1,
        timeline: [...value.timeline, event],
      })
    })
  }

  async addIntelligenceGap(
    agent: Agent,
    id: string,
    input: { question: string; priority: IntelligenceGap['priority'] },
  ): Promise<OperationsCase> {
    if (input.question.trim().length === 0) fail('intelligence gap question is required', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => {
      const value = this.operationsCase(agent, id)
      const gap: IntelligenceGap = {
        id: randomUUID(),
        question: input.question,
        priority: input.priority,
        state: 'OPEN',
        actorId: agent.id,
        createdAt: new Date().toISOString(),
      }
      return this.appendOperations(agent, 'ADD_GAP', {
        ...value,
        status: 'WAITING_FOR_DATA',
        revision: value.revision + 1,
        gaps: [...value.gaps, gap],
      })
    })
  }

  async addOperationalOption(
    agent: Agent,
    id: string,
    input: { title: string; description: string; expectedBenefit: string; risks: string },
  ): Promise<OperationsCase> {
    if ([input.title, input.description, input.expectedBenefit, input.risks].some(value => value.trim().length === 0)) {
      fail('operational option fields are required', 'D_AI_INVALID_INPUT')
    }
    return this.transact(agent, async () => {
      const value = this.operationsCase(agent, id)
      const option: OperationalOption = {
        id: randomUUID(),
        title: input.title,
        description: input.description,
        expectedBenefit: input.expectedBenefit,
        risks: input.risks,
        requiresHumanApproval: true,
        state: 'PROPOSED',
        actorId: agent.id,
        createdAt: new Date().toISOString(),
      }
      return this.appendOperations(agent, 'ADD_OPTION', {
        ...value,
        revision: value.revision + 1,
        options: [...value.options, option],
      })
    })
  }

  async delegateOperations(agent: Agent, id: string, signal: AbortSignal): Promise<OperationsCase> {
    const value = this.operationsCase(agent, id)
    const key = agent.id + ':operations'
    if (this.delegating.has(key)) fail('an operations delegation is already running for this owner', 'D_AI_BUSY')
    this.delegating.add(key)
    try {
      const fusionRoute = this.optionalRoutedModel(agent, 'operations-intelligence', 'fusion')
      const adversarialRoute = this.optionalRoutedModel(agent, 'operations-intelligence', 'adversarial')
      const result = await runOperationsDelegates(this.ctx, agent, value.objective, signal, {
        ...this.operationsDelegation,
        ...(fusionRoute === undefined ? {} : { fusionModel: fusionRoute.id, fusionProvider: fusionRoute.provider }),
        ...(adversarialRoute === undefined ? {} : { adversarialModel: adversarialRoute.id, adversarialProvider: adversarialRoute.provider }),
      })
      signal.throwIfAborted()
      return await this.transact(agent, async () => {
        const current = this.operationsCase(agent, id)
        return this.appendOperations(agent, 'DELEGATE', {
          ...current,
          revision: current.revision + 1,
          delegations: [...current.delegations, result],
        })
      })
    } finally {
      this.delegating.delete(key)
    }
  }

  /** Create a user-requested Innovation & Discovery project. */
  async createInnovation(agent: Agent, problem: string, signal?: AbortSignal): Promise<InnovationProject> {
    this.authorize(agent)
    const boundary = this.requireOpenTurn(agent)
    const explicit = agent.session.snapshotEvents().slice(boundary + 1).some(event =>
      event.type === 'user/message' && event.data.source.kind === 'user'
      && event.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n').includes(problem.trim()))
    if (!explicit) {
      const outcome = await this.ctx.approval.request({
        agent,
        toolName: 'd_ai_innovation_create',
        reason: 'Activate Innovation & Discovery project: ' + problem,
        ...(signal === undefined ? {} : { signal }),
      })
      if (outcome !== 'allowed-once') fail('owner approval is required for this innovation project')
    }
    if (problem.trim().length === 0) fail('innovation problem must contain text', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => this.appendInnovation(agent, 'CREATE', {
      id: randomUUID(),
      system: 'innovation-discovery',
      problem,
      ownerAgentId: agent.id,
      status: 'ACTIVE',
      revision: 1,
      createdAt: new Date().toISOString(),
      candidates: [],
      experiments: [],
      delegations: [],
    }))
  }

  /** Append a testable candidate; generated ideas are never auto-promoted to discoveries. */
  async addInnovationCandidate(
    agent: Agent,
    id: string,
    input: { title: string; description: string; mechanism: string; falsificationTest: string; noveltyStatus?: InnovationCandidate['noveltyStatus'] },
  ): Promise<InnovationProject> {
    if ([input.title, input.description, input.mechanism, input.falsificationTest].some(value => value.trim().length === 0)) {
      fail('innovation candidate title, description, mechanism and falsification test are required', 'D_AI_INVALID_INPUT')
    }
    return this.transact(agent, async () => {
      const project = this.innovationProject(agent, id)
      const candidate: InnovationCandidate = {
        id: randomUUID(),
        title: input.title,
        description: input.description,
        mechanism: input.mechanism,
        falsificationTest: input.falsificationTest,
        noveltyStatus: input.noveltyStatus ?? 'UNKNOWN',
        state: 'OPEN',
        actorId: agent.id,
        createdAt: new Date().toISOString(),
      }
      return this.appendInnovation(agent, 'ADD_CANDIDATE', {
        ...project,
        revision: project.revision + 1,
        candidates: [...project.candidates, candidate],
      })
    })
  }

  /** Convert an innovation gap into an explicit experiment request. */
  async requestInnovationExperiment(
    agent: Agent,
    id: string,
    input: { title: string; objective: string; protocol: string; successCriteria: string; failureCriteria: string },
  ): Promise<InnovationProject> {
    if ([input.title, input.objective, input.protocol, input.successCriteria, input.failureCriteria].some(value => value.trim().length === 0)) {
      fail('innovation experiment fields are required', 'D_AI_INVALID_INPUT')
    }
    return this.transact(agent, async () => {
      const project = this.innovationProject(agent, id)
      const experiment: InnovationExperiment = {
        id: randomUUID(),
        title: input.title,
        objective: input.objective,
        protocol: input.protocol,
        successCriteria: input.successCriteria,
        failureCriteria: input.failureCriteria,
        status: 'WAITING_FOR_HUMAN',
        actorId: agent.id,
        createdAt: new Date().toISOString(),
      }
      return this.appendInnovation(agent, 'REQUEST_EXPERIMENT', {
        ...project,
        status: 'NEEDS_EXPERIMENT',
        revision: project.revision + 1,
        experiments: [...project.experiments, experiment],
      })
    })
  }

  /** Record a real experiment observation without interpreting it as automatic verification. */
  async recordInnovationResult(
    agent: Agent,
    id: string,
    experimentId: string,
    observation: string,
    artifactRef?: string,
  ): Promise<InnovationProject> {
    if (observation.trim().length === 0) fail('innovation experiment observation is required', 'D_AI_INVALID_INPUT')
    return this.transact(agent, async () => {
      const project = this.innovationProject(agent, id)
      const experiment = project.experiments.find(item => item.id === experimentId)
      if (experiment === undefined) fail('unknown innovation experiment', 'D_AI_INVALID_INPUT')
      if (experiment.status === 'RESULT_RECORDED') fail('innovation experiment result is already recorded', 'D_AI_INVALID_INPUT')
      const updated: InnovationExperiment = {
        ...experiment,
        status: 'RESULT_RECORDED',
        observation,
        ...(artifactRef === undefined ? {} : { artifactRef }),
        completedAt: new Date().toISOString(),
      }
      return this.appendInnovation(agent, 'RECORD_RESULT', {
        ...project,
        status: 'ACTIVE',
        revision: project.revision + 1,
        experiments: project.experiments.map(item => item.id === experimentId ? updated : item),
      })
    })
  }

  /** Run independent explorer and critic workers over the approved hard problem. */
  async delegateInnovation(agent: Agent, id: string, signal: AbortSignal): Promise<InnovationProject> {
    const project = this.innovationProject(agent, id)
    const key = agent.id + ':innovation'
    if (this.delegating.has(key)) fail('an innovation delegation is already running for this owner', 'D_AI_BUSY')
    this.delegating.add(key)
    try {
      const explorerRoute = this.optionalRoutedModel(agent, 'innovation-discovery', 'explorer')
      const criticRoute = this.optionalRoutedModel(agent, 'innovation-discovery', 'critic')
      const result = await runInnovationDelegates(this.ctx, agent, project.problem, signal, {
        ...this.innovationDelegation,
        ...(explorerRoute === undefined ? {} : { explorerModel: explorerRoute.id, explorerProvider: explorerRoute.provider }),
        ...(criticRoute === undefined ? {} : { criticModel: criticRoute.id, criticProvider: criticRoute.provider }),
      })
      signal.throwIfAborted()
      return await this.transact(agent, async () => {
        const current = this.innovationProject(agent, id)
        return this.appendInnovation(agent, 'DELEGATE', {
          ...current,
          revision: current.revision + 1,
          delegations: [...current.delegations, result],
        })
      })
    } finally {
      this.delegating.delete(key)
    }
  }

  /**
   * Fetch and retain an immutable, bounded decoded source through the native web provider.
   * @param agent - exact mission owner root Agent.
   * @param id - owned mission identity.
   * @param url - HTTP(S) resource to capture.
   * @param signal - tool cancellation forwarded to safe retrieval.
   * @returns committed next mission revision.
   */
  async capture(agent: Agent, id: string, url: string, signal: AbortSignal): Promise<Mission> {
    this.mission(agent, id)
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('source URL must be credential-free HTTP(S)', 'D_AI_INVALID_INPUT')
    const result = await this.ctx.web.fetch({ url }, signal)
    signal.throwIfAborted()
    if (result.statusCode < 200 || result.statusCode >= 300) fail(`source retrieval HTTP ${result.statusCode}`, 'D_AI_RETRIEVAL_FAILED')
    if (Buffer.byteLength(result.body.content, 'utf8') > this.limits.maxSourceBytes) fail('source exceeds captured-content budget', 'D_AI_BUDGET_EXCEEDED')
    return this.transact(agent, async () => {
      signal.throwIfAborted()
      const mission = this.mission(agent, id)
      if (mission.sources.length >= this.limits.maxSources) fail('source-count budget exceeded', 'D_AI_BUDGET_EXCEEDED')
      const source = {
        id: randomUUID(), requestedUrl: url, finalUrl: result.url, capturedAt: new Date().toISOString(), statusCode: result.statusCode,
        kind: result.body.kind, content: result.body.content, sha256: createHash('sha256').update(result.body.content, 'utf8').digest('hex'),
        hashEncoding: 'utf8-decoded-content' as const, truncated: result.truncated, actorId: agent.id,
        originSystem: 'investigation' as const, originTool: 'd_ai_capture_source' as const,
      }
      return this.append(agent, 'CAPTURE_SOURCE', { ...mission, revision: mission.revision + 1, sources: [...mission.sources, source] })
    })
  }

  /**
   * Append an anchored observation or counterclaim; model-generated claims cannot certify themselves.
   * @param agent - exact mission owner root Agent.
   * @param id - owned mission identity.
   * @param input - claim text, captured source, exact excerpt, optional contradicted claim.
   * @returns committed next mission revision retaining every earlier claim.
   */
  async addClaim(agent: Agent, id: string, input: { text: string; sourceId: string; excerpt: string; contradicts?: string }): Promise<Mission> {
    return this.transact(agent, async () => {
      const mission = this.mission(agent, id)
      const source = mission.sources.find(s => s.id === input.sourceId)
      if (source === undefined || input.excerpt.trim().length === 0 || !source.content.includes(input.excerpt)) fail('claim requires an exact captured-source excerpt', 'D_AI_INVALID_ANCHOR')
      if (input.contradicts !== undefined && !mission.claims.some(c => c.id === input.contradicts)) fail('counterclaim references an unknown claim', 'D_AI_INVALID_ANCHOR')
      const claim: EvidenceClaim = { id: randomUUID(), ...input, state: input.contradicts === undefined ? 'OBSERVED' : 'CONTESTED', actorId: agent.id }
      return this.append(agent, 'ADD_CLAIM', { ...mission, revision: mission.revision + 1, claims: [...mission.claims, claim] })
    })
  }

  /**
   * Execute fresh research and independent verification using real native child Agents.
   * @param agent - exact mission owner root Agent.
   * @param id - owned mission identity.
   * @param signal - cancellation for both child turns.
   * @returns committed result handoff; text remains unverified model output.
   */
  async delegate(agent: Agent, id: string, signal: AbortSignal): Promise<Mission> {
    const mission = this.mission(agent, id)
    if (this.delegating.has(agent.id)) fail('a delegated mission is already running for this owner', 'D_AI_BUSY')
    this.delegating.add(agent.id)
    try {
      const researchRoute = this.optionalRoutedModel(agent, 'investigation', 'research')
      const verificationRoute = this.optionalRoutedModel(agent, 'investigation', 'verification')
      const result = await runInvestigationDelegates(this.ctx, agent, mission.objective, signal, {
        ...this.delegation,
        ...(researchRoute === undefined ? {} : { researchModel: researchRoute.id, researchProvider: researchRoute.provider }),
        ...(verificationRoute === undefined ? {} : { verificationModel: verificationRoute.id, verificationProvider: verificationRoute.provider }),
      })
      signal.throwIfAborted()
      return await this.transact(agent, async () => {
        const current = this.mission(agent, id)
        return this.append(agent, 'DELEGATE', { ...current, revision: current.revision + 1, delegations: [...current.delegations, result] })
      })
    } finally { this.delegating.delete(agent.id) }
  }

  private registerTools(): void {
    const owner = (agent: Agent | undefined): Agent => {
      if (agent === undefined) fail('D_AI tool requires a calling Agent')
      this.authorize(agent)
      return agent
    }

    registerDaiTools(this.ctx, this, owner, {
      director: this.delegation.timeoutMs,
      investigation: this.delegation.timeoutMs,
      scientific: this.scientificDelegation.timeoutMs,
      investor: this.investorDelegation.timeoutMs,
      cyber: this.cyberDelegation.timeoutMs,
      operations: this.operationsDelegation.timeoutMs,
      innovation: this.innovationDelegation.timeoutMs,
    })
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context { dai: DAI }
}

export default DAI
