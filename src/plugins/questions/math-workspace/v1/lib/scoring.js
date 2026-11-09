/**
 * scoring.js - pure scoring for math-workspace@1 (CONTRACTS.md section 1).
 *
 * scoreItem() is synchronous and assumes loadMathApi() resolved; the
 * plugin's static score() awaits that first.
 *
 * step-chain / two-sided credit:
 *   goal reached with the chain intact -> 1
 *   otherwise 0.6 * progress, where progress is the valid prefix measured
 *   against the model solution length (so one trivial valid line is not full
 *   marks); when milestones exist, the 0.6 is split evenly between prefix
 *   progress and the weighted share of milestones hit.
 */
import { M, checkBy } from './mathApi.js';
import { evaluateChain, goalReached, milestoneHits, mathOpts, sidesMeet, intervalSegments } from './chain.js';
import { unwrapPlaceholders } from './latexUtil.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function scorePart(item, part, pr = {}) {
  switch (part.shape) {
    case 'expression': return scoreExpression(item, part, pr);
    case 'step-chain': return scoreChain(item, part, pr);
    case 'two-sided': return scoreTwoSided(item, part, pr);
    case 'solution-set': return scoreSet(item, part, pr);
    case 'interval': return scoreInterval(item, part, pr);
    case 'slots': return scoreSlots(item, part, pr);
    default: return { score: 0, note: 'unknown shape' };
  }
}

function scoreExpression(item, part, pr) {
  const v = unwrapPlaceholders(pr.value || '');
  if (!v.trim()) return { score: 0, note: 'empty' };
  const opts = mathOpts(item, [v, part.answer]);
  const eq = checkBy(part.check, v, part.answer, opts);
  if (!eq.ok) return { score: 0, note: 'not equal', counterexample: eq.counterexample };
  const forms = Array.isArray(part.form) ? part.form : (part.form ? [part.form] : []);
  for (const f of forms) {
    const r = M.form(v, f, opts);
    if (r && r.ok === false) return { score: 0.5, note: 'form', form: f, reason: r.reason };
  }
  return { score: 1, note: 'ok' };
}

function chainProgress(prefix, part, hits) {
  const model = Array.isArray(part.modelSolution) ? part.modelSolution.length : 0;
  const denom = Math.max(1, model || prefix || 1);
  const prog = clamp01(prefix / denom);
  const ms = Array.isArray(part.milestones) ? part.milestones : [];
  if (!ms.length) return 0.6 * prog;
  const total = ms.reduce((s, m) => s + (m.weight ?? 1), 0) || 1;
  const got = ms.reduce((s, m, i) => s + (hits[i] ? (m.weight ?? 1) : 0), 0);
  return 0.3 * prog + 0.3 * clamp01(got / total);
}

function scoreChain(item, part, pr) {
  const lines = (pr.lines || []).filter((l) => l && l.trim());
  if (!lines.length) return { score: 0, note: 'empty' };
  const ev = evaluateChain(part.start, lines, item);
  const done = ev.intact && goalReached(part, lines[lines.length - 1], item);
  if (done) return { score: 1, note: 'goal', prefix: ev.prefix };
  const hits = milestoneHits(part, lines.slice(0, ev.prefix), item);
  return { score: chainProgress(ev.prefix, part, hits), note: ev.intact ? 'unfinished' : 'broken', prefix: ev.prefix };
}

function scoreTwoSided(item, part, pr) {
  const L = (pr.lhs || []).filter((l) => l && l.trim());
  const R = (pr.rhs || []).filter((l) => l && l.trim());
  if (!L.length && !R.length) return { score: 0, note: 'empty' };
  const el = evaluateChain(part.lhs, L, item);
  const er = evaluateChain(part.rhs, R, item);
  const intact = el.intact && er.intact;
  if (intact && sidesMeet(part, L, R, item)) return { score: 1, note: 'goal' };
  const prefix = el.prefix + er.prefix;
  return { score: chainProgress(prefix, part, []), note: intact ? 'unfinished' : 'broken' };
}

function scoreSet(item, part, pr) {
  const set = (pr.set || []).map(unwrapPlaceholders).filter((s) => s.trim());
  const ans = part.answer || [];
  if (!set.length) {
    if (pr.empty && part.allowEmpty && !ans.length) return { score: 1, note: 'ok' };
    return { score: 0, note: 'empty' };
  }
  const opts = mathOpts(item, []);
  if (M.solutionSet(set, ans, opts).ok) return { score: 1, note: 'ok' };
  // Partial credit: right roots minus wrong ones, over the answer count.
  const vals = set.map((s) => M.evalAt(s, {}));
  const want = ans.map((s) => M.evalAt(s, {}));
  const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
  const right = vals.filter((v) => want.some((w) => near(v, w))).length;
  const wrong = vals.length - right;
  return { score: clamp01((right - wrong) / Math.max(1, want.length)), note: 'partial' };
}

function scoreInterval(item, part, pr) {
  const v = unwrapPlaceholders(pr.value || '');
  if (!v.trim()) return { score: 0, note: 'empty' };
  if (!intervalSegments(v)) return { score: 0, note: 'notation' };
  return M.interval(v, part.answer, mathOpts(item, [])).ok ? { score: 1, note: 'ok' } : { score: 0, note: 'wrong' };
}

export function checkSlot(item, slot, value) {
  const v = unwrapPlaceholders(value || '');
  if (!v.trim()) return { ok: false, empty: true };
  const mode = slot.check || (slot.var ? 'onIntegers' : 'equivalent');
  const opts = { ...mathOpts(item, [v, slot.answer]), var: slot.var || 'n' };
  return checkBy(mode, v, slot.answer, opts);
}

function scoreSlots(item, part, pr) {
  const slots = part.slots || [];
  if (!slots.length) return { score: 0, note: 'no slots' };
  const vals = pr.values || {};
  const got = slots.filter((s) => checkSlot(item, s, vals[s.id]).ok).length;
  return { score: got / slots.length, note: got === slots.length ? 'ok' : 'partial', right: got, total: slots.length };
}

export function scoreItem(item, response) {
  const parts = Array.isArray(item?.parts) ? item.parts : [];
  if (!parts.length) return { score: 0, isCorrect: false, feedback: 'This question has no parts.', parts: {} };
  const byPart = {};
  let total = 0;
  let wsum = 0;
  for (const p of parts) {
    const w = p.weight ?? 1;
    const r = scorePart(item, p, response?.parts?.[p.id] || {});
    byPart[p.id] = r;
    total += w * r.score;
    wsum += w;
  }
  const score = wsum ? total / wsum : 0;
  const isCorrect = score >= 0.999;
  return { score, isCorrect, feedback: feedbackFor(parts, byPart, score), parts: byPart };
}

function feedbackFor(parts, byPart, score) {
  if (score >= 0.999) return 'All parts correct. Well worked!';
  const notes = [];
  parts.forEach((p, i) => {
    const r = byPart[p.id];
    const name = parts.length > 1 ? `Part ${i + 1}: ` : '';
    if (r.score >= 0.999) return;
    if (r.note === 'empty') notes.push(`${name}not answered yet.`);
    else if (r.note === 'form') notes.push(`${name}the value is right, but it is not in ${String(r.form).replace(/([A-Z])/g, ' $1').toLowerCase()} form.`);
    else if (r.note === 'broken') notes.push(`${name}one of the steps does not follow from the line before it.`);
    else if (r.note === 'unfinished') notes.push(`${name}the steps are right so far, but you have not reached the goal.`);
    else if (r.note === 'partial') notes.push(`${name}some of it is right.`);
    else notes.push(`${name}not correct yet.`);
  });
  return notes.map((n) => n.charAt(0).toUpperCase() + n.slice(1)).join(' ');
}
