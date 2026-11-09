import { LitElement, html, css } from 'lit';
import {
  classify, scoreFullAnswer, detectAnswerMode, normalizeLatexSubscripts,
  extractMathSpans, computeChainConsistency,
} from 'core/evaluators/semanticSimilarityEvaluator.js';
import { sdTokens, sdButtons, sdKeyframes } from '../v1/styles.js';
import { loadEmbedder } from '../v1/modelLoader.js';
import { makeStepConsistencyChecker } from '../v1/mathConsistency.js';
import { EventBus } from 'core/EventBus.js';
import { ErrorReporter } from 'core/ErrorReporter.js';
import { A11yAnnouncer } from 'core/A11yAnnouncer.js';
import { ProgressStore } from 'core/ProgressStore.js';
import { AuthService } from 'core/AuthService.js';
import '../v1/components/rubric-checklist.js';
import '../v1/components/chained-blank-builder.js';
import '../v1/components/symbol-toolbar.js';
import '../v1/components/equation-composer.js';
import 'core/components/QuestionExplanation.js';
import '../../../../ui/components/SafeMathText.js';
import '../../../../ui/components/MarkdownRenderer.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';
import { brandIcon } from '../../../../ui/components/LookSlots.js';
import { countWords, scoreWordLimit, evaluateFormatChecks, scoreFormatChecks, combineScores } from './scoring.js';
import { blockImageLayoutStyles, blockLayoutClass } from 'core/components/blockImageLayout.js';
import { mountQuestionDiagram, renderDiagramCard } from 'core/components/diagramHost.js';

const DEFAULT_THRESHOLDS = { high: 0.60, low: 0.40, blank: 0.78 };

function resolveText(field) {
  if (field == null) return '';
  return typeof field === 'string' ? field : (field.en || '');
}

/**
 * <semantic-descriptive-v2> — plugin entry for semantic-descriptive@2.
 *
 * A strict superset of @1 (which stays untouched for existing content-recall
 * banks — see src/plugins/questions/semantic-descriptive/v1/index.js): the
 * same embedding-based `rubric[]` content scoring, plus two new,
 * model-free dimensions aimed at CBSE writing-skill tasks (notice/letter/
 * dialogue/paragraph), where content is often student-invented and half the
 * real marking scheme (format, word limit) isn't a content-recall question
 * at all:
 *
 *   - `wordLimit` {min,max}: a live word counter, always visible (no
 *     grading needed to see it), plus a scored compliance band.
 *   - `formatChecks[]`: regex presence rules (heading/salutation/date/
 *     signature/etc.) — synchronous, no embedding model involved.
 *
 * `rubric` stays the mechanism for whatever content *is* enumerable (CBSE
 * writing prompts usually hand you this directly — required activities/
 * dates for a notice, a "useful words" bank for a descriptive paragraph).
 * Expression/language quality is never auto-scored by any of this — no
 * backend LLM is available (zero-backend PWA) to judge it — so `explanation`/
 * `explanationSlide` on a writing-skill question should hold a full
 * exemplar answer for the student to self-compare against, not just a
 * fact summary.
 *
 * If a question sets neither `wordLimit` nor `formatChecks`, this behaves
 * exactly like @1 (content-only). If it sets `rubric: []` (or omits it),
 * the embedding model is never loaded at all — a pure format/word-limit
 * writing question shouldn't pay for a ~23MB model download it has no use
 * for.
 */
export class SemanticDescriptiveV2 extends LitElement {
  static schema = {
    $id: 'semantic-descriptive@2',
    type: 'object',
    required: ['id', 'type', 'prompt', 'rubric'],
    properties: {
      prompt: { type: 'object', minProperties: 1 },
      diagnosticFor: { type: 'array', items: { type: 'string' } },
      poolable: { type: 'boolean' },
      /** See semantic-descriptive@1's identical field for the full doc
       *  comment — same authoring semantics here. */
      diagram: { type: 'object' }, // { points, segments?, angles?, rightAngles?, parallelMarks?, circles?, viewBox?, a11yCaption?, position? } — optional companion geometry figure (see GeometryDiagram.js)
      /** See semantic-descriptive@1's identical field for the full doc
       *  comment — same authoring semantics here. */
      answerMode: { type: 'string', enum: ['math', 'text'] },
      rubric: {
        type: 'array',
        minItems: 0,
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
      mode: { type: 'string', enum: ['full-answer', 'coach'] },
      wordLimit: {
        type: 'object',
        properties: {
          min: { type: 'number' },
          max: { type: 'number' },
        },
      },
      formatChecks: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'pattern', 'label'],
          properties: {
            id: { type: 'string' },
            pattern: { type: 'string' },
            flags: { type: 'string' },
            weight: { type: 'number' },
            label: { type: 'object' },
          },
        },
      },
      weights: {
        type: 'object',
        properties: {
          format: { type: 'number' },
          content: { type: 'number' },
          wordLimit: { type: 'number' },
        },
      },
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
      /* See semantic-descriptive@1's identical block for the full doc
       * comment on why this file needs its own copy of these rules. */
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
      .sd-word-count {
        margin-top: 8px; font-size: 12.5px; font-weight: var(--fw-heavy); color: var(--sd-ink-soft);
      }
      .sd-word-count.sd-word-count-warn { color: var(--warn-text); }
      .sd-word-count.sd-word-count-ok { color: var(--success-text); }
      .sd-format-checklist {
        margin-top: 16px; padding: 14px 16px; border: 2px solid var(--sd-border); border-radius: var(--radius-md);
        background: var(--sd-card);
      }
      .sd-format-checklist-title { font-weight: var(--fw-heavy); font-size: 13px; margin: 0 0 10px; color: var(--sd-ink); }
      .sd-format-check-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13.5px; }
      .sd-format-check-icon { font-size: 14px; }
      .sd-format-check-row.sd-check-pass { color: var(--success-text); }
      .sd-format-check-row.sd-check-fail { color: var(--sd-ink-soft); }
      .sd-math-tools-row { margin-bottom: 8px; }
      .sd-math-toggle {
        font-family: var(--sd-font); font-weight: var(--fw-heavy); font-size: 12px; padding: 5px 12px;
        border: 2px solid var(--sd-border); border-radius: var(--radius-sm); background: var(--sd-card); color: var(--sd-ink-soft);
        cursor: pointer;
      }
      .sd-math-toggle[aria-pressed="true"] { background: var(--sd-indigo-soft); color: var(--sd-indigo-dark); border-color: var(--sd-indigo); }
      /* See semantic-descriptive@1's identical comment on this block —
         mobile-portrait stays stacked; the 700px breakpoint (between the
         design system's phone-portrait ~375px and phone-landscape ~740px
         reference viewports) switches to side-by-side for desktop and
         mobile-landscape. The row is height-capped and both children get
         min-height:0 so a long answer scrolls *within* the split view
         instead of the whole row growing to fit it (see v1's fuller
         comment); resize is switched off there for the same reason. */
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
    this._instanceId = `sd2-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    this._perRubricAnalytics = {};
    this._attemptId = this._instanceId;
    this._attemptStartedAt = Date.now();
    this._diagramMounted = false;
  }

  /** See semantic-descriptive@1's identical methods for the full doc
   *  comment — same reasoning here (this class extends LitElement
   *  directly, not QuestionBase). */
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
      formatChecks: (data.formatChecks || []).map((c) => ({ ...c, label: resolveText(c.label) })),
    };
    this._data.answerMode = data.answerMode === 'math' || data.answerMode === 'text'
      ? data.answerMode
      : detectAnswerMode(this._data.rubric);
    // See semantic-descriptive@1's identical comment — the toggle in
    // _renderFullAnswerMode() lets the student override either direction.
    this._mathToolsOn = this._data.answerMode === 'math';
    this._hasRubric = this._data.rubric.length > 0;
    // Bank-preview, or a pure format/word-limit question with no content
    // rubric at all: no free-text answer to grade against the model, so no
    // need to wake the embedder — see class doc comment.
    if (this._ctx?.previewOnly || !this._hasRubric) return;
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
    }
  }

  _onAnswerInput(e) {
    this._fullAnswer = e.target.value;
    EventBus.emit('interaction:question', { questionId: this._data?.id, state: this.getState() });
  }

  /** See semantic-descriptive@1's identical doc comment. */
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
   *  textarea, wrapped in `$...$` — see semantic-descriptive@1's identical
   *  doc comment for why that delimiter matters to the backend scorer. */
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

  /** Shared by the interactive "Grade My Answer" button and evaluate()'s
   *  automatic call — see semantic-descriptive@1's identical doc comment.
   *  When there's no content rubric at all, this is a synchronous no-model
   *  path: format/word-limit are computed straight from `_fullAnswer` in
   *  score(), so all this needs to do is flip `_evaluated`. */
  async _runGrading() {
    const text = this._fullAnswer.trim();
    if (!this._hasRubric) {
      this._evaluated = true;
      this._persistAnalytics();
      return;
    }
    if (!text) {
      this._evaluated = true;
      this._persistAnalytics();
      return;
    }
    if (this._modelState !== 'ready') await this._modelReadyPromise;
    if (this._modelState !== 'ready') {
      // See semantic-descriptive@1's identical _runGrading() for why this
      // retries once instead of caching the failure as a real 0-addressed
      // result — matters most for TestEngine._computeResults()'s single
      // headless scoring pass at submit time.
      this._modelState = 'idle';
      this._modelReadyPromise = this._loadModel();
      await this._modelReadyPromise;
    }
    if (this._modelState !== 'ready') {
      // Still unavailable — leave `_evaluated` false (this question has a
      // real answer to grade) so a later evaluate() call gets a genuine
      // second attempt instead of permanently locking in a false zero.
      this._persistAnalytics();
      return;
    }
    // See semantic-descriptive@1's identical comment — only pays for
    // ComputeEngine when there's an actual chance it's needed.
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
    // See semantic-descriptive@1's identical comment.
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

  /** See semantic-descriptive@1's identical doc comment. */
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
      ErrorReporter.reportError(err, { source: 'semantic-descriptive@2', phase: 'load-compute-engine', questionId: this._data?.id });
      return undefined;
    }
  }

  async _gradeAnswer() {
    if (!this._fullAnswer.trim() && this._hasRubric) return;
    if (this._hasRubric && this._modelState !== 'ready') return;
    this._grading = true;
    try {
      await this._runGrading();
    } catch (err) {
      ErrorReporter.reportError(err, { source: 'semantic-descriptive@2', phase: 'grade-answer', questionId: this._data?.id });
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
      ErrorReporter.reportError(err, { source: 'semantic-descriptive@2', phase: 'persist-analytics', questionId: this._data?.id });
    }
  }

  // --- Question plugin contract -------------------------------------------

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
    if (typeof s.mathToolsOn === 'boolean') this._mathToolsOn = s.mathToolsOn;
  }

  /**
   * Pure, synchronous rollup combining three independent dimensions — see
   * scoring.js's combineScores(). The embedding work (contentScore) already
   * happened live and travels inside `response.answerSims`; format/word-limit
   * are recomputed here straight from the submitted text, since both are
   * cheap, deterministic, and need no model.
   */
  static score(itemData, response) {
    const rubric = itemData.rubric || [];
    const mode = itemData.mode === 'coach' ? 'coach' : 'full-answer';
    const text = response?.fullAnswerText || '';

    let contentScore = null;
    if (rubric.length > 0) {
      if (mode === 'coach') {
        const analytics = response?.rubricAnalytics || {};
        const addressed = rubric.filter((r) => analytics[r.id]?.tier3GaveUp === false).length;
        contentScore = addressed / rubric.length;
      } else {
        const thresholds = { ...DEFAULT_THRESHOLDS, ...(itemData.thresholds || {}) };
        const sims = response?.answerSims || {};
        const addressed = rubric.filter((r) => classify(sims[r.id] ?? -1, thresholds) === 'addressed').length;
        contentScore = addressed / rubric.length;
      }
    }

    const formatScore = scoreFormatChecks(text, itemData.formatChecks);
    const wordLimitScore = scoreWordLimit(text, itemData.wordLimit);
    const score = combineScores({ formatScore, contentScore, wordLimitScore, weights: itemData.weights });

    const parts = [];
    if (formatScore !== null) parts.push(`Format ${Math.round(formatScore * 100)}%`);
    if (contentScore !== null) parts.push(`Content ${Math.round(contentScore * 100)}%`);
    if (wordLimitScore !== null) parts.push(`Word count ${countWords(text)} (limit ${itemData.wordLimit.min}-${itemData.wordLimit.max})`);

    return {
      isCorrect: null,
      score,
      feedback: parts.length ? parts.join(' · ') : `Score: ${Math.round(score * 100)}%`,
    };
  }

  async evaluate() {
    if (this._data?.mode !== 'coach' && !this._evaluated) {
      await this._runGrading();
    }
    this._result = this.constructor.score(this._data, this.getResponse());
    return this._result;
  }

  getHint(level) {
    const r = this._data?.rubric?.[0];
    if (!r) return '';
    return level >= 2 ? r.clue : r.level1;
  }

  reset() {
    this._perRubricAnalytics = {};
    this._tier3Complete = false;
    this._attemptId = `${this._instanceId}-${Date.now()}`;
    this._attemptStartedAt = Date.now();
    this.shadowRoot.querySelector('sd-rubric-checklist')?.reset();
    this.shadowRoot.querySelector('sd-chained-blank-builder')?.reset();
  }

  _renderWordCount() {
    if (!this._data?.wordLimit) return html``;
    const { min, max } = this._data.wordLimit;
    const count = countWords(this._fullAnswer);
    const within = count >= (min ?? 0) && count <= (max ?? Infinity);
    const cls = count === 0 ? '' : within ? 'sd-word-count-ok' : 'sd-word-count-warn';
    return html`<div class="sd-word-count ${cls}">${count} words <span aria-hidden="true">·</span> limit ${min}-${max}</div>`;
  }

  _renderFormatChecklist() {
    if (!this._data?.formatChecks?.length) return html``;
    const results = evaluateFormatChecks(this._fullAnswer, this._data.formatChecks);
    return html`
      <div class="sd-format-checklist">
        <p class="sd-format-checklist-title">Format checklist</p>
        ${results.map((r) => html`
          <div class="sd-format-check-row ${r.matched ? 'sd-check-pass' : 'sd-check-fail'}">
            <span class="sd-format-check-icon" aria-hidden="true">${r.matched ? '✅' : '⬜'}</span>
            <span><markdown-renderer inline .content=${resolveText(r.label)}></markdown-renderer></span>
          </div>
        `)}
      </div>
    `;
  }

  render() {
    if (!this._data) return html``;
    if (this._ctx?.previewOnly) {
      return html`<p class="sd-prompt"><markdown-renderer .content=${resolveText(this._data.prompt)}></markdown-renderer></p>`;
    }
    // See semantic-descriptive@1's identical split for the full doc
    // comment on why only the prompt (not the answer-composition area)
    // sits beside the diagram.
    const promptSection = html`
      ${this._hasRubric ? html`
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
      ` : ''}

      <p class="sd-prompt"><markdown-renderer .content=${resolveText(this._data.prompt)}></markdown-renderer></p>
    `;
    const answerSection = html`${this._data.mode === 'coach' ? this._renderCoachMode() : this._renderFullAnswerMode()}`;
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

  _renderCoachMode() {
    if (!this._data.level3?.length) {
      return html`<p class="sd-coach-missing">This question is set to coach mode but has no <code>level3</code> guided-build script to run — needs a full answer instead, or a level3 script added.</p>`;
    }
    if (this._hasRubric && this._modelState !== 'ready') return html``;
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

  _renderFullAnswerMode() {
    const inTest = !!this._data.hideHints;
    const canGrade = this._hasRubric ? (this._modelState === 'ready' && !this._grading && !!this._fullAnswer.trim()) : !this._evaluated;
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
      ${this._renderWordCount()}
      ${inTest ? '' : html`
        <div class="sd-row">
          <button
            class="sd-btn3d sd-btn-indigo sd-btn-wide"
            ?disabled=${!canGrade}
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
          ${this._hasRubric ? html`
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
          ` : ''}

          ${this._renderFormatChecklist()}

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

customElements.define('semantic-descriptive-v2', SemanticDescriptiveV2);
