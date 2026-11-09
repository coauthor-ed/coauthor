/**
 * Structural "is it written in the required form?" rules, on the
 * non-canonical AST (so 6/8 is still 6/8). Each rule returns
 * { ok, reason? } where reason is one short plain-English sentence.
 * Also: polynomial coefficients for "can this bracket be factored further"
 * and "do top and bottom share a factor", and a small LaTeX serialiser.
 */
import { gcd } from './sample.js';
import { freeVars } from './parse.js';

const isAdd = (n) => Array.isArray(n) && n[0] === 'Add';
const head = (n) => (Array.isArray(n) ? n[0] : null);
const symbolsOf = (n) => [...freeVars(n)].filter((v) => !v.startsWith('#'));
const hasVar = (n) => symbolsOf(n).length > 0;
const usesI = (n) => freeVars(n).has('#i');

/** Numeric value of a variable-free real subtree, else NaN. */
function numVal(n) {
  if (typeof n === 'number') return n;
  if (n === 'Pi') return Math.PI;
  if (n === 'e') return Math.E;
  if (!Array.isArray(n)) return NaN;
  const a = n.slice(1).map(numVal);
  if (a.some(Number.isNaN)) return NaN;
  switch (n[0]) {
    case 'Add': return a.reduce((s, x) => s + x, 0);
    case 'Multiply': return a.reduce((s, x) => s * x, 1);
    case 'Negate': return -a[0];
    case 'Divide': return a[1] === 0 ? NaN : a[0] / a[1];
    case 'Power': return Math.pow(a[0], a[1]);
    case 'Sqrt': return a[0] < 0 ? NaN : Math.sqrt(a[0]);
    case 'Root': return Math.pow(a[0], 1 / a[1]);
    case 'Sin': return Math.sin(a[0]);
    case 'Cos': return Math.cos(a[0]);
    default: return NaN;
  }
}

// ---- polynomials (coefficient arrays, low degree first) ---------------------------

const padd = (p, q) => { const r = []; for (let k = 0; k < Math.max(p.length, q.length); k++) r.push((p[k] || 0) + (q[k] || 0)); return r; };
const pmul = (p, q) => { const r = new Array(p.length + q.length - 1).fill(0); p.forEach((a, i) => q.forEach((b, j) => { r[i + j] += a * b; })); return r; };
const trim = (p) => { const r = [...p]; while (r.length > 1 && Math.abs(r[r.length - 1]) < 1e-12) r.pop(); return r; };

/** Coefficients of `n` as a polynomial in `v`, or null. */
export function polyOf(n, v) {
  if (!hasVar(n)) { const x = numVal(n); return Number.isFinite(x) ? [x] : null; }
  if (n === v) return [0, 1];
  if (typeof n === 'string') return null;
  const [h, ...a] = n;
  switch (h) {
    case 'Add': { let r = [0]; for (const x of a) { const p = polyOf(x, v); if (!p) return null; r = padd(r, p); } return trim(r); }
    case 'Multiply': { let r = [1]; for (const x of a) { const p = polyOf(x, v); if (!p) return null; r = pmul(r, p); } return trim(r); }
    case 'Negate': { const p = polyOf(a[0], v); return p && p.map((x) => -x); }
    case 'Divide': { if (hasVar(a[1])) return null; const p = polyOf(a[0], v); const d = numVal(a[1]); return p && d ? p.map((x) => x / d) : null; }
    case 'Power': {
      const e = numVal(a[1]);
      if (!Number.isInteger(e) || e < 0 || e > 24) return null;
      const p = polyOf(a[0], v); if (!p) return null;
      let r = [1]; for (let k = 0; k < e; k++) r = pmul(r, p);
      return trim(r);
    }
    default: return null;
  }
}

/** Scales to integer coefficients (denominators <= 1000) or null. */
function integerize(p) {
  let L = 1;
  for (const c of p) {
    let q = 1; while (q <= 1000 && Math.abs(c * q - Math.round(c * q)) > 1e-9) q++;
    if (q > 1000) return null;
    L = (L * q) / gcd(L, q);
  }
  return p.map((c) => Math.round(c * L));
}

function divisors(n) { n = Math.abs(n); const d = []; for (let k = 1; k * k <= n && k <= 1e5; k++) if (n % k === 0) { d.push(k); if (k * k !== n) d.push(n / k); } return d; }

/** A rational root p/q of an integer polynomial, or null. */
export function rationalRoot(p) {
  const c = integerize(p); if (!c) return null;
  const deg = c.length - 1; if (deg < 1) return null;
  if (c[0] === 0) return 0;
  if (Math.abs(c[0]) > 1e7 || Math.abs(c[deg]) > 1e7) return null;
  for (const P of divisors(c[0])) for (const Q of divisors(c[deg])) for (const s of [1, -1]) {
    const x = (s * P) / Q;
    let v = 0; for (let k = deg; k >= 0; k--) v = v * x + c[k];
    if (Math.abs(v) < 1e-7 * Math.max(1, Math.abs(c[deg]) * Math.pow(Math.abs(x), deg))) return x;
  }
  return null;
}

function content(p) {
  if (!p.every((c) => Number.isInteger(c))) return 1;
  return p.reduce((g, c) => gcd(g, c), 0) || 1;
}

const evalPoly = (p, x) => p.reduce((s, c, k) => s + c * Math.pow(x, k), 0);

// ---- rules ---------------------------------------------------------------------

function flattenMul(n) {
  if (head(n) === 'Multiply') return n.slice(1).flatMap(flattenMul);
  if (head(n) === 'Negate') return [-1, ...flattenMul(n[1])];
  return [n];
}

function walk(n, fn) { fn(n); if (Array.isArray(n)) for (let k = 1; k < n.length; k++) walk(n[k], fn); }

function factorReasons(f, vars) {
  const base = head(f) === 'Power' ? f[1] : f;
  if (!isAdd(base)) return null;
  const v = symbolsOf(base);
  if (v.length !== 1) return null;
  const p = polyOf(base, v[0]);
  if (!p) return null;
  const deg = p.length - 1;
  if (deg >= 2 && rationalRoot(p) !== null) return `The bracket ${toLatex(base)} can be factored further.`;
  const ip = p.every((c) => Number.isInteger(c)) ? p : null;
  if (ip && deg >= 1 && content(ip) > 1) return `Take the common factor ${content(ip)} out of ${toLatex(base)}.`;
  return null;
}

function ruleFactored(n) {
  const core = head(n) === 'Negate' ? n[1] : n;
  if (!hasVar(core)) return { ok: false, reason: 'There is nothing to factorise here.' };
  if (isAdd(core)) {
    const v = symbolsOf(core);
    const p = v.length === 1 ? polyOf(core, v[0]) : null;
    if (p && p.length <= 2 && content(p) === 1) return { ok: true };
    return { ok: false, reason: 'This is still a sum of terms. Write it as a product of brackets.' };
  }
  const factors = flattenMul(core);
  for (const f of factors) {
    if (head(f) === 'Divide') return { ok: false, reason: 'Write it as a product of factors, without a fraction.' };
    const r = factorReasons(f);
    if (r) return { ok: false, reason: r };
  }
  return { ok: true };
}

function ruleExpanded(n) {
  let bad = null;
  walk(n, (m) => {
    if (bad || !Array.isArray(m)) return;
    if (m[0] === 'Multiply') {
      const fs = flattenMul(m);
      if (fs.length > 1 && fs.some((f) => isAdd(f) && hasVar(f))) bad = 'Multiply out the brackets.';
    } else if (m[0] === 'Power' && isAdd(m[1]) && hasVar(m[1])) {
      const e = numVal(m[2]);
      if (Number.isInteger(e) && e >= 2) bad = 'Expand the power of the bracket.';
    } else if (m[0] === 'Negate' && isAdd(m[1])) bad = 'Remove the bracket after the minus sign.';
  });
  // do not look inside denominators: the walk above already did; allow them
  return bad ? { ok: false, reason: bad } : { ok: true };
}

function ruleLowestTerms(n) {
  let bad = null;
  walk(n, (m) => {
    if (bad || head(m) !== 'Divide') return;
    const [, a, b] = m;
    if (head(a) === 'Divide' || head(b) === 'Divide') { bad = 'Simplify the fraction inside the fraction.'; return; }
    const na = numVal(a), nb = numVal(b);
    if (Number.isFinite(na) && Number.isFinite(nb) && typeof a === 'number' && typeof b === 'number') {
      if (!Number.isInteger(na) || !Number.isInteger(nb)) { bad = 'Use whole numbers on the top and bottom.'; return; }
      if (nb < 0) { bad = 'Move the minus sign to the top of the fraction.'; return; }
      const g = gcd(na, nb);
      if (nb === 1 || g === nb) { bad = 'This fraction is a whole number.'; return; }
      if (g > 1) { bad = `Divide the top and bottom by ${g}.`; return; }
      return;
    }
    const vs = [...new Set([...symbolsOf(a), ...symbolsOf(b)])];
    if (vs.length === 1) {
      const pa = polyOf(a, vs[0]), pb = polyOf(b, vs[0]);
      if (pa && pb && pb.length > 1) {
        const r = rationalRoot(pb);
        if (r !== null && Math.abs(evalPoly(pa, r)) < 1e-9) { bad = 'The top and bottom share a factor. Cancel it.'; return; }
        const ia = integerize(pa), ib = integerize(pb);
        if (ia && ib && pa.every(Number.isInteger) && pb.every(Number.isInteger)) {
          const g = gcd(content(ia), content(ib));
          if (g > 1) { bad = `The top and bottom can both be divided by ${g}.`; return; }
        }
      } else if (pa && pb && pb.length === 1 && Number.isInteger(pb[0]) && pa.every(Number.isInteger)) {
        const g = gcd(content(pa), pb[0]);
        if (g > 1) bad = `The top and bottom can both be divided by ${g}.`;
      }
    }
  });
  return bad ? { ok: false, reason: bad } : { ok: true };
}

const isRadical = (m) => head(m) === 'Sqrt' || head(m) === 'Root'
  || (head(m) === 'Power' && Number.isFinite(numVal(m[2])) && !Number.isInteger(numVal(m[2])));
const containsRadical = (n) => { let r = false; walk(n, (m) => { if (isRadical(m)) r = true; }); return r; };

function ruleRationalised(n) {
  let bad = false;
  walk(n, (m) => {
    if (head(m) === 'Divide' && containsRadical(m[2])) bad = true;
    if (head(m) === 'Power' && isRadical(m[1]) && numVal(m[2]) < 0) bad = true;
  });
  return bad ? { ok: false, reason: 'Remove the square root from the bottom of the fraction.' } : { ok: true };
}

function largestPowerFactor(n, k) {
  let best = 1;
  for (let b = 2; Math.pow(b, k) <= n; b++) if (n % Math.pow(b, k) === 0) best = b;
  return best;
}

function surdKey(t) {
  // c * sqrt(n) -> 'n'
  const fs = flattenMul(t);
  const rad = fs.filter((f) => head(f) === 'Sqrt' && typeof f[1] === 'number');
  const rest = fs.filter((f) => !(head(f) === 'Sqrt' && typeof f[1] === 'number'));
  if (rad.length !== 1 || rest.some((f) => typeof f !== 'number')) return null;
  return String(rad[0][1]);
}

function ruleSimplestSurd(n) {
  let bad = null;
  walk(n, (m) => {
    if (bad) return;
    if (head(m) === 'Sqrt' || head(m) === 'Root') {
      const k = head(m) === 'Sqrt' ? 2 : numVal(m[2]);
      const x = m[1];
      if (head(x) === 'Divide') { bad = 'Do not leave a fraction inside the root.'; return; }
      const v = numVal(x);
      if (Number.isInteger(v) && v > 0 && Number.isInteger(k)) {
        const r = Math.round(Math.pow(v, 1 / k));
        if (Math.pow(r, k) === v) { bad = `The root of ${v} is a whole number, ${r}.`; return; }
        const b = largestPowerFactor(v, k);
        if (b > 1) { bad = `The root of ${v} can be simplified, because ${v} has the factor ${Math.pow(b, k)}.`; return; }
      }
    }
    if (isAdd(m)) {
      const keys = m.slice(1).map(surdKey).filter(Boolean);
      if (new Set(keys).size < keys.length) bad = 'Add the like surds together.';
    }
  });
  if (bad) return { ok: false, reason: bad };
  const r = ruleRationalised(n);
  return r.ok ? { ok: true } : r;
}

function splitTerms(n) {
  if (isAdd(n)) return n.slice(1);
  return [n];
}

function isRealNum(n) { return !hasVar(n) && !usesI(n) && Number.isFinite(numVal(n)); }

function imagCoef(t) {
  // t = b*i (b real numeric) -> true
  if (t === 'i') return true;
  if (head(t) === 'Negate') return imagCoef(t[1]);
  if (head(t) === 'Divide') return imagCoef(t[1]) && isRealNum(t[2]);
  if (head(t) === 'Multiply') {
    const fs = flattenMul(t);
    const is = fs.filter((f) => f === 'i');
    const rest = fs.filter((f) => f !== 'i');
    return is.length === 1 && rest.every((f) => f === -1 || isRealNum(f));
  }
  return false;
}

function ruleAPlusBi(n) {
  const terms = splitTerms(n);
  let re = 0, im = 0;
  for (const t of terms) {
    if (isRealNum(t)) re++;
    else if (imagCoef(t)) im++;
    else return { ok: false, reason: 'Write it as a + bi, with one real part and one i part.' };
  }
  if (re > 1 || im > 1) return { ok: false, reason: 'Combine the real parts and the i parts.' };
  return { ok: true };
}

const key = (n) => JSON.stringify(n);

function rulePolar(n) {
  const fs = flattenMul(n);
  const rParts = fs.filter((f) => isRealNum(f));
  const other = fs.filter((f) => !isRealNum(f));
  const r = rParts.reduce((s, f) => s * (f === -1 ? -1 : numVal(f)), 1);
  if (other.length !== 1) return { ok: false, reason: 'Write it as r(cos t + i sin t).' };
  const z = other[0];
  if (r < 0) return { ok: false, reason: 'The modulus r must be positive.' };
  if (head(z) === 'Power' && z[1] === 'e' && imagCoef(z[2])) return { ok: true };
  if (isAdd(z) && z.length === 3) {
    const [a, b] = [z[1], z[2]];
    const cosT = head(a) === 'Cos' ? a : head(b) === 'Cos' ? b : null;
    const sinT = cosT === a ? b : a;
    const sf = flattenMul(sinT);
    const sinNode = sf.find((f) => head(f) === 'Sin');
    if (cosT && sinNode && sf.includes('i') && sf.length === 2) {
      if (key(cosT[1]) !== key(sinNode[1])) return { ok: false, reason: 'Use the same angle in cos and sin.' };
      if (!isRealNum(cosT[1])) return { ok: false, reason: 'The angle should be a number.' };
      return { ok: true };
    }
  }
  return { ok: false, reason: 'Write it as r(cos t + i sin t).' };
}

export function formRule(line, rule, opts = {}) {
  if (line.kind === 'error') return { ok: false, reason: 'I cannot read this. Check the brackets and symbols.' };
  if (rule === 'solved-for') return ruleSolvedFor(line, opts);
  let targets;
  if (line.kind === 'expr') targets = [line.expr.ast];
  else if (line.kind === 'rel') targets = line.sides.filter((e) => e.vars.length).map((e) => e.ast);
  else targets = line.parts.flatMap((p) => p.sides.map((e) => e.ast));
  if (!targets.length && line.kind === 'rel') targets = line.sides.map((e) => e.ast);
  const fn = {
    factored: ruleFactored, expanded: ruleExpanded, lowestTerms: ruleLowestTerms,
    rationalisedDenominator: ruleRationalised, simplestSurd: ruleSimplestSurd,
    'a+bi': ruleAPlusBi, polar: rulePolar,
  }[rule];
  if (!fn) return { ok: false, reason: `Unknown form rule: ${rule}` };
  for (const t of targets) { const r = fn(t); if (!r.ok) return r; }
  return { ok: true };
}

function ruleSolvedFor(line, opts) {
  const parts = line.kind === 'rel' ? [line] : line.kind === 'or' ? line.parts : null;
  if (!parts) return { ok: false, reason: 'Write it as an equation, like x = ...' };
  const v = opts.var || line.vars?.[0] || 'x';
  for (const p of parts) {
    if (p.sides.length !== 2) return { ok: false, reason: `Write it as ${v} = a number.` };
    const [l, r] = p.sides;
    if (l.ast !== v) return { ok: false, reason: `Get ${v} by itself on the left side.` };
    if (r.vars.includes(v)) return { ok: false, reason: `${v} should not appear on the right side.` };
  }
  return { ok: true };
}

// ---- LaTeX serialiser (for diffTerms) ------------------------------------------------

const GREEK = new Set(['alpha', 'beta', 'gamma', 'delta', 'theta', 'phi', 'lambda', 'mu', 'omega', 'sigma', 'rho', 'tau', 'epsilon']);
const FN_TEX = { Sin: '\\sin', Cos: '\\cos', Tan: '\\tan', Cot: '\\cot', Sec: '\\sec', Csc: '\\csc', Ln: '\\ln',
  Arcsin: '\\arcsin', Arccos: '\\arccos', Arctan: '\\arctan', Sinh: '\\sinh', Cosh: '\\cosh', Tanh: '\\tanh' };
const PREC = { Add: 1, Negate: 2, Multiply: 2, Divide: 3, Power: 4 };

export function toLatex(n, parent = 0) {
  if (typeof n === 'number') {
    const s = Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(10)));
    return n < 0 && parent > 1 ? `\\left(${s}\\right)` : s;
  }
  if (typeof n === 'string') {
    if (n === 'Pi') return '\\pi';
    if (n === 'PositiveInfinity') return '\\infty';
    if (n === 'NegativeInfinity') return '-\\infty';
    if (GREEK.has(n)) return `\\${n}`;
    if (n.length > 1 && /^[A-Za-z][A-Za-z0-9]+$/.test(n)) return `${n[0]}_{${n.slice(1)}}`;
    return n;
  }
  const [h, ...a] = n;
  const p = PREC[h] || 5;
  const wrap = (s) => (p < parent ? `\\left(${s}\\right)` : s);
  switch (h) {
    case 'Add': return wrap(a.map((t, k) => {
      const s = toLatex(t, 1);
      return k === 0 ? s : (s.startsWith('-') ? s : `+${s}`);
    }).join(''));
    case 'Negate': return wrap(`-${toLatex(a[0], 3)}`);
    case 'Multiply': {
      const parts = a.map((t) => toLatex(t, 2.5));
      let out = parts[0];
      for (let k = 1; k < parts.length; k++) out += (/^[0-9]/.test(parts[k]) ? '\\cdot ' : '') + parts[k];
      return wrap(out);
    }
    case 'Divide': return `\\frac{${toLatex(a[0])}}{${toLatex(a[1])}}`;
    case 'Power': {
      const b = toLatex(a[0], 4.5);
      if (FN_TEX[head(a[0])] && Array.isArray(a[0])) return `${FN_TEX[a[0][0]]}^{${toLatex(a[1])}}${toLatex(a[0][1], 5)}`;
      return wrap(`${b}^{${toLatex(a[1])}}`);
    }
    case 'Sqrt': return `\\sqrt{${toLatex(a[0])}}`;
    case 'Root': return `\\sqrt[${toLatex(a[1])}]{${toLatex(a[0])}}`;
    case 'Abs': return `\\left|${toLatex(a[0])}\\right|`;
    case 'Factorial': return `${toLatex(a[0], 5)}!`;
    case 'Binomial': return `\\binom{${toLatex(a[0])}}{${toLatex(a[1])}}`;
    case 'Log': return a.length > 1 ? `\\log_{${toLatex(a[1])}}\\left(${toLatex(a[0])}\\right)` : `\\log\\left(${toLatex(a[0])}\\right)`;
    case 'Degrees': return `${toLatex(a[0], 5)}^\\circ`;
    case 'PlusMinus': return a.length === 1 ? `\\pm ${toLatex(a[0], 3)}` : `${toLatex(a[0], 1)}\\pm ${toLatex(a[1], 3)}`;
    default:
      if (FN_TEX[h]) {
        const arg = toLatex(a[0]);
        return /^[a-zA-Z0-9\\]+$/.test(arg) && arg.length <= 6 ? `${FN_TEX[h]} ${arg}` : `${FN_TEX[h]}\\left(${arg}\\right)`;
      }
      return `\\operatorname{${h}}\\left(${a.map((x) => toLatex(x)).join(',')}\\right)`;
  }
}
