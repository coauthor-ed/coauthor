/**
 * SimTrack - one straight line of motion for kinematics scenes (canvas): a
 * running track, a road, a number line or a pool lane along x with metres
 * mapped to px, pins with tags that never overlap, a strobe of ghost copies, a
 * speedometer, and the four motion arrows (v, a, F, s) in fixed tones.
 *
 *   const spec = trackSpec({ from: 0, to: 100, x0: 40, x1: 640, y: 380 });
 *   spec.toPx(m) / spec.fromPx(px)             metres <-> design px along x; spec.y = the running line
 *   drawTrack(ctx, c, spec, { kind: 'track' | 'road' | 'line' | 'pool', every, origin, signs, points, unit, lanes, depth, size })
 *     -> { y, top, bottom, tickY, labelY, low, pins: [{ m, x, y, tag }] }
 *   drawStrobe(ctx, c, spec, { at: [m0, m1, ...], draw(ctx, x, y, i, k), fade, gaps, gapLabels, bracketY, tone, size })
 *     -> { brackets: [{ x0, x1, y, label }] }
 *   drawSpeedometer(ctx, c, { x, y, r = 100, max = 120, value, unit = 'km/h', major = 20, minor = 10, digital, size })
 *     -> { x, y, r, tip, box }
 *   drawMotionArrow(ctx, c, kind, x, y, { length | magnitude + scale, angle, label, side, size, frame, alpha })
 *     -> { x2, y2, len, kind, label: box | null }
 *   ARROW_KINDS   { v, a, F, s }: { name, tone, width, head, dashed } so scenes and legends agree
 * W1 additions: drawTrack o.ticks false (no ticks or labels), o.scroll (m: dashes and lane marks slide);
 *   drawStrobe o.marks 'dots' | 'ticks' (+ o.dt or o.timeLabels, o.markTone) instead of ghosts;
 *   drawSpeedometer labels every other major tick under r 70;
 *   drawScale(ctx, c, { vertical, at, p0, p1, from, to, every, origin, unit, size, side, arrow }) -> { toPx, fromPx, box, arrow }
 *   isPortrait(w, h), stackLayout(w, h, parts, { pad, gap, portrait }) -> rects (pure)
 *
 * Text is 26 design px by default (o.size), with a halo in the backdrop colour
 * and never on the object. Colours are tokens (c.*); series inks for text.
 * ASCII only.
 */
import { MIN_PX, rr, ellipse, darken, lighten, alpha, mix, luma, inkOn, font, clamp, vectorArrow, chipSize } from './SimLook.js';
import { displacementArrow } from './SimApparatus.js';

const TAU = Math.PI * 2;
const SIZE = 26;
const paleOf = (c) => darken(luma(c.label) > luma(c.bgSurface) ? c.label : c.bgSurface, 0.06);
const fmt = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(1)));

/** The four arrow kinds of a physics scene: one tone, weight and dash each. */
export const ARROW_KINDS = {
  v: { name: 'velocity', tone: 1, width: 5, head: 15, dashed: false },
  a: { name: 'acceleration', tone: 2, width: 3.5, head: 12, dashed: false },
  F: { name: 'force', tone: 3, width: 7.5, head: 18, dashed: false },
  s: { name: 'displacement', tone: 4, width: 4.5, head: 14, dashed: true },
};

// Text with a halo in the backdrop colour, so it reads over a track, a sky or a plot.
function halo(ctx, c, text, x, y, o = {}) {
  const size = Math.max(MIN_PX, o.size ?? SIZE);
  ctx.save();
  ctx.font = font(c, o.weight ?? 800, size, o.display ?? true);
  ctx.textAlign = o.align ?? 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.strokeStyle = alpha(c.bgSurface, 0.92); ctx.lineWidth = Math.max(5, size * 0.28);
  ctx.strokeText(String(text), x, y);
  ctx.fillStyle = o.col ?? c.label; ctx.fillText(String(text), x, y);
  const w = ctx.measureText(String(text)).width;
  ctx.restore();
  const x0 = (o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2);
  return { x0, y0: y - size * 0.6, w, h: size * 1.2 };
}

function textW(ctx, c, text, size) {
  ctx.save(); ctx.font = font(c, 800, size, true); const w = ctx.measureText(String(text)).width; ctx.restore(); return w;
}

// -- Spec (pure) --------------------------------------------------------------------------

export function trackSpec(o = {}) {
  const from = o.from ?? 0, to = o.to ?? 100, x0 = o.x0 ?? 40, x1 = o.x1 ?? 640, y = o.y ?? 380;
  const scale = (x1 - x0) / (to - from);
  return { from, to, x0, x1, y, scale, toPx: (m) => x0 + (m - from) * scale, fromPx: (px) => from + (px - x0) / scale };
}

const DEPTH = { track: 50, road: 64, pool: 64, line: 12 };

// -- Track ---------------------------------------------------------------------------------

/**
 * The strip spans spec.y +- depth/2 (objects stand on spec.y), ticks and metre
 * labels sit under it, pins above it. o.points [{ m, label, tone }]: tags in rows
 * so none overlap. o.signs: '+' and '-' tints either side of the origin and an
 * arrow for the positive direction. o.origin (default 0 if in range, else none)
 * is labelled O.
 */
export function drawTrack(ctx, c, spec, o = {}) {
  const kind = o.kind ?? 'track', size = o.size ?? SIZE, d = o.depth ?? DEPTH[kind] ?? 50;
  const { x0, x1, y } = spec, top = y - d / 2, bot = y + d / 2, w = x1 - x0, unit = o.unit ?? 'm';
  const origin = o.origin !== undefined ? o.origin : (spec.from <= 0 && spec.to >= 0 ? 0 : null);
  ctx.save();
  if (kind === 'line') {
    const col = c.label;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0 - 14, y); ctx.lineTo(x1 + 14, y); ctx.stroke();
    for (const [ex, s] of [[x1 + 26, 1], [x0 - 26, -1]]) { ctx.beginPath(); ctx.moveTo(ex, y); ctx.lineTo(ex - s * 16, y - 9); ctx.lineTo(ex - s * 16, y + 9); ctx.closePath(); ctx.fill(); }
  } else {
    const base = kind === 'road' ? mix(c.bgDeep, c.label, 0.24)
      : kind === 'pool' ? mix(c.water, c.bgSurface, 0.25)
      : darken(mix(c.s8, c.bad, 0.45), 0.12);
    const pad = kind === 'road' ? 10 : 0;
    // Verge / pool deck: a lighter rim strip each side.
    const edge = kind === 'road' ? mix(c.setGround ?? c.bgSurface, c.label, 0.12) : kind === 'pool' ? paleOf(c) : mix(c.setGround ?? c.bgSurface, c.good, 0.35);
    rr(ctx, x0 - 18, top - 8 - pad, w + 36, d + 16 + pad * 2, 8); ctx.fillStyle = edge; ctx.fill();
    ctx.strokeStyle = darken(edge, 0.3); ctx.lineWidth = 2.5; ctx.stroke();
    ctx.save(); ctx.translate(0, 5); rr(ctx, x0 - 10, top, w + 20, d, 6); ctx.fillStyle = darken(base, 0.42); ctx.fill(); ctx.restore();   // lip
    rr(ctx, x0 - 10, top, w + 20, d, 6); ctx.fillStyle = base; ctx.fill();
    ctx.save(); rr(ctx, x0 - 10, top, w + 20, d, 6); ctx.clip();
    ctx.fillStyle = darken(base, 0.16); ctx.fillRect(x0 - 10, top + d * 0.64, w + 20, d);
    ctx.fillStyle = alpha(lighten(base, 0.4), 0.7); ctx.fillRect(x0 - 6, top + 2, w + 12, 3);   // lit far edge (inner line)
    const sp = (o.scroll ?? 0) * spec.scale, wrap = (p) => ((sp % p) + p) % p;         // o.scroll (m): marks slide back as the scene moves on
    if (kind === 'track') {
      const n = Math.max(1, o.lanes ?? 2), lc = alpha(paleOf(c), 0.85);
      if (o.scroll != null) { ctx.fillStyle = alpha(paleOf(c), 0.5); for (let x = x0 - 10 - wrap(60); x < x1 + 10; x += 60) for (let i = 0; i < n; i++) ctx.fillRect(x, top + (d * (i + 0.5)) / n - 1.5, 14, 3); }
      ctx.fillStyle = lc;
      for (let i = 0; i <= n; i++) ctx.fillRect(x0 - 10, top + (d * i) / n - (i === 0 ? 0 : i === n ? 3 : 1.5), w + 20, 3);
    } else if (kind === 'road') {
      ctx.fillStyle = alpha(c.gold, 0.9);
      for (let x = x0 - 50 - wrap(46); x < x1 + 10; x += 46) rr(ctx, x, y - 2.5, 26, 5, 2.5), ctx.fill();
      ctx.fillStyle = alpha(paleOf(c), 0.8); ctx.fillRect(x0 - 10, top + 5, w + 20, 3); ctx.fillRect(x0 - 10, bot - 7, w + 20, 3);
    } else if (kind === 'pool') {
      ctx.fillStyle = alpha(lighten(base, 0.5), 0.45);                              // ripples
      for (let x = x0, j = 0; x < x1; x += 38, j++) { ellipse(ctx, x - wrap(38) + (j % 2) * 14, top + d * 0.3 + (j % 3) * 6, 12, 2.2); ctx.fill(); }
      for (const ry of [top + 6, bot - 6]) {                                         // lane ropes: floats in two series tones
        for (let x = x0 - 6, i = 0; x < x1 + 8; x += 14, i++) { ctx.beginPath(); ctx.arc(x, ry, 4.5, 0, TAU); ctx.fillStyle = i % 6 < 3 ? c.s1 : c.s6; ctx.fill(); }
      }
      ctx.fillStyle = darken(base, 0.3); ctx.fillRect(x0 - 3, y - 2, w + 6, 4);    // the black line on the floor
    }
    ctx.restore();
    rr(ctx, x0 - 10, top, w + 20, d, 6); ctx.strokeStyle = darken(base, 0.38); ctx.lineWidth = 2.5; ctx.stroke();
    if (kind === 'pool') for (const ex of [x0 - 10, x1 + 10]) { rr(ctx, ex - 5, top - 10, 10, d + 20, 4); ctx.fillStyle = paleOf(c); ctx.fill(); ctx.strokeStyle = darken(paleOf(c), 0.3); ctx.lineWidth = 2; ctx.stroke(); }
  }
  // Sign tints under the ticks and the positive-direction arrow.
  const tickY = (kind === 'line' ? y : bot + (kind === 'road' ? 18 : 8)) + 2, labelY = tickY + 12 + size * 0.6;
  let low = labelY + size * 0.6;
  const noTicks = o.ticks === false || o.labels === false;
  if (o.signs && origin != null && !noTicks) {
    const ox = spec.toPx(origin);
    ctx.save(); ctx.globalAlpha = 0.16;
    ctx.fillStyle = c.s1; ctx.fillRect(ox, tickY - 2, x1 + 10 - ox, labelY - tickY + size * 0.7);
    ctx.fillStyle = c.s5; ctx.fillRect(x0 - 10, tickY - 2, ox - x0 + 10, labelY - tickY + size * 0.7);
    ctx.restore();
    const ay = labelY + size * 1.15;
    if (x1 - ox > 90) { vectorArrow(ctx, c, ox + 30, ay, { length: Math.min(160, x1 - ox - 60), col: c.s1ink, width: 4, head: 13 }); halo(ctx, c, '+', ox + 16, ay, { size, col: c.s1ink }); }
    if (ox - x0 > 50) halo(ctx, c, '-', ox - 18, ay, { size, col: c.s5ink });
    low = ay + size * 0.6;
  }
  // Ticks every o.every m; labels thinned so they never touch; O at the origin; the unit on the last label.
  const span = spec.to - spec.from, every = o.every ?? (span <= 10 ? 1 : span <= 30 ? 5 : span <= 120 ? 10 : span <= 300 ? 50 : 100);
  const ticks = [];
  for (let m = Math.ceil(spec.from / every) * every; m <= spec.to + 1e-9; m += every) ticks.push(+m.toFixed(6));
  const labels = ticks.map((m, i) => (m === origin ? 'O' : fmt(m) + (i === ticks.length - 1 ? ' ' + unit : '')));
  const widths = labels.map((t) => textW(ctx, c, t, size));
  const gap = spec.scale * every;
  let skip = 1; while (skip < 10 && widths.some((wd) => wd + 10 > gap * skip)) skip++;
  ctx.strokeStyle = c.label; ctx.lineWidth = 3; ctx.lineCap = 'round';
  if (noTicks) { ticks.length = 0; low = bot + 8; }
  ticks.forEach((m, i) => {
    const tx = spec.toPx(m), major = i % skip === 0 || m === origin;
    ctx.beginPath(); ctx.moveTo(tx, tickY - (kind === 'line' ? 10 : 0)); ctx.lineTo(tx, tickY + (major ? 12 : 7)); ctx.stroke();
    if (major) halo(ctx, c, labels[i], tx, labelY, { size, col: m === origin ? c.annot : c.label });
  });
  // Pins with tags in rows (nudge up until clear).
  const rows = [], pins = [];
  const pts = (o.points ?? []).map((p) => ({ ...p, x: spec.toPx(p.m) })).sort((a, b) => a.x - b.x);
  for (const p of pts) {
    const tw = textW(ctx, c, p.label ?? '', size) + 22;
    let r = 0; while (rows[r] != null && rows[r] > p.x - tw / 2 - 6) r++;
    rows[r] = p.x + tw / 2;
    const ty = top - 26 - size * 0.6 - r * (size + 16);
    const col = typeof p.tone === 'number' ? c['s' + p.tone] : c[p.tone ?? 'annot'] ?? c.annot;
    ctx.strokeStyle = darken(col, 0.2); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(p.x, ty + size * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, y, 7, 0, TAU); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = darken(col, 0.4); ctx.lineWidth = 2.5; ctx.stroke();
    // A light tag with a coloured rim (never a dark pill over the object).
    const tx = clamp(p.x, x0 + tw / 2 - 14, x1 - tw / 2 + 14);
    ctx.save(); ctx.translate(0, 3); rr(ctx, tx - tw / 2, ty - size * 0.62, tw, size * 1.24, 9); ctx.fillStyle = darken(col, 0.35); ctx.fill(); ctx.restore();
    rr(ctx, tx - tw / 2, ty - size * 0.62, tw, size * 1.24, 9); ctx.fillStyle = paleOf(c); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
    ctx.font = font(c, 800, size, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = inkOn(c, paleOf(c));
    ctx.fillText(String(p.label ?? ''), tx, ty + 1);
    pins.push({ m: p.m, x: p.x, y, tag: { x0: tx - tw / 2, y0: ty - size * 0.62, w: tw, h: size * 1.24 } });
  }
  ctx.restore();
  return { y, top, bottom: bot, tickY, labelY, low, pins };
}

// -- Strobe ----------------------------------------------------------------------------------

/**
 * Ghost copies at equal time steps: o.draw(ctx, x, y, i, k) paints copy i at
 * px (x, spec.y) with k = its strength 0..1 (the newest is 1; globalAlpha is set
 * for you). o.gaps: brackets between neighbours at o.bracketY (default 110 px
 * above the line), labelled o.gapLabels[i] or the gap in metres.
 */
export function drawStrobe(ctx, c, spec, o = {}) {
  const at = o.at ?? [], n = at.length, fade = o.fade ?? 0.22, size = o.size ?? SIZE;
  const marks = o.marks === 'dots' || o.marks === 'ticks' ? o.marks : null, mcol = o.markTone != null ? (typeof o.markTone === 'number' ? c['s' + o.markTone] : c[o.markTone]) : c.annot;
  const rowEnd = [];
  for (let i = 0; i < n; i++) {
    const x = spec.toPx(at[i]);
    if (marks) {                                                                    // equal-time marks instead of ghosts
      ctx.save();
      if (marks === 'dots') { ctx.beginPath(); ctx.arc(x, spec.y, 7, 0, TAU); ctx.fillStyle = mcol; ctx.fill(); ctx.strokeStyle = darken(mcol, 0.4); ctx.lineWidth = 2.5; ctx.stroke(); }
      else { ctx.strokeStyle = mcol; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, spec.y - 12); ctx.lineTo(x, spec.y + 12); ctx.stroke(); }
      ctx.restore();
      const tl = o.timeLabels?.[i] ?? (o.dt != null ? fmt(i * o.dt) + ' s' : null);
      if (tl != null) {                                                              // close marks: labels step up a row, never overlap
        const tw = textW(ctx, c, tl, size); let row = 0;
        while (rowEnd[row] != null && rowEnd[row] > x - tw / 2 - 6) row++;
        rowEnd[row] = x + tw / 2;
        if (row) { ctx.save(); ctx.strokeStyle = alpha(c.label, 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, spec.y - 12); ctx.lineTo(x, spec.y - 14 - row * (size + 14)); ctx.stroke(); ctx.restore(); }
        halo(ctx, c, tl, x, spec.y - 14 - size * 0.6 - row * (size + 14), { size, col: c.label });
      }
      continue;
    }
    const k = n === 1 ? 1 : fade + ((1 - fade) * i) / (n - 1);
    ctx.save(); ctx.globalAlpha *= k; o.draw?.(ctx, x, spec.y, i, k); ctx.restore();
  }
  const brackets = [];
  if (o.gaps && n > 1) {
    const by = o.bracketY ?? spec.y - 110, col = o.tone != null ? (typeof o.tone === 'number' ? c['s' + o.tone + 'ink'] : c[o.tone]) : c.label;
    for (let i = 0; i < n - 1; i++) {
      const a = spec.toPx(at[i]), b = spec.toPx(at[i + 1]), lab = o.gapLabels?.[i] ?? fmt(Math.abs(at[i + 1] - at[i])) + ' m';
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a + 3, by + 9); ctx.lineTo(a + 3, by); ctx.lineTo(b - 3, by); ctx.lineTo(b - 3, by + 9); ctx.stroke(); ctx.restore();
      const lw = textW(ctx, c, lab, size), row = lw + 8 > b - a ? (i % 2) : 0;            // a tight gap staggers its label up
      halo(ctx, c, lab, (a + b) / 2, by - size * 0.7 - row * (size + 4), { size, col });
      brackets.push({ x0: a, x1: b, y: by, label: lab });
    }
  }
  return { brackets };
}

// -- Speedometer -------------------------------------------------------------------------------

export function drawSpeedometer(ctx, c, o = {}) {
  const x = o.x ?? 340, y = o.y ?? 260, r = o.r ?? 100, max = o.max ?? 120, v = clamp(o.value ?? 0, 0, max);
  const size = o.size ?? Math.max(MIN_PX, Math.min(SIZE, r * 0.26)), a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  const major = o.major ?? (r < 90 ? 40 : 20), minor = o.minor ?? major / 2, ang = (val) => a0 + (a1 - a0) * (val / max);
  const rimCol = toneOf3(c, o.tone), face = paleOf(c), ink = inkOn(c, face);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y + 5, r, 0, TAU); ctx.fillStyle = darken(rimCol, 0.42); ctx.fill();           // lip
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = rimCol; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r * 0.88, 0, TAU); ctx.fillStyle = face; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * 0.88, 0, TAU); ctx.clip();
  ctx.fillStyle = darken(face, 0.07); ctx.fillRect(x - r, y + r * 0.35, 2 * r, r);
  ctx.restore();
  ctx.fillStyle = alpha(lighten(rimCol, 0.45), 0.85); ellipse(ctx, x - r * 0.5, y - r * 0.72, r * 0.2, r * 0.06, -0.6); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = darken(rimCol, 0.38); ctx.lineWidth = 2.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.83, ang(max * 0.75), a1); ctx.strokeStyle = alpha(c.bad, 0.5); ctx.lineWidth = r * 0.05; ctx.stroke();   // the high band
  ctx.strokeStyle = ink; ctx.lineCap = 'round';
  for (let s = 0; s <= max + 1e-9; s += minor) {
    const isMaj = Math.abs(s / major - Math.round(s / major)) < 1e-6, a = ang(s), r0 = r * (isMaj ? 0.74 : 0.79);
    ctx.lineWidth = isMaj ? 3.5 : 2;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86); ctx.stroke();
  }
  const every2 = r < 70 ? 2 : 1;                                                       // a small dial labels every other major tick
  const numbers = () => {                                                              // after the needle, haloed in the face colour
    ctx.font = font(c, 800, size, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (let s = 0; s <= max + 1e-9; s += major * every2) {
      const a = ang(s), nx0 = x + Math.cos(a) * r * 0.58, ny0 = y + Math.sin(a) * r * 0.58;
      ctx.strokeStyle = face; ctx.lineWidth = Math.max(5, size * 0.3); ctx.strokeText(fmt(s), nx0, ny0);
      ctx.fillStyle = ink; ctx.fillText(fmt(s), nx0, ny0);
    }
  };
  ctx.font = font(c, 700, Math.max(MIN_PX, size * 0.85), false); ctx.fillStyle = ink; ctx.textAlign = 'center';
  ctx.fillText(o.unit ?? 'km/h', x, y + r * 0.6);
  // Numbers, then the needle (short: inside the ring of numbers, so it never crosses one), the hub, and a marker on the tick ring.
  numbers();
  const a = ang(v), tip = { x: x + Math.cos(a) * r * 0.38, y: y + Math.sin(a) * r * 0.38 }, nx = -Math.sin(a), ny = Math.cos(a), hw = Math.max(4, r * 0.05);
  const needle = () => { ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(x + nx * hw - Math.cos(a) * r * 0.12, y + ny * hw - Math.sin(a) * r * 0.12); ctx.lineTo(x - nx * hw - Math.cos(a) * r * 0.12, y - ny * hw - Math.sin(a) * r * 0.12); ctx.closePath(); };
  ctx.save(); ctx.translate(0, 3); needle(); ctx.fillStyle = alpha(darken(c.bad, 0.5), 0.6); ctx.fill(); ctx.restore();
  needle(); ctx.fillStyle = c.bad; ctx.fill(); ctx.strokeStyle = darken(c.bad, 0.35); ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.1, 0, TAU); ctx.fillStyle = mix(c.bgDeep, c.label, 0.25); ctx.fill();
  ctx.beginPath(); ctx.arc(x - r * 0.03, y - r * 0.03, r * 0.035, 0, TAU); ctx.fillStyle = alpha(paleOf(c), 0.7); ctx.fill();
  const mk = (k) => ({ x: x + Math.cos(a) * r * k, y: y + Math.sin(a) * r * k });
  const m0 = mk(0.7), m1 = mk(0.88), mw = Math.max(5, r * 0.06);
  ctx.beginPath(); ctx.moveTo(m0.x, m0.y); ctx.lineTo(m1.x + nx * mw, m1.y + ny * mw); ctx.lineTo(m1.x - nx * mw, m1.y - ny * mw); ctx.closePath();
  ctx.fillStyle = c.bad; ctx.fill(); ctx.strokeStyle = darken(c.bad, 0.35); ctx.lineWidth = 2; ctx.stroke();
  let box = { x0: x - r, y0: y - r, w: 2 * r, h: 2 * r };
  if (o.digital != null) {
    const ds = Math.max(SIZE, size), txt = String(o.digital), tw = textW(ctx, c, txt, ds) + 28, ty = y + r + 14;
    ctx.save(); ctx.translate(0, 4); rr(ctx, x - tw / 2, ty, tw, ds * 1.5, 10); ctx.fillStyle = darken(rimCol, 0.45); ctx.fill(); ctx.restore();
    rr(ctx, x - tw / 2, ty, tw, ds * 1.5, 10); ctx.fillStyle = mix(c.bgDeep, c.label, 0.12); ctx.fill(); ctx.strokeStyle = rimCol; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.font = font(c, 700, ds, true); ctx.fillStyle = c.s3ink ?? c.good; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = inkOn(c, mix(c.bgDeep, c.label, 0.12)); ctx.fillText(txt, x, ty + ds * 0.78);
    box = { x0: x - r, y0: y - r, w: 2 * r, h: ty + ds * 1.5 + 4 - (y - r) };
  }
  ctx.restore();
  return { x, y, r, tip, box };
}

function toneOf3(c, t) { return t == null ? mix(c.bgDeep, c.label, 0.3) : typeof t === 'number' ? c['s' + t] : (c[t] ?? t); }

// -- Motion arrows -------------------------------------------------------------------------------

/**
 * kind 'v' | 'a' | 'F' | 's' (ARROW_KINDS). (x, y) is the tail (F: put it on
 * the object). Length: o.length, or |o.magnitude| * o.scale (default 4) clamped
 * to minLen..maxLen; o.magnitude = 0 or o.length = 0 draws a dot with the label
 * ("a = 0"). o.angle radians (0 right, y down). The label (value with unit)
 * sits beside the shaft, side 1 = left of the travel direction (above a
 * rightward arrow; default), -1 the other side; o.at 0..1 along the shaft (0.55).
 */
export function drawMotionArrow(ctx, c, kind, x, y, o = {}) {
  const K = ARROW_KINDS[kind] ?? ARROW_KINDS.v, col = c['s' + K.tone], ink = c['s' + K.tone + 'ink'] ?? col, size = o.size ?? SIZE;
  const ang = o.angle ?? 0, ca = Math.cos(ang), sa = Math.sin(ang), wid = o.width ?? K.width, head = o.head ?? K.head;
  let len = o.length;
  if (len == null) len = o.magnitude == null ? 80 : o.magnitude === 0 ? 0 : clamp(Math.abs(o.magnitude) * (o.scale ?? 4), o.minLen ?? 26, o.maxLen ?? 220);
  const back = alpha(c.bgSurface, 0.75);
  ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
  let x2 = x, y2 = y, labelAt;
  const side = o.side === -1 ? -1 : 1, nx = sa * side, ny = -ca * side;
  if (len < 1) {
    ctx.beginPath(); ctx.arc(x, y, wid + 4, 0, TAU); ctx.fillStyle = back; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, wid + 1.5, 0, TAU); ctx.fillStyle = col; ctx.fill();
    labelAt = { x: x + nx * (size * 0.9 + 6), y: y + ny * (size * 0.9 + 6) };
  } else {
    x2 = x + ca * len; y2 = y + sa * len;
    if (K.dashed) {
      displacementArrow(ctx, c, x, y, x2, y2, { col: back, width: wid + 5, head: head + 5, dash: [11, 5] });
      displacementArrow(ctx, c, x, y, x2, y2, { col, width: wid, head, dash: [10, 7] });
    } else {
      vectorArrow(ctx, c, x - ca * 2, y - sa * 2, { length: len + 3, angle: ang, col: back, width: wid + 5, head: head + 5 });
      vectorArrow(ctx, c, x, y, { length: len, angle: ang, col, width: wid, head });
    }
    const at = o.at ?? 0.55, w0 = o.label != null ? textW(ctx, c, o.label, size) : 0;
    const dist = wid / 2 + 8 + Math.abs(nx) * w0 / 2 + Math.abs(ny) * size * 0.6;
    labelAt = { x: x + ca * len * at + nx * dist, y: y + sa * len * at + ny * dist };
  }
  ctx.restore();
  let box = null;
  if (o.label != null && o.label !== '') {
    const f = o.frame ?? { x: 0, y: 0, w: 680, h: 520 }, w0 = textW(ctx, c, o.label, size);
    const lx = clamp(labelAt.x, f.x + w0 / 2 + 4, f.x + f.w - w0 / 2 - 4), ly = clamp(labelAt.y, f.y + size * 0.6 + 2, f.y + f.h - size * 0.6 - 2);
    box = halo(ctx, c, o.label, lx, ly, { size, col: ink, alpha: o.alpha ?? 1 });
  }
  return { x2, y2, len, kind, label: box };
}

// -- W1 additions: a metre scale and a stacking layout -------------------------------------

/**
 * A metre ruler, vertical (default; from at the bottom p0, to at the top p1) or
 * horizontal (from at p0 on the left). o: { vertical = true, at (x of a vertical
 * bar, y of a horizontal one), p0, p1 (px along it), from = 0, to = 10, every,
 * origin (default 0 when in range, labelled O), unit = 'm', size = 26, side
 * (labels: -1 left / below (default), 1 right / above), arrow (true or a label,
 * default '+'): a direction arrow on the other side, its label clear of the ticks }.
 * Returns { toPx(m), fromPx(px), box, arrow: box | null }.
 */
export function drawScale(ctx, c, o = {}) {
  const vert = o.vertical !== false, at = o.at ?? 60, p0 = o.p0 ?? (vert ? 460 : 60), p1 = o.p1 ?? (vert ? 80 : 620);
  const from = o.from ?? 0, to = o.to ?? 10, size = o.size ?? SIZE, unit = o.unit ?? 'm', side = o.side === 1 ? 1 : -1;
  const origin = o.origin !== undefined ? o.origin : (from <= 0 && to >= 0 ? 0 : null);
  const toPx = (m) => p0 + ((m - from) / (to - from)) * (p1 - p0), fromPx = (px) => from + ((px - p0) / (p1 - p0)) * (to - from);
  const span = Math.abs(to - from), every = o.every ?? (span <= 10 ? 1 : span <= 30 ? 5 : span <= 120 ? 10 : 50);
  const P = (along, across) => (vert ? { x: at + across, y: along } : { x: along, y: at + across });
  const lo = Math.min(p0, p1), hi = Math.max(p0, p1), bw = 14, base = paleOf(c);
  ctx.save();
  // The bar: a rimmed rule with a lip and a lit inner line.
  const bar = () => (vert ? rr(ctx, at - bw / 2, lo - 6, bw, hi - lo + 12, 6) : rr(ctx, lo - 6, at - bw / 2, hi - lo + 12, bw, 6));
  ctx.save(); ctx.translate(0, 4); bar(); ctx.fillStyle = darken(base, 0.4); ctx.fill(); ctx.restore();
  bar(); ctx.fillStyle = base; ctx.fill(); ctx.strokeStyle = darken(base, 0.4); ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = c.label; ctx.lineCap = 'round';
  const ticks = [];
  for (let m = Math.ceil(Math.min(from, to) / every) * every; m <= Math.max(from, to) + 1e-9; m += every) ticks.push(+m.toFixed(6));
  const minor = o.minor ?? every / 5, gapPx = Math.abs(toPx(minor) - toPx(0));
  if (gapPx >= 6) for (let m = Math.ceil(Math.min(from, to) / minor) * minor; m <= Math.max(from, to) + 1e-9; m += minor) {
    const a = toPx(m), q0 = P(a, -bw / 2 + 2), q1 = P(a, -bw / 2 + 7); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke();
  }
  let maxW = 0;
  ticks.forEach((m, i) => {
    const a = toPx(m), q0 = P(a, side * (bw / 2 - 2)), q1 = P(a, side * (bw / 2 + 10));
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke();
    const t = m === origin ? 'O' : fmt(m) + (i === ticks.length - 1 ? ' ' + unit : ''), w = textW(ctx, c, t, size);
    maxW = Math.max(maxW, w);
    const lp = vert ? P(a, side * (bw / 2 + 16 + w / 2)) : P(a, side * (bw / 2 + 14 + size * 0.6));
    halo(ctx, c, t, lp.x, lp.y, { size, col: m === origin ? c.annot : c.label });
  });
  let arrow = null;
  if (o.arrow) {
    const lab = o.arrow === true ? '+' : String(o.arrow), dir = Math.sign(p1 - p0) || -1, off = -side * (bw / 2 + 16);
    const s0 = P(lo + (hi - lo) * (dir > 0 ? 0.25 : 0.75), off), len = (hi - lo) * 0.45;
    const ang = vert ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    vectorArrow(ctx, c, s0.x, s0.y, { length: len, angle: ang, col: c.s1ink, width: 4, head: 13 });
    const e = { x: s0.x + Math.cos(ang) * (len + 8 + size * 0.5), y: s0.y + Math.sin(ang) * (len + 8 + size * 0.5) };
    const lw = textW(ctx, c, lab, size), lp = vert ? { x: s0.x + -side * Math.max(0, lw / 2 - 6), y: e.y } : { x: e.x + dir * lw / 2, y: s0.y };
    arrow = halo(ctx, c, lab, lp.x, lp.y, { size, col: c.s1ink });
  }
  ctx.restore();
  const ext = bw / 2 + 16 + (vert ? maxW : size * 1.2);
  const box = vert ? { x0: Math.min(at - ext, at - bw), y0: lo - size, w: ext + bw + (o.arrow ? 40 : 0), h: hi - lo + 2 * size }
    : { x0: lo - 6, y0: at - ext, w: hi - lo + 12, h: 2 * ext };
  return { toPx, fromPx, box, arrow };
}

/** True when a frame is taller than it is wide (a phone). Pure. */
export function isPortrait(w, h) { return h > w * 1.05; }

/**
 * Rects for n parts (or an array of weights): stacked top to bottom on a portrait
 * frame, side by side on a landscape one. o: { pad = 16, gap = 16, portrait (force) }.
 * Pure. Returns [{ x, y, w, h }].
 */
export function stackLayout(w, h, parts, o = {}) {
  const ws = Array.isArray(parts) ? parts.map((v) => Math.max(0, +v || 0)) : Array.from({ length: Math.max(1, parts | 0) }, () => 1);
  const pad = o.pad ?? 16, gap = o.gap ?? 16, tall = o.portrait ?? isPortrait(w, h), sum = ws.reduce((a, b) => a + b, 0) || 1;
  const avail = (tall ? h : w) - 2 * pad - gap * (ws.length - 1);
  let p = pad;
  return ws.map((k) => {
    const len = (avail * k) / sum, r = tall ? { x: pad, y: p, w: w - 2 * pad, h: len } : { x: p, y: pad, w: len, h: h - 2 * pad };
    p += len + gap; return r;
  });
}
