// Pure time / streak / share helpers for EMBERFALL daily runs. No Redis, no
// Devvit imports — unit-testable in isolation.

const EPOCH = '2026-06-01';

export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const dayIndex = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

// 1-based day number since the EMBERFALL epoch (for "Day 47" labels + seed salt).
export const dayNumber = (iso: string): number => dayIndex(iso) - dayIndex(EPOCH) + 1;

export type StreakResult = { streak: number; bestStreak: number; isNewDay: boolean };

// Consecutive-day streak. isNewDay is false if the user already played `today`.
export const nextStreak = (
  lastDate: string | null,
  today: string,
  current: number,
  best: number
): StreakResult => {
  if (lastDate === today) return { streak: current, bestStreak: best, isNewDay: false };
  const consecutive = lastDate !== null && dayIndex(today) - dayIndex(lastDate) === 1;
  const streak = consecutive ? current + 1 : 1;
  return { streak, bestStreak: Math.max(best, streak), isNewDay: true };
};

// Spoiler-free "painted line" share card: a coarse silhouette of the player's OWN
// run path (not the course) from the downsampled trace, plus a Wordle-style stat
// line. Generated server-side so it is tamper-proof.
const BLOCKS = '▁▂▃▄▅▆▇█';

const trail = (trace: number[], cols = 14): string => {
  const ys: number[] = [];
  for (let i = 1; i < trace.length; i += 2) ys.push(trace[i] as number);
  if (ys.length === 0) return BLOCKS.charAt(0).repeat(cols);
  let lo = Infinity;
  let hi = -Infinity;
  for (const y of ys) {
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const span = hi - lo || 1;
  let out = '';
  for (let c = 0; c < cols; c++) {
    const idx = Math.min(ys.length - 1, Math.floor((c / cols) * ys.length));
    const norm = ((ys[idx] as number) - lo) / span;
    const b = Math.max(0, Math.min(7, Math.round(norm * 7)));
    out += BLOCKS.charAt(b);
  }
  return out;
};

export type ShareInput = {
  sub: string;
  day: number;
  distance: number;
  score: number;
  bestCombo: number;
  trace: number[];
};

export const shareCard = (o: ShareInput): string => {
  const dist = `${Math.round(o.distance).toLocaleString('en-US')}m`;
  const pts = `${Math.round(o.score).toLocaleString('en-US')} pts`;
  return `EMBERFALL · r/${o.sub} · Day ${o.day}\n${trail(o.trace)}\n${dist} · ×${o.bestCombo} 🔥 · ${pts}`;
};
