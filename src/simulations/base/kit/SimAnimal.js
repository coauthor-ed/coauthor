/**
 * SimAnimal - one parametric four-legged animal for canvas scenes, in the same
 * flat style as SimFigure (cushion fill, one light gloss, contact shadow, a big
 * readable eye). The scene says WHERE (ground point, length, facing) and WHAT
 * (kind, pose, phase); the kit owns bones, gait, draw order and colours.
 *
 *   drawAnimal(ctx, c, spec, look) -> sk       solve + paint
 *   solveAnimal(spec) -> sk                     pure: joints, anchors, warnings (no ctx, no clock)
 *   paintAnimal(ctx, c, sk, look)
 *   animalPhase(dist, spec) -> 0..1             walk phase from distance (planted feet never slide)
 *   animalStride(spec) -> px                    ground covered per walk cycle
 *   animalLook(c, kind, { coat, mark, mood, t }) -> look
 *   ANIMAL_KINDS, ANIMAL_POSES
 *
 * spec: { x, y          ground contact (body centre, px)
 *         length         nose to tail base, px (>= 90 for a readable face)
 *         facing = 1     1 right, -1 left
 *         kind = 'cow'   cow goat sheep dog cat deer tiger elephant
 *         pose = 'stand' stand | walk | graze | lie
 *         phase = 0      walk cycle 0..1 (use animalPhase) }
 * look: { coat (colour or series 1..8), mark ('patches'|'stripes'|'spots'|'tabby'|'wool'|'none'),
 *         mood 'smile'|'happy'|'sad'|'oops'|'sleepy', t (blink clock) }
 * sk.anchors (world): nose, head {x,y,r}, eye, back (withers top), tail, tailTip,
 * foot[4] (near hind, near fore, far hind, far fore: the contact point), belly
 * (lowest body point), bounds {x0,y0,x1,y1}. sk.warnings: [{ code, limb, over }],
 * code unknown-kind | unknown-pose | tiny; data, never thrown.
 * Legs: two-bone IK; the fore knee always bends forward, the hind hock back
 * (an elephant's hind knee forward, as it really is). Colours: tokens only;
 * coats are fixed tones (hue read from the palette) so an animal looks the
 * same in both themes. Animals are drawn as ordinary animals: no emblem,
 * religious or mythological framing. ASCII only.
 */
import { mix, alpha, lighten, darken, luma, hsl, hslOf, drawShadow } from './SimLook.js';
import { ik2 } from './SimFigure.js';
import { lookOf as lookProfile } from './lookProfile.js';

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pt = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const add = (p, dx, dy) => ({ x: p.x + dx, y: p.y + dy });
const dir = (deg) => ({ x: Math.cos(deg * RAD), y: -Math.sin(deg * RAD) });   // deg above horizontal, facing right

// Units of L (nose to tail base is normalised to exactly L in the stand pose).
// body: shoulder-hip span; chest/rump: torso radii; belly: [drop, ry]; leg: root to
// ground; legR: [top, foot]; ext: standing reach of [fore, hind] legs; neck: len, ang
// (deg up), r0, r1; head: r, len (snout), ang, snout r; graze: [neck ang, head ang].
const KINDS = {
  cow: { body: 0.5, chest: 0.15, rump: 0.14, belly: [0.03, 0.15], leg: 0.36, legR: [0.05, 0.026], ext: [0.97, 0.9], foot: 'hoof',
    neck: [0.15, 22, 0.1, 0.075], head: [0.072, 0.15, -58, 0.055], graze: [-40, -88], ears: 'side', horns: 'cow',
    tail: { kind: 'hang', len: 0.42, r: 0.013, tuft: 0.032 }, mark: 'patches', muzzle: true, stride: 1.3, lie: 'tuck', hind: 'back' },
  goat: { body: 0.44, chest: 0.12, rump: 0.11, belly: [0.02, 0.12], leg: 0.38, legR: [0.034, 0.018], ext: [0.97, 0.9], foot: 'hoof',
    neck: [0.17, 42, 0.07, 0.052], head: [0.058, 0.13, -48, 0.04], graze: [-30, -85], ears: 'droop', horns: 'goat', beard: true,
    tail: { kind: 'up', len: 0.08, r: 0.02 }, mark: 'none', belly2: true, stride: 1.3, lie: 'tuck', hind: 'back' },
  sheep: { body: 0.46, chest: 0.15, rump: 0.15, belly: [0.03, 0.15], leg: 0.31, legR: [0.028, 0.018], ext: [0.97, 0.92], foot: 'hoof',
    neck: [0.12, 30, 0.09, 0.065], head: [0.062, 0.12, -50, 0.042], graze: [-38, -85], ears: 'side', horns: 'none',
    tail: { kind: 'stub', len: 0.07, r: 0.03 }, mark: 'wool', darkFace: true, stride: 1.25, lie: 'tuck', hind: 'back' },
  dog: { body: 0.43, chest: 0.12, rump: 0.1, belly: [0.0, 0.11], leg: 0.36, legR: [0.038, 0.022], ext: [0.97, 0.88], foot: 'paw',
    neck: [0.15, 48, 0.075, 0.058], head: [0.074, 0.13, -10, 0.042], graze: [-35, -70], ears: 'droop', horns: 'none',
    tail: { kind: 'curl', len: 0.26, r: 0.022 }, mark: 'none', belly2: true, nose: true, stride: 1.4, lie: 'forward', hind: 'back' },
  cat: { body: 0.42, chest: 0.1, rump: 0.105, belly: [0.0, 0.1], leg: 0.29, legR: [0.032, 0.02], ext: [0.97, 0.86], foot: 'paw',
    neck: [0.09, 48, 0.068, 0.055], head: [0.085, 0.085, -6, 0.032], graze: [-35, -50], ears: 'point', horns: 'none',
    tail: { kind: 'up', len: 0.4, r: 0.02 }, mark: 'tabby', whiskers: true, stride: 1.35, lie: 'forward', hind: 'back' },
  deer: { body: 0.46, chest: 0.12, rump: 0.12, belly: [0.0, 0.11], leg: 0.46, legR: [0.034, 0.016], ext: [0.97, 0.9], foot: 'hoof',
    neck: [0.21, 52, 0.068, 0.048], head: [0.058, 0.14, -38, 0.034], graze: [-38, -85], ears: 'big', horns: 'antler',
    tail: { kind: 'stub', len: 0.06, r: 0.022 }, mark: 'spots', belly2: true, nose: true, stride: 1.25, lie: 'tuck', hind: 'back' },
  tiger: { body: 0.54, chest: 0.13, rump: 0.12, belly: [0.0, 0.12], leg: 0.3, legR: [0.05, 0.034], ext: [0.97, 0.86], foot: 'paw',
    neck: [0.1, 18, 0.1, 0.085], head: [0.088, 0.1, -12, 0.052], graze: [-30, -45], ears: 'round', horns: 'none',
    tail: { kind: 'long', len: 0.62, r: 0.022 }, mark: 'stripes', belly2: true, whiskers: true, muzzleLight: true, stride: 1.4, lie: 'forward', hind: 'back' },
  elephant: { body: 0.55, chest: 0.2, rump: 0.19, belly: [0.04, 0.18], leg: 0.42, legR: [0.075, 0.066], ext: [0.99, 0.985], foot: 'pad',
    neck: [0.07, 12, 0.16, 0.15], head: [0.155, 0.12, -45, 0.075], graze: [-5, -60], ears: 'fan', horns: 'none',
    trunk: { len: 0.5, r0: 0.05, r1: 0.024 }, tusks: true, tail: { kind: 'hang', len: 0.3, r: 0.012, tuft: 0.025 }, mark: 'none', stride: 1.15, lie: 'forward', hind: 'fwd' },
};
// Heads are drawn bigger than life (as SimFigure's are) so the face reads at 90 px.
for (const K of Object.values(KINDS)) K.head = [K.head[0] * 1.25, K.head[1], K.head[2], K.head[3] * 1.12];
export const ANIMAL_KINDS = Object.keys(KINDS);
export const ANIMAL_POSES = ['stand', 'walk', 'graze', 'lie'];
const DUTY = 0.72;
const GAIT = [0, 0.25, 0.5, 0.75];            // near hind, near fore, far hind, far fore (four-beat walk)

// Geometry in L units, facing right, ground at 0, body centre at x = 0.
function frame(K, pose, phase) {
  const lie = pose === 'lie';
  const low = Math.max(K.chest, K.rump, K.belly[0] + K.belly[1]);
  const bob = pose === 'walk' ? 0.006 * Math.cos(2 * TAU * phase) : 0;
  const rootY = lie ? -low : -K.leg + bob;
  const S = { x: K.body / 2, y: rootY - (K.trunk ? 0 : 0.012) }, P = { x: -K.body / 2, y: rootY };
  let [na, ha] = pose === 'graze' ? K.graze : [K.neck[1], K.head[2]];
  const N0 = add(S, K.chest * 0.45, -K.chest * 0.35);
  const noseY = (a) => N0.y + dir(a).y * K.neck[0] + dir(ha).y * (K.head[1] + K.head[3] * 0.8);
  // Grazing, the neck drops until the muzzle reaches the grass (an elephant uses its trunk).
  if (pose === 'graze' && !K.trunk) while (na > -85 && noseY(na) < -0.035) na -= 1;
  const N1 = add(N0, dir(na).x * K.neck[0], dir(na).y * K.neck[0]);
  const hd = dir(ha);
  const Hc = N1;
  const tip = add(Hc, hd.x * K.head[1], hd.y * K.head[1]);
  const nose = add(tip, hd.x * K.head[3] * 0.8, hd.y * K.head[3] * 0.8);
  const TB = add(P, -K.rump * 0.85, -K.rump * 0.45);
  return { S, P, N0, N1, Hc, hd, ha, na, tip, nose, TB, rootY, low };
}

const UNIT = {};
function unitOf(kind) {
  if (!UNIT[kind]) { const g = frame(KINDS[kind], 'stand', 0); UNIT[kind] = 1 / (g.nose.x - g.TB.x); }
  return UNIT[kind];
}

/** Ground covered per walk cycle (px). */
export function animalStride(spec) {
  const K = KINDS[spec.kind] ?? KINDS.cow;
  return K.stride * K.leg * (spec.length ?? 160) * unitOf(KINDS[spec.kind] ? spec.kind : 'cow');
}
/** Walk phase 0..1 from distance travelled, so planted feet do not slide. */
export function animalPhase(dist, spec) {
  const u = dist / animalStride(spec);
  return ((u % 1) + 1) % 1;
}

/** Pure solve (see the header): same spec, same joints. */
export function solveAnimal(spec) {
  const warnings = [];
  const kind = KINDS[spec.kind] ? spec.kind : 'cow';
  if (spec.kind != null && !KINDS[spec.kind]) warnings.push({ code: 'unknown-kind', limb: String(spec.kind), over: 0 });
  const pose = ANIMAL_POSES.includes(spec.pose ?? 'stand') ? spec.pose ?? 'stand' : 'stand';
  if (pose !== (spec.pose ?? 'stand')) warnings.push({ code: 'unknown-pose', limb: String(spec.pose), over: 0 });
  const K = KINDS[kind];
  const L = Math.max(10, spec.length ?? 160), f = spec.facing === -1 ? -1 : 1;
  const x0 = spec.x ?? 0, y0 = spec.y ?? 0, phase = pose === 'walk' ? (((spec.phase ?? 0) % 1) + 1) % 1 : 0;
  const u = L * unitOf(kind);
  const g = frame(K, pose, phase);
  // Local px (facing right): X = x0 + lx * u, Y = y0 + ly * u.
  const P2 = (p) => ({ x: x0 + p.x * u, y: y0 + p.y * u });
  const S = P2(g.S), P = P2(g.P);
  const chest = K.chest * u, rump = K.rump * u;
  const footR = K.legR[1] * u;
  const roots = [add(P, rump * 0.18, rump * 0.1), add(S, -chest * 0.12, chest * 0.2)];        // hind, fore
  // Standing bone sums (the lie pose reuses them).
  const stand = frame(K, 'stand', 0);
  const sRoots = [{ x: 0, y: (stand.P.y + K.rump * 0.1) }, { x: 0, y: (stand.S.y + K.chest * 0.2) }];
  const A = (K.stride * K.leg * u * DUTY) / 2, lift = 0.12 * K.leg * u;
  const OFF = [-0.025, 0.01];                                   // neutral foot x from the root (hind, fore)
  // Bones: the standing bend (ext), but never too short to reach the far end of a stride.
  const bones = [0, 1].map((j) => {
    const v = (-sRoots[j].y - K.legR[1]) * u, h0 = Math.abs(OFF[j]) * u;
    return Math.max(Math.hypot(v, h0) / K.ext[j ? 0 : 1], Math.hypot(v + 0.012 * u, A + h0 + 0.012 * u) / 0.98);   // + far-side and bob slack
  });
  const split = [[0.56, 0.44], [0.54, 0.46]];
  const legs = [0, 1, 2, 3].map((i) => {
    const fore = i % 2 === 1, j = fore ? 1 : 0, far = i >= 2;
    const root = add(roots[j], far ? 0.012 * u : 0, far ? -0.006 * u : 0);
    const l1 = bones[j] * split[j][0], l2 = bones[j] * split[j][1];
    const neutral = root.x + OFF[j] * u + (far ? 0.012 * u : 0);
    let tx = neutral, ty = y0 - footR, contact = true;
    if (pose === 'walk') {
      const q = (phase + GAIT[i]) % 1;
      if (q < DUTY) tx = neutral + A * (1 - (2 * q) / DUTY);
      else {
        const s = (q - DUTY) / (1 - DUTY), e = s * s * (3 - 2 * s);
        tx = neutral - A + 2 * A * e; ty -= lift * Math.sin(Math.PI * s); contact = false;
      }
    } else if (pose === 'graze') {
      tx = neutral + (fore ? 0.05 : -0.02) * u * (far ? 0.6 : 1);
      // Keep a spread foot within reach, so it stays on the ground.
      const dy = ty - root.y, reach = 0.98 * (l1 + l2);
      if (Math.hypot(tx - root.x, dy) > reach) tx = root.x + Math.sign(tx - root.x) * Math.sqrt(Math.max(0, reach * reach - dy * dy));
    } else if (pose === 'lie') {
      // Folded on the ground, explicit (an IK fold would push a knee through the floor):
      // fore legs tucked back under the chest or stretched forward, hind hock back, foot forward.
      const b = bones[j], kr = lerp(K.legR[0], K.legR[1], 0.55) * u, s = far ? 0.85 : 1;
      let kx, ex;
      if (fore) [kx, ex] = K.lie === 'forward' ? [0.32, 0.8] : [0.14, -0.14];
      else [kx, ex] = K.hind === 'fwd' ? [-0.34, -0.78] : [-0.24, 0.16];
      const knee = { x: root.x + kx * b * s, y: y0 - kr }, end = { x: root.x + ex * b * s, y: y0 - footR };
      return { fore, far, root, knee, end, contact: { x: end.x, y: y0 }, planted: false, side: fore || K.hind === 'fwd' ? -1 : 1 };
    }
    // Fore knee forward (side -1 facing right); hind hock back (+1); an elephant's hind knee forward.
    const side = fore || K.hind === 'fwd' ? -1 : 1;
    const r = ik2(root.x, root.y, tx, ty, l1, l2, side, { maxK: 0.995, minK: pose === 'lie' ? 0.12 : 0.3 });
    const end = { x: r.ex, y: r.ey };
    return { fore, far, root, knee: { x: r.jx, y: r.jy }, end, contact: { x: end.x, y: end.y + footR }, planted: contact && Math.abs(r.miss) < 0.5, side };
  });
  const N0 = P2(g.N0), N1 = P2(g.N1), Hc = P2(g.Hc), tip = P2(g.tip), nose = P2(g.nose), TB = P2(g.TB);
  const headR = K.head[0] * u;
  const up = { x: g.hd.y, y: -g.hd.x };                      // head-local "up" (facing right)
  const eye = add(Hc, g.hd.x * headR * 0.28 + up.x * headR * 0.34, g.hd.y * headR * 0.28 + up.y * headR * 0.34);
  const belly = { x: x0, y: y0 + (g.rootY + Math.max(K.chest, K.rump, K.belly[0] + K.belly[1])) * u };
  if (L < 60) warnings.push({ code: 'tiny', limb: 'body', over: Math.round(60 - L) });
  const local = { S, P, chest, rump, N0, N1, Hc, hd: g.hd, up, tip, nose, TB, headR, eye, legs, footR, belly, u };
  // World anchors: mirror about x0 when facing left.
  const W = (p) => ({ x: x0 + f * (p.x - x0), y: p.y });
  const tl = tailPoints(K, local, phase, pose);
  const pts = [nose, Hc, TB, tl[tl.length - 1], ...legs.flatMap((l) => [l.knee, l.contact]), add(S, 0, -chest), add(P, 0, -rump), add(Hc, 0, -headR * (K.ears === 'big' || K.horns === 'antler' ? 2.6 : 1.6))];
  const xs = pts.map((p) => W(p).x), ys = pts.map((p) => p.y);
  const bounds = { x0: Math.min(...xs) - footR, x1: Math.max(...xs) + footR, y0: Math.min(...ys), y1: Math.max(y0, ...ys) };
  return {
    kind, pose, phase, f, x: x0, y: y0, length: L, K, local, warnings, tail: tl,
    anchors: {
      nose: W(nose), head: { ...W(Hc), r: headR }, eye: W(eye), back: W(add(S, 0, -chest)), tail: W(TB), tailTip: W(tl[tl.length - 1]),
      foot: legs.map((l) => W(l.contact)), belly: W(belly), bounds,
    },
  };
}

// Tail centre line (local px), base to tip.
function tailPoints(K, Lc, phase, pose) {
  const T = K.tail, u = Lc.u, b = Lc.TB, n = 9;
  const sway = pose === 'walk' ? Math.sin(phase * TAU) : 0;
  const len = T.len * u;
  let c1, c2, e;
  if (T.kind === 'hang') { c1 = add(b, -0.12 * len, 0.1 * len); c2 = add(b, (-0.2 + 0.06 * sway) * len, 0.6 * len); e = add(b, (-0.16 + 0.1 * sway) * len, (pose === 'lie' ? 0.6 : 0.95) * len); }
  else if (T.kind === 'up') { c1 = add(b, -0.5 * len, -0.1 * len); c2 = add(b, (-0.7 + 0.1 * sway) * len, -0.7 * len); e = add(b, (-0.45 + 0.12 * sway) * len, -1.0 * len); }
  else if (T.kind === 'curl') { c1 = add(b, -0.5 * len, -0.5 * len); c2 = add(b, (-0.1 + 0.08 * sway) * len, -1.2 * len); e = add(b, (0.35 + 0.08 * sway) * len, -0.95 * len); }
  else if (T.kind === 'long') { c1 = add(b, -0.35 * len, 0.25 * len); c2 = add(b, (-0.55 + 0.06 * sway) * len, 0.75 * len); e = add(b, (-0.85 + 0.08 * sway) * len, (pose === 'lie' ? 0.35 : 0.55) * len); }
  else { c1 = add(b, -0.4 * len, 0.1 * len); c2 = add(b, -0.8 * len, 0.3 * len); e = add(b, -0.9 * len, 0.6 * len); }
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, m = 1 - t;
    out.push({ x: m * m * m * b.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * e.x, y: m * m * m * b.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * e.y });
  }
  return out;
}

// -- Look ---------------------------------------------------------------------------

/** Resolved colours for an animal. o: { coat, mark, mood, t } */
export function animalLook(c, kind, o = {}) {
  if (o.__animal) return o;
  const K = KINDS[kind] ?? KINDS.cow;
  const warm = hslOf(mix(c.s8, c.warning, 0.3)).h - 6, cool = hslOf(c.s5).h;
  const coats = {
    cow: hsl(warm, 0.22, 0.9), goat: hsl(warm, 0.42, 0.4), sheep: hsl(warm, 0.18, 0.9), dog: hsl(warm, 0.5, 0.56),
    cat: hsl(cool, 0.07, 0.6), deer: hsl(warm, 0.52, 0.46), tiger: hsl(warm + 2, 0.86, 0.55), elephant: hsl(cool, 0.06, 0.52),
  };
  const coat = typeof o.coat === 'number' ? c['s' + (((Math.max(1, o.coat | 0) - 1) % 8) + 1)] : o.coat ?? coats[kind] ?? coats.cow;
  const hc = hslOf(coat);
  const ink = hsl(warm - 10, 0.35, 0.12);
  return {
    __animal: true, c, kind, coat, ink,
    rim: hsl(hc.h, Math.min(0.6, hc.s * 0.9 + 0.05), Math.max(0.1, hc.l - 0.34)),   // the one darker rim round the silhouette
    dark: luma(c.bgDeep) < 0.5,
    mark: o.mark ?? K.mark,
    markCol: kind === 'tiger' || kind === 'cow' ? hsl(warm - 12, 0.3, 0.16) : kind === 'deer' ? hsl(warm, 0.4, 0.88) : hsl(hc.h, hc.s * 0.8, Math.max(0.12, hc.l - 0.22)),
    light: kind === 'sheep' ? hsl(warm, 0.15, 0.97) : hsl(hc.h, Math.min(0.4, hc.s * 0.5), Math.min(0.95, hc.l + 0.35)),
    face: K.darkFace ? hsl(warm - 8, 0.2, 0.24) : coat,
    hoof: hsl(warm - 10, 0.22, 0.2),
    horn: hsl(warm + 4, 0.25, 0.82),
    muzzle: hsl(warm - 14, 0.38, 0.74),
    nose: hsl(warm - 10, 0.25, 0.15),
    mood: o.mood ?? 'smile', t: o.t ?? 0,
  };
}

// -- Paint helpers (same house shapes as SimFigure) ------------------------------------

function capsule(ctx, a, b, ra, rb) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.max(1e-6, Math.hypot(dx, dy));
  const ang = Math.atan2(dy, dx);
  const phi = Math.acos(clamp((ra - rb) / d, -0.98, 0.98));
  ctx.moveTo(a.x + ra * Math.cos(ang + phi), a.y + ra * Math.sin(ang + phi));
  ctx.arc(a.x, a.y, ra, ang + phi, ang + TAU - phi);
  ctx.arc(b.x, b.y, rb, ang - phi, ang + phi);
  ctx.closePath();
}
function circle(ctx, x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
function cushion(ctx, pathFn, col, dx, dy, shade = 0.2) {
  if (lookProfile().figShade === false) { shade = 0; dx = 0; dy = 0; }   // a flat look: one fill
  ctx.save();
  ctx.beginPath(); pathFn(); ctx.fillStyle = darken(col, shade); ctx.fill(); ctx.clip();
  ctx.translate(dx, dy);
  ctx.beginPath(); pathFn(); ctx.fillStyle = col; ctx.fill();
  ctx.restore();
}
function chain(ctx, pts, r0, r1) {
  for (let i = 0; i + 1 < pts.length; i++) capsule(ctx, pts[i], pts[i + 1], lerp(r0, r1, i / (pts.length - 1)), lerp(r0, r1, (i + 1) / (pts.length - 1)));
}

function torsoPath(ctx, Lc, K) {
  const { S, P, chest, rump, u } = Lc;
  capsule(ctx, S, P, chest, rump);
  const mx = (S.x + P.x) / 2, my = (S.y + P.y) / 2 + K.belly[0] * u;
  ctx.moveTo(mx + Math.abs(S.x - P.x) * 0.48, my);
  ctx.ellipse(mx, my, Math.abs(S.x - P.x) * 0.48, K.belly[1] * u, 0, 0, TAU);
  if (K.mark === 'wool' || Lc.wool) {
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const p = pt(P, S, i / n), r = lerp(rump, chest, i / n);
      circle(ctx, p.x, p.y - r * 0.82, r * 0.32);
    }
    circle(ctx, P.x - rump * 0.82, P.y, rump * 0.3);
    circle(ctx, S.x + chest * 0.84, S.y - chest * 0.1, chest * 0.3);
  }
}
function headPath(ctx, Lc, K) {
  capsule(ctx, Lc.N0, Lc.N1, K.neck[2] * Lc.u, K.neck[3] * Lc.u);
  circle(ctx, Lc.Hc.x, Lc.Hc.y, Lc.headR);
  capsule(ctx, Lc.Hc, Lc.tip, K.head[3] * Lc.u * 1.05, K.head[3] * Lc.u * 0.85);
}

function paintLeg(ctx, sk, leg, L, dk) {
  const K = sk.K, Lc = sk.local, u = Lc.u;
  const col = dk ? darken(K.darkFace ? L.face : L.coat, dk) : K.darkFace ? L.face : L.coat;
  const r0 = K.legR[0] * u * (leg.fore ? 1 : 1.12), rk = lerp(K.legR[0], K.legR[1], 0.55) * u, r1 = K.legR[1] * u;
  cushion(ctx, () => { capsule(ctx, leg.root, leg.knee, r0, rk); capsule(ctx, leg.knee, leg.end, rk, r1); }, col, -r0 * 0.14, -r0 * 0.16, 0.18);
  const e = leg.end, fr = Lc.footR;
  ctx.beginPath();
  if (K.foot === 'hoof') {
    ctx.moveTo(e.x - fr * 1.0, e.y); ctx.lineTo(e.x + fr * 1.1, e.y); ctx.lineTo(e.x + fr * 1.35, e.y + fr); ctx.lineTo(e.x - fr * 1.05, e.y + fr); ctx.closePath();
    ctx.fillStyle = dk ? darken(L.hoof, dk * 0.5) : L.hoof; ctx.fill();
  } else if (K.foot === 'pad') {
    ctx.ellipse(e.x + fr * 0.1, e.y + fr * 0.35, fr * 1.15, fr * 0.65, 0, 0, TAU);
    ctx.fillStyle = darken(col, 0.12); ctx.fill();
    ctx.fillStyle = dk ? darken(L.horn, dk) : L.horn;
    for (const k of [-0.5, 0.1, 0.7]) { ctx.beginPath(); ctx.ellipse(e.x + fr * k, e.y + fr * 0.62, fr * 0.2, fr * 0.16, 0, 0, TAU); ctx.fill(); }
  } else {
    ctx.ellipse(e.x + fr * 0.35, e.y + fr * 0.15, fr * 1.3, fr * 0.85, 0, 0, TAU);
    ctx.fillStyle = dk ? darken(L.light, dk + 0.08) : mix(col, L.light, 0.3); ctx.fill();
  }
}

function paintTail(ctx, sk, L) {
  const K = sk.K, Lc = sk.local, u = Lc.u, T = K.tail, pts = sk.tail;
  const col = darken(L.coat, 0.06);
  cushion(ctx, () => chain(ctx, pts, T.r * u * (T.kind === 'stub' ? 1 : 1.2), T.r * u * (T.kind === 'stub' ? 0.9 : 0.7)), col, -T.r * u * 0.2, -T.r * u * 0.25, 0.18);
  const tipP = pts[pts.length - 1];
  if (T.tuft) { ctx.beginPath(); ctx.ellipse(tipP.x, tipP.y + T.tuft * u * 0.4, T.tuft * u * 0.55, T.tuft * u, 0, 0, TAU); ctx.fillStyle = darken(L.coat, 0.45); ctx.fill(); }
  if (L.mark === 'stripes' || L.mark === 'tabby') {
    ctx.fillStyle = L.mark === 'stripes' ? L.markCol : alpha(L.markCol, 0.55);
    for (let i = 3; i < pts.length; i += 2) { ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, T.r * u * 0.95, 0, TAU); ctx.fill(); }
    if (L.mark === 'stripes') { ctx.beginPath(); ctx.arc(tipP.x, tipP.y, T.r * u * 0.8, 0, TAU); ctx.fill(); }
  }
  if (sk.kind === 'deer') { ctx.beginPath(); ctx.ellipse(pts[0].x - T.r * u * 0.3, pts[0].y + T.r * u, T.r * u * 0.7, T.r * u * 1.1, 0.3, 0, TAU); ctx.fillStyle = L.light; ctx.fill(); }
}

function paintMarks(ctx, sk, L) {
  const K = sk.K, Lc = sk.local, u = Lc.u, { S, P, chest, rump } = Lc;
  const mark = L.mark;
  ctx.save();
  ctx.beginPath(); torsoPath(ctx, Lc, K); ctx.clip();
  const span = S.x - P.x;
  if (K.belly2 || sk.kind === 'tiger') {
    ctx.beginPath();
    ctx.ellipse((S.x + P.x) / 2, sk.local.belly.y + chest * 0.25, span * 0.55, chest * 0.62, 0, 0, TAU);
    ctx.fillStyle = sk.kind === 'tiger' ? hsl(hslOf(L.coat).h, 0.2, 0.94) : alpha(L.light, 0.85); ctx.fill();
  }
  if (mark === 'patches') {
    ctx.fillStyle = L.markCol;
    for (const [fx, fy, rx, ry, a] of [[0.18, -0.25, 0.32, 0.55, 0.4], [-0.32, 0.05, 0.26, 0.5, -0.3], [0.58, 0.18, 0.16, 0.34, 0.2], [-0.05, 0.62, 0.14, 0.2, 0]]) {
      ctx.beginPath(); ctx.ellipse(P.x + span * (fx + 0.5), S.y + chest * fy, span * rx * 0.5, chest * ry, a, 0, TAU); ctx.fill();
    }
  } else if (mark === 'stripes' || mark === 'tabby') {
    ctx.fillStyle = mark === 'stripes' ? L.markCol : alpha(L.markCol, 0.55);
    const n = mark === 'stripes' ? 9 : 7, top = Math.min(S.y - chest, P.y - rump);
    for (let i = 0; i < n; i++) {
      const x = lerp(P.x - rump * 0.6, S.x + chest * 0.2, (i + 0.5) / n), w = (mark === 'stripes' ? 0.022 : 0.014) * u, d = chest * (i % 2 ? 1.05 : 1.45);
      ctx.beginPath();
      ctx.moveTo(x - w, top - 2); ctx.quadraticCurveTo(x - w * 1.4 + 0.02 * u, top + d * 0.5, x + 0.01 * u, top + d);
      ctx.quadraticCurveTo(x + w * 1.2 + 0.02 * u, top + d * 0.45, x + w, top - 2); ctx.closePath(); ctx.fill();
    }
  } else if (mark === 'spots') {
    ctx.fillStyle = L.markCol;
    for (let row = 0; row < 3; row++) for (let i = 0; i < 7 - row; i++) {
      const x = lerp(P.x - rump * 0.3, S.x - chest * 0.1, (i + 0.5 + row * 0.5) / 7), y = S.y - chest * 0.55 + row * chest * 0.36;
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.2, 0.011 * u), 0, TAU); ctx.fill();
    }
  } else if (mark === 'wool') {
    ctx.strokeStyle = alpha(darken(L.coat, 0.18), 0.7); ctx.lineWidth = Math.max(1, 0.006 * u); ctx.lineCap = 'round';
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
      const x = lerp(P.x - rump * 0.2, S.x, (i + 0.3 + (row % 2) * 0.5) / 6), y = S.y - chest * 0.4 + row * chest * 0.45;
      ctx.beginPath(); ctx.arc(x, y, 0.02 * u, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    }
  }
  // One light gloss along the back (none under a flat look).
  if (lookProfile().figShade === false) { ctx.restore(); return; }
  ctx.beginPath();
  ctx.moveTo(P.x - rump * 0.2, P.y - rump * 0.78);
  ctx.quadraticCurveTo((S.x + P.x) / 2, Math.min(S.y - chest, P.y - rump) - 0.002 * u, S.x + chest * 0.1, S.y - chest * 0.8);
  ctx.strokeStyle = alpha(lighten(L.coat, 0.45), 0.55); ctx.lineWidth = Math.max(1.5, 0.014 * u); ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
}

function paintEars(ctx, sk, L, back) {
  const K = sk.K, Lc = sk.local, r = Lc.headR, H = Lc.Hc, hd = Lc.hd, up = Lc.up;
  const at = (a, b) => ({ x: H.x + hd.x * a * r + up.x * b * r, y: H.y + hd.y * a * r + up.y * b * r });
  const tint = K.ears === 'droop' ? 0.2 : 0.07;
  const col = darken(L.face, back ? tint + 0.18 : tint), inner = mix(L.face, L.muzzle, 0.55);
  const ang = Math.atan2(hd.y, hd.x);
  ctx.save();
  if (K.ears === 'fan') {
    if (back) { ctx.restore(); return; }
    const c0 = at(-0.9, -0.1);
    cushion(ctx, () => { ctx.ellipse(c0.x, c0.y + r * 0.25, r * 0.78, r * 1.05, -0.15, 0, TAU); }, darken(L.coat, 0.06), -r * 0.08, -r * 0.1, 0.2);
    ctx.beginPath(); ctx.ellipse(c0.x - r * 0.05, c0.y + r * 0.3, r * 0.5, r * 0.75, -0.15, 0, TAU); ctx.fillStyle = alpha(L.muzzle, 0.45); ctx.fill();
    ctx.restore(); return;
  }
  const base = at(-0.35, 0.78);
  ctx.translate(base.x, base.y);
  if (K.ears === 'side') { ctx.rotate(ang + Math.PI * 0.92); ctx.beginPath(); ctx.ellipse(r * 0.5, 0, r * 0.62, r * 0.26, 0, 0, TAU); }
  else if (K.ears === 'droop') { ctx.rotate(ang + Math.PI * 0.62); ctx.beginPath(); ctx.ellipse(r * 0.55, 0, r * 0.7, r * 0.3, 0, 0, TAU); }
  else if (K.ears === 'big') { ctx.rotate(ang + Math.PI * 1.25); ctx.beginPath(); ctx.ellipse(r * 0.75, 0, r * 0.85, r * 0.36, 0, 0, TAU); }
  else if (K.ears === 'point') { ctx.rotate(ang + Math.PI * 1.42); ctx.beginPath(); ctx.moveTo(0, -r * 0.42); ctx.quadraticCurveTo(r * 0.9, -r * 0.1, r * 1.05, 0); ctx.quadraticCurveTo(r * 0.8, r * 0.2, 0, r * 0.42); ctx.closePath(); }
  else { ctx.rotate(ang + Math.PI * 1.4); ctx.beginPath(); ctx.ellipse(r * 0.3, 0, r * 0.42, r * 0.38, 0, 0, TAU); }
  ctx.fillStyle = col; ctx.fill();
  if (!back) {
    ctx.save(); ctx.clip();
    ctx.beginPath(); ctx.ellipse(r * 0.55, r * 0.06, r * 0.4, r * 0.14, 0, 0, TAU); ctx.fillStyle = inner; ctx.fill();
    ctx.restore();
    if (sk.kind === 'tiger') { ctx.beginPath(); ctx.arc(r * 0.35, 0, r * 0.15, 0, TAU); ctx.fillStyle = L.light; ctx.fill(); }
  }
  ctx.restore();
}

function paintHorns(ctx, sk, L, back) {
  const K = sk.K, Lc = sk.local, r = Lc.headR, H = Lc.Hc, hd = Lc.hd, up = Lc.up, u = Lc.u;
  if (K.horns === 'none') return;
  const at = (a, b) => ({ x: H.x + hd.x * a * r + up.x * b * r, y: H.y + hd.y * a * r + up.y * b * r });
  const col = back ? darken(L.horn, 0.22) : L.horn, w = Math.max(1.6, 0.012 * u);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const stroke = (pts, lw) => {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 3) ctx.quadraticCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y); else for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = darken(col, 0.3); ctx.lineWidth = lw + 1.5; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
  };
  const sh = back ? 0.18 : 0;
  if (K.horns === 'cow') stroke([at(-0.05 + sh, 0.9), at(-0.25 + sh, 1.45), at(0.15 + sh, 1.75)], w * 1.5);
  else if (K.horns === 'goat') stroke([at(0.0 + sh, 0.92), at(-0.4 + sh, 1.9), at(-1.25 + sh, 1.55)], w * 1.6);
  else if (K.horns === 'antler') {
    const b0 = at(-0.05 + sh, 0.95), b1 = at(-0.45 + sh, 2.1), b2 = at(-0.95 + sh, 3.05);
    stroke([b0, b1, b2], w);
    stroke([pt(b0, b1, 0.45), at(0.45 + sh, 1.95)], w * 0.85);
    stroke([pt(b1, b2, 0.35), at(0.05 + sh, 2.95)], w * 0.8);
    stroke([pt(b1, b2, 0.9), at(-0.5 + sh, 3.5)], w * 0.7);
  }
  ctx.restore();
}

function paintFace(ctx, sk, L) {
  const K = sk.K, Lc = sk.local, r = Lc.headR, u = Lc.u, hd = Lc.hd, up = Lc.up, tip = Lc.tip;
  const sr = K.head[3] * u;
  // Muzzle / nose.
  if (K.muzzle) { ctx.beginPath(); ctx.ellipse(tip.x, tip.y, sr * 1.15, sr * 1.0, Math.atan2(hd.y, hd.x), 0, TAU); ctx.fillStyle = L.muzzle; ctx.fill(); }
  if (K.muzzleLight) { ctx.beginPath(); ctx.ellipse(tip.x - hd.x * sr * 0.2, tip.y - hd.y * sr * 0.2 + sr * 0.25, sr * 1.15, sr * 0.8, Math.atan2(hd.y, hd.x), 0, TAU); ctx.fillStyle = L.light; ctx.fill(); }
  const nz = add(tip, hd.x * sr * 0.72, hd.y * sr * 0.72);
  if (K.nose || K.whiskers) { ctx.beginPath(); ctx.ellipse(nz.x, nz.y - sr * 0.15, sr * (K.whiskers ? 0.32 : 0.42), sr * 0.3, 0, 0, TAU); ctx.fillStyle = K.whiskers ? L.muzzle : L.nose; ctx.fill(); }
  if (K.muzzle) { ctx.beginPath(); ctx.ellipse(nz.x - hd.x * sr * 0.2, nz.y - hd.y * sr * 0.2 - up.y * sr * 0.1, sr * 0.16, sr * 0.11, 0, 0, TAU); ctx.fillStyle = darken(L.muzzle, 0.45); ctx.fill(); }
  if (K.whiskers && r >= 6) {
    ctx.strokeStyle = alpha(L.dark ? lighten(L.coat, 0.7) : darken(L.coat, 0.5), 0.7); ctx.lineWidth = Math.max(0.8, 0.004 * u); ctx.lineCap = 'round';
    ctx.beginPath();
    for (const k of [-0.25, 0.25]) { ctx.moveTo(tip.x, tip.y + sr * 0.2); ctx.lineTo(tip.x + sr * 1.8, tip.y + sr * (0.2 + k * 1.6)); }
    ctx.stroke();
  }
  if (K.beard) { ctx.beginPath(); ctx.moveTo(tip.x - sr * 0.6, tip.y + sr * 0.6); ctx.quadraticCurveTo(tip.x - sr * 0.4, tip.y + sr * 2.0, tip.x - sr * 0.9, tip.y + sr * 2.2); ctx.quadraticCurveTo(tip.x - sr * 1.1, tip.y + sr, tip.x - sr * 1.2, tip.y + sr * 0.4); ctx.closePath(); ctx.fillStyle = darken(L.coat, 0.25); ctx.fill(); }
  // Tiger face stripes.
  if (L.mark === 'stripes') {
    ctx.strokeStyle = L.markCol; ctx.lineWidth = Math.max(1.2, 0.01 * u); ctx.lineCap = 'round';
    const H = Lc.Hc;
    ctx.beginPath();
    for (const k of [-0.25, 0.05, 0.35]) { ctx.moveTo(H.x + k * r, H.y - r * 0.95); ctx.lineTo(H.x + k * r - r * 0.05, H.y - r * 0.6); }
    ctx.moveTo(H.x - r * 0.95, H.y + r * 0.05); ctx.lineTo(H.x - r * 0.55, H.y + r * 0.15);
    ctx.stroke();
  }
  // The eye: white, pupil, sparkle; the mood shows in the lid and brow.
  const e = Lc.eye, er = Math.max(2.4, r * (sk.kind === 'elephant' ? 0.2 : 0.3)), mood = L.mood;
  // A look without faces (plain): one small ink dot for the eye, no white, glint, brow, mood or mouth.
  if (!lookProfile().faces) { ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(1.4, er * 0.5), 0, TAU); ctx.fillStyle = L.ink; ctx.fill(); return; }
  const blink = ((L.t * 0.8 + (sk.x % 5) * 0.23) % 4.6) < 0.12;
  ctx.lineCap = 'round';
  if (mood === 'happy' || mood === 'sleepy' || blink) {
    ctx.beginPath();
    if (mood === 'happy') ctx.arc(e.x, e.y + er * 0.4, er * 0.9, 1.1 * Math.PI, 1.9 * Math.PI);
    else { ctx.moveTo(e.x - er * 0.9, e.y); ctx.quadraticCurveTo(e.x, e.y + er * 0.6, e.x + er * 0.9, e.y); }
    ctx.strokeStyle = L.ink; ctx.lineWidth = Math.max(1.4, er * 0.32); ctx.stroke();
  } else {
    const wide = mood === 'oops' ? 1.15 : 1;
    if (er >= 2.6) { ctx.beginPath(); ctx.ellipse(e.x, e.y, er * wide, er * 1.12 * wide, 0, 0, TAU); ctx.fillStyle = hsl(hslOf(L.coat).h, 0.2, 0.97); ctx.fill(); }
    const pr = er >= 2.6 ? er * 0.66 : er * 0.9;
    ctx.beginPath(); ctx.ellipse(e.x + er * 0.2, e.y + er * 0.08, pr, pr * 1.1, 0, 0, TAU); ctx.fillStyle = L.ink; ctx.fill();
    if (er >= 2.6) { ctx.beginPath(); ctx.arc(e.x + er * 0.02, e.y - er * 0.28, Math.max(0.9, pr * 0.36), 0, TAU); ctx.fillStyle = hsl(hslOf(L.coat).h, 0.2, 0.98); ctx.fill(); }
  }
  if (mood === 'sad' || mood === 'oops') {
    ctx.beginPath(); ctx.moveTo(e.x - er, e.y - er * (mood === 'sad' ? 1.2 : 1.6)); ctx.lineTo(e.x + er * 0.9, e.y - er * (mood === 'sad' ? 1.65 : 1.6));
    ctx.strokeStyle = darken(L.face, 0.45); ctx.lineWidth = Math.max(1.2, er * 0.28); ctx.stroke();
  }
  // Mouth: a small line under the snout.
  if (r >= 6 && sk.kind !== 'elephant') {
    const m = add(tip, -hd.x * sr * 0.2 - up.x * sr * 0.75, -hd.y * sr * 0.2 - up.y * sr * 0.75);
    ctx.beginPath();
    if (mood === 'sad') ctx.arc(m.x, m.y + sr * 0.35, sr * 0.38, 1.2 * Math.PI, 1.75 * Math.PI);
    else ctx.arc(m.x, m.y - sr * 0.25, sr * 0.38, 0.25 * Math.PI, 0.8 * Math.PI);
    ctx.strokeStyle = alpha(L.ink, 0.75); ctx.lineWidth = Math.max(1, sr * 0.14); ctx.stroke();
  }
}

function paintTrunk(ctx, sk, L) {
  const K = sk.K, Lc = sk.local, u = Lc.u, T = K.trunk;
  if (!T) return;
  const b = Lc.tip, len = T.len * u, sway = sk.pose === 'walk' ? Math.sin(sk.phase * TAU) * 0.08 : 0;
  const graze = sk.pose === 'graze';
  const c1 = add(b, 0.12 * len, 0.25 * len), c2 = add(b, (0.06 + sway) * len, 0.75 * len);
  const e = graze ? add(b, (0.45 + sway) * len, Math.min(0.85 * len, sk.y - b.y - T.r1 * u * 1.4)) : add(b, (0.18 + sway) * len, Math.min(0.98 * len, sk.y - b.y - T.r1 * u * 2.2));
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, m = 1 - t;
    pts.push({ x: m * m * m * b.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * e.x, y: m * m * m * b.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * e.y });
  }
  pts.push(add(e, T.r1 * u * 1.4, -T.r1 * u * 0.6));          // the tip curls forward
  if (K.tusks) {
    const m0 = add(b, -0.02 * u, 0.03 * u);
    ctx.save(); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(m0.x, m0.y); ctx.quadraticCurveTo(m0.x + 0.03 * u, m0.y + 0.08 * u, m0.x + 0.09 * u, m0.y + 0.07 * u);
    ctx.strokeStyle = darken(L.horn, 0.2); ctx.lineWidth = Math.max(2.5, 0.022 * u) + 1.5; ctx.stroke();
    ctx.strokeStyle = L.horn; ctx.lineWidth = Math.max(2.5, 0.022 * u); ctx.stroke();
    ctx.restore();
  }
  cushion(ctx, () => chain(ctx, pts, T.r0 * u, T.r1 * u), L.coat, -T.r0 * u * 0.15, -T.r0 * u * 0.2, 0.2);
  ctx.save(); ctx.strokeStyle = alpha(darken(L.coat, 0.3), 0.6); ctx.lineWidth = Math.max(1, 0.005 * u); ctx.lineCap = 'round';
  for (let i = 3; i < pts.length - 2; i += 1) {
    const p = pts[i], q = pts[i + 1], a = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2, rr = lerp(T.r0, T.r1, i / pts.length) * u * 0.7;
    ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * rr * 0.2, p.y + Math.sin(a) * rr * 0.2); ctx.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr); ctx.stroke();
  }
  ctx.restore();
}

/** Paint a solved animal (far legs, tail, body, head, near legs, face). */
export function paintAnimal(ctx, c, sk, look = {}) {
  const L = animalLook(c, sk.kind, look);
  const K = sk.K, Lc = sk.local, u = Lc.u;
  ctx.save();
  // Mirror about the body centre when facing left: the whole rig is solved facing right.
  ctx.translate(sk.x, 0); ctx.scale(sk.f, 1); ctx.translate(-sk.x, 0);
  const lie = sk.pose === 'lie';
  drawShadow(ctx, c, sk.x + (lie ? 0.05 * u : 0), sk.y, (Lc.S.x - Lc.P.x) * 0.5 + Lc.chest * (lie ? 1.4 : 1.1), (lie ? 0.05 : 0.035) * u + 1.5);
  const legs = Lc.legs;
  // One darker rim round the whole silhouette (card rule 3): stroked once, under every part, so no line runs inside the body.
  if (L.rim) {
    const T = K.tail, stub = T.kind === 'stub';
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = L.rim; ctx.lineWidth = Math.max(2.5, 0.013 * u) * 2 * (lookProfile().figRim ?? 1);
    ctx.beginPath();
    torsoPath(ctx, Lc, K);
    capsule(ctx, Lc.N0, Lc.N1, K.neck[2] * u, K.neck[3] * u);
    circle(ctx, Lc.Hc.x, Lc.Hc.y, Lc.headR); capsule(ctx, Lc.Hc, Lc.tip, K.head[3] * u * 1.05, K.head[3] * u * 0.85);
    for (const lg of legs) {
      const r0 = K.legR[0] * u * (lg.fore ? 1 : 1.12), rk = lerp(K.legR[0], K.legR[1], 0.55) * u, r1 = K.legR[1] * u;
      capsule(ctx, lg.root, lg.knee, r0, rk); capsule(ctx, lg.knee, lg.end, rk, r1);
    }
    if (sk.tail?.length > 1) chain(ctx, sk.tail, T.r * u * (stub ? 1 : 1.2), T.r * u * (stub ? 0.9 : 0.7));
    ctx.stroke();
    ctx.restore();
  }
  paintEars(ctx, sk, L, true);
  paintHorns(ctx, sk, L, true);
  // Lying, a tucked leg is under the body: all of them go before the torso except paws stretched forward.
  const under = (lg) => lie && !(lg.fore && K.lie === 'forward') && !(!lg.fore && K.hind === 'fwd');
  for (const lg of legs) if (lg.far || under(lg)) paintLeg(ctx, sk, lg, L, lg.far ? 0.2 : 0.06);
  paintTail(ctx, sk, L);
  const lx = -0.012 * u, ly = -0.014 * u;
  cushion(ctx, () => torsoPath(ctx, Lc, K), L.coat, lx, ly, 0.16);
  paintMarks(ctx, sk, L);
  // Head and neck: the neck in the coat, the head in the face colour (a sheep's dark face).
  cushion(ctx, () => capsule(ctx, Lc.N0, Lc.N1, K.neck[2] * u, K.neck[3] * u), L.coat, lx, ly, 0.16);
  if (L.mark === 'stripes' || L.mark === 'tabby') {
    ctx.save(); ctx.beginPath(); capsule(ctx, Lc.N0, Lc.N1, K.neck[2] * u, K.neck[3] * u); ctx.clip();
    ctx.fillStyle = L.mark === 'stripes' ? L.markCol : alpha(L.markCol, 0.55);
    for (const t of [0.25, 0.6]) { const p = pt(Lc.N0, Lc.N1, t); ctx.beginPath(); ctx.ellipse(p.x, p.y - K.neck[2] * u * 0.7, 0.012 * u, K.neck[2] * u * 0.6, 0.3, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  if (K.mark === 'wool' && L.mark === 'wool') { ctx.beginPath(); circle(ctx, Lc.N1.x - 0.02 * u, Lc.N1.y - Lc.headR * 0.55, Lc.headR * 0.62); ctx.fillStyle = L.coat; ctx.fill(); }
  cushion(ctx, () => { circle(ctx, Lc.Hc.x, Lc.Hc.y, Lc.headR); capsule(ctx, Lc.Hc, Lc.tip, K.head[3] * u * 1.05, K.head[3] * u * 0.85); }, L.face, -Lc.headR * 0.1, -Lc.headR * 0.12, 0.14);
  if (L.mark === 'patches') { ctx.save(); ctx.beginPath(); circle(ctx, Lc.Hc.x, Lc.Hc.y, Lc.headR); ctx.clip(); ctx.beginPath(); ctx.ellipse(Lc.eye.x, Lc.eye.y, Lc.headR * 0.6, Lc.headR * 0.5, 0.3, 0, TAU); ctx.fillStyle = L.markCol; ctx.fill(); ctx.restore(); }
  if (K.mark === 'wool' && L.mark === 'wool') {
    ctx.beginPath(); circle(ctx, Lc.Hc.x - Lc.headR * 0.45, Lc.Hc.y - Lc.headR * 0.75, Lc.headR * 0.5); ctx.fillStyle = L.coat; ctx.fill();
  }
  for (const lg of legs) if (!lg.far && !under(lg)) paintLeg(ctx, sk, lg, L, 0);
  paintTrunk(ctx, sk, L);
  paintEars(ctx, sk, L, false);
  paintHorns(ctx, sk, L, false);
  paintFace(ctx, sk, L);
  ctx.restore();
}

/** Solve and paint; returns sk (anchors for labels, ropes, counts). */
export function drawAnimal(ctx, c, spec, look = {}) {
  const sk = solveAnimal(spec);
  paintAnimal(ctx, c, sk, animalLook(c, sk.kind, look));
  return sk;
}
