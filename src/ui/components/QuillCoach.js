import { LitElement, html, css } from 'lit';
import './QuillMascot.js';

/**
 * <quill-coach> — the wrong-answer comfort beat's stage.
 *
 * Deliberately lives at the SHELL level, not inside any question plugin. There
 * are 15 question plugins; they are engine contract (init/getResponse/score/
 * reset), they are shadow-isolated, and putting mascot code in each would mean
 * 15 edits and 15 chances to break scoring (invariants 3, 4 and 8).
 *
 * An actor, not a decider (step E2): LessonSession hands this element to its
 * cue:wrong / cue:wrong-again / cue:correct cues as their `companion`, and the
 * Quill look's reactor (src/looks/quill/reactor.js) decides when he appears,
 * what he says and how he looks, through show() / hide() / mascot. Nothing
 * here listens to the bus.
 */
export class QuillCoach extends LitElement {
  static properties = { _visible: { state: true }, _line: { state: true } };

  static styles = css`
    /* Hidden = out of rendering (display: none), not just transparent: an
       opacity-0 fixed layer still takes part in compositing, and where its
       box (with the last line it said) overlapped the action bar it changed
       how the bar's corners were rasterised. display transitions discretely
       so the fade in and out still play. */
    :host {
      position: fixed;
      left: var(--space-4);
      /* Above the lesson's action bar: he never stands on a control. */
      bottom: calc(var(--lesson-chrome-bottom, 0px) + var(--space-2));
      z-index: 300;
      display: none;
      align-items: flex-end;
      gap: var(--space-3);
      pointer-events: none;
      opacity: 0;
      transform: translateY(12px);
      transition: opacity var(--motion-base) var(--ease-settle),
                  transform var(--motion-base) var(--ease-settle),
                  display var(--motion-base) allow-discrete;
    }
    :host([visible]) { display: flex; opacity: 1; transform: none; }
    @starting-style {
      :host([visible]) { opacity: 0; transform: translateY(12px); }
    }
    .line {
      max-width: 260px;
      padding: var(--space-3) var(--space-4);
      background: var(--bg-surface);
      color: var(--text-main);
      border: 2px solid var(--border-color);
      border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px;
      box-shadow: var(--shadow-lg);
      font-family: var(--font-family);
      font-weight: 700;
      font-size: var(--fs-small);
    }
    @media (max-width: 600px) { .line { max-width: 180px; } }
    @media (prefers-reduced-motion: reduce) {
      :host { transition: none; }
    }
  `;

  constructor() {
    super();
    this._visible = false;
    this._line = '';
    this._hideTimer = null;
  }

  disconnectedCallback() {
    clearTimeout(this._hideTimer);
    super.disconnectedCallback();
  }

  /** The Quill inside, for faces and acts. */
  get mascot() {
    return this.renderRoot?.querySelector('quill-mascot') || null;
  }

  /** Slide in with a line; hides itself after `ms`. */
  show(line, ms = 7000) {
    this._line = line;
    this._visible = true;
    this.setAttribute('visible', '');
    clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => this.hide(), ms);
  }

  hide() {
    clearTimeout(this._hideTimer);
    this._visible = false;
    this.removeAttribute('visible');
  }

  render() {
    return html`
      <quill-mascot size="sm" expression="happy" ?idle=${this._visible}></quill-mascot>
      <div class="line" role="status">${this._line}</div>
    `;
  }
}

customElements.define('quill-coach', QuillCoach);
