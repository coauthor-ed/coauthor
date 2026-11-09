/**
 * celebrate — confetti, XP floats and celebration levels, in one place.
 *
 * Generalized out of LessonSession._fireConfetti(), which hardcoded five hex
 * colors and existed only on that one screen. Every celebration moment in the
 * runtime routes through here so the palette stays tokenized (invariant 9) and
 * reduced-motion is honoured once rather than per call site.
 *
 * canvas-confetti needs resolved color STRINGS - it paints to a canvas, which
 * has no cascade and cannot resolve var(). So the accent tokens are read off
 * the document element at call time, exactly as readSimColors() does for
 * simulations. Read at call time, not module load, so a theme switch is picked
 * up without a reload.
 */

import { LookManager } from '../core/LookManager.js';

const TOKENS = ['--accent-coral', '--accent-amber', '--accent-blue', '--accent-teal', '--accent-violet'];

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function palette() {
  try {
    const cs = getComputedStyle(document.documentElement);
    const out = TOKENS.map((t) => cs.getPropertyValue(t).trim()).filter(Boolean);
    if (out.length) return out;
  } catch { /* no window / detached - fall through */ }
  return ['#ff6b5e', '#ffcf5c', '#57ccff', '#54e6a5', '#ff5ca8'];
}

let confettiPromise = null;
function loadConfetti() {
  // Dynamic import keeps the vendor chunk off the critical path - a hard perf
  // constraint for low-end devices (CLAUDE.md's import-map rule).
  if (!confettiPromise) {
    confettiPromise = import('vendor/confetti/confetti.module.mjs')
      .then((m) => m.default)
      .catch((e) => { console.warn('Confetti failed to load', e); return null; });
  }
  return confettiPromise;
}

/** A burst at a viewport point. x/y in px; omit for centre-ish. */
export async function burst(x, y, opts = {}) {
  if (reduced()) return;
  const confetti = await loadConfetti();
  if (!confetti) return;
  const origin = (x == null || y == null)
    ? { x: 0.5, y: 0.6 }
    : { x: x / window.innerWidth, y: y / window.innerHeight };
  confetti({
    particleCount: 70, spread: 55, startVelocity: 45, ticks: 200,
    colors: palette(), origin, disableForReducedMotion: true, ...opts,
  });
}

/**
 * Celebration intensity.
 *   'small'  a correct answer
 *   'lesson' finishing a lesson
 *   'module' finishing a whole module
 */
export async function celebrate(level = 'small') {
  if (reduced()) return;
  if (level === 'small') return burst(null, null, { particleCount: 40, spread: 45 });
  if (level === 'lesson') {
    await burst(null, null, { particleCount: 120, spread: 80, startVelocity: 55 });
    return;
  }
  // module: two angled cannons, the "big" moment
  const confetti = await loadConfetti();
  if (!confetti) return;
  const colors = palette();
  const common = { particleCount: 90, ticks: 260, colors, disableForReducedMotion: true };
  confetti({ ...common, angle: 60, spread: 70, origin: { x: 0, y: 0.7 } });
  confetti({ ...common, angle: 120, spread: 70, origin: { x: 1, y: 0.7 } });
}

/**
 * Float "+N XP" up from an element. Appends to <body> rather than the element
 * so it is never clipped by an ancestor's overflow, and positions from the
 * element's viewport rect.
 *
 * theme.css defines .xp-float and @keyframes xpFloatFade, but those are
 * light-DOM globals - unreachable from inside any plugin's shadow root. Since
 * this mounts into <body>, the global class is exactly the right mechanism here.
 */
export function xpFloat(el, points) {
  if (!LookManager.gamificationVisible()) return;
  if (reduced() || !el || !points) return;
  let rect;
  try { rect = el.getBoundingClientRect(); } catch { return; }
  const n = document.createElement('div');
  n.className = 'xp-float';
  n.textContent = `+${points} XP`;
  n.style.left = `${rect.left + rect.width / 2}px`;
  n.style.top = `${rect.top}px`;
  n.style.position = 'fixed';
  n.style.zIndex = '600';
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 1300);
}
