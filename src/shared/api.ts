// EMBERFALL — shared domain + API contract (Devvit server <-> React/Pixi client).
//
// EMBERFALL is a momentum action-platformer. The day's course is generated
// DETERMINISTICALLY from a server-issued `seed` (mulberry32), so every player in a
// community runs the identical course and daily scores are directly comparable.
// Real-time simulation runs entirely client-side (Pixi/WebGL); the server issues
// the seed + baked monuments, validates submitted runs for plausibility, and owns
// the leaderboards + champion ghost. Unlike Karma Climb there is no score secrecy
// to protect — the Reddit content here is set-dressing, not the answer.

export type RunMode = 'daily' | 'endless';

// A real Reddit post, frozen at bake time into world geometry. Rendered as a
// glowing monument in the mid-ground: post score -> monument height (log scale),
// comment count -> glow intensity. Titles pass the slur/NSFW filter before baking.
export type Monument = {
  id: string; // t3_… post id (also a stable per-monument RNG salt)
  title: string; // cleaned, safe-to-render
  subreddit: string;
  score: number; // upvotes -> height
  comments: number; // -> glow intensity
  tint: string | null; // dominant thumbnail color (hex) or null
};

// Per-community visual identity for the day.
export type Biome = {
  id: string; // 'emberfall' (v1); future palette/LUT swaps
  name: string;
  autoTint: string | null; // palette re-grade derived from the top post thumbnail
};

export type UserStats = {
  username: string;
  bestScore: number;
  bestCombo: number;
  longestChain: number; // longest dash-kill chain
  streak: number; // consecutive days played
  bestStreak: number;
  totalRuns: number;
  cumulativeMotes: number; // drives cosmetic unlocks
  endlessBest: number;
};

// The reigning daily champion's run, downsampled for the chase-ghost ribbon.
// `points` is a flat [x0, y0, x1, y1, …] array of world-space samples (~600 pts).
export type GhostTrace = {
  username: string;
  score: number;
  points: number[];
};

export type LeaderEntry = {
  rank: number;
  username: string;
  score: number;
};

export type LeaderboardResponse = {
  type: 'leaderboard';
  today: LeaderEntry[];
  allTime: LeaderEntry[];
  yourTodayRank: number | null;
  yourAllTimeRank: number | null;
};

export type DailyState = {
  played: boolean; // has this user submitted today's daily run?
  bestToday: number; // their best score for today (0 if none)
};

export type InitResponse = {
  type: 'init';
  username: string;
  subreddit: string;
  dayNumber: number; // EMBERFALL day index (epoch-based)
  seed: number; // deterministic daily course seed
  biome: Biome;
  monuments: Monument[]; // baked world geometry (may be allowlist-sourced)
  me: UserStats;
  daily: DailyState;
  ghost: GhostTrace | null;
  playedToday: number; // community participation count
  leaderboard: LeaderboardResponse;
  share: string | null; // present if today's daily run is already finished
};

// Submitted at end of a run. The server treats these as CLAIMS and validates them
// (max-reachable distance per elapsed time, monotonic progress, mote ids exist in
// the seed's course, duration floor, superhuman-APM reject) before recording.
// `trace` (downsampled path) is stored as the ghost only when a new #1 is set.
export type RunSubmit = {
  mode: RunMode;
  seed: number; // must match the issued daily seed (daily mode)
  score: number;
  distance: number; // metres travelled
  peakSpeed: number;
  bestCombo: number;
  longestChain: number;
  motes: number; // light-motes harvested
  durationMs: number;
  trace: number[]; // downsampled [x0, y0, …] path (~600 pts)
};

export type RunResult = {
  type: 'runResult';
  accepted: boolean; // false if validation rejected the run
  reason: string | null; // rejection reason (generic to client)
  me: UserStats;
  newPersonalBest: boolean;
  isDailyBest: boolean; // became this user's best for today
  becameChampion: boolean; // set a new community #1 (ghost updated)
  rankToday: number | null;
  rankAllTime: number | null;
  ghost: GhostTrace | null; // refreshed champion ghost (for immediate re-race)
  share: string | null;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};

// Client UI screens (React overlay over the Pixi canvas).
export type Screen = 'menu' | 'play' | 'leaderboard' | 'howto';
