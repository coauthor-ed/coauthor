import { CourseSourceManager } from './CourseSourceManager.js';

/**
 * SimulationLoader — resolves a simulation scene's own authored `src` (bundle-
 * relative, e.g. "simulations/L04/TriangleHalfParallelogramScene.js", or
 * root-absolute for an engine-bundled generic scene, e.g.
 * "/src/simulations/physics/PendulumScene.js") via
 * `CourseSourceManager.resolveRef()` — the exact same ref-resolution an
 * `image.src`/`blockRef` already goes through — and dynamically imports it.
 *
 * Replaces the old `registry/simulations.json` + `SimulationRegistry`
 * id-indirection layer: a scene is now referenced by its own path, directly,
 * the same way an image is. This is what makes a course bundle folder
 * genuinely copy/paste-portable and previewable statelessly (no registry or
 * manifest.json regeneration step between authoring a new scene file and it
 * being loadable) — see `docs/content-authoring-guide.md`.
 */
/**
 * Canvas text never fetches a unicode-range font face on its own before its
 * first draw: a scene that paints a price once ("\u20B9500" in Nunito) shows
 * an empty box until something else loads the face. The rupee faces
 * (vendor/fonts/nunito/nunito.css, one 3.8 KB file that also carries the
 * superscripts U+2070, U+2074-207E, e.g. "10\u207B\u00B3") are warmed on the
 * first scene load so they are ready by the scene's first frame. Fire and
 * forget.
 */
let _glyphsWarmed = false;
function warmCanvasGlyphs() {
  if (_glyphsWarmed || typeof document === 'undefined' || !document.fonts?.load) return;
  _glyphsWarmed = true;
  const loads = [400, 600, 700, 800, 900].map((w) => `${w} 16px Nunito`).concat(['16px "Nunito Rupee"']);
  for (const f of loads) document.fonts.load(f, '\u20B9\u207B').catch(() => {});
}

export const SimulationLoader = {
  _modules: new Map(), // resolved absolute URL -> Promise<module>
  _failed: new Map(), // resolved URL -> failed import() count (see loadModule)

  /**
   * @param {string} src the block/question's own `simulation.src` (or
   *   `poe-observe-sim@1`'s top-level `src`)
   * @param {string} [bundleId] the bundle the CALLING content belongs to
   *   (LessonEngine/TestEngine's own `ctx.bundleId`) — anchors a bundle-
   *   relative `src` at that bundle's manifest.json location; a root-
   *   absolute or full-URL `src` doesn't need it.
   * @returns {Promise<object>} the imported ES module for this scene
   */
  async loadModule(src, bundleId) {
    if (!src) throw new Error('[SimulationLoader] Missing simulation src');
    warmCanvasGlyphs();
    await CourseSourceManager.init();
    const resolvedPath = CourseSourceManager.resolveRef(src, bundleId);
    // Keyed by the fully-resolved URL, not the bare src — two different
    // bundles reusing the same relative src (e.g. both "simulations/L01/
    // Scene.js") must never share a cache slot.
    if (!SimulationLoader._modules.has(resolvedPath)) {
      // Offline, a scene whose files are not all in the offline cache is
      // not imported at all (Q-100b): a failed import() poisons that URL and
      // every file of its graph for the rest of the page, so trying would
      // keep the scene broken even after the device is back online.
      if (navigator.onLine === false && !SimulationLoader._isPreview()) {
        const { OfflinePrefetcher } = await import('./OfflinePrefetcher.js');
        const r = await OfflinePrefetcher.probe({ entries: [{ data: { simulation: { src } }, bundleId }] }).catch(() => null);
        if (r?.missing?.length) {
          const err = new Error(`[SimulationLoader] Not saved for offline: ${src}`);
          err.code = 'offline-missing';
          throw err;
        }
      }
      // In preview mode, force a genuinely fresh import every time (a
      // cache-busting query param — see ContentLoader.js's own identical
      // reasoning): an agent's just-fixed scene must load, not this
      // in-memory Map's own previous entry, and not a Service Worker's
      // cached copy of the module either — Cache Storage matches by exact
      // URL, so a value that changes every call can never match anything
      // already cached. A dynamic import() with a query string a browser
      // hasn't seen before is always a genuinely new module evaluation, so
      // this also sidesteps this Map's own reuse for the same reason.
      const isPreview = window.location.search.includes('preview=true') || window.location.hash.includes('preview=true');
      // A browser remembers a failed import() of a URL for the life of the
      // page and fails every later import() of it at once, even when the
      // file is reachable again. So a retry after a failure (Q-100b: offline
      // before the file was saved, then back online) imports the same file
      // under a fresh query; the plain fetch first fills the offline cache
      // under the file's own URL, the one OfflineAvailability checks.
      // An earlier import() of the plain URL may have failed elsewhere (a
      // warm-up while offline), so an online failure of the plain URL is
      // retried once at once under a fresh query.
      const sep = resolvedPath.includes('?') ? '&' : '?';
      const attempt = (n) => {
        if (isPreview) return import(/* webpackIgnore: true */ `${resolvedPath}${sep}_previewTs=${Date.now()}`);
        if (!n) return import(/* webpackIgnore: true */ resolvedPath);
        return fetch(resolvedPath).catch(() => null)
          .then(() => import(/* webpackIgnore: true */ `${resolvedPath}${sep}_retry=${n}`));
      };
      const failed = SimulationLoader._failed.get(resolvedPath) || 0;
      const p = attempt(failed).catch((err) => {
        if (failed || isPreview || navigator.onLine === false) throw err;
        SimulationLoader._failed.set(resolvedPath, 1);
        return attempt(1);
      });
      // A failed import (a network drop, offline before it was cached) is
      // forgotten, so the next attempt can load it once the file is there.
      p.catch(() => {
        SimulationLoader._failed.set(resolvedPath, (SimulationLoader._failed.get(resolvedPath) || 0) + 1);
        if (SimulationLoader._modules.get(resolvedPath) === p) SimulationLoader._modules.delete(resolvedPath);
      });
      SimulationLoader._modules.set(resolvedPath, p);
    }
    return SimulationLoader._modules.get(resolvedPath);
  },

  /**
   * Picks the scene class out of an imported scene module. A scene's module
   * may export auxiliary values alongside its class (e.g. a baked ledger a
   * course author exposes for headless verification) — resolving by
   * "whichever export is a function/class" instead of "whichever export
   * came first" keeps mounting correct regardless of declaration order.
   * @param {object} module the module returned by loadModule()
   * @returns {Function} the scene class
   */
  /**
   * True when this scene failed even after a fresh-query retry while online:
   * a file of its import graph failed earlier in this page and the browser
   * will not fetch it again, so only reloading the page can show it.
   */
  needsReload(src, bundleId) {
    if (!src) return false;
    const path = CourseSourceManager.resolveRef(src, bundleId);
    return navigator.onLine !== false && (SimulationLoader._failed.get(path) || 0) >= 2;
  },

  _isPreview() {
    return window.location.search.includes('preview=true') || window.location.hash.includes('preview=true');
  },

  resolveSceneClass(module) {
    for (const value of Object.values(module)) {
      if (typeof value === 'function') return value;
    }
    throw new Error('[SimulationLoader] No class export found in simulation module');
  },

  _subjects: new Map(), // bundleId -> Promise<string>

  /**
   * Hands a scene host its course's subject before the scene mounts, as the
   * inherited CSS custom property `--sim-subject` (it crosses shadow roots).
   * The simulation kit picks its paper from it (maths gets graph paper, see
   * src/simulations/base/kit/paperKind.js); the engine only passes the
   * bundle manifest's `subject` through. The manifest's optional `simSetting`
   * goes down the same way as `--sim-setting` (the faint subject setting the
   * kit paints behind canvas scenes, kit/paperKind.js settingOf), and its
   * optional `look` as `--sim-look` (the LookProfile the kit draws with,
   * kit/lookProfile.js; unset, the kit reads html[data-look]). Never throws:
   * no manifest or no subject just leaves the property unset.
   * @param {HTMLElement} hostEl the element the scene will mount into
   * @param {string} [bundleId]
   */
  async markHost(hostEl, bundleId) {
    if (!hostEl || !bundleId) return;
    if (!SimulationLoader._subjects.has(bundleId)) {
      SimulationLoader._subjects.set(bundleId, (async () => {
        try {
          await CourseSourceManager.init();
          const res = await fetch(CourseSourceManager.resolveRef('manifest.json', bundleId));
          const m = res.ok ? await res.json() : null;
          return { subject: String(m?.subject || ''), setting: String(m?.simSetting || ''), look: String(m?.look || '') };
        } catch { return { subject: '', setting: '', look: '' }; }
      })());
    }
    const { subject, setting, look } = await SimulationLoader._subjects.get(bundleId);
    if (/^[a-z][a-z0-9-]*$/i.test(subject)) hostEl.style.setProperty('--sim-subject', subject);
    if (/^[a-z][a-z0-9-]*$/i.test(setting)) hostEl.style.setProperty('--sim-setting', setting);
    if (/^[a-z][a-z0-9-]*$/i.test(look)) hostEl.style.setProperty('--sim-look', look);
  },
};
