/**
 * visualState.js - turns a part's response into the plain-number state a
 * visual module expects (CONTRACTS.md section 4). Visuals never import the
 * math core; every number is computed here.
 *
 * Optional params read here (ignored by the visuals themselves):
 *   params.slot   - for slots parts, the slot id whose value feeds the visual
 */
import { M } from './mathApi.js';
import { unwrapPlaceholders, splitAlternatives, splitRelation } from './latexUtil.js';

const num = (latex) => {
  const v = M.evalAt(unwrapPlaceholders(latex || ''), {});
  return Number.isFinite(v) ? v : NaN;
};

/** Visual for a part: authored, or a sensible topic default. */
export function visualFor(item, part) {
  if (part.visual?.kind) return part.visual;
  if (part.visual === false) return null;
  if (part.shape === 'interval') {
    return { kind: 'number-line', params: rangeFor(part.answer) };
  }
  if (item?.topic === 'trig' && part.shape === 'two-sided') return { kind: 'unit-circle', params: { angleDeg: 35 } };
  return null;
}

function rangeFor(answer) {
  const nums = String(answer || '').match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
  if (!nums.length) return { min: -5, max: 5 };
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const pad = Math.max(2, Math.ceil((hi - lo) * 0.4));
  return { min: Math.floor(lo - pad), max: Math.ceil(hi + pad) };
}

function lastLine(pr) {
  const lines = (pr?.lines || pr?.lhs || []).filter((l) => l && l.trim());
  return lines.length ? lines[lines.length - 1] : '';
}

function slotLatex(part, pr, pred) {
  const slots = part.slots || [];
  const s = slots.find(pred);
  return s ? { slot: s, latex: pr?.values?.[s.id] || '' } : null;
}

/** Roots from "x=2 \lor x=3" (or chips) as numbers. */
function setFrom(latexOrList) {
  const list = Array.isArray(latexOrList) ? latexOrList : splitAlternatives(latexOrList || '');
  return list.map((t) => {
    const rel = splitRelation(t);
    return num(rel ? rel.rhs : t);
  }).filter(Number.isFinite);
}

export function visualState(item, part, vis, pr, status, extra = {}) {
  const p = vis?.params || {};
  const student = {};
  const expected = {};
  switch (vis?.kind) {
    case 'sequence': {
      const count = p.count || 8;
      const tn = p.slot ? slotLatex(part, pr, (s) => s.id === p.slot) : slotLatex(part, pr, (s) => !!s.var);
      const v = tn?.slot?.var || 'n';
      const studentTn = tn ? tn.latex : (pr?.value || lastLine(pr));
      if (studentTn && studentTn.trim()) {
        const vals = M.sequenceValues(unwrapPlaceholders(studentTn), { var: v, from: 1, count });
        if (vals.some(Number.isFinite)) student.values = vals;
      }
      if (p.termLatex) expected.values = M.sequenceValues(p.termLatex, { var: v, from: 1, count });
      student.latex = studentTn || undefined;
      break;
    }
    case 'gauss': {
      const n = Number(p.n) || 1;
      const sn = p.slot ? slotLatex(part, pr, (s) => s.id === p.slot) : slotLatex(part, pr, (s) => /^s/i.test(s.id) || /S/.test(String(s.label || '')));
      if (sn?.latex?.trim()) {
        const val = M.evalAt(unwrapPlaceholders(sn.latex), { [sn.slot.var || 'n']: n });
        if (Number.isFinite(val)) student.values = [val];
      }
      const a = Number(p.a) || 0;
      const d = Number(p.d) || 0;
      expected.values = [(n / 2) * (2 * a + (n - 1) * d)];
      break;
    }
    case 'pascal': {
      const c = p.slot ? slotLatex(part, pr, (s) => s.id === p.slot) : slotLatex(part, pr, (s) => !s.var);
      const raw = c ? c.latex : (pr?.value || '');
      if (raw && raw.trim()) {
        const val = num(raw);
        if (Number.isFinite(val)) student.values = [val];
      }
      break;
    }
    case 'parabola': {
      if (Array.isArray(pr?.set)) student.set = setFrom(pr.set);
      else if (pr?.lines) {
        const l = lastLine(pr);
        const solved = (t) => { const r = splitRelation(t); return r && r.op === '=' && /^[a-zA-Z]$/.test(r.lhs.replace(/\s+/g, '')); };
        if (l && splitAlternatives(l).every(solved)) student.set = setFrom(l);
      }
      if (Array.isArray(part.answer)) expected.set = setFrom(part.answer);
      else if (part.goal?.solutions) expected.set = setFrom(part.goal.solutions);
      else if (part.goal?.latex) expected.set = setFrom(part.goal.latex);
      break;
    }
    case 'number-line': {
      if (pr?.value) student.interval = unwrapPlaceholders(pr.value);
      if (typeof part.answer === 'string') expected.interval = part.answer;
      break;
    }
    case 'unit-circle':
    default: {
      const l = lastLine(pr) || pr?.value || '';
      if (l) student.latex = l;
      break;
    }
  }
  return { student, expected, status: status || 'idle', ...extra };
}
