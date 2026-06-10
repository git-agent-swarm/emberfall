import { redis } from '@devvit/web/server';
import { keys } from './keys';
import type { RunMode, UserStats } from '../../shared/api';
import { nextStreak } from './score';

const num = (v: string | undefined): number => (v ? parseInt(v, 10) || 0 : 0);

export const getUser = async (username: string): Promise<UserStats> => {
  const h = await redis.hGetAll(keys.user(username));
  return {
    username,
    bestScore: num(h.bestScore),
    bestCombo: num(h.bestCombo),
    longestChain: num(h.longestChain),
    streak: num(h.streak),
    bestStreak: num(h.bestStreak),
    totalRuns: num(h.totalRuns),
    cumulativeMotes: num(h.cumulativeMotes),
    endlessBest: num(h.endlessBest),
  };
};

export type RunApply = {
  mode: RunMode;
  today: string;
  score: number;
  bestCombo: number;
  longestChain: number;
  motes: number;
};

export type ApplyResult = { me: UserStats; newPersonalBest: boolean; isNewDay: boolean };

// Apply a finished run to the user's profile. Streak bumps at most once per day
// (driven by lastPlayed), so calling this on every improving daily submit is safe.
export const applyRun = async (username: string, run: RunApply): Promise<ApplyResult> => {
  const key = keys.user(username);
  const h = await redis.hGetAll(key);

  const updates: Record<string, string> = {
    totalRuns: String(num(h.totalRuns) + 1),
    cumulativeMotes: String(num(h.cumulativeMotes) + Math.max(0, Math.floor(run.motes))),
  };
  if (run.bestCombo > num(h.bestCombo)) updates.bestCombo = String(run.bestCombo);
  if (run.longestChain > num(h.longestChain)) updates.longestChain = String(run.longestChain);

  let isNewDay = false;
  let newPersonalBest = false;

  if (run.mode === 'daily') {
    const lastDate = h.lastPlayed ? h.lastPlayed : null;
    const s = nextStreak(lastDate, run.today, num(h.streak), num(h.bestStreak));
    isNewDay = s.isNewDay;
    updates.lastPlayed = run.today;
    updates.streak = String(s.streak);
    updates.bestStreak = String(s.bestStreak);
    if (run.score > num(h.bestScore)) {
      updates.bestScore = String(run.score);
      newPersonalBest = true;
    }
  } else if (run.score > num(h.endlessBest)) {
    updates.endlessBest = String(run.score);
    newPersonalBest = true;
  }

  await redis.hSet(key, updates);
  const me = await getUser(username);
  return { me, newPersonalBest, isNewDay };
};
