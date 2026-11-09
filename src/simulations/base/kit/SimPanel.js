/**
 * SimPanel - editorial panel parts for DomSimulation scenes: the register of a data-journalism feature
 * (rules, not cards; one big serif reading; numbers with their denominators). Look-neutral API: every
 * colour, face and corner is a token, so the same markup reads as print under plain and as a soft
 * panel under quill. Helpers return HTML strings (text escaped; fields named *Html are the caller's markup).
 *
 *   <div class="spn">                     a column of parts (gap 16); spn-split = two columns, stacked in portrait
 *   readoutHtml({ key, label, value, unit, formula, frac, note, tone, tint, size })
 *       one big reading: kicker label, the numeral (.sim-numeral face), a live formula line under it;
 *       frac { n, d } sets a stacked fraction before the value ("33 smokers / 35 cases = 94.3%")
 *   setReadout(root, key, { value, from, fmt, unit, formulaHtml, noteHtml, dur })   patch it; counts from -> value
 *       (default from: the number shown now) over dur s (0.45); reduced motion: lands at once
 *   ruleTableHtml({ caption, corner, cols, rows, total, pick, sel, hi, note, label })
 *       a ruled table: cols [{ label, sub }], rows [{ label, cells: [v | { v, tag }] }], total { label, cells };
 *       pick 'col' | 'row' makes the heads buttons (data-sflow-action="pick", value = index); sel = the picked
 *       index (or array of indices): its cells tint, the rest dim; band { row | col } tints one without picking; hi [[r, c]] rings cells;
 *       a cell { v, tag, html } may carry a superscript tag or the caller's own markup (html, e.g. a dot strip)
 *   sliderHtml({ action, label, min, max, step, value, valueText, ticks, aria })   a labelled slider: the value
 *       large at the right, tick labels under it (evenly spaced, ends included); fires handlers.input(action, v)
 *   factRowsHtml(rows)   ruled rows [{ key, label, valueHtml, state: 'moves' | 'fixed' }]: what changes beside
 *       what is pinned, read together; a fixed row carries a small "fixed" tag
 *   barsHtml(rows, { rule: true })   (SimChart.js) bar-compare rows; setBar(root, key, frac, text) patches one
 *   columnsHtml({ key, bins, max, marker, axis, ticks, tone })   a plain DOM column chart: bins [{ label, n }];
 *       marker { at: 0..1, label } a dashed rule over the plot; ticks [{ at: 0..1, label }] an edge axis in place of
 *       the per-bin labels; setColumns(root, key, bins, max, fresh) regrows the columns (fresh: index to mark new)
 *   takeawayHtml(lead, rest)   the one sentence the scene is for: bold lead between two rules
 *   stepsHtml(steps, { display })   a calc-steps list [{ label, formulaHtml, gloss, state: 'done' | 'now' | 'todo' }];
 *       display: true is calcStepsHtml (the worked-calculation form)
 *   calcStepsHtml(rows, { size, label })   numbered rows: label left, a big serif formula, one gloss line; rows
 *       [{ label, parts | formulaHtml, gloss, state: 'done' | 'now' | 'todo' | 'hidden', fresh }] ('now' tinted with a
 *       signature edge; 'todo' faint; fresh rises in once)
 *   formulaHtml(parts, { size })   groups joined by "=", wrapping only at "=": text, { n, d } stacked fraction,
 *       { v, key } the value (countValue(root, key, to, { from, fmt, dur }) counts it), { html }
 *   overHtml(n, d)   a stacked fraction (serif, rule between)
 *   revealHtml({ key, label, hideLabel, html, open })   "Show worked arithmetic": a caret chip and its panel
 *   pullQuoteHtml(html, { label, cite, size, key })   the one sentence, serif, signature rule at the left
 *   emHtml(text)   inline emphasis (bold on a highlighter band); editHtml(del, ins) struck original + replacement
 *   promptHtml(text, { done, key })   the line that says the move ("Select the Cases column")
 *   chipsHtml([{ label, action, value, pressed, disabled, bare }])   actionable chips: rim, select ring, picked tint
 *   sentenceHtml({ words: [{ w, fix }], picked, showFix, action, end, size, label })   a sentence of word chips;
 *       a picked word with a fix (showFix) is struck and its fix follows in the signature colour
 *   entryHtml({ fields, action, cta, state, feedback })   numeric entry: fields [{ name, label, value, state }],
 *       a check button (data-sflow-action = action), Enter in a field fires it too; feedback under it
 *   buttonsHtml([{ label, action, value, primary, disabled }])   quiet ruled buttons (primary = the app's primary)
 *   bindPanel(root, { action(name, value, el), input(name, value, el), toggle(key, open, el) })   bindFlow (SimFlowDom)
 *       for clicks plus one input listener and the reveal toggles; call once in setup, re-call to swap handlers
 *   setText(root, key, text)   textContent of [data-spn="key"]
 * Added 2026-11-05 (opt-in; nothing above changed for current callers):
 *   tickHtml(ok, { label })   an inline SVG tick (true) / cross (false) / dash (null), 1em, good / bad tokens
 *   checkListHtml([{ label, ok, note }], { cols, label })   checks with their marks; a failed line bold
 *   datedAxisHtml({ key, from, to, ticks, fmt, lanes, markers, scrub, label })   lanes of spans (band, bracket,
 *       point) over a dated base line; scrub { action, value, step, label, text, aria } is a handle on the line
 *       (native range: keys for free) whose marker follows it; setAxisScrub(root, key, v, { text, aria })
 *   binChipsHtml([{ id, label, n }], { active, action })   destination chips with counts
 *   fileCardHtml({ id, title, fields, bin, aria, disabled }, { action, bins, binAction })   a record card;
 *       placed: solid rim, the bin's short name, its tint; keys 1..n place a focused card (bindPanel place())
 *   cardGridHtml(cards, { cols, portraitCols, label })
 *   chipsHtml(list, { size: 'sm' })   narrow chips; a chip's n is a muted count after its label
 *   ruleTableHtml({ stack: 'portrait' | true })   rows stacked as blocks ("column ... value") in portrait / always
 *   columnsHtml({ values: false })   no numbers over the columns; a bin { hidden: true } is a dashed "?" column
 *   barsHtml(rows, { base: 1, min, max, log, ticks, baseLabel, ends })   bars from a baseline both ways;
 *       setBaseBar(root, key, v, text)
 *   Text floor: chips, cards, checks and axis labels never go under 12px; table cell tags (sup) >= 12px.
 * Root class spn-page (render rootClass): the page paper under the panel, over any course setting (with SETTING 'none').
 * SIM_PANEL_CSS goes in the scene CSS. Not a scene: no class export. Reference: docs/dom-scene-kit.md (SimPanel).
 */
import { esc } from 'simulations/base/SimUi.js';
import { bindFlow } from './SimFlowDom.js';
import { reducedMotion } from './SimAnim.js';

import { barPos } from './SimChart.js';

export { barsHtml } from './SimChart.js';

export const SIM_PANEL_CSS = `
/* spn-page on the scene root: paints the page paper (--sim-bg-deep) under the panel, over any course setting. */
.spn-page { background: var(--sim-bg-deep); }
.spn { display: flex; flex-direction: column; gap: var(--sim-space-4); color: var(--sim-label); font: 400 var(--sim-text-md)/1.45 var(--sim-font); }
.spn *, .spn *::before, .spn *::after { box-sizing: border-box; }
.spn :where(button, input) { font: inherit; color: inherit; }
.spn-split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--sim-space-5); align-items: start; }
.sim-dom-root--portrait .spn-split { grid-template-columns: minmax(0, 1fr); gap: var(--sim-space-4); }
.spn-rule { border-top: 1px solid var(--sim-label); padding-top: var(--sim-space-3); }
.spn-kicker { margin: 0; font-weight: 700; font-size: var(--sim-text-sm); letter-spacing: 0.08em; text-transform: uppercase; color: var(--sim-annot); }
.spn-label { margin: 0; font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label); }
.spn-note { margin: 0; font-size: var(--sim-text-sm); line-height: 1.45; color: var(--sim-label-muted); }
.spn-cap { margin: 0; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }

.spn-read { display: flex; flex-direction: column; gap: var(--sim-space-2); }
.spn-read--tint { padding: var(--sim-space-4) var(--sim-space-5); background: var(--sim-annot-tint); border-radius: var(--sim-radius-sm); }
.spn-read__row { display: flex; align-items: center; flex-wrap: wrap; gap: 0 var(--sim-space-3); }
.spn-read__n { font-family: var(--sim-font-numeral, var(--sim-font-display)); font-weight: 400; font-size: 64px; line-height: 1; letter-spacing: -0.01em;
  font-variant-numeric: lining-nums tabular-nums; color: var(--spn-tone, var(--sim-annot)); white-space: nowrap; }
.spn-read--sm .spn-read__n { font-size: 44px; }
.spn-read__unit { font-size: 0.6em; margin-left: 0.04em; }
.spn-read__f { margin: 0; font-size: var(--sim-text-md); color: var(--sim-label); font-variant-numeric: tabular-nums; }
.spn-read__f b { font-weight: 700; }
.spn-frac { display: inline-grid; justify-items: center; font-family: var(--sim-font-numeral, var(--sim-font-display)); font-size: 34px; line-height: 1.15; color: var(--sim-label); }
.spn-frac__n { padding: 0 0.2em 0.08em; border-bottom: 1.5px solid currentColor; }
.spn-frac__d { padding: 0.08em 0.2em 0; }
.spn-eq { font-family: var(--sim-font-numeral, var(--sim-font-display)); font-size: 34px; color: var(--sim-label-muted); }

.spn-table { width: 100%; border-collapse: collapse; font-variant-numeric: lining-nums tabular-nums; border-top: 1.5px solid var(--sim-label); border-bottom: 1.5px solid var(--sim-label); }
.spn-table caption { caption-side: top; text-align: left; padding-bottom: var(--sim-space-2); font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label); }
.spn-table th, .spn-table td { padding: 10px 12px; border-bottom: 1px solid color-mix(in oklab, var(--sim-stroke) 45%, transparent); transition: background-color 0.25s ease, opacity 0.25s ease, color 0.25s ease; }
.spn-table thead th { border-bottom: 1px solid var(--sim-label); font-weight: 700; font-size: var(--sim-text-sm); text-align: right; vertical-align: bottom; color: var(--sim-label); }
.spn-table thead th:first-child { text-align: left; }
.spn-table tbody th, .spn-table tfoot th { text-align: left; font-weight: 600; font-size: var(--sim-text-md); }
.spn-table td { text-align: right; font-family: var(--sim-font-numeral, var(--sim-font-display)); font-size: 22px; line-height: 1.15; }
.spn-table tfoot th, .spn-table tfoot td { border-bottom: 0; border-top: 1px solid var(--sim-label); font-weight: 700; }
.spn-table tfoot td { font-family: var(--sim-font); font-size: var(--sim-text-md); }
.spn-table .spn-sub { font-weight: 400; color: var(--sim-label-muted); white-space: nowrap; }
.spn-table sup { font-family: var(--sim-font); font-size: 14px; color: var(--sim-label-muted); margin-left: 3px; vertical-align: super; line-height: 0; }
.spn-table .is-sel { background: var(--sim-annot-tint); }
.spn-table td.is-sel, .spn-table th.is-sel { color: var(--sim-label); }
.spn-table .is-hi { box-shadow: inset 0 0 0 2px var(--sim-annot); }
.spn-table .is-dim { opacity: 0.42; }
/* The plain look's ruled table (2026-11-05, the epidemiology prototype's recipe; MarkdownRenderer's plain tables
   match it). DomSimulation sets data-sim-look on the scale wrap; Quill keeps the rules above. A 1px grid in the
   hairline, a tinted head row (small, bold, wrapping), row heads left and numbers right in the sans with tabular
   figures (a big reading is readoutHtml, never a cell), a bold total row on the tint, cell tags as small muted
   superscripts. The picked column or row: the signature tint with a signature edge (top and bottom); the rest
   muted, still readable. is-selh marks a picked head that only this look tints. */
[data-sim-look="plain"] .spn-table { border-top: 0; border-bottom: 0; }
[data-sim-look="plain"] .spn-table caption { line-height: 1.35; }
[data-sim-look="plain"] .spn-table th, [data-sim-look="plain"] .spn-table td { padding: 12px 14px; border: 1px solid var(--sim-track); vertical-align: middle; transition: background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease; }
[data-sim-look="plain"] .spn-table thead th { background: var(--sim-surface-raised); line-height: 1.35; text-wrap: balance; }
[data-sim-look="plain"] .spn-table tbody th { line-height: 1.4; }
[data-sim-look="plain"] .spn-table td { font-family: var(--sim-font); font-weight: 400; font-size: var(--sim-text-md); line-height: 1.4; }
[data-sim-look="plain"] .spn-table tfoot th, [data-sim-look="plain"] .spn-table tfoot td { background: var(--sim-surface-raised); font-weight: 700; font-size: var(--sim-text-md); }
/* A cell tag: 0.75em of the cell, never under 12px (0.7em of a 16px cell was 11.2px). */
[data-sim-look="plain"] .spn-table sup { font-size: max(12px, 0.75em); font-weight: 400; margin-left: 2px; }
[data-sim-look="plain"] .spn-table .is-sel, [data-sim-look="plain"] .spn-table .is-selh { background: var(--sim-annot-tint); color: var(--sim-label); }
/* The edges are borders, not inset shadows: a look with flattenScenes drops a solid inset shadow as a lip. */
[data-sim-look="plain"] .spn-table--col thead th.is-sel, [data-sim-look="plain"] .spn-table--col thead th.is-selh { border-top: 3px solid var(--sim-annot); }
[data-sim-look="plain"] .spn-table--col tfoot td.is-sel, [data-sim-look="plain"] .spn-table--col tbody:last-child tr:last-child td.is-sel { border-bottom: 3px solid var(--sim-annot); }
[data-sim-look="plain"] .spn-table--row .is-sel, [data-sim-look="plain"] .spn-table--row .is-selh { border-top: 2px solid var(--sim-annot); border-bottom: 2px solid var(--sim-annot); }
[data-sim-look="plain"] .spn-table .is-dim { opacity: 1; color: var(--sim-label-muted); }
.spn-pick { display: inline-flex; flex-direction: column; align-items: flex-end; gap: 2px; min-height: 40px; justify-content: flex-end; width: 100%; padding: 0; border: 0; background: none; cursor: pointer; text-align: right;
  font-weight: 700; font-size: var(--sim-text-sm); }
.spn-pick__t { padding-bottom: 3px; border-bottom: 2px dashed var(--sim-stroke); }
.spn-pick:hover .spn-pick__t { border-bottom-color: var(--sim-annot); }
.spn-pick[aria-pressed="true"] .spn-pick__t { border-bottom: 2px solid var(--sim-annot); color: var(--sim-annot); }
.spn-pick:focus-visible { outline: 2px solid var(--sim-annot); outline-offset: 3px; }
.spn-tablewrap { width: 100%; overflow-x: auto; }

.spn-slider { display: flex; flex-direction: column; gap: var(--sim-space-2); }
.spn-slider__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sim-space-3); }
.spn-slider__val { font-family: var(--sim-font-numeral, var(--sim-font-display)); font-size: 34px; line-height: 1; color: var(--sim-annot); font-variant-numeric: lining-nums tabular-nums; }
.spn-slider input[type="range"] { -webkit-appearance: none; appearance: none; width: 100%; height: 32px; margin: 0; background: transparent; cursor: pointer; touch-action: pan-y; }
.spn-slider input[type="range"]::-webkit-slider-runnable-track { height: 3px; border: 0; border-radius: 0;
  background: linear-gradient(90deg, var(--sim-annot) var(--sim-range-p, 0%), var(--sim-track) var(--sim-range-p, 0%)); }
.spn-slider input[type="range"]::-moz-range-track { height: 3px; border: 0; border-radius: 0; background: var(--sim-track); }
.spn-slider input[type="range"]::-moz-range-progress { height: 3px; background: var(--sim-annot); }
.spn-slider input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; margin-top: -9.5px; border-radius: 50%;
  background: var(--sim-annot); border: 4px solid var(--sim-bg-surface); box-shadow: 0 0 0 1.5px var(--sim-annot); }
.spn-slider input[type="range"]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: var(--sim-annot); border: 4px solid var(--sim-bg-surface); box-shadow: 0 0 0 1.5px var(--sim-annot); }
.spn-slider input[type="range"]:focus-visible { outline: 2px solid var(--sim-annot); outline-offset: 2px; }
.spn-slider__ticks { display: flex; justify-content: space-between; margin: 0 2px; font-size: var(--sim-text-sm); color: var(--sim-label-muted); font-variant-numeric: tabular-nums; }

.spn-rows { margin: 0; border-top: 1px solid var(--sim-label); }
.spn-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sim-space-3); padding: 12px 0; border-bottom: 1px solid color-mix(in oklab, var(--sim-stroke) 45%, transparent); }
.spn-row dt { font-size: var(--sim-text-md); color: var(--sim-label); }
.spn-row dd { margin: 0; display: flex; align-items: baseline; gap: var(--sim-space-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.spn-row dd b { font-weight: 700; }
.spn-row--moves dd b { color: var(--sim-annot); }
.spn-row__tag { font-size: var(--sim-text-sm); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--sim-label-muted); }

.spn-cols { position: relative; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); align-items: end; gap: 6px; height: 190px; padding-top: 26px; border-bottom: 1.5px solid var(--sim-label); }
.spn-col { position: relative; display: flex; flex-direction: column; justify-content: flex-end; align-items: stretch; height: 100%; }
.spn-col__bar { height: calc(var(--h, 0) * 100%); min-height: 1px; background: var(--spn-tone, var(--sim-accent)); transition: height 0.45s cubic-bezier(0.2, 0, 0, 1); }
.spn-col__n { position: absolute; left: 0; right: 0; bottom: calc(var(--h, 0) * 100% + 4px); text-align: center; font-size: var(--sim-text-sm); font-weight: 600; color: var(--sim-label-muted); font-variant-numeric: tabular-nums; transition: bottom 0.45s cubic-bezier(0.2, 0, 0, 1); }
.spn-cols__x { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 6px; margin-top: 6px; font-size: var(--sim-text-sm); color: var(--sim-label-muted); text-align: center; font-variant-numeric: tabular-nums; }
.spn-cols__axis { margin: 2px 0 0; font-size: var(--sim-text-sm); color: var(--sim-label-muted); text-align: center; }
.spn-mark { position: absolute; top: 0; bottom: 0; width: 0; border-left: 2px dashed var(--sim-label); pointer-events: none; }
.spn-mark__t { position: absolute; top: 0; right: 6px; white-space: nowrap; padding: 2px 6px; font-size: var(--sim-text-sm); font-weight: 700; background: var(--sim-annot-tint); color: var(--sim-label); }
.spn-cols__ticks { position: relative; height: 1.5em; margin-top: 6px; font-size: var(--sim-text-sm); color: var(--sim-label-muted); font-variant-numeric: tabular-nums; }
.spn-cols__ticks span { position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap; }
.spn-cols__ticks span:first-child { transform: none; }
.spn-cols__ticks span:last-child { transform: translateX(-100%); }
.spn-col.is-new .spn-col__bar { background: var(--sim-annot); }

.spn-take { margin: 0; padding: var(--sim-space-3) 0; border-top: 1px solid var(--sim-label); border-bottom: 1px solid var(--sim-label); font-size: var(--sim-text-lg); line-height: 1.45; }
.spn-take b { font-weight: 700; }

.spn-steps { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--sim-label); }
.spn-step { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; align-items: baseline; gap: var(--sim-space-3); padding: 11px 0; border-bottom: 1px solid color-mix(in oklab, var(--sim-stroke) 45%, transparent); transition: opacity 0.25s ease; }
.spn-step__n { font-family: var(--sim-font-numeral, var(--sim-font-display)); font-size: 22px; line-height: 1; color: var(--sim-annot); }
[data-sim-look="plain"] .spn-step__n { font-family: var(--sim-font); font-weight: 700; font-size: var(--sim-text-lg); font-variant-numeric: lining-nums tabular-nums; }
.spn-step__l { font-size: var(--sim-text-md); }
.spn-step__f { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--sim-label-muted); }
.spn-step__f b { color: var(--sim-label); font-weight: 700; font-size: var(--sim-text-lg); }
.spn-step--todo { opacity: 0.45; }
.sim-dom-root--portrait .spn-step { grid-template-columns: 26px minmax(0, 1fr); row-gap: 2px; }
.sim-dom-root--portrait .spn-step__f { grid-column: 2; }
.spn-step--now .spn-step__l { font-weight: 700; }

.spn-entry { display: flex; flex-direction: column; gap: var(--sim-space-2); }
.spn-entry__row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sim-space-2) var(--sim-space-4); }
.spn-field { display: inline-flex; align-items: center; gap: var(--sim-space-2); white-space: nowrap; font-size: var(--sim-text-md); }
.spn-field input { width: 5.2em; min-height: 40px; padding: 4px 8px; font-size: var(--sim-text-lg); font-variant-numeric: tabular-nums; text-align: right;
  background: var(--sim-bg-surface); border: 0; border-bottom: 2px solid var(--sim-label); border-radius: 0; }
.spn-field input:focus-visible { outline: 2px solid var(--sim-annot); outline-offset: 2px; }
.spn-field--bad input { border-bottom-color: var(--sim-bad); }
.spn-field--ok input { border-bottom-color: var(--sim-good); }
.spn-field b { min-width: 3.6em; text-align: right; font-size: var(--sim-text-lg); font-variant-numeric: tabular-nums; }
.spn-fb { margin: 0; min-height: 1.45em; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }
.spn-fb--bad { color: var(--sim-bad); }
.spn-fb--ok { color: var(--sim-good); font-weight: 700; }

.spn-btns { display: flex; flex-wrap: wrap; gap: var(--sim-space-2) var(--sim-space-3); align-items: center; }
.spn-btn { min-height: 44px; padding: 8px 16px; border: 1px solid var(--sim-label); border-radius: var(--sim-radius-sm); background: transparent; font-weight: 700; font-size: var(--sim-text-md); cursor: pointer;
  transition: background-color 0.15s ease; }
.spn-btn:hover:not(:disabled) { background: color-mix(in oklab, var(--sim-label) 6%, transparent); }
.spn-btn--primary { background: var(--sim-annot-tint); border-color: var(--sim-label); }
.spn-btn--primary:hover:not(:disabled) { background: color-mix(in oklab, var(--sim-annot) 22%, transparent); }
.spn-btn--quiet { border-color: transparent; color: var(--sim-label-muted); }
.spn-btn:disabled { opacity: 0.4; cursor: default; }
.spn-btn:focus-visible { outline: 2px solid var(--sim-annot); outline-offset: 2px; }

/* -- 2026-11-05 W2: worked calculation, emphasis, affordance (docs/numericals.md 2-4) ----------------------- */
/* A formula: groups joined by "=", each group nowrap, so a narrow panel wraps only at an equals sign.
   Serif at display size (24px and up), lining tabular figures; a stacked fraction is numerator over a rule. */
.spn-fx { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.1em 0.32em; font-family: var(--sim-font-numeral, var(--sim-font-display));
  font-weight: 400; font-size: var(--spn-fx-size, 28px); line-height: 1.2; color: var(--sim-label); font-variant-numeric: lining-nums tabular-nums; }
.spn-fx__g { display: inline-flex; align-items: center; gap: 0.32em; white-space: nowrap; }
.spn-fx__eq { color: var(--sim-label-muted); }
.spn-fx__v { font-weight: 400; color: var(--sim-annot); }
.spn-over { display: inline-grid; justify-items: center; vertical-align: middle; font-size: 0.92em; line-height: 1.12; }
.spn-over__n { padding: 0 0.18em 0.06em; border-bottom: 1.5px solid currentColor; }
.spn-over__d { padding: 0.06em 0.18em 0; }

/* Calc steps, display form: number and label left, the big formula, one gloss line under it. */
.spn-calc { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--sim-label); }
.spn-calc__row { display: grid; grid-template-columns: 7.2em minmax(0, 1fr); align-items: baseline; gap: var(--sim-space-1) var(--sim-space-4);
  padding: 12px var(--sim-space-3) 12px 0; border-bottom: 1px solid color-mix(in oklab, var(--sim-stroke) 45%, transparent);
  border-left: 3px solid transparent; transition: background-color 0.25s ease, opacity 0.25s ease, border-color 0.25s ease; }
.spn-calc__k { display: flex; align-items: baseline; gap: 0.45em; padding-left: var(--sim-space-2); font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label); }
.spn-calc__k b { font-weight: 700; font-size: var(--sim-text-md); font-variant-numeric: lining-nums tabular-nums; color: var(--sim-annot); }
.spn-calc__body { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--sim-space-3); min-width: 0; }
.spn-calc__body > .spn-fx { flex: 1 0 100%; }
.spn-calc__g { margin: 0; font-size: var(--sim-text-sm); line-height: 1.4; color: var(--sim-label-muted); }
.spn-calc__row--now { background: color-mix(in oklab, var(--sim-annot-tint) 70%, transparent); border-left-color: var(--sim-annot); }
.spn-calc__row--todo { opacity: 0.4; }
.spn-calc__row--todo .spn-calc__g { visibility: hidden; }
.spn-calc__row.is-fresh { animation: spn-rise 0.24s ease-out both; }
.sim-dom-root--portrait { --spn-fx-size: 25px; --spn-quote-size: 23px; --spn-sent-size: 23px; }
.sim-dom-root--portrait .spn-calc__row { grid-template-columns: minmax(0, 1fr); padding-left: 0; }
.sim-dom-root--portrait .spn-calc__body { padding-left: var(--sim-space-2); }
@keyframes spn-rise { from { opacity: 0; transform: translateY(6px); } }

/* A reveal ("Show worked arithmetic"): a quiet chip with a caret; the panel opens under it. */
.spn-reveal { margin: 0; }
.spn-calc__body .spn-reveal[open] { flex-basis: 100%; }
.spn-calc__body .spn-reveal > summary { min-height: 32px; padding: 3px 10px; }
.spn-reveal > summary { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 6px 12px; list-style: none; cursor: pointer;
  border: 1px solid color-mix(in oklab, var(--sim-label) 35%, transparent); border-radius: var(--sim-radius-sm); font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label);
  transition: background-color 0.15s ease, border-color 0.15s ease; }
.spn-reveal > summary::-webkit-details-marker { display: none; }
.spn-reveal > summary::before { content: ''; width: 7px; height: 7px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: translateY(-2px) rotate(45deg); transition: transform 0.2s ease; }
.spn-reveal[open] > summary::before { transform: translateY(2px) rotate(-135deg); }
.spn-reveal > summary:hover { border-color: var(--sim-annot); background: color-mix(in oklab, var(--sim-annot-tint) 55%, transparent); }
.spn-reveal > summary:focus-visible { outline: 2px solid var(--sim-annot); outline-offset: 2px; }
.spn-reveal__hide, .spn-reveal[open] .spn-reveal__show { display: none; }
.spn-reveal[open] .spn-reveal__hide { display: inline; }
.spn-reveal__body { margin-top: var(--sim-space-2); padding: var(--sim-space-2) 0 var(--sim-space-2) var(--sim-space-3); border-left: 2px solid var(--sim-track);
  font-size: var(--sim-text-md); line-height: 1.5; font-variant-numeric: lining-nums tabular-nums; animation: spn-rise 0.2s ease-out both; }
.spn-reveal__body p { margin: 0; }

/* Emphasis: a pull quote (serif, signature rule at the left), an inline highlighter mark, an edit (struck original,
   the replacement in the signature colour). */
.spn-quote { margin: 0; display: flex; flex-direction: column; gap: var(--sim-space-2); }
.spn-quote__t { margin: 0; padding: 2px 0 2px var(--sim-space-4); border-left: 3px solid var(--sim-annot);
  font-family: var(--sim-font-numeral, var(--sim-font-display)); font-size: var(--spn-quote-size, 26px); line-height: 1.35; color: var(--sim-label); }
.spn-quote__cite { margin: 0; padding-left: calc(var(--sim-space-4) + 3px); font-size: var(--sim-text-sm); color: var(--sim-label-muted); }
.spn-em { padding: 0 0.12em; font-weight: 700; color: var(--sim-label); background: linear-gradient(transparent 38%, var(--sim-annot-tint) 38%, var(--sim-annot-tint) 92%, transparent 92%);
  -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.spn-del { color: var(--sim-label-muted); text-decoration: line-through 2px var(--sim-bad); }
.spn-ins { text-decoration: none; color: var(--sim-annot); font-weight: 700; }
.spn-quote__t .spn-ins { font-weight: 400; text-decoration: underline 2px var(--sim-annot); text-underline-offset: 0.18em; }

/* Affordance: anything the learner acts on. A chip (rim, paper fill, a small select ring), hover and focus ring,
   a picked state that is unmistakable (signature tint, signature rim, the ring filled). One prompt line says the move. */
.spn-act { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 6px 12px; margin: 0; cursor: pointer;
  border: 1.5px solid color-mix(in oklab, var(--sim-label) 38%, transparent); border-radius: var(--sim-radius-sm);
  background: var(--sim-bg-surface); color: var(--sim-label); font-weight: 700; font-size: var(--sim-text-sm); line-height: 1.25; text-align: left;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
.spn-act::before { content: ''; flex: none; width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid color-mix(in oklab, var(--sim-label) 55%, transparent); }
.spn-act:hover:not(:disabled) { border-color: var(--sim-annot); background: color-mix(in oklab, var(--sim-annot-tint) 55%, var(--sim-bg-surface)); }
.spn-act:focus-visible { outline: 2px solid var(--sim-annot); outline-offset: 2px; }
.spn-act[aria-pressed="true"] { border-color: var(--sim-annot); background: var(--sim-annot-tint); color: var(--sim-annot); }
.spn-act[aria-pressed="true"]::before { border-color: var(--sim-annot); background: radial-gradient(circle, var(--sim-annot) 0 42%, transparent 48%); }
.spn-act:disabled { cursor: default; opacity: 0.55; }
.spn-act--bare::before { display: none; }
.spn-prompt { display: flex; align-items: center; gap: 10px; margin: 0; font-weight: 700; font-size: var(--sim-text-md); color: var(--sim-annot); }
.spn-prompt::before { content: ''; flex: none; width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 9px solid currentColor; }
.spn-prompt--done { color: var(--sim-label-muted); font-weight: 600; }
.spn-prompt--done::before { width: 9px; height: 5px; border: 0; border-left: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: translateY(-2px) rotate(-45deg); }

/* The plain look's table heads to pick: chips inside the head cells (the dashed underline read as decoration). */
[data-sim-look="plain"] .spn-pick { width: auto; flex-direction: row; align-items: center; justify-content: flex-end; gap: 8px; min-height: 38px; padding: 5px 10px;
  border: 1.5px solid color-mix(in oklab, var(--sim-label) 38%, transparent); border-radius: var(--sim-radius-sm); background: var(--sim-bg-surface);
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
[data-sim-look="plain"] .spn-pick::before { content: ''; flex: none; width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid color-mix(in oklab, var(--sim-label) 55%, transparent); }
[data-sim-look="plain"] .spn-pick .spn-pick__t, [data-sim-look="plain"] .spn-pick[aria-pressed="true"] .spn-pick__t { padding: 0; border: 0; }
[data-sim-look="plain"] .spn-pick:hover { border-color: var(--sim-annot); background: color-mix(in oklab, var(--sim-annot-tint) 55%, var(--sim-bg-surface)); }
[data-sim-look="plain"] .spn-pick[aria-pressed="true"] { border-color: var(--sim-annot); background: var(--sim-annot-tint); color: var(--sim-annot); }
[data-sim-look="plain"] .spn-pick[aria-pressed="true"]::before { border-color: var(--sim-annot); background: radial-gradient(circle, var(--sim-annot) 0 42%, transparent 48%); }
[data-sim-look="plain"] .spn-pick .spn-sub { color: inherit; opacity: 0.8; }
/* Plain, portrait: the ruled cells and pick chips run tighter, so a 3-4 column table fits the 360-wide design
   instead of running past the right edge (the wrap scrolls only as a last resort). */
[data-sim-look="plain"] .sim-dom-root--portrait .spn-table :is(th, td) { padding: 8px 6px; }
[data-sim-look="plain"] .sim-dom-root--portrait .spn-table .spn-sub { white-space: normal; }
[data-sim-look="plain"] .sim-dom-root--portrait .spn-pick { gap: 5px; padding: 4px 6px; }

/* Sentence chips: a sentence whose words are chips; a picked word with a fix is struck and the fix follows it. */
.spn-sent { margin: 0; font-family: var(--sim-font-numeral, var(--sim-font-display)); font-size: var(--spn-sent-size, 26px); line-height: 1.9; color: var(--sim-label); }
.spn-sent .spn-act { display: inline; min-height: 0; padding: 0.06em 0.28em 0.1em; margin: 0 0.04em; font: inherit; line-height: 1.3; border-width: 1px; border-color: color-mix(in oklab, var(--sim-label) 28%, transparent);
  -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.spn-sent .spn-act::before { display: none; }
.spn-sent .spn-act[aria-pressed="true"] { border-width: 1.5px; }
.spn-sent .spn-act.is-fixed { color: var(--sim-label-muted); background: transparent; border-style: dashed; text-decoration: line-through 2px var(--sim-bad); }
.spn-sent .spn-ins { margin-left: 0.2em; font-weight: 400; animation: spn-rise 0.24s ease-out both; }

/* -- 2026-11-05 W3: parts folded in from the epidemiology scenes' local overrides -------------------------- */
/* Visually hidden text (a screen-reader summary of a picture part). */
.spn-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
/* Text floor: a dense part never sets type under 12px. */
.spn :where(.spn-act, .spn-btn, .spn-card, .spn-checks, .spn-axis__tick, .spn-axis__lab) { font-size: max(12px, var(--spn-fs, var(--sim-text-sm))); }
.spn .spn-btn { --spn-fs: var(--sim-text-md); }

/* Narrow chips (chipsHtml o.size 'sm'): dense rows of choices; the ring and the rim stay, the box shrinks. */
.spn-btns--sm { gap: 6px; }
.spn-btns--sm .spn-act { min-height: 32px; padding: 3px 9px; gap: 6px; }
.spn-btns--sm .spn-act::before { width: 10px; height: 10px; }
.sim-dom-root--portrait .spn-btns--sm { gap: 4px; }
.sim-dom-root--portrait .spn-btns--sm .spn-act { min-height: 28px; padding: 2px 7px; gap: 5px; }
.sim-dom-root--portrait .spn-btns--sm .spn-act::before { width: 9px; height: 9px; }

/* Tick / cross (tickHtml): inline SVG sized to the text (unicode marks fall back to boxes in some fonts). */
.spn-ic { display: inline-block; flex: none; width: 1em; height: 1em; vertical-align: -0.14em; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
.spn-ic--ok { color: var(--sim-good); }
.spn-ic--bad { color: var(--sim-bad); }
.spn-ic--open { color: var(--sim-label-muted); }
.spn-checks { display: grid; grid-template-columns: repeat(var(--spn-cols, 1), minmax(0, 1fr)); gap: 3px var(--sim-space-3); margin: 0; padding: 0; list-style: none; line-height: 1.35; }
.spn-checks li { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
.spn-checks .spn-ic { transform: translateY(0.12em); }
.spn-checks li.is-bad { color: var(--sim-bad); font-weight: 700; }
.spn-checks li.is-open { color: var(--sim-label-muted); }
.spn-checks small { font-size: 1em; font-weight: 400; color: var(--sim-label-muted); }
.sim-dom-root--portrait .spn-checks { grid-template-columns: minmax(0, 1fr); }

/* Dated axis (datedAxisHtml): lanes of spans over one dated base line, ticks under it, an optional scrub
   handle on the base line (a native range: arrows, Home / End, Page keys) with its marker and pill. */
.spn-axis { --pad: 11px; display: flex; flex-direction: column; padding: 0 var(--pad); }
.spn-axis__field { position: relative; padding-top: 30px; }
.spn-axis__lane { position: relative; height: 44px; }
.spn-axis__lab { position: absolute; top: 0; white-space: nowrap; font-weight: 600; line-height: 18px; color: var(--sim-label); }
.spn-axis__lab--end { transform: translateX(-100%); }
.spn-axis__track { position: absolute; left: 0; right: 0; top: 18px; height: 22px; }
.spn-axis__span { position: absolute; top: 0; height: 22px; --spn-tone: var(--sim-series-8); }
.spn-axis__span--band { background: color-mix(in oklab, var(--spn-tone) 40%, transparent); border-left: 2px solid var(--spn-tone); }
.spn-axis__span--open { background: linear-gradient(90deg, color-mix(in oklab, var(--spn-tone) 40%, transparent) 72%, transparent); }
.spn-axis__span--bracket { top: 6px; height: 12px; border: 2px solid var(--sim-label); border-bottom: 0; }
.spn-axis__span--point { top: 2px; width: 0; height: 18px; border-left: 2.5px solid var(--sim-label); }
.spn-axis__base { height: 8px; border-bottom: 1.5px solid var(--sim-label); }
.spn-axis__ticks { position: relative; height: 22px; margin-top: 16px; color: var(--sim-label-muted); font-variant-numeric: lining-nums tabular-nums; }
.spn-axis__tick { position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap; }
.spn-axis__tick::before { content: ''; position: absolute; left: 50%; top: -17px; height: 5px; border-left: 1px solid var(--sim-label); }
.spn-axis__tick:first-child { transform: translateX(-6px); }
.spn-axis__tick:last-child { transform: translateX(calc(-100% + 6px)); }
.spn-axis__tick:first-child::before { left: 6px; }
.spn-axis__tick:last-child::before { left: auto; right: 6px; }
.spn-axis__mark { position: absolute; top: 26px; bottom: 0; width: 0; border-left: 2px dashed var(--sim-label-muted); pointer-events: none; }
.spn-axis__mark--scrub { border-left: 2.5px solid var(--sim-annot); transition: left 0.12s ease-out; }
.spn-axis__pill { position: absolute; bottom: 100%; left: 0; transform: translate(-50%, -2px); padding: 2px 8px; white-space: nowrap; font-weight: 700; font-size: max(12px, var(--sim-text-sm));
  background: var(--sim-surface-raised); color: var(--sim-label); border-radius: var(--sim-radius-sm); font-variant-numeric: tabular-nums; }
.spn-axis__mark--scrub .spn-axis__pill { background: var(--sim-annot); color: var(--sim-bg-surface); }
.spn-axis__mark[data-edge="l"] .spn-axis__pill { transform: translate(-6px, -2px); }
.spn-axis__mark[data-edge="r"] .spn-axis__pill { transform: translate(calc(-100% + 6px), -2px); }
.spn-axis__scrub { position: absolute; left: calc(-1 * var(--pad)); right: calc(-1 * var(--pad)); bottom: -15px; width: calc(100% + 2 * var(--pad)); height: 30px; margin: 0;
  -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; touch-action: pan-y; }
.spn-axis__scrub::-webkit-slider-runnable-track { height: 30px; background: transparent; border: 0; }
.spn-axis__scrub::-moz-range-track { height: 30px; background: transparent; border: 0; }
.spn-axis__scrub::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; margin-top: 4px; border-radius: 50%;
  background: var(--sim-annot); border: 4px solid var(--sim-bg-surface); box-shadow: 0 0 0 1.5px var(--sim-annot); }
.spn-axis__scrub::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: var(--sim-annot); border: 4px solid var(--sim-bg-surface); box-shadow: 0 0 0 1.5px var(--sim-annot); }
.spn-axis__scrub:focus-visible { outline: none; }
.spn-axis__scrub:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 1.5px var(--sim-annot), 0 0 0 5px var(--sim-annot-tint); }
.spn-axis__scrub:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 1.5px var(--sim-annot), 0 0 0 5px var(--sim-annot-tint); }
.spn-axis__scrub:disabled { cursor: default; opacity: 0.45; }

/* File cards and sort bins (fileCardHtml, binChipsHtml, cardGridHtml): a record card is a button; unplaced it
   has a dashed rim, placed a solid rim and its bin's short name in the corner (state in text and shape, the
   tint only repeats it). Bin tones: 'annot' (the focal bin), 'label' (a neutral bin), 'muted' (set aside). */
.spn-cards { display: grid; grid-template-columns: repeat(var(--spn-cols, 4), minmax(0, 1fr)); gap: 8px; }
.sim-dom-root--portrait .spn-cards { grid-template-columns: repeat(var(--spn-pcols, 3), minmax(0, 1fr)); gap: 5px; }
.spn-card { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 0; min-width: 0; min-height: 0; padding: 7px 9px; margin: 0; cursor: pointer; text-align: left;
  border: 1.5px dashed color-mix(in oklab, var(--sim-label) 38%, transparent); border-radius: var(--sim-radius-sm); background: var(--sim-bg-surface); color: var(--sim-label);
  font-weight: 400; line-height: 1.3; transition: background-color 0.15s ease, border-color 0.15s ease; }
.spn-card:hover:not(:disabled) { border-color: var(--sim-annot); }
.spn-card:focus-visible { outline: 2px solid var(--sim-annot); outline-offset: 2px; }
.spn-card__t { padding-right: 3.6em; font-weight: 700; font-size: max(12px, var(--sim-text-md)); }
.spn-card__f { overflow-wrap: anywhere; }
.spn-card__f--muted { color: var(--sim-label-muted); }
.spn-card__f--strong { font-weight: 700; }
.spn-card__tag { position: absolute; right: 8px; top: 8px; font-weight: 700; line-height: 1.2; }
.spn-card.is-placed { border-style: solid; }
.spn-card--annot { border-color: var(--sim-annot); background: var(--sim-annot-tint); }
.spn-card--annot .spn-card__tag { color: var(--sim-annot); }
.spn-card--label { border-color: var(--sim-label); background: var(--sim-surface-raised); }
.spn-card--muted { border-color: var(--sim-track); background: transparent; color: var(--sim-label-muted); }
.spn-card--muted .spn-card__tag { color: var(--sim-label-muted); }
.sim-dom-root--portrait .spn-card { padding: 4px 6px; line-height: 1.2; }
.sim-dom-root--portrait .spn-card__t { --spn-fs: 13px; font-size: 13px; padding-right: 3em; }
.sim-dom-root--portrait .spn-card__tag { right: 5px; top: 4px; }
.sim-dom-root--portrait .spn-card { --spn-fs: 12px; }
.spn-port { display: none; }
.sim-dom-root--portrait .spn-port { display: inline; }
.sim-dom-root--portrait .spn-land { display: none; }
.spn-act__n { font-weight: 400; font-variant-numeric: tabular-nums; color: var(--sim-label-muted); }
.spn-act[aria-pressed="true"] .spn-act__n { color: inherit; }

/* Portrait table (ruleTableHtml o.stack): each row a block, its head on top, each cell a "column ... value" line. */
.sim-dom-root--portrait .spn-table--stack, .spn-table--stack-all { display: block; border-top: 1.5px solid var(--sim-label); }
.sim-dom-root--portrait .spn-table--stack thead, .spn-table--stack-all thead { display: none; }
.sim-dom-root--portrait .spn-table--stack :is(tbody, tfoot, tr), .spn-table--stack-all :is(tbody, tfoot, tr) { display: block; }
.sim-dom-root--portrait .spn-table--stack caption, .spn-table--stack-all caption { display: block; }
.sim-dom-root--portrait .spn-table--stack tr, .spn-table--stack-all tr { padding: 6px 0; border-bottom: 1px solid var(--sim-track); }
.sim-dom-root--portrait .spn-table--stack :is(th, td), .spn-table--stack-all :is(th, td) { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sim-space-3);
  padding: 2px 6px; border: 0; text-align: right; }
.sim-dom-root--portrait .spn-table--stack th[scope="row"], .spn-table--stack-all th[scope="row"] { justify-content: flex-start; padding-bottom: 4px; text-align: left; }
.sim-dom-root--portrait .spn-table--stack td::before, .spn-table--stack-all td::before { content: attr(data-col); flex: 1 1 auto; text-align: left; font-family: var(--sim-font); font-weight: 400;
  font-size: max(12px, var(--sim-text-sm)); color: var(--sim-label-muted); }
[data-sim-look="plain"] .sim-dom-root--portrait .spn-table--stack :is(th, td), [data-sim-look="plain"] .spn-table--stack-all :is(th, td) { border: 0; padding: 2px 6px; }
[data-sim-look="plain"] .sim-dom-root--portrait .spn-table--stack tfoot :is(th, td), [data-sim-look="plain"] .spn-table--stack-all tfoot :is(th, td) { border: 0; }

/* Columns held back (columnsHtml o.values false; a bin with hidden: true): a dashed empty column and "?" until revealed. */
.spn-colchart--novals .spn-col__n { display: none; }
.spn-col.is-hidden .spn-col__bar { height: 100%; background: transparent; border: 1.5px dashed var(--sim-track); border-bottom: 0; }
.spn-col.is-hidden .spn-col__n { display: block; bottom: auto; top: 45%; color: var(--sim-label-muted); }
@media (prefers-reduced-motion: reduce) { .spn * { transition: none !important; animation: none !important; } }
`;

const cellV = (x) => (x && typeof x === 'object' ? x : { v: x });

/** One big reading (see the header). */
export function readoutHtml(o = {}) {
  const tone = o.tone ? `--spn-tone:var(--sim-${o.tone})` : '';
  const cls = ['spn-read', o.tint ? 'spn-read--tint' : '', o.size === 'sm' ? 'spn-read--sm' : ''].filter(Boolean).join(' ');
  const frac = o.frac ? `<span class="spn-frac" aria-hidden="true"><span class="spn-frac__n">${esc(o.frac.n)}</span><span class="spn-frac__d">${esc(o.frac.d)}</span></span><span class="spn-eq" aria-hidden="true">=</span>` : '';
  return `<div class="${cls}" data-spn-read="${esc(o.key ?? 'read')}"${tone ? ` style="${tone}"` : ''}>`
    + (o.label ? `<p class="spn-kicker">${esc(o.label)}</p>` : '')
    + `<div class="spn-read__row">${frac}<span class="spn-read__n" aria-live="polite"><span data-spn-n>${esc(o.value ?? '')}</span>${o.unit ? `<span class="spn-read__unit">${esc(o.unit)}</span>` : ''}</span></div>`
    + `<p class="spn-read__f" data-spn-f${o.formula ? '' : ' hidden'}>${o.formula ?? ''}</p>`
    + (o.note != null ? `<p class="spn-note" data-spn-note>${o.note}</p>` : '')
    + '</div>';
}

const RUNS = new WeakMap();

/** Count an element's number from -> to (fmt formats); reduced motion or dur 0 lands at once. */
export function countUp(el, from, to, o = {}) {
  if (!el) return;
  const fmt = o.fmt ?? ((v) => String(Math.round(v * 10) / 10));
  const prev = RUNS.get(el);
  if (prev) cancelAnimationFrame(prev);
  const dur = (o.dur ?? 0.45) * 1000;
  if (reducedMotion() || dur <= 0 || !Number.isFinite(from) || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const tick = (now) => {
    const u = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - u, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (u < 1 && el.isConnected) RUNS.set(el, requestAnimationFrame(tick)); else RUNS.delete(el);
  };
  RUNS.set(el, requestAnimationFrame(tick));
}

/** Patch a readout: value (counted from the shown number), formula line, note. */
export function setReadout(root, key, o = {}) {
  const box = root?.querySelector(`[data-spn-read="${key}"]`);
  if (!box) return;
  const n = box.querySelector('[data-spn-n]');
  if (o.value != null && n) {
    const fmt = o.fmt ?? ((v) => String(v));
    const shown = Number(String(n.textContent).replace(/[^\d.-]/g, ''));
    const from = o.from ?? shown;
    if (typeof o.value === 'number') countUp(n, from, o.value, { fmt, dur: o.dur }); else n.textContent = o.value;
  }
  const f = box.querySelector('[data-spn-f]');
  if (f && o.formulaHtml != null) { f.innerHTML = o.formulaHtml; f.hidden = !o.formulaHtml; }
  const nt = box.querySelector('[data-spn-note]');
  if (nt && o.noteHtml != null) nt.innerHTML = o.noteHtml;
}

/** A ruled table with optional column / row picking (see the header). */
export function ruleTableHtml(o = {}) {
  const cols = o.cols ?? [], rows = o.rows ?? [], pick = o.pick ?? null;
  const sels = [].concat(o.sel ?? []), sel = sels.length ? sels : null, isSel = (i) => sels.includes(i);
  const hi = (o.hi ?? []).map(([r, c]) => `${r},${c}`), band = o.band ?? {};
  const state = (r, c) => {
    const on = sel != null && ((pick === 'col' && isSel(c)) || (pick === 'row' && isSel(r)));
    const banded = (band.col != null && c === band.col) || (band.row != null && r === band.row);
    return [on || banded ? 'is-sel' : sel != null && pick ? 'is-dim' : '', hi.includes(`${r},${c}`) ? 'is-hi' : ''].filter(Boolean).join(' ');
  };
  const sub = (s) => (s ? ` <span class="spn-sub">${esc(s)}</span>` : '');
  const head = cols.map((c, i) => {
    const on = pick === 'col' && isSel(i), banded = pick == null && band.col === i;
    const inner = pick === 'col'
      ? `<button type="button" class="spn-pick" data-sflow-action="${esc(o.action ?? 'pick')}" data-sflow-value="${i}" aria-pressed="${on}"><span class="spn-pick__t">${esc(c.label)}${sub(c.sub)}</span></button>`
      : `${esc(c.label)}${sub(c.sub)}`;
    return `<th scope="col" class="${on ? 'is-sel' : banded ? 'is-selh' : ''}">${inner}</th>`;
  }).join('');
  const colOf = (c) => (o.stack ? ` data-col="${esc(cols[c]?.label ?? '')}${cols[c]?.sub ? ` ${esc(cols[c].sub)}` : ''}"` : '');
  const cellsHtml = (cells, r) => cells.map((x, c) => {
    const q = cellV(x), inner = `${esc(q.v ?? '')}${q.tag ? `<sup>${esc(q.tag)}</sup>` : ''}${q.html ?? ''}`;
    return `<td class="${state(r, c)}"${colOf(c)}>${o.stack ? `<span>${inner}</span>` : inner}</td>`;
  }).join('');
  const rowHead = (r, label) => (pick === 'row'
    ? `<th scope="row" class="${isSel(r) ? 'is-selh' : ''}"><button type="button" class="spn-pick" style="align-items:flex-start;text-align:left" data-sflow-action="${esc(o.action ?? 'pick')}" data-sflow-value="${r}" aria-pressed="${isSel(r)}"><span class="spn-pick__t">${esc(label)}</span></button></th>`
    : `<th scope="row" class="${band.row === r ? 'is-sel' : ''}">${esc(label)}</th>`);
  const body = rows.map((row, r) => `<tr>${rowHead(r, row.label)}${cellsHtml(row.cells, r)}</tr>`).join('');
  const foot = o.total ? `<tfoot><tr><th scope="row">${esc(o.total.label ?? 'Total')}</th>${o.total.cells.map((x, c) => `<td class="${pick === 'col' ? state(-1, c) : ''}"${colOf(c)}>${esc(cellV(x).v)}</td>`).join('')}</tr></tfoot>` : '';
  const dir = pick ?? (band.col != null ? 'col' : band.row != null ? 'row' : '');
  const stack = o.stack === true ? ' spn-table--stack-all' : o.stack ? ' spn-table--stack' : '';
  return `<div class="spn-tablewrap"><table class="spn-table${dir ? ` spn-table--${dir}` : ''}${stack}"${o.label ? ` aria-label="${esc(o.label)}"` : ''}>${o.caption ? `<caption>${esc(o.caption)}</caption>` : ''}`
    + `<thead><tr><th scope="col">${esc(o.corner ?? '')}</th>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`
    + (o.note ? `<p class="spn-cap">${esc(o.note)}</p>` : '');
}

/** A labelled slider with tick labels (see the header). */
export function sliderHtml(o = {}) {
  const id = `spn-${esc(o.action)}`;
  const p = o.max > o.min ? ((o.value - o.min) / (o.max - o.min)) * 100 : 0;
  return `<div class="spn-slider"><div class="spn-slider__head"><label class="spn-label" for="${id}">${esc(o.label)}</label>`
    + `<output class="spn-slider__val" for="${id}" data-spn="${esc(o.action)}-val">${esc(o.valueText ?? o.value)}</output></div>`
    + `<input id="${id}" type="range" data-spn-input="${esc(o.action)}" min="${o.min}" max="${o.max}" step="${o.step ?? 1}" value="${o.value}"`
    + ` style="--sim-range-p:${p.toFixed(1)}%"${o.aria ? ` aria-valuetext="${esc(o.aria)}"` : ''}${o.disabled ? ' disabled' : ''}>`
    + (o.ticks?.length ? `<div class="spn-slider__ticks" aria-hidden="true">${o.ticks.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : '')
    + '</div>';
}

/** Ruled fact rows: what moves beside what is pinned (see the header). */
export function factRowsHtml(rows = []) {
  return `<dl class="spn-rows">${rows.map((r) => `<div class="spn-row${r.state ? ` spn-row--${r.state}` : ''}"><dt>${esc(r.label)}</dt>`
    + `<dd><span${r.key ? ` data-spn="${esc(r.key)}"` : ''}>${r.valueHtml ?? esc(r.value ?? '')}</span>${r.state === 'fixed' ? '<span class="spn-row__tag">fixed</span>' : ''}</dd></div>`).join('')}</dl>`;
}

/** A plain DOM column chart (see the header). */
export function columnsHtml(o = {}) {
  const bins = o.bins ?? [], max = Math.max(1, o.max ?? Math.max(...bins.filter((b) => !b.hidden).map((b) => b.n), 1));
  const tone = o.tone ? ` style="--spn-tone:var(--sim-${o.tone})"` : '';
  const mark = o.marker ? `<span class="spn-mark" style="left:${(o.marker.at * 100).toFixed(2)}%"><span class="spn-mark__t">${esc(o.marker.label)}</span></span>` : '';
  return `<div class="spn-colchart${o.values === false ? ' spn-colchart--novals' : ''}" data-spn-cols="${esc(o.key ?? 'cols')}"><div class="spn-cols"${tone} role="img"${o.label ? ` aria-label="${esc(o.label)}"` : ''}>`
    + bins.map((b) => `<div class="spn-col${b.hidden ? ' is-hidden' : ''}" style="--h:${(b.n / max).toFixed(4)}"><span class="spn-col__bar"></span><span class="spn-col__n">${b.hidden ? '?' : b.n}</span></div>`).join('')
    + mark + '</div>'
    + (o.ticks ? `<div class="spn-cols__ticks" aria-hidden="true">${o.ticks.map((t) => `<span style="left:${(t.at * 100).toFixed(2)}%">${esc(t.label)}</span>`).join('')}</div>`
      : `<div class="spn-cols__x" aria-hidden="true">${bins.map((b) => `<span>${esc(b.label ?? '')}</span>`).join('')}</div>`)
    + (o.axis ? `<p class="spn-cols__axis">${esc(o.axis)}</p>` : '') + '</div>';
}

/** Regrow a column chart's columns (CSS transition does the motion). */
export function setColumns(root, key, bins, max, fresh = -1) {
  const box = root?.querySelector(`[data-spn-cols="${key}"]`);
  if (!box) return;
  const m = Math.max(1, max ?? Math.max(...bins.filter((b) => !b.hidden).map((b) => b.n), 1));
  box.querySelectorAll('.spn-col').forEach((el, i) => {
    const n = bins[i]?.n ?? 0;
    el.style.setProperty('--h', (n / m).toFixed(4));
    el.classList.toggle('is-new', i === fresh);
    el.classList.toggle('is-hidden', !!bins[i]?.hidden);
    const t = el.querySelector('.spn-col__n');
    if (t) t.textContent = bins[i]?.hidden ? '?' : String(n);
  });
}

/** Patch one barsHtml row (keyed r.key): fill fraction 0..1 and its value text. */
export function setBar(root, key, frac, text) {
  const row = root?.querySelector(`[data-bar="${key}"]`);
  if (!row) return;
  row.querySelector('.sim-bars__fill')?.style.setProperty('--v', String(Math.max(0, Math.min(1, frac))));
  if (text != null) { const v = row.querySelector('.sim-bars__value'); if (v) v.textContent = text; }
}

/** Patch one baseline bar (barsHtml o.base, keyed r.key): its value v on the chart's own scale, and its text. */
export function setBaseBar(root, key, v, text) {
  const row = root?.querySelector(`[data-bar="${key}"]`), box = row?.closest('.sim-bars--base');
  if (!box) return;
  const sc = { min: Number(box.dataset.barMin), max: Number(box.dataset.barMax), log: box.hasAttribute('data-bar-log') };
  const p = barPos(v, sc), b = barPos(Number(box.dataset.barBase), sc);
  const f = row.querySelector('.sim-bars__fill');
  f?.style.setProperty('--a', Math.min(p, b).toFixed(4));
  f?.style.setProperty('--w', Math.abs(p - b).toFixed(4));
  if (text != null) { const t = row.querySelector('.sim-bars__value'); if (t) t.textContent = text; }
}

/** The one sentence the scene is for. lead and rest are text. */
export function takeawayHtml(lead, rest = '') {
  return `<p class="spn-take"><b>${esc(lead)}</b>${rest ? ` ${esc(rest)}` : ''}</p>`;
}

/** A calc-steps list (see the header). o.display: the worked-calculation form (big serif formula, gloss line). */
export function stepsHtml(steps = [], o = {}) {
  if (o.display) return calcStepsHtml(steps, o);
  return `<ol class="spn-steps">${steps.map((s, i) => `<li class="spn-step spn-step--${s.state ?? 'done'}"><span class="spn-step__n" aria-hidden="true">${i + 1}</span>`
    + `<span class="spn-step__l">${esc(s.label)}</span><span class="spn-step__f">${s.formulaHtml ?? ''}${s.gloss ? ` <span class="spn-note">${esc(s.gloss)}</span>` : ''}</span></li>`).join('')}</ol>`;
}

const fxPart = (p) => {
  if (p == null) return '';
  if (typeof p !== 'object') return esc(p);
  if (p.html != null) return p.html;
  if (p.n != null) return overHtml(p.n, p.d);
  if (p.v != null) return `<b class="spn-fx__v"${p.key ? ` data-spn-v="${esc(p.key)}"` : ''}>${esc(p.v)}</b>`;
  return '';
};

/** Numerator over denominator with a rule (text, escaped). Inside formulaHtml or any serif line. */
export function overHtml(n, d) {
  return `<span class="spn-over" role="math" aria-label="${esc(n)} over ${esc(d)}"><span class="spn-over__n">${esc(n)}</span><span class="spn-over__d">${esc(d)}</span></span>`;
}

/**
 * A formula: groups joined by "=" (each group nowrap; a narrow panel wraps only at an "="). A group is text,
 * { n, d } (a stacked fraction), { v, key } (the value, signature colour; key lets countValue count it up), or
 * { html } (caller's markup). o.size sets the font size in px (default 28; 24 and up keeps the serif honest).
 */
export function formulaHtml(parts = [], o = {}) {
  const groups = parts.map((p, i) => `<span class="spn-fx__g">${i ? '<span class="spn-fx__eq" aria-hidden="true">=</span>' : ''}${fxPart(p)}</span>`);
  return `<span class="spn-fx"${o.size ? ` style="--spn-fx-size:${Number(o.size)}px"` : ''}>${groups.join('')}</span>`;
}

/** Count a formula value ({ v, key }) from -> to (default from: the number shown now). */
export function countValue(root, key, to, o = {}) {
  const el = root?.querySelector(`[data-spn-v="${key}"]`);
  if (!el) return;
  const shown = Number(String(el.textContent).replace(/[^\d.-]/g, ''));
  countUp(el, o.from ?? shown, to, { fmt: o.fmt, dur: o.dur });
}

/**
 * Calc steps, display form (numericals.md 2): rows [{ label, formulaHtml | parts, gloss, state, fresh, moreHtml }]
 * (moreHtml: caller markup under the gloss, e.g. this row's revealHtml).
 * state 'done' | 'now' (tinted, signature edge) | 'todo' (faint, the plan) | 'hidden' (not drawn); fresh: the row
 * rises in (pass it once, on the paint that reveals the row). parts go through formulaHtml. o.size: formula px.
 */
export function calcStepsHtml(steps = [], o = {}) {
  let n = 0;
  const rows = steps.map((s) => {
    n += 1;
    if (s.state === 'hidden') return '';
    const f = s.formulaHtml ?? formulaHtml(s.parts ?? [], { size: o.size });
    return `<li class="spn-calc__row spn-calc__row--${s.state ?? 'done'}${s.fresh ? ' is-fresh' : ''}"${s.state === 'now' ? ' aria-current="step"' : ''}>`
      + `<span class="spn-calc__k"><b>${n}</b>${esc(s.label ?? '')}</span>`
      + `<div class="spn-calc__body">${f}${s.gloss ? `<p class="spn-calc__g">${esc(s.gloss)}</p>` : ''}${s.moreHtml ?? ''}</div></li>`;
  }).join('');
  return `<ol class="spn-calc"${o.label ? ` aria-label="${esc(o.label)}"` : ''}>${rows}</ol>`;
}

/**
 * A reveal: a quiet chip with a caret, the panel under it (a details element: keyboard and screen readers for free).
 * label / hideLabel are the two chip texts; html is the panel (caller's markup); open keeps it open across a
 * re-render. bindPanel's toggle(key, open) hears it.
 */
export function revealHtml(o = {}) {
  const show = o.label ?? 'Show worked arithmetic', hide = o.hideLabel ?? show.replace(/^Show\b/, 'Hide');
  return `<details class="spn-reveal" data-spn-reveal="${esc(o.key ?? 'worked')}"${o.open ? ' open' : ''}><summary>`
    + `<span class="spn-reveal__show">${esc(show)}</span><span class="spn-reveal__hide">${esc(hide)}</span></summary>`
    + `<div class="spn-reveal__body">${o.html ?? ''}</div></details>`;
}

/** A pull quote: the one sentence, serif, a signature rule at its left. html is the caller's markup (editHtml,
 *  emHtml inside); label is a kicker above it, cite a muted line under it. */
export function pullQuoteHtml(html, o = {}) {
  return `<figure class="spn-quote"${o.key ? ` data-spn="${esc(o.key)}"` : ''}>${o.label ? `<p class="spn-kicker">${esc(o.label)}</p>` : ''}`
    + `<blockquote class="spn-quote__t"${o.size ? ` style="--spn-quote-size:${Number(o.size)}px"` : ''}>${html}</blockquote>`
    + (o.cite ? `<figcaption class="spn-quote__cite">${esc(o.cite)}</figcaption>` : '') + '</figure>';
}

/** Inline emphasis for the one phrase that matters: bold on a highlighter band (text, escaped). */
export function emHtml(text) { return `<strong class="spn-em">${esc(text)}</strong>`; }

/** An edit: the original struck, the replacement in the signature colour (text, escaped). */
export function editHtml(del, ins) {
  return `${del ? `<del class="spn-del">${esc(del)}</del> ` : ''}<ins class="spn-ins">${esc(ins)}</ins>`;
}

/** The prompt line that says the move ("Select the Cases column"); done: muted with a tick. */
export function promptHtml(text, o = {}) {
  return `<p class="spn-prompt${o.done ? ' spn-prompt--done' : ''}"${o.key ? ` data-spn="${esc(o.key)}"` : ''} aria-live="polite">${esc(text)}</p>`;
}

/** Chips the learner acts on: [{ label, action, value, pressed, disabled, bare, n }] (bare: no select ring; n: a
 *  count after the label, muted). o.size 'sm': narrow chips for dense rows (32px, 30px in portrait, text >= 12px). */
export function chipsHtml(list = [], o = {}) {
  return `<div class="spn-btns${o.size === 'sm' ? ' spn-btns--sm' : ''}"${o.label ? ` role="group" aria-label="${esc(o.label)}"` : ''}>${list.map((c) => `<button type="button" class="spn-act${c.bare ? ' spn-act--bare' : ''}" data-sflow-action="${esc(c.action)}"`
    + `${c.value != null ? ` data-sflow-value="${esc(c.value)}"` : ''}${c.pressed != null ? ` aria-pressed="${!!c.pressed}"` : ''}${c.disabled ? ' disabled' : ''}>${esc(c.label)}${c.n != null ? ` <span class="spn-act__n">(${esc(c.n)})</span>` : ''}</button>`).join('')}</div>`;
}

/**
 * Sentence chips: a sentence whose words are chips. words [{ w, fix }] (w text; fix: the replacement shown once the
 * word is picked with o.showFix; '' strikes the word with no insertion), picked = index, action (default 'word', value = index), end = trailing text
 * ('.'). A picked word with a fix and showFix is struck and its fix follows it in the signature colour.
 */
export function sentenceHtml(o = {}) {
  const words = o.words ?? [], act = esc(o.action ?? 'word');
  const chips = words.map((x, i) => {
    const on = i === o.picked, fixed = on && o.showFix && x.fix != null;
    return `<button type="button" class="spn-act${fixed ? ' is-fixed' : ''}" data-sflow-action="${act}" data-sflow-value="${i}" aria-pressed="${on}">${esc(x.w)}</button>`
      + (fixed && x.fix ? `<ins class="spn-ins">${esc(x.fix)}</ins>` : '');
  }).join(' ');
  return `<p class="spn-sent"${o.size ? ` style="--spn-sent-size:${Number(o.size)}px"` : ''}${o.label ? ` role="group" aria-label="${esc(o.label)}"` : ''}>${chips}${esc(o.end ?? '')}</p>`;
}

/** Numeric entry with a check (see the header). A field with locked: true shows its value as text. */
export function entryHtml(o = {}) {
  const fields = (o.fields ?? []).map((f) => `<label class="spn-field${f.state ? ` spn-field--${f.state}` : ''}"><span>${esc(f.label)}</span>`
    + (f.locked ? `<b>${esc(f.value ?? '')}</b>` : `<input type="text" inputmode="numeric" autocomplete="off" data-spn-input="${esc(f.name)}" data-spn-enter="${esc(o.action ?? 'check')}" value="${esc(f.value ?? '')}" aria-label="${esc(f.aria ?? f.label)}">`)
    + '</label>').join('');
  const btn = o.cta === false ? '' : `<button type="button" class="spn-btn spn-btn--primary" data-sflow-action="${esc(o.action ?? 'check')}">${esc(o.cta ?? 'Check')}</button>`;
  return `<div class="spn-entry"><div class="spn-entry__row">${fields}${btn}</div>`
    + `<p class="spn-fb${o.state ? ` spn-fb--${o.state}` : ''}" aria-live="polite">${esc(o.feedback ?? '')}</p></div>`;
}

// -- Tick / cross ------------------------------------------------------------------------------------------
const IC = {
  ok: '<path d="M3 8.6 6.4 12 13 4.6"/>',
  bad: '<path d="M4 4l8 8M12 4l-8 8"/>',
  open: '<path d="M4 8h8"/>',
};

/**
 * A tick (ok true), a cross (false) or a dash (null: not yet run), inline SVG at 1em in the text's line.
 * o.label: the accessible name (default 'passes' | 'fails' | 'not checked'); '' hides it (the text beside says it).
 */
export function tickHtml(ok, o = {}) {
  const k = ok === true ? 'ok' : ok === false ? 'bad' : 'open';
  const name = o.label ?? (k === 'ok' ? 'passes' : k === 'bad' ? 'fails' : 'not checked');
  return `<svg class="spn-ic spn-ic--${k}" viewBox="0 0 16 16"${name ? ` role="img" aria-label="${esc(name)}"` : ' aria-hidden="true"'}>${IC[k]}</svg>`;
}

/**
 * A list of checks, each with its tick or cross: items [{ label, ok, note }] (ok true | false | null; note: a muted
 * tail, e.g. the file that breaks it). A failed line is bold in the bad colour: state is the mark's shape, the
 * weight and the text, not only colour. o.cols: columns (portrait: one), o.label: the list's name.
 */
export function checkListHtml(items = [], o = {}) {
  return `<ul class="spn-checks"${o.cols ? ` style="--spn-cols:${Number(o.cols)}"` : ''}${o.label ? ` aria-label="${esc(o.label)}"` : ''}>`
    + items.map((x) => `<li class="${x.ok === false ? 'is-bad' : x.ok == null ? 'is-open' : 'is-ok'}">${tickHtml(x.ok)}<span>${esc(x.label)}${x.note ? ` <small>${esc(x.note)}</small>` : ''}</span></li>`).join('')
    + '</ul>';
}

// -- Dated axis --------------------------------------------------------------------------------------------
const axisPos = (v, o) => (o.to > o.from ? Math.max(0, Math.min(100, ((v - o.from) / (o.to - o.from)) * 100)) : 0);
const axisEdge = (q) => (q < 24 ? 'l' : q > 76 ? 'r' : '');

/**
 * A dated axis: lanes of spans over one base line, ticks under it, optional markers and a scrub handle.
 *   o.from, o.to     the axis range (numbers: years, or dayNumber(d) from SimChart for dates)
 *   o.ticks          values to label under the base ([from, to] by default); o.fmt(v) formats them (String)
 *   o.lanes          [{ label, at, spans: [{ from, to, kind: 'band' | 'bracket' | 'point', open, tone }] }]
 *                    band: a filled run (open: fades out at its end, an open-ended run); bracket: an exposure
 *                    bracket; point: one tick. tone: a token name or series number (band only; default series 8).
 *                    The lane label sits over the start of its first span (or at value at), right-aligned past 55%.
 *   o.markers        [{ at, label }] fixed dashed markers with a quiet pill
 *   o.scrub          { action, value, step, label, text, aria, disabled }: a handle on the base line (a native
 *                    range: drag, arrows, Home / End, Page keys); its marker and pill (text, default
 *                    "label value") follow it; bindPanel fires input(action, value). setAxisScrub patches it.
 *   o.key            data-spn-axis; o.label: a screen-reader summary (default: built from the lanes)
 */
export function datedAxisHtml(o = {}) {
  const P = (v) => axisPos(v, o).toFixed(2), fmt = o.fmt ?? ((v) => String(v));
  const toneOf = (t) => (t == null ? '' : `;--spn-tone:${typeof t === 'number' ? `var(--sim-series-${t})` : `var(--sim-${t})`}`);
  const span = (s) => {
    const kind = s.kind ?? 'band', to = s.to ?? o.to;
    if (kind === 'point' || s.from === to) return `<span class="spn-axis__span spn-axis__span--point" style="left:${P(s.from)}%"></span>`;
    return `<span class="spn-axis__span spn-axis__span--${kind}${s.open || s.to == null ? ' spn-axis__span--open' : ''}" style="left:${P(s.from)}%;width:${(axisPos(to, o) - axisPos(s.from, o)).toFixed(2)}%${kind === 'band' ? toneOf(s.tone) : ''}"></span>`;
  };
  const lanes = (o.lanes ?? []).map((l) => {
    const at = l.at ?? l.spans?.[0]?.from ?? o.from, q = axisPos(at, o), end = q > 55;
    const lab = l.label ? `<span class="spn-axis__lab${end ? ' spn-axis__lab--end' : ''}" style="left:${end ? Math.min(100, axisPos(l.spans?.[0]?.to ?? at, o)).toFixed(2) : q.toFixed(2)}%">${esc(l.label)}</span>` : '';
    return `<div class="spn-axis__lane">${lab}<div class="spn-axis__track">${(l.spans ?? []).map(span).join('')}</div></div>`;
  }).join('');
  const marks = (o.markers ?? []).map((m) => `<span class="spn-axis__mark" data-edge="${axisEdge(axisPos(m.at, o))}" style="left:${P(m.at)}%">${m.label ? `<span class="spn-axis__pill">${esc(m.label)}</span>` : ''}</span>`).join('');
  const sc = o.scrub;
  let scrub = '';
  if (sc) {
    const v = sc.value ?? o.from, txt = sc.text ?? `${sc.label ?? ''} ${fmt(v)}`.trim();
    scrub = `<span class="spn-axis__mark spn-axis__mark--scrub" data-spn-axis-mark data-edge="${axisEdge(axisPos(v, o))}" style="left:${P(v)}%"><span class="spn-axis__pill" data-spn-axis-pill>${esc(txt)}</span></span>`
      + `<input class="spn-axis__scrub" type="range" data-spn-input="${esc(sc.action)}" data-spn-axis-input${sc.text == null ? ` data-spn-axis-prefix="${esc(sc.label ?? '')}"` : ''}`
      + ` min="${o.from}" max="${o.to}" step="${sc.step ?? 1}" value="${v}" aria-label="${esc(sc.label ?? 'Position')}"${sc.aria ? ` aria-valuetext="${esc(sc.aria)}"` : ''}${sc.disabled ? ' disabled' : ''}>`;
  }
  const sum = o.label ?? (o.lanes ?? []).map((l) => `${l.label ?? ''}: ${(l.spans ?? []).map((s) => (s.to == null ? `from ${fmt(s.from)} on` : s.from === s.to ? fmt(s.from) : `${fmt(s.from)} to ${fmt(s.to)}`)).join(', ')}`).join('. ');
  const ticks = (o.ticks ?? [o.from, o.to]).map((t) => `<span class="spn-axis__tick" style="left:${P(t)}%">${esc(fmt(t))}</span>`).join('');
  return `<div class="spn-axis" data-spn-axis="${esc(o.key ?? 'axis')}" data-from="${o.from}" data-to="${o.to}">`
    + (sum ? `<p class="spn-sr">${esc(sum)}</p>` : '')
    + `<div class="spn-axis__field"><div aria-hidden="true">${lanes}<div class="spn-axis__base"></div></div>${marks}${scrub}</div>`
    + `<div class="spn-axis__ticks" aria-hidden="true">${ticks}</div></div>`;
}

/** Move an axis scrub (marker, pill, input) to value; o.text sets the pill, o.aria the input's valuetext. */
export function setAxisScrub(root, key, value, o = {}) {
  const box = root?.querySelector(`[data-spn-axis="${key}"]`);
  if (!box) return;
  const r = { from: Number(box.dataset.from), to: Number(box.dataset.to) }, q = axisPos(value, r);
  const m = box.querySelector('[data-spn-axis-mark]'), inp = box.querySelector('[data-spn-axis-input]');
  if (m) { m.style.left = `${q.toFixed(2)}%`; m.dataset.edge = axisEdge(q); }
  if (inp && Number(inp.value) !== Number(value)) inp.value = String(value);
  if (o.text != null) { const t = box.querySelector('[data-spn-axis-pill]'); if (t) t.textContent = o.text; }
  if (o.aria != null && inp) inp.setAttribute('aria-valuetext', o.aria);
}

// -- File cards and sort bins ------------------------------------------------------------------------------
/**
 * Destination chips for a sort: bins [{ id, label, n }] (n: how many are in it, shown muted after the label);
 * active = the bin the next tap fills; fires action(o.action ?? 'bin', id). A radio-like group of chipsHtml.
 */
export function binChipsHtml(bins = [], o = {}) {
  return chipsHtml(bins.map((b) => ({ label: b.label, n: b.n, action: o.action ?? 'bin', value: b.id, pressed: b.id === o.active })), { label: o.label ?? 'Destination', size: o.size });
}

/**
 * A record card (a button): title, 2-3 fields (text, or { text, muted, strong, short }: short is the portrait
 * wording, '' drops the field in portrait), and where it is placed.
 *   bin { id, short, tone: 'annot' | 'label' | 'muted', label } or null: placed cards get a solid rim, the
 *   bin's short name in the corner and its tint; unplaced cards a dashed rim. fires action(o.action ?? 'card', id).
 *   bins: the ids of all bins in order: with the card focused, keys 1..n place it there (bindPanel: place(id, bin),
 *   or else action(binAction, bin) then action(cardAction, id)). aria: the card's accessible name (default
 *   "title, fields. Placed: bin label." / "Not placed.").
 */
export function fileCardHtml(c = {}, o = {}) {
  const b = c.bin, fields = (c.fields ?? []).filter((f) => f != null && f !== '').map((f) => (typeof f === 'object' ? f : { text: f }));
  const name = c.aria ?? `${c.title}, ${fields.map((f) => f.text).join(', ')}. ${b ? `Placed: ${b.label ?? b.short}.` : 'Not placed.'}`;
  const cls = ['spn-card', b ? `is-placed spn-card--${b.tone ?? 'label'}` : ''].filter(Boolean).join(' ');
  return `<button type="button" class="${cls}" data-sflow-action="${esc(o.action ?? 'card')}" data-sflow-value="${esc(c.id)}" aria-label="${esc(name)}"`
    + `${o.bins ? ` data-spn-bins="${esc(o.bins.join(','))}" data-spn-binact="${esc(o.binAction ?? 'bin')}"` : ''}${c.disabled ? ' disabled' : ''}>`
    + `<span class="spn-card__t">${esc(c.title)}</span>`
    + fields.map((f) => {
      const cls = `spn-card__f${f.muted ? ' spn-card__f--muted' : ''}${f.strong ? ' spn-card__f--strong' : ''}`;
      if (f.short == null) return `<span class="${cls}">${esc(f.text)}</span>`;
      if (f.short === '') return `<span class="${cls} spn-land">${esc(f.text)}</span>`;
      return `<span class="${cls}"><span class="spn-land">${esc(f.text)}</span><span class="spn-port">${esc(f.short)}</span></span>`;
    }).join('')
    + (b ? `<span class="spn-card__tag" aria-hidden="true">${esc(b.short ?? b.label)}</span>` : '') + '</button>';
}

/** A grid of cards (html strings): o.cols (default 4), o.portraitCols (3), o.label names the group. */
export function cardGridHtml(cards = [], o = {}) {
  return `<div class="spn-cards" role="group" style="--spn-cols:${Number(o.cols ?? 4)};--spn-pcols:${Number(o.portraitCols ?? 3)}"${o.label ? ` aria-label="${esc(o.label)}"` : ''}>${cards.join('')}</div>`;
}

/** Quiet ruled buttons (see the header). */
export function buttonsHtml(list = []) {
  return `<div class="spn-btns">${list.map((b) => `<button type="button" class="spn-btn${b.primary ? ' spn-btn--primary' : ''}${b.quiet ? ' spn-btn--quiet' : ''}" data-sflow-action="${esc(b.action)}"`
    + `${b.value != null ? ` data-sflow-value="${esc(b.value)}"` : ''}${b.disabled ? ' disabled' : ''}>${esc(b.label)}</button>`).join('')}</div>`;
}

/** textContent of [data-spn="key"]. */
export function setText(root, key, text) {
  const el = root?.querySelector(`[data-spn="${key}"]`);
  if (el) el.textContent = text;
}

const INPUTS = new WeakMap();

/** Clicks through bindFlow (data-sflow-action), plus input events on [data-spn-input] and Enter in an entry field. */
export function bindPanel(root, handlers = {}) {
  bindFlow(root, handlers);
  const had = INPUTS.has(root);
  INPUTS.set(root, handlers);
  if (had) return;
  root.addEventListener('input', (e) => {
    const t = e.target.closest?.('[data-spn-input]');
    if (!t || !root.contains(t)) return;
    if (t.type === 'range') {
      const min = Number(t.min || 0), max = Number(t.max || 100);
      t.style.setProperty('--sim-range-p', `${max > min ? ((Number(t.value) - min) / (max - min)) * 100 : 0}%`);
    }
    // A dated-axis scrub: its marker follows the handle (and the pill, when it reads "label value").
    if (t.hasAttribute('data-spn-axis-input')) {
      const box = t.closest('[data-spn-axis]');
      const pre = t.dataset.spnAxisPrefix;
      if (box) setAxisScrub(root, box.dataset.spnAxis, Number(t.value), pre != null ? { text: `${pre} ${t.value}`.trim() } : {});
    }
    INPUTS.get(root).input?.(t.dataset.spnInput, t.value, t);
  });
  // A reveal (details) toggles without bubbling: hear it in the capture phase.
  root.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d?.matches?.('[data-spn-reveal]') || !root.contains(d)) return;
    INPUTS.get(root).toggle?.(d.dataset.spnReveal, d.open, d);
  }, true);
  // A file card with its bins: keys 1..n place the focused card in bin n.
  root.addEventListener('keydown', (e) => {
    const c = e.target.closest?.('[data-spn-bins]');
    if (!c || !root.contains(c) || !/^[1-9]$/.test(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const bin = c.dataset.spnBins.split(',')[Number(e.key) - 1];
    if (!bin) return;
    e.preventDefault();
    const h = INPUTS.get(root), id = c.dataset.sflowValue, sel = `[data-spn-bins][data-sflow-value="${CSS.escape(id)}"]`;
    if (h.place) h.place(id, bin, c);
    else { h.action?.(c.dataset.spnBinact, bin, c); h.action?.(c.dataset.sflowAction, id, c); }
    if (!c.isConnected) root.querySelector(sel)?.focus({ preventScroll: true });
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const t = e.target.closest?.('[data-spn-enter]');
    if (!t || !root.contains(t)) return;
    e.preventDefault();
    INPUTS.get(root).action?.(t.dataset.spnEnter, undefined, t);
  });
}
