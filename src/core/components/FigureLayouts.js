/**
 * FigureLayouts - the renderers behind content-block@1's `figure` field
 * (figureHost.js mounts them). The author writes content (stages, panels,
 * spans, small multiples, a comparison); this lays it out to the width it
 * gets, wraps the text, reveals it per slide STEP and draws it in the look.
 * No coordinates anywhere in the JSON. Reference: the owner-approved mock,
 * docs/sprints/wip/figure-field/approved-mock.html (its inline script is the
 * prototype of this file), and the contract next to it.
 *
 * Field shape (content-repo-template/docs/figures.md is the author's copy):
 *   { layout: 'steps'|'panels'|'timeline'|'multiples'|'compare',
 *     caption, items[2-6] (ids unique), notes?: [{ on, label, text, step }],
 *     position?, a11yCaption?, tab?, ...per layout (see the render* below) }
 * Every item / gate / after / aside / verdict / note takes an optional
 * `step`: the 1-based slide STEP (beat) it appears at, default 1. A not-yet
 * item is drawn as a dashed outline of the same size, so the figure never
 * changes shape between beats.
 *
 * Learner-facing strings are plain strings or { en } (txt() unwraps both).
 * Everything reaches the DOM through textContent (invariant 6), never
 * innerHTML. Colours are tokens only: --fig-* (theme.css for Quill,
 * src/looks/plain/look.css for plain) and --fig-case-* for the casefile
 * setting; FIGURE_CSS maps them onto short local names (--f-*).
 * Readability floor: nothing renders under 13 px, and the figure is never
 * scaled down; it reflows instead (steps row -> column, fewer columns, the
 * timeline drops its label column).
 */

export const FIGURE_LAYOUT_NAMES = ['steps', 'panels', 'timeline', 'multiples', 'compare'];

const NS = 'http://www.w3.org/2000/svg';
let _uid = 0;

/** A learner-facing string: plain or { en }. */
export function txt(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object' && typeof v.en === 'string') return v.en;
  return '';
}

/** Slide STEP an element appears at (1-based, default 1). */
const stepOf = (o) => (Number.isInteger(o?.step) && o.step > 0 ? o.step : 1);

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null && text !== '') e.textContent = String(text);
  return e;
}
function sv(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function prng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const tone = (n) => `var(--f-s${Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1})`;
const kick = (text, cls = '') => h('div', `kick${cls ? ' ' + cls : ''}`, text);
const labelled = (cls, label, text) => {
  const d = h('div', cls);
  d.appendChild(h('span', 'kick', label));
  d.appendChild(h('span', 'val', text));
  return d;
};

/** A card for one item: ghost until its step, `in` (fade-rise) on the step it arrives. */
function itemCard(it, ctx, extra = '') {
  const s = stepOf(it);
  const ghost = s > ctx.cur;
  const c = h('div', `card${ghost ? ' ghost' : ''}${!ghost && ctx.animate && s === ctx.cur ? ' in' : ''}${extra ? ' ' + extra : ''}`);
  c.dataset.id = it.id || '';
  if (ghost) c.setAttribute('aria-hidden', 'true');
  return c;
}

// ── steps ───────────────────────────────────────────────────────────────────
//   item { id, title, text?, entry? }, entryLabel?, gate? { after, title, items[] }, after? { title, text? }
function arrow(ghost) {
  const a = h('div', `arrow${ghost ? ' ghost' : ''}`);
  a.setAttribute('aria-hidden', 'true');
  const s = sv('svg', { viewBox: '0 0 26 14' });
  s.appendChild(sv('path', { d: 'M2 7 H23 M17 2 L23 7 L17 12' }));
  a.appendChild(s);
  return a;
}

function renderSteps(spec, ctx, box, w, forceVertical) {
  const items = spec.items;
  const arrows = items.length - 1 + (spec.after ? 1 : 0) + (spec.gate ? 1 : 0);
  const avail = w - arrows * 26 - (spec.gate ? 190 : 0);
  const per = avail / (items.length + (spec.after ? 0.75 : 0));
  const minPer = items.some((i) => i.text || i.entry) ? 104 : 96;
  // Plain in a side column (under 800 px) reads as a ruled ledger, one stage per
  // row: words get the width and the stack fills the figure's height.
  const vertical = forceVertical || per < minPer || (ctx.look === 'plain' && w < 800);
  const row = h('div', `steps${vertical ? ' vertical' : ''}${vertical && ctx.look === 'plain' && w >= 560 ? ' ledger-wide' : ''}`);
  items.forEach((it, i) => {
    if (i > 0) row.appendChild(arrow(stepOf(it) > ctx.cur));
    const compact = vertical && !it.text && !it.entry;
    const c = itemCard(it, ctx, compact ? 'compact' : '');
    const k = h('div', 'kick');
    k.appendChild(h('span', 'num', String(i + 1)));
    if (!vertical) k.appendChild(document.createTextNode(`Stage ${i + 1}`));
    c.appendChild(k);
    c.appendChild(h('h4', null, txt(it.title)));
    if (it.text) c.appendChild(h('p', null, txt(it.text)));
    if (it.entry) c.appendChild(labelled('entry', txt(spec.entryLabel) || 'Case', txt(it.entry)));
    row.appendChild(c);
    if (spec.gate && spec.gate.after === it.id) {
      const gs = stepOf(spec.gate);
      const gh = gs > ctx.cur;
      row.appendChild(arrow(gh));
      const g = h('div', `gate${gh ? ' ghost' : ''}`);
      g.dataset.id = 'gate';
      if (gh) g.setAttribute('aria-hidden', 'true');
      const gi = h('div', `g${!gh && ctx.animate && gs === ctx.cur ? ' in' : ''}`);
      gi.appendChild(kick(txt(spec.gate.title)));
      const ul = h('ul');
      for (const t of spec.gate.items || []) ul.appendChild(h('li', null, txt(t)));
      gi.appendChild(ul);
      g.appendChild(gi);
      row.appendChild(g);
    }
  });
  if (spec.after) {
    const as = stepOf(spec.after);
    const ag = as > ctx.cur;
    row.appendChild(arrow(ag));
    const a = h('div', `card after${ag ? ' ghost' : ''}${!ag && ctx.animate && as === ctx.cur ? ' in' : ''}`);
    a.dataset.id = 'after';
    if (ag) a.setAttribute('aria-hidden', 'true');
    a.appendChild(kick('Next'));
    a.appendChild(h('h4', null, txt(spec.after.title)));
    if (spec.after.text) a.appendChild(h('p', null, txt(spec.after.text)));
    row.appendChild(a);
  }
  box.appendChild(row);
  return { inlineNotes: vertical, vertical };
}

// ── panels ──────────────────────────────────────────────────────────────────
//   item { id, title, text, case? }, caseLabel?
function renderPanels(spec, ctx, box, w) {
  const n = spec.items.length;
  const ledger = ctx.look === 'plain' && w < 800;
  const cols = ledger ? 1 : Math.max(1, Math.min(n, Math.floor(w / 170)));
  const g = h('div', `panels${ledger ? ' ledger' : ''}${ledger && w >= 560 ? ' ledger-wide' : ''}`);
  g.style.setProperty('--cols', cols);
  spec.items.forEach((it, i) => {
    const c = itemCard(it, ctx);
    const t = h('span', 'tone');
    t.style.setProperty('--tone', tone(i + 1));
    c.appendChild(t);
    if (ledger) {
      const k = h('div', 'kick');
      k.appendChild(h('span', 'num', String(i + 1).padStart(2, '0')));
      c.appendChild(k);
    } else c.appendChild(kick(`${String(i + 1).padStart(2, '0')} / ${n}`));
    c.appendChild(h('h4', null, txt(it.title)));
    c.appendChild(h('p', 'body', txt(it.text)));
    if (it.case) c.appendChild(labelled('live', txt(spec.caseLabel) || 'The case', txt(it.case)));
    g.appendChild(c);
  });
  box.appendChild(g);
  return { inlineNotes: cols < n };
}

// ── timeline ────────────────────────────────────────────────────────────────
//   axis { from, to, every }, item { id, title, text?, from, to? | open: true, tone? }
function renderTimeline(spec, ctx, box, w) {
  const narrow = w < 430;
  const ax = spec.axis;
  const span = (ax.to - ax.from) || 1;
  const every = ax.every > 0 ? ax.every : span;
  const tl = h('div', `tl${narrow ? ' narrow' : ''}`);
  tl.style.setProperty('--labw', '150px');
  const pct = (y) => `${((y - ax.from) / span) * 100}%`;
  spec.items.forEach((it, i) => {
    const s = stepOf(it);
    const ghost = s > ctx.cur;
    const r = h('div', 'tl-row');
    if (ghost) r.setAttribute('aria-hidden', 'true');
    const who = h('div', `who${ghost ? ' ghost' : ''}`);
    who.appendChild(h('b', null, txt(it.title)));
    if (it.text) who.appendChild(document.createTextNode(txt(it.text)));
    r.appendChild(who);
    const tr = h('div', 'tl-track');
    tr.dataset.id = it.id;
    const grid = h('div', 'tl-grid');
    for (let y = ax.from; y <= ax.to + 1e-9; y += every) { const gi = h('i'); gi.style.left = pct(y); grid.appendChild(gi); }
    tr.appendChild(grid);
    const b = h('div', `tl-bar${it.open ? ' open' : ''}${ghost ? ' ghost' : ''}${!ghost && ctx.animate && s === ctx.cur ? ' in' : ''}`);
    b.style.left = pct(it.from);
    b.style.right = it.open ? '0' : `calc(100% - ${pct(it.to)})`;
    b.style.setProperty('--tone', tone(it.tone || i + 1));
    b.style.animationDelay = `${i * 0.12}s`;
    tr.appendChild(b);
    if (!ghost) {
      const st = h('span', 'tl-start', String(it.from));
      st.style.left = pct(it.from);
      tr.appendChild(st);
    }
    r.appendChild(tr);
    tl.appendChild(r);
  });
  const axr = h('div', 'tl-axis');
  axr.setAttribute('aria-hidden', 'true');
  axr.appendChild(h('div'));
  const ticks = h('div', 'tl-ticks');
  // A tick label is ~40 px wide at 13 px: thin the labels, never the font.
  const n = Math.round(span / every) + 1;
  const trackW = narrow ? w : w - 160;
  const skip = Math.max(1, Math.ceil((n * 44) / Math.max(1, trackW)));
  let k = 0;
  for (let y = ax.from; y <= ax.to + 1e-9; y += every, k++) {
    const t = h('span', k % skip ? 'minor' : null, k % skip ? '' : String(Math.round(y * 100) / 100));
    t.style.left = pct(y);
    ticks.appendChild(t);
  }
  axr.appendChild(ticks);
  tl.appendChild(axr);
  box.appendChild(tl);
  return { inlineNotes: narrow };
}

// ── glyphs (multiples / compare): open registry, keyed by `glyph` ─────────────
/** A cohort: people join at one event and are followed forward. Labels are HTML (13 px floor). */
function cohortGlyph(it, i) {
  const wrap = h('div', 'glyph cohort');
  wrap.setAttribute('aria-hidden', 'true');
  const s = sv('svg', { viewBox: '0 0 200 80' });
  const r = prng(7 + i * 13);
  s.appendChild(sv('line', { x1: 8, y1: 60, x2: 192, y2: 60, class: 'ax' }));
  const ex = 62;
  s.appendChild(sv('line', { x1: ex, y1: 8, x2: ex, y2: 60, class: 'ev' }));
  for (let j = 0; j < 9; j++) s.appendChild(sv('circle', { cx: (12 + r() * 40).toFixed(1), cy: (22 + r() * 32).toFixed(1), r: 2.6, class: 'pre' }));
  for (let j = 0; j < 6; j++) s.appendChild(sv('circle', { cx: ex + 8, cy: 22 + j * 6.2, r: 3, class: 'dot' }));
  s.appendChild(sv('path', { d: `M${ex + 16} 37 H184 M178 32 L184 37 L178 42`, class: 'fwd' }));
  wrap.appendChild(s);
  const ev = h('span', 'evl', txt(it.event));
  ev.style.left = `${((ex + 5) / 200) * 100}%`;
  wrap.appendChild(ev);
  wrap.appendChild(h('span', 'tlab', 'followed forward'));
  return wrap;
}

/** A target with 14 shots: spread (0-1 of the radius) round offset [x, y] (-1..1). */
function targetGlyph(it, i) {
  const s = sv('svg', { viewBox: '0 0 200 200', 'aria-hidden': 'true' });
  const id = `fig-ah-${++_uid}`;
  const defs = sv('defs', {});
  const mk = sv('marker', { id, viewBox: '0 0 8 8', refX: 6, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
  mk.appendChild(sv('path', { d: 'M0 0 L8 4 L0 8 z', class: 'ah' }));
  defs.appendChild(mk);
  s.appendChild(defs);
  [92, 70, 48, 26].forEach((rr, k) => s.appendChild(sv('circle', { cx: 100, cy: 100, r: rr, class: k === 0 ? 'ring1' : 'ring2' })));
  s.appendChild(sv('line', { x1: 100, y1: 6, x2: 100, y2: 194, class: 'cross' }));
  s.appendChild(sv('line', { x1: 6, y1: 100, x2: 194, y2: 100, class: 'cross' }));
  s.appendChild(sv('circle', { cx: 100, cy: 100, r: 5, class: 'bull' }));
  const r = prng(3 + i * 31);
  const off = Array.isArray(it.offset) ? it.offset : [0, 0];
  const spread = Number.isFinite(it.spread) ? it.spread : 0.3;
  const cx = 100 + (off[0] || 0) * 92, cy = 100 + (off[1] || 0) * 92, n = 14;
  let mx = 0, my = 0;
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread * 92;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    pts.push([x, y]); mx += x; my += y;
  }
  mx /= n; my /= n;
  if (Math.hypot(mx - 100, my - 100) > 20) {
    s.appendChild(sv('path', { d: `M100 100 L${(100 + (mx - 100) * 0.78).toFixed(1)} ${(100 + (my - 100) * 0.78).toFixed(1)}`, class: 'pull', 'marker-end': `url(#${id})` }));
  }
  pts.forEach((p, k) => {
    const c = sv('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 5, class: 'shot' });
    c.style.setProperty('--tone', tone(it.tone || i + 1));
    c.style.animationDelay = `${k * 0.03}s`;
    s.appendChild(c);
  });
  return s;
}

/** Open registry: a new glyph is one function here plus its name in the validators. */
export const FIGURE_GLYPHS = { cohort: cohortGlyph, target: targetGlyph };

// ── multiples ───────────────────────────────────────────────────────────────
//   glyph 'cohort', item { id, title, event, text }, aside? { label, tags[] }
function renderMultiples(spec, ctx, box, w) {
  const n = spec.items.length;
  let cols = Math.max(1, Math.min(n, Math.floor(w / 230)));
  if (cols === 3 && n === 4) cols = 2;
  const glyph = FIGURE_GLYPHS[spec.glyph] || cohortGlyph;
  const g = h('div', 'mult');
  g.style.setProperty('--cols', cols);
  spec.items.forEach((it, i) => {
    const c = itemCard(it, ctx);
    c.appendChild(h('h4', null, txt(it.title)));
    c.appendChild(glyph(it, i));
    c.appendChild(h('p', null, txt(it.text)));
    g.appendChild(c);
  });
  box.appendChild(g);
  if (spec.aside && stepOf(spec.aside) <= ctx.cur) {
    const a = h('div', `aside${ctx.animate && stepOf(spec.aside) === ctx.cur ? ' in' : ''}`);
    a.dataset.id = 'aside'; // a narration cue can show / focus it (focus.aside); figureFocus never picks it
    a.appendChild(h('span', 'kick', txt(spec.aside.label)));
    for (const t of spec.aside.tags || []) a.appendChild(h('span', 'tag', txt(t)));
    box.appendChild(a);
  }
  return { inlineNotes: cols < 2 };
}

// ── compare ─────────────────────────────────────────────────────────────────
//   glyph 'target', item { id, title, text, spread, offset [x, y], tone? }, verdict? { text }
function renderCompare(spec, ctx, box, w) {
  const n = spec.items.length;
  const cols = w < 400 ? 1 : Math.max(1, Math.min(n, Math.floor(w / 200)));
  const glyph = FIGURE_GLYPHS[spec.glyph] || targetGlyph;
  const g = h('div', 'cmp');
  g.style.setProperty('--cols', cols);
  spec.items.forEach((it, i) => {
    const c = itemCard(it, ctx);
    c.appendChild(h('h4', null, txt(it.title)));
    c.appendChild(glyph(it, i));
    c.appendChild(h('p', null, txt(it.text)));
    g.appendChild(c);
  });
  box.appendChild(g);
  if (spec.verdict && stepOf(spec.verdict) <= ctx.cur) {
    const v = h('div', `verdict${ctx.animate && stepOf(spec.verdict) === ctx.cur ? ' in' : ''}`);
    v.appendChild(h('span', null, txt(spec.verdict.text)));
    box.appendChild(v);
  }
  return { inlineNotes: cols < 2 };
}

export const FIGURE_LAYOUTS = { steps: renderSteps, panels: renderPanels, timeline: renderTimeline, multiples: renderMultiples, compare: renderCompare };

// ── notes: a lane above the figure, a leader line to the target ───────────────
function noteBox(n, cls, animate) {
  const d = h('div', `note ${cls}${animate ? ' in' : ''}`);
  d.appendChild(h('b', null, txt(n.label)));
  d.appendChild(document.createTextNode(txt(n.text)));
  return d;
}

function inlineHost(t) {
  if (t.classList.contains('gate')) return t.querySelector('.g');
  if (t.classList.contains('tl-track')) return t.parentNode;
  return t;
}

function placeNotes(spec, ctx, inner, lane, body, inline) {
  lane.replaceChildren();
  lane.style.height = '0px';
  inner.querySelector('.leaders')?.remove();
  const notes = (spec.notes || []).filter((n) => stepOf(n) <= ctx.cur).slice(-3);
  if (!notes.length) return;
  const target = (n) => body.querySelector(`[data-id="${CSS.escape(String(n.on))}"]`);
  const fresh = (n) => ctx.animate && stepOf(n) === ctx.cur;
  const hot = (t) => { if (t.classList.contains('card')) t.classList.add('hot'); if (t.classList.contains('gate')) t.querySelector('.g')?.classList.add('hot'); };
  if (inline) {
    for (const n of notes) { const t = target(n); if (!t) continue; hot(t); inlineHost(t).appendChild(noteBox(n, 'inline', fresh(n))); }
    return;
  }
  const ib = inner.getBoundingClientRect();
  let firstTop = Infinity;
  body.querySelectorAll('.card, .tl-track, .gate').forEach((e) => { firstTop = Math.min(firstTop, e.getBoundingClientRect().top); });
  // Lane notes first (measured), then the leaders once the lane has its height.
  const placed = [];
  let rightEdge = -Infinity;
  const sorted = notes.map((n) => ({ n, t: target(n) })).filter((x) => x.t)
    .map((x) => ({ ...x, tb: x.t.getBoundingClientRect() }))
    .sort((a, b) => a.tb.left - b.tb.left);
  for (const x of sorted) {
    hot(x.t);
    if (x.tb.top > firstTop + 12) { inlineHost(x.t).appendChild(noteBox(x.n, 'inline', fresh(x.n))); continue; }
    const box = noteBox(x.n, 'lane', fresh(x.n));
    lane.appendChild(box);
    const bw = box.offsetWidth;
    const cx = x.tb.left - ib.left + x.tb.width / 2;
    const left = Math.max(rightEdge + 8, Math.max(0, Math.min(ib.width - bw, cx - bw / 2)));
    if (left + bw > ib.width + 1) { box.remove(); inlineHost(x.t).appendChild(noteBox(x.n, 'inline', fresh(x.n))); continue; }
    box.style.left = `${left}px`;
    rightEdge = left + bw;
    placed.push({ ...x, box, cx });
  }
  if (!placed.length) return;
  const laneH = Math.max(...placed.map((p) => p.box.offsetHeight)) + 16;
  lane.style.height = `${laneH}px`;
  const svg = sv('svg', { class: 'leaders', 'aria-hidden': 'true' });
  inner.appendChild(svg);
  const ib2 = inner.getBoundingClientRect();
  for (const p of placed) {
    const tb = p.t.getBoundingClientRect();
    const bb = p.box.getBoundingClientRect();
    const cx = tb.left - ib2.left + tb.width / 2;
    const x1 = Math.max(bb.left - ib2.left + 14, Math.min(bb.right - ib2.left - 14, cx));
    const y1 = bb.bottom - ib2.top;
    let x2 = cx, y2 = tb.top - ib2.top;
    const bar = p.t.classList.contains('tl-track') ? p.t.querySelector('.tl-bar') : null;
    if (bar) { x2 = tb.left - ib2.left + bar.offsetLeft + Math.min(60, bar.offsetWidth / 3); y2 = tb.top - ib2.top + bar.offsetTop + 2; }
    const ym = y1 + (y2 - y1) * 0.45;
    const path = sv('path', { d: `M${x1} ${y1} L${x1} ${ym} L${x2} ${ym} L${x2} ${y2 - 3}` });
    svg.appendChild(path);
    if (fresh(p.n)) { const len = Math.ceil(path.getTotalLength()); path.style.setProperty('--len', len); path.setAttribute('class', 'draw'); }
    svg.appendChild(sv('circle', { cx: x2, cy: y2 - 2, r: 2.6 }));
  }
}

/**
 * Draws the figure into a skeleton made by figureHost.js.
 * @param {{ body: HTMLElement, inner: HTMLElement, lane: HTMLElement }} view
 * @param {object} spec the `figure` field
 * @param {{ cur: number, animate: boolean, look?: string }} ctx cur = the 1-based slide STEP now showing
 */
export function drawFigure(view, spec, ctx) {
  const render = FIGURE_LAYOUTS[spec?.layout];
  view.body.replaceChildren();
  view.lane.replaceChildren();
  view.inner.querySelector('.leaders')?.remove();
  if (!render || !Array.isArray(spec.items) || !spec.items.length) return;
  const w = view.body.clientWidth;
  if (!w) return;
  let res = render(spec, ctx, view.body, w);
  // Fit check: a word wider than its card (a long title in a narrow stage) means the row does not fit; stack it.
  if (spec.layout === 'steps' && !res.vertical) {
    const over = [...view.body.querySelectorAll('.card h4, .card p, .card .entry')].some((e) => e.scrollWidth > e.clientWidth + 1);
    if (over) { view.body.replaceChildren(); res = renderSteps(spec, ctx, view.body, w, true); }
  }
  placeNotes(spec, ctx, view.inner, view.lane, view.body, res.inlineNotes);
}

// -- focus: what the beat is about ---------------------------------------------
// The focused part gets the signature edge and tint; every other shown part
// dims to the muted ink (text stays 4.5:1). Ids: item ids, plus 'gate' and
// 'after' on steps. Ghosts are never focused or dimmed.

/** Every focusable id with the step it appears at. */
function focusables(spec) {
  const out = (spec?.items || []).map((it) => ({ id: String(it.id ?? ''), s: stepOf(it) })).filter((x) => x.id);
  if (spec?.gate) out.push({ id: 'gate', s: stepOf(spec.gate) });
  if (spec?.after) out.push({ id: 'after', s: stepOf(spec.after) });
  return out;
}

/**
 * The ids focused at slide STEP cur (1-based). `focus: [{ step, on }]` wins
 * for its step (`on: []` = none at that step); `focus: false` turns focus off.
 * Otherwise the newest arrivals, when older parts are already shown (so a
 * figure that appears all at once has no focus), else the targets of this
 * step's notes.
 */
export function figureFocus(spec, cur) {
  if (!spec || spec.focus === false) return [];
  const set = Array.isArray(spec.focus) ? spec.focus.filter((f) => f && stepOf(f) === cur).pop() : null;
  if (set) return [].concat(set.on ?? []).map(String);
  const shown = focusables(spec).filter((x) => x.s <= cur);
  const fresh = shown.filter((x) => x.s === cur);
  if (fresh.length && fresh.length < shown.length) return fresh.map((x) => x.id);
  if (cur > 1) {
    const ids = new Set(shown.map((x) => x.id));
    return (spec.notes || []).filter((n) => stepOf(n) === cur && ids.has(String(n.on))).map((n) => String(n.on));
  }
  return [];
}

/**
 * A narration cue id as figure focus: 'focus.<id>' or 'focus:<id>' (several
 * ids joined with '+' or ','), 'focus.none' clears to nothing, a bare item id focuses
 * that item. Returns the id list, or null when the cue is not about this figure.
 */
export function figureCueFocus(spec, cueId) {
  const all = new Set(focusables(spec).map((x) => x.id));
  if (spec?.aside) all.add('aside'); // cue-only: text-mode focus (figureFocus) is unchanged
  const m = /^focus[.:](.+)$/.exec(String(cueId || ''));
  if (m) return m[1] === 'none' ? [] : m[1].split(/[+,]/).filter((id) => all.has(id));
  return all.has(String(cueId)) ? [String(cueId)] : null;
}

/** Marks the focused parts (.on) and the figure (data-focus) in a drawn body. */
export function applyFigureFocus(root, body, ids) {
  const want = new Set(ids || []);
  let any = false;
  body.querySelectorAll('[data-id]').forEach((e) => {
    const host = e.classList.contains('tl-track') ? e.parentNode : e;
    const on = want.has(e.dataset.id) && host.getAttribute('aria-hidden') !== 'true' && !e.classList.contains('ghost');
    host.classList.toggle('on', on);
    if (on) any = true;
  });
  // narr-rest (narration, Q-77): nothing lit, all dimmed.
  if (any || want.has('narr-rest')) root.dataset.focus = ''; else delete root.dataset.focus;
}

/** What a screen reader hears when the author gave no a11yCaption: what is shown at this step. */
export function describeFigure(spec, cur) {
  if (!spec) return '';
  const on = (o) => stepOf(o) <= cur;
  const items = (spec.items || []).filter(on);
  const parts = [];
  const cap = txt(spec.caption);
  const T = (it) => [txt(it.title), txt(it.text)].filter(Boolean).join(': ');
  switch (spec.layout) {
    case 'steps': {
      parts.push(`A flow of ${spec.items.length} stages`);
      spec.items.forEach((it, i) => {
        if (!on(it)) return;
        parts.push(`Stage ${i + 1}, ${T(it)}${it.entry ? ` (${txt(spec.entryLabel) || 'Case'}: ${txt(it.entry)})` : ''}`);
        if (spec.gate && spec.gate.after === it.id && on(spec.gate)) parts.push(`then a gate, ${txt(spec.gate.title)}: ${(spec.gate.items || []).map(txt).join('; ')}`);
      });
      if (spec.after && on(spec.after)) parts.push(`Next: ${[txt(spec.after.title), txt(spec.after.text)].filter(Boolean).join(', ')}`);
      break;
    }
    case 'panels':
      parts.push(`${spec.items.length} panels`);
      for (const it of items) parts.push(`${T(it)}${it.case ? ` (${txt(spec.caseLabel) || 'The case'}: ${txt(it.case)})` : ''}`);
      break;
    case 'timeline':
      parts.push(`A timeline from ${spec.axis?.from} to ${spec.axis?.to}`);
      for (const it of items) parts.push(`${T(it)}, from ${it.from}${it.open ? ' onward' : ` to ${it.to}`}`);
      break;
    case 'multiples':
      parts.push(`${spec.items.length} small pictures of the same kind`);
      for (const it of items) parts.push(`${T(it)}${it.event ? ` (joins at: ${txt(it.event)})` : ''}`);
      if (spec.aside && on(spec.aside)) parts.push(`${txt(spec.aside.label)}: ${(spec.aside.tags || []).map(txt).join(', ')}`);
      break;
    case 'compare':
      parts.push(`A comparison of ${spec.items.length}`);
      for (const it of items) parts.push(T(it));
      if (spec.verdict && on(spec.verdict)) parts.push(txt(spec.verdict.text));
      break;
    default: break;
  }
  for (const n of (spec.notes || []).filter(on).slice(-3)) parts.push(`Note, ${txt(n.label)}: ${txt(n.text)}`);
  return [cap, parts.join('. ')].filter(Boolean).join(' ');
}

/** Rough width-to-height ratio per layout, only to let resolveSimLayout pick side or below. */
export function figureAspect(spec) {
  const n = spec?.items?.length || 3;
  switch (spec?.layout) {
    case 'steps': return n >= 4 || spec.gate ? 2.2 : 1.6;
    case 'timeline': return 2;
    case 'panels': return n >= 3 ? 1.6 : 1.3;
    case 'multiples': return 1.3;
    case 'compare': return 1.3;
    default: return 1.5;
  }
}

/**
 * The figure's own stylesheet (it renders in its own shadow root). Values come
 * from tokens: --fig-* (look), --fig-case-* (casefile setting). Text floor 13 px.
 */
export const FIGURE_CSS = `
:host { display: block; width: 100%; }
* { box-sizing: border-box; }
.root {
  --f-desk: var(--fig-desk); --f-ground: var(--fig-ground); --f-card: var(--fig-card); --f-edge: var(--fig-edge); --f-rule: var(--fig-rule);
  --f-ink: var(--fig-ink); --f-muted: var(--fig-muted); --f-lead: var(--fig-lead); --f-lead-tint: var(--fig-lead-tint);
  --f-sig: var(--fig-sig); --f-sig-tint: var(--fig-sig-tint); --f-ghost: var(--fig-ghost);
  --f-s1: var(--fig-s1); --f-s2: var(--fig-s2); --f-s3: var(--fig-s3); --f-s4: var(--fig-s4); --f-s5: var(--fig-s5); --f-grey: var(--fig-grey);
  --f-shadow: var(--fig-shadow); --f-tab: var(--fig-tab); --f-ring: var(--fig-ring); --f-arrow: var(--fig-arrow); --f-tab-ink: var(--fig-tab-ink);
  --f-head: var(--font-heading); --f-body: var(--font-family); --f-kick: var(--font-family); --f-kick-ls: 0.12em;
  --f-r: var(--fig-r, 6px);
  line-height: 1.4;
  text-align: left;
}
.root[data-setting="casefile"] {
  --f-desk: var(--fig-case-desk); --f-ground: var(--fig-case-ground); --f-card: var(--fig-case-card); --f-edge: var(--fig-case-edge); --f-rule: var(--fig-case-rule);
  --f-ink: var(--fig-case-ink); --f-muted: var(--fig-case-muted); --f-lead: var(--fig-case-lead); --f-lead-tint: var(--fig-case-lead-tint);
  --f-sig: var(--fig-case-sig); --f-sig-tint: var(--fig-case-sig-tint); --f-ghost: var(--fig-case-ghost);
  --f-s1: var(--fig-case-s1); --f-s2: var(--fig-case-s2); --f-s3: var(--fig-case-s3); --f-s4: var(--fig-case-s4); --f-s5: var(--fig-case-s5); --f-grey: var(--fig-case-grey);
  --f-shadow: var(--fig-case-shadow); --f-tab: var(--fig-case-tab); --f-ring: var(--fig-case-ring); --f-arrow: var(--fig-case-arrow); --f-tab-ink: var(--fig-case-tab-ink);
  --f-kick: var(--fig-font-mono); --f-kick-ls: 0.08em; --f-r: 2px;
}
.root[data-look="quill"] { --f-kick-ls: 0.08em; }

.fig { font-family: var(--f-body); color: var(--f-ink); background: var(--f-ground); border-radius: var(--f-r); padding: 18px; position: relative; }
.root[data-look="plain"] .fig { border: 1px solid var(--f-ring); }
.root[data-look="quill"] .fig { border: 2px solid var(--f-ring); }
.root[data-setting="casefile"] { background: var(--f-desk); padding: 14px 14px 16px; border-radius: 4px; }
.root[data-setting="casefile"] .fig { border: 0; margin-top: 24px; border-radius: 0 3px 3px 3px; box-shadow: 0 8px 18px var(--f-shadow); }
.root[data-setting="casefile"] .fig::before {
  content: attr(data-tab); position: absolute; left: 0; top: -24px; height: 24px; min-width: 64px; max-width: 100%;
  padding: 5px 14px 0; background: var(--f-tab); border-radius: 4px 4px 0 0;
  font: 700 13px/1.2 var(--f-kick); letter-spacing: var(--f-kick-ls); text-transform: uppercase; color: var(--f-tab-ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.fig-inner { position: relative; }
.fig-body { min-width: 0; }

.leaders { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.leaders path { fill: none; stroke: var(--f-sig); stroke-width: 1.4; }
.leaders circle { fill: var(--f-sig); }
.leaders .draw { stroke-dasharray: var(--len); stroke-dashoffset: var(--len); animation: draw 0.24s ease-out forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
.lane { position: relative; }
.note { background: var(--f-sig-tint); color: var(--f-ink); border-left: 3px solid var(--f-sig); padding: 6px 9px; font-size: 13px; line-height: 1.3; border-radius: 0 var(--f-r) var(--f-r) 0; }
.note.lane { position: absolute; top: 0; width: max-content; max-width: min(220px, 100%); }
.note b { display: block; color: var(--f-sig); font: 700 13px/1.2 var(--f-kick); letter-spacing: var(--f-kick-ls); text-transform: uppercase; margin-bottom: 2px; }
.note.inline { position: static; max-width: none; margin-top: 8px; text-align: left; justify-self: stretch; }
.in { animation: rise 0.25s ease-out both; }
@keyframes rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

.kick { font: 700 13px/1.2 var(--f-kick); letter-spacing: var(--f-kick-ls); text-transform: uppercase; color: var(--f-muted); }
.card { background: var(--f-card); border: 1px solid var(--f-edge); border-radius: var(--f-r); padding: 12px 13px; min-width: 0; box-shadow: 0 1px 2px var(--f-shadow); transition: border-color 0.25s ease; }
.root[data-setting="casefile"] .card { background-image: repeating-linear-gradient(to bottom, transparent 0 21px, var(--f-rule) 21px 22px); background-position: 0 30px; background-repeat: repeat-y; border-color: var(--f-edge); border-top: 3px solid var(--f-lead); box-shadow: 0 2px 6px var(--f-shadow); }
.root[data-look="quill"] .card { border-width: 2px; box-shadow: 0 3px 0 var(--f-edge); }
.card h4 { margin: 4px 0; font: 700 17px/1.22 var(--f-head); color: var(--f-ink); text-wrap: balance; hyphens: manual; overflow-wrap: normal; }
.card h4, .card p, .card .entry { overflow-x: hidden; }
.root[data-look="quill"] .card h4 { font-weight: 600; }
.card p { margin: 0; font-size: 14px; line-height: 1.42; color: var(--f-ink); }
.card .entry { margin-top: 8px; padding-top: 7px; border-top: 1px dashed var(--f-edge); font-size: 13.5px; line-height: 1.38; }
.card .entry .kick { color: var(--f-lead); display: block; margin-bottom: 2px; }
.card.ghost { border-style: dashed; border-color: var(--f-ghost); background: transparent; box-shadow: none; }
.root[data-setting="casefile"] .card.after { background-image: none; border-top: 1.5px dashed var(--f-lead); }
.root[data-setting="casefile"] .card.ghost { background-image: none; border-top: 1px dashed var(--f-ghost); }
.card.ghost > :not(.kick) { visibility: hidden; }
.card.ghost .kick { color: var(--f-ghost); }
.card.hot { border-color: var(--f-sig); }
.root[data-setting="casefile"] .card.hot { border-top-color: var(--f-sig); }

/* steps */
.steps { display: flex; align-items: stretch; gap: 0; }
.steps > .card { flex: 1 1 0; }
.arrow { flex: 0 0 26px; display: grid; place-items: center; }
.arrow svg { width: 26px; height: 14px; overflow: visible; }
.arrow path { fill: none; stroke: var(--f-arrow); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.arrow.ghost path { stroke: var(--f-ghost); stroke-dasharray: 3 3; }
.steps .num { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 4px; border-radius: 11px; background: var(--f-lead); color: var(--f-card); font: 700 13px/1 var(--f-body); letter-spacing: 0; margin-right: 6px; vertical-align: 1px; }
.root[data-setting="casefile"] .steps .num { border-radius: 2px; font-family: var(--f-kick); }
.card.ghost .num { background: var(--f-ghost); color: var(--f-ground); visibility: visible; }
.card.after { background: color-mix(in oklab, var(--f-card) 45%, transparent); border-style: dashed; border-color: var(--f-lead); box-shadow: none; }
.card.after h4 { color: var(--f-lead); }
.card.after.ghost { border-color: var(--f-ghost); background: transparent; }
.gate { flex: 0 0 auto; display: grid; place-items: center; padding-inline: 4px; }
.gate .g { border: 2px solid var(--f-sig); border-radius: var(--f-r); background: var(--f-sig-tint); padding: 9px 10px; min-width: 0; max-width: 190px; }
.gate .g .kick { color: var(--f-sig); }
.gate ul { margin: 5px 0 0; padding: 0; list-style: none; display: grid; gap: 4px; font-size: 13px; line-height: 1.3; }
.gate li { display: grid; grid-template-columns: 14px 1fr; gap: 5px; }
.gate li::before { content: ""; width: 9px; height: 5px; border-left: 2px solid var(--f-sig); border-bottom: 2px solid var(--f-sig); transform: rotate(-45deg); margin-top: 4px; }
.gate.ghost .g { border-style: dashed; border-color: var(--f-ghost); background: transparent; }
.gate.ghost .g > * { visibility: hidden; }
.steps.vertical { flex-direction: column; }
.steps.vertical > .card { flex: none; }
.steps.vertical .card h4, .steps.vertical .card p, .steps.vertical .card .entry { overflow-wrap: anywhere; }
.steps.vertical > .card.compact { display: flex; align-items: center; gap: 8px; padding-block: 9px; }
.steps.vertical > .card.compact h4 { margin: 0; }
.steps.vertical > .card.compact.ghost h4 { visibility: hidden; }
.steps.vertical > .card.ghost { padding-block: 8px; }
.steps.vertical > .card.ghost > :not(.kick) { display: none; }
.steps.vertical .gate.ghost .g { padding-block: 8px; }
.steps.vertical .gate.ghost .g > :not(.kick) { display: none; }
.steps:not(.vertical) .card.after { flex: 0.75 1 0; }
.steps.vertical .arrow { flex: 0 0 22px; }
.steps.vertical .arrow svg { transform: rotate(90deg); width: 22px; }
.steps.vertical .gate { padding: 2px 0; }
.steps.vertical .gate .g { max-width: none; width: 100%; }

/* panels */
.panels { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 12px; }
.panels .card { display: flex; flex-direction: column; }
.panels .card .body { flex: 1; }
.panels .live { margin-top: 10px; background: var(--f-sig-tint); border-radius: max(0px, calc(var(--f-r) - 2px)); padding: 7px 9px; font-size: 13.5px; line-height: 1.35; }
.panels .live .kick { color: var(--f-sig); display: block; margin-bottom: 2px; }
.panels .card.ghost .live { visibility: hidden; }
.panels .tone { display: block; height: 3px; width: 34px; background: var(--tone); border-radius: 2px; margin-bottom: 8px; }
.root[data-setting="casefile"] .panels .tone { display: none; }

/* timeline */
.tl { display: grid; gap: 10px; }
.tl-row { display: grid; grid-template-columns: var(--labw) minmax(0, 1fr); gap: 10px; align-items: center; }
.tl-row .who { font-size: 13.5px; line-height: 1.25; min-width: 0; }
.tl-row .who b { display: block; font: 700 15px/1.2 var(--f-head); }
.tl-row .who.ghost { visibility: hidden; }
.root[data-look="quill"] .tl-row .who b { font-weight: 600; }
.tl-track { position: relative; height: 30px; border-radius: 3px; }
.tl-bar { position: absolute; top: 4px; bottom: 4px; border-radius: 3px; background: var(--tone); transform-origin: left center; }
.tl-bar.in { animation: grow 0.6s cubic-bezier(.2,.7,.2,1) both; }
.tl-bar.open { border-radius: 3px 0 0 3px; -webkit-mask-image: linear-gradient(to right, black 70%, transparent); mask-image: linear-gradient(to right, black 70%, transparent); }
.tl-start { position: absolute; top: 50%; transform: translate(6px, -50%); font: 700 13px/1 var(--f-body); color: var(--f-card); font-variant-numeric: tabular-nums; }
.tl-bar.ghost { background: transparent; border: 1.5px dashed var(--f-ghost); -webkit-mask-image: none; mask-image: none; }
@keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.tl-axis { display: grid; grid-template-columns: var(--labw) minmax(0, 1fr); gap: 10px; }
.tl-ticks { position: relative; height: 24px; border-top: 1px solid var(--f-edge); }
.tl-ticks span { position: absolute; top: 5px; transform: translateX(-50%); font: 600 13px/1 var(--f-body); color: var(--f-muted); font-variant-numeric: tabular-nums; }
.tl-ticks span::before { content: ""; position: absolute; left: 50%; top: -9px; height: 4px; border-left: 1px solid var(--f-edge); }
.tl-ticks span:first-child { transform: none; }
.tl-ticks span:first-child::before { left: 0; }
.tl-ticks span:last-child { transform: translateX(-100%); }
.tl-ticks span:last-child::before { left: 100%; }
.tl-grid { position: absolute; inset: 0; pointer-events: none; }
.tl-grid i { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--f-rule); }
.tl.narrow .tl-row { grid-template-columns: minmax(0, 1fr); gap: 3px; }
.tl.narrow .tl-axis { grid-template-columns: minmax(0, 1fr); }
.tl.narrow .tl-axis > div:first-child { display: none; }

/* multiples */
.mult { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 10px; }
.mult .card { padding: 10px 11px 11px; }
.glyph.cohort { position: relative; margin: 6px 0 4px; }
.glyph svg { width: 100%; height: auto; display: block; overflow: visible; }
.glyph .ax { stroke: var(--f-edge); stroke-width: 1.2; }
.glyph .ev { stroke: var(--f-sig); stroke-width: 2; }
.glyph .dot { fill: var(--f-s1); }
.glyph .pre { fill: var(--f-grey); opacity: 0.45; }
.glyph .fwd { stroke: var(--f-lead); stroke-width: 1.6; fill: none; stroke-linecap: round; }
.glyph .evl { position: absolute; top: 0; color: var(--f-sig); font: 700 13px/1.1 var(--f-kick); letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap; }
.glyph .tlab { position: absolute; right: 4%; top: 77.5%; color: var(--f-muted); font: 600 13px/1.1 var(--f-body); white-space: nowrap; }
.card.ghost .glyph { visibility: hidden; }
.aside { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: baseline; font-size: 13.5px; }
.aside .kick { margin-right: 4px; }
.aside .tag { background: var(--f-card); border: 1px solid var(--f-edge); border-radius: 999px; padding: 3px 9px; font-size: 13px; color: var(--f-ink); }
.root[data-setting="casefile"] .aside .tag { border-radius: 2px; font-family: var(--f-kick); }
.root[data-setting="casefile"] .aside > .kick { color: var(--f-ink); }

/* compare */
.cmp { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 12px; }
.cmp .card { display: grid; gap: 4px; justify-items: center; text-align: center; }
.cmp svg { width: min(100%, 230px); height: auto; display: block; margin: 4px 0; }
.cmp .ring1 { fill: var(--f-card); stroke: var(--f-edge); stroke-width: 1.2; }
.cmp .ring2 { fill: none; stroke: var(--f-edge); stroke-width: 1.2; }
.cmp .bull { fill: var(--f-lead); }
.cmp .cross { stroke: var(--f-lead); stroke-width: 1; opacity: 0.35; }
.cmp .shot { fill: var(--tone); stroke: var(--f-card); stroke-width: 1.2; }
.cmp .card.in .shot { animation: rise 0.2s ease-out both; }
.cmp .pull { stroke: var(--f-sig); stroke-width: 1.6; fill: none; }
.cmp .ah { fill: var(--f-sig); }
.cmp .card.ghost svg { visibility: hidden; }
.verdict { margin-top: 12px; font: 600 17px/1.3 var(--f-head); text-align: center; color: var(--f-ink); }
.verdict span { box-shadow: inset 0 -0.45em 0 var(--f-sig-tint); }
.root[data-setting="casefile"] .verdict { background: var(--f-card); padding: 8px 10px; }

/* focus (figureFocus): the beat's part gets the signature edge, the rest the
   muted ink (text stays 4.5:1); a cue or a new beat moves it over 250 ms. */
.card, .gate .g, .tl-row .who, .tl-row .who b, .card h4, .card p, .card .entry, .card .live, .card .num, .note { transition: color 0.25s ease, border-color 0.25s ease, background-color 0.25s ease, box-shadow 0.25s ease; }
.glyph, .card > svg, .tl-bar, .tl-start, .card .val { transition: opacity 0.25s ease, background-color 0.25s ease, color 0.25s ease; }
.root[data-focus] .card:not(.on):not(.ghost) :is(h4, p, .entry, .live, .val, .kick),
.root[data-focus] .card.after:not(.on):not(.ghost) h4 { color: var(--f-muted); }
.root[data-focus] .card:not(.on):not(.ghost) :is(.glyph, svg) { opacity: 0.45; }
.root[data-focus] .card:not(.on):not(.ghost) .num { background: var(--f-muted); }
.root[data-focus] .gate:not(.on):not(.ghost) .g { color: var(--f-muted); }
.root[data-focus] .tl-row:not(.on) :is(.who, .who b) { color: var(--f-muted); }
.root[data-focus] .tl-row:not(.on) .tl-bar:not(.ghost) { background: color-mix(in oklab, var(--tone) 35%, var(--f-ground)); }
.root[data-focus] .tl-row:not(.on) .tl-start { color: var(--f-ink); }
/* Narrated (figureHost narrationFocus, spec W1 D29n): a part held for its show cue keeps its room,
   unseen, and fades in at its word; the parts not being spoken about step further back. */
.narr-held { opacity: 0 !important; visibility: hidden; }
.root[data-narrated] :is(.card, .gate, .tl-row) { transition: opacity 0.3s ease, color 0.25s ease, border-color 0.25s ease, background-color 0.25s ease, box-shadow 0.25s ease; }
.root[data-narrated][data-focus] :is(.card, .gate, .tl-row):not(.on):not(.ghost) { opacity: 0.4; }
/* Narrated: slots for stages still to come stay out of sight (they keep their room). */
.root[data-narrated] .ghost { visibility: hidden; }
/* The multiples aside (Also called ...) as a cue target (Q-84): dimmed with the rest, lit when spoken. */
.root[data-narrated] .aside { transition: opacity 0.3s ease; }
.root[data-narrated][data-focus] .aside:not(.on) { opacity: 0.4; }
.root[data-narrated] .aside.on .tag { border-color: var(--f-sig); color: var(--f-ink); }
.root[data-narrated] .aside.on > .kick { color: var(--f-sig); }
@media (prefers-reduced-motion: reduce) { .root[data-narrated] :is(.card, .gate, .tl-row) { transition: none; } }
.card.on { border-color: var(--f-sig); }
.root[data-look="quill"] .card.on { box-shadow: 0 3px 0 var(--f-sig); }
.gate.on .g { box-shadow: 0 0 0 2px var(--f-sig); }
.tl-row.on .who b { color: var(--f-sig); }

/* plain (editorial, look pack plain SPEC): rules, not boxes; kickers, labels and
   titles in the body sans (the serif only at 24 px and up: the step numerals);
   no monospace, no ruled paper. Listed last so it wins over the casefile rules. */
.root[data-look="plain"] { --f-kick: var(--f-body); --f-kick-ls: 0.08em; --f-r: 0px; }
.root[data-look="plain"] .fig { border: 0; padding: 12px 0 0; background: transparent; box-shadow: none; }
.root[data-look="plain"][data-setting="casefile"] { background: transparent; padding: 0; }
.root[data-look="plain"][data-setting="casefile"] .fig { margin-top: 26px; border-top: 1px solid var(--f-edge); box-shadow: none; }
.root[data-look="plain"][data-setting="casefile"] .fig::before { top: -25px; height: 22px; min-width: 0; padding: 4px 0 0; background: transparent; border-radius: 0; font: 700 13px/1.2 var(--f-body); letter-spacing: 0.08em; color: var(--f-muted); }
.root[data-look="plain"] .kick { font-weight: 700; }
.root[data-look="plain"] .card { background: transparent; background-image: none; border: 0; border-top: 1.5px solid var(--f-ink); border-radius: 0; box-shadow: none; padding: 10px 2px 4px; }
.root[data-look="plain"] .card.hot { border-top-color: var(--f-sig); box-shadow: inset 0 1.5px 0 var(--f-sig); }
.root[data-look="plain"] .card.ghost { background: transparent; border-top: 1.5px dashed var(--f-ghost); box-shadow: none; }
.root[data-look="plain"] .card.after { background: transparent; border-top: 1.5px dashed var(--f-lead); }
.root[data-look="plain"] .card.after.ghost { border-top-color: var(--f-ghost); }
.root[data-look="plain"] .card h4 { font: 600 16px/1.25 var(--f-body); }
.root[data-look="plain"] .card.after h4 { color: var(--f-lead); }
.root[data-look="plain"] .card .entry { border-top: 1px dotted var(--f-edge); }
.root[data-look="plain"] .card .entry .kick { color: var(--f-sig); }
.root[data-look="plain"] .steps .num { min-width: 0; height: auto; padding: 0; border-radius: 0; background: none; color: var(--f-sig); font: 400 26px/1 var(--f-head); font-variant-numeric: lining-nums; margin-right: 8px; vertical-align: -4px; }
.root[data-look="plain"] .card.ghost .num { background: none; color: var(--f-ghost); }
.root[data-look="plain"] .steps.vertical > .card.compact { padding-block: 8px; }
.root[data-look="plain"] .gate .g { border: 0; border-left: 3px solid var(--f-sig); border-radius: 0; background: var(--f-sig-tint); }
.root[data-look="plain"] .gate.ghost .g { border-left: 3px dashed var(--f-ghost); background: transparent; }
.root[data-look="plain"] .note { border-radius: 0; }
.root[data-look="plain"] .panels .live { border-radius: 0; border-left: 3px solid var(--f-sig); }
.root[data-look="plain"] .panels .tone { display: block; border-radius: 0; height: 3px; }
.root[data-look="plain"] .tl-row .who b { font: 600 15px/1.2 var(--f-body); }
.root[data-look="plain"] .tl-bar { border-radius: 1px; }
.root[data-look="plain"] .tl-bar.open { border-radius: 1px 0 0 1px; }
.root[data-look="plain"] .tl-ticks { border-top-color: var(--f-ink); }
.root[data-look="plain"] .aside .tag { border-radius: 2px; font-family: var(--f-body); }
.root[data-look="plain"] .aside > .kick { color: var(--f-muted); }
.root[data-look="plain"] .verdict { background: transparent; padding: 8px 0 0; font: 600 17px/1.35 var(--f-body); }

/* plain, editorial hierarchy: one headline per item, the rest muted; bigger
   words; the folder tab only when the author wrote one. */
.root[data-look="plain"][data-setting="casefile"] .fig[data-tab=""] { margin-top: 0; }
.root[data-look="plain"][data-setting="casefile"] .fig[data-tab=""]::before { display: none; }
.root[data-look="plain"] .card h4 { font: 600 17px/1.25 var(--f-body); letter-spacing: -0.005em; }
.root[data-look="plain"] .card p { font-size: 15px; line-height: 1.45; color: var(--f-muted); }
.root[data-look="plain"] .card .entry { border-top: 0; margin-top: 8px; padding-top: 0; font-size: 15px; line-height: 1.4; }
.root[data-look="plain"] .card .entry .kick, .root[data-look="plain"] .panels .live .kick { display: block; color: var(--f-sig); margin-bottom: 3px; }
.root[data-look="plain"] .card .val { padding: 1px 0; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.root[data-look="plain"] .card.on .val { background: var(--highlight, var(--f-sig-tint)); color: var(--highlight-ink, var(--f-ink)); padding: 1px 3px; }
.root[data-look="plain"] .card.on { border-top: 3px solid var(--f-sig); background-color: color-mix(in oklab, var(--f-sig-tint) 30%, transparent); box-shadow: none; }
.root[data-look="plain"][data-focus] .card:not(.on):not(.ghost) { border-top-color: var(--f-edge); }
.root[data-look="plain"][data-focus] .card:not(.on):not(.ghost) .num { background: none; color: var(--f-muted); }
.root[data-look="plain"] .note { background: transparent; border-left: 2px solid var(--f-sig); padding: 2px 0 2px 10px; font-size: 14px; line-height: 1.35; }
.root[data-look="plain"] .note.lane { background: var(--f-ground); }
.root[data-look="plain"] .panels .live { background: transparent; border-left: 2px solid var(--f-sig); padding: 2px 0 2px 10px; font-size: 15px; line-height: 1.4; }
/* plain ledger: steps and panels in a side column, one ruled row per item,
   a serif numeral in the margin (26 px and up, SPEC sec 2). */
.root[data-look="plain"] :is(.steps.vertical > .card:not(.compact), .panels.ledger .card) { display: grid; grid-template-columns: 48px minmax(0, 1fr); column-gap: 10px; align-content: start; padding: 12px 2px 16px; }
.root[data-look="plain"] :is(.steps.vertical > .card:not(.compact), .panels.ledger .card) > :not(.kick) { grid-column: 2; }
.root[data-look="plain"] :is(.steps.vertical > .card:not(.compact), .panels.ledger .card) > .kick { grid-column: 1; grid-row: 1 / span 4; align-self: start; }
.root[data-look="plain"] :is(.steps.vertical, .panels.ledger) .num { display: block; min-width: 0; height: auto; margin: 0; padding: 0; border-radius: 0; background: none; color: var(--f-sig); font: 400 36px/0.9 var(--f-head); font-variant-numeric: lining-nums; }
.root[data-look="plain"] :is(.steps.vertical, .panels.ledger) .card h4 { font: 500 20px/1.25 var(--f-body); margin: 0 0 4px; }
.root[data-look="plain"] :is(.steps.vertical, .panels.ledger) .card.ghost .num { color: var(--f-ghost); }
/* wide ledger (560 px and up): the case line moves to its own column, so a row is one line pair, not four */
.root[data-look="plain"] :is(.steps.vertical.ledger-wide > .card:not(.compact), .panels.ledger.ledger-wide .card) { grid-template-columns: 48px minmax(0, 1.15fr) minmax(0, 1fr); column-gap: 14px; }
.root[data-look="plain"] :is(.steps.vertical.ledger-wide > .card:not(.compact), .panels.ledger.ledger-wide .card) > :is(.entry, .live) { grid-column: 3; grid-row: 1 / span 3; align-self: start; margin-top: 2px; }
.root[data-look="plain"] .panels.ledger { gap: 4px; }
.root[data-look="plain"] .panels.ledger .tone { display: none; }
.root[data-look="plain"] .steps.vertical .arrow { justify-content: start; place-items: center start; padding-left: 12px; }
.root[data-look="plain"] .steps.vertical .arrow path { stroke: var(--f-edge); }
.root[data-look="plain"] .steps.vertical > .card.ghost { padding-block: 10px; }
.root[data-look="plain"] .tl-row .who { font-size: 14px; color: var(--f-muted); }
.root[data-look="plain"] .tl-row .who b { font: 600 16px/1.25 var(--f-body); color: var(--f-ink); }
.root[data-look="plain"] .tl-row.on .who b { color: var(--f-sig); }
.root[data-look="plain"] .mult .card h4 { font-size: 17px; }
.root[data-look="plain"] .cmp .card h4 { font: 500 20px/1.25 var(--f-body); }
.root[data-look="plain"] .verdict { font: 400 24px/1.3 var(--f-head); text-align: left; padding-top: 14px; border-top: 1px solid var(--f-edge); }
.root[data-look="plain"] .verdict span { box-shadow: none; background: var(--highlight, var(--f-sig-tint)); color: var(--highlight-ink, var(--f-ink)); padding: 0 4px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .leaders .draw { stroke-dashoffset: 0; }
}
`;
