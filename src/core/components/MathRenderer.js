/**
 * MathRenderer — thin wrapper around vendored KaTeX.
 *
 * KaTeX is lazy-loaded on first render call so it never enters the
 * app shell's critical path (HLD §5, §18).
 *
 * Usage:
 *   import { MathRenderer } from 'core/components/MathRenderer.js';
 *   await MathRenderer.renderToElement(el, '\\frac{a}{b}', { displayMode: true });
 */

import { loadMathlive } from '../mathliveConfig.js';

/** Sanitize raw string before handing to MathLive — strip non-LaTeX HTML. */
function sanitizeLatex(input) {
  // Only allow characters safe in LaTeX; strip bare HTML tags
  return String(input).replace(/<[^>]*>/g, '');
}

// The vendored MathLive build's macro table has \ldots/\cdots/\mathellipsis
// but not bare \dots, so it falls through to an "unknown command" error glyph.
// Alias it here rather than patching the vendored bundle. Macro keys are
// looked up *without* the leading backslash (see Ki() in vendor/mathlive.js).
const MACROS_ATTR = JSON.stringify({ dots: '\\ldots' }).replace(/"/g, '&quot;');

export class MathRenderer {
  /**
   * Render LaTeX into an existing DOM element.
   * @param {HTMLElement} el  Target element (will be cleared)
   * @param {string} latex    LaTeX string (may be inline or block math)
   * @param {{ displayMode?: boolean }} opts
   */
  static async renderToElement(el, latex, { displayMode = false } = {}) {
    await loadMathlive();
    try {
      const tag = displayMode ? 'math-div' : 'math-span';
      el.innerHTML = `<${tag} macros="${MACROS_ATTR}">${sanitizeLatex(latex)}</${tag}>`;
    } catch (err) {
      el.textContent = latex; // graceful fallback
      console.warn('[MathRenderer] MathLive error:', err);
    }
  }

  /**
   * Render LaTeX to an HTML string (for hint fragments, etc.).
   * @param {string} latex
   * @param {{ displayMode?: boolean }} opts
   * @returns {Promise<string>} HTML string
   */
  static async renderToString(latex, { displayMode = false } = {}) {
    await loadMathlive();
    try {
      const tag = displayMode ? 'math-div' : 'math-span';
      return `<${tag} macros="${MACROS_ATTR}">${sanitizeLatex(latex)}</${tag}>`;
    } catch {
      return sanitizeLatex(latex);
    }
  }
}
