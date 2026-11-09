/**
 * One-variable solution sets, numerically: a relation line (=, <, <=, ...,
 * chains like a < x <= b, and \lor-joined parts) becomes a set of intervals
 * over a window, found by scanning a grid, bisecting sign changes / truth
 * boundaries, golden-section refining touch-roots ((x-2)^2 = 0), and
 * snapping endpoints to nice values (2, 1/3, pi/2, sqrt 2).
 *
 * Interval set = sorted array of { lo, hi, loC, hiC } (a point is lo === hi,
 * both closed). Also parses interval notation for check.interval().
 */
import { snap, close, inDomain } from './sample.js';

const DENSE = 20;          // dense grid on [-DENSE, DENSE]
const STEP = 0.02;
const FAR = 1e4;

function buildGrid(win) {
  const xs = [];
  const n = Math.round(DENSE / STEP);
  if (win > DENSE) {
    for (let x = win; x > DENSE * 1.01; x /= 1.02) xs.push(-x);
    xs.reverse();
  }
  for (let i = -n; i <= n; i++) xs.push(i / 50);
  if (win > DENSE) {
    const tail = [];
    for (let x = win; x > DENSE * 1.01; x /= 1.02) tail.push(x);
    xs.push(...tail.reverse());
  }
  return xs.filter((x) => x >= -win && x <= win);
}
const GRIDS = new Map();
function grid(win) { if (!GRIDS.has(win)) GRIDS.set(win, buildGrid(win)); return GRIDS.get(win); }

export function windowFor(hasTrig) { return hasTrig ? DENSE : FAR; }

const tolEq = (g, scale) => Math.abs(g) <= 1e-9 * Math.max(1, scale);

/**
 * `atoms` = [{ op, l: env=>number, r: env=>number }] combined by `mode`:
 * 'and' (a chain) or 'or'. Returns predicate + residual functions for x.
 */
/** Does relation atom { op, l, r } hold at env? (undefined sides -> false) */
export function atomHolds(a, env) {
  const l = a.l(env), r = a.r(env);
  if (Number.isNaN(l) || Number.isNaN(r)) return false;
  const g = l - r; const sc = Math.abs(l) + Math.abs(r);
  switch (a.op) {
    case '=': return tolEq(g, sc);
    case '!=': return !tolEq(g, sc);
    case '<': return g < 0 && !tolEq(g, sc);
    case '>': return g > 0 && !tolEq(g, sc);
    case '<=': return g < 0 || tolEq(g, sc);
    case '>=': return g > 0 || tolEq(g, sc);
    default: return false;
  }
}

/** groups: array (OR) of arrays (AND) of atoms. */
export function holds(groups, env) { return groups.some((grp) => grp.every((a) => atomHolds(a, env))); }

function makeLineFns(groups, v, fixed) {
  const env = { ...fixed };
  const atomSat = (a, x) => { env[v] = x; return atomHolds(a, env); };
  const sat = (x) => groups.some((grp) => grp.every((a) => atomSat(a, x)));
  const residuals = [];
  for (const grp of groups) for (const a of grp) {
    if (a.op === '=' || a.op === '<=' || a.op === '>=' || a.op === '!=') {
      residuals.push((x) => { env[v] = x; const l = a.l(env), r = a.r(env); return { g: l - r, sc: Math.abs(l) + Math.abs(r) }; });
    }
  }
  return { sat, residuals };
}

function bisectBoundary(sat, xOut, xIn) {
  // sat(xIn) true, sat(xOut) false
  for (let k = 0; k < 60; k++) {
    const m = (xOut + xIn) / 2;
    if (m === xOut || m === xIn) break;
    if (sat(m)) xIn = m; else xOut = m;
  }
  return (xOut + xIn) / 2;
}

function bisectRoot(res, a, b, ga) {
  for (let k = 0; k < 80; k++) {
    const m = (a + b) / 2;
    if (m === a || m === b) break;
    const gm = res(m).g;
    if (Number.isNaN(gm)) return NaN;
    if (gm === 0) return m;
    if ((gm < 0) === (ga < 0)) { a = m; ga = gm; } else b = m;
  }
  return (a + b) / 2;
}

function goldenMin(f, a, b) {
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = b - phi * (b - a), d = a + phi * (b - a);
  let fc = f(c), fd = f(d);
  for (let k = 0; k < 80; k++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

/**
 * Solves for `v` with other vars fixed. `line` atoms come from index.js.
 * domain: sampling domain of v (intervals clipped, integer -> points only).
 */
export function solveGroups(groups, v, fixed, win, domain) {
  const { sat, residuals } = makeLineFns(groups, v, fixed);
  const okD = (x) => inDomain(domain, x);
  const S = (x) => okD(x) && sat(x);
  if (domain && domain.integer) {
    const pts = [];
    const lo = Math.max(-200, Math.ceil(domain.lo)), hi = Math.min(200, Math.floor(domain.hi));
    for (let x = lo; x <= hi; x++) if (S(x)) pts.push({ lo: x, hi: x, loC: true, hiC: true });
    return normalize(pts);
  }
  const xs = grid(win);
  const flags = xs.map(S);
  const out = [];
  // runs of truth
  let i = 0;
  while (i < xs.length) {
    if (!flags[i]) { i++; continue; }
    let j = i;
    while (j + 1 < xs.length && flags[j + 1]) j++;
    let lo = i === 0 ? -Infinity : snap(bisectBoundary(S, xs[i - 1], xs[i]));
    let hi = j === xs.length - 1 ? Infinity : snap(bisectBoundary(S, xs[j + 1], xs[j]));
    if (i === 0 && win < FAR) lo = xs[0];
    if (j === xs.length - 1 && win < FAR) hi = xs[xs.length - 1];
    const loC = Number.isFinite(lo) && S(lo);
    const hiC = Number.isFinite(hi) && S(hi);
    // a sliver (equality tolerance around a touch root) is really one point
    if (hi - lo < 1e-3) {
      const m = snap((lo + hi) / 2, 1e-4);
      if (S(m)) out.push({ lo: m, hi: m, loC: true, hiC: true });
      else if (S(lo)) out.push({ lo, hi: lo, loC: true, hiC: true });
    }
    else out.push({ lo, hi, loC, hiC });
    i = j + 1;
  }
  // isolated roots of residuals (equations, touch points)
  for (const res of residuals) {
    let prev = null;
    const vals = xs.map((x) => res(x));
    for (let k = 0; k < xs.length; k++) {
      const { g } = vals[k];
      if (Number.isNaN(g)) { prev = null; continue; }
      if (g === 0) { pushPoint(out, xs[k], S); prev = k; continue; }
      if (prev !== null && vals[prev].g !== 0 && (vals[prev].g < 0) !== (g < 0)) {
        const r = bisectRoot(res, xs[prev], xs[k], vals[prev].g);
        if (Number.isFinite(r)) {
          const rs = snap(r); const rv = res(rs);
          if (tolEq(rv.g, rv.sc) || tolEq(res(r).g, res(r).sc)) pushPoint(out, tolEq(rv.g, rv.sc) ? rs : r, S);
        }
      }
      // touch root: local min of |g| with same-sign neighbours
      if (k > 0 && k < xs.length - 1) {
        const a = vals[k - 1].g, c = vals[k + 1].g;
        if (!Number.isNaN(a) && !Number.isNaN(c) && (a < 0) === (g < 0) && (c < 0) === (g < 0)
          && Math.abs(g) <= Math.abs(a) && Math.abs(g) <= Math.abs(c)) {
          const m = goldenMin((x) => { const r = res(x).g; return Number.isNaN(r) ? Infinity : Math.abs(r); }, xs[k - 1], xs[k + 1]);
          const ms = snap(m, 1e-5); const rv = res(ms);
          if (tolEq(rv.g, rv.sc)) pushPoint(out, ms, S);
        }
      }
      prev = k;
    }
  }
  return normalize(out);
}

function pushPoint(out, x, S) { if (S(x)) out.push({ lo: x, hi: x, loC: true, hiC: true }); }

const near = (a, b) => a === b || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a)));

export function normalize(set) {
  const s = set.filter((I) => I.lo <= I.hi).map((I) => ({ ...I })).sort((A, B) => A.lo - B.lo);
  const out = [];
  for (const I of s) {
    const L = out[out.length - 1];
    const touch = L && near(I.lo, L.hi);
    if (!L || (!touch && I.lo > L.hi) || (touch && !L.hiC && !I.loC)) { out.push(I); continue; }
    if (near(I.lo, L.lo)) L.loC = L.loC || I.loC;
    if (near(I.hi, L.hi)) L.hiC = L.hiC || I.hiC;
    else if (I.hi > L.hi) { L.hi = I.hi; L.hiC = I.hiC; }
  }
  return out;
}

export function contains(set, x) {
  for (const I of set) {
    if (near(x, I.lo)) { if (I.loC) return true; if (I.lo === I.hi) continue; if (x > I.lo && x < I.hi) return true; continue; }
    if (near(x, I.hi)) { if (I.hiC) return true; continue; }
    if (x > I.lo && x < I.hi) return true;
  }
  return false;
}

export function sameSet(A, B) {
  if (A.length !== B.length) return false;
  for (let k = 0; k < A.length; k++) {
    const a = A[k], b = B[k];
    if (!near(a.lo, b.lo) || !near(a.hi, b.hi)) return false;
    if (Number.isFinite(a.lo) && a.loC !== b.loC) return false;
    if (Number.isFinite(a.hi) && a.hiC !== b.hiC) return false;
  }
  return true;
}

const NICE = [1, 2, -1, 3, 0, -2, 4, 5, -3, 0.5, -0.5, 1.5, 6, -4, 10, -10];

/** A friendly x in exactly one of A, B (or null). */
export function witness(A, B, win = Infinity) {
  const ends = [];
  for (const I of [...A, ...B]) { ends.push(I.lo, I.hi); }
  const fin = [...new Set(ends.filter(Number.isFinite))].sort((a, b) => a - b);
  const cands = [...NICE];
  for (const e of fin) cands.push(e, Math.round(e) + 1, Math.round(e) - 1);
  for (let k = 0; k + 1 < fin.length; k++) cands.push((fin[k] + fin[k + 1]) / 2);
  if (fin.length) cands.push(fin[0] - 1, fin[fin.length - 1] + 1);
  cands.push(100, -100, 1e3, -1e3);
  for (const x of cands) {
    if (Math.abs(x) > win) continue;
    if (contains(A, x) !== contains(B, x)) return x;
  }
  return null;
}

export function isSubset(A, B, win = Infinity) {
  // every interval of A inside B: test endpoints and midpoints
  for (const I of A) {
    const pts = [];
    if (I.lo === I.hi) pts.push(I.lo);
    else {
      const lo = Number.isFinite(I.lo) ? I.lo : Math.min(-win, I.hi - 1e6);
      const hi = Number.isFinite(I.hi) ? I.hi : Math.max(win, I.lo + 1e6);
      for (let t = 1; t < 16; t++) pts.push(lo + ((hi - lo) * t) / 16);
      if (I.loC) pts.push(I.lo);
      if (I.hiC) pts.push(I.hi);
    }
    for (const x of pts) if (Number.isFinite(x) && !contains(B, x)) return false;
  }
  return true;
}

// ---- interval notation -----------------------------------------------------------

/**
 * "(-\\infty,-2)\\cup[3,\\infty)", "\\mathbb{R}", "\\emptyset", "\\{1, 2\\}",
 * "\\mathbb{R}\\setminus\\{2\\}". Returns a set, or null if not interval notation.
 */
export function parseIntervalNotation(latex, evalConst) {
  let s = String(latex).replace(/\\left|\\right|\\,|\\;|\\!|\s+/g, '');
  s = s.replace(/^[a-zA-Z]\\in/, '');
  s = s.replace(/\u222a/g, '\\cup').replace(/\u2205/g, '\\emptyset');
  let minus = null;
  const sm = s.split(/\\setminus|\\backslash/);
  if (sm.length === 2) { s = sm[0]; minus = sm[1]; }
  const pieces = s.split(/\\cup|(?<=[\)\]])U(?=[\(\[])/);
  const out = [];
  for (const p of pieces) {
    let m;
    if (/^(\\mathbb\{R\}|\\R|R)$/.test(p)) out.push({ lo: -Infinity, hi: Infinity, loC: false, hiC: false });
    else if (/^(\\emptyset|\\varnothing|\\\{\\\}|\{\})$/.test(p)) { /* empty */ }
    else if ((m = p.match(/^\\\{(.*)\\\}$/))) {
      for (const v of m[1].split(',')) { const x = evalConst(v); if (!Number.isFinite(x)) return null; out.push({ lo: x, hi: x, loC: true, hiC: true }); }
    } else if ((m = p.match(/^([\(\[])(.+),(.+)([\)\]])$/))) {
      const lo = evalConst(m[2]), hi = evalConst(m[3]);
      if (Number.isNaN(lo) || Number.isNaN(hi) || lo > hi) return null;
      out.push({ lo, hi, loC: m[1] === '[' && Number.isFinite(lo), hiC: m[4] === ']' && Number.isFinite(hi) });
    } else return null;
  }
  let set = normalize(out);
  if (minus) {
    const mm = minus.match(/^\\\{(.*)\\\}$/);
    if (!mm) return null;
    for (const v of mm[1].split(',')) {
      const x = evalConst(v);
      if (!Number.isFinite(x)) return null;
      set = set.flatMap((I) => {
        if (!contains([I], x)) return [I];
        const r = [];
        if (x > I.lo || (I.loC && !near(x, I.lo))) r.push({ ...I, hi: x, hiC: false });
        if (x < I.hi) r.push({ ...I, lo: x, loC: false });
        return r.filter((J) => J.lo < J.hi || (J.loC && J.hiC));
      });
    }
  }
  return normalize(set);
}

export function setToLatex(set) {
  if (!set.length) return '\\emptyset';
  const f = (x) => (x === Infinity ? '\\infty' : x === -Infinity ? '-\\infty' : String(Number(x.toPrecision(6))));
  return set.map((I) => (I.lo === I.hi ? `\\{${f(I.lo)}\\}` : `${I.loC ? '[' : '('}${f(I.lo)},${f(I.hi)}${I.hiC ? ']' : ')'}`)).join('\\cup ');
}

export { close };
