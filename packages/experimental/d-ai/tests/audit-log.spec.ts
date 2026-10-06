import { describe, expect, it } from 'vitest'
import { appendAuditRecord, createAuditChain, verifyAuditChain } from '../src/audit-log.ts'

describe('D_AI audit chain', () => {
  it('creates a verifiable append-only hash chain', () => {
    let chain = createAuditChain()
    chain = appendAuditRecord(chain, {
      id: 'a1', at: '2026-10-06T00:00:00Z', actorId: 'owner',
      action: 'MISSION_CREATE', systemId: 'investigation', missionId: 'm1',
      details: { objective: 'question' },
    })
    chain = appendAuditRecord(chain, {
      id: 'a2', at: '2026-10-06T00:01:00Z', actorId: 'owner',
      action: 'MODEL_ROUTE', systemId: 'investigation', missionId: 'm1',
      details: { model: 'local-a', score: 0.9 },
    })

    expect(chain.records).toHaveLength(2)
    expect(chain.records[1]!.previousHash).toBe(chain.records[0]!.hash)
    expect(verifyAuditChain(chain)).toBe(true)
  })

  it('detects tampering', () => {
    let chain = appendAuditRecord(createAuditChain(), {
      id: 'a1', at: '2026-10-06T00:00:00Z', actorId: 'owner',
      action: 'CAPABILITY_GRANT', details: { capability: 'web.fetch' },
    })
    const forged = {
      ...chain,
      records: [{ ...chain.records[0]!, actorId: 'attacker' }],
    }
    expect(verifyAuditChain(forged)).toBe(false)
  })

  it('rejects duplicate audit identities', () => {
    let chain = appendAuditRecord(createAuditChain(), {
      id: 'same', at: '2026-10-06T00:00:00Z', actorId: 'owner',
      action: 'HUMAN_APPROVAL', details: {},
    })
    expect(() => appendAuditRecord(chain, {
      id: 'same', at: '2026-10-06T00:01:00Z', actorId: 'owner',
      action: 'HUMAN_APPROVAL', details: {},
    })).toThrow('Duplicate audit id')
  })
})
