import { LitElement, html, css } from 'lit';
import '../../../ui/components/MarkdownRenderer.js';
import { SimulationLoader } from '../../../core/SimulationLoader.js';
import { renderExtendedControl } from '../../../core/components/simulationHost.js';
import { controlCurrent, optValue, optLabel } from '../../../simulations/base/SimControls.js';
import { CourseSourceManager } from '../../../core/CourseSourceManager.js';
import { GlossaryService } from '../../../core/GlossaryService.js';
import { CollectionService } from '../../../core/CollectionService.js';
import {
  blockImageLayoutStyles, blockImageFocusStyles,
  renderBlockImage, renderBlockImageViewport, blockLayoutClass,
  probeImageDimensions, resolveImageLayout, resolveSimLayout,
} from '../../../core/components/blockImageLayout.js';
import { splitSteps } from '../../../core/markdown/splitSteps.js';
import { remapRectForCover } from '../../../core/focusRect.js';
import { captureRect, playFlip } from '../../../core/flipAnimate.js';
import { ProgressiveDisclosureMixin, progressiveDisclosureStyles } from '../../../core/mixins/ProgressiveDisclosureMixin.js';
import { LessonModeMixin } from '../../../core/mixins/LessonModeMixin.js';
import { PhotoDiagram } from '../../../core/components/PhotoDiagram.js';
import { mountPhotoDiagram } from '../../../core/components/photoDiagramHost.js';
import { mountStepGraph, mountStepDiagram } from '../../../core/components/stepFigureHost.js';
import { mountFigure } from '../../../core/components/figureHost.js';
import { mountRenderer, rendererAspect } from '../../../core/components/rendererHost.js';
import { figureAspect } from '../../../core/components/FigureLayouts.js';
import { StoryTheatre } from '../../../core/components/diorama/StoryTheatre.js';
import { theatreStyles } from '../../../core/components/diorama/theatreStyles.js';
import { PHONE_STAGE_MIN_ASPECT } from '../../../core/components/diorama/theatreLayout.js';
import { CUES, emitCue } from '../../../core/cues.js';
import { answerStageQueries } from '../../../core/components/stageAnswer.js';
import { brandCopy } from '../../../ui/components/LookSlots.js';
import { LookManager } from '../../../core/LookManager.js';
import { parseSay } from '../../../core/cast/castData.js';
import { LookMixin } from '../../../core/mixins/LookMixin.js';
import { leadingHeading, stripLeadingHeading } from '../../../core/markdown/slideTitle.js';
import { plainLookStyles } from './plainLook.js';

/**
 * A basic content block that renders markdown payload data.
 * Supports an optional `image` field: { src, alt, caption, position? }
 * Supports an optional `simulation` field: { src, position? } — `src` is a
 * bundle-relative (or root-absolute, for an engine-bundled generic scene)
 * path to the scene's own .js module, resolved the same way `image.src` is.
 * position: "right" (default) | "left" | "above" | "below"
 * Optional top-level `mediaStep` (0-indexed int, mirrors `poeRecapStep`
 * below): delays the image/simulation's first appearance until that beat,
 * rendering as if there were no media at all before it. Omitted/0 keeps
 * today's default of visible from the first beat. See `isStepRevealed()`
 * (`ProgressiveDisclosureMixin.js`).
 *
 * Optional top-level `simulationStep` (0-indexed int, same "sticky from
 * this beat on" convention as `mediaStep`): only meaningful when a block has
 * BOTH `image` and `simulation` — the image shows until this beat, then the
 * simulation takes over for the rest of the slide. Set it to the index of
 * the last beat to keep a static diagram up while the explanation builds,
 * then hand off to the live simulation only once the student reaches the
 * "try it yourself" beat. Omitted keeps today's default: with both fields
 * present, the image wins throughout and the simulation is never shown.
 *
 * ## Progressive disclosure
 *
 * The markdown is revealed one beat at a time rather than all at once, so a
 * student clicking Next takes part in the argument instead of being handed its
 * conclusion (docs/sprints/wip/progressive-disclosure-lesson-slides.md). The
 * beats are *derived* from the markdown's own structure by `splitSteps()`, so
 * all 244 shipped blocks stage with nothing stored, nothing authored and no
 * schema change; an author who needs control writes `<!-- STEP -->` sentinels
 * into the markdown itself.
 *
 * The steps live inside this one mounted element rather than becoming separate
 * blocks. Exploding them would break `POEController.recall()`'s strict
 * `blockIndex - 1` adjacency, inflate the progress bar and the review queue,
 * and — decisively — `LessonEngine._render()` does `container.innerHTML = ''`
 * on every navigation, so an `<img>` could never persist across a beat, which
 * is the whole point of image focus.
 *
 * The contract `LessonEngine` drives this through is four synchronous methods:
 * `advanceStep()`, `retreatStep()`, `stepState()` and `revealAll()`. A plugin
 * that does not implement them (every question plugin, and `poe-predict@1`)
 * behaves exactly as it did before — the engine feature-detects.
 *
 * Optional `reveal` field on the block data:
 *
 *     "reveal": {
 *       "mode": "sequential",   // omit or "sequential" = staged; "off" = all at once
 *       "autoAdvanceMs": 6000,  // optional dwell, consulted only when autoplay is on
 *       "focus": { "<step id>": { x, y, w, h } },   // see blockImageLayout.js
 *       "focusSource": "derived",                   // "derived" | "author"
 *       "images": { "<step id>": { src, alt?, caption? } }   // per-beat image swap
 *     }
 *
 * `reveal.images` lets a beat show a *different* image than the block's own
 * `image`, rather than just a different focus crop of the same one — for a
 * slide whose beats each cover a genuinely separate diagram rather than
 * different regions of one combined figure. Keyed by step id, same
 * convention and same "only an authored split has stable ids" caveat as
 * `reveal.focus` (see `_renderImage()`'s doc comment below). A step without
 * an entry falls back to the block's own `image`; entries only need to carry
 * the fields that differ (`position` and anything else omitted is inherited
 * from `image`) — see `_activeImage()`. `reveal.focus[stepId]` still applies
 * on top of whichever image is active for that step, override or not.
 *
 * ## Color-coding math (`mathColors`)
 *
 * Optional top-level `mathColors`: `{ "<variable>": "<CSS color value>" }`,
 * e.g. `{ "b": "var(--sim-series-2)" }`. Threaded to every
 * `<markdown-renderer>` this block mounts (header and every beat — see
 * `ProgressiveDisclosureMixin._renderSteps()`), which wraps each matching
 * LaTeX token in `\textcolor{}{}` before rendering (`mathColorize.js`). One
 * map covers the whole block: a variable colored in beat 1 stays that color
 * in beat 4, letting an equation reuse the same color a diagram above it
 * already assigned to that symbol instead of dropping into plain text.
 * Values should always be a `var(--sim-*)` (or other real) token, never a
 * literal hex (invariant 9).
 *
 * ## The "result" callout (STEP sentinel's `callout` attribute)
 *
 * `<!-- STEP id="…" callout="result" line="…" -->` (see `splitSteps.js`)
 * marks the beat that follows as the slide's payoff: styled per
 * `.rv-callout-result` below (same box language as `.cb-poe-recap`,
 * generalized past POE) and, unlike an ordinary beat, never dims once
 * superseded. Pairs it with a small companion slot that reacts once, the
 * moment that beat becomes current — `line` is what he says (omit it for a
 * silent reaction). Only `callout="result"` has a defined treatment today.
 */

// Mid-beat cue timing floor (§12.4) — deliberately smaller than
// LessonEngine's ~350ms/word autoplay dwell estimate; this is a floor under
// a real scroll-reveal signal, not a substitute for it. Kept independent of
// LessonEngine's constant for now — see open item §9.9.
const CUE_MIN_DELAY_PER_WORD_MS = 180;
const CUE_MIN_DELAY_CAP_MS = 1200;

// _reserveControlsSpace()'s reserve for a scene's own CONTROLS bar, before
// _measureSimControls() has measured the bar's real height even once (this
// render's first paint only — see both methods' own doc comments for why a
// fixed guess can't work as anything more than that starting point). Sized
// for _renderSimulation()'s own compact control styling (one ~24px button
// row + its smaller padding/margin) — the narrow-panel case this fallback
// actually matters for is exactly the one compactControls also applies to.
const SIM_CONTROLS_RESERVE_PX = 45;

export class ContentBlock extends LookMixin(LessonModeMixin(ProgressiveDisclosureMixin(LitElement))) {
  /** Lesson prose gets Classic's word-by-word beat entrance (the mixin's
   *  other users, question stems, do not: a stem should read at once). */
  static REVEAL_WORDS = true;

  static styles = [blockImageLayoutStyles, blockImageFocusStyles, progressiveDisclosureStyles, css`
    :host {
      display: block;
      margin-bottom: 1.5rem;
    }

    /* ── Simulation wrapper (image layout/CSS lives in blockImageLayout.js,
       shared with poe-predict@1) ──────────────────────────────────────── */
    .cb-sim-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
    }

    /* Matches .cb-image-wrap's own side-by-side sizing exactly (see the
       comment on that rule in blockImageLayout.js) — a simulation panel is
       the same kind of media-alongside-text layout as an image, and there's
       no reason it should get a smaller, fixed 50% share while the image
       gets a growable 55-60%. Most shipped simulations render at a 900px
       internal canvas width, so 60% of the now-widened .content-area lands
       close to that native resolution rather than upscaling (blurry) or
       downscaling much further than necessary (small, hard-to-read labels —
       the original complaint here). */
    .cb-layout-right .cb-sim-wrap,
    .cb-layout-left  .cb-sim-wrap {
      flex: 1.5 1 55%;
      max-width: 60%;
      /* Side-by-side, the text column can run to many beats (progressive
         disclosure) and grow far taller than the viewport, while the row
         itself (align-items: flex-start) leaves the simulation pinned to the
         *top* of that row — so scrolling down to read a later beat scrolls
         the simulation straight off the top of the screen, defeating the
         point of a side-by-side layout. Sticky keeps it in the viewport as
         the student scrolls, the same way LessonSession's own sticky-header
         above it already does within this same scrollport; it only has room
         to move at all once the row is taller than the sticky box, so short
         slides are unaffected. Same header-height offset .rv-step's
         scroll-margin-top uses, so the panel settles just below the sticky
         header rather than under it. */
      position: sticky;
      top: calc(var(--lesson-sticky-header-h, 0px) + 12px);
    }

    /* Above/below: matches .cb-image-wrap's own cap (blockImageLayout.js) —
       without it, a simulation stretches to the full (much wider, since the
       progressive-disclosure sprint) lesson column while its canvas keeps a
       small fixed internal resolution, so it renders oversized and blurry.
       Every shipped simulation block uses position:"below", so this is the
       tier that actually matters in practice. */
    .cb-layout-above .cb-sim-wrap,
    .cb-layout-below .cb-sim-wrap {
      max-width: 820px;
      align-self: center;
      width: 100%;
    }

    /* graph / diagram companion: a card like the question companions, 4:3 for a graph */
    .cb-sim-wrap .cb-figure { padding: 12px 14px; background: var(--bg-surface); border: var(--rule-w) solid var(--border-color); border-radius: 16px; }
    .cb-figure #step-figure-host { width: 100%; aspect-ratio: 4 / 3; }
    .cb-figure svg { width: 100%; height: 100%; display: block; }
    /* figure field: the figure draws its own card (figureHost.js shadow root); the wrap only sizes it */
    .cb-sim-wrap.cb-figure-wrap { align-items: stretch; }
    .cb-figure-field { width: 100%; min-width: 0; }
    .cb-stage-caption.cb-figure-caption { font-size: max(13px, 0.86rem); line-height: 1.45; margin: 4px 2px 0; }
    /* The stage frame (prototype v2 a/ .stage): a 2px rule, the large radius
       and a soft lift. Drawn on the host itself, with no padding, so the
       frame costs the scene no layout budget beyond the rule. */
    .cb-sim-wrap .sim-host-container {
      width: 100%;
      height: auto;
      box-sizing: border-box;
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-lg);
      overflow: hidden;
      display: block;
      box-shadow: var(--card-shadow);
      background: var(--shell-bg);
      line-height: 0;
      position: relative;
    }

    /* Optional authored head strip and caption around the stage
       (simulation.title / simulation.caption). */
    .cb-stage-head {
      width: 100%;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      background: var(--stage-head-bg);
      border: var(--rule-w) solid var(--border-color);
      border-bottom: 0;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      margin-bottom: -0.4rem;
      font-family: var(--font-heading);
      font-weight: var(--fw-medium);
      font-size: 0.95rem;
      color: var(--stage-head-ink);
    }
    .cb-stage-head + .sim-host-container { border-top-left-radius: 0; border-top-right-radius: 0; }
    .cb-stage-kicker {
      font-family: var(--font-family);
      font-size: 0.64rem;
      font-weight: var(--fw-heavy);
      letter-spacing: 0.18em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--stage-head-ink) 18%, transparent);
    }
    /* Story's diorama: thicker ink and the big paper radius (prototype v2 b/). */
    :host([data-lesson-mode="story"]) .cb-sim-wrap .sim-host-container:not(.sim-host-container--frameless) {
      border-width: 3px;
      border-radius: 26px;
    }
    :host([data-lesson-mode="story"]) .cb-stage-head { border-width: 3px; border-radius: 26px 26px 0 0; }
    :host([data-lesson-mode="story"]) .cb-sim-wrap .cb-stage-head + .sim-host-container:not(.sim-host-container--frameless) {
      border-top-left-radius: 0;
      border-top-right-radius: 0;
    }
    .cb-stage-tag {
      margin-left: auto;
      font-family: var(--font-family);
      font-size: 0.68rem;
      font-weight: var(--fw-heavy);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .cb-sim-error { padding: 20px; color: var(--error-text); line-height: normal; }
    .cb-stage-caption {
      margin: 0;
      font-size: 0.8rem;
      font-style: italic;
      color: var(--text-muted);
      text-align: center;
    }
    .cb-sim-wrap .sim-host-container.sim-host-container--frameless {
      border: 0;
      border-radius: 0;
      box-shadow: none;
      background: transparent;
      overflow: visible;
    }

    /* An arcade game's cabinet (the scene's static FRAME_STYLE = 'cabinet'): the landing
       page's game frame, a coloured body with film-strip rails down both sides and the
       screen set in the night (LandingView's .cab-big / .cab-side / .cab-live). */
    .cb-sim-wrap .sim-host-container.sim-host-container--cabinet,
    :host([data-lesson-mode="story"]) .cb-sim-wrap .sim-host-container.sim-host-container--cabinet {
      --cab: var(--landing-planet-b);
      padding: 18px 46px 16px;
      border: 0;
      border-radius: 22px 22px 30px 30px;
      background: var(--cab);
      box-shadow: inset 0 -12px 0 color-mix(in srgb, var(--cab) 60%, var(--landing-sky-top)), 0 50px 70px -40px var(--landing-sky-top), 0 0 110px -30px var(--landing-glow);
      overflow: visible;
    }
    .sim-host-container--cabinet::before,
    .sim-host-container--cabinet::after {
      content: '';
      position: absolute;
      top: 24px;
      bottom: 24px;
      width: 22px;
      border-radius: 12px;
      background: repeating-linear-gradient(180deg, color-mix(in srgb, var(--cab) 55%, var(--landing-sky-top)) 0 14px, transparent 14px 26px);
      opacity: 0.8;
      pointer-events: none;
    }
    .sim-host-container--cabinet::before { left: 12px; }
    .sim-host-container--cabinet::after { right: 12px; }
    .sim-host-container--cabinet #sim-canvas-host {
      border-radius: 18px;
      overflow: hidden;
      border: 5px solid var(--landing-sky-top);
      background: var(--landing-sky-top);
    }
    .cb-stage-head + .sim-host-container--cabinet { border-radius: 0 0 30px 30px; }
    @media (max-width: 640px) {
      .cb-sim-wrap .sim-host-container.sim-host-container--cabinet { padding: 10px 8px 12px; border-radius: 16px 16px 22px 22px; }
      .sim-host-container--cabinet::before,
      .sim-host-container--cabinet::after { display: none; }
      .sim-host-container--cabinet #sim-canvas-host { border-width: 3px; border-radius: 12px; }
    }

    .cb-sim-wrap .sim-host-container canvas {
      width: 100% !important;
      height: auto !important;
      display: block;
    }

    /* DomSimulation scenes (src/simulations/base/DomSimulation.js) build real
       text nodes inside .sim-dom-root — the line-height:0 above (which
       collapses whitespace around a <canvas>) collapses DOM text just as
       badly, so it's restored here, scoped to that one class. */
    .cb-sim-wrap .sim-host-container .sim-dom-root {
      line-height: normal;
    }

    /* ── Custom Slider ───────────────────────────────────────────────── */
    .cb-sim-range {
      -webkit-appearance: none;
      width: 100%;
      height: 8px;
      border-radius: 4px;
      background: var(--shell-border);
      outline: none;
    }
    .cb-sim-range::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--bg-surface);
      cursor: pointer;
      box-shadow: var(--shadow-sm);
      border: 2px solid var(--shell-bg);
    }
    .cb-sim-range::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--bg-surface);
      cursor: pointer;
      box-shadow: var(--shadow-sm);
      border: 2px solid var(--shell-bg);
    }

    /* ── Simulation CONTROLS bar ─────────────────────────────────────── */
    .cb-sim-controls {
      margin-top: 1rem;
      width: 100%;
      padding: 0.8rem 1rem;
      box-sizing: border-box;
      background: var(--bg-surface);
      border-radius: 8px;
      display: flex;
      flex-direction: row;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
    }
    .cb-sim-controls.compact {
      margin-top: 0.4rem;
      padding: 0.35rem 0.5rem;
      gap: 8px;
    }
    .cb-sim-btn {
      padding: 6px 14px;
      background: var(--cb-btn-bg, var(--primary-color));
      color: var(--on-primary);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      opacity: 1;
      font-family: inherit;
      font-size: 0.85rem;
      font-weight: 500;
      height: 34px;
      display: inline-flex;
      align-items: center;
      transition: all 0.2s ease;
    }
    .cb-sim-btn.active { font-weight: var(--fw-strong); }
    .cb-sim-btn.tinted { color: var(--text-muted); }
    .cb-sim-btn.disabled { cursor: not-allowed; opacity: 0.4; }
    .cb-sim-btn.compact {
      padding: 3px 8px;
      font-size: 0.7rem;
      height: 24px;
    }
    .cb-sim-btn-icon { margin-right: 6px; }
    .cb-sim-slider-row {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .cb-sim-slider-label {
      font-size: 0.85rem;
      color: var(--text-main);
      white-space: nowrap;
    }
    .cb-sim-slider-row .cb-sim-range {
      width: 140px;
      cursor: pointer;
    }
    .cb-sim-slider-value {
      font-size: 0.85rem;
      font-weight: bold;
      min-width: 36px;
      color: var(--text-main);
    }
    .cb-sim-suffix {
      font-size: 0.85rem;
      color: var(--text-main);
    }
    .cb-sim-field {
      padding: 4px 8px;
      border-radius: 4px;
      background: var(--shell-bg);
      color: var(--text-main);
      border: 1px solid var(--shell-border);
    }
    .cb-sim-field.number { width: 80px; }
    /* Phones: every outside control is a 44px target. Buttons draw 36px and the
       8px row gap gives each 4px of invisible touch area above and below; the
       slider keeps its thin track and takes the touch on its padding. */
    @media (max-width: 600px) {
      .cb-sim-controls, .cb-sim-controls.compact { margin-top: 0.4rem; padding: 0.35rem 0.5rem; gap: 8px; }
      .cb-sim-btn, .cb-sim-btn.compact { position: relative; height: 36px; padding: 0 12px; font-size: 0.8rem; }
      .cb-sim-controls [role='group'] { overflow: visible !important; }
      .cb-sim-controls [role='group'] button { position: relative; min-height: 36px; min-width: 44px; font-size: 0.8rem !important; }
      .cb-sim-controls [role='group'] button:first-child { border-radius: 5px 0 0 5px; }
      .cb-sim-controls [role='group'] button:last-child { border-radius: 0 5px 5px 0; }
      .cb-sim-btn::after, .cb-sim-controls [role='group'] button::after { content: ''; position: absolute; inset: -4px 0; }
      .cb-sim-field { min-height: 44px; }
      .cb-sim-controls > label { min-height: 44px; }
      .cb-sim-slider-row { flex: 1 1 100%; min-width: 0; }
      .cb-sim-slider-label { white-space: normal; max-width: 45%; }
      .cb-sim-slider-row .cb-sim-range {
        flex: 1 1 60px;
        width: auto;
        min-width: 0;
        height: 44px;
        margin: -4px 0;
        padding: 18px 0;
        box-sizing: border-box;
        background-clip: content-box;
      }
      .cb-sim-range::-webkit-slider-thumb { width: 28px; height: 28px; }
      .cb-sim-range::-moz-range-thumb { width: 28px; height: 28px; }
    }

    /* ── Responsive: stack side-by-side on narrow viewports ─────────── */
    /* .cb-layout-right/left direction and .cb-image-wrap sizing are handled
       by blockImageLayoutStyles' own media query; this only covers the
       simulation wrapper, which is content-block-specific. */
    @media (max-width: 600px) {
      .cb-layout-right .cb-sim-wrap,
      .cb-layout-left  .cb-sim-wrap {
        /* Stacked layout puts the simulation in normal document flow above/
           below the text rather than beside it, so sticking it mid-scroll
           would fight the very text it's meant to sit next to. */
        position: static;
        flex: unset;
        max-width: 100%;
      }
    }

    /* ── "flow" position: real CSS text-wrap (§11) ─────────────────────── */
    .cb-layout-flow {
      display: flow-root;   /* clearfix equivalent — encloses the float's full
                                height even when .cb-text is shorter, without
                                clipping the way overflow:hidden would */
    }
    .cb-layout-flow .cb-sim-wrap {
      float: right;
      margin: 0 0 0.75rem 1.25rem;
      /* max-width applied inline from resolveSimLayout()'s widthPx, same
         pattern _renderSimulation() already uses for every other layout. */
    }

    /* ── Story narrator (prototype v2 b/ .narrator) ───────────────────── */
    .story-title { display: block; margin-bottom: var(--space-3); }
    .story-quill-row {
      display: flex;
      align-items: flex-end;
      gap: 6px;
      margin-bottom: -6px;
      position: relative;
      z-index: 2;
    }
    .story-quill > * { width: 108px; flex: none; animation: story-bob 3.2s ease-in-out infinite; }
    .story-quill-name {
      font-family: var(--font-heading);
      font-size: 0.8rem;
      background: var(--accent-coral);
      color: var(--bg-surface);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-pill);
      padding: 5px 14px;
      margin-bottom: 12px;
      transform: rotate(-2deg);
      box-shadow: var(--shadow-sm);
    }
    .story-bubble {
      position: relative;
      background: var(--bubble-fill);
      border: 3px solid var(--bubble-ink);
      border-radius: 22px;
      padding: 20px 22px;
      box-shadow: var(--card-shadow);
      color: var(--text-soft);
      font-weight: 500;
      scroll-margin-top: calc(var(--lesson-sticky-header-h, 0px) + 12px);
    }
    /* The tail: a rotated square sharing the bubble's fill and two edges. */
    .story-bubble::before {
      content: '';
      position: absolute;
      left: 46px;
      top: -14px;
      width: 24px;
      height: 24px;
      background: var(--bubble-fill);
      border-left: 3px solid var(--bubble-ink);
      border-top: 3px solid var(--bubble-ink);
      transform: rotate(45deg);
      border-radius: 5px 0 0 0;
    }
    .story-bubble-inner.enter > * { animation: story-bubble-in 450ms cubic-bezier(0.2, 1.2, 0.4, 1) both; }
    .so-far { margin-top: var(--space-4); }
    .so-far summary {
      list-style: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: var(--fw-heavy);
      font-size: 0.82rem;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }
    .so-far summary::-webkit-details-marker { display: none; }
    .so-far summary:hover { color: var(--text-main); }
    .so-far summary:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }
    .so-far-caret {
      width: 0;
      height: 0;
      border-left: 6px solid currentColor;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
      transition: transform var(--motion-fast);
    }
    .so-far[open] .so-far-caret { transform: rotate(90deg); }
    .scroll-paper {
      margin-top: 10px;
      background: var(--bg-sunken);
      border: 2.5px dashed color-mix(in srgb, var(--border-color) 45%, transparent);
      border-radius: 16px;
      padding: 14px 18px;
      font-size: 0.9rem;
      color: var(--text-muted);
      display: grid;
      gap: 10px;
      max-height: 260px;
      overflow: auto;
    }
    @keyframes story-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
    @keyframes story-bubble-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } }
    /* A beat a story cast character opens (<!-- SAY id -->) stands that
       character in the narrator row; anyone but the narrator speaks from
       the right. */
    .story-quill-row.speaker-right { flex-direction: row-reverse; }
    .story-quill-row.speaker-right .story-quill-name { transform: rotate(2deg); background: var(--accent-teal); }
    .story-bubble.speaker-right::before { left: auto; right: 46px; }
    @media (max-width: 700px) {
      .story-quill > * { width: 84px; }
      .story-bubble { padding: 16px 17px; border-radius: 18px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .story-quill > *, .story-bubble-inner.enter > * { animation: none; }
      .so-far-caret { transition: none; }
    }

    /* Fit-scene theatre (Story, constrained portrait screens): compact
       narration with its own scroll and a fade at the bottom edge. */
    :host([fit-scene]) .story-title { font-size: 0.85em; margin-bottom: 4px; }
    :host([fit-scene]) .story-quill-row { margin-bottom: -12px; }
    :host([fit-scene]) .story-quill > * { width: 52px; }
    :host([fit-scene]) .story-quill-name { font-size: 0.64rem; padding: 4px 10px; margin-bottom: 8px; }
    :host([fit-scene]) .story-bubble {
      max-height: 32dvh;
      overflow-y: auto;
      padding: 13px 16px;
      scrollbar-width: thin;
      -webkit-mask-image: linear-gradient(180deg, #000 0, #000 calc(100% - 30px), transparent 100%);
      mask-image: linear-gradient(180deg, #000 0, #000 calc(100% - 30px), transparent 100%);
    }
    :host([fit-scene]) .story-bubble::before { display: none; }
    :host([fit-scene]) .so-far { margin-top: 8px; }
    :host([fit-scene]) .so-far .scroll-paper { max-height: 22dvh; }
    :host([fit-scene]) .cb-layout-below { gap: 8px; }

    /* ── POE recap (poeRole: "observe"|"explain") ─────────────────────── */
    .cb-poe-recap {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-bottom: var(--space-5);
      padding: 10px 16px 10px 10px;
      background: var(--bg-surface);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      font-size: 0.92rem;
      color: var(--text-soft);
      animation: cb-chip-in 400ms cubic-bezier(0.2, 1.3, 0.4, 1) both;
    }
    .cb-poe-recap p { margin: 0; }
    .cb-poe-recap.good {
      border-color: color-mix(in srgb, var(--accent-teal) 55%, var(--border-color));
      background: color-mix(in srgb, var(--success-bg) 55%, var(--bg-surface));
    }
    .cb-poe-recap.bad {
      border-color: color-mix(in srgb, var(--error-text) 55%, var(--border-color));
      background: color-mix(in srgb, var(--error-bg) 55%, var(--bg-surface));
    }
    .cb-poe-quill > * { flex: none; width: 44px; }
    .cb-poe-recap strong { color: var(--text-main); }
    .cb-poe-verdict { font-weight: var(--fw-heavy); margin-left: 4px; }
    .cb-poe-verdict.correct { color: var(--success-text); }
    .cb-poe-verdict.incorrect { color: var(--error-text); }
    @keyframes cb-chip-in { from { opacity: 0; transform: scale(0.92) translateY(8px); } }
    @media (prefers-reduced-motion: reduce) { .cb-poe-recap { animation: none; } }

    /* ── Reading measure ──────────────────────────────────────────────────
       The lesson container is wide so that media has room (LessonSession's
       :host). Prose must not use all of it: past roughly 70 characters a line
       gets hard to track back from. Capped here, per layout, rather than by
       narrowing the container for everyone. */
    .cb-reading { max-width: 68ch; }
    .cb-layout-above .cb-text,
    .cb-layout-below .cb-text { max-width: 68ch; }
    .cb-layout-right .cb-text,
    .cb-layout-left  .cb-text { max-width: 62ch; }
    /* Background: the scrim spans the full width of the image, but the words
       on it are capped like any other prose. */
    .cb-layout-background .cb-text > * { max-width: 72ch; }

    /* A sticky side panel (.cb-sim-wrap/.cb-image-wrap above) can only stay
       pinned to the viewport while its containing row still has that panel's
       own height of room left below the current scroll position — sticky
       positioning is bounded by its container, not by the viewport alone.
       With progressive disclosure, .cb-text keeps every past beat stacked
       and growing, but the *last* beat's text always sits right at the
       bottom of that stack, i.e. right where the row itself ends. If the
       accumulated text isn't at least a full panel-height taller than the
       panel, the panel runs out of "stuck" room and detaches exactly while
       the student is reading the final beat, sliding up under the sticky
       lesson header — reported as the panel's own heading going missing,
       not as a "sticky" bug at all. Reserving this much blank space below
       the text guarantees the row always has that much extra room past
       wherever the text ends, so the panel never detaches mid-read. Set by
       _measureStickyMediaHeight() from the panel's own real rendered height
       (not guessed) — 0 for any non-sticky (above/below/flow/background)
       layout, which leaves this a no-op there. */
    .cb-layout-right .cb-text,
    .cb-layout-left  .cb-text { padding-bottom: var(--cb-sticky-media-h, 0px); }

    /* ── Progressive disclosure ───────────────────────────────────────── */

    /* A beat enters the DOM exactly when it becomes current — not before —
       which is what makes the entry animation reliable — an element created
       and revealed in the same frame has no previously-painted opacity for a
       transition to start from, so the fade silently did not run. A CSS
       *animation* has no such requirement: it plays whenever an element is
       rendered with it applied, including one arriving straight out of
       display:none. Media below the growing text column (an image, say)
       doesn't have this problem prevented for it — it moves, but smoothly:
       see willUpdate()/updated() and flipAnimate.js. */
    .rv-step { opacity: 0; }
    .rv-step.rv-shown { opacity: 1; }

    /* The entry animation belongs to the *current* beat only, never to
       rv-shown in general. Beats are revealed strictly in order, so a beat
       becomes shown exactly when it becomes current and nothing else ever
       "enters" — while putting the animation on rv-shown meant that when
       the next beat arrived, the outgoing one's animation-name changed
       (grow -> plain) and a changed animation-name *restarts* the animation:
       the paragraph the student had just read flashed back from nothing.
       Losing the animation entirely, as happens now, restarts nothing and
       hands the element cleanly to the transitions below.

       No fill mode, on purpose: with a fill of "both" the animation's end
       value would outrank the ordinary declarations below for the rest of the
       element's life, and a beat could never dim or shrink once it became a
       prior one. Unfilled, the computed style falls back to those rules the
       instant the animation ends. */
    .rv-step.rv-shown.rv-current {
      animation: rv-enter var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out);
    }
    /* Beats already read recede, so the eye lands on the new one.
       They remain muted even on the final beat so the active beat stays clearly emphasised. */
    .rv-steps > .rv-step.rv-past {
      color: var(--reveal-past-color, var(--text-muted));
    }

    @keyframes rv-enter {
      from { opacity: 0; transform: translateY(var(--motion-reveal-rise, 8px)); }
      to   { opacity: 1; transform: translateY(0); }
    }
    /* Reduced motion keeps the cross-fade and drops only the travel. The
       preference is about things moving across the screen — parallax, sliding,
       zooming — not about one paragraph fading up. Removing the fade too made
       every beat snap in with no indication anything had happened, which read
       as "the animation is broken" rather than as a considered accommodation. */
    @keyframes rv-fade {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    /* ── Beat rail and current-beat marker (Classic; prototype v2 a/) ─────
       Every beat carries a dot in a fixed left gutter, joined by a rail:
       read beats filled, the current one in primary with a soft halo. The
       current beat's text also gets a short gradient bar. The gutter and the
       text inset are the same on every beat, so nothing shifts sideways when
       a beat moves from current to past. Decorative only: the engine already
       announces each beat through A11yAnnouncer. */
    .rv-steps > .rv-step {
      position: relative;
      padding-left: 34px;
      color: var(--text-soft);
      transition:
        color var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out),
        opacity var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out);
    }
    .rv-steps > .rv-step::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0.45em;
      width: 13px;
      height: 13px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 2.5px solid var(--border-hover);
      background: var(--bg-surface);
      transition: background var(--motion-base), border-color var(--motion-base), box-shadow var(--motion-base);
    }
    .rv-steps > .rv-step:not(:last-child)::after {
      content: '';
      position: absolute;
      left: 5.25px;
      top: calc(0.45em + 19px);
      bottom: calc(-0.5rem - 0.45em + 6px);
      width: 2.5px;
      border-radius: 2px;
      background: var(--border-hover);
      opacity: 0.6;
    }
    .rv-steps > .rv-step.rv-past::before { background: var(--border-hover); }
    .rv-steps > .rv-step.rv-current::before {
      border-color: var(--primary-color);
      background: var(--primary-color);
      box-shadow: 0 0 0 5px color-mix(in srgb, var(--primary-color) 22%, transparent);
      animation: var(--beat-dot-anim, rv-dot-pulse 2.2s ease-in-out infinite);
    }
    .rv-steps > .rv-step > markdown-renderer {
      display: block;
      padding-left: 14px;
      background: linear-gradient(var(--primary-color), var(--accent-blue)) no-repeat 0 6px / 0 calc(100% - 12px);
      border-radius: 2px;
      transition: background-size var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out);
    }
    .rv-steps > .rv-step.rv-current > markdown-renderer { background-size: var(--reveal-bar-w) calc(100% - 12px); }
    .rv-steps > .rv-step.rv-past { opacity: var(--reveal-past-opacity, 0.5); }
    .rv-steps > .rv-step.rv-past:hover { opacity: 0.85; }
    @keyframes rv-dot-pulse {
      0%, 100% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color) 22%, transparent); }
      50% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--primary-color) 10%, transparent); }
    }

    /* ── "result" callout (STEP sentinel's callout="result") ───────────────
       Formalizes the ad hoc red-left-border box several worked-example math
       slides already built by hand into one reusable convention — same
       visual language as .cb-poe-recap above, generalized past POE. Wins the
       cascade over the two rules just above (same 3-class specificity,
       declared later in this same stylesheet) so a result beat keeps its own
       background/border/padding regardless of current/past state, and stays
       fully legible (never dims to .rv-past's 0.45 opacity) — it's the
       payoff, not a beat the student has moved on from. */
    .rv-steps > .rv-step.rv-callout-result {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      background: var(--bg-panel);
      border-left: 4px solid var(--primary-color);
      border-radius: var(--radius-md, 8px);
      padding: 0.75rem 0.9rem;
      /* The box starts after the rail gutter; its dot and rail segment are
         pulled back out into the gutter so the rail stays continuous. */
      margin-left: 34px;
    }
    .rv-steps > .rv-step.rv-callout-result::before { left: -34px; }
    .rv-steps > .rv-step.rv-callout-result::after { left: calc(5.25px - 34px); }
    .rv-steps > .rv-step.rv-callout-result > markdown-renderer { padding-left: 0; background: none; }
    .rv-steps > .rv-step.rv-callout-result.rv-past {
      opacity: 1;
    }
    .rv-step.rv-callout-result > markdown-renderer {
      flex: 1;
      min-width: 0;
    }
    .rv-callout-mascot > * {
      flex: 0 0 auto;
    }
    @media (max-width: 480px) {
      .rv-steps > .rv-step.rv-callout-result {
        flex-direction: column;
        align-items: flex-start;
      }
    }

    /* The global reduced-motion block in theme.css is written against the
       universal selector, which does not pierce Shadow DOM — this has to be
       re-declared here, exactly as semantic-descriptive/v1/styles.js:77-79
       does for the same reason.
       Stepping itself is NOT disabled: it is pacing, not motion. Nor is
       autoplay — see LessonEngine._canAutoplay(). */
    @media (prefers-reduced-motion: reduce) {
      .rv-step.rv-shown.rv-current { animation-name: rv-fade; }
      .rv-steps > .rv-step.rv-current::before { animation: none; }
      .rv-steps > .rv-step > markdown-renderer { transition: none; }
    }

    /* The scrolling-page layout: a sideways drag on the picture is the scene's,
       not a page turn (LessonSession._touchOwnedByControl); it still scrolls. */
    .cb-sim-wrap .sim-host-container { touch-action: pan-y; }

    .rv-more {
      display: flex;
      justify-content: flex-start;
      margin-top: 0.75rem;
    }
    .rv-more-hidden { visibility: hidden; }
    .rv-more button {
      background: none;
      border: none;
      padding: 4px 2px;
      font: inherit;
      font-size: 0.82rem;
      color: var(--text-muted);
      cursor: pointer;
      border-bottom: 1px dashed var(--border-color);
    }
    .rv-more button:hover { color: var(--primary-text); }
    .rv-more button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 3px; }
    /* 44px on a phone without moving the text below it (design rule, ProgressiveDisclosureMixin). */
    @media (max-width: 600px), (pointer: coarse) {
      .rv-more button { min-height: 44px; margin: -9px 0 -8px; border-bottom: 0; text-decoration: underline dashed var(--border-color); text-underline-offset: 3px; }
    }

  `, theatreStyles, plainLookStyles, css`
    /* Narrated mode (NarrationPacer.js): a slide with a picture keeps the
       picture exactly where it is and hides its prose; the lesson's caption
       overlay speaks it instead. Display only, so the scene is never
       remounted. A slide with no picture keeps its prose (it is the picture). */
    :host([narrated]) .cb-layout-right > .cb-text,
    :host([narrated]) .cb-layout-left > .cb-text,
    :host([narrated]) .cb-layout-above > .cb-text,
    :host([narrated]) .cb-layout-below > .cb-text,
    :host([narrated]) .cb-layout-flow > .cb-text,
    :host([narrated]) .cb-layout-background > .cb-text { display: none; }
    :host([narrated]) .cb-layout-right,
    :host([narrated]) .cb-layout-left { justify-content: center; }
    :host([narrated]) .cb-layout-right > .cb-sim-wrap,
    :host([narrated]) .cb-layout-left > .cb-sim-wrap,
    :host([narrated]) .cb-layout-right > .cb-image-wrap,
    :host([narrated]) .cb-layout-left > .cb-image-wrap { margin-inline: auto; }
    :host([narrated]) .th > .th-narr,
    :host([narrated]) .th > .th-div { display: none; }
    :host([narrated]) .th > .th-slot { flex: 1 1 auto; justify-content: flex-start; }
    /* A portrait phone outside the theatre: a caption band above the picture. */
    @media (max-width: 600px) and (orientation: portrait) {
      :host([narrated]) [class*="cb-layout-"] > .cb-sim-wrap,
      :host([narrated]) [class*="cb-layout-"] > .cb-image-wrap { margin-top: 84px; }
    }
    /* A short landscape phone: the narration strip takes the bottom, so the
       theatre fits above it (its 320px floor would slide under the strip). */
    @media (max-height: 600px) and (orientation: landscape) {
      :host([narrated]) .th {
        min-height: 0;
        height: calc(100dvh - var(--lesson-sticky-header-h, 0px) - var(--lesson-chrome-bottom, 0px) - 16px);
      }
    }
  `];

  static properties = {
    _data: { type: Object, state: true },
    _sceneClass: { type: Object, state: true },
    _step: { type: Number, state: true },
    _isNarrowViewport: { type: Boolean, state: true },
    // Narrated mode (NarrationPacer.js): the prose gives way to the lesson's
    // caption overlay wherever this slide has a picture to show instead.
    narrated: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    this._data = null;
    this._scene = null;
    this._sceneClass = null;
    this._sceneHost = null; // the #sim-canvas-host element _scene is currently mounted into
    this._step = 0;
    this._steps = [];
    this._header = null;
    this._isNarrowViewport = false;
    this._mqListener = (e) => { this._isNarrowViewport = e.matches; };

    // ── Adaptive image layout state (resolveImageLayout) ──────────────────
    this._imgDims = null;          // {naturalWidth, naturalHeight} once probeImageDimensions resolves
    this._probedImgSrc = null;     // which src _imgDims currently reflects — re-probed when reveal.images swaps it
    this._columnWidth = 0;         // this host element's own rendered width
    this._isShortLandscape = false;
    this._mqShortListener = (e) => { this._isShortLandscape = e.matches; this.requestUpdate(); };
    this._activeImageLayout = null; // computed once per render(), read by _renderImage()/_renderSimulation()
    this._flipFromRect = null; // .cb-image-wrap/.cb-sim-wrap's pre-update rect, set in willUpdate()

    // ── Adaptive simulation layout state (resolveSimLayout) ───────────────
    this._isPortrait = false;
    this._mqPortraitListener = (e) => { this._isPortrait = e.matches; this.requestUpdate(); };
    this._simSceneClass = null;    // resolved by _probeActiveSimulation(), read by _mountSimulation()
    this._probedSimSrc = null;     // which src _simSceneClass currently reflects
    this._measuredControlsHeight = null; // see _measureSimControls()/_reserveControlsSpace()
    this._priorControlsHeight = null;
    this._measuredStickyMediaHeight = null; // see _measureStickyMediaHeight()
    this._stickyRO = null;                  // see _observeStickyMedia()
    this._stickyObserved = null;

    // ── Mid-beat cue choreography (§12) ────────────────────────────────────
    this._cueObserver = null;
    this._firedCueIds = new Set();

    // ── photoDiagram (PhotoDiagram.js via photoDiagramHost.js) ─────────────
    this._photoDiagramHost = null;   // the #photo-diagram-host element currently mounted into
    this._photoDiagramHandle = null; // { destroy } from mountPhotoDiagram()

    // ── graph / diagram companion (stepFigureHost.js): a static figure revealed per beat ──
    this._figureHost = null;
    this._figureHandle = null;       // { setStep, destroy }
    this._figureToken = 0;           // guards the async graph mount against a newer host

    // ── figure field (FigureLayouts.js via figureHost.js): an engine-laid-out figure ──
    this._figFieldHost = null;
    this._figFieldHandle = null;     // { setStep, setOptions, destroy }
    // Renderer form (figure.renderer, rendererHost.js): the module's aspect(data)
    // hint, fetched once per figure object; 1.5 until it is known.
    this._figRendererAspect = { figure: null, value: null };

    // ── Story diorama theatre (core/components/diorama/StoryTheatre.js) ──
    // A Story simulation slide's split/floating/full-view layout, camera and
    // viewing options. _theatreOn is decided once per render().
    this._theatre = new StoryTheatre(this);
    this._theatreOn = false;
  }

  connectedCallback() {
    super.connectedCallback();
    // The scene's stage, for a look placing something beside it (cue:stage-query).
    this._stopStageAnswers = answerStageQueries({
      stage: () => this.shadowRoot?.getElementById('sim-canvas-host'),
      frame: () => this.shadowRoot?.querySelector('.th-stage, .sim-host-container') || this.shadowRoot?.getElementById('sim-canvas-host'),
      room: () => this._theatre?.fullViewRoom() || null,
      residents: () => [...(this.shadowRoot?.querySelectorAll('companion-slot:not([kind])') || [])].map((s) => s.companion),
      beside: () => this.shadowRoot?.querySelectorAll('.story-title, .story-quill-name, .story-bubble, .cb-poe-recap, .rv-current') || [],
    });
    this._mq = window.matchMedia('(max-width: 600px)');
    this._isNarrowViewport = this._mq.matches;
    this._mq.addEventListener('change', this._mqListener);

    // Mirrors LessonSession.js's own short-landscape breakpoint exactly, so
    // the two files agree on what "short landscape" means — this is the
    // specific viewport shape (sticky header un-sticks to save room) a tall
    // side/above image most needs to yield space to.
    this._mqShort = window.matchMedia('(max-height: 600px) and (orientation: landscape)');
    this._isShortLandscape = this._mqShort.matches;
    this._mqShort.addEventListener('change', this._mqShortListener);

    // Story's fit-scene theatre (prototype v2 b/): on a constrained screen a
    // simulation slide keeps narration and scene in one viewport. Portrait:
    // narration above (bubble capped, scrolls itself), scene below sized to
    // what is left. Short landscape: the usual side-by-side tier.
    this._mqFit = window.matchMedia('(max-width: 940px), (max-height: 640px) and (orientation: landscape)');
    this._mqFitListener = () => this.requestUpdate();
    this._mqFit.addEventListener('change', this._mqFitListener);

    // Drives both resolveSimLayout()'s isPortrait input and, threaded
    // through _mountSimulation()'s config, DomSimulation's own internal
    // portrait design-size swap — the same signal for both, so the two can
    // never disagree (docs/sprints/wip/dom-simulation-auto-layout.md §4.2).
    this._mqPortrait = window.matchMedia('(orientation: portrait)');
    this._isPortrait = this._mqPortrait.matches;
    this._mqPortrait.addEventListener('change', this._mqPortraitListener);

    // Column width, not raw window width, is what the image is actually laid
    // out against (blockImageLayoutStyles caps the image relative to its own
    // column) — matches this file's existing rationale for capping the
    // column rather than the image.
    this._columnRO = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && Math.abs(w - this._columnWidth) > 1) {
        this._columnWidth = w;
        this.requestUpdate();
      }
    });
    this._columnRO.observe(this);

    // _availableHeight() reads window.innerHeight live, but nothing above
    // re-renders purely because *that* changed — the column ResizeObserver
    // only fires when this element's own box changes, which a pure viewport
    // *height* change (or a width change too small to move the already
    // max-width-capped column) never does. Without this, a layout resolved
    // while the window was short (e.g. "right", once "below" no longer fit)
    // stays stuck even after the window is resized back tall, since nothing
    // ever asks resolveImageLayout() to reconsider. rAF-coalesced so a drag
    // resize doesn't schedule a render on every intermediate tick.
    this._resizeListener = () => {
      if (this._resizeRAF) return;
      this._resizeRAF = requestAnimationFrame(() => {
        this._resizeRAF = null;
        this.requestUpdate();
      });
    };
    window.addEventListener('resize', this._resizeListener);
    // LessonSession's header/action-bar heights feed _availableHeight().
    window.addEventListener('lesson-chrome-changed', this._resizeListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._onPrint) {
      window.removeEventListener('beforeprint', this._onPrint);
      window.removeEventListener('afterprint', this._onPrinted);
    }
    this._aspectRO?.disconnect();
    this._aspectWrap = null;
    this._stopStageAnswers?.();
    if (this._mq) {
      this._mq.removeEventListener('change', this._mqListener);
    }
    if (this._mqShort) {
      this._mqFit?.removeEventListener('change', this._mqFitListener);
    this._mqShort.removeEventListener('change', this._mqShortListener);
    }
    if (this._mqPortrait) {
      this._mqPortrait.removeEventListener('change', this._mqPortraitListener);
    }
    this._cueObserver?.disconnect();
    if (this._stickyRO) {
      this._stickyRO.disconnect();
      this._stickyRO = null;
      this._stickyObserved = null;
    }
    if (this._columnRO) {
      this._columnRO.disconnect();
      this._columnRO = null;
    }
    if (this._resizeListener) {
      window.removeEventListener('resize', this._resizeListener);
      window.removeEventListener('lesson-chrome-changed', this._resizeListener);
      this._resizeListener = null;
    }
    if (this._resizeRAF) {
      cancelAnimationFrame(this._resizeRAF);
      this._resizeRAF = null;
    }
    if (this._scene) {
      this._scene.stop && this._scene.stop();
      this._scene.destroy();
      this._scene = null;
    }
    this._sceneHost = null;
    this._photoDiagramHandle?.destroy();
    this._photoDiagramHandle = null;
    this._photoDiagramHost = null;
    this._figureHandle?.destroy();
    this._figureHandle = null;
    this._figureHost = null;
    this._figureToken++;
    this._figFieldHandle?.destroy();
    this._figFieldHandle = null;
    this._figFieldHost = null;
  }

  /**
   * Captures the media wrapper's *pre-update* position ahead of a beat
   * change, so `updated()` can animate the shift instead of letting it snap
   * once the text column above/beside it grows or shrinks. Runs before Lit
   * patches the DOM for this update, so the shadow root still reflects the
   * previous render — see flipAnimate.js.
   */
  willUpdate(changedProperties) {
    if (changedProperties.has('_step')) {
      this._flipFromRect = captureRect(this.shadowRoot?.querySelector('.cb-image-wrap, .cb-sim-wrap'));
    }
  }

  updated(changedProperties) {
    this._markRenderers();
    super.updated(changedProperties); // ProgressiveDisclosureMixin's scroll-to-current-beat
    this._cueReveal();
    // Story's bubble is one reused element; replay its entrance on each new
    // beat (Lit keeps the node, so a CSS animation would otherwise run once).
    this.toggleAttribute('fit-scene', this._fitPortrait);
    if (this._fitPortrait) {
      // The narration's height sets the scene's height, which can rewrap the
      // narration: at some viewport sizes the two never agree and this used to
      // re-render for ever (hung the landing page's story preview at 820x615).
      // A few passes per beat settle every real case; then keep what we have.
      if (changedProperties.has('_step')) this._narrPasses = 0;
      const text = this.shadowRoot?.querySelector('.cb-text');
      const h = text ? text.offsetHeight : 0;
      if (Math.abs(h - (this._narrH || 0)) > 8 && (this._narrPasses || 0) < 4) {
        this._narrPasses = (this._narrPasses || 0) + 1;
        this._narrH = h;
        this.requestUpdate();
      }
    }
    if (this.isStoryMode && changedProperties.has('_step')) {
      const inner = this.shadowRoot?.querySelector('.story-bubble-inner');
      if (inner) {
        inner.classList.remove('enter');
        void inner.offsetWidth;
        inner.classList.add('enter');
      }
    }
    if (this._flipFromRect) {
      playFlip(this.shadowRoot?.querySelector('.cb-image-wrap, .cb-sim-wrap'), this._flipFromRect);
      this._flipFromRect = null;
    }
    // A FILL_HEIGHT scene re-reads its height budget after every render: the
    // layout tier (side / stacked) or the controls reserve may have changed
    // without its own width changing. Idempotent, and it only sets the scene's
    // own frame height, never this block's layout inputs.
    if (this._scene?.constructor?.FILL_HEIGHT) this._scene.fillFrame?.();
    // Lazily mount the simulation once its host div actually exists in the
    // DOM — not just on the first render. When `mediaStep` gates the
    // simulation off, `#sim-canvas-host` doesn't exist yet at `firstUpdated`
    // time (Lit only fires that once), so mounting has to happen here
    // instead, on whichever later `updated()` pass is the first to find the
    // host. `_sceneMounting` survives the async gap while `loadModule()`/
    // `setup()` are in flight, since `updated()` can fire again before they
    // resolve. For an ungated block the host exists on this very first pass,
    // so timing is unchanged from before.
    //
    // `host !== this._sceneHost` (rather than just `!this._scene`) is what
    // makes this fire again on a *re*-mount, not only the first one: a block
    // with both `image` and `simulation` (gated by `simulationStep`) flips
    // between `_renderImage()`/`_renderSimulation()` as the student crosses
    // that beat in either direction, and since the two branches are
    // differently-shaped templates, lit-html discards `#sim-canvas-host`
    // (and whatever canvas the scene painted into it) every time the
    // student steps back past `simulationStep` — leaving `this._scene` set
    // but pointing at a detached host. Without this check, `!this._scene`
    // alone would never be true again, and navigating forward past
    // `simulationStep` a second time would render an empty host forever.
    if (this._data?.simulation?.src && !this._sceneMounting) {
      const host = this.shadowRoot.getElementById('sim-canvas-host');
      // On a phone the scene's shape picks the template (_tallForPhoneStage()),
      // so wait for the probe rather than mount into a host about to go.
      if (host && host !== this._sceneHost && (this._simProbeDone || !this._isNarrowViewport)) {
        if (this._scene) {
          this._scene.stop && this._scene.stop();
          this._scene.destroy();
          this._scene = null;
        }
        this._mountSimulation(host);
      }
    }

    // Same lazy/re-mount-on-host-swap reasoning as the simulation block
    // above, simplified: PhotoDiagram.plot() is synchronous (plain JSON in,
    // DOM out - no scene module to dynamically import), so there's no
    // `_sceneMounting`-style async gap to guard. A beat change that keeps
    // the same host just calls setStep() below, not a full remount.
    if (this._data?.photoDiagram) {
      const host = this.shadowRoot.getElementById('photo-diagram-host');
      if (host && host !== this._photoDiagramHost) {
        this._photoDiagramHandle?.destroy();
        this._photoDiagramHost = host;
        this._photoDiagramHandle = mountPhotoDiagram(host, this._data.photoDiagram, this._ctx?.bundleId, this._step);
      } else if (host && changedProperties.has('_step')) {
        this._photoDiagramHandle?.setStep(this._step);
      }
    }

    // graph / diagram companion: same mount-on-host-swap pattern; a graph mount is
    // async (expressions evaluate in a worker), so a token drops a stale one.
    const figure = this._data?.graph || this._data?.diagram;
    if (figure) {
      const host = this.shadowRoot.getElementById('step-figure-host');
      if (host && host !== this._figureHost) {
        this._figureHandle?.destroy();
        this._figureHandle = null;
        this._figureHost = host;
        const token = ++this._figureToken;
        if (this._data.graph) {
          mountStepGraph(host, this._data.graph, this._step).then((h) => {
            if (token === this._figureToken) { this._figureHandle = h; h.setStep(this._step); } else h.destroy();
          });
        } else this._figureHandle = mountStepDiagram(host, this._data.diagram, this._step);
      } else if (host && changedProperties.has('_step')) {
        this._figureHandle?.setStep(this._step);
      }
    }

    // figure field: same mount-on-host-swap / setStep-per-beat pattern. The look
    // and the lesson kicker (the casefile folder tab) follow along.
    if (this._data?.figure) {
      const host = this.shadowRoot.getElementById('figure-field-host');
      const kicker = Number(this._ctx?.lessonNumber) > 0 ? `Lesson ${this._ctx.lessonNumber}` : '';
      if (host && host !== this._figFieldHost) {
        this._figFieldHandle?.destroy();
        this._figFieldHost = host;
        const mount = this._data.figure.renderer ? mountRenderer : mountFigure;
        this._figFieldHandle = mount(host, this._data.figure, { step: this._step, look: this.look, bundleId: this._ctx?.bundleId, kicker });
      } else if (host) {
        this._figFieldHandle?.setOptions({ look: this.look, kicker });
        if (changedProperties.has('_step')) this._figFieldHandle?.setStep(this._step);
      }
    }

    // Optional hook, feature-detected like requestUiUpdate/isControlHidden/
    // onControlChange: a simulation that wants its own internal steps to
    // track this block's text beats (rather than only its own Back/Next
    // controls) implements onBeatChange(step, stepCount) and gets notified
    // on every beat change — click, keyboard, swipe or autoplay, they all
    // funnel through `_step`. `_mountSimulation()` fires the initial sync
    // itself (right after setup(), before this updated() pass that mounted
    // it has a chance to re-run), so this only needs to cover *subsequent*
    // beat changes on an already-mounted scene.
    if (changedProperties.has('_step') && this._scene) {
      if (this._sceneHost) this._sceneHost.dataset.simBeat = String(this._step);
      this._scene.onBeatChange?.(this._step, this._steps.length);
      this._focusSimIfAtLastBeat();
    }

    // Keeps _reserveControlsSpace()'s reserve matched to the CONTROLS bar's
    // real rendered height instead of a guess — see that method's and this
    // one's own doc comments. Runs on every update (cheap: two DOM reads,
    // no-op unless the measured height actually changed) since the bar can
    // appear, disappear, or reflow between one and two rows on any update
    // that changes control visibility, this block's own width, or the
    // active scene.
    this._measureSimControls();

    // Keeps `.cb-text`'s bottom reserve (see that rule's own doc comment, in
    // this class's static styles above) matched to the sticky side panel's
    // real rendered height, the same measure-not-guess pattern
    // _measureSimControls() uses right above. Runs on every update; cheap
    // and a no-op unless the measured height actually changed.
    this._measureStickyMediaHeight();

    // A beat change may have swapped in a different `reveal.images` entry —
    // re-probe so resolveImageLayout() picks a layout for *this* image's
    // aspect ratio rather than the previous beat's. No-op when the active
    // src hasn't actually changed (see _probeActiveImage()).
    if (changedProperties.has('_step')) {
      this._probeActiveImage();
    }

    // Mid-beat cue anchors (§12) live inside the current beat's rendered
    // markdown — re-wire the observer whenever the current beat changes.
    if (changedProperties.has('_step')) {
      this._wireCueObserver();
    }

    if (this._theatreOn) {
      this._watchSimAspect();
      this._theatre.afterUpdate({ stepChanged: changedProperties.has('_step'), step: this._step, focus: this._simFocus() });
    } else {
      this._theatre.idle();
    }
  }

  /**
   * The part of the scene the current beat is about, for the theatre's
   * camera: a scene's own `beatFocus(step, stepCount)` wins (feature-detected,
   * like onBeatChange), else `simulation.focus`, keyed by step id (an authored
   * STEP sentinel) or by 1-based beat number. Fractions of the scene, 0..1:
   * { x, y, w, h, label? }. null: show the whole scene.
   */
  _simFocus() {
    const fromScene = this._scene?.beatFocus?.(this._step, this._steps.length);
    if (fromScene) return fromScene;
    const map = this._data?.simulation?.focus;
    if (!map || typeof map !== 'object') return null;
    const id = this._steps[this._step]?.id;
    return (id && map[id]) || map[String(this._step + 1)] || null;
  }

  /** In the theatre the narration scrolls inside its own pane; only the theatre itself is scrolled to. */
  _scrollCurrentBeatIntoView() {
    if (this._theatreOn) { this._theatre.scrollIntoView(); return; }
    super._scrollCurrentBeatIntoView();
  }

  /**
   * Overrides ProgressiveDisclosureMixin's default scroll target
   * (center-if-it-fits, else bottom-aligned) for the one case that default
   * was never designed for: media stacked *below* the text column — a
   * simulation via resolveSimLayout's sideFailureFallback (the common case
   * on a portrait phone, where there's no room for the side-by-side tier at
   * all), or an image via resolveImageLayout's own fallback chain, which
   * degrades in the same direction for the same reason (see that function's
   * own comment on its sideFailureFallback value). The default centers the
   * current beat so it stays level with a *side* panel's own sticky
   * centering (see that method's doc comment) — for a stacked layout there
   * is no side panel to align with, and centering instead wastes roughly
   * the top half of the viewport on already-read past beats, leaving too
   * little room below the current beat for the media that's supposed to
   * sit right after it. Pinning the current beat to the top instead pushes
   * those past beats off-screen above and hands the media the rest of the
   * viewport, mirroring how the side-by-side tier already keeps beat and
   * media visible together.
   *
   * Deliberately keyed on layout alone, not on which media type produced
   * it — an image and a simulation resolved to 'below' need the identical
   * fix for the identical reason. An 'above' layout (a direct, fitting
   * author `position: "above"` hint — the only way to reach it now that
   * both fallback chains degrade to 'below') is NOT given an equivalent
   * fix: a sticky 'above' panel was tried and reverted (it paints over
   * whatever past-beat text scrolls underneath it, since above/below share
   * one column rather than sitting beside it the way the side tier does),
   * and no scroll alignment of the current beat can keep a panel *before*
   * the entire beat list in view once accumulated beats exceed one
   * viewport. An author choosing "above" is accepting that pre-existing
   * trade-off explicitly.
   */
  _scrollBeatBlockAlign(fits) {
    if (this._activeImageLayout?.layout === 'below' && (this._data?.simulation?.src || this._data?.image?.src)) {
      return 'start';
    }
    return fits ? 'center' : 'end';
  }

  /**
   * Give the simulation real keyboard focus once — but only once there's
   * nothing left for ArrowRight/Left to usefully do on *this* block's own
   * text beats. Before that point, focusing the canvas would silently steal
   * the beat-advance keys the whole rest of the lesson runtime uses (see
   * LessonSession._handleKey); on the last beat, though, the alternative is
   * worse — ArrowRight currently falls straight through to "next slide"
   * behind the student's back, invisibly skipping an interactive sim they
   * never got to touch unless they happened to click it. Only fires once
   * per beat *transition* (guarded by callers checking `_step` actually
   * changed, or this being the initial mount), so it never steals focus
   * back from something the student clicked while already parked here.
   */
  _focusSimIfAtLastBeat() {
    if (this._step !== this._steps.length - 1) return;
    const host = this.shadowRoot.getElementById('sim-canvas-host');
    const target = host?.querySelector('canvas, [tabindex], button, input, select, textarea, a[href]');
    target?.focus({ preventScroll: true });
  }

  async _mountSimulation(host) {
    this._sceneMounting = true;
    // Recorded synchronously (not just on success) so a concurrent
    // `updated()` pass sees this host as already "claimed" and won't fire a
    // second, redundant mount into it while `loadModule()`/`setup()` are
    // still in flight — and so a mount that fails still leaves `_sceneHost`
    // pointing at *this* host, which is what stops the failure from being
    // retried on every subsequent beat change against the same dead host
    // (retrying only resumes once the host itself changes again).
    this._sceneHost = host;
    try {
      const src = this._data.simulation.src;
      // Reuse the SceneClass _probeActiveSimulation() already resolved for
      // this exact src (kicked off from init(), ahead of this mount) rather
      // than loading the module a second time.
      const SceneClass = (this._simSceneClass && this._probedSimSrc === src)
        ? this._simSceneClass
        : SimulationLoader.resolveSceneClass(await SimulationLoader.loadModule(src, this._ctx?.bundleId));
      // The desired host may have moved on again while the module was
      // loading — e.g. the student stepped back past `simulationStep` and
      // forward again before this resolved. Mounting into a host nobody
      // wants anymore would just be immediately discarded like the one
      // before it; bail out and let the `updated()` pass that retargeted
      // `_sceneHost` handle mounting into the *current* host instead.
      if (this._sceneHost !== host) return;
      this._sceneClass = SceneClass;

      // resolveMedia lets a scene embed a real bundle-relative image (e.g.
      // `media/L0N/foo.jpg` in its own DOM, not the block's `image` field)
      // without importing CourseSourceManager itself — scenes must stay
      // engine-dependency-free so simulations-kit/preview-harness.html can
      // still mount them standalone; there it's simply undefined and a
      // scene should fall back to using the raw ref as-is.
      const bundleId = this._ctx?.bundleId;
      // Loaded before the scene exists so `glossaryTerm()` is synchronous.
      // The field guide only for a scene that reads one (the GameScene family,
      // the one caller of config.fieldGuide()), so other scenes fetch nothing.
      const readsGuide = typeof SceneClass?.prototype?._loadFieldGuide === 'function';
      const [glossary, guide, collection] = await Promise.all([
        GlossaryService.load(bundleId), readsGuide ? CollectionService.loadGuide(bundleId) : null, CollectionService.load(bundleId),
        SimulationLoader.markHost(host, bundleId),
      ]);
      this._scene = new SceneClass(host, {
        isPortrait: this._isPortrait,
        // This block sized the panel from the viewport's orientation, so a
        // DomSimulation must keep following that signal after mount instead
        // of re-deciding by its own (narrow side-panel) width - see
        // DomSimulation._liveViewportPortrait().
        orientationFollowsViewport: true,
        fillHeight: () => this._simFillHeight(),
        resolveMedia: (ref) => CourseSourceManager.resolveRef(ref, bundleId),
        // The bundle's glossary entry for an id (see core/GlossaryService.js), or null.
        glossaryTerm: (id) => glossary?.get(id) ?? null,
        // The course field guide and the learner's saved collection (games; see CollectionService).
        fieldGuide: () => guide,
        collection,
      });
      this._scene.requestUiUpdate = () => this.requestUpdate();
      this._scene.allowResume = true;
      await this._scene.setup();
      if (this._sceneHost !== host) {
        // Moved on again during setup() itself — tear down what we just
        // built rather than leaving it running against a detached host.
        this._scene.stop && this._scene.stop();
        this._scene.destroy();
        this._scene = null;
        return;
      }
      // Sync to whatever beat is already current (e.g. a resumed lesson
      // restoring a mid-slide position) — see the updated() hook above for
      // every beat change *after* this initial one. data-sim-beat: a find
      // counts once per beat (SimFind.js reads it from its own host).
      host.dataset.simBeat = String(this._step);
      // Narrated: control values the learner set before leaving this slide.
      if (this._ctx?.sceneState != null && typeof this._scene.setState === 'function') {
        try { this._scene.setState(this._ctx.sceneState); } catch (e) { console.warn('scene setState failed', e); }
      }
      this._scene.onBeatChange?.(this._step, this._steps.length);
      this._focusSimIfAtLastBeat();

      if (typeof this._scene.start === 'function') this._scene.start();
      if (typeof this._scene.resume === 'function') this._scene.resume();
    } catch (err) {
      console.error('Failed to load simulation', err);
      // textContent, not innerHTML: the message is not ours to trust (invariant 6).
      const msg = document.createElement('div');
      msg.className = 'cb-sim-error';
      msg.textContent = `Failed to load simulation: ${err.message}`;
      host.replaceChildren(msg);
    } finally {
      this._sceneMounting = false;
    }
  }

  /**
   * Required plugin lifecycle method.
   * Invoked immediately after creation, before being added to DOM.
   * @param {object} data The block payload.
   * @param {{poe?: import('../../../../engines/lesson/POEController.js').POEController,
   *          blockIndex?: number, initialStep?: number}} [ctx]
   *   Passed by LessonEngine so a block tagged `poeRole` can recall the
   *   prediction made by whichever block was immediately before it — see
   *   POEController.recall(). `initialStep` restores a saved reveal position.
   *   All optional: the manual harnesses (`test.html:630`,
   *   `tests/component-playground.html:662`) and the authoring preview
   *   (`preview.js:30,44`) all mount with no ctx at all, and must keep working.
   */
  init(data, ctx) {
    if (!data || !data.markdown) {
      throw new Error("ContentBlock requires a 'markdown' payload.");
    }
    this._data = data;
    this._ctx = ctx || null;
    this.narrated = !!ctx?.narrated;
    this._theatre.narrated = this.narrated;

    // `markdown` is `{en: "…"}` in content, but the manual harnesses pass a
    // bare string. Both have always worked here; keep it that way.
    const markdown = data.markdown?.en || data.markdown;
    this._initDisclosure(markdown, data, ctx);
    this._applyFold(data);

    // Kick off ahead of the real lazy-loaded <img> — resolveImageLayout()
    // needs the aspect ratio before it can pick a layout. Renders with the
    // author's raw position hint until this resolves (see
    // resolveImageLayout's own "dimensions not measured yet" branch), then
    // re-renders into the adaptive layout. Normally a one-time reflow bounded
    // to initial mount — but see _probeActiveImage()'s own comment for why a
    // block using `reveal.images` re-probes on every beat that swaps the src.
    this._probeActiveImage();
    // Same idea, for the simulation case — see _probeActiveSimulation()'s
    // own doc comment below.
    this._probeActiveSimulation();
  }

  /** The image actually shown for the current beat: the block's own `image`,
   *  with any `reveal.images[stepId]` entry shallow-merged on top (a step
   *  without an entry, or a block with no `reveal.images` at all, just
   *  renders `image` unchanged — today's exact behaviour). */
  _activeImage() {
    const base = this._data?.image;
    const overrides = this._data?.reveal?.images;
    if (!base || !overrides) return base;
    const id = this._steps[this._step]?.id;
    const override = id ? overrides[id] : null;
    return override ? { ...base, ...override } : base;
  }

  /** Re-probes natural dimensions whenever the active image's src actually
   *  changes — either the one-time initial mount (no prior probe at all), or
   *  a later beat whose `reveal.images` entry points at a different file
   *  than the beat before it. A no-op on every other render, including a
   *  beat change that keeps the same (base or overridden) image. */
  _probeActiveImage() {
    const src = this._activeImage()?.src;
    if (!src || src === this._probedImgSrc) return;
    this._probedImgSrc = src;
    probeImageDimensions(src, this._ctx?.bundleId).then((dims) => {
      // The active image may have moved on again before this resolves
      // (fast beat navigation) — only apply it if it's still current.
      if (dims && this._activeImage()?.src === src) {
        this._imgDims = dims;
        this.requestUpdate();
      }
    });
  }

  /** Re-probes the simulation's SceneClass whenever its src changes — either
   *  the one-time initial mount, or (future-proofing, mirrors
   *  _probeActiveImage()'s reveal.images case) a beat that swaps to a
   *  different simulation src. A no-op on every other render. Resolving the
   *  SceneClass here — ahead of the real mount in _mountSimulation() — is
   *  what lets _resolveSimLayout() know the scene's WIDTH/HEIGHT (design
   *  aspect ratio) before the adaptive layout class is first computed. */
  _probeActiveSimulation() {
    const src = this._data?.simulation?.src;
    if (!src || src === this._probedSimSrc) return;
    this._probedSimSrc = src;
    this._simProbeDone = false;
    SimulationLoader.loadModule(src, this._ctx?.bundleId).then((module) => {
      const SceneClass = SimulationLoader.resolveSceneClass(module);
      // The active simulation may have moved on again before this resolves
      // — only apply it if it's still current (same guard shape as
      // _probeActiveImage()).
      if (SceneClass && this._data?.simulation?.src === src) {
        this._simSceneClass = SceneClass;
        this.requestUpdate();
        // A mount that restored a non-zero ctx.initialStep (resuming a
        // slide left partway through — see ProgressiveDisclosureMixin's own
        // doc comment on its mount-time scroll) may have already run that
        // scroll against the "dimensions not measured yet" fallback layout
        // (blockLayoutClass()'s raw position hint), since this probe — the
        // thing that turns that fallback into the real adaptive
        // right/left/above/below — resolves later, asynchronously.
        // _scrollBeatBlockAlign() needs the real _activeImageLayout to pick
        // the right alignment (e.g. 'below' + a live sim wants 'start', not
        // the default 'center'/'end'), so nudge the scroll again now that
        // render() has applied it.
        //
        // Double rAF, not just updateComplete, and not just one rAF either
        // — both tried, both failed under a real race: LessonSession's own
        // _scrollContentIntoView() (its own doc comment) also scrolls on
        // every slide change, unconditionally, to `#block-container`'s own
        // top — not this beat's — via a single requestAnimationFrame. When
        // this simulation module is already in the module cache (e.g. the
        // student had this slide open before, left, and came back — dynamic
        // import() of an already-loaded module still resolves async, but
        // fast, via microtasks), `updateComplete` alone could resolve
        // *before* the browser even reaches that first rAF's frame, putting
        // this scroll first and LessonSession's second — so LessonSession's
        // cruder scroll fired last and undid this one. Confirmed via a real
        // race simulation, not just theory: portrait broke exactly this way
        // (the sim dropped to ~25% visible) while landscape's side-by-side
        // sticky panel happened to still look fine either way, which is
        // why only portrait was ever reported broken. Queuing behind two
        // animation frames — not merely deferring past microtasks — is what
        // actually guarantees this runs after any single-rAF competitor,
        // regardless of how fast the probe above resolves.
        //
        // Gated on `_step > 0`, unlike the mixin's own trigger (which also
        // checks `_hasRevealedStep`, already true by the time this async
        // callback ever runs, so it can't reuse that same condition): a
        // plain beat-0 mount has nothing to correct and no competing scroll
        // to out-wait, and `_scrollCurrentBeatIntoView()` doesn't leave a
        // step-0 page's natural top-of-page position alone the way the
        // module doc comment above once assumed — `.rv-current`'s own
        // 'center'/'end' fits-check can still nudge the scroll a little
        // even at the top, which showed up as a small (~28px) unwanted
        // shift on every ordinary slide visit before this guard was added.
        if (this._step > 0) {
          requestAnimationFrame(() => requestAnimationFrame(() => this._scrollCurrentBeatIntoView?.()));
        }
      }
    }).catch(() => {
      // _mountSimulation() loads it again and shows the failure on the slide.
    }).finally(() => {
      if (this._data?.simulation?.src === src) { this._simProbeDone = true; this.requestUpdate(); }
    });
  }

  /** A tall board on a phone: fitted to the theatre's stage by height it comes
   *  out too narrow to read or tap, so it takes the page's full width instead
   *  (the strip's Viewing options and Full view stay; the page scrolls). */
  _tallForPhoneStage() {
    if (!this._isNarrowViewport || this._theatre.isMax) return false;
    const dims = this._activeSimDesignDims();
    return !!dims && dims.w / dims.h < PHONE_STAGE_MIN_ASPECT;
  }

  /** Which design size (portrait or landscape) resolveSimLayout() should
   *  size the panel against — the identical condition DomSimulation.setup()
   *  itself will apply once actually mounted (see DomSimulation.js's own
   *  _resolveIsPortrait()), computed here purely from this component's own
   *  state so it doesn't need the scene instance to exist yet. */
  /** The mounted DOM scene's own published aspect (DomSimulation sets
   *  --sim-aspect on its scale wrapper). A LAYOUT 'fit' scene measures its
   *  content, so its real frame can be taller than WIDTH x HEIGHT; the
   *  theatre's camera box must follow that or the foot of the scene (a dial,
   *  a Run button) is cropped. 0 when no DOM scene is mounted. */
  _liveSimAspect() {
    const wrap = this.renderRoot?.querySelector?.('.th-cam .sim-dom-scale-wrap');
    const a = parseFloat(wrap?.style?.getPropertyValue('--sim-aspect') || '');
    return Number.isFinite(a) && a > 0 ? a : 0;
  }

  _theatreAspect(dims) {
    const design = dims ? dims.w / dims.h : 0;
    const live = this._liveSimAspect();
    if (!design) return live;
    return live && live < design ? live : design;
  }

  /** Re-renders the theatre when the scene's published aspect changes (a
   *  fit scene re-measured after a beat or a control). Same aspect: no-op. */
  _watchSimAspect() {
    const wrap = this.renderRoot?.querySelector?.('.th-cam .sim-dom-scale-wrap');
    if (!wrap || wrap === this._aspectWrap) return;
    this._aspectRO?.disconnect();
    this._aspectWrap = wrap;
    this._aspectSeen = this._liveSimAspect();
    this._aspectRO = new ResizeObserver(() => {
      const a = this._liveSimAspect();
      if (a && Math.abs(a - (this._aspectSeen || 0)) > 0.005) { this._aspectSeen = a; this.requestUpdate(); }
    });
    this._aspectRO.observe(wrap);
  }

  _activeSimDesignDims() {
    const SceneClass = this._simSceneClass;
    if (!SceneClass) return null;
    const usePortrait = this._isPortrait && SceneClass.PORTRAIT_WIDTH && SceneClass.PORTRAIT_HEIGHT;
    return usePortrait
      ? { w: SceneClass.PORTRAIT_WIDTH, h: SceneClass.PORTRAIT_HEIGHT }
      : { w: SceneClass.WIDTH, h: SceneClass.HEIGHT };
  }

  /** window.innerHeight minus the sticky header LessonSession publishes
   *  (§1's --lesson-sticky-header-h) minus a small breathing-room margin —
   *  what's actually left for the image once the current beat's own
   *  minimum text budget (resolveImageLayout's own MIN_TEXT_BUDGET_PX) is
   *  set aside. Falls back to a conservative header estimate for contexts
   *  outside LessonSession (manual test harnesses, authoring preview). */
  _availableHeight() {
    if (typeof window === 'undefined') return Infinity;
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--lesson-sticky-header-h');
    // `parseFloat('0px') || 120` would silently replace a legitimately-zero
    // header (LessonSession's own short-landscape mode sets exactly this —
    // see its _publishChromeHeight()'s "correctly collapses to 0" comment)
    // with the 120px fallback meant only for "no header at all in this
    // context" (manual harnesses, authoring preview) — 0 is falsy in JS but
    // is real data here, not a missing value.
    const parsed = parseFloat(raw);
    const headerH = Number.isFinite(parsed) ? parsed : 120;
    // LessonSession's fixed bottom action bar (0 / unset elsewhere).
    const footerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lesson-chrome-bottom')) || 0;
    // Story's diorama head strip sits above the scene (_renderSimulation).
    const sim = this._data?.simulation;
    const stageHeadH = sim?.src && (this.isStoryMode || !sim.fullWidth || sim.title) ? 44 : 0;
    return Math.max(0, window.innerHeight - headerH - footerH - stageHeadH - 40);
  }

  /** Computed once per render() and cached on `this._activeImageLayout` so
   *  `_renderImage()` doesn't recompute it a second time. */
  _resolveImageLayout() {
    const image = this._activeImage();
    if (!image?.src) return null;
    return resolveImageLayout({
      positionHint: image.position || 'right',
      naturalWidth: this._imgDims?.naturalWidth,
      naturalHeight: this._imgDims?.naturalHeight,
      columnWidth: this._columnWidth,
      availableHeight: this._availableHeight(),
      isNarrow: this._isNarrowViewport || this._isShortLandscape,
    });
  }

  /** Mirrors _resolveImageLayout() for the simulation case — see
   *  resolveSimLayout() in blockImageLayout.js. Returns null until
   *  _probeActiveSimulation() has resolved a SceneClass for the active src
   *  (the same one-time "render the raw hint, then re-render adaptively"
   *  fallback the image path already uses). */
  /** Story fit-scene, portrait shape: narration stacked above the scene. */
  get _fitPortrait() {
    return this.isStoryMode && !!this._data?.simulation?.src && !!this._mqFit?.matches && !this._isShortLandscape && !this._theatreOn;
  }

  _resolveSimLayout() {
    const simulation = this._data?.simulation;
    if (!simulation?.src) return null;
    const dims = this._activeSimDesignDims();
    if (!dims) return null;
    const aspect = dims.w / dims.h;
    const result = resolveSimLayout({
      positionHint: this._fitPortrait ? 'below' : (simulation.position || 'below'),
      aspect,
      columnWidth: this._columnWidth,
      // In the fit-scene the narration above shares the viewport, so the
      // scene gets what is left after it (measured in updated()).
      availableHeight: Math.max(160, this._availableHeight() - (this._fitPortrait ? (this._narrH || 0) : 0)),
      // Deliberately _isNarrowViewport only, NOT || _isShortLandscape (unlike
      // _resolveImageLayout() below, which still ORs both — that call is
      // untouched on purpose, see resolveSimLayout()'s own doc comment).
      // _isShortLandscape means "short", not "narrow": a landscape phone is
      // often wider than a portrait one, so treating it as narrow was killing
      // the side-by-side tier in exactly the shape it fits best — a
      // real-course simulation ended up entirely below the fold on a
      // landscape phone with plenty of spare width. Short-landscape's actual
      // constraint (little vertical room) already flows through
      // _availableHeight()'s small budget, which sideFit() already shrinks
      // or bails out of on its own — no separate narrow gate is needed.
      isNarrow: this._isNarrowViewport,
      isPortrait: this._isPortrait,
      // Optional per-scene readability floor (DomSimulation.MIN_SCALE).
      designWidth: dims.w,
      minScale: this._simSceneClass?.MIN_SCALE,
      // `simulation.fullWidth: true` — see resolveSimLayout()'s own doc
      // comment on wideMaxWidthPx. 1400 leaves a little margin inside the
      // lesson shell's own `min(1600px, 94vw)` cap rather than matching it
      // exactly, so a full-width game still reads as inset, not edge-to-edge.
      wideMaxWidthPx: simulation.fullWidth ? 1400 : undefined,
    });
    return this._reserveControlsSpace(result, aspect);
  }

  /** Same adaptive-sizing mechanism as _resolveSimLayout(), simplified: the
   *  design aspect ratio comes straight from the already-in-hand JSON
   *  config's viewBox (PhotoDiagram.resolveViewBox(), same auto-fit
   *  computation PhotoDiagram.plot() itself uses) rather than a scene
   *  module's static WIDTH/HEIGHT, so there's no async probe step and
   *  nothing to reserve room for (a photoDiagram has no CONTROLS bar).
   *  Passes `this._step` through so the resolved aspect ratio matches
   *  PhotoDiagram's own progressive-reveal viewBox at the CURRENT beat, not
   *  the full (eventually fully-revealed) diagram - re-run on every beat
   *  change via render()'s own reactivity, same as the image/simulation
   *  cases already are. */
  _resolvePhotoDiagramLayout() {
    const photoDiagram = this._data?.photoDiagram;
    if (!photoDiagram) return null;
    const [, , vw, vh] = PhotoDiagram.resolveViewBox(photoDiagram, this._step);
    const aspect = vw / vh;
    return resolveSimLayout({
      positionHint: photoDiagram.position || 'right',
      aspect,
      columnWidth: this._columnWidth,
      availableHeight: this._availableHeight(),
      isNarrow: this._isNarrowViewport,
      isPortrait: this._isPortrait,
    });
  }

  _renderPhotoDiagram(photoDiagram) {
    const { widthPx = null } = this._activeImageLayout || {};
    return html`
      <div class="cb-sim-wrap ${this._data.mediaStep > 0 ? 'cb-media-pop' : ''}"
           style="${widthPx ? `max-width:${Math.round(widthPx)}px` : ''}">
        <div class="sim-host-container">
          <div id="photo-diagram-host"></div>
        </div>
      </div>
    `;
  }

  /**
   * Shrinks a side-tier result's widthPx, if needed, to leave room below
   * the media for the active scene's own CONTROLS bar (_renderSimulation()'s
   * `.cb-sim-controls`) once it's actually showing anything — a scene like
   * ShiftSubtractScene gates its whole CONTROLS array behind
   * isControlHidden() until a specific beat (its terminal one), so most
   * beats need no reserve at all. resolveSimLayout()/_resolveMediaLayout()
   * only ever reason about the *media*'s own aspect-ratio-driven height,
   * with no idea `.cb-sim-wrap` can carry this second, variable-height
   * element below it — without this, a side panel sized to exactly fill the
   * height budget with its media alone has nothing left the moment its
   * controls become visible, pushing the whole sticky panel taller than the
   * viewport.
   *
   * The reserve itself is `_measureSimControls()`'s real, live measurement
   * of the bar's actual rendered height (plus its gap/margin) — not a
   * guess. Two guesses were tried and both failed on real short-landscape
   * phone sizes (not just one synthetic test size): a single-row estimate
   * (~76px) undercounted once a narrow panel wrapped the bar onto two rows,
   * still overflowing; a worst-case two-row estimate (~130px) overcounted
   * whenever the bar *didn't* wrap, shrinking the panel more than needed
   * (the "cramped" report this replaces) while leaving dead space between
   * the media and the bar (the "large gap" report this also replaces) — a
   * fixed guess can't simultaneously fit both cases because the bar's own
   * height depends on the very width being solved for. Before any
   * measurement exists yet (this render's first paint), SIM_CONTROLS_RESERVE_PX
   * is a single-row-sized starting guess only — _measureSimControls()
   * corrects it (in both directions, wider or narrower) once the real bar
   * has actually painted, self-resolving within a render or two.
   *
   * Not folded into resolveSimLayout()'s own budget up front, on purpose:
   * on a real (short, not just narrow) landscape phone the reserve is often
   * close to the *entire* remaining height budget, so reserving it before
   * sideFit() ever runs flipped its feasibility check to failure outright —
   * side-by-side stopped being chosen at all, on most real phone sizes, not
   * just shrinking a bit. Reserving after, as a dedicated shrink on an
   * already-side-tier result, leaves sideFit()'s own feasibility check
   * exactly as permissive as before. 'below'/'above' need no equivalent:
   * they just grow the page a little taller for the controls, no sticky/
   * height-fit requirement to violate.
   */
  /** Height to set aside below the panel for the scene's CONTROLS bar: 0 when
   *  it has none or none is showing right now, else the live measurement (or
   *  the single-row starting guess before one exists). */
  _visibleControlsReserve() {
    const ctrls = this._sceneClass?.CONTROLS;
    if (!ctrls?.length) return 0;
    const hasVisibleControl = typeof this._scene?.isControlHidden === 'function'
      ? ctrls.some((ctrl) => !this._scene.isControlHidden(ctrl.id))
      : false;
    if (!hasVisibleControl) return 0;
    return this._measuredControlsHeight ?? SIM_CONTROLS_RESERVE_PX;
  }

  /** For a scene with DomSimulation.FILL_HEIGHT: how tall (screen px) its
   *  frame may be right now. Only a SIDE panel is height-budgeted (it is
   *  sticky and must fit the viewport); a stacked panel just grows the page,
   *  so it gets null and keeps its plain frame. One-way: the panel is sized
   *  from the static design first, this only tells the scene how much extra
   *  height exists - nothing here reads the scene's own size. */
  _simFillHeight() {
    const layout = this._activeImageLayout?.layout;
    if (layout !== 'right' && layout !== 'left') return null;
    const budget = this._availableHeight();
    if (!Number.isFinite(budget)) return null;
    // In the theatre the camera box hugs the scene's design aspect
    // (StoryTheatre._fit), so a frame filled past that box was cropped at
    // its foot (a dial or a Run button cut off). There the camera box is
    // the budget.
    if (this._theatreOn) {
      const cam = this.renderRoot?.querySelector?.('.th-cam');
      const camH = cam?.clientHeight || 0;
      if (camH > 0) return Math.min(budget, camH);
    }
    return budget - this._visibleControlsReserve();
  }

  _reserveControlsSpace(result, aspect) {
    if (!result || (result.layout !== 'right' && result.layout !== 'left')) return result;
    if (result.widthPx == null) return result;
    const reserve = this._visibleControlsReserve();
    if (!reserve) return result;
    const overflow = (result.widthPx / aspect + reserve) - this._availableHeight();
    if (overflow <= 0) return result;
    return { ...result, widthPx: Math.max(0, result.widthPx - overflow * aspect) };
  }

  /** Measures the real gap between the media and the bottom of the CONTROLS
   *  bar (_renderSimulation()'s `.cb-sim-controls`) — its own height plus
   *  whatever gap/margin sits between it and `.sim-host-container` above it
   *  — and caches it as `_measuredControlsHeight` for `_reserveControlsSpace()`
   *  to use instead of a guess. `null` (not 0) when there's no controls bar
   *  in the DOM right now (hidden, or the scene has none), so
   *  `_reserveControlsSpace()`'s own `?? SIM_CONTROLS_RESERVE_PX` fallback
   *  applies correctly next time a bar does appear, rather than reusing a
   *  stale measurement from a previous beat. Triggers a re-render only when
   *  the measurement actually changed (new controls appeared/disappeared,
   *  or the bar wrapped/unwrapped between one and two rows) — cheap and
   *  self-limiting, not a layout loop: a re-render changes widthPx, which
   *  can change wrapping, which is exactly the case this needs to catch,
   *  but wrapping only has two states, so this settles in at most one
   *  extra pass. */
  _measureSimControls() {
    const host = this.shadowRoot?.querySelector('.sim-host-container');
    const controls = this.shadowRoot?.querySelector('.cb-sim-controls');
    let next = (host && controls)
      ? Math.round(controls.getBoundingClientRect().bottom - host.getBoundingClientRect().bottom)
      : null;
    if (next === this._measuredControlsHeight) return;
    // Flip-flop guard: the reserve narrows the panel, and narrowing can change
    // whether the bar wraps, so a bar whose wrap threshold lies between the two
    // widths measures A, then B, then A... forever (each re-render flips it).
    // Seeing the value from two measurements ago again means exactly that:
    // settle on the larger (wrapped) reserve, which cannot overflow.
    if (next != null && this._measuredControlsHeight != null && next === this._priorControlsHeight) {
      next = Math.max(next, this._measuredControlsHeight);
      if (next === this._measuredControlsHeight) return;
    }
    this._priorControlsHeight = next == null ? null : this._measuredControlsHeight;
    this._measuredControlsHeight = next;
    if (this._activeImageLayout?.layout === 'right' || this._activeImageLayout?.layout === 'left') {
      this.requestUpdate();
    }
  }

  /** Real rendered height of the side panel (`.cb-sim-wrap` or
   *  `.cb-image-wrap` — only one is ever in the DOM at once) that
   *  `.cb-layout-right`/`.cb-layout-left .cb-text`'s `padding-bottom` (see
   *  that rule's own doc comment in this class's static styles) reserves
   *  room for, so the panel's `position: sticky` never runs out of
   *  container room while the student is still reading. `null` — not 0 —
   *  outside a sticky layout, so the CSS var's own `var(--x, 0px)` fallback
   *  applies and this measurement never fights a layout it doesn't apply
   *  to. Recomputed on every update alongside _measureSimControls(), same
   *  reasoning: cheap, and a no-op unless the number actually changed. Not
   *  derived from the aspect-ratio math `_resolveSimLayout()`/
   *  `_resolveImageLayout()` already do — that gives the *media*'s own
   *  height, not the wrap's, which also carries a caption/credit line and,
   *  for a simulation, the CONTROLS bar `_reserveControlsSpace()` already
   *  budgets width (not height) for; measuring the wrap directly is exactly
   *  as reliable as _measureSimControls() already is for the same reason. */
  _measureStickyMediaHeight() {
    const sticky = this._activeImageLayout?.layout === 'right' || this._activeImageLayout?.layout === 'left';
    const wrap = sticky ? this.shadowRoot?.querySelector('.cb-sim-wrap, .cb-image-wrap') : null;
    this._observeStickyMedia(wrap);
    const next = wrap ? Math.round(wrap.getBoundingClientRect().height) : null;
    if (next === this._measuredStickyMediaHeight) return;
    this._measuredStickyMediaHeight = next;
    // Set directly on the host — a custom property crosses this element's
    // own Shadow DOM boundary to reach `.cb-text` the same way
    // --lesson-sticky-header-h already crosses LessonSession's, so this
    // doesn't need templating into render()'s own markup.
    if (next != null) {
      this.style.setProperty('--cb-sticky-media-h', `${next}px`);
    } else {
      // Removed, not set to '' — an explicitly-empty custom property is
      // still "set" for var()'s purposes, which would skip the CSS rule's
      // own var(--cb-sticky-media-h, 0px) fallback instead of using it.
      this.style.removeProperty('--cb-sticky-media-h');
    }
  }

  /** Re-measures whenever the sticky panel itself changes size. A simulation
   *  may resize its own design rectangle while the student works (a key that
   *  grows a row per answer), and nothing in this element re-renders for
   *  that, so the padding reserved from the first measurement would go stale
   *  and the panel would run out of sticky room again on the last beat.
   *  The callback only ever sets a custom property on the host, never the
   *  wrap's own size, so it cannot feed back into itself. */
  _observeStickyMedia(wrap) {
    if (wrap === this._stickyObserved) return;
    if (!this._stickyRO) this._stickyRO = new ResizeObserver(() => this._measureStickyMediaHeight());
    if (this._stickyObserved) this._stickyRO.unobserve(this._stickyObserved);
    this._stickyObserved = wrap || null;
    if (wrap) this._stickyRO.observe(wrap);
  }

  /** Resolution order: an explicit per-block `simulation.frame` hint always
   *  wins; otherwise fall back to the scene's own declared default
   *  (DomSimulation.FRAMELESS); otherwise 'card' — today's exact behavior,
   *  and always visually safe before _simSceneClass has resolved. */
  _resolveSimFrame() {
    const hint = this._data?.simulation?.frame; // 'card' | 'none' | undefined
    if (hint === 'card' || hint === 'none') return hint;
    return this._simSceneClass?.FRAMELESS ? 'none' : 'card';
  }

  /** Wires (or re-wires, on every beat change) an IntersectionObserver over
   *  this beat's `<!-- CUE:id --> anchors, so a `DomSimulation` scene's
   *  optional `onCue(cueId)` fires as each anchor scrolls into view — see
   *  docs/sprints/wip/dom-simulation-auto-layout.md §12. */
  async _wireCueObserver() {
    this._cueObserver?.disconnect();
    this._cueObserver = null;
    (this._cueTimers || []).forEach(clearTimeout);
    this._cueTimers = [];
    this._firedCueIds = new Set();
    // Narrated, the narration's own word times fire the cues (fireCue below).
    if (this.narrated) return;
    const stepEl = this.shadowRoot?.querySelector('.rv-step.rv-current markdown-renderer');
    if (!stepEl || !this._scene) return;
    await stepEl.whenRendered();
    const anchors = [...(stepEl.shadowRoot?.querySelectorAll('.cb-cue-anchor') || [])];
    if (!anchors.length) return;

    const container = stepEl.shadowRoot.getElementById('content-container');
    const fire = (anchor) => {
      const id = anchor.dataset.cueId;
      if (this._firedCueIds.has(id)) return;
      this._firedCueIds.add(id);
      this._scene.onCue?.(id);
    };

    // Hybrid: whichever happens first — real scroll-reveal, or a capped
    // minimum floor derived from words-before-the-cue (measured live off the
    // rendered DOM via Range — no separate offset-extraction pass needed).
    anchors.forEach((a) => {
      const range = document.createRange();
      range.selectNodeContents(container);
      range.setEndBefore(a);
      const words = range.toString().trim().split(/\s+/).filter(Boolean).length;
      const floorMs = Math.min(CUE_MIN_DELAY_CAP_MS, words * CUE_MIN_DELAY_PER_WORD_MS);
      this._cueTimers.push(setTimeout(() => fire(a), floorMs));
    });

    this._cueObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) fire(e.target); });
    }, { threshold: 0.1 });
    anchors.forEach((a) => this._cueObserver.observe(a));
  }

  // ── Narration contract (LessonEngine narration hooks; feature-detected) ──

  /** Prose <-> captions. Never remounts the scene: the same host, the same
   *  scene instance, only the text column is hidden (CSS on :host([narrated]))
   *  and the theatre stops sharing its space with it. */
  setNarrated(on) {
    on = !!on;
    if (on === this.narrated) return;
    this.narrated = on;
    this._theatre.narrated = on;
    // Text mode re-arms this beat's CUE anchors; narrated mode drops them.
    // Cues already fired this beat stay fired, so nothing plays twice.
    const fired = this._firedCueIds;
    this._wireCueObserver();
    if (fired) fired.forEach((id) => this._firedCueIds.add(id));
    this.requestUpdate();
    if (on && !this._theatreOn) this.updateComplete.then(() => this._showPictureTop());
  }

  /**
   * Narrated outside the theatre (a phone in portrait): with the prose gone,
   * a page scrolled for a later beat can leave the picture's top, and the
   * caption band above it, under the sticky header. Bring them back.
   */
  _showPictureTop() {
    const wrap = this.shadowRoot?.querySelector('[class*="cb-layout-"] > .cb-sim-wrap, [class*="cb-layout-"] > .cb-image-wrap');
    if (!wrap || !this.isConnected) return;
    const sticky = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lesson-sticky-header-h')) || 0;
    const band = parseFloat(getComputedStyle(wrap).marginTop) || 0;
    const dy = wrap.getBoundingClientRect().top - band - sticky - 8;
    if (dy < 0) window.scrollBy({ top: dy, behavior: 'instant' });
  }

  /** A narration cue: the scene's onCue(id), once per beat (shared with CUE anchors). */
  fireCue(id) {
    if (!id || !this._scene) return;
    if (!this._firedCueIds) this._firedCueIds = new Set();
    if (this._firedCueIds.has(id)) return;
    this._firedCueIds.add(id);
    this._scene.onCue?.(id);
  }

  /**
   * The word being spoken, lit in the current beat's prose (a text slide
   * keeps its prose narrated, with no caption). Harmless where the prose is
   * hidden behind a picture. seg null clears it.
   */
  narrationWord(seg, wi) {
    const cur = this._narrProse();
    if (this._narrWordEl && this._narrWordEl !== cur) this._narrWordEl.narrationWord?.(null, -1);
    this._narrWordEl = cur || null;
    return cur?.narrationWord?.(seg, wi) || false;
  }

  /** The current beat's prose renderer (text slide), or null. */
  _narrProse() {
    return this.shadowRoot?.querySelector('.rv-step.rv-current markdown-renderer, .story-bubble.rv-current markdown-renderer') || null;
  }

  /** Beat time for a time-pure scene: static SEEKABLE + seek(beat, ms). */
  narrationSeek(beat, ms) {
    const sc = this._scene;
    if (sc?.constructor?.SEEKABLE && typeof sc.seek === 'function') sc.seek(beat, ms);
  }

  /** The scene's own getState(), for LessonEngine to hand back on remount. */
  sceneState() {
    return typeof this._scene?.getState === 'function' ? this._scene.getState() : undefined;
  }

  /**
   * Where the caption overlay may go, in viewport px, for LessonSession's
   * <narration-overlay>: the picture's box (`stage`), the box it sits in
   * (`area`: the theatre's slot, else this block), and the scene's own free
   * corner (`free`, from an optional scene freeRect() in 0..1 of its host).
   * kind: 'scene' | 'media' | 'text' (no picture: the prose stays and
   * lights the spoken word in place, `inPlace`, so no caption is shown).
   * A text beat whose segment `seg` does not read the prose (a teacher
   * script) is not inPlace: its stage is the current beat's box, and the
   * caption keeps off it.
   */
  narrationStage(seg) {
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
    };
    const root = this.shadowRoot;
    const host = root?.getElementById('sim-canvas-host');
    // The theatre's window (scene plus its head strip and controls): captions keep off all of it.
    const stage = this._theatreOn ? rect(root?.querySelector('.th-win')) || rect(root?.querySelector('.th-stage')) : rect(host?.closest('.cb-sim-wrap') || host?.closest('.sim-host-container') || host);
    if (stage) {
      const area = this._theatreOn ? rect(root.querySelector('.th-slot')) || rect(root.querySelector('.th')) : rect(this);
      let free = null;
      const fr = this._scene?.freeRect?.();
      const hr = rect(host) || stage;
      if (fr && [fr.x, fr.y, fr.w, fr.h].every(Number.isFinite) && fr.w > 0 && fr.h > 0) {
        free = {
          left: hr.left + fr.x * hr.width, top: hr.top + fr.y * hr.height,
          width: fr.w * hr.width, height: fr.h * hr.height,
        };
        free.right = free.left + free.width;
        free.bottom = free.top + free.height;
      }
      return { kind: 'scene', stage, area, free, proseHidden: true };
    }
    const media = rect(root?.querySelector('.cb-image-wrap, .cb-sim-wrap'));
    if (media) return { kind: 'media', stage: media, area: rect(this), free: null, proseHidden: true };
    // A scripted beat says something other than the prose: caption, off the current beat.
    const prose = this._narrProse();
    if (seg && prose?.narrationReadsProse && !prose.narrationReadsProse(seg)) {
      const beat = prose.closest('.rv-step, .story-bubble') || prose;
      return { kind: 'text', stage: rect(beat) || rect(this), area: rect(this), free: null, proseHidden: false, inPlace: false };
    }
    // inPlace: the prose stays and lights the spoken word itself, so no caption.
    return { kind: 'text', stage: rect(this), area: rect(this), free: null, proseHidden: false, inPlace: true };
  }

  // ── Step contract (consumed by LessonEngine; feature-detected) ────────────

  /**
   * `data.poeRole: "observe"|"explain"` marks this block as the reveal point
   * for whatever prediction was made immediately before it — see
   * docs/HighLevelDesign.md §8 and POEController.recall(). Renders nothing
   * if untagged, or if there's no matching pending prediction (e.g. this
   * block isn't actually right after a poe-predict@1, or the student
   * navigated here some other way).
   */
  // ── Plain look: the editorial page (look pack plain SPEC sec 2) ─────────

  /** Plain, Classic, inside a lesson whose head shows the slide title. */
  _plainPage() {
    return this.look === 'plain' && !this.isStoryMode && this._ctx?.slideHead === true;
  }

  /** Under plain the slide's opening heading is the lesson head's title
   *  (LessonSession, same rule: core/markdown/slideTitle.js), so the first
   *  renderer that opens with it drops it. */
  _beatMarkdown(md, i) {
    // Narrated, the plain head drops the slide title (LessonSession, Q-17), so
    // the slide keeps its own heading, as under Quill.
    if (!this._plainPage() || this.narrated) return md;
    // Every width: the sticky lesson head shows the slide title on a phone
    // too (LessonSession _renderPlainHead), so keeping it here printed it twice.
    const at = this._header && leadingHeading(this._header) ? -1 : 0;
    return i === at ? stripLeadingHeading(md) : md;
  }

  /**
   * Optional `fold: { after: N }` (plain page only): the first N beats step
   * as usual; the beats after them are not stepped but sit, once the Nth is
   * shown, behind one closed "Read more" disclosure (details/summary, so it
   * is keyboard-operable and announced as expanded/collapsed). The prose is
   * untouched: the folded beats render through the same markdown-renderer,
   * the first folded beat's own heading becomes the summary, and printing
   * opens every fold. Quill, Story and a bare preview ignore the field, so
   * every beat steps exactly as before.
   */
  _applyFold(data) {
    this._foldSteps = [];
    const after = data?.fold?.after;
    if (!this._plainPage() || !Number.isInteger(after) || after < 1 || after >= this._steps.length) return;
    this._foldSteps = this._steps.slice(after);
    this._steps = this._steps.slice(0, after);
    this._step = Math.min(this._step, this._steps.length - 1);
    if (!this._onPrint) {
      this._onPrint = () => {
        this._printOpened = [...(this.shadowRoot?.querySelectorAll('details.cb-fold:not([open])') || [])];
        for (const d of this._printOpened) d.open = true;
      };
      this._onPrinted = () => { for (const d of this._printOpened || []) d.open = false; this._printOpened = null; };
      window.addEventListener('beforeprint', this._onPrint);
      window.addEventListener('afterprint', this._onPrinted);
    }
  }

  /** The folded beats (see _applyFold), shown once the last stepped beat is. */
  _renderFoldTail(done) {
    const folded = this._foldSteps;
    if (!folded?.length || !done) return '';
    const head = leadingHeading(folded[0].md);
    const label = head ? `Read more: ${head}` : 'Read more';
    const mathColors = this._data?.mathColors || null;
    return html`
      <details class="cb-fold">
        <summary><span class="cb-fold-label">${label}</span></summary>
        <div class="cb-fold-body">
          ${folded.map((s, i) => html`<markdown-renderer
            .content=${i === 0 && head ? stripLeadingHeading(s.md) : s.md}
            .mathColors=${mathColors}
            .glossaryBundle=${this._ctx?.bundleId}
          ></markdown-renderer>`)}
        </div>
      </details>
    `;
  }

  /** "Fig. <lesson>.<slide>" before a caption, under plain only. */
  _figNo() {
    if (!this._plainPage()) return '';
    const slide = Number.isInteger(this._ctx?.blockIndex) ? this._ctx.blockIndex + 1 : null;
    if (!slide) return '';
    const lesson = Number(this._ctx?.lessonNumber) > 0 ? `${this._ctx.lessonNumber}.` : '';
    return html`<span class="fig-no">Fig. ${lesson}${slide}</span>`;
  }

  /**
   * Layout aspect for the renderer form of the figure field: 1.5 until the
   * course module's optional aspect(data) is known, then one requestUpdate.
   * Cached per figure object (a new figure fetches again).
   */
  _figFieldRendererAspect(figField) {
    const c = this._figRendererAspect;
    if (c.figure !== figField) {
      c.figure = figField;
      c.value = null;
      rendererAspect(figField, this._ctx?.bundleId).then((a) => {
        if (c.figure !== figField || a == null || a === 1.5) return;
        c.value = a;
        this.requestUpdate();
      });
    }
    return c.value ?? 1.5;
  }

  /** The caption line under a figure, or '' when the block has none. */
  _captionHtml(caption) {
    const text = caption?.en || caption;
    if (!text || typeof text !== 'string') return '';
    return html`${this._figNo()}${text}`;
  }

  /** Marks the beat renderers for the plain page: data-look for their pull
   *  quotes and notes, and the drop cap on the first paragraph of a lesson's
   *  first slide. Attributes only, set after render; Quill gets none. */
  _markRenderers() {
    const root = this.shadowRoot;
    if (!root) return;
    const plain = this._plainPage();
    const first = plain && this._ctx?.blockIndex === 0
      ? root.querySelector('.rv-steps > .rv-step:first-child > markdown-renderer')
      : null;
    for (const r of root.querySelectorAll('markdown-renderer')) {
      if (plain) r.setAttribute('data-look', 'plain');
      else r.removeAttribute('data-look');
      r.toggleAttribute('dropcap', r === first);
    }
  }

  /**
   * Story mode tells the same beats as Quill speaking (prototype v2 b/,
   * owner decision 2026-10-06: all prose in Quill's bubble): the slide title,
   * a Quill row, ONE speech bubble holding only the current beat, and the
   * beats already read folded into "The story so far". Same steps, same
   * advance/retreat/revealAll contract, same A11yAnnouncer announcements; only
   * the presentation differs. Classic keeps the mixin's stacked beats.
   */
  _renderSteps() {
    if (!this.isStoryMode) return super._renderSteps();
    const mathColors = this._data?.mathColors || null;
    const bundle = this._ctx?.bundleId;
    const cur = this._steps[this._step];
    const past = this._steps.slice(0, this._step);
    const narrator = brandCopy('narrator');
    const speaker = this._storySpeaker(cur?.md);
    const side = speaker?.side === 'right' ? 'speaker-right' : '';
    return html`
      ${this._header
        ? html`<markdown-renderer class="cb-header story-title" .content=${this._header} .mathColors=${mathColors} .glossaryBundle=${bundle}></markdown-renderer>`
        : ''}
      ${speaker ? html`
        <div class="story-quill-row ${side}">
          <span class="story-quill" aria-hidden="true">${speaker.el}</span>
          <span class="story-quill-name">${speaker.label}</span>
        </div>
      ` : html`
        <div class="story-quill-row" aria-hidden="true">
          <companion-slot class="story-quill" size="sm"></companion-slot>
          ${narrator ? html`<span class="story-quill-name">${narrator}</span>` : ''}
        </div>
      `}
      <div class="story-bubble rv-current ${side} ${cur?.callout ? `story-callout-${cur.callout}` : ''}" data-step-id=${cur?.id ?? ''}>
        <div class="story-bubble-inner">
          ${this._data?.poeRecapStep === this._step ? this._renderPoeRecap(true) : ''}
          ${cur ? html`<markdown-renderer .content=${speaker ? speaker.md : cur.md} .mathColors=${mathColors} .glossaryBundle=${bundle}></markdown-renderer>` : ''}
        </div>
      </div>
      ${past.length ? html`
        <details class="so-far">
          <summary><span class="so-far-caret" aria-hidden="true"></span>The story so far</summary>
          <div class="scroll-paper">
            ${past.map((st) => html`<div class="old-beat"><markdown-renderer .content=${st.md} .mathColors=${mathColors}></markdown-renderer></div>`)}
          </div>
        </details>
      ` : ''}
    `;
  }

  /**
   * Story mode, a course with a story cast (core/cast/): a beat that opens
   * with `<!-- SAY id [mood] -->` is that character speaking, so the
   * narrator row shows them (at that mood, with their name) and the marker
   * is taken off the beat's text, which then reads as the big bubble itself
   * rather than a bubble inside it. null for any other beat, an id the cast
   * does not know, or no cast: the row is the look's companion as always.
   */
  _storySpeaker(md) {
    const cast = LookManager.cast();
    if (!cast || typeof md !== 'string') return null;
    const m = /^\s*(<!--[^>]*-->)[ \t]*(?:\r?\n[ \t]*)*/.exec(md);
    const say = m && parseSay(m[1]);
    const ch = say && cast.chars?.[say.id];
    if (!ch || !cast.tags?.[say.id]) return null;
    const rest = md.slice(m[0].length);
    if (!rest.trim()) return null;
    const cache = (this._speakerEls ||= new Map());
    let el = cache.get(say.id);
    if (!el || el.localName !== cast.tags[say.id]) {
      el = document.createElement(cast.tags[say.id]);
      el.setAttribute('size', 'sm');
      cache.set(say.id, el);
    }
    if (say.mood) el.setAttribute('mood', say.mood);
    else el.removeAttribute('mood');
    return { el, label: ch.label, side: say.id === cast.narrator ? 'left' : 'right', md: rest };
  }

  /**
   * cue:reveal for a POE recap: the verdict on the earlier prediction is on
   * screen. Once per companion element (the verdict chip's, and Story's
   * narrator on a recap slide), from updated() so it lands before first paint.
   */
  _cueReveal() {
    const recap = this._data?.poeRole ? this._ctx?.poe?.recall(this._ctx.blockIndex) : null;
    if (!recap) return;
    const seen = (this._revealCued ||= new WeakSet());
    this.shadowRoot?.querySelectorAll('.cb-poe-quill, .story-quill').forEach((slot) => {
      if (seen.has(slot)) return;
      seen.add(slot);
      emitCue(CUES.REVEAL, { correct: !!recap.isCorrect, companion: slot.companion });
    });
  }

  _renderPoeRecap(fromStep = false) {
    if (!this._data?.poeRole) return html``;
    // If the author tied this recap to a specific beat, and we are calling this
    // from the top level (render()), don't render it here.
    if (!fromStep && typeof this._data.poeRecapStep === 'number') return html``;
    
    const payload = this._ctx?.poe?.recall(this._ctx.blockIndex);
    if (!payload) return html``;
    const predictionText = payload.predictionText || payload.prediction || '';
    // The verdict chip (prototype v2 a/ .verdict-chip): the companion's face
    // is the look's call (cue:reveal, _cueReveal()); the verdict word carries
    // the colour.
    return html`
      <div class="cb-poe-recap ${payload.isCorrect ? 'good' : 'bad'}">
        <companion-slot class="cb-poe-quill" size="mini"></companion-slot>
        <p>
          <strong>You predicted:</strong> ${predictionText}
          <span class="cb-poe-verdict ${payload.isCorrect ? 'correct' : 'incorrect'}">
            ${payload.isCorrect ? 'Correct!' : 'Not quite.'}
          </span>
        </p>
      </div>
    `;
  }

  /** The scene's CONTROLS bar (buttons, sliders, selects...), or '' when none is showing. */
  _renderSimControls(compactControls) {
    let controlsHtml = '';
    // A scene whose controls are all hidden (e.g. beat-locked — see
    // isControlHidden()'s _isBeatLocked() gate) has nothing to put in the
    // bar; skip the wrapper entirely rather than rendering an empty
    // full-width strip with just its own padding/background showing.
    const hasVisibleControl = (ctrls) => ctrls.some((ctrl) =>
      !(typeof this._scene?.isControlHidden === 'function' && this._scene.isControlHidden(ctrl.id)));
    if (this._sceneClass && this._sceneClass.CONTROLS && hasVisibleControl(this._sceneClass.CONTROLS)) {
      const controls = this._sceneClass.CONTROLS;

      const renderedItems = controls.map(ctrl => {
        const isHidden = typeof this._scene?.isControlHidden === 'function' ? this._scene.isControlHidden(ctrl.id) : false;
        if (isHidden) return html``;

        if (ctrl.type === 'button') {
          const isActive = this._scene?.mode === ctrl.id;
          const isDisabled = typeof this._scene?.isControlDisabled === 'function' ? this._scene.isControlDisabled(ctrl.id) : false;
          
          const bg = (isActive && ctrl.activeBg) ? ctrl.activeBg : (ctrl.inactiveBg && !isActive ? ctrl.inactiveBg : 'var(--primary-color)');
          const btnClass = `cb-sim-btn${isActive ? ' active' : ''}${(ctrl.inactiveBg && !isActive) ? ' tinted' : ''}${isDisabled ? ' disabled' : ''}${compactControls ? ' compact' : ''}`;
          const btnStyle = bg === 'var(--primary-color)' ? '' : `--cb-btn-bg: ${bg}`;
          return html`
            <button class="${btnClass}" style="${btnStyle}"
                    ?disabled="${isDisabled}"
                    @click="${() => {
                      if (isDisabled) return;
                      this._scene?.onControlChange(ctrl.id, true);
                      this.requestUpdate();
                      if (ctrl.id === 'reset') {
                        const sliders = this.shadowRoot.querySelectorAll('.cb-sim-range');
                        sliders.forEach(s => {
                          const sliderDef = controls.find(c => c.id === s.id);
                          const resetValue = sliderDef?.value ?? 50;
                          const suffix = sliderDef?.suffix ?? '';
                          s.value = resetValue;
                          const valSpan = this.shadowRoot.getElementById(`val-${s.id}`);
                          if (valSpan) valSpan.textContent = `${resetValue}${suffix}`;
                        });
                      }
                    }}">
              ${ctrl.id === 'play' ? html`
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="cb-sim-btn-icon">
                  <path d="${this._scene?.isPlaying ? 'M6 19h4V5H6v14zm8-14v14h4V5h-4z' : 'M8 5v14l11-7z'}"/>
                </svg>
                <span>${this._scene?.isPlaying ? 'Pause' : 'Play'}</span>
              ` : (ctrl.label || 'Action')}
            </button>
          `;
        } else if (ctrl.type === 'slider' || ctrl.type === 'range') {
          const valId = `val-${ctrl.id}`;
          // Shown value: what the scene says it holds (getControlValue), else the declared `value`, else 50.
          const cur = controlCurrent(this._scene, ctrl) ?? 50;
          return html`
            <div class="cb-sim-slider-row">
              <label class="cb-sim-slider-label">${ctrl.label || ctrl.id}</label>
              <input id="${ctrl.id}" type="range" class="cb-sim-range" min="${ctrl.min ?? 0}" max="${ctrl.max ?? 100}" step="${ctrl.step ?? 1}" .value="${cur}"
                     style="${ctrl.trackGradient ? `background: ${ctrl.trackGradient};` : ''}"
                     @input="${(e) => {
                       const display = this.shadowRoot.getElementById(valId);
                       if (display) display.textContent = `${e.target.value}${ctrl.suffix ?? ''}`;
                       this._scene?.onControlChange(ctrl.id, e.target.value);
                       // A scene may refuse or snap the value: the thumb and its label go where the scene went.
                       const held = this._scene?.getControlValue?.(ctrl.id);
                       if (held != null && Number(held) !== Number(e.target.value)) {
                         e.target.value = held;
                         if (display) display.textContent = `${held}${ctrl.suffix ?? ''}`;
                       }
                       this.requestUpdate();
                     }}">
              <!-- .textContent, not a text child: the @input handler above writes the
                   label directly, which would delete a Lit text part's node. -->
              <span id="${valId}" class="cb-sim-slider-value" .textContent="${`${cur}${ctrl.suffix ?? ''}`}"></span>
            </div>
          `;
        } else if (ctrl.type === 'select') {
          const cur = controlCurrent(this._scene, ctrl);
          return html`
            <div class="cb-sim-slider-row">
              <label class="cb-sim-slider-label">${ctrl.label || ctrl.id}</label>
              <select id="${ctrl.id}" class="cb-sim-field"
                      @change="${(e) => this._scene?.onControlChange(ctrl.id, e.target.value)}">
                ${(ctrl.options || []).map(opt => html`
                  <option value="${optValue(opt)}" .selected="${cur !== undefined && String(optValue(opt)) === String(cur)}">${optLabel(opt)}</option>
                `)}
              </select>
            </div>
          `;
        } else if (ctrl.type === 'number') {
          // Deliberately @change (fires on blur/Enter), not @input (every keystroke) —
          // a number the student is actively typing shouldn't re-render the scene
          // mid-digit, unlike a slider's @input which is fine to fire continuously.
          return html`
            <div class="cb-sim-slider-row">
              <label class="cb-sim-slider-label">${ctrl.label || ctrl.id}</label>
              <input id="${ctrl.id}" type="number" min="${ctrl.min ?? ''}" max="${ctrl.max ?? ''}" step="${ctrl.step ?? 1}"
                     placeholder="${ctrl.placeholder ?? ''}" .value="${controlCurrent(this._scene, ctrl) ?? ''}"
                     class="cb-sim-field number"
                     @change="${(e) => this._scene?.onControlChange(ctrl.id, e.target.value)}"
                     @keydown="${(e) => { if (e.key === 'Enter') e.target.blur(); }}">
              ${ctrl.suffix ? html`<span class="cb-sim-suffix">${ctrl.suffix}</span>` : ''}
            </div>
          `;
        }
        // toggle / checkbox / segmented: one shared renderer (simulationHost.js).
        return renderExtendedControl(
          ctrl, this._scene, (id, v) => this._scene?.onControlChange(id, v), () => this.requestUpdate(),
          typeof this._scene?.isControlDisabled === 'function' ? this._scene.isControlDisabled(ctrl.id) : false,
          compactControls);
      });

      controlsHtml = html`
        <div class="cb-sim-controls ${compactControls ? 'compact' : ''}">
          ${renderedItems}
        </div>
      `;
    }

    return controlsHtml;
  }

  _renderSimulation(simulation) {
    if (!simulation?.src) return html``;
    const widthPx = this._activeImageLayout?.widthPx ?? null;
    const frame = this._resolveSimFrame();
    // The simulation itself is the point of the slide; its own CONTROLS bar
    // is secondary and, unlike the media, isn't scaled by a design aspect
    // ratio at all — it's built from fixed CSS px, so on a narrow side
    // panel (a short-landscape phone, mainly) it was the one thing NOT
    // shrinking to fit, forcing _reserveControlsSpace() to shrink the media
    // around it instead. Below the threshold, the bar shrinks itself
    // (smaller buttons/padding/gaps) rather than costing the media any more
    // width than the layout resolver already gave it. 400 is comfortably
    // above every side-tier width this scene resolves to on a phone and
    // below every one it resolves to on tablet/desktop (see
    // _reserveControlsSpace()'s own doc comment for the widths measured).
    const compactControls = widthPx != null && widthPx < 400;

    const controlsHtml = this._renderSimControls(compactControls);
    // The theatre's strip buttons (Viewing options, Full view) in the
    // scrolling-page layout too, so either look can switch back to the split.
    // Classic's fullWidth games keep their plain title strip.
    const thHead = this.isStoryMode || !simulation.fullWidth;
    const title = simulation.title?.en || simulation.title;

    return html`
      <div class="cb-sim-wrap ${(this._data.mediaStep > 0 || Number.isInteger(this._data.simulationStep)) ? 'cb-media-pop' : ''} ${thHead ? 'has-th-opts' : ''}"
           style="${widthPx ? `max-width:${Math.round(widthPx)}px` : ''}">
        ${frame !== 'none' && (thHead || title) ? html`
          <div class="cb-stage-head">
            ${this.isStoryMode ? html`<span class="cb-stage-kicker">Diorama &middot; live</span>` : ''}
            ${title ? html`<span>${title}</span>` : ''}
            ${thHead ? this._theatre.renderHeadButtons({ inTheatre: false }) : html`<span class="cb-stage-tag">Simulation</span>`}
          </div>
        ` : ''}
        ${thHead && this._theatre.optsOpen ? this._theatre.renderOptions() : ''}
        <div class="sim-host-container ${frame === 'none' ? 'sim-host-container--frameless' : this._simSceneClass?.FRAME_STYLE === 'cabinet' ? 'sim-host-container--cabinet' : ''}">
          <div id="sim-canvas-host"></div>
        </div>
        ${controlsHtml}
        ${simulation.caption ? html`<p class="cb-stage-caption">${this._captionHtml(simulation.caption)}</p>` : ''}
      </div>
    `;
  }

  /**
   * The image, spotlit on the current beat's focus rect if there is one.
   *
   * `reveal.focus` is keyed by *step id*, which only authored `<!-- STEP -->`
   * sentinels supply. A derived split deliberately has no stable identity to
   * offer: the splitter's rules will change over time (heading-merge-forward
   * was added after the first version), and a positional key would silently
   * point at a different beat the moment they do. Drawing a rect in the
   * authoring editor writes a sentinel first, for exactly this reason.
   *
   * Falls back to `renderBlockImage` — today's exact markup — whenever there
   * is no focus map, which is all 40 images currently in `/content`.
   */
  /**
   * The box `.cb-layout-background` actually renders at — `min-height:
   * min(70vh,640px)` (`min(62vh,460px)` under the same ≤600px breakpoint
   * `_isNarrowViewport` already tracks) per blockImageLayout.js's CSS. This
   * mirrors that CSS rather than measuring the live DOM node, which is a
   * deliberate approximation: it can undercount if a beat's text is long
   * enough to push the box past its minimum height, but for a handful of
   * short paragraphs that's rare, and it avoids a second measurement pass
   * beyond the natural-dimension probe and column-width observer already in
   * place for resolveImageLayout().
   */
  _backgroundBoxHeight() {
    const vh = window.innerHeight;
    return this._isNarrowViewport ? Math.min(0.62 * vh, 460) : Math.min(0.70 * vh, 640);
  }

  _renderImage(image) {
    const { capped = false, zoomAffordance = false, widthPx = null } = this._activeImageLayout || {};
    const opts = { capped, zoomAffordance, widthPx, pop: this._data.mediaStep > 0, bundleId: this._ctx?.bundleId };
    const focusMap = this._data?.reveal?.focus;
    if (!focusMap) return renderBlockImage(image, opts);
    const id = this._steps[this._step]?.id;
    let focus = id ? focusMap[id] : null;
    if (focus && this._data.reveal.opaque) focus = { ...focus, opaque: true };

    // `position: "background"` forces the <img> to fill a box shaped by CSS
    // (not the image's own aspect ratio) via `object-fit: cover`, which crops
    // it — remap the authored (full-image-space) focus rect into that crop's
    // coordinate space, or the mask lands on the wrong region on any
    // viewport whose aspect ratio differs from the image's own.
    if (focus && this._activeImageLayout?.layout === 'background' && this._imgDims?.naturalWidth) {
      const imageAspect = this._imgDims.naturalWidth / this._imgDims.naturalHeight;
      const boxAspect = this._columnWidth / this._backgroundBoxHeight();
      const remapped = remapRectForCover(focus, imageAspect, boxAspect);
      if (remapped) focus = { ...remapped, opaque: focus.opaque, label: focus.label, anchor: focus.anchor };
    }

    return renderBlockImageViewport(image, focus, opts);
  }

  _handleRevealAll() {
    if (this.revealAll()) {
      this.dispatchEvent(new CustomEvent('reveal-step', {
        detail: this.stepState(), bubbles: true, composed: true,
      }));
    }
  }

  render() {
    this._theatreOn = false;
    if (!this._data) return html``;

    const image = this._activeImage();
    const simulation = this._data.simulation;
    const photoDiagram = this._data.photoDiagram;

    // No media, or media gated to a beat not reached yet (`mediaStep`) —
    // render exactly like a media-less block: full-width text, nothing
    // reserved. The moment `_step` reaches `mediaStep` this flips and the
    // side/above/below/background layout below takes over, with the media
    // wrap entering the DOM fresh (`cb-media-pop`'s entrance animation).
    const figure = this._data.graph || this._data.diagram;
    const figField = this._data.figure;
    if ((!image?.src && !simulation?.src && !photoDiagram && !figure && !figField) || !this.isStepRevealed(this._data.mediaStep)) {
      return html`${this._renderPoeRecap()}<div class="cb-reading">${this._renderSteps()}</div>`;
    }

    // `photoDiagram` is mutually exclusive with `image`/`simulation` (kept
    // as its own early branch, not threaded through the image/simulation
    // swap logic below, since there's no third mode there to swap into or
    // out of - a block has at most one of the three, enforced by the
    // validator). Same layout-class/flow mechanism as the image/simulation
    // case, just resolved against PhotoDiagram's own synchronous aspect
    // ratio instead of a probed image or a dynamically-imported scene.
    if (photoDiagram) {
      this._activeImageLayout = this._resolvePhotoDiagramLayout();
      const pdLayoutClass = this._activeImageLayout
        ? `cb-layout-${this._activeImageLayout.layout}`
        : `cb-layout-${photoDiagram.position || 'right'}`;
      const pdIsFlow = this._activeImageLayout?.layout === 'flow';
      const pdMediaHtml = this._renderPhotoDiagram(photoDiagram);
      return html`
        ${this._renderPoeRecap()}
        <div class="${pdLayoutClass}">
          ${pdIsFlow ? pdMediaHtml : ''}
          <div class="cb-text">
            ${this._renderSteps()}
          </div>
          ${!pdIsFlow ? pdMediaHtml : ''}
        </div>
      `;
    }

    // `figure` (an engine-laid-out figure, FigureLayouts.js): same early branch.
    // It reflows to any width and its height follows its content, so the
    // aspect-locked fit/degrade chain does not apply: the author's position is
    // kept (side panel at the usual 60%, above/below up to 940 px), and a phone
    // stacks it through the usual CSS. Caption through the same path as a
    // simulation's (plain: "Fig. L.S").
    if (figField) {
      this._activeImageLayout = resolveSimLayout({
        positionHint: figField.position || 'right', aspect: figField.renderer ? this._figFieldRendererAspect(figField) : figureAspect(figField), columnWidth: this._columnWidth,
        availableHeight: Infinity, isNarrow: this._isNarrowViewport, isPortrait: this._isPortrait, wideMaxWidthPx: 940,
      });
      const cls = this._activeImageLayout ? `cb-layout-${this._activeImageLayout.layout}` : `cb-layout-${figField.position || 'right'}`;
      const isFlowF = this._activeImageLayout?.layout === 'flow';
      const { widthPx = null } = this._activeImageLayout || {};
      const cap = this._captionHtml(figField.caption);
      const figHtml = html`
        <div class="cb-sim-wrap cb-figure-wrap ${this._data.mediaStep > 0 ? 'cb-media-pop' : ''}" style="${widthPx ? `max-width:${Math.round(widthPx)}px` : ''}">
          <div id="figure-field-host" class="cb-figure-field"></div>
          ${cap ? html`<p class="cb-stage-caption cb-figure-caption">${cap}</p>` : ''}
        </div>`;
      return html`
        ${this._renderPoeRecap()}
        <div class="${cls}">
          ${isFlowF ? figHtml : ''}
          <div class="cb-text">${this._renderSteps()}</div>
          ${!isFlowF ? figHtml : ''}
        </div>
      `;
    }

    // `graph` / `diagram` (a static maths figure, revealed per beat) take the same
    // early branch as photoDiagram: mutually exclusive with every other media.
    if (figure) {
      const vb = this._data.diagram?.viewBox;
      const aspect = this._data.graph ? 4 / 3 : (Array.isArray(vb) && vb[3] ? vb[2] / vb[3] : 1.2);
      this._activeImageLayout = resolveSimLayout({
        positionHint: figure.position || 'right', aspect, columnWidth: this._columnWidth,
        availableHeight: this._availableHeight(), isNarrow: this._isNarrowViewport, isPortrait: this._isPortrait,
      });
      const cls = this._activeImageLayout ? `cb-layout-${this._activeImageLayout.layout}` : `cb-layout-${figure.position || 'right'}`;
      const isFlowFig = this._activeImageLayout?.layout === 'flow';
      const { widthPx = null } = this._activeImageLayout || {};
      const figHtml = html`
        <div class="cb-sim-wrap ${this._data.mediaStep > 0 ? 'cb-media-pop' : ''}" style="${widthPx ? `max-width:${Math.round(widthPx)}px` : ''}">
          <div class="sim-host-container cb-figure"><div id="step-figure-host" role="img" aria-label="${figure.a11yCaption || ''}"></div></div>
        </div>`;
      return html`
        ${this._renderPoeRecap()}
        <div class="${cls}">
          ${isFlowFig ? figHtml : ''}
          <div class="cb-text">${this._renderSteps()}</div>
          ${!isFlowFig ? figHtml : ''}
        </div>
      `;
    }

    // A block with BOTH an image and a simulation shows the image until
    // `simulationStep` (mirrors `mediaStep`'s own "0-indexed beat, sticky
    // from there on" convention exactly), then switches to the simulation —
    // e.g. a static diagram while the argument is being built up, live
    // apparatus once the beat inviting the student to try it themselves is
    // reached. Without `simulationStep` set, behaviour is unchanged from
    // before this existed: the image wins whenever both are present.
    const hasBothMedia = !!(image?.src && simulation?.src);
    const simulationGated = hasBothMedia && Number.isInteger(this._data.simulationStep);
    const showImage = !!image?.src && !(simulationGated && this.isStepRevealed(this._data.simulationStep));

    // Simulation slide: the theatre (split / floating windows / full view).
    // Classic gets the plain one (split, full view, controls tray; no floating
    // windows, no Quill). `fullWidth` games keep the plain stage: the game IS the slide.
    this._theatre.plain = !this.isStoryMode;
    this._theatre.editorial = this.look === 'plain' && !this.isStoryMode;
    this._theatreOn = !!simulation?.src && !showImage && !simulation.fullWidth && this._theatre.wants() && !this._tallForPhoneStage();
    if (this._theatreOn) {
      const stageW = this._theatre.stageWidth;
      this._activeImageLayout = { layout: 'theatre', widthPx: stageW };
      const dims = this._activeSimDesignDims();
      // The recap goes in the text pane: above the frame it is scrolled away
      // behind the sticky header as soon as the theatre lands.
      return html`
        ${this._theatre.render({
          narration: html`${this._renderPoeRecap()}${this._renderSteps()}`,
          title: simulation.title?.en || simulation.title || '',
          controls: this._renderSimControls(stageW != null && stageW < 400),
          // A fit scene taller than its design frame narrows the box so its
          // foot is not cropped; a shorter one keeps the design frame.
          aspect: this._theatreAspect(dims),
          step: this._step,
          steps: this._steps.length,
          frameStyle: this._simSceneClass?.FRAME_STYLE,
          caption: this._plainPage() ? this._captionHtml(simulation.caption) : '',
          // The plain page lets a scene grow a little past its design size
          // where the height allows, never to poster size.
          maxSceneW: this._theatre.editorial && dims ? dims.w * 1.1 : 0,
        })}
      `;
    }

    this._activeImageLayout = showImage
      ? this._resolveImageLayout()
      : (simulation?.src ? this._resolveSimLayout() : null);
    const layoutClass = this._activeImageLayout
      ? `cb-layout-${this._activeImageLayout.layout}`
      : blockLayoutClass(showImage ? image : null, showImage ? null : simulation);

    const isFlow = this._activeImageLayout?.layout === 'flow';
    const mediaHtml = showImage ? this._renderImage(image) : this._renderSimulation(simulation);
    return html`
      ${this._renderPoeRecap()}
      <div class="${layoutClass}">
        ${isFlow ? mediaHtml : ''}
        <div class="cb-text">
          ${this._renderSteps()}
        </div>
        ${!isFlow ? mediaHtml : ''}
      </div>
    `;
  }
}

customElements.define('content-block-v1', ContentBlock);
