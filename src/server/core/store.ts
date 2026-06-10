// Redis-backed persistence: the date-deterministic monument set (baked once,
// identical for every player that day), the champion ghost, the played-today
// set, and the per-user share card. The daily course SEED is pure (sub+date),
// so it is computed in the route, not stored.

import { redis } from '@devvit/web/server';
import { keys } from './keys';
import type { GhostTrace, Monument } from '../../shared/api';
import { gatherMonuments } from './reddit';

const FOUR_DAYS = 60 * 60 * 24 * 4;
const TWO_DAYS = 60 * 60 * 24 * 2;
const FIFTEEN_MIN = 60 * 15;

const parse = <T>(raw: string | undefined | null): T | null => {
  if (raw === undefined || raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const getOrBakeMonuments = async (sub: string, date: string): Promise<Monument[]> => {
  // A present key (even an empty array) is a cache hit — prevents an unusable
  // subreddit from re-running the full Reddit fan-out on every request.
  const cached = parse<Monument[]>(await redis.get(keys.monuments(sub, date)));
  if (cached) return cached;
  const mons = await gatherMonuments(sub, date);
  await redis.set(keys.monuments(sub, date), JSON.stringify(mons));
  await redis.expire(keys.monuments(sub, date), mons.length > 0 ? TWO_DAYS : FIFTEEN_MIN);
  return mons;
};

export const getGhost = (sub: string, date: string): Promise<GhostTrace | null> =>
  redis.get(keys.ghost(sub, date)).then((raw) => parse<GhostTrace>(raw));

export const setGhost = async (sub: string, date: string, ghost: GhostTrace): Promise<void> => {
  await redis.set(keys.ghost(sub, date), JSON.stringify(ghost));
  await redis.expire(keys.ghost(sub, date), FOUR_DAYS);
};

export const markPlayed = async (sub: string, date: string, user: string): Promise<void> => {
  // Idempotent: the hash is keyed by user, so hLen counts unique players.
  await redis.hSet(keys.playedToday(sub, date), { [user.toLowerCase()]: '1' });
  await redis.expire(keys.playedToday(sub, date), FOUR_DAYS);
};

export const playedCount = async (sub: string, date: string): Promise<number> =>
  (await redis.hLen(keys.playedToday(sub, date))) ?? 0;

export const getShareToday = async (
  sub: string,
  date: string,
  user: string
): Promise<string | null> => {
  const s = await redis.get(keys.shareToday(sub, date, user));
  return s === undefined || s === null ? null : s;
};

export const setShareToday = async (
  sub: string,
  date: string,
  user: string,
  card: string
): Promise<void> => {
  await redis.set(keys.shareToday(sub, date, user), card);
  await redis.expire(keys.shareToday(sub, date, user), FOUR_DAYS);
};
