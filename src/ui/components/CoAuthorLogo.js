import { LitElement, html, svg, css } from 'lit';
import { BRAND_DEFS, quillHead, PEN, brandPaint } from './brandSvg.js';

/**
 * <coauthor-logo> — the brand lockup: Quill's head on a sunny tile, plus the
 * "coauthor" wordmark.
 *
 * Shapes come from brandSvg.js (core/quill/quillShapes.js underneath), so the
 * logo is the same penguin as <quill-mascot> and the canvas Quill. Colours are the brand tokens in
 * theme.css (--quill-*, --logo-*); "author" mixes the host's text colour
 * with Quill's indigo, so it follows whatever surface the header sits on.
 *
 * Motion:
 *   - intro: the first logo connected per page load writes its wordmark with
 *     a feather pen while Quill's eyes follow the pen, then Quill hops;
 *   - idle: a blink and a glance, with long gaps;
 *   - tap: a squash-and-hop.
 * prefers-reduced-motion shows the finished lockup with nothing moving.
 *
 * Hosts size it with --logo-size (the tile) and font-size (the wordmark), and
 * hide the wordmark on narrow screens with coauthor-logo::part(word).
 */

let introPlayed = false;

// Idle rhythm, as the old CSS loops had it: a blink every 6.5 s (0.2 s long,
// first at 8.5 s), a glance every 13 s (2.1 s long, first at 10.2 s).
const BLINK_EVERY = 6500, BLINK_FIRST = 8510;
const GLANCE_EVERY = 13000, GLANCE_FIRST = 10200;
const BLINK_FRAMES = [{ transform: 'scaleY(1)', easing: 'ease' }, { transform: 'scaleY(0.08)', easing: 'ease' }, { transform: 'scaleY(1)' }];
const GLANCE_FRAMES = [
  { transform: 'none', offset: 0, easing: 'ease' }, { transform: 'translate(-6px, -5px)', offset: 0.25, easing: 'ease' },
  { transform: 'translate(-6px, -5px)', offset: 0.75, easing: 'ease' }, { transform: 'none', offset: 1 },
];

// Quill's head rising from the bottom edge of a sunny tile.
const MARK = svg`
  ${BRAND_DEFS}
  <clipPath id="tile"><rect width="96" height="96" rx="24"/></clipPath>
  <g clip-path="url(#tile)">
    <rect width="96" height="96" class="f-tile"/>
    <circle cx="48" cy="40" r="34" class="f-ring"/>
    <g class="quill"><g transform="translate(-2 10) scale(.42)">${quillHead()}</g></g>
  </g>`;

const PEN_SVG = html`<svg class="pen" viewBox="-20 -90 40 96" aria-hidden="true">${PEN}</svg>`;

export class CoAuthorLogo extends LitElement {
  static properties = {
    _intro: { state: true },
    _pending: { state: true },
  };

  static styles = [brandPaint, css`
    :host {
      display: inline-flex; align-items: center; gap: var(--logo-gap, 0.45em);
      font-family: 'Fredoka', 'Nunito', system-ui, sans-serif; font-weight: 600;
      line-height: 1; white-space: nowrap; vertical-align: middle;
    }
    .mark {
      width: var(--logo-size, 36px); height: var(--logo-size, 36px); flex: none; display: block; overflow: visible;
      filter: drop-shadow(0 2px 0 var(--logo-tile-shade));
    }

    .word { position: relative; display: inline-block; padding-block: 0.12em; letter-spacing: -0.01em; }
    .ink { color: color-mix(in srgb, currentColor 55%, var(--quill-body-hi)); text-shadow: 0 0.07em 0 var(--logo-word-lip); }
    .ink b { font-weight: inherit; color: var(--quill-scarf); text-shadow: 0 0.07em 0 var(--quill-scarf-lo); }
    .pen { position: absolute; left: 100%; bottom: 0.1em; width: 0.62em; height: 1.5em; opacity: 0; pointer-events: none; transform-origin: 50% 94%; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

    .quill { transform-box: fill-box; transform-origin: 50% 100%; }
    .pupil { transition: transform 0.2s ease-out; }

    /* idle: a blink and a glance, long gaps. Played one at a time from a timer
       (see _blink, _glance), not as endless CSS loops: an endless loop keeps the
       compositor drawing frames between blinks (Q-46, battery). */
    :host(:hover) .pupil { transform: translate(4px, -7px); }

    /* intro: the pen writes the word, Quill's eyes follow, then a hop */
    .pending .ink { clip-path: inset(0 100% 0 0); }
    .intro .ink { animation: write 1.15s 0.35s cubic-bezier(0.45, 0, 0.55, 1) both; }
    @keyframes write { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
    .intro .pen { animation: pen 1.6s 0.15s cubic-bezier(0.45, 0, 0.55, 1) both; }
    @keyframes pen {
      0% { left: -30%; opacity: 0; transform: translateY(-40%) rotate(28deg) scale(0.6); }
      12% { left: 0%; opacity: 1; transform: rotate(24deg); }
      22% { transform: translateY(-14%) rotate(18deg); } 34% { transform: translateY(6%) rotate(26deg); }
      46% { transform: translateY(-12%) rotate(18deg); } 58% { transform: translateY(6%) rotate(26deg); }
      70% { transform: translateY(-10%) rotate(20deg); }
      84% { left: 100%; opacity: 1; transform: rotate(24deg); }
      100% { left: 104%; opacity: 0; transform: translateY(-60%) rotate(380deg) scale(0.3); }
    }
    .intro .pupil { animation: follow 1.6s 0.15s ease-in-out both; }
    @keyframes follow { 0% { transform: none; } 20% { transform: translate(5px, 6px); } 84% { transform: translate(10px, 5px); } 100% { transform: none; } }
    .intro .quill { animation: hop 0.6s 1.75s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
    @keyframes hop { 40% { transform: translateY(-9%) scale(0.95, 1.06); } 70% { transform: scale(1.06, 0.95); } }

    /* tap */
    .boing .quill { animation: boing 0.7s cubic-bezier(0.3, 0, 0.3, 1); }
    @keyframes boing {
      18% { transform: scale(1.14, 0.84); } 45% { transform: translateY(-16%) scale(0.9, 1.12); }
      70% { transform: scale(1.1, 0.9); } 85% { transform: scale(0.97, 1.03); } }

    @media (prefers-reduced-motion: reduce) {
      * { animation: none !important; transition: none !important; }
      .pen { display: none; }
    }
  `];

  constructor() {
    super();
    this._intro = false;
    this._pending = false;
    this._onTap = this._onTap.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('pointerdown', this._onTap);
    // The intro goes to the first logo that is still on screen a moment after
    // it connects: the app shell renders its own header for a frame before the
    // route swaps in the welcome page's bar, and that one must not use it up.
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Hold the word back while waiting, so it does not flash in and then vanish.
    this._pending = !introPlayed && !reduced;
    this._introTimer = setTimeout(() => {
      this._pending = false;
      if (introPlayed || reduced || !this.isConnected || !this.offsetWidth) return;
      introPlayed = true;
      this._intro = true;
      this._introTimer = setTimeout(() => { this._intro = false; }, 2500);
    }, 200);
    if (!reduced) {
      this._blinkTimer = setTimeout(() => this._blink(), BLINK_FIRST);
      this._glanceTimer = setTimeout(() => this._glance(), GLANCE_FIRST);
    }
  }

  /** Idle moves play only when someone can see them. */
  _canIdle() {
    return this.isConnected && !this._intro && this.offsetWidth > 0 && document.visibilityState !== 'hidden';
  }

  _blink() {
    this._blinkTimer = setTimeout(() => this._blink(), BLINK_EVERY);
    if (!this._canIdle()) return;
    this.renderRoot.querySelectorAll('.eye').forEach((e, i) => e.animate?.(BLINK_FRAMES, { duration: 195, delay: i * 60 }));
  }

  _glance() {
    this._glanceTimer = setTimeout(() => this._glance(), GLANCE_EVERY);
    if (!this._canIdle() || this.matches(':hover')) return;
    this.renderRoot.querySelectorAll('.pupil').forEach((e) => e.animate?.(GLANCE_FRAMES, { duration: 2080 }));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('pointerdown', this._onTap);
    clearTimeout(this._introTimer);
    clearTimeout(this._tapTimer);
    clearTimeout(this._blinkTimer);
    clearTimeout(this._glanceTimer);
  }

  _onTap() {
    if (this._intro) return;
    const mark = this.renderRoot.querySelector('.mark');
    if (!mark) return;
    mark.classList.remove('boing');
    void mark.getBoundingClientRect();
    mark.classList.add('boing');
    clearTimeout(this._tapTimer);
    this._tapTimer = setTimeout(() => mark.classList.remove('boing'), 800);
  }

  render() {
    return html`
      <svg class="mark ${this._intro ? 'intro' : ''}" viewBox="0 0 96 96" aria-hidden="true">${MARK}</svg>
      <span class="word ${this._intro ? 'intro' : this._pending ? 'pending' : ''}" part="word" aria-hidden="true">
        <span class="ink"><b>co</b>author</span>${PEN_SVG}
      </span>
      <span class="sr">CoAuthor</span>
    `;
  }
}

customElements.define('coauthor-logo', CoAuthorLogo);
