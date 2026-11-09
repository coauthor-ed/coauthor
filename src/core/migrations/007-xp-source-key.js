/**
 * Adds a `by_source` index to `xpEvents` so an award can be made idempotent.
 *
 * Until now `awardXP()` had no call sites at all, so nothing ever wrote an XP
 * event and the question never arose. Wiring it up (GamificationService)
 * introduces the obvious exploit: replaying a finished lesson, or re-answering
 * a question that was already correct, would grant the points again every time.
 *
 * `sourceKey` names the thing being rewarded rather than the moment it happened
 * ("lesson:<id>", "q:<lessonId>:<questionId>", "test:<attemptId>",
 * "game:<sceneSrc>"), so the service can look up whether that specific
 * achievement has already paid out. Not a unique index: existing rows written
 * before this migration have no sourceKey at all, and IndexedDB simply omits
 * those from the index rather than rejecting them.
 */
export function migration007(db, tx) {
  if (!db.objectStoreNames.contains('xpEvents')) return;
  const store = tx.objectStore('xpEvents');
  if (!store.indexNames.contains('by_source')) {
    store.createIndex('by_source', 'sourceKey', { unique: false });
  }
}
