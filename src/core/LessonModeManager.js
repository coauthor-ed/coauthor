import { EventBus } from './EventBus.js';
import { appUrl } from './basePath.js';
import { LookManager } from './LookManager.js';

/**
 * Lesson mode: the student runtime's two visual languages, "classic" and
 * "story" (docs/sprints/wip/lesson-modes-plan.md). Same pattern as
 * ThemeManager: an attribute on <html> that theme.css keys token blocks on,
 * plus an EventBus event for components that change STRUCTURE (not just
 * token values) between modes.
 *
 * - The saved preference is per profile (`coauthor-lesson-mode:<profileId>`)
 *   and is simply the student's LAST TOGGLE; there is no per-course default.
 *   A profile-less key mirrors the last value written so the very first paint
 *   (before AuthService resolves the profile from IndexedDB) is already right
 *   for the usual one-child-per-device case.
 * - A story-only module (`"lessonMode": "story"` in its module JSON) FORCES a
 *   mode while it is open, without touching the saved toggle; the switch is
 *   hidden meanwhile (AppShell reads isForced()).
 * - The active look (LookManager) decides which modes exist at all: a saved
 *   or forced mode the look does not offer falls back to the look's first
 *   mode, and with one mode the switch is hidden (isSwitchable()).
 * - Student runtime only: never call init() from the authoring app (#aa-shell),
 *   which keeps its own single visual language (invariant 10).
 *
 * Plugins learn the initial mode from ctx.lessonMode at mount and subscribe to
 * 'lesson-mode:changed' for later switches; never :host-context().
 */
export const LESSON_MODES = ['classic', 'story'];
const DEFAULT_MODE = 'classic';
const KEY = 'coauthor-lesson-mode';

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode etc. */ }
}
function valid(mode) {
  return LESSON_MODES.includes(mode) ? mode : null;
}

let _profileId = null;
let _saved = DEFAULT_MODE;
let _forced = null;

// Story's two faces are only fetched once Story is actually shown, so a
// Classic-only student never downloads them (vendor/fonts/story-fonts.css).
// Exported for the landing page, whose grown-ups' half uses Story's display
// face whatever the lesson mode is.
let _storyFontsRequested = false;
export function ensureStoryFonts() {
  if (_storyFontsRequested || typeof document === 'undefined') return;
  _storyFontsRequested = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = appUrl('vendor/fonts/story-fonts.css');
  document.head.appendChild(link);
}

/** The modes the active look offers that this runtime knows. */
function offered() {
  const m = LookManager.modes().filter(x => LESSON_MODES.includes(x));
  return m.length ? m : [DEFAULT_MODE];
}

/** Forced, else saved; either one the look does not offer -> its first mode. */
function effective() {
  const want = _forced || _saved;
  const modes = offered();
  return modes.includes(want) ? want : modes[0];
}

function switchable() {
  return !_forced && offered().length > 1;
}

function apply() {
  const mode = effective();
  if (mode === 'story') ensureStoryFonts();
  const root = document.documentElement;
  if (root.getAttribute('data-lesson-mode') === mode) return;
  root.setAttribute('data-lesson-mode', mode);
  EventBus.emit('lesson-mode:changed', { mode, forced: !!_forced, switchable: switchable() });
}

// A look change can remove the current mode or the switch; re-apply, and
// announce a switchability change even when the mode itself stays put.
// Only after init(): the authoring app never initialises either manager.
let _initialised = false;
let _lastSwitchable = true;
EventBus.on('look:changed', () => {
  if (!_initialised) return;
  const root = document.documentElement;
  const mode = effective();
  if (root.getAttribute('data-lesson-mode') !== mode) apply();
  else if (switchable() !== _lastSwitchable) {
    EventBus.emit('lesson-mode:changed', { mode, forced: !!_forced, switchable: switchable() });
  }
  _lastSwitchable = switchable();
});

export const LessonModeManager = {
  /** Synchronous first-paint apply from the profile-less mirror key. */
  init() {
    _initialised = true;
    _saved = valid(read(KEY)) || DEFAULT_MODE;
    _lastSwitchable = switchable();
    apply();
  },

  /** Called whenever the active profile is (re)resolved. */
  setProfile(profileId) {
    _profileId = profileId || null;
    const own = _profileId ? valid(read(`${KEY}:${_profileId}`)) : null;
    _saved = own || valid(read(KEY)) || DEFAULT_MODE;
    apply();
  },

  /** The student's toggle: persisted for this profile. */
  setMode(mode) {
    const m = valid(mode);
    if (!m) return;
    _saved = m;
    write(KEY, m);
    if (_profileId) write(`${KEY}:${_profileId}`, m);
    apply();
  },

  toggle() {
    this.setMode(this.getSavedMode() === 'story' ? 'classic' : 'story');
  },

  /** A module that supports one mode only; null clears it. Never persisted. */
  setForced(mode) {
    const next = valid(mode);
    if (next === _forced) return;
    _forced = next;
    // The switch's visibility depends on this even when the effective mode
    // does not change, so always announce it.
    const root = document.documentElement;
    _lastSwitchable = switchable();
    if (root.getAttribute('data-lesson-mode') !== effective()) {
      apply();
    } else {
      EventBus.emit('lesson-mode:changed', { mode: effective(), forced: !!_forced, switchable: switchable() });
    }
  },

  getMode() {
    return effective();
  },

  getSavedMode() {
    return _saved;
  },

  isForced() {
    return !!_forced;
  },

  /** False while forced or when the look offers one mode: hide the switch. */
  isSwitchable() {
    return switchable();
  },
};
