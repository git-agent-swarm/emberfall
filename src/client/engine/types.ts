// Core gameplay value types, shared across the engine logic modules. Kept tiny
// and plain so the simulation stays allocation-light and easy to reason about.

export type Vec2 = { x: number; y: number };

// One-way platform: you land on its top edge (y) spanning x..x+w; you pass up
// through it from below. `fragile` platforms shatter on a ground-pound.
export type Platform = { x: number; y: number; w: number; fragile: boolean };

export type Mote = { x: number; y: number; taken: boolean };

// Shade-wisp enemy: hovers (usually over a gap). Dash THROUGH it to kill it and
// refund the dash (the chain mechanic). Touch it without dashing = you tumble.
export type Wisp = { x: number; y: number; r: number; ph: number; dead: boolean };

// Per-frame control state produced by input.ts (touch / keyboard / gamepad).
export type Inputs = {
  jumpHeld: boolean;
  jumpPressed: boolean;
  dashPressed: boolean;
  dashX: number; // aim vector (already normalized; defaults to forward)
  dashY: number;
  poundPressed: boolean;
};

export const emptyInputs = (): Inputs => ({
  jumpHeld: false,
  jumpPressed: false,
  dashPressed: false,
  dashX: 1,
  dashY: 0,
  poundPressed: false,
});

// Discrete things that happened in a sim step — drive juice, particles, audio.
export type GameEvent =
  | 'jump'
  | 'double'
  | 'dash'
  | 'dashkill'
  | 'land'
  | 'pound'
  | 'poundland'
  | 'mote'
  | 'tumble'
  | 'die';
