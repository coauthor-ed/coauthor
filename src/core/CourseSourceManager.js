import { ProgressStore } from './ProgressStore.js';
import { DEFAULT_COURSE_SOURCES } from '../config/defaultCourseSources.js';
import { appUrl } from './basePath.js';
import { needsNewerEngine } from './engineVersion.js';

const STORE = 'courseSources';
const AGGREGATOR_STORE = 'courseSourceAggregators';
const REMOVED_DEFAULTS_STORE = 'courseSourceRemovedDefaults';

/** In-memory mirror of the `courseSources` IDB store, keyed by bundleId —
 *  remote sources only; a local bundle (this origin's own /content/courses/)
 *  is never a row here, its absence from this map IS "it's local". Warmed by
 *  init(), consulted synchronously by resolveContentUrl() since that runs
 *  from inside synchronous Lit render() paths that can't await a DB read. */
let _cache = null;

/** bundleId -> baseUrl, for registerEphemeral() below. A second, separate
 *  map (never merged into `_cache`) so listSources()/listCatalogItems() —
 *  which read `_cache` for the Settings UI's "manage remote sources" list —
 *  never surface a preview-only registration as if it were a real added
 *  source. Module-level and intentionally never persisted: gone on reload,
 *  by design (see registerEphemeral()'s own doc comment). */
let _ephemeralCache = new Map();

async function loadCache() {
  if (_cache) return _cache;
  const db = await ProgressStore.getDB();
  const rows = await db.getAll(STORE);
  _cache = new Map(rows.map((r) => [r.bundleId, r]));
  return _cache;
}

/** A manifest URL's directory, used as the base every relative path inside
 *  that manifest (lessons/modules/tests/simulations) resolves against.
 *  Strips the literal `manifest.json` filename when present (the normal
 *  case — both addSource() and a bundle-manifest.json's own sources[]
 *  entries are expected to point at that exact filename); falls back to
 *  everything before the last `/` for anything else, so an unusual but
 *  still-a-file URL doesn't produce a baseUrl that's missing a path
 *  segment. */
export function deriveBaseUrl(manifestUrl) {
  if (manifestUrl.endsWith('manifest.json')) {
    return manifestUrl.slice(0, manifestUrl.length - 'manifest.json'.length);
  }
  return manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
}

/** Fetches and minimally validates a single member manifest.json for
 *  bundle-manifest resolution — same required-field check addSource() does,
 *  but returns `{ error }` instead of throwing, since one bad member must
 *  never abort resolving the rest of the list (see previewBundleManifest). */
async function fetchMemberManifest(manifestUrl, cache) {
  try {
    const res = await fetch(manifestUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = await res.json();
    if (!manifest?.bundleId || !manifest?.title) {
      throw new Error('manifest.json is missing required fields (bundleId, title).');
    }
    return { manifestUrl, manifest, bundleId: manifest.bundleId, alreadyAdded: cache.has(manifest.bundleId) };
  } catch (e) {
    return { manifestUrl, error: e.message };
  }
}

/**
 * CourseSourceManager — registry of course bundles the app can load lessons/
 * tests/simulations from: this origin's own `/content/courses/` (implicit,
 * unregistered — "local" is the absence of a row) plus any number of
 * separately-hosted bundles added by URL, each self-described by its own
 * `manifest.json` (see `content/courses/<bundle>/manifest.json`, and
 * `tools/content-migration/generate-bundle-manifest.js` which produces one).
 *
 * A remote course bundle ships its own executable simulation JS, loaded via
 * dynamic `import()` from the registered origin — not restricted to JSON/
 * media. This is a deliberate, knowingly-accepted security posture: a
 * compromised or malicious added source can run arbitrary code with this
 * app's IndexedDB access. Mitigated by keeping CSP free of `unsafe-eval`/
 * `unsafe-inline` and by `addSource()` requiring the caller to have already
 * shown the user an explicit trust warning (see settings UI) before this is
 * called — this module itself does not gate on consent, it trusts its
 * caller the same way `ProgressStore` trusts callers not to bypass
 * migrations.
 *
 * Bundle-manifest aggregation (`previewBundleManifest()` /
 * `commitBundleManifest()` below): a single chapter's manifest.json is often
 * hosted by one parent/author at their own origin, so a whole subject can be
 * spread across many separately-hosted URLs — bad UX for whoever's
 * registering a course for their child ("paste 8 different URLs to get
 * Grade 9 Science"). A bundle-manifest.json is a small, separately-hosted
 * document that just lists *references* to those manifest.json URLs (never
 * copies of their content, to avoid staleness) so one paste can resolve to
 * many. Because each referenced source can still be a different, arbitrary
 * origin, this does NOT relax the per-source trust posture above — the
 * preview/commit split below exists specifically so a caller can show every
 * resolved origin to the user before anything is registered, the same way a
 * single addSource() call is preceded by an explicit trust warning.
 */
export const CourseSourceManager = {
  /** Warm the in-memory cache. Safe to call multiple times; idempotent. */
  async init() {
    await loadCache();
  },

  /**
   * Registers every entry in defaultCourseSources.js that isn't already
   * present and wasn't explicitly removed by the user (tracked in
   * courseSourceRemovedDefaults, written by removeSource()/removeAggregator()
   * — see those). Called once per app boot, after init(). Safe to call
   * repeatedly (idempotent by URL): a fresh install ends up with the
   * defaults registered, a returning user's own add/remove choices are
   * left exactly as they are, and removing this app's only baked-in course
   * library is a permanent, respected choice, not something that silently
   * reappears on the next reload.
   */
  async seedDefaults() {
    if (!DEFAULT_COURSE_SOURCES.length) return;
    const db = await ProgressStore.getDB();
    const removedUrls = new Set((await db.getAll(REMOVED_DEFAULTS_STORE)).map((r) => r.url));
    const cache = await loadCache();
    const existingSourceUrls = new Set([...cache.values()].map((r) => r.sourceUrl).filter(Boolean));
    const existingAggregatorUrls = new Set((await db.getAll(AGGREGATOR_STORE)).map((r) => r.url));

    for (const { type, url } of DEFAULT_COURSE_SOURCES) {
      if (!url || removedUrls.has(url)) continue;
      try {
        if (type === 'manifest') {
          if (existingSourceUrls.has(url)) continue;
          await CourseSourceManager.addSource(url, { isDefault: true });
        } else if (type === 'aggregate') {
          if (existingAggregatorUrls.has(url)) continue;
          const preview = await CourseSourceManager.previewBundleManifest(url);
          const resolvable = preview.entries.filter((e) => !e.error && !e.alreadyAdded);
          await CourseSourceManager.commitBundleManifest(
            preview.manifestUrl, preview.manifest, resolvable, { isDefault: true },
          );
        }
      } catch (e) {
        console.warn(`[CourseSourceManager] could not seed default source "${url}":`, e);
      }
    }
  },

  /** @returns {Promise<Array<object>>} every registered remote source. */
  async listSources() {
    const cache = await loadCache();
    return [...cache.values()];
  },

  /**
   * Every registered remote source's modules/tests/banks, in the exact
   * `{ type, path }` shape `content/catalog.json`'s own `items` entries use
   * (see HomeDashboard.js's firstUpdated()) — so a caller can just
   * concatenate this onto the local catalog's items and treat the whole
   * list uniformly from there on. `path` is deliberately the same
   * `content/courses/<bundleId>/...` form every local item already uses:
   * whatever loads it next (ContentLoader.loadJSON) resolves that through
   * resolveContentUrl() the same way regardless of where the item came
   * from, so nothing downstream needs to know or care which of these two
   * lists an item started in. `_remoteSource`/`_remoteTitle` ride along
   * for a caller that wants to badge remote items in its UI (e.g. so a
   * student/parent can tell at a glance a course isn't hosted here).
   */
  async listCatalogItems() {
    const sources = await CourseSourceManager.listSources();
    const items = [];
    for (const source of sources) {
      const manifest = source.manifest || {};
      const title = manifest.title?.en || manifest.title || source.bundleId;
      const blurb = manifest.description?.en || (typeof manifest.description === 'string' ? manifest.description : '');
      const push = (type, relPaths) => {
        for (const relPath of relPaths || []) {
          items.push({
            type,
            path: `content/courses/${source.bundleId}/${relPath}`,
            subject: manifest.subject || null,
            grade: manifest.grade != null ? String(manifest.grade) : null,
            chapterId: manifest.chapterId || null,
            _remoteSource: source.bundleId,
            _remoteTitle: title,
            _remoteDescription: blurb || null,
            _needsUpdate: needsNewerEngine(manifest),
          });
        }
      };
      push('module', manifest.modules);
      push('test', manifest.tests);
      push('bank', manifest.banks);
    }
    return items;
  },

  /**
   * Registers a remote course bundle from its manifest URL (or a base URL
   * ending without `manifest.json`, which this appends). Throws with a
   * readable message on any failure — the settings UI is expected to show
   * that message directly rather than a generic "failed".
   */
  async addSource(url, opts = {}) {
    const { isDefault = false } = opts;
    const trimmed = String(url || '').trim();
    if (!trimmed) throw new Error('Enter a URL.');
    const manifestUrl = trimmed.endsWith('manifest.json')
      ? trimmed
      : `${trimmed.replace(/\/$/, '')}/manifest.json`;

    let manifest;
    try {
      const res = await fetch(manifestUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      manifest = await res.json();
    } catch (e) {
      throw new Error(`Could not load manifest.json from that URL: ${e.message}`);
    }
    if (!manifest?.bundleId || !manifest?.title) {
      throw new Error('That manifest.json is missing required fields (bundleId, title).');
    }

    const cache = await loadCache();
    const baseUrl = deriveBaseUrl(manifestUrl);
    const existing = cache.get(manifest.bundleId);
    if (existing) {
      if (existing.sourceUrl === manifestUrl) {
        throw new Error(`"${manifest.bundleId}" is already an added source.`);
      }
      // Relocate: the same bundleId now served from a different URL (repo
      // renamed or moved). Progress keys never contain the host, so only the
      // row's location fields change.
      const moved = { ...existing, baseUrl, sourceUrl: manifestUrl, manifest };
      const rdb = await ProgressStore.getDB();
      await rdb.put(STORE, moved);
      cache.set(moved.bundleId, moved);
      return { ...moved, relocated: true };
    }
    // sourceUrl (the manifest URL itself, as opposed to baseUrl which is
    // derived from it) lets seedDefaults() compare "is this default already
    // registered" by URL directly, and lets removeSource() record exactly
    // what to never re-seed — baseUrl alone would be lossy for a URL that
    // didn't end in exactly `manifest.json`.
    const row = { bundleId: manifest.bundleId, origin: 'remote', baseUrl, sourceUrl: manifestUrl, isDefault, manifest, addedAt: Date.now() };
    const db = await ProgressStore.getDB();
    await db.put(STORE, row);
    cache.set(row.bundleId, row);
    return row;
  },

  /** No-op if `bundleId` isn't a registered remote source. Removing a
   *  source that was auto-seeded from defaultCourseSources.js is recorded
   *  in courseSourceRemovedDefaults so seedDefaults() respects the removal
   *  on every future boot instead of silently re-adding it. */
  async removeSource(bundleId) {
    const db = await ProgressStore.getDB();
    const cache = await loadCache();
    const row = cache.get(bundleId);
    if (row?.isDefault && row.sourceUrl) {
      await db.put(REMOVED_DEFAULTS_STORE, { url: row.sourceUrl });
    }
    await db.delete(STORE, bundleId);
    cache.delete(bundleId);
  },

  /**
   * Resolves a bundle-manifest.json URL into the list of course sources it
   * references — fetching the aggregator itself, then every member
   * manifest.json it points at — WITHOUT registering anything. Callers
   * (settings UI) are expected to show this resolved list, grouped by
   * origin, as an explicit trust review before ever calling
   * commitBundleManifest() — mirrors addSource()'s own precondition that
   * the caller shows a trust warning first, just for potentially many
   * origins at once instead of one.
   *
   * Each source's `manifestUrl` may be relative — resolved against this
   * aggregator's own absolute URL (not the app's origin), so a tree of
   * chapter bundles plus the bundle-manifest.json that lists them can be
   * authored and deployed together to a single static host whose eventual
   * URL isn't known in advance (see generate-bundle-aggregate.py).
   *
   * One bad/unreachable member never aborts the rest: each entry in the
   * returned `entries` array is either `{ manifestUrl, manifest, bundleId,
   * alreadyAdded }` (resolved) or `{ manifestUrl, error }` (failed) — the
   * caller renders both so nothing is silently dropped.
   *
   * @returns {Promise<{ manifestUrl: string, manifest: object, entries: object[] }>}
   */
  async previewBundleManifest(url) {
    const trimmed = String(url || '').trim();
    if (!trimmed) throw new Error('Enter a URL.');
    const manifestUrl = trimmed.endsWith('.json')
      ? trimmed
      : `${trimmed.replace(/\/$/, '')}/bundle-manifest.json`;

    let manifest;
    try {
      const res = await fetch(manifestUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      manifest = await res.json();
    } catch (e) {
      throw new Error(`Could not load bundle-manifest.json from that URL: ${e.message}`);
    }
    if (!manifest?.bundleManifestId || !Array.isArray(manifest.sources)) {
      throw new Error('That bundle-manifest.json is missing required fields (bundleManifestId, sources[]).');
    }

    const cache = await loadCache();
    const entries = await Promise.all(
      manifest.sources.map((src) => {
        const rawUrl = String(src?.manifestUrl || '').trim();
        if (!rawUrl) return Promise.resolve({ manifestUrl: '', error: 'Entry is missing manifestUrl.' });
        // Resolved against the aggregator's own absolute URL, not the app's
        // origin — lets a bundle-manifest.json use paths relative to itself
        // (the common case: a whole tree of chapter bundles + the aggregator
        // deployed together to one static host whose eventual URL isn't known
        // when the tree is authored) instead of requiring every source to be
        // hardcoded to an absolute URL up front.
        const memberUrl = new URL(rawUrl, manifestUrl).href;
        return fetchMemberManifest(memberUrl, cache);
      }),
    );

    return { manifestUrl, manifest, entries };
  },

  /**
   * Read-only single-manifest fetch, mirroring the private fetchMemberManifest()
   * helper above but exported for the Discover section (bookshelf/discover/
   * identity-groundwork sprint) — a `type: 'manifest'` entry in
   * defaultShowcaseSources.js resolves through this, a `type: 'aggregate'`
   * one through previewBundleManifest() above, so DiscoverView can treat
   * both source types as producing one flat list of previewed manifests.
   * Never registers anything, same trust-review posture as
   * previewBundleManifest().
   */
  async previewManifest(url) {
    const trimmed = String(url || '').trim();
    if (!trimmed) throw new Error('Enter a URL.');
    const manifestUrl = trimmed.endsWith('manifest.json')
      ? trimmed
      : `${trimmed.replace(/\/$/, '')}/manifest.json`;
    const cache = await loadCache();
    return fetchMemberManifest(manifestUrl, cache);
  },

  /**
   * Registers every resolved, not-yet-added entry from a previewBundleManifest()
   * result (the caller passes the exact `entries` it already showed the user
   * for review — this never re-resolves or re-decides what's addable, it
   * only acts on what was already shown). Failures for individual members
   * are collected, not thrown — a bundle of 8 chapters where 1 is
   * unreachable should still register the other 7.
   *
   * Also writes/updates a `courseSourceAggregators` row so refreshAggregator()
   * can later re-check just this URL for newly-added members.
   *
   * @returns {Promise<{ added: object[], skipped: string[], failed: {manifestUrl: string, reason: string}[] }>}
   */
  async commitBundleManifest(manifestUrl, manifest, entries, opts = {}) {
    const { isDefault = false } = opts;
    const db = await ProgressStore.getDB();
    const cache = await loadCache();
    const results = { added: [], skipped: [], failed: [] };

    for (const entry of entries) {
      if (entry.error) {
        results.failed.push({ manifestUrl: entry.manifestUrl, reason: entry.error });
        continue;
      }
      if (cache.has(entry.bundleId)) {
        results.skipped.push(entry.bundleId);
        continue;
      }
      const row = {
        bundleId: entry.bundleId,
        origin: 'remote',
        baseUrl: deriveBaseUrl(entry.manifestUrl),
        sourceUrl: entry.manifestUrl,
        isDefault,
        manifest: entry.manifest,
        addedAt: Date.now(),
        viaAggregator: { url: manifestUrl, bundleManifestId: manifest.bundleManifestId },
      };
      await db.put(STORE, row);
      cache.set(row.bundleId, row);
      results.added.push(row);
    }

    // Merge with any existing aggregator row rather than overwriting it —
    // this same method runs again after a refreshAggregator() review, where
    // `entries` only ever contains the newly-found members, so blindly
    // replacing memberBundleIds/addedAt here would silently drop everything
    // recorded from the original add.
    const existing = await db.get(AGGREGATOR_STORE, manifest.bundleManifestId);
    const memberBundleIds = new Set([
      ...(existing?.memberBundleIds || []),
      ...results.added.map((r) => r.bundleId),
      ...results.skipped,
    ]);
    await db.put(AGGREGATOR_STORE, {
      bundleManifestId: manifest.bundleManifestId,
      url: manifestUrl,
      title: manifest.title,
      isDefault: existing?.isDefault || isDefault,
      addedAt: existing?.addedAt ?? Date.now(),
      lastCheckedAt: Date.now(),
      memberBundleIds: [...memberBundleIds],
    });

    return results;
  },

  /** @returns {Promise<Array<object>>} every registered bundle-manifest aggregator. */
  async listAggregators() {
    const db = await ProgressStore.getDB();
    return db.getAll(AGGREGATOR_STORE);
  },

  /** Forgets an aggregator was ever added — never touches the courseSources
   *  rows it already produced, those are removed individually via
   *  removeSource() like any other course source. Removing a
   *  defaultCourseSources.js-seeded aggregator is recorded in
   *  courseSourceRemovedDefaults, same as removeSource() does for a single
   *  default source, so seedDefaults() respects the removal going forward. */
  async removeAggregator(bundleManifestId) {
    const db = await ProgressStore.getDB();
    const agg = await db.get(AGGREGATOR_STORE, bundleManifestId);
    if (agg?.isDefault && agg.url) {
      await db.put(REMOVED_DEFAULTS_STORE, { url: agg.url });
    }
    await db.delete(AGGREGATOR_STORE, bundleManifestId);
  },

  /**
   * Re-fetches a previously-added bundle-manifest.json and returns only the
   * entries NOT already registered — the settings UI's "check for new
   * courses" action. Never registers anything itself (same preview/commit
   * split as the initial add), and never auto-adds — a parent reviewing 3
   * newly-published chapters should see the same trust-review step as the
   * original add, not a silent background registration.
   */
  async refreshAggregator(bundleManifestId) {
    const db = await ProgressStore.getDB();
    const agg = await db.get(AGGREGATOR_STORE, bundleManifestId);
    if (!agg) throw new Error('That bundle source is no longer registered.');
    const preview = await CourseSourceManager.previewBundleManifest(agg.url);
    preview.entries = preview.entries.filter((e) => !e.error && !e.alreadyAdded);
    return preview;
  },

  /** @returns {Promise<string|null>} the remote base URL for `bundleId`, or null if local. */
  async resolveBaseUrl(bundleId) {
    if (_ephemeralCache.has(bundleId)) return _ephemeralCache.get(bundleId);
    const cache = await loadCache();
    return cache.get(bundleId)?.baseUrl ?? null;
  },

  /** Synchronous variant for render-path use — see `resolveContentUrl()`.
   *  Before `init()` has ever run, the cache is cold and this always
   *  returns null, which fails safe to "treat as local" (today's exact
   *  same-origin behavior), never to "silently broken". Ephemeral
   *  registrations (registerEphemeral()) are checked first and need no
   *  warm-up — they're a synchronous in-memory Map from the moment they're
   *  set. */
  resolveBaseUrlSync(bundleId) {
    if (_ephemeralCache.has(bundleId)) return _ephemeralCache.get(bundleId);
    return _cache?.get(bundleId)?.baseUrl ?? null;
  },

  /**
   * Registers a bundleId -> baseUrl mapping for the current tab only —
   * never written to IndexedDB, gone on reload. This is the preview-only
   * counterpart to addSource(): a content-repo-template checkout served
   * over plain HTTP, or a teammate's LAN box, can be previewed by anyone
   * with the URL, with none of addSource()'s permanent-registration +
   * explicit-trust-warning ceremony — appropriate for a real parent/student
   * permanently subscribing to a course, overkill for glancing at a draft.
   *
   * That tradeoff is real, not free: the mounted content (in particular any
   * simulation.src, loaded via dynamic import()) runs in this tab's own
   * origin with this tab's own IndexedDB access (profiles, lessonProgress,
   * ...) for as long as the tab stays open — same exposure addSource()'s own
   * doc comment already accepts for a *registered* remote source, just
   * without that flow's explicit warning step. Fine for a trusted preview
   * (an agent's own throwaway browser context, a teammate's own content) —
   * a caller showing this to a human in a shared/long-lived browser profile
   * should still surface that fact somewhere visible.
   *
   * Deliberately does not check for an existing registration the way
   * addSource() throws on a duplicate bundleId — re-previewing the same
   * bundle after a content edit should just overwrite, not error.
   */
  registerEphemeral(bundleId, baseUrl) {
    if (!bundleId || !baseUrl) return;
    _ephemeralCache.set(bundleId, baseUrl);
  },

  /** Forgets an ephemeral registration early. Rarely needed — the whole
   *  point of registerEphemeral() is that it already disappears on
   *  reload — but lets a long-lived preview tab switch sources without a
   *  stale mapping lingering underneath a reused bundleId. */
  unregisterEphemeral(bundleId) {
    _ephemeralCache.delete(bundleId);
  },

  /**
   * Fetches manifest.json at `manifestUrl` and registers it ephemerally
   * under the bundleId it declares — the read-only, no-persistence
   * counterpart to addSource() (same URL-completion and validation
   * behavior; see that method's own comments). Returns the bundleId so a
   * caller (app bootstrap, a preview route) can immediately build a
   * `courses/<bundleId>/...` path against it.
   */
  async registerEphemeralFromManifestUrl(manifestUrl) {
    const trimmed = String(manifestUrl || '').trim();
    if (!trimmed) throw new Error('Enter a manifest URL.');
    const url = trimmed.endsWith('.json') ? trimmed : `${trimmed.replace(/\/$/, '')}/manifest.json`;

    let manifest;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      manifest = await res.json();
    } catch (e) {
      throw new Error(`Could not load manifest.json from that URL: ${e.message}`);
    }
    if (!manifest?.bundleId) {
      throw new Error('That manifest.json is missing required field bundleId.');
    }

    CourseSourceManager.registerEphemeral(manifest.bundleId, deriveBaseUrl(url));
    return manifest.bundleId;
  },

  /**
   * Extracts the bundleId from a content-relative path of the shape
   * `.../courses/<bundleId>/(lessons|blocks|questions|modules|tests|media|simulations)/...`
   * — mirrors the `L0N` folder convention's own path matching
   * (`deriveMediaDir()` in authoring-app/modules/assets.js). Returns null
   * for anything that doesn't look like a course-bundle-owned path (e.g. an
   * engine-bundled `/src/simulations/...` scene, always local).
   */
  deriveBundleId(path) {
    const m = String(path || '').match(/courses\/(.+?)\/(lessons|blocks|questions|modules|tests|media|simulations|explanations|banks)\//);
    return m ? m[1] : null;
  },

  /**
   * Rewrites a content-relative path (a JSON doc via ContentLoader, a
   * simulation module path via SimulationLoader, or an image `src`
   * embedded straight into a template) to the URL it should actually be
   * fetched from: unchanged for a local bundle (today's exact behavior —
   * same-origin absolute path, browser resolves it as always) or the
   * registered remote origin for one added via addSource(). A path that
   * doesn't resolve to any known bundleId, or belongs to a bundleId that
   * isn't registered as remote, is returned unchanged — this function can
   * never make a working local reference stop working.
   */
  resolveContentUrl(path) {
    if (!path) return path;
    // Every "unchanged" branch below used to return the literal root-
    // absolute `path` string — correct at the origin root, but broken at a
    // subdirectory deployment (cross-device-sync sprint, Stage 2: "the
    // resolver emits root-absolute paths"). A registered-remote path
    // (the `new URL(remainder, baseUrl).href` case at the end) is already a
    // real absolute URL and needs no change.
    const bundleId = CourseSourceManager.deriveBundleId(path);
    if (!bundleId) return appUrl(path);
    const baseUrl = CourseSourceManager.resolveBaseUrlSync(bundleId);
    if (!baseUrl) return appUrl(path);
    const marker = `courses/${bundleId}/`;
    const idx = path.indexOf(marker);
    if (idx === -1) return appUrl(path);
    const remainder = path.slice(idx + marker.length);
    return new URL(remainder, baseUrl).href;
  },

  /**
   * Resolves an *authored* ref (blockRef, lessonRef, a question's `ref`,
   * `image.src`/`srcDark`, a `simulation.src`) to a fetchable
   * URL, anchored at the given bundle's own manifest.json — never at the
   * referencing file's own location, so a block three folders deep and a
   * lesson at the bundle root both just write "media/foo.png", not a
   * relative climb. This is what makes a bundle survive being copied or
   * renamed: nothing inside it needs to know its own folder name.
   *
   * Three cases, checked in order:
   *  1. Already an absolute URL (`http(s)://` or protocol-relative `//...`)
   *     — a remote asset/course referenced directly. Returned unchanged.
   *  2. Starts with `/` — the legacy root-absolute convention every
   *     pre-existing piece of content already uses (bundleId baked into the
   *     string). Delegated to resolveContentUrl() for its existing
   *     local-unchanged / registered-remote-rewrite behavior, so old
   *     content keeps working with zero migration required.
   *  3. Anything else — genuinely bundle-relative. Joined onto this
   *     bundleId's manifest.json location: a registered remote source's
   *     baseUrl, or this origin's own /content/courses/<bundleId>/ for a
   *     local bundle (by site convention, exactly where that bundle's own
   *     manifest.json lives — no need to actually fetch it to know that).
   *
   * `bundleId` is whatever the caller already threaded down (LessonEngine/
   * TestEngine's `this._bundleId`, a mounted plugin's `ctx.bundleId`, etc).
   * Without one, a relative ref can't be anchored anywhere — returned
   * unchanged, which surfaces as a 404 the same way a bad path does today,
   * never a thrown error.
   */
  resolveRef(ref, bundleId) {
    if (!ref) return ref;
    if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(ref)) return ref;
    if (ref.startsWith('/')) return CourseSourceManager.resolveContentUrl(ref);
    if (!bundleId) return ref;
    const remoteBase = CourseSourceManager.resolveBaseUrlSync(bundleId);
    return remoteBase ? new URL(ref, remoteBase).href : appUrl(`content/courses/${bundleId}/${ref}`);
  },

  /**
   * Same bundle-relative expansion as resolveRef()'s 3rd case, but stops at
   * the logical `/content/courses/<bundleId>/...` form instead of rewriting
   * to a remote source's real origin — for the handful of call sites
   * (building a `#/lesson/...` route, a next/prev lessonRef) that pass a ref
   * *through* app state/routing rather than fetching it immediately.
   * LessonEngine/LessonSession's own prefix logic already assumes
   * `lessonId` looks like this local/logical shape regardless of whether the
   * bundle turns out to be local or remote — resolveRef's remote rewrite
   * would hand them a bare `https://...` URL instead and break that
   * assumption. Actual cross-origin resolution still happens later, at the
   * real ContentLoader.loadJSON() fetch, via resolveRef/resolveContentUrl.
   */
  expandRef(ref, bundleId) {
    if (!ref) return ref;
    if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(ref)) return ref;
    if (ref.startsWith('/') || !bundleId) return ref;
    return `/content/courses/${bundleId}/${ref}`;
  },
};
