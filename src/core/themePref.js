/**
 * Theme preference logic (Q-66), pure and DOM-free so a unit test can run it
 * in Node (test/unit/themePref.test.mjs).
 *
 * The learner's preference has three values:
 *   'device' (default): follow the OS / phone setting (prefers-color-scheme),
 *                       live, so a phone's evening schedule flips the app.
 *   'light' / 'dark':   a choice made with a theme toggle.
 *
 * Storage keys (localStorage):
 *   PREF_KEY     the preference itself.
 *   VERSION_KEY  '2' once the one-time migration below has run.
 *   LEGACY_KEY   the old 'coauthor-theme'. Still written with the resolved
 *                theme so the dev harness pages that read it keep working;
 *                never read after migration.
 *
 * src/core/themeBoot.js (a classic script, run before first paint) repeats
 * migrate() and resolve() in a few lines because it cannot import a module.
 * Keep the two in step.
 */
export const PREF_KEY = 'coauthor-theme-pref';
export const VERSION_KEY = 'coauthor-theme-v';
export const LEGACY_KEY = 'coauthor-theme';
export const PREF_VERSION = '2';
export const PREFS = ['device', 'light', 'dark'];

export function isPref(v) {
  return PREFS.includes(v);
}

/**
 * One-time migration. The old ThemeManager saved 'dark' on first run (not a
 * real choice), and a saved 'dark' cannot be told apart from a toggle, so
 * 'dark' or nothing becomes 'device'. Only a toggle ever wrote 'light', so
 * 'light' is kept as a real choice. Returns the preference; writes it and the
 * version flag. `store` is a localStorage-like object; throws are swallowed.
 */
export function migrate(store) {
  const get = (k) => { try { return store.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { store.setItem(k, v); } catch { /* storage off */ } };
  const current = get(PREF_KEY);
  if (get(VERSION_KEY) === PREF_VERSION && isPref(current)) return current;
  const pref = isPref(current) ? current : (get(LEGACY_KEY) === 'light' ? 'light' : 'device');
  set(PREF_KEY, pref);
  set(VERSION_KEY, PREF_VERSION);
  return pref;
}

/**
 * The theme to show. `media` = { dark, light }: whether the browser matches
 * (prefers-color-scheme: dark / light). The look default (plain is light)
 * counts only when the browser reports neither.
 */
export function resolve(pref, media, lookDefault) {
  if (pref === 'light' || pref === 'dark') return pref;
  if (media?.dark) return 'dark';
  if (media?.light) return 'light';
  return lookDefault === 'light' ? 'light' : 'dark';
}

/** The header toggle: flip what is showing; the result is a real choice. */
export function toggled(theme) {
  return theme === 'light' ? 'dark' : 'light';
}

/** The profile menu cycle: Match device, then Light, then Dark, then back. */
export function nextPref(pref) {
  const i = PREFS.indexOf(pref);
  return PREFS[(i + 1) % PREFS.length];
}
