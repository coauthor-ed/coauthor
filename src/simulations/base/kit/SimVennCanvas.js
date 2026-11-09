/**
 * SimVennCanvas - the canvas renderer for the Venn spec (SimVennSpec.js), for SimScene scenes. Same spec
 * and options as vennSvg in SimVenn.js: the U box, cushioned rings, region tints mixed from the ring
 * tones, shaded regions, ring label pills (with a count), region tags and counts at the anchors, a
 * focused region, and the shading sweep. Regions are traced as exact arcs (ctx.arc), filled evenodd.
 *
 *   const V = vennSpec({ box, rings: [{ id: 'A', label: 'even' }, ...] });      (design px, 680 x 520)
 *   vennCanvas(ctx, c, V, { shade, shadeTone = 'gold', tones, tags, counts, ringCounts, labels, boxLabel, box, focus, tint })
 *   regionSweepCanvas(ctx, c, V, masks, u, { tone = 'gold', angle = 0, rings = true })   draw after vennCanvas;
 *     u = eased progress 0..1 (drive it from the scene age; busy() while u < 1). At u = 1 shade with vennCanvas.
 *   traceRegion(ctx, V, masks)   beginPath + the regions' outlines (fill or clip with 'evenodd')
 * Tones: series numbers 1..8 or colour keys of c. Type is never below MIN_PX. ASCII only.
 */
import { MIN_PX, pill, mix, alpha, darken, lighten, rr } from './SimLook.js';
import { toneColor } from './SimNumberLineCanvas.js';
import { vennSpec } from './SimVennSpec.js';
import { lookOf } from './lookProfile.js';

export { vennSpec };

const TAU = Math.PI * 2;
const DEF_TONES = [1, 4, 3, 5];
const ringTone = (V, o, i) => { const d = lookOf().seriesDefault ?? DEF_TONES; return o.tones?.[V.rings[i].id] ?? V.rings[i].tone ?? d[i % d.length]; };

/** Resolved colour of a region: its rings' tones mixed (null for mask 0). */
export function regionColorCanvas(c, V, o, mask) {
  const cs = V.rings.map((r, i) => (mask & r.bit ? toneColor(c, ringTone(V, o, i)) : null)).filter(Boolean);
  if (!cs.length) return null;
  let col = cs[0];
  cs.slice(1).forEach((d, k) => { col = mix(col, d, 1 / (k + 2)); });
  return col;
}

/** beginPath, then the outline of every region in masks (fill / clip with 'evenodd'). */
export function traceRegion(ctx, V, masks) {
  ctx.beginPath();
  for (const m of V.masks(masks)) {
    if (!V.region(m)) continue;
    for (const loop of V.loops(m)) {
      loop.forEach((s, k) => {
        if (s.rect) {
          const { x, y, w, h } = s.rect, q = Math.min(s.rect.rx ?? 0, w / 2, h / 2);
          ctx.moveTo(x + q, y);
          ctx.arc(x + w - q, y + q, q, -Math.PI / 2, 0);
          ctx.arc(x + w - q, y + h - q, q, 0, Math.PI / 2);
          ctx.arc(x + q, y + h - q, q, Math.PI / 2, Math.PI);
          ctx.arc(x + q, y + q, q, Math.PI, Math.PI * 1.5);
          ctx.closePath();
          return;
        }
        if (k === 0) ctx.moveTo(s.cx + Math.cos(s.a0) * s.r, s.cy + Math.sin(s.a0) * s.r);
        ctx.arc(s.cx, s.cy, s.r, s.a0, s.a1, s.ccw);
      });
      if (!loop[0]?.rect) ctx.closePath();
    }
  }
}

function rings(ctx, c, V, o, lip) {
  V.rings.forEach((r, i) => {
    const col = toneColor(c, ringTone(V, o, i));
    ctx.lineWidth = 5;
    if (lip) {
      ctx.beginPath(); ctx.arc(r.cx, r.cy + 3, r.r, 0, TAU);
      ctx.strokeStyle = alpha(darken(col, 0.5), 0.4); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(r.cx, r.cy, r.r, 0, TAU);
    ctx.strokeStyle = col; ctx.stroke();
  });
}

/** The diagram (see the header). */
export function vennCanvas(ctx, c, V, o = {}) {
  const B = V.box, S = V.masks(o.shade ?? []), sc = toneColor(c, o.shadeTone ?? 'gold'), tint = o.tint ?? 0.2;
  const focus = o.focus ?? null, anyShade = S.size > 0;
  ctx.save();
  if (o.box !== false) {
    rr(ctx, B.x, B.y + 6, B.w, B.h, B.rx); ctx.fillStyle = mix(c.stroke, c.bgDeep, 0.3); ctx.fill();
    rr(ctx, B.x, B.y, B.w, B.h, B.rx); ctx.fillStyle = c.bgSurface; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = c.stroke; ctx.stroke();
  }
  for (const reg of V.regions()) {
    const m = reg.mask, rc = regionColorCanvas(c, V, o, m);
    let f = null;
    if (S.has(m)) f = mix(c.bgSurface, sc, 0.58);
    else if (rc) f = mix(c.bgSurface, rc, anyShade ? tint * 0.6 : tint);
    if (focus === m && !S.has(m)) f = mix(c.bgSurface, rc ?? c.accent, rc ? 0.42 : 0.16);
    if (!f) continue;
    ctx.globalAlpha = focus != null && focus !== m ? 0.45 : 1;
    traceRegion(ctx, V, m); ctx.fillStyle = f; ctx.fill('evenodd');
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  rings(ctx, c, V, o, true);
  if (focus != null && V.region(focus)) {
    traceRegion(ctx, V, focus);
    ctx.lineWidth = 9; ctx.strokeStyle = alpha(c.bgDeep, 0.35); ctx.stroke();
    ctx.lineWidth = 5; ctx.strokeStyle = c.gold; ctx.stroke();
  }
  if (o.box !== false && o.boxLabel !== false) pill(ctx, c, o.boxLabel ?? 'U', B.x + 26, B.y + 24, { bg: c.raised, ink: c.label, size: 18, display: true });
  if (o.labels !== false) {
    V.rings.forEach((r, i) => {
      const n = o.ringCounts?.[r.id];
      pill(ctx, c, n != null ? `${r.label}  ${n}` : r.label, r.labelAt.x, r.labelAt.y, { bg: toneColor(c, ringTone(V, o, i)), size: 16 });
    });
  }
  const tags = o.tags === true || o.tags === 'short' ? Object.fromEntries(V.regions().map((r) => [r.mask, o.tags === true ? r.name : r.short])) : (o.tags ?? {});
  for (const reg of V.regions()) {
    const tg = tags[reg.mask], n = o.counts?.[reg.mask], a = reg.anchor, both = tg != null && n != null;
    if (tg != null) pill(ctx, c, String(tg), a.x, a.y - (both ? 20 : 0), { bg: c.raised, ink: c.label, size: MIN_PX });
    if (n != null) pill(ctx, c, String(n), a.x, a.y + (both ? 18 : 0), { bg: c.raised, ink: c.label, size: 22, display: true });
  }
  ctx.restore();
}

/** The shading wipe (see the header). */
export function regionSweepCanvas(ctx, c, V, masks, u, o = {}) {
  const sw = V.regionSweep(masks, u, o);
  if (!sw.clip) return;
  const col = toneColor(c, o.tone ?? 'gold');
  ctx.save();
  traceRegion(ctx, V, masks);
  ctx.clip('evenodd');
  if (sw.quad) {
    ctx.beginPath(); sw.quad.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    ctx.fillStyle = mix(c.bgSurface, col, 0.58); ctx.fill();
  }
  if (sw.edge) {
    const e = sw.edge;
    ctx.lineCap = 'round';
    for (const [w, a] of [[16, 0.3], [5, 1]]) {
      ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2);
      ctx.lineWidth = w; ctx.strokeStyle = alpha(lighten(col, 0.5), a); ctx.stroke();
    }
  }
  ctx.restore();
  if (o.rings !== false) { ctx.save(); rings(ctx, c, V, o, false); ctx.restore(); }
}
