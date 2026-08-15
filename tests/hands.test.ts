import { describe, it, expect } from 'vitest';
import {
  ALL_HANDS,
  normalizeHand,
  handToGridPos,
  gridPosToHand,
  comboCount,
  isPair,
  isSuited,
} from '../src/domain/hands';

describe('ALL_HANDS', () => {
  it('has 169 hands with no duplicates', () => {
    expect(ALL_HANDS.length).toBe(169);
    expect(new Set(ALL_HANDS).size).toBe(169);
  });

  it('has 13 pairs, 78 suited, 78 offsuit', () => {
    const pairs = ALL_HANDS.filter((h) => isPair(h));
    const suited = ALL_HANDS.filter((h) => isSuited(h));
    const offsuit = ALL_HANDS.filter((h) => !isPair(h) && !isSuited(h));
    expect(pairs.length).toBe(13);
    expect(suited.length).toBe(78);
    expect(offsuit.length).toBe(78);
  });
});

describe('handToGridPos / gridPosToHand round-trip', () => {
  it('round-trips every hand through grid coordinates', () => {
    for (const h of ALL_HANDS) {
      const pos = handToGridPos(h);
      expect(gridPosToHand(pos.row, pos.col)).toBe(h);
    }
  });

  it('produces 169 distinct grid coordinates', () => {
    const coords = new Set(ALL_HANDS.map((h) => {
      const { row, col } = handToGridPos(h);
      return `${row},${col}`;
    }));
    expect(coords.size).toBe(169);
  });
});

describe('normalizeHand', () => {
  it('throws on reversed rank order', () => {
    expect(() => normalizeHand('KAs')).toThrow();
  });

  it('lowercases and normalizes suit suffix casing', () => {
    expect(normalizeHand('aks')).toBe('AKs');
  });

  it('throws on "10Ts"', () => {
    expect(() => normalizeHand('10Ts')).toThrow();
  });
});

describe('comboCount', () => {
  it('returns 6 for a pair', () => {
    expect(comboCount('AA')).toBe(6);
  });

  it('returns 4 for a suited hand', () => {
    expect(comboCount('AKs')).toBe(4);
  });

  it('returns 12 for an offsuit hand', () => {
    expect(comboCount('AKo')).toBe(12);
  });
});
