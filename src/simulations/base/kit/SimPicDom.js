/**
 * SimPicDom - picture components for DomSimulation scenes: the scene says WHAT
 * to show (data), the kit draws it. A later look upgrade is a kit edit only;
 * the call sites never change.
 *
 *   mountParliament(host, { key })  a half-circle chamber of seats with a vote ring; key: 'side' (default) | 'below'
 *     .set({ seats, votes, key, total, votesLabel, need })
 *        seats  [tone,...]   one entry per seat, series tone 1..8, 0 = empty seat
 *        votes  [{ tone, pct, label }]   the outer ring (optional; its labels hide in portrait)
 *        key    [{ tone, text, win }]    the key beside the chamber (optional); win = highlighted once the seats are in
 *        need   n            seats for a majority: a dashed line through the middle plus a key row ('n for a majority')
 *     .onSwept(cb)           cb once the seat sweep has landed (at once under reduced motion), e.g. to burst()
 *   materialTileHtml(kind)         a small illustrated surface patch with a sun ray
 *     kinds: snow ice rock soil-light soil-black water grass rock-bare
 *   setTileAlbedo(tileEl, a)       0..1 sets how strong the reflected ray is; null hides it
 *   materialTileHtml(kind, { size })   size in px for a big tile (default 44); the reflected ray draws itself in
 *   thermoHtml({ vertical, height })   a horizontal thermometer, or a standing one (height in px)
 *   setThermo(el, lo, hi = lo)     0..1 fill; lo < hi draws a range; null = empty/locked
 *   numHtml(attrs, { size })       a big tabular number span; empty = a muted '?' (class sp-num, --sm, --hot)
 *   scaleStripHtml({ ticks, mini, label })   a min..max track: band for a range, knob for a value, dashed when empty
 *   setScaleStrip(el, lo, hi = lo) positions 0..1; null = empty
 *   specimenCardHtml({ pic, size, title, tag, body, layout, portrait, attrs })   a picture card
 *        layout 'stack' (tile over name) | 'line' (tile beside name, body below) | 'side' (tile left of everything)
 *        portrait 'line' switches to the line layout in a portrait root
 *   valueDialHtml({ key, label, min, max, step, value, ends })   a big range input (data-dial=key) with end labels
 *   pairHtml(a, b, mid)            two cards side by side with a quiet word between (no verdict)
 *   picTableHtml({ head, rows, divideBefore, cols, tile, inline })   a compact table: tile + name, then the caller's cells
 *        (inline: each cell's first child sits beside the rest, e.g. a number then its strip)
 *        rows [{ key, pic, label, tag, cells: [html] }]; each row carries data-row=key
 *        portrait 'compact': in a portrait root, smaller tiles, no tags / strips / thermometers in cells, portraitCols grid
 *   readoutHtml({ cap, size, attrs })      a big number with a muted caption beside it (.sp-read; number is data-val by default)
 *   thermoReadHtml(thermo, numOpts, attrs) a thermometer with its number (.sp-temp; number is data-temp by default)
 *   cardRowHtml(cards)             equal cards in a row; in portrait each card folds to a compact line (tile | name | number)
 *   dialRowsHtml(cards)            'side' cards stacked: tile | name, number, dial | temperature (sp-read, sp-dial, sp-temp)
 *   pairHtml(a, b, mid, { dials }) dials: the two cards lay out number, dial and a standing thermometer
 *
 * SIM_PIC_CSS is appended to SIM_LOOK_DOM_CSS, so a scene that already uses the
 * look kit needs no CSS import. Colours are var(--sim-*) only (plus the black/white
 * mixes SimUi already uses for lips and highlights).
 * Keep this file free of backticks inside the CSS text.
 */
import { esc } from 'simulations/base/SimUi.js';

export const SIM_PIC_CSS = `
.sp-parl { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--sim-space-3); }
.sim-dom-root--portrait .sp-parl { grid-template-columns: minmax(0, 1fr); }
.sp-parl__svg { display: block; width: 100%; max-height: 232px; overflow: visible; }
.sp-parl--below { grid-template-columns: minmax(0, 1fr); justify-items: center; gap: var(--sim-space-2); }
.sp-parl--below .sp-key { flex-flow: row wrap; justify-content: center; gap: var(--sim-space-2) var(--sim-space-4); }
.sim-dom-root--portrait .sp-ring__lab, .sim-dom-root--portrait .sp-ring__cap { display: none; }
.sim-dom-root--portrait .sp-parl__nl { font-size: 21px; }
.sp-parl__need { stroke: var(--sim-label); stroke-width: 2.5; stroke-dasharray: 6 5; stroke-linecap: round; opacity: 0.75; }
.sp-key__need { width: 18px; height: 0; flex: none; border-top: 3px dashed var(--sim-label); opacity: 0.75; }
.sp-key__row--need { font-weight: 700; color: var(--sim-label-muted); }
.sp-key__row.is-win { padding: 2px var(--sim-space-3) 2px var(--sim-space-1); border-radius: var(--sim-radius-pill);
  background: color-mix(in oklab, var(--tone) 18%, var(--sim-bg-surface)); box-shadow: inset 0 0 0 2px var(--tone);
  animation: sp-win 0.5s var(--look-spring) var(--sweep, 0ms) both; }
.sp-parl__floor { fill: color-mix(in oklab, var(--sim-stroke) 14%, transparent); }
.sp-parl__base { stroke: var(--sim-stroke); stroke-width: 3; stroke-linecap: round; }
.sp-seat { transition: fill 0.35s ease; transition-delay: var(--d, 0ms); }
.sp-seat--lip { opacity: 0.9; }
.sp-seat.is-empty { fill: var(--sim-bg-surface); stroke: color-mix(in oklab, var(--sim-stroke) 75%, var(--sim-label)); stroke-width: 1.5; stroke-dasharray: 3 2.5; }
.sp-seat--lip.is-empty { fill: color-mix(in oklab, var(--sim-stroke) 35%, transparent); stroke: none; }
.sp-seats--in .sp-seatg { animation: sp-pop 0.4s var(--look-spring) both; animation-delay: var(--d, 0ms); transform-box: fill-box; transform-origin: center; }
.sp-ring__track { fill: none; stroke: var(--sim-track); stroke-width: 12; }
.sp-ring__seg { fill: none; stroke-width: 12; animation: sp-fade 0.45s ease both; }
.sp-ring__lab { font: 800 16px var(--sim-font); fill: var(--sim-label); animation: sp-fade 0.45s ease both; }
.sp-ring__cap { font: 700 15px var(--sim-font); fill: var(--sim-label-muted); }
.sp-parl__n { font: 800 36px var(--sim-font-display, var(--sim-font)); fill: var(--sim-label); }
.sp-parl__nl { font: 700 15px var(--sim-font); fill: var(--sim-label-muted); }
.sp-key { display: flex; flex-direction: column; gap: var(--sim-space-2); margin: 0; padding: 0; list-style: none; }
.sim-dom-root--portrait .sp-key { flex-flow: row wrap; }
.sp-key__row { display: flex; align-items: center; gap: var(--sim-space-2); font-weight: 800; font-size: var(--sim-text-md); color: var(--sim-label); white-space: nowrap; animation: sp-fade 0.35s ease both; }
.sp-key__dot { width: 16px; height: 16px; border-radius: 50%; flex: none; background: var(--tone);
  box-shadow: inset 0 calc(-3px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 70%, black); }

.sp-tile { display: inline-block; flex: none; width: var(--sp-tile, 44px); height: var(--sp-tile, 44px); vertical-align: middle; }
.sp-tile svg { display: block; width: 100%; height: 100%; overflow: visible; }
.sp-tile__frame { fill: none; stroke: var(--sim-stroke); stroke-width: 2; }
.sp-tile__sun { fill: var(--sim-gold); stroke: color-mix(in oklab, var(--sim-gold) 70%, black); stroke-width: 1; }
.sp-tile__in { fill: none; stroke: var(--sim-gold); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.sp-tile__out { fill: none; stroke: var(--sim-gold); stroke-linecap: round; stroke-linejoin: round;
  stroke-width: calc(1.2px + 4.2px * var(--alb, 0)); opacity: calc(0.2 + 0.8 * var(--alb, 0));
  transition: stroke-width 0.2s ease, opacity 0.2s ease; }
.sp-tile:not([data-alb]) .sp-tile__out { opacity: 0; }
.sp-tile__halo { fill: none; stroke: color-mix(in oklab, var(--sim-label) 55%, transparent); stroke-linecap: round; stroke-linejoin: round;
  stroke-width: calc(3.4px + 4.2px * var(--alb, 0)); opacity: calc(0.35 * var(--alb, 0)); transition: stroke-width 0.2s ease, opacity 0.2s ease; }
.sp-tile:not([data-alb]) .sp-tile__halo { opacity: 0; }
.sp-tile[data-alb] .sp-tile__out, .sp-tile[data-alb] .sp-tile__halo { stroke-dasharray: 34; animation: sp-ray 0.6s cubic-bezier(0.2, 0.8, 0.3, 1) both; }

.sp-thermo { --lo: 0; --hi: 0; position: relative; display: flex; align-items: center; height: 24px; min-width: 0; }
.sp-thermo__bulb { position: relative; z-index: 1; flex: none; width: 22px; height: 22px; border-radius: 50%;
  border: calc(2px * var(--look-rim)) solid var(--sim-stroke); background: var(--sim-bg-surface); display: grid; place-items: center; }
.sp-thermo__bulb::after { content: ''; width: 12px; height: 12px; border-radius: 50%;
  background: linear-gradient(90deg, var(--sim-sky-day), var(--sim-gold) 55%, var(--sim-flame)) no-repeat;
  background-size: 2000% 100%; background-position: calc(var(--hi) * 100%) 0;
  box-shadow: inset 0 calc(-2px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-label) 25%, transparent); transition: background-position 0.2s ease; }
.sp-thermo__tube { position: relative; flex: 1; height: 12px; margin-left: -4px; border: calc(2px * var(--look-rim)) solid var(--sim-stroke); border-left: 0;
  border-radius: 0 var(--look-pill) var(--look-pill) 0; background: var(--sim-track); overflow: hidden; }
.sp-thermo__fill, .sp-thermo__band { position: absolute; inset: 0;
  background: linear-gradient(90deg, var(--sim-sky-day), var(--sim-gold) 55%, var(--sim-flame));
  transition: clip-path 0.3s cubic-bezier(0.25, 0.9, 0.3, 1); }
.sp-thermo__band { opacity: 0.45; clip-path: inset(0 calc((1 - var(--hi)) * 100%) 0 0); }
.sp-thermo__fill { clip-path: inset(0 calc((1 - var(--lo)) * 100%) 0 0); }
.sp-thermo__tube::after { content: ''; position: absolute; inset: 0;
  background: repeating-linear-gradient(90deg, transparent 0 calc(20% - 1.5px), color-mix(in oklab, var(--sim-stroke) 80%, transparent) calc(20% - 1.5px) 20%);
  opacity: 0.55; }
.sp-thermo[data-off] .sp-thermo__bulb::after { background: var(--sim-track); box-shadow: none; }
.sp-thermo[data-off] .sp-thermo__tube { border-style: dashed; background: transparent; }
.sp-thermo[data-off] .sp-thermo__bulb { border-style: dashed; }
.sp-thermo[data-off] .sp-thermo__fill, .sp-thermo[data-off] .sp-thermo__band { clip-path: inset(0 100% 0 0); }
/* vertical: thermoHtml({ vertical: true }), height from --sp-thermo-h */
.sp-thermo--v { flex-direction: column-reverse; width: 32px; height: var(--sp-thermo-h, 140px); }
.sp-thermo--v .sp-thermo__bulb { width: 32px; height: 32px; }
.sp-thermo--v .sp-thermo__bulb::after { width: 20px; height: 20px; background-size: 100% 2000%; background-position: 0 calc((1 - var(--hi)) * 100%);
  background-image: linear-gradient(0deg, var(--sim-sky-day), var(--sim-gold) 55%, var(--sim-flame)); }
.sp-thermo--v .sp-thermo__tube { flex: 1; width: 16px; height: auto; margin: 0 0 -6px; border: calc(2px * var(--look-rim)) solid var(--sim-stroke); border-bottom: 0; border-radius: var(--look-pill) var(--look-pill) 0 0; }
.sp-thermo--v .sp-thermo__fill, .sp-thermo--v .sp-thermo__band { background: linear-gradient(0deg, var(--sim-sky-day), var(--sim-gold) 55%, var(--sim-flame)); }
.sp-thermo--v .sp-thermo__band { clip-path: inset(calc((1 - var(--hi)) * 100%) 0 0 0); }
.sp-thermo--v .sp-thermo__fill { clip-path: inset(calc((1 - var(--lo)) * 100%) 0 0 0); }
.sp-thermo--v .sp-thermo__tube::after { background: repeating-linear-gradient(0deg, transparent 0 calc(20% - 1.5px), color-mix(in oklab, var(--sim-stroke) 80%, transparent) calc(20% - 1.5px) 20%); }
.sp-thermo--v[data-off] .sp-thermo__fill, .sp-thermo--v[data-off] .sp-thermo__band { clip-path: inset(100% 0 0 0); }

/* big number readout: an empty one shows a muted ? (not measured yet) */
.sp-num { font-weight: 800; font-size: var(--sim-text-2xl); line-height: 1.1; color: var(--sim-label); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sp-num--sm { font-size: var(--sim-text-lg); }
.sp-num--hot { color: var(--sim-accent); }
.sp-num:empty::after { content: '?'; color: var(--sim-label-muted); }
.sp-cap { font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }

/* scale strip: a min..max track with a band (a range) or a knob (one value) */
.sp-scale { --lo: 0; --hi: 0; display: block; min-width: 0; }
.sp-scale__track { position: relative; display: block; height: 16px; border: calc(2px * var(--look-rim)) solid var(--sim-stroke); border-radius: var(--look-pill); background: var(--sim-track); }
.sp-scale__band { position: absolute; top: -2px; bottom: -2px; left: calc(var(--lo) * 100%); width: max(10px, calc((var(--hi) - var(--lo)) * 100%));
  border-radius: var(--look-pill); background: var(--sp-tone, var(--sim-series-1)); box-shadow: inset 0 calc(-3px * var(--look-lip)) 0 color-mix(in oklab, var(--sp-tone, var(--sim-series-1)) 68%, black);
  transition: left 0.3s ease, width 0.3s ease; }
.sp-scale__knob { position: absolute; top: 50%; left: calc(var(--lo) * 100%); width: 20px; height: 20px; border-radius: 50%; transform: translate(-50%, -50%);
  border: calc(3px * var(--look-rim)) solid var(--sp-tone, var(--sim-series-1)); background: var(--sim-bg-surface); box-shadow: 0 calc(2px * var(--look-lip)) 0 var(--sim-stroke); display: none; transition: left 0.2s ease; }
.sp-scale[data-point] .sp-scale__band { display: none; }
.sp-scale[data-point] .sp-scale__knob { display: block; }
.sp-scale[data-off] .sp-scale__track { border-style: dashed; background: transparent; }
.sp-scale[data-off] .sp-scale__band, .sp-scale[data-off] .sp-scale__knob { display: none; }
.sp-scale__ticks { display: flex; justify-content: space-between; margin-top: var(--sim-space-1); font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label-muted); font-variant-numeric: tabular-nums; }
.sp-scale--mini .sp-scale__track { height: 12px; }
.sp-scale--mini .sp-scale__knob { width: 16px; height: 16px; border-width: 3px; }

/* specimen card: a picture tile, a name, an optional tag and the caller's body */
.sp-spec { position: relative; display: flex; flex-direction: column; gap: var(--sim-space-3); min-width: 0; padding: var(--sim-space-3) var(--sim-space-4);
  border: calc(2px * var(--look-rim)) solid var(--sim-stroke); border-radius: var(--sim-radius-lg); background: color-mix(in oklab, var(--sim-track) 30%, var(--sim-bg-surface));
  box-shadow: 0 calc(4px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-stroke) 55%, transparent); }
.sp-spec__id { display: flex; flex-direction: column; align-items: center; gap: var(--sim-space-2); text-align: center; min-width: 0; }
.sp-spec__head { display: flex; flex-direction: column; align-items: center; gap: var(--sim-space-1); min-width: 0; }
.sp-spec__title { margin: 0; font-weight: 800; font-size: var(--sim-text-lg); line-height: 1.2; color: var(--sim-label); }
.sp-spec__tag { padding: 1px var(--sim-space-2); border-radius: var(--sim-radius-pill); border: calc(2px * var(--look-rim)) solid var(--sim-stroke); background: var(--sim-bg-surface);
  font-weight: 800; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }
.sp-spec__body { display: flex; flex-direction: column; gap: var(--sim-space-2); min-width: 0; }
.sp-spec--line .sp-spec__id { flex-direction: row; text-align: left; }
.sp-spec--line .sp-spec__head { align-items: flex-start; }
.sp-spec--side { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: var(--sim-space-4); }
.sp-spec--side .sp-spec__id { display: contents; text-align: left; }
.sp-spec--side .sp-tile { grid-row: 1 / span 2; }
.sp-spec--side .sp-spec__head { flex-direction: row; align-items: center; gap: var(--sim-space-2); }
.sim-dom-root--portrait .sp-spec--p-line { display: flex; flex-direction: column; }
.sim-dom-root--portrait .sp-spec--p-line .sp-spec__id { display: flex; flex-direction: row; text-align: left; }
.sim-dom-root--portrait .sp-spec--p-line .sp-spec__head { flex-direction: column; align-items: flex-start; }

/* big dial: a fatter range input with its end labels */
.sp-dial { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sp-dial input[type="range"] { width: 100%; height: 34px; }
.sp-dial input[type="range"]::-webkit-slider-runnable-track { height: 16px; }
.sp-dial input[type="range"]::-webkit-slider-thumb { width: 32px; height: 32px; margin-top: -10px; }
.sp-dial input[type="range"]::-moz-range-thumb { width: 28px; height: 28px; }
.sp-dial__ends { display: flex; justify-content: space-between; font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label-muted); font-variant-numeric: tabular-nums; }

/* a compared pair: two cards with a quiet word between them, never a verdict */
.sp-pair { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: stretch; gap: var(--sim-space-2); }
.sp-pair__mid { align-self: center; padding: var(--sim-space-1) var(--sim-space-2); border-radius: var(--sim-radius-pill); background: var(--sim-track);
  font-weight: 800; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }

/* picture table: a tile + name column, then the caller's cells */
.sp-ptab { display: flex; flex-direction: column; min-width: 0; }
.sp-ptab__row { display: grid; grid-template-columns: var(--sp-ptab-cols); align-items: center; gap: var(--sim-space-3); padding: 6px 0; min-height: 44px; }
.sp-ptab__row + .sp-ptab__row { border-top: 1px solid var(--sim-track); }
.sp-ptab__head { min-height: 0; padding: 0 0 var(--sim-space-1); border-bottom: 2px solid var(--sim-track); font-weight: 800; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }
.sp-ptab__head + .sp-ptab__row { border-top: 0; }
.sp-ptab__name { display: flex; align-items: center; gap: var(--sim-space-2); min-width: 0; font-weight: 700; font-size: var(--sim-text-md); line-height: 1.2; color: var(--sim-label); }
.sp-ptab__cell { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.sp-ptab__label { display: flex; flex-wrap: wrap; align-items: center; gap: 2px var(--sim-space-2); min-width: 0; }
.sp-ptab__label .sp-spec__tag { white-space: nowrap; }
.sp-ptab--inline .sp-ptab__cell { flex-direction: row; align-items: center; gap: var(--sim-space-2); }
.sp-ptab--inline .sp-ptab__cell > :first-child { flex: none; min-width: 4.6em; }
.sp-ptab--inline .sp-ptab__cell > :last-child { flex: 1 1 auto; }
.sp-ptab__divide { margin: var(--sim-space-1) 0 0; border-top: 2px dashed var(--sim-stroke); }
.sp-ptab__divide + .sp-ptab__row { border-top: 0; }

/* readouts and card groups: readoutHtml, thermoReadHtml, cardRowHtml, dialRowsHtml, pairHtml dials */
.sp-read { display: flex; align-items: baseline; justify-content: center; gap: var(--sim-space-2); }
.sp-temp { display: flex; align-items: center; gap: var(--sim-space-2); min-width: 0; }
.sp-temp .sp-thermo { flex: 1 1 auto; }
.sp-temp .sp-num { flex: none; min-width: 3.4em; text-align: left; }
.sp-cards { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: var(--sim-space-3); }
.sp-cards .sp-spec__body { gap: var(--sim-space-3); }
.sp-cards .sp-read { flex-wrap: wrap; row-gap: var(--sim-space-1); }
.sp-cards .sp-read .sp-cap { flex-basis: 100%; text-align: center; line-height: 1.2; }
.sp-dialrows { display: flex; flex-direction: column; gap: var(--sim-space-3); }
.sp-dialrows .sp-spec { grid-template-columns: auto auto minmax(0, 1fr) 10.5em; grid-template-areas: "tile head head temp" "tile read dial temp";
  column-gap: var(--sim-space-4); row-gap: 0; padding: var(--sim-space-2) var(--sim-space-4); }
.sp-dialrows .sp-spec__body { display: contents; }
.sp-dialrows .sp-tile { grid-area: tile; }
.sp-dialrows .sp-spec__head { grid-area: head; }
.sp-dialrows .sp-read { grid-area: read; justify-content: flex-start; }
.sp-dialrows .sp-dial { grid-area: dial; }
.sp-dialrows .sp-temp { grid-area: temp; }
.sp-pair--dials .sp-spec { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "id id" "read temp" "dial temp"; gap: var(--sim-space-2) var(--sim-space-4); }
.sp-pair--dials .sp-spec__id { grid-area: id; }
.sp-pair--dials .sp-spec__body { display: contents; }
.sp-pair--dials .sp-read { grid-area: read; justify-content: flex-start; align-self: end; }
.sp-pair--dials .sp-dial { grid-area: dial; align-self: start; }
.sp-pair--dials .sp-temp { grid-area: temp; flex-direction: column-reverse; gap: var(--sim-space-1); }
.sp-pair--dials .sp-temp .sp-num { min-width: 0; text-align: center; }
/* portrait */
.sim-dom-root--portrait .sp-ptab--p-compact .sp-ptab__row { grid-template-columns: var(--sp-ptab-pcols, var(--sp-ptab-cols)); gap: var(--sim-space-2); min-height: 38px; padding: 4px 0; }
.sim-dom-root--portrait .sp-ptab--p-compact .sp-tile { --sp-tile: 28px !important; }
.sim-dom-root--portrait .sp-ptab--p-compact .sp-ptab__name { font-size: var(--sim-text-sm); }
.sim-dom-root--portrait .sp-ptab--p-compact .sp-spec__tag, .sim-dom-root--portrait .sp-ptab--p-compact .sp-scale, .sim-dom-root--portrait .sp-ptab--p-compact .sp-thermo { display: none; }
.sim-dom-root--portrait .sp-cards { grid-template-columns: minmax(0, 1fr); grid-auto-flow: row; gap: var(--sim-space-2); }
.sim-dom-root--portrait .sp-cards .sp-spec { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "tile head read" "tile scale scale" "tile temp temp";
  gap: var(--sim-space-1) var(--sim-space-3); padding: var(--sim-space-2) var(--sim-space-3); }
.sim-dom-root--portrait .sp-cards .sp-spec__id, .sim-dom-root--portrait .sp-cards .sp-spec__body { display: contents; }
.sim-dom-root--portrait .sp-cards .sp-tile { --sp-tile: 56px !important; grid-area: tile; align-self: center; }
.sim-dom-root--portrait .sp-cards .sp-spec__head { grid-area: head; align-items: flex-start; align-self: center; }
.sim-dom-root--portrait .sp-cards .sp-read { grid-area: read; }
.sim-dom-root--portrait .sp-cards .sp-read .sp-num { font-size: var(--sim-text-lg); }
.sim-dom-root--portrait .sp-cards .sp-read .sp-cap { display: none; }
.sim-dom-root--portrait .sp-cards .sp-scale { grid-area: scale; }
.sim-dom-root--portrait .sp-cards .sp-scale__ticks { display: none; }
.sim-dom-root--portrait .sp-cards .sp-temp { grid-area: temp; }
.sim-dom-root--portrait .sp-dialrows { gap: var(--sim-space-2); }
.sim-dom-root--portrait .sp-dialrows .sp-spec { grid-template-columns: auto auto minmax(0, 1fr) auto; grid-template-areas: "tile head head temp" "read read dial dial";
  gap: var(--sim-space-1) var(--sim-space-2); padding: var(--sim-space-2) var(--sim-space-3); }
.sim-dom-root--portrait .sp-dialrows .sp-tile { --sp-tile: 44px !important; }
.sim-dom-root--portrait .sp-dialrows .sp-spec__title { font-size: var(--sim-text-md); }
.sim-dom-root--portrait .sp-dialrows .sp-temp { flex-direction: column-reverse; align-items: stretch; gap: 2px; width: 6.4em; }
.sim-dom-root--portrait .sp-dialrows .sp-temp .sp-num { min-width: 0; text-align: center; font-size: var(--sim-text-lg); }
.sim-dom-root--portrait .sp-dialrows .sp-read { flex-direction: row; align-items: baseline; gap: var(--sim-space-1); }
.sim-dom-root--portrait .sp-pair__mid { padding: var(--sim-space-1); }
.sim-dom-root--portrait .sp-pair--dials { gap: var(--sim-space-1); }
.sim-dom-root--portrait .sp-pair--dials .sp-spec { grid-template-columns: minmax(0, 1fr); grid-template-areas: "id" "read" "dial" "temp"; padding: var(--sim-space-2); gap: var(--sim-space-1); }
.sim-dom-root--portrait .sp-pair--dials .sp-spec__id { flex-direction: column; text-align: center; }
.sim-dom-root--portrait .sp-pair--dials .sp-spec__head { align-items: center; }
.sim-dom-root--portrait .sp-pair--dials .sp-tile { --sp-tile: 52px !important; }
.sim-dom-root--portrait .sp-pair--dials .sp-read { justify-content: center; }
.sim-dom-root--portrait .sp-pair--dials .sp-temp { flex-direction: row; justify-content: center; }
.sim-dom-root--portrait .sp-pair--dials .sp-thermo { flex: none; --sp-thermo-h: 68px !important; }

@keyframes sp-win { from { transform: scale(0.85); background: transparent; box-shadow: none; } to { transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .sp-seats--in .sp-seatg, .sp-ring__seg, .sp-ring__lab, .sp-key__row, .sp-key__row.is-win { animation: none; }
  .sp-seat { transition: none; }
}
@keyframes sp-pop { from { transform: scale(0.2); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes sp-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes sp-ray { from { stroke-dashoffset: 34; } to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) {
  .sp-tile[data-alb] .sp-tile__out, .sp-tile[data-alb] .sp-tile__halo { animation: none; }
  .sp-thermo__fill, .sp-thermo__band, .sp-scale__band, .sp-scale__knob { transition: none; }
}
`;

const SVG_NS = 'http://www.w3.org/2000/svg';
const tone = (t) => `var(--sim-series-${t})`;
const lip = (t) => `color-mix(in oklab, var(--sim-series-${t}) 68%, black)`;
const f1 = (v) => Math.round(v * 10) / 10;

// Chamber geometry (viewBox units). The vote ring sits outside the outer seat row.
const CX = 200;
const CY = 200;
const R0 = 72;
const R1 = 150;
const RV = 168;

/**
 * Seats on concentric half-circle rows, ordered left to right by angle so a run
 * of equal tones fills a wedge (the usual parliament chart).
 */
export function hemicycleSeats(n) {
  if (!n) return { seats: [], r: 0 };
  const rows = Math.max(1, Math.min(8, Math.round(Math.sqrt(n / 3.5))));
  const radii = rows === 1 ? [(R0 + R1) / 2] : Array.from({ length: rows }, (_, i) => R0 + ((R1 - R0) * i) / (rows - 1));
  const sum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.max(1, Math.round((n * r) / sum)));
  let diff = n - counts.reduce((a, b) => a + b, 0);
  for (let i = rows - 1; diff !== 0; i = (i - 1 + rows) % rows) {
    const step = diff > 0 ? 1 : -1;
    if (counts[i] + step >= 1) { counts[i] += step; diff -= step; }
  }
  const seats = [];
  let arcGap = Infinity;
  radii.forEach((r, row) => {
    const k = counts[row];
    if (k > 1) arcGap = Math.min(arcGap, (Math.PI * r) / (k - 1));
    for (let j = 0; j < k; j += 1) {
      const a = Math.PI * (1 - (k === 1 ? 0.5 : j / (k - 1)));
      seats.push({ x: CX + r * Math.cos(a), y: CY - r * Math.sin(a), a, row });
    }
  });
  seats.sort((p, q) => q.a - p.a || p.row - q.row);
  const rowGap = rows > 1 ? (R1 - R0) / (rows - 1) : 60;
  return { seats, r: Math.min(rowGap, arcGap, 60) * 0.42 };
}

function svgEl(tag, attrs, cls) {
  const node = document.createElementNS(SVG_NS, tag);
  if (cls) node.setAttribute('class', cls);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

const polar = (r, a) => [f1(CX + r * Math.cos(a)), f1(CY - r * Math.sin(a))];

/** Mount the chamber into host (its children are replaced). Returns { el, set }. */
export function mountParliament(host, { key: keyAt = 'side' } = {}) {
  host.textContent = '';
  const wrap = document.createElement('div');
  wrap.className = keyAt === 'below' ? 'sp-parl sp-parl--below' : 'sp-parl';
  const svg = svgEl('svg', { viewBox: '-30 -6 460 230', 'aria-hidden': 'true', focusable: 'false' }, 'sp-parl__svg');
  svg.appendChild(svgEl('path', { d: `M ${CX - R1 - 22} ${CY} A ${R1 + 22} ${R1 + 22} 0 0 1 ${CX + R1 + 22} ${CY} Z` }, 'sp-parl__floor'));
  const ringTrack = svgEl('path', { d: `M ${CX - RV} ${CY} A ${RV} ${RV} 0 0 1 ${CX + RV} ${CY}` }, 'sp-ring__track');
  svg.appendChild(ringTrack);
  const ring = svgEl('g', {});
  svg.appendChild(ring);
  const seatsG = svgEl('g', {});
  svg.appendChild(seatsG);
  const needLine = svgEl('line', { x1: CX, y1: CY - R0 + 26, x2: CX, y2: CY - R1 - 12 }, 'sp-parl__need');
  needLine.style.display = 'none';
  svg.appendChild(needLine);
  svg.appendChild(svgEl('line', { x1: CX - R1 - 30, y1: CY + 20, x2: CX + R1 + 30, y2: CY + 20 }, 'sp-parl__base'));
  const num = svgEl('text', { x: CX, y: CY - 20, 'text-anchor': 'middle' }, 'sp-parl__n');
  const numLab = svgEl('text', { x: CX, y: CY + 12, 'text-anchor': 'middle' }, 'sp-parl__nl');
  numLab.textContent = 'seats';
  svg.appendChild(num);
  svg.appendChild(numLab);
  const cap = svgEl('text', { x: CX - RV - 10, y: CY + 4, 'text-anchor': 'end' }, 'sp-ring__cap');
  svg.appendChild(cap);
  wrap.appendChild(svg);
  const key = document.createElement('ul');
  key.className = 'sp-key';
  wrap.appendChild(key);
  host.appendChild(wrap);

  let nodes = [];
  let groups = [];
  let ringSig = '';
  let keySig = '';
  let sweepMs = 0;

  function buildSeats(n) {
    seatsG.textContent = '';
    const { seats, r } = hemicycleSeats(n);
    // The left-to-right sweep: about a second whatever the seat count (a small chamber fills seat by seat).
    const step = Math.min(40, 1000 / Math.max(1, n));
    sweepMs = Math.round(step * Math.max(0, n - 1)) + 400;
    groups = [];
    nodes = seats.map((s, i) => {
      const g = svgEl('g', {}, 'sp-seatg');
      const d = `${Math.round(i * step)}ms`;
      g.style.setProperty('--d', d);
      const under = svgEl('circle', { cx: f1(s.x), cy: f1(s.y + r * 0.22), r: f1(r) }, 'sp-seat sp-seat--lip');
      const top = svgEl('circle', { cx: f1(s.x), cy: f1(s.y), r: f1(r * 0.96) }, 'sp-seat');
      under.style.setProperty('--d', d);
      top.style.setProperty('--d', d);
      g.appendChild(under);
      g.appendChild(top);
      seatsG.appendChild(g);
      groups.push(g);
      return { under, top };
    });
  }

  function popIn() {
    seatsG.classList.remove('sp-seats--in');
    void seatsG.getBoundingClientRect?.();
    seatsG.classList.add('sp-seats--in');
  }

  function paintRing(votes, label) {
    const sig = JSON.stringify([votes, label]);
    if (sig === ringSig) return;
    ringSig = sig;
    ring.textContent = '';
    ringTrack.style.display = votes.length ? '' : 'none';
    cap.textContent = votes.length ? (label || 'votes') : '';
    const total = votes.reduce((a, v) => a + (v.pct || 0), 0) || 1;
    const gap = 0.025;
    let at = Math.PI;
    for (const v of votes) {
      const span = (Math.PI * (v.pct || 0)) / total;
      if (span <= 0) continue;
      const a0 = at - (at === Math.PI ? 0 : gap / 2);
      const a1 = at - span + (at - span <= 0.0001 ? 0 : gap / 2);
      const [x0, y0] = polar(RV, a0);
      const [x1, y1] = polar(RV, a1);
      const seg = svgEl('path', { d: `M ${x0} ${y0} A ${RV} ${RV} 0 0 1 ${x1} ${y1}` }, 'sp-ring__seg');
      seg.style.stroke = tone(v.tone);
      ring.appendChild(seg);
      if (v.label) {
        const mid = at - span / 2;
        const [lx, ly] = polar(RV + 18, mid);
        const c = Math.cos(mid);
        const t = svgEl('text', { x: lx, y: f1(ly + 5), 'text-anchor': c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle' }, 'sp-ring__lab');
        t.textContent = v.label;
        ring.appendChild(t);
      }
      at -= span;
    }
  }

  function paintKey(entries, need, of) {
    const sig = JSON.stringify([entries, need, of]);
    if (sig === keySig) return;
    keySig = sig;
    key.style.setProperty('--sweep', `${sweepMs}ms`);
    key.innerHTML = entries.map((e) => `<li class="sp-key__row${e.win ? ' is-win' : ''}" style="--tone:${tone(Number(e.tone) || 1)}"><i class="sp-key__dot"></i>${esc(e.text)}</li>`).join('')
      + (need ? `<li class="sp-key__row sp-key__row--need"><i class="sp-key__need"></i>${esc(`${need} of ${of} for a majority`)}</li>` : '');
    key.hidden = !entries.length && !need;
  }

  function onSwept(cb) {
    const last = groups[groups.length - 1];
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!last || reduced || !last.addEventListener) { Promise.resolve().then(cb); return; }
    last.addEventListener('animationend', () => cb(), { once: true });
  }

  function set({ seats = [], votes = [], key: entries = [], total, votesLabel, need = 0 } = {}) {
    const fresh = seats.length !== nodes.length;
    if (fresh) buildSeats(seats.length);
    seats.forEach((t, i) => {
      const { under, top } = nodes[i];
      const empty = !t;
      under.classList.toggle('is-empty', empty);
      top.classList.toggle('is-empty', empty);
      under.style.fill = empty ? '' : lip(t);
      top.style.fill = empty ? '' : tone(t);
    });
    if (fresh) popIn();
    num.textContent = String(total ?? seats.length);
    needLine.style.display = need ? '' : 'none';
    paintRing(votes, votesLabel);
    paintKey(entries, need, total ?? seats.length);
  }

  return { el: wrap, set, onSwept };
}

// ---- material tiles --------------------------------------------------------

// A tiny seeded generator so each tile's grit is the same on every mount.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mix = (a, pct, b) => `color-mix(in oklab, var(--sim-${a}) ${pct}%, ${b.startsWith('-') ? `var(--sim${b})` : b})`;
const shape = (tag, attrs, fill, extra = '') => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')} style="fill:${fill};${extra}"/>`;

function grit(seed, n, colours, rMin, rMax, yMin = 22) {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < n; i += 1) {
    const x = f1(2 + r() * 44);
    const y = f1(yMin + r() * (46 - yMin));
    const rr = f1(rMin + r() * (rMax - rMin));
    out += shape('ellipse', { cx: x, cy: y, rx: rr, ry: f1(rr * 0.7) }, colours[i % colours.length]);
  }
  return out;
}

function pebbles(seed, n, colours, size, yMin = 22) {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < n; i += 1) {
    const x = 2 + r() * 44;
    const y = yMin + r() * (46 - yMin);
    const s = size * (0.6 + r() * 0.7);
    const pts = [0, 1, 2, 3, 4].map((k) => {
      const a = (k / 5) * Math.PI * 2 + r() * 0.8;
      const d = s * (0.7 + r() * 0.4);
      return `${f1(x + Math.cos(a) * d)},${f1(y + Math.sin(a) * d * 0.7)}`;
    }).join(' ');
    out += shape('polygon', { points: pts }, colours[i % colours.length]);
  }
  return out;
}

// Each kind: the ground (lower part of the tile), drawn under a strip of sky.
// The ground starts at y = 22; the sky above holds the sun and the rays.
const GROUND = {
  snow: () => shape('rect', { x: 0, y: 20, width: 48, height: 28 }, mix('ice', 30, 'white'))
    + shape('ellipse', { cx: 12, cy: 24, rx: 16, ry: 5 }, mix('ice', 12, 'white'))
    + shape('ellipse', { cx: 38, cy: 27, rx: 14, ry: 4.5 }, mix('ice', 12, 'white'))
    + shape('path', { d: 'M4 34 q8 -4 16 0 M26 40 q8 -4 16 0' }, 'none', `stroke:${mix('ice', 70, '-sea-shallow')};stroke-width:1.4;stroke-linecap:round;opacity:0.7`)
    + shape('path', { d: 'M33 33 l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1z' }, 'white'),
  ice: () => shape('rect', { x: 0, y: 20, width: 48, height: 28 }, 'var(--sim-ice)')
    + shape('path', { d: 'M6 48 L22 20 H30 L14 48z M24 48 L36 26 H40 L28 48z' }, mix('ice', 25, 'white'), 'opacity:0.85')
    + shape('path', { d: 'M3 30 l9 4 5 -2 9 7 M30 44 l6 -6 8 2' }, 'none', `stroke:${mix('sea-shallow', 70, '-ice')};stroke-width:1.2;stroke-linecap:round`),
  rock: () => shape('rect', { x: 0, y: 20, width: 48, height: 28 }, mix('strata-5', 55, 'white'))
    + pebbles(11, 16, [mix('strata-5', 80, 'white'), 'var(--sim-strata-5)', mix('strata-5', 40, 'white'), mix('strata-6', 70, '-strata-5')], 3.2),
  'soil-light': () => shape('rect', { x: 0, y: 20, width: 48, height: 28 }, 'var(--sim-strata-1)')
    + grit(23, 22, [mix('strata-2', 70, '-strata-1'), mix('strata-1', 60, 'white'), 'var(--sim-strata-2)'], 0.8, 1.8),
  'soil-black': () => shape('rect', { x: 0, y: 20, width: 48, height: 28 }, mix('strata-6', 62, 'black'))
    + pebbles(37, 12, [mix('strata-6', 85, 'black'), mix('strata-6', 70, '-strata-3'), mix('strata-6', 45, 'black')], 3)
    + grit(41, 10, [mix('strata-3', 40, '-strata-6')], 0.6, 1.2),
  water: () => shape('rect', { x: 0, y: 20, width: 48, height: 28 }, 'var(--sim-sea-deep)')
    + shape('path', { d: 'M0 27 q6 -3 12 0 t12 0 t12 0 t12 0 M-4 35 q6 -3 12 0 t12 0 t12 0 t12 0 M0 43 q6 -3 12 0 t12 0 t12 0 t12 0' }, 'none',
      `stroke:${mix('sea-shallow', 80, 'white')};stroke-width:1.6;stroke-linecap:round;opacity:0.75`),
  grass: () => shape('rect', { x: 0, y: 20, width: 48, height: 28 }, mix('chloro', 62, '-strata-4'))
    + (() => {
      const r = rng(53);
      let d = '';
      for (let i = 0; i < 18; i += 1) {
        const x = f1(1 + r() * 46);
        const y = f1(26 + r() * 22);
        d += `M${x} ${y} l${f1(-1.5 + r() * 3)} ${f1(-4 - r() * 4)} `;
      }
      return shape('path', { d }, 'none', `stroke:${mix('chloro', 80, 'white')};stroke-width:1.5;stroke-linecap:round`);
    })()
    + shape('rect', { x: 0, y: 20, width: 48, height: 3 }, mix('chloro', 70, 'white'), 'opacity:0.6'),
  'rock-bare': () => shape('rect', { x: 0, y: 20, width: 48, height: 28 }, 'var(--sim-strata-5)')
    + shape('path', { d: 'M0 20 H48 V25 Q24 28 0 24z' }, mix('strata-5', 55, 'white'))
    + shape('path', { d: 'M8 26 l5 7 -2 6 4 9 M30 25 l-3 8 6 4 2 11 M42 30 l-5 5' }, 'none',
      `stroke:${mix('strata-6', 80, 'black')};stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round`),
};

let tileSeq = 0;

/**
 * A 44px illustrated patch of a surface with the sun's ray coming in and a
 * reflected ray going out (its strength set by setTileAlbedo). Unknown kinds
 * draw a plain stroke-coloured patch.
 */
export function materialTileHtml(kind, { label = '', size = 0 } = {}) {
  const id = `sp-tile-clip-${(tileSeq += 1)}`;
  const ground = (GROUND[kind] || (() => shape('rect', { x: 0, y: 20, width: 48, height: 28 }, 'var(--sim-shape)')))();
  const sky = shape('rect', { x: 0, y: 0, width: 48, height: 22 }, mix('sky-day', 26, '-bg-surface'));
  const ray = 'M11 10 L22 22';
  const out = 'M26 22 L40 7';
  const head = 'M34.6 7.4 L40 7 L39.8 12.4';
  const sz = size ? ` style="--sp-tile:${Math.round(size)}px"` : '';
  return `<span class="sp-tile" data-kind="${esc(kind)}"${sz}${label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"'}>
    <svg viewBox="0 0 48 48" focusable="false">
      <defs><clipPath id="${id}"><rect x="0" y="0" width="48" height="48" rx="10"/></clipPath></defs>
      <g clip-path="url(#${id})">${sky}${ground}</g>
      <rect class="sp-tile__frame" x="1" y="1" width="46" height="46" rx="10"/>
      <circle class="sp-tile__sun" cx="8" cy="7" r="4.4"/>
      <path class="sp-tile__in" d="${ray} M16.6 20.6 L22 22 L21.2 16.6"/>
      <path class="sp-tile__halo" d="${out} ${head}"/>
      <path class="sp-tile__out" d="${out} ${head}"/>
    </svg>
  </span>`;
}

/** Set the reflected ray's strength on a tile (the .sp-tile element or anything inside a row holding one). */
export function setTileAlbedo(tile, a) {
  const el = tile?.classList?.contains('sp-tile') ? tile : tile?.querySelector?.('.sp-tile');
  if (!el) return;
  if (a == null || !Number.isFinite(a)) {
    el.removeAttribute('data-alb');
    el.style.removeProperty('--alb');
    return;
  }
  el.dataset.alb = '1';
  el.style.setProperty('--alb', String(Math.max(0, Math.min(1, a))));
}

// ---- thermometer -------------------------------------------------------------

export function thermoHtml({ label = '', vertical = false, height = 0 } = {}) {
  const h = vertical && height ? ` style="--sp-thermo-h:${Math.round(height)}px"` : '';
  return `<span class="sp-thermo${vertical ? ' sp-thermo--v' : ''}" data-off${h}${label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"'}>
    <span class="sp-thermo__bulb"></span>
    <span class="sp-thermo__tube"><span class="sp-thermo__band"></span><span class="sp-thermo__fill"></span></span>
  </span>`;
}

/** Fill a thermometer to lo (0..1); a higher hi adds a lighter range band. null empties it (dashed, locked). */
export function setThermo(thermo, lo, hi = lo) {
  const el = thermo?.classList?.contains('sp-thermo') ? thermo : thermo?.querySelector?.('.sp-thermo');
  if (!el) return;
  if (lo == null || !Number.isFinite(lo)) {
    el.setAttribute('data-off', '');
    return;
  }
  const c = (v) => String(Math.max(0, Math.min(1, v)));
  el.removeAttribute('data-off');
  el.style.setProperty('--lo', c(Math.min(lo, hi)));
  el.style.setProperty('--hi', c(Math.max(lo, hi)));
}

// ---- readouts, scale strip, cards, dial, pair, picture table ------------------------

const attrStr = (attrs = {}) => Object.entries(attrs).map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('');

/** A big tabular number; the caller fills it with textContent. attrs e.g. { 'data-temp': '' }. */
export function numHtml(attrs = {}, { size = '', hot = false } = {}) {
  return `<span class="sp-num${size === 'sm' ? ' sp-num--sm' : ''}${hot ? ' sp-num--hot' : ''}"${attrStr(attrs)}></span>`;
}

/** A min..max strip; ticks are evenly spaced labels (e.g. ['0.00', '0.50', '1.00']), [] for none. */
export function scaleStripHtml({ ticks = [], mini = false, label = '' } = {}) {
  return `<span class="sp-scale${mini ? ' sp-scale--mini' : ''}" data-off${label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"'}>
    <span class="sp-scale__track"><span class="sp-scale__band"></span><span class="sp-scale__knob"></span></span>
    ${ticks.length ? `<span class="sp-scale__ticks">${ticks.map((t) => `<span>${esc(t)}</span>`).join('')}</span>` : ''}
  </span>`;
}

/** Position a strip (the .sp-scale element or anything holding one): lo..hi as 0..1; hi omitted = one value; null = empty. */
export function setScaleStrip(strip, lo, hi = lo) {
  const el = strip?.classList?.contains('sp-scale') ? strip : strip?.querySelector?.('.sp-scale');
  if (!el) return;
  if (lo == null || !Number.isFinite(lo)) {
    el.setAttribute('data-off', '');
    return;
  }
  const c = (v) => String(Math.max(0, Math.min(1, v)));
  el.removeAttribute('data-off');
  el.toggleAttribute('data-point', !(hi > lo));
  el.style.setProperty('--lo', c(Math.min(lo, hi)));
  el.style.setProperty('--hi', c(Math.max(lo, hi)));
}

/** A picture card: tile + name (+ tag) and the caller's body markup. title/tag are escaped. */
export function specimenCardHtml({ pic, size = 72, title = '', tag = '', body = '', layout = 'stack', portrait = '', attrs = {} } = {}) {
  const cls = `sp-spec sp-spec--${layout}${portrait ? ` sp-spec--p-${portrait}` : ''}`;
  return `<div class="${cls}"${attrStr(attrs)}>
    <div class="sp-spec__id">${materialTileHtml(pic, { size })}<div class="sp-spec__head"><h4 class="sp-spec__title">${esc(title)}</h4>${tag ? `<span class="sp-spec__tag">${esc(tag)}</span>` : ''}</div></div>
    <div class="sp-spec__body">${body}</div>
  </div>`;
}

/** A big range input with its end labels; the input carries data-dial=key. */
export function valueDialHtml({ key, label = '', min = 0, max = 1, step = 0.01, value = min, ends = [] } = {}) {
  return `<span class="sp-dial">
    <input type="range" data-dial="${esc(key)}" min="${min}" max="${max}" step="${step}" value="${value}"${label ? ` aria-label="${esc(label)}"` : ''}>
    ${ends.length ? `<span class="sp-dial__ends" aria-hidden="true">${ends.map((t) => `<span>${esc(t)}</span>`).join('')}</span>` : ''}
  </span>`;
}

/** Two cards side by side with a quiet word between them. */
export function pairHtml(a, b, mid = '', { dials = false } = {}) {
  return `<div class="sp-pair${dials ? ' sp-pair--dials' : ''}">${a}${mid ? `<span class="sp-pair__mid">${esc(mid)}</span>` : '<span></span>'}${b}</div>`;
}

/** A compact table: tile + name column, then the caller's cells (markup). head entries are escaped. */
export function picTableHtml({ head = [], rows = [], divideBefore = '', cols = '', tile = 32, inline = false, portrait = '', portraitCols = '' } = {}) {
  const n = Math.max(head.length - 1, ...rows.map((r) => (r.cells || []).length), 0);
  const grid = cols || `minmax(0, 1.25fr) repeat(${n}, minmax(0, 1fr))`;
  const pGrid = portraitCols || `minmax(0, 1.6fr) repeat(${n}, minmax(0, 1fr))`;
  const headHtml = head.length ? `<div class="sp-ptab__row sp-ptab__head">${head.map((h) => `<span>${esc(h)}</span>`).join('')}</div>` : '';
  const body = rows.map((r) => `${r.key === divideBefore ? '<div class="sp-ptab__divide" aria-hidden="true"></div>' : ''}<div class="sp-ptab__row" data-row="${esc(r.key)}">
      <span class="sp-ptab__name">${materialTileHtml(r.pic, { size: tile })}<span class="sp-ptab__label"><span>${esc(r.label)}</span>${r.tag ? `<span class="sp-spec__tag">${esc(r.tag)}</span>` : ''}</span></span>
      ${(r.cells || []).map((c) => `<span class="sp-ptab__cell">${c}</span>`).join('')}
    </div>`).join('');
  const compact = portrait === 'compact';
  return `<div class="sp-ptab${inline ? ' sp-ptab--inline' : ''}${compact ? ' sp-ptab--p-compact' : ''}" style="--sp-ptab-cols:${grid}${compact ? `;--sp-ptab-pcols:${pGrid}` : ''}">${headHtml}${body}</div>`;
}

/** A big number with a muted caption; the number carries data-val unless attrs say otherwise. */
export function readoutHtml({ cap = '', size = '', attrs = { 'data-val': '' } } = {}) {
  return `<div class="sp-read">${numHtml(attrs, { size })}${cap ? `<span class="sp-cap">${esc(cap)}</span>` : ''}</div>`;
}

/** A thermometer and its number (data-temp unless attrs say otherwise); fill both with setThermo / textContent. */
export function thermoReadHtml(thermo = {}, numOpts = { hot: true }, attrs = { 'data-temp': '' }) {
  return `<div class="sp-temp">${thermoHtml(thermo)}${numHtml(attrs, numOpts)}</div>`;
}

export function cardRowHtml(cards) {
  return `<div class="sp-cards">${(cards || []).join('')}</div>`;
}

export function dialRowsHtml(cards) {
  return `<div class="sp-dialrows">${(cards || []).join('')}</div>`;
}
