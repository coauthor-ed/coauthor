import { EventBus } from './EventBus.js';
import { CourseSourceManager } from './CourseSourceManager.js';
import { OfflinePrefetcher, LESSON_VIEW } from './OfflinePrefetcher.js';
import { lessonJsonPath, normalizeLessonData, isFlowLesson, linearEntry, allBlockEntries } from './lessonEntries.js';
import { getNarratePref } from './narration/voicePref.js';

/**
 * OfflineAvailability (Q-100a): which lessons, and which slides of a lesson,
 * can be shown with no network right now.
 *
 * How: a cache-only walk. For a lesson it reads the lesson JSON from Cache
 * Storage (never the network), works out its slides with the same helper
 * LessonEngine uses (core/lessonEntries.js), and hands each slide to
 * OfflinePrefetcher.probe(), the prefetcher's own crawler run against the
 * cache instead of the network: block/question JSON (nested refs), prose,
 * images, simulation modules and their import graphs, plugin modules,
 * MathLive and KaTeX fonts when there is math, and narration clips only for
 * a learner who listens. So "available offline" means exactly "everything
 * the prefetcher would fetch is in a cache". Files read once are remembered
 * for the session (hits for good; misses until something new is cached), so
 * re-checks are Map lookups, not Cache reads.
 *
 * Status of a lesson: { state, slides, ready, total }
 *   state  'ready'   every file of every slide is cached
 *          'partial' the lesson opens offline, some slides would miss files
 *          'none'    not even the lesson file is cached
 *          'unknown' no Cache API or no service worker (nothing is kept)
 *   slides one boolean per slide in lesson order (linear lessons), else null
 *   ready / total  slides fully cached / slides
 *
 * Live updates: views call watch(lessonIds) and listen for
 * 'offline:availability' { lessonId, status } on the EventBus. Watched
 * lessons are re-checked (debounced, one lesson at a time) whenever the
 * prefetcher fetched something ('offline:fetched', 'offline:prefetched',
 * 'offline:ahead-ready') or a slide changed ('lesson:beat-changed': the
 * slide's own loads land in the cache). 'offline:network' { online } is
 * emitted when the connection comes or goes, so views can word their marks.
 * Business logic lives here; views only display the status.
 */

const RECHECK_MS = 900;
const BEAT_RECHECK_MS = 2500;

const statuses = new Map(); // lessonId -> status
const watched = new Map(); // lessonId -> watcher count
let pending = null; // Promise of the current recheck pass
let again = false;
let timer = null;
let started = false;

function supported() {
  return typeof caches !== 'undefined' && 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
}

function isPreview() {
  return window.location.search.includes('preview=true') || window.location.hash.includes('preview=true');
}

function same(a, b) {
  if (!a || !b || a.state !== b.state || a.ready !== b.ready || a.total !== b.total) return false;
  if (!a.slides || !b.slides) return a.slides === b.slides;
  return a.slides.length === b.slides.length && a.slides.every((v, i) => v === b.slides[i]);
}

function publish(lessonId, status) {
  const prev = statuses.get(lessonId);
  statuses.set(lessonId, status);
  if (!same(prev, status)) EventBus.emit('offline:availability', { lessonId, status });
}

async function cachedJson(url) {
  try {
    const hit = await caches.match(url);
    return hit ? await hit.json() : null;
  } catch {
    return null;
  }
}

async function compute(lessonId, profileId) {
  if (!supported() || isPreview()) return { state: 'unknown', slides: null, ready: 0, total: 0 };
  await CourseSourceManager.init();
  const path = lessonJsonPath(lessonId);
  const bundleId = CourseSourceManager.deriveBundleId(path);
  const url = new URL(CourseSourceManager.resolveContentUrl(path), window.location.href).href;
  const data = normalizeLessonData(await cachedJson(url));
  if (!data) return { state: 'none', slides: null, ready: 0, total: 0 };

  const flow = isFlowLesson(data);
  // Linear: one entry per blocks[] item, kept in place so slides[i] is
  // segment i of the progress bar (a broken item is a slide that cannot show).
  const entries = flow ? allBlockEntries(data, bundleId) : (data.blocks || []).map((b) => linearEntry(b, bundleId));
  const narrate = !!data.narrationRef && getNarratePref(profileId || null, bundleId);
  const [base, ...perSlide] = await Promise.all([
    OfflinePrefetcher.probe({ modules: [LESSON_VIEW], narrationRef: narrate ? data.narrationRef : null, bundleId, narrate }),
    ...entries.map((e) => (e ? OfflinePrefetcher.probe({ entries: [e] }).then((r) => !r.missing.length) : Promise.resolve(false))),
  ]);
  const ready = perSlide.filter(Boolean).length;
  const total = perSlide.length;
  const all = !base.missing.length && ready === total;
  return {
    state: all ? 'ready' : 'partial',
    slides: flow ? null : perSlide,
    ready,
    total,
  };
}

let profileOf = () => null;

async function recheckAll() {
  if (pending) { again = true; return pending; }
  pending = (async () => {
    do {
      again = false;
      OfflinePrefetcher.forgetProbeMisses();
      // One lesson at a time: gentle on a low-end phone, and the list a view
      // shows is short. A ready lesson stays ready until the page reloads.
      for (const id of [...watched.keys()]) {
        if (statuses.get(id)?.state === 'ready') continue;
        try { publish(id, await compute(id, profileOf())); } catch { /* keep the last status */ }
      }
    } while (again);
  })().finally(() => { pending = null; });
  return pending;
}

function schedule(ms = RECHECK_MS) {
  if (!watched.size) return;
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; recheckAll(); }, ms);
}

function start() {
  if (started) return;
  started = true;
  EventBus.on('offline:fetched', () => schedule());
  EventBus.on('offline:prefetched', () => schedule(300));
  EventBus.on('offline:ahead-ready', () => schedule(300));
  EventBus.on('offline:engine-warmed', () => schedule(300));
  EventBus.on('lesson:beat-changed', () => schedule(BEAT_RECHECK_MS));
  const net = () => EventBus.emit('offline:network', { online: navigator.onLine });
  window.addEventListener('online', () => { net(); schedule(); });
  window.addEventListener('offline', net);
  // A worker that takes control after first paint makes checking possible.
  navigator.serviceWorker?.addEventListener?.('controllerchange', () => {
    for (const [id, s] of statuses) if (s.state === 'unknown') statuses.delete(id);
    schedule(200);
  });
}

export const OfflineAvailability = {
  /** The last known status of a lesson, or null before its first check. */
  get(lessonId) {
    return statuses.get(lessonId) || null;
  },

  /** Is the device online now? (Views word their marks by it.) */
  online() {
    return navigator.onLine !== false;
  },

  /**
   * Starts checking these lessons now and keeps their status current until
   * the returned function is called. `profileId` decides whether narration
   * clips count (only for a learner who listens).
   * @param {string[]} lessonIds
   * @param {{profileId?: string}} [opts]
   * @returns {() => void} unwatch
   */
  watch(lessonIds, { profileId = null } = {}) {
    start();
    if (profileId) profileOf = () => profileId;
    const ids = [...new Set((lessonIds || []).filter(Boolean))];
    for (const id of ids) watched.set(id, (watched.get(id) || 0) + 1);
    // Unchecked lessons first, at once; the rest on the usual debounce.
    if (ids.some((id) => !statuses.has(id))) recheckAll();
    else schedule();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      for (const id of ids) {
        const n = (watched.get(id) || 1) - 1;
        if (n > 0) watched.set(id, n); else watched.delete(id);
      }
    };
  },

  /** Re-checks one lesson now (e.g. after a retry), publishing any change. */
  async refresh(lessonId, profileId = null) {
    start();
    OfflinePrefetcher.forgetProbeMisses();
    try { publish(lessonId, await compute(lessonId, profileId || profileOf())); } catch { /* keep the last status */ }
    return statuses.get(lessonId) || null;
  },
};
