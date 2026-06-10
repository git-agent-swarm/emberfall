// Deterministic seeded PRNG — mulberry32. SHARED by the client (course
// generation) and the server (run validation), so a given seed produces the
// IDENTICAL course on every device. This determinism is the make-or-break for
// fair daily leaderboards, ghost replay, and anti-cheat.
//
// Keep this file PURE and dependency-free. Both sides must agree bit-for-bit —
// do NOT change the arithmetic, and never seed it from Date/Math.random.

export type Rng = {
  /** Float in [0, 1). */
  next: () => number;
  /** Integer in [0, maxExclusive). */
  int: (maxExclusive: number) => number;
  /** Float in [min, max). */
  range: (min: number, max: number) => number;
  /** Deterministic element from a non-empty array. */
  pick: <T>(arr: readonly T[]) => T;
  /** Derive an independent stream from a salt (e.g. a monument id hash). */
  fork: (salt: number) => Rng;
};

// 32-bit FNV-1a string hash — lets us seed from strings (sub+date, post id).
export const hashSeed = (input: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

export const mulberry32 = (seed: number): Rng => {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    range: (min, max) => min + next() * (max - min),
    pick: <T,>(arr: readonly T[]): T => {
      const v = arr[Math.floor(next() * arr.length)];
      if (v === undefined) throw new Error('rng.pick: empty array');
      return v;
    },
    fork: (salt) => mulberry32((seed ^ Math.imul(salt >>> 0, 0x9e3779b1)) >>> 0),
  };
};
