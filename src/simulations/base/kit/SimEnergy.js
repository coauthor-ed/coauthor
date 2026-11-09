/**
 * SimEnergy - energy bars and a work counter for canvas scenes (pairs with SimLook.js).
 * Generic: no course words; every label, value and unit comes from the caller.
 *
 *   drawEnergyBars(ctx, c, o) -> { x0, y0, w, h, baseY, bars: [{ id, x, w, top: {x,y}, value }] }
 *   barsAt(from, to, u) -> values      pure tween of two value sets (spring-then-rest curve)
 *   energyBarsTrack(values, preset) -> { to(values, t), at(t), settled(t) }   retargetable springs
 *   drawWorkCounter(ctx, c, o) -> box  one rimmed pill: "W = 20 J" (caller's text)
 *   DEFAULT_BARS                       [K tone 1, U tone 3, heat-and-sound tone 8]
 *
 * drawEnergyBars o:
 *   x, y = (20, 20)      top-left of the panel (or of the bars when panel: false)
 *   bars                 [{ id, label, value, tone }] in order; default DEFAULT_BARS
 *   values               { [id]: number } merged over bars (so a scene keeps the defaults
 *                        and passes only numbers: { values: { K: 12, U: 8 } })
 *   max = 1              common scale: value max fills the slot
 *   total                optional dashed line across the tops at this value
 *   units                optional text after each value ("J"); shown only with showValues
 *   showValues = false   value numbers above the bars (Fredoka)
 *   h = 150              slot height (design px)    barW = 46, gap = 22 (design px)
 *   size = 21            reading size in design px (labels, values). MINIMUM 21 when the
 *                        scene is the 680-wide design scaled to a 390 phone (x0.574):
 *                        21 design px = 12 px on screen. A scene drawn 1:1 may go to 14.
 *   panel = true         rimmed panel behind the bars; false draws bars on the scene
 *   title                optional heading line (Fredoka, same size)
 *   anchor {x, y}        optional: a short leader from the panel to a point on an object
 *                        (the stone, the ball); the panel stays where x, y put it
 *   alpha = 1
 * Labels: short, set by the caller ("K", "U", "heat and sound"); a label wider than its
 * slot wraps onto two lines, centred under the bar, split where the wider line is
 * narrowest. A line still wider than the slot shrinks the label font down to
 *   minSize = 21 (the 12 px-on-screen floor; never below it), then the gap to the next
 * bar opens just enough that the two labels never overlap (the panel grows to fit).
 * A bar at 0 still shows its empty rimmed slot. A value over max (spring overshoot)
 * is drawn up to 8 percent past the slot top, then held.
 * Look (Quill card rule 3): every fill has a light side (left strip), a shade side
 * (right third) and an inner highlight line; slots and panel have a darker rim.
 *
 * Tweening: either barsAt(from, to, u) with the scene's own clock, e.g.
 *   const u = Math.min(1, this.age / 0.6);   drawEnergyBars(ctx, c, { values: barsAt(A, B, u) })
 * (the curve overshoots a little then rests, the spring-then-rest of the card), or
 *   this.energy = energyBarsTrack({ K: 0, U: 20 });  this.energy.to({ K: 20, U: 0 }, this.clock)
 *   drawEnergyBars(ctx, c, { values: this.energy.at(this.clock) });  busy(): !this.energy.settled(this.clock)
 * Name the field anything but the reserved scene names (_running, _hasStarted, _rafId, _tick, _k).
 * Reduced motion: both snap to the target.
 *
 * drawWorkCounter o: { x, y (centre), text, tone = 'accent', size = 22, align: 'center'|'left'|'right', alpha }
 *   size MINIMUM 21 for the same 390 reason. Returns { x0, y0, w, h }.
 *
 * Example:
 *   drawEnergyBars(ctx, c, { x: 470, y: 40, max: 20, total: 20, units: 'J', showValues: true,
 *     values: { K: 5, U: 15, heat: 0 }, anchor: { x: 300, y: 220 } });
 *   drawWorkCounter(ctx, c, { x: 340, y: 40, text: 'W = 20 J' });
 * ASCII only. Colours: resolved c.* tokens only.
 */
import { rr, darken, lighten, alpha, font, mix, inkOn, clamp, outBack, leader, stadium } from './SimLook.js';
import { springTrack, reducedMotion } from './SimAnim.js';

export const DEFAULT_BARS = Object.freeze([
  Object.freeze({ id: 'K', label: 'K', value: 0, tone: 1 }),
  Object.freeze({ id: 'U', label: 'U', value: 0, tone: 3 }),
  Object.freeze({ id: 'heat', label: 'heat and sound', value: 0, tone: 8 }),
]);

const toneOf = (c, t = 'accent') => (typeof t === 'number' ? c['s' + (((Math.max(1, t | 0) - 1) % 8) + 1)] : (c[t] ?? t));
const keysOf = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])];

/** Pure tween between two value sets ({ id: v } or arrays): overshoots a little, then rests at `to`. */
export function barsAt(from = {}, to = {}, u = 1) {
  const k = reducedMotion() ? 1 : u >= 1 ? 1 : u <= 0 ? 0 : outBack(u);
  if (Array.isArray(to)) return to.map((v, i) => (from[i] ?? 0) + (v - (from[i] ?? 0)) * k);
  const out = {};
  for (const id of keysOf(from, to)) { const a = from[id] ?? 0, b = to[id] ?? a; out[id] = a + (b - a) * k; }
  return out;
}

/** Retargetable spring per bar on the scene clock (seconds). preset: SimAnim preset name or { period, zeta }. */
export function energyBarsTrack(values = {}, preset = { period: 0.5, zeta: 0.6 }) {
  const tr = {};
  for (const id of Object.keys(values)) tr[id] = springTrack(values[id], preset);
  return {
    to(next, t = 0) {
      for (const id of Object.keys(next)) { if (!tr[id]) tr[id] = springTrack(0, preset); tr[id].to(next[id], t); }
      return this;
    },
    at(t = 0) { const o = {}; for (const id of Object.keys(tr)) o[id] = tr[id].at(t); return o; },
    settled(t = 0) { return Object.values(tr).every((s) => s.settled(t)); },
  };
}

// Split a label into one or two lines that fit maxW (break at the space nearest the middle).
function labelLines(ctx, text, maxW) {
  const s = String(text ?? '');
  if (ctx.measureText(s).width <= maxW || s.indexOf(' ') < 0) return [s];
  // Two lines, split at the space that makes the wider line narrowest (balanced by width, not letters).
  let best = [s], bestW = Infinity;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== ' ') continue;
    const a = s.slice(0, i).trim(), b = s.slice(i + 1).trim();
    const wMax = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
    if (a && b && wMax < bestW) { best = [a, b]; bestW = wMax; }
  }
  return best;
}

// One bar fill: light side, body, shade side, inner highlight line, rim (clipped to the slot).
function barFill(ctx, x, y, w, h, col) {
  if (h <= 0.5) return;
  const r = Math.min(8, w / 2, h / 2);
  rr(ctx, x, y, w, h, r); ctx.fillStyle = col; ctx.fill();
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
  ctx.fillStyle = darken(col, 0.2); ctx.fillRect(x + w * 0.64, y, w * 0.4, h);           // shade side, away from the key light
  ctx.fillStyle = alpha(lighten(col, 0.4), 0.85); ctx.fillRect(x, y, w * 0.18, h);         // light side
  ctx.fillStyle = alpha(lighten(col, 0.7), 0.9); rr(ctx, x + w * 0.26, y + 5, w * 0.12, Math.max(0, h - 10), 3); ctx.fill();   // inner highlight line
  ctx.fillStyle = alpha(lighten(col, 0.55), 0.9); ctx.fillRect(x, y, w, Math.min(4, h));    // lit top edge
  ctx.restore();
  rr(ctx, x, y, w, h, r); ctx.strokeStyle = darken(col, 0.32); ctx.lineWidth = 2.5; ctx.stroke();
}

export function drawEnergyBars(ctx, c, o = {}) {
  const size = o.size ?? 21, barW = o.barW ?? 46, gap = o.gap ?? 22, h = o.h ?? 150;
  const max = o.max > 0 ? o.max : 1, panel = o.panel !== false, pad = panel ? 16 : 0;
  const vals = o.values ?? {};
  const bars = (o.bars ?? DEFAULT_BARS).map((b) => ({ ...b, value: vals[b.id] ?? b.value ?? 0 }));
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.font = font(c, 700, size, true);
  const slotW = barW + gap - 4;
  // Labels: wrap a long one onto two lines; if a line is still wider than its slot, shrink
  // the label font (never below minSize, the 12 px-on-screen floor), then open the gap to
  // the next bar just enough that neighbouring labels never touch.
  const lineWidth = (ls) => Math.max(0, ...ls.map((t) => ctx.measureText(t).width));
  let labSize = size, lines = bars.map((b) => labelLines(ctx, b.label ?? b.id, slotW));
  const minSize = Math.min(size, o.minSize ?? 21), widest = Math.max(0, ...lines.map(lineWidth));
  if (widest > slotW && size > minSize) {
    labSize = Math.max(minSize, Math.floor(size * slotW / widest));
    ctx.font = font(c, 700, labSize, true);
    lines = bars.map((b) => labelLines(ctx, b.label ?? b.id, slotW));
  }
  const labW = lines.map(lineWidth);
  ctx.font = font(c, 700, size, true);
  const nLines = Math.max(1, ...lines.map((l) => l.length));
  const lineH = Math.round(size * 1.12), labLineH = Math.round(labSize * 1.12);
  const titleH = o.title ? lineH + 6 : 0;
  const valH = o.showValues ? lineH + 4 : 8;
  const offs = [0];                                                              // each bar's left edge, from the first
  for (let i = 1; i < bars.length; i++) offs.push(offs[i - 1] + Math.max(barW + gap, (labW[i - 1] + labW[i]) / 2 + 12));
  const innerW = offs[offs.length - 1] + barW;
  const over = Math.max(0, labW[0] / 2 - barW / 2, labW[labW.length - 1] / 2 - barW / 2);   // label past the outer bars
  const w = innerW + pad * 2 + 2 * Math.max(0, over - pad + 6) + (o.showValues ? 12 : 0);
  const H = pad + titleH + valH + h + 10 + nLines * labLineH + pad - 4;
  const x0 = o.x ?? 20, y0 = o.y ?? 20;
  const bx0 = x0 + (w - innerW) / 2, top = y0 + pad + titleH + valH, baseY = top + h;

  if (o.anchor) {                                                                // leader first: it tucks under the panel
    const ax = o.anchor.x, ay = o.anchor.y;
    const ex = clamp(ax, x0 + 12, x0 + w - 12), ey = clamp(ay, y0 + 12, y0 + H - 12);
    const px = ax < x0 ? x0 : ax > x0 + w ? x0 + w : ex, py = ay < y0 ? y0 : ay > y0 + H ? y0 + H : ey;
    leader(ctx, px, py, ax, ay, c.labelMuted, 1, 0, { frame: o.frame });
    ctx.beginPath(); ctx.arc(ax, ay, 5, 0, Math.PI * 2); ctx.fillStyle = c.label; ctx.fill();
    ctx.strokeStyle = c.bgSurface; ctx.lineWidth = 2; ctx.stroke();
  }
  if (panel) {
    rr(ctx, x0, y0 + 4, w, H, 14); ctx.fillStyle = darken(c.raised, 0.3); ctx.fill();          // lip
    rr(ctx, x0, y0, w, H, 14); ctx.fillStyle = c.raised; ctx.fill();
    rr(ctx, x0, y0, w, H, 14); ctx.strokeStyle = mix(c.raised, c.stroke, 0.7); ctx.lineWidth = 2.5; ctx.stroke();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if (o.title) { ctx.fillStyle = c.label; ctx.fillText(String(o.title), x0 + w / 2, y0 + pad + size * 0.9); }

  const out = [];
  bars.forEach((b, i) => {
    const x = bx0 + offs[i], col = toneOf(c, b.tone ?? i + 1);
    // The slot: an empty rimmed well that shows even at 0.
    rr(ctx, x, top, barW, h, 9); ctx.fillStyle = mix(c.track, c.bgDeep, 0.25); ctx.fill();
    ctx.save(); rr(ctx, x, top, barW, h, 9); ctx.clip();
    ctx.fillStyle = alpha(darken(c.bgDeep, 0.3), 0.35); ctx.fillRect(x, top, barW, 6);      // inner shadow under the rim
    ctx.restore();
    const v = clamp(b.value / max, 0, 1.08), fh = (h - 6) * v;
    barFill(ctx, x + 3, baseY - 3 - fh, barW - 6, fh, col);                                   // may poke past the rim on overshoot
    rr(ctx, x, top, barW, h, 9); ctx.strokeStyle = mix(c.track, c.stroke, 0.8); ctx.lineWidth = 2.5; ctx.stroke();
    const ty = baseY - 3 - fh;
    if (o.showValues) {
      const n = Math.round(b.value * 10) / 10;
      ctx.fillStyle = c.label;
      ctx.fillText(String(n) + (o.units ? ' ' + o.units : ''), x + barW / 2, Math.min(top, ty) - 8);
    }
    ctx.fillStyle = c.label;
    if (labSize !== size) ctx.font = font(c, 700, labSize, true);
    lines[i].forEach((ln, k) => ctx.fillText(ln, x + barW / 2, baseY + 8 + (k + 1) * labLineH - 4));
    if (labSize !== size) ctx.font = font(c, 700, size, true);
    out.push({ id: b.id, x, w: barW, top: { x: x + barW / 2, y: ty }, value: b.value });
  });
  rr(ctx, bx0 - 8, baseY - 1.5, innerW + 16, 3, 1.5); ctx.fillStyle = c.stroke; ctx.fill();   // the common baseline

  if (o.total != null) {
    const ty = baseY - 3 - (h - 6) * clamp(o.total / max, 0, 1.08);
    ctx.save();
    ctx.setLineDash([7, 6]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx0 - 10, ty); ctx.lineTo(bx0 + innerW + 10, ty);
    ctx.strokeStyle = c.label; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  return { x0, y0, w, h: H, baseY, bars: out };
}

export function drawWorkCounter(ctx, c, o = {}) {
  const size = o.size ?? 22, text = String(o.text ?? '');
  const bg = toneOf(c, o.tone ?? 'accent'), ink = inkOn(c, bg);
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.font = font(c, 700, size, true);
  const w = ctx.measureText(text).width + size * 1.6, h = size + 18;
  const x0 = o.align === 'left' ? o.x : o.align === 'right' ? o.x - w : o.x - w / 2, y0 = o.y - h / 2;
  stadium(ctx, x0, y0 + 4, w, h); ctx.fillStyle = darken(bg, 0.38); ctx.fill();                 // lip
  stadium(ctx, x0, y0, w, h); ctx.fillStyle = bg; ctx.fill();
  ctx.save(); stadium(ctx, x0, y0, w, h); ctx.clip();
  ctx.fillStyle = darken(bg, 0.12); ctx.fillRect(x0, y0 + h * 0.62, w, h);                    // shade side
  ctx.fillStyle = alpha(lighten(bg, 0.5), 0.8); rr(ctx, x0 + h * 0.4, y0 + 4, w * 0.3, 3, 1.5); ctx.fill();   // light line
  ctx.restore();
  stadium(ctx, x0, y0, w, h); ctx.strokeStyle = darken(bg, 0.32); ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x0 + w / 2, y0 + h / 2 + 1);
  ctx.restore();
  return { x0, y0, w, h };
}
