import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { InvestmentThesis, InvestorCase, InvestorSource, InvestorState } from './investor-state.ts'
import { encodeToolResult, jsonToolOutput, rejectInvalidInput } from './tool-support.ts'
import type { ToolOwnerResolver } from './tool-support.ts'

export interface InvestorToolRuntime {
  createInvestor(agent: Agent, objective: string, signal?: AbortSignal): Promise<InvestorCase>
  readInvestor(agent: Agent): InvestorState
  captureInvestorSource(
    agent: Agent,
    caseId: string,
    url: string,
    category: InvestorSource['category'],
    signal: AbortSignal,
  ): Promise<InvestorCase>
  addInvestmentThesis(
    agent: Agent,
    caseId: string,
    input: {
      statement: string
      horizon: InvestmentThesis['horizon']
      rationale: string
      invalidationConditions: string
    },
  ): Promise<InvestorCase>
  delegateInvestor(agent: Agent, caseId: string, signal: AbortSignal): Promise<InvestorCase>
}

export function registerInvestorTools(
  ctx: Context,
  runtime: InvestorToolRuntime,
  owner: ToolOwnerResolver,
  workerTimeoutMs: number,
): void {
  ctx.tools.register(defineTool({
    name: 'd_ai_investor_create',
    description: 'Create an explicitly user-requested Investor analysis case. This does not authorize real capital movement.',
    parameters: { objective: { type: 'string', required: true } },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(
      runtime.createInvestor(owner(exec.agent), args.objective, exec.signal),
    ),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_investor_read',
    description: 'Read durable Investor cases, captured sources, theses and independent analysis outputs.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.readInvestor(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_investor_capture_source',
    description: 'Capture an authorized financial, filing, market, macro, news or other HTTP(S) source with immutable provenance.',
    parameters: {
      case_id: { type: 'string', required: true },
      url: { type: 'string', required: true },
      category: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    timeoutMs: 30000,
    execute: (args, exec) => {
      const allowed = ['FILING', 'MARKET', 'MACRO', 'NEWS', 'SOCIAL', 'OTHER'] as const
      if (!allowed.includes(args.category as typeof allowed[number])) {
        rejectInvalidInput('invalid investor source category')
      }
      return encodeToolResult(runtime.captureInvestorSource(
        owner(exec.agent),
        args.case_id,
        args.url,
        args.category as InvestorSource['category'],
        exec.signal,
      ))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_investor_add_thesis',
    description: 'Append an investment thesis with an explicit horizon, rationale and invalidation conditions. This is analysis, not an execution order.',
    parameters: {
      case_id: { type: 'string', required: true },
      statement: { type: 'string', required: true },
      horizon: { type: 'string', required: true },
      rationale: { type: 'string', required: true },
      invalidation_conditions: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const horizons = ['SHORT', 'MEDIUM', 'LONG'] as const
      if (!horizons.includes(args.horizon as typeof horizons[number])) {
        rejectInvalidInput('invalid investment horizon')
      }
      return encodeToolResult(runtime.addInvestmentThesis(owner(exec.agent), args.case_id, {
        statement: args.statement,
        horizon: args.horizon as InvestmentThesis['horizon'],
        rationale: args.rationale,
        invalidationConditions: args.invalidation_conditions,
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_investor_delegate',
    description: 'Run fresh independent fundamental and adversarial-risk Agents for the approved Investor case.',
    parameters: { case_id: { type: 'string', required: true } },
    output: jsonToolOutput,
    timeoutMs: workerTimeoutMs * 2 + 10000,
    execute: (args, exec) => encodeToolResult(
      runtime.delegateInvestor(owner(exec.agent), args.case_id, exec.signal),
    ),
  }))
}
