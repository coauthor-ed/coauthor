import { ProgressStore } from './ProgressStore.js';

/**
 * Per-install identity — "which copy of the app wrote this row", distinct
 * from `profileId` (a device-local surrogate for a *person*) and `personId`
 * (a stable, cross-device identity for a person). See
 * docs/sprints/completed/bookshelf-discover-and-identity-groundwork.md and
 * the cross-device-sync sprint's §6.4, which this lays groundwork for
 * without building any actual sync mechanism.
 *
 * `Math.random`-based, never `crypto.randomUUID` — this app runs on a
 * plain-HTTP LAN origin today, where `crypto.subtle`/`randomUUID` are
 * undefined (see the project's own no-crypto-for-shuffling convention).
 *
 * Same singleton-object-export shape as PRNG.js/Hasher.js. Minted once into
 * `meta` under key `deviceId` — a key the cross-device-sync doc's own §6.1
 * table already flags as one that "must not travel" during a future import,
 * so it's written here as a plain scalar, never nested inside anything an
 * import routine might naively spread.
 */
let _cachedId = null;

export const DeviceIdentity = {
  /** Reads (or mints-once) this install's device id. Safe to call
   *  concurrently — a `meta` `put` racing itself twice would just mint two
   *  ids and let the last write win, which matters not at all here (no
   *  reader depends on this being stable *before* the first call resolves;
   *  every real caller warms it once at boot and awaits). */
  async getDeviceId() {
    if (_cachedId) return _cachedId;
    const existing = await ProgressStore.get('meta', 'deviceId');
    if (existing?.value) {
      _cachedId = existing.value;
      return _cachedId;
    }
    const id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    await ProgressStore.put('meta', { key: 'deviceId', value: id });
    _cachedId = id;
    return id;
  },
};
