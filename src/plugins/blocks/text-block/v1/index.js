import { LitElement, html, css } from 'lit';
import '../../../../ui/components/MarkdownRenderer.js';

/**
 * A basic text block that renders markdown payload data.
 */
export class TextBlock extends LitElement {
  static styles = css`
    :host {
      display: block;
      margin-bottom: 1.5rem;
    }
  `;

  static properties = {
    _data: { type: Object, state: true }
  };

  constructor() {
    super();
    this._data = null;
  }

  /**
   * Required plugin lifecycle method.
   * Invoked immediately after creation, before being added to DOM.
   * @param {object} data The block payload.
   */
  init(data) {
    if (!data || !data.markdown) {
      throw new Error("TextBlock requires a 'markdown' payload.");
    }
    this._data = data;
  }

  render() {
    if (!this._data) return html``;
    return html`
      <markdown-renderer .content="${this._data.markdown}"></markdown-renderer>
    `;
  }
}

customElements.define('text-block-v1', TextBlock);
