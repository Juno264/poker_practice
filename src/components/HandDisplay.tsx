/**
 * The question itself: hand + hero position. Rendered with no
 * animation/transition — this is the thing whose appearance starts the
 * reaction-time clock, so it must be usable-looking the instant it mounts.
 */

import type { Hand, Position } from '../domain/types';

type HandDisplayProps = {
  hand: Hand;
  heroPosition: Position;
};

export default function HandDisplay({ hand, heroPosition }: HandDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium tracking-wide text-white/60">
        {heroPosition} オープン
      </span>
      <span className="text-7xl font-bold leading-none tracking-tight">{hand}</span>
    </div>
  );
}
