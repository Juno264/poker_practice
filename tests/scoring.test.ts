import { describe, it, expect } from 'vitest';
import { scoreAnswer, GRAY_THRESHOLD, EPS } from '../src/domain/scoring';
import type { Action, ActionFreqs } from '../src/domain/types';

describe('scoreAnswer', () => {
  it('pure range, correct answer: correct true, freqGap 0, isGray false', () => {
    const freqs: ActionFreqs = { raise: 1.0, fold: 0.0 };
    const actions: Action[] = ['raise', 'fold'];
    const result = scoreAnswer(freqs, actions, 'raise');
    expect(result.correct).toBe(true);
    expect(result.freqGap).toBe(0);
    expect(result.isGray).toBe(false);
  });

  it('pure range, wrong answer: freqGap 1.0, isGray false', () => {
    const freqs: ActionFreqs = { raise: 1.0, fold: 0.0 };
    const actions: Action[] = ['raise', 'fold'];
    const result = scoreAnswer(freqs, actions, 'fold');
    expect(result.correct).toBe(false);
    expect(result.freqGap).toBe(1.0);
    expect(result.isGray).toBe(false);
  });

  it('mixed 0.55/0.45: isGray true, either choice has freqGap <= 0.1', () => {
    const freqs: ActionFreqs = { raise: 0.55, fold: 0.45 };
    const actions: Action[] = ['raise', 'fold'];

    const chooseRaise = scoreAnswer(freqs, actions, 'raise');
    expect(chooseRaise.isGray).toBe(true);
    expect(chooseRaise.freqGap).toBeLessThanOrEqual(0.1);

    const chooseFold = scoreAnswer(freqs, actions, 'fold');
    expect(chooseFold.isGray).toBe(true);
    expect(chooseFold.freqGap).toBeLessThanOrEqual(0.1 + EPS);
  });

  it('boundary: gap exactly 0.15 (0.575/0.425) -> isGray false', () => {
    const freqs: ActionFreqs = { raise: 0.575, fold: 0.425 };
    const actions: Action[] = ['raise', 'fold'];
    const result = scoreAnswer(freqs, actions, 'raise');
    expect(result.isGray).toBe(false);
  });

  it('boundary: gap exactly 0.15 (0.60/0.45) -> isGray false', () => {
    const freqs: ActionFreqs = { raise: 0.6, fold: 0.45 };
    const actions: Action[] = ['raise', 'fold'];
    const result = scoreAnswer(freqs, actions, 'raise');
    // 0.60 - 0.45 in binary floating point is 0.15000000000000002,
    // which must still be treated as exactly 0.15 (not gray) thanks to EPS.
    expect(result.maxFreq - result.secondFreq).toBeCloseTo(GRAY_THRESHOLD, 9);
    expect(result.isGray).toBe(false);
  });

  it('boundary: gap 0.1499 -> isGray true', () => {
    const freqs: ActionFreqs = { raise: 0.5749, fold: 0.425, call: 0 };
    const actions: Action[] = ['raise', 'fold', 'call'];
    const result = scoreAnswer(freqs, actions, 'raise');
    expect(result.maxFreq - result.secondFreq).toBeCloseTo(0.1499, 9);
    expect(result.isGray).toBe(true);
  });

  it('tie 0.5/0.5: both correct true, bestActions.length === 2', () => {
    const freqs: ActionFreqs = { raise: 0.5, fold: 0.5 };
    const actions: Action[] = ['raise', 'fold'];

    const chooseRaise = scoreAnswer(freqs, actions, 'raise');
    expect(chooseRaise.correct).toBe(true);
    expect(chooseRaise.bestActions.length).toBe(2);
    expect(chooseRaise.bestActions).toContain('raise');
    expect(chooseRaise.bestActions).toContain('fold');

    const chooseFold = scoreAnswer(freqs, actions, 'fold');
    expect(chooseFold.correct).toBe(true);
    expect(chooseFold.bestActions.length).toBe(2);
  });

  it('three actions: secondFreq === 0.3, breakdown descending', () => {
    const freqs: ActionFreqs = { '3bet': 0.2, call: 0.5, fold: 0.3 };
    const actions: Action[] = ['3bet', 'call', 'fold'];
    const result = scoreAnswer(freqs, actions, 'call');
    expect(result.maxFreq).toBe(0.5);
    expect(result.secondFreq).toBe(0.3);
    expect(result.breakdown.map((b) => b.freq)).toEqual([0.5, 0.3, 0.2]);
    expect(result.breakdown.map((b) => b.action)).toEqual(['call', 'fold', '3bet']);
  });

  it('chosen not in actions -> throws', () => {
    const freqs: ActionFreqs = { raise: 1.0 };
    const actions: Action[] = ['raise', 'fold'];
    expect(() => scoreAnswer(freqs, actions, 'push')).toThrow();
  });

  it('actions not in freqs are treated as 0', () => {
    const freqs: ActionFreqs = { raise: 1.0 };
    const actions: Action[] = ['raise', 'fold'];
    const result = scoreAnswer(freqs, actions, 'fold');
    expect(result.chosenFreq).toBe(0);
  });

  it('secondFreq is 0 when actions.length === 1', () => {
    const freqs: ActionFreqs = { push: 1.0 };
    const actions: Action[] = ['push'];
    const result = scoreAnswer(freqs, actions, 'push');
    expect(result.secondFreq).toBe(0);
  });

  it('freqGap never goes negative due to floating point error', () => {
    const freqs: ActionFreqs = { raise: 0.1 + 0.2, fold: 0.3 };
    const actions: Action[] = ['raise', 'fold'];
    const result = scoreAnswer(freqs, actions, 'fold');
    expect(result.freqGap).toBeGreaterThanOrEqual(0);
  });

  it('EPS constant is exported and small', () => {
    expect(EPS).toBe(1e-9);
  });
});
