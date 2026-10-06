import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ScientificProject, ScientificState } from './scientific-state.ts'
import { encodeToolResult, jsonToolOutput } from './tool-support.ts'
import type { ToolOwnerResolver } from './tool-support.ts'

export interface ScientificToolRuntime {
  createScientific(agent: Agent, question: string, signal?: AbortSignal): Promise<ScientificProject>
  readScientific(agent: Agent): ScientificState
  addScientificHypothesis(
    agent: Agent,
    projectId: string,
    input: { statement: string; rationale: string },
  ): Promise<ScientificProject>
  requestScientificExperiment(
    agent: Agent,
    projectId: string,
    input: {
      title: string
      objective: string
      protocol: string
      expectedEvidence: string
      budgetUsd?: number
    },
  ): Promise<ScientificProject>
  recordScientificResult(
    agent: Agent,
    projectId: string,
    experimentId: string,
    observation: string,
    artifactRef?: string,
  ): Promise<ScientificProject>
  delegateScientific(agent: Agent, projectId: string, signal: AbortSignal): Promise<ScientificProject>
}

/** Register the Scientific Research tool surface without owning domain behavior. */
export function registerScientificTools(
  ctx: Context,
  runtime: ScientificToolRuntime,
  owner: ToolOwnerResolver,
  workerTimeoutMs: number,
): void {
  ctx.tools.register(defineTool({
    name: 'd_ai_scientific_create',
    description: 'Create an explicitly user-requested Scientific Research project. Do not activate a new independent research project without owner approval.',
    parameters: { question: { type: 'string', required: true } },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(
      runtime.createScientific(owner(exec.agent), args.question, exec.signal),
    ),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_scientific_read',
    description: 'Read durable Scientific Research projects, hypotheses, requested experiments, results and independent worker outputs.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.readScientific(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_scientific_add_hypothesis',
    description: 'Append a researcher hypothesis and rationale. The hypothesis remains OPEN and is not treated as a finding.',
    parameters: {
      project_id: { type: 'string', required: true },
      statement: { type: 'string', required: true },
      rationale: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(runtime.addScientificHypothesis(
      owner(exec.agent),
      args.project_id,
      { statement: args.statement, rationale: args.rationale },
    )),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_scientific_request_experiment',
    description: 'Turn an evidence gap into a concrete human/lab experiment request and move the project to WAITING_FOR_HUMAN.',
    parameters: {
      project_id: { type: 'string', required: true },
      title: { type: 'string', required: true },
      objective: { type: 'string', required: true },
      protocol: { type: 'string', required: true },
      expected_evidence: { type: 'string', required: true },
      budget_usd: { type: 'number' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(runtime.requestScientificExperiment(
      owner(exec.agent),
      args.project_id,
      {
        title: args.title,
        objective: args.objective,
        protocol: args.protocol,
        expectedEvidence: args.expected_evidence,
        ...(args.budget_usd === undefined ? {} : { budgetUsd: args.budget_usd }),
      },
    )),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_scientific_record_result',
    description: 'Record the real observation returned by the human/lab for a previously requested experiment.',
    parameters: {
      project_id: { type: 'string', required: true },
      experiment_id: { type: 'string', required: true },
      observation: { type: 'string', required: true },
      artifact_ref: { type: 'string' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(runtime.recordScientificResult(
      owner(exec.agent),
      args.project_id,
      args.experiment_id,
      args.observation,
      args.artifact_ref,
    )),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_scientific_delegate',
    description: 'Run fresh independent literature and methodology Agents for the approved Scientific Research question.',
    parameters: { project_id: { type: 'string', required: true } },
    output: jsonToolOutput,
    timeoutMs: workerTimeoutMs * 2 + 10000,
    execute: (args, exec) => encodeToolResult(
      runtime.delegateScientific(owner(exec.agent), args.project_id, exec.signal),
    ),
  }))
}
