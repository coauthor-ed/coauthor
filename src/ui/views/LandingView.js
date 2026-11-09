import '../components/QuillLoader.js';
import { LitElement, html, svg } from 'lit';
import { appUrl } from '../../core/basePath.js';
import { EventBus } from '../../core/EventBus.js';
import { ThemeManager } from '../../core/ThemeManager.js';
import { ensureStoryFonts } from '../../core/LessonModeManager.js';
import { iconSun, iconMoon, iconArrowRight, iconCompass, iconNib, iconGuide, iconClose, iconCheck, iconGamepad, iconBolt, iconMath } from '../icons/uiIcons.js';
import { GuideService } from '../../core/GuideService.js';
import { ShowcaseService, SHOWCASE_BUNDLE } from '../../core/ShowcaseService.js';
import { mountOrphanPreview } from '../../core/preview/mountOrphanPreview.js';
import '../components/QuillMascot.js';
import '../components/CoAuthorLogo.js';
import '../components/TryBlock.js';
import { landingStyles } from './landing/landingStyles.js';
import { landingStylesMore } from './landing/landingStylesMore.js';
import { landingStylesDescriptive } from './landing/landingStylesDescriptive.js';
import { stopDescriptive, replaySheet } from './landing/landingDescriptive.js';
import { HeroQuill } from './landing/heroQuill.js';
import { doorways, commonsAndPrivate, guidesLibrary, shelf, footer } from './landing/landingMore.js';
import {
  ROUTE_STARS, DAWN_STARS, sparkle, heroSkyFar, heroPlanets, heroBergs, iceLedge,
  telescope, nibArt, blob, mitoBuddy, wand, stone, scrawlArrow, routePath,
} from './landing/landingArt.js';

/**
 * <landing-view> - the showcase page at #/welcome
 * (docs/sprints/completed/landing-page-and-guides.md, "Visual direction").
 *
 * One journey, night to day. A layered hero whose depths slide apart as you
 * scroll; a star route through six explorer stops that draws itself as you
 * read; a pinned sunrise that Quill walks across; then the grown-ups' half as
 * a paper collage in Story's ink-and-paper language.
 *
 * Motion comes to rest: ambient loops run only while their section is on
 * screen ([data-live]), reveals play once (.in), scroll-linked parts are a
 * pure function of scroll position, and under prefers-reduced-motion
 * everything shows its final state.
 */

const BLOB_PARTS = {
  mito: {
    right: true,
    text: 'Yes! Those beans are mitochondria. You worked out the job first, and the name came second. Every lesson here works like that.',
  },
  membrane: {
    text: 'Good guess, but that is the cell membrane. It is Blob\'s wall. Which part would need fuel?',
  },
  ribo: {
    text: 'Good guess, but those dots are ribosomes. They are Blob\'s factory. Which part would need fuel?',
  },
};

const BLOB_OPTIONS = [
  ['mito', 'A', 'Small bean shapes that release energy from food'],
  ['membrane', 'B', 'The thin skin around the whole cell'],
  ['ribo', 'C', 'Tiny dots that join building blocks into proteins'],
];

const HYPE = [
  'A story that never once mentions tissues.',
  'The diagram exercise quietly disappears.',
  'Twelve smooth pages, and some of the facts are wrong.',
];

const METHOD = [
  ['Frame', 'Decide what your child must truly understand by the end.'],
  ['Spark', 'Pick what they love, and check how far the comparison really stretches.'],
  ['Scaffold', 'The kit plans chapters, checkpoints and common mistakes before any prose.'],
  ['Generate', 'It writes in small stages, one lesson at a time. Never one giant prompt.'],
  ['Review', 'You preview every slide, then approve it or send it back. You stay the author.'],
  ['Test-teach', 'Try it with your child, fix what did not land, and share it back.'],
];

// [who, text, start (s)]; 'tp' is Quill's typing dots.
const CHAT = [
  ['me', 'Electrons go round the nucleus like planets go round the sun.', 0.2],
  ['tp', '', 0.9],
  ['q', 'Many people picture it that way, and it is a good start!', 2.0],
  ['q', 'But electrons do not move on neat tracks. Think of a cloud that shows where an electron is likely to be.', 2.9],
  ['me', 'So the drawing in my book is a simple model?', 4.3],
  ['tp', '', 5.0],
  ['q', 'Yes. A simple model is still useful. Now you know where it stops working.', 6.1],
];

const QUILL_ACTS = ['hop', 'love', 'cheer', 'wave'];

// The Konami-code meteor shower (heroQuill.js): [left %, top %, delay s, length px].
const METEORS = [
  [62, 4, 0, 150], [88, 10, 0.25, 120], [74, 22, 0.5, 170], [96, 2, 0.7, 110], [54, 14, 0.95, 130],
  [82, 30, 1.1, 160], [68, 8, 1.35, 120], [92, 20, 1.5, 140], [58, 26, 1.8, 110], [78, 2, 2.0, 170],
  [100, 14, 2.2, 130], [64, 18, 2.45, 150], [86, 6, 2.7, 120], [72, 12, 2.95, 160],
];

// The two live games on the arcade stop (docs/sprints/completed/arcade-quill-catch.md).
const GAMES = {
  catch: { block: 'blocks/arcade-catch', title: "Quill's Catch", sub: 'Spot the members', keys: [['←', '→'], 'or drag to steer'] },
  judge: { block: 'blocks/arcade-myths', title: 'Myth or fact?', sub: 'Judge the claim', keys: [['←'], 'myth', ['→'], 'fact'] },
};
const PREVIEW_W = 820; // the real slide renders at this width, then scales into the tablet
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** A gentle wave through points in order: each segment sags to one side. */
function wavyPath(pts, amp) {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const s = (i % 2 ? 1 : -1) * amp;
    d += `Q${(mx - ((b.y - a.y) / len) * s).toFixed(1)} ${(my + ((b.x - a.x) / len) * s).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  return d;
}

export class LandingView extends LitElement {
  static properties = {
    _theme: { state: true },
    _pick: { state: true },
    _solved: { state: true },
    _shown: { state: true },
    _live: { state: true },
    _look: { state: true },
    _turning: { state: true },
    _game: { state: true },
    _gameOn: { state: true },
    _maths: { state: true },
    _descQ: { state: true },
    _guides: { state: true },
    _guideAud: { state: true },
    _shelf: { state: true },
    _door: { state: true },
    _kitchen: { state: true },
    _balls: { state: true },
    _notes: { state: true },
    _say: { state: true },
  };

  static styles = [landingStyles, landingStylesMore, landingStylesDescriptive];

  constructor() {
    super();
    this._theme = ThemeManager.getTheme() || 'dark';
    this._pick = null;
    this._solved = false;
    this._shown = new Set();
    this._live = false;
    this._look = 'classic';
    this._turning = false;
    this._game = 'catch';
    this._gameOn = false;
    this._maths = null;
    this._descQ = null;
    this._guides = null;
    this._guideAud = 'student';
    this._shelf = [];
    this._door = null;
    this._kitchen = null;
    this._balls = 0;
    this._notes = [];
    this._say = '';
    // His eyes follow a mouse; on touch there is nothing to follow.
    this._finePointer = matchMedia('(pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._actIdx = 0;
    this._lit = -1;
    this._onTheme = ({ theme }) => { this._theme = theme; this.setAttribute('data-theme', theme); };
    this._onScroll = this._onScroll.bind(this);
    this._onPointer = this._onPointer.bind(this);
    this._layout = this._layout.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    ensureStoryFonts();
    this.setAttribute('data-theme', this._theme);
    EventBus.on('theme:changed', this._onTheme);
    window.addEventListener('scroll', this._onScroll, { passive: true });
    window.addEventListener('resize', this._onScroll, { passive: true });
    GuideService.loadIndex().then(({ guides }) => { this._guides = guides; });
    ShowcaseService.listShelf().then((list) => { this._shelf = list; });
    ShowcaseService.load('questions/maths-try').then((q) => { this._maths = q; }).catch(() => {});
    ShowcaseService.load('questions/landing-descriptive').then((q) => { this._descQ = q; }).catch(() => {});
  }

  disconnectedCallback() {
    EventBus.off('theme:changed', this._onTheme);
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onScroll);
    window.removeEventListener('pointermove', this._onPointer);
    this._io?.disconnect();
    this._rvIo?.disconnect();
    this._ro?.disconnect();
    this._hq?.detach();
    clearTimeout(this._sayTimer);
    this._gameNear?.disconnect();
    this._gameFar?.disconnect();
    cancelAnimationFrame(this._raf);
    cancelAnimationFrame(this._sweepRaf);
    super.disconnectedCallback();
  }

  firstUpdated() {
    const $ = (s) => this.renderRoot.querySelector(s);
    this._reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._hq = new HeroQuill({ reduced: this._reduced, say: (t, ms) => this._quillSays(t, ms) });
    this._hq.attach(this.renderRoot);
    this._el = {
      hero: $('.hero'), route: $('.route'), line: $('.trail-line'), glow: $('.trail-glow'), ghost: $('.trail-ghost'),
      trail: $('.trail-svg'), tip: $('.tip'), dawn: $('.dawn'), paper: $('.paper'),
      steps: $('.steps-box'), road: $('.road'), mapQuill: $('.map-quill'), screen: $('.screen'),
      walker: $('.walker quill-mascot'),
    };
    this._nodes = [...this.renderRoot.querySelectorAll('.route .node')];
    this._points = [...this.renderRoot.querySelectorAll('.route .node, .route .wp')];
    this._stepEls = [...this.renderRoot.querySelectorAll('.step')];

    // [data-live] runs a section's ambient loops.
    this._io = new IntersectionObserver((entries) => {
      for (const e of entries) e.target.toggleAttribute('data-live', e.isIntersecting);
    }, { rootMargin: '80px 0px' });
    this.renderRoot.querySelectorAll('[data-sec]').forEach((s) => this._io.observe(s));

    // .in plays a block's reveal once.
    this._rvIo = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        this._rvIo.unobserve(e.target);
        if (e.target.querySelector('.screen')) this._sweep();
      }
    }, { threshold: 0.22 });
    this.renderRoot.querySelectorAll('[data-rv]').forEach((s) => this._rvIo.observe(s));

    this._ro = new ResizeObserver(() => this._layout());
    this._ro.observe(this._el.route);
    this._ro.observe(this._el.steps);

    // The live game mounts when its cabinet comes near and unmounts when far
    // (a running canvas game is the heaviest thing on the page).
    const cab = $('.cab-live');
    if (cab) {
      this._gameNear = new IntersectionObserver(([e]) => { if (e.isIntersecting) this._mountGame(); }, { rootMargin: '500px 0px' });
      this._gameFar = new IntersectionObserver(([e]) => { if (!e.isIntersecting) this._unmountGame(); }, { rootMargin: '1600px 0px' });
      this._gameNear.observe(cab);
      this._gameFar.observe(cab);
    }
    // Quill waves once when the footer comes into view.
    const foot = $('.foot');
    if (foot) {
      const fio = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        fio.disconnect();
        if (!this._reduced) foot.querySelector('.fq')?.perform?.('wave');
      }, { threshold: 0.4 });
      fio.observe(foot);
    }
    document.fonts?.ready.then(this._layout);

    if (!this._reduced && matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', this._onPointer, { passive: true });
    }
    this._layout();
  }

  /** Sections that render later (the guides library and the shelf wait for
   *  their data) still get their one-time reveal. */
  updated() {
    if (!this._rvIo) return;
    this._rvSeen = this._rvSeen || new WeakSet();
    this.renderRoot.querySelectorAll('[data-rv]:not(.in)').forEach((el) => {
      if (this._rvSeen.has(el)) return;
      this._rvSeen.add(el);
      this._rvIo.observe(el);
    });
  }

  /* ---- scroll-linked parts -------------------------------------------- */

  /** Measures the stops and draws the star route through their nodes;
   *  also the dotted road between the method's stepping stones. */
  _layout() {
    const { route, trail, line, glow, ghost, steps, road } = this._el;
    if (!route) return;
    const r = route.getBoundingClientRect();
    const narrow = r.width < 900;
    const pts = [{ x: narrow ? 11 : r.width / 2, y: 0 }];
    for (const n of this._points) {
      const b = n.getBoundingClientRect();
      pts.push({ x: narrow ? 11 : b.left + b.width / 2 - r.left, y: b.top + b.height / 2 - r.top });
    }
    const end = route.querySelector('.end-star').getBoundingClientRect();
    pts.push({ x: end.left + end.width / 2 - r.left, y: end.top + end.height / 2 - r.top });
    trail.setAttribute('viewBox', `0 0 ${r.width.toFixed(0)} ${r.height.toFixed(0)}`);
    const d = routePath(pts, narrow ? 8 : 64);
    for (const p of [line, glow, ghost]) p.setAttribute('d', d);
    this._len = line.getTotalLength();
    // y -> length lookup, so the drawn tip tracks the reading line.
    this._lut = [];
    for (let i = 0; i <= 240; i++) {
      const l = (this._len * i) / 240;
      this._lut.push([line.getPointAtLength(l).y, l]);
    }
    for (let i = 1; i < this._lut.length; i++) this._lut[i][0] = Math.max(this._lut[i][0], this._lut[i - 1][0]);
    for (const p of [line, glow]) p.style.strokeDasharray = `${this._len} ${this._len}`;
    this._nodeYs = this._nodes.map((n) => { const b = n.getBoundingClientRect(); return b.top + b.height / 2 - r.top; });

    if (steps && road) {
      const sr = steps.getBoundingClientRect();
      const sp = this._stepEls.map((el) => {
        const b = el.querySelector('.stone').getBoundingClientRect();
        return { x: b.left + b.width / 2 - sr.left, y: b.top + b.height / 2 - sr.top };
      });
      road.setAttribute('viewBox', `0 0 ${sr.width.toFixed(0)} ${sr.height.toFixed(0)}`);
      road.querySelector('path').setAttribute('d', wavyPath(sp, 22));
      this._stepPts = sp;
    }
    this._lit = -1;
    const scr = this._el.screen;
    if (scr) scr.style.setProperty('--k', (scr.getBoundingClientRect().width / PREVIEW_W).toFixed(4));
    this._onScroll();
  }

  _onScroll() {
    if (this._scrollPending) return;
    this._scrollPending = true;
    this._raf = requestAnimationFrame(() => {
      this._scrollPending = false;
      this._tick();
    });
  }

  _tick() {
    const vh = window.innerHeight;
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - vh);
    this.style.setProperty('--lv-progress', Math.min(1, window.scrollY / max).toFixed(4));
    const { hero, route, line, glow, tip, dawn, paper, steps, mapQuill } = this._el || {};
    if (!hero) return;

    // The top bar turns to paper once the grown-ups' half is under it.
    if (paper.getBoundingClientRect().top < 48) this.setAttribute('data-bar', 'paper');
    else this.removeAttribute('data-bar');

    if (this._reduced) {
      this._nodes.forEach((n) => n.classList.add('lit'));
      line.style.strokeDashoffset = '0'; glow.style.strokeDashoffset = '0';
      this._stepEls.forEach((s) => s.classList.add('lit'));
      return;
    }

    // Hero depths: one number, read by every layer's transform.
    const hr = hero.getBoundingClientRect();
    if (hr.bottom > 0) hero.style.setProperty('--sy', Math.max(0, -hr.top).toFixed(1));

    // Star route: the drawn end follows a line 62% down the viewport.
    const rr = route.getBoundingClientRect();
    if (rr.top < vh && rr.bottom > 0 && this._lut) {
      const y = vh * 0.62 - rr.top;
      let lo = 0;
      let hi = this._lut.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (this._lut[mid][0] < y) lo = mid + 1; else hi = mid; }
      const len = y <= 0 ? 0 : this._lut[lo][1];
      const off = (this._len - len).toFixed(1);
      line.style.strokeDashoffset = off;
      glow.style.strokeDashoffset = off;
      const pt = line.getPointAtLength(len);
      tip.style.transform = `translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px)`;
      tip.style.opacity = len > 0 && len < this._len - 2 ? '1' : '0';
      this._nodes.forEach((n, i) => n.classList.toggle('lit', this._nodeYs[i] <= y));
    }

    // Sunrise: progress through the pinned stretch.
    const dr = dawn.getBoundingClientRect();
    if (dr.top < vh && dr.bottom > 0) {
      const p = clamp01(-dr.top / Math.max(1, dr.height - vh));
      dawn.style.setProperty('--p', p.toFixed(4));
      dawn.classList.toggle('walking', p > 0.1 && p < 0.74);
      const arrived = p >= 0.74;
      if (arrived && !this._arrived) setTimeout(() => this._el.walker?.perform('wave'), 200);
      this._arrived = arrived;
      dawn.classList.toggle('arrived', arrived);
    }

    // Method map: stones light up as the reading line passes them.
    const sr = steps.getBoundingClientRect();
    if (sr.top < vh && sr.bottom > 0 && this._stepPts) {
      const y = vh * 0.7 - sr.top;
      let lit = -1;
      this._stepPts.forEach((p, i) => { if (p.y <= y && (i < 3 || y > sr.height * 0.55)) lit = i; });
      // Row two runs right to left, so it lights only once row one is done.
      if (lit !== this._lit) {
        this._lit = lit;
        this._stepEls.forEach((s, i) => s.classList.toggle('lit', i <= lit));
        const at = this._stepPts[Math.max(0, lit)];
        mapQuill.style.setProperty('--qx', `${(at.x + 18).toFixed(0)}px`);
        mapQuill.style.setProperty('--qy', `${(at.y - 66).toFixed(0)}px`);
        mapQuill.style.opacity = lit >= 0 ? '1' : '0';
      }
    }
  }

  _onPointer(e) {
    if (this._ptrPending) return;
    this._ptrPending = true;
    requestAnimationFrame(() => {
      this._ptrPending = false;
      const hero = this._el?.hero;
      if (!hero || !hero.hasAttribute('data-live')) return;
      hero.style.setProperty('--mx', ((e.clientX / window.innerWidth - 0.5) * -2).toFixed(3));
      hero.style.setProperty('--my', ((e.clientY / window.innerHeight - 0.5) * -2).toFixed(3));
    });
  }

  /** The compare line sweeps across once on arrival, to show it moves. */
  _sweep() {
    const screen = this._el.screen;
    if (!screen || this._reduced || this._swept) return;
    this._swept = true;
    const keys = [[0, 50], [700, 84], [1500, 16], [2200, 50]];
    const t0 = performance.now() + 400;
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
    const step = (now) => {
      if (this._dragged) return;
      const t = now - t0;
      if (t >= 0) {
        let k = 1;
        while (k < keys.length - 1 && t > keys[k][0]) k++;
        const [ta, va] = keys[k - 1];
        const [tb, vb] = keys[k];
        const f = ease(clamp01((t - ta) / (tb - ta)));
        screen.style.setProperty('--split', `${(va + (vb - va) * f).toFixed(2)}%`);
        if (t > keys[keys.length - 1][0]) return;
      }
      this._sweepRaf = requestAnimationFrame(step);
    };
    this._sweepRaf = requestAnimationFrame(step);
  }

  _onSplit(e) {
    this._dragged = true;
    this._el.screen.style.setProperty('--split', `${e.target.value}%`);
  }

  _go(id) {
    const el = this.renderRoot.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: this._reduced ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---- live parts ------------------------------------------------------ */

  _previewUrl(mode) {
    return `${appUrl('index.html')}#/preview/courses/${SHOWCASE_BUNDLE}/blocks/story-preview.json?mode=${mode}&embed=1`;
  }

  /** Swap the drawn compare for the real slide (two lazily made iframes). */
  async _openLive() {
    this._live = true;
    await this.updateComplete;
    this._layout();
  }

  /** The tablet turns over (450 ms); the look changes at the half-way point. */
  _setLook(look) {
    if (look === this._look || this._turning) return;
    if (this._reduced) { this._look = look; return; }
    this._turning = true;
    setTimeout(() => { this._look = look; }, 225);
    setTimeout(() => { this._turning = false; }, 460);
  }

  async _mountGame() {
    if (this._gameMounting || this._gameOn === this._game) return;
    const host = this.renderRoot.querySelector('.cab-mount');
    if (!host) return;
    this._gameMounting = true;
    const which = this._game;
    try {
      const data = await ShowcaseService.load(GAMES[which].block);
      if (which !== this._game) return;
      await mountOrphanPreview(data, host, { bundleId: SHOWCASE_BUNDLE });
      this._gameOn = which;
    } catch (e) {
      console.warn('[landing] game did not mount:', e.message);
    } finally {
      this._gameMounting = false;
    }
  }

  _unmountGame() {
    const host = this.renderRoot.querySelector('.cab-mount');
    if (host) host.innerHTML = '';
    this._gameOn = false;
  }

  _pickGame(id) {
    if (id === this._game) return;
    this._unmountGame();
    this._game = id;
    this.updateComplete.then(() => this._mountGame());
  }

  /** What the grown-ups' sections read (landingMore.js). */
  get _v() {
    return {
      door: this._door,
      openDoor: (id) => { this._door = this._door === id ? null : id; },
      kitchen: this._kitchen,
      kitchenPick: this._kitchen,
      pickKitchen: (s) => { this._kitchen = s; },
      balls: this._balls,
      bowl: () => { this._balls = Math.min(6, this._balls + 1); },
      resetOver: () => { this._balls = 0; },
      notes: this._notes,
      addNote: (n) => { this._notes = [...this._notes, n]; },
      clearBar: () => { this._notes = []; },
      guides: this._guides,
      guideAud: this._guideAud,
      setGuideAud: (a) => { this._guideAud = a; },
      shelf: this._shelf,
      startLearning: () => this._startLearning(),
    };
  }

  /** The glyph spins in on every toggle, as in the app bar (AppShell._spin):
   *  re-adding the class restarts the animation on the new icon. */
  _toggleTheme(e) {
    ThemeManager.setTheme(this._theme === 'dark' ? 'light' : 'dark');
    const btn = e?.currentTarget;
    if (!btn) return;
    btn.classList.remove('spin');
    requestAnimationFrame(() => btn.classList.add('spin'));
  }

  /** #/start is profile setup on a first visit; AppShell sends anyone who
   *  already has a profile straight home. */
  _startLearning() {
    window.location.hash = '#/start';
  }

  _authorGuides() {
    window.location.hash = '#/guides?for=author';
  }

  /** Tap Quill: one act. A tap is a direct request, so it skips the ambient
   *  budget; while an act is still playing he reacts with a face instead
   *  (an expression is not an act). The second tap hints at the fish egg. */
  async _tapQuill(e) {
    const q = e.currentTarget.querySelector('quill-mascot');
    const act = QUILL_ACTS[this._actIdx % QUILL_ACTS.length];
    const ran = await this._hq.tap(act, this._actIdx + 1);
    if (ran) { this._actIdx++; return; }
    q.setExpression('heart');
    clearTimeout(this._faceTimer);
    this._faceTimer = setTimeout(() => q.setExpression('happy'), 1200);
  }

  /** His hero bubble: a line for a few seconds, then back to the greeting. */
  async _quillSays(text, ms = 3000) {
    this._say = text;
    clearTimeout(this._sayTimer);
    this._sayTimer = setTimeout(() => { this._say = ''; }, ms);
    await this.updateComplete;
    const b = this.renderRoot.querySelector('.q-stand .bubble');
    if (!b || this._reduced) return;
    b.classList.remove('pop');
    requestAnimationFrame(() => b.classList.add('pop'));
  }

  _choose(key) {
    if (this._solved) return;
    this._pick = key;
    const shown = new Set(this._shown);
    shown.add(key);
    if (BLOB_PARTS[key].right) {
      this._solved = true;
      Object.keys(BLOB_PARTS).forEach((k) => shown.add(k));
    }
    this._shown = shown;
  }

  /* ---- pieces ---------------------------------------------------------- */

  _hero() {
    const first = 'Learning,';
    return html`
      <section class="hero" id="top" data-sec aria-labelledby="lv-h1">
        <div class="layer l-far" aria-hidden="true"><div class="px">${heroSkyFar()}</div></div>
        <div class="shower" aria-hidden="true">${METEORS.map(([x, y, d, w]) => html`<i style="--x:${x}%;--y:${y}%;--d:${d}s;--w:${w}px"></i>`)}</div>
        <div class="layer l-planets" aria-hidden="true"><div class="px">${heroPlanets(() => this._hq?.orbit())}</div></div>
        <div class="layer l-bergs" aria-hidden="true"><div class="px">${heroBergs()}</div></div>

        <div class="wrap hero-copy">
          <span class="free-pill"><span class="dot" aria-hidden="true"></span>Free and open source. No ads. Progress stays on your device.</span>
          <h1 id="lv-h1" class="display mega">
            <span class="line"><span class="sr-only">${first}</span>${[...first].map((c, i) => html`<span class="ch" aria-hidden="true" style="--c:${i}">${c}</span>`)}</span>
            <span class="line"><span class="key">co-authored.</span></span>
          </h1>
          <p class="lede">Interactive lessons for <b>classes 9 to 12</b>. You guess first, then you find out why. Courses are written by <b>parents and teachers</b>, with careful help from AI.</p>
          <div class="actions">
            <button class="cta" @click=${this._startLearning}>Start learning ${iconArrowRight}</button>
            <button class="cta ghost" @click=${this._authorGuides}>${iconGuide} Read the author guides</button>
          </div>
        </div>

        <div class="fore">
          ${iceLedge()}
          <button class="fish-btn" aria-label="Throw a fish to Quill" @click=${(e) => this._hq?.feed(e.currentTarget)}></button>
          <div class="fish-fly" aria-hidden="true"><svg viewBox="0 0 34 20"><path class="fish-body" d="M2 10C8 2 20 2 26 10C20 18 8 18 2 10ZM26 10L34 3V17Z"></path><circle class="fish-eye" cx="9" cy="9" r="2"></circle></svg></div>
          <div class="fish" aria-hidden="true"><svg viewBox="0 0 34 20"><g class="arc amb">
            <path class="fish-body" d="M2 10C8 2 20 2 26 10C20 18 8 18 2 10ZM26 10L34 3V17Z"></path>
            <circle class="fish-eye" cx="9" cy="9" r="2"></circle></g></svg></div>
          <nav class="post" aria-label="Choose your path">
            <span class="snow" aria-hidden="true"></span>
            <button class="board ex" @click=${() => this._go('explorers')}>
              <span class="spot">${telescope()}</span>
              <span class="b-text"><span class="who">For students</span><span class="name">Explorers</span></span>
            </button>
            <button class="board gu" @click=${() => this._go('grownups')}>
              <span class="spot">${nibArt()}</span>
              <span class="b-text"><span class="who">Parents, teachers</span><span class="name">Grown-ups</span></span>
            </button>
            <span class="pole" aria-hidden="true"></span>
          </nav>
          <div class="q-stand">
            <button class="quill-btn" aria-label="Quill the penguin. Tap him for a trick." @click=${this._tapQuill}><span class="q-body"><span class="q-breath amb"><quill-mascot size="hero" .idle=${false} .trackPointer=${this._finePointer}></quill-mascot></span></span></button>
            <p class="bubble ${this._say ? 'said' : ''}" aria-live="polite">${this._say || "Hi, I'm Quill! Tap me."}</p>
          </div>
        </div>
      </section>`;
  }

  _stopGuess() {
    const on = (k) => this._shown.has(k);
    const hot = (k) => (this._pick === k ? 'hot' : '');
    const said = this._pick ? BLOB_PARTS[this._pick] : null;
    return html`
      <article class="stop" data-rv>
        <span class="node" aria-hidden="true"></span>
        <div class="copy">
          <span class="num rv" aria-hidden="true">01</span>
          <span class="tag rv" style="--i:1">${iconCompass} Guess first</span>
          <h3 class="display rv" style="--i:2">Invent it first. Then meet the <span class="key">real thing.</span></h3>
          <p class="lede rv" style="--i:3">Scientists guess before they look. Here, a wrong guess costs nothing. It helps the answer stick.</p>
          <div class="quiz rv" style="--i:4">
            <p class="q-ask" id="lv-ask">Planet Blob needs a wall, a power plant and a factory. So does a real cell. Which part is its power plant?</p>
            <ul class="opts" role="list" aria-labelledby="lv-ask">
              ${BLOB_OPTIONS.map(([k, letter, text]) => {
                const state = this._pick === k ? (BLOB_PARTS[k].right ? 'right' : 'wrong') : '';
                return html`<li><button class="opt ${state}" ?disabled=${this._solved} @click=${() => this._choose(k)}>
                  <span class="k" aria-hidden="true">${letter}</span><span>${text}</span>
                  <span class="mark" aria-hidden="true">${state === 'right' ? iconCheck : state === 'wrong' ? iconClose : ''}</span>
                </button></li>`;
              })}
            </ul>
            <div class="q-say" aria-live="polite">
              <quill-mascot size="mini" .idle=${false} .expression=${said ? (said.right ? 'heart' : 'surprised') : 'happy'}></quill-mascot>
              <p class="${said?.right ? 'yes' : ''}">${said ? said.text : 'Pick the one that sounds right to you. There is no penalty for a wrong guess.'}</p>
            </div>
          </div>
        </div>
        <div class="art rv" style="--i:2"><div class="blob-wrap">${blob(on, hot)}</div></div>
      </article>`;
  }

  _stopRead() {
    const scene = (story) => html`
      <div class="scene">
        <div class="fig">${mitoBuddy(story)}</div>
        ${story
          ? html`<p class="speech">I turn your lunch into energy. Muscles keep me very busy!</p>`
          : html`<p>Mitochondria release <b>energy</b> from food. Busy cells, like muscle cells, have <b>many</b> of them.</p>`}
      </div>`;
    return html`
      <article class="stop flip" data-rv>
        <span class="node" aria-hidden="true"></span>
        <div class="copy">
          <span class="num rv" aria-hidden="true">02</span>
          <span class="tag rv" style="--i:1">${iconGuide} Two ways to read</span>
          <h3 class="display rv" style="--i:2">Same lesson. <span class="key">Your style.</span></h3>
          <p class="lede rv" style="--i:3">Read a lesson as clean classic slides, or as a comic story. The questions and your progress stay the same.</p>
          <span class="drag-hint rv" style="--i:4">${this._live ? html`${iconBolt} This is a real slide from the app` : html`${iconArrowRight} Drag the line to compare`}</span>
        </div>
        <div class="art rv" style="--i:2">
          <div class="device-stage"><div class="device ${this._turning ? 'turning' : ''}"><div class="screen ${this._live ? 'live' : ''}">
            ${this._live ? html`
              <iframe class="real ${this._look === 'classic' ? 'on' : ''}" title="The slide in the classic look" src=${this._previewUrl('classic')}
                @load=${() => { this._classicLoaded = true; this.requestUpdate(); }} tabindex=${this._look === 'classic' ? '0' : '-1'}></iframe>
              ${this._classicLoaded ? html`<iframe class="real ${this._look === 'story' ? 'on' : ''}" title="The slide in the story look" src=${this._previewUrl('story')} tabindex=${this._look === 'story' ? '0' : '-1'}></iframe>` : ''}
              <span class="look-name ${this._look === 'classic' ? 'l' : 'r'}" aria-hidden="true">${this._look === 'classic' ? 'Classic' : 'Story'}</span>
            ` : html`
            <div class="look classic" aria-hidden="true">
              <span class="crumb">Cells · Lesson 3</span>
              <h4>Why does a cell need mitochondria?</h4>
              ${scene(false)}
              <div class="chips"><span class="chip">Muscle cell</span><span class="chip alt">Skin cell</span></div>
            </div>
            <div class="look story" aria-hidden="true">
              <span class="crumb">Cells · Lesson 3</span>
              <h4>Meanwhile, inside Blob...</h4>
              ${scene(true)}
              <div class="chips"><span class="chip">Muscle cell</span><span class="chip alt">Skin cell</span></div>
            </div>
            <span class="look-name l" aria-hidden="true">Classic</span>
            <span class="look-name r" aria-hidden="true">Story</span>
            <span class="divider" aria-hidden="true"></span>
            <input class="split-range" type="range" min="4" max="96" value="50" aria-label="Compare the classic look and the story look" @input=${this._onSplit}>
            `}
          </div></div></div>
          <div class="read-ctl">
            ${this._live ? html`
              <div class="lookswitch" role="radiogroup" aria-label="Look">
                ${['classic', 'story'].map((l) => html`<button role="radio" aria-checked=${this._look === l ? 'true' : 'false'} @click=${() => this._setLook(l)}>${l === 'classic' ? 'Classic' : 'Story'}</button>`)}
              </div>` : html`
              <button class="pill-btn" @click=${this._openLive}>${iconBolt} Open the real slide</button>`}
          </div>
        </div>
      </article>`;
  }

  _stopArcade() {
    return html`
      <article class="stop wide" data-rv>
        <span class="wp top" aria-hidden="true"></span>
        <span class="node" aria-hidden="true"></span>
        <span class="wp bot" aria-hidden="true"></span>
        <div class="copy">
          <span class="num rv" aria-hidden="true">03</span>
          <span class="tag rv" style="--i:1">${iconGamepad} Arcade</span>
          <h3 class="display rv" style="--i:2">Practice that plays <span class="key">like a game.</span></h3>
          <p class="lede rv" style="--i:3">Quick games use the same ideas as your lessons. Catch the fractions that match. Decide if a science claim is a myth or a fact.</p>
        </div>
        <div class="arcade rv" style="--i:4">
          <div class="marquees" role="tablist" aria-label="Choose a game">
            ${Object.entries(GAMES).map(([id, gm]) => html`
              <button class="mq ${id}" role="tab" aria-selected=${this._game === id ? 'true' : 'false'} aria-controls="lv-cab" @click=${() => this._pickGame(id)}>
                <span class="bulbs" aria-hidden="true"></span><b>${gm.title}</b><small>${gm.sub}</small>
              </button>`)}
          </div>
          <div class="cab-big ${this._game}" id="lv-cab" role="tabpanel" aria-label=${GAMES[this._game].title}>
            <span class="cab-side l" aria-hidden="true"></span><span class="cab-side r" aria-hidden="true"></span>
            <div class="cab-live">
              <div class="cab-mount"></div>
              ${this._gameOn !== this._game ? html`<div class="cab-wait" aria-hidden="true"><quill-loader size="84" label="Loading the game..."></quill-loader></div>` : ''}
            </div>
            <div class="deck">${GAMES[this._game].keys.map((k) => (Array.isArray(k) ? k.map((kk) => html`<kbd>${kk}</kbd>`) : html`<span>${k}</span>`))}</div>
          </div>
        </div>
        <p class="cab-note rv" style="--i:5">After every mistake, the game shows <b>why</b>, so you learn from it. <span class="for-gu">Grown-ups: authors add games like these with a data file, not code. <a href="#/guides/arcade-games">Same deck, different games ${iconArrowRight}</a></span></p>
      </article>`;
  }

  _stopWrong() {
    return html`
      <article class="stop" data-rv>
        <span class="node" aria-hidden="true"></span>
        <div class="copy">
          <span class="num rv" aria-hidden="true">04</span>
          <span class="tag rv" style="--i:1">${iconCheck} Wrong answers welcome</span>
          <h3 class="display rv" style="--i:2">A wrong answer is <span class="key">a starting point.</span></h3>
          <p class="lede rv" style="--i:3">When you get something wrong, Quill does not just say "wrong". He shows you which part of your idea works, and which part to fix.</p>
          <div class="model-pair rv" style="--i:4" aria-hidden="true">
            <figure class="old">
              <svg viewBox="0 0 92 92"><ellipse class="atom-orbit" cx="46" cy="46" rx="40" ry="16"></ellipse><ellipse class="atom-orbit" cx="46" cy="46" rx="40" ry="16" transform="rotate(60 46 46)"></ellipse><circle class="atom-n" cx="46" cy="46" r="8"></circle><circle class="atom-e" cx="86" cy="46" r="5"></circle><circle class="atom-e" cx="26" cy="12" r="5"></circle></svg>
              <figcaption>Planets</figcaption>
            </figure>
            <span class="arrow">${iconArrowRight}</span>
            <figure>
              <svg viewBox="0 0 92 92">${[...Array(46)].map((_, i) => {
                const a = i * 2.4;
                const rr = 8 + ((i * 37) % 31);
                return svg`<circle class="atom-cloud" cx="${(46 + Math.cos(a) * rr).toFixed(1)}" cy="${(46 + Math.sin(a) * rr * 0.9).toFixed(1)}" r="2.2" opacity="${(1 - rr / 46).toFixed(2)}"></circle>`;
              })}<circle class="atom-n" cx="46" cy="46" r="8"></circle></svg>
              <figcaption>Cloud</figcaption>
            </figure>
          </div>
        </div>
        <div class="art">
          <div class="chat" role="log" aria-label="A short chat between a student and Quill">
            ${CHAT.map(([who, text, t]) => (who === 'tp'
              ? html`<div class="msg q tp" style="--t:${t}" aria-hidden="true"><quill-mascot size="mini" .idle=${false}></quill-mascot><span class="typing"><i></i><i></i><i></i></span></div>`
              : html`<div class="msg ${who}" style="--t:${t}">
                  ${who === 'q' ? html`<quill-mascot size="mini" .idle=${false} expression="happy"></quill-mascot>` : ''}
                  <p><span class="who">${who === 'q' ? 'Quill' : 'You'}</span>${text}</p>
                </div>`))}
          </div>
        </div>
      </article>`;
  }

  _stopMaths() {
    const frac = (a, b, cls = '') => html`<span class="frac ${cls}"><span>${a}</span><span>${b}</span></span>`;
    return html`
      <article class="stop flip" data-rv>
        <span class="node" aria-hidden="true"></span>
        <div class="copy">
          <span class="num rv" aria-hidden="true">05</span>
          <span class="tag rv" style="--i:1">${iconNib} Type maths</span>
          <h3 class="display rv" style="--i:2">Write maths the way you <span class="key">write on paper.</span></h3>
          <p class="lede rv" style="--i:3">Fractions, powers and roots, with a keyboard made for maths. No strange codes to learn.</p>
        </div>
        <div class="art">
          <div class="mathcard" role="img" aria-label="A maths answer box. The question asks for half of three quarters, and the answer three eighths is typed with the maths keyboard.">
            <p class="m-q">Half of ${frac(3, 4)} is how much?</p>
            <div class="field">
              <span class="lhs">=</span>
              <span class="frac big"><span class="slot" style="--t:1.1"><span class="v" style="--t:1.1">3</span></span><span class="slot" style="--t:2.3"><span class="v" style="--t:2.3">8</span></span></span>
              <span class="ok">${iconCheck}</span>
            </div>
            <div class="keys">
              <span class="key-b" data-t style="--t:0.4"><span class="frac"><span></span><span></span></span></span>
              <span class="key-b" data-t style="--t:1.1">3</span>
              <span class="key-b" data-t style="--t:1.7">&darr;</span>
              <span class="key-b" data-t style="--t:2.3">8</span>
              <span class="key-b go" data-t style="--t:2.9">${iconCheck}</span>
            </div>
            <p class="m-say"><quill-mascot size="mini" .idle=${false} expression="heart"></quill-mascot> That's right! Half of ${frac(3, 4)} is ${frac(3, 8)}.</p>
          </div>
          ${this._maths ? html`<try-block class="maths-try" lazy label="Your turn" .data=${this._maths} .bundleId=${SHOWCASE_BUNDLE}></try-block>` : ''}
          <a class="guide-link" href="#/guides/typing-maths">${iconMath} How to type fractions, powers and roots ${iconArrowRight}</a>
        </div>
      </article>`;
  }

  _route() {
    return html`
      <section class="route-sec" id="explorers" data-sec aria-labelledby="lv-ex">
        <div class="layer" aria-hidden="true">
          <svg viewBox="0 0 1440 2400" preserveAspectRatio="xMidYMid slice"><path class="stars" d="${ROUTE_STARS}"></path></svg>
        </div>
        <div class="wrap">
          <header class="route-head" data-rv>
            <h2 id="lv-ex" class="display stair">
              <span class="s1 rv">Guess.</span><span class="s2 rv" style="--i:1">Play.</span><span class="s3 rv" style="--i:2"><span class="key">Find out why.</span></span>
            </h2>
            <div class="side">
              <span class="kicker rv" style="--i:3">${iconCompass} For explorers · Classes 9 to 12</span>
              <p class="lede rv" style="--i:4">Every lesson starts with your own idea. Here are six things you will do along the way.</p>
            </div>
          </header>
          <div class="route">
            <svg class="trail-svg" aria-hidden="true" preserveAspectRatio="none">
              <defs><linearGradient id="lv-trail-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" class="s-ex"></stop><stop offset="0.6" class="s-dawn"></stop><stop offset="1" class="s-pink"></stop>
              </linearGradient></defs>
              <path class="trail-ghost"></path><path class="trail-glow"></path><path class="trail-line"></path>
            </svg>
            <span class="tip" aria-hidden="true"><svg viewBox="-8 -8 16 16">${sparkle()}</svg></span>
            ${this._stopGuess()}
            ${this._stopRead()}
            ${this._stopArcade()}
            ${this._stopWrong()}
            ${this._stopMaths()}
            ${stopDescriptive({ question: this._descQ, replay: replaySheet })}
            <div class="route-end" data-rv>
              <svg class="end-star rv" viewBox="-8 -8 16 16" aria-hidden="true">${sparkle()}</svg>
              <h3 class="display rv" style="--i:1">Ready, explorer?</h3>
              <button class="cta big rv" style="--i:2" @click=${this._startLearning}>Start learning ${iconArrowRight}</button>
              <p class="fine rv" style="--i:3">Free. No account needed. Your progress stays on this device.</p>
            </div>
          </div>
        </div>
      </section>`;
  }

  _dawn() {
    return html`
      <section class="dawn" data-sec aria-labelledby="lv-hand">
        <div class="dawn-pin">
          <div class="dawn-stars" aria-hidden="true"><svg viewBox="0 0 1440 520" preserveAspectRatio="xMidYMin slice"><path class="stars" d="${DAWN_STARS}"></path></svg></div>
          <div class="rays" aria-hidden="true"></div>
          <div class="sun" aria-hidden="true"></div>
          <div class="dawn-copy">
            <div class="say-a" aria-hidden="true">
              <span class="kicker">Hand-off</span>
              <p class="display" style="font-size:clamp(2.4rem, 7.2vw, 5.6rem);margin:0">Explorers, show this to a grown-up.</p>
            </div>
            <div class="say-b">
              <span class="kicker">Hand-off</span>
              <h2 id="lv-hand" class="display">Grown-ups, <span class="key">this half is yours.</span></h2>
              <p class="lede">How courses are made, and why we do not promise magic.</p>
            </div>
          </div>
          <svg class="shelf" viewBox="0 0 1440 150" preserveAspectRatio="none" aria-hidden="true">
            <path class="shelf-face" d="M0 44L1440 40V150H0Z"></path>
            <path class="shelf-top" d="M0 36C180 28 340 40 520 34S900 26 1100 34 1340 30 1440 32V52C1260 56 1080 50 900 54S520 58 340 54 120 56 0 52Z"></path>
          </svg>
          <span class="prints" aria-hidden="true"></span>
          <div class="tear" aria-hidden="true">
            <svg viewBox="0 0 1440 40" preserveAspectRatio="none"><path class="tear-paper" d="M0 40V22L40 14 86 26 130 16 178 28 226 12 270 26 318 18 366 30 414 14 462 24 510 16 558 28 606 18 654 26 702 12 750 24 798 16 846 30 894 18 942 26 990 12 1038 24 1086 16 1134 28 1182 18 1230 26 1278 14 1326 24 1374 16 1440 22V40Z"></path></svg>
            <div class="fill"></div>
          </div>
          <div class="walker" aria-hidden="true">
            <span class="waddle"><quill-mascot size="sm" .idle=${false}></quill-mascot></span>
          </div>
        </div>
      </section>`;
  }

  _grownups() {
    return html`
      <section class="paper" id="grownups" data-sec aria-labelledby="lv-gu">
        <div class="wrap">
          <header class="poster-head" data-rv>
            <div>
              <span class="kicker rv">${iconNib} For grown-ups · Honest expectations</span>
              <h2 id="lv-gu" class="poster rv" style="--i:1">There is no<br><span class="no">magic wand.</span>
                <span class="yes">There is a <span class="key">method.</span></span></h2>
            </div>
            <p class="lede rv" style="--i:2">You may hope one prompt can turn a chapter into a perfect game for your child. It can't. CoAuthor's <b>agent kit</b> gives you a method instead: <b>small steps, and you approve every one</b>.</p>
            ${wand()}
          </header>

          <div class="board-grid">
            <div class="clip-wrap" data-rv>
              <span class="tape t1" aria-hidden="true"></span><span class="tape t2" aria-hidden="true"></span>
              <article class="clip rv">
                <div class="masthead"><span>What the hype promises</span><span>Page 1</span></div>
                <h3>One prompt turns any chapter into a game!</h3>
                <p class="quote">"My son loves cricket. Turn the <span>tissues chapter</span> into a cricket story game!"</p>
                <ul>
                  ${HYPE.map((t, i) => html`<li><span class="x">${iconClose}</span><span><span class="strike" style="--i:${i}">${t}</span></span></li>`)}
                </ul>
              </article>
              <p class="note rv" style="--i:2">${scrawlArrow()}It looks impressive.<br>It does not teach.</p>
            </div>

            <article class="map" data-rv>
              <span class="label">What actually works</span>
              <h3>Six small steps, with you in charge</h3>
              <p>Each step is small enough to check. Nothing reaches your child until you approve it.</p>
              <div class="steps-box">
              <svg class="road" aria-hidden="true" preserveAspectRatio="none"><path></path></svg>
              <ol class="steps">
                ${METHOD.map(([name, text], i) => html`
                  <li class="step">
                    ${stone(i)}
                    <h4>${name}</h4>
                    <p>${text}</p>
                  </li>`)}
              </ol>
              <span class="map-quill" aria-hidden="true" style="opacity:0"><quill-mascot size="mini" .idle=${false}></quill-mascot></span>
              </div>
            </article>
          </div>

          ${doorways(this._v)}
          ${commonsAndPrivate()}
          ${guidesLibrary(this._v)}
          ${shelf(this._v)}

          <div class="paper-foot" data-rv>
            <div class="rv">
              <h3>Want to write a course?</h3>
              <p>CoAuthor is free and open source (MIT). No accounts, no ads, no tracking.</p>
            </div>
            <div class="btns rv" style="--i:1">
              <button class="ink-btn solid" @click=${this._authorGuides}>${iconGuide} Read the author guides</button>
              <button class="ink-btn" @click=${this._startLearning}>Start learning ${iconArrowRight}</button>
            </div>
          </div>
        </div>
      </section>`;
  }

  render() {
    const dark = this._theme === 'dark';
    return html`
      <div class="progress" aria-hidden="true"></div>
      <div class="bar-slot">
        <header class="bar">
          <button class="logo" @click=${() => this._go('top')} aria-label="CoAuthor, back to top">
            <coauthor-logo></coauthor-logo>
          </button>
          <nav aria-label="On this page">
            <button @click=${() => this._go('explorers')}>${iconCompass}Explorers</button>
            <button @click=${() => this._go('grownups')}>${iconNib}Grown-ups</button>
            <button @click=${this._authorGuides}>${iconGuide}Guides</button>
          </nav>
          <button class="icon-btn" @click=${this._toggleTheme} aria-label="${dark ? 'Switch to light theme' : 'Switch to dark theme'}">${dark ? iconSun : iconMoon}</button>
          <button class="cta small" @click=${this._startLearning}>Start learning</button>
        </header>
      </div>
      <div class="night">
        ${this._hero()}
        ${this._route()}
      </div>
      ${this._dawn()}
      ${this._grownups()}
      ${footer(this._v)}
    `;
  }
}

customElements.define('landing-view', LandingView);
