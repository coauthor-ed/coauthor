/**
 * Wrap variable tokens in a LaTeX string with `\textcolor{}{}`, so an
 * equation's symbols can carry the same color roles a diagram above them
 * already uses (typically `--sim-series-N-ink`, via `core/colorRoles.js`)
 * instead of rendering as plain undifferentiated text.
 *
 * This is content-driven, not per-slide hex-picking: a block declares one
 * `mathColors` map (variable -> CSS color value, e.g.
 * `var(--sim-series-2-ink)`) and every equation in it — across every
 * progressive-disclosure beat, since each beat is its own
 * `<markdown-renderer>` — resolves symbols through it. See
 * `src/ui/components/MarkdownRenderer.js` (the one call site) and
 * `docs/content-authoring-guide.md`'s "Color-coding math" section.
 *
 * Vendored MathLive (`vendor/mathlive.js`) resolves `\textcolor{}`'s color
 * argument by trying a named-color table first, then — if it's not a
 * recognized keyword — passing the raw string through verbatim as CSS. That's
 * what lets `var(--sim-series-2-ink)` reach the rendered `style="color:…"`
 * directly, with zero new color surface (invariant 9).
 *
 * **`-ink`, not the bare `--sim-series-N`.** The bare series tokens were
 * validated as canvas shape fills, not text — several fail WCAG AA as thin
 * math glyphs against `--bg-panel` in light theme (`--sim-series-2` measures
 * 2.84:1 there). `sim-theme.css`'s `-ink` variants are the same hue, darkened
 * just enough in light theme to clear 4.5:1 (dark theme already passes, so
 * they're identical there). Content authoring guidance and every shipped
 * `mathColors` map use `-ink`; this module itself has no opinion — it just
 * wraps whatever color string it's given.
 *
 * **Pure, no DOM, no `lit` import** — same constraint as `mathMask.js`/
 * `splitSteps.js`, so it can be unit-tested under plain node.
 */

/**
 * @param {string} latex A single math block's LaTeX source (already
 *   extracted by `mathMask.js` — this never sees the surrounding markdown).
 * @param {Object.<string, string>} roleMap  LaTeX token -> CSS color value.
 *   Keys are matched as whole LaTeX atoms: never inside a command name
 *   (`\alpha`'s "a" is untouched) and never as a substring of a longer
 *   identifier. A key matches wherever it appears, including as a subscript
 *   — `{ a: 'var(--sim-series-1)' }` colors both a bare "$a$" and the "a" in
 *   "$r_a$" (rendering as `r_{\textcolor{...}{a}}`, i.e. just the
 *   distinguishing letter picks up color, not the whole term). Keys are
 *   processed longest-first so a multi-character key (if ever needed) claims
 *   its match before a shorter one could.
 * @returns {string} `latex` with matched tokens wrapped, unchanged if
 *   `roleMap` is empty/absent.
 */
export function colorizeLatex(latex, roleMap) {
  const keys = Object.keys(roleMap || {}).sort((a, b) => b.length - a.length);
  const src = String(latex ?? '');
  if (!keys.length) return src;

  // Two-pass, exactly mathMask.js's own technique and for the same reason:
  // mask each match behind a placeholder as it's found (so a shorter key
  // processed later can never match text that came from an earlier key's
  // replacement), then restore all placeholders once every key has run.
  const wrapped = [];
  let text = src;

  for (const key of keys) {
    const color = roleMap[key];
    if (!color) continue;
    const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Never preceded by a letter or backslash (rules out matching inside a
    // command name like \alpha, or a longer identifier) and never followed
    // by a letter (rules out matching a prefix of one).
    const re = new RegExp('(?<![A-Za-z\\\\])' + escaped + '(?![A-Za-z])', 'g');
    text = text.replace(re, function (m) {
      // The stored replacement carries its own enclosing `{}` — required
      // because a bare `_a` subscript would otherwise become
      // `_\textcolor{...}{a}`, and TeX subscripts only take the *next
      // single token* (`\textcolor` alone, not its two argument groups).
      // One more `{}` around the whole substitution makes it one balanced
      // group wherever it lands.
      wrapped.push('{\\textcolor{' + color + '}{' + m + '}}');
      return '%%%CLR' + (wrapped.length - 1) + '%%%';
    });
  }

  return text.replace(/%%%CLR(\d+)%%%/g, function (_, i) {
    return wrapped[Number(i)] ?? '';
  });
}
