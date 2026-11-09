/**
 * FlowBoard - cause-and-effect chains, cycles, trees, pyramids and layers as
 * a DOM board: cards (icon, label, sub) joined by SVG arrows measured from
 * the real card boxes (resize-safe). Beyond reading, the learner can put the
 * cards in order (SimPick) or predict the next card before it is shown.
 * A pure reveal with nothing to operate is a photoDiagram, not a FlowBoard.
 *
 *   class MyScene extends FlowScene { static CONFIG = { ... }; static BEAT_STEP_MAP = [...]; }
 *   const fb = mountFlow(hostEl, cfg, { onChange, announce, onLayout });
 *   fb.setStep(step); fb.check(); fb.reset(); fb.layout(); fb.destroy();
 *
 * cfg: { title?, layout: 'chain' | 'cycle' | 'tree' | 'pyramid' | 'layers',
 *   nodes: [{ id, label, sub?, icon? (SimIcons name), tone? 1..8, revealAt?, parent? (tree), level? (pyramid, layers) }],
 *   edges?: [{ from, to, label?, revealAt? }]   (chain/cycle default: node order; tree: parent links)
 *   levels?: [label per level] (pyramid, layers), mode: 'read' | 'order' | 'predict', modes?: [per step],
 *   decoys?: [label] (predict: wrong answers offered with the real next card) }
 * Order mode: the answer is the nodes' order. Predict mode: the first node
 * not yet revealed is hidden; the learner picks it from choices.
 */
import { DomSimulation } from 'simulations/base/DomSimulation.js';
import { esc } from 'simulations/base/SimUi.js';
import { SIM_LOOK_DOM_CSS, burst, applyToneInks } from './SimLookDom.js';
import { simPick } from './SimPick.js';
import { iconSvg } from './SimIcons.js';
import { tx } from './SimText.js';
import { rng, shuffle } from './shuffle.js';
import { mountEl } from './SimSvg.js';
import { lookOf } from './lookProfile.js';
import { normalizeBeatMap } from './beatMap.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const toneN = (n) => ((Math.max(1, n | 0) - 1) % 8) + 1;
const TONE = (n) => `--tone:var(--sim-series-${toneN(n)});--fb-ink:var(--sim-ink-on-${toneN(n)}, var(--sim-bg-deep))`;

export const FLOW_CSS = `
.fb-host { display: flex; flex-direction: column; }
.fb--chain .fb-row, .fb--order .fb-row { flex-wrap: nowrap; }
.fb { position: relative; display: flex; flex-direction: column; gap: var(--sim-space-3); flex: 1 1 auto; min-height: 0; }
.fb-head { display: flex; align-items: center; gap: var(--sim-space-2); flex-wrap: wrap; }
.fb-title { margin: 0; font: 800 var(--sim-text-xl)/1.2 var(--sim-font-display, var(--sim-font)); }
.fb-verdict { margin-left: auto; padding: 4px 14px; border-radius: var(--look-pill); font-weight: 800; font-size: var(--sim-text-md);
  background: var(--sim-good); color: var(--sim-ink-on-good, var(--sim-bg-deep)); box-shadow: 0 calc(3px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-good) 55%, black); animation: sl-pop 0.4s var(--look-spring) both; }
.fb-verdict--miss { background: var(--sim-warning); color: var(--sim-ink-on-warning, var(--sim-bg-deep)); }
.fb-stage { position: relative; flex: 1 1 auto; min-height: 240px; }
.fb-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.fb-edge { fill: none; stroke: var(--sim-label-muted); stroke-width: 4; stroke-linecap: round; }
.fb-edge--new { stroke-dasharray: 600; stroke-dashoffset: 600; animation: fb-draw 0.6s ease forwards; }
@keyframes fb-draw { to { stroke-dashoffset: 0; } }
.fb-head-mark { fill: var(--sim-label-muted); }
.fb-elabel { position: absolute; transform: translate(-50%, -50%); padding: 2px 10px; border-radius: var(--look-pill); white-space: nowrap;
  background: var(--sim-bg-surface); border: calc(2px * var(--look-rim)) solid var(--sim-stroke); font-weight: 800; font-size: var(--sim-text-sm); color: var(--sim-label); z-index: 2; }
.fb-row { display: flex; justify-content: center; align-items: stretch; gap: 36px; flex-wrap: wrap; row-gap: 40px; }
.fb--tree .fb-row, .fb--pyramid .fb-row, .fb--layers .fb-row { gap: 22px; }
.fb-rows { display: flex; flex-direction: column; gap: 46px; justify-content: center; height: 100%; }
.fb--pyramid .fb-rows, .fb--layers .fb-rows { gap: 12px; }
.fb--pyramid .fb-node, .fb--layers .fb-node { min-height: 56px; padding: 6px 10px; }
.fb--cycle .fb-rows { display: block; position: relative; height: 100%; }
.fb--cycle .fb-node { position: absolute; transform: translate(-50%, -50%); }
.fb-node { position: relative; z-index: 1; flex: 0 1 138px; width: 138px; min-width: 112px; min-height: 64px; padding: 10px 12px; display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center;
  border-radius: var(--sim-radius-md); background: var(--sim-bg-surface); border: calc(2px * var(--look-rim)) solid color-mix(in oklab, var(--tone) 70%, var(--sim-stroke));
  box-shadow: 0 calc(4px * var(--look-lip)) 0 color-mix(in oklab, var(--tone) 55%, var(--sim-bg-deep)); animation: fb-pop 0.45s var(--look-spring) both; }
.fb-node .sim-icon { width: 38px; height: 38px; }
.fb-label { font-weight: 800; font-size: var(--sim-text-md); line-height: 1.2; color: var(--sim-label); }
.fb-sub { font-weight: 700; font-size: var(--sim-text-sm); line-height: 1.2; color: var(--sim-label-muted); }
.fb-node--hidden { border-style: dashed; box-shadow: none; background: color-mix(in oklab, var(--sim-bg-surface) 55%, transparent); justify-content: center; }
.fb-node--hidden .fb-q { font: 900 30px/1 var(--sim-font-display, var(--sim-font)); color: var(--sim-label-muted); animation: fb-bob 1.4s ease-in-out infinite; }
@keyframes fb-bob { 50% { transform: translateY(-4px); } }
.fb--still .fb-node--hidden .fb-q { animation: none; }
@keyframes fb-pop { from { transform: scale(0.5); opacity: 0; } to { transform: none; opacity: 1; } }
.fb--cycle .fb-node { animation-name: fb-pop-c; }
@keyframes fb-pop-c { from { transform: translate(-50%, -50%) scale(0.5); opacity: 0; } to { transform: translate(-50%, -50%); opacity: 1; } }
.fb-band { border-radius: var(--sim-radius-lg); padding: 6px 10px 10px; background: color-mix(in oklab, var(--tone) 16%, transparent);
  border: calc(2px * var(--look-rim)) solid color-mix(in oklab, var(--tone) 45%, transparent); display: flex; flex-direction: column; align-items: center; gap: 6px; }
.fb-band__label { font-weight: 800; font-size: var(--sim-text-sm); color: var(--sim-label); padding: 1px 10px; border-radius: var(--look-pill); background: var(--tone); color: var(--fb-ink); }
.fb-socket { flex: 0 1 138px; width: 138px; min-width: 112px; min-height: 64px; border-radius: var(--sim-radius-md); border: calc(2px * var(--look-rim)) dashed color-mix(in oklab, var(--sim-label-muted) 55%, transparent);
  background: color-mix(in oklab, var(--sim-bg-deep) 60%, transparent); display: flex; align-items: center; justify-content: center; position: relative; }
.fb-socket::before { content: attr(data-n); position: absolute; top: -12px; left: -12px; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
  background: var(--sim-stroke); color: var(--sim-label); font-weight: 800; font-size: var(--sim-text-sm); }
.fb-socket .fb-node, .fb-tray .fb-node { animation: none; }
.fb-tray { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--sim-space-2); min-height: 76px; padding: var(--sim-space-2);
  border-radius: var(--sim-radius-md); border: calc(2px * var(--look-rim)) dashed var(--sim-stroke); background: color-mix(in oklab, var(--sim-bg-surface) 60%, transparent); }
.fb-tray:empty::after { content: attr(data-empty); align-self: center; font-weight: 700; font-size: var(--sim-text-sm); color: var(--sim-label-muted); }
.fb-choices { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--sim-space-2); }
.fb-choice { font: 800 var(--sim-text-md)/1.2 var(--sim-font); padding: 10px 16px; border-radius: var(--sim-radius-md); cursor: pointer;
  color: var(--sim-label); background: var(--sim-bg-surface); border: calc(2px * var(--look-rim)) solid var(--sim-accent); box-shadow: 0 calc(4px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-accent) 55%, var(--sim-bg-deep)); }
.fb-choice:active { transform: translateY(calc(3px * var(--look-lip))); box-shadow: 0 calc(1px * var(--look-lip)) 0 var(--sim-accent); }
.fb-choice--no { border-color: var(--sim-bad); box-shadow: 0 calc(4px * var(--look-lip)) 0 color-mix(in oklab, var(--sim-bad) 55%, var(--sim-bg-deep)); opacity: 0.6; animation: sim-pick-no 0.35s ease; }
.fb-ask { text-align: center; margin: 0; font-weight: 800; font-size: var(--sim-text-lg); }
.fb-mark { position: absolute; top: -12px; right: -12px; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
  font-weight: 900; font-size: 16px; color: var(--sim-ink-on-good, var(--sim-bg-deep)); animation: fb-pop 0.35s var(--look-spring) both; z-index: 3; }
.fb-mark--ok { background: var(--sim-good); } .fb-mark--no { background: var(--sim-bad); }
.sim-dom-root--portrait .fb-row { flex-direction: column; align-items: center; gap: 34px; }
.sim-dom-root--portrait .fb-band { width: 100% !important; }
.sim-dom-root--portrait .fb-band .fb-row { gap: 10px; }
.sim-dom-root--portrait .fb-node, .sim-dom-root--portrait .fb-socket { flex: none; width: 250px; flex-direction: row; text-align: left; align-items: center; }
.sim-dom-root--portrait .fb-tray .fb-node { width: 100%; }
.sim-dom-root--portrait .fb-node .sim-icon { flex: none; }
.sim-dom-root--portrait .fb--cycle .fb-rows { display: flex; flex-direction: column; align-items: center; gap: 34px; height: auto; }
.sim-dom-root--portrait .fb--cycle .fb-node { position: relative; transform: none; left: auto !important; top: auto !important; animation-name: fb-pop; }
`;

function validate(cfg) {
  const bad = (m) => { throw new Error(`flowBoard: ${m}`); };
  const L = cfg.layout ?? 'chain';
  if (!['chain', 'cycle', 'tree', 'pyramid', 'layers'].includes(L)) bad(`layout "${L}" is not chain | cycle | tree | pyramid | layers`);
  const ids = new Set();
  for (const n of cfg.nodes ?? []) { if (!n.id) bad('every node needs an id'); if (ids.has(n.id)) bad(`duplicate node id "${n.id}"`); ids.add(n.id); }
  if (!ids.size) bad('no nodes');
  for (const e of cfg.edges ?? []) if (!ids.has(e.from) || !ids.has(e.to)) bad(`edge ${e.from} -> ${e.to} names a missing node`);
  if (L === 'tree') for (const n of cfg.nodes) if (n.parent && !ids.has(n.parent)) bad(`node "${n.id}" has a missing parent "${n.parent}"`);
  for (const m of [cfg.mode, ...(cfg.modes ?? [])]) if (m && !['read', 'order', 'predict'].includes(m)) bad(`mode "${m}" is not read | order | predict`);
}

function nodeHtml(n, o = {}) {
  if (o.hidden) return `<div class="fb-node fb-node--hidden" data-node="${esc(n.id)}" style="${TONE(n.tone ?? 1)}" aria-label="hidden card"><span class="fb-q">?</span></div>`;
  return `<div class="fb-node" data-node="${esc(n.id)}"${o.item ? ` data-item="${esc(n.id)}"` : ''} style="${TONE(n.tone ?? 1)}">`
    + (n.icon ? iconSvg(n.icon, toneN(n.tone ?? 1)) : '')
    + `<span><span class="fb-label">${esc(tx(n.label))}</span>${n.sub ? `<br><span class="fb-sub">${esc(tx(n.sub))}</span>` : ''}</span></div>`;
}

/** Mount a flow board into host; returns the controller. @opts onChange, announce, onLayout, seed */
export function mountFlow(host, cfg, o = {}) {
  validate(cfg);
  const L = cfg.layout ?? 'chain';
  const nodes = cfg.nodes;
  const edgesAll = cfg.edges ?? (L === 'tree' ? nodes.filter((n) => n.parent).map((n) => ({ from: n.parent, to: n.id }))
    : L === 'chain' || L === 'cycle' ? nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id })).concat(L === 'cycle' ? [{ from: nodes[nodes.length - 1].id, to: nodes[0].id }] : []) : []);
  const modeAt = (s) => cfg.modes?.[s] ?? cfg.mode ?? 'read';
  const st = { step: 0, mode: modeAt(0), placed: {}, marks: null, wrong: new Set(), seen: new Set() };
  let pick = null;

  const visible = () => nodes.filter((n) => (n.revealAt ?? 0) <= st.step);
  const hiddenNext = () => (st.mode === 'predict' ? nodes.find((n) => (n.revealAt ?? 0) > st.step && !st.solved) : null);

  const rowsOf = (list) => {
    if (L === 'tree') {
      const depth = (n) => (n.parent ? depth(nodes.find((q) => q.id === n.parent)) + 1 : 0);
      const out = [];
      for (const n of list) (out[depth(n)] ??= []).push(n);
      return out.map((r) => r ?? []);
    }
    if (L === 'pyramid' || L === 'layers') {
      const out = [];
      for (const n of list) (out[n.level ?? 0] ??= []).push(n);
      return out.map((r) => r ?? []);
    }
    const per = list.length <= 4 ? list.length : Math.ceil(list.length / 2);   // cards shrink so 4 fit a row
    const out = [];
    for (let i = 0; i < list.length; i += per) out.push(list.slice(i, i + per));
    return out;
  };

  const draw = () => {
    const mode = st.mode;
    const vis = visible();
    const hid = hiddenNext();
    const shownNodes = hid ? [...vis, hid] : vis;
    let body, tray = '', extra = '';
    if (mode === 'order') {
      const order = nodes.filter((n) => (n.revealAt ?? 0) <= st.step);
      const sockets = order.map((_, i) => {
        const id = Object.keys(st.placed).find((k) => st.placed[k] === `n${i}`);
        const n = nodes.find((q) => q.id === id);
        return `<div class="fb-socket" data-bin="n${i}" data-n="${i + 1}" data-slot="${i}" aria-label="step ${i + 1}">${n ? nodeHtml(n, { item: true }) : ''}</div>`;
      });
      const rows = rowsOf(sockets.map((h, i) => ({ h, i })));
      body = `<div class="fb-rows">${rows.map((r) => `<div class="fb-row">${r.map((q) => q.h).join('')}</div>`).join('')}</div>`;
      const loose = shuffle(order.filter((n) => !st.placed[n.id]), rng(o.seed ?? 7));
      tray = `<div class="fb-tray" data-bin="tray" data-empty="all placed" aria-label="cards to order">${loose.map((n) => nodeHtml(n, { item: true })).join('')}</div>`;
    } else {
      const html = (n) => nodeHtml(n, { hidden: n === hid });
      const rows = rowsOf(shownNodes);
      if (L === 'pyramid' || L === 'layers') {
        const nL = Math.max(rows.length, cfg.levels?.length ?? 0);
        body = `<div class="fb-rows">${Array.from({ length: nL }, (_, i) => {
          const w = L === 'pyramid' ? 38 + (62 * i) / Math.max(1, nL - 1) : 100;
          return `<div class="fb-band" style="width:${w}%;margin:0 auto;${TONE(cfg.levelTones?.[i] ?? i + 1)}">`
            + (cfg.levels?.[i] ? `<span class="fb-band__label">${esc(tx(cfg.levels[i]))}</span>` : '')
            + `<div class="fb-row">${(rows[i] ?? []).map(html).join('')}</div></div>`;
        }).join('')}</div>`;
      } else if (L === 'cycle') {
        body = `<div class="fb-rows">${shownNodes.map(html).join('')}</div>`;
      } else body = `<div class="fb-rows">${rows.map((r) => `<div class="fb-row">${r.map(html).join('')}</div>`).join('')}</div>`;
      if (hid) {
        const choices = shuffle([hid.label, ...(cfg.decoys ?? [])].map(tx), rng((o.seed ?? 7) + st.step));
        extra = `<p class="fb-ask">What comes next?</p><div class="fb-choices">${choices.map((t) => `<button type="button" class="fb-choice${st.wrong.has(t) ? ' fb-choice--no' : ''}" data-choice="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
      }
    }
    const v = st.marks ? st.marks.filter((m) => m.ok).length : 0;
    host.innerHTML = `<div class="fb fb--${L} fb--${mode}${lookOf().overshoot ? '' : ' fb--still'}">`
      + ((cfg.title || st.marks) ? `<div class="fb-head">${cfg.title ? `<h3 class="fb-title">${esc(tx(cfg.title))}</h3>` : ''}`
        + (st.marks ? `<span class="fb-verdict${v < st.marks.length ? ' fb-verdict--miss' : ''}">${v} / ${st.marks.length} in place</span>` : '') + '</div>' : '')
      + `<div class="fb-stage"><svg class="fb-svg" aria-hidden="true"></svg>${body}</div>${extra}${tray}</div>`;
    if (st.marks) for (const m of st.marks) {
      const el = host.querySelector(`.fb-socket[data-slot="${m.slot}"]`);
      el?.insertAdjacentHTML('beforeend', `<span class="fb-mark fb-mark--${m.ok ? 'ok' : 'no'}">${m.ok ? '\u2713' : '\u2715'}</span>`);
    }
    layout();
  };

  const layout = () => {
    applyToneInks(host);
    const stage = host.querySelector('.fb-stage'), svg = host.querySelector('.fb-svg');
    if (!stage || !svg) return;
    const portrait = !!host.closest?.('.sim-dom-root--portrait');
    // Cycle: cards round an ellipse sized to the stage.
    if (L === 'cycle' && st.mode !== 'order' && !portrait) {
      const cards = [...stage.querySelectorAll('.fb-node')];
      const all = nodes.length, W = stage.clientWidth, H = Math.max(stage.clientHeight, 300);
      cards.forEach((el) => {
        const i = nodes.findIndex((n) => n.id === el.dataset.node);
        const a = -Math.PI / 2 + (i / all) * Math.PI * 2;
        el.style.left = `${W / 2 + Math.cos(a) * (W / 2 - 82)}px`;
        el.style.top = `${H / 2 + Math.sin(a) * (H / 2 - 46)}px`;
      });
    }
    svg.replaceChildren();
    for (const l of stage.querySelectorAll('.fb-elabel')) l.remove();
    const sb = stage.getBoundingClientRect(), k = sb.width / (stage.offsetWidth || sb.width) || 1;
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: (r.left - sb.left) / k, y: (r.top - sb.top) / k, w: r.width / k, h: r.height / k }; };
    const defs = document.createElementNS(SVGNS, 'defs');
    defs.innerHTML = '<marker id="fb-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse"><path class="fb-head-mark" d="M0 0L10 5L0 10z"/></marker>';
    svg.appendChild(defs);
    const els = new Map([...stage.querySelectorAll(st.mode === 'order' ? '.fb-socket' : '.fb-node')].map((el) => [st.mode === 'order' ? `n${el.dataset.slot}` : el.dataset.node, el]));
    const pairs = st.mode === 'order'
      ? [...els.keys()].slice(0, -1).map((k0, i) => ({ from: k0, to: `n${i + 1}` }))
      : edgesAll.filter((e) => els.has(e.from) && els.has(e.to) && (e.revealAt ?? 0) <= st.step);
    for (const e of pairs) {
      const a = box(els.get(e.from)), b = box(els.get(e.to));
      const [p, q] = edgePoints(a, b);
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      const bend = L === 'cycle' && !portrait ? 0.18 : 0;
      const cx = mx - (q.y - p.y) * bend, cy = my + (q.x - p.x) * bend;
      const path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', `M${p.x},${p.y} Q${cx},${cy} ${q.x},${q.y}`);
      path.setAttribute('class', 'fb-edge' + (st.seen.has(`${e.from}>${e.to}`) ? '' : ' fb-edge--new'));
      path.setAttribute('marker-end', 'url(#fb-arrow)');
      svg.appendChild(path);
      st.seen.add(`${e.from}>${e.to}`);
      if (e.label) {
        const lab = document.createElement('span');
        lab.className = 'fb-elabel';
        lab.textContent = tx(e.label);
        lab.style.left = `${(mx + cx) / 2}px`;
        lab.style.top = `${(my + cy) / 2}px`;
        stage.appendChild(lab);
      }
    }
    o.onLayout?.();
  };

  const onDrop = (id, bin) => {
    if (bin === 'tray') delete st.placed[id];
    else {
      const other = Object.keys(st.placed).find((kk) => st.placed[kk] === bin);
      if (other) { if (st.placed[id]) st.placed[other] = st.placed[id]; else delete st.placed[other]; }
      st.placed[id] = bin;
    }
    st.marks = null;
    draw();
    o.onChange?.(api);
  };
  const onChoice = (e) => {
    const b = e.target.closest?.('.fb-choice');
    if (!b) return;
    const hid = hiddenNext();
    if (!hid) return;
    if (b.dataset.choice === tx(hid.label)) {
      st.solved = true;
      st.step = Math.max(st.step, hid.revealAt ?? st.step);
      draw();
      burst(host.querySelector('.fb-stage'), 0, [...host.querySelectorAll('.fb-node')].find((n) => n.dataset.node === hid.id));
      o.announce?.(`Right: ${tx(hid.label)}.`);
    } else {
      st.wrong.add(b.dataset.choice);
      draw();
      o.announce?.('Not that one. Try again.');
    }
    o.onChange?.(api);
  };
  host.addEventListener('click', onChoice);
  // Cards pop in scaled: arrows measured mid-animation end inside them, so measure again when they settle.
  let relay = 0;
  const onAnim = () => { cancelAnimationFrame(relay); relay = requestAnimationFrame(layout); };
  host.addEventListener('animationend', onAnim);

  const api = {
    get mode() { return st.mode; },
    get placedCount() { return Object.keys(st.placed).length; },
    setStep(step) {
      const mode = modeAt(step);
      if (mode !== st.mode || step !== st.step) { st.placed = {}; st.marks = null; st.wrong = new Set(); st.solved = false; }
      st.step = step;
      st.mode = mode;
      draw();
    },
    check() {
      if (st.mode !== 'order') return [];
      const order = nodes.filter((n) => (n.revealAt ?? 0) <= st.step);
      st.marks = order.map((n, i) => {
        const id = Object.keys(st.placed).find((kk) => st.placed[kk] === `n${i}`);
        return { slot: i, id, ok: id === n.id };
      });
      draw();
      if (st.marks.every((m) => m.ok)) burst(host.querySelector('.fb-stage'));
      o.announce?.(`${st.marks.filter((m) => m.ok).length} of ${st.marks.length} in place.`);
      return st.marks;
    },
    reset() { st.placed = {}; st.marks = null; st.wrong = new Set(); st.solved = false; draw(); },
    layout,
    destroy() { pick?.destroy(); host.removeEventListener('click', onChoice); host.removeEventListener('animationend', onAnim); cancelAnimationFrame(relay); host.innerHTML = ''; },
  };
  pick = simPick(host, { items: '[data-item]', targets: '[data-bin]', onDrop, announce: o.announce });
  draw();
  return api;
}

// Where an arrow leaves box a and enters box b (on their edges, toward each other).
function edgePoints(a, b) {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const exit = (bx, from, to, pad) => {
    const dx = to.x - from.x, dy = to.y - from.y;
    const sx = dx ? (bx.w / 2 + pad) / Math.abs(dx) : Infinity, sy = dy ? (bx.h / 2 + pad) / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return { x: from.x + dx * s, y: from.y + dy * s };
  };
  return [exit(a, ca, cb, 4), exit(b, cb, ca, 10)];
}

/** A scene that is only a flow board: static CONFIG, BEAT_STEP_MAP, ARIA_LABEL. */
export class FlowScene extends DomSimulation {
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
    this.render({ css: SIM_LOOK_DOM_CSS + FLOW_CSS, rootClass: 'sl-backdrop' });
    const host = mountEl(this.root, 'sim-scroll fb-host');
    const cfg = this.constructor.CONFIG;
    if (!cfg) throw new Error('FlowScene: set static CONFIG');
    this.fb = mountFlow(host, cfg, { onChange: () => this.requestUiUpdate?.(), onLayout: () => this.relayout() });
    this._ro = new ResizeObserver(() => this.fb?.layout());
    this._ro.observe(this.root);
  }

  onBeatChange(beat) {
    const map = normalizeBeatMap(this.constructor.BEAT_STEP_MAP ?? [[{ idx: 0 }]], this.constructor.name);
    const b = Math.max(0, Math.min(map.length - 1, Math.trunc(Number.isFinite(beat) ? beat : 0)));
    this.stepIndex = map[b][0].idx;
    this.root.dataset.step = String(this.stepIndex);
    this.fb.setStep(this.stepIndex);
    this.requestUiUpdate?.();
  }

  refreshTheme() { this.fb?.layout(); }
  isControlHidden() { return !this.fb || this.fb.mode !== 'order'; }
  isControlDisabled(id) { return id === 'check' && this.fb?.placedCount === 0; }
  onControlChange(id) {
    if (this.isControlHidden(id)) return;
    if (id === 'check') this.fb.check();
    if (id === 'again') this.fb.reset();
    this.requestUiUpdate?.();
  }

  destroy() {
    this._ro?.disconnect();
    this.fb?.destroy();
    super.destroy();
  }
}
