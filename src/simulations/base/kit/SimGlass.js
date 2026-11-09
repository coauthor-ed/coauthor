// SimGlass.js - lab glassware and the liquid in it, drawn from data (canvas, SimScene).
//
// One material for every piece of glass in the kit, so a beaker in one lesson and a test tube in
// the next read as the same glass under the same light (key light top left). A scene or a course
// bench helper says WHAT stands on the bench (shape, box, how full, what colour liquid); this
// file decides how glass and liquid look. A later look change is then a kit edit only.
//
//   const g = glassBox('beaker', x, y, w, h);      // geometry only, no drawing
//   drawGlass(ctx, c, g);                          // behind the contents: shadow, far wall, body, rim, streaks
//   drawGlassLiquid(ctx, c, g, { level: 0.5, fill: c.water });   // clipped to the cavity
//   ... the scene's own contents (grains, layers, a beam) ...
//   drawGlassFront(ctx, c, g);                     // optional: streaks over contents a scene drew itself
//
// drawGlassLiquid repaints the front streaks over the liquid it drew, so the common order
// drawGlass -> drawGlassLiquid needs no third call. Shapes: 'beaker', 'jar', 'tube', 'cylinder',
// 'flask' (conical), 'round' (round-bottom flask), 'bottle' (shoulders and a neck), and four drawn
// from a width profile down the box: 'tumbler' (tapers to the foot), 'funnel' (cone and stem),
// 'pear' (separating funnel: neck, bulb, stem) and 'dropper' (barrel and tip). A profiled wall is
// one even thickness, its stem end is open, and `flip` stands it mouth down (an inverted funnel).
// A straight run of tubing (condenser jacket, side arm, adapter) is drawGlassPipe /
// drawGlassPipeFront, along any line. Profile: lite draws the glass and liquid with
// literal light only (edge density, streak, meniscus); rich adds a reflected window, a caustic
// under a filled vessel and a deeper liquid shade. Colours: palette tokens and their mixes only.

import { alpha, mix, lighten, darken, rr, luma, drawShadow, profileOf } from './SimLook.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const PROFILED = new Set(['tumbler', 'funnel', 'pear', 'dropper']);
const OPEN_END = new Set(['funnel', 'pear', 'dropper']);       // the stem or tip end is open glass
const NARROW = new Set(['flask', 'round', 'bottle', 'pear']);  // the mouth is a neck, not the full box
const smooth = (u) => u * u * (3 - 2 * u);

/**
 * Half-width share (0..1 of the cavity's half width) at t, 0 at the mouth and 1 at the far end.
 * The numbers are the cavity's: the outer wall is this plus one wall thickness.
 */
function widthAt(g, t) {
  switch (g.shape) {
    case 'tumbler': return 1 - g.taper * t;
    case 'funnel': return t <= g.cone ? 1 - (1 - g.stem) * (t / g.cone) : g.stem;
    case 'dropper': {
      if (t <= g.cone) return 1;
      return g.stem + (1 - g.stem) * (1 - smooth(Math.min(1, (t - g.cone) / (0.96 - g.cone))));
    }
    case 'pear': {
      const ne = 0.08;
      if (t <= ne) return g.neck;
      if (t <= g.belly) return g.neck + (1 - g.neck) * smooth((t - ne) / (g.belly - ne));
      if (t <= g.stemAt) return g.stem + (1 - g.stem) * Math.cos(((t - g.belly) / (g.stemAt - g.belly)) * Math.PI / 2) ** 0.85;
      return g.stem;
    }
    default: return 1;
  }
}

/** The left and right wall points of a profiled shape in box b (the cavity, or the outer box). */
function profilePts(g, b) {
  const off = Math.max(0, (b.w - g.inner.w) / 2);              // 0 on the cavity, the wall on the outer box
  const iy = g.inner.y, ih = g.inner.h, hw0 = g.inner.w / 2;
  const n = 44, L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const y = b.y + (b.h * i) / n;
    const u = clamp01((y - iy) / ih);
    const hw = widthAt(g, g.flip ? 1 - u : u) * hw0 + off;
    L.push([g.cx - hw, y]);
    R.push([g.cx + hw, y]);
  }
  return { L, R };
}

/**
 * The geometry of one piece of glassware from its OUTER box (x, y top left). No drawing.
 * o: { wall, r (base corner radius), neck (flask neck width share), spout (beaker lip) }
 * Returns { shape, x, y, w, h, wall, r, cx, inner: { x, y, w, h }, top, floor }:
 * `inner` is the cavity a caller draws contents in, `top` its upper y, `floor` its lower y.
 */
export function glassBox(shape, x, y, w, h, o = {}) {
  const wall = o.wall ?? Math.min(6, Math.max(3, Math.round(w * 0.05)));
  const r = o.r ?? (shape === 'tube' ? w / 2 : shape === 'round' ? 0 : Math.min(10, w * 0.1));
  const lip = shape === 'jar' ? h * 0.1 : 0;
  const inner = { x: x + wall, y: y + wall + lip, w: w - wall * 2, h: h - wall * 2 - lip };
  const g = { shape, x, y, w, h, wall, r, lip, neck: o.neck ?? (shape === 'bottle' ? 0.4 : shape === 'pear' ? 0.22 : 0.32), spout: o.spout !== false, cx: x + w / 2, inner, top: inner.y, floor: inner.y + inner.h };
  if (PROFILED.has(shape)) {
    // tumbler: taper (share lost at the foot); funnel: cone (t where the cone meets the stem), stem;
    // pear: neck, belly (t of the widest point), stemAt, stem; dropper: cone (t where the tip starts), stem
    Object.assign(g, {
      flip: !!o.flip,
      taper: o.taper ?? 0.14,
      cone: o.cone ?? (shape === 'dropper' ? 0.72 : 0.6),
      stem: o.stem ?? (shape === 'pear' ? 0.1 : shape === 'dropper' ? 0.3 : 0.14),
      belly: o.belly ?? 0.5,
      stemAt: o.stemAt ?? 0.82,
    });
    if (shape === 'tumbler') g.r = o.r ?? Math.min(14, w * 0.1);
  }
  return g;
}

/** Trace the outline of a shape in the box b ({ x, y, w, h }); `g` carries the shape options. */
export function glassPath(ctx, g, b = g) {
  const { x, y, w, h } = b;
  const r = Math.max(0, Math.min(g.r * (b.w / g.w), w / 2, h / 2));
  ctx.beginPath();
  if (PROFILED.has(g.shape)) {
    const { L, R } = profilePts(g, b);
    if (g.shape === 'tumbler') {                            // a flat foot with rounded corners
      const lb = L[L.length - 1], rb = R[R.length - 1], k = Math.min(1, r / Math.max(1, h));
      const li = L[Math.round((L.length - 1) * (1 - k))], ri = R[Math.round((R.length - 1) * (1 - k))];
      ctx.moveTo(L[0][0], L[0][1]);
      ctx.lineTo(li[0], li[1]);
      ctx.quadraticCurveTo(lb[0], lb[1], lb[0] + r, lb[1]);
      ctx.lineTo(rb[0] - r, rb[1]);
      ctx.quadraticCurveTo(rb[0], rb[1], ri[0], ri[1]);
      ctx.lineTo(R[0][0], R[0][1]);
    } else {
      ctx.moveTo(L[0][0], L[0][1]);
      for (const p of L) ctx.lineTo(p[0], p[1]);
      for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    }
    ctx.closePath();
    return;
  }
  if (g.shape === 'flask') {
    const nw = w * g.neck, nh = h * 0.3, nx = x + (w - nw) / 2;
    ctx.moveTo(nx, y);
    ctx.lineTo(nx, y + nh);
    ctx.lineTo(x, y + h - r);
    ctx.quadraticCurveTo(x, y + h, x + r, y + h);
    ctx.lineTo(x + w - r, y + h);
    ctx.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
    ctx.lineTo(nx + nw, y + nh);
    ctx.lineTo(nx + nw, y);
    ctx.closePath();
    return;
  }
  if (g.shape === 'bottle') {
    const nw = w * g.neck, nx = x + (w - nw) / 2, nh = h * 0.14, sh = h * 0.3;
    ctx.moveTo(nx, y);
    ctx.lineTo(nx, y + nh);
    ctx.bezierCurveTo(nx, y + sh * 0.85, x, y + nh + (sh - nh) * 0.3, x, y + sh);
    ctx.lineTo(x, y + h - r);
    ctx.quadraticCurveTo(x, y + h, x + r, y + h);
    ctx.lineTo(x + w - r, y + h);
    ctx.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
    ctx.lineTo(x + w, y + sh);
    ctx.bezierCurveTo(x + w, y + nh + (sh - nh) * 0.3, nx + nw, y + sh * 0.85, nx + nw, y + nh);
    ctx.lineTo(nx + nw, y);
    ctx.closePath();
    return;
  }
  if (g.shape === 'round') {
    const nw = w * g.neck, rad = w / 2, cy = y + h - rad, nx = x + (w - nw) / 2;
    const a = Math.asin(Math.min(1, nw / 2 / rad));
    ctx.moveTo(nx, y);
    ctx.lineTo(nx, cy - Math.cos(a) * rad);
    ctx.arc(x + w / 2, cy, rad, -Math.PI / 2 - a, -Math.PI / 2 + a, true);
    ctx.lineTo(nx + nw, y);
    ctx.closePath();
    return;
  }
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h - r);
  ctx.quadraticCurveTo(x, y + h, x + r, y + h);
  ctx.lineTo(x + w - r, y + h);
  ctx.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
  ctx.lineTo(x + w, y);
  ctx.closePath();
}

const innerPath = (ctx, g) => glassPath(ctx, g, g.inner);

/** Glass reads thinner on a light backdrop: the glass token is strong there. */
function tone(c) {
  const lt = luma(c.bgDeep) > 0.5;
  return { lt, tk: lt ? 0.65 : 1, hl: lt ? 0.95 : 0.75 };
}

/**
 * The glass behind its contents: contact shadow, the far wall seen through the cavity, the body
 * (clear across the face, dense at the two edges), the outline, the lit rim and the streaks.
 * o: { shadow = true, far = 0.16, body = 1, edge = 0.85, rim = true, ticks = 0, profile }
 */
export function drawGlass(ctx, c, g, o = {}) {
  const { x, y, w, h } = g;
  const { lt, tk } = tone(c);
  const rich = profileOf(o) === 'rich';
  const k = (o.body ?? 1) * tk;
  ctx.save();
  if (o.shadow !== false) drawShadow(ctx, c, g.cx, y + h + 3, w * 0.5, Math.max(4, w * 0.06));
  innerPath(ctx, g);
  ctx.fillStyle = alpha(c.glass, (o.far ?? 0.16) * tk);
  ctx.fill();
  const bg = ctx.createLinearGradient(x, 0, x + w, 0);
  bg.addColorStop(0, alpha(darken(c.glass, 0.1), 0.42 * k));
  bg.addColorStop(0.1, alpha(c.glass, 0.12 * k));
  bg.addColorStop(0.75, alpha(c.glass, 0.1 * k));
  bg.addColorStop(0.93, alpha(darken(c.glass, 0.15), 0.3 * k));
  bg.addColorStop(1, alpha(darken(c.glass, 0.25), 0.5 * k));
  glassPath(ctx, g);
  ctx.fillStyle = bg;
  ctx.fill();
  if (g.shape !== 'tube' && g.shape !== 'round' && !OPEN_END.has(g.shape)) {   // the thick glass foot
    ctx.save();
    glassPath(ctx, g);
    ctx.clip();
    ctx.fillStyle = alpha(lighten(c.glass, 0.2), 0.35 * k);
    ctx.fillRect(x, g.floor - 1, w, g.wall + 2);
    ctx.restore();
  }
  ctx.strokeStyle = alpha(c.glass, (o.edge ?? 0.85) * (lt ? 0.8 : 1));
  ctx.lineWidth = 3;                                          // the wall reads as glass with weight, not a hairline (SHOWCASE: thin glass)
  if (OPEN_END.has(g.shape)) {                             // two walls; the mouth is the rim, the far end is open
    for (const b of [g, g.inner]) {
      const { L, R } = profilePts(g, b);
      for (const side of [L, R]) {
        ctx.beginPath();
        side.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.lineWidth = b === g ? 3 : 1.5;
        ctx.stroke();
      }
    }
    const end = g.flip ? g.y : g.y + g.h;                  // the cut end of the stem: a thin ring of glass
    const ew = widthAt(g, 1) * g.inner.w / 2;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(g.cx - ew - g.wall, end); ctx.lineTo(g.cx - ew, end);
    ctx.moveTo(g.cx + ew, end); ctx.lineTo(g.cx + ew + g.wall, end);
    ctx.stroke();
  } else {
    glassPath(ctx, g);
    ctx.stroke();
  }
  if (o.rim !== false) drawRim(ctx, c, g);
  if (o.ticks) drawTicks(ctx, c, g, o.ticks);
  drawStreaks(ctx, c, g, rich);
  ctx.restore();
}

/** The rolled rim at the mouth, lit on top; a beaker gets its pouring lip. */
function drawRim(ctx, c, g) {
  const mw = g.shape === 'pear' ? g.inner.w * g.neck + g.wall * 2 : NARROW.has(g.shape) ? g.w * g.neck : g.w;
  const mx = g.x + (g.w - mw) / 2;
  const rh = Math.max(3, Math.min(6, g.wall));
  const my = g.flip ? g.y + g.h - rh : g.y - 1;            // a flipped piece stands on its mouth
  ctx.fillStyle = alpha(lighten(c.glass, 0.25), 0.9);
  rr(ctx, mx - 3, my, mw + 6, rh + 1, Math.min(3, rh / 2));
  ctx.fill();
  ctx.fillStyle = alpha(lighten(c.glass, 0.7), 0.85);
  ctx.fillRect(mx + 2, my + 1, mw * 0.55, 1.5);
  if (g.shape === 'beaker' && g.spout) {
    ctx.fillStyle = alpha(lighten(c.glass, 0.25), 0.9);
    ctx.beginPath();
    ctx.moveTo(mx - 3, g.y - 1);
    ctx.quadraticCurveTo(mx - 9, g.y - 5, mx - 10, g.y - 1);
    ctx.quadraticCurveTo(mx - 7, g.y + rh, mx - 1, g.y + rh);
    ctx.closePath();
    ctx.fill();
  }
  if (g.shape === 'jar') {                                // the screw band under the mouth
    ctx.fillStyle = alpha(c.glass, 0.4);
    rr(ctx, g.x - 1, g.y + rh, g.w + 2, Math.max(4, g.lip - rh), 3);
    ctx.fill();
  }
}

/** Short graduation marks up the left inside wall: n marks, every fifth longer. */
function drawTicks(ctx, c, g, n) {
  const { inner } = g;
  ctx.strokeStyle = alpha(lighten(c.glass, 0.1), 0.6);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 1; i <= n; i++) {
    const ty = Math.round(g.floor - (inner.h * i) / (n + 1)) + 0.5;
    ctx.moveTo(inner.x + 2, ty);
    ctx.lineTo(inner.x + 2 + (i % 5 === 0 ? 14 : 8), ty);
  }
  ctx.stroke();
}

/** The key light's streak down the left, a thin one on the right; rich adds a window reflection. */
function drawStreaks(ctx, c, g, rich) {
  if (PROFILED.has(g.shape)) { profileStreaks(ctx, c, g, rich); return; }
  const { inner } = g;
  const { lt, hl } = tone(c);
  const body = g.shape === 'flask' || g.shape === 'round' ? 0.45 : g.shape === 'bottle' ? 0.32 : 0;   // a narrow neck: light the body only
  const sy = inner.y + inner.h * body + 8, ey = g.floor - Math.max(8, inner.h * 0.06);
  if (ey - sy < 10) return;
  ctx.save();
  glassPath(ctx, g);
  ctx.clip();
  const sw = Math.max(3, Math.min(6, g.w * 0.05));
  const lx = g.shape === 'flask' ? inner.x + inner.w * 0.18 : inner.x + Math.max(3, inner.w * 0.05);
  const sg = ctx.createLinearGradient(0, sy, 0, ey);
  sg.addColorStop(0, alpha(lighten(c.glass, 0.85), hl));
  sg.addColorStop(0.6, alpha(lighten(c.glass, 0.8), hl * 0.45));
  sg.addColorStop(1, alpha(lighten(c.glass, 0.6), 0));
  ctx.fillStyle = sg;
  rr(ctx, lx, sy, sw, ey - sy, sw / 2);
  ctx.fill();
  ctx.fillStyle = alpha(lighten(c.glass, 0.85), lt ? 0.5 : 0.25);
  ctx.fillRect(lx + sw + 4, sy + 4, 1.5, (ey - sy) * 0.45);
  ctx.fillStyle = alpha(lighten(c.glass, 0.85), lt ? 0.7 : 0.4);
  ctx.fillRect(inner.x + inner.w - Math.max(4, inner.w * 0.06), sy + 8, 2, (ey - sy) * 0.3);
  if (rich) {
    const gx = inner.x + inner.w * 0.7, gy = sy + (ey - sy) * 0.06, gh = (ey - sy) * 0.42;
    glint(ctx, c, lt, (u) => [gx, gy + gh * u], inner.w);
  }
  ctx.restore();
}

/**
 * The window behind the viewer, caught in the glass: a thin lens along at(u) -> [x, y] that fades out
 * at both ends. A filled box here reads as a label stuck on the glass. The streaks are painted again over
 * the liquid and the contents, so a call stays faint.
 */
function glint(ctx, c, lt, at, cw) {
  const n = 12, half = Math.max(1.5, cw * 0.028), pts = [];
  for (let i = 0; i <= n; i++) pts.push(at(i / n));
  const [, y0] = pts[0], [, y1] = pts[n];
  const a = lt ? 0.3 : 0.16;
  const sg = ctx.createLinearGradient(0, y0, 0, y1);
  sg.addColorStop(0, alpha(lighten(c.glass, 0.9), 0));
  sg.addColorStop(0.35, alpha(lighten(c.glass, 0.9), a));
  sg.addColorStop(1, alpha(lighten(c.glass, 0.9), 0));
  ctx.fillStyle = sg;
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const d = half * Math.sin((Math.PI * i) / n);
    if (i) ctx.lineTo(x - d, y); else ctx.moveTo(x - d, y);
  });
  for (let i = n; i >= 0; i--) ctx.lineTo(pts[i][0] + half * Math.sin((Math.PI * i) / n), pts[i][1]);
  ctx.closePath();
  ctx.fill();
}

/** The streaks of a profiled shape follow its left wall, over the part of it that is body. */
function profileStreaks(ctx, c, g, rich) {
  const { lt, hl } = tone(c);
  const span = { tumbler: [0.05, 0.92], funnel: [0.06, g.cone * 0.85], pear: [0.2, g.stemAt * 0.92], dropper: [0.06, g.cone * 0.95] }[g.shape];
  const iy = g.inner.y, ih = g.inner.h, hw0 = g.inner.w / 2;
  const sw = Math.max(2, Math.min(6, g.w * 0.05));
  const at = (t) => {
    const hw = widthAt(g, t) * hw0;
    return { y: g.flip ? iy + ih * (1 - t) : iy + ih * t, l: g.cx - hw, r: g.cx + hw, hw };
  };
  const n = 16, pts = [];
  for (let i = 0; i <= n; i++) pts.push(at(span[0] + ((span[1] - span[0]) * i) / n));
  const y0 = pts[0].y, y1 = pts[n].y;
  if (Math.abs(y1 - y0) < 10) return;
  ctx.save();
  glassPath(ctx, g);
  ctx.clip();
  const band = (inset, wid, a, side) => {
    const sg = ctx.createLinearGradient(0, y0, 0, y1);
    sg.addColorStop(0, alpha(lighten(c.glass, 0.85), a));
    sg.addColorStop(0.6, alpha(lighten(c.glass, 0.8), a * 0.45));
    sg.addColorStop(1, alpha(lighten(c.glass, 0.6), 0));
    ctx.fillStyle = sg;
    ctx.beginPath();
    const xo = (p, d) => (side < 0 ? p.l + d : p.r - d);
    pts.forEach((p, i) => (i ? ctx.lineTo(xo(p, inset), p.y) : ctx.moveTo(xo(p, inset), p.y)));
    for (let i = n; i >= 0; i--) ctx.lineTo(xo(pts[i], inset + wid * Math.min(1, pts[i].hw / 12)), pts[i].y);
    ctx.closePath();
    ctx.fill();
  };
  band(Math.max(2, g.inner.w * 0.04), sw, hl, -1);
  band(Math.max(2, g.inner.w * 0.04) + sw + 4, 1.5, lt ? 0.5 : 0.25, -1);
  band(Math.max(3, g.inner.w * 0.05), 2, lt ? 0.7 : 0.4, 1);
  if (rich && g.shape === 'tumbler') {                     // follows the right wall down its taper
    glint(ctx, c, lt, (u) => {
      const q = 1 + u * n * 0.42, i = Math.min(n - 1, Math.floor(q)), f = q - i, p = pts[i], o = pts[i + 1];
      return [p.r + (o.r - p.r) * f - g.inner.w * 0.17, p.y + (o.y - p.y) * f];
    }, g.inner.w);
  }
  ctx.restore();
}

/**
 * Over contents a scene drew itself (strata, grains, a beam): the streaks, and a shade down the far
 * side so opaque contents still read as round. drawGlassLiquid does its own. o: { shade = 0.3, profile }
 */
export function drawGlassFront(ctx, c, g, o = {}) {
  const k = o.shade ?? 0.3;
  if (k > 0) {
    ctx.save();
    glassPath(ctx, g, g.inner);
    ctx.clip();
    const x0 = g.inner.x + g.inner.w * 0.62, x1 = g.inner.x + g.inner.w;
    const sg = ctx.createLinearGradient(x0, 0, x1, 0);
    sg.addColorStop(0, alpha(darken(c.bgDeep, 0.3), 0));
    sg.addColorStop(1, alpha(darken(c.bgDeep, 0.3), k));
    ctx.fillStyle = sg;
    ctx.fillRect(x0, g.inner.y, x1 - x0, g.inner.h);
    ctx.restore();
  }
  drawStreaks(ctx, c, g, profileOf(o) === 'rich');
}

/**
 * Liquid standing in the glass, clipped to the cavity.
 * o: { level (0..1 of the inner depth) | surface (a y), fill = c.water, opacity = 0.85,
 *      sheen = true, meniscus = true, front = true, profile }
 * Deeper reads denser, the round body darker at its edges, a lighter band under the surface, and a
 * meniscus that climbs the glass at both walls. Returns the surface y (or null for no liquid).
 */
export function drawGlassLiquid(ctx, c, g, o = {}) {
  const { inner } = g;
  const sy = o.surface ?? g.floor - inner.h * clamp01(o.level ?? 0.5);
  if (sy >= g.floor - 0.5) return null;
  const fill = o.fill ?? c.water;
  const am = o.opacity ?? 0.85;
  const rich = profileOf(o) === 'rich';
  const depth = g.floor - sy;
  ctx.save();
  innerPath(ctx, g);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(g.x, sy, g.w, g.floor - sy + 2);
  ctx.clip();
  const dg = ctx.createLinearGradient(0, sy, 0, g.floor);
  dg.addColorStop(0, alpha(lighten(fill, 0.08), am * 0.92));
  dg.addColorStop(1, alpha(darken(fill, rich ? 0.2 : 0.12), Math.min(1, am * 1.05)));
  ctx.fillStyle = dg;
  ctx.fillRect(g.x, sy, g.w, depth + 2);
  const x0 = inner.x, x1 = inner.x + inner.w;
  const sg = ctx.createLinearGradient(x0, 0, x1, 0);
  sg.addColorStop(0, alpha(darken(fill, 0.25), 0.35 * am));
  sg.addColorStop(0.18, alpha(darken(fill, 0.25), 0));
  sg.addColorStop(0.8, alpha(darken(fill, 0.25), 0));
  sg.addColorStop(1, alpha(darken(fill, 0.3), 0.45 * am));
  ctx.fillStyle = sg;
  ctx.fillRect(g.x, sy, g.w, depth + 2);
  if (o.sheen !== false) {
    const bh = Math.min(14, depth * 0.22);
    const bg = ctx.createLinearGradient(0, sy, 0, sy + bh);
    bg.addColorStop(0, alpha(lighten(fill, 0.3), 0.55));
    bg.addColorStop(1, alpha(lighten(fill, 0.3), 0));
    ctx.fillStyle = bg;
    ctx.fillRect(g.x, sy, g.w, bh);
  }
  if (rich && depth > 20) {                                // light focused through the liquid onto the floor
    const cg = ctx.createRadialGradient(g.cx - inner.w * 0.1, g.floor - 3, 1, g.cx - inner.w * 0.1, g.floor - 3, inner.w * 0.4);
    cg.addColorStop(0, alpha(lighten(fill, 0.6), 0.35));
    cg.addColorStop(1, alpha(lighten(fill, 0.6), 0));
    ctx.fillStyle = cg;
    ctx.fillRect(x0, g.floor - inner.w * 0.4, inner.w, inner.w * 0.4);
  }
  ctx.restore();
  if (o.meniscus !== false) drawMeniscus(ctx, g, sy, fill, o.surfaceAlpha ?? 0.95);
  if (o.front !== false) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.x - 2, sy - 6, g.w + 4, g.floor - sy + 8);
    ctx.clip();
    drawStreaks(ctx, c, g, rich);
    ctx.restore();
  }
  return sy;
}

/** The surface line, climbing the glass at both walls. Its width follows the glass at that height. */
function drawMeniscus(ctx, g, sy, fill, k) {
  let x0 = g.inner.x, x1 = g.inner.x + g.inner.w;
  if (g.shape === 'flask' || g.shape === 'round' || g.shape === 'bottle' || PROFILED.has(g.shape)) {   // the walls are not vertical: find them at sy
    const s = wallsAt(g, sy);
    if (!s) return;
    [x0, x1] = s;
  }
  const lift = Math.min(5, (x1 - x0) * 0.08);
  ctx.save();
  innerPath(ctx, g);
  ctx.clip();
  ctx.fillStyle = alpha(lighten(fill, 0.42), k);
  ctx.beginPath();
  ctx.moveTo(x0, sy - lift);
  ctx.quadraticCurveTo(x0 + 2, sy - 1.5, x0 + lift * 1.8, sy - 1.5);
  ctx.lineTo(x1 - lift * 1.8, sy - 1.5);
  ctx.quadraticCurveTo(x1 - 2, sy - 1.5, x1, sy - lift);
  ctx.lineTo(x1, sy + 1.5);
  ctx.lineTo(x0, sy + 1.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** The inner wall x pair of a flask or round flask at height y, or null above the cavity. */
export function wallsAt(g, y) {
  const b = g.inner;
  if (y < b.y || y > b.y + b.h) return null;
  if (PROFILED.has(g.shape)) {
    const u = (y - b.y) / b.h, hw = widthAt(g, g.flip ? 1 - u : u) * b.w / 2;
    return [g.cx - hw, g.cx + hw];
  }
  const nw = b.w * g.neck, nx = b.x + (b.w - nw) / 2;
  if (g.shape === 'flask') {
    const nh = b.h * 0.3;
    if (y <= b.y + nh) return [nx, nx + nw];
    const f = (y - b.y - nh) / (b.h - nh);
    return [nx - (nx - b.x) * f, nx + nw + (b.x + b.w - nx - nw) * f];
  }
  if (g.shape === 'bottle') {
    const nh = b.h * 0.14, sh = b.h * 0.3;
    if (y <= b.y + nh) return [nx, nx + nw];
    if (y >= b.y + sh) return [b.x, b.x + b.w];
    const f = Math.sin(((y - b.y - nh) / (sh - nh)) * Math.PI / 2);
    return [nx - (nx - b.x) * f, nx + nw + (b.x + b.w - nx - nw) * f];
  }
  if (g.shape === 'round') {
    const rad = b.w / 2, cy = b.y + b.h - rad, dy = y - cy;
    if (Math.abs(dy) > rad) return null;
    const hw = Math.sqrt(rad * rad - dy * dy);
    if (y < cy && hw < nw / 2) return [nx, nx + nw];
    return [b.x + b.w / 2 - hw, b.x + b.w / 2 + hw];
  }
  return [b.x, b.x + b.w];
}

/**
 * A band of something denser at the base or floating above (sediment, an oil layer), clipped to the
 * cavity. o: { from, to (0..1 of inner depth, measured up from the floor), fill, opacity = 0.9, edge }
 * `edge` 'soft' feathers the top boundary (a layer still settling); default a sharp line.
 */
export function drawGlassBand(ctx, c, g, o = {}) {
  const { inner } = g;
  const y1 = g.floor - inner.h * clamp01(o.from ?? 0);
  const y0 = g.floor - inner.h * clamp01(o.to ?? 0.15);
  if (y1 - y0 < 0.5) return;
  const fill = o.fill ?? mix(c.glass, c.label, 0.5);
  const am = o.opacity ?? 0.9;
  ctx.save();
  innerPath(ctx, g);
  ctx.clip();
  const lg = ctx.createLinearGradient(0, y0, 0, y1);
  lg.addColorStop(0, alpha(o.edge === 'soft' ? fill : lighten(fill, 0.12), o.edge === 'soft' ? 0 : am));
  lg.addColorStop(o.edge === 'soft' ? 0.35 : 0.08, alpha(fill, am));
  lg.addColorStop(1, alpha(darken(fill, 0.15), am));
  ctx.fillStyle = lg;
  ctx.fillRect(g.x, y0, g.w, y1 - y0);
  if (o.edge !== 'soft') {
    ctx.fillStyle = alpha(lighten(fill, 0.35), 0.8);
    ctx.fillRect(g.x, y0, g.w, 1.5);
  }
  ctx.restore();
}

// -- tubing -------------------------------------------------------------------------------------

/** Run the pipe's own frame: x along the pipe from 0 to its length, y across it, centre 0. */
function pipeFrame(ctx, x0, y0, x1, y1, fn) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) return;
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
  fn(len);
  ctx.restore();
}

/**
 * A straight run of glass tubing from (x0, y0) to (x1, y1), w across: a condenser jacket, a side
 * arm, an adapter. This is the part behind the contents: far wall and body, dense at both edges.
 * The caller draws what flows in it (water, vapour) and then drawGlassPipeFront. o: { far = 0.16, body = 1 }
 */
export function drawGlassPipe(ctx, c, x0, y0, x1, y1, w, o = {}) {
  const { tk } = tone(c);
  const k = (o.body ?? 1) * tk;
  pipeFrame(ctx, x0, y0, x1, y1, (len) => {
    ctx.fillStyle = alpha(c.glass, (o.far ?? 0.16) * tk);
    ctx.fillRect(0, -w / 2, len, w);
    const bg = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
    bg.addColorStop(0, alpha(darken(c.glass, 0.1), 0.42 * k));
    bg.addColorStop(0.16, alpha(c.glass, 0.12 * k));
    bg.addColorStop(0.8, alpha(c.glass, 0.1 * k));
    bg.addColorStop(1, alpha(darken(c.glass, 0.25), 0.5 * k));
    ctx.fillStyle = bg;
    ctx.fillRect(0, -w / 2, len, w);
  });
}

/**
 * The front of a pipe, over its contents: both walls and the key light's streak along the upper
 * wall, fading at the ends where the pipe joins other glass. o: { edge = 0.85, ends = false, profile }
 * `ends` draws a lit ring across each end (a pipe that stops in the open, not one that joins).
 */
export function drawGlassPipeFront(ctx, c, x0, y0, x1, y1, w, o = {}) {
  const { lt, hl } = tone(c);
  const rich = profileOf(o) === 'rich';
  pipeFrame(ctx, x0, y0, x1, y1, (len) => {
    ctx.strokeStyle = alpha(c.glass, (o.edge ?? 0.85) * (lt ? 0.7 : 1));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -w / 2); ctx.lineTo(len, -w / 2);
    ctx.moveTo(0, w / 2); ctx.lineTo(len, w / 2);
    ctx.stroke();
    if (o.ends) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = alpha(lighten(c.glass, 0.25), 0.9);
      ctx.beginPath();
      ctx.moveTo(0, -w / 2); ctx.lineTo(0, w / 2);
      ctx.moveTo(len, -w / 2); ctx.lineTo(len, w / 2);
      ctx.stroke();
    }
    if (len < 16 || w < 5) return;
    const sw = Math.max(1.5, Math.min(5, w * 0.16));
    const sg = ctx.createLinearGradient(0, 0, len, 0);
    sg.addColorStop(0, alpha(lighten(c.glass, 0.85), 0));
    sg.addColorStop(0.12, alpha(lighten(c.glass, 0.85), hl));
    sg.addColorStop(0.7, alpha(lighten(c.glass, 0.8), hl * 0.55));
    sg.addColorStop(1, alpha(lighten(c.glass, 0.6), 0));
    ctx.fillStyle = sg;
    rr(ctx, 4, -w / 2 + Math.max(2, w * 0.12), len - 8, sw, sw / 2);
    ctx.fill();
    ctx.fillStyle = alpha(lighten(c.glass, 0.85), lt ? 0.6 : 0.35);
    ctx.fillRect(len * 0.1, w / 2 - Math.max(2.5, w * 0.14), len * 0.5, 1.5);
    if (rich) {
      ctx.fillStyle = alpha(lighten(c.glass, 0.9), lt ? 0.2 : 0.1);
      rr(ctx, len * 0.62, -w / 2 + 2, Math.min(28, len * 0.12), w * 0.3, 2);
      ctx.fill();
    }
  });
}
