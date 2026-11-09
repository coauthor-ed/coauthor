/**
 * Swap LaTeX out of a markdown string and back, so anything that wants to
 * *parse* the markdown can do so without a `$$…$$` expression being read as
 * markdown syntax.
 *
 * Lifted verbatim out of `MarkdownRenderer._parseMarkdown`, which has always
 * done this before calling `marked.parse` — underscores and asterisks are
 * common in LaTeX and marked would happily turn `a_1 * b_2` into emphasis.
 * It lives here now because `splitSteps.js` needs exactly the same three
 * regexes and getting them subtly different would be worse than either
 * behaviour on its own: a multi-line `$$…$$` lexes as several paragraphs, so
 * an unmasked splitter would cut a reveal step through the middle of an
 * equation.
 *
 * **No `lit` import, and nothing DOM.** `test/unit/run.js` runs every
 * `test/unit/*.test.js` under plain node, so anything the splitter reaches has
 * to import cleanly there.
 */

/**
 * @param {string} md
 * @param {{inline?: boolean}} [opts] `inline` mirrors MarkdownRenderer's own
 *   `inline` property: it forces `$$…$$` to render in text mode rather than as
 *   a centred display block.
 * @returns {{text: string, blocks: Array<{latex: string, displayMode: boolean, raw: string}>}}
 *   `text` with each expression replaced by `%%%MATH<n>%%%`, and the
 *   expressions in the order their placeholders are numbered.
 */
export function maskMath(md, { inline = false } = {}) {
  const blocks = [];
  const push = (latex, displayMode, raw) => {
    blocks.push({ latex, displayMode, raw });
    return `%%%MATH${blocks.length - 1}%%%`;
  };

  let text = String(md ?? '');
  // 1. Block math: $$…$$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (raw, p1) => push(p1, !inline, raw));
  // 2. Inline math: \(…\)
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (raw, p1) => push(p1, false, raw));
  // 3. Inline math: $…$, where the $ is not escaped. The prefix character is
  //    matched only to prove that, and is put back untouched.
  text = text.replace(/(^|[^\\])\$([^$]+?)\$/g, (_, prefix, p1) => `${prefix}${push(p1, false, `$${p1}$`)}`);

  return { text, blocks };
}

/**
 * Put the original expressions back, byte for byte — including which of the
 * three delimiter styles each one was written in. Used by anything that masks
 * in order to *analyse* markdown and then hands the markdown on to someone
 * else to render (`splitSteps`), as opposed to rendering it itself
 * (`MarkdownRenderer`, which substitutes rendered KaTeX instead).
 */
export function restoreMath(text, blocks) {
  return String(text ?? '').replace(/%%%MATH(\d+)%%%/g, (placeholder, i) => {
    const block = blocks[Number(i)];
    return block ? block.raw : placeholder;
  });
}

/**
 * Does the first `___` fill-blank placeholder in `text` sit inside a
 * $...$/$$...$$/\(...\) math span (e.g. "$(-a+b+c)^2 = ___$")? A caller that
 * naively does `text.split('___')` and renders each half through its own
 * <markdown-renderer> - the pattern semantic-descriptive's coaching UI used
 * everywhere the blank appears - hands each half an unbalanced delimiter:
 * neither half has a matching pair for maskMath() above to find, so neither
 * renders as math at all - the raw '$'/LaTeX source leaks into the page
 * instead of a typeset equation. Confirmed the real cause of a live
 * complaint (a model-answer reveal showing literal "$(-a+b+c)^2 = " next to
 * a plain-text answer next to a stray "$."). Callers use this to fall back
 * to substituting the blank's value directly into `text` and rendering it as
 * one combined string instead - see chained-blank-builder.js's
 * _renderLineBody()/_renderStaticLineBody() for the pattern.
 */
export function blankInsideMath(text) {
  const idx = String(text ?? '').indexOf('___');
  if (idx === -1) return false;
  const ranges = [];
  const collect = (re) => { let m; while ((m = re.exec(text))) ranges.push([m.index, m.index + m[0].length]); };
  collect(/\$\$[\s\S]+?\$\$/g);
  collect(/\\\([\s\S]+?\\\)/g);
  collect(/(?:^|[^\\])\$[^$]+?\$/g);
  return ranges.some(([start, end]) => idx > start && idx < end);
}
