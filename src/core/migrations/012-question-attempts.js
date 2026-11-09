/**
 * Adds the `questionAttempts` store: one row per graded answer (lesson check,
 * test submit, practice submit), so per-question and per-chapter history
 * survives lessons being re-edited. Keyed by [profileId, attemptKey]
 * (attemptKey is unique per row). Rows are append-only.
 */
export function migration012(db) {
  const store = db.createObjectStore('questionAttempts', {
    keyPath: ['profileId', 'attemptKey'],
  });
  store.createIndex('by_profile', 'profileId');
  store.createIndex('by_profile_question', ['profileId', 'questionKey']);
  store.createIndex('by_profile_chapter', ['profileId', 'chapterId']);
}
