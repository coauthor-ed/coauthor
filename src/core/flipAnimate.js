/**
 * A minimal FLIP (First-Last-Invert-Play) helper for animating a DOM
 * element's position shift smoothly instead of letting it snap — e.g. an
 * image sliding down as the text beside/above it grows, rather than jumping
 * instantly. Framework-agnostic (no Lit import), same reasoning as
 * `focusRect.js` staying DOM-adjacent but dependency-free.
 *
 * Usage: capture the element's rect *before* whatever DOM change is about to
 * move it, let the change happen, then hand the captured rect to `playFlip`.
 */

/** @returns {DOMRect|null} */
export function captureRect(el) {
  return el ? el.getBoundingClientRect() : null;
}

const DEFAULT_DURATION_MS = 380;
const DEFAULT_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

function motionVars(el) {
  const style = getComputedStyle(el);
  const duration = parseFloat(style.getPropertyValue('--motion-reveal')) || DEFAULT_DURATION_MS;
  const easing = style.getPropertyValue('--motion-reveal-ease').trim() || DEFAULT_EASING;
  return { duration, easing };
}

/**
 * Animates `el` from `fromRect` to wherever it naturally ended up after a
 * DOM change, via an inverted transform that eases back to zero. Safe to
 * call unconditionally on every relevant update — no-ops cleanly when
 * nothing actually moved (an `above`/`background`-positioned image, or a
 * block with no media at all), when `fromRect` is missing (first mount), or
 * under `prefers-reduced-motion: reduce` (lands instantly, matching this
 * codebase's existing scroll-into-view convention for "travel" effects —
 * see `ProgressiveDisclosureMixin.js`'s own identical check).
 */
export function playFlip(el, fromRect) {
  if (!el || !fromRect) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const toRect = el.getBoundingClientRect();
  const dx = fromRect.left - toRect.left;
  const dy = fromRect.top - toRect.top;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

  const { duration, easing } = motionVars(el);

  el.style.transition = 'none';
  el.style.transform = `translate(${dx}px, ${dy}px)`;

  requestAnimationFrame(() => {
    el.style.transition = `transform ${duration}ms ${easing}`;
    el.style.transform = 'none';
  });

  // `transitionend` bubbles, and `el` is not a leaf — a descendant with its
  // own `transform` transition at the same duration (e.g. `.cb-focus-group`'s
  // pan/zoom, `blockImageLayout.js`) can fire a same-property `transitionend`
  // that reaches this listener first. `{once:true}` would consume the
  // listener on that unrelated bubbled event and never fire again for the
  // real one, so cleanup is only removed manually, once `event.target === el`
  // is actually seen. The setTimeout is a fallback in case the element is
  // detached (block navigation) before its own transitionend ever fires, so
  // inline styles can't linger forever on a node nothing will clean up
  // otherwise — it also removes the listener, so an eventually-fired but
  // stale event can't double-clean an already-detached element.
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    el.removeEventListener('transitionend', onTransitionEnd);
    el.style.transition = '';
    el.style.transform = '';
  };
  const onTransitionEnd = (e) => {
    if (e.target === el) cleanup();
  };
  el.addEventListener('transitionend', onTransitionEnd);
  setTimeout(cleanup, duration + 50);
}
