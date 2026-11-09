/**
 * Minimal typed pub/sub channel for cross-component communication.
 * This ensures components never reach into each other's Shadow DOM.
 */
class EventBusImpl {
  constructor() {
    this._listeners = new Map();
  }

  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
  }

  off(event, handler) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(handler);
    }
  }

  emit(event, payload) {
    if (this._listeners.has(event)) {
      for (const handler of this._listeners.get(event)) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`Error in EventBus handler for event "${event}":`, err);
        }
      }
    }
  }
}

export const EventBus = new EventBusImpl();
