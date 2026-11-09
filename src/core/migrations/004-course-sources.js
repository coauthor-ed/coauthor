/**
 * Adds the courseSources store — the registry of installed course bundles,
 * local (this origin's own /content/courses/<bundleId>/) and remote (a
 * separately-hosted bundle added via its manifest.json URL). Keyed by
 * bundleId since a bundle can only be installed from one place at a time;
 * `origin: 'local'` rows are the always-present default for anything under
 * this app's own /content/courses/, seeded lazily by CourseSourceManager
 * rather than enumerated here (a migration shouldn't need to know what's on
 * disk).
 */
export function migration004(db) {
  if (!db.objectStoreNames.contains('courseSources')) {
    db.createObjectStore('courseSources', { keyPath: 'bundleId' });
  }
}
