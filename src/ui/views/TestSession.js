import { LitElement, html, css } from 'lit';
import { TestEngine } from '../../engines/test/TestEngine.js';
import { EventBus } from '../../core/EventBus.js';
import { ContentLoader } from '../../core/ContentLoader.js';
import { CourseSourceManager } from '../../core/CourseSourceManager.js';
import { LookManager } from '../../core/LookManager.js';
import { LookMixin } from '../../core/mixins/LookMixin.js';
import '../components/ProgressBar.js';
import '../components/ProgressRing.js';
import { brandCopy } from '../components/LookSlots.js';
import { CUES, emitCue } from '../../core/cues.js';
import { btn3dStyles } from '../sharedStyles.js';
import { showConfirm } from '../components/dialogs.js';

/**
 * A question's static score() reports either a binary `isCorrect` or, for
 * partial-credit types (match-categorize@1, statement-judgment@1 — see
 * their own `correct: null` convention), only a fractional `score`. Without
 * bucketing on `score` too, every partial-credit question's results chip
 * and "review what went wrong" quick-nav showed as flat-out wrong
 * regardless of how much credit it actually earned (`undefined
 * isCorrect` is falsy). `wrong`/`partial` are still both worth reviewing —
 * only a perfect score is excluded from that quick-nav.
 */
function verdictBucket(result) {
  if (!result) return 'wrong';
  if (typeof result.isCorrect === 'boolean') return result.isCorrect ? 'correct' : 'wrong';
  const score = typeof result.score === 'number' ? result.score : 0;
  return score >= 1 ? 'correct' : score > 0 ? 'partial' : 'wrong';
}

/** Every score shown on the results/review screen goes through this - marks
 *  are frequently a repeating fraction (e.g. a 1/3-weighted item), and an
 *  unrounded float on screen ("0.6666666666666666 / 1") is both ugly and
 *  actively misleading when eyeballing whether scoring looks right. */
function formatScore(n) {
  return (Math.round((n ?? 0) * 10) / 10).toFixed(1);
}

/** Question count above which the review chips grid switches to its
 *  smaller/tighter .compact styling (see that CSS rule) - a full-size grid
 *  wraps into enough rows on a test this long to dominate the screen. */
const CHIPS_COMPACT_THRESHOLD = 20;

// Swipe-to-navigate tuning, review mode only — see _handleTouchEnd()'s own
// comment for why. Same values as LessonSession's identical constants, for
// the same feel across both sessions.
const SWIPE_THRESHOLD_PX = 50;
const SWIPE_AXIS_RATIO = 2;

export class TestSession extends LookMixin(LitElement) {
  static styles = [btn3dStyles, css`
    /* ── Results screen ───────────────────────────────────────────────────
       One of the two payoff moments in the runtime. Was a bordered box with a
       percentage and a native <select> for review navigation - the single
       least playful element in the app. */
    .score-panel {
      display: flex;
      align-items: center;
      gap: var(--space-5);
      flex-wrap: wrap;
      padding: var(--space-6) var(--space-5);
      background: var(--surface-card);
      border: var(--rule-w-fixed) solid var(--border-color);
      border-radius: var(--radius-xl);
      box-shadow: var(--press-2) var(--border-color);
      margin-bottom: var(--space-5);
    }
    .score-panel progress-ring {
      width: 108px;
      --ring-color: var(--primary-color);
      --ring-track: var(--border-color);
    }
    .score-copy { flex: 1; min-width: 220px; }
    .score-copy h2 {
      font-family: var(--font-heading);
      font-size: var(--fs-h1);
      margin: 0 0 var(--space-2);
      line-height: var(--lh-tight);
    }
    .score-copy p { margin: 0; color: var(--text-muted); }
    .score-actions { display: flex; gap: var(--space-3); flex-wrap: wrap; margin-top: var(--space-4); }

    /* Mobile portrait. DOM order is ring, then score-copy, then the mascot —
       fine on a wide screen (all three fit on one row), but at phone widths
       score-copy's own 220px min-width doesn't fit next to the 108px ring,
       so it wraps to a row of its own; the mascot, coming after it in
       source order, then has nothing left on THAT row either and drops to
       a third row all by itself. That tripled this whole card's height on
       exactly the viewport where vertical space is scarcest, pushing the
       actionable review chips below the fold under nothing but whitespace.
       The order property re-pairs the ring and mascot onto one row instead — the two
       fixed-size graphical elements together (108px + 96px + a tightened
       gap) comfortably fit a phone's content width — while score-copy is
       forced onto its own full-width row underneath. Costs nothing on a
       wider viewport, where this media query (and flex-wrap) never engages
       at all. */
    @media (max-width: 480px) {
      .score-panel {
        padding: var(--space-4);
        gap: var(--space-3);
      }
      .score-panel progress-ring { order: 1; }
      .score-panel companion-slot > * { order: 2; }
      .score-copy { order: 3; min-width: 100%; }
      /* Deliberate full-width stack (the usual mobile CTA pattern) rather than
         however "Review what went wrong"/"Back to home" happen to wrap at
         this width — align-items' default (stretch) does the sizing once
         this is a column, no extra width rule needed. */
      .score-actions { flex-direction: column; }
    }

    /* Numbered chips replace the <select>: every question's verdict is visible
       at once, and jumping is one tap instead of open-scan-pick. A large test
       (70+ questions) wraps into many rows at full size - .compact (applied
       once the question count crosses a threshold, see _renderResults())
       shrinks the chip/gap so more fit per row, and the max-height+scroll
       caps the section's footprint regardless of how many rows that still
       leaves, so it can never dominate the screen the way an unbounded grid
       did. The small text line above (.chips-summary) keeps "question N of
       total" legible even once the chips themselves are too small to read
       individual numbers off. */
    .chips-summary {
      font-size: 0.78rem;
      font-weight: var(--fw-strong);
      color: var(--text-muted);
      margin-bottom: var(--space-2);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-bottom: var(--space-5);
      max-height: 148px;
      overflow-y: auto;
      /* Room for the current-chip's scale+shadow below to render fully
         un-clipped. Both a CSS transform and a box-shadow count toward an
         overflow:auto ancestor's *scrollable* overflow (not just paint
         overflow) — 2px here (the previous value) was nowhere near enough
         headroom for a scaled, ringed chip, so even a single short row of
         chips read as "taller than max-height" and spawned a scrollbar with
         nothing genuine to scroll, on top of clipping the ring itself.
         10px comfortably clears the worst case (a full-size current chip's
         ~8px worst-side protrusion, see .chip[aria-current] below) with
         margin to spare for .compact's smaller one. max-height is bumped by
         the same amount this padding grew (was 132/2px) so the visible
         "peek of a partial next row" affordance — the cue that there's more
         to scroll to — stays the same size as before. */
      padding: 10px;
    }
    .chip {
      width: 40px; height: 40px;
      border-radius: var(--radius-sm);
      border: var(--rule-w-fixed) solid var(--border-color);
      background: var(--bg-surface);
      color: var(--text-muted);
      font-family: var(--font-ui);
      font-weight: var(--fw-heavy);
      font-size: 1rem;
      cursor: pointer;
      transition: transform var(--motion-fast);
      flex-shrink: 0;
    }
    .chips.compact .chip {
      width: 26px; height: 26px;
      font-size: 0.68rem;
      border-width: 1px;
      border-radius: var(--radius-xs);
    }
    .chip.correct { background: var(--success-bg); border-color: var(--success-text); color: var(--success-text); }
    .chip.partial { background: var(--warn-bg);    border-color: var(--warn-text);    color: var(--warn-text); }
    .chip.wrong   { background: var(--error-bg);   border-color: var(--error-text);   color: var(--error-text); }
    /* The chip being reviewed right now. A scale bump alone reads as noise
       against a big grid of similarly-colored chips, which is why this
       needs its own accent rather than just relying on size — but a flat,
       symmetric glow (an earlier version of this rule) looked like a plain
       browser focus ring and lost the app's own chunky, pressed-button
       language everywhere else (.btn-3d, .choice — see sharedStyles.js).
       This keeps the same --info-text accent (the palette's neutral,
       not-correct-not-incorrect color, so it never gets confused with a
       verdict color) but renders it as a light separator ring — for
       contrast against same-colored neighbours in a packed .compact grid —
       plus var(--press-1), the same bottom-offset "pressed 3D" shadow every
       other tappable surface in this app uses, so a "current" chip pops
       forward like a pressed button instead of just glowing. The pop-in
       keyframe gives it a little life on top, in the playful
       spirit the rest of the runtime aims for. */
    .chip[aria-current="true"] {
      transform: scale(1.16);
      box-shadow: 0 0 0 3px var(--bg-surface), var(--press-1) var(--info-text);
      z-index: 1;
      position: relative;
      animation: chip-pop 0.4s var(--ease-spring);
    }
    .chips.compact .chip[aria-current="true"] {
      box-shadow: 0 0 0 2px var(--bg-surface), 0 3px 0 var(--info-text);
    }
    @keyframes chip-pop {
      0%   { transform: scale(0.85); }
      60%  { transform: scale(1.24); }
      100% { transform: scale(1.16); }
    }
    @media (prefers-reduced-motion: reduce) {
      .chip[aria-current="true"] { animation: none; }
    }
    .chip:active { transform: translateY(2px); }

    /* Per-question score badge - shows only the CURRENTLY reviewed
       question's marks (reuses .marks-badge's own live "Worth N marks"
       slot in review mode - see _renderMarksBadge()), not a full list of
       every question in the test. A full-test breakdown doesn't scale to a
       large test's screen real estate; jumping via the chips above and
       reading this one badge does. */
    .score-badge.correct { border-color: var(--success-text); color: var(--success-text); }
    .score-badge.partial { border-color: var(--warn-text);    color: var(--warn-text); }
    .score-badge.wrong   { border-color: var(--error-text);   color: var(--error-text); }
    .score-badge-feedback {
      color: var(--text-muted);
      font-weight: 500;
      margin-left: 6px;
    }

    :host {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      max-width: 800px;
      margin: 0 auto;
      width: 100%;
      /* No overflow-x here, same reason as LessonSession's :host: overflow-x
         hidden computes overflow-y to auto, so this host became the scroll
         container for the sticky header below. Its top (the app bar's
         height) was then measured from a scrollport that already starts
         under the app bar, so the header sat that far down over the first
         lines of the question: at 390 px, where the app bar wraps to two
         rows, the whole first lines of the stem. min-height, not height, so
         a long question grows the host and the header sticks to the end. */
    }
    /* Was not sticky at all, so the progress bar scrolled away mid-test.
       Same offset as LessonSession so both clear AppShell's pill. */
    header {
      position: sticky;
      top: var(--appbar-offset);
      z-index: 10;
      background: var(--bg-base);
      padding: var(--space-4) 0;
    }
    .content-area {
      flex: 1;
      padding: 2rem 0;
      overflow-y: auto;
    }

    /* Results screen */
    .results-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      background: var(--bg-surface);
      border-radius: 8px;
      margin-bottom: 1rem;
      border: 1px solid var(--border-color);
    }
    .score-group {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .score-value {
      font-size: 2.5rem;
      font-weight: var(--fw-heavy);
      color: var(--primary-text);
      line-height: 1;
    }
    .score-label {
      font-size: 1.1rem;
      color: var(--text-muted);
      font-weight: 500;
    }
    .sticky-nav {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--bg-surface);
      padding: 1rem 0;
      border-bottom: 2px solid var(--border-color);
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .review-question { padding: 1rem 0; }

    /* Marks badge — CBSE-style "(N marks)" tag so a student sizes their
       answer (e.g. a descriptive question's expected point count) before
       writing it, not just after scoring. */
    .marks-badge {
      display: inline-flex;
      align-self: flex-start; /* :host is a column flex — don't stretch to full width */
      align-items: center;
      gap: 4px;
      font-size: 0.78rem;
      font-weight: var(--fw-strong);
      color: var(--text-muted);
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-pill);
      padding: 3px 12px;
      margin-bottom: var(--space-2);
    }

    /* "Question 4 of 20" during a live attempt - sat right above the
       progress bar, which on its own only ever announced position to a
       screen reader (see ProgressBar.js's .sr-only text), never showed it
       on screen. */
    .question-number {
      font-family: var(--font-heading);
      font-size: 0.95rem;
      font-weight: var(--fw-heavy);
      color: var(--text-muted);
      margin-bottom: var(--space-2);
    }
    /* plain: an exam paper. The question as a folio numeral under a brass
       small-caps label; the marks as a plain small-caps note. */
    :host([data-look="plain"]) .question-number {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-family: var(--font-family);
      font-size: 0.78rem;
      font-weight: 500;
      margin-bottom: var(--space-3);
    }
    .qn-label {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: var(--kicker-tracking, 0.1em);
      text-transform: uppercase;
      color: var(--card-kicker, var(--text-muted));
    }
    .qn-num {
      font-family: var(--font-heading);
      font-size: 1.5rem;
      font-weight: 600;
      line-height: 1;
      color: var(--text-main);
      font-variant-numeric: lining-nums tabular-nums;
    }
    :host([data-look="plain"]) .marks-badge:not(.score-badge) {
      background: none;
      border: 0;
      border-radius: 0;
      padding: 0;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    /* Persistent "jump to next thing worth another look" control, shown
       right next to the score badge for whichever question is currently
       being reviewed - not just once on the score-panel at the top, which
       needs a scroll back up to reach again once reviewing a specific
       question, especially on a long test where the chips section above
       already takes real space (see .chips.compact). */
    .review-nav {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
      flex-wrap: wrap;
    }
    .review-nav-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-ui);
      font-size: 0.8rem;
      font-weight: var(--fw-heavy);
      color: var(--info-text);
      background: var(--info-bg);
      border: var(--rule-w-fixed) solid var(--info-text);
      border-radius: var(--radius-pill);
      padding: 6px 14px;
      cursor: pointer;
      transition: transform var(--motion-fast);
    }
    .review-nav-btn:active { transform: translateY(2px); }
    .review-nav-count { font-size: 0.75rem; font-weight: var(--fw-medium); color: var(--text-muted); }

    /* plain results: a marked paper. The score card is a flat sheet, the
       question chips are flat numbered boxes (the current one gets a navy
       rule, no pop, lip or scale), and the review controls are quiet text
       buttons rather than pills. */
    :host([data-look="plain"]) .score-panel {
      border-width: 1px;
      border-radius: var(--radius-lg);
      box-shadow: var(--card-shadow);
    }
    :host([data-look="plain"]) .score-copy h2 { font-weight: var(--heading-weight); }
    :host([data-look="plain"]) .score-panel progress-ring { --ring-track: var(--meter-track, var(--border-color)); }
    :host([data-look="plain"]) .chips-summary {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: var(--kicker-tracking, 0.1em);
      text-transform: uppercase;
      color: var(--card-kicker, var(--text-muted));
      margin-bottom: 0;
    }
    :host([data-look="plain"]) .chips { padding: 8px 2px; gap: 6px; margin-bottom: var(--space-4); }
    :host([data-look="plain"]) .chip {
      width: 36px; height: 36px;
      border-width: 1px;
      font-weight: 600;
      font-size: 0.92rem;
      font-variant-numeric: tabular-nums;
      transition: background var(--motion-fast), border-color var(--motion-fast);
    }
    :host([data-look="plain"]) .chip[aria-current="true"],
    :host([data-look="plain"]) .chips.compact .chip[aria-current="true"] {
      transform: none;
      animation: none;
      box-shadow: 0 0 0 2px var(--bg-base), 0 0 0 3px var(--primary-color);
    }
    :host([data-look="plain"]) .chip:active { transform: none; }
    :host([data-look="plain"]) .chip:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
    :host([data-look="plain"]) .review-nav { margin-bottom: var(--space-4); }
    :host([data-look="plain"]) .review-nav-btn {
      font-family: var(--font-ui);
      font-weight: 600;
      color: var(--primary-text);
      background: var(--bg-surface);
      border: 1px solid var(--border-hover);
      border-radius: var(--radius-sm);
      padding: 6px 12px;
      transition: border-color var(--motion-fast);
    }
    :host([data-look="plain"]) .review-nav-btn:hover { border-color: var(--primary-color); }
    :host([data-look="plain"]) .review-nav-btn:active { transform: none; }
    :host([data-look="plain"]) .score-badge {
      border-width: 1px;
      border-radius: var(--radius-sm);
    }

    /* Error */
    .error-box { color: var(--error-text); padding: 2rem; }
  `];

  static properties = {
    testId:              { type: String },
    profileId:          { type: String },
    _currentBlockIndex: { type: Number, state: true },
    _totalBlocks:       { type: Number, state: true },
    _results:           { type: Object, state: true },
    _error:             { type: String, state: true },
    _reviewIndex:       { type: Number, state: true }, // which question is shown in review
    _incorrectIndices:  { type: Array,  state: true },
    _currentMarks:      { type: Number, state: true },
    // Deep-linked position from the URL (see Router.js/AppShell.js) — a
    // one-shot input consumed on init and by updated()'s seek branch, the
    // same non-aliased-with-engine-state pattern as LessonSession's own
    // blockIndex/beatIndex.
    itemIndex:          { type: Number },
    reviewMode:         { type: Boolean },
  };

  constructor() {
    super();
    this.testId = '';
    this.profileId = '';
    this._currentBlockIndex = 0;
    this._totalBlocks = 1;
    this._results = null;
    this._error = null;
    this._reviewIndex = 0;
    this._incorrectIndices = [];
    this._currentMarks = null;
    this._engine = null;
    this.itemIndex = undefined;
    this.reviewMode = false;
    // See LessonSession._syncUrl()'s own comment — tracks the item index of
    // the last position this component wrote to the URL, so a genuine item
    // change (pushState) is never confused with a redundant re-sync of the
    // same one (replaceState/no-op).
    this._lastSyncedItemKey = undefined;
    this._touchStartX = 0;
    this._touchStartY = 0;
  }

  connectedCallback() {
    super.connectedCallback();

    // AppShell's merged header bar → this session. Previous/Next/Submit
    // render in AppShell.js now (see .session-nav-group there), reached over
    // EventBus rather than AppShell calling into this shadow root directly
    // (invariant 4) — same pattern as LessonSession's 'lesson:header-action'.
    this._headerActionListener = ({ action }) => {
      if (action === 'prev') this._handlePrev();
      else if (action === 'next') this._handleNext();
      else if (action === 'submit') this._handleSubmit();
    };
    EventBus.on('test:header-action', this._headerActionListener);
    // Cancels this view's open confirm dialogs on disconnect (see showConfirm).
    this._dialogAbort = new AbortController();

    // Shift+ArrowLeft/Right — move between questions. Shift-modified rather
    // than the bare arrows LessonSession uses for beat-advance: a test
    // question routinely hosts its own native arrow-key control (a radio
    // group, a <input type="range"> slider, a slider-based simulation), and
    // an unmodified ArrowLeft/Right there means "change my answer", not
    // "leave this question". Shift+arrow is also clear of the common
    // browser/OS shortcuts that already own the modified arrows people
    // reach for instinctively (Alt+Left/Right = history back/forward,
    // Ctrl/Cmd+Left/Right = word/tab jump).
    this._keyListener = (e) => this._handleKey(e);
    window.addEventListener('keydown', this._keyListener);

    // Swipe left/right — review mode only (see _handleTouchEnd()'s own
    // comment). Both passive and neither ever calls preventDefault(), so
    // normal vertical scrolling and a reviewed question's own touch
    // interactions are unaffected — this only ever reacts after a gesture
    // completes, same as LessonSession's identical listener.
    this._touchStartListener = (e) => this._handleTouchStart(e);
    this._touchEndListener = (e) => this._handleTouchEnd(e);
    this.addEventListener('touchstart', this._touchStartListener, { passive: true });
    this.addEventListener('touchend', this._touchEndListener, { passive: true });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._dialogAbort?.abort();
    EventBus.off('test:header-action', this._headerActionListener);
    // Tells AppShell's merged bar to stop showing this test's controls
    // immediately — its own route-changed safety net covers the same case,
    // but this is the direct signal and fires first.
    EventBus.emit('test:header-nav', { active: false });
    window.removeEventListener('keydown', this._keyListener);
    this.removeEventListener('touchstart', this._touchStartListener);
    this.removeEventListener('touchend', this._touchEndListener);
  }

  _handleTouchStart(e) {
    if (!e.touches?.[0]) return;
    this._touchStartX = e.touches[0].clientX;
    this._touchStartY = e.touches[0].clientY;
  }

  /**
   * Swipe left/right between reviewed questions — deliberately live ONLY
   * once `_results` is set (review mode), never during the live attempt: a
   * question being actively answered routinely hosts its own horizontal
   * drag interaction (a slider, a drag-match tile, a pannable diagram), and
   * a swipe-to-navigate armed there would either fight that interaction or
   * silently skip the student off a question they meant to drag within.
   * Once grading has frozen every question read-only, that conflict is
   * gone, so this reuses _navForward()/_navBackward() — the same
   * Shift+arrow review-cycling logic — rather than duplicating the bounds
   * check.
   */
  _handleTouchEnd(e) {
    if (!this._results || !e.changedTouches?.[0]) return;
    const dx = e.changedTouches[0].clientX - this._touchStartX;
    const dy = e.changedTouches[0].clientY - this._touchStartY;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return;
    if (dx < 0) this._navForward();
    else this._navBackward();
  }

  /**
   * A test belongs to a course bundle, not to a module: its look and
   * gamification come from the bundle's first module, read through the
   * bundle manifest, before the first question mounts. A test outside any
   * bundle (or with no readable manifest) follows the site.
   */
  async _openCourse() {
    let course = null;
    let manifest = null;
    const bundleId = CourseSourceManager.deriveBundleId(this.testId);
    if (bundleId) {
      try {
        await CourseSourceManager.init();
        manifest = await ContentLoader.loadJSON(CourseSourceManager.resolveRef('manifest.json', bundleId));
        const ref = manifest?.modules?.[0];
        if (typeof ref === 'string') course = await ContentLoader.loadJSON(CourseSourceManager.expandRef(ref, bundleId));
      } catch { /* the site's look */ }
    }
    if (this.isConnected) {
      LookManager.setCourse(course);
      LookManager.followBundle(bundleId, () => manifest);
    }
  }

  async firstUpdated() {
    try {
      await this._openCourse();
      const container = this.shadowRoot.getElementById('block-container');
      this._engine = new TestEngine(this.profileId, this.testId, container);

      this._engine.onProgress = (current, total) => {
        this._currentBlockIndex = current;
        this._totalBlocks = total;
      };

      this._engine.onPositionChange = (pos) => {
        this._currentMarks = pos?.marks ?? null;
        this._syncUrl(pos);
      };

      this._engine.onComplete = (results) => {
        // The live completion moment, as opposed to re-opening an old attempt
        // to review it (the reviewResults branch below never sets this). The
        // results cue says which; the look decides what that earns.
        this._resultsLive = true;
        this._restoreResults(results);
      };

      await this._engine.init({ itemIndex: this.itemIndex, reviewMode: this.reviewMode });

      // A "Review results" link (HomeDashboard) passes reviewMode=true —
      // the engine already found and loaded the last completed attempt
      // (see TestEngine._loadCompletedAttemptForReview()); jump straight to
      // its results screen instead of the normal in-progress question flow.
      // Falls through silently to a fresh attempt if there was nothing to
      // review (e.g. a stale link), same as the engine's own fallback.
      if (this._engine.reviewResults) {
        this._restoreResults(this._engine.reviewResults);
      }
    } catch (err) {
      this._error = err.message;
    }
  }

  /** Shared by the live onComplete callback and the reviewMode-restore path
   *  above — computes which questions to flag for "review what went wrong"
   *  and switches the view to the results screen. Never celebrates itself;
   *  the live path does that separately, once, right after calling this. */
  _restoreResults(results) {
    // `results.results` is keyed by test position (stringified index "0",
    // "1", ... — see TestEngine._computeResults()'s doc comment for why:
    // content ids collide across course bundles pooled into one test).
    // Object.values() on purely-integer-string keys iterates in ascending
    // numeric order by spec, so this always walks the same positional
    // sequence jumpTo(idx) does.
    const list = Object.values(results.results || {});
    const incorrects = list
      .map((r, idx) => ({ idx, bucket: verdictBucket(r) }))
      .filter(q => q.bucket !== 'correct')
      .map(q => q.idx);
    this._incorrectIndices = incorrects;
    this._reviewIndex = incorrects.length > 0 ? incorrects[0] : 0;
    this._results = results;
  }

  updated(changedProperties) {
    if (changedProperties.has('_results') && this._results) {
       // We just transitioned to results screen.
       // Re-bind engine container to the new #block-container created by _renderResults()
       const newContainer = this.shadowRoot.getElementById('block-container');
       if (this._engine && newContainer) {
         this._engine.container = newContainer;
         this._reviewGoto(this.reviewMode && Number.isInteger(this.itemIndex) ? this.itemIndex : this._reviewIndex);
       }
    } else if (this._results && changedProperties.has('itemIndex') && Number.isInteger(this.itemIndex)) {
      // Already on the results screen — Back/Forward across a reviewed item.
      this._reviewGoto(this.itemIndex);
    } else if (this._engine && changedProperties.has('itemIndex') && !this._results) {
      // Same test still mounted (not yet submitted), only the deep-linked
      // item changed — the browser Back/Forward button crossing our own
      // pushState entries (see _syncUrl()). Seeks in-memory via the engine's
      // existing jumpTo().
      this._engine.jumpTo(this.itemIndex);
    }
    this._publishHeaderNav();
    this._cueResults();
  }

  /** cue:test-result, once per results (and per companion element showing
   *  them). Sent from updated() so the companion is already rendered, and
   *  before first paint, so its face never flashes the default. */
  _cueResults() {
    // The slot is new each time the results screen renders (a look without a
    // companion leaves it empty, and still gets the cue).
    const slot = this._results ? this.shadowRoot?.querySelector('.score-panel companion-slot') : null;
    if (!slot || (slot === this._cuedSlot && this._results === this._cuedResults)) return;
    this._cuedSlot = slot;
    this._cuedResults = this._results;
    const companion = slot.companion;
    const { totalScore, maxScore } = this._results;
    emitCue(CUES.TEST_RESULT, {
      pct: maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0,
      perfect: maxScore > 0 && totalScore === maxScore,
      live: !!this._resultsLive,
      companion,
    });
  }

  /**
   * Tells AppShell's merged header bar (.session-nav-group) what to show —
   * unconditional at the end of every update, same pattern as
   * LessonSession._publishHeaderNav(). `active` is false during an error or
   * once results are showing — the results/review screen already has its
   * own in-content chips and "Next to review" control for jumping between
   * questions (see _renderReviewNav()), so a second, duplicate nav bar here
   * would be redundant.
   */
  _publishHeaderNav() {
    const isLastQuestion = this._currentBlockIndex >= this._totalBlocks;
    EventBus.emit('test:header-nav', {
      active: !this._error && !this._results,
      canGoBack: this._currentBlockIndex > 1,
      canGoForward: !isLastQuestion,
      isLastQuestion,
    });
  }

  /**
   * Shift+ArrowLeft/Right — see connectedCallback()'s own comment for why
   * shifted rather than bare arrows. Ignored while the student is typing or
   * has focused a control that owns arrow keys itself (a native <select>, a
   * slider), same guards as LessonSession._handleKey(), and while a native
   * `<dialog>` (the submit confirm) is open.
   */
  _handleKey(e) {
    if (this._error) return;
    if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.defaultPrevented) return;
    if (document.querySelector('dialog[open]')) return;

    const el = e.composedPath()[0];
    const tag = el?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return;

    e.preventDefault();
    if (e.key === 'ArrowRight') this._navForward();
    else this._navBackward();
  }

  /**
   * On the results screen, cycles through the review list by position
   * (every question, not just incorrect ones — _reviewNextIncorrect() is a
   * separate, deliberately narrower control). Mid-test, never advances past
   * the last question — the last question swaps its header button to Submit
   * precisely so leaving it always takes a deliberate, separate action, not
   * a keystroke that could double as "one past the end".
   */
  _navForward() {
    if (this._results) {
      const total = Object.keys(this._results.results || {}).length;
      if (this._reviewIndex < total - 1) this._reviewGoto(this._reviewIndex + 1);
    } else if (this._currentBlockIndex < this._totalBlocks) {
      this._handleNext();
    }
  }

  _navBackward() {
    if (this._results) {
      if (this._reviewIndex > 0) this._reviewGoto(this._reviewIndex - 1);
    } else {
      this._handlePrev();
    }
  }

  _handleNext()  { if (this._engine) this._engine.next(); }
  _handlePrev()  { if (this._engine) this._engine.previous(); }
  _handleFinish() { window.location.hash = '#/'; }

  /**
   * Same pattern as LessonSession._syncUrl() — pushState per question
   * (tests have no lesson-style sub-item "beats", so every item change is
   * its own Back-button stop), replaceState for a redundant re-sync of the
   * same item, and a no-op if the URL already matches (the incoming-Back/
   * Forward case, via updated()'s jumpTo() branch above).
   */
  _syncUrl(pos) {
    if (!pos || !this.testId) return;
    const inReview = !!this._results;
    const key = `item:${pos.itemIndex}:${inReview}`;
    const cleanRef = this.testId.replace(/^\//, '');
    const params = new URLSearchParams();
    // See LessonSession._syncUrl()'s own comment — preserve `preview=true`
    // across this rewrite or ai-draft content stops loading after the first
    // item change.
    const existingParams = new URLSearchParams((window.location.hash.split('?')[1]) || '');
    if (existingParams.get('preview') === 'true') params.set('preview', 'true');
    params.set('item', String(pos.itemIndex ?? 0));
    if (inReview) params.set('review', '1');
    const url = `#/test/${cleanRef}?${params.toString()}`;

    if (url === window.location.hash) {
      this._lastSyncedItemKey = key;
      return;
    }
    if (this._lastSyncedItemKey !== undefined) {
      history.pushState(null, '', url);
    } else {
      history.replaceState(null, '', url);
    }
    this._lastSyncedItemKey = key;
  }

  async _handleSubmit() {
    // One submit confirm at a time: repeated Submit presses must not stack dialogs.
    if (!this._engine || this._confirmingSubmit) return;
    this._confirmingSubmit = true;
    let confirmed;
    try {
      confirmed = await showConfirm('Are you sure you want to submit your test?',
        'Confirm', 'OK', 'Cancel', { signal: this._dialogAbort?.signal });
    } finally {
      this._confirmingSubmit = false;
    }
    if (confirmed && this._engine) await this._engine.submit();
  }

  async _reviewGoto(idx) {
    this._reviewIndex = idx;
    this.requestUpdate();

    // Wait for Lit to apply changes in case DOM changed
    await this.updateComplete;
    const newContainer = this.shadowRoot.getElementById('block-container');

    // .chips scrolls internally on a long test (see .chips.compact's CSS
    // comment) - without this, jumping via _reviewNextIncorrect()/the URL
    // could land on a chip scrolled outside that window, leaving the
    // "currently reviewing" ring (the whole point of aria-current) offscreen.
    this.shadowRoot.querySelector('.chip[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    if (this._engine && newContainer) {
      this._engine.container = newContainer;
      await this._engine.jumpTo(idx);
      
      // Force evaluation to reveal correct answers and feedback in review mode.
      // `await` is a no-op for every existing plugin's synchronous evaluate()
      // — only benefits an async one (e.g. plot-function@1).
      const pluginEl = Array.from(this._engine.mountedPlugins.values())[0];
      if (pluginEl && typeof pluginEl.evaluate === 'function') {
        await pluginEl.evaluate();
      }
    }
  }

  _reviewNextIncorrect() {
    const current = this._incorrectIndices.indexOf(this._reviewIndex);
    const next = this._incorrectIndices[(current + 1) % this._incorrectIndices.length];
    this._reviewGoto(next);
  }

  /** Shared by the live question header and the review screen — both sit
   *  outside the engine's own container (which gets wiped on every render),
   *  so this badge survives while the question underneath remounts. Live
   *  (`this._results` unset), it's just the authored mark value ("Worth N
   *  marks"). In review, it becomes the CURRENTLY reviewed question's own
   *  earned/max marks + feedback — deliberately only the one question, not
   *  a list of every question in the test (that doesn't scale to a long
   *  test's screen space; the chips above already give the whole-test
   *  overview, one tap away from any question's own score here). */
  _renderMarksBadge() {
    if (this._results) {
      // Position-keyed — see _restoreResults()'s doc comment.
      const result = (this._results.results || {})[String(this._reviewIndex)];
      if (!result) return '';
      const bucket = verdictBucket(result);
      const hasMarks = typeof result.maxMarks === 'number';
      const marksText = hasMarks
        ? `${formatScore(result.earnedMarks)} / ${formatScore(result.maxMarks)}`
        : `${formatScore(result.score)} / 1.0`;
      return html`
        <div class="marks-badge score-badge ${bucket}">
          Scored ${marksText} marks${result.feedback ? html`<span class="score-badge-feedback">${result.feedback}</span>` : ''}
        </div>`;
    }
    if (this._currentMarks == null) return '';
    return html`<div class="marks-badge">Worth ${this._currentMarks} mark${this._currentMarks === 1 ? '' : 's'}</div>`;
  }

  /** "Next to review" control, co-located with whichever question is
   *  currently on screen (unlike the score-panel's own "Review what went
   *  wrong" button, which only starts the cycle from the results summary at
   *  the top) - see this class's own review-nav CSS comment for why. Cycles
   *  the same `_incorrectIndices` list (wrong OR partial, never just
   *  "wrong" — see _restoreResults()'s bucket filter) `_reviewNextIncorrect`
   *  already does. */
  _renderReviewNav() {
    if (!this._results || this._incorrectIndices.length === 0) return '';
    const posInList = this._incorrectIndices.indexOf(this._reviewIndex);
    const countLabel = posInList === -1
      ? `${this._incorrectIndices.length} to review`
      : `${posInList + 1} of ${this._incorrectIndices.length}`;
    return html`
      <div class="review-nav">
        <button type="button" class="review-nav-btn" @click="${this._reviewNextIncorrect}">
          Next to review →
        </button>
        <span class="review-nav-count">${countLabel}</span>
      </div>
    `;
  }

  _renderResults() {
    const { totalScore, maxScore, results } = this._results;
    const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    // Position-keyed ("0", "1", ...) — see _restoreResults()'s doc comment.
    // Object.keys() on purely-integer-string keys iterates in ascending
    // numeric order by spec, matching testData.questions position order.
    const questionIds = Object.keys(results || {});
    // The companion's face is the look's call (cue:test-result, _cueResults()).
    const headline = brandCopy(pct >= 90 ? 'testHigh' : pct >= 60 ? 'testMid' : 'testLow', 'Test complete');

    return html`
      <div class="score-panel">
        <progress-ring .value=${pct / 100} show-text label="Score"></progress-ring>
        <div class="score-copy">
          <h2>${headline}</h2>
          <p>${formatScore(totalScore)} of ${formatScore(maxScore)} correct${this._incorrectIndices.length
              ? ` - ${this._incorrectIndices.length} to look at again.`
              : '. Nothing left to review.'}</p>
          <div class="score-actions">
            ${this._incorrectIndices.length > 0 ? html`
              <button class="btn-3d btn-primary btn-sm" @click="${this._reviewNextIncorrect}">
                Review what went wrong
              </button>` : ''}
            <button class="btn-3d btn-secondary btn-sm" @click="${this._handleFinish}">Back to home</button>
          </div>
        </div>
        <companion-slot size="sm"></companion-slot>
      </div>

      <div class="chips-summary">Question ${this._reviewIndex + 1} of ${questionIds.length}</div>
      <div class="chips ${questionIds.length > CHIPS_COMPACT_THRESHOLD ? 'compact' : ''}" role="group" aria-label="Jump to a question">
        ${questionIds.map((qId, idx) => { const bucket = verdictBucket(results[qId]); return html`
          <button
            class="chip ${bucket}"
            aria-current="${idx === this._reviewIndex}"
            aria-label="Question ${idx + 1}, ${bucket === 'correct' ? 'correct' : bucket === 'partial' ? 'partially correct' : 'incorrect'}"
            @click="${() => this._reviewGoto(idx)}"
          >${idx + 1}</button>
        `; })}
      </div>

      <div class="content-area">
        ${this._renderMarksBadge()}
        ${this._renderReviewNav()}
        <div class="review-question" id="block-container" aria-live="polite">
          <!-- Engine re-mounts the selected question here in review mode -->
        </div>
      </div>
    `;
  }

  render() {
    if (this._error) {
      return html`<div class="error-box">⚠️ Error loading test: ${this._error}</div>`;
    }

    if (this._results) {
      return this._renderResults();
    }

    // Previous/Next/Submit now live in AppShell's merged header bar (see
    // _publishHeaderNav()/'test:header-nav') instead of a bottom controls
    // row — same move LessonSession already made for its own nav, and for
    // the same reason: a bottom-of-flow row could scroll out of reach on a
    // long question, exactly what this sprint's nav bar is fixing.
    return html`
      <header>
        <div class="question-number">${this.look === 'plain'
          ? html`<span class="qn-label">Question</span><span class="qn-num">${this._currentBlockIndex}</span><span>of ${this._totalBlocks}</span>`
          : html`Question ${this._currentBlockIndex} of ${this._totalBlocks}`}</div>
        <progress-bar
          .current="${this._currentBlockIndex}"
          .total="${this._totalBlocks}"
          label="Test Progress"
        ></progress-bar>
      </header>

      ${this._renderMarksBadge()}

      <main class="content-area" id="block-container" aria-live="polite">
        <!-- Engine mounts plugins here -->
      </main>
    `;
  }
}

customElements.define('test-session', TestSession);
