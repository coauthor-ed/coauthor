import { LitElement, html, css } from 'lit';
import { EventBus } from '../../core/EventBus.js';
import { iconHelp } from '../icons/uiIcons.js';

/**
 * <guide-help slug="typing-maths" label="How to type maths">: a small "?"
 * link to one guide, for the spots where a student or parent needs it
 * (docs/sprints/completed/landing-page-and-guides.md, "Contextual links").
 *
 * It only raises 'guide:open' on the EventBus; AppShell decides how to show
 * the guide (a sheet over a lesson or test, a page anywhere else), so no
 * plugin reaches into the shell (invariant 4). Without `label` it is a bare
 * round "?" with the label as its accessible name.
 */
export class GuideHelp extends LitElement {
  static properties = {
    slug: { type: String },
    label: { type: String },
    compact: { type: Boolean, reflect: true },
  };

  static styles = css`
    :host { display: inline-flex; vertical-align: middle; }
    button {
      display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
      font: inherit; font-family: var(--font-family, inherit); font-weight: var(--fw-heavy); font-size: 0.85rem;
      padding: 4px 10px 4px 6px; border-radius: var(--radius-pill, 999px);
      color: var(--primary-text, var(--primary-color)); background: transparent;
      border: 1.5px solid transparent;
      transition: background var(--motion-fast, 120ms), border-color var(--motion-fast, 120ms);
    }
    button:hover { background: var(--primary-light); border-color: var(--border-color); }
    button:focus-visible { outline: var(--focus-ring, 3px solid currentColor); outline-offset: 2px; }
    svg { width: 18px; height: 18px; flex: none; }
    :host([compact]) button { padding: 4px; }
    :host([compact]) span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `;

  constructor() {
    super();
    this.slug = '';
    this.label = 'Help';
    this.compact = false;
  }

  _open(e) {
    e.stopPropagation();
    EventBus.emit('guide:open', { slug: this.slug });
  }

  render() {
    return html`<button type="button" title=${this.label} @click=${this._open}>${iconHelp}<span>${this.label}</span></button>`;
  }
}

customElements.define('guide-help', GuideHelp);
