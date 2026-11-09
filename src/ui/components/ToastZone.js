import { LitElement, html, css } from 'lit';
import { EventBus } from '../../core/EventBus.js';

/**
 * <app-toast-zone> — the runtime's transient-message surface.
 *
 * Mounted exactly once, by AppShell. Everything else emits on the bus:
 *   EventBus.emit('ui:toast', { icon: '⚡', text: '+20 XP - lesson finished' })
 * which keeps senders free of any DOM coupling (invariant 4) and means a
 * plugin deep inside a shadow root can raise a toast without reaching out.
 */
const DWELL_MS = 3200;
const MAX_VISIBLE = 3;

export class ToastZone extends LitElement {
  static properties = { _toasts: { state: true } };

  static styles = css`
    :host {
      position: fixed;
      top: 76px;
      right: var(--space-4);
      z-index: 400;
      display: grid;
      gap: var(--space-3);
      pointer-events: none;
    }
    .toast {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      max-width: 320px;
      padding: var(--space-3) var(--space-4);
      background: var(--bg-surface);
      color: var(--text-main);
      border: 2px solid var(--border-color);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      font-family: var(--font-family);
      font-weight: var(--fw-heavy);
      font-size: var(--fs-small);
      animation: toast-in var(--motion-base) var(--ease-spring);
    }
    .toast.out { animation: toast-out var(--motion-base) forwards; }
    .icon { font-size: 1.25em; line-height: 1; }
    @keyframes toast-in  { from { transform: translateX(120%) scale(.85); opacity: 0; } }
    @keyframes toast-out { to   { transform: translateX(130%) scale(.85); opacity: 0; } }

    /* theme.css's reduced-motion block cannot cross the shadow boundary. */
    @media (prefers-reduced-motion: reduce) {
      .toast, .toast.out { animation: none; }
    }
  `;

  constructor() {
    super();
    this._toasts = [];
    this._seq = 0;
    this._onToast = this._onToast.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    EventBus.on('ui:toast', this._onToast);
  }

  disconnectedCallback() {
    EventBus.off('ui:toast', this._onToast);
    super.disconnectedCallback();
  }

  _onToast({ icon = '', text = '' } = {}) {
    if (!text) return;
    const id = ++this._seq;
    this._toasts = [...this._toasts, { id, icon, text, out: false }].slice(-MAX_VISIBLE);
    setTimeout(() => {
      this._toasts = this._toasts.map((t) => (t.id === id ? { ...t, out: true } : t));
      setTimeout(() => { this._toasts = this._toasts.filter((t) => t.id !== id); }, 300);
    }, DWELL_MS);
  }

  render() {
    return html`
      ${this._toasts.map((t) => html`
        <div class="toast ${t.out ? 'out' : ''}" role="status">
          ${t.icon ? html`<span class="icon" aria-hidden="true">${t.icon}</span>` : ''}
          <span>${t.text}</span>
        </div>
      `)}
    `;
  }
}

customElements.define('app-toast-zone', ToastZone);
