/**
 * LaTeX -> line objects for the math core.
 *
 * A "line" is what a student types on one row of a workspace:
 *   { kind: 'expr', expr }                         - a plain expression
 *   { kind: 'rel',  sides: [expr...], ops: [...] } - a = b, a < b <= c, ...
 *   { kind: 'or',   parts: [rel...] }              - x = 2 \lor x = 3
 *   { kind: 'error', error }                       - could not read it
 * where `expr` = { ast, vars: string[] }, `ast` being a small, normalised
 * MathJSON subset (Add/Multiply/Negate/Divide/Power/Sqrt/Root/function heads,
 * numbers, symbol strings).
 *
 * We split relations and \lor ourselves and only hand single expressions to
 * ComputeEngine's *non-canonical* parser: canonical form already simplifies
 * (6/8 -> 3/4, sqrt(12) -> 2 sqrt(3)), which would make form() checks
 * meaningless, and its relation parser mangles "x=2 \lor x=3".
 * Subscripts (x_1, T_n) are rewritten to single \mathrm{} symbols first, the
 * same lesson as normalizeLatexSubscripts() in semanticSimilarityEvaluator.js
 * (CE otherwise reads them as indexing into a list).
 */

let _ce = null;
export function setEngine(ce) { _ce = ce; }
export function getEngine() { return _ce; }

const REL_CMDS = {
  '=': '=', '<': '<', '>': '>',
  '\\le': '<=', '\\leq': '<=', '\\leqslant': '<=', '\\lt': '<',
  '\\ge': '>=', '\\geq': '>=', '\\geqslant': '>=', '\\gt': '>',
  '\\ne': '!=', '\\neq': '!=',
};
const OR_CMDS = new Set(['\\lor', '\\vee', '\\or']);
const OPEN = new Set(['{', '(', '[', '\\{', '\\lbrace']);
const CLOSE = new Set(['}', ')', ']', '\\}', '\\rbrace']);

export class MathParseError extends Error {}
const perr = (m) => new MathParseError(m);

function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\\') {
      let j = i + 1;
      if (/[a-zA-Z]/.test(s[j] || '')) { while (j < s.length && /[a-zA-Z]/.test(s[j])) j++; }
      else j++;
      out.push({ t: s.slice(i, j), i, j });
      i = j;
    } else { out.push({ t: s[i], i, j: i + 1 }); i++; }
  }
  return out;
}

/** Splits `s` at depth-0 tokens matching `isSep`; returns { parts, seps }. */
function splitTop(s, isSep) {
  const toks = tokenize(s);
  const parts = []; const seps = [];
  let depth = 0; let start = 0;
  for (const tk of toks) {
    if (OPEN.has(tk.t)) depth++;
    else if (CLOSE.has(tk.t)) depth--;
    else if (depth === 0 && isSep(tk.t)) {
      parts.push(s.slice(start, tk.i)); seps.push(tk.t); start = tk.j;
    }
  }
  parts.push(s.slice(start));
  return { parts, seps };
}

/** Reads one TeX argument (a {group} or a single token) starting at i. */
function readArg(s, i) {
  while (s[i] === ' ') i++;
  if (s[i] === '{') {
    let d = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '{') d++;
      else if (s[j] === '}') { d--; if (d === 0) return { arg: s.slice(i + 1, j), end: j + 1 }; }
    }
    throw perr('unbalanced braces');
  }
  if (s[i] === '\\') { let j = i + 1; while (/[a-zA-Z]/.test(s[j] || '')) j++; return { arg: s.slice(i, j), end: j }; }
  if (i >= s.length) throw perr('missing argument');
  return { arg: s[i], end: i + 1 };
}

const binomOf = (a, b) => `\\operatorname{binom}(${a},${b})`;

function rewriteBinom(s) {
  // \binom{n}{r}
  let k;
  while ((k = s.indexOf('\\binom')) >= 0) {
    const a = readArg(s, k + 6); const b = readArg(s, a.end);
    s = s.slice(0, k) + binomOf(a.arg, b.arg) + s.slice(b.end);
  }
  // {n \choose r}
  s = s.replace(/\{([^{}]*)\\choose([^{}]*)\}/g, (_, a, b) => binomOf(a.trim(), b.trim()));
  // {}^{n}C_{r}, ^nC_r, {}^nC_{r}
  s = s.replace(/(?:\{\s*\})?\^\s*(\{[^{}]*\}|[0-9a-zA-Z])\s*(?:\\mathrm\{C\}|C)\s*_\s*(\{[^{}]*\}|[0-9a-zA-Z])/g,
    (_, a, b) => binomOf(a.replace(/[{}]/g, ''), b.replace(/[{}]/g, '')));
  // 5C2 (plain digits)
  s = s.replace(/(^|[^0-9a-zA-Z\\])([0-9]+)C([0-9]+)/g, (_, p, a, b) => p + binomOf(a, b));
  return s;
}

export function preprocess(latex) {
  let s = String(latex ?? '').trim();
  s = s.replace(/\u2264/g, '\\le ').replace(/\u2265/g, '\\ge ').replace(/\u2260/g, '\\ne ')
    .replace(/\u2212/g, '-').replace(/\u00d7/g, '\\times ').replace(/\u00f7/g, '\\div ')
    .replace(/\u03c0/g, '\\pi ').replace(/\u03b8/g, '\\theta ').replace(/\u221e/g, '\\infty ')
    .replace(/\u222a/g, '\\cup ').replace(/\u221a/g, '\\sqrt ')
    .replace(/\u00b2/g, '^2').replace(/\u00b3/g, '^3');
  s = s.replace(/\\[dt]frac/g, '\\frac').replace(/\\[dt]binom/g, '\\binom');
  s = s.replace(/\\displaystyle|\\limits/g, '');
  s = s.replace(/\\[,;:! ]|\\quad|\\qquad|~/g, ' ');
  s = s.replace(/\\(?:text|textrm|mathrm|operatorname)\s*\{\s*or\s*\}/g, ' \\lor ');
  s = s.replace(/(^|[^\\a-zA-Z])or(?![a-zA-Z])/g, '$1 \\lor ');
  s = s.replace(/\\(?:operatorname|mathrm)\s*\{\s*cosec\s*\}|\\cosec(?![a-zA-Z])/g, '\\csc ');
  s = s.replace(/\\(?:operatorname|mathrm)\s*\{\s*(sin|cos|tan|cot|sec|csc|ln|log|exp)\s*\}/g, '\\$1 ');
  s = s.replace(/<=/g, '\\le ').replace(/>=/g, '\\ge ').replace(/!=/g, '\\ne ');
  s = rewriteBinom(s);
  // x_1, x_{12}, T_n, a_{n} -> one symbol (but not \log_2, \sum_{...})
  s = s.replace(/(?<![A-Za-z\\])([A-Za-z])_\{([A-Za-z0-9]+)\}/g, '\\mathrm{$1$2}')
    .replace(/(?<![A-Za-z\\])([A-Za-z])_([A-Za-z0-9])/g, '\\mathrm{$1$2}');
  return s.trim();
}

// ---- MathJSON normalisation ------------------------------------------------

const SYM_MAP = {
  ExponentialE: 'e', ImaginaryUnit: 'i', C_upright: 'C', Half: ['Divide', 1, 2],
};
const INVERSE = { Sin: 'Arcsin', Cos: 'Arccos', Tan: 'Arctan', Cot: 'Arccot', Sec: 'Arcsec', Csc: 'Arccsc',
  Sinh: 'Arsinh', Cosh: 'Arcosh', Tanh: 'Artanh' };
// symbols that act as a function when followed by a bracket, in juxtaposition
const APPLY_SYMS = { binom: 'Binomial', Exp: 'Exp', exp: 'Exp', Gamma: 'Gamma', cosec: 'Csc', sgn: 'Sign', cis: 'Cis' };

function normInvisible(args) {
  const items = args.filter((x) => !(Array.isArray(x) && x[0] === 'HorizontalSpacing')).map(norm);
  const out = [];
  for (let k = 0; k < items.length; k++) {
    const it = items[k]; const nx = items[k + 1];
    if (typeof it === 'string' && APPLY_SYMS[it] && nx !== undefined) {
      const head = APPLY_SYMS[it];
      const fargs = Array.isArray(nx) && nx[0] === 'Tuple' ? nx.slice(1) : [nx];
      if (head === 'Binomial' && fargs.length !== 2) throw perr('binom needs two numbers');
      if (head === 'Exp') out.push(['Power', 'e', fargs[0]]);
      else if (head === 'Cis') out.push(['Add', ['Cos', fargs[0]], ['Multiply', 'i', ['Sin', fargs[0]]]]);
      else out.push([head, ...fargs]);
      k++;
      continue;
    }
    if (it === 'C' && Array.isArray(nx) && nx[0] === 'Tuple' && nx.length === 3) {
      out.push(['Binomial', nx[1], nx[2]]); k++; continue;
    }
    out.push(it);
  }
  if (out.some((x) => Array.isArray(x) && x[0] === 'Tuple')) throw perr('unexpected list');
  return out.length === 1 ? out[0] : ['Multiply', ...out];
}

export function norm(j) {
  if (typeof j === 'number') return j;
  if (typeof j === 'string') {
    if (j.startsWith("'")) throw perr('unexpected text');
    if (j === 'Nothing') throw perr('empty box');
    return SYM_MAP[j] ?? j;
  }
  if (!Array.isArray(j)) {
    if (j && j.num !== undefined) {
      const v = parseFloat(String(j.num).replace(/[^0-9eE.+\-]/g, ''));
      if (!Number.isFinite(v)) throw perr('bad number');
      return v;
    }
    if (j && j.sym) return norm(j.sym);
    if (j && j.fn) return norm(j.fn);
    throw perr('bad node');
  }
  const [h, ...a] = j;
  switch (h) {
    case 'Error': throw perr('syntax');
    case 'Delimiter':
      if (a[0] === undefined) throw perr('empty brackets');
      return norm(a[0]);
    case 'Sequence':
      if (a.length === 0) throw perr('empty');
      return a.length === 1 ? norm(a[0]) : ['Tuple', ...a.map(norm)];
    case 'Subtract': return ['Add', norm(a[0]), ['Negate', norm(a[1])]];
    case 'InvisibleOperator': return normInvisible(a);
    case 'Apply': {
      const f = a[0];
      if (Array.isArray(f) && f[0] === 'InverseFunction' && INVERSE[f[1]]) return [INVERSE[f[1]], norm(a[1])];
      throw perr('unknown function');
    }
    case 'Rational': return ['Divide', norm(a[0]), norm(a[1])];
    case 'Square': return ['Power', norm(a[0]), 2];
    case 'Lb': return ['Log', norm(a[0]), 2];
    case 'Lg': return ['Log', norm(a[0]), 10];
    case 'Exp': return ['Power', 'e', norm(a[0])];
    case 'Complex': return ['Add', norm(a[0]), ['Multiply', norm(a[1]), 'i']];
    case 'Hold': return norm(a[0]);
    case 'Prime': throw perr('derivative notation not supported');
    default: return [h, ...a.map(norm)];
  }
}

// ---- free variables -----------------------------------------------------------

export const CONSTS = new Set(['Pi', 'e', 'i', 'PositiveInfinity', 'NegativeInfinity', 'ComplexInfinity', 'NaN']);

export function freeVars(ast, bound = new Set(), out = new Set()) {
  if (typeof ast === 'string') {
    if (!CONSTS.has(ast) && !bound.has(ast)) out.add(ast);
    if ((ast === 'i' || ast === 'e') && !bound.has(ast)) out.add('#' + ast); // marker: uses i / e
    return out;
  }
  if (!Array.isArray(ast)) return out;
  const [h, ...a] = ast;
  if ((h === 'Sum' || h === 'Product') && Array.isArray(a[1]) && a[1][0] === 'Tuple') {
    const [, k, lo, hi] = a[1];
    freeVars(lo, bound, out); freeVars(hi, bound, out);
    const nb = new Set(bound); nb.add(k);
    freeVars(a[0], nb, out);
    return out;
  }
  for (const x of a) freeVars(x, bound, out);
  return out;
}

export function hasHead(ast, heads) {
  if (!Array.isArray(ast)) return false;
  if (heads.has(ast[0])) return true;
  for (let k = 1; k < ast.length; k++) if (hasHead(ast[k], heads)) return true;
  return false;
}

/** Expands every PlusMinus into both signs (cap 8 variants). */
export function expandPM(ast) {
  if (!Array.isArray(ast)) return [ast];
  const [h, ...a] = ast;
  if (h === 'PlusMinus') {
    if (a.length === 1) return expandPM(a[0]).flatMap((x) => [x, ['Negate', x]]);
    const L = expandPM(a[0]); const R = expandPM(a[1]);
    const out = [];
    for (const l of L) for (const r of R) out.push(['Add', l, r], ['Add', l, ['Negate', r]]);
    return out.slice(0, 8);
  }
  let combos = [[]];
  for (const x of a) {
    const xs = expandPM(x);
    const next = [];
    for (const c of combos) for (const v of xs) next.push([...c, v]);
    combos = next.slice(0, 8);
  }
  return combos.map((c) => [h, ...c]);
}

// ---- parsing ----------------------------------------------------------------

function makeExpr(ast) {
  const fv = freeVars(ast);
  return {
    ast,
    vars: [...fv].filter((v) => !v.startsWith('#')).sort(),
    usesI: fv.has('#i'),
    usesE: fv.has('#e'),
    _fns: new Map(),
  };
}

export function parseExprString(str) {
  if (!_ce) throw new Error('math core not loaded: await loadMath() first');
  const s = str.trim();
  if (!s) throw perr('empty');
  const boxed = _ce.parse(s, { canonical: false });
  return makeExpr(norm(boxed.json));
}

export function exprFromAst(ast) { return makeExpr(ast); }

function parseRelation(s) {
  const { parts, seps } = splitTop(s, (t) => REL_CMDS[t] !== undefined);
  if (parts.length === 1) return { kind: 'expr', expr: parseExprString(parts[0]) };
  const sides = parts.map((p) => {
    if (!p.trim()) throw perr('missing side');
    return parseExprString(p);
  });
  const rel = { kind: 'rel', sides, ops: seps.map((t) => REL_CMDS[t]) };
  // a = 2 \pm 1  ->  a = 3 \lor a = 1
  if (sides.some((e) => hasHead(e.ast, new Set(['PlusMinus'])))) {
    let combos = [[]];
    for (const e of sides) {
      const vs = expandPM(e.ast);
      const next = [];
      for (const c of combos) for (const v of vs) next.push([...c, v]);
      combos = next.slice(0, 8);
    }
    return { kind: 'or', parts: combos.map((c) => ({ kind: 'rel', sides: c.map(makeExpr), ops: rel.ops })) };
  }
  return rel;
}

const CACHE = new Map();
const CACHE_MAX = 2000;

/** Parses one workspace line (cached). Never throws; returns kind 'error'. */
export function parseLine(latex) {
  const key = String(latex ?? '');
  const hit = CACHE.get(key);
  if (hit) return hit;
  let res;
  try {
    if (/\\placeholder/.test(key)) throw perr('empty box');
    const s = preprocess(key);
    if (!s) throw perr('empty');
    let { parts } = splitTop(s, (t) => OR_CMDS.has(t));
    if (parts.length === 1) {
      const commas = splitTop(s, (t) => t === ',' || t === ';').parts;
      const hasRel = (p) => splitTop(p, (t) => REL_CMDS[t] !== undefined).parts.length > 1;
      if (commas.length > 1 && commas.every(hasRel)) parts = commas;
    }
    if (parts.length > 1) {
      const rels = parts.flatMap((p) => {
        const r = parseRelation(p);
        if (r.kind === 'expr') throw perr('each part must be a relation');
        return r.kind === 'or' ? r.parts : [r];
      });
      res = { kind: 'or', parts: rels };
    } else {
      res = parseRelation(s);
    }
  } catch (e) {
    res = { kind: 'error', error: e instanceof MathParseError ? e.message : String(e?.message || e) };
  }
  res.vars = lineVars(res);
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, res);
  return res;
}

export function lineVars(line) {
  const s = new Set();
  if (line.kind === 'expr') line.expr.vars.forEach((v) => s.add(v));
  else if (line.kind === 'rel') line.sides.forEach((e) => e.vars.forEach((v) => s.add(v)));
  else if (line.kind === 'or') line.parts.forEach((p) => p.sides.forEach((e) => e.vars.forEach((v) => s.add(v))));
  return [...s].sort();
}
