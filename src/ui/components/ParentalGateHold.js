import { LitElement, html, css } from 'lit';
import { LessonModeMixin } from '../../core/mixins/LessonModeMixin.js';
import { iconLock, iconUnlock } from '../icons/uiIcons.js';

export class ParentalGateHold extends LessonModeMixin(LitElement) {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      color: var(--text-main);
      font-family: var(--font-family);
    }
    * { box-sizing: border-box; }

    /* Engine card language (lesson-modes-plan.md): token-only, so Classic and
       Story, light and dark all follow. [plain] drops the card for when the
       gate already sits inside a dialog (GateHoldDialog.js). */
    .gate-container {
      max-width: 440px;
      margin: 0 auto;
      padding: var(--space-6) var(--space-5) var(--space-5);
      text-align: center;
      background: var(--bg-surface);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-xl);
      box-shadow: var(--card-shadow), var(--lip) var(--lip-color);
    }
    :host([plain]) .gate-container { padding: var(--space-2) 0 0; background: none; border: none; box-shadow: none; }

    .gate-header h3 {
      margin: 0 0 var(--space-2);
      font-family: var(--font-heading);
      font-weight: var(--heading-weight);
      font-size: 1.45rem;
      line-height: var(--lh-tight);
    }
    .gate-header p {
      margin: 0 auto var(--space-5);
      max-width: 32ch;
      font-size: 0.95rem;
      line-height: 1.5;
      color: var(--text-muted);
    }

    .hold-area { display: flex; flex-direction: column; align-items: center; }

    .ring-wrapper {
      position: relative;
      width: 120px;
      height: 120px;
      margin-bottom: var(--space-5);
      user-select: none;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      touch-action: none;
    }
    .ring-svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .ring-bg { stroke: var(--bg-panel-2); stroke-width: 7; }
    .ring-progress {
      stroke: var(--primary-color);
      stroke-width: 7;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.1s linear;
    }
    .badge-icon {
      position: absolute;
      inset: 16px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--primary-light);
      color: var(--primary-text);
      transition: transform 0.2s var(--ease-spring), background 0.2s ease, color 0.2s ease;
    }
    .badge-icon svg { width: 34px; height: 34px; }
    .ring-wrapper.holding .badge-icon { transform: scale(1.06); }
    .ring-wrapper.unlocked .badge-icon { transform: scale(1.1); background: var(--accent-teal); color: var(--on-accent); }
    .ring-wrapper.unlocked .ring-progress { stroke: var(--accent-teal); }

    .hold-btn {
      position: relative;
      width: 100%;
      min-height: 52px;
      padding: 14px 20px;
      overflow: hidden;
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-md);
      background: var(--bg-surface);
      color: var(--text-main);
      box-shadow: var(--press-1) var(--lip-color);
      font-family: var(--font-heading);
      font-weight: var(--fw-heavy);
      font-size: 1rem;
      cursor: pointer;
      user-select: none;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
    }
    .hold-btn:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }
    .btn-progress-bar {
      position: absolute;
      inset: 0 auto 0 0;
      width: 0%;
      background: var(--primary-light);
      transition: width 0.1s linear;
      z-index: 1;
    }
    .btn-text { position: relative; z-index: 2; display: flex; align-items: center; justify-content: center; gap: 8px; }

    .accessibility-note { margin: var(--space-3) 0 0; font-size: 0.82rem; color: var(--text-muted); }

    :host([data-lesson-mode="story"]) .ring-progress { stroke: var(--accent-gold); }
    :host([data-lesson-mode="story"]) .badge-icon { background: var(--bg-panel); color: var(--text-main); border: var(--rule-w) solid var(--border-color); }

    @media (prefers-reduced-motion: reduce) {
      .ring-progress, .badge-icon, .btn-progress-bar { transition: none; }
    }
  `;

  static properties = {
    _progress: { type: Number, state: true },
    _isHolding: { type: Boolean, state: true },
    _unlocked: { type: Boolean, state: true }
  };

  constructor() {
    super();
    this._progress = 0;
    this._isHolding = false;
    this._unlocked = false;
    this._holdDuration = 2500; // 2.5 seconds
    this._animFrame = null;
    this._startTime = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopHold();
  }

  _startHold(e) {
    if (e && e.type === 'keydown' && (e.code !== 'Space' && e.code !== 'Enter')) return;
    if (this._unlocked || this._isHolding) return;
    
    if (e && e.preventDefault && e.type === 'keydown') e.preventDefault();

    this._isHolding = true;
    this._startTime = performance.now();
    this._tick();
  }

  _stopHold() {
    if (this._unlocked) return;
    this._isHolding = false;
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
    this._progress = 0;
  }

  _tick = () => {
    if (!this._isHolding) return;
    const elapsed = performance.now() - this._startTime;
    this._progress = Math.min(100, (elapsed / this._holdDuration) * 100);

    if (this._progress >= 100) {
      this._unlocked = true;
      this._isHolding = false;
      this.dispatchEvent(new CustomEvent('parental-gate-unlocked', { bubbles: true, composed: true }));
    } else {
      this._animFrame = requestAnimationFrame(this._tick);
    }
  };

  render() {
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (this._progress / 100) * circumference;

    return html`
      <div class="gate-container">
        <div class="gate-header">
          <h3>Grown-ups only</h3>
          <p>Press and hold to open the parent area: progress, practice tests and settings.</p>
        </div>

        <div class="hold-area">
          <div
            class="ring-wrapper ${this._isHolding ? 'holding' : ''} ${this._unlocked ? 'unlocked' : ''}"
            @pointerdown=${this._startHold}
            @pointerup=${this._stopHold}
            @pointerleave=${this._stopHold}
          >
            <svg class="ring-svg" viewBox="0 0 120 120">
              <circle class="ring-bg" cx="60" cy="60" r="${radius}" fill="none" />
              <circle
                class="ring-progress"
                cx="60"
                cy="60"
                r="${radius}"
                fill="none"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${strokeDashoffset}"
              />
            </svg>

            <div class="badge-icon">
              ${this._unlocked ? iconUnlock : iconLock}
            </div>
          </div>

          <button
            class="hold-btn"
            @pointerdown=${this._startHold}
            @pointerup=${this._stopHold}
            @pointerleave=${this._stopHold}
            @keydown=${this._startHold}
            @keyup=${this._stopHold}
            tabindex="0"
          >
            <div class="btn-progress-bar" style="width: ${this._progress}%;"></div>
            <div class="btn-text">
              ${this._unlocked ? html`Unlocked! Entering…` : this._isHolding ? html`Hold (${(Math.max(0, (this._holdDuration - (this._progress/100 * this._holdDuration))/1000)).toFixed(1)}s)` : html`Hold to unlock`}
            </div>
          </button>

          <p class="accessibility-note">
            Touch and hold, click and hold, or hold the Space bar
          </p>
        </div>
      </div>
    `;
  }
}
customElements.define('parental-gate-hold', ParentalGateHold);
