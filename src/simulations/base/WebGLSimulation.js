import { SimulationBase } from './SimulationBase.js';
import { ErrorReporter } from '../../core/ErrorReporter.js';

// Module-level singleton so three.js is loaded exactly once per page,
// regardless of how many WebGL simulations are mounted.
let _threeModule = null;

/**
 * WebGLSimulation — Abstract base for three.js-driven 3D scenes.
 *
 * Adds renderer/scene/camera wiring on top of SimulationBase's rAF loop.
 * three.js is loaded lazily on first call to setup() — never eager (see
 * vendor/three/, populated by tools/vendor-setup.sh). OrbitControls and
 * GLTFLoader are separate, even-lazier imports (loadOrbitControls() /
 * loadGLTFLoader()) — call them from a subclass's own setup() only if that
 * scene actually needs camera-drag or an authored .glb/.gltf model; most
 * scenes need neither and shouldn't pay to parse them.
 *
 * Subclasses override setup() to build the scene graph:
 *
 *   async setup() {
 *     await super.setup();               // creates scene/camera/renderer
 *     const T = this.THREE;
 *     const box = new T.Mesh(new T.BoxGeometry(1,1,1), new T.MeshStandardMaterial());
 *     this.scene.add(box);
 *     this.scene.add(new T.HemisphereLight(0xffffff, 0x444444, 3));
 *   }
 *
 * and override _tick(dt) to animate (dt = seconds since last frame; the
 * base class calls renderer.render() immediately after). A scene that is
 * static (nothing to animate) can leave _tick() as a no-op — the initial
 * renderFrame() call below still shows it.
 *
 * Resource cleanup is the one place this differs sharply from
 * CanvasSimulation/PhysicsSimulation: a WebGL context is a scarce
 * per-browser resource (mobile Chrome caps concurrent contexts in the
 * single digits) and geometries/materials/textures hold GPU buffers that
 * the garbage collector cannot reclaim on its own. destroy() walks the
 * scene graph disposing all three, then disposes and force-loses the
 * renderer's own context — required for a lesson that mounts and unmounts
 * several 3D scenes across one session on a low-end device.
 *
 * Theme reactivity: same `_reloadColors()`/`refreshTheme()` hooks as the
 * other bases — resolve colors via `readSimColors()` into `this.colors` in
 * `_reloadColors()`, apply them to materials/lights/background there or in
 * `refreshTheme()`.
 *
 * Come-to-rest budget (SimulationBase's `animateFor()`/`static CONTINUOUS`):
 * a static 3D scene comes to rest like any other. A scene using
 * `loadOrbitControls()` needs the loop kept alive only while the student is
 * actually dragging — call `this.animateFor()` from the controls' own
 * pointerdown/pointermove handlers (OrbitControls' `change` event is the
 * simplest hook), rather than setting `static CONTINUOUS = true`, unless the
 * camera also auto-rotates on its own.
 *
 * No-WebGL degradation: unlike Canvas2D (universally available) or Matter.js
 * (pure JS, no GPU), `new THREE.WebGLRenderer()` can throw synchronously on
 * a real device — not just old hardware. Chrome (unlike Firefox) maintains a
 * GPU driver blocklist and refuses to create a WebGL context at all for a
 * flagged renderer string (e.g. a VM/Chromebook falling back to Mesa
 * llvmpipe software rendering), with no page-side override. This is exactly
 * the low-end-device fleet this app targets, so it's treated as an expected
 * outcome, not a bug: `setup()` catches the renderer construction failure,
 * skips only the render pipeline (scene/camera still exist — a subclass's
 * `this.scene.add(...)` calls after `super.setup()` remain safe no-ops),
 * and shows `_renderFallback()`'s message instead of leaving the container
 * blank or letting a raw stack trace surface through the mounting plugin's
 * generic error handling. Override `_renderFallback()` for a richer
 * degrade (e.g. a static labeled image) than the default text notice.
 */
export class WebGLSimulation extends SimulationBase {
  /** Comes to rest by default, like every other base class (see
   *  SimulationBase's class doc for the rules a `false` scene follows). A 3D
   *  scene with ambient motion that never ends (orbiting parts, slow
   *  auto-rotation) declares `static CONTINUOUS = true` with a one-line
   *  reason; one using `loadOrbitControls()` calls `this.animateFor()` from
   *  the controls' change event instead. */
  static CONTINUOUS = false;
  /** Override in subclass to set scene dimensions (aspect ratio) and camera FOV. */
  static WIDTH  = 600;
  static HEIGHT = 400;
  static FOV    = 50;
  /** Override to true for a transparent canvas (e.g. layered over a DOM background). */
  static TRANSPARENT = false;

  constructor(container) {
    super(container);
    this.THREE = null;    // set after _initThree()
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this._resizeObserver = null;
    this._contextLostHandler = null;
    this._contextRestoredHandler = null;
    this.unsupported = false; // true once setup() catches a WebGL-unavailable failure
    this._fallbackEl = null;
  }

  /**
   * Cheap synchronous WebGL availability probe — does not need three.js
   * loaded. Useful for a caller that wants to check before even attempting
   * to mount a 3D scene; setup() itself does not call this, it catches the
   * renderer-construction failure directly instead (see class doc comment).
   */
  static isSupported() {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
      return false;
    }
  }

  // ── three.js lazy load ──────────────────────────────────────────────────

  async _initThree() {
    if (!_threeModule) {
      _threeModule = await import('vendor/three/three.module.min.js');
    }
    this.THREE = _threeModule;
    return _threeModule;
  }

  /** Lazily import OrbitControls. Only call from setup() if the scene lets the student drag/orbit the camera. */
  async loadOrbitControls() {
    const mod = await import('vendor/three/examples/jsm/controls/OrbitControls.js');
    return mod.OrbitControls;
  }

  /** Lazily import GLTFLoader. Only call from setup() if the scene loads an authored .glb/.gltf model. */
  async loadGLTFLoader() {
    const mod = await import('vendor/three/examples/jsm/loaders/GLTFLoader.js');
    return mod.GLTFLoader;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Creates scene, camera, and renderer. Subclasses call super.setup() first,
   * then add lights/geometry/models.
   */
  async setup() {
    const T = await this._initThree();
    const W = this.constructor.WIDTH;
    const H = this.constructor.HEIGHT;

    // Scene/camera are plain JS objects — no GPU context needed — so these
    // are created unconditionally. Only WebGLRenderer can fail here.
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(this.constructor.FOV, W / H, 0.1, 1000);

    try {
      this.renderer = new T.WebGLRenderer({
        antialias: true,
        alpha: this.constructor.TRANSPARENT,
      });
    } catch (err) {
      this.unsupported = true;
      ErrorReporter.reportError(err, { scene: this.constructor.name, reason: 'webgl-unavailable', recoverable: true });
      this._renderFallback();
      await super.setup(); // still wire theme reactivity for the fallback message
      return;
    }
    // Capped at 2x — an uncapped devicePixelRatio on a high-DPI phone can be
    // 3x+, which quadruples fragment-shader cost for no visible gain and is
    // exactly the kind of low-end-device tax this app avoids elsewhere.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(W, H, false);
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:auto;';
    this.container.appendChild(this.renderer.domElement);

    // A lost context (GPU reset, too many concurrent contexts, driver crash)
    // fires here instead of throwing — without this handler the rAF loop
    // just silently renders nothing forever. We pause and report; automatic
    // resource recreation on restore is scene-specific, so it's an optional
    // hook (_onContextRestored) rather than something this base can do
    // generically.
    this._contextLostHandler = (e) => {
      e.preventDefault();
      ErrorReporter.reportError(new Error('WebGL context lost'), { scene: this.constructor.name });
      this.pause();
    };
    this._contextRestoredHandler = () => this._onContextRestored?.();
    this.renderer.domElement.addEventListener('webglcontextlost', this._contextLostHandler, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', this._contextRestoredHandler, false);

    // Unlike a 2D canvas (which can just be scaled by CSS and look a little
    // soft), a fixed low backing resolution stretched across a wide viewport
    // looks visibly blocky in 3D — so this base actually resizes the
    // renderer/camera to the container rather than relying on CSS scaling.
    this._resizeObserver = new ResizeObserver(() => this._handleResize());
    this._resizeObserver.observe(this.container);

    // Base class wires IntersectionObserver + visibilitychange
    await super.setup();
  }

  _handleResize() {
    if (!this.renderer || !this.container) return;
    const w = this.container.clientWidth;
    if (!w) return;
    const aspect = this.constructor.WIDTH / this.constructor.HEIGHT;
    const h = w / aspect;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    // setSize clears the drawing buffer: repaint now, or a parked scene stays
    // blank after a window resize / phone rotation.
    if (this._running) this.animateFor(200); else this.renderFrame();
  }

  step(dtMs) {
    if (!this.allowResume || !this.renderer) return;
    this._tick(dtMs / 1000);
    this.renderer.render(this.scene, this.camera);
  }

  /** Renders a single static frame (initial paused state, or a post-resize/theme repaint). */
  renderFrame() {
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  }

  /**
   * Default theme-change repaint: subclasses implementing `_reloadColors()`
   * (e.g. re-tinting materials/lights/background from `this.colors`) get a
   * live repaint for free, same contract as CanvasSimulation.refreshTheme().
   */
  refreshTheme() {
    if (!this.renderer) return;
    if (this._hasStarted) {
      this._tick(0);
      this.renderer.render(this.scene, this.camera);
    } else {
      this.renderFrame();
    }
  }

  /** Recursively disposes geometries/materials/textures under an Object3D (typically this.scene). */
  _disposeObject3D(root) {
    if (!root) return;
    root.traverse((node) => {
      node.geometry?.dispose();
      const materials = Array.isArray(node.material) ? node.material : (node.material ? [node.material] : []);
      for (const mat of materials) {
        for (const value of Object.values(mat)) {
          if (value?.isTexture) value.dispose();
        }
        mat.dispose();
      }
    });
  }

  destroy() {
    if (this._fallbackEl) {
      this._fallbackEl.remove();
      this._fallbackEl = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this._contextLostHandler);
      this.renderer.domElement.removeEventListener('webglcontextrestored', this._contextRestoredHandler);
    }
    if (this.scene) this._disposeObject3D(this.scene);
    if (this.renderer) {
      this.renderer.dispose();
      // Immediately frees the GPU context rather than waiting on GC — matters
      // when several 3D scenes mount/unmount across one lesson session.
      this.renderer.forceContextLoss?.();
      this.renderer.domElement?.remove();
    }
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    super.destroy();
  }

  // ── Abstract hooks ────────────────────────────────────────────────────────

  /**
   * Advance one animation frame. dt = seconds elapsed since last frame.
   * The base class calls renderer.render() immediately after this returns —
   * subclasses only need to mutate the scene graph, never render themselves.
   * Override is optional; a static scene can leave this as a no-op.
   * @param {number} _dt
   */
  _tick(_dt) {}

  /**
   * Optional: called after a lost WebGL context is restored. The browser
   * does NOT restore GPU resources automatically — a scene that wants to
   * recover (rather than stay blank) must recreate its geometries/materials/
   * textures here. No-op by default.
   */
  _onContextRestored() {}

  /**
   * Called instead of ever getting a renderer when the browser refuses to
   * create a WebGL context (see class doc comment). Default: an accessible
   * text notice, styled via existing sim-theme.css tokens (never a
   * hardcoded color). Override for a richer fallback, e.g. a static labeled
   * image conveying the same content the 3D view would have shown.
   */
  _renderFallback() {
    const label = this.constructor.ARIA_LABEL || '3D scene';
    const el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.style.cssText = `
      display:flex; align-items:center; justify-content:center; text-align:center;
      min-height:${Math.min(this.constructor.HEIGHT, 200)}px; padding:16px; box-sizing:border-box;
      background:var(--sim-bg-surface, #111827); color:var(--sim-label, #e2e8f0);
      border:1px solid var(--sim-warning, #fbbf24); border-radius:8px; font-size:0.9rem;
    `;
    el.textContent = `This device can't display an interactive 3D view (${label}). Try a different browser, or ask your teacher for an alternative.`;
    this.container.appendChild(el);
    this._fallbackEl = el;
  }
}
