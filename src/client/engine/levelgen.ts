// Deterministic course generator. The entire ribbon of platforms, motes and
// shade-wisps is produced from the daily SEED (mulberry32), so every player in a
// community runs the identical course — fair leaderboards + replayable ghosts.
// Chunks are generated lazily ahead of the player and pruned behind; each chunk's
// RNG is forked from the seed + chunk index, so generation order never matters.

import { mulberry32 } from '../../shared/rng';
import type { Mote, Platform, Wisp } from './types';

export const GROUND_Y = 0;
export const FALL_Y = GROUND_Y + 460; // fall past this = death (into a gap)
const LEVELS = [0, -95, -190, -285]; // platform elevations (negative = higher)
const PLAYER_REACH_CHUNKS = 3400;

export class Course {
  readonly platforms: Platform[] = [];
  readonly motes: Mote[] = [];
  readonly wisps: Wisp[] = [];
  private nextX = 0;
  private chunk = 0;
  private prevLevel = 0;

  constructor(private readonly seed: number) {
    // Guaranteed safe opening runway so the first seconds are always landable.
    this.platforms.push({ x: -240, y: GROUND_Y, w: 1500, fragile: false });
    this.nextX = 1260;
    this.ensureAhead(0);
  }

  ensureAhead(worldX: number): void {
    while (this.nextX < worldX + PLAYER_REACH_CHUNKS) this.genChunk();
  }

  prune(worldX: number): void {
    const cut = worldX - 1000;
    while (this.platforms.length > 1) {
      const p = this.platforms[0];
      if (!p || p.x + p.w >= cut) break;
      this.platforms.shift();
    }
    while (this.motes.length) {
      const m = this.motes[0];
      if (!m || m.x >= cut) break;
      this.motes.shift();
    }
    while (this.wisps.length) {
      const w = this.wisps[0];
      if (!w || w.x >= cut) break;
      this.wisps.shift();
    }
  }

  private genChunk(): void {
    const r = mulberry32((this.seed ^ Math.imul(this.chunk + 1, 0x9e3779b1)) >>> 0);
    const diff = Math.min(1, this.chunk / 45);

    const gap = r.range(105, 150) + diff * r.range(40, 180);
    const x = this.nextX + gap;

    // Move at most one elevation level at a time so every jump stays fair.
    const roll = r.next();
    const delta = roll < 0.55 ? 0 : roll < 0.78 ? 1 : -1;
    const lvl = Math.max(0, Math.min(LEVELS.length - 1, this.prevLevel + delta));
    this.prevLevel = lvl;
    const y = LEVELS[lvl] as number;

    const w = Math.max(95, r.range(185, 320) - diff * 70);
    const fragile = this.chunk > 6 && r.next() < 0.12 + diff * 0.06;
    this.platforms.push({ x, y, w, fragile });

    // A collectible coin arc, often bridging the gap. Fewer + bigger than before
    // (2–3 per arc, ~60% of chunks) so each one reads as a deliberate prize.
    if (r.next() < 0.6) {
      const n = 2 + Math.floor(r.range(0, 2));
      const startX = this.nextX + gap * 0.18;
      const span = x - startX + 50;
      const arcH = r.range(55, 150);
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        this.motes.push({
          x: startX + t * span,
          y: y - 42 - Math.sin(t * Math.PI) * arcH,
          taken: false,
        });
      }
    }

    // Shade-wisp over the gap — frequency climbs with difficulty.
    if (this.chunk > 4 && r.next() < 0.14 + diff * 0.42) {
      this.wisps.push({
        x: this.nextX + gap * 0.6,
        y: y - r.range(45, 130),
        r: 22,
        ph: r.range(0, Math.PI * 2),
        dead: false,
      });
    }

    this.nextX = x + w;
    this.chunk++;
  }
}
