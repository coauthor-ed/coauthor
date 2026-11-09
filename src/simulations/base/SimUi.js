/**
 * SimUi - the shared component layer for DomSimulation scenes.
 *
 * DomSimulation injects SIM_UI_CSS once per scene, BEFORE the scene's own CSS,
 * so every rule here is a single class (specificity 0,1,0) and a scene rule
 * of the same weight always wins. Nothing here changes a scene that does not
 * use it: the tokens live on .sim-dom-root and every component is opt-in via a
 * sim- class. Colours come from sim-theme.css only; this file adds none.
 *
 * Tokens (all design-space px, i.e. before the scene is scaled):
 *   space     --sim-space-1..5     4 8 12 16 24
 *   radius    --sim-radius-sm/md/lg/pill
 *   type      --sim-text-sm/md/lg/xl/2xl   14 16 18 22 26   (14 is the floor)
 *   border    --sim-border          2.5px solid stroke (the rim)
 *   lift      --sim-lift            the 4px solid lip under cards, chips and buttons
 *   Radius, border and lift scale with the active look (--look-*, kit/lookProfile.js).
 *
 * Components: sim-ui (scene root), sim-stack, sim-row, sim-grid-2, sim-grid-3,
 * sim-card (+ --accent --dashed --muted), sim-title, sim-tag (+ --accent),
 * sim-field (+ --missing) with sim-field__label / sim-field__value / sim-q,
 * sim-arrow (+ --down), sim-meta, sim-record / sim-record__step,
 * sim-frame + sim-scroll (static LAYOUT = 'frame'), sim-bars (kit/SimChart.js barsHtml), sim-icon, maths: sim-frac (__n __d), sim-sup, sim-sub, sim-overbar,
 * sim-root (SimText.js writes them), sim-pick-* (kit/SimPick.js), a skin for every input[type=range] (zero specificity). Helpers: simTag, simTags, simField, simArrow, simRecord, esc.
 * Reference: docs/dom-scene-kit.md in the authoring kit.
 *
 * Keep this file free of backticks inside the CSS text - it is a template
 * literal and a stray one ends the string.
 */
export const SIM_UI_CSS = `
.sim-dom-root {
  --sim-space-1: 4px;
  --sim-space-2: 8px;
  --sim-space-3: 12px;
  --sim-space-4: 16px;
  --sim-space-5: 24px;
  --sim-radius-sm: calc(8px * var(--look-radius));
  --sim-radius-md: calc(12px * var(--look-radius));
  --sim-radius-lg: calc(16px * var(--look-radius));
  --sim-radius-pill: var(--look-pill);
  --sim-text-sm: 14px;
  --sim-text-md: 16px;
  --sim-text-lg: 18px;
  --sim-text-xl: 22px;
  --sim-text-2xl: 26px;
  --sim-border-width: calc(2.5px * var(--look-rim));
  --sim-border: var(--sim-border-width) solid var(--sim-stroke);
  --sim-lift: calc(4px * var(--look-lip));
  --sim-card-pad: var(--sim-space-3);
}
.sim-dom-root--portrait { --sim-text-lg: 19px; --sim-text-xl: 23px; }

.sim-ui, .sim-ui * { box-sizing: border-box; }
.sim-ui {
  padding: var(--sim-space-4);
  background: transparent;   /* the world behind the scene shows through (kit/SimWorld.js); a scene may paint its own */
  color: var(--sim-label);
  font: var(--sim-text-lg)/1.3 var(--sim-font);
  display: flex;
  flex-direction: column;
  gap: var(--sim-space-3);
}
.sim-ui [hidden] { display: none !important; }
@media (prefers-reduced-motion: reduce) {
  .sim-ui *, .sim-ui *::before, .sim-ui *::after { transition: none !important; animation: none !important; }
}

.sim-stack { display: flex; flex-direction: column; gap: var(--sim-space-3); min-width: 0; }
.sim-stack--tight { gap: var(--sim-space-2); }
.sim-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sim-space-2); min-width: 0; }
.sim-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sim-space-3); }
.sim-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sim-space-3); }
.sim-dom-root--portrait .sim-grid-2,
.sim-dom-root--portrait .sim-grid-3 { grid-template-columns: minmax(0, 1fr); }

.sim-card {
  min-width: 0;
  padding: var(--sim-card-pad);
  border: var(--sim-border);
  border-radius: var(--sim-radius-md);
  background: var(--sim-bg-surface);
  box-shadow: 0 var(--sim-lift) 0 var(--sim-stroke);
  display: flex;
  flex-direction: column;
  gap: var(--sim-space-2);
}
.sim-card--accent { border-color: var(--sim-accent); box-shadow: 0 var(--sim-lift) 0 var(--sim-accent); }
.sim-card--dashed { border-style: dashed; box-shadow: none; }
.sim-card--muted { background: var(--sim-bg-deep); }

.sim-title { margin: 0; font-size: var(--sim-text-xl); line-height: 1.25; font-weight: 800; }

.sim-tag {
  padding: var(--sim-space-1) var(--sim-space-2);
  border: var(--sim-border);
  border-radius: var(--sim-radius-pill);
  background: var(--sim-bg-deep);
  color: var(--sim-label);
  font-size: var(--sim-text-sm);
  font-weight: 700;
}
.sim-tag--accent { border-color: var(--sim-accent); }

.sim-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sim-space-2);
  min-width: 0;
  min-height: 40px;
  padding: var(--sim-space-1) var(--sim-space-3);
  border: var(--sim-border);
  border-radius: var(--sim-radius-sm);
  background: var(--sim-bg-deep);
  font-size: var(--sim-text-md);
}
.sim-field__label { margin: 0; font-weight: 700; }
.sim-field__value { margin: 0; text-align: right; min-width: 0; overflow-wrap: anywhere; }
.sim-field--missing { border-style: dashed; }
.sim-q {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 26px;
  height: 26px;
  border: calc(2px * var(--look-rim)) solid var(--sim-accent);
  border-radius: 50%;
  font-size: var(--sim-text-md);
  font-weight: 800;
}

.sim-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: var(--sim-accent);
  font-size: var(--sim-text-xl);
  font-weight: 800;
  line-height: 1;
}
.sim-arrow--down { transform: rotate(90deg); }

.sim-meta { margin: 0; text-align: center; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }
/* One big reading (a rate, a ratio, a count): --sim-font-numeral, a serif under plain, the display face under quill. */
.sim-numeral { margin: 0; font-family: var(--sim-font-numeral, var(--sim-font-display)); font-weight: 400; font-size: calc(var(--sim-text-xl) * 2); line-height: 1; letter-spacing: -0.01em; font-variant-numeric: lining-nums tabular-nums; color: var(--sim-label); }
.sim-numeral--accent { color: var(--sim-accent); }

.sim-record {
  margin: 0;
  padding: var(--sim-space-2);
  list-style: none;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--sim-space-2);
  border: var(--sim-border);
  border-radius: var(--sim-radius-md);
  background: var(--sim-bg-surface);
  box-shadow: 0 var(--sim-lift) 0 var(--sim-stroke);
}
.sim-record__step {
  padding: var(--sim-space-1) var(--sim-space-2);
  border: var(--sim-border-width) solid transparent;
  border-radius: var(--sim-radius-sm);
  text-align: center;
  font-size: var(--sim-text-md);
}
.sim-record__step[aria-current="step"] {
  border-color: var(--sim-accent);
  background: var(--sim-bg-deep);
  font-weight: 800;
  box-shadow: 0 var(--sim-lift) 0 var(--sim-accent);
}
.sim-dom-root--portrait .sim-record { grid-template-columns: repeat(2, minmax(0, 1fr)); }

.sim-icon { display: block; max-width: 100%; height: auto; }

.sim-frame { display: flex; flex-direction: column; }
.sim-frame > * { flex: none; }
.sim-frame > .sim-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }

.sim-frac { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; margin: 0 0.12em; font-size: 0.82em; line-height: 1.05; font-weight: 800; }
.sim-frac__n { padding: 0 0.2em 0.06em; border-bottom: 0.1em solid currentColor; }
.sim-frac__d { padding: 0.06em 0.2em 0; }
.sim-sup, .sim-sub { font-size: 0.68em; font-weight: 800; line-height: 0; }
.sim-overbar { text-decoration: overline; text-decoration-thickness: 0.08em; }
.sim-root__x { border-top: 0.08em solid currentColor; padding: 0 0.1em; }

.sim-bars { display: flex; flex-direction: column; gap: var(--sim-space-2); }
.sim-bars__row { display: grid; grid-template-columns: minmax(0, 7em) minmax(0, 1fr) auto; align-items: center; gap: var(--sim-space-2); font-size: var(--sim-text-md); }
.sim-bars__label { font-weight: 700; overflow-wrap: anywhere; }
.sim-bars__track { height: 18px; border-radius: var(--look-pill); background: var(--sim-track); overflow: hidden; }
.sim-bars__fill { display: block; height: 100%; width: calc(var(--v) * 100%); border-radius: var(--look-pill); background: var(--tone);
  box-shadow: inset 0 calc(-4px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 70%, black), inset 0 calc(3px * var(--look-gloss)) 0 color-mix(in oklab, var(--tone) 60%, white); transition: width 0.6s var(--look-spring-soft); }
.sim-bars__value { font-weight: 800; }
/* Editorial bars (barsHtml o.rule): thin square tracks, muted labels, the value right in tabular figures. */
.sim-bars--rule { gap: var(--sim-space-3); }
.sim-bars--rule .sim-bars__row { grid-template-columns: minmax(0, 9em) minmax(0, 1fr) 4.2em; font-size: var(--sim-text-sm); }
.sim-bars--rule .sim-bars__label { font-weight: 500; color: var(--sim-label-muted); }
.sim-bars--rule .sim-bars__track { height: 10px; border-radius: 0; }
/* Bars from a baseline (barsHtml o.base): the track carries a rule at the base value; a bar grows left or right
   of it. The scale row under the bars names the base and the two directions. */
.sim-bars--base .sim-bars__track { position: relative; overflow: visible; }
.sim-bars--base .sim-bars__fill { position: absolute; top: 0; bottom: 0; left: calc(var(--a, 0) * 100%); width: calc(var(--w, 0) * 100%); border-radius: 0;
  transition: left 0.45s cubic-bezier(0.2, 0, 0, 1), width 0.45s cubic-bezier(0.2, 0, 0, 1); }
.sim-bars__zero { position: absolute; top: -4px; bottom: -4px; left: calc(var(--b) * 100%); width: 0; border-left: 2px solid var(--sim-label); }
.sim-bars__row.sim-bars__scale { align-items: start; font-size: max(12px, var(--sim-text-sm)); color: var(--sim-label-muted); }
.sim-bars__axis { position: relative; height: 2.9em; grid-column: 2; }
.sim-bars__axis span { position: absolute; top: 0; white-space: nowrap; transform: translateX(-50%); font-variant-numeric: tabular-nums; }
.sim-bars__axis .is-base { font-weight: 700; color: var(--sim-label); }
.sim-bars__axis .sim-bars__dir { top: 1.45em; transform: none; }
.sim-bars__axis .sim-bars__dir--lo { left: 0; }
.sim-bars__axis .sim-bars__dir--hi { right: 0; }
.sim-bars__axis .sim-bars__dir--base { left: calc(var(--b) * 100%); transform: translateX(-50%); font-weight: 700; color: var(--sim-label); }
.sim-bars__axis span:first-child { transform: none; }
.sim-bars__axis span:nth-last-child(1 of :not(.sim-bars__dir)) { transform: translateX(-100%); }
.sim-bars--rule .sim-bars__fill { border-radius: 0; box-shadow: none; }
.sim-bars--rule .sim-bars__value { font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
.sim-dom-root--portrait .sim-bars--rule .sim-bars__row { grid-template-columns: minmax(0, 7.5em) minmax(0, 1fr) 4.2em; }
/* Portrait: the label over its bar, the track full width (room for the scale's words). */
.sim-dom-root--portrait .sim-bars--base .sim-bars__row { grid-template-columns: minmax(0, 1fr) 3.6em; row-gap: 2px; }
.sim-dom-root--portrait .sim-bars--base .sim-bars__label { grid-column: 1 / -1; }
.sim-dom-root--portrait .sim-bars--base .sim-bars__scale > span:first-child { display: none; }
.sim-dom-root--portrait .sim-bars--base .sim-bars__axis { grid-column: 1; }

/* Range slider skin: chunky track with an accent fill to the thumb, a lipped knob. Zero specificity (:where), so a
   scene that styles its own slider keeps it; DomSimulation keeps --sim-range-p (the fill %) current. */
:where(.sim-ui input[type="range"]) { -webkit-appearance: none; appearance: none; height: 26px; margin: 0; padding: 0; background: transparent; cursor: pointer; touch-action: pan-y; }
:where(.sim-ui input[type="range"])::-webkit-slider-runnable-track { height: 12px; border-radius: var(--look-pill); border: calc(2px * var(--look-rim)) solid var(--sim-stroke);
  background: linear-gradient(90deg, var(--sim-accent) var(--sim-range-p, 0%), var(--sim-track) var(--sim-range-p, 0%)); }
:where(.sim-ui input[type="range"])::-moz-range-track { height: 8px; border-radius: var(--look-pill); border: calc(2px * var(--look-rim)) solid var(--sim-stroke); background: var(--sim-track); }
:where(.sim-ui input[type="range"])::-moz-range-progress { height: 8px; border-radius: var(--look-pill); background: var(--sim-accent); }
:where(.sim-ui input[type="range"])::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; margin-top: -8px; border-radius: 50%;
  border: calc(2px * var(--look-rim)) solid var(--sim-stroke); background: var(--sim-bg-surface); box-shadow: inset 0 calc(-3px * var(--look-lip)) 0 var(--sim-track), 0 calc(2px * var(--look-lip)) 0 var(--sim-stroke); transition: transform 0.12s ease; }
:where(.sim-ui input[type="range"])::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%;
  border: calc(2px * var(--look-rim)) solid var(--sim-stroke); background: var(--sim-bg-surface); box-shadow: inset 0 calc(-3px * var(--look-lip)) 0 var(--sim-track), 0 calc(2px * var(--look-lip)) 0 var(--sim-stroke); }
:where(.sim-ui input[type="range"]):active::-webkit-slider-thumb { transform: scale(1.12); }
:where(.sim-ui input[type="range"]):focus-visible { outline: 3px solid var(--sim-accent); outline-offset: 2px; border-radius: var(--look-pill); }
:where(.sim-ui input[type="range"]):disabled { cursor: default; opacity: 0.45; }

.sim-pick-item { cursor: grab; touch-action: none; user-select: none; transition: transform 0.18s var(--look-spring), box-shadow 0.15s ease; }
.sim-pick-item:focus-visible, .sim-pick-target:focus-visible { outline: 3px solid var(--sim-accent); outline-offset: 2px; }
.sim-pick--picked { box-shadow: 0 0 0 3px var(--sim-accent), 0 calc(6px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-accent) 40%, transparent); transform: translateY(-3px) rotate(-1.5deg); }
.sim-pick--dragging { cursor: grabbing; z-index: 20; position: relative; transition: none; box-shadow: 0 0 0 3px var(--sim-accent), 0 12px 18px color-mix(in oklab, var(--sim-bg-deep) 55%, transparent); }
.sim-pick--armed { outline: 2px dashed color-mix(in oklab, var(--sim-accent) 70%, transparent); outline-offset: 3px; }
.sim-pick--over { outline: 3px solid var(--sim-accent); background: color-mix(in oklab, var(--sim-accent) 14%, var(--sim-bg-surface)); }
.sim-pick--no { animation: sim-pick-no 0.35s ease; }
@keyframes sim-pick-no { 25% { transform: translateX(-6px); } 50% { transform: translateX(5px); } 75% { transform: translateX(-3px); } }
.sim-pick-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

/** Markup helpers for the recurring pieces. Each returns an HTML string that
 *  uses the sim-* classes above, with text escaped. */
export function simTag(text, { accent = false } = {}) {
  return `<span class="sim-tag${accent ? ' sim-tag--accent' : ''}">${esc(text)}</span>`;
}
export function simTags(list, opts) {
  return `<div class="sim-row">${list.map((t) => simTag(t, opts)).join('')}</div>`;
}
/** A labelled row; value === null renders the dashed "?" unknown state. */
export function simField(label, value) {
  const missing = value === null || value === undefined;
  return `<div class="sim-field${missing ? ' sim-field--missing' : ''}"><span class="sim-field__label">${esc(label)}</span>`
    + (missing
      ? '<span class="sim-field__value" aria-label="Not yet observed"><span class="sim-q" aria-hidden="true">?</span></span>'
      : `<span class="sim-field__value">${esc(value)}</span>`)
    + '</div>';
}
export function simArrow(down = false) {
  return `<span class="sim-arrow${down ? ' sim-arrow--down' : ''}" aria-hidden="true">\u2192</span>`;
}
/** Progress strip; `steps` are labels, `current` the index marked aria-current. */
export function simRecord(steps, current, label = 'Record') {
  return `<ol class="sim-record" aria-label="${esc(label)}">${steps.map((t, i) =>
    `<li class="sim-record__step"${i === current ? ' aria-current="step"' : ''}>${esc(t)}</li>`).join('')}</ol>`;
}

/** Escape text for an innerHTML template. Scene data is trusted, but a stray
 *  ampersand or angle bracket in a label still breaks the markup. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
