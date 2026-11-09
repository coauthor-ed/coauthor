export function migration002(db) {
  if (!db.objectStoreNames.contains('xpEvents')) {
    const xpEvents = db.createObjectStore('xpEvents', { keyPath: 'id', autoIncrement: true });
    xpEvents.createIndex('by_profile', 'profileId');
    xpEvents.createIndex('by_profile_time', ['profileId', 'timestamp']);
  }
}
