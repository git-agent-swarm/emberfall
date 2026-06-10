import { redis } from '@devvit/web/server';
import { keys } from './keys';
import type { LeaderEntry } from '../../shared/api';

const FOUR_DAYS = 60 * 60 * 24 * 4;

// Both boards keep each user's BEST score (a runner's "all-time" is best-ever,
// not cumulative — more honest for a skill game). Only improvements are written.
const recordBest = async (key: string, user: string, score: number, ttl?: number): Promise<void> => {
  const existing = await redis.zScore(key, user);
  if (existing === undefined || existing === null || score > existing) {
    await redis.zAdd(key, { member: user, score });
  }
  if (ttl !== undefined) await redis.expire(key, ttl);
};

export const recordToday = (sub: string, date: string, user: string, score: number): Promise<void> =>
  recordBest(keys.lbToday(sub, date), user, score, FOUR_DAYS);

export const recordAllTime = (sub: string, user: string, score: number): Promise<void> =>
  recordBest(keys.lbAllTime(sub), user, score);

const topN = async (key: string, n: number): Promise<LeaderEntry[]> => {
  const rows = await redis.zRange(key, 0, n - 1, { reverse: true, by: 'rank' });
  return rows.map((r, i) => ({ rank: i + 1, username: r.member, score: r.score }));
};

export const topToday = (sub: string, date: string, n: number): Promise<LeaderEntry[]> =>
  topN(keys.lbToday(sub, date), n);

export const topAllTime = (sub: string, n: number): Promise<LeaderEntry[]> =>
  topN(keys.lbAllTime(sub), n);

const rankOf = async (key: string, user: string): Promise<number | null> => {
  const score = await redis.zScore(key, user);
  if (score === undefined || score === null) return null;
  const asc = await redis.zRank(key, user);
  if (asc === undefined || asc === null) return null;
  const card = await redis.zCard(key);
  return card - asc; // descending rank (1 = highest score)
};

export const todayRank = (sub: string, date: string, user: string): Promise<number | null> =>
  rankOf(keys.lbToday(sub, date), user);

export const allTimeRank = (sub: string, user: string): Promise<number | null> =>
  rankOf(keys.lbAllTime(sub), user);

export const bestToday = async (sub: string, date: string, user: string): Promise<number> => {
  const s = await redis.zScore(keys.lbToday(sub, date), user);
  return s === undefined || s === null ? 0 : s;
};
