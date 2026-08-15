import { useState } from 'react';
import { CHARTS } from './data/loadCharts';
import ChartPicker from './components/ChartPicker';
import Drill from './screens/Drill';

type Phase = 'picker' | 'drill';

export default function App() {
  const [phase, setPhase] = useState<Phase>('picker');
  const [chartIds, setChartIds] = useState<readonly string[]>([]);

  function handleStart(ids: string[]) {
    setChartIds(ids);
    setPhase('drill');
  }

  function handleExit() {
    setPhase('picker');
  }

  return (
    <div className="h-dvh w-full overflow-hidden bg-[#0b0f14] text-[#f5f7fa]">
      {phase === 'picker' ? (
        <ChartPicker charts={CHARTS} onStart={handleStart} />
      ) : (
        <Drill key={chartIds.join('|')} chartIds={chartIds} onExit={handleExit} />
      )}
    </div>
  );
}
