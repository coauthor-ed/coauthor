import { GeometryDiagram } from './GeometryDiagram.js';
import { GraphPlotter } from './GraphPlotter.js';
import { functionSeries } from './graphHost.js';
import { EventBus } from '../EventBus.js';

/**
 * stepFigureHost - mounts a `graph` (GraphPlotter) or `diagram`
 * (GeometryDiagram) companion on content-block@1 and re-plots it per beat.
 * Same JSON shapes as the question companions (graphHost.js / diagramHost.js),
 * plus an optional `revealAt` (0-indexed beat) on:
 *   graph:   functions[], points[]
 *   diagram: points[], segments[], polygons[], angles[], rightAngles[],
 *            parallelMarks[], circles[]
 * An item appears from its beat on (sticky), like photoDiagram's revealAt.
 * The frame never jumps between beats: a diagram's viewBox comes from the
 * FULL figure, a graph's y-range from every series. Anything that names a
 * point not yet revealed stays hidden too. Theme changes re-plot (colours are
 * resolved at draw time), same contract as the other hosts: call destroy().
 */

const shown = (item, step) => !(Number.isInteger(item?.revealAt) && item.revealAt > step);
// Narration focus (spec W1 D29n; content-block _narrFocusAt): an item with an
// `id` that a show.<id> cue has not reached yet stays hidden like a later
// revealAt; with focus on, the named series are drawn bolder and the rest
// fade (graph only). Never set in text mode.
const NARR_OFF = { narrated: false, on: [], held: [] };
const notHeld = (item, narr) => !(narr.narrated && item?.id != null && narr.held.includes(String(item.id)));

function diagramAt(diagram, step, viewBox) {
  const pts = (diagram.points || []).filter((p) => shown(p, step));
  const ids = new Set(pts.map((p) => p.id));
  const circlesAll = diagram.circles || [];
  const circles = circlesAll.filter((c) => shown(c, step) && (!c.center || ids.has(c.center)) && (!c.through || ids.has(c.through)));
  const circleIds = new Set(circles.map((c) => c.id).filter(Boolean));
  const points = pts.filter((p) => !p.onCircle || circleIds.has(p.onCircle));
  const ok = new Set(points.map((p) => p.id));
  const has = (...keys) => keys.every((k) => k == null || ok.has(k));
  const keep = (list, refs) => (list || []).filter((x) => shown(x, step) && has(...refs(x)));
  return {
    ...diagram, viewBox, points, circles,
    segments: keep(diagram.segments, (s) => [s.from, s.to]),
    polygons: keep(diagram.polygons, (p) => p.points || []),
    angles: keep(diagram.angles, (a) => [a.at, a.from, a.to]),
    rightAngles: keep(diagram.rightAngles, (a) => [a.at, a.from, a.to]),
    parallelMarks: keep(diagram.parallelMarks, (m) => [m.from, m.to]),
  };
}

/** @returns {{ setStep(step): void, destroy(): void }} */
export function mountStepDiagram(hostEl, diagram, initialStep = 0) {
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  hostEl.appendChild(svgEl);
  // The full figure fixes the frame once.
  GeometryDiagram.plot(svgEl, diagram);
  const viewBox = diagram.viewBox || (svgEl.getAttribute('viewBox') || '0 0 100 100').split(/\s+/).map(Number);
  let step = initialStep;
  let narr = NARR_OFF;
  const plot = () => GeometryDiagram.plot(svgEl, diagramAt(narr.narrated && narr.held.length
    ? Object.fromEntries(Object.entries(diagram).map(([k, v]) => [k, Array.isArray(v) ? v.filter((x) => notHeld(x, narr)) : v]))
    : diagram, step, viewBox));
  plot();
  EventBus.on('theme:changed', plot);
  return {
    viewBox,
    setStep(s) { if (s !== step) { step = s; plot(); } },
    narrationFocus(st = {}) {
      const next = { narrated: !!st.narrated, on: (st.on || []).map(String), held: (st.held || []).map(String) };
      if (JSON.stringify(next) === JSON.stringify(narr)) return;
      narr = next;
      plot();
    },
    destroy() { EventBus.off('theme:changed', plot); },
  };
}

/** @returns {Promise<{ setStep(step): void, destroy(): void }>} */
export async function mountStepGraph(hostEl, graph, initialStep = 0) {
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  hostEl.appendChild(svgEl);
  const series = [];
  for (const fn of graph.functions || []) {
    const s = await functionSeries(fn, graph.xDomain);
    if (s) series.push({ revealAt: fn.revealAt, id: fn.id, ...s });
  }
  const allPts = [...series.flatMap((s) => s.points), ...(graph.points || [])];
  const ys = allPts.map((p) => p.y).filter(Number.isFinite);
  const yDomain = graph.yDomain || (ys.length ? [Math.min(0, ...ys), Math.max(...ys) * 1.05 || 1] : undefined);
  let step = initialStep;
  let narr = NARR_OFF;
  const plot = () => {
    const focus = narr.narrated && narr.on.length ? new Set(narr.on) : null;
    const look = (id) => (!focus ? {} : focus.has(String(id)) ? { emph: true } : { opacity: 0.3 });
    const now = series.filter((s) => shown(s, step) && notHeld(s, narr)).map(({ revealAt, id, ...s }) => ({ ...s, ...look(id) }));
    const pts = (graph.points || []).filter((p) => shown(p, step) && notHeld(p, narr));
    // The points are what a graph slide is about (the cases against the usual
    // curve): the primary colour (plain: the signature), unless the author named one.
    if (pts.length) {
      const lit = focus && (focus.has('points') || pts.some((p) => p.id != null && focus.has(String(p.id))));
      now.push({ label: 'points', color: graph.pointsColor || 'primary', type: 'scatter', points: pts, ...(focus ? (lit ? { emph: true } : { opacity: 0.3 }) : {}) });
    }
    return GraphPlotter.plot(svgEl, {
      editorial: document.documentElement.dataset.look === 'plain',
      type: 'line', xLabel: graph.xLabel || 'x', yLabel: graph.yLabel || 'y', xDomain: graph.xDomain, yDomain,
      showGrid: graph.showGrid !== false, xStep: graph.xStep, yStep: graph.yStep, series: now, a11yCaption: graph.a11yCaption,
    });
  };
  await plot();
  const onTheme = () => { plot(); };
  EventBus.on('theme:changed', onTheme);
  return {
    setStep(s) { if (s !== step) { step = s; plot(); } },
    narrationFocus(st = {}) {
      const next = { narrated: !!st.narrated, on: (st.on || []).map(String), held: (st.held || []).map(String) };
      if (JSON.stringify(next) === JSON.stringify(narr)) return;
      narr = next;
      plot();
    },
    destroy() { EventBus.off('theme:changed', onTheme); },
  };
}
