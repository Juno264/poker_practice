/**
 * Drill state reducer. See docs/domain-contracts.md §6.6.
 *
 * Pure: no Date.now(), no Math.random(), no localStorage, no React imports.
 * All non-deterministic values (RNG draws, timestamps) arrive in the event payload.
 */

import type { Action, ActionFreqs, Attempt, Hand, Question } from '../domain/types';
import { scoreAnswer, type ScoreResult } from '../domain/scoring';
import { nextWeight, pushRecent, weightKey, W_INIT, type WeightKey } from '../domain/sampler';

/**
 * Supplies the chart data the reducer needs to score an answer, without the
 * reducer importing the (non-domain) loader module directly.
 */
export type ChartLookup = (
  chartId: string,
) => { actions: readonly Action[]; ranges: Record<Hand, ActionFreqs> };

export type DrillState = {
  phase: 'question' | 'feedback';
  pool: readonly Question[];
  current: Question;
  score: ScoreResult | null;
  recent: readonly WeightKey[];
  weights: Record<WeightKey, number>;
  session: { asked: number; askedNonGray: number; correctNonGray: number; responseMs: number[] };
  pendingAttempts: readonly Attempt[];
};

export type DrillEvent =
  | { type: 'ANSWER'; chosen: Action; responseMs: number; ts: number }
  | { type: 'NEXT'; question: Question }
  | { type: 'RESET_WEIGHTS' };

export function initDrill(
  pool: readonly Question[],
  weights: Record<WeightKey, number>,
  first: Question,
): DrillState {
  return {
    phase: 'question',
    pool,
    current: first,
    score: null,
    recent: [],
    weights,
    session: { asked: 0, askedNonGray: 0, correctNonGray: 0, responseMs: [] },
    pendingAttempts: [],
  };
}

export function drillReducer(charts: ChartLookup): (state: DrillState, event: DrillEvent) => DrillState {
  return (state: DrillState, event: DrillEvent): DrillState => {
    switch (event.type) {
      case 'ANSWER': {
        if (state.phase !== 'question') {
          return state;
        }

        const { chartId, hand } = state.current;
        const chart = charts(chartId);
        const freqs = chart.ranges[hand];
        const score = scoreAnswer(freqs, chart.actions, event.chosen);

        const key = weightKey(chartId, hand);
        const currentWeight = state.weights[key] ?? W_INIT;
        const updatedWeight = nextWeight(currentWeight, {
          correct: score.correct,
          responseMs: event.responseMs,
        });

        const attempt: Attempt = {
          ts: event.ts,
          chartId,
          hand,
          chosen: event.chosen,
          correct: score.correct,
          isGray: score.isGray,
          freqGap: score.freqGap,
          responseMs: event.responseMs,
        };

        return {
          ...state,
          phase: 'feedback',
          score,
          weights: { ...state.weights, [key]: updatedWeight },
          recent: pushRecent(state.recent, key),
          pendingAttempts: [...state.pendingAttempts, attempt],
          session: {
            asked: state.session.asked + 1,
            askedNonGray: state.session.askedNonGray + (score.isGray ? 0 : 1),
            correctNonGray:
              state.session.correctNonGray + (!score.isGray && score.correct ? 1 : 0),
            responseMs: [...state.session.responseMs, event.responseMs],
          },
        };
      }

      case 'NEXT': {
        if (state.phase !== 'feedback') {
          return state;
        }

        return {
          ...state,
          phase: 'question',
          current: event.question,
          score: null,
        };
      }

      case 'RESET_WEIGHTS': {
        return {
          ...state,
          weights: {},
          recent: [],
        };
      }

      default:
        return state;
    }
  };
}

/** Empties `pendingAttempts`, for use after the caller flushes them to storage. */
export function takePendingAttempts(state: DrillState): DrillState {
  return { ...state, pendingAttempts: [] };
}
