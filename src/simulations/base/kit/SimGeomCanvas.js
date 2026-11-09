/**
 * SimGeomCanvas - the canvas renderer for the geometry spec (SimGeomSpec.js:
 * geomFigure, angleAt, dist, geomHandles, areaModel). Same figure and options as
 * the SVG renderer geomSvg in SimGeom.js, so a canvas scene gets constructions,
 * angle arcs (with a value chip), right-angle marks, tick and parallel marks and
 * labelled points without a local copy. Type is never below MIN_PX (14).
 *
 *   const fig = geomFigure({ points, circles, place });
 *   geomCanvas(ctx, c, fig, { segments, polygons, angles, rightAngles, parallelMarks, circles, points, labels })
 *     segments: [{ from, to, extend, style: 'dashed', ticks, label, tone }]   polygons: [{ points, fill }]
 *     angles:   [{ at, from, to, label, tone, radius }]   arcs stack outward at a shared vertex
 *     (label may be the string 'auto': the live angle in degrees, e.g. '37 deg')
 *   areaGridCanvas(ctx, c, rect, model | { cols, rows, labels, tones }, { grow: 0..1 })
 *     model from areaModel(): the grid, the tile caption and the equation share one source
 *   hitHandle(geomHandles h, p)  = h.hit(p)   (kept on the spec; use SimDrag for the knob look)
 * Tones: series numbers 1..8, 'primary' | 'success' | 'error' | 'muted', or a colour key. ASCII only.
 */
import { MIN_PX, font, pill, alpha, darken, rr, inkOn } from './SimLook.js';
import { toneColor } from './SimNumberLineCanvas.js';
import { angleAt, dist, areaModel } from './SimGeomSpec.js';
import { lookOf } from './lookProfile.js';

const TAU = Math.PI * 2;
const NAMED = { primary: 's1', success: 'good', error: 'bad', muted: 'labelMuted' };
const col = (c, t, d) => (t == null ? d : typeof t === 'number' ? toneColor(c, t) : c[NAMED[t] ?? t] ?? t);
const norm = (x, y, d = { x: 1, y: 0 }) => { const L = Math.hypot(x, y); return L < 1e-6 ? d : { x: x / L, y: y / L }; };

function stroke(ctx, colr, w, dashed) {
  ctx.strokeStyle = colr; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.setLineDash(dashed ? [9, 8] : []);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function geomCanvas(ctx, c, fig, o = {}) {
  const ink = c.label, ctr = fig.centre();
  ctx.save();
  for (const pg of o.polygons ?? []) {
    const pts = pg.points.map((id) => fig.pt(id));
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
    ctx.fillStyle = alpha(col(c, pg.fill ?? pg.tone, c.s1), 0.24); ctx.fill();
  }
  for (const cd of o.circles ?? []) {
    const cc = cd.id ? fig.circle(cd.id) : (() => { const q = fig.pt(cd.center); return { x: q.x, y: q.y, r: cd.radius ?? dist(fig, cd.center, cd.through) }; })();
    const colr = col(c, cd.tone, ink);
    ctx.beginPath();
    if (cd.startDeg == null) {
      ctx.arc(cc.x, cc.y, cc.r, 0, TAU);
      if (cd.fill) { ctx.fillStyle = alpha(col(c, cd.fill, c.s1), 0.2); ctx.fill(); }
    } else ctx.arc(cc.x, cc.y, cc.r, (cd.startDeg * Math.PI) / 180, (cd.endDeg * Math.PI) / 180);
    stroke(ctx, colr, 4, cd.style === 'dashed');
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
    const colr = col(c, an.tone ?? 2, c.s2);
    ctx.beginPath(); ctx.moveTo(O.x, O.y); ctx.arc(O.x, O.y, r, a, a + d, d < 0); ctx.closePath();
    ctx.fillStyle = alpha(colr, 0.3); ctx.fill();
    ctx.beginPath(); ctx.arc(O.x, O.y, r, a, a + d, d < 0); stroke(ctx, colr, 3.5);
    if (an.label != null) {
      const text = an.label === 'auto' ? Math.round(angleAt(fig, an.at, an.from, an.to)) + ' deg' : String(an.label);
      pill(ctx, c, text, O.x + Math.cos(a + d / 2) * (r + 26), O.y + Math.sin(a + d / 2) * (r + 26), { bg: colr, size: MIN_PX });
    }
  }
  for (const sg of o.segments ?? []) {
    let A = fig.pt(sg.from), B = fig.pt(sg.to);
    const u = norm(B.x - A.x, B.y - A.y), far = 2000, P0 = A, P1 = B;
    if (sg.extend === 'start' || sg.extend === 'both') A = { x: A.x - u.x * far, y: A.y - u.y * far };
    if (sg.extend === 'end' || sg.extend === 'both') B = { x: B.x + u.x * far, y: B.y + u.y * far };
    const colr = col(c, sg.tone, ink);
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); stroke(ctx, colr, 4.5, sg.style === 'dashed');
    const mx = (P0.x + P1.x) / 2, my = (P0.y + P1.y) / 2, ticks = sg.ticks ?? 0;
    for (let i = 0; i < ticks; i++) {
      const off = (i - (ticks - 1) / 2) * 7;
      ctx.beginPath(); ctx.moveTo(mx + u.x * off - u.y * 9, my + u.y * off + u.x * 9); ctx.lineTo(mx + u.x * off + u.y * 9, my + u.y * off - u.x * 9);
      stroke(ctx, colr, 3.5);
    }
    if (sg.label != null) {
      let nx = -u.y, ny = u.x;
      if ((mx - ctr.x) * nx + (my - ctr.y) * ny < 0) { nx = -nx; ny = -ny; }
      pill(ctx, c, String(sg.label), mx + nx * 26, my + ny * 26, { bg: sg.tone != null ? colr : c.stroke, ink: sg.tone != null ? undefined : c.label, size: MIN_PX });
    }
  }
  for (const pm of o.parallelMarks ?? []) {
    const A = fig.pt(pm.from), B = fig.pt(pm.to), a = Math.atan2(B.y - A.y, B.x - A.x), mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    for (let i = 0; i < (pm.count ?? 1); i++) {
      const cx = mx + Math.cos(a) * i * 9, cy = my + Math.sin(a) * i * 9;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a - 0.6) * 11, cy - Math.sin(a - 0.6) * 11); ctx.lineTo(cx, cy); ctx.lineTo(cx - Math.cos(a + 0.6) * 11, cy - Math.sin(a + 0.6) * 11);
      stroke(ctx, ink, 3.5);
    }
  }
  for (const ra of o.rightAngles ?? []) {
    const O = fig.pt(ra.at), u = norm(fig.pt(ra.from).x - O.x, fig.pt(ra.from).y - O.y), v = norm(fig.pt(ra.to).x - O.x, fig.pt(ra.to).y - O.y), s = ra.size ?? 16;
    ctx.beginPath(); ctx.moveTo(O.x + u.x * s, O.y + u.y * s); ctx.lineTo(O.x + (u.x + v.x) * s, O.y + (u.y + v.y) * s); ctx.lineTo(O.x + v.x * s, O.y + v.y * s);
    stroke(ctx, ink, 3);
  }
  const ids = o.points == null || o.points === 'all' ? [...fig.pts.keys()] : o.points;
  for (const id of ids) {
    const p = fig.pt(id);
    if (p.hidden) continue;
    const colr = p.handle ? c.s2 : col(c, p.tone, ink);
    if (p.handle) { ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, TAU); ctx.fillStyle = alpha(colr, 0.25); ctx.fill(); }
    ctx.beginPath(); ctx.arc(p.x, p.y, p.handle ? 9 : 6.5, 0, TAU); ctx.fillStyle = colr; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = c.bgDeep; ctx.stroke();
    if (o.labels === false || p.label === '' || p.label == null) continue;
    const from = p.onCircle ? fig.circle(p.onCircle) : ctr;
    const u = norm(p.x - from.x, p.y - from.y, { x: 0, y: -1 });
    ctx.font = font(c, 800, 20); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = c.bgDeep; ctx.lineJoin = 'round';
    ctx.strokeText(String(p.label), p.x + u.x * 24, p.y + u.y * 24); ctx.fillStyle = ink; ctx.fillText(String(p.label), p.x + u.x * 24, p.y + u.y * 24);
  }
  ctx.restore();
}

/**
 * Area model grid in rect. Pass an areaModel() (preferred: the caption and the
 * drawing share one source) or { cols, rows }. o.labels[r][c] text per cell,
 * o.tones [[..]], o.grow 0..1 pops cells in row by row.
 */
export function areaGridCanvas(ctx, c, rect, model, o = {}) {
  const m = model.cells ? model : areaModel(model);
  const sx = rect.w / m.width, sy = rect.h / m.height;
  const tones = o.tones ?? [[1, 2], [2, 3]];
  const grow = o.grow ?? 1, lip = lookOf().lip;
  let y = rect.y;
  m.rows.forEach((rh, r) => {
    let x = rect.x;
    m.cols.forEach((cw, k) => {
      const w = cw * sx, h = rh * sy, colr = toneColor(c, tones[r % tones.length][k % tones[0].length]);
      const u = Math.max(0, Math.min(1, grow * (m.cells.length + 1) - (r * m.cols.length + k)));
      if (u > 0) {
        const s = 0.6 + 0.4 * u;
        ctx.save(); ctx.globalAlpha = u; ctx.translate(x + w / 2, y + h / 2); ctx.scale(s, s);
        if (lip) { rr(ctx, -w / 2 + 3, -h / 2 + 3 + 3 * lip, w - 6, h - 6, 10); ctx.fillStyle = darken(colr, 0.38); ctx.fill(); }
        rr(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 10); ctx.fillStyle = colr; ctx.fill();
        const lab = o.labels?.[r]?.[k];
        if (lab != null) {
          ctx.font = font(c, 800, Math.max(MIN_PX + 2, Math.min(32, Math.min(w, h) * 0.26)), true);
          ctx.fillStyle = inkOn(c, colr); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(lab), 0, 0);
        }
        ctx.restore();
      }
      x += w;
    });
    y += rh * sy;
  });
}
