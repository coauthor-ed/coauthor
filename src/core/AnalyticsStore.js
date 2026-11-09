import { ProgressStore } from './ProgressStore.js';

export const AnalyticsStore = {
  _buffer: [],
  _isFlushing: false,

  init() {
    // Flush on visibility hidden to catch user leaving
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flush();
      }
    });

    // Flush periodically
    setInterval(() => this.flush(), 60000);
  },

  /**
   * Log an event
   * @param {string} profileId 
   * @param {string} eventName 
   * @param {object} payload 
   */
  logEvent(profileId, eventName, payload = {}) {
    this._buffer.push({
      profileId,
      eventName,
      payload,
      timestamp: Date.now()
    });
    
    // If buffer gets too large, flush immediately
    if (this._buffer.length > 50) {
      this.flush();
    }
  },

  async flush() {
    if (this._isFlushing || this._buffer.length === 0) return;
    this._isFlushing = true;
    
    const eventsToFlush = [...this._buffer];
    this._buffer = [];

    try {
      const db = await ProgressStore.getDB();
      const tx = db.transaction('analyticsEvents', 'readwrite');
      const store = tx.objectStore('analyticsEvents');
      
      for (const event of eventsToFlush) {
        store.put(event);
      }
      
      await tx.done;
    } catch (e) {
      console.error("[AnalyticsStore] Failed to flush events", e);
      // Requeue
      this._buffer = [...eventsToFlush, ...this._buffer];
    } finally {
      this._isFlushing = false;
    }
  }
};
