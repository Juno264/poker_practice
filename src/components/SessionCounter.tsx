/**
 * Small, non-distracting session summary shown at the top of the drill:
 * non-gray correct/asked and median response time (seconds, one decimal).
 */

type SessionCounterProps = {
  askedNonGray: number;
  correctNonGray: number;
  responseMs: readonly number[];
};

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export default function SessionCounter({
  askedNonGray,
  correctNonGray,
  responseMs,
}: SessionCounterProps) {
  const medianMs = median(responseMs);
  const medianLabel = medianMs === null ? '--' : (medianMs / 1000).toFixed(1);

  return (
    <div className="flex items-center gap-2 text-xs text-white/50">
      <span className="tabular-nums">
        正答 {correctNonGray}/{askedNonGray}
      </span>
      <span aria-hidden="true">・</span>
      <span className="tabular-nums">中央値 {medianLabel}秒</span>
    </div>
  );
}
