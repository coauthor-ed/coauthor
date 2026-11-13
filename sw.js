// Bump on EVERY change under /src/. The fetch handler below is cache-first
// across the whole `/src/` prefix, so a *modified* file already in the cache is
// served stale forever until this name changes — while `/content/` is
// stale-while-revalidate and serves a cached copy immediately, catching up to
// new JSON on the NEXT load. A returning student would otherwise run the old
// engine against new content.
const CACHE_NAME = 'coauthor-shell-v234';
// Bumped alongside CACHE_NAME here: catalog.json removal changed
// HomeDashboard.js/TestDashboard.js's fetch behavior, but stale-while-
// revalidate (see staleWhileRevalidate() below) serves whatever's already
// cached immediately regardless of what the network returns — including a
// stale 200 for a now-deleted /content/catalog.json from before this
// change, which would otherwise keep "working" (serving old data) forever
// for any browser that had it cached from an earlier visit.
const CONTENT_CACHE = 'coauthor-content-v6';
// Cross-origin assets from a registered remote course source
// (CourseSourceManager/AssetPrefetcher) — separate from CONTENT_CACHE so
// remote media/JSON isn't churned by CONTENT_CACHE's own lifecycle, and
// separate from CACHE_NAME so it isn't wiped by every shell version bump
// (a remote host's content doesn't change just because this app's engine
// code did). AssetPrefetcher.js also writes into this exact cache name
// directly from page scripts — same store, two writers.
const ASSET_CACHE = 'coauthor-assets-v1';
// Provider-bridged content (currently: authoring-app's Full Preview/Pop-out
// prewarming a simulation scene it just read via the active provider —
// GitHub/registered-root/Local Files — into Cache Storage under its
// same-origin virtual path, since that's the only way that content can ever
// be reached by a plain fetch()/dynamic import() at all). Deliberately its
// own bucket, NOT CONTENT_CACHE: src/app.js unconditionally deletes every
// `coauthor-*` bucket on a `?preview=true` load (correct for CONTENT_CACHE —
// a locally-edited file must never serve a stale cached copy during
// preview) except this one by name (see that file) — a bridged entry has no
// "fresher" version a real network fetch could ever produce (there's no
// real file at that same-origin path to begin with), so wiping it on every
// preview load only ever breaks it, never freshens it.
const BRIDGE_CACHE = 'coauthor-bridge-v1';

// This app's actual root — '/' at the origin root, '/coauthor/' at a
// subdirectory deployment. A classic (non-module) worker has no
// import.meta.url, so this is computed from self.location the way the
// (module-context) src/core/basePath.js's own APP_BASE is computed from
// import.meta.url — same idea, different mechanism, per file type
// (cross-device-sync sprint, Stage 2). sw.js is always registered at
// exactly `<APP_ROOT>/sw.js` (see app.js's register() call and this
// module's own scope), so self.location IS the app root plus 'sw.js'.
const BASE = new URL('./', self.location).pathname;

const SHELL_ASSETS = [
  '',
  'index.html',
  'manifest.webmanifest',
  'assets/icons/coauthor.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-32.png',
  'vendor/lit.js',
  'vendor/idb.js',
  'vendor/qrcode.js',
  'vendor/marked.esm.js',
  'src/app.js',
  'src/ui/AppShell.js',
  'src/ui/pageTurn.js',
  'src/ui/Router.js',
  'src/core/resolveTagName.js',
  'src/core/EventBus.js',
  'src/core/PRNG.js',
  'src/core/Hasher.js',
  'src/core/ErrorReporter.js',
  'src/core/ProgressStore.js',
  'src/core/ContentLoader.js',
  'src/core/A11yAnnouncer.js',
  'src/core/mountPlugin.js',
  'src/core/CourseSourceManager.js',
  'src/core/AssetPrefetcher.js',
  'src/core/OfflinePrefetcher.js',
  'src/core/shareLinks.js',
  'src/core/InstallPrompt.js',
  'src/core/mathliveConfig.js',
  'src/core/LoadingIndicator.js',
  'src/core/markdown/mathMask.js',
  'src/core/markdown/splitSteps.js',
  'src/core/markdown/slideTitle.js',
  'src/core/focusRect.js',
  'src/core/LookManager.js',
  'src/core/courseManifest.js',
  'src/core/cues.js',
  'src/core/mixins/GamificationMixin.js',
  'src/core/mixins/LookMixin.js',
  'src/core/components/stageAnswer.js',
  'src/core/components/narrationCover.js',
  'src/looks/quill/reactor.js',
  'src/looks/quill/stage.js',
  'src/looks/quill/brand.js',
  'src/looks/quill/QuillCameo.js',
  'src/looks/quill/cameoPlan.js',
  'src/looks/plain/look.css',
  'src/looks/plain/reactor.js',
  'src/looks/plain/brand.js',
  'src/simulations/base/kit/looks/plain.js',
  'src/simulations/base/kit/TapLight.js',
  'vendor/fonts/plain-fonts.css',
  'vendor/fonts/antic-didone/antic-didone-regular.ttf',
  'vendor/fonts/instrument-sans/instrument-sans-regular.ttf',
  'vendor/fonts/instrument-sans/instrument-sans-semibold.ttf',
  'vendor/fonts/instrument-sans/instrument-sans-bold.ttf',
  'vendor/fonts/source-serif-4/source-serif-4-latin-wght-normal.woff2',
  'vendor/fonts/source-serif-4/source-serif-4-latin-ext-wght-normal.woff2',
  'vendor/fonts/source-sans-3/source-sans-3-latin-wght-normal.woff2',
  'vendor/fonts/source-sans-3/source-sans-3-latin-ext-wght-normal.woff2',
  'vendor/fonts/source-sans-3/source-sans-3-latin-wght-italic.woff2',
  'vendor/fonts/source-sans-3/source-sans-3-latin-ext-wght-italic.woff2',
  'vendor/fonts/source-sans-3/source-sans-3-sups-wght-normal.woff2',
  'vendor/fonts/source-serif-4/source-serif-4-sups-wght-normal.woff2',
  'src/ui/components/LookSlots.js',
  'src/ui/components/ShareSheet.js',
  'src/ui/pageChange.js',
  'src/ui/components/QuillMascot.js',
  'src/core/quill/QuillRig.js',
  'src/core/quill/quillActs.js',
  'src/ui/celebrate.js',
  'src/core/AuthService.js',
  'src/core/SyncManager.js',
  'src/ui/components/ProgressBar.js',
  'src/ui/components/ToastZone.js',
  'src/ui/components/CoAuthorLogo.js',
  'src/ui/components/QuillLoader.js',
  'src/ui/components/QuillSignature.js',
  'src/ui/components/brandSvg.js',
  'src/core/quill/quillShapes.js',
  'src/ui/components/MarkdownRenderer.js',
  'src/ui/components/AudioPlayer.js',
  'src/registry/BlockRegistry.js',
  'src/registry/QuestionRegistry.js',
  'registry/blocks.json',
  'registry/questions.json',
  'registry/looks.json',
  'vendor/fonts/app-fonts.css',
  'vendor/fonts/KaTeX_Main-Bold.woff2',
  'vendor/fonts/nunito/nunito.css',
  'vendor/fonts/nunito/Nunito-latin.woff2',
  'vendor/fonts/nunito/Nunito-symbols.woff2',
  'vendor/fonts/nunito/Nunito-rupee.woff2',
  'vendor/fonts/fredoka/fredoka.css',
  'vendor/fonts/fredoka/Fredoka-latin.woff2',
  'src/engines/lesson/LessonEngine.js',
  'src/engines/test/TestEngine.js',
  // The learner's route views (lazy in AppShell) and what they and app.js
  // import. Runtime caching alone leaves a view never opened since the last
  // CACHE_NAME bump missing offline: a course then cannot open at all.
  'src/config/defaultCourseSources.js',
  'src/core/DeviceIdentity.js',
  'src/core/GamificationService.js',
  'src/core/LessonModeManager.js',
  'src/core/PracticeTestBuilder.js',
  'src/core/ShowcaseService.js',
  'src/core/SimViewPrefs.js',
  'src/core/SimulationLoader.js',
  'src/core/discoverNudge.js',
  'src/core/ThemeManager.js',
  'src/core/themePref.js',
  'src/core/themeBoot.js',
  'src/core/UpdateManager.js',
  'src/core/basePath.js',
  'src/core/components/PluginErrorBoundary.js',
  'src/core/hydrateProseRefs.js',
  'src/core/lessonProgressRules.js',
  'src/core/gradeLabel.js',
  'src/core/migrations/001-initial.js',
  'src/core/migrations/002-gamification.js',
  'src/core/migrations/003-semantic-attempts.js',
  'src/core/migrations/004-course-sources.js',
  'src/core/migrations/005-course-source-aggregators.js',
  'src/core/migrations/006-default-course-source-state.js',
  'src/core/migrations/007-xp-source-key.js',
  'src/core/migrations/008-practice-tests.js',
  'src/core/migrations/009-dedup-practice-test-questions.js',
  'src/core/migrations/010-course-notes.js',
  'src/core/migrations/011-enrollments.js',
  'src/core/migrations/migrationRunner.js',
  'src/core/mixins/LessonModeMixin.js',
  'src/engines/lesson/POEController.js',
  'src/ui/components/GuideHelp.js',
  'src/ui/components/ModuleHeroCard.js',
  'src/ui/components/ProgressRing.js',
  'src/ui/components/StreakBadge.js',
  'src/ui/components/dialogs.js',
  'src/ui/icons/navIcons.js',
  'src/ui/icons/uiIcons.js',
  'src/ui/sharedStyles.js',
  'src/ui/views/HomeDashboard.js',
  'src/ui/views/AddCourseView.js',
  'src/ui/views/LessonSession.js',
  'src/ui/views/ModuleDashboard.js',
  'src/ui/views/CourseDashboard.js',
  'src/ui/views/TestSession.js'
].map((p) => BASE + p);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      // site.json is optional, so it stays out of addAll (a 404 there would
      // fail the install). Seeded here so the second visit has it offline.
      .then(() => caches.open(CONTENT_CACHE).then((c) => c.add(BASE + 'site.json')).catch(() => {}))
      .then(() => {
        if (self.registration.active) {
          return self.clients.matchAll().then(clients => {
            clients.forEach(client => client.postMessage({ type: 'update-available' }));
          });
        }
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== CONTENT_CACHE && name !== ASSET_CACHE && name !== BRIDGE_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Claim clients immediately
  event.waitUntil(clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

/**
 * Serves the cached copy immediately if there is one (so a repeat visit to
 * an already-fetched lesson/media/simulation file is instant, not just
 * offline-resilient) while always kicking off a network fetch in the
 * background to refresh the cache for NEXT time. Falls back to the network
 * fetch's own promise when there's nothing cached yet (first visit).
 *
 * This replaces the old network-first-with-cache-fallback strategy for
 * content JSON and cross-origin assets: that strategy only ever consulted
 * the cache when the network *failed*, so a warm cache never actually made
 * a repeat load faster — every image/lesson/simulation refetched over the
 * network every single time, which is what made a remote course source
 * feel persistently slow even after the first load warmed the cache.
 */
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const network = fetch(request).then((networkResponse) => {
        // Cache.put() throws for anything but GET (a HEAD/OPTIONS request —
        // e.g. a browser preconnect/prefetch probe — routed through here
        // used to reject with "Request method 'HEAD' is unsupported" and
        // surface as an uncaught promise rejection in the console).
        if (networkResponse.ok && request.method === 'GET') cache.put(request, networkResponse.clone());
        return networkResponse;
      }).catch(() => cached);
      return cached || network;
    })
  );
}

// Audio (narrated lessons' MP3s, AudioPlayer clips). A media element asks
// with a Range header and needs a 206 back to seek (mid-beat resume, the
// scrubber). The generic branches below would answer a cached full 200 to a
// range request (no seeking) and try to cache.put() a 206 (which throws).
// So audio is handled here, before them:
// - same-origin: cache-on-play. A cached full copy answers a range request
//   as a 206 sliced from it (offline narration works); on a miss the
//   request passes straight to the network, range intact, while one plain
//   full GET fills the cache in the background for next time.
// - cross-origin: not intercepted at all (an <audio> no-cors fetch is
//   opaque; slicing or caching it is not possible here).
// Not precached: a file a learner played is stored, and OfflinePrefetcher
// asks for every clip of an opened lesson with a plain GET (no Range). That
// plain GET is answered from the one network fetch and cached from it, so a
// prefetched clip is downloaded once, not twice.
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|weba)$/i;
const audioFilling = new Set();

function isAudioRequest(request, url) {
  return request.method === 'GET' && (request.destination === 'audio' || AUDIO_EXT.test(url.pathname));
}

/** A 206 for `rangeHeader` sliced from a cached full response, or the full response if unparseable. */
async function rangeFromCached(cached, rangeHeader) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((rangeHeader || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return cached;
  const blob = await cached.blob();
  const size = blob.size;
  let start; let end;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const type = cached.headers.get('Content-Type') || 'audio/mpeg';
  return new Response(blob.slice(start, end + 1, type), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': type,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  });
}

function fillAudioCache(href) {
  if (audioFilling.has(href)) return Promise.resolve();
  audioFilling.add(href);
  return fetch(href)
    .then((res) => (res.status === 200 ? caches.open(CONTENT_CACHE).then((c) => c.put(href, res)) : null))
    .catch(() => {})
    .finally(() => audioFilling.delete(href));
}

function handleAudio(event, url) {
  const req = event.request;
  const href = url.origin + url.pathname + url.search;
  const hit = caches.open(CONTENT_CACHE).then((c) => c.match(href)).catch(() => undefined);
  const range = req.headers.get('Range');
  if (!range) {
    let stored;
    const storing = new Promise((resolve) => { stored = resolve; });
    event.waitUntil(storing);
    const full = hit.then((cached) => { if (cached) { stored(); return cached; } return fetch(req).then((res) => {
      if (res.status === 200 && !audioFilling.has(href)) {
        const copy = res.clone();
        audioFilling.add(href);
        caches.open(CONTENT_CACHE).then((c) => c.put(href, copy)).catch(() => {})
          .finally(() => { audioFilling.delete(href); stored(); });
      } else {
        stored();
      }
      return res;
    }); });
    full.catch(() => stored());
    event.respondWith(full.catch(() => new Response(null, { status: 503, statusText: 'Service Unavailable' })));
    return;
  }
  event.respondWith(
    hit.then((cached) => (cached ? rangeFromCached(cached, range) : fetch(req)))
      .catch(() => new Response(null, { status: 503, statusText: 'Service Unavailable' }))
  );
  event.waitUntil(hit.then((cached) => (cached ? null : fillAudioCache(href))));
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Store-page screencasts (Discover): video is never intercepted or cached.
  // It streams from the network with its Range header intact; offline, the
  // poster image stays and the clip simply does not play.
  if (event.request.destination === 'video' || /\.(mp4|webm|m4v)$/i.test(url.pathname)) return;

  if (isAudioRequest(event.request, url)) {
    if (url.origin === self.location.origin && !url.pathname.startsWith(BASE + '_api/')) handleAudio(event, url);
    return;
  }

  // Vendor and shell assets: Cache-first, with dynamic caching for lazy-loaded modules
  if (url.pathname.startsWith(BASE + 'vendor/') || url.pathname.startsWith(BASE + 'src/') || url.pathname.startsWith(BASE + 'registry/') || url.pathname === BASE || url.pathname === BASE + 'index.html') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request).then(response => {
          // Clone the response to dynamically cache lazy-loaded assets (e.g. mathjs, katex)
          const responseClone = response.clone();
          // Cache.put() throws for anything but GET (e.g. a browser
          // preconnect/prefetch HEAD probe ahead of a navigation to this
          // same URL) — same class of uncaught rejection already guarded
          // against in staleWhileRevalidate(), missed here originally since
          // this branch predates that fix and has its own separate put().
          if (event.request.method === 'GET') {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Deployment config, not engine code, so a change must not wait for a
  // CACHE_NAME bump: network-first, the cached copy offline. An empty object
  // when nothing is cached: LookManager treats that as "no site opinion".
  if (url.pathname === BASE + 'site.json' && event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CONTENT_CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      }).catch(() => caches.open(CONTENT_CACHE).then((c) => c.match(event.request, { ignoreSearch: true }))
        .then((hit) => hit || new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } })))
    );
    return;
  }

  // Published guides (tools/guides/build-guides.mjs -> guides/dist/). They
  // are content, not an app update, so invariant 7 does not apply: the
  // index is network-first (a new guide shows up on the next visit) with the
  // cached copy as the offline fallback; guide bodies and media are
  // stale-while-revalidate like /content/.
  if (url.origin === self.location.origin && url.pathname.startsWith(BASE + 'guides/dist/') && event.request.method === 'GET') {
    if (url.pathname === BASE + 'guides/dist/index.json') {
      event.respondWith(
        fetch(event.request).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CONTENT_CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        }).catch(() => caches.open(CONTENT_CACHE).then((c) => c.match(event.request, { ignoreSearch: true }))
          .then((hit) => hit || new Response('{"guides":[]}', { status: 503, headers: { 'Content-Type': 'application/json' } })))
      );
    } else {
      event.respondWith(staleWhileRevalidate(event.request, CONTENT_CACHE));
    }
    return;
  }

  // Content JSON (this origin's own /content/): stale-while-revalidate — a
  // lesson/block/question/media file already visited once serves instantly
  // from cache, while a background fetch keeps it fresh for next time.
  // Origin-checked (unlike the old version) so a cross-origin request whose
  // *pathname* also happens to start with /content/ — e.g. a remote course
  // source mirrors the same content/courses/... layout at its own domain —
  // falls through to the cross-origin branch below and lands in ASSET_CACHE
  // instead, matching this file's own stated cache-naming intent.
  // showcase/ is the engine-owned demo bundle (ShowcaseService.js), same strategy.
  if (url.origin === self.location.origin && (url.pathname.startsWith(BASE + 'content/') || url.pathname.startsWith(BASE + 'showcase/'))) {
    // Check BRIDGE_CACHE first — ignoreSearch, since authoring-app's
    // preview mode (ContentLoader.js, SimulationLoader.js) deliberately
    // appends a `_previewTs=<timestamp>` cache-busting query param to every
    // request it makes, so a bridged entry (written under the plain URL —
    // see BRIDGE_CACHE's own comment above) still matches regardless of
    // which timestamp this particular call generated. A hit here is served
    // directly, no revalidate: a bridged entry has no real same-origin file
    // to revalidate against (that's the whole reason it needed bridging),
    // so a background fetch would only ever waste a request on a guaranteed
    // 404. A miss falls through to the normal CONTENT_CACHE
    // stale-while-revalidate path for genuinely local content, unchanged.
    event.respondWith(
      caches.open(BRIDGE_CACHE)
        .then((bridge) => bridge.match(event.request, { ignoreSearch: true }))
        .then((bridged) => bridged || staleWhileRevalidate(event.request, CONTENT_CACHE))
    );
    return;
  }

  // Cross-origin: a registered remote course source's own lessons/media/
  // simulation JS (CourseSourceManager) is fetched straight from its
  // origin, same stale-while-revalidate strategy as local /content/ above,
  // just against ASSET_CACHE instead. This SW has no cheap way to check the
  // actual registered-sources list (that's in IDB, read from page scripts,
  // not here) so it treats any cross-origin GET as a candidate — harmless
  // for anything else cross-origin a page might load (e.g. Google Fonts),
  // which this only ever makes more offline-resilient/faster, never less
  // correct: an `<img>`'s default `no-cors` request yields an opaque
  // response (status/ok unreadable here), which is still perfectly
  // cacheable, just not something to branch logic on.
  // Also covers course repos served from this SAME origin but outside this
  // app's own path (GitHub Pages: coauthor-ed.github.io/coauthor/ is the app,
  // coauthor-ed.github.io/cbse-grade9-science/ is a course). Without this a
  // course's lessons were never cached and could not open offline.
  if ((url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) && event.request.method === 'GET') {
    event.respondWith(staleWhileRevalidate(event.request, ASSET_CACHE));
    return;
  }

  // Default: Network first. A rejected fetch() with no catch here used to
  // surface as an uncaught "FetchEvent resulted in a network error
  // response" promise rejection instead of a normal failed response.
  event.respondWith(
    fetch(event.request).catch((e) => {
      console.warn('[sw] fetch failed for', event.request.url, e);
      return new Response('Network error', { status: 503, statusText: 'Service Unavailable' });
    })
  );
});
