import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {
  IntelligenceGap,
  OperationsCase,
  OperationsEntity,
  OperationsState,
} from './operations-state.ts'
import { encodeToolResult, jsonToolOutput, rejectInvalidInput } from './tool-support.ts'
import type { ToolOwnerResolver } from './tool-support.ts'

export interface OperationsToolRuntime {
  createOperations(
    agent: Agent,
    objective: string,
    classification: OperationsCase['classification'],
    signal?: AbortSignal,
  ): Promise<OperationsCase>
  readOperations(agent: Agent): OperationsState
  addOperationsEntity(
    agent: Agent,
    caseId: string,
    input: { type: OperationsEntity['type']; label: string; summary: string },
  ): Promise<OperationsCase>
  addOperationsRelationship(
    agent: Agent,
    caseId: string,
    input: {
      fromEntityId: string
      toEntityId: string
      type: string
      confidence: number
      evidenceRefs?: readonly string[]
    },
  ): Promise<OperationsCase>
  addOperationsTimelineEvent(
    agent: Agent,
    caseId: string,
    input: {
      occurredAt: string
      label: string
      details: string
      evidenceRefs?: readonly string[]
    },
  ): Promise<OperationsCase>
  addIntelligenceGap(
    agent: Agent,
    caseId: string,
    input: { question: string; priority: IntelligenceGap['priority'] },
  ): Promise<OperationsCase>
  addOperationalOption(
    agent: Agent,
    caseId: string,
    input: {
      title: string
      description: string
      expectedBenefit: string
      risks: string
    },
  ): Promise<OperationsCase>
  delegateOperations(agent: Agent, caseId: string, signal: AbortSignal): Promise<OperationsCase>
}

function optionalEvidenceRefs(value: string | undefined): { evidenceRefs?: readonly string[] } {
  if (value === undefined) return {}
  return {
    evidenceRefs: value.split(',').map(item => item.trim()).filter(Boolean),
  }
}

export function registerOperationsTools(
  ctx: Context,
  runtime: OperationsToolRuntime,
  owner: ToolOwnerResolver,
  workerTimeoutMs: number,
): void {
  ctx.tools.register(defineTool({
    name: 'd_ai_operations_create',
    description: 'Create a user-approved Operations & Intelligence analysis case. The case supports analysis and proposed options; it does not execute external actions.',
    parameters: {
      objective: { type: 'string', required: true },
      classification: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const classifications = ['UNCLASSIFIED', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] as const
      if (!classifications.includes(args.classification as typeof classifications[number])) {
        rejectInvalidInput('invalid operations classification')
      }
      return encodeToolResult(runtime.createOperations(
        owner(exec.agent),
        args.objective,
        args.classification as OperationsCase['classification'],
        exec.signal,
      ))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_operations_read',
    description: 'Read Operations & Intelligence cases, entities, relationships, timeline, gaps, options and independent analysis.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.readOperations(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_operations_add_entity',
    description: 'Append an entity to an approved Operations & Intelligence case.',
    parameters: {
      case_id: { type: 'string', required: true },
      type: { type: 'string', required: true },
      label: { type: 'string', required: true },
      summary: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const types = ['PERSON', 'ORGANIZATION', 'ASSET', 'LOCATION', 'DEVICE', 'ACCOUNT', 'OTHER'] as const
      if (!types.includes(args.type as typeof types[number])) {
        rejectInvalidInput('invalid operations entity type')
      }
      return encodeToolResult(runtime.addOperationsEntity(owner(exec.agent), args.case_id, {
        type: args.type as OperationsEntity['type'],
        label: args.label,
        summary: args.summary,
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_operations_add_relationship',
    description: 'Append an evidence-aware relationship between two existing case entities.',
    parameters: {
      case_id: { type: 'string', required: true },
      from_entity_id: { type: 'string', required: true },
      to_entity_id: { type: 'string', required: true },
      type: { type: 'string', required: true },
      confidence: { type: 'number', required: true },
      evidence_refs: { type: 'string' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(runtime.addOperationsRelationship(
      owner(exec.agent),
      args.case_id,
      {
        fromEntityId: args.from_entity_id,
        toEntityId: args.to_entity_id,
        type: args.type,
        confidence: args.confidence,
        ...optionalEvidenceRefs(args.evidence_refs),
      },
    )),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_operations_add_timeline',
    description: 'Append a sourced timeline event to an Operations & Intelligence case.',
    parameters: {
      case_id: { type: 'string', required: true },
      occurred_at: { type: 'string', required: true },
      label: { type: 'string', required: true },
      details: { type: 'string', required: true },
      evidence_refs: { type: 'string' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(runtime.addOperationsTimelineEvent(
      owner(exec.agent),
      args.case_id,
      {
        occurredAt: args.occurred_at,
        label: args.label,
        details: args.details,
        ...optionalEvidenceRefs(args.evidence_refs),
      },
    )),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_operations_add_gap',
    description: 'Record an unresolved intelligence gap so the system can direct further collection or analysis.',
    parameters: {
      case_id: { type: 'string', required: true },
      question: { type: 'string', required: true },
      priority: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
      if (!priorities.includes(args.priority as typeof priorities[number])) {
        rejectInvalidInput('invalid intelligence gap priority')
      }
      return encodeToolResult(runtime.addIntelligenceGap(owner(exec.agent), args.case_id, {
        question: args.question,
        priority: args.priority as IntelligenceGap['priority'],
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_operations_add_option',
    description: 'Record an analytical operational option with benefits and risks. Every option remains PROPOSED and requires human approval; this tool does not execute it.',
    parameters: {
      case_id: { type: 'string', required: true },
      title: { type: 'string', required: true },
      description: { type: 'string', required: true },
      expected_benefit: { type: 'string', required: true },
      risks: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(runtime.addOperationalOption(
      owner(exec.agent),
      args.case_id,
      {
        title: args.title,
        description: args.description,
        expectedBenefit: args.expected_benefit,
        risks: args.risks,
      },
    )),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_operations_delegate',
    description: 'Run fresh independent fusion and adversarial-analysis Agents for the approved case. No external action is executed.',
    parameters: { case_id: { type: 'string', required: true } },
    output: jsonToolOutput,
    timeoutMs: workerTimeoutMs * 2 + 10000,
    execute: (args, exec) => encodeToolResult(
      runtime.delegateOperations(owner(exec.agent), args.case_id, exec.signal),
    ),
  }))
}
