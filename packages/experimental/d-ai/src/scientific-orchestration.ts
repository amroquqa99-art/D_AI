/** Native Scientific Research workers with independent literature and methodology contexts. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-subagent'

export interface ScientificDelegationConfig {
  readonly provider: string
  readonly maxDepth: number
  readonly maxOutputTokens: number
  readonly maxRequestsPerChild: number
  readonly timeoutMs: number
  readonly allowedTools: readonly string[]
  readonly maxResultBytes: number
  readonly literatureModel?: string
  readonly methodologyModel?: string
  readonly literatureProvider?: string
  readonly methodologyProvider?: string
}

export interface ScientificWorkerOutput {
  readonly agentId: string
  readonly content: string
}

export interface ScientificDelegates {
  readonly literature: ScientificWorkerOutput
  readonly methodology: ScientificWorkerOutput
}

function finalText(content: readonly ContentBlock[]): string {
  return content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

export async function runScientificDelegates(
  ctx: Context,
  manager: Agent,
  question: string,
  signal: AbortSignal,
  config: ScientificDelegationConfig,
): Promise<ScientificDelegates> {
  signal.throwIfAborted()
  const provider = ctx.subagents.getProvider(config.provider)
  if (provider === undefined) throw new Error('Scientific subagent provider is not registered')
  if (provider.inheritsParentContext) throw new Error('Scientific review requires fresh child contexts')
  if (!provider.capabilities.agentOptions || !provider.capabilities.depthLimit || !provider.capabilities.persona || !provider.capabilities.toolFilter) {
    throw new Error('Scientific provider does not support required worker configuration')
  }

  const runWorker = async (role: 'literature' | 'methodology', model?: string, llmProvider?: string): Promise<ScientificWorkerOutput> => {
    const controller = new AbortController()
    const childSignal = AbortSignal.any([signal, controller.signal])
    const label = 'scientific-' + role + '-' + randomUUID()
    const deadline = setTimeout(() => controller.abort(new Error('Scientific worker time budget exceeded')), config.timeoutMs)
    let requestCount = 0
    const removeGuard = ctx.on('agent/request', async ({ agent }, next) => {
      const ownsRun = agent.session.header.parentSession === manager.id
        && agent.session.snapshotEvents().some(event => event.type === 'subagent/descriptor' && event.data.label === label)
      if (!ownsRun) return next()
      requestCount += 1
      if (requestCount > config.maxRequestsPerChild) controller.abort(new Error('Scientific worker request budget exceeded'))
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
        persona: role === 'literature'
          ? 'Map the current scientific knowledge for the approved question. Prioritize primary literature and original data, distinguish established results from unresolved gaps, note contradictions and source quality, and never present an untested inference as a finding.'
          : 'Independently critique the approved scientific question and possible study designs. Identify confounders, falsification tests, statistical risks, ethics/resource constraints, and the minimum real-world observations or experiments needed to make progress. Do not assume the literature worker conclusion.',
        prompt: [{ type: 'text', text: question }],
      })
      try {
        const result = await run.result
        childSignal.throwIfAborted()
        if (result.stopReason !== 'completed') throw new Error('Scientific ' + role + ' worker stopped: ' + result.stopReason)
        const content = finalText(result.output)
        if (Buffer.byteLength(content, 'utf8') > config.maxResultBytes) throw new Error('Scientific worker result byte budget exceeded')
        return { agentId: run.id, content }
      } finally {
        await run.dispose()
      }
    } finally {
      clearTimeout(deadline)
      removeGuard()
    }
  }

  const literature = await runWorker('literature', config.literatureModel, config.literatureProvider)
  signal.throwIfAborted()
  const methodology = await runWorker('methodology', config.methodologyModel, config.methodologyProvider)
  return { literature, methodology }
}
