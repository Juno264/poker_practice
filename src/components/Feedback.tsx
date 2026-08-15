/**
 * Post-answer feedback. Shows the chosen action's frequency, a frequency
 * breakdown bar for every action, and an explicit gray-zone note when
 * applicable. Tapping anywhere (or the "次へ" button) advances.
 *
 * `freqGap` is a frequency difference, never described as an EV loss
 * (CLAUDE.md §2.3).
 */

import type { ScoreResult } from '../domain/scoring';
import type { Action } from '../domain/types';

const LABELS: Record<Action, string> = {
  fold: 'フォールド',
  call: 'コール',
  raise: 'レイズ',
  '3bet': '3ベット',
  push: 'オールイン',
  limp: 'リンプ',
};

function pct(freq: number): string {
  return `${Math.round(freq * 100)}%`;
}

type FeedbackProps = {
  score: ScoreResult;
  onNext: () => void;
};

export default function Feedback({ score, onNext }: FeedbackProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onNext}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onNext();
      }}
      className="flex flex-1 flex-col justify-between overflow-hidden px-4 py-3"
    >
      <div className="flex flex-col gap-3 overflow-y-auto">
        <p className="text-lg font-bold">
          {score.correct ? '正解' : '不正解'}
          <span className="ml-2 text-sm font-normal text-white/60">
            選択: {LABELS[score.chosen]}（{pct(score.chosenFreq)}）
          </span>
        </p>

        {score.isGray && (
          <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            ここは混合戦略のハンドです。頻度差が小さく、どちらを選んでも大きな損はありません。
          </p>
        )}

        <div className="flex flex-col gap-2">
          {score.breakdown.map((entry) => (
            <div key={entry.action} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span>{LABELS[entry.action]}</span>
                <span className="tabular-nums text-white/70">{pct(entry.freq)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/10">
                <div className="h-2 rounded-full bg-white/50" style={{ width: pct(entry.freq) }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onNext();
        }}
        className="mt-3 h-14 shrink-0 rounded-xl bg-white/15 text-base font-semibold active:bg-white/25"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        次へ
      </button>
    </div>
  );
}
