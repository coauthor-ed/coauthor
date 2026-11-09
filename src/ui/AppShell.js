import { LitElement, html, css } from 'lit';
import { AuthService } from '../core/AuthService.js';
import { SyncManager } from '../core/SyncManager.js';
import { ProgressStore } from '../core/ProgressStore.js';
import { ThemeManager } from '../core/ThemeManager.js';
import { CourseSourceManager } from '../core/CourseSourceManager.js';
import { DeviceIdentity } from '../core/DeviceIdentity.js';
import { AssetPrefetcher } from '../core/AssetPrefetcher.js';
import { LoadingIndicator } from '../core/LoadingIndicator.js';
import { GamificationService } from '../core/GamificationService.js';
import { EventBus } from '../core/EventBus.js';
import { btn3dStyles } from './sharedStyles.js';
import { iconHome, iconBack, iconPrev, iconNext, iconSubmit, iconAutoplay } from './icons/navIcons.js';
import { iconSun, iconMoon, iconBookClosed, iconBookOpen, iconSearch, iconGuide } from './icons/uiIcons.js';
import { LessonModeManager } from '../core/LessonModeManager.js';
import { LookManager } from '../core/LookManager.js';
import { SimViewPrefs } from '../core/SimViewPrefs.js';
import { changePage } from './pageChange.js';
import './components/ToastZone.js';
import './components/LookSlots.js';
import './components/GuideHelp.js';
import { answerPageQueries } from '../core/components/stageAnswer.js';

// Story's fireflies: fixed random positions/paths, generated once.
const FIREFLIES = Array.from({ length: 9 }, () => html`<i style="${[
  `left:${(Math.random() * 100).toFixed(1)}%`,
  `top:${(12 + Math.random() * 76).toFixed(1)}%`,
  `--dur:${(7 + Math.random() * 8).toFixed(1)}s`,
  `--del:${(-Math.random() * 12).toFixed(1)}s`,
  `--dx:${Math.round(Math.random() * 140 - 70)}px`,
  `--dy:${Math.round(Math.random() * 100 - 50)}px`,
].join(';')}"></i>`);

export class AppShell extends LitElement {
  static styles = [btn3dStyles, css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      font-family: var(--font-family);
      position: relative;
    }

    /* Page backdrop. Classic is matte paper (prototype v2 a/: "no glass"),
       so this is a flat fill now; the element stays so a lesson mode can dress
       it (Story's paper grain) without touching the routes. Fixed and behind
       everything, never an ancestor of content, so it can never become a
       containing block for a position:fixed overlay. */
    .cosmos {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background: var(--bg-base);
    }

    /* Story's paper (prototype v2 b/): a grain tile over the backdrop and a
       few drifting fireflies. Both live in this fixed, pointer-less layer
       BEHIND content (z-index 0), never as an ancestor of it, so they can
       never become a containing block for a fixed overlay. The grain is a
       file, not a data: URI (CSP img-src has no data:). Fireflies stop under
       reduced motion. */
    :host([data-lesson-mode="story"]) .cosmos::after {
      content: '';
      position: absolute;
      inset: 0;
      background: url('assets/textures/paper-grain.svg');
      opacity: 0.09;
      mix-blend-mode: multiply;
    }
    :host([data-lesson-mode="story"][data-theme="dark"]) .cosmos::after { mix-blend-mode: normal; opacity: 0.06; }
    .fireflies i {
      position: absolute;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--accent-gold);
      opacity: 0;
      animation: fly var(--dur, 10s) ease-in-out var(--del, 0s) infinite;
    }
    @keyframes fly {
      0%, 100% { transform: translate(0, 0); opacity: 0; }
      18%, 68% { opacity: 0.55; }
      50% { transform: translate(var(--dx, 40px), var(--dy, -30px)); }
    }
    @media (prefers-reduced-motion: reduce) { .fireflies { display: none; } }

    header, main { position: relative; z-index: 1; }
    /* main is a stacking context, and a lesson's position:fixed bottom bar /
       turn-nav lives inside it, so the bar paints at main's level. Nothing
       after main may share that level (a footer used to, and covered the bar
       at page end; tools/ui-harness/check-modes.mjs guards this). Room at the
       end of a lesson comes from LessonSession's own .content-area padding
       (--lesson-chrome-bottom), not from anything in this shell. */
    main { z-index: 2; }

    /* Flat, full-bleed sticky bar (prototype v2 a/ .topbar): a 2px rule
       instead of the old floating glass pill. No backdrop-filter, which was
       also a repaint cost on low-end devices. Content is centred to the same
       width as main via inline padding, so the bar itself spans the page. */
    header {
      position: sticky;
      top: 0;
      z-index: 90;
      width: 100%;
      box-sizing: border-box;
      margin: 0;
      padding: 10px max(var(--space-4), calc((100% - 1180px) / 2));
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-4);
      background: var(--appbar-bg, var(--bg-base));
      border-bottom: var(--rule-w) solid var(--border-color);
      color: var(--text-main);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin: 0;
      font-family: var(--font-heading);
      font-size: var(--fs-h3);
      font-weight: var(--fw-strong);
      color: var(--text-main);
    }
    .brand app-logo > * { --logo-size: 34px; }
    nav {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      /* Unconditional, not just at a narrow-viewport breakpoint: an actual
         browser window can be any width, not just the handful of device
         widths a media query tests against, and .session-nav-group is
         flex-shrink:0/nowrap below (it never shrinks or reflows internally)
         — so if the full row genuinely doesn't fit, this is what lets an
         *entire* item (the whole session-nav-group, or Home, or the theme
         button) drop to a second line as a unit, rather than the group
         itself overflowing the header or one of its buttons getting
         orphaned mid-group. */
      flex-wrap: wrap;
    }
    nav a {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--text-muted);
      text-decoration: none;
      font-weight: var(--fw-heavy);
      font-size: var(--fs-small);
      padding: 6px 12px;
      border-radius: var(--radius-pill);
      transition: color var(--motion-fast), background var(--motion-fast);
    }
    nav a:hover { color: var(--text-main); background: var(--bg-panel); text-decoration: none; }
    /* Square 3D icon buttons (prototype v2 a/ .icon-btn): the theme toggle
       and the lesson-mode book. Icon-only always; aria-label carries the
       name. The glyph spins in on every toggle (.spin, re-armed per click). */
    .icon-btn {
      display: inline-grid;
      place-items: center;
      width: 42px;
      height: 42px;
      padding: 0;
      box-sizing: border-box;
      border-radius: var(--radius-icon-btn);
      border: var(--rule-w) solid var(--border-color);
      background: var(--bg-surface);
      color: var(--text-main);
      box-shadow: var(--lip) var(--lip-color);
      cursor: pointer;
      overflow: hidden;
      transition: transform 80ms, box-shadow 80ms, border-color var(--motion-fast);
    }
    .icon-btn:hover { border-color: var(--border-hover); }
    .icon-btn:active { transform: translateY(var(--press-travel-sm)); box-shadow: none; }
    .icon-btn:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }
    .icon-btn[aria-pressed="true"] { color: var(--primary-text); }
    .icon-btn.spin svg { animation: icon-spin 450ms var(--ease-overshoot); }
    @keyframes icon-spin { from { transform: var(--spin-from); } to { transform: none; } }
    @media (prefers-reduced-motion: reduce) {
      .icon-btn { transition: none; }
      .icon-btn.spin svg { animation: none; }
    }
    main {
      flex: 1;
      width: min(1100px, calc(100% - var(--space-6)));
      margin: 0 auto;
      padding: var(--space-6) 0;
      display: flex;
      flex-direction: column;
    }
    @media (max-width: 768px) {
      header {
        padding: 8px var(--space-3);
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      /* No forced width:100%/justify-content:flex-end here (there used to
         be one) — that unconditionally dropped nav onto its own full-width
         row below the brand even once the brand shrank to just its logo
         (icon-only mode below), wasting a whole row for one small icon. Nav
         now sizes to its own content and simply sits beside the brand via
         header's own justify-content:space-between, falling back to
         header's flex-wrap only if the two genuinely don't fit side by side. */
      main { width: calc(100% - var(--space-4)); padding: var(--space-4) 0; }
    }
    /* Short landscape (design-system §3): a sticky pill eats a phone's whole
       usable height here, so it scrolls away with the content instead. */
    @media (max-height: 460px) and (orientation: landscape) {
      header { position: static; }
    }

    /* Immersive routes (a lesson or a test). Both draw their own sticky
       progress bar below this one, so a second permanently-stuck bar above it
       would be redundant AND expensive: together they'd cost real viewport
       height the slide's image or simulation needs. The pill still renders
       at the top of the page, it just scrolls away — unless the session has
       merged its own nav controls into *this* bar instead ([data-lesson-nav]
       / [data-test-nav], set by AppShell itself from LessonSession's
       'lesson:header-nav' / TestSession's 'test:header-nav' events; see
       .session-nav-group below), in which case this bar stays sticky and the
       session's own remaining sticky bar (just the progress meter/question
       count) sits below it, offset by the measured height published to
       --appbar-offset in firstUpdated(). */
    :host([data-immersive]:not([data-lesson-nav]):not([data-test-nav])) header { position: static; }

    /* A session also governs its own width. LessonSession sets
       max-width: min(1600px, 94vw) deliberately (see its comment: a canvas
       scene scaled into a narrow column renders blurry, not merely small).
       Capping main at 1100px silently overrode that, and the narrower column
       rewrapped prose into more lines, pushing the simulation further down. */
    :host([data-embed]) main.embed { width: 100%; box-sizing: border-box; padding: 6px 10px; }

    :host([data-immersive]) main {
      width: 100%;
      /* border-box: width:100% plus this padding made main 32px wider than
         the viewport (html's overflow-x:hidden clipped it, so lessons were
         silently cut off at the right edge, worst on phones). */
      box-sizing: border-box;
      /* 16px all round, matching what main had before this sprint, so a slide's
         vertical budget is byte-for-byte what the lesson was authored against.
         A look may trim the top and bottom (plain: look.css); unset, 16px. */
      padding: var(--shell-main-pad-top, var(--space-4)) var(--space-4) var(--shell-main-pad-bottom, var(--space-4));
    }

    /* A session's own navigation controls, merged into this bar instead of a
       second sticky bar drawn by the session itself — LessonSession's
       Back/Autoplay/Previous/Next (see 'lesson:header-nav') and TestSession's
       Previous/Next/Submit (see 'test:header-nav') both render into this same
       class, one at a time (only one of the two routes is ever mounted). See
       the [data-lesson-nav]/[data-test-nav] carve-out on the [data-immersive]
       rule above this block for why the bar itself stays sticky while either
       is active. */
    .session-nav-group {
      display: flex;
      align-items: center;
      /* Deliberately the opposite of what you'd reach for first: this group
         must never reflow *internally*. flex-wrap:wrap here (an earlier
         version of this rule) let Back/Autoplay/Previous fit on the row
         while Next alone got pushed to a second line — a single button
         orphaned away from its own group, at almost any desktop width
         narrower than "quite wide" once Home/profile/theme's width was
         subtracted from what was left. flex-shrink:0 is what actually fixes
         it: the group holds its natural width and never gets squeezed, so if
         it doesn't fit next to the rest of nav, nav's own flex-wrap (above)
         moves the *whole* group down as one atomic unit instead. */
      flex-wrap: nowrap;
      flex-shrink: 0;
      gap: var(--space-2);
      padding-right: var(--space-3);
      margin-right: var(--space-1);
      border-right: 1px solid var(--border-color);
    }
    /* sharedStyles.js's .btn-3d centers its own content but sets no gap, so
       the icon and label sit flush against each other without this. */
    .session-nav-group button, nav a {
      gap: 6px;
    }
    /* session-nav-group (3-4 buttons) plus brand/Home/profile/theme, all as
       full text/wordmark, is simply too much content for anything short of a
       genuinely wide window — not just phone widths. Below this, everything
       collapses to icon-only (aria-label/title carry the accessible name
       instead) so the whole bar keeps fitting on one row; the flex-shrink:0
       fallback above still catches whatever this breakpoint doesn't (a long
       profile name, an unusually narrow window at a size no breakpoint
       targets). Wide on purpose — 900px, not a phone-only ~480/600px — since
       an ordinary desktop browser resized to "not quite full width" (a
       tiled/half-screen window, say) is exactly the case that used to orphan
       the Next button while still clearly being "desktop", not mobile. */
    @media (max-width: 900px) {
      /* Was 4px — with icon-only buttons this close together, a thumb aimed
         at one edge of the row reliably lands on its neighbour instead
         (reported as accidental taps on the wrong control). 8px between
         adjacent icon buttons is the minimum gap that actually reads as
         "two separate targets" rather than one continuous tap strip; this
         still fits one row at phone-portrait width (~375px) with room to
         spare, so there's no fit-vs-safety trade-off to make here. */
      nav { gap: 6px; }
      .session-nav-group {
        gap: 8px;
        /* Every button in this row is icon-only now, so the divider that
           separated a wordy "session controls" cluster from "site nav" reads
           as visual noise at this size — worse, its padding/margin was
           exactly the few pixels this row needed to clear profile-switcher's
           name pill without wrapping. */
        padding-right: 0;
        margin-right: 0;
        border-right: none;
      }
      .brand app-logo > *::part(word) { display: none; }
      .nav-label { display: none; }
      .look-help { display: none; }
      /* .btn-3d.btn-sm (sharedStyles.js, 2 classes) otherwise beats the
         plain-class/descendant selector this would be at equal weight — the
         extra .btn-3d here is what wins the specificity, not just order.
         10px (was 8px) grows each button's own tap target too, not just the
         gap between them — LessonSession's compact-controls strip already
         established 44px as this repo's accessible touch-target floor; this
         doesn't quite reach that (there just isn't 44px×7 of row width to
         give it at 375px with profile-switcher also sharing the row), but
         it's the most headroom available before one-row-at-phone-width stops
         being possible. */
      .session-nav-group button.btn-3d.btn-sm, nav a {
        padding: 10px;
      }
      .icon-btn { width: 38px; height: 38px; }
    }
    /* Phone portrait: the bar used to wrap to three rows (148px at 360 wide
       inside a lesson). Discover and Guides move into the student menu below
       480px, and the theme toggle below 350px (ProfileSwitcher shows the
       same items at the same widths), so the bar stays one row down to 320. */
    @media (max-width: 480px) {
      nav a.in-menu-narrow { display: none; }
    }
    @media (max-width: 350px) {
      .theme-btn { display: none; }
    }
    /* Short landscape while viewing lesson content specifically
       ([data-lesson-nav], set only while a lesson session is mounted —
       never for a test session or any other route): vertical space is the
       scarcest thing on a rotated phone, and LessonSession swaps to its own
       floating compact-controls strip on the right edge below this same
       breakpoint (see LessonSession.js), carrying Home/Back/Autoplay/
       Previous/Next. That makes this whole bar — brand, the merged
       session-nav-group, Home link, profile switcher, theme toggle —
       redundant weight sitting above the slide, not just a second copy of
       the nav buttons, so it's removed outright here rather than just
       de-stickied. A test session ([data-test-nav], no [data-lesson-nav])
       has no such floating strip of its own, so it keeps this bar — sticky,
       carrying its merged Previous/Next/Submit — since that's the only way
       to reach those controls without scrolling once this bar is gone. */
    @media (max-height: 600px) and (orientation: landscape) {
      :host([data-lesson-nav]) header { display: none; }
    }
  `];

  static properties = {
    currentView: { type: Object, state: true },
    isOnboarding: { type: Boolean, state: true },
    currentUser: { type: Object, state: true },
    // Mirrors LessonSession's own nav state, published over EventBus (see
    // 'lesson:header-nav' below) so its Back/Autoplay/Previous/Next controls
    // can be rendered here instead of in a second bar. Never set directly by
    // any other route — module-dashboard etc. simply never emit the event,
    // so `active` stays false and this bar renders exactly as it always did
    // for them.
    _headerNav: { type: Object, state: true },
    // Same pattern, published by TestSession's own 'test:header-nav' — its
    // Previous/Next/Submit controls merge into the same bar (see
    // .session-nav-group below), independently of _headerNav.
    _testNav: { type: Object, state: true },
    // Mirrors html[data-theme] / LessonModeManager so the two toggle icons
    // show the current state (and the mode book hides in a story-only module).
    _theme: { type: String, state: true },
    _lessonMode: { type: String, state: true },
    _modeForced: { type: Boolean, state: true },
    // A site route (the landing page, the guides) owns the whole page: no app bar.
    _site: { type: Boolean, state: true },
    // A guide opened over a lesson or test ('guide:open'), so the student
    // keeps their place. { slug, h } or null.
    _sheet: { type: Object, state: true },
    // A content preview inside another page's iframe (?embed=1): no app bar.
    _embed: { type: Boolean, state: true }
  };

  constructor() {
    super();
    this.currentView = null;
    this.isOnboarding = false;
    this.currentUser = null;
    this._headerNav = { active: false, canGoBack: false, canGoForward: true, autoplay: false, narrated: false, backLabel: 'Home' };
    this._testNav = { active: false, canGoBack: false, canGoForward: true, isLastQuestion: false };

    // LessonSession → this bar. See _setImmersive()'s comment and the
    // .session-nav-group styles above.
    EventBus.on('lesson:header-nav', (state) => {
      this._headerNav = { ...this._headerNav, ...state };
      this.toggleAttribute('data-lesson-nav', this._headerNav.active);
      this._updateAppbarOffset();
    });

    // TestSession → this bar, same mechanism as lesson's own nav above.
    EventBus.on('test:header-nav', (state) => {
      this._testNav = { ...this._testNav, ...state };
      this.toggleAttribute('data-test-nav', this._testNav.active);
      this._updateAppbarOffset();
    });

    // Initialize SyncManager
    SyncManager.init();

    // Warm the registered-remote-course-sources cache — resolveContentUrl()
    // (used from synchronous render paths) reads it synchronously and fails
    // safe to "treat as local" until this resolves, so this is fire-and-
    // forget rather than something the rest of startup needs to await.
    // seedDefaults() (auto-registers defaultCourseSources.js's baked-in
    // library, respecting anything the user has already added/removed —
    // see CourseSourceManager.js) chains after it so the cache is warm
    // before it runs, same fire-and-forget reasoning.
    CourseSourceManager.init().then(() => CourseSourceManager.seedDefaults());

    // Same fire-and-forget reasoning as above — mints this install's
    // deviceId once, ahead of the first enrollment write that would
    // otherwise need it. Nothing awaits this; ProgressStore.enroll() reads
    // the same `meta.deviceId` key directly if it hasn't landed yet.
    DeviceIdentity.getDeviceId();

    // Subscribes to 'lesson:beat-changed'/'test:beat-changed' — cheap and
    // synchronous, unlike the two inits above there's no IDB round-trip to
    // await here.
    AssetPrefetcher.start();

    // Subscribes to 'content:loading' — toggles the static #content-loader
    // overlay defined in index.html.
    LoadingIndicator.start();

    // The only caller of ProgressStore.awardXP(). Business logic stays in core
    // (invariant 8); it finds the active profile through this callback rather
    // than being handed one, since the profile can change mid-session.
    GamificationService.start(() => this.currentUser?.profileId || this.currentUser?.id || null);

    // Init theme
    let savedTheme = 'dark';
    try { savedTheme = localStorage.getItem('coauthor-theme') || 'dark'; } catch { /* storage off */ }
    document.documentElement.setAttribute('data-theme', savedTheme);
    this._theme = savedTheme;
    // Mirrored on the host so shadow styles can key on it (no :host-context);
    // the first write happens in connectedCallback (a custom element may not
    // set attributes in its constructor).
    EventBus.on('theme:changed', ({ theme }) => {
      this._theme = theme;
      this.setAttribute('data-theme', theme);
    });

    // Look (html[data-look]): the default synchronously, then site.json and
    // the registry. Before lesson mode, which asks the look for its modes.
    // Student runtime only; the authoring app never mounts <app-shell>.
    LookManager.init();
    // Lesson mode (docs/sprints/wip/lesson-modes-plan.md): first paint from
    // the profile-less mirror key, then the profile's own once it resolves.
    // _modeForced hides the switch: a story-only module, or a look with one mode.
    LessonModeManager.init();
    this._lessonMode = LessonModeManager.getMode();
    this._modeForced = !LessonModeManager.isSwitchable();
    EventBus.on('lesson-mode:changed', ({ mode, forced, switchable }) => {
      this._lessonMode = mode;
      this._modeForced = forced || switchable === false;
      this.setAttribute('data-lesson-mode', mode);
    });

    // Initial user load
    AuthService.getCurrentUser().then(u => {
      this.currentUser = u;
      LookManager.setProfile(u);
      LessonModeManager.setProfile(u?.profileId || u?.id || null);
      SimViewPrefs.setProfile(u?.profileId || u?.id || null);
    });

    // Listen for profile changes
    window.addEventListener('profile-changed', async () => {
      this.currentUser = await AuthService.getCurrentUser();
      LookManager.setProfile(this.currentUser);
      LessonModeManager.setProfile(this.currentUser?.profileId || this.currentUser?.id || null);
      SimViewPrefs.setProfile(this.currentUser?.profileId || this.currentUser?.id || null);
      this.requestUpdate();
    });

    // Contextual "?" links (a plugin, a parent panel, the mode switch) ask
    // for a guide over EventBus, never by reaching into this shell
    // (invariant 4). Inside a lesson, a test or the parent area it opens as a
    // sheet, so nobody loses their place; anywhere else it is a normal page.
    EventBus.on('guide:open', ({ slug, h } = {}) => {
      if (!slug) return;
      // The parent area too: leaving it would lock it again behind the gate.
      if (this._route === 'lesson-session' || this._route === 'test-session' || this._route === 'parent-dashboard') {
        import('./views/guides/GuideSheet.js').then(() => { this._sheet = { slug, h: h || '' }; });
      } else {
        window.location.hash = `#/guides/${encodeURIComponent(slug)}${h ? `?h=${encodeURIComponent(h)}` : ''}`;
      }
    });

    // Listen for route changes
    // Moving between pages, the look shows the change (src/ui/pageChange.js;
    // Quill turns the page); _routeTurnDir() decides when, and which way.
    window.addEventListener('route-changed', (e) => {
      const dir = this._routeTurnDir(e.detail);
      if (!dir) { this._applyRoute(e); return; }
      changePage(async () => { await this._applyRoute(e); await this.updateComplete; }, { dir });
    });
  }

  /**
   * Which way Quill turns the page for this route change: 1 forwards, -1 back
   * (returning to the page before this one), 0 not at all: the first page,
   * the same page again (a lesson or test writing its own URL), or the landing
   * page's embedded preview.
   */
  _routeTurnDir({ route, params } = {}) {
    const key = `${route}|${params?.id || params?.slug || ''}`;
    const trail = this._pageTrail || (this._pageTrail = []);
    const last = trail[trail.length - 1];
    if (key === last) return 0;
    let dir = 1;
    if (trail[trail.length - 2] === key) { trail.pop(); dir = -1; }
    else { trail.push(key); if (trail.length > 30) trail.shift(); }
    if (!last || (route === 'content-preview' && params?.embed === '1')) return 0;
    return dir;
  }

  async _applyRoute(e) {
    const { route, params } = e.detail;
    this._route = route;
    this._sheet = null;
    const user = await AuthService.getCurrentUser();
    this.currentUser = user;
    const activeProfileId = user?.profileId || user?.id || 'default_student';
    
    const isDirectContentRoute = ['lesson-session', 'module-dashboard', 'course-dashboard', 'test-session', 'content-preview'].includes(route);
    // Only a module or a lesson can belong to a story-only module; both
    // re-force once their module JSON loads. Everywhere else, unforce.
    // A preview that asks for a mode (?mode=) keeps it: ContentPreview forces it,
    // and a repeated route event must not undo that on the same element.
    if (route !== 'lesson-session' && route !== 'module-dashboard' && !(route === 'content-preview' && params?.mode)) LessonModeManager.setForced(null);
    // Same lifecycle for a course's own look and gamification (module JSON),
    // and a test finds its course too (TestSession._openCourse()).
    if (route !== 'lesson-session' && route !== 'module-dashboard' && route !== 'course-dashboard' && route !== 'test-session') LookManager.setCourse(null);
    // A session draws its own always-visible nav bar, so the floating pill
    // stops being sticky and gives the viewport back to the slide — except
    // a lesson or test session, whose own nav controls are merged into
    // this bar instead (see .session-nav-group / 'lesson:header-nav' /
    // 'test:header-nav'). Safety-net reset, not just the session's own
    // disconnectedCallback: leaving the route synchronously here means the
    // merged controls never flash stale/enabled for a frame while the new
    // view is still loading.
    if (route !== 'lesson-session' && this._headerNav.active) {
      this._headerNav = { ...this._headerNav, active: false };
      this.toggleAttribute('data-lesson-nav', false);
    }
    if (route !== 'test-session' && this._testNav.active) {
      this._testNav = { ...this._testNav, active: false };
      this.toggleAttribute('data-test-nav', false);
    }
    // content-preview included: its own :host sizing (max-width: min(1600px,
    // 94vw)) is deliberately copy-pasted from LessonSession.js's — "a block
    // renders exactly as it would in a real lesson", per that view's own
    // doc comment — but without this, that width never gets to matter: the
    // non-immersive branch below caps `main` at 1100px regardless of
    // viewport, silently squeezing any side-by-side companion
    // image/graph/diagram layout into a much narrower column than an actual
    // lesson would ever give it (e.g. a companion-graph question's own
    // reasonable 40/60 text/graph split, starved down to a genuinely
    // unreadable sliver on an otherwise-wide desktop window).
    this._setImmersive(route === 'lesson-session' || route === 'test-session' || route === 'content-preview');
    // An embedded preview (the landing page's iframe) shows the slide alone.
    this._embed = route === 'content-preview' && params?.embed === '1';
    this.toggleAttribute('data-embed', this._embed);
    const isPreview = window.location.search.includes('preview=true') || params?.preview === 'true';

    // Site routes (the landing page, the guides, profile setup) draw their
    // own full-page layout and top bar, and are reachable before and after
    // onboarding (docs/sprints/completed/landing-page-and-guides.md).
    const SITE_ROUTES = ['landing-view', 'guides-index', 'guide-view', 'onboarding-flow'];
    const onboardingComplete = await ProgressStore.get('meta', 'onboarding_complete');
    const onboarded = !!onboardingComplete?.value;
    // "Start learning" always points at #/start; someone who already has a
    // profile goes straight home.
    if (route === 'onboarding-flow' && onboarded) {
      window.location.replace('#/');
      return;
    }
    // First run: home is the landing page, and any other app page (Discover,
    // Parent area, ...) asks for a profile first. Direct content links and
    // previews keep bypassing both, as before.
    let view = route;
    if (!onboarded && !isDirectContentRoute && !isPreview && !SITE_ROUTES.includes(route)) {
      view = route === 'home' ? 'landing-view' : 'onboarding-flow';
    }
    this._site = SITE_ROUTES.includes(view);
    this.isOnboarding = view === 'onboarding-flow';
    if (this.isOnboarding) {
      await import('./views/OnboardingFlow.js');
      this.currentView = html`<onboarding-flow></onboarding-flow>`;
      this.requestUpdate();
      return;
    }
    if (this._site) {
      if (view === 'landing-view') {
        await import('./views/LandingView.js');
        this.currentView = html`<landing-view .returning=${onboarded}></landing-view>`;
      } else if (view === 'guides-index') {
        await import('./views/guides/GuidesIndex.js');
        this.currentView = html`<guides-index .audience=${params.for || ''}></guides-index>`;
      } else {
        await import('./views/guides/GuideView.js');
        this.currentView = html`<guide-view .slug=${params.slug} .heading=${params.h || ''}></guide-view>`;
      }
      this.requestUpdate();
      return;
    }

    this.isOnboarding = false;
    
    if (route === 'lesson-session') {
      // Dynamically import view
      await import('./views/LessonSession.js');
      this.currentView = html`<lesson-session
        .lessonId="${params.id}"
        .moduleId="${params.module}"
        .profileId="${activeProfileId}"
        .blockIndex="${params.block != null ? Number(params.block) : undefined}"
        .beatIndex="${params.beat != null ? Number(params.beat) : undefined}"
        .nodeId="${params.node ?? undefined}"
        .blockRef="${params.blockRef ?? undefined}"
      ></lesson-session>`;
    } else if (route === 'module-dashboard') {
      await import('./views/ModuleDashboard.js');
      this.currentView = html`<module-dashboard .moduleId="${params.id}" .profileId="${activeProfileId}"></module-dashboard>`;
    } else if (route === 'course-dashboard') {
      await import('./views/CourseDashboard.js');
      this.currentView = html`<course-dashboard .bundleId="${params.id}" .profileId="${activeProfileId}"></course-dashboard>`;
    } else if (route === 'test-session') {
      await import('./views/TestSession.js');
      this.currentView = html`<test-session
        .testId="${params.id}"
        .profileId="${activeProfileId}"
        .itemIndex="${params.item != null ? Number(params.item) : undefined}"
        .reviewMode="${params.review === '1'}"
      ></test-session>`;
    } else if (route === 'content-preview') {
      await import('./views/ContentPreview.js');
      this.currentView = html`<content-preview
        .item="${params.id}"
        .beatIndex="${params.beat != null ? Number(params.beat) : undefined}"
        .mode="${params.mode || ''}"
        .embed="${params.embed === '1'}"
      ></content-preview>`;
    } else if (route === 'parent-dashboard') {
      await import('./ParentDashboard.js');
      this.currentView = html`<parent-dashboard></parent-dashboard>`;
    } else if (route === 'test-dashboard') {
      await import('./TestDashboard.js');
      this.currentView = html`<test-dashboard></test-dashboard>`;
    } else if (route === 'home') {
      await import('./views/HomeDashboard.js');
      this.currentView = html`<home-dashboard .userName="${user.name}" .adult="${AuthService.isAdult(user)}" .profileId="${activeProfileId}"></home-dashboard>`;
    } else if (route === 'discover-view') {
      await import('./views/DiscoverView.js');
      this.currentView = html`<discover-view .profileId="${activeProfileId}"></discover-view>`;
    } else {
      this.currentView = html`<div>Current Route: ${route}</div>`;
    }
    
    this.requestUpdate();
  }

  toggleTheme(e) {
    const next = ThemeManager.getTheme() === 'light' ? 'dark' : 'light';
    ThemeManager.setTheme(next);
    this._spin(e?.currentTarget);
  }

  toggleLessonMode(e) {
    LessonModeManager.toggle();
    this._spin(e?.currentTarget);
  }

  /** Re-arms the icon's spin-in (prototype v2 a/ .icon-btn.spin): removing
   *  and re-adding the class restarts the animation on every click. The
   *  glyph itself is swapped by the re-render, so the spin lands on the new
   *  icon. */
  _spin(btn) {
    if (!btn) return;
    btn.classList.remove('spin');
    requestAnimationFrame(() => btn.classList.add('spin'));
  }

  /**
   * A lesson/test owns the whole viewport; everything else keeps the floating
   * pill.
   */
  _setImmersive(on) {
    if (on) this.setAttribute('data-immersive', '');
    else this.removeAttribute('data-immersive');
    this._updateAppbarOffset();
  }

  /**
   * Publishes how much vertical space this bar actually occupies, written to
   * the document root because --appbar-offset is consumed inside other
   * shadow roots (LessonSession, TestSession), which selectors cannot reach
   * but custom properties can.
   *
   * Three cases, distinguished by the live computed style rather than a
   * cached on/off flag — the same header element switches sticky ↔ static
   * across two independent triggers (the [data-lesson-nav] merge, and the
   * short-landscape media query inside it), and reading the computed style
   * is the one thing that stays correct through both without this having to
   * duplicate either condition:
   *   1. Not sticky right now (a plain page's own short-landscape collapse,
   *      or an immersive test-session/lesson-in-short-landscape) → 0.
   *   2. Sticky and carrying the merged lesson-nav controls → its real,
   *      measured height (taller than the base pill, and it changes with
   *      viewport width as the button row wraps).
   *   3. Sticky, ordinary pill (every non-immersive page) → its real height
   *      too, rather than the old hardcoded 74px, so this stays correct if
   *      the pill's own content ever changes height.
   */
  _updateAppbarOffset() {
    const header = this.shadowRoot?.querySelector('header');
    if (!header) return;
    const sticky = getComputedStyle(header).position === 'sticky';
    const value = sticky ? `${header.offsetHeight}px` : '0px';
    if (document.documentElement.style.getPropertyValue('--appbar-offset') === value) return;
    document.documentElement.style.setProperty('--appbar-offset', value);
    // LessonSession folds this offset into --lesson-sticky-header-h, which
    // content-block sizes side panels from; without a signal it kept a value
    // computed before this one landed (43px instead of 103px, panels ~60px
    // too tall, partly under the bars).
    window.dispatchEvent(new CustomEvent('appbar-offset-changed'));
  }

  firstUpdated() {
    const header = this.shadowRoot.querySelector('header');
    if (!header) return;
    this._headerRO = new ResizeObserver(() => this._updateAppbarOffset());
    this._headerRO.observe(header);
    // A media query flipping the header's position (short-landscape, the
    // [data-lesson-nav] carve-out) resizes nothing the observer watches, so
    // the viewport itself has to be listened to as well — same reasoning as
    // LessonSession's own _publishChromeHeight().
    this._offsetResizeListener = () => this._updateAppbarOffset();
    window.addEventListener('resize', this._offsetResizeListener);
    this._updateAppbarOffset();
  }

  connectedCallback() {
    super.connectedCallback();
    this._stopPageAnswers = answerPageQueries(() => [this.shadowRoot?.querySelector('header')]);
    this.setAttribute('data-theme', this._theme);
    this.setAttribute('data-lesson-mode', this._lessonMode);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopPageAnswers?.();
    if (this._headerRO) { this._headerRO.disconnect(); this._headerRO = null; }
    if (this._offsetResizeListener) window.removeEventListener('resize', this._offsetResizeListener);
  }

  /**
   * The eager _updateAppbarOffset() calls elsewhere (the 'lesson:header-nav'
   * handler, _setImmersive()) read the header before Lit has actually
   * patched the DOM for a `_headerNav` change — harmless when nothing about
   * the header's size changed, stale for exactly one frame when the merged
   * button group's appearance/disappearance does change its height (the
   * ResizeObserver only fires for that case anyway). This is the
   * authoritative pass: it runs after Lit commits, so it reads the header's
   * real post-render layout.
   */
  updated(changedProperties) {
    if (changedProperties.has('_headerNav')) this._updateAppbarOffset();
  }

  /** Back/Autoplay/Previous/Next clicks in the merged bar — forwarded to
   *  whichever LessonSession is actually mounted, over EventBus rather than
   *  reaching into its shadow root (invariant 4). */
  _lessonNavAction(action) {
    EventBus.emit('lesson:header-action', { action });
  }

  /** Previous/Next/Submit clicks in the merged bar, same forwarding pattern
   *  as _lessonNavAction() — whichever TestSession is mounted listens for
   *  'test:header-action'. */
  _testNavAction(action) {
    EventBus.emit('test:header-action', { action });
  }

  render() {
    import('./ProfileSwitcher.js');
    import('./UpdateToast.js');
    
    if (this._embed) {
      return html`<div class="cosmos" aria-hidden="true"></div><main class="embed">${this.currentView}</main>`;
    }

    if (this.isOnboarding || this._site) {
      return html`
        <main style="padding: 0; margin: 0; min-height: 100vh; flex: 1; width: 100%;">
          ${this.currentView}
        </main>
        <update-toast></update-toast>
      `;
    }
    
    return html`
      <div class="cosmos" aria-hidden="true">
        ${this._lessonMode === 'story' ? html`<div class="fireflies">${FIREFLIES}</div>` : ''}
      </div>
      <header>
        <h1 class="brand">
          <app-logo></app-logo>
        </h1>
        <nav>
          ${this._headerNav.active ? html`
            <div class="session-nav-group" role="toolbar" aria-label="Lesson controls">
              <button
                class="btn-3d btn-secondary btn-sm"
                @click="${() => this._lessonNavAction('back')}"
                aria-label="${this._headerNav.backLabel}"
                title="${this._headerNav.backLabel}"
              >${iconBack}<span class="nav-label">${this._headerNav.backLabel}</span></button>
              <!-- Narrated lessons pace themselves: no Autoplay while narration is on. -->
              ${this._headerNav.narrated ? '' : html`<button
                class="btn-3d btn-secondary btn-sm"
                @click="${() => this._lessonNavAction('toggle-autoplay')}"
                aria-pressed="${this._headerNav.autoplay ? 'true' : 'false'}"
                aria-label="Autoplay"
                title="Advance each beat on a timer"
              >${iconAutoplay(this._headerNav.autoplay)}<span class="nav-label">Autoplay</span></button>`}
              <!-- Previous/Next live in LessonSession's own bottom action bar
                   (Classic) or floating round buttons (Story) now. -->
            </div>
          ` : ''}
          ${this._testNav.active ? html`
            <div class="session-nav-group" role="toolbar" aria-label="Test controls">
              <button
                class="btn-3d btn-secondary btn-sm"
                @click="${() => this._testNavAction('prev')}"
                ?disabled="${!this._testNav.canGoBack}"
                aria-label="Previous question"
                title="Previous question (Shift+Left arrow)"
              >${iconPrev}<span class="nav-label">Previous</span></button>
              ${this._testNav.isLastQuestion ? html`
                <button
                  class="btn-3d btn-success btn-sm"
                  @click="${() => this._testNavAction('submit')}"
                  aria-label="Submit test"
                  title="Submit test"
                >${iconSubmit}<span class="nav-label">Submit</span></button>
              ` : html`
                <button
                  class="btn-3d btn-primary btn-sm"
                  @click="${() => this._testNavAction('next')}"
                  ?disabled="${this._testNav.canGoForward === false}"
                  aria-label="Next question"
                  title="Next question (Shift+Right arrow)"
                >${iconNext}<span class="nav-label">Next</span></button>
              `}
            </div>
          ` : ''}
          <a href="#/" aria-label="Home" title="Home">${iconHome}<span class="nav-label">Home</span></a>
          <a class="in-menu-narrow" href="#/discover" aria-label="Discover" title="Discover courses">${iconSearch}<span class="nav-label">Discover</span></a>
          <a class="in-menu-narrow" href="#/guides" aria-label="Guides" title="Guides">${iconGuide}<span class="nav-label">Guides</span></a>
          <!-- The student menu (name pill) carries the Parent area link for
               every role, so there is no separate header link to duplicate it. -->
          <profile-switcher></profile-switcher>
          ${this._modeForced ? '' : html`
            <button
              class="icon-btn"
              @click="${this.toggleLessonMode}"
              aria-pressed="${this._lessonMode === 'story' ? 'true' : 'false'}"
              aria-label="Story mode"
              title="${this._lessonMode === 'story' ? 'Story mode is on: switch to Classic' : 'Classic mode is on: switch to Story'}"
            >${this._lessonMode === 'story' ? iconBookOpen : iconBookClosed}</button>
            <guide-help class="look-help" compact slug="classic-and-story-looks" label="About the classic and story looks"></guide-help>
          `}
          <button
            class="icon-btn theme-btn"
            @click="${this.toggleTheme}"
            aria-label="${this._theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}"
            title="${this._theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}"
          >${this._theme === 'dark' ? iconSun : iconMoon}</button>
        </nav>
      </header>
      <main>
        ${this.currentView}
      </main>
      <update-toast></update-toast>
      <!-- Mounted exactly once, here: anything anywhere in the app raises a
           toast with EventBus.emit('ui:toast', {icon, text}) rather than
           reaching into this shadow root (invariant 4). -->
      <app-toast-zone></app-toast-zone>
      ${this._sheet ? html`<guide-sheet .slug=${this._sheet.slug} .heading=${this._sheet.h}
        @close=${() => { this._sheet = null; }}></guide-sheet>` : ''}
    `;
  }
}

