/** Shared resource budgeting and Value-of-Information primitives for D_AI. */

export interface ResourceBudget {
  readonly tokenLimit?: number
  readonly moneyLimitUsd?: number
  readonly wallClockMs?: number
  readonly humanAttentionMinutes?: number
  readonly dataAccessCostUsd?: number
}

export interface ResourceUsage {
  readonly tokens: number
  readonly moneyUsd: number
  readonly wallClockMs: number
  readonly humanAttentionMinutes: number
  readonly dataAccessCostUsd: number
}

/** Add one measured resource delta without mutating either input. */
export function addResourceUsage(
  current: ResourceUsage,
  delta: ResourceUsage,
): ResourceUsage {
  for (const [name, value] of Object.entries(current)) nonNegative('current ' + name, value)
  for (const [name, value] of Object.entries(delta)) nonNegative('delta ' + name, value)

  return Object.freeze({
    tokens: current.tokens + delta.tokens,
    moneyUsd: current.moneyUsd + delta.moneyUsd,
    wallClockMs: current.wallClockMs + delta.wallClockMs,
    humanAttentionMinutes: current.humanAttentionMinutes + delta.humanAttentionMinutes,
    dataAccessCostUsd: current.dataAccessCostUsd + delta.dataAccessCostUsd,
  })
}

export interface BudgetCheck {
  readonly allowed: boolean
  readonly reasons: readonly string[]
  readonly remaining: ResourceBudget
}

function nonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite non-negative number`)
}

export function checkBudget(budget: ResourceBudget, usage: ResourceUsage): BudgetCheck {
  nonNegative('tokens', usage.tokens)
  nonNegative('moneyUsd', usage.moneyUsd)
  nonNegative('wallClockMs', usage.wallClockMs)
  nonNegative('humanAttentionMinutes', usage.humanAttentionMinutes)
  nonNegative('dataAccessCostUsd', usage.dataAccessCostUsd)

  const reasons: string[] = []
  const remaining: ResourceBudget = {}

  const evaluate = (limit: number | undefined, used: number, key: keyof ResourceBudget, label: string): void => {
    if (limit === undefined) return
    nonNegative(label, limit)
    const left = limit - used
    ;(remaining as Record<string, number>)[key] = Math.max(0, left)
    if (left < 0) reasons.push(`${label}-exceeded`)
  }

  evaluate(budget.tokenLimit, usage.tokens, 'tokenLimit', 'token-limit')
  evaluate(budget.moneyLimitUsd, usage.moneyUsd, 'moneyLimitUsd', 'money-limit')
  evaluate(budget.wallClockMs, usage.wallClockMs, 'wallClockMs', 'time-limit')
  evaluate(budget.humanAttentionMinutes, usage.humanAttentionMinutes, 'humanAttentionMinutes', 'human-attention-limit')
  evaluate(budget.dataAccessCostUsd, usage.dataAccessCostUsd, 'dataAccessCostUsd', 'data-access-limit')

  return Object.freeze({
    allowed: reasons.length === 0,
    reasons: Object.freeze(reasons),
    remaining: Object.freeze(remaining),
  })
}

export interface InformationOption {
  readonly id: string
  readonly expectedDecisionImpact: number
  readonly uncertaintyReduction: number
  readonly evidenceReliability: number
  readonly executionProbability: number
  readonly moneyCostUsd: number
  readonly timeCostHours: number
  readonly humanAttentionHours: number
  readonly riskPenalty: number
}

export interface InformationValue {
  readonly id: string
  readonly grossValue: number
  readonly costPenalty: number
  readonly riskPenalty: number
  readonly netValue: number
}

function unit(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be between 0 and 1`)
}

/**
 * Rank candidate research/experiment steps by expected information value.
 * This is a scheduling heuristic, not a claim that epistemic value is exactly measurable.
 */
export function scoreInformationOption(option: InformationOption): InformationValue {
  unit('expectedDecisionImpact', option.expectedDecisionImpact)
  unit('uncertaintyReduction', option.uncertaintyReduction)
  unit('evidenceReliability', option.evidenceReliability)
  unit('executionProbability', option.executionProbability)
  unit('riskPenalty', option.riskPenalty)
  nonNegative('moneyCostUsd', option.moneyCostUsd)
  nonNegative('timeCostHours', option.timeCostHours)
  nonNegative('humanAttentionHours', option.humanAttentionHours)

  const grossValue =
    option.expectedDecisionImpact
    * option.uncertaintyReduction
    * option.evidenceReliability
    * option.executionProbability

  const costPenalty =
    Math.log1p(option.moneyCostUsd) * 0.015
    + Math.log1p(option.timeCostHours) * 0.03
    + Math.log1p(option.humanAttentionHours) * 0.04

  const riskPenalty = option.riskPenalty * 0.25
  const netValue = grossValue - costPenalty - riskPenalty

  return Object.freeze({ id: option.id, grossValue, costPenalty, riskPenalty, netValue })
}

export function rankInformationOptions(options: readonly InformationOption[]): readonly InformationValue[] {
  return Object.freeze(
    options
      .map(scoreInformationOption)
      .sort((a, b) => b.netValue - a.netValue || a.id.localeCompare(b.id)),
  )
}
