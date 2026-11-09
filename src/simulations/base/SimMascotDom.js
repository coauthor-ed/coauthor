import {
  quillMarkup, quillStyles, performAct, setExpression, trackPupils,
  QUILL_VIEWBOX, QUILL_BASELINE_Y, ACTS, EXPRESSIONS,
} from '../../core/quill/QuillRig.js';
import { lookOf } from './kit/lookProfile.js';

/**
 * SimMascotDom — Quill inside a DomSimulation scene.
 *
 * This is the whole reason mini-games default to DomSimulation rather than
 * CanvasSimulation: Quill is an SVG rig, so in a DOM scene he is the SAME
 * markup the app chrome uses (core/quill/QuillRig.js), dropped in unported.
 * A canvas scene would need every path re-issued as Path2D and every CSS
 * keyframe re-implemented against a frame clock - roughly 320 lines of
 * duplicate, and a second thing to keep in sync.
 *
 * Colors resolve through `var(--quill-*)`, declared on :root in theme.css.
 * A DomSimulation needs no COLOR_TOKEN_MAP, no readSimColors(), no hex
 * fallback table, and therefore cannot acquire the "undefined token silently
 * renders a fixed hex in both themes" bug that affects the canvas corpus
 * (see DomSimulation.js's own header, and P5.2 in the sprint doc).
 *
 * Usage inside a DomSimulation subclass:
 *
 *   import { SimMascotDom } from 'simulations/base/SimMascotDom.js';
 *
 *   async setup() {
 *     await super.setup();
 *     this.quill = SimMascotDom.mount(this.root, { x: 120, y: 430, height: 150 });
 *     this.injectStyle(SCENE_CSS + SimMascotDom.styles());
 *   }
 *   destroy() { this.quill?.destroy(); super.destroy(); }
 */

let seq = 0;

class MascotHandle {
  constructor(el, ns) {
    this.el = el;
    this.ns = ns;
    this._busy = false;
  }

  /** Root to query from - the rig lives directly under our wrapper. */
  get _root() { return this.el; }

  setExpression(name) {
    if (!EXPRESSIONS.includes(name)) return;
    setExpression(this._root, name);
  }

  /**
   * Unlike <quill-mascot>, there is no 20s cooldown here: a scene act is a
   * direct response to the student's own move (solved / retried / dragged past
   * the target), not ambient decoration, so throttling it would drop exactly
   * the feedback the student asked for. The concurrency guard stays.
   */
  async perform(act) {
    if (!ACTS.includes(act) || this._busy) return false;
    this._busy = true;
    try { await performAct(this._root, act); } finally { this._busy = false; }
    return true;
  }

  speak(text, ms = 3200) {
    const b = this.el.querySelector('.q-bubble');
    if (!b) return;
    b.textContent = text;
    b.hidden = !text;
    clearTimeout(this._speechTimer);
    if (text && ms > 0) {
      this._speechTimer = setTimeout(() => { b.hidden = true; }, ms);
    }
  }

  lookAt(dx, dy) { trackPupils(this._root, dx, dy); }

  show(visible = true) { this.el.style.opacity = visible ? '1' : '0'; }

  destroy() {
    clearTimeout(this._speechTimer);
    this.el.remove();
  }
}

export const SimMascotDom = {
  BASELINE_Y: QUILL_BASELINE_Y,
  VIEWBOX: QUILL_VIEWBOX,

  /**
   * @param {HTMLElement} root   the DomSimulation's this.root
   * @param {object} opts
   *   x, y      position in the scene's design-space px (y = where his feet land)
   *   height    rendered height in design-space px (default 150)
   *   flip      mirror him to face the other way
   *   bubbleSide 'right' | 'left' - which way the speech bubble opens
   * @returns {MascotHandle}
   */
  mount(root, { x = 100, y = 400, height = 150, flip = false, bubbleSide = 'right' } = {}) {
    const ns = `qs${++seq}`;
    const vbH = 300;
    const scale = height / vbH;
    const width = 240 * scale;

    const wrap = document.createElement('div');
    wrap.className = 'q-mascot';
    wrap.dataset.idle = 'true';
    wrap.setAttribute('aria-hidden', 'true');
    // Absolute placement is legitimate here: he is an overlay pinned to a point
    // in the scene's coordinate space, the same carve-out DomSimulation's header
    // allows for labels over a canvas child - not DOM layout done in px.
    wrap.style.cssText =
      `position:absolute; left:${x - width / 2}px; top:${y - height}px; ` +
      `width:${width}px; height:${height}px;${lookOf().mascot ? '' : ' display:none;'}`;

    const bubble = document.createElement('div');
    bubble.className = `q-bubble q-bubble-${bubbleSide}`;
    bubble.hidden = true;
    wrap.appendChild(bubble);

    // `flip` mirrors the RIG only, on its own inner element - not `wrap`,
    // whose transform would mirror the bubble's text right along with him.
    const rigHost = document.createElement('div');
    rigHost.style.cssText = `width:100%; height:100%;` + (flip ? ' transform:scaleX(-1);' : '');
    rigHost.insertAdjacentHTML('beforeend', quillMarkup(ns));
    wrap.appendChild(rigHost);

    root.appendChild(wrap);
    return new MascotHandle(wrap, ns);
  },

  /** Append to the scene's own CSS before passing it to injectStyle(). */
  styles() {
    return `
${quillStyles('.q-mascot')}
.q-mascot { pointer-events: none; transition: opacity 300ms ease; }
.q-mascot .quill-svg { filter: drop-shadow(0 10px 14px rgb(0 0 0 / 0.35)); }
.q-bubble {
  position: absolute;
  bottom: 88%;
  min-width: 120px;
  max-width: 230px;
  padding: 8px 12px;
  background: var(--sim-bg-surface);
  color: var(--sim-label);
  border: 2px solid var(--sim-border, var(--sim-stroke));
  border-radius: 16px;
  font: 700 14px/1.35 var(--sim-font, 'Nunito', system-ui, sans-serif);
  z-index: 5;
  /* Passive speech bubble — must not steal drag/drop or clicks aimed at
     whatever scene content it happens to render over. */
  pointer-events: none;
}
.q-bubble[hidden] { display: none; }
.q-bubble-right { left: 60%;  border-bottom-left-radius: 4px; }
.q-bubble-left  { right: 60%; border-bottom-right-radius: 4px; }
`;
  },
};
