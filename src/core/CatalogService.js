import { CourseSourceManager } from './CourseSourceManager.js';
import { readCourseMeta } from './courseMeta.js';
import { readShowcase, textOf, deriveFacts, syllabusAlignment, readDigest } from './showcaseMeta.js';
import { ErrorReporter } from './ErrorReporter.js';
import { CATALOG_URL, PUBLISH_IS_PLACEHOLDER, INSTALL_COUNTER } from '../config/publishing.js';

/**
 * CatalogService - loads and validates catalog.json (v1), merges each
 * entry's own manifest metadata, and offers pure filter/sort helpers.
 * See docs/content-authoring-guide.md, "Catalog (catalog.json v1)".
 */
const CACHE_KEY = 'coauthor.catalog.v1';
const LABELS = ['core', 'checked', 'outside'];
const FEATURE_KEYS = ['story', 'narration', 'games', 'practice'];

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');

function warn(msg, ctx) {
  ErrorReporter.reportError(new Error(`[CatalogService] ${msg}`), ctx || {});
}

/** The catalog URL to use, or '' when none (placeholder org and no override). */
export function resolveCatalogUrl(loc = globalThis.location) {
  try {
    const fromSearch = new URLSearchParams(loc?.search || '').get('catalogUrl');
    const hash = loc?.hash || '';
    const q = hash.indexOf('?');
    const fromHash = q >= 0 ? new URLSearchParams(hash.slice(q + 1)).get('catalogUrl') : null;
    const override = str(fromSearch) || str(fromHash);
    if (override) return override;
  } catch { /* fall through */ }
  return PUBLISH_IS_PLACEHOLDER ? '' : CATALOG_URL;
}

/** Validate a parsed catalog. Pure apart from warnings. Returns null when unusable. */
export function validateCatalog(raw) {
  if (!raw || typeof raw !== 'object' || raw.catalogVersion !== 1 || !Array.isArray(raw.entries)) {
    warn('catalog.json is not a catalogVersion 1 catalog');
    return null;
  }
  const seen = new Set();
  const entries = [];
  for (const e of raw.entries) {
    const id = str(e?.id);
    const manifestUrl = str(e?.manifestUrl);
    if (!id || !manifestUrl || seen.has(id)) { warn('skipping bad catalog entry', { entry: e }); continue; }
    try { new URL(manifestUrl); } catch { warn('skipping catalog entry with bad manifestUrl', { id }); continue; }
    seen.add(id);
    entries.push({
      id,
      manifestUrl,
      series: str(e.series),
      label: LABELS.includes(e.label) ? e.label : '',
      featured: e.featured === true,
      addedAt: str(e.addedAt),
      installs: Number.isFinite(e.installs) && e.installs >= 0 ? e.installs : 0,
    });
  }
  const collections = [];
  for (const c of Array.isArray(raw.collections) ? raw.collections : []) {
    const id = str(c?.id);
    if (!id || !Array.isArray(c.entries)) { warn('skipping bad catalog collection', { collection: c }); continue; }
    collections.push({ id, title: { en: str(c.title?.en) || id }, entries: c.entries.filter((x) => typeof x === 'string') });
  }
  // Optional (Q-47): the order and display names of bundles on Discover.
  const bundles = (Array.isArray(raw.bundles) ? raw.bundles : [])
    .filter((b) => str(b?.id))
    .map((b) => ({ id: str(b.id), title: { en: str(b.title?.en) || str(b.title) }, ...(Number.isFinite(b.order) ? { order: b.order } : {}) }));
  return { catalogVersion: 1, updatedAt: str(raw.updatedAt), entries, collections, bundles };
}

function readCache() {
  try { return validateCatalog(JSON.parse(localStorage.getItem(CACHE_KEY))); } catch { return null; }
}
function writeCache(raw) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(raw)); } catch { /* quota / private mode */ }
}

/** Fetch + validate, falling back to the last good cached catalog. Returns {catalog, fromCache} or null. */
export async function loadCatalog(url = resolveCatalogUrl()) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const catalog = validateCatalog(raw);
    if (!catalog) throw new Error('invalid catalog');
    writeCache(raw);
    return { catalog, fromCache: false };
  } catch (e) {
    warn(`could not load catalog: ${e.message}`, { url });
    const cached = readCache();
    return cached ? { catalog: cached, fromCache: true } : null;
  }
}

/** Merge a catalog row with its previewed manifest. Returns null when the manifest is unreachable. */
export function mergeEntry(row, preview) {
  if (!preview || preview.error || !preview.manifest) return null;
  return {
    ...row,
    id: row.id,
    bundleId: preview.bundleId,
    manifestUrl: preview.manifestUrl,
    manifest: preview.manifest,
    meta: readCourseMeta(preview.manifest, preview.manifestUrl),
    alreadyAdded: !!preview.alreadyAdded,
  };
}

/** Preview every catalog entry's manifest (in parallel); unreachable ones are skipped with a warning. */
export async function loadCatalogEntries(catalog) {
  const merged = await Promise.all(catalog.entries.map(async (row) => {
    try {
      const m = mergeEntry(row, await CourseSourceManager.previewManifest(row.manifestUrl));
      if (!m) warn('catalog entry manifest unreachable', { id: row.id });
      return m;
    } catch (e) { warn(`catalog entry failed: ${e.message}`, { id: row.id }); return null; }
  }));
  return merged.filter(Boolean);
}

/** Wrap a plain previewed entry (fallback sources) into the catalog entry shape. */
export function wrapPreviewEntry(preview) {
  return mergeEntry({ id: preview.bundleId, series: '', label: '', featured: false, addedAt: '', installs: 0 }, preview);
}

/** Pure filter. Empty criteria match everything. */
export function filterEntries(entries, { audience, grade, subject, language, feature } = {}) {
  const lc = (s) => String(s).toLowerCase();
  return entries.filter((e) => {
    const m = e.meta || {};
    if (audience && m.audience !== audience) return false;
    if (grade != null && grade !== '' && String(m.grade) !== String(grade)) return false;
    if (subject && !(m.subjects || []).some((s) => lc(s) === lc(subject))) return false;
    if (language && !(m.languages || []).some((l) => lc(l) === lc(language))) return false;
    if (feature && !(m.features && m.features[feature] === true)) return false;
    return true;
  });
}

const titleOf = (e) => String(e.manifest?.title?.en || e.manifest?.title || e.bundleId || e.id || '');

/** Pure sort (returns a new array). */
export function sortEntries(entries, by = 'title') {
  const out = [...entries];
  const byTitle = (a, b) => titleOf(a).localeCompare(titleOf(b));
  if (by === 'popular') out.sort((a, b) => (b.installs || 0) - (a.installs || 0) || byTitle(a, b));
  else if (by === 'new') out.sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')) || byTitle(a, b));
  else out.sort(byTitle);
  return out;
}

/** Distinct values present in the entries, for the filter chips. */
export function buildFacets(entries) {
  const audience = new Set(); const grade = new Set(); const subject = new Set(); const language = new Set(); const feature = new Set();
  for (const e of entries) {
    const m = e.meta || {};
    if (m.audience) audience.add(m.audience);
    if (m.grade != null) grade.add(String(m.grade));
    (m.subjects || []).forEach((s) => subject.add(s));
    (m.languages || []).forEach((l) => language.add(l));
    FEATURE_KEYS.forEach((k) => { if (m.features?.[k]) feature.add(k); });
  }
  const sorted = (s) => [...s].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return { audience: sorted(audience), grade: sorted(grade), subject: sorted(subject), language: sorted(language), feature: sorted(feature) };
}

/** Collections for the top of Discover: catalog-defined first, then derived featured/new/popular. */
export function buildCollections(entries, catalog) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out = [];
  for (const c of catalog?.collections || []) {
    const items = c.entries.map((id) => byId.get(id)).filter(Boolean);
    if (items.length) out.push({ id: c.id, title: c.title.en, entries: items });
  }
  const has = (id) => out.some((c) => c.id === id);
  const featured = entries.filter((e) => e.featured);
  if (featured.length && !has('featured')) out.push({ id: 'featured', title: 'Featured', entries: featured });
  const fresh = sortEntries(entries.filter((e) => e.addedAt), 'new').slice(0, 6);
  if (fresh.length && !has('new')) out.push({ id: 'new', title: 'New', entries: fresh });
  const popular = sortEntries(entries.filter((e) => e.installs > 0), 'popular').slice(0, 6);
  if (popular.length && !has('popular')) out.push({ id: 'popular', title: 'Most popular', entries: popular });
  return out;
}

function httpUrl(rel, base) {
  if (typeof rel !== 'string' || !rel.trim()) return null;
  try {
    const u = new URL(rel, base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch { return null; }
}

/**
 * Detail state for one entry: meta, showcase content (manifest.showcase as an
 * object, or a path to showcase.json), shot URLs resolved against the bundle
 * base, an optional clip URL and intro markdown.
 */
export async function loadDetail(entry) {
  const base = entry.manifestUrl;
  let showcase = {};
  const s = entry.manifest?.showcase;
  if (s && typeof s === 'object') showcase = s;
  else if (typeof s === 'string' && s) {
    const url = httpUrl(s, base);
    if (url) {
      try {
        const res = await fetch(url);
        if (res.ok) showcase = await res.json();
      } catch (e) { warn(`showcase.json unreadable: ${e.message}`, { id: entry.id }); }
    }
  }
  const showcaseBase = typeof s === 'string' && s ? (httpUrl(s, base) || base) : base;
  const rawShots = Array.isArray(showcase.screenshots) ? showcase.screenshots : (Array.isArray(showcase.shots) ? showcase.shots : []);
  const shots = rawShots
    .map((sh) => (typeof sh === 'string' ? { src: sh } : sh))
    .map((sh) => ({ url: httpUrl(sh?.src, base) || httpUrl(sh?.src, showcaseBase), caption: str(sh?.caption?.en) || str(sh?.caption) }))
    .filter((sh) => sh.url);
  const clipRel = str(showcase.clip?.src) || str(showcase.clip);
  let intro = '';
  const introUrl = httpUrl(showcase.intro, base);
  if (introUrl) {
    try { const res = await fetch(introUrl); intro = res.ok ? await res.text() : ''; } catch { /* optional */ }
  }
  return {
    meta: entry.meta,
    tagline: str(showcase.tagline?.en) || str(showcase.tagline),
    cover: httpUrl(showcase.cover, base),
    description: entry.meta?.description || '',
    shots,
    clip: clipRel ? httpUrl(clipRel, base) : null,
    intro,
  };
}

/** Anonymous install count: bundle id only, fire-and-forget, off by default. */
export function countInstall(bundleId, counter = INSTALL_COUNTER) {
  if (!counter?.enabled || !counter.endpoint || !bundleId) return;
  try {
    const payload = JSON.stringify({ bundleId });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon && navigator.sendBeacon(counter.endpoint, payload)) return;
    fetch(counter.endpoint, { method: 'POST', body: payload, keepalive: true, mode: 'no-cors' }).catch(() => {});
  } catch { /* never block add-to-shelf */ }
}

/* ---------- Discover store pages (Q-47): bundles, module facts ---------- */

/**
 * Group entries by their bundle (the catalog row's `series`: one published
 * course repo, e.g. cbse-grade9-science). Order: the catalog's optional
 * `bundles` list (additive: [{ id, title: {en}, order? }]), then school before
 * college, then first appearance. Drafts are left out (D29 item 8).
 * Pure. Returns [{ id, title, audience, entries }].
 */
export function groupByBundle(entries, catalog) {
  const meta = new Map();
  (Array.isArray(catalog?.bundles) ? catalog.bundles : []).forEach((b, i) => {
    const id = str(b?.id);
    if (id) meta.set(id, { title: str(b.title?.en) || str(b.title), order: Number.isFinite(b.order) ? b.order : i });
  });
  const groups = new Map();
  entries.forEach((e, i) => {
    if (e.manifest?.status === 'draft') return;
    const id = e.series || `single:${e.id}`;
    if (!groups.has(id)) groups.set(id, { id, title: meta.get(id)?.title || '', audience: e.meta?.audience || '', first: i, entries: [] });
    groups.get(id).entries.push(e);
  });
  const rank = (g) => (meta.has(g.id) ? meta.get(g.id).order : 1000 + (g.audience === 'college' || g.audience === 'adult' ? 1000 : 0) + g.first);
  return [...groups.values()].sort((a, b) => rank(a) - rank(b)).map(({ first, ...g }) => g);
}

/** The bundle-manifest.json URL of a bundle: one folder above its first entry's manifest. */
export function bundleManifestUrl(bundle) {
  const first = bundle?.entries?.[0];
  if (!first || !bundle.id || bundle.id.startsWith('single:')) return null;
  return httpUrl('../bundle-manifest.json', first.manifestUrl);
}

const _bundleInfo = new Map();
/** The bundle's own manifest (title, description, blurb, highlights, cover); memoised; {} on failure. */
export function loadBundleInfo(bundle) {
  const url = bundleManifestUrl(bundle);
  if (!url) return Promise.resolve({});
  if (!_bundleInfo.has(url)) {
    _bundleInfo.set(url, (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bm = await res.json();
        const s = readShowcase(bm);
        return {
          url,
          title: textOf(bm.title),
          ...s,
          cover: httpUrl(s.cover, url),
          // make-landing.mjs writes cover.jpg beside a bundle with no cover of its own.
          coverFallback: httpUrl('cover.jpg', url),
        };
      } catch (e) { warn(`bundle manifest unreadable: ${e.message}`, { url }); return {}; }
    })());
  }
  return _bundleInfo.get(url);
}

const _facts = new Map();
/**
 * Module facts for one entry, derived from its content: modules with their
 * lesson titles (module JSON), and from the lesson JSONs the lesson count,
 * Narrated (a narrationRef sidecar) and the syllabus line (chapterIds).
 * Memoised per manifest URL. Lesson files are fetched 4 at a time.
 */
export function loadFacts(entry) {
  const key = entry.manifestUrl;
  if (!_facts.has(key)) {
    _facts.set(key, (async () => {
      const m0 = entry.meta || {};
      const align = (ids) => syllabusAlignment(ids, { board: m0.board, grade: m0.grade, subject: m0.subjects?.[0] || entry.manifest?.subject });
      // A staged manifest carries a digest (make-digest.mjs): no lesson fetches.
      const dg = readDigest(entry.manifest);
      if (dg) return { ...dg, alignment: align(dg.chapterIds) };
      const base = entry.manifestUrl;
      const getJson = async (rel) => {
        const url = httpUrl(rel, base);
        if (!url) return null;
        try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; }
      };
      const modules = [];
      for (const rel of Array.isArray(entry.manifest?.modules) ? entry.manifest.modules : []) {
        const mod = await getJson(rel);
        if (!mod) continue;
        modules.push({
          id: str(mod.id),
          title: textOf(mod.title),
          lessons: (Array.isArray(mod.lessons) ? mod.lessons : []).map((l) => ({ ref: str(l?.lessonRef), title: textOf(l?.title) })),
        });
      }
      const refs = modules.flatMap((m) => m.lessons.map((l) => l.ref)).filter(Boolean);
      const lessonJsons = new Array(refs.length).fill(null);
      let next = 0;
      await Promise.all([0, 1, 2, 3].map(async () => {
        while (next < refs.length) { const i = next++; lessonJsons[i] = await getJson(refs[i]); }
      }));
      const facts = deriveFacts(lessonJsons);
      const m = entry.meta || {};
      return {
        modules,
        lessonCount: refs.length || facts.lessonCount,
        narrated: facts.narrated,
        chapterIds: facts.chapterIds,
        alignment: syllabusAlignment(facts.chapterIds, { board: m.board, grade: m.grade, subject: m.subjects?.[0] || entry.manifest?.subject }),
      };
    })());
  }
  return _facts.get(key);
}

/** Store-page fields of one entry with every path resolved to an http(s) URL. */
export function entryShowcase(entry) {
  const s = readShowcase(entry.manifest);
  const base = entry.manifestUrl;
  return {
    ...s,
    cover: httpUrl(s.cover, base),
    screenshots: s.screenshots.map((sh) => ({ url: httpUrl(sh.src, base), caption: sh.caption })).filter((sh) => sh.url),
    screencast: s.screencast ? { url: httpUrl(s.screencast.src, base), poster: httpUrl(s.screencast.poster, base) } : null,
  };
}
