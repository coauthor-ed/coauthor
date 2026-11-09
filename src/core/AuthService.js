import { ProgressStore } from './ProgressStore.js';

// AppShell calls getCurrentUser() more than once at boot (its own
// connectedCallback, plus the initial route-changed dispatch) — both before
// either write below has landed, on a fresh install. Without this lock, both
// calls independently see zero profiles and each mints its own auto-created
// row, orphaning one of them the moment OnboardingFlow._finalize() only
// finds and upgrades the other. Module-level (this file has one instance
// per page) rather than IndexedDB-transactional — good enough for the
// same-tab race that actually happens; a genuinely separate tab/reload
// racing at the same instant is a far rarer edge case not worth a real
// compare-and-set for.
let _autoCreatePromise = null;

/**
 * Authentication Service interacting with IndexedDB
 */
export const AuthService = {
  /**
   * True for a profile made as "College or adult" at onboarding
   * (profile.learner === 'adult'). Such a learner is their own grown-up: no
   * parental gate, and "Progress and settings" instead of "Parent area".
   * Deliberately not inferred from a missing grade: an auto-created profile
   * (a shared link opened before onboarding) has no grade either.
   */
  isAdult(profile) {
    return profile?.learner === 'adult';
  },

  /**
   * Backfills `personId` (a stable, name-free identity, separate from
   * `profileId` — see the bookshelf/identity-groundwork sprint) onto a
   * profile row minted before this field existed. Additive field, no
   * migration needed. Centralized here rather than at each call site since
   * every path through getCurrentUser() below needs it exactly once, lazily,
   * the first time that profile is loaded after this shipped.
   */
  async _ensurePersonId(profile) {
    if (profile.personId) return profile;
    const personId = 'pn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    const updated = { ...profile, personId };
    await ProgressStore.put('profiles', updated);
    return updated;
  },

  /**
   * Returns the currently authenticated user profile asynchronously.
   */
  async getCurrentUser() {
    const activeProfileMeta = await ProgressStore.get('meta', 'active_profile');
    if (activeProfileMeta && activeProfileMeta.value) {
      let profile = await ProgressStore.get('profiles', activeProfileMeta.value);
      if (profile) {
        profile = await this._ensurePersonId(profile);
        const key = profile.profileId || profile.id || 'default_student';
        return { ...profile, profileId: key, id: key };
      }
    }

    // Fallback to first available profile
    const db = await ProgressStore.getDB();
    const allProfiles = await db.getAll('profiles');
    if (allProfiles && allProfiles.length > 0) {
      const p = await this._ensurePersonId(allProfiles[0]);
      const key = p.profileId || p.id || 'default_student';
      return { ...p, profileId: key, id: key };
    }

    // No profiles yet. This used to return an ephemeral, never-persisted
    // {profileId: 'default_student', ...} object — a literal shared by
    // every device that hasn't onboarded yet. AppShell's route-changed
    // handler allows a handful of "direct content" routes (a shared lesson
    // link, a module deep-link) to bypass onboarding entirely, so a family
    // that opens such a link before onboarding wrote real progress under
    // that shared literal; once they *did* onboard, OnboardingFlow minted a
    // fresh p_... id with no connection to it, stranding the work
    // permanently (cross-device-sync sprint, Stage 1 — "the default_student
    // first-run trap"). Auto-creating and persisting a real profile here,
    // on first touch, means there is never a moment where a real write
    // lands under a shared non-profile id: from the very first lesson/test
    // interaction, this device already owns exactly one real profileId.
    // `autoCreated: true` lets OnboardingFlow._finalize() find and *upgrade*
    // this same row (name/grade added) instead of minting a second,
    // disconnected profile when the family does go through onboarding.
    if (!_autoCreatePromise) {
      _autoCreatePromise = (async () => {
        const profileId = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const personId = 'pn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
        const profile = {
          profileId,
          personId,
          name: 'Student',
          role: 'student',
          autoCreated: true,
          createdAt: Date.now(),
        };
        await ProgressStore.put('profiles', profile);
        await ProgressStore.put('meta', { key: 'active_profile', value: profileId });
        return profile;
      })();
    }
    const profile = await _autoCreatePromise;
    return { ...profile, id: profile.profileId };
  }
};
