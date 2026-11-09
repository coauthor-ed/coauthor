/**
 * AllocBoardScene - "allocate under a rule" boards: form a coalition past a
 * majority, fill booths to capacity, split a budget at a fixed total. The
 * learner drags item cards (each with a value) into bins; each bin shows its
 * live total against its rule; Check marks every bin. A concrete scene is a
 * thin subclass: static CONFIG + BEAT_STEP_MAP + ARIA_LABEL. As a mini-game,
 * wrap it: `class G extends withChallenge(AllocBoardScene)` - checkObjective()
 * is already here.
 *
 * CONFIG: { title, goal?, unit?: 'seats', format?: 'int' | 'inr' | 'inr-words',
 *   items: [{ id, label, value, tone? 1..8, icon?, sub? }],
 *   bins: [{ id, label, rule: { atLeast | atMost | exactly | between: [a, b] }, tone? }],
 *   total?: number (the whole: 543 seats, a budget), show?: 'bar' | 'hemicycle',
 *   start?: { itemId: binId } }
 * Validates at setup (rules attainable with the items given) and throws plain messages.
 */
import { DomSimulation } from 'simulations/base/DomSimulation.js';
import { esc } from 'simulations/base/SimUi.js';
import { SIM_LOOK_DOM_CSS, burst, applyToneInks } from './SimLookDom.js';
import { simPick } from './SimPick.js';
import { iconSvg } from './SimIcons.js';
import { fmtNum, fmtINR, tx } from './SimText.js';
import { hemicycleSvg } from './SimChart.js';
import { mountEl } from './SimSvg.js';
import { normalizeBeatMap } from './beatMap.js';

const toneN = (n) => ((Math.max(1, n | 0) - 1) % 8) + 1;
const TONE = (n) => `--tone:var(--sim-series-${toneN(n)});--ab-ink:var(--sim-ink-on-${toneN(n)}, var(--sim-bg-deep))`;

export const ALLOC_CSS = `
.ab-host { display: flex; flex-direction: column; gap: var(--sim-space-3); }
.ab-host > .ab-head { margin-top: auto; } .ab-host > .ab-tray { margin-bottom: auto; }   /* centred when there is room, never cut when it scrolls */
.ab-head { display: flex; align-items: center; gap: var(--sim-space-2); flex-wrap: wrap; }
.ab-title { margin: 0; font: 800 var(--sim-text-xl)/1.2 var(--sim-font-display, var(--sim-font)); }
.ab-goal { padding: 3px 12px; border-radius: var(--look-pill); background: var(--sim-accent); color: var(--sim-ink-on-accent, var(--sim-bg-deep)); font-weight: 800; font-size: var(--sim-text-sm); }
.ab-top { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--sim-space-3); align-items: stretch; }
.ab-bins { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: var(--sim-space-2); }
.ab-bin { position: relative; min-height: 150px; padding: 8px; display: flex; flex-direction: column; gap: 6px; border-radius: var(--sim-radius-lg);
  background: color-mix(in oklab, var(--sim-bg-surface) 80%, transparent); border: calc(3px * var(--look-rim)) dashed color-mix(in oklab, var(--tone) 60%, var(--sim-stroke)); transition: border-color 0.2s, box-shadow 0.2s; }
.ab-bin--ok { border-style: solid; border-color: var(--sim-good); box-shadow: 0 calc(4px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-good) 55%, var(--sim-bg-deep)); }
.ab-bin--no { border-style: solid; border-color: var(--sim-bad); animation: sim-pick-no 0.4s ease; }
.ab-binhead { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.ab-binname { font-weight: 800; font-size: var(--sim-text-md); }
.ab-rule { padding: 1px 9px; border-radius: var(--look-pill); font-weight: 800; font-size: var(--sim-text-sm); background: var(--tone); color: var(--ab-ink); white-space: nowrap; }
.ab-meter { position: relative; height: 16px; border-radius: var(--look-pill); background: var(--sim-track); overflow: visible; }
.ab-fill { position: absolute; left: 0; top: 0; bottom: 0; width: calc(min(var(--v), 1) * 100%); border-radius: var(--look-pill); background: var(--tone);
  box-shadow: inset 0 calc(-4px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 70%, black), inset 0 calc(3px * var(--look-gloss)) 0 color-mix(in oklab, var(--tone) 55%, white); transition: width 0.5s var(--look-spring-soft); }
.ab-fill--over { background: var(--sim-bad); }
.ab-mark { position: absolute; top: -5px; bottom: -5px; width: 4px; margin-left: -2px; border-radius: 2px; background: var(--sim-label); left: calc(var(--m) * 100%); }
.ab-sum { font: 800 var(--sim-text-xl)/1 var(--sim-font-display, var(--sim-font)); text-align: right; }
.ab-sum small { font-size: var(--sim-text-sm); color: var(--sim-label-muted); font-weight: 700; }
.ab-items { display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start; }
.ab-item { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px 5px 6px; border-radius: var(--sim-radius-md); background: var(--sim-bg-surface);
  border: calc(2px * var(--look-rim)) solid color-mix(in oklab, var(--tone) 70%, var(--sim-stroke)); box-shadow: 0 calc(3px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 55%, var(--sim-bg-deep)); }
.ab-item .sim-icon { width: 28px; height: 28px; }
.ab-item__label { font-weight: 800; font-size: var(--sim-text-md); line-height: 1.1; }
.ab-item__val { padding: 1px 8px; border-radius: var(--look-pill); background: var(--tone); color: var(--ab-ink); font-weight: 800; font-size: var(--sim-text-sm); }
.ab-tray { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--sim-space-2); min-height: 60px; padding: var(--sim-space-2);
  border-radius: var(--sim-radius-md); border: calc(2px * var(--look-rim)) dashed var(--sim-stroke); background: color-mix(in oklab, var(--sim-bg-surface) 55%, transparent); }
.ab-tray:empty::after { content: attr(data-empty); align-self: center; font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }
.ab-viz { width: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: var(--sim-radius-lg); background: color-mix(in oklab, var(--sim-bg-surface) 70%, transparent); }
.ab-viz { position: relative; }
.ab-viz svg { width: 220px; height: 130px; }
.ab-vizn { position: absolute; left: 0; right: 0; bottom: 14px; text-align: center; font: 800 var(--sim-text-xl)/1 var(--sim-font-display, var(--sim-font)); }
.ab-vizn small { display: block; margin-top: 6px; font-size: var(--sim-text-sm); font-weight: 700; color: var(--sim-label-muted); }
.ab-verdict { align-self: center; padding: 4px 16px; border-radius: var(--look-pill); font-weight: 800; font-size: var(--sim-text-md); background: var(--sim-good); color: var(--sim-ink-on-good, var(--sim-bg-deep));
  box-shadow: 0 calc(3px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-good) 55%, black); animation: sl-pop 0.4s var(--look-spring) both; }
.ab-verdict--miss { background: var(--sim-warning); color: var(--sim-ink-on-warning, var(--sim-bg-deep)); }
.sim-dom-root--portrait .ab-top { grid-template-columns: minmax(0, 1fr); }
.sim-dom-root--portrait .ab-viz { width: 100%; }
.sim-dom-root--portrait .ab-bins { grid-template-columns: minmax(0, 1fr); }
`;

const ruleOk = (r, v) => (r.atLeast != null ? v >= r.atLeast : true) && (r.atMost != null ? v <= r.atMost : true)
  && (r.exactly != null ? v === r.exactly : true) && (r.between ? v >= r.between[0] && v <= r.between[1] : true);
const ruleMark = (r) => r.atLeast ?? r.exactly ?? r.between?.[0] ?? r.atMost ?? null;
const ruleMax = (r) => r.atMost ?? r.exactly ?? r.between?.[1] ?? r.atLeast ?? 1;

export class AllocBoardScene extends DomSimulation {
  static WIDTH = 680;
  static HEIGHT = 520;
  static PORTRAIT_WIDTH = 380;
  static PORTRAIT_HEIGHT = 900;
  static LAYOUT = 'frame';
  static CONFIG = null;
  static CONTROLS = [
    { type: 'button', id: 'check', label: 'Check' },
    { type: 'button', id: 'again', label: 'Again' },
  ];

  async setup() {
    await super.setup();
    const cfg = this.constructor.CONFIG;
    AllocBoardScene.validate(cfg);
    this.cfg = cfg;
    this.placed = { ...(cfg.start ?? {}) };
    this.marks = null;
    this.render({ css: SIM_LOOK_DOM_CSS + ALLOC_CSS, rootClass: 'sl-backdrop' });
    this.host = mountEl(this.root, 'sim-scroll ab-host');
    this.pick = simPick(this.host, { items: '[data-item]', targets: '[data-bin]', onDrop: (id, bin) => this.place(id, bin) });
    this.draw();
  }

  static validate(cfg) {
    const bad = (m) => { throw new Error(`AllocBoardScene: ${m}`); };
    if (!cfg) bad('set static CONFIG');
    if (!cfg.items?.length) bad('CONFIG.items is empty');
    if (!cfg.bins?.length) bad('CONFIG.bins is empty');
    const ids = new Set();
    for (const it of cfg.items) { if (ids.has(it.id)) bad(`duplicate item "${it.id}"`); ids.add(it.id); if (!Number.isFinite(it.value)) bad(`item "${it.id}" needs a number value`); }
    const all = cfg.items.reduce((s, it) => s + it.value, 0);
    for (const b of cfg.bins) {
      if (!b.rule) bad(`bin "${b.id}" needs a rule`);
      const need = b.rule.atLeast ?? b.rule.exactly ?? b.rule.between?.[0];
      if (need != null && need > all) bad(`bin "${b.id}" needs ${need} but all the items add to ${all}`);
    }
  }

  fmt(v) {
    const f = this.cfg.format;
    return f === 'inr' ? fmtINR(v) : f === 'inr-words' ? fmtINR(v, { words: true }) : fmtNum(v, { indian: true });
  }
  sumOf(bin) { return this.cfg.items.filter((it) => this.placed[it.id] === bin).reduce((s, it) => s + it.value, 0); }

  place(id, bin) {
    if (bin === 'tray') delete this.placed[id]; else this.placed[id] = bin;
    this.marks = null;
    this.draw();
    this.requestUiUpdate?.();
  }

  itemHtml(it) {
    return `<span class="ab-item" data-item="${esc(it.id)}" style="${TONE(it.tone ?? 1)}" aria-label="${esc(tx(it.label))}, ${esc(this.fmt(it.value))}">`
      + (it.icon ? iconSvg(it.icon, toneN(it.tone ?? 1)) : '')
      + `<span class="ab-item__label">${esc(tx(it.label))}</span><span class="ab-item__val">${esc(this.fmt(it.value))}</span></span>`;
  }

  ruleText(r) {
    const u = this.cfg.unit ? ` ${this.cfg.unit}` : '';
    if (r.atLeast != null) return `${this.fmt(r.atLeast)}+${u}`;
    if (r.atMost != null) return `max ${this.fmt(r.atMost)}${u}`;
    if (r.exactly != null) return `exactly ${this.fmt(r.exactly)}`;
    return `${this.fmt(r.between[0])}-${this.fmt(r.between[1])}${u}`;
  }

  draw() {
    const cfg = this.cfg;
    const keep = this.host.scrollTop;
    const bins = cfg.bins.map((b, i) => {
      const v = this.sumOf(b.id), max = ruleMax(b.rule) * (b.rule.atLeast != null ? 1.25 : 1);
      const over = b.rule.atMost != null && v > b.rule.atMost;
      const m = this.marks?.find((q) => q.id === b.id);
      return `<div class="ab-bin${m ? (m.ok ? ' ab-bin--ok' : ' ab-bin--no') : ''}" data-bin="${esc(b.id)}" aria-label="${esc(tx(b.label))}" style="${TONE(b.tone ?? i + 1)}">`
        + `<div class="ab-binhead"><span class="ab-binname">${esc(tx(b.label))}</span><span class="ab-rule">${esc(this.ruleText(b.rule))}</span></div>`
        + `<div class="ab-sum">${esc(this.fmt(v))}${cfg.unit ? ` <small>${esc(cfg.unit)}</small>` : ''}</div>`
        + `<div class="ab-meter"><span class="ab-fill${over ? ' ab-fill--over' : ''}" style="--v:${Math.max(0, v / max)}"></span>`
        + (ruleMark(b.rule) != null ? `<span class="ab-mark" style="--m:${Math.min(1, ruleMark(b.rule) / max)}"></span>` : '') + '</div>'
        + `<div class="ab-items">${cfg.items.filter((it) => this.placed[it.id] === b.id).map((it) => this.itemHtml(it)).join('')}</div></div>`;
    }).join('');
    const ok = this.marks?.every((q) => q.ok);
    let viz = '';
    if (cfg.show === 'hemicycle') {
      const bin = cfg.bins[0], v = this.sumOf(bin.id), met = ruleOk(bin.rule, v);
      const hc = hemicycleSvg({ x: 6, y: 4, w: 208, h: 120 }, { seats: cfg.total ?? v, groups: [{ n: v, tone: met ? 'good' : 1 }], label: false });
      viz = `<div class="ab-viz"><svg viewBox="0 0 220 130" aria-hidden="true">${hc.svg}</svg><span class="ab-vizn">${esc(this.fmt(cfg.total ?? 0))}${cfg.unit ? ` <small>${esc(cfg.unit)}</small>` : ''}</span></div>`;
    }
    this.host.innerHTML = `<div class="ab-head"><h3 class="ab-title">${esc(tx(cfg.title ?? ''))}</h3>${cfg.goal ? `<span class="ab-goal">${esc(tx(cfg.goal))}</span>` : ''}</div>`
      + `<div class="ab-top"><div class="ab-bins" style="--n:${cfg.bins.length}">${bins}</div>${viz}</div>`
      + (this.marks ? `<span class="ab-verdict${ok ? '' : ' ab-verdict--miss'}">${ok ? 'All rules met!' : `${this.marks.filter((q) => q.ok).length} of ${this.marks.length} rules met`}</span>` : '')
      + `<div class="ab-tray" data-bin="tray" data-empty="everything is placed" aria-label="to place">${cfg.items.filter((it) => !this.placed[it.id]).map((it) => this.itemHtml(it)).join('')}</div>`;
    this.host.scrollTop = keep;
    applyToneInks(this.host);
    this.relayout();
  }

  refreshTheme() { if (this.host) applyToneInks(this.host); }

  onBeatChange(beat) {
    const map = normalizeBeatMap(this.constructor.BEAT_STEP_MAP ?? [[{ idx: 0 }]], this.constructor.name);
    const b = Math.max(0, Math.min(map.length - 1, Math.trunc(Number.isFinite(beat) ? beat : 0)));
    this.stepIndex = map[b][0].idx;
    this.root.dataset.step = String(this.stepIndex);
    this.requestUiUpdate?.();
  }

  /** mini-game contract (withChallenge): every bin meets its rule. */
  checkObjective() {
    if (!Object.keys(this.placed).length) return null;
    return { ok: this.cfg.bins.every((b) => ruleOk(b.rule, this.sumOf(b.id))) };
  }

  isControlDisabled(id) { return id === 'check' && !Object.keys(this.placed ?? {}).length; }
  onControlChange(id) {
    if (id === 'again') { this.placed = { ...(this.cfg.start ?? {}) }; this.marks = null; this.draw(); }
    if (id === 'check') {
      this.marks = this.cfg.bins.map((b) => ({ id: b.id, ok: ruleOk(b.rule, this.sumOf(b.id)) }));
      this.draw();
      if (this.marks.every((q) => q.ok)) burst(this.host);
      this.evaluate?.();
    }
    this.requestUiUpdate?.();
  }

  destroy() {
    this.pick?.destroy();
    super.destroy();
  }
}
