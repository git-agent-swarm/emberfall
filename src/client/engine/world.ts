// World orchestrator: owns the course, hero, Dark and camera; advances the sim;
// turns sim events into score/combo/chain; and packages a run for submission.
// Pure logic — no Pixi — so it stays deterministic and unit-testable.

import { Course } from './levelgen';
import { Player } from './player';
import { Dark } from './dark';
import { makeCamera, updateCamera, type Camera } from './camera';
import type { GameEvent, Inputs } from './types';
import type { RunMode, RunSubmit } from '../../shared/api';

const BASE_SPEED = 330;
const SPEED_RAMP = 8; // px/s gained per second elapsed
const MAX_ADD = 520; // tops out near 850 px/s
const METER = 42; // px per displayed metre
const DIST_PTS = 2;
const MOTE_PTS = 25;
const COMBO_PTS = 45;
const COMBO_WINDOW = 2.2;
const MOTE_PUSH = 60;
const TRACE_DT = 0.12;

export type WorldPhase = 'ready' | 'playing' | 'dead';

export class World {
  readonly course: Course;
  readonly player = new Player();
  readonly dark = new Dark();
  readonly cam: Camera = makeCamera();
  phase: WorldPhase = 'ready';

  runSpeed = BASE_SPEED;
  elapsed = 0;
  distance = 0; // metres
  motes = 0;
  combo = 0;
  bestCombo = 0;
  chain = 0;
  longestChain = 0;
  peakSpeed = 0;
  score = 0;
  events: GameEvent[] = [];
  readonly trace: number[] = [];

  private comboT = 0;
  private traceT = 0;

  constructor(
    private readonly seed: number,
    private screenW: number,
    private screenH: number
  ) {
    this.course = new Course(seed);
    updateCamera(this.cam, this.player.x, this.player.y, 0, screenW, screenH, 1);
  }

  resize(w: number, h: number): void {
    this.screenW = w;
    this.screenH = h;
  }

  start(): void {
    if (this.phase === 'ready') this.phase = 'playing';
  }

  private addCombo(): void {
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.comboT = COMBO_WINDOW;
  }

  update(dt: number, inputs: Inputs): void {
    if (this.phase !== 'playing') {
      this.events = [];
      updateCamera(this.cam, this.player.x, this.player.y, this.player.vy, this.screenW, this.screenH, dt);
      return;
    }

    this.elapsed += dt;
    this.runSpeed = BASE_SPEED + Math.min(MAX_ADD, this.elapsed * SPEED_RAMP);

    const ev = this.player.update(dt, this.course, inputs, this.runSpeed);
    for (const e of ev) {
      if (e === 'mote') {
        this.motes++;
        this.addCombo();
        this.dark.push(MOTE_PUSH);
      } else if (e === 'dashkill') {
        this.chain++;
        if (this.chain > this.longestChain) this.longestChain = this.chain;
        this.addCombo();
      } else if (e === 'land') {
        this.chain = 0;
      } else if (e === 'tumble') {
        this.combo = 0;
      }
    }

    this.course.ensureAhead(this.player.x);
    this.course.prune(this.player.x);
    this.dark.update(dt, this.runSpeed, this.player.x);

    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;

    if (this.player.x / METER > this.distance) this.distance = this.player.x / METER;
    const spd = Math.hypot(this.player.vx, this.player.vy);
    if (spd > this.peakSpeed) this.peakSpeed = spd;

    this.score = Math.floor(
      this.distance * DIST_PTS + this.motes * MOTE_PTS + this.bestCombo * COMBO_PTS
    );

    // Publish events BEFORE the death check so die() appends 'die' to the live
    // array. A Dark-catch death never self-marks the player dead (it's a pure
    // position check), so without this its burst/sound/shake were discarded —
    // the game's namesake fail-state died silently.
    this.events = ev;
    if (this.player.dead || this.dark.caught(this.player.x, this.player.halfW)) this.die();

    this.traceT += dt;
    if (this.traceT >= TRACE_DT) {
      this.traceT = 0;
      this.trace.push(Math.round(this.player.x), Math.round(this.player.y));
    }

    updateCamera(this.cam, this.player.x, this.player.y, this.player.vy, this.screenW, this.screenH, dt);
  }

  private die(): void {
    if (this.phase === 'dead') return;
    this.phase = 'dead';
    this.player.dead = true;
    if (!this.events.includes('die')) this.events.push('die');
  }

  submit(mode: RunMode): RunSubmit {
    return {
      mode,
      seed: this.seed,
      score: this.score,
      distance: Math.round(this.distance),
      peakSpeed: Math.round(this.peakSpeed),
      bestCombo: this.bestCombo,
      longestChain: this.longestChain,
      motes: this.motes,
      durationMs: Math.round(this.elapsed * 1000),
      trace: this.trace.slice(),
    };
  }
}
