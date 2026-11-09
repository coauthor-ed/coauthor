/**
 * Courses the Discover section shows as browsable even if a parent hasn't
 * added them yet — the counterpart to defaultCourseSources.js, but for
 * "look, don't add" browsing rather than auto-registration. Same
 * `{type, url}` shape (`'manifest'` resolves through
 * CourseSourceManager.previewManifest(), `'aggregate'` through
 * previewBundleManifest()) so both are previewed uniformly.
 *
 * Ships empty until a real curated showcase repo exists — DiscoverView's
 * own empty state handles this, same as HomeDashboard already does for
 * defaultCourseSources.js.
 */
export const DEFAULT_SHOWCASE_SOURCES = [
  // { type: 'aggregate', url: 'https://example.org/cbse-courses/bundle-manifest.json' },
  // { type: 'manifest',  url: 'https://example.org/cbse-courses/biology-grade9/manifest.json' },
];
