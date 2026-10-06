/** Harness-native unattended wake loop for durable Mission Director schedules. */
import { setTimeout as sleep } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed, UserMessage } from '@deepseek-ai/dsh-llm'
import type { DirectorPlanRuntimeView } from './director-runtime.ts'
import type { DirectorSchedule, DirectorScheduleState } from './director-schedule-state.ts'
import type { ExecutionState } from './execution-state.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'd-ai-scheduler': {
      readonly kind: 'd-ai-scheduler'
      readonly scheduleId: string
      readonly planId: string
      readonly dueAt: string
    } & ContextFormed
  }
}

export interface DirectorSchedulerConfig {
  readonly pollMs: number
}

export interface ScheduledDirectorCycleResult {
  readonly scheduleId: string
  readonly planId: string
  readonly outcome: 'EXECUTED' | 'TASK_FAILED' | 'IDLE' | 'FAILED'
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

function scheduleKey(agentId: string, scheduleId: string): string {
  return agentId + ':' + scheduleId
}

export function isDirectorSchedulerWake(message: UserMessage): boolean {
  return message.source.kind === 'd-ai-scheduler'
}

export function createDirectorSchedulerWake(
  schedule: DirectorSchedule,
): UserMessage {
  return createUserMessage({
    content: [],
    source: {
      kind: 'd-ai-scheduler',
      form: 'notice',
      summary: 'D_AI unattended Director schedule wake',
      scheduleId: schedule.id,
      planId: schedule.planId,
      dueAt: schedule.nextWakeAt,
    },
  })
}

export function hasPendingDirectorSchedulerWake(
  agent: Agent,
  scheduleId: string,
): boolean {
  return [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some(message =>
    message.source.kind === 'd-ai-scheduler' && message.source.scheduleId === scheduleId)
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
  private readonly removePreStep: () => void
  private readonly loop: Promise<void>

  constructor(
    private readonly ctx: Context,
    private readonly runtime: DirectorSchedulerRuntime,
    private readonly config: DirectorSchedulerConfig,
  ) {
    if (!Number.isSafeInteger(config.pollMs) || config.pollMs < 10) {
      throw new TypeError('Director scheduler pollMs must be an integer of at least 10 ms')
    }

    this.removePreStep = ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
      const wakes = messages.filter(isDirectorSchedulerWake)
      if (wakes.length !== 1 || messages.length !== 1) return next()

      const wake = wakes[0]!
      const source = wake.source
      if (source.kind !== 'd-ai-scheduler') return next()
      const key = scheduleKey(agent.id, source.scheduleId)

      if (this.active.has(key)) return { kind: 'reject' }

      this.active.add(key)
      try {
        await this.runtime.runScheduledDirectorCycle(
          agent,
          source.scheduleId,
          source.dueAt,
          signal,
        )
      } catch (error) {
        this.ctx.logger.warn(
          'D_AI unattended Director cycle failed for plan '
          + source.planId
          + ': '
          + (error instanceof Error ? error.message : String(error)),
        )
      } finally {
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
        this.scan(Date.now())
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

    for (const agent of this.ctx.agents.roots()) {
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

      for (const schedule of ledger.schedules) {
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
    await this.loop
  }
}
