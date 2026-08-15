import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import type { Attempt } from '../src/domain/types';

/**
 * tests/local.test.ts — see docs/domain-contracts.md §7.
 *
 * Runs under `environment: 'node'` (vitest.config: no jsdom), so there is no
 * `localStorage` global by default. A minimal in-memory fake `Storage` is
 * installed on `globalThis.localStorage` before each test and removed after,
 * which also exercises local.ts's requirement to read `localStorage` lazily
 * rather than cache it at import time.
 */

class FakeStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

/** Fails the first `setItem` with QuotaExceededError, then succeeds. */
class QuotaOnceStorage extends FakeStorage {
  private failed = false;

  override setItem(key: string, value: string): void {
    if (!this.failed) {
      this.failed = true;
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    }
    super.setItem(key, value);
  }
}

/** Every method throws, simulating storage that is present but unusable. */
class ThrowingStorage implements Storage {
  get length(): number {
    throw new Error('access denied');
  }
  clear(): void {
    throw new Error('access denied');
  }
  getItem(): string | null {
    throw new Error('access denied');
  }
  key(): string | null {
    throw new Error('access denied');
  }
  removeItem(): void {
    throw new Error('access denied');
  }
  setItem(): void {
    throw new Error('access denied');
  }
}

function makeAttempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    ts: 1000,
    chartId: 'rfi-utg-100bb',
    hand: 'AKs',
    chosen: 'raise',
    correct: true,
    isGray: false,
    freqGap: 0,
    responseMs: 800,
    ...overrides,
  };
}

afterEach(() => {
  // @ts-expect-error -- test-only cleanup of a global that doesn't exist in node
  delete globalThis.localStorage;
});

describe('round-trip', () => {
  beforeEach(() => {
    globalThis.localStorage = new FakeStorage();
  });

  it('saves and loads attempts', async () => {
    const { saveAttempts, loadAttempts } = await import('../src/storage/local');
    const attempts = [makeAttempt({ ts: 1 }), makeAttempt({ ts: 2, chosen: 'fold', correct: false })];
    saveAttempts(attempts);
    expect(loadAttempts()).toEqual(attempts);
  });

  it('saves and loads weights', async () => {
    const { saveWeights, loadWeights } = await import('../src/storage/local');
    const weights = { 'chart1|AKs': 3.5, 'chart1|72o': 0.25 };
    saveWeights(weights);
    expect(loadWeights()).toEqual(weights);
  });

  it('loadAttempts returns [] when nothing is stored', async () => {
    const { loadAttempts } = await import('../src/storage/local');
    expect(loadAttempts()).toEqual([]);
  });

  it('loadWeights returns {} when nothing is stored', async () => {
    const { loadWeights } = await import('../src/storage/local');
    expect(loadWeights()).toEqual({});
  });

  it('resetAll removes both keys', async () => {
    const { saveAttempts, saveWeights, resetAll, loadAttempts, loadWeights, KEY_ATTEMPTS, KEY_WEIGHTS } =
      await import('../src/storage/local');
    saveAttempts([makeAttempt()]);
    saveWeights({ 'chart1|AKs': 2 });
    resetAll();
    expect(loadAttempts()).toEqual([]);
    expect(loadWeights()).toEqual({});
    expect((globalThis.localStorage as Storage).getItem(KEY_ATTEMPTS)).toBeNull();
    expect((globalThis.localStorage as Storage).getItem(KEY_WEIGHTS)).toBeNull();
  });

  it('resetWeights removes only the weights key', async () => {
    const { saveAttempts, saveWeights, resetWeights, loadAttempts, loadWeights } = await import(
      '../src/storage/local'
    );
    const attempts = [makeAttempt()];
    saveAttempts(attempts);
    saveWeights({ 'chart1|AKs': 2 });
    resetWeights();
    expect(loadWeights()).toEqual({});
    expect(loadAttempts()).toEqual(attempts);
  });
});

describe('corrupt / invalid data is discarded, never thrown', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = new FakeStorage();
    globalThis.localStorage = storage;
  });

  it('discards corrupt JSON and removes the key', async () => {
    const { loadAttempts, KEY_ATTEMPTS } = await import('../src/storage/local');
    storage.setItem(KEY_ATTEMPTS, '{ not valid json');
    expect(loadAttempts()).toEqual([]);
    expect(storage.getItem(KEY_ATTEMPTS)).toBeNull();
  });

  it('discards a mismatched storage version and removes the key', async () => {
    const { loadAttempts, KEY_ATTEMPTS } = await import('../src/storage/local');
    storage.setItem(KEY_ATTEMPTS, JSON.stringify({ v: 999, data: [makeAttempt()] }));
    expect(loadAttempts()).toEqual([]);
    expect(storage.getItem(KEY_ATTEMPTS)).toBeNull();
  });

  it('discards a well-formed envelope with the wrong shape', async () => {
    const { loadAttempts, KEY_ATTEMPTS, STORAGE_VERSION } = await import('../src/storage/local');
    storage.setItem(KEY_ATTEMPTS, JSON.stringify({ v: STORAGE_VERSION, data: { not: 'an array' } }));
    expect(loadAttempts()).toEqual([]);
    expect(storage.getItem(KEY_ATTEMPTS)).toBeNull();
  });

  it('discards attempts whose entries are missing required fields', async () => {
    const { loadAttempts, KEY_ATTEMPTS, STORAGE_VERSION } = await import('../src/storage/local');
    storage.setItem(
      KEY_ATTEMPTS,
      JSON.stringify({ v: STORAGE_VERSION, data: [{ ts: 1, chartId: 'x' }] }),
    );
    expect(loadAttempts()).toEqual([]);
    expect(storage.getItem(KEY_ATTEMPTS)).toBeNull();
  });

  it('discards weights whose values are not numbers', async () => {
    const { loadWeights, KEY_WEIGHTS, STORAGE_VERSION } = await import('../src/storage/local');
    storage.setItem(
      KEY_WEIGHTS,
      JSON.stringify({ v: STORAGE_VERSION, data: { 'chart1|AKs': 'not-a-number' } }),
    );
    expect(loadWeights()).toEqual({});
    expect(storage.getItem(KEY_WEIGHTS)).toBeNull();
  });
});

describe('quota handling', () => {
  it('drops the oldest half of attempts and retries once on QuotaExceededError', async () => {
    const storage = new QuotaOnceStorage();
    globalThis.localStorage = storage;

    const { saveAttempts, loadAttempts } = await import('../src/storage/local');
    const attempts = [
      makeAttempt({ ts: 1 }),
      makeAttempt({ ts: 2 }),
      makeAttempt({ ts: 3 }),
      makeAttempt({ ts: 4 }),
    ];

    expect(() => saveAttempts(attempts)).not.toThrow();

    const loaded = loadAttempts();
    expect(loaded).toEqual([makeAttempt({ ts: 3 }), makeAttempt({ ts: 4 })]);
  });

  it('gives up silently if the retry also fails', async () => {
    class AlwaysQuotaStorage extends FakeStorage {
      override setItem(): void {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      }
    }
    const storage = new AlwaysQuotaStorage();
    globalThis.localStorage = storage;

    const { saveAttempts, loadAttempts } = await import('../src/storage/local');
    expect(() => saveAttempts([makeAttempt()])).not.toThrow();
    expect(loadAttempts()).toEqual([]);
  });
});

describe('unusable storage never crashes exported functions', () => {
  beforeEach(() => {
    globalThis.localStorage = new ThrowingStorage();
  });

  it('every exported function degrades to a no-op / empty result', async () => {
    const { loadAttempts, saveAttempts, loadWeights, saveWeights, resetWeights, resetAll } =
      await import('../src/storage/local');

    expect(() => loadAttempts()).not.toThrow();
    expect(loadAttempts()).toEqual([]);

    expect(() => saveAttempts([makeAttempt()])).not.toThrow();
    expect(() => loadWeights()).not.toThrow();
    expect(loadWeights()).toEqual({});

    expect(() => saveWeights({ 'chart1|AKs': 1 })).not.toThrow();
    expect(() => resetWeights()).not.toThrow();
    expect(() => resetAll()).not.toThrow();
  });
});

describe('localStorage entirely absent or inaccessible', () => {
  it('does not throw when localStorage is undefined', async () => {
    // No beforeEach fake installed for this describe block; ensure it is unset.
    // @ts-expect-error -- test-only cleanup of a global that doesn't exist in node
    delete globalThis.localStorage;

    const { loadAttempts, saveAttempts, loadWeights, saveWeights, resetWeights, resetAll } =
      await import('../src/storage/local');

    expect(loadAttempts()).toEqual([]);
    expect(() => saveAttempts([makeAttempt()])).not.toThrow();
    expect(loadWeights()).toEqual({});
    expect(() => saveWeights({ a: 1 })).not.toThrow();
    expect(() => resetWeights()).not.toThrow();
    expect(() => resetAll()).not.toThrow();
  });

  it('does not throw when accessing the localStorage property itself throws', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get(): never {
        throw new Error('SecurityError: localStorage is disabled');
      },
    });

    const { loadAttempts, saveAttempts, loadWeights, saveWeights, resetWeights, resetAll } =
      await import('../src/storage/local');

    expect(() => loadAttempts()).not.toThrow();
    expect(loadAttempts()).toEqual([]);
    expect(() => saveAttempts([makeAttempt()])).not.toThrow();
    expect(() => loadWeights()).not.toThrow();
    expect(() => saveWeights({ a: 1 })).not.toThrow();
    expect(() => resetWeights()).not.toThrow();
    expect(() => resetAll()).not.toThrow();

    // @ts-expect-error -- restore for other tests
    delete globalThis.localStorage;
  });
});
