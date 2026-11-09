/**
 * latexUtil.js - small string helpers for the math-workspace plugin.
 *
 * Pure functions over LaTeX strings, no DOM, no compute-engine. They exist so
 * the plugin can talk about "the two sides of this line" or "the terms that
 * changed" in the student's OWN spelling of the line (a canonical form from a
 * CAS would not match what is on screen, which is what highlighting needs).
 */

const OPEN = { '{': '}', '(': ')', '[': ']' };
const CLOSE = new Set(['}', ')', ']']);

/** Strip whitespace that carries no meaning, for string comparison. */
export function norm(latex) {
  return String(latex ?? '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\,|\\;|\\!|\\ /g, '')
    .replace(/\s+/g, '')
    .replace(/\\cdot/g, '*')
    .replace(/\\times/g, '*');
}

/**
 * Walks a LaTeX string at brace/paren depth 0 and calls visit(i) for every
 * index at depth 0. Returns nothing. \left( and \right) count as parens via
 * their bare characters. An escaped brace (\{) is treated as a paren pair.
 */
function walkTop(latex, visit) {
  let depth = 0;
  for (let i = 0; i < latex.length; i++) {
    const ch = latex[i];
    if (ch === '\\') {
      // A control word or escaped char: let the visitor see its start, skip it.
      if (depth === 0) {
        const stop = visit(i);
        if (stop) return;
      }
      const m = /^\\([a-zA-Z]+|.)/.exec(latex.slice(i));
      if (m) {
        const tok = m[1];
        if (tok === '{' || tok === '[' || tok === '(') depth++;
        else if (tok === '}' || tok === ']' || tok === ')') depth = Math.max(0, depth - 1);
        i += m[0].length - 1;
      }
      continue;
    }
    if (OPEN[ch]) { depth++; continue; }
    if (CLOSE.has(ch)) { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) {
      const stop = visit(i);
      if (stop) return;
    }
  }
}

const REL_TOKENS = [
  ['\\leq', '\\le'], ['\\le', '\\le'], ['\\geq', '\\ge'], ['\\ge', '\\ge'],
  ['\\neq', '\\ne'], ['\\ne', '\\ne'], ['\\lt', '<'], ['\\gt', '>'],
  ['=', '='], ['<', '<'], ['>', '>'],
];

/**
 * Splits a single relation "lhs op rhs" at its first top-level relation sign.
 * Returns { lhs, op, rhs } (op normalised to = < > \le \ge \ne) or null when
 * the line is a plain expression. Lines joined by \lor / \text{or} / a comma
 * are not relations here - see splitAlternatives().
 */
export function splitRelation(latex) {
  const s = String(latex ?? '');
  let found = null;
  walkTop(s, (i) => {
    for (const [tok, op] of REL_TOKENS) {
      if (s.startsWith(tok, i)) {
        // \le must not match the start of \left
        if (tok.startsWith('\\') && /[a-zA-Z]/.test(s[i + tok.length] || '')) continue;
        found = { lhs: s.slice(0, i).trim(), op, rhs: s.slice(i + tok.length).trim() };
        return true;
      }
    }
    return false;
  });
  if (!found || !found.lhs || !found.rhs) return null;
  return found;
}

/** "x=2 \lor x=3" / "x=2 \text{ or } x=3" / "x=2, x=3" -> ["x=2", "x=3"]. */
export function splitAlternatives(latex) {
  const s = String(latex ?? '')
    .replace(/\\text\{\s*or\s*\}/g, '\\lor ')
    .replace(/\\vee/g, '\\lor ')
    .replace(/\\quad|\\qquad/g, ' ');
  const out = [];
  let last = 0;
  walkTop(s, (i) => {
    if (s.startsWith('\\lor', i) && !/[a-zA-Z]/.test(s[i + 4] || '')) {
      out.push(s.slice(last, i));
      last = i + 4;
    } else if (s[i] === ',' || s[i] === ';') {
      out.push(s.slice(last, i));
      last = i + 1;
    }
    return false;
  });
  out.push(s.slice(last));
  return out.map((t) => t.trim()).filter(Boolean);
}

/**
 * Top-level additive terms of an expression, each keeping its own sign,
 * as substrings of the input: "x^2-5x+6" -> ["x^2", "-5x", "+6"].
 */
export function topLevelTerms(latex) {
  const s = String(latex ?? '');
  const cuts = [];
  walkTop(s, (i) => {
    const ch = s[i];
    if ((ch === '+' || ch === '-') && i > 0) {
      // A sign right after ^, _, (, or another operator is a unary sign.
      const prev = s.slice(0, i).trimEnd().slice(-1);
      if (prev && !'^_+-=(<>,'.includes(prev)) cuts.push(i);
    }
    return false;
  });
  const terms = [];
  let last = 0;
  for (const c of cuts) { terms.push(s.slice(last, c)); last = c; }
  terms.push(s.slice(last));
  return terms.map((t) => t.trim()).filter(Boolean);
}

/** Every term of every side of a line (relation-aware). */
export function lineTerms(latex) {
  const alts = splitAlternatives(latex);
  if (alts.length > 1) return alts.flatMap((a) => lineTerms(a));
  const rel = splitRelation(latex);
  if (!rel) return topLevelTerms(latex);
  return [...topLevelTerms(rel.lhs), ...topLevelTerms(rel.rhs)];
}

/**
 * The terms in `next` that do not appear (as normalised strings, ignoring a
 * leading "+") anywhere among the terms of `prev`. The plugin's own fallback
 * for locating what moved; math-core's diffTerms() is asked first.
 */
export function naiveChangedTerms(prev, next) {
  const key = (t) => norm(t).replace(/^\+/, '');
  const before = new Set(lineTerms(prev).map(key));
  const out = [];
  for (const t of lineTerms(next)) {
    if (!before.has(key(t))) out.push(t.replace(/^\+/, '').trim());
  }
  return out.filter(Boolean);
}

/**
 * MathLive "fill in the blank" values carry \placeholder[id]{content}. For
 * checking, the content is what counts. An empty placeholder becomes an
 * empty group, which the parser rejects - that is intended (not finished).
 */
export function unwrapPlaceholders(latex) {
  let s = String(latex ?? '');
  for (let guard = 0; guard < 20 && s.includes('\\placeholder'); guard++) {
    s = s.replace(/\\placeholder(\[[^\]]*\])?\{([^{}]*)\}/g, (_m, _id, body) => `{${body}}`);
  }
  return s;
}

export function hasEmptyPlaceholder(latex) {
  return /\\placeholder(\[[^\]]*\])?\{\s*\}/.test(String(latex ?? ''));
}

/** Template from content: plain \placeholder{} -> numbered prompts MathLive can edit. */
export function templateToPrompts(template) {
  let n = 0;
  return String(template ?? '').replace(/\\placeholder(\[[^\]]*\])?\{\}/g, () => `\\placeholder[p${n++}]{}`);
}

/**
 * Wraps each of `terms` (found as substrings of `latex`) in an \htmlStyle
 * highlight. Whitespace-insensitive: a term is located by its normalised
 * spelling and the wrapper is applied to the matching raw span. Terms that
 * cannot be found are skipped (the preview just shows no highlight for them).
 * The style only names CSS custom properties, so the highlight follows the
 * theme without a hardcoded colour.
 */
export function highlightLatex(latex, terms) {
  let s = String(latex ?? '');
  if (!terms?.length) return s;
  const style = 'background:var(--mw-moved-bg);color:var(--mw-moved-ink);border-radius:6px;padding:0 3px;box-shadow:0 2px 0 var(--mw-moved-lip)';
  const used = [];
  for (const raw of terms) {
    const t = String(raw).replace(/^\+/, '').trim();
    if (!t) continue;
    const span = findSpan(s, t, used);
    if (!span) continue;
    used.push(span);
  }
  used.sort((a, b) => b[0] - a[0]);
  for (const [a, b] of used) {
    s = `${s.slice(0, a)}\\htmlStyle{${style}}{${s.slice(a, b)}}${s.slice(b)}`;
  }
  return s;
}

function findSpan(s, term, used) {
  const target = norm(term);
  if (!target) return null;
  // Map normalised index -> raw index by rebuilding char by char.
  for (let start = 0; start < s.length; start++) {
    if (/\s/.test(s[start])) continue;
    for (let end = start + 1; end <= s.length; end++) {
      const piece = norm(s.slice(start, end));
      if (piece.length > target.length) break;
      if (piece === target) {
        const overlaps = used.some(([a, b]) => start < b && end > a);
        if (!overlaps && balanced(s.slice(start, end))) return [start, end];
        break;
      }
    }
  }
  return null;
}

function balanced(piece) {
  let d = 0;
  for (const ch of piece) {
    if (ch === '{') d++;
    else if (ch === '}') { d--; if (d < 0) return false; }
  }
  return d === 0;
}

/** Plain-text rendering of a number for feedback sentences (no LaTeX). */
export function fmtNum(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return 'undefined';
  if (!Number.isFinite(v)) return v > 0 ? 'infinity' : 'minus infinity';
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  const r = Math.round(v * 1000) / 1000;
  return String(r);
}

/** "{x: 2, y: 1}" -> "x = 2, y = 1" with friendly Greek names. */
export function fmtPoint(point) {
  return Object.entries(point || {})
    .map(([k, v]) => `${friendlyVar(k)} = ${fmtNum(v)}`)
    .join(', ');
}

export function friendlyVar(name) {
  const greek = { theta: '\u03b8', alpha: '\u03b1', beta: '\u03b2', phi: '\u03c6', pi: '\u03c0' };
  return greek[name] || name;
}

/** Best-effort guess of free variables when the item does not list them. */
export function guessVars(latexList) {
  const found = new Set();
  const skip = new Set(['e', 'i', 'd']);
  for (const latex of latexList) {
    const s = String(latex ?? '');
    if (/\\theta/.test(s)) found.add('theta');
    if (/\\alpha/.test(s)) found.add('alpha');
    if (/\\beta/.test(s)) found.add('beta');
    const stripped = s.replace(/\\[a-zA-Z]+/g, ' ');
    for (const m of stripped.matchAll(/[a-zA-Z]/g)) {
      if (!skip.has(m[0])) found.add(m[0]);
    }
  }
  return [...found];
}
