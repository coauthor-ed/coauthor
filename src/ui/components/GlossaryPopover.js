import { LitElement, html, css, unsafeCSS } from 'lit';
import { EventBus } from '../../core/EventBus.js';
import { characterSvg, CHARACTER_CSS } from 'simulations/base/kit/KeyCharacters.js';

/**
 * <glossary-popover> - the one card that every tap-to-gloss word opens.
 *
 * Mounted once, on the first tap, by GlossaryService.open(); it listens for
 * `glossary:open` on the EventBus. It lives on <body> (not inside the renderer
 * that owns the word) because a beat can sit inside a transformed, clipped
 * ancestor, which would trap a position:fixed child. Wide screens: a card next
 * to the word. Narrow screens: a sheet along the bottom edge.
 */
export class GlossaryPopover extends LitElement {
  static properties = {
    _term: { state: true },
    _open: { state: true },
  };

  static styles = [css`
    :host { position: fixed; inset: 0; z-index: 9000; pointer-events: none; font-family: var(--font-family, system-ui, sans-serif); }
    .card {
      position: fixed; box-sizing: border-box; pointer-events: auto;
      width: min(340px, calc(100vw - 24px));
      background: var(--bg-surface); color: var(--text-main);
      border: 1px solid var(--border-color); border-top: 5px solid var(--gl-accent, var(--primary-color));
      border-radius: var(--radius-md, 16px); box-shadow: var(--shadow-lg);
      padding: 12px 14px 14px; line-height: 1.45;
      animation: gl-in 140ms ease-out;
    }
    .card:focus { outline: none; }
    .card[hidden] { display: none; }
    .head { display: flex; align-items: center; gap: 12px; }
    .face { flex: none; }
    .face svg { width: 52px; height: 52px; }
    .who { flex: 1; min-width: 0; }
    .term { margin: 0; font-size: 1.2rem; font-weight: var(--fw-heavy); line-height: 1.2; overflow-wrap: anywhere; }
    .plain { margin: 2px 0 0; color: var(--text-muted); font-size: 0.95rem; }
    .x {
      flex: none; align-self: flex-start; width: 32px; height: 32px; margin: -4px -6px 0 0;
      border: 0; border-radius: 50%; background: transparent; color: var(--text-muted);
      font-size: 1.3rem; line-height: 1; cursor: pointer;
    }
    .x:hover { background: var(--bg-panel); }
    .x:focus-visible { outline: 3px solid var(--primary-color); outline-offset: 1px; }
    .roots { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
    .root { background: var(--bg-panel); border-radius: var(--radius-pill, 999px); padding: 3px 10px; font-size: 0.9rem; }
    .root b { font-weight: var(--fw-heavy); }
    .means { margin: 10px 0 0; font-size: 0.98rem; }
    @keyframes gl-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    @media (max-width: 560px) {
      .card { left: 8px !important; right: 8px; top: auto !important; bottom: 8px; width: auto;
              animation-name: gl-up; }
      @keyframes gl-up { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
    }
    @media (prefers-reduced-motion: reduce) { .card { animation: none; } }
  `, unsafeCSS(CHARACTER_CSS)];

  constructor() {
    super();
    this._term = null;
    this._open = false;
    this._anchor = null;
    this._onOpen = (p) => this._show(p);
    this._onKey = (e) => {
      if (!this._open) return;
      if (e.key === 'Escape') { e.stopPropagation(); this._close(true); }
      // The lesson turns a beat on the arrow keys: the card belongs to the old one.
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') this._close(false);
    };
    this._onDown = (e) => {
      if (!this._open) return;
      const path = e.composedPath();
      if (path.includes(this.shadowRoot.querySelector('.card'))) return;
      if (path.some((n) => n?.classList?.contains?.('gl-term'))) return; // the next term opens itself
      this._close(false);
    };
    this._onMove = () => this._place();
    this._raf = 0;
  }

  // While open, follow the word: a reveal step, a re-render or a page turn can
  // move it or remove it without any scroll or resize event.
  _follow() {
    cancelAnimationFrame(this._raf);
    if (!this._open) return;
    this._place();
    this._raf = requestAnimationFrame(() => this._follow());
  }

  connectedCallback() {
    super.connectedCallback();
    EventBus.on('glossary:open', this._onOpen);
    document.addEventListener('keydown', this._onKey, true);
    document.addEventListener('pointerdown', this._onDown, true);
    window.addEventListener('resize', this._onMove);
    window.addEventListener('scroll', this._onMove, true);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    EventBus.off('glossary:open', this._onOpen);
    document.removeEventListener('keydown', this._onKey, true);
    document.removeEventListener('pointerdown', this._onDown, true);
    window.removeEventListener('resize', this._onMove);
    window.removeEventListener('scroll', this._onMove, true);
    cancelAnimationFrame(this._raf);
  }

  _show({ term, anchor }) {
    // Tapping the word that is already open closes it.
    if (this._open && this._term?.id === term.id && this._anchor === anchor) { this._close(true); return; }
    this._term = term;
    this._anchor = anchor;
    this._open = true;
    this.updateComplete.then(() => {
      const card = this.shadowRoot.querySelector('.card');
      const face = this.shadowRoot.querySelector('.face');
      if (face) face.innerHTML = term.face ? characterSvg(term.face.art, term.face.tone) : '';
      this._place();
      card?.focus({ preventScroll: true });
      this._follow();
    });
  }

  _close(returnFocus) {
    this._open = false;
    cancelAnimationFrame(this._raf);
    const a = this._anchor;
    this._anchor = null;
    if (returnFocus && a?.isConnected) a.focus({ preventScroll: true });
  }

  _place() {
    const card = this.shadowRoot?.querySelector('.card');
    const a = this._anchor;
    if (!this._open || !card || !a) return;
    if (!a.isConnected) { this._close(false); return; }
    const r = a.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) { this._close(false); return; }
    if (innerWidth <= 560) { card.style.left = card.style.top = ''; return; }
    const w = card.offsetWidth, h = card.offsetHeight;
    let left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), innerWidth - w - 12);
    let top = r.bottom + 8;
    if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 8);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  render() {
    const t = this._term;
    if (!t || !this._open) return html``;
    const tone = t.face?.tone;
    return html`
      <div class="card" role="dialog" aria-label=${t.term} tabindex="-1"
           style=${tone ? `--gl-accent: var(--sim-series-${tone})` : ''}>
        <div class="head">
          ${t.face ? html`<div class="face" aria-hidden="true"></div>` : ''}
          <div class="who">
            <p class="term">${t.term}</p>
            ${t.plain ? html`<p class="plain">${t.plain}</p>` : ''}
          </div>
          <button class="x" type="button" aria-label="Close" @click=${() => this._close(true)}>×</button>
        </div>
        ${t.roots.length ? html`<div class="roots">
          ${t.roots.map((r) => html`<span class="root"><b>${r.part}</b> = ${r.means}</span>`)}
        </div>` : ''}
        ${t.means ? html`<p class="means">${t.means}</p>` : ''}
      </div>`;
  }
}

customElements.define('glossary-popover', GlossaryPopover);
