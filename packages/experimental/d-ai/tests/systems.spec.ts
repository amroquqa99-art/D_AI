import { describe, expect, it } from 'vitest'
import { LOCAL_INTELLIGENCE_CORE, SYSTEMS, getSystemManifest, listSystemManifests } from '../src/systems.ts'

describe('D_AI v2 system registry', () => {
  it('registers exactly the six approved first-class domain systems', () => {
    expect(SYSTEMS.map(system => system.id)).toEqual([
      'investigation',
      'scientific-research',
      'investor',
      'cybersecurity',
      'operations-intelligence',
      'innovation-discovery',
    ])
    expect(new Set(SYSTEMS.map(system => system.id)).size).toBe(6)
  })

  it('keeps execution truth separate from contract registration', () => {
    expect(getSystemManifest('investigation')).toMatchObject({ execution: 'native', status: 'INTEGRATED' })
    for (const id of ['scientific-research', 'investor', 'cybersecurity', 'operations-intelligence', 'innovation-discovery'] as const) {
      expect(getSystemManifest(id)).toMatchObject({ execution: 'contract-only', status: 'FOUNDATION' })
    }
  })

  it('defines cross-system and approval policy for sensitive domains', () => {
    const cyber = getSystemManifest('cybersecurity')
    expect(cyber.crossSystem).toContain('operations-intelligence')
    expect(cyber.humanApprovalGates).toContain('active-security-test')

    const operations = getSystemManifest('operations-intelligence')
    expect(operations.crossSystem).toContain('investigation')
    expect(operations.crossSystem).toContain('cybersecurity')
    expect(operations.humanApprovalGates).toContain('sensitive-external-action')
  })

  it('treats the Local Intelligence Core as a governed platform component, not a seventh domain', () => {
    expect(listSystemManifests()).toHaveLength(6)
    expect(SYSTEMS.map(system => String(system.id))).not.toContain(LOCAL_INTELLIGENCE_CORE.id)
    expect(LOCAL_INTELLIGENCE_CORE.dataPolicy).toBe('explicit-eligibility-only')
    expect(LOCAL_INTELLIGENCE_CORE.stages).toContain('holdout-evaluation')
    expect(LOCAL_INTELLIGENCE_CORE.requiredControls).toContain('rollback')
  })
})
