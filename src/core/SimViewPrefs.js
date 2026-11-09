import { EventBus } from './EventBus.js';

/**
 * The learner's viewing options for a Story simulation slide (the "diorama
 * theatre", src/core/components/diorama/StoryTheatre.js): how the story and
 * the scene share the screen, whether the camera follows each beat, zoom and
 * pan, full screen, and the learner's own divider/window sizes.
 *
 * Same storage pattern as LessonModeManager: per profile
 * (`coauthor-sim-view:<profileId>`) with a profile-less mirror so the first
 * paint before AuthService resolves is already right. Every change is
 * broadcast as 'sim-view:changed' so each mounted content block re-renders
 * (invariant 4: no reaching into another element).
 *
 * Choices are enums, stored as strings, so an unknown or stale value from an
 * older build falls back to its default instead of breaking the layout.
 */
const KEY = 'coauthor-sim-view';

/** Option metadata, in the order the options panel shows them. */
export const SIM_VIEW_OPTIONS = Object.freeze([
  { key: 'layout', label: 'Layout', choices: [['split', 'Split screen'], ['scroll', 'Scrolling page']] },
  { key: 'autofit', label: 'Split', choices: [['on', 'Auto (follows each beat)'], ['off', 'Off (only my drag)']] },
  { key: 'follow', label: 'Camera follows the beat', choices: [['on', 'On'], ['off', 'Off']] },
  { key: 'zoom', label: 'Zoom and pan', choices: [['on', 'On'], ['off', 'Off']] },
  { key: 'controls', label: 'Scene controls', choices: [['auto', 'Auto (menu only if they shrink the scene)'], ['below', 'Always in sight'], ['menu', 'In a menu']] },
  { key: 'fullscreen', label: 'Full screen', choices: [['native', 'Whole screen'], ['overlay', 'Inside the page']] },
  { key: 'snap', label: 'Floating windows', choices: [['snap', 'Snap to corners'], ['free', 'Free drag']] },
  { key: 'moves', label: 'Window moves', choices: [['quill', 'Quill moves them'], ['plain', 'Just the motion'], ['off', 'Instant']] },
  { key: 'rotateHint', label: 'Turn-your-phone hint', choices: [['on', 'On'], ['off', 'Off']] },
]);

export const SIM_VIEW_DEFAULTS = Object.freeze({
  layout: 'split',
  autofit: 'on',
  follow: 'on',
  zoom: 'on',
  controls: 'auto',
  fullscreen: 'native',
  snap: 'snap',
  moves: 'quill',
  rotateHint: 'on',
  // Which window floats: 'none' (both docked) | 'scene' | 'story'. Only one at a time.
  float: 'none',
});

const CHOICES = Object.fromEntries(SIM_VIEW_OPTIONS.map((o) => [o.key, o.choices.map(([v]) => v)]));
CHOICES.float = ['none', 'scene', 'story'];

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
}

/** Keeps known keys with valid values; sizes are positive finite numbers. */
function clean(raw) {
  const out = { ...SIM_VIEW_DEFAULTS, sizes: {} };
  if (!raw || typeof raw !== 'object') return out;
  for (const k of Object.keys(CHOICES)) if (CHOICES[k].includes(raw[k])) out[k] = raw[k];
  if (raw.sizes && typeof raw.sizes === 'object') {
    for (const [k, v] of Object.entries(raw.sizes)) if (Number.isFinite(v) && v > 0) out.sizes[k] = v;
  }
  return out;
}

let _profileId = null;
let _prefs = clean(read(KEY));

function save() {
  write(KEY, _prefs);
  if (_profileId) write(`${KEY}:${_profileId}`, _prefs);
  EventBus.emit('sim-view:changed', { prefs: SimViewPrefs.get() });
}

export const SimViewPrefs = {
  /** Called whenever the active profile is (re)resolved. */
  setProfile(profileId) {
    _profileId = profileId || null;
    const own = _profileId ? read(`${KEY}:${_profileId}`) : null;
    _prefs = clean(own || read(KEY));
    EventBus.emit('sim-view:changed', { prefs: this.get() });
  },

  /** A copy; mutate through set()/setSize() only. */
  get() {
    return { ..._prefs, sizes: { ..._prefs.sizes } };
  },

  /** Sets one or more enum options; invalid values are ignored. */
  set(patch) {
    let changed = false;
    for (const [k, v] of Object.entries(patch || {})) {
      if (CHOICES[k]?.includes(v) && _prefs[k] !== v) { _prefs[k] = v; changed = true; }
    }
    if (changed) save();
  },

  /** A learner-chosen size (divider position, window width...). 0/null clears it. */
  setSize(key, px) {
    if (Number.isFinite(px) && px > 0) _prefs.sizes[key] = Math.round(px);
    else delete _prefs.sizes[key];
    save();
  },

  /** Forgets every size the learner dragged (the options panel's "Reset sizes"). */
  resetSizes() {
    _prefs.sizes = {};
    save();
  },
};
