/**
 * Weighted question sampling. See docs/domain-contracts.md §4.
 *
 * Pure: no Date.now(), no Math.random(), no imports outside './types'.
 */

import type { Hand, Question } from './types';

export const W_INIT = 1.0;
export const W_MAX = 12.0;
export const W_MIN = 0.25;
export const W_WRONG = 3.0;
export const W_RIGHT = 0.6;
export const SLOW_MS = 5000;
export const COOLDOWN = 8;

export type WeightKey = string; // `${chartId}|${hand}`

export function weightKey(chartId: string, hand: Hand): WeightKey {
  return `${chartId}|${hand}`;
}

export function nextWeight(
  current: number,
  outcome: { correct: boolean; responseMs: number },
): number {
  if (!outcome.correct) {
    return Math.min(current * W_WRONG, W_MAX);
  }
  if (outcome.responseMs > SLOW_MS) {
    return current;
  }
  return Math.max(current * W_RIGHT, W_MIN);
}

export function pickQuestion(
  pool: readonly Question[],
  weights: Readonly<Record<WeightKey, number>>,
  recent: readonly WeightKey[],
  rng: () => number,
): Question {
  if (pool.length === 0) {
    throw new Error('pickQuestion: pool is empty');
  }

  const cooldownCount = Math.min(COOLDOWN, pool.length - 1);
  const excluded = new Set(recent.slice(recent.length - cooldownCount));

  const candidates = pool.filter((q) => !excluded.has(weightKey(q.chartId, q.hand)));

  const candidateWeights = candidates.map((q) => weights[weightKey(q.chartId, q.hand)] ?? W_INIT);

  const total = candidateWeights.reduce((sum, w) => sum + w, 0);

  if (!(total > 0)) {
    const idx = Math.floor(rng() * candidates.length);
    const clampedIdx = Math.min(idx, candidates.length - 1);
    return candidates[clampedIdx];
  }

  const r = rng() * total;
  let cumulative = 0;
  for (let i = 0; i < candidates.length; i++) {
    cumulative += candidateWeights[i];
    if (cumulative > r) {
      return candidates[i];
    }
  }
  // Floating point fallback: return the last candidate.
  return candidates[candidates.length - 1];
}

export function pushRecent(recent: readonly WeightKey[], key: WeightKey): WeightKey[] {
  const next = [...recent, key];
  if (next.length > COOLDOWN) {
    return next.slice(next.length - COOLDOWN);
  }
  return next;
}
