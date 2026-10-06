import { describe, expect, it } from 'vitest'
import { addEvidenceEdge, addEvidenceNode, claimTension, createEvidenceGraph, neighbors } from '../src/evidence-graph.ts'

describe('D_AI evidence graph', () => {
  it('stores cross-system nodes and explicit provenance relationships', () => {
    let graph = createEvidenceGraph()
    graph = addEvidenceNode(graph, {
      id: 'source-1', kind: 'SOURCE', systemId: 'investigation', label: 'Primary source',
      createdAt: '2026-10-06T00:00:00Z', provenance: ['https://example.org'],
    })
    graph = addEvidenceNode(graph, {
      id: 'claim-1', kind: 'CLAIM', systemId: 'scientific-research', label: 'Candidate claim',
      createdAt: '2026-10-06T00:01:00Z', provenance: ['source-1'], confidence: 0.6,
    })
    graph = addEvidenceEdge(graph, {
      id: 'edge-1', from: 'source-1', to: 'claim-1', kind: 'SUPPORTS',
      createdAt: '2026-10-06T00:02:00Z', actorId: 'research-agent',
    })

    expect(neighbors(graph, 'claim-1').map(node => node.id)).toEqual(['source-1'])
    expect(claimTension(graph, 'claim-1')).toEqual({
      claimId: 'claim-1', supporters: ['source-1'], contradictors: [],
    })
  })

  it('tracks contradiction without promoting a claim to truth', () => {
    let graph = createEvidenceGraph()
    for (const node of [
      { id: 'claim', kind: 'CLAIM' as const, systemId: 'investigation' as const, label: 'Claim', createdAt: '2026-10-06T00:00:00Z', provenance: [] },
      { id: 'support', kind: 'SOURCE' as const, systemId: 'investigation' as const, label: 'Support', createdAt: '2026-10-06T00:00:00Z', provenance: [] },
      { id: 'counter', kind: 'SOURCE' as const, systemId: 'investigation' as const, label: 'Counter', createdAt: '2026-10-06T00:00:00Z', provenance: [] },
    ]) graph = addEvidenceNode(graph, node)

    graph = addEvidenceEdge(graph, { id: 's', from: 'support', to: 'claim', kind: 'SUPPORTS', createdAt: '2026-10-06T00:01:00Z', actorId: 'a' })
    graph = addEvidenceEdge(graph, { id: 'c', from: 'counter', to: 'claim', kind: 'CONTRADICTS', createdAt: '2026-10-06T00:01:00Z', actorId: 'b' })

    expect(claimTension(graph, 'claim')).toEqual({
      claimId: 'claim', supporters: ['support'], contradictors: ['counter'],
    })
  })

  it('rejects dangling edges and invalid confidence', () => {
    const empty = createEvidenceGraph()
    expect(() => addEvidenceEdge(empty, {
      id: 'e', from: 'missing-a', to: 'missing-b', kind: 'RELATES_TO', createdAt: '2026-10-06T00:00:00Z', actorId: 'a',
    })).toThrow('endpoints')

    expect(() => addEvidenceNode(empty, {
      id: 'bad', kind: 'CLAIM', systemId: 'investigation', label: 'bad',
      createdAt: '2026-10-06T00:00:00Z', provenance: [], confidence: 2,
    })).toThrow('between 0 and 1')
  })
})
