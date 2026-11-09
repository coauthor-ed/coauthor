import { LitElement, html, css } from 'lit';
import { mountPlugin } from '../../../../core/mountPlugin.js';
import { resolveTagName } from '../../../../core/resolveTagName.js';
import { EventBus } from '../../../../core/EventBus.js';
import { QuestionRegistry } from '../../../../registry/QuestionRegistry.js';
import '../../../../ui/components/MarkdownRenderer.js';

function resolveText(field) {
  if (field == null) return '';
  return typeof field === 'string' ? field : (field.en || '');
}

/** Same rounding TestSession.js's own formatScore() uses for the test-level
 *  score badges — kept as an independent copy since this plugin and the UI
 *  shell are separate modules with no shared util for it, but the two
 *  displays must agree exactly or a "why do these numbers differ" report
 *  is one keystroke away. */
function formatOneDecimal(n) {
  return (Math.round((n ?? 0) * 10) / 10).toFixed(1);
}

/**
 * <comprehension-set-v1> — plugin entry for comprehension-set@1.
 *
 * One shared stimulus (a reading passage or a literature extract) plus
 * several dependent sub-items of mixed shape (an mcq-single MCQ, a one-word
 * fill-blank, a semantic-descriptive short answer, ...), rendered as one
 * unit and scored as a weighted composite. Every existing question type is
 * "one stimulus -> one gradable response" — this plugin doesn't add a new
 * gradable shape of its own, it only orchestrates existing ones: the
 * passage renders once, then each `items[].question` mounts through the
 * ordinary mountPlugin.js contract, same as any top-level question (HLD's
 * "never mount a plugin element by hand" invariant applies here exactly as
 * everywhere else — this class is the *caller* of mountPlugin, never a
 * hand-rolled substitute for it).
 *
 * `static score()` never depends on a live mounted child — it resolves each
 * child's own registered custom element class via QuestionRegistry +
 * resolveTagName and calls that class's own `static score()` directly, no
 * instance, no DOM. But some question types (semantic-descriptive@1/@2)
 * split grading across two steps: an instance `evaluate()` that does actual
 * (async, e.g. embedding-based) grading work and writes its result onto the
 * response (`answerSims`), and a `static score()` that just reads that
 * already-computed field back — score() alone is a no-op for those types
 * unless evaluate() ran first. TestEngine's headless regrade path
 * (`_computeResults()`) creates this element with `document.createElement()`
 * and never appends it to the document, so Lit never runs its update cycle
 * and no child ever actually mounts; the same can happen transiently even
 * when this element *is* live (TestSession's review screen calls evaluate()
 * immediately after jumpTo(), which can race a child's own async
 * QuestionRegistry.loadPlugin() mount). `evaluate()` below accounts for
 * both: it evaluates a live child directly when one exists, and falls back
 * to a throwaway headless instance (mirroring TestEngine's own top-level
 * headless-evaluate pattern) when it doesn't — so an unmounted/not-yet-
 * mounted semantic-descriptive child still gets properly graded instead of
 * scoring as blank, and a late-mounting live child inherits the already-
 * graded state (via the same setState() restore _doMountChild always does)
 * so its own model-answer/rubric-reveal UI renders correctly on review too.
 *
 * `_itemState` (getState()-shaped) and `_itemResponseCache` (getResponse()-
 * shaped) are kept as two SEPARATE caches, never one conflated store — for
 * many question types (any QuestionBase subclass with its own `_value`
 * bookkeeping, e.g. fill-blank@2) these are genuinely different shapes
 * (`{value: ...}` vs. a bare value), and `_doMountChild`'s `el.setState()`
 * restore only ever accepts the getState() shape. Writing a getResponse()
 * result into `_itemState` was a real bug: a later-mounting child's
 * setState() would silently no-op on the wrong shape, so it rendered as
 * unanswered on review (a dropdown reset to "Choose..") even though the
 * student really did answer it.
 */
export class ComprehensionSet extends LitElement {
  static schema = {
    $id: 'comprehension-set@1',
    type: 'object',
    required: ['id', 'type', 'passage', 'items'],
    properties: {
      passage: { type: 'object', minProperties: 1 },
      passageTitle: { type: 'object' },
      items: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['id', 'question'],
          properties: {
            id: { type: 'string' },
            weight: { type: 'number' },
            question: { type: 'object' },
          },
        },
      },
    },
  };

  static properties = {
    _data: { state: true },
    _evaluated: { state: true },
  };

  static styles = [
    css`
      :host { display: block; font-family: var(--font-family); color: var(--text-main); }
      .cs-passage {
        background: var(--bg-surface);
        border: 2px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: 18px 20px;
        margin-bottom: 20px;
      }
      .cs-passage-title { font-size: 1.05rem; font-weight: var(--fw-heavy); margin: 0 0 10px; color: var(--text-main); }
      .cs-passage-body { line-height: 1.7; color: var(--text-main); }
      .cs-items { display: flex; flex-direction: column; gap: 20px; }
      .cs-item {
        border-left: 4px solid var(--primary-color);
        padding-left: 14px;
      }
      .cs-item-index {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 0.8rem;
        font-weight: var(--fw-heavy);
        color: var(--text-muted);
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      /* Per-item score badge - shown once evaluated, next to each
         sub-item's own "Question N" label. Deliberately at this same
         per-item granularity as TestSession's top-level score badge, so a
         scoring bug in one specific sub-item type is visible right next to
         that item instead of only showing up in the aggregate feedback
         below. */
      .cs-item-score {
        font-variant-numeric: tabular-nums;
        font-weight: var(--fw-heavy);
        text-transform: none;
        letter-spacing: normal;
        padding: 2px 9px;
        border-radius: var(--radius-pill);
        border: 2px solid var(--border-color);
        background: var(--bg-panel);
        color: var(--text-main);
      }
      .cs-item-score.correct { border-color: var(--success-text); color: var(--success-text); background: var(--success-bg); }
      .cs-item-score.partial { border-color: var(--warn-text);    color: var(--warn-text);    background: var(--warn-bg); }
      .cs-item-score.wrong   { border-color: var(--error-text);   color: var(--error-text);   background: var(--error-bg); }
      .cs-summary {
        margin-top: 18px;
        padding: 12px 16px;
        border-radius: var(--radius-sm);
        border: 2px solid var(--border-color);
        background: var(--bg-panel);
        font-weight: var(--fw-strong);
        font-size: 0.9rem;
      }
    `,
  ];

  constructor() {
    super();
    this._data = null;
    this._evaluated = false;
    this._childEls = {};
    this._itemState = {};
    // getResponse()-shaped cache, kept SEPARATE from `_itemState` (which is
    // always getState()-shaped, the only shape `el.setState()`/_doMountChild
    // accept) — see evaluate()'s doc comment for why conflating the two
    // silently corrupts an unmounted child's restored answer.
    this._itemResponseCache = {};
    this._onChildInteraction = this._onChildInteraction.bind(this);
  }

  /** Required plugin lifecycle — called by mountPlugin.js */
  init(data, prng, ctx) {
    const isPrng = prng && typeof prng.shuffle === 'function';
    this._prng = isPrng ? prng : null;
    this._ctx = isPrng ? (ctx || null) : (prng || null);
    this._data = data;
    this._childIds = new Set((data.items || []).map((item) => item.question?.id).filter(Boolean));
  }

  connectedCallback() {
    super.connectedCallback();
    EventBus.on('question:interaction', this._onChildInteraction);
    EventBus.on('interaction:question', this._onChildInteraction);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    EventBus.off('question:interaction', this._onChildInteraction);
    EventBus.off('interaction:question', this._onChildInteraction);
  }

  /** A mounted child emits its own interaction ping under its own id (either
   *  `{id}` or `{questionId}`, depending on which plugin — see the two
   *  conventions in use across question plugins). Recognize one of our own
   *  children firing and re-emit our *own* consolidated state under our own
   *  id, so TestEngine's autosave (which listens for `interaction:question`
   *  keyed by the top-level question id) actually persists this composite,
   *  not an id it's never heard of. */
  _onChildInteraction(payload) {
    const childId = payload?.id ?? payload?.questionId;
    if (!childId || !this._childIds?.has(childId)) return;
    EventBus.emit('interaction:question', { questionId: this._data.id, state: this.getState() });
  }

  /** mountPlugin() requires the child's custom element to already be defined
   *  (it throws if el.init isn't a function) — unlike top-level questions,
   *  which TestEngine always loads via QuestionRegistry before mounting, a
   *  comprehension-set's children are never pre-loaded by anything else, so
   *  this must load the type itself before mounting. updated() is a
   *  synchronous Lit hook, so an unloaded type mounts once its load resolves
   *  and triggers a requestUpdate() to retry. */
  _mountChild(item, hostEl) {
    if (!hostEl || this._childEls[item.id] || this._pendingChildren?.has(item.id)) return;
    const type = item.question.type;
    if (customElements.get(resolveTagName(type))) {
      this._doMountChild(item, hostEl);
      return;
    }
    if (!this._pendingChildren) this._pendingChildren = new Set();
    this._pendingChildren.add(item.id);
    QuestionRegistry.loadPlugin(type)
      .then(() => {
        this._pendingChildren.delete(item.id);
        this.requestUpdate();
      })
      .catch(() => {
        // An unresolvable/unregistered child type stays unmounted rather
        // than throwing out of updated() and aborting sibling mounts — same
        // "degrade, don't crash" spirit as static score()'s own catch.
        this._pendingChildren.delete(item.id);
      });
  }

  /** TestEngine stamps `hideHints: true` onto the top-level question data it
   *  hands to mountPlugin (see renderCurrentQuestion()) to suppress hints/
   *  self-grading controls (e.g. semantic-descriptive's "Grade My Answer")
   *  during a real test attempt — but it only ever touches the comprehension
   *  -set's own data object, never the nested `item.question` payloads this
   *  class owns. Forward that same flag down here so a child sees the exact
   *  in-test signal it would see if it were TestEngine's direct top-level
   *  question, keeping this composite consistent with every other question
   *  type instead of leaking self-grading controls mid-attempt. Shared by
   *  both the live mount path and evaluate()'s headless fallback so a child
   *  sees the identical data either way. */
  _childQuestionData(item) {
    return this._data?.hideHints ? { ...item.question, hideHints: true } : item.question;
  }

  _doMountChild(item, hostEl) {
    const questionData = this._childQuestionData(item);
    const boundary = mountPlugin(questionData.type, questionData, hostEl, this._prng, this._ctx);
    const el = boundary.firstElementChild;
    this._childEls[item.id] = el;
    const saved = this._itemState[item.id];
    if (saved != null && typeof el.setState === 'function') el.setState(saved);
  }

  updated(changedProperties) {
    super.updated?.(changedProperties);
    if (!this._data) return;
    for (const item of this._data.items) {
      if (this._childEls[item.id]) continue;
      const host = this.shadowRoot?.getElementById(`cs-host-${item.id}`);
      if (host) this._mountChild(item, host);
    }
  }

  // --- Question plugin contract -------------------------------------------

  isAnswered() {
    if (!this._data) return false;
    return this._data.items.every((item) => this._childEls[item.id]?.isAnswered?.() ?? false);
  }

  getResponse() {
    const items = {};
    for (const item of this._data?.items || []) {
      const el = this._childEls[item.id];
      items[item.id] = el && typeof el.getResponse === 'function' ? el.getResponse() : (this._itemResponseCache[item.id] ?? null);
    }
    return { items };
  }

  getState() {
    const items = {};
    for (const item of this._data?.items || []) {
      const el = this._childEls[item.id];
      items[item.id] = el && typeof el.getState === 'function' ? el.getState() : (this._itemState[item.id] ?? null);
    }
    return { items, evaluated: this._evaluated };
  }

  setState(s) {
    this._itemState = { ...(s?.items || {}) };
    // A fresh raw state makes any previously cached response stale (it was
    // graded against whatever answer was live before) — cleared here so
    // getResponse()'s fallback never serves an answer from before this
    // setState() call; evaluate() repopulates it.
    this._itemResponseCache = {};
    this._evaluated = !!s?.evaluated;
    for (const item of this._data?.items || []) {
      const el = this._childEls[item.id];
      const saved = this._itemState[item.id];
      if (el && saved != null && typeof el.setState === 'function') el.setState(saved);
    }
  }

  getHint(level) {
    const first = this._data?.items?.[0];
    const el = first && this._childEls[first.id];
    return el && typeof el.getHint === 'function' ? el.getHint(level) : '';
  }

  reset(seed) {
    this._evaluated = false;
    this._itemState = {};
    this._itemResponseCache = {};
    for (const item of this._data?.items || []) {
      this._childEls[item.id]?.reset?.(seed);
    }
    this.requestUpdate();
  }

  /** Loads (if needed) and calls each item's own registered class directly —
   *  no instance, no DOM, works identically whether or not any child is
   *  actually mounted (see class doc comment). */
  static async score(itemData, response) {
    const items = itemData.items || [];
    let totalWeight = 0;
    let earnedWeight = 0;
    let fullyCorrectCount = 0;
    const perItem = {};

    for (const item of items) {
      const weight = item.weight ?? 1;
      totalWeight += weight;
      const childType = item.question?.type;
      const childResponse = response?.items?.[item.id];
      let childResult = { score: 0, isCorrect: false };
      if (childType) {
        try {
          await QuestionRegistry.loadPlugin(childType);
          const Ctor = customElements.get(resolveTagName(childType));
          if (Ctor && typeof Ctor.score === 'function') {
            childResult = await Ctor.score(item.question, childResponse);
          }
        } catch {
          // An unresolvable/unregistered child type scores 0 rather than
          // throwing — same "degrade, don't crash" spirit as
          // PluginErrorBoundary for a single broken sub-question.
        }
      }
      // `weight` rides along so a caller can show this item's own earned/max
      // marks (weight * childResult.score / weight) without re-deriving it -
      // this is what lets the review UI show a per-item score badge next to
      // each sub-question, the same granularity the top-level test review
      // already gets, so a scoring bug in one specific sub-item type is
      // visible at a glance instead of only showing up in the aggregate.
      perItem[item.id] = { ...childResult, weight };
      earnedWeight += (childResult.score || 0) * weight;
      if (childResult.isCorrect) fullyCorrectCount++;
    }

    const score = totalWeight > 0 ? earnedWeight / totalWeight : 0;
    return {
      isCorrect: items.length > 0 && fullyCorrectCount === items.length,
      score,
      feedback: `${fullyCorrectCount} / ${items.length} parts fully correct.`,
      perItem,
    };
  }

  /** Ensures every item has actually graded itself (so its own
   *  getResponse()/getState() reflects that grading, e.g. semantic-
   *  descriptive's `answerSims`) before snapshotting getResponse() into
   *  static score() — mirrors semantic-descriptive@1/@2's own evaluate(),
   *  which runs its async grading step before delegating to score(). A live
   *  child is evaluated directly (so its own UI updates in place); an item
   *  with no live child yet (headless scoring, or a real mount still in
   *  flight behind QuestionRegistry.loadPlugin()) is graded via a throwaway
   *  headless instance instead — see _headlessEvaluateItem(). Either way the
   *  graded response is written back into `_itemState`, so a child that
   *  mounts later still inherits the graded state through _doMountChild's
   *  existing setState() restore, and its own model-answer/rubric-reveal UI
   *  renders correctly instead of looking permanently unanswered. */
  async evaluate() {
    for (const item of this._data?.items || []) {
      const el = this._childEls[item.id];
      if (el && typeof el.evaluate === 'function') {
        await el.evaluate();
        // `getState()` (NOT `getResponse()`) into `_itemState` — that's the
        // only shape _doMountChild's `el.setState(saved)` restore accepts.
        // Writing getResponse()'s (differently-shaped, for many question
        // types) output here instead was a real bug: a later-mounting child
        // would silently fail to restore its answer (setState() no-ops on
        // an unrecognized shape), rendering as unanswered on review even
        // though it really was answered — see class doc comment.
        if (typeof el.getState === 'function') this._itemState[item.id] = el.getState();
        if (typeof el.getResponse === 'function') this._itemResponseCache[item.id] = el.getResponse();
      } else if (!el) {
        const graded = await this._headlessEvaluateItem(item);
        if (graded.state !== undefined) this._itemState[item.id] = graded.state;
        if (graded.response !== undefined) this._itemResponseCache[item.id] = graded.response;
      }
    }
    this._evaluated = true;
    this._result = await this.constructor.score(this._data, this.getResponse());
    this.requestUpdate();
    return this._result;
  }

  /** Grades one item without a live mounted child — same
   *  create/init/setState/evaluate/getResponse sequence TestEngine's own
   *  headless top-level regrade (`_computeResults()`) uses, just scoped to
   *  one nested item instead of a whole test question. Needed because a
   *  type like semantic-descriptive@1/@2 does its real grading work inside
   *  evaluate() (an async embedding-similarity pass), not inside static
   *  score() — calling static score() alone on a never-evaluated response
   *  silently scores it as unanswered even when the underlying answer text
   *  was fully correct. Degrades to the last-known (possibly ungraded)
   *  state rather than throwing, same "degrade, don't crash" spirit as
   *  static score()'s own catch. */
  /** Returns `{ state, response }` — both shapes, never conflated (see
   *  evaluate()'s doc comment). `state` is what a later live mount restores
   *  via setState(); `response` is what feeds static score(). */
  async _headlessEvaluateItem(item) {
    const savedState = this._itemState[item.id] ?? null;
    const fallback = { state: savedState, response: this._itemResponseCache[item.id] ?? null };
    const childType = item.question?.type;
    if (!childType) return fallback;
    try {
      await QuestionRegistry.loadPlugin(childType);
      const tempEl = document.createElement(resolveTagName(childType));
      if (typeof tempEl.init !== 'function') return fallback;
      const questionData = this._childQuestionData(item);
      const initResult = tempEl.init(questionData, this._prng, this._ctx);
      if (initResult instanceof Promise) await initResult;
      if (savedState != null && typeof tempEl.setState === 'function') tempEl.setState(savedState);
      if (typeof tempEl.evaluate === 'function') await tempEl.evaluate();
      return {
        state: typeof tempEl.getState === 'function' ? tempEl.getState() : savedState,
        response: typeof tempEl.getResponse === 'function' ? tempEl.getResponse() : fallback.response,
      };
    } catch {
      return fallback;
    }
  }

  render() {
    if (!this._data) return html``;
    const previewOnly = !!this._ctx?.previewOnly;
    return html`
      <div class="cs-passage">
        ${this._data.passageTitle ? html`<p class="cs-passage-title"><markdown-renderer inline .content=${resolveText(this._data.passageTitle)}></markdown-renderer></p>` : ''}
        <div class="cs-passage-body">
          <markdown-renderer .content=${resolveText(this._data.passage)}></markdown-renderer>
        </div>
      </div>
      <div class="cs-items">
        ${this._data.items.map((item, idx) => html`
          <div class="cs-item">
            <div class="cs-item-index">
              <span>Question ${idx + 1}</span>
              ${!previewOnly && this._evaluated ? this._renderItemScoreBadge(item) : ''}
            </div>
            <div id="cs-host-${item.id}"></div>
          </div>
        `)}
      </div>
      ${!previewOnly && this._evaluated ? html`
        <div class="cs-summary">${this._result?.feedback || ''}</div>
      ` : ''}
    `;
  }

  /** One item's own earned/max marks, at the same granularity as
   *  TestSession's top-level per-question score badge — lets a scoring bug
   *  in one specific sub-item type be spotted right next to that item. */
  _renderItemScoreBadge(item) {
    const r = this._result?.perItem?.[item.id];
    if (!r) return '';
    const weight = typeof r.weight === 'number' ? r.weight : 1;
    const earned = (r.score || 0) * weight;
    const bucket = r.isCorrect ? 'correct' : (r.score > 0 ? 'partial' : 'wrong');
    return html`<span class="cs-item-score ${bucket}">${formatOneDecimal(earned)} / ${formatOneDecimal(weight)}</span>`;
  }
}

customElements.define('comprehension-set-v1', ComprehensionSet);
