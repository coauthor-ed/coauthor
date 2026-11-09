/**
 * Sample points for value-substitution checks, number formatting and
 * snapping for student-facing feedback.
 *
 * Points come in a deliberate order so the *first* counterexample found is a
 * friendly one: small integers (1, 2, -1, 3, 0, ...), then simple fractions,
 * then seeded-random reals (PRNG, never crypto - the app runs over plain
 * HTTP), then larger integers (so integer-only expressions such as n! still
 * get enough valid points). Every check walks the whole list, so a later
 * random point still catches what integers alone would miss (sin(pi x)).
 */
import { PRNG } from '../PRNG.js';

const NICE_INTS = [1, 2, -1, 3, 0, -2, 4, 5, -3];
const NICE_FRACS = [0.5, 1.5, -0.5, 2.5, 1 / 3, -1.5];
const EXTRA_INTS = [6, 7, 8, 9, 10, -4, -5, 11, 12, -6, 13, 15];
const N_RANDOM = 8;

/** A domain is { lo, hi, loC, hiC, integer, nonzero }. */
export const REALS = Object.freeze({ lo: -Infinity, hi: Infinity, loC: false, hiC: false, integer: false, nonzero: false });

export function inDomain(d, x) {
  if (!d) return true;
  if (d.integer && !Number.isInteger(x)) return false;
  if (d.nonzero && x === 0) return false;
  if (x < d.lo || (x === d.lo && !d.loC)) return false;
  if (x > d.hi || (x === d.hi && !d.hiC)) return false;
  return true;
}

/**
 * Parses an `assume` spec: '>0', '>= 1', '!=0', 'integer', 'natural',
 * 'positive', 'negative', 'nonzero', '(0, \\pi)' / '[0, 2\\pi]', or several
 * joined with ' and ' / '&', or an array of those. `evalConst(latex)` turns
 * bound expressions into numbers.
 */
export function parseDomain(spec, evalConst) {
  const d = { ...REALS };
  if (spec == null || spec === '') return d;
  const parts = Array.isArray(spec) ? spec : String(spec).split(/\s+and\s+|\s*&\s*/);
  const tighten = (lo, loC, hi, hiC) => {
    if (lo > d.lo || (lo === d.lo && !loC)) { d.lo = lo; d.loC = loC; }
    if (hi < d.hi || (hi === d.hi && !hiC)) { d.hi = hi; d.hiC = hiC; }
  };
  for (let p of parts) {
    p = String(p).trim();
    const low = p.toLowerCase();
    let m;
    if (/^(integer|int|integers|z|\\mathbb\{z\})$/.test(low)) d.integer = true;
    else if (/^(natural|positive integer|n|\\mathbb\{n\})$/.test(low)) { d.integer = true; tighten(1, true, Infinity, false); }
    else if (/^(whole|non-?negative integer)$/.test(low)) { d.integer = true; tighten(0, true, Infinity, false); }
    else if (low === 'positive') tighten(0, false, Infinity, false);
    else if (low === 'negative') tighten(-Infinity, false, 0, false);
    else if (low === 'nonzero' || low === 'non-zero') d.nonzero = true;
    else if (low === 'real' || low === 'r') { /* no-op */ }
    else if ((m = p.match(/^([\(\[])\s*(.+?)\s*,\s*(.+?)\s*([\)\]])$/))) {
      tighten(evalConst(m[2]), m[1] === '[', evalConst(m[3]), m[4] === ']');
    } else if ((m = p.match(/^(>=|<=|!=|=\/=|>|<|\\geq?|\\leq?|\\neq?|\\gt|\\lt)\s*(.+)$/))) {
      const op = m[1].replace(/\\geq?/, '>=').replace(/\\leq?/, '<=').replace(/\\neq?|=\/=/, '!=').replace('\\gt', '>').replace('\\lt', '<');
      const v = evalConst(m[2]);
      if (op === '>') tighten(v, false, Infinity, false);
      else if (op === '>=') tighten(v, true, Infinity, false);
      else if (op === '<') tighten(-Infinity, false, v, false);
      else if (op === '<=') tighten(-Infinity, false, v, true);
      else if (op === '!=' && v === 0) d.nonzero = true;
    }
  }
  return d;
}

/** Ordered candidate values for one variable inside its domain. */
export function candidates(d, prng) {
  const out = [];
  const push = (x) => { if (inDomain(d, x) && !out.includes(x)) out.push(x); };
  NICE_INTS.forEach(push);
  if (!d.integer) NICE_FRACS.forEach(push);
  const lo = Number.isFinite(d.lo) ? d.lo : (Number.isFinite(d.hi) ? d.hi - 6 : -5);
  const hi = Number.isFinite(d.hi) ? d.hi : lo + (Number.isFinite(d.lo) ? 6 : 10);
  if (!d.integer && Number.isFinite(d.lo) && Number.isFinite(d.hi)) {
    for (const t of [0.5, 0.25, 0.75, 0.125, 0.875]) push(d.lo + t * (d.hi - d.lo));
  }
  for (let k = 0; k < N_RANDOM * 3 && out.length < 40; k++) {
    let x = lo + prng.next() * (hi - lo);
    if (d.integer) x = Math.round(x);
    push(x);
    if (k >= N_RANDOM && out.length >= 24) break;
  }
  EXTRA_INTS.forEach(push);
  if (d.integer) for (let k = 16; k <= 40; k++) push(k);
  return out;
}

/**
 * Sample points for `vars`. Each var gets its own candidate list; var j is
 * offset by 2j so two variables are not always equal (x = y hides x - y).
 */
export function samplePoints(vars, domains, seed = 7) {
  const prng = new PRNG(seed >>> 0);
  if (!vars.length) return [{}];
  const lists = vars.map((v) => candidates(domains[v] || REALS, prng));
  const n = Math.max(...lists.map((l) => l.length));
  const pts = [];
  for (let k = 0; k < n; k++) {
    const p = {};
    vars.forEach((v, j) => { const L = lists[j]; p[v] = L[(k + 2 * j) % L.length]; });
    pts.push(p);
  }
  return pts;
}

export function close(a, b, rel = 1e-9, abs = 1e-12) {
  if (a === b) return true;
  return Math.abs(a - b) <= abs + rel * Math.max(Math.abs(a), Math.abs(b));
}

// ---- snapping / formatting -------------------------------------------------------

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }
export { gcd };

/** Nearby "nice" value (integer, p/q with q <= 12, multiple of pi/12, sqrt(n)). */
export function snap(x, tol = 1e-7) {
  if (!Number.isFinite(x)) return x;
  const t = tol * Math.max(1, Math.abs(x));
  const r = Math.round(x);
  if (Math.abs(x - r) < t) return r;
  for (let q = 2; q <= 12; q++) { const p = Math.round(x * q); if (Math.abs(x - p / q) < t) return p / q; }
  const k = Math.round((x * 12) / Math.PI); if (k && Math.abs(x - (k * Math.PI) / 12) < t) return (k * Math.PI) / 12;
  const s = Math.round(x * x);
  if (s > 1 && s < 400 && Math.abs(Math.abs(x) - Math.sqrt(s)) < t) return Math.sign(x) * Math.sqrt(s);
  return x;
}

/** Number for a student: 2, -1/2, 0.707 (no long float tails). */
export function fmt(x) {
  if (typeof x !== 'number') return String(x);
  if (Number.isNaN(x)) return 'undefined';
  if (x === Infinity) return 'infinity';
  if (x === -Infinity) return '-infinity';
  const r = Math.round(x);
  if (Math.abs(x - r) < 1e-9 * Math.max(1, Math.abs(x))) return String(r);
  for (let q = 2; q <= 12; q++) {
    const p = Math.round(x * q);
    if (Math.abs(x - p / q) < 1e-9) return `${p}/${q}`;
  }
  return String(Number(x.toPrecision(4)));
}

export function fmtPoint(point) {
  return Object.entries(point).map(([k, v]) => `${k} = ${fmt(v)}`).join(' and ');
}
