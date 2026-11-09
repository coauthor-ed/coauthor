/**
 * SimGeom - geometry figures as SVG in the DOM (SimSvg stage), in the
 * vocabulary of the engine's GeometryDiagram (`diagram` JSON), so authors
 * learn one language. Adds what a static figure cannot: drag a point
 * (constrained to a circle or a segment), live angle/length readings, area
 * models. Build the figure in stage px (`place` maps figure units onto the
 * stage), so lines and labels keep their size in portrait.
 *
 *   const fig = geomFigure({ points: [{ id, x, y, label } | { id, onCircle, angleDeg }], circles: [{ id, center, radius | through }],
 *                            place: { x, y, s } });     // stage = place + s * figure units
 *   fig.pt('A') -> { x, y }    fig.circle('c1') -> { x, y, r }    fig.set('D', { x, y })
 *   geomSvg(fig, { segments, polygons, angles, rightAngles, parallelMarks, circles, points, labels }) -> { svg, over }
 *     segments: [{ from, to, extend: 'none'|'start'|'end'|'both', style: 'dashed', ticks: 0..3, label, tone }]
 *     polygons: [{ points: [ids], fill: 'primary'|'success'|'error'|'muted' | tone }]
 *     angles:   [{ at, from, to, label, tone, radius }]   arcs stack outward at a shared vertex
 *     rightAngles: [{ at, from, to }], parallelMarks: [{ from, to, count }]
 *     circles:  [{ id | center, radius | through, startDeg, endDeg, fill, style, tone }]
 *   const h = geomHandles(fig, ['D'], { constrain: { D: 'c1' | ['A', 'B'] }, snapDeg, min, max });
 *   h.hit(p) -> id | null   h.move(id, p)          (from SvgScene pointerDown / pointerMove)
 *   angleAt(fig, at, from, to) -> degrees (0..180)    dist(fig, a, b) -> px
 *   areaGridSvg(rect, { cols: [a, b], rows: [a, b], labels: [[...], [...]], tones }) -> { svg, over }   area model
 *   GEOM_CSS                                          overlay CSS (area-model labels)
 * Degrees: 0 = east, clockwise on screen (y down), as in GeometryDiagram.
 * Point labels sit outward from the figure's centre, never on a line.
 */
import { esc } from 'simulations/base/SimUi.js';
import { chip, cushionRect, fill, stroke, shade, tone as T } from './SimSvg.js';
import { fracHtml, supHtml } from './SimText.js';

const TAU = Math.PI * 2, RAD = Math.PI / 180;
const NAMED = { primary: 'var(--sim-series-1)', success: 'var(--sim-good)', error: 'var(--sim-bad)', muted: 'var(--sim-label-muted)' };
const col = (t, d) => (t == null ? d : typeof t === 'number' ? T(t) : NAMED[t] ?? `var(--sim-${t})`);

import { geomFigure, angleAt, dist, geomHandles, areaModel } from './SimGeomSpec.js';
export { geomFigure, angleAt, dist, geomHandles, areaModel };

const norm = (x, y, d = { x: 1, y: 0 }) => { const L = Math.hypot(x, y); return L < 1e-6 ? d : { x: x / L, y: y / L }; };
const f1 = (v) => v.toFixed(1);

/** The figure as SVG + overlay chips (see the header). @opts segments, polygons, angles, rightAngles, parallelMarks, circles, points, labels */
export function geomSvg(fig, o = {}) {
  const ink = 'var(--sim-label)', ctr = fig.centre();
  let svg = '', over = '';
  for (const pg of o.polygons ?? []) {
    const pts = pg.points.map((id) => fig.pt(id));
    svg += `<path d="M${pts.map((p) => `${f1(p.x)} ${f1(p.y)}`).join('L')}Z" ${fill(col(pg.fill ?? pg.tone, T(1)), 'opacity:0.24')}/>`;
  }
  for (const cd of o.circles ?? []) {
    const cc = cd.id ? fig.circle(cd.id) : (() => { const c = fig.pt(cd.center); return { x: c.x, y: c.y, r: cd.radius ?? dist(fig, cd.center, cd.through) }; })();
    const c = col(cd.tone, ink), dash = cd.style === 'dashed' ? 'stroke-dasharray:9 8' : '';
    if (cd.startDeg == null) {
      if (cd.fill) svg += `<circle cx="${f1(cc.x)}" cy="${f1(cc.y)}" r="${f1(cc.r)}" ${fill(col(cd.fill, T(1)), 'opacity:0.2')}/>`;
      svg += `<circle cx="${f1(cc.x)}" cy="${f1(cc.y + 2.5)}" r="${f1(cc.r)}" ${stroke(shade(c, 50), 4, 'opacity:0.45;' + dash)}/><circle cx="${f1(cc.x)}" cy="${f1(cc.y)}" r="${f1(cc.r)}" ${stroke(c, 4, dash)}/>`;
    } else {
      const a0 = cd.startDeg * RAD, a1 = cd.endDeg * RAD, big = ((cd.endDeg - cd.startDeg + 360) % 360) > 180 ? 1 : 0;
      svg += `<path d="M${f1(cc.x + Math.cos(a0) * cc.r)} ${f1(cc.y + Math.sin(a0) * cc.r)}A${f1(cc.r)} ${f1(cc.r)} 0 ${big} 1 ${f1(cc.x + Math.cos(a1) * cc.r)} ${f1(cc.y + Math.sin(a1) * cc.r)}" ${stroke(c, 4, dash)}/>`;
    }
  }
  const stack = new Map();
  for (const an of o.angles ?? []) {
    const O = fig.pt(an.at), A = fig.pt(an.from), B = fig.pt(an.to);
    const n = stack.get(an.at) ?? 0; stack.set(an.at, n + 1);
    const r = an.radius ?? 30 + n * 16;
    const a = Math.atan2(A.y - O.y, A.x - O.x);
    let d = Math.atan2(B.y - O.y, B.x - O.x) - a;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    const c = col(an.tone, T(2)), sweep = d > 0 ? 1 : 0;
    const p0 = `${f1(O.x + Math.cos(a) * r)} ${f1(O.y + Math.sin(a) * r)}`, p1 = `${f1(O.x + Math.cos(a + d) * r)} ${f1(O.y + Math.sin(a + d) * r)}`;
    svg += `<path d="M${f1(O.x)} ${f1(O.y)}L${p0}A${r} ${r} 0 0 ${sweep} ${p1}Z" ${fill(c, 'opacity:0.3')}/><path d="M${p0}A${r} ${r} 0 0 ${sweep} ${p1}" ${stroke(c, 3.5)}/>`;
    if (an.label != null) over += chip(an.label, O.x + Math.cos(a + d / 2) * (r + 22), O.y + Math.sin(a + d / 2) * (r + 22), { tone: an.tone ?? 2, size: 'sm' });
  }
  for (const sg of o.segments ?? []) {
    let A = fig.pt(sg.from), B = fig.pt(sg.to);
    const u = norm(B.x - A.x, B.y - A.y), far = 2000, P0 = A, P1 = B;
    if (sg.extend === 'start' || sg.extend === 'both') A = { x: A.x - u.x * far, y: A.y - u.y * far };
    if (sg.extend === 'end' || sg.extend === 'both') B = { x: B.x + u.x * far, y: B.y + u.y * far };
    const c = col(sg.tone, ink), dash = sg.style === 'dashed' ? 'stroke-dasharray:9 8' : '';
    svg += `<line x1="${f1(A.x)}" y1="${f1(A.y + 2.5)}" x2="${f1(B.x)}" y2="${f1(B.y + 2.5)}" ${stroke(shade(c, 50), 4.5, 'opacity:0.45;' + dash)}/><line x1="${f1(A.x)}" y1="${f1(A.y)}" x2="${f1(B.x)}" y2="${f1(B.y)}" ${stroke(c, 4.5, dash)}/>`;
    const mx = (P0.x + P1.x) / 2, my = (P0.y + P1.y) / 2;
    for (let i = 0; i < (sg.ticks ?? 0); i++) {
      const off = (i - ((sg.ticks ?? 0) - 1) / 2) * 7;
      svg += `<line x1="${f1(mx + u.x * off - u.y * 9)}" y1="${f1(my + u.y * off + u.x * 9)}" x2="${f1(mx + u.x * off + u.y * 9)}" y2="${f1(my + u.y * off - u.x * 9)}" ${stroke(c, 3.5)}/>`;
    }
    if (sg.label != null) {
      let nx = -u.y, ny = u.x;
      if ((mx - ctr.x) * nx + (my - ctr.y) * ny < 0) { nx = -nx; ny = -ny; }
      over += chip(sg.label, mx + nx * 24, my + ny * 24, { tone: sg.tone ?? 'plain', size: 'sm' });
    }
  }
  for (const pm of o.parallelMarks ?? []) {
    const A = fig.pt(pm.from), B = fig.pt(pm.to), a = Math.atan2(B.y - A.y, B.x - A.x), mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    for (let i = 0; i < (pm.count ?? 1); i++) {
      const cx = mx + Math.cos(a) * i * 9, cy = my + Math.sin(a) * i * 9;
      svg += `<path d="M${f1(cx - Math.cos(a - 0.6) * 11)} ${f1(cy - Math.sin(a - 0.6) * 11)}L${f1(cx)} ${f1(cy)}L${f1(cx - Math.cos(a + 0.6) * 11)} ${f1(cy - Math.sin(a + 0.6) * 11)}" ${stroke(ink, 3.5)}/>`;
    }
  }
  for (const ra of o.rightAngles ?? []) {
    const O = fig.pt(ra.at), u = norm(fig.pt(ra.from).x - O.x, fig.pt(ra.from).y - O.y), v = norm(fig.pt(ra.to).x - O.x, fig.pt(ra.to).y - O.y), s = ra.size ?? 16;
    svg += `<path d="M${f1(O.x + u.x * s)} ${f1(O.y + u.y * s)}L${f1(O.x + (u.x + v.x) * s)} ${f1(O.y + (u.y + v.y) * s)}L${f1(O.x + v.x * s)} ${f1(O.y + v.y * s)}" ${stroke(ink, 3)}/>`;
  }
  const ids = o.points == null || o.points === 'all' ? [...fig.pts.keys()] : o.points;
  for (const id of ids) {
    const p = fig.pt(id);
    if (p.hidden) continue;
    const c = p.handle ? T(2) : col(p.tone, ink);
    if (p.handle) svg += `<g class="sv-drag"><circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="18" class="sv-breathe" ${fill(c, 'opacity:0.25')}/>`;
    svg += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${p.handle ? 9 : 6.5}" ${fill(c, 'stroke:var(--sim-bg-deep);stroke-width:3')}/>` + (p.handle ? '</g>' : '');
    if (o.labels === false || p.label === '') continue;
    const from = p.onCircle ? fig.circle(p.onCircle) : ctr;
    const u = norm(p.x - from.x, p.y - from.y, { x: 0, y: -1 });
    svg += `<text x="${f1(p.x + u.x * 24)}" y="${f1(p.y + u.y * 24 + 8)}" text-anchor="middle" style="fill:${ink};font-size:22px;paint-order:stroke;stroke:var(--sim-bg-deep);stroke-width:6px;stroke-linejoin:round;font-family:var(--sim-font-display, var(--sim-font))">${esc(p.label ?? id)}</text>`;
  }
  return { svg, over };
}

const MATH = ['frac', 'sup'];
const labelHtml = (lab) => {
  const one = (p) => (Array.isArray(p) && MATH.includes(p[0]) ? (p[0] === 'frac' ? fracHtml(p[1], p[2]) : supHtml(p[1], p[2])) : esc(p));
  return Array.isArray(lab) && MATH.includes(lab[0]) ? one(lab) : Array.isArray(lab) ? lab.map(one).join('') : esc(lab);
};

/** Area model: rect split by cols/rows lengths; labels[r][c] = text or ['sup', 'a', 2] etc. @opts cols, rows, labels, tones */
export function areaGridSvg(rect, o = {}) {
  const cols = o.cols ?? [1], rows = o.rows ?? [1];
  const sx = rect.w / cols.reduce((s, v) => s + v, 0), sy = rect.h / rows.reduce((s, v) => s + v, 0);
  const tones = o.tones ?? [[1, 2], [2, 3]];
  let svg = '', over = '', y = rect.y;
  rows.forEach((rh, r) => {
    let x = rect.x;
    cols.forEach((cw, k) => {
      const w = cw * sx, h = rh * sy, t = tones[r % tones.length][k % tones[0].length];
      svg += cushionRect(+(x + 3).toFixed(1), +(y + 3).toFixed(1), +(w - 6).toFixed(1), +(h - 6).toFixed(1), 10, T(t), { cls: 'sv-pop', style: `--d:${(r + k) * 0.12}s` });
      const lab = o.labels?.[r]?.[k];
      if (lab != null) over += `<span class="gm-cell sv-pop" style="left:${x + w / 2}px;top:${y + h / 2}px;font-size:${Math.min(32, Math.max(18, Math.min(w, h) * 0.26)).toFixed(0)}px;color:var(--sim-ink-on-${t}, var(--sim-bg-deep));--d:${(r + k) * 0.12 + 0.2}s">${labelHtml(lab)}</span>`;
      x += w;
    });
    y += rh * sy;
  });
  return { svg, over };
}

/** Overlay CSS (area-model labels). Add it to the scene CSS. */
export const GEOM_CSS = `
.gm-cell { position: absolute; transform: translate(-50%, -50%); font-weight: 800; font-family: var(--sim-font-display, var(--sim-font)); line-height: 1; white-space: nowrap; }
`;
