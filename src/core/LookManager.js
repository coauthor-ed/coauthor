import { EventBus } from './EventBus.js';
import { appUrl } from './basePath.js';
import { ThemeManager } from './ThemeManager.js';

/**
 * Look: the student runtime's whole visual identity (tokens, fonts, which
 * lesson modes exist, and later the mascot reactor and brand pieces), as
 * opposed to a lesson mode, which is one of the voices a look offers
 * (docs/sprints/wip/quill-look-pack-and-celebrations-2026-10-30.md, phase E).
 * Same pattern as ThemeManager / LessonModeManager: an attribute on <html>
 * (`data-look`) that look token files key on, plus an EventBus event
 * ('look:changed' { look }) for anything that changes structure.
 *
 * - Looks are listed in registry/looks.json, like blocks and questions. Quill
 *   is the base: its `css` is null because theme.css already holds its values.
 * - The site default comes from an optional site.json at the app root
 *   (`{ "look": "quill", "gamification": "auto" }`). Absent, unreadable or
 *   naming an unknown look = the registry default.
 * - A course overrides it with `"look"` in its module JSON while that module
 *   is open: setCourseLook(id) on open, setCourseLook(null) on leaving, at
 *   exactly the sites that force `lessonMode` today.
 * - The active profile's own `look` (setProfile(), from AppShell) sits between
 *   the two: course look (module JSON, else its bundle manifest's `look`,
 *   followBundle()), then profile look, then site.json, then the registry
 *   default. A profile look also makes gamification follow that
 *   look's default instead of site.json's.
 * - First paint never waits: init() applies the built-in default
 *   synchronously, then re-resolves once the registry and site.json arrive.
 * - The active look's reactor (registry "reactor", a module exporting
 *   start() -> stop) is imported and started on apply, and stopped when the
 *   look changes. It turns cues (src/core/cues.js) into what the learner
 *   sees; a look without one shows no reactions at all (step E2).
 * - The active look's brand module (registry "brand") supplies the brand
 *   pieces the neutral slots render (<app-loader>, <app-logo>, <app-signature>,
 *   <companion-slot>, src/ui/components/LookSlots.js), the page change and
 *   the brand's copy; brand() returns it, null for a look without one (the
 *   slots then show their neutral fallback), and 'look:brand' { look } says it
 *   changed (step E3). A module handed over with provideBrand() (Quill's,
 *   imported statically by LookSlots.js) is used synchronously, so first paint
 *   never waits for it; before init() (and in the authoring app, which never
 *   calls it) brand() is the built-in default's.
 * - Whether gamified elements show (XP, streaks, stars) is gamificationVisible():
 *   a course's `"gamification": true|false` while it is open, then site.json's
 *   true|false ("auto" = no opinion), then the look's registry default. Only
 *   display changes, never what is recorded. 'gamification:changed' { visible }
 *   says it flipped (step E4; GamificationMixin follows it).
 * - Each look's registry "simProfile" (its LookProfile, the numbers the kit
 *   draws scenes with) is published as --look-profile-<id> on <html>, an absolute
 *   URL; kit/lookProfile.js reads it. A CSS property rather than an import,
 *   because the kit also runs synced into a content repo with no engine at all.
 * - A course's signature colour ("accent": module JSON, else its bundle
 *   manifest, from bundle.json; plain look SPEC sec 1) is set on <html> as
 *   data-accent while the course is open (setCourse(), followBundle()) and
 *   removed on leaving. Only look css keys on it; Quill ignores it.
 * - A look's registry "theme" ('light' | 'dark', default dark) is the theme
 *   shown only while the theme follows the device and the browser reports
 *   no prefers-color-scheme (ThemeManager.applyLookDefault(), Q-66); plain
 *   is light.
 * - Student runtime only: never call init() from the authoring app (#aa-shell,
 *   invariant 10).
 * - A course's story cast (bundle manifest `"cast": "story/cast.json"`,
 *   src/core/cast/) is an ephemeral `course:<bundleId>` overlay on the
 *   active brand while that course is open (followBundle()): its narrator
 *   takes the companion and stagehand slots and the narrator copy, but only
 *   where the look itself fills them (plain, with no companion, stays plain).
 *   Everything else is the look's. Leaving the course (setCourse(null), or
 *   another bundle) drops it and 'look:brand' restores the look's own pieces.
 *   The cast module is imported only for a course that names a cast.
 */
const BUILTIN_DEFAULT = 'quill';
// Used until registry/looks.json loads, and if it never does (offline on a
// first visit, a broken deploy): the app still boots as Quill.
const BUILTIN_LOOKS = {
  quill: { css: null, modes: ['classic', 'story'], reactor: 'src/looks/quill/reactor.js', brand: 'src/looks/quill/brand.js', gamification: true },
};

let _looks = BUILTIN_LOOKS;
let _default = BUILTIN_DEFAULT;
let _loaded = false;
let _site = {};
let _course = null;
let _courseGamification = null;
let _courseAccent = null;     // the open module's own `accent`
let _bundleAccent = null;     // its bundle manifest's `accent` (followBundle())
let _bundleLook = null;       // its bundle manifest's `look` (followBundle())
let _bundleReq = null;        // the bundle followBundle() last asked about
let _profileLook = null;      // the active profile's own look, setProfile()
let _active = null;
let _gamified = null;         // last resolved, to emit only on a change
let _initialised = false;
const _warned = new Set();
const _cssRequested = new Set();
let _importModule = null;
let _reactorPath = null;
let _reactorStop = null;
let _reactorSeq = 0;
const _brands = new Map();   // path -> module, handed over by provideBrand()
let _brandPath = null;
let _brand = null;
let _brandSeq = 0;
let _preview = null;          // startPreviewReactor(): Promise, once per page
let _previewStop = null;
let _cast = null;             // the open course's story cast (CourseCast load), followBundle()
let _castKey = null;          // `${bundleId}\n${ref}` last asked for
let _castMod = null;          // the CourseCast API, once a cast was ever asked for
let _castApi = null;          // () => Promise<CourseCast API>; injectable for tests
let _composed = null;         // [look brand, cast, overlaid brand]

function defaultCastApi() {
  return import('./cast/CourseCast.js').then((m) => m.CourseCast);
}

// Outside a browser (unit tests) there is nothing to react on: no reactor.
function defaultImport(path) {
  return typeof window === 'undefined' ? Promise.resolve(null) : import(appUrl(path));
}

/** Tolerant JSON fetch: a 404, a network error or bad JSON is just null. */
async function fetchJson(path) {
  try {
    const res = await fetch(appUrl(path), { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** The id to use for a request, or the default. Warns once per unknown id,
 *  but only once the real registry is in (the built-in list knows only Quill). */
function known(id) {
  if (!id) return null;
  if (Object.prototype.hasOwnProperty.call(_looks, id)) return id;
  if (_loaded && !_warned.has(id)) {
    _warned.add(id);
    console.warn(`[LookManager] Unknown look "${id}"; using "${_default}".`);
  }
  return null;
}

function resolve() {
  return known(_course) || known(_bundleLook) || known(_profileLook) || known(_site.look) || _default;
}

// A look that says nothing keeps gamification on, as Quill always had it.
function resolveGamification() {
  if (typeof _courseGamification === 'boolean') return _courseGamification;
  // A profile that chose its look takes that look's default, over site.json.
  if (known(_profileLook)) return _looks[resolve()]?.gamification !== false;
  if (typeof _site.gamification === 'boolean') return _site.gamification;
  return _looks[resolve()]?.gamification !== false;
}

// A course's signature colour (bundle.json "accent", plain look SPEC sec 1):
// a short lowercase word, set on <html> as data-accent for the look css to
// key on. A look without accent rules simply ignores it.
const ACCENT_RE = /^[a-z][a-z0-9-]{0,23}$/;
const accentOf = (v) => (typeof v === 'string' && ACCENT_RE.test(v) ? v : null);

function applyAccent() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const accent = _courseAccent || _bundleAccent;
  if (accent) {
    if (root.getAttribute('data-accent') !== accent) root.setAttribute('data-accent', accent);
  } else if (root.getAttribute('data-accent') != null) {
    root.removeAttribute?.('data-accent');
  }
}

const fontsOf = (spec) => (Array.isArray(spec?.fonts) ? spec.fonts : []);

// Where the kit finds each look's LookProfile (kit/lookProfile.js). Absolute,
// because a CSS custom property carries no base URL.
function publishProfiles() {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (!root?.style) return;
  for (const [id, spec] of Object.entries(_looks)) {
    if (typeof spec?.simProfile === 'string' && spec.simProfile) {
      root.style.setProperty(`--look-profile-${id}`, appUrl(spec.simProfile));
    }
  }
}

// A non-base look ships a token file (src/looks/<id>/look.css) and maybe
// fonts, fetched only once that look is actually shown, like Story's fonts.
function ensureCss(spec) {
  if (!spec?.css || typeof document === 'undefined') return;
  for (const path of [...fontsOf(spec), spec.css]) {
    if (_cssRequested.has(path)) continue;
    _cssRequested.add(path);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = appUrl(path);
    document.head.appendChild(link);
  }
}

// Passing through the service worker is what caches them (it caches src/ and
// vendor/ as they are fetched). Imports, so a module's own imports come too.
async function warmLook(spec) {
  await Promise.all([spec.css, ...fontsOf(spec)].filter(Boolean).map((path) => fetch(appUrl(path)).catch(() => null)));
  const [, brand] = await Promise.all([spec.reactor, spec.brand, spec.simProfile].map((path) => (path ? _importModule(path) : null)));
  await Promise.all(Object.values(brand?.slots || {}).map((slot) => slot.load?.()));
}

function stopReactor() {
  const stop = _reactorStop;
  _reactorStop = null;
  try { stop?.(); } catch (e) { console.warn('[LookManager] reactor stop failed', e); }
}

// Idempotent per path: the registry arriving with the same look (and the
// same reactor) as the built-in default keeps the running one.
function loadReactor(spec) {
  const path = typeof spec?.reactor === 'string' && spec.reactor ? spec.reactor : null;
  if (path === _reactorPath) return;
  stopReactor();
  _reactorPath = path;
  const seq = ++_reactorSeq;
  if (!path) return;
  Promise.resolve()
    .then(() => _importModule(path))
    .then((mod) => {
      // A newer look won while this one was loading.
      if (seq !== _reactorSeq || typeof mod?.start !== 'function') return;
      const stop = mod.start();
      _reactorStop = typeof stop === 'function' ? stop : null;
    })
    .catch((e) => console.warn(`[LookManager] Could not start the reactor "${path}".`, e));
}

const brandPathOf = (spec) => (typeof spec?.brand === 'string' && spec.brand ? spec.brand : null);

function setBrand(mod, look) {
  if (mod === _brand) return;
  _brand = mod;
  EventBus.emit('look:brand', { look });
}

// The story cast's overlay (course:<bundleId>): only the slot kinds and copy
// keys the look's own brand fills are replaced.
// Slot kinds that are a companion in any look (LookSlots.js).
const COMPANION_KINDS = new Set(['companion', 'coach', 'math-coach', 'stagehand']);

function overlayBrand(base, cast) {
  const o = cast?.overlay;
  if (!base || !o) return base;
  // Only what the look itself has is touched: a kind or key the look leaves
  // empty stays empty. A null slot or prop drops the look's own piece. A look
  // with no companion has no mascot to hide (plain), so its pieces (loader,
  // logo, cover) and props stay its own; only the companion-bearing kinds
  // apply to it, and it has none of those.
  const mascot = !!base.slots?.companion;
  const slots = { ...(base.slots || {}) };
  for (const [kind, spec] of Object.entries(o.slots || {})) {
    if (!slots[kind]) continue;
    if (!mascot && !COMPANION_KINDS.has(kind)) continue;
    if (spec === null) delete slots[kind];
    else if (spec?.tag) slots[kind] = spec;
  }
  const copy = { ...(base.copy || {}) };
  for (const [key, v] of Object.entries(o.copy || {})) if (copy[key] && typeof v === 'string' && v) copy[key] = v;
  const out = { ...base, slots, copy, overlay: `course:${cast.bundleId}` };
  if (mascot) for (const [key, v] of Object.entries(o.props || {})) if (v === null && key in out) out[key] = undefined;
  return out;
}

function effectiveBrand(base) {
  if (!_cast || !base) return base;
  if (_composed?.[0] !== base || _composed[1] !== _cast) _composed = [base, _cast, overlayBrand(base, _cast)];
  return _composed[2];
}

function setCast(cast) {
  if (cast === _cast) return;
  _cast = cast || null;
  _castMod?.setActive?.(_cast);
  EventBus.emit('look:brand', { look: _active || resolve() });
}

function dropCast() {
  _castKey = null;
  setCast(null);
}

// The bundle manifest's `cast` (a bundle-relative path), loaded while its
// course is open. Resolves once the overlay is on (or there is none).
function followCast(bundleId, ref) {
  if (typeof ref !== 'string' || !ref.trim() || !bundleId) { dropCast(); return Promise.resolve(); }
  const key = `${bundleId}\n${ref}`;
  if (key === _castKey && _cast) return Promise.resolve();
  if (_cast && _cast.bundleId !== bundleId) setCast(null);
  _castKey = key;
  return Promise.resolve()
    .then(() => (_castApi || defaultCastApi)())
    .then((api) => {
      _castMod = api;
      return api.track(api.load(bundleId, ref));
    })
    .then((loaded) => { if (_castKey === key) setCast(loaded || null); })
    .catch((e) => {
      console.warn(`[LookManager] Could not load the story cast "${ref}".`, e);
      if (_castKey === key) setCast(null);
    });
}

// Same shape as loadReactor: idempotent per path, a newer look wins a race.
// A preloaded module applies synchronously; any other is imported, and the
// slots show their neutral fallback until it arrives.
function loadBrand(spec, look) {
  const path = brandPathOf(spec);
  if (path === _brandPath) return;
  _brandPath = path;
  const seq = ++_brandSeq;
  if (!path) { setBrand(null, look); return; }
  if (_brands.has(path)) { setBrand(_brands.get(path), look); return; }
  setBrand(null, look);
  Promise.resolve()
    .then(() => _importModule(path))
    .then((mod) => {
      if (seq !== _brandSeq || !mod) return;
      _brands.set(path, mod);
      setBrand(mod, look);
    })
    .catch((e) => console.warn(`[LookManager] Could not load the brand "${path}".`, e));
}

function apply() {
  // Views call setCourseLook() wherever they are mounted; without init() (the
  // authoring app) it only records the request.
  if (!_initialised) return;
  applyAccent();
  const look = resolve();
  loadReactor(_looks[look]);
  loadBrand(_looks[look], look);
  if (look !== _active) {
    _active = look;
    ensureCss(_looks[look]);
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-look', look);
    // The look's default theme (registry "theme": plain light, others dark),
    // only where the browser reports no prefers-color-scheme (Q-66).
    ThemeManager.applyLookDefault(_looks[look]?.theme);
    EventBus.emit('look:changed', { look });
  }
  const visible = resolveGamification();
  const flipped = _gamified !== null && visible !== _gamified;
  _gamified = visible;
  if (flipped) EventBus.emit('gamification:changed', { visible });
}

export const LookManager = {
  /**
   * Synchronous first-paint apply of the default, then the registry and
   * site.json (fetched in parallel). Resolves once the real look is applied.
   * `loadJson(path)` is injectable for tests; it must resolve null on failure.
   * `importModule(path)` (a reactor) is injectable too.
   */
  init({ loadJson = fetchJson, importModule = defaultImport, castApi = defaultCastApi } = {}) {
    // The real look takes over from a preview-only reactor.
    try { _previewStop?.(); } catch { /* already stopped */ }
    _previewStop = null;
    stopReactor();
    _reactorPath = null;
    _reactorSeq++;
    _brandPath = null;
    _brandSeq++;
    _brand = null;
    _importModule = importModule;
    _castApi = castApi;
    _cast = null;
    _castKey = null;
    _composed = null;
    _looks = BUILTIN_LOOKS;
    _default = BUILTIN_DEFAULT;
    _loaded = false;
    _site = {};
    _active = null;
    _gamified = null;
    _initialised = true;
    _warned.clear();
    apply();
    this.ready = Promise.all([
      Promise.resolve(loadJson('registry/looks.json')).catch(() => null),
      Promise.resolve(loadJson('site.json')).catch(() => null),
    ]).then(([registry, site]) => {
      if (isObject(registry?.looks) && Object.keys(registry.looks).length) {
        _looks = registry.looks;
        const def = registry.default;
        _default = Object.prototype.hasOwnProperty.call(_looks, def) ? def
          : (_looks[BUILTIN_DEFAULT] ? BUILTIN_DEFAULT : Object.keys(_looks)[0]);
      }
      _site = isObject(site) ? site : {};
      _loaded = true;
      publishProfiles();
      apply();
      return _active;
    });
    return this.ready;
  },

  /** The id of the look on screen. */
  getLook() {
    return _active || resolve();
  },

  /** The active look's registry entry. */
  getLookSpec() {
    return _looks[this.getLook()] || BUILTIN_LOOKS[BUILTIN_DEFAULT];
  },

  /** The lesson modes the active look offers, in its preferred order. */
  modes() {
    const m = this.getLookSpec().modes;
    return Array.isArray(m) && m.length ? [...m] : [...BUILTIN_LOOKS[BUILTIN_DEFAULT].modes];
  },

  /**
   * The open course's own settings, from its module JSON: `look` and
   * `gamification`. null (or a module with neither) clears them. Never
   * persisted.
   */
  setCourse(manifest) {
    const look = typeof manifest?.look === 'string' && manifest.look ? manifest.look : null;
    const gamification = typeof manifest?.gamification === 'boolean' ? manifest.gamification : null;
    const accent = accentOf(manifest?.accent);
    // Leaving every course also forgets the bundle's accent, look and cast.
    if (!manifest) { _bundleAccent = null; _bundleLook = null; _bundleReq = null; dropCast(); }
    if (look === _course && gamification === _courseGamification && accent === _courseAccent) {
      applyAccent();
      return;
    }
    _course = look;
    _courseGamification = gamification;
    _courseAccent = accent;
    apply();
  },

  /**
   * The open course's bundle manifest (manifest.json, which carries
   * bundle.json's "accent" and "look"): its signature colour and look, each
   * used when the module JSON names none. Fetched once per bundle by the caller-supplied loader;
   * a newer bundle (or setCourse(null)) wins a race. Never throws.
   * @param {string|null} bundleId
   * @param {(bundleId: string) => Promise<object|null>} loadManifest
   */
  followBundle(bundleId, loadManifest) {
    const prev = _bundleReq;
    _bundleReq = bundleId || null;
    if (!bundleId || typeof loadManifest !== 'function') {
      _bundleAccent = null;
      _bundleLook = null;
      dropCast();
      apply();
      return Promise.resolve(null);
    }
    // Another bundle: never show the last one's look, colour or cast meanwhile.
    if (prev !== bundleId) { _bundleAccent = null; _bundleLook = null; if (_cast?.bundleId !== bundleId) dropCast(); }
    return Promise.resolve()
      .then(() => loadManifest(bundleId))
      .catch(() => null)
      .then((m) => {
        if (_bundleReq !== bundleId) return null;
        _bundleAccent = accentOf(m?.accent);
        _bundleLook = typeof m?.look === 'string' && m.look ? m.look : null;
        apply();
        // The story cast is in place before the caller renders, so a lesson
        // never opens on the look's companion and then swaps.
        return followCast(bundleId, m?.cast).then(() => (_bundleReq === bundleId ? _bundleAccent : null));
      });
  },

  /** The open course's signature colour (data-accent), or null. */
  getAccent() {
    return _courseAccent || _bundleAccent;
  },

  /**
   * The active profile's own look (profile.look, chosen at onboarding or in
   * the student menu). It sits between a course's look and site.json, so it
   * decides home, Discover and every page outside an open course. null (or a
   * profile without one, e.g. made before this existed) follows site.json.
   */
  setProfile(profile) {
    const look = typeof profile?.look === 'string' && profile.look ? profile.look : null;
    if (look === _profileLook) return;
    _profileLook = look;
    apply();
  },

  /** The look outside any course: the profile's, else site.json's, else
   *  the default. What the student menu shows as the current choice. */
  profileLook() {
    return known(_profileLook) || known(_site.look) || _default;
  },

  /** A course's own look only: setCourse() with nothing else to say. */
  setCourseLook(id) {
    this.setCourse(id ? { look: id } : null);
  },

  /**
   * Fetches the files of these looks (the ones the student's courses name)
   * ahead of time, so a course never opened since the last app update still
   * has its look offline. Best-effort; the default look ships in the shell.
   */
  warmLooks(ids) {
    return Promise.resolve(this.ready).then(() => Promise.all(
      [...new Set(ids)]
        .filter((id) => typeof id === 'string' && id !== _default && Object.prototype.hasOwnProperty.call(_looks, id))
        .map((id) => warmLook(_looks[id]).catch(() => null)),
    ));
  },

  /** Whether gamified elements show. Before init() (the authoring app's
   *  plugin previews) it is the built-in default's: on. */
  gamificationVisible() {
    return resolveGamification();
  },

  /**
   * The active look's brand module, or null when the look has none (or it is
   * still loading). Before init() it is the built-in default's, if that was
   * handed over with provideBrand().
   */
  brand() {
    if (!_initialised) return _brands.get(brandPathOf(BUILTIN_LOOKS[BUILTIN_DEFAULT])) || null;
    return effectiveBrand(_brand);
  },

  /** The open course's story cast (src/core/cast/CourseCast.js), or null. */
  cast() {
    return _cast;
  },

  /** Hands over a brand module imported statically (registry path -> module),
   *  so a look using it gets its brand pieces without waiting for an import. */
  provideBrand(path, mod) {
    if (!path || !mod) return;
    _brands.set(path, mod);
    if (_initialised && path === _brandPath && !_brand) setBrand(mod, this.getLook());
  },

  /**
   * For a page that mounts student plugins without the student shell (the
   * authoring app's inline preview, through mountOrphanPreview): starts the
   * built-in default look's reactor, so the plugins' cues are answered as
   * in the app. Nothing else of the look: no data-look, no token file, no
   * site.json (invariant 10, the host page keeps its own styling). A no-op
   * once init() has run. Resolves when the reactor is running (or failed).
   */
  startPreviewReactor({ importModule = defaultImport } = {}) {
    if (_initialised) return Promise.resolve();
    if (_preview) return _preview;
    const path = BUILTIN_LOOKS[BUILTIN_DEFAULT].reactor;
    _preview = Promise.resolve()
      .then(() => importModule(path))
      .then((mod) => {
        if (_initialised || typeof mod?.start !== 'function') return;
        const stop = mod.start();
        _previewStop = typeof stop === 'function' ? stop : null;
      })
      .catch((e) => console.warn(`[LookManager] Could not start the preview reactor "${path}".`, e));
    return _preview;
  },

  /** The parsed site.json ({} when absent). */
  siteConfig() {
    return { ..._site };
  },
};
