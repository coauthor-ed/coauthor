import { html } from 'lit';
import { GeometryDiagram } from './GeometryDiagram.js';
import { EventBus } from '../EventBus.js';

/**
 * diagramHost — mount/render helpers for a read-only companion geometry
 * figure (`data.diagram`) on a question — the synthetic-geometry
 * counterpart to graphHost.js's mountQuestionGraph()/renderGraphCard()
 * (itself modeled on simulationHost.js's mountQuestionSimulation()/
 * renderSimCard()). Shown immediately alongside the stem, never
 * reveal-gated — a "read this figure, then answer" question needs it
 * visible while the student is still working, same reasoning as the
 * companion graph.
 *
 * See GeometryDiagram.js's own header comment for the full `diagram` shape.
 * Deliberately synchronous under the hood (no vendor to lazy-load) — kept
 * as an async function anyway so it's a drop-in alongside
 * mountQuestionGraph() at every QuestionBase call site.
 *
 * GeometryDiagram.plot() resolves its ink/line colors from `--text-main`/
 * `--border-color` via getComputedStyle() once, at draw time (same
 * ThemeManager token pattern GraphPlotter/every simulation's own
 * `_reloadColors()` reads) — those are plain SVG attribute values once
 * drawn, not live CSS custom-property references, so they don't update on
 * their own when the student flips light/dark mode. Subscribing to
 * ThemeManager's `theme:changed` (emitted by ThemeManager.js on every
 * toggle, the same event SimulationBase's own `_themeHandler` listens for)
 * and replotting is what keeps a mounted diagram legible after a toggle
 * without needing a page refresh. `destroy()` unsubscribes — the caller
 * must invoke it from its own `disconnectedCallback` (mirrors
 * SimulationBase's `stop()`), or this listener (and its closure over
 * `svgEl`/`diagram`) leaks for the life of the page across every question
 * navigation.
 */

/**
 * @param {HTMLElement} hostEl empty container the diagram should mount into
 * @param {object} diagram
 * @returns {Promise<{ svgEl: SVGElement, destroy: () => void }>}
 */
export async function mountQuestionDiagram(hostEl, diagram) {
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  hostEl.appendChild(svgEl);
  GeometryDiagram.plot(svgEl, diagram);
  const onThemeChanged = () => GeometryDiagram.plot(svgEl, diagram);
  EventBus.on('theme:changed', onThemeChanged);
  return { svgEl, destroy: () => EventBus.off('theme:changed', onThemeChanged) };
}

/**
 * The wrapping card shown around a mounted companion diagram — same
 * `.q-graph-card`/`.q-graph-host-container` sibling class names as
 * graphHost.js's renderGraphCard() (`.q-diagram-*` here), including the
 * same load-bearing `> div { width/height: 100% }` rule its own doc
 * comment explains (a plain host <div> doesn't inherit an aspect-ratio'd
 * ancestor's computed height on its own — without that rule the svg's own
 * height:100% resolves against nothing and silently falls back to SVG's
 * 150px intrinsic default). See QuestionBase.js's `static styles` for the
 * actual rules (`.q-diagram-card` etc.) — this only renders the markup.
 */
export function renderDiagramCard({ hostId }) {
  return html`
    <div class="q-diagram-card">
      <div class="q-diagram-host-container">
        <div id="${hostId}"></div>
      </div>
    </div>
  `;
}
