import { describe, expect, it } from 'vitest'
import { addResourceUsage, checkBudget, rankInformationOptions } from '../src/resource-value.ts'

describe('D_AI resource budgets and information value', () => {
  it('detects exhausted resource dimensions', () => {
    const result = checkBudget(
      { tokenLimit: 1000, moneyLimitUsd: 5, wallClockMs: 1000, humanAttentionMinutes: 30, dataAccessCostUsd: 3 },
      { tokens: 1200, moneyUsd: 1, wallClockMs: 900, humanAttentionMinutes: 40, dataAccessCostUsd: 1 },
    )
    expect(result.allowed).toBe(false)
    expect(result.reasons).toEqual(['token-limit-exceeded', 'human-attention-limit-exceeded'])
    expect(result.remaining.moneyLimitUsd).toBe(4)
  })

  it('treats exact budget exhaustion as blocked and preserves zero remaining capacity', () => {
    const result = checkBudget(
      { wallClockMs: 100 },
      { tokens: 0, moneyUsd: 0, wallClockMs: 100, humanAttentionMinutes: 0, dataAccessCostUsd: 0 },
    )
    expect(result.allowed).toBe(false)
    expect(result.reasons).toEqual(['time-limit-exceeded'])
    expect(result.remaining.wallClockMs).toBe(0)
  })

  it('adds measured resource deltas without mutating prior usage', () => {
    const current = {
      tokens: 10,
      moneyUsd: 1,
      wallClockMs: 20,
      humanAttentionMinutes: 2,
      dataAccessCostUsd: 0.5,
    }
    const next = addResourceUsage(current, {
      tokens: 5,
      moneyUsd: 0.25,
      wallClockMs: 30,
      humanAttentionMinutes: 1,
      dataAccessCostUsd: 0.5,
    })

    expect(next).toEqual({
      tokens: 15,
      moneyUsd: 1.25,
      wallClockMs: 50,
      humanAttentionMinutes: 3,
      dataAccessCostUsd: 1,
    })
    expect(current.wallClockMs).toBe(20)
    expect(Object.isFrozen(next)).toBe(true)
    expect(() => addResourceUsage(current, { ...next, wallClockMs: -1 })).toThrow('delta wallClockMs')
  })

  it('ranks high-impact low-cost information ahead of expensive weak signals', () => {
    const ranked = rankInformationOptions([
      {
        id: 'expensive-weak',
        expectedDecisionImpact: 0.4,
        uncertaintyReduction: 0.4,
        evidenceReliability: 0.5,
        executionProbability: 0.8,
        moneyCostUsd: 1000,
        timeCostHours: 20,
        humanAttentionHours: 5,
        riskPenalty: 0.2,
      },
      {
        id: 'cheap-strong',
        expectedDecisionImpact: 0.9,
        uncertaintyReduction: 0.8,
        evidenceReliability: 0.9,
        executionProbability: 0.95,
        moneyCostUsd: 5,
        timeCostHours: 1,
        humanAttentionHours: 0.5,
        riskPenalty: 0.05,
      },
    ])
    expect(ranked[0]?.id).toBe('cheap-strong')
    expect(ranked[0]!.netValue).toBeGreaterThan(ranked[1]!.netValue)
  })
})
