/**
 * SimWave - the shared WAVE cast for canvas scenes: one computed model of a
 * mechanical wave and the parts that draw it (air particles in a tube, a
 * density graph, a slinky, a rope, rings round a point source, the sound arcs,
 * a pulse out and back, direction arrows). Generic: every word comes in as a
 * caller label. All sizes are design px on the 680x520 stage; labels are
 * Fredoka pills at 26 (the floor that stays about 11 px on a 390 phone).
 * Colours: resolved c.* tokens only. Dots and curves: c.s1. The marked
 * particle, turn or point and the vibration arrow: always c.s6 (red).
 * Every draw is pure on its inputs (t is a number in seconds): no state kept
 * between frames, so any beat is right from a cold start. Jitter is seeded.
 *
 * THE MODEL. One source motion f(t) (design px) drives everything. A particle
 * at distance d from the source (mean position) sits displaced by
 *   s(d, t) = f(t - d / v)   when t >= d / v, else 0    (v in px per second)
 * Longitudinal: along the travel direction. Transverse: perpendicular.
 * Relative density rho(d, t) = 1 / (1 + ds/dd) (numerical), never painted.
 * Keep amp below wavelength / 6.3 or neighbours would cross. For a strip whose
 * rarefactions read as clearly as its compressions use swingAmp(wavelength) (default
 * swing 0.35: about 0.086 x wavelength; R about 35 per cent sparser, C much denser).
 *   swingAmp(wavelength, swing = 0.35) -> amp     (sineSource({ wavelength }) uses it when amp is not given)
 *
 *   sineSource({ amp = 10, freq = 1, start = 0 }) -> f(t)        starts at rest at t = start
 *   pistonSource({ strokes: [{ at, to, dur }], repeat = 0, from = 0 }) -> f(t)
 *       the piston's position: from where it is to 'to' over dur from time 'at'
 *       (eased), held between strokes; it starts each cycle at 'from' (0 before t = 0).
 *       repeat > 0 replays the list every repeat s (end the list at 'from' for a
 *       smooth loop). A sine-like piston: from -A, [{ at: 0, to: A, dur: T/2 },
 *       { at: T/2, to: -A, dur: T/2 }], repeat T (the first cycle starts with a jump).
 *   pulseSource({ amp = 10, dur = 0.4, at = 0 }) -> f(t)        one push, then back to rest
 *   sumSources(f1, f2, ...) -> f(t)
 *     Every f carries metadata: f.kind, f.amp, f.period (s or null),
 *     f.wavelength(v) (px or null), f.span (s, one cycle or the whole motion).
 *
 *   waveField({ source, v = 120, origin = 0, dir = 1, falloff = 0 }) -> field
 *     origin: the x where d = 0 (the source); dir 1 = travels right, -1 = left.
 *     falloff > 0: amplitude x falloff / (falloff + d) (rings round a point).
 *     field.s(d, t), field.rho(d, t), field.xAt(d, t) (displaced x), field.front(t) (px reached),
 *     field.regions(t, d0, d1, { th = 0.04 }) -> [{ kind: 'C' | 'R', d, x, rho }]
 *       (C: local max of rho above 1 + th; R: local min below 1 - th; x = where it is now),
 *     field.maxStrain, field.rhoRange [lo, hi] (fixed, for graph scales),
 *     field.rhoLin(d, t) = 1 - ds/dd and field.rhoRangeLin: the small-amplitude density (a
 *       symmetric curve like the book's graph; same crest and trough places as rho).
 *
 *   drawParticleStrip(ctx, c, o) -> { box, regions, marked, minGap, piston }
 *   drawDensityGraph(ctx, c, o) -> { crests, troughs, yOf(rho), avgY, box }
 *   drawSlinky(ctx, c, o) -> { turns, marked, regions, hands: [left, right] }
 *   drawRope(ctx, c, o) -> { marked, ends }
 *   drawRings(ctx, c, o) -> { regions }
 *   drawSoundArcs(ctx, c, o) -> { radii }
 *   outAndBack(o, t) -> { x, y, leg: 'wait' | 'out' | 'back' | 'done', elapsed, u, dist, tOut, tTotal }
 *   drawOutAndBack(ctx, c, o) -> the same state
 *   drawPropagationArrow(ctx, c, o), drawVibrationArrow(ctx, c, o) -> { box }
 * Options for each are listed above each function. The API page for scene
 * authors is the module's kit-api-K1.md.
 * ASCII only. No faces on anything.
 */
import { W, H, alpha, mix, lighten, darken, luma, font, pill, chipSize, vectorArrow, inOutSine, clamp } from './SimLook.js';

const TAU = Math.PI * 2;
const SIZE = 26;
const toneOf = (c, t) => (typeof t === 'number' ? c['s' + (((Math.max(1, t | 0) - 1) % 8) + 1)] : (c[t] ?? t));
const metalOf = (c) => mix(c.labelMuted, c.bgSurface, 0.25);

// Seeded jitter: a hash of (i, j, seed) through one LCG step, in [0, 1).
function jit(i, j, seed) {
  let s = (Math.imul(i + 1, 73856093) ^ Math.imul(j + 1, 19349663) ^ Math.imul(seed + 1, 83492791)) >>> 0;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  s = (Math.imul(s ^ (s >>> 13), 1664525) + 1013904223) >>> 0;
  return s / 4294967296;
}

// -- Sources --------------------------------------------------------------------

export function swingAmp(wavelength, swing = 0.35) {
  const k = clamp(swing, 0.05, 0.8);
  return (wavelength * (1 / (1 - k) - 1)) / TAU;
}

export function sineSource(o = {}) {
  const amp = o.amp ?? (o.wavelength != null ? swingAmp(o.wavelength, o.swing) : 10), freq = o.freq ?? 1, start = o.start ?? 0;
  const f = (t) => (t < start ? 0 : amp * Math.sin(TAU * freq * (t - start)));
  return Object.assign(f, { kind: 'sine', amp, freq, period: 1 / freq, span: start + 1 / freq, wavelength: (v) => v / freq });
}

export function pistonSource(o = {}) {
  const strokes = [...(o.strokes ?? [])].sort((a, b) => a.at - b.at);
  const repeat = o.repeat ?? 0, from = o.from ?? 0;
  const amp = strokes.reduce((m, k) => Math.max(m, Math.abs(k.to)), Math.abs(from));
  const end = strokes.reduce((m, k) => Math.max(m, k.at + k.dur), 0);
  const f = (t0) => {
    if (t0 < 0) return 0;
    const t = repeat > 0 ? t0 % repeat : t0;
    let pos = from;
    for (const k of strokes) {
      if (t >= k.at + k.dur) { pos = k.to; continue; }
      if (t > k.at) pos += (k.to - pos) * inOutSine((t - k.at) / k.dur);
      break;
    }
    return pos;
  };
  return Object.assign(f, { kind: 'piston', amp, period: repeat || null, span: repeat || end,
    wavelength: (v) => (repeat ? v * repeat : null), strokes });
}

export function pulseSource(o = {}) {
  const amp = o.amp ?? 10, dur = o.dur ?? 0.4, at = o.at ?? 0;
  const f = (t) => { const u = (t - at) / dur; return u <= 0 || u >= 1 ? 0 : amp * Math.sin(Math.PI * u) ** 2; };
  return Object.assign(f, { kind: 'pulse', amp, dur, period: null, span: at + dur, wavelength: (v) => v * dur });
}

export function sumSources(...fs) {
  const f = (t) => fs.reduce((s, g) => s + g(t), 0);
  return Object.assign(f, { kind: 'sum', amp: fs.reduce((s, g) => s + (g.amp ?? 0), 0), period: fs[0]?.period ?? null,
    span: Math.max(...fs.map((g) => g.span ?? 1)), wavelength: (v) => fs[0]?.wavelength?.(v) ?? null });
}

// -- The field ------------------------------------------------------------------

export function waveField(o = {}) {
  const f = o.source ?? sineSource();
  const v = o.v ?? 120, origin = o.origin ?? 0, dir = o.dir ?? 1, fall = o.falloff ?? 0;
  const g = (d) => (fall > 0 ? fall / (fall + Math.max(0, d)) : 1);
  const s = (d, t) => { const tau = t - d / v; return tau < 0 || d < 0 ? 0 : f(tau) * g(d); };
  const strain = (d, t) => (s(d + 0.5, t) - s(d - 0.5, t));
  const rho = (d, t) => 1 / (1 + Math.max(-0.95, strain(d, t)));
  // Largest |ds/dd| the source can make: max |f'| / v, sampled over one span.
  let mx = 0;
  const span = Math.max(0.2, f.span ?? 2), dt = span / 1200;
  for (let k = 1; k < 1200; k++) { const t = k * dt; mx = Math.max(mx, Math.abs(f(t + dt / 2) - f(t - dt / 2)) / dt); }
  const maxStrain = Math.min(0.9, mx / v);
  const field = {
    source: f, v, origin, dir, falloff: fall, maxStrain,
    rhoRange: [1 / (1 + maxStrain), 1 / (1 - maxStrain)],
    s, rho, rhoLin: (d, t) => 1 - strain(d, t), rhoRangeLin: [1 - maxStrain, 1 + maxStrain], ampAt: (d) => (f.amp ?? 0) * g(d),
    xAt: (d, t) => origin + dir * (d + s(d, t)),
    front: (t) => Math.max(0, v * t),
    regions(t, d0, d1, ro = {}) {
      const th = ro.th ?? 0.04, step = ro.step ?? 1, out = [];
      let p = rho(d0, t), q = rho(d0 + step, t);
      for (let d = d0 + step; d < d1; d += step) {
        const r = rho(d + step, t);
        if (q > p && q >= r && q > 1 + th) out.push({ kind: 'C', d, x: field.xAt(d, t), rho: q });
        if (q < p && q <= r && q < 1 - th) out.push({ kind: 'R', d, x: field.xAt(d, t), rho: q });
        p = q; q = r;
      }
      return out;
    },
  };
  return field;
}

// -- Small drawing helpers ------------------------------------------------------

// A crowd of particles in one colour: rim, lit body, highlight; three fills in all.
function dotBatch(ctx, pts, r, col, a = 1) {
  if (!pts.length || a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  const pass = (k, ox, oy, fill) => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) { ctx.moveTo(pts[i] + ox + r * k, pts[i + 1] + oy); ctx.arc(pts[i] + ox, pts[i + 1] + oy, r * k, 0, TAU); }
    ctx.fillStyle = fill; ctx.fill();
  };
  pass(1, 0, 0, darken(col, 0.38));
  pass(0.74, -r * 0.14, -r * 0.14, col);
  pass(0.3, -r * 0.36, -r * 0.36, alpha(lighten(col, 0.65), 0.9));
  ctx.restore();
}

function ball(ctx, x, y, r, col) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = darken(col, 0.24); ctx.fill();
  ctx.beginPath(); ctx.arc(x - r * 0.12, y - r * 0.12, r * 0.8, 0, TAU); ctx.fillStyle = col; ctx.fill();
  ctx.beginPath(); ctx.arc(x - r * 0.38, y - r * 0.4, r * 0.28, 0, TAU); ctx.fillStyle = alpha(lighten(col, 0.6), 0.9); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = darken(col, 0.4); ctx.lineWidth = 2; ctx.stroke();
}

// The lighter of label / surface: a rim that reads light in both themes.
function lightOf(c) { return luma(c.label) > luma(c.bgSurface) ? c.label : c.bgSurface; }

// The marked particle / point: a deeper red ball with a thin light rim, found at once.
function markBall(ctx, c, x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r + 2, 0, TAU); ctx.fillStyle = lightOf(c); ctx.fill();
  ball(ctx, x, y, r, darken(c.s6, 0.08));
}

function text(ctx, c, s, x, y, o = {}) {
  if (s == null || s === '') return;
  ctx.save();
  ctx.font = font(c, 700, o.size ?? SIZE, true);
  ctx.textAlign = o.align ?? 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = c.bgSurface; ctx.strokeText(String(s), x, y);
  ctx.fillStyle = o.col ?? c.label; ctx.fillText(String(s), x, y);
  ctx.restore();
}

// A pill kept inside the frame (or o.frame).
function tag(ctx, c, s, x, y, o = {}) {
  if (s == null || s === '') return null;
  const size = o.size ?? SIZE, sz = chipSize(ctx, c, String(s), size, true), f = o.frame ?? { x: 0, y: 0, w: W, h: H };
  const px = clamp(x, f.x + sz.w / 2 + 4, f.x + f.w - sz.w / 2 - 4), py = clamp(y, f.y + sz.h / 2 + 2, f.y + f.h - sz.h / 2 - 6);
  return pill(ctx, c, String(s), px, py, { bg: o.bg ?? c.raised, ink: o.ink, size, display: true, alpha: o.alpha });
}

function stroke2(ctx, col, wd, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = darken(col, 0.35); ctx.lineWidth = wd + 2.5; ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.stroke();
  ctx.restore();
}

function dblArrow(ctx, x1, y1, x2, y2, col, wd = 3, head = 9) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = wd; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  for (const [x, y, a] of [[x2, y2, ang], [x1, y1, ang + Math.PI]]) {
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x - head * Math.cos(a - 0.5), y - head * Math.sin(a - 0.5));
    ctx.lineTo(x - head * Math.cos(a + 0.5), y - head * Math.sin(a + 0.5)); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// The marked particle's range: a dashed mean line from yTop down past by, and a bracket mean +/- amp at by.
function meanBracket(ctx, red, mean, yTop, by, amp) {
  ctx.save(); ctx.strokeStyle = red; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.moveTo(mean, yTop); ctx.lineTo(mean, by + 8); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.strokeStyle = red; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(mean - amp, by - 7); ctx.lineTo(mean - amp, by); ctx.lineTo(mean + amp, by); ctx.lineTo(mean + amp, by - 7); ctx.stroke();
  ctx.restore();
}

// Pills over computed C / R regions, bottom edge at yBottom; a pill that would touch the one
// before it is skipped (g.tagged says which were drawn).
function regionTags(ctx, c, regions, yBottom, tags, tagTones) {
  const words = tags === true ? { C: 'C', R: 'R' } : tags, tones = tagTones ?? [5, 2];
  let lastX = -1e9, lastW = 0;
  for (const g of regions) {
    const s = words[g.kind];
    if (s == null || s === '') { g.tagged = false; continue; }
    const sz = chipSize(ctx, c, String(s), SIZE, true);
    if (Math.abs(g.x - lastX) < (sz.w + lastW) / 2 + 6) { g.tagged = false; continue; }
    tag(ctx, c, s, g.x, yBottom - sz.h / 2, { bg: toneOf(c, g.kind === 'C' ? tones[0] : tones[1]) });
    g.tagged = true; lastX = g.x; lastW = sz.w;
  }
}

/**
 * drawParticleStrip: air particles in a tube (book: piston tube, longitudinal strip).
 * o: { x, y, w, h = 90 (the strip), field (null = at rest: average density everywhere),
 *      t, spacing = 11, r = 3.4, seed = 7, tone = 1 (dots),
 *      tube = true (glass walls), piston = false (a piston face at d = 0 moving with f(t)),
 *      mark: null | d (the red particle at mean distance d, middle row),
 *      bracket = false (the red particle's range: mean +/- amp, dashed mean line, under the strip),
 *      densityShade = false (true: bands behind the dots, symmetric in strain: a soft darker band
 *      behind C and a clear paper-coloured band behind R, so R reads as well as C),
 *      regionBands = false (true: faint vertical guides at each C / R region's ends and a bracket
 *      under it in the tag tones; 10 px under the strip, 40 px when bracket is on),
 *      clip = true (false: dots may move past x + w, e.g. a strip ending at a tube mouth),
 *      fadeEnd = 0 (px: dots fade out by opacity over the last N px before x + w, an open end),
 *      tags = false | true | { C: 'C', R: 'R' } (pills over the computed regions),
 *      tagTones = [5, 2], th = 0.04 }
 * d is measured from field.origin along field.dir; set origin = x (or x + w with dir -1).
 */
export function drawParticleStrip(ctx, c, o = {}) {
  const { x, y, w } = o, h = o.h ?? 90, F = o.field ?? null, t = o.t ?? 0;
  const sp = o.spacing ?? 11, r = o.r ?? 3.4, seed = o.seed ?? 7, col = toneOf(c, o.tone ?? 1);
  const org = F ? F.origin : x, dir = F ? F.dir : 1;
  const pf = F && o.piston ? F.source(t) : 0;
  const pistonX = org + dir * pf;
  if (o.tube !== false) {
    const tx = Math.min(x, pistonX - 6), tw = Math.max(x + w, pistonX + 6) - tx;
    ctx.save();
    ctx.fillStyle = alpha(c.glass, 0.1); ctx.fillRect(tx, y - 6, tw, h + 12);
    ctx.lineCap = 'round';
    for (const [yy, a] of [[y - 6, 0.9], [y + h + 6, 0.6]]) {
      ctx.strokeStyle = alpha(darken(c.glass, 0.3), a); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(tx, yy); ctx.lineTo(tx + tw, yy); ctx.stroke();
      ctx.strokeStyle = alpha(lighten(c.glass, 0.4), a); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(tx + 4, yy - 1); ctx.lineTo(tx + tw - 4, yy - 1); ctx.stroke();
    }
    ctx.restore();
  }
  if (F && o.densityShade) {
    // A band per slice, symmetric in strain: darker dot-tinted where compressed, paper where rarefied.
    const ms = Math.max(0.01, F.maxStrain), d0 = Math.max(0, (x - org) * dir), d1 = (x + w - org) * dir;
    const cCol = mix(col, c.bgDeep, 0.25), rCol = mix(c.bgSurface, lightOf(c), 0.35);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y - 4, w, h + 8); ctx.clip();
    for (let d = d0; d < d1; d += 3) {
      const xa = F.xAt(d, t), xb = F.xAt(d + 3, t), st = 1 - F.rhoLin(d + 1.5, t), u = Math.min(1, Math.abs(st) / ms) ** 0.8;
      if (u < 0.04) continue;
      ctx.fillStyle = st < 0 ? alpha(cCol, 0.34 * u) : alpha(rCol, 0.8 * u);
      ctx.fillRect(Math.min(xa, xb), y - 4, Math.abs(xb - xa) + 0.6, h + 8);
    }
    ctx.restore();
  }
  const rows = Math.max(1, Math.round(h / sp)), rh = h / rows, cols = Math.ceil(w / sp) + 1;
  const pts = [], clip = o.clip !== false, fe = o.fadeEnd ?? 0, faded = new Map();
  let minGap = Infinity;
  ctx.save();
  if (clip) { ctx.beginPath(); ctx.rect(Math.min(x, pistonX), y - 2, w + Math.abs(pistonX - x) + 2, h + 4); ctx.clip(); }
  for (let j = 0; j < rows; j++) {
    let last = null;
    for (let i = 0; i < cols; i++) {
      const mx = x + (i + 0.5) * sp + (jit(i, j, seed) - 0.5) * sp * 0.62;
      const my = y + (j + 0.5) * rh + (jit(j, i, seed + 3) - 0.5) * rh * 0.62;
      const d = (mx - org) * dir;
      if (d < r + 2 || mx > x + w + (clip ? sp : 0)) continue;
      const X = F ? F.xAt(d, t) : mx;
      if (last != null) minGap = Math.min(minGap, (X - last) * dir);
      last = X;
      if (fe > 0) {
        const a = Math.round(clamp((x + w - X) / fe, 0, 1) * 12) / 12;
        if (a <= 0) continue;
        if (a < 1) { if (!faded.has(a)) faded.set(a, []); faded.get(a).push(X, my); continue; }
      }
      pts.push(X, my);
    }
  }
  dotBatch(ctx, pts, r, col);
  for (const [a, q] of faded) dotBatch(ctx, q, r, col, a);
  ctx.restore();
  if (F && o.piston) {
    const ph = h + 4, pw = 12, px = pistonX - (dir > 0 ? pw : 0), mc = metalOf(c);
    ctx.save();
    ctx.fillStyle = darken(mc, 0.2); ctx.fillRect(dir > 0 ? px - 46 : px + pw, y + h / 2 - 5, 46, 10);
    ctx.fillStyle = lighten(mc, 0.3); ctx.fillRect(dir > 0 ? px - 46 : px + pw, y + h / 2 - 5, 46, 3);
    ctx.fillStyle = mc; ctx.fillRect(px, y - 2, pw, ph);
    ctx.fillStyle = darken(mc, 0.22); ctx.fillRect(px + pw * 0.6, y - 2, pw * 0.4, ph);
    ctx.fillStyle = alpha(lighten(mc, 0.45), 0.9); ctx.fillRect(px + 1.5, y, 2.5, ph - 4);
    ctx.strokeStyle = darken(mc, 0.4); ctx.lineWidth = 2; ctx.strokeRect(px, y - 2, pw, ph);
    ctx.restore();
  }
  let marked = null;
  if (o.mark != null) {
    const d = o.mark, mean = org + dir * d, my = y + h / 2, mxNow = F ? F.xAt(d, t) : mean;
    const amp = F ? F.ampAt(d) : 0, red = c.s6;
    if (o.bracket && amp > 0) meanBracket(ctx, red, mean, y + 4, y + h + 18, amp);
    markBall(ctx, c, mxNow, my, r * 2.1);
    marked = { x: mxNow, y: my, mean, amp };
  }
  let regions = [];
  if (F && o.regionBands) {
    const ms = Math.max(0.01, F.maxStrain), d0 = Math.max(0, (x - org) * dir), d1 = (x + w - org) * dir, segs = [];
    let cur = null;
    for (let d = d0; d <= d1; d += 2) {
      const st = 1 - F.rhoLin(d, t), k = Math.abs(st) > ms * 0.3 ? (st < 0 ? 'C' : 'R') : null;
      if (k !== (cur && cur.kind)) { if (cur) segs.push(cur); cur = k ? { kind: k, a: F.xAt(d, t), b: F.xAt(d, t) } : null; }
      else if (cur) cur.b = F.xAt(d, t);
    }
    if (cur) segs.push(cur);
    const tones = o.tagTones ?? [5, 2], by = y + h + (o.bracket ? 40 : 10);
    ctx.save(); ctx.lineCap = 'round';
    for (const g of segs) {
      const xa = Math.min(g.a, g.b), xb = Math.max(g.a, g.b);
      if (xb - xa < 10) continue;
      const tc = toneOf(c, g.kind === 'C' ? tones[0] : tones[1]);
      ctx.strokeStyle = alpha(tc, 0.32); ctx.lineWidth = 1.6; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(xa, y - 4); ctx.lineTo(xa, by); ctx.moveTo(xb, y - 4); ctx.lineTo(xb, by); ctx.stroke();
      ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(xa + 2, by - 6); ctx.lineTo(xa + 2, by); ctx.lineTo(xb - 2, by); ctx.lineTo(xb - 2, by - 6);
      ctx.strokeStyle = darken(tc, 0.3); ctx.lineWidth = 5; ctx.globalAlpha = 0.5; ctx.stroke();
      ctx.strokeStyle = tc; ctx.lineWidth = 3; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  if (F) {
    regions = F.regions(t, Math.max(0, (x - org) * dir), (x + w - org) * dir, { th: o.th ?? 0.04 })
      .filter((g) => g.x >= x - 2 && g.x <= x + w + 2);
    if (o.tags) regionTags(ctx, c, regions, y - 14, o.tags, o.tagTones);
  }
  return { box: { x, y, w, h }, regions, marked, minGap: minGap === Infinity ? null : minGap, piston: F && o.piston ? { x: pistonX, y: y + h / 2 } : null };
}

/**
 * drawDensityGraph: green graph paper under a strip, rho against distance for the same field and t.
 * o: { x, y, w, h, field, t, range = field.rhoRange (padded), cell = 10, major = 5 (cells),
 *      axes: { y: 'density', x: 'distance' } (caller words), avg = true (dashed average line),
 *      avgLabel, crestLabel, troughLabel (each pill once, on the first crest/trough),
 *      marks = true (dots on crests and troughs), lambda: null | label (crest-to-crest bracket),
 *      ampLabel: null | label (arrow from the average line up to a crest), progress = 1 (draw-on), tone = 1,
 *      linear = false (true: plot rhoLin, the symmetric small-amplitude curve, as the book draws it) }
 * The curve is plotted at the particles' displaced x, so each crest sits under its C tag.
 */
export function drawDensityGraph(ctx, c, o = {}) {
  const { x, y, w, h } = o, F = o.field, t = o.t ?? 0, col = toneOf(c, o.tone ?? 1);
  const RHO = o.linear ? F.rhoLin : F.rho;
  const rr = o.range ?? (o.linear ? F.rhoRangeLin : F.rhoRange), pad = (rr[1] - rr[0]) * 0.18, lo = rr[0] - pad, hi = rr[1] + pad;
  const yOf = (q) => y + h - ((q - lo) / (hi - lo)) * h;
  const green = c.good, cell = o.cell ?? 10, major = o.major ?? 5;
  ctx.save();
  ctx.fillStyle = mix(c.bgSurface, green, 0.1); ctx.fillRect(x, y, w, h);
  for (let k = 0, X = x; X <= x + w + 0.1; k++, X += cell) {
    ctx.strokeStyle = alpha(green, k % major ? 0.2 : 0.42); ctx.lineWidth = k % major ? 1 : 1.6;
    ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + h); ctx.stroke();
  }
  for (let k = 0, Y = y + h; Y >= y - 0.1; k++, Y -= cell) {
    ctx.strokeStyle = alpha(green, k % major ? 0.2 : 0.42); ctx.lineWidth = k % major ? 1 : 1.6;
    ctx.beginPath(); ctx.moveTo(x, Y); ctx.lineTo(x + w, Y); ctx.stroke();
  }
  ctx.strokeStyle = alpha(darken(green, 0.2), 0.7); ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  ctx.restore();
  // Axes.
  ctx.save(); ctx.strokeStyle = c.label; ctx.fillStyle = c.label; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y - 14); ctx.moveTo(x, y + h); ctx.lineTo(x + w + 14, y + h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x - 6, y - 10); ctx.lineTo(x + 6, y - 10); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + w + 20, y + h); ctx.lineTo(x + w + 10, y + h - 6); ctx.lineTo(x + w + 10, y + h + 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  const avgY = yOf(1);
  if (o.avg !== false) {
    ctx.save(); ctx.strokeStyle = c.label; ctx.lineWidth = 2.5; ctx.setLineDash([8, 7]);
    ctx.beginPath(); ctx.moveTo(x, avgY); ctx.lineTo(x + w, avgY); ctx.stroke(); ctx.restore();
  }
  // The curve, sampled every 1 px of mean distance.
  const d0 = Math.max(0, (x - F.origin) * F.dir), d1 = (x + w - F.origin) * F.dir;
  const xMax = x + clamp(o.progress ?? 1, 0, 1) * w, P = [];
  for (let d = d0; d <= d1; d += 1) { const X = F.xAt(d, t); if (X >= x && X <= xMax) P.push([X, RHO(d, t)]); }
  const crests = [], troughs = [], th = o.th ?? 0.04;
  for (let i = 1; i < P.length - 1; i++) {
    const [X, q] = P[i];
    if (q > P[i - 1][1] && q >= P[i + 1][1] && q > 1 + th) crests.push({ x: X, y: yOf(q), rho: q });
    if (q < P[i - 1][1] && q <= P[i + 1][1] && q < 1 - th) troughs.push({ x: X, y: yOf(q), rho: q });
  }
  if (P.length > 1) {
    ctx.beginPath(); P.forEach(([X, q], i) => (i ? ctx.lineTo(X, yOf(q)) : ctx.moveTo(X, yOf(q))));
    stroke2(ctx, col, 4);
    ctx.save(); ctx.translate(-0.8, -1.2); ctx.beginPath(); P.forEach(([X, q], i) => (i ? ctx.lineTo(X, yOf(q)) : ctx.moveTo(X, yOf(q))));
    ctx.strokeStyle = alpha(lighten(col, 0.55), 0.7); ctx.lineWidth = 1.3; ctx.stroke(); ctx.restore();
  }
  if (o.marks !== false) { for (const p of [...crests, ...troughs]) ball(ctx, p.x, p.y, 5, col); }
  // Labels never sit on the curve, the average line or a paper edge: each pill tries a list of
  // spots and takes the first clear one; a pill away from its mark gets a short dotted leader.
  const ax = o.axes ?? {}, placed = [];
  ctx.save(); ctx.font = font(c, 700, SIZE, true);
  if (ax.y) { const tw = ctx.measureText(String(ax.y)).width; placed.push({ x0: x + 10, y0: y - 40, x1: x + 18 + tw, y1: y - 4 }); }
  if (ax.x) { const tw = ctx.measureText(String(ax.x)).width; placed.push({ x0: x + w - tw - 4, y0: y + h + 6, x1: x + w + 4, y1: y + h + 42 }); }
  ctx.restore();
  const clear = (b) => {
    if (b.x0 < 2 || b.x1 > W - 2 || b.y0 < 2 || b.y1 > H - 2) return false;
    const inside = b.x0 >= x + 4 && b.x1 <= x + w - 4 && b.y0 >= y + 4 && b.y1 <= y + h - 4;
    const outside = b.x1 < x - 4 || b.x0 > x + w + 22 || b.y1 < y - 22 || b.y0 > y + h + 4;
    if (!inside && !outside) return false;
    if (o.avg !== false && b.y0 < avgY + 5 && b.y1 > avgY - 5 && inside) return false;
    for (const [X, q] of P) { const Y = yOf(q); if (X > b.x0 - 7 && X < b.x1 + 7 && Y > b.y0 - 7 && Y < b.y1 + 7) return false; }
    return !placed.some((q) => b.x0 < q.x1 + 4 && b.x1 > q.x0 - 4 && b.y0 < q.y1 + 4 && b.y1 > q.y0 - 4);
  };
  const place = (s, spots, bg, mark) => {
    const sz = chipSize(ctx, c, String(s), SIZE, true);
    for (const [px, py] of spots) {
      const b = { x0: px - sz.w / 2, y0: py - sz.h / 2, x1: px + sz.w / 2, y1: py + sz.h / 2 };
      if (!clear(b)) continue;
      if (mark) {
        const ex = clamp(mark.x, b.x0, b.x1), ey = clamp(mark.y, b.y0, b.y1), dd = Math.hypot(ex - mark.x, ey - mark.y);
        if (dd > 16) {
          const ux = (ex - mark.x) / dd, uy = (ey - mark.y) / dd;
          ctx.save(); ctx.strokeStyle = c.label; ctx.lineWidth = 2; ctx.setLineDash([3, 4]); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(mark.x + ux * 9, mark.y + uy * 9); ctx.lineTo(ex - ux * 3, ey - uy * 3); ctx.stroke(); ctx.restore();
        }
      }
      tag(ctx, c, s, px, py, { bg }); placed.push(b); return b;
    }
    return null;
  };
  const column = (px, from, to) => { const out = [], st = from < to ? 8 : -8; for (let q = from; st > 0 ? q <= to : q >= to; q += st) out.push([px, q]); return out; };
  const lab = { h: chipSize(ctx, c, 'Ag', SIZE, true).h };
  if (o.lambda != null && crests.length > 1) {
    const [a, b] = crests, by = y + 16;
    ctx.save(); ctx.strokeStyle = c.label; ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 8); ctx.lineTo(a.x, by); ctx.moveTo(b.x, b.y - 8); ctx.lineTo(b.x, by); ctx.stroke(); ctx.restore();
    dblArrow(ctx, a.x + 2, by, b.x - 2, by, c.label, 3, 10);
    place(o.lambda, [[(a.x + b.x) / 2, by], [(a.x + b.x) / 2, by + 20], [(a.x + b.x) / 2, y - lab.h / 2 - 8]], c.raised, null);
  }
  const below = (p) => column(p.x, avgY + lab.h / 2 + 8, y + h - lab.h / 2 - 6);
  const above = (p) => column(p.x, avgY - lab.h / 2 - 8, y + lab.h / 2 + 6);
  let ampCrest = null;
  if (o.ampLabel != null && crests.length) {
    const order = [crests[crests.length > 2 ? 2 : crests.length - 1], ...crests.slice().reverse()];
    for (const p of order) {
      const sz = chipSize(ctx, c, String(o.ampLabel), SIZE, true), mid = (avgY + p.y) / 2;
      if (!place(o.ampLabel, [...below(p), [p.x + 16 + sz.w / 2, mid], [p.x - 16 - sz.w / 2, mid]], c.raised, null)) continue;
      dblArrow(ctx, p.x, avgY - 2, p.x, p.y + 7, c.label, 3, 9);
      ampCrest = p; break;
    }
  }
  if (o.crestLabel) {
    for (const p of crests.filter((q) => q !== ampCrest)) if (place(o.crestLabel, [...below(p), [p.x, y - lab.h / 2 - 8]], toneOf(c, 5), p)) break;
  }
  if (o.troughLabel) {
    for (const p of troughs) if (place(o.troughLabel, [...above(p), [p.x, y + h + lab.h / 2 + 10]], toneOf(c, 2), p)) break;
  }
  if (o.avgLabel) place(o.avgLabel, [[x + w - 90, avgY + lab.h / 2 + 8], [x + w - 90, avgY - lab.h / 2 - 8], [x + 90, avgY + lab.h / 2 + 8]], c.raised, null);
  if (ax.y) text(ctx, c, ax.y, x + 14, y - 22, { align: 'left' });
  if (ax.x) text(ctx, c, ax.x, x + w, y + h + 24, { align: 'right' });
  return { crests, troughs, yOf, avgY, box: { x, y, w, h } };
}

/**
 * drawSlinky: a long metal coil lying along y from x1 (the end that moves, d = 0) to x2.
 * o: { x1, x2, y, field (origin x1, dir 1; null = at rest), t, spacing = 12 (turn pitch at rest),
 *      ry = 26 (coil radius), wire = 3.2, mark: null | turn index (red), tone (metal),
 *      tags = false | true | { C, R } (pills over computed regions, above the coil), tagTones = [5, 2],
 *      fixedEnd = null | 'right' | 'left' (that end's turn is held still; the field tapers to
 *      zero over the last 3 turns), markBracket = false (dashed mean line + bracket mean +/- amp
 *      under the marked turn, 18 px below the coil) }
 * Turns are placed by the longitudinal field: close where compressed, spread where rarefied.
 * hands: grip points just outside each end (feed SimFigure spec.hands).
 */
export function drawSlinky(ctx, c, o = {}) {
  const { x1, x2, y } = o, F = o.field ?? null, t = o.t ?? 0, sp = o.spacing ?? 12;
  const ry = o.ry ?? 26, wd = o.wire ?? 3.2, rx = ry * 0.36, met = o.tone ? toneOf(c, o.tone) : metalOf(c);
  const n = Math.max(2, Math.floor((x2 - x1) / sp));
  const fx = o.fixedEnd, taper = (i) => (fx === 'right' ? Math.min(1, (n - i) / 3) : fx === 'left' ? Math.min(1, i / 3) : 1);
  const X = []; for (let i = 0; i <= n; i++) X.push(F ? (fx ? F.origin + F.dir * i * sp + (F.xAt(i * sp, t) - F.origin - F.dir * i * sp) * taper(i) : F.xAt(i * sp, t)) : x1 + i * sp);
  const front = (i) => { const m = (X[i] + X[i + 1]) / 2; ctx.moveTo(X[i], y - ry); ctx.bezierCurveTo(X[i] - rx * 1.3, y - ry * 0.5, m - rx * 1.3, y + ry * 0.5, m, y + ry); };
  const back = (i) => { const m = (X[i] + X[i + 1]) / 2; ctx.moveTo(m, y + ry); ctx.bezierCurveTo(m + rx * 1.3, y + ry * 0.5, X[i + 1] + rx * 1.3, y - ry * 0.5, X[i + 1], y - ry); };
  ctx.save(); ctx.lineCap = 'round';
  ctx.fillStyle = alpha(c.bgDeep, 0.16); ctx.beginPath(); ctx.ellipse((X[0] + X[n]) / 2, y + ry + 8, (X[n] - X[0]) / 2 + 10, 5, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); for (let i = 0; i < n; i++) back(i);
  ctx.strokeStyle = darken(met, 0.38); ctx.lineWidth = wd; ctx.stroke();
  ctx.beginPath(); for (let i = 0; i < n; i++) if (i !== o.mark) front(i);
  ctx.strokeStyle = darken(met, 0.42); ctx.lineWidth = wd + 2; ctx.stroke();
  ctx.strokeStyle = met; ctx.lineWidth = wd; ctx.stroke();
  ctx.translate(-0.9, -0.9); ctx.strokeStyle = alpha(lighten(met, 0.6), 0.85); ctx.lineWidth = 1.1; ctx.stroke();
  ctx.restore();
  let marked = null;
  if (o.mark != null && o.mark >= 0 && o.mark < n) {
    ctx.save(); ctx.lineCap = 'round'; ctx.beginPath(); front(o.mark);
    ctx.strokeStyle = lightOf(c); ctx.lineWidth = wd + 7; ctx.stroke();
    ctx.strokeStyle = darken(c.s6, 0.4); ctx.lineWidth = wd + 4.5; ctx.stroke();
    ctx.strokeStyle = darken(c.s6, 0.08); ctx.lineWidth = wd + 2; ctx.stroke(); ctx.restore();
    marked = { x: X[o.mark], y, mean: x1 + o.mark * sp, amp: F ? F.ampAt(o.mark * sp) * taper(o.mark) : 0 };
    if (o.markBracket && marked.amp > 0) meanBracket(ctx, c.s6, marked.mean, y - ry, y + ry + 18, marked.amp);
  }
  let regions = [];
  if (F && o.tags) {
    regions = F.regions(t, 0, n * sp, { th: o.th ?? 0.04 }).filter((g) => g.x >= x1 && g.x <= x2);
    regionTags(ctx, c, regions, y - ry - 12, o.tags, o.tagTones);
  }
  return { turns: X.map((v) => ({ x: v, y })), marked, regions, hands: [{ x: X[0] - 8, y }, { x: X[n] + 8, y }] };
}

/**
 * drawRope: a thick rope or string with the transverse field (up = + displacement).
 * o: { x1, x2, y (rest line), field (origin x1, dir 1), t, thick = 8, tone = 'gold',
 *      mark: null | d (red point), arrow = true (up-down double arrow beside the red point), arrowLabel }
 */
export function drawRope(ctx, c, o = {}) {
  const { x1, x2, y } = o, F = o.field ?? null, t = o.t ?? 0, th = o.thick ?? 8, col = toneOf(c, o.tone ?? 'gold');
  const P = []; for (let d = 0; d <= x2 - x1 + 0.1; d += 3) P.push([x1 + d, y - (F ? F.s(d, t) : 0)]);
  const path = (dy) => { ctx.beginPath(); P.forEach(([X, Y], i) => (i ? ctx.lineTo(X, Y + dy) : ctx.moveTo(X, Y + dy))); };
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  path(0); ctx.strokeStyle = darken(col, 0.42); ctx.lineWidth = th + 3; ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = th; ctx.stroke();
  path(th * 0.22); ctx.strokeStyle = darken(col, 0.18); ctx.lineWidth = th * 0.4; ctx.stroke();
  path(-th * 0.26); ctx.strokeStyle = alpha(lighten(col, 0.5), 0.9); ctx.lineWidth = 1.6; ctx.stroke();
  ctx.strokeStyle = alpha(darken(col, 0.35), 0.6); ctx.lineWidth = 1.4; ctx.beginPath();
  for (let i = 1; i < P.length - 1; i += 3) { const [X, Y] = P[i]; ctx.moveTo(X - 2.5, Y + th * 0.4); ctx.lineTo(X + 2.5, Y - th * 0.4); }
  ctx.stroke(); ctx.restore();
  let marked = null;
  if (o.mark != null) {
    const d = o.mark, mx = x1 + d, my = y - (F ? F.s(d, t) : 0), amp = F ? F.ampAt(d) : 0;
    if (o.arrow !== false && amp > 0) {
      const ax = mx + th + 16;
      vectorArrow(ctx, c, ax, y, { angle: -Math.PI / 2, length: amp + 10, width: 4, head: 11, col: c.s6 });
      vectorArrow(ctx, c, ax, y, { angle: Math.PI / 2, length: amp + 10, width: 4, head: 11, col: c.s6 });
      if (o.arrowLabel) { const sz = chipSize(ctx, c, String(o.arrowLabel), SIZE, true); tag(ctx, c, o.arrowLabel, ax + 12 + sz.w / 2, y - amp - 14, { bg: c.s6 }); }
    }
    markBall(ctx, c, mx, my, th * 0.95);
    marked = { x: mx, y: my, meanY: y, amp };
  }
  return { marked, ends: [{ x: P[0][0], y: P[0][1] }, { x: P[P.length - 1][0], y: P[P.length - 1][1] }] };
}

/**
 * drawRings: a field of air particles round a point source, displaced radially.
 * o: { cx, cy (source), R = 180 (disc radius; edge fades), field (origin 0, dir 1, d = radius;
 *      falloff for amplitude fall-off), t, spacing = 10, r = 3, seed = 11, tone = 1,
 *      guides = false (faint circles on the computed compressions),
 *      strip: null | { angle = 0, width = 70, k = 1 } (k 0..1 fades every particle outside a
 *      band from the source in that direction), source = true (the source dot),
 *      mark: null | { x, y } (a red particle with that mean position, displaced by the field),
 *      mask: null | { x, y, w, h } | [{ x, y }, ...] polygon (dots only inside, fading by opacity
 *      over maskFade = 24 px at the edge; R then defaults to the farthest mask corner and the
 *      round edge fade is off unless R is given) }
 * Returns { regions, marked: { x, y, mean, amp } | null }.
 */
export function drawRings(ctx, c, o = {}) {
  const { cx, cy } = o, R = o.R ?? 180, F = o.field ?? null, t = o.t ?? 0, sp = o.spacing ?? 10, r = o.r ?? 3;
  const seed = o.seed ?? 11, col = toneOf(c, o.tone ?? 1), st = o.strip ?? null;
  const sa = st ? Math.sin(st.angle ?? 0) : 0, ca = st ? Math.cos(st.angle ?? 0) : 1, sk = st ? clamp(st.k ?? 1, 0, 1) : 0, hw = st ? (st.width ?? 70) / 2 : 0;
  const groups = new Map(), M = o.mask ?? null, mf = o.maskFade ?? 24;
  let inMask = null, Rr = R, edgeFade = true;
  if (M) {
    const poly = Array.isArray(M) ? M : [{ x: M.x, y: M.y }, { x: M.x + M.w, y: M.y }, { x: M.x + M.w, y: M.y + M.h }, { x: M.x, y: M.y + M.h }];
    inMask = (px, py) => {
      let inside = false, dm = Infinity;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
        const ex = b.x - a.x, ey = b.y - a.y, u = clamp(((px - a.x) * ex + (py - a.y) * ey) / (ex * ex + ey * ey || 1), 0, 1);
        dm = Math.min(dm, Math.hypot(px - a.x - u * ex, py - a.y - u * ey));
      }
      if (!inside) return 0;
      const e = clamp(dm / mf, 0, 1); return e * e * (3 - 2 * e);
    };
    if (o.R == null) { Rr = Math.max(...poly.map((p) => Math.hypot(p.x - cx, p.y - cy))); edgeFade = false; }
  }
  const n = Math.ceil(Rr / sp);
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const mx = i * sp + (jit(i + 500, j + 500, seed) - 0.5) * sp * 0.5, my = j * sp + (jit(j + 900, i + 900, seed) - 0.5) * sp * 0.5;
    const d = Math.hypot(mx, my);
    if (d > Rr || d < sp * 0.9) continue;
    const s = F ? F.s(d, t) : 0, X = cx + (mx / d) * (d + s), Y = cy + (my / d) * (d + s);
    const e = edgeFade ? clamp((d - R * 0.85) / (R * 0.15), 0, 1) : 0;
    let a = 1 - e * e * (3 - 2 * e);   // the edge fades out (opacity only), so the only rings are computed ones
    if (inMask) a *= inMask(cx + mx, cy + my);
    if (sk > 0) { const along = mx * ca + my * sa, across = Math.abs(-mx * sa + my * ca); if (along < 0 || across > hw) a *= 1 - 0.86 * sk; }
    if (a < 0.04) continue;
    const key = Math.round(a * 20) / 20;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(X, Y);
  }
  const regions = F ? F.regions(t, sp, Rr, { th: o.th ?? 0.04 }) : [];
  if (o.guides) {
    ctx.save(); ctx.strokeStyle = alpha(col, 0.42); ctx.lineWidth = 4;
    for (const g of regions) if (g.kind === 'C' && g.x < (edgeFade ? R * 0.85 : Rr)) { ctx.beginPath(); ctx.arc(cx, cy, g.x, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  for (const [a, pts] of groups) dotBatch(ctx, pts, r, col, a);
  let marked = null;
  if (o.mark) {
    const mx = o.mark.x - cx, my = o.mark.y - cy, d = Math.hypot(mx, my) || 1, s = F ? F.s(d, t) : 0;
    const X = cx + (mx / d) * (d + s), Y = cy + (my / d) * (d + s);
    markBall(ctx, c, X, Y, r * 2.1);
    marked = { x: X, y: Y, mean: { x: o.mark.x, y: o.mark.y }, amp: F ? F.ampAt(d) : 0 };
  }
  if (o.source !== false) ball(ctx, cx, cy, 8, mix(c.label, c.stroke, 0.45));
  return { regions, marked };
}

/**
 * drawSoundArcs: THE one style for sound leaving a source (or, reverse, arriving at a receiver).
 * o: { x, y, dir = 0 (radians, 0 = right), spread = 0.9 (total cone, radians), n = 3,
 *      wavelength = 34 (px between arcs), t, speed = wavelength * 1.2 (px per s), r0 = 18,
 *      strength = 1 (0..1: weight and opacity), reverse = false, tone = 1,
 *      single = false (true: ONE arc or ring, radius = o.radius ?? r0 + t * speed, opacity =
 *      strength; spread: Math.PI * 2 for a full ring) }
 * Every arc has the same stroke weight at every radius; arcs fade in and out only near the
 * ends of their life (first 18 per cent, last 22 per cent).
 */
export function drawSoundArcs(ctx, c, o = {}) {
  const wl = o.wavelength ?? 34, n = o.n ?? 3, r0 = o.r0 ?? 18, sp = o.speed ?? wl * 1.2, t = o.t ?? 0;
  const k = clamp(o.strength ?? 1, 0, 1), col = toneOf(c, o.tone ?? 1), dir = o.dir ?? 0, half = (o.spread ?? 0.9) / 2;
  const total = n * wl, ph = (((t * sp) % wl) + wl) % wl, radii = [];
  const wd = 2.5 + 3 * k;
  if (o.single) {
    const rr = o.radius ?? r0 + t * sp;
    if (rr > 0 && k > 0.02) {
      ctx.beginPath(); ctx.arc(o.x, o.y, rr, dir - half, dir + half); stroke2(ctx, col, wd, k);
      ctx.save(); ctx.globalAlpha *= k * 0.75; ctx.beginPath(); ctx.arc(o.x, o.y, rr - wd * 0.3, dir - half * 0.85, dir - half * 0.1);
      ctx.strokeStyle = lighten(col, 0.55); ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();
      radii.push(rr);
    }
    return { radii };
  }
  for (let i = 0; i < n; i++) {
    const s = ph + i * wl, rr = o.reverse ? r0 + total - s : r0 + s, u = s / total;
    const life = clamp(Math.min(u / 0.18, (1 - u) / 0.22), 0, 1), a = k * life ** 0.7;
    if (a <= 0.02) continue;
    radii.push(rr);
    ctx.beginPath(); ctx.arc(o.x, o.y, rr, dir - half, dir + half);
    stroke2(ctx, col, wd, a);
    ctx.save(); ctx.globalAlpha *= a * 0.75; ctx.beginPath(); ctx.arc(o.x, o.y, rr - wd * 0.3, dir - half * 0.85, dir - half * 0.1);
    ctx.strokeStyle = lighten(col, 0.55); ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();
  }
  return { radii };
}

/** outAndBack({ a, b, v, start = 0 }, t): where a pulse is on its trip A -> B -> A. */
export function outAndBack(o, t) {
  const dx = o.b.x - o.a.x, dy = o.b.y - o.a.y, dist = Math.hypot(dx, dy), tOut = dist / o.v, tTotal = 2 * tOut;
  const e = t - (o.start ?? 0);
  if (e < 0) return { x: o.a.x, y: o.a.y, leg: 'wait', elapsed: 0, u: 0, dist, tOut, tTotal };
  if (e >= tTotal) return { x: o.a.x, y: o.a.y, leg: 'done', elapsed: tTotal, u: 1, dist, tOut, tTotal };
  const out = e < tOut, u = out ? e / tOut : (e - tOut) / tOut, k = out ? u : 1 - u;
  return { x: o.a.x + dx * k, y: o.a.y + dy * k, leg: out ? 'out' : 'back', elapsed: e, u, dist, tOut, tTotal };
}

/**
 * drawOutAndBack: the travelling front as short arcs facing the way it moves (return leg in a
 * second tone, fainter). o: { a, b, v, t, start = 0, path = true (dashed A-B line),
 *      label: null | text (pill at the turning point B), labelDx = 0, labelDy = -44 (from B),
 *      R = 26, tones = [1, 2] }
 */
export function drawOutAndBack(ctx, c, o = {}) {
  const st = outAndBack(o, o.t ?? 0), R = o.R ?? 26, tones = o.tones ?? [1, 2];
  if (o.path !== false) {
    ctx.save(); ctx.strokeStyle = alpha(c.labelMuted, 0.7); ctx.lineWidth = 2.5; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(o.a.x, o.a.y); ctx.lineTo(o.b.x, o.b.y); ctx.stroke(); ctx.restore();
  }
  if (st.leg === 'out' || st.leg === 'back') {
    const to = st.leg === 'out' ? o.b : o.a, from = st.leg === 'out' ? o.a : o.b;
    const ang = Math.atan2(to.y - from.y, to.x - from.x), col = toneOf(c, st.leg === 'out' ? tones[0] : tones[1]);
    const fade = st.leg === 'out' ? 1 : 0.72;
    for (let i = 0; i < 3; i++) {
      const cxp = st.x - Math.cos(ang) * (R + i * 9), cyp = st.y - Math.sin(ang) * (R + i * 9);
      ctx.beginPath(); ctx.arc(cxp, cyp, R, ang - 0.75, ang + 0.75);
      stroke2(ctx, col, 4.5 - i, fade * (1 - i * 0.3));
    }
  }
  if (o.label) tag(ctx, c, o.label, o.b.x + (o.labelDx ?? 0), o.b.y + (o.labelDy ?? -44), { bg: c.raised });
  return st;
}

/**
 * drawPropagationArrow: the long "direction the wave travels" arrow.
 * o: { x, y (tail), len = 220, angle = 0, label, side = 'above' | 'below' | 'end', tone = 'label' }
 */
export function drawPropagationArrow(ctx, c, o = {}) {
  const col = toneOf(c, o.tone ?? 'label'), len = o.len ?? 220, ang = o.angle ?? 0;
  const r = vectorArrow(ctx, c, o.x, o.y, { angle: ang, length: len, width: 4, head: 14, col });
  return { box: labelBy(ctx, c, o, r.x2, r.y2, len, ang, col) };
}

/**
 * drawVibrationArrow: the short double arrow for "particles vibrate this way".
 * o: { x, y (centre), len = 44, angle = 0 (along the travel direction for sound), label,
 *      side = 'above' | 'below' | 'end', tone = 6 (red) }
 */
export function drawVibrationArrow(ctx, c, o = {}) {
  const col = toneOf(c, o.tone ?? 6), len = o.len ?? 44, ang = o.angle ?? 0;
  vectorArrow(ctx, c, o.x, o.y, { angle: ang, length: len / 2, width: 4, head: 11, col });
  const r = vectorArrow(ctx, c, o.x, o.y, { angle: ang + Math.PI, length: len / 2, width: 4, head: 11, col });
  return { box: labelBy(ctx, c, { ...o, side: o.side ?? 'above' }, o.x + Math.cos(ang) * len / 2, o.y + Math.sin(ang) * len / 2, len, ang, col), tip: r };
}

function labelBy(ctx, c, o, x2, y2, len, ang, col) {
  if (o.label == null) return null;
  const sz = chipSize(ctx, c, String(o.label), SIZE, true), side = o.side ?? 'above';
  const mx = x2 - Math.cos(ang) * len / 2, my = y2 - Math.sin(ang) * len / 2;
  let px = mx, py = my - sz.h / 2 - 14;
  if (side === 'below') py = my + sz.h / 2 + 14;
  if (side === 'end') { px = x2 + Math.cos(ang) * (sz.w / 2 + 14); py = y2 + Math.sin(ang) * (sz.h / 2 + 14); }
  if (o.labelX != null) px = o.labelX;
  return tag(ctx, c, o.label, px, py, { bg: col });
}
