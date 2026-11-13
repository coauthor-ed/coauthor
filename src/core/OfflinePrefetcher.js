import { EventBus } from './EventBus.js';
import { CourseSourceManager } from './CourseSourceManager.js';
import { appUrl } from './basePath.js';
import { BlockRegistry } from '../registry/BlockRegistry.js';
import { QuestionRegistry } from '../registry/QuestionRegistry.js';
import { pickVoice, segmentForVoice } from './narration/narrationModel.js';
import { getVoicePref, getNarratePref } from './narration/voicePref.js';
import { refBasename } from './narration/narrationModel.js';

/**
 * OfflinePrefetcher: "open a lesson once online, have all of it offline"
 * (D18, Q-33).
 *
 * When a lesson opens (LessonEngine emits 'lesson:opened') it walks every
 * block and question the lesson references and warms, in the background:
 *  - each block/question JSON, recursively (nested blockRef/ref);
 *  - each sibling .md prose file, image and other media;
 *  - each simulation module and the modules it imports (static imports
 *    and literal dynamic import() calls, read from the source text, never
 *    executed), plus new URL(..., import.meta.url) assets;
 *  - each block/question plugin module and its import graph, the same way;
 *  - vendor/mathlive.js and the KaTeX fonts it loads, only when the lesson
 *    has math (a $...$ span in prose, or a plugin that imports MathLive);
 *  - the narration sidecar and its audio clips in the learner's narrator
 *    voice only (Q-43; same origin only, the service worker cannot cache
 *    cross-origin audio). Skipped on Save-Data.
 * When a test opens ('test:opened') it does the same for every question.
 *
 * How it caches: it only fetch()es through the active service worker, whose
 * own routing decides the cache bucket (shell, content, assets, audio). It
 * never writes Cache Storage itself, so there is one source of truth for
 * where each URL lives. With no controlling service worker it does nothing
 * (nothing it fetched could be kept).
 *
 * Load on the device: at most 2-3 requests at a time, started a moment
 * after the lesson opens so the first slide's own requests go first, JSON
 * before media before modules before audio. A URL already in any cache is
 * read from there, never refetched. Every failure is swallowed: this is
 * purely additive, and a miss just means the old fetch-on-visit behaviour.
 *
 * Next slides first (Q-45, D23a): on every slide change (lesson or test
 * 'beat-changed', its `ahead` entries) the next two slides are walked the
 * same way in an "ahead" lane that always goes before the background
 * whole-lesson lane. A job already queued in the background lane is moved
 * up; on the next slide change, ahead jobs not yet started drop back to the
 * background lane (still wanted offline) and the new next slides take the
 * front. No new request starts for a short moment after a slide change, so
 * the slide on screen is never made to wait. On Save-Data only the very
 * next slide is fetched ahead and no audio at all.
 *
 * Narration clips (Q-35): only when this profile has narration switched on
 * ('coauthor:narrate:<profile>'), only in the chosen voice, and the clips
 * of the next slides go first. Switching narration on mid-lesson
 * ('narration:wanted') fetches them then.
 */

const START_DELAY_MS = 1500;
// After a slide change, no new prefetch request starts for this long, so
// the slide on screen gets the connection to itself first.
const QUIET_MS = 600;
const MAX_MODULES = 400;
const COURSE_MAX_MODULES = 4000; // prefetchCourse(): a whole course, chosen by the learner

const PRIO_JSON = 0;
const PRIO_MEDIA = 1;
const PRIO_MODULE = 2;
const PRIO_HEAVY = 3;
// Lanes 0-3: the next slides (ahead); lanes 4-7: the background whole-lesson run.
const BACK = 4;

const TYPE_RE = /^[a-z0-9][a-z0-9-]*@\d+$/i;
const PATH_RE = /^[^\s"'<>`]+\.(json|md|png|jpe?g|webp|gif|svg|avif|js|mjs|mp3|m4a|aac|ogg|oga|opus|wav|mp4|webm|glb|gltf|bin|csv|txt|woff2?)$/i;
const AUDIO_RE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|weba)$/i;
const MODULE_RE = /\.m?js$/i;
const TEXT_RE = /\.(json|md|m?js|css|txt|csv)$/i;
// Keys whose value is a JSON ref that may be written without ".json".
const JSON_REF_KEYS = new Set(['blockRef', 'ref']);
// Same spans core/markdown/mathMask.js treats as math.
const MATH_RE = /(^|[^\\])\$[^$\n]+?\$|\\\(|\\\[/;

// import ... from '...', import '...', export ... from '...'
const STATIC_IMPORT_RE = /\b(?:import|export)\s*(?:[\w*${}\s,]*?\s*from\s*)?["']([^"'\n]+)["']/g;
// import('...'), optionally with a leading comment such as webpackIgnore.
// Not import('...').TypeName: that is a JSDoc type in a comment, not a load.
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*(?:\/\*[^*]*\*\/\s*)?["']([^"'\n]+)["']\s*\)(?!\s*\.\s*[A-Z])/g;
// new URL('./x.png', import.meta.url)
const META_URL_RE = /new\s+URL\(\s*["']([^"'\n]+)["']\s*,\s*import\.meta\.url\s*\)/g;

// Never pulled in by a crawl: large optional libraries only a few
// authoring or AI features use, far too heavy to fetch speculatively.
const DENY = ['vendor/transformers/', 'vendor/models/', 'vendor/pdfjs/', 'vendor/codemirror-md.js'];

const KATEX_FONTS = [
  'KaTeX_Main-Regular', 'KaTeX_Main-BoldItalic', 'KaTeX_Main-Bold', 'KaTeX_Main-Italic',
  'KaTeX_Math-Italic', 'KaTeX_Math-BoldItalic', 'KaTeX_AMS-Regular',
  'KaTeX_Caligraphic-Regular', 'KaTeX_Caligraphic-Bold', 'KaTeX_Fraktur-Regular',
  'KaTeX_Fraktur-Bold', 'KaTeX_SansSerif-Regular', 'KaTeX_SansSerif-Bold',
  'KaTeX_SansSerif-Italic', 'KaTeX_Script-Regular', 'KaTeX_Typewriter-Regular',
  'KaTeX_Size1-Regular', 'KaTeX_Size2-Regular', 'KaTeX_Size3-Regular', 'KaTeX_Size4-Regular',
];

const APP_ROOT = appUrl('');
const MATHLIVE_URL = appUrl('vendor/mathlive.js');
const MATHLIVE_CONFIG_URL = appUrl('src/core/mathliveConfig.js');
const MATH_RENDERER_URL = appUrl('src/core/components/MathRenderer.js');
// Modules that load MathLive only when the learner opens them (MathRenderer
// is on every Markdown slide; the equation composer is an optional tool in
// every descriptive question), so importing them is no sign of math.
const LAZY_MATH_URLS = new Set([
  MATH_RENDERER_URL,
  appUrl('src/plugins/questions/semantic-descriptive/v1/components/equation-composer.js'),
]);
const denyUrls = DENY.map((p) => appUrl(p));

function isDenied(url) {
  return denyUrls.some((d) => url.startsWith(d));
}

function absolute(url) {
  try { return new URL(url, window.location.href).href.split('#')[0]; } catch { return null; }
}

/** An authored ref (bundle-relative, root-absolute or a full URL) to the URL it is fetched from. */
function refToUrl(ref, bundleId) {
  if (!ref || typeof ref !== 'string') return null;
  const r = CourseSourceManager.resolveRef(ref, bundleId);
  return absolute(/^([a-z][a-z0-9+.-]*:)?\/\//i.test(r) ? r : CourseSourceManager.resolveContentUrl(r));
}

// ---- import map (bare specifiers such as 'lit', 'core/...', 'blocks/...') ----

let _importMap = null;
function importMap() {
  if (_importMap) return _importMap;
  _importMap = {};
  try {
    const el = document.querySelector('script[type="importmap"]');
    const imports = el ? JSON.parse(el.textContent).imports || {} : {};
    for (const [k, v] of Object.entries(imports)) _importMap[k] = new URL(v, document.baseURI).href;
  } catch { /* no import map: bare specifiers are skipped */ }
  return _importMap;
}

function resolveSpecifier(spec, fromUrl) {
  if (/^(\.{1,2}\/|\/)/.test(spec) || /^[a-z][a-z0-9+.-]*:/i.test(spec)) {
    try { return new URL(spec, fromUrl).href; } catch { return null; }
  }
  const map = importMap();
  if (map[spec]) return map[spec];
  let best = null;
  for (const k of Object.keys(map)) {
    if (k.endsWith('/') && spec.startsWith(k) && (!best || k.length > best.length)) best = k;
  }
  return best ? map[best] + spec.slice(best.length) : null;
}

// ---- bounded request pool ----

function poolLimit() {
  const c = navigator.connection;
  const slow = c && (c.saveData || /(^|-)2g$|3g/.test(c.effectiveType || ''));
  const lowMem = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 2;
  return slow || lowMem ? 2 : 3;
}

const queues = Array.from({ length: BACK * 2 }, () => []);
let active = 0;
let quietUntil = 0;
let quietTimer = null;

function pump() {
  const wait = quietUntil - Date.now();
  if (wait > 0) {
    if (!quietTimer) quietTimer = setTimeout(() => { quietTimer = null; pump(); }, wait);
    return;
  }
  const limit = poolLimit();
  while (active < limit) {
    const q = queues.find((x) => x.length);
    if (!q) return;
    const job = q.shift();
    job.started = true;
    active++;
    job.run().then(job.resolve, () => job.resolve(null)).finally(() => { active--; pump(); });
  }
}

function moveJob(job, lane, front = false) {
  const q = queues[job.lane];
  const i = q.indexOf(job);
  if (i !== -1) q.splice(i, 1);
  job.lane = lane;
  if (front) queues[lane].unshift(job); else queues[lane].push(job);
}

/** A slide changed: earlier ahead jobs not yet started go back to the background lane. */
function demoteAhead() {
  for (let lane = BACK - 1; lane >= 0; lane--) {
    const q = queues[lane].splice(0);
    for (let i = q.length - 1; i >= 0; i--) { q[i].lane = lane; moveJob(q[i], lane + BACK, true); }
  }
}

// ---- fetching (always through the service worker) ----

const FAILED = Symbol('failed');
const jobs = new Map(); // url -> { lane, started, promise, resolve, run }

async function fetchOne(url, wantText, priority = undefined) {
  let hit = null;
  try { hit = await caches.match(url); } catch { /* Cache Storage off */ }
  if (hit) return wantText ? hit.text().catch(() => null) : null;
  if (!navigator.onLine) return FAILED;
  try {
    const res = await fetch(url, priority ? { priority } : undefined);
    if (!res.ok) { try { res.body?.cancel(); } catch { /* ignore */ } return FAILED; }
    let out = null;
    if (wantText) out = await res.text();
    else await res.blob(); // read to the end so the worker's cached copy is complete
    // OfflineAvailability re-checks its marks a moment after this.
    EventBus.emit('offline:fetched', { url });
    return out;
  } catch {
    return FAILED;
  }
}

/**
 * Warm `url` once per session; resolves to its text for JSON/MD/JS, else
 * null. `ahead` puts it in the next-slides lane, moving it up if it is
 * already queued behind. A failed fetch is forgotten, so a later slide
 * change or lesson open can try it again.
 */
function warm(url, prio, ahead = false) {
  if (!url) return Promise.resolve(null);
  const lane = prio + (ahead ? 0 : BACK);
  let job = jobs.get(url);
  if (!job) {
    const wantText = TEXT_RE.test(new URL(url).pathname);
    job = { lane, started: false };
    job.promise = new Promise((resolve) => { job.resolve = resolve; });
    job.run = async () => {
      const r = await fetchOne(url, wantText);
      if (r === FAILED) { jobs.delete(url); return null; }
      return r;
    };
    jobs.set(url, job);
    queues[lane].push(job);
    pump();
  } else if (!job.started && lane < job.lane) {
    moveJob(job, lane);
    pump();
  }
  return job.promise;
}

function controlled(timeoutMs = 20000) {
  if (!('serviceWorker' in navigator) || typeof caches === 'undefined') return Promise.resolve(false);
  if (navigator.serviceWorker.controller) return Promise.resolve(true);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), timeoutMs);
    navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); resolve(true); }, { once: true });
  });
}

function isPreview() {
  return window.location.search.includes('preview=true') || window.location.hash.includes('preview=true');
}

// ---- module source, parsed once ----

const parsedModules = new Map(); // module URL -> { deps, assets, math }

/** A module's imports (resolved module URLs), its new URL(..., import.meta.url) assets, and whether it is a sign of math. */
function parseModule(url, text) {
  const specs = new Set();
  for (const m of text.matchAll(STATIC_IMPORT_RE)) specs.add(m[1]);
  for (const m of text.matchAll(DYNAMIC_IMPORT_RE)) specs.add(m[1]);
  const deps = [];
  let math = false;
  for (const spec of specs) {
    const dep = resolveSpecifier(spec, url);
    if (!dep || !MODULE_RE.test(new URL(dep).pathname)) continue;
    // A root-absolute spec outside the app (e.g. '/vendor/lit.js' written
    // for a root deployment) would only 404 here, as it would at runtime.
    if (spec.startsWith('/') && !dep.startsWith(APP_ROOT)) continue;
    // MathRenderer (reached from every Markdown slide) always names
    // MathLive, so that path alone is no sign of math; any other module
    // that loads MathLive (an equation input) is. MathLive itself and
    // its fonts are added in finish() only when the lesson has math.
    if (dep === MATHLIVE_URL) {
      if (url !== MATHLIVE_CONFIG_URL) math = true;
      continue;
    }
    if (dep === MATHLIVE_CONFIG_URL && !LAZY_MATH_URLS.has(url)) math = true;
    deps.push(dep);
  }
  const assets = [];
  // Whole-line comments dropped first: a doc comment that shows the pattern
  // (new URL('x.png', import.meta.url)) names no real file.
  const code = text.replace(/^[ \t]*(?:\/\/|\/\*|\*).*$/gm, '');
  for (const m of code.matchAll(META_URL_RE)) {
    const asset = resolveSpecifier(m[1].startsWith('.') || m[1].startsWith('/') ? m[1] : `./${m[1]}`, url);
    // new URL('./', import.meta.url) is a module's own folder (a base for later joins), not a file.
    if (asset && !MODULE_RE.test(asset) && !new URL(asset).pathname.endsWith('/')) assets.push(asset);
  }
  return { deps, assets, math };
}

// ---- cache-only probing (OfflineAvailability) ----

// Never in any cache by design (sw.js streams video), so never "missing".
const NEVER_CACHED_RE = /\.(mp4|webm|m4v)$/i;
// url -> Promise<string|true|null>: text for JSON/MD, true for any other
// hit, null for a miss. Misses are dropped by forgetProbeMisses().
const probes = new Map();
const probeMisses = new Set();

function probeUrl(url) {
  const path = new URL(url).pathname;
  if (NEVER_CACHED_RE.test(path)) return Promise.resolve(true);
  let p = probes.get(url);
  if (!p) {
    p = (async () => {
      let hit = null;
      try { hit = await caches.match(url); } catch { hit = null; }
      if (!hit) { probeMisses.add(url); return null; }
      return /\.(json|md)$/i.test(path) ? hit.text().catch(() => null) : true;
    })();
    probes.set(url, p);
  }
  if (!MODULE_RE.test(path)) return p;
  // A module not parsed yet hands its text over (read again, not kept);
  // once parsed, presence is all a probe needs.
  return p.then((r) => (r == null || parsedModules.has(url) ? r
    : caches.match(url).then((h) => (h ? h.text() : null)).catch(() => null)));
}

// ---- one run: a lesson or a test ----

class Run {
  /** @param {{ahead?:boolean, narrate?:boolean, maxModules?:number}} [opts] */
  constructor({ ahead = false, narrate = false, maxModules = MAX_MODULES, fetcher = null } = {}) {
    this.fetcher = fetcher;
    this.tasks = [];
    this.maxModules = maxModules;
    this.math = false;
    this.modules = new Set();
    this.types = new Set();
    this.ahead = ahead;
    this.gen = aheadGen;
    this.narrate = narrate;
  }

  add(p) { this.tasks.push(p.catch(() => {})); }

  /** warm() in this run's lane; an ahead run overtaken by a newer slide change falls back to the background lane. */
  w(url, prio) { return this.fetcher ? this.fetcher(url) : warm(url, prio, this.ahead && this.gen === aheadGen); }

  /** Walks any JSON value: refs, media, sims, plugin types, math. */
  walk(value, bundleId, key = '') {
    if (typeof value === 'string') {
      if (key === 'type' && TYPE_RE.test(value)) { this.types.add(value); return; }
      if (!this.math && value.includes('$') && MATH_RE.test(value)) this.math = true;
      if (key === 'narrationRef') { this.add(this.narration(refToUrl(value, bundleId))); return; }
      let ref = value;
      if (JSON_REF_KEYS.has(key) && /\//.test(ref) && !/\.[a-z0-9]+$/i.test(ref)) ref = `${ref}.json`;
      if (!PATH_RE.test(ref)) return;
      const url = refToUrl(ref, bundleId);
      if (!url) return;
      if (/\.json$/i.test(ref)) this.add(this.json(url, bundleId));
      else if (/\.md$/i.test(ref)) this.add(this.text(url));
      else if (MODULE_RE.test(ref)) this.add(this.module(url));
      else if (AUDIO_RE.test(ref)) this.add(this.audio(url));
      else this.add(this.w(url, PRIO_MEDIA));
      return;
    }
    if (Array.isArray(value)) { for (const v of value) this.walk(v, bundleId, key); return; }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) this.walk(v, bundleId, k);
    }
  }

  async json(url, bundleId) {
    const text = await this.w(url, PRIO_JSON);
    if (!text) return;
    let data;
    try { data = JSON.parse(text); } catch { return; }
    this.walk(data, bundleId);
  }

  async text(url) {
    const text = await this.w(url, PRIO_MEDIA);
    if (text && !this.math && MATH_RE.test(text)) this.math = true;
  }

  async audio(url) {
    // The worker only caches same-origin audio; on Save-Data, skip clips.
    if (new URL(url).origin !== window.location.origin) return;
    if (navigator.connection?.saveData) return;
    await this.w(url, PRIO_HEAVY);
    return url;
  }

  async narration(url) {
    if (!url) return;
    const text = await this.w(url, PRIO_JSON);
    if (!text) return;
    let sidecar;
    try { sidecar = JSON.parse(text); } catch { return; }
    sidecars.set(url, sidecar);
    // Clips only for a learner who listens (Q-35), and only in their
    // narrator voice (Q-43); another voice's clips are fetched when played,
    // if the learner switches.
    if (this.narrate) this.clips(url, sidecar);
  }

  /** The chosen voice's clips of `sidecar`, all of them or only those of `blocks` (block ids). */
  clips(url, sidecar, blocks = null) {
    const voice = pickVoice(sidecar, getVoicePref());
    for (const raw of Array.isArray(sidecar?.segments) ? sidecar.segments : []) {
      if (blocks && !blocks.has(raw?.block)) continue;
      const seg = segmentForVoice(raw, voice);
      if (typeof seg?.audio !== 'string' || !seg.audio) continue;
      let clip;
      try { clip = new URL(seg.audio, url).href; } catch { continue; }
      this.add(this.audio(clip));
    }
  }

  /** Fetches a module and, from its source text, everything it imports. */
  async module(url) {
    url = absolute(url);
    if (!url || this.modules.has(url) || this.modules.size >= this.maxModules || isDenied(url)) return;
    this.modules.add(url);
    const text = await this.w(url, PRIO_MODULE);
    if (!text) return;
    // Parsed once per session (a probe run passes true, not the text, for a
    // module already parsed: OfflineAvailability re-checks often).
    let info = parsedModules.get(url);
    if (!info) {
      if (typeof text !== 'string') return;
      info = parseModule(url, text);
      parsedModules.set(url, info);
    }
    if (info.math) this.math = true;
    for (const dep of info.deps) this.add(this.module(dep));
    for (const asset of info.assets) this.add(this.w(asset, PRIO_MEDIA));
  }

  async plugins() {
    try { await Promise.all([BlockRegistry.init(), QuestionRegistry.init()]); } catch { return; }
    for (const type of this.types) {
      const path = BlockRegistry.getPath(type) || QuestionRegistry.getPath(type);
      const url = path ? resolveSpecifier(path, document.baseURI) : null;
      if (url) this.add(this.module(url));
    }
  }

  /** Waits until no task is pending (tasks add tasks as JSON arrives). */
  async settle() {
    let n = -1;
    while (n !== this.tasks.length) {
      n = this.tasks.length;
      await Promise.all(this.tasks.slice());
    }
  }

  async finish() {
    await this.settle();
    await this.plugins();
    await this.settle();
    if (this.math) {
      this.add(this.module(MATHLIVE_URL));
      for (const f of KATEX_FONTS) this.add(this.w(appUrl(`vendor/fonts/${f}.woff2`), PRIO_HEAVY));
      await this.settle();
    }
  }
}

// ---- lesson engine warm-up (Q-56) ----

// The lesson view and the plugins and scene bases nearly every lesson
// mounts. Their import graphs (crawled from source, as for a lesson run)
// are about 0.9 MB of engine code that the service worker otherwise only
// caches on the first lesson open: 20-30 s of a slow 3G first open.
// Plugins by registry type, so a version move needs no edit here.
export const LESSON_VIEW = 'src/ui/views/LessonSession.js';
const ENGINE_MODULES = [
  LESSON_VIEW,
  'src/simulations/base/DomSimulation.js',
  'src/simulations/base/kit/SimScene.js',
];
const ENGINE_TYPES = ['content-block@1', 'poe-predict@1', 'poe-observe-sim@1'];

let engineWarm = null; // the warm-up in progress, else null
let engineWarmDone = false;

/**
 * One file at a time, low fetch priority, and only while `wanted()` holds
 * (the learner is still on a page that shows no lesson). Text for crawling.
 */
function serialFetcher(wanted) {
  let chain = Promise.resolve();
  return (url) => {
    const next = chain.then(async () => {
      if (!wanted()) return null;
      const r = await fetchOne(url, true, 'low');
      return r === FAILED ? null : r;
    });
    chain = next.catch(() => {});
    return next;
  };
}

const runs = new Set(); // lesson/test keys already prefetched this session
let aheadGen = 0; // bumped on every slide change
const sidecars = new Map(); // narration sidecar URL -> parsed sidecar
const lessonInfo = new Map(); // lessonId -> { narrationUrl, profileId }

const CURRENT_MAX_WAIT_MS = 12000;

/**
 * Resolves once the image, scene module and prose file of the slide on
 * screen are is in Cache Storage (or after a cap, or at once with no worker).
 * Only reads the cache: never fetches, so it cannot compete with the slide.
 */
async function currentSlideLoaded(block, bundleId) {
  if (!block || !navigator.serviceWorker?.controller) return;
  // Only what is drawn on arrival: the image, the scene, the prose (not
  // the dark-mode image or later beats' images, which may never load).
  const urls = [block.image?.src, block.simulation?.src, block.src, block.markdownRef, block.promptRef]
    .filter((v) => typeof v === 'string' && PATH_RE.test(v) && !/\.json$/i.test(v))
    .map((v) => refToUrl(v, bundleId))
    .filter(Boolean);
  if (!urls.length) return;
  const end = Date.now() + CURRENT_MAX_WAIT_MS;
  let left = urls;
  while (left.length && Date.now() < end) {
    const hits = await Promise.all(left.map((u) => caches.match(u).then((r) => !!r, () => true)));
    left = left.filter((_, i) => !hits[i]);
    if (left.length) await new Promise((r) => setTimeout(r, 300));
  }
}

/** A block's id as narration segments name it: its own id, else its file's basename. */
function entryBlockId(entry) {
  if (typeof entry?.data?.id === 'string') return entry.data.id;
  return entry?.ref ? refBasename(entry.ref) : null;
}

/** The chosen voice's clips of a lesson (all, or only `blocks`), sidecar fetched first if needed. */
function addClips(run, info, blocks = null) {
  const have = sidecars.get(info.narrationUrl);
  if (have) { run.clips(info.narrationUrl, have, blocks); return; }
  run.add((async () => {
    const text = await run.w(info.narrationUrl, PRIO_JSON);
    if (!text) return;
    let sc;
    try { sc = JSON.parse(text); } catch { return; }
    sidecars.set(info.narrationUrl, sc);
    run.clips(info.narrationUrl, sc, blocks);
  })());
}

// Lesson/test ids whose first slide has rendered (a 'beat-changed' was seen).
const rendered = new Set();
const renderWaiters = new Map(); // id -> resolve[]
const FIRST_SLIDE_MAX_WAIT_MS = 60000;

function markRendered(id) {
  if (!id || rendered.has(id)) return;
  rendered.add(id);
  for (const r of renderWaiters.get(id) || []) r();
  renderWaiters.delete(id);
}

/** Resolves once `id`'s first slide is on screen (or after a long cap). */
function firstSlideShown(id) {
  if (!id || rendered.has(id)) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, FIRST_SLIDE_MAX_WAIT_MS);
    const list = renderWaiters.get(id) || [];
    list.push(() => { clearTimeout(t); resolve(); });
    renderWaiters.set(id, list);
  });
}

async function prefetch(key, seed, narrate = false, id = null) {
  if (runs.has(key) || isPreview()) return;
  runs.add(key);
  // The first slide's own files go first (Q-45): the whole-lesson run
  // starts only once that slide is on screen.
  await firstSlideShown(id);
  await new Promise((r) => setTimeout(r, START_DELAY_MS));
  // Offline now, or no worker to keep what is fetched: try again next open.
  if (!navigator.onLine || !(await controlled())) { runs.delete(key); return; }
  const run = new Run({ narrate: !!narrate });
  try {
    seed(run);
    await run.finish();
    EventBus.emit('offline:prefetched', { key, urls: jobs.size, math: run.math });
  } catch {
    runs.delete(key);
  }
}

function seedEntries(run, entries) {
  for (const entry of entries || []) {
    if (!entry) continue;
    if (entry.ref) {
      const url = absolute(/^([a-z][a-z0-9+.-]*:)?\/\//i.test(entry.ref) ? entry.ref : CourseSourceManager.resolveContentUrl(entry.ref));
      if (url) run.add(run.json(url, entry.bundleId));
    } else if (entry.data) {
      run.walk(entry.data, entry.bundleId);
    }
  }
}

export const OfflinePrefetcher = {
  _started: false,

  /** Idempotent. Listens for lessons and tests being opened. */
  start() {
    if (this._started) return;
    this._started = true;
    EventBus.on('lesson:opened', (d) => OfflinePrefetcher.prefetchLesson(d));
    EventBus.on('test:opened', (d) => OfflinePrefetcher.prefetchTest(d));
    EventBus.on('narration:wanted', (d) => OfflinePrefetcher.prefetchNarration(d));
    EventBus.on('cast:changed', (d) => { if (d?.bundleId) OfflinePrefetcher.prefetchCast(); });
  },

  /**
   * Warms the lesson engine's code while the learner is on home or a
   * module page (Q-56), so the first lesson open does not wait for it.
   * The host calls this once that page has painted and the browser is
   * idle. Skipped on Save-Data, offline, in a preview, and with no worker
   * to keep the files. One request at a time at low priority, so it never
   * competes with what is on screen; it stops starting new requests as
   * soon as `wanted()` is false (a lesson opened: its own loads go first)
   * and carries on from the cache on the next visit. Never throws.
   * @param {{wanted?: () => boolean}} [opts]
   */
  async warmLessonEngine({ wanted = () => true } = {}) {
    if (engineWarmDone || engineWarm) return engineWarm;
    if (isPreview() || navigator.connection?.saveData || !navigator.onLine) return null;
    engineWarm = (async () => {
      try {
        if (!(await controlled(5000)) || !wanted()) return;
        const run = new Run({ fetcher: serialFetcher(wanted) });
        for (const m of ENGINE_MODULES) run.add(run.module(appUrl(m)));
        try {
          await Promise.all([BlockRegistry.init(), QuestionRegistry.init()]);
          for (const type of ENGINE_TYPES) {
            const path = BlockRegistry.getPath(type) || QuestionRegistry.getPath(type);
            const url = path ? resolveSpecifier(path, document.baseURI) : null;
            if (url) run.add(run.module(url));
          }
        } catch { /* registries unreadable: the fixed modules still warm */ }
        await run.settle();
        if (!wanted()) return; // cut short: the next visit carries on
        engineWarmDone = true;
        EventBus.emit('offline:engine-warmed', { modules: run.modules.size });
      } catch { /* best effort */ }
    })().finally(() => { engineWarm = null; });
    return engineWarm;
  },

  /**
   * The open course's story cast (Q-45): every pose image and any cast
   * element module, in the background lane. Slides and scenes show poses
   * by name at run time, so no lesson walk can find them.
   */
  async prefetchCast() {
    try {
      if (isPreview() || !navigator.onLine || !(await controlled(5000))) return;
      // Already loaded by LookManager when this event fires.
      const { CourseCast } = await import('./cast/CourseCast.js');
      const cast = CourseCast.active();
      if (!cast?.chars) return;
      const run = new Run();
      // The engine modules a cast course loads on demand (the look's cast
      // cameo and the stagehand), with their imports.
      for (const m of ['src/core/cast/CastCameo.js', 'src/core/cast/CastStagehand.js']) run.add(run.module(appUrl(m)));
      for (const ch of Object.values(cast.chars)) {
        for (const url of Object.values(ch.poses || {})) {
          const abs = absolute(url);
          if (abs) run.add(run.w(abs, PRIO_MEDIA));
        }
        if (typeof ch.element === 'string') {
          const el = refToUrl(ch.element, cast.bundleId);
          if (el) run.add(run.module(el));
        }
      }
      await run.settle();
    } catch { /* best effort, like every prefetch here */ }
  },

  /** @param {{lessonId:string, bundleId:?string, entries:Array, narrationRef:?string, profileId:?string}} d */
  prefetchLesson(d) {
    if (!d?.lessonId) return Promise.resolve();
    const narrationUrl = d.narrationRef ? refToUrl(d.narrationRef, d.bundleId) : null;
    lessonInfo.set(d.lessonId, { narrationUrl, profileId: d.profileId || null, bundleId: d.bundleId || null });
    return prefetch(`lesson:${d.lessonId}`, (run) => {
      if (d.narrationRef) run.walk(d.narrationRef, d.bundleId, 'narrationRef');
      seedEntries(run, d.entries);
      // The lesson view's own import graph (mostly cached already), so the
      // lesson counts as offline-ready (OfflineAvailability) once this ends.
      run.add(run.module(appUrl(LESSON_VIEW)));
    }, getNarratePref(d.profileId, d.bundleId), d.lessonId).catch(() => {});
  },

  /**
   * The next slides (Q-45): `d` is a 'lesson:beat-changed' or
   * 'test:beat-changed' detail. Fetches everything `d.ahead` (else
   * `d.next`) needs, ahead of the background run. Resolves true once done
   * and still current, false when skipped or overtaken. Never throws.
   */
  async prefetchAhead(d) {
    try {
      const saveData = !!navigator.connection?.saveData;
      const entries = ((saveData ? d?.next : (d?.ahead || d?.next)) || []).filter(Boolean);
      aheadGen++;
      const gen = aheadGen;
      demoteAhead();
      quietUntil = Date.now() + QUIET_MS;
      if (isPreview() || !navigator.onLine || typeof caches === 'undefined') { markRendered(d?.lessonId || d?.testId); return false; }
      // The slide on screen first: wait until its own media and scene are
      // in the cache (the worker stores them once fully loaded), so nothing
      // fetched ahead competes with it. Instant once a slide was prefetched.
      await currentSlideLoaded(d?.current, (entries[0] || d?.next?.[0])?.bundleId);
      markRendered(d?.lessonId || d?.testId);
      if (gen !== aheadGen) return false;
      quietUntil = Math.max(quietUntil, Date.now() + 150);
      if (!entries.length) return false;
      const run = new Run({ ahead: true });
      seedEntries(run, entries);
      const info = d?.lessonId ? lessonInfo.get(d.lessonId) : null;
      if (info?.narrationUrl && !saveData && getNarratePref(info.profileId, info.bundleId)) {
        addClips(run, info, new Set(entries.map(entryBlockId).filter(Boolean)));
      }
      await run.finish();
      if (run.gen !== aheadGen) return false;
      EventBus.emit('offline:ahead-ready', { lessonId: d?.lessonId || null, testId: d?.testId || null, entries: entries.length, math: run.math });
      return true;
    } catch {
      return false;
    }
  },

  /** Narration switched on (or voice changed) mid-lesson: fetch that voice's clips now. */
  prefetchNarration(d) {
    const info = d?.lessonId ? lessonInfo.get(d.lessonId) : null;
    if (!info?.narrationUrl || isPreview() || !navigator.onLine || navigator.connection?.saveData) return Promise.resolve();
    const run = new Run({ narrate: true });
    addClips(run, info);
    return run.settle().catch(() => {});
  },

  /**
   * A whole course, right after it was added (Q-53b #/add): every module
   * JSON in `entries` ({ ref, bundleId }, ref a content/courses/<id>/...
   * path) and everything it reaches, the same walk as a lesson open, plus
   * `extra` plain URLs (a glossary), plus `modules` (app view module URLs)
   * with their import graphs. Runs in the background lane, so a
   * lesson opened meanwhile still goes first. `onProgress({ done, total })`
   * is called as files finish; total grows while JSON is read.
   * Resolves { ok, done, total, reason } and never throws. No worker to keep
   * the files (or offline, or a preview): ok false, nothing fetched.
   * @param {{entries:Array, extra?:string[], modules?:string[], onProgress?:Function, waitMs?:number}} d
   */
  async prefetchCourse({ entries = [], extra = [], modules = [], onProgress = null, waitMs = 60000 } = {}) {
    try {
      if (isPreview()) return { ok: false, done: 0, total: 0, reason: 'preview' };
      if (!navigator.onLine) return { ok: false, done: 0, total: 0, reason: 'offline' };
      if (!(await controlled(waitMs))) return { ok: false, done: 0, total: 0, reason: 'no-worker' };
      let done = 0;
      let total = 0;
      const tick = () => { try { onProgress?.({ done, total }); } catch { /* the page went away */ } };
      const counted = (r) => {
        const add = r.add.bind(r);
        r.add = (p) => { total++; tick(); add(p.finally(() => { done++; tick(); })); };
        return r;
      };
      // App views the course opens in (module page, lesson player) and their
      // import graphs, in a run of their own so a course full of simulation
      // modules cannot use up the module cap first: a course added from a
      // link may never have been opened online, and only the core shell is
      // precached.
      // The block/question plugins the course uses go in that run too, once
      // the course JSON has named them. A whole course reaches many more
      // modules than one lesson, so its own run gets a larger module cap.
      const views = counted(new Run());
      for (const url of modules) views.add(views.module(url));
      const run = counted(new Run({ maxModules: COURSE_MAX_MODULES }));
      seedEntries(run, entries);
      for (const url of extra) { const abs = absolute(url); if (abs) run.add(run.w(abs, PRIO_JSON)); }
      await run.settle();
      for (const type of run.types) views.types.add(type);
      views.math = views.math || run.math;
      await views.finish();
      await run.finish();
      tick();
      EventBus.emit('offline:prefetched', { key: 'course', urls: jobs.size, math: run.math });
      return { ok: true, done, total, reason: null };
    } catch {
      return { ok: false, done: 0, total: 0, reason: 'error' };
    }
  },

  /**
   * Cache-only check for OfflineAvailability: walks `entries` (and any
   * `urls` / app `modules`) exactly as a prefetch run would, but reads only
   * Cache Storage, never the network, so it costs no data. A file read once
   * is remembered for the session (hits for good, misses until
   * forgetProbeMisses()). Resolves { missing: string[], checked } and never
   * throws; with no Cache API every file counts as missing.
   * @param {{entries?:Array, urls?:string[], modules?:string[], narrationRef?:?string, bundleId?:?string, narrate?:boolean}} d
   */
  async probe({ entries = [], urls = [], modules = [], narrationRef = null, bundleId = null, narrate = false } = {}) {
    const missing = new Set();
    let checked = 0;
    const fetcher = (url) => {
      checked++;
      if (typeof caches === 'undefined') { missing.add(url); return Promise.resolve(null); }
      return probeUrl(url).then((r) => { if (r == null) missing.add(url); return r; });
    };
    try {
      const run = new Run({ narrate: !!narrate, fetcher });
      if (narrationRef) run.walk(narrationRef, bundleId, 'narrationRef');
      seedEntries(run, entries);
      for (const u of urls) { const abs = absolute(u); if (abs) run.add(run.w(abs, PRIO_JSON)); }
      for (const m of modules) run.add(run.module(appUrl(m)));
      await run.finish();
    } catch { /* a partial answer is still an answer */ }
    return { missing: [...missing], checked };
  },

  /** Something new may be cached: the next probe() looks up past misses again. */
  forgetProbeMisses() {
    for (const url of probeMisses) probes.delete(url);
    probeMisses.clear();
  },

  /** @param {{testId:string, entries:Array}} d */
  prefetchTest(d) {
    if (!d?.testId) return Promise.resolve();
    return prefetch(`test:${d.testId}`, (run) => seedEntries(run, d.entries), false, d.testId).catch(() => {});
  },
};
