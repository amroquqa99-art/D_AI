/** Evidence-based model routing primitives for D_AI. */

export type ModelLocation = 'LOCAL' | 'CLOUD'
export type ModelCapability = 'reasoning' | 'research' | 'coding' | 'vision' | 'long-context' | 'tool-use' | 'arabic'

export interface ModelProfile {
  readonly id: string
  readonly provider: string
  readonly location: ModelLocation
  readonly capabilities: readonly ModelCapability[]
  readonly qualityScore: number
  readonly reliabilityScore: number
  readonly latencyScore: number
  readonly costScore: number
  readonly privacyScore: number
  readonly maxContextTokens: number
  readonly enabled: boolean
}

export interface RoutingRequest {
  readonly requiredCapabilities: readonly ModelCapability[]
  readonly minContextTokens: number
  readonly localOnly: boolean
  readonly weights?: {
    readonly quality?: number
    readonly reliability?: number
    readonly latency?: number
    readonly cost?: number
    readonly privacy?: number
  }
}

export interface RoutedModel {
  readonly model: ModelProfile
  readonly score: number
}

function unit(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be between 0 and 1`)
}

function validate(model: ModelProfile): void {
  if (model.id.trim().length === 0 || model.provider.trim().length === 0) throw new Error('model id and provider are required')
  unit('qualityScore', model.qualityScore)
  unit('reliabilityScore', model.reliabilityScore)
  unit('latencyScore', model.latencyScore)
  unit('costScore', model.costScore)
  unit('privacyScore', model.privacyScore)
  if (!Number.isSafeInteger(model.maxContextTokens) || model.maxContextTokens < 1) throw new Error('maxContextTokens must be positive')
}

function normalizedWeights(request: RoutingRequest): Required<NonNullable<RoutingRequest['weights']>> {
  const raw = {
    quality: request.weights?.quality ?? 0.35,
    reliability: request.weights?.reliability ?? 0.25,
    latency: request.weights?.latency ?? 0.10,
    cost: request.weights?.cost ?? 0.10,
    privacy: request.weights?.privacy ?? 0.20,
  }
  for (const [name, value] of Object.entries(raw)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${name} routing weight must be non-negative`)
  }
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0)
  if (total <= 0) throw new Error('routing weights must have positive total')
  return {
    quality: raw.quality / total,
    reliability: raw.reliability / total,
    latency: raw.latency / total,
    cost: raw.cost / total,
    privacy: raw.privacy / total,
  }
}

/**
 * Route only among models that meet hard requirements. Scores are empirical
 * inputs from evaluations/telemetry; the router never fabricates capability.
 */
export function routeModels(models: readonly ModelProfile[], request: RoutingRequest): readonly RoutedModel[] {
  if (!Number.isSafeInteger(request.minContextTokens) || request.minContextTokens < 1) throw new Error('minContextTokens must be positive')
  const weights = normalizedWeights(request)
  const required = new Set(request.requiredCapabilities)

  return Object.freeze(
    models
      .map(model => {
        validate(model)
        return model
      })
      .filter(model => model.enabled)
      .filter(model => !request.localOnly || model.location === 'LOCAL')
      .filter(model => model.maxContextTokens >= request.minContextTokens)
      .filter(model => [...required].every(capability => model.capabilities.includes(capability)))
      .map(model => ({
        model,
        score:
          model.qualityScore * weights.quality
          + model.reliabilityScore * weights.reliability
          + model.latencyScore * weights.latency
          + model.costScore * weights.cost
          + model.privacyScore * weights.privacy,
      }))
      .sort((a, b) => b.score - a.score || a.model.id.localeCompare(b.model.id)),
  )
}

export function chooseModel(models: readonly ModelProfile[], request: RoutingRequest): RoutedModel {
  const ranked = routeModels(models, request)
  const best = ranked[0]
  if (best === undefined) throw new Error('No enabled model satisfies routing requirements')
  return best
}
