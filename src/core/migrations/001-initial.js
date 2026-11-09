export function migration001(db) {
  db.createObjectStore('profiles', { keyPath: 'profileId' });

  const lessonProgress = db.createObjectStore('lessonProgress', { keyPath: ['profileId', 'lessonId'] });
  lessonProgress.createIndex('by_profile', 'profileId');

  const testAttempts = db.createObjectStore('testAttempts', { keyPath: ['profileId', 'attemptId'] });
  testAttempts.createIndex('by_profile', 'profileId');
  testAttempts.createIndex('by_profile_test', ['profileId', 'testId']);

  db.createObjectStore('sessionSnapshots', { keyPath: ['profileId', 'sessionId'] });

  const analyticsEvents = db.createObjectStore('analyticsEvents', { keyPath: 'id', autoIncrement: true });
  analyticsEvents.createIndex('by_profile_time', ['profileId', 'timestamp']);

  db.createObjectStore('pinCredentials', { keyPath: 'owner' });
  db.createObjectStore('meta', { keyPath: 'key' });
}
