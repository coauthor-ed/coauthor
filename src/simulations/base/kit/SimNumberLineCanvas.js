/**
 * SimNumberLineCanvas - the canvas renderer for the number-line spec
 * (SimNumberLineSpec.js: numberLine, probTrack, fracLabel). Same spec as the
 * SVG renderer in SimNumberLine.js, so a canvas scene gets the same line,
 * ticks, snapping and fraction labels without a local copy. Tick numerals are
 * never below MIN_PX (14).
 *
 *   const nl = numberLine({ rect, min, max, step, minor, labels, den, snap, at });
 *   numberLineCanvas(ctx, c, nl, { tone, arrows, labelSize })
 *   markerCanvas(ctx, c, nl, v, { text, tone, grab, below, lift, scale }) -> { x, y, r, box }  hit circle for drags
 *   hopCanvas(ctx, c, nl, a, b, { tone, text, lift, draw: 0..1 })
 *   spanCanvas(ctx, c, nl, a, b, { text, tone, drop })
 *   hitMarker(hit, px, py, slack = 0) -> boolean     pointer test for a marker
 * Tones: series numbers 1..8 or 'accent' | 'good' | 'bad' | 'warning'. ASCII only.
 */
import { MIN_PX, font, pill, darken, alpha, rr } from './SimLook.js';
import { drawMath } from './SimText.js';
import { lookOf } from './lookProfile.js';

const EPS = 1e-9;

/** Resolve a tone (series number or colour key) to a resolved colour. */
export function toneColor(c, t = 'accent') {
  return typeof t === 'number' ? c['s' + (((Math.max(1, t | 0) - 1) % 8) + 1)] : (c[t] ?? t);
}

function text(ctx, c, label, x, y, size, col, weight = 800) {
  if (Array.isArray(label)) { drawMath(ctx, c, [label], x, y, { size, weight, col, align: 'center' }); return; }
  ctx.font = font(c, weight, size);
  ctx.fillStyle = col;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(label), x, y);
}

/** Track, arrowheads, ticks and labels. Returns nothing; nl holds the geometry. @opts tone, labelSize, arrows */
export function numberLineCanvas(ctx, c, nl, o = {}) {
  const tr = o.tone ? toneColor(c, o.tone) : c.stroke;
  const y = nl.y, a0 = nl.x0 - 22, a1 = nl.x1 + 22;
  const size = Math.max(MIN_PX, o.labelSize ?? 18);
  ctx.save();
  if (nl.zones) for (const z of nl.zones) if (z.to > z.from) {
    rr(ctx, nl.x(z.from), y - 16, nl.x(z.to) - nl.x(z.from), 32, 16);
    ctx.fillStyle = alpha(toneColor(c, z.tone), 0.2);
    ctx.fill();
  }
  const L = lookOf();   // plain (lip 0): a flat 8 px bar, as numberLineSvg
  if (L.lip) {
    rr(ctx, a0, y - 7 + 4 * L.lip, a1 - a0, 14, 7); ctx.fillStyle = darken(tr, 0.4); ctx.fill();
    rr(ctx, a0, y - 7, a1 - a0, 14, 7); ctx.fillStyle = tr; ctx.fill();
  } else { rr(ctx, a0, y - 4, a1 - a0, 8, 4); ctx.fillStyle = tr; ctx.fill(); }
  if (o.arrows !== false) for (const s of [-1, 1]) {
    const ax = s < 0 ? a0 - 4 : a1 + 4;
    ctx.beginPath();
    ctx.moveTo(ax + s * 16, y);
    ctx.lineTo(ax - s * 2, y - 13);
    ctx.quadraticCurveTo(ax - s * 6, y, ax - s * 2, y + 13);
    ctx.closePath();
    ctx.fillStyle = tr;
    ctx.fill();
  }
  let lastRight = -Infinity;
  for (const tk of nl.ticks) {
    const x = nl.x(tk.v), th = tk.major ? 26 : 14, tw = tk.major ? 5 : 3.5;
    ctx.globalAlpha = tk.major ? 1 : 0.55;
    rr(ctx, x - tw / 2, y - th / 2, tw, th, tw / 2); ctx.fillStyle = c.label; ctx.fill();
    ctx.globalAlpha = 1;
    if (tk.label == null) continue;
    const zero = Math.abs(tk.v) < EPS && nl.min < 0;
    const col = zero ? c.accent : tk.major ? c.label : c.labelMuted;
    const px = tk.major ? size : Math.max(MIN_PX, size - 2);
    ctx.font = font(c, 800, px);
    const w = Array.isArray(tk.label) ? px * 1.4 : ctx.measureText(String(tk.label)).width;
    if (x - w / 2 < lastRight + 4) continue;   // density drops instead of overprinting
    lastRight = x + w / 2;
    text(ctx, c, tk.label, x, y + (Array.isArray(tk.label) ? 24 : 22 + px * 0.8), px, col);
  }
  if (nl.zones) {
    const tight = (nl.x1 - nl.x0) / 4 < 110;
    nl.zones.forEach((z, i) => pill(ctx, c, z.word, nl.x((z.from + z.to) / 2), y + 88 + (tight && i % 2 ? 32 : 0), { bg: toneColor(c, z.tone), size: MIN_PX }));
  }
  ctx.restore();
}

/** A pin at v with an optional chip. Returns { x, y, r, box } (x, y, r: the grab circle). @opts tone, below, lift, scale, grab, text */
export function markerCanvas(ctx, c, nl, v, o = {}) {
  const col = toneColor(c, o.tone ?? 'accent'), x = nl.x(v), dir = o.below ? 1 : -1;
  const lift = o.lift ?? 46, hy = nl.y + dir * lift, r = 13 * (o.scale ?? 1);
  ctx.save();
  ctx.strokeStyle = darken(col, 0.35); ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, nl.y); ctx.lineTo(x, hy); ctx.stroke();
  if (o.grab) { ctx.beginPath(); ctx.arc(x, hy, r + 8, 0, Math.PI * 2); ctx.fillStyle = alpha(col, 0.22); ctx.fill(); }
  const lip = lookOf().lip;
  if (lip) { ctx.beginPath(); ctx.arc(x, hy + 3 * lip, r, 0, Math.PI * 2); ctx.fillStyle = darken(col, 0.38); ctx.fill(); }
  ctx.beginPath(); ctx.arc(x, hy, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
  ctx.beginPath(); ctx.arc(x, nl.y, 7, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = c.bgDeep; ctx.stroke();
  ctx.restore();
  let box = null;
  if (o.text != null) {
    const cx = Math.max(nl.rect.x + 70, Math.min(nl.rect.x + nl.rect.w - 70, x));
    box = pill(ctx, c, String(o.text), cx, hy + dir * (r + 24), { bg: col, size: MIN_PX + 1 });
  }
  return { x, y: hy, r: r + 16, box };
}

/** Pointer test against a markerCanvas() result. */
export function hitMarker(hit, px, py, slack = 0) {
  const dx = px - hit.x, dy = py - hit.y, r = hit.r + slack;
  return dx * dx + dy * dy <= r * r;
}

/** An arc from a to b with an arrowhead; draw 0..1 reveals it. @opts tone, text, lift, below, draw */
export function hopCanvas(ctx, c, nl, a, b, o = {}) {
  const col = toneColor(c, o.tone ?? 2), xa = nl.x(a), xb = nl.x(b);
  const dir = Math.sign(b - a) || 1, vd = o.below ? 1 : -1;
  const lift = o.lift ?? Math.min(120, 30 + Math.abs(xb - xa) * 0.4);
  const y = nl.y - 8 * (o.below ? -1 : 1), k = o.draw ?? 1;
  if (k <= 0) return;
  const cy = y + vd * lift * 2, steps = 40;
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= steps * Math.min(1, k); i++) {
    const t = i / steps, mt = 1 - t;
    const px = mt * mt * xa + 2 * mt * t * ((xa + xb) / 2) + t * t * xb;
    const py = mt * mt * y + 2 * mt * t * cy + t * t * y;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.stroke();
  if (k >= 1) {
    ctx.beginPath();
    ctx.moveTo(xb - dir * 2, y + 2); ctx.lineTo(xb - dir * 14, y - 7); ctx.lineTo(xb - dir * 13, y + 6); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
  }
  ctx.restore();
  if (o.text != null && k >= 1) pill(ctx, c, String(o.text), (xa + xb) / 2, y - lift - 16, { bg: col, size: MIN_PX });
}

/** A bracket below the labels from a to b with a chip. @opts text, tone, drop */
export function spanCanvas(ctx, c, nl, a, b, o = {}) {
  const col = toneColor(c, o.tone ?? 'accent'), xa = nl.x(a), xb = nl.x(b), y = nl.y + (o.drop ?? 62);
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(xa, y - 10); ctx.quadraticCurveTo(xa, y, xa + 10, y);
  ctx.lineTo(xb - 10, y); ctx.quadraticCurveTo(xb, y, xb, y - 10);
  ctx.stroke();
  ctx.restore();
  if (o.text != null) pill(ctx, c, String(o.text), (xa + xb) / 2, y + 18, { bg: col, size: MIN_PX });
}
