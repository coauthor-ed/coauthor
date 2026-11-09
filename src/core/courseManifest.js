import { CourseSourceManager } from './CourseSourceManager.js';
import { needsNewerEngine } from './engineVersion.js';

/**
 * A course bundle's manifest.json, fetched once per bundle per page load and
 * shared by whoever needs a bundle-level setting while a course is open
 * (LookManager.followBundle(): bundle.json "accent" and "look").
 * Resolves null for no bundle, a 404, a network error or bad JSON; never
 * throws.
 */
const _cache = new Map(); // bundleId -> Promise<object|null>

export function loadCourseManifest(bundleId) {
  if (!bundleId) return Promise.resolve(null);
  if (!_cache.has(bundleId)) {
    _cache.set(bundleId, (async () => {
      try {
        await CourseSourceManager.init();
        const res = await fetch(CourseSourceManager.resolveRef('manifest.json', bundleId));
        return res.ok ? await res.json() : null;
      } catch {
        return null;
      }
    })());
  }
  return _cache.get(bundleId);
}

/**
 * Engine version gate (P0-2): true when this bundle's manifest, or the given
 * module JSON, asks for a newer engine than the one running. Views then show
 * <needs-update-notice> instead of content. Never throws.
 */
export async function bundleNeedsNewerEngine(bundleId, moduleData = null) {
  if (moduleData && needsNewerEngine(moduleData)) return true;
  return needsNewerEngine(await loadCourseManifest(bundleId));
}
