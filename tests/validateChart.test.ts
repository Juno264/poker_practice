import { describe, expect, it } from 'vitest';
import { validateChart } from '../src/domain/validateChart';

import validMinimal from './fixtures/valid_minimal.json';
import invalidBadHandKey from './fixtures/invalid_bad_hand_key.json';
import invalidFreqSum from './fixtures/invalid_freq_sum.json';
import invalidUnknownAction from './fixtures/invalid_unknown_action.json';
import invalidMissingSourceName from './fixtures/invalid_missing_source_name.json';
import invalidMissingFoldAction from './fixtures/invalid_missing_fold_action.json';

function errorCodes(issues: ReturnType<typeof validateChart>): string[] {
  return issues.filter((i) => i.level === 'error').map((i) => i.code);
}

describe('validateChart — fixtures', () => {
  it('valid_minimal.json produces no errors (missing-hands / suspicious-monotonicity warn is allowed)', () => {
    const issues = validateChart(validMinimal, 'valid_minimal.json');
    expect(errorCodes(issues)).toEqual([]);
    for (const issue of issues) {
      expect(issue.level).toBe('warn');
      expect(['missing-hands', 'suspicious-monotonicity']).toContain(issue.code);
    }
  });

  it('invalid_bad_hand_key.json triggers bad-hand-key', () => {
    const issues = validateChart(invalidBadHandKey, 'invalid_bad_hand_key.json');
    expect(errorCodes(issues)).toContain('bad-hand-key');
  });

  it('invalid_freq_sum.json triggers freq-sum', () => {
    const issues = validateChart(invalidFreqSum, 'invalid_freq_sum.json');
    expect(errorCodes(issues)).toContain('freq-sum');
  });

  it('invalid_unknown_action.json triggers unknown-action', () => {
    const issues = validateChart(invalidUnknownAction, 'invalid_unknown_action.json');
    expect(errorCodes(issues)).toContain('unknown-action');
  });

  it('invalid_missing_source_name.json triggers missing-source-name', () => {
    const issues = validateChart(invalidMissingSourceName, 'invalid_missing_source_name.json');
    expect(errorCodes(issues)).toContain('missing-source-name');
  });

  it('invalid_missing_fold_action.json triggers missing-fold-action', () => {
    const issues = validateChart(invalidMissingFoldAction, 'invalid_missing_fold_action.json');
    expect(errorCodes(issues)).toContain('missing-fold-action');
  });
});

describe('validateChart — frequency tolerance (§5, inline objects)', () => {
  // Split the target sum across two actions so each individual frequency
  // stays within the valid [0, 1] range (otherwise bad-freq would also fire).
  function chartWithSum(sum: number): unknown {
    const half = sum / 2;
    return {
      schema_version: 1,
      id: 'freq-tolerance-test',
      format: '6max',
      stack_bb: 100,
      spot: 'RFI',
      hero_position: 'BTN',
      villain_position: null,
      actions: ['raise', 'fold'],
      source: { name: 'inline test fixture' },
      ranges: {
        AA: { raise: half, fold: half },
      },
    };
  }

  it('sum 0.999 passes (within 1.0 ± 0.01)', () => {
    const issues = validateChart(chartWithSum(0.999), 'inline-0.999');
    expect(errorCodes(issues)).not.toContain('freq-sum');
  });

  it('sum 1.001 passes (within 1.0 ± 0.01)', () => {
    const issues = validateChart(chartWithSum(1.001), 'inline-1.001');
    expect(errorCodes(issues)).not.toContain('freq-sum');
  });

  it('sum 0.98 fails (outside 1.0 ± 0.01)', () => {
    const issues = validateChart(chartWithSum(0.98), 'inline-0.98');
    expect(errorCodes(issues)).toContain('freq-sum');
  });
});

describe('validateChart — remaining §5 codes not covered by a dedicated fixture', () => {
  const base = {
    schema_version: 1,
    id: 'inline-chart',
    format: '6max',
    stack_bb: 100,
    spot: 'RFI',
    hero_position: 'BTN',
    villain_position: null,
    actions: ['raise', 'fold'],
    source: { name: 'inline test fixture' },
    ranges: { AA: { raise: 1.0, fold: 0.0 } },
  };

  it('bad-schema: raw is not an object', () => {
    const issues = validateChart('not an object', 'inline-not-object');
    expect(errorCodes(issues)).toContain('bad-schema');
  });

  it('bad-schema: schema_version !== 1', () => {
    const issues = validateChart({ ...base, schema_version: 2 }, 'inline-schema-version');
    expect(errorCodes(issues)).toContain('bad-schema');
  });

  it('bad-schema: required field missing', () => {
    const { stack_bb: _omit, ...rest } = base;
    const issues = validateChart(rest, 'inline-missing-field');
    expect(errorCodes(issues)).toContain('bad-schema');
  });

  it('unknown-enum: bad spot value', () => {
    const issues = validateChart({ ...base, spot: 'not_a_spot' }, 'inline-unknown-spot');
    expect(errorCodes(issues)).toContain('unknown-enum');
  });

  it('unknown-enum: bad hero_position value', () => {
    const issues = validateChart({ ...base, hero_position: 'ZZ' }, 'inline-unknown-position');
    expect(errorCodes(issues)).toContain('unknown-enum');
  });

  it('duplicate-hand: two raw keys normalize to the same hand', () => {
    const issues = validateChart(
      { ...base, ranges: { AA: { raise: 1.0, fold: 0.0 }, aa: { raise: 1.0, fold: 0.0 } } },
      'inline-duplicate-hand',
    );
    expect(errorCodes(issues)).toContain('duplicate-hand');
  });

  it('bad-freq: frequency is not a number', () => {
    const issues = validateChart(
      { ...base, ranges: { AA: { raise: 'a lot', fold: 0.0 } } },
      'inline-bad-freq-nan',
    );
    expect(errorCodes(issues)).toContain('bad-freq');
  });

  it('bad-freq: frequency is negative', () => {
    const issues = validateChart(
      { ...base, ranges: { AA: { raise: -0.1, fold: 1.1 } } },
      'inline-bad-freq-negative',
    );
    expect(errorCodes(issues)).toContain('bad-freq');
  });

  it('bad-freq: frequency is greater than 1', () => {
    const issues = validateChart(
      { ...base, ranges: { AA: { raise: 1.5, fold: 0.0 } } },
      'inline-bad-freq-over-one',
    );
    expect(errorCodes(issues)).toContain('bad-freq');
  });
});

describe('validateChart — suspicious-monotonicity (new WARNING check)', () => {
  // 76s is a stronger hand than 65s (gap-1 ladder). Builds a minimal chart
  // containing only those two hands, with the given "fold" frequency for each
  // (entry frequency = 1 - fold).
  function chartWithFolds(strongerFold: number, weakerFold: number): unknown {
    return {
      schema_version: 1,
      id: 'monotonicity-test',
      format: '6max',
      stack_bb: 100,
      spot: 'RFI',
      hero_position: 'BTN',
      villain_position: null,
      actions: ['raise', 'fold'],
      source: { name: 'inline test fixture' },
      ranges: {
        '76s': { raise: 1 - strongerFold, fold: strongerFold },
        '65s': { raise: 1 - weakerFold, fold: weakerFold },
      },
    };
  }

  function warnCodes(issues: ReturnType<typeof validateChart>): string[] {
    return issues.filter((i) => i.level === 'warn').map((i) => i.code);
  }

  it('flags a weaker hand (76s vs 65s) played more often than the stronger one, naming the stronger hand', () => {
    // 65s entry 0.9 (fold 0.1), 76s entry 0.1 (fold 0.9) — the weaker hand
    // (65s) is played far more often than the stronger hand (76s).
    const issues = validateChart(chartWithFolds(0.9, 0.1), 'inline-monotonicity-violation');
    const monotonicity = issues.filter((i) => i.code === 'suspicious-monotonicity');
    expect(monotonicity.length).toBeGreaterThan(0);
    expect(monotonicity.every((i) => i.level === 'warn')).toBe(true);
    expect(monotonicity.some((i) => i.hand === '76s')).toBe(true);
  });

  it('a clean monotone chart (stronger hand played at least as often) produces no warning', () => {
    // 76s entry 0.9 (fold 0.1), 65s entry 0.1 (fold 0.9) — correctly monotone.
    const issues = validateChart(chartWithFolds(0.1, 0.9), 'inline-monotonicity-clean');
    expect(warnCodes(issues)).not.toContain('suspicious-monotonicity');
  });

  it('a gap of exactly 0.05 does not warn', () => {
    // strong entry 0.40 (fold 0.60), weak entry 0.45 (fold 0.55) => delta 0.05
    const issues = validateChart(chartWithFolds(0.6, 0.55), 'inline-monotonicity-boundary-no-warn');
    expect(warnCodes(issues)).not.toContain('suspicious-monotonicity');
  });

  it('a gap of 0.06 does warn', () => {
    // strong entry 0.40 (fold 0.60), weak entry 0.46 (fold 0.54) => delta 0.06
    const issues = validateChart(chartWithFolds(0.6, 0.54), 'inline-monotonicity-boundary-warn');
    expect(warnCodes(issues)).toContain('suspicious-monotonicity');
  });

  it('a chart whose actions lack "fold" produces no suspicious-monotonicity warning', () => {
    const chart = {
      schema_version: 1,
      id: 'monotonicity-no-fold-action',
      format: '6max',
      stack_bb: 100,
      spot: 'RFI',
      hero_position: 'BTN',
      villain_position: null,
      actions: ['raise', 'limp'],
      source: { name: 'inline test fixture' },
      ranges: {
        '76s': { raise: 0.1, limp: 0.9 },
        '65s': { raise: 0.9, limp: 0.1 },
      },
    };
    const issues = validateChart(chart, 'inline-monotonicity-no-fold-action');
    expect(warnCodes(issues)).not.toContain('suspicious-monotonicity');
  });
});
