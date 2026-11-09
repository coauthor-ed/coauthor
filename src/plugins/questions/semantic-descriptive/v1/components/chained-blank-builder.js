import { LitElement, html, css } from 'lit';
import { classify } from 'core/evaluators/semanticSimilarityEvaluator.js';
import { blankInsideMath } from 'core/markdown/mathMask.js';
import { sdTokens, sdButtons, sdKeyframes } from '../styles.js';
import { CUES, emitCue } from 'core/cues.js';
import { A11yAnnouncer } from 'core/A11yAnnouncer.js';
import './blank-fill-modal.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../../ui/sharedStyles.js';
import { brandCopy, brandIcon } from '../../../../../ui/components/LookSlots.js';
import '../../../../../ui/components/MarkdownRenderer.js';

const CONNECTOR_DWELL_MS = 1300; // pacing ported verbatim from coaching-poc-v5.html
const AUTO_FILL_DWELL_MS = 1300;
const PRE_MODAL_DELAY_MS = 700;
const MODAL_CLOSE_FADE_MS = 300;
const POST_RESOLVE_ADVANCE_MS = 500;

/**
 * <sd-chained-blank-builder> — tier 3 guided paragraph build, ported from
 * coaching-poc-v5.html's openLevel3/advanceStage/openLevel3Modal. Sequencing
 * (stage index, timers, resolved/auto/gaveUp per rubric point) lives as
 * scoped Lit properties on this one instance instead of the POC's
 * `qs.level3Stage` etc. on a shared global object.
 *
 * Bug fix vs. the POC (allowed per the handoff — behavior preserved, dead-end
 * fixed): dismissing the modal (backdrop click / Escape) in the original
 * left the build permanently stalled with no way back in. Here the blank
 * slot for the *current* stage stays a focusable, clickable affordance until
 * resolved, so the student can always reopen it.
 */
export class ChainedBlankBuilder extends LitElement {
  static properties = {
    level3: { type: Array },
    rubric: { type: Array },
    answerSims: { type: Object },
    evaluated: { type: Boolean },
    /** Test-review shape: render the fully-built model answer immediately —
     *  every blank pre-filled with its rubric's accepted text — instead of
     *  the interactive start/step/give-up wizard. The review page is a
     *  record of what was submitted plus the answer key, not another
     *  coaching pass, so a student re-earning the reveal via "I give up"
     *  clicks doesn't belong there. See index.js's _renderFullAnswerMode(). */
    staticReveal: { type: Boolean },
    thresholds: { attribute: false },
    embed: { attribute: false },
    _started: { state: true },
    _stage: { state: true },
    _resolved: { state: true },
    _resolvedText: { state: true },
    _gaveUp: { state: true },
    _auto: { state: true },
    _celebrated: { state: true },
    _modalOpen: { state: true },
  };

  static styles = [btn3dStyles, feedbackAnimStyles, 
    sdTokens,
    sdButtons,
    sdKeyframes,
    css`
      .sd-level3-title { font-size: 18px; font-weight: var(--fw-black); margin-bottom: 2px; }
      .sd-level3-sub { font-size: 13px; color: var(--sd-ink-soft); font-weight: var(--fw-strong); margin-bottom: 14px; }
      .sd-l3-paragraph { background: rgba(0, 0, 0, 0.015); border: 3px solid var(--sd-border); border-radius: var(--radius-lg); padding: 20px 22px; margin-top: 16px; }
      .sd-l3-line {
        opacity: 0.4; transform: scale(0.98); transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        padding: 11px 14px; border-radius: var(--radius-md); border: 2px solid transparent; margin-bottom: 6px; position: relative;
      }
      .sd-l3-line.active { opacity: 1; transform: scale(1); background: var(--sd-card); border-color: var(--sd-border); box-shadow: var(--press-2) rgba(0, 0, 0, 0.03); }
      .sd-l3-label { display: block; font-family: monospace; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--sd-ink-faint); font-weight: var(--fw-medium); }
      .sd-l3-line.active .sd-l3-label { opacity: 0; position: absolute; pointer-events: none; }
      .sd-l3-text { font-size: 15.5px; font-weight: var(--fw-strong); line-height: 1.7; }
      .sd-blank-slot {
        display: inline-block; min-width: 70px; height: 1.2em; background: var(--sd-border);
        border-bottom: 4px solid var(--sd-ink-faint); border-radius: var(--radius-xs); vertical-align: middle; margin: 0 4px;
      }
      .sd-blank-slot.current { cursor: pointer; }
      .sd-blank-slot.current:focus-visible { outline: 3px solid var(--sd-indigo); outline-offset: 2px; }
      .sd-blank-resolved {
        color: var(--on-primary); font-weight: var(--fw-black); background: var(--sd-indigo); padding: 4px 12px; border-radius: var(--radius-sm); margin: 0 4px;
        display: inline-block; box-shadow: var(--press-1) var(--sd-indigo-dark); animation: sd-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .sd-blank-resolved.gaveup { background: var(--sd-red); box-shadow: var(--press-1) var(--sd-red-dark); }
      .sd-blank-resolved.auto { background: var(--sd-emerald); box-shadow: var(--press-1) var(--success-text); }
      /* When the blank sits inside a math expression (e.g. "$(-a+b+c)^2 =
         ___$"), the value is substituted straight into the LaTeX and the
         whole equation renders as one combined <markdown-renderer> - see
         blankInsideMath()'s doc comment. A solid-background pill like
         .sd-blank-resolved would fight the KaTeX glyphs' own spacing, so
         this wraps the whole typeset equation in a lighter outline instead. */
      .sd-blank-resolved-inline {
        display: inline-block; margin: 0 4px; padding: 2px 8px; border-radius: var(--radius-sm);
        border: 2px solid var(--sd-indigo); animation: sd-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .sd-blank-resolved-inline.gaveup { border-color: var(--sd-red); }
      .sd-blank-resolved-inline.auto { border-color: var(--sd-emerald); }
      .sd-blank-slot-inline {
        display: inline-block; margin: 0 4px; padding: 2px 8px; border-radius: var(--radius-sm);
        border: 2px dashed var(--sd-ink-faint);
      }
      .sd-blank-slot-inline.current { cursor: pointer; border-color: var(--sd-indigo); }
      .sd-blank-slot-inline.current:focus-visible { outline: 3px solid var(--sd-indigo); outline-offset: 2px; }
      .sd-l3-complete {
        margin-top: 16px; text-align: center; background: var(--sd-indigo-soft); border: 3px solid var(--primary-light); border-radius: var(--radius-lg);
        padding: 20px; font-size: 18px; font-weight: var(--fw-black); color: var(--sd-indigo-dark);
      }
    `,
  ];

  constructor() {
    super();
    this.level3 = [];
    this.rubric = [];
    this.answerSims = {};
    this.evaluated = false;
    this.staticReveal = false;
    this._started = false;
    this._stage = -1;
    this._resolved = {};
    this._resolvedText = {};
    this._gaveUp = {};
    this._auto = {};
    this._celebrated = false;
    this._modalOpen = false;
    this._modalSeg = null;
    this._modalRubric = null;
    this._modalStageStartMs = 0;
    this._timers = [];
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._timers.forEach(clearTimeout);
    this._timers = [];
  }

  _schedule(fn, ms) {
    const id = setTimeout(fn, ms);
    this._timers.push(id);
    return id;
  }

  _rubricById(id) { return this.rubric.find((r) => r.id === id); }

  /** Clears tier-3 resolution state for a retry (handoff §4 — reset() never re-runs step 1). */
  reset() {
    this._timers.forEach(clearTimeout);
    this._timers = [];
    this._started = false;
    this._stage = -1;
    this._resolved = {};
    this._resolvedText = {};
    this._gaveUp = {};
    this._auto = {};
    this._celebrated = false;
    this._modalOpen = false;
    this._modalSeg = null;
    this._modalRubric = null;
  }

  start() {
    if (this._started) return;
    this._started = true;
    this._stage = -1;
    this.dispatchEvent(new CustomEvent('sd-tier3-start', { bubbles: true, composed: true }));
    this._advanceStage();
  }

  _advanceStage() {
    this._stage += 1;
    if (this._stage >= this.level3.length) {
      this._celebrate();
      return;
    }
    const seg = this.level3[this._stage];
    // Defensive against a malformed segment — `rubricId` set but `text` has
    // no `___` to fill (a content-authoring slip, not something the schema
    // enforces). Treated exactly like a plain connector line rather than
    // opening a modal for a blank that _renderLineBody() has nothing to
    // substitute into (which would otherwise stall the build forever, since
    // the modal-triggering blank slot below never gets rendered for it).
    const hasBlank = !!seg.rubricId && seg.text.includes('___');

    // Selective scaffolding: a rubric point already "nailed" in step 1 never
    // gets re-quizzed — auto-fill it and move on.
    const alreadyNailed = hasBlank
      && this.evaluated
      && classify(this.answerSims[seg.rubricId] ?? -1, this.thresholds) === 'addressed'
      && !this._resolved[seg.rubricId];
    if (alreadyNailed) {
      const rubric = this._rubricById(seg.rubricId);
      this._resolved = { ...this._resolved, [seg.rubricId]: true };
      this._resolvedText = { ...this._resolvedText, [seg.rubricId]: rubric.accepted[0] };
      this._auto = { ...this._auto, [seg.rubricId]: true };
      A11yAnnouncer.announce(`${rubric.label} already nailed — filled in automatically: ${rubric.accepted[0]}.`);
      this.dispatchEvent(new CustomEvent('sd-tier3-resolved', {
        detail: { rubricId: seg.rubricId, resolvedText: rubric.accepted[0], gaveUp: false, auto: true, hintLevelsUsed: 0, timeToResolveMs: 0 },
        bubbles: true, composed: true,
      }));
      this.requestUpdate();
      this._schedule(() => this._advanceStage(), AUTO_FILL_DWELL_MS);
      return;
    }

    if (!hasBlank) {
      A11yAnnouncer.announce(seg.text);
      this.requestUpdate();
      this._schedule(() => this._advanceStage(), CONNECTOR_DWELL_MS);
      return;
    }

    A11yAnnouncer.announce(`${seg.eyebrow}. Fill in the blank: ${seg.text.replace('___', 'blank')}`);
    this.requestUpdate();
    this._schedule(() => this._openModalForCurrentStage(), PRE_MODAL_DELAY_MS);
  }

  _openModalForCurrentStage() {
    const seg = this.level3[this._stage];
    if (!seg || !seg.rubricId || this._resolved[seg.rubricId]) return;
    this._modalSeg = seg;
    this._modalRubric = this._rubricById(seg.rubricId);
    this._modalStageStartMs = Date.now();
    this._modalOpen = true;
  }

  _onBlankSlotActivate(seg) {
    if (seg !== this.level3[this._stage]) return; // only the current stage's blank is reopenable
    this._openModalForCurrentStage();
  }

  _onModalDismissed() {
    this._modalOpen = false;
  }

  _onModalResolved(e) {
    const { value, gaveUp, hintLevelsUsed } = e.detail;
    const rubricId = this._modalRubric.id;
    const timeToResolveMs = Date.now() - this._modalStageStartMs;
    this._resolved = { ...this._resolved, [rubricId]: true };
    this._resolvedText = { ...this._resolvedText, [rubricId]: gaveUp ? this._modalRubric.accepted[0] : value };
    this._gaveUp = { ...this._gaveUp, [rubricId]: gaveUp };
    this._auto = { ...this._auto, [rubricId]: false };
    A11yAnnouncer.announce(gaveUp
      ? `${this._modalRubric.label} revealed: ${this._modalRubric.accepted[0]}.`
      : `Correct. ${this._modalRubric.label} resolved: ${value}.`);
    this.dispatchEvent(new CustomEvent('sd-tier3-resolved', {
      detail: { rubricId, resolvedText: this._resolvedText[rubricId], gaveUp, auto: false, hintLevelsUsed, timeToResolveMs },
      bubbles: true, composed: true,
    }));
    this._modalOpen = false;
    this._schedule(() => this._advanceStage(), MODAL_CLOSE_FADE_MS + POST_RESOLVE_ADVANCE_MS);
  }

  async _celebrate() {
    this.requestUpdate();
    if (this._celebrated) return;
    this._celebrated = true;
    A11yAnnouncer.announce('Masterpiece complete!', true);
    this.dispatchEvent(new CustomEvent('sd-tier3-complete', { bubbles: true, composed: true }));
    // What happened, not how to show it: the look's reactor decides
    // (src/looks/quill/reactor.js).
    emitCue(CUES.CORRECT, { questionId: null, questionType: 'semantic-descriptive', big: true, companion: null, host: this });
  }

  _renderLineBody(seg) {
    // Malformed segment (rubricId with no `___` to fill) — render as plain
    // text instead of splitting on a delimiter that isn't there, which would
    // otherwise dangle the resolved/blank markup after the whole sentence
    // (see hasBlank's doc comment in _advanceStage()).
    if (!seg.rubricId || !seg.text.includes('___')) return html`<markdown-renderer inline .content=${seg.text}></markdown-renderer>`;
    // The blank often sits inside a $...$ span (e.g. "$(-a+b+c)^2 = ___$") —
    // text.split('___') would hand each half an unbalanced delimiter and
    // neither renders as math (see blankInsideMath()'s doc comment). In that
    // case substitute the value straight into `seg.text` and render the
    // whole equation as one combined string instead of two separate halves.
    const insideMath = blankInsideMath(seg.text);
    const isCurrent = seg === this.level3[this._stage];
    if (this._resolved[seg.rubricId]) {
      const cls = this._auto[seg.rubricId] ? 'auto' : this._gaveUp[seg.rubricId] ? 'gaveup' : '';
      const value = this._resolvedText[seg.rubricId];
      if (insideMath) {
        return html`<span class="sd-blank-resolved-inline ${cls}"><markdown-renderer inline .content=${seg.text.replace('___', value)}></markdown-renderer></span>`;
      }
      const [before, after] = seg.text.split('___');
      return html`<markdown-renderer inline .content=${before}></markdown-renderer><span class="sd-blank-resolved ${cls}"><markdown-renderer inline .content=${value}></markdown-renderer></span><markdown-renderer inline .content=${after}></markdown-renderer>`;
    }
    const activate = () => this._onBlankSlotActivate(seg);
    const onKeydown = (e) => { if (isCurrent && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); activate(); } };
    const ariaLabel = isCurrent ? `Fill in the blank for ${this._rubricById(seg.rubricId)?.label}` : undefined;
    if (insideMath) {
      // \square is MathLive's standard "unknown value" glyph — a math-native
      // stand-in for the empty blank box the non-math path below draws with
      // CSS, since an empty box can't be spliced into rendered KaTeX output.
      return html`<span
        class="sd-blank-slot-inline ${isCurrent ? 'current' : ''}"
        role=${isCurrent ? 'button' : undefined}
        tabindex=${isCurrent ? '0' : undefined}
        aria-label=${ariaLabel}
        @click=${activate}
        @keydown=${onKeydown}
      ><markdown-renderer inline .content=${seg.text.replace('___', '\\square')}></markdown-renderer></span>`;
    }
    const [before, after] = seg.text.split('___');
    return html`<markdown-renderer inline .content=${before}></markdown-renderer><span
      class="sd-blank-slot ${isCurrent ? 'current' : ''}"
      role=${isCurrent ? 'button' : undefined}
      tabindex=${isCurrent ? '0' : undefined}
      aria-label=${ariaLabel}
      @click=${activate}
      @keydown=${onKeydown}
    ></span><markdown-renderer inline .content=${after}></markdown-renderer>`;
  }

  /** staticReveal's non-interactive counterpart to _renderLineBody() — every
   *  blank shown at once, filled with its rubric's accepted[0] text. `auto`
   *  styling (green) marks a point the student's own answer already nailed,
   *  same visual language as the live build's auto-fill; everything else
   *  gets the plain "model" reveal styling (indigo, same as a correctly-
   *  resolved blank) since showing it here isn't a "gave up" outcome. */
  _renderStaticLineBody(seg) {
    // Same malformed-segment guard as _renderLineBody() — without it, a
    // rubricId'd segment whose text is already a complete sentence (no
    // `___`) gets the accepted answer dangled on the end of it instead of
    // substituted into anything, reading as a duplicated trailing word.
    if (!seg.rubricId || !seg.text.includes('___')) return html`<markdown-renderer inline .content=${seg.text}></markdown-renderer>`;
    const rubric = this._rubricById(seg.rubricId);
    const alreadyNailed = this.evaluated && classify(this.answerSims[seg.rubricId] ?? -1, this.thresholds) === 'addressed';
    const value = rubric?.accepted?.[0] ?? '';
    // See _renderLineBody()'s identical branch — a blank inside a $...$ span
    // needs the value substituted in and the whole equation rendered as one
    // combined string, or neither half of a naive split renders as math.
    if (blankInsideMath(seg.text)) {
      return html`<span class="sd-blank-resolved-inline ${alreadyNailed ? 'auto' : ''}"><markdown-renderer inline .content=${seg.text.replace('___', value)}></markdown-renderer></span>`;
    }
    const [before, after] = seg.text.split('___');
    return html`<markdown-renderer inline .content=${before}></markdown-renderer><span class="sd-blank-resolved ${alreadyNailed ? 'auto' : ''}"><markdown-renderer inline .content=${value}></markdown-renderer></span><markdown-renderer inline .content=${after}></markdown-renderer>`;
  }

  render() {
    if (this.staticReveal) {
      return html`
        <div class="sd-level3-title">📘 Model answer</div>
        <div class="sd-level3-sub">Here's a fully worked model answer, built from the rubric.</div>
        <div class="sd-l3-paragraph" role="region" aria-label="Model answer">
          ${this.level3.map((seg) => html`
            <div class="sd-l3-line active">
              <span class="sd-l3-label"><markdown-renderer inline .content=${seg.eyebrow}></markdown-renderer></span>
              <span class="sd-l3-text">${this._renderStaticLineBody(seg)}</span>
            </div>
          `)}
        </div>
      `;
    }
    const allDone = this._started && this._stage >= this.level3.length;
    return html`
      <div class="sd-level3-title">🏗️ Build the full answer</div>
      <div class="sd-level3-sub">Points you already nailed get filled in automatically — you only fill in what's missing.</div>
      ${!this._started ? html`
        <button class="sd-btn3d sd-btn-emerald sd-btn-wide" @click=${() => this.start()}>Start the Build 🚀</button>
      ` : html`
        <div class="sd-l3-paragraph" role="region" aria-label="Guided answer build">
          ${this.level3.map((seg, idx) => html`
            <div class="sd-l3-line ${idx <= this._stage ? 'active' : ''}">
              <span class="sd-l3-label"><markdown-renderer inline .content=${seg.eyebrow}></markdown-renderer></span>
              <span class="sd-l3-text">${idx <= this._stage ? this._renderLineBody(seg) : ''}</span>
            </div>
          `)}
        </div>
        ${allDone ? html`<div class="sd-l3-complete" role="status">${brandIcon('party')} ${brandCopy('answerBuilt', 'Answer complete')}</div>` : ''}
      `}
      <sd-blank-fill-modal
        .open=${this._modalOpen}
        .eyebrow=${this._modalSeg?.eyebrow || ''}
        .segText=${this._modalSeg?.text || ''}
        .rubricLabel=${this._modalRubric?.label || ''}
        .level1=${this._modalRubric?.level1 || ''}
        .clue=${this._modalRubric?.clue || ''}
        .accepted=${this._modalRubric?.accepted || []}
        .embed=${this.embed}
        .thresholds=${this.thresholds}
        @sd-modal-resolved=${this._onModalResolved}
        @sd-modal-dismissed=${this._onModalDismissed}
      ></sd-blank-fill-modal>
    `;
  }
}

customElements.define('sd-chained-blank-builder', ChainedBlankBuilder);
