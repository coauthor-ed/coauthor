import { LitElement, html, css } from 'lit';
import { LessonEngine } from '../../engines/lesson/LessonEngine.js';
import { ContentLoader } from '../../core/ContentLoader.js';
import { CourseSourceManager } from '../../core/CourseSourceManager.js';
import { EventBus } from '../../core/EventBus.js';
import { LessonModeManager } from '../../core/LessonModeManager.js';
import { LookManager } from '../../core/LookManager.js';
import '../components/NeedsUpdateNotice.js';
import { loadCourseManifest, bundleNeedsNewerEngine } from '../../core/courseManifest.js';
import { slideTitleOf, stripLeadingHeading, leadingHeading } from '../../core/markdown/slideTitle.js';
import '../components/ProgressBar.js';
import { btn3dStyles } from '../sharedStyles.js';
import { showConfirm } from '../components/dialogs.js';
import { brandCopy, hasBrandPiece, loadBrandPieces } from '../components/LookSlots.js';
import { CUES, emitCue, createMissTracker } from '../../core/cues.js';
import { answerPageQueries } from '../../core/components/stageAnswer.js';
import { changePage, canChangePage } from '../pageChange.js';
import { LessonModeMixin } from '../../core/mixins/LessonModeMixin.js';
import { GamificationMixin } from '../../core/mixins/GamificationMixin.js';
import { LookMixin } from '../../core/mixins/LookMixin.js';
import { iconArrowLeft, iconArrowRight, iconStar, iconCheck, iconFlag, iconOfflineReady, iconCloudOff } from '../icons/uiIcons.js';
import { OfflineAvailability } from '../../core/OfflineAvailability.js';
import { splitSteps } from '../../core/markdown/splitSteps.js';
import { tr } from '../../core/i18nProvider.js';
import { iconBack as ICON_BACK, iconHome as ICON_HOME, iconPrev as ICON_PREV, iconNext as ICON_NEXT, iconAutoplay } from '../icons/navIcons.js';
import { NarrationPacer } from '../../engines/lesson/NarrationPacer.js';
import { checkSidecarShape } from '../../core/narration/narrationModel.js';
import { getVoicePref, setVoicePref, narrateKey, courseNarrateKey, getCourseNarrateChoice, presenterKey, captionsOffKey, MUTED_KEY, getFlag, setFlag } from '../../core/narration/voicePref.js';
import { readCourseMeta } from '../../core/courseMeta.js';
import { A11yAnnouncer } from '../../core/A11yAnnouncer.js';
import '../components/NarrationUi.js';

// "Narrate": a headphones mark, for the toggle shown only when a lesson has narrationRef.
const ICON_NARRATE = html`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4.5" height="6.5" rx="1.6"/><rect x="16" y="14" width="4.5" height="6.5" rx="1.6"/></svg>`;

// The look's pieces this view places (coach, math coach, the complete
// screen's companion) are defined before it first renders.
await loadBrandPieces('companion', 'coach', 'math-coach');

// Swipe-to-navigate tuning. Stricter axis disambiguation than
// OnboardingFlow.js's own swipe handler (which treats either axis as
// navigation — fine there, wrong here, since .content-area must keep normal
// vertical scrolling for long beats): a gesture only counts as a horizontal
// swipe when |deltaX| clears the threshold *and* dominates |deltaY| by at
// least this ratio.
const SWIPE_THRESHOLD_PX = 50;
const SWIPE_AXIS_RATIO = 2;

export class LessonSession extends LookMixin(GamificationMixin(LessonModeMixin(LitElement))) {
  static styles = [btn3dStyles, css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      /* Was 800px, then 1180px — both still capped the whole slide, including
         any side-by-side image/simulation panel, well under half of a wide
         desktop monitor, leaving large empty margins either side while the
         diagram itself rendered small and blurry (a canvas-based simulation
         is scaled up from a fixed internal resolution, so a narrow CSS box
         costs it sharpness, not just size). The reading measure is capped
         per-block instead (see content-block.js's .cb-reading / .cb-text),
         so widening here buys the media room without stretching prose into
         unreadably long lines — text-only slides also stay capped via
         .cb-reading regardless of how wide this container gets. Responsive
         rather than a second fixed number, so it scales with the display
         instead of under-using an ultrawide monitor or over-widening a
         small laptop. */
      max-width: min(1600px, 94vw);
      margin: 0 auto;
      width: 100%;
      /* No overflow-x here on purpose (see theme.css's own html/body split
         for the full reasoning): any non-'visible' overflow value on an
         ancestor — even just on one axis — makes that ancestor the nearest
         "scroll container" for every position:sticky descendant, including
         .sticky-header below and content-block.js's .cb-sim-wrap. Since this
         host's own height is a percentage (of an ancestor chain that never
         resolves to a hard pixel value — it's flex-stretched from a
         min-height, not height, further up), it never actually overflows
         *itself*; it just grows to fit its content, so a scroll container
         rooted here would never move, and every sticky element inside it
         would render as if it were position: static, quietly never
         sticking, which is exactly what was happening before this was
         removed. html's own overflow-x: hidden (theme.css) already clips
         horizontal overflow for the whole document, so this was pure
         redundant belt-and-braces that cost every sticky element in every
         lesson slide its stickiness. */
    }
    /* ── Lesson-complete celebration ──────────────────────────────────────
       Was an inline-styled 12px card that did not even fire the confetti this
       same file implements. This is one of the two emotional payoff moments in
       the runtime (the other is TestSession's results), so it gets real
       treatment: Quill cheers, confetti fires, and the XP earned is counted
       out line by line rather than stated. */
    .complete {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: var(--space-5);
      padding: var(--space-7) var(--space-4);
    }
    .complete h2 {
      font-family: var(--font-heading);
      font-size: var(--fs-display);
      line-height: var(--lh-tight);
      margin: 0;
    }
    .complete .sub {
      color: var(--text-muted);
      font-size: var(--fs-body);
      max-width: 42ch;
      margin: 0;
    }
    .tally {
      width: 100%;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: var(--space-2) 0;
    }
    .tally-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-3) var(--space-4);
      background: var(--surface-card);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-md);
      font-weight: var(--fw-strong);
      opacity: 0;
      transform: translateY(8px);
      animation: tally-in var(--motion-base) var(--ease-spring) forwards;
    }
    .tally-row b { font-family: var(--font-heading); color: var(--accent-amber); }
    @keyframes tally-in { to { opacity: 1; transform: none; } }
    .complete-actions {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      width: 100%;
      max-width: 420px;
    }
    /* The same page for a look with no companion: nothing stands at the top,
       so it reads as a short summary from the top of the page down. */
    .complete.calm {
      box-sizing: border-box;
      align-items: stretch;
      justify-content: flex-start;
      text-align: left;
      gap: var(--space-5);
      max-width: 640px;
      width: 100%;
      margin: 0 auto;
      padding: var(--space-6) var(--space-4);
    }
    .complete.calm h2 { font-size: var(--fs-h1); }
    .complete.calm .sub { max-width: none; }
    .calm-kicker {
      margin: 0 0 var(--space-1);
      font-family: var(--font-ui);
      font-size: var(--fs-small);
      font-weight: var(--fw-strong);
      color: var(--text-muted);
    }
    .calm-title { margin: var(--space-2) 0 0; color: var(--text-soft); font-size: var(--fs-h3); }
    .calm-facts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: var(--space-4);
      margin: 0;
      padding: var(--space-4) 0;
      border-top: var(--rule-w) solid var(--border-color);
      border-bottom: var(--rule-w) solid var(--border-color);
    }
    .calm-facts dt { font-size: var(--fs-small); color: var(--text-muted); }
    .calm-facts dd {
      margin: var(--space-1) 0 0;
      font-family: var(--font-heading);
      font-size: var(--fs-h2);
      font-weight: var(--heading-weight);
      color: var(--text-main);
    }
    .calm-next h3 {
      margin: 0 0 var(--space-1);
      font-family: var(--font-ui);
      font-size: var(--fs-small);
      font-weight: var(--fw-strong);
      letter-spacing: 0;
      color: var(--text-muted);
    }
    .calm-next p { margin: 0; color: var(--text-main); font-size: var(--fs-h3); }
    /* plain: the find is a quiet tick beside the heading (no burst), the
       kicker is the brass small-caps line every plain page opens with, and
       the facts read as a ruled table row. */
    :host([data-look="plain"]) .calm-kicker {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: var(--kicker-tracking, 0.1em);
      text-transform: uppercase;
      color: var(--card-kicker, var(--text-muted));
    }
    :host([data-look="plain"]) .complete.calm h2 { display: flex; align-items: center; gap: var(--space-3); }
    :host([data-look="plain"]) .calm-tick {
      flex: none;
      display: inline-grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border: 1px solid var(--border-color);
      border-radius: 50%;
      background: var(--bg-surface);
      color: var(--success-text);
    }
    :host([data-look="plain"]) .calm-tick svg { width: 18px; height: 18px; }
    :host([data-look="plain"]) .calm-facts { border-top: 1px solid var(--rule-strong, var(--border-color)); border-bottom: 1px solid var(--border-color); }
    :host([data-look="plain"]) .calm-facts dt {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    :host([data-look="plain"]) .calm-next {
      padding: var(--space-4) var(--space-5);
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-left: 3px solid var(--primary-color);
      border-radius: var(--radius-sm);
    }
    :host([data-look="plain"]) .calm-next h3 {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: var(--kicker-tracking, 0.1em);
      text-transform: uppercase;
      color: var(--card-kicker, var(--text-muted));
    }
    :host([data-look="plain"]) .calm-next p { font-family: var(--font-heading); font-weight: var(--heading-weight); }
    .complete.calm .tally { max-width: none; margin: 0; }
    .complete.calm .complete-actions {
      flex-direction: row;
      flex-wrap: wrap;
      max-width: none;
    }
    /* theme.css's global block cannot cross this shadow boundary. */
    @media (prefers-reduced-motion: reduce) {
      .tally-row { animation: none; opacity: 1; transform: none; }
    }
    .sticky-header {
      position: sticky;
      /* AppShell's own header carries Back/Autoplay/Previous/Next now (see
         AppShell.js's .lesson-nav-group / 'lesson:header-nav') and stays
         sticky for exactly that reason, so this one — just the progress
         meter — sits below it rather than in the same band. --appbar-offset
         is AppShell's own measured height, published live via its
         ResizeObserver, so this stays flush against it regardless of how
         tall that bar gets (e.g. the button row wrapping on a narrow
         viewport). */
      top: var(--appbar-offset);
      background: var(--bg-base);
      z-index: 10;
      padding: 12px 0;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .content-area {
      flex: 1;
      padding: 1rem 0;
      /* So a freshly-mounted block lands below the sticky header instead of
         partly underneath it — see #block-container's own scroll-margin-top,
         which reads the same custom property the ResizeObserver below keeps
         current. */
      scroll-margin-top: calc(var(--lesson-sticky-header-h, 0px) + 12px);
    }

    /* ── Lesson head (prototype A): module crumb, lesson title, slide count.
       Not sticky: only the progress meter below stays pinned, so the title
       costs height once, at the top, and never over the sim panel. */
    .lesson-head {
      display: flex;
      align-items: flex-end;
      gap: var(--space-4);
      flex-wrap: wrap;
      padding: var(--space-4) 0 0;
    }
    .lesson-head-text { min-width: 0; flex: 1 1 22rem; }
    .lesson-head .crumb {
      font-size: 0.8rem;
      font-weight: var(--fw-heavy);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 2px;
    }
    .lesson-head h1 {
      font-size: 1.35rem;
      line-height: var(--lh-tight);
      margin: 0;
    }
    .lesson-head-meta {
      margin-left: auto;
      color: var(--text-muted);
      font-weight: var(--fw-strong);
      font-size: 0.85rem;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .lesson-head-meta:empty { display: none; }
    /* Offline chip (Q-100a): teal when every slide is on this device; muted
       while some are not (those slides are dashed in the progress bar). */
    .off-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 10px 3px 7px;
      border-radius: var(--radius-pill);
      font-size: 0.78rem;
      font-weight: var(--fw-heavy);
      line-height: 1.3;
      color: var(--text-muted);
      background: var(--bg-panel);
      border: 1.5px solid var(--border-color);
    }
    .off-chip svg { width: 16px; height: 16px; flex: none; }
    .off-chip.ready {
      color: var(--success-text);
      background: var(--success-bg);
      border-color: color-mix(in srgb, var(--accent-teal) 40%, transparent);
    }
    .off-chip.part { border-style: dashed; }
    .off-chip.away { color: var(--text-main); border-style: dashed; }
    :host([data-look="plain"]) .off-chip { border-radius: var(--radius-sm, 4px); font-weight: 600; }

    /* ── Bottom action bar (prototype A's .actionbar). Fixed rather than
       sticky so it is always one reach away, whatever the slide's height;
       its measured height is published as --lesson-chrome-bottom (see
       _observeActionBar) for .content-area's bottom padding and for the
       plugins' available-height budget. Replaces the old sticky Check
       Answer strip: Check takes the primary slot instead. */
    .action-bar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 30;
      border-top: var(--rule-w) solid var(--border-color);
      background: color-mix(in srgb, var(--bg-base) var(--action-bar-opacity), transparent);
    }
    .action-bar-inner {
      max-width: min(1600px, 94vw);
      margin: 0 auto;
      padding: 12px 0 calc(12px + env(safe-area-inset-bottom));
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .action-bar .btn-lg {
      padding: 14px 26px;
      font-size: 1.05rem;
      border-radius: var(--radius-md);
    }
    .action-bar .btn-3d { gap: var(--space-2); }
    .action-bar .btn-3d svg { flex: none; }
    .nav-next { min-width: 190px; }
    /* Flag this slide (W4): small and quiet next to Previous, so it is there
       when wanted and never competes with Next. */
    .flag-btn {
      flex: none;
      width: 44px;
      height: 44px;
      padding: 0;
      display: inline-grid;
      place-items: center;
      border-radius: var(--radius-md);
      border: var(--rule-w) solid transparent;
      background: none;
      color: var(--text-muted);
      cursor: pointer;
      transition: color var(--motion-fast), border-color var(--motion-fast), background var(--motion-fast);
    }
    .flag-btn:hover { color: var(--text-main); border-color: var(--border-color); background: var(--bg-surface); }
    .flag-btn:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }
    .flag-btn.flag-round { border-radius: 50%; }
    :host([data-lesson-mode="story"]) .flag-btn {
      background: var(--bg-surface);
      border-color: var(--border-color);
      box-shadow: var(--shadow-sm);
    }
    @media (prefers-reduced-motion: reduce) { .flag-btn { transition: none; } }
    .nav-next .arrow { display: inline-flex; transition: transform var(--motion-base) var(--ease-settle); }
    .nav-next:hover:not(:disabled) .arrow { transform: translateX(4px); }
    .kbd-hint {
      flex: 1;
      margin: 0;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.82rem;
      font-weight: var(--fw-strong);
    }
    .kbd-hint kbd {
      font-family: var(--font-family);
      background: var(--bg-surface);
      border: 1.5px solid var(--border-hover);
      border-bottom-width: var(--kbd-lip-w);
      border-radius: var(--radius-kbd);
      padding: 1px 8px;
      font-size: 0.78rem;
      color: var(--text-main);
    }
    /* No keyboard to hint at on a touch-only device; width alone would also
       hide it from a narrow desktop window that does have one. */
    @media (pointer: coarse), (max-width: 700px) {
      .kbd-hint { visibility: hidden; }
    }
    @media (max-width: 600px) {
      .action-bar-inner { gap: var(--space-2); }
      .action-bar .btn-lg { padding: 12px 16px; font-size: 0.95rem; min-height: 44px; }
      .nav-prev .nav-label { display: none; }
      .kbd-hint { display: none; }
      .nav-next, .nav-check { min-width: 0; flex: 1; }
    }
    /* Room to clear the fixed bottom bar, counting the shell's own bottom
       padding under this view (Q-84: a slide sized to the stage budget used
       to scroll the desktop page by 42 px of padding and margin alone). */
    .content-area { padding-bottom: max(var(--space-2), calc(var(--lesson-chrome-bottom, 0px) + var(--space-2) - var(--shell-main-pad-bottom, var(--space-4)))); }
    #block-container > :last-child,
    #block-container > :last-child > :last-child { margin-bottom: 0; }
    .lesson-head h1 { font-family: var(--font-heading); font-weight: var(--heading-weight); }

    /* plain: a chapter opening. The course in brass small caps, the lesson
       title in the serif, the slide as a folio at the right. */
    :host([data-look="plain"]) .lesson-head { padding-top: var(--space-5); }
    :host([data-look="plain"]) .lesson-head .crumb {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: var(--kicker-tracking, 0.1em);
      color: var(--card-kicker, var(--text-muted));
      margin-bottom: 6px;
    }
    :host([data-look="plain"]) .lesson-head h1 { font-size: clamp(1.4rem, 2.4vw, 1.75rem); letter-spacing: -0.01em; }
    :host([data-look="plain"]) .lesson-head-meta {
      font-size: 0.78rem;
      font-weight: 500;
      letter-spacing: 0.04em;
      font-variant-numeric: tabular-nums;
    }
    .folio b {
      font-family: var(--font-heading);
      font-weight: 600;
      font-size: 1.35rem;
      line-height: 1;
      color: var(--text-main);
      margin-right: 4px;
      font-variant-numeric: lining-nums tabular-nums;
    }
    /* plain, the slide head (look pack plain SPEC sec 2; the 2026-11-05
       prototype): numeral | eyebrow, title, deck | step count. It lives in
       the sticky header, so it stays in sight and the stage budget counts
       it. No rule under it: the page is the paper. */
    :host([data-look="plain"]) .sticky-header.plain-sticky {
      padding: 0;
      margin-bottom: 0;
      gap: 0;
    }
    :host([data-look="plain"]) .plain-head {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      column-gap: 24px;
      align-items: start;
      padding: 22px 0 18px;
    }
    :host([data-look="plain"]) .ph-num {
      font-family: var(--font-display, var(--font-heading));
      font-weight: 400;
      font-size: 64px;
      line-height: 0.9;
      min-width: 1.35em;
      color: var(--signature);
      font-variant-numeric: lining-nums tabular-nums;
    }
    :host([data-look="plain"]) .ph-eyebrow {
      font-size: 0.75rem;
      line-height: 1.4;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--signature-ink);
      margin: 2px 0 8px;
    }
    :host([data-look="plain"]) .plain-head h1 {
      margin: 0;
      font-family: var(--font-display, var(--font-heading));
      font-weight: 400;
      font-size: clamp(1.8rem, 2.9vw, 2.6rem);
      line-height: 1.1;
      letter-spacing: -0.018em;
      color: var(--text-main);
      text-wrap: balance;
      max-width: 30ch;
    }
    :host([data-look="plain"]) .ph-deck {
      margin: 10px 0 0;
      max-width: 68ch;
      font-size: 1.05rem;
      line-height: 1.55;
      color: var(--text-muted);
    }
    :host([data-look="plain"]) .ph-count {
      padding-top: 4px;
      font-size: 0.8rem;
      color: var(--text-muted);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    @media (max-width: 900px) {
      :host([data-look="plain"]) .plain-head { column-gap: 18px; }
      :host([data-look="plain"]) .ph-num { font-size: 52px; }
    }
    @media (max-width: 600px) {
      :host([data-look="plain"]) .plain-head { column-gap: 12px; padding: 8px 0 6px; }
      :host([data-look="plain"]) .ph-num { font-size: 36px; min-width: 1.2em; }
      :host([data-look="plain"]) .ph-eyebrow { margin: 0 0 2px; font-size: 0.75rem; }
      /* A phone screen is short: the slide starts closer under the head, and
         the head scrolls away with the page instead of holding 85px over
         every slide (only the app bar stays; _publishChromeHeight then
         counts the app bar alone). */
      :host([data-look="plain"]) .content-area { padding-top: var(--space-2); }
      :host([data-look="plain"]) .sticky-header.plain-sticky { position: static; }
      :host([data-look="plain"]) .plain-head h1 { font-size: 1.45rem; line-height: 1.15; }
      :host([data-look="plain"]) .ph-count { font-size: 0.75rem; }
    }
    /* A short laptop screen (800 px tall): the head is in the stage budget,
       so it gives back about 40 px for the figure beside the text. */
    @media (min-width: 601px) and (max-height: 900px) {
      :host([data-look="plain"]) .plain-head { padding: 12px 0 10px; }
      :host([data-look="plain"]) .ph-num { font-size: 50px; }
      :host([data-look="plain"]) .ph-eyebrow { margin-bottom: 4px; }
      :host([data-look="plain"]) .plain-head h1 { font-size: clamp(1.6rem, 2.4vw, 2.15rem); max-width: 46ch; }
      :host([data-look="plain"]) .ph-deck { margin-top: 6px; }
    }

    /* plain, narrated (Q-17): one slim line, the same height on every slide;
       the slide title is the narration's fading overlay instead. */
    :host([data-look="plain"]) .plain-head.narr { align-items: center; padding: 10px 0 8px; }
    /* Calm (_setNarrCalm): the slim narrated head steps back while the learner listens. */
    .plain-head.narr { transition: opacity 420ms ease-out; }
    :host([narr-calm]) .plain-head.narr { opacity: 0.18; }
    :host([narr-hold]) .narr-check { visibility: hidden; }
    @media (prefers-reduced-motion: reduce) { .plain-head.narr { transition: none; } }
    :host([data-look="plain"]) .plain-head.narr .ph-num { font-size: 34px; line-height: 1; min-width: 1.2em; }
    :host([data-look="plain"]) .plain-head.narr .ph-eyebrow { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    :host([data-look="plain"]) .plain-head.narr .ph-count { padding-top: 0; }
    /* Q-84: narrated on a desktop the slim head is slimmer still and the
       slide starts right under it, so the scene gets the height back (the
       caption band under it is the stage's, not the page's). */
    @media (min-width: 601px) {
      :host([data-look="plain"]) .plain-head.narr { padding: 4px 0 2px; }
      :host([data-look="plain"]) .plain-head.narr .ph-num { font-size: 28px; }
      :host([data-look="plain"][narr-on]) .content-area { padding-top: 4px; }
    }
    @media (max-width: 600px) {
      :host([data-look="plain"]) .plain-head.narr { padding: 6px 0 4px; }
      :host([data-look="plain"]) .plain-head.narr .ph-num { font-size: 28px; }
    }
    .sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
    }

    /* plain: no trailing space after the last block beyond what clears the
       fixed footer, so a slide sized to the stage budget ends on the first
       screen instead of scrolling the page by its own bottom margins. */
    :host([data-look="plain"]) .content-area { padding-bottom: calc(var(--lesson-chrome-bottom, 0px) + var(--space-2)); }
    :host([data-look="plain"]) #block-container > :last-child,
    :host([data-look="plain"]) #block-container > :last-child > :last-child { margin-bottom: 0; }

    /* plain, the footer: the segmented slim progress bar over Previous and
       Next; the primary is the highlighter with an ink rule (tokens). */
    .action-bar-progress {
      max-width: min(1600px, 94vw);
      margin: 0 auto;
      padding-top: 0;
    }
    :host([data-look="plain"]) .action-bar { border-top: 0; }
    :host([data-look="plain"]) .action-bar-progress { background: var(--bg-base); }
    :host([data-look="plain"]) .action-bar-progress progress-bar { display: block; margin-top: -1px; }
    :host([data-look="plain"]) .action-bar-inner { padding-top: 10px; }
    :host([data-look="plain"]) .action-bar .btn-lg { padding: 11px 22px; font-size: 1rem; min-height: 44px; }
    :host([data-look="plain"]) .nav-next { min-width: 150px; }
    :host([data-look="plain"]) .nav-check,
    :host([data-look="plain"]) .nav-next.btn-success {
      background: var(--highlight);
      color: var(--highlight-ink);
      border: var(--btn-primary-border, 0);
      box-shadow: none;
    }
    :host([data-look="plain"]) .nav-next.btn-secondary,
    :host([data-look="plain"]) .nav-prev { background: transparent; box-shadow: none; }
    :host([data-look="plain"]) .kbd-hint { font-weight: 500; }
    :host([data-look="plain"]) .kbd-hint kbd { border-width: 1px; padding: 1px 6px; }

    /* ── Story (prototype v2 b/) ─────────────────────────────────────── */
    :host([data-lesson-mode="story"]) .lesson-head .crumb {
      font-size: 0.7rem;
      letter-spacing: 0.2em;
      color: var(--primary-text);
    }
    :host([data-lesson-mode="story"]) .lesson-head h1 { font-size: clamp(1.5rem, 2.6vw, 2.15rem); }
    :host([data-lesson-mode="story"]) .sticky-header { padding: 14px 0 10px; }

    /* Floating turn-nav: a viewport overlay, bottom right. Overrides the
       Classic full-width strip it shares .action-bar (and its measurement)
       with. */
    :host([data-lesson-mode="story"]) .turn-nav {
      left: auto;
      right: 26px;
      bottom: 22px;
      display: flex;
      align-items: center;
      gap: 14px;
      border: 0;
      background: none;
    }
    .roundbtn {
      width: 58px;
      height: 58px;
      flex: none;
      padding: 0;
      border-radius: 50%;
      border: var(--rule-w) solid var(--border-color);
      background: var(--bg-surface);
      color: var(--text-main);
      display: grid;
      place-items: center;
      box-shadow: var(--shadow-md);
      cursor: pointer;
      transition: transform 80ms, box-shadow 80ms;
    }
    .roundbtn svg { width: 24px; height: 24px; }
    .roundbtn.next { width: 72px; height: 72px; background: var(--primary-color); color: var(--on-primary); }
    .roundbtn.next svg { width: 30px; height: 30px; }
    .roundbtn.finish { background: var(--accent-teal); color: var(--bg-surface); }
    .roundbtn:active:not(:disabled), .inkbtn:active { transform: translate(3px, 4px); box-shadow: none; }
    .roundbtn:disabled { opacity: 0.4; cursor: not-allowed; }
    .roundbtn:focus-visible, .inkbtn:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }
    .beat-count {
      font-family: var(--font-heading);
      font-size: 0.85rem;
      background: var(--bg-surface);
      color: var(--text-main);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-pill);
      padding: 10px 18px;
      box-shadow: var(--shadow-sm);
      white-space: nowrap;
      /* Fixed width: a digit change ("beat 1" -> "beat 2") must not nudge the
         overlay's other members. */
      min-width: 7.6em;
      box-sizing: border-box;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .inkbtn {
      font-family: var(--font-heading);
      font-size: 0.95rem;
      letter-spacing: 0.02em;
      background: var(--accent-teal);
      color: var(--bg-surface);
      border: var(--rule-w) solid var(--border-color);
      border-radius: 14px;
      padding: 13px 22px;
      box-shadow: var(--shadow-md);
      cursor: pointer;
      transition: transform 80ms, box-shadow 80ms;
    }
    .turn-hint {
      position: fixed;
      left: 26px;
      bottom: 30px;
      z-index: 30;
      margin: 0;
      font-size: 0.78rem;
      font-weight: var(--fw-strong);
      color: var(--text-muted);
    }
    .turn-hint kbd {
      font-family: var(--font-family);
      background: var(--bg-surface);
      border: 2px solid var(--border-color);
      border-bottom-width: 4px;
      border-radius: 8px;
      padding: 1px 8px;
      color: var(--text-main);
    }
    @media (pointer: coarse), (max-width: 700px) {
      .turn-hint { display: none; }
    }
    /* Phones: the cluster becomes a full-width bottom bar (still an overlay). */
    @media (max-width: 700px) {
      :host([data-lesson-mode="story"]) .turn-nav {
        left: 0;
        right: 0;
        bottom: 0;
        justify-content: flex-end;
        gap: 10px;
        padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
        background: color-mix(in srgb, var(--bg-base) 90%, transparent);
        border-top: var(--rule-w) solid var(--border-color);
      }
      :host([data-lesson-mode="story"]) .beat-count { margin-right: auto; font-size: 0.74rem; padding: 8px 14px; }
      .roundbtn { width: 50px; height: 50px; }
      .roundbtn.next { width: 62px; height: 62px; }
      .inkbtn { padding: 11px 16px; font-size: 0.85rem; }
    }

    /* Page flip: the content alone turns; perspective is inside the
       transform, never on an ancestor (see _turnPage). */
    #block-container.flip-out, #block-container.flip-in,
    #block-container.flip-out-back, #block-container.flip-in-back { backface-visibility: hidden; }
    #block-container.flip-out { transform-origin: 0% 50%; animation: page-out 360ms cubic-bezier(0.55, 0.06, 0.68, 0.19) both; }
    #block-container.flip-in { transform-origin: 100% 50%; animation: page-in 520ms cubic-bezier(0.22, 0.9, 0.32, 1) both; }
    #block-container.flip-out-back { transform-origin: 100% 50%; animation: page-out-back 360ms cubic-bezier(0.55, 0.06, 0.68, 0.19) both; }
    #block-container.flip-in-back { transform-origin: 0% 50%; animation: page-in-back 520ms cubic-bezier(0.22, 0.9, 0.32, 1) both; }
    @keyframes page-out { to { transform: perspective(2000px) rotateY(-36deg) translateX(-6%) scale(0.965); opacity: 0; filter: brightness(0.82); } }
    @keyframes page-in { from { transform: perspective(2000px) rotateY(28deg) translateX(5%) scale(0.97); opacity: 0; filter: brightness(1.05); } }
    @keyframes page-out-back { to { transform: perspective(2000px) rotateY(36deg) translateX(6%) scale(0.965); opacity: 0; filter: brightness(0.82); } }
    @keyframes page-in-back { from { transform: perspective(2000px) rotateY(-28deg) translateX(-5%) scale(0.97); opacity: 0; filter: brightness(1.05); } }
    @media (prefers-reduced-motion: reduce) {
      .roundbtn, .inkbtn { transition: none; }
      #block-container.flip-out, #block-container.flip-in,
      #block-container.flip-out-back, #block-container.flip-in-back { animation: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .nav-next .arrow { transition: none; }
    }

    /* Mobile-landscape compact controls — hidden by default, swapped in for
       .full-header below the short-landscape breakpoint. Floating rather
       than in document flow, so they cost zero header height instead of
       just shrinking it. */
    .compact-topbar, .compact-controls { display: none; }

    .compact-controls .icon-btn {
      /* No touch-target-size convention exists elsewhere in this repo to
         inherit (checked docs/ui-ux-design-system.md) — 44px is the common
         accessible minimum, set explicitly here. */
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--reveal-scrim);
      color: var(--reveal-on-scrim);
      cursor: pointer;
      padding: 0;
    }
    .compact-controls .icon-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .compact-controls .icon-btn[aria-pressed="true"] {
      background: var(--reveal-scrim-strong);
    }

    @media (max-height: 600px) and (orientation: landscape) {
      .full-header, .lesson-head, .action-bar, .turn-hint,
      :host([data-lesson-mode="story"]) .turn-nav { display: none; }

      /* .content-area has no horizontal padding of its own (only the
         top/bottom padding above), so a block that legitimately uses the
         full row width — a question's side-by-side companion image/graph/
         diagram/simulation, sized as a fraction of that width — runs right
         up against the viewport's own right edge. .compact-controls below
         is 'position: fixed; right: 10px' with 44px-wide circular buttons,
         floating rather than reserving space in flow (see its own comment)
         — precisely because it floats, nothing here would otherwise push
         content out from under it. Reserving that same footprint (44px +
         10px + a little breathing room) as right padding is the fix, and
         belongs here rather than in each block/question type individually
         since any right-edge content is equally exposed to this, not just
         one plugin's own companion visual. */
      .content-area { padding-right: 64px; }

      /* sticky, not fixed: AppShell.js always renders its own in-flow
         header/footer around this view (the only suppression path is its
         onboarding route, unrelated) — fixed positioning would render on
         top of that header instead of below it. .sticky-header's own
         position:sticky already proves this works here. */
      .compact-topbar {
        display: block;
        position: sticky;
        top: 0;
        z-index: 20;
      }

      /* fixed, not sticky: this must float over scrolling content
         regardless of scroll position. Vertically centered rather than
         top/bottom-anchored so it stays clear of AppShell's header/footer
         without needing to touch AppShell.js at all. */
      .compact-controls {
        display: flex;
        flex-direction: column;
        gap: 10px;
        position: fixed;
        top: 50%;
        right: 10px;
        transform: translateY(-50%);
        z-index: 20;
      }
    }

    /* Narrated lessons: the Narrate toggle (only with narrationRef) and the
       narration strip standing in the bottom bar. */
    .narr-toggle {
      flex: none; display: inline-flex; align-items: center; gap: 6px;
      height: 44px; padding: 0 14px; box-sizing: border-box;
      border-radius: var(--radius-pill); border: var(--rule-w) solid var(--border-color);
      background: var(--bg-surface); color: var(--text-main);
      box-shadow: var(--lip) var(--border-color);
      font: inherit; font-family: var(--font-ui); font-weight: var(--fw-strong); font-size: 0.92rem;
      cursor: pointer;
    }
    .narr-toggle:active { transform: translateY(2px); box-shadow: none; }
    .narr-toggle:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }
    .narr-toggle.round { width: 44px; padding: 0; justify-content: center; border-radius: 50%; }
    .narr-toggle.round .nav-label { display: none; }
    :host([data-look="plain"]) .narr-toggle { border-radius: var(--radius-sm); border-width: 1px; box-shadow: none; }
    :host([data-look="plain"]) .narr-toggle:active { transform: none; }
    @media (max-width: 600px) {
      .narr-toggle { width: 44px; padding: 0; justify-content: center; }
      .narr-toggle .nav-label { display: none; }
    }
    .narr-bar .narr-inner {
      padding: 6px 0 calc(6px + env(safe-area-inset-bottom));
      padding-left: env(safe-area-inset-left);
      padding-right: env(safe-area-inset-right);
      gap: var(--space-2);
    }
    .narr-bar narration-strip { flex: 1 1 auto; min-width: 0; }
    /* Blank screen (Q-90, a remote's B or period): the stage and its chrome
       give way to the plain page background; any key or a tap returns. */
    .narr-blank {
      position: fixed; inset: 0; z-index: 1000; background: var(--bg-base);
      display: flex; align-items: flex-end; justify-content: center; cursor: pointer;
    }
    .narr-blank span {
      margin-bottom: 18px; font-family: var(--font-ui); font-size: 0.8rem;
      color: var(--text-muted); opacity: 0.6;
    }
    .narr-bar .narr-check { flex: none; min-height: 44px; padding: 10px 18px; }
    @media (max-width: 520px) {
      /* No room beside the strip: Check takes its own row above it. */
      .narr-bar .narr-inner { flex-wrap: wrap; padding-inline: var(--space-2); }
      .narr-bar .narr-check { order: -1; flex: 1 1 100%; }
    }
    :host([data-lesson-mode="story"]) .narr-bar { left: 0; right: 0; }
    .action-bar.narr-bar { background: var(--bg-base); }
    @media (max-height: 600px) and (orientation: landscape) {
      .action-bar.narr-bar { display: block; }
      .narr-bar .narr-inner {
        max-width: none;
        padding: 3px calc(64px + env(safe-area-inset-right)) calc(3px + env(safe-area-inset-bottom)) calc(10px + env(safe-area-inset-left));
      }
    }
  `];

  static properties = {
    lessonId: { type: String },
    profileId: { type: String },
    _currentBlockIndex: { type: Number, state: true },
    _totalBlocks: { type: Number, state: true },
    _isComplete: { type: Boolean, state: true },
    _error: { type: String, state: true },
    _needsUpdate: { type: Boolean, state: true },
    _nextLessonRef: { type: String, state: true },
    _nextLessonTitle: { type: String, state: true },
    _prevLessonRef: { type: String, state: true },
    _prevLessonTitle: { type: String, state: true },
    /**
     * The mounted block's reveal position, as reported by the engine. A fresh
     * object on every notification — an intra-block step leaves
     * `_currentBlockIndex` and `_totalBlocks` unchanged, and Lit only schedules
     * an update when a value actually changes, so without this the buttons and
     * `_canCheck()` would never re-evaluate between beats.
     */
    _stepState: { type: Object, state: true },
    _autoplay: { type: Boolean, state: true },
    // Narrated lessons (NarrationPacer.js): a sidecar is loaded / narrated mode is on.
    _narrAvail: { type: Boolean, state: true },
    _narrOn: { type: Boolean, state: true },
    // "Full text" on the caption (spec W1 D29n): the whole beat, not one phrase.
    _narrFull: { type: Boolean, state: true },
    // Presenter mode (Q-90): caption off, the blanked screen, the key help.
    _narrCapOff: { type: Boolean, state: true },
    _narrBlank: { type: Boolean, state: true },
    _narrHelp: { type: Boolean, state: true },
    _narrTitle: { type: String, state: true },
    _narrTitleKey: { type: Number, state: true },
    // Title strip (lesson-modes-plan.md, prototype A's lesson head).
    _lessonTitle: { type: String, state: true },
    _moduleTitle: { type: String, state: true },
    _lessonNumber: { type: Number, state: true },
    // The mounted slide's own title (its markdown's opening heading), which
    // the plain look's lesson head shows in place of the lesson title.
    _slideTitle: { type: String, state: true },
    _slideDeck: { type: String, state: true },
    // Phone width: the slide keeps its own title (content-block@1, 600px).
    _narrow: { type: Boolean, state: true },
    moduleId: { type: String },
    // Deep-linked position from the URL (see Router.js/AppShell.js) — one-shot
    // inputs consumed by `_initEngine()`/`updated()`'s seek branch, never
    // written back to from engine-driven state (that flows through
    // `_currentBlockIndex`/`_stepState` instead — see `_syncUrl()`'s own
    // comment for why these stay two separate, non-aliased concerns).
    blockIndex: { type: Number },
    beatIndex: { type: Number },
    nodeId: { type: String },
    blockRef: { type: String },
    // Offline marks (Q-100a, core/OfflineAvailability.js): this lesson's status, the device's connection.
    _offStatus: { type: Object, state: true },
    _online: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.lessonId = '';
    this.profileId = '';
    this._currentBlockIndex = 0;
    this._totalBlocks = 1;
    this._isComplete = false;
    this._offStatus = null;
    this._online = OfflineAvailability.online();
    this._onAvail = ({ lessonId, status }) => { if (lessonId === this._offLessonId) this._offStatus = status; };
    this._onNet = ({ online }) => { this._online = online; };
    this._error = null;
    this._nextLessonRef = null;
    this._nextLessonTitle = null;
    this._prevLessonRef = null;
    this._prevLessonTitle = null;
    this._stepState = { step: 0, steps: 1, done: true, canGoBack: false, canGoForward: true };
    this._autoplay = false;
    this._narrAvail = false;
    this._narrOn = false;
    this._narr = null;
    this._lessonTitle = '';
    this._moduleTitle = '';
    this._lessonNumber = 0;
    this._slideTitle = '';
    this._slideDeck = '';
    this._narrowMq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 600px)') : null;
    this._narrow = !!this._narrowMq?.matches;
    this._onNarrow = (e) => { this._narrow = e.matches; };
    this.moduleId = null;

    this._engine = null;
    // Consecutive misses per question, for cue:wrong vs cue:wrong-again. One
    // per element: AppShell reuses this element across lessons, so the key
    // carries the lessonId (see _handleCheck()).
    this._misses = createMissTracker();
    // Bumped by every _initEngine(): a module JSON that arrives after a newer
    // navigation must not force its look / mode over the newer module's.
    this._initSeq = 0;
    // Tracks the block index as of the last update, so a block-to-block
    // transition can be told apart from the very first mount (which should
    // not scroll — the student is already looking at the top of the page).
    this._prevBlockIndex = null;

    this._touchStartX = 0;
    this._touchStartY = 0;

    // Set by _handleStartPrev() right before it navigates — consumed once by
    // _initEngine() on the freshly-loaded (previous) lesson, then cleared.
    this._pendingStartAtEnd = false;

    // See _syncUrl()'s own comment — tracks the block/node key (not the beat)
    // of the last position this component itself wrote to the URL, so it can
    // tell a slide change (pushState) apart from a beat-only change
    // (replaceState) and never double-write a URL popstate just handed it.
    this._lastSyncedBlockKey = undefined;
  }

  /** Autoplay is a per-profile preference, not per lesson. */
  get _autoplayKey() { return `coauthor:autoplay:${this.profileId || 'default'}`; }
  /** Narrated or text: a per-profile preference too. */
  get _narrateKey() { return narrateKey(this.profileId); }

  connectedCallback() {
    super.connectedCallback();
    // What a look keeps off when it stands on the page (cue:stage-query).
    this._stopPageAnswers = answerPageQueries(() => {
      const root = this.shadowRoot;
      if (!root) return [];
      const coaches = ['coach', 'math-coach'].map((k) => root.querySelector(`companion-slot[kind="${k}"]`)?.companion);
      return [
        this._engine?._mountedEl,
        ...root.querySelectorAll('.sticky-header, .action-bar button, .beat-count, .turn-hint, .compact-topbar, .compact-controls'),
        ...coaches.filter((c) => c?.hasAttribute?.('visible')),
      ];
    }, () => {
      const coach = this.shadowRoot?.querySelector('companion-slot[kind="coach"]')?.companion;
      return coach?.hasAttribute?.('visible') ? { actor: coach.mascot, beside: [coach] } : null;
    });
    // Cancels this view's open confirm dialogs on disconnect (see showConfirm).
    this._dialogAbort = new AbortController();
    this._poeListener = (p) => emitCue(CUES.PREDICT, { correct: !!p?.isCorrect, host: this._engine?._mountedEl || null });
    EventBus.on('poe:prediction-submitted', this._poeListener);

    // AppShell's merged header bar → this session. Back/Autoplay/Previous/
    // Next render in AppShell.js now (see .lesson-nav-group there), reached
    // over EventBus rather than AppShell calling into this shadow root
    // directly (invariant 4).
    this._headerActionListener = ({ action }) => {
      if (action === 'back') {
        if (this.moduleId) this._handleBackToModule();
        else this._handleFinish();
      } else if (action === 'toggle-autoplay') {
        this._handleAutoplayToggle();
      } else if (action === 'prev') {
        this._handlePrev();
      } else if (action === 'next') {
        this._handleNext();
      }
    };
    EventBus.on('lesson:header-action', this._headerActionListener);

    // Each mounted slide: its title, for the plain look's head.
    this._beatChangedListener = ({ lessonId, current } = {}) => {
      if (!this._engine || lessonId !== this._engine.lessonId) return;
      this._slideTitle = slideTitleOf(current) || '';
      // Narrated: the slide's title is shown, never spoken (a fading overlay;
      // under plain too, whose head drops it while narrated).
      const prompt = current?.prompt?.en ?? current?.prompt;
      this._narrTitle = this._slideTitle || (typeof prompt === 'string' ? leadingHeading(prompt) : '') || '';
      this._narrTitleKey = (this._narrTitleKey || 0) + 1;
      this._flagBlock = current || null;
      const deck = current?.deck;
      this._slideDeck = (typeof deck === 'string' ? deck : deck?.en) || '';
    };
    EventBus.on('lesson:beat-changed', this._beatChangedListener);
    EventBus.on('offline:availability', this._onAvail);
    EventBus.on('offline:network', this._onNet);
    this._online = OfflineAvailability.online();
    this._narrowMq?.addEventListener('change', this._onNarrow);

    // A plugin that knows its question is solved (math-workspace@1 when every
    // part reaches its goal) asks for the Check itself, so a "Solved!" board
    // never waits on a second button press. Only the mounted question's own
    // request counts, and only while the Check button would be on offer.
    this._requestCheckListener = ({ questionId } = {}) => {
      const el = this._engine?._mountedEl;
      if (!el || (questionId && el._data?.id !== questionId)) return;
      if (this._canCheck()) this._handleCheck();
    };
    EventBus.on('question:request-check', this._requestCheckListener);

    // Keyboard advance. Once clicking is the primary verb of a lesson, having
    // to aim at a button for every beat is the wrong ergonomics — and there was
    // no keyboard navigation here at all before.
    this._keyListener = (e) => this._handleKey(e);
    window.addEventListener('keydown', this._keyListener);

    // Swipe advance. Bound on `this` (the whole host), not `.content-area` —
    // the lesson-complete screen is a structurally different template with
    // no `.content-area` at all, and swipe needs to work there too (to cross
    // into the next lesson). Both passive and neither ever calls
    // preventDefault(), so normal vertical scrolling, pinch-zoom, text
    // selection, and a simulation's own <input type="range"> drag are all
    // unaffected — this only ever reacts after a gesture completes.
    this._touchStartListener = (e) => this._handleTouchStart(e);
    this._touchEndListener = (e) => this._handleTouchEnd(e);
    this.addEventListener('touchstart', this._touchStartListener, { passive: true });
    this.addEventListener('touchend', this._touchEndListener, { passive: true });
  }

  disconnectedCallback() {
    if (this._publishChromeHeight) {
      window.removeEventListener('resize', this._publishChromeHeight);
      window.removeEventListener('appbar-offset-changed', this._publishChromeHeight);
    }
    super.disconnectedCallback();
    this._stopPageAnswers?.();
    EventBus.off('poe:prediction-submitted', this._poeListener);
    this._dialogAbort?.abort();
    EventBus.off('lesson:header-action', this._headerActionListener);
    EventBus.off('lesson:beat-changed', this._beatChangedListener);
    EventBus.off('offline:availability', this._onAvail);
    EventBus.off('offline:network', this._onNet);
    this._unwatchOffline?.();
    this._unwatchOffline = null;
    this._offLessonId = null;
    this._narrowMq?.removeEventListener('change', this._onNarrow);
    EventBus.off('question:request-check', this._requestCheckListener);
    // Tells AppShell's merged bar to stop showing this lesson's controls
    // immediately — its own route-changed safety net covers the same case,
    // but this is the direct signal and fires first.
    EventBus.emit('lesson:header-nav', { active: false });
    document.documentElement.style.removeProperty('--shell-main-pad-top');
    window.removeEventListener('keydown', this._keyListener);
    this.removeEventListener('touchstart', this._touchStartListener);
    this.removeEventListener('touchend', this._touchEndListener);
    if (this._headerRO) {
      this._headerRO.disconnect();
      this._headerRO = null;
    }
    this._actionBarRO?.disconnect();
    this._actionBarRO = null;
    this._actionBarEl = null;
    document.documentElement.style.setProperty('--lesson-chrome-bottom', '0px');
    document.documentElement.style.setProperty('--lesson-chrome-right', '0px');
    // Tear the engine down, or its autoplay timer outlives the view. Not
    // hypothetical: `authoring-app/modules/screens/full-preview.js` loads this
    // runtime in an iframe, so a stray timer would keep advancing slides and
    // writing `lessonProgress` under the author's own profile.
    this._destroyNarration();
    if (this._engine) {
      this._engine.destroy();
      this._engine = null;
    }
  }

  /**
   * Publishes the sticky header's live rendered height as a CSS custom
   * property on the document root, so beat/block content nested in *other*
   * shadow roots (ContentBlock, ChoiceListBase) can offset their own
   * `scroll-margin-top` against it — `var()` resolution crosses Shadow DOM
   * boundaries even though selectors can't, the same channel ThemeManager
   * already uses for theme tokens. A ResizeObserver rather than a fixed
   * number because the header's real height changes with the viewport
   * (the `@media (max-width:480px)` label hide, and the
   * `@media (max-height:600px) and (orientation:landscape)` un-stick below).
   */
  firstUpdated() {
    // Header is re-queried on every publish: the lesson-complete template has
    // no .sticky-header, so moving on to the next lesson mounts a NEW element
    // and a captured one would read 0 forever (oversized simulations).
    const header = this.shadowRoot.querySelector('.sticky-header');
    if (!header) return;

    // Publishes ALL the fixed chrome above the content, not just this header's
    // own height: AppShell's pill is sticky too, so it permanently occupies
    // --appbar-offset px that consumers must also clear. Publishing only
    // offsetHeight made content-block's _availableHeight() over-estimate the
    // usable viewport by ~94px, which sized every image and simulation taller
    // than the space that actually existed and pushed it partly off-screen.
    // In short landscape the header is display:none and --appbar-offset is 0,
    // so this correctly collapses to 0.
    this._publishChromeHeight = () => {
      const offset = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--appbar-offset')
      ) || 0;
      const cur = this.shadowRoot.querySelector('.sticky-header');
      if (cur !== this._headerEl) this._observeHeader();
      // A head that scrolls away (plain on a phone) covers nothing once the
      // page moves, so only the app bar is chrome then.
      const pinned = cur?.offsetHeight && getComputedStyle(cur).position !== 'static';
      const total = cur?.offsetHeight ? offset + (pinned ? cur.offsetHeight : 0) : 0;
      const prevTotal = document.documentElement.style.getPropertyValue('--lesson-sticky-header-h');
      document.documentElement.style.setProperty('--lesson-sticky-header-h', `${total}px`);
      // content-block sizes its simulation from this value but only re-renders
      // on its own column/window resizes; on a fresh lesson start the first
      // slide mounts before this is published, so it stayed oversized.
      if (prevTotal !== `${total}px`) window.dispatchEvent(new CustomEvent('lesson-chrome-changed'));
      // Short landscape: .content-area keeps a fixed 64px right gutter for the
      // floating .compact-controls rail. --lesson-chrome-right is what the rail
      // really covers (viewport right edge to its left edge), so a block that
      // can measure itself (the Story diorama theatre) may use the rest.
      const rail = this.shadowRoot.querySelector('.compact-controls');
      const left = rail?.offsetWidth ? rail.getBoundingClientRect().left : 0;
      document.documentElement.style.setProperty('--lesson-chrome-right', left ? `${Math.ceil(window.innerWidth - left)}px` : '0px');
    };

    this._headerRO = new ResizeObserver(this._publishChromeHeight);
    this._observeHeader = () => {
      const h = this.shadowRoot.querySelector('.sticky-header');
      this._headerRO?.disconnect();
      this._headerEl = h;
      if (h) this._headerRO?.observe(h);
    };
    this._observeHeader();
    // A media query flipping --appbar-offset resizes nothing the observer
    // watches, so the viewport itself has to be listened to as well.
    window.addEventListener('resize', this._publishChromeHeight);
    window.addEventListener('appbar-offset-changed', this._publishChromeHeight);
    this._publishChromeHeight();
  }

  /**
   * → / Space advance, ← goes back.
   *
   * Ignored while the student is typing, or has focused a control that owns
   * these keys itself — a free-text answer box, a select, a slider on a
   * simulation. `composedPath()[0]` rather than `e.target`, because the real
   * target inside a plugin's Shadow DOM is retargeted to the host otherwise.
   *
   * Also ignored when a native `<dialog>` (`showConfirm`/`showAlert` from
   * `dialogs.js`) is open — those are appended to `document.body` outside
   * this component entirely, so without this check ArrowRight/Left would
   * both fail to work as the dialog's own navigation *and* silently advance
   * the lesson underneath it. And ignored whenever a nested handler already
   * called `preventDefault()` on this same event (e.g. a simulation canvas's
   * own ArrowRight/Left handler) — that's the signal that the key press was
   * already consumed by whatever had focus, so this listener (which runs on
   * `window`, last in the bubble phase) must not also treat it as "advance".
   */
  _handleKey(e) {
    if (this._error) return;
    // Blanked (Q-90, presenter): any key brings the screen back, and does only that.
    if (this._narrBlank) { e.preventDefault(); this._setNarrBlank(false); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.defaultPrevented) return;
    if (document.querySelector('dialog[open]')) return;

    const el = e.composedPath()[0];
    const tag = el?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return;
    // Space on a focused button is that button's own activation.
    if (e.key === ' ' && tag === 'button') return;

    // Narrated: Space plays and pauses; the arrows still step beat by beat.
    if (e.key === ' ' && this._narrOn && this._narr) {
      e.preventDefault();
      this._narr.toggle();
      return;
    }
    // Narrated: presenter and remote keys (Q-90).
    if (this._narrOn && this._narr && this._narrKey(e)) return;
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      this._handleAdvanceOrNextLesson();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this._handleRetreatOrPrevLesson();
    }
  }

  _handleTouchStart(e) {
    if (!e.touches?.[0]) return;
    this._touchStartX = e.touches[0].clientX;
    this._touchStartY = e.touches[0].clientY;
    const owned = e.defaultPrevented || this._touchOwnedByControl(e);
    this._touchOwned = owned || (e.touches.length > 1 && !!this._touchOwned);
  }

  /** A slider, or anything that takes touch for itself (touch-action: none: a
   *  scene canvas with a pointer handler, a drag handle; pan-y: a scene picture
   *  on a page that still scrolls, sideways drags being the scene's), owns the drag. */
  _touchOwnedByControl(e) {
    for (const node of e.composedPath()) {
      if (node === this) return false;
      if (!(node instanceof Element)) continue;
      if (node.matches('input[type="range"]')) return true;
      const action = getComputedStyle(node).touchAction;
      if (action === 'none' || action === 'pan-y') return true;
    }
    return false;
  }

  /**
   * Swipe left/right — same effect as Next/Previous (including crossing a
   * lesson boundary). Never fires on a mostly-vertical drag (reading a long
   * beat must keep scrolling normally) — see SWIPE_THRESHOLD_PX/
   * SWIPE_AXIS_RATIO above. A drag that began on a control is the control's.
   */
  _handleTouchEnd(e) {
    if (this._error || !e.changedTouches?.[0]) return;
    if (this._touchOwned) return;
    const dx = e.changedTouches[0].clientX - this._touchStartX;
    const dy = e.changedTouches[0].clientY - this._touchStartY;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return;
    if (dx < 0) this._handleAdvanceOrNextLesson();
    else this._handleRetreatOrPrevLesson();
  }

  async updated(changedProperties) {
    // Narrated (Q-84): the page furniture styles key off this.
    if (changedProperties.has('_narrOn')) {
      this.toggleAttribute('narr-on', !!this._narrOn);
      // ...and the shell's own top padding over the slim head (plain, desktop).
      const rootStyle = document.documentElement.style;
      if (this._narrOn && this.look === 'plain' && !this._narrow) rootStyle.setProperty('--shell-main-pad-top', '4px');
      else rootStyle.removeProperty('--shell-main-pad-top');
    }
    // The same lesson reopened under another module (its module decides the
    // forced look and mode, and the next/previous links) is a fresh start too.
    if ((changedProperties.has('lessonId') || (changedProperties.has('moduleId') && this._engine)) && this.lessonId) {
      await this._initEngine();
    } else if (
      this._engine &&
      (changedProperties.has('blockIndex') || changedProperties.has('beatIndex') ||
       changedProperties.has('nodeId') || changedProperties.has('blockRef'))
    ) {
      // Same lesson still mounted, only the deep-linked position changed —
      // either the browser Back/Forward button crossing our own pushState/
      // replaceState entries (see _syncUrl()), or a fresh deep link handed
      // to a lesson that was already the one mounted (e.g. two same-tab
      // fragment navigations in a row: `lessonId` itself never changes, so
      // the `if` branch above never fires). Seeks in-memory rather than
      // re-fetching the already-loaded lesson.
      await this._engine.seekTo({
        blockIndex: this.blockIndex,
        nodeId: this.nodeId,
        beatIndex: this.beatIndex,
        blockRef: this.blockRef,
      });
    }
    // A new block mounted (an intra-block beat change leaves
    // `_currentBlockIndex` untouched, per its own property doc comment
    // above) — scroll it into view the same way ProgressiveDisclosureMixin
    // does for a beat, so a long previous block doesn't leave the student
    // scrolled somewhere with the new one off-screen. Skipped on the very
    // first block of a lesson (`_prevBlockIndex === null`) and reset
    // whenever `_initEngine()` resets `_currentBlockIndex` for a fresh
    // lesson, so that first block doesn't scroll either.
    if (changedProperties.has('_currentBlockIndex')) {
      if (this._prevBlockIndex !== null && this._prevBlockIndex !== this._currentBlockIndex) {
        this._scrollContentIntoView();
      }
      this._prevBlockIndex = this._currentBlockIndex;
    }
    this._publishHeaderNav();
    this._observeActionBar();
    this._publishChromeHeight?.();
    this._cueComplete();
  }

  /** cue:lesson-complete, once per complete screen: its companion slot is a
   *  fresh element each time the screen renders. */
  _cueComplete() {
    const slot = this._isComplete ? this.shadowRoot?.querySelector('.complete > companion-slot') : null;
    if (!slot || slot === this._cuedSlot) return;
    this._cuedSlot = slot;
    const companion = slot.companion;
    emitCue(CUES.LESSON_COMPLETE, {
      lessonId: this.lessonId,
      right: this._sessionRight || 0,
      wrong: this._sessionWrong || 0,
      companion,
    });
  }

  /**
   * Publishes the bottom action bar's live height as --lesson-chrome-bottom
   * on the document root (same channel as --lesson-sticky-header-h): the
   * bar is position:fixed, so content and every plugin's available-height
   * budget must subtract it explicitly. Re-attached whenever the bar element
   * is replaced (it is absent on the complete/error screens, which publish 0).
   */
  _observeActionBar() {
    const bar = this.shadowRoot?.querySelector('.action-bar') || null;
    if (bar === this._actionBarEl) return;
    this._actionBarRO?.disconnect();
    this._actionBarEl = bar;
    const publish = () => {
      const h = bar ? bar.offsetHeight : 0;
      const root = document.documentElement;
      const prev = root.style.getPropertyValue('--lesson-chrome-bottom');
      root.style.setProperty('--lesson-chrome-bottom', `${h}px`);
      if (prev !== `${h}px`) window.dispatchEvent(new CustomEvent('lesson-chrome-changed'));
    };
    if (bar) {
      this._actionBarRO = new ResizeObserver(publish);
      this._actionBarRO.observe(bar);
    }
    publish();
  }

  /**
   * Tells AppShell's merged header bar (.lesson-nav-group) what to show —
   * unconditional at the end of every update rather than gated to specific
   * changed properties, since several independent properties feed it
   * (`_stepState`, `_autoplay`, `_isComplete`, `_error`, `moduleId`) and an
   * EventBus emit is cheap. `active` is false on the complete/error screens,
   * which never rendered a nav bar of their own either — the completion
   * screen has its own in-content "Back to the path"/"Back to home" button
   * instead (see render()).
   */
  _publishHeaderNav() {
    EventBus.emit('lesson:header-nav', {
      active: !this._error && !this._isComplete,
      canGoBack: !!this._stepState?.canGoBack,
      canGoForward: this._stepState?.canGoForward !== false,
      autoplay: this._autoplay,
      // Narrated: the timer's Autoplay does not apply, so the header hides it.
      narrated: !!this._narrOn,
      backLabel: this.moduleId ? 'Back' : 'Home',
    });
  }

  _scrollContentIntoView() {
    const el = this.shadowRoot.getElementById('block-container');
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start', inline: 'nearest' });
    });
  }

  async _initEngine() {
    this._destroyNarration();
    if (this._engine) {
      this._engine.destroy();
    }
    
    this._error = null;
    this._needsUpdate = false;
    this._isComplete = false;
    this._currentBlockIndex = 0;
    this._prevBlockIndex = null;
    this._totalBlocks = 1;
    this._nextLessonRef = null;
    this._nextLessonTitle = null;
    this._prevLessonRef = null;
    this._prevLessonTitle = null;
    this._lessonTitle = '';
    this._moduleTitle = '';
    this._lessonNumber = 0;
    // See _syncUrl()'s own comment — a fresh engine means the next position
    // notification is always this lesson's *starting* position, which must
    // replaceState (attach to the nav entry that got us here) not pushState.
    this._lastSyncedBlockKey = undefined;

    // Wait for DOM to update in case we are recovering from an error state
    await this.updateComplete;

    const seq = ++this._initSeq;
    try {
      // A lesson opened outside a module context belongs to no story-only
      // module; the module branch below re-forces before the engine mounts.
      if (!this.moduleId) {
        LessonModeManager.setForced(null);
        LookManager.setCourse(null);
        // A lesson opened on its own still belongs to a bundle: its accent.
        // Awaited: its look (when the module names none) decides how the
        // first slide mounts.
        await LookManager.followBundle(CourseSourceManager.deriveBundleId(this.lessonId), loadCourseManifest);
        if (seq !== this._initSeq) return;
      }

      // 1. Resolve module data for next/previous-lesson linking
      let gateModule = null;
      if (this.moduleId) {
        try {
          const fetchPath = this.moduleId.startsWith('/') ? this.moduleId :
                            (this.moduleId.startsWith('content/') ? `/${this.moduleId}` : `/content/${this.moduleId}`);
          const moduleBundleId = CourseSourceManager.deriveBundleId(fetchPath);
          const moduleData = await ContentLoader.loadJSON(fetchPath);
          gateModule = moduleData;
          // Story-only module: force the mode BEFORE the engine mounts the
          // first block, so it never renders once in the wrong mode.
          // The course's own look first: it decides which modes exist.
          // Always the module open now, never an earlier one: a response that
          // lost the race to a newer navigation is ignored.
          if (seq !== this._initSeq) return;
          LookManager.setCourse(moduleData);
          await LookManager.followBundle(moduleBundleId, loadCourseManifest);
          if (seq !== this._initSeq) return;
          LessonModeManager.setForced(moduleData.lessonMode === 'story' ? 'story' : null);
          const currentRefBase = this.lessonId.split('/').pop().replace('.json', '');
          const lessons = moduleData.lessons || [];
          const currentIndex = lessons.findIndex(l => {
            const ref = l.lessonRef || l;
            return ref.includes(currentRefBase);
          });
          this._moduleTitle = moduleData.title?.en || '';
          if (currentIndex !== -1) {
            this._lessonNumber = currentIndex + 1;
            if (currentIndex + 1 < lessons.length) {
              const nextL = lessons[currentIndex + 1];
              this._nextLessonRef = CourseSourceManager.expandRef(nextL.lessonRef || nextL, moduleBundleId);
              this._nextLessonTitle = nextL.title?.en || `Lesson ${currentIndex + 2}`;
            }
            if (currentIndex > 0) {
              const prevL = lessons[currentIndex - 1];
              this._prevLessonRef = CourseSourceManager.expandRef(prevL.lessonRef || prevL, moduleBundleId);
              this._prevLessonTitle = prevL.title?.en || `Lesson ${currentIndex}`;
            }
          }
        } catch (e) {
          console.warn("Could not load module data for next/previous-lesson linking", e);
          // An unreadable module forces nothing; never keep the last module's.
          if (seq === this._initSeq) { LessonModeManager.setForced(null); LookManager.setCourse(null); }
        }
      }

      // Engine version gate: content that needs a newer engine is not rendered;
      // the dashboard is where updates are applied (never mid-lesson).
      if (await bundleNeedsNewerEngine(CourseSourceManager.deriveBundleId(this.lessonId), gateModule)) {
        if (seq === this._initSeq) this._needsUpdate = true;
        return;
      }
      if (seq !== this._initSeq) return;

      // 2. Initialize Engine
      const container = this.shadowRoot.getElementById('block-container');
      this._watchOffline();
      this._engine = new LessonEngine(this.profileId, this.lessonId, container);
      this._engine.moduleId = this.moduleId || null;
      // This head shows each slide's title (plain hoists it out of the slide),
      // and figures are numbered lesson.slide.
      this._slideTitle = '';
      this._engine.slideHead = true;
      this._engine.lessonNumber = this._lessonNumber || this._lessonNumberFromId();
      
      this._engine.onProgress = (current, total, stepState) => {
        this._currentBlockIndex = current;
        this._totalBlocks = total;
        this._isComplete = false;
        if (stepState) this._stepState = stepState;
      };
      
      // The lesson-complete cue goes out from updated(), once the complete
      // screen (and the companion on it) is rendered.
      this._engine.onComplete = () => {
        this._isComplete = true;
        this._narr?.onComplete();
      };

      // The engine switches autoplay off by itself when it lands on a block a
      // timer must not skip — a question, or one with nothing to reveal — so
      // the toggle is driven from the engine rather than mirrored optimistically.
      this._engine.onAutoplayChange = (on) => {
        this._autoplay = on;
        // The timer and the narration are two ways of pacing one cursor: one at a time.
        if (on && this._narr?.narrated) this._narr.setNarrated(false);
      };

      this._engine.onPositionChange = (pos) => {
        this._flagPos = pos;
        this._syncUrl(pos);
        this._narr?.onPosition(this._engine?.narrationPosition());
      };

      const startAtEnd = this._pendingStartAtEnd;
      this._pendingStartAtEnd = false;
      await this._engine.init({
        startAtEnd,
        blockIndex: this.blockIndex,
        nodeId: this.nodeId,
        beatIndex: this.beatIndex,
        blockRef: this.blockRef,
      });

      this._lessonTitle = this._engine.lessonData?.title?.en || '';
      emitCue(CUES.LESSON_START, { lessonId: this.lessonId });
      // Optional: no narrationRef, no Narrate button, nothing else changes.
      // Q-56: the sidecar (can be 200+ KB) loads now only for a learner who
      // narrates; otherwise the button shows at once and the first tap
      // loads it, so it never competes with the first slide on a slow line.
      // Q-90: a course may prefer narrated mode (manifest narration.preferredMode).
      if (this._engine.lessonData?.narrationRef) {
        const want = await this._narrationWanted();
        if (seq !== this._initSeq) return;
        if (want) this._loadNarration(this._engine, seq);
        else this._narrAvail = true;
      }

      // Restore the preference only after the first block is mounted; before
      // that the engine has nothing to check eligibility against and would
      // refuse.
      try {
        if (localStorage.getItem(this._autoplayKey) === '1') this._engine.setAutoplay(true);
      } catch { /* storage disabled — autoplay simply stays off */ }
    } catch (err) {
      this._error = err.message;
    }
  }

  /**
   * Keeps the URL in step with wherever the engine actually is —
   * `LessonEngine.onPositionChange`'s payload, `{ mode, blockIndex, nodeId,
   * step }`. This is the only place `window.location.hash` is written from
   * in-lesson navigation (Next/Prev/arrow-keys/swipe/autoplay all funnel
   * through the engine, which always calls back here) — everywhere else
   * (`_handleStartNext` etc.) still assigns `location.hash` directly for a
   * lesson-to-lesson/module-boundary crossing, unchanged.
   *
   * Uses `history.pushState`/`replaceState`, never `location.hash = ...`:
   * neither fires `hashchange`/`popstate`, so this can never re-trigger
   * `Router` and tear this same engine down mid-navigation. A slide/node
   * change is a new Back-button stop (`pushState`); a beat-only change
   * within the same slide just keeps the current entry's URL accurate
   * (`replaceState`) — confirmed history-granularity choice, see the plan.
   *
   * Idempotent by design, not just by intent: if the URL this would write
   * already matches `location.hash`, it no-ops instead of writing anything.
   * That's what stops the *incoming* direction — a browser Back/Forward
   * landing here via `updated()`'s `seekTo()` branch — from turning around
   * and pushing/replacing a phantom entry in response to its own arrival.
   */
  _syncUrl(pos) {
    if (!pos || !this.lessonId) return;
    const key = pos.mode === 'flow' ? `node:${pos.nodeId}` : `block:${pos.blockIndex}`;
    const cleanRef = this.lessonId.replace(/^\//, '');
    const params = new URLSearchParams();
    // Preserve `preview=true` from whatever URL got us here — otherwise this
    // rewrite (which fires on the very first position-change, before the
    // user navigates at all) silently drops it, and ContentLoader.loadJSON's
    // isPreview check goes false for every subsequent load, hiding ai-draft
    // content again mid-session.
    const existingParams = new URLSearchParams((window.location.hash.split('?')[1]) || '');
    if (existingParams.get('preview') === 'true') params.set('preview', 'true');
    if (this.moduleId) params.set('module', this.moduleId);
    if (pos.mode === 'flow') params.set('node', pos.nodeId ?? '');
    else params.set('block', String(pos.blockIndex ?? 0));
    params.set('beat', String(pos.step ?? 0));
    const url = `#/lesson/${cleanRef}?${params.toString()}`;

    if (url === window.location.hash) {
      this._lastSyncedBlockKey = key;
      return;
    }
    if (this._lastSyncedBlockKey !== undefined && key !== this._lastSyncedBlockKey) {
      history.pushState(null, '', url);
    } else {
      history.replaceState(null, '', url);
    }
    this._lastSyncedBlockKey = key;
  }

  /**
   * The single funnel every "advance" entry point goes through — the Next
   * button (both header variants), ArrowRight/Space (`_handleKey()`, via
   * `_handleAdvanceOrNextLesson()`), and swipe-left — so the skip-confirm
   * gate below only needs to live in one place to cover all three. Previous
   * is deliberately never gated (see `_handlePrev()`): going back to
   * re-read something already seen is never a "you're about to lose this"
   * moment the way skipping forward past an unanswered question is.
   */
  async _handleNext() {
    if (!this._engine) return;
    // `_stepState.done` — no more of the mounted block's *own* beats left to
    // reveal — is what tells us this Next click will actually leave the
    // block rather than just staging another beat within it (a
    // multi-beat POE-predict stem, say). Gating on hasUnansweredQuestion()
    // alone would pop the confirm on every intra-block beat too, well before
    // the question is even answerable.
    if (this._stepState?.done && this._engine.commitPendingAnswer()) return;
    if (this._stepState?.done && this._engine.hasUnansweredQuestion()) {
      // One skip confirm at a time: a second Next must not stack another.
      if (this._confirmingSkip) return;
      this._confirmingSkip = true;
      let ok;
      try {
        ok = await showConfirm(
          "You haven't answered this yet — skip it and continue?",
          'Skip This Question?', 'OK', 'Cancel', { signal: this._dialogAbort?.signal }
        );
      } finally {
        this._confirmingSkip = false;
      }
      // The view may have been left while the dialog was open.
      if (!ok || !this._engine) return;
    }
    // Leaving the slide (no beats of its own left): Story turns the page.
    if (this._stepState?.done && this._stepState?.canGoForward !== false) {
      await this._turnPage(1, () => this._engine?.next());
    } else {
      this._engine.next();
    }
  }

  async _handlePrev() {
    if (!this._engine) return;
    if (this._stepState?.canGoBack && (this._stepState?.step ?? 0) === 0) {
      await this._turnPage(-1, () => this._engine?.previous());
    } else {
      this._engine.previous();
    }
  }

  /**
   * Story's page turn, as the look shows it (src/ui/pageChange.js; Quill pulls
   * the page over, src/ui/pageTurn.js). Slides count half towards its novelty
   * score, since a story is many turns. Where that cannot run (no View
   * Transitions, or a look without a page turn), the older flip below: the current
   * page folds away at the spine, the engine swaps the slide, the next page
   * opens; backwards flips the other way. Classic and reduced motion just
   * navigate.
   *
   * Only #block-container is transformed, and the perspective lives inside
   * the transform itself (perspective() in the keyframes), never on an
   * ancestor: a perspective/transform ancestor would become the containing
   * block of every position:fixed overlay (the turn-nav) and drag it along.
   */
  async _turnPage(dir, navigate) {
    const el = this.shadowRoot?.getElementById('block-container');
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!this.isStoryMode || reduce || !el || this._turning) {
      if (!this._turning) await navigate();
      return;
    }
    if (canChangePage()) {
      this._turning = true;
      try {
        await changePage(async () => { await navigate(); await this.updateComplete; }, { dir, weight: 0.5 });
      } finally {
        this._turning = false;
      }
      return;
    }
    this._turning = true;
    try {
      el.classList.remove('flip-in', 'flip-in-back');
      el.classList.add(dir > 0 ? 'flip-out' : 'flip-out-back');
      await new Promise((r) => setTimeout(r, 360));
      await navigate();
      el.classList.remove('flip-out', 'flip-out-back');
      el.classList.add(dir > 0 ? 'flip-in' : 'flip-in-back');
      setTimeout(() => el.classList.remove('flip-in', 'flip-in-back'), 560);
    } finally {
      this._turning = false;
    }
  }

  /**
   * What ArrowRight/Space and swipe-left actually call — Next, except once
   * the lesson is already complete, where it crosses into the next lesson
   * instead of no-opping. The completion screen already requires one
   * deliberate action to reach (Next at the last beat), so its own presence
   * is the "are you sure" moment for this second action — no extra
   * confirmation needed here, unlike the backward crossing below.
   */
  _handleAdvanceOrNextLesson() {
    if (this._isComplete) {
      if (this._nextLessonRef) this._handleStartNext();
      return;
    }
    this._handleNext();
  }

  /**
   * What ArrowLeft/swipe-right actually call — Previous, except at the very
   * first beat of the first block, where it crosses into the previous lesson
   * instead of no-opping, landing on *its* last beat (symmetric with
   * `previous()`'s own "land on the last beat of the block behind us" — going
   * back means picking up something already seen, not replaying it from
   * scratch either at the block or the lesson level).
   */
  _handleRetreatOrPrevLesson() {
    if (this._isComplete) return; // no back-navigation from the completion screen
    if (!this._stepState?.canGoBack && this._prevLessonRef) {
      this._handleStartPrev();
      return;
    }
    this._handlePrev();
  }

  /**
   * "Flag this slide" (W4): where the learner is, from the engine's public
   * state (lessonData, the onPositionChange position, the 'lesson:beat-changed'
   * block), then the sheet. Nothing here reads a plugin's shadow DOM.
   */
  async _handleFlag() {
    if (!this._engine || this._flagOpen) return;
    this._flagOpen = true;
    try {
      if (this._engine.isAutoplaying?.()) this._handleAutoplayToggle();
      const pos = this._flagPos || {};
      const d = this._engine.lessonData || {};
      let blockId = null;
      let blockRef = null;
      if (pos.mode === 'flow') {
        blockId = pos.nodeId ?? null;
        blockRef = d.flow?.[pos.nodeId]?.block ?? null;
      } else {
        const entry = (d.blocks || [])[pos.blockIndex ?? this._currentBlockIndex - 1] || {};
        blockRef = entry.blockRef ?? null;
        blockId = entry.id ?? this._flagBlock?.id ?? null;
      }
      const bundleId = CourseSourceManager.deriveBundleId(this.lessonId);
      const lessonId = String(this.lessonId || '').replace(/^\/?(content\/)?/, '')
        .replace(bundleId ? `courses/${bundleId}/` : /^$/, '');
      const manifest = bundleId ? await loadCourseManifest(bundleId) : null;
      const beatIndex = Number.isInteger(pos.step) ? pos.step : (this._stepState?.step ?? null);
      const slideNumber = pos.mode !== 'flow' && Number.isInteger(pos.blockIndex)
        ? pos.blockIndex + 1
        : (Number.isInteger(this._currentBlockIndex) && this._currentBlockIndex > 0 ? this._currentBlockIndex : null);
      const t = d.title;
      const { openSlideFeedback } = await import('../components/SlideFeedbackSheet.js');
      const row = await openSlideFeedback({
        profileId: this.profileId,
        bundleId,
        lessonId,
        lessonTitle: (typeof t === 'string' ? t : t?.en) || this._lessonTitle || null,
        slideNumber,
        blockId,
        blockRef,
        beatIndex,
        beatExcerpt: this._beatExcerpt(this._flagBlock, beatIndex),
        contentVersion: (typeof manifest?.version === 'string' && manifest.version) || null,
      });
      if (row) EventBus.emit('ui:toast', { icon: '\u{1F6A9}', text: tr('feedback.saved_toast', 'Thanks. Saved for a grown-up to send.') });
    } catch (e) {
      console.error('Slide feedback failed:', e);
    } finally {
      this._flagOpen = false;
      this.shadowRoot?.querySelector('.flag-btn:not([hidden])')?.focus?.();
    }
  }

  /** Plain text of the beat on screen (or the block's prompt), for the
   *  excerpt. The slide's heading is dropped (the outbox names the slide
   *  already); a beat that is only the heading keeps it. Lines that were
   *  separate blocks (paragraphs, list items) are joined with " / " so
   *  sentences never run together. */
  _beatExcerpt(data, step) {
    if (!data) return '';
    const plain = (md) => String(md || '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/\n\s*\n+/g, '\u2029')
      .replace(/\n(?=\s{0,3}(#{1,6}|[-*+]|\d+\.)\s)/g, '\u2029')
      .replace(/<[^>]*>/g, ' ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
      .replace(/[*_`~$]/g, '')
      .split('\u2029')
      .map((part) => part.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' / ');
    const md = data.markdown?.en ?? data.markdown;
    if (typeof md === 'string' && md.trim()) {
      try {
        const { steps } = splitSteps(md);
        const beat = steps[Math.max(0, Math.min(steps.length - 1, step ?? 0))];
        if (beat?.md) return plain(stripLeadingHeading(beat.md)) || plain(beat.md);
      } catch { /* fall through to the whole slide */ }
      return plain(stripLeadingHeading(md)) || plain(md);
    }
    const text = (v) => (typeof v === 'string' ? v : v?.en);
    return plain(text(data.stem) || text(data.prompt) || text(data.question) || text(data.title) || '');
  }

  _renderFlagBtn(cls = '') {
    const label = tr('feedback.flag_label', 'Flag this slide');
    return html`<button class="flag-btn ${cls}" @click="${this._handleFlag}" aria-label="${label}" title="${label}">${iconFlag}</button>`;
  }

  /**
   * Loads the lesson's narration sidecar (bundle-relative `narrationRef`,
   * resolved like every other ref) and builds its pacer. A missing or
   * malformed sidecar only means no Narrate button.
   */
  async _loadNarration(engine, seq, turnOn = false) {
    const ref = engine.lessonData?.narrationRef;
    if (this._narrLoading) return this._narrLoading;
    this._narrLoading = this._loadNarrationNow(engine, seq, ref, turnOn).finally(() => { this._narrLoading = null; });
    return this._narrLoading;
  }

  async _loadNarrationNow(engine, seq, ref, turnOn) {
    try {
      const url = CourseSourceManager.resolveRef(ref, engine._bundleId);
      const sidecar = await ContentLoader.loadJSON(url);
      if (seq !== this._initSeq || engine !== this._engine) return;
      const { errors } = checkSidecarShape(sidecar);
      if (errors.length) { console.warn('narration sidecar not used:', errors.slice(0, 3).join('; ')); this._narrAvail = false; return; }
      const base = new URL(url, window.location.href);
      this._narr = new NarrationPacer(engine, sidecar, {
        audioBase: (rel) => new URL(rel, base).href,
        bus: EventBus,
        voice: getVoicePref(), // Q-43: the device's narrator voice, if this course offers it
        // Q-90: presenter mode per profile, mute per tab
        presenter: getFlag(presenterKey(this.profileId)),
        muted: getFlag(MUTED_KEY, 'session'),
      });
      this._narrCapOff = getFlag(captionsOffKey(this.profileId));
      this._narrUnsub = this._narr.subscribe((st) => {
        this._narrOn = st.narrated && !st.ended;
        if (!this._narrOn || !st.playing || (st.waiting && st.waiting !== 'beat')) this._setNarrCalm(false);
        this._applyNarrReading(st);
        this._applyNarrHold(st);
      });
      this._narr.onPosition(engine.narrationPosition());
      this._narrAvail = true;
      const want = turnOn || await this._narrationWanted();
      if (seq !== this._initSeq || engine !== this._engine) return;
      if (want) {
        this._narr.setNarrated(true);
        // Opened narrated by the course's preference: its clips are worth fetching.
        if (!turnOn && this._narrPreferred) EventBus.emit('narration:wanted', { lessonId: engine.lessonId, profileId: this.profileId });
      }
    } catch (e) {
      console.warn('narration could not be loaded', e);
      // Shown before loading (Q-56): a sidecar that cannot be used hides it again.
      if (seq === this._initSeq && engine === this._engine && !this._narr) this._narrAvail = false;
    }
  }

  /**
   * Open in narrated mode? (Q-90) A course whose manifest sets
   * `narration.preferredMode` opens in that mode until the learner picks one
   * in that course; then their last pick there wins (per profile, per course,
   * localStorage beside the profile-wide key). A course without the field:
   * the profile-wide narrated/text preference, exactly as before.
   */
  async _narrationWanted() {
    const bid = this._engine?._bundleId || null;
    let pref = '';
    try { pref = bid ? readCourseMeta(await loadCourseManifest(bid)).narration.preferredMode : ''; } catch { pref = ''; }
    this._narrPreferred = pref;
    if (pref) {
      const own = getCourseNarrateChoice(this.profileId, bid);
      return own ? own === '1' : pref === 'narrated';
    }
    try { return localStorage.getItem(this._narrateKey) === '1'; } catch { return false; }
  }

  /** The learner chose a mode: kept profile-wide (as before) and, for a course with a preferred mode, for that course. */
  _storeNarrateChoice(on) {
    try { localStorage.setItem(this._narrateKey, on ? '1' : '0'); } catch { /* non-fatal */ }
    const bid = this._engine?._bundleId;
    if (this._narrPreferred && bid) {
      try { localStorage.setItem(courseNarrateKey(this.profileId, bid), on ? '1' : '0'); } catch { /* non-fatal */ }
    }
  }

  _destroyNarration() {
    this._narrLoading = null;
    this._narrUnsub?.();
    this._narrUnsub = null;
    this._narr?.destroy();
    this._narr = null;
    this._narrAvail = false;
    this._narrOn = false;
    this._narrBlank = false;
    this._narrHelp = false;
  }

  async _toggleNarration() {
    if (!this._narr) {
      // Q-56: not loaded yet (narration was off at open): load, then narrate.
      if (!this._narrAvail || !this._engine) return;
      this._storeNarrateChoice(true);
      await this._loadNarration(this._engine, this._initSeq, true);
      if (this._narr?.narrated) EventBus.emit('narration:wanted', { lessonId: this._engine?.lessonId, profileId: this.profileId });
      return;
    }
    const on = !this._narr.narrated;
    this._narr.setNarrated(on);
    this._storeNarrateChoice(on);
    // Q-35: narrated now, so the clips are worth fetching for offline use.
    if (on) EventBus.emit('narration:wanted', { lessonId: this._engine?.lessonId, profileId: this.profileId });
  }

  _onNarrationAction(e) {
    const { action } = e.detail || {};
    const p = this._narr;
    if (!p) return;
    if (action === 'toggle') p.toggle();
    else if (action === 'continue') p.continueFromWait();
    else if (action === 'prev') { if (p.presenter) this._narrPrev(); else this._handlePrev(); }
    else if (action === 'next') { if (p.presenter) this._narrNext(false); else this._handleNext(); }
    else if (action === 'mute') this._narrMute();
    else if (action === 'presenter') this._narrPresenter();
    else if (action === 'captions') this._narrCaptions();
    else if (action === 'help') this._narrHelp = !this._narrHelp;
    else if (action === 'read') this._toggleNarration();
    else if (action === 'voice') this._setNarrationVoice(e.detail.voice);
    else if (action === 'fulltext') { this._narrFull = !this._narrFull; this._applyNarrReading(p.state()); }
  }

  // ── presenter mode (Q-90): mute, hold per beat, remote keys, blank ──────

  /** Next in presenter mode: finish the beat (cues fired) and go on, end a
   *  wait, or (a question waiting) nothing from a key; a strip press then
   *  skips as the lesson's own Next does. */
  _narrNext(fromKey) {
    const r = this._narr?.presenterNext();
    if (r === 'navigate') this._handleAdvanceOrNextLesson();
    else if (r === 'none' && !fromKey) this._handleNext();
  }

  /** Previous in presenter mode: restart the beat past 1.5 s, else the beat before. */
  _narrPrev() {
    const r = this._narr?.presenterPrev({ canBack: !!this._stepState?.canGoBack });
    if (r === 'navigate') this._handleRetreatOrPrevLesson();
  }

  _narrMute() {
    const p = this._narr;
    if (!p) return;
    p.setMuted(!p.muted);
    setFlag(MUTED_KEY, p.muted, 'session');
    A11yAnnouncer.announce(p.muted ? 'Narration muted' : 'Narration sound on');
  }

  _narrPresenter() {
    const p = this._narr;
    if (!p) return;
    p.setPresenter(!p.presenter);
    setFlag(presenterKey(this.profileId), p.presenter);
    A11yAnnouncer.announce(p.presenter ? 'Presenter mode on: the narration stops after each beat' : 'Presenter mode off');
  }

  _narrCaptions() {
    this._narrCapOff = !this._narrCapOff;
    setFlag(captionsOffKey(this.profileId), this._narrCapOff);
    A11yAnnouncer.announce(this._narrCapOff ? 'Captions off' : 'Captions on');
  }

  /** B or period (a remote's blank key): pause and cover the screen; any key or tap returns. */
  _setNarrBlank(on) {
    on = !!on;
    if (on === !!this._narrBlank) return;
    if (on) this._narr?.pause();
    this._narrBlank = on;
  }

  /** Does a control on this key's path own the arrow (and page) keys? A slider,
   *  a spin box, a list, a radio group, a tab list, a grid or a menu does. */
  _arrowOwned(e) {
    for (const node of e.composedPath()) {
      if (node === this || node === window || node === document) break;
      if (!(node instanceof Element)) continue;
      if (node.matches('input, select, textarea, [contenteditable=""], [contenteditable="true"], [role="slider"], [role="spinbutton"], [role="listbox"], [role="radiogroup"], [role="tablist"], [role="grid"], [role="tree"], [role="menu"], [role="menubar"], [role="scrollbar"]')) return true;
    }
    return false;
  }

  /**
   * Narrated keys (Q-90), presentation remotes included (clickers send
   * PageDown/PageUp or the arrows, B or period to blank, F5 to present).
   * Returns true when the key was handled here.
   */
  _narrKey(e) {
    const p = this._narr;
    const k = e.key;
    const pres = !!p.presenter;
    if (k === 'F5') {
      e.preventDefault();
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()?.catch?.(() => {});
      return true;
    }
    if (e.shiftKey && k !== '?') return false;
    const next = k === 'PageDown' || k === 'ArrowRight' || (pres && k === 'ArrowDown');
    const prev = k === 'PageUp' || k === 'ArrowLeft' || (pres && k === 'ArrowUp');
    if (next || prev) {
      if (this._arrowOwned(e)) return true; // the control keeps its keys
      e.preventDefault();
      if (pres) { if (next) this._narrNext(true); else this._narrPrev(); }
      else if (next) this._handleAdvanceOrNextLesson();
      else this._handleRetreatOrPrevLesson();
      return true;
    }
    if (k === 'm' || k === 'M') { e.preventDefault(); this._narrMute(); return true; }
    if (k === 'b' || k === 'B' || k === '.') { e.preventDefault(); this._setNarrBlank(true); return true; }
    if (pres && (k === 'c' || k === 'C')) { e.preventDefault(); this._narrCaptions(); return true; }
    if (k === '?') { e.preventDefault(); this._narrHelp = !this._narrHelp; return true; }
    if (k === 'Escape' && this._narrHelp) { this._narrHelp = false; return true; }
    return false;
  }

  /**
   * Calm (spec W1 D29n, page furniture): the narration plays and the learner
   * only listens, so the page around the slide steps back: the app header and
   * the lesson head fade (AppShell, here), the block's figure caption and
   * scene tool buttons fade (content-block). Opacity only, so nothing moves;
   * any pointer, key or touch, a pause or a wait brings it all back
   * (<narration-strip> idle). Never in text mode.
   */
  _setNarrCalm(on) {
    on = !!on && !!this._narrOn;
    if (on === !!this._narrCalm) return;
    this._narrCalm = on;
    this.toggleAttribute('narr-calm', on);
    this._engine?.setNarrationCalm?.(on);
    EventBus.emit('lesson:header-nav', { calm: on });
  }

  /**
   * Reading one phrase at a time (spec W1 D29n): while the narration plays and
   * "Full text" is off, a text slide holds its prose back and the caption
   * shows the phrase being spoken where the beat is. Pause, a wait, "Full
   * text" or "Read instead" bring the prose back (content-block).
   */
  _applyNarrReading(st) {
    // A presenter hold (Q-90) reads like playing: the prose stays back.
    const on = !!(st?.narrated && !st.ended && st.playing && (!st.waiting || st.waiting === 'beat') && !this._narrFull);
    if (on === !!this._narrReading) return;
    this._narrReading = on;
    this._engine?.setNarrationReading?.(on);
  }

  /** Prompt hold (Q-77): the bar's own Check waits with the card it belongs to. */
  _applyNarrHold(st) {
    this.toggleAttribute('narr-hold', st?.prompt === 'held');
  }

  /** The learner picked another narrator voice (Q-43): kept on the device, said aloud for a screen reader. */
  _setNarrationVoice(id) {
    const p = this._narr;
    if (!p || !p.setVoice(id)) return;
    setVoicePref(id);
    if (p.narrated) EventBus.emit('narration:wanted', { lessonId: this._engine?.lessonId, profileId: this.profileId });
    const v = p.voices.find((x) => x.id === id);
    A11yAnnouncer.announce(`Narrator voice: ${v?.label || id}`);
  }

  /** Narrated: a tap on the stage that no control or scene claims plays/pauses. */
  _onStageClick(e) {
    if (!this._narrOn || !this._narr) return;
    for (const node of e.composedPath()) {
      if (node === e.currentTarget) break;
      if (!(node instanceof Element)) continue;
      if (node.matches('button, a[href], input, select, textarea, label, summary, [role="button"], [role="slider"], [role="radio"], [role="checkbox"], [role="option"], [tabindex], [contenteditable], [draggable="true"]')) return;
      const cs = getComputedStyle(node);
      if (cs.touchAction === 'none' || cs.touchAction === 'pan-y' || cs.cursor === 'pointer' || cs.cursor === 'grab') return;
    }
    this._narr.toggle();
  }

  _renderNarrateBtn(cls = '') {
    if (!this._narrAvail) return '';
    return html`<button class="narr-toggle ${cls}" @click="${this._toggleNarration}" aria-pressed="false"
      aria-label="Narrate this lesson" title="Narrate this lesson">${ICON_NARRATE}<span class="nav-label">Narrate</span></button>`;
  }

  /** Where captions may go: the block's own narrationStage(), else (a
   *  question) just the block's box, so captions can keep off its options. */
  _narrStageInfo(seg) {
    const el = this._engine?._mountedEl;
    if (!el) return null;
    const own = el.narrationStage?.(seg);
    if (own) return own;
    const r = el.getBoundingClientRect();
    return r.height > 0 ? { kind: 'block', stage: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } } : null;
  }

  /** Narrated: the bottom bar is the narration strip (plus Check on a question). */
  _renderNarrBar(canCheck, panelCheck) {
    return html`
      <div class="action-bar narr-bar" role="region" aria-label="Narration">
        <div class="action-bar-inner narr-inner">
          <narration-strip .pacer=${this._narr} .canBack=${!!this._stepState?.canGoBack} data-look=${this.look || 'quill'}
            .capOff=${!!this._narrCapOff} .helpOpen=${!!this._narrHelp}
            @narration-action=${(e) => this._onNarrationAction(e)}
            @narration-calm=${(e) => this._setNarrCalm(e.detail?.calm)}></narration-strip>
          ${canCheck && !panelCheck ? html`<button class="btn-3d btn-success nav-check narr-check" @click="${this._handleCheck}">Check answer</button>` : ''}
        </div>
      </div>
    `;
  }

  _handleAutoplayToggle() {
    if (!this._engine) return;
    const on = this._engine.setAutoplay(!this._engine.isAutoplaying());
    this._autoplay = on;
    try { localStorage.setItem(this._autoplayKey, on ? '1' : '0'); } catch { /* non-fatal */ }
  }

  /**
   * Progress in words. `aria-valuenow` stays the block number; the beat within
   * it is only ever said out loud, never encoded as a fraction of the bar.
   */
  /** A lesson opened outside its module (a preview) has no index; its file
   *  name usually carries one ("les-01.json", "L03-..."). 0 when it does not. */
  _lessonNumberFromId() {
    const m = /(\d+)[^\d/]*\.json$/i.exec(String(this.lessonId || '')) || /[^\d](\d{1,3})(?:[^\d/]*)$/.exec(String(this.lessonId || ''));
    const n = m ? parseInt(m[1], 10) : 0;
    return n > 0 && n < 1000 ? n : 0;
  }

  /** The plain look's slide head (look pack plain SPEC sec 2, the
   *  2026-11-05 prototype): a large serif step numeral in the signature
   *  colour, a small-caps eyebrow (lesson number and short title), the
   *  slide's title (it states the point), an optional deck line (the block's
   *  own `deck`), and the step count at the right. It sits in the sticky
   *  header, so the stage budget (--lesson-sticky-header-h) already counts
   *  it. On a phone the slide keeps its own title (content-block@1, same
   *  600px rule) and the head shows the lesson's. */
  /** Keeps this lesson's offline status (per-slide marks, head chip) current. */
  _watchOffline() {
    if (this._offLessonId === this.lessonId) return;
    this._unwatchOffline?.();
    this._offLessonId = this.lessonId;
    this._offStatus = OfflineAvailability.get(this.lessonId);
    this._unwatchOffline = OfflineAvailability.watch([this.lessonId], { profileId: this.profileId });
  }

  /** Per-slide offline flags for the progress bar, only while some slide still needs the network. */
  _offSlides() {
    const st = this._offStatus;
    if (!st || st.state === 'unknown' || st.state === 'ready' || !Array.isArray(st.slides)) return null;
    return st.slides.length === this._totalBlocks ? st.slides : null;
  }

  /** The head's offline chip: saved, partly saved, or (offline) what is here. */
  _renderOfflineChip() {
    const st = this._offStatus;
    if (!st || st.state === 'unknown' || st.state === 'none') return '';
    if (st.state === 'ready') {
      return html`<span class="off-chip ready" title="Every slide of this lesson is saved on this device">${iconOfflineReady}<span>Saved for offline</span></span>`;
    }
    if (!st.total) return '';
    if (!this._online) {
      return html`<span class="off-chip away" title="Dashed slides need the internet">${iconCloudOff}<span>Offline &middot; ${st.ready} of ${st.total} slides here</span></span>`;
    }
    return html`<span class="off-chip part" title="Dashed slides are not saved on this device yet">${iconOfflineReady}<span>${st.ready} of ${st.total} slides saved</span></span>`;
  }

  _renderPlainHead(linear) {
    const n = this._lessonNumber || this._lessonNumberFromId();
    const short = (this._lessonTitle.split(/:\s/)[0] || this._lessonTitle).trim();
    // The slide's own title is dropped from its body under plain (content-block
    // _beatMarkdown), so it is the head's title on every width; a phone keeps
    // the eyebrow to the lesson number.
    const slide = this._slideTitle;
    const title = slide || this._lessonTitle;
    // Narrated (D15, Q-17): the head drops the slide title and deck and keeps
    // one slim line of the same height on every slide, so nothing below it
    // moves while the narration runs. The title shows as the fading overlay
    // instead, and a text slide keeps its own heading (content-block
    // _beatMarkdown). Read mode is unchanged.
    const narr = !!this._narrOn;
    const eyebrow = [n ? `Lesson ${n}` : this._moduleTitle, (slide || narr) && !this._narrow ? short : ''].filter(Boolean).join(' \u00b7 ');
    const num = String(this._currentBlockIndex).padStart(2, '0');
    const deck = slide && !this._narrow && !narr ? this._slideDeck : '';
    return html`
      <div class="plain-head ${narr ? 'narr' : ''}">
        ${linear ? html`<div class="ph-num" aria-hidden="true">${num}</div>` : ''}
        <div class="ph-text">
          ${eyebrow ? html`<div class="ph-eyebrow">${eyebrow}</div>` : ''}
          ${narr ? html`<h1 class="sr-only">${title}</h1>` : html`<h1>${title}</h1>`}
          ${deck ? html`<p class="ph-deck">${deck}</p>` : ''}
        </div>
        ${linear ? html`
          <div class="ph-count" aria-label="Slide ${this._currentBlockIndex} of ${this._totalBlocks}">
            <span aria-hidden="true">${this._narrow ? `${this._currentBlockIndex} / ${this._totalBlocks}` : `Step ${this._currentBlockIndex} of ${this._totalBlocks}`}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  _progressText() {
    const base = `${Math.max(0, Math.round(this._currentBlockIndex))} out of ${Math.max(1, Math.round(this._totalBlocks))}`;
    const { step, steps } = this._stepState || {};
    if (!steps || steps <= 1) return base;
    return `${base}, part ${step + 1} of ${steps}`;
  }

  _canCheck() {
    if (!this._engine || !this._engine._mountedEl) return false;
    const el = this._engine._mountedEl;
    if (el.hideCheckButton) return false;
    if (el.tagName && el.tagName.toLowerCase().includes('semantic-desc')) return false;
    if (typeof el.evaluate !== 'function') return false;
    return !el._revealed && !el._isRevealed;
  }

  async _handleCheck() {
    if (this._engine && this._engine._mountedEl && typeof this._engine._mountedEl.evaluate === 'function') {
      // `await` on an already-resolved (non-Promise) value is a no-op —
      // safe for every existing plugin's synchronous evaluate(); only a
      // plugin whose scoring genuinely needs to await something (e.g.
      // plot-function@1's worker-sandboxed formula evaluation) actually
      // benefits from this.
      const result = await this._engine._mountedEl.evaluate();
      this.requestUpdate();

      // Grading is the ONLY place correctness is known: `interaction:question`
      // fires on selection and carries no verdict. Broadcasting it here (and the
      // cues below) is what lets the look's reactor and GamificationService
      // (XP on a first correct) react without reaching into a plugin's shadow
      // root (invariant 4).
      if (result && result.isCorrect) this._sessionRight = (this._sessionRight || 0) + 1;
      else this._sessionWrong = (this._sessionWrong || 0) + 1;

      EventBus.emit('question:graded', {
        questionId: this._engine?._mountedEl?._data?.id ?? null,
        // A question's own `id` is only unique within its own course bundle
        // (nothing namespaces it across bundles — see TestEngine.js's
        // _computeResults() doc comment) — `lessonId` (the full bundle-
        // qualified content path this question was loaded from) is what
        // lets GamificationService's dedup key actually distinguish two
        // different questions that happen to share a bare id.
        lessonId: this.lessonId,
        correct: !!(result && result.isCorrect),
        score: typeof result?.score === 'number' ? result.score : undefined,
      });

      // What happened, for the look to answer (src/core/cues.js): right, a
      // first miss, or another miss in a row on the same question.
      const data = this._engine?._mountedEl?._data;
      const questionId = data?.id ?? null;
      const graded = this._misses.grade(`${this.lessonId || ''}:${questionId || '_'}`, !!(result && result.isCorrect));
      this._rightRun = result && result.isCorrect ? (this._rightRun || 0) + 1 : 0;
      const host = this._engine?._mountedEl || null;
      emitCue(graded.cue, {
        questionId,
        lessonId: this.lessonId,
        questionType: data?.type ?? null,
        misses: graded.misses,
        run: this._rightRun,
        host,
        companion: this.shadowRoot?.querySelector('companion-slot[kind="coach"]')?.companion || null,
      });
      if (this._rightRun && this._rightRun % 3 === 0) emitCue(CUES.STREAK, { count: this._rightRun, host });
    }
  }

  /**
   * Voice per the sprint's register: name what actually happened, and treat
   * wrong answers as part of it rather than something to gloss over.
   */
  _completeBlurb() {
    const w = this._sessionWrong || 0;
    const r = this._sessionRight || 0;
    if (!r && !w) return brandCopy('completeEmpty', 'You have reached the end of this lesson.');
    if (!w) return brandCopy('completeClean', '{right} correct, none incorrect.', { right: r });
    return brandCopy('completeMixed', '{right} correct, {wrong} incorrect.', { right: r, wrong: w, wrongTimes: `${w} time${w === 1 ? '' : 's'}` });
  }

  _tallyRows() {
    const rows = [{ label: 'Lesson finished', xp: 20 }];
    if (this._sessionRight) rows.push({ label: `${this._sessionRight} answered right`, xp: this._sessionRight * 5 });
    return rows;
  }

  _handleStartNext() {
    if (this._nextLessonRef) {
      const cleanRef = this._nextLessonRef.replace(/^\//, '');
      const modQuery = this.moduleId ? `?module=${encodeURIComponent(this.moduleId)}` : '';
      window.location.hash = `#/lesson/${cleanRef}${modQuery}`;
    }
  }

  _handleStartPrev() {
    if (this._prevLessonRef) {
      // Consumed by _initEngine() on the other side of this navigation — see
      // its own comment. AppShell/lit-html reuse this same <lesson-session>
      // element across a lesson-to-lesson hash change (same tag at the same
      // template position, only the bound properties change), so a plain
      // instance field survives from here to there.
      this._pendingStartAtEnd = true;
      const cleanRef = this._prevLessonRef.replace(/^\//, '');
      const modQuery = this.moduleId ? `?module=${encodeURIComponent(this.moduleId)}` : '';
      window.location.hash = `#/lesson/${cleanRef}${modQuery}`;
    }
  }

  _handleBackToModule() {
    if (this.moduleId) {
      window.location.hash = `#/module/${this.moduleId.replace(/^\//, '')}`;
    }
  }

  _handleFinish() {
    window.location.hash = '#/'; // Go back home
  }

  /** Is the engine on the last beat of the last slide (Next finishes)? */
  _isLastStop() {
    return this._stepState?.done && this._currentBlockIndex >= this._totalBlocks
      && Number.isFinite(this._totalBlocks);
  }

  /**
   * The bottom action bar (prototype A's .actionbar): Previous, a keyboard
   * hint, and one primary slot. Check Answer shares the bar instead of a
   * separate sticky strip, so a question slide never stacks two bottom bars.
   * Back/Autoplay stay in AppShell's header. Hidden in short landscape, where
   * .compact-controls takes over.
   */
  _renderActionBar() {
    const canCheck = this._canCheck();
    // plain: a question class with PLAIN_PANEL draws its own Check in its
    // answer panel (core/components/answerPanel.js), so the bar drops its own.
    const panelCheck = this._offerPanelCheck() && canCheck;
    const last = this._isLastStop();
    if (this._narrOn && this._narr) return this._renderNarrBar(canCheck, panelCheck);
    if (this.isStoryMode) return this._renderTurnNav(canCheck, last);
    return html`
      <div class="action-bar" role="toolbar" aria-label="Lesson navigation">
        ${this.look === 'plain' ? this._renderFooterProgress() : ''}
        <div class="action-bar-inner">
          <button
            class="btn-3d btn-secondary nav-prev"
            @click="${this._handlePrev}"
            ?disabled="${!this._stepState?.canGoBack}"
            aria-label="Previous"
          >${iconArrowLeft}<span class="nav-label">Previous</span></button>
          ${this._renderFlagBtn()}
          ${this._renderNarrateBtn()}
          <p class="kbd-hint"><kbd>&larr;</kbd> <kbd>&rarr;</kbd> arrow keys step through the beats</p>
          ${canCheck && !panelCheck ? html`
            <button class="btn-3d btn-success btn-lg nav-check" @click="${this._handleCheck}">Check answer</button>
          ` : ''}
          <button
            class="btn-3d ${canCheck ? 'btn-secondary' : (last ? 'btn-success' : 'btn-primary')} btn-lg nav-next"
            @click="${this._handleNext}"
            ?disabled="${this._stepState?.canGoForward === false}"
            aria-label="${last ? 'Finish lesson' : 'Next'}"
          >${last
            ? html`<span class="nav-label">Finish lesson</span>${this.look === 'plain' ? iconCheck : iconStar(true)}`
            : html`<span class="nav-label">${canCheck ? 'Skip' : 'Next'}</span><span class="arrow">${iconArrowRight}</span>`}</button>
        </div>
      </div>
    `;
  }

  /** plain only: hands the mounted question its in-panel Check (it renders
   *  the editorial prompt + answer panel spread once panelCheck is set). */
  _offerPanelCheck() {
    if (this.look !== 'plain') return false;
    const el = this._engine?._mountedEl;
    if (!el?.constructor?.PLAIN_PANEL) return false;
    if (!el.panelCheck) el.panelCheck = true;
    return true;
  }

  /** Plain: the segmented slim progress bar sits above Previous/Next. */
  _renderFooterProgress() {
    const linear = Number.isFinite(this._totalBlocks) && this._totalBlocks > 0;
    return html`
      <div class="action-bar-progress">
        <progress-bar
          variant="${linear ? 'blocks' : 'bar'}"
          .current="${this._currentBlockIndex}"
          .total="${this._totalBlocks}"
          .offline="${this._offSlides()}"
          .step="${this._stepState?.step ?? 0}"
          .steps="${this._stepState?.steps ?? 1}"
          .valueText="${this._progressText()}"
          label="Lesson Progress"
        ></progress-bar>
      </div>
    `;
  }

  /**
   * Story's navigation (prototype v2 b/ .turn-nav): round ink buttons and a
   * "beat n / m" pill, an OVERLAY fixed to the viewport. Owner correction
   * 2026-10-06: it must never move with the page (a beat change, opening
   * "the story so far"). position:fixed alone is not enough: any transformed,
   * perspective, filter or contain ancestor becomes its containing block, so
   * this is rendered as a sibling of the content, and the page flip
   * (_flipPage) only ever transforms #block-container, never an ancestor.
   * Same measured --lesson-chrome-bottom as Classic's bar.
   */
  _renderTurnNav(canCheck, last) {
    const { step = 0, steps = 1 } = this._stepState || {};
    return html`
      <p class="turn-hint" aria-hidden="true"><kbd>&larr;</kbd> <kbd>&rarr;</kbd> turn the page</p>
      <div class="action-bar turn-nav" role="toolbar" aria-label="Lesson navigation">
        ${steps > 1 ? html`<span class="beat-count">beat ${step + 1} / ${steps}</span>` : ''}
        ${this._renderFlagBtn('flag-round')}
        ${this._renderNarrateBtn('round')}
        ${canCheck ? html`
          <button class="inkbtn check" @click="${this._handleCheck}">Check answer</button>
        ` : ''}
        <button
          class="roundbtn"
          @click="${this._handlePrev}"
          ?disabled="${!this._stepState?.canGoBack}"
          aria-label="Previous"
        >${iconArrowLeft}</button>
        <button
          class="roundbtn next ${last ? 'finish' : ''}"
          @click="${this._handleNext}"
          ?disabled="${this._stepState?.canGoForward === false}"
          aria-label="${last ? 'Finish lesson' : canCheck ? 'Skip' : 'Next'}"
        >${last ? (this.gamified ? iconStar(true) : iconCheck) : iconArrowRight}</button>
      </div>
    `;
  }

  /**
   * Lesson complete for a look with no companion: what was done and what
   * comes next, instead of a heading alone at the top of an empty page. The
   * empty slot stays, as _cueComplete() finds the screen by it.
   */
  _renderSummary() {
    const r = this._sessionRight || 0;
    const w = this._sessionWrong || 0;
    const slides = Number.isFinite(this._totalBlocks) ? this._totalBlocks : 0;
    const facts = [];
    if (slides) facts.push(['Slides', slides]);
    if (r + w) facts.push(['Answers checked', r + w], ['Correct', r], ['Incorrect', w]);
    return html`
      <div class="content-area complete calm">
        <companion-slot size="hero"></companion-slot>
        <div>
          ${this._moduleTitle ? html`
            <p class="calm-kicker">${this._moduleTitle}${this._lessonNumber ? html` &middot; Lesson ${this._lessonNumber}` : ''}</p>
          ` : ''}
          <h2>${this.look === 'plain' ? html`<span class="calm-tick" aria-hidden="true">${iconCheck}</span>` : ''}Lesson complete</h2>
          ${this._lessonTitle ? html`<p class="calm-title">${this._lessonTitle}</p>` : ''}
        </div>
        ${facts.length ? html`
          <dl class="calm-facts">
            ${facts.map(([label, value]) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`)}
          </dl>
        ` : ''}
        ${r + w ? '' : html`<p class="sub">${this._completeBlurb()}</p>`}
        ${this.gamified ? html`
          <div class="tally">
            ${this._tallyRows().map((row, i) => html`
              <div class="tally-row" style="animation-delay: ${180 + i * 220}ms">
                <span>${row.label}</span><b>+${row.xp} XP</b>
              </div>
            `)}
          </div>
        ` : ''}
        ${this._nextLessonRef ? html`
          <div class="calm-next">
            <h3>Next lesson</h3>
            <p>${this._nextLessonTitle}</p>
          </div>
        ` : ''}
        <div class="complete-actions">
          ${this._nextLessonRef ? html`
            <button class="btn-3d btn-primary" @click="${this._handleStartNext}">Start next lesson</button>
          ` : ''}
          ${this.moduleId ? html`
            <button class="btn-3d btn-secondary" @click="${this._handleBackToModule}">${brandCopy('backToCourse', 'Back to the course')}</button>
          ` : html`
            <button class="btn-3d btn-secondary" @click="${this._handleFinish}">Back to home</button>
          `}
        </div>
      </div>
    `;
  }

  render() {
    if (this._needsUpdate) return html`<needs-update-notice></needs-update-notice>`;
    if (this._error) {
      return html`<div>Error loading lesson: ${this._error}</div>`;
    }

    if (this._isComplete) {
      if (!hasBrandPiece('companion')) return this._renderSummary();
      return html`
        <div class="content-area complete">
          <companion-slot size="hero"></companion-slot>
          <h2>Lesson complete</h2>
          <p class="sub">${this._completeBlurb()}</p>

          ${this.gamified ? html`
            <div class="tally">
              ${this._tallyRows().map((r, i) => html`
                <div class="tally-row" style="animation-delay: ${180 + i * 220}ms">
                  <span>${r.label}</span><b>+${r.xp} XP</b>
                </div>
              `)}
            </div>
          ` : ''}

          <div class="complete-actions">
            ${this._nextLessonRef ? html`
              <button class="btn-3d btn-primary" @click="${this._handleStartNext}">
                Next: ${this._nextLessonTitle}
              </button>
            ` : ''}
            ${this.moduleId ? html`
              <button class="btn-3d btn-secondary" @click="${this._handleBackToModule}">${brandCopy('backToCourse', 'Back to the course')}</button>
            ` : html`
              <button class="btn-3d btn-secondary" @click="${this._handleFinish}">Back to home</button>
            `}
          </div>
        </div>
            `;
    }

    const linear = Number.isFinite(this._totalBlocks) && this._totalBlocks > 0;
    const plainHead = this.look === 'plain' && !this.isStoryMode;
    return html`
      ${this._lessonTitle && !plainHead ? html`
        <div class="lesson-head">
          <div class="lesson-head-text">
            ${this.isStoryMode ? html`
              <div class="crumb">${this._moduleTitle || this._lessonTitle}${linear ? html` &middot; Scene ${this._currentBlockIndex} of ${this._totalBlocks}` : ''}</div>
            ` : this._moduleTitle ? html`
              <div class="crumb">${this._moduleTitle}${this._lessonNumber ? html` &middot; Lesson ${this._lessonNumber}` : ''}</div>
            ` : ''}
            <h1>${this._lessonTitle}</h1>
          </div>
          ${linear && !this.isStoryMode ? html`
            <div class="lesson-head-meta">${this._renderOfflineChip()}${this.look === 'plain'
              ? html`<span class="folio"><b>${this._currentBlockIndex}</b>of ${this._totalBlocks}</span>`
              : html`Slide ${this._currentBlockIndex} of ${this._totalBlocks}`}</div>
          ` : html`<div class="lesson-head-meta">${this._renderOfflineChip()}</div>`}
        </div>
      ` : ''}
      <header class="sticky-header full-header ${plainHead ? 'plain-sticky' : ''}">
        ${plainHead && this._lessonTitle ? this._renderPlainHead(linear) : ''}
        ${plainHead ? '' : html`<progress-bar
          variant="${!linear ? 'bar' : this.isStoryMode ? 'trail' : 'blocks'}"
          .current="${this._currentBlockIndex}"
          .total="${this._totalBlocks}"
          .offline="${this._offSlides()}"
          .step="${this._stepState?.step ?? 0}"
          .steps="${this._stepState?.steps ?? 1}"
          .valueText="${this._progressText()}"
          label="Lesson Progress"
        ></progress-bar>`}
      </header>

      <!-- Mobile-landscape compact variant of the header above — see the
           short-landscape media query in static styles. Both variants stay
           in the DOM; CSS display:none genuinely removes the hidden one from
           both the tab order and the accessibility tree, so there's no
           double-announcement or double-tab-stop risk from rendering both. -->
      <div class="compact-topbar">
        <progress-bar
          compact
          .current="${this._currentBlockIndex}"
          .total="${this._totalBlocks}"
          .offline="${this._offSlides()}"
          .valueText="${this._progressText()}"
          label="Lesson Progress"
        ></progress-bar>
      </div>
      <div class="compact-controls" role="toolbar" aria-label="Lesson controls">
        ${this.moduleId ? html`
          <button class="icon-btn" @click="${this._handleBackToModule}" aria-label="Back to module" title="Back to module">${ICON_BACK}</button>
        ` : ''}
        <!-- AppShell's own header (with its separate Home link) is hidden
             entirely in this mode (see AppShell.js's short-landscape rule on
             [data-lesson-nav]) — this is the only way back to the app's
             dashboard while it's gone, so it renders unconditionally rather
             than only when there's no moduleId to fall back to. -->
        <button class="icon-btn" @click="${this._handleFinish}" aria-label="Home" title="Home">${ICON_HOME}</button>
        ${this._narrOn ? '' : html`<button
          class="icon-btn"
          @click="${this._handleAutoplayToggle}"
          aria-pressed="${this._autoplay ? 'true' : 'false'}"
          aria-label="Autoplay"
          title="Advance each beat on a timer"
        >${iconAutoplay(this._autoplay)}</button>`}
        ${this._narrOn ? '' : html`<button
          class="icon-btn"
          @click="${this._handlePrev}"
          ?disabled="${!this._stepState?.canGoBack}"
          aria-label="Previous"
          title="Previous"
        >${ICON_PREV}</button>
        <button
          class="icon-btn"
          @click="${this._handleNext}"
          ?disabled="${this._stepState?.canGoForward === false}"
          aria-label="Next"
          title="Next"
        >${ICON_NEXT}</button>`}
        <button class="icon-btn" @click="${this._handleFlag}" aria-label="${tr('feedback.flag_label', 'Flag this slide')}" title="${tr('feedback.flag_label', 'Flag this slide')}">${iconFlag}</button>
        ${this._narrAvail && !this._narrOn ? html`<button class="icon-btn" @click="${this._toggleNarration}" aria-pressed="${this._narrOn ? 'true' : 'false'}"
          aria-label="${this._narrOn ? 'Read instead' : 'Narrate this lesson'}" title="${this._narrOn ? 'Read instead' : 'Narrate this lesson'}">${ICON_NARRATE}</button>` : ''}
      </div>

      <!-- No aria-live here. The engine announces block changes and revealed
           beats explicitly through A11yAnnouncer; a live region over the whole
           container on top of that made every navigation speak twice, once as
           the announcement and once as the entire re-rendered block. -->
      <main class="content-area" id="block-container" @click=${(e) => this._onStageClick(e)}
        @scene-interact-done=${() => this._narr?.interactDone()}>
        <!-- Engine mounts plugins here -->
      </main>

      <companion-slot kind="coach"></companion-slot>
      <companion-slot kind="math-coach"></companion-slot>
      ${this._narrOn && this._narr ? html`<narration-captions .pacer=${this._narr} data-look=${this.look || 'quill'}
        .stageInfo=${(seg) => this._narrStageInfo(seg)} .slideTitle=${this._narrTitle || ''} .titleKey=${this._narrTitleKey || 0} .fullText=${!!this._narrFull}
        .capOff=${!!(this._narrCapOff && this._narr.presenter)}
        @narration-action=${(e) => this._onNarrationAction(e)}></narration-captions>` : ''}
      ${this._narrBlank && this._narrOn ? html`<div class="narr-blank" role="button" tabindex="0" aria-label="Screen blanked, narration paused. Press any key or tap to return."
        @click=${() => this._setNarrBlank(false)}><span>Paused. Press any key to return.</span></div>` : ''}
      ${this._renderActionBar()}
    `;
  }
}

customElements.define('lesson-session', LessonSession);
