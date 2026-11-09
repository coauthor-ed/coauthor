/**
 * Adds the `enrollments` store — per-profile scoping for which registered
 * course bundles a student actually sees on their bookshelf, replacing
 * today's device-global "every registered source visible to every profile"
 * behavior (see docs/sprints/completed/bookshelf-discover-and-identity-
 * groundwork.md). Keyed by [profileId, courseId] so two profiles on the
 * same device can enroll independently in the same bundle.
 *
 * Carries `rev`/`updatedAt`/`deviceId` from day one — this is new plumbing
 * anyway, and those three fields are exactly what the (separate, not-yet-
 * built) cross-device-sync merge engine needs to resolve conflicts across
 * devices later. The other seven pre-existing stores are deliberately NOT
 * retrofitted with these fields here — that's real surgery belonging to
 * that sprint's own future work, not this one.
 */
export function migration011(db) {
  const enrollments = db.createObjectStore('enrollments', {
    keyPath: ['profileId', 'courseId'],
  });
  enrollments.createIndex('by_profile', 'profileId');
}
