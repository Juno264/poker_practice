/**
 * Chart loading module. See docs/domain-contracts.md §6.5.
 *
 * Reads the raw snake_case chart JSON from `data/ranges/`, validates each one
 * with `validateChart`, and converts it into the camelCase `RangeChart` shape
 * with all 169 hands present. This is the only place the snake_case ->
 * camelCase conversion happens.
 */

import type { Action, ActionFreqs, Hand, Position, Question, RangeChart, RawRangeChart, Spot } from '../domain/types';
import { ALL_HANDS } from '../domain/hands';
import { validateChart } from '../domain/validateChart';

/** RFI chart display/build order. Not alphabetical, not filename order. */
const POSITION_ORDER: readonly Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB'];

function positionRank(p: Position): number {
  const i = POSITION_ORDER.indexOf(p);
  return i === -1 ? POSITION_ORDER.length : i;
}

/** One raw JSON module keyed by its glob path, for error labeling. */
export type RawChartEntry = { label: string; raw: unknown };

/**
 * Converts a single already-validated raw chart into the normalized,
 * camelCase `RangeChart`. Fills any of the 169 hands missing from the raw
 * `ranges` object with `{ fold: 1.0 }`.
 *
 * Caller must have already run `validateChart` and confirmed there are no
 * errors — this function does not re-check shape.
 */
function toRangeChart(raw: RawRangeChart): RangeChart {
  const ranges = {} as Record<Hand, ActionFreqs>;

  for (const hand of ALL_HANDS) {
    const rawFreqs = raw.ranges[hand];
    if (rawFreqs === undefined) {
      ranges[hand] = { fold: 1.0 };
      continue;
    }
    const freqs: ActionFreqs = {};
    for (const [action, value] of Object.entries(rawFreqs)) {
      freqs[action as Action] = value;
    }
    ranges[hand] = freqs;
  }

  return {
    schemaVersion: 1,
    id: raw.id,
    format: raw.format,
    stackBb: raw.stack_bb,
    spot: raw.spot as Spot,
    heroPosition: raw.hero_position as Position,
    villainPosition: raw.villain_position as Position | null,
    actions: raw.actions as readonly Action[],
    source: {
      name: raw.source.name,
      url: raw.source.url,
      retrievedAt: raw.source.retrieved_at,
      enteredBy: raw.source.entered_by,
      notes: raw.source.notes,
    },
    ranges,
  };
}

/**
 * Pure transformation: raw JSON entries -> validated, normalized charts,
 * sorted UTG, HJ, CO, BTN, SB. Throws if any chart has a validation error or
 * if two charts share an `id`. Warnings go to `console.warn` only.
 *
 * Kept separate from the `import.meta.glob` call so tests can exercise it
 * directly with fixture objects.
 */
export function buildCharts(entries: readonly RawChartEntry[]): RangeChart[] {
  const seenIds = new Set<string>();
  const charts: RangeChart[] = [];

  for (const { label, raw } of entries) {
    const issues = validateChart(raw, label);

    for (const issue of issues) {
      if (issue.level === 'warn') {
        console.warn(`[loadCharts] ${issue.code}: ${issue.message}`);
      }
    }

    const errors = issues.filter((issue) => issue.level === 'error');
    if (errors.length > 0) {
      const details = errors.map((e) => `  - ${e.code}: ${e.message}`).join('\n');
      throw new Error(`loadCharts: ${label} failed validation:\n${details}`);
    }

    const chart = toRangeChart(raw as RawRangeChart);

    if (seenIds.has(chart.id)) {
      throw new Error(`loadCharts: duplicate chart id "${chart.id}" (from ${label})`);
    }
    seenIds.add(chart.id);

    charts.push(chart);
  }

  charts.sort((a, b) => positionRank(a.heroPosition) - positionRank(b.heroPosition));

  return charts;
}

function loadRawEntries(): RawChartEntry[] {
  // import.meta.glob's result type carries no shape guarantee for the JSON
  // payload, so it's narrowed through `unknown` here and left for
  // `validateChart` (via `buildCharts`) to actually check.
  const modules = import.meta.glob('../../data/ranges/*.json', { eager: true }) as unknown as Record<
    string,
    { default: unknown }
  >;

  return Object.entries(modules)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, mod]) => ({ label: path, raw: mod.default }));
}

/** All charts, validated and normalized, ordered UTG, HJ, CO, BTN, SB. */
export const CHARTS: readonly RangeChart[] = buildCharts(loadRawEntries());

/** Looks up a chart by id. Throws on an unknown id. */
export function getChart(id: string): RangeChart {
  const chart = CHARTS.find((c) => c.id === id);
  if (chart === undefined) {
    throw new Error(`getChart: unknown chart id "${id}"`);
  }
  return chart;
}

/**
 * One `Question` per (chart, hand) pair for the given chart ids, ordered by
 * `chartIds` first and `ALL_HANDS` second.
 */
export function poolFor(chartIds: readonly string[]): Question[] {
  const pool: Question[] = [];
  for (const chartId of chartIds) {
    const chart = getChart(chartId);
    for (const hand of ALL_HANDS) {
      pool.push({ chartId: chart.id, hand });
    }
  }
  return pool;
}
