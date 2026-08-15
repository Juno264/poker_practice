/**
 * Range chart validator. See docs/domain-contracts.md §5.
 *
 * Pure: no file I/O, no console output, no process.exit. Takes an `unknown`
 * value (raw JSON.parse output) and a display label, returns the list of
 * problems found. `scripts/validate-ranges.ts` is the I/O shell around this.
 */

import type { Hand } from './types';
import { ACTIONS, POSITIONS, SPOTS } from './types';
import { ALL_HANDS, normalizeHand } from './hands';

export type IssueLevel = 'error' | 'warn';
export type ValidationIssue = { level: IssueLevel; code: string; message: string; hand?: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function err(code: string, message: string, hand?: string): ValidationIssue {
  return hand === undefined ? { level: 'error', code, message } : { level: 'error', code, message, hand };
}

function warnIssue(code: string, message: string, hand?: string): ValidationIssue {
  return hand === undefined ? { level: 'warn', code, message } : { level: 'warn', code, message, hand };
}

const FREQ_TOLERANCE = 0.01;

export function validateChart(raw: unknown, label: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(raw)) {
    issues.push(err('bad-schema', `${label}: top-level value must be a JSON object`));
    return issues;
  }

  const obj = raw;

  // --- schema_version --------------------------------------------------
  if (typeof obj.schema_version !== 'number') {
    issues.push(err('bad-schema', `${label}: "schema_version" is missing or not a number`));
  } else if (obj.schema_version !== 1) {
    issues.push(err('bad-schema', `${label}: "schema_version" must be 1, got ${obj.schema_version}`));
  }

  // --- id ----------------------------------------------------------------
  if (typeof obj.id !== 'string') {
    issues.push(err('bad-schema', `${label}: "id" is missing or not a string`));
  }

  // --- format --------------------------------------------------------------
  if (typeof obj.format !== 'string') {
    issues.push(err('bad-schema', `${label}: "format" is missing or not a string`));
  }

  // --- stack_bb ------------------------------------------------------------
  if (typeof obj.stack_bb !== 'number' || !Number.isFinite(obj.stack_bb)) {
    issues.push(err('bad-schema', `${label}: "stack_bb" is missing or not a number`));
  }

  // --- spot ------------------------------------------------------------------
  if (typeof obj.spot !== 'string') {
    issues.push(err('bad-schema', `${label}: "spot" is missing or not a string`));
  } else if (!(SPOTS as readonly string[]).includes(obj.spot)) {
    issues.push(err('unknown-enum', `${label}: "spot" value "${obj.spot}" is not a known spot`));
  }

  // --- hero_position -----------------------------------------------------
  if (typeof obj.hero_position !== 'string') {
    issues.push(err('bad-schema', `${label}: "hero_position" is missing or not a string`));
  } else if (!(POSITIONS as readonly string[]).includes(obj.hero_position)) {
    issues.push(err('unknown-enum', `${label}: "hero_position" value "${obj.hero_position}" is not a known position`));
  }

  // --- villain_position ----------------------------------------------------
  if (obj.villain_position !== null && typeof obj.villain_position !== 'string') {
    issues.push(err('bad-schema', `${label}: "villain_position" must be a string or null`));
  } else if (
    typeof obj.villain_position === 'string' &&
    !(POSITIONS as readonly string[]).includes(obj.villain_position)
  ) {
    issues.push(
      err('unknown-enum', `${label}: "villain_position" value "${obj.villain_position}" is not a known position`),
    );
  }

  // --- actions ---------------------------------------------------------------
  let declaredActions: string[] | null = null;
  if (!Array.isArray(obj.actions) || !obj.actions.every((a) => typeof a === 'string')) {
    issues.push(err('bad-schema', `${label}: "actions" is missing or not an array of strings`));
  } else {
    declaredActions = obj.actions as string[];
    for (const a of declaredActions) {
      if (!(ACTIONS as readonly string[]).includes(a)) {
        issues.push(err('unknown-enum', `${label}: action "${a}" in "actions" is not a known action`));
      }
    }
  }

  // --- source ------------------------------------------------------------------
  if (!isPlainObject(obj.source)) {
    issues.push(err('bad-schema', `${label}: "source" is missing or not an object`));
  } else {
    const source = obj.source;
    if (typeof source.name !== 'string' || source.name.trim().length === 0) {
      issues.push(err('missing-source-name', `${label}: "source.name" is missing or empty`));
    }
    for (const key of ['url', 'retrieved_at', 'entered_by', 'notes'] as const) {
      if (key in source && source[key] !== undefined && typeof source[key] !== 'string') {
        issues.push(err('bad-schema', `${label}: "source.${key}" must be a string`));
      }
    }
  }

  // --- ranges ------------------------------------------------------------------
  const validHands = new Set<Hand>();
  if (!isPlainObject(obj.ranges)) {
    issues.push(err('bad-schema', `${label}: "ranges" is missing or not an object`));
  } else {
    const ranges = obj.ranges;
    for (const [rawKey, rawFreqs] of Object.entries(ranges)) {
      let normalized: Hand | null = null;
      try {
        const n = normalizeHand(rawKey);
        normalized = n;
        if (n !== rawKey) {
          issues.push(
            err('bad-hand-key', `${label}: hand key "${rawKey}" is not canonical (normalizes to "${n}")`, rawKey),
          );
        }
      } catch {
        issues.push(err('bad-hand-key', `${label}: hand key "${rawKey}" is not a valid hand`, rawKey));
      }

      if (normalized !== null) {
        if (validHands.has(normalized)) {
          issues.push(err('duplicate-hand', `${label}: hand "${normalized}" appears more than once`, normalized));
        } else {
          validHands.add(normalized);
        }
      }

      if (!isPlainObject(rawFreqs)) {
        issues.push(err('bad-schema', `${label}: frequencies for hand "${rawKey}" must be an object`, rawKey));
        continue;
      }

      let sum = 0;
      for (const [action, value] of Object.entries(rawFreqs)) {
        if (declaredActions !== null && !declaredActions.includes(action)) {
          issues.push(
            err('unknown-action', `${label}: hand "${rawKey}" has action "${action}" not declared in "actions"`, rawKey),
          );
        }

        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
          issues.push(
            err(
              'bad-freq',
              `${label}: hand "${rawKey}" action "${action}" has an invalid frequency (${JSON.stringify(value)})`,
              rawKey,
            ),
          );
        } else {
          sum += value;
        }
      }

      if (Math.abs(sum - 1) > FREQ_TOLERANCE) {
        issues.push(
          err('freq-sum', `${label}: hand "${rawKey}" frequencies sum to ${sum}, expected 1.0 ± ${FREQ_TOLERANCE}`, rawKey),
        );
      }
    }
  }

  // --- missing-fold-action / missing-hands --------------------------------------
  const missingHands = ALL_HANDS.filter((h) => !validHands.has(h));
  if (missingHands.length > 0) {
    if (declaredActions !== null && !declaredActions.includes('fold')) {
      issues.push(
        err(
          'missing-fold-action',
          `${label}: ${missingHands.length} hand(s) are missing and "actions" has no "fold" to fall back to`,
        ),
      );
    }
    const preview = missingHands.slice(0, 10).join(', ');
    issues.push(
      warnIssue(
        'missing-hands',
        `${label}: ${missingHands.length} of ${ALL_HANDS.length} hands are missing (first 10: ${preview})`,
      ),
    );
  }

  return issues;
}
