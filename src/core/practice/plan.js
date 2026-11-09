/**
 * Auto daily/weekly practice plan. Pure and deterministic: the same inputs
 * give the same plan; a different date, profile or kind gives a different
 * shuffle. See docs/practice-scheduling.md.
 */
import { PRNG } from '../PRNG.js';
import { isEligible } from './eligibility.js';
import { rank } from './leitner.js';

export const BUDGETS = {
  daily: { min: 5, max: 10, default: 8 },
  weekly: { min: 15, max: 30, default: 20 },
};
const DEFAULT_BANK_SEC = 120;
const DEFAULT_LESSON_SEC = 60;
const CHAPTER_CAP = 0.4;

/** FNV-1a 32-bit hash of a string, for seeding PRNG (no crypto: plain http). */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function questionSeconds(q) {
  if (typeof q.estimatedTimeSec === 'number' && q.estimatedTimeSec > 0) return q.estimatedTimeSec;
  return q.source === 'lesson' ? DEFAULT_LESSON_SEC : DEFAULT_BANK_SEC;
}

export function clampMinutes(kind, minutes) {
  const b = BUDGETS[kind];
  if (typeof minutes !== 'number' || !(minutes > 0)) return b.default;
  return Math.min(b.max, Math.max(b.min, minutes));
}

/** Max items one chapter may hold in a plan of n items drawn from k chapters.
 *  3+ chapters: floor(40%). With 2 the 40% rule cannot hold, so balance. */
export function chapterCap(n, k) {
  if (k < 2) return n;
  if (k >= 3) return Math.max(1, Math.floor(n * CHAPTER_CAP));
  return Math.ceil(n / k);
}

function fill(ranked, budgetSec, perChapterMax) {
  const out = [];
  const counts = new Map();
  let elapsed = 0;
  for (const c of ranked) {
    const ch = c.q.chapterId || '__none__';
    if ((counts.get(ch) || 0) >= perChapterMax) continue;
    const t = questionSeconds(c.q);
    if (out.length > 0 && elapsed + t > budgetSec) continue;
    out.push(c);
    counts.set(ch, (counts.get(ch) || 0) + 1);
    elapsed += t;
  }
  return { out, counts, elapsed };
}

/**
 * @param {{kind:'daily'|'weekly', profileId:string, dateLocal:string,
 *   pool:object[], attempts:object[], coverage:object, minutes?:number}} input
 *   attempts: questionAttempts rows for the profile (any questionKey).
 * @returns {{kind, dateLocal, items:object[], estMinutes:number, chapters:string[]}
 *   | {empty:true, reason:string}}
 */
export function buildPracticePlan({ kind, profileId, dateLocal, pool, attempts, coverage, minutes }) {
  if (!BUDGETS[kind]) throw new Error(`Unknown practice kind "${kind}"`);
  const budgetSec = clampMinutes(kind, minutes) * 60;

  const byKey = new Map();
  for (const a of attempts || []) {
    if (!byKey.has(a.questionKey)) byKey.set(a.questionKey, []);
    byKey.get(a.questionKey).push(a);
  }

  // Eligible, de-duplicated (bank entry wins over a lesson copy of the same key).
  const seen = new Map();
  for (const q of pool || []) {
    if (!q || !q.questionKey || !isEligible(q, coverage)) continue;
    const prev = seen.get(q.questionKey);
    if (!prev || (prev.source === 'lesson' && q.source === 'bank')) seen.set(q.questionKey, q);
  }
  if (!seen.size) {
    return { empty: true, reason: (pool || []).length ? 'no-eligible-questions' : 'empty-pool' };
  }

  const prng = new PRNG(hashSeed(`${profileId}|${dateLocal}|${kind}`));
  const cands = [...seen.values()].map((q) => {
    const r = rank(byKey.get(q.questionKey), dateLocal);
    return { q, tier: r.tier, score: r.score, tie: 0 };
  });
  // Pre-shuffle in key order so the tie-break is stable regardless of pool order.
  cands.sort((a, b) => (a.q.questionKey < b.q.questionKey ? -1 : 1));
  prng.shuffle(cands);
  cands.forEach((c, i) => { c.tie = i; });
  cands.sort((a, b) =>
    (b.tier - a.tier) ||
    ((a.q.source === 'bank' ? 0 : 1) - (b.q.source === 'bank' ? 0 : 1)) ||
    (b.score - a.score) ||
    (a.tie - b.tie));

  const chapterSet = new Set(cands.map((c) => c.q.chapterId || '__none__'));
  const k = chapterSet.size;
  let result = fill(cands, budgetSec, Infinity);
  if (k >= 2) {
    // Largest per-chapter limit whose outcome satisfies the cap.
    for (let m = result.out.length; m >= 1; m--) {
      const r = fill(cands, budgetSec, m);
      result = r;
      if (Math.max(...r.counts.values()) <= chapterCap(r.out.length, k)) break;
    }
  }

  const items = result.out.map((c) => ({ ...c.q, tier: c.tier }));
  return {
    kind,
    dateLocal,
    items,
    estMinutes: Math.round((result.elapsed / 60) * 10) / 10,
    chapters: [...new Set(items.map((i) => i.chapterId).filter(Boolean))],
  };
}

/** Monday (local calendar) of the week holding a 'YYYY-MM-DD' date. */
export function weekStart(dateLocal) {
  const [y, m, d] = String(dateLocal).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return dateLocal;
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/** Stable id so regenerating overwrites rather than duplicates: one daily
 *  plan per day (auto-daily-<date>), one weekly plan per week
 *  (auto-weekly-<Monday's date>). */
export function planId(plan) {
  const date = plan.kind === 'weekly' ? weekStart(plan.dateLocal) : plan.dateLocal;
  return `auto-${plan.kind}-${date}`;
}

/**
 * Plan -> the object PracticeTestBuilder.buildDefinition() returns:
 * `{title, source, criteria, durationMinutes, questions:[{type:'fixed', ref,
 * bundleId, weight, _qtype}]}`. TestEngine runs it as `practice:<id>` once
 * saved to the `practiceTests` store as a row
 * `{profileId, practiceTestId, createdAt, updatedAt, ...definition}`. Use
 * planId(plan) as practiceTestId (ProgressStore.put) rather than
 * PracticeTestBuilder.savePracticeTest, which mints a random id.
 */
export function toPracticeTestDefinition(plan) {
  if (!plan || plan.empty) return null;
  const label = plan.kind === 'weekly' ? 'Weekly practice' : 'Daily practice';
  return {
    title: { en: `${label} ${plan.dateLocal}` },
    source: 'auto',
    criteria: { auto: true, kind: plan.kind, dateLocal: plan.dateLocal, chapterIds: plan.chapters },
    durationMinutes: Math.max(1, Math.round(plan.estMinutes)),
    questions: plan.items.map((q) => ({
      type: 'fixed',
      ref: q.ref,
      bundleId: q.bundleId,
      weight: typeof q.weight === 'number' && q.weight > 0 ? q.weight : 1,
      _qtype: q.type,
    })),
  };
}
