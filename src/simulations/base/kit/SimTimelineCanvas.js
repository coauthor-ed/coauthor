/**
 * SimTimelineCanvas - a timeline strip for canvas scenes (the DOM board is
 * SimTimeline.js; same year conventions: negative = BCE, no year 0). One strip:
 * era bands, decade or century ticks with dates, event tags in measured lanes
 * (never overlapping), duration brackets with a DERIVED label, and a "now" marker
 * with a date pill. Text is at least MIN_PX (14). Linear scale only.
 *
 *   const tl = timelineAxis({ rect: { x, y, w, h }, from: -7000, to: -1000, ticks });   ticks optional: nice ones are chosen
 *   tl.x(year) -> px      tl.year(px) -> year      tl.y  the axis line's y      tl.ticks  [year, ...]
 *   timelineCanvas(ctx, c, tl, {
 *     eras:   [{ from, to, label, tone, a: 0..1 }]       bands above the axis (a: how lit, default 1); a label too wide for its band becomes a tag in the lanes
 *     events: [{ at, label, tone, when?, a: 0..1 }]       tags on stems in lanes above the bands
 *     spans:  [{ from, to, label?, tone, a }]             brackets below the dates; label defaults to the derived duration
 *     now:    year | null                                  marker with a date pill
 *     fmt:    (year) => string                             default fmtYear
 *   }) -> { events: [{ box, event }], eras: [{ box, era }] }   boxes for hit tests
 * Tones: series numbers 1..8 or a colour key. ASCII only.
 */
import { MIN_PX, font, pill, chipSize, rr, alpha, darken } from './SimLook.js';
import { fmtYear, fmtSpan } from './SimText.js';
import { toneColor } from './SimNumberLineCanvas.js';
import { lookOf } from './lookProfile.js';

const STEPS = [1, 2, 5];
function niceTicks(from, to, max = 10) {
  const span = to - from;
  for (let k = 0; k < 8; k++) for (const m of STEPS) {
    const step = m * 10 ** k;
    if (span / step <= max) {
      const out = [];
      for (let v = Math.ceil(from / step) * step; v <= to + 1e-9; v += step) out.push(v);
      return out;
    }
  }
  return [from, to];
}

export function timelineAxis(o = {}) {
  const r = o.rect ?? { x: 20, y: 200, w: 640, h: 200 };
  const { from, to } = o;
  if (!(Number.isFinite(from) && Number.isFinite(to) && from < to)) throw new Error('timelineAxis: from must be before to');
  const pad = o.pad ?? 30, x0 = r.x + pad, x1 = r.x + r.w - pad;
  const x = (yr) => x0 + ((yr - from) / (to - from)) * (x1 - x0);
  return { rect: r, from, to, x0, x1, y: r.y + r.h * (o.at ?? 0.62), x, year: (px) => from + ((px - x0) / (x1 - x0)) * (to - from), ticks: o.ticks ?? niceTicks(from, to, Math.max(4, Math.floor((x1 - x0) / 90))) };
}

export function timelineCanvas(ctx, c, tl, o = {}) {
  const fmt = o.fmt ?? ((v) => fmtYear(v));
  const y = tl.y, out = { events: [], eras: [] };
  ctx.save();
  // era bands sit just above the axis
  const bandH = 34, bandY = y - bandH - 8, eraTags = [], lip = lookOf().lip;
  for (const e of o.eras ?? []) {
    const xa = tl.x(Math.max(e.from, tl.from)), xb = tl.x(Math.min(e.to, tl.to)), a = e.a ?? 1, col = toneColor(c, e.tone ?? 1);
    ctx.globalAlpha = 0.25 + 0.75 * a;
    if (lip) { rr(ctx, xa + 1, bandY + 3 * lip, xb - xa - 2, bandH, 8); ctx.fillStyle = darken(col, 0.38); ctx.fill(); }
    rr(ctx, xa + 1, bandY, xb - xa - 2, bandH, 8); ctx.fillStyle = col; ctx.fill();
    ctx.globalAlpha = 1;
    if (e.label) {
      const sz = chipSize(ctx, c, e.label, MIN_PX);
      if (sz.w - 10 <= xb - xa) pill(ctx, c, e.label, (xa + xb) / 2, bandY + bandH / 2, { bg: col, size: MIN_PX, alpha: 0.25 + 0.75 * a });
      else eraTags.push({ at: (e.from + e.to) / 2, label: e.label, tone: e.tone ?? 1, a, fromBand: true });   // too narrow: named by a tag in the lanes
    }
    out.eras.push({ box: { x0: xa, y0: bandY, w: xb - xa, h: bandH }, era: e });
  }
  // axis + ticks + dates (a date is dropped when it would touch the previous one)
  ctx.strokeStyle = c.label; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(tl.x0 - 8, y); ctx.lineTo(tl.x1 + 8, y); ctx.stroke();
  ctx.font = font(c, 800, MIN_PX); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  let lastR = -Infinity;
  for (const t of tl.ticks) {
    const x = tl.x(t);
    ctx.fillStyle = c.label; ctx.fillRect(x - 1.5, y - 8, 3, 16);
    const label = fmt(t), w = ctx.measureText(label).width;
    if (x - w / 2 < lastR + 8) continue;
    lastR = x + w / 2;
    ctx.fillStyle = c.labelMuted; ctx.fillText(label, x, y + 30);
  }
  // spans: brackets under the dates
  for (const s of o.spans ?? []) {
    const xa = tl.x(s.from), xb = tl.x(s.to), by = y + 52, a = s.a ?? 1, col = toneColor(c, s.tone ?? 'accent');
    ctx.globalAlpha = 0.25 + 0.75 * a; ctx.strokeStyle = col; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(xa, by - 10); ctx.quadraticCurveTo(xa, by, xa + 10, by); ctx.lineTo(xb - 10, by); ctx.quadraticCurveTo(xb, by, xb, by - 10); ctx.stroke();
    ctx.globalAlpha = 1;
    pill(ctx, c, s.label ?? fmtSpan(s.from, s.to), (xa + xb) / 2, by + 22, { bg: col, size: MIN_PX, alpha: 0.25 + 0.75 * a });
  }
  // events: stems up from the axis to tags in the first lane with room
  const lanes = [];
  const sorted = [...(o.events ?? []), ...eraTags].sort((p, q) => p.at - q.at);
  for (const e of sorted) {
    const sz = chipSize(ctx, c, e.label, MIN_PX), cx = Math.max(tl.rect.x + sz.w / 2 + 2, Math.min(tl.rect.x + tl.rect.w - sz.w / 2 - 2, tl.x(e.at)));
    let lane = 0;
    while ((lanes[lane] ?? []).some((b) => cx - sz.w / 2 < b.r + 6 && cx + sz.w / 2 > b.l - 6)) lane++;
    (lanes[lane] ??= []).push({ l: cx - sz.w / 2, r: cx + sz.w / 2 });
    const ty = bandY - 22 - sz.h / 2 - lane * (sz.h + 10), a = e.a ?? 1, col = toneColor(c, e.tone ?? 'accent');
    ctx.globalAlpha = 0.25 + 0.75 * a; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([2, 6]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tl.x(e.at), e.fromBand ? bandY : y); ctx.lineTo(tl.x(e.at), ty + sz.h / 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const box = pill(ctx, c, e.label, cx, ty, { bg: col, size: MIN_PX, alpha: 0.25 + 0.75 * a });
    out.events.push({ box, event: e });
  }
  if (o.now != null) {
    const x = tl.x(o.now);
    ctx.strokeStyle = c.warning; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y - 40); ctx.lineTo(x, y + 14); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fillStyle = c.warning; ctx.fill();
    pill(ctx, c, fmt(o.now), x, y - 52, { bg: c.warning, size: MIN_PX });
  }
  ctx.restore();
  return out;
}
