import { EventBus } from './EventBus.js';
import { PREF_KEY, LEGACY_KEY, migrate, resolve, toggled, nextPref, isPref } from './themePref.js';

/*
 * Q-66: the theme follows the device by default. The learner's preference is
 * 'device' | 'light' | 'dark' (themePref.js); html[data-theme] holds the
 * resolved 'light' | 'dark' that theme.css keys on. themeBoot.js sets it
 * before first paint; init() takes over, migrates once, and listens to
 * prefers-color-scheme so a phone's evening schedule flips the app live,
 * mid-lesson included ('theme:changed' reaches sims and hosts as before).
 * 'theme-pref:changed' tells menus the preference moved.
 */
const DARK_Q = '(prefers-color-scheme: dark)';
const LIGHT_Q = '(prefers-color-scheme: light)';

let _pref = 'device';
let _lookDefault = 'dark';
let _mqDark = null;
let _mqLight = null;
let _listening = false;

function storage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

function mq(q) {
  try { return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null; } catch { return null; }
}

function media() {
  return { dark: !!_mqDark?.matches, light: !!_mqLight?.matches };
}

/**
 * The browser bar colour (index.html's two theme-color metas, one per
 * prefers-color-scheme). A light/dark choice pins the matching meta; 'device'
 * restores the media queries. No colour value lives here.
 */
function syncThemeColorMeta(pref) {
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    if (!m.dataset.media) m.dataset.media = m.getAttribute('media') || '';
    const own = m.dataset.media.includes('dark') ? 'dark' : 'light';
    if (pref === 'device') m.setAttribute('media', m.dataset.media);
    else m.setAttribute('media', pref === own ? 'all' : 'not all');
  }
}

function apply() {
  if (typeof document === 'undefined') return;
  const theme = resolve(_pref, media(), _lookDefault);
  const root = document.documentElement;
  syncThemeColorMeta(_pref);
  const s = storage();
  try { s?.setItem(LEGACY_KEY, theme); } catch { /* storage off */ }
  if (root.getAttribute('data-theme') === theme) return;
  root.setAttribute('data-theme', theme);
  EventBus.emit('theme:changed', { theme });
}

function onMediaChange() {
  if (_pref === 'device') apply();
}

export const ThemeManager = {
  /** A light/dark choice (the one-tap toggles). Stops following the device. */
  setTheme(theme) {
    this.setPreference(theme === 'light' ? 'light' : 'dark');
  },

  /** 'device' | 'light' | 'dark'. */
  setPreference(pref) {
    if (!isPref(pref)) return;
    const changed = pref !== _pref;
    _pref = pref;
    try { storage()?.setItem(PREF_KEY, pref); } catch { /* storage off */ }
    apply();
    if (changed) EventBus.emit('theme-pref:changed', { pref, theme: this.getTheme() });
  },

  getPreference() {
    return _pref;
  },

  /** Header toggle: flip what is showing. */
  toggle() {
    this.setTheme(toggled(this.getTheme()));
  },

  /** Profile menu: Match device, then Light, then Dark. */
  cyclePreference() {
    this.setPreference(nextPref(_pref));
  },

  /**
   * The active look's default theme (registry/looks.json "theme"; plain is
   * light, a look that names none is dark). Used only while following the
   * device and the browser reports no prefers-color-scheme.
   */
  applyLookDefault(theme) {
    _lookDefault = theme === 'light' ? 'light' : 'dark';
    if (_listening) apply();
  },

  getTheme() {
    if (typeof document === 'undefined') return resolve(_pref, media(), _lookDefault);
    return document.documentElement.getAttribute('data-theme');
  },

  init() {
    const s = storage();
    _pref = s ? migrate(s) : 'device';
    if (!_listening) {
      _mqDark = mq(DARK_Q);
      _mqLight = mq(LIGHT_Q);
      for (const m of [_mqDark, _mqLight]) {
        if (!m) continue;
        if (m.addEventListener) m.addEventListener('change', onMediaChange);
        else if (m.addListener) m.addListener(onMediaChange);
      }
      _listening = true;
    }
    apply();
  }
};
