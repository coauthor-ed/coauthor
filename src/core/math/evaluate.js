/**
 * Compiles a normalised AST (see parse.js) into a fast JS closure
 * `env => number` (real mode, NaN wherever the expression is undefined) or
 * `env => [re, im]` (complex mode, only used when the expression has a free
 * `i`). Real mode follows school rules: sqrt/log of a negative, tan at its
 * poles, n! of a non-integer etc. are all undefined (NaN), so sampling simply
 * skips those points. Numeric evaluation avoids ComputeEngine's symbolic
 * blind spots (e.g. simplify() never reducing sqrt(x)^2 to x without a sign
 * assumption - see semantic-descriptive/v1/mathConsistency.js).
 * Unknown heads fall back to ComputeEngine's own N() for that subtree.
 */
import { getEngine } from './parse.js';

const POLE_EPS = 1e-12;

function oddDen(b) {
  for (let q = 3; q <= 15; q += 2) { const p = Math.round(b * q); if (Math.abs(p / q - b) < 1e-12) return { p, q }; }
  return null;
}

export function realPow(a, b) {
  if (a === 0 && b < 0) return NaN;
  if (a < 0 && !Number.isInteger(b)) {
    const r = oddDen(b);
    if (!r) return NaN;
    const m = Math.pow(-a, b);
    return r.p % 2 ? -m : m;
  }
  return Math.pow(a, b);
}

function factorial(n) {
  if (!(n >= 0) || Math.abs(n - Math.round(n)) > 1e-9) return NaN;
  n = Math.round(n);
  if (n > 170) return NaN;
  let r = 1; for (let k = 2; k <= n; k++) r *= k;
  return r;
}

function binomial(n, r) {
  if (Math.abs(n - Math.round(n)) > 1e-9 || Math.abs(r - Math.round(r)) > 1e-9) return NaN;
  n = Math.round(n); r = Math.round(r);
  if (n < 0) return NaN;
  if (r < 0 || r > n) return 0;
  r = Math.min(r, n - r);
  let v = 1; for (let k = 1; k <= r; k++) v = (v * (n - r + k)) / k;
  return Math.round(v);
}

const isInt = (x) => Math.abs(x - Math.round(x)) < 1e-9;

function ceFallback(ast) {
  const ce = getEngine();
  const boxed = ce.box(ast);
  return (env) => {
    try {
      const r = boxed.subs(env).N();
      const v = typeof r.re === 'number' ? r.re : Number(r.valueOf());
      if (typeof r.im === 'number' && Math.abs(r.im) > 1e-12) return NaN;
      return v;
    } catch { return NaN; }
  };
}

/**
 * opts: { deg?: boolean (trig in degrees), varSet?: Set (symbols that are
 * variables even if they look like constants, e.g. 'e'), consts?: {C: 0} }
 */
export function compileReal(ast, opts = {}) {
  const deg = opts.deg ? Math.PI / 180 : 1;
  const varSet = opts.varSet || new Set();
  const consts = opts.consts || {};

  const C = (n) => {
    if (typeof n === 'number') return () => n;
    if (typeof n === 'string') {
      if (n in consts && !varSet.has(n)) { const v = consts[n]; return () => v; }
      if (!varSet.has(n)) {
        if (n === 'Pi') return () => Math.PI;
        if (n === 'e') return () => Math.E;
        if (n === 'PositiveInfinity') return () => Infinity;
        if (n === 'NegativeInfinity') return () => -Infinity;
      }
      return (env) => { const v = env[n]; return typeof v === 'number' ? v : NaN; };
    }
    const [h, ...a] = n;
    const f = (k) => C(a[k]);
    switch (h) {
      case 'Add': { const fs = a.map(C); return (env) => { let s = 0; for (const g of fs) s += g(env); return s; }; }
      case 'Multiply': { const fs = a.map(C); return (env) => { let s = 1; for (const g of fs) s *= g(env); return s; }; }
      case 'Negate': { const g = f(0); return (env) => -g(env); }
      case 'Divide': { const p = f(0), q = f(1); return (env) => { const d = q(env); return d === 0 ? NaN : p(env) / d; }; }
      case 'Power': { const p = f(0), q = f(1); return (env) => realPow(p(env), q(env)); }
      case 'Sqrt': { const g = f(0); return (env) => { const v = g(env); return v < 0 ? NaN : Math.sqrt(v); }; }
      case 'Root': {
        const g = f(0), k = f(1);
        return (env) => { const v = g(env), m = k(env); if (!isInt(m) || m < 1) return NaN;
          if (v < 0) return Math.round(m) % 2 ? -Math.pow(-v, 1 / m) : NaN; return Math.pow(v, 1 / m); };
      }
      case 'Sin': { const g = f(0); return (env) => Math.sin(g(env) * deg); }
      case 'Cos': { const g = f(0); return (env) => Math.cos(g(env) * deg); }
      case 'Tan': { const g = f(0); return (env) => { const t = g(env) * deg, c = Math.cos(t); return Math.abs(c) < POLE_EPS ? NaN : Math.sin(t) / c; }; }
      case 'Cot': { const g = f(0); return (env) => { const t = g(env) * deg, s = Math.sin(t); return Math.abs(s) < POLE_EPS ? NaN : Math.cos(t) / s; }; }
      case 'Sec': { const g = f(0); return (env) => { const c = Math.cos(g(env) * deg); return Math.abs(c) < POLE_EPS ? NaN : 1 / c; }; }
      case 'Csc': { const g = f(0); return (env) => { const s = Math.sin(g(env) * deg); return Math.abs(s) < POLE_EPS ? NaN : 1 / s; }; }
      case 'Arcsin': { const g = f(0); return (env) => Math.asin(g(env)) / deg; }
      case 'Arccos': { const g = f(0); return (env) => Math.acos(g(env)) / deg; }
      case 'Arctan': { const g = f(0); return (env) => Math.atan(g(env)) / deg; }
      case 'Arccot': { const g = f(0); return (env) => { const v = g(env); return (v === 0 ? Math.PI / 2 : Math.atan(1 / v) + (v < 0 ? Math.PI : 0)) / deg; }; }
      case 'Arcsec': { const g = f(0); return (env) => Math.acos(1 / g(env)) / deg; }
      case 'Arccsc': { const g = f(0); return (env) => Math.asin(1 / g(env)) / deg; }
      case 'Sinh': { const g = f(0); return (env) => Math.sinh(g(env)); }
      case 'Cosh': { const g = f(0); return (env) => Math.cosh(g(env)); }
      case 'Tanh': { const g = f(0); return (env) => Math.tanh(g(env)); }
      case 'Ln': { const g = f(0); return (env) => { const v = g(env); return v <= 0 ? NaN : Math.log(v); }; }
      case 'Log': {
        const g = f(0), b = a.length > 1 ? f(1) : () => 10;
        return (env) => { const v = g(env), B = b(env); return v <= 0 || B <= 0 || B === 1 ? NaN : Math.log(v) / Math.log(B); };
      }
      case 'Abs': { const g = f(0); return (env) => Math.abs(g(env)); }
      case 'Sign': { const g = f(0); return (env) => Math.sign(g(env)); }
      case 'Floor': { const g = f(0); return (env) => Math.floor(g(env)); }
      case 'Ceil': { const g = f(0); return (env) => Math.ceil(g(env)); }
      case 'Round': { const g = f(0); return (env) => Math.round(g(env)); }
      case 'Max': { const fs = a.map(C); return (env) => Math.max(...fs.map((g) => g(env))); }
      case 'Min': { const fs = a.map(C); return (env) => Math.min(...fs.map((g) => g(env))); }
      case 'Factorial': { const g = f(0); return (env) => factorial(g(env)); }
      case 'Gamma': { const g = f(0); return (env) => factorial(g(env) - 1); }
      case 'Binomial': { const p = f(0), q = f(1); return (env) => binomial(p(env), q(env)); }
      case 'Degrees': { const g = f(0); return (env) => (g(env) * Math.PI) / 180 / deg; }
      case 'Sum': case 'Product': {
        const lim = a[1];
        if (!Array.isArray(lim) || lim[0] !== 'Tuple' || typeof lim[1] !== 'string') throw new Error('bad limits');
        const k = lim[1], lo = C(lim[2]), hi = C(lim[3]);
        const inner = compileReal(a[0], { ...opts, varSet: new Set([...varSet, k]) });
        const isSum = h === 'Sum';
        return (env) => {
          const L = lo(env), H = hi(env);
          if (!isInt(L) || !isInt(H) || H - L > 100000) return NaN;
          const e2 = { ...env };
          let s = isSum ? 0 : 1;
          for (let j = Math.round(L); j <= Math.round(H); j++) { e2[k] = j; const v = inner(e2); s = isSum ? s + v : s * v; }
          return s;
        };
      }
      case 'PlusMinus': case 'Tuple': case 'Set': return () => NaN;
      default:
        return ceFallback(n);
    }
  };
  const g = C(ast);
  return (env) => { const v = g(env); return Number.isFinite(v) ? v : NaN; };
}

// ---- complex mode -------------------------------------------------------------

const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return d === 0 ? [NaN, NaN] : [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cexp = (a) => { const m = Math.exp(a[0]); return [m * Math.cos(a[1]), m * Math.sin(a[1])]; };
const clog = (a) => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])];
const cpow = (a, b) => {
  if (b[1] === 0 && Number.isInteger(b[0]) && Math.abs(b[0]) <= 64) {
    let r = [1, 0]; const n = Math.abs(b[0]);
    for (let k = 0; k < n; k++) r = cmul(r, a);
    return b[0] < 0 ? cdiv([1, 0], r) : r;
  }
  if (a[0] === 0 && a[1] === 0) return [0, 0];
  return cexp(cmul(b, clog(a)));
};
const csin = (a) => [Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1])];
const ccos = (a) => [Math.cos(a[0]) * Math.cosh(a[1]), -Math.sin(a[0]) * Math.sinh(a[1])];

export function compileComplex(ast, opts = {}) {
  const deg = opts.deg ? Math.PI / 180 : 1;
  const varSet = opts.varSet || new Set();
  const real = (n) => { const g = compileReal(n, opts); return (env) => [g(env), 0]; };
  const C = (n) => {
    if (typeof n === 'number') return () => [n, 0];
    if (typeof n === 'string') {
      if (n === 'i' && !varSet.has('i')) return () => [0, 1];
      return real(n);
    }
    const [h, ...a] = n;
    const fs = a.map((x) => C(x));
    switch (h) {
      case 'Add': return (env) => fs.reduce((s, g) => cadd(s, g(env)), [0, 0]);
      case 'Multiply': return (env) => fs.reduce((s, g) => cmul(s, g(env)), [1, 0]);
      case 'Negate': return (env) => { const v = fs[0](env); return [-v[0], -v[1]]; };
      case 'Divide': return (env) => cdiv(fs[0](env), fs[1](env));
      case 'Power': return (env) => cpow(fs[0](env), fs[1](env));
      case 'Sqrt': return (env) => cpow(fs[0](env), [0.5, 0]);
      case 'Sin': return (env) => { const v = fs[0](env); return csin([v[0] * deg, v[1] * deg]); };
      case 'Cos': return (env) => { const v = fs[0](env); return ccos([v[0] * deg, v[1] * deg]); };
      case 'Ln': return (env) => clog(fs[0](env));
      case 'Abs': return (env) => { const v = fs[0](env); return [Math.hypot(v[0], v[1]), 0]; };
      case 'Arg': return (env) => { const v = fs[0](env); return [Math.atan2(v[1], v[0]), 0]; };
      case 'Conjugate': return (env) => { const v = fs[0](env); return [v[0], -v[1]]; };
      case 'Real': return (env) => [fs[0](env)[0], 0];
      case 'Imaginary': return (env) => [fs[0](env)[1], 0];
      default: {
        // real-only function: fine as long as every argument is real
        const r = compileReal([h, ...a.map((_, k) => `#a${k}`)], { ...opts, varSet: new Set([...varSet, ...a.map((_, k) => `#a${k}`)]) });
        return (env) => {
          const e2 = { ...env };
          for (let k = 0; k < fs.length; k++) { const v = fs[k](env); if (Math.abs(v[1]) > 1e-12) return [NaN, NaN]; e2[`#a${k}`] = v[0]; }
          return [r(e2), 0];
        };
      }
    }
  };
  const g = C(ast);
  return (env) => { const v = g(env); return Number.isFinite(v[0]) && Number.isFinite(v[1]) ? v : [NaN, NaN]; };
}
