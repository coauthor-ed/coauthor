/**
 * SimFind - the find seam: every kit celebration ends here (SimScene.celebrate,
 * GeoScene.celebrate, SvgScene.celebrate, burst, the arcade and board wins). A scene
 * says "the learner found it"; it draws a small ring and a pop at the thing found,
 * then tells the host, and the active look decides what the learner sees next. No
 * confetti: docs/sprints/wip/quill-look-pack-and-celebrations-2026-10-30.md, step P2.
 *
 * The profile's `celebration` (kit/looks/<id>.js) picks how much of that happens:
 *   'quill'  ring, pop, then the cue    'tick'  ring only, no cue    'none'  nothing
 * Reduced motion: the ring still and fading, no pop; the cue still goes.
 *
 *   burst(host, n, at)          the DOM find. n is ignored (old callers pass it). The
 *                               anchor is `at` (an Element, or { el } or { x, y } in viewport
 *                               px, plus any of the cue's { key, lookAt, small, quiet }), else a
 *                               [data-sim-found] element inside host, else where the learner just
 *                               acted inside host (last pointer press or release, or key press, in
 *                               the last 2 s), else the focused element inside host, else host's
 *                               visible centre. An element pops itself; a bare point pops a star.
 *                               On the casefile setting (a [data-sim-setting="casefile"] ancestor) the
 *                               find is a stamp instead: a rotated outlined word, at.stamp (default
 *                               CONFIRMED), in --sim-annot and the mono face; it rests, then fades.
 *   SIM_FIND_CSS                burst's CSS (in SIM_LOOK_DOM_CSS and KEY_CSS already)
 *   findMode()                  'quill' | 'tick' | 'none'
 *   emitFind(cue)               cue:found { x, y, host, thing, key?, lookAt?, small? } ('quill' only).
 *                               cue.thing: { el?, state?, vague? }, what a repeat is told apart by.
 *   emitSolved(cue)             cue:game-solved, for a game won in a scene
 *   canvasPoint(scene, x, y)    design px to viewport px on a canvas scene
 *   stagePoint(el, x, y, w, h)  stage px to viewport px on any element w x h stage px big
 *
 * Emitting with no listener does nothing, so the kit harness needs no reactor. Cue names
 * and payloads: src/core/cues.js (the kit copy ships EventBus only).
 */
import { EventBus } from '../../../core/EventBus.js';
import { lookOf } from './lookProfile.js';

const LIFE_MS = 1100;        // the DOM ring's layer is gone by then, animated or not
const STAMP_MS = 2900;       // a stamp rests longer: it is the verdict
const RING_R = 60;           // burst's ring radius, px
const SPARKS = 6;
const ACTION_MS = 2000;      // an older learner action says nothing about this find
const BOARD_MIN = 5;         // this many elements with one data attribute are a board of things

const stillMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function findMode() {
  const m = lookOf().celebration;
  return m === 'tick' || m === 'none' ? m : 'quill';
}

const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export function emitFind({ x, y, host, thing, key, lookAt, small }) {
  if (findMode() !== 'quill' || !Number.isFinite(x) || !Number.isFinite(y)) return;
  // Stage px, so a page scrolled between two taps is still the same place. The host marks its
  // beat (content-block); a scene with no beats has none, and the whole mount is one beat.
  const r = rectOf(host);
  const local = Number.isFinite(r.left) ? { x: x - r.left, y: y - r.top } : { x, y };
  EventBus.emit('cue:found', defined({ x, y, host, key, lookAt, small, thing: { ...thing, ...local, beat: host?.dataset?.simBeat } }));
}

export function emitSolved(cue) {
  if (findMode() === 'quill') EventBus.emit('cue:game-solved', cue);
}

// The node test harness has elements with no layout: a find there has no position, and no cue.
const rectOf = (el) => el?.getBoundingClientRect?.() ?? { left: NaN, top: NaN, right: NaN, bottom: NaN, width: NaN, height: NaN };

export function stagePoint(el, x, y, w, h) {
  const r = rectOf(el);
  return { x: r.left + x * (r.width / (w || r.width || 1)), y: r.top + y * (r.height / (h || r.height || 1)) };
}

export function canvasPoint(scene, x, y) {
  const C = scene.constructor;
  return stagePoint(scene._canvas, x, y, C.WIDTH, C.HEIGHT);
}

/** The mounted scene around el: a DOM scene's container, else el itself. */
function sceneHostOf(el) {
  return el.closest?.('.sim-dom-root')?.parentElement?.parentElement ?? el;
}

/** The middle of what shows of host, in viewport px. */
function visibleCentre(box) {
  const left = Math.max(box.left, 0), right = Math.min(box.right, globalThis.innerWidth ?? box.right);
  const top = Math.max(box.top, 0), bottom = Math.min(box.bottom, globalThis.innerHeight ?? box.bottom);
  if (!(right > left && bottom > top)) return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Which thing inside host an action landed on: the nearest element on its path that names
 *  itself (a data attribute) or is a control, so tapping a desk's icon or its edge is one desk. */
function actionThing(host) {
  const path = lastAction?.path ?? [];
  const inside = path.slice(0, Math.max(path.indexOf(host), 0)).filter((e) => e.nodeType === 1);
  return inside.find((e) => Object.keys(e.dataset ?? {}).length || /^(button|a|label|input|select)$/i.test(e.localName)) ?? inside[0] ?? null;
}

/** One of many things the scene names alike (40 desks, not a Check button or four answers). Such a
 *  thing is itself however the rest of the scene has moved on, so no state goes with it. */
function boardThing(el, root) {
  for (const name of el?.getAttributeNames?.() ?? []) {
    if (name.startsWith('data-') && el.getAttribute(name) && root.querySelectorAll?.(`[${name}]`).length >= BOARD_MIN) return true;
  }
  return false;
}

/** A short signature of what the scene says now: the same control with new words on the scene
 *  (a Check button in the next round) is a new find. Nothing for a thing on a board. */
function stateOf(host, el) {
  const root = host.closest?.('.sim-dom-root') ?? host;
  if (boardThing(el, root)) return undefined;
  const text = root.textContent ?? '';
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (h * 33 + text.charCodeAt(i)) | 0;
  return `${text.length}.${h}`;
}

// Listening has to start before the find it serves, and a scene's host is not known yet
// here, so this watches every action and burst() keeps only one whose path runs through
// its host. Only a point and that path are kept. A key press has no point: its target's
// middle stands in. Key activation also fires a click at 0,0, so click is not used.
let lastAction = null;       // { t, x, y, path }

function noteAction(e) {
  const path = e.composedPath();
  let { clientX: x, clientY: y } = e;
  if (e.type === 'keydown') {
    const r = rectOf(path[0]);
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  }
  lastAction = { t: performance.now(), x, y, path };
}
for (const type of ['pointerdown', 'pointerup', 'keydown']) {
  globalThis.addEventListener?.(type, noteAction, { capture: true, passive: true });
}

/** Where the learner just acted inside host, kept to its box (a drag can end outside). */
function actionPoint(host, box) {
  const a = lastAction;
  if (!a || performance.now() - a.t > ACTION_MS || !a.path.includes(host)) return null;
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return null;
  return { x: clamp(a.x, box.left, box.right), y: clamp(a.y, box.top, box.bottom) };
}

/** The middle of the focused element, when it is inside host (host's own root holds the answer). */
function focusPoint(host) {
  const el = host.getRootNode?.().activeElement;
  if (!el || el === host || !host.contains(el)) return null;
  const r = rectOf(el);
  return r.width > 0 && r.height > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

const TICK_SVG = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 16.5 14 21 22.5 11.5"/></svg>';
const SPARK_COLOURS = ['var(--sim-warning)', 'var(--sim-series-1)', 'var(--sim-series-4)'];

export const SIM_FIND_CSS = `
.sl-burst { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 6; }
.sl-find-tick {
  position: absolute; width: 32px; height: 32px; margin: -16px 0 0 -16px;
  border: 1.5px solid var(--sim-good); border-radius: 50%; background: var(--sim-bg-surface); color: var(--sim-good);
  animation: sl-find-fade 0.3s ease-in 0.6s forwards;
}
.sl-find-tick svg { display: block; width: 100%; height: 100%; }
.sl-find-ring, .sl-find-pop, .sl-find-spark { position: absolute; display: block; box-sizing: border-box; }
.sl-find-ring {
  width: ${RING_R * 2}px; height: ${RING_R * 2}px; margin: -${RING_R}px 0 0 -${RING_R}px;
  border: 7px solid var(--sim-good); border-radius: 50%;
  animation: sl-find-ring 0.6s ease-out both;
}
.sl-find-ring--still { animation: sl-find-fade 0.9s ease-in both; }
.sl-find-pop {
  width: 64px; height: 64px; margin: -32px 0 0 -32px; background: var(--sim-warning);
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
  animation: sl-find-pop var(--sl-pop, 0.35s) var(--look-spring) both, sl-find-fade 0.4s ease-in 0.3s forwards;
}
.sl-find-spark {
  width: 18px; height: 18px; margin: -9px 0 0 -9px; background: var(--c);
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
  animation: sl-find-spark 0.7s ease-out both;
}
.sl-find-stamp {
  position: absolute; transform: translate(-50%, -50%) rotate(-8deg); white-space: nowrap;
  padding: 5px 11px 4px; border: 2.5px solid var(--sim-annot); border-radius: 4px;
  outline: 1px solid var(--sim-annot); outline-offset: -6px;
  color: var(--sim-annot); background: color-mix(in srgb, var(--sim-annot) 7%, transparent);
  font: 700 18px/1.1 var(--sim-font-mono, monospace); letter-spacing: 0.12em;
  animation: sl-find-stamp 0.18s ease-out both, sl-find-fade 0.5s ease-in 2.3s forwards;
}
.sl-find-stamp--still { animation: sl-find-fade 0.5s ease-in 2.3s forwards; }
@keyframes sl-find-stamp { from { transform: translate(-50%, -50%) rotate(-8deg) scale(1.25); opacity: 0; } }
@keyframes sl-find-ring { from { transform: scale(0.25); opacity: 1; } to { transform: scale(1); opacity: 0; } }
@keyframes sl-find-pop { from { transform: scale(0.3); } to { transform: scale(1); } }
@keyframes sl-find-fade { to { opacity: 0; } }
@keyframes sl-find-spark {
  from { transform: translate(0, 0) scale(0.4); opacity: 1; }
  to { transform: translate(var(--dx), var(--dy)) scale(1); opacity: 0; }
}
`;

/** One find inside `host` (see the header). No timers to clear: the layer removes itself. */
export function burst(host, n = 28, at = null) {
  if (!host) return;
  const mode = findMode();
  if (mode === 'none') return;
  const look = lookOf();
  const still = stillMotion();
  const a = at?.nodeType === 1 ? { el: at } : (at ?? {});
  const target = a.el ?? host.querySelector?.('[data-sim-found]') ?? null;
  // The layer is position:absolute; inset:0 inside its host, so a static host would give it a zero-height box.
  if (globalThis.getComputedStyle?.(host)?.position === 'static') host.style.position = 'relative';
  const box = rectOf(host);
  let p;
  let found = target;
  if (Number.isFinite(a.x) && Number.isFinite(a.y)) p = { x: a.x, y: a.y };
  else if (target) { const r = rectOf(target); p = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  else {
    p = actionPoint(host, box);
    if (p) found = actionThing(host);
    else if ((p = focusPoint(host))) found = host.getRootNode().activeElement;
  }
  const vague = !p;
  p ??= visibleCentre(box);
  const scale = box.width / (host.offsetWidth || box.width || 1) || 1;   // a DOM scene is CSS-scaled to fit
  const left = Math.round((p.x - box.left) / scale), top = Math.round((p.y - box.top) / scale);
  const place = `left:${left}px;top:${top}px`;
  const casefile = host.closest?.('[data-sim-setting]')?.dataset?.simSetting === 'casefile';
  const word = String(a.stamp || 'CONFIRMED').toUpperCase().replace(/[<>&"]/g, '');
  let html = casefile ? `<i class="sl-find-stamp${still ? ' sl-find-stamp--still' : ''}" style="${place}">${word}</i>`
    : mode === 'tick' ? `<i class="sl-find-tick" style="${place}">${TICK_SVG}</i>`
    : `<i class="sl-find-ring${still ? ' sl-find-ring--still' : ''}" style="${place}"></i>`;
  if (mode === 'quill' && !still && !casefile) {
    if (target) target.animate?.([{ scale: 1 }, { scale: look.findPop }, { scale: 1 }], { duration: look.popS * 1000, easing: 'ease-out' });
    else html += `<i class="sl-find-pop" style="${place};--sl-pop:${look.popS}s"></i>`;
    if (look.popSparkles) {
      for (let i = 0; i < SPARKS; i++) {
        const t = (i / SPARKS) * Math.PI * 2 + Math.random() * 0.5, d = 56 + Math.random() * 26;
        html += `<i class="sl-find-spark" style="${place};--c:${SPARK_COLOURS[i % SPARK_COLOURS.length]};--dx:${Math.round(Math.cos(t) * d)}px;--dy:${Math.round(Math.sin(t) * d)}px"></i>`;
      }
    }
  }
  const el = document.createElement('div');
  el.className = 'sl-burst';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = html;
  host.appendChild(el);
  setTimeout(() => el.remove(), casefile ? STAMP_MS : LIFE_MS);
  if (!a.quiet) emitFind({ ...p, host: sceneHostOf(host), thing: { el: found, state: stateOf(host, found), vague: vague || undefined }, key: a.key, lookAt: a.lookAt, small: a.small });
}
