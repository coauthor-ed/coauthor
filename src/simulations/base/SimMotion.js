/**
 * SimMotion — shared easing/tween helpers for the look's motion
 * language (see the Quill look spec, sec 7 (packs/look/quill/SPEC.md in the kit)).
 *
 * Motion reads as "clean" largely because objects don't ease
 * over their *entire* journey — they accelerate out of rest, hold a steady
 * cruise speed, then decelerate into the next rest, with no springy
 * overshoot. `cruise()` is a genuine trapezoidal-velocity profile encoding
 * exactly that (constant acceleration, constant speed, constant
 * deceleration), so scenes don't hand-roll it per particle. Framework
 * agnostic — no canvas dependency, safe to import from any simulation base.
 */

export const SimEase = {
  linear: (t) => t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2),
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t * t * t,
};

export function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Smoothstep between two progress checkpoints `a` and `b` (not 0..1): 0
 * before `a`, 1 after `b`, smoothed in between. Used for staggered fades/
 * reveals keyed off a shared scene clock (e.g. `smooth(0.7, 1, zoomProgress)`
 * to fade to black only in the last 30% of a zoom).
 */
export function smooth(a, b, t) {
  const u = (t - a) / (b - a);
  return u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
}

/**
 * Trapezoidal-velocity progress curve, 0..1 -> 0..1: constant acceleration
 * for `accelFrac` of the duration, constant cruise speed for the remainder
 * minus `decelFrac`, then constant deceleration to a stop. No overshoot, no
 * bounce — velocity is continuous at both phase boundaries.
 *
 * @param {number} t          progress, 0..1 (clamped)
 * @param {number} accelFrac  fraction of duration spent accelerating (default 0.25)
 * @param {number} decelFrac  fraction of duration spent decelerating (default 0.25)
 */
export function cruise(t, accelFrac = 0.25, decelFrac = 0.25) {
  const p = clamp01(t);
  const ta = clamp01(accelFrac);
  const td = clamp01(decelFrac);
  const tc = Math.max(0, 1 - ta - td);
  const denom = 0.5 * ta + tc + 0.5 * td;
  const v = denom > 0 ? 1 / denom : 1;

  if (ta > 0 && p <= ta) {
    return 0.5 * (v / ta) * p * p;
  }
  const distAccel = 0.5 * v * ta;
  if (p <= ta + tc) {
    return distAccel + v * (p - ta);
  }
  const distCruise = distAccel + v * tc;
  const u = p - (ta + tc);
  return distCruise + v * u - (td > 0 ? 0.5 * (v / td) * u * u : 0);
}
