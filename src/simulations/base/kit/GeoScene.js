/**
 * GeoScene - the WebGL (three.js) look-kit base for geography/earth scenes where
 * height, rotation or depth is the teaching point (a cutaway Earth, a valley
 * being cut). Maps and cross-sections are 2D: use SimScene + GeoMap instead.
 * Same authoring shape as SimScene. A subclass declares BEAT_STEP_MAP / CONTROLS /
 * ARIA_LABEL / SHOTS and fills in
 *   build(T, c)       make the scene graph (T = THREE, c = colours). Called on
 *                     setup AND after a lost GPU context is restored, so keep
 *                     all model state in this.v / own fields, never in meshes.
 *   enter(stage)      start a stage: this.shot(), this.tweenTo(), this.labelOn()
 *   update(d)         pose meshes from the model every frame (d seconds, <= 0.05)
 *   busy()            true while something that matters still moves
 *
 * Statics: WIDTH/HEIGHT 680x520, FOV 40, BACKDROP 'space' | 'sky' (the course's setting, kit/SimWorld.js; the old sky gradient on the paper settings) | 'none' (a CSS
 * gradient from tokens behind a transparent canvas, right in both themes),
 * SHOTS { name: { pos: [x,y,z], look: [x,y,z], fov? } }, ORBIT (drag to look
 * around; touch keeps vertical page scroll), ORBIT_LIMITS { min, max } distance,
 * COLOR_MAP (default GEO_COLOR_MAP), FALLBACK { src, alt } image shown when the
 * device has no WebGL (absolute URL: new URL('x.png', import.meta.url).href).
 *
 * Helpers:
 *   this.c / this.color(key)        resolved token strings / a THREE.Color
 *   this.mat(key, o, kind)          MeshStandardMaterial ('lambert', 'basic') tinted by
 *                                   a token; o.emissive = token key; re-tinted on theme change
 *   this.tint(obj, key, prop)       register any colour prop (lights, lines) for re-tint;
 *                                   tint(fn) calls fn(c) now and on every theme change
 *   this.lights(o)                  hemisphere + warm key + cool rim preset
 *   this.shot(name | pose, s)       eased camera move (arcs round the look point; a cut under reduced motion)
 *   this.resetView()                back to the current stage's shot
 *   this.label(id, text, anchor, o) HTML chip on an Object3D/Vector3; o: { key: chip
 *                                   token (accent, warning, good, s1..s8), sub, side:
 *                                   'up'|'down'|'left'|'right', lift, face: outward
 *                                   normal (Vector3, or (camPos) => bool) to hide it
 *                                   behind the hero }. labelOn(id, on), labelText(id, t)
 *   this.hud(slot, text)            corner chip: 'tl' | 'tr' | 'bl' (null hides); 'br' = muted credit line
 *   this.tweenTo(k, v, s) / this.v  eased model values (resume-safe: final value is set)
 *   this.after(s, fn)               scene-clock timer, dropped on a stage change
 *   this.celebrate(anchor, o)       the find: a small ring and pop at a 3D point (CSS, no loop), then the
 *                                   cue (SimFind.js); o: { key, lookAt, small, quiet }
 *   this.lowEnd                     true on weak devices: use fewer segments
 * Reserved names (do not declare in a subclass): _k, c, v, stage, age, clock,
 * beatCount, lowEnd, and every helper above, plus the engine base's
 * _running _rafId _lastTs _hasStarted _animateUntil _tick step renderFrame
 * scene camera renderer THREE unsupported.
 */
import { WebGLSimulation } from 'simulations/base/WebGLSimulation.js';
import { reducedMotion } from './SimAnim.js';
import { normalizeBeatMap } from './beatMap.js';
import { loadColors, inOutSine, keepAwake, luma } from './SimLook.js';
import { useLook, lookOf } from './lookProfile.js';
import { paperKindOf, settingOf, resolveSetting } from './paperKind.js';
import { SIM_WORLD_CSS } from './SimWorld.js';
import { findMode, emitFind, stagePoint } from './SimFind.js';
import { GEO_COLOR_MAP } from './GeoLook.js';

const CSS = `
.gs-frame { position: relative; width: 100%; overflow: hidden; border-radius: calc(14px * var(--look-radius)); --gs: 1;
  font-family: var(--sim-font, 'Nunito', system-ui, sans-serif); }
.gs-frame > canvas { position: relative; z-index: 1; }
.gs-frame.gs-space { background:
  radial-gradient(1.5px 1.5px at 12% 18%, color-mix(in srgb, var(--sim-label) 70%, transparent), transparent),
  radial-gradient(1.5px 1.5px at 83% 12%, color-mix(in srgb, var(--sim-label) 60%, transparent), transparent),
  radial-gradient(2px 2px at 70% 78%, color-mix(in srgb, var(--sim-label) 50%, transparent), transparent),
  radial-gradient(1.5px 1.5px at 22% 70%, color-mix(in srgb, var(--sim-label) 55%, transparent), transparent),
  radial-gradient(1.5px 1.5px at 44% 8%, color-mix(in srgb, var(--sim-label) 45%, transparent), transparent),
  radial-gradient(1.5px 1.5px at 92% 55%, color-mix(in srgb, var(--sim-label) 50%, transparent), transparent),
  radial-gradient(ellipse at 50% 45%, color-mix(in srgb, var(--sim-accent) 16%, var(--sim-bg-surface)) 0%, var(--sim-bg-deep) 72%); }
.gs-frame.gs-sky { background: linear-gradient(180deg,
  color-mix(in srgb, var(--sim-sky-day) 75%, var(--sim-bg-deep)) 0%,
  color-mix(in srgb, var(--sim-sky-day) 30%, var(--sim-bg-deep)) 70%,
  color-mix(in srgb, var(--sim-sky-dusk) 22%, var(--sim-bg-deep)) 100%); }
.gs-layer { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.gs-lbl { position: absolute; left: 0; top: 0; width: 0; height: 0; will-change: transform; }
.gs-lbl .gs-in { transition: opacity .35s ease, transform .45s var(--look-spring); }
.gs-lbl:not(.on) .gs-in { opacity: 0; transform: scale(.7); }
.gs-dot { position: absolute; width: calc(10px * var(--gs)); height: calc(10px * var(--gs)); margin: calc(-5px * var(--gs));
  border-radius: 50%; background: var(--gs-bg); box-shadow: 0 0 0 calc(3px * var(--gs)) color-mix(in srgb, var(--gs-bg) 35%, transparent); }
.gs-stem { position: absolute; background: var(--gs-bg); }
.gs-chip { position: absolute; white-space: nowrap; background: var(--gs-bg); color: var(--gs-ink);
  font-weight: 800; font-size: max(12px, calc(15px * var(--gs))); line-height: 1.15;
  padding: calc(5px * var(--gs)) calc(11px * var(--gs)); border-radius: var(--look-pill);
  box-shadow: 0 calc(3px * var(--gs)) 0 color-mix(in srgb, var(--gs-bg) 55%, var(--sim-bg-deep)); }
.gs-chip small { display: block; font-weight: 700; font-size: max(11px, calc(13px * var(--gs))); opacity: .85; }
.gs-hud { position: absolute; z-index: 3; pointer-events: none; font-weight: 800;
  font-size: max(12px, calc(15px * var(--gs))); padding: calc(6px * var(--gs)) calc(12px * var(--gs)); border-radius: var(--look-pill);
  background: var(--sim-warning); color: var(--sim-bg-deep); transition: opacity .3s ease; }
.gs-hud.tl { left: calc(14px * var(--gs)); top: calc(12px * var(--gs)); }
.gs-hud.tr { right: calc(14px * var(--gs)); top: calc(12px * var(--gs)); background: var(--sim-accent); }
.gs-hud.bl { left: calc(14px * var(--gs)); bottom: calc(12px * var(--gs)); background: var(--sim-surface-raised); color: var(--sim-label); }
.gs-hud.br { right: calc(14px * var(--gs)); bottom: calc(12px * var(--gs)); background: color-mix(in srgb, var(--sim-bg-surface) 85%, transparent);
  color: var(--sim-label-muted); font-weight: 700; font-size: max(12px, calc(13px * var(--gs))); }
.gs-hud.off { opacity: 0; }
.gs-ring { position: absolute; box-sizing: border-box; width: calc(130px * var(--gs)); height: calc(130px * var(--gs));
  margin: calc(-65px * var(--gs)) 0 0 calc(-65px * var(--gs)); border-radius: 50%; border: calc(7px * var(--gs)) solid var(--sim-good);
  animation: gs-ring .6s ease-out forwards; }
.gs-tick { position: absolute; box-sizing: border-box; width: 32px; height: 32px; margin: -16px 0 0 -16px; border: 1.5px solid var(--sim-good); border-radius: 50%;
  background: var(--sim-bg-surface); animation: gs-fade .3s ease-in .6s forwards; }
.gs-tick::after { content: ''; position: absolute; left: 10px; top: 6px; width: 7px; height: 13px; border: solid var(--sim-good); border-width: 0 2px 2px 0; transform: rotate(42deg); }
.gs-ring.still { animation: gs-fade .9s ease-in forwards; }
.gs-pop { position: absolute; width: calc(64px * var(--gs)); height: calc(64px * var(--gs)); margin: calc(-32px * var(--gs)) 0 0 calc(-32px * var(--gs));
  background: var(--sim-warning); clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
  animation: gs-pop var(--pop) var(--look-spring) both, gs-fade .4s ease-in .3s forwards; }
.gs-spark { position: absolute; width: calc(18px * var(--gs)); height: calc(18px * var(--gs)); margin: calc(-9px * var(--gs)) 0 0 calc(-9px * var(--gs));
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
  animation: gs-spark .7s ease-out forwards; }
@keyframes gs-ring { from { transform: scale(.25); opacity: 1; } to { transform: scale(1); opacity: 0; } }
@keyframes gs-pop { from { transform: scale(.3); } to { transform: scale(1); } }
@keyframes gs-fade { to { opacity: 0; } }
@keyframes gs-spark { from { transform: translate(0,0) scale(.4); opacity: 1; } to { transform: translate(var(--dx), var(--dy)) scale(1); opacity: 0; } }
.gs-fallback { display: block; width: 100%; height: auto; }
`;

export class GeoScene extends WebGLSimulation {
  static WIDTH = 680;
  static HEIGHT = 520;
  static FOV = 40;
  static TRANSPARENT = true;
  static CONTINUOUS = false;
  // Beats/controls grant 0.4 s, not the base 8 s: GeoScene keeps itself awake exactly
  // while a shot, tween, timer or busy() runs (a GPU frame is costly on low-end devices).
  static DEFAULT_TRANSITION_MS = 400;
  static BACKDROP = 'space';
  static SHOTS = {};
  static ORBIT = false;
  static ORBIT_LIMITS = { min: 2, max: 40 };
  static COLOR_MAP = GEO_COLOR_MAP;
  static FALLBACK = null;

  constructor(container, config) {
    const frame = document.createElement('div');
    frame.className = 'gs-frame';
    container.appendChild(frame);
    super(frame, config);
    this.config = config;
    this.allowResume = true;
    this.c = null;
    this.v = {};
    this.beatCount = 0;
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    this._k = {
      host: container, frame, layer: null, stage: -1, age: 0, clock: 0, epoch: 0,
      timers: [], ctl: {}, tweens: new Map(), cam: null, look: null, shotName: null,
      labels: new Map(), huds: {}, tinted: [], controls: null, wasBusy: false,
      lowEnd: (nav.deviceMemory ?? 8) <= 2 || (nav.hardwareConcurrency ?? 8) <= 4,
    };
    const own = this.onControlChange;
    this.onControlChange = (id, v) => { this._k.ctl[id] = v; return own.call(this, id, v); };
  }

  get stage() { return this._k.stage; }
  get age() { return this._k.age; }
  get clock() { return this._k.clock; }
  get lowEnd() { return this._k.lowEnd; }

  async setup() {
    const looking = useLook(this.container);
    if (looking) await looking;
    const k = this._k;
    const C = this.constructor;
    if (!k.frame.querySelector('style')) {
      const st = document.createElement('style');
      st.textContent = CSS;
      k.frame.appendChild(st);
    }
    if (C.BACKDROP === 'sky') {
      // The sky frame is the course's world (kit/SimWorld.js): the same setting every other scene stands in, under the WebGL canvas.
      k.frame.dataset.simSetting = resolveSetting(settingOf(this.container, C.SETTING), lookOf(), paperKindOf(this.container, C.PAPER));
      if (!k.frame.querySelector('.sl-world')) {
        const st = document.createElement('style');
        st.textContent = SIM_WORLD_CSS;
        k.frame.appendChild(st);
        const world = document.createElement('div');
        world.className = 'sl-world';
        world.setAttribute('aria-hidden', 'true');
        k.frame.insertBefore(world, k.frame.firstChild);
      }
      if (k.frame.dataset.simSetting === 'riso' || k.frame.dataset.simSetting === 'lab' || k.frame.dataset.simSetting === 'graph') k.frame.classList.add('gs-sky');
    } else if (C.BACKDROP !== 'none') k.frame.classList.add(`gs-${C.BACKDROP}`);
    k.frame.setAttribute('role', 'img');
    if (C.ARIA_LABEL) k.frame.setAttribute('aria-label', C.ARIA_LABEL);
    await super.setup();
    this._reloadColors();
    if (this.unsupported) return;
    const T = this.THREE;
    if (k.lowEnd) this.renderer.setPixelRatio(1);
    k.look = new T.Vector3();
    k.layer = document.createElement('div');
    k.layer.className = 'gs-layer';
    k.frame.appendChild(k.layer);
    if (C.ORBIT) {
      const OC = await this.loadOrbitControls();
      const oc = new OC(this.camera, this.renderer.domElement);
      oc.enableDamping = true;
      oc.enablePan = false;
      oc.minDistance = C.ORBIT_LIMITS.min;
      oc.maxDistance = C.ORBIT_LIMITS.max;
      oc.addEventListener('start', () => { k.cam = null; });
      oc.addEventListener('change', () => this.animateFor(800));
      this.renderer.domElement.style.touchAction = 'pan-y';
      k.controls = oc;
    }
    this.build(T, this.c);
    k.ready = true;
    enterStage(this, k.pending ?? mapFor(this, this.beatCount)?.[0]?.[0]?.idx ?? 0);
    finishCamera(this);
    this.update(0);
    this.renderFrame();
  }

  destroy() {
    const k = this._k;
    k.controls?.dispose();
    k.controls = null;
    k.timers = [];
    super.destroy();
    k.frame.remove();
  }

  _reloadColors() {
    this.c = loadColors(this.container, this.constructor.COLOR_MAP);
    if (!this.THREE) return;
    for (const t of this._k.tinted) {
      if (t.fn) t.fn(this.c);
      else t.obj[t.prop]?.set?.(this.c[t.key]);
    }
    for (const l of this._k.labels.values()) paintLabel(this, l);
  }

  color(key) { return new this.THREE.Color(this.c[key]); }

  mat(key, o = {}, kind = 'standard') {
    const T = this.THREE;
    const { emissive, ...rest } = o;
    const Cls = kind === 'basic' ? T.MeshBasicMaterial : kind === 'lambert' ? T.MeshLambertMaterial : T.MeshStandardMaterial;
    const m = new Cls(kind === 'standard' ? { roughness: 0.85, ...rest } : rest);
    if (key) this.tint(m, key, 'color');
    if (emissive) this.tint(m, emissive, 'emissive');
    return m;
  }

  tint(obj, key, prop = 'color') {
    if (typeof obj === 'function') { this._k.tinted.push({ fn: obj }); obj(this.c); return obj; }
    this._k.tinted.push({ obj, key, prop });
    obj[prop]?.set?.(this.c[key]);
    return obj;
  }

  lights(o = {}) {
    const T = this.THREE;
    const hemi = this.tint(this.tint(new T.HemisphereLight(0xffffff, 0x000000, o.fill ?? 1.3), 'skyDay'), 'strata6', 'groundColor');
    const key = this.tint(new T.DirectionalLight(0xffffff, o.key ?? 2.2), 'warning');
    key.position.set(...(o.keyPos ?? [5, 6, 4]));
    const rim = this.tint(new T.DirectionalLight(0xffffff, o.rim ?? 0.9), 'accent');
    rim.position.set(...(o.rimPos ?? [-6, 2, -5]));
    this.scene.add(hemi, key, rim);
    return { hemi, key, rim };
  }

  // -- Beats, stages, timers ------------------------------------------------------

  onBeatChange(beatIndex, beatCount) {
    const map = mapFor(this, beatCount);
    this.beatCount = beatCount;
    const b = Math.max(0, Math.min(map.length - 1, Math.trunc(Number.isFinite(beatIndex) ? beatIndex : 0)));
    const stage = map[b]?.[0]?.idx ?? 0;
    if (!this._k.ready) this._k.pending = stage;   // setup() still loading three.js
    else if (stage !== this._k.stage && !this.unsupported) enterStage(this, stage);
    this.animateFor?.(300);
    this.requestUiUpdate?.();
  }

  after(seconds, fn) {
    const k = this._k;
    const job = { at: k.clock + Math.max(0, seconds), epoch: k.epoch, fn };
    k.timers.push(job);
    this.animateFor?.(Math.max(0, seconds) * 1000 + 100);
    return () => { k.timers = k.timers.filter((j) => j !== job); };
  }

  tweenTo(key, value, seconds = 1) {
    const k = this._k;
    if (reducedMotion()) seconds = 0;   // reduced motion: land on the final value
    if (seconds <= 0 || this.v[key] === undefined) { this.v[key] = value; k.tweens.delete(key); return; }
    k.tweens.set(key, { from: this.v[key], to: value, t: 0, dur: seconds });
    this.animateFor?.(seconds * 1000 + 100);
  }

  // -- Camera -----------------------------------------------------------------------

  shot(nameOrPose, seconds = 1.4) {
    const k = this._k;
    if (reducedMotion()) seconds = 0;   // reduced motion: a cut, not a camera move
    const pose = typeof nameOrPose === 'string' ? this.constructor.SHOTS[nameOrPose] : nameOrPose;
    if (!pose || !this.camera) return;
    if (typeof nameOrPose === 'string') k.shotName = nameOrPose;
    const T = this.THREE;
    const look = new T.Vector3(...(pose.look ?? [0, 0, 0]));
    const pos = new T.Vector3(...pose.pos);
    k.cam = {
      from: sph(this.camera.position, k.look), to: sph(pos, look),
      look0: k.look.clone(), look1: look, fov0: this.camera.fov, fov1: pose.fov ?? this.constructor.FOV,
      t: 0, dur: Math.max(0.001, seconds),
    };
    if (seconds <= 0) finishCamera(this);
    this.animateFor?.(seconds * 1000 + 200);
  }

  resetView(seconds = 1) { if (this._k.shotName) this.shot(this._k.shotName, seconds); }

  // -- Labels, HUD, juice -------------------------------------------------------------

  label(id, text, anchor, o = {}) {
    const k = this._k;
    if (!k.layer) return;
    k.labels.get(id)?.el.remove();
    const el = document.createElement('div');
    el.className = 'gs-lbl';
    el.innerHTML = '<div class="gs-in"><i class="gs-dot"></i><i class="gs-stem"></i><div class="gs-chip"><b></b></div></div>';
    k.layer.appendChild(el);
    const l = { id, el, chip: el.querySelector('.gs-chip'), stem: el.querySelector('.gs-stem'), anchor, o, on: false, w: 0, h: 0 };
    k.labels.set(id, l);
    this.labelText(id, text, o.sub);
    paintLabel(this, l);
    return l;
  }

  labelOn(id, on = true) {
    const l = this._k.labels.get(id);
    if (!l) return;
    l.on = !!on;
    l.el.classList.toggle('on', l.on);
    placeLabels(this);
  }

  labelText(id, text, sub) {
    const l = this._k.labels.get(id);
    if (!l) return;
    l.chip.querySelector('b').textContent = text;
    l.chip.querySelector('small')?.remove();
    if (sub) { const s = document.createElement('small'); s.textContent = sub; l.chip.appendChild(s); }
    l.w = 0;
  }

  hud(slot, text) {
    const k = this._k;
    let el = k.huds[slot];
    if (!el) {
      el = document.createElement('div');
      el.className = `gs-hud ${slot} off`;
      k.frame.appendChild(el);
      k.huds[slot] = el;
    }
    if (text != null) el.textContent = text;
    el.classList.toggle('off', text == null);
  }

  celebrate(anchor, o = {}) {
    const mode = findMode();
    const k = this._k;
    if (mode === 'none') return;
    const p = anchor ? project(this, anchor) : { x: k.frame.clientWidth / 2, y: k.frame.clientHeight / 2 };
    if (!p || !k.layer) return;
    const add = (cls, css) => {
      const d = document.createElement('i');
      d.className = cls;
      d.style.cssText = `left:${p.x}px;top:${p.y}px;${css}`;
      d.addEventListener('animationend', (e) => { if (e.animationName !== 'gs-pop') d.remove(); });
      k.layer.appendChild(d);
    };
    const still = reducedMotion();
    add(mode === 'tick' ? 'gs-tick' : still ? 'gs-ring still' : 'gs-ring', '');
    if (mode === 'quill' && !still) {
      const look = lookOf();
      add('gs-pop', `--pop:${look.popS}s`);
      if (look.popSparkles) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.random() * 0.5, r = 60 + Math.random() * 30;
          add('gs-spark', `background:var(--sim-${['warning', 'series-1', 'series-4'][i % 3]});--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px`);
        }
      }
    }
    if (!o.quiet) emitFind({ ...stagePoint(k.frame, p.x, p.y, k.frame.clientWidth, k.frame.clientHeight), host: this.container, thing: { vague: !anchor || undefined }, key: o.key, lookAt: o.lookAt, small: o.small });
  }

  // -- Controls (defaults, same contract as SimScene) ----------------------------------

  isControlHidden() { return false; }
  isControlDisabled() { return false; }
  getControlValue(id) {
    const v = this._k.ctl[id];
    return v !== undefined ? v : this.constructor.CONTROLS?.find((c) => c.id === id)?.value;
  }
  onControlChange() {}

  // -- Frame ------------------------------------------------------------------------

  _tick(dt) {
    if (this.unsupported || !this.c || !this.camera || !this._k.look) return;
    const k = this._k;
    const d = Math.max(0, Math.min(dt, 0.05));
    k.clock += d;
    k.age += d;
    for (const [key, tw] of k.tweens) {
      tw.t = Math.min(1, tw.t + d / tw.dur);
      this.v[key] = tw.from + (tw.to - tw.from) * inOutSine(tw.t);
      if (tw.t >= 1) k.tweens.delete(key);
    }
    if (k.cam) {
      k.cam.t = Math.min(1, k.cam.t + d / k.cam.dur);
      poseCamera(this, inOutSine(k.cam.t));
      if (k.cam.t >= 1) k.cam = null;
    }
    k.controls?.update();
    this.update(d);
    runTimers(this);
    const busy = !!this.busy();
    if (k.wasBusy && !busy) this.requestUiUpdate?.();
    k.wasBusy = busy;
    keepAwake(this, busy || k.cam || k.tweens.size > 0 || k.timers.length > 0);
    placeLabels(this);
  }

  renderFrame() {
    super.renderFrame();
    if (this.camera && this._k.look) placeLabels(this);
  }

  _onContextRestored() {
    if (!this.scene) return;
    this._disposeObject3D(this.scene);
    this.scene.clear();
    this._k.tinted = [];
    this.build(this.THREE, this.c);
    this.update(0);
    this.animateFor(300);
  }

  _renderFallback() {
    const f = this.constructor.FALLBACK;
    if (!f?.src) { super._renderFallback(); return; }
    const img = document.createElement('img');
    img.className = 'gs-fallback';
    img.src = f.src;
    img.alt = f.alt ?? this.constructor.ARIA_LABEL ?? '';
    this.container.appendChild(img);
    this._fallbackEl = img;
  }

  // -- Hooks ------------------------------------------------------------------------

  build() {}
  enter() {}
  update() {}
  busy() { return false; }
}

// -- Private helpers (module functions: they claim no names on the scene) ----------

function mapFor(scene, beatCount) {
  const C = scene.constructor;
  return normalizeBeatMap(C.BEAT_MAPS?.[beatCount] ?? C.BEAT_STEP_MAP ?? [[{ idx: 0 }]], C.name);
}

function enterStage(scene, stage) {
  const k = scene._k;
  k.stage = stage;
  k.age = 0;
  k.epoch += 1;
  k.timers = [];
  // A tween still running from the previous stage lands on its target now, so a
  // stage never depends on how long the previous one was watched.
  for (const [key, tw] of k.tweens) scene.v[key] = tw.to;
  k.tweens.clear();
  scene.enter(stage);
  scene.requestUiUpdate?.();
}

function runTimers(scene) {
  const k = scene._k;
  if (!k.timers.length) return;
  const due = k.timers.filter((j) => j.at <= k.clock);
  if (!due.length) return;
  k.timers = k.timers.filter((j) => j.at > k.clock && j.epoch === k.epoch);
  for (const j of due) if (j.epoch === k.epoch) j.fn();
  scene.requestUiUpdate?.();
}

function sph(pos, look) {
  const o = pos.clone().sub(look);
  const r = Math.max(1e-6, o.length());
  return { r, pol: Math.acos(Math.max(-1, Math.min(1, o.y / r))), az: Math.atan2(o.x, o.z) };
}

function poseCamera(scene, e) {
  const k = scene._k, cm = k.cam, cam = scene.camera;
  let daz = cm.to.az - cm.from.az;
  if (daz > Math.PI) daz -= Math.PI * 2;
  if (daz < -Math.PI) daz += Math.PI * 2;
  const r = cm.from.r + (cm.to.r - cm.from.r) * e;
  const pol = cm.from.pol + (cm.to.pol - cm.from.pol) * e;
  const az = cm.from.az + daz * e;
  k.look.lerpVectors(cm.look0, cm.look1, e);
  cam.position.set(k.look.x + r * Math.sin(pol) * Math.sin(az), k.look.y + r * Math.cos(pol), k.look.z + r * Math.sin(pol) * Math.cos(az));
  cam.fov = cm.fov0 + (cm.fov1 - cm.fov0) * e;
  cam.updateProjectionMatrix();
  cam.lookAt(k.look);
  if (k.controls) k.controls.target.copy(k.look);
}

function finishCamera(scene) {
  const k = scene._k;
  if (!k.cam) return;
  k.cam.t = 1;
  poseCamera(scene, 1);
  k.cam = null;
}

function worldOf(scene, anchor) {
  const T = scene.THREE;
  if (anchor?.isObject3D) return anchor.getWorldPosition(new T.Vector3());
  if (anchor?.isVector3) return anchor.clone();
  return new T.Vector3(...(anchor ?? [0, 0, 0]));
}

function project(scene, anchor) {
  const cv = scene.renderer?.domElement;
  if (!cv) return null;
  const p = worldOf(scene, anchor).project(scene.camera);
  if (p.z > 1) return null;
  return { x: (p.x + 1) / 2 * cv.clientWidth, y: (1 - p.y) / 2 * cv.clientHeight };
}

function paintLabel(scene, l) {
  const c = scene.c;
  const bg = c[l.o.key ?? 'accent'] ?? c.accent;
  l.el.style.setProperty('--gs-bg', bg);
  l.el.style.setProperty('--gs-ink', luma(bg) > luma(c.bgDeep) ? c.bgDeep : c.label);
}

function placeLabels(scene) {
  const k = scene._k;
  const cv = scene.renderer?.domElement;
  const W = cv?.clientWidth, H = cv?.clientHeight;
  if (!W) return;
  const g = W / scene.constructor.WIDTH;
  if (g !== k.g) {
    k.g = g;
    k.frame.style.setProperty('--gs', g.toFixed(3));
    for (const l of k.labels.values()) l.w = 0;   // chip sizes follow --gs
  }
  const camPos = scene.camera.position;
  for (const l of k.labels.values()) {
    if (!l.on) continue;
    const wp = worldOf(scene, l.o.anchorOverride ?? l.anchor);
    let hidden = false;
    const face = l.o.face;
    if (typeof face === 'function') hidden = !face(camPos, wp);
    else if (face?.isVector3) hidden = face.dot(camPos.clone().sub(wp)) < 0;
    const p = wp.clone().project(scene.camera);
    if (p.z > 1) hidden = true;
    l.el.style.visibility = hidden ? 'hidden' : '';
    if (hidden) continue;
    const x = (p.x + 1) / 2 * W, y = (1 - p.y) / 2 * H;
    l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    if (!l.w) { l.w = l.chip.offsetWidth; l.h = l.chip.offsetHeight; }
    const side = l.o.side ?? 'up', lift = (l.o.lift ?? 34) * g, m = 6 * g;
    let cx, cy;
    if (side === 'up' || side === 'down') {
      cx = Math.max(m - x, Math.min(W - m - x - l.w, -l.w / 2));
      cy = side === 'up' ? -lift - l.h : lift;
      Object.assign(l.stem.style, { left: `${-g}px`, width: `${2 * g}px`, top: side === 'up' ? `${-lift}px` : '0px', height: `${lift}px` });
    } else {
      cx = side === 'right' ? lift : -lift - l.w;
      cx = Math.max(m - x, Math.min(W - m - x - l.w, cx));
      cy = -l.h / 2;
      Object.assign(l.stem.style, { top: `${-g}px`, height: `${2 * g}px`, left: side === 'right' ? '0px' : `${-lift}px`, width: `${lift}px` });
    }
    cy = Math.max(m - y, Math.min(H - m - y - l.h, cy));
    l.chip.style.left = `${cx.toFixed(1)}px`;
    l.chip.style.top = `${cy.toFixed(1)}px`;
  }
}
