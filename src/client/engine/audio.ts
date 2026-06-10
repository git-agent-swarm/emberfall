// Procedural Web Audio. No asset files (the Devvit runtime has no network), so
// every sound is synthesized: filtered-noise bursts + enveloped oscillators
// through a soft limiter and a touch of reverb. The signature sound is the coin
// "water-on-fire" quench — a steam-hiss sweeping down, a low thump, and a subtle
// combo-pitched ting. Tuned quiet and satisfying. All public methods are wrapped
// so an audio failure can never break the game loop; if AudioContext is missing
// the whole engine no-ops.

import type { GameEvent } from './types';
import type { World } from './world';

type ToneOpts = {
  type: OscillatorType;
  freq: number;
  freq2?: number;
  t0: number;
  dur: number;
  gain: number;
  attack?: number;
  send?: number;
};

type NoiseOpts = {
  type: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  t0: number;
  dur: number;
  gain: number;
  send?: number;
};

type Ambient = { stop: () => void };

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noise: AudioBuffer | null = null;
  private ambient: Ambient | null = null;
  private ambientTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    try {
      const w = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const AC = w.AudioContext ?? w.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.18;
      limiter.connect(ctx.destination);

      const master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(limiter);
      this.master = master;

      const reverb = ctx.createConvolver();
      reverb.buffer = this.impulse(1.5, 2.6);
      const revGain = ctx.createGain();
      revGain.gain.value = 0.16;
      reverb.connect(revGain);
      revGain.connect(limiter);
      this.reverb = reverb;

      this.noise = this.makeNoise(1);
    } catch {
      this.ctx = null;
    }
  }

  resume(): void {
    try {
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      // ignore
    }
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private now(): number {
    return (this.ctx as AudioContext).currentTime;
  }

  private tone(o: ToneOpts): void {
    const ctx = this.ctx as AudioContext;
    const master = this.master as GainNode;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const attack = o.attack ?? 0.005;
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, o.t0);
    if (o.freq2 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(o.freq2, 1), o.t0 + o.dur);
    g.gain.setValueAtTime(0.0001, o.t0);
    g.gain.linearRampToValueAtTime(o.gain, o.t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, o.t0 + o.dur);
    osc.connect(g);
    g.connect(master);
    if (this.reverb && o.send) {
      const sg = ctx.createGain();
      sg.gain.value = o.send;
      g.connect(sg);
      sg.connect(this.reverb);
    }
    osc.start(o.t0);
    osc.stop(o.t0 + o.dur + 0.03);
  }

  private noiseBurst(o: NoiseOpts): void {
    const ctx = this.ctx as AudioContext;
    const master = this.master as GainNode;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const flt = ctx.createBiquadFilter();
    flt.type = o.type;
    flt.frequency.setValueAtTime(o.f0, o.t0);
    if (o.f1 !== undefined) flt.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 1), o.t0 + o.dur);
    flt.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, o.t0);
    g.gain.linearRampToValueAtTime(o.gain, o.t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, o.t0 + o.dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(master);
    if (this.reverb && o.send) {
      const sg = ctx.createGain();
      sg.gain.value = o.send;
      g.connect(sg);
      sg.connect(this.reverb);
    }
    src.start(o.t0, Math.random() * 0.4);
    src.stop(o.t0 + o.dur + 0.03);
  }

  // The signature coin sound: steam hiss sweeping down + low quench thump + a
  // subtle ting that pitches up with the combo. "Water hitting fire", kept soft.
  private coin(combo: number): void {
    const t0 = this.now();
    this.noiseBurst({ type: 'bandpass', f0: 5200, f1: 1100, q: 0.8, t0, dur: 0.22, gain: 0.12, send: 0.18 });
    this.noiseBurst({ type: 'highpass', f0: 3200, q: 0.7, t0, dur: 0.12, gain: 0.05 });
    this.tone({ type: 'sine', freq: 150, freq2: 68, t0, dur: 0.16, gain: 0.08, send: 0.1 });
    const step = Math.min(combo, 16);
    const ping = 640 * Math.pow(2, step / 24);
    this.tone({ type: 'triangle', freq: ping, t0: t0 + 0.012, dur: 0.18, gain: 0.05, send: 0.22 });
  }

  emit(events: GameEvent[], world: World): void {
    if (!this.ctx || !this.master) return;
    try {
      const t = this.now();
      for (const e of events) {
        switch (e) {
          case 'jump':
            this.noiseBurst({ type: 'lowpass', f0: 600, f1: 1900, t0: t, dur: 0.16, gain: 0.05 });
            this.tone({ type: 'sine', freq: 300, freq2: 540, t0: t, dur: 0.12, gain: 0.04, send: 0.08 });
            break;
          case 'double':
            this.tone({ type: 'triangle', freq: 540, freq2: 900, t0: t, dur: 0.14, gain: 0.05, send: 0.12 });
            this.noiseBurst({ type: 'highpass', f0: 3000, t0: t, dur: 0.1, gain: 0.03 });
            break;
          case 'dash':
            this.noiseBurst({ type: 'bandpass', f0: 1900, f1: 420, q: 1.2, t0: t, dur: 0.18, gain: 0.1, send: 0.12 });
            this.tone({ type: 'sawtooth', freq: 220, freq2: 90, t0: t, dur: 0.12, gain: 0.035 });
            break;
          case 'dashkill':
            this.noiseBurst({ type: 'highpass', f0: 4200, t0: t, dur: 0.12, gain: 0.1, send: 0.18 });
            this.tone({ type: 'square', freq: 900, freq2: 220, t0: t, dur: 0.16, gain: 0.05, send: 0.15 });
            this.tone({ type: 'sine', freq: 120, freq2: 58, t0: t, dur: 0.2, gain: 0.08 });
            break;
          case 'land':
            this.tone({ type: 'sine', freq: 180, freq2: 92, t0: t, dur: 0.1, gain: 0.04 });
            this.noiseBurst({ type: 'lowpass', f0: 420, t0: t, dur: 0.06, gain: 0.025 });
            break;
          case 'pound':
            this.tone({ type: 'sawtooth', freq: 420, freq2: 80, t0: t, dur: 0.18, gain: 0.06 });
            break;
          case 'poundland':
            this.tone({ type: 'sine', freq: 110, freq2: 48, t0: t, dur: 0.24, gain: 0.1, send: 0.12 });
            this.noiseBurst({ type: 'lowpass', f0: 900, f1: 200, t0: t, dur: 0.2, gain: 0.08 });
            break;
          case 'mote':
            this.coin(world.combo);
            break;
          case 'tumble':
            this.tone({ type: 'square', freq: 200, freq2: 130, t0: t, dur: 0.2, gain: 0.06 });
            this.noiseBurst({ type: 'bandpass', f0: 800, q: 1, t0: t, dur: 0.18, gain: 0.04 });
            break;
          case 'die':
            this.tone({ type: 'sine', freq: 400, freq2: 66, t0: t, dur: 0.7, gain: 0.09, send: 0.25 });
            this.noiseBurst({ type: 'bandpass', f0: 4200, f1: 300, q: 0.7, t0: t, dur: 0.8, gain: 0.08, send: 0.2 });
            this.tone({ type: 'sine', freq: 120, freq2: 40, t0: t + 0.04, dur: 0.5, gain: 0.07 });
            this.stopAmbient();
            break;
          default:
            break;
        }
      }
    } catch {
      // never let audio break the frame
    }
  }

  // A low evolving drone + a soft filtered-noise wind bed — atmosphere, very low.
  startAmbient(): void {
    if (!this.ctx || !this.master || !this.noise) return;
    try {
      this.stopAmbient();
      const ctx = this.ctx;
      const master = this.master;
      const t = ctx.currentTime;

      const bed = ctx.createGain();
      bed.gain.setValueAtTime(0.0001, t);
      bed.gain.linearRampToValueAtTime(1, t + 2);
      bed.connect(master);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 620;
      lp.connect(bed);

      const o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = 55;
      const g1 = ctx.createGain();
      g1.gain.value = 0.05;
      o1.connect(g1);
      g1.connect(lp);

      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = 55.4;
      const g2 = ctx.createGain();
      g2.gain.value = 0.04;
      o2.connect(g2);
      g2.connect(lp);

      // slow filter LFO for movement
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 220;
      lfo.connect(lfoG);
      lfoG.connect(lp.frequency);

      // wind: looped noise through a wandering bandpass
      const wind = ctx.createBufferSource();
      wind.buffer = this.noise;
      wind.loop = true;
      const wbp = ctx.createBiquadFilter();
      wbp.type = 'bandpass';
      wbp.frequency.value = 480;
      wbp.Q.value = 0.6;
      const wg = ctx.createGain();
      wg.gain.value = 0.03;
      wind.connect(wbp);
      wbp.connect(wg);
      wg.connect(bed);
      const wlfo = ctx.createOscillator();
      wlfo.type = 'sine';
      wlfo.frequency.value = 0.05;
      const wlfoG = ctx.createGain();
      wlfoG.gain.value = 240;
      wlfo.connect(wlfoG);
      wlfoG.connect(wbp.frequency);

      o1.start(t);
      o2.start(t);
      lfo.start(t);
      wind.start(t);
      wlfo.start(t);

      this.ambient = {
        stop: (): void => {
          const end = ctx.currentTime;
          bed.gain.cancelScheduledValues(end);
          // ramp from the audible level (reading .value returns the param's base,
          // not the live ramp, so anchor at ~1 for a real fade instead of a click)
          bed.gain.setValueAtTime(1, end);
          bed.gain.linearRampToValueAtTime(0.0001, end + 0.5);
          const stopAll = (): void => {
            for (const n of [o1, o2, lfo, wind, wlfo]) {
              try {
                n.stop();
              } catch {
                // already stopped
              }
            }
            // disconnect the whole graph from master so silent nodes don't
            // accumulate across death/retry ambient cycles
            for (const n of [o1, o2, lfo, lfoG, wind, wlfo, wlfoG, g1, g2, wbp, wg, lp, bed]) {
              try {
                n.disconnect();
              } catch {
                // already disconnected
              }
            }
          };
          this.ambientTimer = setTimeout(stopAll, 600);
        },
      };
    } catch {
      // ignore
    }
  }

  stopAmbient(): void {
    try {
      this.ambient?.stop();
    } catch {
      // ignore
    }
    this.ambient = null;
  }

  destroy(): void {
    try {
      if (this.ambientTimer) clearTimeout(this.ambientTimer); // don't fire on a closed ctx
      this.ambientTimer = null;
      this.stopAmbient();
      if (this.ctx) void this.ctx.close();
    } catch {
      // ignore
    }
    this.ctx = null;
  }
}
