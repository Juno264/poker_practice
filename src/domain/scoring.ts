/**
 * Answer scoring. See docs/domain-contracts.md §3.
 *
 * Pure: no Date.now(), no Math.random(), no imports outside './types'.
 */

import type { Action, ActionFreqs } from './types';

export const GRAY_THRESHOLD = 0.15;
export const EPS = 1e-9;

export type ScoreResult = {
  chosen: Action;
  chosenFreq: number;
  maxFreq: number;
  secondFreq: number;
  freqGap: number; // 0.0-1.0
  isGray: boolean;
  correct: boolean;
  bestActions: Action[]; // argmax; ties yield multiple entries
  breakdown: { action: Action; freq: number }[]; // freq descending, for UI bars
};

export function scoreAnswer(
  freqs: ActionFreqs,
  actions: readonly Action[],
  chosen: Action,
): ScoreResult {
  if (!actions.includes(chosen)) {
    throw new Error(`scoreAnswer: chosen action "${chosen}" is not in actions list`);
  }

  const breakdown = actions
    .map((action) => ({ action, freq: freqs[action] ?? 0 }))
    .sort((a, b) => b.freq - a.freq);

  const maxFreq = breakdown[0].freq;
  const secondFreq = actions.length === 1 ? 0 : breakdown[1].freq;

  const chosenFreq = freqs[chosen] ?? 0;
  const freqGap = Math.max(0, maxFreq - chosenFreq);

  const correct = maxFreq - chosenFreq <= EPS;
  const isGray = maxFreq - secondFreq < GRAY_THRESHOLD - EPS;

  const bestActions = breakdown
    .filter((entry) => maxFreq - entry.freq <= EPS)
    .map((entry) => entry.action);

  return {
    chosen,
    chosenFreq,
    maxFreq,
    secondFreq,
    freqGap,
    isGray,
    correct,
    bestActions,
    breakdown,
  };
}
