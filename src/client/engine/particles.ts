// Pooled additive particle system. One Container, one shared glow texture, a
// fixed pool, ZERO per-frame allocation in the hot path. Lives inside the
// world layer so particles are positioned in world coordinates.

import { Container, Sprite, type Texture } from 'pixi.js';

const GLOW = 128;

type P = {
  s: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  grav: number;
  size: number;
};

export type EmitOpts = {
  count: number;
  speed: number;
  spread: number; // radians of arc half-width
  dir: number; // base direction (radians)
  life: number;
  size: number;
  tint: number;
  grav: number;
};

export class Particles {
  readonly container = new Container();
  private readonly free: Sprite[] = [];
  private readonly live: P[] = [];
  cap: number;

  constructor(tex: Texture, cap = 256) {
    this.cap = cap;
    for (let i = 0; i < cap; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.visible = false;
      this.container.addChild(s);
      this.free.push(s);
    }
  }

  emit(x: number, y: number, o: EmitOpts): void {
    for (let i = 0; i < o.count; i++) {
      if (this.live.length >= this.cap) return;
      const s = this.free.pop();
      if (!s) return;
      const ang = o.dir + (Math.random() * 2 - 1) * o.spread;
      const spd = o.speed * (0.5 + Math.random() * 0.6);
      const life = o.life * (0.7 + Math.random() * 0.5);
      s.visible = true;
      s.tint = o.tint;
      this.live.push({
        s,
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life,
        max: life,
        grav: o.grav,
        size: o.size * (0.6 + Math.random() * 0.8),
      });
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i] as P;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        this.free.push(p.s);
        this.live.splice(i, 1);
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.life / p.max;
      const sz = (p.size * (0.35 + 0.65 * k)) / GLOW;
      p.s.x = p.x;
      p.s.y = p.y;
      p.s.alpha = k;
      p.s.scale.set(sz);
    }
  }

  clear(): void {
    for (const p of this.live) {
      p.s.visible = false;
      this.free.push(p.s);
    }
    this.live.length = 0;
  }
}
