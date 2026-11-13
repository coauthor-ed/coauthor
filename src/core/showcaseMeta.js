/**
 * showcaseMeta.js - the store-page fields of a course (Discover, Q-47) and of a
 * course landing page (tools/publish/make-landing.mjs, Q-53). Pure, no DOM and
 * no fetch, so the engine and the Node publish tools share one reading.
 *
 * Optional manifest fields (manifest.json or bundle-manifest.json), all additive
 * to metadata v1 (docs/content-authoring-guide.md "Course metadata"):
 *   blurb        {en}  one line, about 90 characters, plain words
 *   description  {en}  (metadata v1) the longer text
 *   highlights   [{en}] 3 to 5 short points
 *   screenshots  [path | { src, caption? {en} }] phone screenshots, bundle-relative
 *   screencast   path | { src, poster? }  a short silent clip (mp4 or webm)
 *   cover        path  16:9 image (also og:image on the landing page)
 *   sizeMB       number, download size (written by the staging tool)
 *   estHours     number (metadata v1)
 * The older `showcase` object (tagline, cover, shots/screenshots, clip) is still
 * read as a fallback.
 *
 * Derived, never hand-set (owner addendum to D29, 2026-11-11):
 *   narrated   - some lesson carries a narrationRef sidecar (deriveFacts)
 *   alignment  - from the lessons' chapterIds (syllabusAlignment)
 */

export const IMG_RX = /\.(jpe?g|png|webp)$/i;
export const VID_RX = /\.(mp4|webm)$/i;

export const INDEPENDENCE_NOTE = 'Independent course. Not made, endorsed or approved by NCERT or CBSE.';

export const SUBJECT_NAMES = {
  science: 'Science', biology: 'Biology', physics: 'Physics', chemistry: 'Chemistry',
  mathematics: 'Mathematics', maths: 'Mathematics', math: 'Mathematics',
  'social-science': 'Social Science', sst: 'Social Science', geography: 'Geography', history: 'History',
  epidemiology: 'Epidemiology',
};

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
/** Learner-facing text from {en} or a plain string. */
export const textOf = (v) => (v && typeof v === 'object' ? str(v.en) : str(v));

/** A bundle-relative asset path: no scheme, no "..", no leading slash, safe characters, the right kind. */
export function safeAssetPath(p, kinds) {
  if (typeof p !== 'string') return null;
  const s = p.trim().replace(/^\.\//, '');
  if (!s || s.startsWith('/') || /^[a-z]+:/i.test(s) || s.split('/').includes('..')) return null;
  if (!/^[A-Za-z0-9._\-/]+$/.test(s)) return null;
  if (kinds && !kinds.test(s)) return null;
  return s;
}

/** The store-page fields of one manifest, normalised. Paths stay bundle-relative (resolve them yourself). */
export function readShowcase(manifest) {
  const m = manifest && typeof manifest === 'object' ? manifest : {};
  const old = m.showcase && typeof m.showcase === 'object' && !Array.isArray(m.showcase) ? m.showcase : {};
  const rawShots = Array.isArray(m.screenshots) ? m.screenshots
    : Array.isArray(old.screenshots) ? old.screenshots : Array.isArray(old.shots) ? old.shots : [];
  const screenshots = rawShots
    .map((sh) => (typeof sh === 'string' ? { src: sh } : sh && typeof sh === 'object' ? sh : {}))
    .map((sh) => ({ src: safeAssetPath(sh.src, IMG_RX), caption: textOf(sh.caption) }))
    .filter((sh) => sh.src)
    .slice(0, 8);
  const sc = m.screencast !== undefined ? m.screencast : old.clip;
  const scObj = typeof sc === 'string' ? { src: sc } : sc && typeof sc === 'object' ? sc : {};
  const castSrc = safeAssetPath(scObj.src, VID_RX);
  const highlights = (Array.isArray(m.highlights) ? m.highlights : []).map(textOf).filter(Boolean).slice(0, 6);
  return {
    blurb: textOf(m.blurb) || textOf(old.tagline),
    description: textOf(m.description),
    highlights,
    screenshots,
    screencast: castSrc ? { src: castSrc, poster: safeAssetPath(scObj.poster, IMG_RX) } : null,
    cover: safeAssetPath(m.cover, IMG_RX) || safeAssetPath(old.cover, IMG_RX),
    sizeMB: Number.isFinite(m.sizeMB) && m.sizeMB >= 0 ? m.sizeMB : null,
    estHours: Number.isFinite(m.estHours) && m.estHours >= 0 ? m.estHours : null,
  };
}

/**
 * The school class of a chapter id in the NCERT book-code form ("iesc1-ch2":
 * book code letter f..l = class 6..12). Namespaced ids ("analytical-epidemiology/ch1")
 * and anything else give null.
 */
export function chapterGrade(id) {
  if (typeof id !== 'string' || id.includes('/')) return null;
  const m = /^([f-l])[a-z]{2,4}\d{0,2}-ch\d+$/.exec(id.trim());
  return m ? 'fghijkl'.indexOf(m[1]) + 6 : null;
}

/**
 * The syllabus line, worded descriptively only (D29 addendum, PM default):
 *   every lesson maps to a chapter of this class -> "Follows the CBSE Class 9 syllabus"
 *   only some do                                   -> "Related to CBSE Class 9 Science"
 *   none, namespaced ids, no class, not CBSE       -> null (no line)
 * @param {Array<string|null|undefined>} chapterIds one per lesson
 */
export function syllabusAlignment(chapterIds, { board = 'CBSE', grade, subject } = {}) {
  if (String(board || '').toUpperCase() !== 'CBSE' || !Number.isFinite(grade)) return null;
  const ids = Array.isArray(chapterIds) ? chapterIds : [];
  if (!ids.length) return null;
  const mapped = ids.filter((id) => chapterGrade(id) === grade).length;
  if (!mapped) return null;
  if (mapped === ids.length) return { kind: 'follows', text: `Follows the CBSE Class ${grade} syllabus` };
  const subj = SUBJECT_NAMES[String(subject || '').toLowerCase()] || '';
  return { kind: 'related', text: `Related to CBSE Class ${grade}${subj ? ' ' + subj : ''}` };
}

/**
 * Facts derived from the lesson JSONs themselves (never a hand-set flag).
 * @param {Array<object|null>} lessons parsed lesson JSONs (null for one that failed to load)
 */
export function deriveFacts(lessons) {
  const list = (Array.isArray(lessons) ? lessons : []).filter((l) => l && typeof l === 'object');
  return {
    lessonCount: list.length,
    narrated: list.some((l) => str(l.narrationRef) !== ''),
    chapterIds: list.map((l) => str(l.chapterId) || null),
  };
}

/**
 * The facts digest tools/publish/make-digest.mjs writes into a manifest, read
 * defensively: { modules [{id, title, lessons [{ref, title}]}], lessonCount,
 * narrated, chapterIds } or null when absent or not version 1. Strings only;
 * lesson refs must be plain relative paths.
 */
export function readDigest(manifest) {
  const d = manifest?.digest;
  if (!d || typeof d !== 'object' || d.v !== 1 || !Array.isArray(d.modules)) return null;
  const okRef = (r) => typeof r === 'string' && /^[\w./-]+\.json$/.test(r) && !r.split('/').includes('..');
  const modules = d.modules.slice(0, 200).map((m) => ({
    id: str(m?.id),
    title: textOf(m?.title),
    lessons: (Array.isArray(m?.lessons) ? m.lessons : []).slice(0, 2000).filter((l) => okRef(l?.ref)).map((l) => ({ ref: l.ref, title: textOf(l?.title) })),
  }));
  const count = Number.isInteger(d.lessonCount) && d.lessonCount >= 0 ? d.lessonCount : modules.reduce((n, m) => n + m.lessons.length, 0);
  return {
    modules,
    lessonCount: count,
    narrated: d.narrated === true,
    chapterIds: (Array.isArray(d.chapterIds) ? d.chapterIds : []).filter((c) => typeof c === 'string' && c.length < 80),
  };
}
