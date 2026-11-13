import { html, css } from 'lit';
import { ChoiceListBase } from '../../../../core/components/ChoiceListBase.js';
import { EventBus } from '../../../../core/EventBus.js';
import { A11yAnnouncer } from '../../../../core/A11yAnnouncer.js';
import {
  blockImageLayoutStyles, blockImageFocusStyles, renderBlockImage, renderBlockImageViewport, blockLayoutClass,
  probeImageDimensions, resolveImageLayout,
  measureRestTop, restTopChanged, sideRestExtra, fitSideImageAtRest,
} from '../../../../core/components/blockImageLayout.js';
import { remapRectForCover } from '../../../../core/focusRect.js';
import { captureRect, playFlip } from '../../../../core/flipAnimate.js';
import { NarrationCover } from '../../../../core/components/narrationCover.js';
import '../../poe-observe-sim/v1/index.js';
import {
  mountQuestionSimulation, destroyQuestionSimulation, renderSimCard, renderSimControls, companionSimStyles, setupSimFitStyles, fitSetupSimAtRest,
} from '../../../../core/components/simulationHost.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';
import { plainAnswerPanelStyles } from '../../../../core/components/answerPanel.js';

/**
 * <poe-predict-v1> — Predict phase of the POE cycle.
 *
 * Extends ChoiceListBase for the shared option-list UI.
 * Overrides _onSubmit() to broadcast via EventBus so the simulation unlocks,
 * and (new) to record the prediction on the shared POEController — see
 * docs/HighLevelDesign.md §8 — so a later `poeRole`-tagged block can recall
 * it. Supports an optional `image` field, same shape/positions as
 * content-block@1 (see blockImageLayout.js).
 */
export class PoePredictPlugin extends ChoiceListBase {
  static styles = [btn3dStyles, feedbackAnimStyles, 
    ChoiceListBase.styles,
    blockImageLayoutStyles,
    blockImageFocusStyles,
    companionSimStyles,
    setupSimFitStyles,
    plainAnswerPanelStyles,
    // Q-90: the narrated prompt's opening picture (narrationCover), in place
    // of the card while the prompt is held; the card fades in after it.
    css`
      .pp-cover { position: relative; width: min(100%, 1040px, calc((100vh - 340px) * 16 / 9)); aspect-ratio: 16 / 9; margin: 12px auto 0; }
      @media (max-width: 600px) and (orientation: portrait) { .pp-cover { width: 100%; margin-top: 4px; } }
      :host([pp-card-in]) { animation: pp-card-in 380ms ease-out both; }
      @keyframes pp-card-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) { :host([pp-card-in]) { animation: none; } }
    `,
    css`
      :host {
        /* side inset, read by the phone setup-sim bleed below */
        --pp-pad-x: 20px;
        padding: 20px;
        background: var(--bg-surface);
        border: 2px solid var(--primary-color);
        border-radius: var(--radius-xs);
        box-shadow: var(--shadow-primary);
      }
      h3 {
        margin: 0 0 12px;
        color: var(--primary-text);
      }
      /* plain: no box. One ink rule over the block and a small-caps label in
         the signature ink (plain SPEC sec 4, 2026-11-05). */
      :host([data-look="plain"]) {
        --pp-pad-x: 0px;
        padding: 14px 0 0;
        background: transparent;
        border: 0;
        border-top: 1px solid var(--rule-strong);
        border-radius: 0;
        box-shadow: none;
      }
      :host([data-look="plain"]) .stem { max-width: 72ch; }
      /* plain answer panel (answerPanel.js): the prompt keeps its column
         while the beats run, the panel joins on the last beat. Submit is the
         panel's full-width primary; the saved prediction a quiet ruled note. */
      :host([data-look="plain"]) .qp-prompt .stem { max-width: 38em; font-size: 1.15rem; line-height: var(--lh-stem); }
      :host([data-look="plain"]) .qp-panel .submit-btn-margin { margin-top: 0; }
      :host([data-look="plain"]) .qp-panel .confirmed {
        margin: 0;
        padding: 10px 14px;
        border-left: 3px solid var(--primary-color);
        background: var(--bg-panel);
        color: var(--text-main);
        font-size: 0.95rem;
        line-height: 1.5;
        animation: none;
      }
      :host([data-look="plain"]) .qp-panel .confirmed.deferred { display: flex; gap: 8px; align-items: flex-start; }
      :host([data-look="plain"]) .pp-mark { width: 18px; height: 18px; flex: none; margin-top: 2px; color: var(--primary-text); }
      .pp-label {
        margin: 0 0 10px;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--primary-text);
      }
      /* Setup sim side-by-side height fit and the phone card (no inner
         chrome): setupSimFitStyles (simulationHost.js; built here in Q-59,
         shared in Q-60). On a phone the scene, a stacked image and the
         post-submit observe card also bleed through this card's side
         padding (--pp-pad-x, 0 in plain), so each takes the full column
         like a content-block scene: 314 -> 354 px at 390. */
      /* Q-61, phone: the setup card goes FIRST, above the prompt. Stacked
         below a long prompt it landed 0-39 per cent on screen at 360x740;
         first, the learner sees the setup on landing and the prompt starts
         right under it. Visual order only (CSS order): the DOM, the beat
         scroll and the mounted scene stay as they are. */
      @media (max-width: 600px) {
        .cb-layout-right > .q-sim-card,
        .cb-layout-left  > .q-sim-card { order: -1; }
        .cb-layout-right .q-sim-host-container,
        .cb-layout-left  .q-sim-host-container {
          width: calc(100% + 2 * var(--pp-pad-x));
          max-width: none;
          margin: 0 calc(-1 * var(--pp-pad-x));
          border-radius: 0;
        }
        .cb-layout-above .cb-image-wrap:not(.cb-image-capped),
        .cb-layout-below .cb-image-wrap:not(.cb-image-capped),
        .cb-layout-right .cb-image-wrap:not(.cb-image-capped),
        .cb-layout-left  .cb-image-wrap:not(.cb-image-capped) {
          width: calc(100% + 2 * var(--pp-pad-x));
          max-width: none;
          margin: 0 calc(-1 * var(--pp-pad-x));
        }
        poe-observe-sim-v1 {
          max-width: none;
          margin-left: calc(-1 * var(--pp-pad-x));
          margin-right: calc(-1 * var(--pp-pad-x));
        }
      }
      .confirmed {
        margin-top: 12px;
        font-weight: 500;
        transform-origin: center;
      }
      .confirmed.correct {
        color: var(--success-text);
        animation: sd-pop 0.2s var(--ease-pop) forwards;
      }
      .confirmed.incorrect {
        color: var(--error-text);
        animation: sd-shake 0.2s ease-in-out forwards;
      }
      .confirmed.deferred {
        color: var(--text-muted);
        animation: sd-pop 0.2s var(--ease-pop) forwards;
      }
      @keyframes sd-pop {
        0%   { transform: scale(0.9) translateY(0); }
        50%  { transform: scale(1) translateY(-4px); }
        100% { transform: scale(1) translateY(0); }
      }
      @keyframes sd-shake {
        0%, 100% { transform: translateX(0); }
        20%, 60% { transform: translateX(-3px); }
        40%, 80% { transform: translateX(3px); }
      }
    `,
  ];

  constructor() {
    super();
    // ── Adaptive image layout state (resolveImageLayout) — mirrors
    // content-block.js's own setup; kept minimal here since only the image
    // path needs it, not every ChoiceListBase consumer. ────────────────────
    this._imgDims = null;
    this._columnWidth = 0;
    this._isNarrowViewport = false;
    this._isShortLandscape = false;
    this._activeImageLayout = null;
    this._flipFromRect = null; // .cb-image-wrap's pre-update rect, set in willUpdate()
    this._restTop = null;      // side image row's top at rest (Q-59, see updated())
    // Companion sim for `simulation.role: "setup"` - mounted at once, beside
    // the prompt (see _renderSetupSimLayout()). Same fields QuestionBase uses.
    this._simScene = null;
    this._simSceneClass = null;
    this._simMounting = false;
    this._simFailed = false;
    this._simErrorMessage = '';
    this._mqListener = (e) => { this._isNarrowViewport = e.matches; };
    this._mqShortListener = (e) => { this._isShortLandscape = e.matches; this.requestUpdate(); };
  }

  connectedCallback() {
    super.connectedCallback();
    this._mq = window.matchMedia('(max-width: 600px)');
    this._isNarrowViewport = this._mq.matches;
    this._mq.addEventListener('change', this._mqListener);

    this._mqShort = window.matchMedia('(max-height: 600px) and (orientation: landscape)');
    this._isShortLandscape = this._mqShort.matches;
    this._mqShort.addEventListener('change', this._mqShortListener);

    this._columnRO = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && Math.abs(w - this._columnWidth) > 1) {
        this._columnWidth = w;
        this.requestUpdate();
      }
    });
    this._columnRO.observe(this);

    // See content-block.js's own copy of this listener for why it's needed:
    // _availableHeight() reads window.innerHeight live, but the column
    // ResizeObserver above only fires on *this element's own* box changing,
    // which a pure viewport-height resize never triggers — without this, a
    // layout resolved while the window was short stays stuck even after the
    // window grows tall again.
    this._resizeListener = () => {
      if (this._resizeRAF) return;
      this._resizeRAF = requestAnimationFrame(() => {
        this._resizeRAF = null;
        this.requestUpdate();
      });
    };
    window.addEventListener('resize', this._resizeListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._mq) this._mq.removeEventListener('change', this._mqListener);
    if (this._mqShort) this._mqShort.removeEventListener('change', this._mqShortListener);
    if (this._columnRO) { this._columnRO.disconnect(); this._columnRO = null; }
    if (this._resizeListener) { window.removeEventListener('resize', this._resizeListener); this._resizeListener = null; }
    if (this._resizeRAF) { cancelAnimationFrame(this._resizeRAF); this._resizeRAF = null; }
    destroyQuestionSimulation(this._simScene);
    this._simScene = null;
    this._ppCover?.remove();
    this._ppCover = null;
  }

  // -- Narration (Q-90, narrationCover.js): an opening picture while the
  // prompt is spoken. Optional `narrationCover: { "prompt": spec }`; without
  // it every hook below is a no-op and the engine hides the card as before.

  setNarrated(on) {
    this._ppNarrated = !!on;
    if (!on && this._ppHold) { this._ppHold = false; this.requestUpdate(); }
  }

  _ppCoverSpec() {
    const c = this._data?.narrationCover;
    return c ? (c[this._ppSeg?.step] || c.prompt || null) : null;
  }

  /** LessonEngine's prompt hold: with a cover this block holds itself (the
   *  picture instead of the card) and the engine leaves its wrapper alone. */
  narrationCoverHold(on) {
    const narrated = this._ppNarrated ?? !!this._ctx?.narrated;
    if (!narrated || !this._ppCoverSpec() || this._ctx?.previewOnly) {
      if (this._ppHold) { this._ppHold = false; this.requestUpdate(); }
      return false;
    }
    on = !!on;
    if (on !== !!this._ppHold) {
      if (this._ppHold && !on) {
        this.setAttribute('pp-card-in', '');
        setTimeout(() => this.removeAttribute('pp-card-in'), 420);
      }
      this._ppHold = on;
      this.requestUpdate();
    }
    return true;
  }

  narrationWord(seg) {
    const fseg = seg ? (seg.defaultSeg || seg) : null;
    if (fseg !== this._ppSeg) { this._ppSeg = fseg; this._ppMs = 0; this._ppCoverSync(); }
    return false;
  }

  narrationSeek(beat, ms) {
    this._ppMs = Number.isFinite(ms) ? ms : 0;
    this._ppCoverSync();
  }

  _ppCoverSync() {
    const host = this._ppHold ? this.shadowRoot?.getElementById('pp-cover') : null;
    const spec = host ? this._ppCoverSpec() : null;
    if (!spec) { this._ppCover?.remove(); this._ppCover = null; return; }
    const c = this._ppCover;
    if (!c || c.spec !== spec || c.parent !== host || !c.el?.isConnected) {
      c?.remove();
      this._ppCover = new NarrationCover(host, spec, this._ctx?.bundleId);
    }
    this._ppCover.update(this._ppMs || 0, this._ppSeg?.cues);
  }

  /** While the cover holds the stage, captions keep off the picture. */
  narrationStage() {
    if (!this._ppHold) return null;
    const box = this.shadowRoot?.getElementById('pp-cover')?.getBoundingClientRect();
    if (!box || !box.height) return null;
    const r = (b) => ({ left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height });
    return { kind: 'media', stage: r(box), area: r(this.getBoundingClientRect()), free: null, proseHidden: true };
  }

  /** Same reasoning as content-block.js's own copy — see its willUpdate()/
   *  updated() pair and flipAnimate.js. ChoiceListBase defines neither
   *  method, so super.willUpdate()/super.updated() resolve straight through
   *  to the mixin. */
  willUpdate(changedProperties) {
    if (changedProperties.has('_step')) {
      this._flipFromRect = captureRect(this.shadowRoot?.querySelector('.cb-image-wrap, .cb-sim-wrap'));
    }
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    this._ppCoverSync();
    if (this._ppHold) return;
    if (this._flipFromRect) {
      playFlip(this.shadowRoot?.querySelector('.cb-image-wrap, .cb-sim-wrap'), this._flipFromRect);
      this._flipFromRect = null;
    }
    this._maybeMountSetupSim();
    this._measureSideRestTop();
    // Q-86: the setup card measures its chrome and resting offset, as the
    // question hosts do; this card's own bottom padding and rule count too.
    if (this._hasSetupSim() && !this._ctx?.previewOnly) {
      const cs = getComputedStyle(this);
      fitSetupSimAtRest(this.shadowRoot, (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0));
    }
  }

  /** Q-59: same fit-at-rest as content-block (Q-57). A side image is sized
   *  for the STUCK panel; on a fresh slide the row sits lower, so the image
   *  foot went under the action bar at 1280x720 (tissues L02 s02). */
  _measureSideRestTop() {
    const layout = this._activeImageLayout?.layout;
    const row = (layout === 'right' || layout === 'left') && this._data?.image?.src && !this._hasSetupSim()
      ? this.shadowRoot?.querySelector(`.cb-layout-${layout}`) : null;
    const next = measureRestTop(row);
    if (!restTopChanged(this._restTop, next)) return;
    this._restTop = next;
    this.requestUpdate();
  }

  /** `simulation.role: "setup"`: the scene visualises what the prompt asks
   *  about (a snapshot to predict from), so it shows immediately, beside the
   *  prompt, instead of after submitting. Any other role keeps the original
   *  behaviour: a poe-observe-sim card after the prediction is submitted. */
  _hasSetupSim() {
    const sim = this._data?.simulation;
    return !!(sim?.src && sim.role === 'setup');
  }

  _maybeMountSetupSim() {
    if (!this._hasSetupSim() || this._ctx?.previewOnly) return;
    if (this._simScene || this._simMounting || this._simFailed) return;
    const host = this.shadowRoot?.getElementById('pp-sim-host');
    if (!host) return;
    this._simMounting = true;
    mountQuestionSimulation(host, this._data.simulation.src, this._ctx?.bundleId, {}, 'setup')
      .then(({ scene, SceneClass }) => {
        this._simScene = scene;
        this._simSceneClass = SceneClass;
        this._simMounting = false;
        this.requestUpdate();
      })
      .catch((err) => {
        console.error('Failed to load predict companion simulation', err);
        this._simFailed = true;
        this._simMounting = false;
        this._simErrorMessage = err?.message || '';
        this.requestUpdate();
      });
  }

  _renderSetupSimLayout(inner) {
    const controlsTemplate = this._simSceneClass
      ? renderSimControls(
          this._simSceneClass,
          this._simScene,
          (id, value) => this._simScene?.onControlChange?.(id, value),
          () => this.requestUpdate(),
        )
      : html``;
    const position = this._data.simulation.position === 'left' ? 'left' : 'right';
    return html`
      <div class="cb-layout-${position}">
        <div class="cb-text">${inner}</div>
        ${renderSimCard({
          canvasHostId: 'pp-sim-host',
          controlsTemplate,
          failed: this._simFailed,
          errorMessage: this._simErrorMessage,
          role: 'setup',
        })}
      </div>
    `;
  }

  /** Same probe `content-block.js` uses — see blockImageLayout.js's own doc comment. */
  init(data, ctx) {
    super.init(data, ctx);
    if (data?.image?.src) {
      probeImageDimensions(data.image.src, ctx?.bundleId).then((dims) => {
        if (dims) { this._imgDims = dims; this.requestUpdate(); }
      });
    }
  }

  _availableHeight() {
    if (typeof window === 'undefined') return Infinity;
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--lesson-sticky-header-h');
    const headerH = parseFloat(raw) || 120;
    // LessonSession's fixed bottom action bar (0 / unset elsewhere).
    const footerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lesson-chrome-bottom')) || 0;
    return Math.max(0, window.innerHeight - headerH - footerH - 40);
  }

  _resolveImageLayout() {
    if (!this._data?.image?.src) return null;
    const availableHeight = this._availableHeight();
    const result = resolveImageLayout({
      positionHint: this._data.image.position || 'right',
      naturalWidth: this._imgDims?.naturalWidth,
      naturalHeight: this._imgDims?.naturalHeight,
      columnWidth: this._columnWidth,
      availableHeight,
      isNarrow: this._isNarrowViewport || this._isShortLandscape,
    });
    return fitSideImageAtRest(result, {
      naturalWidth: this._imgDims?.naturalWidth,
      naturalHeight: this._imgDims?.naturalHeight,
      captionEl: this.shadowRoot?.querySelector('.cb-image-wrap .cb-caption'),
      restExtra: sideRestExtra(this._restTop),
      availableHeight,
    });
  }

  /** Same fix, same reason, as content-block.js's own override of this
   *  ProgressiveDisclosureMixin hook: the `stem` is revealed beat by beat
   *  (see ChoiceListBase's own `_initDisclosure(data.stem, ...)`) exactly
   *  like a content-block@1's markdown, so an image resolved to 'below'
   *  here needs the identical "pin the current beat to the top, let the
   *  image follow in normal flow below it" alignment — without this
   *  override, ChoiceListBase's inherited default (center-if-it-fits, else
   *  bottom-aligned) scrolls the image out of view on any beat past the
   *  first once accumulated stem text exceeds the viewport, the same bug
   *  content-block.js had. No simulation-vs-image branch needed here (unlike
   *  content-block.js's copy): poe-predict's own `simulation` field is never
   *  laid out through `_activeImageLayout` — it only appears post-submit, in
   *  `renderPostSubmit()`'s separate `<poe-observe-sim-v1>`. */
  _scrollBeatBlockAlign(fits) {
    if (this._activeImageLayout?.layout === 'below' && this._data?.image?.src) {
      return 'start';
    }
    return fits ? 'center' : 'end';
  }

  renderHeader() {
    if (this.look === 'plain') return html`<p class="pp-label">Predict</p>`;
    return html`<h3>Predict!</h3>`;
  }

  /** Same CSS-mirroring approximation as content-block.js's own copy — see its comment. */
  _backgroundBoxHeight() {
    const vh = window.innerHeight;
    return this._isNarrowViewport ? Math.min(0.62 * vh, 460) : Math.min(0.70 * vh, 640);
  }

  _renderImage(image) {
    // widthPx (Q-59): the side-tier height fit, as content-block passes it;
    // without it the image ignored the height budget entirely.
    const { capped = false, zoomAffordance = false, widthPx = null } = this._activeImageLayout || {};
    // reveal.focusMode "camera" (Q-86): the comic camera, as content-block has it.
    const camera = this._data?.reveal?.focusMode === 'camera';
    const opts = { capped, zoomAffordance, widthPx, pop: this._data.mediaStep > 0, bundleId: this._ctx?.bundleId, camera };
    const focusMap = this._data?.reveal?.focus;
    if (!focusMap) return renderBlockImage(image, opts);
    const id = this._steps[this._step]?.id;
    let focus = id ? focusMap[id] : null;
    if (focus && this._data.reveal.opaque) focus = { ...focus, opaque: true };

    if (focus && this._activeImageLayout?.layout === 'background' && this._imgDims?.naturalWidth) {
      const imageAspect = this._imgDims.naturalWidth / this._imgDims.naturalHeight;
      const boxAspect = this._columnWidth / this._backgroundBoxHeight();
      const remapped = remapRectForCover(focus, imageAspect, boxAspect);
      if (remapped) focus = { ...remapped, opaque: focus.opaque, label: focus.label, anchor: focus.anchor };
    }

    return renderBlockImageViewport(image, focus, opts);
  }

  /**
   * Wraps ChoiceListBase's usual output (stem/options/button) beside an
   * optional image — same layout language as content-block@1. `mediaStep`
   * (see content-block.js's own `render()`) gates the image the same way
   * here: before its beat, this renders `inner` alone, full width.
   */
  /** plain, no companion visual: the prompt + answer panel spread
   *  (answerPanel.js). An image or setup sim keeps the stacked layout. */
  _renderPlainPanel() {
    const { done } = this.stepState();
    return html`
      <div class="qp-layout">
        <div class="qp-prompt">
          ${this.renderHeader()}
          <div class="stem cb-reading">${this._renderSteps()}</div>
        </div>
        ${done ? html`
          <section class="qp-panel" aria-label="Your prediction">
            <p class="qp-panel-head">Your prediction</p>
            ${this._renderOptionsList()}
            ${!this._submitted ? html`
              <button class="qp-check submit-btn-margin" @click=${this._onSubmit} ?disabled=${!this._selectedId}>Submit prediction</button>
            ` : this.renderPostSubmit()}
          </section>
        ` : ''}
      </div>
    `;
  }

  render() {
    if (this._ppHold) return html`<div class="pp-cover" id="pp-cover"></div>`;
    return this._renderCard();
  }

  _renderCard() {
    if (this._data && this.look === 'plain' && !this._ctx?.previewOnly
      && !this._hasSetupSim() && !this._data.image?.src && !this._data.simulation?.src) {
      return this._renderPlainPanel();
    }
    const inner = super.render();
    if (this._hasSetupSim() && !this._ctx?.previewOnly) return this._renderSetupSimLayout(inner);
    const image = this._data?.image;
    if (!image?.src || !this.isStepRevealed(this._data.mediaStep)) return inner;
    this._activeImageLayout = this._resolveImageLayout();
    const layoutClass = this._activeImageLayout
      ? `cb-layout-${this._activeImageLayout.layout}`
      : blockLayoutClass(image, null);
    return html`
      <div class="${layoutClass}">
        <div class="cb-text">${inner}</div>
        ${this._renderImage(image)}
      </div>
    `;
  }

  /** The last beat brings the options, so the landing spot is the choices,
   *  with this beat's question still in sight, not the beat alone. */
  _scrollCurrentBeatIntoView() {
    if (this.stepState().done && !this._submitted) this._keepInView('.rv-current', '.submit-btn-margin');
    else super._scrollCurrentBeatIntoView();
  }

  /**
   * Scrolls just enough to lift `endSel` above the fixed action bar, never
   * pushing `topSel` under the sticky header: the choices run taller than a
   * short screen, and Submit and the verdict come last.
   */
  _keepInView(topSel, endSel) {
    const end = this.shadowRoot?.querySelector(endSel);
    const top = this.shadowRoot?.querySelector(topSel);
    if (!end || !top || document.hidden) return;
    const root = getComputedStyle(document.documentElement);
    const header = parseFloat(root.getPropertyValue('--lesson-sticky-header-h')) || 0;
    const footer = parseFloat(root.getPropertyValue('--lesson-chrome-bottom')) || 0;
    // plain phone: Submit rides sticky above the footer, so its own box is
    // always on screen; the answer panel's bottom is where it settles.
    const endBox = (getComputedStyle(end).position === 'sticky' && end.closest('.qp-panel')) || end;
    const over = endBox.getBoundingClientRect().bottom + 14 - (window.innerHeight - footer);
    const room = top.getBoundingClientRect().top - header - 12;
    const dy = Math.min(over, room);
    if (dy <= 0) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollBy({ top: dy, behavior: reduce ? 'auto' : 'smooth' });
  }

  _selectOption(id) {
    super._selectOption(id);
    if (!this._submitted) this.updateComplete.then(() => this._keepInView('.option.selected', '.submit-btn-margin'));
  }

  /** Narration: after the prediction, hold for Continue only when there is
   *  feedback to read; a deferred verdict shows just "Prediction saved". */
  narrationHold() {
    return !this._data?.deferVerdict;
  }

  /** A pick the learner has not submitted: Next means submit it, rather than
   *  asking whether to skip a question they just answered. See LessonEngine. */
  commitPending() {
    if (this._submitted || !this._selectedId) return false;
    this._onSubmit();
    return true;
  }

  _onSubmit() {
    if (!this._selectedId) return;
    this._submitted = true;
    this.updateComplete.then(() => this._keepInView('.confirmed', '.confirmed'));

    // Resolve the human-readable text for the selected option
    const opt  = this._data.options?.find(o => o.id === this._selectedId);
    const text = opt ? opt.text : this._selectedId;

    const isCorrect = this._selectedId === this._data.correctOptionId;
    const verdict = isCorrect ? 'Your prediction is correct!' : 'Your prediction is incorrect.';
    const payload = {
      blockId:        this._data.id,
      blockIndex:     this._ctx?.blockIndex,
      prediction:     this._selectedId,
      predictionText: text,
      isCorrect:      isCorrect
    };

    EventBus.emit('poe:prediction-submitted', payload);
    // Lets a later poeRole-tagged block recall this even though it mounts
    // (and starts listening) only after this event has already fired —
    // EventBus itself has no replay/buffering. See POEController.js.
    this._ctx?.poe?.recordPrediction(payload);

    if (this._data.deferVerdict) {
      A11yAnnouncer.announce('Prediction saved. Keep going to see what actually happens.');
    } else if (this._data.simulation && !this._hasSetupSim()) {
      A11yAnnouncer.announce(`Prediction saved. ${verdict} Observe the simulation below.`);
    } else {
      A11yAnnouncer.announce(`Prediction saved. ${verdict} Continue to see the explanation.`);
    }
    this.requestUpdate();
  }

  /** Shown after the student submits their prediction */
  renderPostSubmit() {
    const opt = this._data.options?.find(o => o.id === this._selectedId);
    const predictionText = opt ? opt.text : this._selectedId;
    const isCorrect = this._selectedId === this._data.correctOptionId;
    const feedback = opt?.feedback ? html`<div style="margin-top: 8px; padding: 12px; background: var(--bg-panel); border-radius: var(--radius-xs); font-style: italic; color: var(--text-muted); border-left: 4px solid var(--primary-color);">${opt.feedback}</div>` : '';
    
    if (this._data.simulation && !this._hasSetupSim()) {
      return html`
        <div class="confirmed ${isCorrect ? 'correct' : 'incorrect'}" style="margin-bottom: 24px;">
          Prediction saved. 
          <span style="color: ${isCorrect ? 'var(--success-text)' : 'var(--error-text)'}; font-weight: bold;">
            ${isCorrect ? 'Correct!' : 'Incorrect.'}
          </span>
          ${feedback}
          <div style="margin-top: 12px;">Now observe the simulation to see what actually happens:</div>
        </div>
        <poe-observe-sim-v1
          ._data=${ { src: this._data.simulation.src, instructions: this._data.simulation.instructions || 'Observe the simulation below.' } }
          ._bundleId=${this._ctx?.bundleId}
          ._unlocked=${true}
          ._studentPrediction=${predictionText}>
        </poe-observe-sim-v1>
      `;
    }
    if (this._data.deferVerdict) {
      // No verdict, no color, no "scroll down" (LessonEngine shows one block
      // at a time — there's nothing below to scroll to). The verdict itself
      // is shown by whichever block is tagged poeRole:"observe"/"explain"
      // right after this one — see content-block.js's _renderPoeRecap().
      // plain: the text sans has no check glyph, so the mark is an svg.
      if (this.look === 'plain') {
        return html`
          <div class="confirmed deferred" role="status">
            <svg class="pp-mark" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="8.6"/><path d="M6 10.4l2.7 2.6L14.2 7.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>Prediction saved. Keep going to see what actually happens.</span>
          </div>
        `;
      }
      return html`
        <div class="confirmed deferred">
          ✓ Prediction saved — keep going to see what actually happens.
        </div>
      `;
    }

    return html`
      <div class="confirmed ${isCorrect ? 'correct' : 'incorrect'}">
        Prediction saved.
        <span style="color: ${isCorrect ? 'var(--success-text)' : 'var(--error-text)'}; font-weight: bold;">
          ${isCorrect ? 'Correct!' : 'Incorrect.'}
        </span>
        ${feedback}
        <div style="margin-top: 12px;">Continue to see the explanation.</div>
      </div>
    `;
  }

  /** Tell the LessonSession shell not to render the global "Check Answer" button */
  get _isRevealed() {
    return true;
  }

  /** POE-predict also exposes evaluate() so TestEngine can score it */
  evaluate() {
    if (!this._data?.correctOptionId || !this._submitted) {
      return { score: 0, isCorrect: false, feedback: 'No prediction submitted.' };
    }
    const isCorrect = this._selectedId === this._data.correctOptionId;
    return {
      score:     isCorrect ? 1 : 0,
      isCorrect,
      feedback:  isCorrect ? 'Your prediction was correct!' : 'Your prediction was incorrect.',
    };
  }
}

customElements.define('poe-predict-v1', PoePredictPlugin);
