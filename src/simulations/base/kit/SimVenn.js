/**
 * SimVenn - Venn diagrams as SVG in the DOM (SimSvg stage / SvgScene): a universal-set box U, 1-3 cushioned
 * rings, region tints mixed from the ring tones, shaded regions, ring label chips (with an optional count),
 * region name tags and count chips on the overlay, and an animated shading sweep on the live layer.
 * The geometry lives in SimVennSpec.js (re-exported here): build the spec in stage px for the current
 * stage size, so portrait gets its own layout.
 *
 *   const V = vennSpec({ box: { x, y, w, h }, rings: [{ id: 'A', label: 'even' }, { id: 'B', label: 'multiple of 3' }] });
 *   vennSvg(V, o) -> { svg, over }
 *     o.shade      masks to shade: a mask, an array / Set of masks, or an expression ('A-B', "(A|B)'")
 *     o.shadeTone  colour of shaded regions (default 'gold'; a series number or a token name)
 *     o.tones      { [ringId]: series number } (default 1, 4, 3, 5 in ring order; the look's seriesDefault when it has one)
 *     o.tags       true (every region's name) | 'short' (region.short, for narrow stages) | { [mask]: text }
 *     o.counts     { [mask]: number } - count chips at the region anchors (under a tag when both)
 *     o.ringCounts { [ringId]: number } - a count badge inside the ring's label chip
 *     o.labels     false hides the ring label chips;  o.boxLabel ('U'; false hides it);  o.box false: no box
 *     o.focus      a mask: that region outlined and lifted, the others faded (tap-to-read)
 *     o.tint       0..1 strength of the resting region tints (default 0.2)
 *   ringsSvg(V, o) -> svg      just the ring lines (o.tones)
 *   regionSweepSvg(live, key, V, masks, u, o)   the shading wipe on the live layer (SvgScene.animate, this.live):
 *     the regions fill from one side at progress u (ease it first) behind a bright moving front; the ring lines
 *     are redrawn over it. o = { tone = 'gold', angle = 0 (deg; 0 left to right), hatch: false, rings: true }.
 *     Call it on every animate() pass while it should show; at u = 1 paint the shade with vennSvg instead.
 *   VENN_CSS                   overlay CSS (count badge, tags, .vn-sym: body font for set symbols, which
 *                              the display font lacks - add cls 'vn-sym' to a big chip showing them); add it to the scene CSS
 * Hit-test taps with V.regionOf(p) (p from SvgScene pointerDown) and read V.region(mask).name / .sym.
 * Colours are tokens only (var(--sim-*), tone(n), color-mix). ASCII only.
 */
import { esc } from 'simulations/base/SimUi.js';
import { chip, fill, stroke, shade, glossOf, tone as T } from './SimSvg.js';
import { lookOf } from './lookProfile.js';
import { vennSpec, VENN_UNION, VENN_INTER, VENN_MINUS, VENN_PRIME } from './SimVennSpec.js';

export { vennSpec, VENN_UNION, VENN_INTER, VENN_MINUS, VENN_PRIME };

const DEF_TONES = [1, 4, 3, 5];
const col = (t) => (typeof t === 'number' ? T(t) : `var(--sim-${t})`);
const SURF = 'var(--sim-bg-surface)';
const f1 = (v) => (Math.round(v * 10) / 10).toString();

/** The tone (series number or token name) of ring i. */
export function ringTone(V, o, i) { const r = V.rings[i], d = lookOf().seriesDefault ?? DEF_TONES; return o.tones?.[r.id] ?? r.tone ?? d[i % d.length]; }

/** CSS colour for a region: its rings' tones mixed (null for mask 0). */
export function regionColor(V, o, mask) {
  const cs = V.rings.map((r, i) => (mask & r.bit ? col(ringTone(V, o, i)) : null)).filter(Boolean);
  if (!cs.length) return null;
  let c = cs[0];
  cs.slice(1).forEach((d, k) => { c = `color-mix(in oklab, ${c} ${Math.round(100 * (k + 1) / (k + 2))}%, ${d})`; });
  return c;
}

export const VENN_CSS = `
.vn-n { display: inline-block; margin-left: 7px; padding: 0 8px; border-radius: var(--look-pill); background: var(--sim-bg-surface); color: var(--sim-label); font-family: var(--sim-font-display, var(--sim-font)); }
.vn-tag { white-space: normal; text-align: center; max-width: var(--mw, 120px); line-height: 1.1; }
.vn-sym { font-family: var(--sim-font); }
.vn-count { font-family: var(--sim-font-display, var(--sim-font)); min-width: 1.6em; text-align: center; }
`;

export function ringsSvg(V, o = {}) {
  let svg = '';
  V.rings.forEach((r, i) => {
    const c = col(ringTone(V, o, i));
    svg += `<circle cx="${f1(r.cx)}" cy="${f1(r.cy)}" r="${f1(r.r)}" ${stroke(c, 5 * lookOf().rim)}/>`;
  });
  return svg;
}

/** The diagram as SVG + overlay chips (see the header). */
export function vennSvg(V, o = {}) {
  const B = V.box, S = V.masks(o.shade ?? []), sc = col(o.shadeTone ?? 'gold'), tint = Math.round((o.tint ?? 0.2) * 100);
  const focus = o.focus ?? null, anyShade = S.size > 0, L = lookOf();
  let svg = '', over = '';
  if (o.box !== false) {
    if (L.lip) svg += `<rect x="${f1(B.x)}" y="${f1(B.y + 6 * L.lip)}" width="${f1(B.w)}" height="${f1(B.h)}" rx="${B.rx}" ${fill('color-mix(in oklab, var(--sim-stroke) 70%, var(--sim-bg-deep))')}/>`;
    svg += `<rect x="${f1(B.x)}" y="${f1(B.y)}" width="${f1(B.w)}" height="${f1(B.h)}" rx="${B.rx}" ${fill(SURF, `stroke:var(--sim-stroke);stroke-width:${2.5 * L.rim}`)}/>`;
  }
  for (const reg of V.regions()) {
    const m = reg.mask, rc = regionColor(V, o, m), dim = focus != null && focus !== m ? ';opacity:0.45' : '';
    let f = null;
    if (S.has(m)) f = `color-mix(in oklab, ${sc} 58%, ${SURF})`;
    else if (rc) f = `color-mix(in oklab, ${rc} ${anyShade ? Math.round(tint * 0.6) : tint}%, ${SURF})`;
    if (focus === m) f = S.has(m) ? f : `color-mix(in oklab, ${rc ?? 'var(--sim-accent)'} ${rc ? 42 : 16}%, ${SURF})`;
    if (f) svg += `<path d="${reg.path}" ${fill(f, `fill-rule:evenodd${dim}`)}/>`;
  }
  // Ring lines with a soft lip under each (look lip; none at 0).
  if (L.lip) V.rings.forEach((r, i) => {
    const c = col(ringTone(V, o, i));
    svg += `<circle cx="${f1(r.cx)}" cy="${f1(r.cy + 3 * L.lip)}" r="${f1(r.r)}" ${stroke(shade(c, 50), 5, 'opacity:0.4')}/>`;
  });
  svg += ringsSvg(V, o);
  if (focus != null && V.region(focus)) {
    const p = V.region(focus).path;
    svg += `<path d="${p}" ${stroke('var(--sim-bg-deep)', 9, 'fill-rule:evenodd;opacity:0.35')}/><path d="${p}" ${stroke('var(--sim-gold)', 5)}/>`;
  }

  if (o.box !== false && o.boxLabel !== false) over += chip(o.boxLabel ?? 'U', B.x + 26, B.y + 24, { tone: 'plain', size: 'big' });
  if (o.labels !== false) {
    V.rings.forEach((r, i) => {
      const n = o.ringCounts?.[r.id];
      over += chip(esc(r.label) + (n != null ? `<b class="vn-n">${esc(n)}</b>` : ''), r.labelAt.x, r.labelAt.y, { tone: ringTone(V, o, i), math: true });
    });
  }
  const tags = o.tags === true || o.tags === 'short' ? Object.fromEntries(V.regions().map((r) => [r.mask, o.tags === true ? r.name : r.short])) : (o.tags ?? {});
  for (const reg of V.regions()) {
    const m = reg.mask, tg = tags[m], n = o.counts?.[m];
    const a = reg.anchor, both = tg != null && n != null;
    if (tg != null) {
      const mw = Math.max(64, Math.min(150, reg.anchor.room * 2.4));
      over += chip(tg, a.x, a.y - (both ? 20 : 0), { tone: 'plain', size: 'sm', cls: 'vn-tag', math: false }).replace('style="', `style="--mw:${mw.toFixed(0)}px;`);
    }
    if (n != null) over += chip(String(n), a.x, a.y + (both ? 18 : 0), { tone: S.has(m) ? 'plain' : 'plain', size: 'big', cls: 'vn-count' });
  }
  return { svg, over };
}

const uids = new WeakMap();
let uidNext = 1;
const uidOf = (live) => { if (!uids.has(live)) uids.set(live, uidNext++); return uids.get(live); };

/** The shading wipe on the live layer (see the header). */
export function regionSweepSvg(live, key, V, masks, u, o = {}) {
  const sw = V.regionSweep(masks, u, o);
  if (!sw.clip) return null;
  const id = `vnsw${uidOf(live)}-${String(key).replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const c = col(o.tone ?? 'gold');
  const cp = live.shape(`${key}/clip`, 'clipPath', { html: `<path d="${sw.clip}" clip-rule="evenodd"/>` });
  live.attrs(cp, { id });
  const g = live.shape(key, 'g');
  live.attrs(g, { 'clip-path': `url(#${id})` });
  const fp = live.shape(`${key}/fill`, 'path', { parent: g });
  live.attrs(fp, { d: sw.poly || 'M0 0' });
  live.css(fp, { fill: `color-mix(in oklab, ${c} 58%, ${SURF})` });
  if (o.hatch) {
    const b = sw.bbox, step = 14;
    let d = '';
    for (let x = b.x - b.h; x < b.x + b.w; x += step) d += `M${f1(x)} ${f1(b.y + b.h)}L${f1(x + b.h)} ${f1(b.y)}`;
    const cp2 = live.shape(`${key}/clip2`, 'clipPath', { parent: g });
    live.attrs(cp2, { id: `${id}b` });
    const pp = live.shape(`${key}/clip2p`, 'path', { parent: cp2 });
    live.attrs(pp, { d: sw.poly || 'M0 0' });
    const hp = live.shape(`${key}/hatch`, 'path', { parent: g });
    live.attrs(hp, { d, 'clip-path': `url(#${id}b)` });
    live.css(hp, { fill: 'none', stroke: shade(c, 55), 'stroke-width': 3, opacity: 0.5 });
  }
  if (sw.edge) {
    const e = sw.edge;
    for (const [k, w, a] of lookOf().gloss ? [['glow', 16, 0.3], ['edge', 5, 1]] : [['edge', 5, 1]]) {
      const ln = live.shape(`${key}/${k}`, 'line', { parent: g });
      live.attrs(ln, { x1: f1(e.x1), y1: f1(e.y1), x2: f1(e.x2), y2: f1(e.y2) });
      live.css(ln, { stroke: glossOf(c, 50), 'stroke-width': w, 'stroke-linecap': 'round', opacity: a });
    }
  }
  if (o.rings !== false) live.shape(`${key}/rings`, 'g', { html: ringsSvg(V, o) });
  return g;
}
