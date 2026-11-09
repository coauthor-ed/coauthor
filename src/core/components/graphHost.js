import { html } from 'lit';
import { GraphPlotter } from './GraphPlotter.js';
import { evaluateManyWithTimeout } from '../mathEvaluatorWorker.js';
import { EventBus } from '../EventBus.js';

/**
 * graphHost — mount/render helpers for a read-only companion graph
 * (`data.graph`) on a question — the static-plot counterpart to
 * simulationHost.js's mountQuestionSimulation()/renderSimCard(). Shown
 * immediately alongside the stem (never reveal-gated, unlike a companion
 * `simulation`'s default `role: "explanation"`) — a "read this graph, then
 * answer" question needs the graph visible while the student is still
 * answering, not only after.
 *
 * `graph` shape:
 *   {
 *     functions?: [{ expression, label?, color?, fill? }],  // mathjs expression in `x`
 *       ... or { points: [[x, y], ...], label?, color?, fill? }   // straight segments through these vertices (a piecewise-linear F(x), a v-t graph from a table) - no expression needed
 *       fill?: true | [x0, x1]  // shade between the curve and y = 0 (area = work, displacement...); [x0, x1] shades only that stretch
 *     points?: [{ x, y, label? }],                    // discrete points, plotted as a scatter series — a point's own `label` (e.g. "A", "P(3, 4)") draws next to its dot, for a plain coordinate-geometry question (no `functions`) that names its points, same idea as `diagram.points[].label`
 *     xDomain: [min, max], yDomain: [min, max],
 *     xLabel?, yLabel?, showGrid?, a11yCaption?,
 *     xStep?, yStep?,                                 // tick spacing, e.g. 1 (m) and 10 (N); default d3's heuristic
 *     position?: 'right'|'left'|'above'|'below',      // default 'right', same convention as image/simulation
 *   }
 *
 * Deliberately NOT shared plumbing with plot-function@1's own (interactive,
 * far more involved) mounting code — same "smaller, purpose-built subset"
 * relationship simulationHost.js already has with content-block.js's own
 * beat-aware simulation mounting.
 */

/**
 * One `graph.functions[]` item as a GraphPlotter line series (bare curve, no
 * per-sample dots), or null if its expression fails to evaluate. Shared with
 * stepFigureHost.js's slide graph so both accept the same item shape.
 * `points` items skip the evaluator: straight segments through the vertices.
 * 240 samples keep a kink in a piecewise expression (min(), max(), abs())
 * from visibly rounding off between samples.
 * @returns {Promise<object|null>}
 */
export async function functionSeries(fn, xDomain) {
  const base = { label: fn.label || fn.expression || 'line', color: fn.color || 'primary', type: 'line', dots: false, ...(fn.fill ? { fill: fn.fill } : {}) };
  if (Array.isArray(fn.points)) {
    const points = fn.points.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    return points.length > 1 ? { ...base, points } : null;
  }
  const [xMin, xMax] = xDomain || [0, 10];
  const samples = 240;
  const step = (xMax - xMin) / samples;
  const scopes = Array.from({ length: samples + 1 }, (_, i) => ({ x: xMin + i * step }));
  const result = await evaluateManyWithTimeout(fn.expression, scopes, 1000);
  if (!result.ok) return null;
  return { ...base, points: scopes.map((s, i) => ({ x: s.x, y: result.values[i] })).filter((p) => p.y !== null) };
}

/**
 * @param {HTMLElement} hostEl empty container the graph should mount into
 * @param {object} graph
 * @returns {Promise<{ svgEl: SVGElement, destroy: () => void }>}
 */
export async function mountQuestionGraph(hostEl, graph) {
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  hostEl.appendChild(svgEl);

  const series = [];
  for (const fn of graph.functions || []) {
    const s = await functionSeries(fn, graph.xDomain);
    if (s) series.push(s);
  }
  if (graph.points?.length) {
    series.push({ label: 'points', color: 'muted', type: 'scatter', points: graph.points });
  }

  const config = {
    type: 'line',
    xLabel: graph.xLabel || 'x',
    yLabel: graph.yLabel || 'y',
    xDomain: graph.xDomain,
    yDomain: graph.yDomain,
    showGrid: graph.showGrid !== false,
    xStep: graph.xStep, yStep: graph.yStep,
    series,
    a11yCaption: graph.a11yCaption,
  };
  await GraphPlotter.plot(svgEl, config);

  // GraphPlotter.plot() resolves series/grid/axis colors from theme tokens
  // via getComputedStyle() once, at draw time (see its own resolveColor()/
  // themeColor() doc comments) — those land as plain SVG attribute values,
  // not live CSS custom-property references, so a light/dark toggle doesn't
  // repaint them on its own. Subscribing to ThemeManager's 'theme:changed'
  // and replotting with the SAME already-computed `series`/config (cheap —
  // no re-evaluating `functions` expressions, just fresh color resolution)
  // is what keeps a mounted graph legible after a toggle without a page
  // refresh — same pattern diagramHost.js's mountQuestionDiagram() already
  // uses for its own companion figure. `destroy()` unsubscribes — the
  // caller must invoke it from its own disconnectedCallback (mirrors
  // mountQuestionDiagram()'s identical contract), or this listener leaks
  // for the life of the page across every question navigation.
  const onThemeChanged = () => GraphPlotter.plot(svgEl, config);
  EventBus.on('theme:changed', onThemeChanged);
  return { svgEl, destroy: () => EventBus.off('theme:changed', onThemeChanged) };
}

/**
 * The wrapping card shown around a mounted companion graph — mirrors
 * simulationHost.js's renderSimCard() shape/class names (`.q-graph-card`,
 * `.q-graph-host-container`), so every consumer's `static styles` needs the
 * same rules simulationHost.js's own doc comment already documents for
 * `.q-sim-card`/`.q-sim-host-container`, just under the `-graph-` class
 * names instead:
 *
 *   .q-graph-card { margin-top: 1.25rem; padding: 16px 18px; background: var(--bg-surface); border-radius: 16px; border: 2px solid var(--border-color); box-shadow: 0 3px 0 var(--border-color); }
 *   .q-graph-host-container { width: 100%; max-width: 640px; margin: 0 auto; aspect-ratio: 4/3; }
 *   .q-graph-host-container svg { width: 100%; height: 100%; display: block; }
 *   .cb-layout-right .q-graph-card, .cb-layout-left .q-graph-card { flex: 1.5 1 55%; max-width: 60%; margin-top: 0; }
 *
 * The `<div id="${hostId}">` this function renders (below) sits one level
 * INSIDE `.q-graph-host-container` — a plain `<div>` never inherits an
 * ancestor's `aspect-ratio`-computed height on its own, so without a FOURTH
 * rule (`.q-graph-host-container > div { width: 100%; height: 100%; }`) the
 * svg's own `height: 100%` above resolves against nothing and silently
 * falls back to SVG's 150px intrinsic default regardless of width — a
 * squashed, far-too-narrow-looking plot, not an error. This one shipped
 * once already; don't drop it from a new consumer's styles.
 */
export function renderGraphCard({ hostId }) {
  return html`
    <div class="q-graph-card">
      <div class="q-graph-host-container">
        <div id="${hostId}"></div>
      </div>
    </div>
  `;
}
