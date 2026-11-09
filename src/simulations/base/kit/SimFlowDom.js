/**
 * SimFlowDom - a calm "one idea per screen" frame for DomSimulation scenes: tabs across the top
 * (cases to compare), numbered steps under them (the stages of one case), one roomy stage card,
 * and a Back / Next row at the foot. Replaces the dashboard habit of showing every panel at once.
 * Colours are var(--sim-*) only; spacing / radius / text are SimUi's tokens. Its CSS rides along in
 * SIM_LOOK_DOM_CSS (kit/SimLookDom.js), so a scene adds no import for the styles.
 *
 * Use (all helpers return HTML strings; text fields are escaped here, `body` is the caller's own markup):
 *   <div class="sflow">                                         column that fills the scene root
 *     flowTabsHtml([{ key, label }], activeKey, 'Countries')    segmented tablist, data-sflow-tab=key
 *     flowStepsHtml(['Votes', 'Count', 'Seats'], activeIndex)   numbered steps, data-sflow-step=i (optional)
 *     flowStageHtml({ kicker, title, sub, body, callout })      the stage card (.sflow-stage, flex 1)
 *     flowActionsHtml({ back, next })                           { label, action, disabled }; data-sflow-action=action
 *   </div>
 *   bindFlow(root, { tab(key), step(i), action(name) })        one delegated click + arrow-key listener; re-call to swap handlers
 *   playStage(stageEl, dir)                                     replay the stage enter (dir -1 slides from the left)
 * Extras (all optional, additive):
 *   tab { fresh: true }                 the tab pops in (a tab that has just been unlocked)
 *   flowStageHtml({ calloutTone: 'good' | 'warn', cls })      tinted callout; extra stage class
 *   flowTabsHtml([{ key, label, disabled }]); flowStageHtml({ panel: key })   a locked tab (arrows skip it); the stage as that tab's tabpanel (data-sflow-panel)
 *   back / next { icon: 'back' | 'next' | 'replay' }          a chevron / replay glyph on the button
 *   flowChipHtml({ label, action, value, icon })              small tactile chip button inside a stage (Replay)
 *   flowSplitHtml(main, side)                                 two columns (main wider), stacked in portrait
 *   flowInsetHtml({ title, meta, body, text })                a quiet inset card inside the stage (text escaped, body raw)
 *   flowLiveHtml(text)                                        a visually hidden aria-live line for step announcements
 *   flowDeckHtml(stages)                                      every tab's stage (flowStageHtml with panel) stacked in one cell:
 *                                                             the frame keeps the tallest stage's height, tabs never jump
 *   showFlowPanel(root, key, dir)                             select tab key, show its panel (others .is-off), replay its enter
 *   flowFootHtml({ formula, text })                           a card under the stage for the one rule every tab shares
 *   flowChoiceHtml({ action, options, value, label })         an in-scene value picker (a radio group styled like the tabs):
 *                                                             options [{ value, label }]; a tap calls handlers.action(action, value);
 *                                                             setFlowChoice(root, action, value) moves the selection
 *   flowCompareHtml(rows)                                     recap rows [{ key, title, sub, text, body }]; a row is a button
 *                                                             that opens tab `key` (the tab handler); body = caller markup
 *   data-sflow-value="v" on any data-sflow-action element:   handlers.action(name, value, el)
 *   bindFlow puts focus back on the matching control after a handler re-renders the frame.
 * Not a scene: no class export.
 */
import { esc } from 'simulations/base/SimUi.js';

export const SIM_FLOW_CSS = `
/* The frame's primary colour is the lesson's own Next button (app --primary-color / --on-primary / --primary-hover, set by
   theme.css per theme and per classic / story mode, inherited into the scene); the sim accent is the fallback outside the app.
   The selected tab, the Next button, the current step number and the callout edge all wear it. */
.sflow, .sflow-choice { --sflow-primary: var(--primary-color, var(--sim-accent)); --sflow-on-primary: var(--on-primary, var(--sim-ink-on-accent, var(--sim-bg-deep)));
  --sflow-primary-lip: var(--primary-hover, color-mix(in oklab, var(--sim-accent) 55%, black)); }
.sflow { display: flex; flex-direction: column; gap: var(--sim-space-3); width: 100%; height: 100%; min-height: 0; box-sizing: border-box; }
.sflow * { box-sizing: border-box; }
/* :where keeps this reset at zero specificity, so .sflow-btn / .sflow-chip colours win over it. */
.sflow :where(button) { font: inherit; color: inherit; }

.sflow-tabs { display: grid; grid-auto-columns: minmax(0, 1fr); grid-auto-flow: column; gap: var(--sim-space-1); padding: var(--sim-space-1);
  border: calc(2.5px * var(--look-rim)) solid var(--sim-stroke); border-radius: var(--sim-radius-md);
  background: color-mix(in oklab, var(--sim-track) 70%, var(--sim-bg-surface)); }
.sflow-tab { min-height: 44px; padding: var(--sim-space-1) var(--sim-space-2); border: 0; border-radius: var(--sim-radius-sm); background: transparent;
  font-weight: 800; font-size: var(--sim-text-md); line-height: 1.15; color: var(--sim-label-muted); cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease, transform 0.12s ease, box-shadow 0.18s ease; }
.sflow-tab:hover { color: var(--sim-label); background: color-mix(in oklab, var(--sim-bg-surface) 60%, transparent); }
.sflow-tab[aria-selected="true"] { color: var(--sflow-on-primary); background: var(--sflow-primary);
  box-shadow: 0 calc(4px * var(--look-lip)) 0 var(--sflow-primary-lip); transform: translateY(calc(-1px * var(--look-lip))); }
.sflow-choice { display: inline-grid; grid-auto-columns: minmax(0, 1fr); grid-auto-flow: column; gap: 2px; padding: 3px;
  border: calc(2.5px * var(--look-rim)) solid var(--sim-stroke); border-radius: var(--sim-radius-pill);
  background: color-mix(in oklab, var(--sim-track) 70%, var(--sim-bg-surface)); }
.sflow-choice__opt { min-height: 40px; min-width: 48px; padding: var(--sim-space-1) var(--sim-space-2); white-space: nowrap; border: 0; border-radius: var(--sim-radius-pill);
  background: transparent; font-weight: 800; font-size: var(--sim-text-sm); color: var(--sim-label-muted); cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease; }
.sflow-choice__opt:hover { color: var(--sim-label); }
.sflow-choice__opt[aria-checked="true"] { color: var(--sflow-on-primary); background: var(--sflow-primary); box-shadow: 0 calc(2px * var(--look-lip)) 0 var(--sflow-primary-lip); }
.sflow-choice__opt:focus-visible { outline: 3px solid var(--sim-accent); outline-offset: 2px; }
.sflow-tab__sub { display: block; margin-top: 2px; font-weight: 700; font-size: var(--sim-text-sm); line-height: 1.25; opacity: 0.8; }
.sflow-tab:has(.sflow-tab__sub) { line-height: 1.3; }

.sflow-steps { display: grid; grid-auto-columns: minmax(0, 1fr); grid-auto-flow: column; gap: var(--sim-space-2); position: relative; }
.sflow-step { position: relative; display: flex; align-items: center; justify-content: center; gap: var(--sim-space-2); min-height: 40px;
  padding: var(--sim-space-1) var(--sim-space-2); border: 2px solid transparent; border-radius: var(--sim-radius-pill); background: transparent;
  font-weight: 800; font-size: var(--sim-text-sm); color: var(--sim-label-muted); cursor: pointer; transition: color 0.18s ease, border-color 0.18s ease, background-color 0.18s ease; }
.sflow-step:hover { color: var(--sim-label); }
.sflow-step__n { display: grid; place-items: center; flex: none; width: 26px; height: 26px; border-radius: 50%;
  background: var(--sim-track); color: var(--sim-label); font-size: var(--sim-text-sm); transition: background-color 0.18s ease, transform 0.25s var(--look-spring); }
.sflow-step.is-done .sflow-step__n { background: color-mix(in oklab, var(--sflow-primary) 40%, var(--sim-track)); }
.sflow-step[aria-current="step"] { color: var(--sim-label); border-color: var(--sim-stroke); background: var(--sim-bg-surface); }
.sflow-step[aria-current="step"] .sflow-step__n { background: var(--sflow-primary); color: var(--sflow-on-primary); transform: scale(1.1); }

.sflow-stage { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: var(--sim-space-3);
  padding: var(--sim-space-4); border: calc(2.5px * var(--look-rim)) solid var(--sim-stroke); border-radius: var(--sim-radius-lg); background: var(--sim-bg-surface);
  box-shadow: 0 calc(4px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-stroke) 60%, transparent); overflow: hidden; }
.sflow-stage.is-in { animation: sflow-in 0.32s cubic-bezier(0.2, 0.8, 0.3, 1) both; }
.sflow-stage.is-in-back { animation: sflow-in-back 0.32s cubic-bezier(0.2, 0.8, 0.3, 1) both; }
.sflow-intro { flex: none; display: flex; flex-direction: column; gap: var(--sim-space-1); }
.sflow-kicker { font-weight: 800; font-size: var(--sim-text-sm); letter-spacing: 0.06em; text-transform: uppercase; color: var(--sim-label-muted); }
.sflow-title { margin: 0; font-weight: 800; font-size: var(--sim-text-xl); line-height: 1.15; color: var(--sim-label); }
.sflow-sub { margin: 0; font-weight: 600; font-size: var(--sim-text-md); line-height: 1.35; color: var(--sim-label-muted); }
.sflow-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: var(--sim-space-3); }
.sflow-callout { flex: none; margin-top: auto; padding: var(--sim-space-3) var(--sim-space-4); border-radius: var(--sim-radius-md);
  border-left: 5px solid var(--sflow-primary); background: color-mix(in oklab, var(--sflow-primary) 12%, var(--sim-bg-surface));
  font-weight: 700; font-size: var(--sim-text-md); line-height: 1.35; color: var(--sim-label); }

.sflow-actions { flex: none; display: flex; align-items: center; justify-content: space-between; gap: var(--sim-space-3); }
.sflow-btn { min-height: 46px; padding: var(--sim-space-2) var(--sim-space-4); border: calc(2.5px * var(--look-rim)) solid var(--sflow-primary-lip);
  border-radius: var(--sim-radius-md); background: var(--sflow-primary); color: var(--sflow-on-primary);
  font-weight: 800; font-size: var(--sim-text-md); cursor: pointer; box-shadow: 0 calc(4px * var(--look-lip)) 0 var(--sflow-primary-lip);
  transition: transform 0.1s ease, box-shadow 0.1s ease, filter 0.15s ease; }
.sflow-btn:hover { filter: brightness(1.06); }
.sflow-btn:active { transform: translateY(calc(4px * var(--look-lip))); box-shadow: none; }
.sflow-btn--quiet { background: var(--sim-bg-surface); color: var(--sim-label); border-color: var(--sim-stroke); box-shadow: 0 calc(4px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-stroke) 70%, transparent); }
.sflow-btn:disabled { opacity: 0.4; cursor: default; transform: none; box-shadow: none; filter: none; }
.sflow-btn--ghost { visibility: hidden; }
.sflow-tab:focus-visible, .sflow-step:focus-visible, .sflow-btn:focus-visible { outline: 3px solid var(--sim-accent); outline-offset: 2px; }

.sflow-tab:disabled { opacity: 0.42; cursor: default; }
.sflow-tab:disabled:hover { background: transparent; color: var(--sim-label-muted); }
.sflow-tab.is-new { animation: sflow-pop 0.45s var(--look-spring) both; }
.sim-dom-root--portrait .sflow-tab { font-size: var(--sim-text-sm); padding: var(--sim-space-1); }
.sim-dom-root--portrait .sflow-step { padding: var(--sim-space-1); gap: var(--sim-space-1); white-space: nowrap; }
.sim-dom-root--portrait .sflow-row__line { display: none; }
.sim-dom-root--portrait .sflow-tabs:has(> :nth-child(4)) { grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.sflow-callout--good { border-left-color: var(--sim-good); background: color-mix(in oklab, var(--sim-good) 14%, var(--sim-bg-surface)); }
.sflow-callout--warn { border-left-color: var(--sim-warning); background: color-mix(in oklab, var(--sim-warning) 14%, var(--sim-bg-surface)); }
.sflow-stage.is-in .sflow-callout, .sflow-stage.is-in-back .sflow-callout { animation: sflow-rise 0.4s ease 0.25s both; }
.sflow-btn { display: inline-flex; align-items: center; gap: var(--sim-space-2); }
.sflow-ico { display: block; flex: none; width: 18px; height: 18px; }
.sflow-chip { display: inline-flex; align-items: center; gap: var(--sim-space-1); min-height: 36px; padding: var(--sim-space-1) var(--sim-space-3);
  border: calc(2.5px * var(--look-rim)) solid var(--sim-stroke); border-radius: var(--sim-radius-pill); background: var(--sim-bg-surface); color: var(--sim-label);
  font-weight: 800; font-size: var(--sim-text-sm); cursor: pointer; box-shadow: 0 calc(4px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-stroke) 70%, transparent);
  transition: transform 0.1s ease, box-shadow 0.1s ease; }
.sflow-chip:hover { border-color: color-mix(in oklab, var(--sim-accent) 60%, var(--sim-stroke)); }
.sflow-chip:active { transform: translateY(calc(4px * var(--look-lip))); box-shadow: none; }
.sflow-chip:focus-visible { outline: 3px solid var(--sim-accent); outline-offset: 2px; }
.sflow-chip .sflow-ico { width: 16px; height: 16px; }
.sflow-split { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); align-items: center; gap: var(--sim-space-4); min-height: 0; }
.sim-dom-root--portrait .sflow-split { grid-template-columns: minmax(0, 1fr); gap: var(--sim-space-3); }
.sflow-inset { display: flex; flex-direction: column; gap: var(--sim-space-2); min-width: 0; padding: var(--sim-space-3) var(--sim-space-4);
  border-radius: var(--sim-radius-md); background: color-mix(in oklab, var(--sim-track) 45%, var(--sim-bg-surface)); }
.sflow-inset__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sim-space-2); }
.sflow-inset__title { margin: 0; font-weight: 800; font-size: var(--sim-text-md); color: var(--sim-label); }
.sflow-inset__meta { font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label-muted); white-space: nowrap; }
.sflow-inset__text { margin: 0; font-weight: 600; font-size: var(--sim-text-sm); line-height: 1.4; color: var(--sim-label); }
.sflow-compare { display: flex; flex-direction: column; gap: var(--sim-space-3); min-height: 0; }
.sflow-row { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.2fr); align-items: center; gap: var(--sim-space-4); width: 100%;
  padding: var(--sim-space-3) var(--sim-space-4); border: calc(2.5px * var(--look-rim)) solid var(--sim-stroke); border-radius: var(--sim-radius-md);
  background: var(--sim-bg-surface); text-align: left; cursor: pointer; box-shadow: 0 calc(4px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-stroke) 60%, transparent);
  transition: transform 0.1s ease, box-shadow 0.1s ease, border-color 0.15s ease; animation: sflow-rise 0.4s ease both; animation-delay: calc(0.15s + var(--i, 0) * 0.12s); }
.sflow-row:hover { border-color: color-mix(in oklab, var(--sim-accent) 60%, var(--sim-stroke)); }
.sflow-row:active { transform: translateY(calc(4px * var(--look-lip))); box-shadow: none; }
.sflow-row:focus-visible { outline: 3px solid var(--sim-accent); outline-offset: 2px; }
.sim-dom-root--portrait .sflow-row { grid-template-columns: minmax(0, 1fr); gap: var(--sim-space-2); }
.sflow-row__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sflow-row__title { font-weight: 800; font-size: var(--sim-text-lg); line-height: 1.15; color: var(--sim-label); }
.sflow-row__sub { font-weight: 800; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }
.sflow-row__line { font-weight: 600; font-size: var(--sim-text-sm); line-height: 1.3; color: var(--sim-label); }
.sflow-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
/* deck: the tab panels share one grid cell; foot: the shared rule under the stage */
.sflow-deck { display: grid; flex: 1 1 auto; }
.sflow-deck > .sflow-stage { grid-area: 1 / 1; }
.sflow-deck > .sflow-stage.is-off { visibility: hidden; pointer-events: none; }
.sflow-deck .sflow-body { justify-content: flex-start; }
.sim-card.sflow-foot { display: flex; flex-direction: row; flex-wrap: wrap; align-items: baseline; justify-content: center; gap: 2px var(--sim-space-3);
  padding: var(--sim-space-2) var(--sim-space-3); text-align: center; }
.sflow-foot__formula { font-weight: 800; font-size: var(--sim-text-lg); color: var(--sim-label); white-space: nowrap; }
.sflow-foot__text { font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }
.sim-dom-root--portrait .sflow-stage { padding: var(--sim-space-3); gap: var(--sim-space-2); }
.sim-dom-root--portrait .sflow-callout { padding: var(--sim-space-2) var(--sim-space-3); font-size: var(--sim-text-sm); }
@keyframes sflow-pop { from { transform: scale(0.6); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes sflow-rise { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes sflow-in { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }
@keyframes sflow-in-back { from { opacity: 0; transform: translateX(-18px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .sflow-stage.is-in, .sflow-stage.is-in-back { animation: none; }
  .sflow-tab, .sflow-step, .sflow-step__n, .sflow-btn { transition: none; }
  .sflow-tab.is-new, .sflow-stage.is-in .sflow-callout, .sflow-stage.is-in-back .sflow-callout { animation: none; }
  .sflow-chip, .sflow-row { transition: none; }
  .sflow-row { animation: none; }
}
`;

export function flowTabsHtml(tabs, active, label = '') {
  // No active tab (a recap view): the first tab keeps the tab stop so the list stays keyboard-reachable.
  const none = !tabs.some((t) => t.key === active);
  return `<div class="sflow-tabs" role="tablist"${label ? ` aria-label="${esc(label)}"` : ''}>${tabs.map((t, i) => {
    const on = t.key === active;
    return `<button type="button" class="sflow-tab${t.fresh ? ' is-new' : ''}" role="tab" data-sflow-tab="${esc(t.key)}" aria-selected="${on}" tabindex="${on || (none && i === 0) ? 0 : -1}"${t.disabled ? ' disabled' : ''}>${esc(t.label)}${t.sub ? `<span class="sflow-tab__sub">${esc(t.sub)}</span>` : ''}</button>`;
  }).join('')}</div>`;
}

export function flowStepsHtml(steps, active) {
  return `<nav class="sflow-steps" aria-label="Steps">${steps.map((s, i) =>
    `<button type="button" class="sflow-step${i < active ? ' is-done' : ''}" data-sflow-step="${i}" aria-current="${i === active ? 'step' : 'false'}"><span class="sflow-step__n">${i + 1}</span><span>${esc(s)}</span></button>`
  ).join('')}</nav>`;
}

export function flowStageHtml({ kicker = '', title = '', sub = '', body = '', callout = '', calloutTone = '', cls = '', panel = '' } = {}) {
  const intro = kicker || title || sub
    ? `<div class="sflow-intro">${kicker ? `<div class="sflow-kicker">${esc(kicker)}</div>` : ''}${title ? `<h3 class="sflow-title">${esc(title)}</h3>` : ''}${sub ? `<p class="sflow-sub">${esc(sub)}</p>` : ''}</div>`
    : '';
  const cTone = calloutTone ? ` sflow-callout--${esc(calloutTone)}` : '';
  const pane = panel ? ` data-sflow-panel="${esc(panel)}" role="tabpanel"` : '';
  return `<section class="sflow-stage${cls ? ` ${esc(cls)}` : ''}"${pane}>${intro}<div class="sflow-body">${body}</div>${callout ? `<div class="sflow-callout${cTone}">${esc(callout)}</div>` : ''}</section>`;
}

const ICONS = {
  next: '<path d="M7 4l6 6-6 6"/>',
  back: '<path d="M13 4l-6 6 6 6"/>',
  replay: '<path d="M4.5 10a5.5 5.5 0 1 0 1.8-4.1"/><path d="M4 3.5v3.5h3.5"/>',
};
function ico(name) {
  const d = ICONS[name];
  return d ? `<svg class="sflow-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>` : '';
}

function btn(b, quiet) {
  if (!b) return '<span class="sflow-btn sflow-btn--ghost" aria-hidden="true"></span>';
  const before = b.icon === 'back' || b.icon === 'replay' ? ico(b.icon) : '';
  const after = b.icon === 'next' ? ico('next') : '';
  const val = b.value != null ? ` data-sflow-value="${esc(b.value)}"` : '';
  return `<button type="button" class="sflow-btn${quiet ? ' sflow-btn--quiet' : ''}" data-sflow-action="${esc(b.action)}"${val}${b.disabled ? ' disabled' : ''}>${before}${esc(b.label)}${after}</button>`;
}

export function flowChipHtml({ label = '', action = '', value = null, icon = '' } = {}) {
  const val = value != null ? ` data-sflow-value="${esc(value)}"` : '';
  return `<button type="button" class="sflow-chip" data-sflow-action="${esc(action)}"${val}>${ico(icon)}${esc(label)}</button>`;
}

export function flowChoiceHtml({ action = '', options = [], value = null, label = '' } = {}) {
  return `<div class="sflow-choice" role="radiogroup"${label ? ` aria-label="${esc(label)}"` : ''}>${options.map((o) => {
    const on = String(o.value) === String(value);
    return `<button type="button" class="sflow-choice__opt" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-sflow-action="${esc(action)}" data-sflow-value="${esc(o.value)}">${esc(o.label)}</button>`;
  }).join('')}</div>`;
}

export function setFlowChoice(root, action, value) {
  for (const b of root.querySelectorAll(`.sflow-choice__opt[data-sflow-action="${CSS.escape(action)}"]`)) {
    const on = b.dataset.sflowValue === String(value);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
}

export function flowSplitHtml(main, side) {
  return `<div class="sflow-split"><div class="sflow-split__main">${main}</div><div class="sflow-split__side">${side}</div></div>`;
}

export function flowInsetHtml({ title = '', meta = '', body = '', text = '' } = {}) {
  const head = title || meta ? `<div class="sflow-inset__head">${title ? `<h4 class="sflow-inset__title">${esc(title)}</h4>` : ''}${meta ? `<span class="sflow-inset__meta">${esc(meta)}</span>` : ''}</div>` : '';
  return `<div class="sflow-inset">${head}${body}${text ? `<p class="sflow-inset__text">${esc(text)}</p>` : ''}</div>`;
}

export function flowCompareHtml(rows) {
  return `<div class="sflow-compare">${rows.map((r, i) => `<button type="button" class="sflow-row" data-sflow-tab="${esc(r.key)}" style="--i:${i}">`
    + `<span class="sflow-row__text"><span class="sflow-row__title">${esc(r.title ?? '')}</span>${r.sub ? `<span class="sflow-row__sub">${esc(r.sub)}</span>` : ''}`
    + `${r.text ? `<span class="sflow-row__line">${esc(r.text)}</span>` : ''}</span><span class="sflow-row__body">${r.body ?? ''}</span></button>`).join('')}</div>`;
}

export function flowLiveHtml(text = '') {
  return `<p class="sflow-sr" aria-live="polite">${esc(text)}</p>`;
}

export function flowActionsHtml({ back = null, next = null } = {}) {
  return `<div class="sflow-actions">${btn(back, true)}${btn(next, false)}</div>`;
}

const HANDLERS = new WeakMap();

export function bindFlow(root, handlers) {
  const had = HANDLERS.has(root);
  HANDLERS.set(root, handlers || {});
  if (had) return;
  root.addEventListener('click', (e) => {
    const h = HANDLERS.get(root);
    const t = e.target.closest('[data-sflow-tab],[data-sflow-step],[data-sflow-action]');
    if (!t || !root.contains(t) || t.disabled) return;
    const sel = t.dataset.sflowTab != null ? `[data-sflow-tab="${CSS.escape(t.dataset.sflowTab)}"]`
      : t.dataset.sflowStep != null ? `[data-sflow-step="${CSS.escape(t.dataset.sflowStep)}"]`
        : `[data-sflow-action="${CSS.escape(t.dataset.sflowAction)}"]${t.dataset.sflowValue != null ? `[data-sflow-value="${CSS.escape(t.dataset.sflowValue)}"]` : ''}`;
    if (t.dataset.sflowTab != null) h.tab?.(t.dataset.sflowTab);
    else if (t.dataset.sflowStep != null) h.step?.(Number(t.dataset.sflowStep));
    else h.action?.(t.dataset.sflowAction, t.dataset.sflowValue, t);
    // A handler that re-rendered the frame dropped the focused node: put focus on its replacement.
    if (!t.isConnected) root.querySelector(sel)?.focus({ preventScroll: true });
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const r = e.target.closest?.('.sflow-choice__opt');
    if (r) {                                   // a radio group: arrows move and pick
      const all = [...r.parentElement.querySelectorAll('.sflow-choice__opt')];
      const n = all[(all.indexOf(r) + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
      e.preventDefault();
      HANDLERS.get(root).action?.(n.dataset.sflowAction, n.dataset.sflowValue, n);
      root.querySelector(`.sflow-choice__opt[data-sflow-action="${CSS.escape(n.dataset.sflowAction)}"][data-sflow-value="${CSS.escape(n.dataset.sflowValue)}"]`)?.focus();
      return;
    }
    const t = e.target.closest?.('[data-sflow-tab]');
    if (!t) return;
    const all = [...t.parentElement.querySelectorAll('[data-sflow-tab]:not(:disabled)')];
    const next = all[(all.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
    e.preventDefault();
    HANDLERS.get(root).tab?.(next.dataset.sflowTab);
    root.querySelector(`[data-sflow-tab="${CSS.escape(next.dataset.sflowTab)}"]`)?.focus();
  });
}

export function flowDeckHtml(stages) {
  return `<div class="sflow-deck">${(stages || []).join('')}</div>`;
}

/** Select tab key and show its panel; a panel that was hidden plays its enter (dir -1 from the left). */
export function showFlowPanel(root, key, dir = 1) {
  root.querySelectorAll('[data-sflow-tab]').forEach((b) => {
    const on = b.dataset.sflowTab === key;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  root.querySelectorAll('[data-sflow-panel]').forEach((p) => {
    const on = p.dataset.sflowPanel === key;
    const was = !p.classList.contains('is-off');
    p.classList.toggle('is-off', !on);
    p.setAttribute('aria-hidden', String(!on));
    if (on && !was) playStage(p, dir);
  });
}

export function flowFootHtml({ formula = '', text = '' } = {}) {
  return `<div class="sim-card sflow-foot">${formula ? `<span class="sflow-foot__formula">${esc(formula)}</span>` : ''}${text ? `<span class="sflow-foot__text">${esc(text)}</span>` : ''}</div>`;
}

export function playStage(stageEl, dir = 1) {
  if (!stageEl) return;
  stageEl.classList.remove('is-in', 'is-in-back');
  void stageEl.offsetWidth;
  stageEl.classList.add(dir < 0 ? 'is-in-back' : 'is-in');
}
