/** Durable unattended Mission Director schedule metadata. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const identity = z.string().min(1).max(240)

export const directorScheduleCycleSchema = z.object({
  attemptedAt: z.string().datetime(),
  outcome: z.enum(['EXECUTED', 'TASK_FAILED', 'IDLE', 'FAILED']),
  executedTasks: z.number().int().nonnegative(),
  phase: z.enum([
    'PLANNING',
    'EXECUTING',
    'WAITING_FOR_HUMAN',
    'BLOCKED',
    'PAUSED',
    'COMPLETE',
  ]),
  error: z.string().min(1).max(12000).optional(),
}).strict()

export const directorScheduleSchema = z.object({
  id: identity,
  planId: identity,
  ownerAgentId: identity,
  enabled: z.boolean(),
  intervalMs: z.number().int().positive(),
  maxTasksPerCycle: z.number().int().min(1).max(8),
  maxParallelTasks: z.number().int().min(1).max(8).default(1),
  maxConsecutiveFailures: z.number().int().nonnegative().default(0),
  maxConsecutiveIdleCycles: z.number().int().nonnegative().default(0),
  consecutiveFailures: z.number().int().nonnegative().default(0),
  consecutiveIdleCycles: z.number().int().nonnegative().default(0),
  leaseTtlMs: z.number().int().positive(),
  nextWakeAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastCycle: directorScheduleCycleSchema.optional(),
}).strict()

export const directorScheduleLedgerSchema = z.object({
  ownerAgentId: identity,
  revision: z.number().int().nonnegative(),
  schedules: z.array(directorScheduleSchema),
}).strict()

export type DirectorScheduleCycle = z.infer<typeof directorScheduleCycleSchema>
export type DirectorSchedule = z.infer<typeof directorScheduleSchema>
export type DirectorScheduleStagnationReason = 'FAILURE_LIMIT' | 'IDLE_LIMIT'

export function directorScheduleStagnationReason(
  schedule: DirectorSchedule,
): DirectorScheduleStagnationReason | undefined {
  if (schedule.maxConsecutiveFailures > 0
    && schedule.consecutiveFailures >= schedule.maxConsecutiveFailures) {
    return 'FAILURE_LIMIT'
  }
  if (schedule.maxConsecutiveIdleCycles > 0
    && schedule.consecutiveIdleCycles >= schedule.maxConsecutiveIdleCycles) {
    return 'IDLE_LIMIT'
  }
  return undefined
}

export type DirectorScheduleLedger = z.infer<typeof directorScheduleLedgerSchema>

export const directorScheduleFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum(['UPSERT', 'RECORD_CYCLE']),
  actorId: identity,
  ledger: directorScheduleLedgerSchema,
}).strict()

export type DirectorScheduleFact = z.infer<typeof directorScheduleFactSchema>
export interface DirectorScheduleState {
  readonly ledgers: readonly DirectorScheduleLedger[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change unattended Director schedule ledger; wake timing is durable while execution still occurs only inside a native Agent turn. */
    'd_ai/director-schedule-fact': DirectorScheduleFact
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiDirectorSchedule: DirectorScheduleState }
  interface SessionProjectionMap { daiDirectorSchedule: DirectorScheduleState }
}

const stateSchema: z.ZodType<DirectorScheduleState> = z.object({
  ledgers: z.array(directorScheduleLedgerSchema),
  failure: z.string().optional(),
}).strict()

function assertSchedule(schedule: DirectorSchedule): void {
  if (schedule.intervalMs < 10) throw new Error('Director schedule interval must be at least 10 ms')
  if (schedule.maxParallelTasks > schedule.maxTasksPerCycle) {
    throw new Error('Director schedule parallelism cannot exceed maxTasksPerCycle')
  }
  if (schedule.leaseTtlMs <= schedule.intervalMs) {
    throw new Error('Director schedule lease TTL must exceed its interval')
  }
  if (schedule.lastCycle?.outcome === 'FAILED' && schedule.lastCycle.error === undefined) {
    throw new Error('failed Director schedule cycle requires an error')
  }
  if (schedule.lastCycle?.outcome !== 'FAILED' && schedule.lastCycle?.error !== undefined) {
    throw new Error('non-failed Director schedule cycle cannot carry an error')
  }
}

export function projectDirectorScheduleFact(
  state: DirectorScheduleState,
  event: SessionEvent,
): DirectorScheduleState {
  if (state.failure !== undefined || event.type !== 'd_ai/director-schedule-fact') return state

  try {
    const fact = directorScheduleFactSchema.parse(event.data)
    if (fact.actorId !== fact.ledger.ownerAgentId) {
      throw new Error('Director schedule fact actor does not own ledger')
    }
    if (new Set(fact.ledger.schedules.map(item => item.id)).size !== fact.ledger.schedules.length) {
      throw new Error('duplicate Director schedule identity')
    }
    if (new Set(fact.ledger.schedules.map(item => item.planId)).size !== fact.ledger.schedules.length) {
      throw new Error('one Director plan can have only one unattended schedule')
    }
    for (const schedule of fact.ledger.schedules) assertSchedule(schedule)

    const prior = state.ledgers.find(item => item.ownerAgentId === fact.ledger.ownerAgentId)
    if ((prior?.revision ?? 0) + 1 !== fact.ledger.revision) {
      throw new Error('Director schedule ledger revision is not contiguous')
    }

    if (prior !== undefined) {
      if (fact.ledger.schedules.length < prior.schedules.length
        || fact.ledger.schedules.length > prior.schedules.length + 1) {
        throw new Error('Director schedule ledger cannot remove schedules or append more than one at once')
      }

      const before = new Map(prior.schedules.map(item => [item.id, item]))
      const after = new Map(fact.ledger.schedules.map(item => [item.id, item]))
      const added = fact.ledger.schedules.filter(item => !before.has(item.id))
      const changed = prior.schedules.filter(item => {
        const next = after.get(item.id)
        return next === undefined || JSON.stringify(next) !== JSON.stringify(item)
      })

      if (fact.operation === 'UPSERT') {
        if (added.length + changed.length !== 1) {
          throw new Error('UPSERT must add or update exactly one Director schedule')
        }
        if (added.length === 1 && fact.ledger.schedules.length !== prior.schedules.length + 1) {
          throw new Error('new Director schedule must append exactly one entry')
        }
        for (const previous of changed) {
          const next = after.get(previous.id)
          if (next === undefined) throw new Error('Director schedule disappeared during UPSERT')
          for (const field of ['id', 'planId', 'ownerAgentId', 'createdAt'] as const) {
            if (next[field] !== previous[field]) {
              throw new Error('immutable Director schedule field changed: ' + field)
            }
          }
          if (JSON.stringify(next.lastCycle) !== JSON.stringify(previous.lastCycle)) {
            throw new Error('UPSERT cannot rewrite the last cycle receipt')
          }
          const countersChanged = next.consecutiveFailures !== previous.consecutiveFailures
            || next.consecutiveIdleCycles !== previous.consecutiveIdleCycles
          if (countersChanged
            && (next.consecutiveFailures !== 0 || next.consecutiveIdleCycles !== 0)) {
            throw new Error('UPSERT may only preserve or reset stagnation counters')
          }
        }
      } else {
        if (added.length !== 0 || changed.length !== 1) {
          throw new Error('RECORD_CYCLE must update exactly one existing Director schedule')
        }
        const previous = changed[0]!
        const next = after.get(previous.id)!
        for (const field of [
          'id',
          'planId',
          'ownerAgentId',
          'enabled',
          'intervalMs',
          'maxTasksPerCycle',
          'maxParallelTasks',
          'maxConsecutiveFailures',
          'maxConsecutiveIdleCycles',
          'leaseTtlMs',
          'createdAt',
        ] as const) {
          if (next[field] !== previous[field]) {
            throw new Error('RECORD_CYCLE cannot change Director schedule configuration: ' + field)
          }
        }
        if (next.lastCycle === undefined
          || Date.parse(next.updatedAt) < Date.parse(previous.updatedAt)
          || Date.parse(next.nextWakeAt) <= Date.parse(next.lastCycle.attemptedAt)) {
          throw new Error('invalid Director schedule cycle timing')
        }
        const expectedFailures = next.lastCycle.outcome === 'FAILED'
          ? previous.consecutiveFailures + 1
          : 0
        const expectedIdleCycles = next.lastCycle.outcome === 'IDLE'
          ? previous.consecutiveIdleCycles + 1
          : 0
        if (next.consecutiveFailures !== expectedFailures
          || next.consecutiveIdleCycles !== expectedIdleCycles) {
          throw new Error('Director schedule stagnation counters do not match the cycle outcome')
        }
      }
    } else {
      if (fact.ledger.revision !== 1
        || fact.operation !== 'UPSERT'
        || fact.ledger.schedules.length !== 1) {
        throw new Error('Director schedule ledger must begin with one UPSERT')
      }
      const initial = fact.ledger.schedules[0]!
      if (initial.lastCycle !== undefined
        || initial.consecutiveFailures !== 0
        || initial.consecutiveIdleCycles !== 0) {
        throw new Error('new Director schedule cannot contain historical cycle state')
      }
    }

    return {
      ledgers: [
        ...state.ledgers.filter(item => item.ownerAgentId !== fact.ledger.ownerAgentId),
        fact.ledger,
      ],
    }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

export const directorScheduleProjection = {
  key: 'daiDirectorSchedule',
  stateVersion: 1,
  stateSchema,
  init: () => ({ ledgers: [] }),
  apply: projectDirectorScheduleFact,
  wire: { viewSchema: stateSchema, view: (state: DirectorScheduleState) => state },
} satisfies ProjectionDefinition<'daiDirectorSchedule', DirectorScheduleState>
