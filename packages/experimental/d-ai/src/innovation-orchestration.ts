/** Native Innovation & Discovery workers for exploration and adversarial criticism. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-subagent'

export interface InnovationDelegationConfig {
  readonly provider: string
  readonly maxDepth: number
  readonly maxOutputTokens: number
  readonly maxRequestsPerChild: number
  readonly timeoutMs: number
  readonly allowedTools: readonly string[]
  readonly maxResultBytes: number
  readonly explorerModel?: string
  readonly criticModel?: string
}

export interface InnovationWorkerOutput {
  readonly agentId: string
  readonly content: string
}

export interface InnovationDelegates {
  readonly explorer: InnovationWorkerOutput
  readonly critic: InnovationWorkerOutput
}

function finalText(content: readonly ContentBlock[]): string {
  return content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

export async function runInnovationDelegates(
  ctx: Context,
  manager: Agent,
  problem: string,
  signal: AbortSignal,
  config: InnovationDelegationConfig,
): Promise<InnovationDelegates> {
  signal.throwIfAborted()
  const provider = ctx.subagents.getProvider(config.provider)
  if (provider === undefined) throw new Error('Innovation subagent provider is not registered')
  if (provider.inheritsParentContext) throw new Error('Innovation review requires fresh child contexts')
  if (!provider.capabilities.agentOptions || !provider.capabilities.depthLimit || !provider.capabilities.persona || !provider.capabilities.toolFilter) {
    throw new Error('Innovation provider does not support required worker configuration')
  }

  const runWorker = async (role: 'explorer' | 'critic', model?: string): Promise<InnovationWorkerOutput> => {
    const controller = new AbortController()
    const childSignal = AbortSignal.any([signal, controller.signal])
    const label = 'innovation-' + role + '-' + randomUUID()
    const deadline = setTimeout(() => controller.abort(new Error('Innovation worker time budget exceeded')), config.timeoutMs)
    let requestCount = 0
    const removeGuard = ctx.on('agent/request', async ({ agent }, next) => {
      const ownsRun = agent.session.header.parentSession === manager.id
        && agent.session.snapshotEvents().some(event => event.type === 'subagent/descriptor' && event.data.label === label)
      if (!ownsRun) return next()
      requestCount += 1
      if (requestCount > config.maxRequestsPerChild) controller.abort(new Error('Innovation worker request budget exceeded'))
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
        agentOptions: { maxTokens: config.maxOutputTokens, ...model === undefined ? {} : { model } },
        persona: role === 'explorer'
          ? 'Explore the approved hard problem from first principles and across disciplines. Generate multiple competing mechanisms, problem reframings and testable candidates. State assumptions and falsification tests. Never call a generated idea a discovery without external verification.'
          : 'Independently attack candidate solution space for the approved problem. Search for counterexamples, hidden assumptions, prior-art overlap, physical or mathematical impossibility, measurement artifacts and decisive experiments. Do not inherit the explorer conclusion.',
        prompt: [{ type: 'text', text: problem }],
      })
      try {
        const result = await run.result
        childSignal.throwIfAborted()
        if (result.stopReason !== 'completed') throw new Error('Innovation ' + role + ' worker stopped: ' + result.stopReason)
        const content = finalText(result.output)
        if (Buffer.byteLength(content, 'utf8') > config.maxResultBytes) throw new Error('Innovation worker result byte budget exceeded')
        return { agentId: run.id, content }
      } finally {
        await run.dispose()
      }
    } finally {
      clearTimeout(deadline)
      removeGuard()
    }
  }

  const explorer = await runWorker('explorer', config.explorerModel)
  signal.throwIfAborted()
  const critic = await runWorker('critic', config.criticModel)
  return { explorer, critic }
}
