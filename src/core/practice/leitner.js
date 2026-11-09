/**
 * Leitner scheduling from questionAttempts rows. Pure; no I/O.
 * Boxes 1-5, review intervals 1, 2, 4, 8, 16 days. A question starts in
 * box 1; a correct answer moves it up one box (max 5), a wrong one resets
 * it to box 1. The next review is due `INTERVALS[box-1]` days after the
 * last attempt, counted in LOCAL calendar days.
 */

export const INTERVALS = [1, 2, 4, 8, 16];

const pad = (n) => String(n).padStart(2, '0');

/** Local date string YYYY-MM-DD from a Date (device local time, not UTC). */
export function localDateString(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayNumber(dateLocal) {
  const [y, m, d] = String(dateLocal).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** dateLocal + n calendar days. */
export function addDays(dateLocal, n) {
  const [y, m, d] = dateLocal.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from a to b (b - a). */
export function daysBetween(a, b) {
  return dayNumber(b) - dayNumber(a);
}

function attemptDate(row) {
  const t = new Date(row.at);
  return Number.isNaN(t.getTime()) ? null : localDateString(t);
}

/**
 * Box state for one question's rows (any order).
 * @returns {{box:number, seen:boolean, lastCorrect:boolean|null,
 *   lastDate:string|null, dueDate:string|null}}
 */
export function leitnerState(rows) {
  const sorted = (rows || [])
    .filter((r) => r && attemptDate(r))
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  if (!sorted.length) return { box: 1, seen: false, lastCorrect: null, lastDate: null, dueDate: null };
  let box = 1;
  for (const r of sorted) box = r.correct ? Math.min(5, box + 1) : 1;
  const last = sorted[sorted.length - 1];
  const lastDate = attemptDate(last);
  return {
    box,
    seen: true,
    lastCorrect: !!last.correct,
    lastDate,
    dueDate: addDays(lastDate, INTERVALS[box - 1]),
  };
}

/** Tiers, higher is more urgent. */
export const TIER = { DUE: 4, WRONG_LAST: 3, UNSEEN: 2, REST: 1 };

/**
 * Rank one question: `{tier, score, state}`. `score` orders within a tier
 * (more overdue first, lower box first); compare by tier, then score.
 * Tiers: due for review, then wrong last time, then never seen, then rest.
 */
export function rank(rows, today) {
  const state = leitnerState(rows);
  if (!state.seen) return { tier: TIER.UNSEEN, score: 0, state };
  const overdue = daysBetween(state.dueDate, today); // >= 0 means due
  if (overdue >= 0) return { tier: TIER.DUE, score: Math.min(overdue, 365) + (6 - state.box), state };
  if (!state.lastCorrect) return { tier: TIER.WRONG_LAST, score: 6 - state.box, state };
  return { tier: TIER.REST, score: 400 - Math.min(-overdue, 400), state }; // sooner due first
}

/** Single number: tier * 1000 + score, higher first. */
export function dueScore(rows, today) {
  const r = rank(rows, today);
  return r.tier * 1000 + r.score;
}
