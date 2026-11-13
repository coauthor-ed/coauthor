/**
 * GraphPlotter — declarative wrapper around D3.js (lazy-loaded).
 *
 * Provides a minimal, consistent API so every chart-containing plugin
 * produces accessible charts with a consistent look and text-table fallback
 * for screen readers (HLD §12, Appendix C.4).
 *
 * Usage (read-only):
 *   import { GraphPlotter } from 'core/components/GraphPlotter.js';
 *   await GraphPlotter.plot(svgEl, config);
 *
 * Usage (interactive — click to place points, drag to move them):
 *   const handle = await GraphPlotter.plot(svgEl, { ...config, interactive: { enabled: true, onChange } });
 *   handle.getPoints() / handle.setPoints(points) / handle.clear()
 *
 * config shape:
 *   {
 *     type: 'line' | 'bar' | 'scatter',
 *     xLabel: string, yLabel: string,
 *     series: [{ label, color, points: [{x, y, label?}], type? }], // series[].type overrides the chart-level `type` for just that series; a point's own `label` (e.g. "A") draws next to its dot — distinct from the series' own `label` (one legend entry for the whole series)
 *       series[].dots?: boolean      // default true; false draws a 'line' series as a bare curve (sampled functions)
 *       series[].fill?: true | [x0, x1] // shade between the curve and y = 0 (whole curve, or only x0..x1), e.g. area = work/displacement
 *     xStep?, yStep?: number,        // read-only tick spacing (default: d3's own heuristic)

 *     xDomain?: [min, max], yDomain?: [min, max],
 *     showGrid?: boolean,            // default true
 *     editorial?: boolean,           // the plain look's chart: y label as a line of text over the plot, light
 *                                    // horizontal rules only, muted sans ticks, line series labelled at their end,
 *                                    // dot labels placed clear of the marks (read-only plots)
 *     a11yCaption?: string,          // for <caption> in the text-table fallback
 *     interactive?: {
 *       enabled: boolean,
 *       maxPoints?: number,          // default Infinity
 *       snapStep?: number,           // default 1 — click/drag position rounds to the nearest multiple
 *       connectPoints?: boolean,     // default false — draw segments between placed points, in x order
 *       initialPoints?: [{x, y}],
 *       onChange?: (points: {x,y}[]) => void,  // called after every add/move/remove
 *     }
 *   }
 *
 * `series[].color` is an author-facing semantic key (`'primary'`, `'success'`,
 * `'error'`, `'muted'`, or `'series-1'`..`'series-6'`) resolved against this app's own theme tokens, never a
 * raw hex — see resolveColor() below (CLAUDE.md invariant 9: this component's
 * own default styling must never hardcode a color).
 */

let _d3 = null;

async function loadD3() {
  if (_d3) return _d3;
  _d3 = await import('vendor/d3.js');
  return _d3;
}

const COLOR_TOKENS = {
  primary: '--primary-color',
  success: '--success-text',
  error: '--error-text',
  muted: '--text-muted',
};
const COLOR_FALLBACKS = {
  primary: '#6366f1',
  success: '#166534',
  error: '#be123c',
  muted: '#64748b',
};

/** Resolves a series' semantic color key against this app's live theme
 *  tokens (read from `el`'s computed style, so it re-resolves correctly on
 *  every plot() call after a light/dark toggle — same pattern every
 *  simulation's own `_reloadColors()` uses). Falls back to a fixed color
 *  only if the token isn't defined at all (e.g. this component mounted
 *  outside the app's own theme.css, such as a standalone preview page). */
function resolveColor(el, key) {
  const styles = getComputedStyle(el);
  // 'series-1'..'series-6': the categorical --content-series-* tokens, for
  // curves that are groups to tell apart rather than one primary line.
  const m = /^series-([1-6])$/.exec(key || '');
  if (m) return styles.getPropertyValue(`--content-series-${m[1]}`).trim() || COLOR_FALLBACKS.primary;
  const k = COLOR_TOKENS[key] ? key : 'primary';
  return styles.getPropertyValue(COLOR_TOKENS[k]).trim() || COLOR_FALLBACKS[k];
}

function themeColor(el, varName, fallback) {
  return getComputedStyle(el).getPropertyValue(varName).trim() || fallback;
}

/** Rounds `v` to the nearest multiple of `step` (step <= 0 is a no-op). */
function snap(v, step) {
  if (!step || step <= 0) return v;
  return Math.round(v / step) * step;
}

/** Tick values aligned to `step` across `domain` — used so an interactive
 *  plot's gridlines only ever mark positions a click can actually snap to
 *  (d3's default tick heuristic picks spacing from pixel width alone, with
 *  no awareness of `snapStep`, and can easily land on unsnappable values
 *  like 0.5 when snapStep is 1). Thins to a multiple of `step` if the raw
 *  step would produce more than `maxTicks` marks, so a small snapStep
 *  doesn't flood the axis — the thinned spacing stays a whole multiple of
 *  `step`, so every displayed tick remains a reachable value. */
function snapAlignedTicks([lo, hi], step, maxTicks = 15) {
  let mult = 1;
  while (Math.floor((hi - lo) / (step * mult)) + 1 > maxTicks) mult++;
  const effStep = step * mult;
  const start = Math.ceil(lo / effStep) * effStep;
  const count = Math.round((hi - start) / effStep);
  const values = [];
  for (let i = 0; i <= count; i++) values.push(Math.round((start + i * effStep) / effStep) * effStep);
  return values;
}

/** The part of a curve (points sorted by x) that lies in [x0, x1], with the
 *  curve linearly interpolated at both ends so a shaded stretch starts and
 *  stops exactly on x0/x1 rather than on the nearest sample. */
function clipToRange(points, [x0, x1]) {
  const pts = [...points].sort((a, b) => a.x - b.x);
  const at = (x) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (x >= a.x && x <= b.x) return b.x === a.x ? a.y : a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
    }
    return null;
  };
  const lo = Math.max(Math.min(x0, x1), pts[0].x), hi = Math.min(Math.max(x0, x1), pts[pts.length - 1].x);
  if (!(hi > lo)) return [];
  return [{ x: lo, y: at(lo) }, ...pts.filter(p => p.x > lo && p.x < hi), { x: hi, y: at(hi) }];
}

export class GraphPlotter {
  /**
   * Plot a chart into an SVG element.
   * @param {SVGElement} svgEl  Must already be sized via CSS or explicit attributes
   * @param {object} config
   * @returns {Promise<{getPoints: () => {x:number,y:number}[], setPoints: (pts) => void, clear: () => void}|undefined>}
   *   A handle for reading/setting the interactive points, only when
   *   `config.interactive.enabled` — undefined for a plain read-only plot.
   */
  static async plot(svgEl, config) {
    const d3 = await loadD3();
    const {
      type = 'line', series = [], xLabel = '', yLabel = '', a11yCaption,
      showGrid = true, interactive, xStep, yStep, editorial = false,
    } = config;

    const rect = svgEl.getBoundingClientRect();
    const W = rect.width || 400;
    const H = rect.height || 300;
    const margin = { top: 20, right: 20, bottom: 42, left: 56 };

    // Clear previous
    d3.select(svgEl).selectAll('*').remove();

    // Axis labels must fit along their axis (a long y label on a phone-width
    // plot was cut at both ends). Measure each label; if it is longer than its
    // axis, drop to 12px, and if still too long, wrap it onto two lines and
    // widen that side's margin by one line.
    const fitLabel = (text, avail) => {
      if (!text) return { size: 14, lines: [''] };
      const probe = d3.select(svgEl).append('text').attr('font-weight', 600).attr('font-size', 14).text(text);
      const measure = (fs) => { probe.attr('font-size', fs); return probe.node().getComputedTextLength?.() || text.length * fs * 0.55; };
      let out = { size: 14, lines: [text] };
      if (measure(14) > avail) {
        out = { size: 12, lines: [text] };
        if (measure(12) > avail) {
          const words = text.split(/\s+/);
          let best = null;
          for (let i = 1; i < words.length; i++) {
            const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
            probe.text(a); const wa = measure(12); probe.text(b); const wb = measure(12);
            const w = Math.max(wa, wb);
            if (!best || w < best.w) best = { w, lines: [a, b] };
          }
          if (best) out = { size: 12, lines: best.lines };
        }
      }
      probe.remove();
      return out;
    };
    // Editorial: the y label is a line of text over the plot (wrapped to the
    // plot's width), not rotated up the side, so a long label never shrinks.
    const wrapLines = (text, avail, fs) => {
      if (!text) return [];
      const probe = d3.select(svgEl).append('text').attr('font-weight', 600).attr('font-size', fs).attr('font-family', 'inherit');
      const width = (t) => { probe.text(t); return probe.node().getComputedTextLength?.() || t.length * fs * 0.55; };
      const lines = [];
      let cur = '';
      for (const wd of text.split(/\s+/)) {
        const next = cur ? `${cur} ${wd}` : wd;
        if (cur && width(next) > avail) { lines.push(cur); cur = wd; } else cur = next;
      }
      if (cur) lines.push(cur);
      probe.remove();
      return lines;
    };
    let yTop = [];
    if (editorial) {
      margin.left = 40; margin.right = 18;
      yTop = wrapLines(yLabel, W - 8, 13);
      margin.top = 10 + yTop.length * 17 + 8;
    }
    const yFit = editorial ? { size: 13, lines: [] } : fitLabel(yLabel, H - margin.top - margin.bottom);
    if (yFit.lines.length > 1) margin.left += 15;
    const xFit = fitLabel(xLabel, W - margin.left - margin.right);
    if (xFit.lines.length > 1) margin.bottom += 15;
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    const svg = d3.select(svgEl)
      .attr('role', 'img')
      .attr('aria-label', a11yCaption || `${yLabel} vs ${xLabel} chart`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Collect all data points — including any interactive starting points,
    // so the domain accounts for them too.
    const interactivePoints = interactive?.enabled ? [...(interactive.initialPoints || [])] : null;
    const allPoints = series.flatMap(s => s.points || []).concat(interactivePoints || []);
    const xExtent = config.xDomain ?? (allPoints.length ? d3.extent(allPoints, d => d.x) : [0, 10]);
    const yExtent = config.yDomain ?? (allPoints.length ? d3.extent(allPoints, d => d.y) : [0, 10]);

    const xScale = d3.scaleLinear().domain(xExtent).range([0, innerW]).nice();
    const yScale = d3.scaleLinear().domain(yExtent).range([innerH, 0]).nice();

    const gridColor = themeColor(svgEl, '--border-color', '#e2e8f0');
    const textColor = themeColor(svgEl, '--text-main', '#0f172a');
    const mutedColor = editorial ? themeColor(svgEl, '--text-muted', textColor) : textColor;
    const ruleColor = editorial ? themeColor(svgEl, '--fig-rule', gridColor) : gridColor;
    const groundColor = themeColor(svgEl, '--fig-ground', themeColor(svgEl, '--bg-main', 'transparent'));

    // When interactive, gridlines/ticks must mark only positions a click can
    // snap to — otherwise the axis shows values (e.g. 0.5) the student can
    // never actually place a point on, which reads as the tool misplacing
    // their click. See snapAlignedTicks() doc comment.
    const snapStep = interactive?.enabled ? (interactive.snapStep ?? 1) : null;
    const xTicks = snapStep ? snapAlignedTicks(xScale.domain(), snapStep) : xStep > 0 ? snapAlignedTicks(xScale.domain(), xStep) : null;
    const yTicks = snapStep ? snapAlignedTicks(yScale.domain(), snapStep) : yStep > 0 ? snapAlignedTicks(yScale.domain(), yStep) : null;
    // Explicit tick values: label them with no more decimals than the step
    // itself has (xStep 1 reads 0, 1, 2 - not d3's 0.0, 1.0, 2.0).
    const stepFmt = (st) => { const dp = (String(st).split('.')[1] || '').length; return (v) => (+v).toFixed(dp); };
    const xFmt = snapStep ? stepFmt(snapStep) : xStep > 0 ? stepFmt(xStep) : null;
    const yFmt = snapStep ? stepFmt(snapStep) : yStep > 0 ? stepFmt(yStep) : null;
    const makeXAxis = () => xTicks ? d3.axisBottom(xScale).tickValues(xTicks).tickFormat(xFmt) : d3.axisBottom(xScale);
    const makeYAxis = () => yTicks ? d3.axisLeft(yScale).tickValues(yTicks).tickFormat(yFmt) : d3.axisLeft(yScale);

    // Tick LABELS thin to the pixels the axis really has: on a phone-width plot
    // (innerW about 250 px) d3's ten-ish ticks put "100" and "110" on top of
    // each other. Measure the widest label at the axis font size; if the gap
    // between neighbours is too small, label only every k-th tick (anchored on
    // 0 when 0 is a tick, so 0, 20, 40 rather than 10, 30, 50). The gridlines
    // keep every tick, and where the labels already fit (desktop) the axis is
    // exactly what it was.
    const AXIS_FS = 13;
    const thinLabels = (scale, values, fmt, horizontal) => {
      if (values.length < 3) return null;
      const probe = d3.select(svgEl).append('text').attr('font-size', AXIS_FS).attr('font-family', 'inherit');
      let widest = 0;
      for (const v of values) {
        const t = String(fmt(v));
        probe.text(t);
        widest = Math.max(widest, probe.node().getComputedTextLength?.() || t.length * AXIS_FS * 0.6);
      }
      probe.remove();
      const need = horizontal ? widest + 8 : AXIS_FS + 5;
      const gap = Math.abs(scale(values[1]) - scale(values[0]));
      if (!(gap > 0) || gap >= need) return null;
      const k = Math.ceil(need / gap);
      const zero = values.findIndex(v => Math.abs(v) < 1e-9);
      const offset = zero >= 0 ? zero % k : 0;
      return values.filter((_, i) => i % k === offset);
    };
    const xLabelTicks = thinLabels(xScale, xTicks || xScale.ticks(), xFmt || xScale.tickFormat(), true);
    const yLabelTicks = thinLabels(yScale, yTicks || yScale.ticks(), yFmt || yScale.tickFormat(), false);
    const makeXLabelAxis = () => xLabelTicks ? d3.axisBottom(xScale).tickValues(xLabelTicks).tickFormat(xFmt || xScale.tickFormat()) : makeXAxis();
    const makeYLabelAxis = () => yLabelTicks ? d3.axisLeft(yScale).tickValues(yLabelTicks).tickFormat(yFmt || yScale.tickFormat()) : makeYAxis();

    if (showGrid && editorial) {
      svg.append('g')
        .attr('class', 'gp-grid-y')
        .call(makeYAxis().tickSize(-innerW).tickFormat(''))
        .call(g => g.select('.domain').remove())
        .call(g => g.selectAll('line').attr('stroke', ruleColor).attr('stroke-width', 1));
    } else if (showGrid) {
      svg.append('g')
        .attr('class', 'gp-grid-x')
        .attr('transform', `translate(0,${innerH})`)
        .call(makeXAxis().tickSize(-innerH).tickFormat(''))
        .call(g => g.select('.domain').remove())
        .call(g => g.selectAll('line').attr('stroke', gridColor).attr('stroke-opacity', 0.5));
      svg.append('g')
        .attr('class', 'gp-grid-y')
        .call(makeYAxis().tickSize(-innerW).tickFormat(''))
        .call(g => g.select('.domain').remove())
        .call(g => g.selectAll('line').attr('stroke', gridColor).attr('stroke-opacity', 0.5));
    }

    // Axes
    const xAxis = svg.append('g').attr('transform', `translate(0,${innerH})`).call(makeXLabelAxis());
    const yAxis = svg.append('g').call(makeYLabelAxis());
    [xAxis, yAxis].forEach(g => {
      g.select('.domain').attr('stroke', textColor);
      g.selectAll('line').attr('stroke', textColor);
      g.selectAll('text').attr('fill', mutedColor);
      g.attr('font-size', 13).attr('font-family', 'inherit');
    });
    if (editorial) {
      yAxis.select('.domain').remove();
      yAxis.selectAll('line').remove();
      xAxis.selectAll('line').attr('stroke', ruleColor);
    }

    // Axis labels
    // Each label's lines run outward from the axis: the last line sits where a
    // one-line label would, earlier lines one line further out (y label) or
    // the first line in place and the second below it (x label).
    const xText = svg.append('text')
      .attr('x', editorial ? innerW : innerW / 2).attr('y', innerH + 36)
      .attr('text-anchor', editorial ? 'end' : 'middle').attr('font-size', editorial ? 13 : xFit.size).attr('font-weight', 600).attr('fill', mutedColor);
    xFit.lines.forEach((ln, i) => xText.append('tspan').attr('x', editorial ? innerW : innerW / 2).attr('dy', i ? 15 : 0).text(ln));
    if (editorial) {
      const t = svg.append('text').attr('class', 'gp-ylabel').attr('x', -margin.left + 4).attr('y', -margin.top + 10 + 13)
        .attr('font-size', 13).attr('font-weight', 600).attr('fill', mutedColor);
      yTop.forEach((ln, i) => t.append('tspan').attr('x', -margin.left + 4).attr('dy', i ? 17 : 0).text(ln));
    }
    if (!editorial) {
    const yText = svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2).attr('y', -44 - 15 * (yFit.lines.length - 1))
      .attr('text-anchor', 'middle').attr('font-size', yFit.size).attr('font-weight', 600).attr('fill', textColor);
    yFit.lines.forEach((ln, i) => yText.append('tspan').attr('x', -innerH / 2).attr('dy', i ? 15 : 0).text(ln));
    }

    // Shaded areas first, so every curve and dot sits on top of them. The
    // base is y = 0 clamped into the visible range; a [x0, x1] fill shades
    // only that stretch, with the curve interpolated at both ends.
    const [yLo, yHi] = yScale.domain();
    const baseY = yScale(Math.min(Math.max(0, yLo), yHi));
    series.forEach((s) => {
      if (!s.fill || !(s.points?.length > 1)) return;
      const pts = Array.isArray(s.fill) ? clipToRange(s.points, s.fill) : [...s.points].sort((a, b) => a.x - b.x);
      if (pts.length < 2) return;
      const area = d3.area().x(d => xScale(d.x)).y0(baseY).y1(d => yScale(d.y));
      svg.append('path').datum(pts)
        .attr('class', 'gp-fill')
        .attr('fill', resolveColor(svgEl, s.color)).attr('fill-opacity', 0.22)
        .attr('stroke', 'none').attr('d', area);
    });

    // Series — each may override the chart-level `type` (e.g. a smooth
    // target-function curve alongside a handful of scored `scatter` points
    // in the same plot, as plot-function@1 does once revealed).
    // Dots that would overlap (a run of cases at nearly the same x and y)
    // stack upward instead, a dot plot, so each one stays countable. Placed
    // once over every dotted series, so the labels below can avoid them all.
    const marks = [];   // { x, y, r } placed dots, plot px
    const curves = [];  // [x, y] samples along the drawn lines, plot px
    const dotSeries = series.map((s) => {
      const st = s.type || type;
      if (!((st === 'line' && s.dots !== false) || st === 'scatter') || !s.points?.length) return null;
      const raw = s.points.map((d) => ({ d, x: xScale(d.x), y: yScale(d.y) }));
      const sorted = [...raw].sort((a, b) => a.x - b.x);
      let crowd = Infinity;
      for (let k = 1; k < sorted.length; k++) crowd = Math.min(crowd, Math.hypot(sorted[k].x - sorted[k - 1].x, sorted[k].y - sorted[k - 1].y));
      const r = crowd < 9 ? 3.6 : 4;
      const gap = 2 * r + 0.6;
      for (const p of sorted) {
        let y = p.y;
        const up = p.y > 2 * gap;
        for (let k = 0; k < 12 && marks.some((m) => Math.hypot(m.x - p.x, m.y - y) < gap); k++) y = p.y + (up ? -1 : 1) * (k + 1) * gap;
        p.py = y; p.r = r;
        marks.push({ x: p.x, y, r });
      }
      return raw;
    });
    series.forEach((s) => {
      if ((s.type || type) === 'line' && s.points?.length > 1) for (const d of s.points) curves.push([xScale(d.x), yScale(d.y)]);
    });
    // Densify the curve samples so a label box between two samples still sees the line.
    const curvePts = [];
    for (let k = 1; k < curves.length; k++) {
      const [x0, y0] = curves[k - 1], [x1, y1] = curves[k];
      if (x1 < x0) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6));
      for (let j = 0; j <= n; j++) curvePts.push([x0 + (x1 - x0) * j / n, y0 + (y1 - y0) * j / n]);
    }
    const textW = (t, fs) => {
      const probe = svg.append('text').attr('font-size', fs).attr('font-weight', 600).attr('font-family', 'inherit').text(t);
      const w = probe.node().getComputedTextLength?.() || t.length * fs * 0.55;
      probe.remove();
      return w;
    };
    const placed = [];  // label boxes already placed
    const hits = (b) => b.x0 < 0 || b.x1 > innerW + margin.right - 2 || b.y0 < -margin.top + 4 || b.y1 > innerH
      || marks.some((m) => m.x + m.r > b.x0 && m.x - m.r < b.x1 && m.y + m.r > b.y0 && m.y - m.r < b.y1)
      || curvePts.some(([x, y]) => x > b.x0 - 2 && x < b.x1 + 2 && y > b.y0 - 2 && y < b.y1 + 2)
      || placed.some((o) => o.x0 < b.x1 && o.x1 > b.x0 && o.y0 < b.y1 && o.y1 > b.y0);
    /** First box among candidates (cx = text-anchor x, by = baseline) that hits nothing; else the first. */
    const placeLabel = (w, fs, cands) => {
      const box = ([cx, by, anchor]) => {
        const x0 = anchor === 'end' ? cx - w : anchor === 'middle' ? cx - w / 2 : cx;
        return { x0, x1: x0 + w, y0: by - fs, y1: by + 3, cx, by, anchor };
      };
      const boxes = cands.map(box);
      const pick = boxes.find((b) => !hits(b)) || boxes[0];
      placed.push(pick);
      return pick;
    };
    const halo = (sel) => (editorial && groundColor !== 'transparent'
      ? sel.attr('stroke', groundColor).attr('stroke-width', 4).attr('stroke-linejoin', 'round').attr('paint-order', 'stroke')
      : sel);

    series.forEach((s, i) => {
      const color = resolveColor(svgEl, s.color);
      const seriesType = s.type || type;
      // A series' own `label` is free-text content ("y = 2x + 5") and cannot
      // be interpolated into a CSS class/selector - use the series' index,
      // which is always a valid selector fragment, as the class instead.
      if (seriesType === 'line' || seriesType === 'scatter') {
        if (seriesType === 'line') {
          const line = d3.line().x(d => xScale(d.x)).y(d => yScale(d.y));
          svg.append('path')
            .datum(s.points)
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', (s.dots === false ? 3 : 2) + (s.emph ? 1.5 : 0))
            .attr('stroke-linejoin', 'round')
            .attr('opacity', s.opacity ?? null)
            .attr('d', line);
        }
        const dots = dotSeries[i] || [];
        svg.selectAll(`.dot-${i}`)
          .data(dots).enter()
          .append('circle')
          .attr('class', `dot-${i}`)
          .attr('cx', p => p.x).attr('cy', p => p.py)
          .attr('r', p => p.r).attr('fill', color).attr('opacity', s.opacity ?? null)
          .attr('stroke', editorial && groundColor !== 'transparent' ? groundColor : null).attr('stroke-width', editorial ? 1 : null);
        // Editorial: a line series is labelled at its end, in its own colour.
        if (editorial && seriesType === 'line' && s.label && s.points.length > 1) {
          const last = [...s.points].sort((a, b) => a.x - b.x).pop();
          const lx = xScale(last.x), ly = yScale(last.y), w = textW(s.label, 13);
          const b = placeLabel(w, 13, [[lx, ly + 20, 'end'], [lx - 8, ly - 10, 'end'], [lx, ly + 36, 'end'], [lx - 8, ly + 18, 'end']]);
          halo(svg.append('text').attr('class', `line-label-${i}`).attr('opacity', s.opacity ?? null).attr('x', b.cx).attr('y', b.by).attr('text-anchor', b.anchor)
            .attr('font-size', 13).attr('font-weight', 600).attr('fill', color).text(s.label));
        }
        // Per-point label (e.g. "A", "P(3, 4)") — distinct from the series'
        // own `label` above (one free-text legend entry for the whole
        // series). Most points in a plain coordinate-geometry question have
        // no `label` at all (a single unnamed dot needs none) — `.filter()`
        // here, not a blanket `.data(s.points)`, keeps those un-labeled dots
        // from getting an empty-string <text> node.
        {
          // The label goes clear of every dot, line and other label: a lone
          // point's label sits up and right of it as before; a run's label over
          // the run (its stacked neighbours). Editorial: in the dots' colour.
          for (const p of dots.filter(q => q.d.label)) {
            const run = dots.filter(q => q === p || (!q.d.label && Math.abs(q.x - p.x) < 70 && Math.abs(q.y - p.y) < 30));
            const top = Math.min(...run.map(q => q.py - q.r)), bottom = Math.max(...run.map(q => q.py + q.r));
            const left = Math.min(...run.map(q => q.x)), right = Math.max(...run.map(q => q.x));
            const mid = (left + right) / 2, w = textW(p.d.label, 13);
            const lone = run.length === 1 ? [[p.x + 8, p.py - 8, 'start']] : [];
            const b = placeLabel(w, 13, [...lone, [mid, top - 8, 'middle'], [mid, top - 26, 'middle'], [right + 10, (top + bottom) / 2 + 5, 'start'],
              [left - 10, (top + bottom) / 2 + 5, 'end'], [mid, bottom + 17, 'middle'], [mid, top - 44, 'middle']]);
            halo(svg.append('text').attr('class', `dot-label-${i}`).attr('x', b.cx).attr('y', b.by).attr('text-anchor', b.anchor)
              .attr('font-size', 13).attr('font-weight', editorial ? 600 : 700).attr('fill', editorial ? color : textColor).text(p.d.label));
          }
        }
      } else if (seriesType === 'bar') {
        const bw = innerW / s.points.length * 0.7;
        svg.selectAll(`.bar-${i}`)
          .data(s.points).enter()
          .append('rect')
          .attr('class', `bar-${i}`)
          .attr('x', d => xScale(d.x) - bw / 2)
          .attr('y', d => yScale(d.y))
          .attr('width', bw)
          .attr('height', d => innerH - yScale(d.y))
          .attr('fill', color);
      }
    });

    if (!interactive?.enabled) return undefined;
    return GraphPlotter._mountInteractive(svg, { xScale, yScale, innerW, innerH, svgEl, ...interactive });
  }

  /**
   * Wires up click-to-place / drag-to-move points on top of an already-
   * drawn static plot. A transparent full-plot-area `<rect>` captures clicks
   * to add a new point (up to `maxPoints`, ignored once at the cap); each
   * placed point is its own draggable `<circle>`, with a small always-visible
   * "×" affordance to remove it (touch-friendly — no reliance on right-click,
   * which has no equivalent gesture on a tablet).
   */
  static _mountInteractive(svg, { xScale, yScale, innerW, innerH, svgEl, maxPoints = Infinity, snapStep = 1, connectPoints = false, initialPoints = [], onChange }) {
    let points = initialPoints.map(p => ({ ...p }));
    const color = resolveColor(svgEl, 'primary');
    const removeColor = resolveColor(svgEl, 'error');

    // Capture rect must be appended (and thus painted) *below* the points/
    // ghost layers, not above — SVG hit-tests top-to-bottom by document
    // order, and a later-appended rect would sit on top of every point,
    // swallowing clicks meant for a point's own drag/remove handlers (they'd
    // register as a new-point click on the rect instead). Its own handlers
    // reference `points`/`render`/`ghost` only inside callbacks that fire
    // later, once the rest of this function has finished running, so it's
    // safe to wire up before those are declared.
    const captureRect = svg.append('rect')
      .attr('width', innerW).attr('height', innerH)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair');

    // Ghost preview: shows where a click would snap *before* it's committed
    // — without this, clicking near a snap boundary (e.g. snapStep 1, click
    // at x=0.6) silently lands on either side of the boundary with no
    // warning, which reads as the point being placed "in the wrong spot".
    const ghostLayer = svg.append('g').attr('class', 'gp-ghost').style('pointer-events', 'none');
    const ghost = ghostLayer.append('circle')
      .attr('r', 7).attr('fill', color).attr('fill-opacity', 0.35)
      .attr('stroke', color).attr('stroke-width', 1.5).attr('stroke-opacity', 0.6)
      .style('display', 'none');

    const layer = svg.append('g').attr('class', 'gp-interactive');
    const lineGen = _d3.line().x(d => xScale(d.x)).y(d => yScale(d.y));

    function notify() { onChange?.(points.map(p => ({ ...p }))); }

    function render() {
      layer.selectAll('*').remove();

      if (connectPoints && points.length > 1) {
        layer.append('path')
          .datum([...points].sort((a, b) => a.x - b.x))
          .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2).attr('stroke-dasharray', '4,3')
          .attr('d', lineGen);
      }

      const groups = layer.selectAll('.gp-point')
        .data(points)
        .enter()
        .append('g')
        .attr('class', 'gp-point')
        .attr('transform', d => `translate(${xScale(d.x)},${yScale(d.y)})`)
        .style('cursor', 'grab');

      groups.append('circle').attr('r', 7).attr('fill', color).attr('stroke', 'white').attr('stroke-width', 2);

      // Small "×" remove affordance, offset above-right of the point —
      // its own hit target, so a drag started on the point itself is never
      // mistaken for a remove tap.
      const removeGroups = groups.append('g')
        .attr('transform', 'translate(10,-10)')
        .style('cursor', 'pointer')
        .on('click', function (event, d) {
          event.stopPropagation();
          points = points.filter(p => p !== d);
          render();
          notify();
        });
      removeGroups.append('circle').attr('r', 7).attr('fill', removeColor);
      removeGroups.append('text').attr('text-anchor', 'middle').attr('dy', '0.32em')
        .attr('fill', 'white').attr('font-size', 9).attr('font-weight', 700).text('×').style('pointer-events', 'none');

      groups.call(_d3.drag()
        .on('drag', function (event, d) {
          d.x = snap(xScale.invert(Math.max(0, Math.min(innerW, event.x))), snapStep);
          d.y = snap(yScale.invert(Math.max(0, Math.min(innerH, event.y))), snapStep);
          _d3.select(this).attr('transform', `translate(${xScale(d.x)},${yScale(d.y)})`);
          if (connectPoints) layer.select('path').datum([...points].sort((a, b) => a.x - b.x)).attr('d', lineGen);
        })
        .on('end', () => notify()));
    }

    captureRect
      .on('mousemove', function (event) {
        if (points.length >= maxPoints) { ghost.style('display', 'none'); return; }
        const [px, py] = _d3.pointer(event, this);
        const sx = snap(xScale.invert(px), snapStep);
        const sy = snap(yScale.invert(py), snapStep);
        ghost.style('display', null).attr('transform', `translate(${xScale(sx)},${yScale(sy)})`);
      })
      .on('mouseleave', () => ghost.style('display', 'none'))
      .on('click', function (event) {
        if (points.length >= maxPoints) return;
        const [px, py] = _d3.pointer(event, this);
        points.push({ x: snap(xScale.invert(px), snapStep), y: snap(yScale.invert(py), snapStep) });
        ghost.style('display', 'none');
        render();
        notify();
      });

    render();

    return {
      getPoints: () => points.map(p => ({ ...p })),
      setPoints: (pts) => { points = (pts || []).map(p => ({ ...p })); render(); },
      clear: () => { points = []; render(); notify(); },
    };
  }

  /**
   * Build a text-table fallback element for screen readers.
   * @param {object} config  Same config as plot()
   * @returns {HTMLTableElement}
   */
  static buildA11yTable(config) {
    const { series = [], xLabel = 'X', yLabel = 'Y', a11yCaption } = config;
    const table = document.createElement('table');
    table.className = 'sr-only';
    table.setAttribute('aria-hidden', 'false');
    if (a11yCaption) {
      const cap = document.createElement('caption');
      cap.textContent = a11yCaption;
      table.appendChild(cap);
    }
    const thead = table.createTHead();
    const hRow = thead.insertRow();
    [xLabel, yLabel, 'Series'].forEach(h => {
      const th = document.createElement('th'); th.textContent = h; hRow.appendChild(th);
    });
    const tbody = table.createTBody();
    series.forEach(s => {
      (s.points || []).forEach(p => {
        const tr = tbody.insertRow();
        [p.x, p.y, s.label].forEach(v => { const td = tr.insertCell(); td.textContent = v; });
      });
    });
    return table;
  }
}
