import { describe, expect, it } from 'vitest';
import { ALL_HANDS } from '../src/domain/hands';
import type { RawRangeChart } from '../src/domain/types';
import { buildCharts, CHARTS, getChart, poolFor, type RawChartEntry } from '../src/data/loadCharts';

/** A minimal, fully-populated, valid raw chart. Callers override fields via `overrides`. */
function makeValidRaw(overrides: Partial<RawRangeChart> = {}): RawRangeChart {
  const ranges: RawRangeChart['ranges'] = {};
  for (const hand of ALL_HANDS) {
    ranges[hand] = { raise: 1, fold: 0 };
  }
  return {
    schema_version: 1,
    id: 'fixture_chart',
    format: '6max',
    stack_bb: 100,
    spot: 'RFI',
    hero_position: 'UTG',
    villain_position: null,
    actions: ['raise', 'fold'],
    source: { name: 'test fixture', retrieved_at: '2026-08-15', entered_by: 'test' },
    ranges,
    ...overrides,
  };
}

describe('loadCharts: real data (data/ranges/*.json via import.meta.glob)', () => {
  it('loads all five real charts', () => {
    expect(CHARTS.length).toBe(5);
  });

  it('orders charts UTG, HJ, CO, BTN, SB (not alphabetical, not filename order)', () => {
    expect(CHARTS.map((c) => c.heroPosition)).toEqual(['UTG', 'HJ', 'CO', 'BTN', 'SB']);
  });

  it('every chart has exactly 169 hands', () => {
    for (const chart of CHARTS) {
      expect(Object.keys(chart.ranges).length).toBe(169);
      for (const hand of ALL_HANDS) {
        expect(chart.ranges[hand]).toBeDefined();
      }
    }
  });

  it('SB has three actions (raise, limp, fold); the other four have two (raise, fold)', () => {
    for (const chart of CHARTS) {
      if (chart.heroPosition === 'SB') {
        expect(chart.actions.length).toBe(3);
        expect([...chart.actions].sort()).toEqual(['fold', 'limp', 'raise']);
      } else {
        expect(chart.actions.length).toBe(2);
        expect([...chart.actions].sort()).toEqual(['fold', 'raise']);
      }
    }
  });

  it('getChart finds a chart by id and throws on an unknown id', () => {
    const btn = CHARTS[3]!;
    expect(btn.heroPosition).toBe('BTN');
    expect(getChart(btn.id)).toEqual(btn);
    expect(() => getChart('no-such-chart')).toThrow();
  });

  it('poolFor orders questions by the given chart order, then ALL_HANDS order', () => {
    const btnId = CHARTS[3]!.id; // BTN
    const utgId = CHARTS[0]!.id; // UTG
    const pool = poolFor([btnId, utgId]);

    expect(pool.length).toBe(ALL_HANDS.length * 2);
    expect(pool[0]).toEqual({ chartId: btnId, hand: ALL_HANDS[0] });
    expect(pool[ALL_HANDS.length - 1]).toEqual({ chartId: btnId, hand: ALL_HANDS[ALL_HANDS.length - 1] });
    expect(pool[ALL_HANDS.length]).toEqual({ chartId: utgId, hand: ALL_HANDS[0] });
  });

  it('poolFor throws on an unknown chart id', () => {
    expect(() => poolFor(['no-such-chart'])).toThrow();
  });
});

describe('loadCharts: buildCharts (pure raw -> RangeChart transform)', () => {
  it('fills a missing hand with { fold: 1.0 } and still yields all 169 hands', () => {
    const raw = makeValidRaw();
    delete raw.ranges['72o'];

    const entries: RawChartEntry[] = [{ label: 'fixture', raw }];
    const charts = buildCharts(entries);

    expect(charts.length).toBe(1);
    expect(charts[0]!.ranges['72o']).toEqual({ fold: 1.0 });
    expect(Object.keys(charts[0]!.ranges).length).toBe(169);
  });

  it('converts snake_case to camelCase', () => {
    const raw = makeValidRaw({ stack_bb: 100, hero_position: 'CO', villain_position: null });
    const charts = buildCharts([{ label: 'fixture', raw }]);

    expect(charts[0]!.stackBb).toBe(100);
    expect(charts[0]!.heroPosition).toBe('CO');
    expect(charts[0]!.villainPosition).toBeNull();
    expect(charts[0]!.schemaVersion).toBe(1);
  });

  it('throws when a chart fails validation (e.g. empty source.name)', () => {
    const raw = makeValidRaw({ source: { name: '' } });
    const entries: RawChartEntry[] = [{ label: 'bad-fixture', raw }];

    expect(() => buildCharts(entries)).toThrow();
  });

  it('throws on duplicate chart ids', () => {
    const a = makeValidRaw({ id: 'dup', hero_position: 'UTG' });
    const b = makeValidRaw({ id: 'dup', hero_position: 'HJ' });
    const entries: RawChartEntry[] = [
      { label: 'a', raw: a },
      { label: 'b', raw: b },
    ];

    expect(() => buildCharts(entries)).toThrow();
  });
});
