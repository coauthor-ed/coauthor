/**
 * SimScene - the shared canvas scene skeleton (pairs with SimLook.js). Not a
 * scene itself: a concrete scene subclasses it, declares its own
 * BEAT_STEP_MAP / CONTROLS / ARIA_LABEL, and fills in
 *   enter(stage)           reset for a stage (the base resets age, fade, timers)
 *   update(d)              advance the model by d seconds (d clamped to [0, 0.05])
 *   draw(ctx, c, t)        paint the frame (the base clears first, then adds the
 *                          find ring and twinkles, the note card and the stage fade on top)
 *   busy()                 true while something that matters is still moving (a
 *                          run, a scripted sequence, a ball easing to rest); the
 *                          loop parks SETTLE_MS after it goes false
 *   noteRows(c)            rows for the note (line by default), shown from stage NOTE_STAGE
 *   pointerDown/Move/Up(p) design-space pointer hooks (p = {x, y}); pointerMove
 *                          returns true when the control bar needs a refresh
 *
 * Statics: WIDTH/HEIGHT (680x520, SimLook W/H), HIDPI (true: the backing store
 * is devicePixelRatio x the design size, capped at 2, with a matching base
 * transform, so text and edges stay crisp on phones; draw in design px as
 * always and never reset the transform), DRAGGABLE (stops page scroll
 * under a finger; default null = on when the scene overrides pointerDown), CONTINUOUS = false, BEAT_STEP_MAP, optional
 * BEAT_MAPS = { [beatCount]: map } for a scene attached to slides with
 * different beat counts (tools/beat-check reads only BEAT_STEP_MAP),
 * COLOR_MAP (token map for this.colors; GEO_COLOR_MAP for earth colours),
 * VISUAL_PROFILE ('lite' default | 'rich': the SimLook set helpers - backdrop,
 * depth, floor - paint the richer look for this scene; docs visual-profiles),
 * PAPER ('graph' | 'riso'; default from the course subject: maths gets graph paper, see paperKind.js),
 * SETTING ('none' | 'lab' | 'casefile'; default the manifest's simSetting: a faint subject setting behind the paper),
 * NOTE_STAGE (-1: none; else the first stage that shows the note), NOTE_STYLE
 * ('line' default: one muted line along the bottom, on that stage and every
 * later one, never covering the scene; 'card': the modal card, on that stage
 * only, for a stage the learner does not touch), NOTE_TITLE (card badge text).
 *
 * Helpers: this.colors (loadColors), this.stage / age / clock (read-only),
 * this.beatCount, after(seconds, fn), _guard(id), and the juice:
 *   celebrate(x, y, n, o)   the find: a small ring and twinkles at (x, y), then the cue (SimFind.js).
 *                           Only at a find, never on Run or a miss. n under 14 marks a small
 *                           find; o: { key, lookAt, small, quiet, stamp }, quiet shows it and sends no cue.
 *                           On the casefile setting the find is a stamp: o.stamp the word (default CONFIRMED);
 *                           celebrate({ stamp }) alone stamps the middle of the frame
 *   oops(x, y)              a shake and a red ring, for a miss
 *   shake(px), flash(k)     screen shake / light flash on their own
 *   floatText(text, x, y, { bg, size })   a chip that pops, rises and fades
 * Every stage change irises in from the centre (static IRIS = false turns it off). All of these keep the loop
 * awake until they finish, then it parks.
 * Reduced motion (prefers-reduced-motion, via SimAnim.reducedMotion): no iris,
 * no shake, no flash, no twinkles; celebrate/oops keep only their
 * ring as feedback; floatText shows in place and fades without rising.
 *
 * after(seconds, fn) runs fn on the scene clock, and only if the stage has not
 * changed since it was scheduled: entering a stage drops every pending after()
 * of the previous one, so a sprinkle launched in beat 2 can never land in
 * beat 3. Companion rule for your own runs: credit a finished run to a token
 * captured at launch (const run = { stage: this.stage, ... }), never to the
 * current stage when it ends. A pending after() keeps the loop awake.
 *
 * Coming to rest: CONTINUOUS = false is declared here. A scene whose model never
 * stops moving (a jiggling crowd) sets CONTINUOUS = true itself with a reason;
 * every other one says when it is busy(). Beats, controls and pointer events
 * wake the loop. Every mount is fresh and memory-less.
 *
 * Reserved names - do not declare fields or methods with these names in a
 * subclass (a collision breaks parking, starting or stage changes silently):
 *   this class:  _k (all private state lives in this one holder), _guard, _tick,
 *                _drawInitialFrame, _reloadColors, colors, beatCount, stage, age,
 *                clock, after, celebrate, oops, shake, flash, floatText, and
 *                the hooks above
 *   engine base: _running _rafId _lastTs _hasStarted _animateUntil _dwellTimerId
 *                _visibilityHandler _intersectionObserver _themeHandler _canvas
 *                _ctx _loop _onVisibilityChange animateFor start stop step pause
 *                resume startDwellTimer clearDwellTimer allowResume
 */
import { CanvasSimulation } from 'simulations/base/CanvasSimulation.js';
import { reducedMotion } from './SimAnim.js';
import { normalizeBeatMap } from './beatMap.js';
import { paperKindOf, settingOf, resolveSetting } from './paperKind.js';
import { W, H, setFrame, setProfile, setPaper, setSetting, COLOR_TOKEN_MAP, loadColors, alpha, lighten, inOutSine, outBack, pill, Burst, drawNoteCard, drawNoteLine, keepAwake } from './SimLook.js';
import { lookOf } from './lookProfile.js';
import { findMode, emitFind, canvasPoint } from './SimFind.js';

const FADE_S = 0.45;       // iris-in on every stage change
const FLOAT_S = 1.1;       // a floating "+1" chip's life
const FLASH_S = 0.28;
const FIND_RING_R = 78;

export class SimScene extends CanvasSimulation {
  static WIDTH = W;
  static HEIGHT = H;
  static DRAGGABLE = null;   // null = auto: true when the scene overrides pointerDown
  static TOUCH_AUTO = false; // this class sets touch-action itself (below), not CanvasSimulation
  static CONTINUOUS = false;
  /** Crisp rendering on high-density screens (see the header). */
  static HIDPI = true;
  /** First stage that shows the note (-1: none). */
  static NOTE_STAGE = -1;
  /** 'line': one muted line at the bottom from NOTE_STAGE on; 'card': the modal card on NOTE_STAGE only. */
  static NOTE_STYLE = 'line';
  /** Note card badge text ('' = no badge). */
  static NOTE_TITLE = '';
  /** Iris-in on every stage change; false for a scene that moves between stages itself (a camera move, a bridge). */
  static IRIS = true;
  /** Token map for this.colors (GEO_COLOR_MAP from GeoLook.js adds the earth tokens). */
  static COLOR_MAP = COLOR_TOKEN_MAP;

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;
    this.colors = null;
    this.beatCount = 0;
    this._k = {
      stage: -1, age: 0, fade: 1, clock: 0,
      wasBusy: false,     // last frame's busy(), so its end can be noticed
      epoch: 0,           // bumps on every stage entry; after() timers carry it
      timers: [],
      ctl: {},            // last value per control id, exactly as the host sent it
      burst: new Burst(),
      shake: 0, flash: 0, floats: [],
      onDown: (e) => onPointer(this, 'down', e),
      onMove: (e) => onPointer(this, 'move', e),
      onUp: (e) => onPointer(this, 'up', e),
    };
    // Record every control value the host sends (sliders and selects arrive as
    // STRINGS), even when a subclass overrides onControlChange without super.
    const own = this.onControlChange;
    this.onControlChange = (id, v) => { this._k.ctl[id] = v; return own.call(this, id, v); };
  }

  async setup() {
    await super.setup();
    this._reloadColors();
    const cv = this._canvas;
    const k = this._k;
    const C = this.constructor;
    const dpr = C.HIDPI ? Math.min(2, Math.max(1, Number(globalThis.devicePixelRatio) || 1)) : 1;
    k.dpr = dpr;
    if (dpr > 1 && cv) {
      cv.width = Math.round(C.WIDTH * dpr);
      cv.height = Math.round(C.HEIGHT * dpr);
      this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const drag = C.DRAGGABLE ?? (this.pointerDown !== SimScene.prototype.pointerDown);
    if (drag) cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', k.onDown);
    cv.addEventListener('pointermove', k.onMove);
    cv.addEventListener('pointerup', k.onUp);
    cv.addEventListener('pointercancel', k.onUp);
    enterStage(this, mapFor(this, this.beatCount)?.[0]?.[0]?.idx ?? 0);
    this._drawInitialFrame(this._ctx);
  }

  destroy() {
    const cv = this._canvas;
    const k = this._k;
    if (cv) {
      cv.removeEventListener('pointerdown', k.onDown);
      cv.removeEventListener('pointermove', k.onMove);
      cv.removeEventListener('pointerup', k.onUp);
      cv.removeEventListener('pointercancel', k.onUp);
    }
    k.timers = [];
    super.destroy();
  }

  _reloadColors() {
    const c = loadColors(this.container, this.constructor.COLOR_MAP);
    // The casefile setting: cards and panels are paper on the folder (--sim-set-paper), as SimWorld does for DOM scenes.
    const C = this.constructor;
    const cf = c.setPaper && resolveSetting(this._setting ?? settingOf(this.container, C.SETTING), lookOf(), paperKindOf(this.container, C.PAPER)) === 'casefile';
    this.colors = cf ? { ...c, bgSurface: c.setPaper } : c;
  }

  get stage() { return this._k.stage; }
  get age() { return this._k.age; }
  get clock() { return this._k.clock; }

  // -- Beats ----------------------------------------------------------------------

  onBeatChange(beatIndex, beatCount) {
    const map = mapFor(this, beatCount);
    this.beatCount = beatCount;
    const b = Math.max(0, Math.min(map.length - 1, Math.trunc(Number.isFinite(beatIndex) ? beatIndex : 0)));
    const stage = map[b]?.[0]?.idx ?? 0;
    if (stage !== this._k.stage) enterStage(this, stage);
    this.requestUiUpdate?.();
  }

  // -- Scheduling -------------------------------------------------------------------

  /**
   * Run fn after `seconds` of scene clock, unless the stage changes first.
   * Returns a cancel function.
   */
  after(seconds, fn) {
    const k = this._k;
    const job = { at: k.clock + Math.max(0, seconds), epoch: k.epoch, fn };
    k.timers.push(job);
    this.animateFor?.(Math.max(0, seconds) * 1000 + 100);
    return () => { k.timers = k.timers.filter((j) => j !== job); };
  }

  // -- Controls (defaults) ----------------------------------------------------------

  isControlHidden() { return false; }
  isControlDisabled() { return false; }
  /** Last value the host sent for this control, else its declared `value`. A subclass may override. */
  getControlValue(id) {
    const v = this._k.ctl[id];
    return v !== undefined ? v : this.constructor.CONTROLS?.find((c) => c.id === id)?.value;
  }
  onControlChange() {}

  /** Guard for subclasses' onControlChange: false for a hidden or disabled control. */
  _guard(id) {
    return !(this.isControlHidden(id) || this.isControlDisabled(id));
  }

  // -- Frame ------------------------------------------------------------------------

  _tick(ctx, dt) {
    if (!this.colors) return;
    const k = this._k;
    const d = Math.max(0, Math.min(dt, 0.05));   // the first frame can report a negative dt
    k.clock += d;
    k.age += d;
    k.fade = Math.min(1, k.fade + d / FADE_S);
    this.update(d);
    runTimers(this);
    k.burst.update(d);
    k.shake *= Math.exp(-d * 9);
    if (k.shake < 0.3) k.shake = 0;
    k.flash = Math.max(0, k.flash - d / FLASH_S);
    for (const f of k.floats) f.life += d;
    k.floats = k.floats.filter((f) => f.life < FLOAT_S);
    // A busy() that is a clock predicate ("busy for 0.8 s after the verdict")
    // ends with no control-bar refresh of its own, leaving every control stuck
    // in its busy state. keepAwake() holds the loop open past the transition, so
    // this edge is always seen.
    const busy = !!this.busy();
    if (k.wasBusy && !busy) this.requestUiUpdate?.();
    k.wasBusy = busy;
    keepAwake(this, busy || k.fade < 1 || k.burst.alive || k.timers.length > 0
      || k.shake > 0 || k.flash > 0 || k.floats.length > 0);
    drawFrame(this, ctx);
  }

  _drawInitialFrame(ctx) {
    if (this.colors) drawFrame(this, ctx);
  }

  /** The find (x, y: the thing found, centre of the frame if left out). See SimFind.js. */
  celebrate(x, y, n = 32, o = {}) {
    if (x && typeof x === 'object') { o = x; x = undefined; y = undefined; }   // celebrate({ stamp })
    const c = this.colors;
    const mode = findMode();
    if (!c || mode === 'none') return;
    const k = this._k;
    const C = this.constructor;
    const px = Number.isFinite(x) ? x : C.WIDTH / 2;
    const py = Number.isFinite(y) ? y : C.HEIGHT / 2;
    const still = reducedMotion();
    // The casefile setting: the find is a stamp (o.stamp: the word, default CONFIRMED), whatever the look.
    const casefile = resolveSetting(this._setting ?? settingOf(this.container, C.SETTING), lookOf(), paperKindOf(this.container, C.PAPER)) === 'casefile';
    if (casefile) k.burst.stamp(px, py, o.stamp, c.annot ?? c.bad, c.fontMono ?? 'monospace', still);
    else if (mode === 'tick') k.burst.tick(px, py, c.good, c.bgSurface);
    else k.burst.ring(px, py, c.good, FIND_RING_R, 0.6, 8, still);
    // No pop on canvas: there is no found element to scale, and scaling a patch of the frame tears line art.
    if (mode === 'quill' && !casefile && !still && lookOf().popSparkles) k.burst.twinkle(px, py, [c.warning, c.s1, c.s4], 6, FIND_RING_R);
    this.animateFor?.();
    if (!o.quiet) emitFind({ ...canvasPoint(this, px, py), host: this.container, thing: { vague: !(Number.isFinite(x) && Number.isFinite(y)) || undefined }, key: o.key, lookAt: o.lookAt, small: o.small ?? (n < 14 || undefined) });
  }

  /** A miss: a short shake and a red ring at (x, y). */
  oops(x, y) {
    const c = this.colors;
    if (!c) return;
    this._k.burst.ring(x, y, c.bad, 80, 0.45, 6);
    this.shake(7);
  }

  /** Screen shake of about px pixels, decaying in ~0.4 s. */
  shake(px = 8) {
    if (reducedMotion()) return;
    this._k.shake = Math.max(this._k.shake, px * lookOf().shake);
    this.animateFor?.();
  }

  /** A brief warm flash over the frame (k: strength 0..1). */
  flash(k = 1) {
    if (reducedMotion()) return;
    this._k.flash = Math.max(this._k.flash, Math.min(1, k));
    this.animateFor?.();
  }

  /** A chip that pops in at (x, y), rises and fades: "+1", "full!". o: { bg, size }. */
  floatText(text, x, y, o = {}) {
    this._k.floats.push({ text, x, y, bg: o.bg, size: o.size ?? 16, life: 0 });
    this.animateFor?.();
  }

  // -- Hooks ------------------------------------------------------------------------

  enter() {}
  update() {}
  busy() { return false; }
  draw() {}
  noteRows() { return []; }
  pointerDown() {}
  pointerMove() {}
  pointerUp() {}
}

// -- Private helpers (module functions, so they claim no names on the scene) --------

function mapFor(scene, beatCount) {
  const C = scene.constructor;
  return normalizeBeatMap(C.BEAT_MAPS?.[beatCount] ?? C.BEAT_STEP_MAP ?? [[{ idx: 0 }]], C.name);
}

function enterStage(scene, stage) {
  const k = scene._k;
  k.stage = stage;
  k.age = 0;
  k.fade = reducedMotion() || !scene.constructor.IRIS ? 1 : 0;
  k.epoch += 1;
  k.timers = [];
  scene.enter(stage);
  scene.requestUiUpdate?.();
}

function runTimers(scene) {
  const k = scene._k;
  if (!k.timers.length) return;
  const due = k.timers.filter((j) => j.at <= k.clock);
  if (!due.length) return;
  k.timers = k.timers.filter((j) => j.at > k.clock && j.epoch === k.epoch);
  for (const j of due) {
    if (j.epoch !== k.epoch) continue;   // an earlier callback changed the stage
    j.fn();
  }
  scene.requestUiUpdate?.();
}

function drawFrame(scene, ctx) {
  const C0 = scene.constructor;
  setFrame(C0.WIDTH, C0.HEIGHT);   // the full-canvas SimLook helpers paint THIS scene's frame, not the 680 x 520 default
  setProfile(C0.VISUAL_PROFILE);   // and in THIS scene's visual profile (static VISUAL_PROFILE = 'rich'; default lite)
  setPaper(scene._paperKind ??= paperKindOf(scene.container, C0.PAPER));   // on THIS course's paper (maths: graph)
  setSetting(scene._setting ??= settingOf(scene.container, C0.SETTING));   // and THIS course's faint setting (chemistry: lab)
  try { drawFrameInner(scene, ctx); } finally { setFrame(null); setProfile(null); setPaper(null); setSetting(null); }
}

function drawFrameInner(scene, ctx) {
  const k = scene._k;
  const c = scene.colors;
  const C = scene.constructor;
  const w = C.WIDTH, h = C.HEIGHT;
  if (k.dpr > 1) ctx.setTransform(k.dpr, 0, 0, k.dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  if (k.shake > 0) ctx.translate(Math.sin(k.clock * 61) * k.shake, Math.cos(k.clock * 47) * k.shake * 0.6);
  scene.draw(ctx, c, k.clock);
  k.burst.draw(ctx);
  for (const f of k.floats) {
    const u = f.life / FLOAT_S;
    const still = reducedMotion();
    const pop = still ? 1 : outBack(f.life / 0.3);
    pill(ctx, c, f.text, f.x, f.y - (still ? 0 : 46 * inOutSine(u)), {
      bg: f.bg ?? c.warning, size: f.size, display: true, scale: pop, alpha: u > 0.7 ? (1 - u) / 0.3 : 1,
    });
  }
  ctx.restore();
  if (k.flash > 0) {
    ctx.fillStyle = alpha(lighten(c.warning, 0.7), 0.3 * k.flash);
    ctx.fillRect(0, 0, w, h);
  }
  if (C.NOTE_STAGE >= 0) {
    if (C.NOTE_STYLE === 'card') {
      if (k.stage === C.NOTE_STAGE) drawNoteCard(ctx, c, { age: k.age, t: k.clock, dim: true, title: C.NOTE_TITLE, rows: scene.noteRows(c) });
    } else if (k.stage >= C.NOTE_STAGE) {
      drawNoteLine(ctx, c, { age: k.age, rows: scene.noteRows(c) });
    }
  }
  if (k.fade < 1 && lookOf().reveal !== 'iris') {
    ctx.fillStyle = alpha(c.bgDeep, 1 - inOutSine(k.fade));
    ctx.fillRect(0, 0, w, h);
  } else if (k.fade < 1) {
    // Iris-in from the centre, with an accent rim on the opening.
    const e = inOutSine(k.fade);
    const r = Math.hypot(w, h) * 0.55 * e;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(w / 2, h / 2, Math.max(0.5, r), 0, Math.PI * 2, true);
    ctx.fillStyle = alpha(c.bgDeep, 1 - e * 0.25);
    ctx.fill('evenodd');
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.max(0.5, r), 0, Math.PI * 2);
    ctx.strokeStyle = alpha(c.accent, 1 - e);
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
  }
}

function onPointer(scene, kind, e) {
  const cv = scene._canvas;
  if (!cv || !scene.colors) return;
  scene.animateFor();                              // pointer events grant no budget on their own
  const r = cv.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const C = scene.constructor;
  const p = { x: ((e.clientX - r.left) / r.width) * C.WIDTH, y: ((e.clientY - r.top) / r.height) * C.HEIGHT };
  if (kind === 'down') {
    try { cv.setPointerCapture?.(e.pointerId); } catch (_) { /* synthetic events */ }
    scene.pointerDown(p);
  } else if (kind === 'move') {
    if (!scene.pointerMove(p)) return;             // a move refreshes the bar only when a hook asks
  } else scene.pointerUp(p);
  scene.requestUiUpdate?.();
}
