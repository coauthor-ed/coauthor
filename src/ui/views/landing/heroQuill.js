/**
 * Hero Quill's idle life and the landing page's easter eggs.
 *
 * Idle: while the hero is on screen (.hero[data-live]) and the tab is
 * visible, every 5 to 9 s he does one small thing: glances at the water or
 * the sky, shifts his weight, or (inside <quill-mascot>'s own restraint
 * budget) waves. He also glances at the fish whenever it jumps.
 *
 * Eggs:
 * - tap the water: a fish leaps across to Quill and he gulps it (hearts);
 * - tap the little moon: it goes once round the blue planet, and he watches;
 * - the Konami code (up up down down left right left right b a): a meteor
 *   shower over the hero, and Quill cheers.
 *
 * Under prefers-reduced-motion every egg is a face and a line in his
 * bubble, nothing moves, and there is no idle loop. All DOM here is the
 * landing view's own; Quill himself is driven only through his public
 * methods (perform, look, setExpression).
 */

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

// The beak, as a fraction of the rig's 240 x 300 box (quillShapes.js).
const BEAK = [0.5, 0.473];
// Moon and blue planet centres in heroPlanets()'s viewBox (landingArt.js).
const MOON = [1322, 204];
const PLANET = [1262, 252];

export class HeroQuill {
  /**
   * @param {object} opts
   * @param {boolean} opts.reduced  prefers-reduced-motion
   * @param {(text: string, ms?: number) => void} opts.say  sets his bubble
   */
  constructor({ reduced, say }) {
    this.reduced = reduced;
    this.say = say;
    this.busy = false;
    this.fed = 0;
    this._keys = [];
    this._beat = 0;
    this._onKey = this._onKey.bind(this);
    this._onFishJump = this._onFishJump.bind(this);
  }

  attach(root) {
    const $ = (s) => root.querySelector(s);
    this.root = root;
    this.hero = $('.hero');
    this.fore = $('.fore');
    this.q = $('.q-stand quill-mascot');
    this.body = $('.q-body');
    this.flyer = $('.fish-fly');
    this.fishArc = $('.fish .arc');
    this.moon = $('.moon-hit');
    this.fishArc?.addEventListener('animationiteration', this._onFishJump);
    window.addEventListener('keydown', this._onKey);
    if (!this.reduced) this._schedule();
  }

  detach() {
    clearTimeout(this._idleTimer);
    clearTimeout(this._glanceTimer);
    this.fishArc?.removeEventListener('animationiteration', this._onFishJump);
    window.removeEventListener('keydown', this._onKey);
  }

  get _awake() {
    return this.hero?.hasAttribute('data-live') && document.visibilityState === 'visible';
  }

  /* ---- idle ------------------------------------------------------------ */

  _schedule() {
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => { this._idle(); this._schedule(); }, rand(5000, 9000));
  }

  _idle() {
    if (!this._awake || this.busy || !this.q) return;
    const beat = this._beat++ % 5;
    if (beat === 0 || beat === 3) this._glance(rand(-1, -0.6), rand(0.2, 0.7), 1400); // at the water
    else if (beat === 1) this._glance(rand(-0.3, 0.6), -1, 1200); // at the sky
    else if (beat === 2) this._body([
      { transform: 'none' },
      { transform: 'translateX(-4px) rotate(-3deg)', offset: 0.25 },
      { transform: 'translateX(3px) rotate(2.5deg)', offset: 0.6 },
      { transform: 'none' },
    ], 1100, 'ease-in-out');
    else this.q.perform('wave');
  }

  _glance(dx, dy, ms) {
    this.q?.look(dx, dy);
    clearTimeout(this._glanceTimer);
    this._glanceTimer = setTimeout(() => this.q?.look(0, 0), ms);
  }

  _onFishJump() {
    if (this._awake && !this.busy) this._glance(-1, 0.5, 900);
  }

  _body(frames, duration, easing = 'ease-out') {
    if (!this.body?.animate) return Promise.resolve();
    return this.body.animate(frames, { duration, easing }).finished.catch(() => {});
  }

  /* ---- taps -------------------------------------------------------------- */

  /** A tap is the user asking, so it skips the ambient budget (force). */
  async tap(act, nth) {
    if (this.busy || !this.q) return false;
    if (nth === 2) this.say('Psst. I love fish. Is there one in the water?', 4200);
    return this.q.perform(act, { force: true });
  }

  /* ---- egg: feed Quill a fish --------------------------------------------- */

  async feed(fromEl) {
    if (this.busy || !this.q) return;
    this.busy = true;
    this.fed++;
    const lines = ['Yum! Thank you!', 'Another one? You are kind.', 'Three fish! Now I am full.'];
    const line = lines[Math.min(this.fed, lines.length) - 1];
    try {
      if (this.reduced || !this.flyer?.animate) {
        this.q.setExpression('heart');
        this.say(line, 3000);
        await wait(1600);
        this.q.setExpression('happy');
        return;
      }
      const fr = this.fore.getBoundingClientRect();
      const src = fromEl.getBoundingClientRect();
      const qr = this.q.getBoundingClientRect();
      const S = { x: src.left + src.width / 2 - fr.left, y: src.top + src.height * 0.55 - fr.top };
      const E = { x: qr.left + qr.width * BEAK[0] - fr.left, y: qr.top + qr.height * BEAK[1] - fr.top };
      const apex = Math.min(S.y, E.y) - Math.max(90, Math.abs(E.x - S.x) * 0.35);
      const C = { x: (S.x + E.x) / 2, y: 2 * apex - (S.y + E.y) / 2 };
      const hw = this.flyer.offsetWidth / 2;
      const hh = this.flyer.offsetHeight / 2;
      const frames = [];
      const N = 24;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const u = 1 - t;
        const x = u * u * S.x + 2 * u * t * C.x + t * t * E.x;
        const y = u * u * S.y + 2 * u * t * C.y + t * t * E.y;
        const dx = 2 * u * (C.x - S.x) + 2 * t * (E.x - C.x);
        const dy = 2 * u * (C.y - S.y) + 2 * t * (E.y - C.y);
        const a = (Math.atan2(dy, dx) * 180) / Math.PI;
        const s = t < 0.12 ? 0.6 + t * 3.3 : t > 0.88 ? 1 - (t - 0.88) * 3 : 1;
        frames.push({
          transform: `translate(${(x - hw).toFixed(1)}px, ${(y - hh).toFixed(1)}px) rotate(${a.toFixed(1)}deg) scale(${(-s).toFixed(2)}, ${s.toFixed(2)})`,
          opacity: i === 0 ? 0 : 1,
        });
      }
      this.q.setExpression('surprised');
      this.q.look(-1, 0.6);
      const flight = this.flyer.animate(frames, { duration: 1300, easing: 'cubic-bezier(0.35, 0.1, 0.45, 1)', fill: 'forwards' });
      setTimeout(() => this.q.look(-0.6, -1), 430);
      setTimeout(() => this.q.look(-0.2, -0.2), 930);
      this._body([{ transform: 'none' }, { transform: 'translate(-6px, -4px) rotate(-6deg)' }], 1300, 'cubic-bezier(0.4, 0, 0.6, 1)');
      await flight.finished.catch(() => {});
      flight.cancel();
      this.q.look(0, 0);
      // Gulp: a squash, then hearts.
      await this._body([
        { transform: 'translate(-6px, -4px) rotate(-6deg)' },
        { transform: 'scale(1.1, 0.86)', offset: 0.35 },
        { transform: 'scale(0.95, 1.06)', offset: 0.7 },
        { transform: 'none' },
      ], 520, 'ease-out');
      this.say(line, 3200);
      await this.q.perform(this.fed >= 3 ? 'cheer' : 'love', { force: true });
      if (this.fed >= 3) this.fed = 0;
    } finally {
      this.busy = false;
    }
  }

  /* ---- egg: the moon goes round the planet -------------------------------- */

  async orbit() {
    if (this.busy || !this.moon) return;
    this.busy = true;
    try {
      this.q?.look(0.6, -1);
      if (this.reduced || !this.moon.animate) {
        this.q?.setExpression('surprised');
        this.say('Did that moon just wink at me?', 3000);
        await wait(1600);
        return;
      }
      this.q?.setExpression('surprised');
      // A tilted ellipse round the planet that passes through the moon's
      // own spot, so the orbit starts and ends exactly where it rests.
      const dx0 = MOON[0] - PLANET[0];
      const dy0 = MOON[1] - PLANET[1];
      const rx = Math.hypot(dx0, dy0 / 0.62);
      const ry = rx * 0.62;
      const a0 = Math.atan2(dy0 / ry, dx0 / rx);
      const frames = [];
      for (let i = 0; i <= 36; i++) {
        const a = a0 + (i / 36) * Math.PI * 2;
        const x = PLANET[0] + Math.cos(a) * rx - MOON[0];
        const y = PLANET[1] + Math.sin(a) * ry - MOON[1];
        frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` });
      }
      const done = this.moon.animate(frames, { duration: 2400, easing: 'ease-in-out' }).finished.catch(() => {});
      setTimeout(() => this.q?.look(-0.2, -1), 900);
      setTimeout(() => this.q?.look(0.8, -0.6), 1700);
      await done;
      this.say('Whee! All the way round.', 2600);
      this.q?.setExpression('happy');
      this.q?.look(0, 0);
    } finally {
      this.busy = false;
    }
  }

  /* ---- egg: Konami meteor shower ------------------------------------------- */

  _onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.composedPath()[0];
    const tag = el?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'math-field' || el?.isContentEditable) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    this._keys = [...this._keys, k].slice(-KONAMI.length);
    if (this._keys.join() === KONAMI.join()) {
      this._keys = [];
      this.shower();
    }
  }

  async shower() {
    if (!this.hero) return;
    if (this.hero.getBoundingClientRect().bottom < 200) {
      window.scrollTo({ top: 0, behavior: this.reduced ? 'auto' : 'smooth' });
      await wait(this.reduced ? 0 : 700);
    }
    this.say('You found the secret meteor shower!', 4200);
    if (this.reduced) { this.q?.setExpression('surprised'); return; }
    this.hero.classList.remove('showering');
    requestAnimationFrame(() => this.hero.classList.add('showering'));
    clearTimeout(this._showerTimer);
    this._showerTimer = setTimeout(() => this.hero.classList.remove('showering'), 5200);
    this.q?.look(0.2, -1);
    await wait(500);
    await this.q?.perform('cheer', { force: true });
    this.q?.look(0, 0);
  }
}
