/** SimCamera.js
 * SimCamera - a deterministic 2D camera for canvas scenes (recipe R10).
 * Adapted from alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/camera.js (MIT, (c) 2026 alchaincyf)
 * Adapted from cth9191/animate@7e5eb56 plugins/animate/skills/animate/styles/isometric/kit.js (MIT, (c) 2026 cth9191)
 * Full notices in THIRD_PARTY.md beside the kit LICENSE. cameraEnd and the stage-centre parameter are original.
 *
 * The camera: cam = { x, y, z, r }. The world point (x, y) appears at the stage
 * centre, z > 1 zooms in, r rotates (radians) about the centre. Missing fields
 * default to the identity camera { x: cx, y: cy, z: 1, r: 0 }, so with no
 * camera the world and the screen coincide.
 *
 * The centre is always a PARAMETER (an [x, y] pair), defaulting to the middle
 * of the 680 x 520 design space (SimLook W/2, H/2). It is never module state:
 * nothing here listens to a stage hook. (SimLook is not imported, only mirrored,
 * so this module loads in plain Node for the unit test; SimLook pulls in a
 * bare-specifier import.)
 *
 * What is here:
 *   apply(ctx, cam, centre)          multiply the camera into ctx (no save/restore)
 *   withCamera(ctx, cam, fn, centre) save, apply, fn(ctx), restore
 *   toScreen(cam, x, y, centre)      world -> screen [sx, sy]
 *   toWorld(cam, sx, sy, centre)     screen -> world [x, y] (hit tests in pointerDown)
 *   zlerp(z0, z1, e)                 log (geometric) zoom interpolation
 *   coverZoom(r, cx, cy, w, h)       zoom so a radius-r opening covers every corner
 *   anchor(wx, wy, z, sx, sy, centre, r)  the camera that puts world (wx, wy) on screen (sx, sy)
 *   camOf                            alias of anchor (animate's name for the same idea)
 *   pushTo(base, wx, wy, Z, e, k, to, centre)  push into a world point (progress e, drift k)
 *   layer(ctx, cam, d, fn, centre)   parallax layer at depth d (1 = subject plane, < 1 far)
 *   zoomNow(ctx, frameW)             current camera zoom from the ctx transform (HiDPI-safe)
 *   hair(ctx, col, w, frameW)        stroke style whose width stays w screen px at any zoom
 *   cameraAt(base, events, t, centre) chained camera moves -> { cam, moving }
 *   cameraEnd(events)                seconds when the last move settles (for busy())
 *
 * Rules (read before using):
 *   - Log zoom is mandatory. Linear zoom is "slow, then violent"; zlerp gives an
 *     even passage through scale. Every zoom tween here goes through it.
 *   - Never "zoom about a point". Put a world point on a screen point (anchor,
 *     pushTo): the subject then never slides under a caption.
 *   - Captions, chips and notes are drawn AFTER ctx.restore(), at screen size,
 *     placed with toScreen(). Text inside the camera grows with the zoom.
 *   - Lines inside the camera use hair() so they stay crisp, not fat, when zoomed.
 *   - Pushes come paired with a pull or a glide back out.
 *   - Reduced motion: cameraAt and pushTo jump to the end state (a cut).
 *   - GeoScene keeps its own camera for now (a later task delegates to this).
 *   - Not ported on purpose: drift (hand-held wobble), shake (SimScene.shake does
 *     it), cut (just pass the new base), animate's bump (it loops forever).
 */
import { TIMING, ease, reducedMotion } from './SimAnim.js';

// Mirror of SimLook W x H (the 680 x 520 design space).
const DW = 680;
const DH = 520;
const CENTRE = [DW / 2, DH / 2];

/** Default screen width of a hairline at 680 wide (animate HAIR 2.0 px at 1080 wide x 680/1080 ~ 1.26). */
export const HAIR = 1.3;

const sineInOut = (t) => {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 0.5 - 0.5 * Math.cos(Math.PI * u);
};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

function norm(cam, centre) {
  const c = cam || {};
  return { x: c.x ?? centre[0], y: c.y ?? centre[1], z: c.z ?? 1, r: c.r || 0 };
}

// -- Core transform -------------------------------------------------------------

/** Multiply the camera into ctx. No save/restore: the caller owns that. */
export function apply(ctx, cam, centre = CENTRE) {
  const k = norm(cam, centre);
  ctx.translate(centre[0], centre[1]);
  if (k.r) ctx.rotate(k.r);
  ctx.scale(k.z, k.z);
  ctx.translate(-k.x, -k.y);
}

/** Draw fn(ctx) under the camera, with save/restore around it. */
export function withCamera(ctx, cam, fn, centre = CENTRE) {
  ctx.save();
  try {
    apply(ctx, cam, centre);
    fn(ctx);
  } finally {
    ctx.restore();
  }
}

/** World -> screen. Returns [sx, sy]. */
export function toScreen(cam, x, y, centre = CENTRE) {
  const k = norm(cam, centre);
  let dx = (x - k.x) * k.z;
  let dy = (y - k.y) * k.z;
  if (k.r) {
    const cs = Math.cos(k.r);
    const sn = Math.sin(k.r);
    const rx = dx * cs - dy * sn;
    dy = dx * sn + dy * cs;
    dx = rx;
  }
  return [centre[0] + dx, centre[1] + dy];
}

/** Screen -> world (the exact inverse of toScreen). Use for hit tests in pointerDown. */
export function toWorld(cam, sx, sy, centre = CENTRE) {
  const k = norm(cam, centre);
  let dx = sx - centre[0];
  let dy = sy - centre[1];
  if (k.r) {
    const cs = Math.cos(-k.r);
    const sn = Math.sin(-k.r);
    const rx = dx * cs - dy * sn;
    dy = dx * sn + dy * cs;
    dx = rx;
  }
  return [k.x + dx / k.z, k.y + dy / k.z];
}

// -- Zoom -----------------------------------------------------------------------

/** Log zoom: z0 * (z1 / z0)^e. The same factor per frame, so scale passes evenly. */
export function zlerp(z0, z1, e) {
  return z0 * Math.pow(z1 / z0, e);
}

/**
 * Smallest zoom at which a round opening of radius r centred on screen (cx, cy)
 * covers all four corners (distance to the farthest corner / r). At the centre
 * of 680 x 520 that is hypot(340, 260) / r ~ 428 / r. Too small and the last
 * frame of a dive-through shows the edge of the opening.
 */
export function coverZoom(r, cx = DW / 2, cy = DH / 2, w = DW, h = DH) {
  return Math.max(
    Math.hypot(cx, cy),
    Math.hypot(w - cx, cy),
    Math.hypot(cx, h - cy),
    Math.hypot(w - cx, h - cy),
  ) / r;
}

/**
 * The camera at zoom z (and rotation r) that puts world (wx, wy) on screen
 * (sx, sy). This is how a push keeps its subject where you want it.
 */
export function anchor(wx, wy, z, sx, sy, centre = CENTRE, r = 0) {
  let dx = (sx - centre[0]) / z;
  let dy = (sy - centre[1]) / z;
  if (r) {
    const cs = Math.cos(-r);
    const sn = Math.sin(-r);
    const rx = dx * cs - dy * sn;
    dy = dx * sn + dy * cs;
    dx = rx;
  }
  return { x: wx - dx, y: wy - dy, z, r };
}

/** animate's name for anchor (same arguments). */
export const camOf = anchor;

/**
 * Push into world (wx, wy) from camera base: zoom log-interpolates to Z with
 * progress e (0..1, ease it yourself; a good length is TIMING.push), while the
 * point's screen position moves from where it was toward `to` (default the
 * centre) with progress k (default e; k = 0 pushes in on the point where it
 * stands). Reduced motion: the end state (e = k = 1).
 */
export function pushTo(base, wx, wy, Z, e, k = e, to = null, centre = CENTRE) {
  if (reducedMotion()) {
    e = 1;
    k = 1;
  }
  const b = norm(base, centre);
  const target = to || centre;
  const s0 = toScreen(b, wx, wy, centre);
  const z = zlerp(b.z, Z, e);
  return anchor(wx, wy, z, lerp(s0[0], target[0], k), lerp(s0[1], target[1], k), centre, b.r);
}

// -- Parallax -------------------------------------------------------------------

/**
 * Draw fn(ctx) as a parallax layer at depth d: 1 is the subject plane, d < 1 is
 * farther (moves d times as far, zooms z^d), d > 1 is nearer. In a deep push the
 * far layer barely moves, which reads as depth (layered parallax).
 * A layer's world is laid out like the subject's (identity camera = no offset).
 */
export function layer(ctx, cam, d, fn, centre = CENTRE) {
  const k = norm(cam, centre);
  withCamera(ctx, {
    x: lerp(centre[0], k.x, d),
    y: lerp(centre[1], k.y, d),
    z: Math.pow(k.z, d),
    r: k.r,
  }, fn, centre);
}

// -- Hairlines ------------------------------------------------------------------

/**
 * The zoom currently in ctx: sqrt |det| of the transform (rotation-proof),
 * divided by the HiDPI base scale (backing store width / frameW), so a SimScene's
 * devicePixelRatio transform is not mistaken for a camera zoom. Pass frameW when
 * the scene's WIDTH is not 680.
 */
export function zoomNow(ctx, frameW = DW) {
  if (!ctx || typeof ctx.getTransform !== 'function') return 1;
  const m = ctx.getTransform();
  if (!m || typeof m.a !== 'number') return 1;   // stub contexts (headless probes)
  const det = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  const cw = ctx.canvas && ctx.canvas.width;
  const base = cw > 0 && frameW > 0 ? cw / frameW : 1;
  return det / (base || 1) || 1;
}

/** Set a stroke whose width is w screen px whatever the camera zoom (round joins and caps). */
export function hair(ctx, col, w = HAIR, frameW = DW) {
  ctx.strokeStyle = col;
  ctx.lineWidth = w / zoomNow(ctx, frameW);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

// -- Chained camera moves ---------------------------------------------------------

const KIND_DUR = {
  push: () => TIMING.push,
  pull: () => TIMING.pull,
  glide: () => TIMING.glide,
  to: () => TIMING.push,
  punch: () => TIMING.punch,
  pan: () => TIMING.pan,
  slam: () => TIMING.slam,
};

function evDur(e) {
  const kind = e.kind || 'push';
  return e.dur || (KIND_DUR[kind] || KIND_DUR.push)();
}

function evEase(e) {
  if (e.ease) return e.ease;
  const kind = e.kind || 'push';
  if (kind === 'punch' || kind === 'pan' || (e.dur && e.dur <= 0.35)) return ease.inOutCubic;
  if (kind === 'pull') return ease.longTail;
  return sineInOut;
}

function slamK(k, from = 1.55, under = 0.94) {
  if (k <= 0) return from;
  if (k < 0.6) return from - (from - under) * (k / 0.6);
  if (k < 1) return under + (1 - under) * ((k - 0.6) / 0.4);
  return 1;
}

/**
 * Camera at time t (seconds) from a base camera and a list of moves. Each move
 * starts from the camera as the earlier moves leave it AT THIS t, so a move that
 * begins before the last one settles picks it up mid-flight with no jump.
 * Events ({ at, kind, dur?, ease?, ... }; kind defaults to 'push'):
 *   push  { k = 0.2, x?, y? }   slow push: z * (1 + k), optional world point to the centre
 *   pull  { k = -1/6, x?, y?, z? }  pull back: z * (1 + k) (one default pull undoes one
 *                                default push exactly; or give z: base.z), long-tail ease
 *   glide { x, y }              same zoom, slide the centre to world (x, y)
 *   to    { x?, y?, z?, r? }    move to an explicit camera
 *   punch { k = 0.25, x?, y? }  quick accent push (k < 0 for a quick pull)
 *   pan   { x, y }              quick accent glide
 *   slam  { from = 1.55 }       whole-frame slam-in, zoom x 1.55 -> 0.94 -> 1
 * Durations default to SimAnim TIMING (push and pull capped at 0.8 s).
 * Returns { cam: { x, y, z, r }, moving }; moving is true inside any move.
 * Reduced motion: every started move is at its end (a cut) and moving is false.
 */
export function cameraAt(base, events, t, centre = CENTRE) {
  const rm = reducedMotion();
  let cam = norm(base, centre);
  let zMul = 1;
  let moving = false;
  const evs = [...(events || [])].sort((a, b) => (a.at || 0) - (b.at || 0));
  for (const e of evs) {
    const at = e.at || 0;
    if (t < at) break;
    const kind = e.kind || 'push';
    const d = evDur(e);
    const u = rm || d <= 0 ? 1 : clamp01((t - at) / d);
    if (kind === 'slam') {
      if (u < 1) {
        zMul *= slamK(u, e.from);
        moving = true;
      }
      continue;
    }
    const p = evEase(e)(u);
    let to;
    if (kind === 'pan' || kind === 'glide') {
      to = { x: e.x ?? cam.x, y: e.y ?? cam.y, z: cam.z, r: cam.r };
    } else if (kind === 'to') {
      to = { x: e.x ?? cam.x, y: e.y ?? cam.y, z: e.z ?? cam.z, r: e.r ?? cam.r };
    } else if (kind === 'pull') {
      to = { x: e.x ?? cam.x, y: e.y ?? cam.y, z: e.z ?? cam.z * (1 + (e.k ?? -1 / 6)), r: cam.r };
    } else {
      const kk = e.k ?? (kind === 'punch' ? 0.25 : 0.2);
      to = { x: e.x ?? cam.x, y: e.y ?? cam.y, z: cam.z * (1 + kk), r: cam.r };
    }
    if (u < 1) moving = true;
    cam = {
      x: lerp(cam.x, to.x, p),
      y: lerp(cam.y, to.y, p),
      z: zlerp(cam.z, to.z, p),
      r: lerp(cam.r, to.r, p),
    };
  }
  return { cam: { x: cam.x, y: cam.y, z: cam.z * zMul, r: cam.r }, moving };
}

/**
 * Seconds at which the last move settles (0 for none; 0 under reduced motion).
 * busy() should use t < cameraEnd(events), not just `moving`, so the loop does
 * not park in a gap between two moves.
 */
export function cameraEnd(events) {
  if (reducedMotion()) return 0;
  let end = 0;
  for (const e of events || []) end = Math.max(end, (e.at || 0) + evDur(e));
  return end;
}
