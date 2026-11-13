import { SimulationLoader } from '../SimulationLoader.js';
import { CourseSourceManager } from '../CourseSourceManager.js';
import { loadCourseManifest } from '../courseManifest.js';
import { ErrorReporter } from '../ErrorReporter.js';

/**
 * rendererHost - mounts the renderer form of content-block@1's `figure`
 * field (`{ renderer: 'name@1', data, caption, ... }`): a course-local module
 * bound in the bundle manifest's `renderers` map, contract `figure-host@0`
 * (docs/sprints/wip/course-local-renderers/CONTRACT.md).
 *
 * Same call shape as figureHost.js mountFigure() so content-block treats both
 * forms alike: mount on host swap, setStep() per beat, setOptions() for look /
 * kicker, destroy() from the block's teardown.
 *
 * The host owns: the open shadow root (passed empty), a structuredClone of
 * `data`, the COMPLETE env on every setOptions() call, the ResizeObserver,
 * theme changes (data-theme on <html>, plus prefers-color-scheme when no
 * data-theme is set), role=img (group if inspect) + aria-label per beat, and every failure
 * (missing binding, failed import, wrong api, throwing/rejecting mount): a
 * quiet placeholder card plus ErrorReporter, never a broken slide.
 *
 * @param {HTMLElement} hostEl empty element to mount into
 * @param {object} figure the `figure` field (renderer form)
 * @param {{ step?: number, look?: string, bundleId?: string|null, kicker?: string }} opts
 * @returns {{ setStep(step: number): void, setOptions(o: { look?: string, kicker?: string }): void, destroy(): void }}
 */

export const RENDERER_API = 'figure-host@0';

/** Per-bundle, per-name module promise: each course resolves through its own manifest. */
const _modules = new Map(); // `${bundleId}\n${name}` -> Promise<module>

/**
 * Resolve and import the module bound to `name` in `bundleId`'s manifest.
 * Rejects with a descriptive Error on a missing binding, failed import or api
 * mismatch. Cached per bundle + name.
 */
export function loadRenderer(name, bundleId) {
  const key = `${bundleId || ''}\n${name}`;
  if (!_modules.has(key)) {
    const p = (async () => {
      if (!bundleId) throw new Error(`renderer "${name}": no course bundle to resolve it in`);
      const manifest = await loadCourseManifest(bundleId);
      const binding = manifest?.renderers?.[name];
      const url = typeof binding?.url === 'string' ? binding.url.trim() : '';
      if (!url) throw new Error(`renderer "${name}": no binding in ${bundleId}/manifest.json "renderers"`);
      await CourseSourceManager.init();
      const href = CourseSourceManager.resolveRef(url, bundleId);
      let mod;
      try { mod = await import(href); } catch (e) {
        throw new Error(`renderer "${name}": import of ${href} failed: ${e?.message || e}`);
      }
      if (mod?.api !== RENDERER_API) throw new Error(`renderer "${name}": api is ${JSON.stringify(mod?.api)}, expected "${RENDERER_API}"`);
      if (typeof mod.mount !== 'function') throw new Error(`renderer "${name}": no mount() export`);
      return mod;
    })();
    // A failure is not cached: a later mount (e.g. after a fix + reload of the
    // manifest) tries again rather than replaying the old error.
    p.catch(() => _modules.delete(key));
    _modules.set(key, p);
  }
  return _modules.get(key);
}

/** The module's optional aspect(data) hint, or null (unknown / failed). */
export async function rendererAspect(figure, bundleId) {
  try {
    const mod = await loadRenderer(figure?.renderer, bundleId);
    if (typeof mod.aspect !== 'function') return null;
    const a = Number(mod.aspect(structuredClone(figure.data ?? {})));
    return Number.isFinite(a) && a > 0 ? a : null;
  } catch {
    return null;
  }
}

const HOST_CSS = `
:host { display: block; }
.slot { position: relative; width: 100%; }
.unavailable {
  box-sizing: border-box; width: 100%; min-height: 120px; padding: 20px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  background: var(--fig-card); color: var(--fig-muted);
  border: 1px dashed var(--fig-edge); border-radius: 10px;
  font-size: 14px; line-height: 1.4; text-align: center;
}
.unavailable strong { color: var(--fig-ink); font-weight: 600; }
`;

const darkMql = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null);
const motionMql = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null);

function colorScheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark' || t === 'light') return t;
  return darkMql()?.matches ? 'dark' : 'light';
}

const str = (v) => (typeof v === 'string' ? v : (v && typeof v.en === 'string' ? v.en : ''));

export function mountRenderer(hostEl, figure, opts = {}) {
  // The renderer gets its OWN empty open shadow root: a child of the host's
  // shadow root, so the host's placeholder style never reaches into it and
  // the renderer can replaceChildren() freely.
  const outer = hostEl.shadowRoot || hostEl.attachShadow({ mode: 'open' });
  outer.replaceChildren();
  const style = document.createElement('style');
  style.textContent = HOST_CSS;
  const slot = document.createElement('div');
  slot.className = 'slot';
  outer.append(style, slot);
  const stage = document.createElement('div');
  slot.appendChild(stage);
  const root = stage.attachShadow({ mode: 'open' });

  const name = String(figure?.renderer || '');
  let step = Number.isInteger(opts.step) ? opts.step : 0;
  let look = opts.look === 'plain' ? 'plain' : 'quill';
  let kicker = opts.kicker || '';
  let setting = '';
  let lastW = 0;
  let dead = false;
  let failed = false;
  let mod = null;
  let handle = null;
  let lastEnvKey = '';

  const env = () => ({
    beat: step + 1,
    look,
    setting: look === 'plain' && setting === 'casefile' ? 'casefile' : '',
    colorScheme: colorScheme(),
    width: lastW,
    reducedMotion: !!motionMql()?.matches,
    tab: str(figure?.tab) || kicker,
  });
  const envKey = (e) => JSON.stringify(e);

  const label = () => {
    const a11y = str(figure?.a11yCaption).trim();
    if (a11y) return a11y;
    if (mod && typeof mod.describe === 'function') {
      try { return String(mod.describe(structuredClone(figure.data ?? {}), step + 1) ?? ''); } catch (e) {
        ErrorReporter.reportError(e, { where: 'rendererHost.describe', renderer: name, bundleId: opts.bundleId });
      }
    }
    return str(figure?.caption);
  };
  const setLabel = () => {
    // inspect = true (tap or key to look closer): role=group keeps the
    // renderer's focusable parts reachable; role=img would hide them.
    hostEl.setAttribute('role', mod && mod.inspect === true ? 'group' : 'img');
    hostEl.setAttribute('aria-label', label());
  };

  const fail = (err, where) => {
    if (dead) return;
    ErrorReporter.reportError(err, { where, renderer: name, bundleId: opts.bundleId || null });
    if (failed) return;
    failed = true;
    try { handle?.destroy?.(); } catch { /* already failing */ }
    handle = null;
    const card = document.createElement('div');
    card.className = 'unavailable';
    const t = document.createElement('strong');
    t.textContent = 'Figure unavailable';
    card.appendChild(t);
    slot.replaceChildren(card);
    hostEl.setAttribute('role', 'img');
    hostEl.setAttribute('aria-label', `Figure unavailable. ${str(figure?.caption)}`.trim());
  };

  const pushOptions = (force = false) => {
    if (dead || failed || !handle) return;
    const e = env();
    const k = envKey(e);
    if (!force && k === lastEnvKey) return;
    lastEnvKey = k;
    try { handle.setOptions?.(e); } catch (err) { fail(err, 'rendererHost.setOptions'); }
  };

  const measure = () => { lastW = slot.clientWidth || hostEl.clientWidth || 0; };

  setLabel();
  measure();
  (async () => {
    try {
      mod = await loadRenderer(name, opts.bundleId);
    } catch (e) { fail(e, 'rendererHost.load'); return; }
    if (dead) return;
    setLabel();
    measure();
    const e0 = env();
    let h;
    try { h = await mod.mount(root, structuredClone(figure.data ?? {}), e0); } catch (e) { fail(e, 'rendererHost.mount'); return; }
    if (dead) { try { h?.destroy?.(); } catch { /* torn down */ } return; }
    handle = h || {};
    lastEnvKey = envKey(e0);
    // State may have moved while an async mount ran: catch the renderer up.
    if (step + 1 !== e0.beat) { try { handle.setStep?.(step + 1, false); } catch (err) { fail(err, 'rendererHost.setStep'); return; } }
    measure();
    pushOptions();
  })();

  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      const w = slot.clientWidth;
      if (w && Math.abs(w - lastW) > 0.5) { lastW = w; pushOptions(); }
    })
    : null;
  ro?.observe(slot);

  const onTheme = () => pushOptions();
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(onTheme) : null;
  mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const dq = darkMql(), mq = motionMql();
  dq?.addEventListener?.('change', onTheme);
  mq?.addEventListener?.('change', onTheme);

  if (opts.bundleId) {
    SimulationLoader.markHost(hostEl, opts.bundleId).then(() => {
      let s = '';
      try { s = getComputedStyle(hostEl).getPropertyValue('--sim-setting').trim().toLowerCase(); } catch { /* detached */ }
      if (s !== setting) { setting = s; pushOptions(); }
    }).catch(() => {});
  }

  return {
    setStep(s) {
      if (!Number.isInteger(s) || s === step) return;
      const forward = s > step;
      step = s;
      if (dead || failed) return;
      if (handle) {
        try { handle.setStep?.(step + 1, forward); } catch (err) { fail(err, 'rendererHost.setStep'); return; }
        // The beat travels by setStep(); keep it out of the next setOptions diff.
        lastEnvKey = envKey(env());
      }
      setLabel();
    },
    /** Narration focus (spec W1 D29n): forwarded to the renderer's optional
     *  narrationFocus({ narrated, on, held }) (contract figure-host@0, optional). */
    narrationFocus(st = {}) {
      if (dead || failed || !handle || typeof handle.narrationFocus !== 'function') return;
      try { handle.narrationFocus({ narrated: !!st.narrated, on: [...(st.on || [])], held: [...(st.held || [])] }); } catch (err) { fail(err, 'rendererHost.narrationFocus'); }
    },
    setOptions(o = {}) {
      if (o.look !== undefined) look = o.look === 'plain' ? 'plain' : 'quill';
      if (o.kicker !== undefined) kicker = o.kicker || '';
      pushOptions();
    },
    destroy() {
      if (dead) return;
      dead = true;
      ro?.disconnect();
      mo?.disconnect();
      dq?.removeEventListener?.('change', onTheme);
      mq?.removeEventListener?.('change', onTheme);
      try { handle?.destroy?.(); } catch (e) { ErrorReporter.reportError(e, { where: 'rendererHost.destroy', renderer: name }); }
      handle = null;
    },
  };
}
