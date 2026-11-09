import { LitElement, html, css } from 'lit';

const R = 18;
const CIRCUMFERENCE = 2 * Math.PI * R;   // 113.097...

/**
 * <progress-ring> — a circular percentage indicator.
 *
 * Extracted from HomeDashboard, where the ring was decorative only: the markup
 * bound nothing and the CSS hardcoded `stroke-dashoffset: 40`, so every card
 * showed the same fake ~68%. Its `stroke-dasharray: 125` was wrong too - the
 * circumference at r=18 is 113.1, so even the hardcoded value did not mean what
 * it looked like. Both are computed here instead, and TestSession reuses this
 * for the score dial.
 */
export class ProgressRing extends LitElement {
  static properties = {
    value: { type: Number },   // 0..1
    label: { type: String },
    showText: { type: Boolean, attribute: 'show-text' },
  };

  static styles = css`
    :host { display: inline-block; line-height: 0; }
    svg { display: block; width: 100%; height: auto; transform: rotate(-90deg); }
    circle { fill: none; stroke-width: var(--ring-width, 4); stroke-linecap: round; }
    .bg  { stroke: var(--ring-track, rgb(255 255 255 / 0.28)); }
    .val {
      stroke: var(--ring-color, var(--on-primary));
      transition: stroke-dashoffset 800ms var(--motion-reveal-ease, ease-out);
    }
    /* Rendered unconditionally and hidden with CSS, never wrapped in a nested
       lit template: lit parses a nested template as an HTML fragment, so a
       <text> inside one is created in the HTML namespace and is not a real
       SVGTextElement (no getBBox, never painted). Same trap applies to any
       nested SVG child. */
    .pct[hidden] { display: none; }
    .pct {
      transform: rotate(90deg);
      transform-origin: center;
      fill: var(--ring-color, var(--on-primary));
      font-family: var(--font-heading);
      font-weight: var(--fw-heavy);
      font-size: 13px;
      text-anchor: middle;
      dominant-baseline: central;
    }
    @media (prefers-reduced-motion: reduce) { .val { transition: none; } }
  `;

  constructor() {
    super();
    this.value = 0;
    this.label = 'Progress';
    this.showText = false;
    // Sweep in from empty on first paint (prototype v2 a/ .ring): the first
    // render draws an empty ring, the next frame sets the real offset and the
    // stroke-dashoffset transition animates the difference.
    this._swept = false;
  }

  firstUpdated() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this._swept = true;
      this.requestUpdate();
    }));
  }

  render() {
    const v = Math.max(0, Math.min(1, Number(this.value) || 0));
    const pct = Math.round(v * 100);
    return html`
      <svg viewBox="0 0 44 44" role="img" aria-label="${this.label}: ${pct}%">
        <circle class="bg"  cx="22" cy="22" r="${R}"></circle>
        <circle class="val" cx="22" cy="22" r="${R}"
          stroke-dasharray="${CIRCUMFERENCE}"
          stroke-dashoffset="${CIRCUMFERENCE * (1 - (this._swept ? v : 0))}"></circle>
        <text class="pct" x="22" y="22" ?hidden=${!this.showText}>${pct}%</text>
      </svg>
    `;
  }
}

customElements.define('progress-ring', ProgressRing);
