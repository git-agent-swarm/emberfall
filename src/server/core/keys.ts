// Centralized Redis key builders. Redis is per-installation (per subreddit), but
// we also namespace by subreddit name so cross-sub helpers stay unambiguous.
// The daily course seed is PURE (derived from sub+date), so it needs no key.

export const keys = {
  monuments: (sub: string, date: string): string => `mon:${sub}:${date}`,
  ghost: (sub: string, date: string): string => `ghost:${sub}:${date}`,
  // Once-per-day gate so a returning player's streak/day-count bumps once even
  // though they may submit many improving runs in a day.
  dayGate: (sub: string, date: string, user: string): string =>
    `day:${sub}:${date}:${user.toLowerCase()}`,
  playedToday: (sub: string, date: string): string => `played:${sub}:${date}`,
  shareToday: (sub: string, date: string, user: string): string =>
    `share:${sub}:${date}:${user.toLowerCase()}`,
  user: (user: string): string => `user:${user.toLowerCase()}`,
  lbToday: (sub: string, date: string): string => `lb:today:${sub}:${date}`,
  lbAllTime: (sub: string): string => `lb:all:${sub}`,
} as const;
