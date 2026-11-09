/**
 * SimChanceTrials - repeated trials for canvas AND DOM scenes: frequency EMERGES
 * from running trials, instead of a number being typed in. Pure and seeded
 * (mulberry32): the same seed gives the same run on every mount, never crypto.*
 * and never Math.random inside a draw. Pair it with SimChartCanvas for the
 * running-frequency line (traceCanvas with a target) or bars for counts.
 *
 *   const run = trialRun({ seed: 7, n: 150, draw: (rnd) => (rnd() < 0.6 ? 'red' : 'blue') });
 *   run.outcomes            the n outcomes in order
 *   run.count(id, upTo)     how many of `id` in the first upTo trials (default all)
 *   run.freq(id, upTo)      relative frequency count / upTo (0 when upTo is 0)
 *   run.series(id, upTo)    [{ x: k, y: freq after k trials }] for k = 1..upTo (a running-frequency line)
 *   run.bins(upTo)          { id: count } over the first upTo trials
 *   trialStripCanvas(ctx, c, run, { upTo, rect, tones: { red: 's6' }, last })   the last `last` draws as dots
 *
 * draw(rnd) returns an outcome id (string or number); rnd() is in [0, 1). Several
 * dice: draw: (rnd) => 1 + Math.floor(rnd() * 6) + 1 + Math.floor(rnd() * 6).
 */
import { mulberry32, MIN_PX, font, alpha } from './SimLook.js';
import { toneColor } from './SimNumberLineCanvas.js';

export function trialRun(o = {}) {
  const n = o.n ?? 100;
  if (!(n > 0) || typeof o.draw !== 'function') throw new Error('trialRun: needs n > 0 and a draw(rnd) function');
  const rnd = mulberry32(o.seed ?? 1);
  const outcomes = [];
  for (let i = 0; i < n; i++) outcomes.push(o.draw(rnd));
  const run = {
    n, outcomes,
    count(id, upTo = n) { let k = 0; for (let i = 0; i < Math.min(upTo, n); i++) if (outcomes[i] === id) k++; return k; },
    freq(id, upTo = n) { const u = Math.min(upTo, n); return u > 0 ? run.count(id, u) / u : 0; },
    series(id, upTo = n) {
      const out = []; let k = 0;
      for (let i = 0; i < Math.min(upTo, n); i++) { if (outcomes[i] === id) k++; out.push({ x: i + 1, y: k / (i + 1) }); }
      return out;
    },
    bins(upTo = n) { const b = {}; for (let i = 0; i < Math.min(upTo, n); i++) b[outcomes[i]] = (b[outcomes[i]] ?? 0) + 1; return b; },
  };
  return run;
}

/** The latest draws as a strip of dots in rect { x, y, w, h }; tones maps outcome -> tone (series number or colour key). */
export function trialStripCanvas(ctx, c, run, o = {}) {
  const upTo = Math.min(o.upTo ?? run.n, run.n), last = o.last ?? 30, rect = o.rect ?? { x: 20, y: 440, w: 640, h: 40 };
  const from = Math.max(0, upTo - last), n = upTo - from;
  if (n <= 0) return;
  const gap = rect.w / Math.max(last, 1), r = Math.max(5, Math.min(rect.h / 2 - 2, gap / 2 - 2));
  ctx.save();
  for (let i = from; i < upTo; i++) {
    const x = rect.x + (i - from + 0.5) * gap + (last - n) * gap, y = rect.y + rect.h / 2;
    const col = toneColor(c, (o.tones ?? {})[run.outcomes[i]] ?? 1);
    ctx.beginPath(); ctx.arc(x, y + 2, r, 0, Math.PI * 2); ctx.fillStyle = alpha(c.bgDeep, 0.5); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
  }
  ctx.restore();
}
