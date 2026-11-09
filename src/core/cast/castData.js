/**
 * Story cast: the pure part (no DOM, no fetch), shared by the runtime
 * (src/core/cast/CourseCast.js), the validator (tools/validation/cast.js)
 * and the unit tests.
 *
 * A course bundle may name a cast in its manifest.json: `"cast":
 * "story/cast.json"` (bundle-relative). While that course is open its
 * narrator stands in the companion and stagehand slots and `<!-- SAY id -->`
 * paragraphs become speech bubbles (docs/content-authoring-guide.md, "Story
 * cast"). A course without the field behaves exactly as before.
 *
 * cast.json v1:
 *   {
 *     "castVersion": 1,
 *     "narrator": "kabir",
 *     "characters": {
 *       "kabir": {
 *         "name": { "en": "Kabir" },
 *         "short": { "en": "Kabir" },            optional, used in tight spots
 *         "poses": { "default": "story/kabir.svg", "think": "story/kabir-think.svg" },
 *         "element": "story/KabirFigure.js"      optional custom element module
 *       }
 *     }
 *   }
 *
 * Moods are free strings; `default` is required and is what any unknown
 * mood falls back to.
 */

export const CAST_VERSION = 1;

/** A character id or a mood: a short lowercase word. */
export const ID_RE = /^[a-z][a-z0-9_-]{0,31}$/;

const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const i18n = (v) => (isObj(v) && isStr(v.en) ? v.en.trim() : null);

/** Bundle-relative only: no scheme, no protocol-relative, no root-absolute,
 *  no climbing out of the bundle. */
export function isBundleRelative(p) {
  if (!isStr(p)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('/') || p.startsWith('\\')) return false;
  return !p.split('/').includes('..');
}

const IMAGE_RE = /\.(svg|png|jpe?g|webp|gif|avif)$/i;
const MODULE_RE = /\.m?js$/i;

/**
 * Checks a parsed cast.json. Returns { cast, errors, warnings }:
 *   cast      the normalised cast the engine uses, or null when nothing usable
 *             is left (lenient: a bad character is dropped, not fatal)
 *   errors    what the validator reports as errors (strict)
 *   warnings  what it reports as warnings
 *
 * Normalised shape:
 *   { castVersion, narrator, order: [id...], characters: { id: { id, name,
 *     short, label, poses: { mood: path }, element: path|null } } }
 * `label` is short || name, the word the chrome and bubbles show.
 */
export function checkCast(json) {
  const errors = [];
  const warnings = [];
  if (!isObj(json)) return { cast: null, errors: ['cast.json must be an object'], warnings };

  let version = json.castVersion;
  if (version === undefined) {
    errors.push('Missing castVersion (1)');
    version = 1;
  } else if (version !== CAST_VERSION) {
    errors.push(`Unsupported castVersion: ${JSON.stringify(version)} (this engine reads 1)`);
    return { cast: null, errors, warnings };
  }

  const characters = {};
  const order = [];
  if (!isObj(json.characters) || !Object.keys(json.characters).length) {
    errors.push('characters must be an object with at least one character');
  } else {
    for (const [rawId, c] of Object.entries(json.characters)) {
      const where = `characters.${rawId}`;
      if (!ID_RE.test(rawId)) { errors.push(`${where}: id must be a lowercase word (a-z, 0-9, _ or -), starting with a letter`); continue; }
      if (!isObj(c)) { errors.push(`${where}: must be an object`); continue; }
      const name = i18n(c.name);
      if (!name) { errors.push(`${where}.name: needs { "en": "..." }`); continue; }
      let short = null;
      if ('short' in c) {
        short = i18n(c.short);
        if (!short) errors.push(`${where}.short: needs { "en": "..." }`);
      }
      const poses = {};
      if (!isObj(c.poses)) {
        errors.push(`${where}.poses: needs an object of mood -> image path, with at least "default"`);
      } else {
        for (const [mood, p] of Object.entries(c.poses)) {
          if (!ID_RE.test(mood)) { errors.push(`${where}.poses.${mood}: a mood must be a lowercase word`); continue; }
          if (!isBundleRelative(p)) { errors.push(`${where}.poses.${mood}: must be a bundle-relative path such as "story/${rawId}-${mood}.svg"`); continue; }
          if (!IMAGE_RE.test(p)) warnings.push(`${where}.poses.${mood}: "${p}" does not look like an image (svg, png, jpg, webp, gif, avif)`);
          poses[mood] = p.trim();
        }
        if (!poses.default) errors.push(`${where}.poses: "default" is required (unknown moods fall back to it)`);
      }
      let element = null;
      if ('element' in c && c.element != null) {
        if (!isBundleRelative(c.element) || !MODULE_RE.test(c.element)) errors.push(`${where}.element: must be a bundle-relative .js module path`);
        else element = c.element.trim();
      }
      if (!poses.default) continue;
      characters[rawId] = { id: rawId, name, short, label: short || name, poses, element };
      order.push(rawId);
    }
  }

  let narrator = isStr(json.narrator) ? json.narrator.trim() : null;
  if (!narrator) errors.push('Missing narrator (a character id)');
  else if (!characters[narrator]) {
    if (isObj(json.characters) && narrator in json.characters) { /* already reported above */ } else errors.push(`narrator "${narrator}" is not one of the characters`);
  }
  if (!characters[narrator]) narrator = order[0] || null;

  if (!order.length) return { cast: null, errors, warnings };
  return { cast: { castVersion: version, narrator, order, characters }, errors, warnings };
}

/** The engine's view: the normalised cast or null, never throws. */
export function parseCast(json) {
  try { return checkCast(json).cast; } catch { return null; }
}

/**
 * Quill's expressions (what the look's reactor asks a companion for) mapped
 * to moods a cast is likely to draw, in preference order. Anything else is
 * tried as a mood by its own name.
 */
const EXPRESSION_MOODS = {
  heart: ['proud', 'happy'],
  happy: ['happy', 'proud'],
  surprised: ['oops', 'surprised', 'think'],
  sad: ['oops', 'sad'],
  neutral: ['default'],
};

/** The mood a character shows for a wanted mood or expression: that pose
 *  when it has one, else a near one, else `default`. */
export function moodFor(character, wanted) {
  const poses = character?.poses || {};
  const w = typeof wanted === 'string' ? wanted.trim().toLowerCase() : '';
  if (w && poses[w]) return w;
  for (const m of EXPRESSION_MOODS[w] || []) if (poses[m]) return m;
  return 'default';
}

/** The pose path for a mood, falling back to `default`. */
export function poseFor(character, wanted) {
  return character?.poses?.[moodFor(character, wanted)] || character?.poses?.default || null;
}

/** A valid custom element name for a character of a bundle. */
export function castTag(bundleId, id, prefix = 'cast') {
  const slug = String(bundleId || 'course').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'course';
  return `${prefix}-${slug}-${String(id).toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`;
}

// ── SAY markers ─────────────────────────────────────────────────────────────

/** `<!-- SAY kabir -->` or `<!-- SAY kabir think -->`. */
const SAY_BODY = String.raw`<!--\s*SAY\s+([A-Za-z][A-Za-z0-9_-]*)(?:\s+([A-Za-z][A-Za-z0-9_-]*))?\s*-->`;
const SAY_ONLY_RE = new RegExp(`^${SAY_BODY}$`);
// The marker, the rest of its line and any blank lines after it.
const SAY_GLOBAL_RE = new RegExp(`${SAY_BODY}[ \\t]*(?:\\r?\\n[ \\t]*)*`, 'g');

/** { id, mood } from one SAY comment (the whole string), else null. */
export function parseSay(comment) {
  const m = SAY_ONLY_RE.exec(String(comment ?? '').trim());
  return m ? { id: m[1].toLowerCase(), mood: m[2] ? m[2].toLowerCase() : null } : null;
}

/** Is this raw markdown token nothing but a SAY marker? (splitSteps.js) */
export function isSayComment(raw) {
  return SAY_ONLY_RE.test(String(raw ?? '').trim());
}

/** Does this markdown carry any SAY marker? Cheap pre-check. */
export function hasSay(md) {
  return typeof md === 'string' && md.includes('<!--') && /<!--\s*SAY\s/.test(md);
}

/** Text that cannot open a plain paragraph: a heading, quote, list, table,
 *  fence, display maths, raw HTML, or nothing at all. */
const NOT_PARAGRAPH = /^(?:$|#{1,6}(?:\s|$)|>|[-*+][ \t]|\d{1,9}[.)][ \t]|\||```|~~~|\$\$|<)/;

export const SAY_TOKEN_RE = /%%%SAY(\d+)%%%/;
export const SAY_TOKEN_GLOBAL_RE = /%%%SAY\d+%%%/g;

/**
 * Replaces each SAY marker that stands before a paragraph with a text token
 * (`%%%SAYn%%%`) glued to the paragraph's first word, so it survives marked
 * and the sanitiser as plain text inside that paragraph's <p>; the DOM step
 * (sayBubbles.js) then wraps that <p>. A marker before anything that is not
 * a paragraph (a list, a heading, the end) is simply dropped: that text
 * renders as it always did. Returns { text, says: [{ id, mood }] } where
 * says[n] belongs to token n.
 */
export function markSay(md) {
  const src = String(md ?? '');
  if (!hasSay(src)) return { text: src, says: [] };
  const says = [];
  SAY_GLOBAL_RE.lastIndex = 0;
  const text = src.replace(SAY_GLOBAL_RE, (whole, id, mood, offset) => {
    const rest = src.slice(offset + whole.length);
    if (NOT_PARAGRAPH.test(rest.split('\n', 1)[0].trimEnd())) return '';
    says.push({ id: id.toLowerCase(), mood: mood ? mood.toLowerCase() : null });
    return `%%%SAY${says.length - 1}%%%`;
  });
  return { text, says };
}
