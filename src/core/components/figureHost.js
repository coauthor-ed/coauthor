import { drawFigure, describeFigure, FIGURE_CSS } from './FigureLayouts.js';
import { SimulationLoader } from '../SimulationLoader.js';

/**
 * figureHost - mounts a `figure` companion (FigureLayouts.js) on
 * content-block@1 and redraws it per beat; same host pattern as
 * photoDiagramHost.js / stepFigureHost.js (mount on host swap, setStep() on
 * every beat change, destroy() from the block's own teardown).
 *
 * The figure renders in its own shadow root on the host element, so its
 * stylesheet (FIGURE_CSS) never meets content-block's. Colours are live
 * var(--fig-*) references (inherited through the shadow boundary), so a
 * light/dark toggle needs no redraw. A width change does (ResizeObserver):
 * the layout itself depends on the width, never a scale factor.
 *
 * Signals it reuses rather than inventing:
 *   step     content-block's 0-indexed `_step` (the same beat photoDiagram /
 *            diagram reveal on); the field's 1-based `step` = beat + 1
 *   look     content-block's `look` (LookMixin), mirrored as data-look
 *   setting  the bundle manifest's `simSetting`, through the very call the
 *            scenes get it from (SimulationLoader.markHost -> --sim-setting).
 *            Case file is plain's only setting (kit/paperKind.js
 *            COURSE_SETTINGS), so it applies under plain only.
 *   tab      the folder tab on the casefile setting: the field's `tab`, else
 *            the lesson kicker ("Lesson N") content-block passes in.
 *
 * @param {HTMLElement} hostEl empty element to mount into
 * @param {object} figure the `figure` field
 * @param {{ step?: number, look?: string, bundleId?: string|null, kicker?: string }} opts
 * @returns {{ setStep(step: number): void, setOptions(o: { look?: string, kicker?: string }): void, destroy(): void }}
 */
export function mountFigure(hostEl, figure, opts = {}) {
  const root = hostEl.shadowRoot || hostEl.attachShadow({ mode: 'open' });
  root.replaceChildren();
  const style = document.createElement('style');
  style.textContent = FIGURE_CSS;
  const wrap = document.createElement('div');
  wrap.className = 'root';
  const fig = document.createElement('div');
  fig.className = 'fig';
  const inner = document.createElement('div');
  inner.className = 'fig-inner';
  const lane = document.createElement('div');
  lane.className = 'lane';
  const body = document.createElement('div');
  body.className = 'fig-body';
  inner.append(lane, body);
  fig.appendChild(inner);
  wrap.appendChild(fig);
  root.append(style, wrap);

  let step = Number.isInteger(opts.step) ? opts.step : 0;
  let look = opts.look || 'quill';
  let kicker = opts.kicker || '';
  let setting = '';
  let lastW = 0;
  let dead = false;

  const apply = () => {
    wrap.dataset.look = look === 'plain' ? 'plain' : 'quill';
    if (look === 'plain' && setting === 'casefile') wrap.dataset.setting = 'casefile';
    else delete wrap.dataset.setting;
    fig.dataset.tab = String(figure.tab?.en ?? figure.tab ?? '') || kicker;
  };
  const draw = (animate) => {
    if (dead) return;
    apply();
    lastW = body.clientWidth;
    drawFigure({ body, inner, lane }, figure, { cur: step + 1, animate });
    const label = (typeof figure.a11yCaption === 'string' && figure.a11yCaption.trim()) || figure.a11yCaption?.en || describeFigure(figure, step + 1);
    hostEl.setAttribute('role', 'img');
    hostEl.setAttribute('aria-label', label);
  };

  draw(true);
  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { if (body.clientWidth && Math.abs(body.clientWidth - lastW) > 0.5) draw(false); })
    : null;
  ro?.observe(body);
  // The fit check measures text: redo it once the web fonts are in.
  document.fonts?.ready?.then(() => draw(false));
  if (opts.bundleId) {
    SimulationLoader.markHost(hostEl, opts.bundleId).then(() => {
      let s = '';
      try { s = getComputedStyle(hostEl).getPropertyValue('--sim-setting').trim().toLowerCase(); } catch { /* detached */ }
      if (s !== setting) { setting = s; draw(false); }
    }).catch(() => {});
  }

  return {
    setStep(s) {
      if (s === step) return;
      const forward = s > step;
      step = s;
      draw(forward);
    },
    setOptions(o = {}) {
      const nl = o.look ?? look, nk = o.kicker ?? kicker;
      if (nl === look && nk === kicker) return;
      look = nl; kicker = nk;
      draw(false);
    },
    destroy() {
      dead = true;
      ro?.disconnect();
    },
  };
}
