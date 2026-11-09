import { clampView, viewForFocus, zoomAround, panBy, sameView } from './theatreLayout.js';

/**
 * The diorama's camera: zoom and pan for ANY scene (canvas, DOM, SVG or
 * WebGL), done as a CSS transform on a wrapper around the scene's host. The
 * scene never knows: it keeps its own size and its own pointer handling, and
 * a transform is already reflected in getBoundingClientRect(), which is what
 * the base classes map pointers through.
 *
 * Markup it drives (StoryTheatre renders it):
 *   viewport  .th-cam     sized to the scene, overflow hidden, gestures here
 *   content   .th-cam-in  the transformed layer holding the scene host
 *
 * What the camera shows, in priority order:
 *   1. the learner's own zoom/pan (pinch, Ctrl + wheel, the +/- buttons, a
 *      drag in pan mode), until the next beat: each beat starts from the
 *      author's framing again, so the scene stays in step with the story;
 *   2. the beat's focus rect, when "Camera follows the beat" is on and the
 *      slide authored one (simulation.focus, or a scene's beatFocus());
 *   3. the whole scene ("See all" pins this until the next beat).
 *
 * Gestures never steal a scene's own input: one finger or the mouse still
 * reaches the scene, except in pan mode (the hand button), with the middle
 * mouse button, or with two fingers. A canvas zoomed in is upscaled, so it
 * looks softer; that is the price of working with every scene unchanged.
 */
const MIN_Z = 0.2; // at most 5x

export class DioramaCamera {
  /** @param {{ onChange?: (state: object) => void }} opts */
  constructor({ onChange } = {}) {
    this._onChange = onChange || (() => {});
    this._vp = null;
    this._content = null;
    this._enabled = true;
    this._follow = true;
    this._focus = null;     // authored focus rect for this beat (fractions), or null
    this._user = null;      // learner view {x,y,z}, or null
    this._released = false; // "See all" until the next beat
    this._panMode = false;
    this._view = { x: 0, y: 0, z: 1 };
    this._raf = 0;
    this._last = 0;
    this._ptrs = new Map();
    this._pinch = null;
    this._pan = null;
    this._gestureAt = 0;
    this._lastState = '';
    this._reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._h = {
      wheel: (e) => this._onWheel(e),
      down: (e) => this._onDown(e),
      move: (e) => this._onMove(e),
      up: (e) => this._onUp(e),
      touchend: (e) => { if (performance.now() - this._gestureAt < 400 || this._ptrs.size > 1) e.stopPropagation(); },
    };
  }

  /** Binds to a (new) viewport/content pair; a no-op if unchanged. */
  attach(viewport, content) {
    if (viewport === this._vp && content === this._content) return;
    this.detach();
    this._vp = viewport;
    this._content = content;
    if (!viewport || !content) return;
    viewport.addEventListener('wheel', this._h.wheel, { passive: false });
    // Capture phase: seen before the scene's own listeners on its canvas/DOM,
    // so a pan or pinch can keep the scene from also reacting to it.
    viewport.addEventListener('pointerdown', this._h.down, true);
    viewport.addEventListener('pointermove', this._h.move, true);
    viewport.addEventListener('pointerup', this._h.up, true);
    viewport.addEventListener('pointercancel', this._h.up, true);
    // LessonSession turns the page on a horizontal swipe; a pinch or pan is not one.
    viewport.addEventListener('touchend', this._h.touchend);
    this._applyTouchAction();
    this._apply();
  }

  detach() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    const vp = this._vp;
    if (vp) {
      vp.removeEventListener('wheel', this._h.wheel);
      vp.removeEventListener('pointerdown', this._h.down, true);
      vp.removeEventListener('pointermove', this._h.move, true);
      vp.removeEventListener('pointerup', this._h.up, true);
      vp.removeEventListener('pointercancel', this._h.up, true);
      vp.removeEventListener('touchend', this._h.touchend);
    }
    this._vp = null;
    this._content = null;
    this._ptrs.clear();
    this._pinch = null;
    this._pan = null;
  }

  /** Zoom-and-pan option: off leaves only "follow the beat". */
  setEnabled(on) {
    this._enabled = !!on;
    if (!on) { this._user = null; this._panMode = false; }
    this._applyTouchAction();
    this._retarget();
  }

  setFollow(on) {
    this._follow = !!on;
    this._retarget();
  }

  /** A new beat: drop the learner's zoom and frame the beat's focus (if any). */
  setBeat(focus) {
    this._focus = focus && focus.w > 0 && focus.h > 0 ? focus : null;
    this._user = null;
    this._released = false;
    this._panMode = false;
    this._retarget();
  }

  zoomBy(factor) {
    const base = this._user || this._target();
    const next = zoomAround(base, factor, 0.5, 0.5, MIN_Z);
    this._setUser(next.z >= 0.999 ? null : next, next.z >= 0.999);
  }

  /** The whole scene until the next beat. */
  seeAll() {
    this._user = null;
    this._released = true;
    this._panMode = false;
    this._retarget();
  }

  /** Back to the beat's own framing. */
  backToBeat() {
    this._user = null;
    this._released = false;
    this._panMode = false;
    this._retarget();
  }

  togglePanMode() {
    this._panMode = !this._panMode;
    this._applyTouchAction();
    this._emit(true);
  }

  /** For the chip and the zoom buttons. */
  get state() {
    const beatOn = this._follow && !!this._focus && !this._released;
    const target = this._target();
    return {
      mode: this._user ? 'user' : beatOn ? 'beat' : 'all',
      zoomed: target.z < 0.999,
      hasFocus: !!this._focus && this._follow,
      label: this._focus?.label || '',
      panMode: this._panMode,
      enabled: this._enabled,
    };
  }

  /** Re-applies the transform after the scene's box changed size. */
  refresh() {
    this._apply();
  }

  /**
   * Where the beat's focus will sit inside the viewport once the camera
   * settles, as viewport fractions {x, y, w, h}, or null without a focus.
   * Used to park a floating story card where it covers least of it.
   */
  focusInView() {
    if (!this._focus) return null;
    const v = this._target();
    const f = this._focus;
    return { x: (f.x - v.x) / v.z, y: (f.y - v.y) / v.z, w: f.w / v.z, h: f.h / v.z };
  }

  // ── internals ───────────────────────────────────────────────────────

  _target() {
    if (this._user) return this._user;
    if (this._follow && this._focus && !this._released) return viewForFocus(this._focus, MIN_Z);
    return { x: 0, y: 0, z: 1 };
  }

  _setUser(view, release = false) {
    this._user = view ? clampView(view, MIN_Z) : null;
    if (release) this._released = true;
    if (!this._user) this._panMode = false;
    this._retarget();
  }

  _retarget() {
    this._emit();
    if (this._reduce || !this._vp) {
      this._view = this._target();
      this._apply();
      return;
    }
    if (!this._raf) {
      this._last = performance.now();
      this._raf = requestAnimationFrame((t) => this._tick(t));
    }
  }

  _tick(now) {
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    const t = this._target();
    const k = 1 - Math.exp(-dt * 9);
    const v = this._view;
    this._view = { x: v.x + (t.x - v.x) * k, y: v.y + (t.y - v.y) * k, z: v.z + (t.z - v.z) * k };
    if (sameView(this._view, t, 0.0008)) this._view = t;
    this._apply();
    this._raf = this._view === t ? 0 : requestAnimationFrame((n) => this._tick(n));
  }

  /** Sets the view instantly (direct manipulation follows the finger, no lag). */
  _jump(view) {
    this._user = clampView(view, MIN_Z);
    this._view = this._user;
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._apply();
    this._emit();
  }

  _apply() {
    const el = this._content;
    if (!el) return;
    const { x, y, z } = this._view;
    if (z >= 0.9995) { el.style.transform = ''; return; }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const s = 1 / z;
    el.style.transform = `translate(${-x * w * s}px, ${-y * h * s}px) scale(${s})`;
  }

  _applyTouchAction() {
    // While zoom is on, the page must not pinch-zoom or scroll under two
    // fingers here; one finger still reaches the scene (pointer events).
    if (this._vp) this._vp.style.touchAction = this._enabled ? 'none' : '';
  }

  _emit(force = false) {
    this._vp?.classList.toggle('pan-mode', this._panMode);
    const s = this.state;
    const key = `${s.mode}|${s.zoomed}|${s.hasFocus}|${s.panMode}|${s.enabled}`;
    if (!force && key === this._lastState) return;
    this._lastState = key;
    this._onChange(s);
  }

  _frac(e) {
    const r = this._vp.getBoundingClientRect();
    return { x: (e.clientX - r.left) / (r.width || 1), y: (e.clientY - r.top) / (r.height || 1) };
  }

  _onWheel(e) {
    if (!this._enabled) return;
    const cur = this._user || this._view;
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch arrives as Ctrl + wheel with small deltas; a mouse
      // notch is ~100. Capped so one notch is ~1.3x.
      e.preventDefault();
      const p = this._frac(e);
      const next = zoomAround(cur, Math.exp(-Math.max(-25, Math.min(25, e.deltaY)) * 0.01), p.x, p.y, MIN_Z);
      if (next.z >= 0.999) this._setUser(null, true); else this._jump(next);
      return;
    }
    if (cur.z >= 0.999) return; // not zoomed: the page keeps the wheel
    e.preventDefault();
    const r = this._vp.getBoundingClientRect();
    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    this._jump(panBy(cur, -dx / (r.width || 1), -dy / (r.height || 1), MIN_Z));
  }

  _onDown(e) {
    if (!this._enabled) return;
    this._ptrs.set(e.pointerId, e);
    const cur = this._user || this._view;
    if (this._ptrs.size === 2 && e.pointerType === 'touch') {
      const [a, b] = [...this._ptrs.values()];
      const m = this._frac(mid(a, b));
      this._pan = null;
      this._pinch = { d0: Math.max(10, dist(a, b)), v0: { ...cur }, sx: cur.x + m.x * cur.z, sy: cur.y + m.y * cur.z };
      e.stopPropagation();
      return;
    }
    const wantsPan = (this._panMode && e.button === 0) || e.button === 1;
    if (wantsPan && cur.z < 0.999) {
      e.stopPropagation();
      e.preventDefault();
      this._vp.setPointerCapture?.(e.pointerId);
      this._pan = { id: e.pointerId, p0: this._frac(e), v0: { ...cur } };
      this._vp.classList.add('panning');
    }
  }

  _onMove(e) {
    if (!this._ptrs.has(e.pointerId)) return;
    this._ptrs.set(e.pointerId, e);
    if (this._pinch && this._ptrs.size >= 2) {
      e.stopPropagation();
      const [a, b] = [...this._ptrs.values()];
      const m = this._frac(mid(a, b));
      const z = Math.max(MIN_Z, Math.min(1, this._pinch.v0.z * this._pinch.d0 / Math.max(10, dist(a, b))));
      this._gestureAt = performance.now();
      this._jump({ x: this._pinch.sx - m.x * z, y: this._pinch.sy - m.y * z, z });
      return;
    }
    if (this._pan && e.pointerId === this._pan.id) {
      e.stopPropagation();
      const p = this._frac(e);
      this._gestureAt = performance.now();
      this._jump(panBy(this._pan.v0, p.x - this._pan.p0.x, p.y - this._pan.p0.y, MIN_Z));
    }
  }

  _onUp(e) {
    if (!this._ptrs.has(e.pointerId)) return;
    this._ptrs.delete(e.pointerId);
    if (this._pinch && this._ptrs.size < 2) {
      this._pinch = null;
      this._gestureAt = performance.now();
      if ((this._user?.z ?? 1) >= 0.98) this._setUser(null, true);
    }
    if (this._pan && e.pointerId === this._pan.id) {
      this._pan = null;
      this._gestureAt = performance.now();
      this._vp?.classList.remove('panning');
    }
  }
}

function mid(a, b) { return { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 }; }
function dist(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
