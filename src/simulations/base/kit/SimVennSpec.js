/**
 * SimVennSpec - the render-agnostic half of SimVenn: a universal-set box U with 1-3 rings (up to 4 with
 * explicit centres), exact region outlines built from circle arcs, region hit-tests, label anchors, chip
 * slots inside a region, set expressions to region masks, and the geometry of a region shading sweep.
 * No DOM, no canvas. Drawn by SimVenn.js (SVG in the DOM stage) and SimVennCanvas.js (2D canvas).
 *
 *   const V = vennSpec({ box: { x, y, w, h, rx }, rings: [{ id: 'A', label: 'even', cx?, cy?, r?, labelDeg? }],
 *                        pad = 26, labelRoom = 34, overlap = 0.42, axis: 'auto' | 'x' | 'y', anchors: { [mask]: {x, y} } })
 *     Auto layout (no cx on any ring): 1 ring centred; 2 rings side by side (stacked when the box is tall:
 *     axis 'auto'); 3 rings in a triangle (A upper left, B upper right, C below). overlap 0 = rings touch,
 *     1 = rings coincide (a slider for "how much do they share"). Explicit rings: give cx, cy, r on every ring
 *     (a subset ring may sit wholly inside another; regions with no area are left out of regions()).
 *   Masks: bit i is ring i (A = 1, B = 2, C = 4); 0 = in U but in no ring; regionOf() is null outside U.
 *   V.rings [{ id, label, cx, cy, r, bit, labelAt: { x, y } }]   V.ring(id)   V.bit(id)   V.n   V.box
 *   V.regionOf(p) -> mask | null          V.tally(points) -> { [mask]: count }
 *   V.regions() -> [{ mask, name, short, expr, sym, path, anchor, area, bbox }]   non-empty regions, mask order
 *     name: words ('only even', 'both', 'neither', 'A and B only', 'all three', 'none')
 *     short: a narrow tag (3 rings: 'A, B' for 'A and B only'; else the name)
 *     expr: ASCII set expression ('A-B', '(A&B)-C', "(A|B)'"), sym: the same with set symbols
 *     path: SVG path d (fill-rule evenodd; also Path2D(d)), anchor: the roomiest point, area: px^2
 *   V.region(mask) -> that entry or null   V.regionPath(masks) -> d (several regions joined; evenodd)
 *   V.loops(mask) -> [[{ cx, cy, r, a0, a1, ccw } | { rect: { x, y, w, h, rx } }]]   the outline as arcs
 *   V.ringPath(id) -> d of the circle
 *   V.slots(mask, n, { r = 16, gap = 6, from }) -> [{ x, y }] (+ .r, the radius used; shrunk if n do not fit)
 *     hex-packed round the anchor (or from), no overlap, every disc wholly inside the region; deterministic
 *   V.exprMask(expr) -> Set<mask>   union | + \u222a, intersection & * \u2229, difference - \u2212 \\ \u2216,
 *     complement postfix ' \u2032 \u2019 \u1d9c or prefix ~ ! \u00ac, U / \u03be universe, \u2205 / 0 empty,
 *     ids are the ring ids, brackets nest. Binding: complement, then intersection, then union and difference
 *     left to right (so A|B-C is (A|B)-C). Throws on an unknown name.
 *   V.masks(x) -> Set<mask>   x: a mask, an array or Set of masks, or an expression string
 *   V.regionSweep(masks, u, { angle = 0 }) -> { clip, poly, quad, edge: { x1, y1, x2, y2 }, bbox }
 *     a shading wipe over the regions: clip = their outline (evenodd), poly = the swept part of their
 *     bounding box at progress u (0..1, ease it first; quad: its 4 corners [x, y]), edge = the moving front. angle in degrees, 0 = left
 *     to right, 90 = top to bottom.
 * Angles: 0 = east, clockwise on screen (y down), as in SimGeom. ASCII only (glyphs as \u escapes).
 */
const TAU = Math.PI * 2, RAD = Math.PI / 180;
const f2 = (v) => (Math.round(v * 100) / 100).toString();

export const VENN_UNION = '\u222a', VENN_INTER = '\u2229', VENN_MINUS = '\u2212', VENN_PRIME = '\u2032';

function autoRings(rs, box, o) {
  const pad = o.pad ?? 26, lab = o.labelRoom ?? 34, k = Math.max(0, Math.min(0.95, o.overlap ?? (rs.length === 3 ? 0.4 : 0.42)));
  const n = rs.length;
  const tall = o.axis === 'y' || (o.axis !== 'x' && box.h > box.w * 1.12);
  const downLab = n === 3 || (n === 2 && tall);
  const ix = box.x + pad, iw = box.w - 2 * pad, iy = box.y + pad + lab, ih = box.h - 2 * pad - lab - (downLab ? lab : 0);
  const mx = ix + iw / 2, my = iy + ih / 2;
  if (n === 1) {
    const r = Math.min(iw, ih) / 2;
    return [{ cx: mx, cy: my, r, labelDeg: -90 }];
  }
  if (n === 2) {
    const span = 2 * (2 - k); // extent along the axis in radii (d = 2r(1 - k))
    if (tall) {
      const r = Math.min(iw / 2, ih / span), d = 2 * r * (1 - k);
      return [{ cx: mx, cy: my - d / 2, r, labelDeg: -90 }, { cx: mx, cy: my + d / 2, r, labelDeg: 90 }];
    }
    const r = Math.min(iw / span, ih / 2), d = 2 * r * (1 - k);
    return [{ cx: mx - d / 2, cy: my, r, labelDeg: -128 }, { cx: mx + d / 2, cy: my, r, labelDeg: -52 }];
  }
  // 3: centres on an equilateral triangle of side d about the centroid; extent w = d + 2r, h = d*sqrt3/2 + 2r.
  const q = 2 * (1 - k);                 // d in radii (k = 0.4 gives d = 1.2 r)
  const r = Math.min(iw / (q + 2), ih / (q * Math.sqrt(3) / 2 + 2)), d = q * r, R = d / Math.sqrt(3);
  const cy0 = my - R / 4; // the triangle's extent (-R/2 - r .. R + r) centred in the box
  return [
    { cx: mx + Math.cos(210 * RAD) * R, cy: cy0 + Math.sin(210 * RAD) * R, r, labelDeg: -132 },
    { cx: mx + Math.cos(330 * RAD) * R, cy: cy0 + Math.sin(330 * RAD) * R, r, labelDeg: -48 },
    { cx: mx, cy: cy0 + R, r, labelDeg: 90 },
  ];
}

function joinWords(a) { return a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`; }

/** Build a Venn spec (see the header). */
export function vennSpec(o = {}) {
  const box = { x: 0, y: 0, w: 640, h: 420, rx: 18, ...(o.box ?? {}) };
  const src = o.rings ?? [{ id: 'A' }, { id: 'B' }];
  if (!src.length || src.length > 4) throw new Error('vennSpec: 1 to 4 rings');
  const explicit = src.every((r) => r.cx != null && r.cy != null && r.r != null);
  if (!explicit && src.length > 3) throw new Error('vennSpec: auto layout covers 1 to 3 rings; give cx, cy, r for 4');
  const auto = explicit ? null : autoRings(src, box, o);
  const n = src.length;
  const rings = src.map((s, i) => {
    const g = explicit ? { cx: s.cx, cy: s.cy, r: s.r } : auto[i];
    return { id: String(s.id ?? 'ABCD'[i]), label: s.label ?? String(s.id ?? 'ABCD'[i]), tone: s.tone, cx: g.cx, cy: g.cy, r: g.r, bit: 1 << i, labelDeg: s.labelDeg ?? g.labelDeg };
  });
  const gx = rings.reduce((s, r) => s + r.cx, 0) / n, gy = rings.reduce((s, r) => s + r.cy, 0) / n;
  for (const r of rings) {
    let a = r.labelDeg;
    if (a == null) {
      const dx = r.cx - gx, dy = r.cy - gy;
      if (Math.hypot(dx, dy) < 1) a = -90;
      else { const t = Math.atan2(dy, dx); a = Math.sin(t) > 0.5 ? t / RAD : Math.atan2(Math.sin(t) - 1, Math.cos(t)) / RAD; }
    }
    r.labelDeg = a;
    const gap = o.labelGap ?? 20;
    r.labelAt = { x: r.cx + Math.cos(a * RAD) * (r.r + gap), y: r.cy + Math.sin(a * RAD) * (r.r + gap) };
  }
  const byId = new Map(rings.map((r) => [r.id, r]));
  const FULL = (1 << n) - 1;

  const inBox = (p) => p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
  const maskAt = (x, y) => { let m = 0; for (const r of rings) if ((x - r.cx) ** 2 + (y - r.cy) ** 2 < r.r * r.r) m |= r.bit; return m; };

  // -- Arcs: each circle cut at its crossings with the others; each arc knows which other rings hold it.
  const cuts = rings.map(() => []);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const A = rings[i], B = rings[j], dx = B.cx - A.cx, dy = B.cy - A.cy, d = Math.hypot(dx, dy);
    if (d < 1e-6 || d >= A.r + B.r - 1e-6 || d <= Math.abs(A.r - B.r) + 1e-6) continue;
    const a = (A.r * A.r - B.r * B.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A.r * A.r - a * a));
    const px = A.cx + (a * dx) / d, py = A.cy + (a * dy) / d;
    for (const s of [1, -1]) {
      const x = px - (s * h * dy) / d, y = py + (s * h * dx) / d;
      cuts[i].push(Math.atan2(y - A.cy, x - A.cx));
      cuts[j].push(Math.atan2(y - B.cy, x - B.cx));
    }
  }
  const arcs = [];
  rings.forEach((R, i) => {
    const t = [...new Set(cuts[i].map((v) => Math.round(((v + TAU) % TAU) * 1e6) / 1e6))].sort((p, q) => p - q);
    const spans = t.length ? t.map((a, k) => [a, k + 1 < t.length ? t[k + 1] : t[0] + TAU]) : [[0, TAU]];
    for (const [a0, a1] of spans) {
      const am = (a0 + a1) / 2, mx = R.cx + Math.cos(am) * R.r, my = R.cy + Math.sin(am) * R.r;
      const other = maskAt(mx, my) & ~R.bit;
      arcs.push({ i, a0, a1, full: !t.length, other, P: pt(R, a0), Q: pt(R, a1) });
    }
  });
  function pt(R, a) { return { x: R.cx + Math.cos(a) * R.r, y: R.cy + Math.sin(a) * R.r }; }

  const loopCache = new Map();
  function loops(mask) {
    if (loopCache.has(mask)) return loopCache.get(mask);
    const mine = arcs.filter((a) => a.other === (mask & ~rings[a.i].bit));
    const out = [];
    if (mask === 0) out.push([{ rect: { x: box.x, y: box.y, w: box.w, h: box.h, rx: box.rx ?? 0 } }]);
    const used = new Set(), close = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.75;
    for (const a of mine) {
      if (used.has(a)) continue;
      used.add(a);
      const R = rings[a.i];
      if (a.full) { out.push([{ cx: R.cx, cy: R.cy, r: R.r, a0: 0, a1: TAU, ccw: false }]); continue; }
      const loop = [{ cx: R.cx, cy: R.cy, r: R.r, a0: a.a0, a1: a.a1, ccw: false }];
      const start = a.P;
      let end = a.Q, guard = 0;
      while (!close(end, start) && guard++ < 16) {
        const nx = mine.find((b) => !used.has(b) && !b.full && (close(b.P, end) || close(b.Q, end)));
        if (!nx) break;
        used.add(nx);
        const S = rings[nx.i];
        if (close(nx.P, end)) { loop.push({ cx: S.cx, cy: S.cy, r: S.r, a0: nx.a0, a1: nx.a1, ccw: false }); end = nx.Q; }
        else { loop.push({ cx: S.cx, cy: S.cy, r: S.r, a0: nx.a1, a1: nx.a0, ccw: true }); end = nx.P; }
      }
      out.push(loop);
    }
    loopCache.set(mask, out);
    return out;
  }

  function loopD(loop) {
    let d = '';
    for (const [k, s] of loop.entries()) {
      if (s.rect) {
        const { x, y, w, h } = s.rect, q = Math.min(s.rect.rx ?? 0, w / 2, h / 2);
        d += q > 0
          ? `M${f2(x + q)} ${f2(y)}H${f2(x + w - q)}A${f2(q)} ${f2(q)} 0 0 1 ${f2(x + w)} ${f2(y + q)}V${f2(y + h - q)}A${f2(q)} ${f2(q)} 0 0 1 ${f2(x + w - q)} ${f2(y + h)}H${f2(x + q)}A${f2(q)} ${f2(q)} 0 0 1 ${f2(x)} ${f2(y + h - q)}V${f2(y + q)}A${f2(q)} ${f2(q)} 0 0 1 ${f2(x + q)} ${f2(y)}Z`
          : `M${f2(x)} ${f2(y)}H${f2(x + w)}V${f2(y + h)}H${f2(x)}Z`;
        continue;
      }
      const P = { x: s.cx + Math.cos(s.a0) * s.r, y: s.cy + Math.sin(s.a0) * s.r };
      if (k === 0) d += `M${f2(P.x)} ${f2(P.y)}`;
      const span = Math.abs(s.a1 - s.a0), sweep = s.ccw ? 0 : 1;
      if (span > TAU - 1e-6) {
        const H = { x: s.cx - Math.cos(s.a0) * s.r, y: s.cy - Math.sin(s.a0) * s.r };
        d += `A${f2(s.r)} ${f2(s.r)} 0 1 ${sweep} ${f2(H.x)} ${f2(H.y)}A${f2(s.r)} ${f2(s.r)} 0 1 ${sweep} ${f2(P.x)} ${f2(P.y)}`;
      } else {
        const Q = { x: s.cx + Math.cos(s.a1) * s.r, y: s.cy + Math.sin(s.a1) * s.r };
        d += `A${f2(s.r)} ${f2(s.r)} 0 ${span > Math.PI ? 1 : 0} ${sweep} ${f2(Q.x)} ${f2(Q.y)}`;
      }
    }
    return d + (loop[0]?.rect ? '' : 'Z');
  }

  // -- Sampling: area, bbox and the roomiest point of every region.
  const clearance = (x, y, m) => {
    let c = Math.min(x - box.x, box.x + box.w - x, y - box.y, box.y + box.h - y);
    for (const r of rings) c = Math.min(c, Math.abs(Math.hypot(x - r.cx, y - r.cy) - r.r));
    if (m === 0) { // keep the neither-anchor off the U chip and the label band
      const lab = o.labelRoom ?? 34, pad = o.pad ?? 26;
      c = Math.min(c, Math.hypot(x - box.x - 30, y - box.y - 24) - 44, y - box.y - pad - lab * 0.5);
      for (const r of rings) c = Math.min(c, Math.hypot(x - r.labelAt.x, y - r.labelAt.y) - 34);
    }
    return c;
  };
  let sampled = null;
  function sample() {
    if (sampled) return sampled;
    const step = Math.max(2, Math.sqrt((box.w * box.h) / 26000));
    const S = new Map();
    for (let y = box.y + step / 2; y < box.y + box.h; y += step) for (let x = box.x + step / 2; x < box.x + box.w; x += step) {
      const m = maskAt(x, y);
      let s = S.get(m);
      if (!s) { s = { n: 0, x0: x, y0: y, x1: x, y1: y, best: -1, ax: x, ay: y }; S.set(m, s); }
      s.n++; s.x0 = Math.min(s.x0, x); s.x1 = Math.max(s.x1, x); s.y0 = Math.min(s.y0, y); s.y1 = Math.max(s.y1, y);
      const c = clearance(x, y, m);
      if (c > s.best + 1e-9) { s.best = c; s.ax = x; s.ay = y; }
    }
    sampled = { S, step };
    return sampled;
  }

  const nameOf = (m) => {
    const ins = rings.filter((r) => m & r.bit), outs = rings.filter((r) => !(m & r.bit));
    if (n === 1) return m ? rings[0].label : 'outside';
    if (!ins.length) return n === 2 ? 'neither' : 'none';
    if (ins.length === 1) return `only ${ins[0].label}`;
    if (!outs.length) return n === 2 ? 'both' : n === 3 ? 'all three' : 'all';
    return `${joinWords(ins.map((r) => r.label))} only`;
  };
  const shortOf = (m) => {
    const ins = rings.filter((r) => m & r.bit);
    return n < 3 || ins.length < 2 ? nameOf(m) : ins.map((r) => r.id).join(', ');
  };
  const exprOf = (m, sym) => {
    const U = sym ? ` ${VENN_UNION} ` : '|', I = sym ? ` ${VENN_INTER} ` : '&', M = sym ? ` ${VENN_MINUS} ` : '-', P = sym ? VENN_PRIME : "'";
    const ins = rings.filter((r) => m & r.bit).map((r) => r.id), outs = rings.filter((r) => !(m & r.bit)).map((r) => r.id);
    if (!ins.length) return outs.length === 1 ? `${outs[0]}${P}` : `(${outs.join(U)})${P}`;
    if (!outs.length) return ins.join(I);
    const a = ins.length > 1 ? `(${ins.join(I)})` : ins[0], b = outs.length > 1 ? `(${outs.join(U)})` : outs[0];
    return `${a}${M}${b}`;
  };

  let regs = null;
  const V = {
    n, box, rings, FULL,
    ring(id) { const r = byId.get(id); if (!r) throw new Error(`vennSpec: no ring "${id}" (rings: ${rings.map((q) => q.id).join(', ')})`); return r; },
    bit(id) { return V.ring(id).bit; },
    regionOf(p) { return inBox(p) ? maskAt(p.x, p.y) : null; },
    tally(points) { const t = {}; for (const p of points) { const m = V.regionOf(p); if (m != null) t[m] = (t[m] ?? 0) + 1; } return t; },
    loops,
    ringPath(id) { const r = V.ring(id); return loopD([{ cx: r.cx, cy: r.cy, r: r.r, a0: 0, a1: TAU, ccw: false }]); },
    regions() {
      if (regs) return regs;
      const { S, step } = sample();
      regs = [];
      for (let m = 0; m <= FULL; m++) {
        const s = S.get(m);
        if (!s || !s.n) continue;
        const an = o.anchors?.[m] ?? { x: s.ax, y: s.ay };
        regs.push({
          mask: m, name: nameOf(m), short: shortOf(m), expr: exprOf(m, false), sym: exprOf(m, true),
          path: loops(m).map(loopD).join(''), anchor: { x: an.x, y: an.y, room: s.best }, area: s.n * step * step,
          bbox: { x: s.x0 - step, y: s.y0 - step, w: s.x1 - s.x0 + 2 * step, h: s.y1 - s.y0 + 2 * step },
        });
      }
      return regs;
    },
    region(m) { return V.regions().find((r) => r.mask === m) ?? null; },
    regionPath(x) { return [...V.masks(x)].map((m) => V.region(m)?.path ?? '').join(''); },
    masks(x) {
      if (typeof x === 'string') return V.exprMask(x);
      if (typeof x === 'number') return new Set([x]);
      return new Set(x ?? []);
    },
    exprMask(expr) { return parseExpr(String(expr), rings, FULL); },

    slots(mask, count, so = {}) {
      const reg = V.region(mask);
      if (!reg || count <= 0) return Object.assign([], { r: so.r ?? 16 });
      const from = so.from ?? reg.anchor, gap = so.gap ?? 6;
      let r = so.r ?? 16;
      for (let tries = 0; tries < 8; tries++, r *= 0.88) {
        const s = 2 * r + gap, hy = (s * Math.sqrt(3)) / 2, b = reg.bbox, got = [];
        const j0 = Math.floor((b.y - from.y) / hy) - 1, j1 = Math.ceil((b.y + b.h - from.y) / hy) + 1;
        for (let j = j0; j <= j1; j++) {
          const y = from.y + j * hy, off = (j & 1) * s / 2;
          const i0 = Math.floor((b.x - from.x - off) / s) - 1, i1 = Math.ceil((b.x + b.w - from.x - off) / s) + 1;
          for (let i = i0; i <= i1; i++) {
            const x = from.x + off + i * s;
            if (maskAt(x, y) !== mask || !inBox({ x, y })) continue;
            let c = Math.min(x - box.x, box.x + box.w - x, y - box.y, box.y + box.h - y);
            for (const q of rings) c = Math.min(c, Math.abs(Math.hypot(x - q.cx, y - q.cy) - q.r));
            if (mask === 0) { // keep clear of the U chip and the ring label chips
              c = Math.min(c, Math.hypot(x - box.x - 30, y - box.y - 24) - 30 - r);
              for (const q of rings) if (Math.abs(x - q.labelAt.x) < 84 + r && Math.abs(y - q.labelAt.y) < 18 + r) c = -1;
            }
            if (c >= r + 4) got.push({ x, y, d: Math.hypot(x - from.x, (y - from.y) * 1.15) });
          }
        }
        if (got.length >= count || tries === 7) {
          got.sort((p, q) => p.d - q.d || p.y - q.y || p.x - q.x);
          return Object.assign(got.slice(0, count).map(({ x, y }) => ({ x, y })), { r });
        }
      }
      return Object.assign([], { r });
    },

    regionSweep(x, u, so = {}) {
      const ms = [...V.masks(x)].map((m) => V.region(m)).filter(Boolean);
      const clip = ms.map((r) => r.path).join('');
      if (!ms.length) return { clip: '', poly: '', quad: null, edge: null, bbox: null };
      const x0 = Math.min(...ms.map((r) => r.bbox.x)), y0 = Math.min(...ms.map((r) => r.bbox.y));
      const x1 = Math.max(...ms.map((r) => r.bbox.x + r.bbox.w)), y1 = Math.max(...ms.map((r) => r.bbox.y + r.bbox.h));
      const a = (so.angle ?? 0) * RAD, dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
      const cs = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const sv = cs.map(([X, Y]) => X * dx + Y * dy), pv = cs.map(([X, Y]) => X * px + Y * py);
      const s0 = Math.min(...sv) - 2, s1 = Math.max(...sv) + 2, p0 = Math.min(...pv) - 2, p1 = Math.max(...pv) + 2;
      const k = Math.max(0, Math.min(1, u)), s = s0 + (s1 - s0) * k;
      const at = (S, P) => [S * dx + P * px, S * dy + P * py];
      const q = [at(s0 - 4, p0), at(s, p0), at(s, p1), at(s0 - 4, p1)];
      const e0 = at(s, p0), e1 = at(s, p1);
      return {
        clip, bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, quad: k <= 0 ? null : q,
        poly: k <= 0 ? '' : `M${q.map(([X, Y]) => `${f2(X)} ${f2(Y)}`).join('L')}Z`,
        edge: k <= 0 || k >= 1 ? null : { x1: e0[0], y1: e0[1], x2: e1[0], y2: e1[1] },
      };
    },
  };
  return V;
}

// -- Set expressions ---------------------------------------------------------------------------------

const OPS = {
  union: ['|', '+', '\u222a'], inter: ['&', '*', '\u2229'], diff: ['-', '\u2212', '\\', '\u2216'],
  post: ["'", '\u2032', '\u2019', '\u1d9c'], pre: ['~', '!', '\u00ac'],
};

function parseExpr(src, rings, FULL) {
  const NM = 1 << (FULL + 1);               // masks 0..FULL as bits of one number
  const ALL = NM - 1;
  const setOf = (bit) => { let s = 0; for (let m = 0; m <= FULL; m++) if (m & bit) s |= 1 << m; return s >>> 0; };
  const ids = new Map(rings.map((r) => [r.id, setOf(r.bit)]));
  const toks = [];
  for (let i = 0; i < src.length;) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (m) { toks.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
    const kind = Object.keys(OPS).find((k) => OPS[k].includes(ch));
    if (kind) { toks.push({ t: kind }); i++; continue; }
    if (ch === '(' || ch === ')') { toks.push({ t: ch }); i++; continue; }
    if (ch === '\u2205' || ch === '0') { toks.push({ t: 'empty' }); i++; continue; }
    if (ch === '\u03be') { toks.push({ t: 'id', v: 'U' }); i++; continue; }
    throw new Error(`exprMask: unexpected "${ch}" in "${src}"`);
  }
  let k = 0;
  const peek = () => toks[k]?.t;
  const expr = () => {
    let a = term();
    while (peek() === 'union' || peek() === 'diff') { const op = toks[k++].t, b = term(); a = op === 'union' ? (a | b) >>> 0 : (a & ~b) >>> 0; }
    return a;
  };
  const term = () => { let a = factor(); while (peek() === 'inter') { k++; a = (a & factor()) >>> 0; } return a; };
  const factor = () => {
    if (peek() === 'pre') { k++; return (ALL & ~factor()) >>> 0; }
    let a = primary();
    while (peek() === 'post') { k++; a = (ALL & ~a) >>> 0; }
    return a;
  };
  const primary = () => {
    const tk = toks[k++];
    if (!tk) throw new Error(`exprMask: "${src}" ends too soon`);
    if (tk.t === '(') { const a = expr(); if (toks[k++]?.t !== ')') throw new Error(`exprMask: missing ")" in "${src}"`); return a; }
    if (tk.t === 'empty') return 0;
    if (tk.t === 'id') {
      if (ids.has(tk.v)) return ids.get(tk.v);
      if (tk.v === 'U') return ALL;
      throw new Error(`exprMask: no ring "${tk.v}" (rings: ${[...ids.keys()].join(', ')})`);
    }
    throw new Error(`exprMask: unexpected operator in "${src}"`);
  };
  const s = expr();
  if (k < toks.length) throw new Error(`exprMask: unexpected "${toks[k].v ?? toks[k].t}" in "${src}"`);
  const out = new Set();
  for (let m = 0; m <= FULL; m++) if (s & (1 << m)) out.add(m);
  return out;
}
