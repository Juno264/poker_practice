/**
 * Bottom action bar. See docs/domain-contracts.md §6.7.
 *
 * Slot layout is computed once for the whole session (by `computeSlots`,
 * from the union of every selected chart's actions) and stays constant
 * across questions. A chart that doesn't use a given slot's action still
 * renders an equally-sized empty spacer there, so button positions never
 * shift and reaction-time measurement stays clean.
 *
 * No transition/animation classes here on purpose: the buttons must be
 * usable the instant they mount.
 */

import { useEffect } from 'react';
import type { Action } from '../domain/types';

const LEFT: readonly Action[] = ['fold'];
const CENTER: readonly Action[] = ['limp', 'call'];
const RIGHT: readonly Action[] = ['raise', '3bet', 'push'];

const LABELS: Record<Action, string> = {
  fold: 'フォールド',
  call: 'コール',
  raise: 'レイズ',
  '3bet': '3ベット',
  push: 'オールイン',
  limp: 'リンプ',
};

/** CLAUDE.md §9: R=raise, C=call, F=fold, 3=3bet. */
const KEY_MAP: Partial<Record<string, Action>> = {
  f: 'fold',
  c: 'call',
  r: 'raise',
  '3': '3bet',
};

function toneClass(action: Action): string {
  if (action === 'fold') {
    return 'bg-rose-500/15 text-rose-100 active:bg-rose-500/25';
  }
  if (action === 'raise' || action === '3bet' || action === 'push') {
    return 'bg-emerald-500/15 text-emerald-100 active:bg-emerald-500/25';
  }
  return 'bg-white/10 text-white active:bg-white/20';
}

/**
 * Fixed left-to-right slot order for a set of charts: fold leftmost,
 * limp/call centre, raise/3bet/push rightmost. Only actions actually used
 * by at least one of the given action sets get a slot.
 */
export function computeSlots(actionSets: readonly (readonly Action[])[]): Action[] {
  const present = new Set<Action>();
  for (const set of actionSets) {
    for (const action of set) {
      present.add(action);
    }
  }
  return [...LEFT, ...CENTER, ...RIGHT].filter((action) => present.has(action));
}

type ActionButtonsProps = {
  /** Fixed slot order for the whole session. */
  slots: readonly Action[];
  /** Actions the current question actually accepts (subset of `slots`). */
  active: readonly Action[];
  onChoose: (action: Action) => void;
};

export default function ActionButtons({ slots, active, onChoose }: ActionButtonsProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const action = KEY_MAP[event.key.toLowerCase()];
      if (action !== undefined && active.includes(action)) {
        onChoose(action);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, onChoose]);

  return (
    <div
      className="flex shrink-0 gap-2 px-3 pt-2"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
    >
      {slots.map((action) => {
        if (!active.includes(action)) {
          return <div key={action} aria-hidden="true" className="h-14 flex-1" />;
        }
        return (
          <button
            key={action}
            type="button"
            onClick={() => onChoose(action)}
            className={`h-14 flex-1 rounded-xl text-base font-semibold ${toneClass(action)}`}
          >
            {LABELS[action]}
          </button>
        );
      })}
    </div>
  );
}
