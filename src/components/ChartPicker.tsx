/**
 * Chart selection screen. Pick one of the five RFI charts, or the mixed
 * "全部混ぜる" option combining all five, then start the drill.
 */

import { useState } from 'react';
import type { RangeChart } from '../domain/types';

type ChartPickerProps = {
  charts: readonly RangeChart[];
  onStart: (chartIds: string[]) => void;
};

type Selection = { kind: 'chart'; id: string } | { kind: 'all' };

export default function ChartPicker({ charts, onStart }: ChartPickerProps) {
  const [selection, setSelection] = useState<Selection | null>(null);

  function handleStart() {
    if (selection === null) return;
    const ids = selection.kind === 'all' ? charts.map((chart) => chart.id) : [selection.id];
    onStart(ids);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden px-4 pt-8">
      <h1 className="text-xl font-bold">レンジを選ぶ</h1>
      <p className="mt-1 text-sm text-white/50">練習するオープンレンジを1つ選んでください。</p>

      <div className="mt-6 flex flex-1 flex-col gap-2 overflow-y-auto pb-4">
        {charts.map((chart) => {
          const selected = selection?.kind === 'chart' && selection.id === chart.id;
          return (
            <button
              key={chart.id}
              type="button"
              onClick={() => setSelection({ kind: 'chart', id: chart.id })}
              className={`min-h-12 rounded-xl border px-4 py-3 text-left text-base font-semibold ${
                selected ? 'border-white bg-white/15' : 'border-white/15 bg-white/5'
              }`}
            >
              {chart.heroPosition}
              <span className="ml-2 text-sm font-normal text-white/50">オープンレンジ</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setSelection({ kind: 'all' })}
          className={`min-h-12 rounded-xl border px-4 py-3 text-left text-base font-semibold ${
            selection?.kind === 'all' ? 'border-white bg-white/15' : 'border-white/15 bg-white/5'
          }`}
        >
          全部混ぜる
          <span className="ml-2 text-sm font-normal text-white/50">5レンジをまとめて出題</span>
        </button>
      </div>

      <button
        type="button"
        disabled={selection === null}
        onClick={handleStart}
        style={{ marginBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        className="h-14 shrink-0 rounded-xl bg-white text-base font-bold text-[#0b0f14] disabled:bg-white/20 disabled:text-white/40"
      >
        開始
      </button>
    </div>
  );
}
