/**
 * Accessibility Announcer singleton.
 * Manages an aria-live region to announce dynamic, non-visual changes to screen readers.
 * 
 * Required by accessibility-checklist.md
 */
class Announcer {
  constructor() {
    this._container = null;
    this._init();
  }

  _init() {
    if (typeof document === 'undefined') return;

    this._container = document.createElement('div');
    this._container.setAttribute('aria-live', 'polite');
    this._container.setAttribute('aria-atomic', 'true');
    this._container.style.position = 'absolute';
    this._container.style.width = '1px';
    this._container.style.height = '1px';
    this._container.style.padding = '0';
    this._container.style.margin = '-1px';
    this._container.style.overflow = 'hidden';
    this._container.style.clip = 'rect(0, 0, 0, 0)';
    this._container.style.whiteSpace = 'nowrap';
    this._container.style.border = '0';

    document.body.appendChild(this._container);
  }

  /**
   * Announces a message to screen readers.
   * @param {string} message The text to announce.
   * @param {boolean} assertive If true, interrupts current speech (aria-live="assertive").
   */
  announce(message, assertive = false) {
    if (!this._container) return;
    
    this._container.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
    // Clear and set to force voiceover to read repeated identical messages
    this._container.textContent = '';
    
    // A small delay ensures the screen reader registers the DOM change
    setTimeout(() => {
      this._container.textContent = message;
    }, 50);
  }
}

export const A11yAnnouncer = new Announcer();
