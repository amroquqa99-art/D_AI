/** Harness-native unattended wake loop for durable Mission Director schedules. */
import { setTimeout as sleep } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed, UserMessage } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import type { DirectorPlanRuntimeView } from './director-runtime.ts'
import { directorScheduleStagnationReason } from './director-schedule-state.ts'
import type { DirectorSchedule, DirectorScheduleState } from './director-schedule-state.ts'
import type { ExecutionState } from './execution-state.ts'
import { orderDirectorOwnersForFairness } from './director-owner-order.ts'

// Reuse Harness's existing schedule source contract. Routing data belongs in
// message content, so adding a scheduler does not change the accepted Session
// source union or misclassify semantic routing as attribution-only metadata.
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'schedule': { kind: 'schedule' } & ContextFormed
  }
}

const wakeSchema = z.object({
  protocol: z.literal('d_ai.director-wake.v1'),
  scheduleId: z.string().min(1).max(240),
  planId: z.string().min(1).max(240),
  dueAt: z.string().datetime(),
}).strict()

function directorSchedulerWake(message: UserMessage): z.infer<typeof wakeSchema> | undefined {
  if (message.source.kind !== 'schedule' || message.content.length !== 1) return undefined
  const content = message.content[0]
  if (content?.type !== 'text') return undefined
  try {
    const parsed = wakeSchema.safeParse(JSON.parse(content.text))
    return parsed.success ? parsed.data : undefined
  } catch { return undefined }
}

export interface DirectorSchedulerConfig {
  readonly pollMs: number
  readonly maxConcurrentCycles: number
}

export interface ScheduledDirectorCycleResult {
  readonly scheduleId: string
  readonly planId: string
  readonly outcome: 'EXECUTED' | 'IDLE' | 'FAILED'
}

export interface DirectorSchedulerRuntime {
  readDirectorSchedule(agent: Agent): DirectorScheduleState
  directorPlanView(agent: Agent, planId: string, maxTasks?: number): DirectorPlanRuntimeView
  readExecution(agent: Agent): ExecutionState
  runScheduledDirectorCycle(
    agent: Agent,
    scheduleId: string,
    expectedDueAt: string,
    signal: AbortSignal,
  ): Promise<ScheduledDirectorCycleResult>
}

/** Owned cold-session activation; callers share the scheduler admission capacity. */
export interface DirectorSchedulerRecovery {
  /**
   * Inspect explicit cold owners and acquire at most the remaining slots.
   * @param nowMs - current scheduling time.
   * @param signal - cancellation for inspection and native resume.
   * @param maxOwners - currently free scheduler capacity.
   * @returns resolution after the serial activation pass.
   */
  scan(nowMs: number, signal: AbortSignal, maxOwners: number): Promise<void>
  /** Release and drain only the handles acquired by this recovery instance. */
  dispose(): Promise<void>
}

function scheduleKey(agentId: string, scheduleId: string): string {
  return agentId + ':' + scheduleId
}

export function directorSchedulerRemainingSlots(
  maxConcurrentCycles: number,
  activeCount: number,
  queuedWakeCount: number,
): number {
  for (const [name, value] of [
    ['maxConcurrentCycles', maxConcurrentCycles],
    ['activeCount', activeCount],
    ['queuedWakeCount', queuedWakeCount],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(name + ' must be a non-negative safe integer')
    }
  }
  if (maxConcurrentCycles < 1 || maxConcurrentCycles > 32) {
    throw new TypeError('maxConcurrentCycles must be an integer from 1 to 32')
  }
  return Math.max(0, maxConcurrentCycles - activeCount - queuedWakeCount)
}

export function isDirectorSchedulerWake(message: UserMessage): boolean {
  return directorSchedulerWake(message) !== undefined
}

export function createDirectorSchedulerWake(
  schedule: DirectorSchedule,
): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text: JSON.stringify({
      protocol: 'd_ai.director-wake.v1',
      scheduleId: schedule.id,
      planId: schedule.planId,
      dueAt: schedule.nextWakeAt,
    }) }],
    source: { kind: 'schedule', form: 'notice', summary: 'D_AI Director schedule wake' },
  })
}

export function hasPendingDirectorSchedulerWake(
  agent: Agent,
  scheduleId: string,
): boolean {
  return [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some(message =>
    directorSchedulerWake(message)?.scheduleId === scheduleId)
}

/**
 * Order schedules for one owner without using creation order as hidden
 * priority. Never-run schedules come first; otherwise the least recently
 * attempted schedule wins, then the oldest due time and stable identity.
 */
export function orderDirectorSchedulesForFairness(
  schedules: readonly DirectorSchedule[],
): readonly DirectorSchedule[] {
  return Object.freeze([...schedules].sort((left, right) => {
    const leftAttempt = left.lastCycle === undefined
      ? Number.NEGATIVE_INFINITY
      : Date.parse(left.lastCycle.attemptedAt)
    const rightAttempt = right.lastCycle === undefined
      ? Number.NEGATIVE_INFINITY
      : Date.parse(right.lastCycle.attemptedAt)
    if (leftAttempt !== rightAttempt) return leftAttempt - rightAttempt

    const due = Date.parse(left.nextWakeAt) - Date.parse(right.nextWakeAt)
    if (due !== 0) return due

    return left.id.localeCompare(right.id)
  }))
}

function hasExpiredPlanLease(
  execution: ExecutionState,
  plan: DirectorPlanRuntimeView,
  nowMs: number,
): boolean {
  const taskIds = new Set(plan.tasks.map(task => task.id))
  const ledger = execution.ledgers.find(item => item.ownerAgentId === plan.plan.ownerAgentId)
  if (ledger === undefined) return false

  return ledger.leases.some(lease =>
    taskIds.has(lease.taskId)
    && lease.releasedAt === undefined
    && Date.parse(lease.expiresAt) <= nowMs)
}

/** Validate one queued wake against the current durable schedule generation. */
export function isCurrentDirectorScheduleWake(
  schedule: DirectorSchedule,
  expectedDueAt: string,
  nowMs: number,
): boolean {
  return schedule.enabled
    && schedule.nextWakeAt === expectedDueAt
    && Date.parse(schedule.nextWakeAt) <= nowMs
}

/**
 * A wake is useful only when the schedule is due and the active plan either
 * has runnable work or needs expired-lease recovery.
 */
export function shouldWakeDirectorSchedule(
  schedule: DirectorSchedule,
  plan: DirectorPlanRuntimeView,
  execution: ExecutionState,
  nowMs: number,
): boolean {
  if (!isCurrentDirectorScheduleWake(schedule, schedule.nextWakeAt, nowMs)
    || directorScheduleStagnationReason(schedule) !== undefined
    || plan.plan.status !== 'ACTIVE') {
    return false
  }

  return plan.next.selected.length > 0 || hasExpiredPlanLease(execution, plan, nowMs)
}

/**
 * Process-local wake coordinator.
 *
 * The background loop never mutates D_AI durable state. It only places a
 * typed wake message into an idle root Agent inbox. The agent pre-step hook
 * consumes that message inside the native turn and delegates all durable work
 * to runScheduledDirectorCycle.
 */
export class DirectorScheduler {
  private readonly controller = new AbortController()
  private readonly active = new Set<string>()
  private readonly cycles = new Set<Promise<ScheduledDirectorCycleResult>>()
  private readonly removePreStep: () => void
  private readonly loop: Promise<void>
  private lastAdmittedOwnerId: string | undefined

  constructor(
    private readonly ctx: Context,
    private readonly runtime: DirectorSchedulerRuntime,
    private readonly config: DirectorSchedulerConfig,
    private readonly recovery?: DirectorSchedulerRecovery,
  ) {
    if (!Number.isSafeInteger(config.pollMs) || config.pollMs < 10) {
      throw new TypeError('Director scheduler pollMs must be an integer of at least 10 ms')
    }
    if (!Number.isSafeInteger(config.maxConcurrentCycles)
      || config.maxConcurrentCycles < 1
      || config.maxConcurrentCycles > 32) {
      throw new TypeError('Director scheduler maxConcurrentCycles must be an integer from 1 to 32')
    }

    this.removePreStep = ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
      const wakes = messages.filter(isDirectorSchedulerWake)
      const wake = wakes[0]
      if (wake === undefined || wakes.length !== 1 || messages.length !== 1) return next()
      const source = directorSchedulerWake(wake)
      if (source === undefined) return next()
      const key = scheduleKey(agent.id, source.scheduleId)

      if (this.active.has(key)) return { kind: 'reject' }

      this.active.add(key)
      const cycle = Promise.resolve().then(() => {
        const cycleSignal = AbortSignal.any([signal, this.controller.signal])
        cycleSignal.throwIfAborted()
        return this.runtime.runScheduledDirectorCycle(
          agent, source.scheduleId, source.dueAt, cycleSignal,
        )
      })
      this.cycles.add(cycle)
      try {
        await cycle
      } catch (error) {
        this.ctx.logger.warn(
          'D_AI unattended Director cycle failed for plan '
          + source.planId
          + ': '
          + (error instanceof Error ? error.message : String(error)),
        )
      } finally {
        this.cycles.delete(cycle)
        this.active.delete(key)
      }

      return { kind: 'reject' }
    })

    this.loop = this.run().catch((error: unknown) => {
      this.ctx.logger.error(
        'D_AI Director scheduler loop stopped unexpectedly: '
        + (error instanceof Error ? error.message : String(error)),
      )
    })
  }

  private async run(): Promise<void> {
    const signal = this.controller.signal

    try {
      while (true) {
        await sleep(this.config.pollMs, undefined, { signal })
        signal.throwIfAborted()
        const now = Date.now()
        const queued = [...this.ctx.agents.roots()].reduce((count, agent) =>
          count + [...agent.inbox.nextTurn, ...agent.inbox.nextStep].filter(isDirectorSchedulerWake).length, 0)
        const slots = directorSchedulerRemainingSlots(this.config.maxConcurrentCycles, this.active.size, queued)
        if (slots > 0) await this.recovery?.scan(now, signal, slots)
        signal.throwIfAborted()
        this.scan(now)
      }
    } catch (error) {
      if (!signal.aborted) throw error
    }
  }

  /**
   * One synchronous scan keeps wake admission deterministic and prevents
   * overlapping poll iterations from enqueueing duplicate schedule messages.
   */
  scan(nowMs: number): void {
    if (!Number.isFinite(nowMs)) throw new TypeError('Director scheduler scan time must be finite')
    if (this.controller.signal.aborted) return

    const roots = [...this.ctx.agents.roots()]
    const queuedWakeCount = roots.reduce((count, agent) =>
      count + [...agent.inbox.nextTurn, ...agent.inbox.nextStep]
        .filter(isDirectorSchedulerWake).length, 0)
    let remainingSlots = directorSchedulerRemainingSlots(
      this.config.maxConcurrentCycles,
      this.active.size,
      queuedWakeCount,
    )
    if (remainingSlots <= 0) return

    for (const agent of orderDirectorOwnersForFairness(roots, this.lastAdmittedOwnerId)) {
      if (remainingSlots <= 0) return
      let state: DirectorScheduleState
      try {
        state = this.runtime.readDirectorSchedule(agent)
      } catch (error) {
        this.ctx.logger.warn(
          'D_AI scheduler could not read state for agent '
          + agent.id
          + ': '
          + (error instanceof Error ? error.message : String(error)),
        )
        continue
      }

      const ledger = state.ledgers.find(item => item.ownerAgentId === agent.id)
      if (ledger === undefined) continue

      for (const schedule of orderDirectorSchedulesForFairness(ledger.schedules)) {
        const key = scheduleKey(agent.id, schedule.id)
        if (this.active.has(key)
          || hasPendingDirectorSchedulerWake(agent, schedule.id)) {
          continue
        }

        let plan: DirectorPlanRuntimeView
        let execution: ExecutionState
        try {
          plan = this.runtime.directorPlanView(agent, schedule.planId, 1)
          execution = this.runtime.readExecution(agent)
        } catch (error) {
          this.ctx.logger.warn(
            'D_AI scheduler could not inspect plan '
            + schedule.planId
            + ': '
            + (error instanceof Error ? error.message : String(error)),
          )
          continue
        }

        if (!shouldWakeDirectorSchedule(schedule, plan, execution, nowMs)) continue

        // Do not splice unattended work into a currently active turn or ahead
        // of already queued human/agent work. The next scan retries later.
        if (agent.status !== 'idle'
          || agent.inbox.nextTurn.length > 0
          || agent.inbox.nextStep.length > 0) {
          continue
        }

        try {
          agent.followup(createDirectorSchedulerWake(schedule))
          this.lastAdmittedOwnerId = agent.id
          remainingSlots -= 1
          break
        } catch (error) {
          // Agent disposal or a concurrent lifecycle transition must not kill
          // the process-level scheduler loop. The next scan will reconsider
          // the durable schedule if the owner is still live.
          this.ctx.logger.warn(
            'D_AI scheduler could not enqueue plan '
            + schedule.planId
            + ': '
            + (error instanceof Error ? error.message : String(error)),
          )
        }
      }
    }
  }

  async dispose(): Promise<void> {
    this.removePreStep()
    this.controller.abort(new Error('D_AI Director scheduler disposed'))
    await Promise.allSettled([this.loop, ...this.cycles])
    await this.recovery?.dispose()
  }
}
