// D_AI adaptive model routing: task-specific measured quality, then cost within the near-best band.
// SPDX-License-Identifier: GPL-3.0-or-later
// No guessed quality scores, credentials, model names or hidden paid fallbacks.
import { createHash } from 'node:crypto';

export const TASK_TOKEN_ESTIMATES = Object.freeze({
  retrieval: Object.freeze({ input: 4000, output: 1600 }),
  implementation: Object.freeze({ input: 8000, output: 4000 }),
  review: Object.freeze({ input: 6000, output: 2500 }),
});

const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function tokens(task, policy) {
  const setting = policy?.expected_tokens?.[task] ?? TASK_TOKEN_ESTIMATES[task];
  if (!setting || !Number.isSafeInteger(setting.input) || setting.input < 0 ||
      !Number.isSafeInteger(setting.output) || setting.output < 0 ||
      setting.input + setting.output === 0) throw new Error('Expected token counts must be nonnegative integers with nonzero total');
  return setting;
}

// OpenCode catalog pricing is USD per million input/output tokens. Several
// catalog entries contain context-based tiers; use the most expensive listed
// tier for a conservative estimate, not a fictitious free lower tier.
export function estimateModelCost(model, tokenCount) {
  const tiers = Array.isArray(model.cost) ? model.cost : (model.cost ? [model.cost] : []);
  const prices = tiers
    .filter(t => t && number(t.input) && number(t.output))
    .map(t => (t.input * tokenCount.input + t.output * tokenCount.output) / 1_000_000);
  return prices.length ? Math.max(...prices) : null;
}

function trustedQuality(profile, task) {
  if (profile?.benchmark_status !== 'VERIFIED_OK') return null;
  if (typeof profile.benchmark_evidence !== 'string' || !profile.benchmark_evidence.trim()) return null;
  const value = profile.quality_by_task?.[task];
  return number(value) && value <= 100 ? value : null;
}

/**
 * Returns the real native catalog model ID, not a fabricated alias.
 * Price is an estimate, NOT a provider-enforced spending limit.
 * No evidence => explicitly documented cost-only fallback; no false quality score.
 * Manual selections never call this routine.
 */
export function selectValueModel(models, profiles, task, policy = {}) {
  if (!Object.hasOwn(TASK_TOKEN_ESTIMATES, task)) throw new Error('Unknown D_AI task class');
  if (!Array.isArray(models) || !Array.isArray(profiles) || !policy || typeof policy !== 'object')
    throw new Error('Invalid value router inputs');
  const window = tokens(task, policy);
  const tolerance = policy.quality_slack ?? 5;
  if (!number(tolerance) || tolerance > 30) throw new Error('quality_slack must be between 0 and 30');
  const cap = policy.max_estimated_usd_per_task;
  if (cap !== undefined && !number(cap)) throw new Error('max_estimated_usd_per_task must be nonnegative USD');
  const byId = new Map(profiles.filter(p => p && typeof p.id === 'string').map(p => [p.id, p]));
  const eligible = [];
  let unknownCost = 0;
  for (const model of models) {
    if (!model || typeof model.providerID !== 'string' || typeof model.id !== 'string' ||
        model.enabled === false || model.capabilities?.tools === false) continue;
    const id = model.providerID + '/' + model.id;
    const profile = byId.get(id);
    if (profile?.allow_worker === false) continue;
    const estimatedUsd = estimateModelCost(model, window);
    if (estimatedUsd === null) { unknownCost++; continue; }
    if (cap !== undefined && estimatedUsd > cap) continue;
    const quality = trustedQuality(profile, task);
    eligible.push({ id, estimated_usd: estimatedUsd, quality,
      // Keep the owner's evidence locator in their profile, not in plaintext
      // job receipts or renderer-readable status documents.
      quality_evidence_sha256: quality === null ? null
        : createHash('sha256').update(profile.benchmark_evidence).digest('hex') });
  }
  if (!eligible.length) throw new Error('No eligible model with known estimated input/output price within the configured budget; no worker dispatched. Select a model manually or update verified catalog/budget data.');
  const evaluated = eligible.filter(c => c.quality !== null);
  const best = evaluated.length ? Math.max(...evaluated.map(c => c.quality)) : null;
  const contenders = best === null ? eligible : evaluated.filter(c => c.quality >= best - tolerance);
  contenders.sort((a, b) => a.estimated_usd - b.estimated_usd ||
    (b.quality ?? -1) - (a.quality ?? -1) || a.id.localeCompare(b.id));
  const winner = contenders[0];
  return {
    model: winner.id,
    reason: {
      rule: best === null ? 'cost_only_quality_unverified' : 'verified_task_quality_within_band_then_estimated_cost',
      task_class: task,
      estimated_usd: winner.estimated_usd,
      pricing_unit: 'USD_per_million_tokens',
      expected_tokens: window,
      best_verified_quality: best,
      selected_verified_quality: winner.quality,
      quality_evidence_sha256: winner.quality_evidence_sha256,
      quality_slack: tolerance,
      estimated_cost_is_not_a_hard_limit: true,
      unknown_cost_excluded: unknownCost,
      candidates: eligible.length,
      priced_models_allowed: true,
    },
  };
}
