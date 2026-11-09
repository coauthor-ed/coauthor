import { EventBus } from './EventBus.js';

// A visible-instantly toggle would flash on every navigation, even ones an
// already-warm cache resolves in a few milliseconds — that reads as
// jittery, not "responsive". Only actually show the overlay if loading is
// still in flight after this delay.
const SHOW_DELAY_MS = 150;

/**
 * Toggles the static `#content-loader` overlay defined directly in
 * index.html (see its own comment for why it's static markup, not
 * Lit-rendered) in response to `content:loading` — emitted by
 * LessonEngine/TestEngine around their async content fetches (a blockRef,
 * a flow node, a lazy 'fixed' question ref, or the lesson/test's own
 * top-level load). Lives in src/core/ rather than src/ui/ because it's a
 * shell-level concern with no engine-specific logic of its own — same
 * category as AssetPrefetcher, which it's started alongside.
 */
export const LoadingIndicator = {
  _showTimer: null,
  _el: null,
  _started: false,

  /** Idempotent — safe to call from more than one bootstrap path. */
  start() {
    if (this._started) return;
    this._started = true;
    this._el = document.getElementById('content-loader');
    EventBus.on('content:loading', ({ loading }) => (loading ? this._show() : this._hide()));
  },

  _show() {
    clearTimeout(this._showTimer);
    this._showTimer = setTimeout(() => this._el?.classList.add('is-visible'), SHOW_DELAY_MS);
  },

  _hide() {
    clearTimeout(this._showTimer);
    this._el?.classList.remove('is-visible');
  },
};
