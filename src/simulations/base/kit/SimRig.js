/** SimRig.js
 * SimRig - two-bone IK, tapered limbs and small mechanism maths (NEW-B).
 * Adapted from alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/rig.js (MIT, (c) 2026 alchaincyf)
 * Full notices in THIRD_PARTY.md beside the kit LICENSE. Only ik2 and limb
 * (rig.js lines 9-28) are adapted; the character rigs in that file and
 * rig_huashu.js are not used. muscle, pointSpring/stepPoint, reach,
 * crankSlider, crankAngleAt and lever are original.
 *
 * Points: every function accepts a point as { x, y } or [x, y] and returns
 * { x, y } objects. Angles are radians in canvas space (y down), so a positive
 * angle turns clockwise on screen.
 *
 * What is here:
 *   ik2(root, target, l1, l2, bend, o)  two-bone IK -> { joint, end, reached, dist, a1, a2 }
 *   reach(l1, l2)                        { min, max } distance the chain can reach
 *   limb(ctx, a, b, w0, w1, fill, o)     tapered round-capped capsule from a to b
 *   traceLimb(ctx, a, b, w0, w1)         the same outline as a subpath (no begin/fill)
 *   muscle(ctx, a, b, w0, w1, bulge, fill, o)  a capsule whose middle swells by bulge px
 *   pointSpring(x, y) / stepPoint(st, tx, ty, dt, preset)  a 2D spring for smoothing a
 *                                        dragged IK target (SimAnim.springStep per axis)
 *   crankSlider(centre, r, rod, angle, axis)  crank pin + piston on a straight axis
 *   crankAngleAt(t, turns, durS, a0)     scripted crank angle, eased, parks at the end
 *   lever(fulcrum, angle, effortArm, loadArm)  both ends of a straight lever + advantage
 *
 * Rules:
 *   - ik2 never returns NaN: a target on the root uses o.dir (default 0) as the
 *     reach direction; a target too far is clamped to full stretch, too near to
 *     the folded reach |l1 - l2|; reached says whether end is within 0.5 px of the target.
 *   - The elbow side is set by bend alone (+1 or -1), never by where the target
 *     is: with bend = +1 the joint sits clockwise of the root->end line on
 *     screen. Bone lengths are exact in every case.
 *   - limb draws with ctx.beginPath (no per-frame Path2D). The cap arcs wind
 *     outward (rig.js line 19 records the old bug: inward caps self-intersect
 *     and leave holes at the joints under a thick stroke).
 *   - Geometry: rig.js measured nothing we reuse except its 0.01 px reach
 *     epsilon (kept); there are no 1080p constants to rescale.
 *   - Colours come in as parameters (resolved c.* tokens); none live here.
 *   - Reduced motion: stepPoint snaps (springStep does), crankAngleAt returns
 *     the end angle.
 */
import { springStep, ease, reducedMotion } from './SimAnim.js';

const TAU = Math.PI * 2;
const EPS = 0.01;

const px = (p) => (Array.isArray(p) ? p[0] : p.x);
const py = (p) => (Array.isArray(p) ? p[1] : p.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Distances a two-bone chain can reach from its root: [min, max]. */
export function reach(l1, l2) {
  return { min: Math.abs(l1 - l2), max: l1 + l2 };
}

/**
 * Two-bone IK. root -> joint is l1 long, joint -> end is l2 long; end goes as
 * close to target as the chain allows. bend: +1 or -1 picks the elbow side.
 * o.dir: reach angle used when target sits on the root (default 0).
 * Returns { joint, end, reached, dist, a1, a2 } (a1, a2 = bone angles).
 */
export function ik2(root, target, l1, l2, bend = 1, o = {}) {
  const sx = px(root), sy = py(root);
  const dx = px(target) - sx, dy = py(target) - sy;
  const raw = Math.hypot(dx, dy);
  const sign = bend < 0 ? -1 : 1;
  const ang = raw > 1e-9 ? Math.atan2(dy, dx) : (o.dir ?? 0);
  const { min, max } = reach(l1, l2);
  if (max <= 0) {
    const p = { x: sx, y: sy };
    return { joint: p, end: { x: sx, y: sy }, reached: raw <= EPS, dist: raw, a1: ang, a2: ang };
  }
  const hi = Math.max(min, max - EPS);
  const lo = Math.min(hi, min + (min > 0 ? EPS : 0));
  const d = clamp(raw, lo, hi);
  let a1 = ang;
  if (l1 > 0 && d > 0) {
    const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    a1 = ang + sign * Math.acos(cosA);
  } else if (l1 > 0) {
    a1 = ang + sign * Math.PI / 2;
  }
  const joint = { x: sx + Math.cos(a1) * l1, y: sy + Math.sin(a1) * l1 };
  const end = { x: sx + Math.cos(ang) * d, y: sy + Math.sin(ang) * d };
  const a2 = l2 > 0 ? Math.atan2(end.y - joint.y, end.x - joint.x) : a1;
  const reached = Math.hypot(end.x - px(target), end.y - py(target)) <= 0.5;
  return { joint, end, reached, dist: raw, a1, a2 };
}

/** Add the tapered capsule outline from a (width w0) to b (width w1) as a closed subpath. */
export function traceLimb(ctx, a, b, w0, w1) {
  const ax = px(a), ay = py(a), bx = px(b), by = py(b);
  const ang = Math.atan2(by - ay, bx - ax);
  const n = ang + Math.PI / 2;
  const cn = Math.cos(n), sn = Math.sin(n);
  ctx.moveTo(ax + cn * w0 / 2, ay + sn * w0 / 2);
  ctx.lineTo(bx + cn * w1 / 2, by + sn * w1 / 2);
  ctx.arc(bx, by, w1 / 2, n, n - Math.PI, true);
  ctx.lineTo(ax - cn * w0 / 2, ay - sn * w0 / 2);
  ctx.arc(ax, ay, w0 / 2, n - Math.PI, n - TAU, true);
  ctx.closePath();
}

/**
 * Fill (and optionally stroke) a tapered capsule from a to b.
 * fill: a resolved colour or null. o: { stroke, lineWidth }.
 */
export function limb(ctx, a, b, w0, w1, fill, o = {}) {
  ctx.beginPath();
  traceLimb(ctx, a, b, w0, w1);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (o.stroke) {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.lineWidth ?? 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/**
 * A muscle belly: like limb, but the middle swells to (w0 + w1) / 2 + bulge
 * on both sides (smooth quadratic sides). bulge 0 gives straight sides.
 * o: { stroke, lineWidth, at } (at: 0..1 where along a->b the belly peaks, default 0.5).
 */
export function muscle(ctx, a, b, w0, w1, bulge, fill, o = {}) {
  const ax = px(a), ay = py(a), bx = px(b), by = py(b);
  const ang = Math.atan2(by - ay, bx - ax);
  const n = ang + Math.PI / 2;
  const cn = Math.cos(n), sn = Math.sin(n);
  const at = clamp(o.at ?? 0.5, 0.15, 0.85);
  const mx = ax + (bx - ax) * at, my = ay + (by - ay) * at;
  const wm = w0 + (w1 - w0) * at + Math.max(0, bulge) * 2;
  // Control point so the quadratic passes through the belly edge at its peak.
  const ctl = (side) => {
    const ex0x = ax + side * cn * w0 / 2, ex0y = ay + side * sn * w0 / 2;
    const ex1x = bx + side * cn * w1 / 2, ex1y = by + side * sn * w1 / 2;
    const pmx = mx + side * cn * wm / 2, pmy = my + side * sn * wm / 2;
    return { x: 2 * pmx - (ex0x + ex1x) / 2, y: 2 * pmy - (ex0y + ex1y) / 2 };
  };
  const cp = ctl(1), cm = ctl(-1);
  ctx.beginPath();
  ctx.moveTo(ax + cn * w0 / 2, ay + sn * w0 / 2);
  ctx.quadraticCurveTo(cp.x, cp.y, bx + cn * w1 / 2, by + sn * w1 / 2);
  ctx.arc(bx, by, w1 / 2, n, n - Math.PI, true);
  ctx.quadraticCurveTo(cm.x, cm.y, ax - cn * w0 / 2, ay - sn * w0 / 2);
  ctx.arc(ax, ay, w0 / 2, n - Math.PI, n - TAU, true);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (o.stroke) {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.lineWidth ?? 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/** A 2D spring state for smoothing a moving point (e.g. a dragged IK target). */
export function pointSpring(x, y) {
  return { x, y, vx: 0, vy: 0 };
}

/**
 * Advance a pointSpring toward (tx, ty) by dt seconds with a SimAnim spring
 * preset. Returns true while it is still moving (feed busy()). Reduced motion snaps.
 */
export function stepPoint(st, tx, ty, dt, preset = 'snappy') {
  const sx = { x: st.x, v: st.vx };
  const sy = { x: st.y, v: st.vy };
  const mx = springStep(sx, tx, dt, preset);
  const my = springStep(sy, ty, dt, preset);
  st.x = sx.x; st.vx = sx.v;
  st.y = sy.x; st.vy = sy.v;
  return mx || my;
}

/**
 * Crank-slider (engine piston, pump, sewing machine). A crank of radius r
 * turns about centre; a rod of length rod joins the crank pin to a slider
 * that runs on the line through centre at angle axis. angle is the crank angle
 * measured from that axis. Returns { pin, slider, s, sMin, sMax, rodAngle }:
 * s is the slider's distance from centre (sMin = rod - r, sMax = rod + r).
 * A rod shorter than r is lengthened to r (the mechanism would lock).
 */
export function crankSlider(centre, r, rod, angle, axis = 0) {
  const cx = px(centre), cy = py(centre);
  const L = Math.max(rod, r);
  const ux = Math.cos(axis), uy = Math.sin(axis);
  const vx = -uy, vy = ux;
  const along = r * Math.cos(angle), across = r * Math.sin(angle);
  const s = along + Math.sqrt(Math.max(0, L * L - across * across));
  const pin = { x: cx + ux * along + vx * across, y: cy + uy * along + vy * across };
  const slider = { x: cx + ux * s, y: cy + uy * s };
  const rodAngle = Math.atan2(slider.y - pin.y, slider.x - pin.x);
  return { pin, slider, s, sMin: L - r, sMax: L + r, rodAngle };
}

/**
 * Scripted crank angle: turns (signed) full turns over durS seconds from a0,
 * gently eased in and out (ease.smooth), then parked. Reduced motion: end angle.
 */
export function crankAngleAt(t, turns, durS, a0 = 0) {
  if (reducedMotion() || durS <= 0 || t >= durS) return a0 + turns * TAU;
  if (t <= 0) return a0;
  return a0 + turns * TAU * ease.smooth(t / durS);
}

/**
 * A straight lever through fulcrum, tilted by angle (0 = level; positive tips
 * the load end down on screen). The effort end lies effortArm to the left of
 * the fulcrum, the load end loadArm to the right. Returns
 * { effort, load, advantage } with advantage = effortArm / loadArm (the load an
 * effort of 1 can balance).
 */
export function lever(fulcrum, angle, effortArm, loadArm) {
  const fx = px(fulcrum), fy = py(fulcrum);
  const c = Math.cos(angle), s = Math.sin(angle);
  return {
    effort: { x: fx - c * effortArm, y: fy - s * effortArm },
    load: { x: fx + c * loadArm, y: fy + s * loadArm },
    advantage: loadArm > 0 ? effortArm / loadArm : Infinity,
  };
}
