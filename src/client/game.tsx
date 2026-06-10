import './index.css';

import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Application } from 'pixi.js';
import { createPixi } from './engine/app';
import { fetchInit } from './lib/api';
import { createSession, type HudState, type Session } from './engine/session';
import type { InitResponse } from '../shared/api';

const fmt = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

const ReadyCard = () => (
  <div className="text-center">
    <div className="text-6xl drop-shadow-[0_0_25px_rgba(255,122,61,0.6)]">🔥</div>
    <h1 className="mt-2 text-3xl font-black tracking-tight">EMBERFALL</h1>
    <p className="mt-1 text-sm text-white/70">Outrun the dark.</p>
    <p className="mt-4 animate-pulse text-sm font-bold text-orange-300">Tap to begin</p>
    <p className="mt-3 text-[11px] leading-relaxed text-white/45">
      Left = jump · Right = dash (flick to aim)
      <br />
      Swipe down = pound · dash through wisps to chain
    </p>
  </div>
);

const DeadCard = ({
  hud,
  onRetry,
}: {
  hud: HudState;
  onRetry: () => void;
}) => {
  const r = hud.result;
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    if (!r?.share) return;
    try {
      await navigator.clipboard.writeText(r.share);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable
    }
  };
  return (
    <div className="pointer-events-auto w-full max-w-xs rounded-3xl bg-black/55 p-6 text-center backdrop-blur-sm">
      <div className="text-5xl">🌑</div>
      <h2 className="mt-1 text-xl font-extrabold">The dark caught you</h2>
      <div className="mt-2 text-4xl font-black tabular-nums text-orange-400">{hud.score}</div>
      <div className="text-xs text-white/60">
        {hud.distance}m · ×{hud.bestCombo} best · chain {hud.longestChain}
      </div>
      {hud.submitting && <p className="mt-2 text-xs text-white/50">saving run…</p>}
      {r && r.rankToday !== null && (
        <p className="mt-2 text-sm text-emerald-300">
          #{r.rankToday} today{r.becameChampion ? ' · 👑 champion!' : ''}
        </p>
      )}
      {r?.share && (
        <div className="mt-3">
          <pre className="whitespace-pre-wrap break-words rounded-xl bg-black/40 p-2 text-[11px] text-white/80">
            {r.share}
          </pre>
          <button
            onClick={() => void copy()}
            className="mt-1 w-full rounded-full bg-white/10 py-2 text-xs font-bold hover:bg-white/20"
          >
            {copied ? 'Copied ✓' : '📋 Copy'}
          </button>
        </div>
      )}
      <button
        onClick={onRetry}
        className="mt-3 w-full rounded-full bg-orange-500 py-3 font-bold text-white shadow-lg shadow-orange-500/30 active:scale-95"
      >
        ↻ Run again
      </button>
    </div>
  );
};

const Hud = ({
  hud,
  init,
  onRetry,
}: {
  hud: HudState | null;
  init: InitResponse | null;
  onRetry: () => void;
}) => {
  const phase = hud?.phase ?? 'ready';
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col p-4">
      <div className="flex items-start justify-between">
        <span className="text-sm font-black tracking-[0.35em] text-orange-300 drop-shadow-lg">
          EMBERFALL
        </span>
        {init && (
          <span className="text-[11px] text-white/55">
            r/{init.subreddit} · Day {init.dayNumber}
          </span>
        )}
      </div>

      {phase === 'playing' && hud && (
        <div className="mt-2 flex items-center gap-3">
          <span className="text-3xl font-black tabular-nums text-white drop-shadow">
            {fmt(hud.score)}
          </span>
          <span className="text-sm text-white/60">{hud.distance}m</span>
          {hud.combo > 1 && (
            <span className="ml-auto rounded-full bg-orange-500/25 px-3 py-1 text-sm font-bold text-orange-200">
              ×{hud.combo} 🔥
            </span>
          )}
        </div>
      )}

      <div className="flex flex-1 items-center justify-center">
        {phase === 'ready' && <ReadyCard />}
        {phase === 'dead' && hud && <DeadCard hud={hud} onRetry={onRetry} />}
      </div>
    </div>
  );
};

const Game = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [init, setInit] = useState<InitResponse | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let app: Application | null = null;
    let disposed = false;

    void (async () => {
      let data: InitResponse | null;
      try {
        data = await fetchInit();
      } catch {
        data = null;
      }
      if (disposed) return;
      setInit(data);
      const pixi = await createPixi(host);
      if (disposed) {
        pixi.destroy(true);
        return;
      }
      app = pixi;
      sessionRef.current = createSession(pixi, data, host, setHud);
    })();

    return () => {
      disposed = true;
      if (sessionRef.current) {
        sessionRef.current.destroy();
        sessionRef.current = null;
      }
      if (app) app.destroy(true);
    };
  }, []);

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#0d0a1a] text-white">
      <div ref={hostRef} className="absolute inset-0 touch-none" />
      <Hud hud={hud} init={init} onRetry={() => sessionRef.current?.retry()} />
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Game />
  </StrictMode>
);
