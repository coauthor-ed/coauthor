import { LitElement, html, svg, css } from 'lit';
import { BRAND_DEFS, quillHead, PEN, brandPaint } from './brandSvg.js';

/**
 * <quill-loader> — the app's one loading indicator: the feather pen inks a
 * circle round Quill's head while his eyes follow it.
 *
 *   <quill-loader></quill-loader>                         64 px, says "Loading"
 *   <quill-loader size="40" label="Loading guides..."></quill-loader>
 *   <quill-loader inline label="Loading equation editor..."></quill-loader>
 *
 * The ring and track mix the host's text colour with Quill's indigo, so the
 * loader reads on paper, on the night sky and in dark theme without a token
 * per surface. It fades in after a beat, so a load that finishes quickly never
 * flashes it. prefers-reduced-motion: nothing travels; the ring only breathes.
 */

const LOADER = svg`
  ${BRAND_DEFS}
  <circle cx="70" cy="70" r="58" class="track" stroke-width="7" fill="none"/>
  <circle class="ring" cx="70" cy="70" r="58" stroke-width="7" stroke-linecap="round" fill="none"/>
  <g class="orbit"><g transform="translate(128 70) rotate(200) scale(.62)">${PEN}</g></g>
  <g class="look"><g transform="translate(34 30) scale(.3)">${quillHead()}</g></g>`;

export class QuillLoader extends LitElement {
  static properties = {
    size: { type: Number },
    label: { type: String },
    inline: { type: Boolean, reflect: true },
  };

  static styles = [brandPaint, css`
    :host {
      display: grid; justify-items: center; align-content: center; gap: 10px;
      padding: 12px; color: inherit;
      animation: appear 0.2s 0.15s both;
    }
    :host([inline]) { display: inline-flex; align-items: center; gap: 8px; padding: 0; vertical-align: middle; }
    svg { display: block; overflow: visible; }
    .label { white-space: nowrap; font-weight: 700; font-size: 0.95em; opacity: 0.8; text-align: center; }
    .track { stroke: color-mix(in srgb, currentColor 14%, transparent); }
    .ring { stroke: color-mix(in srgb, currentColor 40%, var(--quill-body-hi)); }

    /* circumference 2 * pi * 58 = 364.4; the offset equals the dash, so the ink
       trails behind the nib instead of running ahead of it */
    .ring { stroke-dasharray: 95 270; stroke-dashoffset: 95; transform-origin: 70px 70px; animation: spin 1.4s linear infinite, grow 1.4s ease-in-out infinite; }
    .orbit { transform-origin: 70px 70px; animation: spin 1.4s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes grow { 50% { stroke-dasharray: 30 335; stroke-dashoffset: 30; } }
    /* the eyes trace the pen's circle */
    .pupil { animation: roll 1.4s linear infinite; }
    @keyframes roll {
      0% { transform: translate(8px, 0); } 12.5% { transform: translate(5.6px, 5.6px); } 25% { transform: translate(0, 8px); }
      37.5% { transform: translate(-5.6px, 5.6px); } 50% { transform: translate(-8px, 0); } 62.5% { transform: translate(-5.6px, -5.6px); }
      75% { transform: translate(0, -8px); } 87.5% { transform: translate(5.6px, -5.6px); } 100% { transform: translate(8px, 0); } }
    .eye { animation: blink 4.2s 1s infinite; }
    @keyframes blink { 0%, 94%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.1); } }
    @keyframes appear { from { opacity: 0; } }

    @media (prefers-reduced-motion: reduce) {
      .orbit, .pupil, .eye { animation: none; }
      .ring { animation: breathe 1.6s ease-in-out infinite; stroke-dasharray: none; stroke-dashoffset: 0; }
      @keyframes breathe { 50% { opacity: 0.35; } }
    }
  `];

  constructor() {
    super();
    this.size = 0;
    this.label = '';
    this.inline = false;
  }

  render() {
    const px = this.size || (this.inline ? 22 : 64);
    const name = this.label || 'Loading';
    return html`
      <svg viewBox="0 0 140 140" width=${px} height=${px} role="img" aria-label=${name}>${LOADER}</svg>
      ${this.label ? html`<span class="label" aria-hidden="true">${this.label}</span>` : ''}
    `;
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.hasAttribute('role')) this.setAttribute('role', 'status');
  }
}

customElements.define('quill-loader', QuillLoader);
