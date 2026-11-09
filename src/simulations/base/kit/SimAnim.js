/** SimAnim.js
 * SimAnim - pure, deterministic motion primitives for CoAuthor scenes.
 * Adapted from (MIT; full notices in THIRD_PARTY.md beside the kit LICENSE):
 *   cth9191/animate@7e5eb56 kit/core.js, styles/math/kit.js (springs, springTrack, smoothM, keys)
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/motion.js (smooth, bezier, k75, overdamped spring, camera timings)
 *   wheresryan22/anatomy@e6600ff references/motion.md (burst attack rule)
 *   wheresryan22/anatomy@e6600ff kit/react/live.tsx (springStep, follow)
 *   cth9191/animate@7e5eb56 styles/isometric/kit.js (kick)
 *   huashu lib/motion.js also: slamK, laggedP, invert, easyEase, longTail, step (onTwos); lib/util.js hash (hash2)
 *   cues, reducedMotion and pop are original.
 *
 * What is here:
 *   ease            linear, smooth, inOutCubic, outCubic, smoothM, bezier, k75, easyEase, longTail, thereBack, step
 *   onTwos          seconds quantised to fps steps ("camera smooth, content on twos")
 *   invertEase      progress at which a MONOTONE ease reaches y (fire an event on a value)
 *   SPRINGS         snappy, smooth, heavy, playful, critical ({ period, zeta })
 *   spring          unit step response (0 -> 1) starting at rest
 *   springDuration  seconds until the spring response envelope falls below 0.001
 *   springTrack     retargetable spring value built by superposition
 *   springStep      stateful spring for drags/explodes: keeps velocity when the target moves
 *   follow          frame-rate independent exponential approach (pointer followers, tau 0.1-0.3 s)
 *   kick            impulse wobble 0 -> + -> - -> 0 (squash and sway after a hit)
 *   slamScale       slam-in scale 1.55 -> 0.94 -> 1 over TIMING.slam
 *   settle          monotonic critically damped 0 -> 1 curve reaching 1 at dur
 *                   (NOT huashu MO.settle, which is a ringing sine; never port that one under this name)
 *   burst           smoothstep rise (zero slope at onset) then smooth fall back to 0
 *   pop             keyframed pop-in returning { scale, alpha, done }
 *   TIMING          standard durations and draw speed constants
 *   lagged          staggered progress for item i of n (time in seconds)
 *   laggedP         same, from a 0..1 group progress (last item ends exactly at p = 1)
 *   hash2           stateless integer hash -> [0, 1) for per-cell scatter (seeded rng: kit/shuffle.js)
 *   laggedTotal     total duration for n staggered items
 *   keys            piecewise keyframe interpolation
 *   cues            chainable cue-sheet builder (.at, .then, .with, .after)
 *   reducedMotion   cached prefers-reduced-motion query
 *   setReducedMotion test override for reducedMotion (true, false, or null)
 *   dur             returns 0 under reduced motion, else seconds
 */
import { lookOf } from './lookProfile.js';

const TAU = Math.PI * 2;
// (1 + 9.24) * exp(-9.24) = 0.000994 < 0.001 for critical damping (zeta >= 1).
const CRITICAL_SETTLE_WT = 9.24;

function clamp01(t) {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

// -- Reduced motion -----------------------------------------------------------

let rmOverride = null;
let rmCached = null;
let rmMql = null;

/** Override reducedMotion() for tests: true, false, or null to clear. */
export function setReducedMotion(v) {
  rmOverride = v === null || v === undefined ? null : Boolean(v);
}

/** True when (prefers-reduced-motion: reduce) matches. Safe in Node. */
export function reducedMotion() {
  if (rmOverride !== null) return rmOverride;
  if (rmCached !== null) return rmCached;
  if (typeof globalThis !== 'undefined' && typeof globalThis.matchMedia === 'function') {
    rmMql = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    rmCached = Boolean(rmMql && rmMql.matches);
    const onChange = (e) => {
      rmCached = Boolean(e && e.matches);
    };
    if (rmMql && typeof rmMql.addEventListener === 'function') {
      rmMql.addEventListener('change', onChange);
    } else if (rmMql && typeof rmMql.addListener === 'function') {
      rmMql.addListener(onChange);
    }
    return rmCached;
  }
  return false;
}

/** Returns 0 under reduced motion, else seconds. */
export function dur(seconds) {
  return reducedMotion() ? 0 : seconds;
}

// -- Eases --------------------------------------------------------------------

function linear(t) {
  return clamp01(t);
}

function smooth(t) {
  const u = clamp01(t);
  return u * u * u * (u * (u * 6 - 15) + 10);
}

function inOutCubic(t) {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

function outCubic(t) {
  const u = clamp01(t);
  const inv = 1 - u;
  return 1 - inv * inv * inv;
}

function smoothM(t, inflection = 10) {
  const u = clamp01(t);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const s = (x) => 1 / (1 + Math.exp(-x));
  const err = s(-inflection / 2);
  return clamp01((s(inflection * (u - 0.5)) - err) / (1 - 2 * err));
}

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (s) => ((ax * s + bx) * s + cx) * s;
  const slopeX = (s) => (3 * ax * s + 2 * bx) * s + cx;
  const sampleY = (s) => ((ay * s + by) * s + cy) * s;

  return function cubicBezier(t) {
    const x = clamp01(t);
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    if (x1 === y1 && x2 === y2) return x;

    let lo = 0;
    let hi = 1;
    let s = x;

    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - x;
      if (Math.abs(err) < 1e-7) break;
      if (err > 0) hi = s;
      else lo = s;
      const d = slopeX(s);
      if (Math.abs(d) > 1e-6) {
        const next = s - err / d;
        s = next > lo && next < hi ? next : 0.5 * (lo + hi);
      } else {
        s = 0.5 * (lo + hi);
      }
    }

    for (let i = 0; i < 12 && Math.abs(sampleX(s) - x) >= 1e-7; i++) {
      s = 0.5 * (lo + hi);
      if (sampleX(s) > x) hi = s;
      else lo = s;
    }

    return clamp01(sampleY(s));
  };
}

const k75 = bezier(0.75, 0, 0.25, 1);
// Easy Ease (loops) and a long-tail settle (follow a line, pull back).
const easyEase = bezier(0.333, 0, 0.667, 1);
const longTail = bezier(0.33, 0, 0.2, 1);

function thereBack(t) {
  const u = clamp01(t);
  return smooth(u < 0.5 ? 2 * u : 2 - 2 * u);
}

function step(t, n = 12) {
  const u = clamp01(t);
  const count = Math.max(1, n);
  return Math.floor(u * count) / count;
}

export const ease = {
  linear,
  smooth,
  inOutCubic,
  outCubic,
  smoothM,
  bezier,
  k75,
  easyEase,
  longTail,
  thereBack,
  step,
};

/** Seconds quantised to fps steps; onTwos(0) = 0. */
export function onTwos(t, fps = 12) {
  return Math.floor(t * fps + 1e-6) / fps;
}

/** Progress p at which a monotone increasing ease reaches y (30 bisections). Not for springs or thereBack. */
export function invertEase(easeFn, y, iters = 30) {
  let a = 0;
  let b = 1;
  for (let i = 0; i < iters; i++) {
    const m = (a + b) / 2;
    if (easeFn(m) < y) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

// -- Springs ------------------------------------------------------------------

export const SPRINGS = {
  snappy: { period: 0.35, zeta: 0.75 },
  smooth: { period: 0.5, zeta: 0.9 },
  heavy: { period: 0.8, zeta: 0.85 },
  playful: { period: 0.45, zeta: 0.5 },
  critical: { period: 0.5, zeta: 1 },
};

function presetOf(preset) {
  if (typeof preset === 'string') {
    return SPRINGS[preset] || SPRINGS.smooth;
  }
  if (preset && typeof preset === 'object') {
    const base = SPRINGS[preset.preset] || SPRINGS.smooth;
    return {
      period: preset.period ?? base.period,
      zeta: preset.zeta ?? base.zeta,
      ui: preset.ui === true,
    };
  }
  return SPRINGS.smooth;
}

/**
 * A spring for a decorative UI flourish (a chip landing, a drag snapping back, a callout dot): the
 * look may calm it (LookProfile uiSpringDamp; plain 1: settles with no ringing). Every other spring
 * is machinery (a model's own spring, a rig, an exploded view, physics) and keeps its damping under
 * every look. uiSpring('playful') or uiSpring({ period, zeta }).
 */
export function uiSpring(preset = 'smooth') {
  return typeof preset === 'object' && preset ? { ...preset, ui: true } : { preset, ui: true };
}

function resolvePreset(preset = 'smooth') {
  const p = presetOf(preset);
  if (!p.ui) return p;
  const floor = lookOf().uiSpringDamp ?? 0;
  return p.zeta < floor ? { ...p, zeta: floor } : p;
}

/** Unit step response from 0 to 1, starting at rest. */
export function spring(t, preset = 'smooth') {
  if (reducedMotion()) return t < 0 ? 0 : 1;
  if (t <= 0) return 0;
  const { period, zeta } = resolvePreset(preset);
  const w = TAU / period;
  if (Math.abs(zeta - 1) < 1e-4) {
    return 1 - Math.exp(-w * t) * (1 + w * t);
  }
  if (zeta < 1) {
    const wd = w * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
  }
  // Overdamped: two real roots, no oscillation, slower than critical.
  const r = Math.sqrt(zeta * zeta - 1);
  const a = -w * (zeta - r);
  const b = -w * (zeta + r);
  const A = -b / (a - b);
  return 1 - (A * Math.exp(a * t) + (1 - A) * Math.exp(b * t));
}

/** Seconds until the spring envelope falls below 0.001. */
export function springDuration(preset = 'smooth') {
  const { period, zeta } = resolvePreset(preset);
  const w = TAU / period;
  if (Math.abs(zeta - 1) < 1e-4) {
    return CRITICAL_SETTLE_WT / w;
  }
  if (zeta < 1) {
    const amp = 1 / Math.sqrt(1 - zeta * zeta);
    return Math.log(1005 * amp) / (zeta * w);
  }
  // Overdamped: the slow root dominates the tail.
  const r = Math.sqrt(zeta * zeta - 1);
  const slow = w * (zeta - r);
  const A = (zeta + r) / (2 * r);
  return Math.log(1005 * A) / slow;
}

/** Retargetable value built by superposition of unit springs. */
export function springTrack(initial = 0, preset = 'smooth') {
  let base = initial;
  let currentTarget = initial;
  let lastT = -Infinity;
  const changes = [];
  const sDur = springDuration(preset);

  function compact(t) {
    let i = 0;
    while (i < changes.length) {
      if (t - changes[i].t >= sDur) {
        base += changes[i].delta;
        changes.splice(i, 1);
      } else {
        i += 1;
      }
    }
  }

  return {
    to(target, t = 0) {
      compact(t);
      const delta = target - currentTarget;
      if (delta !== 0) {
        changes.push({ t, delta });
        currentTarget = target;
        if (t > lastT) lastT = t;
      }
      return this;
    },
    at(t = 0) {
      if (reducedMotion()) return currentTarget;
      let v = base;
      for (let i = 0; i < changes.length; i++) {
        const ch = changes[i];
        if (t > ch.t) {
          v += ch.delta * spring(t - ch.t, preset);
        }
      }
      return v;
    },
    get target() {
      return currentTarget;
    },
    settled(t = 0) {
      if (reducedMotion() || changes.length === 0) return true;
      if (t >= lastT + sDur) {
        compact(t);
        return true;
      }
      return false;
    },
  };
}

/**
 * Stateful spring step for values the learner drives (drags, explode toggles).
 * state = { x, v }; mutated in place. Sub-steps at 240 Hz so a dropped frame stays stable.
 * Returns true while still moving (feed it to busy()). Reduced motion snaps to target.
 */
export function springStep(state, target, dt, preset = 'smooth') {
  if (reducedMotion()) {
    state.x = target;
    state.v = 0;
    return false;
  }
  const { period, zeta } = resolvePreset(preset);
  const w = TAU / period;
  const k = w * w;
  const c = 2 * zeta * w;
  const steps = Math.max(Math.ceil(dt * 240), 1);
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    state.v += ((target - state.x) * k - state.v * c) * h;
    state.x += state.v * h;
  }
  if (Math.abs(target - state.x) < 5e-4 && Math.abs(state.v) < 5e-4) {
    state.x = target;
    state.v = 0;
    return false;
  }
  return true;
}

/** Exponential approach with time constant tau seconds; independent of how dt is chopped. */
export function follow(current, target, dt, tau = 0.15) {
  if (reducedMotion() || tau <= 0) return target;
  const next = current + (target - current) * (1 - Math.exp(-dt / tau));
  return Math.abs(target - next) < 1e-3 ? target : next;
}

/** Impulse response: 0 at t = 0, swings positive, crosses zero, decays. Multiply by an amplitude. */
export function kick(t, preset = 'playful') {
  if (reducedMotion() || t <= 0) return 0;
  const { period, zeta } = resolvePreset(preset);
  const w = TAU / period;
  const z = Math.min(0.98, zeta);
  const wd = w * Math.sqrt(1 - z * z);
  return Math.exp(-z * w * t) * Math.sin(wd * t);
}

/** Slam-in scale: 0 before age 0, then 1.55 -> 0.94 (first 60%) -> 1 over dur. */
export function slamScale(age, slamDur = 0.17, from = 1.55, under = 0.94) {
  if (age < 0) return 0;
  if (reducedMotion() || slamDur <= 0) return 1;
  const k = age / slamDur;
  if (k <= 0) return from;
  if (k < 0.6) return from - (from - under) * (k / 0.6);
  if (k < 1) return under + (1 - under) * ((k - 0.6) / 0.4);
  return 1;
}

/** Critically damped 0 -> 1 curve that reaches within 0.001 of 1 at dur and never overshoots. */
export function settle(t, durSeconds = 0.5) {
  if (reducedMotion()) return 1;
  if (t <= 0) return 0;
  if (durSeconds <= 0) return 1;
  const wt = CRITICAL_SETTLE_WT * (t / durSeconds);
  return clamp01(1 - Math.exp(-wt) * (1 + wt));
}

// -- One-shots and timing -----------------------------------------------------

export const TIMING = {
  pop: 0.5,
  enter: 0.35,
  exit: 0.18,
  hold: 0.5,
  stagger: 0.1,
  tapCap: 0.8,
  drawSpeed: 1200,
  // Camera moves (huashu MO.PULSE); push and pull capped at tapCap.
  punch: 0.28,
  pan: 0.3,
  slam: 0.17,
  push: 0.8,
  glide: 0.7,
  pull: 0.8,
};

/** 0 before age 0; smoothstep up to 1 over rise (no pop at onset); smooth back to 0 over fall. */
export function burst(age, rise = 0.08, fall = 0.4) {
  if (reducedMotion()) return 0;
  if (age <= 0 || age >= rise + fall) return 0;
  if (age < rise) {
    return rise > 0 ? smooth(age / rise) : 1;
  }
  return fall > 0 ? 1 - smooth((age - rise) / fall) : 0;
}

// Measured pop: 90% by about 0.25 s, 108% peak, back to 100% at about 0.5 s.
const POP_FRAMES = [
  [0, 0],
  [0.22, 0.9],
  [0.33, 1.08],
  [0.5, 1.0],
];

/** Keyframed pop-in returning { scale, alpha, done }, or null for age < 0. */
export function pop(age) {
  if (age < 0) return null;
  if (reducedMotion() || age >= 0.5) {
    return { scale: 1, alpha: 1, done: true };
  }
  const scale = keys(age, POP_FRAMES, smooth);
  const alpha = age >= 0.12 ? 1 : smooth(age / 0.12);
  return { scale, alpha, done: false };
}

/** Progress of item i of n, starting at i * lag. */
export function lagged(t, i, n, { dur: d = TIMING.enter, lag = TIMING.stagger, ease: easeFn = smooth } = {}) {
  if (reducedMotion()) return 1;
  if (n <= 0) return 1;
  const start = i * lag;
  if (t <= start) return 0;
  if (d <= 0 || t >= start + d) return 1;
  return clamp01(easeFn(clamp01((t - start) / d)));
}

/** Progress of item i of n from a 0..1 group progress; r = lag ratio per item (3b1b default 0.05, common 0.1). */
export function laggedP(p, i, n, r = 0.1) {
  if (reducedMotion() || p >= 1) return 1;
  return clamp01(p * (1 + (n - 1) * r) - i * r);
}

/** Stateless integer hash of (i, j) to [0, 1). */
export function hash2(i, j = 0) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Total duration of n staggered items. */
export function laggedTotal(n, { dur: d = TIMING.enter, lag = TIMING.stagger } = {}) {
  if (n <= 0) return 0;
  return d + (n - 1) * lag;
}

/** Piecewise interpolation across sorted [[t0, v0], [t1, v1], ...] frames. */
export function keys(t, frames, easeFn = smooth) {
  if (!frames || frames.length === 0) return 0;
  if (frames.length === 1) return frames[0][1];
  if (t <= frames[0][0]) return frames[0][1];
  const last = frames[frames.length - 1];
  if (t >= last[0]) return last[1];

  for (let i = 0; i < frames.length - 1; i++) {
    const [t0, v0] = frames[i];
    const [t1, v1] = frames[i + 1];
    if (t >= t0 && t <= t1) {
      const span = t1 - t0;
      const u = span > 0 ? easeFn(clamp01((t - t0) / span)) : 1;
      return v0 + (v1 - v0) * u;
    }
  }
  return last[1];
}

// -- Cue sheet ----------------------------------------------------------------

/** Chainable cue-sheet builder and reader. */
export function cues() {
  const map = new Map();
  let prevStart = 0;
  let prevEnd = 0;
  let totalEnd = 0;

  function add(start, name, duration, easeFn = smooth) {
    const s = Math.max(0, start);
    const d = Math.max(0, duration ?? 0);
    const item = {
      name,
      start: s,
      dur: d,
      end: s + d,
      easeFn: easeFn || smooth,
    };
    map.set(name, item);
    prevStart = item.start;
    prevEnd = item.end;
    if (item.end > totalEnd) totalEnd = item.end;
  }

  function get(name) {
    const item = map.get(name);
    if (!item) {
      throw new Error('Unknown cue name: ' + String(name));
    }
    return item;
  }

  return {
    at(start, name, duration, easeFn) {
      add(start, name, duration, easeFn);
      return this;
    },
    then(name, duration, easeFn) {
      add(prevEnd, name, duration, easeFn);
      return this;
    },
    with(name, duration, easeFn) {
      add(prevStart, name, duration, easeFn);
      return this;
    },
    after(gap, name, duration, easeFn) {
      add(prevEnd + gap, name, duration, easeFn);
      return this;
    },
    raw(name, t) {
      const item = get(name);
      if (reducedMotion()) return 1;
      if (t <= item.start) return 0;
      if (t >= item.end || item.dur <= 0) return 1;
      return clamp01((t - item.start) / item.dur);
    },
    p(name, t) {
      const item = get(name);
      if (reducedMotion()) return 1;
      if (t <= item.start) return 0;
      if (t >= item.end || item.dur <= 0) return 1;
      return clamp01(item.easeFn(clamp01((t - item.start) / item.dur)));
    },
    started(name, t) {
      const item = get(name);
      return reducedMotion() ? true : t >= item.start;
    },
    finished(name, t) {
      const item = get(name);
      return reducedMotion() ? true : t >= item.end;
    },
    start(name) {
      return get(name).start;
    },
    get end() {
      return totalEnd;
    },
    done(t) {
      return reducedMotion() ? true : t >= totalEnd;
    },
  };
}
