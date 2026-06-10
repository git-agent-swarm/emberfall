// Typed fetch wrappers around the /api endpoints.

import type { InitResponse, LeaderboardResponse, RunResult, RunSubmit } from '../../shared/api';

const getJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
};

const postJson = async <T,>(url: string, body: unknown): Promise<T> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
};

export const fetchInit = (): Promise<InitResponse> => getJson<InitResponse>('/api/init');

export const submitRun = (run: RunSubmit): Promise<RunResult> =>
  postJson<RunResult>('/api/run/submit', run);

export const fetchLeaderboard = (): Promise<LeaderboardResponse> =>
  getJson<LeaderboardResponse>('/api/leaderboard');
