// Adaptive quality. Start optimistic, then a rolling FPS sampler steps the tier
// down (particle cap + bloom) if a phone can't hold frame time. Built day-one,
// not bolted on — fill-rate, not logic, is the 60fps wall.

export type QualityTier = 'high' | 'medium' | 'low';

export type Quality = {
  tier: QualityTier;
  particleCap: number;
  bloom: boolean;
  dpr: number;
};

export const baseQuality = (): Quality => ({
  tier: 'high',
  particleCap: 256,
  bloom: true,
  dpr: Math.min(window.devicePixelRatio || 1, 2),
});

// Resolution is the real fill-rate lever (rasterized pixel count), so each step
// also drops DPR — particles/bloom alone barely help a fill-bound mobile GPU.
const stepDown = (q: Quality): Quality => {
  if (q.tier === 'high')
    return { ...q, tier: 'medium', particleCap: 140, bloom: false, dpr: Math.min(q.dpr, 1.5) };
  if (q.tier === 'medium') return { ...q, tier: 'low', particleCap: 64, bloom: false, dpr: 1 };
  return q;
};

export type FpsGuard = {
  quality: () => Quality;
  sample: (deltaMS: number) => void;
};

// Watches a 1s window of frame times; if the average frame exceeds ~20ms (<50fps)
// it drops one tier and notifies, until it reaches 'low'.
export const createFpsGuard = (initial: Quality, onChange: (q: Quality) => void): FpsGuard => {
  let q = initial;
  let acc = 0;
  let frames = 0;
  return {
    quality: () => q,
    sample: (deltaMS: number) => {
      acc += deltaMS;
      frames++;
      if (acc >= 1000) {
        const avg = acc / frames;
        if (avg > 20 && q.tier !== 'low') {
          q = stepDown(q);
          onChange(q);
        }
        acc = 0;
        frames = 0;
      }
    },
  };
};
