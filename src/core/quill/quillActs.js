/**
 * quillActs: the thirteen acts added to or rebuilt on Quill's rig for the look
 * pack (nod, clap, point, twirl, peek, think, wow, shrug, dance, backflip, bow,
 * inktick, slide), each with a still end pose for reduced motion (STILLS).
 *
 * The rig's other five acts stay in QuillRig.js. These live apart because they
 * are long: every act is one timeline, a set of keyframe tracks of the same
 * length started together, so all of it is WAAPI and nothing runs on timers.
 * That also makes an act seekable, which is how the review filmstrips are shot.
 *
 * Units: everything moves in viewBox units (240 x 300), on groups inside the
 * svg, so an act looks the same at 56 px and 280 px. .q-all is the whole body
 * (pivot: between his feet); .q-face his head; .q-flip-l/r are copies of his
 * flippers drawn over the scarf and face, for the acts that bring a flipper
 * in front of him; .q-back hides his front while he faces away.
 *
 * Colour: only --quill-* and the theme's own tokens. No DOM of its own, no
 * imports: QuillRig.js places actProps' markup and calls PLAYS / STILLS.
 */

// ---- easing ---------------------------------------------------------------

const OUT = 'cubic-bezier(.2,.75,.3,1)';      // fast start, soft landing
const IN = 'cubic-bezier(.6,.02,.85,.4)';     // slow start, hits hard
const IO = 'cubic-bezier(.45,0,.55,1)';
const BACK = 'cubic-bezier(.3,1.6,.6,1)';     // overshoots its stop
const STEP = 'steps(1, end)';

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t;
const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const f2 = (n) => Number(n.toFixed(2));

// ---- tracks ---------------------------------------------------------------

const q = (root, sel) => root.querySelector(sel);
const qa = (root, sel) => Array.from(root.querySelectorAll(sel));

function play(el, frames, duration) {
  if (!el || typeof el.animate !== 'function') return Promise.resolve();
  return new Promise((res) => {
    const a = el.animate(frames, { duration, easing: 'linear', fill: 'none' });
    a.addEventListener('finish', res, { once: true });
    a.addEventListener('cancel', res, { once: true });
  });
}

/**
 * One track: stops are [ms, value, easing of the segment that follows], where
 * value is a transform string or a keyframe object. The first and last stops
 * are held out to 0 and T.
 */
function track(el, T, stops) {
  const frame = ([ms, v, e]) => ({
    offset: ms / T, ...(typeof v === 'string' ? { transform: v } : v), ...(e ? { easing: e } : {}),
  });
  const frames = stops.map(frame);
  if (stops[0][0] > 0) frames.unshift(frame([0, stops[0][1]]));
  if (stops[stops.length - 1][0] < T) frames.push(frame([T, stops[stops.length - 1][1]]));
  return play(el, frames, T);
}

/** On/off opacity, snapping: on during each [from, to] in ranges. */
function gate(el, T, ranges, on = 1, off = 0) {
  const frames = [{ offset: 0, opacity: off, easing: STEP }];
  ranges.forEach(([a, b]) => {
    frames.push({ offset: a / T, opacity: on, easing: STEP }, { offset: b / T, opacity: off, easing: STEP });
  });
  frames.push({ offset: 1, opacity: off });
  return play(el, frames, T);
}

const B = (x = 0, y = 0, r = 0, sx = 1, sy = 1) =>
  `translate(${f2(x)}px,${f2(y)}px) rotate(${f2(r)}deg) scale(${f2(sx)},${f2(sy)})`;
const REST = B();

/** The whole body. Pivot between the feet, so he squashes onto the ground. */
const body = (root, T, stops) => track(q(root, '.q-all'), T, stops);

/** Head: [ms, x, y, rot, scale, easing]. */
const head = (root, T, stops) => track(q(root, '.q-face'), T, stops.map(([ms, x, y, r, s = 1, e]) => [ms, B(x, y, r, s, s), e]));

const wing = (root, side, T, stops) => track(q(root, `.q-wing-${side}`), T, stops);
const R = (deg) => `rotate(${f2(deg)}deg)`;

/** A front flipper replaces the real one for the [from, to] window. */
function frontFlipper(root, side, T, from, to, stops) {
  gate(q(root, `.q-wing-${side}`), T, [[from, to]], 0, 1);
  gate(q(root, `.q-flip-${side}`), T, [[from, to]]);
  return track(q(root, `.q-flip-${side}`), T, stops);
}

const tail = (root, T, stops) => track(q(root, '.q-scarf-tail'), T, stops.map(([ms, deg, sc = 1, e]) => [ms, `rotate(${deg}deg) scale(${sc})`, e]));

/** Brows: [ms, lift, tilt of the left one, tilt of the right one (default mirrored), easing]. */
function brows(root, T, stops) {
  track(q(root, '.q-brow-l'), T, stops.map(([ms, dy, l, , e]) => [ms, `translate(0px,${dy}px) rotate(${l}deg)`, e]));
  track(q(root, '.q-brow-r'), T, stops.map(([ms, dy, l, r, e]) => [ms, `translate(0px,${dy}px) rotate(${r ?? -l}deg)`, e]));
}

/** Pupils: [ms, x, y, easing]. */
const pupils = (root, T, stops) => qa(root, '.q-pupil').forEach((p) => track(p, T, stops.map(([ms, x, y, e]) => [ms, `translate(${x}px,${y}px)`, e])));

/** Eyes: [ms, scaleX, scaleY, easing] (overrides the idle blink meanwhile). */
const eyes = (root, T, stops) => qa(root, '.q-eye').forEach((p) => track(p, T, stops.map(([ms, x, y, e]) => [ms, `scale(${x},${y})`, e])));

/** Open beak during each range. */
function mouth(root, T, ranges) {
  gate(q(root, '.q-beak-open'), T, ranges);
  gate(q(root, '.q-beak-closed'), T, ranges, 0, 1);
}

/** Happy ^ ^ eyes during each range. */
function joy(root, T, ranges) {
  gate(q(root, '.q-joy'), T, ranges);
  qa(root, '.q-eye').forEach((e) => gate(e, T, ranges, 0, 1));
}

/** His ground shadow: [ms, size, easing]; it shrinks while he is in the air. */
const shadow = (root, T, stops) => track(q(root, '.q-shadow'), T, stops.map(([ms, s, e]) => [ms, `scale(${s},${Math.min(1.2, s)})`, e]));

/** One star, popping out of (x, y), drifting by (dx, dy). */
function spark(el, T, at, dur, x, y, dx, dy, size, spin = 90) {
  const t = (p) => `translate(${x + dx * p}px,${y + dy * p}px)`;
  return track(el, T, [
    [0, { opacity: 0, transform: `${t(0)} rotate(0deg) scale(.1)` }],
    [at, { opacity: 0, transform: `${t(0)} rotate(0deg) scale(.1)` }, OUT],
    [at + dur * 0.3, { opacity: 1, transform: `${t(0.55)} rotate(${spin * 0.5}deg) scale(${size})` }],
    [at + dur * 0.6, { opacity: 1, transform: `${t(0.85)} rotate(${spin * 0.75}deg) scale(${size * 0.8})` }, IN],
    [at + dur, { opacity: 0, transform: `${t(1)} rotate(${spin}deg) scale(.1)` }],
  ]);
}

/** One crisp star on an impact: full size inside two frames, a small kick, gone fast. */
function pop(el, T, at, x, y, size, spin = 45, dx = 0, dy = 0) {
  const t = (p) => `translate(${f2(x + dx * p)}px,${f2(y + dy * p)}px)`;
  return track(el, T, [
    [0, { opacity: 0, transform: `${t(0)} rotate(0deg) scale(.2)` }],
    [at - 1, { opacity: 0, transform: `${t(0)} rotate(0deg) scale(.2)`, }, STEP],
    [at, { opacity: 1, transform: `${t(0)} rotate(0deg) scale(${f2(size * 0.6)})` }, OUT],
    [at + 50, { opacity: 1, transform: `${t(0.45)} rotate(${spin * 0.5}deg) scale(${f2(size * 1.2)})` }, OUT],
    [at + 120, { opacity: 1, transform: `${t(0.8)} rotate(${spin * 0.8}deg) scale(${f2(size)})` }, IN],
    [at + 260, { opacity: 0, transform: `${t(1)} rotate(${spin}deg) scale(${f2(size * 0.3)})` }],
  ]);
}

/** Dust where his feet hit the ground, around x (default both feet). */
function puffs(root, T, at, big = 1) {
  qa(root, '.q-puff').forEach((c, i) => {
    const side = i % 2 ? 1 : -1;
    const x = 120 + side * (54 + (i >> 1) * 12);
    const out = side * (30 + (i >> 1) * 22) * big;
    track(c, T, [
      [0, { opacity: 0, transform: `translate(${x}px,284px) scale(.2)` }],
      [at, { opacity: 0, transform: `translate(${x}px,284px) scale(.2)` }, OUT],
      [at + 90, { opacity: 0.7, transform: `translate(${x + out * 0.6}px,${280 - i}px) scale(${0.9 * big})` }],
      [at + 340, { opacity: 0, transform: `translate(${x + out}px,${270 - i * 2}px) scale(${1.25 * big})` }],
    ]);
  });
}

const sparks = (root) => qa(root, '.q-spark');

/** Applies a pose with no movement, for `ms`: a still. pose: [[el, value]]. */
function still(pose, ms = 1000) {
  return Promise.all(pose.map(([el, v]) => {
    if (!el) return null;
    const fr = typeof v === 'string' ? { transform: v } : v;
    return play(el, [fr, fr], ms);
  }));
}

// ---- the acts -------------------------------------------------------------

/** A small yes: chin up, a firm dip with the eyes smiling shut and a sparkle off the beak, a lighter second dip, a settle. */
function nod(root) {
  const T = 1000;
  head(root, T, [
    [0, 0, 0, 0], [40, 0, 1, 0.5, 1, IO], [150, 0, -8, -2, 1, OUT], [190, 0, -8, -2, 1, IN], [290, 0, 15, 1.5, 1, OUT], [410, 0, -4, -0.5, 1, IO],
    [560, 0, 8, 1, 1, OUT], [690, 0, -2, 0, 1, IO], [810, 0, 1, 0, 1, IO], [T, 0, 0, 0],
  ]);
  track(q(root, '.q-scarf'), T, [
    [0, B()], [170, B(0, -2)], [310, B(0, 7)], [440, B(0, -1.5)], [585, B(0, 3.5)], [720, B(0, -0.5)], [860, B()],
  ]);
  track(q(root, '.q-tuft'), T, [
    [0, 'scale(1,1)'], [150, 'scale(.96,.9)'], [300, 'scale(1.04,1.22)', OUT], [420, 'scale(.98,.94)'], [575, 'scale(1.02,1.12)'], [710, 'scale(1,.98)'], [840, 'scale(1,1)'],
  ]);
  brows(root, T, [
    [0, 0, 0], [150, -7, -7, undefined, OUT], [290, 2, 2, undefined, OUT], [420, -2, -2], [560, 1, 0], [760, 0, 0],
  ]);
  joy(root, T, [[240, 710]]);
  tail(root, T, [[0, 0], [160, -6], [340, 16, 1.06], [490, -8], [640, 8], [790, -3], [900, 1], [T, 0]]);
  wing(root, 'l', T, [[0, R(0)], [170, R(6)], [320, R(-6), OUT], [470, R(5)], [620, R(-2.5)], [780, R(1)], [T, R(0)]]);
  wing(root, 'r', T, [[0, R(0)], [170, R(-6)], [320, R(6), OUT], [470, R(-5)], [620, R(2.5)], [780, R(-1)], [T, R(0)]]);
  shadow(root, T, [[0, 1], [150, 0.97], [290, 1.07], [410, 0.98], [560, 1.03], [T, 1]]);
  const [a, b, c] = sparks(root);
  pop(a, T, 300, 150, 152, 1.15, 90, 34, -6);
  pop(b, T, 330, 148, 160, 0.55, -80, 30, 16);
  pop(c, T, 350, 152, 142, 0.5, 70, 26, -28);
  return body(root, T, [
    [0, REST], [40, B(0, 0, 0, 1.01, 0.99), IO], [150, B(0, -3, 0, 0.97, 1.04), OUT], [190, B(0, -3, 0, 0.97, 1.04), IN], [290, B(0, 0, 0, 1.07, 0.91), OUT], [410, B(0, -2, 0, 0.98, 1.025), IO],
    [560, B(0, 0, 0, 1.035, 0.955), OUT], [690, B(0, -0.5, 0, 0.993, 1.01), IO], [810, B(0, 0, 0, 1.006, 0.994), IO], [T, REST],
  ]);
}

/** Flippers cock wide, two clean claps at his chest, the second harder, flung open into a hop; a star pops at each contact. */
function clap(root) {
  const T = 1460;
  const C1 = 300;          // first contact
  const C2 = 600;          // second contact
  const SHUT = 82;         // tips meet, not overlap, over the scarf
  // One transform shape throughout, so the browser interpolates the angle and
  // an opening flipper swings down and out, never up across his face.
  const A = (a) => B(0, 0, a);
  const met = (dir) => B(0, 3, -dir * SHUT, 0.9, 0.93);      // the impact frame
  const give = (dir) => B(0, 3, -dir * (SHUT - 5), 0.92, 0.9);  // a hair apart again
  const flip = (dir) => [
    [0, A(0)], [70, A(-dir * 6), IO], [200, A(dir * 62), OUT], [C1 - 50, A(dir * 56), IN], [C1, met(dir)], [C1 + 45, give(dir), OUT],
    [C1 + 150, A(dir * 34), OUT], [C2 - 60, A(dir * 44), IN], [C2, met(dir)], [C2 + 50, give(dir), OUT],
    [C2 + 170, A(dir * 118), OUT], [C2 + 260, A(dir * 104), IO], [C2 + 400, A(dir * 112), IO], [1180, A(dir * 8), OUT], [1290, A(-dir * 3), IO], [1380, A(dir), IO], [T, A(0)],
  ];
  frontFlipper(root, 'l', T, 0, T - 20, flip(1));
  frontFlipper(root, 'r', T, 0, T - 20, flip(-1));
  head(root, T, [
    [0, 0, 0, 0], [200, 0, -5, -2, 1, OUT], [C1, 0, 6, 0, 1, OUT], [C1 + 150, 0, -3, 1.5, 1, OUT], [C2, 0, 8, 0, 1, OUT],
    [C2 + 170, 0, -7, -1.5, 1, OUT], [C2 + 300, 0, 4, 0, 1, IO], [1120, 0, -1, 0, 1, IO], [T, 0, 0, 0],
  ]);
  brows(root, T, [[0, 0, 0], [200, -7, -10, undefined, OUT], [C1, -2, -2], [C2, -3, -4], [1040, -3, -4], [1280, 0, 0]]);
  mouth(root, T, [[C1 - 10, 1060]]);
  joy(root, T, [[C1 - 10, 1080]]);
  tail(root, T, [[0, 0], [210, -14, 1.06], [C1 + 30, 18], [C1 + 170, -12], [C2 + 30, 24, 1.1], [C2 + 190, -26, 1.14], [C2 + 330, 18], [1130, -8], [1270, 4], [T, 0]]);
  qa(root, '.q-leg').forEach((leg, i) => {
    const d = i ? 1 : -1;
    track(leg, T, [[0, B()], [C2 + 40, B()], [C2 + 150, B(d * 3, -9, d * 7), OUT], [C2 + 250, B(d * 2, -6, d * 5), IN], [C2 + 300, B()]]);
  });
  shadow(root, T, [[0, 1], [C1, 1.08], [C1 + 150, 0.97], [C2, 1.1], [C2 + 170, 0.68], [C2 + 300, 1.12], [1100, 1], [T, 1]]);
  puffs(root, T, C2 + 300, 0.6);
  const s = sparks(root);
  pop(s[1], T, C1, 120, 196, 1.1, 60, 0, -26);
  pop(s[0], T, C1 + 15, 120, 196, 0.5, -70, -58, -30);
  pop(s[2], T, C1 + 15, 120, 196, 0.5, 70, 58, -30);
  pop(s[5], T, C2, 120, 196, 1.7, 80, 0, -44);
  pop(s[4], T, C2 + 15, 120, 196, 0.85, -90, -92, -54);
  pop(s[3], T, C2 + 15, 120, 196, 0.85, 90, 92, -54);
  return body(root, T, [
    [0, REST], [70, B(0, 1, 0, 1.03, 0.97), IO], [200, B(0, -6, -1, 0.95, 1.06), OUT], [C1 - 50, B(0, -7, 0, 0.94, 1.07), IN], [C1, B(0, 0, 0, 1.08, 0.91), OUT],
    [C1 + 150, B(0, -7, 1, 0.97, 1.04), OUT], [C2 - 60, B(0, -8, 1, 0.96, 1.05), IN], [C2, B(0, 0, 0, 1.12, 0.87), OUT],
    [C2 + 170, B(0, -34, -1.5, 0.94, 1.08), IN], [C2 + 300, B(0, 0, 0, 1.09, 0.91), OUT], [C2 + 430, B(0, -3, 0, 0.985, 1.02), IO], [1160, B(0, 0, 0, 1.012, 0.988), IO], [T, REST],
  ]);
}

// Flipper pivots and their resting direction, in viewBox units and degrees.
const SHOULDER = { l: [60.4, 155.8], r: [179.6, 155.8] };
const REST_ANG = { l: 115.9, r: 64.1 };

/** Where to aim: from a viewport target, or up and out by default. */
function aimOf(svg, target) {
  const dflt = { side: 'r', angle: -32, dx: 1 };
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return dflt;
  let p = null;
  try {
    const m = svg.getScreenCTM?.();
    if (m) {
      const inv = m.inverse();
      p = [inv.a * target.x + inv.c * target.y + inv.e, inv.b * target.x + inv.d * target.y + inv.f];
    }
  } catch { /* fall through to the box */ }
  if (!p) {
    const r = svg.getBoundingClientRect();
    if (!r.width) return dflt;
    p = [(target.x - r.left) * (240 / r.width), (target.y - r.top) * (300 / r.height)];
  }
  const side = p[0] >= 120 ? 'r' : 'l';
  const [sx, sy] = SHOULDER[side];
  const angle = Math.atan2(p[1] - sy, p[0] - sx) * 180 / Math.PI;
  return { side, angle, dx: p[0] - sx, dy: p[1] - sy };
}

/** Flipper rotation for a screen angle, kept to what a shoulder can do. */
function flipperRotation(side, angle) {
  if (side === 'r') {
    let a = angle; if (a > 180) a -= 360;
    return clamp(a - REST_ANG.r, -158, -34);
  }
  let a = angle < 0 ? angle + 360 : angle;
  return clamp(a - REST_ANG.l, 34, 158);
}

/** He winds up, then snaps round and points with his whole body: "there!" */
function point(root, svg, target) {
  const T = 1760;
  const { side, angle } = aimOf(svg, target);
  const s = side === 'r' ? 1 : -1;
  const rot = flipperRotation(side, angle);
  const other = side === 'r' ? 'l' : 'r';
  const look = [s * 5, clamp(Math.sin((angle * Math.PI) / 180) * 5, -5, 3)];
  wing(root, side, T, [
    [0, R(0)], [190, R(s * 24), OUT], [270, R(s * 30), IN], [370, `rotate(${f2(rot * 1.1)}deg) scale(.92,1.22)`, OUT], [470, `rotate(${f2(rot * 0.95)}deg) scale(1,1.1)`, IO], [570, `rotate(${f2(rot)}deg) scale(1,1.14)`],
    [700, `rotate(${f2(rot - s * 5)}deg) scale(1,1.2)`, OUT], [790, `rotate(${f2(rot)}deg) scale(1,1.12)`, IO], [880, `rotate(${f2(rot - s * 4)}deg) scale(1,1.18)`, OUT], [970, `rotate(${f2(rot)}deg) scale(1,1.12)`, IO], [1240, `rotate(${f2(rot)}deg) scale(1,1.12)`, IN],
    [1560, R(s * 7), OUT], [1680, R(-s * 2)], [1760, R(0)],
  ]);
  wing(root, other, T, [
    [0, R(0)], [190, R(s * 8), OUT], [370, R(-s * 16), OUT], [520, R(-s * 11)], [1240, R(-s * 12), IO], [1540, R(s * 3)], [1760, R(0)],
  ]);
  head(root, T, [
    [0, 0, 0, 0], [190, -s * 3, 2, -s * 2, 1, OUT], [370, s * 9, -3, s * 3, 1, OUT], [500, s * 7, -2, s * 2, 1, IO], [1240, s * 7, -2, s * 2, 1, IO], [1560, 0, 0, 0],
  ]);
  pupils(root, T, [[0, 0, 0], [200, -s * 2, 1], [300, s * 6, look[1]], [1240, ...look, IO], [1500, 0, 0]]);
  brows(root, T, [[0, 0, 0], [190, 2, 6, undefined, OUT], [340, -8, -14, undefined, BACK], [760, -4, -7], [1240, -4, -7], [1500, 0, 0]]);
  mouth(root, T, [[330, 780]]);
  tail(root, T, [[0, 0], [200, s * 8], [370, -s * 26, 1.14], [520, s * 14], [680, -s * 8], [860, s * 4], [1240, 0], [1420, -s * 8], [1600, s * 3], [1760, 0]]);
  qa(root, '.q-leg').forEach((leg, i) => {
    const front = (s > 0) === (i === 1);
    track(leg, T, [[0, B()], [180, B()], [300, B(s * 3, front ? -9 : 0), OUT], [400, B(s * (front ? 7 : 2), 0), IO], [1260, B(s * (front ? 7 : 2), 0), IO], [1500, B()]]);
  });
  shadow(root, T, [[0, 1], [200, 1.05], [370, 0.95], [520, 1.02], [1760, 1]]);
  const tipA = ((REST_ANG[side] + rot) * Math.PI) / 180;
  const TIP = 84;
  const [sx, sy] = SHOULDER[side];
  const [a, b] = sparks(root);
  spark(a, T, 360, 440, sx + s * 8 + Math.cos(tipA) * TIP, sy + Math.sin(tipA) * TIP, Math.cos(tipA) * 22, Math.sin(tipA) * 22, 0.9, 110);
  spark(b, T, 430, 360, sx + s * 8 + Math.cos(tipA + 0.4) * TIP, sy + Math.sin(tipA + 0.4) * TIP, Math.cos(tipA + 0.5) * 16, Math.sin(tipA + 0.5) * 16, 0.5, -90);
  return body(root, T, [
    [0, REST], [190, B(-s * 7, 0, -s * 4, 1.07, 0.93), OUT], [270, B(-s * 8, 0, -s * 4.5, 1.08, 0.92), IN], [370, B(s * 10, -5, s * 8, 0.95, 1.05), OUT],
    [480, B(s * 7, -1, s * 5, 1.015, 0.985), IO], [600, B(s * 8, -2, s * 6), IO], [700, B(s * 10, -2, s * 7.5), OUT], [790, B(s * 8, -1, s * 6), IO],
    [880, B(s * 9.5, -2, s * 7), OUT], [970, B(s * 8, -1, s * 6), IO], [1240, B(s * 8, -1, s * 6), IN], [1500, B(-s * 2, 0, -s * 1.5, 1.015, 0.985), OUT], [1760, REST],
  ]);
}

/** One spin on the spot: crouch, leap, a real turn (his back passes the camera), a squash on landing. */
function twirl(root) {
  const T = 1660;
  const A = 240;           // spin starts
  const D = 640;           // spin length
  const N = 16;
  const theta = (u) => 360 * (u - (Math.sin(2 * Math.PI * u) / (2 * Math.PI)) * 0.55);
  const H = 78;
  const spin = [];
  const front = [];
  const belly = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const th = (theta(u) * Math.PI) / 180;
    const c = Math.cos(th);
    const ms = A + D * u;
    const sx = Math.abs(c) < 0.1 ? 0.1 * Math.sign(c || 1) : c;
    spin.push([ms, B(0, -H * Math.sin(Math.PI * u), 0, sx * lerp(1.02, 0.96, Math.sin(Math.PI * u)), lerp(1.13, 1.0, Math.sin(Math.PI * u) ** 0.5))]);
    front.push([ms, B(30 * Math.sin(th), 0, 0)]);
    belly.push([ms, B(22 * Math.sin(th), 0, 0)]);
  }
  const hideAt = A + D * 0.27;
  const showAt = A + D * 0.73;
  gate(q(root, '.q-back'), T, [[hideAt, showAt]]);
  gate(q(root, '.q-front'), T, [[hideAt, showAt]], 0, 1);
  gate(q(root, '.q-tummy'), T, [[hideAt, showAt]], 0, 1);
  track(q(root, '.q-front'), T, [[0, REST], ...front, [T, REST]]);
  track(q(root, '.q-tummy'), T, [[0, REST], ...belly, [T, REST]]);
  const fling = (d) => [
    [0, R(0)], [130, R(-d * 16), OUT], [230, R(-d * 20), IN], [330, R(d * 86), OUT], [A + D, R(d * 92), OUT],
    [980, R(d * 62), OUT], [1120, R(d * 12), IO], [1260, R(-d * 5), OUT], [1400, R(d * 2)], [1660, R(0)],
  ];
  wing(root, 'l', T, fling(1));
  wing(root, 'r', T, fling(-1));
  tail(root, T, [
    [0, 0], [130, 10], [230, 14, 1, IN], [340, -46, 1.45], [560, -62, 1.6], [A + D, -40, 1.45, OUT],
    [980, 26, 1.1], [1110, -18, 1.05], [1250, 10], [1400, -4], [1660, 0],
  ]);
  brows(root, T, [[0, 0, 0], [130, 3, 8, undefined, OUT], [240, -6, -8, undefined, BACK], [900, -6, -8], [1020, -2, -2], [1300, -2, -2], [1500, 0, 0]]);
  mouth(root, T, [[240, 860]]);
  joy(root, T, [[900, 1340]]);
  qa(root, '.q-leg').forEach((leg, i) => {
    const d = i ? 1 : -1;
    track(leg, T, [[0, B()], [230, B()], [340, B(d * 3, -12, d * 8), OUT], [A + D - 60, B(d * 2, -8, d * 5)], [A + D, B(), IN]]);
  });
  shadow(root, T, [[0, 1], [130, 1.12], [240, 1.1], [A + D / 2, 0.5], [A + D, 1.14, OUT], [1060, 1], [1660, 1]]);
  puffs(root, T, A + D);
  return body(root, T, [
    [0, REST], [130, B(0, 0, -3, 1.13, 0.84), OUT], [A - 10, B(0, 0, -4, 1.16, 0.8), IN],
    ...spin,
    [A + D + 30, B(0, 0, 0, 1.2, 0.76), OUT], [1020, B(0, -9, 0, 0.94, 1.07), IO], [1150, B(0, 0, 0, 1.05, 0.95), IO], [1300, B(0, -2, 0, 0.985, 1.015), IO], [1660, REST],
  ]);
}

/** The eyes-over-the-wall bit: he looks left, blinks, looks right, spots you. */
function peekLook(root, T, t0) {
  pupils(root, T, [
    [0, 0, 0], [t0, 0, 0], [t0 + 120, -6, -1, OUT], [t0 + 430, -6, -1], [t0 + 560, 6, 0, IO], [t0 + 860, 6, 0], [t0 + 960, 0, 2, OUT], [T, 0, 0],
  ]);
  eyes(root, T, [
    [0, 1, 1], [t0 + 460, 1, 1], [t0 + 505, 1, 0.08], [t0 + 560, 1, 1], [t0 + 900, 1, 1], [t0 + 980, 1.1, 1.14, BACK], [T, 1.1, 1.14],
  ]);
  brows(root, T, [[0, 0, 0], [t0 + 120, -3, -5], [t0 + 500, -1, -2], [t0 + 620, -3, 3, -10], [t0 + 900, -3, 3, -10], [t0 + 985, -8, -13, undefined, BACK], [T, -8, -13]]);
}

/** Ducks out of sight below his own ledge, the head slides up, looks both ways, sees you, gone, pops back. */
function peek(root, svg, opts) {
  if (opts?.inPlace) {
    const T = 1600;
    peekLook(root, T, 60);
    head(root, T, [[0, 0, 0, 0], [180, -3, 0, -4, 1, OUT], [560, -3, 0, -4, 1, IO], [760, 3, 0, 4, 1, IO], [1000, 3, 0, 4, 1, OUT], [1120, 0, -4, 0, 1, BACK], [T, 0, -4, 0]]);
    return tail(root, T, [[0, 0], [300, 8], [700, -8], [1100, 4], [T, 0]]);
  }
  const T = 2560;
  const box = q(root, '.q-stagebox');
  const clip = root.querySelector('clipPath');
  if (box && clip) box.setAttribute('clip-path', `url(#${clip.id})`);
  shadow(root, T, [[0, 1], [170, 1.08], [460, 0], [2200, 0], [2340, 1.1, OUT], [2560, 1]]);
  const T0 = 1000;
  peekLook(root, T, T0);
  head(root, T, [
    [0, 0, 0, 0], [T0, 0, 0, 0], [T0 + 140, -3, 0, -6, 1, OUT], [T0 + 440, -3, 0, -6, 1, IO], [T0 + 620, 4, 0, 5, 1, IO],
    [T0 + 880, 4, 0, 5, 1, OUT], [T0 + 980, 0, -6, 0, 1, BACK], [T, 0, 0, 0],
  ]);
  tail(root, T, [[0, 0], [170, -8], [460, 24], [2200, 24], [2350, -18, 1.1], [2450, 8], [2560, 0]]);
  wing(root, 'l', T, [[0, R(0)], [170, R(10)], [440, R(-6)], [2190, R(0)], [2340, R(26), OUT], [2560, R(0)]]);
  wing(root, 'r', T, [[0, R(0)], [170, R(-10)], [440, R(6)], [2190, R(0)], [2340, R(-26), OUT], [2560, R(0)]]);
  return Promise.all([
    body(root, T, [
      [0, REST], [170, B(0, -9, 0, 0.95, 1.06), OUT], [450, B(0, 262, 0, 1.02, 0.98), IN], [760, B(0, 262, 0), OUT], [T0, B(10, 142, 4), OUT],
      [T0 + 960, B(10, 142, 4), IO], [T0 + 1000, B(10, 134, 4, 0.98, 1.03), IN], [T0 + 1110, B(10, 262, 0), OUT], [T0 + 1180, B(0, 262, 0), OUT],
      [T0 + 1340, B(0, -12, 0, 0.95, 1.07), IO], [T0 + 1440, B(0, 0, 0, 1.05, 0.95), OUT], [T0 + 1560, REST],
    ]),
  ]).then(() => { box?.removeAttribute('clip-path'); });
}

/** Flipper to his chin, eyes up, three thought dots, a small "ah" at the end. */
function think(root) {
  const T = 2500;
  frontFlipper(root, 'r', T, 120, 2400, [
    [0, R(0)], [190, R(-16), OUT], [470, `rotate(100deg) scale(.8)`, OUT], [560, `rotate(93deg) scale(.8)`, IO], [660, `rotate(96deg) scale(.8)`],
    [960, `rotate(96deg) scale(.8)`, IO], [1040, `rotate(88deg) scale(.8)`, IO], [1120, `rotate(96deg) scale(.8)`, IO], [1200, `rotate(88deg) scale(.8)`, IO], [1280, `rotate(96deg) scale(.8)`, IO],
    [1880, `rotate(96deg) scale(.8)`, IN], [2180, R(-10), OUT], [2300, R(4)], [2400, R(0)],
  ]);
  wing(root, 'l', T, [[0, R(0)], [420, R(-8), IO], [1880, R(-8), IO], [2200, R(5), OUT], [2500, R(0)]]);
  head(root, T, [
    [0, 0, 0, 0], [190, 0, 3, 1, 1, OUT], [560, 3, -3, -5, 1, IO], [1040, 3, -2, -4, 1, IO], [1120, 3, -3, -5, 1, IO], [1200, 3, -2, -4, 1, IO],
    [1280, 3, -3, -5, 1, IO], [1820, 3, -3, -5, 1, BACK], [1960, 0, -6, 2, 1, IO], [2200, 0, 2, 0, 1, IO], [2500, 0, 0, 0],
  ]);
  pupils(root, T, [[0, 0, 0], [240, 0, 0], [460, 5, -5, IO], [1300, 5, -5, IO], [1420, 2, -6, IO], [1640, 6, -4, IO], [1800, 6, -4], [1900, 0, 0, OUT]]);
  eyes(root, T, [[0, 1, 1], [500, 1, 1], [545, 1, 0.08], [600, 1, 1], [1560, 1, 1], [1600, 1, 0.08], [1650, 1, 1], [1820, 1, 1], [1920, 1.08, 1.12, BACK], [2200, 1, 1]]);
  brows(root, T, [[0, 0, 0], [240, 0, 0], [500, -2, 6, -14, OUT], [1800, -2, 6, -14], [1920, -8, -12, undefined, BACK], [2300, 0, 0]]);
  tail(root, T, [[0, 0], [600, -6], [1100, 3], [1500, -5], [1950, 12, 1.06], [2150, -5], [2500, 0]]);
  shadow(root, T, [[0, 1], [190, 1.04], [560, 1], [1950, 0.92], [2200, 1.03], [2500, 1]]);
  const dots = qa(root, '.q-dot');
  const P = [[190, 40, 0.62], [212, 12, 0.86], [244, -22, 1.18]];
  spark(sparks(root)[0], T, 1860, 460, 120, 0, 0, -30, 1.1, 120);
  dots.forEach((d, i) => {
    const [x, y, s] = P[i];
    const at = 620 + i * 300;
    const t = (dy, k) => `translate(${x}px,${y + dy}px) scale(${k})`;
    track(d, T, [
      [0, { opacity: 0, transform: t(10, 0.1) }], [at, { opacity: 0, transform: t(10, 0.1) }, BACK], [at + 210, { opacity: 1, transform: t(0, s) }, IO],
      [(at + 210 + 1760) / 2, { opacity: 1, transform: t(-5, s) }, IO], [1760, { opacity: 1, transform: t(1, s) }, IN], [1960 + i * 40, { opacity: 0, transform: t(-14, s * 1.35) }],
    ]);
  });
  return body(root, T, [
    [0, REST], [190, B(0, 0, 1, 1.03, 0.97), OUT], [560, B(-2, 0, -2.5, 0.99, 1.012), IO], [1300, B(-2, 0, -3, 0.995, 1.008), IO], [1820, B(-2, 0, -2.5, 0.99, 1.012), BACK],
    [1960, B(0, -10, 1, 0.96, 1.05), IO], [2200, B(0, 0, 0, 1.03, 0.97), IO], [2500, REST],
  ]);
}

/** Startled: a held beat, a leap back with eyes wide, a landing on his heels that nearly tips him, flippers windmilling, then a relieved sag. */
function wow(root) {
  const T = 1900;
  const L = 500;           // lands
  const done = body(root, T, [
    [0, REST], [90, REST], [140, B(0, 0, 0, 1.06, 0.93), IN], [260, B(0, -76, -6, 0.84, 0.93), OUT], [370, B(0, -86, -7, 0.82, 0.94), IN],
    [L, B(0, 0, -7, 1.17, 0.8), OUT], [620, B(0, -5, -9, 0.96, 1.05), IO], [760, B(0, 0, 3.5, 1.02, 0.98), IO], [900, B(0, 0, -2, 1, 1), IO], [1030, B(0, 0, 1, 1, 1), IO],
    [1200, B(0, 0, 0, 1, 1), IO], [1400, B(0, 1, 0, 1.05, 0.945), IO], [1640, B(0, -1, 0, 0.99, 1.012), IO], [T, REST],
  ]);
  head(root, T, [
    [0, 0, 0, 0], [140, 0, 5, 0, 1], [260, 0, -10, -3, 1.05, OUT], [L, 0, 9, -2, 1, OUT], [620, 0, -5, -5, 1, IO], [760, 0, 2, 3, 1, IO], [900, 0, 0, -1, 1, IO],
    [1200, 0, 0, 0, 1, IO], [1400, 0, 6, 0, 1, IO], [1640, 0, -1, 0, 1, IO], [T, 0, 0, 0],
  ]);
  eyes(root, T, [[0, 1, 1], [100, 1, 1], [190, 1.28, 1.34, BACK], [1150, 1.2, 1.26], [1215, 1, 0.08], [1275, 1, 1], [T, 1, 1]]);
  qa(root, '.q-pupil').forEach((p) => {
    p.style.transformBox = 'fill-box'; p.style.transformOrigin = 'center';
    track(p, T, [[0, B()], [100, B()], [190, B(0, 1, 0, 0.6, 0.6), BACK], [1150, B(0, 0, 0, 0.72, 0.72)], [1275, B()]]);
  });
  brows(root, T, [[0, 0, 0], [100, 0, 0], [200, -12, -18, undefined, BACK], [1120, -8, -14], [1380, 2, 3], [1640, 0, 0]]);
  mouth(root, T, [[110, 1180]]);
  track(q(root, '.q-tuft'), T, [[0, 'scale(1,1)'], [100, 'scale(1,1)'], [200, 'scale(1.12,1.55)', BACK], [L, 'scale(1,.86)'], [640, 'scale(1,1.24)'], [800, 'scale(1,.96)'], [1000, 'scale(1,1)']]);
  const arm = (d, phase) => [
    [0, R(0)], [100, R(0)], [230, R(d * 118), OUT], [370, R(d * 100)], [L, R(d * 128), IO],
    [L + 120 + phase, R(d * 84), IO], [L + 240 + phase, R(d * 124), IO], [L + 360 + phase, R(d * 92), IO], [L + 480 + phase, R(d * 112), IO], [L + 640, R(d * 96), IO],
    [1400, R(-d * 6), OUT], [1560, R(d * 3)], [1720, R(-d)], [T, R(0)],
  ];
  wing(root, 'l', T, arm(1, 0));
  wing(root, 'r', T, arm(-1, 60));   // the two windmill out of step
  tail(root, T, [[0, 0], [110, 8], [260, -68, 1.5], [L, -26, 1.2], [640, 34, 1.12], [800, -18], [950, 10], [1120, -4], [1420, 10], [1620, -3], [T, 0]]);
  // Down on his heels: the toes tip up as he rocks back.
  qa(root, '.q-leg').forEach((leg, i) => {
    const d = i ? 1 : -1;
    track(leg, T, [[0, B()], [140, B()], [260, B(d * 6, -9, d * 13), OUT], [420, B(d * 3, -7, d * 8)], [L, B(), IN],
      [620, B(0, -4, -10)], [760, B()], [900, B(0, -1, -3)], [1030, B()]]);
  });
  shadow(root, T, [[0, 1], [140, 1.05], [320, 0.46], [L, 1.16, OUT], [660, 1], [1400, 1.06], [T, 1]]);
  puffs(root, T, L, 0.8);
  const ring = [[-96, -58], [-44, -112], [14, -128], [70, -104], [108, -48]];
  sparks(root).slice(0, 5).forEach((el, i) => {
    const [dx, dy] = ring[i];
    spark(el, T, 170 + (i % 3) * 36, 720, 120 + dx * 0.8, 96 + dy * 0.8, dx * 0.42, dy * 0.42, i % 2 ? 0.62 : 0.86, i % 2 ? 120 : -120);
  });
  return done;
}

/** Friendly "hmm, not this time": shoulders up, flippers out, head on one side, one brow up. Then an easy drop. */
function shrug(root) {
  const T = 1640;
  const up = (d) => [
    [0, R(0)], [150, R(-d * 7), OUT], [330, `translate(0px,-10px) rotate(${d * 102}deg)`, OUT], [420, `translate(0px,-7px) rotate(${d * 86}deg)`, IO], [520, `translate(0px,-8px) rotate(${d * 92}deg)`, IO],
    [940, `translate(0px,-8px) rotate(${d * 92}deg)`, IN], [1170, R(-d * 8), OUT], [1290, R(d * 4), IO], [1420, R(-d * 1.5)], [T, R(0)],
  ];
  wing(root, 'l', T, up(1));
  wing(root, 'r', T, up(-1));
  head(root, T, [
    [0, 0, 0, 0], [150, 0, 3, 0, 1, OUT], [340, -3, 5, -8, 1, OUT], [460, -3, 6, -6.5, 1, IO], [640, -3, 6, -7, 1, IO], [800, -2, 6, -5.5, 1, IO], [960, -3, 6, -7, 1, IN],
    [1170, 0, 1, 1.5, 1, OUT], [1320, 0, -1, -0.5, 1, IO], [T, 0, 0, 0],
  ]);
  track(q(root, '.q-scarf'), T, [[0, B()], [340, B(0, -5, 0, 1.03, 1)], [960, B(0, -5, 0, 1.03, 1), IN], [1170, B(0, 2), OUT], [1320, B()]]);
  pupils(root, T, [[0, 0, 0], [180, 0, 0], [340, -5, -5, OUT], [760, -5, -5, IO], [880, 3, 1, IO], [1040, 3, 1], [1200, 0, 0]]);
  eyes(root, T, [[0, 1, 1], [640, 1, 1], [690, 1, 0.08], [740, 1, 1]]);
  brows(root, T, [[0, 0, 0], [170, 1, 4], [340, -8, -13, 7, BACK], [940, -7, -11, 6], [1170, 0, 0, undefined, OUT]]);
  tail(root, T, [[0, 0], [150, -5], [340, 14], [520, -4], [700, 2], [1000, 0], [1190, 16, 1.03], [1330, -8], [1470, 3], [T, 0]]);
  shadow(root, T, [[0, 1], [150, 1.05], [340, 0.97], [1170, 1.05], [T, 1]]);
  return body(root, T, [
    [0, REST], [150, B(0, 0, 0, 1.04, 0.95), OUT], [340, B(1, -5, -2, 0.97, 1.035), OUT], [460, B(1, -2, -1.5, 0.985, 1.015), IO], [960, B(1, -3, -1.8, 0.985, 1.015), IN],
    [1170, B(0, 0, 0.8, 1.05, 0.945), OUT], [1330, B(0, 0, -0.3, 0.99, 1.012), IO], [T, REST],
  ]);
}

/**
 * A happy shuffle on a 220 ms beat: step out, tap the other foot in, step back,
 * tap, twice over; both feet jump together, a hop, flippers up. A planted foot
 * stays planted while his body rides over it, which is what makes it a dance:
 * feet are worked out in ground space, sampled, and taken back into body space.
 * The flipper opposite the weighted foot swings up; the scarf arrives late.
 */
function dance(root) {
  const b = 220;
  const t0 = 250;
  const beat = (k) => t0 + k * b;
  const end = beat(8);
  const hop = end + 200;   // top of the hop
  const land = end + 350;
  const T = end + 800;
  const LEAD = b * 0.7;    // a foot leaves the ground this long before it lands
  const weight = (k) => ((k >> 1) % 2 ? -1 : 1);   // the side his weight is on
  // [beat, x relative to its own rest place]; odd beats are taps, no weight.
  const moves = { l: [[1, 12, 1], [2, -22, 0], [5, 12, 1], [6, -22, 0], [8, 0, 0]], r: [[0, 22, 0], [3, -12, 1], [4, 22, 0], [7, -12, 1], [8, 0, 0]] };
  const footAt = (side, t) => {
    let x = 0;
    for (const [k, to, tap] of moves[side]) {
      const land1 = beat(k);
      const up = land1 - LEAD;
      if (t >= land1) { x = to; continue; }
      if (t <= up) break;
      const u = (t - up) / LEAD;
      return { x: lerp(x, to, easeIO(u)), y: -Math.sin(Math.PI * u) * (tap ? 13 : 26), toe: Math.sin(Math.PI * u) * (tap ? 16 : 26) };
    }
    return { x, y: 0, toe: 0 };
  };
  const sway = [[0, 0], [t0 - 130, -5, easeOut], [t0 - 40, -5, easeIO]];
  const leanS = [[0, 0], [t0 - 130, -3, easeOut], [t0 - 40, -3, easeIO]];
  const yS = [[0, 0], [t0 - 130, 3, easeOut], [t0 - 8, 0, easeIn]];
  const syS = [[0, 1], [t0 - 130, 0.93, easeOut], [t0 - 30, 1.03, easeIn]];
  for (let k = 0; k < 8; k++) {
    const s = weight(k);
    const t = beat(k);
    if (k % 2 === 0) {
      sway.push([t, s * 15, easeOut], [t + 50, s * 18, easeIO], [t + b * 1.3, s * 15, easeIO]);
      leanS.push([t, s * 7, easeOut], [t + 60, s * 8.5, easeIO], [t + b * 1.3, s * 6, easeIO]);
    }
    yS.push([t, 0, easeOut], [t + b * 0.5, k % 2 ? -11 : -17, easeIn]);
    syS.push([t + 12, k % 2 ? 0.93 : 0.89, easeOut], [t + b * 0.5, 1.05, easeIn]);
  }
  sway.push([end, 0, easeOut], [T, 0]);
  leanS.push([end, 0, easeOut], [T, 0]);
  yS.push([end, 0, easeOut], [hop, -50, easeIn], [land, 0, easeOut], [land + 130, -5, easeIO], [land + 260, 0, easeIO], [T, 0]);
  syS.push([end + 16, 0.84, easeOut], [end + 110, 1.1, easeOut], [hop, 1.05, easeIn], [land + 14, 0.84, easeOut], [land + 130, 1.04, easeIO], [land + 270, 0.985, easeIO], [land + 400, 1.005, easeIO], [T, 1]);
  const STEP_MS = 16;
  const bs = [];
  const ll = [];
  const lr = [];
  for (let t = 0; t <= T; t += STEP_MS) {
    const x = at(sway, t);
    const y = at(yS, t);
    const r = at(leanS, t);
    const sy = at(syS, t);
    const sx = 2 - sy;
    bs.push([t, B(x, y, r, sx, sy)]);
    const rad = (r * Math.PI) / 180;
    const leg = (side, dx, list) => {
      const f = footAt(side, t);
      const lx = (f.x + dx - x) / sx - dx;
      const ly = (f.y - y - dx * Math.sin(rad)) / sy;
      list.push([t, B(lx, ly, -r + (side === 'l' ? f.toe : -f.toe))]);
    };
    leg('l', -28, ll);
    leg('r', 27, lr);
  }
  const hs = [[0, 0, 0, 0], [t0 - 130, 2, 3, 2, 1, OUT]];
  const wl = [[0, R(0)], [t0 - 130, R(14), OUT]];
  const wr = [[0, R(0)], [t0 - 130, R(-14), OUT]];
  const ts = [[0, 0], [t0 - 90, 14]];
  const sc = [[0, B()]];
  for (let k = 0; k < 8; k++) {
    const s = weight(k);
    const t = beat(k);
    const big = k % 2 === 0;
    const mid = t + b / 2;
    hs.push([t + 40, -s * (big ? 3 : 2), 4, -s * (big ? 7 : 4), 1, OUT], [mid + 40, s, -6, s * 2, 1, IO]);
    wl.push([t + 34, R(s > 0 ? (big ? 96 : 74) : (big ? 2 : 14)), OUT], [mid + 40, R(s > 0 ? 62 : 26), IO]);
    wr.push([t + 34, R(s > 0 ? (big ? -2 : -14) : (big ? -96 : -74)), OUT], [mid + 40, R(s > 0 ? -26 : -62), IO]);
    ts.push([t + 100, -s * (big ? 52 : 30), big ? 1.24 : 1.12, OUT], [mid + 110, -s * 8, 1.04]);
    sc.push([t + 60, B(-s * 2, 3)], [mid + 60, B(s, -1.5)]);
  }
  hs.push([end + 20, 0, 6, 0, 1, OUT], [hop, 0, -9, 0, 1, OUT], [land + 20, 0, 7, 0, 1, OUT], [land + 150, 0, -2, 0, 1, IO], [land + 300, 0, 0, 0]);
  wl.push([end + 30, R(30), OUT], [hop - 60, R(128), OUT], [land, R(112), IO], [land + 120, R(122), IO], [land + 260, R(114), IO], [T - 140, R(-5), OUT], [T - 60, R(2)], [T, R(0)]);
  wr.push([end + 30, R(-30), OUT], [hop - 60, R(-128), OUT], [land, R(-112), IO], [land + 120, R(-122), IO], [land + 260, R(-114), IO], [T - 140, R(5), OUT], [T - 60, R(-2)], [T, R(0)]);
  ts.push([end + 50, 16], [hop + 40, -44, 1.26], [land + 60, 26, 1.1], [land + 190, -14], [land + 320, 6], [T - 60, -2], [T, 0]);
  sc.push([end, B(0, 3)], [hop, B(0, -3)], [land + 40, B(0, 5)], [land + 180, B()]);
  head(root, T, hs);
  const done = body(root, T, bs);
  wing(root, 'l', T, wl);
  wing(root, 'r', T, wr);
  tail(root, T, ts);
  track(q(root, '.q-scarf'), T, sc);
  track(q(root, '.q-leg-l'), T, ll);
  track(q(root, '.q-leg-r'), T, lr);
  const sh = [[0, 1]];
  for (let k = 0; k < 8; k++) sh.push([beat(k), 1.08, OUT], [beat(k) + b / 2, 0.86]);
  sh.push([end, 1.12], [hop, 0.62], [land, 1.16, OUT], [land + 160, 1], [T, 1]);
  shadow(root, T, sh);
  joy(root, T, [[t0 - 40, land + 300]]);
  mouth(root, T, [[beat(0), beat(1)], [beat(2), beat(3)], [beat(4), beat(5)], [beat(6), beat(7)], [end - 40, land + 300]]);
  brows(root, T, [[0, 0, 0], [t0, -5, -8], [land + 260, -5, -8], [land + 420, 0, 0]]);
  // A little dust where each weighted foot lands, then a bigger hit on the hop's landing.
  const stops = [[0, 'r', 22], [2, 'l', -22], [4, 'r', 22], [6, 'l', -22]];
  qa(root, '.q-puff').forEach((c, i) => {
    const [k, side, fx] = stops[i];
    const x = 120 + (side === 'l' ? -30 : 28) + fx;
    const t = beat(k);
    const out = side === 'l' ? -20 : 20;
    const hide = (px) => ({ opacity: 0, transform: `translate(${px}px,284px) scale(.2)` });
    const fx2 = (i % 2 ? 1 : -1) * (58 + i * 6);
    track(c, T, [
      [0, hide(x)], [t, hide(x), OUT], [t + 80, { opacity: 0.6, transform: `translate(${x + out * 0.6}px,281px) scale(.7)` }],
      [t + 240, { opacity: 0, transform: `translate(${x + out}px,274px) scale(1)` }, STEP], [land - 1, hide(120 + fx2), OUT],
      [land + 90, { opacity: 0.7, transform: `translate(${120 + fx2 * 1.25}px,280px) scale(.9)` }],
      [land + 330, { opacity: 0, transform: `translate(${120 + fx2 * 1.6}px,270px) scale(1.2)` }],
    ]);
  });
  const [p, r] = sparks(root);
  pop(p, T, hop + 10, 40, 58, 0.85, -80, -22, -22);
  pop(r, T, hop + 40, 200, 58, 0.85, 80, 22, -22);
  return done;
}

/** Flippers swing back into a deep crouch, throw up for the launch, a tight tucked flip, head comes up last, a stuck landing with one small steadying rock, ta-da. */
function backflip(root) {
  const T = 2240;
  const P0 = 340;          // leaves the ground
  const P1 = 940;          // lands
  const H = 214;
  const F = (y, r, sx = 1, sy = 1) => `translate(0px,${f2(y)}px) translate(0px,-120px) rotate(${f2(r)}deg) translate(0px,120px) scale(${f2(sx)},${f2(sy)})`;
  const air = [];
  for (let i = 1; i < 14; i++) {
    const u = i / 14;
    const r = -360 * (u * u * (3 - 2 * u));
    const tuck = Math.sin(Math.PI * u);
    air.push([lerp(P0, P1, u), F(-H * 4 * u * (1 - u), r, lerp(0.94, 0.86, tuck), lerp(1.12, 0.82, tuck))]);
  }
  const done = body(root, T, [
    [0, F(0, 0)], [60, F(0, -1, 0.99, 1.01), IO], [250, F(0, 9, 1.22, 0.72), OUT], [P0 - 24, F(0, 10, 1.24, 0.69), IN],
    [P0, F(-8, 0, 0.88, 1.2)],
    ...air,
    [P1, F(0, -360, 1.28, 0.68), OUT], [1050, F(-14, -362, 0.93, 1.09), IO], [1150, F(0, -363, 1.06, 0.94), IO], [1250, F(0, -358.5, 1.01, 0.99), IO],
    [1350, F(0, -360.8, 0.99, 1.012), IO], [1480, F(0, -360, 1, 1), IO], [T, F(0, -360)],
  ]);
  const w = (d) => [
    [0, R(0)], [90, R(d * 14), IO], [250, R(-d * 34), OUT], [P0 - 24, R(-d * 40), IN], [P0 + 20, R(d * 156), OUT], [P0 + 130, R(-d * 58), OUT], [P1 - 150, R(-d * 54), OUT],
    [P1, R(d * 36), OUT], [1080, R(d * 132), OUT], [1180, R(d * 112)], [1290, R(d * 124)], [1400, R(d * 116), IO], [1680, R(d * 120), IO], [1960, R(-d * 6), OUT], [2090, R(d * 2)], [T, R(0)],
  ];
  wing(root, 'l', T, w(1));
  wing(root, 'r', T, w(-1));
  tail(root, T, [
    [0, 0], [250, 16], [P0, -48, 1.32], [P0 + 180, 46, 1.62], [P0 + 400, 72, 1.62], [P1, 44, 1.3, OUT], [1070, -38, 1.22], [1190, 24, 1.1], [1330, -12], [1470, 5], [1620, -2], [T, 0],
  ]);
  head(root, T, [
    [0, 0, 0, 0], [250, 0, 10, 0, 1, OUT], [P0, 0, -8, 0], [P0 + 160, 0, 8, 0], [P1 - 90, 0, 6, 0], [P1, 0, 15, 2, 1, OUT], [1080, 0, -9, -1, 1, IO], [1190, 0, 3, 0.5, 1, IO], [1340, 0, 0, 0],
  ]);
  brows(root, T, [[0, 0, 0], [250, 3, 10, undefined, OUT], [P0, -8, -12, undefined, BACK], [P1, -3, -3], [1090, -8, -12, undefined, BACK], [1680, -7, -10], [1960, 0, 0]]);
  eyes(root, T, [[0, 1, 1], [170, 1, 1], [250, 1, 0.08], [P0 - 10, 1, 0.08], [P0 + 30, 1.1, 1.14], [P1 - 40, 1.1, 1.14], [P1, 1, 1]]);
  joy(root, T, [[P1 - 30, 1760]]);
  mouth(root, T, [[P0 + 10, P1 - 40], [P1 + 130, 1740]]);
  qa(root, '.q-leg').forEach((leg, i) => {
    const d = i ? 1 : -1;
    track(leg, T, [
      [0, B()], [P0 - 10, B()], [P0 + 40, B(0, 6, d * 4), OUT], [P0 + 170, B(-d * 8, -24, -d * 14), OUT], [P1 - 130, B(-d * 6, -22, -d * 10)], [P1 - 14, B(), IN],
      // one foot takes a small steadying step
      [1150, B()], [1215, B(i ? 5 : 0, i ? -6 : 0, i ? 8 : 0), OUT], [1290, B(), IN],
    ]);
  });
  shadow(root, T, [[0, 1], [250, 1.16, OUT], [P0, 1.1], [(P0 + P1) / 2, 0.34], [P1, 1.22, OUT], [1050, 0.9], [1150, 1.06], [1300, 1]]);
  puffs(root, T, P1, 1.1);
  const s = sparks(root);
  pop(s[0], T, 1085, 30, 96, 1.05, -90, -26, -38);
  pop(s[1], T, 1125, 210, 96, 1.05, 90, 26, -38);
  pop(s[2], T, 1165, 120, 6, 0.75, 70, 0, -36);
  return done;
}

/** Stands tall, one flipper across his middle, the other out behind; a slow proud bow, scarf swinging forward. */
function bow(root) {
  const T = 2160;
  const D = 640;           // bottom of the bow
  const U = 1260;          // starts up
  frontFlipper(root, 'r', T, 110, 1860, [
    [0, R(0)], [130, R(-6), OUT], [400, `translate(4px,26px) rotate(70deg) scale(.82)`, OUT], [D, `translate(6px,32px) rotate(76deg) scale(.82)`, IO], [U, `translate(6px,32px) rotate(76deg) scale(.82)`, IO],
    [1560, `translate(4px,22px) rotate(62deg) scale(.82)`, IN], [1800, R(-7), OUT], [1960, R(2)], [T, R(0)],
  ]);
  wing(root, 'l', T, [[0, R(0)], [340, R(-5), OUT], [D, R(44), OUT], [D + 110, R(36), IO], [U, R(38), IO], [1560, R(-6), IO], [1780, R(4), OUT], [T, R(0)]]);
  head(root, T, [
    [0, 0, 0, 0], [320, 0, -7, 0, 1, OUT], [420, 0, -8, 0, 1, IO], [D, 0, 30, 0, 1.08, OUT], [D + 130, 0, 26, 0, 1.07, IO], [D + 300, 0, 28, 0, 1.075, IO],
    [U, 0, 28, 0, 1.075, IN], [1480, 0, -10, 0, 1, OUT], [1640, 0, 4, 0, 1, IO], [1800, 0, -1, 0, 1, IO], [T, 0, 0, 0],
  ]);
  track(q(root, '.q-scarf'), T, [
    [0, B()], [320, B(0, -3)], [D, B(0, 22, 0, 1.02, 1.04), OUT], [D + 140, B(0, 19, 0, 1.02, 1.04), IO], [U, B(0, 20, 0, 1.02, 1.04), IN], [1480, B(0, -3), OUT], [1660, B()],
  ]);
  tail(root, T, [
    [0, 0], [420, -14, 1.05, IO], [D + 40, 40, 1.1, OUT], [D + 170, 26, 1.1, IO], [D + 310, 36, 1.1, IO], [D + 460, 31, 1.1, IO], [U, 33, 1.1, IN],
    [1480, -28, 1.14], [1640, 16, 1.04], [1790, -8], [1940, 3], [T, 0],
  ]);
  brows(root, T, [[0, 0, 0], [320, -6, -8, undefined, OUT], [460, -6, -8], [D, 1, 3], [U, 1, 3], [1480, -7, -9, undefined, BACK], [1800, -3, -4], [2000, 0, 0]]);
  joy(root, T, [[470, 1450]]);
  pupils(root, T, [[0, 0, 0], [320, 0, -3, OUT], [470, 0, -3], [1460, 0, 0]]);
  shadow(root, T, [[0, 1], [320, 0.96], [D, 1.1, OUT], [U, 1.08, IN], [1480, 0.95], [1660, 1.03], [T, 1]]);
  return body(root, T, [
    [0, REST], [150, B(0, 0, 0, 1.03, 0.97), OUT], [340, B(0, -8, 0, 0.955, 1.06), OUT], [440, B(0, -8, 0, 0.955, 1.06), IO],
    [D, B(0, 0, 0, 1.07, 0.86), OUT], [D + 140, B(0, 0, 0, 1.055, 0.885), IO], [D + 300, B(0, 0, 0, 1.06, 0.875), IO], [U, B(0, 0, 0, 1.06, 0.875), IN],
    [1480, B(0, -10, 0, 0.95, 1.07), OUT], [1640, B(0, 0, 0, 1.03, 0.97), IO], [1800, B(0, -1, 0, 0.995, 1.008), IO], [T, REST],
  ]);
}

// ---- slide: a victory belly-slide -----------------------------------------

// Transforms pivot between his feet. Lying, his middle is 124 ahead of that
// pivot, so a pivot of -124 keeps his middle over his place.
const LIE = 78;

/**
 * Crouch, dive onto his belly, skid off to his right, pop up for a ta-da, flop
 * the other way and skid home. He only ever goes to his right and back, so at a
 * stage edge (where a mirrored cameo's right is inward) he never leaves the
 * stage. cameoPlan's ACT_ROOM.slide is this reach.
 * { inPlace: true }: the belly-flop and a wiggle on the spot, for a Quill who
 * stands in a layout, with text beside him.
 */
function slide(root, svg, opts) {
  const inPlace = !!opts?.inPlace;
  const T = inPlace ? 1500 : 2860;
  const POP = inPlace ? 1060 : 1180;  // up off his belly
  const HOME = 100;        // his feet at the far end of the skid
  const ends = [[400, POP - 80]];
  if (!inPlace) ends.push([1840, 2400]);
  const wave = (d, from, to) => [[from, R(d * 18), OUT], [from + 80, R(d * 92), OUT], [to - 240, R(d * 74), IO], [to - 100, R(d * 96), IO], [to, R(d * 12)]];
  const legs = (d, from, to) => [[from, B(0, 0, 0)], [from + 90, B(d * 3, -6, d * 12), OUT], [to - 160, B(-d * 2, -3, -d * 7), IO], [to, B()]];
  const crouch = [[0, REST], [130, B(-4, 0, -5, 1.1, 0.88), OUT], [250, B(-6, 0, -7, 1.14, 0.84), IN]];
  joy(root, T, ends);
  mouth(root, T, ends);
  brows(root, T, [[0, 0, 0], [250, 3, 8, undefined, OUT], [420, -7, -10, undefined, BACK], [POP + 300, -7, -10], [T, 0, 0]]);
  if (inPlace) {
    wing(root, 'l', T, [[0, R(0)], [250, R(-14), IN], ...wave(1, 420, POP), [1250, R(-4), OUT], [T, R(0)]]);
    wing(root, 'r', T, [[0, R(0)], [250, R(14), IN], [420, R(-12)], [POP, R(-8)], [1250, R(4), OUT], [T, R(0)]]);
    qa(root, '.q-leg').forEach((leg, i) => track(leg, T, [[0, B()], ...legs(i ? 1 : -1, 420, POP)]));
    head(root, T, [[0, 0, 0, 0], [250, 0, 6, 0, 1, OUT], [460, 0, 2, -18, 1, OUT], [POP - 80, 0, 2, -18, 1, IO], [POP + 120, 0, 3, 0, 1, OUT], [T, 0, 0, 0]]);
    tail(root, T, [[0, 0], [250, 12], [480, -34, 1.3], [760, -18, 1.1], [POP, 18], [1260, -10], [T, 0]]);
    shadow(root, T, [[0, 1], [130, 1.1], [480, 1.3, OUT], [POP - 40, 1.3], [POP + 60, 0.8], [POP + 120, 1.1, OUT], [T, 1]]);
    return body(root, T, [
      ...crouch, [400, B(-60, -30, 50, 0.98, 1.02), OUT], [480, B(-124, -48, 80, 1.06, 0.92), OUT], [640, B(-118, -48, LIE - 2), IO], [800, B(-124, -50, LIE + 1), IO], [960, B(-120, -48, LIE - 1), IO],
      [POP, B(0, -22, -4, 0.94, 1.08), OUT], [1180, B(0, 0, 0, 1.1, 0.9), OUT], [1320, B(0, -3, 0, 0.98, 1.02), IO], [T, REST],
    ]);
  }
  wing(root, 'l', T, [[0, R(0)], [250, R(-14), IN], ...wave(1, 420, 1100), [1300, R(118), OUT], [1620, R(110), IO], [1720, R(16), OUT], [1860, R(-12)], [2500, R(-8)], [2640, R(4), OUT], [T, R(0)]]);
  wing(root, 'r', T, [[0, R(0)], [250, R(14), IN], [420, R(-12)], [1100, R(-8)], [1300, R(-118), OUT], [1620, R(-110), IO], [1720, R(-16), OUT], ...wave(-1, 1860, 2500), [2640, R(-4), OUT], [T, R(0)]]);
  qa(root, '.q-leg').forEach((leg, i) => {
    const d = i ? 1 : -1;
    track(leg, T, [[0, B()], ...legs(d, 420, 1100), [1860, B()], ...legs(d, 1861, 2460)]);
  });
  head(root, T, [
    [0, 0, 0, 0], [250, 0, 6, 0, 1, OUT], [460, 0, 2, -18, 1, OUT], [1060, 0, 2, -18, 1, IO], [1300, 0, 3, 0, 1, OUT], [1420, 0, -5, 0, 1, OUT], [1620, 0, 0, 0, 1, IO],
    [1720, 0, 5, 0, 1, OUT], [1940, 0, 2, 18, 1, OUT], [2380, 0, 2, 18, 1, IO], [2620, 0, 3, 0, 1, OUT], [T, 0, 0, 0],
  ]);
  tail(root, T, [
    [0, 0], [250, 12], [480, -40, 1.4], [820, -30, 1.3], [1100, -8, 1.1], [1300, 22, 1.08], [1440, -12], [1620, 4], [1720, -10],
    [1940, 40, 1.4], [2240, 30, 1.3], [2400, 8, 1.1], [2620, -18, 1.06], [2760, 8], [T, 0],
  ]);
  // His shadow goes with him and spreads while he lies flat.
  const sh = (x, s) => `translate(${x}px,0px) scale(${s},${Math.min(1.2, s)})`;
  track(q(root, '.q-shadow'), T, [
    [0, sh(0, 1)], [130, sh(0, 1.1)], [480, sh(30, 1.5), OUT], [1060, sh(132, 1.5)], [1200, sh(HOME, 0.8), OUT], [1300, sh(HOME, 1.12), OUT], [1420, sh(HOME, 0.98)], [1720, sh(HOME, 1.08)],
    [1940, sh(72, 1.5), OUT], [2380, sh(12, 1.5)], [2520, sh(0, 0.8), OUT], [2620, sh(0, 1.1), OUT], [T, sh(0, 1)],
  ]);
  // Dust thrown up behind him, one pair per skid.
  [[620, 176, -1], [880, 232, -1], [2080, 196, 1], [2260, 148, 1]].forEach(([at, x, out], i) => {
    const hide = { opacity: 0, transform: `translate(${x}px,284px) scale(.2)` };
    track(qa(root, '.q-puff')[i], T, [
      [0, hide], [at, hide, OUT], [at + 90, { opacity: 0.7, transform: `translate(${x + out * 16}px,280px) scale(.9)` }],
      [at + 340, { opacity: 0, transform: `translate(${x + out * 40}px,270px) scale(1.25)` }],
    ]);
  });
  const s = sparks(root);
  pop(s[0], T, 1300, 150, 80, 1, -80, -30, -30);
  pop(s[1], T, 1330, 290, 80, 1, 80, 30, -30);
  return body(root, T, [
    ...crouch, [400, B(-50, -30, 50, 0.98, 1.02), OUT], [480, B(-96, -48, LIE + 2, 1.06, 0.92), OUT],
    [640, B(-50, -50, LIE + 1), 'linear'], [820, B(-14, -46, LIE - 1), OUT], [960, B(2, -49, LIE), OUT], [1060, B(8, -48, LIE)],
    [POP, B(HOME, -34, -4, 0.94, 1.08), OUT], [1300, B(HOME, 0, 0, 1.12, 0.88), OUT], [1420, B(HOME, -4, 0, 0.97, 1.03), IO], [1620, B(HOME), IN],
    [1720, B(HOME + 4, 0, 5, 1.1, 0.88), IN], [1860, B(150, -30, -50, 0.98, 1.02), OUT], [1940, B(196, -48, -LIE - 2, 1.06, 0.92), OUT],
    [2120, B(170, -50, -LIE - 1), 'linear'], [2300, B(146, -46, -LIE + 1), OUT], [2380, B(136, -48, -LIE)],
    [2500, B(0, -30, 6, 0.94, 1.08), OUT], [2620, B(0, 0, 0, 1.1, 0.9), OUT], [2740, B(0, -3, 0, 0.98, 1.02), IO], [T, REST],
  ]);
}

// ---- inktick: the signature act ------------------------------------------

// The tick, world units. A short downstroke, then a long curved flourish.
const TICK_A = [244, 112];
const TICK_B = [286, 160];
const TICK_C = [390, 34];
const TICK_MID = [324, 116];   // pulls the long stroke into a curve
const WING_LEN = 74;
const HAND_LIFT = 0.36;        // radians his flipper rides above the line to the nib

function tickPoints() {
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push([lerp(TICK_A[0], TICK_B[0], i / 8), lerp(TICK_A[1], TICK_B[1], i / 8)]);
  for (let i = 1; i <= 16; i++) {
    const u = i / 16;
    pts.push([
      (1 - u) * (1 - u) * TICK_B[0] + 2 * u * (1 - u) * TICK_MID[0] + u * u * TICK_C[0],
      (1 - u) * (1 - u) * TICK_B[1] + 2 * u * (1 - u) * TICK_MID[1] + u * u * TICK_C[1],
    ]);
  }
  return pts;
}
const TICK = tickPoints();
const TICK_LEN = TICK.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - TICK[i - 1][0], p[1] - TICK[i - 1][1]) : 0), 0);
const TICK_D = TICK.map(([x, y], i) => `${i ? 'L' : 'M'}${f2(x)} ${f2(y)}`).join('');

/** The point on the tick a fraction (by length) of the way along it. */
function tickAt(f) {
  const want = f * TICK_LEN;
  let run = 0;
  for (let i = 1; i < TICK.length; i++) {
    const a = TICK[i - 1];
    const b = TICK[i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (run + d >= want) { const u = (want - run) / d; return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]; }
    run += d;
  }
  return TICK[TICK.length - 1];
}
const SHORT_F = TICK.slice(1, 9).reduce((s, p, i) => s + Math.hypot(p[0] - TICK[i][0], p[1] - TICK[i][1]), 0) / TICK_LEN;

/** Piecewise value at t: stops [t, v, ease to the next]. */
function at(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [t1, v1] = stops[i];
    const [t0, v0, e] = stops[i - 1];
    if (t <= t1) return lerp(v0, v1, (e || ((u) => u))((t - t0) / (t1 - t0)));
  }
  return stops[stops.length - 1][1];
}

/**
 * The writing arm, shoulder S to nib P: the flipper aims a little above the
 * nib, and the pen slides through his grip, so nib down and the feather never
 * crosses his face. Returns the flipper's screen angle and the pen's.
 */
function reach(S, P) {
  const wa = Math.atan2(P[1] - S[1], P[0] - S[0]) - HAND_LIFT;
  const gx = S[0] + Math.cos(wa) * WING_LEN;
  const gy = S[1] + Math.sin(wa) * WING_LEN;
  const pa = Math.atan2(gy - P[1], gx - P[0]);
  return { wing: (wa * 180) / Math.PI, pen: (pa * 180) / Math.PI };
}

const INK_T = 3080;
const DOWN0 = 620;    // short stroke starts
const DOWN1 = 800;
const UP0 = 880;      // long stroke starts
const UP1 = 1080;
const OFF = 1300;     // pen lifts away
const POCKET = 2020;  // pen is gone

// Body over the act: squash to wind up, stretch to reach, a hop on the flourish.
const ink = {
  x: [[0, 0], [260, -9, easeOut], [460, 8, easeOut], [DOWN1, 14, easeIO], [UP0, 12, easeOut], [UP1, 46, easeOut], [1240, 16, easeIn], [1420, 4, easeIO], [2200, 0]],
  y: [[0, 0], [260, 0, easeOut], [460, -8, easeOut], [DOWN1, 6, easeIO], [UP0, 12, easeOut], [UP1, -62, easeOut], [1240, 0, easeIn], [INK_T, 0]],
  r: [[0, 0], [260, -5, easeOut], [460, 3, easeOut], [DOWN1, 7, easeIO], [UP0, 5, easeOut], [UP1, 12, easeOut], [1240, 2, easeIn], [1420, 0, easeIO], [INK_T, 0]],
  sx: [[0, 1], [260, 1.08, easeOut], [460, 0.97, easeOut], [DOWN1, 1.04, easeIO], [UP0, 1.1, easeOut], [UP1, 0.9, easeOut], [1236, 0.96, easeIn], [1260, 1.17, easeOut], [1400, 0.97, easeIO], [1560, 1.02, easeIO], [1760, 1]],
  sy: [[0, 1], [260, 0.91, easeOut], [460, 1.04, easeOut], [DOWN1, 0.95, easeIO], [UP0, 0.88, easeOut], [UP1, 1.13, easeOut], [1236, 1.05, easeIn], [1260, 0.8, easeOut], [1400, 1.05, easeIO], [1560, 0.98, easeIO], [1760, 1]],
};

function poseNib(t, off) {
  if (t < DOWN0) {
    // from behind his shoulder up to the start of the tick
    const u = easeOut(clamp((t - 300) / (DOWN0 - 340), 0, 1));
    const hold = t > DOWN0 - 90 ? Math.sin(((t - (DOWN0 - 90)) / 90) * Math.PI) * 3 : 0;
    return [lerp(214, TICK_A[0] - 8, u), lerp(46, TICK_A[1] - 12, u) - hold];
  }
  if (t < DOWN1) return tickAt(SHORT_F * easeIO((t - DOWN0) / (DOWN1 - DOWN0)));
  if (t < UP0) return tickAt(SHORT_F);
  if (t < UP1) return tickAt(lerp(SHORT_F, 1, easeIn((t - UP0) / (UP1 - UP0)) * 0.55 + ((t - UP0) / (UP1 - UP0)) * 0.45));
  // the flick past the end, then back in toward him as he lands
  const a = easeOut(clamp((t - UP1) / 130, 0, 1));
  const b = easeIO(clamp((t - UP1 - 130) / (OFF - UP1 - 130), 0, 1));
  const c = easeIO(clamp((t - OFF) / (POCKET - OFF), 0, 1));
  const px = lerp(TICK_C[0] + 12 * a, 288, b) + off[0];
  const py = lerp(TICK_C[1] - 16 * a, 76, b) + off[1];
  return [lerp(px, 268, c), lerp(py, 130, c)];
}

/**
 * He pulls a feather pen from behind his shoulder and signs the moment: a big
 * tick in the air, the flourish carrying him off his feet. The ink stays in
 * the air where he wrote it while he drops back down, shines once, and fades.
 * The flipper follows the nib by two-bone reach, sampled into keyframes.
 */
function inktick(root) {
  const T = INK_T;
  const STEP_MS = 30;
  const bodyF = [];
  const wingF = [];
  const penF = [];
  const SR = SHOULDER.r;
  for (let t = 0; t <= T; t += STEP_MS) {
    const x = at(ink.x, t);
    const y = at(ink.y, t);
    const r = at(ink.r, t);
    const sx = at(ink.sx, t);
    const sy = at(ink.sy, t);
    bodyF.push([t, B(x, y, r, sx, sy)]);
    // the shoulder's place this frame: body pivot is between his feet
    const rad = (r * Math.PI) / 180;
    const lx = (SR[0] - 120) * sx;
    const ly = (SR[1] - 276) * sy;
    const S = [120 + x + lx * Math.cos(rad) - ly * Math.sin(rad), 276 + y + lx * Math.sin(rad) + ly * Math.cos(rad)];
    const nib = poseNib(t, [0, 0]);
    const k = reach(S, nib);
    let wingRot = k.wing - REST_ANG.r - r;
    while (wingRot > 40) wingRot -= 360;
    while (wingRot < -320) wingRot += 360;
    // before the pen: he reaches back over his shoulder; after it, the flipper comes home
    const inMix = easeIO(clamp((t - 300) / 200, 0, 1));
    const outMix = easeIO(clamp((t - POCKET + 120) / 320, 0, 1));
    const windUp = at([[0, 0], [130, 10, easeOut], [230, -6, easeIO], [320, -165, easeOut], [T, -165]], t);
    const home = at([[POCKET, -60], [POCKET + 300, 0, easeOut], [POCKET + 400, 7, easeIO], [POCKET + 510, -2], [POCKET + 600, 0]], t);
    wingF.push([t, R(lerp(lerp(windUp, wingRot, inMix), home, outMix))]);
    // the pen pops into his flipper and is twirled away
    const pop = at([[250, 0], [340, 1.3, easeOut], [420, 1.08, easeIO], [POCKET - 300, 1.15], [POCKET - 40, 0.1, easeIn]], t);
    const twirlA = at([[250, -200], [420, 0, easeOut], [POCKET - 420, 0], [POCKET - 40, 520, easeIO]], t);
    penF.push([t, {
      opacity: t < 250 || t > POCKET - 40 ? 0 : 1,
      transform: `translate(${f2(nib[0])}px,${f2(nib[1])}px) rotate(${f2(k.pen + 90 + twirlA)}deg) scale(${f2(Math.max(0.05, pop))})`,
    }]);
  }
  const done = body(root, T, bodyF);
  wing(root, 'r', T, wingF);
  track(q(root, '.q-pen'), T, penF);
  wing(root, 'l', T, [
    [0, R(0)], [260, R(8), OUT], [460, R(-5), OUT], [DOWN1, R(6)], [UP0, R(14)], [UP1, R(70), OUT], [1250, R(36), IN], [1400, R(-6), OUT], [1560, R(3)], [T, R(0)],
  ]);
  // Ink: drawn with the nib; under it a surface halo so it reads on anything.
  const ease = (t) => {
    if (t <= DOWN0) return 1;
    if (t >= UP1) return 0;
    if (t < DOWN1) return 1 - SHORT_F * easeIO((t - DOWN0) / (DOWN1 - DOWN0));
    if (t < UP0) return 1 - SHORT_F;
    const u = (t - UP0) / (UP1 - UP0);
    return 1 - lerp(SHORT_F, 1, easeIn(u) * 0.55 + u * 0.45);
  };
  const drawF = [];
  for (let t = DOWN0 - 30; t <= UP1 + 30; t += 15) drawF.push([t, { strokeDashoffset: f2(ease(t) * 1000) / 1000 }]);
  qa(root, '.q-ink').forEach((p) => {
    track(p, T, [[0, { strokeDashoffset: 1, opacity: 0 }], [DOWN0 - 30, { strokeDashoffset: 1, opacity: 0 }, STEP],
      [DOWN0 - 29, { strokeDashoffset: 1, opacity: 1 }], ...drawF.slice(1).map(([t, v]) => [t, { ...v, opacity: 1 }]),
      [2340, { strokeDashoffset: 0, opacity: 1 }, IO], [2880, { strokeDashoffset: 0, opacity: 0 }]]);
  });
  // the shine runs along the dry ink: a short gold dash travelling the stroke
  track(q(root, '.q-ink-shine'), T, [
    [0, { strokeDashoffset: 1.2, opacity: 0 }], [1340, { strokeDashoffset: 1.2, opacity: 0 }, IO], [1380, { strokeDashoffset: 1.14, opacity: 1 }, IO],
    [1840, { strokeDashoffset: 0, opacity: 1 }], [1960, { strokeDashoffset: -0.16, opacity: 0 }],
  ]);
  track(q(root, '.q-ink-group'), T, [
    [0, 'scale(1)'], [UP1 + 20, 'scale(1)', OUT], [UP1 + 130, 'scale(1.07)', IO], [UP1 + 300, 'scale(1)'], [1840, 'scale(1)', IO], [1960, 'scale(1.06)', IO], [2200, 'scale(1)'],
  ]);
  // ink flicked off the nib at the end of the stroke
  qa(root, '.q-drop').forEach((d, i) => {
    const [dx, dy] = [[30, -30], [42, -8], [14, -46]][i];
    const [x, y] = TICK_C;
    track(d, T, [
      [0, { opacity: 0, transform: `translate(${x}px,${y}px) scale(.3)` }], [UP1 + 10, { opacity: 0, transform: `translate(${x}px,${y}px) scale(.3)` }, OUT],
      [UP1 + 150, { opacity: 1, transform: `translate(${x + dx}px,${y + dy}px) scale(1)` }, IN],
      [UP1 + 420, { opacity: 0, transform: `translate(${x + dx * 1.3}px,${y + dy + 40}px) scale(.5)` }],
    ]);
  });
  const s = sparks(root);
  spark(s[0], T, 1800, 520, TICK_C[0], TICK_C[1], 16, -22, 1.05, 120);
  spark(s[1], T, 1860, 460, TICK_B[0] + 6, TICK_B[1] + 8, 10, 18, 0.65, -100);
  spark(s[2], T, 1420, 420, TICK_A[0], TICK_A[1], -14, -16, 0.6, 100);
  head(root, T, [
    [0, 0, 0, 0], [260, -3, 3, -3, 1, OUT], [460, 5, -3, 3, 1, OUT], [DOWN1, 8, 4, 5, 1, IO], [UP0, 7, 7, 4, 1, OUT], [UP1, 8, -8, 6, 1, OUT], [1250, 5, 10, 3, 1, OUT],
    [1420, 7, -3, 4, 1, IO], [1900, 7, -2, 3, 1, IO], [2030, 7, 8, 3, 1, IO], [2180, 7, -1, 2, 1, IO], [2500, 0, 0, 0],
  ]);
  pupils(root, T, [
    [0, 0, 0], [180, -3, -3], [420, 5, -6, OUT], [DOWN0, 6, -3], [DOWN1, 6, 1, IO], [UP0, 6, 1], [UP1, 6, -6, OUT], [1400, 6, -3], [2400, 6, -3, IO], [2600, 0, 0],
  ]);
  brows(root, T, [
    [0, 0, 0], [260, 2, 8, undefined, OUT], [460, -7, -10, undefined, BACK], [DOWN0, -1, 6], [UP0, 1, 9], [UP1, -8, -12, undefined, BACK], [1500, -3, -5], [2500, 0, 0],
  ]);
  mouth(root, T, [[UP1 - 80, 1320]]);
  joy(root, T, [[1960, 2260]]);
  tail(root, T, [
    [0, 0], [260, 12], [460, -14], [DOWN1, 8], [UP0, 18, 1.1], [UP1, -50, 1.55], [1250, 36, 1.2], [1400, -20, 1.08], [1560, 10], [1740, -4], [T, 0],
  ]);
  qa(root, '.q-leg').forEach((leg, i) => {
    const d = i ? 1 : -1;
    track(leg, T, [[0, B()], [UP0, B()], [UP1, B(d * 2, -6, d * 6), OUT], [1236, B(0, -2, 0), IN], [1260, B()]]);
  });
  shadow(root, T, [[0, 1], [260, 1.1], [UP0, 1.12], [UP1, 0.56], [1250, 1.18, OUT], [1400, 1], [T, 1]]);
  puffs(root, T, 1250, 0.7);
  return done;
}

// ---- reduced motion: a held end pose, nothing travels ---------------------

const sparkAt = (el, x, y, s) => [el, { opacity: 1, transform: `translate(${x}px,${y}px) rotate(20deg) scale(${s})` }];
const STILL_MS = 1000;

export const STILLS = {
  nod: (root) => { const [a] = sparks(root); return still([sparkAt(a, 176, 146, 1), ...joyPose(root), [q(root, '.q-face'), B(0, 8)]], 800); },
  clap: (root) => {
    const s = sparks(root);
    return still([...flipPose(root, 'l', R(-83)), ...flipPose(root, 'r', R(83)), sparkAt(s[0], 92, 128, 0.8), sparkAt(s[1], 148, 124, 0.7), ...joyPose(root), ...mouthPose(root)]);
  },
  point: (root, svg, target) => {
    const { side, angle } = aimOf(svg, target);
    const s = side === 'r' ? 1 : -1;
    return still([[q(root, `.q-wing-${side}`), R(flipperRotation(side, angle))], [q(root, '.q-face'), B(s * 7, -2, s * 2)],
      ...qa(root, '.q-pupil').map((p) => [p, `translate(${s * 5}px,-2px)`])], 1100);
  },
  twirl: (root) => still([...joyPose(root), ...mouthPose(root), [q(root, '.q-wing-l'), R(30)], [q(root, '.q-wing-r'), R(-30)]]),
  peek: (root) => still([...qa(root, '.q-pupil').map((p) => [p, 'translate(5px,0px)']), [q(root, '.q-face'), B(3, 0, 4)]], 800),
  think: (root) => {
    const dots = qa(root, '.q-dot');
    return still([...flipPose(root, 'r', 'rotate(96deg) scale(.8)'), [q(root, '.q-face'), B(3, -3, -5)],
      ...qa(root, '.q-pupil').map((p) => [p, 'translate(5px,-5px)']),
      [dots[0], { opacity: 1, transform: 'translate(190px,40px) scale(.62)' }], [dots[1], { opacity: 1, transform: 'translate(212px,12px) scale(.86)' }], [dots[2], { opacity: 1, transform: 'translate(244px,-22px) scale(1.18)' }]], 1200);
  },
  wow: (root) => {
    const s = sparks(root);
    return still([...qa(root, '.q-eye').map((e) => [e, 'scale(1.2,1.26)']), ...mouthPose(root), [q(root, '.q-wing-l'), R(100)], [q(root, '.q-wing-r'), R(-100)],
      sparkAt(s[0], 60, 60, 0.8), sparkAt(s[1], 180, 56, 0.7)]);
  },
  shrug: (root) => still([[q(root, '.q-wing-l'), 'translate(0px,-8px) rotate(92deg)'], [q(root, '.q-wing-r'), 'translate(0px,-8px) rotate(-92deg)'], [q(root, '.q-face'), B(-3, 6, -7)]]),
  dance: (root) => still([...joyPose(root), ...mouthPose(root), [q(root, '.q-wing-l'), R(120)], [q(root, '.q-wing-r'), R(-120)]]),
  backflip: (root) => still([...joyPose(root), ...mouthPose(root), [q(root, '.q-wing-l'), R(118)], [q(root, '.q-wing-r'), R(-118)]]),
  bow: (root) => still([...flipPose(root, 'r', 'translate(6px,32px) rotate(76deg) scale(.82)'), [q(root, '.q-wing-l'), R(38)], [q(root, '.q-face'), B(0, 28, 0, 1.07, 1.07)], [q(root, '.q-all'), B(0, 0, 0, 1.06, 0.875)], ...joyPose(root)], 1100),
  slide: (root) => still([...joyPose(root), ...mouthPose(root), [q(root, '.q-all'), B(0, 0, 6, 1.03, 0.97)], [q(root, '.q-wing-l'), R(70)], [q(root, '.q-wing-r'), R(-70)]]),
  inktick: (root) => still([
    ...qa(root, '.q-ink').map((p) => [p, { strokeDashoffset: 0, opacity: 1 }]), [q(root, '.q-wing-r'), R(-96)],
    [q(root, '.q-pen'), { opacity: 1, transform: 'translate(268px,66px) rotate(35deg) scale(1)' }], ...qa(root, '.q-pupil').map((p) => [p, 'translate(6px,-3px)']),
  ], 1200),
};

function joyPose(root) {
  return [[q(root, '.q-joy'), { opacity: 1 }], ...qa(root, '.q-eye').map((e) => [e, { opacity: 0 }])];
}
function mouthPose(root) {
  return [[q(root, '.q-beak-open'), { opacity: 1 }], [q(root, '.q-beak-closed'), { opacity: 0 }]];
}
function flipPose(root, side, v) {
  const fr = typeof v === 'string' ? { transform: v, opacity: 1 } : v;
  return [[q(root, `.q-wing-${side}`), { opacity: 0 }], [q(root, `.q-flip-${side}`), fr]];
}

export const PLAYS = { nod, clap, point, twirl, peek, think, wow, shrug, dance, backflip, bow, inktick, slide };

// ---- markup + styles the acts need ----------------------------------------

const STAR = 'M0-15L4-4 15 0 4 4 0 15-4 4-15 0-4-4Z';
const SPARK_COLOURS = ['--quill-feather', '--accent-gold', '--quill-feather', '--quill-scarf', '--quill-feather', '--accent-gold'];

// The feather pen, the same drawing as brandSvg's PEN: nib at (0, 0), feather up.
const PEN = `
    <path d="M0-14C-15-30-19-58-3-86C3-72 15-54 11-34 9-25 5-19 0-14Z" fill="var(--quill-feather)"/>
    <path d="M-1-22L-11-34M-2-36L-13-48M-2-50L-12-62M1-30L8-38M1-46L9-52" stroke="var(--quill-feather-lo)" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M0-4V-80" stroke="var(--quill-feather-lo)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M-4-15L0 2 4-15Z" fill="var(--quill-iris)"/>`;

export const actProps = {
  /** Under him: dust. */
  puffs: () => `<g class="q-puffs">${[0, 1, 2, 3].map(() => '<circle class="q-puff" r="9"/>').join('')}</g>`,
  /** Over him: ink, pen, thought dots, stars. */
  top: () => `
  <g class="q-ink-group">
    <path class="q-ink q-ink-halo" d="${TICK_D}" pathLength="1"/>
    <path class="q-ink q-ink-wet" d="${TICK_D}" pathLength="1"/>
    <path class="q-ink-shine" d="${TICK_D}" pathLength="1"/>
  </g>
  <g class="q-pen">${PEN}</g>
  <g class="q-drops">${[6, 4.5, 3.5].map((r) => `<circle class="q-drop" r="${r}"/>`).join('')}</g>
  <g class="q-dots">${[0, 1, 2].map(() => '<circle class="q-dot" r="13"/>').join('')}</g>
  <g class="q-sparks">${SPARK_COLOURS.map((c) => `<g class="q-spark"><path d="${STAR}" fill="var(${c})"/></g>`).join('')}</g>`,
  /** `scope` as in quillStyles(). */
  styles: (scope) => `
${scope} .q-stagebox, ${scope} .q-all { transform-box: view-box; transform-origin: 120px 276px; }
${scope} .q-face, ${scope} .q-front { transform-box: view-box; transform-origin: 120px 170px; }
${scope} .q-tummy, ${scope} .q-scarf { transform-box: view-box; transform-origin: 120px 186px; }
${scope} .q-leg-l { transform-box: view-box; transform-origin: 92px 266px; }
${scope} .q-leg-r { transform-box: view-box; transform-origin: 147px 266px; }
${scope} .q-shadow { transform-box: view-box; transform-origin: 120px 296px; }
${scope} .q-tuft { transform-box: fill-box; transform-origin: 50% 100%; }
${scope} .q-flip, ${scope} .q-back, ${scope} .q-spark, ${scope} .q-dot, ${scope} .q-pen,
${scope} .q-ink, ${scope} .q-ink-shine, ${scope} .q-drop, ${scope} .q-puff { opacity: 0; }
${scope} .q-flip { transform-box: fill-box; }
${scope} .q-flip-l { transform-origin: 82% 8%; }
${scope} .q-flip-r { transform-origin: 18% 8%; }
${scope} .q-puff { fill: var(--text-muted); }
${scope} .q-dot { fill: var(--bg-surface); stroke: var(--quill-body-hi); stroke-width: 3; }
${scope} .q-drop { fill: var(--quill-body-hi); stroke: var(--bg-surface); stroke-width: 2; }
${scope} .q-ink-group { transform-box: view-box; transform-origin: 298px 110px; }
${scope} .q-ink, ${scope} .q-ink-shine { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1 1; stroke-dashoffset: 1; }
${scope} .q-ink-halo { stroke: var(--bg-surface); stroke-width: 26; }
${scope} .q-ink-wet { stroke: var(--quill-body-hi); stroke-width: 16; }
${scope} .q-ink-shine { stroke: var(--quill-feather); stroke-width: 6; stroke-dasharray: .16 2; }`,
};
