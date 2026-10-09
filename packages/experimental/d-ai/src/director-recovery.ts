/** Explicit cold root recovery through native projections and single-writer Agent ownership. */
import type { Context } from '@deepseek-ai/cordis'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import type { DirectorResumeOwner } from './config.ts'
import { isDirectorSchedulerWake, shouldWakeDirectorSchedule, type DirectorSchedulerRecovery } from './director-scheduler.ts'
import { selectDurableRunnableTasks } from './runtime-scheduler.ts'
import { deriveMissionPhase } from './mission-director.ts'

/**
 * Recover only configured root owners with useful approved schedules. Native
 * resume holds exclusive write ownership and repairs interrupted turn tails.
 * No D_AI fact is appended by this background coordinator.
 */
export class DirectorOwnerRecovery implements DirectorSchedulerRecovery {
  private readonly handles = new Map<string, AgentHandle>()
  private readonly observations = new Map<string, { revision: string; eligibleAt: number }>()

  constructor(private readonly ctx: Context, private readonly owners: readonly DirectorResumeOwner[]) {}

  private eligibleAt(session: Session): number {
    if (session.header.parentSession !== undefined || session.header.isSeeded) return Infinity
    const inbox = this.ctx.sessionProjections.stateOf(session, 'inbox')
    if (inbox === undefined) return Infinity
    const pending = [...inbox['next-turn'], ...inbox['next-step']]
    const first = pending[0]
    if (pending.length > 1 || (first !== undefined && !isDirectorSchedulerWake(first))) return Infinity

    const schedules = this.ctx.sessionProjections.stateOf(session, 'daiDirectorSchedule')
    const director = this.ctx.sessionProjections.stateOf(session, 'daiDirector')
    const tasks = this.ctx.sessionProjections.stateOf(session, 'daiTaskLedger')
    const budgets = this.ctx.sessionProjections.stateOf(session, 'daiBudgets')
    const execution = this.ctx.sessionProjections.stateOf(session, 'daiExecution')
    if (schedules === undefined || director === undefined || tasks === undefined
      || budgets === undefined || execution === undefined
      || [schedules, director, tasks, budgets, execution].some(state => state.failure !== undefined)) return Infinity

    const owner = session.id
    const plans = director.ledgers.find(ledger => ledger.ownerAgentId === owner)?.plans ?? []
    const taskLedger = tasks.ledgers.find(ledger => ledger.ownerAgentId === owner)
    if (taskLedger === undefined) return Infinity
    const profiles = budgets.ledgers.find(ledger => ledger.ownerAgentId === owner)?.profiles ?? []
    const leases = execution.ledgers.find(ledger => ledger.ownerAgentId === owner)?.leases ?? []
    let earliest = Infinity
    for (const schedule of schedules.ledgers.find(ledger => ledger.ownerAgentId === owner)?.schedules ?? []) {
      const plan = plans.find(candidate => candidate.id === schedule.planId)
      if (plan === undefined) continue
      const scoped = { ...taskLedger, tasks: taskLedger.tasks.filter(task => task.missionId === plan.id) }
      const next = selectDurableRunnableTasks(scoped, 1, profiles)
      const pendingLeases = leases.filter(lease => lease.releasedAt === undefined
        && scoped.tasks.some(task => task.id === lease.taskId))
      const candidate = Math.max(Date.parse(schedule.nextWakeAt), next.selected.length > 0
        ? 0 : Math.min(...pendingLeases.map(lease => Date.parse(lease.expiresAt))))
      const view = { plan, tasks: scoped.tasks, next, phase: deriveMissionPhase(plan.status, scoped.tasks) }
      if (Number.isFinite(candidate) && shouldWakeDirectorSchedule(schedule, view, execution, candidate)) {
        earliest = Math.min(earliest, candidate)
      }
    }
    return earliest
  }

  /**
   * Inspect cold configured owners serially; unchanged ineligible logs use an
   * opaque persistence revision cache. Revalidate after native write acquisition
   * at publication so concurrent human input cannot be activated accidentally.
   * @param nowMs - current scheduling time.
   * @param signal - cancellation checked across storage and resume awaits.
   * @param maxOwners - free scheduler slots shared with live cycles and wakes.
   * @returns resolution once this bounded activation pass settles.
   */
  async scan(nowMs: number, signal: AbortSignal, maxOwners: number): Promise<void> {
    const persistence = this.ctx.get('sessionPersistence')
    if (persistence === undefined) throw new Error('D_AI cold recovery requires session persistence')
    let remaining = maxOwners
    for (const route of this.owners) {
      if (remaining <= 0) return
      signal.throwIfAborted()
      if (this.ctx.agents.get(SessionId(route.sessionId)) !== undefined) continue
      try {
        const id = SessionId(route.sessionId)
        const snapshot = await persistence.stat(id, { signal })
        signal.throwIfAborted()
        if (snapshot === undefined) continue
        const cached = this.observations.get(route.sessionId)
        if (cached !== undefined && cached.revision === snapshot.revision && cached.eligibleAt > nowMs) continue
        const reader = await persistence.open(id, 'read', { signal })
        let eligibleAt: number
        try {
          const read = await reader.read(0, route.maxEvents + 1, { signal })
          signal.throwIfAborted()
          if (read.events.length > route.maxEvents) {
            eligibleAt = Infinity
          } else {
            const session = this.ctx.sessions.prepare(id, {
              seed: read.events, meta: reader.header,
              inheritedEventCount: reader.inheritedEventCount, eventState: read.eventState,
            })
            eligibleAt = this.eligibleAt(session)
          }
        } finally {
          await reader.close()
        }
        this.observations.set(route.sessionId, { revision: snapshot.revision, eligibleAt })
        signal.throwIfAborted()
        if (eligibleAt > nowMs) continue
        const handle = await this.ctx.agents.withoutInitiator(() => this.ctx.agents.resume({
          resumeSessionId: id, agentOptions: { provider: route.provider, model: route.model }, signal,
          setup: (_agentCtx, agent) => ({ commit: () => {
            if (agent.session.seq > route.maxEvents || this.eligibleAt(agent.session) > nowMs) throw new Error('D_AI cold owner is no longer eligible')
          } }),
        }))
        this.handles.set(route.sessionId, handle)
        remaining -= 1
        // Resume reconstructs pending input but does not wake the driver. Keep
        // the same schedule message identity while using native Inbox commands.
        const pending = [...handle.agent.inbox.nextTurn, ...handle.agent.inbox.nextStep]
        const wake = pending[0]
        if (pending.length === 1 && wake !== undefined && isDirectorSchedulerWake(wake)
          && handle.agent.inbox.remove(wake.id)) handle.agent.followup(wake)
      } catch (error) {
        if (signal.aborted) throw error
        this.ctx.logger.warn('D_AI could not recover owner ' + route.sessionId + ': '
          + (error instanceof Error ? error.message : String(error)))
      }
    }
  }

  /** Stop and drain acquired roots; pre-existing live Agents are never disposed here. */
  async dispose(): Promise<void> {
    const results = await Promise.allSettled([...this.handles.values()].map(handle => handle.dispose()))
    this.handles.clear()
    this.observations.clear()
    const failures: unknown[] = []
    for (const result of results) if (result.status === 'rejected') failures.push(result.reason)
    if (failures.length > 0) throw new AggregateError(failures, 'D_AI cold owner teardown failed')
  }
}
