/** Durable model registry and routing policies for D_AI. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { routeModels, type ModelProfile } from './model-router.ts'

const identity = z.string().min(1).max(240)
const systemId = z.enum([
  'investigation',
  'scientific-research',
  'investor',
  'cybersecurity',
  'operations-intelligence',
  'innovation-discovery',
])
const capability = z.enum(['reasoning', 'research', 'coding', 'vision', 'long-context', 'tool-use', 'arabic'])
const unit = z.number().min(0).max(1)
const weight = z.number().finite().nonnegative()

export const durableModelProfileSchema = z.object({
  id: identity,
  provider: z.string().min(1).max(240),
  location: z.enum(['LOCAL', 'CLOUD']),
  capabilities: z.array(capability),
  qualityScore: unit,
  reliabilityScore: unit,
  latencyScore: unit,
  costScore: unit,
  privacyScore: unit,
  maxContextTokens: z.number().int().positive(),
  enabled: z.boolean(),
}).strict()

export const modelRoutingPolicySchema = z.object({
  id: identity,
  systemId,
  role: z.string().min(1).max(240),
  requiredCapabilities: z.array(capability),
  minContextTokens: z.number().int().positive(),
  localOnly: z.boolean(),
  weights: z.object({
    quality: weight.optional(),
    reliability: weight.optional(),
    latency: weight.optional(),
    cost: weight.optional(),
    privacy: weight.optional(),
  }).strict().optional(),
  updatedAt: z.string().datetime(),
  updatedBy: identity,
}).strict()

export const modelRegistrySchema = z.object({
  ownerAgentId: identity,
  revision: z.number().int().nonnegative(),
  models: z.array(durableModelProfileSchema),
  policies: z.array(modelRoutingPolicySchema),
}).strict()

export type ModelRoutingPolicy = z.infer<typeof modelRoutingPolicySchema>
export type ModelRegistry = z.infer<typeof modelRegistrySchema>

export const modelRegistryFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum(['UPSERT_MODEL', 'SET_POLICY']),
  actorId: identity,
  registry: modelRegistrySchema,
}).strict()

export type ModelRegistryFact = z.infer<typeof modelRegistryFactSchema>
export interface ModelRegistryState {
  readonly registries: readonly ModelRegistry[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change D_AI model-registry fact retaining model capability/evaluation profiles and role routing policies without storing provider secrets. */
    'd_ai/model-registry-fact': ModelRegistryFact
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiModelRegistry: ModelRegistryState }
  interface SessionProjectionMap { daiModelRegistry: ModelRegistryState }
}

const stateSchema: z.ZodType<ModelRegistryState> = z.object({
  registries: z.array(modelRegistrySchema),
  failure: z.string().optional(),
}).strict()

function validateRegistry(registry: ModelRegistry): void {
  if (new Set(registry.models.map(model => model.id)).size !== registry.models.length) throw new Error('duplicate model profile identity')
  if (new Set(registry.policies.map(policy => policy.id)).size !== registry.policies.length) throw new Error('duplicate model routing policy identity')
  for (const model of registry.models) {
    routeModels([model as ModelProfile], {
      requiredCapabilities: [],
      minContextTokens: 1,
      localOnly: false,
    })
    if (new Set(model.capabilities).size !== model.capabilities.length) throw new Error('duplicate model capability')
  }
  for (const policy of registry.policies) {
    if (new Set(policy.requiredCapabilities).size !== policy.requiredCapabilities.length) throw new Error('duplicate routing capability requirement')
    const values = Object.values(policy.weights ?? {})
    if (values.length > 0 && values.every(value => value === 0)) throw new Error('routing policy weights cannot all be zero')
  }
}

function changedIds<T extends { readonly id: string }>(before: readonly T[], after: readonly T[]): string[] {
  const beforeMap = new Map(before.map(item => [item.id, item]))
  const afterMap = new Map(after.map(item => [item.id, item]))
  const ids = new Set([...beforeMap.keys(), ...afterMap.keys()])
  return [...ids].filter(id => JSON.stringify(beforeMap.get(id)) !== JSON.stringify(afterMap.get(id)))
}

export function projectModelRegistryFact(state: ModelRegistryState, event: SessionEvent): ModelRegistryState {
  if (state.failure !== undefined || event.type !== 'd_ai/model-registry-fact') return state
  try {
    const fact = modelRegistryFactSchema.parse(event.data)
    if (fact.actorId !== fact.registry.ownerAgentId) throw new Error('model-registry actor does not own registry')
    validateRegistry(fact.registry)

    const prior = state.registries.find(item => item.ownerAgentId === fact.registry.ownerAgentId)
    if ((prior?.revision ?? 0) + 1 !== fact.registry.revision) throw new Error('model-registry revision is not contiguous')

    if (prior !== undefined) {
      if (fact.operation === 'UPSERT_MODEL') {
        if (JSON.stringify(fact.registry.policies) !== JSON.stringify(prior.policies)) throw new Error('UPSERT_MODEL cannot change routing policies')
        const changed = changedIds(prior.models, fact.registry.models)
        if (changed.length !== 1 || fact.registry.models.length < prior.models.length || fact.registry.models.length > prior.models.length + 1) {
          throw new Error('UPSERT_MODEL must add or update exactly one model')
        }
      } else {
        if (JSON.stringify(fact.registry.models) !== JSON.stringify(prior.models)) throw new Error('SET_POLICY cannot change model profiles')
        const changed = changedIds(prior.policies, fact.registry.policies)
        if (changed.length !== 1 || fact.registry.policies.length < prior.policies.length || fact.registry.policies.length > prior.policies.length + 1) {
          throw new Error('SET_POLICY must add or update exactly one routing policy')
        }
      }
    } else {
      if (fact.registry.revision !== 1) throw new Error('model registry must begin at revision 1')
      if (fact.operation === 'UPSERT_MODEL' && (fact.registry.models.length !== 1 || fact.registry.policies.length !== 0)) {
        throw new Error('initial UPSERT_MODEL must contain exactly one model')
      }
      if (fact.operation === 'SET_POLICY' && (fact.registry.policies.length !== 1 || fact.registry.models.length !== 0)) {
        throw new Error('initial SET_POLICY must contain exactly one routing policy')
      }
    }

    return {
      registries: [...state.registries.filter(item => item.ownerAgentId !== fact.registry.ownerAgentId), fact.registry],
    }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

export const modelRegistryProjection = {
  key: 'daiModelRegistry',
  stateVersion: 1,
  stateSchema,
  init: () => ({ registries: [] }),
  apply: projectModelRegistryFact,
  wire: { viewSchema: stateSchema, view: (state: ModelRegistryState) => state },
} satisfies ProjectionDefinition<'daiModelRegistry', ModelRegistryState>
