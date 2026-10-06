/** Native Investor workers with independent fundamental and risk contexts. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-subagent'

export interface InvestorDelegationConfig {
  readonly provider: string
  readonly maxDepth: number
  readonly maxOutputTokens: number
  readonly maxRequestsPerChild: number
  readonly timeoutMs: number
  readonly allowedTools: readonly string[]
  readonly maxResultBytes: number
  readonly fundamentalModel?: string
  readonly riskModel?: string
  readonly fundamentalProvider?: string
  readonly riskProvider?: string
}

export interface InvestorWorkerOutput {
  readonly agentId: string
  readonly content: string
}

export interface InvestorDelegates {
  readonly fundamental: InvestorWorkerOutput
  readonly risk: InvestorWorkerOutput
}

function finalText(content: readonly ContentBlock[]): string {
  return content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

export async function runInvestorDelegates(
  ctx: Context,
  manager: Agent,
  objective: string,
  signal: AbortSignal,
  config: InvestorDelegationConfig,
): Promise<InvestorDelegates> {
  signal.throwIfAborted()
  const provider = ctx.subagents.getProvider(config.provider)
  if (provider === undefined) throw new Error('Investor subagent provider is not registered')
  if (provider.inheritsParentContext) throw new Error('Investor review requires fresh child contexts')
  if (!provider.capabilities.agentOptions || !provider.capabilities.depthLimit || !provider.capabilities.persona || !provider.capabilities.toolFilter) {
    throw new Error('Investor provider does not support required worker configuration')
  }

  const runWorker = async (role: 'fundamental' | 'risk', model?: string, llmProvider?: string): Promise<InvestorWorkerOutput> => {
    const controller = new AbortController()
    const childSignal = AbortSignal.any([signal, controller.signal])
    const label = 'investor-' + role + '-' + randomUUID()
    const deadline = setTimeout(() => controller.abort(new Error('Investor worker time budget exceeded')), config.timeoutMs)
    let requestCount = 0
    const removeGuard = ctx.on('agent/request', async ({ agent }, next) => {
      const ownsRun = agent.session.header.parentSession === manager.id
        && agent.session.snapshotEvents().some(event => event.type === 'subagent/descriptor' && event.data.label === label)
      if (!ownsRun) return next()
      requestCount += 1
      if (requestCount > config.maxRequestsPerChild) controller.abort(new Error('Investor worker request budget exceeded'))
      childSignal.throwIfAborted()
      return next()
    })

    try {
      const run = await ctx.subagents.start(config.provider, {
        label,
        parent: manager,
        signal: childSignal,
        maxDepth: config.maxDepth,
        toolFilter: { allow: [...config.allowedTools] },
        agentOptions: { maxTokens: config.maxOutputTokens, ...llmProvider === undefined ? {} : { provider: llmProvider }, ...model === undefined ? {} : { model } },
        persona: role === 'fundamental'
          ? 'Independently analyze the approved investment objective from fundamentals, filings, cash flows, valuation, competitive position, macro context and explicitly sourced evidence. Separate observed data from assumptions and do not guarantee returns.'
          : 'Independently attack the approved investment thesis. Search for downside cases, hidden leverage, accounting quality issues, concentration, liquidity, macro sensitivity, contrary evidence and explicit invalidation conditions. Do not inherit the fundamental worker conclusion.',
        prompt: [{ type: 'text', text: objective }],
      })
      try {
        const result = await run.result
        childSignal.throwIfAborted()
        if (result.stopReason !== 'completed') throw new Error('Investor ' + role + ' worker stopped: ' + result.stopReason)
        const content = finalText(result.output)
        if (Buffer.byteLength(content, 'utf8') > config.maxResultBytes) throw new Error('Investor worker result byte budget exceeded')
        return { agentId: run.id, content }
      } finally {
        await run.dispose()
      }
    } finally {
      clearTimeout(deadline)
      removeGuard()
    }
  }

  const fundamental = await runWorker('fundamental', config.fundamentalModel, config.fundamentalProvider)
  signal.throwIfAborted()
  const risk = await runWorker('risk', config.riskModel, config.riskProvider)
  return { fundamental, risk }
}
