/**
 * The learner's narrator voice (Q-43): one choice per device, kept next to
 * the other narration preferences in localStorage (coauthor:narrate:<profile>
 * holds narrated or text). No IndexedDB. A course that does not offer the
 * stored voice plays its own default (narrationModel.pickVoice), and the
 * stored choice stays for the next course that does.
 *
 * Shared by LessonSession (reads it when a lesson opens, writes it when the
 * learner switches) and OfflinePrefetcher (warms only that voice's clips).
 */
export const VOICE_PREF_KEY = 'coauthor:narrate-voice';

/** The stored voice id, or null (none stored, or storage blocked). */
export function getVoicePref() {
  try { return localStorage.getItem(VOICE_PREF_KEY) || null; } catch { return null; }
}

/** Stores the learner's voice id; storage blocked is not an error. */
export function setVoicePref(id) {
  try { if (id) localStorage.setItem(VOICE_PREF_KEY, String(id)); } catch { /* non-fatal */ }
}

/** Narrated or text, per profile (LessonSession owns the toggle). */
export function narrateKey(profileId) {
  return `coauthor:narrate:${profileId || 'default'}`;
}

/**
 * Narrated or text for one course (Q-90), kept only for a course whose
 * manifest sets `narration.preferredMode`: the learner's last choice there,
 * beside the profile-wide key. Other courses never write or read it.
 */
export function courseNarrateKey(profileId, bundleId) {
  return `${narrateKey(profileId)}:${bundleId}`;
}

/** '1' / '0' when this profile chose a mode in this course, else null. */
export function getCourseNarrateChoice(profileId, bundleId) {
  if (!bundleId) return null;
  try {
    const v = localStorage.getItem(courseNarrateKey(profileId, bundleId));
    return v === '1' || v === '0' ? v : null;
  } catch { return null; }
}

/**
 * True when this profile narrates (Q-35: only then are clips prefetched):
 * the course's own stored choice when there is one (Q-90), else the
 * profile-wide preference.
 */
export function getNarratePref(profileId, bundleId = null) {
  const own = getCourseNarrateChoice(profileId, bundleId);
  if (own) return own === '1';
  try { return localStorage.getItem(narrateKey(profileId)) === '1'; } catch { return false; }
}

/**
 * Presenter mode (Q-90, a lecturer presenting a narrated lesson): on or off
 * per profile, and the caption-off switch that goes with it. Mute is per tab
 * (sessionStorage): a lecturer mutes for one class, not for good.
 */
export function presenterKey(profileId) {
  return `coauthor:narr-presenter:${profileId || 'default'}`;
}
export function captionsOffKey(profileId) {
  return `coauthor:narr-nocap:${profileId || 'default'}`;
}
export const MUTED_KEY = 'coauthor:narr-muted';

/** '1' in localStorage (or sessionStorage) under key; storage blocked = false. */
export function getFlag(key, store = 'local') {
  try { return (store === 'session' ? sessionStorage : localStorage).getItem(key) === '1'; } catch { return false; }
}
export function setFlag(key, on, store = 'local') {
  try { (store === 'session' ? sessionStorage : localStorage).setItem(key, on ? '1' : '0'); } catch { /* non-fatal */ }
}
