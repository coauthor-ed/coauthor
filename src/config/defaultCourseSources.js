/**
 * Course sources every fresh install auto-registers on first boot, so a
 * visitor sees the official course library without manually pasting a URL
 * (see CourseSourceManager.seedDefaults()). Courses live in their own
 * repo(s), not bundled into this app — content/catalog.json no longer
 * exists; this is what replaces it.
 *
 * `type: 'aggregate'` — a bundle-manifest.json (see
 * tools/content-migration/generate-bundle-aggregate.py) listing several
 * course manifest.json URLs at once.
 * `type: 'manifest'` — a single course's own manifest.json.
 *
 * Ships empty until a real course repo is published — seedDefaults() is
 * idempotent either way, so filling this in later requires no other change.
 */
export const DEFAULT_COURSE_SOURCES = [
  // { type: 'aggregate', url: 'https://example.org/cbse-courses/bundle-manifest.json' },
  // { type: 'manifest',  url: 'https://example.org/cbse-courses/biology-grade9/manifest.json' },
];
