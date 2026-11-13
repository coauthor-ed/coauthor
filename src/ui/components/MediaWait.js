import { LitElement, html, css } from 'lit';
import './LookSlots.js';
import { btn3dStyles } from '../sharedStyles.js';
import { iconCloudOff } from '../icons/uiIcons.js';

/**
 * <media-wait> (Q-100b): what a slide shows in place of a picture or a
 * simulation that is not on screen yet, instead of blank space or a broken
 * image.
 *
 *   <media-wait kind="simulation" state="loading"></media-wait>
 *       the look's loader (<app-loader>, Quill's inking pen) on a soft panel
 *   <media-wait kind="picture" state="missing" retryable></media-wait>
 *       the file did not arrive: offline, "not saved for offline yet" with a
 *       small Quill; online, "did not load". A "Try again" button (only with
 *       `retryable`) fires a bubbling, composed 'media-retry' event, and the
 *       event also fires by itself when the device comes back online.
 *       With `reload` the button reloads the page instead (the browser will
 *       not fetch a failed module again; the owner knows when).
 *   <media-wait kind="simulation" follow></media-wait>
 *       placed right after an empty host element: shows the loader until
 *       that element gets children (the scene mounted), then hides itself.
 *       For hosts whose owner tracks no loading state of its own.
 *
 * Display only: the owner decides the state. Colours are theme tokens.
 */

const COPY = {
  simulation: { loading: 'Loading the simulation...', what: 'simulation' },
  picture: { loading: 'Loading the picture...', what: 'picture' },
  slide: { loading: 'Loading the slide...', what: 'slide' },
  lesson: { loading: 'Loading the lesson...', what: 'lesson' },
};

export class MediaWait extends LitElement {
  static properties = {
    kind: { type: String },
    state: { type: String, reflect: true },
    retryable: { type: Boolean },
    reload: { type: Boolean },
    follow: { type: Boolean },
    compact: { type: Boolean, reflect: true },
    _online: { state: true },
    _hidden: { state: true },
  };

  static styles = [btn3dStyles, css`
    :host {
      display: grid;
      place-items: center;
      box-sizing: border-box;
      width: 100%;
      min-height: var(--media-wait-h, 220px);
      padding: var(--space-4, 16px);
      line-height: normal;
      color: var(--text-muted);
      background: var(--bg-panel);
      border-radius: inherit;
      text-align: center;
    }
    :host([hidden]) { display: none; }
    :host([compact]) { min-height: var(--media-wait-h, 140px); padding: 12px; }
    app-loader { color: var(--text-muted); font-family: var(--font-family); font-size: 0.85rem; }

    .miss {
      display: grid;
      justify-items: center;
      gap: 6px;
      max-width: 34ch;
      animation: in 260ms var(--motion-reveal-ease, ease-out) both;
    }
    .badge {
      position: relative;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--bg-surface);
      border: 2.5px dashed var(--border-hover, var(--border-color));
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    .badge svg { width: 30px; height: 30px; }
    /* Quill peeks over the badge (Quill look only; plain places no companion). */
    .badge companion-slot > * { position: absolute; right: -30px; bottom: -10px; }
    h4 {
      margin: 0;
      font-family: var(--font-heading);
      font-weight: var(--heading-weight, 700);
      font-size: 1.02rem;
      line-height: 1.25;
      color: var(--text-main);
    }
    p { margin: 0; font-size: 0.86rem; line-height: 1.45; }
    .btn-3d { margin-top: 8px; }
    :host([compact]) .badge { width: 48px; height: 48px; }
    :host([compact]) .badge svg { width: 24px; height: 24px; }
    :host([compact]) p { display: none; }
    @keyframes in { from { opacity: 0; transform: translateY(6px); } }
    @media (prefers-reduced-motion: reduce) { .miss { animation: none; } }
  `];

  constructor() {
    super();
    this.kind = 'simulation';
    this.state = 'loading';
    this.retryable = false;
    this.reload = false;
    this.follow = false;
    this.compact = false;
    this._online = navigator.onLine !== false;
    this._hidden = false;
    this._onOnline = () => {
      this._online = true;
      if (this.state === 'missing') this._retry();
    };
    this._onOffline = () => { this._online = false; };
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('online', this._onOnline);
    window.addEventListener('offline', this._onOffline);
    this._online = navigator.onLine !== false;
    if (this.follow) this._followHost();
  }

  disconnectedCallback() {
    window.removeEventListener('online', this._onOnline);
    window.removeEventListener('offline', this._onOffline);
    this._mo?.disconnect();
    this._mo = null;
    super.disconnectedCallback();
  }

  /** follow: hidden once the host just before this element has children. */
  _followHost() {
    const host = this.previousElementSibling;
    if (!host) return;
    const sync = () => {
      const has = host.childElementCount > 0;
      this.toggleAttribute('hidden', has);
    };
    sync();
    this._mo = new MutationObserver(sync);
    this._mo.observe(host, { childList: true });
  }

  _retry() {
    this.dispatchEvent(new CustomEvent('media-retry', { bubbles: true, composed: true }));
  }

  render() {
    const c = COPY[this.kind] || COPY.simulation;
    if (this.state !== 'missing') {
      return html`<app-loader size=${this.compact ? 40 : 56} label=${c.loading}></app-loader>`;
    }
    const offline = !this._online;
    return html`
      <div class="miss" role="status">
        <span class="badge" aria-hidden="true">${iconCloudOff}
          ${offline && !this.compact ? html`<companion-slot size="mini" expression="sad"></companion-slot>` : ''}
        </span>
        <h4>${offline ? `This ${c.what} is not saved for offline yet` : `This ${c.what} did not load`}</h4>
        <p>${offline
          ? `Connect to the internet once and it will appear here. After that it stays on this device.`
          : (this.reload && this.retryable
            ? `Part of it did not arrive. Reload the page to fetch it again.`
            : `The connection may be slow. Try again in a moment.`)}</p>
        ${this.retryable && !offline ? html`<button class="btn-3d btn-secondary btn-sm"
          @click=${() => (this.reload ? window.location.reload() : this._retry())}>${this.reload ? 'Reload the page' : 'Try again'}</button>` : ''}
      </div>
    `;
  }
}

if (!customElements.get('media-wait')) customElements.define('media-wait', MediaWait);
