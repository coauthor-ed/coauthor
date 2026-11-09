import { ProgressStore } from './ProgressStore.js';

// Cloud sync is a no-op until an endpoint is explicitly configured, e.g.
// SyncManager.endpoint = 'https://example.org/api/v1/sync' before init().
// The static deployment has no backend, so no request is made by default.
export const SyncManager = {
  _isSyncing: false,
  endpoint: null,

  init() {
    if (!this.endpoint) return;

    // Listen for the browser coming online
    window.addEventListener('online', () => this.sync());

    // Also try syncing periodically (every 5 minutes) if online
    setInterval(() => {
      if (navigator.onLine) this.sync();
    }, 5 * 60 * 1000);

    // Initial check on load; delay slightly to not block initial render
    if (navigator.onLine) setTimeout(() => this.sync(), 2000);
  },

  async sync() {
    if (!this.endpoint || this._isSyncing || !navigator.onLine) return;
    this._isSyncing = true;

    try {
      const db = await ProgressStore.getDB();
      const tx = db.transaction(['lessonProgress', 'testAttempts'], 'readonly');
      const payload = {
        timestamp: Date.now(),
        lessons: await tx.objectStore('lessonProgress').getAll(),
        tests: await tx.objectStore('testAttempts').getAll()
      };

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Sync failed');
    } catch (err) {
      console.error('[SyncManager] Sync failed:', err);
    } finally {
      this._isSyncing = false;
    }
  }
};
