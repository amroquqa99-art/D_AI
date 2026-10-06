/** Native authorized Cybersecurity workers for assessment and remediation review. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-subagent'

export interface CyberDelegationConfig {
  readonly provider: string
  readonly maxDepth: number
  readonly maxOutputTokens: number
  readonly maxRequestsPerChild: number
  readonly timeoutMs: number
  readonly allowedTools: readonly string[]
  readonly maxResultBytes: number
  readonly assessmentModel?: string
  readonly remediationModel?: string
}

export interface CyberWorkerOutput {
  readonly agentId: string
  readonly content: string
}

export interface CyberDelegates {
  readonly assessment: CyberWorkerOutput
  readonly remediationReview: CyberWorkerOutput
}

function finalText(content: readonly ContentBlock[]): string {
  return content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

export async function runCyberDelegates(
  ctx: Context,
  manager: Agent,
  objective: string,
  authorizationSummary: string,
  signal: AbortSignal,
  config: CyberDelegationConfig,
): Promise<CyberDelegates> {
  signal.throwIfAborted()
  const provider = ctx.subagents.getProvider(config.provider)
  if (provider === undefined) throw new Error('Cybersecurity subagent provider is not registered')
  if (provider.inheritsParentContext) throw new Error('Cybersecurity review requires fresh child contexts')
  if (!provider.capabilities.agentOptions || !provider.capabilities.depthLimit || !provider.capabilities.persona || !provider.capabilities.toolFilter) {
    throw new Error('Cybersecurity provider does not support required worker configuration')
  }

  const runWorker = async (role: 'assessment' | 'remediation', model?: string): Promise<CyberWorkerOutput> => {
    const controller = new AbortController()
    const childSignal = AbortSignal.any([signal, controller.signal])
    const label = 'cyber-' + role + '-' + randomUUID()
    const deadline = setTimeout(() => controller.abort(new Error('Cybersecurity worker time budget exceeded')), config.timeoutMs)
    let requestCount = 0
    const removeGuard = ctx.on('agent/request', async ({ agent }, next) => {
      const ownsRun = agent.session.header.parentSession === manager.id
        && agent.session.snapshotEvents().some(event => event.type === 'subagent/descriptor' && event.data.label === label)
      if (!ownsRun) return next()
      requestCount += 1
      if (requestCount > config.maxRequestsPerChild) controller.abort(new Error('Cybersecurity worker request budget exceeded'))
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
        persona: role === 'assessment'
          ? 'Assess the explicitly authorized environment for defensive weaknesses, evidence, impact and remediation. Stay inside the supplied authorization scope. Prefer reproducible non-destructive verification and clearly separate observed facts from hypotheses.'
          : 'Independently review defensive findings and proposed remediation. Look for false positives, incomplete fixes, residual exposure and safe retest criteria. Stay inside the supplied authorization scope and do not broaden target access.',
        prompt: [{ type: 'text', text: 'Objective: ' + objective + '\nAuthorization: ' + authorizationSummary }],
      })
      try {
        const result = await run.result
        childSignal.throwIfAborted()
        if (result.stopReason !== 'completed') throw new Error('Cybersecurity ' + role + ' worker stopped: ' + result.stopReason)
        const content = finalText(result.output)
        if (Buffer.byteLength(content, 'utf8') > config.maxResultBytes) throw new Error('Cybersecurity worker result byte budget exceeded')
        return { agentId: run.id, content }
      } finally {
        await run.dispose()
      }
    } finally {
      clearTimeout(deadline)
      removeGuard()
    }
  }

  const assessment = await runWorker('assessment', config.assessmentModel)
  signal.throwIfAborted()
  const remediationReview = await runWorker('remediation', config.remediationModel)
  return { assessment, remediationReview }
}
