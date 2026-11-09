/**
 * SimPicVotes - share-and-count pictures for DomSimulation scenes (elections, budgets, surveys: any
 * "parts of a whole, then a count" story). The scene says WHAT (parts with tones and numbers), the kit
 * draws it; every helper returns an HTML string (text escaped here) and animates in with CSS only, so
 * there is no frame loop and everything comes to rest by itself. Reduced motion shows the end state.
 *
 *   A part is { tone, mark, name, pct | value }: tone = series 1..8, mark = a short badge text ('A'),
 *   name = 'Party A', pct = a share 0..100 (value = any printed number).
 *
 *   badgeHtml(tone, mark, { size })                     round tone chip with a lip ('sm' | 'md' | 'lg')
 *   shareBarHtml(parts, { threshold, thresholdLabel, label, grow, size, minLabel })
 *                                                       one stacked bar (all the votes), optional threshold line
 *   shareCardsHtml(parts, { grow })                     one card per part: badge, name, big value; part.dim / part.win
 *   cellGridHtml(cells, { cols, selected, play, action, step })
 *                                                       tap-to-inspect grid (constituencies, districts...): cell =
 *                                                       { tone (0 = not counted), mark, n, aria }; buttons carry
 *                                                       data-sflow-action=action data-sflow-value=index (SimFlowDom bindFlow)
 *   transferHtml({ from, to, caption })                 from-part hands its share to to-part (dots travel once)
 *   meterRowsHtml(rows, { threshold, thresholdLabel, max })  one bar per part against a line; row.win pops a tick
 *   tokenPoolHtml(groups, { cols, label })              isotype pool: one token per unit, a column per group
 *                                                       ({ tone, mark, n }), tokens drop in group by group
 *   shareShiftHtml(rows)                                aligned bars, e.g. [{ label: 'Votes', parts }, { label: 'Seats', parts }]
 *   lastAnimated(el) -> Element | null                  the element whose animation ends last (listen for animationend)
 *
 * SIM_PIC_VOTES_CSS is appended to SIM_LOOK_DOM_CSS (kit/SimLookDom.js): no CSS import needed.
 * Colours are var(--sim-*) only; ink on a tone fill is var(--sim-ink-on-N): call applyToneInks(root) (kit/SimLookDom.js)
 * after mount and in refreshTheme(), or the ink falls back to --sim-bg-deep. Text >= --sim-text-sm.
 * Keep this file ASCII and free of backticks inside the CSS text.
 */
import { esc } from 'simulations/base/SimUi.js';

export const SIM_PIC_VOTES_CSS = `
.spv-badge { --tone: var(--sim-series-1); --ink: var(--sim-bg-deep); display: inline-grid; place-items: center; flex: none;
  width: 36px; height: 36px; border-radius: 50%; background: var(--tone); color: var(--ink);
  font-weight: 800; font-size: var(--sim-text-lg); line-height: 1;
  box-shadow: inset 0 calc(-4px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 68%, black), 0 calc(2px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-stroke) 60%, transparent); }
.spv-badge--sm { width: 26px; height: 26px; font-size: var(--sim-text-sm); box-shadow: inset 0 calc(-3px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 68%, black); }
.spv-badge--lg { width: 48px; height: 48px; font-size: var(--sim-text-xl); box-shadow: inset 0 calc(-5px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 68%, black), 0 calc(3px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-stroke) 60%, transparent); }

.spv-bar { position: relative; }
.spv-bar--line { padding-top: 30px; }
.spv-bar__track { position: relative; height: 40px; padding: 0; border: calc(2px * var(--look-rim)) solid var(--sim-stroke); border-radius: var(--sim-radius-pill);
  background: var(--sim-track); overflow: hidden; box-shadow: 0 calc(3px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-stroke) 60%, transparent); }
.spv-bar--sm .spv-bar__track { height: 28px; box-shadow: none; }
.spv-bar__fill { display: flex; height: 100%; }
.spv-bar--grow .spv-bar__fill { animation: spv-wipe 0.8s cubic-bezier(0.3, 0.7, 0.3, 1) both; }
.spv-bar__seg { --tone: var(--sim-series-1); --ink: var(--sim-bg-deep); flex: 0 0 var(--w); min-width: 0; display: grid; place-items: center;
  background: var(--tone); color: var(--ink); box-shadow: inset 0 calc(-5px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 70%, black);
  font-weight: 800; font-size: var(--sim-text-sm); white-space: nowrap; overflow: hidden; }
.spv-bar--sm .spv-bar__seg { box-shadow: inset 0 calc(-3px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 70%, black); }
.spv-bar__seg + .spv-bar__seg { border-left: 2px solid var(--sim-bg-surface); }
.spv-bar__line { position: absolute; top: 22px; bottom: -6px; left: var(--at); width: 0; border-left: 3px dashed var(--sim-label); pointer-events: none; }
.spv-bar__linelab { position: absolute; top: -24px; left: 0; transform: translateX(-50%); padding: 1px var(--sim-space-2); border-radius: var(--sim-radius-pill);
  background: var(--sim-label); color: var(--sim-bg-surface); font-weight: 800; font-size: var(--sim-text-sm); line-height: 1.3; white-space: nowrap; }
.spv-bar--grow .spv-bar__line { animation: spv-drop 0.4s var(--look-spring) 0.75s both; }

.spv-cards { display: grid; grid-template-columns: repeat(var(--n, 3), minmax(0, 1fr)); gap: var(--sim-space-3); }
.spv-card { --tone: var(--sim-series-1); display: flex; flex-direction: column; align-items: center; gap: var(--sim-space-1); min-width: 0;
  padding: var(--sim-space-3) var(--sim-space-2); border: calc(2px * var(--look-rim)) solid var(--sim-stroke); border-radius: var(--sim-radius-md);
  background: var(--sim-bg-surface); box-shadow: 0 calc(4px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-stroke) 60%, transparent); text-align: center; }
.spv-cards--grow .spv-card { animation: spv-pop 0.42s var(--look-spring) both; animation-delay: calc(0.25s + var(--i, 0) * 0.09s); }
.spv-card__name { font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }
.spv-card__value { font-weight: 800; font-size: var(--sim-text-2xl); line-height: 1.05; color: var(--sim-label); font-variant-numeric: tabular-nums; }
.spv-card__note { font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }
.spv-card.is-dim { opacity: 0.5; border-style: dashed; box-shadow: none; }
.spv-card.is-win { border-color: color-mix(in oklab, var(--tone) 75%, var(--sim-label)); background: color-mix(in oklab, var(--tone) 12%, var(--sim-bg-surface));
  box-shadow: 0 calc(4px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 60%, black); }

.spv-grid { display: grid; grid-template-columns: repeat(var(--cols, 5), minmax(0, 1fr)); gap: var(--sim-space-2); perspective: 600px; }
.spv-cell { --tone: var(--sim-series-1); --ink: var(--sim-bg-deep); position: relative; height: 44px; padding: 0; overflow: visible;
  border: calc(2px * var(--look-rim)) dashed color-mix(in oklab, var(--sim-stroke) 80%, var(--sim-label)); border-radius: var(--sim-radius-sm);
  background: color-mix(in oklab, var(--sim-track) 45%, var(--sim-bg-surface)); cursor: pointer; transition: transform 0.12s ease; }
.spv-cell:hover { transform: translateY(-2px); }
.spv-cell__n, .spv-cell__face { position: absolute; inset: -2px; border-radius: inherit; display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--sim-space-2); font-weight: 800; line-height: 1; }
.spv-cell__n { color: var(--sim-label-muted); font-size: var(--sim-text-sm); }
.spv-cell__face { background: var(--tone); color: var(--ink); border: calc(2px * var(--look-rim)) solid color-mix(in oklab, var(--tone) 62%, black);
  box-shadow: inset 0 calc(-4px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 70%, black); }
.spv-cell__face small { font-size: var(--sim-text-sm); font-weight: 800; opacity: 0.85; }
.spv-cell__face b { font-size: var(--sim-text-lg); }
.spv-grid--play .spv-cell__face { animation: spv-flip 0.42s var(--look-spring) both; animation-delay: var(--d, 0ms); transform-origin: 50% 50%; }
.spv-cell[aria-pressed="true"] { z-index: 2; outline: 3px solid var(--sim-gold); outline-offset: 3px; transform: translateY(-2px); }
.spv-cell:focus-visible { outline: 3px solid var(--sim-accent); outline-offset: 3px; }

.spv-transfer { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1fr); align-items: center; gap: var(--sim-space-2);
  padding: var(--sim-space-3); border: calc(2px * var(--look-rim)) dashed var(--sim-stroke); border-radius: var(--sim-radius-md);
  background: color-mix(in oklab, var(--sim-track) 30%, var(--sim-bg-surface)); }
.spv-transfer__side { display: flex; align-items: center; justify-content: center; gap: var(--sim-space-2); min-width: 0; }
.spv-transfer__txt { display: flex; flex-direction: column; gap: 3px; min-width: 0; line-height: 1.15; }
.spv-transfer__name { font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label-muted); white-space: nowrap; }
.spv-transfer__val { font-weight: 800; font-size: var(--sim-text-xl); line-height: 1.1; color: var(--sim-label); font-variant-numeric: tabular-nums; }
.spv-transfer__side.is-out .spv-badge { opacity: 0.55; }
.spv-transfer__side.is-out .spv-transfer__val { text-decoration: line-through; text-decoration-thickness: 2px; color: var(--sim-label-muted); }
.spv-transfer__path { position: relative; display: flex; flex-direction: column; align-items: center; gap: var(--sim-space-1); min-width: 0; }
.spv-transfer__rail { position: relative; width: 100%; height: 18px; }
.spv-transfer__rail::before { content: ''; position: absolute; left: 4px; right: 12px; top: 8px; border-top: 3px dashed color-mix(in oklab, var(--sim-label) 45%, transparent); }
.spv-transfer__rail::after { content: ''; position: absolute; right: 2px; top: 3px; border: 7px solid transparent; border-left: 11px solid var(--sim-label); border-right: 0; }
.spv-transfer__dot { --tone: var(--sim-series-1); position: absolute; left: 0; top: 3px; width: 13px; height: 13px; border-radius: 50%; background: var(--tone);
  box-shadow: inset 0 calc(-2px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 65%, black); opacity: 0;
  animation: spv-travel 1.1s cubic-bezier(0.45, 0, 0.3, 1) both; animation-delay: calc(0.3s + var(--i, 0) * 0.16s); }
.spv-transfer__cap { font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label-muted); text-align: center; line-height: 1.25; }

.spv-meters { position: relative; display: grid; grid-template-columns: 36px minmax(0, 1fr) 64px; align-items: center; column-gap: var(--sim-space-3); row-gap: var(--sim-space-3); padding-top: 30px; }
.spv-meter__track { position: relative; height: 30px; border-radius: var(--sim-radius-pill); background: var(--sim-track); overflow: hidden;
  box-shadow: inset 0 2px 0 color-mix(in oklab, var(--sim-stroke) 50%, transparent); }
.spv-meter__fill { --tone: var(--sim-series-1); display: block; height: 100%; width: var(--w); border-radius: inherit; background: var(--tone);
  box-shadow: inset 0 calc(-5px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 70%, black); transform-origin: left center;
  animation: spv-grow 0.9s cubic-bezier(0.3, 0.7, 0.3, 1) both; animation-delay: calc(0.5s + var(--i, 0) * 0.2s); }
.spv-meter__val { display: flex; align-items: center; gap: var(--sim-space-1); font-weight: 800; font-size: var(--sim-text-lg); color: var(--sim-label); font-variant-numeric: tabular-nums; }
.spv-meter__tick { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--sim-good); color: var(--sim-bg-surface);
  animation: spv-pop 0.4s var(--look-spring) both; animation-delay: calc(1.4s + var(--i, 0) * 0.2s); }
.spv-meter__tick svg { width: 14px; height: 14px; }
.spv-meters__line { position: absolute; top: 22px; bottom: -6px; left: calc(36px + var(--sim-space-3) + (100% - 36px - 64px - 2 * var(--sim-space-3)) * var(--at)); width: 0;
  border-left: 3px dashed var(--sim-label); pointer-events: none; }
.spv-meters__line span { position: absolute; top: -24px; left: 0; transform: translateX(-50%); padding: 1px var(--sim-space-2); border-radius: var(--sim-radius-pill);
  background: var(--sim-label); color: var(--sim-bg-surface); font-weight: 800; font-size: var(--sim-text-sm); line-height: 1.3; white-space: nowrap; }

.spv-pool { display: flex; align-items: flex-end; justify-content: center; gap: var(--sim-space-5); }
.spv-pool__group { --tone: var(--sim-series-1); display: flex; flex-direction: column; align-items: center; gap: var(--sim-space-2); }
.spv-pool__dots { --dot: 16px; display: flex; flex-wrap: wrap-reverse; gap: 5px; width: calc(var(--cols, 5) * var(--dot) + (var(--cols, 5) - 1) * 5px); }
.spv-pool__dot { width: var(--dot); height: var(--dot); border-radius: 50%; background: var(--tone); box-shadow: inset 0 calc(-3px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 68%, black);
  animation: spv-dropin 0.36s var(--look-spring) both; animation-delay: calc(var(--k, 0) * 11ms + 0.2s); }
.spv-pool__lab { display: flex; align-items: center; gap: var(--sim-space-2); font-weight: 800; font-size: var(--sim-text-lg); color: var(--sim-label); font-variant-numeric: tabular-nums; }

.spv-shift { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: var(--sim-space-2); row-gap: var(--sim-space-1); }
.spv-shift__lab { font-weight: 800; font-size: var(--sim-text-sm); color: var(--sim-label-muted); text-align: right; }

.sim-dom-root--portrait .spv-pool { gap: var(--sim-space-3); }
.sim-dom-root--portrait .spv-pool__dots { --dot: 11px; gap: 3px; width: calc(var(--cols, 5) * var(--dot) + (var(--cols, 5) - 1) * 3px); }
.sim-dom-root--portrait .spv-pool__lab { font-size: var(--sim-text-md); gap: var(--sim-space-1); }
.sim-dom-root--portrait .spv-transfer { padding: var(--sim-space-2); }
.sim-dom-root--portrait .spv-transfer__side { flex-direction: column; gap: var(--sim-space-1); text-align: center; }
.sim-dom-root--portrait .spv-cell { height: 34px; }
.sim-dom-root--portrait .spv-cards { gap: var(--sim-space-2); }
.sim-dom-root--portrait .spv-card__value { font-size: var(--sim-text-xl); }
@keyframes spv-wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes spv-grow { from { transform: scaleX(0); } to { transform: none; } }
@keyframes spv-pop { from { transform: scale(0.3); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes spv-drop { from { transform: translateY(-14px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes spv-dropin { from { transform: translateY(-22px) scale(0.4); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes spv-flip { from { transform: rotateX(90deg) scale(0.8); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes spv-travel { 0% { left: 0; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { left: calc(100% - 26px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .spv-bar--grow .spv-bar__fill, .spv-bar--grow .spv-bar__line, .spv-cards--grow .spv-card, .spv-grid--play .spv-cell__face,
  .spv-meter__fill, .spv-meter__tick, .spv-pool__dot { animation: none; }
  .spv-transfer__dot { animation: none; display: none; }
  .spv-cell { transition: none; }
}
`;

const toneVars = (t) => {
  const n = Math.max(1, Math.min(8, Number(t) || 1));
  return `--tone:var(--sim-series-${n});--ink:var(--sim-ink-on-${n}, var(--sim-bg-deep))`;
};
const pctOf = (p) => Math.max(0, Number(p.pct ?? p.value ?? 0));
const TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function badgeHtml(tone, mark, { size = 'md' } = {}) {
  return `<span class="spv-badge${size !== 'md' ? ` spv-badge--${size}` : ''}" style="${toneVars(tone)}" aria-hidden="true">${esc(mark ?? '')}</span>`;
}

const ariaParts = (parts) => parts.map((p) => `${p.name || p.mark} ${p.pct ?? p.value}${p.pct != null ? '%' : ''}`).join(', ');

export function shareBarHtml(parts, { threshold = null, thresholdLabel = '', label = '', grow = true, size = 'md', minLabel = 12 } = {}) {
  const total = parts.reduce((a, p) => a + pctOf(p), 0) || 1;
  const segs = parts.map((p) => {
    const w = (100 * pctOf(p)) / total;
    if (w <= 0) return '';
    // Wide enough: 'A 40%'; narrow: just the mark; a sliver: nothing (the aria-label still has it).
    const text = w >= minLabel ? `${p.mark ?? ''} ${p.pct != null ? `${p.pct}%` : (p.value ?? '')}`.trim() : (w >= minLabel / 2.4 ? String(p.mark ?? '') : '');
    return `<span class="spv-bar__seg" style="${toneVars(p.tone)};--w:${w.toFixed(2)}%">${esc(text)}</span>`;
  }).join('');
  const cls = `spv-bar${grow ? ' spv-bar--grow' : ''}${size === 'sm' ? ' spv-bar--sm' : ''}${threshold != null ? ' spv-bar--line' : ''}`;
  const line = threshold != null
    ? `<span class="spv-bar__line" style="--at:${Number(threshold)}%" aria-hidden="true">${thresholdLabel ? `<span class="spv-bar__linelab">${esc(thresholdLabel)}</span>` : ''}</span>`
    : '';
  return `<div class="${cls}" role="img" aria-label="${esc(label ? `${label}: ${ariaParts(parts)}` : ariaParts(parts))}"><div class="spv-bar__track"><div class="spv-bar__fill">${segs}</div></div>${line}</div>`;
}

export function shareCardsHtml(parts, { grow = true } = {}) {
  return `<div class="spv-cards${grow ? ' spv-cards--grow' : ''}" style="--n:${parts.length}">${parts.map((p, i) =>
    `<div class="spv-card${p.dim ? ' is-dim' : ''}${p.win ? ' is-win' : ''}" style="${toneVars(p.tone)};--i:${i}">${badgeHtml(p.tone, p.mark, { size: 'lg' })}`
    + `<span class="spv-card__name">${esc(p.name ?? '')}</span><span class="spv-card__value">${esc(p.pct != null ? `${p.pct}%` : (p.value ?? ''))}</span>`
    + `${p.note ? `<span class="spv-card__note">${esc(p.note)}</span>` : ''}</div>`).join('')}</div>`;
}

export function cellGridHtml(cells, { cols = 5, selected = -1, play = true, action = 'inspect', step = 55 } = {}) {
  return `<div class="spv-grid${play ? ' spv-grid--play' : ''}" style="--cols:${cols}">${cells.map((c, i) => {
    const n = c.n ?? String(i + 1).padStart(2, '0');
    const face = c.tone ? `<span class="spv-cell__face" style="--d:${Math.round(i * step)}ms" aria-hidden="true"><small>${esc(n)}</small><b>${esc(c.mark ?? '')}</b></span>` : '';
    return `<button type="button" class="spv-cell" style="${toneVars(c.tone)}" data-sflow-action="${esc(action)}" data-sflow-value="${i}" aria-pressed="${i === selected}"`
      + ` aria-label="${esc(c.aria ?? n)}"><span class="spv-cell__n" aria-hidden="true">${esc(n)}</span>${face}</button>`;
  }).join('')}</div>`;
}

export function transferHtml({ from, to, caption = '' } = {}) {
  const side = (p, out) => `<div class="spv-transfer__side${out ? ' is-out' : ''}">${badgeHtml(p.tone, p.mark)}<span class="spv-transfer__txt">`
    + `<span class="spv-transfer__name">${esc(p.name ?? '')}</span><span class="spv-transfer__val">${esc(p.value ?? (p.pct != null ? `${p.pct}%` : ''))}</span></span></div>`;
  const dots = Array.from({ length: 5 }, (_, i) => `<i class="spv-transfer__dot" style="${toneVars(from.tone)};--i:${i}"></i>`).join('');
  return `<div class="spv-transfer">${side(from, true)}<div class="spv-transfer__path"><div class="spv-transfer__rail" aria-hidden="true">${dots}</div>`
    + `${caption ? `<span class="spv-transfer__cap">${esc(caption)}</span>` : ''}</div>${side(to, false)}</div>`;
}

export function meterRowsHtml(rows, { threshold = null, thresholdLabel = '', max = 100 } = {}) {
  const body = rows.map((r, i) => {
    const w = Math.max(0, Math.min(100, (100 * pctOf(r)) / max));
    return `${badgeHtml(r.tone, r.mark)}<span class="spv-meter__track"><span class="spv-meter__fill" style="${toneVars(r.tone)};--w:${w.toFixed(2)}%;--i:${i}"></span></span>`
      + `<span class="spv-meter__val">${esc(r.pct != null ? `${r.pct}%` : (r.value ?? ''))}${r.win ? `<span class="spv-meter__tick" style="--i:${i}">${TICK}</span>` : ''}</span>`;
  }).join('');
  const line = threshold != null
    ? `<span class="spv-meters__line" style="--at:${Number(threshold) / max}" aria-hidden="true">${thresholdLabel ? `<span>${esc(thresholdLabel)}</span>` : ''}</span>`
    : '';
  return `<div class="spv-meters" role="img" aria-label="${esc(ariaParts(rows))}">${body}${line}</div>`;
}

export function tokenPoolHtml(groups, { cols = 5, label = '' } = {}) {
  let k = 0;
  const html = groups.map((g) => {
    const dots = Array.from({ length: Math.max(0, g.n | 0) }, () => `<i class="spv-pool__dot" style="--k:${k++}"></i>`).join('');
    return `<div class="spv-pool__group" style="${toneVars(g.tone)}"><div class="spv-pool__dots" style="--cols:${cols}">${dots}</div>`
      + `<span class="spv-pool__lab">${badgeHtml(g.tone, g.mark, { size: 'sm' })}${esc(g.value ?? g.n)}</span></div>`;
  }).join('');
  const aria = label || groups.map((g) => `${g.name || g.mark} ${g.n}`).join(', ');
  return `<div class="spv-pool" role="img" aria-label="${esc(aria)}">${html}</div>`;
}

export function shareShiftHtml(rows) {
  return `<div class="spv-shift">${rows.map((r) => `<span class="spv-shift__lab">${esc(r.label)}</span>${shareBarHtml(r.parts, { size: 'sm', label: r.label, grow: r.grow ?? true, minLabel: r.minLabel ?? 22 })}`).join('')}</div>`;
}

/** The descendant whose CSS animation finishes last (delay + duration), for an animationend hook. */
export function lastAnimated(el) {
  if (!el?.querySelectorAll || typeof getComputedStyle !== 'function') return null;
  let best = null;
  let end = -1;
  const secs = (v) => Math.max(...String(v).split(',').map((s) => (s.trim().endsWith('ms') ? parseFloat(s) / 1000 : parseFloat(s)) || 0));
  for (const n of el.querySelectorAll('*')) {
    const cs = getComputedStyle(n);
    if (!cs.animationName || cs.animationName === 'none') continue;
    const t = secs(cs.animationDelay) + secs(cs.animationDuration);
    if (t > end) { end = t; best = n; }
  }
  return best;
}
