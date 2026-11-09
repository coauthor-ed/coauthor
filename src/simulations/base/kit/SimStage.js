/** SimStage.js
 * SimStage - stage bridges ("this becomes that" between two beats) and a soft contact shadow (recipe R14).
 * Adapted from cth9191/animate@7e5eb56 plugins/animate/skills/animate/kit/morph.js (MIT, (c) 2026 cth9191) - bridge phases, exp(lerp(log k)) window scale (lines 91-122)
 * Adapted from alchaincyf/huashu-art-motion@64cb272 scripts/engine/transitions.js (MIT, (c) 2026 alchaincyf) - zoomThrough focus-hold (lines 872-890)
 * Adapted from wheresryan22/anatomy@e6600ff kit/iso.css (MIT, (c) 2026 Ryan) - halo opacity rule .32 light / .9 dark, 3 px drop
 * Original code: contactShadow (cached radial-gradient sprite, falloff), the bridge factory, reduced-motion cut.
 * Full notices in THIRD_PARTY.md beside the kit LICENSE.
 * The pure parts (phases, bridge plan and frame, shadow falloff and footprint) live in SimStageSpec.js and are
 * re-exported here; SimStageSvg.js is the SVG/DOM renderer of the same recipes.
 *
 * Stage bridge (about 1.2 s, after a tap or on a beat change):
 *   const br = stageBridge(A, B, o)   build ONCE per pair (outlines resampled, cover zooms worked out here)
 *     A, B = { P: closed outline [[x, y], ...] of the bridge object, col: fill colour, draw(ctx) }
 *       draw(ctx) paints that whole stage picture (its own backdrop included).
 *     o = { d = 0.6, m = 0.2, paper = c.bgDeep (resolved at draw), rim = 3, veil = VEIL (0.82) }
 *   br.draw(ctx, c, t)   t = seconds since the bridge started. Three phases:
 *       shrink [0, d - m]      picture A seen through a window shaped like A's object; the window
 *                              shrinks from covering the frame onto the object (k log-interpolated)
 *       morph  [d - m, d + m]  the object's outline and colour become B's, in place, over both
 *                              pictures cross-fading under a paper veil (veil 1 = plain paper)
 *       grow   [d + m, 2d]     picture B opens out of B's object; B's object starts where A's was and
 *                              only slides home after 55% of the phase (focus-hold), so the eye never jumps
 *     then (and before 0) it draws B (after) or A (before).  Returns { phase, done }.
 *   br.done(t)           t >= br.dur (busy() should be !br.done(t))
 *   br.dur               2d seconds (0 under reduced motion)
 *   br.at(t)             { phase, u, k } (pure; for tests and custom drawing)
 *   bridgeAt(t, d, m)    { phase: 'before' | 'shrink' | 'morph' | 'grow' | 'done', u } with eased u
 *                        (smoothstep in/out on every phase: no hard start or stop at a phase edge)
 *   bridgeK(phase, u, kmax)  window zoom: shrink kmax -> 1, grow 1 -> kmax, both geometric (SimCamera.zlerp)
 *   BRIDGE_D = 0.6, BRIDGE_M = 0.2 (animate's values; 0.25 / 0.08 read as jarring in review)
 *   Reduced motion: a cut (phase 'done' at once, B drawn, dur 0).
 *   Not ported: huashu fillZoom's 40x zoom (too far for a tap); offscreen era layers (we clip instead).
 *
 * Contact shadow (anything standing on a floor, bench or soil line):
 *   contactShadow(ctx, x, y, w, c, o)   soft ellipse under a footprint of width w centred at (x, y).
 *     o = { flat = 0.22 (ry / rx), soft = 9 (px of falloff past the footprint), lift = 0 (0..1: object
 *     off the ground, shadow shrinks and fades), k = 1 (alpha multiplier), col (default darken(c.bgDeep)) }
 *     One fillRect with a cached radial gradient (keyed by ctx, radius, colour, opacity): no ctx.filter,
 *     no square edge (the falloff is exactly 0 from radius 1 outward, the tile corners sit at sqrt 2).
 *   shadowFalloff(r)       pure alpha falloff: 1 at r = 0, 0 for r >= 1, never increasing
 *   shadowOpacity(c)       0.32 on a light backdrop, 0.9 on a dark one (SHADOW_OPACITY)
 *   shadowColor(c)         darken(c.bgDeep, 0.7)
 * Geometry: anatomy's 9 px blur and 3 px drop were measured on a ~600 px wide viewBox; at 680 they
 * round to the same numbers, so they are kept.
 */
import { reducedMotion } from './SimAnim.js';
import { alpha, darken, luma, mix, W, H } from './SimLook.js';
import {
  BRIDGE_D, BRIDGE_M, FOCUS_HOLD, VEIL, SHADOW_OPACITY, bridgeAt, bridgeK, bridgePlan, bridgeFrame, shadowFalloff, shadowGeom,
} from './SimStageSpec.js';

export { BRIDGE_D, BRIDGE_M, FOCUS_HOLD, VEIL, SHADOW_OPACITY, bridgeAt, bridgeK, shadowFalloff };

// -- Stage bridge ------------------------------------------------------------------

function outline(ctx, P) {
  ctx.beginPath();
  P.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
  ctx.closePath();
}

/**
 * Build a bridge from picture A to picture B (see the header). Build it once per pair
 * (at setup or in enter), not per frame: the outlines are resampled and cover zooms computed here.
 */
export function stageBridge(A, B, o = {}) {
  const d = o.d ?? BRIDGE_D;
  const m = Math.min(o.m ?? BRIDGE_M, d);
  const rim = o.rim ?? 3;
  const plan = bridgePlan(A.P, B.P, W, H, 96);

  const at = (t) => {
    const s = bridgeAt(t, d, m);
    const k = s.phase === 'shrink' || s.phase === 'before' ? bridgeK(s.phase, s.u, plan.ka) : bridgeK(s.phase, s.u, plan.kb);
    return { phase: s.phase, u: s.u, k };
  };
  const dur = () => (reducedMotion() ? 0 : 2 * d);
  const done = (t) => reducedMotion() || t >= 2 * d;

  function draw(ctx, c, t) {
    const f = bridgeFrame(plan, t, d, m);
    if (f.phase === 'before') { A.draw(ctx); return { phase: f.phase, done: false }; }
    if (f.phase === 'done') { B.draw(ctx); return { phase: f.phase, done: true }; }
    const paper = o.paper ?? c.bgDeep;
    const veil = o.veil ?? VEIL;
    const shrink = f.phase === 'shrink';
    ctx.save();
    // Underlay: the pictures stay faintly in view (A fades to B during the morph) under a paper veil
    // that thickens while shrinking and thins while growing, so nothing blinks out.
    if (veil >= 1) {
      ctx.fillStyle = paper;
      ctx.fillRect(-4, -4, 4000, 4000);
    } else {
      if (f.fadeB < 1) A.draw(ctx);
      if (f.fadeB > 0) {
        ctx.save();
        ctx.globalAlpha = f.fadeB;
        B.draw(ctx); // at home: only the window's copy holds at A's spot, the stage never slides
        ctx.restore();
      }
      ctx.fillStyle = alpha(paper, f.phase === 'morph' ? veil : veil * f.veilK);
      ctx.fillRect(-4, -4, 4000, 4000);
    }
    if (f.phase === 'morph') {
      const col = mix(A.col, B.col, f.u);
      outline(ctx, f.P);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = darken(col, 0.3);
      ctx.lineWidth = rim;
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else {
      ctx.save();
      outline(ctx, f.P);
      ctx.clip();
      ctx.translate(f.dx, f.dy);
      (shrink ? A : B).draw(ctx);
      ctx.restore();
      outline(ctx, f.P);
      ctx.strokeStyle = alpha(darken(shrink ? A.col : B.col, 0.3), f.rimA);
      ctx.lineWidth = rim;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.restore();
    return { phase: f.phase, done: false };
  }

  return {
    at,
    draw,
    done,
    get dur() { return dur(); },
    kmax: [plan.ka, plan.kb],
  };
}

// -- Contact shadow ------------------------------------------------------------------

const STOPS = 10;

/** 0.32 on a light backdrop, 0.9 on a dark one. */
export function shadowOpacity(c) {
  return luma(c.bgDeep) > 0.5 ? SHADOW_OPACITY.light : SHADOW_OPACITY.dark;
}

/** Default shadow colour: the deep backdrop pushed toward black. */
export function shadowColor(c) {
  return darken(c.bgDeep, 0.7);
}

const GRADS = new WeakMap();

function gradientFor(ctx, R, col, op) {
  let per = GRADS.get(ctx);
  if (!per) { per = new Map(); GRADS.set(ctx, per); }
  const key = R + '|' + col + '|' + op;
  let g = per.get(key);
  if (g) return g;
  if (per.size > 64) per.clear();
  g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  for (let i = 0; i <= STOPS; i++) {
    const r = i / STOPS;
    g.addColorStop(r, alpha(col, op * shadowFalloff(r)));
  }
  per.set(key, g);
  return g;
}

/**
 * Soft contact shadow under a footprint of width w centred on (x, y) (the floor line).
 * o = { flat, soft, lift, k, col } (see the header). Draw it BEFORE the object.
 */
export function contactShadow(ctx, x, y, w, c, o = {}) {
  const sg = shadowGeom(w, o);
  if (!sg) return;
  const { R, sx, a } = sg;
  const flat = o.flat ?? 0.22;
  const col = o.col ?? shadowColor(c);
  const g = gradientFor(ctx, R, col, shadowOpacity(c));
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(x, y + 3);
  ctx.scale(sx, sx * flat);
  ctx.fillStyle = g;
  ctx.fillRect(-R, -R, 2 * R, 2 * R);
  ctx.restore();
}
