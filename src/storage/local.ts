/**
 * localStorage persistence. See docs/domain-contracts.md §7 and
 * docs/architecture.md §4.
 *
 * The only impure non-UI module. Not imported by src/domain/.
 *
 * Every exported function must degrade to a no-op / empty result rather than
 * throw, even when `localStorage` itself is unavailable (private browsing,
 * disabled storage) or access to it throws. `localStorage` is therefore read
 * lazily inside each function rather than cached at module load, so tests can
 * install a fake after import.
 */

import type { Attempt } from '../domain/types';

/**
 * The sampler's `WeightKey` is `${chartId}|${hand}`, but it is declared as a
 * plain `string` there. Mirrored here (not imported — see task note) so this
 * module has no dependency on src/domain/sampler.ts.
 */
type WeightKey = string;

export const KEY_ATTEMPTS = 'preflop-trainer:v1:attempts';
export const KEY_WEIGHTS = 'preflop-trainer:v1:weights';
export const STORAGE_VERSION = 1;

type Envelope<T> = { v: number; data: T };

/** Returns `localStorage` if it is reachable, or `null` if access itself throws. */
function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isAction(x: unknown): x is Attempt['chosen'] {
  return (
    x === 'fold' || x === 'call' || x === 'raise' || x === '3bet' || x === 'push' || x === 'limp'
  );
}

/** Structural check sufficient to guarantee the declared `Attempt` shape. */
function isAttempt(x: unknown): x is Attempt {
  if (typeof x !== 'object' || x === null) return false;
  const a = x as Record<string, unknown>;
  return (
    typeof a.ts === 'number' &&
    typeof a.chartId === 'string' &&
    typeof a.hand === 'string' &&
    isAction(a.chosen) &&
    typeof a.correct === 'boolean' &&
    typeof a.isGray === 'boolean' &&
    typeof a.freqGap === 'number' &&
    typeof a.responseMs === 'number'
  );
}

function isAttemptArray(x: unknown): x is Attempt[] {
  return Array.isArray(x) && x.every(isAttempt);
}

function isWeightsMap(x: unknown): x is Record<WeightKey, number> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  return Object.values(x as Record<string, unknown>).every((v) => typeof v === 'number');
}

/**
 * Reads and validates the envelope at `key`. On any failure — missing key,
 * corrupt JSON, wrong `v`, or a shape that fails `isValid` — removes the key
 * and returns `fallback`. Never throws.
 */
function loadEnvelope<T>(key: string, isValid: (data: unknown) => data is T, fallback: T): T {
  const storage = getStorage();
  if (!storage) return fallback;

  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return fallback;
  }
  if (raw === null) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    removeItem(storage, key);
    return fallback;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    (parsed as { v?: unknown }).v !== STORAGE_VERSION ||
    !isValid((parsed as { data?: unknown }).data)
  ) {
    removeItem(storage, key);
    return fallback;
  }

  return (parsed as Envelope<T>).data;
}

function removeItem(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing we can do; the corrupt value stays but callers already got a
    // safe fallback for this read.
  }
}

function isQuotaExceededError(err: unknown): boolean {
  return (
    typeof DOMException !== 'undefined' &&
    err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)
  );
}

/** Writes an envelope to `key`. Never throws. */
function saveEnvelope<T>(key: string, data: T): void {
  const storage = getStorage();
  if (!storage) return;

  const envelope: Envelope<T> = { v: STORAGE_VERSION, data };
  let json: string;
  try {
    json = JSON.stringify(envelope);
  } catch {
    return;
  }

  try {
    storage.setItem(key, json);
  } catch (err) {
    if (!isQuotaExceededError(err)) return;

    // Only `attempts` has a well-defined "drop the oldest half" recovery.
    if (key === KEY_ATTEMPTS && Array.isArray(data)) {
      const attempts = data as unknown as Attempt[];
      const kept = attempts.slice(Math.ceil(attempts.length / 2));
      const retryEnvelope: Envelope<Attempt[]> = { v: STORAGE_VERSION, data: kept };
      try {
        const retryJson = JSON.stringify(retryEnvelope);
        storage.setItem(key, retryJson);
      } catch {
        // Give up silently. The drill must never break because storage is full.
      }
    }
    // No documented recovery for other keys on quota errors; give up silently.
  }
}

export function loadAttempts(): Attempt[] {
  return loadEnvelope(KEY_ATTEMPTS, isAttemptArray, []);
}

export function saveAttempts(attempts: readonly Attempt[]): void {
  saveEnvelope(KEY_ATTEMPTS, attempts as Attempt[]);
}

export function loadWeights(): Record<WeightKey, number> {
  return loadEnvelope(KEY_WEIGHTS, isWeightsMap, {});
}

export function saveWeights(weights: Readonly<Record<WeightKey, number>>): void {
  saveEnvelope(KEY_WEIGHTS, weights as Record<WeightKey, number>);
}

export function resetWeights(): void {
  const storage = getStorage();
  if (!storage) return;
  removeItem(storage, KEY_WEIGHTS);
}

export function resetAll(): void {
  const storage = getStorage();
  if (!storage) return;
  removeItem(storage, KEY_ATTEMPTS);
  removeItem(storage, KEY_WEIGHTS);
}
