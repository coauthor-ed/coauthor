import { LitElement, html, css } from 'lit';
import { i18n } from '../../core/i18nProvider.js';

/**
 * Calm replacement for content that needs a newer engine than the one running
 * (engine version gate, P0-2). It only points at the dashboard: updates are
 * applied there, never mid-lesson (invariant 7).
 */
export class NeedsUpdateNotice extends LitElement {
  static styles = css`
    :host { display: block; }
    .notice {
      color: var(--text-main);
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      max-width: 40rem;
      margin: var(--space-4) auto;
    }
    p { margin: 0 0 var(--space-3); }
    a { color: var(--text-main); font-weight: 600; }
  `;

  _text(key, fallback) {
    const v = i18n.t(key);
    return v === key ? fallback : v;
  }

  render() {
    return html`<div class="notice" role="status">
      <p>${this._text('course.needs_update', 'This course needs a newer version of CoAuthor. Go to the dashboard to update.')}</p>
      <a href="#/">${this._text('course.needs_update_action', 'Go to the dashboard')}</a>
    </div>`;
  }
}
customElements.define('needs-update-notice', NeedsUpdateNotice);
