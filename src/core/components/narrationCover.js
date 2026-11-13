/**
 * narrationCover - an opening picture over the stage of a narrated beat (Q-90).
 *
 * Narrated only: text mode never sees it. The comic camera (reveal.focusMode
 * "camera", blockImageLayout.js) moves once per beat; a cover moves at the
 * narration's own words and then hands the stage to the slide's scene, so an
 * opener can show the setting ("the case room", "the ward") for the first
 * phrases without giving up the scene for the whole beat. Same camera math
 * (focusRect.js cameraScale + focusTranslate), same 0-1 rects, same ease.
 *
 * Spec (per narration step id, e.g. "b1", or "prompt" on a predict):
 *   { "src": "media/01-desk.jpg", "alt": "...",
 *     "frames": [ { "x", "y", "w", "h", "cue"?: "<cue id>", "t"?: ms, "ms"?: move ms } ],
 *     "until": "<cue id>" }
 * - frames: the camera. A frame starts at its cue's word (`cue`, any cue id of
 *   the segment, as written in the script: "show.files", "honest"), else at
 *   beat time `t` (default 0). No rect = the whole image. `ms` = how long the
 *   move into it takes (default 1100; a long one is a slow push-in).
 * - until: the cue at which the cover fades and the scene takes over. Omitted
 *   = the cover stays for the whole beat (a predict: until its card shows).
 * Time-pure: the state is derived from the beat time, so replay, scrub and
 * Previous re-derive it. Cue times are the default voice's (the scene clock).
 */
import { cameraScale, focusTranslate, normalizeFocusRect } from '../focusRect.js';
import { CourseSourceManager } from '../CourseSourceManager.js';

const DEFAULT_MOVE_MS = 1100;
const FADE_MS = 520;

export const NARRATION_COVER_CSS = `
.ncv { position: absolute; inset: 0; z-index: 6; display: flex; align-items: center; justify-content: center;
  container-type: size; background: var(--bg-base); opacity: 1; transition: opacity ${FADE_MS}ms ease-out; }
.ncv--gone { opacity: 0; pointer-events: none; }
.ncv--hidden { visibility: hidden; }
.ncv-frame { position: relative; overflow: hidden; aspect-ratio: var(--ncv-ar, 16 / 9);
  width: min(100cqw, calc(100cqh * var(--ncv-arn, 1.7778))); border-radius: 10px;
  box-shadow: 0 1px 2px color-mix(in srgb, var(--text-main) 10%, transparent),
    0 8px 28px color-mix(in srgb, var(--text-main) 12%, transparent); }
.ncv-group { position: absolute; inset: 0; transform-origin: 50% 50%; will-change: transform;
  transition: transform var(--ncv-move, ${DEFAULT_MOVE_MS}ms) cubic-bezier(0.45, 0, 0.25, 1); }
.ncv-group img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ncv--cut .ncv-group { transition: none; }
@media (prefers-reduced-motion: reduce) { .ncv-group { transition: none !important; } .ncv { transition: none; } }
`;

/** The cue time (ms) of `id` in the segment's cues, or null. */
function cueTime(cues, id) {
  const c = (cues || []).find((x) => x.id === id);
  return c && Number.isFinite(c.t) ? c.t : null;
}

/** Frames with their start times, in time order (a frame whose cue is missing is dropped). */
function timedFrames(spec, cues) {
  const out = [];
  for (const f of spec?.frames || [{}]) {
    const t = f.cue ? cueTime(cues, f.cue) : (Number.isFinite(f.t) ? f.t : 0);
    if (t == null) continue;
    out.push({ t, rect: normalizeFocusRect(f), ms: Number.isFinite(f.ms) ? f.ms : DEFAULT_MOVE_MS });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** { frame, index, gone } at beat time ms. Pure; exported for tests. */
export function coverStateAt(spec, cues, ms) {
  const frames = timedFrames(spec, cues);
  let index = -1;
  frames.forEach((f, i) => { if (f.t <= ms) index = i; });
  const until = spec?.until ? cueTime(cues, spec.until) : null;
  return { frame: frames[Math.max(0, index)] || { t: 0, rect: null, ms: DEFAULT_MOVE_MS }, index: Math.max(0, index), gone: until != null && ms >= until };
}

/** CSS transform for a camera rect (the comic camera's own composition). */
export function coverTransform(rect) {
  const s = cameraScale(rect);
  if (!rect || !(s > 1)) return 'none';
  const { tx, ty } = focusTranslate(rect, s);
  return `scale(${s.toFixed(3)}) translate(${(tx * 100).toFixed(3)}%, ${(ty * 100).toFixed(3)}%)`;
}

/** Puts the cover CSS into a shadow root once. */
export function ensureCoverStyle(root) {
  if (!root || root.getElementById?.('ncv-style')) return;
  const st = document.createElement('style');
  st.id = 'ncv-style';
  st.textContent = NARRATION_COVER_CSS;
  root.appendChild(st);
}

/**
 * One cover on one parent element (it fills the parent: position it).
 * update(ms, cues) re-derives the frame and the fade; remove() takes it away.
 */
export class NarrationCover {
  constructor(parent, spec, bundleId) {
    this.spec = spec;
    this.parent = parent;
    ensureCoverStyle(parent.getRootNode?.());
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    const el = document.createElement('div');
    el.className = 'ncv ncv--cut';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', spec.alt || '');
    el.innerHTML = '<div class="ncv-frame"><div class="ncv-group"><img alt="" decoding="async"></div></div>';
    const img = el.querySelector('img');
    img.addEventListener('load', () => {
      if (img.naturalWidth && img.naturalHeight) {
        el.style.setProperty('--ncv-ar', `${img.naturalWidth} / ${img.naturalHeight}`);
        el.style.setProperty('--ncv-arn', String(img.naturalWidth / img.naturalHeight));
      }
    });
    img.src = CourseSourceManager.resolveRef(spec.src, bundleId);
    parent.appendChild(el);
    this.el = el;
    this.group = el.querySelector('.ncv-group');
    this._key = null;
    this._fresh = true;
    this._goneTimer = null;
  }

  update(ms, cues) {
    if (!this.el) return;
    const s = coverStateAt(this.spec, cues, ms);
    const key = `${s.index}`;
    if (key !== this._key) {
      this._key = key;
      this.group.style.setProperty('--ncv-move', `${s.frame.ms}ms`);
      this.group.style.transform = coverTransform(s.frame.rect);
      if (this._fresh) {
        // First paint lands on the frame at once; later moves ease.
        this._fresh = false;
        void this.group.offsetWidth;
        requestAnimationFrame(() => this.el?.classList.remove('ncv--cut'));
      }
    }
    if (s.gone !== this._gone) {
      this._gone = s.gone;
      clearTimeout(this._goneTimer);
      this.el.classList.remove('ncv--hidden');
      this.el.classList.toggle('ncv--gone', s.gone);
      if (s.gone) this._goneTimer = setTimeout(() => this.el?.classList.add('ncv--hidden'), FADE_MS + 40);
    }
  }

  /** The cover's frame box in viewport px (for the caption to keep off), or null when gone. */
  rect() {
    if (!this.el || this._gone) return null;
    const r = this.el.querySelector('.ncv-frame').getBoundingClientRect();
    return r.width > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
  }

  get visible() { return !!this.el && !this._gone; }

  remove() {
    clearTimeout(this._goneTimer);
    this.el?.remove();
    this.el = null;
  }
}
