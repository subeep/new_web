/* =====================================================================
   Avgarde — homepage scroll story: the DroneAstra™ platform detecting a drone.
   ---------------------------------------------------------------------
   - main.js (classic) runs first; this module only owns #story.
   - Every story element is a pure function of the smoothed scroll progress
     p ∈ [0,1], so scrubbing backwards reverses cleanly. Idle motion (props,
     LEDs, scan rotation, camera breathing, spectrogram) is time-based.
   - Three.js is loaded with a dynamic import so the overlay UI works while
     the CDN loads; any failure flips <html> to .no-3d (stacked layout).
   ===================================================================== */

const root = document.documentElement;
const story = document.getElementById('story');
const stageEl = document.getElementById('storyStage');
window.__storyBoot = true;

const MODE = !story ? 'none'
  : root.classList.contains('story-3d') ? '3d'
  : root.classList.contains('story-static') ? 'static' : 'none';

/* ---------------------------------------------------------------- math */
const PI = Math.PI, TAU = PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const range = (x, a, b) => clamp((x - a) / (b - a));
const band = (x, a, b, c, d) => sstep(a, b, x) * (1 - sstep(c, d, x));
const wrapTau = a => ((a % TAU) + TAU) % TAU;
const wrapPi = a => wrapTau(a + PI) - PI;
const EASE = {
  l: t => t,
  io: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  o: t => 1 - Math.pow(1 - t, 3),
  i: t => t * t * t,
  s: t => t * t * (3 - 2 * t),
};

// centripetal Catmull-Rom on [x,y,z] arrays (no overshoot on uneven spacing)
const crKnot = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])));
function catmull(p0, p1, p2, p3, u, out) {
  const t1 = crKnot(p0, p1), t2 = t1 + crKnot(p1, p2), t3 = t2 + crKnot(p2, p3);
  const t = t1 + (t2 - t1) * u;
  for (let k = 0; k < 3; k++) {
    const a1 = ((t1 - t) / t1) * p0[k] + (t / t1) * p1[k];
    const a2 = ((t2 - t) / (t2 - t1)) * p1[k] + ((t - t1) / (t2 - t1)) * p2[k];
    const a3 = ((t3 - t) / (t3 - t2)) * p2[k] + ((t - t2) / (t3 - t2)) * p3[k];
    const b1 = ((t2 - t) / t2) * a1 + (t / t2) * a2;
    const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3;
    out[k] = ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2;
  }
  return out;
}
// keyed spline: keys [{p, v:[x,y,z], e}] — e = easing of the segment that ENDS at this key
function keyedPath(keys, field = 'v') {
  const n = keys.length;
  const pts = keys.map(k => k[field]);
  const ghost0 = pts[0].map((v, i) => 2 * v - pts[1][i]);
  const ghostN = pts[n - 1].map((v, i) => 2 * v - pts[n - 2][i]);
  const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  return (p, out) => {
    if (p <= keys[0].p) { out[0] = pts[0][0]; out[1] = pts[0][1]; out[2] = pts[0][2]; return out; }
    if (p >= keys[n - 1].p) { out[0] = pts[n - 1][0]; out[1] = pts[n - 1][1]; out[2] = pts[n - 1][2]; return out; }
    let i = 0;
    while (i < n - 2 && p > keys[i + 1].p) i++;
    const u = EASE[keys[i + 1].e || 's'](range(p, keys[i].p, keys[i + 1].p));
    const a = pts[i], b = pts[i + 1];
    if (same(a, b)) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return out; }
    return catmull(i > 0 ? pts[i - 1] : ghost0, a, b, i + 2 < n ? pts[i + 2] : ghostN, u, out);
  };
}
function keyedScalar(keys, field) {
  const n = keys.length;
  return p => {
    if (p <= keys[0].p) return keys[0][field];
    if (p >= keys[n - 1].p) return keys[n - 1][field];
    let i = 0;
    while (i < n - 2 && p > keys[i + 1].p) i++;
    return lerp(keys[i][field], keys[i + 1][field], EASE[keys[i + 1].e || 's'](range(p, keys[i].p, keys[i + 1].p)));
  };
}
function smoothDamp(cur, target, state, smoothTime, dt) {
  const omega = 2 / smoothTime, x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (state.v + omega * change) * dt;
  state.v = (state.v - omega * temp) * exp;
  return target + (change + temp) * exp;
}
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash2(i, j) { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s / 0.9375; }

/* ------------------------------------------------------------ timeline
   0.00–0.14 intro · 0.14–0.34 sense · 0.34–0.54 detect/track (lock .40)
   0.54–0.74 classify · 0.74–0.92 neutralise · 0.92–1.00 outro            */
const TL = {
  lock: 0.40, lockIn: 0.43, clsA: 0.575, clsB: 0.645,
  jamA: 0.755, jam: 0.785, spoof: 0.825, landA: 0.835, land: 0.905, release: 0.905,
};
const STAGES = [[0.14, 0.34], [0.34, 0.54], [0.54, 0.74], [0.74, 0.92]];
const MISSION_S = 480;          // story clock: p=1 ↔ T+08:00
const KM_PER_UNIT = 0.1;        // 10 world units = 1 km (range rings)
const ALT_M_PER_UNIT = 12;      // vertical scale for the ALT readout

// world layout (units)
const RADAR = [0, 0, 0], RADAR_HEAD_Y = 4.25;
const YUG = [-5, 0, -4], YUG_EMIT_Y = 2.3;
const PAD = [6, 0, -18], PAD_R = 1.9;
const DRONE_LAND_Y = 0.27;

const DRONE_KEYS = [
  { p: 0.10, v: [54, 11.6, -52] },
  { p: 0.22, v: [44, 11.2, -46.5], e: 'l' },
  { p: 0.40, v: [28.5, 10.2, -37.5], e: 'l' },
  { p: 0.60, v: [15.5, 9.1, -29.5], e: 'l' },
  { p: 0.80, v: [7.2, 8.0, -20.4], e: 'o' },
  { p: 0.835, v: [6.9, 7.3, -19.6], e: 'io' },
  { p: 0.905, v: [PAD[0], DRONE_LAND_Y, PAD[2]], e: 'io' },
  { p: 1.0, v: [PAD[0], DRONE_LAND_Y, PAD[2]], e: 'l' },
];

// camera choreography (desktop framing). sx: horizontal subject shift (fraction of width,
// + = right, leaves room for left captions); sy: vertical shift used on portrait screens.
const CAM_KEYS = [
  { p: 0.00, pos: [-37.5, 14.4, 54.5], look: [-10.5, 4.3, 5], m: [-6, 2, 3], fov: 32, sx: 0.16, sy: 0.17 },
  { p: 0.11, pos: [-36.9, 14, 48.9], look: [-7.1, 3.6, -1.4], m: [-5, 2, 1], fov: 32, sx: 0.15, sy: 0.17, e: 'l' },
  { p: 0.21, pos: [-15, 6.6, 6], look: [26.4, 4.2, -22.2], m: [9, 5, -12], fov: 40, sx: 0.12, sy: 0.12, e: 'io' },
  { p: 0.33, pos: [-15.5, 6.8, 8.9], look: [30.6, 4.6, -34.5], m: [12, 6, -18], fov: 36, sx: 0.12, sy: 0.12, e: 'l' },
  { p: 0.42, pos: [8.1, 13.3, 37.1], look: [4.1, 1.3, -24.9], m: [12, 6, -17], fov: 40, sx: 0.1, sy: 0.14, e: 'io' },
  { p: 0.52, pos: [8.9, 11.4, 33], look: [4.5, 2.1, -27], m: [10, 6, -16], fov: 38, sx: 0.1, sy: 0.14, e: 'l' },
  { p: 0.64, pos: [22, 11, -34], look: [13, 8.6, -27], m: [13, 8.6, -27], fov: 30, sx: 0.13, sy: 0.14, e: 'io' },
  { p: 0.72, pos: [16, 10.5, -30], look: [9.5, 8.2, -23.5], m: [9.5, 8.2, -23.5], fov: 30, sx: 0.13, sy: 0.14, e: 'l' },
  { p: 0.80, pos: [43, 7, -6.5], look: [2, 5, -11.5], m: [2, 4.5, -12], fov: 36, sx: 0.05, sy: 0.14, e: 'io' },
  { p: 0.90, pos: [42.8, 8.8, -5.8], look: [-1.7, 4.2, -11.2], m: [1, 3, -11], fov: 36, sx: 0.05, sy: 0.14, e: 'l' },
  { p: 0.97, pos: [-27, 15, 46], look: [-1, 1.5, -8], m: [-3, 1, -5], fov: 36, sx: 0.0, dy: 0.2, sy: 0.22, e: 'io' },
  { p: 1.00, pos: [-31, 17, 51], look: [-1, 1.5, -8], m: [-3, 1, -5], fov: 36, sx: 0.0, dy: 0.2, sy: 0.22, e: 'l' },
];

/* --------------------------------------------------------- simulation
   Plain-JS state derived from p (+ t for idle motion). Used by both the
   3D renderer and the HTML overlays / HUD, so the HUD works pre-WebGL.   */
const dronePath = keyedPath(DRONE_KEYS);
const camPos = keyedPath(CAM_KEYS, 'pos');
const camLook = keyedPath(CAM_KEYS, 'look');
const camLookM = keyedPath(CAM_KEYS, 'm');
const camFov = keyedScalar(CAM_KEYS, 'fov');
const camSx = keyedScalar(CAM_KEYS, 'sx');
const camSy = keyedScalar(CAM_KEYS, 'sy');
CAM_KEYS.forEach(k => { if (k.dy == null) k.dy = 0; });
const camDy = keyedScalar(CAM_KEYS, 'dy');

const INITIAL_YAW = Math.atan2(DRONE_KEYS[1].v[0] - DRONE_KEYS[0].v[0], DRONE_KEYS[1].v[2] - DRONE_KEYS[0].v[2]);
const sim = {
  p: 0, t: 0,
  drone: [0, 0, 0], droneBase: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, speed: 0, alt: 0, rng: 0, brg: 0,
  sweep: 0, sweepFree: 0, captured: false, track: 0, trackBearing: 0, paint: 0,
  lock: 0, cls: 0, jam: 0, spoof: 0, land: 0, landed: 0, contact: 0, threat: 0,
  cam: [0, 0, 0], look: [0, 0, 0], lookM: [0, 0, 0], fov: 38, sx: 0, sy: 0, dy: 0, close: 0,
};
const _a = [0, 0, 0], _b = [0, 0, 0], _c = [0, 0, 0], _orb = [0, 0, 0];
const SCAN_RATE = TAU / 3.4;      // idle scan: one revolution / 3.4 s
const CHASE_RATE = TAU / 0.8;     // sweep swinging onto the target

function simulate(p, t, dt, opts) {
  const s = sim;
  s.p = p; s.t = t;
  // ---- drone kinematics (deterministic in p) ----
  dronePath(p, s.droneBase);
  const e = 0.004;
  dronePath(clamp(p - e, 0, 1), _a); dronePath(clamp(p + e, 0, 1), _b);
  const vx = (_b[0] - _a[0]) / (2 * e), vy = (_b[1] - _a[1]) / (2 * e), vz = (_b[2] - _a[2]) / (2 * e);
  const hs = Math.hypot(vx, vz);
  // units per unit-p → m/s (horizontal and vertical use their own display scales)
  s.speed = Math.hypot(hs * 1000 * KM_PER_UNIT, vy * ALT_M_PER_UNIT) / MISSION_S;
  // heading follows the velocity; while hovering / landed it holds the last heading
  if (hs > 1.5) s.yaw = Math.atan2(vx, vz);
  else if (p <= DRONE_KEYS[0].p) s.yaw = INITIAL_YAW;
  dronePath(clamp(p + 3 * e, 0, 1), _c);
  const yawAhead = Math.atan2(_c[0] - _b[0], _c[2] - _b[2]);
  const turn = hs > 1.5 ? wrapPi(yawAhead - s.yaw) : 0;
  s.jam = sstep(TL.jamA, TL.jam, p) * (1 - sstep(TL.land - 0.01, TL.land + 0.01, p));
  s.spoof = sstep(TL.jam, TL.spoof, p);
  s.land = range(p, TL.landA, TL.land);
  s.landed = sstep(TL.land - 0.004, TL.land + 0.01, p);
  const cruise = clamp(hs / 90);
  s.pitch = 0.16 * cruise + 0.05 * s.jam * Math.sin(t * 3.1);
  s.roll = clamp(-turn * 6, -0.35, 0.35) + (0.05 + 0.1 * s.jam) * Math.sin(t * 2.3) * (1 - s.landed);
  // idle hover wobble (time-based), stronger while jammed ("confused")
  const wob = (1 - s.landed) * (opts.reduced ? 0 : 1);
  const wa = 0.05 + 0.18 * s.jam;
  s.drone[0] = s.droneBase[0] + Math.sin(t * 1.3) * wa * wob;
  s.drone[1] = s.droneBase[1] + Math.sin(t * 1.9 + 1) * (0.05 + 0.1 * s.jam) * wob;
  s.drone[2] = s.droneBase[2] + Math.cos(t * 1.1) * wa * wob;

  const dx = s.droneBase[0] - RADAR[0], dz = s.droneBase[2] - RADAR[2];
  s.rng = Math.hypot(dx, dz) * KM_PER_UNIT;
  s.alt = Math.max(0, s.droneBase[1] - DRONE_LAND_Y) * ALT_M_PER_UNIT;
  s.trackBearing = Math.atan2(dz, dx);            // shader angle convention atan2(z, x)
  s.brg = wrapTau(s.trackBearing + PI / 2) * 180 / PI; // compass: north = −z

  // ---- story flags ----
  s.contact = band(p, 0.19, 0.215, 0.94, 0.955);
  s.lock = sstep(TL.lock, TL.lockIn, p) * (1 - sstep(0.935, 0.955, p));
  s.cls = range(p, TL.clsA, TL.clsB);
  s.threat = p >= TL.lock && p < TL.land ? 1 : 0;

  // ---- radar sweep: free scan; on lock it chases the target, then tracks it ----
  const wantTrack = p >= TL.lock - 0.004 && p < TL.release;
  const rate = opts.reduced ? 0 : SCAN_RATE;
  if (opts.forceTrack) { s.captured = wantTrack; if (wantTrack) s.sweepFree = s.trackBearing; }
  if (wantTrack) {
    if (!s.captured) {
      const ahead = wrapTau(s.trackBearing - s.sweepFree);
      const step = CHASE_RATE * dt;
      if (ahead <= step || ahead > TAU - 0.02) { s.captured = true; s.sweepFree = s.trackBearing; }
      else s.sweepFree = wrapTau(s.sweepFree + step);
    } else s.sweepFree = s.trackBearing;
  } else {
    s.captured = false;
    s.sweepFree = wrapTau(s.sweepFree + rate * dt);
  }
  s.sweep = s.sweepFree;
  s.track = s.captured ? sstep(TL.lock, TL.lock + 0.02, p) * (1 - sstep(TL.release - 0.02, TL.release, p)) : 0;
  // radar returns "paint" the target each time the sweep passes it (pre-lock)
  const behind = wrapTau(s.sweep - s.trackBearing);
  s.paint = Math.exp(-behind * 2.2) * (1 - s.track);

  // ---- camera ----
  camPos(p, s.cam); camLook(p, s.look); camLookM(p, s.lookM);
  s.fov = camFov(p); s.sx = camSx(p); s.sy = camSy(p); s.dy = camDy(p);
  // classify: orbit close around the drone
  const fw = EASE.io(sstep(0.535, 0.59, p) * (1 - sstep(0.705, 0.76, p)));
  s.close = fw;
  if (fw > 0) {
    const flight = Math.atan2(vz, vx);
    const phi = flight + PI + lerp(-1.25, -0.35, range(p, 0.54, 0.76));
    const R = lerp(6.4, 5.0, range(p, 0.56, 0.72));
    _orb[0] = s.droneBase[0] + Math.cos(phi) * R;
    _orb[1] = s.droneBase[1] + lerp(2.6, 1.8, range(p, 0.56, 0.72));
    _orb[2] = s.droneBase[2] + Math.sin(phi) * R;
    for (let k = 0; k < 3; k++) {
      s.cam[k] = lerp(s.cam[k], _orb[k], fw);
      s.look[k] = lerp(s.look[k], s.droneBase[k] + (k === 1 ? -0.15 : 0), fw);
      s.lookM[k] = lerp(s.lookM[k], s.droneBase[k] + (k === 1 ? -0.15 : 0), fw);
    }
    s.fov = lerp(s.fov, 30, fw);
  }
  // camera breathing (idle)
  if (!opts.reduced) {
    const dist = Math.hypot(s.cam[0] - s.look[0], s.cam[1] - s.look[1], s.cam[2] - s.look[2]);
    const amp = 0.006 * dist;
    s.cam[0] += Math.sin(t * 0.23) * amp;
    s.cam[1] += Math.sin(t * 0.31 + 1.3) * amp * 0.6;
    s.cam[2] += Math.cos(t * 0.19) * amp;
  }
  return s;
}

/* ------------------------------------------------------------ DOM helpers */
const styleCache = new WeakMap();
function setVar(el, prop, val) {
  let c = styleCache.get(el); if (!c) styleCache.set(el, (c = {}));
  if (c[prop] !== val) { c[prop] = val; el.style.setProperty(prop, val); }
}
function setText(el, s) { if (el && el.__t !== s) { el.__t = s; el.textContent = s; } }
function setClass(el, name, on) { if (!el) return; const k = '__c_' + name; if (el[k] !== on) { el[k] = on; el.classList.toggle(name, on); } }
function setAttr(el, name, val) { const k = '__a_' + name; if (el[k] !== val) { el[k] = val; el.setAttribute(name, val); } }
const pad2 = n => (n < 10 ? '0' : '') + n;

/* ------------------------------------------------------ micro-Doppler display */
function createSpectrogram(canvas, small) {
  if (!canvas || !canvas.getContext) return null;
  const W = small ? 240 : 320, H = small ? 64 : 96;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const lut = new Uint8ClampedArray(256 * 3);
  const stops = [[0, [6, 10, 17]], [0.28, [12, 40, 86]], [0.55, [40, 130, 240]], [0.78, [46, 230, 214]], [1, [240, 250, 255]]];
  for (let i = 0; i < 256; i++) {
    const v = i / 255; let j = 0;
    while (j < stops.length - 2 && v > stops[j + 1][0]) j++;
    const [a, ca] = stops[j], [b, cb] = stops[j + 1], u = clamp((v - a) / (b - a));
    for (let k = 0; k < 3; k++) lut[i * 3 + k] = ca[k] + (cb[k] - ca[k]) * u;
  }
  ctx.fillStyle = '#060a11'; ctx.fillRect(0, 0, W, H);
  const col = ctx.createImageData(1, H);
  let seed = 1234567, tAcc = 0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  function column(t, x) {
    const d = col.data;
    const flash = Math.pow(Math.max(0, Math.sin(TAU * 5.3 * t)), 40);
    for (let y = 0; y < H; y++) {
      const f = (y / (H - 1)) * 2 - 1;               // doppler −1..1
      let v = Math.exp(-Math.pow((f - 0.06) / 0.035, 2)) * 0.95;   // body line
      for (let r = 0; r < 4; r++) {
        const fr = 0.06 + 0.62 * Math.sin(TAU * (1.7 + r * 0.13) * t + r * 1.57);
        v += Math.exp(-Math.pow((f - fr) / 0.03, 2)) * 0.42;
        v += Math.exp(-Math.pow((f + fr * 0.5 - 0.03) / 0.03, 2)) * 0.14;
      }
      v += flash * 0.55 * (1 - Math.abs(f) * 0.7);
      v += rnd() * 0.12;
      const i = Math.min(255, Math.max(0, Math.round(v * 200))) * 3;
      const o = y * 4;
      d[o] = lut[i]; d[o + 1] = lut[i + 1]; d[o + 2] = lut[i + 2]; d[o + 3] = 255;
    }
    ctx.putImageData(col, x, 0);
  }
  return {
    step(dt) {
      const cols = 2;
      ctx.drawImage(canvas, -cols, 0);
      for (let c = 0; c < cols; c++) { tAcc += dt / cols; column(tAcc, W - cols + c); }
    },
    fill() { for (let x = 0; x < W; x++) { tAcc += 1 / 120; column(tAcc, x); } },
  };
}

/* ------------------------------------------------------------ overlay UI */
function createUI() {
  const q = s => story.querySelector(s);
  const intro = q('#storyIntro');
  const scrim = q('.story__scrim');
  const caps = [...story.querySelectorAll('.cap')].map(el => ({ el, a: parseFloat(el.dataset.in), b: parseFloat(el.dataset.out) }));
  const labels = [...story.querySelectorAll('.tag3d')].map(el => ({ el, key: el.dataset.anchor, below: el.classList.contains('tag3d--below') }));
  const lockEl = q('#lock');
  const lk = {
    box: q('.lock__box'),
    cls: q('[data-lock="cls"]'), rng: q('[data-lock="rng"]'), alt: q('[data-lock="alt"]'),
    brg: q('[data-lock="brg"]'), spd: q('[data-lock="spd"]'), status: q('[data-lock="status"]'),
  };
  const hud = {
    az: q('[data-hud="az"]'), coord: q('[data-hud="coord"]'), mode: q('[data-hud="mode"]'),
    threats: q('[data-hud="threats"]'), clock: q('[data-hud="clock"]'), threatWrap: q('.hud__threat'),
    bottom: q('.hud--bottom'),
  };
  const rail = q('.rail');
  const railItems = [...story.querySelectorAll('.rail li')];
  const railFill = q('.rail__fill');
  const bars = [...story.querySelectorAll('.cls__bars li')];
  const barVals = bars.map(li => li.querySelector('b'));
  const clsResult = q('[data-cls="result"]');
  const clsCap = q('.cap--classify');
  const ew = [...story.querySelectorAll('.ew li')].map(li => ({ li, at: parseFloat(li.dataset.at) }));
  const small = () => window.innerWidth < 760;
  const spec = createSpectrogram(document.getElementById('specCanvas'), small());
  if (spec) spec.fill();
  let frameNo = 0;

  const BAR0 = [0.34, 0.41, 0.25], BAR1 = [0.97, 0.02, 0.01];

  function updateClassify(p) {
    const appear = sstep(0.555, 0.575, p);
    const e = EASE.o(range(p, TL.clsA, TL.clsB));
    for (let i = 0; i < bars.length; i++) {
      const v = lerp(BAR0[i], BAR1[i], e) * appear;
      setVar(bars[i], '--v', v.toFixed(3));
      setText(barVals[i], Math.round(v * 100) + '%');
    }
    setText(clsResult, e >= 1 ? 'DRONE · QUADCOPTER · 97%' : 'ANALYSING SIGNATURE…');
  }
  function updateEW(p) {
    let prev = TL.jamA;
    for (const s of ew) {
      const state = p >= s.at ? 'done' : p >= prev ? 'active' : 'pending';
      setClass(s.li, 'is-active', state === 'active');
      setClass(s.li, 'is-pending', state === 'pending');
      prev = s.at;
    }
  }

  function update(p, t, dt, view, anchorsOnly) {
    frameNo++;
    if (!anchorsOnly) updateStory(p, t, dt);
    if (view) updateAnchors(p, t, dt, view);
  }
  function updateStory(p, t, dt) {
    // intro
    const iv = 1 - sstep(0.085, 0.13, p);
    setVar(intro, '--v', iv.toFixed(3));
    setVar(intro, '--d', (1 - iv).toFixed(3));
    const introOff = iv < 0.01;
    if (intro.__off !== introOff) { intro.__off = introOff; intro.classList.toggle('is-off', introOff); intro.inert = introOff; }
    // captions
    for (const c of caps) {
      const f = 0.028;
      const v = sstep(c.a, c.a + f, p) * (1 - sstep(c.b - f, c.b, p));
      const d = p < (c.a + c.b) / 2 ? 1 - sstep(c.a, c.a + f, p) : -sstep(c.b - f, c.b, p);
      setVar(c.el, '--v', v.toFixed(3));
      setVar(c.el, '--d', d.toFixed(3));
      const off = v < 0.01;
      if (c.el.__off !== off) { c.el.__off = off; c.el.classList.toggle('is-off', off); c.el.inert = off; }
    }
    setVar(scrim, '--scrim', (1 - 0.55 * sstep(0.925, 0.96, p)).toFixed(3));
    // classify widget + spectrogram (only while visible)
    const clsV = sstep(0.555, 0.583, p) * (1 - sstep(0.707, 0.735, p));
    if (clsV > 0.01) { updateClassify(p); if (spec && dt > 0) spec.step(dt); }
    updateEW(p);
    // rail
    let active = -1;
    for (let i = 0; i < STAGES.length; i++) if (p >= STAGES[i][0] - 0.001 && p < STAGES[i][1]) active = i;
    railItems.forEach((li, i) => {
      setClass(li, 'is-active', i === active);
      setClass(li, 'is-done', p >= STAGES[i][1]);
    });
    setVar(railFill, '--rail', range(p, 0.14, 0.92).toFixed(3));
    setVar(rail, '--railv', (1 - 0.7 * sstep(0.93, 0.97, p)).toFixed(2));

    // HUD (text at ~20 Hz)
    if (frameNo % 3 === 0 || dt === 0) {
      const s = sim;
      setText(hud.az, 'AZ ' + (wrapTau(s.sweep + PI / 2) * 180 / PI).toFixed(1).padStart(5, '0') + '°');
      if (p >= 0.2 && p < 0.955) {
        const x = s.droneBase[0] * KM_PER_UNIT, y = -s.droneBase[2] * KM_PER_UNIT;
        setText(hud.coord, 'TGT X ' + (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2) + ' · Y ' + (y >= 0 ? '+' : '−') + Math.abs(y).toFixed(2) + ' KM');
      } else setText(hud.coord, 'TGT X — · Y —');
      setText(hud.mode, p < TL.lock ? 'MODE SCAN' : p < TL.jamA ? 'MODE TRACK+SCAN' : p < TL.land ? 'MODE EW ENGAGED' : 'MODE SCAN');
      setText(hud.threats, String(s.threat));
      setClass(hud.threatWrap, 'is-hot', s.threat > 0);
      const secs = p * MISSION_S;
      setText(hud.clock, 'T+' + pad2(Math.floor(secs / 60)) + ':' + pad2(Math.floor(secs % 60)) + '.' + Math.floor((secs * 10) % 10));
    }

  }
  function updateAnchors(p, t, dt, view) {
    {
      const s = sim;
      // lock reticle
      const lv = s.contact;
      setVar(lockEl, 'opacity', view.drone.on ? lv.toFixed(3) : '0');
      if (lv > 0.001 && view.drone.on) {
        const st = p < TL.lock ? 'contact' : p < TL.clsB ? 'locked' : p < TL.jamA ? 'threat' : p < TL.land ? 'jammed' : 'safe';
        setAttr(lockEl, 'data-state', st);
        const size = clamp(view.drone.r * 2.6, 34, view.w < 760 ? 150 : 230);
        const k = st === 'contact' ? 0.55 + 0.1 * Math.sin(t * 6) : lerp(2.2, 1, EASE.o(s.lock));
        lockEl.style.transform = `translate3d(${view.drone.x.toFixed(1)}px, ${view.drone.y.toFixed(1)}px, 0)`;
        setVar(lockEl, '--s', size.toFixed(0) + 'px');
        setVar(lockEl, '--k', k.toFixed(3));
        setVar(lockEl, '--r', (st === 'contact' ? 1 : 1 - EASE.o(s.lock)).toFixed(3));
        setVar(lockEl, '--ping', range(p, TL.lock, TL.lock + 0.04).toFixed(3));
        setVar(lockEl, '--tag', (sstep(0.412, 0.44, p) * (1 - sstep(0.93, 0.95, p)) * (1 - sstep(0.2, 0.6, s.close))).toFixed(3));
        setClass(lockEl, 'is-flip', view.drone.x + size / 2 + 230 > view.w - (view.w < 760 ? 30 : 150));
        if (frameNo % 3 === 0 || dt === 0) {
          setText(lk.cls, p < TL.clsA ? 'UNKNOWN' : p < TL.clsB ? 'CLASSIFYING…' : 'DRONE · QUAD');
          setText(lk.rng, s.rng.toFixed(2) + ' km');
          setText(lk.alt, Math.round(s.alt) + ' m');
          setText(lk.brg, s.brg.toFixed(0).padStart(3, '0') + '°');
          setText(lk.spd, s.speed.toFixed(1) + ' m/s');
          setText(lk.status,
            p < TL.clsA ? 'TRACKING · 3D' : p < TL.clsB ? 'MICRO-DOPPLER AI' : p < TL.jamA ? 'THREAT · TRACKING'
            : p < TL.jam ? 'EW ENGAGING' : p < TL.spoof ? 'LINK JAMMED' : p < TL.landA ? 'GNSS SPOOFED'
            : p < TL.land ? 'GUIDED DESCENT' : 'SAFE LANDING ✓');
        }
      }
      // labels
      for (const L of labels) {
        const a = view[L.key];
        const v = L.key === 'radar' ? 1 - sstep(0.1, 0.135, p)
          : L.key === 'yug' ? band(p, 0.745, 0.77, 0.825, 0.845)
          : band(p, 0.8, 0.83, 0.975, 0.995);
        const show = a && a.on ? v : 0;
        setVar(L.el, 'opacity', show.toFixed(3));
        if (show > 0.001) L.el.style.transform = L.below
          ? `translate3d(${(a.x - 11).toFixed(1)}px, ${(a.y + 26).toFixed(1)}px, 0)`
          : `translate3d(${(a.x - 11).toFixed(1)}px, ${(a.y - 26).toFixed(1)}px, 0) translateY(-100%)`;
      }
    }
  }

  // rail: click to jump to a stage
  story.querySelectorAll('.rail button').forEach(btn => btn.addEventListener('click', () => {
    const target = parseFloat(btn.dataset.go);
    window.scrollTo({ top: scrollState.top + target * scrollState.range, behavior: 'smooth' });
  }));

  function staticFill() {
    // stacked / reduced-motion: final values, all steps done, a filled spectrogram
    if (spec) spec.fill();
  }
  function clear() {
    [intro, scrim, lockEl, railFill, rail, ...caps.map(c => c.el), ...labels.map(l => l.el), ...bars].forEach(el => { if (el) { el.removeAttribute('style'); styleCache.delete(el); el.inert = false; el.classList.remove('is-off'); } });
    ew.forEach(s => s.li.classList.remove('is-active', 'is-pending'));
    bars.forEach((li, i) => { li.style.setProperty('--v', BAR1[i]); setText(barVals[i], Math.round(BAR1[i] * 100) + '%'); });
    setText(clsResult, 'DRONE · QUADCOPTER · 97%');
  }
  return { update, staticFill, clear, spec, clsCap };
}

/* ------------------------------------------------------------ scroll state */
const scrollState = { top: 0, range: 1 };
function measure() {
  if (!story) return;
  let top = 0, el = story;
  while (el) { top += el.offsetTop; el = el.offsetParent; }
  scrollState.top = top;
  scrollState.range = Math.max(1, story.offsetHeight - stageEl.offsetHeight);
}
const targetP = () => clamp((window.scrollY - scrollState.top) / scrollState.range);

/* =====================================================================
   THREE.JS WORLD
   ===================================================================== */
async function loadThree() {
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('three.js load timeout')), 20000));
  const mods = await Promise.race([Promise.all([
    import('three'),
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js'),
    import('three/addons/environments/RoomEnvironment.js'),
    import('three/addons/geometries/RoundedBoxGeometry.js'),
    import('three/addons/utils/BufferGeometryUtils.js'),
  ]), timeout]);
  const [THREE, ec, rp, ub, op, re, rb, bgu] = mods;
  return {
    THREE, EffectComposer: ec.EffectComposer, RenderPass: rp.RenderPass, UnrealBloomPass: ub.UnrealBloomPass,
    OutputPass: op.OutputPass, RoomEnvironment: re.RoomEnvironment, RoundedBoxGeometry: rb.RoundedBoxGeometry,
    mergeGeometries: bgu.mergeGeometries,
  };
}

// solve the scene clear colour so that after ACES + sRGB it equals the page --bg (#060a11)
function solveBackground(THREE, exposure) {
  const target = new THREE.Color('#060a11'); // linear
  const aces = (r, g, b) => {
    const k = exposure / 0.6; r *= k; g *= k; b *= k;
    const x = 0.59719 * r + 0.35458 * g + 0.04823 * b;
    const y = 0.076 * r + 0.90834 * g + 0.01566 * b;
    const z = 0.0284 * r + 0.13383 * g + 0.83777 * b;
    const f = v => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
    const X = f(x), Y = f(y), Z = f(z);
    return [clamp(1.60475 * X - 0.53108 * Y - 0.07367 * Z), clamp(-0.10208 * X + 1.10813 * Y - 0.00605 * Z), clamp(-0.00327 * X - 0.07276 * Y + 1.07602 * Z)];
  };
  // damped fixed-point iteration (converges to <1/255 for dark targets)
  let c = [target.r * 3, target.g * 3, target.b * 3];
  const tg = [target.r, target.g, target.b];
  for (let i = 0; i < 600; i++) {
    const o = aces(c[0], c[1], c[2]);
    for (let k = 0; k < 3; k++) c[k] = clamp(c[k] + (tg[k] - o[k]) * 1.1, 0, 0.2);
  }
  return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);
}

function buildWorld(M, canvas, opts) {
  const { THREE } = M;
  const small = opts.small;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  const maxDpr = small ? 1.25 : 1.75;
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const EXPOSURE = 1.45;
  renderer.toneMappingExposure = EXPOSURE;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const BG = solveBackground(THREE, EXPOSURE);
  const scene = new THREE.Scene();
  scene.background = BG;
  const FOG_DENSITY = 0.0105;
  scene.fog = new THREE.FogExp2(BG, FOG_DENSITY);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1200);

  const disposables = [];
  const track = o => { disposables.push(o); return o; };
  const fogU = { uFogColor: { value: BG }, uFogDensity: { value: FOG_DENSITY } };
  const timeU = { value: 0 };
  const C = hex => new THREE.Color(hex);
  const HDR = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
  const UP = new THREE.Vector3(0, 1, 0);

  // environment for metals (dim) + lights
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new M.RoomEnvironment();
  const envTex = pmrem.fromScene(roomEnv, 0.04).texture;
  if (roomEnv.dispose) roomEnv.dispose();
  scene.environment = envTex; scene.environmentIntensity = 0.28;
  pmrem.dispose(); track(envTex);
  scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x06080c, 0.55));
  const moon = new THREE.DirectionalLight(0xc4d8ff, 1.25);
  moon.position.set(-40, 55, -35); scene.add(moon);
  const MOON_DIR = moon.position.clone().normalize();
  const radarLight = new THREE.PointLight(0x38a0ff, 3, 12, 2); radarLight.position.set(0, RADAR_HEAD_Y + 0.8, 0); scene.add(radarLight);
  const siteLight = new THREE.PointLight(0xffb070, 22, 30, 2); siteLight.position.set(-7, 6, 4); scene.add(siteLight);

  const common = `
    uniform vec3 uFogColor; uniform float uFogDensity;
    float fogVis(float d) { return exp(-uFogDensity * uFogDensity * d * d); }
  `;

  /* ---------------- ground / terrain ---------------- */
  const terrainH = (x, z) => {
    const r = Math.hypot(x, z);
    const m = sstep(66, 150, r);
    if (m <= 0) return 0;
    const n = fbm(x * 0.011 + 3.1, z * 0.011 - 1.7);
    const ridge = 1 - Math.abs(fbm(x * 0.021 + 7, z * 0.021 - 3) * 2 - 1);
    return m * (n * 24 + ridge * 7 + 1.5);
  };
  const gGeo = track(new THREE.PlaneGeometry(520, 520, small ? 110 : 170, small ? 110 : 170));
  gGeo.rotateX(-PI / 2); gGeo.translate(0, 0, -50);
  { const pa = gGeo.attributes.position; for (let i = 0; i < pa.count; i++) pa.setY(i, terrainH(pa.getX(i), pa.getZ(i))); gGeo.computeVertexNormals(); }
  const groundU = {
    uBase: { value: BG.clone().multiplyScalar(1.0) },
    uGrid: { value: HDR(0x2f7fd0, 0.42) },
    uRing: { value: HDR(0x38a0ff, 1.0) },
    uSweepC: { value: HDR(0x2ee6d6, 1.0) },
    uWarm: { value: HDR(0xffa860, 1.0) },
    uRed: { value: HDR(0xff4d5e, 1.6) },
    uPadC: { value: HDR(0x38a0ff, 1.0) },
    uSweepA: { value: 0 }, uSweepK: { value: 2.4 }, uSweepI: { value: 1 },
    uTarget: { value: new THREE.Vector3(0, 0, 0) },
    uPad: { value: new THREE.Vector4(PAD[0], PAD[2], PAD_R, 0) },
    uMoon: { value: MOON_DIR }, uTime: timeU, ...fogU,
  };
  const groundMat = track(new THREE.ShaderMaterial({
    uniforms: groundU,
    vertexShader: `varying vec3 vW; varying float vD;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: common + `
      uniform vec3 uBase, uGrid, uRing, uSweepC, uWarm, uRed, uPadC, uMoon;
      uniform float uSweepA, uSweepK, uSweepI, uTime;
      uniform vec3 uTarget; uniform vec4 uPad;
      varying vec3 vW; varying float vD;
      const float TAU = 6.28318530718;
      float gridL(vec2 p, float s, float px){
        vec2 q = p / s; vec2 fw = fwidth(q); vec2 d = abs(fract(q - 0.5) - 0.5);
        vec2 l = 1.0 - smoothstep(fw * px, fw * (px + 1.0), d);
        return max(l.x, l.y) * (1.0 - smoothstep(0.06, 0.3, max(fw.x, fw.y)));
      }
      float lineD(float d, float fw, float w){ return 1.0 - smoothstep(fw * w, fw * (w + 1.2), abs(d)); }
      void main(){
        vec2 xz = vW.xz; float r = length(xz);
        float fwp = length(fwidth(xz));
        vec3 n = cross(dFdx(vW), dFdy(vW)); n /= max(length(n), 1e-7); if (n.y < 0.0) n = -n;
        float diff = max(dot(n, uMoon), 0.0);
        vec3 col = uBase * (0.78 + 1.3 * diff * smoothstep(0.2, 2.0, vW.y + 0.2 * r / 60.0));
        col += uWarm * 0.014 * exp(-length(xz - vec2(-7.0, 4.0)) / 9.0);
        // grid
        float gf = 1.0 - smoothstep(30.0, 90.0, r);
        col += uGrid * (gridL(xz, 2.0, 0.35) * 0.12 + gridL(xz, 10.0, 0.55) * 0.36) * gf;
        // terrain contours
        float hq = vW.y / 1.7; float hfw = fwidth(hq);
        float cont = (1.0 - smoothstep(hfw * 0.5, hfw * 1.6, abs(fract(hq - 0.5) - 0.5))) * (1.0 - smoothstep(0.15, 0.5, hfw));
        col += uGrid * cont * smoothstep(0.5, 2.5, vW.y) * 0.5;
        // range rings (1 km = 10 u) — dashed, outer 5 km ring solid
        float ang = atan(xz.y, xz.x + 1e-5);
        float rq = r / 10.0; float rfw = fwidth(rq);
        float ring = (1.0 - smoothstep(rfw * 0.5, rfw * 1.6, abs(fract(rq - 0.5) - 0.5))) * step(r, 46.0) * step(5.0, r);
        ring *= step(0.38, fract(ang * r / 1.25));
        float outer = lineD(r - 50.0, fwp, 0.8);
        // spokes every 30°
        float sa = TAU / 12.0; float an = floor(ang / sa + 0.5) * sa;
        float spoke = lineD(r * sin(ang - an), fwp, 0.3) * smoothstep(3.0, 6.0, r) * (1.0 - smoothstep(44.0, 50.0, r));
        // sweep (leading edge + fading trail)
        float behind = mod(uSweepA - ang, TAU);
        float trail = exp(-behind * uSweepK);
        float edge = exp(-behind * r * 2.2);
        float rm = smoothstep(1.2, 4.0, r) * (1.0 - smoothstep(47.0, 50.5, r));
        col += uSweepC * (trail * 0.06 + edge * 0.3) * rm * uSweepI;
        col += uRing * (ring * (0.2 + trail * 0.7 * uSweepI) + outer * (0.42 + trail * 0.5) + spoke * 0.06);
        col += uRing * 0.012 * step(r, 50.0);
        // perimeter (PIDS) line around the site
        vec2 pq = abs(xz - vec2(-8.75, 4.25)) - vec2(12.75, 10.75);
        float sd = length(max(pq, 0.0)) + min(max(pq.x, pq.y), 0.0);
        float per = lineD(sd, fwp, 0.5) * (0.55 + 0.45 * step(0.5, fract((xz.x + xz.y) * 0.35 - uTime * 0.3)));
        col += uWarm * per * 0.1;
        // runway
        vec2 rw = vec2(xz.x + 12.0, xz.y - 24.0);
        float inRw = step(abs(rw.x), 34.0) * step(abs(rw.y), 1.8);
        col = mix(col, uBase * 0.6, inRw * 0.85);
        float cl = lineD(rw.y, fwp, 0.5) * step(0.5, fract(rw.x / 2.6)) * step(abs(rw.x), 30.0);
        float th = step(31.3, abs(rw.x)) * step(abs(rw.x), 33.2) * step(0.55, fract(rw.y * 2.4)) * step(abs(rw.y), 1.45);
        col += vec3(0.55, 0.6, 0.66) * (cl * 0.12 + th * 0.08);
        // target ground marker
        vec2 tv = xz - uTarget.xy; float dt = length(tv);
        float tr = lineD(dt - 1.1, fwp, 0.8) + lineD(dt - 1.9, fwp, 0.4) * step(0.5, fract(atan(tv.y, tv.x) * 2.546));
        col += uRed * tr * uTarget.z * 0.5;
        // safe-landing pad
        vec2 pv = xz - uPad.xy; float dp = length(pv);
        float pr = uPad.z;
        float padL = lineD(dp - pr, fwp, 1.0) + lineD(dp - pr * 0.64, fwp, 0.6) * step(0.5, fract(atan(pv.y, pv.x) * 1.909));
        vec2 ap = abs(pv); float cross2 = lineD(min(ap.x, ap.y), fwp, 0.7) * step(dp, pr * 0.42);
        float fill = (1.0 - smoothstep(0.0, pr, dp)) * 0.18;
        col += uPadC * (padL + cross2 * 0.8 + fill) * (0.22 + uPad.w);
        // fog
        float vis = fogVis(vD);
        gl_FragColor = vec4(mix(uFogColor, col, vis), 1.0);
      }`,
  }));
  const ground = new THREE.Mesh(gGeo, groundMat);
  scene.add(ground);

  /* ---------------- sky / horizon glow ---------------- */
  const skyMat = track(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uBg: { value: BG }, uGlow: { value: HDR(0x2a5fae, 0.04) }, uWarm: { value: HDR(0xff9a5a, 0.01) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uBg, uGlow, uWarm; varying vec3 vDir;
      void main(){ float h = vDir.y; float g = exp(-abs(h - 0.02) * 28.0); float w = exp(-abs(h) * 30.0) * smoothstep(-0.2, 0.6, -vDir.z);
        gl_FragColor = vec4(uBg + uGlow * g + uWarm * w, 1.0); }`,
  }));
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(900, 32, 16)), skyMat);
  sky.renderOrder = -10; scene.add(sky);

  /* ---------------- generic glow points ---------------- */
  const pointsVS = `
    attribute float aSize; attribute vec3 aColor; attribute float aBlink;
    uniform float uTime; uniform float uScale; uniform float uMinPx;
    varying vec3 vC; varying float vA;
    ${common}
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      float px = aSize * uScale / max(0.1, -mv.z);
      gl_PointSize = max(px, uMinPx);
      float blink = aBlink > 0.0 ? smoothstep(0.55, 0.9, sin(uTime * aBlink + position.x * 3.1)) : 1.0;
      vA = blink * fogVis(-mv.z) * clamp(px / uMinPx, 0.35, 1.0);
      vC = aColor;
    }`;
  const pointsFS = `varying vec3 vC; varying float vA;
    void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = (1.0 - smoothstep(0.0, 0.5, r)); a *= a;
      float core = (1.0 - smoothstep(0.0, 0.18, r));
      gl_FragColor = vec4(vC * (a * 0.6 + core * 1.4) * vA, 1.0); }`;
  const pointMats = [];
  function makePoints(list) {
    const n = list.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), blink = new Float32Array(n);
    list.forEach((l, i) => { pos.set(l.p, i * 3); col.set([l.c.r, l.c.g, l.c.b], i * 3); size[i] = l.s; blink[i] = l.b || 0; });
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aBlink', new THREE.BufferAttribute(blink, 1));
    const m = track(new THREE.ShaderMaterial({
      uniforms: { uTime: timeU, uScale: { value: 400 }, uMinPx: { value: 1.5 }, ...fogU },
      vertexShader: pointsVS, fragmentShader: pointsFS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    pointMats.push(m);
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    return pts;
  }

  /* ---------------- protected site: buildings, tanks, fence, runway lights ---------------- */
  const rnd = mulberry32(20240917);
  const blds = [];
  for (let gx = -15; gx <= 1.5; gx += 2.9) {
    for (let gz = -1.5; gz <= 12; gz += 2.9) {
      const x = gx + (rnd() - 0.5) * 0.6, z = gz + (rnd() - 0.5) * 0.6;
      if (Math.hypot(x - RADAR[0], z - RADAR[2]) < 4.2) continue;
      if (Math.hypot(x - YUG[0], z - YUG[2]) < 3.2) continue;
      if (rnd() < 0.14) continue;
      const centre = 1 - clamp(Math.hypot(x + 7, z - 5) / 11);
      blds.push({ x, z, w: 1.2 + rnd() * 1.2, d: 1.2 + rnd() * 1.2, h: 0.45 + rnd() * 0.9 + centre * centre * 2.1 * (0.6 + rnd() * 0.8) });
    }
  }
  blds.push({ x: -7, z: 5.2, w: 2.0, d: 2.0, h: 3.6 }, { x: -10, z: 8.3, w: 1.6, d: 1.6, h: 3.0 });
  blds.push({ x: -40, z: 18.6, w: 6, d: 2.6, h: 0.9 }, { x: 6, z: 18.8, w: 4.4, d: 2.4, h: 0.8 }); // hangars by the runway
  const bGeo = track(new THREE.BoxGeometry(1, 1, 1)); bGeo.translate(0, 0.5, 0);
  const bldMat = track(new THREE.ShaderMaterial({
    uniforms: { uBase: { value: C(0x1a2433) }, uWin: { value: HDR(0xffc58a, 1.5) }, uWin2: { value: HDR(0x9cc8ff, 1.1) }, uMoon: { value: MOON_DIR }, uWinAmt: { value: 1 }, uEdge: { value: HDR(0x38a0ff, 0.25) }, ...fogU },
    vertexShader: `varying vec3 vW; varying vec3 vN; varying float vD; varying vec3 vL; varying vec3 vS;
      void main(){
        vec4 p = vec4(position, 1.0); vec3 n = normal;
        #ifdef USE_INSTANCING
          p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
          vS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        #else
          vS = vec3(1.0);
        #endif
        vL = position;
        vec4 w = modelMatrix * p; vW = w.xyz; vN = normalize(mat3(modelMatrix) * n);
        vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: common + `
      uniform vec3 uBase, uWin, uWin2, uMoon, uEdge; uniform float uWinAmt;
      varying vec3 vW; varying vec3 vN; varying float vD; varying vec3 vL; varying vec3 vS;
      float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main(){
        vec3 n = normalize(vN);
        float diff = max(dot(n, uMoon), 0.0);
        vec3 col = uBase * (0.35 + 0.45 * (0.5 + 0.5 * n.y) + 0.9 * diff);
        // roof edge highlight
        if (n.y > 0.5) {
          vec2 e = (0.5 - abs(vL.xz)) * vS.xz;
          float edge = 1.0 - smoothstep(0.0, 0.06, min(e.x, e.y));
          col += uEdge * edge;
        } else {
          vec2 f = vec2(abs(n.x) > 0.5 ? vW.z : vW.x, vW.y);
          vec2 cs = vec2(0.42, 0.36);
          vec2 q = f / cs; vec2 cell = floor(q); vec2 fr = fract(q);
          float win = step(0.22, fr.x) * step(fr.x, 0.78) * step(0.28, fr.y) * step(fr.y, 0.74);
          float lit = step(0.7, h3(vec3(cell, floor(n.x * 2.0 + n.z * 3.0) + floor(vW.x * 0.3))));
          float fw = max(fwidth(q.x), fwidth(q.y));
          float w = mix(win * lit, 0.09, smoothstep(0.35, 0.9, fw));
          float floorMask = step(0.32, vW.y) * step(vW.y, vS.y - 0.12);
          col += mix(uWin, uWin2, step(0.6, h3(vec3(cell.yx, 7.0)))) * w * floorMask * uWinAmt;
        }
        gl_FragColor = vec4(mix(uFogColor, col, fogVis(vD)), 1.0);
      }`,
  }));
  const bMesh = new THREE.InstancedMesh(bGeo, bldMat, blds.length);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  blds.forEach((b, i) => { m4.compose(p3.set(b.x, 0, b.z), q4.identity(), s3.set(b.w, b.h, b.d)); bMesh.setMatrixAt(i, m4); });
  scene.add(bMesh);
  // tanks
  const tanks = [];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) tanks.push({ x: -19.2 + i * 2.7, z: -0.5 + j * 2.7, r: 1.0 + rnd() * 0.2, h: 0.9 + rnd() * 0.4 });
  const tGeo = track(new THREE.CylinderGeometry(1, 1, 1, 28, 1)); tGeo.translate(0, 0.5, 0);
  const tankMat = track(new THREE.MeshStandardMaterial({ color: 0x3a4658, metalness: 0.6, roughness: 0.45 }));
  const tMesh = new THREE.InstancedMesh(tGeo, tankMat, tanks.length);
  tanks.forEach((tk, i) => { m4.compose(p3.set(tk.x, 0, tk.z), q4.identity(), s3.set(tk.r, tk.h, tk.r)); tMesh.setMatrixAt(i, m4); });
  scene.add(tMesh);
  // fence posts along the perimeter
  const posts = [];
  const px0 = -21.5, px1 = 4, pz0 = -6.5, pz1 = 15;
  for (let x = px0; x <= px1; x += 1.25) { posts.push([x, pz0], [x, pz1]); }
  for (let z = pz0 + 1.25; z < pz1; z += 1.25) { posts.push([px0, z], [px1, z]); }
  const fGeo = track(new THREE.BoxGeometry(0.06, 0.7, 0.06)); fGeo.translate(0, 0.35, 0);
  const fMat = track(new THREE.MeshStandardMaterial({ color: 0x4a5668, metalness: 0.5, roughness: 0.5 }));
  const fMesh = new THREE.InstancedMesh(fGeo, fMat, posts.length);
  posts.forEach((pp, i) => { m4.makeTranslation(pp[0], 0, pp[1]); fMesh.setMatrixAt(i, m4); });
  scene.add(fMesh);
  // lights: runway edge lights, approach strobes, aviation reds on tall roofs, fence-top glints
  const lights = [];
  const white = HDR(0xfff1d6, 2.2), blue = HDR(0x5aa8ff, 2.0), red = HDR(0xff3344, 3.2), amber = HDR(0xffb547, 0.8);
  for (let x = -46; x <= 22; x += 2.4) { lights.push({ p: [x, 0.08, 24 - 1.95], c: white, s: 0.16 }, { p: [x, 0.08, 24 + 1.95], c: white, s: 0.16 }); }
  for (let x = -40; x <= 16; x += 4) lights.push({ p: [x, 0.08, 20.5], c: blue, s: 0.14 });
  for (let i = 0; i < 7; i++) lights.push({ p: [22 + 1.6 + i * 1.4, 0.1, 24], c: white, s: 0.22, b: 5.0 + i * 0.001 });
  blds.filter(b => b.h > 2.9).forEach(b => lights.push({ p: [b.x, b.h + 0.08, b.z], c: red, s: 0.3, b: 2.2 }));
  lights.push({ p: [RADAR[0], RADAR_HEAD_Y + 1.55, RADAR[2]], c: red, s: 0.2, b: 2.2 });
  for (let i = 0; i < posts.length; i += 6) lights.push({ p: [posts[i][0], 0.72, posts[i][1]], c: amber, s: 0.08 });
  const siteLights = makePoints(lights);
  scene.add(siteLights);

  /* ---------------- DroneDOOT radar ---------------- */
  const steel = track(new THREE.MeshStandardMaterial({ color: 0x566477, metalness: 0.75, roughness: 0.4 }));
  const darkSteel = track(new THREE.MeshStandardMaterial({ color: 0x1b222c, metalness: 0.55, roughness: 0.55 }));
  const concrete = track(new THREE.MeshStandardMaterial({ color: 0x252d38, metalness: 0.0, roughness: 0.95 }));
  const cylUnit = track(new THREE.CylinderGeometry(1, 1, 1, 6, 1));
  const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vd = new THREE.Vector3();
  function strut(a, b, r) {
    const g = cylUnit.clone();
    _va.fromArray(a); _vb.fromArray(b); _vd.subVectors(_vb, _va);
    const len = _vd.length();
    const m = new THREE.Matrix4().compose(_va.clone().add(_vb).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, _vd.normalize()), new THREE.Vector3(r, len, r));
    g.applyMatrix4(m); return g;
  }
  function boxAt(w, h, d, x, y, z, ry = 0, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, ry, rz))); g.translate(x, y, z); return g; }
  function cylAt(rt, rb, h, x, y, z, seg = 20) { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y, z); return g; }
  const radar = new THREE.Group(); radar.position.fromArray(RADAR); scene.add(radar);
  {
    const trussTop = 3.55, b0 = 0.62, b1 = 0.22;
    const parts = [];
    const legs = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
    legs.forEach(([sx, sz]) => parts.push(strut([sx * b0, 0.28, sz * b0], [sx * b1, trussTop, sz * b1], 0.04)));
    const levels = 5;
    for (let L = 0; L <= levels; L++) {
      const y = 0.28 + (trussTop - 0.28) * (L / levels), w = lerp(b0, b1, L / levels);
      for (let k = 0; k < 4; k++) { const [ax, az] = legs[k], [bx, bz] = legs[(k + 1) % 4]; parts.push(strut([ax * w, y, az * w], [bx * w, y, bz * w], 0.018)); }
      if (L < levels) {
        const y2 = 0.28 + (trussTop - 0.28) * ((L + 1) / levels), w2 = lerp(b0, b1, (L + 1) / levels);
        for (let k = 0; k < 4; k++) { const [ax, az] = legs[k], [bx, bz] = legs[(k + 1) % 4]; parts.push(strut([ax * w, y, az * w], [bx * w2, y2, bz * w2], 0.012)); }
      }
    }
    parts.push(cylAt(0.5, 0.5, 0.1, 0, trussTop + 0.05, 0, 24));
    const mast = new THREE.Mesh(track(M.mergeGeometries(parts)), steel); radar.add(mast);
    const base = new THREE.Mesh(track(M.mergeGeometries([boxAt(2.8, 0.28, 2.8, 0, 0.14, 0), boxAt(1.2, 0.85, 0.9, 1.25, 0.7, 1.05), boxAt(0.5, 0.35, 0.5, -1.0, 0.45, 1.0)])), concrete); radar.add(base);
  }
  // rotating head
  const head = new THREE.Group(); head.position.set(0, 3.62, 0); radar.add(head);
  {
    const ped = new THREE.Mesh(track(M.mergeGeometries([cylAt(0.2, 0.26, 0.34, 0, 0.17, 0), boxAt(0.18, 0.5, 0.9, 0, 0.55, 0), cylAt(0.05, 0.05, 1.0, 0, 0.62, 0)])), darkSteel); head.add(ped);
    const panel = new THREE.Group(); panel.position.set(0.12, 0.72, 0); panel.rotation.z = 0.2; head.add(panel);
    panel.add(new THREE.Mesh(track(M.mergeGeometries([boxAt(0.16, 1.25, 2.1, -0.04, 0, 0), boxAt(0.06, 1.35, 0.08, -0.12, 0, 1.08), boxAt(0.06, 1.35, 0.08, -0.12, 0, -1.08), boxAt(0.1, 0.08, 2.2, -0.1, 0.66, 0), boxAt(0.1, 0.08, 2.2, -0.1, -0.66, 0)])), steel));
    // antenna face (patch array texture)
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
    const cx = cv.getContext('2d'); cx.fillStyle = '#0a1422'; cx.fillRect(0, 0, 256, 160);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 10; j++) { cx.fillStyle = (i + j) % 7 === 0 ? '#5fb8ff' : '#2a6fb4'; cx.fillRect(6 + i * 15.6, 6 + j * 15, 8, 8); }
    const faceTex = track(new THREE.CanvasTexture(cv)); faceTex.colorSpace = THREE.SRGBColorSpace;
    const faceMat = track(new THREE.MeshStandardMaterial({ color: 0x0c1624, emissive: 0xffffff, emissiveMap: faceTex, emissiveIntensity: 0.5, metalness: 0.2, roughness: 0.4 }));
    const face = new THREE.Mesh(track(new THREE.PlaneGeometry(2.0, 1.16)), faceMat);
    face.rotation.y = PI / 2; face.position.x = 0.045; panel.add(face);
  }

  /* ---------------- DroneYUG countermeasure unit ---------------- */
  const yug = new THREE.Group(); yug.position.fromArray(YUG); scene.add(yug);
  yug.add(new THREE.Mesh(track(M.mergeGeometries([boxAt(1.9, 0.22, 1.5, 0, 0.11, 0), boxAt(1.0, 1.25, 0.75, 0, 0.84, 0), cylAt(0.07, 0.09, 1.5, 0, 2.2, 0, 12)])), darkSteel));
  const yugHead = new THREE.Group(); yugHead.position.set(0, YUG_EMIT_Y, 0); yug.add(yugHead);
  yugHead.add(new THREE.Mesh(track(M.mergeGeometries([boxAt(0.08, 0.62, 0.42, 0.24, 0.12, 0), boxAt(0.08, 0.5, 0.36, -0.12, 0.08, 0.21, 2.1), boxAt(0.08, 0.5, 0.36, -0.12, 0.08, -0.21, -2.1), cylAt(0.03, 0.03, 0.7, 0, 0.55, 0, 8)])), steel));
  const yugLedMat = track(new THREE.MeshBasicMaterial({ color: HDR(0xff4455, 2) }));
  const yugLed = new THREE.Mesh(track(new THREE.SphereGeometry(0.06, 12, 8)), yugLedMat); yugLed.position.set(0, 1.2, 0.39); yug.add(yugLed);

  /* ---------------- quadcopter ---------------- */
  const drone = new THREE.Group(); drone.rotation.order = 'YXZ'; scene.add(drone);
  const DRONE_SCALE = 1.15;
  const droneBody = new THREE.Group(); droneBody.scale.setScalar(DRONE_SCALE); drone.add(droneBody);
  const dBodyMat = track(new THREE.MeshStandardMaterial({ color: 0x3a4555, metalness: 0.6, roughness: 0.34 }));
  const dAccMat = track(new THREE.MeshStandardMaterial({ color: 0x8795a8, metalness: 0.8, roughness: 0.28 }));
  const dDarkMat = track(new THREE.MeshStandardMaterial({ color: 0x0e1218, metalness: 0.4, roughness: 0.5 }));
  const motorPts = [[0.42, 0.03, 0.37], [-0.42, 0.03, 0.37], [0.42, 0.03, -0.37], [-0.42, 0.03, -0.37]];
  const props = [];
  const discMat = track(new THREE.MeshBasicMaterial({ color: 0x9fc2ff, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }));
  const bladeMat = track(new THREE.MeshStandardMaterial({ color: 0x151a22, metalness: 0.3, roughness: 0.5, transparent: true, opacity: 0.85 }));
  {
    const bodyParts = [new M.RoundedBoxGeometry(0.38, 0.12, 0.58, 3, 0.045)];
    const accParts = [(() => { const g = new M.RoundedBoxGeometry(0.26, 0.07, 0.36, 2, 0.03); g.translate(0, 0.085, -0.03); return g; })()];
    const darkParts = [];
    motorPts.forEach(([x, y, z]) => {
      bodyParts.push(strut([Math.sign(x) * 0.12, 0.0, Math.sign(z) * 0.16], [x, y - 0.01, z], 0.024));
      bodyParts.push(cylAt(0.055, 0.064, 0.08, x, y + 0.02, z, 18));
      accParts.push(cylAt(0.028, 0.028, 0.03, x, y + 0.075, z, 12));
      darkParts.push(cylAt(0.02, 0.02, 0.07, x, y - 0.05, z, 8));
    });
    [[0.14, 1], [-0.14, -1]].forEach(([x, s]) => {
      darkParts.push(strut([x, -0.05, 0.12], [x + s * 0.05, -0.21, 0.15], 0.011), strut([x, -0.05, -0.12], [x + s * 0.05, -0.21, -0.15], 0.011));
      const skid = new THREE.CylinderGeometry(0.014, 0.014, 0.5, 8); skid.rotateX(PI / 2); skid.translate(x + s * 0.05, -0.215, 0); darkParts.push(skid);
    });
    darkParts.push(boxAt(0.07, 0.05, 0.07, 0, -0.07, 0.21));
    const gimbal = new THREE.SphereGeometry(0.058, 18, 12); gimbal.translate(0, -0.12, 0.23); darkParts.push(gimbal);
    droneBody.add(new THREE.Mesh(track(M.mergeGeometries(bodyParts.map(g => g.index ? g.toNonIndexed() : g).map(g => { g.deleteAttribute('uv'); return g; }))), dBodyMat));
    droneBody.add(new THREE.Mesh(track(M.mergeGeometries(accParts.map(g => g.index ? g.toNonIndexed() : g).map(g => { g.deleteAttribute('uv'); return g; }))), dAccMat));
    droneBody.add(new THREE.Mesh(track(M.mergeGeometries(darkParts.map(g => g.index ? g.toNonIndexed() : g).map(g => { g.deleteAttribute('uv'); return g; }))), dDarkMat));
    const lens = new THREE.Mesh(track(new THREE.SphereGeometry(0.022, 12, 8)), track(new THREE.MeshBasicMaterial({ color: HDR(0x2ee6d6, 1.6) }))); lens.position.set(0, -0.12, 0.284); droneBody.add(lens);
    // props: translucent motion disc + blades
    const discGeo = track(new THREE.CircleGeometry(0.25, 40)); discGeo.rotateX(-PI / 2);
    const bladeGeo = track(M.mergeGeometries([boxAt(0.48, 0.006, 0.038, 0, 0, 0, 0, 0.06), boxAt(0.1, 0.02, 0.1, 0, 0, 0)].map(g => { g.deleteAttribute('uv'); return g; })));
    motorPts.forEach(([x, y, z], i) => {
      const g = new THREE.Group(); g.position.set(x, y + 0.1, z);
      const disc = new THREE.Mesh(discGeo, discMat); disc.renderOrder = 2; g.add(disc);
      const blades = new THREE.Mesh(bladeGeo, bladeMat); g.add(blades);
      droneBody.add(g); props.push({ blades, dir: i === 0 || i === 3 ? 1 : -1, a: i * 0.7 });
    });
  }
  const ledGeo = track(new THREE.SphereGeometry(0.02, 12, 8));
  const mkLed = (hex, x, y, z) => { const m = track(new THREE.MeshBasicMaterial({ color: HDR(hex, 2.2) })); const l = new THREE.Mesh(ledGeo, m); l.position.set(x, y, z); droneBody.add(l); return { m, base: HDR(hex, 2.2) }; };
  const leds = [
    mkLed(0xff2a3a, 0.42, -0.02, 0.37), // port (red)
    mkLed(0x2bff88, -0.42, -0.02, 0.37), // starboard (green)
    mkLed(0xffffff, 0.42, -0.02, -0.37), mkLed(0xffffff, -0.42, -0.02, -0.37), // rear strobes
  ];
  const AMBER = HDR(0xffa21a, 2.6);
  const rim = new THREE.PointLight(0x5aa8ff, 6, 8, 2); rim.position.set(0, 2, -2.2); drone.add(rim);

  // far-distance glow so the drone reads as a "dot" at range
  const glowMat = track(new THREE.ShaderMaterial({
    uniforms: { uColor: { value: HDR(0xdfe8ff, 1) }, uSize: { value: 26 }, uI: { value: 0 } },
    vertexShader: `uniform float uSize; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; void main(){ float r = length(gl_PointCoord - 0.5); float a = pow(max((1.0 - smoothstep(0.0, 0.5, r)), 0.0), 2.4); float c = (1.0 - smoothstep(0.0, 0.12, r)); gl_FragColor = vec4(uColor * (a * 0.8 + c * 1.5) * uI, 1.0); }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  }));
  const glowGeo = track(new THREE.BufferGeometry()); glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const glow = new THREE.Points(glowGeo, glowMat); glow.frustumCulled = false; glow.renderOrder = 5; scene.add(glow);

  /* ---------------- radar sweep volume (vertical fins) ---------------- */
  {
    // built below with shared material
  }
  const finMat = track(new THREE.ShaderMaterial({
    uniforms: { uColor: { value: HDR(0x2ee6d6, 1) }, uI: { value: 1 }, uTime: timeU, ...fogU },
    vertexShader: `attribute float aI; varying vec2 vUv; varying float vD; varying float vI;
      void main(){ vUv = uv; vI = aI; vec4 mv = modelViewMatrix * vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: common + `uniform vec3 uColor; uniform float uI, uTime; varying vec2 vUv; varying float vD; varying float vI;
      void main(){ float u = vUv.x, v = vUv.y;
        float a = smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.78, 1.0, u)) * pow(clamp(1.0 - v, 0.0, 1.0), 1.4) * smoothstep(0.0, 0.1, v);
        a *= 0.7 + 0.3 * sin(u * 80.0 - uTime * 6.0);
        gl_FragColor = vec4(uColor * a * vI * uI * 0.11 * (0.35 + 0.65 * fogVis(vD)), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const finGeo = (() => {
    const NR = 40, NE = 6, fins = [[0, 1], [-0.03, 0.55], [-0.065, 0.3], [-0.11, 0.14]];
    const R0 = 0.8, R1 = 50, E0 = -0.05, E1 = 0.24;
    const pos = [], uv = [], aI = [], idx = [];
    let base = 0;
    fins.forEach(([off, inten]) => {
      for (let j = 0; j <= NE; j++) for (let i = 0; i <= NR; i++) {
        const r = lerp(R0, R1, i / NR), e = lerp(E0, E1, j / NE);
        const hx = r * Math.cos(e), hy = r * Math.sin(e);
        pos.push(hx * Math.cos(off), hy, hx * Math.sin(off)); uv.push(i / NR, j / NE); aI.push(inten);
      }
      for (let j = 0; j < NE; j++) for (let i = 0; i < NR; i++) {
        const a = base + j * (NR + 1) + i, b = a + 1, c = a + NR + 1, d = c + 1;
        idx.push(a, b, d, a, d, c);
      }
      base += (NR + 1) * (NE + 1);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aI', new THREE.Float32BufferAttribute(aI, 1));
    g.setIndex(idx); return track(g);
  })();
  const fins = new THREE.Mesh(finGeo, finMat); fins.position.set(RADAR[0], RADAR_HEAD_Y + 0.4, RADAR[2]); fins.renderOrder = 3; fins.frustumCulled = false; scene.add(fins);

  /* ---------------- tracking beam radar → drone ---------------- */
  const beamGeo = track(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true)); beamGeo.translate(0, 0.5, 0);
  const beamU = { uColor: { value: HDR(0x5cc8ff, 1) }, uI: { value: 0 }, uLen: { value: 1 }, uTime: timeU, uGrow: { value: 1 } };
  const beamFS = common + `uniform vec3 uColor; uniform float uI, uLen, uTime, uGrow; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vD;
    void main(){ float f = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0); float core = f * f * sqrt(f);
      float y = vUv.y; if (y > uGrow) discard;
      float pulse = 0.55 + 0.45 * (1.0 - smoothstep(0.0, 0.35, abs(fract(y * uLen / 4.0 - uTime * 1.4) - 0.5)));
      float ends = smoothstep(0.0, 0.02, y) * (1.0 - smoothstep(uGrow - 0.02, uGrow, y) * 0.3);
      gl_FragColor = vec4(uColor * core * pulse * ends * uI * (0.4 + 0.6 * fogVis(vD)), 1.0); }`;
  const beamVS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vD;
    void main(){ vUv = uv; vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; vD = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const beamCoreMat = track(new THREE.ShaderMaterial({ uniforms: beamU, vertexShader: beamVS, fragmentShader: beamFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const beamGlowU = { ...beamU, uI: { value: 0 }, uColor: { value: HDR(0x2e8fff, 1) } };
  const beamGlowMat = track(new THREE.ShaderMaterial({ uniforms: beamGlowU, vertexShader: beamVS, fragmentShader: beamFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const beamCore = new THREE.Mesh(beamGeo, beamCoreMat), beamGlow = new THREE.Mesh(beamGeo, beamGlowMat);
  beamCore.frustumCulled = beamGlow.frustumCulled = false; beamCore.renderOrder = beamGlow.renderOrder = 4;
  scene.add(beamCore, beamGlow);
  const BEAM_FROM = new THREE.Vector3(RADAR[0], RADAR_HEAD_Y + 0.35, RADAR[2]);

  /* ---------------- DroneYUG jamming: pulse rings along a faint cone ---------------- */
  const YUG_EMIT = new THREE.Vector3(YUG[0], YUG_EMIT_Y + 0.25, YUG[2]);
  const shellVS = `varying vec3 vW; varying vec3 vN; varying float vD;
    void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const RINGS = 7, JAM_HALF_ANGLE = 0.16;
  const ringGeo = track(new THREE.RingGeometry(0.9, 1.0, 72, 1));
  const rings = [];
  const ringCol = HDR(0xff5a4a, 1.6);
  for (let i = 0; i < RINGS; i++) {
    const m = track(new THREE.MeshBasicMaterial({ color: ringCol.clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const mesh = new THREE.Mesh(ringGeo, m); mesh.visible = false; mesh.renderOrder = 4; mesh.frustumCulled = false;
    scene.add(mesh); rings.push({ mesh, m });
  }
  const coneGeo = track(new THREE.CylinderGeometry(0, 1, 1, 48, 1, true)); coneGeo.translate(0, -0.5, 0); // apex at origin, base at y = -1
  const coneU = { uColor: { value: HDR(0xff4a3a, 1) }, uI: { value: 0 }, uTime: timeU };
  const coneMat = track(new THREE.ShaderMaterial({
    uniforms: coneU,
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI, uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float f = clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
        float along = 1.0 - vUv.y; // 0 at the emitter, 1 at the drone
        float flow = 0.5 + 0.5 * sin(along * 46.0 - uTime * 9.0);
        float a = (0.25 + f * f * 0.75) * (0.35 + 0.65 * flow) * smoothstep(0.0, 0.12, along) * (1.0 - smoothstep(0.85, 1.0, along));
        gl_FragColor = vec4(uColor * a * uI * 0.16, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const jamCone = new THREE.Mesh(coneGeo, coneMat); jamCone.visible = false; jamCone.renderOrder = 3; jamCone.frustumCulled = false; scene.add(jamCone);
  const DOWN = new THREE.Vector3(0, -1, 0), ZAX = new THREE.Vector3(0, 0, 1);
  // EW "hit" shimmer around the drone
  const ewU = { uColor: { value: HDR(0xffa21a, 1) }, uI: { value: 0 }, uTime: timeU, ...fogU };
  const ewMat = track(new THREE.ShaderMaterial({
    uniforms: ewU,
    vertexShader: shellVS,
    fragmentShader: common + `uniform vec3 uColor; uniform float uI, uTime; varying vec3 vW; varying vec3 vN; varying float vD;
      void main(){ vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW); float fres = pow(clamp(1.0 - abs(dot(n, v)), 0.0, 1.0), 3.0);
        float s = 0.5 + 0.5 * sin(vW.y * 38.0 + uTime * 22.0) * sin(vW.x * 23.0 - uTime * 13.0);
        gl_FragColor = vec4(uColor * fres * (0.35 + 0.65 * s) * uI, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const ewShell = new THREE.Mesh(track(new THREE.SphereGeometry(1, 32, 16)), ewMat); ewShell.scale.setScalar(1.3); ewShell.visible = false; scene.add(ewShell);

  /* ---------------- landing pad light column + corner lights ---------------- */
  const colGeo = track(new THREE.CylinderGeometry(PAD_R, PAD_R, 7, 40, 1, true)); colGeo.translate(0, 3.5, 0);
  const colU = { uColor: { value: HDR(0x3ddc97, 1) }, uI: { value: 0 }, uTime: timeU };
  const colMat = track(new THREE.ShaderMaterial({
    uniforms: colU,
    vertexShader: beamVS,
    fragmentShader: `uniform vec3 uColor; uniform float uI, uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float f = clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0); float a = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 2.2) * (0.25 + f * 0.75);
        a *= 0.75 + 0.25 * sin(vUv.y * 30.0 - uTime * 3.0);
        gl_FragColor = vec4(uColor * a * uI * 0.35, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const padCol = new THREE.Mesh(colGeo, colMat); padCol.position.set(PAD[0], 0, PAD[2]); padCol.visible = false; scene.add(padCol);
  const padLightsList = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; padLightsList.push({ p: [PAD[0] + Math.cos(a) * (PAD_R + 0.25), 0.07, PAD[2] + Math.sin(a) * (PAD_R + 0.25)], c: HDR(0xffffff, 1), s: 0.16 }); }
  const padLights = makePoints(padLightsList); scene.add(padLights);
  const padLightCol = padLights.geometry.attributes.aColor;

  /* ---------------- range labels ---------------- */
  const labelSprites = [];
  function labelTex(text) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const cx = cv.getContext('2d');
    cx.font = '500 34px "JetBrains Mono", ui-monospace, monospace'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillStyle = 'rgba(120,190,255,0.95)'; cx.fillText(text, 128, 34);
    const t = track(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  for (let k = 1; k <= 5; k++) {
    const mat = track(new THREE.SpriteMaterial({ map: labelTex(k + ' KM'), transparent: true, depthWrite: false, opacity: k === 5 ? 0.9 : 0.6, fog: true }));
    const sp = new THREE.Sprite(mat); sp.scale.set(k === 5 ? 3.6 : 2.8, k === 5 ? 0.9 : 0.7, 1);
    const a = -PI / 2 - 0.12; sp.position.set(Math.cos(a) * k * 10, 0.5, Math.sin(a) * k * 10);
    scene.add(sp); labelSprites.push({ sp, mat, k });
  }
  if (document.fonts && document.fonts.load) {
    document.fonts.load('500 34px "JetBrains Mono"').then(() => labelSprites.forEach(l => { const old = l.mat.map; l.mat.map = labelTex(l.k + ' KM'); l.mat.needsUpdate = true; old.dispose(); })).catch(() => {});
  }

  /* ---------------- atmosphere: dust + stars ---------------- */
  let starMat = null;
  {
    const n = small ? 420 : 1200;
    const pos = new Float32Array(n * 3), ph = new Float32Array(n);
    const r2 = mulberry32(99);
    for (let i = 0; i < n; i++) { pos[i * 3] = -70 + r2() * 140; pos[i * 3 + 1] = 0.3 + Math.pow(r2(), 1.6) * 26; pos[i * 3 + 2] = -80 + r2() * 130; ph[i] = r2() * TAU; }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const m = track(new THREE.ShaderMaterial({
      uniforms: { uTime: timeU, uScale: { value: 400 }, uColor: { value: HDR(0x9cc8ff, 0.5) }, ...fogU },
      vertexShader: common + `attribute float aPh; uniform float uTime; uniform float uScale; varying float vA;
        void main(){ vec3 p = position; p.x += sin(uTime * 0.07 + aPh) * 1.6; p.y += sin(uTime * 0.11 + aPh * 2.0) * 0.6; p.z += cos(uTime * 0.05 + aPh) * 1.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          float d = -mv.z; gl_PointSize = clamp(0.07 * uScale / max(d, 0.1), 1.0, 5.0);
          vA = smoothstep(1.5, 6.0, d) * fogVis(d) * (0.55 + 0.45 * sin(uTime * 0.8 + aPh * 5.0)); }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uColor * (1.0 - smoothstep(0.0, 0.5, r)) * vA, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const dust = new THREE.Points(g, m); dust.frustumCulled = false; scene.add(dust); pointMats.push(m);
  }
  {
    const n = small ? 500 : 1100;
    const pos = new Float32Array(n * 3), ph = new Float32Array(n);
    const r3 = mulberry32(7);
    for (let i = 0; i < n; i++) {
      const th = r3() * TAU, y = 0.08 + Math.pow(r3(), 0.8) * 0.92, rr = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(th) * rr * 800; pos[i * 3 + 1] = y * 800; pos[i * 3 + 2] = Math.sin(th) * rr * 800; ph[i] = r3();
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const m = track(new THREE.ShaderMaterial({
      uniforms: { uTime: timeU, uDpr: { value: dpr } },
      vertexShader: `attribute float aPh; uniform float uTime; uniform float uDpr; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = (aPh > 0.93 ? 2.4 : 1.4) * uDpr; float h = normalize(position).y;
          vA = (0.25 + 0.75 * aPh) * smoothstep(0.06, 0.3, h) * (0.7 + 0.3 * sin(uTime * (1.0 + aPh * 3.0) + aPh * 40.0)); }`,
      fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.75, 0.84, 1.0) * (1.0 - smoothstep(0.1, 0.5, r)) * vA * 0.5, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const stars = new THREE.Points(g, m); stars.frustumCulled = false; stars.renderOrder = -5; scene.add(stars);
    starMat = m;
  }

  /* ---------------- post-processing ---------------- */
  const size = { w: 1, h: 1 };
  // MSAA only where it is affordable: hi-DPI screens are already dense enough
  let samples = small || dpr >= 1.5 ? 0 : 4;
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples });
  const composer = new M.EffectComposer(renderer, rt);
  composer.addPass(new M.RenderPass(scene, camera));
  const bloom = new M.UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.5, 0.8);
  const bloomScale = small ? 0.5 : 0.75;
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => bloomSetSize(Math.max(2, Math.round(w * bloomScale)), Math.max(2, Math.round(h * bloomScale)));
  composer.addPass(bloom);
  composer.addPass(new M.OutputPass());

  function resize(w, h) {
    size.w = Math.max(1, w); size.h = Math.max(1, h);
    renderer.setPixelRatio(dpr); renderer.setSize(size.w, size.h, false);
    composer.setPixelRatio(dpr); composer.setSize(size.w, size.h);
    camera.aspect = size.w / size.h;
    pointMats.forEach(m => { if (m.uniforms.uMinPx) m.uniforms.uMinPx.value = 1.6 * dpr; });
    starMat.uniforms.uDpr.value = dpr;
  }

  /* ---------------- per-frame update ---------------- */
  const vCam = new THREE.Vector3(), vLook = new THREE.Vector3(), vDrone = new THREE.Vector3(), vTmp = new THREE.Vector3(), vDir = new THREE.Vector3();
  const qTmp = new THREE.Quaternion();
  const padColA = HDR(0x38a0ff, 1), padColB = HDR(0x3ddc97, 1.3);
  const view = { w: 1, h: 1, drone: { x: 0, y: 0, r: 0, on: false }, radar: { x: 0, y: 0, on: false }, yug: { x: 0, y: 0, on: false }, pad: { x: 0, y: 0, on: false } };
  const anchorRadar = new THREE.Vector3(RADAR[0], RADAR_HEAD_Y + 2.0, RADAR[2]);
  const anchorYug = new THREE.Vector3(YUG[0], 0.05, YUG[2]);
  const anchorPad = new THREE.Vector3(PAD[0] + PAD_R * 0.7, 0.2, PAD[2]);
  let propAngle = 0;

  function project(v3, out) {
    vTmp.copy(v3).project(camera);
    out.on = vTmp.z < 1 && vTmp.z > -1 && Math.abs(vTmp.x) < 1.3 && Math.abs(vTmp.y) < 1.3;
    out.x = (vTmp.x * 0.5 + 0.5) * size.w; out.y = (-vTmp.y * 0.5 + 0.5) * size.h;
    return out;
  }

  function update(s, t, dt) {
    timeU.value = t;
    const p = s.p;
    // ---- camera ----
    const aspect = size.w / size.h;
    const portrait = clamp((1.25 - aspect) / 0.75);
    vCam.fromArray(s.cam); vLook.fromArray(s.look);
    if (portrait > 0) {
      // tall screens: aim at the portrait subject, step back and widen a little
      vTmp.fromArray(s.lookM); vLook.lerp(vTmp, portrait);
      const back = 1 + 0.42 * portrait * (1 - 0.6 * s.close);
      vTmp.subVectors(vCam, vLook).multiplyScalar(back);
      vCam.copy(vLook).add(vTmp);
    }
    camera.position.copy(vCam); camera.lookAt(vLook);
    camera.fov = Math.min(70, s.fov * (1 + 0.5 * portrait));
    const sx = s.sx * (1 - portrait), sy = s.dy * (1 - portrait) + s.sy * portrait;
    camera.setViewOffset(size.w, size.h, -sx * size.w, sy * size.h, size.w, size.h);
    camera.updateProjectionMatrix();
    const pxScale = (size.h * dpr) / (2 * Math.tan((camera.fov * PI) / 360));
    pointMats.forEach(m => { if (m.uniforms.uScale) m.uniforms.uScale.value = pxScale; });

    // ---- drone ----
    const vis = sstep(0.1, 0.16, p);
    drone.visible = vis > 0.001;
    drone.position.fromArray(s.drone);
    drone.rotation.set(s.pitch, s.yaw, s.roll);
    const spin = lerp(1, 0, s.landed) * (1 - 0.25 * s.jam);
    propAngle += dt * 62 * spin;
    props.forEach(pr => { pr.blades.rotation.y = pr.a + propAngle * pr.dir; });
    bladeMat.opacity = lerp(1, 0.55, spin);
    discMat.opacity = 0.065 * spin;
    // LEDs: nav colours → amber when jammed → dim once landed
    const blinkNav = 0.65 + 0.35 * Math.sin(t * 5.2);
    const strobe = (t % 1.15) < 0.06 || ((t % 1.15) > 0.14 && (t % 1.15) < 0.2) ? 1.6 : 0.05;
    const amberBlink = 0.5 + 0.5 * Math.sin(t * 9);
    const amb = 0.4 + 0.6 * amberBlink, wA = Math.max(s.jam, s.landed);
    leds.forEach((L, i) => {
      const k = i < 2 ? blinkNav : strobe;
      L.m.color.setRGB(lerp(L.base.r * k, AMBER.r * amb, wA), lerp(L.base.g * k, AMBER.g * amb, wA), lerp(L.base.b * k, AMBER.b * amb, wA));
      if (s.landed > 0) L.m.color.multiplyScalar(1 - 0.75 * s.landed);
    });
    // glow sprite
    vDrone.fromArray(s.drone);
    glow.position.copy(vDrone);
    const camDist = camera.position.distanceTo(vDrone);
    const far = sstep(8, 30, camDist);
    const hot = s.lock;
    glowMat.uniforms.uColor.value.setRGB(lerp(0.85, 1.0, hot), lerp(0.9, 0.3, hot * (1 - s.jam)), lerp(1.0, 0.35, hot));
    if (s.jam > 0) glowMat.uniforms.uColor.value.lerp(AMBER, s.jam * 0.6);
    if (s.landed > 0) glowMat.uniforms.uColor.value.lerp(padColB, s.landed);
    glowMat.uniforms.uI.value = vis * far * (0.45 + 1.1 * s.paint + 0.5 * hot) * (1 - 0.6 * s.landed);
    glowMat.uniforms.uSize.value = (small ? 20 : 28) * dpr;

    // ---- radar ----
    head.rotation.y = -s.sweep;
    groundU.uSweepA.value = s.sweep;
    groundU.uSweepK.value = lerp(2.4, 26, s.track);
    groundU.uSweepI.value = lerp(1, 0.55, s.track);
    fins.rotation.y = -s.sweep;
    finMat.uniforms.uI.value = 1 - 0.85 * s.track;
    groundU.uTarget.value.set(s.droneBase[0], s.droneBase[2], s.lock * (1 - s.landed));

    // ---- tracking beam ----
    const beamI = s.track * (1 - 0.6 * s.landed) * sstep(TL.lock, TL.lock + 0.012, p);
    beamCore.visible = beamGlow.visible = beamI > 0.001;
    if (beamCore.visible) {
      vDir.subVectors(vDrone, BEAM_FROM);
      const len = vDir.length();
      vDir.divideScalar(len);
      qTmp.setFromUnitVectors(UP, vDir);
      beamCore.position.copy(BEAM_FROM); beamGlow.position.copy(BEAM_FROM);
      beamCore.quaternion.copy(qTmp); beamGlow.quaternion.copy(qTmp);
      beamCore.scale.set(0.035, len, 0.035); beamGlow.scale.set(0.2, len, 0.2);
      beamU.uLen.value = len;
      const grow = EASE.o(range(p, TL.lock, TL.lock + 0.025));
      beamU.uGrow.value = grow; beamGlowU.uGrow.value = grow;
      beamU.uI.value = 1.9 * beamI; beamGlowU.uI.value = 0.35 * beamI;
      beamU.uColor.value.setRGB(lerp(0.36, 1.0, s.jam), lerp(0.78, 0.62, s.jam), lerp(1.0, 0.1, s.jam));
    }

    // ---- DroneYUG jamming ----
    const jamI = sstep(TL.jamA, TL.jamA + 0.02, p) * (1 - sstep(TL.land - 0.02, TL.land + 0.01, p));
    vDir.subVectors(vDrone, YUG_EMIT); const dJ = vDir.length(); vDir.normalize();
    yugHead.rotation.y = lerp(0, Math.atan2(-vDir.z, vDir.x), sstep(0.72, 0.76, p));
    yugLedMat.color.setRGB(3 * (0.3 + 0.7 * (jamI > 0 ? amberBlink : 0.4)), 0.25, 0.3);
    jamCone.visible = jamI > 0.001;
    rings.forEach(R => { R.mesh.visible = jamI > 0.001; });
    if (jamI > 0.001) {
      const len = dJ * 1.04, tanA = Math.tan(JAM_HALF_ANGLE);
      jamCone.position.copy(YUG_EMIT);
      jamCone.quaternion.setFromUnitVectors(DOWN, vDir);
      jamCone.scale.set(len * tanA, len, len * tanA);
      coneU.uI.value = jamI;
      qTmp.setFromUnitVectors(ZAX, vDir);
      const period = 1.5;
      rings.forEach((R, i) => {
        const ph = ((t / period) + i / RINGS) % 1;
        const d = 0.6 + ph * (dJ + 0.4);
        R.mesh.position.copy(YUG_EMIT).addScaledVector(vDir, d);
        R.mesh.quaternion.copy(qTmp);
        R.mesh.scale.setScalar(Math.max(0.05, d * tanA * 1.05));
        R.m.opacity = jamI * 0.55 * sstep(0, 0.12, ph) * (1 - sstep(0.7, 1, ph));
      });
    }
    const hit = sstep(TL.jam - 0.015, TL.jam, p) * (1 - sstep(TL.landA, TL.land - 0.01, p));
    ewShell.visible = hit > 0.001;
    ewShell.position.copy(vDrone);
    ewU.uI.value = hit * (0.6 + 0.4 * amberBlink);

    // ---- landing pad ----
    const padOn = sstep(TL.spoof - 0.01, TL.landA + 0.01, p);
    groundU.uPadC.value.copy(padColA).lerp(padColB, padOn);
    groundU.uPad.value.w = padOn * (0.8 + 0.2 * Math.sin(t * 4)) + s.landed * 0.4;
    padCol.visible = padOn > 0.001;
    colU.uI.value = padOn * (1 - 0.5 * s.landed);
    const pc = padOn > 0 ? padColB : padColA;
    for (let i = 0; i < 8; i++) {
      const chase = s.landed > 0.5 ? 1 : 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 6 - i * 0.8), 3);
      const k = lerp(0.35, 1.6 * chase, padOn);
      padLightCol.setXYZ(i, pc.r * k, pc.g * k, pc.b * k);
    }
    padLightCol.needsUpdate = true;

    // ---- overlays: projected anchors ----
    view.w = size.w; view.h = size.h;
    project(vDrone, view.drone);
    view.drone.r = (0.85 / Math.max(0.5, camDist)) * (size.h / (2 * Math.tan((camera.fov * PI) / 360)));
    project(anchorRadar, view.radar);
    project(anchorYug, view.yug);
    project(anchorPad, view.pad);
  }

  function render() { composer.render(); }
  // step quality down when frames are consistently slow: MSAA first, then resolution
  function degrade() {
    if (samples > 0) {
      samples = 0;
      [composer.renderTarget1, composer.renderTarget2].forEach(t => { t.samples = 0; t.dispose(); });
      return true;
    }
    if (dpr > 1.01) { dpr = Math.max(1, dpr - 0.25); resize(size.w, size.h); return true; }
    return false;
  }
  function dispose() {
    disposables.forEach(o => o.dispose && o.dispose());
    rt.dispose(); composer.renderTarget2 && composer.renderTarget2.dispose();
    bloom.dispose && bloom.dispose();
    renderer.dispose();
  }
  return { renderer, scene, camera, composer, bloom, update, render, resize, dispose, view, degrade, get dpr() { return dpr; } };
}

/* =====================================================================
   BOOT
   ===================================================================== */
(function boot() {
  if (!story || MODE === 'none') {
    // stacked layout: show a filled spectrogram, animate it gently only when visible
    const ui = story && createUI();
    if (ui) { ui.clear(); ui.staticFill(); }
    return;
  }
  const ui = createUI();
  const canvas = document.getElementById('storyCanvas');
  let world = null, raf = 0, running = false, visible = true, last = 0, t = 0, frames = 0, slowAcc = 0, slowN = 0, failed = false, prevNow = 0, degradeSteps = 0;
  const pState = { v: 0 };
  let p = 0;
  const small = () => window.innerWidth < 760;

  measure();
  p = MODE === '3d' ? targetP() : 0;

  function fail(err) {
    if (failed) return; failed = true;
    if (err) console.warn('[story] 3D disabled:', err && err.message ? err.message : err);
    stop();
    try { world && world.dispose(); } catch (e) { /* ignore */ }
    world = null;
    ui.clear(); ui.staticFill();
    story.classList.remove('is-live');
    if (window.__storyFail) window.__storyFail();
    else { root.classList.remove('story-3d', 'story-static'); root.classList.add('no-3d'); }
  }
  window.__storyTeardown = () => { if (!failed) { failed = true; stop(); try { world && world.dispose(); } catch (e) {} world = null; ui.clear(); ui.staticFill(); } };

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now; t += dt;
    const target = targetP();
    p = smoothDamp(p, target, pState, 0.32, dt);
    if (Math.abs(p - target) < 1e-5) { p = target; pState.v = 0; }
    p = clamp(p);
    simulate(p, t, dt, { reduced: false });
    if (world) {
      try { world.update(sim, t, dt); world.render(); }
      catch (e) { fail(e); return; }
      // adaptive quality: ignore throttled/hitched frames, degrade if we sit under ~45 fps
      const rawDt = (now - prevNow) / 1000; prevNow = now;
      if (rawDt > 0 && rawDt < 0.5) { slowAcc += rawDt; slowN++; }
      if (slowN >= 45) {
        const avg = slowAcc / slowN; slowAcc = 0; slowN = 0;
        if (avg > 0.024 && degradeSteps < 5 && world.degrade()) degradeSteps++;
      }
      if (frames++ === 1) story.classList.add('is-live');
    }
    ui.update(p, t, dt, world ? world.view : null);
  }
  function start() {
    if (running || failed || MODE !== '3d') return;
    running = true; last = 0;
    // snap after being off-screen so we don't replay a long catch-up
    const target = targetP(); if (Math.abs(target - p) > 0.08) { p = target; pState.v = 0; }
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  // pause when off-screen / tab hidden
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && !document.hidden) start(); else stop(); }, { rootMargin: '80px 0px' }).observe(story);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (visible) start(); });

  let rsz = 0;
  const onResize = () => {
    cancelAnimationFrame(rsz);
    rsz = requestAnimationFrame(() => {
      measure();
      if (world) {
        world.resize(canvas.clientWidth, canvas.clientHeight);
        if (MODE === 'static') renderStatic();
      }
    });
  };
  window.addEventListener('resize', onResize);
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(stageEl);
  window.addEventListener('load', measure);

  function renderStatic() {
    const P = 0.465;
    simulate(P, 0, 0, { reduced: true, forceTrack: true });
    world.update(sim, 2.0, 0);
    world.render();
    ui.update(P, 0, 0, world.view, true);
    story.classList.add('is-live');
  }

  if (MODE === '3d') { ui.update(p, 0, 0, null); start(); }
  else { ui.clear(); ui.staticFill(); }

  loadThree().then(M => {
    if (failed) return;
    try {
      world = buildWorld(M, canvas, { small: small() });
      world.resize(canvas.clientWidth || stageEl.clientWidth, canvas.clientHeight || stageEl.clientHeight);
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail(new Error('WebGL context lost')); });
      window.__storyReady = true;
      if (MODE === 'static') renderStatic();
      else if (!running) { simulate(p, t, 0, { reduced: false, forceTrack: true }); world.update(sim, t, 0); world.render(); story.classList.add('is-live'); }
    } catch (e) { fail(e); }
  }).catch(fail);
})();
