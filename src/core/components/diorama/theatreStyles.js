import { css } from 'lit';

/**
 * Styles for the Story diorama theatre (StoryTheatre.js). Appended to
 * content-block's own static styles, so the narrator's .story-* rules and
 * the stage's .cb-stage-head/.sim-host-container rules are in the same
 * shadow root and are only adjusted here. Colours are theme tokens only
 * (invariant 9); Story mode redefines them per theme in theme.css.
 *
 * Sizes the controller sets as inline custom properties:
 *   --narr-size   the story's share of the split (docked and full view)
 *   --story-maxh  the floating story card's height limit
 */
export const theatreStyles = css`
  /* ── the theatre box: fills what the lesson chrome leaves of the viewport ── */
  .th {
    --th-rule: 3px;
    --th-r: 26px; /* the window's corner radius */
    --th-div: 18px;
    position: relative;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    /* 40px: breathing room, and Story's floating nav sits 22px above the bottom edge */
    height: calc(100dvh - var(--lesson-sticky-header-h, 0px) - var(--lesson-chrome-bottom, 0px) - 40px);
    min-height: 320px;
    scroll-margin-top: calc(var(--lesson-sticky-header-h, 0px) + 10px);
  }
  .th.orient-wide { flex-direction: row; }
  .th:focus-visible { outline: none; }

  /* ── story pane ── */
  .th-narr {
    position: relative;
    flex: 0 0 var(--narr-size, 34%);
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    box-sizing: border-box;
    padding: 2px 6px 6px 2px;
  }
  .th.orient-tall.float-none.auto:not(.max) .th-narr { transition: flex-basis 320ms cubic-bezier(0.3, 0.9, 0.4, 1); }
  .th-narr-in { flex: none; display: flex; flex-direction: column; min-width: 0; }
  .th.float-scene:not(.max) .th-narr { flex: 1; }
  /* margins set by the controller keep the story out from under the floating scene */
  .th.float-scene:not(.max) .th-narr { transition: margin 260ms cubic-bezier(0.3, 0.9, 0.4, 1); }
  .th.float-scene.orient-wide:not(.max) .th-narr-in { max-width: 72ch; width: 100%; margin: 0 auto; }

  /* the narrator, compact inside the theatre (same as the old fit-scene) */
  .th .story-title { font-size: 0.85em; margin-bottom: 4px; padding-right: 44px; }
  /* padding-top: room for the speaker's bob, which the pane's own scroll box
     would otherwise clip (the head cut off at the top of each bounce). */
  .th .story-quill-row { margin-bottom: -12px; padding-top: 10px; }
  .th .story-quill > * { width: 56px; }
  /* A speaker on the right stands clear of the undock button (.th-pop). */
  .th .story-quill-row.speaker-right { padding-right: 44px; }
  /* A narration caption has no row above it, so it starts level with that
     button: keep its corner clear too (a floating story card has none). */
  .th .story-bubble.story-caption { margin-right: 40px; }
  .th .th-narr.floating .story-bubble.story-caption { margin-right: 0; }
  .th .story-quill-name { font-size: 0.64rem; padding: 4px 10px; margin-bottom: 8px; }
  .th .story-bubble { padding: 13px 16px; }
  .th .story-bubble::before { display: none; }
  .th .so-far { margin-top: 8px; }
  .th .so-far .scroll-paper { max-height: 22dvh; }
  /* Scene floats: the story has the page, so Quill is big again (with the tail). */
  .th.float-scene:not(.max) .story-quill > * { width: 84px; }
  .th.float-scene:not(.max) .story-quill-name { font-size: 0.8rem; padding: 5px 14px; margin-bottom: 12px; }
  .th.float-scene:not(.max) .story-quill-row { margin-bottom: -6px; }
  .th.float-scene:not(.max) .story-bubble::before { display: block; }
  .th.float-scene:not(.max) .story-bubble.story-caption::before { display: none; }
  /* Desktop: the speaker grows with the viewport (phone sizes unchanged). */
  @media (min-width: 1024px) {
    .th .story-quill > * { width: clamp(56px, min(6.5vw, 12dvh), 112px); }
    .th.float-scene:not(.max) .story-quill > * { width: clamp(84px, min(9vw, 16dvh), 150px); }
  }

  /* undock-the-story button, top right of the docked story */
  .th-pop {
    position: sticky;
    top: 0;
    align-self: flex-end;
    z-index: 3;
    margin-bottom: -34px;
    flex: none;
  }

  /* ── divider ── */
  .th-div {
    flex: none;
    display: grid;
    place-items: center;
    touch-action: none;
    border-radius: 8px;
  }
  .th-div i { display: block; border-radius: 3px; background: var(--text-muted); }
  .th-div:hover i, .th-div[data-drag] i, .th-div:focus-visible i { background: var(--primary-color); }
  .th-div:focus-visible { outline: var(--focus-ring); outline-offset: -2px; }
  .th.orient-tall .th-div { height: var(--th-div); cursor: row-resize; }
  .th.orient-tall .th-div i { width: 56px; height: 6px; }
  .th.orient-wide .th-div { width: var(--th-div); cursor: col-resize; }
  .th.orient-wide .th-div i { width: 6px; height: 56px; }
  .th:not(.float-none):not(.max) .th-div { display: none; }

  /* ── scene slot + window ── */
  .th-slot {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .th.float-scene:not(.max) .th-slot { flex: 0 0 0; }
  .th[data-card='top'] .th-slot { justify-content: flex-end; }
  .th[data-card='bottom'] .th-slot { justify-content: flex-start; }
  .th[data-card='left'] .th-slot { align-items: flex-end; }
  .th[data-card='right'] .th-slot { align-items: flex-start; }
  .th-win {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: none;
    max-width: 100%;
    box-sizing: border-box;
  }
  .th-win .cb-stage-head { margin-bottom: 0; padding: 6px 8px 6px 14px; min-height: 44px; gap: 6px; box-sizing: border-box; }
  .th-win .cb-stage-head .th-ttl { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .th-win .cb-stage-kicker { white-space: nowrap; flex: none; }
  .th.narrow .cb-stage-kicker { display: none; }
  /* The strip never overflows its window: on a narrow window the least needed
     parts go first (pinch and the keyboard still zoom). */
  .th-win { container-type: inline-size; }
  .th-win .cb-stage-head { overflow: hidden; }
  @container (max-width: 420px) {
    .cb-stage-kicker { display: none; }
    .th-sep { display: none; }
    .th-hb { width: 28px; height: 28px; border-radius: 8px; }
    .th-hb svg { width: 14px; height: 14px; }
    .th-hb.rotate .lbl { display: none; }
    .cb-stage-head { padding-left: 8px; gap: 4px; }
  }
  @container (max-width: 320px) {
    .th-hb.zoom { display: none; }
  }
  .th-stage {
    position: relative;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: var(--shell-bg);
    border: var(--th-rule) solid var(--border-color);
    border-top: 0;
    border-radius: 0 0 var(--th-r) var(--th-r);
    box-shadow: var(--card-shadow);
  }
  .th-win:has(.th-ctrls:not(.tray):not(.side)) .th-stage { border-radius: 0; box-shadow: none; }
  .th-ctrls:not(.tray):not(.side) { display: contents; }

  /* scene controls in a column beside the scene (a wide box where the scene
     is limited by height, so the spare width is free); --ctrl-w set by the controller */
  .th-win.ctrl-side { display: grid; grid-template-columns: minmax(0, 1fr) var(--ctrl-w, 240px); grid-template-rows: auto auto; }
  .th-win.ctrl-side > .cb-stage-head { grid-column: 1 / -1; }
  .th-win.ctrl-side > .th-stage { grid-column: 1; border-radius: 0 0 0 var(--th-r); box-shadow: none; }
  .th-ctrls.side {
    grid-column: 2;
    grid-row: 2;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    box-sizing: border-box;
    padding: 6px 2px;
    background: var(--bg-surface);
    border: var(--th-rule) solid var(--border-color);
    border-top: 0;
    border-left: 2px dashed color-mix(in srgb, var(--border-color) 35%, transparent);
    border-radius: 0 0 var(--th-r) 0;
  }
  .th-win.ctrl-side { box-shadow: var(--card-shadow); border-radius: 0 0 var(--th-r) var(--th-r); }
  .th.max .th-win.ctrl-side { grid-template-rows: auto minmax(0, 1fr); box-shadow: none; border-radius: 0; }
  .th.max .th-win.ctrl-side > .th-stage, .th.max .th-ctrls.side { border-radius: 0; border-bottom: 0; }
  .th.max .th-ctrls.side { border-right: 0; }
  /* an invisible copy of the bar, measured by the controller to decide where it goes */
  .th-probe { position: absolute; left: 0; top: 0; visibility: hidden; pointer-events: none; z-index: -1; }

  /* scene controls tray: opened from the strip's sliders button. Closed it
     stays laid out (invisible, full window width) so the controller can
     still measure the bar and decide when it fits below the scene again. */
  .th-ctrls.tray {
    position: absolute;
    z-index: 6;
    top: 44px;
    left: 0;
    right: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .th-ctrls.tray.open {
    visibility: visible;
    pointer-events: auto;
    top: 50px;
    left: auto;
    right: 6px;
    width: min(360px, calc(100% - 12px));
    max-height: var(--tray-maxh, 60vh);
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    box-sizing: border-box;
    padding: 8px 4px 6px;
    background: var(--bg-surface);
    color: var(--text-main);
    border: var(--th-rule) solid var(--border-color);
    border-radius: 18px;
    box-shadow: var(--card-shadow);
    animation: th-tray-in var(--motion-base, 180ms) var(--ease-settle, ease-out);
  }
  /* Where it opens (data-tray, set by the controller): over the story when
     there is room, so the scene being adjusted stays in sight; else over the
     scene itself. */
  .th[data-tray='side'] .th-ctrls.tray.open { top: 0; right: calc(100% + var(--th-div) - 6px); width: min(380px, var(--narr-size, 360px)); }
  .th[data-tray='side-end'] .th-ctrls.tray.open { top: 8px; right: auto; left: calc(100% + var(--th-div) + 8px); width: min(380px, calc(var(--narr-size, 360px) - 16px)); }
  .th[data-tray='down'] .th-ctrls.tray.open { top: calc(100% + var(--th-div) + 6px); right: 8px; width: min(440px, calc(100% - 16px)); }
  .th[data-tray='up'] .th-ctrls.tray.open { top: auto; bottom: calc(100% + 6px); right: 0; width: min(440px, 100%); }
  @keyframes th-tray-in { from { opacity: 0; transform: translateY(-6px); } }
  .th-ctrls.tray .cb-sim-controls, .th-ctrls.side .cb-sim-controls { margin: 0; border: 0; border-radius: 0; box-shadow: none; background: none; }
  /* a list rather than a strip: one slider/select per line, sliders take the free width */
  .th-ctrls.tray .cb-sim-slider-row, .th-ctrls.side .cb-sim-slider-row { flex: 1 1 100%; min-width: 0; flex-wrap: wrap; gap: 2px 8px; }
  .th-ctrls.tray .cb-sim-slider-label, .th-ctrls.side .cb-sim-slider-label { white-space: normal; flex: 1 1 0; }
  /* the label and its value share a line; the slider takes the whole line below */
  .th-ctrls.tray .cb-sim-slider-row .cb-sim-range, .th-ctrls.side .cb-sim-slider-row .cb-sim-range { order: 1; flex: 1 1 100%; width: auto; min-width: 0; }
  .th-ctrls.tray .cb-sim-field, .th-ctrls.side .cb-sim-field { min-width: 0; max-width: 100%; }
  .th-ctrls-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 8px 2px 10px; }
  .th-ctrls-head b { font-family: var(--font-heading); font-weight: var(--heading-weight, 700); font-size: 0.95rem; }
  .th-ctrls-head button {
    width: 30px; height: 30px; padding: 0; border-radius: 50%; display: grid; place-items: center;
    border: 2px solid var(--border-color); background: var(--bg-base); color: var(--text-main); cursor: pointer;
  }
  .th-ctrls-head button svg { width: 14px; height: 14px; }
  .th-ctrls-head button:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
  /* the strip's sliders button: the one that hides something the slide needs, so it stands out */
  /* new controls: a gold ring that pulses a few times, then a steady dot until the tray is opened */
  .th-hb.ctrl.new { position: relative; overflow: visible; animation: th-ctrl-pulse 1.4s ease-out 4; }
  .th-hb.ctrl.new::after {
    content: '';
    position: absolute;
    top: -3px;
    right: -3px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent-gold);
    border: 2px solid var(--stage-head-bg);
  }
  .th-hb.ctrl.new { border-color: var(--accent-gold); }
  .th-hb.ctrl.new svg { animation: th-ctrl-nudge 1.4s ease-in-out 4; }
  @keyframes th-ctrl-nudge { 10%, 30% { transform: translateX(-2px); } 20%, 40% { transform: translateX(2px); } 50% { transform: none; } }
  @keyframes th-ctrl-pulse {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent-gold) 85%, transparent); }
    70% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent-gold) 0%, transparent); }
    100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent-gold) 0%, transparent); }
  }
  .th-hb.ctrl:not([aria-pressed='true']) { background: var(--stage-head-ink); color: var(--stage-head-bg); border-color: var(--stage-head-ink); }
  .th-ctrls:not(.tray):not(.side) .cb-sim-controls {
    margin: 0;
    border: var(--th-rule) solid var(--border-color);
    border-top: 2px dashed color-mix(in srgb, var(--border-color) 35%, transparent);
    border-radius: 0 0 var(--th-r) var(--th-r);
    box-shadow: var(--card-shadow);
  }
  /* An arcade game's cabinet (the scene's static FRAME_STYLE, passed by content-block): the
     landing page's game frame around the stage (LandingView's .cab-big / .cab-side), a coloured
     body with film-strip rails down both sides. The body is the stage's own padding, and
     --th-frame is what layout() reads in place of --th-rule, so the fit maths keeps its box. */
  .th.cabinet { --th-frame: 24px; --cab: var(--landing-planet-b); }
  .th.cabinet.narrow { --th-frame: 10px; }
  .th.cabinet .th-stage {
    border: 0;
    padding: 0 var(--th-frame) var(--th-frame);
    background: var(--cab);
    box-shadow: inset 0 -10px 0 color-mix(in srgb, var(--cab) 60%, var(--landing-sky-top)), 0 40px 60px -40px var(--landing-sky-top), 0 0 90px -30px var(--landing-glow);
  }
  .th.cabinet .th-stage::before,
  .th.cabinet .th-stage::after {
    content: '';
    position: absolute;
    top: 6px;
    bottom: calc(var(--th-frame) + 6px);
    width: 14px;
    border-radius: 7px;
    background: repeating-linear-gradient(180deg, color-mix(in srgb, var(--cab) 55%, var(--landing-sky-top)) 0 10px, transparent 10px 19px);
    opacity: 0.8;
    pointer-events: none;
  }
  .th.cabinet .th-stage::before { left: 5px; }
  .th.cabinet .th-stage::after { right: 5px; }
  .th.cabinet.narrow .th-stage::before,
  .th.cabinet.narrow .th-stage::after { display: none; }
  .th.cabinet .th-cam { border-radius: 0 0 14px 14px; background: var(--landing-sky-top); }

  .th-cam { position: relative; overflow: hidden; line-height: 0; }
  .th-cam.panning { cursor: grabbing; }
  .th-cam.pan-mode { cursor: grab; }
  .th-cam-in { transform-origin: 0 0; width: 100%; height: 100%; }
  .th-cam-in .sim-host-container,
  .th .th-cam-in .sim-host-container:not(.sim-host-container--frameless) {
    border: 0;
    border-radius: 0;
    box-shadow: none;
    width: 100%;
    height: 100%;
  }
  .th-cam-in .sim-host-container canvas:not([data-sim-own-size]):not(.sim-dom-root canvas[style*="width"], .sim-dom-root canvas[style*="height"]) { width: 100% !important; height: auto !important; display: block; }
  .th-cam-in .sim-host-container .sim-dom-root { line-height: normal; }

  /* chip: what the camera is showing, only while zoomed */
  .th-chip {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 2;
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 0.74rem;
    font-weight: 800;
    line-height: 1.2;
    padding: 5px 10px;
    border-radius: var(--radius-pill);
    border: 2px solid var(--border-color);
    background: var(--glass-bg);
    color: var(--text-main);
    box-shadow: var(--shadow-sm);
    max-width: calc(100% - 16px);
    box-sizing: border-box;
  }
  .th-chip button { border: 0; background: none; padding: 0; font: inherit; color: var(--primary-text); cursor: pointer; white-space: nowrap; }
  .th-chip span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }

  /* head buttons */
  .th-hb {
    flex: none;
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: var(--stage-btn-radius, 10px);
    display: grid;
    place-items: center;
    border: var(--stage-btn-border, 2px solid color-mix(in srgb, var(--stage-head-ink) 45%, transparent));
    background: var(--stage-btn-bg, color-mix(in srgb, var(--stage-head-ink) 10%, transparent));
    color: var(--stage-head-ink);
    cursor: pointer;
    font: inherit;
  }
  .th-hb svg { width: 16px; height: 16px; }
  .th-hb[aria-pressed='true'] { background: var(--primary-color); color: var(--on-primary); border-color: var(--primary-color); }
  .th-hb:disabled { opacity: 0.4; cursor: default; }
  .th-hb:focus-visible, .th-nav button:focus-visible, .th-opts button:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
  .th-hb.txt { width: auto; padding: 0 8px; gap: 4px; display: flex; font-size: 0.72rem; font-weight: 800; }
  .th.narrow .th-hb.rotate .lbl { display: none; }
  .th-hb.rotate { background: var(--primary-color); color: var(--on-primary); border-color: var(--primary-color); border-radius: var(--radius-pill); }
  .th-sep { flex: none; width: var(--stage-sep-w, 2px); height: 20px; margin: 0 2px; border-radius: 1px; background: color-mix(in srgb, var(--stage-head-ink) 30%, transparent); }
  /* A real 44px target on a phone with the same 30px face: a clear 7px border holds the size, the
     fill stops at it, and an inset ring stands in for the face's own border. The strip loses its
     vertical padding, so it stays 44px tall and the scene keeps its height. */
  .th.narrow .th-hb {
    width: 44px; height: 44px; border-radius: 16px; position: relative;
    border: 7px solid transparent !important; background-clip: padding-box;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--stage-head-ink) 45%, transparent);
  }
  .th.narrow .th-hb.ctrl.new::after { top: 2px; right: 2px; }
  .th.narrow .th-win .cb-stage-head { padding-block: 0; gap: 0; height: 44px; }
  .th-grip { display: none; flex: none; color: var(--stage-head-ink); opacity: 0.8; }
  /* the story's own pop-out button, on the paper rather than the green strip */
  .th-pop.th-hb { color: var(--text-main); border-color: var(--border-color); background: var(--bg-surface); box-shadow: var(--shadow-sm); }

  /* ── floating windows (absolute inside the theatre) ── */
  .th-win.floating, .th-narr.floating {
    position: absolute;
    z-index: 5;
    transition: left 220ms ease, top 220ms ease, width 220ms ease;
  }
  .th-win.floating[data-drag], .th-narr.floating[data-drag] { transition: none; z-index: 8; }
  .th-win.floating[data-drag='move'], .th-narr.floating[data-drag='move'] { opacity: 0.94; }
  .th-win.floating { box-shadow: var(--card-shadow); border-radius: var(--th-r); }
  .th-win.floating .cb-stage-head { cursor: grab; touch-action: none; }
  .th-win.floating .th-grip { display: block; }
  .th-win.floating .cb-stage-kicker { display: none; }
  .th-win.floating.mini .th-stage, .th-win.floating.mini .th-ctrls, .th-win.floating.mini .th-rsz { display: none; }
  .th-win.floating.mini .cb-stage-head { border-bottom: var(--th-rule) solid var(--border-color); border-radius: var(--th-r); }

  .th-narr.floating {
    padding: 0;
    overflow: hidden;
    max-height: var(--story-maxh, 45%);
    background: var(--bg-base);
    border: var(--th-rule) solid var(--border-color);
    border-radius: 20px;
    box-shadow: var(--card-shadow);
  }
  .th-story-head { display: none; }
  .th-narr.floating .th-story-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px 4px 10px;
    min-height: 40px;
    box-sizing: border-box;
    background: var(--accent-coral);
    color: var(--on-accent);
    border-bottom: var(--th-rule) solid var(--border-color);
    font-family: var(--font-heading);
    font-size: 0.78rem;
    cursor: grab;
    touch-action: none;
  }
  .th-narr.floating .th-story-head .th-ttl { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .th-narr.floating .th-story-head .th-hb { color: var(--on-accent); border-color: color-mix(in srgb, var(--on-accent) 55%, transparent); background: color-mix(in srgb, var(--on-accent) 14%, transparent); width: 30px; height: 30px; }
  .th-narr.floating .th-story-head .th-grip { display: block; color: var(--on-accent); }
  .th-narr.floating .th-narr-in {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 10px 12px 12px 8px;
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr);
    column-gap: 4px;
    align-items: start;
  }
  .th-narr.floating .story-title, .th-narr.floating .story-quill-name { display: none; }
  .th-narr.floating .story-quill-row { grid-column: 1; grid-row: 1; margin: 0; position: sticky; top: 0; }
  .th-narr.floating .story-quill > * { width: 46px; }
  .th-narr.floating .story-bubble { grid-column: 2; grid-row: 1; box-shadow: var(--shadow-sm); padding: 10px 12px; }
  .th-narr.floating .so-far, .th-narr.floating .cb-poe-recap { grid-column: 1 / -1; }
  .th-narr.floating.mini .th-narr-in, .th-narr.floating.mini .th-rsz { display: none; }
  .th-narr.floating.mini .th-story-head { border-bottom: 0; }
  .th-narr.floating.ping .th-story-head { animation: th-ping 900ms ease 2; }
  @keyframes th-ping { 50% { background: var(--primary-color); color: var(--on-primary); } }

  /* resize grips: gold corner tabs */
  .th-rsz {
    position: absolute;
    bottom: -6px;
    right: -6px;
    z-index: 3;
    width: 32px;
    height: 32px;
    padding: 0;
    touch-action: none;
    border-radius: 11px;
    background: var(--primary-color);
    color: var(--on-primary);
    border: var(--rule-w) solid var(--border-color);
    box-shadow: var(--shadow-sm);
    cursor: nwse-resize;
  }
  .th-rsz svg { width: 100%; height: 100%; }
  .th-rsz.left { right: auto; left: -6px; cursor: nesw-resize; transform: scaleX(-1); }
  .th-narr.floating .th-rsz { bottom: 4px; right: 4px; }
  .th-narr.floating .th-rsz.left { right: auto; left: 4px; }

  /* dock zone, shown while a floating window is dragged */
  .th-zone {
    position: absolute;
    z-index: 4;
    display: grid;
    place-items: center;
    border: 3px dashed var(--text-muted);
    border-radius: 22px;
    background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    color: var(--text-muted);
    font-weight: 800;
    font-size: 0.85rem;
    pointer-events: none;
  }
  .th-zone[hidden] { display: none; }
  .th-zone.hot { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 35%, transparent); color: var(--text-main); }
  .th.orient-tall .th-zone.scene { left: 0; right: 0; bottom: 0; height: 96px; }
  .th.orient-wide .th-zone.scene { top: 0; bottom: 0; right: 0; width: 120px; }
  .th.orient-tall .th-zone.story { left: 0; right: 0; top: 0; height: 84px; z-index: 9; }
  .th.orient-wide .th-zone.story { top: 0; bottom: 0; left: 0; width: 70px; z-index: 9; writing-mode: vertical-rl; }

  /* ── Classic's plain theatre: Classic's own rule width and corners, the
     stacked beats as they are (no narrator), no floating windows ── */
  .th.plain { --th-rule: var(--rule-w); --th-r: var(--radius-lg); }
  .th.plain .th-narr { padding: 2px 10px 6px 2px; }
  .th.plain .cb-header { margin-top: 0; }
  .th.plain.max .th-narr-in { display: flex; }
  /* the beats stack up, so full view's Previous/Next stays pinned under them */
  .th.plain.max .th-nav { position: sticky; bottom: -10px; margin-bottom: -10px; padding-bottom: 10px; background: var(--bg-surface); }
  .th.plain .th-hb { border-radius: var(--radius-xs); }
  .th.plain.narrow .th-hb { border-radius: calc(var(--radius-xs) + 7px); box-shadow: inset 0 0 0 1px var(--border-hover); }

  /* ── the plain look's rail (StoryTheatre._railed): a wide docked theatre
     stands the strip's buttons in a column beside the scene, so the scene
     gets the strip's height back. The window keeps only the strip's top
     rule; the rail sits in the window's right padding. ── */
  .th.rail { --th-rail: 40px; }
  .th.rail .th-win { padding-right: var(--th-rail); border-top: var(--th-rule) solid; }
  .th.rail .th-win > .cb-stage-head {
    position: absolute;
    top: 0;
    right: 0;
    width: var(--th-rail);
    min-height: 0;
    flex-direction: column;
    align-items: flex-end;
    padding: 6px 0 0;
    gap: 4px;
    border: 0;
    overflow: visible;
  }
  .th.rail .th-win > .cb-stage-head .th-grip,
  .th.rail .th-win > .cb-stage-head .th-ttl { display: none; }
  .th.rail .th-win > .cb-stage-head .th-sep { width: 18px; height: var(--stage-sep-w, 2px); margin: 2px 7px; display: block; }

  /* ── full view ── */
  .th-nav { display: none; }
  .th.max {
    position: fixed;
    inset: 0;
    z-index: 1000;
    width: auto;
    height: auto;
    min-height: 0;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
    border: 0;
    background: var(--bg-base);
    color: var(--text-main);
    overflow: hidden;
  }
  .th.max::backdrop { background: var(--scrim); }
  .th.max .th-slot { order: 1; align-items: stretch; justify-content: stretch; }
  .th.max .th-div { order: 2; background: var(--bg-surface); border-radius: 0; }
  .th.max.orient-tall .th-div { border-top: var(--rule-w) solid var(--border-color); }
  .th.max.orient-wide .th-div { border-left: var(--rule-w) solid var(--border-color); }
  .th.max .th-narr { order: 3; background: var(--bg-surface); padding: 6px 12px 10px; }
  .th.max .th-win { flex: 1; min-height: 0; width: auto !important; }
  .th.max .th-win .cb-stage-head { border-radius: 0; border-left: 0; border-right: 0; border-top: 0; }
  .th.max .th-stage { flex: 1; min-height: 0; height: auto !important; border-radius: 0; border-left: 0; border-right: 0; border-bottom: 0; box-shadow: none; }
  .th.max .th-ctrls:not(.tray):not(.side) .cb-sim-controls { border-radius: 0; border-left: 0; border-right: 0; border-bottom: 0; box-shadow: none; }
  .th.max .th-pop { display: none; }
  .th.max .th-narr-in { flex: none; display: grid; grid-template-columns: 44px minmax(0, 1fr); column-gap: 8px; align-items: start; }
  .th.max .story-title, .th.max .story-quill-name { display: none; }
  .th.max .story-quill-row { grid-column: 1; grid-row: 1; margin: 2px 0 0; }
  .th.max .story-quill > * { width: 44px; }
  .th.max .story-bubble { grid-column: 2; grid-row: 1; border: 0; background: none; box-shadow: none; padding: 0; }
  .th.max .so-far, .th.max .cb-poe-recap { grid-column: 1 / -1; }
  .th.max .th-nav { display: flex; align-items: center; gap: 8px; flex: none; margin-top: auto; padding-top: 8px; }
  .th-nav .th-count { flex: 1; font-size: 0.75rem; font-weight: 800; color: var(--text-muted); letter-spacing: 0.08em; text-transform: uppercase; }
  .th-nav button {
    width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    border: var(--rule-w) solid var(--border-color);
    background: var(--bg-surface);
    color: var(--text-main);
    box-shadow: var(--shadow-sm);
    cursor: pointer;
    font: inherit;
  }
  .th-nav button svg { width: 20px; height: 20px; }
  .th-nav button.next { background: var(--primary-color); color: var(--on-primary); }
  .th-nav button.done { width: auto; border-radius: var(--radius-pill); padding: 0 16px; font-weight: 800; }
  .th-nav button:disabled { opacity: 0.4; cursor: default; }

  /* ── options panel ── */
  .th-opts {
    position: absolute;
    z-index: 20;
    top: 8px;
    right: 8px;
    width: min(360px, calc(100% - 16px));
    max-height: calc(100% - 16px);
    overflow-y: auto;
    box-sizing: border-box;
    padding: 12px 14px 14px;
    background: var(--bg-surface);
    color: var(--text-main);
    border: var(--th-rule, 3px) solid var(--border-color);
    border-radius: 18px;
    box-shadow: var(--card-shadow);
    line-height: 1.3;
    font-size: 0.85rem;
    text-align: left;
  }
  .th-opts-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
  .th-opts-head b { font-family: var(--font-heading); font-weight: var(--heading-weight, 700); font-size: 1rem; }
  .th-opts-head button {
    width: 32px; height: 32px; padding: 0; border-radius: 50%; display: grid; place-items: center;
    border: 2px solid var(--border-color); background: var(--bg-base); color: var(--text-main); cursor: pointer;
  }
  .th-opt { margin-top: 10px; }
  .th-opt > span { display: block; font-size: 0.68rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 5px; }
  .th-seg { display: flex; flex-wrap: wrap; gap: 6px; }
  .th-seg button {
    border: 2px solid var(--border-color);
    border-radius: var(--radius-pill);
    padding: 5px 11px;
    background: var(--bg-base);
    color: var(--text-main);
    font: inherit;
    font-weight: 700;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .th-seg button[aria-pressed='true'] { background: var(--text-main); color: var(--bg-surface); }
  .th-opts .th-reset { margin-top: 14px; border: 0; background: none; padding: 0; font: inherit; font-weight: 800; color: var(--primary-text); cursor: pointer; }
  .th-opts .th-note { margin: 10px 0 0; font-size: 0.75rem; color: var(--text-muted); }
  /* the scrolling-page layout keeps the old stage; its strip gets the same buttons */
  .cb-sim-wrap.has-th-opts { position: relative; }
  .cb-stage-head .th-hb:first-of-type { margin-left: auto; }
  .th-win .cb-stage-head .th-hb:first-of-type { margin-left: 0; }

  /* during one of Quill's shows the controller moves things frame by frame */
  .th.th-anim .th-narr, .th.th-anim .th-win, .th.th-anim .th-narr.floating, .th.th-anim .th-win.floating { transition: none !important; }

  @media (prefers-reduced-motion: reduce) {
    .th-narr, .th-win.floating, .th-narr.floating { transition: none !important; }
    .th-narr.floating.ping .th-story-head { animation: none; }
    .th-ctrls.tray.open, .th-hb.ctrl.new, .th-hb.ctrl.new svg { animation: none; }
    .th.float-scene .th-narr { transition: none; }
  }
`;
