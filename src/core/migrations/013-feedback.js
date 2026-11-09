/**
 * Adds the `feedback` store: learner "Tell us" flags on a lesson slide,
 * kept locally until a parent sends them. Keyed by [profileId, feedbackId].
 * Rows hold no learner name. `text` is plain text: renderers must escape it.
 */
export function migration013(db) {
  const store = db.createObjectStore('feedback', {
    keyPath: ['profileId', 'feedbackId'],
  });
  store.createIndex('by_profile', 'profileId');
  store.createIndex('by_profile_bundle', ['profileId', 'bundleId']);
}
