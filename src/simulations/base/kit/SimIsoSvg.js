/** SimIsoSvg.js
 * SimIsoSvg - isometric blocks (recipe R12) for SvgScene and any withClock(DomSimulation): the SimIso
 * three-tone solids as SVG faces in depth order, a contact shadow, a light rim, an explode / assemble
 * driven by the scene clock, and addressable faces (data attributes + pickFace) for highlight and pick.
 * Geometry, bands, sorting and the explode springs are shared with the canvas SimIso.js through
 * SimIsoSpec.js, so a scene ported between the two keeps its maths.
 * Adapted from (MIT; full notices in THIRD_PARTY.md beside the kit LICENSE):
 *   Adapted from anatomy@e6600ff kit/iso-kit.mjs (MIT, (c) 2026 Ryan) - face order, hull under the faces
 *   Adapted from anatomy@e6600ff kit/lathe.mjs (MIT, (c) 2026 Ryan) - the band ladder
 *   Adapted from anatomy@e6600ff examples/raptor-engine/live.js (MIT, (c) 2026 Ryan) - explodeLive (on explode())
 *   Original code: the SVG markup, ladderCss, the live keyed groups and their re-ordering, shadows, highlight.
 *
 * An item is { id, ring, z, h } (world, z up; cuboid() makes unit cubes) plus, all optional:
 *   offset [dx, dy, dz] (world; a move is a translate, the face paths are cached), base (a CSS colour:
 *   var(--sim-*) or tone(n); default tone(1)), topBase (another colour for the top), faces { 'top' |
 *   'side-<edge>': colour } (tint one face), alpha, cls, rim = true, edge (a CSS colour: outline the
 *   silhouette; on unit cubes it draws the grid you count by), edgeW = 1.5, shadow (true or
 *   { z: floor height, k: strength }: a soft footprint under it), convex, exact (z and h change every
 *   frame, e.g. a block cut at a water line: build it uncached, since solidOf rounds z and h to 0.1;
 *   a plain move belongs in offset).
 * Faces carry data-face ('top', 'side-<edge>'; boxRing: side-0 at y, 1 at x + w, 2 at y + d, 3 at x) and
 * data-band (0..3); a solid's group carries data-solid = id. Hit-test with pickFace (SimIsoSpec, re-exported).
 *
 *   ISO_SVG_CSS                        add to css(): faces, the highlight pop (colour: --iso-hi, default
 *                                      var(--sim-accent); set it on a parent), the shadow
 *   ladderCss(base) -> [4 CSS colours] the canvas toneLadder in color-mix (same LADDER_STEPS, sRGB)
 *   rimCss(base) -> CSS colour         the canvas crease rim
 *   pathD(pts, closed = true) -> 'M..Z'
 *   itemSolid(item, P) -> solid        solidOf for an item (cached, at the origin)
 *   solidSvg(item, P, o) -> markup     one solid (a g at its offset)
 *   shadowSvg(item, P) -> markup       its contact shadow ('' when item.shadow is unset)
 *   faceD(item, face, P) -> d | null   a face outline in stage px (for an overlay)
 *   isoSvg(items, P, o) -> markup      a still scene: shadows, solids back to front, o.hi overlay
 *   isoLive(live, key, items, P, o) -> { root, sorted }   the same on the live layer, keyed: per-frame moves
 *                                      only rewrite transforms; groups re-order when depth order changes.
 *                                      o = { hi: { id, face } | { d } | [..], cls, parent }
 *   explodeLive(live, key, order, apart, o) -> controller   explode() stepped by the live clock: pass the
 *                                      goal every pass (flip it and call liveFrame() to reverse mid-move);
 *                                      it asks live.more() until settled. o = explode opts + { start } (the
 *                                      state on its first pass; default apart, i.e. no motion). skip() and
 *                                      reduced motion snap it.
 * Re-exported from SimIsoSpec: fit, fitTurning, iso, isoDelta, depthOf, boxRing, prismRing, cuboid,
 * centreOf, depthSort, faceOf, pickFace, dropIn, dropEnd, footprint, explode, AZIMUTH, ELEVATION.
 * Colours are CSS only (style= fills, since fill attributes cannot take var()). ASCII only.
 */
import { reducedMotion } from './SimAnim.js';
import {
  AZIMUTH, ELEVATION, fit, fitTurning, iso, isoDelta, depthOf, boxRing, prismRing, cuboid, centreOf,
  depthSort, faceOf, pickFace, dropIn, dropEnd, footprint, explode, solidOf, extrude, LADDER_STEPS, RIM,
} from './SimIsoSpec.js';

export {
  AZIMUTH, ELEVATION, fit, fitTurning, iso, isoDelta, depthOf, boxRing, prismRing, cuboid, centreOf,
  depthSort, faceOf, pickFace, dropIn, dropEnd, footprint, explode,
};

export const ISO_SVG_CSS = `
.iso-scene path { stroke-linejoin: round; }
.iso-shadow { fill: color-mix(in srgb, var(--sim-bg-deep) 45%, black); }
.iso-hi { fill: color-mix(in srgb, var(--iso-hi, var(--sim-accent)) 16%, transparent); stroke: var(--iso-hi, var(--sim-accent)); stroke-width: 3.5px;
  stroke-linejoin: round; animation: iso-hi 0.45s var(--look-spring) both; }
@keyframes iso-hi { from { stroke-width: 10px; opacity: 0; } to { stroke-width: 3.5px; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .iso-hi { animation: none; } }
`;

const f1 = (v) => (Math.round(v * 10) / 10).toString();
const pct = (k) => `${f1(k * 100)}%`;
const esc = (s) => String(s).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]);

/** The four band colours of ONE CSS colour (darkest side .. lighter top), as the canvas toneLadder. */
export function ladderCss(base) {
  return LADDER_STEPS.map((k) => (k < 0 ? `color-mix(in srgb, ${base} ${pct(1 + k)}, black)`
    : k > 0 ? `color-mix(in srgb, ${base} ${pct(1 - k)}, white)` : base));
}

/** The light crease rim of a solid of this colour. */
export function rimCss(base) {
  return `color-mix(in srgb, color-mix(in srgb, ${base} ${pct(1 - RIM.lighten)}, white) ${pct(RIM.alpha)}, transparent)`;
}

export function pathD(pts, closed = true) {
  let d = '';
  pts.forEach(([x, y], i) => { d += `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`; });
  return closed ? d + 'Z' : d;
}

export function itemSolid(it, P) {
  const o = it.convex === false ? { convex: false } : {};
  if (!it.exact) return solidOf(it.ring, it.z, it.h, P, o);
  return extrude(it.ring, it.z, it.h, { scale: P.scale, azimuth: P.azimuth ?? AZIMUTH, elevation: P.elevation ?? ELEVATION, origin: [0, 0] }, o);
}

const DEFAULT_BASE = 'var(--sim-series-1)';

/** The faces of a solid at the origin (cached on the solid per look). */
function innerOf(solid, it) {
  const base = it.base ?? DEFAULT_BASE;
  const faces = it.faces ?? null;
  const look = `${base}|${it.topBase ?? ''}|${faces ? JSON.stringify(faces) : ''}|${it.rim === false ? 0 : 1}|${it.edge ?? ''}|${it.edgeW ?? ''}`;
  if (!solid.svg) solid.svg = new Map();
  let m = solid.svg.get(look);
  if (m != null) return m;
  if (solid.svg.size > 16) solid.svg.clear();
  const L = ladderCss(base);
  const tint = (face, band) => (faces && faces[face] ? ladderCss(faces[face])[band] : null);
  m = '';
  if (solid.hull) m += `<path class="iso-hull" d="${pathD(solid.hull)}" style="fill:${L[0]}"/>`;
  for (const s of solid.sides) {
    const face = `side-${s.edge}`;
    m += `<path class="iso-face" data-face="${face}" data-band="${s.band}" d="${pathD(s.pts)}" style="fill:${tint(face, s.band) ?? L[s.band]}"/>`;
  }
  const topFill = tint('top', solid.topBand) ?? (it.topBase ? ladderCss(it.topBase)[solid.topBand] : L[solid.topBand]);
  m += `<path class="iso-face" data-face="top" data-band="${solid.topBand}" d="${pathD(solid.top)}" style="fill:${topFill}"/>`;
  if (it.rim !== false && solid.crease.length) {
    const rim = rimCss(it.topBase ?? base);
    for (const c of solid.crease) m += `<path class="iso-rim" d="${pathD(c, false)}" style="fill:none;stroke:${rim};stroke-width:${RIM.width};stroke-linecap:round"/>`;
  }
  if (it.edge) {
    for (const c of solid.outline) m += `<path class="iso-edge" d="${pathD(c, false)}" style="fill:none;stroke:${it.edge};stroke-width:${it.edgeW ?? 1.5};stroke-linecap:round"/>`;
  }
  solid.svg.set(look, m);
  return m;
}

function placeOf(it, P) {
  const org = P.origin || [0, 0];
  const [dx, dy] = it.offset ? isoDelta(it.offset, P) : [0, 0];
  return `translate(${f1(org[0] + dx)} ${f1(org[1] + dy)})`;
}

/** One solid as a g at its place. o.cls adds a class. */
export function solidSvg(it, P, o = {}) {
  const cls = ['iso-solid', it.cls, o.cls].filter(Boolean).join(' ');
  const op = it.alpha != null && it.alpha < 1 ? ` style="opacity:${it.alpha.toFixed(3)}"` : '';
  return `<g class="${cls}" data-solid="${esc(it.id)}" transform="${placeOf(it, P)}"${op}>${innerOf(itemSolid(it, P), it)}</g>`;
}

/** Shadow geometry: { d, k } or null. Lifting the solid off its floor fades it. */
function shadowOf(it, P) {
  if (!it.shadow || it.alpha === 0) return null;
  const sh = it.shadow === true ? {} : it.shadow;
  const floor = sh.z ?? it.z;
  const o = it.offset ?? [0, 0, 0];
  const lift = Math.max(0, it.z + o[2] - floor);
  const ring = it.ring.map(([x, y]) => [x + o[0], y + o[1]]);
  const pts = footprint(ring, floor, P);
  const k = (sh.k ?? 0.3) * (1 - 0.6 * Math.min(1, lift / 4)) * (it.alpha ?? 1);
  return { d: pathD(pts), k, drop: sh.drop ?? 3 };
}

export function shadowSvg(it, P) {
  const s = shadowOf(it, P);
  return s ? `<path class="iso-shadow" d="${s.d}" transform="translate(0 ${s.drop})" style="opacity:${s.k.toFixed(3)}"/>` : '';
}

/** A face outline in stage px (at the item's offset), or null when it faces away. */
export function faceD(it, face, P) {
  const pts = faceOf(itemSolid(it, P), face);
  if (!pts) return null;
  const org = P.origin || [0, 0];
  const [dx, dy] = it.offset ? isoDelta(it.offset, P) : [0, 0];
  return pathD(pts.map(([x, y]) => [x + org[0] + dx, y + org[1] + dy]));
}

function hiList(items, P, hi) {
  if (!hi) return [];
  const out = [];
  for (const h of Array.isArray(hi) ? hi : [hi]) {
    if (h.d) { out.push({ k: h.key ?? h.d.length + ':' + h.d.slice(0, 24), d: h.d }); continue; }
    const it = items.find((i) => i.id === h.id);
    const d = it ? faceD(it, h.face, P) : null;
    if (d) out.push({ k: `${h.id}|${h.face}`, d });
  }
  return out;
}

/** A still scene: shadows, then solids back to front, then the highlight overlay (o.hi). */
export function isoSvg(items, P, o = {}) {
  let m = `<g class="iso-scene${o.cls ? ' ' + o.cls : ''}">`;
  for (const it of items) m += shadowSvg(it, P);
  for (const it of depthSort(items, P)) if (it.alpha !== 0) m += solidSvg(it, P);
  for (const h of hiList(items, P, o.hi)) m += `<path class="iso-hi" d="${h.d}"/>`;
  return m + '</g>';
}

/** The scene on the live layer, keyed (see the header). Call it on every animate() pass it shows. */
export function isoLive(live, key, items, P, o = {}) {
  const root = live.shape(key, 'g', { cls: `iso-scene${o.cls ? ' ' + o.cls : ''}`, parent: o.parent });
  const shG = live.shape(`${key}|sh`, 'g', { parent: root });
  const soG = live.shape(`${key}|so`, 'g', { parent: root });
  const hiG = live.shape(`${key}|hg`, 'g', { parent: root });
  for (const it of items) {
    const s = shadowOf(it, P);
    if (!s) continue;
    const e = live.shape(`${key}|s|${it.id}`, 'path', { cls: 'iso-shadow', parent: shG });
    live.attrs(e, { d: s.d, transform: `translate(0 ${s.drop})` });
    live.css(e, { opacity: s.k.toFixed(3) });
  }
  const sorted = depthSort(items.filter((it) => it.alpha !== 0), P);
  let prev = null;
  for (const it of sorted) {
    const e = live.shape(`${key}|${it.id}`, 'g', {
      cls: ['iso-solid', it.cls].filter(Boolean).join(' '), parent: soG, html: innerOf(itemSolid(it, P), it),
    });
    live.attrs(e, { transform: placeOf(it, P), 'data-solid': it.id });
    live.css(e, { opacity: it.alpha != null && it.alpha < 1 ? it.alpha.toFixed(3) : null });
    const want = prev ? prev.nextSibling : soG.firstChild;
    if (want !== e) soG.insertBefore(e, want);
    prev = e;
  }
  for (const h of hiList(items, P, o.hi)) live.attrs(live.shape(`${key}|hi|${h.k}`, 'path', { cls: 'iso-hi', parent: hiG }), { d: h.d });
  return { root, sorted };
}

/** explode() on the live clock (see the header). */
export function explodeLive(live, key, order, apart, o = {}) {
  const t = live.t ?? 0;
  const st = live.state(`iso-ex|${key}`, () => ({ ex: explode(order, { ...o, apart: o.start ?? apart }), last: t }));
  const ex = st.ex;
  if (t < st.last) for (const p of ex.parts) if (p.pending) p.pending.at = t;   // the clock restarted
  const dt = Math.max(0, t - st.last);
  st.last = t;
  if (live.skipping || reducedMotion()) { ex.snap(apart); return ex; }
  ex.set(apart, t);
  ex.step(dt, t);
  if (!ex.settled()) live.more();
  return ex;
}
