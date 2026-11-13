import { LitElement, html, css, unsafeCSS } from 'lit';
import {
  quillMarkup, quillStyles, performAct, setExpression, trackPupils, ACTS,
} from '../../core/quill/QuillRig.js';

let instanceSeq = 0;

/**
 * <quill-mascot> — Quill in app chrome.
 *
 * The rig markup and behaviour live in core/quill/QuillRig.js, shared verbatim
 * with DomSimulation scenes via SimMascotDom.js. This element owns only the
 * element-shaped concerns: sizing, the speech bubble, pointer tracking, the
 * a11y contract, and the restraint budget.
 *
 * Restraint budget (docs/ui-ux-design-system.md 1.1.2) is
 * enforced HERE, not at each call site, so no caller can accidentally make him
 * hop on every slide: one act per ACT_COOLDOWN_MS, and a request that arrives
 * while an act is running is dropped rather than queued.
 *
 * a11y: decorative by default (aria-hidden). He only becomes announceable when
 * he is actually carrying words — i.e. when `lines` or a speak() call gives him
 * a bubble, in which case the bubble text is the accessible name.
 */
const ACT_COOLDOWN_MS = 20000;

// A single-line `lines` array (today, only ProgressiveDisclosureMixin's
// "result" callout — see _startLineRotation()) used to persist forever, with
// nothing but a page navigation to clear it. On a narrow/portrait layout the
// bubble can sit right over the beat text it's meant to be reacting to, so it
// needs to get out of the way on its own — longer than speak()'s own 4s
// default since this bubble sits beside real content worth reading, not just
// a fire-and-forget reaction.
const SINGLE_LINE_AUTO_HIDE_MS = 6000;

const SIZES = { mini: 56, sm: 96, md: 160, hero: 280 };

// Idle loops (Q-46, battery): the rig's own blink, scarf flutter and bob, plus
// any loop a host puts on this element itself (the hero card's hero-bob). They
// pause while he is off-screen, the tab is hidden, or the host marks him
// dormant (a hidden coach); with rest-after they wind down to his rest pose.
const RIG_IDLE = new Set(['q-blink', 'q-flutter', 'q-bob']);

export class QuillMascot extends LitElement {
  static properties = {
    size: { type: String, reflect: true },
    expression: { type: String, reflect: true },
    act: { type: String },
    lines: { type: Array },
    trackPointer: { type: Boolean, attribute: 'track-pointer' },
    idle: { type: Boolean, reflect: true },
    /** Host says he cannot be seen (opacity 0, a closed dock): idle loops pause. */
    dormant: { type: Boolean },
    /** ms of idle motion before he settles (each loop ends its cycle); 0 = never.
     *  A tap, an act (a cue) or a route change wakes him for another round. */
    restAfter: { type: Number, attribute: 'rest-after' },
    _speech: { state: true },
  };

  static styles = css`
    :host {
      display: inline-block;
      position: relative;
      line-height: 0;
      width: var(--quill-size, 160px);
    }
    :host([size='mini']) { --quill-size: 56px; }
    :host([size='sm'])   { --quill-size: 96px; }
    :host([size='md'])   { --quill-size: 160px; }
    :host([size='hero']) { --quill-size: 280px; }

    .quill-svg {
      filter: drop-shadow(0 18px 22px rgb(0 0 0 / 0.28));
    }

    .bubble {
      position: absolute;
      bottom: 92%;
      left: 46%;
      min-width: 150px;
      max-width: 260px;
      background: var(--bg-surface);
      color: var(--text-main);
      border: 2px solid var(--border-color);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px;
      font-family: var(--font-family);
      font-weight: 700;
      font-size: var(--fs-small);
      line-height: 1.4;
      box-shadow: var(--shadow-lg);
      transition: opacity var(--motion-base) ease;
      z-index: 5;
      cursor: pointer;
    }
    .bubble[hidden] { display: none; }
    .bubble:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }

    ${unsafeCSS(quillStyles(':host'))}
  `;

  constructor() {
    super();
    this.size = 'md';
    this.expression = 'happy';
    this.act = '';
    this.lines = null;
    this.trackPointer = false;
    this.idle = true;
    this.dormant = false;
    this.restAfter = 0;
    this._speech = '';
    this._onScreen = true;
    this._rested = false;
    this._held = new Set();
    this._wound = new Set();   // loops we let finish (a finished one drops out of getAnimations())
    this._sync = this._sync.bind(this);
    this.wake = this.wake.bind(this);
    this._ns = `q${++instanceSeq}`;
    this._busy = false;
    this._lastActAt = 0;
    this._rafPending = false;
    this._onPointerMove = this._onPointerMove.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.setAttribute('data-idle', String(!!this.idle));
    if (!this.lines) this.setAttribute('aria-hidden', 'true');
    if (this.trackPointer) window.addEventListener('pointermove', this._onPointerMove, { passive: true });
    if (this.lines?.length) this._startLineRotation();
    document.addEventListener('visibilitychange', this._sync);
    window.addEventListener('hashchange', this.wake);
    this.addEventListener('pointerdown', this.wake);
    if (typeof IntersectionObserver === 'function') {
      this._io = new IntersectionObserver((es) => {
        this._onScreen = es[es.length - 1].isIntersecting;
        this._sync();
      });
      this._io.observe(this);
    }
    this._armRest();
  }

  disconnectedCallback() {
    document.removeEventListener('visibilitychange', this._sync);
    window.removeEventListener('hashchange', this.wake);
    this.removeEventListener('pointerdown', this.wake);
    this._io?.disconnect();
    this._io = null;
    clearTimeout(this._restTimer);
    // Always remove: a listener outliving the element is the classic leak, and
    // this one fires on every mouse move for the life of the page.
    window.removeEventListener('pointermove', this._onPointerMove);
    clearInterval(this._lineTimer);
    clearTimeout(this._speechTimer);
    super.disconnectedCallback();
  }

  updated(changed) {
    if (changed.has('expression')) setExpression(this.renderRoot, this.expression);
    if (changed.has('idle')) this.setAttribute('data-idle', String(!!this.idle));
    if (changed.has('idle') || changed.has('dormant')) requestAnimationFrame(this._sync);
    if (changed.has('restAfter')) this._armRest();
    if (changed.has('act') && this.act) {
      this.perform(this.act);
      this.act = '';
    }
    if (changed.has('lines')) {
      this.setAttribute('aria-hidden', this.lines?.length ? 'false' : 'true');
      if (this.lines?.length) this._startLineRotation();
    }
  }

  /** rAF-throttled: pointermove fires far faster than we can usefully repaint. */
  _onPointerMove(e) {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      trackPupils(this.renderRoot, nx * 2.8, ny * 2.3);
    });
  }

  _startLineRotation() {
    clearInterval(this._lineTimer);
    clearTimeout(this._speechTimer);
    if (!this.lines?.length) return;
    let i = 0;
    this._speech = this.lines[0];
    if (this.lines.length < 2) {
      // A single line has nothing to rotate to, so — unlike the multi-line
      // case below, which is meant to keep talking — it gets the same
      // auto-hide `speak()` already gives an imperative one-off line.
      this._speechTimer = setTimeout(() => this.dismiss(), SINGLE_LINE_AUTO_HIDE_MS);
      return;
    }
    this._lineTimer = setInterval(() => {
      i = (i + 1) % this.lines.length;
      this._speech = this.lines[i];
    }, 4300);
  }

  /**
   * Hides the speech bubble early — the click handler on `.bubble` below, and
   * available to any caller that wants to end a reaction before its timeout.
   * Stops whichever timer is currently in flight (single-line auto-hide,
   * `speak()`'s own timer, or the multi-line rotation) so a dismissed bubble
   * cannot come back on its own; only a fresh `.lines`/`speak()` call can
   * bring him back to speaking.
   */
  dismiss() {
    clearInterval(this._lineTimer);
    clearTimeout(this._speechTimer);
    this._speech = '';
    // Unlike speak()'s own timeout (which leaves aria-hidden alone when a
    // `.lines` rotation is still meant to resume), a dismissal is final —
    // nothing is being said any more, full stop.
    this.setAttribute('aria-hidden', 'true');
  }

  /**
   * Play an act, subject to the restraint budget. Returns true if it ran.
   * Callers may fire freely; this is what keeps him from becoming noise.
   * `force` skips the cooldown (never the one-at-a-time rule) and is only for
   * an act the user asked for directly, e.g. a tap on him: the budget exists
   * to stop ambient noise, not to ignore the user.
   * `target` { x, y } (viewport px) is what `point` points at.
   */
  async perform(act, { force = false, target = null } = {}) {
    if (!ACTS.includes(act)) return false;
    const now = Date.now();
    if (this._busy || (!force && now - this._lastActAt < ACT_COOLDOWN_MS)) return false;
    this._busy = true;
    this._lastActAt = now;
    this.wake();
    try {
      await performAct(this.renderRoot, act, target);
    } finally {
      this._busy = false;
      this.dispatchEvent(new CustomEvent('quill-act-finished', { detail: { act }, bubbles: true, composed: true }));
    }
    return true;
  }

  // -- idle loops -----------------------------------------------------------

  /** Every idle loop on him: the rig's (shadow) and the host's (on this element). */
  _idleAnims() {
    const loop = (a) => a.effect?.getTiming?.().iterations === Infinity || this._wound.has(a);
    const own = (this.getAnimations?.() || []).filter(loop);
    const rig = (this.renderRoot?.getAnimations?.() || []).filter((a) => RIG_IDLE.has(a.animationName));
    return [...own, ...rig];
  }

  /** Can anyone see him right now? */
  get _active() {
    return this.isConnected && this._onScreen && !this.dormant && document.visibilityState !== 'hidden';
  }

  /** Pause idle loops nobody can see; resume the ones we paused when he is seen again. */
  _sync() {
    const anims = this._idleAnims();
    if (!this._active) {
      for (const a of anims) {
        if (a.playState === 'running') { a.pause(); this._held.add(a); }
      }
      return;
    }
    for (const a of this._held) if (a.playState === 'paused') a.play();
    this._held.clear();
  }

  _armRest() {
    clearTimeout(this._restTimer);
    if (!(this.restAfter > 0) || !this.isConnected) return;
    this._restTimer = setTimeout(() => this._rest(), this.restAfter);
  }

  /** Let every idle loop finish the cycle it is in: he ends in his rest pose, no jump. */
  _rest() {
    if (!this._active) { this._armRest(); return; }   // nobody saw the round: try again later
    for (const a of this._idleAnims()) {
      const t = a.effect?.getComputedTiming?.();
      if (!t || t.iterations !== Infinity) continue;
      a.effect.updateTiming({ iterations: (t.currentIteration ?? 0) + 1 });
      this._wound.add(a);
    }
    this._rested = true;
  }

  /** Another round of idle motion (a tap, an act, a route change). */
  wake() {
    if (this.restAfter > 0) {
      if (this._rested) {
        this._rested = false;
        const wound = [...this._wound];
        this._wound.clear();
        for (const a of wound) {
          const t = a.effect?.getComputedTiming?.();
          if (!t || t.iterations === Infinity) continue;
          const done = a.playState === 'finished';
          a.effect.updateTiming({ iterations: Infinity });
          if (!done) continue;   // still in its last cycle: it simply carries on
          a.currentTime = 0;
          if (this._active) a.play(); else { a.pause(); this._held.add(a); }
        }
      }
      this._armRest();
    }
  }

  /** Glance: pupils only, so like an expression it is not an act. dx/dy are
   *  roughly -1..1; 0, 0 looks straight ahead. */
  look(dx = 0, dy = 0) {
    trackPupils(this.renderRoot, dx * 2.8, dy * 2.3);
  }

  /** Bypasses the cooldown deliberately: an expression is not an animation. */
  setExpression(name) {
    this.expression = name;
  }

  speak(text, ms = 4000) {
    clearInterval(this._lineTimer);
    clearTimeout(this._speechTimer);
    this._speech = text;
    this.setAttribute('aria-hidden', 'false');
    if (ms > 0) {
      this._speechTimer = setTimeout(() => {
        this._speech = '';
        if (!this.lines?.length) this.setAttribute('aria-hidden', 'true');
      }, ms);
    }
  }

  /**
   * The rig is injected once, imperatively, rather than through a lit directive:
   * the `unsafeSVG` directive is not in the vendored lit bundle (vendor/lit.js
   * exports only unsafeCSS), and adding it would need a new import-map entry -
   * which the CSP pins by sha256, so every module import on the page would break
   * until that hash is recomputed. Injecting here also means this element and
   * SimMascotDom.js use the identical mechanism on the identical markup.
   *
   * Not a sanitization concern (invariant 6): quillMarkup() is a constant built
   * in our own module from no external input.
   */
  firstUpdated() {
    const host = this.renderRoot.querySelector('.rig');
    if (host) host.insertAdjacentHTML('afterbegin', quillMarkup(this._ns));
    setExpression(this.renderRoot, this.expression);
  }

  render() {
    return html`
      <div
        class="bubble"
        ?hidden=${!this._speech}
        role=${this._speech ? 'status' : 'presentation'}
        tabindex=${this._speech ? '0' : '-1'}
        title="Dismiss"
        @click=${this._onBubbleClick}
        @keydown=${this._onBubbleKeydown}
      >
        ${this._speech}
      </div>
      <div class="rig"></div>
    `;
  }

  /** Clicking the bubble closes it early — mainly so it can't sit over
   *  whatever's behind/beside him (see `dismiss()`'s own doc comment). Stops
   *  propagation so this never doubles as a click on something underneath. */
  _onBubbleClick(e) {
    e.stopPropagation();
    this.dismiss();
  }

  _onBubbleKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    this.dismiss();
  }
}

customElements.define('quill-mascot', QuillMascot);
