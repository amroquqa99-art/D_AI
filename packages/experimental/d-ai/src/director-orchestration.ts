/** Isolated Mission Director planner: model proposes a bounded task DAG; runtime validates before commit. */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-subagent'
import { buildTaskGraph, type MissionTask } from './task-dag.ts'
import type { DirectorPlan } from './director-state.ts'
import type { SystemManifest } from './systems.ts'

const systemId = z.enum([
  'investigation',
  'scientific-research',
  'investor',
  'cybersecurity',
  'operations-intelligence',
  'innovation-discovery',
])

const proposedTaskSchema = z.object({
  tempId: z.string().min(1).max(120),
  systemId,
  title: z.string().min(1).max(4000),
  dependsOn: z.array(z.string().min(1).max(120)).default([]),
  priority: z.number().int().min(-1000).max(1000).default(0),
  maxAttempts: z.number().int().min(1).max(10).default(3),
}).strict()

const plannerOutputSchema = z.object({
  tasks: z.array(proposedTaskSchema).min(1).max(32),
  rationale: z.string().min(1).max(12000),
}).strict()

export interface DirectorPlanningConfig {
  readonly subagentProvider: string
  readonly maxDepth: number
  readonly maxOutputTokens: number
  readonly maxRequests: number
  readonly timeoutMs: number
  readonly maxResultBytes: number
  readonly model?: string
  readonly llmProvider?: string
}

export interface DirectorPlanningResult {
  readonly plannerAgentId: string
  readonly tasks: readonly MissionTask[]
  readonly rationale: string
}

function finalText(content: readonly ContentBlock[]): string {
  return content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n').trim()
}

function parsePlannerJson(text: string): z.infer<typeof plannerOutputSchema> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Mission Director planner must return one JSON object with no markdown wrapper')
  }
  return plannerOutputSchema.parse(parsed)
}

export async function runDirectorPlanner(
  ctx: Context,
  manager: Agent,
  plan: DirectorPlan,
  systems: readonly SystemManifest[],
  signal: AbortSignal,
  config: DirectorPlanningConfig,
): Promise<DirectorPlanningResult> {
  signal.throwIfAborted()
  const provider = ctx.subagents.getProvider(config.subagentProvider)
  if (provider === undefined) throw new Error('Mission Director subagent provider is not registered')
  if (provider.inheritsParentContext) throw new Error('Mission Director planning requires a fresh child context')
  if (!provider.capabilities.agentOptions || !provider.capabilities.depthLimit || !provider.capabilities.persona || !provider.capabilities.toolFilter) {
    throw new Error('Mission Director provider does not support required planner configuration')
  }
  for (const value of [config.maxDepth, config.maxOutputTokens, config.maxRequests, config.timeoutMs, config.maxResultBytes]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid Mission Director planner resource limit')
  }

  const label = 'director-planner-' + randomUUID()
  const controller = new AbortController()
  const childSignal = AbortSignal.any([signal, controller.signal])
  const deadline = setTimeout(() => controller.abort(new Error('Mission Director planner time budget exceeded')), config.timeoutMs)
  let requests = 0
  const removeGuard = ctx.on('agent/request', async ({ agent }, next) => {
    const ownsRun = agent.session.header.parentSession === manager.id
      && agent.session.snapshotEvents().some(event => event.type === 'subagent/descriptor' && event.data.label === label)
    if (!ownsRun) return next()
    requests += 1
    if (requests > config.maxRequests) controller.abort(new Error('Mission Director planner request budget exceeded'))
    childSignal.throwIfAborted()
    return next()
  })

  try {
    const systemSummary = systems.map(system => ({
      id: system.id,
      description: system.description,
      riskClass: system.riskClass,
      crossSystem: system.crossSystem,
    }))
    const prompt = JSON.stringify({
      objective: plan.objective,
      primarySystem: plan.primarySystem,
      stopConditions: plan.stopConditions,
      availableSystems: systemSummary,
      outputContract: {
        tasks: [{
          tempId: 'short unique id used only inside this proposal',
          systemId: 'one available system id',
          title: 'one concrete verifiable task',
          dependsOn: ['tempId values from this same proposal only'],
          priority: 'integer; higher runs first when dependencies allow',
          maxAttempts: 'integer 1..10',
        }],
        rationale: 'short explanation of the decomposition',
      },
    })

    const run = await ctx.subagents.start(config.subagentProvider, {
      label,
      parent: manager,
      signal: childSignal,
      maxDepth: config.maxDepth,
      toolFilter: { allow: [] },
      agentOptions: {
        maxTokens: config.maxOutputTokens,
        ...(config.llmProvider === undefined ? {} : { provider: config.llmProvider }),
        ...(config.model === undefined ? {} : { model: config.model }),
      },
      persona: 'You are the D_AI Mission Director planner. Decompose only the approved objective into the smallest useful cross-system DAG. Do not execute work, browse, invent evidence, expand scope, or request side effects. Return exactly one valid JSON object matching the supplied output contract, with no markdown.',
      prompt: [{ type: 'text', text: prompt }],
    })

    try {
      const result = await run.result
      childSignal.throwIfAborted()
      if (result.stopReason !== 'completed') throw new Error('Mission Director planner stopped: ' + result.stopReason)
      const text = finalText(result.output)
      if (Buffer.byteLength(text, 'utf8') > config.maxResultBytes) throw new Error('Mission Director planner result byte budget exceeded')
      const proposal = parsePlannerJson(text)

      const tempIds = proposal.tasks.map(task => task.tempId)
      if (new Set(tempIds).size !== tempIds.length) throw new Error('Mission Director planner returned duplicate tempId values')
      const known = new Set(tempIds)
      for (const task of proposal.tasks) {
        if (task.dependsOn.some(dep => !known.has(dep))) throw new Error('Mission Director planner dependency references unknown tempId')
        if (task.dependsOn.includes(task.tempId)) throw new Error('Mission Director planner task cannot depend on itself')
      }

      const idMap = new Map(tempIds.map(tempId => [tempId, randomUUID()]))
      const tasks: MissionTask[] = proposal.tasks.map(task => ({
        id: idMap.get(task.tempId)!,
        missionId: plan.id,
        systemId: task.systemId,
        title: task.title,
        dependsOn: task.dependsOn.map(dep => idMap.get(dep)!),
        state: 'PENDING',
        priority: task.priority,
        attempt: 0,
        maxAttempts: task.maxAttempts,
      }))
      buildTaskGraph(tasks)

      return Object.freeze({
        plannerAgentId: run.id,
        tasks: Object.freeze(tasks),
        rationale: proposal.rationale,
      })
    } finally {
      await run.dispose()
    }
  } finally {
    clearTimeout(deadline)
    removeGuard()
  }
}
