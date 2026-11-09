/**
 * Math core - the shared answer checker behind math-workspace@1 (contract:
 * docs/math-workspace/CONTRACTS.md section 2). Pure ES module, no DOM.
 *
 *   await loadMath()                       lazy-imports vendor/compute-engine.js (once)
 *   evalAt(latex, {x: 2})                  number, NaN where undefined
 *   sequenceValues(latex, {var, from, count})
 *   check.equivalent / step / solutionSet / interval / upToConstant /
 *         upToScalar / onIntegers         synchronous after loadMath()
 *   form(latex, rule, opts)                { ok, reason? }  (form.js)
 *   diffTerms(prev, next)                  { changed: [latex] }
 *
 * How checks work: value substitution first - both sides are compiled to
 * plain JS closures (evaluate.js) and compared at ordered sample points
 * (sample.js: small integers first so the counterexample a student sees is
 * "At x = 2 ...", then fractions, then seeded-PRNG reals; never crypto).
 * Points where either side is undefined are skipped; at least `samples`
 * valid points are needed, else ComputeEngine simplify() is tried as a
 * symbolic second opinion, else { ok: false, error }. Relation lines
 * (=, <, <=, chains, "x = 2 \lor x = 3") are compared by numeric
 * one-variable solution sets (solve.js), per slice when there are more
 * variables.
 *
 * opts (all optional): { vars, assume: {x: '>0'}, samples: 8, seed: 7,
 *   angle: 'rad'|'deg', var (solve / sequence variable), from }
 * Counterexamples: { point, a, b } where a/b are the values of the first /
 * second argument at `point`. For relation lines, solution sets and
 * intervals a/b are 1 or 0 (that line / set holds there or not).
 * StepResult.ok is true for 'equivalent' AND 'implies' (a valid one-way
 * step such as squaring both sides; reversible: false).
 */
import { setEngine, getEngine, parseLine, expandPM, preprocess, hasHead } from './parse.js';
import { compileReal, compileComplex } from './evaluate.js';
import { parseDomain, samplePoints, close, fmt, fmtPoint, REALS } from './sample.js';
import { solveGroups, windowFor, sameSet, isSubset, witness, contains, parseIntervalNotation, normalize, holds } from './solve.js';
import { formRule, toLatex } from './form.js';

let _loading = null;

/** Loads ComputeEngine once. `options.ComputeEngine` injects a class (tests). */
export async function loadMath(options = {}) {
  if (getEngine()) return;
  if (options.ComputeEngine) { setEngine(new options.ComputeEngine()); return; }
  if (!_loading) {
    _loading = (async () => {
      let mod;
      try { mod = await import('vendor/compute-engine.js'); }
      catch { mod = await import(new URL('../../../vendor/compute-engine.js', import.meta.url).href); }
      setEngine(new mod.ComputeEngine());
    })();
    _loading.catch(() => { _loading = null; });
  }
  await _loading;
}

export function isMathLoaded() { return !!getEngine(); }

function ensure() { if (!getEngine()) throw new Error('math core not loaded: await loadMath() first'); }

// ---- context / compile ---------------------------------------------------------

const TRIG = new Set(['Sin', 'Cos', 'Tan', 'Cot', 'Sec', 'Csc']);

function evalConst(latex) {
  const s = preprocess(latex).replace(/\s+/g, '');
  if (/^\+?\\infty$/.test(s)) return Infinity;
  if (/^-\\infty$/.test(s)) return -Infinity;
  const line = parseLine(latex);
  if (line.kind !== 'expr') return NaN;
  return compileReal(line.expr.ast)({});
}

function ctxOf(opts = {}, lines = [], extra = {}) {
  const userVars = opts.vars || [];
  const set = new Set(userVars);
  for (const l of lines) (l.vars || []).forEach((v) => set.add(v));
  for (const v of extra.drop || []) if (!userVars.includes(v)) set.delete(v);
  const vars = [...set].sort();
  const domains = {};
  for (const v of vars) domains[v] = opts.assume && opts.assume[v] != null ? parseDomain(opts.assume[v], evalConst) : REALS;
  return {
    vars, domains,
    varSet: new Set(userVars),
    seed: opts.seed ?? 7,
    samples: opts.samples ?? 8,
    deg: opts.angle === 'deg',
    consts: extra.consts || {},
    solveVar: opts.var,
    trig: lines.some(lineHasTrig),
  };
}

function lineHasTrig(l) {
  const asts = l.kind === 'expr' ? [l.expr.ast] : l.kind === 'rel' ? l.sides.map((e) => e.ast)
    : l.kind === 'or' ? l.parts.flatMap((p) => p.sides.map((e) => e.ast)) : [];
  return asts.some((a) => hasHead(a, TRIG));
}

/** Compiled closure for an expr object under ctx (cached on the expr). */
function fnOf(expr, ctx, forceReal = false) {
  const complex = !forceReal && expr.usesI && !ctx.varSet.has('i');
  const k = `${complex}|${ctx.deg}|${[...ctx.varSet].join(',')}|${JSON.stringify(ctx.consts)}`;
  let f = expr._fns.get(k);
  if (!f) {
    const o = { deg: ctx.deg, varSet: ctx.varSet, consts: ctx.consts };
    try { f = complex ? compileComplex(expr.ast, o) : compileReal(expr.ast, o); }
    catch { f = () => NaN; }
    expr._fns.set(k, f);
  }
  return f;
}

const reOf = (v) => (Array.isArray(v) ? v[0] : v);
const imOf = (v) => (Array.isArray(v) ? v[1] : 0);
const okV = (v) => (Array.isArray(v) ? Number.isFinite(v[0]) && Number.isFinite(v[1]) : Number.isFinite(v));
function closeV(a, b) {
  const s = Math.max(Math.hypot(reOf(a), imOf(a)), Math.hypot(reOf(b), imOf(b)));
  const tol = 1e-12 + 1e-9 * s;
  return Math.abs(reOf(a) - reOf(b)) <= tol && Math.abs(imOf(a) - imOf(b)) <= tol;
}
function cex(point, a, b) {
  const z = (v) => (v === 0 ? 0 : v); // no -0 in student feedback
  const c = { point: { ...point }, a: z(reOf(a)), b: z(reOf(b)) };
  if (imOf(a) || imOf(b)) { c.aIm = imOf(a); c.bIm = imOf(b); }
  return c;
}

const needOf = (ctx) => (ctx.vars.length ? ctx.samples : 1);

function symbolicEqual(astA, astB) {
  try {
    const ce = getEngine();
    const d = ce.box(['Subtract', astA, astB]).simplify();
    return d.is(0) === true;
  } catch { return false; }
}

// ---- expression comparisons -------------------------------------------------------

function compareValues(fa, fb, ctx, mode, astPair) {
  const pts = samplePoints(ctx.vars, ctx.domains, ctx.seed);
  let valid = 0, ref = null;
  for (const p of pts) {
    const va = fa(p), vb = fb(p);
    if (!okV(va) || !okV(vb)) continue;
    if (mode === 'equal') {
      valid++;
      if (!closeV(va, vb)) return { ok: false, counterexample: cex(p, va, vb) };
    } else if (mode === 'constDiff') {
      valid++;
      const d = reOf(va) - reOf(vb);
      const sc = Math.max(1, Math.abs(reOf(va)), Math.abs(reOf(vb)));
      if (ref === null) ref = d;
      else if (Math.abs(d - ref) > 1e-9 * sc) return { ok: false, counterexample: cex(p, va, vb) };
    } else if (mode === 'ratio') {
      const a = reOf(va), b = reOf(vb);
      const za = Math.abs(a) < 1e-12, zb = Math.abs(b) < 1e-12;
      if (za && zb) continue;
      valid++;
      if (za !== zb) return { ok: false, counterexample: cex(p, va, vb) };
      const r = a / b;
      if (ref === null) ref = r;
      else if (!close(r, ref)) return { ok: false, counterexample: cex(p, va, vb) };
    }
  }
  if (valid >= needOf(ctx)) return { ok: true };
  if (mode === 'equal' && astPair && symbolicEqual(astPair[0], astPair[1])) return { ok: true };
  return { ok: false, error: 'not enough points where both sides are defined' };
}

function equalExprs(ea, eb, ctx) {
  return compareValues(fnOf(ea, ctx), fnOf(eb, ctx), ctx, 'equal', [ea.ast, eb.ast]);
}

/** expr from a line: an expression, or the right side of "y = ..." / "T_n = ...". */
function exprOf(line) {
  if (line.kind === 'expr') return line.expr;
  if (line.kind === 'rel' && line.sides.length === 2 && line.ops[0] === '=' && typeof line.sides[0].ast === 'string') return line.sides[1];
  return null;
}

// ---- relation comparisons ---------------------------------------------------------

function groupsOf(line, ctx) {
  const parts = line.kind === 'rel' ? [line] : line.parts;
  return parts.map((p) => p.ops.map((op, k) => ({ op, l: fnOf(p.sides[k], ctx, true), r: fnOf(p.sides[k + 1], ctx, true) })));
}

const isSingleEq = (l) => l.kind === 'rel' && l.ops.length === 1 && l.ops[0] === '=';
const diffFn = (l, ctx) => { const L = fnOf(l.sides[0], ctx, true), R = fnOf(l.sides[1], ctx, true); return (env) => L(env) - R(env); };

/**
 * Compares the solution sets of two relation lines.
 * rel: 'equal' | 'subset' (every solution of A solves B) | 'superset' | 'different'
 */
function compareRelations(A, B, ctx) {
  if (isSingleEq(A) && isSingleEq(B) && ctx.vars.length) {
    if (compareValues(diffFn(A, ctx), diffFn(B, ctx), ctx, 'ratio').ok) return { rel: 'equal' };
  }
  const gA = groupsOf(A, ctx), gB = groupsOf(B, ctx);
  if (!ctx.vars.length) {
    const ta = holds(gA, {}), tb = holds(gB, {});
    if (ta === tb) return { rel: 'equal' };
    return { rel: ta ? 'superset' : 'subset', witness: { point: {}, a: +ta, b: +tb } };
  }
  const win = windowFor(ctx.trig);
  let solveVars;
  if (ctx.solveVar && ctx.vars.includes(ctx.solveVar)) solveVars = [ctx.solveVar];
  else if (ctx.vars.length === 1) solveVars = ctx.vars;
  else solveVars = ctx.vars.slice(-2).reverse();
  let allEq = true, aInB = true, bInA = true, wit = null;
  for (const sv of solveVars) {
    const others = ctx.vars.filter((v) => v !== sv);
    let fixeds = [{}];
    if (others.length) {
      const pts = samplePoints(others, ctx.domains, ctx.seed + 1);
      fixeds = [pts[1], pts[4] || pts[0]];
    }
    for (const fixed of fixeds) {
      const SA = solveGroups(gA, sv, fixed, win, ctx.domains[sv]);
      const SB = solveGroups(gB, sv, fixed, win, ctx.domains[sv]);
      if (sameSet(SA, SB)) continue;
      allEq = false;
      if (!isSubset(SA, SB, win)) aInB = false;
      if (!isSubset(SB, SA, win)) bInA = false;
      if (!wit) {
        const x = witness(SA, SB, win);
        if (x !== null) wit = { point: { ...fixed, [sv]: x }, a: +contains(SA, x), b: +contains(SB, x) };
      }
    }
  }
  if (allEq) return { rel: 'equal' };
  return { rel: aInB ? 'subset' : bInA ? 'superset' : 'different', witness: wit };
}

const isRelLine = (l) => l.kind === 'rel' || l.kind === 'or';

// ---- messages (one short, plain sentence each) ------------------------------------

const MSG = {
  unparsable: 'I cannot read this line. Check the brackets and symbols.',
  eqExpr: 'Good step. This line is equal to the line before.',
  eqRel: 'Good step. This line has the same answers as the line before.',
  implies: 'This step can add extra answers, so check your answers in the first line at the end.',
  shape: 'Write the whole equation on every line.',
  noCheck: 'I could not check this line. Try writing it another way.',
  invalid: 'This line does not follow from the line before.',
};

// ---- public API -----------------------------------------------------------------

export function evalAt(latex, point = {}) {
  ensure();
  const line = parseLine(latex);
  if (line.kind === 'error') return NaN;
  const ctx = { deg: false, varSet: new Set(Object.keys(point).filter((k) => k === 'e' || k === 'i')), consts: {} };
  let e = exprOf(line);
  if (!e && isSingleEq(line)) { const d = diffFn(line, ctx); const v = d(point); return Number.isFinite(v) ? v : NaN; }
  if (!e) return NaN;
  const v = fnOf(e, ctx)(point);
  if (Array.isArray(v)) return Math.abs(v[1]) < 1e-12 ? v[0] : NaN;
  return v;
}

export function sequenceValues(latex, { var: v = 'n', from = 1, count = 6 } = {}) {
  const out = [];
  for (let k = 0; k < count; k++) out.push(evalAt(latex, { [v]: from + k }));
  return out;
}

function parsePair(a, b) {
  const A = parseLine(a), B = parseLine(b);
  if (A.kind === 'error' || B.kind === 'error') return { error: 'unparsable' };
  return { A, B };
}

function relResult(c) {
  if (c.rel === 'equal') return { ok: true };
  return c.witness ? { ok: false, counterexample: c.witness } : { ok: false };
}

/** Value list / solution line / interval string -> interval set over `v`. */
function toSet(x, ctx, allowIntervals) {
  if (Array.isArray(x)) {
    const pts = [];
    for (const item of x) {
      const l = parseLine(String(item));
      if (l.kind === 'error') return null;
      if (l.kind === 'expr') { for (const ast of expandPM(l.expr.ast)) pts.push(compileReal(ast, { deg: ctx.deg })({})); }
      else {
        const parts = l.kind === 'rel' ? [l] : l.parts;
        for (const p of parts) pts.push(fnOf(p.sides[p.sides.length - 1], ctx, true)({}));
      }
    }
    if (pts.some((p) => !Number.isFinite(p))) return null;
    return normalize(pts.map((p) => ({ lo: p, hi: p, loC: true, hiC: true })));
  }
  const s = String(x);
  if (allowIntervals || /\\\{|\\emptyset|\\varnothing/.test(s)) {
    const iv = parseIntervalNotation(s, evalConst);
    if (iv) return iv;
  }
  const l = parseLine(s);
  if (l.kind === 'error') return null;
  if (l.kind === 'expr') {
    // "2, 3" as a bare list
    const items = s.split(',').map((t) => t.trim()).filter(Boolean);
    return items.length ? toSet(items, ctx, false) : null;
  }
  const v = ctx.solveVar || l.vars[0];
  if (!v) return null;
  const win = windowFor(lineHasTrig(l));
  return solveGroups(groupsOf(l, ctx), v, {}, win, ctx.domains[v] || REALS);
}

function setResult(SA, SB, v) {
  if (!SA || !SB) return { ok: false, error: 'unparsable' };
  if (sameSet(SA, SB)) return { ok: true };
  const x = witness(SA, SB);
  return x === null ? { ok: false } : { ok: false, counterexample: { point: { [v]: x }, a: +contains(SA, x), b: +contains(SB, x) } };
}

function setVar(a, b, opts) {
  if (opts.var) return opts.var;
  for (const s of [a, b]) {
    if (Array.isArray(s)) continue;
    const l = parseLine(String(s));
    if (l.kind !== 'error' && l.vars.length) return l.vars[0];
  }
  return 'x';
}

export const check = {
  equivalent(a, b, opts = {}) {
    ensure();
    const { A, B, error } = parsePair(a, b);
    if (error) return { ok: false, error };
    const ctx = ctxOf(opts, [A, B]);
    if (A.kind === 'expr' && B.kind === 'expr') return equalExprs(A.expr, B.expr, ctx);
    if (isRelLine(A) && isRelLine(B)) return relResult(compareRelations(A, B, ctx));
    return { ok: false, error: 'shape-mismatch' };
  },

  step(prev, next, opts = {}) {
    ensure();
    const A = parseLine(prev), B = parseLine(next);
    if (A.kind === 'error' || B.kind === 'error') return { ok: false, kind: 'unparsable', reversible: false, message: MSG.unparsable };
    const ctx = ctxOf(opts, [A, B]);
    if (A.kind === 'expr' && B.kind === 'expr') {
      const r = equalExprs(A.expr, B.expr, ctx);
      if (r.ok) return { ok: true, kind: 'equivalent', reversible: true, message: MSG.eqExpr };
      if (!r.counterexample) return { ok: false, kind: 'invalid', reversible: false, message: MSG.noCheck };
      const c = r.counterexample;
      return { ok: false, kind: 'invalid', reversible: false, counterexample: c,
        message: `At ${fmtPoint(c.point)}, the line before gives ${fmt(c.a)} but this line gives ${fmt(c.b)}.` };
    }
    if (!isRelLine(A) || !isRelLine(B)) return { ok: false, kind: 'invalid', reversible: false, message: MSG.shape };
    const c = compareRelations(A, B, ctx);
    if (c.rel === 'equal') return { ok: true, kind: 'equivalent', reversible: true, message: MSG.eqRel };
    if (c.rel === 'subset') return { ok: true, kind: 'implies', reversible: false, message: MSG.implies, ...(c.witness ? { counterexample: c.witness } : {}) };
    const w = c.witness;
    let message = MSG.invalid;
    if (w && Object.keys(w.point).length) {
      const many = Object.keys(w.point).length > 1;
      const where = many ? `The values ${fmtPoint(w.point)}` : fmtPoint(w.point);
      const works = many ? 'work' : 'works';
      message = w.a && !w.b
        ? `${where} ${works} in the line before, but not in this line, so an answer is lost.`
        : `${where} ${works} in this line, but not in the line before.`;
    }
    return { ok: false, kind: 'invalid', reversible: false, ...(w ? { counterexample: w } : {}), message };
  },

  solutionSet(a, b, opts = {}) {
    ensure();
    const v = setVar(a, b, opts);
    const ctx = ctxOf({ ...opts, var: v }, [], {});
    ctx.domains[v] = opts.assume?.[v] != null ? parseDomain(opts.assume[v], evalConst) : REALS;
    return setResult(toSet(a, ctx, false), toSet(b, ctx, false), v);
  },

  interval(a, b, opts = {}) {
    ensure();
    const v = setVar(a, b, opts);
    const ctx = ctxOf({ ...opts, var: v }, [], {});
    ctx.domains[v] = REALS;
    return setResult(toSet(a, ctx, true), toSet(b, ctx, true), v);
  },

  upToConstant(a, b, opts = {}) {
    ensure();
    const { A, B, error } = parsePair(a, b);
    if (error) return { ok: false, error };
    const ea = exprOf(A), eb = exprOf(B);
    if (!ea || !eb) return { ok: false, error: 'shape-mismatch' };
    const ctx = ctxOf(opts, [{ vars: ea.vars }, { vars: eb.vars }], { drop: ['C'], consts: { C: 0 } });
    return compareValues(fnOf(ea, ctx), fnOf(eb, ctx), ctx, 'constDiff');
  },

  upToScalar(a, b, opts = {}) {
    ensure();
    const { A, B, error } = parsePair(a, b);
    if (error) return { ok: false, error };
    const ctx = ctxOf(opts, [A, B]);
    if (isSingleEq(A) && isSingleEq(B)) return compareValues(diffFn(A, ctx), diffFn(B, ctx), ctx, 'ratio');
    if (A.kind === 'expr' && B.kind === 'expr') return compareValues(fnOf(A.expr, ctx), fnOf(B.expr, ctx), ctx, 'ratio');
    return { ok: false, error: 'shape-mismatch' };
  },

  onIntegers(a, b, opts = {}) {
    ensure();
    const { A, B, error } = parsePair(a, b);
    if (error) return { ok: false, error };
    const ea = exprOf(A), eb = exprOf(B);
    if (!ea || !eb) return { ok: false, error: 'shape-mismatch' };
    const v = opts.var || 'n';
    const from = opts.from ?? 1;
    const ctx = ctxOf(opts, [{ vars: ea.vars }, { vars: eb.vars }], { drop: [v] });
    const others = ctx.vars;
    const fa = fnOf(ea, ctx), fb = fnOf(eb, ctx);
    const pts = samplePoints(others, ctx.domains, ctx.seed);
    const count = Math.max(ctx.samples, 10);
    let valid = 0;
    for (let k = 0; k < count; k++) {
      const p = { [v]: from + k, ...pts[k % pts.length] };
      const va = fa(p), vb = fb(p);
      const oa = okV(va), ob = okV(vb);
      if (!oa && !ob) continue;
      valid++;
      if (oa !== ob || !closeV(va, vb)) return { ok: false, counterexample: cex(p, oa ? va : NaN, ob ? vb : NaN) };
    }
    return valid >= Math.min(count, ctx.samples) ? { ok: true } : { ok: false, error: 'not enough points where both sides are defined' };
  },
};

export function form(latex, rule, opts = {}) {
  ensure();
  return formRule(parseLine(latex), rule, opts);
}

// ---- diffTerms ------------------------------------------------------------------

function ckey(n) {
  if (typeof n === 'number') return String(Number(n.toPrecision(12)));
  if (typeof n === 'string') return n;
  const [h, ...a] = n;
  if (h === 'Negate' && typeof a[0] === 'number') return String(-a[0]);
  const ks = a.map(ckey);
  if (h === 'Add' || h === 'Multiply') ks.sort();
  return `${h}(${ks.join(',')})`;
}

function lineAsts(l) {
  if (l.kind === 'expr') return [l.expr.ast];
  if (l.kind === 'rel') return l.sides.map((e) => e.ast);
  if (l.kind === 'or') return l.parts.flatMap((p) => p.sides.map((e) => e.ast));
  return [];
}

const CONTAINERS = new Set(['Add', 'Multiply', 'Negate']);

export function diffTerms(prevLatex, nextLatex) {
  ensure();
  const A = parseLine(prevLatex), B = parseLine(nextLatex);
  if (B.kind === 'error') return { changed: [] };
  const seen = new Set();
  const collect = (n) => { seen.add(ckey(n)); if (Array.isArray(n)) n.slice(1).forEach(collect); };
  lineAsts(A).forEach(collect);
  const changed = [];
  const visit = (n) => {
    if (seen.has(ckey(n))) return;
    if (Array.isArray(n) && CONTAINERS.has(n[0]) && n.slice(1).some((c) => seen.has(ckey(c)))) { n.slice(1).forEach(visit); return; }
    const t = toLatexSafe(n);
    if (!changed.includes(t)) changed.push(t);
  };
  lineAsts(B).forEach(visit);
  return { changed };
}

function toLatexSafe(n) { try { return toLatex(n); } catch { return ''; } }
