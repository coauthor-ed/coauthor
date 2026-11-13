import { EventBus } from './EventBus.js';
import { ContentLoader } from './ContentLoader.js';
import { CourseSourceManager } from './CourseSourceManager.js';
import { SimulationLoader } from './SimulationLoader.js';
import { OfflinePrefetcher } from './OfflinePrefetcher.js';

const CACHE_NAME = 'coauthor-assets-v1';

/** Every media URL a block/question payload references — its own image,
 *  the dark-mode variant, any per-beat `reveal.images` override, and a
 *  sibling-`.md` prose ref (markdownRef/promptRef — see
 *  hydrateProseRefs.js) so the next slide's prose is warm too. A `.md` is a
 *  plain fetch-and-cache like an image — warmMedia() below needs no
 *  special-casing for it. */
function mediaUrls(data) {
  if (!data) return [];
  const urls = [];
  if (data.image?.src) urls.push(data.image.src);
  if (data.image?.srcDark) urls.push(data.image.srcDark);
  if (data.reveal?.images) {
    for (const img of Object.values(data.reveal.images)) {
      if (img?.src) urls.push(img.src);
    }
  }
  if (data.markdownRef) urls.push(data.markdownRef);
  if (data.promptRef) urls.push(data.promptRef);
  return urls;
}

async function warmMedia(urls, bundleId) {
  if (!urls.length || typeof caches === 'undefined') return;
  let cache;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch {
    return; // Cache Storage unavailable (e.g. private browsing) — nothing to warm, no error to surface.
  }
  await Promise.all(urls.map(async (rawUrl) => {
    const url = CourseSourceManager.resolveRef(rawUrl, bundleId);
    try {
      if (await cache.match(url)) return; // already warm
      const res = await fetch(url);
      if (res.ok) await cache.put(url, res);
    } catch {
      // Best-effort — a failed prefetch just means the real navigation
      // fetches it fresh, same as if this module didn't run at all.
    }
  }));
}

async function warmSimulation(src, bundleId) {
  if (!src) return;
  try {
    await SimulationLoader.loadModule(src, bundleId);
  } catch {
    // Same best-effort contract as warmMedia — the real navigation's own
    // loadModule() call will surface the error properly if it's real.
  }
}

async function warmEntry(entry) {
  let data = entry.data;
  if (!data && entry.ref) {
    try {
      data = await ContentLoader.loadJSON(entry.ref);
    } catch {
      return; // Unreachable/not-yet-published ref — nothing to warm.
    }
  }
  if (!data) return;
  await Promise.all([warmMedia(mediaUrls(data), entry.bundleId), warmSimulation(data.simulation?.src, entry.bundleId)]);
}

/** Imports the next slide's scene module (its files are already cached by then). */
async function warmSceneOnly(entry) {
  let data = entry?.data;
  if (!data && entry?.ref) {
    try { data = await ContentLoader.loadJSON(entry.ref); } catch { return; }
  }
  await warmSimulation(data?.simulation?.src, entry?.bundleId);
}

/**
 * Proactively warms the *next* beat's/question's media (via the Cache API)
 * and simulation module (via SimulationLoader, whose own module-promise
 * cache keeps the import warm for the real navigation) while the student
 * is still looking at the current one — so advancing doesn't visibly stall
 * on a fetch, especially for a remote course source (CourseSourceManager)
 * where that fetch is cross-origin instead of same-origin.
 *
 * Purely additive: every consumer already works with this never having run
 * — a cold cache or a failed prefetch just means the normal on-demand load
 * happens instead, identical to today's behavior. Never throws.
 */
export const AssetPrefetcher = {
  _started: false,

  /** Idempotent — safe to call from more than one bootstrap path. */
  start() {
    if (this._started) return;
    this._started = true;
    EventBus.on('lesson:beat-changed', (detail) => AssetPrefetcher._handle(detail));
    EventBus.on('test:beat-changed', (detail) => AssetPrefetcher._handle(detail));
    // The whole lesson/test for offline use (D18), started alongside.
    OfflinePrefetcher.start();
  },

  _handle(detail) {
    const preview = window.location.search.includes('preview=true') || window.location.hash.includes('preview=true');
    if (preview) {
      // Authoring preview: nothing is cached for offline, warm as before.
      for (const entry of detail?.next || []) {
        warmEntry(entry).catch(() => {}); // fire-and-forget, see warmEntry's own best-effort contract
      }
      return;
    }
    // Q-45: OfflinePrefetcher fetches the next two slides' files first
    // (JSON, prose, media, scene and plugin module graphs, narration clips),
    // through the service worker into Cache Storage. Then the very next
    // slide's scene module is imported from that cache, so it is ready to
    // run the moment the learner presses Next.
    OfflinePrefetcher.prefetchAhead(detail).then((current) => {
      if (current === false && navigator.onLine) return; // overtaken by another slide change, or nothing ahead
      for (const entry of detail?.next || []) warmSceneOnly(entry).catch(() => {});
    });
  },
};
