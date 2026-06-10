// Offscreen-canvas texture bakers. Gradients, glows, the hero ember, coins and
// terrain are painted ONCE to a canvas and uploaded as GPU textures, so the hot
// loop only draws (and stretches/tints) sprites — no per-frame fills. This is the
// core "cheap beauty" lever for 60fps on mobile.

import { Texture } from 'pixi.js';

const makeCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  return c;
};

// Luminous dusk sky: a multi-stop vertical gradient (deep violet up top, magenta
// dusk through a warm ember band near the horizon) with a soft radial sun-glow
// sitting on the horizon line and a scatter of faint stars. This is the single
// biggest "brighten + show off" lever — mountains read as silhouettes against it.
export const duskSky = (w: number, h: number): Texture => {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  if (ctx) {
    const W = c.width;
    const H = c.height;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.0, '#2a1e54'); // deep upper violet — lifted off black
    g.addColorStop(0.32, '#43245f');
    g.addColorStop(0.52, '#742f63'); // magenta dusk
    g.addColorStop(0.68, '#b04c41'); // warm horizon approach
    g.addColorStop(0.8, '#e0843f'); // ember band
    g.addColorStop(0.92, '#c25a39');
    g.addColorStop(1.0, '#6f2b3a'); // settle warm-dark at the very base
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // faint stars, only in the upper (cool) third
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H * 0.42;
      const r = Math.random() * 1.1 + 0.2;
      ctx.globalAlpha = 0.25 + Math.random() * 0.55;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // horizon sun / fire glow, screened over the gradient
    const gx = W * 0.5;
    const gy = H * 0.74;
    const gr = Math.max(W, H) * 0.62;
    const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    rg.addColorStop(0.0, 'rgba(255,214,150,0.6)');
    rg.addColorStop(0.32, 'rgba(255,150,80,0.32)');
    rg.addColorStop(1.0, 'rgba(255,150,80,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  return Texture.from(c);
};

// Soft white radial glow, fading to transparent. Tint per-use with sprite.tint.
export const radialGlowTexture = (size = 256): Texture => {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  if (ctx) {
    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return Texture.from(c);
};

// The hero's molten heart: a crisp, near-solid hot disc with a defined edge (NOT
// a foggy blob) — white-hot core through amber to a tight ember rim. Drawn over
// the flame + outer glow so the ember reads as an object with form.
export const emberCoreTexture = (size = 96): Texture => {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  if (ctx) {
    const r = size / 2;
    const g = ctx.createRadialGradient(r, r * 0.86, 0, r, r, r);
    g.addColorStop(0.0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,247,214,1)');
    g.addColorStop(0.46, 'rgba(255,192,104,0.98)');
    g.addColorStop(0.72, 'rgba(255,120,46,0.6)');
    g.addColorStop(1.0, 'rgba(255,96,32,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return Texture.from(c);
};

// A teardrop flame silhouette (tip up), glowing from a hot base. Layered behind
// the core and gently flickered/swayed so the ember has a living, defined shape.
export const emberFlameTexture = (size = 128): Texture => {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const w = size * 0.34;
    ctx.beginPath();
    ctx.moveTo(cx, size * 0.05); // tip
    ctx.bezierCurveTo(cx + w * 0.5, size * 0.28, cx + w, size * 0.56, cx + w * 0.62, size * 0.82);
    ctx.bezierCurveTo(cx + w * 0.3, size * 0.99, cx - w * 0.3, size * 0.99, cx - w * 0.62, size * 0.82);
    ctx.bezierCurveTo(cx - w, size * 0.56, cx - w * 0.5, size * 0.28, cx, size * 0.05);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    const g = ctx.createRadialGradient(cx, size * 0.7, 0, cx, size * 0.7, size * 0.6);
    g.addColorStop(0.0, 'rgba(255,255,255,0.96)');
    g.addColorStop(0.28, 'rgba(255,214,128,0.9)');
    g.addColorStop(0.62, 'rgba(255,122,61,0.66)');
    g.addColorStop(1.0, 'rgba(255,90,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }
  return Texture.from(c);
};

// A detailed, readable ember-coin: outer warm glow, a shaded gold token with a
// top highlight and a dark inner rim, an inner face, and a 4-point sparkle so it
// reads instantly as a collectible (and a small specular dot for polish).
export const coinTexture = (size = 96): Texture => {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  if (ctx) {
    const r = size / 2;

    // outer glow halo
    const glow = ctx.createRadialGradient(r, r, r * 0.32, r, r, r);
    glow.addColorStop(0, 'rgba(255,205,110,0.5)');
    glow.addColorStop(0.6, 'rgba(255,170,70,0.18)');
    glow.addColorStop(1, 'rgba(255,170,70,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    // coin body — shaded gold disc with a light source up-and-left
    const disc = ctx.createRadialGradient(r * 0.82, r * 0.74, r * 0.05, r, r, r * 0.5);
    disc.addColorStop(0.0, '#fff4cc');
    disc.addColorStop(0.4, '#ffd062');
    disc.addColorStop(0.72, '#f5982c');
    disc.addColorStop(1.0, '#b5611a');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(r, r, r * 0.46, 0, Math.PI * 2);
    ctx.fill();

    // dark defining rim
    ctx.lineWidth = size * 0.035;
    ctx.strokeStyle = 'rgba(120,64,18,0.9)';
    ctx.beginPath();
    ctx.arc(r, r, r * 0.43, 0, Math.PI * 2);
    ctx.stroke();

    // inner face
    const face = ctx.createRadialGradient(r * 0.85, r * 0.78, 0, r, r, r * 0.38);
    face.addColorStop(0, '#ffe79a');
    face.addColorStop(1, '#f0a836');
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(r, r, r * 0.34, 0, Math.PI * 2);
    ctx.fill();

    // 4-point sparkle emblem
    ctx.fillStyle = 'rgba(255,250,224,0.95)';
    const spark = (cx: number, cy: number, len: number, wid: number): void => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - len);
      ctx.lineTo(cx + wid, cy);
      ctx.lineTo(cx, cy + len);
      ctx.lineTo(cx - wid, cy);
      ctx.closePath();
      ctx.fill();
    };
    spark(r, r, r * 0.3, r * 0.08); // vertical
    ctx.save();
    ctx.translate(r, r);
    ctx.rotate(Math.PI / 2);
    ctx.translate(-r, -r);
    spark(r, r, r * 0.22, r * 0.06); // horizontal
    ctx.restore();

    // specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(r * 0.78, r * 0.72, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  return Texture.from(c);
};

// A platform slab as a 1px-wide vertical strip (stretched horizontally per
// platform). A bright ember-lit run surface on top, a solid mid body, and a
// fade-to-transparent underside so each ledge reads as a lit, floating slab with
// mass (NOT a flat black bar) hanging into the dark.
export const slabTexture = (h = 96): Texture => {
  const c = makeCanvas(16, h);
  const ctx = c.getContext('2d');
  if (ctx) {
    const body = ctx.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0.0, 'rgba(124,108,164,1)'); // lit top face (bright)
    body.addColorStop(0.1, 'rgba(98,82,138,1)');
    body.addColorStop(0.3, 'rgba(76,60,112,1)');
    body.addColorStop(0.55, 'rgba(56,42,86,0.96)');
    body.addColorStop(0.78, 'rgba(42,30,66,0.72)');
    body.addColorStop(1.0, 'rgba(30,20,48,0)'); // hang + fade into the dark
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, 16, h);

    // warm top bloom (ember light catching the ledge)
    const bloom = ctx.createLinearGradient(0, 0, 0, h * 0.34);
    bloom.addColorStop(0, 'rgba(255,202,132,0.62)');
    bloom.addColorStop(1, 'rgba(255,202,132,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, 16, h * 0.34);
    ctx.globalCompositeOperation = 'source-over';

    // crisp lit rim at the run surface
    ctx.fillStyle = 'rgba(255,233,184,0.98)';
    ctx.fillRect(0, 0, 16, Math.max(2, h * 0.035));
  }
  return Texture.from(c);
};

// Horizontal dark-edge gradient (opaque dark on the left → transparent right),
// stretched vertically full-screen to soften the leading edge of the Dark.
export const darkEdgeTexture = (w = 256): Texture => {
  const c = makeCanvas(w, 8);
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0.0, 'rgba(6,3,14,0.98)');
    g.addColorStop(0.55, 'rgba(8,4,18,0.82)');
    g.addColorStop(0.85, 'rgba(12,6,24,0.4)');
    g.addColorStop(1.0, 'rgba(12,6,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, 8);
  }
  return Texture.from(c);
};

// Radial vignette (transparent center -> dark edges) laid over the scene. Kept
// light + a touch warm so it frames without crushing the brightened world.
export const vignetteTexture = (size = 512): Texture => {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  if (ctx) {
    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, r * 0.68, r, r, r);
    g.addColorStop(0, 'rgba(12,6,22,0)');
    g.addColorStop(1, 'rgba(12,6,22,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return Texture.from(c);
};
