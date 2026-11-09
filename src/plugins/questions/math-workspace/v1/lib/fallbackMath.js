/**
 * FALLBACK ONLY - thin stand-in for src/core/math/index.js (workstream A).
 *
 * mathApi.js loads the real math core first and only falls back to this file
 * when that import fails (not built yet, or broken mid-edit). It implements
 * the same API shape (CONTRACTS.md section 2) with plain numeric sampling on
 * compute-engine, and is deliberately simple: no assume-aware domain logic
 * beyond ">0", no 'implies' detection, form() always passes. Delete this file
 * once the real core is stable.
 */
import { PRNG } from '../../../../../core/PRNG.js';
import { splitRelation, splitAlternatives, guessVars, naiveChangedTerms } from './latexUtil.js';
import { parseInterval, sameSegments } from './intervals.js';

let ce = null;

export async function loadMath() {
  if (ce) return;
  const { ComputeEngine } = await import('vendor/compute-engine.js');
  ce = new ComputeEngine();
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (v && typeof v.re === 'number' && (!v.im || Math.abs(v.im) < 1e-12)) return v.re;
  return NaN;
}

export function evalAt(latex, point = {}) {
  try {
    const e = ce.parse(String(latex)).subs(point).N();
    return toNum(e.valueOf());
  } catch {
    return NaN;
  }
}

export function sequenceValues(latex, { var: v = 'n', from = 1, count = 6 } = {}) {
  const out = [];
  for (let k = 0; k < count; k++) out.push(evalAt(latex, { [v]: from + k }));
  return out;
}

function close(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.isNaN(a) && Number.isNaN(b);
  return Math.abs(a - b) <= Math.max(1e-12, 1e-9 * Math.max(Math.abs(a), Math.abs(b)));
}

function samplePoints(vars, opts = {}) {
  const rng = new PRNG(opts.seed ?? 12345);
  const n = opts.samples ?? 8;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const p = {};
    for (const v of vars) {
      const positive = opts.assume?.[v] && /^>\s*0/.test(opts.assume[v]);
      const r = 0.3 + rng.next() * 2.6;
      p[v] = positive ? r : (rng.next() < 0.5 ? -r : r);
    }
    pts.push(p);
  }
  return pts;
}

function varsOf(list, opts) {
  return opts?.vars?.length ? opts.vars : guessVars(list);
}

/** f(point) for a line: relation -> lhs - rhs, alternatives -> product. */
function residual(latex) {
  const alts = splitAlternatives(latex);
  if (alts.length > 1) {
    const parts = alts.map(residual);
    return (p) => parts.reduce((acc, f) => acc * f(p), 1);
  }
  const rel = splitRelation(latex);
  if (rel) return (p) => evalAt(rel.lhs, p) - evalAt(rel.rhs, p);
  return (p) => evalAt(latex, p);
}

function isRelation(latex) {
  return !!splitRelation(latex) || splitAlternatives(latex).length > 1;
}

function rootsOf(f, v) {
  const roots = [];
  const lo = -12;
  const hi = 12;
  const step = 0.01;
  let x0 = lo;
  let y0 = f({ [v]: x0 });
  for (let x = lo + step; x <= hi + 1e-9; x += step) {
    const y = f({ [v]: x });
    if (Math.abs(y) < 1e-10) roots.push(x);
    else if (Number.isFinite(y0) && Number.isFinite(y) && y0 * y < 0) {
      let a = x0, b = x, fa = y0;
      for (let k = 0; k < 60; k++) {
        const m = (a + b) / 2;
        const fm = f({ [v]: m });
        if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
      }
      const r = (a + b) / 2;
      // Reject poles (sign change through infinity).
      if (Math.abs(f({ [v]: r })) < 1e-6) roots.push(r);
    }
    x0 = x;
    y0 = y;
  }
  const out = [];
  for (const r of roots) if (!out.some((q) => Math.abs(q - r) < 1e-6)) out.push(Math.round(r * 1e9) / 1e9);
  return out;
}

function exprEquivalent(a, b, opts) {
  const vars = varsOf([a, b], opts);
  for (const p of samplePoints(vars, opts)) {
    const x = evalAt(a, p);
    const y = evalAt(b, p);
    if (Number.isNaN(x) && Number.isNaN(y)) continue;
    if (!close(x, y)) return { ok: false, counterexample: { point: p, a: x, b: y } };
  }
  return { ok: true };
}

function relationEquivalent(a, b, opts) {
  const vars = varsOf([a, b], opts);
  const fa = residual(a);
  const fb = residual(b);
  let ratio = null;
  let constRatio = true;
  let witness = null;
  for (const p of samplePoints(vars, opts)) {
    const x = fa(p);
    const y = fb(p);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) continue;
    const r = Math.abs(x) < 1e-12 ? Infinity : y / x;
    if (ratio === null) ratio = r;
    else if (!close(r, ratio)) { constRatio = false; witness = witness || { point: p, a: x, b: y }; }
  }
  if (constRatio && ratio !== null && ratio !== 0 && Number.isFinite(ratio)) return { ok: true };
  if (vars.length === 1) {
    const v = vars[0];
    const ra = rootsOf(fa, v);
    const rb = rootsOf(fb, v);
    const same = ra.length === rb.length && ra.every((r, i) => Math.abs(r - rb[i]) < 1e-6);
    if (same && ra.length) return { ok: true };
    const extra = rb.find((r) => !ra.some((q) => Math.abs(q - r) < 1e-6));
    const lost = ra.find((r) => !rb.some((q) => Math.abs(q - r) < 1e-6));
    const at = lost ?? extra;
    if (at !== undefined) return { ok: false, counterexample: { point: { [v]: at }, a: fa({ [v]: at }), b: fb({ [v]: at }) }, lost: lost !== undefined, extra: extra !== undefined && lost === undefined };
  }
  return { ok: false, counterexample: witness || undefined };
}

export const check = {
  equivalent(a, b, opts) {
    try {
      if (isRelation(a) || isRelation(b)) return relationEquivalent(a, b, opts);
      return exprEquivalent(a, b, opts);
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  },
  step(prev, next, opts) {
    try {
      const parsed = ce.parse(String(next));
      if (!parsed.isValid) return { ok: false, kind: 'unparsable', reversible: false, message: 'This line could not be read.' };
      const res = check.equivalent(prev, next, opts);
      if (res.ok) return { ok: true, kind: 'equivalent', reversible: true };
      if (res.extra) return { ok: true, kind: 'implies', reversible: false, counterexample: res.counterexample, message: 'This step can add extra answers.' };
      return { ok: false, kind: 'invalid', reversible: false, counterexample: res.counterexample, message: 'This line does not follow from the line before.' };
    } catch (err) {
      return { ok: false, kind: 'unparsable', reversible: false, message: String(err?.message || err) };
    }
  },
  solutionSet(a, b) {
    const vals = (x) => {
      const list = Array.isArray(x) ? x : splitAlternatives(x);
      return list.map((t) => {
        const rel = splitRelation(t);
        return evalAt(rel ? rel.rhs : t, {});
      }).filter((v) => !Number.isNaN(v)).sort((p, q) => p - q);
    };
    const va = vals(a);
    const vb = vals(b);
    const ok = va.length === vb.length && va.every((v, i) => close(v, vb[i]));
    return { ok };
  },
  interval(a, b) {
    const ev = (t) => evalAt(t, {});
    const sa = parseInterval(a, ev);
    const sb = parseInterval(b, ev);
    if (!sa || !sb) return { ok: false, error: 'not interval notation' };
    return { ok: sameSegments(sa, sb) };
  },
  upToConstant(a, b, opts) {
    const vars = varsOf([a, b], opts).filter((v) => v !== 'C');
    let d = null;
    for (const p of samplePoints(vars, opts)) {
      const diff = evalAt(a, { ...p, C: 0 }) - evalAt(b, { ...p, C: 0 });
      if (!Number.isFinite(diff)) continue;
      if (d === null) d = diff;
      else if (!close(d, diff)) return { ok: false, counterexample: { point: p, a: evalAt(a, { ...p, C: 0 }), b: evalAt(b, { ...p, C: 0 }) } };
    }
    return { ok: d !== null };
  },
  upToScalar(a, b, opts) {
    return relationEquivalent(a, b, opts);
  },
  onIntegers(a, b, opts = {}) {
    const v = opts.var || 'n';
    const from = opts.from ?? 1;
    for (let k = from; k < from + 8; k++) {
      const x = evalAt(a, { [v]: k });
      const y = evalAt(b, { [v]: k });
      if (!close(x, y)) return { ok: false, counterexample: { point: { [v]: k }, a: x, b: y } };
    }
    return { ok: true };
  },
};

export function form(_latex, _rule) {
  return { ok: true };
}

export function diffTerms(prev, next) {
  return { changed: naiveChangedTerms(prev, next) };
}
