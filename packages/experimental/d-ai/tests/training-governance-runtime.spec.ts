/** Local Intelligence Core governed training pipeline integration tests. */
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
import Approval, { type ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { describe, expect, it } from 'vitest'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import DAI from '../src/index.ts'
import type { TrainingState } from '../src/training-state.ts'

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
  await ctx.plugin(Approval, { policy: 'ask' })
  await ctx.plugin(DAI, { allowedTools: [] })

  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

async function temporary<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-training-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

describe('D_AI governed Local Intelligence Core training pipeline', () => {
  it('persists eligibility decisions and versioned dataset lineage without raw training payloads', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))

    const agent = await ctx.agentLoop.create(SessionId('training-owner'), { provider: 'mock', model: 'fixture' })
    const ledger = () => ctx.dai.readTraining(agent).ledgers[0]!

    script.push(
      toolCallResponse('train-candidate', 'd_ai_training_register_candidate', {
        project_id: 'project-1',
        artifact_ref: 'artifact://governed/train-001.jsonl',
        source_type: 'expert-correction',
        sensitivity: 'INTERNAL',
        explicit_training_opt_in: true,
        ownership_allows_training: true,
        license_allows_training: true,
        contains_secret: false,
        contains_personal_data: false,
        personal_data_redacted: false,
        quality_score: 0.95,
      }),
      toolCallResponse('holdout-candidate', 'd_ai_training_register_candidate', {
        project_id: 'project-1',
        artifact_ref: 'artifact://governed/holdout-001.jsonl',
        source_type: 'evaluation',
        sensitivity: 'INTERNAL',
        explicit_training_opt_in: true,
        ownership_allows_training: true,
        license_allows_training: true,
        contains_secret: false,
        contains_personal_data: false,
        personal_data_redacted: false,
        quality_score: 0.92,
      }),
      toolCallResponse('rejected-candidate', 'd_ai_training_register_candidate', {
        project_id: 'project-1',
        artifact_ref: 'artifact://governed/restricted-001.jsonl',
        source_type: 'tool-trace',
        sensitivity: 'RESTRICTED',
        explicit_training_opt_in: true,
        ownership_allows_training: true,
        license_allows_training: true,
        contains_secret: true,
        contains_personal_data: false,
        personal_data_redacted: false,
        quality_score: 0.99,
      }),
      () => toolCallResponse('dataset', 'd_ai_training_build_dataset', {
        dataset_id: 'dai-core-domain-v1',
        version: 1,
        candidate_ids: ledger().candidates[0]!.candidate.id,
        holdout_candidate_ids: ledger().candidates[1]!.candidate.id,
      }),
      textResponse('Governed training metadata updated'),
    )

    let expected: TrainingState
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Register the approved governed training artifacts and build the approved dataset lineage.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      expected = ctx.dai.readTraining(agent)
      const stored = expected.ledgers[0]!
      expect(stored.revision).toBe(4)
      expect(stored.candidates).toHaveLength(3)
      expect(stored.candidates[0]?.eligibility).toMatchObject({ decision: 'ELIGIBLE', reasons: [] })
      expect(stored.candidates[1]?.eligibility).toMatchObject({ decision: 'ELIGIBLE', reasons: [] })
      expect(stored.candidates[2]?.eligibility.decision).toBe('REJECTED')
      expect(stored.candidates[2]?.eligibility.reasons).toEqual(expect.arrayContaining(['contains-secret', 'restricted-data']))
      expect(stored.datasets[0]?.lineage).toMatchObject({
        datasetId: 'dai-core-domain-v1',
        version: 1,
        candidateIds: [stored.candidates[0]?.candidate.id],
        holdoutCandidateIds: [stored.candidates[1]?.candidate.id],
        policyVersion: 1,
      })

      const serialized = JSON.stringify(stored)
      expect(serialized).toContain('artifact://governed/train-001.jsonl')
      expect(serialized).not.toContain('"content":')
      expect(serialized).not.toContain('"rawContent":')
      await ctx.sessions.flush(agent.session)
    } finally {
      await ctx.fiber.dispose()
    }

    const second = await boot(root, [])
    try {
      const handle = await second.ctx.agents.resume({
        resumeSessionId: SessionId('training-owner'),
        agentOptions: { provider: 'mock', model: 'fixture' },
      })
      expect(second.ctx.dai.readTraining(handle.agent)).toEqual(expected!)
      await handle.dispose()
    } finally {
      await second.ctx.fiber.dispose()
    }
  }), 15000)

  it('fails closed when candidate registration is not human-approved', async () => temporary(async root => {
    const { ctx } = await boot(root, [
      toolCallResponse('candidate', 'd_ai_training_register_candidate', {
        project_id: 'project-1',
        artifact_ref: 'artifact://governed/not-approved.jsonl',
        source_type: 'artifact',
        sensitivity: 'PUBLIC',
        explicit_training_opt_in: true,
        ownership_allows_training: true,
        license_allows_training: true,
        contains_secret: false,
        contains_personal_data: false,
        personal_data_redacted: false,
        quality_score: 0.9,
      }),
      textResponse('Registration was not approved'),
    ])

    try {
      const agent = await ctx.agentLoop.create(SessionId('training-owner'), { provider: 'mock', model: 'fixture' })
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Inspect the training governance state.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()
      expect(ctx.dai.readTraining(agent).ledgers).toEqual([])
      expect(agent.session.snapshotEvents().filter(event => event.type === 'approval/decided')).toHaveLength(1)
    } finally {
      await ctx.fiber.dispose()
    }
  }))

  it('rejects dataset construction when a rejected candidate is selected', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))
    const agent = await ctx.agentLoop.create(SessionId('training-owner'), { provider: 'mock', model: 'fixture' })
    const ledger = () => ctx.dai.readTraining(agent).ledgers[0]!

    script.push(
      toolCallResponse('rejected', 'd_ai_training_register_candidate', {
        project_id: 'project-2',
        artifact_ref: 'artifact://governed/rejected.jsonl',
        source_type: 'conversation',
        sensitivity: 'CONFIDENTIAL',
        explicit_training_opt_in: false,
        ownership_allows_training: true,
        license_allows_training: true,
        contains_secret: false,
        contains_personal_data: false,
        personal_data_redacted: false,
        quality_score: 0.95,
      }),
      toolCallResponse('holdout', 'd_ai_training_register_candidate', {
        project_id: 'project-2',
        artifact_ref: 'artifact://governed/holdout.jsonl',
        source_type: 'evaluation',
        sensitivity: 'PUBLIC',
        explicit_training_opt_in: true,
        ownership_allows_training: true,
        license_allows_training: true,
        contains_secret: false,
        contains_personal_data: false,
        personal_data_redacted: false,
        quality_score: 0.95,
      }),
      () => toolCallResponse('bad-dataset', 'd_ai_training_build_dataset', {
        dataset_id: 'bad-dataset',
        version: 1,
        candidate_ids: ledger().candidates[0]!.candidate.id,
        holdout_candidate_ids: ledger().candidates[1]!.candidate.id,
      }),
      textResponse('Rejected candidate was not admitted'),
    )

    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Register metadata, but do not bypass training policy.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()
      const state = ctx.dai.readTraining(agent)
      expect(state.ledgers[0]?.candidates[0]?.eligibility.decision).toBe('REJECTED')
      expect(state.ledgers[0]?.datasets).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  }))
})
