import { brandIcon } from './LookSlots.js';
import { LitElement, html, css } from 'lit';
import { PracticeTestBuilder } from '../../core/PracticeTestBuilder.js';
import { gradeLabel } from '../../core/gradeLabel.js';
import { mountOrphanPreview } from '../../core/preview/mountOrphanPreview.js';
import { LookMixin } from '../../core/mixins/LookMixin.js';
import { iconClose } from '../icons/uiIcons.js';

const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'olympiad'];
const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard', olympiad: 'Olympiad' };

const STEP_LABELS = {
  basics: 'Name & mode',
  banks: 'Question banks',
  dedup: 'Avoid duplicates',
  types: 'Question types',
  duration: 'Duration',
  topics: 'Topics (optional)',
  difficulty: 'Difficulty',
  review: 'Review & confirm',
};

/** Strips a plugin type's `@version` suffix and turns
 *  `mcq-single`/`fill-blank` into a readable "MCQ Single"/"Fill Blank" for
 *  the tree's type-level grouping — never surfaced anywhere authoritative,
 *  purely a display label. */
function humanizeType(type) {
  if (!type) return 'Question';
  const base = String(type).split('@')[0];
  return base
    .split(/[-_]/g)
    .map((w) => (w.toLowerCase() === 'mcq' ? 'MCQ' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Minimal CSS.escape fallback for building a DOM id from a ref that may
 *  contain slashes/colons — avoids a getElementById mismatch, not a security
 *  boundary (this id never round-trips through a selector query). */
function cssEscape(str) {
  return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Practice-test creation wizard — launched only from ParentDashboard's
 * Practice Tests card (never from the student portal, see CLAUDE.md's
 * "delete practice tests only from parent area" precedent extended here to
 * creation too). Both modes share a "banks" step right after basics — e.g.
 * a half-yearly exam's syllabus spans several chapters, each authored as
 * its own bank, so the parent checks every bank in scope before either mode
 * builds its pool (`PracticeTestBuilder.loadQuestionPool()`) from just the
 * selected banks, not every bank ever published. A conditional "dedup" step
 * follows (skipped when the profile has no other saved practice tests):
 * checking an existing test there excludes its questions from this pool,
 * via bundleId+ref (`PracticeTestBuilder.excludeUsedQuestions()`) — the
 * "three one-hour half-yearly practice tests that shouldn't repeat a
 * question" use case. A "types" step then lets the parent uncheck whole
 * question types (e.g. Semantic Descriptive, Match Categorize) to drop them
 * from the pool entirely — every type present is checked by default. From
 * there the two modes converge on the same review/override screen:
 *
 *   "Build it for me" (default): duration -> optional topic filter ->
 *   difficulty levels to include -> review screen, pre-selected by
 *   PracticeTestBuilder.autoSample()'s topic-balanced round-robin sampling
 *   of the filtered pool.
 *
 *   "Pick questions myself": straight to the same review screen, nothing
 *   pre-selected, browsing the full pool grouped by topic then question
 *   type (collapsible, with a preview per question).
 *
 * Either mode's review screen also offers a "quick select" bulk toggle
 * (difficulty + type, applied across every topic at once — e.g. "every easy
 * MCQ") so a parent can override the topic-balanced suggestion, or hand-pick
 * quickly, without expanding every topic node one at a time.
 *
 * All pool loading/filtering/sampling logic lives in PracticeTestBuilder.js
 * (invariant 8) — this component only renders wizard state and the
 * resulting tree.
 */
export class PracticeTestWizard extends LookMixin(LitElement) {
  static styles = css`
    :host { display: contents; }
    /* display:flex must stay scoped to [open] — an unconditional
       "display: flex" here would outrank the UA stylesheet's
       "dialog:not([open]) { display: none }" rule (author origin beats
       user-agent origin at equal specificity), making the dialog render
       inline on every page load instead of staying hidden until
       showModal() sets "open". */
    dialog.wizard-dialog {
      margin: auto;
      padding: 0;
      border: 1px solid var(--border-hover, #334155);
      border-radius: 16px;
      background: var(--bg-surface, #131b2e);
      color: var(--text-main, #f8fafc);
      width: 92vw;
      max-width: 680px;
      max-height: 88vh;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
    }
    dialog.wizard-dialog[open] {
      display: flex;
      flex-direction: column;
    }
    dialog.wizard-dialog::backdrop {
      background: rgba(9, 13, 22, 0.72);
    }
    .wizard-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.25rem 1.5rem 1rem;
      border-bottom: 1px solid var(--border-hover, #334155);
    }
    .wizard-header h2 {
      margin: 0 0 0.25rem 0;
      font-size: 1.25rem;
      font-weight: var(--fw-heavy);
      color: var(--text-main, #f8fafc);
    }
    .step-indicator {
      font-size: 0.78rem;
      font-weight: var(--fw-medium);
      color: var(--text-muted, #94a3b8);
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .icon-close {
      background: transparent;
      border: none;
      color: var(--text-muted, #94a3b8);
      font-size: 1.1rem;
      cursor: pointer;
      line-height: 1;
      padding: 4px;
    }
    .icon-close:hover { color: var(--text-main, #f8fafc); }
    /* plain: a serif title over a small-caps step line, an icon close. */
    :host([data-look="plain"]) dialog.wizard-dialog { border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); }
    :host([data-look="plain"]) dialog.wizard-dialog::backdrop { background: var(--scrim); }
    :host([data-look="plain"]) button { font-family: inherit; }
    :host([data-look="plain"]) .wizard-header h2 { font-family: var(--font-heading); font-weight: var(--heading-weight); }
    :host([data-look="plain"]) .step-indicator { font-weight: 600; letter-spacing: var(--kicker-tracking, 0.1em); color: var(--card-kicker, var(--text-muted)); }
    :host([data-look="plain"]) .icon-close { display: grid; place-items: center; border-radius: var(--radius-sm); }
    :host([data-look="plain"]) .icon-close:focus-visible { outline: var(--focus-ring); }

    .wizard-body {
      padding: 1.25rem 1.5rem;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .wizard-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      border-top: 1px solid var(--border-hover, #334155);
    }

    .btn-flat, .btn-primary, .link-btn {
      font-family: inherit;
      cursor: pointer;
    }
    .btn-flat {
      background: transparent;
      border: 1px solid var(--border-hover, #334155);
      color: var(--text-main, #f8fafc);
      padding: 8px 16px;
      border-radius: 10px;
      font-weight: var(--fw-medium);
      font-size: 0.9rem;
    }
    .btn-flat:hover { background: var(--bg-panel, #1e293b); }
    .btn-primary {
      background: var(--primary-color, #6366f1);
      border: none;
      color: #ffffff;
      padding: 8px 18px;
      border-radius: 10px;
      font-weight: var(--fw-strong);
      font-size: 0.9rem;
    }
    .btn-primary:hover:not(:disabled) { background: var(--primary-hover, #4f46e5); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .field { display: flex; flex-direction: column; gap: 0.4rem; }
    .field > span:first-child { font-weight: var(--fw-strong); font-size: 0.9rem; }
    .field input[type="text"], .field input[type="number"] {
      font: inherit;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--border-hover, #334155);
      background: var(--bg-panel, #1e293b);
      color: var(--text-main, #f8fafc);
    }
    .hint { margin: 0; font-size: 0.85rem; color: var(--text-muted, #94a3b8); line-height: 1.4; }

    .error-banner {
      background: var(--error-bg);
      color: var(--error-text);
      border-radius: 10px;
      padding: 0.75rem 1rem;
      font-size: 0.88rem;
    }
    .empty-tree {
      text-align: center;
      padding: 1.5rem 1rem;
      color: var(--text-muted, #94a3b8);
      font-style: italic;
    }

    .mode-toggle {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    @media (max-width: 480px) {
      .mode-toggle { grid-template-columns: 1fr; }
    }
    .mode-btn {
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      padding: 0.9rem 1rem;
      border-radius: 12px;
      border: 2px solid var(--border-hover, #334155);
      background: var(--bg-panel, #1e293b);
      color: var(--text-main, #f8fafc);
      cursor: pointer;
    }
    .mode-btn strong { font-size: 0.92rem; }
    .mode-btn span { font-size: 0.8rem; color: var(--text-muted, #94a3b8); }
    .mode-btn[aria-selected="true"] {
      border-color: var(--primary-color, #6366f1);
      background: var(--primary-light, #1e1b4b);
    }

    .topic-source { display: flex; flex-direction: column; gap: 0.4rem; }
    .topic-source-title { font-weight: var(--fw-strong); font-size: 0.85rem; color: var(--text-muted, #94a3b8); }
    .topic-picker, .difficulty-picker { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .chip {
      border: 1px solid var(--border-hover, #334155);
      border-radius: 999px;
      background: var(--bg-panel, #1e293b);
      color: var(--text-main, #f8fafc);
      padding: 6px 14px;
      font-weight: var(--fw-medium);
      font-size: 0.82rem;
      cursor: pointer;
    }
    .chip[aria-pressed="true"] {
      background: var(--primary-light, #1e1b4b);
      border-color: var(--primary-color, #6366f1);
      color: var(--primary-text, #818cf8);
    }
    .difficulty-check {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid var(--border-hover, #334155);
      font-weight: var(--fw-strong);
      font-size: 0.82rem;
      cursor: pointer;
    }
    .difficulty-easy { color: var(--success-text); }
    .difficulty-medium { color: var(--warn-text); }
    .difficulty-hard, .difficulty-olympiad { color: var(--error-text); }

    .review-summary {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: var(--fw-strong);
      font-size: 0.92rem;
      background: var(--bg-panel, #1e293b);
      border-radius: 10px;
      padding: 0.6rem 1rem;
    }

    .tree-toolbar { display: flex; gap: 1rem; }
    .link-btn {
      background: none;
      border: none;
      color: var(--primary-text, #818cf8);
      font-weight: var(--fw-strong);
      font-size: 0.8rem;
      padding: 0;
    }
    .link-btn:hover { text-decoration: underline; }

    .tree { display: flex; flex-direction: column; gap: 0.4rem; }
    .tree-node { border: 1px solid var(--border-color, #1e293b); border-radius: 10px; overflow: hidden; }
    .tree-row {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.65rem 0.85rem;
      background: var(--bg-panel, #1e293b);
      border: none;
      color: var(--text-main, #f8fafc);
      cursor: pointer;
      font-weight: var(--fw-strong);
      font-size: 0.88rem;
      text-align: left;
    }
    .chevron { display: inline-block; transition: transform 0.15s ease; color: var(--text-muted, #94a3b8); }
    .chevron.open { transform: rotate(90deg); }
    .tree-label { flex: 1; }
    .tree-badge {
      font-size: 0.75rem;
      font-weight: var(--fw-strong);
      color: var(--text-muted, #94a3b8);
      background: var(--bg-surface, #131b2e);
      border-radius: 999px;
      padding: 2px 10px;
    }
    .tree-children { padding: 0.5rem 0.5rem 0.5rem 1.5rem; display: flex; flex-direction: column; gap: 0.4rem; }
    .type-node .tree-row { background: transparent; font-weight: var(--fw-medium); font-size: 0.85rem; }

    .question-row {
      display: flex;
      align-items: flex-start;
      gap: 0.6rem;
      padding: 0.6rem 0.5rem;
      border-radius: 8px;
    }
    .question-row.selected { background: var(--primary-light, #1e1b4b); }
    .question-row input[type="checkbox"] { margin-top: 3px; }
    .q-meta { flex: 1; display: flex; flex-direction: column; gap: 0.3rem; }
    .q-tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag-pill {
      display: inline-flex;
      align-items: center;
      font-size: 0.7rem;
      font-weight: var(--fw-strong);
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--bg-surface, #131b2e);
      color: var(--text-muted, #94a3b8);
      text-transform: capitalize;
    }
    .preview-host {
      margin-top: 0.4rem;
      border: 1px dashed var(--border-hover, #334155);
      border-radius: 8px;
      padding: 0.6rem;
    }

    .quick-select {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 0.7rem;
      border-radius: 10px;
      background: var(--bg-panel, #1e293b);
      border: 1px solid var(--border-hover, #334155);
    }
    .quick-select-label { font-weight: var(--fw-strong); font-size: 0.82rem; color: var(--text-muted, #94a3b8); }
    .quick-select select {
      font: inherit;
      font-size: 0.85rem;
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid var(--border-hover, #334155);
      background: var(--bg-surface, #131b2e);
      color: var(--text-main, #f8fafc);
    }
    .quick-select .btn-flat { padding: 6px 12px; font-size: 0.82rem; }
  `;

  static properties = {
    profileId: { type: String },
    _step: { state: true },
    _mode: { state: true },
    _title: { state: true },
    _loading: { state: true },
    _banks: { state: true },
    _selectedBankPaths: { state: true },
    _existingTests: { state: true },
    _excludeTestIds: { state: true },
    _selectedTypes: { state: true },
    _pool: { state: true },
    _durationMinutes: { state: true },
    _selectedTopicIds: { state: true },
    _selectedDifficulties: { state: true },
    _chosenKeys: { state: true },
    _expanded: { state: true },
    _previewKey: { state: true },
    _quickDifficulty: { state: true },
    _quickType: { state: true },
    _error: { state: true },
    _saving: { state: true },
  };

  constructor() {
    super();
    this.profileId = '';
    this._resetState();
  }

  _resetState() {
    this._step = 'basics';
    this._mode = 'auto';
    this._title = '';
    this._loading = false;
    this._banks = [];
    this._selectedBankPaths = new Set();
    this._existingTests = [];
    this._excludeTestIds = new Set();
    this._selectedTypes = new Set();
    this._pool = [];
    this._durationMinutes = 20;
    this._selectedTopicIds = new Set();
    this._selectedDifficulties = new Set();
    this._chosenKeys = new Set();
    this._expanded = new Set();
    this._previewKey = null;
    this._quickDifficulty = '';
    this._quickType = '';
    this._error = null;
    this._saving = false;
  }

  firstUpdated() {
    this._dialog = this.shadowRoot.querySelector('dialog');
  }

  /** Public entry point — ParentDashboard calls this to launch the wizard.
   *  Resets all wizard state first, so a second creation in the same
   *  session doesn't inherit the previous one's picks. Only the bank
   *  catalog and this profile's other saved tests are loaded here — the
   *  question pool itself waits for the "banks" step (see
   *  _loadPoolForSelectedBanks()) since it depends on which banks the
   *  parent actually checks. */
  async openWizard() {
    this._resetState();
    await this.updateComplete;
    this._dialog.showModal();
    this._loading = true;
    try {
      const [banks, existingTests] = await Promise.all([
        PracticeTestBuilder.listAvailableBanks(),
        PracticeTestBuilder.listPracticeTests(this.profileId),
      ]);
      this._banks = banks;
      this._existingTests = existingTests;
      // Default to everything in scope — a parent who wants the whole
      // catalog (the old, only, behavior) never has to touch this step.
      this._selectedBankPaths = new Set(this._banks.filter((b) => !b._unreachable).map((b) => b.path));
    } catch (e) {
      this._error = `Could not load question banks: ${e.message}`;
    } finally {
      this._loading = false;
    }
  }

  _close() {
    this._dialog?.close();
  }

  _toggleBank(path) {
    const next = new Set(this._selectedBankPaths);
    if (next.has(path)) next.delete(path); else next.add(path);
    this._selectedBankPaths = next;
  }

  _toggleExcludeTest(practiceTestId) {
    const next = new Set(this._excludeTestIds);
    if (next.has(practiceTestId)) next.delete(practiceTestId); else next.add(practiceTestId);
    this._excludeTestIds = next;
  }

  /** Builds the question pool from just the checked banks — called when
   *  leaving the "banks" step (see _goNext()). Resets every downstream
   *  selection (topic/difficulty filters, chosen questions) since they were
   *  computed against whatever pool existed before, which may no longer
   *  match. */
  async _loadPoolForSelectedBanks() {
    const selected = this._banks.filter((b) => !b._unreachable && this._selectedBankPaths.has(b.path));
    this._loading = true;
    try {
      this._pool = await PracticeTestBuilder.loadQuestionPool(selected);
    } catch (e) {
      this._error = `Could not load the selected question banks: ${e.message}`;
      this._pool = [];
    } finally {
      this._loading = false;
    }
    this._resetDownstreamSelections();
  }

  /** Shared by both step transitions that change what the pool contains
   *  (leaving "banks", leaving "dedup") — every filter/pick made against the
   *  old pool shape is stale once it changes. Resets `_selectedTypes` first
   *  (to every type in `_scopedPool`) since `_availableDifficulties` below
   *  reads through `_typeScopedPool`, which depends on it. */
  _resetDownstreamSelections() {
    this._selectedTopicIds = new Set();
    this._selectedTypes = new Set(this._availableTypes);
    this._selectedDifficulties = new Set(this._availableDifficulties);
    this._chosenKeys = new Set();
    this._expanded = new Set();
    this._previewKey = null;
    this._quickDifficulty = '';
    this._quickType = '';
  }

  /** `bundleId::ref` set for every existing practice test the parent checked
   *  on the "dedup" step — see PracticeTestBuilder.collectUsedQuestionKeys(). */
  get _excludedKeys() {
    const rows = this._existingTests.filter((t) => this._excludeTestIds.has(t.practiceTestId));
    return PracticeTestBuilder.collectUsedQuestionKeys(rows);
  }

  /** The bank-selected pool (this._pool) with any checked-off existing
   *  test's questions removed — feeds into `_typeScopedPool` below, which is
   *  what duration/topic/difficulty/review actually operate over. */
  get _scopedPool() {
    return PracticeTestBuilder.excludeUsedQuestions(this._pool, this._excludedKeys);
  }

  /** Every question type present in the bank+dedup-scoped pool — the
   *  checklist the "types" step renders (independent of the current
   *  `_selectedTypes` choice, unlike `_typeScopedPool` below). */
  get _availableTypes() {
    return [...new Set(this._scopedPool.map((q) => q.type))].sort();
  }

  /** `_scopedPool` with any unchecked-on-the-"types"-step question types
   *  removed — duration/topics/difficulty/review all operate over this,
   *  same role `_scopedPool` plays for bank+dedup scoping. */
  get _typeScopedPool() {
    return this._scopedPool.filter((q) => this._selectedTypes.has(q.type));
  }

  get _availableDifficulties() {
    const present = new Set(this._typeScopedPool.map((q) => q.difficulty).filter(Boolean));
    return DIFFICULTY_ORDER.filter((lvl) => present.has(lvl));
  }

  get _steps() {
    const dedup = this._existingTests.length ? ['dedup'] : [];
    return this._mode === 'auto'
      ? ['basics', 'banks', ...dedup, 'types', 'duration', 'topics', 'difficulty', 'review']
      : ['basics', 'banks', ...dedup, 'types', 'review'];
  }

  get _stepIndex() {
    return this._steps.indexOf(this._step);
  }

  get _nextDisabled() {
    if (this._loading) return true;
    if (this._step === 'basics') return !this._banks.filter((b) => !b._unreachable).length;
    if (this._step === 'banks') return !this._selectedBankPaths.size;
    if (this._step === 'dedup') return this._scopedPool.length === 0;
    if (this._step === 'types') return !this._selectedTypes.size;
    return false;
  }

  get _filteredPoolForAuto() {
    return PracticeTestBuilder.filterPool(this._typeScopedPool, {
      topicIds: [...this._selectedTopicIds],
      difficultyLevels: [...this._selectedDifficulties],
    });
  }

  /** The pool the review screen (both modes) actually browses/samples from —
   *  factored out so the "quick select" bulk toggle can match against the
   *  same set the tree renders, regardless of mode. */
  get _reviewPool() {
    return this._mode === 'auto' ? this._filteredPoolForAuto : this._typeScopedPool;
  }

  async _goNext() {
    const steps = this._steps;
    const next = steps[steps.indexOf(this._step) + 1];
    if (!next) return;
    if (this._step === 'banks') await this._loadPoolForSelectedBanks();
    if (this._step === 'dedup') this._resetDownstreamSelections();
    if (next === 'review') this._enterReview();
    this._step = next;
  }

  _goBack() {
    const steps = this._steps;
    const prev = steps[steps.indexOf(this._step) - 1];
    if (!prev) return;
    this._step = prev;
  }

  /** Computes the "build it for me" suggestion when the wizard first
   *  reaches the review screen. "Pick questions myself" leaves
   *  _chosenKeys untouched (empty on first entry) since there's nothing to
   *  suggest — the parent picks everything by hand. */
  _enterReview() {
    if (this._mode !== 'auto') return;
    const filtered = this._filteredPoolForAuto;
    const selected = PracticeTestBuilder.autoSample(filtered, { durationMinutes: this._durationMinutes });
    this._chosenKeys = new Set(selected.map((q) => q.key));
  }

  _toggleTopicId(id) {
    const next = new Set(this._selectedTopicIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    this._selectedTopicIds = next;
  }

  /** At least one difficulty level must stay selected — an empty set would
   *  be ambiguous between "match nothing" and "no restriction" (see
   *  PracticeTestBuilder.filterPool's doc comment), so the UI simply never
   *  allows reaching it. */
  _toggleDifficulty(lvl) {
    const next = new Set(this._selectedDifficulties);
    if (next.has(lvl)) {
      if (next.size === 1) return;
      next.delete(lvl);
    } else {
      next.add(lvl);
    }
    this._selectedDifficulties = next;
  }

  /** At least one type must stay selected — same "empty set is ambiguous"
   *  reasoning as _toggleDifficulty(). */
  _toggleType(type) {
    const next = new Set(this._selectedTypes);
    if (next.has(type)) {
      if (next.size === 1) return;
      next.delete(type);
    } else {
      next.add(type);
    }
    this._selectedTypes = next;
  }

  _toggleChosen(key) {
    const next = new Set(this._chosenKeys);
    if (next.has(key)) next.delete(key); else next.add(key);
    this._chosenKeys = next;
  }

  /** Bulk add/remove every review-pool question matching the chosen
   *  difficulty/type — e.g. "every easy MCQ across every topic" — so a
   *  parent can override the auto-suggested (or empty, in manual mode) mix
   *  without expanding each topic node and checking boxes one at a time.
   *  An empty filter value means "any", matching filterPool()'s own
   *  convention. */
  _quickSelect(add) {
    const matches = this._reviewPool.filter((q) =>
      (!this._quickDifficulty || q.difficulty === this._quickDifficulty) &&
      (!this._quickType || q.type === this._quickType)
    );
    if (!matches.length) return;
    const next = new Set(this._chosenKeys);
    for (const q of matches) { if (add) next.add(q.key); else next.delete(q.key); }
    this._chosenKeys = next;
  }

  _groupPool(pool) {
    const topics = new Map();
    for (const q of pool) {
      const topicKey = q.topicId || '__untagged__';
      if (!topics.has(topicKey)) {
        topics.set(topicKey, { topicKey, topicLabel: q.topicLabel || 'Untagged', types: new Map(), count: 0 });
      }
      const topicGroup = topics.get(topicKey);
      topicGroup.count += 1;
      if (!topicGroup.types.has(q.type)) {
        topicGroup.types.set(q.type, { typeKey: q.type, typeLabel: humanizeType(q.type), items: [] });
      }
      topicGroup.types.get(q.type).items.push(q);
    }
    return [...topics.values()]
      .sort((a, b) => a.topicLabel.localeCompare(b.topicLabel))
      .map((g) => ({ ...g, types: [...g.types.values()].sort((a, b) => a.typeLabel.localeCompare(b.typeLabel)) }));
  }

  _toggleGroup(key) {
    const next = new Set(this._expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    this._expanded = next;
  }

  _expandAll(pool) {
    const groups = this._groupPool(pool);
    const keys = new Set();
    for (const g of groups) {
      keys.add(g.topicKey);
      for (const t of g.types) keys.add(`${g.topicKey}::${t.typeKey}`);
    }
    this._expanded = keys;
  }

  _collapseAll() {
    this._expanded = new Set();
  }

  async _togglePreview(q) {
    if (this._previewKey === q.key) {
      this._previewKey = null;
      return;
    }
    this._previewKey = q.key;
    await this.updateComplete;
    const host = this.shadowRoot.getElementById(`preview-${cssEscape(q.key)}`);
    if (!host) return;
    try {
      const data = await PracticeTestBuilder.loadQuestionDetail(q.ref, q.bundleId);
      // previewOnly: this is a "should I include this question?" bank
      // browse, not the real interactive experience — no answer input,
      // hints, or grading-only heavy work (e.g. semantic-descriptive's
      // embedding model) needed just to see what's being asked.
      await mountOrphanPreview(data, host, { bundleId: q.bundleId, previewOnly: true });
    } catch (e) {
      host.textContent = `Could not load preview: ${e.message}`;
    }
  }

  async _save() {
    this._error = null;
    if (!this._chosenKeys.size) {
      this._error = 'Pick at least one question first.';
      return;
    }
    this._saving = true;
    try {
      const poolByKey = new Map(this._pool.map((q) => [q.key, q]));
      const chosenEntries = [...this._chosenKeys].map((k) => poolByKey.get(k)).filter(Boolean);
      const title = { en: this._title.trim() || 'Practice Test' };
      // `bankItems` here matches docs/data-model.md §14's documented
      // criteria shape — kept minimal (just enough to re-run
      // loadQuestionPool()) rather than the full listAvailableBanks() rows.
      const bankItems = this._banks
        .filter((b) => this._selectedBankPaths.has(b.path))
        .map((b) => ({ path: b.path, _remoteSource: b._remoteSource, title: b.title }));
      const criteria = this._mode === 'auto' ? {
        bankItems,
        durationMinutes: this._durationMinutes,
        topicIds: [...this._selectedTopicIds],
        difficultyLevels: [...this._selectedDifficulties],
        typeIds: [...this._selectedTypes],
      } : null;
      const definition = PracticeTestBuilder.buildDefinition({
        title,
        source: this._mode,
        criteria,
        durationMinutes: this._mode === 'auto' ? this._durationMinutes : null,
        chosenEntries,
      });
      const row = await PracticeTestBuilder.savePracticeTest(this.profileId, definition);
      this.dispatchEvent(new CustomEvent('practice-test-created', { detail: row, bubbles: true, composed: true }));
      this._close();
    } catch (e) {
      this._error = `Could not save the practice test: ${e.message}`;
    } finally {
      this._saving = false;
    }
  }

  render() {
    return html`
      <dialog class="wizard-dialog">
        <header class="wizard-header">
          <div>
            <h2>Create Practice Test</h2>
            <div class="step-indicator">Step ${this._stepIndex + 1} of ${this._steps.length} · ${STEP_LABELS[this._step]}</div>
          </div>
          <button type="button" class="icon-close" @click=${this._close} aria-label="Close">${this.look === 'plain' ? iconClose : '✕'}</button>
        </header>
        <div class="wizard-body">
          ${this._error ? html`<div class="error-banner">${this._error}</div>` : ''}
          ${this._loading ? html`<app-loader size="48" label="Loading question banks…"></app-loader>` : this._renderStepBody()}
        </div>
        <footer class="wizard-footer">
          ${this._stepIndex > 0 ? html`<button type="button" class="btn-flat" @click=${this._goBack}>Back</button>` : html`<span></span>`}
          ${this._step === 'review' ? html`
            <button type="button" class="btn-primary" ?disabled=${this._saving || !this._chosenKeys.size} @click=${this._save}>
              ${this._saving ? 'Saving…' : `Save Practice Test (${this._chosenKeys.size})`}
            </button>
          ` : html`
            <button type="button" class="btn-primary" ?disabled=${this._nextDisabled} @click=${this._goNext}>Next</button>
          `}
        </footer>
      </dialog>
    `;
  }

  _renderStepBody() {
    switch (this._step) {
      case 'basics': return this._renderBasicsStep();
      case 'banks': return this._renderBanksStep();
      case 'dedup': return this._renderDedupStep();
      case 'types': return this._renderTypesStep();
      case 'duration': return this._renderDurationStep();
      case 'topics': return this._renderTopicsStep();
      case 'difficulty': return this._renderDifficultyStep();
      case 'review': return this._renderReviewStep();
      default: return '';
    }
  }

  _renderBasicsStep() {
    return html`
      <label class="field">
        <span>Practice test name</span>
        <input type="text" .value=${this._title} placeholder="e.g. Cells — Friday Practice"
          @input=${(e) => { this._title = e.target.value; }}>
      </label>
      <div class="field">
        <span>How should we pick the questions?</span>
        <div class="mode-toggle" role="tablist">
          <button type="button" class="mode-btn" role="tab" aria-selected=${this._mode === 'auto'}
            @click=${() => { this._mode = 'auto'; }}>
            <strong>${brandIcon('sparkle')} Build it for me</strong>
            <span>Set a duration and difficulty — we pick the questions</span>
          </button>
          <button type="button" class="mode-btn" role="tab" aria-selected=${this._mode === 'manual'}
            @click=${() => { this._mode = 'manual'; }}>
            <strong>${brandIcon('pen')} Pick questions myself</strong>
            <span>Browse every question by topic and choose exactly which ones</span>
          </button>
        </div>
      </div>
      ${!this._loading && !this._banks.filter((b) => !b._unreachable).length ? html`
        <div class="empty-tree">No question banks are available yet. Check back once a course adds one.</div>
      ` : ''}
    `;
  }

  /** e.g. a half-yearly's syllabus spans several chapters, each its own
   *  bank — this is where a parent scopes the pool to exactly those before
   *  either wizard mode samples/browses it. Defaults to everything checked
   *  (see openWizard()), so a parent who wants the full catalog can just
   *  click through. */
  _renderBanksStep() {
    const reachable = this._banks.filter((b) => !b._unreachable);
    const unreachableCount = this._banks.length - reachable.length;
    if (!reachable.length) {
      return html`<div class="empty-tree">No question banks are available yet. Check back once a course adds one.</div>`;
    }
    return html`
      <p class="hint">Choose which question banks are in scope for this test — e.g. check every chapter covered by an upcoming half-yearly exam. Leave everything checked to draw from all available banks.</p>
      <div class="tree-toolbar">
        <button type="button" class="link-btn" @click=${() => { this._selectedBankPaths = new Set(reachable.map((b) => b.path)); }}>Select all</button>
        <button type="button" class="link-btn" @click=${() => { this._selectedBankPaths = new Set(); }}>Select none</button>
      </div>
      <div class="tree">
        ${reachable.map((b) => this._renderBankRow(b))}
      </div>
      ${unreachableCount ? html`
        <p class="hint">${unreachableCount} bank${unreachableCount === 1 ? '' : 's'} could not be reached and ${unreachableCount === 1 ? 'is' : 'are'} excluded from selection.</p>
      ` : ''}
    `;
  }

  _renderBankRow(b) {
    const checked = this._selectedBankPaths.has(b.path);
    return html`
      <label class="question-row ${checked ? 'selected' : ''}">
        <input type="checkbox" ?checked=${checked} @change=${() => this._toggleBank(b.path)} aria-label="Include this question bank">
        <div class="q-meta">
          <strong>${b.title?.en || b.title || b.path}</strong>
          <div class="q-tags">
            ${b.subject ? html`<span class="tag-pill">${b.subject}</span>` : ''}
            ${gradeLabel(b.grade) ? html`<span class="tag-pill">${gradeLabel(b.grade)}</span>` : ''}
            ${(b.chapterLabels || []).map((c) => html`<span class="tag-pill">${c}</span>`)}
            <span class="tag-pill">${b.questionCount} question${b.questionCount === 1 ? '' : 's'}</span>
          </div>
        </div>
      </label>
    `;
  }

  /** Only reachable when the profile has other saved practice tests (see
   *  the `dedup` entry in _steps) — nothing to dedupe against on a
   *  profile's very first test. */
  _renderDedupStep() {
    const excludedCount = this._pool.length - this._scopedPool.length;
    return html`
      <p class="hint">Check any existing practice tests whose questions should be kept out of this one — handy when building several tests from the same banks (e.g. three one-hour half-yearly practice tests) that shouldn't repeat a question.</p>
      <div class="tree">
        ${this._existingTests.map((t) => this._renderExistingTestRow(t))}
      </div>
      ${excludedCount ? html`
        <p class="hint">${excludedCount} question${excludedCount === 1 ? '' : 's'} already used by the checked test${this._excludeTestIds.size === 1 ? '' : 's'} will be excluded.</p>
      ` : ''}
      ${this._scopedPool.length === 0 ? html`
        <div class="error-banner">Every question in the selected banks is already used by the tests checked above. Uncheck one, or go back and select more/different banks.</div>
      ` : ''}
    `;
  }

  _renderExistingTestRow(t) {
    const checked = this._excludeTestIds.has(t.practiceTestId);
    const count = (t.questions || []).length;
    return html`
      <label class="question-row ${checked ? 'selected' : ''}">
        <input type="checkbox" ?checked=${checked} @change=${() => this._toggleExcludeTest(t.practiceTestId)} aria-label="Avoid duplicating questions from this test">
        <div class="q-meta">
          <strong>${t.title?.en || t.title || 'Practice Test'}</strong>
          <div class="q-tags">
            <span class="tag-pill">${count} question${count === 1 ? '' : 's'}</span>
          </div>
        </div>
      </label>
    `;
  }

  /** e.g. a parent building a test that skips Semantic Descriptive or
   *  Match Categorize entirely — unchecking a type here drops it from the
   *  pool for both wizard modes, not just the review screen's own per-type
   *  "quick select" override. Every type present is checked by default. */
  _renderTypesStep() {
    const available = this._availableTypes;
    return html`
      <p class="hint">Choose which question types to include — e.g. uncheck Semantic Descriptive or Match Categorize to leave them out entirely. Leave everything checked to include all of them.</p>
      <div class="tree-toolbar">
        <button type="button" class="link-btn" @click=${() => { this._selectedTypes = new Set(available); }}>Select all</button>
      </div>
      <div class="difficulty-picker">
        ${available.map((t) => html`
          <label class="difficulty-check">
            <input type="checkbox" ?checked=${this._selectedTypes.has(t)}
              @change=${() => this._toggleType(t)}>
            ${humanizeType(t)}
          </label>
        `)}
      </div>
      ${!available.length ? html`<div class="empty-tree">No questions available to filter by type.</div>` : ''}
    `;
  }

  _renderDurationStep() {
    return html`
      <label class="field">
        <span>Target duration (minutes)</span>
        <input type="number" min="5" step="5" .value=${String(this._durationMinutes)}
          @input=${(e) => { this._durationMinutes = Number(e.target.value) || 0; }}>
      </label>
      <p class="hint">We'll sample questions until roughly this much time is used, based on each question's estimated time. You can still add or remove individual questions on the review screen.</p>
    `;
  }

  _renderTopicsStep() {
    const bySource = new Map();
    for (const q of this._typeScopedPool) {
      if (!q.topicId) continue;
      const src = (q.bankTitle && (q.bankTitle.en || q.bankTitle)) || q.bankPath;
      if (!bySource.has(src)) bySource.set(src, new Map());
      bySource.get(src).set(q.topicId, q.topicLabel || q.topicId);
    }
    if (!bySource.size) {
      return html`<p class="hint">None of the available questions are tagged with a topic — continue to the next step.</p>`;
    }
    return html`
      <p class="hint">Optional — narrow the pool to specific topics. Leave everything unchecked to draw from all topics.</p>
      ${[...bySource.entries()].map(([src, topicsMap]) => html`
        <div class="topic-source">
          <div class="topic-source-title">${src}</div>
          <div class="topic-picker">
            ${[...topicsMap.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([topicId, label]) => html`
              <button type="button" class="chip" aria-pressed=${this._selectedTopicIds.has(topicId)}
                @click=${() => this._toggleTopicId(topicId)}>${label}</button>
            `)}
          </div>
        </div>
      `)}
    `;
  }

  _renderDifficultyStep() {
    const topicFiltered = PracticeTestBuilder.filterPool(this._typeScopedPool, { topicIds: [...this._selectedTopicIds] });
    const available = DIFFICULTY_ORDER.filter((lvl) => topicFiltered.some((q) => q.difficulty === lvl));
    return html`
      <p class="hint">Choose which difficulty levels to include — e.g. keep only Easy + Medium for a gentler test. Leave everything checked to include all of them.</p>
      <div class="difficulty-picker">
        ${available.map((lvl) => html`
          <label class="difficulty-check difficulty-${lvl}">
            <input type="checkbox" ?checked=${this._selectedDifficulties.has(lvl)}
              @change=${() => this._toggleDifficulty(lvl)}>
            ${DIFFICULTY_LABELS[lvl]}
          </label>
        `)}
      </div>
      ${!available.length ? html`<div class="empty-tree">No questions with a difficulty tag match your topic filter.</div>` : ''}
    `;
  }

  _renderReviewStep() {
    const pool = this._reviewPool;
    const poolByKey = new Map(this._pool.map((q) => [q.key, q]));
    const chosenEntries = [...this._chosenKeys].map((k) => poolByKey.get(k)).filter(Boolean);
    const totalSec = chosenEntries.reduce((sum, q) => sum + (typeof q.estimatedTimeSec === 'number' && q.estimatedTimeSec > 0 ? q.estimatedTimeSec : 120), 0);
    return html`
      <div class="review-summary">
        <span>${this._chosenKeys.size} question${this._chosenKeys.size === 1 ? '' : 's'} selected</span>
        <span>~${chosenEntries.length ? Math.max(1, Math.round(totalSec / 60)) : 0} min</span>
      </div>
      <p class="hint">
        ${this._mode === 'auto'
          ? 'We pre-selected an even mix across topics to match your criteria — expand a topic below to check or uncheck anything, or use quick select below to override the mix in bulk.'
          : 'Expand a topic to browse its questions, grouped by type, or use quick select below to grab a whole slice at once. Preview a question before adding it.'}
      </p>
      ${this._renderQuickSelect(pool)}
      ${this._renderTree(pool)}
    `;
  }

  /** Bulk override for the topic-balanced suggestion (or a fast starting
   *  point in manual mode) — e.g. "every easy MCQ, across every topic" in
   *  two picks instead of expanding each topic node by hand. Difficulty/
   *  type options are limited to what's actually in the current review
   *  pool, so the dropdowns never offer a combination that matches nothing. */
  _renderQuickSelect(pool) {
    const difficulties = DIFFICULTY_ORDER.filter((lvl) => pool.some((q) => q.difficulty === lvl));
    const types = [...new Set(pool.map((q) => q.type))].sort();
    if (!difficulties.length && !types.length) return '';
    return html`
      <div class="quick-select">
        <span class="quick-select-label">Quick select:</span>
        <select .value=${this._quickDifficulty} @change=${(e) => { this._quickDifficulty = e.target.value; }} aria-label="Difficulty to quick-select">
          <option value="">Any difficulty</option>
          ${difficulties.map((lvl) => html`<option value=${lvl}>${DIFFICULTY_LABELS[lvl]}</option>`)}
        </select>
        <select .value=${this._quickType} @change=${(e) => { this._quickType = e.target.value; }} aria-label="Question type to quick-select">
          <option value="">Any type</option>
          ${types.map((t) => html`<option value=${t}>${humanizeType(t)}</option>`)}
        </select>
        <button type="button" class="btn-flat" @click=${() => this._quickSelect(true)}>Select matching</button>
        <button type="button" class="btn-flat" @click=${() => this._quickSelect(false)}>Deselect matching</button>
      </div>
    `;
  }

  _renderTree(pool) {
    const groups = this._groupPool(pool);
    if (!groups.length) {
      return html`<div class="empty-tree">No questions match these filters — try widening them.</div>`;
    }
    return html`
      <div class="tree-toolbar">
        <button type="button" class="link-btn" @click=${() => this._expandAll(pool)}>Expand all</button>
        <button type="button" class="link-btn" @click=${this._collapseAll}>Collapse all</button>
      </div>
      <div class="tree">
        ${groups.map((g) => this._renderTopicGroup(g))}
      </div>
    `;
  }

  _renderTopicGroup(g) {
    const expanded = this._expanded.has(g.topicKey);
    const selectedCount = g.types.reduce((n, t) => n + t.items.filter((q) => this._chosenKeys.has(q.key)).length, 0);
    return html`
      <div class="tree-node topic-node">
        <button type="button" class="tree-row" @click=${() => this._toggleGroup(g.topicKey)} aria-expanded=${expanded}>
          <span class="chevron ${expanded ? 'open' : ''}">▸</span>
          <span class="tree-label">${g.topicLabel}</span>
          <span class="tree-badge">${selectedCount}/${g.count}</span>
        </button>
        ${expanded ? html`
          <div class="tree-children">
            ${g.types.map((t) => this._renderTypeGroup(g, t))}
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderTypeGroup(g, t) {
    const groupKey = `${g.topicKey}::${t.typeKey}`;
    const expanded = this._expanded.has(groupKey);
    const selectedCount = t.items.filter((q) => this._chosenKeys.has(q.key)).length;
    return html`
      <div class="tree-node type-node">
        <button type="button" class="tree-row" @click=${() => this._toggleGroup(groupKey)} aria-expanded=${expanded}>
          <span class="chevron ${expanded ? 'open' : ''}">▸</span>
          <span class="tree-label">${t.typeLabel}</span>
          <span class="tree-badge">${selectedCount}/${t.items.length}</span>
        </button>
        ${expanded ? html`
          <div class="tree-children question-rows">
            ${t.items.map((q) => this._renderQuestionRow(q))}
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderQuestionRow(q) {
    const checked = this._chosenKeys.has(q.key);
    const previewing = this._previewKey === q.key;
    return html`
      <div class="question-row ${checked ? 'selected' : ''}">
        <input type="checkbox" ?checked=${checked} @change=${() => this._toggleChosen(q.key)} aria-label="Include this question">
        <div class="q-meta">
          <div class="q-tags">
            ${q.difficulty ? html`<span class="tag-pill difficulty-${q.difficulty}">${q.difficulty}</span>` : ''}
            ${q.estimatedTimeSec ? html`<span class="tag-pill">~${Math.max(1, Math.round(q.estimatedTimeSec / 60))} min</span>` : ''}
          </div>
          <button type="button" class="link-btn" @click=${() => this._togglePreview(q)}>
            ${previewing ? 'Hide preview' : 'Preview question'}
          </button>
          ${previewing ? html`<div class="preview-host" id="preview-${cssEscape(q.key)}"></div>` : ''}
        </div>
      </div>
    `;
  }
}
customElements.define('practice-test-wizard', PracticeTestWizard);
