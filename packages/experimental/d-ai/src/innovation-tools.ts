import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { InnovationCandidate, InnovationProject, InnovationState } from './innovation-state.ts'
import { encodeToolResult, jsonToolOutput, rejectInvalidInput } from './tool-support.ts'
import type { ToolOwnerResolver } from './tool-support.ts'

export interface InnovationToolRuntime {
  createInnovation(agent: Agent, problem: string, signal?: AbortSignal): Promise<InnovationProject>
  readInnovation(agent: Agent): InnovationState
  addInnovationCandidate(
    agent: Agent,
    projectId: string,
    input: {
      title: string
      description: string
      mechanism: string
      falsificationTest: string
      noveltyStatus?: InnovationCandidate['noveltyStatus']
    },
  ): Promise<unknown>
  requestInnovationExperiment(
    agent: Agent,
    projectId: string,
    input: {
      title: string
      objective: string
      protocol: string
      successCriteria: string
      failureCriteria: string
    },
  ): Promise<unknown>
  recordInnovationResult(
    agent: Agent,
    projectId: string,
    experimentId: string,
    observation: string,
    artifactRef?: string,
  ): Promise<unknown>
  delegateInnovation(agent: Agent, projectId: string, signal: AbortSignal): Promise<unknown>
}

export function registerInnovationTools(
  ctx: Context,
  runtime: InnovationToolRuntime,
  owner: ToolOwnerResolver,
  workerTimeoutMs: number,
): void {
  ctx.tools.register(defineTool({
    name: 'd_ai_innovation_create',
    description: 'Create a user-requested Innovation & Discovery project for a hard scientific or technical problem.',
    parameters: { problem: { type: 'string', required: true } },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(
      runtime.createInnovation(owner(exec.agent), args.problem, exec.signal),
    ),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_innovation_read',
    description: 'Read Innovation & Discovery projects, candidates, experiment requests/results and independent explorer/critic outputs.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.readInnovation(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_innovation_add_candidate',
    description: 'Append a testable candidate mechanism with a falsification test. Generated candidates are not discoveries.',
    parameters: {
      project_id: { type: 'string', required: true },
      title: { type: 'string', required: true },
      description: { type: 'string', required: true },
      mechanism: { type: 'string', required: true },
      falsification_test: { type: 'string', required: true },
      novelty_status: { type: 'string' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const statuses = ['UNKNOWN', 'KNOWN_VARIANT', 'POTENTIALLY_NOVEL'] as const
      if (args.novelty_status !== undefined
        && !statuses.includes(args.novelty_status as typeof statuses[number])) {
        rejectInvalidInput('invalid innovation novelty status')
      }
      return encodeToolResult(runtime.addInnovationCandidate(owner(exec.agent), args.project_id, {
        title: args.title,
        description: args.description,
        mechanism: args.mechanism,
        falsificationTest: args.falsification_test,
        ...(args.novelty_status === undefined
          ? {}
          : { noveltyStatus: args.novelty_status as InnovationCandidate['noveltyStatus'] }),
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_innovation_request_experiment',
    description: 'Turn an unresolved candidate into a real experiment request with explicit success and failure criteria.',
    parameters: {
      project_id: { type: 'string', required: true },
      title: { type: 'string', required: true },
      objective: { type: 'string', required: true },
      protocol: { type: 'string', required: true },
      success_criteria: { type: 'string', required: true },
      failure_criteria: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(runtime.requestInnovationExperiment(
      owner(exec.agent),
      args.project_id,
      {
        title: args.title,
        objective: args.objective,
        protocol: args.protocol,
        successCriteria: args.success_criteria,
        failureCriteria: args.failure_criteria,
      },
    )),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_innovation_record_result',
    description: 'Record a real experiment observation. Recording a result does not automatically verify the candidate.',
    parameters: {
      project_id: { type: 'string', required: true },
      experiment_id: { type: 'string', required: true },
      observation: { type: 'string', required: true },
      artifact_ref: { type: 'string' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(runtime.recordInnovationResult(
      owner(exec.agent),
      args.project_id,
      args.experiment_id,
      args.observation,
      args.artifact_ref,
    )),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_innovation_delegate',
    description: 'Run fresh independent explorer and critic Agents over the approved hard problem.',
    parameters: { project_id: { type: 'string', required: true } },
    output: jsonToolOutput,
    timeoutMs: workerTimeoutMs * 2 + 10000,
    execute: (args, exec) => encodeToolResult(
      runtime.delegateInnovation(owner(exec.agent), args.project_id, exec.signal),
    ),
  }))
}
