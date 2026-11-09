import { LitElement, html, svg, css } from 'lit';
import { BRAND_DEFS, quillFull, brandPaint } from './components/brandSvg.js';

/**
 * turnPage(update, { dir }) — Quill turns the page.
 *
 * The whole screen becomes a sheet of paper: Quill climbs up out of the
 * bottom edge holding the corner, pulls it up and over, jumps and flings it,
 * and the old page flops across to show the new one underneath. He lands,
 * cheers, and hops away. dir 1 turns forwards (right to left); -1 turns
 * back, mirrored.
 *
 * How: a same-document View Transition. `update` runs inside it, so the old
 * page is a frozen snapshot (::view-transition-old(root)) laid over the live
 * new page. A clip-path on that snapshot removes the folded-back part, and
 * <quill-page-turn> (its own view-transition-name, so it paints above both)
 * draws the back of the page, the shadows and Quill. The clip is a WAAPI
 * animation on the pseudo-element; it keeps the transition alive for its
 * length and is the clock the overlay reads, so the drawing and the fold
 * cannot drift apart.
 *
 * Without View Transitions, with reduced motion, or while a turn is already
 * running, `update` just runs. canTurnPage() says which will happen.
 *
 * Novelty: the full show is for when it is still a treat. Every turn adds to
 * a "seen it" score that halves every 15 minutes (see turnPlan): a fresh
 * learner gets the whole 1.1 s show, steady use speeds Quill up, heavy use
 * leaves a quick curl without him, and a burst of clicking turns it off until
 * they have had a break. Clicks in quick succession count double. A small
 * floor grows with every turn ever seen, so the show slowly gets brisker over
 * weeks too. weight lets a caller count its turns for less (story slides).
 */

const TURN_MS = 1100;   // the page itself
const END_MS = 1650;    // Quill's landing, cheer and exit
const HAND = [239, 112]; // tip of Quill's right flipper raised to -100deg, in quillShapes units
const FEET = [120, 276];

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let busy = false;

// ---- novelty --------------------------------------------------------------

const NOVELTY_KEY = 'coauthor.pageTurn.novelty';
const HALF_LIFE_MS = 15 * 60 * 1000;
const RUSH_MS = 4000;      // a turn this soon after the last counts double
const SCORE_CAP = 24;      // so a long binge never needs more than ~40 min to recover
let memo = null;           // used when storage is unavailable (private window)

function readNovelty() {
  try {
    const v = JSON.parse(localStorage.getItem(NOVELTY_KEY));
    if (v && Number.isFinite(v.score) && Number.isFinite(v.at)) return { total: 0, ...v };
  } catch { /* fall through */ }
  return memo || { score: 0, at: 0, total: 0 };
}

function writeNovelty(v) {
  memo = v;
  try { localStorage.setItem(NOVELTY_KEY, JSON.stringify(v)); } catch { /* memo only */ }
}

const recentScore = (v, now) => v.score * Math.pow(0.5, Math.max(0, now - v.at) / HALF_LIFE_MS);

/**
 * What the next turn will look like: { tier, speed, quill }.
 *   full   (seen it < 4)   the whole show, speed 1
 *   brisk  (4 to 12)       Quill still turns it, up to 1.8x faster
 *   flick  (12 to 20)      a quick curl without Quill, 2.4x
 *   off    (20 and over)   the page just changes
 */
export function turnPlan(now = Date.now()) {
  const v = readNovelty();
  const seen = recentScore(v, now) + Math.min(6, v.total / 40);
  if (seen < 4) return { tier: 'full', speed: 1, quill: true };
  if (seen < 12) return { tier: 'brisk', speed: 1 + ((seen - 4) / 8) * 0.8, quill: true };
  if (seen < 20) return { tier: 'flick', speed: 2.4, quill: false };
  return { tier: 'off', speed: 0, quill: false };
}

function noteTurn(weight, now) {
  const v = readNovelty();
  const add = weight * (now - v.at < RUSH_MS ? 2 : 1);
  writeNovelty({ score: Math.min(SCORE_CAP, recentScore(v, now) + add), at: now, total: v.total + weight });
}

export const canTurnPage = () =>
  typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
  && !reduced() && !busy && document.visibilityState !== 'hidden';

// Page-level rules for the transition's pseudo-elements, scoped to our own
// turns by the class on <html>. A constructed sheet, so no inline <style>.
let sheet = null;
function ensureSheet() {
  if (sheet || typeof CSSStyleSheet === 'undefined') return;
  sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    :root.quill-turning::view-transition-group(root),
    :root.quill-turning::view-transition-new(root),
    :root.quill-turning::view-transition-old(root),
    :root.quill-turning::view-transition-group(quill-page-turn),
    :root.quill-turning::view-transition-new(quill-page-turn) { animation: none; }
    :root.quill-turning::view-transition-old(root) { z-index: 1; }
    :root.quill-turning::view-transition-old(quill-page-turn) { display: none; }
  `);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

export async function turnPage(update, { dir = 1, weight = 1 } = {}) {
  if (!canTurnPage()) { await update(); return false; }
  const now = Date.now();
  const plan = turnPlan(now);
  noteTurn(weight, now);
  if (plan.tier === 'off') { await update(); return false; }
  busy = true;
  ensureSheet();
  document.querySelectorAll('quill-page-turn').forEach((n) => n.remove());
  const root = document.documentElement;
  root.classList.add('quill-turning');
  let overlay = null, clip = null;
  const vt = document.startViewTransition(async () => {
    await update();
    overlay = document.createElement('quill-page-turn');
    overlay.turnDir = dir < 0 ? -1 : 1;
    overlay.speed = plan.speed;
    overlay.withQuill = plan.quill;
    // Set from the document's scope, not :host: view-transition-name is
    // tree-scoped, and the page-level rules above must match it.
    overlay.style.viewTransitionName = 'quill-page-turn';
    document.body.appendChild(overlay);
    await overlay.updateComplete;
    overlay.prime();
  });
  try {
    await vt.ready;
    overlay.run(clip = root.animate(
      { clipPath: overlay.clipFrames() },
      { duration: TURN_MS / plan.speed, easing: 'linear', fill: 'forwards', pseudoElement: '::view-transition-old(root)' },
    ));
    await vt.finished;
  } catch {
    // Skipped (another transition, a hidden tab): the update still ran.
    overlay?.remove();
  } finally {
    clip?.cancel();   // its pseudo-element is gone; don't leave it in getAnimations()
    root.classList.remove('quill-turning');
    busy = false;
  }
  await vt.updateCallbackDone;   // surfaces an error thrown by `update`
  return true;
}

// ---- geometry -----------------------------------------------------------

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const outQuad = (t) => 1 - (1 - t) * (1 - t);

/** Clip a convex polygon to the half-plane (p - m) . n <= 0. */
function clipHalf(poly, m, n, keepCorner = false) {
  const side = (p) => ((p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1]) * (keepCorner ? -1 : 1);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = side(a), sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const k = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
    }
  }
  return out;
}
const reflect = (p, m, n) => {
  const d = 2 * ((p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1]);
  return [p[0] - d * n[0], p[1] - d * n[1]];
};
const pts = (poly) => poly.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

export class QuillPageTurn extends LitElement {
  static styles = [brandPaint, css`
    :host {
      position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; height: 100lvh;
      z-index: 2147483000; pointer-events: none; contain: layout paint;
    }
    svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; }
    .cast-a { stop-color: var(--page-turn-shadow); }
    .cast-b { stop-color: var(--page-turn-shadow); stop-opacity: 0; }
    .back-a { stop-color: var(--page-turn-paper-lo); }
    .back-b { stop-color: var(--page-turn-paper); }
    .gleam-a { stop-color: var(--page-turn-gleam); stop-opacity: 0; }
    .gleam-b { stop-color: var(--page-turn-gleam); }
    .gleam-c { stop-color: var(--page-turn-gleam); stop-opacity: 0; }
    .drop { fill: var(--page-turn-shadow); opacity: 0.55; }
    .rule { stroke: var(--page-turn-rule); }
    .margin { stroke: var(--page-turn-margin); }
    .joy { stroke: var(--quill-iris); opacity: 0; }
    .shout .joy { opacity: 1; }
    .shout .eye { opacity: 0; }
    .shout .beak-open { opacity: 1; }
    .shout .beak-shut { opacity: 0; }
    .bit { opacity: 0; }
    .f-shadow { display: none; }
    .wing-l { transform-origin: 82% 8%; }
    .wing-r { transform-origin: 18% 8%; }
  `];

  constructor() {
    super();
    this.turnDir = 1;
    this.speed = 1;        // timeline ms per real ms
    this.withQuill = true;
    this._anim = null;
  }

  /** Viewport size and Quill's size; called once the element is laid out. */
  prime() {
    const r = this.getBoundingClientRect();
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.qH = Math.max(110, Math.min(210, Math.min(this.W, this.H) * 0.28));
    this.s = this.qH / 300;
    const $ = (sel) => this.renderRoot.querySelector(sel);
    this._el = {
      svg: $('svg'), cast: $('.cast'), drop: $('.drop'), flap: $('.flap'),
      quill: $('.quill'), body: $('.body'), wingL: $('.wing-l'), wingR: $('.wing-r'),
      pupils: [...this.renderRoot.querySelectorAll('.pupil')], bits: [...this.renderRoot.querySelectorAll('.bit')],
      castG: $('#pt-cast'), backG: $('#pt-back'), gleamG: $('#pt-gleam'), rules: $('#pt-rules'), flapClip: $('#pt-flap-clip polygon'),
    };
    this._el.quill.style.display = this.withQuill ? '' : 'none';
    this._el.svg.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`);
    this._el.rules.setAttribute('width', String(this.W));
    this._el.rules.querySelector('.margin').setAttribute('x1', String(this.W - 64));
    this._el.rules.querySelector('.margin').setAttribute('x2', String(this.W - 64));
    this._draw(0);
  }

  /**
   * The dragged corner over time, in "forward" coordinates (the corner starts
   * bottom-right); null while it still lies flat. Also Quill's pose.
   */
  _pose(t) {
    const { W, H, qH, s } = this;
    const reach = (FEET[1] - HAND[1]) * s;             // hand height above his feet
    const handDx = (HAND[0] - FEET[0]) * s;            // hand x relative to his feet
    const lift = [W - 0.2 * W - 0.3 * qH, H - reach]; // where he stands holding it up
    const jump = [W - 0.3 * W - 0.5 * qH, H - reach - 0.55 * qH - 0.08 * H];
    const end = [-W - 90, H + 30];
    let P, feet, holding = true, shout = false, squash = 0, wingL = 40, wingR = -100;

    if (t < 560) {          // rise out of the bottom edge, lifting the corner
      const k = outBack(seg(t, 40, 560));
      P = [lerp(W, lift[0], k), lerp(H, lift[1], k)];
      feet = [P[0] - handDx, P[1] + reach];
      wingR = lerp(-40, -100, seg(t, 0, 200));
    } else if (t < 720) {   // crouch and spring, flinging it up and over
      const k = seg(t, 560, 720);
      const e = inOut(k);
      P = [lerp(lift[0], jump[0], e), lerp(lift[1], jump[1], e)];
      squash = k < 0.3 ? Math.sin((k / 0.3) * Math.PI) * 0.12 : 0;
      feet = [P[0] - handDx, P[1] + reach];
      wingR = -100 - 14 * Math.sin(k * Math.PI);
    } else {                // let go: the page flops over on its own
      holding = false;
      const k = inOut(seg(t, 720, TURN_MS));
      const c = [jump[0] - 0.25 * W, jump[1] - 0.18 * H];
      const a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, d = k * k;
      P = [a * jump[0] + b * c[0] + d * end[0], a * jump[1] + b * c[1] + d * end[1]];
      // Quill falls back to the floor, lands, cheers, then drops out of view.
      const fx = jump[0] - handDx;
      const fall = seg(t, 720, 900);
      const top = jump[1] + reach;
      feet = [fx - 0.06 * W * outQuad(fall), lerp(top, H, fall * fall)];
      if (t > 900 && t < 1040) squash = Math.sin(seg(t, 900, 1040) * Math.PI) * 0.16;
      if (t >= 1040 && t < 1360) {
        shout = true;
        feet[1] -= Math.sin(seg(t, 1040, 1360) * Math.PI) * 0.35 * qH;
        wingL = 128; wingR = -128;
      } else if (t >= 1360) {
        feet[1] += Math.pow(seg(t, 1400, END_MS), 2) * (qH + 40);
        wingL = 30; wingR = -30;
      } else {
        wingL = lerp(40, 90, fall); wingR = lerp(-150, -60, fall);
      }
      if (t > 1360 && t < 1400) squash = 0.08;
    }
    const flat = Math.hypot(W - P[0], H - P[1]) < 0.5;
    return { P: flat ? null : P, feet, holding, shout, squash, wingL, wingR };
  }

  /** Mirror x for a backwards turn. */
  _mx(p) { return this.turnDir > 0 ? p : [this.W - p[0], p[1]]; }

  /** Old-page polygon (what stays visible) and the fold, in screen space. */
  _fold(P) {
    const { W, H } = this;
    const C = this._mx([W, H]);
    const Q = this._mx(P);
    const m = [(C[0] + Q[0]) / 2, (C[1] + Q[1]) / 2];
    const len = Math.hypot(C[0] - Q[0], C[1] - Q[1]);
    const n = [(C[0] - Q[0]) / len, (C[1] - Q[1]) / len];
    const rect = [[0, 0], [W, 0], [W, H], [0, H]];
    return { m, n, len, keep: clipHalf(rect, m, n), gone: clipHalf(rect, m, n, true) };
  }

  /** clip-path keyframes for the old page, one per ~16 ms of real time. */
  clipFrames() {
    const steps = Math.ceil(TURN_MS / this.speed / 16);
    const frames = [];
    for (let i = 0; i <= steps; i++) {
      const { P } = this._pose((i / steps) * TURN_MS);
      let poly = [[0, 0], [this.W, 0], [this.W, this.H], [0, this.H]];
      if (P) poly = this._fold(P).keep;
      if (!poly.length) poly = [[0, 0], [0, 0], [0, 0]];
      while (poly.length < 6) poly.push(poly[poly.length - 1]);
      frames.push(`polygon(${poly.map((p) => `${(p[0] / this.W * 100).toFixed(3)}% ${(p[1] / this.H * 100).toFixed(3)}%`).join(', ')})`);
    }
    return frames;
  }

  run(anim) {
    this._anim = anim;
    this._t0 = performance.now();
    const tick = () => {
      if (!this.isConnected) return;
      const a = this._anim;
      const live = a && (a.playState === 'running' || a.playState === 'paused');
      // Real ms to timeline ms: the poses are written for the full-speed show.
      const t = this.speed * (live ? Number(a.currentTime) || 0 : Math.max(TURN_MS / this.speed, performance.now() - this._t0));
      this._draw(t);
      if (t >= (this.withQuill ? END_MS : TURN_MS)) { this.remove(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  _draw(t) {
    const E = this._el;
    if (!E) return;
    const pose = this._pose(t);
    const set = (el, a) => { for (const k in a) el.setAttribute(k, a[k]); };

    if (pose.P) {
      const { m, n, len, gone } = this._fold(pose.P);
      const flap = gone.map((p) => reflect(p, m, n));
      const shadowLen = Math.min(this.W, this.H) * 0.14;
      set(E.cast, { points: pts(gone) });
      set(E.castG, { x1: m[0], y1: m[1], x2: m[0] + n[0] * shadowLen, y2: m[1] + n[1] * shadowLen });
      set(E.flap, { points: pts(flap) });
      set(E.flapClip, { points: pts(flap) });
      set(E.drop, { points: pts(flap.map((p) => [p[0] + 5, p[1] + 9])) });
      const depth = Math.max(40, len / 2);
      set(E.backG, { x1: m[0], y1: m[1], x2: m[0] - n[0] * depth, y2: m[1] - n[1] * depth });
      set(E.gleamG, { x1: m[0], y1: m[1], x2: m[0] - n[0] * depth, y2: m[1] - n[1] * depth });
      // Ruled lines on the back sit where they were on the page, reflected.
      const a = 1 - 2 * n[0] * n[0], b = -2 * n[0] * n[1], d = 1 - 2 * n[1] * n[1];
      const k = 2 * (m[0] * n[0] + m[1] * n[1]);
      set(E.rules, { patternTransform: `matrix(${a} ${b} ${b} ${d} ${k * n[0]} ${k * n[1]})` });
    } else {
      for (const el of [E.cast, E.flap, E.drop, E.flapClip]) el.setAttribute('points', '');
    }

    // Quill: feet at pose.feet, mirrored for a backwards turn.
    const [fx, fy] = this._mx(pose.feet);
    const sx = this.s * this.turnDir * (1 + pose.squash), sy = this.s * (1 - pose.squash);
    E.quill.setAttribute('transform', `translate(${fx.toFixed(1)} ${fy.toFixed(1)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-FEET[0]} ${-FEET[1]})`);
    E.wingL.style.transform = `rotate(${pose.wingL}deg)`;
    E.wingR.style.transform = `rotate(${pose.wingR}deg)`;
    E.body.classList.toggle('shout', pose.shout || (t > 560 && t < 760));
    const look = pose.holding ? [5, -5] : pose.shout ? [0, 0] : [-6, 2];
    E.pupils.forEach((p) => { p.style.transform = `translate(${look[0]}px, ${look[1]}px)`; });

    // A pop of confetti when he cheers.
    const kb = seg(t, 1040, 1500);
    E.bits.forEach((bit, i) => {
      if (kb <= 0 || kb >= 1) { bit.style.opacity = '0'; return; }
      const ang = (-160 + (i * 140) / (E.bits.length - 1)) * Math.PI / 180;
      const r = (150 + (i % 3) * 45) * outQuad(kb);
      const x = 120 + Math.cos(ang) * r, y = 120 + Math.sin(ang) * r + kb * kb * 80;
      bit.style.opacity = String(kb < 0.7 ? 1 : (1 - kb) / 0.3);
      bit.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(kb * (i % 2 ? 400 : -360)).toFixed(0)})`);
    });
  }

  render() {
    const bitColours = ['--accent-blue', '--accent-gold', '--quill-scarf', '--accent-teal', '--accent-violet', '--accent-coral', '--quill-feather', '--accent-blue'];
    return html`
      <svg aria-hidden="true" preserveAspectRatio="none">
        ${BRAND_DEFS}
        <defs>
          <linearGradient id="pt-cast" gradientUnits="userSpaceOnUse"><stop offset="0" class="cast-a"/><stop offset="1" class="cast-b"/></linearGradient>
          <linearGradient id="pt-back" gradientUnits="userSpaceOnUse"><stop offset="0" class="back-a"/><stop offset=".45" class="back-b"/></linearGradient>
          <linearGradient id="pt-gleam" gradientUnits="userSpaceOnUse">
            <stop offset=".04" class="gleam-a"/><stop offset=".14" class="gleam-b"/><stop offset=".3" class="gleam-c"/>
          </linearGradient>
          <pattern id="pt-rules" patternUnits="userSpaceOnUse" x="0" y="0" width="100" height="34">
            <line class="rule" x1="0" y1="33" x2="100000" y2="33" stroke-width="1.5"/>
            <line class="margin" x1="0" y1="0" x2="0" y2="34" stroke-width="2"/>
          </pattern>
          <clipPath id="pt-flap-clip"><polygon/></clipPath>
        </defs>
        <polygon class="cast" fill="url(#pt-cast)"/>
        <polygon class="drop"/>
        <polygon class="flap" fill="url(#pt-back)"/>
        <rect clip-path="url(#pt-flap-clip)" x="-200%" y="-200%" width="500%" height="500%" fill="url(#pt-rules)"/>
        <rect clip-path="url(#pt-flap-clip)" x="-200%" y="-200%" width="500%" height="500%" fill="url(#pt-gleam)"/>
        <g class="quill"><g class="body">
          ${quillFull()}
          <path class="joy" d="M84 112Q100 86 116 112M124 112Q140 86 156 112" stroke-width="7" stroke-linecap="round" fill="none"/>
          ${bitColours.map((c, i) => (i % 2
            ? svg`<g class="bit"><rect x="-15" y="-8" width="30" height="16" rx="4" style="fill: var(${c})"/></g>`
            : svg`<g class="bit"><path d="M0-20L5-5 20 0 5 5 0 20-5 5-20 0-5-5Z" style="fill: var(${c})"/></g>`))}
        </g></g>
      </svg>`;
  }
}

customElements.define('quill-page-turn', QuillPageTurn);
