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
 * How: a same-document View Transition. `update` runs inside it; the old
 * page is a frozen snapshot (::view-transition-group(root)) laid over the
 * new page, which is captured under its own name (quill-page-new) so the two
 * can be moved separately. <quill-page-turn> (its own view-transition-name,
 * so it paints above both) draws the back of the page, the shadows and Quill.
 *
 * Smooth on phones: nothing is redrawn per frame. Every pose is worked out
 * up front and handed to the browser as WAAPI transform/opacity keyframes,
 * which the compositor (GPU) plays even while the new page is still busy on
 * the main thread. The fold is a straight crease, so "the old page minus the
 * folded corner" is a half-plane: the snapshot sits in a big box rotated onto
 * the crease with overflow: clip, and counter-rotated inside it so it stays
 * put. The back of the page is a paper sheet mirrored across the crease in
 * the same kind of box. Only Quill's wings, eyes and confetti are SVG
 * animations (a small layer).
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
// --qpt-box / --qpt-w / --qpt-h are set on <html> by the overlay (prime()).
let sheet = null;
function ensureSheet() {
  if (sheet || typeof CSSStyleSheet === 'undefined') return;
  sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    :root.quill-turning-new { view-transition-name: quill-page-new; }
    :root.quill-turning::view-transition-group(*),
    :root.quill-turning::view-transition-image-pair(*),
    :root.quill-turning::view-transition-old(*),
    :root.quill-turning::view-transition-new(*) { animation: none; mix-blend-mode: normal; }
    :root.quill-turning::view-transition-group(quill-page-new) { z-index: 0; }
    :root.quill-turning::view-transition-group(root) {
      z-index: 1; transform-origin: 0 0; overflow: clip;
      width: var(--qpt-box); height: var(--qpt-box);
    }
    :root.quill-turning::view-transition-image-pair(root) {
      transform-origin: 0 0; inset: auto; left: 0; top: 0; width: var(--qpt-w); height: var(--qpt-h);
    }
    :root.quill-turning::view-transition-group(quill-page-turn) { z-index: 2; }
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
  let overlay = null, anims = [];
  const vt = document.startViewTransition(async () => {
    await update();
    // The new page is captured under its own name, so the old one (root)
    // can be clipped and moved on its own.
    root.classList.add('quill-turning-new');
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
    anims = overlay.run();
    await vt.finished;
  } catch {
    // Skipped (another transition, a hidden tab): the update still ran.
    overlay?.remove();
  } finally {
    // The pseudo-elements are gone; don't leave their animations in getAnimations().
    anims.forEach((a) => a.cancel());
    root.classList.remove('quill-turning', 'quill-turning-new');
    for (const k of ['--qpt-box', '--qpt-w', '--qpt-h']) root.style.removeProperty(k);
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

const deg = (r) => r * 180 / Math.PI;
const f1 = (v) => v.toFixed(1);
const f3 = (v) => v.toFixed(3);

export class QuillPageTurn extends LitElement {
  static styles = [brandPaint, css`
    :host {
      position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; height: 100lvh;
      z-index: 2147483000; pointer-events: none; contain: strict; overflow: hidden;
    }
    .clip, .cast, .sheet, .shade, .quill { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
    .clip { overflow: clip; }
    .sheet { overflow: clip; }
    .rules { position: absolute; inset: 0; }
    .flap { background: var(--page-turn-paper); }
    .drop-clip { opacity: 0.55; }
    .drop { background: var(--page-turn-shadow); }
    .cast { background: linear-gradient(to top, var(--page-turn-shadow), transparent); }
    .back { background: linear-gradient(to bottom, var(--page-turn-paper-lo), var(--page-turn-paper) 45%); }
    .gleam { background: linear-gradient(to bottom, transparent 4%, var(--page-turn-gleam) 14%, transparent 30%); }
    .rules {
      background:
        linear-gradient(to right, transparent calc(100% - 65px), var(--page-turn-margin) calc(100% - 65px) calc(100% - 63px), transparent calc(100% - 63px)),
        repeating-linear-gradient(to bottom, transparent 0 32.25px, var(--page-turn-rule) 32.25px 33.75px, transparent 33.75px 34px);
    }
    .quill { width: 0; height: 0; }
    .quill svg { position: absolute; left: -320px; top: -496px; width: 640px; height: 720px; overflow: visible; }
    .joy { stroke: var(--quill-iris); opacity: 0; }
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
  }

  /** Viewport size and Quill's size; called once the element is laid out. */
  prime() {
    const r = this.getBoundingClientRect();
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.qH = Math.max(110, Math.min(210, Math.min(this.W, this.H) * 0.28));
    this.s = this.qH / 300;
    // The clip boxes reach this far along and across the crease from its
    // midpoint, which is always within reach of the screen.
    this.L = Math.ceil(1.2 * (this.W + this.H));
    this.D = Math.ceil(Math.hypot(this.W, this.H));   // half-width of the shading strips
    this.sl = Math.min(this.W, this.H) * 0.14;          // cast shadow length
    const root = document.documentElement.style;
    root.setProperty('--qpt-box', `${2 * this.L}px`);
    root.setProperty('--qpt-w', `${this.W}px`);
    root.setProperty('--qpt-h', `${this.H}px`);
    const $ = (sel) => this.renderRoot.querySelector(sel);
    const size = (el, w, h) => { el.style.width = `${w}px`; el.style.height = `${h}px`; };
    for (const el of this.renderRoot.querySelectorAll('.clip')) size(el, 2 * this.L, 2 * this.L);
    for (const el of this.renderRoot.querySelectorAll('.sheet')) size(el, this.W, this.H);
    for (const el of this.renderRoot.querySelectorAll('.shade')) size(el, 2 * this.D, 100);
    size($('.cast'), 2 * this.D, this.sl);
    $('.quill').style.display = this.withQuill ? '' : 'none';
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

  /** The crease for a corner position P: midpoint m, unit normal n (towards the corner), screen space. */
  _fold(P) {
    const C = this._mx([this.W, this.H]);
    const Q = this._mx(P);
    const len = Math.max(1e-6, Math.hypot(C[0] - Q[0], C[1] - Q[1]));
    const n = [(C[0] - Q[0]) / len, (C[1] - Q[1]) / len];
    return { m: [(C[0] + Q[0]) / 2, (C[1] + Q[1]) / 2], n, len, C };
  }

  /**
   * Timeline samples, one per ~16 ms of real time, each with its pose and
   * crease. While the page still lies flat the crease sits just past the
   * corner, facing the way it will first lift, so nothing shows.
   */
  _samples(total) {
    const steps = Math.max(2, Math.ceil(total / this.speed / 16));
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * total;
      out.push({ t, pose: this._pose(t) });
    }
    let first = null;
    for (let t = 0; t <= TURN_MS && !first; t += 4) { const { P } = this._pose(t); if (P) first = this._fold(P); }
    let prev = null;
    for (const smp of out) {
      const f = smp.pose.P ? this._fold(smp.pose.P)
        : { ...first, m: [first.C[0] + first.n[0] * 20, first.C[1] + first.n[1] * 20], len: 0 };
      // Rotation that turns the box's +y axis onto -n (the kept side), unwrapped.
      let phi = deg(Math.atan2(f.n[0], -f.n[1]));
      if (prev !== null) phi += 360 * Math.round((prev - phi) / 360);
      prev = phi;
      smp.fold = { ...f, phi, flat: !smp.pose.P };
    }
    return out;
  }

  /**
   * Start the show: WAAPI keyframes for the old page's pseudo-elements and
   * for the overlay. Returns the page animations (they keep the view
   * transition alive); the overlay takes itself away when Quill is done.
   *
   * Geometry, with G = translate(m) rotate(phi) translate(-L, 0): a .clip box
   * under G has the crease along its top edge and the kept side inside it.
   * The snapshot (and the paper sheets) get G's inverse, so they stay where
   * they were on screen; a sheet with scale(1, -1) in front of that inverse
   * is the page mirrored across the crease, which is the back of the flap.
   * Every transform is the same list of functions in every keyframe, so the
   * browser interpolates them part by part and G and its inverse stay exact
   * inverses between keyframes too.
   */
  run() {
    const { L, D, sl } = this;
    const total = this.withQuill ? END_MS : TURN_MS;
    const page = this._samples(TURN_MS);
    const all = this._samples(total);
    const G = ({ m, phi }, dx = 0, dy = 0, tail = `translate(${-L}px, 0px)`) =>
      `translate(${f1(m[0] + dx)}px, ${f1(m[1] + dy)}px) rotate(${f3(phi)}deg) ${tail}`;
    const Ginv = ({ m, phi }, head = '') =>
      `${head}translate(${L}px, 0px) rotate(${f3(-phi)}deg) translate(${f1(-m[0])}px, ${f1(-m[1])}px)`;
    // Shading strips on the back of the flap, in the sheet's (mirrored) space:
    // they run along the crease and reach depth into the flap.
    const shade = (f) => G(f, 0, 0, `translate(${-D}px, 0px) scale(1, ${f3(-Math.max(40, f.len / 2) / 100)})`);

    const rootEl = document.documentElement;
    const pageOpts = { duration: TURN_MS / this.speed, easing: 'linear', fill: 'forwards' };
    const pageAnims = [
      rootEl.animate({ transform: page.map((p) => G(p.fold)) }, { ...pageOpts, pseudoElement: '::view-transition-group(root)' }),
      rootEl.animate({ transform: page.map((p) => Ginv(p.fold)) }, { ...pageOpts, pseudoElement: '::view-transition-image-pair(root)' }),
    ];

    const opts = { duration: total / this.speed, easing: 'linear', fill: 'forwards' };
    const $ = (sel) => this.renderRoot.querySelector(sel);
    const $$ = (sel) => [...this.renderRoot.querySelectorAll(sel)];
    const mine = [];
    const anim = (el, frames) => { mine.push(el.animate(frames, opts)); };
    anim($('.cast'), {
      transform: all.map((p) => G(p.fold, 0, 0, `translate(${-D}px, ${f1(-sl)}px)`)),
      opacity: all.map((p) => (p.fold.flat ? 0 : 1)),
    });
    anim($('.drop-clip'), { transform: all.map((p) => G(p.fold, 5, 9)) });
    anim($('.flap-clip'), { transform: all.map((p) => G(p.fold)) });
    for (const el of $$('.sheet')) anim(el, { transform: all.map((p) => Ginv(p.fold, 'scale(1, -1) ')) });
    for (const el of $$('.shade')) anim(el, { transform: all.map((p) => shade(p.fold)) });

    if (this.withQuill) {
      const poses = all.map((p) => p.pose);
      // Quill: feet at pose.feet, mirrored for a backwards turn.
      anim($('.quill'), {
        transform: poses.map((q) => {
          const [fx, fy] = this._mx(q.feet);
          return `translate(${f1(fx)}px, ${f1(fy)}px) scale(${(this.s * this.turnDir * (1 + q.squash)).toFixed(4)}, ${(this.s * (1 - q.squash)).toFixed(4)})`;
        }),
      });
      // Wings, eyes and the cheer are SVG, animated on the main thread, so
      // they only animate while they move: one short animation per stretch
      // of change, none while a value holds (an animation waiting out its
      // delay costs nothing per frame).
      const times = all.map((p) => p.t / this.speed);
      const pieces = (el, values) => {
        const keys = values.map((v) => JSON.stringify(v));
        let first = true, a = -1;
        const flush = (b) => {
          el.animate(values.slice(a, b + 1), { delay: times[a], duration: Math.max(1, times[b] - times[a]), easing: 'linear', fill: first ? 'both' : 'forwards' });
          first = false;
        };
        for (let i = 0; i < keys.length - 1; i++) {
          const moving = keys[i] !== keys[i + 1];
          if (moving && a < 0) a = i;
          if (!moving && a >= 0) { flush(i); a = -1; }
        }
        if (a >= 0) flush(keys.length - 1);
        if (first) el.animate([values[0], values[0]], { duration: 1, fill: 'both' });
      };
      pieces($('.wing-l'), poses.map((q) => ({ transform: `rotate(${f1(q.wingL)}deg)` })));
      pieces($('.wing-r'), poses.map((q) => ({ transform: `rotate(${f1(q.wingR)}deg)` })));
      const look = poses.map((q) => (q.holding ? [5, -5] : q.shout ? [0, 0] : [-6, 2]));
      for (const el of $$('.pupil')) pieces(el, look.map(([x, y]) => ({ transform: `translate(${x}px, ${y}px)` })));
      const shout = all.map((p) => p.pose.shout || (p.t > 560 && p.t < 760));
      for (const el of $$('.joy, .beak-open')) pieces(el, shout.map((on) => ({ opacity: on ? 1 : 0 })));
      for (const el of $$('.eye, .beak-shut')) pieces(el, shout.map((on) => ({ opacity: on ? 0 : 1 })));
      // A pop of confetti when he cheers.
      const bits = $$('.bit');
      bits.forEach((bit, i) => {
        const ang = (-160 + (i * 140) / (bits.length - 1)) * Math.PI / 180;
        pieces(bit, all.map(({ t }) => {
          const kb = seg(t, 1040, 1500);
          const r = (150 + (i % 3) * 45) * outQuad(kb);
          const x = 120 + Math.cos(ang) * r, y = 120 + Math.sin(ang) * r + kb * kb * 80;
          return {
            transform: `translate(${f1(x)}px, ${f1(y)}px) rotate(${(kb * (i % 2 ? 400 : -360)).toFixed(0)}deg)`,
            opacity: kb <= 0 || kb >= 1 ? 0 : kb < 0.7 ? 1 : (1 - kb) / 0.3,
          };
        }));
      });
    }
    mine[0].finished.then(() => this.remove(), () => {});
    return pageAnims;
  }

  render() {
    const bitColours = ['--accent-blue', '--accent-gold', '--quill-scarf', '--accent-teal', '--accent-violet', '--accent-coral', '--quill-feather', '--accent-blue'];
    return html`
      <div class="cast"></div>
      <div class="clip drop-clip"><div class="sheet drop"></div></div>
      <div class="clip flap-clip"><div class="sheet flap">
        <div class="shade back"></div><div class="rules"></div><div class="shade gleam"></div>
      </div></div>
      <div class="quill">
        <svg aria-hidden="true" viewBox="-200 -220 640 720">
          ${BRAND_DEFS}
          <g class="body">
            ${quillFull()}
            <path class="joy" d="M84 112Q100 86 116 112M124 112Q140 86 156 112" stroke-width="7" stroke-linecap="round" fill="none"/>
            ${bitColours.map((c, i) => (i % 2
              ? svg`<g class="bit"><rect x="-15" y="-8" width="30" height="16" rx="4" style="fill: var(${c})"/></g>`
              : svg`<g class="bit"><path d="M0-20L5-5 20 0 5 5 0 20-5 5-20 0-5-5Z" style="fill: var(${c})"/></g>`))}
          </g>
        </svg>
      </div>`;
  }
}

customElements.define('quill-page-turn', QuillPageTurn);
