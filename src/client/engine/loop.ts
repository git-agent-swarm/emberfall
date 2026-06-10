// Fixed-timestep game loop with render interpolation. Simulation advances in
// exact 1/60s steps (deterministic — required for fair leaderboards, ghost
// replay, and anti-cheat); rendering interpolates by the leftover alpha so it
// stays buttery even when frames are dropped. Spiral-of-death is capped.

import type { Ticker } from 'pixi.js';

export type Loop = { stop: () => void };

const STEP_MS = 1000 / 60;
const MAX_STEPS = 5;

export const createLoop = (
  ticker: Ticker,
  update: (dtSec: number) => void,
  render: (alpha: number) => void
): Loop => {
  let acc = 0;
  const tick = (t: Ticker): void => {
    acc += Math.min(t.deltaMS, STEP_MS * MAX_STEPS);
    let steps = 0;
    while (acc >= STEP_MS && steps < MAX_STEPS) {
      update(STEP_MS / 1000);
      acc -= STEP_MS;
      steps++;
    }
    render(acc / STEP_MS);
  };
  ticker.add(tick);
  return { stop: () => ticker.remove(tick) };
};
