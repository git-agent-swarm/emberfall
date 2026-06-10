import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { requestExpandedMode } from '@devvit/web/client';

// Inline feed view — deliberately lightweight (no Pixi, no fetch, no game logic)
// so it renders instantly in the feed. The full game loads on tap.
const Splash = () => (
  <button
    onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
    className="flex min-h-screen w-full cursor-pointer flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#1A1033] to-[#0d0a1a] px-6 text-center text-white"
  >
    <span className="text-xs font-black tracking-[0.4em] text-orange-400">EMBERFALL</span>
    <div className="text-6xl">🔥</div>
    <p className="max-w-xs text-lg font-semibold text-white">Outrun the dark. How far can you climb?</p>
    <span className="rounded-full bg-orange-500 px-6 py-2 font-bold text-white shadow-lg shadow-orange-500/30">
      Tap to play
    </span>
    <span className="text-xs text-slate-400">daily run · ghost race · leaderboard</span>
  </button>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
