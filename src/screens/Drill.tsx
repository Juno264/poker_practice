/**
 * Drill screen. Owns the reducer, the reaction-time clock, and persistence
 * timing. See docs/architecture.md §3-4 and docs/domain-contracts.md §6.6.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react';
import type { Action } from '../domain/types';
import { pickQuestion } from '../domain/sampler';
import { getChart, poolFor } from '../data/loadCharts';
import {
  drillReducer,
  initDrill,
  takePendingAttempts,
  type DrillEvent,
  type DrillState,
} from '../state/drill';
import { loadAttempts, loadWeights, resetWeights, saveAttempts, saveWeights } from '../storage/local';
import ActionButtons, { computeSlots } from '../components/ActionButtons';
import HandDisplay from '../components/HandDisplay';
import Feedback from '../components/Feedback';
import SessionCounter from '../components/SessionCounter';

/** Number of answers between periodic attempt flushes (architecture.md §4). */
const FLUSH_EVERY = 10;

const answerReducer = drillReducer(getChart);

/** Extends the pure DrillEvent union with a screen-local "flush done" event. */
type ScreenEvent = DrillEvent | { type: 'FLUSHED' };

function reducer(state: DrillState, event: ScreenEvent): DrillState {
  if (event.type === 'FLUSHED') {
    return takePendingAttempts(state);
  }
  return answerReducer(state, event);
}

function initState(chartIds: readonly string[]): DrillState {
  const pool = poolFor(chartIds);
  const weights = loadWeights();
  const first = pickQuestion(pool, weights, [], Math.random);
  return initDrill(pool, weights, first);
}

type DrillProps = {
  chartIds: readonly string[];
  onExit: () => void;
};

export default function Drill({ chartIds, onExit }: DrillProps) {
  const [state, dispatch] = useReducer(reducer, chartIds, initState);

  const slots = useMemo(() => {
    const actionSets = chartIds.map((id) => getChart(id).actions);
    return computeSlots(actionSets);
  }, [chartIds]);

  const currentChart = getChart(state.current.chartId);

  // Reaction-time clock: starts the instant a question becomes visible and
  // its buttons are operable, not when the question is merely queued.
  const questionStartRef = useRef(0);
  useLayoutEffect(() => {
    if (state.phase === 'question') {
      questionStartRef.current = performance.now();
    }
  }, [state.phase, state.current]);

  function handleChoose(chosen: Action) {
    if (state.phase !== 'question') return;
    const responseMs = performance.now() - questionStartRef.current;
    dispatch({ type: 'ANSWER', chosen, responseMs, ts: Date.now() });
  }

  function handleNext() {
    if (state.phase !== 'feedback') return;
    const question = pickQuestion(state.pool, state.weights, state.recent, Math.random);
    dispatch({ type: 'NEXT', question });
  }

  function handleResetWeights() {
    if (!window.confirm('出題の重みをリセットしますか？苦手ハンドの優先出題が初期状態に戻ります。')) {
      return;
    }
    resetWeights();
    dispatch({ type: 'RESET_WEIGHTS' });
  }

  // Persist weights after every answer (and after a reset).
  useEffect(() => {
    saveWeights(state.weights);
  }, [state.weights]);

  // Buffer attempts in state; flush every FLUSH_EVERY answers, on pagehide,
  // and when the tab becomes hidden. Storage failures never break the drill
  // (src/storage/local.ts swallows them).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const flushAttempts = useCallback(() => {
    const pending = stateRef.current.pendingAttempts;
    if (pending.length === 0) return;
    saveAttempts([...loadAttempts(), ...pending]);
    dispatch({ type: 'FLUSHED' });
  }, []);

  useEffect(() => {
    if (state.pendingAttempts.length >= FLUSH_EVERY) {
      flushAttempts();
    }
  }, [state.pendingAttempts, flushAttempts]);

  useEffect(() => {
    function handlePageHide() {
      flushAttempts();
    }
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') flushAttempts();
    }
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flushAttempts]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3 text-xs text-white/50">
        <button type="button" onClick={onExit} className="shrink-0">
          ‹ 選択に戻る
        </button>
        <SessionCounter
          askedNonGray={state.session.askedNonGray}
          correctNonGray={state.session.correctNonGray}
          responseMs={state.session.responseMs}
        />
        <button type="button" onClick={handleResetWeights} className="shrink-0">
          重みをリセット
        </button>
      </header>

      {state.phase === 'question' ? (
        <>
          <main className="flex flex-1 flex-col items-center justify-center px-4">
            <HandDisplay hand={state.current.hand} heroPosition={currentChart.heroPosition} />
          </main>
          <ActionButtons slots={slots} active={currentChart.actions} onChoose={handleChoose} />
        </>
      ) : (
        state.score !== null && (
          <Feedback
            score={state.score}
            hand={state.current.hand}
            chartLabel={`${currentChart.heroPosition} オープン`}
            onNext={handleNext}
          />
        )
      )}
    </div>
  );
}
