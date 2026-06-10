import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type {
  ErrorResponse,
  GhostTrace,
  InitResponse,
  RunResult,
  RunSubmit,
} from '../../shared/api';
import { dayNumber, isoDate, shareCard } from '../core/score';
import { hashSeed } from '../../shared/rng';
import { autoTint } from '../core/reddit';
import { validateRun } from '../core/validate';
import {
  getOrBakeMonuments,
  getGhost,
  setGhost,
  markPlayed,
  playedCount,
  getShareToday,
  setShareToday,
} from '../core/store';
import { applyRun, getUser } from '../core/users';
import {
  bestToday,
  recordAllTime,
  recordToday,
  topAllTime,
  topToday,
  todayRank,
  allTimeRank,
} from '../core/leaderboard';

export const api = new Hono();

const MAX_TRACE = 1200; // ~600 (x,y) points

const fail = (message: string): ErrorResponse => ({ status: 'error', message });

const username = async (): Promise<string> => (await reddit.getCurrentUsername()) ?? 'anonymous';

const seedFor = (sub: string, date: string): number => hashSeed(`emberfall:${sub}:${date}`);

const validSubmit = (b: unknown): b is RunSubmit => {
  if (typeof b !== 'object' || b === null) return false;
  const r = b as Record<string, unknown>;
  return (
    (r.mode === 'daily' || r.mode === 'endless') &&
    typeof r.seed === 'number' &&
    typeof r.score === 'number' &&
    typeof r.distance === 'number' &&
    typeof r.peakSpeed === 'number' &&
    typeof r.bestCombo === 'number' &&
    typeof r.longestChain === 'number' &&
    typeof r.motes === 'number' &&
    typeof r.durationMs === 'number' &&
    Array.isArray(r.trace)
  );
};

// Bound + integer-quantize the stored ghost trace (Redis size + determinism).
const clampTrace = (t: number[]): number[] => {
  if (t.length <= MAX_TRACE) return t.map((n) => Math.round(Number(n) || 0));
  const out: number[] = [];
  const stride = Math.max(2, Math.ceil(t.length / MAX_TRACE / 2) * 2);
  for (let i = 0; i + 1 < t.length; i += stride) {
    out.push(Math.round(Number(t[i]) || 0), Math.round(Number(t[i + 1]) || 0));
  }
  return out;
};

api.get('/init', async (c) => {
  const sub = context.subredditName ?? 'unknown';
  const name = await username();
  const today = isoDate(new Date());

  const [monuments, me, ghost, played, todayTop, allTop, tRank, aRank, bToday, shareStr] =
    await Promise.all([
      getOrBakeMonuments(sub, today),
      getUser(name),
      getGhost(sub, today),
      playedCount(sub, today),
      topToday(sub, today, 10),
      topAllTime(sub, 10),
      todayRank(sub, today, name),
      allTimeRank(sub, name),
      bestToday(sub, today, name),
      getShareToday(sub, today, name),
    ]);

  return c.json<InitResponse>({
    type: 'init',
    username: name,
    subreddit: sub,
    dayNumber: dayNumber(today),
    seed: seedFor(sub, today),
    biome: { id: 'emberfall', name: 'Emberfall', autoTint: autoTint(sub) },
    monuments,
    me,
    daily: { played: shareStr !== null, bestToday: bToday },
    ghost,
    playedToday: played,
    leaderboard: {
      type: 'leaderboard',
      today: todayTop,
      allTime: allTop,
      yourTodayRank: tRank,
      yourAllTimeRank: aRank,
    },
    share: shareStr,
  });
});

api.post('/run/submit', async (c) => {
  const sub = context.subredditName ?? 'unknown';
  const name = await username();
  const today = isoDate(new Date());
  const body = await c.req.json().catch(() => null);
  if (!validSubmit(body)) return c.json(fail('bad request'), 400);

  const reject = async (reason: string): Promise<RunResult> => ({
    type: 'runResult',
    accepted: false,
    reason,
    me: await getUser(name),
    newPersonalBest: false,
    isDailyBest: false,
    becameChampion: false,
    rankToday: null,
    rankAllTime: null,
    ghost: await getGhost(sub, today),
    share: null,
  });

  const v = validateRun(body);
  if (!v.ok) return c.json<RunResult>(await reject(v.reason ?? 'invalid'));

  const isDaily = body.mode === 'daily';
  if (isDaily && body.seed !== seedFor(sub, today)) {
    return c.json<RunResult>(await reject('stale-seed'));
  }

  // Anonymous users can play but are never recorded.
  if (name === 'anonymous') {
    return c.json<RunResult>({
      type: 'runResult',
      accepted: true,
      reason: null,
      me: await getUser(name),
      newPersonalBest: false,
      isDailyBest: false,
      becameChampion: false,
      rankToday: null,
      rankAllTime: null,
      ghost: await getGhost(sub, today),
      share: null,
    });
  }

  const apply = await applyRun(name, {
    mode: isDaily ? 'daily' : 'endless',
    today,
    score: body.score,
    bestCombo: body.bestCombo,
    longestChain: body.longestChain,
    motes: body.motes,
  });

  let isDailyBest = false;
  let becameChampion = false;
  let rankToday: number | null = null;
  let rankAllTime: number | null = null;
  let ghost = await getGhost(sub, today);
  let share: string | null = null;

  if (isDaily) {
    const prevBest = await bestToday(sub, today, name);
    isDailyBest = body.score > prevBest;
    await Promise.all([
      recordToday(sub, today, name, body.score),
      recordAllTime(sub, name, body.score),
      markPlayed(sub, today, name),
    ]);

    if (!ghost || body.score > ghost.score) {
      const newGhost: GhostTrace = {
        username: name,
        score: body.score,
        points: clampTrace(body.trace),
      };
      await setGhost(sub, today, newGhost);
      ghost = newGhost;
      becameChampion = true;
    }

    share = shareCard({
      sub,
      day: dayNumber(today),
      distance: body.distance,
      score: body.score,
      bestCombo: body.bestCombo,
      trace: body.trace,
    });
    await setShareToday(sub, today, name, share);
    [rankToday, rankAllTime] = await Promise.all([
      todayRank(sub, today, name),
      allTimeRank(sub, name),
    ]);
  }

  return c.json<RunResult>({
    type: 'runResult',
    accepted: true,
    reason: null,
    me: apply.me,
    newPersonalBest: apply.newPersonalBest,
    isDailyBest,
    becameChampion,
    rankToday,
    rankAllTime,
    ghost,
    share,
  });
});

api.get('/leaderboard', async (c) => {
  const sub = context.subredditName ?? 'unknown';
  const name = await username();
  const today = isoDate(new Date());
  const [todayTop, allTop, tRank, aRank] = await Promise.all([
    topToday(sub, today, 10),
    topAllTime(sub, 10),
    todayRank(sub, today, name),
    allTimeRank(sub, name),
  ]);
  return c.json({
    type: 'leaderboard' as const,
    today: todayTop,
    allTime: allTop,
    yourTodayRank: tRank,
    yourAllTimeRank: aRank,
  });
});
