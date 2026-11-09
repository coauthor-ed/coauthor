/** SimStageSvg.js
 * SimStageSvg - stage bridges ("this becomes that" between two beats) and a soft contact shadow (recipe R14)
 * for SvgScene and any withClock(DomSimulation), on the live layer (SimSvg liveLayer). The canvas twin is
 * SimStage.js; both run on SimStageSpec.js (phases, window zoom, focus-hold, shadow falloff), so they match.
 * Adapted from (MIT; full notices in THIRD_PARTY.md beside the kit LICENSE), through SimStageSpec.js:
 *   cth9191/animate@7e5eb56 plugins/animate/skills/animate/kit/morph.js (MIT, (c) 2026 cth9191) - bridge phases, log window scale
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/transitions.js (MIT, (c) 2026 alchaincyf) - zoomThrough focus-hold
 *   wheresryan22/anatomy@e6600ff kit/iso.css (MIT, (c) 2026 Ryan) - shadow opacity .32 light / .9 dark, 3 px drop
 *   Original code: the SVG layout (clipPath window, slot groups), shadowDefs, shadowTone, the CSS colour mixes.
 *
 * Stage bridge (about 1.2 s; run it on the clock: this.play(br.dur + extra), then draw it in animate):
 *   const br = stageBridgeSvg(A, B, o)   build ONCE per pair and stage size (outlines resampled here)
 *     A, B = { P: closed outline [[x, y], ...] of the bridge object (stage px), col: CSS colour of that object,
 *              svg: markup of the whole stage picture (its own card or backdrop included; keep ids out of it) }
 *     o = { w, h (the stage size: st.W, st.H), d = 0.6, m = 0.2, paper = var(--sim-bg-deep), rim = 3, veil = 0.82,
 *           box = { x, y, w, h, r } (the frame: the veil's rect and the clip of the whole bridge;
 *           default the whole stage; give the card's rounded rect) }
 *   br.draw(live, key, t, { parent }) -> { phase, done }   t = seconds since the bridge started:
 *       shrink  picture A through a window (a clipPath shaped like A's object) shrinking onto the object
 *       morph   the outline becomes B's (pointsToPath of SimMorphSpec.morphPoints), its colour cross-fades
 *               (color-mix), over both pictures fading A -> B under a paper veil
 *       grow    picture B opens out of B's object, which holds at A's spot for 55% of the phase (focus-hold)
 *     before 0 it shows A, after the end B. A picture's markup is parsed once; per frame only attributes move.
 *   br.at(t) { phase, u, k }, br.frame(t) (SimStageSpec.bridgeFrame), br.done(t), br.dur (0 under reduced
 *   motion: a cut to B), br.kmax [ka, kb]
 *
 * Contact shadow (anything standing on a floor, bench or soil line), the same falloff as on canvas:
 *   shadowDefs() -> '<defs>..'   the shared radial gradient; put it ONCE in the page (paint's svg). A bridge's
 *                                live group carries its own copy, so pictures with shadows work inside it.
 *   contactShadowSvg(x, y, w, o) -> markup   soft ellipse under a footprint w centred on (x, y);
 *                                o = { flat = 0.22, soft = 9, lift = 0..1, k = 1 } (SimStage contactShadow)
 *   contactShadowLive(live, key, x, y, w, o) -> ellipse | null   the same on the live layer (a lift that animates)
 *   shadowTone(el) -> k          sets --sv-shadow-k on el: 0.32 on a light backdrop, 0.9 on a dark one (reads
 *                                --sim-bg-deep). Call it in paint() (a theme change repaints); default 0.9.
 */
import { reducedMotion } from './SimAnim.js';
import { luma } from './SimLook.js';
import { pointsToPath } from './SimMorphSpec.js';
import {
  BRIDGE_D, BRIDGE_M, VEIL, SHADOW_OPACITY, bridgeAt, bridgeK, bridgePlan, bridgeFrame, shadowFalloff, shadowGeom,
} from './SimStageSpec.js';

export { BRIDGE_D, BRIDGE_M, VEIL, SHADOW_OPACITY, bridgeAt, bridgeFrame };

const f2 = (v) => v.toFixed(2);
const SHADOW_ID = 'sv-stage-shadow';
const SHADOW_COL = 'color-mix(in srgb, var(--sim-bg-deep) 30%, black)';   // SimStage shadowColor: darken(bgDeep, 0.7)
const rimCol = (col) => `color-mix(in srgb, ${col} 70%, black)`;          // darken(col, 0.3)
let SEQ = 0;

// -- Contact shadow ------------------------------------------------------------------

let DEFS = null;
/** The shared shadow gradient (11 stops of shadowFalloff, colour from the theme). */
export function shadowDefs() {
  if (DEFS) return DEFS;
  let stops = '';
  for (let i = 0; i <= 10; i++) {
    const r = i / 10;
    stops += `<stop offset="${r}" style="stop-color:${SHADOW_COL};stop-opacity:${shadowFalloff(r).toFixed(4)}"/>`;
  }
  DEFS = `<defs><radialGradient id="${SHADOW_ID}">${stops}</radialGradient></defs>`;
  return DEFS;
}

function shadowBox(x, y, w, o) {
  const g = shadowGeom(w, o);
  if (!g) return null;
  return { cx: x, cy: y + 3, rx: g.R * g.sx, ry: g.R * g.sy, op: `calc(var(--sv-shadow-k, ${SHADOW_OPACITY.dark}) * ${g.a.toFixed(4)})` };
}

/** A contact shadow as markup (draw it BEFORE the object). */
export function contactShadowSvg(x, y, w, o = {}) {
  const b = shadowBox(x, y, w, o);
  if (!b) return '';
  return `<ellipse cx="${f2(b.cx)}" cy="${f2(b.cy)}" rx="${f2(b.rx)}" ry="${f2(b.ry)}" style="fill:url(#${SHADOW_ID});opacity:${b.op}"/>`;
}

/** A contact shadow on the live layer (lift may change per frame). */
export function contactShadowLive(live, key, x, y, w, o = {}) {
  const b = shadowBox(x, y, w, o);
  if (!b) return null;
  const e = live.shape(key, 'ellipse', { parent: o.parent });
  live.attrs(e, { cx: f2(b.cx), cy: f2(b.cy), rx: f2(b.rx), ry: f2(b.ry) });
  live.css(e, { fill: `url(#${SHADOW_ID})`, opacity: b.op });
  return e;
}

/** Set --sv-shadow-k on el from the theme's --sim-bg-deep; returns it. */
export function shadowTone(el) {
  let k = SHADOW_OPACITY.dark;
  try {
    const bg = getComputedStyle(el).getPropertyValue('--sim-bg-deep').trim();
    if (bg) k = luma(bg) > 0.5 ? SHADOW_OPACITY.light : SHADOW_OPACITY.dark;
    el.style.setProperty('--sv-shadow-k', String(k));
  } catch (_) { /* headless stub */ }
  return k;
}

// -- Stage bridge ------------------------------------------------------------------

/** Build a bridge from picture A to picture B (see the header). */
export function stageBridgeSvg(A, B, o = {}) {
  const d = o.d ?? BRIDGE_D;
  const m = Math.min(o.m ?? BRIDGE_M, d);
  const w = o.w ?? 680, h = o.h ?? 520;
  const rim = o.rim ?? 3;
  const veil = o.veil ?? VEIL;
  const paper = o.paper ?? 'var(--sim-bg-deep)';
  const box = o.box ?? { x: -4, y: -4, w: w + 8, h: h + 8, r: 0 };
  const plan = bridgePlan(A.P, B.P, w, h, 96);
  const cid = `sv-br-${++SEQ}`;
  const defs = shadowDefs() + `<defs><clipPath id="${cid}"><path/></clipPath>`
    + `<clipPath id="${cid}-box"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"${box.r ? ` rx="${box.r}"` : ''}/></clipPath></defs>`;

  const at = (t) => {
    const s = bridgeAt(t, d, m);
    const k = s.phase === 'shrink' || s.phase === 'before' ? bridgeK(s.phase, s.u, plan.ka) : bridgeK(s.phase, s.u, plan.kb);
    return { phase: s.phase, u: s.u, k };
  };
  const frame = (t) => bridgeFrame(plan, t, d, m);
  const done = (t) => reducedMotion() || t >= 2 * d;

  function draw(live, key, t, o2 = {}) {
    const f = frame(t);
    // A nested svg viewport on the frame box (overflow hidden, in the same user units) plus the rounded clip:
    // the grown window and its rim stay inside the frame, and layout probes see the clipping.
    const root = live.shape(key, 'svg', { parent: o2.parent });
    live.attrs(root, { x: box.x, y: box.y, width: box.w, height: box.h, viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`, 'clip-path': `url(#${cid}-box)` });
    const slot = (name, tag = 'g', html) => live.shape(`${key}|${name}`, tag, { parent: root, html });
    const show = (e, on) => live.css(e, { display: on ? null : 'none' });
    // Fixed slots, made in this order on the first pass and kept, so the stacking never changes.
    const dfs = slot('defs', 'g', defs);
    const gA = slot('A', 'g', A.svg);
    const gB = slot('B', 'g', B.svg);
    const vl = slot('veil', 'rect');
    const mp = slot('morph', 'path');
    const win = slot('win', 'g');
    const wA = live.shape(`${key}|winA`, 'g', { parent: win, html: A.svg });
    const wB = live.shape(`${key}|winB`, 'g', { parent: win, html: B.svg });
    const rm = slot('rim', 'path');
    const plain = f.phase === 'before' || f.phase === 'done';
    const morph = f.phase === 'morph';
    const windowed = !plain && !morph;

    show(gA, f.phase === 'before' || (!plain && veil < 1 && f.fadeB < 1));
    show(gB, f.phase === 'done' || (!plain && veil < 1 && f.fadeB > 0));
    live.css(gB, { opacity: f.phase === 'done' || f.fadeB >= 1 ? null : f.fadeB.toFixed(3) });
    show(vl, !plain);
    if (!plain) {
      live.attrs(vl, { x: box.x, y: box.y, width: box.w, height: box.h, rx: box.r || null });
      live.css(vl, { fill: paper, opacity: veil >= 1 ? '1' : (veil * f.veilK).toFixed(3) });
    }
    show(mp, morph);
    if (morph) {
      const col = f.u <= 0 ? A.col : f.u >= 1 ? B.col : `color-mix(in oklab, ${B.col} ${(f.u * 100).toFixed(1)}%, ${A.col})`;
      live.attrs(mp, { d: pointsToPath(f.P) });
      live.css(mp, { fill: col, stroke: rimCol(col), 'stroke-width': rim, 'stroke-linejoin': 'round' });
    }
    show(win, windowed);
    show(rm, windowed);
    if (windowed) {
      const d0 = pointsToPath(f.P);
      const cp = dfs.querySelector?.('clipPath path');
      if (cp) live.attrs(cp, { d: d0 });
      live.attrs(win, { 'clip-path': `url(#${cid})` });
      show(wA, f.src === 'A');
      show(wB, f.src === 'B');
      live.attrs(f.src === 'A' ? wA : wB, { transform: f.dx || f.dy ? `translate(${f2(f.dx)} ${f2(f.dy)})` : null });
      live.attrs(rm, { d: d0 });
      live.css(rm, { fill: 'none', stroke: rimCol(f.src === 'A' ? A.col : B.col), 'stroke-width': rim, 'stroke-linejoin': 'round', opacity: f.rimA.toFixed(3) });
    }
    return { phase: f.phase, done: f.phase === 'done' };
  }

  return {
    at,
    frame,
    draw,
    done,
    plan,
    get dur() { return reducedMotion() ? 0 : 2 * d; },
    kmax: [plan.ka, plan.kb],
  };
}
