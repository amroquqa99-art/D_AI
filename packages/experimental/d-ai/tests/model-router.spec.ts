import { describe, expect, it } from 'vitest'
import { chooseModel, routeModels, type ModelProfile } from '../src/model-router.ts'

const models: ModelProfile[] = [
  {
    id: 'local-a', provider: 'local', location: 'LOCAL', capabilities: ['reasoning', 'tool-use', 'arabic'],
    qualityScore: 0.8, reliabilityScore: 0.9, latencyScore: 0.8, costScore: 1, privacyScore: 1,
    maxContextTokens: 32768, enabled: true,
  },
  {
    id: 'cloud-b', provider: 'cloud', location: 'CLOUD', capabilities: ['reasoning', 'tool-use', 'arabic', 'long-context'],
    qualityScore: 0.95, reliabilityScore: 0.95, latencyScore: 0.6, costScore: 0.4, privacyScore: 0.4,
    maxContextTokens: 128000, enabled: true,
  },
]

describe('D_AI model router', () => {
  it('enforces hard local/context/capability requirements before scoring', () => {
    const routed = routeModels(models, {
      requiredCapabilities: ['reasoning', 'tool-use'],
      minContextTokens: 16000,
      localOnly: true,
    })
    expect(routed.map(item => item.model.id)).toEqual(['local-a'])
  })

  it('can favor quality when explicitly weighted', () => {
    const selected = chooseModel(models, {
      requiredCapabilities: ['reasoning', 'tool-use'],
      minContextTokens: 16000,
      localOnly: false,
      weights: { quality: 10, reliability: 1, latency: 0, cost: 0, privacy: 0 },
    })
    expect(selected.model.id).toBe('cloud-b')
  })

  it('rejects impossible routing requirements', () => {
    expect(() => chooseModel(models, {
      requiredCapabilities: ['vision'],
      minContextTokens: 16000,
      localOnly: true,
    })).toThrow('No enabled model')
  })
})
