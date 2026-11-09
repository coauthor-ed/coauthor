/** SimIsoSpec.js
 * SimIsoSpec - the pure, renderer-free half of SimIso (recipe R12): projection, light bands, rings,
 * extrude, the solid cache, footprints, flat-face offsets, the exploded-view controller, plus the
 * scene helpers both renderers share (fitTurning, dropIn, cuboid, depthSort, faceOf, pickFace).
 * SimIso.js (canvas) re-exports the original part; SimIsoSvg.js (SVG) builds on all of it.
 * Adapted from (MIT; full notices in THIRD_PARTY.md beside the kit LICENSE):
 *   Adapted from anatomy@e6600ff kit/iso-kit.mjs (MIT, (c) 2026 Ryan)
 *   Adapted from anatomy@e6600ff kit/lathe.mjs (MIT, (c) 2026 Ryan)
 *   Adapted from anatomy@e6600ff examples/raptor-engine/live.js (MIT, (c) 2026 Ryan)
 *   Adapted from huashu-art-motion@64cb272 scripts/engine/lib/toon.js (MIT, (c) 2026 alchaincyf)
 *   Original code: isoDelta, boxRing, prismRing, solidOf (cache), footprint, flatOffsets, LADDER_STEPS,
 *   fitTurning, dropIn, dropEnd, cuboid, centreOf, depthSort, faceOf, pickFace.
 *
 * Camera: AZIMUTH, ELEVATION, camera(P), iso(p, P), isoDelta(d, P), towardViewer(P), depthOf(p, P),
 *   fit(points, o), fitTurning(points, o) -> (azimuth) => P (one scale for every azimuth, pivot fixed).
 * Light: BANDS, SHADES, lightOf, bandOf, toneOf; LADDER_STEPS (band -> darken < 0 / lighten > 0 amount;
 *   the canvas toneLadder and the SVG ladderCss both read it), RIM (the crease rim look).
 * Geometry: boxRing, prismRing, convexHull, runsOf, extrude, solidOf, solidCacheSize, footprint, flatOffsets.
 * Motion: EXPLODE, explode(order, o); dropIn(t, k, o) -> { lift 1..0, alpha }, dropEnd(n, o) -> seconds.
 * Scenes of blocks: an item is { id, ring, z, h, offset = [0, 0, 0] } (plus whatever a renderer reads).
 *   cuboid(nx, ny, nz, o) -> unit-cube items (id 'c<i>-<j>-<k>', i along x, j along y, k up; o.size, o.gap, o.at)
 *   centreOf(item) -> world centre with its offset; depthSort(items, P) -> a sorted copy (back to front)
 *   faceOf(solid, face) -> screen pts at the origin ('top' or 'side-<edge>'; null when it faces away)
 *   pickFace(items, P, x, y) -> { item, id, face, band } | null   the front-most face under a stage point
 * Box faces (boxRing): side-0 at y (min), side-1 at x + w, side-2 at y + d, side-3 at x.
 */
import { springStep, spring, reducedMotion } from './SimAnim.js';
import { ZONES } from './SimLook.js';

export const AZIMUTH = 45;
export const ELEVATION = 30;
export const SHADES = 4;
/** Band thresholds on n . light (anatomy lathe.mjs:5, calibrated: about 3% luminance apart). */
export const BANDS = [0, 0.2, 0.42, 0.62];
const RADIANS = Math.PI / 180;
const UNIT = Math.sqrt(1.6);
const LIGHT_UP = 1.2;
const TAU = Math.PI * 2;

// -- Camera (iso-kit.mjs:1-23) ---------------------------------------------------

/** Trig of a projection; k = scale * sqrt(1.6). */
export function camera({ scale = 1, azimuth = AZIMUTH, elevation = ELEVATION } = {}) {
  const a = azimuth * RADIANS;
  const e = elevation * RADIANS;
  return { sinA: Math.sin(a), cosA: Math.cos(a), sinE: Math.sin(e), cosE: Math.cos(e), k: scale * UNIT };
}

/** World [x, y, z] -> screen [x, y]. */
export function iso([x, y, z], P) {
  const o = P.origin || [0, 0];
  const { sinA, cosA, sinE, cosE, k } = camera(P);
  return [o[0] + (x * sinA - y * cosA) * k, o[1] + ((x * cosA + y * sinA) * sinE - z * cosE) * k];
}

/** A world offset as a screen offset (iso is linear, so a moved part is a translate). */
export function isoDelta([x, y, z], P) {
  const { sinA, cosA, sinE, cosE, k } = camera(P);
  return [(x * sinA - y * cosA) * k, ((x * cosA + y * sinA) * sinE - z * cosE) * k];
}

/** The floor-plane direction pointing at the viewer. */
export function towardViewer(P) {
  const { sinA, cosA } = camera(P);
  return [cosA, sinA];
}

/** Depth toward the viewer: sort ascending to paint back to front. */
export function depthOf([x, y, z], P) {
  const { sinA, cosA, sinE, cosE } = camera(P);
  return (x * cosA + y * sinA) * cosE + z * sinE;
}

/**
 * fitProjection (iso-kit.mjs:393-409), placed in a SimLook zone. points: world
 * points that must all show (include every exploded position, so the camera
 * never moves when the parts do). o: { zone = ZONES.heroWide, pad = 24,
 * headroom = 0 (px kept free at the zone top, e.g. for labels), azimuth, elevation, max }.
 */
export function fit(points, o = {}) {
  const zone = o.zone ?? ZONES.heroWide;
  const pad = o.pad ?? 24;
  const headroom = o.headroom ?? 0;
  const azimuth = o.azimuth ?? AZIMUTH;
  const elevation = o.elevation ?? ELEVATION;
  const unit = { origin: [0, 0], scale: 1, azimuth, elevation };
  const flat = points.map((p) => iso(p, unit));
  const xs = flat.map(([x]) => x);
  const ys = flat.map(([, y]) => y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const up = Math.min(...ys);
  const down = Math.max(...ys);
  const scale = Math.min(
    (zone.w - pad * 2) / Math.max(1e-9, right - left),
    (zone.h - pad * 2 - headroom) / Math.max(1e-9, down - up),
    o.max ?? Infinity,
  );
  return {
    origin: [
      zone.x + zone.w / 2 - ((left + right) / 2) * scale,
      zone.y + headroom + (zone.h - headroom) / 2 - ((up + down) / 2) * scale,
    ],
    scale,
    azimuth,
    elevation,
  };
}

// -- Light bands (lathe.mjs:5, 7-17, 19-37) ----------------------------------------

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit3 = (a) => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** Camera-locked light from the upper left, leaning up so tops read brightest. */
export function lightOf(P) {
  const { sinA, cosA } = camera(P);
  return unit3([-sinA, cosA, LIGHT_UP]);
}

/**
 * Band 0..3 for a score n . light. The source walks BANDS to 0..4 (five
 * buckets); we keep four, so the count is shifted down one: < .2 (and every
 * negative) -> 0, [.2, .42) -> 1, [.42, .62) -> 2, >= .62 -> 3. At the default
 * camera a box shows three tones: right side 0, left side 2, top 3.
 */
export function bandOf(score) {
  let tone = 0;
  while (tone < BANDS.length && score >= BANDS[tone]) tone++;
  return Math.max(0, Math.min(SHADES - 1, tone - 1));
}

/** Band of a face with world normal n. */
export const toneOf = (normal, P) => bandOf(dot3(unit3(normal), lightOf(P)));


// -- Rings ------------------------------------------------------------------------

/** A w x d rectangle on the floor at (x, y). */
export function boxRing(x, y, w, d) {
  return [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
}

/** A regular n-gon of radius r about (cx, cy); rot in degrees. */
export function prismRing(cx, cy, r, n = 12, rot = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rot * RADIANS + (TAU * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

function signedArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const [ax, ay] = points[index];
    const [bx, by] = points[(index + 1) % points.length];
    area += ax * by - bx * ay;
  }
  return area / 2;
}
const oriented = (points) => (signedArea(points) < 0 ? [...points].reverse() : points);

/** Monotone-chain convex hull (iso-kit.mjs:62-81). */
export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Contiguous runs of `want` in per-edge flags on a closed ring, as vertex index
 * lists (iso-kit.mjs:82-104). An all-`want` ring returns one run that closes.
 */
export function runsOf(flags, want) {
  const count = flags.length;
  const runs = [];
  const start = flags.findIndex((flag, index) => flag !== flags[(index + count - 1) % count]);
  if (start < 0) return flags[0] === want ? [Array.from({ length: count + 1 }, (_, index) => index % count)] : [];
  let run = null;
  for (let step = 0; step < count; step++) {
    const index = (start + step) % count;
    if (flags[index] === want) {
      if (!run) run = [index];
      run.push((index + 1) % count);
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);
  return runs;
}

// -- Extrude (iso-kit.mjs:105-187) ------------------------------------------------

/**
 * Extrude a floor ring from z up by height. Pure: returns screen point lists.
 *   { sides: [{ pts, band, depth, edge }] (viewer-facing only, back to front; edge: the ring edge index,
 *     so face 'side-<edge>' names the same wall from any azimuth),
 *     top: pts, topBand, hull: pts (silhouette), outline: [pts], crease: [pts] }
 * Bands come from toneOf (BANDS), not from iso-kit's floor(lit * 4).
 * o: { convex = true } (false: the silhouette is top + bottom + sides, not a hull).
 */
export function extrude(ring, z, height, P, o = {}) {
  const convex = o.convex ?? true;
  const count = ring.length;
  const counter = signedArea(ring) > 0;
  const [vx, vy] = towardViewer(P);
  const normals = ring.map(([ax, ay], index) => {
    const [bx, by] = ring[(index + 1) % count];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy) || 1;
    return counter ? [dy / length, -dx / length] : [-dy / length, dx / length];
  });
  const facing = normals.map(([nx, ny]) => nx * vx + ny * vy > 1e-9);
  const top = ring.map(([x, y]) => iso([x, y, z + height], P));
  const bottom = ring.map(([x, y]) => iso([x, y, z], P));
  const outline = [];
  const crease = [];
  for (const run of runsOf(facing, false)) outline.push(run.map((index) => top[index]));
  for (const run of runsOf(facing, true)) {
    crease.push(run.map((index) => top[index]));
    if (height > 0) outline.push(run.map((index) => bottom[index]));
  }
  if (height > 0) {
    for (let index = 0; index < count; index++) {
      if (facing[(index + count - 1) % count] !== facing[index]) outline.push([top[index], bottom[index]]);
    }
  }
  const sides = [];
  if (height > 0) {
    for (let index = 0; index < count; index++) {
      if (!facing[index]) continue;
      const next = (index + 1) % count;
      const [nx, ny] = normals[index];
      const mid = [(ring[index][0] + ring[next][0]) / 2, (ring[index][1] + ring[next][1]) / 2, z + height / 2];
      sides.push({
        pts: oriented([top[index], top[next], bottom[next], bottom[index]]),
        band: toneOf([nx, ny, 0], P),
        depth: depthOf(mid, P),
        edge: index,
      });
    }
    sides.sort((a, b) => a.depth - b.depth);
  }
  let hull;
  if (convex) hull = convexHull([...top, ...bottom]);
  else hull = null;
  return { sides, top: oriented(top), topBand: toneOf([0, 0, 1], P), hull, outline, crease };
}

// -- Cached solids -------------------------------------------------------------------

const SOLIDS = new Map();
const SOLID_CAP = 256;
const tenth = (v) => Math.round(v * 10) / 10;


/**
 * extrude() at origin [0, 0], cached by (ring, z, height, scale, azimuth,
 * elevation). Path2Ds are built on first draw (never in Node). Hold the result
 * or call again per frame: a hit is one string key and one Map lookup.
 */
export function solidOf(ring, z, height, P, o = {}) {
  const az = P.azimuth ?? AZIMUTH, el = P.elevation ?? ELEVATION;
  const key = ring.map(([x, y]) => tenth(x) + ',' + tenth(y)).join(';') + '|' + tenth(z) + '|' + tenth(height)
    + '|' + Math.round(P.scale * 1000) + '|' + az + '|' + el + '|' + (o.convex === false ? 0 : 1);
  let s = SOLIDS.get(key);
  if (!s) {
    if (SOLIDS.size >= SOLID_CAP) SOLIDS.clear();
    s = extrude(ring, z, height, { scale: P.scale, azimuth: az, elevation: el, origin: [0, 0] }, o);
    s.key = key;
    s.paths = null;
    SOLIDS.set(key, s);
  }
  return s;
}

/** Number of cached solids (for tests and budgets). */
export function solidCacheSize() { return SOLIDS.size; }

/** Screen polygon of a floor ring at height z (e.g. a lifted part's shadow on a base). */
export function footprint(ring, z, P) {
  return ring.map(([x, y]) => iso([x, y, z], P));
}

// -- Flat three-tone offsets (toon.js:10-16) ------------------------------------------

/**
 * Pixel offsets of the shadow band (v) and the highlight rim (w) as fractions
 * of the box: v = [vx * box.w, vy * box.h], w likewise. Defaults rescale the
 * source v = [10, 12], w = [4, 5] px (1920 frame, ~120 px shapes) to fractions.
 */
export function flatOffsets(box, v = [0.09, 0.1], w = [0.035, 0.04]) {
  return { v: [v[0] * box.w, v[1] * box.h], w: [w[0] * box.w, w[1] * box.h] };
}

// -- Exploded view (live.js:122-143, steerSpring 96-102 on SimAnim.springStep) -----

/** The raptor-engine spring: stiffness 64, damping 14.2, stagger 0.035 s. */
export const EXPLODE = { stagger: 0.035, preset: { period: TAU / 8, zeta: 14.2 / 16 } };

/**
 * Staggered exploded-view controller over n parts.
 * order: part indices, outermost first (opening walks it forwards, closing backwards).
 * o: { stagger, preset, apart = false (start state) }
 * Returns {
 *   share(i)          0 assembled .. 1 apart (may overshoot a little)
 *   apart             the current goal (boolean)
 *   set(on, clock)    goal; each part whose target must change gets
 *                     pending = { value, at: clock + k * stagger }, k counting
 *                     ONLY those parts; a part already at the goal is cancelled.
 *                     So reversing mid-explode never flips a share's direction
 *                     early and a not-yet-started part never starts.
 *   step(dt, clock)   advance (clock = scene time after this step); true while
 *                     anything moves or waits
 *   settled()         nothing moving, nothing pending (busy() can go false)
 *   snap(on)          jump every part to on (enter() resets) }
 * Reduced motion: no stagger, and springStep snaps, so set() then one step() is the end state.
 */
export function explode(order, o = {}) {
  const stagger = o.stagger ?? EXPLODE.stagger;
  const preset = o.preset ?? EXPLODE.preset;
  const n = order.length;
  const start = o.apart ? 1 : 0;
  const parts = Array.from({ length: n }, () => ({ x: start, v: 0, target: start, pending: null }));
  let apart = !!o.apart;
  let moving = false;
  return {
    get apart() { return apart; },
    share(i) { return parts[i] ? parts[i].x : 0; },
    set(on, clock) {
      on = !!on;
      if (apart === on) return;
      apart = on;
      const goal = on ? 1 : 0;
      const calm = reducedMotion();
      let index = 0;
      for (const id of on ? order : [...order].reverse()) {
        const s = parts[id];
        if (!s) continue;
        if (s.target === goal) s.pending = null;
        else s.pending = { value: goal, at: clock + (calm ? 0 : index++ * stagger) };
      }
      moving = true;
    },
    step(dt, clock) {
      let any = false;
      for (const s of parts) {
        if (s.pending && clock >= s.pending.at) {
          s.target = s.pending.value;
          s.pending = null;
        }
        const m = springStep(s, s.target, dt, preset);
        if (m || s.pending) any = true;
      }
      moving = any;
      return any;
    },
    settled() {
      if (moving) return false;
      for (const s of parts) if (s.pending || s.x !== s.target || s.v !== 0) return false;
      return true;
    },
    snap(on) {
      apart = !!on;
      const v = on ? 1 : 0;
      for (const s of parts) { s.x = v; s.v = 0; s.target = v; s.pending = null; }
      moving = false;
    },
    parts,
  };
}

// -- Shared look constants ------------------------------------------------------------

/** Band 0..3 -> darken (negative) or lighten (positive) of the ONE base token, in sRGB. */
export const LADDER_STEPS = [-0.3, -0.15, 0, 0.28];
/** The light rim along the viewer-facing top creases: lighten, alpha, width (px). */
export const RIM = { lighten: 0.55, alpha: 0.9, width: 1.5 };

// -- Scene helpers (original) -----------------------------------------------------------

/**
 * A projection maker for a model that turns: one scale that fits every azimuth (sampled every
 * o.step = 15 degrees), and the pivot (the centre of the points' box, or o.pivot) held at the zone
 * centre, so turning never zooms or slides. o: as fit (zone, pad, headroom, elevation, max).
 */
export function fitTurning(points, o = {}) {
  const zone = o.zone ?? ZONES.heroWide;
  const pad = o.pad ?? 24, headroom = o.headroom ?? 0, elevation = o.elevation ?? ELEVATION;
  let pivot = o.pivot;
  if (!pivot) {
    const lo = [0, 1, 2].map((k) => Math.min(...points.map((p) => p[k])));
    const hi = [0, 1, 2].map((k) => Math.max(...points.map((p) => p[k])));
    pivot = lo.map((v, k) => (v + hi[k]) / 2);
  }
  let rx = 1e-9, ry = 1e-9;
  for (let az = 0; az < 360; az += o.step ?? 15) {
    const P = { origin: [0, 0], scale: 1, azimuth: az, elevation };
    const [cx, cy] = iso(pivot, P);
    for (const p of points) {
      const [x, y] = iso(p, P);
      rx = Math.max(rx, Math.abs(x - cx));
      ry = Math.max(ry, Math.abs(y - cy));
    }
  }
  const scale = Math.min((zone.w / 2 - pad) / rx, ((zone.h - headroom) / 2 - pad) / ry, o.max ?? Infinity);
  const mid = [zone.x + zone.w / 2, zone.y + headroom + (zone.h - headroom) / 2];
  return (azimuth = AZIMUTH) => {
    const P = { origin: [0, 0], scale, azimuth, elevation };
    const [cx, cy] = iso(pivot, P);
    P.origin = [mid[0] - cx, mid[1] - cy];
    return P;
  };
}

/**
 * Piece k of a build that drops in one after another: lift 1 (o.drop above) .. 0 (landed, a snappy
 * spring with a little overshoot), alpha 0..1 over o.fade. o: { start = 0.25, lag = 0.28,
 * preset = 'snappy', fade = 0.12 }. Reduced motion: landed.
 */
export function dropIn(t, k, o = {}) {
  if (reducedMotion()) return { lift: 0, alpha: 1 };
  const u = t - (o.start ?? 0.25) - k * (o.lag ?? 0.28);
  if (u <= 0) return { lift: 1, alpha: 0 };
  const s = spring(u, o.preset ?? 'snappy');
  return { lift: 1 - s, alpha: Math.min(1, u / (o.fade ?? 0.12)) };
}

/** Seconds until the last of n dropIn pieces has landed (same o). */
export function dropEnd(n, o = {}) {
  return (o.start ?? 0.25) + (o.lag ?? 0.28) * Math.max(0, n - 1) + (o.settle ?? 0.6);
}

/**
 * nx x ny x nz unit cubes as items. o: { size = 1, gap = 0 (world units between cubes),
 * at = [0, 0, 0] (the corner) }. Each item: { id, i, j, k, ring, z, h, offset }.
 */
export function cuboid(nx, ny, nz, o = {}) {
  const s = o.size ?? 1, g = o.gap ?? 0, at = o.at ?? [0, 0, 0];
  const out = [];
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = at[0] + i * (s + g), y = at[1] + j * (s + g);
        out.push({ id: `c${i}-${j}-${k}`, i, j, k, ring: boxRing(x, y, s, s), z: at[2] + k * (s + g), h: s, offset: [0, 0, 0] });
      }
    }
  }
  return out;
}

/** World centre of an item (its ring's mean point, mid-height), moved by its offset. */
export function centreOf(it) {
  let x = 0, y = 0;
  for (const p of it.ring) { x += p[0]; y += p[1]; }
  const n = it.ring.length || 1, o = it.offset ?? [0, 0, 0];
  return [x / n + o[0], y / n + o[1], it.z + it.h / 2 + o[2]];
}

/** Items back to front (a sorted copy; ties keep their order). Exact for same-size blocks on a grid. */
export function depthSort(items, P) {
  return items
    .map((it, n) => ({ it, n, d: depthOf(centreOf(it), P) }))
    .sort((a, b) => a.d - b.d || a.n - b.n)
    .map((e) => e.it);
}

/** Screen points (at the origin, as solidOf) of a face 'top' or 'side-<edge>'; null when hidden. */
export function faceOf(solid, face) {
  if (face === 'top') return solid.top;
  const e = Number(String(face).replace('side-', ''));
  const s = solid.sides.find((f) => f.edge === e);
  return s ? s.pts : null;
}

function inside(pts, x, y) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * The front-most face under stage point (x, y): items are tested front to back, each item's top
 * then its sides front first. Returns { item, id, face, band } or null. Skips items with alpha 0.
 */
export function pickFace(items, P, x, y) {
  const sorted = depthSort(items, P);
  const org = P.origin || [0, 0];
  for (let n = sorted.length - 1; n >= 0; n--) {
    const it = sorted[n];
    if (it.alpha === 0) continue;
    const s = solidOf(it.ring, it.z, it.h, P, it.convex === false ? { convex: false } : {});
    const [dx, dy] = it.offset ? isoDelta(it.offset, P) : [0, 0];
    const lx = x - org[0] - dx, ly = y - org[1] - dy;
    if (inside(s.top, lx, ly)) return { item: it, id: it.id, face: 'top', band: s.topBand };
    for (let f = s.sides.length - 1; f >= 0; f--) {
      if (inside(s.sides[f].pts, lx, ly)) return { item: it, id: it.id, face: `side-${s.sides[f].edge}`, band: s.sides[f].band };
    }
  }
  return null;
}
