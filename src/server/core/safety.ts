// Defense-in-depth title filter for the host-subreddit content path. Primary
// safety is the NSFW filter + the wholesome SFW allowlist; this rejects posts
// whose titles contain unambiguous slurs so they never render in-game. Matching
// is word-boundary + lowercased to avoid false positives on innocent substrings.

const BLOCKED: readonly string[] = [
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'retarded',
  'tranny',
  'chink',
  'spic',
  'kike',
  'wetback',
  'gook',
];

export const isCleanTitle = (title: string): boolean => {
  const t = ` ${title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ')} `;
  return !BLOCKED.some((w) => t.includes(` ${w} `));
};
