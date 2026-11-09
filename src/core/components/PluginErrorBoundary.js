import { LitElement, html, css } from 'lit';
import { ErrorReporter } from '../ErrorReporter.js';

/**
 * A wrapper component that catches errors from child plugins
 * so a single broken question doesn't crash the whole test engine.
 */
export class PluginErrorBoundary extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .error-fallback {
      padding: 1rem;
      border: 1px solid #ff5630;
      border-radius: 4px;
      background: var(--error-bg, #ffebe6);
      color: var(--error-text, #bf2600);
      font-family: system-ui, sans-serif;
    }
    .error-fallback h3 {
      margin-top: 0;
    }
  `;

  static properties = {
    hasError: { type: Boolean, state: true }
  };

  constructor() {
    super();
    this.hasError = false;
    this._handleError = this._handleError.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('error', this._handleError, true); // capture phase
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('error', this._handleError, true);
  }

  _handleError(event) {
    // Prevent the error from bubbling up to window.onerror
    event.preventDefault();
    event.stopPropagation();
    this.hasError = true;
    ErrorReporter.reportError(event.error || event.detail || event, { source: 'PluginErrorBoundary' });
  }

  render() {
    if (this.hasError) {
      return html`
        <div class="error-fallback">
          <h3>Activity couldn't load</h3>
          <p>There was a problem rendering this content. Please skip this item or notify your teacher.</p>
        </div>
      `;
    }
    return html`<slot></slot>`;
  }
}

customElements.define('plugin-error-boundary', PluginErrorBoundary);
