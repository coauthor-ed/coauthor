import './LookSlots.js';
import { LitElement, html, css } from 'lit';
import { mountOrphanPreview } from '../../core/preview/mountOrphanPreview.js';
import { btn3dStyles } from '../sharedStyles.js';

/**
 * <try-block>: one live question or block inside a guide (a ```coauthor-try
 * fence) or on the landing page. Mounted through the real plugin pipeline
 * (mountOrphanPreview -> mountPlugin, inside a PluginErrorBoundary), so it
 * behaves exactly as in a lesson. Nothing is written to ProgressStore: only
 * LessonSession/TestSession record answers, and this is neither.
 *
 * A question gets a Check button (and Try again after); a block runs on its
 * own. A bad payload shows a small error card, never breaks the page.
 *
 * Descriptive questions bring their own submit button with coaching (hints
 * per missed point, a guided build), so for those (SELF_CHECK) TryBlock adds
 * no Check of its own: it watches for the plugin's own submit, and once the
 * plugin counts the question as answered it calls evaluate() to show the
 * explanation, then offers Start over.
 *
 * Every check fires `try-result` (bubbles, composed) with
 * { score: 0..1, correct: boolean, final: boolean } so a page can react
 * (Quill in the student guides). `final` is false while a self-checking
 * question is still coaching (some points missed, hints showing).
 *
 * Properties: `data` (parsed JSON), `bundleId` (for bundle-relative refs),
 * `label` (the tab above it; default "Try it"), `lazy` (mount only when near
 * the viewport, unmount when far; used for heavy blocks on the landing page).
 */
// Question types whose own UI already checks and coaches the answer.
const SELF_CHECK = new Set(['structured-descriptive@1', 'semantic-descriptive@1']);

// A button inside the plugin that submits or grades the answer.
const SUBMIT_TEXT = /submit|grade/i;

function asResult(r, final = true) {
  const score = Math.max(0, Math.min(1, Number(r?.score) || 0));
  const correct = typeof r?.isCorrect === 'boolean' ? r.isCorrect : typeof r?.correct === 'boolean' ? r.correct : score >= 0.999;
  return { score, correct, final };
}

export class TryBlock extends LitElement {
  static properties = {
    data: { type: Object },
    bundleId: { type: String },
    label: { type: String },
    lazy: { type: Boolean },
    _state: { state: true },
    _canCheck: { state: true },
    _self: { state: true },
    _answered: { state: true },
    _error: { state: true },
  };

  static styles = [btn3dStyles, css`
    :host { display: block; margin: var(--space-5) 0; }
    .frame {
      position: relative;
      border: var(--rule-w, 2px) solid var(--border-color);
      border-radius: var(--radius-lg);
      background: var(--bg-surface);
      box-shadow: var(--lip) var(--lip-color);
      padding: var(--space-5) var(--space-4) var(--space-4);
    }
    .tab {
      position: absolute;
      top: -14px;
      left: var(--space-4);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 12px;
      border-radius: var(--radius-pill);
      background: var(--primary-color);
      color: var(--on-primary);
      font-family: var(--font-heading);
      font-weight: var(--fw-strong);
      font-size: 0.85rem;
    }
    .note { margin: 0; color: var(--text-muted); font-size: 0.85rem; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; margin-top: var(--space-3); }
    .mount { min-height: 60px; }
    .wait { color: var(--text-muted); padding: var(--space-4) 0; }
    .err {
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      background: var(--error-bg);
      color: var(--error-text);
      white-space: pre-wrap;
    }
  `];

  constructor() {
    super();
    this.data = null;
    this.bundleId = undefined;
    this.label = 'Try it';
    this.lazy = false;
    this._state = 'idle';
    this._canCheck = false;
    this._answered = false;
    this._error = '';
    this._mounted = null;
    this._self = false;
    this._onMountClick = this._onMountClick.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.lazy && 'IntersectionObserver' in window) {
      this._io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting && this._state === 'idle') this._mount();
      }, { rootMargin: '300px 0px' });
      this._io.observe(this);
    }
  }

  disconnectedCallback() {
    this._io?.disconnect();
    clearTimeout(this._pollT);
    super.disconnectedCallback();
  }

  firstUpdated() {
    const mount = this.renderRoot.querySelector('.mount');
    mount?.addEventListener('pointerdown', () => this._onMountPress(), true);
    mount?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') this._onMountPress(); }, true);
    mount?.addEventListener('click', this._onMountClick);
    if (!this.lazy || !('IntersectionObserver' in window)) this._mount();
  }

  updated(changed) {
    if (changed.has('data') && changed.get('data') !== undefined && this._state !== 'idle') this._mount();
  }

  async _mount() {
    if (!this.data) return;
    this._state = 'loading';
    this._error = '';
    this._answered = false;
    this._self = SELF_CHECK.has(this.data?.type);
    clearTimeout(this._pollT);
    await this.updateComplete;
    const target = this.renderRoot.querySelector('.mount');
    try {
      const boundary = await mountOrphanPreview(this.data, target, { bundleId: this.bundleId });
      await boundary.pluginReady;
      this._mounted = boundary.firstElementChild;
      this._canCheck = typeof this._mounted?.evaluate === 'function';
      this._state = 'ready';
    } catch (e) {
      console.error('[try-block]', e);
      this._error = e.message || String(e);
      this._state = 'error';
    }
  }

  async _check() {
    if (!this._canCheck) return;
    const r = await this._mounted.evaluate();
    this._answered = true;
    this._emit(asResult(r));
  }

  _emit(result) {
    this.dispatchEvent(new CustomEvent('try-checked', { bubbles: true, composed: true }));
    this.dispatchEvent(new CustomEvent('try-result', { bubbles: true, composed: true, detail: result }));
  }

  /** Snapshot of the self-checking question's response, taken before a
   *  press reaches it (some answers grade within the same click). */
  _onMountPress() {
    if (this._self && this._mounted) this._before = JSON.stringify(this._mounted.getResponse?.() ?? null);
  }

  /** A self-checking question's own submit or grade button was pressed.
   *  semantic-descriptive grades asynchronously (an on-device model), so wait
   *  until its response changes, or has stayed the same for a second (the
   *  same answer graded again), for up to 15 s. */
  _onMountClick(e) {
    if (!this._self || !this._mounted) return;
    const btn = e.composedPath().find((n) => n.tagName === 'BUTTON');
    if (!btn || !SUBMIT_TEXT.test(btn.textContent || '')) return;
    const el = this._mounted;
    const before = this._before ?? JSON.stringify(el.getResponse?.() ?? null);
    this._before = null;
    const sync = this.data.type === 'structured-descriptive@1';
    let tries = 0;
    let last = null;
    let same = 0;
    clearTimeout(this._pollT);
    const settle = async () => {
      if (el !== this._mounted) return;
      await el.updateComplete;
      const sig = JSON.stringify(el.getResponse?.() ?? null);
      same = sig === last ? same + 1 : 0;
      last = sig;
      const done = typeof el.isAnswered === 'function' ? el.isAnswered() : true;
      const ready = sync || sig !== before || (done && same >= 4);
      if (!ready && tries++ < 60) { this._pollT = setTimeout(settle, 250); return; }
      // Once the plugin is satisfied, evaluate() reveals the explanation.
      const r = done ? await el.evaluate?.() : el.constructor.score?.(this.data, el.getResponse());
      if (done) this._answered = true;
      this._emit(asResult(r, done));
    };
    this._pollT = setTimeout(settle, sync ? 0 : 250);
  }

  render() {
    return html`
      <div class="frame">
        <span class="tab">${this.label}</span>
        ${this._state === 'loading' ? html`<div class="wait"><app-loader size="48" label="Loading..."></app-loader></div>` : ''}
        ${this._state === 'error' ? html`<div class="err" role="alert">This example could not load.\n${this._error}</div>` : ''}
        <div class="mount"></div>
        ${this._canCheck && this._self ? html`
          <div class="row">
            <p class="note">Practice only. Your answer is not kept.</p>
            ${this._answered ? html`<button class="btn-3d btn-secondary btn-sm" @click=${() => this._mount()}>Start over</button>` : ''}
          </div>` : this._canCheck ? html`
          <div class="row">
            <p class="note">Practice only. Nothing here is saved.</p>
            ${this._answered
              ? html`<button class="btn-3d btn-secondary btn-sm" @click=${() => this._mount()}>Try again</button>`
              : html`<button class="btn-3d btn-primary btn-sm" @click=${() => this._check()}>Check</button>`}
          </div>` : ''}
      </div>
    `;
  }
}

customElements.define('try-block', TryBlock);
