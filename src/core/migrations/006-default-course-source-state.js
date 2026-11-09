/**
 * Adds the courseSourceRemovedDefaults store — remembers which of
 * defaultCourseSources.js's baked-in source/aggregator URLs a user has
 * explicitly removed, so CourseSourceManager.seedDefaults() (called once per
 * app boot, after init()) never silently re-adds something they deliberately
 * took off their course list. Keyed by the URL string itself — deliberately
 * not by bundleId/bundleManifestId, since a removal must survive even if the
 * removed row's own id changes on a later republish of that same URL.
 */
export function migration006(db) {
  if (!db.objectStoreNames.contains('courseSourceRemovedDefaults')) {
    db.createObjectStore('courseSourceRemovedDefaults', { keyPath: 'url' });
  }
}
