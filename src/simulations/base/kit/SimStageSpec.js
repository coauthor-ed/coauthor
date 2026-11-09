/** SimStageSpec.js
 * SimStageSpec - the pure, renderer-free half of the stage recipes (R14): bridge phases and geometry, and the
 * contact-shadow falloff and footprint. SimStage.js (canvas) re-exports its part of it; SimStageSvg.js
 * (SVG/DOM) builds on it.
 * Adapted from (MIT; full notices in THIRD_PARTY.md beside the kit LICENSE):
 *   cth9191/animate@7e5eb56 plugins/animate/skills/animate/kit/morph.js (MIT, (c) 2026 cth9191) - bridge phases, exp(lerp(log k)) window scale, coverK (maskK)
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/transitions.js (MIT, (c) 2026 alchaincyf) - zoomThrough focus-hold
 *   wheresryan22/anatomy@e6600ff kit/iso.css (MIT, (c) 2026 Ryan) - shadow opacity rule .32 light / .9 dark, 3 px drop
 *   Original code: bridgePlan, bridgeFrame, shadowGeom, shadowFalloff, reduced-motion cut.
 *
 *   BRIDGE_D = 0.6, BRIDGE_M = 0.2, FOCUS_HOLD = 0.55, VEIL = 0.82, SHADOW_OPACITY { light 0.32, dark 0.9 }
 *   bridgeAt(t, d, m) -> { phase: 'before' | 'shrink' | 'morph' | 'grow' | 'done', u }   (see SimStage.js)
 *   bridgeK(phase, u, kmax)          window zoom about the object's centroid (log space)
 *   coverK(P, w, h) -> { c, kmax }   how far P scales about its centroid to cover a w x h frame (x 1.1)
 *   bridgePlan(PA, PB, w, h, n = 96) -> { a, b, ka, kb, shift, PBatA }   build ONCE per pair and frame size:
 *                                    outlines by angle ({ P, c }), cover zooms, B's object moved onto A's centroid
 *   bridgeFrame(plan, t, d, m) -> { phase, u, k, src: 'A' | 'B', P, dx, dy, fadeB, veilK, rimA, mixU }
 *                                    everything one bridge frame needs: P is the window outline (shrink/grow,
 *                                    already scaled and shifted) or the morphing outline (morph); dx, dy shift the
 *                                    window picture (focus-hold); fadeB is B's underlay opacity; veilK multiplies the
 *                                    veil; rimA is the window rim opacity; mixU the A -> B colour mix (morph)
 *   shadowFalloff(r)                 alpha falloff 1 at r = 0, 0 from r = 1 out, never increasing
 *   shadowGeom(w, o) -> { R, sx, sy, a } | null   radius of the shadow tile, x/y scale and alpha multiplier
 *                                    for a footprint w (o = { flat, soft, lift, k }, see SimStage.js)
 */
import { ease, reducedMotion } from './SimAnim.js';
import { byAngle, centroidOf } from './SimMorphSpec.js';

export const BRIDGE_D = 0.6;
export const BRIDGE_M = 0.2;
/** Fraction of the grow phase during which B's object holds where A's object was (huashu 0.55). */
export const FOCUS_HOLD = 0.55;
/** Paper veil over the dimmed pictures mid-bridge (1 = plain paper, the old hard cut-out). */
export const VEIL = 0.82;
/** Light / dark backdrop opacity of a contact shadow (anatomy iso.css halo rule). */
export const SHADOW_OPACITY = { light: 0.32, dark: 0.9 };

const clamp01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t);
const seg = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a)));
const zlerp = (z0, z1, e) => z0 * Math.pow(z1 / z0, e);   // SimCamera.zlerp (mirrored: no import cycle)

export function smooth01(u) {
  const x = clamp01(u);
  return x * x * (3 - 2 * x);
}

// -- Stage bridge ------------------------------------------------------------------

/** Phase and eased progress of a bridge at t seconds (half-length d, morph half-length m). */
export function bridgeAt(t, d = BRIDGE_D, m = BRIDGE_M) {
  if (reducedMotion()) return { phase: 'done', u: 1 };
  if (t < 0) return { phase: 'before', u: 0 };
  if (t >= 2 * d) return { phase: 'done', u: 1 };
  if (t < d - m) return { phase: 'shrink', u: smooth01(seg(t, 0, d - m)) };
  if (t < d + m) return { phase: 'morph', u: ease.inOutCubic(seg(t, d - m, d + m)) };
  return { phase: 'grow', u: smooth01(seg(t, d + m, 2 * d)) };
}

/** Window zoom about the object's centroid: kmax -> 1 while shrinking, 1 -> kmax while growing (log space). */
export function bridgeK(phase, u, kmax) {
  if (phase === 'shrink') return zlerp(kmax, 1, u);
  if (phase === 'grow') return zlerp(1, kmax, u);
  if (phase === 'before') return kmax;
  return phase === 'done' ? kmax : 1;
}

/** How far P must scale about its centroid to cover a w x h frame (SimMorph.coverScale with the frame given). */
export function coverK(P, w, h) {
  const c = centroidOf(P);
  const rmin = Math.max(8, Math.min(...byAngle(P, 48).P.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))));
  const far = Math.max(...[[0, 0], [w, 0], [0, h], [w, h]].map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])));
  return { c, kmax: far / rmin * 1.1 };
}

/** Everything a bridge needs that does not change with t (build once per pair and frame size). */
export function bridgePlan(PA, PB, w, h, n = 96) {
  const a = byAngle(PA, n);
  const b = byAngle(PB, n);
  const ka = coverK(PA, w, h).kmax;
  const kb = coverK(PB, w, h).kmax;
  const shift = [a.c[0] - b.c[0], a.c[1] - b.c[1]];
  const PBatA = b.P.map(([x, y]) => [x + shift[0], y + shift[1]]);
  return { a, b, ka, kb, shift, PBatA };
}

function scaled(P, c, k, dx = 0, dy = 0) {
  return P.map(([x, y]) => [c[0] + (x - c[0]) * k + dx, c[1] + (y - c[1]) * k + dy]);
}

/** One bridge frame at t seconds (see the header). */
export function bridgeFrame(plan, t, d = BRIDGE_D, m = BRIDGE_M) {
  const s = bridgeAt(t, d, Math.min(m, d));
  const shrink = s.phase === 'shrink';
  const morph = s.phase === 'morph';
  const k = shrink || s.phase === 'before' ? bridgeK(s.phase, s.u, plan.ka) : bridgeK(s.phase, s.u, plan.kb);
  const out = { phase: s.phase, u: s.u, k, src: shrink || s.phase === 'before' ? 'A' : 'B', P: null, dx: 0, dy: 0, fadeB: 0, veilK: 0, rimA: 0, mixU: 0 };
  if (s.phase === 'before') return out;
  if (s.phase === 'done') { out.fadeB = 1; return out; }
  // Focus-hold (huashu zoomThrough): B's object stays where A's was, then settles home late.
  const hold = morph ? 1 : shrink ? 0 : 1 - smooth01(seg(s.u, FOCUS_HOLD, 1));
  out.dx = plan.shift[0] * hold;
  out.dy = plan.shift[1] * hold;
  out.fadeB = morph ? s.u : shrink ? 0 : 1;
  out.veilK = morph ? 1 : shrink ? s.u : 1 - s.u;
  if (morph) {
    const a = plan.a.P, B = plan.PBatA;
    out.P = s.u <= 0 ? a : s.u >= 1 ? B : a.map((p, i) => [p[0] + (B[i][0] - p[0]) * s.u, p[1] + (B[i][1] - p[1]) * s.u]);
    out.mixU = s.u;
  } else {
    const src = shrink ? plan.a : plan.b;
    out.P = scaled(src.P, src.c, k, out.dx, out.dy);
    out.rimA = shrink ? s.u : 1 - s.u;
    out.mixU = shrink ? 0 : 1;
  }
  return out;
}

// -- Contact shadow ------------------------------------------------------------------

/**
 * Alpha falloff of a contact shadow at normalised radius r (0 centre, 1 rim):
 * a dense core under the object easing into a long soft edge. 1 at 0, exactly 0
 * from 1 outward, never increasing.
 */
export function shadowFalloff(r) {
  const x = Math.abs(r);
  if (x >= 1) return 0;
  const body = (1 - x * x) * (1 - x * x);
  const core = 1 - smooth01(x / 0.55);
  return 0.6 * body + 0.4 * core;
}

/** Shadow tile radius R, scales sx / sy and alpha multiplier a for a footprint w; null when nothing shows. */
export function shadowGeom(w, o = {}) {
  const lift = clamp01(o.lift ?? 0);
  const flat = o.flat ?? 0.22;
  const soft = o.soft ?? 9;
  const R = Math.max(2, Math.round(w / 2 + soft));
  const sx = 1 - 0.35 * lift;
  const a = (o.k ?? 1) * (1 - 0.65 * lift);
  if (a <= 0 || w <= 0) return null;
  return { R, sx, sy: sx * flat, a };
}
