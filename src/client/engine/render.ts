// The View: everything Pixi draws. A luminous dusk backdrop (gradient sky +
// horizon glow + rim-lit parallax ridges + ambient embers) behind a
// camera-translated world layer (ember-lit slab platforms, detailed coins,
// shade-wisps, the layered hero ember, and particles), with the encroaching Dark
// rendered as a real wall on the left. It also turns sim events into particle
// bursts + screenshake. All display lives under one root container so a retry
// tears down cleanly.

import { Application, Container, Graphics, Sprite } from 'pixi.js';
import type { Biome } from '../../shared/api';
import type { World } from './world';
import type { GameEvent } from './types';
import type { Quality } from './quality';
import { Feel } from './feel';
import { Particles } from './particles';
import { hashSeed, mulberry32 } from '../../shared/rng';
import {
  coinTexture,
  darkEdgeTexture,
  duskSky,
  emberCoreTexture,
  emberFlameTexture,
  radialGlowTexture,
  slabTexture,
  vignetteTexture,
} from './textures';
import { clamp, TAU } from './math';

const GLOW = 128;
const HALF = Math.PI;
const PLAT_H = 60;
const COIN_PX = 40;
const COIN_TEX = 96;
const CORE_TEX = 96;
const FLAME_TEX = 128;
const DARK_EDGE_W = 220;

const hexNum = (hex: string): number => parseInt(hex.replace('#', ''), 16) || 0xff7a3d;

const lerpTint = (a: number, b: number, t: number): number => {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
};

// Parallax ridges, far -> near. Atmospheric perspective: the far range is lighter
// and hazier (lavender), the near range darker + warmer with a bright ember rim
// catching the horizon light, so each ridgeline reads as a crisp silhouette.
const RIDGES = [
  { body: 0x4a3a72, rim: 0x9f8ce0, rimA: 0.4, rimW: 2, amp: 0.045, baseY: 0.6, factor: 0.16, step: 95 },
  { body: 0x37265c, rim: 0xdf9560, rimA: 0.55, rimW: 2.5, amp: 0.075, baseY: 0.72, factor: 0.38, step: 72 },
  { body: 0x241640, rim: 0xff9d54, rimA: 0.85, rimW: 3, amp: 0.11, baseY: 0.85, factor: 0.7, step: 55 },
] as const;

type RidgeRow = { c: Container; tileW: number; factor: number };

export class View {
  private readonly root = new Container();
  private readonly worldLayer = new Container();
  private readonly ridgeLayer = new Container();
  private readonly platformG = new Graphics();
  private readonly darkG = new Graphics();
  private readonly darkLayer = new Container();
  private readonly particles: Particles;
  private readonly feel: Feel;
  private readonly glowTex;
  private readonly coinTex;
  private readonly coreTex;
  private readonly flameTex;
  private readonly slabTex;
  private readonly accent: number;
  private readonly biomeId: string;

  private sky: Sprite;
  private vignette: Sprite;
  private ridges: RidgeRow[] = [];
  private ambient: Sprite[] = [];
  private ambientV: { vy: number; vx: number; ph: number }[] = [];
  private readonly mrng;

  private slabs: Sprite[] = [];
  private motes: Sprite[] = [];
  private wisps: Sprite[] = [];
  private trail: Sprite[] = [];
  private trailPos: { x: number; y: number }[] = [];
  private darkEdge: Sprite;
  private darkEmbers: Sprite[] = [];
  private darkEmberPh: number[] = [];
  private heroOuter: Sprite;
  private heroFlame: Sprite;
  private heroCore: Sprite;

  private t = 0;
  private appliedDpr = 2;
  private bloomOn = true;

  constructor(
    private readonly app: Application,
    biome: Biome,
    feel: Feel
  ) {
    this.feel = feel;
    this.accent = hexNum(biome.autoTint ?? '#FF7A3D');
    this.biomeId = biome.id;
    this.glowTex = radialGlowTexture(GLOW);
    this.coinTex = coinTexture(COIN_TEX);
    this.coreTex = emberCoreTexture(CORE_TEX);
    this.flameTex = emberFlameTexture(FLAME_TEX);
    this.slabTex = slabTexture(96);
    this.mrng = mulberry32(hashSeed(`${biome.id}:view`));
    this.appliedDpr = app.renderer.resolution;
    app.stage.addChild(this.root);

    this.sky = new Sprite(duskSky(app.screen.width, app.screen.height));
    this.root.addChild(this.sky);
    this.root.addChild(this.ridgeLayer);
    this.buildRidges();

    // ambient embers (screen-space parallax) — brighter + warmer to feel alive
    for (let i = 0; i < 34; i++) {
      const s = new Sprite(this.glowTex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = this.mrng.next() < 0.32 ? 0xffe9c4 : this.accent;
      const sz = this.mrng.range(4, 13);
      s.width = sz;
      s.height = sz;
      s.x = this.mrng.range(0, app.screen.width);
      s.y = this.mrng.range(0, app.screen.height);
      s.alpha = this.mrng.range(0.18, 0.62);
      this.root.addChild(s);
      this.ambient.push(s);
      this.ambientV.push({ vy: this.mrng.range(8, 26), vx: this.mrng.range(6, 16), ph: this.mrng.range(0, TAU) });
    }

    this.root.addChild(this.worldLayer);

    // slab platforms (solid, normal-blended ember-lit ground)
    for (let i = 0; i < 28; i++) {
      const s = new Sprite(this.slabTex);
      s.anchor.set(0, 0);
      s.visible = false;
      this.worldLayer.addChild(s);
      this.slabs.push(s);
    }
    this.worldLayer.addChild(this.platformG);

    // shade-wisp pool (cold additive glow — reads as threat vs the gold coins)
    const wispPool = (n: number, base: number, tint: number): Sprite[] => {
      const out: Sprite[] = [];
      for (let i = 0; i < n; i++) {
        const s = new Sprite(this.glowTex);
        s.anchor.set(0.5);
        s.blendMode = 'add';
        s.tint = tint;
        s.visible = false;
        s.scale.set(base / GLOW);
        this.worldLayer.addChild(s);
        out.push(s);
      }
      return out;
    };
    this.wisps = wispPool(16, 46, 0x9a6cff);

    // coin pool — solid, readable, normal-blended (glow baked into the texture)
    for (let i = 0; i < 36; i++) {
      const s = new Sprite(this.coinTex);
      s.anchor.set(0.5);
      s.visible = false;
      this.worldLayer.addChild(s);
      this.motes.push(s);
    }

    this.particles = new Particles(this.glowTex, 256);
    this.worldLayer.addChild(this.particles.container);

    // hero comet trail
    for (let i = 0; i < 10; i++) {
      const k = 1 - i / 10;
      const s = new Sprite(this.coreTex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = lerpTint(0xffcaa0, 0xff7a3d, 1 - k);
      s.alpha = 0.3 * k;
      s.width = (30 * k + 6);
      s.height = s.width;
      this.worldLayer.addChild(s);
      this.trail.push(s);
      this.trailPos.push({ x: 0, y: 0 });
    }

    // hero ember: outer glow + flame aura + crisp molten core
    this.heroOuter = new Sprite(this.glowTex);
    this.heroOuter.anchor.set(0.5);
    this.heroOuter.blendMode = 'add';
    this.heroOuter.tint = 0xff8a44;
    this.heroFlame = new Sprite(this.flameTex);
    this.heroFlame.anchor.set(0.5, 0.72);
    this.heroFlame.blendMode = 'add';
    this.heroFlame.tint = 0xffb060;
    this.heroCore = new Sprite(this.coreTex);
    this.heroCore.anchor.set(0.5);
    this.heroCore.blendMode = 'add';
    this.heroCore.tint = 0xffe6c2;
    this.worldLayer.addChild(this.heroOuter, this.heroFlame, this.heroCore);

    // the Dark, as a real wall on the left (screen-space, over the world)
    this.root.addChild(this.darkLayer);
    this.darkLayer.addChild(this.darkG);
    this.darkEdge = new Sprite(darkEdgeTexture(DARK_EDGE_W));
    this.darkEdge.anchor.set(0, 0);
    this.darkLayer.addChild(this.darkEdge);
    for (let i = 0; i < 10; i++) {
      const s = new Sprite(this.glowTex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = this.mrng.next() < 0.5 ? 0x7a5cff : 0x3a2a6a;
      s.visible = false;
      this.darkLayer.addChild(s);
      this.darkEmbers.push(s);
      this.darkEmberPh.push(this.mrng.range(0, TAU));
    }

    this.vignette = new Sprite(vignetteTexture(512));
    this.root.addChild(this.vignette);
    this.layoutScreen();
  }

  private buildRidges(): void {
    for (const child of this.ridgeLayer.removeChildren()) child.destroy({ children: true });
    this.ridges = [];
    const h = this.app.screen.height;
    const tileW = Math.ceil(this.app.screen.width) + 4;
    for (let ri = 0; ri < RIDGES.length; ri++) {
      const cfg = RIDGES[ri] as (typeof RIDGES)[number];
      const rng = mulberry32(hashSeed(`${this.biomeId}:ridge:${ri}`));
      const tops: number[] = [];
      let phase = rng.range(0, TAU);
      for (let x = 0; x <= tileW; x += cfg.step) {
        tops.push(h * cfg.baseY + Math.sin(phase) * h * cfg.amp);
        phase += rng.range(0.5, 0.9);
      }
      if (tops.length > 1) tops[tops.length - 1] = tops[0] as number;
      const make = (): Graphics => {
        const g = new Graphics();
        // filled silhouette
        g.moveTo(0, h);
        let i = 0;
        for (let x = 0; x <= tileW; x += cfg.step) {
          g.lineTo(x, tops[i] as number);
          i++;
        }
        g.lineTo(tileW, h);
        g.fill({ color: cfg.body });
        // rim light along the ridgeline
        g.moveTo(0, tops[0] as number);
        i = 0;
        for (let x = 0; x <= tileW; x += cfg.step) {
          g.lineTo(x, tops[i] as number);
          i++;
        }
        g.stroke({ width: cfg.rimW, color: cfg.rim, alpha: cfg.rimA });
        return g;
      };
      const c = new Container();
      const b = make();
      b.x = tileW;
      c.addChild(make(), b);
      this.ridgeLayer.addChild(c);
      this.ridges.push({ c, tileW, factor: cfg.factor });
    }
  }

  private layoutScreen(): void {
    this.sky.width = this.app.screen.width;
    this.sky.height = this.app.screen.height;
    this.vignette.width = this.app.screen.width;
    this.vignette.height = this.app.screen.height;
  }

  resize(): void {
    const oldTex = this.sky.texture;
    this.sky.destroy();
    oldTex.destroy(true); // free the old full-screen sky GPU texture
    this.sky = new Sprite(duskSky(this.app.screen.width, this.app.screen.height));
    this.root.addChildAt(this.sky, 0);
    this.buildRidges();
    this.layoutScreen();
  }

  setQuality(q: Quality): void {
    this.particles.cap = q.particleCap;

    // DPR is the real fill-rate lever — drop the rendered pixel count on weak GPUs.
    if (q.dpr !== this.appliedDpr) {
      this.appliedDpr = q.dpr;
      try {
        this.app.renderer.resolution = q.dpr;
        this.app.renderer.resize(this.app.screen.width, this.app.screen.height);
        this.resize(); // rebake the full-screen sky/ridges at the new framebuffer
      } catch {
        // resolution change unsupported on this renderer — keep going
      }
    }

    // Bloom off => drop the heaviest additive overdraw (ambient + dark embers + hero halo).
    if (q.bloom !== this.bloomOn) {
      this.bloomOn = q.bloom;
      for (const s of this.ambient) s.visible = q.bloom;
      this.heroOuter.visible = q.bloom;
    }
  }

  // time-based drift, independent of the world
  update(dt: number): void {
    this.t += dt;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    for (let i = 0; i < this.ambient.length; i++) {
      const s = this.ambient[i] as Sprite;
      const v = this.ambientV[i] as { vy: number; vx: number; ph: number };
      s.y -= v.vy * dt;
      s.x += Math.sin(this.t * 0.6 + v.ph) * v.vx * dt;
      if (s.y < -12) {
        s.y = h + 12;
        s.x = this.mrng.range(0, w);
      }
    }
    this.particles.update(dt);
  }

  private layoutPlatforms(world: World, camX: number, screenW: number): void {
    this.platformG.clear();
    const left = camX - 80;
    const right = camX + screenW + 80;
    let pi = 0;
    for (const p of world.course.platforms) {
      if (p.w <= 0 || p.x + p.w < left || p.x > right) continue;
      if (pi >= this.slabs.length) break;
      const s = this.slabs[pi++] as Sprite;
      s.visible = true;
      s.x = p.x;
      s.y = p.y;
      s.width = p.w;
      s.height = PLAT_H;
      if (p.fragile) {
        this.platformG.rect(p.x, p.y, p.w, 4).fill({ color: 0xff6f9c, alpha: 0.92 });
      }
    }
    for (let i = pi; i < this.slabs.length; i++) (this.slabs[i] as Sprite).visible = false;
  }

  syncWorld(world: World): void {
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const cam = world.cam;

    for (const r of this.ridges) r.c.x = -((cam.x * r.factor) % r.tileW);

    this.worldLayer.x = -cam.x + this.feel.shakeX;
    this.worldLayer.y = -cam.y + this.feel.shakeY;

    this.layoutPlatforms(world, cam.x, screenW);

    // coins — fewer, bigger, readable; gentle bob + a coin-flip turn
    let mi = 0;
    for (const m of world.course.motes) {
      if (m.taken || m.x < cam.x - 50 || m.x > cam.x + screenW + 50) continue;
      if (mi >= this.motes.length) break;
      const s = this.motes[mi++] as Sprite;
      s.visible = true;
      const ph = m.x * 0.013;
      s.x = m.x;
      s.y = m.y + Math.sin(this.t * 2.4 + ph) * 4;
      const flip = 0.34 + 0.66 * Math.abs(Math.cos(this.t * 2.6 + ph));
      s.scale.set((COIN_PX / COIN_TEX) * flip, COIN_PX / COIN_TEX);
      s.rotation = Math.sin(this.t * 0.8 + ph) * 0.12;
    }
    for (let i = mi; i < this.motes.length; i++) (this.motes[i] as Sprite).visible = false;

    let wi = 0;
    for (const w of world.course.wisps) {
      if (w.dead || w.x < cam.x - 60 || w.x > cam.x + screenW + 60) continue;
      if (wi >= this.wisps.length) break;
      const s = this.wisps[wi++] as Sprite;
      s.visible = true;
      s.x = w.x + Math.sin(this.t * 2 + w.ph) * 6;
      s.y = w.y + Math.cos(this.t * 1.7 + w.ph) * 8;
      s.scale.set((46 * (1 + Math.sin(this.t * 5 + w.ph) * 0.2)) / GLOW);
      s.alpha = 0.7 + Math.sin(this.t * 4 + w.ph) * 0.18;
    }
    for (let i = wi; i < this.wisps.length; i++) (this.wisps[i] as Sprite).visible = false;

    const p = world.player;
    for (let i = this.trail.length - 1; i > 0; i--) {
      const a = this.trailPos[i] as { x: number; y: number };
      const b = this.trailPos[i - 1] as { x: number; y: number };
      a.x = b.x;
      a.y = b.y;
    }
    const head = this.trailPos[0] as { x: number; y: number };
    head.x = p.x;
    head.y = p.y;
    for (let i = 0; i < this.trail.length; i++) {
      const s = this.trail[i] as Sprite;
      const tp = this.trailPos[i] as { x: number; y: number };
      s.x = tp.x;
      s.y = tp.y;
      s.visible = !p.dead;
    }

    // hero ember — heat shifts toward white-gold with combo
    const comboK = Math.min(1, world.combo / 14);
    const hot = comboK * 0.7;
    const flicker = 0.86 + Math.sin(this.t * 23) * 0.08 + Math.sin(this.t * 41) * 0.05;
    const dead = p.dead;

    this.heroOuter.tint = lerpTint(0xff8a44, 0xffd27a, hot);
    // capped at the glow texture's native size (128) so it never upscales/softens
    // or balloons the additive overdraw on a dash
    const outerPx = (p.dashing ? 128 : 112) * (1 + Math.sin(this.t * 8) * 0.05);
    this.heroOuter.width = outerPx;
    this.heroOuter.height = outerPx;
    this.heroOuter.x = p.x;
    this.heroOuter.y = p.y;
    this.heroOuter.alpha = dead ? 0.12 : 0.95;

    this.heroFlame.tint = lerpTint(0xffb060, 0xfff0c0, hot);
    this.heroFlame.x = p.x;
    this.heroFlame.y = p.y + 4;
    this.heroFlame.rotation = Math.sin(this.t * 7) * 0.12 - clamp(p.vx * 0.00008, 0, 0.18);
    const flameW = (p.dashing ? 40 : 34) / FLAME_TEX;
    const flameH = ((p.dashing ? 54 : 48) / FLAME_TEX) * flicker;
    this.heroFlame.scale.set(flameW, flameH);
    this.heroFlame.alpha = dead ? 0 : 0.95;

    const stretch = clamp(-p.vy / 2600, -0.2, 0.2);
    this.heroCore.tint = lerpTint(0xffe6c2, 0xffffff, hot);
    const corePx = (p.dashing ? 38 : 30) / CORE_TEX;
    this.heroCore.scale.set(corePx * (1 - stretch), corePx * (1 + stretch));
    this.heroCore.x = p.x;
    this.heroCore.y = p.y;
    this.heroCore.alpha = dead ? 0.08 : 1;

    // the Dark wall — solid on the left, soft leading edge, cold embers pulled in
    const darkX = world.dark.x - cam.x + this.feel.shakeX;
    this.darkG.clear();
    if (darkX > -40) {
      this.darkG.rect(-60, -60, darkX + 60, screenH + 120).fill({ color: 0x06030e, alpha: 0.97 });
    }
    this.darkEdge.x = darkX;
    this.darkEdge.y = -60;
    this.darkEdge.width = DARK_EDGE_W;
    this.darkEdge.height = screenH + 120;
    this.darkEdge.visible = darkX > -DARK_EDGE_W && darkX < screenW;
    const edgeVisible = darkX > -120 && darkX < screenW + 40;
    for (let i = 0; i < this.darkEmbers.length; i++) {
      const s = this.darkEmbers[i] as Sprite;
      if (!edgeVisible || !this.bloomOn) {
        s.visible = false;
        continue;
      }
      const ph = this.darkEmberPh[i] as number;
      s.visible = true;
      s.x = darkX + 18 + (Math.sin(this.t * 1.3 + ph) * 0.5 + 0.5) * (DARK_EDGE_W * 0.7);
      s.y = ((this.t * 22 + i * 90 + Math.sin(this.t + ph) * 30) % (screenH + 40));
      const sz = 8 + Math.sin(this.t * 4 + ph) * 4;
      s.width = sz;
      s.height = sz;
      s.alpha = 0.3 + Math.sin(this.t * 3 + ph) * 0.2;
    }
  }

  emit(events: GameEvent[], world: World): void {
    const p = world.player;
    for (const e of events) {
      switch (e) {
        case 'jump':
          this.particles.emit(p.x, p.y + p.halfH, { count: 7, speed: 130, spread: 0.8, dir: HALF / 2, life: 0.35, size: 16, tint: 0xffcaa0, grav: 200 });
          break;
        case 'double':
          this.particles.emit(p.x, p.y, { count: 10, speed: 170, spread: HALF, dir: 0, life: 0.4, size: 16, tint: 0xffd27a, grav: 0 });
          break;
        case 'dash':
          this.particles.emit(p.x, p.y, { count: 14, speed: 220, spread: 0.5, dir: HALF, life: 0.32, size: 18, tint: 0xff9e5e, grav: 0 });
          this.feel.addTrauma(0.12);
          break;
        case 'dashkill':
          this.particles.emit(p.x, p.y, { count: 26, speed: 320, spread: HALF, dir: 0, life: 0.5, size: 20, tint: 0xfff0c0, grav: 0 });
          this.feel.addTrauma(0.3);
          this.feel.freeze(55);
          break;
        case 'land':
          this.particles.emit(p.x, p.y + p.halfH, { count: 5, speed: 110, spread: 0.5, dir: 0, life: 0.3, size: 14, tint: 0xcdb8ff, grav: 120 });
          break;
        case 'poundland':
          this.particles.emit(p.x, p.y + p.halfH, { count: 20, speed: 360, spread: 0.6, dir: 0, life: 0.4, size: 18, tint: 0xff8fb0, grav: 100 });
          this.feel.addTrauma(0.34);
          this.feel.freeze(45);
          break;
        case 'mote':
          this.particles.emit(p.x, p.y, { count: 10, speed: 170, spread: HALF, dir: 0, life: 0.45, size: 15, tint: 0xffe6a0, grav: -30 });
          break;
        case 'tumble':
          this.feel.addTrauma(0.5);
          break;
        case 'die':
          this.particles.emit(p.x, p.y, { count: 40, speed: 420, spread: HALF, dir: 0, life: 0.7, size: 22, tint: 0xff7a3d, grav: 60 });
          this.feel.addTrauma(0.85);
          this.feel.freeze(120);
          break;
        default:
          break;
      }
    }
  }

  destroy(): void {
    // Capture the baked textures BEFORE the display tree is torn down, then free
    // their GPU resources — root.destroy() releases sprites/graphics but NOT the
    // Texture.from(canvas) sources, which would otherwise leak on every retry.
    const owned = [
      this.glowTex,
      this.coinTex,
      this.coreTex,
      this.flameTex,
      this.slabTex,
      this.sky.texture,
      this.vignette.texture,
      this.darkEdge.texture,
    ];
    this.app.stage.removeChild(this.root);
    this.root.destroy({ children: true });
    for (const t of owned) {
      try {
        t.destroy(true);
      } catch {
        // already released
      }
    }
  }
}
