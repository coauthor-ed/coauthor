/**
 * chain.js - checking logic shared by the live UI and static score().
 *
 * Everything here is synchronous and assumes loadMathApi() has resolved.
 */
import { M, checkBy } from './mathApi.js';
import { splitRelation, splitAlternatives, unwrapPlaceholders, hasEmptyPlaceholder, guessVars, topLevelTerms, norm } from './latexUtil.js';
import { parseInterval } from './intervals.js';

export function mathOpts(item, extra = []) {
  // C is the integration constant unless the item lists it (math core rule).
  const vars = item?.vars?.length ? item.vars : guessVars(extra).filter((v) => v !== 'C');
  const o = { vars, samples: 8, seed: 7 };
  if (item?.assume) o.assume = item.assume;
  return o;
}

/** Check one line against the line before it. */
export function checkStep(prev, next, item) {
  const n = unwrapPlaceholders(next || '');
  if (!n.trim()) return { ok: false, kind: 'empty', reversible: false };
  if (hasEmptyPlaceholder(next)) return { ok: false, kind: 'unparsable', reversible: false, message: 'Fill in every box first.' };
  const r = M.step(unwrapPlaceholders(prev), n, mathOpts(item, [prev, n]));
  return r || { ok: false, kind: 'unparsable', reversible: false };
}

export function stepOk(r) {
  return !!r && r.ok && (r.kind === 'equivalent' || r.kind === 'implies' || r.kind === undefined);
}

/** Has a step-chain reached its goal with this final line? */
export function goalReached(part, last, item) {
  if (!last || !part?.goal) return false;
  const line = unwrapPlaceholders(last);
  const opts = mathOpts(item, [line]);
  const g = part.goal;
  if (g.latex) {
    // A goal written as solutions ("x=2 \lor x=3") must match as a set and
    // the student line must itself be in solved form, not the start again.
    const alts = splitAlternatives(g.latex);
    if (alts.length > 1 || isSolvedFor(g.latex)) {
      if (!isSolvedForLine(line)) return false;
      return !!M.solutionSet(line, g.latex, opts).ok;
    }
    return !!M.equivalent(line, g.latex, opts).ok && sameShape(line, g.latex);
  }
  if (g.form === 'solved-for') {
    const f = M.form(line, 'solved-for', { var: g.var, ...opts });
    if (f && f.ok === false) return false;
    if (!isSolvedForLine(line, g.var)) return false;
    return !!M.solutionSet(line, g.solutions || [], opts).ok;
  }
  if (g.form) {
    const f = M.form(line, g.form, opts);
    return !!f.ok && (!g.equals || !!M.equivalent(line, g.equals, opts).ok);
  }
  return false;
}

function isSolvedFor(latex) {
  return splitAlternatives(latex).every((t) => {
    const rel = splitRelation(t);
    if (!rel) return false;
    const lhs = rel.lhs.replace(/\s+/g, '');
    return /^[a-zA-Z](_\{?\w+\}?)?$/.test(lhs) || /^\\[a-z]+$/.test(lhs);
  });
}

function isSolvedForLine(line, v) {
  const alts = splitAlternatives(line);
  return alts.length > 0 && alts.every((t) => {
    const rel = splitRelation(t);
    if (!rel || rel.op !== '=') return false;
    const lhs = rel.lhs.replace(/\s+/g, '');
    if (v) return lhs === v || lhs === `\\${v}`;
    return /^[a-zA-Z]$/.test(lhs) || /^\\[a-z]+$/.test(lhs);
  });
}

function sameShape(a, b) {
  // For a relation goal the student must have reached a relation too.
  return !!splitRelation(a) === !!splitRelation(b);
}

/**
 * Evaluates a whole chain: start (or side) + student lines.
 * Returns { steps:[StepResult], prefix, intact, done }.
 */
export function evaluateChain(start, lines, item) {
  const steps = [];
  let prev = start;
  let prefix = 0;
  let intact = true;
  for (const line of lines) {
    const r = checkStep(prev, line, item);
    steps.push(r);
    if (intact && stepOk(r)) prefix++;
    else intact = false;
    if (line && line.trim()) prev = line;
  }
  return { steps, prefix, intact };
}

export function milestoneHits(part, lines, item) {
  const ms = Array.isArray(part?.milestones) ? part.milestones : [];
  return ms.map((m) => lines.some((l) => l && milestoneMatch(l, m, item)));
}

/**
 * A milestone is about the FORM reached, not just the value: every line of
 * an equation chain is equivalent to the start, so equivalence alone would
 * light every milestone at once.
 *   - "or" milestones (x-2=0 \lor x-3=0): same number of pieces, each
 *     milestone piece matched one-to-one by an equivalent line piece.
 *   - single lines: equivalent, same relation-ness, and for every form rule
 *     the milestone satisfies (its own "form", else factored / expanded) the
 *     line satisfies it too.
 */
export function milestoneMatch(line, m, item) {
  const L = unwrapPlaceholders(line);
  const T = m.latex || '';
  const la = splitAlternatives(L);
  const ta = splitAlternatives(T);
  if (la.length !== ta.length) return false;
  const opts = mathOpts(item, [L, T]);
  if (ta.length > 1) {
    const used = new Set();
    return ta.every((t) => {
      const j = la.findIndex((l, k) => !used.has(k) && M.equivalent(l, t, opts).ok);
      if (j < 0) return false;
      used.add(j);
      return true;
    });
  }
  if (!!splitRelation(L) !== !!splitRelation(T)) return false;
  if (!M.equivalent(L, T, opts).ok) return false;
  const rules = m.form ? [].concat(m.form) : ['factored', 'expanded'];
  for (const r of rules) {
    const want = M.form(T, r, opts);
    if (want && want.ok === true && M.form(L, r, opts)?.ok === false) return false;
  }
  return true;
}

/** Final expression of a two-sided chain side (the side's latest line). */
export function sideFinal(start, lines) {
  const real = (lines || []).filter((l) => l && l.trim());
  return real.length ? unwrapPlaceholders(real[real.length - 1]) : start;
}

/** "(a+b)" -> true only when the first bracket closes at the very end. */
function wrapped(t) {
  if (!t.startsWith('(') || !t.endsWith(')')) return false;
  let d = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '(') d++;
    else if (t[i] === ')') { d--; if (d === 0 && i < t.length - 1) return false; }
  }
  return true;
}

function flatTerms(s) {
  return topLevelTerms(s).flatMap((t) => {
    const u = t.replace(/^\+/, '');
    return wrapped(u) ? flatTerms(u.slice(1, -1)) : [u];
  });
}

export function sidesMeet(part, lhsLines, rhsLines, item) {
  const a = sideFinal(part.lhs, lhsLines);
  const b = sideFinal(part.rhs, rhsLines);
  if (!(lhsLines || []).some((l) => l && l.trim()) && !(rhsLines || []).some((l) => l && l.trim())) return false;
  const opts = mathOpts(item, [a, b]);
  if (!M.equivalent(a, b, opts).ok) return false;
  // "Meet" means the two lines now look the same, not merely that they are
  // equal (every identity's two sides are equal from the start).
  // Terms in any order count as the same look: sin^2+cos^2+2sc on one side
  // meets sin^2+2sc+cos^2 on the other. A bracketed group of terms counts
  // as its terms.
  const k = (s) => flatTerms(norm(s).replace(/\^\{(\w)\}/g, '^$1')).sort().join('+');
  return k(a) === k(b) || k(a) === k(part.rhs) || k(b) === k(part.lhs);
}

export function evalNum(latex) {
  return M.evalAt(latex, {});
}

export function intervalSegments(latex) {
  return parseInterval(latex, evalNum);
}

export { checkBy };
