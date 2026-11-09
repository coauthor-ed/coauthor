/**
 * ArcadeScene - the shared engine for practice arcade games (a sibling of
 * mini-game@1: that one teaches the concept, these drill what was taught).
 * Not a game itself: ArcadeSortScene, ArcadeRouteScene, ArcadeMatchScene,
 * ArcadeOrderScene and ArcadeJudgeScene extend it, and a course scene is a
 * few lines of CONFIG on one of those (docs/arcade-games.md in the kit).
 *
 * What every game gets from here, so no course re-builds it:
 *   - menu -> play -> end, drawn in the look kit (SimScene + SimLook);
 *   - a HUD: score, streak, lives, progress;
 *   - pace that starts slow, speeds up on a streak and slows after a slip;
 *     reduced motion caps it;
 *   - a balanced queue (groups take turns) and spaced repeats: an item the
 *     learner got wrong or let slip comes back 3-5 items later, at most twice;
 *   - the why card: after a wrong try or a slip the game pauses and says
 *     "not X - it is Y, because Z" long enough to read (tap to go on); a wrong
 *     try costs the streak only, the SAME item stays in play until answered
 *     right; only letting something slip costs a life;
 *   - an end card listing the learner's own mix-ups with the right answers;
 *   - item cards with art (a bundle image via the host's resolveMedia, a
 *     course drawing as { svg } with var(--token) colours, a short glyph,
 *     or a face; art: false for none), sized text that never overflows;
 *   - coming to rest: busy() while playing, parked on the menu and end card.
 *
 *   - a phone layout: below about 2/3 scale (a 680 design in 320 px) the HUD, menu, why
 *     card and end card lay themselves out with text raised to 13 px on screen. A subclass
 *     asks phoneUi(), and uiPx(n) for a size in design px that reaches n px on screen;
 *   - keyboard play: the canvas takes focus (Tab), Enter or Space starts and
 *     replays, Escape pauses, and every other key goes to keyPlay(key, down);
 *   - an attract demo (static ATTRACT_S > 0): the menu plays one short silent
 *     loop, then rests; none under reduced motion.
 *
 * Subclass hooks (archetypes, not courses):
 *   static KIND, static HOW (one line: how to play), static DEFAULTS, static ATTRACT_S
 *   checkConfig(cfg) -> [problems]    beginRun(run)    tickPlay(d)
 *   drawPlay(ctx, c, t)               tapPlay(p) / onHit(id, data, p)
 *   afterWhy(info)                    releasePlay(p), movePlay(p) (optional)
 *   keyPlay(key, down) -> true when handled (arrows, letters; optional)
 *   drawWorld(ctx, c, t)  the scene behind every phase (default: the arcade night, see below)
 *   drawMenu(ctx, c, t, u)  a whole custom menu (u: attract progress 0..1);
 *   menuDemo(ctx, c, t, u)  or just the sample row of the default menu
 *   endDecor(ctx, c, t)  drawn over the end card (a cheering mascot)
 *   mascotSpot() -> { x, y, h, flip?, lookAt? } | null  where Quill stands during play (feet at
 *                   x, y; h his height); null keeps him off the field. An archetype that needs him
 *                   at its own layer calls this.drawMascot(ctx, c, t, spot) inside drawPlay instead.
 *   static OWN_MASCOT  true when the game stands its own mascot on the stage (Quill's Catch):
 *                   the base draws none and the game sends no cues
 *
 * Quill (SimQuill, the app's own bird) is in every game under a look with a mascot: on the menu with
 * a bubble, on the field (mascotSpot), beside the why card explaining, and on the end card cheering
 * (or shrugging). He reacts in the base: joy eyes on a right answer, a hop on a streak, surprise on
 * a wrong try, sad on a slip, heart eyes on a bonus. Because he is in the canvas, the base sends no
 * cue to the look's outside Quill (ownsMascot()); a look without a mascot still gets the cues.
 * The chrome follows the landing page: a kicker chip, the title's last line in the gold-coral-pink
 * gradient with a brush swash, a coral PLAY with an arrow, marquee bulbs for progress on the HUD.
 *
 * The arcade is a cabinet, not a lesson figure: under the Quill look the base paints Quill's own
 * polar world behind every game, whatever the course's setting (drawPolarSky + drawIceShelf: the
 * Catch game's night sky, a dusk by day, with the aurora, a moon, far bergs and the sea, and an
 * ice shelf the game's set stands on, at floeY()). A flat or paper look keeps its backdrop; a game
 * with a world of its own (Quill's Catch) overrides drawWorld. The arcade's juice is Quill himself:
 * he waddles in during the 3-2-1-GO countdown (static INTRO_S; play and input wait for it), jumps
 * and spins on every 5th in a row, covers his eyes after a wrong try, belly-flops on a slip with a
 * heart breaking over him, wears a crown in the boss round and leans into the wind when the pace
 * steps up. Signs pop over the field in the Catch sign's style (banner(): COMBO x5, SPEED UP!,
 * BONUS x2, BOSS ROUND); the score rolls up with a pop; the end card gives a verdict (CLEARED! /
 * PERFECT! / GAME OVER), the stars land one by one, the score counts up and a NEW BEST! ribbon
 * drops. In a lesson the block frames the canvas in the landing page's cabinet (static FRAME_STYLE).
 *
 * Celebrations: the game keeps its juice (score chips, shakes). celebrate() is a ring and pop
 * with no cue unless o.notable, so a hit never reaches the look; a win sends cue:game-solved
 * and a streak bonus a small find (SimFind.js).
 * Services: this.hit(id, rect, data) during draw, this.button(...), this.right(x, y),
 * this.wrongTry(info), this.slip(info), this.itemDone(x, y), this.requeue(item),
 * this.balanced(items, groupOf, n), this.drawToken(...), this.fitText(...), this.banner(text, col, o),
 * this.tone(key), this.play (per-run state an archetype owns).
 */
import { SimScene } from './SimScene.js';
import { lookOf } from './lookProfile.js';
import { emitFind, emitSolved, canvasPoint } from './SimFind.js';
import {
  W, H, pill, rr, font, mix, alpha, darken, lighten, drawBackdrop, drawDepth, drawVignette,
  drawFace, star, sparkle, speechBubble, outBack, clamp, luma, mulberry32, drawShadow, COLOR_TOKEN_MAP,
} from './SimLook.js';
import { QUILL_COLOR_MAP, drawQuill, quillBox } from './SimQuill.js';

const WHY_MIN_S = 0.8;        // the why card cannot be dismissed before this
const HUD_H = 54;
const GO_S = 0.5;             // the last part of the countdown: GO! shows while play has begun

/**
 * Beyond the kit's palette: the landing page's CTA (theme.css --landing-*, the same by day and by
 * night; fallbacks for a harness without theme.css) and the polar world's own --sim-* tokens.
 */
export const ARCADE_COLOR_MAP = {
  cta:        ['--landing-cta',     '#ff7d5c'],
  ctaLip:     ['--landing-cta-lip', '#b9442b'],
  seaShallow: ['--sim-sea-shallow', '#2bb3c9'],
  seaDeep:    ['--sim-sea-deep',    '#164a86'],
  ice:        ['--sim-ice',         '#cfeaff'],
  skyDay:     ['--sim-sky-day',     '#5fb4ff'],
  skyDusk:    ['--sim-sky-dusk',    '#ff9a6b'],
};

export class ArcadeScene extends SimScene {
  static BEAT_STEP_MAP = [[{ idx: 0, dwellMs: null }]];
  static KIND = 'Arcade';
  static HOW = '';
  static DEFAULTS = {};
  static CONFIG = null;
  /** Seconds of attract demo on the menu (0: none). */
  static ATTRACT_S = 0;
  /** The game stands its own mascot on the stage, so the look sends none. */
  static OWN_MASCOT = false;
  /** Seconds of 3-2-1-GO before a run (0: none; a game with its own opening banner sets 0). */
  static INTRO_S = 2.2;
  /** The lesson block frames the canvas in the landing page's cabinet (content-block@1). */
  static FRAME_STYLE = 'cabinet';
  static COLOR_MAP = { ...COLOR_TOKEN_MAP, ...QUILL_COLOR_MAP, ...ARCADE_COLOR_MAP };

  constructor(container, config) {
    super(container, config);
    const C = this.constructor;
    this.cfg = { rounds: 12, lives: 3, relaxed: false, maxSpeed: 1.9, ...C.DEFAULTS, ...(C.CONFIG || {}) };
    this.phase = 'menu';          // menu | play | why | end
    this.best = 0;
    this._attempts = 0;           // runs started
    this.run = null;              // shared per-run state (score, lives, queue, mix-ups)
    this.play = null;             // archetype per-run state
    this._host = config || {};    // resolveMedia lives here (the canvas base drops config)
    this._art = new Map();        // image cache
    this._hits = [];
    this._scr = 1;                // design px per CSS px on screen
    this._menuT = 0;
    this._keys = null;
    this.q = quillState();        // Quill's mood (see drawMascot)
    this._mascotDrawn = false;
    this._ban = null;             // the banner sweeping across the field (banner())
  }

  /** True when a mascot stands inside the canvas (the game's own, or the kit's Quill): no cues go out. */
  ownsMascot() { return this.constructor.OWN_MASCOT || !!lookOf().mascot; }
  /** The kit's Quill is drawn (a look with a mascot, and the game has none of its own). */
  _kitQuill() { return !this.constructor.OWN_MASCOT && !!lookOf().mascot; }
  /** The arcade's own world is on: the base paints Quill's polar scene (not under a flat look, not for a game with its own world). */
  arcadeWorld() { return lookOf().backdrop === 'world' && this.drawWorld === ArcadeScene.prototype.drawWorld; }
  /** Where the ice shelf starts (design px): the floor the game's set and Quill stand on. An archetype sets it per skin. */
  floeY() { return 440; }

  async setup() {
    const problems = this.checkConfig(this.cfg);
    if (!this.cfg.title) problems.push('CONFIG.title is required');
    if (problems.length) throw new Error(`${this.constructor.name} (${this.constructor.KIND}): ${problems.join('; ')}`);
    await super.setup();
    // Keyboard play: the canvas is a focus stop with a visible ring.
    const cv = this.canvas;
    if (cv) {
      cv.tabIndex = 0;
      const ring = (on) => { cv.style.outline = on ? `3px solid ${this.colors?.accent}` : ''; cv.style.outlineOffset = on ? '3px' : ''; };
      this._keys = {
        down: (e) => this._key(e, true),
        up: (e) => this._key(e, false),
        focus: () => ring(cv.matches?.(':focus-visible') ?? true),
        blur: () => ring(false),
      };
      cv.addEventListener('keydown', this._keys.down);
      cv.addEventListener('keyup', this._keys.up);
      cv.addEventListener('focus', this._keys.focus);
      cv.addEventListener('blur', this._keys.blur);
    }
  }

  destroy() {
    const cv = this.canvas;
    if (cv && this._keys) {
      cv.removeEventListener('keydown', this._keys.down);
      cv.removeEventListener('keyup', this._keys.up);
      cv.removeEventListener('focus', this._keys.focus);
      cv.removeEventListener('blur', this._keys.blur);
    }
    super.destroy();
  }

  _key(e, down) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key;
    let used = false;
    if (down && (key === 'Enter' || key === ' ')) {
      if (this.phase === 'menu' || this.phase === 'end') { this.startRun(); used = true; }
      else if (this.phase === 'why') { if (this.run.why.t >= WHY_MIN_S) this._closeWhy(); used = true; }
      else if (this.phase === 'pause') { this._resume(); used = true; }
    } else if (down && key === 'Escape') {
      if (this.phase === 'play') { this.phase = 'pause'; used = true; }
      else if (this.phase === 'pause') { this._resume(); used = true; }
    }
    if (!used && this.phase === 'play' && !this.inIntro()) used = !!this.keyPlay(key, down);
    if (used) { e.preventDefault(); this.animateFor?.(); }
  }

  _resume() { this.phase = 'play'; this.animateFor?.(); }

  /** Attract-demo progress 0..1 (1 when there is none, or it has played). */
  attractU() {
    const s = this.constructor.ATTRACT_S;
    if (!s || this._reduced()) return 1;
    return Math.min(1, this._menuT / s);
  }

  _reduced() { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }

  // -- archetype hooks (defaults) --------------------------------------------------
  checkConfig() { return []; }
  beginRun() {}
  tickPlay() {}
  drawPlay() {}
  tapPlay() {}
  onHit() {}
  afterWhy() {}
  releasePlay() {}
  movePlay() { return false; }
  keyPlay() { return false; }
  mascotSpot() { return null; }

  // -- run lifecycle ------------------------------------------------------------------
  startRun() {
    this._attempts += 1;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.run = {
      score: 0, streak: 0, topStreak: 0, right: 0, tries: 0,
      lives: this.cfg.relaxed ? Infinity : this.cfg.lives,
      done: 0, total: 0, speed: 1, maxSpeed: reduce ? Math.min(1.3, this.cfg.maxSpeed) : this.cfg.maxSpeed,
      queue: [], repeats: new Map(), mixups: [], why: null, t: 0,
      missed: new Set(), boss: new Set(), bossOn: false, bonus: 0,
      intro: this.constructor.INTRO_S,   // the countdown; play is gated while it is above GO_S
      shown: 0, scoreT: -9,              // the score the HUD shows rolls up to r.score; when it last changed
      heartT: 9, heartLost: -1,          // the heart breaking on the HUD (slip)
      spedUp: false,
    };
    this.play = {};
    this.q = quillState();
    this.q.walk = this.constructor.INTRO_S > GO_S ? 1 : 0;   // he walks in during the countdown
    this._ban = null;
    this.beginRun(this.run);
    this.run.total = this.run.total || this.run.queue.length;
    this.phase = 'play';
    this.animateFor?.();
  }

  /** True while the countdown holds the field (the archetype does not tick; taps and keys wait). */
  inIntro() { return this.phase === 'play' && this.run.intro > GO_S; }

  endRun() {
    const r = this.run;
    this.phase = 'end';
    r.newBest = this.best > 0 && r.score > this.best;
    this.best = Math.max(this.best, r.score);
    this._ban = null;
    r.won = r.lives > 0;
    const q = this.q;
    q.cheerT = 0;
    q.won = r.won;
    if (r.won) {
      q.face = 'happy'; q.faceT = 0; q.joy = 1;
      const side = !this.phoneUi() && this._kitQuill();
      this.celebrate(side ? 78 : W / 2, side ? 400 : 60, 40);   // the pop bursts from Quill beside the end card (or over it)
      if (!this.ownsMascot()) {
        emitSolved({ companion: null, attempts: this._attempts, score: r.score, top: !r.mixups.length, host: this.container, ...canvasPoint(this, W / 2, 96) });
      }
    } else { q.face = 'sad'; q.faceT = 1e9; q.joy = 0; }
    this.animateFor?.(2500);
  }

  /** Ring and pop; a cue only for o.notable, never for a hit (see the header). */
  celebrate(x, y, n, o = {}) {
    super.celebrate(x, y, n, { ...o, quiet: !o.notable || this.ownsMascot() });
  }

  /** Groups take turns (round-robin in a shuffled group order), then trimmed to n. */
  balanced(items, groupOf, n) {
    const by = new Map();
    for (const it of shuffle(items)) {
      const g = groupOf(it);
      if (!by.has(g)) by.set(g, []);
      by.get(g).push(it);
    }
    const out = [];
    while (out.length < n && [...by.values()].some((l) => l.length)) {
      for (const g of shuffle([...by.keys()])) {
        const l = by.get(g);
        if (l.length && out.length < n) out.push(l.shift());
      }
    }
    return out;
  }

  /** The learner missed this item: it comes back 3-5 items later, at most twice. */
  requeue(item) {
    const r = this.run;
    const n = r.repeats.get(item) || 0;
    if (n >= 2) return;
    r.repeats.set(item, n + 1);
    const at = Math.min(r.queue.length, 3 + Math.floor(Math.random() * 3));
    r.queue.splice(at, 0, item);
    r.total += 1;
  }

  /** A right answer at (x, y): streak, score chip, faster pace. */
  right(x, y, item) {
    const r = this.run;
    r.tries += 1;
    r.right += 1;
    r.streak += 1;
    r.topStreak = Math.max(r.topStreak, r.streak);
    const q = this.q;
    q.joy = 1; q.mouth = 0.5; q.face = 'happy'; q.faceT = 0;
    if (r.streak % 5 === 0) q.spin = 1;
    if (r.streak === 8 || r.streak === 16) {
      r.bonus = 6;
      q.face = 'heart'; q.faceT = 2; q.showerT = 0;
      this.banner('BONUS x2', this.colors.s4, { sub: 'double points for a while' });
      if (!this.ownsMascot()) emitFind({ ...canvasPoint(this, W / 2, HUD_H + 70), host: this.container, thing: { vague: true }, small: true });
    } else if (r.streak > 0 && r.streak % 5 === 0) this.banner(`COMBO x${r.streak}`, this.colors.warning);
    const gain = (10 + Math.min(r.streak, 6) * 2) * (r.bonus > 0 ? 2 : 1) * (item && this.isBoss(item) ? 2 : 1);
    r.score += gain;
    r.scoreT = this.clock;
    r.speed = Math.min(r.maxSpeed, r.speed + 0.07);
    if (!r.spedUp && r.speed >= 1.5 && r.maxSpeed > 1.5) { r.spedUp = true; q.wind = 1.6; this.banner('SPEED UP!', this.colors.accent, { dur: 1.2 }); }
    this.floatText(`+${gain}`, x, y, { bg: this.colors.good, ...(this.phoneUi() ? { size: this.uiPx(14, 12) } : {}) });
  }

  /**
   * A sign popping over the field: "COMBO x5", "SPEED UP!", "BOSS ROUND". col: its rim;
   * o: { sub (a small line above the words), dur }.
   */
  banner(text, col, o = {}) {
    this._ban = { text, col, sub: o.sub, t: 0, dur: o.dur ?? 1.5 };
    this.animateFor?.();
  }

  /**
   * A wrong try: pause on the why card; the same item stays in play.
   * info: { item, said, answer, why, x, y, title? }
   */
  wrongTry(info) {
    const r = this.run;
    r.tries += 1;
    r.streak = 0;
    r.speed = Math.max(1, r.speed * 0.9);
    this._mixup(info);
    if (info.item) r.missed.add(info.item);
    this.q.face = 'surprised'; this.q.faceT = 1e9; this.q.joy = 0; this.q.hide = 1;
    this.oops(info.x ?? W / 2, info.y ?? H / 2);
    this._openWhy({ ...info, title: info.title || `Not ${info.said}.` });
  }

  /** Something slipped (landed, arrived, ran out): a life, the why card, and it comes back later. */
  slip(info) {
    const r = this.run;
    r.streak = 0;
    r.speed = Math.max(1, r.speed * 0.85);
    r.lives -= 1;
    this._mixup({ ...info, said: info.said || 'too slow' });
    if (info.item) r.missed.add(info.item);
    if (info.item && info.requeue !== false) this.requeue(info.item);
    // this instance never completes: it is either queued again (net 0) or dropped
    r.total -= 1;
    if (r.done >= r.total && !r.queue.length) r.endAfterWhy = true;
    this.q.face = 'sad'; this.q.faceT = 1e9; this.q.joy = 0; this.q.flop = 1; this.q.heartX = 0;
    if (Number.isFinite(r.lives)) { r.heartT = 0; r.heartLost = r.lives; }
    this.shake(8);
    this._openWhy({ ...info, title: info.title || 'Too slow!', lostLife: true });
  }

  /** One item finished (right in the end): count it and ask the archetype for the next. */
  itemDone() {
    const r = this.run;
    r.done += 1;
    if (r.done >= r.total || !r.queue.length) {
      if (!r.bossOn && this.cfg.boss !== false) {
        const boss = this.bossItems().slice(0, 4);
        if (boss.length) {
          r.bossOn = true;
          for (const it of boss) { r.boss.add(it); r.queue.push(it); }
          r.total += boss.length;
          this.banner('BOSS ROUND', this.colors.bad, { sub: 'your mix-ups come back for more', dur: 2.2 });
          this.q.crown = true;
          this.shake(5);
          return true;
        }
      }
      this.after(0.5, () => this.endRun());
      return false;
    }
    return true;
  }

  /** The boss round: what this learner mixed up, then items flagged myth: true. */
  bossItems() {
    const pool = this.bossPool?.() ?? (this.cfg.items || []);
    const myths = pool.filter((it) => it && it.myth && !this.run.missed.has(it));
    return shuffle([...this.run.missed]).concat(shuffle(myths));
  }

  isBoss(item) { return !!this.run?.boss?.has(item); }

  _mixup(info) {
    const name = info.item ? itemName(info.item) : '';
    const key = `${name}|${info.said}`;
    if (!this.run.mixups.some((m) => m.key === key)) this.run.mixups.push({ key, name, said: info.said, answer: info.answer });
  }

  _openWhy(info) {
    const words = `${info.answer || ''} ${info.why || ''}`.split(/\s+/).length;
    this.run.why = { ...info, t: 0, dur: Math.max(2.4, Math.min(6.5, 1.6 + words * 0.24)) };
    this.phase = 'why';
    this.animateFor?.();
  }

  _closeWhy() {
    const w = this.run.why;
    this.run.why = null;
    this.q.faceT = Math.min(this.q.faceT, 0.8);
    if (this.run.lives <= 0 || this.run.endAfterWhy) { this.endRun(); return; }
    this.phase = 'play';
    this.afterWhy(w);
  }

  // -- SimScene hooks -----------------------------------------------------------------
  update(d) {
    const r = this.run;
    if (this.phase === 'play') {
      r.intro -= d;
      if (r.intro <= GO_S) {   // the countdown is over (GO! may still show)
        r.t += d;
        r.bonus = Math.max(0, r.bonus - d);
        this.tickPlay(d * r.speed, d);
      }
    }
    else if (this.phase === 'why') {
      const w = r.why;
      w.t += d;
      if (w.t >= w.dur) this._closeWhy();
    } else if (this.phase !== 'pause') this._menuT += d;
    if (r && this.phase !== 'pause') {
      // the HUD's own motion: the score rolling up, a heart breaking, the sign
      const gap = r.score - r.shown;
      r.shown = Math.abs(gap) < 0.5 ? r.score : r.shown + gap * Math.min(1, d * 9) + Math.sign(gap) * Math.min(Math.abs(gap), d * 40);
      r.heartT += d;
      if (this._ban && this.phase !== 'why') { this._ban.t += d; if (this._ban.t >= this._ban.dur) this._ban = null; }
    }
    this._tickQuill(d);
  }

  _tickQuill(d) {
    const q = this.q;
    q.faceT = Math.max(0, q.faceT - d);
    if (q.faceT <= 0) q.face = 'happy';
    q.mouth = Math.max(0, q.mouth - d);
    q.hop = Math.max(0, q.hop - d * 1.6);
    q.joy = Math.max(0, q.joy - d * 0.9);
    if (this.phase === 'play') {   // what he does on the field waits out the why card, so it is seen when play resumes
      q.walk = Math.max(0, q.walk - d / Math.max(0.3, this.constructor.INTRO_S - GO_S));
      q.spin = Math.max(0, q.spin - d / 0.85);
      q.flop = Math.max(0, q.flop - d / 1.3);
      q.hide = Math.max(0, q.hide - d / 0.9);
      q.wind = Math.max(0, q.wind - d);
      q.heartX += d;
      q.showerT += d;
    }
    if (this.phase === 'end') q.cheerT += d;
  }

  busy() { return this.phase === 'play' || this.phase === 'why' || (this.phase === 'menu' && this.attractU() < 1); }

  pointerDown(p) {
    this.animateFor?.();
    if (this.phase === 'why') { if (this.run.why.t >= WHY_MIN_S) this._closeWhy(); return; }
    if (this.phase === 'pause') { this._resume(); return; }
    const h = [...this._hits].reverse().find((x) => p.x >= x.x && p.x <= x.x + x.w && p.y >= x.y && p.y <= x.y + x.h);
    if (this.phase === 'menu' || this.phase === 'end') {
      if (h?.id === 'start') this.startRun();
      return;
    }
    if (this.inIntro()) return;
    if (h) this.onHit(h.id, h.data, p);
    else this.tapPlay(p);
  }

  pointerMove(p) { return this.phase === 'play' && !this.inIntro() ? this.movePlay(p) : false; }
  pointerUp(p) { if (this.phase === 'play' && !this.inIntro()) this.releasePlay(p); }

  /** Register a tappable rect while drawing (last one drawn wins a tap). */
  hit(id, r, data) { this._hits.push({ id, x: r.x, y: r.y, w: r.w, h: r.h, data }); }

  /** True when the canvas shows at under 2/3 scale: a phone. */
  phoneUi() { return this._scr >= 1.5; }

  /** A size in design px, n in CSS px on this screen when that is bigger: uiPx(13) is 27 at 390. */
  uiPx(design, n = 13) { return this.phoneUi() ? Math.max(design, Math.ceil(n * this._scr)) : design; }

  draw(ctx, c, t) {
    this._hits = [];
    this._mascotDrawn = false;
    const shown = this._canvas?.getBoundingClientRect?.().width;
    this._scr = shown ? W / shown : 1;
    this.drawWorld(ctx, c, t);
    if (this.phase === 'menu') {
      if (this.drawMenu) this.drawMenu(ctx, c, t, this.attractU());
      else this._drawMenu(ctx, c, t);
      drawVignette(ctx, c, 0.6);
      return;
    }
    this.drawPlay(ctx, c, t);
    const intro = this.phase === 'play' && this.run.intro > 0;
    if (intro && this.run.intro > GO_S) {   // the field waits in the dark while Quill walks in and the numbers count
      ctx.fillStyle = alpha(c.bgDeep, 0.42);
      ctx.fillRect(0, HUD_H, W, H - HUD_H);
    }
    this.drawMascot(ctx, c, t);
    drawVignette(ctx, c, 0.5);
    this._drawSign(ctx, c);
    if (this.phase !== 'end') this._drawHud(ctx, c, t);   // the end card carries the numbers
    if (intro) this._drawCountdown(ctx, c);
    if (this.phase === 'why') this._drawWhy(ctx, c, t);
    if (this.phase === 'pause') this._drawPause(ctx, c, t);
    if (this.phase === 'end') { this._drawEnd(ctx, c, t); this.endDecor?.(ctx, c, t); }
  }

  /**
   * The scene behind every phase. Under the Quill look it is the arcade's own world, Quill's polar
   * scene (drawPolarSky, the ice shelf at floeY()), whatever the course's setting; a flat or paper
   * look keeps its backdrop. A game with a world of its own (Quill's Catch) overrides this.
   */
  drawWorld(ctx, c, t) {
    if (!this.arcadeWorld()) {
      drawBackdrop(ctx, c, 'dots', { t });
      drawDepth(ctx, c, { t, k: this.phase === 'menu' ? 0.8 : 0.45 });
      return;
    }
    drawPolarSky(ctx, c, t);
    drawIceShelf(ctx, c, t, this.floeY());
  }

  /** The countdown over the field: 3, 2, 1 pop in gold, GO! in green as play begins. */
  _drawCountdown(ctx, c) {
    const r = this.run;
    const total = this.constructor.INTRO_S;
    if (total <= GO_S) return;
    const step = (total - GO_S) / 3;
    const left = r.intro;
    const go = left <= GO_S;
    const idx = go ? 3 : Math.min(2, Math.floor((total - left) / step));
    const local = go ? (GO_S - left) / GO_S : ((total - left) - idx * step) / step;   // 0..1 through this number
    const still = this._reduced();
    const text = go ? 'GO!' : String(3 - idx);
    const sc = still ? 1 : go ? 1 + local * 0.35 : outBack(Math.min(1, local / 0.3));
    const fade = go ? 1 - local * local : local > 0.8 ? (1 - local) / 0.2 : 1;
    const px = this.uiPx(104, 60) * sc;
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(c, 800, px, true);
    const col = go ? c.good : c.gold;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = darken(col, 0.7);
    ctx.lineWidth = px * 0.11;
    ctx.strokeText(text, W / 2, H * 0.47 + 4);
    ctx.fillStyle = col;
    ctx.fillText(text, W / 2, H * 0.47);
    if (!still && !go) {   // a ring spreading from each number
      ctx.strokeStyle = alpha(col, 0.5 * (1 - local));
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(W / 2, H * 0.47, 60 + local * 160, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    ctx.textAlign = 'left';
  }

  /** The sign (banner()): a card popping over the field in the Catch sign's style, a small line above the words. */
  _drawSign(ctx, c) {
    const b = this._ban;
    if (!b) return;
    const u = b.t / b.dur;
    const k = u < 0.2 ? (this._reduced() ? 1 : outBack(u / 0.2)) : u > 0.82 ? 1 - (u - 0.82) / 0.18 : 1;
    const phone = this.phoneUi();
    const px = this.uiPx(b.sub ? 34 : 38, phone ? 20 : 24);
    ctx.save();
    ctx.globalAlpha = clamp(k, 0, 1);
    ctx.font = font(c, 800, px, true);
    const w = Math.min(W - 40, Math.max(380, ctx.measureText(b.text).width + 80));
    const h = b.sub ? this.uiPx(92, 70) : this.uiPx(76, 56), x = (W - w) / 2, y = 150 + (1 - k) * 20;
    const L = lookOf(), r = 24 * L.radius;
    if (L.lip > 0) { ctx.fillStyle = darken(b.col, 0.4); rr(ctx, x, y + 6, w, h, r); ctx.fill(); }
    ctx.fillStyle = c.bgSurface; rr(ctx, x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = b.col; ctx.lineWidth = 4; rr(ctx, x, y, w, h, r); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (b.sub) {
      ctx.font = font(c, 800, this.uiPx(15, 12));
      ctx.fillStyle = c.labelMuted;
      ctx.fillText(b.sub.toUpperCase(), W / 2, y + 24);
    }
    ctx.font = font(c, 800, px, true);
    ctx.fillStyle = c.label;
    ctx.fillText(b.text, W / 2, y + (b.sub ? 60 : h / 2 + 1));
    ctx.restore();
    ctx.textAlign = 'left';
  }

  _drawPause(ctx, c) {
    ctx.fillStyle = alpha(c.bgDeep, 0.66);
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(c, 800, 34, true);
    ctx.fillStyle = c.label;
    ctx.fillText('Paused', W / 2, H / 2 - 14);
    ctx.font = font(c, 700, this.uiPx(16));
    ctx.fillStyle = c.labelMuted;
    ctx.fillText('Press Escape or tap to go on', W / 2, H / 2 + 22 + (this.phoneUi() ? 12 : 0));
    ctx.textAlign = 'left';
  }

  // -- drawing: HUD, menu, why card, end card ------------------------------------------
  _drawHud(ctx, c) {
    const r = this.run;
    if (!r) return;
    ctx.fillStyle = alpha(mix(c.bgDeep, c.bgSurface, 0.45), 0.92);
    ctx.fillRect(0, 0, W, HUD_H);
    ctx.fillStyle = alpha(c.stroke, 0.5);
    ctx.fillRect(0, HUD_H - 2, W, 2);
    const phone = this.phoneUi(), hudPx = this.uiPx(16, 11);
    const still = this._reduced();
    const pop = still ? 0 : Math.max(0, 1 - (this.clock - r.scoreT) * 3.5);
    const sc = pill(ctx, c, `SCORE ${Math.round(r.shown)}`, 14, 27, { bg: c.accent, align: 'left', size: hudPx, display: true, scale: 1 + pop * 0.16 });
    let hudX = phone ? sc.x0 + sc.w + 8 : 150;
    if (r.streak >= 2) hudX += pill(ctx, c, `x${r.streak}`, hudX, 27, { bg: r.streak >= 5 ? c.gold : c.warning, align: 'left', size: hudPx, display: true }).w + 8;
    if (!phone) {
      hudX = 230;   // the trail, then the state pill, then the hearts: nothing overlaps
      if (r.bonus > 0) pill(ctx, c, 'BONUS x2', 492, 27, { bg: c.s4, size: 14, display: true });
      else if (r.bossOn) pill(ctx, c, 'BOSS', 492, 27, { bg: c.bad, size: 14, display: true });
    }
    const total = Math.max(1, r.total);
    const heartR = phone ? 15 : 11, heartGap = phone ? 40 : 32;
    const barW = phone ? W - hudX - 26 - this.cfg.lives * heartGap : 190;
    if (barW >= 40) this._drawBulbs(ctx, c, hudX, 27, barW, Math.min(1, r.done / total), { col: r.bossOn ? c.bad : c.gold });
    if (Number.isFinite(r.lives)) {
      for (let i = 0; i < this.cfg.lives; i++) {
        const hx = W - 30 - i * heartGap;
        if (i === r.heartLost && r.heartT < 0.75 && !still) { brokenHeart(ctx, hx, 27, heartR, c.bad, r.heartT / 0.75); continue; }
        heart(ctx, hx, 27, heartR, i < r.lives ? c.bad : mix(c.bgSurface, c.stroke, 0.6));
      }
    } else pill(ctx, c, 'practice', W - 14, 27, { bg: c.s3, align: 'right', size: this.uiPx(14, 11) });
  }

  /** The phone menu: a centred stack, Quill small beside PLAY. The sample row goes: it would push the words below 13 px. */
  _drawMenuPhone(ctx, c, t) {
    const C = this.constructor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.drawKicker(ctx, c, C.KIND.toUpperCase(), W / 2, 44, { size: this.uiPx(13, 11) });
    const px = this.uiPx(18), wide = W - 56;
    const title = this.fitText(ctx, c, this.cfg.title, wide, this.uiPx(38, 20), this.uiPx(24, 16), 800, true);
    let y = 76 + title.size / 2;
    this.drawTitle(ctx, c, title, W / 2, y);
    y += title.lines.length * (title.size + 6);
    const how = this.fitText(ctx, c, this.cfg.how || C.HOW, wide, px, this.uiPx(14, 12), 700, false, 3);
    y += 2 + how.size / 2;
    ctx.font = font(c, 700, how.size);
    ctx.fillStyle = c.labelMuted;
    how.lines.forEach((l) => { ctx.fillText(l, W / 2, y); y += how.size + 6; });
    const text = this.cfg.relaxed ? 'Practice mode: no lives. Every mix-up shows why.' : 'A wrong answer breaks your streak. Letting one slip costs a heart.';
    const rule = this.fitText(ctx, c, text, wide, px, this.uiPx(14, 12), 700, false, 2);
    y += 4;
    ctx.font = font(c, 700, rule.size);
    ctx.fillStyle = mix(c.labelMuted, c.accent, 0.4);
    rule.lines.forEach((l) => { ctx.fillText(l, W / 2, y); y += rule.size + 6; });
    this._button(ctx, c, 'start', 'PLAY', W / 2 - 30, 446, 340, this.uiPx(58, 44), this.ctaColor(c), t, { arrow: true });
    if (this.best) pill(ctx, c, `best ${this.best}`, W / 2 - 30, 500, { bg: c.warning, size: this.uiPx(14, 11) });
    this.drawMenuQuill(ctx, c, t, { x: 598, y: 494, h: 112 });
    ctx.textAlign = 'left';
  }

  /** The desktop menu, laid out like the landing page: the copy on the left, Quill on the right under the deck's sample. */
  _drawMenu(ctx, c, t) {
    if (this.phoneUi()) { this._drawMenuPhone(ctx, c, t); return; }
    const C = this.constructor;
    const x0 = 40, colW = 420;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    this.drawKicker(ctx, c, C.KIND.toUpperCase(), x0, 72, { align: 'left' });
    const title = this.fitText(ctx, c, this.cfg.title, colW, 42, 26, 800, true);
    let y = 102 + title.size / 2;
    this.drawTitle(ctx, c, title, x0, y, { align: 'left' });
    y += title.lines.length * (title.size + 6) + 10;
    const how = this.fitText(ctx, c, this.cfg.how || C.HOW, colW, 17, 14, 700, false, 3);
    ctx.font = font(c, 700, how.size);
    ctx.fillStyle = c.labelMuted;
    ctx.textAlign = 'left';
    how.lines.forEach((l) => { ctx.fillText(l, x0, y + how.size / 2); y += how.size + 6; });
    const ruleText = this.cfg.relaxed ? 'Practice mode: no lives. Every mix-up shows why.' : 'A wrong answer only breaks your streak. Letting one slip costs a heart.';
    const rule = this.fitText(ctx, c, ruleText, colW, 15, 13, 700, false, 2);
    y += 6;
    ctx.font = font(c, 700, rule.size);
    ctx.fillStyle = mix(c.labelMuted, c.accent, 0.4);
    rule.lines.forEach((l) => { ctx.fillText(l, x0, y + rule.size / 2); y += rule.size + 5; });
    const playY = Math.max(424, y + 48);
    this._button(ctx, c, 'start', 'PLAY', x0 + 110, playY, 220, 60, this.ctaColor(c), t, { arrow: true });
    if (this.best) pill(ctx, c, `best ${this.best}`, x0 + 244, playY, { bg: c.warning, align: 'left', size: 14 });
    // the cabinet's blinking invitation under the button
    if (playY + 56 < H - 10 && (this._reduced() || (this._menuT % 1.3) < 0.85)) {
      ctx.font = font(c, 800, 12);
      ctx.fillStyle = alpha(c.gold, 0.9);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      spacedText(ctx, 'PRESS PLAY TO START', x0 + 2, playY + 52, 1.9);
    }
    // the right column: the attract demo or three sample cards, then Quill under them
    const sample = this.menuDemo ? [] : (this.menuSample?.() || []);
    if (this.menuDemo) this.menuDemo(ctx, c, t, this.attractU());
    sample.slice(0, 3).forEach((it, i) => {
      const y1 = 82 + i * 58 + Math.sin(this._menuT * 2 + i) * 3;
      this.drawToken(ctx, c, it, 560, y1, 190, 52, { t, tint: this.menuTint?.(c), tilt: (i - 1) * 0.04 });
    });
    this.drawMenuQuill(ctx, c, t, { x: 560, y: 442, h: 160, bubble: true });
    ctx.textAlign = 'left';
  }

  /** Quill on the menu: breathing, a wave now and then, a bubble over his head when asked. */
  drawMenuQuill(ctx, c, t, o) {
    if (!this._kitQuill()) return;
    const T = this._menuT;
    const wave = (T % 7) < 1.4 && !this._reduced() ? Math.sin(((T % 7) / 1.4) * Math.PI) : 0;   // one wave every 7 s
    const br = Math.sin(t * 1.65);
    drawQuill(ctx, c, {
      x: o.x, y: o.y, h: o.h, face: 'happy', mouth: wave > 0.5 ? 'open' : 'closed',
      blink: (t % 4.6) > 4.45 ? 1 : 0, look: [0, -3], squash: [1 + br * 0.012, 1 - br * 0.015],
      wingL: 0.25, wingR: -0.25 - wave * 2.4 + Math.sin(t * 14) * 0.25 * wave, scarf: Math.sin(t * 3) * 0.12,
      flip: o.flip, shadow: 1,
    });
    if (o.bubble) {
      const line = this.best ? `Beat ${this.best}?` : wave > 0 ? 'Hi! Ready?' : 'Tap PLAY!';
      const top = o.y - o.h * 0.94;
      speechBubble(ctx, c, line, o.x, top - 36, o.x, top + 4, { size: 17 });
    }
  }

  /**
   * Quill during play, where the archetype stands him (mascotSpot, or a spot passed by drawPlay),
   * doing what the run makes him do: the walk in during the countdown, the jump and spin on a
   * streak, wings over his eyes after a wrong try, the belly-flop after a slip (a heart breaking
   * over him), the crown of the boss round, the lean into the wind when the pace steps up.
   */
  drawMascot(ctx, c, t, spot = this.mascotSpot()) {
    if (!spot || this._mascotDrawn || !this._kitQuill()) return;
    if (this.phase !== 'play' && this.phase !== 'pause') return;
    this._mascotDrawn = true;
    const q = this.q, still = this._reduced();
    const br = Math.sin(t * 1.65);
    const blink = (t % 4.6) > 4.45 ? 1 : 0;
    const dir = spot.flip ? -1 : 1;
    const at = spot.lookAt;
    const look = at ? [clamp((at.x - spot.x) / 55, -4, 4), clamp((at.y - (spot.y - spot.h * 0.62)) / 55, -4, 3)] : [0, -1];
    const hc = spot.h * 0.46;   // his middle, above his feet
    const o = {
      x: spot.x, y: spot.y, h: spot.h, face: q.face, blink, look, flip: spot.flip, lean: spot.lean || 0,
      scarf: Math.sin(t * 3) * 0.12, shadow: 1, squash: [1 + br * 0.012, 1 - br * 0.015], wingL: 0.25, wingR: -0.25,
      mouth: q.mouth > 0 ? 'open' : 'closed',
    };
    if (q.walk > 0 && !still) {
      // the walk in from the left edge: feet alternating, a lean into the step, eyes on the road
      const u = 1 - q.walk, e = u * u * (3 - 2 * u);
      const step = Math.abs(Math.sin(t * 11));
      Object.assign(o, {
        x: -70 + (spot.x + 70) * e, y: spot.y - step * 5, lean: 0.1, flip: false, look: [3, 0], face: 'happy',
        squash: [1 - step * 0.03, 1 + step * 0.03], wingL: 0.25 + step * 0.2, wingR: -0.25 - step * 0.2, scarf: -0.25 + Math.sin(t * 9) * 0.15,
      });
      drawQuill(ctx, c, o);
      return;
    }
    if (q.spin > 0 && !still) {
      // a jump with a full turn about his middle, snow puffing up where he lands
      const u = 1 - q.spin, a = u * Math.PI * 2 * dir;
      const lift = Math.sin(u * Math.PI) * 48;
      const cy = spot.y - hc - lift;
      drawShadow(ctx, c, spot.x, spot.y, spot.h * 0.34, spot.h * 0.08, 1 - lift / 90);
      Object.assign(o, {
        x: spot.x - hc * Math.sin(a), y: cy + hc * Math.cos(a), lean: a, shadow: 0, face: 'happy', joy: 1, mouth: 'open',
        wingL: 1.2, wingR: -1.2, squash: [1, 1], scarf: 0.4,
      });
      drawQuill(ctx, c, o);
      if (u > 0.82) snowPuffs(ctx, c, spot.x, spot.y, (u - 0.82) / 0.18, spot.h);
      return;
    }
    if (q.flop > 0 && !still) {
      // the knock: squashed flat and dazed (stars circling), then he springs back up; the heart breaks over him
      const u = 1 - q.flop;
      const down = u < 0.25 ? outBack(u / 0.25) : u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      Object.assign(o, {
        face: 'sad', blink: down > 0.6 ? 1 : blink, mouth: 'open', squash: [1 + down * 0.22, 1 - down * 0.3],
        wingL: 0.25 + down * 1.2, wingR: -0.25 - down * 1.2, scarf: down * 0.4,
      });
      drawQuill(ctx, c, o);
      if (u > 0.2 && u < 0.5) snowPuffs(ctx, c, spot.x, spot.y, (u - 0.2) / 0.3, spot.h);
      const head = spot.y - quillBox(spot.h).headY * (1 - down * 0.3);   // the top of his squashed head
      if (down > 0.5) dazeStars(ctx, c, spot.x, head - 6, t, down);
      if (q.heartX < 0.9) brokenHeart(ctx, spot.x, head - 24, Math.max(9, spot.h * 0.11), c.bad, q.heartX / 0.9);
      return;
    }
    const cover = still || q.hide <= 0 ? 0 : Math.min(1, Math.min(q.hide, 1 - q.hide) * 4);   // wings up over the eyes, then down
    const wind = still ? 0 : Math.min(1, q.wind);
    const hop = Math.sin(q.hop * Math.PI) * 16;
    const sad = q.face === 'sad', sur = q.face === 'surprised';
    const up = q.joy > 0.3 || q.hop > 0 ? 1 : 0;
    const wing = sad ? 0.05 : sur ? 0.7 : up ? 1 : 0.25;
    Object.assign(o, {
      y: spot.y - hop, joy: q.joy > 0.3 ? 1 : q.joy / 0.3, mouth: q.mouth > 0 || sur ? 'open' : 'closed',
      lean: (spot.lean || 0) + (sad ? 0.06 : 0) + wind * 0.1 * dir,
      squash: q.hop > 0.85 ? [1.08, 0.92] : [1 + br * 0.012, 1 - br * 0.015],
      wingL: wing + (up ? Math.sin(t * 12) * 0.2 : 0) + cover * 2.2, wingR: -wing - (up ? Math.sin(t * 12) * 0.2 : 0) - cover * 2.2,
      scarf: Math.sin(t * 3) * 0.12 + wind * (0.35 + Math.sin(t * 15) * 0.3), shadow: 1 - hop / 40,
    });
    if (wind > 0) windLines(ctx, c, spot.x - dir * spot.h * 0.42, spot.y - hc, dir, wind, t);
    drawQuill(ctx, c, o);
    if (q.crown) crown(ctx, c, spot.x, spot.y - hop - quillBox(spot.h).headY + 5, Math.max(9, spot.h * 0.1));
    if (q.showerT < 1.25) this._cheerBits(ctx, c, spot.x, spot.y - hc, q.showerT);
  }

  /** Quill beside the why card (explaining) or the end card (cheering, or a shrug). feet at (x, y). */
  _drawCardQuill(ctx, c, t, x, y, h, mode) {
    const q = this.q;
    const br = Math.sin(t * 1.65);
    if (mode === 'why') {
      const sad = q.face === 'sad';
      drawQuill(ctx, c, {
        x, y, h, face: sad ? 'sad' : 'surprised', mouth: sad ? 'closed' : 'open', look: [4, -1],
        blink: (t % 4.6) > 4.45 ? 1 : 0, squash: [1 + br * 0.012, 1 - br * 0.015],
        wingL: sad ? 0.05 : 0.3, wingR: sad ? -0.05 : -1.25 + Math.sin(t * 3) * 0.08, scarf: Math.sin(t * 3) * 0.12,
      });
      return;
    }
    const T = q.cheerT || 0;
    if (q.won) {
      const k = Math.max(0, 1 - T / 2.2);
      const hop = Math.max(0, Math.sin(T * 6)) * 16 * k;
      const flap = Math.sin(T * 9) * 0.3 * k;
      this._cheerBits(ctx, c, x, y - h * 0.55, T);
      drawQuill(ctx, c, {
        x, y: y - hop, h, face: 'happy', joy: 1, mouth: 'open', look: [0, -2],
        squash: hop > 10 ? [0.96, 1.05] : [1, 1], wingL: 1.15 + flap, wingR: -1.15 - flap, scarf: Math.sin(T * 7) * 0.3 * k + 0.1, shadow: 1 - hop / 40,
      });
    } else {
      drawQuill(ctx, c, {
        x, y, h, face: 'sad', mouth: 'closed', look: [3, 2], blink: (t % 4.6) > 4.45 ? 1 : 0,
        lean: 0.05, squash: [1 + br * 0.012, 1 - br * 0.015], wingL: 1.5, wingR: -1.5, scarf: Math.sin(t * 2) * 0.08,
      });
    }
  }

  /** The bits of his cheer (the rig's confetti): they fly out from behind him over the first second, then are gone. */
  _cheerBits(ctx, c, x, y, T) {
    if (this._reduced() || !lookOf().popSparkles) return;
    const u = T / 1.25;
    if (u >= 1) return;
    const e = 1 - (1 - u) * (1 - u);
    const cols = [c.s1, c.gold, c.qScarf, c.s7, c.s5, c.s6, c.s4, c.gold, c.s1, c.s4];
    ctx.save();
    ctx.globalAlpha = 1 - u * u;
    CHEER_BITS.forEach(([shape, dx, dy, spin], i) => {
      ctx.save();
      ctx.translate(x + dx * e, y + dy * e + 40 * u * u);
      ctx.rotate((spin * Math.PI / 180) * e);
      ctx.fillStyle = cols[i % cols.length];
      if (shape === 'rect') { rr(ctx, -7, -4, 14, 8, 2); ctx.fill(); }
      else if (shape === 'dot') { ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); }
      else { star(ctx, 0, 0, 8, 4, 0.45); ctx.fill(); }
      ctx.restore();
    });
    ctx.restore();
  }

  // -- landing-page chrome: kicker, title, CTA, marquee bulbs --------------------------
  /** The PLAY colour: the landing page's coral. */
  ctaColor(c) { return c.cta ?? mix(c.s8, c.s6, 0.4); }

  /** A kicker chip (the landing page's tag): letter-spaced caps in a tinted outlined pill. Returns its box. */
  drawKicker(ctx, c, text, x, y, o = {}) {
    const col = o.col ?? c.s7, size = o.size ?? 13, gap = size * 0.14;
    const ink = luma(c.bgDeep) > 0.5 ? darken(col, 0.3) : col;
    ctx.font = font(c, 800, size);
    const tw = spacedWidth(ctx, text, gap), w = tw + 26, h = size + 14;
    const x0 = o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2;
    ctx.fillStyle = mix(c.bgDeep, col, 0.16);
    rr(ctx, x0, y - h / 2, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = alpha(col, 0.6);
    ctx.lineWidth = 1.5;
    rr(ctx, x0, y - h / 2, w, h, h / 2); ctx.stroke();
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    spacedText(ctx, text, x0 + 13, y + 0.5, gap);
    return { x0, y0: y - h / 2, w, h };
  }

  /**
   * The title, as the landing page sets a headline: plain lines, then the last line in the
   * gold-coral-pink gradient over a brush swash with a sparkle at its end. fit: from fitText.
   */
  drawTitle(ctx, c, fit, x, y, o = {}) {
    const { lines, size } = fit;
    const align = o.align ?? 'center';
    ctx.font = font(c, 800, size, true);
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => {
      const ly = y + i * (size + 6);
      const w = ctx.measureText(l).width;
      const x0 = align === 'left' ? x : x - w / 2;
      if (i < lines.length - 1) { ctx.fillStyle = c.label; ctx.fillText(l, x, ly); return; }
      const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      g.addColorStop(0, c.gold); g.addColorStop(0.5, c.s8); g.addColorStop(1, c.s4);
      ctx.save();
      ctx.globalAlpha *= 0.9;
      ctx.fillStyle = g;
      swash(ctx, x0 - w * 0.01, ly + size * 0.42, w * 1.04, size * 0.2);
      ctx.restore();
      ctx.fillStyle = g;
      ctx.fillText(l, x, ly);
      sparkle(ctx, x0 + w + size * 0.18, ly - size * 0.34, size * 0.13, c.gold);
    });
  }

  /** Progress dots along (x, y) over w px: lit from the left by u (0..1). */
  _drawBulbs(ctx, c, x, y, w, u, o = {}) {
    const phone = this.phoneUi();
    const r = phone ? 5.6 : 3.8, sp = phone ? 20 : 13;   // a phone shows the design at about half size
    const n = Math.max(6, Math.min(26, Math.floor(w / sp)));
    const step = w / n, lit = Math.round(u * n);
    const col = o.col ?? c.gold;
    for (let i = 0; i < n; i++) {
      const bx = x + step * (i + 0.5);
      if (i < lit) {
        ctx.fillStyle = alpha(col, 0.3);
        ctx.beginPath(); ctx.arc(bx, y, r * 1.85, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(bx, y, r, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = mix(c.bgSurface, c.stroke, 0.55);
        ctx.beginPath(); ctx.arc(bx, y, r * 0.8, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  _drawWhy(ctx, c) {
    const w = this.run.why;
    const k = Math.min(1, w.t / 0.25);
    ctx.fillStyle = alpha(c.bgDeep, 0.72 * k);
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    this.whyHint?.(ctx, c, w);
    const phone = this.phoneUi();
    const side = !phone && this._kitQuill();
    const cw = phone ? 648 : 520, ch = phone ? 396 : 250, x = side ? 128 : (W - cw) / 2, y = (phone ? 86 : 120) + (1 - outBack(k)) * 30;
    const cx = x + cw / 2;   // the card's middle: beside Quill it is not the canvas's
    ctx.save();
    ctx.globalAlpha = k;
    cardBox(ctx, c, x, y, cw, ch, w.lostLife ? c.bad : c.warning, side ? { tail: { x: x - 20, y: y + ch - 72 } } : {});
    if (side) this._drawCardQuill(ctx, c, this.clock, 64, y + ch - 4, 116, 'why');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    pill(ctx, c, w.lostLife ? 'MISSED' : 'MIX-UP', cx, y + (phone ? 8 : 0), { bg: w.lostLife ? c.bad : c.warning, size: this.uiPx(15, 11), display: true });
    ctx.font = font(c, 800, 24, true);
    ctx.fillStyle = c.label;
    const head = this.fitText(ctx, c, w.title, cw - 40, this.uiPx(24, 16), this.uiPx(16, 13), 800, true);
    const headY = y + (phone ? 54 : 42);
    head.lines.forEach((l, i) => { ctx.font = font(c, 800, head.size, true); ctx.fillText(l, cx, headY + i * (head.size + 4)); });
    let yy = headY + 8 + head.lines.length * (head.size + 4);
    if (w.answer) {
      const ans = this.fitText(ctx, c, w.answer, cw - 60, this.uiPx(20, 14), this.uiPx(15, 12.5), 800);
      const box = { x: x + 24, y: yy, w: cw - 48, h: ans.lines.length * (ans.size + 6) + 16 };
      ctx.fillStyle = mix(c.bgSurface, c.good, 0.22);
      rr(ctx, box.x, box.y, box.w, box.h, 12 * lookOf().radius); ctx.fill();
      ctx.font = font(c, 800, ans.size);
      ctx.fillStyle = c.label;
      ans.lines.forEach((l, i) => ctx.fillText(l, cx, box.y + 8 + ans.size / 2 + 2 + i * (ans.size + 6)));
      yy = box.y + box.h + 10;
    }
    if (w.why) {
      const why = this.fitText(ctx, c, w.why, cw - 60, this.uiPx(17), this.uiPx(14, 12), 700, false, 4);
      ctx.font = font(c, 700, why.size);
      ctx.fillStyle = c.labelMuted;
      why.lines.forEach((l, i) => ctx.fillText(l, cx, yy + why.size / 2 + i * (why.size + 5)));
    }
    // time left, and "tap to go on" once it may be dismissed
    const u = Math.min(1, w.t / w.dur);
    ctx.fillStyle = mix(c.bgSurface, c.stroke, 0.5);
    rr(ctx, x + 24, y + ch - 16, cw - 48, 6, 3); ctx.fill();
    ctx.fillStyle = w.lostLife ? c.bad : c.warning;
    rr(ctx, x + 24, y + ch - 16, (cw - 48) * (1 - u), 6, 3); ctx.fill();
    if (w.t >= WHY_MIN_S) { const px = this.uiPx(14, 12); ctx.font = font(c, 700, px); ctx.fillStyle = c.labelMuted; ctx.fillText('tap to go on', cx, y + ch - 28 - px / 2 + (phone ? -4 : 3)); }
    ctx.restore();
    ctx.textAlign = 'left';
  }

  _drawEnd(ctx, c, t) {
    const r = this.run;
    ctx.fillStyle = alpha(c.bgDeep, 0.82);
    ctx.fillRect(0, 0, W, H);
    const phone = this.phoneUi();
    const side = !phone && this._kitQuill();
    const cw = phone ? 648 : side ? 500 : 560, ch = phone ? 448 : 420, x = side ? 150 : (W - cw) / 2, y = phone ? 62 : 70;
    const cx = x + cw / 2;
    const still = this._reduced();
    const T = still ? 9 : this.q.cheerT;   // the card's own clock: the score rolls, the stars land, the ribbon drops
    cardBox(ctx, c, x, y, cw, ch, r.won ? c.good : c.bad);
    if (side) this._drawCardQuill(ctx, c, t, 78, y + ch - 8, 108, 'end');   // beside the card, clear of it
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const acc = r.tries ? r.right / r.tries : 0;
    const stars = !r.won ? 0 : acc >= 0.95 ? 3 : acc >= 0.75 ? 2 : 1;
    // the verdict, like the landing page's poster line
    const titleSize = this.uiPx(40, 24), titleY = y + (phone ? 40 : 48);
    if (r.won) this.drawTitle(ctx, c, { lines: [stars === 3 && !r.mixups.length ? 'PERFECT!' : 'CLEARED!'], size: titleSize }, cx, titleY);
    else {
      ctx.font = font(c, 800, titleSize, true);
      ctx.fillStyle = c.bad;
      ctx.fillText('GAME OVER', cx, titleY);
    }
    const starY = y + (phone ? 88 : 100), starR = phone ? 17 : 20;
    for (let i = 0; i < 3; i++) {
      const on = i < stars;
      const u = still ? 1 : clamp((T - 0.9 - i * 0.25) / 0.3, 0, 1);
      const sc = on ? outBack(u) : 1;
      const sx = cx + (i - 1) * 56, sy = starY + (i === 1 ? -6 : 0);
      if (on && u <= 0) continue;
      star(ctx, sx, sy, (on ? starR : starR * 0.85) * Math.max(0.01, sc));
      ctx.fillStyle = on ? c.warning : mix(c.bgSurface, c.stroke, 0.6);
      ctx.fill();
      if (on && u > 0 && u < 1 && lookOf().popSparkles) sparkle(ctx, sx + starR * 1.1, sy - starR * 0.9, starR * 0.45 * (1 - u) + 2, c.gold);
    }
    const roll = still ? 1 : clamp(T / 1.1, 0, 1);
    const shown = Math.round(r.score * (1 - (1 - roll) * (1 - roll)));
    ctx.font = font(c, 800, this.uiPx(28, 17), true);
    ctx.fillStyle = c.label;
    ctx.fillText(r.won ? `Score ${shown}` : `Out of hearts - score ${shown}`, cx, y + (phone ? 130 : 146));
    ctx.font = font(c, 700, this.uiPx(15, 12));
    ctx.fillStyle = c.labelMuted;
    const pct = Math.round(acc * 100);
    ctx.fillText(phone ? `${pct}% right   best streak ${r.topStreak}` : `${pct}% right first time   best streak ${r.topStreak}   best ${this.best}`, cx, y + (phone ? 160 : 176));
    if (r.newBest && T > 1.6) {   // the ribbon on the card's corner
      const u = still ? 1 : clamp((T - 1.6) / 0.3, 0, 1);
      ctx.save();
      ctx.translate(x + cw - (phone ? 92 : 78), y + (phone ? 30 : 34));
      ctx.rotate(-0.2);
      pill(ctx, c, 'NEW BEST!', 0, 0, { bg: c.gold, size: this.uiPx(15, 12), display: true, scale: outBack(u) * (still ? 1 : 1 + Math.sin(t * 5) * 0.03) });
      ctx.restore();
    }
    ctx.font = font(c, 800, this.uiPx(17));
    ctx.fillStyle = c.label;
    const mx = r.mixups.slice(0, phone ? 3 : 4);
    const listY = y + (phone ? 196 : 208);
    ctx.fillText(mx.length ? 'Look again at:' : 'No mix-ups. Clean run!', cx, listY);
    const btnH = this.uiPx(56, 44), btnY = y + ch - (phone ? 12 + btnH / 2 : 50);
    // one size for the whole list (the longest line sets it, down to a floor); a line still too long ends in an ellipsis
    // "X: not A - X goes in B" reads as "X: not A - goes in B": the name is not said twice
    const lines = mx.map((m) => {
      const ans = m.name && String(m.answer || '').startsWith(m.name) ? String(m.answer).slice(m.name.length).trim() : m.answer;
      return m.name ? `${m.name}: not ${m.said} - ${ans}` : `not ${m.said} - ${ans}`;
    });
    const maxW = cw - (phone ? 36 : 60), minSize = this.uiPx(13, 11);
    let size = this.uiPx(15, 12);
    ctx.font = font(c, 700, size);
    while (size > minSize && lines.some((l) => ctx.measureText(l).width > maxW)) { size -= 1; ctx.font = font(c, 700, size); }
    ctx.fillStyle = mix(c.labelMuted, c.warning, 0.35);
    let ly = listY + (phone ? 36 : 28);
    for (const l of lines) {
      if (ly + size / 2 > btnY - btnH / 2 - 8) break;       // the card is full: what fits, never over the button
      ctx.fillText(ellipsize(ctx, l, maxW), cx, ly);
      ly += size + (phone ? 10 : 7);
    }
    this._button(ctx, c, 'start', 'PLAY AGAIN', cx, btnY, phone ? 360 : 220, btnH, c.good, t);
    ctx.textAlign = 'left';
  }

  /** A big pill button with a lip that registers a hit target (id). */
  button(ctx, c, id, label, cx, cy, w, h, col, t) { this._button(ctx, c, id, label, cx, cy, w, h, col, t); }

  _button(ctx, c, id, label, cx, cy, w, h, col, t, o = {}) {
    const pulse = 1 + Math.sin(t * 4) * 0.025;
    const bw = w * pulse, bh = h * pulse;
    const x = cx - bw / 2, y = cy - bh / 2;
    const L = lookOf(), br = Math.min(L.pill, bh / 2);
    ctx.fillStyle = darken(col, 0.4);
    rr(ctx, x, y + 6 * L.lip, bw, bh, br); ctx.fill();
    ctx.fillStyle = col;
    rr(ctx, x, y, bw, bh, br); ctx.fill();
    const px = this.uiPx(22, 15);
    ctx.font = font(c, 800, px, true);
    ctx.fillStyle = c.bgDeep;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (o.arrow) {
      // the landing CTA: label, then an arrow that nudges right as the button pulses
      const tw = ctx.measureText(label).width, aw = px * 0.9, gap = px * 0.45;
      const lx = cx - (tw + gap + aw) / 2;
      ctx.textAlign = 'left';
      ctx.fillText(label, lx, cy + 2);
      const ax = lx + tw + gap + (pulse - 1) * 60, ay = cy + 1;
      ctx.strokeStyle = c.bgDeep;
      ctx.lineWidth = Math.max(2.5, px * 0.14);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(ax + aw, ay);
      ctx.moveTo(ax + aw - aw * 0.42, ay - aw * 0.42); ctx.lineTo(ax + aw, ay); ctx.lineTo(ax + aw - aw * 0.42, ay + aw * 0.42);
      ctx.stroke();
    } else ctx.fillText(label, cx, cy + 2);
    this.hit(id, { x: cx - w / 2, y: cy - h / 2, w, h: h + 5 });   // the unpulsed size: a stable target
  }

  // -- shared drawing services ----------------------------------------------------------
  /** Series colour for a tone number 1-8, or a stable one from a string. */
  tone(key) {
    const c = this.colors;
    const s = [c.s1, c.s2, c.s3, c.s4, c.s5, c.s6, c.s7, c.s8];
    if (Number.isInteger(key) && key >= 1 && key <= 8) return s[key - 1];
    let h = 0;
    for (const ch of String(key ?? '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return s[Math.abs(h) % 8];
  }

  /**
   * Word-wrap text to maxW, shrinking from maxSize to minSize; at most maxLines
   * lines (the last one gets an ellipsis). Returns { lines, size }.
   */
  fitText(ctx, c, text, maxW, maxSize, minSize, weight = 800, display = false, maxLines = 2) {
    const words = String(text ?? '').split(/\s+/).filter(Boolean);
    const wrap = (size) => {
      ctx.font = font(c, weight, size, display);
      const lines = [];
      let cur = '';
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (ctx.measureText(next).width <= maxW || !cur) cur = next;
        else { lines.push(cur); cur = w; }
      }
      if (cur) lines.push(cur);
      return lines;
    };
    const fits = (lines, n) => lines.length <= n && lines.every((l) => ctx.measureText(l).width <= maxW);
    const top = Math.max(minSize, Math.floor(maxSize));
    for (let size = top; size >= minSize; size -= 1) {
      const lines = wrap(size);
      if (fits(lines, maxLines)) return { lines, size };
    }
    // Never hide words the player needs: shrink below minSize, and allow one more line, before truncating.
    const floor = Math.max(10, minSize - 4);
    for (let size = minSize - 1; size >= floor; size -= 1) {
      const lines = wrap(size);
      if (fits(lines, maxLines + 1)) return { lines, size };
    }
    const lines = wrap(minSize);
    const kept = lines.slice(0, maxLines);
    let last = kept[kept.length - 1] || '';
    while (last && ctx.measureText(`${last}...`).width > maxW) last = last.slice(0, -1);
    if (lines.length > maxLines || last !== kept[kept.length - 1]) kept[kept.length - 1] = `${last}...`;
    return { lines: kept, size: minSize };
  }

  /**
   * An item card centred at (cx, cy): art disc on the left, name on the right.
   * The field-guide card look: flat deep fill, a tone rim and a solid tone lip.
   * item: { name, art?, tone? } or a plain string. o: { glow, scale, alpha, t, tint, label }
   */
  drawToken(ctx, c, item, cx, cy, w, h, o = {}) {
    const name = o.label ?? itemName(item);
    const col = o.tint ?? this.tone(item?.tone ?? item?.id ?? name);
    const s = o.scale ?? 1;
    ctx.save();
    ctx.translate(cx, cy);
    if (o.tilt && !lookOf().flattenScenes) ctx.rotate(o.tilt);
    ctx.scale(s, s);
    ctx.globalAlpha *= o.alpha ?? 1;
    const L = lookOf();
    const x = -w / 2, y = -h / 2, r = Math.min(16 * L.radius, h / 2);
    if (o.glow) {
      // the live item: a soft pulsing ring, never a fill that tints the card
      const g = 0.5 + 0.5 * Math.sin((o.t ?? 0) * 6);
      ctx.strokeStyle = alpha(col, 0.25 + 0.35 * g);
      ctx.lineWidth = 3;
      rr(ctx, x - 6, y - 6, w + 12, h + 16, r + 6); ctx.stroke();
    }
    ctx.fillStyle = col;
    rr(ctx, x, y + 4 * L.lip, w, h, r); ctx.fill();
    ctx.fillStyle = c.bgDeep;
    rr(ctx, x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5 * L.rim;
    rr(ctx, x + 1.25, y + 1.25, w - 2.5, h - 2.5, Math.max(0, r - 1)); ctx.stroke();
    if (item && typeof item === 'object' && this.isBoss(item)) crown(ctx, c, 0, y - 4, 14);
    const art0 = item && typeof item === 'object' ? item.art : undefined;
    const art = art0 === undefined && o.face !== false ? { mood: o.mood || 'smile' } : art0;
    const ar = Math.min(h * 0.36, 26);
    const hasArt = art !== undefined && art !== null && art !== false;
    const ax = x + 8 + ar;
    if (hasArt) this._drawArt(ctx, c, art, ax, 0, ar, col, o.t ?? 0);
    const tx = hasArt ? ax + ar + 8 : x + 12;
    const tw = w - (tx - x) - 10;
    const f = this.fitText(ctx, c, name, tw, Math.min(18, h * 0.36), 12, 800, false, o.maxLines ?? 2);
    ctx.font = font(c, 800, f.size);
    ctx.fillStyle = c.label;
    ctx.textAlign = hasArt ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    const lx = hasArt ? tx : 0;
    f.lines.forEach((l, i) => ctx.fillText(l, lx, (i - (f.lines.length - 1) / 2) * (f.size + 2)));
    ctx.restore();
    ctx.textAlign = 'left';
  }

  _drawArt(ctx, c, art, x, y, r, col, t) {
    ctx.fillStyle = darken(col, 0.3);
    ctx.beginPath(); ctx.arc(x, y + 2, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    const ref = typeof art === 'string' ? art : art?.img;
    const svgImg = typeof art?.svg === 'string' ? this._svgImage(art.svg, c) : null;
    if (svgImg) {
      // a course drawing (inline SVG): fitted whole inside the circle, never cropped
      const k = (1.8 * r) / Math.max(svgImg.width || 1, svgImg.height || 1);
      ctx.drawImage(svgImg, x - (svgImg.width * k) / 2, y - (svgImg.height * k) / 2, svgImg.width * k, svgImg.height * k);
      return;
    }
    if (art?.svg) return; // still decoding: the plain disc for a frame, never a face
    if (ref && /\.(png|jpe?g|webp|svg|gif)$/i.test(ref)) {
      const img = this._image(ref);
      if (img) {
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r - 2, 0, Math.PI * 2); ctx.clip();
        const k = Math.max((2 * r) / img.width, (2 * r) / img.height);
        ctx.drawImage(img, x - (img.width * k) / 2, y - (img.height * k) / 2, img.width * k, img.height * k);
        ctx.restore();
        return;
      }
    }
    const glyph = typeof art === 'string' && !ref?.includes('.') ? art : art?.glyph;
    if (glyph) {
      ctx.font = font(c, 800, Math.round(r * 1.05), true);
      ctx.fillStyle = darken(col, 0.8);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, x, y + 1);
      return;
    }
    drawFace(ctx, x, y + 1, r * 0.95, { col, c, mood: art?.mood ?? 'smile', t });
  }

  // Inline SVG art ({ svg: '<svg ...>' }): var(--token) colours are resolved against the canvas's computed style,
  // so the drawing follows the theme; one decoded image per drawing per theme.
  _svgImage(svg, c) {
    if (typeof Image === 'undefined' || typeof getComputedStyle === 'undefined' || !this.canvas) return null;
    const key = `${c.bgDeep}|${svg}`;
    let e = this._art.get(key);
    if (!e) {
      const cs = getComputedStyle(this.canvas);
      const val = (name, fb) => (cs.getPropertyValue(name).trim() || (fb ?? '').trim());
      let out = svg;
      for (let i = 0; i < 4 && out.includes('var(--'); i++) {
        out = out.replace(/var\((--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (m, n, fb) => val(n, fb) || m);
      }
      if (!/xmlns=/.test(out)) out = out.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      const img = new Image();
      e = { img, ok: false };
      img.onload = () => { e.ok = true; this.animateFor?.(300); };
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(out)}`;
      this._art.set(key, e);
    }
    return e.ok ? e.img : null;
  }

  _image(ref) {
    if (typeof Image === 'undefined') return null;
    let e = this._art.get(ref);
    if (!e) {
      const img = new Image();
      e = { img, ok: false };
      img.onload = () => { e.ok = true; this.animateFor?.(300); };
      img.src = this._host.resolveMedia?.(ref) ?? ref;
      this._art.set(ref, e);
    }
    return e.ok ? e.img : null;
  }
}

// -- module helpers (claim no names on the scene) ------------------------------------------

export function itemName(item) {
  return typeof item === 'string' ? item : item?.name ?? item?.text ?? item?.prompt ?? '';
}

export function shuffle(a) {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A raised card with a coloured rim, for the why and end cards. o.tail: { x, y } a speech tail from the card's left edge toward that point. */
export function cardBox(ctx, c, x, y, w, h, rim, o = {}) {
  const L = lookOf(), r = 20 * L.radius;
  const shape = (dy) => {
    rr(ctx, x, y + dy, w, h, r);
    if (o.tail) {
      const ty = Math.max(y + r + 10, Math.min(y + h - r - 10, o.tail.y));
      ctx.moveTo(x + 2, ty - 14 + dy); ctx.lineTo(o.tail.x, ty + 6 + dy); ctx.lineTo(x + 2, ty + 14 + dy); ctx.closePath();
    }
  };
  ctx.fillStyle = darken(rim, 0.5);
  shape(6 * L.lip); ctx.fill();
  ctx.fillStyle = rim;
  shape(0); ctx.fill();
  ctx.fillStyle = c.bgSurface;
  ctx.save();
  shape(0); ctx.clip();
  rr(ctx, x + 4 * L.rim, y + 4 * L.rim, w - 8 * L.rim, h - 8 * L.rim, Math.max(2, r - 4 * L.rim)); ctx.fill();
  if (o.tail) {
    const ty = Math.max(y + r + 10, Math.min(y + h - r - 10, o.tail.y));
    ctx.beginPath(); ctx.moveTo(x + 6, ty - 9); ctx.lineTo(o.tail.x + 6, ty + 5); ctx.lineTo(x + 6, ty + 9); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/** Quill's mood and what he is doing (see drawMascot): timers run 1 -> 0, clocks 0 -> up. */
function quillState() {
  return { face: 'happy', faceT: 0, mouth: 0, hop: 0, joy: 0, cheerT: 0, won: false, walk: 0, spin: 0, flop: 0, hide: 0, wind: 0, crown: false, heartX: 9, showerT: 9 };
}

/** text cut to maxW with an ellipsis, at the current font. */
function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}...`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}...`;
}

// -- the arcade world: Quill's polar scene, the Catch game's world shared by every game ------------------
export const SKY_HZ = 300;           // the sea's horizon (an archetype whose floor meets it sets floeY() to this)
const RNG = mulberry32(23);
const STARS = Array.from({ length: 46 }, () => [RNG() * W, HUD_H + RNG() * 220, 0.6 + RNG() * 1.4, RNG() * 6]);
const CRACKS = [[36, 30, 58, 44, 92, 50], [228, 62, 262, 70, 280, 92], [540, 28, 566, 46, 612, 52], [430, 70, 452, 60, 476, 74]];

/** The theme is dark: the world is the night; by day it is a dusk. */
export function isDarkTheme(c) { return luma(c.bgDeep) < 0.35; }

/** Night (or, in light theme, dusk) over a polar sea: the sky with stars and the aurora, a moon, far bergs, the sea to the bottom. */
export function drawPolarSky(ctx, c, t) {
  const dark = isDarkTheme(c);
  const top = dark ? mix(c.bgDeep, c.seaDeep, 0.3) : mix(c.skyDay, c.seaDeep, 0.35);
  const midSky = dark ? mix(c.bgDeep, c.s5, 0.25) : mix(c.skyDay, c.s5, 0.2);
  const horizon = mix(c.skyDusk, dark ? c.bgDeep : c.skyDay, dark ? 0.5 : 0.35);
  const HZ = SKY_HZ;
  let g = ctx.createLinearGradient(0, 0, 0, HZ);
  g.addColorStop(0, top); g.addColorStop(0.6, midSky); g.addColorStop(1, horizon);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, HZ);
  // stars, a few twinkling
  for (const [x, y, r, ph] of STARS) {
    const tw = 0.55 + 0.45 * Math.sin(t * 1.6 + ph);
    ctx.fillStyle = alpha(lighten(c.ice, 0.6), (dark ? 0.85 : 0.35) * (ph > 5 ? tw : 0.8));
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // the aurora: a soft ribbon that drifts
  const ag = ctx.createLinearGradient(0, 0, W, 0);
  ag.addColorStop(0, alpha(c.s3, 0)); ag.addColorStop(0.3, alpha(c.s3, dark ? 0.32 : 0.18));
  ag.addColorStop(0.65, alpha(c.s7, dark ? 0.28 : 0.16)); ag.addColorStop(1, alpha(c.s5, 0));
  ctx.fillStyle = ag;
  const ph = t * 0.25;
  ctx.beginPath();
  ctx.moveTo(0, 150);
  for (let x = 0; x <= W; x += 34) ctx.lineTo(x, 132 + Math.sin(x / 90 + ph) * 18 + Math.sin(x / 37 - ph * 1.7) * 6);
  for (let x = W; x >= 0; x -= 34) ctx.lineTo(x, 176 + Math.sin(x / 80 + ph * 1.3) * 22);
  ctx.closePath(); ctx.fill();
  // a moon with a lit rim
  ctx.fillStyle = alpha(lighten(c.ice, 0.3), dark ? 0.95 : 0.8);
  ctx.beginPath(); ctx.arc(408, 104, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = alpha(c.seaDeep, 0.18);
  ctx.beginPath(); ctx.arc(402, 98, 5, 0, Math.PI * 2); ctx.arc(416, 112, 3.5, 0, Math.PI * 2); ctx.fill();
  // far icebergs on the horizon: two-tone facets, light from the left
  const bergs = [[40, 64, 46], [150, 36, 30], [430, 82, 54], [560, 50, 38], [650, 40, 28]];
  for (const [x, hgt, w] of bergs) {
    ctx.fillStyle = mix(c.ice, top, dark ? 0.55 : 0.3);
    ctx.beginPath(); ctx.moveTo(x - w, HZ); ctx.lineTo(x - w * 0.35, HZ - hgt); ctx.lineTo(x + w * 0.2, HZ - hgt * 0.8); ctx.lineTo(x + w, HZ); ctx.closePath(); ctx.fill();
    ctx.fillStyle = mix(c.ice, top, dark ? 0.72 : 0.5);
    ctx.beginPath(); ctx.moveTo(x - w * 0.35, HZ - hgt); ctx.lineTo(x + w * 0.2, HZ - hgt * 0.8); ctx.lineTo(x + w, HZ); ctx.lineTo(x, HZ); ctx.closePath(); ctx.fill();
  }
  // the sea, darker with depth, with drifting highlights
  g = ctx.createLinearGradient(0, HZ, 0, H);
  g.addColorStop(0, mix(c.seaShallow, top, dark ? 0.5 : 0.25)); g.addColorStop(1, mix(c.seaDeep, c.bgDeep, dark ? 0.35 : 0.1));
  ctx.fillStyle = g; ctx.fillRect(0, HZ, W, H - HZ);
  ctx.strokeStyle = alpha(lighten(c.seaShallow, 0.5), dark ? 0.22 : 0.3);
  ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const y = HZ + 14 + i * 13 + (i > 5 ? 60 : 0);
    const x = ((i * 157 + t * (10 + i * 2)) % (W + 120)) - 60;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 26 + (i % 3) * 14, y); ctx.stroke();
  }
}

/** The ice shelf from y down to the bottom: the floor a game's set and Quill stand on, snow on its lip, the sea lapping it. */
export function drawIceShelf(ctx, c, t, y) {
  const dark = isDarkTheme(c);
  const top = mix(c.ice, c.seaDeep, dark ? 0.42 : 0.08), low = mix(c.ice, c.seaDeep, dark ? 0.6 : 0.26);
  ctx.strokeStyle = alpha(lighten(c.seaShallow, 0.5), 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, y - 8 + Math.sin(x / 22 + t * 1.5) * 2);
  ctx.stroke();
  const g = ctx.createLinearGradient(0, y, 0, H);
  g.addColorStop(0, top); g.addColorStop(1, low);
  ctx.fillStyle = g;
  ctx.fillRect(0, y - 4, W, H - y + 4);
  ctx.fillStyle = alpha(lighten(c.ice, 0.6), dark ? 0.75 : 0.95);
  rr(ctx, -10, y - 6, W + 20, 9, 4); ctx.fill();
  for (const [x, w] of [[90, 70], [300, 110], [520, 80]]) { ctx.beginPath(); ctx.ellipse(x, y - 5, w / 2, 6, 0, Math.PI, 0); ctx.fill(); }
  ctx.fillStyle = alpha(mix(c.ice, c.seaDeep, 0.7), dark ? 0.35 : 0.2);
  ctx.fillRect(0, y + 3, W, 3);
  ctx.strokeStyle = alpha(mix(c.ice, c.seaDeep, 0.75), dark ? 0.4 : 0.3);
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  for (const [x0, d0, x1, d1, x2, d2] of CRACKS) {
    ctx.beginPath(); ctx.moveTo(x0, y + d0); ctx.lineTo(x1, y + d1); ctx.lineTo(x2, y + d2); ctx.stroke();
  }
}

/**
 * An igloo of tinted ice blocks: the dome over (x, base) w wide and h tall, its tunnel in front.
 * o.col tints the ice (a group's tone); o.glow 0..1 warms the tunnel (an open door, a right bin);
 * o.mood draws a face peeking from the tunnel (a friend waiting inside).
 */
export function drawIgloo(ctx, c, o) {
  const { x, base, w, h, col } = o;
  const dark = isDarkTheme(c);
  const rx = w / 2, ry = h;
  const body = mix(mix(c.ice, col, 0.3), c.bgDeep, dark ? 0.18 : 0);
  const seam = alpha(mix(body, c.seaDeep, 0.55), dark ? 0.55 : 0.4);
  ctx.save();
  ctx.beginPath(); ctx.ellipse(x, base, rx, ry, 0, Math.PI, 0); ctx.closePath();
  ctx.fillStyle = body; ctx.fill();
  ctx.clip();
  const g = ctx.createLinearGradient(x - rx * 0.2, 0, x + rx, 0);   // light from the left, as on the bergs
  g.addColorStop(0, alpha(c.seaDeep, 0)); g.addColorStop(1, alpha(c.seaDeep, dark ? 0.5 : 0.28));
  ctx.fillStyle = g; ctx.fillRect(x - rx, base - ry, w, ry);
  ctx.strokeStyle = seam; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  const rows = [0.3, 0.56, 0.78, 0.94];
  rows.forEach((k, i) => {
    const hw = rx * Math.sqrt(1 - k * k), y = base - ry * k;
    ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x + hw, y); ctx.stroke();
    const y0 = i === 0 ? base : base - ry * rows[i - 1], n = Math.max(2, Math.round(w / 34)) - i;   // staggered blocks
    for (let j = 0; j <= n; j++) { const bx = x - hw + ((j + i * 0.5) % (n + 1)) * (2 * hw / n); ctx.beginPath(); ctx.moveTo(bx, y0 - 1); ctx.lineTo(bx, y + 1); ctx.stroke(); }
  });
  ctx.restore();
  ctx.strokeStyle = alpha(lighten(c.ice, 0.7), dark ? 0.7 : 0.95);   // snow on the crown
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(x, base, rx - 3, ry - 3, 0, Math.PI * 1.12, Math.PI * 1.55); ctx.stroke();
  const tr = Math.min(rx * 0.42, 30), th = Math.min(ry * 0.42, 34);
  ctx.fillStyle = mix(body, lighten(c.ice, 0.5), 0.5);
  ctx.beginPath(); ctx.ellipse(x, base, tr + 7, th + 7, 0, Math.PI, 0); ctx.fill();
  const glow = o.glow || 0;
  ctx.fillStyle = mix(mix(c.bgDeep, c.seaDeep, 0.3), c.warning, 0.55 * glow);
  ctx.beginPath(); ctx.ellipse(x, base, tr, th, 0, Math.PI, 0); ctx.fill();
  if (glow > 0) { ctx.fillStyle = alpha(c.warning, 0.35 * glow); ctx.beginPath(); ctx.ellipse(x, base + 2, tr + 14, 7, 0, 0, Math.PI * 2); ctx.fill(); }
  if (o.mood) {
    const fr = Math.min(tr * 0.7, 13), fc = lighten(c.ice, 0.4);
    ctx.fillStyle = fc;
    ctx.beginPath(); ctx.arc(x, base - th * 0.5, fr, 0, Math.PI * 2); ctx.fill();
    drawFace(ctx, x, base - th * 0.5 + 1, fr - 1, { col: fc, c, mood: o.mood, t: o.t || 0 });
  }
}

/** A snow-capped pine at (x, base), h tall: two tiers of dark needles with snow along the top edges. */
export function drawPine(ctx, c, x, base, h, a = 1) {
  if (h < 3) return;
  const dark = isDarkTheme(c);
  const needle = mix(c.s3, c.bgDeep, dark ? 0.6 : 0.45), snow = alpha(lighten(c.ice, 0.7), (dark ? 0.75 : 0.95) * a);
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = mix(c.stroke, c.bgDeep, 0.4);
  ctx.fillRect(x - h * 0.05, base - h * 0.16, h * 0.1, h * 0.16);
  for (const [k, w, yk] of [[1, 0.5, 0.08], [0.72, 0.36, 0.5]]) {
    const top = base - h * k, bot = base - h * yk, hw = h * w;
    ctx.fillStyle = needle;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + hw, bot); ctx.lineTo(x - hw, bot); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = snow; ctx.lineWidth = Math.max(1, h * 0.06); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - hw * 0.7, bot - (bot - top) * 0.3); ctx.lineTo(x, top + 1); ctx.lineTo(x + hw * 0.5, bot - (bot - top) * 0.5); ctx.stroke();
  }
  ctx.restore();
}

/** Snow puffing up around (x, y) over u 0..1, for a landing or a flop; h: his height. */
function snowPuffs(ctx, c, x, y, u, h) {
  ctx.fillStyle = alpha(lighten(c.ice, 0.5), 0.8 * (1 - u));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI + 0.2, d = h * 0.22 * (0.4 + u);
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d * 1.6, y - Math.abs(Math.sin(a)) * d * 0.5 - 2, h * 0.06 * (1 + u), 0, Math.PI * 2); ctx.fill();
  }
}

/** Three small stars circling above his head (x, y) while he is dazed. */
function dazeStars(ctx, c, x, y, t, k) {
  ctx.fillStyle = alpha(c.gold, 0.9 * k);
  for (let i = 0; i < 3; i++) {
    const a = t * 5 + i * 2.1;
    star(ctx, x + Math.cos(a) * 24, y + Math.sin(a) * 7, 5, 5, 0.5);
    ctx.fill();
  }
}

/** Three streaks of wind behind him (x, y: his back, at his middle), rushing against dir. */
function windLines(ctx, c, x, y, dir, k, t) {
  ctx.strokeStyle = alpha(c.label, 0.35 * k);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const yy = y - 14 + i * 14, off = (t * 90 + i * 23) % 40;
    ctx.beginPath(); ctx.moveTo(x - dir * off, yy); ctx.lineTo(x - dir * (off + 22 - i * 4), yy); ctx.stroke();
  }
}

/** A heart breaking in two at (x, y): the halves part, drop and fade over u 0..1. */
function brokenHeart(ctx, x, y, r, col, u) {
  const e = u * u;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.globalAlpha = 1 - u;
    ctx.translate(x + side * (4 + e * 18), y + e * 22);
    ctx.rotate(side * e * 0.9);
    ctx.beginPath(); ctx.rect(side < 0 ? -r * 2 : -1, -r * 2, r * 2 + 1, r * 4); ctx.clip();
    heart(ctx, 0, 0, r, col);
    ctx.restore();
  }
}

/** Letter-spaced caps, left-aligned at x; returns the width drawn. */
function spacedText(ctx, text, x, y, gap) {
  let cx = x;
  for (const ch of String(text)) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + gap; }
  return cx - x - gap;
}
function spacedWidth(ctx, text, gap) {
  let w = 0;
  for (const ch of String(text)) w += ctx.measureText(ch).width + gap;
  return Math.max(0, w - gap);
}

/** One tapered brush stroke under a phrase (the landing page's swash): thick at the left, a point at the right. */
function swash(ctx, x0, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x0, y + h * 0.15);
  ctx.quadraticCurveTo(x0 + w * 0.45, y - h * 0.4, x0 + w, y + h * 0.2);
  ctx.quadraticCurveTo(x0 + w * 0.9, y + h * 0.5, x0 + w * 0.62, y + h * 0.62);
  ctx.quadraticCurveTo(x0 + w * 0.3, y + h * 1.05, x0, y + h * 0.95);
  ctx.closePath();
  ctx.fill();
}

// His cheer's bits: [shape, dx, dy, spin] in px about his chest, mirroring the rig's confetti.
const CHEER_BITS = [
  ['rect', -70, -56, 220], ['dot', -42, -88, -160], ['rect', 0, -102, 300], ['dot', 44, -86, -240], ['rect', 74, -54, 200],
  ['dot', -86, -12, -180], ['rect', 88, -8, 260], ['star', -60, -104, 120], ['star', 60, -108, -120], ['star', 0, -72, 90],
];

export function crown(ctx, c, x, y, r) {
  ctx.fillStyle = darken(c.warning, 0.3);
  ctx.beginPath();
  ctx.moveTo(x - r, y + 2);
  ctx.lineTo(x - r, y - r * 0.9); ctx.lineTo(x - r * 0.45, y - r * 0.3); ctx.lineTo(x, y - r * 1.1);
  ctx.lineTo(x + r * 0.45, y - r * 0.3); ctx.lineTo(x + r, y - r * 0.9); ctx.lineTo(x + r, y + 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.warning;
  ctx.fillRect(x - r, y - 3, r * 2, 5);
}

export function heart(ctx, x, y, r, col) {
  ctx.fillStyle = col;
  if (lookOf().flattenScenes) { ctx.fillRect(x - r * 0.6, y - r * 0.6, r * 1.2, r * 1.2); return; }   // a plain count, not a heart
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.fill();
}

export { HUD_H };
