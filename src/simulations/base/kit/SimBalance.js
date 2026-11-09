/**
 * SimBalance - a pan balance for canvas scenes: algebra (x + 3 = 7), weighing,
 * a law court's scales. The scene eases `tilt` toward balanceTilt(...) and is
 * busy() while it moves.
 *
 *   balanceTilt(left, right, { max, scale }) -> radians (+ = right pan down)
 *   drawBalance(ctx, c, { x, y, w, tilt, left: [items], right: [items], tone, face, t }) -> { left, right } pan centres
 *   items: [{ kind: 'block' | 'weight' | 'chip', text, tone, w?, h? }]  stacked bottom-up in rows
 * Pans hang level from the beam ends; items keep upright. (x, y) is the pivot.
 */
import { alpha, darken, lighten, font, rr, pill, ellipse, drawFace, drawShadow, inkOn } from './SimLook.js';

/** Tilt for two totals: grows with the difference, saturates at max (default 0.3 rad). @opts max, scale */
export function balanceTilt(left, right, o = {}) {
  const max = o.max ?? 0.3, scale = o.scale ?? Math.max(1, (Math.abs(left) + Math.abs(right)) / 4);
  return max * Math.tanh((right - left) / scale);
}

function item(ctx, c, it, x, y) {
  const tone = it.tone ?? c.s1;
  if (it.kind === 'block') {
    const w = it.w ?? 46, h = it.h ?? 56;
    rr(ctx, x - w / 2, y - h + 4, w, h, 10); ctx.fillStyle = darken(tone, 0.38); ctx.fill();
    rr(ctx, x - w / 2, y - h, w, h, 10); ctx.fillStyle = tone; ctx.fill();
    rr(ctx, x - w / 2 + 7, y - h + 5, w - 14, 5, 2.5); ctx.fillStyle = alpha(lighten(tone, 0.6), 0.6); ctx.fill();
    ctx.font = font(c, 800, 26, true); ctx.fillStyle = inkOn(c, tone); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(it.text ?? 'x'), x, y - h / 2 + 1);
    return { w, h };
  }
  if (it.kind === 'weight') {
    const w = it.w ?? 30, h = it.h ?? 28;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.36, y - h); ctx.lineTo(x + w * 0.36, y - h); ctx.lineTo(x + w / 2, y); ctx.lineTo(x - w / 2, y); ctx.closePath();
    ctx.fillStyle = darken(tone, 0.25); ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = tone; ctx.fillRect(x - w / 2 - 4, y - h, w * 0.78, h); ctx.restore();
    ctx.beginPath(); ctx.arc(x, y - h - 2, w * 0.2, Math.PI, 0); ctx.strokeStyle = darken(tone, 0.3); ctx.lineWidth = 4; ctx.stroke();
    if (it.text != null) { ctx.font = font(c, 800, 15, true); ctx.fillStyle = inkOn(c, tone); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(it.text), x, y - h / 2 + 1); }
    return { w, h: h + 8 };
  }
  const box = pill(ctx, c, String(it.text ?? ''), x, y - 14, { bg: tone, size: 15 });
  return { w: box.w, h: box.h };
}

// Items stand in one row on the pan, squeezed together into a pile when they
// do not fit (a second row would float above the short items).
function stack(ctx, c, items, cx, top, panW) {
  const ws = items.map((it) => (it.kind === 'block' ? it.w ?? 46 : it.kind === 'weight' ? it.w ?? 30 : 60) + 4);
  const total = ws.reduce((s, w) => s + w, 0), room = panW - 16;
  const squeeze = total > room && items.length > 1 ? (total - room) / (items.length - 1) : 0;
  let x = cx - Math.min(total, room) / 2;
  items.forEach((it, i) => { item(ctx, c, it, x + ws[i] / 2, top); x += ws[i] - squeeze; });
}

/** A balance with its pivot at (x, y). @opts w, tilt, left, right, tone, face, t, standH */
export function drawBalance(ctx, c, o = {}) {
  const { x, y } = o, w = o.w ?? 360, tilt = o.tilt ?? 0, tone = o.tone ?? c.gold;
  const metal = darken(tone, 0.15), standH = o.standH ?? 170;
  const half = w / 2, chain = 70, panW = Math.min(210, w * 0.52);
  // Stand.
  drawShadow(ctx, c, x, y + standH + 6, 90, 12);
  rr(ctx, x - 70, y + standH - 14, 140, 20, 10); ctx.fillStyle = darken(metal, 0.3); ctx.fill();
  rr(ctx, x - 64, y + standH - 18, 128, 16, 8); ctx.fillStyle = metal; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 14, y + standH - 16); ctx.lineTo(x - 7, y + 10); ctx.lineTo(x + 7, y + 10); ctx.lineTo(x + 14, y + standH - 16); ctx.closePath();
  ctx.fillStyle = darken(metal, 0.12); ctx.fill();
  ctx.fillStyle = alpha(lighten(metal, 0.5), 0.5); ctx.fillRect(x - 7, y + 20, 4, standH - 44);
  // Beam, rotated about the pivot.
  const ends = [-1, 1].map((s) => ({ x: x + s * half * Math.cos(tilt), y: y + s * half * Math.sin(tilt) }));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  rr(ctx, -half - 6, -6 + 4, w + 12, 13, 6.5); ctx.fillStyle = darken(metal, 0.35); ctx.fill();
  rr(ctx, -half - 6, -7, w + 12, 13, 6.5); ctx.fillStyle = metal; ctx.fill();
  rr(ctx, -half + 4, -5, w - 8, 3.5, 1.75); ctx.fillStyle = alpha(lighten(metal, 0.6), 0.6); ctx.fill();
  ctx.restore();
  // Pivot cap (with a face when asked: a character is part of the look).
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fillStyle = lighten(metal, 0.1); ctx.fill();
  if (o.face) drawFace(ctx, x, y + 1, 15, { col: lighten(metal, 0.1), c, mood: o.face, t: o.t });
  else { ctx.beginPath(); ctx.arc(x - 4, y - 5, 4, 0, Math.PI * 2); ctx.fillStyle = alpha(lighten(metal, 0.7), 0.7); ctx.fill(); }
  // Pans hang level on chains from the beam ends.
  const pans = ends.map((e, i) => {
    const py = e.y + chain;
    ctx.strokeStyle = darken(metal, 0.2); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x - panW / 2 + 8, py); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + panW / 2 - 8, py); ctx.stroke();
    ctx.beginPath(); ctx.arc(e.x, e.y, 6, 0, Math.PI * 2); ctx.fillStyle = darken(metal, 0.3); ctx.fill();
    const items = i ? o.right : o.left;
    stack(ctx, c, items ?? [], e.x, py - 2, panW);
    ellipse(ctx, e.x, py + 4, panW / 2, 12); ctx.fillStyle = darken(metal, 0.35); ctx.fill();
    ellipse(ctx, e.x, py, panW / 2, 11); ctx.fillStyle = metal; ctx.fill();
    ellipse(ctx, e.x - panW * 0.15, py - 3, panW * 0.22, 3); ctx.fillStyle = alpha(lighten(metal, 0.6), 0.55); ctx.fill();
    return { x: e.x, y: py };
  });
  return { left: pans[0], right: pans[1] };
}
