import { drawFigure, describeFigure, figureFocus, figureCueFocus, applyFigureFocus, FIGURE_CSS } from './FigureLayouts.js';
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
 * @returns {{ setStep(step: number): void, setOptions(o: { look?: string, kicker?: string }): void,
 *   resolveCue(id: string): string[]|null, cueFocus(ids: string[]|null): void, destroy(): void }}
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
    // Plain draws the folder tab only when the author wrote one: the lesson
    // kicker is already in the page head.
    const tab = String(figure.tab?.en ?? figure.tab ?? '');
    fig.dataset.tab = tab || (look === 'plain' ? '' : kicker);
  };
  // Focus (FigureLayouts figureFocus): the beat's own, or a narration cue's
  // until the next beat. On a beat change the new body is drawn with the old
  // focus first, then moved to the new one, so the change transitions.
  let cueIds = null;
  let narr = { narrated: false, on: [], held: [] }; // narration focus contract (spec W1 D29n)
  let shownIds = [];
  let focusRaf = 0;
  // A part still held for its show cue is never the focus (nothing to light yet).
  const notHeld = (ids) => (narr.narrated && narr.held.length ? ids.filter((i) => !narr.held.includes(i)) : ids);
  const focusNow = () => notHeld(cueIds ?? (narr.narrated && narr.on.length ? narr.on : null) ?? figureFocus(figure, step + 1));
  // Parts a show.<id> cue has not reached yet: hidden, their room kept.
  const applyHeld = () => {
    const held = new Set(narr.narrated ? narr.held : []);
    body.querySelectorAll('[data-id]').forEach((e) => {
      const host = e.classList.contains('tl-track') ? e.parentNode : e;
      host.classList.toggle('narr-held', held.has(e.dataset.id));
    });
    if (narr.narrated) wrap.dataset.narrated = ''; else delete wrap.dataset.narrated;
  };
  const setFocus = (ids, smooth) => {
    cancelAnimationFrame(focusRaf);
    if (!smooth) { applyFigureFocus(wrap, body, ids); shownIds = ids; return; }
    applyFigureFocus(wrap, body, shownIds);
    body.getBoundingClientRect(); // style the old focus first, so the change transitions
    focusRaf = requestAnimationFrame(() => { if (!dead) { applyFigureFocus(wrap, body, ids); shownIds = ids; } });
  };
  const draw = (animate) => {
    if (dead) return;
    apply();
    lastW = body.clientWidth;
    drawFigure({ body, inner, lane }, figure, { cur: step + 1, animate, look: look === 'plain' ? 'plain' : 'quill' });
    setFocus(focusNow(), animate);
    applyHeld();
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
      cueIds = null;
      draw(forward);
    },
    /** A narration cue id as focus (figureCueFocus): the id list, or null when it is not this figure's. */
    resolveCue(id) { return figureCueFocus(figure, id); },
    /** Cue focus until the next beat; null goes back to the beat's own focus. */
    cueFocus(ids) {
      const next = ids == null ? null : [...ids];
      if (JSON.stringify(next) === JSON.stringify(cueIds)) return;
      cueIds = next;
      setFocus(focusNow(), false);
    },
    /** Narration focus at the beat time (content-block _narrFocusAt):
     *  { narrated, on: lit ids, held: ids still hidden }. Bare-id cues
     *  (cueFocus) win over it; the beat's own focus applies when on is empty. */
    narrationFocus(st = {}) {
      narr = { narrated: !!st.narrated, on: [...(st.on || [])], held: [...(st.held || [])] };
      applyHeld();
      setFocus(focusNow(), false);
    },
    setOptions(o = {}) {
      const nl = o.look ?? look, nk = o.kicker ?? kicker;
      if (nl === look && nk === kicker) return;
      look = nl; kicker = nk;
      draw(false);
    },
    destroy() {
      dead = true;
      cancelAnimationFrame(focusRaf);
      ro?.disconnect();
    },
  };
}
