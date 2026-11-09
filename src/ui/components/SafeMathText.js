import { LitElement, html, css } from 'lit';
import { MathRenderer } from '../../core/components/MathRenderer.js';

/**
 * <safe-math-text> — renders a plain-text string that may contain `$...$`
 * LaTeX spans, treating everything OUTSIDE those spans as inert text and
 * rendering only the math spans themselves (via MathRenderer, which already
 * strips HTML tags out of LaTeX before handing it to MathLive — see its own
 * `sanitizeLatex()`).
 *
 * Built specifically for text a STUDENT typed (a free-text test/lesson
 * answer, or a scorer's verbatim quote from one) — unlike <markdown-renderer>
 * (author-authored content only: marked.js passes raw inline HTML straight
 * through by design — that's a CommonMark feature, not a bug, but it means
 * `<markdown-renderer .content=${untrustedText}>` is a real stored-XSS
 * vector for anything a student can type, confirmed empirically against the
 * vendored marked.js build). This component escapes the non-math text
 * itself, synchronously, before constructing any HTML string, so nothing in
 * the plain-text portion can inject markup regardless of what was typed
 * (rule 6) — no markdown formatting (bold/links/lists/etc.) is interpreted
 * either, which is the right behavior here: a free-text answer box was never
 * offering the student markdown syntax, only prose plus spliced-in equations.
 */
export class SafeMathText extends LitElement {
  static properties = {
    content: { type: String },
    inline: { type: Boolean, reflect: true },
  };

  static styles = css`
    :host { display: block; white-space: pre-wrap; overflow-wrap: anywhere; }
    :host([inline]) { display: inline; white-space: pre-wrap; }
    math-span { display: inline-block; min-width: 1px; }
  `;

  constructor() {
    super();
    this.content = '';
    this.inline = false;
  }

  async updated(changedProperties) {
    super.updated(changedProperties);
    if (!changedProperties.has('content')) return;
    const container = this.shadowRoot.getElementById('c');
    if (!container) return;
    container.innerHTML = await this._render(this.content || '');
  }

  async _render(text) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const re = /\$([^$\n]+)\$/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index));
      out += await MathRenderer.renderToString(m[1].trim(), { displayMode: false });
      last = m.index + m[0].length;
    }
    out += esc(text.slice(last));
    return out;
  }

  render() {
    return html`<span id="c"></span>`;
  }
}

customElements.define('safe-math-text', SafeMathText);
