/** Local Intelligence Core governed model lifecycle integration tests. */
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
import type { ModelLifecycleState } from '../src/model-lifecycle-state.ts'

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
  const root = await mkdtemp(join(tmpdir(), 'd-ai-model-lifecycle-'))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

const eligibleCandidate = (artifactRef: string, sourceType: string) => ({
  project_id: 'core-training-project',
  artifact_ref: artifactRef,
  source_type: sourceType,
  sensitivity: 'INTERNAL',
  explicit_training_opt_in: true,
  ownership_allows_training: true,
  license_allows_training: true,
  contains_secret: false,
  contains_personal_data: false,
  personal_data_redacted: false,
  quality_score: 0.95,
})

describe('D_AI governed Local Intelligence Core model lifecycle', () => {
  it('records evaluations, recomputes promotions and persists rollback pointers without deploying a model', async () => temporary(async root => {
    const script: ConstructorParameters<typeof MockAdapter>[0] = []
    const { ctx } = await boot(root, script)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))
    const agent = await ctx.agentLoop.create(SessionId('lifecycle-owner'), { provider: 'mock', model: 'fixture' })
    const training = () => ctx.dai.readTraining(agent).ledgers[0]!
    const lifecycle = () => ctx.dai.readModelLifecycle(agent).ledgers[0]!

    script.push(
      toolCallResponse('train', 'd_ai_training_register_candidate', eligibleCandidate('artifact://train/core.jsonl', 'expert-correction')),
      toolCallResponse('holdout', 'd_ai_training_register_candidate', eligibleCandidate('artifact://holdout/core.jsonl', 'evaluation')),
      () => toolCallResponse('dataset', 'd_ai_training_build_dataset', {
        dataset_id: 'core-eval-v1',
        version: 1,
        candidate_ids: training().candidates[0]!.candidate.id,
        holdout_candidate_ids: training().candidates[1]!.candidate.id,
      }),
      toolCallResponse('baseline-eval', 'd_ai_model_evaluation_record', {
        model_id: 'core-baseline',
        dataset_id: 'core-eval-v1',
        holdout_id: 'holdout-v1',
        artifact_ref: 'artifact://eval/baseline.json',
        completed_at: '2026-10-06T08:00:00Z',
        independent_evaluator: 'evaluator-a',
        correctness: 0.84,
        domain_quality: 0.83,
        tool_use_reliability: 0.82,
        robustness: 0.84,
        safety: 0.94,
        latency_score: 0.7,
        efficiency_score: 0.7,
      }),
      toolCallResponse('candidate-eval', 'd_ai_model_evaluation_record', {
        model_id: 'core-candidate',
        dataset_id: 'core-eval-v1',
        holdout_id: 'holdout-v1',
        artifact_ref: 'artifact://eval/candidate.json',
        completed_at: '2026-10-06T08:10:00Z',
        independent_evaluator: 'evaluator-b',
        correctness: 0.9,
        domain_quality: 0.89,
        tool_use_reliability: 0.9,
        robustness: 0.88,
        safety: 0.97,
        latency_score: 0.72,
        efficiency_score: 0.76,
      }),
      toolCallResponse('weak-eval', 'd_ai_model_evaluation_record', {
        model_id: 'core-weak-candidate',
        dataset_id: 'core-eval-v1',
        holdout_id: 'holdout-v1',
        artifact_ref: 'artifact://eval/weak.json',
        completed_at: '2026-10-06T08:20:00Z',
        independent_evaluator: 'evaluator-c',
        correctness: 0.7,
        domain_quality: 0.75,
        tool_use_reliability: 0.68,
        robustness: 0.72,
        safety: 0.8,
        latency_score: 0.95,
        efficiency_score: 0.95,
      }),
      () => toolCallResponse('promote', 'd_ai_model_promotion_evaluate', {
        baseline_evaluation_id: lifecycle().evaluations[0]!.id,
        candidate_evaluation_id: lifecycle().evaluations[1]!.id,
        min_correctness: 0.82,
        min_domain_quality: 0.82,
        min_tool_use_reliability: 0.8,
        min_robustness: 0.8,
        min_safety: 0.92,
        max_allowed_regression: 0.03,
        require_distinct_evaluator: true,
      }),
      () => toolCallResponse('reject-promotion', 'd_ai_model_promotion_evaluate', {
        baseline_evaluation_id: lifecycle().evaluations[0]!.id,
        candidate_evaluation_id: lifecycle().evaluations[2]!.id,
        min_correctness: 0.82,
        min_domain_quality: 0.82,
        min_tool_use_reliability: 0.8,
        min_robustness: 0.8,
        min_safety: 0.92,
        max_allowed_regression: 0.03,
        require_distinct_evaluator: true,
      }),
      textResponse('Governed model lifecycle updated'),
    )

    let expected: ModelLifecycleState
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Record the approved evaluations and compute the governed promotion decisions.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      expected = ctx.dai.readModelLifecycle(agent)
      const ledger = expected.ledgers[0]!
      expect(ledger.revision).toBe(5)
      expect(ledger.evaluations).toHaveLength(3)
      expect(ledger.promotions).toHaveLength(2)

      expect(ledger.promotions[0]?.decision).toMatchObject({
        promote: true,
        baselineModelId: 'core-baseline',
        candidateModelId: 'core-candidate',
        reasons: [],
      })
      expect(ledger.promotions[0]?.release).toMatchObject({
        activeModelId: 'core-candidate',
        rollbackModelId: 'core-baseline',
        evaluationDatasetId: 'core-eval-v1',
      })

      expect(ledger.promotions[1]?.decision.promote).toBe(false)
      expect(ledger.promotions[1]?.decision.reasons).toEqual(expect.arrayContaining([
        'correctness-below-threshold',
        'safety-below-threshold',
      ]))
      expect(ledger.promotions[1]?.release).toBeUndefined()

      // Promotion records a governed decision and rollback pointer only.
      expect(ctx.dai.readModelRegistry(agent).registries).toEqual([])
      await ctx.sessions.flush(agent.session)
    } finally {
      await ctx.fiber.dispose()
    }

    const second = await boot(root, [])
    try {
      const handle = await second.ctx.agents.resume({
        resumeSessionId: SessionId('lifecycle-owner'),
        agentOptions: { provider: 'mock', model: 'fixture' },
      })
      expect(second.ctx.dai.readModelLifecycle(handle.agent)).toEqual(expected!)
      expect(second.ctx.dai.readModelRegistry(handle.agent).registries).toEqual([])
      await handle.dispose()
    } finally {
      await second.ctx.fiber.dispose()
    }
  }), 20000)

  it('fails evaluation recording when the governed dataset does not exist', async () => temporary(async root => {
    const { ctx } = await boot(root, [textResponse('No ungoverned evaluation recorded')])
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))
    try {
      const agent = await ctx.agentLoop.create(SessionId('lifecycle-owner'), { provider: 'mock', model: 'fixture' })
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Inspect lifecycle state.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      await expect(agent.runMaintenance(async () => ctx.dai.recordModelEvaluation(agent, {
        artifactRef: 'artifact://eval/missing.json',
        result: {
          modelId: 'candidate',
          datasetId: 'missing-dataset',
          holdoutId: 'holdout',
          completedAt: '2026-10-06T08:00:00Z',
          independentEvaluator: 'evaluator',
          metrics: {
            correctness: 0.9,
            domainQuality: 0.9,
            toolUseReliability: 0.9,
            robustness: 0.9,
            safety: 0.9,
            latencyScore: 0.9,
            efficiencyScore: 0.9,
          },
        },
      }))).rejects.toThrow('existing governed dataset')
      expect(ctx.dai.readModelLifecycle(agent).ledgers).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  }))
})
