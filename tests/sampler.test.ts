import { describe, it, expect } from 'vitest';
import {
  nextWeight,
  pickQuestion,
  pushRecent,
  weightKey,
  W_MAX,
  W_MIN,
  COOLDOWN,
} from '../src/domain/sampler';
import type { WeightKey } from '../src/domain/sampler';
import type { Question } from '../src/domain/types';

/**
 * Small seeded linear congruential generator, for deterministic tests only.
 * Not exported from the domain module; the contract explicitly asks for it
 * to live in the test file instead of adding a dependency.
 */
function makeLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // Numerical Recipes LCG constants.
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296; // in [0, 1)
  };
}

describe('nextWeight', () => {
  it('wrong answer multiplies by 3, capping at W_MAX', () => {
    expect(nextWeight(2, { correct: false, responseMs: 1000 })).toBe(6); // 2*3=6, below cap
    expect(nextWeight(10, { correct: false, responseMs: 1000 })).toBe(W_MAX); // 10*3=30, capped at 12
  });

  it('wrong answer reaches the W_MAX ceiling and stays there', () => {
    let w = 1.0;
    for (let i = 0; i < 20; i++) {
      w = nextWeight(w, { correct: false, responseMs: 1000 });
    }
    expect(w).toBe(W_MAX);
  });

  it('correct fast answer floors at W_MIN', () => {
    expect(nextWeight(0.3, { correct: true, responseMs: 100 })).toBe(W_MIN); // 0.3*0.6=0.18, floored at 0.25
  });

  it('correct answer at exactly 5000ms counts as fast (decays)', () => {
    const result = nextWeight(1.0, { correct: true, responseMs: 5000 });
    expect(result).toBeCloseTo(0.6, 9);
  });

  it('correct answer at 5001ms counts as slow (unchanged)', () => {
    const result = nextWeight(1.0, { correct: true, responseMs: 5001 });
    expect(result).toBe(1.0);
  });
});

describe('pickQuestion', () => {
  it('distribution: weight 3:1 over 10,000 draws is roughly 3:1 (+-5%)', () => {
    const pool: Question[] = [
      { chartId: 'c1', hand: 'AKs' },
      { chartId: 'c1', hand: '72o' },
    ];
    const weights: Record<WeightKey, number> = {
      [weightKey('c1', 'AKs')]: 3,
      [weightKey('c1', '72o')]: 1,
    };
    const rng = makeLcg(12345);

    let countAKs = 0;
    let count72o = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
      const q = pickQuestion(pool, weights, [], rng);
      if (q.hand === 'AKs') countAKs++;
      else count72o++;
    }

    const ratio = countAKs / count72o;
    expect(ratio).toBeGreaterThan(3 * 0.95);
    expect(ratio).toBeLessThan(3 * 1.05);
  });

  it('hands seen in the last 8 questions are not returned', () => {
    const pool: Question[] = [
      { chartId: 'c1', hand: 'AKs' },
      { chartId: 'c1', hand: 'KQs' },
      { chartId: 'c1', hand: 'QJs' },
    ];
    const weights: Record<WeightKey, number> = {};
    const recent: WeightKey[] = [weightKey('c1', 'AKs'), weightKey('c1', 'KQs')];
    const rng = () => 0.999999; // pushes toward the last-in-order candidate

    for (let i = 0; i < 50; i++) {
      const q = pickQuestion(pool, weights, recent, rng);
      expect(q.hand).toBe('QJs');
    }
  });

  it('pool.length === 1 always returns that hand even if it is in recent', () => {
    const pool: Question[] = [{ chartId: 'c1', hand: 'AKs' }];
    const weights: Record<WeightKey, number> = {};
    const recent: WeightKey[] = [weightKey('c1', 'AKs')];
    const rng = () => 0.5;

    const q = pickQuestion(pool, weights, recent, rng);
    expect(q.hand).toBe('AKs');
  });

  it('all weights zero does not throw and picks uniformly among candidates', () => {
    const pool: Question[] = [
      { chartId: 'c1', hand: 'AKs' },
      { chartId: 'c1', hand: 'KQs' },
    ];
    const weights: Record<WeightKey, number> = {
      [weightKey('c1', 'AKs')]: 0,
      [weightKey('c1', 'KQs')]: 0,
    };
    expect(() => pickQuestion(pool, weights, [], () => 0)).not.toThrow();
    const q = pickQuestion(pool, weights, [], () => 0);
    expect(['AKs', 'KQs']).toContain(q.hand);
  });

  it('empty pool throws', () => {
    expect(() => pickQuestion([], {}, [], () => 0)).toThrow();
  });

  it('is deterministic given the same arguments including rng state', () => {
    const pool: Question[] = [
      { chartId: 'c1', hand: 'AKs' },
      { chartId: 'c1', hand: 'KQs' },
      { chartId: 'c1', hand: 'QJs' },
    ];
    const weights: Record<WeightKey, number> = {
      [weightKey('c1', 'AKs')]: 2,
      [weightKey('c1', 'KQs')]: 5,
      [weightKey('c1', 'QJs')]: 1,
    };
    const rng1 = makeLcg(42);
    const rng2 = makeLcg(42);

    const results1: string[] = [];
    const results2: string[] = [];
    for (let i = 0; i < 20; i++) {
      results1.push(pickQuestion(pool, weights, [], rng1).hand);
      results2.push(pickQuestion(pool, weights, [], rng2).hand);
    }
    expect(results1).toEqual(results2);
  });
});

describe('pushRecent', () => {
  it('appends to the tail', () => {
    const result = pushRecent(['a', 'b'], 'c');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('drops from the front once length exceeds COOLDOWN', () => {
    const initial: WeightKey[] = Array.from({ length: COOLDOWN }, (_, i) => `k${i}`);
    const result = pushRecent(initial, 'new');
    expect(result.length).toBe(COOLDOWN);
    expect(result[result.length - 1]).toBe('new');
    expect(result).not.toContain('k0');
  });

  it('does not mutate the input array', () => {
    const initial: WeightKey[] = ['a', 'b'];
    const copy = [...initial];
    pushRecent(initial, 'c');
    expect(initial).toEqual(copy);
  });
});
