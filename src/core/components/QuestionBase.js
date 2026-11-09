import { LitElement, html, css } from 'lit';
import { EventBus } from '../EventBus.js';
import './FeedbackBanner.js';
import { brandIcon } from '../../ui/components/LookSlots.js';
import '../../ui/components/MarkdownRenderer.js';
import './QuestionExplanation.js';
import { blockImageLayoutStyles, renderBlockImage, blockLayoutClass } from './blockImageLayout.js';
import { mountQuestionSimulation, destroyQuestionSimulation, renderSimControls, renderSimCard } from './simulationHost.js';
import { mountQuestionGraph, renderGraphCard } from './graphHost.js';
import { mountQuestionDiagram, renderDiagramCard } from './diagramHost.js';
import { LookMixin } from '../mixins/LookMixin.js';
import { plainAnswerPanelStyles, renderPanelVerdict, renderPanelHints, renderPanelCheck, hintTexts } from './answerPanel.js';

/**
 * QuestionBase — Abstract Lit base class for text-entry and numeric question plugins.
 *
 * Subclasses MUST override:
 *   - static score(itemData, response) → { isCorrect, score, feedback }
 *   - renderInput()  → Lit TemplateResult   (the actual input element)
 *
 * Subclasses may override:
 *   - _extraStyles() → css tagged-template   (append plugin-specific CSS)
 *
 * Lifecycle provided automatically:
 *   init(data), getState(), setState(), getResponse(), evaluate(),
 *   _onInput(e), connectedCallback, disconnectedCallback
 */
export class QuestionBase extends LookMixin(LitElement) {
  static LOOK_RENDERERS = true;
  static properties = {
    _data:       { type: Object,  state: true },
    _value:      { type: String,  state: true },
    _isRevealed: { type: Boolean, state: true },
    _result:     { type: Object,  state: true },
    _hintLevel:  { type: Number,  state: true },
    // Set by LessonSession under the plain look on a class with
    // PLAIN_PANEL (see answerPanel.js): render the prompt + answer panel
    // spread with its own Check button.
    panelCheck:  { type: Boolean, attribute: false },
  };

  /** A subclass whose input fits the plain answer panel opts in. */
  static PLAIN_PANEL = false;

  static styles = [blockImageLayoutStyles, css`
    :host {
      display: block;
      font-family: var(--font-family, 'Nunito', system-ui, sans-serif);
    }
    /* The hint button's inline style names no face, so it fell to the UA's
       button font (Arial); plain keeps every small text in the look's sans. */
    :host([data-look="plain"]) .hints-section button { font-family: inherit; }
    .stem {
      font-size: var(--fs-stem);
      font-weight: var(--fw-stem);
      margin-bottom: 16px;
      line-height: var(--lh-stem);
      color: var(--text-main);
    }
    .input-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
      flex-wrap: wrap;
    }
    .unit {
      font-size: 1rem;
      font-weight: var(--fw-strong);
      color: var(--text-muted);
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
      border-radius: 12px;
      overflow: hidden;
      background: var(--sim-bg-deep, #0a0f1e);
      line-height: 0;
    }
    .q-sim-host-container canvas {
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
      color: var(--on-primary, #fff);
      background: var(--primary-color, #3b82f6);
      border: none;
      border-radius: 999px;
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
      border-radius: 16px;
      border: 2px solid var(--border-color);
      box-shadow: var(--lip-tile) var(--border-color);
    }
    /* Side-by-side sizing for a role:"setup" companion sim — reuses
     * .cb-layout-right/.cb-layout-left from blockImageLayoutStyles (already
     * imported above) the exact same way an image does, via render()
     * below. Without this, the sim card and the question's own input field
     * stack vertically and a tall card (even capped at 820px wide, ~550px
     * tall including its heading/controls) pushes the input off the first
     * screen — "have to scroll down unnecessarily to find where to type
     * the answer," a real report against the stacked-only layout this
     * replaces for the setup case. Explanation-role sims stay stacked
     * (rendered from _renderContent(), not render()) since by the time one
     * shows, the student has already answered — no field to lose. */
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
      border-radius: 16px;
      border: 2px solid var(--border-color);
      box-shadow: var(--lip-tile) var(--border-color);
    }
    .q-graph-host-container {
      width: 100%;
      max-width: 640px;
      margin: 0 auto;
      aspect-ratio: 4 / 3;
    }
    /* renderGraphCard()'s own host div (holding the <svg> GraphPlotter
     * mounts into) sits one level inside this aspect-ratio'd container —
     * without an explicit height here, a plain <div> doesn't inherit the
     * ancestor's aspect-ratio-computed height, so the svg's own height:100%
     * below resolves against nothing and falls back to SVG's 150px
     * intrinsic default regardless of width, rendering a squashed, far-too-
     * narrow-looking plot. This one rule is what makes the height actually
     * reach the svg. */
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
    /* Companion geometry figure (data.diagram) — same shape/rules as
     * .q-graph-card above (see that comment for why the "> div" rule is
     * load-bearing), sibling class names under .q-diagram-*. */
    .q-diagram-card {
      margin-top: 1.25rem;
      padding: 16px 18px;
      background: var(--bg-surface);
      border-radius: 16px;
      border: 2px solid var(--border-color);
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
  `, plainAnswerPanelStyles];

  constructor() {
    super();
    this._data       = null;
    this._value      = '';
    this._isRevealed = false;
    this._result     = null;
    this._hintLevel  = 0;
    this._ctx        = null;

    // Companion simulation (optional `data.simulation.src`) — mounted
    // only once the question is revealed, see updated() below. Plain
    // instance fields, not Lit `properties`: the scene itself is a live
    // canvas-driving object, not serializable render state.
    this._simScene = null;
    this._simSceneClass = null;
    this._simMounting = false;
    this._simFailed = false;
    this._simErrorMessage = '';

    // Companion graph (optional `data.graph`) — mounted once, immediately
    // (never reveal-gated, unlike `simulation`'s default role — see
    // graphHost.js's header comment for why).
    this._graphMounted = false;

    // Whether the role:"explanation" companion sim card has scrolled into
    // view yet — drives the fixed "jump to it" badge below. See
    // _maybeObserveSimCard().
    this._simCardVisible = false;
    this._simCardObserver = null;
  }

  /** Required plugin lifecycle — called by mountPlugin.js. `ctx` (e.g.
   *  `{ bundleId }`, mirrors LessonEngine's block ctx) is optional — only
   *  TestEngine threads it today, and only plugins that need to resolve
   *  their own embedded refs (diagram-label, diagram-hotspot) read it. */
  init(data, prng, ctx) {
    this._data = data;
    this._hintLevel = 0;
    // LessonEngine mounts plugins with a single trailing `ctx` arg (no
    // prng), while TestEngine always passes both — so `prng` here may
    // actually be the ctx object. Same detection mcq-single@2 already uses.
    const isPrng = prng && typeof prng.shuffle === 'function';
    this._ctx = isPrng ? (ctx || null) : (prng || null);
  }

  getState()  { return { value: this._value }; }
  setState(s) { if (s?.value !== undefined) this._value = s.value; }
  getResponse() { return this._value; }

  /** Optional plugin-contract method (feature-detected by LessonEngine's
   *  hasUnansweredQuestion()) — whether the student has already checked/
   *  submitted this question, so Next skipping past it can warn first
   *  instead of silently moving on. `_isRevealed` is the right signal for
   *  every QuestionBase subclass that doesn't track its own separate submit
   *  flag — one that does (e.g. structured-descriptive@1) overrides this. */
  isAnswered() { return this._isRevealed; }

  /** Called by TestEngine to score the question */
  evaluate() {
    if (!this._data) return { score: 0, isCorrect: false };
    this._isRevealed = true;
    // Delegate to the subclass static method
    this._result = this.constructor.score(this._data, this.getResponse());
    this.requestUpdate();
    return this._result;
  }

  /** Static scoring — MUST be overridden by subclass */
  static score(_itemData, _response) {
    throw new Error('QuestionBase.score() must be overridden by the subclass.');
  }

  /** Mounts the optional companion simulation (`data.simulation.src`)
   *  once its role's gate is satisfied and the sim-host `<div>` this class's
   *  own `_renderContent()` renders actually exists in the DOM. `role:
   *  "setup"` (visualizes what the question describes) mounts immediately;
   *  `role: "explanation"` (default — visualizes the answer) waits for
   *  `_isRevealed`, same as before `role` existed. Deliberately not
   *  beat-synced — see simulationHost.js's header comment. Also mounts the
   *  companion graph (see _maybeMountGraph()) — a subclass that overrides
   *  `updated()` (e.g. plot-function@1) must call `super.updated()` for
   *  either companion visual to mount. */
  updated(changedProperties) {
    super.updated?.(changedProperties);
    if (this._ctx?.previewOnly) return;
    this._maybeMountGraph();
    this._maybeMountDiagram();
    const sim = this._data?.simulation;
    if (!sim?.src) return;
    const isSetup = sim.role === 'setup';
    if (!isSetup) this._maybeObserveSimCard();
    if (!isSetup && !this._isRevealed) return;
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

  /** Mounts the optional companion graph (`data.graph`) once its host
   *  `<div>` exists — called from the same `updated()` above. Runs
   *  independently of the simulation-mounting branch (a question authors
   *  one companion visual or the other, never both, but nothing here
   *  actually assumes that). */
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
   *  its host `<div>` exists — same pattern as _maybeMountGraph() above. */
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

  /** Watches the role:"explanation" `.q-sim-card` (once it exists — after
   *  reveal) so the fixed "jump to it" badge (render(), near the bottom of
   *  this file) can hide itself the moment the student actually scrolls
   *  the simulation into view, rather than staying pinned over content
   *  they've already found. Placing the affordance early in the document
   *  (right after the verdict) turned out not to be enough on a short
   *  mobile viewport — a long feedback message alone can push even that
   *  below the fold, so a scroll-position-independent, always-on-screen
   *  badge is the only thing that actually guarantees visibility. */
  _maybeObserveSimCard() {
    if (this._simCardObserver || this._simCardVisible || !this._isRevealed) return;
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

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this._simCardObserver?.disconnect();
    this._simCardObserver = null;
    destroyQuestionSimulation(this._simScene);
    this._simScene = null;
    this._graphCleanup?.();
    this._graphCleanup = null;
    this._diagramCleanup?.();
    this._diagramCleanup = null;
  }

  /** Renders the companion simulation card for the given slot, or nothing
   *  if this question has no `data.simulation` or its role doesn't match
   *  this slot. `'setup'` is called from `render()` (side-by-side with the
   *  rest of the content, via `.q-sim-card` — see the CSS above for why);
   *  `'explanation'` is called from `_renderContent()`, after the
   *  explanation box, gated on `_isRevealed`. Exactly one of the two ever
   *  actually renders, since a question's `simulation.role` is a single
   *  value, never both. The reveal gate on `'explanation'` is what keeps it
   *  from ever acting as an accidental spoiler. */
  _renderCompanionSimulation(slot) {
    const sim = this._data?.simulation;
    if (!sim?.src) return html``;
    const role = sim.role === 'setup' ? 'setup' : 'explanation';
    if (role !== slot) return html``;
    if (role === 'explanation' && !this._isRevealed) return html``;
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

  _onInput(e) {
    if (this._isRevealed) return;
    this._value = e.target.value;
    EventBus.emit('question:interaction', { id: this._data?.id });
  }

  /** Subclass overrides this to return the appropriate input element */
  renderInput() {
    throw new Error('QuestionBase.renderInput() must be overridden by the subclass.');
  }

  /** Set to `true` by a subclass whose `renderInput()` already consumes
   *  `data.image` itself (e.g. `diagram-label@1` overlays dropdowns on it,
   *  `diagram-hotspot@1` overlays pins) — otherwise this generic wrapper
   *  renders a second, plain, non-interactive copy of the same image
   *  alongside the interactive one. Every other `QuestionBase` subclass
   *  (numeric-value, mcq, fill-blank, …) has no image of its own, which is
   *  what this generic path exists for. */
  static rendersOwnMedia = false;

  render() {
    if (!this._data) return html``;
    if (this._ctx?.previewOnly) return this._renderPreviewOnly();
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
    // `graph` is never reveal-gated (see graphHost.js) — a "read this graph,
    // then answer" question needs it visible from the start, so it gets the
    // same immediate side-by-side treatment as a setup sim.
    if (graph) {
      return html`
        <div class="${blockLayoutClass(null, graph)}">
          <div class="cb-text">${content}</div>
          ${renderGraphCard({ hostId: 'q-graph-host' })}
        </div>
        ${simFab}
      `;
    }
    // `diagram` (a static geometry figure) is likewise never reveal-gated —
    // same reasoning as `graph`, checked right after it since a question
    // authors at most one companion visual in practice.
    if (diagram) {
      return html`
        <div class="${blockLayoutClass(null, diagram)}">
          <div class="cb-text">${content}</div>
          ${renderDiagramCard({ hostId: 'q-diagram-host' })}
        </div>
        ${simFab}
      `;
    }
    if (!image?.src || this.constructor.rendersOwnMedia) return html`${content}${simFab}`;
    return html`
      <div class="${blockLayoutClass(image, null)}">
        <div class="cb-text">${content}</div>
        ${renderBlockImage(image, { bundleId: this._ctx?.bundleId })}
      </div>
      ${simFab}
    `;
  }

  /** A fixed, always-on-screen badge pointing at the role:"explanation"
   *  sim card — see the .q-sim-fab CSS comment for why this has to be
   *  viewport-fixed rather than just "early in the document." Hides once
   *  _maybeObserveSimCard()'s IntersectionObserver reports the card is
   *  actually visible. */
  _renderSimFab() {
    const sim = this._data?.simulation;
    if (!sim?.src || sim.role === 'setup' || !this._isRevealed || this._simCardVisible) return '';
    return html`
      <button type="button" class="q-sim-fab" @click=${() => this._scrollToSimCard()}>
        <span style="font-size: 1.1rem;">${brandIcon('scene')}</span> See it happen <span aria-hidden="true">↓</span>
      </button>
    `;
  }

  /** `ctx.previewOnly` (set by mountOrphanPreview() callers like
   *  PracticeTestCreate's bank-question "Preview question" toggle) means:
   *  show what the question asks, nothing a student would interact with —
   *  no input control, hints, companion sim/graph, or reveal/explanation
   *  state, and no plugin does grading-only heavy work (model/vendor loads,
   *  manifest fetches) to get there. Subclasses whose question content
   *  isn't the plain `data.stem`/`data.prompt` string (fill-blank's
   *  `template`, match-categorize's categories/chips, sequence-order's
   *  items, statement-judgment's statements, diagram-label's image-only
   *  content) override this instead of relying on the default. */
  _renderPreviewOnly() {
    const stemText = this._previewStemText();
    return html`
      <div class="stem">
        ${stemText ? html`<markdown-renderer .content=${stemText}></markdown-renderer>` : ''}
      </div>
    `;
  }

  _previewStemText() {
    const stem = this._data.stem ?? this._data.prompt;
    return typeof stem === 'string' ? stem : (stem?.en || '');
  }

  /** plain + a shell that asked for the panel: the editorial spread. */
  _usesPlainPanel() {
    return this.look === 'plain' && this.panelCheck && this.constructor.PLAIN_PANEL && !this._ctx?.previewOnly;
  }

  _renderPlainPanel() {
    const result = this._isRevealed && this._result ? this._result : null;
    const stemText = typeof this._data.stem === 'string' ? this._data.stem : (this._data.stem?.en || '');
    const d = this._data;
    const stack = !!(d.image?.src || d.graph || d.diagram || (d.simulation?.src && d.simulation.role === 'setup'));
    return html`
      <div class="qp-layout ${stack ? 'qp-stack' : ''}">
        <div class="qp-prompt">
          <p class="qp-kicker">Question</p>
          <div class="stem">
            ${stemText ? html`<markdown-renderer .content=${stemText}></markdown-renderer>` : ''}
          </div>
        </div>
        <section class="qp-panel" aria-label="Your answer">
          <p class="qp-panel-head">Your answer</p>
          <div class="input-row">
            ${this.renderInput()}
            ${d.unit ? html`<span class="unit">${d.unit}</span>` : ''}
          </div>
          ${!this._isRevealed ? renderPanelCheck(d.id, String(this._value ?? '').trim() !== '') : ''}
          ${renderPanelVerdict(result)}
          ${renderPanelHints(hintTexts(d), this._hintLevel, this._isRevealed, () => { this._hintLevel++; })}
        </section>
        <div class="qp-explain">${result ? html`
          <question-explanation
            .explanation=${d.explanation}
            .explanationSlide=${d.explanationSlide}
            .bundleId=${this._ctx?.bundleId}
            ?revealed=${this._isRevealed}
          ></question-explanation>
          ${this._renderCompanionSimulation('explanation')}
        ` : ''}</div>
      </div>
    `;
  }

  _renderContent() {
    if (this._usesPlainPanel()) return this._renderPlainPanel();
    const result = this._isRevealed && this._result ? this._result : null;
    const stemText = typeof this._data.stem === 'string' ? this._data.stem : (this._data.stem?.en || '');

    const rawHints = Array.isArray(this._data.hints) ? this._data.hints : [];
    const hints = rawHints.map(h => typeof h === 'object' && h !== null ? (h.en || '') : (h || '')).filter(Boolean);
    const showHints = hints.length > 0 && !this._data.hideHints;
    const hintMark = brandIcon('hint');

    return html`
      <div class="stem">
        ${stemText ? html`<markdown-renderer .content=${stemText}></markdown-renderer>` : ''}
      </div>
      <div class="input-row">
        ${this.renderInput()}
        ${this._data.unit ? html`<span class="unit">${this._data.unit}</span>` : ''}
      </div>

      ${showHints ? html`
        <div class="hints-section" style="margin-top: 14px; margin-bottom: 12px;">
          ${this._hintLevel < hints.length ? html`
            <button
              type="button"
              style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 12px; font-size: 0.85rem; color: var(--hint-ink); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-weight: var(--fw-strong); box-shadow: 0 1px 2px var(--hint-shadow);"
              @click=${() => { this._hintLevel++; }}
            >
              <span>${hintMark} Need a hint? (${this._hintLevel}/${hints.length})</span>
            </button>
          ` : ''}

          ${hints.slice(0, this._hintLevel).map((hintText, idx) => html`
            <div style="margin-top: 8px; padding: 10px 14px; background: var(--bg-surface); border: 1px solid var(--border-color); border-left: 4px solid var(--hint-rule); border-radius: 6px; font-size: 0.95rem; line-height: 1.5;">
              <strong style="color: var(--hint-accent); font-size: 0.85rem; display: block; margin-bottom: 4px;">${hintMark} Hint ${idx + 1}</strong>
              <markdown-renderer .content=${hintText}></markdown-renderer>
            </div>
          `)}
        </div>
      ` : ''}

      ${result ? html`
        <div style="overflow-x: hidden; padding-bottom: 4px;">
          <feedback-banner
            .type=${result.isCorrect ? 'correct' : (result.score > 0 ? 'partial' : 'incorrect')}
            .message=${result.feedback || ''}
          ></feedback-banner>
        </div>
        <question-explanation
          .explanation=${this._data.explanation}
          .explanationSlide=${this._data.explanationSlide}
          .bundleId=${this._ctx?.bundleId}
          ?revealed=${this._isRevealed}
        ></question-explanation>
        ${this._renderCompanionSimulation('explanation')}
      ` : ''}
    `;
  }
}
