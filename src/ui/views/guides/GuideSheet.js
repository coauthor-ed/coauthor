import { LitElement, html, css } from 'lit';
import { iconClose, iconArrowRight } from '../../icons/uiIcons.js';
import './GuideView.js';
import { LookMixin } from '../../../core/mixins/LookMixin.js';

/**
 * <guide-sheet> - a guide opened over a lesson or test ('guide:open' while a
 * session is mounted; AppShell owns it), so the student keeps their place.
 * A modal sheet from the bottom on phones, from the right on wide screens.
 * Escape, the close button or the backdrop closes it; "Open as a page" leaves
 * the session for the full guide. Fires `close`.
 */
export class GuideSheet extends LookMixin(LitElement) {
  static properties = {
    slug: { type: String },
    heading: { type: String },
  };

  static styles = css`
    :host { position: fixed; inset: 0; z-index: 400; display: block; }
    .scrim { position: absolute; inset: 0; background: color-mix(in srgb, var(--landing-sky-top) 55%, transparent); animation: fade 200ms ease-out; }
    .sheet {
      position: absolute; top: 0; right: 0; bottom: 0; width: min(720px, 100%);
      display: flex; flex-direction: column; overflow: hidden;
      background: var(--landing-paper); border-left: 2.5px solid var(--landing-ink);
      box-shadow: -14px 0 40px -18px var(--landing-sky-top);
      animation: in-right 280ms cubic-bezier(0.2, 0.9, 0.3, 1);
    }
    .top {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px; flex: none;
      background: var(--landing-paper-2); border-bottom: 2px solid var(--landing-ink); color: var(--landing-ink);
      font-family: 'Nunito', system-ui, sans-serif;
    }
    .top b { margin-right: auto; font-family: 'Fredoka', 'Nunito', sans-serif; font-size: 1.05rem; }
    .top a, .top button {
      display: inline-flex; align-items: center; gap: 6px; cursor: pointer; text-decoration: none;
      font: inherit; font-weight: 800; font-size: 0.9rem; color: var(--landing-ink);
      padding: 8px 12px; border-radius: 12px; background: none; border: 2px solid var(--landing-ink);
    }
    .top button { padding: 8px; }
    .top svg { width: 18px; height: 18px; }
    .scroll { flex: 1; overflow: auto; overscroll-behavior: contain; }
    .top :focus-visible { outline: 3px solid var(--landing-grownup); outline-offset: 2px; }
    @keyframes fade { from { opacity: 0; } }
    @keyframes in-right { from { transform: translateX(40px); opacity: 0; } }
    @keyframes in-up { from { transform: translateY(40px); opacity: 0; } }
    @media (max-width: 720px) {
      .sheet { top: 8vh; left: 0; width: 100%; border-left: 0; border-top: 2.5px solid var(--landing-ink); border-radius: 22px 22px 0 0; animation-name: in-up; }
    }
    @media (prefers-reduced-motion: reduce) { .scrim, .sheet { animation: none; } }
    /* plain: the sheet is a flat page on the app's own paper and scrim. */
    :host([data-look='plain']) .scrim { background: var(--scrim); }
    :host([data-look='plain']) .sheet { background: var(--bg-base); border-left: 1px solid var(--border-color); border-top-color: var(--border-color); box-shadow: var(--shadow-lg); }
    :host([data-look='plain']) .top { background: var(--bg-surface); border-bottom: 1px solid var(--border-color); color: var(--text-main); font-family: var(--font-family); }
    :host([data-look='plain']) .top b { font-family: var(--font-heading); font-weight: var(--heading-weight); }
    :host([data-look='plain']) .top a,
    :host([data-look='plain']) .top button { font-weight: 600; color: var(--primary-text); border: 1px solid var(--border-hover); border-radius: var(--radius-sm); }
    :host([data-look='plain']) .top :focus-visible { outline: var(--focus-ring); }
    @media (max-width: 720px) {
      :host([data-look='plain']) .sheet { border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
    }
  `;

  constructor() {
    super();
    this.slug = '';
    this.heading = '';
    this._onKey = (e) => { if (e.key === 'Escape') this._close(); };
  }

  connectedCallback() {
    super.connectedCallback();
    this._returnFocus = document.activeElement;
    window.addEventListener('keydown', this._onKey);
  }

  disconnectedCallback() {
    window.removeEventListener('keydown', this._onKey);
    this._returnFocus?.focus?.();
    super.disconnectedCallback();
  }

  firstUpdated() {
    this.renderRoot.querySelector('.close')?.focus();
  }

  _close() {
    this.dispatchEvent(new CustomEvent('close'));
  }

  render() {
    return html`
      <div class="scrim" @click=${this._close}></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="Guide">
        <div class="top">
          <b>Guide</b>
          <a href="#/guides/${this.slug}">Open as a page ${iconArrowRight}</a>
          <button class="close" @click=${this._close} aria-label="Close the guide">${iconClose}</button>
        </div>
        <div class="scroll">
          <guide-view compact .slug=${this.slug} .heading=${this.heading}></guide-view>
        </div>
      </section>
    `;
  }
}

customElements.define('guide-sheet', GuideSheet);
