/**
 * Preflop hand notation helpers. See docs/domain-contracts.md §2.
 *
 * Pure: no React, no DOM, no Date.now(), no Math.random().
 */

import type { Hand, Rank } from './types';
import { RANKS } from './types';

/** Runtime check that narrows a string to `Rank`. */
function isRank(c: string): c is Rank {
  return (RANKS as readonly string[]).includes(c);
}

/**
 * All 169 hands, row-major over the 13x13 grid.
 * `index = row * 13 + col`; `row` and `col` both follow `RANKS` order (0 = A).
 *   row === col → pair
 *   row < col   → suited  (RANKS[row] + RANKS[col] + 's')
 *   row > col   → offsuit (RANKS[col] + RANKS[row] + 'o')
 */
export const ALL_HANDS: readonly Hand[] = (() => {
  const hands: Hand[] = [];
  for (let row = 0; row < RANKS.length; row++) {
    for (let col = 0; col < RANKS.length; col++) {
      hands.push(gridPosToHand(row, col));
    }
  }
  return hands;
})();

/**
 * Parse and normalize a hand string.
 *
 * Accepts: mixed case (`aks` → `AKs`, `AKS` → `AKs`); `10` as a stand-in for
 * `T`; leading/trailing whitespace (trimmed only, not interior whitespace).
 *
 * Throws on: reversed rank order (`KAs` — never silently reordered); a
 * suffix on a pair (`AAs`, `AAo`); a missing suffix on a non-pair (`AK`);
 * unknown characters or wrong length (`XX`, `AKss`, empty string).
 */
export function normalizeHand(input: string): Hand {
  const trimmed = input.trim();
  const withT = trimmed.replace(/10/g, 'T');

  if (withT.length !== 2 && withT.length !== 3) {
    throw new Error(`normalizeHand: invalid hand string "${input}"`);
  }

  const rank1 = withT[0]!.toUpperCase();
  const rank2 = withT[1]!.toUpperCase();

  if (!isRank(rank1) || !isRank(rank2)) {
    throw new Error(`normalizeHand: unknown rank in "${input}"`);
  }

  const isPairInput = rank1 === rank2;
  const rawSuffix = withT.length === 3 ? withT[2]!.toLowerCase() : undefined;

  if (rawSuffix !== undefined && rawSuffix !== 's' && rawSuffix !== 'o') {
    throw new Error(`normalizeHand: unknown suffix in "${input}"`);
  }

  if (isPairInput && rawSuffix !== undefined) {
    throw new Error(`normalizeHand: pair cannot have a suffix "${input}"`);
  }
  if (!isPairInput && rawSuffix === undefined) {
    throw new Error(`normalizeHand: non-pair requires a suffix "${input}"`);
  }

  const i1 = RANKS.indexOf(rank1);
  const i2 = RANKS.indexOf(rank2);
  if (i1 > i2) {
    throw new Error(`normalizeHand: rank order reversed in "${input}"`);
  }

  if (isPairInput) {
    return (rank1 + rank2) as Hand;
  }
  return (rank1 + rank2 + rawSuffix) as Hand;
}

/** Inverse of `gridPosToHand`. */
export function handToGridPos(h: Hand): { row: number; col: number } {
  const r1 = h[0] as Rank;
  const r2 = h[1] as Rank;
  const i1 = RANKS.indexOf(r1);
  const i2 = RANKS.indexOf(r2);

  if (h.length === 2) {
    return { row: i1, col: i1 };
  }

  const suffix = h[2];
  if (suffix === 's') {
    return { row: i1, col: i2 };
  }
  return { row: i2, col: i1 };
}

/** Inverse of `handToGridPos`. See `ALL_HANDS` for the grid layout rule. */
export function gridPosToHand(row: number, col: number): Hand {
  if (row === col) {
    return (RANKS[row] + RANKS[row]) as Hand;
  }
  if (row < col) {
    return (RANKS[row] + RANKS[col] + 's') as Hand;
  }
  return (RANKS[col] + RANKS[row] + 'o') as Hand;
}

/** Number of concrete card combinations a hand represents: pair 6, suited 4, offsuit 12. */
export function comboCount(h: Hand): number {
  if (isPair(h)) return 6;
  if (isSuited(h)) return 4;
  return 12;
}

export function isPair(h: Hand): boolean {
  return h.length === 2;
}

export function isSuited(h: Hand): boolean {
  return h.length === 3 && h[2] === 's';
}
