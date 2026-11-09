import { LitElement, html, css } from 'lit';
import {
  classify, scoreFullAnswer, detectAnswerMode, normalizeLatexSubscripts,
  extractMathSpans, computeChainConsistency,
} from 'core/evaluators/semanticSimilarityEvaluator.js';
import { sdTokens, sdButtons, sdKeyframes } from './styles.js';
import '../../../../ui/components/GuideHelp.js';
import { loadEmbedder } from './modelLoader.js';
import { makeStepConsistencyChecker } from './mathConsistency.js';
import { EventBus } from 'core/EventBus.js';
import { ErrorReporter } from 'core/ErrorReporter.js';
import { A11yAnnouncer } from 'core/A11yAnnouncer.js';
import { ProgressStore } from 'core/ProgressStore.js';
import { AuthService } from 'core/AuthService.js';
import './components/rubric-checklist.js';
import './components/chained-blank-builder.js';
import './components/symbol-toolbar.js';
import './components/equation-composer.js';
import 'core/components/QuestionExplanation.js';
import '../../../../ui/components/SafeMathText.js';
import '../../../../ui/components/MarkdownRenderer.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';
import { brandIcon } from '../../../../ui/components/LookSlots.js';
import { blockImageLayoutStyles, blockLayoutClass } from 'core/components/blockImageLayout.js';
import { mountQuestionDiagram, renderDiagramCard } from 'core/components/diagramHost.js';

const DEFAULT_THRESHOLDS = { high: 0.60, low: 0.40, blank: 0.78 };

function resolveText(field) {
  if (field == null) return '';
  return typeof field === 'string' ? field : (field.en || '');
}

/**
 * <semantic-descriptive-v1> — plugin entry for semantic-descriptive@1.
 *
 * Ported from coaching-poc-v5.html. The model/library/UI split mirrors the
 * handoff brief: this file owns the lifecycle contract, model loading, and
 * step-1 (full-answer) evaluation; components/ hold the tiered-coaching UI;
 * /src/core/evaluators/semanticSimilarityEvaluator.js holds the pure scoring
 * math. All state is scoped Lit reactive properties per instance — no
 * `state.perQuestion[id]` global object like the POC.
 */
export class SemanticDescriptive extends LitElement {
  static schema = {
    $id: 'semantic-descriptive@1',
    type: 'object',
    required: ['id', 'type', 'prompt', 'rubric'],
    properties: {
      prompt: { type: 'object', minProperties: 1 },
      diagnosticFor: { type: 'array', items: { type: 'string' } },
      poolable: { type: 'boolean' },
      /** Optional companion geometry figure (see GeometryDiagram.js) — for a
       *  proof/derivation whose stem needs a labeled figure (an angle-chase,
       *  a triangle with given values, a ray diagram). Mutually exclusive
       *  with image/simulation/graph in practice (QuestionBase renders at
       *  most one companion visual); never reveal-gated, same as `graph`.
       *  NOTE: SemanticDescriptive extends LitElement directly, not
       *  QuestionBase — this field is mounted/rendered by this file's own
       *  _maybeMountDiagram()/render(), not by QuestionBase's generic path
       *  (which other question types like mcq-single@2/numeric-value@1 use
       *  instead). */
      diagram: { type: 'object' }, // { points, segments?, angles?, rightAngles?, parallelMarks?, circles?, viewBox?, a11yCaption?, position? }
      /** Optional AI-authoring hint: does this question's model answer
       *  involve equations/derivations/chemical formulas ('math'), or is it
       *  pure prose ('text', the default)? Drives whether the math symbol
       *  toolbar/equation composer default to visible, and whether the
       *  backend's symbolic-equivalence tier (rubric[].expectedMath) is
       *  attempted at all. When omitted, detectAnswerMode() in
       *  semanticSimilarityEvaluator.js infers a default from the rubric's
       *  own text — see docs/content-authoring-guide.md's "Semantic-
       *  descriptive answer mode" section for the authoring guidance this
       *  is meant to encode. Either way the student can always override the
       *  default via the in-test toggle. */
      answerMode: { type: 'string', enum: ['math', 'text'] },
      rubric: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['id', 'label', 'level1', 'clue', 'level2Template', 'accepted'],
          properties: {
            id: { type: 'string' },
            label: { type: 'object' },
            level1: { type: 'object' },
            clue: { type: 'object' },
            level2Template: { type: 'object' },
            accepted: { type: 'array', items: { type: 'string' }, minItems: 1 },
            /** Optional LaTeX target for this rubric point (e.g.
             *  "(v_1+v_2)^2 > 4v_1v_2"). If the student's answer contains a
             *  `$...$` span that ComputeEngine considers algebraically
             *  equivalent, this rubric point is scored as fully addressed
             *  regardless of wording — see scoreFullAnswer's symbolic tier. */
            expectedMath: { type: 'string' },
          },
        },
      },
      level3: {
        type: 'array',
        items: {
          type: 'object',
          required: ['eyebrow', 'text'],
          properties: {
            eyebrow: { type: 'object' },
            text: { type: 'object' },
            rubricId: { type: ['string', 'null'] },
          },
        },
      },
      thresholds: {
        type: 'object',
        properties: { high: { type: 'number' }, low: { type: 'number' }, blank: { type: 'number' } },
      },
      /** 'full-answer' (default): free-text answer graded against the rubric —
       *  the review/test-session shape. 'coach': skip straight to the guided
       *  fill-the-blanks build (needs `level3`) — the in-lesson formative
       *  shape, for a student who isn't expected to compose a full board-exam
       *  answer unprompted yet. */
      mode: { type: 'string', enum: ['full-answer', 'coach'] },
    },
  };

  static properties = {
    _data: { state: true },
    _modelState: { state: true },
    _modelProgress: { state: true },
    _modelError: { state: true },
    _fullAnswer: { state: true },
    _evaluated: { state: true },
    _grading: { state: true },
    _answerSims: { state: true },
    _matchedSentence: { state: true },
    _numericMismatch: { state: true },
    _tier3Complete: { state: true },
    _mathToolsOn: { state: true },
    _chainWarnings: { state: true },
  };

  static styles = [btn3dStyles, feedbackAnimStyles, blockImageLayoutStyles,
    sdTokens,
    sdButtons,
    sdKeyframes,
    css`
      /* Companion geometry figure (data.diagram) — same card/host-container
       * shape as QuestionBase.js's .q-graph-card/.q-diagram-card rules (see
       * that file's comment for why the "> div" rule is load-bearing); this
       * class doesn't extend QuestionBase, so it needs its own copy. The
       * .cb-layout-right/.cb-layout-left/.cb-text rules that place it
       * beside the prompt come from blockImageLayoutStyles above. */
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
      .sd-model-status {
        margin-bottom: 16px; padding: 10px 20px; border-radius: var(--radius-md); font-weight: var(--fw-heavy); font-size: 12.5px;
        display: inline-flex; align-items: center; gap: 10px; background: var(--sd-indigo-soft); color: var(--sd-indigo-dark);
        border: 2px solid var(--sd-border);
      }
      .sd-model-status.ready { background: var(--sd-emerald-soft); color: var(--sd-emerald); border-color: var(--success-text); }
      .sd-model-status.error { background: var(--sd-red-soft); color: var(--sd-red-dark); border-color: var(--error-text); }
      .sd-status-icon.pulse { animation: sd-pulse 1s ease-in-out infinite; }
      .sd-prompt { font-size: 20px; font-weight: var(--fw-black); margin: 0 0 16px; line-height: 1.35; }
      textarea.sd-answer-box {
        width: 100%; min-height: 130px; border: 3px solid var(--sd-border); border-radius: var(--radius-lg); padding: 14px 16px;
        font-family: var(--sd-font); font-size: 15px; font-weight: var(--fw-medium); color: var(--sd-ink); background: var(--sd-card);
        resize: vertical; box-sizing: border-box;
      }
      textarea.sd-answer-box:focus { outline: none; border-color: var(--sd-indigo); }
      .sd-row { display: flex; align-items: center; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
      .sd-results { margin-top: 22px; }
      .sd-coach-missing {
        margin-top: 16px; padding: 14px 18px; border-radius: var(--radius-md); font-weight: var(--fw-strong); font-size: 13.5px;
        background: var(--sd-red-soft); color: var(--sd-red-dark); border: 2px solid var(--sd-border);
      }
      .sd-math-tools-row { margin-bottom: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
      .sd-math-toggle {
        font-family: var(--sd-font); font-weight: var(--fw-heavy); font-size: 12px; padding: 5px 12px;
        border: 2px solid var(--sd-border); border-radius: var(--radius-sm); background: var(--sd-card); color: var(--sd-ink-soft);
        cursor: pointer;
      }
      .sd-math-toggle[aria-pressed="true"] { background: var(--sd-indigo-soft); color: var(--sd-indigo-dark); border-color: var(--sd-indigo); }
      /* Mobile-portrait default: stacked, textarea above a capped-height
         preview. The min-width breakpoint below (700px — between the design
         system's phone-portrait ~375px and phone-landscape ~740px reference
         viewports, docs/ui-ux-design-system.md §3) switches to side-by-side
         for desktop AND mobile-landscape, never mobile-portrait. flex-grow:1
         on the textarea means it still claims the full row width on its own
         whenever the preview is hidden (empty answer, or an answer with no
         $...$ math span to render — see the preview's own render()
         condition; a plain-prose answer, e.g. a geometry proof, has
         nothing a plain-text duplicate would add, so no separate "solo"
         CSS is needed for that case either).
         The row itself gets a fixed 'height' (not just a max-height cap) —
         deliberately, on both counts. Capped-not-fixed was tried first and
         had two problems: without any cap at all, align-items:stretch
         matches the textarea's height to the preview's *natural,
         unbounded* content height for a long answer, so neither panel ever
         needs to scroll internally and the whole component just grows with
         the page instead, defeating the point of a synced-scroll split
         view — a cap fixes that. But a lone textarea (preview hidden, the
         common case now that the preview only shows for math content) has
         nothing to stretch against under a mere cap, so it collapses to
         its own tiny intrinsic height instead — a 'height' gives it a
         floor to stretch to either way, with or without a preview sibling.
         min-height:0 overrides the flex default of auto (== content size)
         on both children, which would otherwise force the row taller than
         its own height to fit content instead of letting the panels scroll
         within it. Resize is switched off here since a manually-resized
         textarea can no longer stay in lockstep with a height the row
         itself is now controlling; the stacked mobile layout below keeps
         native resize, unaffected by any of this.
         NEVER put a backtick inside this comment (or any css-tagged
         template's comment) — see feedback-no-backticks-in-lit-template-
         comments: it silently closes the template literal early and
         everything after becomes raw JS, breaking only in-browser,
         invisibly to a plain node --check. */
      .sd-answer-layout { display: flex; flex-direction: column; gap: 10px; }
      @media (min-width: 700px) {
        .sd-answer-layout { flex-direction: row; align-items: stretch; height: min(60vh, 520px); }
        .sd-answer-layout textarea.sd-answer-box { flex: 1 1 50%; min-width: 0; min-height: 0; resize: none; }
        .sd-answer-layout .sd-answer-preview { flex: 1 1 50%; min-width: 0; min-height: 0; margin-top: 0; max-height: none; }
      }
      .sd-answer-preview {
        margin-top: 0; padding: 12px 16px; border: 2px dashed var(--sd-border); border-radius: var(--radius-md);
        background: var(--sd-card); display: flex; flex-direction: column; max-height: 260px;
      }
      .sd-answer-preview-label {
        margin: 0 0 6px; font-size: 10.5px; font-weight: var(--fw-black); text-transform: uppercase; letter-spacing: 0.04em;
        color: var(--sd-ink-faint); flex-shrink: 0;
      }
      /* Scrolls in lockstep with the textarea (see _onAnswerScroll) — kept
         as its own inner element so the "Preview" label above stays put
         rather than scrolling away with the content. */
      .sd-answer-preview-scroll { overflow-y: auto; flex: 1 1 auto; min-height: 0; }
      .sd-chain-warning {
        margin-top: 16px; padding: 12px 16px; border-radius: var(--radius-md); font-weight: var(--fw-strong); font-size: 13px;
        background: var(--sd-amber-soft); color: var(--sd-ink); border: 2px solid var(--warn-text);
      }
      .sd-chain-warning code { font-weight: var(--fw-medium); }
    `,
  ];

  constructor() {
    super();
    this._data = null;
    this._modelState = 'idle';
    this._modelProgress = 0;
    this._modelError = null;
    this._fullAnswer = '';
    this._evaluated = false;
    this._grading = false;
    this._answerSims = {};
    this._matchedSentence = {};
    this._numericMismatch = {};
    this._tier3Complete = false;
    this._mathToolsOn = false;
    this._chainWarnings = [];
    this._embed = null;
    this._instanceId = `sd-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    this._perRubricAnalytics = {};
    this._attemptId = this._instanceId;
    this._attemptStartedAt = Date.now();
    this._diagramMounted = false;
  }

  /** Mounts the optional companion geometry figure (`data.diagram`, see
   *  GeometryDiagram.js) once its host `<div>` exists. This class extends
   *  LitElement directly (not QuestionBase — see `diagram`'s schema doc
   *  comment above), so it needs its own copy of the mount-once pattern
   *  QuestionBase.js's _maybeMountGraph()/_maybeMountDiagram() use. */
  updated(changedProperties) {
    super.updated?.(changedProperties);
    this._maybeMountDiagram();
  }

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

  /** Required plugin lifecycle — called by mountPlugin.js */
  init(data, prng, ctx) {
    const isPrng = prng && typeof prng.shuffle === 'function';
    this._ctx = isPrng ? (ctx || null) : (prng || null);
    this._data = {
      ...data,
      rubric: (data.rubric || []).map((r) => ({
        ...r,
        label: resolveText(r.label),
        level1: resolveText(r.level1),
        clue: resolveText(r.clue),
        level2Template: resolveText(r.level2Template),
      })),
      level3: (data.level3 || []).map((s) => ({ ...s, eyebrow: resolveText(s.eyebrow), text: resolveText(s.text) })),
      thresholds: { ...DEFAULT_THRESHOLDS, ...(data.thresholds || {}) },
      mode: data.mode === 'coach' ? 'coach' : 'full-answer',
    };
    this._data.answerMode = data.answerMode === 'math' || data.answerMode === 'text'
      ? data.answerMode
      : detectAnswerMode(this._data.rubric);
    // Default the math toolbar/equation composer to visible only for
    // math-flagged questions — the toggle in _renderFullAnswerMode() lets
    // the student override either direction (hide it for a false-positive
    // math flag, or turn it on for a text question that unexpectedly needs
    // a symbol).
    this._mathToolsOn = this._data.answerMode === 'math';
    // Bank-preview: no free-text answer to grade, so no need to wake the
    // embedding model — it's a multi-hundred-KB ONNX download otherwise
    // triggered just from browsing the question bank.
    if (this._ctx?.previewOnly) return;
    this._modelReadyPromise = this._loadModel();
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._diagramCleanup?.();
    this._diagramCleanup = null;
  }

  async _loadModel() {
    this._modelState = 'loading';
    try {
      this._embed = await loadEmbedder((pct) => { this._modelProgress = pct; });
      this._modelState = 'ready';
    } catch (err) {
      this._modelState = 'error';
      this._modelError = err.message;
      // ErrorReporter already invoked inside loadEmbedder; nothing further to report here.
    }
  }

  _onAnswerInput(e) {
    this._fullAnswer = e.target.value;
    EventBus.emit('interaction:question', { questionId: this._data?.id, state: this.getState() });
  }

  /** Keeps the side-by-side preview's scroll position proportional to the
   *  textarea's as the student scrolls (or types past the visible area,
   *  which the browser scrolls natively — that already fires 'scroll' too).
   *  Proportional rather than pixel-matched since the rendered math is
   *  rarely the same height as its raw LaTeX source. A no-op in the stacked
   *  mobile-portrait layout too (harmless: the preview's own scroll there is
   *  independent, and this only ever nudges an element that still exists). */
  _onAnswerScroll(e) {
    const scrollArea = this.shadowRoot.querySelector('.sd-answer-preview-scroll');
    if (!scrollArea) return;
    const ta = e.target;
    const taMax = ta.scrollHeight - ta.clientHeight;
    const paMax = scrollArea.scrollHeight - scrollArea.clientHeight;
    if (taMax <= 0 || paMax <= 0) return;
    scrollArea.scrollTop = (ta.scrollTop / taMax) * paMax;
  }

  /** Splices a subscript/superscript char from <sd-symbol-toolbar> into the textarea at the cursor. */
  _onSymbolInsert(e) {
    this._spliceIntoAnswer(e.detail.char);
  }

  /** Splices a composed equation from <sd-equation-composer> into the
   *  textarea, wrapped in `$...$` — the delimiter the backend's
   *  extractMathSpans()/scoreFullAnswer() symbolic tier looks for. */
  _onEquationInsert(e) {
    const { latex } = e.detail;
    if (!latex) return;
    this._spliceIntoAnswer(`$${latex}$`);
  }

  _onToggleMathTools() {
    this._mathToolsOn = !this._mathToolsOn;
  }

  _spliceIntoAnswer(insert) {
    const textarea = this.shadowRoot.querySelector('textarea.sd-answer-box');
    const start = textarea?.selectionStart ?? this._fullAnswer.length;
    const end = textarea?.selectionEnd ?? this._fullAnswer.length;
    this._fullAnswer = this._fullAnswer.slice(0, start) + insert + this._fullAnswer.slice(end);
    EventBus.emit('interaction:question', { questionId: this._data?.id, state: this.getState() });
    this.updateComplete.then(() => {
      const ta = this.shadowRoot.querySelector('textarea.sd-answer-box');
      if (!ta) return;
      ta.focus();
      const pos = start + insert.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  /**
   * The actual embedding-based scoring — shared by the interactive "Grade My
   * Answer" button (lesson/coach use, live feedback while mounted) and
   * evaluate()'s automatic call (test/practice-test use, where `hideHints`
   * suppresses the button entirely so a live click can't leak rubric
   * feedback before the test is submitted — see evaluate()'s doc comment).
   * A no-op once already evaluated for this answer text, so a re-mount in
   * review (which restores `_fullAnswer` via setState then calls evaluate())
   * doesn't redundantly re-run the model.
   */
  async _runGrading() {
    const text = this._fullAnswer.trim();
    if (!text) {
      // Skipped question — no text to score, but still flip `_evaluated` so
      // review renders the rubric checklist (all rows "Missing") and the
      // model-answer reveal instead of showing nothing at all. score()
      // already treats an empty answerSims the same as never having graded,
      // so this doesn't change the resulting score, only whether review
      // displays the answer key for a question the student left blank.
      this._evaluated = true;
      this._persistAnalytics();
      return;
    }
    if (this._modelState !== 'ready') await this._modelReadyPromise;
    if (this._modelState !== 'ready') {
      // The shared model load failed (transient fetch/WASM-init hiccup —
      // loadEmbedder() resets its cached promise on failure specifically so
      // a fresh mount can retry, see modelLoader.js) — give this instance
      // one retry before giving up. This matters most for
      // TestEngine._computeResults()'s single headless scoring pass at
      // submit time: without a retry here, a transient failure would
      // permanently score this question as 0 rubric points addressed even
      // though the very next mount of this same answer (e.g. opening
      // Review, which re-evaluates live) succeeds and shows every point
      // nailed — a real vs. displayed score mismatch, not a grading verdict.
      this._modelState = 'idle';
      this._modelReadyPromise = this._loadModel();
      await this._modelReadyPromise;
    }
    if (this._modelState !== 'ready') {
      // Still unavailable after a retry. Deliberately do NOT flip
      // `_evaluated` here (unlike the blank-answer branch above) — this
      // question actually has an answer to grade, so caching "evaluated,
      // nothing addressed" would be indistinguishable from a real 0/N and
      // would permanently lock in that false zero (evaluate()'s
      // `!this._evaluated` guard would never retry again). Leaving it false
      // lets a later evaluate() call — e.g. TestSession's forced
      // re-evaluate on entering review — make a genuine second attempt.
      this._persistAnalytics();
      return;
    }
    // Only lazy-load ComputeEngine when there's actually a chance it's
    // needed — a math-flagged question whose rubric authored `expectedMath`
    // AND whose answer actually contains a `$...$` span. Everything else
    // (the large majority of questions, and every text-mode one) never pays
    // for this vendor at all.
    const needsMathCheck = this._data.answerMode === 'math'
      && text.includes('$')
      && this._data.rubric.some((r) => r.expectedMath);
    const mathCheckers = needsMathCheck ? await this._loadMathCheckers() : undefined;
    const results = await scoreFullAnswer(this._embed, text, this._data.rubric, {
      checkMathEquivalence: mathCheckers?.checkMathEquivalence,
      checkStepConsistency: mathCheckers?.checkStepConsistency,
      classifySpan: mathCheckers?.classifySpan,
    });
    const sims = {};
    const matched = {};
    const numericMismatch = {};
    for (const [rubricId, r] of Object.entries(results)) {
      sims[rubricId] = r.score;
      matched[rubricId] = r.displayText;
      numericMismatch[rubricId] = r.numericMismatch;
    }
    this._answerSims = sims;
    this._matchedSentence = matched;
    this._numericMismatch = numericMismatch;
    // Computed separately from scoreFullAnswer (which only uses this to gate
    // the symbolic tier internally, keeping its return shape unchanged for
    // existing callers) — purely for surfacing to the student/analytics.
    this._chainWarnings = [];
    if (mathCheckers?.checkStepConsistency) {
      const spans = extractMathSpans(text);
      const { warnings } = computeChainConsistency(spans, mathCheckers.checkStepConsistency, mathCheckers.classifySpan);
      this._chainWarnings = warnings.map((w) => ({
        status: w.status, prevSpan: spans[w.afterSpanIndex], currSpan: spans[w.spanIndex],
      }));
    }
    this._evaluated = true;
    const addressedCount = this._data.rubric.filter((r) => classify(sims[r.id], this._data.thresholds) === 'addressed').length;
    A11yAnnouncer.announce(`Graded. ${addressedCount} of ${this._data.rubric.length} rubric points nailed.`);
    this._persistAnalytics();
  }

  /** Lazily loads ComputeEngine (same vendor equation-input@1 already uses
   *  for LaTeX equivalence) and wraps it as the two DI callbacks
   *  scoreFullAnswer's symbolic tier expects — kept as closures so
   *  semanticSimilarityEvaluator.js itself never imports from /vendor/ (same
   *  dependency-injection shape as `embed`). Both share one ComputeEngine
   *  instance since they're only ever loaded/used together (see the
   *  `needsMathCheck` gate in _runGrading()).
   *
   *  `checkMathEquivalence` falls back to whitespace-stripped string
   *  equality if a LaTeX string fails to parse, same as
   *  EquationInputPlugin._compare().
   *
   *  `checkStepConsistency` is a heuristic over the handful of algebraic
   *  moves a CBSE stepwise derivation actually uses — see
   *  docs/descriptive-questions-and-cbse-marks.md for exactly what it can
   *  and can't recognize. It is deliberately NOT a general proof checker:
   *  verifying that one line is truly *derived* from another (rather than
   *  merely a rearrangement ComputeEngine's `simplify()` can reduce) is an
   *  open-ended symbolic-reasoning problem out of scope here. What it does
   *  catch is the concrete failure this was built for: a rubric checkpoint's
   *  target equation appearing correctly *somewhere* in the answer while an
   *  unrelated, un-rubric'd line just before it silently drops a term — each
   *  line can be individually true (as in an inequality chain) even though
   *  the step-to-step reasoning connecting them is broken, so no per-line
   *  truth check alone can ever catch it; only comparing consecutive lines
   *  to each other can. */
  async _loadMathCheckers() {
    try {
      const { ComputeEngine } = await import('vendor/compute-engine.js');
      const ce = new ComputeEngine();
      const checkMathEquivalence = (studentLatex, expectedLatex) => {
        try {
          const a = ce.parse(normalizeLatexSubscripts(studentLatex));
          const b = ce.parse(normalizeLatexSubscripts(expectedLatex));
          return a.isEqual(b);
        } catch (err) {
          const norm = (s) => s.replace(/\s+/g, '');
          return norm(studentLatex) === norm(expectedLatex);
        }
      };
      const { checkStepConsistency, classifySpan } = makeStepConsistencyChecker(ce);
      return { checkMathEquivalence, checkStepConsistency, classifySpan };
    } catch (err) {
      ErrorReporter.reportError(err, { source: 'semantic-descriptive@1', phase: 'load-compute-engine', questionId: this._data?.id });
      return undefined;
    }
  }

  /** Interactive "Grade My Answer"/"Grade Again" click handler — lesson/coach
   *  use only (see _renderFullAnswerMode(), which hides the button entirely
   *  under `hideHints`). Just adds the button's own "Grading…" busy state
   *  around the shared _runGrading(). */
  async _gradeAnswer() {
    if (!this._fullAnswer.trim() || this._modelState !== 'ready') return;
    this._grading = true;
    try {
      await this._runGrading();
    } catch (err) {
      ErrorReporter.reportError(err, { source: 'semantic-descriptive@1', phase: 'grade-answer', questionId: this._data?.id });
    } finally {
      this._grading = false;
    }
  }

  _touchRubricAnalytics(rubricId) {
    if (!this._perRubricAnalytics[rubricId]) {
      this._perRubricAnalytics[rubricId] = {
        rubricId,
        initialVerdict: 'missing',
        initialScore: -1,
        hintLevelsUsed: 0,
        tier2Attempted: false,
        tier2Passed: false,
        tier3AutoFilled: false,
        tier3GaveUp: false,
        timeToResolveMs: null,
      };
    }
    return this._perRubricAnalytics[rubricId];
  }

  _onHintShown(e) {
    const rec = this._touchRubricAnalytics(e.detail.rubricId);
    rec.hintLevelsUsed = Math.min(2, rec.hintLevelsUsed + 1);
    this._persistAnalytics();
  }

  _onBlankChecked(e) {
    const rec = this._touchRubricAnalytics(e.detail.rubricId);
    rec.tier2Attempted = true;
    rec.tier2Passed = e.detail.passed;
    this._persistAnalytics();
  }

  _onTier3Resolved(e) {
    const { rubricId, gaveUp, auto, hintLevelsUsed, timeToResolveMs } = e.detail;
    const rec = this._touchRubricAnalytics(rubricId);
    rec.tier3AutoFilled = auto;
    rec.tier3GaveUp = gaveUp;
    rec.hintLevelsUsed = Math.max(rec.hintLevelsUsed, hintLevelsUsed || 0);
    rec.timeToResolveMs = timeToResolveMs;
    EventBus.emit('semantic-descriptive:rubric-resolved', { instanceId: this._instanceId, questionId: this._data?.id, rubricId, gaveUp, auto });
    this._persistAnalytics();
  }

  _onTier3Complete() {
    this._tier3Complete = true;
    EventBus.emit('semantic-descriptive:tier3-complete', { instanceId: this._instanceId, questionId: this._data?.id });
    this._persistAnalytics({ tier3CompletedMs: Date.now() - this._attemptStartedAt });
  }

  async _persistAnalytics(rollupExtra = {}) {
    try {
      const user = await AuthService.getCurrentUser();
      for (const r of this._data.rubric) {
        const rec = this._perRubricAnalytics[r.id];
        if (rec) {
          rec.initialVerdict = classify(this._answerSims[r.id] ?? -1, this._data.thresholds);
          rec.initialScore = this._answerSims[r.id] ?? -1;
        }
      }
      const addressedOnFirstPass = this._data.rubric.filter((r) => classify(this._answerSims[r.id] ?? -1, this._data.thresholds) === 'addressed').length;
      await ProgressStore.put('semanticAttempts', {
        profileId: user.profileId,
        attemptId: this._attemptId,
        questionId: this._data.id,
        rubricResults: Object.values(this._perRubricAnalytics),
        addressedOnFirstPass,
        totalRubricPoints: this._data.rubric.length,
        updatedAt: Date.now(),
        ...rollupExtra,
      });
    } catch (err) {
      ErrorReporter.reportError(err, { source: 'semantic-descriptive@1', phase: 'persist-analytics', questionId: this._data?.id });
    }
  }

  // --- Question plugin contract -------------------------------------------

  /** This plugin doesn't extend QuestionBase, so there's no inherited
   *  default. In `full-answer` mode, `_evaluated` (flipped by its own "Grade
   *  My Answer" button, _gradeAnswer()) is the answered-state signal. In
   *  `coach` mode there's no full-answer grading step at all — `_tier3Complete`
   *  (set by _onTier3Complete when the guided build finishes) stands in. */
  isAnswered() { return this._data?.mode === 'coach' ? this._tier3Complete : this._evaluated; }

  getResponse() {
    return {
      mode: this._data?.mode || 'full-answer',
      fullAnswerText: this._fullAnswer,
      evaluated: this._evaluated,
      answerSims: { ...this._answerSims },
      matchedSentence: { ...this._matchedSentence },
      numericMismatch: { ...this._numericMismatch },
      rubricAnalytics: { ...this._perRubricAnalytics },
      tier3Complete: this._tier3Complete,
      mathToolsOn: this._mathToolsOn,
      chainWarnings: this._chainWarnings,
    };
  }

  getState() { return this.getResponse(); }

  setState(s) {
    if (!s) return;
    this._fullAnswer = s.fullAnswerText || '';
    this._evaluated = !!s.evaluated;
    this._answerSims = { ...(s.answerSims || {}) };
    this._matchedSentence = { ...(s.matchedSentence || {}) };
    this._numericMismatch = { ...(s.numericMismatch || {}) };
    this._perRubricAnalytics = { ...(s.rubricAnalytics || {}) };
    this._tier3Complete = !!s.tier3Complete;
    this._chainWarnings = Array.isArray(s.chainWarnings) ? s.chainWarnings : [];
    // The student's own toggle choice survives Next/Previous navigation —
    // only restore it if actually present (an older saved response won't
    // have it), otherwise keep whatever init()'s answerMode default set.
    if (typeof s.mathToolsOn === 'boolean') this._mathToolsOn = s.mathToolsOn;
  }

  /**
   * Pure, synchronous rollup — the expensive embedding work already happened
   * live (via _gradeAnswer while mounted, or per-blank in the guided build)
   * and travels inside `response`, so re-scoring here never needs the model
   * again.
   *
   * `full-answer` mode scores off `answerSims` (whole-answer similarity per
   * rubric point). `coach` mode never produces a full answer to score — a
   * rubric point instead counts as addressed if the guided build resolved it
   * without the student giving up (`rubricAnalytics[id].tier3GaveUp === false`;
   * `undefined` means never reached, also not addressed).
   */
  static score(itemData, response) {
    const rubric = itemData.rubric || [];
    const mode = itemData.mode === 'coach' ? 'coach' : 'full-answer';
    let addressed;
    if (mode === 'coach') {
      const analytics = response?.rubricAnalytics || {};
      addressed = rubric.filter((r) => analytics[r.id]?.tier3GaveUp === false).length;
    } else {
      const thresholds = { ...DEFAULT_THRESHOLDS, ...(itemData.thresholds || {}) };
      const sims = response?.answerSims || {};
      addressed = rubric.filter((r) => classify(sims[r.id] ?? -1, thresholds) === 'addressed').length;
    }
    const score = rubric.length > 0 ? addressed / rubric.length : 0;
    return {
      isCorrect: addressed === rubric.length,
      score,
      feedback: `${addressed} / ${rubric.length} rubric points addressed.`,
    };
  }

  /**
   * Async so a test/practice-test attempt — where `hideHints` hides the
   * interactive "Grade My Answer" button (see _renderFullAnswerMode()) —
   * still gets scored: the first evaluate() call (TestEngine.submit()'s
   * headless re-instantiation, or TestSession's forced re-evaluate on
   * entering review) runs the actual grading itself instead of relying on a
   * live click that never happened. Both existing callers already `await`
   * this (TestEngine.submit(), TestSession._reviewGoto()), so returning a
   * Promise here is not a breaking change. `coach` mode never runs full-
   * answer grading (see _runGrading() and the class doc comment) — its
   * score always comes from live tier3 build analytics.
   */
  async evaluate() {
    if (this._data?.mode !== 'coach' && !this._evaluated) {
      await this._runGrading();
    }
    this._result = this.constructor.score(this._data, this.getResponse());
    return this._result;
  }

  /** level 1 = nudge, level 2 = clue — tier 2/3 are explicit UI affordances, not folded in here. */
  getHint(level) {
    const r = this._data?.rubric?.[0];
    if (!r) return '';
    return level >= 2 ? r.clue : r.level1;
  }

  /**
   * Clears tier-2/tier-3 resolution state for a retry. Per handoff §4, step 1
   * (`_evaluated`/`_answerSims`/`_matchedSentence`) is deliberately left
   * alone — a fresh step-1 read only ever comes from a new score() call
   * (clicking "Grade Again"), never as a side effect of reset().
   */
  reset() {
    this._perRubricAnalytics = {};
    this._tier3Complete = false;
    this._attemptId = `${this._instanceId}-${Date.now()}`;
    this._attemptStartedAt = Date.now();
    this.shadowRoot.querySelector('sd-rubric-checklist')?.reset();
    this.shadowRoot.querySelector('sd-chained-blank-builder')?.reset();
  }

  render() {
    if (!this._data) return html``;
    if (this._ctx?.previewOnly) {
      return html`<p class="sd-prompt"><markdown-renderer .content=${resolveText(this._data.prompt)}></markdown-renderer></p>`;
    }
    // Only the status badge + prompt sit beside the diagram — the answer-
    // composition area (math-tools toggle, symbol toolbar, textarea,
    // equation composer, grade button, results) is a full free-text
    // authoring surface, not a compact input like an MCQ's option list or
    // a numeric field, so squeezing it into the ~40-55% leftover column
    // alongside the diagram (the same split QuestionBase.js's generic
    // image/graph/diagram handling uses for those compact inputs) starves
    // it of width and, since align-items:stretch matches the row's height
    // to whichever side is taller, can stretch the diagram card far past
    // its own natural size too — confirmed in a real mobile-landscape
    // browser: the toolbar's three symbol rows lost so much width they
    // clipped mid-row, and the diagram card stretched tall enough to leave
    // a large blank area below the actual figure. Rendered full-width
    // below the prompt+diagram row instead.
    const promptSection = html`
      <div class="sd-model-status ${this._modelState}" role="status">
        <span class="sd-status-icon ${this._modelState === 'loading' ? 'pulse' : ''}" aria-hidden="true">
          ${this._modelState === 'ready' ? '✅' : this._modelState === 'error' ? '⚠️' : '⏳'}
        </span>
        <span>
          ${this._modelState === 'ready' ? (this._data.mode === 'coach' ? 'AI tutor ready — let\'s build the answer together!' : 'AI tutor ready — go ahead and answer!')
            : this._modelState === 'error' ? `Model failed to load: ${this._modelError}`
            : `Waking up the AI tutor… ${this._modelProgress}%`}
        </span>
      </div>

      <p class="sd-prompt"><markdown-renderer .content=${resolveText(this._data.prompt)}></markdown-renderer></p>
    `;
    const answerSection = html`${this._data.mode === 'coach' ? this._renderCoachMode() : this._renderFullAnswerMode()}`;
    // Companion geometry figure (`data.diagram`) — never reveal-gated, same
    // side-by-side treatment as QuestionBase's own `graph`/`diagram`
    // handling (see this class's `diagram` schema doc comment for why this
    // file needs its own copy rather than inheriting it).
    if (this._data.diagram) {
      return html`
        <div class="${blockLayoutClass(null, this._data.diagram)}">
          <div class="cb-text">${promptSection}</div>
          ${renderDiagramCard({ hostId: 'q-diagram-host' })}
        </div>
        ${answerSection}
      `;
    }
    return html`${promptSection}${answerSection}`;
  }

  /** In-lesson formative shape: skip straight to the guided fill-the-blanks
   *  build — no free-text answer, no "Grade My Answer" step. */
  _renderCoachMode() {
    if (!this._data.level3?.length) {
      return html`<p class="sd-coach-missing">This question is set to coach mode but has no <code>level3</code> guided-build script to run — needs a full answer instead, or a level3 script added.</p>`;
    }
    if (this._modelState !== 'ready') return html``;
    return html`
      <div class="sd-results">
        <sd-chained-blank-builder
          .level3=${this._data.level3}
          .rubric=${this._data.rubric}
          .answerSims=${{}}
          .evaluated=${false}
          .thresholds=${this._data.thresholds}
          .embed=${this._embed}
          @sd-tier3-resolved=${this._onTier3Resolved}
          @sd-tier3-complete=${this._onTier3Complete}
        ></sd-chained-blank-builder>
      </div>
      <question-explanation
        .explanation=${this._data.explanation}
        .explanationSlide=${this._data.explanationSlide}
        .bundleId=${this._ctx?.bundleId}
        ?revealed=${this._tier3Complete}
      ></question-explanation>
    `;
  }

  /** Review/test-session shape: type a full answer, grade it against the
   *  rubric, then optionally scaffold down through the same guided build.
   *
   *  In a test/practice-test attempt (`hideHints`, stamped by TestEngine —
   *  see its renderCurrentQuestion()), the "Grade My Answer"/"Grade Again"
   *  button and its live rubric feedback are hidden entirely: a mid-attempt
   *  AI grade would show the correct rubric points and hints before the
   *  test is even submitted. The test's own Submit/Next button is enough —
   *  evaluate() runs the actual grading automatically once the attempt is
   *  scored (see its doc comment), and the verdict then renders here on its
   *  own once `_evaluated` flips true, with no button of its own. The
   *  textarea itself is locked once that's happened (review is a record of
   *  what was submitted, not a place to keep editing it), but stays
   *  editable up to that point since the student is still answering.
   *
   *  `hideHints && _evaluated` only ever happens on the review screen (see
   *  TestSession._reviewGoto()'s forced evaluate() call) — evaluate() is
   *  never reachable from a live hideHints attempt, since its "Grade My
   *  Answer" button is the one hidden above. That makes `inTest` here a
   *  reliable "we're in review" signal, so the level3 builder below is
   *  handed `staticReveal` in that case: the review page shows the full
   *  model answer straight away instead of re-running the guided build's
   *  click-through-each-blank flow (see chained-blank-builder.js). */
  _renderFullAnswerMode() {
    const inTest = !!this._data.hideHints;
    const locked = inTest && this._evaluated;
    return html`
      ${locked ? '' : html`
        <div class="sd-math-tools-row">
          <button
            type="button"
            class="sd-math-toggle"
            aria-pressed=${this._mathToolsOn}
            @click=${this._onToggleMathTools}
          >${this._mathToolsOn ? '🧮 Math tools: on' : '🧮 Math tools: off'}</button>
          <!-- Contextual guides (guide:open; the shell shows them as a sheet). -->
          <guide-help slug="answering-descriptive-questions" label="How answers are checked"></guide-help>
          ${this._mathToolsOn ? html`<guide-help slug="typing-maths" label="Typing maths"></guide-help>` : ''}
        </div>
        ${this._mathToolsOn ? html`
          <sd-symbol-toolbar ?disabled=${locked} @sd-symbol-insert=${this._onSymbolInsert}></sd-symbol-toolbar>
          <sd-equation-composer ?disabled=${locked} @sd-equation-insert=${this._onEquationInsert}></sd-equation-composer>
        ` : ''}
      `}
      <div class="sd-answer-layout">
        <textarea
          class="sd-answer-box"
          placeholder="Type your full answer here…"
          aria-label="Your full answer"
          .value=${this._fullAnswer}
          ?readonly=${locked}
          @input=${this._onAnswerInput}
          @scroll=${this._onAnswerScroll}
        ></textarea>
        ${extractMathSpans(this._fullAnswer).length ? html`
          <div class="sd-answer-preview">
            <p class="sd-answer-preview-label">Preview</p>
            <div class="sd-answer-preview-scroll">
              <safe-math-text .content=${this._fullAnswer}></safe-math-text>
            </div>
          </div>
        ` : ''}
      </div>
      ${inTest ? '' : html`
        <div class="sd-row">
          <button
            class="sd-btn3d sd-btn-indigo sd-btn-wide"
            ?disabled=${this._modelState !== 'ready' || this._grading || !this._fullAnswer.trim()}
            @click=${this._gradeAnswer}
          >${this._grading ? 'Grading…' : this._evaluated ? `Grade Again ${brandIcon('sparkle')}` : `Grade My Answer ${brandIcon('sparkle')}`}</button>
        </div>
      `}

      ${this._evaluated ? html`
        <div class="sd-results">
          ${this._chainWarnings.length ? html`
            <div class="sd-chain-warning" role="status">
              ⚠️ ${this._chainWarnings[0].status === 'unverifiable'
                ? html`One of your equations couldn't be checked —
                    <safe-math-text inline .content=${`$${this._chainWarnings[0].currSpan}$`}></safe-math-text>
                    may not be written correctly. Double-check it.`
                : html`<safe-math-text inline .content=${`$${this._chainWarnings[0].currSpan}$`}></safe-math-text>
                    doesn't clearly follow from the line before it
                    (<safe-math-text inline .content=${`$${this._chainWarnings[0].prevSpan}$`}></safe-math-text>).
                    Check your working around there.`}
            </div>
          ` : ''}
          <sd-rubric-checklist
            .rubric=${this._data.rubric}
            .answerSims=${this._answerSims}
            .matchedSentence=${this._matchedSentence}
            .numericMismatch=${this._numericMismatch}
            .thresholds=${this._data.thresholds}
            .embed=${this._embed}
            @sd-hint-shown=${this._onHintShown}
            @sd-blank-checked=${this._onBlankChecked}
          ></sd-rubric-checklist>

          ${this._data.level3?.length ? html`
            <sd-chained-blank-builder
              .level3=${this._data.level3}
              .rubric=${this._data.rubric}
              .answerSims=${this._answerSims}
              .evaluated=${this._evaluated}
              .thresholds=${this._data.thresholds}
              .embed=${this._embed}
              .staticReveal=${inTest}
              @sd-tier3-resolved=${this._onTier3Resolved}
              @sd-tier3-complete=${this._onTier3Complete}
            ></sd-chained-blank-builder>
          ` : ''}
        </div>
      ` : ''}
      <question-explanation
        .explanation=${this._data.explanation}
        .explanationSlide=${this._data.explanationSlide}
        .bundleId=${this._ctx?.bundleId}
        ?revealed=${this._evaluated}
      ></question-explanation>
    `;
  }
}

customElements.define('semantic-descriptive-v1', SemanticDescriptive);
