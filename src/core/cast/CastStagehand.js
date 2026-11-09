import { stagehandPlan, noteStagehand } from '../components/diorama/QuillStagehand.js';
import { characterOf } from './CastFigure.js';

/**
 * The story cast's stagehand: while a course with a cast is open, its
 * narrator moves the Story theatre's windows instead of the look's own
 * stagehand (src/core/components/diorama/StoryTheatre.js drives it through
 * play() / grab() / finish() / plan() / note(), docs/ui-ux-design-system.md
 * 1.1.1b). The move itself is the caller's (onProgress); this element only
 * hangs the narrator's pose from the grip while it runs: a pop in, a swing
 * that trails the pull, a fade out. Plan and novelty are the look's own
 * (stagehandPlan(), noteStagehand()), so the theatre paces both the same.
 */

const POP_MS = 260;
const EXIT_MS = 420;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outBack = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

const sheet = (text) => {
  const s = new CSSStyleSheet();
  s.replaceSync(text);
  return s;
};

const STYLES = sheet(`
  :host {
    position: fixed; left: 0; top: 0; width: 100vw; height: 100vh;
    z-index: 40; pointer-events: none; display: none; contain: layout paint;
  }
  :host([playing]) { display: block; }
  .fig { position: absolute; left: 0; top: 0; transform-origin: 50% 0; will-change: transform, opacity; user-select: none; }
  .grip {
    position: absolute; left: 0; top: 0; width: 22px; height: 22px; margin: -11px 0 0 -11px;
    border: 3px solid var(--accent-gold); border-radius: 50%; opacity: 0; box-sizing: border-box;
  }
`);

export class CastStagehand extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [STYLES];
    this._grip = document.createElement('div');
    this._grip.className = 'grip';
    this._img = document.createElement('img');
    this._img.className = 'fig';
    this._img.alt = '';
    this._img.draggable = false;
    root.append(this._grip, this._img);
    this._raf = 0;
    this._done = null;
  }

  plan(now) { return stagehandPlan(now); }
  note(weight, now) { noteStagehand(weight, now); }
  finish() { if (this._done) this._done(true); }

  grab({ grip, speed = 1, quill = true }) {
    const hold = { released: false };
    this.play({ kind: 'hold', grip, hold, speed, quill, onProgress: () => {} });
    return { release: () => { hold.released = true; } };
  }

  async play({ kind, onProgress, grip, moveMs = 560, speed = 1, quill = true, hold = null }) {
    this.finish();
    const ch = characterOf(this.localName);
    const shown = quill && !!ch;
    if (ch) this._img.setAttribute('src', (kind === 'open' && ch.poses.proud) || ch.poses.default);
    this._img.style.display = shown ? '' : 'none';
    this.setAttribute('playing', '');
    const box = this.getBoundingClientRect();
    const size = Math.max(72, Math.min(140, Math.min(box.width, box.height) * 0.2));
    this._img.style.width = `${size}px`;
    const pop = shown ? POP_MS : 0;
    const exitMs = shown ? EXIT_MS : 0;
    let moveEnd = hold ? Infinity : pop + moveMs;
    let theta = 0;
    let omega = 0;
    let last = null;
    let lastT = 0;

    return new Promise((resolve) => {
      const start = performance.now();
      const end = (skipped) => {
        cancelAnimationFrame(this._raf);
        this._raf = 0;
        this._done = null;
        onProgress(1);
        this.removeAttribute('playing');
        resolve(skipped);
      };
      this._done = end;
      const frame = (now) => {
        if (!this.isConnected) { end(true); return; }
        const t = (now - start) * speed;
        if (hold?.released && moveEnd === Infinity) moveEnd = Math.max(t, pop);
        const pm = hold ? 1 : inOut(seg(t, pop, moveEnd));
        onProgress(pm);
        if (t >= moveEnd + exitMs) { end(false); return; }
        if (!shown) { this._raf = requestAnimationFrame(frame); return; }
        const [gx, gy] = grip(pm);
        const x = gx - box.left;
        const y = gy - box.top;
        const dt = Math.max(1, t - lastT);
        const vx = last ? (x - last) / dt : 0;
        last = x;
        lastT = t;
        // Hanging from the grip: a damped swing that trails the pull.
        const want = Math.max(-24, Math.min(24, -vx * 22));
        omega = omega * 0.82 + (want - theta) * 0.16;
        theta += omega;
        const k = t < pop ? outBack(seg(t, 0, pop)) : 1;
        const out = t > moveEnd ? seg(t - moveEnd, 0, exitMs) : 0;
        const drop = out * out * size * 0.6;
        this._img.style.opacity = String(1 - out);
        this._img.style.transform = `translate(${(x - size / 2).toFixed(1)}px, ${(y - size * 0.06 + drop).toFixed(1)}px) rotate(${theta.toFixed(2)}deg) scale(${k.toFixed(3)})`;
        const gripOn = t >= pop * 0.6 && t <= moveEnd + 60;
        this._grip.style.opacity = gripOn ? '0.9' : '0';
        this._grip.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        this._raf = requestAnimationFrame(frame);
      };
      this._raf = requestAnimationFrame(frame);
    });
  }
}

/** Defines (once) the stagehand tag for a cast's narrator. */
export function defineStagehand(tag) {
  if (!customElements.get(tag)) customElements.define(tag, class extends CastStagehand {});
  return tag;
}
