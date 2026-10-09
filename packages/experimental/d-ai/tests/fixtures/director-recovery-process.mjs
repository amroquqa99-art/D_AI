/** Test-only native host; inference is scripted, persistence and ownership are real. */
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as DomainStorage from '@deepseek-ai/dsh-storage-domain'
import WebRuntime from '@deepseek-ai/dsh-web'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import Approval from '@deepseek-ai/dsh-user-approval'
import DAI from '../../lib/index.js'
import { MockAdapter, textResponse, toolCallResponse } from '../../../../core/agent-loop/tests/mock-adapter.ts'

const [mode, root] = process.argv.slice(2)
if (!['running', 'claim-gap', 'recover'].includes(mode) || root === undefined || process.send === undefined) {
  throw new Error('Expected test mode, private root and IPC channel')
}
const id = SessionId('process-crash-owner')
const ctx = new Context()
await mountAgentLoopTestDependencies(ctx)
await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
await ctx.plugin(AgentLoop, { agents: [] })
await ctx.plugin(Storage)
await ctx.plugin(JsonStorage, { root: join(root, 'data') })
await ctx.plugin(DomainStorage, { backend: 'json' })
await ctx.plugin(WebRuntime)
await ctx.plugin(Subagents)
await ctx.plugin(Spawn, { providerName: 'spawn' })
await ctx.plugin(Approval, { policy: 'ask' })
ctx.on('approval/request', async () => 'allowed-once')
const script = []
const adapter = new MockAdapter(script)
ctx.llm.registerAdapter(['mock'], adapter)
await ctx.plugin(DAI, {
  allowedTools: [], directorSchedulerEnabled: true, directorSchedulerPollMs: 10,
  directorSchedulerResumeOwners: mode === 'recover'
    ? [{ sessionId: id, provider: 'mock', model: 'fixture', maxEvents: 10000 }] : [],
})

function snapshot(agent) {
  return {
    task: ctx.dai.readTaskLedger(agent).ledgers[0]?.tasks[0],
    leases: ctx.dai.readExecution(agent).ledgers[0]?.leases,
    schedule: ctx.dai.readDirectorSchedule(agent).ledgers[0]?.schedules[0],
    requests: adapter.requests.length,
  }
}

if (mode !== 'recover') {
  const agent = await ctx.agentLoop.create(id, { provider: 'mock', model: 'fixture' })
  const plan = () => ctx.dai.readDirector(agent).ledgers[0].plans[0]
  if (mode === 'claim-gap') {
    const flush = ctx.sessions.flush.bind(ctx.sessions)
    ctx.sessions.flush = async (session, ...args) => {
      await flush(session, ...args)
      const state = snapshot(agent)
      if (session.id === id && state.task?.state === 'READY' && state.leases?.length === 1) {
        await ctx.sessionPersistence.flush()
        process.send({ stage: 'claim-gap', ...state })
        // Hold the exact durable gap; the parent kills without graceful cleanup.
        await new Promise(() => {})
      }
    }
  }

  script.push(
    toolCallResponse('plan', 'd_ai_director_plan_create', {
      objective: 'Recover a genuinely interrupted task', primary_system: 'investigation',
    }),
    () => toolCallResponse('task', 'd_ai_director_task_add', {
      plan_id: plan().id, system_id: 'investigation', title: 'Complete after process crash',
    }),
    () => toolCallResponse('schedule', 'd_ai_director_schedule_set', {
      plan_id: plan().id, enabled: true, interval_ms: 10,
      max_tasks_per_cycle: 1, lease_ttl_ms: 2000, start_immediately: true,
    }), textResponse('Approved schedule configured'), 'hang',
  )
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Configure the approved task' }], source: { kind: 'user' } }))
  while (adapter.requests.length < 5) await sleep(10)
  await ctx.sessionPersistence.flush()
  process.send({ stage: 'running', ...snapshot(agent) })
  // The parent kills this process while its native child and lease are active.
  await new Promise(() => {})
} else {
  script.push(textResponse(JSON.stringify({
    outcome: 'COMPLETED', summary: 'Completed after abrupt process restart.', artifactRefs: [],
  })))
  let agent
  while (true) {
    agent = ctx.agents.get(id)
    if (agent !== undefined && snapshot(agent).task?.state === 'COMPLETED') break
    await sleep(10)
  }
  await agent.whenIdle()
  await ctx.sessionPersistence.flush()
  process.send({ stage: 'recovered', ...snapshot(agent) })
  await ctx.fiber.dispose()
  process.disconnect()
}
