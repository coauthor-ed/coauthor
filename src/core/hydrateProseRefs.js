import { CourseSourceManager } from './CourseSourceManager.js';
import { ContentLoader } from './ContentLoader.js';

/**
 * hydrateProseRefs — resolves a block's `*Ref` prose field (a bundle-
 * relative path to a sibling `.md` file — see docs/content-authoring-guide.md
 * "Slide prose in sibling .md files") into the field the plugin already
 * reads, in the exact shape that plugin already expects. Dual-support:
 * inline `markdown`/`prompt` keeps working completely untouched (returned
 * as-is, no fetch); the `*Ref` form is the preferred one for new authoring,
 * fetched lazily here.
 *
 * Per-field shape matters: `content-block@1.markdown` and
 * `poe-explain@1.prompt`/`poe-observe-sim@1.prompt` are `{ en: "..." }`, but
 * `poe-predict@1.prompt` is a bare string (`ChoiceListBase.js` does no `.en`
 * unwrap, and every shipped file is a plain string) — a uniform `{en:...}`
 * hydration would silently break that one type.
 *
 * Inline wins if a block somehow carries both (authoring-kit validation
 * treats that as a hard FAIL; this function doesn't re-validate, it just
 * never overwrites real inline content).
 *
 * @param {object} data block payload (as loaded from JSON)
 * @param {string} [bundleId]
 * @param {string} [typeOverride] Use when `data` is a mount-shape payload
 *   nested under a wrapper that carries `type` one level up (e.g.
 *   LessonEngine's `blockData.data ?? blockData`, where `blockData.type` is
 *   authoritative) — `data.type` alone would otherwise be undefined.
 * @returns {Promise<object>} `data` unchanged if nothing needed hydrating,
 *   otherwise a shallow copy with the resolved field(s) filled in.
 */

// type -> [{ field, refField, shape }]. `shape: 'i18n'` produces `{en}`;
// `shape: 'bare'` produces a plain string (poe-predict@1's own shape).
const PROSE_REF_FIELDS = {
  'content-block@1':   [{ field: 'markdown', refField: 'markdownRef', shape: 'i18n' }],
  'poe-explain@1':     [{ field: 'prompt', refField: 'promptRef', shape: 'i18n' }],
  'poe-observe-sim@1': [{ field: 'prompt', refField: 'promptRef', shape: 'i18n' }],
  'poe-predict@1':     [{ field: 'prompt', refField: 'promptRef', shape: 'bare' }],
  'reflection@1':      [{ field: 'prompt', refField: 'promptRef', shape: 'i18n' }],
};

function hasInlineContent(value, shape) {
  if (shape === 'bare') return typeof value === 'string' && value.length > 0;
  return !!(value && typeof value === 'object' && typeof value.en === 'string' && value.en.length > 0);
}

export async function hydrateProseRefs(data, bundleId, typeOverride) {
  if (!data || typeof data !== 'object') return data;
  const fields = PROSE_REF_FIELDS[typeOverride ?? data.type];
  if (!fields) return data;

  let hydrated = data;
  for (const { field, refField, shape } of fields) {
    const ref = data[refField];
    if (!ref || hasInlineContent(data[field], shape)) continue;
    const url = CourseSourceManager.resolveRef(ref, bundleId);
    const text = await ContentLoader.loadText(url);
    if (hydrated === data) hydrated = { ...data };
    hydrated[field] = shape === 'bare' ? text : { en: text };
  }
  return hydrated;
}
