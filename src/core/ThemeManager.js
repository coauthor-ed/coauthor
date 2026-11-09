import { EventBus } from './EventBus.js';

export const ThemeManager = {
  setTheme(theme) {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    localStorage.setItem('coauthor-theme', theme);
    EventBus.emit('theme:changed', { theme });
  },

  /**
   * The active look's default theme (registry/looks.json "theme"; plain is
   * light, a look that names none is dark). Applied only while the learner
   * has never chosen a theme (no saved 'coauthor-theme'), and never saved,
   * so a later look change can move it again and the toggle still wins.
   */
  applyLookDefault(theme) {
    if (typeof document === 'undefined') return;
    let saved = null;
    try { saved = localStorage.getItem('coauthor-theme'); } catch { /* storage off */ }
    if (saved) return;
    const next = theme === 'light' ? 'light' : 'dark';
    const root = document.documentElement;
    if (root.getAttribute('data-theme') === next) return;
    root.setAttribute('data-theme', next);
    EventBus.emit('theme:changed', { theme: next });
  },

  getTheme() {
    return document.documentElement.getAttribute('data-theme');
  },

  init() {
    const saved = localStorage.getItem('coauthor-theme');
    if (saved) {
      this.setTheme(saved);
    } else {
      this.setTheme('dark');
    }
  }
};
