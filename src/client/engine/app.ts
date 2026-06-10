// Pixi Application bootstrap. WebGL-pinned (NEVER WebGPU — unavailable in Android
// System WebView + iOS WKWebView), DPR clamped to <=2 (a 3x phone rasterizing 9x
// fullscreen pixels is the #1 fill-rate killer), antialias off (we lean on glow,
// not MSAA). React owns the DOM overlay; Pixi owns the canvas only.

import { Application } from 'pixi.js';

export const createPixi = async (parent: HTMLElement): Promise<Application> => {
  const app = new Application();
  await app.init({
    preference: 'webgl',
    antialias: false,
    background: 0x0d0a1a,
    backgroundAlpha: 1,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    resizeTo: parent,
    powerPreference: 'high-performance',
    hello: false,
  });
  parent.appendChild(app.canvas);
  return app;
};
