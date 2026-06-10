// Session: binds the pure World sim to the Pixi View, input, feel, the FPS guard,
// and the server submit/retry lifecycle. Exposes a tiny imperative API + a
// throttled HUD-state callback so React stays a thin overlay.

import type { Application, Ticker } from 'pixi.js';
import type { Biome, InitResponse, RunResult } from '../../shared/api';
import { World, type WorldPhase } from './world';
import { View } from './render';
import { Feel } from './feel';
import { InputController } from './input';
import { AudioEngine } from './audio';
import { baseQuality, createFpsGuard } from './quality';
import { submitRun } from '../lib/api';

export type HudState = {
  phase: WorldPhase;
  score: number;
  distance: number;
  combo: number;
  motes: number;
  bestCombo: number;
  longestChain: number;
  result: RunResult | null;
  submitting: boolean;
};

export type Session = { destroy: () => void; retry: () => void };

const DEFAULT_BIOME: Biome = { id: 'emberfall', name: 'Emberfall', autoTint: '#FF7A3D' };

export const createSession = (
  app: Application,
  init: InitResponse | null,
  host: HTMLElement,
  onHud: (s: HudState) => void
): Session => {
  const seed = init?.seed ?? 1234567;
  const biome = init?.biome ?? DEFAULT_BIOME;
  const feel = new Feel();
  const input = new InputController();
  const audio = new AudioEngine();
  input.attach(host);

  let world = new World(seed, app.screen.width, app.screen.height);
  let view = new View(app, biome, feel);
  const guard = createFpsGuard(baseQuality(), (q) => view.setQuality(q));

  let submitted = false;
  let result: RunResult | null = null;
  let submitting = false;
  let hudT = 0;
  let lastPhase: WorldPhase = world.phase;

  const emit = (): void =>
    onHud({
      phase: world.phase,
      score: world.score,
      distance: Math.round(world.distance),
      combo: world.combo,
      motes: world.motes,
      bestCombo: world.bestCombo,
      longestChain: world.longestChain,
      result,
      submitting,
    });

  const doSubmit = async (): Promise<void> => {
    if (!init) {
      emit();
      return;
    }
    submitting = true;
    emit();
    try {
      result = await submitRun(world.submit('daily'));
    } catch {
      result = null;
    }
    submitting = false;
    emit();
  };

  const kick = (): void => {
    audio.resume();
    if (world.phase === 'ready') {
      world.start();
      audio.startAmbient();
      emit();
    }
  };
  host.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);

  const tick = (tk: Ticker): void => {
    guard.sample(tk.deltaMS);
    const dt = Math.min(tk.deltaMS / 1000, 0.033);
    const sd = feel.simStep(dt);
    if (sd > 0) {
      world.update(sd, input.read());
      view.emit(world.events, world);
      audio.emit(world.events, world);
    } else {
      input.read(); // flush edges during a hit-stop freeze
    }
    feel.update(dt);
    view.update(dt);
    view.syncWorld(world);

    if (world.phase === 'dead' && !submitted) {
      submitted = true;
      void doSubmit();
    }

    hudT += dt;
    if (hudT >= 0.1 || world.phase !== lastPhase) {
      hudT = 0;
      lastPhase = world.phase;
      emit();
    }
  };
  app.ticker.add(tick);

  const onResize = (): void => {
    world.resize(app.screen.width, app.screen.height);
    view.resize();
  };
  window.addEventListener('resize', onResize);

  const retry = (): void => {
    audio.resume(); // re-arm the context on the retry gesture (mobile may suspend)
    feel.reset();
    view.destroy();
    world = new World(seed, app.screen.width, app.screen.height);
    view = new View(app, biome, feel);
    view.setQuality(guard.quality()); // keep the adapted tier across runs
    submitted = false;
    result = null;
    submitting = false;
    lastPhase = world.phase;
    emit();
  };

  const destroy = (): void => {
    app.ticker.remove(tick);
    input.detach();
    host.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
    window.removeEventListener('resize', onResize);
    audio.destroy();
    view.destroy();
  };

  emit();
  return { destroy, retry };
};
