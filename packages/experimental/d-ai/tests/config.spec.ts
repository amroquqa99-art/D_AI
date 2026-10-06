import { describe, expect, it } from 'vitest'
import { buildRuntimeConfiguration } from '../src/config.ts'

describe('D_AI runtime configuration', () => {
  it('normalizes direct-programmatic defaults without widening the defensive cyber tool set', () => {
    const runtime = buildRuntimeConfiguration()

    expect(runtime.limits).toEqual({
      maxSourceBytes: 200000,
      maxMissionBytes: 2000000,
      maxSources: 32,
    })
    expect(runtime.scheduler).toEqual({ enabled: true, pollMs: 1000 })
    expect(runtime.delegations.investigation.allowedTools).toEqual(['web_search', 'web_fetch'])
    expect(runtime.delegations.scientific.allowedTools).toEqual(['web_search', 'web_fetch'])
    expect(runtime.delegations.cyber.allowedTools).toEqual([])
    expect(runtime.delegations.investigation).toMatchObject({
      provider: 'spawn',
      maxDepth: 3,
      maxOutputTokens: 4096,
      maxRequestsPerChild: 8,
      timeoutMs: 120000,
      maxResultBytes: 65536,
    })
  })

  it('propagates explicit tool and role-model overrides consistently', () => {
    const runtime = buildRuntimeConfiguration({
      subagentProvider: 'isolated',
      allowedTools: ['fixture_search'],
      researchModel: 'research-a',
      verificationModel: 'verify-b',
      literatureModel: 'literature-c',
      cyberAssessmentModel: 'cyber-d',
      operationsAdversarialModel: 'ops-e',
      innovationCriticModel: 'innovation-f',
      directorSchedulerEnabled: false,
      directorSchedulerPollMs: 250,
    })

    expect(runtime.delegations.investigation).toMatchObject({
      provider: 'isolated',
      allowedTools: ['fixture_search'],
      researchModel: 'research-a',
      verificationModel: 'verify-b',
    })
    expect(runtime.delegations.scientific).toMatchObject({
      allowedTools: ['fixture_search'],
      literatureModel: 'literature-c',
    })
    expect(runtime.delegations.cyber).toMatchObject({
      allowedTools: ['fixture_search'],
      assessmentModel: 'cyber-d',
    })
    expect(runtime.scheduler).toEqual({ enabled: false, pollMs: 250 })
    expect(runtime.delegations.operations.adversarialModel).toBe('ops-e')
    expect(runtime.delegations.innovation.criticModel).toBe('innovation-f')
  })

  it('rejects invalid resource bounds before service construction', () => {
    expect(() => buildRuntimeConfiguration({ maxDepth: 0 })).toThrow('maxDepth must be a positive safe integer')
    expect(() => buildRuntimeConfiguration({ maxMissionBytes: Number.MAX_SAFE_INTEGER + 1 })).toThrow('maxMissionBytes must be a positive safe integer')
    expect(() => buildRuntimeConfiguration({ directorSchedulerPollMs: 9 })).toThrow('directorSchedulerPollMs must be at least 10 ms')
  })
})
