import { ProgressStore } from './ProgressStore.js';
import { EventBus } from './EventBus.js';

/**
 * Empty-shelf nudge towards Discover (Q-47 Stage 2, owner 2026-11-11).
 *
 * The nav marks Discover while the active profile has no active enrolments
 * and has never opened Discover. Both facts belong to the profile, not the
 * device: "seen" is kept on the profile record (discoverSeenAt), so it travels
 * with the profile in a backup or sync like the rest of its fields.
 *
 * Callers ask needsNudge() on route changes; markDiscoverSeen() is called when
 * Discover opens. 'discover:nudge' on the EventBus tells listeners to ask again.
 */

/** True when the profile should be pointed at Discover. Fails closed (no nudge). */
export async function needsNudge(profileId) {
  if (!profileId) return false;
  try {
    const profile = await ProgressStore.get('profiles', profileId);
    if (!profile || profile.discoverSeenAt) return false;
    const rows = await ProgressStore.listEnrollments(profileId);
    return rows.length === 0;
  } catch {
    return false;
  }
}

/** Records that this profile has opened Discover. Idempotent. */
export async function markDiscoverSeen(profileId) {
  if (!profileId) return;
  try {
    const profile = await ProgressStore.get('profiles', profileId);
    if (!profile || profile.discoverSeenAt) return;
    await ProgressStore.put('profiles', { ...profile, discoverSeenAt: Date.now() });
    EventBus.emit('discover:nudge', { profileId, on: false });
  } catch { /* best-effort: a failed write only means the dot shows once more */ }
}
