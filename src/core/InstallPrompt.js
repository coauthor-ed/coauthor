import { EventBus } from './EventBus.js';

/**
 * InstallPrompt (Q-53b): keeps the browser's install offer so the add-course
 * page can show a real "Install app" button, and says which install hint
 * fits this browser when there is no such offer.
 *
 * start() runs once from app.js, before any view, because Chrome fires
 * 'beforeinstallprompt' early and only once per page load.
 * Events: 'install:available' when an offer is kept, 'install:done' after
 * the app was installed.
 */

let deferred = null;
let installed = false;
let started = false;

/** Inside an app's own browser (WhatsApp, Instagram, Facebook, LINE, Snapchat, an Android WebView). */
export function isInAppBrowser(ua = navigator.userAgent || '') {
  return /FBAN|FBAV|FB_IAB|FB4A|Instagram|WhatsApp|Line\/|Snapchat|; wv\)/i.test(ua);
}

function isStandalone() {
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    if (window.matchMedia?.('(display-mode: window-controls-overlay)').matches) return true;
  } catch { /* old browser */ }
  return window.navigator.standalone === true;
}

function isIOS(ua) {
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export const InstallPrompt = {
  start() {
    if (started) return;
    started = true;
    window.addEventListener('beforeinstallprompt', (e) => {
      // Keep the offer for our own button (the add-course page). Chrome still
      // shows its own install icon in the address bar and menu.
      e.preventDefault();
      deferred = e;
      EventBus.emit('install:available', {});
    });
    window.addEventListener('appinstalled', () => {
      deferred = null;
      installed = true;
      EventBus.emit('install:done', {});
    });
  },

  /**
   * Which install step fits here:
   * 'installed' (already running as the app, or just installed), 'prompt'
   * (a real install offer is kept), 'in-app' (inside WhatsApp or similar:
   * open in Chrome/Safari first), 'ios' (Safari: Share, then Add to Home
   * Screen), 'firefox' (Firefox on Android: menu, then Install), 'other'.
   */
  context(ua = navigator.userAgent || '') {
    if (installed || isStandalone()) return 'installed';
    if (isInAppBrowser(ua)) return 'in-app';
    if (deferred) return 'prompt';
    if (isIOS(ua)) return 'ios';
    if (/Android/i.test(ua) && /Firefox\//i.test(ua)) return 'firefox';
    return 'other';
  },

  /** Shows the kept install offer. Resolves 'accepted', 'dismissed' or 'unavailable'. */
  async prompt() {
    const e = deferred;
    if (!e) return 'unavailable';
    deferred = null;
    try {
      await e.prompt();
      const choice = await e.userChoice;
      if (choice?.outcome === 'accepted') installed = true;
      return choice?.outcome || 'dismissed';
    } catch {
      return 'unavailable';
    }
  },
};
