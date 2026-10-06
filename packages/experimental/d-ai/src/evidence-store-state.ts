/** Durable cross-system Evidence/Knowledge Graph for D_AI. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import {
  addEvidenceEdge,
  addEvidenceNode,
  createEvidenceGraph,
  type EvidenceEdge,
  type EvidenceGraph,
  type EvidenceNode,
} from './evidence-graph.ts'

const identity = z.string().min(1).max(240)
const systemId = z.enum([
  'investigation',
  'scientific-research',
  'investor',
  'cybersecurity',
  'operations-intelligence',
  'innovation-discovery',
])
const nodeKind = z.enum([
  'SOURCE',
  'CLAIM',
  'ENTITY',
  'EVENT',
  'HYPOTHESIS',
  'ARTIFACT',
  'DATASET',
  'EXPERIMENT',
  'DECISION',
])
const edgeKind = z.enum([
  'SUPPORTS',
  'CONTRADICTS',
  'DERIVED_FROM',
  'MENTIONS',
  'RELATES_TO',
  'PRECEDES',
  'DUPLICATES',
  'SUPERSEDES',
])

export const durableEvidenceNodeSchema = z.object({
  id: identity,
  kind: nodeKind,
  systemId,
  label: z.string().min(1).max(12000),
  createdAt: z.string().datetime(),
  provenance: z.array(z.string().min(1).max(4000)).min(1),
  confidence: z.number().min(0).max(1).optional(),
}).strict()

export const durableEvidenceEdgeSchema = z.object({
  id: identity,
  from: identity,
  to: identity,
  kind: edgeKind,
  createdAt: z.string().datetime(),
  actorId: identity,
}).strict()

export const evidenceStoreSchema = z.object({
  ownerAgentId: identity,
  revision: z.number().int().nonnegative(),
  nodes: z.array(durableEvidenceNodeSchema),
  edges: z.array(durableEvidenceEdgeSchema),
}).strict()

export type EvidenceStore = z.infer<typeof evidenceStoreSchema>

export const evidenceStoreFactSchema = z.object({
  version: z.literal(1),
  operation: z.enum(['ADD_NODE', 'ADD_EDGE']),
  actorId: identity,
  store: evidenceStoreSchema,
}).strict()

export type EvidenceStoreFact = z.infer<typeof evidenceStoreFactSchema>
export interface EvidenceStoreState {
  readonly stores: readonly EvidenceStore[]
  readonly failure?: string | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-change shared D_AI evidence-graph fact retaining append-only nodes, edges, provenance and confidence for deterministic cross-system replay. */
    'd_ai/evidence-store-fact': EvidenceStoreFact
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { daiEvidenceStore: EvidenceStoreState }
  interface SessionProjectionMap { daiEvidenceStore: EvidenceStoreState }
}

const stateSchema: z.ZodType<EvidenceStoreState> = z.object({
  stores: z.array(evidenceStoreSchema),
  failure: z.string().optional(),
}).strict()

function rebuildGraph(store: EvidenceStore): EvidenceGraph {
  let graph = createEvidenceGraph()
  for (const node of store.nodes) graph = addEvidenceNode(graph, node as EvidenceNode)
  for (const edge of store.edges) graph = addEvidenceEdge(graph, edge as EvidenceEdge)
  return graph
}

export function projectEvidenceStoreFact(state: EvidenceStoreState, event: SessionEvent): EvidenceStoreState {
  if (state.failure !== undefined || event.type !== 'd_ai/evidence-store-fact') return state
  try {
    const fact = evidenceStoreFactSchema.parse(event.data)
    if (fact.actorId !== fact.store.ownerAgentId) throw new Error('evidence-store actor does not own store')
    rebuildGraph(fact.store)

    const prior = state.stores.find(item => item.ownerAgentId === fact.store.ownerAgentId)
    if ((prior?.revision ?? 0) + 1 !== fact.store.revision) throw new Error('evidence-store revision is not contiguous')

    if (prior !== undefined) {
      if (JSON.stringify(fact.store.nodes.slice(0, prior.nodes.length)) !== JSON.stringify(prior.nodes)) {
        throw new Error('prior evidence nodes changed or disappeared')
      }
      if (JSON.stringify(fact.store.edges.slice(0, prior.edges.length)) !== JSON.stringify(prior.edges)) {
        throw new Error('prior evidence edges changed or disappeared')
      }

      if (fact.operation === 'ADD_NODE') {
        if (fact.store.nodes.length !== prior.nodes.length + 1 || fact.store.edges.length !== prior.edges.length) {
          throw new Error('ADD_NODE must append exactly one node and no edges')
        }
      }
      if (fact.operation === 'ADD_EDGE') {
        if (fact.store.nodes.length !== prior.nodes.length || fact.store.edges.length !== prior.edges.length + 1) {
          throw new Error('ADD_EDGE must append exactly one edge and no nodes')
        }
      }
    } else {
      if (fact.store.revision !== 1) throw new Error('evidence store must begin at revision 1')
      if (fact.operation === 'ADD_NODE' && (fact.store.nodes.length !== 1 || fact.store.edges.length !== 0)) {
        throw new Error('initial ADD_NODE must contain exactly one node')
      }
      if (fact.operation === 'ADD_EDGE') throw new Error('evidence store cannot begin with an edge')
    }

    return {
      stores: [...state.stores.filter(item => item.ownerAgentId !== fact.store.ownerAgentId), fact.store],
    }
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

export const evidenceStoreProjection = {
  key: 'daiEvidenceStore',
  stateVersion: 1,
  stateSchema,
  init: () => ({ stores: [] }),
  apply: projectEvidenceStoreFact,
  wire: { viewSchema: stateSchema, view: (state: EvidenceStoreState) => state },
} satisfies ProjectionDefinition<'daiEvidenceStore', EvidenceStoreState>
