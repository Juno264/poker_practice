import { describe, it, expect } from 'vitest';
import {
  drillReducer,
  initDrill,
  takePendingAttempts,
  type ChartLookup,
  type DrillState,
} from '../src/state/drill';
import { weightKey } from '../src/domain/sampler';
import type { Action, ActionFreqs, Hand, Question } from '../src/domain/types';

// Test-only chart data. Invented frequencies, not study data — never written to data/ranges/.
const TEST_ACTIONS: Action[] = ['raise', 'fold'];
const TEST_RANGES: Record<Hand, ActionFreqs> = {
  AA: { raise: 1.0, fold: 0.0 }, // pure: raise is strictly correct
  '72o': { raise: 0.0, fold: 1.0 }, // pure: fold is strictly correct
  AKs: { raise: 0.55, fold: 0.45 }, // gray: gap 0.1 < 0.15 threshold
} as unknown as Record<Hand, ActionFreqs>;

const lookup: ChartLookup = (chartId) => {
  if (chartId !== 'test_chart') {
    throw new Error(`unknown chart: ${chartId}`);
  }
  return { actions: TEST_ACTIONS, ranges: TEST_RANGES };
};

const reducer = drillReducer(lookup);

const q = (hand: Hand): Question => ({ chartId: 'test_chart', hand });

function freshState(first: Question): DrillState {
  return initDrill([q('AA'), q('72o'), q('AKs')], {}, first);
}

describe('drillReducer', () => {
  it('correct answer decays the weight', () => {
    const state = freshState(q('AA'));
    const next = reducer(state, { type: 'ANSWER', chosen: 'raise', responseMs: 800, ts: 1 });
    const key = weightKey('test_chart', 'AA');
    // W_INIT (1.0) * W_RIGHT (0.6) = 0.6
    expect(next.weights[key]).toBeCloseTo(0.6, 9);
  });

  it('wrong answer triples the weight', () => {
    const state = freshState(q('72o'));
    const next = reducer(state, { type: 'ANSWER', chosen: 'raise', responseMs: 800, ts: 1 });
    const key = weightKey('test_chart', '72o');
    // W_INIT (1.0) * W_WRONG (3.0) = 3.0
    expect(next.weights[key]).toBeCloseTo(3.0, 9);
  });

  it('gray hand does not move askedNonGray or correctNonGray', () => {
    const state = freshState(q('AKs'));
    const next = reducer(state, { type: 'ANSWER', chosen: 'raise', responseMs: 800, ts: 1 });
    expect(next.score?.isGray).toBe(true);
    expect(next.session.asked).toBe(1);
    expect(next.session.askedNonGray).toBe(0);
    expect(next.session.correctNonGray).toBe(0);
  });

  it('non-gray correct answer moves both asked and askedNonGray/correctNonGray', () => {
    const state = freshState(q('AA'));
    const next = reducer(state, { type: 'ANSWER', chosen: 'raise', responseMs: 800, ts: 1 });
    expect(next.score?.isGray).toBe(false);
    expect(next.session.asked).toBe(1);
    expect(next.session.askedNonGray).toBe(1);
    expect(next.session.correctNonGray).toBe(1);
    expect(next.session.responseMs).toEqual([800]);
  });

  it('ANSWER records one pending attempt with the right fields', () => {
    const state = freshState(q('AA'));
    const next = reducer(state, { type: 'ANSWER', chosen: 'fold', responseMs: 1234, ts: 999 });
    expect(next.pendingAttempts.length).toBe(1);
    expect(next.pendingAttempts[0]).toEqual({
      ts: 999,
      chartId: 'test_chart',
      hand: 'AA',
      chosen: 'fold',
      correct: false,
      isGray: false,
      freqGap: 1.0,
      responseMs: 1234,
    });
    expect(next.phase).toBe('feedback');
  });

  it('a second ANSWER while already in feedback phase is a no-op', () => {
    const state = freshState(q('AA'));
    const afterFirst = reducer(state, { type: 'ANSWER', chosen: 'raise', responseMs: 800, ts: 1 });
    const afterSecond = reducer(afterFirst, {
      type: 'ANSWER',
      chosen: 'fold',
      responseMs: 500,
      ts: 2,
    });
    expect(afterSecond).toBe(afterFirst);
    expect(afterSecond.pendingAttempts.length).toBe(1);
    expect(afterSecond.session.asked).toBe(1);
  });

  it('NEXT during question phase is a no-op', () => {
    const state = freshState(q('AA'));
    const next = reducer(state, { type: 'NEXT', question: q('72o') });
    expect(next).toBe(state);
    expect(next.current).toEqual(q('AA'));
    expect(next.phase).toBe('question');
  });

  it('NEXT during feedback phase advances to the given question and resets score', () => {
    const state = freshState(q('AA'));
    const afterAnswer = reducer(state, {
      type: 'ANSWER',
      chosen: 'raise',
      responseMs: 800,
      ts: 1,
    });
    const afterNext = reducer(afterAnswer, { type: 'NEXT', question: q('72o') });
    expect(afterNext.phase).toBe('question');
    expect(afterNext.current).toEqual(q('72o'));
    expect(afterNext.score).toBeNull();
  });

  it('RESET_WEIGHTS clears weights and recent but keeps session and pendingAttempts', () => {
    const state = freshState(q('AA'));
    const afterAnswer = reducer(state, {
      type: 'ANSWER',
      chosen: 'raise',
      responseMs: 800,
      ts: 1,
    });
    const afterReset = reducer(afterAnswer, { type: 'RESET_WEIGHTS' });
    expect(afterReset.weights).toEqual({});
    expect(afterReset.recent).toEqual([]);
    expect(afterReset.session).toEqual(afterAnswer.session);
    expect(afterReset.pendingAttempts).toEqual(afterAnswer.pendingAttempts);
  });

  it('takePendingAttempts empties the buffer without touching anything else', () => {
    const state = freshState(q('AA'));
    const afterAnswer = reducer(state, {
      type: 'ANSWER',
      chosen: 'raise',
      responseMs: 800,
      ts: 1,
    });
    expect(afterAnswer.pendingAttempts.length).toBe(1);
    const flushed = takePendingAttempts(afterAnswer);
    expect(flushed.pendingAttempts).toEqual([]);
    expect(flushed.session).toEqual(afterAnswer.session);
    expect(flushed.weights).toEqual(afterAnswer.weights);
  });

  it('never mutates the incoming state or its nested arrays/objects', () => {
    const state = freshState(q('AA'));
    const weightsBefore = state.weights;
    const recentBefore = state.recent;
    const sessionBefore = state.session;
    const pendingBefore = state.pendingAttempts;
    const frozen = Object.freeze({
      ...state,
      weights: Object.freeze({ ...state.weights }),
      session: Object.freeze({ ...state.session, responseMs: Object.freeze([...state.session.responseMs]) }),
    });

    // Reducer must not throw on a frozen state and must not touch it in place.
    expect(() =>
      reducer(frozen as DrillState, { type: 'ANSWER', chosen: 'raise', responseMs: 800, ts: 1 }),
    ).not.toThrow();

    expect(state.weights).toBe(weightsBefore);
    expect(state.recent).toBe(recentBefore);
    expect(state.session).toBe(sessionBefore);
    expect(state.pendingAttempts).toBe(pendingBefore);
    expect(state.weights).toEqual({});
    expect(state.recent).toEqual([]);
    expect(state.session).toEqual({ asked: 0, askedNonGray: 0, correctNonGray: 0, responseMs: [] });
    expect(state.pendingAttempts).toEqual([]);
  });

  it('cooldown: recent grows across multiple ANSWER calls without mutating prior arrays', () => {
    const state = freshState(q('AA'));
    const afterFirst = reducer(state, { type: 'ANSWER', chosen: 'raise', responseMs: 100, ts: 1 });
    const recentAfterFirst = afterFirst.recent;
    const afterNext = reducer(afterFirst, { type: 'NEXT', question: q('72o') });
    const afterSecond = reducer(afterNext, {
      type: 'ANSWER',
      chosen: 'fold',
      responseMs: 100,
      ts: 2,
    });
    expect(recentAfterFirst).toEqual([weightKey('test_chart', 'AA')]);
    expect(afterSecond.recent).toEqual([
      weightKey('test_chart', 'AA'),
      weightKey('test_chart', '72o'),
    ]);
    // Earlier array untouched.
    expect(recentAfterFirst).toEqual([weightKey('test_chart', 'AA')]);
  });
});
