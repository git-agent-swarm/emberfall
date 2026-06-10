// Server-side anti-cheat for client-simulated runs. A 60fps client owns the sim,
// so the server cannot replay every frame cheaply. Instead we reject runs that
// are physically implausible for the seed's course via invariant/plausibility
// checks — the primary defense. (Full deterministic input-replay is a stretch.)
//
// NOTE: the numeric ceilings below are in the engine's world units and are
// PROVISIONAL — they MUST be re-tuned once the client engine's real speed/score
// scale is locked, then frozen alongside a CI "same-seed-same-result" test.

import type { RunSubmit } from '../../shared/api';

export type Validation = { ok: boolean; reason: string | null };

const ok: Validation = { ok: true, reason: null };
const no = (reason: string): Validation => ({ ok: false, reason });

// Hard physical ceilings (world units). Generous so no legit run is rejected.
const MIN_DURATION_MS = 1_500; // a real run lasts longer than this
const MAX_DURATION_MS = 30 * 60 * 1000; // 30 min hard cap
const MAX_SPEED = 2_000; // px/s peak the engine can ever produce
// Submitted distance is in METRES (player.x / METER, METER=42). The engine tops
// out at ~20.2 m/s (850 px/s ÷ 42), so 30 m/s is a generous sustained ceiling.
const MAX_DIST_PER_SEC = 30; // metres/s — avg distance/time can't exceed this
const ABSURD = 1_000_000;

const finite = (n: number): boolean => typeof n === 'number' && Number.isFinite(n);

export const validateRun = (s: RunSubmit): Validation => {
  for (const n of [s.score, s.distance, s.peakSpeed, s.bestCombo, s.longestChain, s.motes, s.durationMs]) {
    if (!finite(n)) return no('non-finite');
  }
  if (s.score < 0 || s.distance < 0 || s.bestCombo < 0 || s.longestChain < 0 || s.motes < 0) {
    return no('negative');
  }
  if (s.durationMs < MIN_DURATION_MS) return no('too-short');
  if (s.durationMs > MAX_DURATION_MS) return no('too-long');

  const secs = s.durationMs / 1000;
  if (s.peakSpeed > MAX_SPEED) return no('speed');
  if (s.distance > secs * MAX_DIST_PER_SEC) return no('distance-vs-time');
  if (s.longestChain > s.bestCombo) return no('chain-vs-combo');
  if (s.bestCombo > ABSURD || s.motes > ABSURD || s.distance > ABSURD * 10) {
    return no('absurd');
  }

  // Score must be explainable by the run's own inputs (distance + motes + combo)
  // within a generous multiplier — blocks score injection without a plausible run.
  const ceiling = Math.ceil(s.distance * 4 + s.motes * 60 + s.bestCombo * 150 + 1_000);
  if (s.score > ceiling) return no('score-vs-inputs');

  return ok;
};
