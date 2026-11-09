import { LitElement, html, svg, css } from 'lit';
import { BRAND_DEFS, quillFull, brandPaint } from '../../../ui/components/brandSvg.js';
import { quillStage } from '../../../looks/quill/stage.js';

/**
 * <quill-stagehand>: Quill moves the Story theatre's furniture for the
 * learner, in the same spirit as his page turn (src/ui/pageTurn.js).
 *
 * One show = pop in at a grip, hang from it while it moves, let go:
 *   divider   he grabs the divider's handle and hauls it to the new split
 *   carry     he picks a window up by its strip and carries it (undock/dock)
 *   open      he pulls a window open to full view, then cheers
 *   close     he pushes it back into the page
 *
 * The caller owns the layout; this element owns the clock. play() calls
 * onProgress(p) every frame of the move (p eased 0..1) so the caller moves
 * the real thing (the split, a FLIP transform), and reads grip(p) (viewport
 * px) to hang Quill exactly where the thing is this frame. They cannot drift.
 *
 * Without Quill (novelty spent, below) the move still runs, briefer; with
 * reduced motion the caller skips shows altogether (stagehandPlan().tier 'off').
 *
 * Part of the Quill look's brand (src/looks/quill/brand.js, slot kind
 * "stagehand"): the theatre places a <companion-slot kind="stagehand"> and
 * drives whatever element the look puts there through play() / grab() /
 * finish() / plan() / note(); a look without one gets no shows, the windows
 * just jump to their new place.
 *
 * Lives inside the theatre's own root (so it shows in native fullscreen,
 * where only that subtree is painted) as a fixed overlay; positions are
 * taken relative to its own box, so an ancestor that captures fixed
 * positioning does not throw them off.
 */

const HAND = [239, 112];   // tip of Quill's right flipper raised to -100deg, quillShapes units
const POP_MS = 260;
const EXIT_MS = 420;
const CHEER_MS = 820;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outBack = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
const outQuad = (t) => 1 - (1 - t) * (1 - t);

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- novelty (same shape as the page turn's, its own score) ---------------

const NOVELTY_KEY = 'coauthor.stagehand.novelty';
const HALF_LIFE_MS = 10 * 60 * 1000;
const RUSH_MS = 1200;     // a show this soon after the last counts 1.5x (frantic clicking)
const SCORE_CAP = 60;
let memo = null;

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
 * What the next show looks like: { tier, speed, quill }. A dock, undock or
 * full view counts 1, a divider haul 0.5, Quill joining a drag 0.3; the
 * score halves every 10 minutes. So about 14 window moves in a sitting
 * before he even speeds up, and a short break brings the full show back.
 *   full  (seen < 14)   Quill does it, speed 1
 *   brisk (14 to 30)    Quill, up to 1.5x faster
 *   quick (30 to 45)    just the move, 1.8x
 *   off   (45+, or reduced motion)  instant
 */
export function stagehandPlan(now = Date.now()) {
  if (reduced()) return { tier: 'off', speed: 0, quill: false };
  const v = readNovelty();
  const seen = recentScore(v, now) + Math.min(6, v.total / 200);
  if (seen < 14) return { tier: 'full', speed: 1, quill: true };
  if (seen < 30) return { tier: 'brisk', speed: 1 + ((seen - 14) / 16) * 0.5, quill: true };
  if (seen < 45) return { tier: 'quick', speed: 1.8, quill: false };
  return { tier: 'off', speed: 0, quill: false };
}

/** Counts a show towards the novelty score (weight: how much it was "a show"). */
export function noteStagehand(weight = 1, now = Date.now()) {
  const v = readNovelty();
  const add = weight * (now - v.at < RUSH_MS ? 1.5 : 1);
  writeNovelty({ score: Math.min(SCORE_CAP, recentScore(v, now) + add), at: now, total: v.total + weight });
}

export class QuillStagehand extends LitElement {
  static styles = [brandPaint, css`
    :host {
      position: fixed; left: 0; top: 0; width: 100vw; height: 100vh;
      z-index: 40; pointer-events: none; display: none; contain: layout paint;
    }
    :host([playing]) { display: block; }
    svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .joy { stroke: var(--quill-iris); opacity: 0; }
    .shout .joy { opacity: 1; }
    .shout .eye { opacity: 0; }
    .hup .beak-open, .shout .beak-open { opacity: 1; }
    .hup .beak-shut, .shout .beak-shut { opacity: 0; }
    .f-shadow { display: none; }
    .wing-l { transform-origin: 82% 8%; }
    .wing-r { transform-origin: 18% 8%; }
    .grip { fill: none; stroke: var(--accent-gold); stroke-width: 3; }
    .puff { fill: var(--bg-surface); stroke: var(--border-color); stroke-width: 2; }
    .streak { stroke: var(--text-muted); stroke-width: 3; stroke-linecap: round; opacity: 0; }
  `];

  constructor() {
    super();
    this._raf = 0;
    this._done = null;
  }

  render() {
    return html`
      <svg aria-hidden="true">
        ${BRAND_DEFS}
        <circle class="grip" r="0"/>
        <g class="streaks">${[0, 1, 2].map(() => svg`<line class="streak"/>`)}</g>
        <g class="puffs">${[0, 1, 2, 3, 4].map(() => svg`<circle class="puff" r="0"/>`)}</g>
        <g class="quill"><g class="body">
          ${quillFull()}
          <path class="joy" d="M84 112Q100 86 116 112M124 112Q140 86 156 112" stroke-width="7" stroke-linecap="round" fill="none"/>
        </g></g>
      </svg>`;
  }

  /** Ends a running show at once (its move completes: onProgress(1)). */
  /** The next show's plan (stagehandPlan()): how the theatre asks without
   *  importing this element, which belongs to the Quill look's brand. */
  plan(now) {
    return stagehandPlan(now);
  }

  /** Counts a show towards the novelty score (noteStagehand()). */
  note(weight, now) {
    noteStagehand(weight, now);
  }

  finish() {
    if (this._done) this._done(true);
  }

  /**
   * Quill joins a drag the learner is doing: he pops onto grip() (read live
   * every frame) and hangs from it, swinging, until release() is called,
   * then lets go in a puff. Returns { release }.
   */
  grab({ grip, speed = 1, quill = true }) {
    const hold = { released: false };
    this.play({ kind: 'hold', grip, hold, speed, quill, onProgress: () => {} });
    return { release: () => { hold.released = true; } };
  }

  /**
   * @param {object} o
   * @param {'divider'|'carry'|'open'|'close'} o.kind
   * @param {(p:number)=>void} o.onProgress  move the real thing to p (0..1)
   * @param {(p:number)=>[number,number]} o.grip  where Quill holds on at p, viewport px
   * @param {number} [o.moveMs]   length of the move at speed 1
   * @param {number} [o.speed]    >1 is faster
   * @param {boolean} [o.quill]   false: just the move, no Quill
   * @param {number} [o.dir]      which way he faces (1 right, -1 left); default: the way grip travels
   * @param {{released:boolean}} [o.hold]  live mode (grab()): the move lasts until released
   * @returns {Promise<void>} when the move (and Quill's exit) is over
   */
  async play({ kind, onProgress, grip, moveMs = 560, speed = 1, quill = true, dir: faceDir = 0, hold = null }) {
    this.finish();
    await this.updateComplete;
    const $ = (sel) => this.renderRoot.querySelector(sel);
    const E = {
      quill: $('.quill'), body: $('.body'), wingL: $('.wing-l'), wingR: $('.wing-r'), grip: $('.grip'),
      pupils: [...this.renderRoot.querySelectorAll('.pupil')], puffs: [...this.renderRoot.querySelectorAll('.puff')],
      streaks: [...this.renderRoot.querySelectorAll('.streak')],
      tail: $('.scarf-tail'),
    };
    this.setAttribute('playing', '');
    const box = this.getBoundingClientRect();
    const local = ([x, y]) => [x - box.left, y - box.top];
    const qH = Math.max(64, Math.min(124, Math.min(box.width, box.height) * 0.17));
    const s = qH / 300;
    const pop = quill ? POP_MS : 0;
    const exitMs = !quill ? 0 : kind === 'open' ? CHEER_MS : EXIT_MS;
    // Live (hold): the move phase runs until the learner lets go.
    let moveEnd = hold ? Infinity : pop + moveMs;
    // which way he faces: the way the grip travels (a vertical haul keeps him upright, facing right)
    const a0 = grip(0);
    const a1 = grip(1);
    let dir = faceDir || (Math.abs(a1[0] - a0[0]) > 12 ? Math.sign(a1[0] - a0[0]) : 1);
    let vxs = 0;        // smoothed horizontal speed (live: which way he faces)
    let against = 0;    // how long the drag has gone the other way
    let theta = 0;
    let omega = 0;
    let last = null;
    let lastT = 0;
    E.quill.style.display = quill ? '' : 'none';
    quillStage.stagehandBusy = quill;

    return new Promise((resolve) => {
      const start = performance.now();
      const end = (skipped) => {
        cancelAnimationFrame(this._raf);
        this._raf = 0;
        this._done = null;
        quillStage.stagehandBusy = false;
        onProgress(1);
        this.removeAttribute('playing');
        resolve(skipped);
      };
      this._done = end;
      const frame = (now) => {
        if (!this.isConnected) { end(true); return; }
        const t = (now - start) * speed;
        if (hold?.released && moveEnd === Infinity) moveEnd = Math.max(t, pop);
        const pm = hold ? 1 : inOut(seg(t, pop, moveEnd));
        onProgress(pm);
        if (t >= moveEnd + exitMs) { end(false); return; }
        if (!quill) { this._raf = requestAnimationFrame(frame); return; }

        const H = local(grip(pm));
        const dt = Math.max(1, t - lastT);
        const vx = last ? (H[0] - last[0]) / dt : 0;
        const vy = last ? (H[1] - last[1]) / dt : 0;
        last = H;
        lastT = t;
        // live: turn round once the learner has pulled the other way for a moment
        vxs = vxs * 0.8 + vx * 0.2;
        if (hold && t < moveEnd) {
          against = vxs * dir < -0.12 ? against + dt : 0;
          if (against > 140) { dir = -dir; against = 0; theta = -theta; }
        }
        // Hanging from the grip: a damped pendulum driven by the grip's speed
        // (he trails behind the pull, then swings back and settles).
        const want = Math.max(-30, Math.min(30, -vx * 26 * dir));
        omega = omega * 0.82 + (want - theta) * 0.16;
        theta += omega;

        let k = 1;              // pop scale
        let hx = H[0];
        let hy = H[1];
        let rot = theta;
        let alpha = 1;
        let wingR = -100;
        let wingL = 40 + 18 * Math.sin(t / 70);  // paddling with the free flipper
        let sy = 1 + Math.max(-0.08, Math.min(0.14, vy * 0.35));
        let mood = '';
        if (t < pop) {
          k = outBack(seg(t, 0, pop));
          mood = t > pop * 0.55 ? 'hup' : '';
        } else if (t > moveEnd) {
          const te = t - moveEnd;
          if (kind === 'open') {
            // let go with a whoop: drop clear of the corner, a joyful bounce,
            // wings up, then away (the corner is often the screen's
            // own top edge in full view, so no hopping upwards)
            hy += outQuad(seg(te, 0, 220)) * 0.5 * qH;
            hy -= Math.sin(seg(te, 220, 520) * Math.PI) * 0.18 * qH;
            rot = theta * (1 - seg(te, 0, 200));
            wingL = 128; wingR = -128;
            mood = te < 560 ? 'shout' : '';
            const fall = seg(te, 520, CHEER_MS);
            hy += fall * fall * (qH * 1.4);
            alpha = 1 - seg(te, 600, CHEER_MS);
          } else {
            // let go: a little drop, a tumble, gone in a puff
            const f = seg(te, 0, EXIT_MS);
            hy += f * f * qH * 0.9;
            rot = theta + f * 40 * dir;
            wingR = lerp(-100, -30, seg(te, 0, 120));
            wingL = lerp(wingL, 120, seg(te, 0, 160));
            alpha = 1 - seg(te, 160, EXIT_MS);
            k = 1 - 0.25 * seg(te, 200, EXIT_MS);
            mood = te < 120 ? 'hup' : '';
          }
        }
        E.quill.style.opacity = String(alpha);
        E.quill.setAttribute('transform',
          `translate(${hx.toFixed(1)} ${hy.toFixed(1)}) rotate(${rot.toFixed(2)}) scale(${(s * k * dir).toFixed(4)} ${(s * k * sy).toFixed(4)}) translate(${-HAND[0]} ${-HAND[1]})`);
        E.wingR.style.transform = `rotate(${wingR}deg)`;
        E.wingL.style.transform = `rotate(${wingL}deg)`;
        E.body.classList.toggle('hup', mood === 'hup');
        E.body.classList.toggle('shout', mood === 'shout');
        if (E.tail) E.tail.style.transform = `rotate(${(-theta * 0.8).toFixed(1)}deg)`;
        const look = Math.abs(vx) + Math.abs(vy) > 0.05 ? [Math.sign(vx) * 5 * dir, Math.sign(vy) * 3] : [0, -2];
        E.pupils.forEach((p) => { p.style.transform = `translate(${look[0]}px, ${look[1]}px)`; });

        // the gold ring where he holds on, while he holds on
        const gripOn = t >= pop * 0.6 && t <= moveEnd + 60;
        const gr = gripOn ? 9 + 3 * Math.sin(t / 90) : 0;
        E.grip.setAttribute('cx', H[0].toFixed(1));
        E.grip.setAttribute('cy', H[1].toFixed(1));
        E.grip.setAttribute('r', gr.toFixed(1));
        E.grip.style.opacity = gripOn ? '0.9' : '0';

        // speed lines behind a fast pull
        const sp = Math.hypot(vx, vy);
        E.streaks.forEach((ln, i) => {
          if (sp < 0.5 || t > moveEnd) { ln.style.opacity = '0'; return; }
          const nx = -vx / sp, ny = -vy / sp;
          const off = (i - 1) * 0.18 * qH;
          const x0 = H[0] - ny * off + nx * (0.25 * qH);
          const y0 = H[1] + nx * off + ny * (0.25 * qH);
          const len = Math.min(0.9 * qH, sp * 26);
          ln.setAttribute('x1', x0.toFixed(1)); ln.setAttribute('y1', y0.toFixed(1));
          ln.setAttribute('x2', (x0 + nx * len).toFixed(1)); ln.setAttribute('y2', (y0 + ny * len).toFixed(1));
          ln.style.opacity = String(Math.min(0.55, (sp - 0.5) * 0.6));
        });

        // a puff of dust where he lets go
        const tp = t - moveEnd;
        E.puffs.forEach((c, i) => {
          if (kind === 'open' || tp < 0 || tp > 460) { c.setAttribute('r', '0'); return; }
          const f = outQuad(seg(tp, 0, 460));
          const ang = (i / E.puffs.length) * Math.PI * 2 + 0.6;
          c.setAttribute('cx', (H[0] + Math.cos(ang) * 22 * f).toFixed(1));
          c.setAttribute('cy', (H[1] + Math.sin(ang) * 14 * f).toFixed(1));
          c.setAttribute('r', (6 + 5 * f).toFixed(1));
          c.style.opacity = String(0.85 * (1 - f));
        });

        this._raf = requestAnimationFrame(frame);
      };
      this._raf = requestAnimationFrame(frame);
    });
  }
}

if (!customElements.get('quill-stagehand')) customElements.define('quill-stagehand', QuillStagehand);
