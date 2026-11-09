/**
 * Adds the courseNotes store — a small per-profile scratch space a lesson
 * block can write a free-text value into and a *different* block, possibly
 * in a different lesson or module, can read back later (e.g. a course's
 * opening lesson saves a learner's own written prediction, and its closing
 * lesson returns it unedited). Nothing else in the schema supports this:
 * lessonProgress only ever stores resume pointers (see data-model.md), and
 * analyticsEvents is expressly forbidden from carrying free text.
 *
 * Keyed by [profileId, bundleId, noteKey] rather than just [profileId,
 * noteKey] so two different course bundles can each use a plain key like
 * "prologue-theory" without colliding.
 */
export function migration010(db) {
  const courseNotes = db.createObjectStore('courseNotes', {
    keyPath: ['profileId', 'bundleId', 'noteKey'],
  });
  courseNotes.createIndex('by_profile', 'profileId');
}
