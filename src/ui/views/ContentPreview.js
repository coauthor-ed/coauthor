import '../components/LookSlots.js';
import { LitElement, html, css } from 'lit';
import { ContentLoader } from '../../core/ContentLoader.js';
import { CourseSourceManager } from '../../core/CourseSourceManager.js';
import { mountOrphanPreview } from '../../core/preview/mountOrphanPreview.js';
import { LessonModeManager } from '../../core/LessonModeManager.js';
import { btn3dStyles } from '../sharedStyles.js';

/**
 * Renders a single block or question JSON file standalone — no lesson,
 * module, or test wraps it. Reached via
 * `#/preview/<contentPath>?preview=true&beat=N`, e.g.
 * `#/preview/courses/<bundleId>/blocks/L01/blk-l01-s01.json?preview=true&beat=2`
 * (`preview=true` is required the same way it is for `#/lesson/...` — it's
 * what makes ContentLoader.loadJSON() serve ai-draft content at all; this
 * route doesn't imply it on its own. `beat` is the same deep-link param
 * `#/lesson/...` already supports — LessonEngine's opts.beatIndex — jumping
 * a progressive-disclosure block straight to that beat). `<bundleId>` need
 * not be a locally hosted or registered course — src/app.js's bootstrap
 * reads a top-level `?remoteManifestUrl=` param before routing ever starts
 * and registers that bundle's origin for this tab only
 * (CourseSourceManager.registerEphemeral()), so a content-repo-template
 * checkout served over plain HTTP, or a teammate's LAN box, resolves the
 * same way a locally hosted course does.
 *
 * Delegates all actual mounting to mountOrphanPreview() (src/core/preview/) —
 * this view is just the URL/routing surface around it. Layout deliberately
 * mirrors LessonSession.js's own :host/.content-area sizing exactly (same
 * `max-width: min(1600px, 94vw)`, same lack of extra host padding/overflow)
 * rather than a bespoke narrower container — the whole point of this route
 * is that a block renders exactly as it would in a real lesson, and a
 * different container width changes how side-by-side image/simulation
 * layouts wrap. No on-screen Prev/Next controls of this view's own, for the
 * same reason — arrow-key stepping (via the mounted element's own
 * advanceStep()/retreatStep(), the same contract LessonEngine._consumeStep()
 * uses) matches how a real slide behaves under keyboard input; a button row
 * invented for this view wouldn't.
 *
 * A question's own scoring/verdict (evaluate()) is never called by
 * anything else here - normally that's TestEngine's/LessonEngine's job, and
 * this route intentionally has neither. Reviewing a draft question (is the
 * answer key right? does the explanation make sense?) needs exactly that
 * though, so this view calls the mounted element's own evaluate() directly
 * on a "Check answer" click, the same way TestSession.js's review mode
 * does (see its call site's comment on why boundary.pluginReady must be
 * awaited first) - the question renders its own feedback banner/
 * explanation from there, same as it would inside a real test/lesson.
 */
export class ContentPreview extends LitElement {
  static properties = {
    item: { type: String },
    beatIndex: { type: Number },
    // 'classic' | 'story': force that lesson mode for this preview only
    // (?mode=, or the deprecated ?look=; see Router.js).
    mode: { type: String },
    // Inside another page's iframe: no banner, no check row chrome.
    embed: { type: Boolean },
    _hasEvaluate: { type: Boolean, state: true },
    _answered: { type: Boolean, state: true },
  };

  static styles = [btn3dStyles, css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      max-width: min(1600px, 94vw);
      margin: 0 auto;
      width: 100%;
    }
    .preview-banner {
      padding: 0.4rem 0.9rem;
      border-radius: 8px;
      background: var(--warn-bg, #fef3c7);
      color: var(--warn-text, #92400e);
      border: 1px solid var(--accent-amber, #f59e0b);
      font-size: 0.78rem;
      font-weight: var(--fw-medium);
      margin-top: 1rem;
    }
    .content-area {
      flex: 1;
      padding: 1rem 0;
    }
    .preview-status {
      padding: 2rem;
      text-align: center;
      color: var(--text-muted, #64748b);
    }
    .preview-error {
      padding: 1rem;
      border-radius: 10px;
      background: var(--error-bg, #fee2e2);
      color: var(--error-text, #991b1b);
      border: 1px solid var(--error-text, #fecaca);
      white-space: pre-wrap;
    }
    .preview-check-row {
      display: flex;
      justify-content: center;
      padding: 0.5rem 0 1rem;
    }
  `];

  constructor() {
    super();
    this.item = '';
    this.beatIndex = undefined;
    this._status = 'idle'; // idle | loading | error | ready
    this._errorMessage = '';
    this._bundleId = null;
    // Kept so the keydown handler below can call the mounted element's own
    // advanceStep()/retreatStep() directly — the same contract
    // LessonEngine._consumeStep() calls, reproduced here at the one-block
    // scale (no cross-block navigation, no progress saving, since there's
    // no lesson wrapping this block to navigate across or save against).
    this._mountedEl = null;
    // Whether the mounted element is a question (has evaluate()) at all -
    // a lesson content-block doesn't, and gets no "Check answer" button.
    this._hasEvaluate = false;
    // Mirrors the mounted element's own isAnswered() once evaluate() has
    // been called - swaps the button from "Check answer" to "Try again".
    this._answered = false;
    this._handleKey = this._handleKey.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this._handleKey);
  }

  disconnectedCallback() {
    window.removeEventListener('keydown', this._handleKey);
    super.disconnectedCallback();
  }

  updated(changed) {
    if (changed.has('mode') && (this.mode === 'classic' || this.mode === 'story')) LessonModeManager.setForced(this.mode);
    // Same-tab navigation to a new beat= on the same item (LessonSession's
    // own updated() has an equivalent branch — see its beatIndex handling —
    // this route just re-mounts from scratch instead of a lighter seek,
    // since there's only ever one plugin here, not a whole lesson to avoid
    // re-fetching).
    if ((changed.has('item') || changed.has('beatIndex')) && this.item) this._load();
  }

  /** Same guard shape as LessonSession._handleKey() — ignore modifier
   *  combos, focused form fields, and any keypress a nested handler (e.g. a
   *  simulation canvas's own ArrowRight/Left) already consumed. */
  _handleKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.defaultPrevented) return;
    const el = e.composedPath()[0];
    const tag = el?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return;
    if (e.key === ' ' && tag === 'button') return;

    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      this._mountedEl?.advanceStep?.();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this._mountedEl?.retreatStep?.();
    }
  }

  async _load() {
    this._status = 'loading';
    this._errorMessage = '';
    this._hasEvaluate = false;
    this._answered = false;
    this.requestUpdate();
    try {
      const basePath = this.item.replace(':', '/');
      const path = basePath.startsWith('/') ? basePath :
                   (basePath.startsWith('content/') ? `/${basePath}` : `/content/${basePath}`);
      const finalPath = path.endsWith('.json') ? path : `${path}.json`;
      this._bundleId = CourseSourceManager.deriveBundleId(finalPath);

      const data = await ContentLoader.loadJSON(finalPath);

      this._status = 'ready';
      this.requestUpdate();
      await this.updateComplete;
      const mountEl = this.renderRoot.querySelector('.content-area');
      const initialStep = Number.isInteger(this.beatIndex) && this.beatIndex >= 0 ? this.beatIndex : undefined;
      const boundary = await mountOrphanPreview(data, mountEl, { bundleId: this._bundleId, initialStep });
      // See this class's own doc comment on why this must be awaited before
      // evaluate() can be trusted (TestSession.js review mode hit the same
      // vendor-not-loaded-yet issue with equation-input@1).
      await boundary.pluginReady;
      this._mountedEl = boundary.firstElementChild;
      this._hasEvaluate = typeof this._mountedEl?.evaluate === 'function';
      this._answered = typeof this._mountedEl?.isAnswered === 'function' && this._mountedEl.isAnswered();
    } catch (e) {
      console.error('[ContentPreview]', e);
      this._status = 'error';
      this._errorMessage = e.message;
      this.requestUpdate();
    }
  }

  /** Calls the mounted question's own evaluate() directly - the question
   *  renders its own feedback-banner/explanation/correct-answer highlight
   *  from there (same as inside a real test/lesson), nothing further to
   *  build here. `await`ed since not every plugin's evaluate() is
   *  synchronous (e.g. plot-function@1's worker-sandboxed check) - see
   *  TestEngine.submit()'s identical await. */
  async _checkAnswer() {
    if (!this._mountedEl || typeof this._mountedEl.evaluate !== 'function') return;
    await this._mountedEl.evaluate();
    this._answered = true;
  }

  /** Re-mounts fresh rather than relying on each plugin's own optional
   *  reset(seed) (not every question type implements one) - same
   *  mount-from-scratch approach updated() already uses for a beat=
   *  change, just triggered by a click instead of a route change. */
  _tryAgain() {
    this._load();
  }

  render() {
    return html`
      ${this._status === 'loading' ? html`<div class="preview-status"><app-loader size="48" label="Loading preview…"></app-loader></div>` : ''}
      ${this._status === 'error' ? html`<div class="preview-error">Could not load preview:\n${this._errorMessage}</div>` : ''}
      <main class="content-area"></main>
      ${this._hasEvaluate ? html`
        <div class="preview-check-row">
          ${!this._answered
            ? html`<button class="btn-3d btn-primary" @click=${() => this._checkAnswer()}>Check answer</button>`
            : html`<button class="btn-3d btn-secondary" @click=${() => this._tryAgain()}>↻ Try again</button>`}
        </div>
      ` : ''}
      ${this.embed ? '' : html`<div class="preview-banner">⚠ Standalone preview${this._bundleId ? html` — bundle "${this._bundleId}"` : ''}: draft content, not saved to progress.</div>`}
    `;
  }
}

customElements.define('content-preview', ContentPreview);
