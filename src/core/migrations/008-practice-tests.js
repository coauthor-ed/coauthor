/**
 * Adds the practiceTests store: a parent's own custom test *definitions*,
 * built at runtime in the student portal (manual question picks, or
 * criteria-driven auto-selection) from one or more published question banks.
 *
 * This is deliberately never a content file — it's per-device state, not
 * published/shareable content — so it gets its own IndexedDB store rather
 * than a `content/` JSON file. Attempts *against* a practice test still use
 * the existing `testAttempts` store unchanged (see TestEngine.js's
 * `practice:<id>` testId handling): only the definition itself (which
 * questions, in what order, at what weight) needs a home, and that's what
 * this store is.
 *
 * keyPath mirrors semanticAttempts' [profileId, X] shape (migration003) since
 * every store keyed by something profile-owned follows that same pattern.
 */
export function migration008(db) {
  if (!db.objectStoreNames.contains('practiceTests')) {
    const practiceTests = db.createObjectStore('practiceTests', { keyPath: ['profileId', 'practiceTestId'] });
    practiceTests.createIndex('by_profile', 'profileId');
  }
}
