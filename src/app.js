import { AppShell } from './ui/AppShell.js';
import { Router } from './ui/Router.js';
import { CourseSourceManager } from './core/CourseSourceManager.js';
import { UpdateManager } from './core/UpdateManager.js';
import { EventBus } from './core/EventBus.js';
import { appUrl } from './core/basePath.js';
import { registerShowcaseSource } from './core/ShowcaseService.js';
import { InstallPrompt } from './core/InstallPrompt.js';

// Define custom elements
customElements.define('app-shell', AppShell);

// preview=true is checked ahead of the SW registration below (not just by
// ContentLoader/LessonEngine/TestEngine, which each check it independently
// for their own reasons) because sw.js's own /content/ and cross-origin
// fetch handling is stale-while-revalidate BY DESIGN (see that file's own
// comment): it serves whatever's already cached immediately and only
// refreshes the cache in the background, for a real student's repeat-visit
// performance. That is exactly backwards for previewing draft content — an
// agent fixing a simulation bug and reloading the same preview URL needs
// the file that's on disk right now, not a cached copy from before the fix.
const isPreviewSession = window.location.search.includes('preview=true') || window.location.hash.includes('preview=true');

if ('serviceWorker' in navigator) {
  if (isPreviewSession) {
    // Deliberately does NOT call reg.unregister() here (an earlier version
    // of this file did). That relied on unregister() leaving an
    // already-loading page's SW control alone per spec — a nuance that
    // can't be verified from here and, in practice, left Full Preview's
    // iframe (a brand-new navigation created and controlled at the moment
    // this very script runs) unable to reliably load anything only
    // reachable through the SW's cache (see preview.js's
    // prewarmMediaCache() / sw.js's BRIDGE_CACHE) — the one thing
    // Full Preview actually needs from the SW. Clearing the caches below
    // (everything except the provider-bridge bucket) already gets the
    // "never serve a stale locally-edited file" guarantee this block
    // exists for — an emptied cache forces a fresh network fetch on next
    // request regardless of which SW instance serves it, so keeping the
    // registration intact costs nothing and removes the ambiguity.
    if ('caches' in window) {
      // Every coauthor-* bucket except 'coauthor-bridge-v1', not just
      // content/assets — coauthor-shell-* (sw.js's CACHE_NAME) is
      // cache-FIRST, not stale-while-revalidate, for /src/ and /vendor/,
      // which also dynamically caches any lazily-import()ed module under
      // /src/ — including a generic, engine-bundled simulation scene at
      // /src/simulations/<subject>/Foo.js (as opposed to a course-bundle-
      // owned one under /content/courses/.../simulations/, already covered
      // by coauthor-content-*). Left out of the original fix for this same
      // reason previewing was added in the first place: an agent's fix to
      // exactly that kind of scene would still never show up.
      //
      // 'coauthor-bridge-v1' is the one deliberate exception: authoring-app
      // (preview.js's prewarmMediaCache()) writes a course-bundle
      // simulation scene there — read moments earlier via the actively
      // connected provider (GitHub/registered-root/Local Files) — as the
      // *only* way that content is reachable by a same-origin fetch/import()
      // at all, since no real file exists at that same-origin path to serve
      // it from. Full Preview's iframe navigates to a `?preview=true` URL
      // right after that prewarm runs; wiping this bucket the same way as
      // the others would destroy the entry before the plugin's own
      // import() ever gets to use it, and — unlike every other bucket here —
      // there is no "fresher" version a real network fetch could produce to
      // replace it with, so preserving it can never serve genuinely stale
      // content the way preserving CONTENT_CACHE would.
      caches.keys().then((keys) => {
        keys.filter((k) => k.startsWith('coauthor-') && k !== 'coauthor-bridge-v1').forEach((k) => caches.delete(k));
      });
    }
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(appUrl('sw.js'))
        .then(registration => {
          console.log('SW registered: ', registration);
        })
        .catch(registrationError => {
          console.log('SW registration failed: ', registrationError);
        });

      // Was dead code — defined but never called anywhere in src/ (only
      // UpdateManager.applyUpdate() was, from UpdateToast.js). Without this,
      // `sw.js`'s update-available broadcast and updatefound/statechange are
      // never listened for, so a fix shipped after a student has already
      // loaded the app can never reach them (cross-device-sync sprint,
      // Stage 3 — promoted from housekeeping to blocking for exactly that
      // reason once public hosting is the point of shipping at all).
      UpdateManager.init();

      // Request persistent storage
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().then(isPersisted => {
          console.log(`Storage persisted: ${isPersisted}`);
          // A refusal used to be visible only in devtools — the difference
          // between durable storage and silent eviction under storage
          // pressure was invisible to parent and student alike.
          if (!isPersisted) {
            EventBus.emit('ui:toast', {
              icon: '⚠️',
              text: 'This device may clear saved progress under low storage. Consider freeing up space.',
            });
          }
        });
      }
    });
  }
}

// Preview bootstrap: ?remoteManifestUrl=<url> registers that bundle's
// baseUrl for this tab only (CourseSourceManager.registerEphemeral(), never
// persisted to IndexedDB — see its own doc comment for the tradeoffs), so
// `#/lesson/courses/<bundleId>/...` and `#/preview/courses/<bundleId>/...`
// deep links can resolve content from a bundle that was never registered
// via the Settings UI's addSource() flow — a content-repo-template checkout
// served over HTTP, a teammate's LAN box. Must finish before Router.init()
// ever dispatches a route, so it's awaited here, ahead of that call — the
// first content fetch a route triggers needs the mapping already in place.
async function bootstrapEphemeralPreviewSource() {
  const remoteManifestUrl = new URLSearchParams(window.location.search).get('remoteManifestUrl');
  if (!remoteManifestUrl) return;
  try {
    await CourseSourceManager.registerEphemeralFromManifestUrl(remoteManifestUrl);
  } catch (e) {
    console.error('[preview] Could not register remote preview source:', e);
  }
}

// Preview only: ?reviewApi=<kit url> loads the content kit's review bar (approve / notes / live reload), served by the kit
// (content-repo-template tools/operator/preview.mjs). Never runs outside preview mode; a failure only logs.
(function loadReviewBar() {
  if (!isPreviewSession) return;
  const api = new URLSearchParams(window.location.search).get('reviewApi');
  if (!api || !/^https?:\/\//.test(api)) return;
  // The ?t= keeps sw.js's stale-while-revalidate cross-origin cache from serving a previous kit version of the bar.
  import(`${api.replace(/\/$/, '')}/review-bar.js?t=${Date.now()}`).catch((e) => console.warn('[preview] review bar not loaded:', e));
})();

// Chrome offers the install once, early: keep it for the add-course page (Q-53b).
InstallPrompt.start();

// Initialize Router
registerShowcaseSource();
await bootstrapEphemeralPreviewSource();
const router = new Router();
router.init();

// Mount AppShell
const appContainer = document.getElementById('app');
const appShell = document.createElement('app-shell');
appContainer.appendChild(appShell);
