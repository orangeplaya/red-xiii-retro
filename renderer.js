(function (root) {
'use strict';

const W = 128, H = 96, GY = 70, TAU = Math.PI * 2, EMPTY = 255;

const PAL_HEX = [
  '#0a0612', '#3a0e10', '#7a1c1a', '#b8321f', '#e0603a', '#d9a066', '#f4c542', '#e8b83a', '#9a6a1a',
  '#fff4b0', '#ffc830', '#ff7a1a', '#c4281a',
  '#f6d98a', '#f0a860', '#d98a8a',
  '#c0603a', '#9c4428', '#6a2e22', '#3e1a18', '#d8a870', '#b08050', '#6a7a3a',
  '#e07040', '#7a4a8a', '#3a2a6a', '#5a3a50', '#3ac0b0',
  '#0c1430', '#142850', '#1e4a6a', '#3a8a9a', '#6ac0c0', '#d8f4ee', '#a8d4cc', '#ffffff', '#9ad0e8',
  '#3a5670', '#6a8aa0', '#3a4452', '#6a7482', '#9aa4b0', '#7a4a2a', '#4a2a1a', '#1a0c14', '#4a2426', '#2a1418',
  '#551414',
];
const [BLACK, OUT, FUR_S, FUR_B, FUR_H, TAN, EYE, GOLD, GOLD_D,
  FL_CORE, FL_GOLD, FL_OR, FL_RED,
  SKY_GOLD, SKY_OR, SKY_PINK,
  TERRA, BURNT, ROCK_D, ROCK_DD, SAND, SAND_D, SCRUB,
  DUSK_OR, VIOLET, INDIGO, DUSK_MESA, TEAL_GLOW,
  NAVY, DEEP_BLUE, TEAL_BLUE, TEAL, HALO, MOON, CRATER, STAR, STAR_P,
  CLOUD, CLOUD_L, STONE_D, STONE_M, STONE_L, WOOD, WOOD_D, SIL, NROCK, NROCK_D, FUR_D2] = PAL_HEX.map((_, i) => i);

const PAL = new Uint8Array(PAL_HEX.length * 3);
PAL_HEX.forEach((h, i) => {
  PAL[i * 3] = parseInt(h.slice(1, 3), 16);
  PAL[i * 3 + 1] = parseInt(h.slice(3, 5), 16);
  PAL[i * 3 + 2] = parseInt(h.slice(5, 7), 16);
});

// Timeline, locked to the 1.5s crossfades in combined-sequences-1.mp3
const X1S = 27.53, X1E = 29.03, X2S = 49.02, X2E = 50.52, END = 98.97;
const SPEED = 12, DECEL_START = 75, DECEL_END = 88;
const FINAL_DIST = SPEED * DECEL_START + SPEED * (DECEL_END - DECEL_START) / 2;
const STRIDE = FINAL_DIST / Math.round(FINAL_DIST / 8);
const HERO_X = 34;
const STATUE_WX = FINAL_DIST + 94;

const FB = new Uint8Array(W * H), BA = new Uint8Array(W * H), BB = new Uint8Array(W * H);
const SP = new Uint8Array(W * H);
// statue sprite: pivot is (STAT_PX, STAT_FEET) = centre of body, paw row
const SW = 64, SH = 48, STAT_PX = 28, STAT_FEET = 46, STAT = new Uint8Array(SW * SH);
const TOPS = new Int16Array(W + 2);
const TX = new Int16Array(11), TY = new Int16Array(11);

let T = FB, TWID = W, THEI = H, SCENE = FB;
function setTarget(buf, w, h) { T = buf; TWID = w; THEI = h; }

// ---------- math / hashing ----------
function hash(n) {
  n |= 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
function hash2(a, b) { return hash((Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0); }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smoothstep(a, b, v) { const x = clamp01((v - a) / (b - a)); return x * x * (3 - 2 * x); }
const BAYER = new Uint8Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
function bay(x, y) { return (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16; }

function dist(t) {
  if (t < DECEL_START) return SPEED * t;
  const D = DECEL_END - DECEL_START;
  if (t < DECEL_END) { const u = t - DECEL_START; return SPEED * DECEL_START + SPEED * (u - u * u / (2 * D)); }
  return FINAL_DIST;
}
function tiltAt(t) { return smoothstep(88.5, 96.5, t); }

// ---------- primitives ----------
function px(x, y, c) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= TWID || y >= THEI) return;
  T[y * TWID + x] = c;
}
function rect(x, y, w, h, c) {
  x = Math.floor(x); y = Math.floor(y);
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(TWID, x + w), y1 = Math.min(THEI, y + h);
  for (let j = y0; j < y1; j++) { const r = j * TWID; for (let i = x0; i < x1; i++) T[r + i] = c; }
}
function line(x0, y0, x1, y1, c, thick) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    px(x0, y0, c); if (thick) px(x0 + 1, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function sky(c0, c1, c2, y0, y1, shift) {
  for (let y = 0; y < H; y++) {
    let f = clamp01((y - shift - y0) / (y1 - y0)) * 2;
    let i = Math.floor(f); if (i > 1) i = 1;
    const d = clamp01((f - i - 0.35) / 0.3);
    const a = i === 0 ? c0 : c1, b = i === 0 ? c1 : c2;
    const r = y * W;
    for (let x = 0; x < W; x++) T[r + x] = bay(x, y) < d ? b : a;
  }
}

// ---------- color maps ----------
function identityMap() { const m = new Uint8Array(256); for (let i = 0; i < 256; i++) m[i] = i; return m; }
const SILMAP = identityMap(), WARM = identityMap();
SILMAP[FUR_S] = SIL; SILMAP[FUR_B] = NROCK_D; SILMAP[FUR_H] = NROCK_D; SILMAP[TAN] = NROCK_D;
SILMAP[OUT] = BLACK; SILMAP[GOLD] = GOLD_D;
WARM[FUR_S] = FUR_B; WARM[FUR_B] = FUR_H; WARM[OUT] = FUR_S; WARM[SIL] = NROCK_D; WARM[NROCK_D] = ROCK_D;
WARM[NROCK] = ROCK_D; WARM[BLACK] = NROCK_D; WARM[SAND_D] = SAND; WARM[SAND] = SKY_GOLD; WARM[ROCK_DD] = ROCK_D;
WARM[ROCK_D] = BURNT; WARM[BURNT] = TERRA; WARM[TERRA] = SKY_OR; WARM[TEAL_BLUE] = NROCK;
SILMAP[FUR_D2] = SIL; WARM[FUR_D2] = FUR_S;

// ---------- creature (original lion-wolf design) ----------
const BODY_SPEC = [
  [[22, 'S']],
  [[22, 'SB']],
  [[21, 'BBHHHBB']],
  [[21, 'BBBHBBEB']],
  [[21, 'BBBBBBBTTT']],
  [[8, 'HHHHHHHHHHHH'], [20, 'BBBBBBTTTTTN']],
  [[6, 'BBHHHHHHHHHHBB'], [20, 'BBBBBTTKKKT']],
  [[5, 'BBBBBBBBBBBBBBBB'], [21, 'SSSTTTTTT']],
  [[5, 'BBBBBBBBBBBBBBBBB']],
  [[5, 'SBBBBBBBBBBBBBBBB']],
  [[5, 'SSBBBBBBBBBBBTTTT']],
  [[6, 'SSSTTTTTTTTTTTT']],
  [[8, 'SSSS'], [17, 'SSSS']],
];
const BODY_W = 32, BODY_H = BODY_SPEC.length;
const BODYG = new Uint8Array(BODY_W * BODY_H).fill(EMPTY);
const CH = { H: FUR_H, B: FUR_B, S: FUR_S, T: TAN, E: EYE, N: OUT, K: OUT };
BODY_SPEC.forEach((segs, r) => segs.forEach(([c0, s]) => {
  for (let i = 0; i < s.length; i++) BODYG[r * BODY_W + c0 + i] = CH[s[i]];
}));

// [x, y, length, direction(-1 up / +1 down)] in body-grid coords
const CREST = [[26, 2, 3, -1], [24, 2, 5, -1], [22, 2, 6, -1], [21, 3, 6, -1], [20, 5, 5, -1], [18, 5, 4, -1],
  [16, 5, 4, -1], [14, 5, 3, -1], [12, 5, 3, -1], [10, 5, 3, -1], [8, 5, 2, -1]];

function footX(p) { p -= Math.floor(p); if (p < 0.75) return 3 - 6 * p / 0.75; return -3 + 6 * (p - 0.75) / 0.25; }
function footLift(p) { p -= Math.floor(p); if (p < 0.75) return 0; return Math.round(2 * Math.sin(Math.PI * (p - 0.75) / 0.25)); }

// Thick thigh down to the knee/hock, 1px lower leg, 2px paw pointing forward.
function leg(hx, hy, off, lift, gy, col, hind, cuffCol) {
  const fx = hx + off, fy = gy - 1 - lift;
  const kx = Math.round((hx + fx) / 2 + (hind ? -2 : 0.5)), ky = Math.round(hy + (fy - hy) * (hind ? 0.55 : 0.45));
  line(hx, hy, kx, ky, col, true);
  line(kx, ky, fx, fy, col, false);
  px(fx + 1, fy, col);
  if (cuffCol >= 0) {
    const cy = Math.round(ky + (fy - ky) * 0.6), cx = Math.round(kx + (fx - kx) * 0.6);
    px(cx, cy, cuffCol);
  }
}

function computeTail(ox, oy, phase, t) {
  const bx = ox + 5, by = oy + 7;
  for (let i = 0; i <= 10; i++) {
    const dx = -i * 0.95;
    const dy = (i <= 5 ? i * 0.7 : 3.5 - (i - 5) * 1.5)
      + Math.sin(phase * TAU - i * 0.35) * i * 0.12
      + Math.sin(t * 1.3 - i * 0.3) * i * 0.06;
    TX[i] = Math.round(bx + dx); TY[i] = Math.round(by + dy);
  }
}

function spike(x0, y0, len, dir, lean, cBody, cTip) {
  for (let k = 1; k <= len; k++) {
    const x = x0 - Math.round(k * lean), y = y0 + dir * k;
    px(x, y, k === len ? cTip : cBody);
    if (k === 1) px(x + 1, y, cBody);
  }
}

function drawCreature(ox, oy, gy, phase, t, headUp, stopK) {
  const sw = phase * TAU * 2 - 0.6;
  const hipY = oy + 12, k = 1 - stopK;

  // far-side legs: set back 3px and one shade darker so the pairs read separately
  leg(ox + 11, hipY - 1, Math.round(footX(phase + 0.5) * k), Math.round(footLift(phase + 0.5) * k), gy, FUR_D2, true, -1);
  leg(ox + 20, hipY - 1, Math.round(footX(phase + 0.75) * k), Math.round(footLift(phase + 0.75) * k), gy, FUR_D2, false, GOLD_D);

  computeTail(ox, oy, phase, t);
  for (let i = 0; i < 10; i++) line(TX[i], TY[i], TX[i + 1], TY[i + 1], i >= 8 ? FUR_S : FUR_B, i < 3);

  for (let r = 0; r < BODY_H; r++) {
    for (let c = 0; c < BODY_W; c++) {
      const v = BODYG[r * BODY_W + c];
      if (v === EMPTY) continue;
      let y = oy + r;
      if (headUp && r <= 7 && c >= 21) y -= c >= 28 ? 2 : 1;
      px(ox + c, y, v);
    }
  }

  for (let i = 0; i < CREST.length; i++) {
    const s = CREST[i];
    const lean = 0.7 + 0.25 * Math.sin(sw - i * 0.5) + 0.1 * Math.sin(t * 1.1 + i);
    spike(ox + s[0], oy + s[1] - (headUp && s[0] >= 21 ? 1 : 0), s[2], s[3], lean, FUR_S, FUR_B);
  }

  leg(ox + 7, hipY, Math.round(footX(phase) * k), Math.round(footLift(phase) * k), gy, FUR_B, true, -1);
  leg(ox + 16, hipY, Math.round(footX(phase + 0.25) * k), Math.round(footLift(phase + 0.25) * k), gy, FUR_B, false, GOLD);
  const bx = ox + 21 + Math.round(Math.sin(sw - 1.2 + t * 0.9 * stopK) * 0.8);
  px(ox + 21, oy + 8, OUT); px(bx, oy + 9, OUT);
  px(bx, oy + 10, GOLD); px(bx, oy + 11, OUT); px(bx, oy + 12, GOLD);
}

// ---------- hero ----------
let HS_phase = 0, HS_bob = 0, HS_gy = GY, HS_oy = 0, HS_stopK = 0, HS_headUp = 0;
function heroState(t) {
  const tq = Math.floor(t * 10) / 10;
  HS_phase = dist(tq) / STRIDE;
  HS_stopK = clamp01((t - DECEL_END) / 0.6);
  HS_bob = HS_stopK > 0 ? 0 : -Math.round(0.5 - 0.5 * Math.cos(HS_phase * TAU * 2));
  HS_gy = GY + Math.round(tiltAt(t) * 10);
  HS_oy = HS_gy - 21 + HS_bob;
  HS_headUp = t > 90.2 ? 1 : 0;
}

const MODE_NORMAL = 0, MODE_SUN = 1, MODE_MOON = 2;
function composite(mode, sil, outlineCol) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, c = SP[i];
      const s = sil > 0 && bay(x, y) < sil;
      if (c !== EMPTY) { T[i] = s ? SILMAP[c] : c; continue; }
      const up = y > 0 && SP[i - W] !== EMPTY, dn = y < H - 1 && SP[i + W] !== EMPTY;
      const lf = x > 0 && SP[i - 1] !== EMPTY, rt = x < W - 1 && SP[i + 1] !== EMPTY;
      if (!(up || dn || lf || rt)) continue;
      let o = outlineCol;
      if (mode === MODE_SUN && rt && !lf) o = DUSK_OR;
      if (mode === MODE_MOON && dn && !up) o = TEAL;
      if (s) o = dn && !up ? TEAL : BLACK;
      T[i] = o;
    }
  }
}

const FP = [3, 5, 5, 4, 4, 3, 2, 1];
function drawFlame(ax, ay, t, fps, hgt, wScale, lean, seed, calm) {
  const ft = Math.floor(t * fps) / fps + seed * 13.7;
  const hf = hgt + (!calm && Math.sin(ft * 7.3) > 0.4 ? 1 : 0);
  for (let r = 0; r < hf; r++) {
    const pi = Math.min(7, Math.floor(r * 8 / hf));
    let w = Math.round(FP[pi] * wScale + Math.sin(ft * 9.1 + r * 1.3) * 0.6 + Math.sin(ft * 15.7 + r * 0.7) * 0.5);
    if (w < 1) w = 1;
    const cx = ax - r * lean + Math.sin(ft * 11.3 + r * 0.9) * 0.7 * (r / hf);
    const x0 = Math.round(cx - (w - 1) / 2);
    for (let k = 0; k < w; k++) {
      const d = w === 1 ? 0.8 : Math.abs(k - (w - 1) / 2) / (w / 2);
      const heat = 1 - Math.max(d, r / hf);
      px(x0 + k, ay - r, heat > 0.62 ? FL_CORE : heat > 0.4 ? FL_GOLD : heat > 0.18 ? FL_OR : FL_RED);
    }
  }
}

function flameGlow(tx, ty, s, gy) {
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 5) continue;
      const x = tx + dx, y = ty + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (SP[i] !== EMPTY && bay(x, y) < (1 - d / 5.5) * s) T[i] = WARM[T[i]];
    }
  }
  for (let y = gy - 3; y <= gy - 2; y++) {
    for (let dx = -6; dx <= 6; dx++) {
      const x = tx + dx;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const i = y * W + x;
      if (SP[i] === EMPTY && bay(x, y) < (1 - Math.abs(dx) / 7) * 0.45 * s) T[i] = WARM[T[i]];
    }
  }
}

const EMB_N = 12, EMB_PERIOD = 1.8;
function tailEmbers(t, calm) {
  const dNow = dist(t);
  for (let j = 0; j < EMB_N; j++) {
    if (calm && (j & 1)) continue;
    const off = j * EMB_PERIOD / EMB_N;
    const slot = Math.floor((t - off) / EMB_PERIOD);
    const ts = slot * EMB_PERIOD + off, age = t - ts;
    const h = hash2(j + 40, slot);
    const life = 0.5 + 0.5 * h;
    if (age > life) continue;
    heroState(ts);
    computeTail(HERO_X, HS_oy, HS_phase, ts);
    const x = TX[10] - (dNow - dist(ts)) - age * (3 + h * 5) + Math.sin(age * 9 + j) * 0.8;
    const y = TY[10] - 4 - age * (10 + h * 8);
    const a = age / life;
    px(Math.round(x), Math.round(y), a < 0.35 ? FL_OR : a < 0.7 ? FL_RED : OUT);
  }
}

function drawHero(t, seq) {
  const scene = SCENE;
  heroState(t - 0.15);
  computeTail(HERO_X, HS_oy, HS_phase, t - 0.15);
  const prevX = TX[10];

  heroState(t);
  setTarget(SP, W, H); SP.fill(EMPTY);
  drawCreature(HERO_X, HS_oy, HS_gy, HS_phase, t, HS_headUp, HS_stopK);
  const tipX = TX[10], tipY = TY[10], gy = HS_gy;

  setTarget(scene, W, H);
  composite(seq === 2 ? MODE_SUN : MODE_NORMAL, seq === 3 ? smoothstep(X2E, 53.5, t) : 0, OUT);
  flameGlow(tipX, tipY, seq === 1 ? 0.35 : seq === 2 ? 0.7 : 1.0, gy);

  const calm = t > DECEL_END + 0.6;
  let lean = (calm ? 0.1 : 0.45) + (tipX - prevX) * 0.25;
  lean = lean < -0.3 ? -0.3 : lean > 1.1 ? 1.1 : lean;
  drawFlame(tipX, tipY + 1, t, calm ? 6 : 12, calm ? 8 : 6, 1, lean, 0, calm);
  tailEmbers(t, calm);
}

// ---------- statue ----------
function ellipse(cx, cy, rx, ry, c) {
  for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++)
    for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++)
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) px(cx + dx, cy + dy, c);
}
function stroke(x0, y0, x1, y1, r, c) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let s = 0; s <= n; s++) ellipse(Math.round(x0 + (x1 - x0) * s / n), Math.round(y0 + (y1 - y0) * s / n), r, r, c);
}
function tuft(x0, y0, dx, dy, len, c) {
  const x1 = x0 + dx * len, y1 = y0 + dy * len, xm = x0 + dx * len * 0.5, ym = y0 + dy * len * 0.5;
  line(x0, y0, xm, ym, c, true);
  line(xm, ym, x1, y1, c, false);
}

// Hand-built at native resolution, facing right: braced stance, head and muzzle raised to the moon, heavy mane.
const STATUE_CRACKS = [[24, 25, 26, 28], [26, 28, 25, 31], [25, 31, 28, 33], [38, 20, 40, 24], [40, 24, 39, 27],
  [14, 33, 16, 36], [44, 9, 46, 12]];
function buildStatue() {
  STAT.fill(EMPTY);
  setTarget(STAT, SW, SH);

  stroke(35, 30, 36, 45, 1, SIL);
  stroke(20, 30, 15, 39, 1.5, SIL); stroke(15, 39, 18, 45, 1, SIL);
  rect(35, 45, 4, 2, SIL); rect(17, 45, 4, 2, SIL);

  stroke(10, 25, 6, 33, 1, STONE_D); stroke(6, 33, 4, 40, 1, STONE_D); stroke(4, 40, 7, 45, 1, STONE_D);

  ellipse(27, 28, 13, 6, STONE_D);
  ellipse(16, 29, 6, 6, STONE_D);
  ellipse(38, 27, 6, 7, STONE_D);
  stroke(37, 24, 42, 14, 4, STONE_D);
  ellipse(45, 11, 5, 4, STONE_D);
  stroke(47, 10, 52, 5, 2, STONE_D);
  line(46, 14, 51, 9, SIL, false);
  line(42, 7, 40, 3, STONE_D, true);

  for (let i = 0; i < 11; i++) {
    const f = i / 10;
    const bx = 44 - 12 * f, by = 6 + 16 * f;
    const ang = Math.PI * (1.28 - 0.3 * f);
    tuft(bx, by, Math.cos(ang), Math.sin(ang), 5 + Math.floor(hash2(910, i) * 4), STONE_D);
  }
  for (let i = 0; i < 5; i++) {
    const f = i / 4;
    tuft(44 - 5 * f, 15 + 7 * f, -0.6, 0.8, 3 + Math.floor(hash2(911, i) * 3), STONE_D);
  }
  for (let x = 30; x >= 16; x -= 3) tuft(x, 22, -0.6, -0.8, 2 + (x & 1), STONE_D);

  stroke(40, 31, 41, 44, 1.5, STONE_D); rect(40, 45, 4, 2, STONE_D);
  stroke(16, 31, 11, 40, 2, STONE_D); stroke(11, 40, 14, 45, 1, STONE_D); rect(13, 45, 4, 2, STONE_D);

  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const i = y * SW + x, c = STAT[i];
    if (c !== STONE_D) continue;
    const h = hash2(900, i);
    if (y === 0 || STAT[i - SW] === EMPTY) STAT[i] = y > 1 && STAT[i - 2 * SW] === EMPTY && h > 0.6 ? STONE_L : STONE_M;
    else if (h > 0.9) STAT[i] = STONE_M;
    else if (h < 0.05) STAT[i] = SIL;
  }
  px(46, 10, SIL); px(53, 4, BLACK);
  for (const [x0, y0, x1, y1] of STATUE_CRACKS) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s <= n; s++) {
      const x = Math.round(x0 + (x1 - x0) * s / n), y = Math.round(y0 + (y1 - y0) * s / n);
      if (STAT[y * SW + x] !== EMPTY) STAT[y * SW + x] = BLACK;
    }
  }
}

// [x0, y0, x1, y1, hasTip] relative to (statue pivot x, spur top)
const SPEARS = [[-24, 0, -31, -20, 1], [-14, 0, -8, -24, 1], [18, 0, 25, -22, 1], [30, 0, 33, -14, 0],
  [-6, -17, -14, -30, 1], [6, -15, 13, -29, 0], [36, 0, 42, -12, 1]];
function drawStatue(cx, spurTop) {
  SP.fill(EMPTY);
  const ox = cx - STAT_PX, oy = spurTop - 1 - STAT_FEET;
  for (let dy = 0; dy < SH; dy++) {
    const y = oy + dy;
    if (y < 0 || y >= H) continue;
    for (let dx = 0; dx < SW; dx++) {
      const x = ox + dx, c = STAT[dy * SW + dx];
      if (c === EMPTY || x < 0 || x >= W) continue;
      SP[y * W + x] = c;
    }
  }
  composite(MODE_MOON, 0, BLACK);
  for (let i = 0; i < SPEARS.length; i++) {
    const s = SPEARS[i];
    line(cx + s[0], spurTop + s[1], cx + s[2], spurTop + s[3], SIL, false);
    if (s[4]) px(cx + s[2], spurTop + s[3], STONE_L);
  }
}

// ---------- environment layers ----------
function colTop(k, seed, yMin, yMax) { return yMin + Math.floor(hash2(seed, k) * (yMax - yMin + 1)); }
function ridgeTop(wx, segW, seed, yMin, yMax, slope) {
  const k = Math.floor(wx / segW), local = wx - k * segW;
  const h0 = colTop(k, seed, yMin, yMax), sl = segW * slope;
  if (local < segW - sl) return h0;
  const h1 = colTop(k + 1, seed, yMin, yMax);
  return Math.round(h0 + (h1 - h0) * (local - (segW - sl)) / sl);
}
function rockLayer(off, shift, segW, seed, yMin, yMax, slope, cMain, cStrata, cTop, cRim) {
  for (let x = -1; x <= W; x++) TOPS[x + 1] = ridgeTop(x + off, segW, seed, yMin, yMax, slope) + shift;
  for (let x = 0; x < W; x++) {
    const top = TOPS[x + 1], lt = TOPS[x], rt = TOPS[x + 2], wx = x + off;
    for (let y = Math.max(0, top); y < H; y++) {
      let c = cMain;
      const ly = y - shift;
      if (ly % 5 === 0 && hash2(seed + 3, Math.floor(wx / 6) * 131 + ly) > 0.3) c = cStrata;
      if (rt > top && y < rt) c = cStrata;
      if (cRim >= 0 && lt > top && y < lt) c = cRim;
      if (y === top && cTop >= 0) c = cTop;
      T[y * W + x] = c;
    }
  }
}

function fgLayer(off, shift, cMain, cRim, exLo, exHi) {
  const segW = 110;
  const k0 = Math.floor((off - 20) / segW) - 1, k1 = Math.floor((off + W + 20) / segW) + 1;
  for (let k = k0; k <= k1; k++) {
    if (hash2(70, k) <= 0.55) continue;
    const wxs = k * segW + Math.floor(hash2(71, k) * 60);
    if (wxs >= exLo && wxs <= exHi) continue;
    const sx = wxs - off, w = 6 + Math.floor(hash2(72, k) * 6), top = 20 + Math.floor(hash2(73, k) * 30) + shift;
    for (let y = Math.max(0, top); y < H; y++) {
      const f = (y - top) / (H - top);
      const half = Math.round(w / 2 * Math.sqrt(f)) + (hash2(74, k * 131 + y) > 0.75 ? 1 : 0);
      rect(sx - half, y, 2 * half + 1, 1, cMain);
      px(sx - half, y, cRim);
    }
  }
  for (let x = 0; x < W; x++) {
    const wx = x + off, h = hash2(75, wx);
    if (h <= 0.45) continue;
    const bh = 2 + Math.floor(hash2(76, wx) * 5);
    for (let r = 0; r < bh; r++) px(x + (r === bh - 1 && h > 0.8 ? 1 : 0), H - 1 - r + shift, cMain);
  }
}

function stars(n, seed, maxY, t, shift, visibleCount) {
  for (let i = 0; i < n && i < visibleCount; i++) {
    const x = Math.floor(hash2(seed, i) * W), y = Math.floor(hash2(seed + 1, i) * maxY) + shift;
    const slot = Math.floor(t * 1.5 + hash2(seed + 2, i) * 10);
    const tw = hash2(seed + 3, i * 977 + slot) > 0.75;
    const dim = hash2(seed + 4, i) > 0.7;
    px(x, y, tw ? STAR_P : dim ? TEAL : STAR);
  }
}

function warmHalo(cx, cy, r, s) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (bay(x, y) < (1 - d / (r + 1)) * s) T[y * W + x] = WARM[T[y * W + x]];
    }
  }
}

function bonfire(bx, baseY, t, n) {
  warmHalo(bx, baseY - 4, 9, 0.5);
  rect(bx - 4, baseY, 9, 1, ROCK_DD);
  rect(bx - 3, baseY - 1, 7, 1, WOOD_D);
  line(bx - 3, baseY - 1, bx + 2, baseY - 3, WOOD, false);
  drawFlame(bx, baseY - 2, t, 12, 9, 1.8, 0.1, n, false);
  for (let j = 0; j < 4; j++) {
    const off = j * 0.35, slot = Math.floor((t - off) / 1.4), age = t - (slot * 1.4 + off);
    const h = hash2(n * 7 + j, slot);
    if (age > 0.6 + h * 0.6) continue;
    px(Math.round(bx + (h - 0.5) * 6 + Math.sin(age * 7 + j) * 1.2), Math.round(baseY - 8 - age * 16), age < 0.5 ? FL_OR : FL_RED);
  }
}

// ---------- sequence 1: canyon floor, late afternoon ----------
function renderSeq1(t) {
  const d = dist(t), baseY = GY - 4;
  sky(SKY_PINK, SKY_OR, SKY_GOLD, 0, 58, 0);
  for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r <= 6.5) px(20 + dx, 42 + dy, r < 4.5 ? FL_CORE : SKY_GOLD);
  }
  rockLayer(Math.floor(d * 0.1), 0, 48, 101, 26, 46, 0.3, TERRA, BURNT, SKY_OR, -1);

  const mOff = Math.floor(d * 0.35);
  rockLayer(mOff, 0, 60, 202, 12, 44, 0.3, BURNT, ROCK_D, TERRA, TERRA);
  for (let k = Math.floor(mOff / 60) - 1; k <= Math.floor((mOff + W) / 60) + 1; k++) {
    const sx = k * 60 - mOff, top = colTop(k, 202, 12, 44);
    if (top >= 40 || hash2(220, k) <= 0.3) continue;
    const dx = sx + 10, dy = top + 8;
    rect(dx - 1, dy - 1, 5, 1, WOOD_D);
    rect(dx, dy, 3, 4, ROCK_DD);
    if (hash2(221, k) > 0.4) {
      for (let y = dy + 2; y < baseY; y++) {
        px(dx + 4, y, WOOD_D); px(dx + 6, y, WOOD_D);
        if ((y & 1) === 0) px(dx + 5, y, WOOD);
      }
    }
    if (hash2(222, k) > 0.55 && top + 19 < baseY - 4) {
      rect(sx + 24, top + 15, 3, 4, ROCK_DD);
      rect(sx + 21, top + 19, 9, 1, WOOD);
      px(sx + 21, top + 20, WOOD_D); px(sx + 29, top + 20, WOOD_D);
    }
  }
  for (let n = Math.floor((mOff - 150) / 240) - 1; n <= Math.floor((mOff + W) / 240) + 1; n++) {
    const sx = n * 240 + 150 - mOff;
    if (sx < -20 || sx > W + 10) continue;
    line(sx, baseY, sx, baseY - 24, WOOD_D, false); line(sx + 6, baseY, sx + 6, baseY - 24, WOOD_D, false);
    line(sx, baseY - 2, sx + 6, baseY - 10, WOOD_D, false); line(sx + 6, baseY - 2, sx, baseY - 10, WOOD_D, false);
    line(sx, baseY - 12, sx + 6, baseY - 20, WOOD_D, false);
    rect(sx - 2, baseY - 25, 11, 2, WOOD);
    line(sx - 1, baseY - 29, sx - 1, baseY - 26, WOOD_D, false); line(sx + 7, baseY - 29, sx + 7, baseY - 26, WOOD_D, false);
    for (let r = 0; r < 4; r++) rect(sx + 3 - r - 1, baseY - 33 + r, 3 + 2 * r, 1, r === 3 ? WOOD : WOOD_D);
  }
  for (let n = Math.floor((mOff - 60) / 180) - 1; n <= Math.floor((mOff + W) / 180) + 1; n++) {
    const bx = n * 180 + 60 - mOff;
    if (bx < -15 || bx > W + 15) continue;
    bonfire(bx, baseY, t, n);
  }

  const gOff = Math.floor(d);
  for (let y = GY - 3; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wx = x + gOff;
      let c = y < GY + 2 ? SAND : y < GY + 6 ? (bay(x, y) < (y - GY - 2) / 4 ? SAND_D : SAND) : SAND_D;
      if (y > GY + 10 && (y - GY) % 6 === 0 && hash2(12, Math.floor(wx / 5) * 71 + y) > 0.35) c = ROCK_D;
      const h = hash2(11, wx * 97 + y);
      if (h > 0.97) c = c === SAND ? SAND_D : ROCK_D;
      if (h > 0.995) c = ROCK_DD;
      T[y * W + x] = c;
    }
  }
  for (let k = Math.floor(gOff / 23) - 1; k <= Math.floor((gOff + W) / 23) + 1; k++) {
    const sx = k * 23 + Math.floor(hash2(15, k) * 15) - gOff;
    if (hash2(13, k) > 0.45) {
      px(sx, GY - 3, ROCK_D); px(sx - 1, GY - 4, SCRUB); px(sx, GY - 5, SCRUB); px(sx + 1, GY - 4, SCRUB); px(sx + 2, GY - 5, SCRUB);
    }
    if (hash2(14, k) > 0.88) {
      const cx = sx + 8;
      rect(cx, GY - 11, 2, 8, SCRUB); line(cx + 1, GY - 10, cx + 1, GY - 4, ROCK_D, false);
      rect(cx - 2, GY - 9, 1, 3, SCRUB); px(cx - 1, GY - 7, SCRUB);
      rect(cx + 3, GY - 10, 1, 3, SCRUB); px(cx + 2, GY - 8, SCRUB);
    }
  }

  drawHero(t, 1);
  fgLayer(Math.floor(d * 1.6), 0, ROCK_DD, ROCK_D, 1, 0);
}

// ---------- sequence 2: cliffside switchbacks, dusk ----------
const SEQ2_STARS_X = [20, 70, 108], SEQ2_STARS_Y = [8, 14, 5];
function renderSeq2(t) {
  const d = dist(t), baseY = GY - 4, lt = t - X1S;
  sky(INDIGO, VIOLET, DUSK_OR, 0, 56, 0);
  for (let i = 0; i < 3; i++) {
    if (lt < 4 + i * 5) continue;
    const tw = hash2(300 + i, Math.floor(t * 1.5)) > 0.75;
    px(SEQ2_STARS_X[i], SEQ2_STARS_Y[i], tw ? STAR_P : STAR);
  }
  rockLayer(Math.floor(d * 0.1), 0, 40, 301, 54, 62, 0.35, DUSK_MESA, INDIGO, VIOLET, -1);

  const mOff = Math.floor(d * 0.35);
  rockLayer(mOff, 0, 64, 302, 18, 54, 0.35, ROCK_D, ROCK_DD, BURNT, DUSK_OR);
  for (let k = Math.floor(mOff / 64) - 1; k <= Math.floor((mOff + W) / 64) + 1; k++) {
    const sx = k * 64 - mOff, top = colTop(k, 302, 18, 54);
    if (top < 36 && hash2(320, k) > 0.45) {
      const cx = sx + 10;
      rect(cx + 1, baseY - 9, 5, 1, BLACK);
      rect(cx, baseY - 8, 7, 9, BLACK);
      const g = 0.28 + 0.08 * Math.sin(t * 2 + k);
      for (let y = baseY - 6; y <= baseY; y++) for (let x = cx + 1; x <= cx + 5; x++) {
        const dd = Math.abs(x - (cx + 3)) / 3 + Math.abs(y - (baseY - 2)) / 5;
        if (bay(x, y) < g * (1.2 - dd)) px(x, y, TEAL_GLOW);
      }
    }
    if (top < 44 && hash2(340, k) > 0.55) {
      const tx = sx + 32;
      rect(tx, baseY - 9, 3, 10, STONE_M);
      for (let r = 0; r < 4; r++) px(tx + 1, baseY - 8 + r * 2, STONE_D);
      rect(tx - 1, baseY - 10, 5, 1, STONE_L);
    }
  }

  const gOff = Math.floor(d);
  for (let x = 0; x < W; x++) {
    const wx = x + gOff;
    const lb = GY + 5 + (hash2(21, Math.floor(wx / 3)) > 0.5 ? 1 : 0);
    for (let y = GY - 3; y < H; y++) {
      let c;
      if (y <= lb) {
        c = y === GY - 3 ? BURNT : (y > GY + 2 && bay(x, y) < 0.5) ? ROCK_DD : ROCK_D;
        if (hash2(22, wx * 57 + y) > 0.95) c = ROCK_DD;
      } else {
        const f = (y - lb) / (H - lb);
        c = f < 0.4 ? (bay(x, y) < f / 0.4 ? INDIGO : DUSK_MESA) : (bay(x, y) < (f - 0.4) / 0.6 ? BLACK : INDIGO);
      }
      T[y * W + x] = c;
    }
  }
  for (let k = Math.floor(gOff / 14) - 1; k <= Math.floor((gOff + W) / 14) + 1; k++) {
    const sx = k * 14 - gOff;
    rect(sx, GY - 9, 1, 6, WOOD_D);
    for (let dx = 0; dx < 14; dx++) px(sx + dx, GY - 8 + Math.round(Math.sin(dx / 14 * Math.PI) * 1.5), WOOD);
  }

  drawHero(t, 2);
  fgLayer(Math.floor(d * 1.6), 0, SIL, ROCK_DD, 1, 0);
}

// ---------- sequence 3: the summit under the full moon ----------
const PUFFS = [[0, 0, 5], [6, -2, 6], [13, 0, 5], [19, 1, 4], [-6, 1, 4], [25, 2, 3]];
const BANKS = [[10, 24, 1.0], [70, 46, 1.2], [120, 14, 0.8]];
function renderSeq3(t) {
  const d = dist(t), u = t - X2E, tilt = tiltAt(t);
  const skyShift = Math.round(tilt * 2), moonShift = Math.round(tilt * 3), farShift = Math.round(tilt * 5);
  const midShift = Math.round(tilt * 7), gShift = Math.round(tilt * 10), fgShift = Math.round(tilt * 16);
  const gy = GY + gShift, baseY = gy - 4;

  sky(NAVY, DEEP_BLUE, TEAL_BLUE, 0, 74, skyShift);
  stars(45, 400, 60, t, skyShift, 45);

  const mx = 104, my = Math.round(90 + (30 - 90) * smoothstep(0, 12, u)) + moonShift, mr = 20;
  for (let dy = -mr - 12; dy <= mr + 12; dy++) {
    for (let dx = -mr - 12; dx <= mr + 12; dx++) {
      const x = mx + dx, y = my + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dd = Math.sqrt(dx * dx + dy * dy) - mr;
      const i = y * W + x, b = bay(x, y);
      if (dd <= 0.5) {
        let c = MOON;
        if (dd > -1.5 && dx + dy > 6) c = CRATER;
        T[i] = c;
      } else if (dd < 3) { if (b < 0.7) T[i] = HALO; }
      else if (dd < 7) { if (b < 0.45) T[i] = TEAL; }
      else if (dd < 12) { if (b < 0.25) T[i] = TEAL_BLUE; }
    }
  }
  const CR = [-6, -5, 4, 5, 3, 5, -3, 9, 3, 8, -8, 2.5, -11, 4, 2];
  for (let c = 0; c < CR.length; c += 3) {
    const r = CR[c + 2];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const dd = Math.sqrt(dx * dx + dy * dy);
      const x = mx + CR[c] + dx, y = my + CR[c + 1] + dy;
      if (dd < r - 0.5 || (dd < r + 0.5 && bay(x, y) < 0.5)) px(x, y, CRATER);
    }
  }

  for (let b = 0; b < BANKS.length; b++) {
    const bk = BANKS[b], s = bk[2];
    const bx = ((bk[0] + t * 0.9 * s) % 190) - 40, by = bk[1] + moonShift;
    for (let p = 0; p < PUFFS.length; p++) {
      const pcx = bx + PUFFS[p][0] * s, pcy = by + PUFFS[p][1] * s, r = PUFFS[p][2] * s;
      for (let dy = -Math.ceil(r); dy <= 2; dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        px(pcx + dx, pcy + dy, dy < -r * 0.35 ? CLOUD_L : CLOUD);
      }
    }
  }

  rockLayer(Math.floor(d * 0.1), farShift, 44, 501, 58, 66, 0.35, NROCK_D, SIL, TEAL_BLUE, -1);

  const mOff = Math.floor(d * 0.35);
  for (let k = Math.floor(mOff / 80) - 1; k <= Math.floor((mOff + W) / 80) + 1; k++) {
    if (hash2(600, k) <= 0.55) continue;
    const pxx = k * 80 + 20 + Math.floor(hash2(601, k) * 40) - mOff;
    const h = 10 + Math.floor(hash2(602, k) * 14), pb = GY - 4 + midShift;
    for (let r = 0; r <= h; r++) {
      const half = Math.round(4 * Math.pow(1 - r / h, 0.7));
      rect(pxx - half, pb - r, 2 * half + 1, 1, SIL);
      px(pxx + half, pb - r, TEAL_BLUE);
    }
  }

  const gOff = Math.floor(d);
  for (let x = 0; x < W; x++) {
    const wx = x + gOff, sl = wx - (STATUE_WX - 28);
    let top = gy - 3;
    if (sl >= 0) top -= (sl < 18 ? Math.round(sl / 18 * 6) : 6) + (sl > 70 && hash2(502, wx) > 0.7 ? 1 : 0);
    for (let y = Math.max(0, top); y < H; y++) {
      let c;
      if (y === top) c = TEAL_BLUE;
      else if (y < gy + 3) c = NROCK;
      else if (y < gy + 10) c = bay(x, y) < (y - gy - 3) / 7 ? NROCK_D : NROCK;
      else c = bay(x, y) < (y - gy - 10) / 12 ? SIL : NROCK_D;
      if (y > top && hash2(503, wx * 57 + y) > 0.95) c = NROCK_D;
      T[y * W + x] = c;
    }
  }

  const scx = STATUE_WX - gOff;
  if (scx > -60 && scx < W + 60) drawStatue(scx, gy - 9);

  drawHero(t, 3);
  const fOff = Math.floor(d * 1.6), fFinal = Math.floor(FINAL_DIST * 1.6);
  fgLayer(fOff, fgShift, BLACK, SIL, fFinal - 30, fFinal + W + 30);
}

// ---------- frame assembly ----------
function renderSeq(n, t, buf) {
  SCENE = buf; setTarget(buf, W, H);
  if (n === 1) renderSeq1(t); else if (n === 2) renderSeq2(t); else renderSeq3(t);
}
function dissolve(p) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    FB[i] = bay(x, y) < p ? BB[i] : BA[i];
  }
}
function renderFrame(t) {
  if (t < X1S) renderSeq(1, t, FB);
  else if (t < X1E) { renderSeq(1, t, BA); renderSeq(2, t, BB); dissolve((t - X1S) / (X1E - X1S)); }
  else if (t < X2S) renderSeq(2, t, FB);
  else if (t < X2E) { renderSeq(2, t, BA); renderSeq(3, t, BB); dissolve((t - X2S) / (X2E - X2S)); }
  else renderSeq(3, t, FB);
  return FB;
}
function toRGB(out) {
  for (let i = 0; i < W * H; i++) {
    const c = FB[i] * 3, o = i * 3;
    out[o] = PAL[c]; out[o + 1] = PAL[c + 1]; out[o + 2] = PAL[c + 2];
  }
  return out;
}
function toRGBA(out) {
  for (let i = 0; i < W * H; i++) {
    const c = FB[i] * 3, o = i * 4;
    out[o] = PAL[c]; out[o + 1] = PAL[c + 1]; out[o + 2] = PAL[c + 2]; out[o + 3] = 255;
  }
  return out;
}

buildStatue();

const api = { W, H, DURATION: END, renderFrame, toRGB, toRGBA };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.CanyonRenderer = api;
})(typeof self !== 'undefined' ? self : this);
