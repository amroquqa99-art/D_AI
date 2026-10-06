/** Native Operations & Intelligence workers for fusion and adversarial analysis. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-subagent'

export interface OperationsDelegationConfig {
  readonly provider: string
  readonly maxDepth: number
  readonly maxOutputTokens: number
  readonly maxRequestsPerChild: number
  readonly timeoutMs: number
  readonly allowedTools: readonly string[]
  readonly maxResultBytes: number
  readonly fusionModel?: string
  readonly adversarialModel?: string
}

export interface OperationsWorkerOutput {
  readonly agentId: string
  readonly content: string
}

export interface OperationsDelegates {
  readonly fusion: OperationsWorkerOutput
  readonly adversarial: OperationsWorkerOutput
}

function finalText(content: readonly ContentBlock[]): string {
  return content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

export async function runOperationsDelegates(
  ctx: Context,
  manager: Agent,
  objective: string,
  signal: AbortSignal,
  config: OperationsDelegationConfig,
): Promise<OperationsDelegates> {
  signal.throwIfAborted()
  const provider = ctx.subagents.getProvider(config.provider)
  if (provider === undefined) throw new Error('Operations subagent provider is not registered')
  if (provider.inheritsParentContext) throw new Error('Operations review requires fresh child contexts')
  if (!provider.capabilities.agentOptions || !provider.capabilities.depthLimit || !provider.capabilities.persona || !provider.capabilities.toolFilter) {
    throw new Error('Operations provider does not support required worker configuration')
  }

  const runWorker = async (role: 'fusion' | 'adversarial', model?: string): Promise<OperationsWorkerOutput> => {
    const controller = new AbortController()
    const childSignal = AbortSignal.any([signal, controller.signal])
    const label = 'operations-' + role + '-' + randomUUID()
    const deadline = setTimeout(() => controller.abort(new Error('Operations worker time budget exceeded')), config.timeoutMs)
    let requestCount = 0
    const removeGuard = ctx.on('agent/request', async ({ agent }, next) => {
      const ownsRun = agent.session.header.parentSession === manager.id
        && agent.session.snapshotEvents().some(event => event.type === 'subagent/descriptor' && event.data.label === label)
      if (!ownsRun) return next()
      requestCount += 1
      if (requestCount > config.maxRequestsPerChild) controller.abort(new Error('Operations worker request budget exceeded'))
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
        persona: role === 'fusion'
          ? 'Fuse the approved case information into an auditable operational picture. Separate observations, inferred relationships, confidence, gaps and alternative explanations. Produce analysis and options only; do not execute sensitive external actions.'
          : 'Independently challenge the operational picture. Search for missing entities, contradictory timelines, mistaken identity, alternative hypotheses, deceptive signals and information gaps. Do not inherit the fusion worker conclusion and do not execute external actions.',
        prompt: [{ type: 'text', text: objective }],
      })
      try {
        const result = await run.result
        childSignal.throwIfAborted()
        if (result.stopReason !== 'completed') throw new Error('Operations ' + role + ' worker stopped: ' + result.stopReason)
        const content = finalText(result.output)
        if (Buffer.byteLength(content, 'utf8') > config.maxResultBytes) throw new Error('Operations worker result byte budget exceeded')
        return { agentId: run.id, content }
      } finally {
        await run.dispose()
      }
    } finally {
      clearTimeout(deadline)
      removeGuard()
    }
  }

  const fusion = await runWorker('fusion', config.fusionModel)
  signal.throwIfAborted()
  const adversarial = await runWorker('adversarial', config.adversarialModel)
  return { fusion, adversarial }
}
