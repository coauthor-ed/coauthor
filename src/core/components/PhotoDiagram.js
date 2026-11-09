import { CourseSourceManager } from '../CourseSourceManager.js';

/**
 * PhotoDiagram — declarative renderer for a static relationship diagram
 * built from real, license-recorded photos (a food web, a "one broad name
 * hides several species" comparison, a historical event chain) - the
 * photo-node counterpart to GeometryDiagram.js's synthetic-geometry points,
 * for content a sequence of single `reveal.images` can't express because
 * several photos need to be visible *at once* with labelled connections
 * between them. See `docs/simulation-authoring.md`'s "The `CONTROLS: []`
 * smell" section for when to reach for this instead of a `DomSimulation`
 * scene: there is no interactivity here, only a fixed, engine-drawn layout
 * - the same "author writes JSON, engine draws it" trade GeometryDiagram
 * already makes for synthetic figures.
 *
 * Same coordinate contract as GeometryDiagram: the author places every
 * node's (x, y) directly in arbitrary units (y increasing downward), no
 * auto-layout/constraint solving - same reasoning as that file's own header
 * comment (predictable, hand-composed figures, not a general graph-layout
 * engine). `viewBox` auto-fits to the node bounding box plus padding unless
 * given explicitly.
 *
 * Unlike GeometryDiagram this is NOT pure SVG: a photo node needs a real
 * `<img>` (screen-reader-navigable alt text, `loading="lazy"`, the browser's
 * own image cache/decoding - none of which an SVG `<image>` gives you for
 * free). So this renders real DOM nodes absolutely-positioned (by
 * percentage, so they scale with the container with no ResizeObserver
 * needed) over a same-viewBox `<svg>` underlay that draws the connecting
 * lines/arrows - the same "DOM content over a drawn layer" split
 * `docs/simulation-authoring.md` §4 recommends for a DomSimulation's own
 * canvas+label hybrid, just SVG instead of canvas for the drawn layer.
 *
 * config shape:
 *   {
 *     nodes: [
 *       { id, x, y, kind: 'photo', src, alt, label?, tone?: 1-6,
 *         shape?: 'circle'|'square', size?: number } |
 *       { id, x, y, kind: 'label', label, icon?: string, tone?: 1-6 }
 *     ],
 *     edges: [
 *       { from, to, label?, style?: 'arrow'|'line'|'doubleArrow', tone?: 1-6 }
 *     ],
 *     viewBox?: [x, y, w, h],
 *     a11yCaption: string,
 *   }
 *
 * `nodes[].id` is a local handle referenced by `edges[].from/to` - never
 * drawn itself. `tone` (1-6) picks one of `theme.css`'s closed
 * `--content-series-1..6` categorical tokens - give distinguishable nodes
 * different tones (the pedagogical point, in the case this was built for:
 * four species ARE different, so their cards read as different colors).
 * `size` is in the same arbitrary units as `x`/`y` (default 90) - the
 * node's on-screen diameter/side length is this converted to a percentage
 * of the viewBox width, so it scales consistently with everything else.
 *
 * `edges[].style`: `'arrow'` (default) draws an arrowhead at `to`,
 * `'doubleArrow'` at both ends, `'line'` draws neither (a plain connector,
 * e.g. a family-tree "branches into" line with no directional claim).
 *
 * `a11yCaption` is REQUIRED (unlike GeometryDiagram's optional one) - a
 * photo diagram's relationships (who connects to whom, and how) are exactly
 * the information a screen reader's per-image alt text can't convey on its
 * own; this is the one place that structure gets written down in words.
 *
 * Progressive reveal: a node or edge may carry `revealAt` (a 0-indexed beat
 * number, same convention as `mediaStep` - cumulative/sticky, NOT
 * `reveal.images`'s per-step-id swap, which turned out to revert to the
 * base image on any step with no matching id - see GENERATION-LOG.md).
 * Defaults to 0 (visible as soon as the block's own `mediaStep` gate
 * opens). `plot()`'s `currentStep` argument only draws nodes/edges whose
 * `revealAt <= currentStep`, and - just as important for legibility - the
 * auto-fit `viewBox` is computed from only THOSE nodes, not the full
 * config: an early beat with few nodes gets a tight crop (each photo
 * renders large), and the diagram visibly grows as later beats reveal
 * more, rather than every beat sharing one canvas sized for the eventual
 * full diagram (which is what made the first version of this feature's
 * photos too small to read - see docs/photo-diagrams.md). An explicit
 * `config.viewBox` always overrides this regardless of `currentStep`.
 */

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4.3" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></g>',
  leaf: '<path fill="currentColor" d="M20 4C11 4 4 11 4 20c9 0 16-7 16-16z"/>',
  soil: '<path fill="currentColor" d="M3 16.4h18v2H3zM3.6 12.6c2-1 3.8-1 5.8 0s3.8 1 5.8 0 3.8-1 5.4 0v2.4H3.6z"/>',
  question: '<path fill="currentColor" d="M12 17.6a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7zM12 4c2.6 0 4.8 1.9 4.8 4.3 0 1.9-1.2 2.9-2.2 3.7-.9.7-1.5 1.2-1.5 2.3h-2c0-1.8 1-2.6 2-3.4.8-.6 1.7-1.3 1.7-2.6 0-1.4-1.2-2.3-2.8-2.3s-2.8.9-2.8 2.3H7.2C7.2 5.9 9.4 4 12 4z"/>',
  fruit: '<circle cx="12" cy="14" r="6.5" fill="currentColor"/><path stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" d="M12 7.5c0-2.2 1.1-3.7 2.8-4.6"/>',
  nest: '<path fill="currentColor" d="M12 2.5 6.5 12h3l-3.6 6.2H9V21h6v-2.8h3.1L14.5 12h3z"/>',
};

function themeColor(el, varName, fallback) {
  return getComputedStyle(el).getPropertyValue(varName).trim() || fallback;
}

function toneVar(tone) {
  const n = Number.isInteger(tone) && tone >= 1 && tone <= 6 ? tone : 1;
  return `var(--content-series-${n})`;
}

function visibleAt(item, currentStep) {
  return (item.revealAt ?? 0) <= currentStep;
}

function computeViewBox(nodes) {
  const xs = [];
  const ys = [];
  for (const n of nodes || []) {
    const half = (n.size ?? 90) / 2;
    xs.push(n.x - half, n.x + half);
    ys.push(n.y - half, n.y + half);
  }
  if (!xs.length) return [0, 0, 400, 300];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const pad = Math.max(w, h) * 0.1 + 24;
  return [minX - pad, minY - pad, w + pad * 2, h + pad * 2];
}

const NS = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function edgeArrowHead(x, y, angle, color) {
  const size = 11;
  const a1 = angle + Math.PI * (150 / 180);
  const a2 = angle - Math.PI * (150 / 180);
  const p1 = { x: x + size * Math.cos(a1), y: y + size * Math.sin(a1) };
  const p2 = { x: x + size * Math.cos(a2), y: y + size * Math.sin(a2) };
  return svgEl('polygon', { points: `${x},${y} ${p1.x},${p1.y} ${p2.x},${p2.y}`, fill: color });
}

export const PhotoDiagram = {
  /** Exposed so a host (e.g. content-block.js's `_resolvePhotoDiagramLayout()`)
   *  can get the design aspect ratio synchronously - no scene module to
   *  dynamically import first, unlike `simulation.src`, since the whole
   *  config is already plain JSON at hand. `currentStep` (default: show
   *  everything, for a caller with no beat concept) restricts the fit to
   *  only the nodes revealed by that beat - see the file header's
   *  "Progressive reveal" section for why this must match `plot()`'s own
   *  filtering, not just draw everything at a fixed size. */
  resolveViewBox(config, currentStep = Infinity) {
    if (config.viewBox) return config.viewBox;
    const visibleNodes = (config.nodes || []).filter((n) => visibleAt(n, currentStep));
    return computeViewBox(visibleNodes.length ? visibleNodes : config.nodes || []);
  },

  /**
   * @param {HTMLElement} hostEl empty container to draw into - cleared first
   *   (same idempotent redraw contract as GeometryDiagram.plot()).
   * @param {object} config see file header
   * @param {string|null} bundleId resolves each photo node's bundle-relative
   *   `src` via CourseSourceManager, same convention `image.src`/
   *   `simulation.src` already use.
   * @param {number} currentStep 0-indexed beat (default: show everything -
   *   a caller outside content-block.js's own beat loop, e.g. a future
   *   question use, has no beats to gate on). See the file header's
   *   "Progressive reveal" section.
   */
  plot(hostEl, config, bundleId = null, currentStep = Infinity) {
    while (hostEl.firstChild) hostEl.removeChild(hostEl.firstChild);
    const allNodes = config.nodes || [];
    const allEdges = config.edges || [];
    const nodes = allNodes.filter((n) => visibleAt(n, currentStep));
    const visibleIds = new Set(nodes.map((n) => n.id));
    // An edge only draws once BOTH its endpoints are visible, even if its
    // own `revealAt` (or the default 0) would otherwise allow it earlier -
    // an arrow pointing at a photo that isn't on screen yet is a bug, not a
    // diagram. An edge's own `revealAt`, if given, can still delay it
    // *further* past that point (e.g. show two nodes a beat before drawing
    // the relationship between them).
    const edges = allEdges.filter((e) => visibleAt(e, currentStep) && visibleIds.has(e.from) && visibleIds.has(e.to));
    const [vx, vy, vw, vh] = PhotoDiagram.resolveViewBox(config, currentStep);
    const ink = themeColor(hostEl, '--text-main', '#0f172a');
    const line = themeColor(hostEl, '--text-muted', '#334155');
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const canvas = document.createElement('div');
    canvas.className = 'pd-canvas';
    // line-height:normal overrides .sim-host-container's own `line-height: 0`
    // (set there to collapse whitespace around a bare <canvas>) — this
    // container has real text (node/edge labels) as direct DOM content, not
    // a canvas, and would otherwise render every label collapsed to zero
    // height. role="group", not "img": an img role would flatten this
    // entire subtree into one opaque unit for a screen reader, hiding every
    // photo node's own per-photo `alt` text - the individually-navigable
    // photos are the accessibility win this renderer exists to keep, an
    // img role would throw that away.
    canvas.style.cssText = `position:relative; width:100%; aspect-ratio:${vw}/${vh}; line-height:normal;`;
    canvas.setAttribute('role', 'group');
    if (config.a11yCaption) canvas.setAttribute('aria-label', config.a11yCaption);

    // hostEl is fully cleared above on every plot() call, so re-inserting
    // this on every redraw (rather than once) never accumulates duplicates
    // - same "cheap enough to just redo" reasoning as everything else here.
    // Each keyframe re-states translate(-50%,-50%) alongside the pop's own
    // scale/translateY - a CSS animation's `transform` keyframes replace the
    // element's inline `transform` entirely for as long as the animation
    // applies (and, with `both`, past its end too), not layer on top of it.
    // Without this, the wrap's own centering transform (set inline below,
    // needed because `left`/`top` are the node's CENTER, not corner) is
    // silently lost for exactly the node(s) revealed on the current beat -
    // they render top-left-anchored at their (left%, top%) point instead of
    // centered on it, which reads as "shifted down-right and clipped against
    // the panel edge" (caught by measuring a freshly-revealed node's actual
    // rect, not by reading the CSS - see GENERATION-LOG.md).
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pd-pop { 0% { transform: translate(-50%,-50%) scale(.55) translateY(8px); opacity: 0; } 70% { transform: translate(-50%,-50%) scale(1.07); opacity: 1; } 100% { transform: translate(-50%,-50%) scale(1) translateY(0); } }
      .pd-node--enter { animation: pd-pop 420ms cubic-bezier(.34,1.56,.64,1) both; }
    `;
    canvas.appendChild(style);

    const svg = svgEl('svg', {
      viewBox: `${vx} ${vy} ${vw} ${vh}`,
      preserveAspectRatio: 'none',
      style: 'position:absolute; inset:0; width:100%; height:100%; overflow:visible;',
      'aria-hidden': 'true',
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const e of edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      const color = e.tone ? toneVar(e.tone) : line;
      const style = e.style || 'arrow';
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      // Stop the line short of each node's own radius so an arrowhead lands
      // at the card's edge, not buried under it.
      const aR = (a.size ?? 90) / 2 + 4;
      const bR = (b.size ?? 90) / 2 + 4;
      const p1 = { x: a.x + ux * aR, y: a.y + uy * aR };
      const p2 = { x: b.x - ux * bR, y: b.y - uy * bR };
      svg.appendChild(svgEl('line', {
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: color, 'stroke-width': 3.5,
      }));
      const angle = Math.atan2(dy, dx);
      if (style === 'arrow' || style === 'doubleArrow') svg.appendChild(edgeArrowHead(p2.x, p2.y, angle, color));
      if (style === 'doubleArrow') svg.appendChild(edgeArrowHead(p1.x, p1.y, angle + Math.PI, color));
      if (e.label) {
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const perp = { x: -uy, y: ux };
        const t = svgEl('text', {
          x: mid.x + perp.x * 16, y: mid.y + perp.y * 16, 'font-size': 13, fill: color,
          'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-weight': 700,
        });
        t.textContent = e.label;
        svg.appendChild(t);
      }
    }
    canvas.appendChild(svg);

    for (const n of nodes) {
      const half = (n.size ?? 90) / 2;
      const leftPct = ((n.x - vx) / vw) * 100;
      const topPct = ((n.y - vy) / vh) * 100;
      const sizePct = (half * 2 / vw) * 100;
      const wrap = document.createElement('div');
      // A node exactly AT the current step's threshold just became visible
      // this render - not one already showing from an earlier beat, which
      // would replay the animation on every unrelated re-render otherwise.
      const justRevealed = !reduced && (n.revealAt ?? 0) === currentStep;
      wrap.className = `pd-node${justRevealed ? ' pd-node--enter' : ''}`;
      // A photo node's wrap gets a DEFINITE width (sizePct% of the canvas,
      // which itself has a definite width - see canvas.style.cssText
      // above), not width:max-content: a descendant's own `width:X%` only
      // resolves reliably against a containing block that itself has a
      // definite size - CSS percentages inside an auto/max-content-sized
      // parent are indefinite and browsers commonly collapse them toward
      // the content's intrinsic size instead, which is what silently made
      // every photo ring render far smaller than its computed sizePct
      // (caught by measuring the actual rendered pixel width, not by
      // reading the CSS). A label node has no percentage-sized descendant
      // (the chip is just its own text content), so max-content is fine,
      // and correct: it should size to its label text, not a photo's `size`.
      // max-width/min-width only apply to a photo wrap (clamping the ring's
      // own size) - a label wrap must stay free to size to its own text
      // (e.g. "'Hornbill' - one broad entry" is far wider than 220px), so
      // clamping it the same way would clip or overflow the pill.
      const wrapSizing = n.kind === 'photo'
        ? `width:${sizePct}%; max-width:220px; min-width:44px;`
        : 'width:max-content;';
      wrap.style.cssText = `position:absolute; left:${leftPct}%; top:${topPct}%; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:6px; ${wrapSizing}`;

      if (n.kind === 'photo') {
        const ring = document.createElement('div');
        const shapeRadius = n.shape === 'square' ? '22%' : '50%';
        // 100% of wrap, which now has the definite width doing the actual
        // sizing (see wrap.style.cssText above) - not its own percentage.
        ring.style.cssText = `width:100%; aspect-ratio:1; border-radius:${shapeRadius}; padding:3px; background:${toneVar(n.tone)}; box-shadow:0 3px 8px rgba(0,0,0,.25); overflow:hidden;`;
        const img = document.createElement('img');
        img.src = CourseSourceManager.resolveRef(n.src, bundleId);
        img.alt = n.alt || n.label || '';
        img.loading = 'lazy';
        img.style.cssText = `width:100%; height:100%; border-radius:${shapeRadius}; object-fit:cover; display:block; background:var(--bg-panel);`;
        ring.appendChild(img);
        wrap.appendChild(ring);
      } else {
        const chip = document.createElement('div');
        chip.style.cssText = `display:flex; align-items:center; gap:5px; padding:5px 10px; border-radius:999px; background:var(--bg-panel); border:1px solid var(--border-color); font-size:12px; font-weight: var(--fw-strong); color:${ink}; white-space:nowrap;`;
        if (n.icon && ICONS[n.icon]) {
          const iconWrap = document.createElement('span');
          iconWrap.style.cssText = `display:inline-flex; width:16px; height:16px; color:${n.tone ? toneVar(n.tone) : ink};`;
          iconWrap.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">${ICONS[n.icon]}</svg>`;
          chip.appendChild(iconWrap);
        }
        const text = document.createElement('span');
        text.textContent = n.label || '';
        chip.appendChild(text);
        wrap.appendChild(chip);
      }

      if (n.kind === 'photo' && n.label) {
        const label = document.createElement('span');
        label.style.cssText = `font-size:13px; font-weight: var(--fw-strong); text-align:center; color:${ink}; line-height:1.2;`;
        label.textContent = n.label;
        wrap.appendChild(label);
      }
      canvas.appendChild(wrap);
    }

    hostEl.appendChild(canvas);
  },
};
