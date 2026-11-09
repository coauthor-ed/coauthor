/**
 * SimNumberLineSpec - the render-agnostic half of the number line: layout,
 * scale maps (x(v), v(px), snap), tick lists, fraction labels. No DOM, no
 * canvas. Two thin renderers draw it: SimNumberLine.js (SVG in the DOM stage)
 * and SimNumberLineCanvas.js (2D canvas).
 */
import { fmtNum } from './SimText.js';

const EPS = 1e-9;
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

/** A value as a fraction part (whole numbers stay plain). */
export function fracLabel(v, den) {
  const n = Math.round(v * den);
  if (Math.abs(v * den - n) > 1e-6) return fmtNum(v, { dp: 2 });
  if (n % den === 0) return fmtNum(n / den);
  const g = gcd(Math.abs(n), den);
  return ['frac', (n < 0 ? '\u2212' : '') + Math.abs(n) / g, den / g];
}

/**
 * Layout in rect (stage px); the line sits at `at` (0.55) of rect.h.
 * @opts rect, min, max, step, minor, labels, den, snap, pad, dp, at, minorLabels
 */
export function numberLine(o = {}) {
  const r = o.rect ?? { x: 0, y: 0, w: 648, h: 300 };
  const { min, max } = o;
  const step = o.step ?? 1, minor = o.minor ?? 0;
  if (!(Number.isFinite(min) && Number.isFinite(max) && min < max)) throw new Error('numberLine: min must be below max');
  if (!(step > 0)) throw new Error('numberLine: step must be > 0');
  if ((max - min) / step > 40 + EPS) throw new Error('numberLine: more than 40 major ticks; raise step');
  const pad = o.pad ?? 34;
  const x0 = r.x + pad, x1 = r.x + r.w - pad, y = r.y + r.h * (o.at ?? 0.55);
  const x = (v) => x0 + ((v - min) / (max - min)) * (x1 - x0);
  const v = (px) => min + ((px - x0) / (x1 - x0)) * (max - min);
  const snapStep = o.snap ?? (minor ? step / minor : step);
  const snap = (px) => Math.max(min, Math.min(max, +(Math.round((v(px) - min) / snapStep) * snapStep + min).toFixed(10)));
  const den = o.den ?? Math.round(1 / (minor ? step / minor : step));
  const dp = o.dp ?? Math.max(0, -Math.floor(Math.log10(step) + EPS));
  const label = (val) => (o.labels === 'none' ? null : o.labels === 'frac' ? fracLabel(val, den) : o.labels === 'dec' ? fmtNum(val, { dp }) : fmtNum(Math.round(val)));
  const n = Math.round((max - min) / step);
  const gap = (x1 - x0) / n;
  // Thin labels on a narrow line: every k-th major keeps its number.
  const need = o.labels === 'dec' ? 18 + dp * 11 : 30;
  const every = Math.max(1, Math.ceil(need / gap));
  const ticks = [];
  for (let i = 0; i <= n; i++) {
    const val = +(min + i * step).toFixed(10);
    ticks.push({ v: val, major: true, label: i % every === 0 ? label(val) : null });
    if (minor && i < n) for (let j = 1; j < minor; j++) {
      const mv = +(val + (j * step) / minor).toFixed(10);
      const room = gap / minor >= 30 && every === 1;
      ticks.push({ v: mv, major: false, label: o.labels === 'frac' && o.minorLabels !== false && room ? label(mv) : null });
    }
  }
  return { rect: r, min, max, step, minor, x0, x1, y, x, v, snap, ticks, den, zones: null };
}

/** The 0-1 chance line with zone words. @opts rect */
export function probTrack(o = {}) {
  const nl = numberLine({ ...o, min: 0, max: 1, step: 0.5, minor: 2, labels: 'frac', den: 4 });
  nl.zones = [
    { from: 0, to: 0, word: 'impossible', tone: 'bad' }, { from: 0, to: 0.5, word: 'unlikely', tone: 8 },
    { from: 0.5, to: 0.5, word: 'even chance', tone: 'warning' }, { from: 0.5, to: 1, word: 'likely', tone: 3 }, { from: 1, to: 1, word: 'certain', tone: 'good' },
  ];
  return nl;
}
