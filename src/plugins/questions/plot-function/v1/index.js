/**
 * plot-function@1 — Click to plot points for a given function on a
 * coordinate grid (e.g. "plot y = 2x + 3"), graded by checking each placed
 * point against the target function within a tolerance.
 *
 * Rendering/interaction is delegated to GraphPlotter (core/components/
 * GraphPlotter.js) — click-to-place, drag-to-move, tap-the-× to remove.
 * Scoring evaluates `targetFunction` (a mathjs expression in `x`) through
 * the sandboxed, timeout-protected worker (core/mathEvaluatorWorker.js) —
 * same security posture as numeric-value@1's own formula evaluation (HLD
 * §7.4/Appendix B.4): an authored/AI-drafted formula string is never run
 * with `eval()`/`new Function()` on the main thread.
 *
 * `evaluate()` is deliberately ASYNC (the worker round-trip needs it) —
 * every call site that invokes a plugin's evaluate() now `await`s it
 * (LessonSession._handleCheck, TestSession._reviewGoto,
 * TestEngine.submit()'s scoring loop), which is a no-op for every other
 * plugin's synchronous evaluate(), so this doesn't change behavior anywhere
 * else.
 */
import { html, css } from 'lit';
import { QuestionBase } from '../../../../core/components/QuestionBase.js';
import { GraphPlotter } from '../../../../core/components/GraphPlotter.js';
import { evaluateManyWithTimeout, warmup } from '../../../../core/mathEvaluatorWorker.js';
import { EventBus } from '../../../../core/EventBus.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';

export class PlotFunction extends QuestionBase {
  static styles = [btn3dStyles, feedbackAnimStyles, 
    QuestionBase.styles,
    css`
      .pf-wrap {
        background: var(--bg-surface);
        border: 2px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: 14px 16px 18px;
      }
      .pf-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
        flex-wrap: wrap;
      }
      .pf-count {
        font-size: 0.85rem;
        font-weight: var(--fw-strong);
        color: var(--text-muted);
      }
      .pf-reset {
        padding: 5px 12px;
        border-radius: var(--radius-xs);
        border: 1px solid var(--border-color);
        background: var(--bg-panel);
        color: var(--text-main);
        font-size: 0.82rem;
        font-weight: var(--fw-strong);
        cursor: pointer;
      }
      .pf-reset:hover { background: var(--border-color); }
      .pf-svg-host {
        width: 100%;
        max-width: 640px;
        aspect-ratio: 4 / 3;
        margin: 0 auto;
        display: block;
      }
      .pf-svg-host svg { width: 100%; height: 100%; display: block; }
    `,
  ];

  static schema = {
    $id: 'plot-function@1',
    type: 'object',
    required: ['id', 'type', 'stem', 'targetFunction', 'xDomain', 'yDomain'],
    properties: {
      stem: { type: 'object' },
      targetFunction: { type: 'string' }, // mathjs expression in `x`, e.g. "2*x + 3"
      xDomain: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
      yDomain: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
      xLabel: { type: 'string' },
      yLabel: { type: 'string' },
      minPoints: { type: 'number' },     // default 3
      maxPoints: { type: 'number' },     // default = minPoints
      tolerance: { type: 'number' },     // y-tolerance, default 0.5
      snapStep: { type: 'number' },      // default 1
      connectPoints: { type: 'boolean' }, // default false — dashed line through the student's own points
    },
  };

  constructor() {
    super();
    this._points = [];
    this._plotHandle = null;
    this._mounted = false;
  }

  init(data, prng, ctx) {
    super.init(data, prng, ctx);
    this._points = [];
    if (this._ctx?.previewOnly) return;
    // Starts loading mathjs now, well before the student finishes plotting
    // and clicks Evaluate — see warmup()'s own doc comment for why.
    warmup();
  }

  connectedCallback() {
    super.connectedCallback?.();
    this._onThemeChanged = () => this._replot();
    EventBus.on('theme:changed', this._onThemeChanged);
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    EventBus.off?.('theme:changed', this._onThemeChanged);
    this._plotHandle = null;
  }

  updated(changedProperties) {
    super.updated?.(changedProperties); // no-op here (this schema has no data.simulation), kept for future-proofing
    if (!this._mounted) {
      const svgEl = this.renderRoot?.querySelector('#pf-svg');
      if (svgEl) { this._mounted = true; this._replot(); }
    }
  }

  reset() {
    this._points = [];
    this._isRevealed = false;
    this._result = null;
    this._plotHandle?.clear();
    this._replot();
  }

  getState() { return { points: this._points }; }
  setState(s) {
    if (!Array.isArray(s?.points)) return;
    this._points = s.points.map(p => ({ ...p }));
    this._plotHandle?.setPoints(this._points);
    // _points is a plain field, not a Lit reactive property, so the
    // "N of M points placed" toolbar label (renderInput() reads
    // this._points.length directly) stays stale at 0 even though
    // setPoints() above already redrew the dots on the SVG imperatively.
    this.requestUpdate();
  }
  getResponse() { return { points: this._points }; }

  /** Async — see file header. Overrides QuestionBase's synchronous default
   *  entirely (does not call super.evaluate()) since scoring here needs the
   *  worker round-trip. */
  async evaluate() {
    if (!this._data) return { score: 0, isCorrect: false };
    this._isRevealed = true;
    this._result = await this.constructor.score(this._data, this.getResponse());
    this._replot(); // overlay the real curve + color each point once revealed
    this.requestUpdate();
    return this._result;
  }

  static async score(itemData, response) {
    const points = response?.points || [];
    const minPoints = itemData.minPoints ?? 3;
    if (points.length < minPoints) {
      return {
        score: 0, isCorrect: false, correctness: [],
        feedback: `Plot at least ${minPoints} point${minPoints === 1 ? '' : 's'} on the line before checking.`,
      };
    }
    const tolerance = itemData.tolerance ?? 0.5;
    const scopes = points.map(p => ({ x: p.x }));
    const evalResult = await evaluateManyWithTimeout(itemData.targetFunction, scopes, 1000);
    if (!evalResult.ok) {
      return { score: 0, isCorrect: false, correctness: [], feedback: "Couldn't check your answer — the target function failed to evaluate." };
    }
    const correctness = points.map((p, i) => {
      const expected = evalResult.values[i];
      return expected !== null && Math.abs(p.y - expected) <= tolerance;
    });
    const correctCount = correctness.filter(Boolean).length;
    const score = correctCount / points.length;
    const isCorrect = correctCount === points.length;
    return {
      score, isCorrect, correctness,
      feedback: isCorrect
        ? 'Correct — every point you plotted lies on the function.'
        : `${correctCount} of ${points.length} point${points.length === 1 ? '' : 's'} lie on the function — the highlighted ones are off.`,
    };
  }

  /** (Re)draws the plot: editable while unattempted, frozen with the real
   *  curve overlaid (and each point colored by correctness) once revealed.
   *  Re-run on mount, on every point add/move/remove, on evaluate(), and on
   *  a live theme toggle (colors are read fresh from CSS each call — see
   *  GraphPlotter's own resolveColor()). */
  async _replot() {
    const svgEl = this.renderRoot?.querySelector('#pf-svg');
    if (!svgEl || !this._data) return;
    const { xDomain, yDomain, xLabel = 'x', yLabel = 'y', targetFunction } = this._data;

    const series = [];
    if (this._isRevealed && this._result) {
      const samples = 60;
      const step = (xDomain[1] - xDomain[0]) / samples;
      const scopes = Array.from({ length: samples + 1 }, (_, i) => ({ x: xDomain[0] + i * step }));
      const curve = await evaluateManyWithTimeout(targetFunction, scopes, 1000);
      if (curve.ok) {
        series.push({
          label: 'target', color: 'primary', type: 'line',
          points: scopes.map((s, i) => ({ x: s.x, y: curve.values[i] })).filter(p => p.y !== null),
        });
      }
      const correctness = this._result.correctness || [];
      const correctPts = this._points.filter((_, i) => correctness[i]);
      const wrongPts = this._points.filter((_, i) => !correctness[i]);
      if (correctPts.length) series.push({ label: 'correct', color: 'success', type: 'scatter', points: correctPts });
      if (wrongPts.length) series.push({ label: 'incorrect', color: 'error', type: 'scatter', points: wrongPts });
    }

    const handle = await GraphPlotter.plot(svgEl, {
      type: 'line',
      xLabel, yLabel, xDomain, yDomain,
      series: this._isRevealed ? series : [],
      a11yCaption: this._data.stem?.en || 'Coordinate plane',
      interactive: this._isRevealed ? undefined : {
        enabled: true,
        maxPoints: this._data.maxPoints ?? this._data.minPoints ?? 3,
        snapStep: this._data.snapStep ?? 1,
        connectPoints: !!this._data.connectPoints,
        initialPoints: this._points,
        onChange: (pts) => {
          this._points = pts;
          this.requestUpdate();
          EventBus.emit('question:interaction', { id: this._data?.id });
        },
      },
    });
    if (handle) this._plotHandle = handle;
  }

  renderInput() {
    const max = this._data?.maxPoints ?? this._data?.minPoints ?? 3;
    const min = this._data?.minPoints ?? 3;
    const countLabel = max > min ? `${this._points.length} of ${min}–${max} points placed` : `${this._points.length} of ${min} points placed`;
    return html`
      <div class="pf-wrap">
        ${!this._isRevealed ? html`
          <div class="pf-toolbar">
            <span class="pf-count">${countLabel} — click the grid to place, drag to adjust, tap × to remove.</span>
            <button type="button" class="pf-reset" @click=${() => this.reset()}>Reset</button>
          </div>
        ` : ''}
        <div class="pf-svg-host">
          <svg id="pf-svg"></svg>
        </div>
      </div>
    `;
  }
}

customElements.define('plot-function-v1', PlotFunction);
