import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { BudgetProfile } from './budget-state.ts'
import type { CapabilityGrant } from './capability-grants.ts'
import type { EvidenceEdge, EvidenceNode } from './evidence-graph.ts'
import type { ResourceBudget } from './resource-value.ts'
import { SYSTEMS } from './state.ts'
import { encodeToolResult, jsonToolOutput, rejectInvalidInput } from './tool-support.ts'
import type { ToolOwnerResolver } from './tool-support.ts'

export interface EvidenceControlToolRuntime {
  readEvidenceStore(agent: Agent): unknown
  addSharedEvidenceNode(
    agent: Agent,
    input: Omit<EvidenceNode, 'id' | 'createdAt'>,
  ): Promise<unknown>
  addSharedEvidenceEdge(
    agent: Agent,
    input: Omit<EvidenceEdge, 'id' | 'createdAt' | 'actorId'>,
  ): Promise<unknown>
  readBudgets(agent: Agent): unknown
  setResourceBudget(
    agent: Agent,
    input: { scope: BudgetProfile['scope']; scopeId: string; limits: ResourceBudget },
    signal?: AbortSignal,
  ): Promise<unknown>
  selectRunnableTasks(agent: Agent, maxTasks: number): unknown
  readControlPlane(agent: Agent): unknown
  grantCapability(
    agent: Agent,
    input: Omit<CapabilityGrant, 'id' | 'issuedBy' | 'issuedAt'>,
    signal?: AbortSignal,
  ): Promise<unknown>
  authorizeDurableCrossSystemHandoff(
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
  ): Promise<unknown>
}

export function registerEvidenceControlTools(
  ctx: Context,
  runtime: EvidenceControlToolRuntime,
  owner: ToolOwnerResolver,
): void {
  ctx.tools.register(defineTool({
    name: 'd_ai_evidence_read',
    description: 'Read the durable shared D_AI Evidence/Knowledge Graph with provenance-carrying nodes and append-only relations.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.readEvidenceStore(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_evidence_add_node',
    description: 'Append one node to the shared D_AI evidence graph. Every node requires at least one provenance reference.',
    parameters: {
      kind: { type: 'string', required: true },
      system_id: { type: 'string', required: true },
      label: { type: 'string', required: true },
      provenance: { type: 'string', required: true },
      confidence: { type: 'number' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const kinds = [
        'SOURCE',
        'CLAIM',
        'ENTITY',
        'EVENT',
        'HYPOTHESIS',
        'ARTIFACT',
        'DATASET',
        'EXPERIMENT',
        'DECISION',
      ] as const
      if (!kinds.includes(args.kind as typeof kinds[number])) {
        rejectInvalidInput('invalid evidence node kind')
      }
      if (!SYSTEMS.some(system => system.id === args.system_id)) {
        rejectInvalidInput('unknown evidence system id')
      }
      const provenance = args.provenance
        .split(/[\n,]+/)
        .map(value => value.trim())
        .filter(Boolean)

      return encodeToolResult(runtime.addSharedEvidenceNode(owner(exec.agent), {
        kind: args.kind as EvidenceNode['kind'],
        systemId: args.system_id as EvidenceNode['systemId'],
        label: args.label,
        provenance,
        ...(args.confidence === undefined ? {} : { confidence: args.confidence }),
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_evidence_add_edge',
    description: 'Append one relation between two existing shared evidence nodes.',
    parameters: {
      from: { type: 'string', required: true },
      to: { type: 'string', required: true },
      kind: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const kinds = [
        'SUPPORTS',
        'CONTRADICTS',
        'DERIVED_FROM',
        'MENTIONS',
        'RELATES_TO',
        'PRECEDES',
        'DUPLICATES',
        'SUPERSEDES',
      ] as const
      if (!kinds.includes(args.kind as typeof kinds[number])) {
        rejectInvalidInput('invalid evidence edge kind')
      }
      return encodeToolResult(runtime.addSharedEvidenceEdge(owner(exec.agent), {
        from: args.from,
        to: args.to,
        kind: args.kind as EvidenceEdge['kind'],
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_budget_read',
    description: 'Read durable D_AI resource budgets and measured usage. Budget changes require human approval.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.readBudgets(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_budget_set',
    description: 'Create or update a scoped D_AI resource budget after human approval. At least one limit must be supplied.',
    parameters: {
      scope: { type: 'string', required: true },
      scope_id: { type: 'string', required: true },
      token_limit: { type: 'number' },
      money_limit_usd: { type: 'number' },
      wall_clock_ms: { type: 'number' },
      human_attention_minutes: { type: 'number' },
      data_access_cost_usd: { type: 'number' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const scopes = ['SYSTEM', 'PROJECT', 'MISSION', 'TASK'] as const
      if (!scopes.includes(args.scope as typeof scopes[number])) {
        rejectInvalidInput('invalid resource budget scope')
      }
      const limits: ResourceBudget = {
        ...(args.token_limit === undefined ? {} : { tokenLimit: args.token_limit }),
        ...(args.money_limit_usd === undefined ? {} : { moneyLimitUsd: args.money_limit_usd }),
        ...(args.wall_clock_ms === undefined ? {} : { wallClockMs: args.wall_clock_ms }),
        ...(args.human_attention_minutes === undefined
          ? {}
          : { humanAttentionMinutes: args.human_attention_minutes }),
        ...(args.data_access_cost_usd === undefined
          ? {}
          : { dataAccessCostUsd: args.data_access_cost_usd }),
      }
      return encodeToolResult(runtime.setResourceBudget(owner(exec.agent), {
        scope: args.scope as BudgetProfile['scope'],
        scopeId: args.scope_id,
        limits,
      }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_scheduler_next',
    description: 'Read the next runnable tasks from the durable D_AI DAG without mutating or executing them. Dependencies and blocked states are respected.',
    parameters: { max_tasks: { type: 'number' } },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const maxTasks = args.max_tasks ?? 1
      if (!Number.isSafeInteger(maxTasks) || maxTasks < 1 || maxTasks > 64) {
        rejectInvalidInput('max_tasks must be an integer from 1 to 64')
      }
      return encodeToolResult(runtime.selectRunnableTasks(owner(exec.agent), maxTasks))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_control_read',
    description: 'Read the durable D_AI capability grants and append-only audit chain for the owner.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.readControlPlane(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_control_grant',
    description: 'Request a human-approved D_AI capability ALLOW or DENY grant. Every change is persisted and hash-chain audited.',
    parameters: {
      system_id: { type: 'string', required: true },
      capability: { type: 'string', required: true },
      scope: { type: 'string', required: true },
      scope_id: { type: 'string' },
      decision: { type: 'string', required: true },
      reason: { type: 'string', required: true },
      expires_at: { type: 'string' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const agent = owner(exec.agent)
      const scopes = ['TASK', 'MISSION', 'PROJECT', 'SYSTEM', 'GLOBAL'] as const
      const decisions = ['ALLOW', 'DENY'] as const
      if (!SYSTEMS.some(system => system.id === args.system_id)) {
        rejectInvalidInput('unknown D_AI system id')
      }
      if (!scopes.includes(args.scope as typeof scopes[number])) {
        rejectInvalidInput('invalid capability grant scope')
      }
      if (!decisions.includes(args.decision as typeof decisions[number])) {
        rejectInvalidInput('invalid capability grant decision')
      }
      return encodeToolResult(runtime.grantCapability(agent, {
        actorId: agent.id,
        systemId: args.system_id as CapabilityGrant['systemId'],
        capability: args.capability,
        scope: args.scope as CapabilityGrant['scope'],
        ...(args.scope_id === undefined ? {} : { scopeId: args.scope_id }),
        decision: args.decision as CapabilityGrant['decision'],
        reason: args.reason,
        ...(args.expires_at === undefined ? {} : { expiresAt: args.expires_at }),
      }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_cross_system_handoff',
    description: 'Authorize and durably audit a cross-system handoff using existing persisted capability grants. This tool does not execute the target action itself.',
    parameters: {
      from_system: { type: 'string', required: true },
      to_system: { type: 'string', required: true },
      capability: { type: 'string', required: true },
      mission_id: { type: 'string', required: true },
      project_id: { type: 'string' },
      task_id: { type: 'string' },
      reason: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const agent = owner(exec.agent)
      if (!SYSTEMS.some(system => system.id === args.from_system)
        || !SYSTEMS.some(system => system.id === args.to_system)) {
        rejectInvalidInput('unknown D_AI system id')
      }
      return encodeToolResult(runtime.authorizeDurableCrossSystemHandoff(agent, {
        fromSystem: args.from_system as CapabilityGrant['systemId'],
        toSystem: args.to_system as CapabilityGrant['systemId'],
        capability: args.capability,
        missionId: args.mission_id,
        ...(args.project_id === undefined ? {} : { projectId: args.project_id }),
        ...(args.task_id === undefined ? {} : { taskId: args.task_id }),
        reason: args.reason,
      }))
    },
  }))
}
