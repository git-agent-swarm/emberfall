// Camera: the hero is locked near the left third (so you read the course ahead),
// while vertical follow is eased with look-ahead so jumps and falls feel smooth.

import { damp } from './math';

export type Camera = { x: number; y: number };

export const makeCamera = (): Camera => ({ x: 0, y: 0 });

export const updateCamera = (
  cam: Camera,
  targetX: number,
  targetY: number,
  vy: number,
  screenW: number,
  screenH: number,
  dt: number
): void => {
  // Horizontal: locked so the hero sits ~32% from the left edge.
  cam.x = targetX - screenW * 0.32;
  // Vertical: ease toward the hero, biased upward, with a touch of fall look-ahead.
  const lookAhead = Math.max(0, Math.min(140, vy * 0.12));
  const desiredY = targetY - screenH * 0.46 + lookAhead;
  cam.y = damp(cam.y, desiredY, 7, dt);
};
