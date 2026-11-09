/**
 * SimLookDom - the DOM counterpart of SimLook.js for DomSimulation scenes: a
 * patterned backdrop class, the note (a one-line footer, or the card overlay) and the
 * find (burst, from SimFind.js).
 * Cards, tags and fields come from SimUi / DomSimulation (docs/dom-scene-kit.md);
 * this file does not duplicate them. Colours are var(--sim-*) only; spacing,
 * radius and text sizes are SimUi's --sim-space-* / --sim-radius-* / --sim-text-*.
 *
 * Use: this.render({ html, css: SIM_LOOK_DOM_CSS + MY_CSS }), then
 *   <div class="sl-backdrop">...</div>          risograph paper backdrop (--grid, --plain)
 *   <span class="sl-kicker">FIGURE 1.4</span>    a kicker: small caps in --sim-annot (mono on the casefile setting)
 *   noteLineHtml(rows)                           the default note: ONE muted line in the flow, at the foot of the
 *                                                scene (10 scenes had to override the card's CSS to get this)
 *   host.insertAdjacentHTML('beforeend', noteCardHtml(rows, 'NOTE'))   the modal card overlay: only for a beat the learner does not touch
 *   burst(hostEl, n, at)                         the find: a small ring and pop, then the cue; cleans itself up
 *                                                (makes a static host relative; only at a find, never on Run or a miss; SimFind.js)
 *   SimPicDom.js pictures (mountParliament, materialTileHtml, thermoHtml): their CSS rides along in SIM_LOOK_DOM_CSS
 *   SimFlowDom.js frame (tabs, steps, one stage card, Back / Next): its CSS rides along too
 *   SimPicVotes.js share pictures (share bar, cards, cell grid, transfer, meters, token pool): CSS rides along too
 *   SimAnnotate.js callouts, underlines, highlights, rings (annotations, annotateDom): CSS rides along too
 *   applyToneInks(el)                            sets --sim-ink-on-1..8 / -accent / -good / -bad / -warning: the
 *                                                readable text colour ON that fill in the current theme
 * Not a scene: no class export.
 */
import { esc } from 'simulations/base/SimUi.js';
import { inkOn } from './SimLook.js';
import { SIM_PIC_CSS } from './SimPicDom.js';
import { SIM_FLOW_CSS } from './SimFlowDom.js';
import { SIM_PIC_VOTES_CSS } from './SimPicVotes.js';
import { SIM_FIND_CSS, burst } from './SimFind.js';
import { SIM_WORLD_CSS } from './SimWorld.js';
import { SIM_ANNOTATE_CSS } from './SimAnnotate.js';

export { burst };

// The paper and setting assets resolve next to this module (absolute, so the CSS works inside any shadow root).
const PAPER_GRAIN = new URL('./paper/grain.svg', import.meta.url).href;
const PAPER_HALFTONE = new URL('./paper/halftone.svg', import.meta.url).href;

export const SIM_LOOK_DOM_CSS = `
.sl-backdrop {
  /* Kit-owned risograph paper, the same look SimLook paints on canvas: a cached fibre grain (paper/grain.svg, 128 px tile), and halftone corners from
     paper/halftone.svg used as a mask over two token inks (series-1 top left, series-4 bottom
     right). Paper = bg-surface x (0.992, 0.976, 0.945): cream in light, indigo in dark (older
     browsers without relative colour fall back to plain bg-surface). The corners sit on pseudo-elements under the content (isolation keeps z-index -1 inside). */
  position: relative;
  isolation: isolate;
  background-color: var(--sim-bg-surface);
  background-color: rgb(from var(--sim-bg-surface) calc(r * 0.992) calc(g * 0.976) calc(b * 0.945));
  background-image: url("${PAPER_GRAIN}");
  background-size: 128px 128px;
}
.sl-backdrop::before, .sl-backdrop::after {
  content: '';
  position: absolute; inset: 0; z-index: -1;
  pointer-events: none;
  -webkit-mask: url("${PAPER_HALFTONE}") no-repeat;
  mask: url("${PAPER_HALFTONE}") no-repeat;
  -webkit-mask-size: 640px 640px;
  mask-size: 640px 640px;
}
.sl-backdrop::before {
  background: color-mix(in srgb, var(--sim-series-1) 24%, transparent);
  -webkit-mask-position: -320px -320px;
  mask-position: -320px -320px;
}
.sl-backdrop::after {
  background: color-mix(in srgb, var(--sim-series-4) 24%, transparent);
  -webkit-mask-position: right -320px bottom -320px;
  mask-position: right -320px bottom -320px;
}
.sl-backdrop--grid {
  background-image:
    linear-gradient(color-mix(in srgb, color-mix(in srgb, var(--sim-stroke) 60%, var(--sim-series-1)) 18%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, color-mix(in srgb, var(--sim-stroke) 60%, var(--sim-series-1)) 18%, transparent) 1px, transparent 1px),
    url("${PAPER_GRAIN}");
  background-size: 34px 34px, 34px 34px, 128px 128px;
  background-position: 0 17px, 17px 0, 0 0;
}
.sl-backdrop--grid::before, .sl-backdrop--grid::after { opacity: 0.75; }
.sl-backdrop--plain::before, .sl-backdrop--plain::after { opacity: 0.55; -webkit-mask-size: 540px 540px; mask-size: 540px 540px; }
.sl-backdrop--plain::before { -webkit-mask-position: -270px -270px; mask-position: -270px -270px; }
.sl-backdrop--plain::after { -webkit-mask-position: right -270px bottom -270px; mask-position: right -270px bottom -270px; }
/* A look with backdrop 'flat' (DomSimulation sets data-sim-backdrop; kit/looks): the surface token and no corners; grain goes too. */
[data-sim-paper="riso"][data-sim-backdrop="flat"] .sl-backdrop { background-color: var(--sim-bg-surface); background-image: none; }
[data-sim-paper="riso"][data-sim-backdrop="flat"] .sl-backdrop--grid {
  background-image:
    linear-gradient(color-mix(in srgb, var(--sim-label) 7%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--sim-label) 7%, transparent) 1px, transparent 1px);
  background-size: 34px 34px;
  background-position: 0 17px, 17px 0;
}
[data-sim-backdrop="flat"] .sl-backdrop::before, [data-sim-backdrop="flat"] .sl-backdrop::after { display: none; }
/* Maths paper (DomSimulation sets data-sim-paper="graph" on the scale wrap for a maths course; kit/paperKind.js):
   flat bg-deep ruled in 24 px squares, lines 8% label (plain 5%), no grain or corners; SimLook drawGraphPaper paints the same. */
[data-sim-paper="graph"] .sl-backdrop {
  --sl-rule: color-mix(in srgb, var(--sim-label) 8%, var(--sim-bg-deep));
  background-color: var(--sim-bg-deep);
  background-image: linear-gradient(90deg, var(--sl-rule) 1px, transparent 1px), linear-gradient(var(--sl-rule) 1px, transparent 1px);
  background-size: 24px 24px;
  background-position: 0 0;
}
[data-sim-paper="graph"] .sl-backdrop--plain { --sl-rule: color-mix(in srgb, var(--sim-label) 5%, var(--sim-bg-deep)); }
[data-sim-paper="graph"] .sl-backdrop::before, [data-sim-paper="graph"] .sl-backdrop::after { display: none; }
.sl-note {
  position: absolute; inset: 0; z-index: 5;
  display: grid; place-items: center;
  padding: var(--sim-space-4);
  background: color-mix(in oklab, var(--sim-bg-deep) 62%, transparent);
  animation: sl-fade 0.3s ease both;
}
.sl-note__card {
  width: min(460px, 100%);
  padding: var(--sim-space-5) var(--sim-space-4) var(--sim-space-4);
  border: calc(3px * var(--look-rim)) solid var(--sim-accent);
  border-radius: var(--sim-radius-md);
  background: var(--sim-bg-surface);
  box-shadow: 0 calc(5px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-accent) 45%, var(--sim-bg-deep));
  display: flex; flex-direction: column; gap: var(--sim-space-3);
  position: relative;
  animation: sl-pop 0.45s var(--look-spring) 0.05s both;
}
.sl-note__badge {
  position: absolute; inset: auto auto 100% var(--sim-space-4);
  transform: translateY(50%);
  padding: var(--sim-space-1) var(--sim-space-3);
  border-radius: var(--sim-radius-pill);
  background: var(--sim-accent); color: var(--sim-bg-deep);
  font-weight: 800; font-size: var(--sim-text-md);
}
.sl-note__row { display: grid; grid-template-columns: 36px minmax(0, 1fr); align-items: center; gap: var(--sim-space-3);
  animation: sl-rise 0.35s ease both; animation-delay: calc(0.35s + var(--i, 0) * 0.18s); }
.sl-note__icon { width: 36px; height: 36px; display: grid; place-items: center; }
.sl-note__icon svg { width: 100%; height: 100%; }
.sl-note__text { margin: 0; font-weight: 800; font-size: var(--sim-text-lg); line-height: 1.25; color: var(--sim-label); }
.sl-note__sub { display: block; font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }

.sl-note-line { margin: 0 0 0 auto; width: fit-content; max-width: 100%; box-sizing: border-box; padding: 1px var(--sim-space-3);
  border-radius: var(--sim-radius-pill); background: color-mix(in oklab, var(--sim-bg-deep) 78%, transparent);
  text-align: right; font-weight: 700; font-size: var(--sim-text-sm); line-height: 1.3; color: var(--sim-label-muted); }
/* A kicker over a figure or card (FIGURE 1.4, WORKING CLAIM): small caps in the signature colour; the typewriter
   mono on the casefile setting. */
.sl-kicker { display: block; font: 700 14px/1.1 var(--sim-font); letter-spacing: 0.14em; text-transform: uppercase; color: var(--sim-annot); }
[data-sim-setting="casefile"] .sl-kicker { font-family: var(--sim-font-mono, monospace); letter-spacing: 0.12em; }
@keyframes sl-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes sl-pop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes sl-rise { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .sl-note, .sl-note__card, .sl-note__row { animation: none; }
}
` + SIM_WORLD_CSS + SIM_FIND_CSS + SIM_PIC_CSS + SIM_FLOW_CSS + SIM_PIC_VOTES_CSS + SIM_ANNOTATE_CSS;

/**
 * The default note (what the model leaves out): one muted line in the document flow, never covering the
 * scene. rows: [{ text }]; the texts are joined with a middle dot and escaped. Keep it short.
 */
export function noteLineHtml(rows) {
  return `<p class="sl-note-line" role="note">${rows.map((r) => esc(r.text)).join(' &middot; ')}</p>`;
}

/**
 * The note-card overlay (what the model leaves out). rows: [{ icon?: svg markup
 * written by the scene author, text, sub? }]; text and sub are escaped. title
 * is the badge text ('' = no badge). Short lines only - the full wording is in
 * the slide's prose.
 */
export function noteCardHtml(rows, title = '') {
  const label = title ? esc(title) : 'Note';
  return `<div class="sl-note" role="note" aria-label="${label}">
    <div class="sl-note__card">
      ${title ? `<span class="sl-note__badge">${esc(title)}</span>` : ''}
      ${rows.map((r, i) => `<div class="sl-note__row" style="--i:${i}">
        <span class="sl-note__icon" aria-hidden="true">${r.icon || ''}</span>
        <p class="sl-note__text">${esc(r.text)}${r.sub ? `<span class="sl-note__sub">${esc(r.sub)}</span>` : ''}</p>
      </div>`).join('')}
    </div>
  </div>`;
}

/**
 * Text on a coloured fill must flip ink by tone AND theme (amber wants dark ink
 * in the light theme, violet light ink). Sets --sim-ink-on-1..8, -accent,
 * -good, -bad, -warning, -gold on el from the live tokens. Call after mount and on a
 * theme change (refreshTheme).
 */
export function applyToneInks(el) {
  if (!el || typeof getComputedStyle !== 'function') return;
  const cs = getComputedStyle(el);
  const get = (n) => cs.getPropertyValue(n).trim();
  const c = { bgDeep: get('--sim-bg-deep'), label: get('--sim-label') };
  if (!c.bgDeep || !c.label) return;
  for (let i = 1; i <= 8; i++) el.style.setProperty(`--sim-ink-on-${i}`, inkOn(c, get(`--sim-series-${i}`)));
  for (const k of ['accent', 'good', 'bad', 'warning', 'gold']) el.style.setProperty(`--sim-ink-on-${k}`, inkOn(c, get(`--sim-${k}`)));
}
