/**
 * intervals.js - interval-notation <-> segment list, for the interval shape's
 * number-line builder (and the thin fallback checker).
 *
 * A segment is { a, aClosed, b, bClosed, aLatex, bLatex } with a/b numbers
 * (-Infinity / Infinity allowed). Endpoint values are evaluated by the caller
 * supplied `evalNum(latex)` so this file never needs compute-engine.
 */

function cleanup(latex) {
  return String(latex ?? '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\lbrack/g, '[')
    .replace(/\\rbrack/g, ']')
    .replace(/\\lparen/g, '(')
    .replace(/\\rparen/g, ')')
    .replace(/\\infty/g, '\\infty ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns segments or null when the text is not interval notation (yet). */
export function parseInterval(latex, evalNum) {
  const s = cleanup(latex);
  if (!s) return [];
  if (/^\\(emptyset|varnothing|phi)\b/.test(s) || s === '\\{\\}') return [];
  const pieces = s.split(/\\cup/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const p of pieces) {
    const m = /^([([])(.*),(.*)([)\]])$/.exec(p);
    if (!m) return null;
    const aL = m[2].trim();
    const bL = m[3].trim();
    const a = endpoint(aL, evalNum);
    const b = endpoint(bL, evalNum);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    out.push({ a, b, aClosed: m[1] === '[' && Number.isFinite(a), bClosed: m[4] === ']' && Number.isFinite(b), aLatex: aL, bLatex: bL });
  }
  return out;
}

function endpoint(latex, evalNum) {
  const t = latex.replace(/\s+/g, '');
  if (/^(-|\+)?\\infty$/.test(t)) return t.startsWith('-') ? -Infinity : Infinity;
  const v = evalNum(latex);
  return typeof v === 'number' ? v : NaN;
}

export function segmentsToLatex(segs) {
  if (!segs.length) return '\\emptyset';
  return segs
    .slice()
    .sort((x, y) => x.a - y.a)
    .map((g) => {
      const aL = g.a === -Infinity ? '-\\infty' : (g.aLatex ?? fmt(g.a));
      const bL = g.b === Infinity ? '\\infty' : (g.bLatex ?? fmt(g.b));
      return `${g.aClosed ? '[' : '('}${aL},${bL}${g.bClosed ? ']' : ')'}`;
    })
    .join('\\cup');
}

function fmt(v) {
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(Math.round(v * 1000) / 1000);
}

/** Merge touching/overlapping segments into a canonical list. */
export function canonical(segs) {
  const s = segs.filter((g) => g.a < g.b || (g.a === g.b && g.aClosed && g.bClosed)).sort((x, y) => x.a - y.a);
  const out = [];
  for (const g of s) {
    const last = out[out.length - 1];
    if (last && (g.a < last.b || (g.a === last.b && (last.bClosed || g.aClosed)))) {
      if (g.b > last.b) { last.b = g.b; last.bClosed = g.bClosed; } else if (g.b === last.b) last.bClosed = last.bClosed || g.bClosed;
    } else out.push({ ...g });
  }
  return out;
}

export function sameSegments(x, y) {
  const a = canonical(x);
  const b = canonical(y);
  if (a.length !== b.length) return false;
  const close = (p, q) => (p === q) || (Number.isFinite(p) && Number.isFinite(q) && Math.abs(p - q) <= 1e-9 * Math.max(1, Math.abs(p)));
  return a.every((g, i) => close(g.a, b[i].a) && close(g.b, b[i].b) && g.aClosed === b[i].aClosed && g.bClosed === b[i].bClosed);
}
