/**
 * TouchGuard - stops a finger drag on a scene from also scrolling the page.
 *
 * `touch-action` is read once, at touchstart, from the HTML element under the
 * finger. Chrome ignores it on SVG child elements (`<g class="sv-drag">` does
 * nothing), and the scene decides what is a handle inside its own pointerDown,
 * after that moment. So a page-level rule cannot do it. Instead:
 *   - touchGuard(el, isActive): non-passive touchstart/touchmove listeners that
 *     preventDefault while isActive(e) is true. A touch that starts anywhere
 *     else is left alone and scrolls the page. pointerdown fires before
 *     touchstart/touchmove, so a scene's own hit-test result is already known by the time
 *     isActive is asked (SvgScene passes `() => this._drag`).
 *   - guardInteractiveCanvas(cv): canvases cannot hit-test cheaply, so a canvas
 *     that has a pointerdown listener registered on it gets `touch-action: none`
 *     (interactive canvases only; a canvas with no pointer listener still
 *     scrolls the page).
 */

/** @param {HTMLElement|SVGElement} el @param {(e: TouchEvent) => boolean} isActive @returns {() => void} unbind */
export function touchGuard(el, isActive) {
  // touchstart is the one that matters: a scene re-renders its SVG while dragging, which
  // detaches the touch's target, and touch events keep going to that detached node (they are
  // not retargeted by pointer capture), so a touchmove listener alone never sees them. Only
  // an active (hit-tested) touch is cancelled, which also drops that touch's synthetic click.
  const on = (e) => { if (e.cancelable && isActive(e)) e.preventDefault(); };
  el.addEventListener('touchstart', on, { passive: false });
  el.addEventListener('touchmove', on, { passive: false });
  return () => { el.removeEventListener('touchstart', on); el.removeEventListener('touchmove', on); };
}

/** touch-action: none on `cv` as soon as anything registers a pointerdown on it (own property; no prototype change). */
export function guardInteractiveCanvas(cv) {
  const orig = cv.addEventListener;
  cv.addEventListener = function (type, ...rest) {
    if (type === 'pointerdown' || type === 'touchstart') this.style.touchAction = 'none';
    return orig.call(this, type, ...rest);
  };
}

const GRAB = /^(grab|grabbing|move|all-scroll|[a-z]+-resize|crosshair)$/;

/**
 * DOM / SVG scenes: a touch that STARTS on something whose computed cursor says
 * "draggable" (grab, grabbing, move, *-resize, crosshair; `cursor` inherits, so a
 * `.sv-drag` group covers its children) does not scroll the page. Decided once at
 * touchstart; a touch that starts elsewhere scrolls as normal.
 */
export function guardGrabTargets(el) {
  let hold = false;
  const start = (e) => {
    hold = false;
    try { hold = GRAB.test(getComputedStyle(e.target).cursor); } catch (_) { /* detached target */ }
    // At touchstart (not only touchmove): a scene that re-renders mid-drag detaches the target.
    if (hold && e.cancelable) e.preventDefault();
  };
  const move = (e) => { if (hold && e.cancelable) e.preventDefault(); };
  const end = () => { hold = false; };
  el.addEventListener('touchstart', start, { passive: false });
  el.addEventListener('touchmove', move, { passive: false });
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
  return () => { for (const [t, f] of [['touchstart', start], ['touchmove', move], ['touchend', end], ['touchcancel', end]]) el.removeEventListener(t, f); };
}
