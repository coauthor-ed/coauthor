/**
 * SimTimeline - a DOM timeline for history, civics and economics: chronology,
 * duration, eras; read it beat by beat, or play it (place events, put them in
 * order) with SimPick. Landscape: horizontal axis, cards stemmed above and
 * below in measured lanes (never overlap). Portrait: vertical axis, cards stacked.
 *
 *   class MyScene extends TimelineScene {        // the config base (most scenes)
 *     static CONFIG = { ... };  static BEAT_STEP_MAP = [...];  static ARIA_LABEL = '...';
 *   }
 *   const tl = mountTimeline(hostEl, cfg, { onChange, announce });   // the function form
 *   tl.setStep(step); tl.check() -> [{ id, ok }]; tl.reset(); tl.destroy();
 *
 * cfg: { title?, from, to (years, negative = BCE), scale: 'linear' | 'log' (log: years
 *   before `to`), ticks?: [years], eras: [{ from, to, label, tone 1..8 }],
 *   events: [{ id, at, label, sub?, when? (date text), tone?, revealAt? (step) }],
 *   spans: [{ from, to, label?, revealAt? }] (a bracket with the duration),
 *   mode: 'read' | 'place' | 'order', modes?: [mode per step],
 *   slots?: [{ from, to, label }] (place mode targets; default = tick intervals),
 *   tolerance?: years a placed event may miss its slot by }
 * Validates at mount and throws a plain message. Text is escaped.
 */
import { DomSimulation } from 'simulations/base/DomSimulation.js';
import { esc } from 'simulations/base/SimUi.js';
import { SIM_LOOK_DOM_CSS, burst, applyToneInks } from './SimLookDom.js';
import { simPick } from './SimPick.js';
import { fmtYear, fmtSpan, tx } from './SimText.js';
import { mountEl } from './SimSvg.js';
import { normalizeBeatMap } from './beatMap.js';

const SVGNS = 'http://www.w3.org/2000/svg';

export const TIMELINE_CSS = `
.tl { position: relative; display: flex; flex-direction: column; gap: var(--sim-space-2); min-height: 0; flex: 1 1 auto; }
.tl-head { display: flex; align-items: center; gap: var(--sim-space-2); flex-wrap: wrap; }
.tl-title { margin: 0; font: 800 var(--sim-text-xl)/1.2 var(--sim-font-display, var(--sim-font)); }
.tl-verdict { margin-left: auto; padding: 4px 14px; border-radius: var(--look-pill); font-weight: 800; font-size: var(--sim-text-md);
  background: var(--sim-good); color: var(--sim-ink-on-good, var(--sim-bg-deep)); box-shadow: 0 calc(3px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-good) 55%, black); animation: sl-pop 0.4s var(--look-spring) both; }
.tl-verdict--miss { background: var(--sim-warning); color: var(--sim-ink-on-warning, var(--sim-bg-deep)); box-shadow: 0 calc(3px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-warning) 55%, black); }
.tl-stage { position: relative; flex: 1 1 auto; min-height: 300px; }
.tl-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.tl-stem { fill: none; stroke: color-mix(in oklab, var(--tone) 70%, var(--sim-label)); stroke-width: 2.5; stroke-linecap: round; stroke-dasharray: 0 7; }
.tl-axis { position: absolute; left: 22px; right: 22px; top: 50%; height: 18px; margin-top: -9px; border-radius: var(--look-pill);
  background: var(--sim-track); box-shadow: inset 0 calc(-4px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-track) 60%, black), 0 calc(3px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-bg-deep) 60%, black); }
.tl-era { position: absolute; top: 0; bottom: 0; border-radius: var(--look-pill); background: var(--tone);
  box-shadow: inset 0 calc(-4px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 70%, black), inset 0 calc(3px * var(--look-gloss)) 0 color-mix(in oklab, var(--tone) 60%, white); }
.tl-era { top: -5px; bottom: -5px; }
.tl-era__label { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); white-space: nowrap;
  font-weight: 800; font-size: var(--sim-text-sm); line-height: 1; color: var(--tl-ink); }
.tl-era--out .tl-era__label { top: auto; bottom: calc(100% + 6px); transform: translateX(-50%); padding: 3px 9px; border-radius: var(--look-pill); color: var(--tl-ink);
  background: var(--tone); box-shadow: 0 calc(2px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 55%, black); }
.tl--place .tl-era__label, .tl--order .tl-era__label { display: none; }
.tl-tick { position: absolute; top: calc(100% + 6px); transform: translateX(-50%); white-space: nowrap;
  font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }
.tl-tick::before { content: ''; position: absolute; left: 50%; top: -12px; width: 3px; height: 8px; margin-left: -1.5px; border-radius: 2px; background: var(--sim-label-muted); opacity: 0.6; }
.tl-zero { color: var(--sim-label); }
.tl-dot { position: absolute; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; background: var(--tone);
  border: calc(3px * var(--look-rim)) solid var(--sim-bg-deep); box-shadow: 0 0 0 3px var(--tone); animation: tl-pop 0.4s var(--look-spring) both; }
.tl-card { position: absolute; width: max-content; max-width: 168px; padding: 8px 12px 10px; border-radius: var(--sim-radius-md);
  background: var(--sim-bg-surface); border: calc(2px * var(--look-rim)) solid color-mix(in oklab, var(--tone) 70%, var(--sim-stroke));
  box-shadow: 0 calc(4px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 55%, var(--sim-bg-deep)); display: flex; flex-direction: column; gap: 3px;
  animation: tl-pop 0.45s var(--look-spring) both; }
.tl-card::before { content: ''; position: absolute; left: 10px; right: 10px; top: 3px; height: 3px; border-radius: 2px; background: color-mix(in oklab, var(--tone) 35%, transparent); opacity: var(--look-gloss); }
.tl-when { align-self: flex-start; padding: 1px 9px; border-radius: var(--look-pill); background: var(--tone); color: var(--tl-ink);
  font-weight: 800; font-size: var(--sim-text-sm); white-space: nowrap; }
.tl-label { font-weight: 800; font-size: var(--sim-text-md); line-height: 1.2; color: var(--sim-label); }
.tl-sub { font-weight: 700; font-size: var(--sim-text-sm); line-height: 1.2; color: var(--sim-label-muted); }
.tl-span { position: absolute; top: calc(100% + 36px); height: 12px; border: calc(3px * var(--look-rim)) solid var(--sim-accent); border-top: 0; border-radius: 0 0 calc(10px * var(--look-radius)) calc(10px * var(--look-radius)); }
.tl-span__chip { position: absolute; left: 50%; top: 100%; transform: translate(-50%, 4px); white-space: nowrap; padding: 2px 10px; border-radius: var(--look-pill);
  background: var(--sim-accent); color: var(--sim-ink-on-accent, var(--sim-bg-deep)); font-weight: 800; font-size: var(--sim-text-sm); box-shadow: 0 calc(3px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-accent) 55%, black); }
.tl-legend { display: none; flex-wrap: wrap; gap: 6px; }
.tl-legend__era { padding: 2px 10px; border-radius: var(--look-pill); background: var(--tone); color: var(--tl-ink); font-weight: 800; font-size: var(--sim-text-sm); }
.sim-dom-root--portrait .tl-legend { display: flex; }
.sim-dom-root--portrait .tl-era__label { display: none; }
.tl-bins { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: var(--sim-space-2); }
.tl-bin { min-height: 104px; padding: 6px; display: flex; flex-direction: column; gap: 6px; border-radius: var(--sim-radius-md);
  border: calc(2px * var(--look-rim)) dashed color-mix(in oklab, var(--tone) 60%, var(--sim-stroke)); background: color-mix(in oklab, var(--sim-bg-surface) 65%, transparent); }
.tl-bin__head { align-self: stretch; text-align: center; padding: 3px 8px; border-radius: var(--look-pill); background: var(--tone); color: var(--tl-ink);
  font-weight: 800; font-size: var(--sim-text-sm); box-shadow: 0 calc(2px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 55%, black); }
.tl-bin .tl-card, .tl-tray .tl-card { position: relative; animation: none; max-width: none; }
.tl-bin .tl-card { width: 100%; }
.tl-tray { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--sim-space-2); min-height: 64px; padding: var(--sim-space-2);
  border-radius: var(--sim-radius-md); background: color-mix(in oklab, var(--sim-bg-surface) 70%, transparent); border: calc(2px * var(--look-rim)) dashed var(--sim-stroke); }
.tl-tray:empty::after { content: attr(data-empty); align-self: center; font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }
.tl--place .tl-stage, .tl--order .tl-stage { min-height: 0; flex: none; }
.tl--order .tl-stage { display: none; }
.tl-mark { position: absolute; top: -12px; right: -12px; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
  font-weight: 900; font-size: 16px; color: var(--sim-ink-on-good, var(--sim-bg-deep)); animation: tl-pop 0.35s var(--look-spring) both; }
.tl-mark--ok { background: var(--sim-good); } .tl-mark--no { background: var(--sim-bad); }
.tl-card--no { animation: sim-pick-no 0.4s ease; }
.tl--compact .tl-sub { display: none; }
.tl--compact .tl-card { max-width: 132px; padding: 6px 10px 8px; }
.tl--compact .tl-label { font-size: var(--sim-text-sm); }
@keyframes tl-pop { from { transform: scale(0.4); opacity: 0; } to { transform: none; opacity: 1; } }
.sim-dom-root--portrait .tl-axis { left: 96px; right: auto; top: 12px; bottom: 12px; width: 18px; height: auto; margin: 0; }
.sim-dom-root--portrait .tl-era { left: -5px; right: -5px; top: auto; bottom: auto; }
.sim-dom-root--portrait .tl-tick { left: auto; right: calc(100% + 8px); top: auto; transform: translateY(-50%); }
.sim-dom-root--portrait .tl-tick::before { display: none; }
.sim-dom-root--portrait .tl-dot { left: 50% !important; margin: -9px 0 0 -9px; }
.sim-dom-root--portrait .tl-card { max-width: 200px; }
.sim-dom-root--portrait .tl-span { top: auto; left: auto; right: calc(100% + 76px); border: calc(3px * var(--look-rim)) solid var(--sim-accent); border-right: 0; border-radius: calc(10px * var(--look-radius)) 0 0 calc(10px * var(--look-radius)); width: 10px; height: auto; }
.sim-dom-root--portrait .tl-span__chip { left: auto; right: 100%; top: 50%; transform: translate(-4px, -50%) rotate(-90deg); transform-origin: right center; }
  .sim-dom-root--portrait .tl-bins { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.sim-dom-root--portrait .tl--place .tl-stage { display: none; }
`;

// -- Config ---------------------------------------------------------------------------

const toneN = (n) => ((Math.max(1, n | 0) - 1) % 8) + 1;
const TONE = (n) => `var(--sim-series-${toneN(n)})`;
const TONE_STYLE = (n) => `--tone:${TONE(n)};--tl-ink:var(--sim-ink-on-${toneN(n)}, var(--sim-bg-deep))`;

function niceStep(span, want = 7) {
  const raw = span / want, k = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * k).find((s) => span / s <= want + 1) ?? 10 * k;
}

function validate(cfg) {
  const bad = (m) => { throw new Error(`timeline: ${m}`); };
  if (!(Number.isFinite(cfg.from) && Number.isFinite(cfg.to) && cfg.from < cfg.to)) bad('from must be a year before to');
  const ids = new Set();
  for (const e of cfg.events ?? []) {
    if (!e.id) bad('every event needs an id');
    if (ids.has(e.id)) bad(`duplicate event id "${e.id}"`);
    ids.add(e.id);
    if (!(e.at >= cfg.from && e.at <= cfg.to)) bad(`event "${e.id}" at ${e.at} is outside ${cfg.from}..${cfg.to}`);
  }
  let prev = -Infinity;
  for (const r of cfg.eras ?? []) {
    if (!(r.from < r.to)) bad(`era "${tx(r.label)}" ends before it starts`);
    if (r.from < prev) bad('eras must be sorted and must not overlap');
    if (r.from < cfg.from || r.to > cfg.to) bad(`era "${tx(r.label)}" is outside the axis`);
    prev = r.to;
  }
  if (!['read', 'place', 'order'].includes(cfg.mode ?? 'read')) bad(`mode "${cfg.mode}" is not read | place | order`);
  if (cfg.scale === 'log' && cfg.from >= cfg.to) bad('log scale needs from < to');
}

function scaleOf(cfg) {
  if (cfg.scale === 'log') {
    const span = cfg.to - cfg.from;
    return (t) => 1 - Math.log10(1 + (cfg.to - t)) / Math.log10(1 + span);
  }
  return (t) => (t - cfg.from) / (cfg.to - cfg.from);
}

function ticksOf(cfg) {
  if (cfg.ticks) return cfg.ticks;
  if (cfg.scale === 'log') {
    const out = [cfg.to];
    for (let k = 1; 10 ** k <= cfg.to - cfg.from; k++) out.unshift(cfg.to - 10 ** k);
    return out;
  }
  const st = niceStep(cfg.to - cfg.from);
  const out = [];
  for (let t = Math.ceil(cfg.from / st) * st; t <= cfg.to + 1e-9; t += st) out.push(Math.round(t));
  return out;
}

const tickText = (cfg, t) => {
  if (cfg.scale === 'log') { const ago = cfg.to - t; return ago === 0 ? 'now' : ago >= 1e6 ? `${ago / 1e6} mya` : `${fmtYear(-ago).replace(' BCE', '')} ago`; }
  return t === 0 ? 'BCE | CE' : fmtYear(t);
};

function cardHtml(e, draggable) {
  const when = e.when ? tx(e.when) : fmtYear(e.at);
  return `<div class="tl-card" data-ev="${esc(e.id)}"${draggable ? ` data-item="${esc(e.id)}"` : ''} style="${TONE_STYLE(e.tone ?? 1)}">`
    + `${draggable ? '' : `<span class="tl-when">${esc(when)}</span>`}<span class="tl-label">${esc(tx(e.label))}</span>`
    + (e.sub ? `<span class="tl-sub">${esc(tx(e.sub))}</span>` : '') + '</div>';
}

// -- Mount ------------------------------------------------------------------------------

/** Build a timeline inside host; returns the controller (see the header). @opts onChange, announce, onLayout */
export function mountTimeline(host, cfg, o = {}) {
  validate(cfg);
  const pos = scaleOf(cfg);
  const events = [...(cfg.events ?? [])].sort((a, b) => a.at - b.at);
  const modeAt = (step) => cfg.modes?.[step] ?? cfg.mode ?? 'read';
  const tol = cfg.tolerance ?? 0;
  const slots = cfg.slots ?? (() => {
    const t = ticksOf(cfg), out = [];
    for (let i = 0; i + 1 < t.length; i++) out.push({ from: t[i], to: t[i + 1], label: `${tickText(cfg, t[i])} - ${tickText(cfg, t[i + 1])}` });
    return out;
  })();
  const state = { step: 0, mode: modeAt(0), placed: {}, marks: null, compact: false };
  let pick = null;

  const draw = () => {
    const mode = state.mode;
    const shown = events.filter((e) => (e.revealAt ?? 0) <= state.step);
    const eras = (cfg.eras ?? []).map((r) => {
      const a = pos(r.from), b = pos(r.to);
      return `<div class="tl-era" data-a="${a}" data-b="${b}" style="${TONE_STYLE(r.tone ?? 1)}"><span class="tl-era__label">${esc(tx(r.label))}</span></div>`;
    }).join('');
    const legend = (cfg.eras ?? []).length ? `<div class="tl-legend">${cfg.eras.map((r) => `<span class="tl-legend__era" style="${TONE_STYLE(r.tone ?? 1)}">${esc(tx(r.label))}</span>`).join('')}</div>` : '';
    const ticks = ticksOf(cfg).map((t) => `<span class="tl-tick${t === 0 ? ' tl-zero' : ''}" data-p="${pos(t)}">${esc(tickText(cfg, t))}</span>`).join('');
    const spans = (cfg.spans ?? []).filter((s) => (s.revealAt ?? 0) <= state.step).map((s) =>
      `<div class="tl-span" data-a="${pos(s.from)}" data-b="${pos(s.to)}"><span class="tl-span__chip">${esc(s.label ? tx(s.label) : fmtSpan(s.from, s.to))}</span></div>`).join('');
    let body = '', tray = '', bins = '';
    if (mode === 'read') {
      body = shown.map((e) => `<span class="tl-dot" data-p="${pos(e.at)}" style="${TONE_STYLE(e.tone ?? 1)}"></span>${cardHtml(e, false)}`).join('');
    } else {
      // Equal-width bins under the axis: slots (place) or numbered positions (order).
      const heads = mode === 'place'
        ? slots.map((sl, i) => ({ id: `s${i}`, label: sl.label, tone: sl.tone ?? (cfg.eras ?? []).find((r) => r.from === sl.from && r.to === sl.to)?.tone }))
        : shown.map((_, i) => ({ id: `n${i}`, label: `${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'}` }));
      bins = `<div class="tl-bins" style="--n:${heads.length}">` + heads.map((h) => `<div class="tl-bin" data-bin="${h.id}" aria-label="${esc(h.label)}" style="${TONE_STYLE(h.tone ?? 0)}${h.tone ? '' : ';--tone:var(--sim-stroke);--tl-ink:var(--sim-label)'}">`
        + `<span class="tl-bin__head">${esc(h.label)}</span>`
        + shown.filter((e) => state.placed[e.id] === h.id).map((e) => cardHtml(e, true)).join('') + '</div>').join('') + '</div>';
      tray = shown.filter((e) => !state.placed[e.id]).map((e) => cardHtml(e, true)).join('');
    }
    const v = state.marks ? state.marks.filter((m) => m.ok).length : 0;
    host.innerHTML = `<div class="tl tl--${mode}${state.compact ? ' tl--compact' : ''}">`
      + ((cfg.title || state.marks) ? `<div class="tl-head">${cfg.title ? `<h3 class="tl-title">${esc(tx(cfg.title))}</h3>` : ''}`
        + (state.marks ? `<span class="tl-verdict${v < state.marks.length ? ' tl-verdict--miss' : ''}">${v} / ${state.marks.length} right</span>` : '') + '</div>' : '')
      + legend + `<div class="tl-stage"><svg class="tl-svg" aria-hidden="true"></svg><div class="tl-axis">${eras}${ticks}${spans}${body}</div></div>`
      + (mode === 'read' ? '' : `${bins}<div class="tl-tray" data-bin="tray" data-empty="all placed" aria-label="cards to place">${tray}</div>`)
      + '</div>';
    if (state.marks) {
      for (const m of state.marks) {
        const el = host.querySelector(`.tl-card[data-ev="${globalThis.CSS?.escape ? CSS.escape(m.id) : m.id}"]`);
        if (!el) continue;
        el.insertAdjacentHTML('beforeend', `<span class="tl-mark tl-mark--${m.ok ? 'ok' : 'no'}" aria-label="${m.ok ? 'right' : 'wrong'}">${m.ok ? '\u2713' : '\u2715'}</span>`);
        if (!m.ok) el.classList.add('tl-card--no');
      }
    }
    layout();
  };

  // Place everything measured: eras, ticks and dots by position, cards in lanes
  // sized from their real heights, the whole block centred, stems in SVG.
  const layout = () => {
    const portrait = !!host.closest?.('.sim-dom-root--portrait');
    const stage = host.querySelector('.tl-stage'), axis = host.querySelector('.tl-axis'), svg = host.querySelector('.tl-svg');
    if (!stage || !axis) return;
    applyToneInks(host);
    const cards = [...axis.querySelectorAll(':scope > .tl-card')];
    const GAP = 12;
    if (portrait) {
      stage.style.height = `${Math.max(380, cards.reduce((s, c) => s + c.offsetHeight + GAP, 40))}px`;
      axis.style.top = '';
    } else stage.style.height = '';
    const L = portrait ? axis.offsetHeight : axis.offsetWidth;
    const along = (el, a, b) => {
      if (portrait) { el.style.top = `${a * L}px`; if (b != null) el.style.height = `${(b - a) * L}px`; el.style.left = el.style.width = ''; }
      else { el.style.left = `${a * L}px`; if (b != null) el.style.width = `${(b - a) * L}px`; }
    };
    for (const el of axis.querySelectorAll('.tl-era, .tl-span, .tl-slot')) along(el, +el.dataset.a, +el.dataset.b);
    for (const el of axis.querySelectorAll('.tl-tick, .tl-dot')) along(el, +el.dataset.p);
    // Era labels inside their band when they fit; otherwise above it, in rows that never overlap.
    const outRows = [];
    for (const era of axis.querySelectorAll('.tl-era')) {
      const lab = era.querySelector('.tl-era__label');
      era.classList.remove('tl-era--out');
      lab.style.bottom = '';
      if (portrait || state.mode !== 'read') continue;
      if (lab.offsetWidth + 14 <= era.offsetWidth) continue;
      era.classList.add('tl-era--out');
      const x0 = era.offsetLeft + era.offsetWidth / 2 - lab.offsetWidth / 2, x1 = x0 + lab.offsetWidth;
      let row = 0;
      while ((outRows[row] ?? []).some(([a, b]) => x0 < b + 8 && a < x1 + 8)) row++;
      (outRows[row] ??= []).push([x0, x1]);
      lab.style.bottom = `calc(100% + ${6 + row * 22}px)`;
    }
    if (!portrait) {
      // Tick labels stay inside the axis ends.
      for (const t of axis.querySelectorAll('.tl-tick')) {
        const w = t.offsetWidth, x = +t.dataset.p * L;
        t.style.left = `${Math.max(w / 2 - 14, Math.min(L + 14 - w / 2, x))}px`;
      }
    }
    svg.replaceChildren();
    const place = [];
    if (portrait) {
      // Stack cards down the axis; if they run past its end, stretch the axis and retry.
      let len = L;
      for (let pass = 0; pass < 4; pass++) {
        place.length = 0;
        let prevBottom = -Infinity;
        for (const card of cards) {
          const e = events.find((x) => x.id === card.dataset.ev);
          const p = pos(e.at) * len, h = card.offsetHeight;
          const top = Math.max(p - h / 2, prevBottom + GAP, -axis.offsetTop + 4);
          prevBottom = top + h;
          place.push({ card, e, x: 40, y: top, sx: 9, sy: p, ex: 40, ey: top + h / 2 });
        }
        if (prevBottom <= len + 8) break;
        len += prevBottom - len + 24;
        stage.style.height = `${len + 24}px`;
        for (const el of axis.querySelectorAll('.tl-era, .tl-span, .tl-slot')) { el.style.top = `${+el.dataset.a * len}px`; el.style.height = `${(+el.dataset.b - +el.dataset.a) * len}px`; }
        for (const el of axis.querySelectorAll('.tl-tick, .tl-dot')) el.style.top = `${+el.dataset.p * len}px`;
      }
    } else {
      // Lanes by x (widths), then lane heights from the tallest card in each. The span
      // bracket below the axis is an obstacle in the first lane under it.
      const lanes = [];
      const spanEl = axis.querySelector('.tl-span');
      const chip = spanEl?.querySelector('.tl-span__chip');
      if (spanEl) {
        const cx = spanEl.offsetLeft + spanEl.offsetWidth / 2, cw = (chip?.offsetWidth ?? 80) / 2 + 10;
        lanes.push({ side: 1, depth: 0, iv: [[cx - cw, cx + cw], [spanEl.offsetLeft - 4, spanEl.offsetLeft + 10], [spanEl.offsetLeft + spanEl.offsetWidth - 10, spanEl.offsetLeft + spanEl.offsetWidth + 4]], h: 42 });
      }
      const free = (l, x0, x1) => l.iv.every(([a, b]) => x1 + GAP <= a || b + GAP <= x0);
      for (const card of cards) {
        const e = events.find((x) => x.id === card.dataset.ev);
        const p = pos(e.at) * L, w = card.offsetWidth;
        const x = Math.max(-14, Math.min(L + 14 - w, p - w / 2));
        let lane = null;
        for (let depth = 0; depth < 6 && !lane; depth++) for (const side of [-1, 1]) {
          if (lane) break;
          let l = lanes.find((q) => q.side === side && q.depth === depth);
          if (!l) { l = { side, depth, iv: [], h: 0 }; lanes.push(l); }
          if (free(l, x, x + w)) lane = l;
        }
        lane.iv.push([x, x + w]);
        lane.h = Math.max(lane.h, card.offsetHeight);
        place.push({ card, e, x, p, w, h: card.offsetHeight, lane });
      }
      for (let i = lanes.length - 1; i >= 0; i--) if (!lanes[i].iv.length) lanes.splice(i, 1);
      const base = { [-1]: 26 + outRows.length * 22, [1]: 38 };
      const offOf = (side, depth) => base[side] + lanes.filter((q) => q.side === side && q.depth < depth).reduce((s, q) => s + q.h + GAP, 0);
      const ext = (side) => Math.max(base[side] - 8, ...lanes.filter((q) => q.side === side).map((q) => offOf(side, q.depth) + q.h));
      const above = ext(-1), below = ext(1), need = above + below + 18 + 16;
      // Fill the scroll region's height (host), less the title and the tray.
      const tray = host.querySelector('.tl-tray');
      const avail = host.clientHeight - stage.offsetTop - (tray ? tray.offsetHeight + 8 : 0) - 4;
      if (state.mode === 'read' && need > avail && !state.compact && avail > 100) { state.compact = true; draw(); return; }
      const H = state.mode === 'read' ? Math.max(need, avail) : need;
      stage.style.height = `${Math.max(need, H)}px`;
      axis.style.top = `${8 + above + (Math.max(need, H) - need) / 2}px`;
      axis.style.marginTop = '0';
      for (const q of place) {
        const off = offOf(q.lane.side, q.lane.depth);
        const y = q.lane.side < 0 ? 9 - off - q.h : 9 + off;
        Object.assign(q, { y, sx: q.p, sy: 9, ex: Math.max(q.x + 14, Math.min(q.x + q.w - 14, q.p)), ey: q.lane.side < 0 ? y + q.h : y });
      }
    }
    const ox = axis.offsetLeft, oy = axis.offsetTop;
    for (const q of place) {
      q.card.style.left = `${q.x}px`;
      q.card.style.top = `${q.y}px`;
      const path = document.createElementNS(SVGNS, 'path');
      const mx = portrait ? (q.sx + q.ex) / 2 : q.sx, my = portrait ? q.sy : (q.sy + q.ey) / 2;
      path.setAttribute('d', `M${q.sx + ox},${q.sy + oy} Q${mx + ox},${my + oy} ${q.ex + ox},${q.ey + oy}`);
      path.setAttribute('class', 'tl-stem');
      path.style.setProperty('--tone', TONE(q.e.tone ?? 1));
      svg.appendChild(path);
    }
    o.onLayout?.();
  };

  const onDrop = (id, bin) => {
    if (bin === 'tray') delete state.placed[id];
    else {
      if (state.mode === 'order') {
        const other = Object.keys(state.placed).find((k) => state.placed[k] === bin);
        if (other) { if (state.placed[id]) state.placed[other] = state.placed[id]; else delete state.placed[other]; }
      }
      state.placed[id] = bin;
    }
    state.marks = null;
    draw();
    o.onChange?.(api);
  };

  const api = {
    get mode() { return state.mode; },
    get placedCount() { return Object.keys(state.placed).length; },
    get total() { return events.filter((e) => (e.revealAt ?? 0) <= state.step).length; },
    setStep(step) {
      const mode = modeAt(step);
      if (mode !== state.mode) { state.placed = {}; state.marks = null; }
      state.compact = false;
      state.step = step;
      state.mode = mode;
      draw();
    },
    /** Mark every placed card; returns [{ id, ok }] (unplaced cards count as wrong). */
    check() {
      const shown = events.filter((e) => (e.revealAt ?? 0) <= state.step);
      if (state.mode === 'place') {
        state.marks = shown.map((e) => {
          const s = slots[+String(state.placed[e.id] ?? '').slice(1)];
          return { id: e.id, ok: !!s && state.placed[e.id] != null && e.at >= s.from - tol && e.at <= s.to + tol };
        });
      } else if (state.mode === 'order') {
        state.marks = shown.map((e, i) => ({ id: e.id, ok: state.placed[e.id] === `n${i}` }));
      } else return [];
      draw();
      const ok = state.marks.every((m) => m.ok);
      if (ok) burst(host.querySelector('.tl-stage'));
      o.announce?.(`${state.marks.filter((m) => m.ok).length} of ${state.marks.length} right.`);
      return state.marks;
    },
    reset() { state.placed = {}; state.marks = null; draw(); },
    layout,
    destroy() { pick?.destroy(); host.innerHTML = ''; },
  };
  pick = simPick(host, { items: '[data-item]', targets: '[data-bin]', onDrop, announce: o.announce });
  draw();
  return api;
}

// -- Config base ------------------------------------------------------------------------

/**
 * A scene that is only a timeline: static CONFIG (cfg above), BEAT_STEP_MAP,
 * ARIA_LABEL. Place/order steps get Check and Again buttons in the host bar.
 */
export class TimelineScene extends DomSimulation {
  static WIDTH = 680;
  static HEIGHT = 520;
  static PORTRAIT_WIDTH = 380;
  static PORTRAIT_HEIGHT = 1000;
  static LAYOUT = 'frame';
  static CONFIG = null;
  static CONTROLS = [
    { type: 'button', id: 'check', label: 'Check' },
    { type: 'button', id: 'again', label: 'Again' },
  ];

  async setup() {
    await super.setup();
    this.render({ css: SIM_LOOK_DOM_CSS + TIMELINE_CSS, rootClass: 'sl-backdrop' });
    const host = mountEl(this.root, 'sim-scroll tl-host');
    const cfg = this.constructor.CONFIG;
    if (!cfg) throw new Error('TimelineScene: set static CONFIG');
    this.tl = mountTimeline(host, cfg, {
      onChange: () => this.requestUiUpdate?.(),
      onLayout: () => this.relayout(),
    });
    this._ro = new ResizeObserver(() => this.tl?.layout());
    this._ro.observe(this.root);
  }

  onBeatChange(beat) {
    const map = normalizeBeatMap(this.constructor.BEAT_STEP_MAP ?? [[{ idx: 0 }]], this.constructor.name);
    const b = Math.max(0, Math.min(map.length - 1, Math.trunc(Number.isFinite(beat) ? beat : 0)));
    this.stepIndex = map[b][0].idx;
    this.root.dataset.step = String(this.stepIndex);
    this.tl.setStep(this.stepIndex);
    this.requestUiUpdate?.();
  }

  refreshTheme() { this.tl?.layout(); }

  isControlHidden() { return !this.tl || this.tl.mode === 'read'; }
  isControlDisabled(id) { return id === 'check' && this.tl?.placedCount === 0; }
  onControlChange(id) {
    if (this.isControlHidden(id)) return;
    if (id === 'check') this.tl.check();
    if (id === 'again') this.tl.reset();
    this.requestUiUpdate?.();
  }

  destroy() {
    this._ro?.disconnect();
    this.tl?.destroy();
    super.destroy();
  }
}
