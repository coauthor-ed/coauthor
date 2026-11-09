/**
 * Adds the courseSourceAggregators store — remembers which bundle-manifest.json
 * URLs (see CourseSourceManager.commitBundleManifest()) a parent has added, so
 * a later "check for new courses" can re-fetch just that one URL and diff
 * against what's already in courseSources, instead of asking the parent to
 * re-find and re-paste it. Keyed by bundleManifestId — the aggregator's own
 * self-declared id — mirroring how courseSources is keyed by each member
 * bundle's own bundleId. Purely a memory of "what was added from where";
 * removing a row here never touches the courseSources rows it produced.
 */
export function migration005(db) {
  if (!db.objectStoreNames.contains('courseSourceAggregators')) {
    db.createObjectStore('courseSourceAggregators', { keyPath: 'bundleManifestId' });
  }
}
