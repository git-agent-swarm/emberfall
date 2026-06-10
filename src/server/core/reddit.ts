// Impure layer: fetch real posts from the Reddit Data API and freeze them into
// Monuments (the mid-ground world geometry). Auto-localizes to the host
// subreddit, supplementing from the curated SFW allowlist when the host can't
// supply enough. Tints are derived DETERMINISTICALLY from id hashes — the server
// has no runtime network to fetch/decode thumbnails, so we can't sample pixels;
// hashing gives per-community visual variety at zero cost and stays deterministic.

import { reddit } from '@devvit/web/server';
import type { Monument } from '../../shared/api';
import { isCleanTitle } from './safety';
import { ALLOWLIST_SUBS } from '../data/allowlist';
import { hashSeed, mulberry32 } from '../../shared/rng';

const MIN_SCORE = 50;
const TARGET_MONUMENTS = 16;
const MIN_HOST = 6;
const MAX_SUPPLEMENT_FETCHES = 4;
const FETCH_LIMIT = 50;
const MAX_TITLE = 80;

// Accent palette tuned to the EMBERFALL biome (ember/gold/teal/violet glints).
const ACCENTS = [
  '#FF7A3D',
  '#FFD27A',
  '#2BD9C0',
  '#FF5FA2',
  '#7FB2FF',
  '#C58BFF',
  '#FF9E5E',
  '#5EE0C0',
] as const;

const accentFor = (key: string): string => ACCENTS[hashSeed(key) % ACCENTS.length] as string;

export const autoTint = (sub: string): string => accentFor(`sub:${sub}`);

// Devvit's Post type may or may not surface a comment count under a stable name;
// read it defensively so a missing field degrades to 0 instead of a type error.
const commentsOf = (p: unknown): number => {
  const n = (p as { numberOfComments?: number }).numberOfComments;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

const shuffleBy = <T>(arr: readonly T[], seedKey: string): T[] => {
  const r = mulberry32(hashSeed(seedKey));
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = r.int(i + 1);
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
};

const fetchTop = async (sub: string, limit: number): Promise<Monument[]> => {
  try {
    const posts = await reddit.getTopPosts({ subredditName: sub, timeframe: 'year', limit }).all();
    const out: Monument[] = [];
    for (const p of posts) {
      if (p.nsfw || p.spoiler || p.stickied || p.removed) continue;
      if (p.score < MIN_SCORE) continue;
      const title = p.title.trim();
      if (title.length === 0 || !isCleanTitle(title)) continue;
      out.push({
        id: p.id,
        title: title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title,
        subreddit: p.subredditName,
        score: p.score,
        comments: commentsOf(p),
        tint: accentFor(p.id),
      });
    }
    return out;
  } catch {
    return [];
  }
};

const dedupeById = (posts: Monument[]): Monument[] => {
  const seen = new Set<string>();
  const out: Monument[] = [];
  for (const p of posts) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
};

// Build the day's monument set. Host posts first; supplement from a bounded,
// seed-shuffled (deterministic per sub+date) set of allowlist subs when the host
// is too small/quiet. Returns the top TARGET_MONUMENTS by score.
export const gatherMonuments = async (hostSub: string, dateKey: string): Promise<Monument[]> => {
  let pool = await fetchTop(hostSub, 100);
  if (pool.length < MIN_HOST) {
    let fetches = 0;
    for (const sub of shuffleBy(ALLOWLIST_SUBS, `${hostSub}:${dateKey}`)) {
      if (pool.length >= TARGET_MONUMENTS * 2 || fetches >= MAX_SUPPLEMENT_FETCHES) break;
      if (sub === hostSub) continue;
      pool = pool.concat(await fetchTop(sub, FETCH_LIMIT));
      fetches++;
    }
  }
  return dedupeById(pool)
    .sort((a, b) => b.score - a.score)
    .slice(0, TARGET_MONUMENTS);
};
