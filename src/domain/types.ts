/**
 * Shared domain types. See docs/domain-contracts.md §1.
 *
 * This module is pure: no React, no DOM, no Date.now(), no Math.random().
 */

export type Rank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';

/** Descending rank order. Also the row/column order of the 13x13 grid (index 0 = A). */
export const RANKS: readonly Rank[] = [
  'A',
  'K',
  'Q',
  'J',
  'T',
  '9',
  '8',
  '7',
  '6',
  '5',
  '4',
  '3',
  '2',
];

/**
 * Canonical hand notation: pairs have no suffix, non-pairs are suited or offsuit
 * with the higher rank first (`AKs`, never `KAs`).
 *
 * The template literal type still admits logically impossible strings such as
 * `AAs`; runtime rejection is `normalizeHand`'s and the validator's job.
 */
export type Hand = `${Rank}${Rank}` | `${Rank}${Rank}s` | `${Rank}${Rank}o`;

export type Action = 'fold' | 'call' | 'raise' | '3bet' | 'push' | 'limp';
export const ACTIONS: readonly Action[] = ['fold', 'call', 'raise', '3bet', 'push', 'limp'];

export type Position = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
export const POSITIONS: readonly Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

export type Spot = 'RFI' | 'vs_RFI' | 'vs_3bet' | 'push_fold';
export const SPOTS: readonly Spot[] = ['RFI', 'vs_RFI', 'vs_3bet', 'push_fold'];

/** Frequencies for one hand. Actions absent from the map are treated as 0. */
export type ActionFreqs = Partial<Record<Action, number>>;

/** A range chart exactly as it appears on disk (snake_case, unvalidated). */
export type RawRangeChart = {
  schema_version: number;
  id: string;
  format: string;
  stack_bb: number;
  spot: string;
  hero_position: string;
  villain_position: string | null;
  actions: string[];
  source: {
    name: string;
    url?: string;
    retrieved_at?: string;
    entered_by?: string;
    notes?: string;
  };
  ranges: Record<string, Record<string, number>>;
};

/** A validated, normalized chart. `ranges` holds all 169 hands. */
export type RangeChart = {
  schemaVersion: 1;
  id: string;
  format: string;
  stackBb: number;
  spot: Spot;
  heroPosition: Position;
  villainPosition: Position | null;
  actions: readonly Action[];
  source: {
    name: string;
    url?: string;
    retrievedAt?: string;
    enteredBy?: string;
    notes?: string;
  };
  ranges: Record<Hand, ActionFreqs>;
};

/** One drilled question: a hand drawn from a specific chart. */
export type Question = { chartId: string; hand: Hand };

/** One answered question, persisted for statistics. */
export type Attempt = {
  /** epoch ms */
  ts: number;
  chartId: string;
  hand: Hand;
  chosen: Action;
  /** strict correctness; gray-zone hands are reported separately */
  correct: boolean;
  isGray: boolean;
  /** 0.0-1.0 frequency difference, NOT an EV loss */
  freqGap: number;
  responseMs: number;
};
