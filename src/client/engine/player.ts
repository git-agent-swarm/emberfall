// The hero verb state machine + one-way platform physics. Auto-runs forward; the
// player controls vertical play and tempo. The dash IS the attack: dash through a
// shade-wisp to kill it AND refund the dash, enabling chains across gaps — the
// skill ceiling. Coyote-time + jump-buffering + variable height keep it forgiving.

import type { Course } from './levelgen';
import { FALL_Y } from './levelgen';
import type { GameEvent, Inputs } from './types';

const GRAVITY = 2400;
const JUMP_V = -780;
const DOUBLE_V = -700;
const JUMP_CUT_V = -240;
const POUND_V = 1550;
const DASH_SPEED = 1150;
const DASH_TIME = 0.16;
const COYOTE = 0.09;
const BUFFER = 0.12;
const HALF_W = 15;
const HALF_H = 18;
const WISP_HIT = 30;
const MOTE_HIT = 34; // matches the bigger coin art — forgiving but fair pickup
const MAX_FALL = 1500;

export class Player {
  x = 0;
  y = -40;
  vx = 0;
  vy = 0;
  onGround = false;
  dashing = false;
  pounding = false;
  dead = false;
  dashAvail = true;
  invuln = 0;
  readonly halfW = HALF_W;
  readonly halfH = HALF_H;

  private canDouble = false;
  private coyote = 0;
  private buffer = 0;
  private dashT = 0;

  update(dt: number, course: Course, inputs: Inputs, runSpeed: number): GameEvent[] {
    const ev: GameEvent[] = [];
    if (this.dead) return ev;

    this.invuln = Math.max(0, this.invuln - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.buffer = inputs.jumpPressed ? BUFFER : Math.max(0, this.buffer - dt);

    const wasGround = this.onGround;
    const oldFeet = this.y + this.halfH;

    // --- dash start ---
    if (inputs.dashPressed && this.dashAvail && this.dashT <= 0) {
      let dx = inputs.dashX;
      let dy = inputs.dashY;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      this.dashT = DASH_TIME;
      this.dashing = true;
      this.dashAvail = false;
      this.pounding = false;
      this.vx = dx * DASH_SPEED;
      this.vy = dy * DASH_SPEED;
      this.invuln = Math.max(this.invuln, DASH_TIME);
      ev.push('dash');
    }

    if (this.dashing) {
      this.dashT -= dt;
      if (this.dashT <= 0) {
        this.dashing = false;
        this.vx = runSpeed;
        this.vy = this.vy > 0 ? Math.min(this.vy, 200) : Math.max(this.vy, -260);
      }
    } else {
      this.vx = runSpeed; // auto-run

      if (inputs.poundPressed && !this.onGround && !this.pounding) {
        this.pounding = true;
        this.vy = POUND_V;
        ev.push('pound');
      }

      this.vy += GRAVITY * dt * (this.pounding ? 0.6 : 1);
      if (this.vy > MAX_FALL) this.vy = MAX_FALL;

      if (this.buffer > 0 && (this.onGround || this.coyote > 0)) {
        this.vy = JUMP_V;
        this.onGround = false;
        this.coyote = 0;
        this.buffer = 0;
        this.canDouble = true;
        ev.push('jump');
      } else if (this.buffer > 0 && this.canDouble && !this.onGround) {
        this.vy = DOUBLE_V;
        this.canDouble = false;
        this.buffer = 0;
        ev.push('double');
      }

      if (!inputs.jumpHeld && this.vy < JUMP_CUT_V) this.vy = JUMP_CUT_V; // variable height
    }

    // --- integrate ---
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // --- one-way platform landing (only while descending) ---
    this.onGround = false;
    if (this.vy >= 0) {
      const newFeet = this.y + this.halfH;
      for (const p of course.platforms) {
        if (p.w <= 0) continue;
        if (this.x + this.halfW < p.x || this.x - this.halfW > p.x + p.w) continue;
        if (oldFeet <= p.y && newFeet >= p.y) {
          if (this.pounding && p.fragile) {
            p.w = 0; // shatter — fall through
            this.pounding = false;
            ev.push('poundland');
            continue;
          }
          this.y = p.y - this.halfH;
          this.vy = 0;
          this.onGround = true;
          this.canDouble = true;
          this.dashAvail = true;
          if (this.pounding) {
            this.pounding = false;
            ev.push('poundland');
          }
          // Only a fresh air->ground touchdown is a "land" — otherwise the
          // one-way re-grounding fires every frame while running (audio/particle
          // spam + the dash-chain resetting constantly). Position still snaps.
          if (!wasGround) ev.push('land');
          break;
        }
      }
    }
    if (wasGround && !this.onGround && !this.dashing && this.vy >= 0) this.coyote = COYOTE;

    // --- shade-wisps: dash-kill (refund) or tumble ---
    for (const wsp of course.wisps) {
      if (wsp.dead) continue;
      const dx = this.x - wsp.x;
      const dy = this.y - wsp.y;
      if (dx * dx + dy * dy > WISP_HIT * WISP_HIT) continue;
      if (this.dashing) {
        wsp.dead = true;
        this.dashAvail = true; // refund -> chain
        ev.push('dashkill');
      } else if (this.invuln <= 0) {
        wsp.dead = true;
        this.invuln = 0.6;
        ev.push('tumble');
      }
    }

    // --- motes ---
    for (const m of course.motes) {
      if (m.taken) continue;
      const dx = this.x - m.x;
      const dy = this.y - m.y;
      if (dx * dx + dy * dy <= MOTE_HIT * MOTE_HIT) {
        m.taken = true;
        ev.push('mote');
      }
    }

    if (this.y > FALL_Y) {
      this.dead = true;
      ev.push('die');
    }
    return ev;
  }
}
