/**
 * explain.js - plain-English feedback for a broken step.
 *
 * Audience: Indian class 9-12 students, English often a second language.
 * Short, plain sentences; numbers, not jargon.
 */
import { M } from './mathApi.js';
import { splitRelation, splitAlternatives, unwrapPlaceholders, fmtNum, fmtPoint } from './latexUtil.js';

/** Evaluate a line at a point: { kind:'expr', v } or { kind:'rel', l, r, op, truth }. */
export function evalLine(latex, point) {
  const s = unwrapPlaceholders(latex);
  const alts = splitAlternatives(s);
  if (alts.length > 1) {
    const each = alts.map((a) => evalLine(a, point));
    const truths = each.map((e) => e.truth);
    const truth = truths.some((t) => t === true) ? true : (truths.every((t) => t === false) ? false : null);
    return { kind: 'alt', each, truth };
  }
  const rel = splitRelation(s);
  if (!rel) return { kind: 'expr', v: M.evalAt(s, point) };
  const l = M.evalAt(rel.lhs, point);
  const r = M.evalAt(rel.rhs, point);
  return { kind: 'rel', l, r, op: rel.op, truth: truthOf(l, r, rel.op) };
}

function truthOf(l, r, op) {
  if (!Number.isFinite(l) || !Number.isFinite(r)) return null;
  const eq = Math.abs(l - r) <= 1e-9 * Math.max(1, Math.abs(l), Math.abs(r));
  switch (op) {
    case '=': return eq;
    case '<': return l < r && !eq;
    case '>': return l > r && !eq;
    case '\\le': return l < r || eq;
    case '\\ge': return l > r || eq;
    case '\\ne': return !eq;
    default: return null;
  }
}

const OP_TXT = { '=': '=', '<': '<', '>': '>', '\\le': '\u2264', '\\ge': '\u2265', '\\ne': '\u2260' };

export function sayLine(ev) {
  if (ev.kind === 'expr') return fmtNum(ev.v);
  if (ev.kind === 'alt') return ev.each.map(sayLine).join(' or ');
  return `${fmtNum(ev.l)} ${OP_TXT[ev.op] || ev.op} ${fmtNum(ev.r)}`;
}

/** Sentence(s) for a step result. Returns { text, point } or null when the step is fine. */
export function explainStep(prev, next, res) {
  if (!res) return null;
  if (res.kind === 'empty') return null;
  if (res.kind === 'unparsable') {
    return { text: res.message && !/parse|error/i.test(res.message) ? res.message : 'I cannot read this line yet. Check the brackets and the signs.', point: null };
  }
  if (res.ok && res.kind === 'implies') {
    return { text: 'This step works in one direction only, so it can add extra answers. Check your final answers in the first line.', point: res.counterexample?.point || null, oneWay: true };
  }
  if (res.ok) return null;
  const point = res.counterexample?.point;
  if (!point || !Object.keys(point).length) {
    return { text: 'This line does not follow from the line before it. Look again at the part that changed.', point: null };
  }
  const where = fmtPoint(point);
  const a = evalLine(prev, point);
  const b = evalLine(next, point);
  if (a.kind === 'expr' && b.kind === 'expr') {
    return { text: `At ${where} this line gives ${sayLine(b)}, but the line before gives ${sayLine(a)}. They should give the same number.`, point };
  }
  if (a.kind !== 'expr' && b.kind !== 'expr') {
    if (a.truth !== null && b.truth !== null && a.truth !== b.truth) {
      return {
        text: `Try ${where}. The line before says ${sayLine(a)}, which is ${a.truth ? 'true' : 'false'}. This line says ${sayLine(b)}, which is ${b.truth ? 'true' : 'false'}. A correct step keeps exactly the same answers.`,
        point,
      };
    }
    return { text: `At ${where} the line before gives ${sayLine(a)} and this line gives ${sayLine(b)}. These two lines do not have the same answers.`, point };
  }
  return { text: `At ${where} the line before gives ${sayLine(a)}, but this line gives ${sayLine(b)}.`, point };
}
