/* Procedural artwork. No image assets - everything is drawn.
   Every generator is deterministic for a given seed. */

/* ---- deterministic noise ------------------------------------------------ */

/* Math.imul keeps every step exactly in int32 - plain `*` overflows past 2^53
   for large seeds and quietly loses low bits. The shifts must be unsigned:
   with a signed `>>` the sign bit cancels itself in the xor and the hash can
   never return more than 0.5. */
function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
}

function fbm(x, y, seed, octaves = 5) {
  let sum = 0, amp = 0.5, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(fx, fy, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.03;
    fy *= 2.01;
  }
  return sum / norm;
}

/* seeded PRNG (mulberry32) */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

/* ---- 01 - DITHER - ordered-dither cloud field --------------------------- */

export function dither(ctx, w, h, opts = {}) {
  const seed = opts.seed || 1;
  const t = opts.t || 0;
  // Cell size is in CSS px, scaled to device px, then floored so the grid
  // never exceeds maxCols - otherwise a 4K canvas costs ~500k fillRects/frame.
  const px = Math.max(
    Math.round((opts.px || 3) * (opts.dpr || 1)),
    Math.ceil(w / (opts.maxCols || 320))
  );
  const cols = Math.max(1, Math.ceil(w / px));
  const rows = Math.max(1, Math.ceil(h / px));
  const scale = opts.scale || 4.2;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#EDEBE6';

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const nx = (x / cols) * scale;
      const ny = (y / rows) * scale * (rows / cols) * 1.4;
      let v = fbm(nx + t * 0.06, ny - t * 0.02, seed);
      // push contrast so the field reads as billowing cloud, not grey mush
      v = Math.min(1, Math.max(0, (v - 0.34) * 2.35));
      const threshold = (BAYER[(y & 7) * 8 + (x & 7)] + 0.5) / 64;
      if (v > threshold) ctx.fillRect(x * px, y * px, px, px);
    }
  }
}

/* ---- 02 - LATTICE - projected wireframe box + lit panels ---------------- */

export function makeLattice(seed, count = 190, panels = 6) {
  const r = rng(seed);
  const segs = [];
  for (let i = 0; i < count; i++) {
    // seed a point, then extend along one axis - gives the architectural,
    // axis-aligned look rather than a cloud of random spaghetti
    const p = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1];
    const axis = Math.floor(r() * 3);
    const len = 0.4 + r() * 1.5;
    const q = p.slice();
    q[axis] += r() < 0.5 ? -len : len;
    segs.push([p, q]);
  }
  const quads = [];
  for (let i = 0; i < panels; i++) {
    const cx = r() * 1.7 - 0.85, cy = r() * 1.7 - 0.85, cz = r() * 1.7 - 0.85;
    const wq = 0.16 + r() * 0.34, hq = 0.04 + r() * 0.1;
    quads.push({
      pts: [
        [cx - wq, cy - hq, cz], [cx + wq, cy - hq, cz],
        [cx + wq, cy + hq, cz], [cx - wq, cy + hq, cz],
      ],
      glow: 0.5 + r() * 0.5,
    });
  }
  return { segs, quads };
}

function project(p, w, h, t, tilt) {
  const ca = Math.cos(t), sa = Math.sin(t);
  const x = p[0] * ca - p[2] * sa;
  let z = p[0] * sa + p[2] * ca;
  const cb = Math.cos(tilt), sb = Math.sin(tilt);
  const y = p[1] * cb - z * sb;
  z = p[1] * sb + z * cb;
  const d = 2.6;
  const k = d / (d + z);
  const s = Math.min(w, h) * 0.62;
  return [w / 2 + x * s * k, h / 2 + y * s * k, k];
}

export function lattice(ctx, w, h, opts = {}) {
  const geo = opts.geo || makeLattice(opts.seed || 1);
  const t = (opts.t || 0) * 0.055;
  const tilt = -0.32 + Math.sin((opts.t || 0) * 0.023) * 0.1;
  const px = opts.parallax || [0, 0];

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(px[0], px[1]);

  ctx.lineWidth = Math.max(1, w / 1400);
  for (const seg of geo.segs) {
    const pa = project(seg[0], w, h, t, tilt);
    const pb = project(seg[1], w, h, t, tilt);
    const depth = (pa[2] + pb[2]) / 2;
    const a = Math.min(1, Math.max(0, (depth - 0.55) * 1.5)) * 0.3;
    ctx.strokeStyle = 'rgba(237,235,230,' + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.stroke();
  }

  // lit panels - the bright slabs floating inside the structure
  for (const q of geo.quads) {
    const pts = q.pts.map((p) => project(p, w, h, t, tilt));
    const depth = pts.reduce((s, p) => s + p[2], 0) / 4;
    const a = Math.min(1, Math.max(0, (depth - 0.5) * 1.8)) * q.glow;
    ctx.save();
    ctx.shadowColor = 'rgba(237,235,230,' + (a * 0.85).toFixed(3) + ')';
    ctx.shadowBlur = Math.min(w, h) * 0.07;
    ctx.fillStyle = 'rgba(240,238,233,' + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/* ---- 03 - HALFTONE - stipple field, dot radius carries the value -------- */

export function halftone(ctx, w, h, opts = {}) {
  const seed = opts.seed || 1;
  const t = opts.t || 0;
  // same guard as dither: keep the dot count bounded on large canvases
  const step = Math.max((opts.step || 9) * (opts.dpr || 1), w / (opts.maxCols || 210));
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#EDEBE6';

  const cx = w * 0.5, cy = h * 0.5;
  const maxD = Math.hypot(cx, cy);
  const rMax = step * 0.62;

  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      const d = Math.hypot(x - cx, y - cy) / maxD;
      const n = fbm((x / w) * 3.4 + t * 0.05, (y / h) * 3.4, seed);
      let v = (1 - d) * 0.85 + n * 0.5 - 0.42;
      v = Math.min(1, Math.max(0, v));
      if (v <= 0.02) continue;
      ctx.beginPath();
      ctx.arc(x, y, v * rMax, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* ---- 04 - GLYPHS - falling monospace columns ---------------------------- */

const CHARSET = '01{}()[]<>/|=+-*#$%&@ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function glyphs(ctx, w, h, opts = {}) {
  const seed = opts.seed || 1;
  const t = opts.t || 0;
  const r = rng(seed);
  const size = Math.max((opts.size || 11) * (opts.dpr || 1), w / (opts.maxCols || 150));
  const cols = Math.floor(w / (size * 0.72));

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.font = size + 'px ui-monospace, Menlo, Consolas, monospace';
  ctx.textBaseline = 'top';

  for (let c = 0; c < cols; c++) {
    const speed = 0.25 + r() * 1.1;
    const off = r() * h;
    const len = 6 + Math.floor(r() * 20);
    const head = ((off + t * speed * 22) % (h + len * size)) - len * size;
    for (let i = 0; i < len; i++) {
      const y = head - i * size;
      if (y < -size || y > h) continue;
      const a = (1 - i / len) * 0.75;
      ctx.fillStyle = 'rgba(237,235,230,' + a.toFixed(3) + ')';
      const idx = Math.floor(hash2(c, Math.floor(y / size) + Math.floor(t * 4), seed) * CHARSET.length);
      ctx.fillText(CHARSET[idx], c * size * 0.72, y);
    }
  }
}

export const GENERATORS = { dither, lattice, halftone, glyphs };

/* ---- canvas plumbing ---------------------------------------------------- */

/* Sizes a canvas to its CSS box at device resolution, then draws.
   Animation only runs while the canvas is on screen. */
export function mountCanvas(canvas, kind, opts = {}) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animate = opts.animate !== false && !reduced;
  const ctx = canvas.getContext('2d');
  const geo = kind === 'lattice' ? makeLattice(opts.seed || 1, opts.count, opts.panels) : null;
  const draw = GENERATORS[kind] || dither;

  let w = 0, h = 0, raf = 0, visible = false, dpr = 1, last = -1e9;
  const t0 = performance.now();
  const state = { parallax: [0, 0] };
  // ambient canvases do not need 60fps; capping cuts their cost outright
  const minDt = opts.fps ? 1000 / opts.fps : 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2);
    const rect = canvas.getBoundingClientRect();
    const nw = Math.max(1, Math.round(rect.width * dpr));
    const nh = Math.max(1, Math.round(rect.height * dpr));
    if (nw === w && nh === h) return false;
    w = canvas.width = nw;
    h = canvas.height = nh;
    return true;
  }

  function frame(now) {
    raf = 0;
    // queue the next frame first, so a skipped frame still keeps the loop alive
    if (animate && visible) raf = requestAnimationFrame(frame);
    if (minDt && now - last < minDt) return;
    last = now;
    const t = animate ? (now - t0) / 1000 : (opts.t || 0);
    draw(ctx, w, h, Object.assign({}, opts, {
      t: t, geo: geo, dpr: dpr, parallax: state.parallax,
    }));
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  const io = new IntersectionObserver(
    function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) { resize(); kick(); }
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    },
    { rootMargin: '120px' }
  );
  io.observe(canvas);

  const ro = new ResizeObserver(function () { if (resize()) kick(); });
  ro.observe(canvas);

  resize();
  kick();

  return {
    setParallax: function (x, y) { state.parallax = [x, y]; if (!animate) kick(); },
    stop: function () { io.disconnect(); ro.disconnect(); if (raf) cancelAnimationFrame(raf); },
  };
}
