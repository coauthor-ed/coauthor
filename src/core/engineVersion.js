import { ErrorReporter } from './ErrorReporter.js';

/**
 * The engine's own version, compared against a course's optional
 * `requires: { engine: "1.0" }` (manifest.json or module JSON). Bump the
 * minor when content can depend on a new engine feature; a cached old
 * engine then says "update" instead of misrendering new content.
 */
export const ENGINE_VERSION = '1.0.0';

function parse(v) {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
  if (typeof v !== 'string') return null;
  const parts = v.trim().split('.');
  if (parts.length < 1 || parts.length > 3) return null;
  const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  if (nums.some(Number.isNaN)) return null;
  while (nums.length < 3) nums.push(0);
  return nums;
}

/**
 * True when `current` >= `required` (dotted numeric: "1.2" means >= 1.2.0).
 * A missing required version is satisfied silently; a garbage one is
 * satisfied too, with a warning through ErrorReporter.
 */
export function satisfies(required, current = ENGINE_VERSION) {
  if (required === undefined || required === null || required === '') return true;
  const req = parse(required);
  const cur = parse(current);
  if (!req || !cur) {
    ErrorReporter.reportError(new Error(`Unreadable engine version requirement: ${JSON.stringify(required)}`), { where: 'engineVersion.satisfies' });
    return true;
  }
  for (let i = 0; i < 3; i++) {
    if (cur[i] !== req[i]) return cur[i] > req[i];
  }
  return true;
}

/** The `requires.engine` of a manifest or module object, or undefined. */
export function requiredEngine(data) {
  return data && typeof data === 'object' ? data.requires?.engine : undefined;
}

/** True when `data` (manifest or module JSON) needs a newer engine than this one. */
export function needsNewerEngine(data) {
  return !satisfies(requiredEngine(data));
}
