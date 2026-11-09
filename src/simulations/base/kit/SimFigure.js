/**
 * SimFigure - a shared person for canvas scenes (pairs with SimLook.js).
 * The scene says WHERE the hands and feet go; the kit owns bones, bend sides,
 * reach, draw order, the face and colours.
 *
 *   drawFigure(ctx, c, spec, look, { behind, between }) -> sk   solve + paint in the safe order
 *   solveFigure(spec) -> sk        pure: joints, anchors, reach, warnings (no ctx, no clock)
 *   paintFigure(ctx, c, sk, look, { layer: 'all'|'back'|'mid'|'front', noShadow })
 *   figureLook(c, { skin, hair, hairStyle, outfit, top, bottom, bottomStyle, trim, shoe, shoeStyle,
 *     pattern, sleeves, dupatta, glasses, moustache, girth, mood, look, face, t, seed })   see figureLook
 *   walkPhase(dist, height, 'walk'|'run'|'climb') -> 0..1   cycle phase from distance (no foot slip)
 *   skinFor(i) -> tone index      varied tones for a group
 *   drawPersonGlyph(ctx, c, x, y, h, { col, mood })   bust icon for crowds, voters, counts
 *   ik2(ax, ay, tx, ty, l1, l2, side, { maxK, minK })  the 2-bone solver
 *   figureMetrics(height, build) -> { seatSit, deskTop, reach, cycle, ... }   sizes for props
 * People by role, rows and crowds (start here for any scenario scene):
 *   figureFor(scene, { role, pose, x, y, scale | height, i, ... }) -> spec   throws on unknown role/pose
 *     ROLE_NAMES: student teacher adult elder child worker shopkeeper doctor nurse voter farmer police
 *   drawFigureRow(ctx, c, { x, y, w, height, n, pose, facing, overlap, labels, seat, hands, between })
 *     -> { boxes, figures }   wraps into rows behind, shrinks to fit, glyphs below 44 px
 *   drawCrowd(ctx, c, { rect, n, seed, height }) -> boxes   seeded scatter, back first (crowdLayout: pure)
 *   highlightFigures(ctx, c, figures, k | [i], { tone, chip }) -> { picked, chip }   rings + count chip
 *   groupLook(c, i, { role }) -> look   varied skin, hair, outfit, colours, build for person i
 *
 * spec: { x, y            ground contact under the feet (px)
 *         height           feet to top of head (px): 1.7 * pxPerMetre for an adult
 *         facing = 1       1 right, -1 left, 0 front view (stand, relax, cheer, wave, point, reach-up)
 *         build = 'adult'  'adult' | 'teen' | 'kid'
 *         pose = 'stand'   name, or { name, phase, u, lean, crouch, tilt, toe (heels up 0..1) }:
 *                          stand relax point wave cheer reach-up push pull carry walk run climb throw
 *                          sit cycle (seated: x is the pelvis; feet placed by the solver,
 *                          free hands on the lap; cycle phase 0..1 turns the default crank)
 *         hands            [near, far] world grips {x, y} or null (pose default)
 *         feet             [near, far] world foot contacts {x, y} or null (cycle: the pedals)
 *         hip              {x, y} pins the pelvis (sit, cycle); no autoReach
 *         seat             {x, y} the surface the figure sits on (a chair's seat anchor); sets hip
 *         ground           (x) => y under a foot (stairs, slopes)
 *         autoReach = true crouch/lean may change so `hands` are reachable }
 * Front view: near = the figure's arm/leg on screen right.
 * Layers: back = shadow, far arm, far leg (side view: far hand behind both legs); mid = near leg, torso, head;
 * front = near arm (front view: both arms). Put a held object in `between`
 * (hands land over it), a hugged one in `behind`. Two figures: draw one fully,
 * then the other. sk.anchors: hand[2] (exact grip when reachable), foot[2],
 * head {x,y,r}, hip, seat, shoulder, top, elbow[2], knee[2], bounds. sk.warnings:
 * [{ code, limb, over }], code hand-far | hand-near | leg-far | tiny |
 * unknown-pose; data, never thrown.
 * Size: >= 90 px for a readable face, >= 60 px with dot eyes; below 44 px use
 * drawPersonGlyph. Moods: smile happy sad oops think squint effort.
 * Side view is a 3/4 view: near shoulder and leg on the back side, far eye
 * foreshortened at the face edge, nose on the profile; a forward reach brings
 * the near shoulder forward. Seats too high for the feet dangle the shins.
 * Look: chunky parts, each with a rim of its own darker tone (about 2 px at
 * 170 px, scaled with the person; never black ink), one light from the upper
 * left (core shadow + thin rim light on the lit edge; hair: a lit disc, no
 * hairline band), contact shadows. Hands: open, curled round a world grip
 * (spec.hands), or pointing (the near hand of 'point'),
 * everyday Indian work clothes (tee, shirt, kurta, kurti + dupatta, a plain
 * drape, coat, scrubs, uniform; never religious, caste or national dress).
 * Idle life: pass look.t (seconds) and the figure blinks, glances and breathes
 * (phase from look.seed; groupLook sets seed = i). t = 0 or absent: still.
 * Colours: tokens only; skin is 4 fixed tones and cloth names (CLOTH_NAMES:
 * denim khaki cream ...) are token hues at fixed s/l, so a person looks the
 * same in both themes.
 */
import { W, mix, alpha, lighten, darken, luma, hsl, hslOf, ellipse, drawShadow, mulberry32, pill, chipSize } from './SimLook.js';
import { lookOf as lookProfile } from './lookProfile.js';

// Colour maths memo: a figure derives the same few dozen shades every frame (crowds of 40+ people),
// so each (colour, amount) result is computed once. Bounded; cleared when it grows.
const CMEMO = new Map();
const memo = (k, fn) => { let v = CMEMO.get(k); if (v === undefined) { if (CMEMO.size > 6000) CMEMO.clear(); v = fn(); CMEMO.set(k, v); } return v; };
const mMix = (a, b, t) => memo(`m${a}|${b}|${t}`, () => mix(a, b, t));
const mAlpha = (a, k) => memo(`a${a}|${k}`, () => alpha(a, k));
const mLighten = (a, t) => memo(`l${a}|${t}`, () => lighten(a, t));
const mDarken = (a, t) => memo(`d${a}|${t}`, () => darken(a, t));

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pt = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

// Fractions of height. The head is well bigger than life (0.13) so the face
// reads and the figure has cartoon appeal; legs stay near life so poses and
// props stay true (the torso gives up what the head gains). Stand top of
// head = height exactly.
const BUILDS = {
  adult: { head: 0.25, neck: 0.018, torso: 0.238, thigh: 0.246, shin: 0.236, ankle: 0.032, upper: 0.165, fore: 0.16,
    rUpper: 0.036, rFore: 0.031, rWrist: 0.026, rThigh: 0.058, rKnee: 0.046, rAnkle: 0.04, hand: 0.039,
    chest: 0.19, waist: 0.16, span: 0.1, foot: 0.1 },
  teen: { head: 0.275, neck: 0.016, torso: 0.241, thigh: 0.231, shin: 0.219, ankle: 0.035, upper: 0.16, fore: 0.15,
    rUpper: 0.034, rFore: 0.03, rWrist: 0.025, rThigh: 0.055, rKnee: 0.044, rAnkle: 0.038, hand: 0.038,
    chest: 0.18, waist: 0.155, span: 0.094, foot: 0.098 },
  kid: { head: 0.33, neck: 0.01, torso: 0.243, thigh: 0.199, shin: 0.188, ankle: 0.04, upper: 0.148, fore: 0.138,
    rUpper: 0.038, rFore: 0.034, rWrist: 0.029, rThigh: 0.06, rKnee: 0.05, rAnkle: 0.044, hand: 0.044,
    chest: 0.2, waist: 0.19, span: 0.1, foot: 0.1 },
};
const LEG_STAND = 0.985;           // legs never lock straight
const HEAD_UP = 0.94;              // head centre sits this many radii above the neck top
const LAT = 0.03;                  // 3/4 side view: near/far leg offset across the body (fraction of height)

/**
 * Two-bone IK with a fixed hinge side: the joint sits on the (-uy, ux) side of
 * the root->end line for side = +1. Side view: elbow side = facing, knee side
 * = -facing (a hinge folds one way whatever the bone points at, so it never
 * flips). The end is clamped to maxK (arms 0.97: never a plank) of the bone sum.
 */
export function ik2(ax, ay, tx, ty, l1, l2, side, o = {}) {
  const maxR = (l1 + l2) * (o.maxK ?? 0.97);
  const minR = Math.max(Math.abs(l1 - l2) + 1e-3, (l1 + l2) * (o.minK ?? 0.25));
  let dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy);
  if (d < 1e-6) { dx = 0; dy = 1; d = 1; }
  const ux = dx / d, uy = dy / d;
  const dd = clamp(d, minR, maxR);
  const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mx = ax + ux * a, my = ay + uy * a;
  return { jx: mx - uy * h * side, jy: my + ux * h * side, ex: ax + ux * dd, ey: ay + uy * dd, miss: d - dd };
}

// -- Poses ----------------------------------------------------------------------
// Local frame, units of height: foot x forward of the root (front view: out
// from the middle), lift up, toe = heel raised 0..1. Hand a = degrees from
// straight down (90 forward, 180 up, -90 back; front view: 90 = out to the
// side), r = fraction of reach.

const foot = (x, lift = 0, toe = 0) => ({ x, lift, toe });
const hand = (a, r) => ({ a, r });
const P = {
  stand: () => ({ lean: 0.5, crouch: 0, tilt: 0, feet: [foot(0.0), foot(0.035, 0, 0.18)], hands: [hand(3, 0.99), hand(8, 0.99)],
    front: { feet: [foot(0.05), foot(0.062)], hands: [hand(7, 0.99), hand(6, 0.99)] } }),
  relax: () => ({ lean: 0, crouch: 0, tilt: -3, feet: [foot(-0.01), foot(0.06, 0, 0.3)], hands: [hand(1, 0.97), hand(8, 0.99)],
    // Head-on: hand on the hip (straight down to the waist edge, so the elbow swings out sideways).
    front: { tilt: 5, feet: [foot(0.075), foot(0.04)], hands: [hand(5, 0.58), hand(6, 0.99)] } }),
  point: () => ({ lean: 3, crouch: 0, feet: [foot(0.0), foot(0.05)], hands: [hand(104, 0.96), hand(8, 0.99)],
    front: { tilt: 4, feet: [foot(0.06), foot(0.06)], hands: [hand(98, 0.96), hand(6, 0.99)] } }),
  wave: (s) => {
    const w = 16 * Math.sin((s.phase ?? 0) * TAU);
    return { lean: 0, crouch: 0, tilt: -3, feet: [foot(0.0), foot(0.04)], hands: [hand(-168 + w * 0.6, 0.92), hand(8, 0.99)],
      front: { tilt: -5, feet: [foot(0.06), foot(0.06)], hands: [hand(140 + w, 0.62), hand(6, 0.99)] } };
  },
  cheer: () => ({ lean: -2, crouch: 0.02, tilt: -8, feet: [foot(0.04), foot(-0.03)], hands: [hand(160, 0.9), hand(-160, 0.9)],
    front: { tilt: -6, feet: [foot(0.08), foot(0.08)], hands: [hand(150, 0.9), hand(150, 0.9)] } }),
  'reach-up': () => ({ lean: 0, crouch: 0, tilt: -12, feet: [foot(0.0, 0, 1), foot(0.0, 0, 1)], hands: [hand(172, 0.96), hand(-176, 0.96)],
    front: { tilt: -8, feet: [foot(0.05, 0, 1), foot(0.05, 0, 1)], hands: [hand(170, 0.96), hand(170, 0.96)] } }),
  push: () => ({ lean: 24, crouch: 0.1, feet: [foot(-0.24, 0, 1), foot(0.12)], hands: [hand(88, 0.9), hand(80, 0.9)] }),
  pull: () => ({ lean: -18, crouch: 0.26, feet: [foot(0.16), foot(-0.2)], hands: [hand(96, 0.9), hand(90, 0.9)] }),
  carry: () => ({ lean: -4, crouch: 0.05, feet: [foot(0.0), foot(0.02)], hands: [hand(58, 0.66), hand(62, 0.66)],
    front: { feet: [foot(0.06), foot(0.06)], hands: [hand(40, 0.62), hand(40, 0.62)] } }),
  walk: (s) => {
    const p = (s.phase ?? 0) * TAU, sn = Math.sin(p), cs = Math.cos(p);
    return { lean: 3, crouch: 0.03 + 0.02 * Math.cos(2 * p),
      feet: [foot(0.17 * sn, 0.05 * Math.max(0, cs)), foot(-0.17 * sn, 0.05 * Math.max(0, -cs))],
      hands: [hand(-24 * sn - 5, 0.97), hand(26 * sn + 4, 0.97)] };   // 3/4: the near hand swings mostly behind, never across the thighs
  },
  run: (s) => {
    const p = (s.phase ?? 0) * TAU, sn = Math.sin(p), cs = Math.cos(p);
    return { lean: 12, crouch: 0.14 + 0.05 * Math.cos(2 * p),
      feet: [foot(0.24 * sn, 0.14 * Math.max(0, cs), cs < 0 ? 0.6 : 0), foot(-0.24 * sn, 0.14 * Math.max(0, -cs), cs > 0 ? 0.6 : 0)],
      hands: [hand(-50 * sn + 28, 0.55), hand(50 * sn + 28, 0.55)] };
  },
  climb: (s) => {
    const p = (s.phase ?? 0) * TAU, sn = Math.sin(p), cs = Math.cos(p);
    return { lean: 8, crouch: 0.04,
      feet: [foot(0.16 * sn, 0.1 * Math.max(0, cs)), foot(-0.16 * sn, 0.1 * Math.max(0, -cs))],
      hands: [hand(-20 * sn - 2, 0.92), hand(22 * sn + 8, 0.9)] };
  },
  // Seated: the pelvis is pinned (spec.seat / spec.hip, else a default seat
  // height) and the feet are placed by the solver (shin vertical when it can
  // be); free hands rest on the lap. Cycle: torso leans, feet go round a crank.
  sit: () => ({ lean: -2, crouch: 0, sit: true, feet: null, hands: null, front: { feet: null, hands: null } }),
  cycle: (s) => ({ lean: 28, crouch: 0, sit: true, cycle: true, phase: s.phase ?? 0, feet: null, hands: [hand(76, 0.88), hand(80, 0.88)],
    front: { feet: null, hands: [hand(28, 0.9), hand(28, 0.9)] } }),
};
// Keyframed one-shot, u 0..1. Hand angles are unwrapped (-200 = up and over),
// so a blend swings over the top, never under. The throwing arm is the far one
// (it winds up behind the head, never across the face).
const THROW = [
  { u: 0, lean: -10, crouch: 0.1, feet: [foot(0.2), foot(-0.16)], hands: [hand(100, 0.82), hand(-100, 0.92)] },
  { u: 0.4, lean: -4, crouch: 0.12, feet: [foot(0.22), foot(-0.17)], hands: [hand(80, 0.72), hand(-165, 0.62)] },
  { u: 0.62, lean: 12, crouch: 0.13, feet: [foot(0.23), foot(-0.16, 0, 1)], hands: [hand(30, 0.7), hand(-235, 0.96)] },
  { u: 1, lean: 26, crouch: 0.16, feet: [foot(0.24), foot(-0.1, 0.05, 1)], hands: [hand(-30, 0.72), hand(-320, 0.86)] },
];

function keyframes(keys, u) {
  const t = clamp(u ?? 0, 0, 1);
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].u) i++;
  const A = keys[i], B = keys[i + 1];
  const k = clamp((t - A.u) / (B.u - A.u || 1), 0, 1);
  const e = k * k * (3 - 2 * k);
  const L = (x, y) => lerp(x, y, e);
  return {
    lean: L(A.lean, B.lean), crouch: L(A.crouch, B.crouch),
    feet: A.feet.map((q, j) => foot(L(q.x, B.feet[j].x), L(q.lift, B.feet[j].lift), L(q.toe, B.feet[j].toe))),
    hands: A.hands.map((h, j) => hand(L(h.a, B.hands[j].a), L(h.r, B.hands[j].r))),
  };
}

function poseOf(pose, front) {
  const s = typeof pose === 'string' ? { name: pose } : { name: 'stand', ...(pose || {}) };
  const known = s.name === 'throw' || !!P[s.name];
  let base = s.name === 'throw' ? keyframes(THROW, s.u) : (P[s.name] ?? P.stand)(s);
  if (front) base = { ...base, lean: 0, crouch: base.crouch * 0.5, ...(base.front || { feet: [foot(0.06), foot(0.06)] }) };
  const feet = s.toe == null || !base.feet ? base.feet : base.feet.map((q) => ({ ...q, toe: clamp(s.toe, 0, 1) }));
  return {
    lean: s.lean ?? base.lean, crouch: clamp(s.crouch ?? base.crouch, 0, 1), tilt: (s.tilt ?? 0) + (base.tilt ?? 0),
    feet, hands: base.hands, known, name: s.name, sit: !!base.sit, cycle: !!base.cycle, phase: s.phase ?? 0,
  };
}

// -- Solve ------------------------------------------------------------------------

// Pelvis joint to the bottom of the trouser seat (what rests on a chair), per view.
function seatDrop(B, Hh, front) {
  return (front ? Math.max(B.rThigh, 0.02 * B.torso + 0.31 * B.waist) : 0.02 * B.torso + 0.416 * B.waist) * Hh;
}

/**
 * Body sizes in px for a figure of this height and build, for props that must
 * fit it: seatSit (ground to a seat surface with thighs level), seatDrop
 * (pelvis to seat, side view; seatDropFront head-on), hipSit, deskTop (a desk
 * top at seated elbow height), reach, legL, and cycle { crankR, bbH, hipBack,
 * hipUp } (crank centre relative to the pelvis: bb = hip + (f * hipBack, hipUp)).
 */
export function figureMetrics(height = 170, build = 'adult') {
  const B = BUILDS[build] ?? BUILDS.adult, Hh = Math.max(1, height);
  const thigh = B.thigh * Hh, shin = B.shin * Hh, ankle = B.ankle * Hh, legL = thigh + shin;
  const drop = seatDrop(B, Hh, false), hipSit = ankle + shin;
  // Cycling: at the bottom of the stroke the leg is 93% straight; the seat tube leans back 18 deg.
  const crankR = 0.085 * Hh, bbH = 0.152 * Hh, st = 72 * RAD;
  const a = crankR - ankle, L = 0.93 * legL, sn = Math.sin(st);
  const d = -a * sn + Math.sqrt(Math.max(0, a * a * sn * sn - a * a + L * L));
  return {
    height: Hh, build: BUILDS[build] ? build : 'adult', thigh, shin, ankle, legL, reach: (B.upper + B.fore) * Hh,
    torso: B.torso * Hh, headR: (B.head * Hh) / 2, seatDrop: drop, seatDropFront: seatDrop(B, Hh, true),
    hipSit, seatSit: hipSit - drop, deskTop: hipSit + 0.07 * Hh,
    cycle: { crankR, bbH, hipBack: d * Math.cos(st), hipUp: d * sn },
  };
}

/** Pure pose solve (see the header): same spec, same joints; nothing is cached or timed. */
export function solveFigure(spec) {
  const Hh = Math.max(1, spec.height ?? 170);
  const front = spec.facing === 0;
  const f = front ? 1 : spec.facing === -1 ? -1 : 1;
  const B = BUILDS[spec.build] ?? BUILDS.adult;
  const bone = (k) => B[k] * Hh;
  const [thigh, shin, upper, fore] = [bone('thigh'), bone('shin'), bone('upper'), bone('fore')];
  const T = bone('torso'), headR = bone('head') / 2, ankleH = bone('ankle');
  const ground = typeof spec.ground === 'function' ? spec.ground : null;
  const gy = (x) => (ground ? ground(x) : spec.y);
  const ps = poseOf(spec.pose ?? 'stand', front);
  const warnings = [];
  if (!ps.known) warnings.push({ code: 'unknown-pose', limb: String(ps.name), over: 0 });
  const out = [1, -1];                        // front view: near arm/leg on screen right
  const seated = ps.sit;
  const M = seated ? figureMetrics(Hh, spec.build) : null;
  // The pelvis pin: hip, else seat (the surface the figure rests on), else a seated default.
  let pin = spec.hip ? { x: spec.hip.x, y: spec.hip.y }
    : spec.seat ? { x: spec.seat.x, y: spec.seat.y - seatDrop(B, Hh, front) } : null;
  if (!pin && seated) {
    pin = ps.cycle ? { x: spec.x, y: gy(spec.x) - M.cycle.bbH - M.cycle.hipUp } : { x: spec.x, y: gy(spec.x) - ankleH - shin };
  }

  const contacts = [0, 1].map((i) => {
    const tgt = spec.feet?.[i];
    if (tgt) return { x: tgt.x, y: tgt.y, toe: 0, lift: 0 };
    if (seated && ps.cycle) {
      const C = M.cycle, ang = ps.phase * TAU + (i ? Math.PI : 0);
      const bb = { x: pin.x + (front ? 0 : f * C.hipBack), y: pin.y + C.hipUp };
      return front ? { x: pin.x + out[i] * 0.075 * Hh, y: bb.y + C.crankR * Math.sin(ang), toe: 0, lift: 0 }
        : { x: bb.x + f * C.crankR * Math.cos(ang), y: bb.y + C.crankR * Math.sin(ang), toe: 0, lift: 0 };
    }
    if (seated) {
      if (front) { const x = pin.x + out[i] * 0.07 * Hh; return { x, y: gy(x), toe: 0, lift: 0 }; }
      // Shin vertical when the seat height allows it; a low seat tucks the feet, a high one dangles them.
      const g0 = gy(pin.x + f * thigh), dy = g0 - ankleH - shin - pin.y;
      if (dy > 0.97 * thigh && !spec.feet) {
        // A seat too high for the feet: thighs along the seat, shins hanging (a dangle, never a stand).
        const x = pin.x + f * (0.88 * thigh + (i ? -0.015 : 0.015) * Hh);
        warnings.push({ code: 'leg-far', limb: i ? 'far' : 'near', over: Math.round(dy - thigh) });
        return { x, y: pin.y + 0.16 * thigh + 0.96 * shin + ankleH, toe: 0, lift: 1 };
      }
      const dx = Math.abs(dy) < 0.97 * thigh ? Math.sqrt(thigh * thigh - dy * dy) : (dy < 0 ? 0.45 : 0.3) * thigh;
      const x = pin.x + f * (dx + (i ? -0.015 : 0.015) * Hh);
      return { x, y: gy(x), toe: 0, lift: 0 };
    }
    const pf = ps.feet[i];
    // Side view is a 3/4 view: the near leg stands a little behind (screen side away from the facing), the far one ahead.
    const x = spec.x + (front ? out[i] * Math.abs(pf.x) : f * (pf.x + (i ? LAT : -LAT))) * Hh;
    return { x, y: gy(x) - pf.lift * Hh, toe: pf.toe, lift: pf.lift };
  });
  const ankles = contacts.map((p) => ({ x: p.x, y: p.y - ankleH * (1 - 0.35 * p.toe) }));
  const legL = thigh + shin;

  // Pelvis, torso axes and shoulders for a crouch/lean (feet stay planted).
  const frame = (crouch, lean) => {
    const L = lean * RAD;
    let hip;
    if (pin) hip = { x: pin.x, y: pin.y };
    else {
      const ay = (ankles[0].y + ankles[1].y) / 2;
      hip = { x: spec.x - (front ? 0 : f * 0.3 * T * Math.sin(L)), y: ay - legL * (LEG_STAND - 0.5 * crouch) };
      // A wide stance lowers the hip (a lunge) so neither leg over-stretches.
      for (let i = 0; i < 2; i++) {
        const a = ankles[i];
        const dx = a.x - (hip.x + (front ? out[i] * 0.05 : f * (i ? 0.026 : -0.02)) * Hh), lim = legL * 0.99;
        if (Math.abs(dx) < lim) hip.y = Math.max(hip.y, a.y - Math.sqrt(lim * lim - dx * dx));
      }
    }
    const up = { x: f * Math.sin(L), y: -Math.cos(L) };
    const fwd = { x: f * Math.cos(L), y: Math.sin(L) };
    const at = (u, v) => ({ x: hip.x + up.x * u + fwd.x * v, y: hip.y + up.y * u + fwd.y * v });
    // 3/4 view: the near shoulder is on the back edge of the chest, the far one tucked behind the front edge.
    const sh = front ? [at(T * 0.84, B.span * 0.96 * Hh), at(T * 0.84, -B.span * 0.96 * Hh)]
      : [at(T * 0.85, -0.036 * Hh), at(T * 0.87, 0.04 * Hh)];
    return { hip, up, fwd, at, sh };
  };

  const reach = upper + fore;
  let crouch = ps.crouch, lean = ps.lean;
  const grips = [0, 1].map((i) => spec.hands?.[i] ?? null);
  if (grips.some(Boolean) && !pin && spec.autoReach !== false) {
    const miss = (fr) => grips.reduce((s, g, i) => s + (g ? Math.max(0, Math.hypot(g.x - fr.sh[i].x, g.y - fr.sh[i].y) - 0.95 * reach) : 0), 0);
    if (miss(frame(crouch, lean)) > 0) {
      let best = null, near = null;
      const [l0, l1] = front ? [0, 0] : [ps.lean - 15, ps.lean + 45];
      const c0 = Math.max(0, ps.crouch - 0.5);
      for (let ci = 0; c0 + ci * 0.04 <= 1 + 1e-9; ci++) {
        const cr = Math.min(1, c0 + ci * 0.04);
        for (let ln = l0; ln <= l1 + 1e-9; ln += 2) {
          const cost = 0.8 * Math.abs(cr - ps.crouch) + Math.abs(ln - ps.lean) / 22;
          const m = miss(frame(cr, ln));
          if (m === 0) { if (!best || cost < best.cost) best = { cr, ln, cost }; }
          else if (!near || m + cost * 0.01 < near.v) near = { cr, ln, v: m + cost * 0.01 };
        }
      }
      const pick = best ?? near;
      if (pick) { crouch = pick.cr; lean = pick.ln; }
    }
  }
  const fr = frame(crouch, lean);
  const { hip, at, sh } = fr;

  // Legs: side view knee forward of the hip-ankle line; front view knee out.
  const legs = [0, 1].map((i) => {
    const hp = front ? at(0, out[i] * 0.05 * Hh) : at(0, (seated ? (i ? -0.012 : 0.012) : (i ? 0.026 : -0.02)) * Hh);
    const r = ik2(hp.x, hp.y, ankles[i].x, ankles[i].y, thigh, shin, front ? -out[i] : -f, { maxK: 0.995, minK: 0.2 });
    if (r.miss > 2) {
      warnings.push({ code: 'leg-far', limb: i ? 'far' : 'near', over: Math.round(r.miss) });
      // A seated foot that cannot reach dangles (the shoe goes with the ankle).
      if (seated) contacts[i] = { x: r.ex, y: r.ey + ankleH, toe: 0, lift: 1 };
    }
    const ankle = { x: r.ex, y: r.ey };
    // Head-on, a knee bends toward the viewer: it shows on the hip-ankle line
    // (seated: just below the pelvis, the thigh coming straight at the viewer).
    const knee = !front ? { x: r.jx, y: r.jy }
      : seated && !ps.cycle ? { x: hp.x + out[i] * 0.012 * Hh, y: hp.y + 0.05 * Hh }
        : (() => { const k = pt(hp, ankle, thigh / legL); return { x: k.x - out[i] * 0.007 * Hh, y: k.y }; })();   // knees a touch in: no posts
    return { hip: hp, knee, ankle };
  });
  // Seated free hands rest on the lap (side) or the knees (front).
  const lap = (i) => {
    if (!seated || ps.cycle) return null;
    const lg = legs[i];
    return front ? { x: lg.knee.x - out[i] * 0.012 * Hh, y: lg.knee.y - B.rKnee * Hh * 0.5 }
      : { x: lerp(lg.hip.x, lg.knee.x, 0.66), y: lerp(lg.hip.y, lg.knee.y, 0.66) - B.rThigh * Hh * 0.9 };
  };

  // Arms: pose polar target or the world grip.
  const arms = [0, 1].map((i) => {
    let s = sh[i];
    let tx, ty;
    const rest = grips[i] ? null : lap(i);
    if (grips[i]) { tx = grips[i].x; ty = grips[i].y; }
    else if (rest) { tx = rest.x; ty = rest.y; }
    else {
      const h = ps.hands[i], a = h.a * RAD;
      tx = s.x + (front ? out[i] : f) * Math.sin(a) * h.r * reach; ty = s.y + Math.cos(a) * h.r * reach;
      // 3/4: a hanging far hand stays hidden behind the hip and far thigh (no knuckles peeking past the leg).
      if (!front && i === 1 && Math.cos(a) > 0.7) tx = s.x - f * 0.012 * Hh;
      // 3/4: a hanging near hand rests at the back edge of the thigh, beside the leg, not on top of it.
      else if (!front && i === 0 && Math.abs(h.a) < 15) tx = s.x - f * 0.03 * Hh;
    }
    if (!front && i === 0) {
      // 3/4: a near arm that reaches forward brings its shoulder forward too (it never sweeps across the face).
      const k = clamp(((tx - s.x) * fr.fwd.x + (ty - s.y) * fr.fwd.y) / reach, 0, 1);
      s = { x: s.x + fr.fwd.x * 0.05 * Hh * k, y: s.y + fr.fwd.y * 0.05 * Hh * k };
    }
    // A free arm may hang nearly straight (a gentle elbow); a gripping one keeps the 0.97 safety margin.
    const mk = grips[i] ? 0.97 : 0.988;
    // Head-on, a hand nearer than the arm's length (knees, handlebars, a carried box) means the forearm
    // comes toward the viewer: draw it foreshortened (elbows by the sides, never chicken wings).
    const sc = front && (rest || (grips[i] && ty > s.y)) ? clamp(Math.hypot(tx - s.x, ty - s.y) / (0.95 * reach), 0.6, 1) : 1;
    const [lu, lf] = [upper * (0.3 + 0.7 * sc), fore * sc];
    let r = ik2(s.x, s.y, tx, ty, lu, lf, f, { maxK: mk, minK: 0.25 });
    if (front) {
      // No hinge side is visible head-on: the elbow goes out from the body, and down.
      const q = ik2(s.x, s.y, tx, ty, lu, lf, -1, { maxK: mk, minK: 0.25 });
      const score = (j) => out[i] * (j.jx - s.x) + 0.5 * (j.jy - s.y);
      if (score(q) > score(r)) r = q;
    }
    if (grips[i] && r.miss > 0.5) warnings.push({ code: 'hand-far', limb: i ? 'far' : 'near', over: Math.round(r.miss) });
    if (grips[i] && r.miss < -0.5) warnings.push({ code: 'hand-near', limb: i ? 'far' : 'near', over: Math.round(-r.miss) });
    return { shoulder: s, elbow: { x: r.jx, y: r.jy }, hand: { x: r.ex, y: r.ey } };
  });

  const neck = at(T, 0);
  const hl = ((front ? 0 : lean / 2) + ps.tilt) * RAD;
  const hd = bone('neck') + headR * HEAD_UP;
  // Side view: the head sits a touch forward of the neck (a relaxed S-curve, never a soldier's brace).
  const head = { x: neck.x + f * (Math.sin(hl) * hd + (front ? 0 : 0.014 * Hh)), y: neck.y - Math.cos(hl) * hd, r: headR, tilt: hl };
  if (Hh < 44) warnings.push({ code: 'tiny', limb: 'body', over: Math.round(44 - Hh) });

  const pts = [hip, ...arms.flatMap((a) => [a.elbow, a.hand]), ...legs.flatMap((l) => [l.knee, l.ankle]), ...contacts];
  const pad = B.rThigh * Hh;
  const bounds = {
    x0: Math.min(head.x - headR * 1.15, ...pts.map((p) => p.x)) - pad, x1: Math.max(head.x + headR * 1.15, ...pts.map((p) => p.x)) + pad,
    y0: Math.min(head.y - headR * 1.15, ...pts.map((p) => p.y)) - 1, y1: Math.max(...contacts.map((p) => p.y)) + 1,
  };
  const sk = {
    height: Hh, facing: front ? 0 : f, view: front ? 'front' : 'side', f, build: spec.build ?? 'adult', B, pose: ps.name, seated,
    crouch, lean, reach, warnings, contacts, groundY: ground ? null : spec.y, grip: grips.map(Boolean),
    joints: { hip, neck, head, arms, legs, fr },
    anchors: {
      hand: arms.map((a) => a.hand), foot: contacts.map((p) => ({ x: p.x, y: p.y })), head: { x: head.x, y: head.y, r: headR },
      hip, seat: { x: hip.x, y: hip.y + seatDrop(B, Hh, front) }, shoulder: sh[0], top: { x: head.x, y: head.y - headR },
      elbow: arms.map((a) => a.elbow), knee: legs.map((l) => l.knee), bounds,
    },
  };
  const log = globalThis.__simFigureLog;
  if (Array.isArray(log)) log.push({ height: Hh, headR, facing: sk.facing, warnings: warnings.map((w) => ({ ...w })), bounds: { ...bounds } });
  return sk;
}

// -- Look ---------------------------------------------------------------------------

const SKIN = [[0.66, 0.8], [0.52, 0.64], [0.46, 0.48], [0.42, 0.32]];   // [s, l] per tone
/** Varied tones for person i in a group (medium tones first). */
export function skinFor(i) { return [1, 2, 0, 3][((i % 4) + 4) % 4]; }

// Cloth tones by name: a palette token's hue at a fixed saturation and
// lightness, so clothes read the same in both themes. [token, s, l]
const CLOTH = {
  denim: ['s1', 0.36, 0.32], navy: ['s5', 0.32, 0.25], charcoal: ['s5', 0.08, 0.3], khaki: ['s8', 0.3, 0.55],
  olive: ['s3', 0.24, 0.33], brown: ['s8', 0.34, 0.3], cream: ['s2', 0.42, 0.86], stone: ['s1', 0.1, 0.64],
  maroon: ['s6', 0.44, 0.34], rust: ['s8', 0.56, 0.46], white: ['s1', 0.22, 0.94], teal: ['s7', 0.42, 0.32],
  mustard: ['s2', 0.62, 0.5], plum: ['s5', 0.34, 0.38], sage: ['s3', 0.22, 0.6], sky: ['s1', 0.5, 0.7],
};
export const CLOTH_NAMES = Object.keys(CLOTH);
const OUTFITS = ['tee', 'shirt', 'kurta', 'kurti', 'drape', 'coat', 'scrubs', 'uniform'];
const HAIR_STYLES = ['short', 'sidepart', 'crop', 'curly', 'long', 'bun', 'buns', 'braid', 'ponytail', 'bob', 'none'];
const HAIR_ALIAS = { teacher: 'bun' };

// A palette token name ('s3'), a cloth name ('khaki') or an already resolved colour.
function tone(c, v) {
  if (typeof v !== 'string') return null;
  if (CLOTH[v]) { const [k, s, l] = CLOTH[v]; return hsl(hslOf(c[k]).h, s, l); }
  if (/^s[1-8]$/.test(v) && c[v]) return c[v];
  return v;
}

/**
 * Resolved colours for a figure. o: { skin 0..3 | colour, hair 0..2 | colour
 * (black, brown, grey), hairStyle short sidepart crop curly long bun buns braid
 * ponytail bob none, outfit tee shirt kurta kurti drape coat scrubs uniform,
 * top, bottom, trim (dupatta, drape, border), shoe (colour, token or cloth name),
 * bottomStyle trousers skirt long-skirt shorts, shoeStyle shoe sneaker sandal,
 * pattern plain stripes check dots, sleeves short long rolled, dupatta, glasses,
 * moustache, girth 0.85..1.2, mood, look {x,y}, face, t (idle: blink, glance,
 * breath; 0 = still), seed (idle phase) }
 */
export function figureLook(c, o = {}) {
  if (o.__fig) return o;
  const dark = luma(c.bgDeep) < 0.5;
  const hue = hslOf(mMix(c.s8, c.warning, 0.3)).h - 6;
  const skin = typeof o.skin === 'string' ? o.skin : hsl(hue, ...SKIN[clamp(o.skin ?? 1, 0, 3) | 0]);
  const hairs = [hsl(hue - 10, 0.3, dark ? 0.15 : 0.12), hsl(hue - 6, 0.48, dark ? 0.29 : 0.26), hsl(hue, 0.06, dark ? 0.76 : 0.7)];
  const hair = typeof o.hair === 'string' ? o.hair : hairs[clamp(o.hair ?? 0, 0, 2) | 0];
  const outfit = OUTFITS.includes(o.outfit) ? o.outfit : 'tee';
  const hs = HAIR_ALIAS[o.hairStyle] ?? o.hairStyle;
  const top = tone(c, o.top) ?? (outfit === 'coat' ? tone(c, 'white') : c.s1);
  return {
    __fig: true, c, dark, skin, hair, outfit, top,
    bottom: tone(c, o.bottom) ?? tone(c, 'denim'),
    bottomStyle: ['trousers', 'skirt', 'long-skirt', 'shorts'].includes(o.bottomStyle) ? o.bottomStyle : outfit === 'drape' ? 'long-skirt' : 'trousers',
    shoe: tone(c, o.shoe) ?? tone(c, 'brown'),
    shoeStyle: ['shoe', 'sneaker', 'sandal'].includes(o.shoeStyle) ? o.shoeStyle : 'shoe',
    sole: dark ? mLighten(c.label, 0.2) : mMix(c.bgDeep, c.label, 0.06),
    trim: tone(c, o.trim) ?? tone(c, 'cream'),
    pattern: o.pattern ?? 'plain', dupatta: !!o.dupatta, glasses: !!o.glasses, moustache: !!o.moustache,
    girth: clamp(o.girth ?? 1, 0.85, 1.2),
    blush: mAlpha(mMix(skin, c.s6, 0.55), 0.42),
    ink: hsl(hue - 10, 0.35, 0.12),
    iris: hsl(hue - 16, 0.5, 0.25),
    rim: dark ? 0.3 : 0.16,
    sleeves: o.sleeves ?? (['coat', 'uniform', 'kurta'].includes(outfit) ? 'long' : outfit === 'kurti' ? 'rolled' : 'short'),
    hairStyle: HAIR_STYLES.includes(hs) ? hs : 'short', face: o.face ?? true,
    mood: o.mood ?? 'smile', look: o.look, t: o.t ?? 0, seed: o.seed ?? 0,
  };
}

// -- Paint helpers -------------------------------------------------------------------

// A tapered capsule from a (radius ra) to b (radius rb): one limb segment.
function capsule(ctx, a, b, ra, rb) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.max(1e-6, Math.hypot(dx, dy));
  const ang = Math.atan2(dy, dx);
  const phi = Math.acos(clamp((ra - rb) / d, -0.98, 0.98));
  ctx.moveTo(a.x + ra * Math.cos(ang + phi), a.y + ra * Math.sin(ang + phi));   // own subpath: no joining line
  ctx.arc(a.x, a.y, ra, ang + phi, ang + TAU - phi);
  ctx.arc(b.x, b.y, rb, ang - phi, ang + phi);
  ctx.closePath();
}

// A tapered segment with a round start and a flat (slightly bowed) open end: a sleeve.
function openEnd(ctx, a, b, ra, rb) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.max(1e-6, Math.hypot(dx, dy));
  const ux = dx / d, uy = dy / d, nx = -uy, ny = ux, ang = Math.atan2(dy, dx);
  ctx.moveTo(b.x + nx * rb, b.y + ny * rb);
  ctx.lineTo(a.x + nx * ra, a.y + ny * ra);
  ctx.arc(a.x, a.y, ra, ang + Math.PI / 2, ang + Math.PI * 1.5);
  ctx.lineTo(b.x - nx * rb, b.y - ny * rb);
  ctx.quadraticCurveTo(b.x + ux * rb * 0.3, b.y + uy * rb * 0.3, b.x + nx * rb, b.y + ny * rb);
  ctx.closePath();
}

// Flat two-tone fill (glyphs): shade everywhere, the main colour nudged toward
// the light, a rim of the darker tone under it (rimW px, 0 = none).
function cushion(ctx, pathFn, col, dx, dy, shade = 0.2, rimW = 0) {
  if (lookProfile().figShade === false) { shade = 0; dx = 0; dy = 0; }   // a flat look: one fill
  ctx.save();
  if (rimW) {
    ctx.beginPath();
    pathFn();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = mDarken(col, 0.5);
    ctx.lineWidth = rimW * 2;
    ctx.stroke();
  }
  ctx.beginPath();
  pathFn();
  ctx.fillStyle = mDarken(col, shade);
  ctx.fill();
  ctx.clip();
  ctx.translate(dx, dy);
  ctx.beginPath();
  pathFn();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.restore();
}

// The rim tone of a part: its own colour, well darkened and leaning to the
// shadow violet (a coloured line, never black ink).
const rimOf = (L, col) => mMix(mDarken(col, 0.5), L.c.s5, 0.2);

// The chunky edge (card rule 3): one stroke of the rim tone UNDER a part, half
// of it showing outside the fill. Stroked under, so a chain of capsules shows
// no seam at its joints, and a part painted later rims itself off the one
// before it. L.rimW is in the current units (0 = none).
function edgeUnder(ctx, L, pathFn, col) {
  if (!L.rimW) return;
  ctx.beginPath();
  pathFn();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = rimOf(L, col);
  ctx.lineWidth = L.rimW * 2;
  ctx.stroke();
}

// One-light fill, light from the upper left: a cool rim on the lower-right
// edge, a violet-leaning core shadow inside it, the lit colour over the rest.
// (dx, dy) = the shift toward the light in the current units. edge = the
// chunky rim under the part (off for a part that is tucked under another).
function shade(ctx, L, pathFn, col, dx, dy, k = 0.2, rim = true, edge = true) {
  const sh = mMix(mDarken(col, k), L.c.s5, 0.1);
  ctx.save();
  if (edge) edgeUnder(ctx, L, pathFn, col);
  if (lookProfile().figShade === false) {   // a flat look: the part in its own colour, no core shadow or rim light
    ctx.beginPath(); pathFn(); ctx.fillStyle = col; ctx.fill(); ctx.restore(); return;
  }
  ctx.beginPath();
  pathFn();
  ctx.fillStyle = sh;
  ctx.fill();
  ctx.clip();
  // The lit part: the shape shifted toward the light leaves a core shadow on the far side.
  ctx.beginPath();
  ctx.translate(dx, dy);
  pathFn();
  ctx.translate(-dx, -dy);
  ctx.clip();
  ctx.beginPath();
  pathFn();
  ctx.fillStyle = rim ? mLighten(col, L.dark ? 0.2 : 0.26) : col;
  ctx.fill();
  if (rim) {
    // A thin rim light on the lit edge: the main colour shifted a hair away from the light.
    const e = 0.34;
    ctx.translate(-dx * e, -dy * e);
    ctx.beginPath();
    pathFn();
    ctx.fillStyle = col;
    ctx.fill();
  }
  ctx.restore();
}

const chainPath = (ctx, chain) => { for (let i = 0; i + 1 < chain.length; i++) capsule(ctx, chain[i][0], chain[i + 1][0], chain[i][1], chain[i + 1][1]); };

// A chain of tapered segments [[p, r], ...], lit and rimmed.
function limb(ctx, L, chain, col, k = 0.34) {
  const r0 = Math.max(1.6, chain[0][1]);
  shade(ctx, L, () => chainPath(ctx, chain), col, -r0 * k, -r0 * k * 1.1);
}

// Painting copy of a solve: girth widens the chest, waist and limbs (bones stay).
function bodyOf(sk, L) {
  const g = L.girth;
  if (g === 1) return sk;
  const q = Math.sqrt(g), B = sk.B;
  return { ...sk, B: { ...B, chest: B.chest * g, waist: B.waist * g * g, rUpper: B.rUpper * q, rFore: B.rFore * q, rThigh: B.rThigh * g, rKnee: B.rKnee * q } };
}

// Idle life from L.t (0 = still): a slow breath bob and a sway of the head.
function headOf(sk, L) {
  const h = sk.joints.head;
  if (!L.t) return h;
  const s = L.seed;
  return { ...h, y: h.y + Math.sin(L.t * TAU / 3.6 + s * 1.9) * 0.0045 * sk.height, tilt: h.tilt + Math.sin(L.t * TAU / 7.3 + s * 2.7) * 0.035 };
}

// 0..1 eyelid closure: a quick blink every few seconds, phase from the seed.
function blinkOf(L) {
  if (!L.t) return 0;
  const s = L.seed, per = 3.4 + 2.2 * ((s * 0.618) % 1), u = (L.t + per * ((s * 0.377) % 1)) % per;
  return u < 0.16 ? Math.sin((u / 0.16) * Math.PI) : 0;
}

// A hand at the end of a forearm. kind: 'open' (fingers together, a little
// cupped), 'grip' (fingers curled round what the hand holds, the thumb hooked
// over the knuckles), 'point' (a loose fist, the index finger out, thumb up).
// Local frame: x along the forearm toward the fingers, +y the thumb side, in
// units of r (so the rim and the lines scale with the hand).
function paintHand(ctx, L0, from, at, r, col, side, kind = 'open') {
  const a = Math.atan2(at.y - from.y, at.x - from.x);
  const ux = Math.cos(a), uy = Math.sin(a);
  // Thumb side: a hanging hand shows its thumb toward `side` (screen x); a raised or reaching one, on top.
  let px = -uy, py = ux;
  const s = Math.abs(uy) > 0.72 ? (Math.sign(px * side) || 1) : (py < 0 ? 1 : -1);
  px *= s; py *= s;
  const R = r;
  const L = L0.rimW ? { ...L0, rimW: L0.rimW / R } : L0;
  // World light (upper left) in the hand's local frame.
  const wx = -0.22, wy = -0.26;
  const lx = (wx * ux + wy * uy), ly = (wx * px + wy * py);
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.transform(ux * R, uy * R, px * R, py * R, 0, 0);
  ctx.translate(-0.2, 0);
  // Creases and finger splits: the rim tone, thin (never ink).
  const lines = (fn, k = 0.7) => {
    ctx.beginPath();
    fn();
    ctx.strokeStyle = mAlpha(rimOf(L, col), k);
    ctx.lineWidth = Math.max(0.1, 0.9 / R);
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  const cap = (x0, y0, x1, y1, r0, r1) => capsule(ctx, { x: x0, y: y0 }, { x: x1, y: y1 }, r0, r1);
  if (kind === 'point') {
    // A loose fist: narrow at the wrist, the curled fingers a rounded front.
    const fist = () => {
      ctx.moveTo(-0.5, -0.3);
      ctx.bezierCurveTo(-0.1, -0.46, 0.5, -0.52, 0.82, -0.36);
      ctx.quadraticCurveTo(1.04, -0.22, 1.0, 0.04);
      ctx.quadraticCurveTo(0.98, 0.3, 0.8, 0.42);
      ctx.bezierCurveTo(0.5, 0.52, 0.0, 0.42, -0.5, 0.3);
      ctx.closePath();
    };
    shade(ctx, L, fist, col, lx, ly, 0.18, false);
    // The index finger straight out along the forearm line; the thumb up over the fist.
    shade(ctx, L, () => cap(0.5, -0.2, 1.56, -0.26, 0.2, 0.16), col, lx * 0.6, ly * 0.6, 0.14, false);
    shade(ctx, L, () => cap(0.26, 0.26, 0.72, 0.6, 0.18, 0.14), col, lx * 0.6, ly * 0.6, 0.14, false);
    if (r >= 4.5) lines(() => {
      ctx.moveTo(0.84, 0.02); ctx.quadraticCurveTo(1.0, 0.1, 0.84, 0.2);
      ctx.moveTo(0.78, 0.24); ctx.quadraticCurveTo(0.92, 0.32, 0.74, 0.4);
    });
  } else if (kind === 'grip') {
    // Fingers curled round the thing at the wrist: three knuckle bumps down the front, the thumb hooked over them.
    const fist = () => {
      ctx.moveTo(-0.5, -0.32);
      ctx.bezierCurveTo(-0.1, -0.5, 0.56, -0.58, 0.9, -0.4);
      ctx.quadraticCurveTo(1.1, -0.3, 1.02, -0.14);
      ctx.quadraticCurveTo(1.14, 0.0, 1.02, 0.14);
      ctx.quadraticCurveTo(1.12, 0.3, 0.94, 0.4);
      ctx.bezierCurveTo(0.6, 0.54, 0.0, 0.46, -0.5, 0.3);
      ctx.closePath();
    };
    shade(ctx, L, fist, col, lx, ly, 0.18, false);
    shade(ctx, L, () => cap(0.1, 0.22, 0.86, 0.3, 0.18, 0.15), col, lx * 0.6, ly * 0.6, 0.14, false);
    if (r >= 4.5) lines(() => {
      ctx.moveTo(0.74, -0.14); ctx.quadraticCurveTo(0.94, -0.14, 1.0, -0.12);
      ctx.moveTo(0.76, 0.12); ctx.quadraticCurveTo(0.94, 0.14, 1.0, 0.14);
    });
  } else {
    // A mitt: one silhouette (one rim), narrow at the wrist (tucked under the cuff of the forearm),
    // fingers together with three soft tip bumps, the thumb a bump on the palm's lower edge. Two short
    // finger ticks and a thumb crease, faint, only when the hand is big enough.
    const palm = () => {
      ctx.moveTo(-0.5, -0.3);
      ctx.bezierCurveTo(-0.1, -0.44, 0.6, -0.6, 1.1, -0.42);
      ctx.quadraticCurveTo(1.4, -0.34, 1.36, -0.14);
      ctx.quadraticCurveTo(1.56, -0.08, 1.5, 0.12);
      ctx.quadraticCurveTo(1.58, 0.28, 1.36, 0.4);
      ctx.bezierCurveTo(1.2, 0.48, 1.0, 0.5, 0.86, 0.48);
      ctx.quadraticCurveTo(0.9, 0.72, 0.7, 0.76);
      ctx.quadraticCurveTo(0.44, 0.78, 0.26, 0.5);
      ctx.bezierCurveTo(0.1, 0.36, -0.2, 0.3, -0.5, 0.28);
      ctx.closePath();
    };
    shade(ctx, L, palm, col, lx, ly, 0.18, false);
    if (r >= 6) lines(() => {
      ctx.moveTo(1.36, -0.12); ctx.lineTo(1.2, -0.12);
      ctx.moveTo(1.44, 0.16); ctx.lineTo(1.26, 0.14);
      ctx.moveTo(0.34, 0.5); ctx.quadraticCurveTo(0.56, 0.42, 0.8, 0.5);
    }, 0.5);
  }
  ctx.restore();
}

function paintShoe(ctx, sk, i, L, dk) {
  const B = sk.B, Hh = sk.height, ankle = sk.joints.legs[i].ankle, contact = sk.contacts[i];
  const h = Math.max(4, 0.055 * Hh), sole = Math.max(1.6, h * 0.24);
  const sandal = L.shoeStyle === 'sandal', sneaker = L.shoeStyle === 'sneaker';
  const D = (col) => (dk ? mDarken(col, dk) : col);
  const upper = D(sandal ? L.skin : L.shoe);
  const soleCol = D(sandal ? mDarken(L.shoe, 0.12) : sneaker ? mLighten(mMix(L.sole, L.shoe, 0.1), 0.5) : mDarken(L.shoe, 0.45));
  ctx.save();
  if (sk.view === 'front') {
    const w = B.foot * Hh * 0.8, x = ankle.x + (i ? -1 : 1) * w * 0.12, y = contact.y;
    const hh = sandal ? h * 0.62 : h * 0.95;
    const cap = () => {
      ctx.moveTo(x - w / 2, y - sole * 0.6);
      ctx.bezierCurveTo(x - w / 2, y - hh * 1.05, x + w / 2, y - hh * 1.05, x + w / 2, y - sole * 0.6);
      ctx.closePath();
    };
    shade(ctx, L, cap, upper, -w * 0.1, -hh * 0.14, 0.22);
    ctx.beginPath();
    ctx.roundRect?.(x - w / 2 - 1, y - sole - 0.5, w + 2, sole + 0.5, sole / 2) ?? ctx.rect(x - w / 2, y - sole, w, sole);
    ctx.fillStyle = soleCol;
    ctx.fill();
    ctx.lineCap = 'round';
    if (sandal) {
      // A chappal's toe strap.
      ctx.beginPath(); ctx.moveTo(x - w * 0.36, y - hh * 0.45); ctx.quadraticCurveTo(x, y - hh * 1.05, x + w * 0.36, y - hh * 0.45);
      ctx.strokeStyle = D(L.shoe); ctx.lineWidth = Math.max(1.4, hh * 0.3); ctx.stroke();
    } else if (sneaker) {
      ctx.beginPath(); ctx.moveTo(x - w * 0.16, y - hh * 0.74); ctx.lineTo(x + w * 0.16, y - hh * 0.74);
      ctx.strokeStyle = mAlpha(mDarken(upper, 0.3), 0.8); ctx.lineWidth = Math.max(1, h * 0.12); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(x - w * 0.14, y - hh * 0.62, w * 0.12, hh * 0.1, -0.3, 0, TAU);
      ctx.fillStyle = mAlpha(mLighten(upper, 0.5), 0.55); ctx.fill();
    }
    ctx.restore();
    return;
  }
  const f = sk.f, len = B.foot * Hh * 1.06;
  const heel = ankle.x - f * len * 0.28, toe = ankle.x + f * len * 0.72;
  const tilt = contact.toe ? -f * contact.toe * 0.55 : 0;
  ctx.translate(toe, contact.y);
  ctx.rotate(tilt);
  ctx.scale(f, 1);
  const L0 = -(toe - heel) * f;          // heel x in the local frame (toe at 0)
  const hh = sandal ? h * 0.66 : h;
  // A shoe, not a slipper: a heel counter rising to the collar, the vamp sloping to a rounded toe.
  const body = () => {
    ctx.moveTo(L0 + hh * 0.12, -sole * 0.5);
    ctx.bezierCurveTo(L0 - hh * 0.14, -hh * 0.3, L0 - hh * 0.1, -hh * 0.98, L0 + hh * 0.3, -hh * 1.1);
    ctx.quadraticCurveTo(L0 * 0.7, -hh * 1.14, L0 * 0.5, -hh * 1.0);
    ctx.bezierCurveTo(L0 * 0.28, -hh * 0.9, -hh * 0.72, -hh * 0.84, -hh * 0.24, -hh * 0.5);
    ctx.bezierCurveTo(hh * 0.06, -hh * 0.3, hh * 0.08, -sole * 0.5, -hh * 0.2, -sole * 0.5);
    ctx.closePath();
  };
  shade(ctx, L, body, upper, hh * 0.08, -hh * 0.18, 0.22);
  // Sole (a chappal's is thicker) with a heel block, then the seams and a lace line, a stripe or the straps.
  const st = sandal ? sole * 1.15 : sneaker ? sole * 1.35 : sole;
  ctx.fillStyle = soleCol;
  ctx.beginPath();
  ctx.roundRect?.(L0 - hh * 0.04, -st - 0.4, -L0 + hh * 0.06, st + 0.4, st / 2) ?? ctx.rect(L0, -st, -L0, st);
  ctx.fill();
  if (!sandal) {
    ctx.beginPath();
    ctx.roundRect?.(L0 - hh * 0.02, -st * 1.7, hh * 0.5, st * 1.7, [st * 0.5, st * 0.5, 0, 0]) ?? ctx.rect(L0, -st * 1.7, hh * 0.5, st * 1.7);
    ctx.fill();
  }
  ctx.lineCap = 'round';
  if (!sandal && h >= 6) {
    // Toe cap and heel counter seams in the rim tone.
    ctx.beginPath();
    ctx.moveTo(-hh * 0.66, -sole * 0.6); ctx.quadraticCurveTo(-hh * 0.6, -hh * 0.6, -hh * 0.44, -hh * 0.78);
    ctx.moveTo(L0 + hh * 0.52, -sole * 0.6); ctx.quadraticCurveTo(L0 + hh * 0.54, -hh * 0.6, L0 + hh * 0.42, -hh * 1.0);
    ctx.strokeStyle = mAlpha(rimOf(L, upper), 0.7); ctx.lineWidth = Math.max(0.8, h * 0.08);
    ctx.stroke();
  }
  ctx.beginPath();
  if (sandal) {
    ctx.moveTo(-len * 0.22, -st * 0.9); ctx.quadraticCurveTo(L0 * 0.32, -hh * 0.95, L0 * 0.5, -st * 0.9);
    ctx.strokeStyle = D(L.shoe); ctx.lineWidth = Math.max(1.4, h * 0.2);
  } else if (sneaker) {
    ctx.moveTo(L0 * 0.78, -st * 1.5); ctx.quadraticCurveTo(L0 * 0.5, -hh * 0.72, L0 * 0.22, -st * 1.5);
    ctx.strokeStyle = mAlpha(D(L.c.s6), 0.85); ctx.lineWidth = Math.max(1, h * 0.14);
  } else {
    ctx.moveTo(L0 * 0.56, -hh * 0.9); ctx.lineTo(L0 * 0.32, -hh * 0.66);
    ctx.strokeStyle = mAlpha(mLighten(upper, 0.35), 0.8); ctx.lineWidth = Math.max(1, h * 0.1);
  }
  ctx.stroke();
  ctx.restore();
}

function paintLeg(ctx, sk, i, L, dk) {
  const leg = sk.joints.legs[i], Hh = sk.height, B = sk.B, front = sk.view === 'front';
  const bs = L.bottomStyle;
  const D = (col) => (dk ? mDarken(col, dk) : col);
  const cloth = D(L.bottom), skin = D(L.skin);
  // Calf side: behind the shin (side view), outward head-on.
  const back = front ? (i ? -1 : 1) : -sk.f;
  const k2a = Math.hypot(leg.ankle.x - leg.knee.x, leg.ankle.y - leg.knee.y) || 1;
  const calfPt = (t, push) => {
    const p = pt(leg.knee, leg.ankle, t);
    return { x: p.x + (front ? back : back * Math.abs((leg.ankle.y - leg.knee.y) / k2a)) * push * Hh, y: p.y + (front ? 0 : 0) };
  };
  // Trousers fall over the shoe; a bare foot goes into it.
  if (bs === 'trousers') paintShoe(ctx, sk, i, L, dk);
  if (bs === 'trousers') {
    const rT = B.rThigh * Hh * (front ? 1.02 : 0.96), rK = B.rKnee * Hh * (front ? 1.0 : 0.96), rH = B.rAnkle * Hh * 1.08;
    const hem = pt(leg.knee, leg.ankle, 0.97);
    const path = () => {
      capsule(ctx, leg.hip, leg.knee, rT, rK);
      openEnd(ctx, leg.knee, hem, rK, rH);
    };
    const r0 = Math.max(1.6, rT);
    shade(ctx, L, path, cloth, -r0 * 0.3, -r0 * 0.33, 0.2);
    // A crease behind the knee and one down the front of the shin: folds that follow the leg.
    if (Hh >= 70) {
      const kn = leg.knee, d1 = Math.hypot(kn.x - leg.hip.x, kn.y - leg.hip.y) || 1;
      const ux = (kn.x - leg.hip.x) / d1, uy = (kn.y - leg.hip.y) / d1;
      ctx.save();
      ctx.beginPath(); path(); ctx.clip();
      ctx.beginPath();
      const bx = -uy * back * (front ? 0 : 1), by = ux * back * (front ? 0 : 1);
      ctx.moveTo(kn.x + bx * rK * 0.9 - ux * rK * 0.5, kn.y + by * rK * 0.9 - uy * rK * 0.5);
      ctx.quadraticCurveTo(kn.x + bx * rK * 0.2, kn.y + by * rK * 0.2 + rK * 0.1, kn.x - bx * rK * 0.1 + ux * rK * 0.6, kn.y - by * rK * 0.1 + uy * rK * 0.6);
      ctx.strokeStyle = mAlpha(mDarken(cloth, 0.4), 0.35);
      ctx.lineWidth = Math.max(0.8, 0.006 * Hh);
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }
  } else {
    // Bare legs (under a skirt; shorts cover the thigh): a soft calf, a slim ankle.
    const chain = [[leg.hip, B.rThigh * Hh * 0.84], [leg.knee, B.rKnee * Hh * 0.74], [calfPt(0.3, 0.006), B.rKnee * Hh * 0.84], [leg.ankle, B.rAnkle * Hh * 0.6]];
    limb(ctx, L, chain, skin, 0.3);
    if (bs === 'shorts') {
      const end = pt(leg.hip, leg.knee, 0.62);
      shade(ctx, L, () => openEnd(ctx, leg.hip, end, B.rThigh * Hh * 0.98, B.rThigh * Hh * 0.98), cloth, -B.rThigh * Hh * 0.3, -B.rThigh * Hh * 0.33, 0.2);
    }
  }
  if (bs !== 'trousers') paintShoe(ctx, sk, i, L, dk);
}

function torsoPath(ctx, sk) {
  const { at } = sk.joints.fr, Hh = sk.height, B = sk.B, T = B.torso * Hh;
  const P = (u, v) => at(u * T, v * Hh);
  const c = B.chest, w = B.waist;
  const pts = sk.view === 'front'
    // Front: rounded shoulders, a soft taper to the waist.
    ? [[P(-0.02, -w * 0.62)], [P(0.62, -c * 0.68), P(0.3, -w * 0.66)], [P(0.9, -c * 0.66), P(0.84, -c * 0.72)],
      [P(1.03, -c * 0.24), P(1.0, -c * 0.56)], [P(1.03, c * 0.24), P(1.06, 0)], [P(0.9, c * 0.66), P(1.0, c * 0.56)],
      [P(0.62, c * 0.68), P(0.84, c * 0.72)], [P(-0.02, w * 0.62), P(0.3, w * 0.66)],
      [P(-0.02, -w * 0.62), P(-0.1, 0)]]
    // 3/4: a gently curved back, a rounded shoulder, the chest carried over the hips.
    : [[P(-0.02, -w * 0.5)], [P(0.62, -c * 0.48), P(0.3, -w * 0.46)], [P(1.0, -c * 0.2), P(0.97, -c * 0.56)],
      [P(1.04, c * 0.24), P(1.08, 0.0)], [P(0.62, c * 0.62), P(0.98, c * 0.62)], [P(-0.02, w * 0.58), P(0.26, c * 0.56)],
      [P(-0.02, -w * 0.5), P(-0.1, 0)]];
  ctx.moveTo(pts[0][0].x, pts[0][0].y);
  for (const [p, cp] of pts.slice(1)) {
    if (cp) ctx.quadraticCurveTo(cp.x, cp.y, p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

// A point a fraction s down a leg (hip 0, ankle 1).
function legAt(sk, leg, s) {
  const th = sk.B.thigh, sh = sk.B.shin, d = s * (th + sh);
  return d <= th ? pt(leg.hip, leg.knee, d / th) : pt(leg.knee, leg.ankle, (d - th) / sh);
}

// Cloth that hangs from the waist over both legs to a fraction s of the leg
// (a skirt, a kurta or coat skirt). Follows the legs, so it swings in a stride
// and lies over the lap when seated. Returns the hem points [back, front].
function hangPath(ctx, sk, s, flare, waistU = 0.04) {
  const { at, fwd } = sk.joints.fr, Hh = sk.height, B = sk.B, T = B.torso * Hh, front = sk.view === 'front';
  const ws = B.waist * Hh * (front ? 0.62 : 0.52);
  const ax = front ? { x: 1, y: 0 } : { x: fwd.x, y: fwd.y };
  const r = (lerp(B.rThigh, B.rAnkle, s) * 1.05 + flare) * Hh;
  const hem = sk.joints.legs.map((l) => legAt(sk, l, s)).map((p) => ({ x: p.x, y: p.y + r * 0.25 }));
  const proj = (p) => p.x * ax.x + p.y * ax.y;
  let [hb, hf] = proj(hem[0]) < proj(hem[1]) ? hem : [hem[1], hem[0]];
  hb = { x: hb.x - ax.x * r, y: hb.y - ax.y * r };
  hf = { x: hf.x + ax.x * r, y: hf.y + ax.y * r };
  const w0 = at(waistU * T, -ws), w1 = at(waistU * T, ws);
  const hip0 = at(-0.1 * T, -ws * 1.12), hip1 = at(-0.1 * T, ws * 1.12);
  const mid = pt(hb, hf, 0.5), dn = Math.max(0, Math.hypot(hf.x - hb.x, hf.y - hb.y)) * 0.06;
  // Wound the same way as torsoPath, so a long top fills as one piece.
  ctx.moveTo(w1.x, w1.y);
  ctx.quadraticCurveTo(hip1.x, hip1.y, hf.x, hf.y);
  ctx.quadraticCurveTo(mid.x, mid.y + dn, hb.x, hb.y);
  ctx.quadraticCurveTo(hip0.x, hip0.y, w0.x, w0.y);
  ctx.closePath();
  return [hb, hf, mid, dn];
}

// A fabric print, clipped to pathFn, in the torso's frame.
function fabric(ctx, sk, L, pathFn, col, kind) {
  if (!kind || kind === 'plain' || lookProfile().fabric === false) return;
  const Hh = sk.height, { hip, up } = sk.joints.fr, step = Math.max(3.2, 0.03 * Hh);
  ctx.save();
  ctx.beginPath();
  pathFn();
  ctx.clip();
  ctx.translate(hip.x, hip.y);
  ctx.rotate(Math.atan2(up.x, -up.y));
  const ink = luma(col) > 0.55 ? mAlpha(mDarken(col, 0.4), 0.45) : mAlpha(mLighten(col, 0.5), 0.4);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  const R = Hh * 0.5;
  if (kind === 'stripes' || kind === 'check') {
    ctx.lineWidth = step * (kind === 'check' ? 0.22 : 0.3);
    ctx.beginPath();
    for (let x = -R; x <= R; x += step) { ctx.moveTo(x, -R * 1.2); ctx.lineTo(x, R * 0.6); }
    if (kind === 'check') for (let y = -R * 1.2; y <= R * 0.6; y += step) { ctx.moveTo(-R, y); ctx.lineTo(R, y); }
    ctx.stroke();
  } else if (kind === 'dots') {
    ctx.beginPath();
    let row = 0;
    for (let y = -R * 1.2; y <= R * 0.6; y += step, row++) {
      for (let x = -R + (row % 2) * step * 0.5; x <= R; x += step) { ctx.moveTo(x + step * 0.13, y); ctx.arc(x, y, step * 0.13, 0, TAU); }
    }
    ctx.fill();
  }
  ctx.restore();
}

function paintArm(ctx, sk, i, L, dk) {
  const arm = sk.joints.arms[i], Hh = sk.height, B = sk.B;
  const skin = dk ? mDarken(L.skin, dk) : L.skin;
  const top = dk ? mDarken(L.top, dk) : L.top;
  const s = arm.shoulder, e = arm.elbow, h = arm.hand;
  const [ru, rf, rw] = [B.rUpper * Hh, B.rFore * Hh, B.rWrist * Hh];
  const sleeve = L.sleeves;
  const s0 = pt(s, e, 0.08);   // the sleeve's round top sits inside the shoulder line
  const chain = sleeve === 'long' ? [[s0, ru * 1.14], [e, rf * 1.14], [pt(e, h, 0.86), rw * 1.24]]
    : sleeve === 'rolled' ? [[s0, ru * 1.14], [e, rf * 1.14], [pt(e, h, 0.3), rf * 1.12]]
      : [[s0, ru * 1.06], [pt(s, e, 0.62), ru * 1.16]];
  // Contact shadow on the body (front arms only).
  if (!dk) {
    ctx.save();
    ctx.beginPath();
    torsoPath(ctx, sk);
    ctx.clip();
    ctx.translate(0.012 * Hh * (sk.view === 'front' ? (i ? -1 : 1) : sk.f), 0.008 * Hh);
    ctx.beginPath();
    chainPath(ctx, [[s, ru * 1.1], [e, rf * 1.1], [h, rw * 1.1]]);
    ctx.fillStyle = mAlpha(L.ink, L.dark ? 0.26 : 0.14);
    ctx.fill();
    ctx.restore();
  }
  if (sleeve !== 'long') limb(ctx, L, [[pt(s, e, 0.4), ru * 0.88], [e, rf * 0.9], [pt(e, h, 0.55), rf * 0.92], [h, rw * 0.92]], skin);
  // The sleeve: round at the shoulder, a slightly flared open end, a hem line, one fold at the elbow.
  const end = chain[chain.length - 1], prev = chain[chain.length - 2];
  const r0 = Math.max(1.6, chain[0][1]);
  const sleevePath = () => {
    for (let k = 0; k + 2 < chain.length; k++) capsule(ctx, chain[k][0], chain[k + 1][0], chain[k][1], chain[k + 1][1]);
    openEnd(ctx, prev[0], end[0], prev[1], end[1]);
  };
  shade(ctx, L, sleevePath, top, -r0 * 0.34, -r0 * 0.37, 0.2);
  const ux = end[0].x - prev[0].x, uy = end[0].y - prev[0].y, d = Math.hypot(ux, uy) || 1, nx = -uy / d, ny = ux / d;
  ctx.beginPath();
  ctx.moveTo(end[0].x + nx * end[1] * 0.9 - ux / d * 1.2, end[0].y + ny * end[1] * 0.9 - uy / d * 1.2);
  ctx.lineTo(end[0].x - nx * end[1] * 0.9 - ux / d * 1.2, end[0].y - ny * end[1] * 0.9 - uy / d * 1.2);
  ctx.strokeStyle = mDarken(top, 0.2);
  ctx.lineWidth = Math.max(1, 0.008 * Hh);
  ctx.lineCap = 'round';
  ctx.stroke();
  if (sleeve !== 'short' && Hh >= 70) {
    ctx.save();
    ctx.beginPath(); sleevePath(); ctx.clip();
    // Two short creases on the inside of the elbow.
    const fa = Math.atan2(h.y - e.y, h.x - e.x), ua = Math.atan2(s.y - e.y, s.x - e.x);
    let mid = (fa + ua) / 2;
    if (Math.abs(fa - ua) > Math.PI) mid += Math.PI;
    ctx.beginPath();
    for (const k of [0.45, 0.85]) ctx.arc(e.x, e.y, rf * k, mid - 0.5, mid + 0.5);
    ctx.strokeStyle = mAlpha(mDarken(top, 0.4), 0.3);
    ctx.lineWidth = Math.max(0.8, 0.005 * Hh);
    ctx.stroke();
    ctx.restore();
  }
  // The hand: curled round a world grip (a push presses with an open palm), pointing for the near hand of 'point', else open.
  const kind = sk.grip?.[i] && sk.pose !== 'push' ? 'grip' : sk.pose === 'point' && i === 0 ? 'point' : 'open';
  paintHand(ctx, L, e, h, B.hand * Hh * 1.08, skin, sk.view === 'front' ? (i ? 1 : -1) : sk.f, kind);
}

// The neck, under the collar, with the jaw's shadow on it.
function paintNeck(ctx, sk, L, hd) {
  const Hh = sk.height, { at } = sk.joints.fr, T = sk.B.torso * Hh;
  const base = at(T * 0.92, 0), top = pt(sk.joints.neck, hd, 0.5);
  const r = (sk.build === 'kid' ? 0.036 : 0.031) * Hh;
  const col = mDarken(L.skin, 0.04);
  // No rim: the neck is tucked under the collar and the jaw.
  shade(ctx, L, () => capsule(ctx, base, top, r, r * 0.92), col, -r * 0.3, -r * 0.2, 0.16, true, false);
  ctx.save();
  ctx.beginPath();
  capsule(ctx, base, top, r, r * 0.92);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(hd.x, hd.y + hd.r * 0.84, hd.r * 0.72, hd.r * 0.4, 0, 0, TAU);
  ctx.fillStyle = mAlpha(mDarken(L.skin, 0.4), 0.26);
  ctx.fill();
  ctx.restore();
}

// A band of cloth along a polyline (dupatta, a drape): border-coloured edge, body inside.
function band(ctx, L, pts, w, col, edge) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 2) {
      const q = pts[i], r = pts[i + 1] ?? pts[i];
      ctx.quadraticCurveTo(q.x, q.y, r.x, r.y);
    }
  };
  ctx.translate(w * 0.12, w * 0.16);
  path(); ctx.strokeStyle = mAlpha(mDarken(col, 0.6), 0.28); ctx.lineWidth = w; ctx.stroke();
  ctx.translate(-w * 0.12, -w * 0.16);
  if (L.rimW) { path(); ctx.strokeStyle = rimOf(L, col); ctx.lineWidth = w + 2 * L.rimW; ctx.stroke(); }
  path(); ctx.strokeStyle = edge ?? mDarken(col, 0.18); ctx.lineWidth = w; ctx.stroke();
  path(); ctx.strokeStyle = col; ctx.lineWidth = w * (edge ? 0.64 : 0.8); ctx.stroke();
  ctx.restore();
}

// Below the shirt: trouser seat, skirts, the lower half of a kurta or coat.
function paintLower(ctx, sk, L, lap = false) {
  const { at, fwd } = sk.joints.fr, Hh = sk.height, B = sk.B, T = B.torso * Hh, front = sk.view === 'front';
  const o = L.outfit, bs = L.bottomStyle;
  const lx = -0.03 * Hh, ly = -0.025 * Hh;
  if (bs === 'skirt' || bs === 'long-skirt') {
    const s = bs === 'skirt' ? 0.62 : 0.97;
    let hem;
    const p = () => { hem = hangPath(ctx, sk, s, bs === 'skirt' ? 0.05 : 0.035, 0.04); };
    shade(ctx, L, p, L.bottom, lx, ly);
    // A border band at the hem (a drape's border in the trim colour).
    ctx.save();
    ctx.beginPath(); p(); ctx.clip();
    const [hb, hf, mid, dn] = hem;
    ctx.beginPath();
    ctx.moveTo(hb.x, hb.y); ctx.quadraticCurveTo(mid.x, mid.y + dn, hf.x, hf.y);
    ctx.strokeStyle = o === 'drape' ? L.trim : mDarken(L.bottom, 0.18);
    ctx.lineWidth = (o === 'drape' ? 0.05 : 0.03) * Hh;
    ctx.stroke();
    ctx.restore();
  } else if (!LONG_TOPS.includes(o)) {
    // The hip block of the trousers: as wide as the waist, rounding over the seat into the thighs.
    const ws = B.waist * Hh * (front ? 0.62 : 0.5), wf = front ? ws : ws * 1.1;
    const col = bs === 'shorts' || bs === 'trousers' ? L.bottom : L.skin;
    const hipBlock = () => {
      const W0 = at(0.03 * T, -ws), W1 = at(0.03 * T, wf), S0 = at(-0.3 * T, -ws * 0.94), F1 = at(-0.3 * T, wf * 0.9);
      const c0 = at(-0.12 * T, -ws * 1.1), c1 = at(-0.12 * T, wf * 1.04), cb = at(-0.4 * T, 0);
      ctx.moveTo(W0.x, W0.y); ctx.lineTo(W1.x, W1.y);
      ctx.quadraticCurveTo(c1.x, c1.y, F1.x, F1.y);
      ctx.quadraticCurveTo(cb.x, cb.y, S0.x, S0.y);
      ctx.quadraticCurveTo(c0.x, c0.y, W0.x, W0.y);
      ctx.closePath();
    };
    shade(ctx, L, hipBlock, col, -ws * 0.14, -ws * 0.12, 0.2);
  }
  if (lap && LONG_TOPS.includes(o)) paintLongTop(ctx, sk, L, false);
}

// A kurta, kurti or coat: the torso and the part that hangs over the thighs as
// one piece of cloth (withTorso), or only the hanging part (laid over a lap).
function paintLongTop(ctx, sk, L, withTorso) {
  const { at } = sk.joints.fr, Hh = sk.height, B = sk.B, T = B.torso * Hh, front = sk.view === 'front', o = L.outfit;
  const s = o === 'coat' ? 0.46 : o === 'kurta' ? 0.42 : 0.38;
  let hem;
  const p = () => { if (withTorso) torsoPath(ctx, sk); hem = hangPath(ctx, sk, s, o === 'coat' ? 0.03 : 0.02, 0.2); };
  shade(ctx, L, p, L.top, -0.035 * Hh, -0.028 * Hh, 0.18);
  fabric(ctx, sk, L, p, L.top, L.pattern);
  ctx.save();
  ctx.beginPath(); p(); ctx.clip();
  const [hb, hf, mid, dn] = hem;
  ctx.beginPath();
  ctx.moveTo(hb.x, hb.y); ctx.quadraticCurveTo(mid.x, mid.y + dn, hf.x, hf.y);
  ctx.strokeStyle = o === 'kurti' ? L.trim : mDarken(L.top, 0.14);
  ctx.lineWidth = (o === 'coat' ? 0.012 : 0.028) * Hh;
  ctx.stroke();
  // Side slits (kurta, kurti) or the coat's front opening.
  ctx.lineWidth = Math.max(1, 0.006 * Hh);
  ctx.strokeStyle = mAlpha(mDarken(L.top, 0.35), 0.6);
  if (front && o !== 'coat') {
    for (const sx of [-1, 1]) {
      const a = at(-0.06 * T, sx * B.waist * Hh * 0.7), b = pt(sx < 0 ? hb : hf, mid, 0.06);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  ctx.restore();
}
const LONG_TOPS = ['kurta', 'kurti', 'coat'];

function paintTorso(ctx, sk, L, lap = false) {
  const { at, fwd, up } = sk.joints.fr, Hh = sk.height, B = sk.B, T = B.torso * Hh;
  const front = sk.view === 'front', f = sk.f, o = L.outfit;
  const lx = front ? -0.035 * Hh : (fwd.x * 0.03 - up.x * 0.01) * Hh - 0.012 * Hh, ly = front ? -0.028 * Hh : (fwd.y * 0.03 - 0.02) * Hh;
  const tp = () => torsoPath(ctx, sk);
  if (LONG_TOPS.includes(o) && !lap) paintLongTop(ctx, sk, L, true);
  else { shade(ctx, L, tp, L.top, lx, ly, 0.18); fabric(ctx, sk, L, tp, L.top, L.pattern); }
  const ink = mDarken(L.top, 0.3);
  const lw = Math.max(1, 0.008 * Hh);
  ctx.save();
  ctx.beginPath();
  tp();
  ctx.clip();
  // Folds that follow the form: from the armpits toward the waist (front), under the near arm (3/4).
  if (Hh >= 80 && o !== 'drape') {
    const Q = (u, v) => at(T * u, v * Hh);
    ctx.beginPath();
    if (front) {
      for (const s of [-1, 1]) {
        const a = Q(0.74, s * B.chest * 0.6), m = Q(0.5, s * B.chest * 0.42), e = Q(0.3, s * B.waist * 0.26);
        ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(m.x, m.y, e.x, e.y);
      }
      const w0 = Q(0.14, -B.waist * 0.3), w1 = Q(0.1, -B.waist * 0.05), w2 = Q(0.16, B.waist * 0.24);
      ctx.moveTo(w0.x, w0.y); ctx.quadraticCurveTo(w1.x, w1.y + 0.01 * Hh, w2.x, w2.y);
    } else {
      const a = Q(0.72, -B.chest * 0.12), m = Q(0.5, B.chest * 0.02), e = Q(0.34, B.chest * 0.24);
      ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(m.x, m.y, e.x, e.y);
      const w0 = Q(0.16, -B.waist * 0.1), w2 = Q(0.12, B.waist * 0.4);
      ctx.moveTo(w0.x, w0.y); ctx.quadraticCurveTo((w0.x + w2.x) / 2, (w0.y + w2.y) / 2 + 0.012 * Hh, w2.x, w2.y);
    }
    ctx.strokeStyle = mAlpha(mDarken(L.top, 0.42), 0.3);
    ctx.lineWidth = Math.max(0.9, 0.006 * Hh);
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  // Hem band (tops that end at the waist).
  if (o === 'tee' || o === 'scrubs' || o === 'drape') {
    const w = B.chest * Hh, h0 = at(0.05 * T, -w), h1 = at(0.05 * T, w);
    ctx.strokeStyle = mDarken(L.top, 0.12);
    ctx.lineWidth = Math.max(2, 0.018 * Hh);
    ctx.beginPath(); ctx.moveTo(h0.x, h0.y); ctx.lineTo(h1.x, h1.y); ctx.stroke();
  }
  // Neckline: the skin of the neck opening, then the collar.
  const N = (u, v) => at(T * u, v * Hh);
  const v = front ? 0 : 0.02;
  const nw = (front ? 0.05 : 0.026) * Hh;
  const deep = o === 'scrubs' || o === 'coat' ? 0.16 : o === 'kurti' || o === 'drape' ? 0.1 : o === 'shirt' || o === 'uniform' ? 0.07 : 0.06;
  const neckOpen = () => {
    const c0 = N(1.06, v - nw / Hh), c1 = N(1.06, v + nw / Hh), b = N(1.04 - deep * (T > 0 ? Hh / T : 1) * 0.9, v);
    ctx.moveTo(c0.x, c0.y);
    if (o === 'scrubs' || o === 'coat') ctx.lineTo(b.x, b.y);
    else ctx.quadraticCurveTo(lerp(c0.x, b.x, 0.2), b.y, b.x, b.y);
    if (o === 'scrubs' || o === 'coat') ctx.lineTo(c1.x, c1.y);
    else ctx.quadraticCurveTo(lerp(c1.x, b.x, 0.2), b.y, c1.x, c1.y);
    ctx.closePath();
  };
  if (o === 'coat') {
    // The shirt inside the open coat, then the lapels.
    ctx.beginPath();
    const a0 = N(1.08, -0.06), a1 = N(1.08, 0.06), bt = N(-0.1, 0);
    ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.lineTo(bt.x + 0.012 * Hh, bt.y); ctx.lineTo(bt.x - 0.012 * Hh, bt.y); ctx.closePath();
    ctx.fillStyle = L.trim;
    ctx.fill();
  }
  ctx.beginPath(); neckOpen();
  ctx.fillStyle = mDarken(L.skin, 0.12);
  ctx.fill();
  ctx.beginPath(); neckOpen();
  ctx.strokeStyle = mDarken(L.top, 0.16);
  ctx.lineWidth = Math.max(1.4, 0.012 * Hh);
  ctx.stroke();
  ctx.lineCap = 'round';
  if (o === 'shirt' || o === 'uniform' || o === 'coat') {
    // Collar wings.
    for (const s of front ? [-1, 1] : [1]) {
      const a = N(1.07, v + s * nw / Hh * 1.05), b = N(0.9, v + s * 0.012), cc = N(0.98, v + s * nw / Hh * 1.6);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(cc.x, cc.y); ctx.lineTo(b.x, b.y); ctx.closePath();
      ctx.fillStyle = o === 'coat' ? mLighten(L.top, 0.3) : mLighten(L.top, 0.16); ctx.fill();
      ctx.strokeStyle = mDarken(L.top, 0.18); ctx.lineWidth = lw * 0.8; ctx.stroke();
    }
  }
  if (o === 'shirt' || o === 'uniform' || o === 'kurta' || o === 'kurti') {
    // Placket and buttons.
    const len = o === 'kurta' || o === 'kurti' ? 0.38 : 0.92;
    const pv = front ? 0 : 0.034;
    const p0 = N(1.0 - deep * 0.6, pv), p1 = N(1.0 - len, pv);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
    ctx.strokeStyle = mAlpha(ink, 0.55); ctx.lineWidth = lw; ctx.stroke();
    const nb = o === 'kurta' || o === 'kurti' ? 3 : 4;
    for (let k = 0; k < nb; k++) {
      const q = pt(p0, p1, (k + 0.6) / (nb + 0.2));
      ctx.beginPath(); ctx.arc(q.x + (front ? 0.008 * Hh : 0), q.y, Math.max(0.9, 0.0075 * Hh), 0, TAU);
      ctx.fillStyle = o === 'kurti' ? L.trim : mLighten(L.top, 0.55); ctx.fill();
    }
  }
  if (o === 'kurta' || o === 'kurti') {
    // Band collar trim.
    ctx.beginPath(); neckOpen();
    ctx.strokeStyle = o === 'kurti' ? L.trim : mDarken(L.top, 0.22);
    ctx.lineWidth = Math.max(1.6, 0.016 * Hh); ctx.stroke();
  }
  if (o === 'shirt' || o === 'uniform' || o === 'scrubs') {
    // Chest pocket(s).
    for (const s of o === 'uniform' && front ? [-1, 1] : [front ? 1 : 1]) {
      const pc = N(0.66, front ? s * B.chest * 0.42 : B.chest * 0.18), w = 0.042 * Hh, h = 0.046 * Hh;
      ctx.beginPath();
      ctx.roundRect?.(pc.x - w / 2, pc.y - h / 2, w, h, w * 0.18) ?? ctx.rect(pc.x - w / 2, pc.y - h / 2, w, h);
      ctx.strokeStyle = mAlpha(ink, 0.5); ctx.lineWidth = lw * 0.9; ctx.stroke();
      if (o === 'uniform') { ctx.beginPath(); ctx.moveTo(pc.x - w / 2, pc.y - h * 0.15); ctx.lineTo(pc.x + w / 2, pc.y - h * 0.15); ctx.stroke(); }
    }
  }
  if (o === 'coat') {
    // Lapel edges and the coat's front opening.
    for (const s of front ? [-1, 1] : [1]) {
      const a = N(1.06, v + s * 0.05), b = N(0.62, v + s * 0.035), d = N(-0.1, v + s * 0.012);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y);
      ctx.strokeStyle = mDarken(L.top, 0.2); ctx.lineWidth = lw * 1.1; ctx.stroke();
    }
  }
  if (o === 'uniform') {
    // Belt with a plain buckle.
    const b0 = N(0.06, -B.chest), b1 = N(0.06, B.chest);
    ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y);
    ctx.strokeStyle = mDarken(L.bottom, 0.35); ctx.lineWidth = 0.03 * Hh; ctx.stroke();
    const bk = N(0.06, front ? 0 : B.chest * 0.42), w = 0.03 * Hh;
    ctx.beginPath(); ctx.roundRect?.(bk.x - w / 2, bk.y - w * 0.45, w, w * 0.9, w * 0.15) ?? ctx.rect(bk.x - w / 2, bk.y - w * 0.45, w, w * 0.9);
    ctx.fillStyle = L.c.gold ?? L.c.warning; ctx.fill();
  }
  ctx.restore();
  // Shoulder straps (uniform), the dupatta, the drape: over the torso, under the arms.
  if (o === 'uniform') {
    for (const s of front ? [-1, 1] : [1]) {
      const a = N(1.0, front ? s * B.chest * 0.28 : -0.01), b = N(0.97, front ? s * B.chest * 0.58 : 0.03);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = mDarken(L.top, 0.25); ctx.lineWidth = 0.022 * Hh; ctx.lineCap = 'round'; ctx.stroke();
    }
  }
  if (L.dupatta) {
    const w = 0.052 * Hh;
    if (front) band(ctx, L, [N(1.0, -B.chest * 0.5), N(0.55, -0.01), N(0.58, 0), N(0.55, 0.01), N(1.0, B.chest * 0.5)], w, L.trim);
    else band(ctx, L, [N(1.04, -0.01), N(0.9, B.chest * 0.5), N(0.45, B.chest * 0.52)], w, L.trim);
  }
  if (o === 'drape') {
    const w = 0.07 * Hh;
    if (front) band(ctx, L, [N(0.02, B.waist * 0.5), N(0.45, 0.0), N(1.04, -B.chest * 0.42)], w, L.bottom, L.trim);
    else band(ctx, L, [N(0.02, B.chest * 0.42), N(0.55, B.chest * 0.3), N(1.03, -B.chest * 0.32)], w * 0.85, L.bottom, L.trim);
  }
}

// Hair in head units (r = 1, facing right, y down). The cap over the skull.
function hairCap(ctx, style, front) {
  const pulled = style === 'long' || style === 'bun' || style === 'buns' || style === 'braid' || style === 'ponytail';
  const top = style === 'curly' ? -1.24 : pulled ? -1.15 : -1.27;
  if (front) {
    if (style === 'crop') {
      ctx.moveTo(-1.03, -0.02);
      ctx.bezierCurveTo(-1.08, -0.72, -0.6, -1.13, 0, -1.11);
      ctx.bezierCurveTo(0.6, -1.13, 1.08, -0.72, 1.03, -0.02);
      ctx.quadraticCurveTo(0.98, -0.48, 0.74, -0.6);
      ctx.quadraticCurveTo(0.3, -0.66, 0, -0.76);
      ctx.quadraticCurveTo(-0.3, -0.66, -0.74, -0.6);
      ctx.quadraticCurveTo(-0.98, -0.48, -1.03, -0.02);
    } else {
      ctx.moveTo(-1.07, 0.1);
      ctx.bezierCurveTo(-1.18, -0.74, -0.66, top - 0.02, 0.02, top);
      ctx.bezierCurveTo(0.7, top - 0.02, 1.18, -0.74, 1.07, 0.1);
      if (pulled) {
        // A centre parting, the hair swept softly back over both temples.
        ctx.quadraticCurveTo(1.0, -0.26, 0.86, -0.42);
        ctx.bezierCurveTo(0.6, -0.5, 0.2, -0.56, 0.02, -0.84);
        ctx.bezierCurveTo(-0.2, -0.56, -0.6, -0.5, -0.86, -0.42);
      } else if (style === 'bob') {
        // A blunt fringe with a slight curve.
        ctx.quadraticCurveTo(1.0, -0.16, 0.86, -0.28);
        ctx.bezierCurveTo(0.5, -0.2, -0.5, -0.2, -0.86, -0.28);
      } else if (style === 'sidepart') {
        // Parting on the left, one big lock swept across to the right.
        ctx.quadraticCurveTo(1.0, -0.26, 0.86, -0.38);
        ctx.bezierCurveTo(0.66, -0.3, 0.38, -0.36, 0.16, -0.46);
        ctx.bezierCurveTo(-0.04, -0.56, -0.24, -0.7, -0.34, -0.84);
        ctx.quadraticCurveTo(-0.62, -0.62, -0.86, -0.44);
      } else if (style === 'curly') {
        // Little curls over the forehead.
        ctx.quadraticCurveTo(1.0, -0.26, 0.86, -0.4);
        const xs = [0.86, 0.46, 0.04, -0.4, -0.86];
        for (let k = 0; k + 1 < xs.length; k++) {
          const a = xs[k], b = xs[k + 1];
          ctx.bezierCurveTo(a - 0.02, -0.18, b + 0.04, -0.18, b, -0.42 - (k % 2) * 0.04);
        }
      } else {
        // short: a fringe of three locks swept to the right.
        ctx.quadraticCurveTo(1.0, -0.26, 0.86, -0.4);
        ctx.quadraticCurveTo(0.8, -0.3, 0.66, -0.26);
        ctx.quadraticCurveTo(0.6, -0.42, 0.4, -0.5);
        ctx.quadraticCurveTo(0.34, -0.34, 0.14, -0.3);
        ctx.quadraticCurveTo(0.06, -0.48, -0.18, -0.54);
        ctx.quadraticCurveTo(-0.26, -0.4, -0.46, -0.38);
        ctx.quadraticCurveTo(-0.56, -0.52, -0.86, -0.44);
      }
      ctx.quadraticCurveTo(-1.0, -0.28, -1.07, 0.1);
    }
  } else if (style === 'crop') {
    ctx.moveTo(0.62, -0.62);
    ctx.bezierCurveTo(0.42, -1.06, -0.3, -1.14, -0.7, -0.86);
    ctx.bezierCurveTo(-1.08, -0.56, -1.1, 0.1, -0.84, 0.46);
    ctx.quadraticCurveTo(-0.62, 0.52, -0.54, 0.34);
    ctx.quadraticCurveTo(-0.56, -0.02, -0.36, -0.06);
    ctx.quadraticCurveTo(-0.2, -0.06, -0.18, 0.08);
    ctx.lineTo(-0.1, 0.06);
    ctx.quadraticCurveTo(-0.08, -0.3, 0.1, -0.42);
    ctx.quadraticCurveTo(0.36, -0.54, 0.62, -0.62);
  } else {
    const covers = style === 'long' || style === 'bob';
    ctx.moveTo(0.92, -0.46);
    ctx.bezierCurveTo(1.0, -0.96, 0.44, top, -0.18, top + 0.02);
    ctx.bezierCurveTo(-0.88, top + 0.08, -1.2, -0.62, -1.12, 0.0);
    if (covers) {
      // Hair falls over the ear: a soft edge down to the jaw, then up to the temple.
      ctx.bezierCurveTo(-1.08, 0.4, -0.82, 0.68, -0.44, 0.62);
      ctx.bezierCurveTo(-0.3, 0.4, -0.3, 0.0, -0.16, -0.18);
      ctx.quadraticCurveTo(-0.08, -0.26, -0.02, -0.28);
    } else {
      ctx.bezierCurveTo(-1.08, 0.36, -0.92, 0.58, -0.68, 0.66);   // nape
      ctx.quadraticCurveTo(-0.54, 0.56, -0.54, 0.36);              // behind the ear
      ctx.quadraticCurveTo(-0.56, -0.02, -0.36, -0.06);             // over the ear
      ctx.quadraticCurveTo(-0.2, -0.06, -0.18, 0.1);                // sideburn, in front of the ear
      ctx.lineTo(-0.09, 0.08);
      ctx.quadraticCurveTo(-0.08, -0.22, -0.02, -0.3);
    }
    if (pulled) ctx.bezierCurveTo(0.2, -0.5, 0.6, -0.56, 0.92, -0.46);
    else if (style === 'bob') { ctx.quadraticCurveTo(0.1, -0.24, 0.5, -0.24); ctx.quadraticCurveTo(0.8, -0.24, 0.92, -0.3); ctx.lineTo(0.92, -0.46); }
    else if (style === 'sidepart') { ctx.quadraticCurveTo(0.22, -0.38, 0.5, -0.32); ctx.quadraticCurveTo(0.76, -0.3, 0.98, -0.44); ctx.lineTo(0.92, -0.46); }
    else if (style === 'curly') {
      ctx.bezierCurveTo(0.04, -0.12, 0.3, -0.14, 0.32, -0.36);
      ctx.bezierCurveTo(0.4, -0.14, 0.7, -0.18, 0.7, -0.4);
      ctx.quadraticCurveTo(0.84, -0.3, 0.92, -0.46);
    } else {
      // short: locks swept forward over the brow.
      ctx.quadraticCurveTo(0.1, -0.34, 0.3, -0.28);
      ctx.quadraticCurveTo(0.36, -0.44, 0.52, -0.48);
      ctx.quadraticCurveTo(0.6, -0.32, 0.8, -0.3);
      ctx.quadraticCurveTo(0.84, -0.4, 0.98, -0.42);
      ctx.lineTo(0.92, -0.46);
    }
  }
  ctx.closePath();
  // Same winding as the cap (front clockwise, side anticlockwise): the lumps union with it.
  const dot = (x, y, r) => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, front ? TAU : -TAU, !front); };
  if (style === 'bun') { if (front) dot(0, -1.18, 0.4); else dot(-0.64, -0.98, 0.42); }
  if (style === 'buns') { if (front) { dot(-0.84, -0.88, 0.34); dot(0.84, -0.88, 0.34); } else dot(-0.52, -1.06, 0.36); }
  if (style === 'ponytail' && !front) dot(-1.0, -0.42, 0.2);
  if (style === 'curly') {
    const n = front ? 9 : 8;
    for (let i = 0; i < n; i++) {
      const a = front ? Math.PI * (1.02 + (i / (n - 1)) * 0.96) : Math.PI * (0.66 + (i / (n - 1)) * 1.0);
      dot(Math.cos(a) * 1.02, Math.sin(a) * 1.02 - 0.08, 0.3 - (i % 2) * 0.04);
    }
  }
}

// Hair fill: no core shadow along the hairline (that reads as a headband). The
// lit side is a big disc toward the light; the rest of the mass is the shade,
// and a thin rim catches the light on the upper edge. Head units, local x mirrored by f.
function hairFill(ctx, L, pathFn, col, f) {
  const lx = -f;
  ctx.save();
  edgeUnder(ctx, L, pathFn, col);
  if (lookProfile().figShade === false) { ctx.beginPath(); pathFn(); ctx.fillStyle = col; ctx.fill(); ctx.restore(); return; }   // a flat look: one fill
  ctx.beginPath(); pathFn();
  ctx.fillStyle = mMix(mDarken(col, 0.24), L.c.s5, 0.08);
  ctx.fill();
  ctx.clip();
  ctx.beginPath(); ctx.arc(0.34 * lx, -0.36, 1.24, 0, TAU); ctx.clip();
  ctx.beginPath(); pathFn();
  ctx.fillStyle = mLighten(col, L.dark ? 0.24 : 0.2);
  ctx.fill();
  ctx.translate(-0.05 * lx, 0.05);
  ctx.beginPath(); pathFn();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.restore();
}

// Hair that hangs behind the head and shoulders (painted before the torso).
function hairBack(ctx, style, front) {
  if (style === 'long') {
    if (front) {
      ctx.moveTo(-0.9, -0.6);
      ctx.bezierCurveTo(-1.34, 0.2, -1.28, 1.3, -1.06, 1.86);
      ctx.quadraticCurveTo(0, 2.0, 1.06, 1.86);
      ctx.bezierCurveTo(1.28, 1.3, 1.34, 0.2, 0.9, -0.6);
    } else {
      ctx.moveTo(-0.1, -1.0);
      ctx.bezierCurveTo(-1.32, -0.9, -1.36, 1.0, -1.08, 1.86);
      ctx.quadraticCurveTo(-0.6, 1.96, -0.34, 1.6);
      ctx.quadraticCurveTo(-0.2, 1.0, 0.0, 0.4);
    }
    ctx.closePath();
  } else if (style === 'bob') {
    if (front) { ctx.moveTo(-0.96, -0.6); ctx.bezierCurveTo(-1.34, 0.0, -1.26, 0.8, -1.06, 0.98); ctx.lineTo(1.06, 0.98); ctx.bezierCurveTo(1.26, 0.8, 1.34, 0.0, 0.96, -0.6); }
    else { ctx.moveTo(-0.1, -1.0); ctx.bezierCurveTo(-1.3, -0.9, -1.3, 0.7, -1.1, 0.98); ctx.quadraticCurveTo(-0.5, 1.06, -0.2, 0.86); ctx.lineTo(0.0, 0.3); }
    ctx.closePath();
  } else if (style === 'curly') {
    ctx.arc(front ? 0 : -0.14, -0.12, 1.14, 0, TAU);
  } else if (style === 'ponytail' && !front) {
    ctx.moveTo(-0.9, -0.56);
    ctx.bezierCurveTo(-1.6, -0.5, -1.62, 0.5, -1.36, 1.16);
    ctx.quadraticCurveTo(-1.3, 0.5, -0.94, -0.28);
    ctx.closePath();
  } else if (style === 'braid' && !front) {
    for (let k = 0; k < 6; k++) { const y = 0.42 + k * 0.28, x = -0.86 - k * 0.03, r = 0.21 - k * 0.012; ctx.moveTo(x + r, y); ctx.ellipse(x, y, r, r * 0.86, 0, 0, TAU); }
  }
}

// Locks in front of the face or over the shoulder (front view), after the cap.
function hairFront(ctx, style, front) {
  if (!front) return false;
  if (style === 'long') {
    for (const s of [-1, 1]) {
      ctx.moveTo(s * 0.86, -0.46);
      ctx.quadraticCurveTo(s * 1.06, 0.3, s * 1.14, 1.3);
      ctx.quadraticCurveTo(s * 1.0, 1.36, s * 0.86, 1.22);
      ctx.quadraticCurveTo(s * 0.86, 0.3, s * 0.7, -0.3);
      ctx.closePath();
    }
    return true;
  }
  if (style === 'bob') {
    for (const s of [-1, 1]) {
      ctx.moveTo(s * 0.82, -0.32);
      ctx.quadraticCurveTo(s * 1.12, 0.1, s * 1.1, 0.82);
      ctx.quadraticCurveTo(s * 0.96, 0.92, s * 0.8, 0.84);
      ctx.quadraticCurveTo(s * 0.84, 0.2, s * 0.7, -0.26);
      ctx.closePath();
    }
    return true;
  }
  if (style === 'braid') {
    for (let k = 0; k < 7; k++) { const y = 0.5 + k * 0.27, x = 0.92 + k * 0.03, r = 0.2 - k * 0.01; ctx.moveTo(x + r, y); ctx.ellipse(x, y, r, r * 0.84, 0.3, 0, TAU); }
    return true;
  }
  return false;
}

function inHead(ctx, h, sk, fn) {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.tilt * sk.f);
  ctx.scale(h.r * sk.f, h.r);
  fn();
  ctx.restore();
}
// The look with its rim width in head units (for parts painted inside inHead).
const headLook = (L, h) => (L.rimW ? { ...L, rimW: L.rimW / h.r } : L);

// Head outline in head units: a rounded skull, a softer, narrower chin.
function headPath(ctx, front) {
  if (front) {
    ctx.moveTo(0, -1.0);
    ctx.bezierCurveTo(0.6, -1.0, 1.0, -0.62, 1.0, -0.08);
    ctx.bezierCurveTo(1.0, 0.5, 0.8, 0.92, 0, 0.98);
    ctx.bezierCurveTo(-0.8, 0.92, -1.0, 0.5, -1.0, -0.08);
    ctx.bezierCurveTo(-1.0, -0.62, -0.6, -1.0, 0, -1.0);
  } else {
    ctx.moveTo(0.06, -1.02);
    ctx.bezierCurveTo(0.62, -1.02, 0.98, -0.64, 0.98, -0.2);
    // The nose is part of the silhouette: one soft bump below the eyes, same fill and shading as the face.
    ctx.bezierCurveTo(0.99, -0.02, 1.0, 0.12, 1.04, 0.2);
    ctx.bezierCurveTo(1.1, 0.27, 1.12, 0.36, 1.03, 0.4);
    ctx.bezierCurveTo(0.99, 0.42, 0.98, 0.46, 0.92, 0.56);
    ctx.bezierCurveTo(0.8, 0.84, 0.42, 1.0, 0.04, 0.96);
    ctx.bezierCurveTo(-0.5, 0.9, -0.96, 0.5, -1.0, -0.24);
    ctx.bezierCurveTo(-0.96, -0.76, -0.5, -1.02, 0.06, -1.02);
  }
  ctx.closePath();
}

// A face in head units: eyes with whites, irises, pupils, sparkles and lids;
// brows, nose, mouth, blush; optional moustache and glasses.
function paintFace(ctx, sk, L, h) {
  const r = h.r, front = sk.view === 'front';
  const mood = L.mood, ink = L.ink;
  // Cute (the Quill recipe): big eyes set low and wide, a big iris with one bright glint,
  // round blush discs, short soft brows, a small nose and a small round smile.
  const ey = 0.15;
  const eyes = front ? [[-0.4, 1, -1], [0.4, 1, 1]] : [[0.16, 1, -1], [0.74, 0.62, 1]];   // [x, width, outer side]
  let lk = L.look;
  if (!lk) {
    lk = { x: front ? 0 : 0.6, y: 0 };
    if (L.t) {
      const g = Math.floor((L.t + L.seed * 2.3) / 2.7), pick = mulberry32(g * 131 + L.seed * 17 + 3)();
      lk = { x: lk.x + [0, 0.5, -0.45, 0.2][(pick * 4) | 0], y: pick > 0.75 ? 0.25 : 0 };
    }
  }
  // A blink is open or shut: a half lid over a clipped white leaves ghost rims and reads as sleepy.
  const blink = mood === 'happy' || mood === 'squint' || mood === 'effort' ? 0 : blinkOf(L) > 0.3 ? 1 : 0;
  const big = r >= 11, mid = r >= 6;
  const cheekCol = mMix(L.skin, L.c.s6, 0.5);
  inHead(ctx, h, sk, () => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Blush discs first, under everything: round, soft-edged, wide on the cheeks (clipped to the head).
    const cheeks = front ? [[-0.6, 1], [0.6, 1]] : [[0.02, 1], [0.88, 0.5]];
    ctx.save();
    ctx.beginPath(); headPath(ctx, front); ctx.clip();
    for (const [x, k] of cheeks) {
      const a = L.dark ? 0.6 : 0.5;
      const g = ctx.createRadialGradient(x, 0.46, 0, x, 0.46, 0.24);
      g.addColorStop(0, mAlpha(cheekCol, a));
      g.addColorStop(0.55, mAlpha(cheekCol, a * 0.8));
      g.addColorStop(1, mAlpha(cheekCol, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, 0.46, 0.24 * k, 0.19, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    for (const [ex, k, out] of eyes) {
      const closed = mood === 'happy' || mood === 'squint' || mood === 'effort' || blink > 0.8;
      if (closed) {
        ctx.beginPath();
        if (mood === 'effort') { ctx.moveTo(ex + out * 0.17 * k, ey - 0.08); ctx.lineTo(ex - out * 0.15 * k, ey + 0.03); ctx.lineTo(ex + out * 0.17 * k, ey + 0.12); }
        else if (mood !== 'happy' && mood !== 'squint') { ctx.moveTo(ex - 0.18 * k, ey + 0.02); ctx.quadraticCurveTo(ex, ey + 0.16, ex + 0.18 * k, ey + 0.02); }
        else { ctx.moveTo(ex - 0.19 * k, ey + 0.1); ctx.quadraticCurveTo(ex, ey - 0.16, ex + 0.19 * k, ey + 0.1); }   // the happy ^ ^
        ctx.strokeStyle = ink;
        ctx.lineWidth = 0.1;
        ctx.stroke();
      } else if (!mid) {
        // Small heads: a dot eye with one glint.
        ctx.beginPath();
        ctx.ellipse(ex + lk.x * 0.03, ey, 0.13 * k, 0.16, 0, 0, TAU);
        ctx.fillStyle = ink;
        ctx.fill();
        if (r >= 4.5) { ctx.beginPath(); ctx.arc(ex - 0.04 * k, ey - 0.05, 0.05, 0, TAU); ctx.fillStyle = mLighten(L.skin, 0.97); ctx.fill(); }
      } else {
        // A big white, a big iris (two thirds of the white) with its pupil, one bright
        // glint top-left and a pinpoint bottom-right; a thin lid line on top only.
        const wide = mood === 'oops' ? 1.12 : 1;
        const rx = 0.21 * k * wide, ry = 0.27 * wide;
        const eye = () => { ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, TAU); };
        ctx.save();
        eye(); ctx.fillStyle = mLighten(L.skin, 0.95); ctx.fill();
        eye(); ctx.clip();
        const px = ex + lk.x * 0.05 * k, py = ey + 0.03 + (lk.y ?? 0) * 0.06;
        ctx.beginPath();
        ctx.ellipse(px, py, 0.15 * k, 0.185, 0, 0, TAU);
        ctx.fillStyle = L.iris;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(px, py + 0.015, 0.09 * k, 0.115, 0, 0, TAU);
        ctx.fillStyle = ink;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px - 0.055 * k, py - 0.07, big ? 0.068 : 0.072, 0, TAU);
        ctx.fillStyle = mLighten(L.skin, 0.98);
        ctx.fill();
        if (big) { ctx.beginPath(); ctx.arc(px + 0.055 * k, py + 0.07, 0.026, 0, TAU); ctx.fill(); }
        ctx.restore();
        // The upper lid: a thin arc hugging the top of the white, a flick at the outer corner.
        const ly = ey - ry;
        ctx.beginPath();
        ctx.moveTo(ex - out * rx * 0.96, ly + ry * 0.46);
        ctx.quadraticCurveTo(ex - out * rx * 0.1, ly - ry * 0.3, ex + out * rx * 1.08, ly + ry * 0.3);
        ctx.strokeStyle = ink;
        ctx.lineWidth = big ? 0.055 : 0.065;
        ctx.stroke();
        if (big) {
          ctx.beginPath();
          ctx.moveTo(ex + out * rx * 0.96, ly + ry * 0.34);
          ctx.lineTo(ex + out * rx * 1.24, ly + ry * 0.14);
          ctx.lineWidth = 0.05;
          ctx.stroke();
        }
      }
      // Brows: short, soft commas that carry the mood (inner end = toward the nose).
      const by = ey - 0.4;
      const tiltIn = { sad: -0.08, oops: -0.06, think: out > 0 ? -0.07 : 0.03, effort: 0.08, squint: 0.03, happy: -0.02 }[mood] ?? 0;
      const lift = mood === 'oops' ? -0.06 : 0;
      ctx.beginPath();
      ctx.moveTo(ex - out * 0.12 * k, by + 0.03 + tiltIn + lift);
      ctx.quadraticCurveTo(ex, by - 0.05 + lift, ex + out * 0.15 * k, by + 0.03 + lift);
      ctx.strokeStyle = L.hairStyle === 'none' ? mDarken(L.skin, 0.45) : mDarken(L.hair, L.dark ? 0 : 0.05);
      ctx.lineWidth = big ? 0.095 : 0.1;
      ctx.stroke();
    }
    // Nose.
    if (front) {
      // Small and soft: one short curve under the eyes, nothing else.
      ctx.beginPath();
      ctx.moveTo(-0.05, 0.4); ctx.quadraticCurveTo(0, 0.45, 0.05, 0.4);
      ctx.strokeStyle = mAlpha(mDarken(L.skin, 0.32), 0.7); ctx.lineWidth = 0.05; ctx.stroke();
    } else {
      // The nose on the profile edge: a small rounded bump and a hint of the nostril.
      // Only a faint nostril curve inside the bump; the bump itself is in headPath.
      ctx.beginPath(); ctx.arc(0.98, 0.34, 0.04, 0.35 * Math.PI, 1.0 * Math.PI); ctx.strokeStyle = mAlpha(mDarken(L.skin, 0.3), 0.55); ctx.lineWidth = 0.04; ctx.stroke();
    }
    // Moustache.
    if (L.moustache) {
      ctx.beginPath();
      if (front) { ctx.ellipse(-0.11, 0.51, 0.14, 0.055, 0.22, 0, TAU); ctx.ellipse(0.11, 0.51, 0.14, 0.055, -0.22, 0, TAU); }
      else { ctx.ellipse(0.62, 0.52, 0.12, 0.05, 0.16, 0, TAU); ctx.ellipse(0.82, 0.51, 0.1, 0.048, -0.14, 0, TAU); }
      ctx.fillStyle = L.hair;
      ctx.fill();
    }
    // Mouth.
    const mx = front ? 0 : 0.66, my = 0.62, mw = front ? 1 : 0.8;
    ctx.beginPath();
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 0.07;
    if (mood === 'happy' || mood === 'squint') {
      // An open round laugh: a D with a tongue, like the mascot's open beak.
      ctx.moveTo(mx - 0.2 * mw, my - 0.05);
      ctx.quadraticCurveTo(mx, my + 0.34, mx + 0.2 * mw, my - 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      ctx.ellipse(mx, my + 0.19, 0.12 * mw, 0.08, 0, 0, TAU);
      ctx.fillStyle = mMix(L.c.s6, L.c.s4, 0.5);
      ctx.fill();
      ctx.fillStyle = mLighten(L.skin, 0.94);
      ctx.fillRect(mx - 0.2, my - 0.07, 0.4, 0.06);
      ctx.restore();
    } else if (mood === 'sad') {
      ctx.arc(mx, my + 0.15, 0.12 * mw, 1.2 * Math.PI, 1.8 * Math.PI);
      ctx.stroke();
    } else if (mood === 'oops') {
      ctx.ellipse(mx, my + 0.03, 0.07 * mw, 0.09, 0, 0, TAU);
      ctx.fill();
    } else if (mood === 'effort') {
      ctx.roundRect?.(mx - 0.14 * mw, my - 0.06, 0.28 * mw, 0.12, 0.05);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(mx - 0.09 * mw, my);
      ctx.lineTo(mx + 0.09 * mw, my);
      ctx.strokeStyle = mLighten(L.skin, 0.9);
      ctx.lineWidth = 0.035;
      ctx.stroke();
    } else if (mood === 'think') {
      ctx.moveTo(mx - 0.09 * mw, my + 0.02);
      ctx.quadraticCurveTo(mx, my - 0.01, mx + 0.12 * mw, my - 0.03);
      ctx.stroke();
    } else {
      // A small round smile with soft corners.
      ctx.moveTo(mx - 0.16 * mw, my - 0.03);
      ctx.quadraticCurveTo(mx, my + 0.15, mx + 0.16 * mw, my - 0.03);
      ctx.stroke();
    }
    // Glasses: round frames just outside the eyes.
    if (L.glasses && mid) {
      ctx.beginPath();
      for (const [ex, k] of eyes) { ctx.moveTo(ex + 0.28 * k, ey); ctx.ellipse(ex, ey, 0.28 * k, 0.28, 0, 0, TAU); }
      const [[e0, k0], [e1, k1]] = eyes;
      ctx.moveTo(e0 + 0.28 * k0, ey - 0.04); ctx.quadraticCurveTo((e0 + e1) / 2, ey - 0.12, e1 - 0.28 * k1, ey - 0.04);
      if (!front) { ctx.moveTo(e0 - 0.28, ey - 0.02); ctx.lineTo(-0.3, ey + 0.02); }
      ctx.strokeStyle = ink;
      ctx.lineWidth = 0.05;
      ctx.stroke();
      ctx.beginPath();
      for (const [ex, k] of eyes) { ctx.moveTo(ex - 0.16 * k, ey - 0.16); ctx.lineTo(ex - 0.05 * k, ey - 0.21); }
      ctx.strokeStyle = mAlpha(mLighten(L.skin, 0.95), 0.7);
      ctx.lineWidth = 0.04;
      ctx.stroke();
    }
  });
}

const HAIR_HANGS = new Set(['long', 'bob', 'curly', 'ponytail', 'braid']);

function paintHairBack(ctx, sk, L) {
  const style = L.hairStyle;
  if (!HAIR_HANGS.has(style)) return;
  const h = headOf(sk, L), front = sk.view === 'front';
  if (front && (style === 'ponytail' || style === 'braid')) return;
  const Lh = headLook(L, h);
  inHead(ctx, h, sk, () => {
    hairFill(ctx, Lh, () => hairBack(ctx, style, front), mDarken(L.hair, 0.08), sk.f);
  });
}

// A simple ear: skin, a soft shade, one C curve opening toward the face.
function paintEar(ctx, L, x, y, s, r) {
  const rx = 0.15, ry = 0.2;
  shade(ctx, L, () => ctx.ellipse(x, y, rx, ry, 0, 0, TAU), mDarken(L.skin, 0.03), -0.05, -0.05, 0.16, false);
  if (r < 7) return;
  ctx.beginPath();
  ctx.arc(x + s * 0.02, y + 0.01, 0.085, s > 0 ? -0.5 * Math.PI : 0.5 * Math.PI, s > 0 ? 0.5 * Math.PI : 1.5 * Math.PI);
  ctx.strokeStyle = mAlpha(mDarken(L.skin, 0.32), 0.8);
  ctx.lineWidth = 0.045;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function paintHead(ctx, sk, L) {
  const h = headOf(sk, L), front = sk.view === 'front', f = sk.f;
  const style = L.hairStyle;
  paintNeck(ctx, sk, L, h);
  const Lh = headLook(L, h);
  // Front view: ears behind the head shape (C opens toward the face).
  if (front) inHead(ctx, h, sk, () => { paintEar(ctx, Lh, 0.96, 0.16, 1, h.r); paintEar(ctx, Lh, -0.96, 0.16, -1, h.r); });
  inHead(ctx, h, sk, () => { shade(ctx, Lh, () => headPath(ctx, front), L.skin, -0.13 * f, -0.15, 0.13); });
  // A look without faces (plain): the head stays a plain shape with its hair and ears, no eyes, mouth or blush.
  if (L.face !== false && lookProfile().faces && h.r >= 4) paintFace(ctx, sk, L, h);
  if (style !== 'none') {
    inHead(ctx, h, sk, () => {
      // The fringe's soft shadow on the forehead, then the cap.
      ctx.save();
      ctx.beginPath(); headPath(ctx, front); ctx.clip();
      ctx.translate(0.02, 0.06);
      ctx.beginPath(); hairCap(ctx, style, front);
      ctx.fillStyle = mAlpha(mDarken(L.skin, 0.45), 0.14); ctx.fill();
      ctx.restore();
      hairFill(ctx, Lh, () => hairCap(ctx, style, front), L.hair, f);
      // Sheen: a lit band that follows the crown, broken into two strokes (none under a flat look).
      ctx.save();
      ctx.beginPath(); hairCap(ctx, style, front); ctx.clip();
      const hc = front ? { x: 0, y: -0.06 } : { x: -0.14, y: -0.08 };
      ctx.strokeStyle = mAlpha(mLighten(L.hair, L.dark ? 0.5 : 0.42), 0.5);
      ctx.lineCap = 'round';
      if (lookProfile().figShade !== false) {
        ctx.lineWidth = 0.14;
        ctx.beginPath(); ctx.arc(hc.x, hc.y, 0.92, Math.PI * 1.08, Math.PI * 1.34); ctx.stroke();
        ctx.lineWidth = 0.1;
        ctx.beginPath(); ctx.arc(hc.x, hc.y, 0.92, Math.PI * 1.4, Math.PI * 1.48); ctx.stroke();
      }
      // Strands from the crown or the parting, following the flow.
      ctx.strokeStyle = mAlpha(mDarken(L.hair, 0.45), 0.3);
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      // Only a parting gets a line; locks read from the silhouette and the sheen.
      const parted = style === 'sidepart' || style === 'long' || style === 'bun' || style === 'buns' || style === 'braid' || style === 'ponytail';
      if (parted && front) {
        const px = style === 'sidepart' ? -0.34 : 0.02;
        ctx.moveTo(px, -0.84); ctx.quadraticCurveTo(px * 0.8, -1.04, px * 0.4, -1.2);
      } else if (parted) {
        ctx.moveTo(0.56, -0.54); ctx.quadraticCurveTo(0.2, -0.9, -0.24, -1.1);
      }
      ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      if (hairFront(ctx, style, front)) {
        hairFill(ctx, Lh, () => hairFront(ctx, style, front), L.hair, f);
      }
    });
  }
  // 3/4 view: the ear sits behind the cheek, in the gap the hair leaves for it (hidden by long hair or a bob).
  if (!front && style !== 'long' && style !== 'bob') inHead(ctx, h, sk, () => paintEar(ctx, Lh, -0.34, 0.16, -1, h.r));
}

/** Paint a solved figure; layer 'back' | 'mid' | 'front' | 'all' (see the header for the order). */
export function paintFigure(ctx, c, sk0, look = {}, o = {}) {
  // The chunky rim scales with the person: about 1.2 px at 100 px, 2 px at 170 px.
  const L = { ...figureLook(c, look), rimW: clamp(0.012 * sk0.height, 1, 2.4) * (lookProfile().figRim ?? 1) };
  const sk = bodyOf(sk0, L);
  const layer = o.layer ?? 'all';
  const front = sk.view === 'front';
  ctx.save();
  if (layer === 'all' || layer === 'back') {
    if (!o.noShadow && sk.pose !== 'cycle') {      // a bicycle casts its own
      const [a, b] = sk.contacts;
      const gy = sk.groundY ?? Math.max(a.y, b.y);
      drawShadow(ctx, c, (a.x + b.x) / 2, gy, 0.17 * sk.height + Math.abs(a.x - b.x) / 2, 0.035 * sk.height + 1.5);
      // Contact: a tight dark pool under each planted foot.
      for (const p of sk.contacts) {
        if (p.lift > 0.02 || (sk.groundY != null && Math.abs(p.y - sk.groundY) > 2)) continue;
        drawShadow(ctx, c, p.x + (front ? 0 : sk.f * 0.02 * sk.height), p.y, 0.065 * sk.height, 0.014 * sk.height + 1, 0.9);
      }
    }
    paintHairBack(ctx, sk, L);
    // Side view: the far arm and hand are behind the torso AND both legs.
    if (!front) { paintArm(ctx, sk, 1, L, 0.2); paintLeg(ctx, sk, 1, L, 0.18); }
  }
  if (layer === 'all' || layer === 'mid') {
    if (front && sk.seated && sk.pose !== 'cycle') {
      // Head-on and seated, the thighs come toward the viewer: the lap goes over the shirt hem.
      paintTorso(ctx, sk, L, true);
      paintLeg(ctx, sk, 1, L, 0);
      paintLeg(ctx, sk, 0, L, 0);
      paintLower(ctx, sk, L, true);
    } else {
      if (front) paintLeg(ctx, sk, 1, L, 0);
      paintLeg(ctx, sk, 0, L, 0);
      paintLower(ctx, sk, L);
      paintTorso(ctx, sk, L);
    }
    paintHead(ctx, sk, L);
  }
  if (layer === 'all' || layer === 'front') {
    if (front) paintArm(ctx, sk, 1, L, 0);
    paintArm(ctx, sk, 0, L, 0);
  }
  ctx.restore();
}

/**
 * Solve and paint in the safe order: back, behind(ctx, sk), mid,
 * between(ctx, sk), front. Returns sk (anchors for ropes, chips, crates).
 */
export function drawFigure(ctx, c, spec, look, o = {}) {
  const sk = solveFigure(spec);
  const L = figureLook(c, look?.__fig ? look : { ...(spec.look || {}), ...(look || {}) });
  paintFigure(ctx, c, sk, L, { layer: 'back', noShadow: o.noShadow });
  o.behind?.(ctx, sk);
  paintFigure(ctx, c, sk, L, { layer: 'mid' });
  o.between?.(ctx, sk);
  paintFigure(ctx, c, sk, L, { layer: 'front' });
  return sk;
}

/** Cycle phase 0..1 from distance travelled, so planted feet do not slide. */
export function walkPhase(dist, height, kind = 'walk') {
  const per = { walk: 0.68, run: 0.96, climb: 0.64 }[kind] ?? 0.68;
  const u = dist / (per * height);
  return ((u % 1) + 1) % 1;
}

/**
 * A bust icon for crowds, voters and counts: head and shoulders in ONE scene
 * colour, no skin tone. (x, y) = base centre; h = total height (>= 18).
 * Face: none below 30 px, dot eyes to 44, eyes + smile from 44; none under a look without faces. o: { col, mood }
 */
export function drawPersonGlyph(ctx, c, x, y, h, o = {}) {
  const col = o.col ?? c.accent;
  const hr = h * 0.22, bw = h * 0.8, bh = h * 0.48;
  const hy = y - bh - hr * 0.78;
  const rimW = clamp(0.03 * h, 0.8, 1.6) * (lookProfile().figRim ?? 1);
  ctx.save();
  cushion(ctx, () => {
    ctx.moveTo(x - bw / 2, y);
    ctx.bezierCurveTo(x - bw / 2, y - bh * 0.95, x - bw * 0.3, y - bh, x, y - bh);
    ctx.bezierCurveTo(x + bw * 0.3, y - bh, x + bw / 2, y - bh * 0.95, x + bw / 2, y);
    ctx.closePath();
  }, col, -bw * 0.05, -bh * 0.08, 0.24, rimW);
  const head = mLighten(col, 0.1);
  cushion(ctx, () => { ctx.ellipse(x, hy, hr, hr, 0, 0, TAU); }, head, -hr * 0.1, -hr * 0.12, 0.18, rimW);
  if (lookProfile().gloss) {   // the glint on the head: gloss, off under a flat look
    ellipse(ctx, x - hr * 0.38, hy - hr * 0.48, hr * 0.26, hr * 0.13, -0.5);
    ctx.fillStyle = mAlpha(mLighten(col, 0.6), 0.6);
    ctx.fill();
  }
  if (h >= 30 && lookProfile().faces) {
    const ink = mDarken(col, 0.78);
    const er = h >= 44 ? hr * 0.15 : hr * 0.12;
    for (const s of [-1, 1]) {
      ellipse(ctx, x + s * hr * 0.36, hy + hr * 0.05, er, er * 1.25);
      ctx.fillStyle = ink;
      ctx.fill();
      if (h >= 44) { ellipse(ctx, x + s * hr * 0.36 - er * 0.3, hy - er * 0.35, er * 0.35, er * 0.35); ctx.fillStyle = mLighten(head, 0.9); ctx.fill(); }
    }
    if (h >= 44) {
      ctx.beginPath();
      if (o.mood === 'sad') ctx.arc(x, hy + hr * 0.62, hr * 0.2, 1.2 * Math.PI, 1.8 * Math.PI);
      else ctx.arc(x, hy + hr * 0.3, hr * 0.24, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1.5, hr * 0.1);
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }
  ctx.restore();
}

// -- Roles, rows, crowds ----------------------------------------------------------------

export const POSE_NAMES = [...Object.keys(P), 'throw'];
const METRES = { adult: 1.7, teen: 1.58, kid: 1.2 };
// A role is a build, a height and at most a work-clothes tone (a coat, scrubs,
// a uniform shirt). Never a costume: no religious, caste-coded or national dress.
const ROLES = {
  student: { build: 'teen', m: 1.58 },
  teacher: { build: 'adult', m: 1.68, sleeves: 'long', sets: [0, 1, 3, 4, 6, 7], glasses: 2 },
  adult: { build: 'adult', m: 1.7 },
  elder: { build: 'adult', m: 1.62, hair: 2, sets: [4, 3, 0, 1], hairStyles: ['crop', 'bun'], glasses: 1, girth: 1.1 },
  child: { build: 'kid', m: 1.2 },
  worker: { build: 'adult', m: 1.7, sleeves: 'rolled', top: 'work', sets: [0, 6, 2, 8] },
  shopkeeper: { build: 'adult', m: 1.68, sets: [4, 1, 0, 3, 7] },
  doctor: { build: 'adult', m: 1.7, sleeves: 'long', top: 'coat', outfit: 'coat' },
  nurse: { build: 'adult', m: 1.65, top: 'scrubs', outfit: 'scrubs', bottom: 'teal', shoeStyle: 'sneaker', shoe: 'white' },
  voter: { build: 'adult', m: 1.68 },
  farmer: { build: 'adult', m: 1.68, sleeves: 'rolled', sets: [0, 3, 6, 4], tops: ['khaki', 'olive', 'rust', 'sage', 's8'], shoeStyle: 'sandal' },
  police: { build: 'adult', m: 1.72, sleeves: 'long', top: 'uniform', outfit: 'uniform', bottom: 'khaki', shoeStyle: 'shoe', shoe: 'brown' },
};
export const ROLE_NAMES = Object.keys(ROLES);
const TOPS = ['s1', 's3', 's5', 's4', 's2', 's7', 's8', 's6'];
// Everyday outfits for group variety: work-clothes cuts, never a costume. A set
// fixes the cut and hair; colours rotate on their own stride so neighbours differ.
const SETS = {
  adult: [
    { outfit: 'shirt', hairStyle: 'short', bottom: 'denim', shoeStyle: 'shoe', pattern: 'check', moustache: true },
    { outfit: 'kurti', hairStyle: 'braid', bottom: 'cream', shoeStyle: 'sandal', dupatta: true },
    { outfit: 'tee', hairStyle: 'curly', bottom: 'khaki', shoeStyle: 'sneaker', shoe: 'white' },
    { outfit: 'drape', hairStyle: 'bun', shoeStyle: 'sandal' },
    { outfit: 'kurta', hairStyle: 'sidepart', bottom: 'cream', shoeStyle: 'sandal' },
    { outfit: 'tee', hairStyle: 'ponytail', bottom: 'navy', shoeStyle: 'sneaker', shoe: 'white', sleeves: 'long' },
    { outfit: 'shirt', hairStyle: 'sidepart', bottom: 'charcoal', shoeStyle: 'shoe', pattern: 'stripes', sleeves: 'rolled' },
    { outfit: 'kurti', hairStyle: 'long', bottom: 'stone', shoeStyle: 'sandal', pattern: 'dots' },
    { outfit: 'tee', hairStyle: 'short', bottom: 'olive', shoeStyle: 'sneaker', shoe: 'stone', moustache: true },
    { outfit: 'tee', hairStyle: 'bob', bottom: 'brown', bottomStyle: 'long-skirt', shoeStyle: 'sandal' },
  ],
  teen: [
    { outfit: 'tee', hairStyle: 'short', bottom: 'navy', shoeStyle: 'sneaker', shoe: 'white' },
    { outfit: 'kurti', hairStyle: 'braid', bottom: 'cream', shoeStyle: 'sandal', dupatta: true },
    { outfit: 'shirt', hairStyle: 'curly', bottom: 'khaki', shoeStyle: 'shoe', pattern: 'check' },
    { outfit: 'tee', hairStyle: 'ponytail', bottom: 'denim', bottomStyle: 'skirt', shoeStyle: 'sneaker', shoe: 'white' },
    { outfit: 'tee', hairStyle: 'sidepart', bottom: 'denim', shoeStyle: 'sneaker', shoe: 'stone', sleeves: 'long' },
    { outfit: 'kurti', hairStyle: 'long', bottom: 'stone', shoeStyle: 'sandal', pattern: 'dots' },
    { outfit: 'shirt', hairStyle: 'short', bottom: 'charcoal', shoeStyle: 'shoe', sleeves: 'rolled', pattern: 'stripes' },
    { outfit: 'tee', hairStyle: 'bob', bottom: 'olive', shoeStyle: 'sneaker', shoe: 'white' },
  ],
  kid: [
    { outfit: 'tee', hairStyle: 'short', bottom: 'denim', bottomStyle: 'shorts', shoeStyle: 'sneaker', shoe: 'white' },
    { outfit: 'tee', hairStyle: 'buns', bottom: 'plum', bottomStyle: 'skirt', shoeStyle: 'sandal' },
    { outfit: 'tee', hairStyle: 'curly', bottom: 'khaki', bottomStyle: 'shorts', shoeStyle: 'sneaker', shoe: 'sky', pattern: 'stripes' },
    { outfit: 'kurti', hairStyle: 'braid', bottom: 'cream', shoeStyle: 'sandal' },
    { outfit: 'shirt', hairStyle: 'sidepart', bottom: 'navy', bottomStyle: 'shorts', shoeStyle: 'shoe' },
    { outfit: 'tee', hairStyle: 'ponytail', bottom: 'teal', bottomStyle: 'skirt', shoeStyle: 'sneaker', shoe: 'white', pattern: 'dots' },
  ],
};
// Tops: bright series tokens alternate with earthy cloth tones.
const TOP_TONES = ['s1', 'rust', 's3', 'mustard', 's4', 'teal', 's5', 'maroon', 's7', 'sage', 's8', 'plum', 's2', 'sky', 's6', 'olive'];
const DRAPE_TONES = ['teal', 'maroon', 'rust', 'plum', 'olive', 'mustard', 'denim'];
const GIRTH = [1, 0.94, 1.08, 1, 1.13, 0.92, 1.04];

function roleTop(c, kind) {
  if (kind === 'work') return c.s8;
  if (kind === 'scrubs') return c.s7;
  if (kind === 'coat') return hsl(hslOf(c.s1).h, 0.14, 0.93);
  if (kind === 'uniform') return hsl(hslOf(c.s2).h - 6, 0.3, 0.5);
  return null;
}

/**
 * Look for person i of a group: skin from skinFor(i); an everyday outfit (cut,
 * hair, shoes), a top colour and a build all derived from i (same every frame),
 * so neighbours differ. A role narrows the outfits (a coat, scrubs, a uniform,
 * grey hair). o: { role, mood, t, ...figureLook overrides }.
 */
export function groupLook(c, i = 0, o = {}) {
  const { role, ...rest } = o;
  const R = ROLES[role] ?? {};
  const build = R.build ?? 'adult';
  const n = (v, m) => ((v % m) + m) % m;
  const list = SETS[build] ?? SETS.adult;
  const S = list[R.sets ? R.sets[n(i, R.sets.length)] : n(i * 7, list.length)];
  const forced = R.outfit, tops = R.tops ?? TOP_TONES;
  const drape = !forced && S.outfit === 'drape';
  return {
    skin: skinFor(i), hair: R.hair ?? [0, 1, 0, 0, 1, 0][n(i, 6)],
    hairStyle: R.hairStyles ? R.hairStyles[n(i, R.hairStyles.length)] : S.hairStyle,
    outfit: forced ?? S.outfit,
    top: roleTop(c, R.top) ?? tone(c, tops[n(i * 5, tops.length)]),
    bottom: tone(c, R.bottom ?? (drape ? DRAPE_TONES[n(i, DRAPE_TONES.length)] : S.bottom ?? 'navy')),
    bottomStyle: forced ? 'trousers' : S.bottomStyle,
    trim: tone(c, drape ? (n(i, 2) ? 'mustard' : 'cream') : TOP_TONES[n(i * 5 + 7, TOP_TONES.length)]),
    shoe: R.shoe ?? S.shoe, shoeStyle: R.shoeStyle ?? S.shoeStyle,
    pattern: R.top || forced ? 'plain' : S.pattern ?? 'plain',
    dupatta: !forced && !!S.dupatta, moustache: !!S.moustache && build === 'adult',
    glasses: R.glasses ? n(i, R.glasses) === 0 : false,
    girth: R.girth ?? (build === 'adult' ? GIRTH[n(i, GIRTH.length)] : 1),
    sleeves: R.sleeves ?? S.sleeves, mood: 'smile', seed: i,
    ...rest,
  };
}

/**
 * A role and a pose in, a sized spec out (pass it straight to drawFigure; its
 * look rides along as spec.look). Throws on an unknown role, build or pose, so
 * a typo fails loudly instead of drawing a stick person.
 *   figureFor(this, { role: 'teacher', pose: 'point', x, y, scale: 90 })
 * o: { role | build, pose, x, y, facing, scale (px per metre, default 100) | height,
 *      metres, i (group index for look variety), mood, look, hands, feet, hip, seat, ground, autoReach }
 */
export function figureFor(scene, o = {}) {
  const c = scene?.colors ?? scene;
  if (!c || !c.s1) throw new Error('figureFor: pass the scene (or its colours) as the first argument');
  if (o.role == null && !o.build) throw new Error(`figureFor: give a role (${ROLE_NAMES.join(', ')}) or a build (adult, teen, kid)`);
  if (o.role != null && !ROLES[o.role]) throw new Error(`figureFor: unknown role "${o.role}". Roles: ${ROLE_NAMES.join(', ')}`);
  if (o.build && !BUILDS[o.build]) throw new Error(`figureFor: unknown build "${o.build}". Builds: adult, teen, kid`);
  const pname = typeof o.pose === 'string' ? o.pose : o.pose?.name ?? 'stand';
  if (!POSE_NAMES.includes(pname)) throw new Error(`figureFor: unknown pose "${pname}". Poses: ${POSE_NAMES.join(', ')}`);
  const R = ROLES[o.role] ?? {};
  const build = o.build ?? R.build;
  const height = o.height ?? (o.metres ?? R.m ?? METRES[build]) * (o.scale ?? 100);
  const spec = { x: o.x ?? 0, y: o.y ?? 0, height, facing: o.facing ?? 1, build, pose: o.pose ?? 'stand', role: o.role ?? null };
  for (const k of ['hands', 'feet', 'hip', 'seat', 'ground', 'autoReach']) if (o[k] !== undefined) spec[k] = o[k];
  spec.look = groupLook(c, o.i ?? 0, { role: o.role, ...(o.mood ? { mood: o.mood } : {}), ...(o.look || {}) });
  return spec;
}

const boxOf = (b) => ({ x0: b.x0, y0: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 });
const glyphFace = (x, y, h) => { const hr = h * 0.22, hy = y - h * 0.48 - hr * 0.78; return { x0: x - hr, y0: hy - hr, w: 2 * hr, h: 2 * hr }; };
const interArea = (a, b) => Math.max(0, Math.min(a.x0 + a.w, b.x0 + b.w) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y0 + a.h, b.y0 + b.h) - Math.max(a.y0, b.y0));
const series = (c, i) => c[TOPS[((i % 8) + 8) % 8]];

/**
 * A row of people on one ground line, wrapping into rows behind (each back row
 * 0.3 h higher, nudged half a step so faces show between). Heights shrink to fit
 * between y and o.top; below 44 px each is a drawPersonGlyph. Deterministic.
 * o: { x, y, w (row width, default to the frame edge), top (16), height (120), n, gap,
 *      looks [], role, build, pose ('stand'), facing (0), overlap (0.2), labels [],
 *      seat (seat y for pose 'sit', front row), hands (fig) -> [near, far],
 *      behind / between (ctx, row, figs): drawn once per row between the layers (a bench, a desk), t }
 * -> { boxes, figures: [{ i, row, x, y, height, glyph, face, box, sk }], height, rows, perRow, capped, labelsDropped }
 */
export function drawFigureRow(ctx, c, o = {}) {
  const n = Math.max(0, (o.n ?? o.looks?.length ?? 1) | 0);
  const x0 = o.x ?? 16, y0 = o.y ?? 460, w = o.w ?? W - 16 - x0, top = o.top ?? 16;
  const pose = o.pose ?? 'stand', facing = o.facing ?? 0, overlap = clamp(o.overlap ?? 0.2, 0, 0.6);
  const build = o.build ?? ROLES[o.role]?.build ?? 'adult';
  const labels = o.labels ?? null;
  const labelW = labels ? Math.max(0, ...labels.map((t) => chipSize(ctx, c, String(t), 14).w)) + 6 : 0;
  const lay = (h, withLabels) => {
    const glyph = h < 44, bodyW = (glyph ? 0.8 : facing === 0 ? 0.36 : 0.3) * h;
    const pitch = Math.max(o.gap ?? bodyW * (1 - overlap), withLabels ? labelW : 0, 1);
    const perRow = Math.max(1, Math.floor((w - bodyW) / pitch + 1e-9) + 1);
    const rows = Math.max(1, Math.ceil(n / perRow)), rise = (glyph ? 0.5 : 0.3) * h;
    const lab = withLabels && rows === 1 ? 34 : 0;
    return { h, glyph, bodyW, pitch, perRow, rows, rise, lab, need: h + (rows - 1) * rise + lab };
  };
  let L = lay(o.height ?? 120, !!labels);
  for (let k = 0; k < 60 && L.need > y0 - top && L.h > 18; k++) L = lay(Math.max(18, L.h * 0.94), !!labels);
  const rowsFit = Math.max(1, Math.floor((y0 - top - L.h - L.lab) / L.rise + 1e-9) + 1);
  const N = Math.min(n, L.perRow * rowsFit), rows = Math.max(1, Math.ceil(N / L.perRow));
  const figs = [];
  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / L.perRow), cnt = r < rows - 1 ? L.perRow : N - r * L.perRow, k = i - r * L.perRow;
    const rowW = (cnt - 1) * L.pitch, lo = x0 + L.bodyW / 2, hi = x0 + w - L.bodyW / 2;
    let start = x0 + (w - rowW) / 2, shift = r % 2 ? L.pitch / 2 : 0;
    if (start + shift + rowW > hi + 1e-6) shift = -shift;
    if (start + shift < lo - 1e-6) shift = 0;
    start += shift;
    figs.push({ i, row: r, x: start + k * L.pitch, y: y0 - r * L.rise, height: L.h, glyph: L.glyph });
  }
  const specOf = (p) => {
    const s = { x: p.x, y: p.y, height: p.height, facing, build, pose };
    const pn = typeof pose === 'string' ? pose : pose.name;
    if (pn === 'sit' && o.seat != null) s.seat = { x: p.x, y: o.seat - p.row * L.rise };
    const hs = o.hands?.(p);
    if (hs) s.hands = hs;
    return s;
  };
  const lookOf = (p) => figureLook(c, o.looks?.[p.i] ?? groupLook(c, p.i, { role: o.role, t: o.t ?? 0 }));
  for (let r = rows - 1; r >= 0; r--) {
    const row = figs.filter((p) => p.row === r);
    if (L.glyph) {
      o.behind?.(ctx, r, row);
      for (const p of row) { drawPersonGlyph(ctx, c, p.x, p.y, p.height, { col: series(c, p.i) }); p.face = glyphFace(p.x, p.y, p.height); p.box = { x0: p.x - 0.4 * p.height, y0: p.y - p.height, w: 0.8 * p.height, h: p.height }; }
      o.between?.(ctx, r, row);
      continue;
    }
    for (const p of row) { p.sk = solveFigure(specOf(p)); p.look = lookOf(p); }
    if (o.behind || o.between) {
      for (const p of row) paintFigure(ctx, c, p.sk, p.look, { layer: 'back' });
      o.behind?.(ctx, r, row);
      for (const p of row) paintFigure(ctx, c, p.sk, p.look, { layer: 'mid' });
      o.between?.(ctx, r, row);
      for (const p of row) paintFigure(ctx, c, p.sk, p.look, { layer: 'front' });
    } else for (const p of row) paintFigure(ctx, c, p.sk, p.look);
    for (const p of row) { const hd = p.sk.anchors.head; p.face = { x0: hd.x - hd.r, y0: hd.y - hd.r, w: 2 * hd.r, h: 2 * hd.r }; p.box = boxOf(p.sk.anchors.bounds); }
  }
  const labelsDropped = !!labels && rows > 1;
  if (labels && !labelsDropped) for (const p of figs) if (labels[p.i] != null) pill(ctx, c, String(labels[p.i]), p.x, p.y + 20, { size: 14, bg: c.raised ?? c.bgSurface });
  return { boxes: figs.map((p) => p.box), figures: figs, height: L.h, rows, perRow: L.perRow, capped: n - N, labelsDropped };
}

/**
 * Pure layout for drawCrowd: a seeded scatter in rect, back people smaller
 * (depth), no face covered by more than maxCover of its area by another face
 * or a body in front. Shrinks the height until all n fit. Same seed, same boxes.
 * -> [{ i, x, y, height, glyph, face, body, box }] in painter order (back first)
 */
export function crowdLayout(o = {}) {
  const rect = o.rect ?? { x: 16, y: 16, w: W - 32, h: 300 }, n = Math.max(0, o.n ?? 12) | 0;
  const depth = clamp(o.depth ?? 0.25, 0, 0.6), maxCover = o.maxCover ?? 0.25;
  const B = BUILDS[o.build] ?? BUILDS.adult;
  const geo = (x, y, h) => {
    if (h < 44) return { face: glyphFace(x, y, h), body: { x0: x - 0.4 * h, y0: y - 0.48 * h, w: 0.8 * h, h: 0.48 * h } };
    const r = (B.head * h) / 2;
    return { face: { x0: x - r, y0: y - h, w: 2 * r, h: 2 * r }, body: { x0: x - 0.17 * h, y0: y - h + 2 * r, w: 0.34 * h, h: h - 2 * r } };
  };
  const tryPlace = (h0) => {
    const rnd = mulberry32((o.seed ?? 1) * 7919 + 17);
    const yHi = rect.y + rect.h, yLo = Math.min(yHi, rect.y + h0 * (1 - depth));
    const out = [];
    for (let i = 0; i < n; i++) {
      let ok = null;
      for (let a = 0; a < 90 && !ok; a++) {
        const y = lerp(yLo, yHi, rnd());
        const h = h0 * (1 - depth * (1 - (yHi - yLo > 0 ? (y - yLo) / (yHi - yLo) : 1)));
        const x = lerp(rect.x + 0.2 * h, rect.x + rect.w - 0.2 * h, rnd());
        const g = geo(x, y, h);
        const fa = g.face.w * g.face.h;
        let bad = false;
        for (const q of out) {
          const fq = q.face.w * q.face.h;
          if (interArea(g.face, q.face) > maxCover * Math.min(fa, fq)) { bad = true; break; }
          const [back, front] = y < q.y ? [g, q] : [q, g];
          if (interArea(back.face, front.body) > maxCover * back.face.w * back.face.h) { bad = true; break; }
        }
        if (!bad) ok = { i, x, y, height: h, glyph: h < 44, ...g };
      }
      if (!ok) return null;
      out.push(ok);
    }
    return out;
  };
  let h = o.height ?? 70, res = null;
  for (let k = 0; k < 24 && !res; k++, h *= 0.92) res = tryPlace(Math.max(18, h));
  res = res ?? [];
  for (const p of res) p.box = { x0: Math.min(p.face.x0, p.body.x0), y0: p.face.y0, w: Math.max(p.face.x0 + p.face.w, p.body.x0 + p.body.w) - Math.min(p.face.x0, p.body.x0), h: p.y - p.face.y0 };
  return res.sort((a, b) => a.y - b.y || a.i - b.i);
}

/**
 * A seeded crowd (voters, a queue, an audience) in rect, painted back to front.
 * o: { rect, n, seed, height (front row, px), depth, build, role, looks, maxCover, t }
 * -> the crowdLayout boxes (each with face, for highlightFigures)
 */
// crowdLayout is pure and seeded but costs milliseconds (3 ms for 96 people, about 60 ms for 288): drawCrowd runs it once per
// distinct set of options and reuses the result every frame. Callers must treat the returned items as read-only.
const CROWD_CACHE = new Map();
function cachedCrowdLayout(o) {
  const key = JSON.stringify([o.rect, o.n, o.seed, o.height, o.depth, o.maxCover, o.build]);
  let items = CROWD_CACHE.get(key);
  if (!items) {
    items = crowdLayout(o);
    if (CROWD_CACHE.size >= 16) CROWD_CACHE.delete(CROWD_CACHE.keys().next().value);
    CROWD_CACHE.set(key, items);
  }
  return items;
}
/** Paint the people of a crowdLayout() result (back to front). drawCrowd = layout (cached) + this. Returns items. */
export function drawCrowdItems(ctx, c, items, o = {}) {
  const build = o.build ?? ROLES[o.role]?.build ?? 'adult';
  for (const p of items) {
    if (p.glyph) { drawPersonGlyph(ctx, c, p.x, p.y, p.height, { col: series(c, p.i) }); continue; }
    drawFigure(ctx, c, { x: p.x, y: p.y, height: p.height, facing: 0, build, pose: p.i % 3 === 1 ? 'relax' : 'stand' },
      figureLook(c, o.looks?.[p.i] ?? groupLook(c, p.i, { role: o.role, t: o.t ?? 0 })));
  }
  return items;
}
export function drawCrowd(ctx, c, o = {}) {
  return drawCrowdItems(ctx, c, cachedCrowdLayout(o), o);
}

/** k evenly spread indices out of n (deterministic). */
export function pickSpread(n, k) {
  const m = clamp(k | 0, 0, n);
  return Array.from({ length: m }, (_, j) => Math.floor(((j + 0.5) * n) / m));
}

/**
 * Ring the counted people (votes, a survey, a sample) and show a count chip.
 * items: drawFigureRow(...).figures or drawCrowd(...) boxes; pick: k (spread
 * evenly) or an index array. o: { tone, numbers (default: when they fit),
 * chip: {x, y} | false, text ('k of n'), size (>= 14) } -> { picked, chip }
 */
export function highlightFigures(ctx, c, items, pick, o = {}) {
  const list = Array.isArray(items) ? items : items?.figures ?? [];
  const picked = Array.isArray(pick) ? pick.filter((i) => i >= 0 && i < list.length) : pickSpread(list.length, pick);
  const tone = o.tone ?? c.warning;
  const rings = picked.map((i) => { const f = list[i].face; return { x: f.x0 + f.w / 2, y: f.y0 + f.h / 2, r: Math.max(f.w, f.h) * 0.62 + 3 }; });
  let numbers = o.numbers;
  if (numbers == null) {
    numbers = rings.length <= 20;
    for (let a = 0; a < rings.length && numbers; a++) for (let b = a + 1; b < rings.length; b++) {
      if (Math.abs(rings[a].x - rings[b].x) < 34 && Math.abs(rings[a].y - rings[b].y) < 30) { numbers = false; break; }
    }
  }
  ctx.save();
  for (const g of rings) {
    const lw = Math.max(2.5, g.r * 0.14);
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(g.x, g.y + 1.5, g.r, 0, TAU); ctx.strokeStyle = mDarken(tone, 0.38); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, TAU); ctx.strokeStyle = tone; ctx.stroke();
  }
  ctx.restore();
  // Numbers sit on the counted person's shoulder, never over the row behind.
  if (numbers) rings.forEach((g, j) => pill(ctx, c, String(j + 1), g.x + g.r * 0.85, g.y + g.r * 0.9, { size: 14, bg: tone }));
  let chip = null;
  if (o.chip !== false && list.length) {
    const x0 = Math.min(...list.map((p) => p.face.x0)), x1 = Math.max(...list.map((p) => p.face.x0 + p.face.w));
    const top = Math.min(...list.map((p) => p.face.y0)) - 24;
    const at = o.chip ?? { x: (x0 + x1) / 2, y: Math.max(22, top) };
    chip = pill(ctx, c, o.text ?? `${picked.length} of ${list.length}`, at.x, at.y, { size: Math.max(14, o.size ?? 16), bg: tone });
  }
  return { picked, chip };
}
