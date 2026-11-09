/**
 * GeometryDiagram — declarative renderer for a static, labeled synthetic-
 * geometry figure (points, segments/rays/lines, polygons, angle arcs,
 * tick/parallel marks, right-angle markers, circles/arcs/sectors). The
 * geometry-figure counterpart to GraphPlotter (Cartesian function/data
 * plots) — same "author writes JSON, engine draws an SVG" split, wired
 * into QuestionBase the same way via `data.diagram` (see diagramHost.js),
 * but for synthetic figures rather than coordinate-plane graphs.
 * `docs/copyright-and-sourcing.md` already tells authors to "generate a
 * new, original SVG" per figure instead of lifting a textbook illustration
 * — this is that generator, driven by plain content JSON instead of
 * hand-drawing/exporting a one-off asset per question.
 *
 * Pure native SVG DOM (`createElementNS`), no vendor dependency — unlike
 * GraphPlotter this needs no D3 (no scales/axes/zoom, just fixed 2D
 * geometry), so `mountQuestionDiagram()` never lazy-loads anything.
 *
 * Coordinates are plain author-chosen numbers in SVG convention (y
 * increases downward, like a page/canvas) — arbitrary units, auto-scaled
 * to fit a `viewBox` computed from the points'/circles' bounding box plus
 * padding unless the author supplies one explicitly. There is no
 * constraint solving: the author places every point's (x, y) directly (or
 * anchors it to a circle — see `onCircle` below), the same way they'd
 * place vertices in any drawing tool — this stays simple and predictable
 * rather than attempting to lay out a figure from angle/length
 * constraints, which is a much harder (and unnecessary) problem for the
 * fixed, hand-composed figures a CBSE question needs. This is NOT a
 * general vector-drawing tool: no 3D (Surface Areas & Volumes' solids need
 * a fundamentally different, pseudo-3D/isometric renderer this isn't),
 * and coordinate-axes figures (basic Coordinate Geometry) belong on the
 * separate `graph` companion field, not here.
 *
 * config shape:
 *   {
 *     points: [
 *       { id, x, y, label?, labelOffset?: [dx, dy] } |
 *       { id, onCircle: circleId, angleDeg, label?, labelOffset?: [dx, dy] }
 *     ],
 *     segments: [{ from, to, extend?: 'none'|'start'|'end'|'both',
 *                  style?: 'solid'|'dashed', ticks?: 0-3,
 *                  label?, labelOffset?: [dx, dy] }],
 *     polygons: [{ points: [id, id, ...], fill?: 'primary'|'success'|'error'|'muted', style?: 'solid'|'dashed' }],
 *     angles: [{ at, from, to, label?, radius? }],
 *     rightAngles: [{ at, from, to, size? }],
 *     parallelMarks: [{ from, to, count?: 1|2 }],
 *     circles: [{ id?, center?, radius?, through?,
 *                 startDeg?, endDeg?, fill?: 'primary'|'success'|'error'|'muted' }],
 *     viewBox?: [x, y, w, h],
 *     a11yCaption?: string,
 *   }
 *
 * `points[].id` is a local handle referenced by `segments[].from/to`,
 * `angles[].at/from/to`, `circles[].center`/`through`, etc. — never
 * rendered itself; `label` (defaults to `id`) is what's drawn next to the
 * point.
 *
 * `points[].onCircle` places a point on a named circle's circumference at
 * `angleDeg` instead of an explicit `x`/`y` — degrees in the same
 * convention as `circles[].startDeg`/`endDeg` below (0 = east, increasing
 * clockwise-on-screen since y is down), so the author never has to
 * hand-compute `cx + r*cos(theta)` for a chord/inscribed-angle/cyclic-
 * quadrilateral figure. The referenced circle must itself use plain
 * (non-`onCircle`) points for its own `center`/`through` — one level of
 * indirection only, not a general constraint solver.
 *
 * `angles[].from`/`to` name the two OTHER points forming the rays out of
 * `at` (not necessarily the segment endpoints — a ray can point through any
 * named point, which is what lets Section-E-style ray diagrams like
 * "angle POQ" at vertex O work directly). The arc always draws the interior
 * (<=180 deg) angle between the two rays. Multiple `angles[]` entries
 * sharing the same `at` auto-stack outward (increasing default radius) so
 * e.g. four rays fanned out from one point each get their own readable arc
 * without the author having to hand-pick radii. To mark two DIFFERENT
 * angles as congruent without giving away their numeric value (the
 * angle-arc counterpart of `segments[].ticks`), give both the same short
 * label string (e.g. both `"x"`, or both a bare mark like `"*"`) — there
 * is no separate arc-count primitive, matching labels already do the job.
 *
 * `circles[].startDeg`/`endDeg`, if given, draw only that arc instead of
 * the full circumference (sweeping from `startDeg` to `endDeg` in the
 * increasing-angle direction) — for a compass-construction mark, or
 * highlighting one arc of a circle-theorem figure. Add `fill` to shade it:
 * with `startDeg`/`endDeg`, that shades the pie-slice **sector** (center
 * to arc); without them (a full circle), it shades the whole disk. There
 * is no separate circular-**segment** (chord-bounded, not center-bounded)
 * shading — not needed for CBSE 9/10's own sector-area questions, and can
 * be added later if a chapter needs it.
 *
 * `polygons[].points` draws a closed shape through those point ids in
 * order (auto-closed back to the first) — the convenience-plus-fill
 * counterpart of hand-declaring one `segments[]` entry per side (still
 * fine to do either, or both together — e.g. a filled polygon under a
 * `segments[]` entry that adds tick marks to one particular side).
 *
 * `fill` on a `circles[]`/`polygons[]` entry is a semantic key (`'primary'`
 * `'success'`, `'error'`, `'muted'`) resolved against this app's own theme
 * tokens, same convention as GraphPlotter's `series[].color` (CLAUDE.md
 * invariant 9: never a hardcoded color) — a soft/translucent tint in both
 * themes, meant to shade a region without hiding the lines/labels drawn
 * over it.
 */

const NS = 'http://www.w3.org/2000/svg';

function themeColor(el, varName, fallback) {
  return getComputedStyle(el).getPropertyValue(varName).trim() || fallback;
}

const FILL_TOKENS = { primary: '--primary-light', success: '--success-bg', error: '--error-bg' };
const FILL_FALLBACKS = { primary: '#eef2ff', success: '#dcfce7', error: '#ffe4e6' };

/** Resolves a `fill` semantic key to a `{ fill, fillOpacity }` pair — see
 *  this file's header comment. `'muted'` has no pre-tinted theme token (it's
 *  an ordinary foreground color, not a background tint), so it's shaded via
 *  `fill-opacity` instead; the other three keys already resolve to a
 *  pre-tinted token in both themes and need no extra opacity. */
function resolveFill(el, key) {
  if (key === 'muted') return { fill: themeColor(el, '--text-muted', '#64748b'), fillOpacity: 0.18 };
  const k = FILL_TOKENS[key] ? key : 'primary';
  return { fill: themeColor(el, FILL_TOKENS[k], FILL_FALLBACKS[k]), fillOpacity: 1 };
}

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function len(v) { return Math.hypot(v.x, v.y); }
function unit(v) { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; }
function perp(v) { return { x: -v.y, y: v.x }; }
function pointOnCircle(c, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: c.cx + c.r * Math.cos(rad), y: c.cy + c.r * Math.sin(rad) };
}

/**
 * Two-phase point/circle resolution: (1) plain `x`/`y` points go straight
 * into the point map; circles resolve their center/radius against that
 * map. (2) `onCircle` points resolve against the now-known circles and are
 * added to both the point map and a flat `resolvedPoints` array (used
 * everywhere `config.points` would otherwise be read directly, so the rest
 * of `plot()` never has to know the difference between the two point
 * shapes). See the file header comment for the one-level-of-indirection
 * limit this implies.
 */
function resolvePointsAndCircles(pointConfigs, circleConfigs) {
  const pts = new Map();
  const resolvedPoints = [];
  for (const p of pointConfigs || []) {
    if (p.onCircle) continue;
    pts.set(p.id, p);
    resolvedPoints.push(p);
  }
  const circles = [];
  for (const c of circleConfigs || []) {
    const center = c.center ? pts.get(c.center) : (typeof c.cx === 'number' ? { x: c.cx, y: c.cy } : null);
    if (!center) continue;
    let radius = c.radius;
    if (radius == null && c.through) {
      const p = pts.get(c.through);
      if (p) radius = len(sub(p, center));
    }
    if (radius == null) continue;
    circles.push({ ...c, cx: center.x, cy: center.y, r: radius });
  }
  const circlesById = new Map(circles.filter((c) => c.id).map((c) => [c.id, c]));
  for (const p of pointConfigs || []) {
    if (!p.onCircle) continue;
    const circle = circlesById.get(p.onCircle);
    if (!circle) continue;
    const { x, y } = pointOnCircle(circle, p.angleDeg || 0);
    const resolved = { ...p, x, y };
    pts.set(p.id, resolved);
    resolvedPoints.push(resolved);
  }
  return { pts, resolvedPoints, circles };
}

function computeViewBox(points, circles) {
  const xs = [];
  const ys = [];
  for (const p of points || []) { xs.push(p.x); ys.push(p.y); }
  for (const c of circles || []) {
    xs.push(c.cx - c.r, c.cx + c.r);
    ys.push(c.cy - c.r, c.cy + c.r);
  }
  if (!xs.length) return [0, 0, 200, 200];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const pad = Math.max(w, h) * 0.22 + 18;
  return [minX - pad, minY - pad, w + pad * 2, h + pad * 2];
}

/** Interior-angle arc path between rays `at`->`fromPt` and `at`->`toPt`. */
function arcPath(at, fromPt, toPt, radius) {
  const a1 = Math.atan2(fromPt.y - at.y, fromPt.x - at.x);
  const a2 = Math.atan2(toPt.y - at.y, toPt.x - at.x);
  let delta = a2 - a1;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  const sweep = delta > 0 ? 1 : 0;
  const p1 = { x: at.x + radius * Math.cos(a1), y: at.y + radius * Math.sin(a1) };
  const p2 = { x: at.x + radius * Math.cos(a1 + delta), y: at.y + radius * Math.sin(a1 + delta) };
  const mid = a1 + delta / 2;
  const labelPos = { x: at.x + (radius + 14) * Math.cos(mid), y: at.y + (radius + 14) * Math.sin(mid) };
  return { d: `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 0 ${sweep} ${p2.x} ${p2.y}`, labelPos, a1, delta };
}

/** Arc (or, with fill, pie-slice sector) path for a circle between
 *  `startDeg` and `endDeg`, sweeping in the increasing-angle direction
 *  (mod 360) — see the file header comment for the angle convention. */
function circleArcPath(c, startDeg, endDeg, asSector) {
  const p1 = pointOnCircle(c, startDeg);
  const p2 = pointOnCircle(c, endDeg);
  const delta = ((endDeg - startDeg) % 360 + 360) % 360;
  const largeArc = delta > 180 ? 1 : 0;
  const arc = `A ${c.r} ${c.r} 0 ${largeArc} 1 ${p2.x} ${p2.y}`;
  return asSector
    ? `M ${c.cx} ${c.cy} L ${p1.x} ${p1.y} ${arc} Z`
    : `M ${p1.x} ${p1.y} ${arc}`;
}

export const GeometryDiagram = {
  /**
   * @param {SVGSVGElement} svgEl <svg> to draw into — cleared first, so
   *   calling plot() again on the same element (e.g. diagramHost.js
   *   redrawing after a `theme:changed` event, to pick up the new
   *   `--text-main`/`--text-muted` token values) replaces the drawing
   *   instead of layering a second copy on top of the first.
   * @param {object} config see file header
   */
  plot(svgEl, config) {
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    const { pts, resolvedPoints, circles } = resolvePointsAndCircles(config.points, config.circles);
    const ink = themeColor(svgEl, '--text-main', '#0f172a');
    // NOT --border-color: that token is a barely-there decorative outline
    // in dark mode (rgb(255 255 255 / 0.09), theme.css) meant for subtle
    // card borders, not content a student needs to actually read — using
    // it for the figure's own segments/circles made them nearly invisible
    // in dark mode. --text-muted is the same token GraphPlotter reserves
    // for its axis labels (real content, just secondary to the plotted
    // data) — here the figure's straight edges are the secondary layer,
    // points/labels/angle marks (drawn in `ink` below) are the primary one.
    const line = themeColor(svgEl, '--text-muted', '#334155');
    const [vx, vy, vw, vh] = config.viewBox || computeViewBox(resolvedPoints, circles);
    svgEl.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
    svgEl.setAttribute('role', 'img');
    if (config.a11yCaption) {
      const title = el('title');
      title.textContent = config.a11yCaption;
      svgEl.appendChild(title);
    }

    // Arrowhead marker (for extended rays/lines) — defined once, reused by id.
    const defs = el('defs');
    const marker = el('marker', {
      id: 'gd-arrow', viewBox: '0 0 10 10', refX: '8', refY: '5',
      markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse',
    });
    marker.appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: line }));
    defs.appendChild(marker);
    svgEl.appendChild(defs);

    // --- circles/arcs/sectors (drawn first, behind everything else) ---
    for (const c of circles) {
      const hasRange = typeof c.startDeg === 'number' && typeof c.endDeg === 'number';
      if (c.fill) {
        const { fill, fillOpacity } = resolveFill(svgEl, c.fill);
        if (hasRange) {
          svgEl.appendChild(el('path', {
            d: circleArcPath(c, c.startDeg, c.endDeg, true),
            fill, 'fill-opacity': fillOpacity, stroke: line, 'stroke-width': 1.75,
          }));
        } else {
          svgEl.appendChild(el('circle', {
            cx: c.cx, cy: c.cy, r: c.r, fill, 'fill-opacity': fillOpacity, stroke: line, 'stroke-width': 1.75,
          }));
        }
      } else if (hasRange) {
        svgEl.appendChild(el('path', {
          d: circleArcPath(c, c.startDeg, c.endDeg, false),
          fill: 'none', stroke: line, 'stroke-width': 1.75,
        }));
      } else {
        svgEl.appendChild(el('circle', { cx: c.cx, cy: c.cy, r: c.r, fill: 'none', stroke: line, 'stroke-width': 1.75 }));
      }
    }

    // --- filled/outline polygons ---
    for (const poly of config.polygons || []) {
      const vertices = (poly.points || []).map((id) => pts.get(id)).filter(Boolean);
      if (vertices.length < 3) continue;
      const d = `M ${vertices.map((v) => `${v.x} ${v.y}`).join(' L ')} Z`;
      const attrs = { d, stroke: line, 'stroke-width': 2 };
      if (poly.style === 'dashed') attrs['stroke-dasharray'] = '6,4';
      if (poly.fill) {
        const { fill, fillOpacity } = resolveFill(svgEl, poly.fill);
        attrs.fill = fill;
        attrs['fill-opacity'] = fillOpacity;
      } else {
        attrs.fill = 'none';
      }
      svgEl.appendChild(el('path', attrs));
    }

    // --- segments (with optional ray/line extension, tick marks, label) ---
    const EXT = Math.max(vw, vh) * 0.14 + 14;
    for (const s of config.segments || []) {
      const a = pts.get(s.from);
      const b = pts.get(s.to);
      if (!a || !b) continue;
      const dir = unit(sub(b, a));
      let p1 = a;
      let p2 = b;
      let markerStart = '';
      let markerEnd = '';
      if (s.extend === 'start' || s.extend === 'both') {
        p1 = { x: a.x - dir.x * EXT, y: a.y - dir.y * EXT };
        markerStart = 'url(#gd-arrow)';
      }
      if (s.extend === 'end' || s.extend === 'both') {
        p2 = { x: b.x + dir.x * EXT, y: b.y + dir.y * EXT };
        markerEnd = 'url(#gd-arrow)';
      }
      const lineEl = el('line', {
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
        stroke: line, 'stroke-width': 2,
      });
      if (s.style === 'dashed') lineEl.setAttribute('stroke-dasharray', '6,4');
      if (markerStart) lineEl.setAttribute('marker-start', markerStart);
      if (markerEnd) lineEl.setAttribute('marker-end', markerEnd);
      svgEl.appendChild(lineEl);

      const ticks = s.ticks || 0;
      if (ticks > 0) {
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const pv = unit(perp(sub(b, a)));
        const spacing = 5;
        const start = -((ticks - 1) * spacing) / 2;
        for (let i = 0; i < ticks; i++) {
          const off = start + i * spacing;
          const c = { x: mid.x + dir.x * off, y: mid.y + dir.y * off };
          svgEl.appendChild(el('line', {
            x1: c.x - pv.x * 5, y1: c.y - pv.y * 5,
            x2: c.x + pv.x * 5, y2: c.y + pv.y * 5,
            stroke: ink, 'stroke-width': 2,
          }));
        }
      }

      if (s.label) {
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        let dx;
        let dy;
        if (s.labelOffset) {
          [dx, dy] = s.labelOffset;
        } else {
          const pv = unit(perp(sub(b, a)));
          dx = pv.x * 14;
          dy = pv.y * 14;
        }
        const t = el('text', {
          x: mid.x + dx, y: mid.y + dy, 'font-size': 12.5, fill: ink,
          'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-weight': 700,
        });
        t.textContent = s.label;
        svgEl.appendChild(t);
      }
    }

    // --- parallel-line chevron marks ---
    for (const p of config.parallelMarks || []) {
      const a = pts.get(p.from);
      const b = pts.get(p.to);
      if (!a || !b) continue;
      const dir = unit(sub(b, a));
      const pv = perp(dir);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const count = p.count || 1;
      const spacing = 7;
      const start = -((count - 1) * spacing) / 2;
      for (let i = 0; i < count; i++) {
        const off = start + i * spacing;
        const c = { x: mid.x + dir.x * off, y: mid.y + dir.y * off };
        const tip = { x: c.x + dir.x * 5, y: c.y + dir.y * 5 };
        const backA = { x: c.x - dir.x * 3 + pv.x * 4, y: c.y - dir.y * 3 + pv.y * 4 };
        const backB = { x: c.x - dir.x * 3 - pv.x * 4, y: c.y - dir.y * 3 - pv.y * 4 };
        svgEl.appendChild(el('path', {
          d: `M ${backA.x} ${backA.y} L ${tip.x} ${tip.y} L ${backB.x} ${backB.y}`,
          fill: 'none', stroke: ink, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        }));
      }
    }

    // --- right-angle square markers ---
    for (const r of config.rightAngles || []) {
      const at = pts.get(r.at);
      const from = pts.get(r.from);
      const to = pts.get(r.to);
      if (!at || !from || !to) continue;
      const size = r.size || 10;
      const u1 = unit(sub(from, at));
      const u2 = unit(sub(to, at));
      const p1 = { x: at.x + u1.x * size, y: at.y + u1.y * size };
      const p2 = { x: p1.x + u2.x * size, y: p1.y + u2.y * size };
      const p3 = { x: at.x + u2.x * size, y: at.y + u2.y * size };
      svgEl.appendChild(el('path', {
        d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y}`,
        fill: 'none', stroke: ink, 'stroke-width': 1.5,
      }));
    }

    // --- angle arcs + labels (auto-stacking radius per shared vertex) ---
    const vertexCount = new Map();
    for (const a of config.angles || []) {
      const at = pts.get(a.at);
      const from = pts.get(a.from);
      const to = pts.get(a.to);
      if (!at || !from || !to) continue;
      const n = vertexCount.get(a.at) || 0;
      vertexCount.set(a.at, n + 1);
      const radius = a.radius || (18 + n * 10);
      const { d, labelPos } = arcPath(at, from, to, radius);
      svgEl.appendChild(el('path', { d, fill: 'none', stroke: ink, 'stroke-width': 1.75 }));
      if (a.label) {
        const t = el('text', {
          x: labelPos.x, y: labelPos.y, 'font-size': 12, fill: ink,
          'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-weight': 700,
        });
        t.textContent = a.label;
        svgEl.appendChild(t);
      }
    }

    // --- points + labels (drawn last, on top) ---
    const cx = resolvedPoints.reduce((s, p) => s + p.x, 0) / (resolvedPoints.length || 1);
    const cy = resolvedPoints.reduce((s, p) => s + p.y, 0) / (resolvedPoints.length || 1);
    for (const p of resolvedPoints) {
      svgEl.appendChild(el('circle', { cx: p.x, cy: p.y, r: 2.5, fill: ink }));
      const label = p.label ?? p.id;
      if (!label) continue;
      let dx;
      let dy;
      if (p.labelOffset) {
        [dx, dy] = p.labelOffset;
      } else {
        const away = unit(sub(p, { x: cx, y: cy }));
        dx = away.x * 16;
        dy = away.y * 16;
      }
      const t = el('text', {
        x: p.x + dx, y: p.y + dy, 'font-size': 13, fill: ink,
        'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-weight': 700,
      });
      t.textContent = label;
      svgEl.appendChild(t);
    }
  },
};
