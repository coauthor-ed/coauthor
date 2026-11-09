/**
 * Adds the semanticAttempts store for semantic-descriptive@1's per-rubric-point
 * coaching analytics (hints used, tier2/tier3 outcomes, time-to-resolve) — a
 * shape distinct enough from testAttempts' whole-attempt pass/fail records
 * that it gets its own store rather than overloading testAttempts' schema.
 */
export function migration003(db) {
  if (!db.objectStoreNames.contains('semanticAttempts')) {
    const semanticAttempts = db.createObjectStore('semanticAttempts', { keyPath: ['profileId', 'attemptId'] });
    semanticAttempts.createIndex('by_profile', 'profileId');
    semanticAttempts.createIndex('by_profile_question', ['profileId', 'questionId']);
  }
}
