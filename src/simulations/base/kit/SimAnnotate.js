/**
 * SimAnnotate - name the thing to look at, on the figure itself (packs/look/plain/SPEC.md sec 4): a callout
 * (a tinted box with a leader line that draws on to its target), an underline, a highlighter sweep, a ring.
 * Every mark is --sim-annot (the course signature colour under plain) and --sim-annot-tint; nothing else.
 * At most 3 on screen (o.max): the newest is the beat, older ones recede, a fourth drops the oldest.
 * Motion: the box fades in (0.14 s), the leader or ring draws on (lookOf().annotDraw), the highlighter and
 * underline sweep left to right (annotSweep), one crisp ease-out. A repaint never replays a mark: each mark
 * remembers when it arrived and is painted at that point of its motion. Reduced motion: the end state.
 *
 * SVG (an SvgScene: call the marks in enter() or paint(); the same key is the same mark):
 *   const notes = annotations({ max: 3 })
 *   notes.callout(target, text, o)   target { x, y } or a box { x, y, w, h } (stage px). o: { key, sub (a second,
 *                                    muted line), side 'above' | 'below' | 'left' | 'right' (default above),
 *                                    gap (px, default 40), at { x, y } (the box's anchor point: the middle of
 *                                    the side facing the target), elbow (true: the leader turns a corner) }
 *   notes.underline(range, o)        range { x1, x2, y } or a box (under its foot). o: { key, w (px, 2.5) }
 *   notes.highlight(range, o)        range a box { x, y, w, h }: a highlighter stroke behind it. o: { key }
 *   notes.ring(target, o)            target { x, y, r } or a box (an ellipse round it). o: { key, pad }
 *   notes.clear(key?)                one mark, or all (enter() of a step that starts clean)
 *   notes.wrap(svgMarkup) -> markup  highlights under the scene's markup, leaders, underlines and rings over it
 *   notes.over() -> overlay HTML     the callout boxes (real text): add to paint()'s over
 *   notes.busy()                     true while a mark still moves (an SvgScene may repaint until it settles)
 * The default key is the kind plus the text (callout) or the target: pass o.key when the target moves.
 *
 * DOM (a DomSimulation; targets are elements or boxes in host px):
 *   const notes = annotateDom(host, { max })   mounts a layer over host (made position: relative)
 *   notes.callout(el, text, o), notes.ring(el, o)   as above, measured from the element
 *   notes.highlight(el), notes.underline(el)       a sweep behind or under the element's own text (a span
 *                                                  of words wraps fine); no layer needed
 *   notes.clear(key?), notes.refresh() (re-measure after a layout change), notes.destroy()
 *
 * Canvas (a SimScene; this.colors from COLOR_TOKEN_MAP carries annot, annotTint):
 *   notes.draw(ctx, c, { layer }) -> busy   every mark of an annotations() set at its point of motion; layer
 *                                    'under' (highlights, before the scene's text) or 'over' (the rest, after);
 *                                    while it returns true keep frames coming (this.animateFor?.())
 *
 * CSS: SIM_ANNOTATE_CSS (add to render({ css }); annotateDom injects it itself when given the scene).
 * Under the casefile setting the callout's heading is the typewriter mono (--sim-font-mono).
 */
import { esc } from 'simulations/base/SimUi.js';
import { lookOf } from './lookProfile.js';
import { reducedMotion } from './SimAnim.js';

const BOX_S = 0.14;          // the callout box's fade, seconds
const LEAD_AT = 0.08;        // the leader starts as the box arrives
const EASE = 'cubic-bezier(0.3, 0, 0.1, 1)';
const now = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000;
const f1 = (v) => Math.round(v * 10) / 10;

export const SIM_ANNOTATE_CSS = `
.sa-mark { pointer-events: none; }
.sa-draw { stroke-dasharray: 1; stroke-dashoffset: 0; animation: sa-draw var(--sa-dur, 0.24s) ${EASE} var(--sa-delay, 0s) backwards; }
@keyframes sa-draw { from { stroke-dashoffset: 1; } }
.sa-sweep { transform-box: fill-box; transform-origin: left center; animation: sa-sweep var(--sa-dur, 0.3s) ${EASE} var(--sa-delay, 0s) backwards; }
@keyframes sa-sweep { from { transform: scaleX(0); } }
.sa-fade { animation: sa-fade var(--sa-dur, 0.14s) ease-out var(--sa-delay, 0s) backwards; }
@keyframes sa-fade { from { opacity: 0; } }
.sa-old { opacity: 0.45; }
.sa-box {
  position: absolute; box-sizing: border-box; width: max-content; max-width: 230px; padding: 6px 10px 7px;
  border-radius: calc(4px * var(--look-radius, 1));
  background: linear-gradient(var(--sim-annot-tint), var(--sim-annot-tint)), var(--sim-bg-surface);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--sim-label) 14%, transparent);
  color: var(--sim-label); line-height: 1.2; pointer-events: none; white-space: normal;
}
.sa-box--above { transform: translate(-50%, -100%); }
.sa-box--below { transform: translate(-50%, 0); }
.sa-box--left { transform: translate(-100%, -50%); }
.sa-box--right { transform: translate(0, -50%); }
.sa-box__t { display: block; font: 700 14px/1.15 var(--sim-font); letter-spacing: 0.05em; text-transform: uppercase; color: var(--sim-annot); }
.sa-box__s { display: block; margin-top: 2px; font: 500 14px/1.25 var(--sim-font); color: var(--sim-label-muted); }
[data-sim-setting="casefile"] .sa-box__t { font-family: var(--sim-font-mono, monospace); letter-spacing: 0.08em; }
.sa-layer { position: absolute; inset: 0; pointer-events: none; z-index: 4; }
.sa-layer > svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.sa-hl, .sa-ul { background-repeat: no-repeat; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.sa-hl { background-image: linear-gradient(var(--sim-annot-tint), var(--sim-annot-tint)); background-size: 100% 100%; background-position: 0 0; padding: 0 2px; margin: 0 -2px;
  animation: sa-hl var(--sa-dur, 0.3s) ${EASE} var(--sa-delay, 0s) backwards; }
@keyframes sa-hl { from { background-size: 0% 100%; } }
.sa-ul { background-image: linear-gradient(var(--sim-annot), var(--sim-annot)); background-size: 100% 2.5px; background-position: 0 100%; padding-bottom: 2px;
  animation: sa-ul var(--sa-dur, 0.3s) ${EASE} var(--sa-delay, 0s) backwards; }
@keyframes sa-ul { from { background-size: 0% 2.5px; } }
.sa-hl.sa-ul { background-image: linear-gradient(var(--sim-annot-tint), var(--sim-annot-tint)), linear-gradient(var(--sim-annot), var(--sim-annot)); background-size: 100% 100%, 100% 2.5px; background-position: 0 0, 0 100%; }
@media (prefers-reduced-motion: reduce) { .sa-draw, .sa-sweep, .sa-fade, .sa-hl, .sa-ul { animation: none !important; } }
`;

const isBox = (t) => t && Number.isFinite(t.w) && Number.isFinite(t.h);
const centreOf = (t) => (isBox(t) ? { x: t.x + t.w / 2, y: t.y + t.h / 2 } : { x: t.x, y: t.y });

/** Where a callout's box sits and where its leader lands (stage px). */
function calloutGeom(n) {
  const t = n.target, o = n.o, side = o.side ?? 'above', gap = o.gap ?? 40, c = centreOf(t);
  const hw = isBox(t) ? t.w / 2 : 0, hh = isBox(t) ? t.h / 2 : 0;
  const edge = { above: { x: c.x, y: c.y - hh }, below: { x: c.x, y: c.y + hh }, left: { x: c.x - hw, y: c.y }, right: { x: c.x + hw, y: c.y } }[side] ?? { x: c.x, y: c.y - hh };
  const at = o.at ?? { above: { x: edge.x, y: edge.y - gap }, below: { x: edge.x, y: edge.y + gap }, left: { x: edge.x - gap, y: edge.y }, right: { x: edge.x + gap, y: edge.y } }[side];
  const vertical = side === 'above' || side === 'below';
  let d;
  if (o.elbow && vertical) d = `M${f1(at.x)} ${f1(at.y)}V${f1((at.y + edge.y) / 2)}H${f1(edge.x)}V${f1(edge.y)}`;
  else if (o.elbow) d = `M${f1(at.x)} ${f1(at.y)}H${f1((at.x + edge.x) / 2)}V${f1(edge.y)}H${f1(edge.x)}`;
  else d = `M${f1(at.x)} ${f1(at.y)}L${f1(edge.x)} ${f1(edge.y)}`;
  return { side, at, edge, d };
}

/** The ring's ellipse round a target. */
function ringGeom(t, pad = 8) {
  if (isBox(t)) return { cx: t.x + t.w / 2, cy: t.y + t.h / 2, rx: t.w / 2 + pad, ry: t.h / 2 + pad };
  const r = (t.r ?? 18) + (t.r != null ? pad * 0.5 : 0);
  return { cx: t.x, cy: t.y, rx: r, ry: r };
}

// An ellipse as a path from its upper left, clockwise, a little past the start (a hand closes a ring that way).
function ringD({ cx, cy, rx, ry }) {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const a = -2.4 + (i / 40) * (Math.PI * 2 + 0.35);
    pts.push(`${f1(cx + Math.cos(a) * rx)} ${f1(cy + Math.sin(a) * ry)}`);
  }
  return `M${pts.join('L')}`;
}

const underRange = (r) => (isBox(r) ? { x1: r.x, x2: r.x + r.w, y: r.y + r.h + 3 } : r);

/** One stage of a mark's motion at elapsed e: { c: class suffix, s: style } that play the rest of it ({} when done). */
function motion(cls, dur, delay, e) {
  if (reducedMotion() || e >= delay + dur) return { c: '', s: '' };
  return { c: ` ${cls}`, s: `--sa-dur:${dur.toFixed(3)}s;--sa-delay:${(delay - e).toFixed(3)}s;` };
}
const sty = (m, rest = '') => ` style="${m.s}${rest}"`;

class Notes {
  constructor(o = {}) { this.max = o.max ?? 3; this.items = []; }

  _add(kind, key, target, o, text) {
    const k = String(o.key ?? key);
    const old = this.items.find((n) => n.key === k);
    if (old) { Object.assign(old, { target, o, text }); return old; }
    const n = { kind, key: k, target, o, text, t0: now() };
    this.items.push(n);
    while (this.items.length > this.max) this.items.shift();
    return n;
  }

  callout(target, text, o = {}) { return this._add('callout', `callout:${text}`, target, o, String(text ?? '')), this; }
  underline(range, o = {}) { const r = underRange(range); return this._add('underline', `underline:${Math.round(r.x1)}:${Math.round(r.y)}`, range, o), this; }
  highlight(range, o = {}) { return this._add('highlight', `highlight:${Math.round(range.x)}:${Math.round(range.y)}`, range, o), this; }
  ring(target, o = {}) { return this._add('ring', `ring:${Math.round(target.x)}:${Math.round(target.y)}`, target, o), this; }
  clear(key) { this.items = key == null ? [] : this.items.filter((n) => n.key !== String(key)); return this; }
  has(key) { return this.items.some((n) => n.key === String(key)); }

  _dur(n) {
    const L = lookOf();
    if (n.kind === 'callout') return LEAD_AT + (L.annotDraw ?? 0.24);
    if (n.kind === 'ring') return L.annotDraw ?? 0.24;
    return L.annotSweep ?? 0.3;
  }
  busy() { if (reducedMotion()) return false; const t = now(); return this.items.some((n) => t - n.t0 < this._dur(n)); }
  _old(n) { return n !== this.items[this.items.length - 1] ? ' sa-old' : ''; }

  /** Highlighter strokes: under the scene's own markup. */
  under() {
    const t = now(), L = lookOf();
    return this.items.filter((n) => n.kind === 'highlight').map((n) => {
      const r = n.target, m = motion('sa-sweep', L.annotSweep ?? 0.3, 0, t - n.t0);
      return `<g class="sa-mark${this._old(n)}"><rect class="sa-hl-r${m.c}" x="${f1(r.x - 3)}" y="${f1(r.y)}" width="${f1(r.w + 6)}" height="${f1(r.h)}" rx="2"${sty(m, 'fill:var(--sim-annot-tint)')}/></g>`;
    }).join('');
  }

  /** Leaders, underlines and rings: over the scene's markup. */
  svg() {
    const t = now(), L = lookOf(), draw = L.annotDraw ?? 0.24, sweep = L.annotSweep ?? 0.3;
    const line = 'fill:none;stroke:var(--sim-annot);stroke-linecap:round;stroke-linejoin:round';
    return this.items.map((n) => {
      const e = t - n.t0, old = this._old(n);
      if (n.kind === 'callout') {
        const g = calloutGeom(n), ml = motion('sa-draw', draw, LEAD_AT, e), md = motion('sa-fade', 0.1, LEAD_AT + draw - 0.04, e);
        return `<g class="sa-mark${old}"><path class="sa-lead${ml.c}" d="${g.d}" pathLength="1"${sty(ml, line + ';stroke-width:1.5')}/>`
          + `<circle class="sa-dot${md.c}" cx="${f1(g.edge.x)}" cy="${f1(g.edge.y)}" r="3"${sty(md, 'fill:var(--sim-annot)')}/></g>`;
      }
      if (n.kind === 'underline') {
        const r = underRange(n.target), m = motion('sa-draw', sweep, 0, e);
        return `<g class="sa-mark${old}"><path class="sa-ul-p${m.c}" d="M${f1(r.x1)} ${f1(r.y)}H${f1(r.x2)}" pathLength="1"${sty(m, line + ';stroke-width:' + (n.o.w ?? 2.5))}/></g>`;
      }
      if (n.kind === 'ring') {
        const m = motion('sa-draw', draw, 0, e);
        return `<g class="sa-mark${old}"><path class="sa-ring${m.c}" d="${ringD(ringGeom(n.target, n.o.pad))}" pathLength="1"${sty(m, line + ';stroke-width:2')}/></g>`;
      }
      return '';
    }).join('');
  }

  wrap(markup = '') { return this.under() + markup + this.svg(); }

  /** The callout boxes, HTML on the stage overlay. */
  over() {
    const t = now();
    return this.items.filter((n) => n.kind === 'callout').map((n) => {
      const g = calloutGeom(n), m = motion('sa-fade', BOX_S, 0, t - n.t0);
      const sub = n.o.sub ? '<span class="sa-box__s">' + esc(n.o.sub) + '</span>' : '';
      return `<span class="sa-box sa-box--${g.side}${this._old(n)}${m.c}"${sty(m, 'left:' + f1(g.at.x) + 'px;top:' + f1(g.at.y) + 'px')}><b class="sa-box__t">${esc(n.text)}</b>${sub}</span>`;
    }).join('');
  }

  /** Canvas: every mark at its point of motion (o.layer 'under': highlights only, before the scene's
   *  own text; 'over': the rest; none: all). Returns true while one still moves. */
  draw(ctx, c, o = {}) {
    const t = now(), L = lookOf(), still = reducedMotion();
    const draw = L.annotDraw ?? 0.24, sweep = L.annotSweep ?? 0.3;
    const ease = (u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
    const P = (e, delay, dur) => (still ? 1 : ease((e - delay) / dur));
    const col = c.annot ?? c.accent, tint = c.annotTint ?? 'transparent';
    let busy = false;
    for (const n of this.items) {
      if ((o.layer === 'under' && n.kind !== 'highlight') || (o.layer === 'over' && n.kind === 'highlight')) continue;
      const e = t - n.t0;
      if (!still && e < this._dur(n)) busy = true;
      ctx.save();
      ctx.globalAlpha *= this._old(n) ? 0.45 : 1;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (n.kind === 'highlight') {
        const r = n.target, p = P(e, 0, sweep);
        ctx.fillStyle = tint;
        ctx.fillRect(r.x - 3, r.y, (r.w + 6) * p, r.h);
      } else if (n.kind === 'underline') {
        const r = underRange(n.target), p = P(e, 0, sweep);
        ctx.lineWidth = n.o.w ?? 2.5;
        ctx.beginPath(); ctx.moveTo(r.x1, r.y); ctx.lineTo(r.x1 + (r.x2 - r.x1) * p, r.y); ctx.stroke();
      } else if (n.kind === 'ring') {
        const g = ringGeom(n.target, n.o.pad), p = P(e, 0, draw);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(g.cx, g.cy, g.rx, g.ry, 0, -2.4, -2.4 + (Math.PI * 2 + 0.35) * p); ctx.stroke();
      } else if (n.kind === 'callout') {
        const g = calloutGeom(n), pb = P(e, 0, BOX_S), pl = P(e, LEAD_AT, draw);
        // The leader: a straight or elbowed line from the box to the target, drawn to pl of its length.
        const pts = [[g.at.x, g.at.y]];
        for (const m of g.d.matchAll(/([MLHV])([-\d. ]+)/g)) {
          const v = m[2].trim().split(/\s+/).map(Number), last = pts[pts.length - 1];
          if (m[1] === 'L') pts.push([v[0], v[1]]); else if (m[1] === 'H') pts.push([v[0], last[1]]); else if (m[1] === 'V') pts.push([last[0], v[0]]);
        }
        const segs = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
        let left = segs.reduce((a, b) => a + b, 0) * pl;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length && left > 0; i++) {
          const s = segs[i - 1], k = Math.min(1, left / (s || 1));
          ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k);
          left -= s;
        }
        ctx.stroke();
        if (pl >= 1) { ctx.beginPath(); ctx.arc(g.edge.x, g.edge.y, 3, 0, Math.PI * 2); ctx.fill(); }
        // The box: heading in the signature colour, an optional muted line, on the tint over the surface.
        ctx.globalAlpha *= pb;
        const font = c.fontBody ?? 'sans-serif';
        ctx.font = `700 14px ${font}`;
        const head = n.text.toUpperCase();
        const wh = ctx.measureText(head).width;
        ctx.font = `500 14px ${font}`;
        const ws = n.o.sub ? ctx.measureText(n.o.sub).width : 0;
        const bw = Math.max(wh, ws) + 20, bh = n.o.sub ? 43 : 28;
        const bx = g.side === 'left' ? g.at.x - bw : g.side === 'right' ? g.at.x : g.at.x - bw / 2;
        const by = g.side === 'above' ? g.at.y - bh : g.side === 'below' ? g.at.y : g.at.y - bh / 2;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, bw, bh, 4); else ctx.rect(bx, by, bw, bh);
        ctx.fillStyle = c.bgSurface ?? 'transparent'; ctx.fill();
        ctx.fillStyle = tint; ctx.fill();
        ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        ctx.fillStyle = col; ctx.font = `700 14px ${font}`; ctx.fillText(head, bx + 10, by + 7);
        if (n.o.sub) { ctx.fillStyle = c.labelMuted ?? col; ctx.font = `500 14px ${font}`; ctx.fillText(n.o.sub, bx + 10, by + 23); }
      }
      ctx.restore();
    }
    return busy;
  }
}

/** An annotation set for an SVG or canvas scene (see the header). */
export function annotations(o = {}) { return new Notes(o); }

/**
 * Annotations on a DOM scene: targets are elements (or boxes in host px). host is made position: relative;
 * the layer sits over it. o: { max, scene (a DomSimulation: its injectStyle gets SIM_ANNOTATE_CSS) }.
 */
export function annotateDom(host, o = {}) {
  const set = new Notes(o);
  o.scene?.injectStyle?.(SIM_ANNOTATE_CSS);
  if (globalThis.getComputedStyle?.(host)?.position === 'static') host.style.position = 'relative';
  const layer = document.createElement('div');
  layer.className = 'sa-layer';
  layer.setAttribute('aria-hidden', 'true');
  host.appendChild(layer);
  const els = new Map();     // key -> element target
  const boxOf = (el) => {
    if (!el?.getBoundingClientRect) return el;
    const L = layer.getBoundingClientRect(), r = el.getBoundingClientRect();
    const k = L.width / (layer.offsetWidth || L.width || 1) || 1;
    return { x: (r.left - L.left) / k, y: (r.top - L.top) / k, w: r.width / k, h: r.height / k };
  };
  const paint = () => {
    for (const n of set.items) if (els.has(n.key)) n.target = boxOf(els.get(n.key));
    const W = layer.offsetWidth || 1, H = layer.offsetHeight || 1;
    layer.innerHTML = `<svg viewBox="0 0 ${W} ${H}">${set.svg()}</svg>${set.over()}`;
  };
  const sweep = (cls) => (el, oo = {}) => {
    if (!el?.classList || el.classList.contains(cls)) return api;
    const L = lookOf();
    el.style.setProperty('--sa-dur', `${L.annotSweep ?? 0.3}s`);
    el.classList.add(cls);
    return api;
  };
  const api = {
    callout(el, text, oo = {}) { const n = set._add('callout', oo.key ?? `callout:${text}`, boxOf(el), oo, String(text ?? '')); els.set(n.key, el); paint(); return api; },
    ring(el, oo = {}) { const b = boxOf(el); const n = set._add('ring', oo.key ?? `ring:${Math.round(b.x)}:${Math.round(b.y)}`, b, oo); els.set(n.key, el); paint(); return api; },
    highlight: sweep('sa-hl'),
    underline: sweep('sa-ul'),
    clear(key) {
      set.clear(key);
      if (key == null) for (const e of host.querySelectorAll('.sa-hl, .sa-ul')) e.classList.remove('sa-hl', 'sa-ul');
      paint();
      return api;
    },
    refresh() { paint(); return api; },
    destroy() { layer.remove(); },
    get items() { return set.items; },
  };
  return api;
}
