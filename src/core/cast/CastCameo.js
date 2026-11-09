import { CUES, emitCue } from '../cues.js';

/**
 * The story cast's cameo: while a course with a cast is open, the look's
 * reactor hands the acts it would give its own cameo (a find in a scene, a
 * right answer with no companion on screen, a streak) to this instead, so the
 * look's mascot never appears in a cast course (src/looks/quill/reactor.js).
 *
 * Same API as the look's cameo: find(p, act, small), milestone(act, p),
 * serve(act, p), leave(). The narrator pops up at the bottom edge of the scene
 * (or the page), does the act through its figure (pose + hop) and goes.
 * A cast figure already standing by the scene (the stage answers with a
 * companion) acts where it stands instead, so there is never a second one.
 *
 * Restraint, simpler than the look's own: a find counts once per thing and
 * no more than one every FIND_GAP_MS; any other act keeps a 20 s budget; a
 * milestone always shows. Measuring goes through cue:stage-query only
 * (src/core/components/stageAnswer.js), never into another component.
 */

const ACT_BUDGET_MS = 20000;
const FIND_GAP_MS = 6000;
const SHOW_MS = 1700;
const POP_DELAY_MS = 240;

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const fullscreenOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

const sheet = (text) => {
  const s = new CSSStyleSheet();
  s.replaceSync(text);
  return s;
};

const STYLES = sheet(`
  :host { position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 1100; pointer-events: none; }
  .clip { position: fixed; overflow: hidden; display: none; }
  :host([playing]) .clip { display: block; }
  .fig { position: absolute; left: 0; bottom: 0; transition: transform 300ms var(--ease-spring, ease-out), opacity 200ms ease; }
  .fig.out { transform: translateY(80%); opacity: 0; }
  @media (prefers-reduced-motion: reduce) { .fig { transition: none; } }
`);

function askStage(host) {
  const answers = [];
  emitCue(CUES.STAGE_QUERY, { host: host || null, reply: (a) => answers.push(a) });
  return answers;
}

const thingKey = (p) => p?.key ?? (p?.thing ? `${p.thing.beat ?? ''}:${Math.round(p.thing.x ?? 0)}:${Math.round(p.thing.y ?? 0)}:${p.thing.state ?? ''}` : null);

export class CastCameo extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [STYLES];
    this._clip = document.createElement('div');
    this._clip.className = 'clip';
    root.append(this._clip);
    this._fig = null;
    this._tag = null;
    this._timer = 0;
    this._showing = false;
    this._seen = new Set();
    this._lastFind = 0;
    this._lastAct = 0;
  }

  /** The figure tag to stand in (the cast narrator's). */
  setFigure(tag) {
    if (tag === this._tag) return;
    this.leave();
    this._tag = tag;
    this._fig?.remove();
    this._fig = tag ? document.createElement(tag) : null;
    if (this._fig) {
      this._fig.className = 'fig out';
      this._clip.append(this._fig);
    }
  }

  get busy() { return this._showing; }

  async find(p, act, small = 'nod') {
    const now = Date.now();
    const key = thingKey(p);
    if (key != null && this._seen.has(key)) return false;
    if (now - this._lastFind < FIND_GAP_MS || this._showing) return false;
    if (key != null) this._seen.add(key);
    this._lastFind = now;
    await new Promise((r) => setTimeout(r, POP_DELAY_MS));
    return this._show(p?.small ? small : act, p);
  }

  async milestone(act, p = {}) {
    this.leave();
    return this._show(act, p, true);
  }

  async serve(act, p = {}) {
    const now = Date.now();
    if (now - this._lastAct < ACT_BUDGET_MS || this._showing) return false;
    const shown = await this._show(act, p, true);
    if (shown) this._lastAct = now;
    return shown;
  }

  leave() {
    clearTimeout(this._timer);
    this._fig?.classList.add('out');
    this.removeAttribute('playing');
    this._showing = false;
  }

  _show(act, p = {}, page = false) {
    const fig = this._fig;
    if (!fig) return false;
    const answers = askStage(p?.host);
    // A figure already by the scene does it where it stands.
    const resident = answers.find((a) => a?.companion?.actor)?.companion.actor;
    if (resident && typeof resident.perform === 'function') {
      resident.perform(act);
      return true;
    }
    const stage = page ? null : answers.find((a) => a?.own && (a.seen || a.box));
    if (fullscreenOn()) {
      const adopt = answers.find((a) => typeof a?.adopt === 'function');
      if (!adopt) return false;
      adopt.adopt(this);
    } else if (this.parentNode !== document.body) {
      document.body.append(this);
    }
    const r = stage?.seen?.() || stage?.box?.() || null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lesson-chrome-bottom')) || 0;
    const size = Math.round(Math.max(64, Math.min(110, (r ? Math.min(r.right - r.left, r.bottom - r.top) : Math.min(vw, vh)) * 0.24)));
    // The bottom edge of the stage, its right end; else the page's lower left.
    const box = r
      ? { left: Math.max(0, r.right - size - 12), top: Math.max(0, r.bottom - size), width: size, height: size }
      : { left: 16, top: Math.max(0, vh - chrome - size - 8), width: size, height: size };
    Object.assign(this._clip.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    fig.style.width = `${size}px`;
    this._showing = true;
    this.setAttribute('playing', '');
    fig.classList.add('out');
    requestAnimationFrame(() => {
      fig.classList.remove('out');
      fig.perform?.(act);
    });
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.leave(), SHOW_MS + (reduced() ? 0 : 300));
    return true;
  }
}

if (!customElements.get('cast-cameo')) customElements.define('cast-cameo', CastCameo);

let the = null;

/** The one cast cameo, standing in the given narrator figure. */
export function castCameo(figureTag) {
  if (!the) {
    the = document.createElement('cast-cameo');
    document.body.appendChild(the);
  }
  the.setFigure(figureTag);
  return the;
}

/** Sends the cast cameo off (no-op when none was ever made). */
export function leaveCastCameo() {
  the?.leave();
}
