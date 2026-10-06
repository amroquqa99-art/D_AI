/** Cross-system evidence/knowledge graph primitives. */
import type { SystemId } from './systems.ts'

export type EvidenceNodeKind =
  | 'SOURCE'
  | 'CLAIM'
  | 'ENTITY'
  | 'EVENT'
  | 'HYPOTHESIS'
  | 'ARTIFACT'
  | 'DATASET'
  | 'EXPERIMENT'
  | 'DECISION'

export type EvidenceEdgeKind =
  | 'SUPPORTS'
  | 'CONTRADICTS'
  | 'DERIVED_FROM'
  | 'MENTIONS'
  | 'RELATES_TO'
  | 'PRECEDES'
  | 'DUPLICATES'
  | 'SUPERSEDES'

export interface EvidenceNode {
  readonly id: string
  readonly kind: EvidenceNodeKind
  readonly systemId: SystemId
  readonly label: string
  readonly createdAt: string
  readonly provenance: readonly string[]
  readonly confidence?: number | undefined
}

export interface EvidenceEdge {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly kind: EvidenceEdgeKind
  readonly createdAt: string
  readonly actorId: string
}

export interface EvidenceGraph {
  readonly nodes: ReadonlyMap<string, EvidenceNode>
  readonly edges: ReadonlyMap<string, EvidenceEdge>
}

function iso(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`Invalid timestamp: ${value}`)
}

function freezeNode(node: EvidenceNode): EvidenceNode {
  if (node.id.trim().length === 0 || node.label.trim().length === 0) throw new Error('Evidence node id and label are required')
  iso(node.createdAt)
  if (node.confidence !== undefined && (!Number.isFinite(node.confidence) || node.confidence < 0 || node.confidence > 1)) {
    throw new Error('Evidence confidence must be between 0 and 1')
  }
  return Object.freeze({ ...node, provenance: Object.freeze([...node.provenance]) })
}

function freezeEdge(edge: EvidenceEdge): EvidenceEdge {
  if (edge.id.trim().length === 0 || edge.from.trim().length === 0 || edge.to.trim().length === 0 || edge.actorId.trim().length === 0) {
    throw new Error('Evidence edge identity is required')
  }
  if (edge.from === edge.to && edge.kind !== 'DUPLICATES') throw new Error('Self-edge is allowed only for DUPLICATES')
  iso(edge.createdAt)
  return Object.freeze({ ...edge })
}

export function createEvidenceGraph(): EvidenceGraph {
  return Object.freeze({ nodes: new Map(), edges: new Map() })
}

export function addEvidenceNode(graph: EvidenceGraph, input: EvidenceNode): EvidenceGraph {
  const node = freezeNode(input)
  if (graph.nodes.has(node.id)) throw new Error(`Duplicate evidence node: ${node.id}`)
  const nodes = new Map(graph.nodes)
  nodes.set(node.id, node)
  return Object.freeze({ nodes, edges: new Map(graph.edges) })
}

export function addEvidenceEdge(graph: EvidenceGraph, input: EvidenceEdge): EvidenceGraph {
  const edge = freezeEdge(input)
  if (graph.edges.has(edge.id)) throw new Error(`Duplicate evidence edge: ${edge.id}`)
  if (!graph.nodes.has(edge.from) || !graph.nodes.has(edge.to)) throw new Error('Evidence edge endpoints must exist')
  const edges = new Map(graph.edges)
  edges.set(edge.id, edge)
  return Object.freeze({ nodes: new Map(graph.nodes), edges })
}

export function neighbors(
  graph: EvidenceGraph,
  nodeId: string,
  kinds?: readonly EvidenceEdgeKind[],
): readonly EvidenceNode[] {
  if (!graph.nodes.has(nodeId)) throw new Error(`Unknown evidence node: ${nodeId}`)
  const accepted = kinds === undefined ? undefined : new Set(kinds)
  const ids = new Set<string>()
  for (const edge of graph.edges.values()) {
    if (accepted !== undefined && !accepted.has(edge.kind)) continue
    if (edge.from === nodeId) ids.add(edge.to)
    if (edge.to === nodeId) ids.add(edge.from)
  }
  return Object.freeze([...ids].sort().map(id => graph.nodes.get(id)!))
}

export interface ClaimTension {
  readonly claimId: string
  readonly supporters: readonly string[]
  readonly contradictors: readonly string[]
}

/** Summarize explicit support/contradiction edges without inventing a verdict. */
export function claimTension(graph: EvidenceGraph, claimId: string): ClaimTension {
  const claim = graph.nodes.get(claimId)
  if (claim === undefined || claim.kind !== 'CLAIM') throw new Error('claimTension requires a CLAIM node')
  const supporters: string[] = []
  const contradictors: string[] = []
  for (const edge of graph.edges.values()) {
    if (edge.to !== claimId) continue
    if (edge.kind === 'SUPPORTS') supporters.push(edge.from)
    if (edge.kind === 'CONTRADICTS') contradictors.push(edge.from)
  }
  return Object.freeze({
    claimId,
    supporters: Object.freeze(supporters.sort()),
    contradictors: Object.freeze(contradictors.sort()),
  })
}
