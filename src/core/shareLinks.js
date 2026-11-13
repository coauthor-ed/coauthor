import { appUrl } from './basePath.js';

/**
 * Share links (Q-52) and the add-course deep link (Q-53b), specs/W-share.md.
 *
 * Deep link contract (fixed, the landing pages build the same string):
 *   <engine>#/add?src=<encodeURIComponent(bundle base URL ending in "/")>[&module=<module JSON id>]
 * The bundle base is the folder that holds bundle-manifest.json (a course
 * repo's root). A folder that holds only a manifest.json (one course, no
 * bundle) is accepted too, so a course hosted on its own can be shared.
 */

/** The engine's own address, as an absolute URL ending in "/". */
export function engineUrl() {
  return new URL(appUrl(''), window.location.href).href.split('#')[0].split('?')[0];
}

/** The #/add deep link for a bundle base (and optionally one module). */
export function addLink(src, moduleId = null) {
  const m = moduleId ? `&module=${encodeURIComponent(moduleId)}` : '';
  return `${engineUrl()}#/add?src=${encodeURIComponent(src)}${m}`;
}

/** The directory of a URL (everything up to and including the last "/"). */
export function dirOf(url) {
  const u = new URL(url);
  u.hash = '';
  u.search = '';
  u.pathname = u.pathname.slice(0, u.pathname.lastIndexOf('/') + 1);
  return u.href;
}

/**
 * Reads and checks a #/add `src` value. Only http(s) URLs pass. Returns
 * { base, file } where base ends in "/" and file is a manifest file named in
 * the link itself (bundle-manifest.json or manifest.json), else null.
 * Throws a learner-readable Error for anything else.
 */
export function parseAddSrc(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('This link does not say which course to add.');
  let u;
  try { u = new URL(text); } catch { throw new Error('This link has a course address that is not a web address.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('This link has a course address that is not a web address.');
  if (u.username || u.password) throw new Error('This link has a course address that is not allowed.');
  u.hash = '';
  const last = u.pathname.slice(u.pathname.lastIndexOf('/') + 1);
  if (/\.json$/i.test(last)) {
    if (last !== 'bundle-manifest.json' && last !== 'manifest.json') throw new Error('This link points at a file that is not a course.');
    return { base: dirOf(u.href), file: last };
  }
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  u.search = '';
  return { base: u.href, file: null };
}

/** A module id from a link: letters, digits, dot, dash, underscore only. */
export function cleanModuleId(raw) {
  const s = String(raw || '').trim();
  return /^[A-Za-z0-9._-]{1,120}$/.test(s) ? s : null;
}

/** A module's id: its JSON "id", else its file name without .json. */
export function moduleIdOf(moduleJson, relPath) {
  if (moduleJson && typeof moduleJson.id === 'string' && moduleJson.id) return moduleJson.id;
  const name = String(relPath || '').split('/').pop() || '';
  return name.replace(/\.json$/i, '');
}

async function fetchJson(url, timeoutMs = 6000) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; } finally { if (t) clearTimeout(t); }
}

/** True when `base` serves an HTML page of its own (a published landing page). */
async function hasLandingPage(base, timeoutMs = 5000) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(base, { method: 'HEAD', cache: 'no-store', ...(ctl ? { signal: ctl.signal } : {}) });
    return res.ok && /text\/html/i.test(res.headers.get('content-type') || '');
  } catch { return false; } finally { if (t) clearTimeout(t); }
}

/**
 * What to share for one course. `manifestUrl` is the course's manifest.json
 * URL; `viaAggregatorUrl` the bundle-manifest.json it was added from, when
 * known; `moduleId` the module to open (optional).
 *
 * Order: the course repo's landing page when it has one (Q-53a), else the
 * #/add deep link to its bundle, else the #/add deep link to the course's
 * own folder. Never throws; offline it falls back to the deep link.
 * @returns {Promise<{url:string, kind:'landing'|'link'}>}
 */
export async function courseShareTarget({ manifestUrl, viaAggregatorUrl = null, moduleId = null }) {
  const courseDir = dirOf(manifestUrl);
  const candidates = [];
  if (viaAggregatorUrl) { try { candidates.push(dirOf(viaAggregatorUrl)); } catch { /* skip */ } }
  try { const parent = new URL('../', courseDir).href; if (parent !== courseDir && !candidates.includes(parent)) candidates.push(parent); } catch { /* skip */ }
  let bundleBase = null;
  for (const base of candidates) {
    const bm = await fetchJson(`${base}bundle-manifest.json`);
    if (!bm || !Array.isArray(bm.sources)) continue;
    const listed = bm.sources.some((s) => {
      try { return new URL(String(s?.manifestUrl || ''), `${base}bundle-manifest.json`).href === manifestUrl; } catch { return false; }
    });
    if (listed) { bundleBase = base; break; }
  }
  if (bundleBase && await hasLandingPage(bundleBase)) return { url: bundleBase, kind: 'landing' };
  return { url: addLink(bundleBase || courseDir, moduleId), kind: 'link' };
}

// ---- a deep link waiting for onboarding (no profile yet) ----

const PENDING_KEY = 'coauthor:pending-add';
const PENDING_MAX_AGE_MS = 60 * 60 * 1000;

/** Remembers an accepted #/add link while the learner makes a profile. */
export function savePendingAdd({ hash, audience = null }) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ hash, audience, at: Date.now() })); } catch { /* storage off: the learner taps the link again */ }
}

/** The waiting #/add link, or null. Only a fresh #/add hash is returned. */
export function readPendingAdd() {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    if (!p || typeof p.hash !== 'string' || !p.hash.startsWith('#/add?')) return null;
    if (!(Date.now() - p.at < PENDING_MAX_AGE_MS)) return null;
    return p;
  } catch { return null; }
}

export function clearPendingAdd() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}
