import { LitElement, html, css } from 'lit';
import { EventBus } from '../../../../core/EventBus.js';
import '../../../../ui/components/MarkdownRenderer.js';
import '../../../../core/components/FeedbackBanner.js';
import '../../../../core/components/QuestionExplanation.js';
import { brandCopy, brandIcon } from '../../../../ui/components/LookSlots.js';
import { blockImageLayoutStyles, renderBlockImage, blockLayoutClass, BlockImageFitController } from '../../../../core/components/blockImageLayout.js';
import {
  mountQuestionSimulation, destroyQuestionSimulation, renderSimControls, renderSimCard, setupSimFitStyles, fitSetupSimAtRest,
} from '../../../../core/components/simulationHost.js';
import { mountQuestionGraph, renderGraphCard } from '../../../../core/components/graphHost.js';
import { mountQuestionDiagram, renderDiagramCard } from '../../../../core/components/diagramHost.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles, optionKeyStyles, optionKeyLetter, plainChoiceStyles } from '../../../../ui/sharedStyles.js';
import { LookMixin } from '../../../../core/mixins/LookMixin.js';
import { plainAnswerPanelStyles, renderPanelVerdict, renderPanelHints, renderPanelCheck, hintTexts } from '../../../../core/components/answerPanel.js';

export class MCQSingle extends LookMixin(LitElement) {
  static LOOK_RENDERERS = true;
  // plain: prompt left, answer panel right (core/components/answerPanel.js).
  static PLAIN_PANEL = true;
  static schema = {
    $id: "mcq-single@2",
    type: "object",
    required: ["id", "type", "stem", "options", "correctOptionId"],
    properties: {
      id: { type: "string" },
      type: { const: "mcq-single@2" },
      stem: { type: "object" }, // { en: "..." }
      options: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "text"],
          properties: {
            id: { type: "string" },
            text: { type: "object" }, // { en: "..." }
            // Shown in the feedback banner when THIS option is picked (falls
            // back to the correct option's own feedback otherwise — see
            // static score()). Keyed by the option's own `id`, so it stays
            // correct under shuffle — unlike prose in `explanation` below,
            // this is the shuffle-safe place to say something specific to
            // one particular option.
            feedback: { type: "object" } // { en: "..." } — optional
          }
        }
      },
      correctOptionId: { type: "string" },
      // Generic worked-solution prose shown on reveal (QuestionExplanation).
      // shuffle (below) reorders options for DISPLAY only — this text is
      // authored once against options[] in their AUTHORED order, so it must
      // never say "option a/b/c/d" or "the first/second choice": by the time
      // a student sees it, shuffle may have put that option anywhere on
      // screen. Refer to an option by its own content/text instead, or use
      // the per-option `feedback` field above for anything genuinely
      // option-specific (that one IS shuffle-safe, since it's id-keyed).
      explanation: { type: "object" }, // { en: "..." } — optional
      explanationSlide: { type: "object" }, // optional — see QuestionExplanation.js
      hints: { type: "array" }, // optional — see getHint()/QuestionBase
      shuffle: { type: "boolean" }, // default true — display order only, see init()
      image: { type: "object" }, // { src, alt, caption?, position? } — optional
      simulation: { type: "object" }, // { src, position?, role? } — optional companion sim; role: "setup" (default "explanation") shows it immediately alongside the stem instead of gated behind reveal
      graph: { type: "object" }, // { functions?: [{expression, label?, color?}], points?: [{x,y,label?}], xDomain, yDomain, xLabel?, yLabel?, position? } — optional companion graph (mutually exclusive with simulation/image), always shown immediately, never reveal-gated
      diagram: { type: "object" } // { points, segments?, angles?, rightAngles?, parallelMarks?, circles?, viewBox?, a11yCaption?, position? } — optional companion geometry figure (see GeometryDiagram.js), mutually exclusive with simulation/image/graph, always shown immediately, never reveal-gated
    }
  };

  static styles = [btn3dStyles, feedbackAnimStyles, blockImageLayoutStyles, optionKeyStyles, css`
    :host {
      display: block;
      margin-bottom: 2rem;
      font-family: var(--font-family, 'Nunito', system-ui, sans-serif);
    }
    .question-stem {
      font-size: var(--fs-stem);
      font-weight: var(--fw-stem);
      line-height: var(--lh-stem);
      margin-bottom: 1.1rem;
      color: var(--text-main);
    }
    .options-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .option {
      display: flex;
      align-items: center;
      padding: 13px 16px;
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-md);
      cursor: pointer;
      font-weight: var(--fw-strong);
      background: var(--bg-surface);
      box-shadow: var(--press-1) var(--lip-color);
      transition: transform 80ms, border-color 0.15s, background 0.15s, box-shadow 80ms;
    }
    .option:hover:not(.disabled) {
      border-color: var(--primary-color);
    }
    .option:active:not(.disabled) {
      transform: translateY(var(--option-press, 3px));
      box-shadow: none;
    }
    .option.selected {
      border-color: var(--primary-color);
      background: var(--primary-light);
      box-shadow: var(--press-1) var(--primary-color);
    }
    .option.disabled {
      cursor: default;
    }
    .option-text {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      min-width: 0;
    }
    .verdict-tag {
      flex: none;
      font-size: 0.78rem;
      font-weight: var(--fw-heavy);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .verdict-tag.good { color: var(--success-text); }
    .verdict-tag.bad { color: var(--error-text); }

    @keyframes sd-option-thud {
      0%   { transform: translateY(calc(-4px * var(--bounce))); box-shadow: 0 calc(8px * var(--bounce)) 0 var(--error-text); }
      30%  { transform: translateY(calc(4px * var(--bounce))); box-shadow: 0 0 0 var(--error-text); }
      50%  { transform: translateY(calc(-1px * var(--bounce))); box-shadow: 0 calc(5px * var(--bounce)) 0 var(--error-text); }
      70%  { transform: translateY(calc(2px * var(--bounce))); box-shadow: 0 calc(2px * var(--bounce)) 0 var(--error-text); }
      100% { transform: translateY(0); box-shadow: var(--lip-fixed) var(--error-text); }
    }
    @keyframes sd-option-spring {
      0%   { transform: translateY(calc(4px * var(--bounce))); box-shadow: 0 0 0 var(--success-text); }
      50%  { transform: translateY(calc(-2px * var(--bounce))); box-shadow: 0 calc(6px * var(--bounce)) 0 var(--success-text); }
      100% { transform: translateY(0); box-shadow: var(--lip-fixed) var(--success-text); }
    }
    .shake-anim {
      animation: sd-option-thud 0.5s ease-out both;
      transition: none !important;
    }
    .pop-anim {
      animation: sd-option-spring 0.4s var(--ease-pop) both;
      transition: none !important;
    }
    .option.correct-mark,
    .option.correct-mark.selected,
    .option.correct-mark.disabled {
      border-color: var(--verdict-rule-good, var(--success-text)) !important;
      background: var(--success-bg) !important;
      color: var(--success-text) !important;
      box-shadow: var(--press-1) var(--success-text) !important;
      z-index: 2;
    }
    .option.incorrect-mark,
    .option.incorrect-mark.selected,
    .option.incorrect-mark.disabled {
      border-color: var(--verdict-rule-bad, var(--error-text)) !important;
      background: var(--error-bg) !important;
      color: var(--error-text) !important;
      box-shadow: var(--press-1) var(--error-text) !important;
    }
    /* Scales a companion simulation's canvas to this card's own width
     * instead of letting it render at its raw internal pixel size (most
     * scenes are authored at 900x600) — matches content-block.js's own
     * .sim-host-container rule. See simulationHost.js's renderSimCard()
     * doc comment for why this has to live here rather than in that shared
     * function. The max-width is the other half of that same rule, and was
     * missed on the first pass: a question can sit inside a lesson content
     * column up to 1600px wide (LessonSession.js), and "scale to 100% of
     * the container" with no cap UPSCALES a 900x600-native scene to that
     * width — larger and blurrier than its own source resolution, and tall
     * enough (900/1600 ratio) to force page scrolling even in a maximized
     * window. content-block.js's own .cb-layout-above/.cb-layout-below caps
     * its sim panel at 820px for exactly this reason; matched here. */
    .q-sim-host-container {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      height: auto;
      border-radius: var(--radius-sm);
      overflow: hidden;
      /* Fallback deliberately kept: --sim-bg-deep lives in sim-theme.css, not
         theme.css, and a host page that mounts this question without loading
         the simulation palette would otherwise paint the sim frame with an
         empty background string. Same reasoning as readSimColors()'s per-scene
         fallbacks. */
      background: var(--sim-bg-deep, #0a0f1e);
      line-height: 0;
    }
    .q-sim-host-container canvas:not([data-sim-own-size]):not(.sim-dom-root canvas[style*="width"], .sim-dom-root canvas[style*="height"]) {
      width: 100% !important;
      height: auto !important;
      display: block;
    }
    .q-sim-host-container .sim-dom-root {
      line-height: normal;
    }
    /* Keeps the CONTROLS row (renderSimControls()'s own wrapper, which is
     * width:100% of its parent, unlike the canvas above it) the same
     * effective width as the centered, 820px-capped canvas, instead of
     * spanning the card's full (up to 60%-of-column) width and reading as
     * misaligned under a narrower, centered simulation. */
    .q-sim-controls {
      max-width: 820px;
      margin-left: auto;
      margin-right: auto;
    }
    /* A companion simulation with role:"explanation" mounts stacked below
     * the explanation box (see the layout note above) — easy to miss, and
     * a long feedback message or explanation can push it (and any hint
     * placed inline near the top of the reveal content) below the fold on
     * a short mobile viewport regardless of how early in the DOM it sits —
     * being "first" in the document still isn't "on screen" if everything
     * above it already fills the viewport. So this is a fixed badge
     * instead: pinned to the viewport, visible without any scrolling at
     * all, tappable to jump straight to the sim card, and it hides itself
     * (via _maybeObserveSimCard()'s IntersectionObserver) the moment that
     * card actually scrolls into view, so it doesn't linger over content
     * once it's served its purpose. */
    .q-sim-fab {
      position: fixed;
      left: 50%;
      bottom: 20px;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
      font-weight: var(--fw-heavy);
      font-family: inherit;
      color: var(--on-primary);
      background: var(--primary-color);
      border: none;
      border-radius: var(--radius-pill);
      padding: 12px 20px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      z-index: 40;
      cursor: pointer;
      animation: q-sim-fab-bounce 1.6s ease-in-out infinite;
    }
    @keyframes q-sim-fab-bounce {
      0%, 100% { transform: translateX(-50%) translateY(0); }
      50% { transform: translateX(-50%) translateY(-5px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .q-sim-fab { animation: none; }
    }
    /* Base card chrome — see simulationHost.js's renderSimCard() doc comment
     * for why this has to be a class here rather than an inline style (the
     * inline-style-beats-external-rule bug that made the side-by-side
     * override below silently no-op the first time this was tried). */
    .q-sim-card {
      margin-top: 1.25rem;
      padding: 16px 18px;
      background: var(--bg-surface);
      border-radius: var(--radius-md);
      border: var(--rule-w) solid var(--border-color);
      box-shadow: var(--lip-tile) var(--border-color);
    }
    /* Side-by-side sizing for a role:"setup" companion sim — reuses
     * .cb-layout-right/.cb-layout-left from blockImageLayoutStyles (already
     * imported above) the exact same way an image does, via render()
     * below. Without this, the sim card and this question's own options
     * list stack vertically and a tall card (even capped at 820px wide,
     * ~550px tall including its heading/controls) pushes the options off
     * the first screen — the same "have to scroll unnecessarily to find
     * the answer field" report QuestionBase.js's numeric/text questions
     * had. Explanation-role sims stay stacked (rendered from
     * _renderContent(), not render()) since by the time one shows, the
     * student has already answered — no field to lose. */
    .cb-layout-right .q-sim-card,
    .cb-layout-left  .q-sim-card {
      flex: 1.5 1 55%;
      max-width: 60%;
      margin-top: 0;
    }
    @media (max-width: 600px) {
      .cb-layout-right .q-sim-card,
      .cb-layout-left  .q-sim-card {
        flex: unset;
        max-width: 100%;
        /* stacked: fill the column (a shrink-to-fit card collapsed the scene to ~170px) */
        width: 100%;
        box-sizing: border-box;
      }
    }
    /* Companion graph (data.graph) — see graphHost.js's renderGraphCard()
     * doc comment for why these exact rules live here rather than there. */
    .q-graph-card {
      margin-top: 1.25rem;
      padding: 16px 18px;
      background: var(--bg-surface);
      border-radius: var(--radius-md);
      border: var(--rule-w) solid var(--border-color);
      box-shadow: var(--lip-tile) var(--border-color);
    }
    .q-graph-host-container {
      width: 100%;
      max-width: 640px;
      margin: 0 auto;
      aspect-ratio: 4 / 3;
    }
    /* See QuestionBase.js's identical rule for why this is needed — without
     * it the svg below falls back to its 150px intrinsic default height
     * regardless of width, rendering a squashed, far-too-narrow-looking plot. */
    .q-graph-host-container > div { width: 100%; height: 100%; }
    .q-graph-host-container svg { width: 100%; height: 100%; display: block; }
    .cb-layout-right .q-graph-card,
    .cb-layout-left  .q-graph-card {
      flex: 1.5 1 55%;
      max-width: 60%;
      margin-top: 0;
    }
    @media (max-width: 600px) {
      .cb-layout-right .q-graph-card,
      .cb-layout-left  .q-graph-card {
        flex: unset;
        max-width: 100%;
      }
    }
    /* Companion geometry figure (data.diagram) — same shape as .q-graph-card
     * above, sibling class names under .q-diagram-*. */
    .q-diagram-card {
      margin-top: 1.25rem;
      padding: 16px 18px;
      background: var(--bg-surface);
      border-radius: var(--radius-md);
      border: var(--rule-w) solid var(--border-color);
      box-shadow: var(--lip-tile) var(--border-color);
    }
    .q-diagram-host-container {
      width: 100%;
      margin: 0 auto;
      aspect-ratio: 4 / 3;
    }
    .q-diagram-host-container > div { width: 100%; height: 100%; }
    .q-diagram-host-container svg { width: 100%; height: 100%; display: block; }
    .cb-layout-right .q-diagram-card,
    .cb-layout-left  .q-diagram-card {
      flex: 1.5 1 55%;
      max-width: min(60%, 460px);
      margin-top: 0;
    }
    @media (max-width: 600px) {
      .cb-layout-right .q-diagram-card,
      .cb-layout-left  .q-diagram-card {
        flex: unset;
        max-width: 100%;
      }
    }
  `, setupSimFitStyles, plainChoiceStyles, plainAnswerPanelStyles];

  static properties = {
    _data: { type: Object, state: true },
    _selectedOptionId: { type: String, state: true },
    _options: { type: Array, state: true },
    _revealed: { type: Boolean, state: true },
    _result: { type: Object, state: true },
    _hintLevel: { type: Number, state: true },
    // Set by LessonSession under plain (see answerPanel.js).
    panelCheck: { type: Boolean, attribute: false },
  };

  constructor() {
    super();
    this._data = null;
    this._selectedOptionId = null;
    this._options = [];
    this._revealed = false;
    this._result = null;
    this._hintLevel = 0;

    // Companion simulation (optional `data.simulation.src`) — mounted
    // only once revealed. Plain instance fields, not Lit `properties`: the
    // scene is a live canvas-driving object, not serializable render state.
    this._simScene = null;
    this._simSceneClass = null;
    this._simMounting = false;
    this._simFailed = false;
    this._simErrorMessage = '';

    // Companion graph (optional `data.graph`) — mounted once, immediately
    // (never reveal-gated — see graphHost.js's header comment for why).
    this._graphMounted = false;
    // Companion geometry figure (optional `data.diagram`) — same pattern.
    this._diagramMounted = false;

    // Whether the role:"explanation" companion sim card has scrolled into
    // view yet — drives the fixed "jump to it" badge. See
    // _maybeObserveSimCard().
    this._simCardVisible = false;
    this._simCardObserver = null;

    // Q-60: image height fit + fit-at-rest (blockImageLayout.js), and the
    // listeners the setup-sim fit re-measures on.
    this._mediaFit = new BlockImageFitController(this, {
      image: () => this._data?.image,
      bundleId: () => this._ctx?.bundleId,
      active: () => !this._ctx?.previewOnly && !!(this._data?.image?.src
        || (this._data?.simulation?.src && this._data.simulation.role === 'setup')),
    });
  }

  /**
   * Required plugin lifecycle method.
   * @param {object} data The question payload.
   * @param {PRNG} [prng] Deterministic random number generator — passed by
   *   TestEngine. LessonEngine instead passes a `{ poe, blockIndex }` context
   *   object in this same slot (see POEController.js) when mounting a block
   *   sequence rather than a test, so this is duck-typed rather than trusted
   *   by shape alone.
   */
  init(data, prng, ctx) {
    if (!data || !data.stem || !data.options) {
      throw new Error("MCQSingle requires 'stem' and 'options'.");
    }
    this._data = data;
    const isPrng = prng && typeof prng.shuffle === 'function';
    // As a LessonEngine block, arg2 IS the ctx (`{ poe, blockIndex, bundleId }`)
    // — see the duck-typing note above. As a TestEngine question, arg2 is the
    // PRNG and ctx (`{ bundleId }`) rides in arg3 instead (TestEngine.js).
    this._ctx = isPrng ? (ctx || null) : (prng || null);

    // Display order only — scoring (static score()) always looks options up
    // by `id` (itemData.correctOptionId / response.selectedOptionId), never
    // by position, so shuffling this copy can't affect correctness. This is
    // also why authored `explanation` text must never refer to an option by
    // letter/position ("option b", "the first choice") — see the schema
    // comment on `explanation` above.
    this._options = [...data.options];
    if (data.shuffle !== false && isPrng) {
      prng.shuffle(this._options);
    }
  }

  /**
   * Required state method.
   * @returns {object} The current student state.
   */
  getState() {
    return { selectedOptionId: this._selectedOptionId };
  }

  /**
   * Required state method.
   * @param {object} state The state to restore.
   */
  setState(state) {
    if (state && state.selectedOptionId) {
      this._selectedOptionId = state.selectedOptionId;
    }
  }

  /** This plugin doesn't extend ChoiceListBase (its own from-scratch
   *  reimplementation) — `_revealed` (flipped inside evaluate() below) is
   *  its own answered-state signal. */
  isAnswered() { return this._revealed; }

  /**
   * Required response method — a nested composite type (e.g.
   * comprehension-set@1) resolves this plugin's own registered class and
   * calls `static score(itemData, response)` directly, never going through
   * a live instance; without this, that path had nothing to pass in and
   * silently scored every mcq-single@2 as 0 regardless of the answer.
   */
  getResponse() {
    return { selectedOptionId: this._selectedOptionId };
  }

  /**
   * Pure, DOM-independent scoring — the actual answer-key check lives here
   * (not duplicated in evaluate() below) so a composite type's headless
   * `Ctor.score(itemData, response)` call produces the identical verdict a
   * live instance's own evaluate() would.
   *
   * The authored answer key is `itemData.correctOptionId` (top-level,
   * required by static schema) — every real question in the content tree
   * uses this shape, never a per-option `isCorrect` flag. Looking for
   * `o.isCorrect` here instead was a real bug: it always found `undefined`,
   * so this question type never scored a single real answer as correct.
   */
  static score(itemData, response) {
    if (!itemData) return { score: 0, isCorrect: false };
    const selectedOptionId = response?.selectedOptionId;
    const correctOption = itemData.options.find(o => o.id === itemData.correctOptionId);
    const selectedOption = itemData.options.find(o => o.id === selectedOptionId);
    const isCorrect = !!(correctOption && selectedOptionId === correctOption.id);
    const rawFeedback = selectedOption ? selectedOption.feedback : (correctOption ? correctOption.feedback : null);
    let feedbackStr = typeof rawFeedback === 'object' && rawFeedback !== null ? (rawFeedback.en || '') : (rawFeedback || '');

    if (!selectedOptionId) {
      feedbackStr = 'Unattempted (Incorrect).';
    } else if (!feedbackStr) {
      feedbackStr = isCorrect ? 'Correct!' : 'Incorrect.';
    }

    return { score: isCorrect ? 1 : 0, isCorrect, feedback: feedbackStr };
  }

  /**
   * Required evaluation method.
   * @returns {object} Score and feedback.
   */
  evaluate() {
    if (!this._data) {
      return { score: 0, isCorrect: false };
    }
    this._result = this.constructor.score(this._data, this.getResponse());
    this._revealed = true;
    this.requestUpdate();
    return this._result;
  }

  _handleSelect(id) {
    this._selectedOptionId = id;

    // Broadcast interaction to the TestEngine for analytics or enabling 'Next' button
    EventBus.emit('interaction:question', {
      questionId: this._data.id,
      state: this.getState()
    });
  }

  /** Mounts the optional companion simulation once its role's gate is
   *  satisfied and the sim-host `<div>` `_renderContent()` renders actually
   *  exists in the DOM. `role: "setup"` mounts immediately; `role:
   *  "explanation"` (default) waits for `_revealed`, same as before `role`
   *  existed. Not beat-synced — see simulationHost.js's header comment. */
  updated(changedProperties) {
    super.updated?.(changedProperties);
    if (!this._ctx?.previewOnly) fitSetupSimAtRest(this.shadowRoot);
    this._maybeMountGraph();
    this._maybeMountDiagram();
    const sim = this._data?.simulation;
    if (!sim?.src) return;
    const isSetup = sim.role === 'setup';
    if (!isSetup) this._maybeObserveSimCard();
    if (!isSetup && !this._revealed) return;
    if (this._simScene || this._simMounting || this._simFailed) return;
    const host = this.shadowRoot?.getElementById('q-sim-host');
    if (!host) return;
    this._simMounting = true;
    mountQuestionSimulation(host, this._data.simulation.src, this._ctx?.bundleId, {}, sim.role || 'explanation')
      .then(({ scene, SceneClass }) => {
        this._simScene = scene;
        this._simSceneClass = SceneClass;
        this._simMounting = false;
        this.requestUpdate();
      })
      .catch((err) => {
        console.error('Failed to load companion simulation', err);
        this._simFailed = true;
        this._simMounting = false;
        this._simErrorMessage = err?.message || '';
        this.requestUpdate();
      });
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    destroyQuestionSimulation(this._simScene);
    this._simScene = null;
    this._simCardObserver?.disconnect();
    this._simCardObserver = null;
    this._graphCleanup?.();
    this._graphCleanup = null;
    this._diagramCleanup?.();
    this._diagramCleanup = null;
  }

  /** Mounts the optional companion graph (`data.graph`) once its host
   *  `<div>` exists — mirrors QuestionBase.js's identical helper. */
  _maybeMountGraph() {
    if (this._graphMounted || !this._data?.graph) return;
    const host = this.shadowRoot?.getElementById('q-graph-host');
    if (!host) return;
    this._graphMounted = true;
    mountQuestionGraph(host, this._data.graph)
      .then(({ destroy }) => { this._graphCleanup = destroy; })
      .catch((err) => {
        console.error('Failed to load companion graph', err);
      });
  }

  /** Mounts the optional companion geometry figure (`data.diagram`) once
   *  its host `<div>` exists — mirrors _maybeMountGraph() above. */
  _maybeMountDiagram() {
    if (this._diagramMounted || !this._data?.diagram) return;
    const host = this.shadowRoot?.getElementById('q-diagram-host');
    if (!host) return;
    this._diagramMounted = true;
    mountQuestionDiagram(host, this._data.diagram)
      .then(({ destroy }) => { this._diagramCleanup = destroy; })
      .catch((err) => {
        console.error('Failed to load companion diagram', err);
      });
  }

  /** Watches the role:"explanation" `.q-sim-card` (once it exists, after
   *  reveal) so the fixed FAB badge can hide itself once the student has
   *  actually scrolled the simulation into view — mirrors QuestionBase.js's
   *  identical helper (see its comment for why this has to be a fixed,
   *  scroll-position-independent badge rather than an inline hint). */
  _maybeObserveSimCard() {
    if (this._simCardObserver || this._simCardVisible || !this._revealed) return;
    const card = this.shadowRoot?.querySelector('.q-sim-card');
    if (!card) return;
    this._simCardObserver = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        this._simCardVisible = true;
        this._simCardObserver?.disconnect();
        this._simCardObserver = null;
        this.requestUpdate();
      }
    }, { threshold: 0.15 });
    this._simCardObserver.observe(card);
  }

  _scrollToSimCard() {
    this.shadowRoot?.querySelector('.q-sim-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** A fixed, always-on-screen badge pointing at the role:"explanation"
   *  sim card — mirrors QuestionBase.js's identical helper. */
  _renderSimFab() {
    const sim = this._data?.simulation;
    if (!sim?.src || sim.role === 'setup' || !this._revealed || this._simCardVisible) return '';
    return html`
      <button type="button" class="q-sim-fab" @click=${() => this._scrollToSimCard()}>
        <span style="font-size: 1.1rem;">${brandIcon('scene')}</span> See it happen <span aria-hidden="true">↓</span>
      </button>
    `;
  }

  /** Renders the companion simulation card for the given slot, or nothing
   *  if this question has no `data.simulation` or its role doesn't match
   *  this slot. `'setup'` is called from `render()` (side-by-side with the
   *  rest of the content, via `.q-sim-card` — see the CSS above for why);
   *  `'explanation'` is called from `_renderContent()`, after the
   *  explanation box, gated on `_revealed`. Exactly one of the two ever
   *  actually renders, since `simulation.role` is a single value, never
   *  both. The reveal gate on `'explanation'` is what keeps it from ever
   *  acting as an accidental spoiler. */
  _renderCompanionSimulation(slot) {
    const sim = this._data?.simulation;
    if (!sim?.src) return html``;
    const role = sim.role === 'setup' ? 'setup' : 'explanation';
    if (role !== slot) return html``;
    if (role === 'explanation' && !this._revealed) return html``;
    const controlsTemplate = this._simSceneClass
      ? renderSimControls(
          this._simSceneClass,
          this._simScene,
          (id, value) => this._simScene?.onControlChange?.(id, value),
          () => this.requestUpdate(),
        )
      : html``;
    return renderSimCard({
      canvasHostId: 'q-sim-host',
      controlsTemplate,
      failed: this._simFailed,
      errorMessage: this._simErrorMessage,
      role,
    });
  }

  render() {
    if (!this._data) return html``;
    // Bank-preview: just the stem (or assertion-reason@1's overridden
    // _renderStem()) — no options, selection state, or companion sim/graph.
    if (this._ctx?.previewOnly) return this._renderStem();
    const content = this._renderContent();
    const image = this._data.image;
    const sim = this._data.simulation;
    const graph = this._data.graph;
    const diagram = this._data.diagram;
    const hasSetupSim = !!(sim?.src && sim.role === 'setup');
    const simFab = this._renderSimFab();

    // A `role: "setup"` sim gets the side-by-side treatment (see the
    // .q-sim-card CSS above for why) — takes priority over `graph`/`image`
    // since no question in practice authors more than one companion visual,
    // and setup-sim visibility is the one with a reported bug to fix.
    if (hasSetupSim) {
      return html`
        <div class="${blockLayoutClass(null, sim)}">
          <div class="cb-text">${content}</div>
          ${this._renderCompanionSimulation('setup')}
        </div>
        ${simFab}
      `;
    }
    // `graph` is never reveal-gated (see graphHost.js) — e.g. "which
    // equation matches this graph?" needs it visible from the start, same
    // immediate side-by-side treatment as a setup sim.
    if (graph) {
      return html`
        <div class="${blockLayoutClass(null, graph)}">
          <div class="cb-text">${content}</div>
          ${renderGraphCard({ hostId: 'q-graph-host' })}
        </div>
        ${simFab}
      `;
    }
    // `diagram` gets the same immediate treatment as `graph` above.
    if (diagram) {
      return html`
        <div class="${blockLayoutClass(null, diagram)}">
          <div class="cb-text">${content}</div>
          ${renderDiagramCard({ hostId: 'q-diagram-host' })}
        </div>
        ${simFab}
      `;
    }
    if (!image?.src) return html`${content}${simFab}`;
    const fit = this._mediaFit.resolve();
    return html`
      <div class="${fit ? `cb-layout-${fit.layout}` : blockLayoutClass(image, null)}">
        <div class="cb-text">${content}</div>
        ${renderBlockImage(image, { capped: fit?.capped, zoomAffordance: fit?.zoomAffordance, widthPx: fit?.widthPx, bundleId: this._ctx?.bundleId })}
      </div>
      ${simFab}
    `;
  }

  /** Renders the lead-in content above the options list — just the stem by
   *  default. Overridden by assertion-reason@1 (which subclasses this
   *  component) to show labeled Assertion/Reason blocks instead. */
  _renderStem() {
    return html`
      <div class="question-stem">
        <markdown-renderer .content="${this._data.stem?.en || this._data.stem}"></markdown-renderer>
      </div>
    `;
  }

  /** plain + a shell that asked for the panel: the editorial spread. */
  _usesPlainPanel() {
    return this.look === 'plain' && this.panelCheck && this.constructor.PLAIN_PANEL && !this._ctx?.previewOnly;
  }

  _renderPlainPanel() {
    const d = this._data;
    const result = this._revealed && this._result ? this._result : null;
    const stack = !!(d.image?.src || d.graph || d.diagram || (d.simulation?.src && d.simulation.role === 'setup'));
    return html`
      <div class="qp-layout ${stack ? 'qp-stack' : ''}">
        <div class="qp-prompt">
          <p class="qp-kicker">Question</p>
          ${this._renderStem()}
        </div>
        <section class="qp-panel" aria-label="Your answer">
          <p class="qp-panel-head">Choose one</p>
          ${this._renderOptions()}
          ${!this._revealed ? renderPanelCheck(d.id, !!this._selectedOptionId) : ''}
          ${renderPanelVerdict(result)}
          ${renderPanelHints(hintTexts(d), this._hintLevel, this._revealed, () => { this._hintLevel++; })}
        </section>
        <div class="qp-explain">${result ? html`
          <question-explanation
            .explanation=${d.explanation}
            .explanationSlide=${d.explanationSlide}
            .bundleId=${this._ctx?.bundleId}
            ?revealed=${this._revealed}
          ></question-explanation>
          ${this._renderCompanionSimulation('explanation')}
        ` : ''}</div>
      </div>
    `;
  }

  /** The options list (shared by the stacked and plain layouts). */
  _renderOptions() {
    return html`
      <ul class="options-list" role="radiogroup" aria-labelledby="stem">
        ${this._options.map((opt, i) => {
          const isSelected = this._selectedOptionId === opt.id;
          const disabled = this._revealed;
          const isActualCorrect = opt.id === this._data.correctOptionId;
          const isCorrectMark = this._revealed && isActualCorrect;
          const isIncorrectMark = this._revealed && isSelected && !isActualCorrect;
          const isDim = this._revealed && !isSelected && !isActualCorrect;
          
          return html`
            <li 
              class="option ${isSelected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${isCorrectMark ? 'correct-mark pop-anim' : ''} ${isIncorrectMark ? 'incorrect-mark shake-anim' : ''} ${isDim ? 'dim' : ''}" 
              @click="${() => !disabled && this._handleSelect(opt.id)}"
            >
              <input 
                type="radio" 
                class="opt-radio"
                id="${opt.id}"
                name="mcq-${this._data.id}"
                .checked="${isSelected}"
                ?disabled="${disabled}"
                @change="${() => this._handleSelect(opt.id)}"
                aria-label="${opt.text?.en || opt.text}"
              />
              <span class="opt-key" aria-hidden="true">${optionKeyLetter(i)}</span>
              <div class="option-text">
                <markdown-renderer ?inline=${this._usesPlainPanel()} .content="${opt.text?.en || opt.text}"></markdown-renderer>
                ${isCorrectMark ? html`<span class="verdict-tag good">Correct answer</span>` : ''}
                ${isIncorrectMark ? html`<span class="verdict-tag bad">${brandCopy('wrongTag', 'Incorrect')}</span>` : ''}
              </div>
            </li>
          `;
        })}
      </ul>
    `;
  }

  _renderContent() {
    if (this._usesPlainPanel()) return this._renderPlainPanel();
    return html`
      ${this._renderStem()}
      ${this._renderOptions()}
      ${this._revealed && this._result ? html`
        <feedback-banner
          .type="${this._result.isCorrect ? 'correct' : 'incorrect'}"
          .message="${this._result.feedback || ''}"
        ></feedback-banner>
        <question-explanation
          .explanation=${this._data.explanation}
          .explanationSlide=${this._data.explanationSlide}
          .bundleId=${this._ctx?.bundleId}
          ?revealed=${this._revealed}
        ></question-explanation>
        ${this._renderCompanionSimulation('explanation')}
      ` : ''}
    `;
  }
}

customElements.define('mcq-single-v2', MCQSingle);
