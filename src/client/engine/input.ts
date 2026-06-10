// Unified input -> per-frame control state. Touch is first-class: the left ~45%
// of the screen is the JUMP zone (tap = jump, hold = float higher, tap-in-air =
// double-jump), the right side is the DASH zone (tap = forward dash, flick = aim
// the dash), and a fast swipe-down anywhere is a ground-pound. Keyboard + gamepad
// mirror it for desktop. Edge-triggered presses are cleared each read().

import { emptyInputs, type Inputs } from './types';

type Ptr = { zone: 'jump' | 'dash'; sx: number; sy: number; lx: number; ly: number; consumed: boolean };

const SWIPE_DOWN = 55;
const FLICK_MIN = 16;

export class InputController {
  private el: HTMLElement | null = null;
  private readonly ptrs = new Map<number, Ptr>();

  private touchJumpHeld = false;
  private jumpEdge = false;
  private dashEdge = false;
  private poundEdge = false;
  private dashX = 1;
  private dashY = -0.2;

  // keyboard
  private kb = { jumpHeld: false, up: false, down: false, left: false, right: false };
  private kbJumpEdge = false;
  private kbDashEdge = false;
  private kbPoundEdge = false;

  // gamepad edge tracking
  private padPrev: boolean[] = [];

  attach(el: HTMLElement): void {
    this.el = el;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach(): void {
    const el = this.el;
    if (el) {
      el.removeEventListener('pointerdown', this.onDown);
      el.removeEventListener('pointermove', this.onMove);
    }
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    this.ptrs.clear();
  }

  private onDown = (e: PointerEvent): void => {
    const el = this.el;
    if (!el) return;
    const w = el.clientWidth || window.innerWidth;
    const zone: 'jump' | 'dash' = e.clientX < w * 0.45 ? 'jump' : 'dash';
    this.ptrs.set(e.pointerId, {
      zone,
      sx: e.clientX,
      sy: e.clientY,
      lx: e.clientX,
      ly: e.clientY,
      consumed: false,
    });
    if (zone === 'jump') {
      this.touchJumpHeld = true;
      this.jumpEdge = true;
    }
  };

  private onMove = (e: PointerEvent): void => {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    p.lx = e.clientX;
    p.ly = e.clientY;
    // swipe-down -> pound (mostly vertical, downward, far enough)
    const dx = e.clientX - p.sx;
    const dy = e.clientY - p.sy;
    if (!p.consumed && dy > SWIPE_DOWN && dy > Math.abs(dx) * 1.2) {
      this.poundEdge = true;
      p.consumed = true;
    }
  };

  private onUp = (e: PointerEvent): void => {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (p.zone === 'jump') {
      let anyJump = false;
      for (const q of this.ptrs.values()) if (q.zone === 'jump') anyJump = true;
      if (!anyJump) this.touchJumpHeld = false;
      return;
    }
    if (p.consumed) return; // was a pound
    const dx = p.lx - p.sx;
    const dy = p.ly - p.sy;
    if (Math.hypot(dx, dy) >= FLICK_MIN) {
      this.dashX = dx;
      this.dashY = dy;
    } else {
      this.dashX = 1;
      this.dashY = -0.2; // tap = forward-up dash
    }
    this.dashEdge = true;
  };

  private onKey = (e: KeyboardEvent): void => {
    switch (e.code) {
      case 'Space':
      case 'ArrowUp':
      case 'KeyW':
        if (!e.repeat) this.kbJumpEdge = true;
        this.kb.jumpHeld = true;
        this.kb.up = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
      case 'KeyK':
      case 'KeyX':
        if (!e.repeat) this.kbDashEdge = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        if (!e.repeat) this.kbPoundEdge = true;
        this.kb.down = true;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.kb.left = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.kb.right = true;
        break;
      default:
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    switch (e.code) {
      case 'Space':
      case 'ArrowUp':
      case 'KeyW':
        this.kb.jumpHeld = false;
        this.kb.up = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.kb.down = false;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.kb.left = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.kb.right = false;
        break;
      default:
        break;
    }
  };

  private pollGamepad(out: { jumpHeld: boolean; jump: boolean; dash: boolean; pound: boolean; ax: number; ay: number }): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && pads[0];
    if (!pad) return;
    const btn = (i: number): boolean => Boolean(pad.buttons[i]?.pressed);
    const edge = (i: number): boolean => {
      const now = btn(i);
      const was = this.padPrev[i] ?? false;
      this.padPrev[i] = now;
      return now && !was;
    };
    if (btn(0)) out.jumpHeld = true;
    if (edge(0)) out.jump = true;
    if (edge(2) || edge(5) || edge(7)) out.dash = true;
    if (edge(1) || edge(6)) out.pound = true;
    out.ax = pad.axes[0] ?? 0;
    out.ay = pad.axes[1] ?? 0;
  }

  read(): Inputs {
    const out = emptyInputs();
    const pad = { jumpHeld: false, jump: false, dash: false, pound: false, ax: 0, ay: 0 };
    this.pollGamepad(pad);

    out.jumpHeld = this.touchJumpHeld || this.kb.jumpHeld || pad.jumpHeld;
    out.jumpPressed = this.jumpEdge || this.kbJumpEdge || pad.jump;
    out.poundPressed = this.poundEdge || this.kbPoundEdge || pad.pound;

    const dash = this.dashEdge || this.kbDashEdge || pad.dash;
    out.dashPressed = dash;
    if (dash) {
      if (this.dashEdge) {
        out.dashX = this.dashX;
        out.dashY = this.dashY;
      } else if (pad.dash && (Math.abs(pad.ax) > 0.3 || Math.abs(pad.ay) > 0.3)) {
        out.dashX = pad.ax;
        out.dashY = pad.ay;
      } else {
        const kx = (this.kb.right ? 1 : 0) - (this.kb.left ? 1 : 0);
        const ky = (this.kb.down ? 1 : 0) - (this.kb.up ? 1 : 0);
        out.dashX = kx === 0 && ky === 0 ? 1 : kx;
        out.dashY = kx === 0 && ky === 0 ? -0.2 : ky;
      }
    }

    this.jumpEdge = false;
    this.dashEdge = false;
    this.poundEdge = false;
    this.kbJumpEdge = false;
    this.kbDashEdge = false;
    this.kbPoundEdge = false;
    return out;
  }
}
