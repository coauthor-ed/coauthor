import { LitElement, html, css, unsafeCSS } from 'lit';
import { quillMarkup, quillStyles, performAct, setExpression, trackPupils, quillActing } from '../../core/quill/QuillRig.js';
import { quillStage } from './stage.js';
import { createFindGate, cameoPlan, noteCameo, chooseSpot, readStage, residentOf, residentAct } from './cameoPlan.js';
import { CUES, emitCue } from '../../core/cues.js';

/**
 * <quill-cameo>: Quill comes to the edge of a scene for a moment.
 *
 * The Quill look's answer to cue:found: the scene pops the thing it found,
 * then he appears at the nearest free edge of the stage, does one act and
 * leaves. He also takes the reactor's other acts when no companion is on
 * screen to do them (a right answer, a prediction). The reactor decides what
 * he does; this element decides whether he may, and where. A look without the
 * reactor has no cameo at all.
 *
 * One Quill at a time on screen: when the stage answers that a Quill of its own
 * is in view by the scene (a companion), that one does the find's act where he
 * stands, under the same find rules, and no second bird comes. See _resident().
 *
 * He lives outside the scene, so canvas, DOM and SVG scenes are all the same
 * to him: a fixed overlay on <body>. Positions are taken relative to his own
 * box, so an ancestor that captures fixed positioning does no harm.
 *
 * Restraint: a find is the one exception to the 20 s budget, so find() has its
 * own rules, in cameoPlan.js (once per find, novelty taper). serve() keeps the
 * budget. Both stand aside while any other Quill is acting, while the page
 * turns and while the stagehand works. pointer-events: none, always.
 *
 * Measuring: he reads nothing inside another component. He asks over the
 * EventBus (cue:stage-query) and the components on screen answer from their
 * own modules with their stage, its keep-outs, and, in full view, a way to
 * take him in, since a fullscreen subtree is all that paints
 * (src/core/components/stageAnswer.js). The answer is good for one appearance.
 * With no answer for a find he takes a corner of the page, and with the
 * document in fullscreen and no stage to adopt him he does not come.
 */

const ACT_BUDGET_MS = 20000;
const POP_DELAY_MS = 240;     // the scene's own pop goes first
const ENTER_MS = 340;
const EXIT_MS = 260;
const STILL_ENTER_MS = 60;
const LEAVE_WAIT_MS = 500;
const SIDE_LEAN = 22;         // leaning out from behind a side edge, degrees
const SHOW_BOTTOM = 0.8;      // how much of his height shows at the bottom edge
const SHOW_SIDE = 0.64;       // how much of his width shows at a side edge

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const fullscreenOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

/** Everyone on screen says what they have. Synchronous: the bus is. */
function askStage(host) {
  const answers = [];
  emitCue(CUES.STAGE_QUERY, { host: host || null, reply: (a) => answers.push(a) });
  return answers;
}

export class QuillCameo extends LitElement {
  static styles = css`
    :host {
      position: fixed; left: 0; top: 0; width: 100vw; height: 100vh;
      z-index: 1100; pointer-events: none; display: none; contain: layout paint;
    }
    :host([playing]) { display: block; }
    .clip { position: absolute; overflow: hidden; }
    .bird { position: absolute; }
    .turn { width: 100%; height: 100%; }
    :host([mirror]) .turn { transform: scaleX(-1); }
    .rig { width: 100%; height: 100%; }
    .rig .q-shadow { display: none; }
    ${unsafeCSS(quillStyles('.rig'))}
  `;

  constructor() {
    super();
    this._gate = createFindGate();
    this._ns = `qc${Math.floor(Math.random() * 1e6)}`;
    this._showing = false;
    this._host = null;
    this._raf = 0;
  }

  render() {
    return html`<div class="clip"><div class="bird"><div class="turn"><div class="rig"></div></div></div></div>`;
  }

  firstUpdated() {
    this.renderRoot.querySelector('.rig').insertAdjacentHTML('afterbegin', quillMarkup(this._ns));
    setExpression(this.renderRoot.querySelector('.rig'), 'happy');
  }

  get busy() { return this._showing; }

  /** Somebody else's Quill is on, or the page itself is moving. */
  _standAside() {
    return this._showing || quillActing() || quillStage.stagehandBusy
      || !!document.documentElement.classList.contains('quill-turning');
  }

  /**
   * The find rule. p: the cue:found payload. act: what the reactor chose.
   * small: what he does instead once the novelty is wearing off.
   */
  async find(p, act, small = 'nod') {
    const now = Date.now();
    if (!this._gate.fresh(p, now)) return false;
    const plan = cameoPlan(now);
    if (!plan.show) { noteCameo(false, now); return false; }
    await new Promise((r) => setTimeout(r, POP_DELAY_MS));
    if (this._standAside()) return false;
    const shown = await this._show(plan.small ? small : act, p, { over: 'stage' });
    noteCameo(shown, Date.now());
    return shown;
  }

  /** A bigger moment than whatever he is doing: he drops it, and the budget
   *  does not apply. He still gives way to a Quill already on screen. */
  async milestone(act, p = {}) {
    this.leave();
    const until = Date.now() + LEAVE_WAIT_MS;
    while (this._showing && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
    if (this._standAside()) return false;
    const shown = await this._show(act, p, { over: 'page' });
    if (shown) quillStage.lastActAt = Date.now();
    return shown;
  }

  /** Any other act: the ordinary budget, one per 20 s across the look. */
  async serve(act, p = {}) {
    const now = Date.now();
    if (now - (quillStage.lastActAt || 0) < ACT_BUDGET_MS || this._standAside()) return false;
    const shown = await this._show(act, p, { over: 'page' });
    if (shown) quillStage.lastActAt = now;
    return shown;
  }

  /** Gone at once: the slide changed, or a bigger moment needs the stage. */
  leave() {
    if (!this._showing) return;
    this._left = true;
    this.renderRoot.getAnimations?.().filter((a) => !(a instanceof CSSAnimation)).forEach((a) => a.cancel());
  }

  _size(stage) {
    const phone = window.innerWidth < 600;
    const sh = stage.bottom - stage.top;
    const h = Math.round(Math.max(64, Math.min(phone ? 92 : 150, sh * 0.42)));
    return { h, w: Math.round(h * 0.8) };
  }

  /** The spot for this act, or null. A find stays on its stage; the rest of
   *  the time the stage is the page, and the answer area is off limits. */
  _place(act, p, place) {
    const { stage, obstacles, clear, fallback } = place;
    const { w, h } = this._size(stage);
    const target = Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
    const spot = chooseSpot({ stage, target, obstacles, act: fallback ? 'nod' : act, w, h, show: SHOW_BOTTOM, test: clear });
    return spot ? { ...spot, stage, target } : null;
  }

  async _show(act, p, { over }) {
    if (this._showing) return false;
    this._showing = true;
    this._left = false;
    let shown = false;
    try {
      const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      const answers = askStage(p.host);
      const resident = over === 'stage' ? residentOf(answers) : null;
      if (resident) return (shown = await this._resident(resident, act, p));
      const place = readStage(answers, { over, viewport, fullscreen: fullscreenOn() });
      if (!place) return false;
      if (place.adopt) place.adopt(this);
      else if (this.parentNode !== document.body) document.body.appendChild(this);
      await this.updateComplete;
      const spot = this._place(act, p, place);
      if (!spot) return false;
      shown = true;
      await this._play(spot, place.box);
    } finally {
      cancelAnimationFrame(this._raf);
      this.removeAttribute('playing');
      this._showing = false;
      if (this.parentNode !== document.body) document.body.appendChild(this);
    }
    return shown;
  }

  /** The Quill already by the scene takes the find: he stays where he is and
   *  acts through his own API, so nothing moves in the layout around him. A
   *  find keeps its own rules, so `force` passes his 20 s budget, as here. */
  async _resident({ actor, box, beside }, act, p) {
    const find = Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
    if (find) {
      const dx = find.x - (box.left + box.right) / 2;
      const dy = find.y - (box.top + box.bottom) / 2;
      const far = Math.hypot(dx, dy) || 1;
      actor.look?.(dx / far, dy / far);
    }
    const plan = residentAct(act, { box, beside }, find);
    const ran = await actor.perform?.(plan.act, { force: true, target: plan.target });
    actor.look?.(0, 0);
    return !!ran;
  }

  async _play(spot, stageBox) {
    const { edge, mirror, rect, stage, w, h, act, target, small } = spot;
    const $ = (s) => this.renderRoot.querySelector(s);
    const clip = $('.clip');
    const bird = $('.bird');
    const rig = $('.rig');
    this.setAttribute('playing', '');
    this.toggleAttribute('mirror', mirror);
    const box = this.getBoundingClientRect();
    clip.style.cssText = `left:${stage.left - box.left}px;top:${stage.top - box.top}px;width:${stage.right - stage.left}px;height:${stage.bottom - stage.top}px`;

    // His box, in the clip. The visible part of him is `rect`.
    const left = rect.left - stage.left;
    const top = rect.top - stage.top;
    const tall = Math.round(w * 1.25);
    let rest;
    let away;
    if (edge === 'bottom') {
      bird.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${tall}px`;
      rest = 'translate(0px,0px)';
      away = `translate(0px,${h}px)`;
    } else {
      const lean = edge === 'left' ? SIDE_LEAN : -SIDE_LEAN;
      const tuck = Math.round(w * (1 - SHOW_SIDE));
      const x = edge === 'left' ? left - tuck : left + tuck;
      bird.style.cssText = `left:${x}px;top:${top}px;width:${w}px;height:${tall}px`;
      rest = `rotate(${lean}deg)`;
      away = `translate(${edge === 'left' ? -w : w}px,0px) rotate(${lean}deg)`;
    }
    bird.style.transform = rest;

    // He stays with the stage if the page moves under him. A stage that is
    // gone answers null: the slide changed under him, so he goes too.
    if (stageBox) {
      const r0 = stageBox();
      const follow = () => {
        if (!this._showing) return;
        const r = stageBox();
        if (!r) { this.leave(); return; }
        clip.style.transform = `translate(${r.left - r0.left}px,${r.top - r0.top}px)`;
        this._raf = requestAnimationFrame(follow);
      };
      clip.style.transform = '';
      if (r0) this._raf = requestAnimationFrame(follow);
    }

    const still = reduced();
    const moved = (frames, ms, easing) => new Promise((res) => {
      const a = bird.animate(frames, { duration: ms, easing, fill: 'none' });
      a.addEventListener('finish', res, { once: true });
      a.addEventListener('cancel', res, { once: true });
    });
    if (still) {
      await moved([{ opacity: 0 }, { opacity: 1 }], STILL_ENTER_MS, 'linear');
    } else {
      const mid = edge === 'bottom' ? `translate(0px,${small ? -3 : -7}px)` : rest;
      await moved([
        { transform: away, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { transform: mid, offset: 0.72, easing: 'ease-in-out' },
        { transform: rest },
      ], ENTER_MS, 'linear');
      if (target) {
        const dir = Math.sign(target.x - (rect.left + rect.right) / 2) * (mirror ? -1 : 1);
        trackPupils(rig, dir * 4, -1);
      }
    }
    if (!this._left) {
      await performAct(rig, act, act === 'peek' ? { inPlace: true } : target);
      trackPupils(rig, 0, 0);
    }
    if (!still && !this._left) {
      await moved([
        { transform: rest, easing: 'cubic-bezier(.6,0,.9,.5)' },
        { transform: away },
      ], EXIT_MS, 'linear');
    }
  }
}

if (!customElements.get('quill-cameo')) customElements.define('quill-cameo', QuillCameo);

let the = null;

/** The one cameo. It parks itself on <body>, unpainted, until it is needed. */
export function quillCameo() {
  if (!the) {
    the = document.createElement('quill-cameo');
    document.body.appendChild(the);
  }
  return the;
}
