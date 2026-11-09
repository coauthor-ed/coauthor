/**
 * SimGeomSpec - the render-agnostic half of SimGeom: the figure (points, circles,
 * stage placement), angle and distance readings, drag handles with constraints,
 * and the area model with its self-checks. No DOM, no canvas. Drawn by
 * SimGeom.js (SVG in the DOM stage) and SimGeomCanvas.js (2D canvas).
 * Degrees: 0 = east, clockwise on screen (y down).
 */
const TAU = Math.PI * 2, RAD = Math.PI / 180;

/** Build a figure; points may be an array or a map id -> [x, y] | { onCircle, angleDeg }. @opts points, circles, place */
export function geomFigure(o = {}) {
  const P = new Map(), C = new Map();
  const pl = o.place ?? { x: 0, y: 0, s: 1 };
  const list = Array.isArray(o.points) ? o.points : Object.entries(o.points ?? {}).map(([id, v]) => (Array.isArray(v) ? { id, x: v[0], y: v[1] } : { id, ...v }));
  for (const c of o.circles ?? []) if (c.id) C.set(c.id, { ...c, radius: c.radius != null ? c.radius * pl.s : undefined });
  for (const p of list.filter((q) => !q.onCircle)) P.set(p.id, { ...p, x: pl.x + p.x * pl.s, y: pl.y + p.y * pl.s });
  const circ = (id) => {
    const c = C.get(id);
    if (!c) throw new Error(`geomFigure: no circle "${id}"`);
    const ctr = P.get(c.center);
    if (!ctr) throw new Error(`geomFigure: circle "${id}" needs a center point`);
    const r = c.radius ?? Math.hypot(P.get(c.through).x - ctr.x, P.get(c.through).y - ctr.y);
    return { x: ctr.x, y: ctr.y, r };
  };
  for (const p of list.filter((q) => q.onCircle)) {
    const cc = circ(p.onCircle);
    P.set(p.id, { ...p, x: cc.x + Math.cos(p.angleDeg * RAD) * cc.r, y: cc.y + Math.sin(p.angleDeg * RAD) * cc.r });
  }
  return {
    pts: P, circles: C,
    pt(id) { const p = P.get(id); if (!p) throw new Error(`geomFigure: no point "${id}"`); return p; },
    circle: circ,
    set(id, xy) { Object.assign(this.pt(id), xy); },
    centre() { const ps = [...P.values()]; return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length }; },
  };
}

/** Interior angle at `at` between rays to `from` and `to`, in degrees. */
export function angleAt(fig, at, from, to) {
  const o = fig.pt(at), a = fig.pt(from), b = fig.pt(to);
  const d = Math.abs(Math.atan2(a.y - o.y, a.x - o.x) - Math.atan2(b.y - o.y, b.x - o.x));
  return Math.min(d, TAU - d) / RAD;
}
export function dist(fig, a, b) { const p = fig.pt(a), q = fig.pt(b); return Math.hypot(q.x - p.x, q.y - p.y); }
/** Drag handles. constrain: { id: circleId | [a, b] }; snapDeg, min/max limit a circle angle. @opts constrain, snapDeg, min, max, r */
export function geomHandles(fig, ids, o = {}) {
  for (const id of ids) fig.pt(id).handle = true;
  return {
    hit(p) {
      let best = null, bd = o.r ?? 36;
      for (const id of ids) { const q = fig.pt(id), d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = id; } }
      return best;
    },
    move(id, p) {
      const k = o.constrain?.[id];
      if (typeof k === 'string') {
        const cc = fig.circle(k);
        let a = Math.atan2(p.y - cc.y, p.x - cc.x) / RAD;
        if (a < 0) a += 360;
        if (o.snapDeg) a = Math.round(a / o.snapDeg) * o.snapDeg;
        if (o.min != null || o.max != null) a = Math.max(o.min ?? 0, Math.min(o.max ?? 360, a));
        fig.set(id, { x: cc.x + Math.cos(a * RAD) * cc.r, y: cc.y + Math.sin(a * RAD) * cc.r, angleDeg: a });
      } else if (Array.isArray(k)) {
        const A = fig.pt(k[0]), B = fig.pt(k[1]), dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / L2));
        fig.set(id, { x: A.x + dx * t, y: A.y + dy * t });
      } else fig.set(id, { x: p.x, y: p.y });
    },
  };
}

/**
 * Area model as DATA: a rectangle split by column and row lengths. Everything a
 * scene prints (the tile count, the caption, the equation) comes from the same
 * numbers the drawing loops over, so a diagram and its caption cannot disagree
 * (the audit found scenes whose loop bound and caption were typed separately).
 *   const m = areaModel({ cols: [3], rows: [5], unit: 'unit tiles' });
 *   m.cells   [{ r, c, w, h, area }]   in figure units, row by row
 *   m.total   sum of all cell areas;   m.width, m.height   the outer lengths
 *   m.count   number of unit squares when every length is a whole number, else null
 *   m.caption()   '15 unit tiles (3 x 5)' - derived, never typed
 *   m.verify()    throws if the cells do not add up to width * height
 */
export function areaModel(o = {}) {
  const cols = o.cols ?? [1], rows = o.rows ?? [1];
  if (![...cols, ...rows].every((v) => Number.isFinite(v) && v > 0)) throw new Error('areaModel: every length must be a positive number');
  const cells = [];
  rows.forEach((h, r) => cols.forEach((w, c) => cells.push({ r, c, w, h, area: w * h })));
  const width = cols.reduce((s, v) => s + v, 0), height = rows.reduce((s, v) => s + v, 0);
  const total = cells.reduce((s, q) => s + q.area, 0);
  const whole = [...cols, ...rows].every(Number.isInteger);
  const m = {
    cols, rows, cells, width, height, total, unit: o.unit ?? 'unit squares',
    count: whole ? total : null,
    caption() {
      const dims = cols.length > 1 || rows.length > 1 ? `${width} x ${height}` : `${cols[0]} x ${rows[0]}`;
      return `${total} ${m.unit} (${dims})`;
    },
    verify() {
      if (Math.abs(total - width * height) > 1e-9) throw new Error(`areaModel: cells add to ${total}, not ${width} x ${height}`);
      return true;
    },
  };
  m.verify();
  return m;
}
