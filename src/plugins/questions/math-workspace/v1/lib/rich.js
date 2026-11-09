import { html } from 'lit';
import { mathSpan } from './field.js';

/**
 * Short inline text with $...$ math (chip labels, hint strategies, why
 * notes). Text parts go through Lit text bindings (auto-escaped); math parts
 * become MathLive math-span elements. A per-string cache keeps the same
 * element across re-renders, since a math-span renders once on connect.
 */
const cache = new Map();

export function loc(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v.en || '';
}

export function rich(value, key = '') {
  const s = loc(value);
  if (!s.includes('$')) return s;
  const parts = s.split(/(\$[^$]+\$)/g).filter(Boolean);
  return html`${parts.map((p, i) => {
    if (p.startsWith('$') && p.endsWith('$') && p.length > 2) {
      const k = `${key}|${i}|${p}`;
      let el = cache.get(k);
      if (!el) {
        el = mathSpan(p.slice(1, -1));
        cache.set(k, el);
        if (cache.size > 400) cache.delete(cache.keys().next().value);
      }
      return el;
    }
    return p;
  })}`;
}
