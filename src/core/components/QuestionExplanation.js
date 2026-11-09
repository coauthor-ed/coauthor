import { brandIcon } from '../../ui/components/LookSlots.js';
import { LitElement, html, css } from 'lit';
import '../../ui/components/MarkdownRenderer.js';
import { CourseSourceManager } from '../CourseSourceManager.js';
import { ContentLoader } from '../ContentLoader.js';
import { hydrateProseRefs } from '../hydrateProseRefs.js';
import { mountOrphanPreview } from '../preview/mountOrphanPreview.js';
import { createDialogOverlay } from '../../ui/components/dialogs.js';

/**
 * <question-explanation> — the 💡 "Explanation" box every question plugin
 * shows once revealed, extracted out of three byte-identical copies
 * (QuestionBase.js, mcq-single/v2, equation-input/v1 — see docs/sprints/wip/
 * dom-simulations-md-prose-and-explanation-slides.md §7.1) so this doesn't
 * become a fourth. `semantic-descriptive@1`/`drag-match@1` render
 * no explanation at all today; they get one for free by adding this too.
 *
 * Two independent things it renders, either or both:
 *  - `explanation` — the short, always-inline one-line takeaway string
 *    (unchanged behavior from the three copies this replaces).
 *  - `explanationSlide` — an optional worked solution: one or more ordinary
 *    `content-block@1`-shaped blocks (never part of the lesson's own flow —
 *    see docs/content-authoring-guide.md), each mounted through the real
 *    plugin pipeline (mountOrphanPreview), so it can carry its own prose
 *    (`markdownRef`) and a `simulation` — the whole reason this exists is so
 *    a simulation can point at *this*, not have to explain the answer
 *    itself. `presentation: "inline"` (default) shows them behind a "Show
 *    me why →" disclosure, right where the button is — no FAB-style
 *    below-the-fold affordance is needed here the way QuestionBase's own
 *    companion-simulation card needs one, since this never lands far from
 *    where the student is already looking. `presentation: "slide"` opens a
 *    full overlay instead, one block ("slide") at a time via Prev/Next —
 *    for a multi-block worked solution that deserves its own focus. Each
 *    mounted block is asked to `revealAll()` immediately (these are
 *    supplementary worked-solution slides, not paced lesson content that
 *    needs its own beat-by-beat pacing).
 *
 * Takes reveal state as a `revealed` property rather than reaching for
 * either of the two flag names real consumers use (`_isRevealed` on
 * QuestionBase subclasses, `_revealed` on mcq-single@2/equation-input@1) —
 * every consumer already knows which one is its own.
 *
 * Loads `explanationSlide`'s blocks lazily, on first reveal — an unanswered
 * question must not fetch its explanation slides.
 */
export class QuestionExplanation extends LitElement {
  static properties = {
    explanation: { type: String },
    explanationSlide: { type: Object },
    revealed: { type: Boolean },
    bundleId: { type: String },
    _slideBlocks: { state: true },
    _slideLoading: { state: true },
    _slideError: { state: true },
    _inlineOpen: { state: true },
  };

  static styles = css`
    :host { display: block; }
    /* --info-bg/--info-text (theme.css), not --primary-color: this box
       shows for a correct AND an incorrect answer alike, so it can't borrow
       the "brand action" color — --primary-color is this palette's coral/
       red, which reads as "you got it wrong" here regardless of whether the
       student actually did. --info-* is the same neutral blue every other
       "here's what's going on" surface in the app would use. */
    .qx-box {
      margin-top: 1.5rem; padding: 20px 24px;
      background: var(--info-bg);
      border-radius: var(--radius-callout); border: var(--rule-w-bold) solid var(--verdict-rule-info, var(--info-text));
      box-shadow: var(--lip-fixed) var(--info-text);
      color: var(--text-main);
    }
    .qx-box h4 {
      margin-top: 0; margin-bottom: 12px;
      color: var(--info-text, #0b6fa8);
      font-size: 1.25rem; font-weight: var(--fw-black);
      display: flex; align-items: center; gap: 8px;
    }
    .qx-box h4 span { font-size: 1.5rem; }
    .qx-box-body { font-weight: var(--fw-strong); line-height: 1.6; font-size: 1.05rem; }

    .qx-slide-toggle {
      margin-top: 1rem;
      display: inline-flex; align-items: center; gap: 6px;
      background: none; border: none; padding: 4px 2px;
      font: inherit; font-size: 0.9rem; font-weight: var(--fw-strong);
      color: var(--info-text, #0b6fa8); cursor: pointer;
      border-bottom: 1px dashed var(--info-text, #0b6fa8);
    }
    .qx-slide-toggle:hover { opacity: 0.8; }

    .qx-slide-inline {
      margin-top: 0.75rem; display: flex; flex-direction: column; gap: 1rem;
    }
    .qx-slide-block-host { min-height: 40px; }
    .qx-slide-error { color: var(--error-text); font-size: 0.9rem; }
  `;

  constructor() {
    super();
    this.explanation = '';
    this.explanationSlide = null;
    this.revealed = false;
    this.bundleId = null;
    this._slideBlocks = null;
    this._slideLoading = false;
    this._slideError = null;
    this._inlineOpen = false;

    this._dialog = null;      // <dialog> element, "slide" presentation only
    this._slideIndex = 0;
    this._mountedEls = [];    // [{el, host}] — for teardown
  }

  updated(changed) {
    if ((changed.has('revealed') || changed.has('explanationSlide')) &&
        this.revealed && this.hasSlide() && !this._slideBlocks && !this._slideLoading) {
      this._loadSlideBlocks();
    }
    if (changed.has('_inlineOpen') || changed.has('_slideBlocks')) {
      this._mountInlineBlocks();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._teardownMounted();
    this._closeDialog();
  }

  hasSlide() {
    return !!this.explanationSlide?.blocks?.length;
  }

  isSlidePresentation() {
    return this.explanationSlide?.presentation === 'slide';
  }

  async _loadSlideBlocks() {
    this._slideLoading = true;
    this._slideError = null;
    try {
      const refs = this.explanationSlide.blocks;
      const loaded = [];
      for (const entry of refs) {
        const url = CourseSourceManager.resolveRef(entry.blockRef, this.bundleId);
        const raw = await ContentLoader.loadJSON(url);
        loaded.push(await hydrateProseRefs(raw, this.bundleId));
      }
      this._slideBlocks = loaded;
    } catch (err) {
      console.error('[QuestionExplanation] Failed to load explanationSlide blocks', err);
      this._slideError = err;
    } finally {
      this._slideLoading = false;
    }
  }

  _teardownMounted() {
    for (const { el } of this._mountedEls) {
      try { el?.destroy?.(); el?.disconnectedCallback?.(); } catch { /* best-effort */ }
    }
    this._mountedEls = [];
  }

  /** Mounts every loaded slide block into its own sub-container — one per
   *  block, since mountOrphanPreview() clears whatever container it's given
   *  — for the "inline" disclosure. Runs once the blocks are loaded AND the
   *  disclosure is open. */
  async _mountInlineBlocks() {
    if (this.isSlidePresentation() || !this._inlineOpen || !this._slideBlocks) return;
    await this.updateComplete;
    const hosts = this.shadowRoot?.querySelectorAll('.qx-slide-block-host');
    if (!hosts?.length) return;
    this._teardownMounted();
    for (let i = 0; i < this._slideBlocks.length; i++) {
      const host = hosts[i];
      if (!host) continue;
      try {
        const el = await mountOrphanPreview(this._slideBlocks[i], host, { bundleId: this.bundleId });
        el?.revealAll?.();
        this._mountedEls.push({ el, host });
      } catch (err) {
        console.error('[QuestionExplanation] Failed to mount explanation block', err);
      }
    }
  }

  _toggleInline() {
    this._inlineOpen = !this._inlineOpen;
  }

  async _openSlideDialog() {
    if (!this._slideBlocks) await this._loadSlideBlocks();
    if (!this._slideBlocks?.length) return;
    this._slideIndex = 0;
    this._dialog = createDialogOverlay();
    this._dialog.style.maxWidth = '840px';
    this._dialog.style.width = '92%';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'aa-dialog-btn';
    closeBtn.textContent = 'Close';
    closeBtn.style.alignSelf = 'flex-end';
    closeBtn.addEventListener('click', () => this._closeDialog());

    const host = document.createElement('div');
    host.className = 'qx-slide-block-host';

    const nav = document.createElement('div');
    nav.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:8px;';
    const prevBtn = document.createElement('button');
    prevBtn.className = 'aa-dialog-btn';
    prevBtn.textContent = '← Prev';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'aa-dialog-btn primary';
    nextBtn.textContent = 'Next →';
    const indicator = document.createElement('span');
    indicator.style.cssText = 'font-size:0.85rem; color:var(--text-muted);';

    const renderSlide = async () => {
      this._teardownMounted();
      host.innerHTML = '';
      prevBtn.disabled = this._slideIndex === 0;
      nextBtn.disabled = this._slideIndex === this._slideBlocks.length - 1;
      indicator.textContent = `${this._slideIndex + 1} / ${this._slideBlocks.length}`;
      try {
        const el = await mountOrphanPreview(this._slideBlocks[this._slideIndex], host, { bundleId: this.bundleId });
        el?.revealAll?.();
        this._mountedEls.push({ el, host });
      } catch (err) {
        console.error('[QuestionExplanation] Failed to mount explanation slide', err);
      }
    };
    prevBtn.addEventListener('click', () => { if (this._slideIndex > 0) { this._slideIndex--; renderSlide(); } });
    nextBtn.addEventListener('click', () => { if (this._slideIndex < this._slideBlocks.length - 1) { this._slideIndex++; renderSlide(); } });

    nav.append(prevBtn, indicator, nextBtn);
    this._dialog.append(host, nav, closeBtn);
    this._dialog.addEventListener('cancel', () => this._closeDialog());
    document.body.appendChild(this._dialog);
    this._dialog.showModal();
    renderSlide();
  }

  _closeDialog() {
    this._teardownMounted();
    if (this._dialog) {
      this._dialog.close();
      this._dialog.remove();
      this._dialog = null;
    }
  }

  render() {
    if (!this.revealed) return html``;
    const exp = typeof this.explanation === 'object' && this.explanation !== null ? (this.explanation.en || '') : (this.explanation || '');
    const clean = typeof exp === 'string' ? exp.trim() : '';
    const showInline = clean && clean !== 'Explain here.' && clean !== 'Explain here';
    const hasSlide = this.hasSlide();
    const hintMark = brandIcon('hint');

    return html`
      ${showInline ? html`
        <div class="qx-box">
          <h4>${hintMark ? html`<span>${hintMark}</span>` : ''} Explanation</h4>
          <div class="qx-box-body"><markdown-renderer .content=${clean}></markdown-renderer></div>
        </div>
      ` : ''}
      ${hasSlide && this.isSlidePresentation() ? html`
        <button type="button" class="qx-slide-toggle" @click=${() => this._openSlideDialog()}>
          See the worked solution →
        </button>
      ` : ''}
      ${hasSlide && !this.isSlidePresentation() ? html`
        <button type="button" class="qx-slide-toggle" @click=${() => this._toggleInline()}>
          ${this._inlineOpen ? 'Hide the worked solution' : 'Show me why →'}
        </button>
        ${this._inlineOpen ? html`
          <div class="qx-slide-inline">
            ${this._slideLoading ? html`<app-loader size="48" label="Loading…"></app-loader>` : ''}
            ${this._slideError ? html`<div class="qx-slide-error">Couldn't load the worked solution.</div>` : ''}
            ${this._slideBlocks ? this._slideBlocks.map(() => html`<div class="qx-slide-block-host"></div>`) : ''}
          </div>
        ` : ''}
      ` : ''}
    `;
  }
}

customElements.define('question-explanation', QuestionExplanation);
