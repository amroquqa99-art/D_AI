/** Durable D_AI task ledger projected from append-only Session facts. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { buildTaskGraph, transitionTask, type MissionTask, type TaskState } from './task-dag.ts'

const identity = z.string().min(1).max(240)
const systemId = z.enum([
  'investigation',
  'scientific-research',
  'investor',
  'cybersecurity',
  'operations-intelligence',
  'innovation-discovery',
])
const taskState = z.enum([
  'PENDING',
  'READY',
  'RUNNING',
  'WAITING_FOR_HUMAN',
  'WAITING_FOR_TOOL',
  'BLOCKED_POLICY',
  'BLOCKED_BUDGET',
  'PAUSED',
  'FAILED',
  'COMPLETED',
  'CANCELLED',
])

export const durableTaskSchema = z.object({
  id: identity,
  missionId: identity,
  systemId,
  title: z.string().min(1).max(4000),
  dependsOn: z.array(identity),
  state: taskState,
  priority: z.number().int(),
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
}).strict()

export const durableTaskLedgerSchema = z.object({
  ownerAgentId: identity,
  revision: z.number().int().nonnegative(),
  tasks: z.array(durableTaskSchema),
}).strict()

export type DurableTaskLedger = z.infer<typeof durableTaskLedgerSchema>

export const taskLedgerFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum(['ADD_TASKS', 'TRANSITION']),
  actorId: identity,
  ledger: durableTaskLedgerSchema,
}).strict()

export type TaskLedgerFact = z.infer<typeof taskLedgerFactSchema>
export interface TaskLedgerState {
  readonly ledgers: readonly DurableTaskLedger[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change D_AI task-ledger fact retaining dependency DAG state, retries and human/tool/policy/budget blocking states for deterministic restart. */
    'd_ai/task-ledger-fact': TaskLedgerFact
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiTaskLedger: TaskLedgerState }
  interface SessionProjectionMap { daiTaskLedger: TaskLedgerState }
}

const stateSchema: z.ZodType<TaskLedgerState> = z.object({
  ledgers: z.array(durableTaskLedgerSchema),
  failure: z.string().optional(),
}).strict()

function validateLedger(ledger: DurableTaskLedger): void {
  buildTaskGraph(ledger.tasks as readonly MissionTask[])
}

export function projectTaskLedgerFact(state: TaskLedgerState, event: SessionEvent): TaskLedgerState {
  if (state.failure !== undefined || event.type !== 'd_ai/task-ledger-fact') return state
  try {
    const fact = taskLedgerFactSchema.parse(event.data)
    if (fact.actorId !== fact.ledger.ownerAgentId) throw new Error('task ledger actor does not own ledger')
    validateLedger(fact.ledger)

    const prior = state.ledgers.find(item => item.ownerAgentId === fact.ledger.ownerAgentId)
    if ((prior?.revision ?? 0) + 1 !== fact.ledger.revision) throw new Error('task ledger revision is not contiguous')

    if (prior !== undefined) {
      const priorById = new Map(prior.tasks.map(task => [task.id, task]))
      const nextById = new Map(fact.ledger.tasks.map(task => [task.id, task]))
      for (const previous of prior.tasks) {
        const next = nextById.get(previous.id)
        if (next === undefined) throw new Error('durable task disappeared')
        for (const field of ['id', 'missionId', 'systemId', 'title', 'dependsOn', 'priority', 'maxAttempts'] as const) {
          if (JSON.stringify(next[field]) !== JSON.stringify(previous[field])) throw new Error('immutable durable task field changed: ' + field)
        }
        if (fact.operation === 'ADD_TASKS' && JSON.stringify(next) !== JSON.stringify(previous)) {
          throw new Error('ADD_TASKS cannot mutate an existing task')
        }
        if (fact.operation === 'TRANSITION' && next.state !== previous.state) {
          const expected = transitionTask(previous as MissionTask, next.state as TaskState)
          if (expected.attempt !== next.attempt) throw new Error('durable task retry accounting is invalid')
        } else if (fact.operation === 'TRANSITION' && next.attempt !== previous.attempt) {
          throw new Error('durable task attempt changed without a state transition')
        }
      }
      if (fact.operation === 'TRANSITION' && fact.ledger.tasks.length !== prior.tasks.length) {
        throw new Error('TRANSITION cannot add tasks')
      }
      if (priorById.size !== prior.tasks.length || nextById.size !== fact.ledger.tasks.length) throw new Error('duplicate durable task identity')
    }

    return {
      ledgers: [...state.ledgers.filter(item => item.ownerAgentId !== fact.ledger.ownerAgentId), fact.ledger],
    }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

export const taskLedgerProjection = {
  key: 'daiTaskLedger',
  stateVersion: 1,
  stateSchema,
  init: () => ({ ledgers: [] }),
  apply: projectTaskLedgerFact,
  wire: { viewSchema: stateSchema, view: (state: TaskLedgerState) => state },
} satisfies ProjectionDefinition<'daiTaskLedger', TaskLedgerState>
