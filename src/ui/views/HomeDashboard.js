import { LitElement, html, css } from 'lit';
import { ContentLoader } from '../../core/ContentLoader.js';
import { CourseSourceManager } from '../../core/CourseSourceManager.js';
import { i18n, tr, trn } from '../../core/i18nProvider.js';
import { needsNewerEngine } from '../../core/engineVersion.js';
import { gradeLabel, compareGrades } from '../../core/gradeLabel.js';
import '../components/StreakBadge.js';
import '../components/ProgressRing.js';
import { brandCopy, brandIcon } from '../components/LookSlots.js';
import '../components/ModuleHeroCard.js';
import '../components/PracticeTodayCard.js';
import { moduleLessonRefs, courseProgress, groupShelf } from '../../core/lessonProgressRules.js';
import { subjectIcons, iconFlag } from '../icons/uiIcons.js';
import { ProgressStore } from '../../core/ProgressStore.js';
import { PracticeTestBuilder } from '../../core/PracticeTestBuilder.js';
import { btn3dStyles } from '../sharedStyles.js';
import { showConfirm } from '../components/dialogs.js';
import { GamificationMixin } from '../../core/mixins/GamificationMixin.js';
import { LookManager } from '../../core/LookManager.js';
import { LookMixin } from '../../core/mixins/LookMixin.js';
import '../components/LookSlots.js';

export class HomeDashboard extends LookMixin(GamificationMixin(LitElement)) {
  static styles = [btn3dStyles, css`
    :host {
      display: flex;
      flex-direction: column;
      max-width: 1060px;
      margin: 0 auto;
      width: 100%;
      box-sizing: border-box;
      padding: 1rem;
    }
    /* Greeting row (prototype v2 a/ .greet): plain heading plus the streak
       chip, on the page itself. The old gradient banner made the first
       thing a student saw a slab of colour instead of their next lesson. */
    .greet {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      flex-wrap: wrap;
      margin: var(--space-3) 0 var(--space-5);
      animation: rise var(--motion-entrance, 550ms) var(--motion-reveal-ease) both;
    }
    .greet h1 {
      margin: 0;
      font-family: var(--font-heading);
      font-size: var(--fs-greeting);
      line-height: var(--lh-tight);
    }
    module-hero-card { margin-bottom: var(--space-6); }
    /* Feedback nudge (W4): one quiet line, never a badge. */
    .flag-nudge {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      margin: calc(-1 * var(--space-3)) 0 var(--space-6);
      padding: 6px 2px;
      min-height: 44px;
      color: var(--text-muted);
      font-size: 0.88rem;
      line-height: 1.35;
      text-decoration: underline;
      text-decoration-color: var(--border-hover);
      text-underline-offset: 3px;
    }
    .flag-nudge svg { flex: none; width: 16px; height: 16px; }
    .flag-nudge:hover { color: var(--text-main); text-decoration-color: currentColor; }
    .flag-nudge:focus-visible { outline: var(--focus-ring); outline-offset: 2px; border-radius: var(--radius-xs); }
    @keyframes rise { from { opacity: 0; transform: translateY(var(--rise-distance)); } }
    @media (prefers-reduced-motion: reduce) {
      .greet, .section-title { animation: none; }
    }

    /* Section title with a trailing rule (prototype v2 a/ .section-title). */
    .section-title {
      font-size: 1.25rem;
      margin: 0 0 var(--space-4);
      font-family: var(--font-heading);
      display: flex;
      align-items: center;
      gap: var(--space-3);
      animation: rise var(--motion-entrance, 550ms) var(--motion-reveal-ease) 140ms both;
    }
    .section-title::after {
      content: '';
      flex: 1;
      height: 2px;
      border-radius: 2px;
      background: var(--border-color);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.5rem;
      margin-bottom: 3rem;
    }

    /* Continue Learning rail: same card language, denser grid, no
       tags/description/footer — so more fit above the fold. */
    .rail-grid {
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      margin-bottom: 2rem;
    }
    .rail-grid .card-body { padding: 1rem; }

    .subject-group-title {
      font-family: var(--font-heading);
      font-size: var(--fs-h3, 1.05rem);
      color: var(--text-muted);
      margin: 0 0 var(--space-3);
    }
    
    @media (max-width: 600px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }

    .card {
      background: var(--surface-card);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-lg);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: transform var(--motion-base) var(--ease-settle),
                  box-shadow var(--motion-base) var(--ease-settle),
                  border-color var(--motion-base) var(--ease-settle);
      text-decoration: none;
      color: inherit;
      /* --raise-rest, --raise-hover: optional, unset under Quill. A look may
         rest a card on a soft shadow and grow it on hover. */
      box-shadow: var(--raise-rest, var(--press-1) var(--lip-color));
    }

    .card:hover {
      transform: translateY(var(--hover-lift));
      border-color: var(--raise-hover-rule, var(--primary-color));
      box-shadow: var(--raise-hover, var(--raise-rest, var(--press-1) var(--lip-color)));
    }
    /* The tactile press: the card sinks onto its own shadow. */
    .card:active {
      transform: translateY(var(--press-travel));
      box-shadow: none;
    }

    .card-banner {
      height: var(--card-banner-h);
      background: var(--gradient-card);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      border-bottom: var(--rule-w) solid var(--border-color);
      position: relative;
    }

    /* One distinguishable hue per subject, all from the accent family so they
       stay theme-aware. The default class uses --gradient-banner, NOT
       --gradient-hero:
       the hero token is a viewport-scale radial cosmos and collapses to a flat
       slab at banner size. */
    .card-banner.biology   { background: var(--card-banner-bg, var(--gradient-teal)); }
    .card-banner.physics   { background: var(--card-banner-bg, linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-violet) 100%)); }
    .card-banner.chemistry { background: var(--card-banner-bg, var(--gradient-gold)); }
    .card-banner.math      { background: var(--card-banner-bg, linear-gradient(135deg, var(--accent-violet) 0%, var(--accent-coral) 100%)); }
    .card-banner.default   { background: var(--card-banner-bg, var(--gradient-banner)); }
    .card-banner { color: var(--card-banner-ink); }

    .banner-icon {
      display: inline-flex;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .card:hover .banner-icon {
      transform: var(--card-icon-hover, scale(1.08) translateY(-2px));
    }

    /* The ring is <progress-ring> now and bound to real data (P4.3). It used
       to hardcode stroke-dashoffset:40 with a wrong dasharray of 125, so every
       card displayed an identical fake ~68%. */
    progress-ring {
      width: 48px;
      --ring-color: var(--card-banner-ink);
      --ring-track: var(--card-banner-track);
    }

    /* The ring's plain stand-in while gamification is off. */
    .banner-pct {
      color: var(--card-banner-ink);
      font-size: 0.95rem;
      font-weight: var(--fw-strong);
    }

    .card-body {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .card-type {
      text-transform: uppercase;
      font-size: 0.75rem;
      font-weight: var(--fw-strong);
      letter-spacing: var(--kicker-tracking, 0.5px);
      color: var(--card-kicker, var(--primary-text));
      margin-bottom: 0.5rem;
    }

    .card h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1.25rem;
      font-family: var(--font-heading, sans-serif);
    }
    
    .card p {
      margin: 0 0 1.25rem 0;
      font-size: 0.85rem;
      color: var(--text-muted);
      flex: 1;
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: auto;
      padding-top: 0.75rem;
      border-top: 1px solid var(--border-color);
    }

    .review-link {
      display: inline-block;
      margin: -0.5rem 0 0.75rem;
      padding: 0;
      background: none;
      border: none;
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: var(--fw-strong);
      color: var(--primary-text);
      cursor: pointer;
      text-align: left;
    }
    .review-link:hover { text-decoration: underline; }

    .empty-state {
      text-align: center;
      padding: 3rem;
      background: var(--bg-surface);
      border: 2px dashed var(--border-hover);
      border-radius: var(--radius-lg);
      color: var(--text-muted);
    }

    /* Was two native <select>s, which read as a library catalogue. Pills keep
       every option visible and tappable - the filter is now part of the page,
       not a dropdown to go hunting in. */
    .filter-bar {
      display: flex;
      gap: var(--space-2);
      margin-bottom: var(--space-6);
      align-items: center;
      flex-wrap: wrap;
    }
    .ftab {
      font-family: var(--font-heading);
      font-weight: var(--fw-heavy);
      font-size: var(--fs-small);
      padding: 8px 16px;
      border-radius: var(--radius-pill);
      border: var(--rule-w) solid var(--border-color);
      background: var(--bg-surface);
      color: var(--text-muted);
      cursor: pointer;
      transition: transform var(--motion-fast), background var(--motion-fast),
                  color var(--motion-fast), border-color var(--motion-fast);
    }
    .ftab:hover { color: var(--text-main); border-color: var(--border-hover); }
    .ftab[aria-pressed="true"] {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: var(--on-primary);
    }
    .ftab:active { transform: translateY(var(--option-press, 2px)); }
    .filter-label {
      font-weight: var(--fw-heavy);
      font-size: var(--fs-kicker);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-right: var(--space-2);
    }

    .tags-container {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 0.75rem;
    }

    .tag-pill {
      font-size: 0.7rem;
      font-weight: var(--fw-strong);
      padding: 3px 10px;
      border-radius: var(--radius-pill);
      background: var(--success-bg);
      color: var(--success-text);
      text-transform: uppercase;
    }
    .tag-pill.grade {
      background: var(--primary-light);
      color: var(--primary-hover);
    }
    .tag-pill.topic {
      background: var(--warn-bg);
      color: var(--warn-text);
    }
    /* plain: a quality journal's contents page. A dateline over the
       greeting, sections opened by a full rule, course covers instead of
       icon tiles, tags as small caps, a hairline meter with numerals. */
    :host([data-look="plain"]) .greet {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      margin: var(--space-4) 0 var(--space-6);
    }
    .dateline {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: var(--kicker-tracking, 0.12em);
      text-transform: uppercase;
      color: var(--card-kicker, var(--text-muted));
    }
    :host([data-look="plain"]) .greet h1 { font-size: var(--fs-display); letter-spacing: -0.015em; }
    :host([data-look="plain"]) module-hero-card { margin-bottom: var(--space-7, 3rem); }
    :host([data-look="plain"]) .section-title {
      align-items: baseline;
      font-size: 1.35rem;
      padding-top: var(--space-3);
      border-top: 1px solid var(--rule-strong, var(--text-main));
      margin: 0 0 var(--space-5);
    }
    :host([data-look="plain"]) .section-title::after { content: none; }
    .section-count {
      margin-left: auto;
      font-family: var(--font-family);
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
    :host([data-look="plain"]) .subject-group-title {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      font-family: var(--font-family);
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    :host([data-look="plain"]) .subject-group-title::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--rule-soft, var(--border-color));
    }
    :host([data-look="plain"]) .grid { gap: 1.25rem; margin-bottom: 2.5rem; }
    :host([data-look="plain"]) .card-banner:has(look-cover > *) {
      height: 132px;
      padding: 0;
      border-bottom: 0;
    }
    :host([data-look="plain"]) .rail-grid .card-banner:has(look-cover > *) { height: 84px; }
    :host([data-look="plain"]) .card-banner look-cover > * { position: absolute; inset: 0; }
    :host([data-look="plain"]) .card-banner:has(look-cover > *) > :not(look-cover) { display: none; }
    :host([data-look="plain"]) .card-body { padding: 1.25rem 1.375rem; }
    /* A shelf with one course is a listing: the cover beside the text. */
    @media (min-width: 720px) {
      :host([data-look="plain"]) .grid:not(.rail-grid):has(> .card:only-child) { grid-template-columns: minmax(0, 1fr); }
      :host([data-look="plain"]) .grid:not(.rail-grid) > .card:only-child:has(look-cover > *) { flex-direction: row; }
      :host([data-look="plain"]) .grid:not(.rail-grid) > .card:only-child .card-banner:has(look-cover > *) { flex: none; width: 168px; height: auto; min-height: 224px; }
      :host([data-look="plain"]) .grid:not(.rail-grid) > .card:only-child .card-body { padding: 1.5rem 1.75rem; }
      :host([data-look="plain"]) .grid:not(.rail-grid) > .card:only-child p { max-width: 62ch; }
    }
    :host([data-look="plain"]) .card h3 { font-size: 1.22rem; line-height: 1.25; letter-spacing: -0.005em; text-wrap: balance; }
    :host([data-look="plain"]) .card p { font-size: 0.9rem; line-height: 1.5; color: var(--text-soft); }
    /* Each tag carries its separator dot in a 0.9rem gutter on its left;
       the row is pulled left by one gutter and clipped there, so whichever
       tag starts a line (the first, or one that wrapped) hides its dot and
       no line ever opens with a stray one. */
    :host([data-look="plain"]) .tags-container { gap: 0; margin-bottom: 0.75rem; margin-left: -0.9rem; clip-path: inset(-4px -4px -4px 0.9rem); }
    :host([data-look="plain"]) .tag-pill {
      background: none;
      padding: 0;
      border-radius: 0;
      color: var(--text-muted);
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.08em;
    }
    :host([data-look="plain"]) .tag-pill { position: relative; margin-left: 0.9rem; }
    :host([data-look="plain"]) .tag-pill::before { content: '\\00b7'; position: absolute; left: -0.9rem; width: 0.9rem; text-align: center; }
    :host([data-look="plain"]) .card-footer { border-top-color: var(--rule-soft, var(--border-color)); padding-top: 0.875rem; }
    :host([data-look="plain"]) .card-footer .btn-3d {
      background: transparent;
      color: var(--primary-text);
      border: 1px solid var(--border-hover);
      box-shadow: none;
    }
    :host([data-look="plain"]) .card:hover .card-footer .btn-3d { border-color: var(--primary-color); }
    .card-meter {
      flex: 1;
      min-width: 0;
      margin-right: var(--space-4);
      display: grid;
      gap: 6px;
      font-size: 0.78rem;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
    .card-meter b { font-weight: 600; color: var(--text-main); }
    .card-meter .bar { position: relative; height: 2px; max-width: 150px; border-radius: 1px; background: var(--meter-track, var(--bg-panel-2)); overflow: hidden; }
    .card-meter .bar i { position: absolute; inset: 0 auto 0 0; background: var(--meter-fill, var(--primary-color)); }
    :host([data-look="plain"]) .filter-bar { gap: var(--space-1, 4px) var(--space-4); margin-bottom: var(--space-6); border-bottom: 1px solid var(--rule-soft, var(--border-color)); }
    :host([data-look="plain"]) .ftab {
      font-family: var(--font-family);
      font-weight: 500;
      font-size: 0.9rem;
      padding: 8px 0 10px;
      margin-bottom: -1px;
      border: 0;
      border-bottom: 2px solid transparent;
      border-radius: 0;
      background: none;
      text-transform: capitalize;
    }
    :host([data-look="plain"]) .ftab[aria-pressed="true"] { background: none; color: var(--text-main); border-bottom-color: var(--primary-color); }
    :host([data-look="plain"]) .filter-label { margin-right: 0; }
    :host([data-look="plain"]) .empty-state { border: 1px solid var(--border-color); background: var(--bg-surface); }
  `];

  static properties = {
    userName: { type: String },
    adult: { type: Boolean },
    profileId: { type: String },
    _progress: { type: Object, state: true },
    _catalog: { type: Array, state: true },
    _error: { type: String, state: true },
    _subjectFilter: { type: String, state: true },
    _gradeFilter: { type: String, state: true },
    _practiceTests: { type: Array, state: true },
    _completedAttempts: { type: Object, state: true },
    // Continue Learning rail (bookshelf sprint): per-module last-touched
    // time (incomplete lessons only) and per-test paused-attempt info.
    _moduleLastAccessed: { type: Object, state: true },
    _pausedTests: { type: Array, state: true },
    _expandedSubjects: { type: Object, state: true },
    // Raw lessonProgress rows, for the hero card's "next lesson".
    _lessonRows: { type: Array, state: true },
    // Flagged slides (W4) still waiting for a grown-up to send.
    _flagWaiting: { type: Number, state: true },
  };

  constructor() {
    super();
    this.userName = 'Student';
    this.adult = false;
    this.profileId = '';
    this._progress = {};
    this._practiceTests = [];
    this._completedAttempts = {};
    this._catalog = null;
    this._error = null;
    this._subjectFilter = '';
    this._gradeFilter = '';
    this._moduleLastAccessed = {};
    this._pausedTests = [];
    this._expandedSubjects = new Set();
    this._flagWaiting = 0;
  }

  /** Waiting feedback count for the quiet nudge under the Today card. */
  async _loadFlagWaiting() {
    if (!this.profileId) return;
    try {
      const { list } = await import('../../core/FeedbackService.js');
      this._flagWaiting = (await list(this.profileId, { status: 'draft' })).length;
    } catch { this._flagWaiting = 0; }
  }

  _renderFlagNudge() {
    const n = this._flagWaiting;
    if (!n) return '';
    const text = this.adult
      ? trn('home.flag_nudge_adult', n, '1 flagged slide is waiting to send.', '{n} flagged slides are waiting to send.')
      : trn('home.flag_nudge', n, '1 flagged slide is waiting for a grown-up to send.', '{n} flagged slides are waiting for a grown-up to send.');
    return html`<a class="flag-nudge" href="#/parent?open=outbox">${iconFlag}<span>${text}</span></a>`;
  }

  async firstUpdated() {
    this._loadFlagWaiting(); // fire-and-forget, independent of the catalog
    // No local content/catalog.json any more — courses live in their own
    // repo(s) and are discovered purely through CourseSourceManager
    // (defaultCourseSources.js's auto-seeded library, see
    // CourseSourceManager.seedDefaults(), plus anything a parent has added
    // by hand). Best-effort: an unreachable source shouldn't blank the
    // whole dashboard.
    let items = [];
    try {
      items = await CourseSourceManager.listCatalogItems();
    } catch { /* best-effort */ }

    if (!items.length) {
      this._error = "No published content found. Catalog is empty.";
      this._catalog = [];
      // Practice tests and completed-test lookups are independent of the
      // module/test catalog (a profile can have parent-built practice
      // tests with zero registered course sources — e.g. right after a
      // backup restore that didn't bring courseSources with it, or a
      // household that only ever uses question banks). This used to
      // return before either loaded, so a real practice test silently
      // never appeared just because the catalog was empty.
      this._loadPracticeTests();
      this._loadCompletedAttempts();
      return;
    }

    // Enrollment scoping (bookshelf/identity-groundwork sprint): filters to
    // what the active profile has actually enrolled in, once `enrollments`
    // has any rows for this profile. See _applyEnrollmentFilter()'s own
    // comment for the required backfill that keeps this from hiding
    // anything on first load.
    items = await this._applyEnrollmentFilter(items);

    // Same "fetch the real thing" step for every item regardless of which
    // list it came from — ContentLoader.loadJSON already resolves a
    // content/courses/<bundleId>/... path through CourseSourceManager, so
    // a remote item's module/test JSON loads from its own origin here with
    // no special-casing needed.
    const loadedItems = await Promise.all(items.map(async item => {
      try {
        const res = await ContentLoader.loadJSON(`/${item.path}`);
        return { ...res, ...item };
      } catch { return item; }
    }));

    this._catalog = loadedItems;
    LookManager.warmLooks(loadedItems.map((item) => item.look)); // for offline, never awaited
    await this._loadProgress(loadedItems);
    this._loadPracticeTests(); // fire-and-forget — never blocks the main catalog render
    this._loadCompletedAttempts(); // fire-and-forget, same reason
  }

  /**
   * Filters `items` to the active profile's active enrollments. A profile
   * with zero enrollment rows at all — every profile that existed before
   * this shipped, and any brand-new one before it's touched Discover — is
   * treated as enrolled in everything currently visible (never filtered),
   * and gets a one-time silent backfill so it acquires real enrollment rows
   * going forward without ever losing visibility into anything it could
   * already see. Fails open (returns `items` unfiltered) on any error, same
   * posture as every other best-effort catalog read in firstUpdated().
   */
  async _applyEnrollmentFilter(items) {
    if (!this.profileId) return items;
    try {
      const enrollments = await ProgressStore.listEnrollments(this.profileId);
      if (!enrollments.length) {
        this._backfillEnrollments(items); // fire-and-forget — never blocks first render
        return items;
      }
      const enrolledIds = new Set(enrollments.map((e) => e.courseId));
      return items.filter((item) => {
        const bundleId = CourseSourceManager.deriveBundleId('/' + String(item.path).replace(/^\//, ''));
        return !bundleId || enrolledIds.has(bundleId);
      });
    } catch {
      return items;
    }
  }

  /** Gated by a `meta` flag so this only ever runs once per profile — a
   *  second call (e.g. a re-render before the flag write lands) would
   *  otherwise just re-enroll the same bundles again, which `enroll()`'s
   *  own idempotent-upsert already makes harmless, but there's no reason to
   *  pay for it twice. */
  async _backfillEnrollments(items) {
    if (!this.profileId) return;
    const flagKey = `enrollments_backfilled_${this.profileId}`;
    try {
      const flag = await ProgressStore.get('meta', flagKey);
      if (flag?.value) return;
      const bundleIds = new Set();
      for (const item of items) {
        const bundleId = CourseSourceManager.deriveBundleId('/' + String(item.path).replace(/^\//, ''));
        if (bundleId) bundleIds.add(bundleId);
      }
      for (const bundleId of bundleIds) {
        await ProgressStore.enroll(this.profileId, bundleId, { source: 'backfill' });
      }
      await ProgressStore.put('meta', { key: flagKey, value: true });
    } catch { /* best-effort — a broken IDB write here must never surface to the student */ }
  }

  async _loadPracticeTests() {
    if (!this.profileId) return;
    try {
      const rows = await PracticeTestBuilder.listPracticeTests(this.profileId);
      this._practiceTests = rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } catch { /* best-effort — a broken IDB read shouldn't blank the dashboard */ }
  }

  /**
   * One row per testId: this profile's most recently completed attempt, so
   * a test/practice-test card can offer "Review results" instead of only
   * "Start/Retake" once something's actually been submitted. At most one
   * attempt is ever kept per test (see TestEngine.js — a retake wipes the
   * previous completed attempt), so "most recent" and "the only one" are
   * the same thing in practice; sorting here is just defensive.
   */
  async _loadCompletedAttempts() {
    if (!this.profileId) return;
    try {
      const rows = await ProgressStore.getAllFromIndex('testAttempts', 'by_profile', this.profileId);
      const byTest = {};
      // Continue Learning rail (bookshelf sprint): the most recently touched
      // *paused* (no completedAt) attempt per testId — TestEngine.js's
      // saveProgress() already writes lastAccessedAt on every in-progress
      // save.
      const paused = {};
      for (const row of rows) {
        if (row.completedAt) {
          if (!byTest[row.testId] || row.completedAt > byTest[row.testId].completedAt) {
            byTest[row.testId] = row;
          }
        } else if (row.lastAccessedAt && (!paused[row.testId] || row.lastAccessedAt > paused[row.testId])) {
          paused[row.testId] = row.lastAccessedAt;
        }
      }
      this._completedAttempts = byTest;
      this._pausedTests = Object.entries(paused).map(([testId, lastAccessedAt]) => ({ testId, lastAccessedAt }));
    } catch { /* best-effort — a broken IDB read shouldn't blank the dashboard */ }
  }

  /**
   * Real per-module completion, for the card rings.
   *
   * lessonProgress rows are keyed by lessonId, so a module's percentage is
   * "how many of ITS lessons have a completed row". The module JSON was already
   * fetched above, so its lessons[] is in hand and this costs one extra IDB
   * read for the whole page rather than one per card.
   */
  async _loadProgress(items) {
    if (!this.profileId) return;
    let rows = [];
    try {
      rows = await ProgressStore.getAllFromIndex('lessonProgress', 'by_profile', this.profileId);
    } catch { return; }
    this._lessonRows = rows;
    const done = new Set(rows.filter(r => r.completed).map(r => String(r.lessonId).replace(/^\//, '')));
    // Continue Learning rail (bookshelf sprint): last-touched time per
    // lesson, keyed the same normalized way `done` is above.
    const lastAccessedByLesson = {};
    for (const r of rows) {
      if (r.lastAccessedAt) lastAccessedByLesson[String(r.lessonId).replace(/^\//, '')] = r.lastAccessedAt;
    }
    const map = {};
    const moduleLastAccessed = {};
    // A grouped course (groupShelf()) is measured the same way over all its
    // modules' lessons, under its own 'course:<bundleId>' key.
    const courses = this._shelf(items).filter((e) => e.type === 'course');
    for (const item of [...items, ...courses]) {
      const lessons = item.lessons || [];
      if (!lessons.length) continue;
      const bundleId = item.bundleId || this._bundleOf(item);
      let hits = 0;
      let maxAccessed = 0;
      for (const l of lessons) {
        const ref = String(CourseSourceManager.expandRef(l.lessonRef || l, bundleId)).replace(/^\//, '');
        if (done.has(ref)) hits++;
        // A completed lesson still counts as the module being touched:
        // "finished lesson 1 of 3" is exactly when the module should be on
        // the rail. Only a fully complete module is excluded (below).
        if (lastAccessedByLesson[ref]) maxAccessed = Math.max(maxAccessed, lastAccessedByLesson[ref]);
      }
      map[item.path] = hits / lessons.length;
      if (maxAccessed && hits < lessons.length) moduleLastAccessed[item.path] = maxAccessed;
    }
    this._moduleLastAccessed = moduleLastAccessed;
    this._progress = map;
  }

  _bundleOf(item) {
    return CourseSourceManager.deriveBundleId('/' + String(item.path).replace(/^\//, ''));
  }

  /** Shelf entries: modules, with a several-module bundle collapsed into one
   *  course entry (lessonProgressRules.groupShelf()). */
  _shelf(items = this._catalog || []) {
    return groupShelf(items.filter((i) => i.type === 'module'), (m) => this._bundleOf(m));
  }

  /** Where a shelf entry opens: a course page or the module page. */
  _entryHref(item) {
    return item.type === 'course' ? `#/course/${encodeURIComponent(item.bundleId)}` : `#/module/${item.path}`;
  }

  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  getSubjectIcon(subject) {
    const sub = (subject || '').toLowerCase();
    if (sub.includes('bio')) return subjectIcons.biology;
    if (sub.includes('phys')) return subjectIcons.physics;
    if (sub.includes('chem')) return subjectIcons.chemistry;
    if (sub.includes('math')) return subjectIcons.math;
    if (sub.includes('sci')) return subjectIcons.science;
    return subjectIcons.default;
  }

  // `.card-banner`'s colored backgrounds only exist for biology/physics/
  // chemistry/math (see static styles); every other subject code (e.g.
  // "science", the most common one — see content/subjects.json) matched none
  // of them and fell through to the near-white `--gradient-card` default,
  // making the white progress-ring stroke and its rgba(255,255,255,0.3) track
  // invisible in light theme. Bucket by substring, same convention as
  // getSubjectIcon() above, instead of using the raw subject string as the
  // CSS class name.
  getSubjectClass(subject) {
    const sub = (subject || '').toLowerCase();
    if (sub.includes('bio')) return 'biology';
    if (sub.includes('phys')) return 'physics';
    if (sub.includes('chem')) return 'chemistry';
    if (sub.includes('math')) return 'math';
    return 'default';
  }

  /** Groups by literal `subject` field (matching the existing filter-bar's
   *  own grouping, not the bucketed getSubjectClass() used only for banner
   *  color) — a Map so insertion order (roughly catalog order) is stable. */
  _groupBySubject(items) {
    const groups = new Map();
    for (const item of items) {
      const key = item.subject || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return groups;
  }

  _toggleSubjectExpanded(subject) {
    const next = new Set(this._expandedSubjects);
    if (next.has(subject)) next.delete(subject); else next.add(subject);
    this._expandedSubjects = next;
  }

  /**
   * Continue Learning rail entries — an in-progress module (via
   * `_moduleLastAccessed`, computed in `_loadProgress()`) or a paused test/
   * practice-test attempt (via `_pausedTests`, computed in
   * `_loadCompletedAttempts()`), merged and sorted by recency. Computed on
   * every render rather than cached in state: it's a handful of small array
   * operations over data already in memory, and doing it here avoids having
   * to manually re-invalidate a cached rail whenever any of its three
   * source states (`_catalog`/`_moduleLastAccessed`/`_pausedTests`/
   * `_practiceTests`) load independently and out of order.
   */
  _getContinueRailEntries() {
    const entries = [];
    const shelf = this._shelf();
    for (const [path, lastAccessedAt] of Object.entries(this._moduleLastAccessed || {})) {
      // A module inside a grouped course is not a shelf entry; its course is.
      const item = shelf.find((i) => i.path === path);
      if (item) entries.push({ kind: 'module', item, lastAccessedAt });
    }
    for (const { testId, lastAccessedAt } of this._pausedTests || []) {
      if (testId.startsWith('practice:')) {
        const ptId = testId.slice('practice:'.length);
        const pt = this._practiceTests?.find((p) => p.practiceTestId === ptId);
        if (pt) entries.push({ kind: 'practice', pt, testId, lastAccessedAt });
      } else {
        const item = this._catalog?.find((i) => i.type === 'test' && i.path.replace(/^content\//, '') === testId);
        if (item) entries.push({ kind: 'test', item, testId, lastAccessedAt });
      }
    }
    return entries.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt).slice(0, 6);
  }

  /** A module's progress on its banner: the ring, or just the percent while
   *  gamification is off (nothing yet = nothing shown). */
  _renderProgress(item) {
    const value = this._progress[item.path] ?? 0;
    if (this.gamified) {
      return html`<progress-ring .value=${value} label="${item.title?.en || 'Course'} progress"></progress-ring>`;
    }
    const pct = Math.round(value * 100);
    return pct ? html`<span class="banner-pct">${pct}%</span>` : '';
  }

  /** A look's course cover for a card banner (plain); nothing under Quill. */
  _cover(seed, subject, heading) {
    if (this.look !== 'plain') return '';
    const sub = subject ? String(subject).charAt(0).toUpperCase() + String(subject).slice(1) : '';
    return html`<look-cover seed=${seed || ''} subject=${sub} heading=${heading || ''}></look-cover>`;
  }

  /** plain: "N lessons" after a card's kind, and a meter in its footer. */
  _lessonCount(item) {
    const n = item.lessons?.length || 0;
    return this.look === 'plain' && n ? ` \u00b7 ${n} ${n === 1 ? 'lesson' : 'lessons'}` : '';
  }

  _cardMeter(item) {
    const n = item.lessons?.length || 0;
    if (this.look !== 'plain' || !n || this.gamified) return null;
    const value = this._progress[item.path] ?? 0;
    const done = Math.round(value * n);
    return html`
      <span class="card-meter">
        <span>${done ? html`<b>${done}</b> of ${n} done` : 'Not started'}</span>
        <span class="bar" aria-hidden="true"><i style="width: ${Math.round(value * 100)}%"></i></span>
      </span>
    `;
  }

  /** plain: a count at the right of a section rule. */
  _count(n, one, many) {
    return this.look === 'plain' && n ? html`<span class="section-count">${n} ${n === 1 ? one : many}</span>` : '';
  }

  /** Smaller variant of the module/test cards below — same `.card`/
   *  `.card-banner`/`progress-ring` markup, no new visual language, just a
   *  denser grid (`.rail-grid`) and no tags/description/footer. */
  _renderRailCard(entry) {
    if (entry.kind === 'module') {
      const icon = this.getSubjectIcon(entry.item.subject);
      const bannerClass = this.getSubjectClass(entry.item.subject);
      return html`
        <a href=${this._entryHref(entry.item)} class="card">
          <div class="card-banner ${bannerClass}">
            ${this._cover(entry.item.path, entry.item.subject, entry.item.title?.en || entry.item.title)}
            <span class="banner-icon">${icon}</span>
            ${this._renderProgress(entry.item)}
          </div>
          <div class="card-body">
            <div class="card-type">Continue</div>
            <h3>${entry.item.title?.en || entry.item.title || 'Module'}</h3>
          </div>
        </a>
      `;
    }
    if (entry.kind === 'test') {
      return html`
        <a href="#/test/${entry.testId}" class="card">
          <div class="card-banner math">${this._cover(entry.testId, entry.item.subject || 'Test', entry.item.title?.en || entry.item.title)}<span class="banner-icon">${subjectIcons.test}</span></div>
          <div class="card-body">
            <div class="card-type">Resume Test</div>
            <h3>${entry.item.title?.en || entry.item.title || 'Test'}</h3>
          </div>
        </a>
      `;
    }
    return html`
      <a href="#/test/${entry.testId}" class="card">
        <div class="card-banner default">${this._cover(entry.testId, 'Practice', entry.pt.title?.en || entry.pt.title)}<span class="banner-icon">${subjectIcons.target}</span></div>
        <div class="card-body">
          <div class="card-type">Resume Practice</div>
          <h3>${entry.pt.title?.en || entry.pt.title || 'Practice Test'}</h3>
        </div>
      </a>
    `;
  }

  /** The module the hero card features: the most recently touched one with
   *  lessons left, else (first visit) the first module on the shelf. */
  _heroModule(modules) {
    const recent = Object.entries(this._moduleLastAccessed || {})
      .sort((a, b) => b[1] - a[1])
      .map(([path]) => modules.find((m) => m.path === path))
      .find(Boolean);
    return recent || modules[0] || null;
  }

  _renderHero(modules) {
    const item = this._heroModule(modules);
    if (!item || !(item.lessons || []).length) return '';
    // A course entry continues across its modules in order; a module is a
    // course of one.
    const parts = item.type === 'course' ? item.modules : [item];
    const expand = CourseSourceManager.expandRef.bind(CourseSourceManager);
    const partRefs = parts.map((m) => moduleLessonRefs(m, this._bundleOf(m), expand));
    const byRef = {};
    for (const r of this._lessonRows || []) byRef[String(r.lessonId).replace(/^\//, '')] = r;
    const { done, total, next } = courseProgress(partRefs, byRef);
    const at = next || { moduleIndex: 0, lessonIndex: 0 };
    const part = parts[at.moduleIndex];
    const ref = partRefs[at.moduleIndex][at.lessonIndex];
    const i = at.lessonIndex;
    const lessonTitle = part.lessons[i]?.title?.en || `Lesson ${i + 1}`;
    const verb = !next ? 'Review' : (byRef[ref]?.currentIndex > 0 ? 'Continue' : 'Start');
    const subject = item.subject ? item.subject.charAt(0).toUpperCase() + item.subject.slice(1) : '';
    const partsLabel = item.type === 'course' ? `${parts.length} parts` : '';
    return html`
      <module-hero-card
        .kicker=${[subject, gradeLabel(item.grade), partsLabel].filter(Boolean).join(' \u00b7 ')}
        .heading=${item.title?.en || item.title || 'Module'}
        .tagline=${item.type === 'course' ? `Part ${at.moduleIndex + 1}: ${part.title?.en || part.title || ''}` : (item.description?.en || item.description || '')}
        .progress=${total ? done / total : 0}
        .done=${done}
        .total=${total}
        .ctaLabel=${`${verb}: ${lessonTitle}`}
        .ctaHref=${`#/lesson/${ref}?module=${encodeURIComponent(part.path)}`}
        .coverSeed=${item.path}
        .coverSubject=${subject}
      ></module-hero-card>
    `;
  }

  render() {
    // Shelf entries (modules, and courses grouping a bundle's modules).
    const modules = this._shelf();
    const tests = this._catalog?.filter(item => item.type === 'test') || [];
    // A banks-only course source (see CourseSourceManager.listCatalogItems())
    // has no modules/tests of its own — without its own section here, adding
    // one produced zero cards anywhere on this screen, making it look like
    // the add silently failed even though it registered correctly and is
    // already available to the parent's Practice Test wizard
    // (PracticeTestBuilder.listAvailableBanks() already handles this type
    // fine — this was purely a rendering gap, not a data/registration bug).
    const banks = this._catalog?.filter(item => item.type === 'bank') || [];

    const uniqueSubjects = [...new Set(this._catalog?.map(i => i.subject).filter(Boolean))].sort();
    const uniqueGrades = [...new Set(this._catalog?.map(i => i.grade).filter(g => g != null && String(g).trim() !== ''))].sort(compareGrades);

    let activeModules = modules;
    let activeTests = tests;
    let activeBanks = banks;

    if (this._subjectFilter) {
      activeModules = activeModules.filter(m => m.subject === this._subjectFilter);
      activeTests = activeTests.filter(t => t.subject === this._subjectFilter);
      activeBanks = activeBanks.filter(b => b.subject === this._subjectFilter);
    }
    if (this._gradeFilter) {
      activeModules = activeModules.filter(m => String(m.grade) === this._gradeFilter);
      activeTests = activeTests.filter(t => String(t.grade) === this._gradeFilter);
      activeBanks = activeBanks.filter(b => String(b.grade) === this._gradeFilter);
    }

    const renderTags = (item) => html`
      <div class="tags-container">
        ${item._needsUpdate || needsNewerEngine(item) || (item.modules || []).some((m) => m._needsUpdate || needsNewerEngine(m)) ? html`<span class="tag-pill">${tr('course.needs_update_badge', 'Needs update')}</span>` : ''}
        ${item.subject ? html`<span class="tag-pill">${item.subject}</span>` : ''}
        ${gradeLabel(item.grade) ? html`<span class="tag-pill grade">${gradeLabel(item.grade)}</span>` : ''}
        ${item._remoteSource && item.type !== 'course' ? html`<span class="tag-pill" title="Hosted outside this app — added under Parent Dashboard → Course Content Sources">${brandIcon('remote')} ${item._remoteTitle}</span>` : ''}
      </div>
    `;

    // A completed attempt (see _loadCompletedAttempts()) means this test can
    // be reviewed as-submitted, not just started fresh — retaking it later
    // wipes that record (TestEngine.js), so this link is the only way back
    // to it once a new attempt begins.
    const renderReviewLink = (testId) => {
      const attempt = this._completedAttempts[testId];
      if (!attempt) return '';
      const pct = attempt.maxScore > 0 ? Math.round((attempt.totalScore / attempt.maxScore) * 100) : 0;
      // A <button>, not a nested <a> — the card itself is already an <a>,
      // and an anchor-inside-an-anchor gets silently split/hoisted by the
      // HTML parser. preventDefault+stopPropagation keeps a click here from
      // also triggering the card's own "start a fresh attempt" navigation.
      const goToReview = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.location.hash = `#/test/${testId}?review=1`;
      };
      return html`
        <button type="button" class="review-link" @click=${goToReview}>
          Review last attempt (${pct}%)
        </button>
      `;
    };

    // Clicking the card itself (not the "Review last attempt" link) used to
    // silently start a brand-new attempt over an already-completed one, with
    // the only way back to the old result being the easy-to-miss review link
    // above. Once a completed attempt exists, intercept the navigation and
    // make the choice explicit instead.
    const handleCardClick = (e, testId) => {
      const attempt = this._completedAttempts[testId];
      if (!attempt) return;
      e.preventDefault();
      showConfirm(
        'You already completed this test. Retaking it will replace your previous result.',
        'Test already attempted',
        'Retake Test',
        'Review Results'
      ).then(retake => {
        window.location.hash = retake ? `#/test/${testId}` : `#/test/${testId}?review=1`;
      });
    };

    const initial = (this.userName || 'S').charAt(0).toUpperCase();

    // Auto daily/weekly practice (practice-today-card) is started from its own
    // card, and a new row is saved each day. The list keeps an auto row only
    // while it has a result from the last 7 days to review; a paused one is
    // already in "Also in progress".
    const weekAgo = Date.now() - 7 * 864e5;
    const listedPractice = this._practiceTests.filter((pt) => pt.source !== 'auto'
      || (this._completedAttempts[`practice:${pt.practiceTestId}`] && (pt.updatedAt || 0) >= weekAgo));

    return html`
      <div class="greet">
        ${this.look === 'plain' ? html`<div class="dateline">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>` : ''}
        <h1>${this.getGreeting()}, ${this.userName}</h1>
        ${this.gamified ? html`<streak-badge></streak-badge>` : ''}
      </div>

      ${this._renderHero(activeModules)}

      <practice-today-card .profileId="${this.profileId}"></practice-today-card>
      ${this._renderFlagNudge()}

      ${this._error && !this._catalog.length ? html`
        <div class="empty-state">
          <h3>No Content Published Yet</h3>
          <p>Once authors approve modules and tests, they will appear here automatically.</p>
        </div>
      ` : ''}

      ${(() => {
        // Renders nothing on a first visit — an empty rail would just be a
        // second, redundant empty-state band above the real content below.
        const heroPath = this._heroModule(activeModules)?.path;
        const railEntries = this._getContinueRailEntries().filter((e) => e.item?.path !== heroPath);
        return railEntries.length ? html`
          <h3 class="section-title">Also in progress${this._count(railEntries.length, 'item', 'items')}</h3>
          <div class="grid rail-grid">
            ${railEntries.map((entry) => this._renderRailCard(entry))}
          </div>
        ` : '';
      })()}

      ${this._catalog && this._catalog.length > 0 ? html`
        <div class="filter-bar">
          <span class="filter-label">Show</span>
          <button class="ftab" aria-pressed=${!this._subjectFilter && !this._gradeFilter}
            @click=${() => { this._subjectFilter = ''; this._gradeFilter = ''; }}>Everything</button>
          ${uniqueSubjects.map(sub => html`
            <button class="ftab" aria-pressed=${this._subjectFilter === sub}
              @click=${() => { this._subjectFilter = this._subjectFilter === sub ? '' : sub; }}>${sub}</button>`)}
          ${uniqueGrades.map(g => html`
            <button class="ftab" aria-pressed=${this._gradeFilter === String(g)}
              @click=${() => { this._gradeFilter = this._gradeFilter === String(g) ? '' : String(g); }}>${gradeLabel(g)}</button>`)}
        </div>
      ` : ''}

      ${activeModules.length ? html`
        <h3 class="section-title">Your courses${this._count(activeModules.length, 'course', 'courses')}</h3>
        ${[...this._groupBySubject(activeModules).entries()].map(([subject, subjectItems]) => {
          const expanded = this._expandedSubjects.has(subject);
          const visible = expanded ? subjectItems : subjectItems.slice(0, 6);
          return html`
            <h4 class="subject-group-title">${subject}</h4>
            <div class="grid">
              ${visible.map(item => {
                const icon = this.getSubjectIcon(item.subject);
                const bannerClass = this.getSubjectClass(item.subject);
                return html`
                  <a href=${this._entryHref(item)} class="card">
                    <div class="card-banner ${bannerClass}">
                      ${this._cover(item.path, item.subject, item.title?.en || item.title)}
                      <span class="banner-icon">${icon}</span>
                      ${this._renderProgress(item)}
                    </div>
                    <div class="card-body">
                      <div class="card-type">${item.type === 'course' ? `Course \u00b7 ${item.modules.length} parts` : 'Module'}${this._lessonCount(item)}</div>
                      <h3>${item.title?.en || item.title || item.path.split('/').pop().replace('.json', '')}</h3>
                      ${renderTags(item)}
                      <p>${item.type === 'course'
                        ? item.modules.map((m) => m.title?.en || m.title).filter(Boolean).join(' \u00b7 ')
                        : (item.description?.en || item.description || '')}</p>
                      <div class="card-footer">
                        ${this._cardMeter(item) || html`<span style="font-size: 0.8rem; font-weight: var(--fw-medium); color: var(--text-muted);">${brandCopy('cardKind', '')}</span>`}
                        <span class="btn-3d btn-primary btn-sm">${brandCopy('cardCta', 'Open')}</span>
                      </div>
                    </div>
                  </a>
                `;
              })}
            </div>
            ${subjectItems.length > 6 ? html`
              <button class="ftab" style="margin: -1rem 0 2rem;" @click=${() => this._toggleSubjectExpanded(subject)}>
                ${expanded ? 'Show less' : `Show ${subjectItems.length - 6} more`}
              </button>
            ` : ''}
          `;
        })}
      ` : ''}

      ${activeBanks.length ? html`
        <h3 class="section-title">Question banks</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin: -0.5rem 0 1rem;">
          These are pools of practice questions, not ready-to-take tests — ${this.adult ? 'build one into a Practice Test from Progress and settings → Practice.' : 'ask a parent to build one into a Practice Test from Parent Area → Practice Tests.'}
        </p>
        <div class="grid">
          ${activeBanks.map(item => {
            const icon = this.getSubjectIcon(item.subject);
            const bannerClass = this.getSubjectClass(item.subject);
            return html`
              <div class="card">
                <div class="card-banner ${bannerClass}">
                  ${this._cover(item.path, item.subject, item.title?.en || item.title)}
                  <span class="banner-icon">${icon}</span>
                </div>
                <div class="card-body">
                  <div class="card-type">Question Bank</div>
                  <h3>${item.title?.en || item.title || item.path.split('/').pop().replace('.json', '')}</h3>
                  ${renderTags(item)}
                  <p>${item.questions?.length || 0} question${item.questions?.length === 1 ? '' : 's'} available</p>
                </div>
              </div>
            `;
          })}
        </div>
      ` : ''}

      <h3 class="section-title">Practice tests and quizzes${this._count(listedPractice.length + activeTests.length, 'test', 'tests')}</h3>
      ${!listedPractice.length ? html`
        <p style="color: var(--text-muted); font-size: 0.85rem; margin: -0.5rem 0 1rem;">
          ${this.adult ? 'Build your own practice tests from Progress and settings → Practice. They will show up here.' : 'Custom practice tests are built by a parent from Parent Area → Practice Tests. Any they create for you will show up here.'}
        </p>
      ` : ''}
      <div class="grid">
          ${listedPractice.map(pt => { const testId = `practice:${pt.practiceTestId}`; return html`
            <a href="#/test/${testId}" class="card" @click=${(e) => handleCardClick(e, testId)}>
              <div class="card-banner default">
                ${this._cover(testId, 'Practice', pt.title?.en || pt.title)}
                <span class="banner-icon">${subjectIcons.target}</span>
              </div>
              <div class="card-body">
                <div class="card-type">Practice Test · ${pt.source === 'auto' ? 'Auto-built' : 'Your picks'}</div>
                <h3>${pt.title?.en || pt.title || 'Practice Test'}</h3>
                <p>${pt.questions?.length || 0} question${pt.questions?.length === 1 ? '' : 's'}${pt.durationMinutes ? ` · ~${pt.durationMinutes} min` : ''}</p>
                ${renderReviewLink(testId)}
                <div class="card-footer">
                  <span style="font-size: 0.8rem; font-weight: var(--fw-medium); color: var(--text-muted);">Saved on this device</span>
                  <span class="btn-3d btn-primary btn-sm">${this._completedAttempts[testId] ? 'Retake Test →' : 'Start Test →'}</span>
                </div>
              </div>
            </a>
          `; })}
          ${activeTests.map(item => {
            const icon = subjectIcons.test;
            const testId = item.path.replace(/^content\//, '');
            return html`
              <a href="#/test/${testId}" class="card" @click=${(e) => handleCardClick(e, testId)}>
                <div class="card-banner math">
                  ${this._cover(testId, item.subject || 'Test', item.title?.en || item.title)}
                  <span class="banner-icon">${icon}</span>
                </div>
                <div class="card-body">
                  <div class="card-type">Mock Exam</div>
                  <h3>${item.title?.en || item.title || item.path.split('/').pop().replace('.json', '')}</h3>
                  ${renderTags(item)}
                  <p>${item.questions ? `${item.questions.length} Questions` : 'Self-assessment quiz'}</p>
                  ${renderReviewLink(testId)}
                  <div class="card-footer">
                    <span style="font-size: 0.8rem; font-weight: var(--fw-medium); color: var(--text-muted);">Timed Quiz</span>
                    <span class="btn-3d btn-primary btn-sm">${this._completedAttempts[testId] ? 'Retake Test →' : 'Start Test →'}</span>
                  </div>
                </div>
              </a>
            `;
          })}
        </div>

      ${this._catalog?.length > 0 && activeModules.length === 0 && activeTests.length === 0 && activeBanks.length === 0 ? html`
        <div class="empty-state">
          <h3>No matches found</h3>
          <p>Try clearing your filters to see more content.</p>
        </div>
      ` : ''}
    `;
  }
}

customElements.define('home-dashboard', HomeDashboard);

