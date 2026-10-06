/** Native authorized Cybersecurity vertical-slice integration tests. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
import { describe, expect, it } from 'vitest'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import DAI from '../src/index.ts'
import type { CyberState } from '../src/cyber-state.ts'

async function boot(root: string, script: ConstructorParameters<typeof MockAdapter>[0]) {
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
  await ctx.plugin(Approval, { policy: 'never' })
  await ctx.plugin(DAI, { allowedTools: [] })

  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

async function temporary<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-cyber-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI Cybersecurity native slice', () => {
  it('persists authorization scope, finding, remediation, retest and independent review', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    const manager = await ctx.agentLoop.create(SessionId('cyber-owner'), { provider: 'mock', model: 'fixture' })
    const objective = 'Review the owned application for defensive weaknesses'
    const engagement = () => ctx.dai.readCybersecurity(manager).engagements[0]!

    script.push(
      toolCallResponse('create', 'd_ai_cyber_create', {
        objective,
        target_description: 'Owned staging application',
        permitted_actions: 'code review,configuration review,safe retest',
        approved_by: 'security-owner',
        issued_at: '2026-10-06T00:00:00Z',
        expires_at: '2026-10-07T00:00:00Z',
      }),
      () => toolCallResponse('finding', 'd_ai_cyber_add_finding', {
        engagement_id: engagement().id,
        title: 'Overly broad service permission',
        severity: 'HIGH',
        evidence: 'Configuration grants the service more permissions than required.',
        remediation: 'Reduce the service role to the minimum required permissions.',
      }),
      () => toolCallResponse('delegate', 'd_ai_cyber_delegate', { engagement_id: engagement().id }),
      textResponse('Assessment worker confirms the defensive finding within the recorded scope.'),
      textResponse('Remediation reviewer proposes least-privilege change and safe retest criteria.'),
      () => toolCallResponse('remediate', 'd_ai_cyber_record_remediation', {
        engagement_id: engagement().id,
        finding_id: engagement().findings[0]!.id,
        remediation_note: 'Role permissions reduced to the documented minimum.',
      }),
      () => toolCallResponse('retest', 'd_ai_cyber_record_retest', {
        engagement_id: engagement().id,
        finding_id: engagement().findings[0]!.id,
        retest_evidence: 'Configuration review confirms the excessive permissions are absent.',
      }),
      textResponse('Cybersecurity engagement updated'),
    )

    let expected: CyberState
    try {
      manager.followup(createUserMessage({ content: [{ type: 'text', text: objective }], source: { kind: 'user' } }))
      await manager.whenIdle()
      expected = ctx.dai.readCybersecurity(manager)
      expect(expected.engagements[0]?.revision).toBe(5)
      expect(expected.engagements[0]?.authorization.targetDescription).toBe('Owned staging application')
      expect(expected.engagements[0]?.findings[0]?.status).toBe('RETEST_PASSED')
      expect(expected.engagements[0]?.delegations[0]?.assessment.agentId)
        .not.toBe(expected.engagements[0]?.delegations[0]?.remediationReview.agentId)
      await ctx.sessions.flush(manager.session)
    } finally {
      await ctx.fiber.dispose()
    }

    const second = await boot(root, [])
    try {
      const handle = await second.ctx.agents.resume({
        resumeSessionId: SessionId('cyber-owner'),
        agentOptions: { provider: 'mock', model: 'fixture' },
      })
      expect(second.ctx.dai.readCybersecurity(handle.agent)).toEqual(expected!)
      await handle.dispose()
    } finally {
      await second.ctx.fiber.dispose()
    }
  }), 15000)

  it('does not expose unrestricted intrusion or persistence tools in this defensive slice', async () => temporary(async root => {
    const { ctx, adapter } = await boot(root, [textResponse('Capabilities inspected')])
    try {
      const agent = await ctx.agentLoop.create(SessionId('cyber-owner'), { provider: 'mock', model: 'fixture' })
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Inspect cybersecurity capabilities' }], source: { kind: 'user' } }))
      await agent.whenIdle()
      const tools = adapter.requests[0]?.tools?.map(tool => tool.name) ?? []
      expect(tools).toContain('d_ai_cyber_create')
      expect(tools.some(name => /intrude|persistence|credential_steal|exploit_external/i.test(name))).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  }))
})
