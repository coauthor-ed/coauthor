import { LitElement, html, css } from 'lit';
import { EventBus } from '../../core/EventBus.js';
import { burst } from '../celebrate.js';
import { LessonModeMixin } from '../../core/mixins/LessonModeMixin.js';
import { quillStage } from '../../looks/quill/stage.js';
import './QuillMascot.js';

/**
 * <quill-math-coach> - Quill beside a math-workspace@1 question.
 *
 * Shell-level, like <quill-coach>: the plugin never touches Quill. It emits
 * the math:* events (docs/math-workspace/CONTRACTS.md section 3) and this
 * element reacts per the choreography rows marked "math workspace" in
 * docs/ui-ux-design-system.md 1.1.2. The one way back is the hint chip, which
 * emits math:hint-request on the bus (invariant 4) instead of poking the
 * plugin's shadow root.
 *
 * Layout: a rail in the right gutter only when the viewport leaves room
 * beside the lesson column (very wide screens); otherwise a compact dock
 * above the action bar. In dock layout the host is also an in-flow spacer of
 * the dock's height, so at the end of the page the dock sits under the
 * answer area, never on it. When an event rect (the line being worked on)
 * lands under the dock mid-page, the dock tucks down to a peeking head.
 *
 * Restraint: acts go through QuillMascot.perform(), whose 20 s cooldown is
 * the budget. Expressions, glances and the bubble are free.
 *
 * Quill is the helper, not a spectator: he arrives with the question (on
 * lesson:beat-changed) with a short opener, keeps a "Give me a clue" chip
 * ready until the question is solved (tapping Quill does the same), and says
 * every hint the plugin opens. He answers the plugin's math:hello with
 * math:coach-here, so the plugin leaves its inline hint bubble to him.
 *
 * Part of the Quill look (step E2): the math:* events are the math cue
 * family (src/core/cues.js), and this element is how the Quill look answers
 * them. It reacts only while the Quill reactor runs (quillStage.active), so a
 * look without it leaves the plugin to show its own hint bubble.
 */

const RAIL_MIN_GUTTER = 214;   // px between the lesson column and the edge
const LOOK_RESET_MS = 1600;
const LINE_MS = 6500;
const HINT_LINE_MS = 30000;    // a clue stays until the student acts on it
const TOAST_MS = 4200;
const LEAN_MS = 12000;

const LINES = {
  firstFail: 'That line does not follow from the one above. Read the note under it, or ask me for a clue.',
  secondMiss: 'This one is tricky. Take a clue from me, then try again.',
  firstMiss: 'Not quite yet. Read the note under your answer, or ask me for a clue.',
  secondFail: 'This step is a tricky one. Compare it with the line above, or take a clue.',
  stuck: 'Take your time. Want a clue?',
  goalClean: 'Solved without any hints. Well done!',
  goalHelped: 'Solved! Well done. Try the next one with fewer clues.',
  noClue: 'That was my last clue for this step. Read the note under your line, and compare it with the line above.',
  ready: 'I am here if you get stuck. Tap me for a clue.',
};

/** Openers by the first part's shape. Plain words (prose-for-Indian-students). */
const OPENERS = {
  'step-chain': 'Write one line at a time and press Enter. I will check each step as you go.',
  'two-sided': 'Work on either side, one line at a time, until both sides look the same.',
  expression: 'Type your answer and press Enter. Tap me if you want a clue.',
  slots: 'Fill each box and press Enter. Each box is checked on its own.',
  'solution-set': 'Add each root one at a time. You can type your working too.',
  interval: 'Type the answer, or build it piece by piece. Tap me if you want a clue.',
};

/** Short praise for a valid step; plain and calm, never over the top. */
const PRAISE = ['That step works.', 'Good move.', 'Yes, that follows.', 'Neat. Keep going.'];
const PRAISE_ANSWER = ['That one is right.', 'Correct. Keep going.', 'Yes, well done.'];

const CLUE_KICKER = { 1: 'Clue', 2: 'Pattern', 3: 'Worked step' };

const text = (v) => (v && typeof v === 'object' ? (v.en ?? Object.values(v)[0] ?? '') : (v ?? ''));
// Strategy strings may carry $...$ maths; the bubble is plain text, so drop
// the delimiters and the most common commands rather than show raw LaTeX.
const plain = (s) => String(s)
  .replace(/\$/g, '')
  .replace(/\\(?:left|right|,|;|!)/g, '')
  .replace(/\\(cdot|times)/g, 'x')
  .replace(/\\([a-zA-Z]+)/g, '$1')
  .replace(/[{}]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/** Text with $...$ maths as bubble content: text parts stay text (Lit
 *  escapes them), maths parts become MathLive math-span nodes when MathLive
 *  is loaded (it is, once a math-workspace question is on screen); else the
 *  whole string falls back to plain(). */
function richParts(s) {
  const str = String(s ?? '');
  if (!str.includes('$') || !customElements.get('math-span')) return [plain(str)];
  return str.split('$').map((seg, i) => {
    if (i % 2 === 0) return seg;
    const el = document.createElement('math-span');
    el.textContent = seg;
    return el;
  });
}

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class QuillMathCoach extends LessonModeMixin(LitElement) {
  static properties = {
    _visible: { state: true },
    _line: { state: true },
    _chip: { state: true },
    _toast: { state: true },
    _lean: { state: true },
    _spark: { state: true },
    _idea: { state: true },
    _layout: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      height: 0;
      pointer-events: none;
      transition: height var(--motion-base) var(--ease-settle);
    }
    :host([layout='dock'][visible]) { height: var(--mwc-dock-h, 104px); }

    .dock {
      position: fixed;
      z-index: 29;   /* just under the action bar (30): a resting Quill peeks over it */
      right: var(--space-4);
      bottom: calc(var(--lesson-chrome-bottom, 0px) + var(--space-3));
      display: flex;
      pointer-events: none;
      opacity: 0;
      transform: translateX(calc(100% + var(--space-6)));
      transition: opacity var(--motion-base) var(--ease-settle),
                  transform var(--motion-slow, 420ms) var(--ease-spring);
    }
    :host([visible]) .dock { opacity: 1; transform: none; }
    /* Story mode: the round turn buttons float bottom right with no bar
       under them, so Quill stands clear of them, on his own shadow. */
    :host([data-lesson-mode='story']) .dock {
      bottom: calc(var(--lesson-chrome-bottom, 0px) + var(--space-6));
    }

    /* Rail: bubble and cards stacked above Quill on his perch. */
    :host([layout='rail']) .dock {
      width: 196px;
      flex-direction: column;
      align-items: flex-end;
      gap: var(--space-3);
    }
    /* Dock: one row, bubble to Quill's left. */
    :host([layout='dock']) .dock {
      left: var(--space-4);
      flex-direction: row;
      align-items: flex-end;
      justify-content: flex-end;
      gap: var(--space-2);
      transform: translateY(calc(100% + var(--space-6)));
    }
    :host([layout='dock'][visible]) .dock { transform: none; }
    :host([layout='dock'][visible][tucked]) .dock,
    :host([layout='dock'][visible][resting]) .dock { transform: translateY(calc(100% - 34px)); }
    :host([tucked]) .talk { visibility: hidden; }

    .talk {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: var(--space-2);
      min-width: 0;
    }

    .bubble {
      position: relative;
      pointer-events: auto;
      max-width: 196px;
      padding: var(--space-3) var(--space-4);
      background: var(--bubble-fill);
      color: var(--text-main);
      border: var(--rule-w, 2px) solid var(--bubble-ink);
      border-radius: var(--radius-lg) var(--radius-lg) 6px var(--radius-lg);
      box-shadow: var(--shadow-lg);
      font-family: var(--font-family);
      font-weight: 700;
      font-size: var(--fs-small);
      line-height: 1.4;
      animation: pop-in var(--motion-base) var(--ease-spring);
    }
    :host([layout='dock']) .bubble { max-width: min(280px, calc(100vw - 120px)); }
    .bubble { cursor: pointer; }
    .bubble.hint { border-color: var(--accent-amber); }
    .bubble .kicker {
      display: block;
      margin-bottom: 2px;
      font-size: var(--fs-kicker);
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .chip {
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: 8px 14px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--primary-color);
      color: var(--on-primary);
      font-family: var(--font-heading);
      font-weight: 800;
      font-size: var(--fs-small);
      cursor: pointer;
      box-shadow: var(--press-1) var(--primary-hover);
      transition: transform 0.08s;
      animation: pop-in var(--motion-base) var(--ease-spring);
    }
    .chip:active { transform: translateY(var(--press-travel)); box-shadow: none; }
    .chip:focus-visible { outline: 3px solid var(--focus-ring, var(--primary-color)); outline-offset: 3px; }
    .chip svg { width: 16px; height: 16px; flex: none; }

    /* Formula card: a small collectible, tilted, on a coloured lip. */
    .card {
      pointer-events: none;
      width: 176px;
      padding: var(--space-3);
      background: var(--bg-surface);
      color: var(--text-main);
      border: var(--rule-w, 2px) solid var(--accent-gold);
      border-radius: var(--radius-md);
      box-shadow: 0 5px 0 var(--accent-gold), var(--shadow-lg);
      transform: rotate(-3deg);
      font-family: var(--font-family);
      animation: card-in 520ms var(--ease-spring);
    }
    .card .kicker {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: var(--fs-kicker);
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .card .kicker svg { width: 14px; height: 14px; color: var(--accent-gold); }
    .card .label {
      margin-top: 4px;
      font-family: var(--font-heading);
      font-weight: 800;
      font-size: 0.98rem;
      line-height: 1.25;
    }

    .bird {
      position: relative;
      flex: none;
      line-height: 0;
      transform-origin: 50% 100%;
      transition: transform var(--motion-base) var(--ease-spring);
    }
    .bird.lean { transform: rotate(-9deg) translateX(-6px); }
    .bird.askable { cursor: pointer; }
    /* A "?" badge: Quill himself is a clue button. */
    .ask {
      position: absolute;
      top: 2px;
      left: 0;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--accent-amber);
      color: var(--on-accent);
      font-family: var(--font-heading);
      font-weight: 800;
      font-size: 0.85rem;
      box-shadow: 0 2px 0 color-mix(in srgb, var(--accent-amber) 60%, var(--text-main));
      pointer-events: none;
      animation: ask-bob 2.4s var(--ease-settle) infinite;
    }
    @keyframes ask-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
    :host([layout='rail']) .bird { padding-bottom: 6px; }
    /* A soft perch so he stands on something rather than floats. */
    :host([layout='rail']) .bird::after {
      content: '';
      position: absolute;
      left: 12%;
      right: 12%;
      bottom: 0;
      height: 12px;
      border-radius: 50%;
      background: var(--bg-sunken);
      box-shadow: inset 0 -2px 0 var(--border-color);
      z-index: -1;
    }
    /* Dock: a soft ground shadow so he stands rather than floats. */
    :host([layout='dock']) .bird::after {
      content: '';
      position: absolute;
      left: 14%;
      right: 14%;
      bottom: -5px;
      height: 10px;
      border-radius: 50%;
      background: radial-gradient(closest-side, var(--scrim), transparent);
      z-index: -1;
      pointer-events: none;
    }
    quill-mascot { --quill-size: 96px; pointer-events: auto; }
    :host([layout='dock']) quill-mascot { --quill-size: 70px; }
    @media (min-width: 900px) { :host([layout='dock']) quill-mascot { --quill-size: 84px; } }

    .spark {
      position: absolute;
      top: 6%;
      right: 4%;
      width: 22px;
      height: 22px;
      color: var(--accent-gold);
      animation: spark 700ms var(--ease-spring) forwards;
      pointer-events: none;
    }

    /* ---- The clue moment: a lightbulb switches on over his head, its rays
       burst out, he hops, and the clue grows out of him. ---- */
    .idea {
      position: absolute;
      left: 50%;
      bottom: calc(100% - 6px);
      width: 64px;
      height: 64px;
      margin-left: -32px;
      pointer-events: none;
      animation: idea-life 1900ms var(--ease-settle) forwards;
    }
    :host([layout='dock']) .idea { width: 56px; height: 56px; margin-left: -28px; }
    .idea .glow {
      position: absolute;
      inset: -30%;
      border-radius: 50%;
      background: radial-gradient(closest-side, color-mix(in srgb, var(--accent-gold) 70%, transparent), transparent);
      opacity: 0;
      animation: idea-glow 1900ms ease-out forwards;
    }
    .idea svg { position: relative; width: 100%; height: 100%; overflow: visible; }
    .idea .bulb {
      transform-box: fill-box;
      transform-origin: 50% 100%;
      animation: idea-bulb 760ms var(--ease-spring) both;
    }
    .idea .glass { fill: var(--bg-surface); stroke: var(--bubble-ink); stroke-width: 2.4; animation: idea-on 900ms steps(1) forwards; }
    .idea .cap { fill: var(--text-muted); stroke: var(--bubble-ink); stroke-width: 2; }
    .idea .wire { fill: none; stroke: var(--bubble-ink); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
    .idea .shine { fill: none; stroke: var(--bg-surface); stroke-width: 2.4; stroke-linecap: round; opacity: 0; animation: idea-shine 1900ms ease-out forwards; }
    .idea .rays line {
      stroke: var(--accent-gold);
      stroke-width: 3.2;
      stroke-linecap: round;
      stroke-dasharray: 8 20;
      stroke-dashoffset: 8;
      animation: idea-ray 900ms ease-out 360ms forwards;
    }
    .idea .dust {
      fill: var(--accent-gold);
      transform-box: fill-box;
      transform-origin: center;
      opacity: 0;
      animation: idea-dust 1100ms ease-out forwards;
    }
    .idea .dust.d2 { animation-delay: 120ms; fill: var(--accent-amber); }
    .idea .dust.d3 { animation-delay: 220ms; }
    @keyframes idea-life {
      0%, 78% { opacity: 1; transform: none; }
      100% { opacity: 0; transform: translateY(-14px) scale(.9); }
    }
    @keyframes idea-bulb {
      0% { transform: scale(0) rotate(-24deg); }
      55% { transform: scale(1.22) rotate(10deg); }
      75% { transform: scale(.94) rotate(-5deg); }
      100% { transform: scale(1) rotate(0deg); }
    }
    /* A flicker, then on: off, on, off, on for good. */
    @keyframes idea-on {
      0% { fill: var(--bg-surface); }
      38% { fill: var(--accent-gold); }
      46% { fill: var(--bg-surface); }
      56%, 100% { fill: var(--accent-gold); }
    }
    @keyframes idea-glow {
      0%, 40% { opacity: 0; transform: scale(.4); }
      60% { opacity: 1; transform: scale(1.1); }
      100% { opacity: .55; transform: scale(1); }
    }
    @keyframes idea-shine { 0%, 50% { opacity: 0; } 70%, 100% { opacity: .9; } }
    @keyframes idea-ray {
      0% { stroke-dashoffset: 8; opacity: 1; }
      60% { stroke-dashoffset: -6; opacity: 1; }
      100% { stroke-dashoffset: -16; opacity: 0; }
    }
    @keyframes idea-dust {
      0% { opacity: 0; transform: translate(0, 0) scale(.3); }
      30% { opacity: 1; }
      100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1) rotate(90deg); }
    }

    /* The clue bubble: grows out of Quill, then a gold shine sweeps it. */
    .bubble.hint {
      border-color: var(--accent-amber);
      box-shadow: 0 4px 0 var(--accent-amber), var(--shadow-lg);
      transform-origin: 100% 100%;
      overflow: hidden;
      animation: none;   /* _eureka() grows it, every clue */
    }
    .bubble.hint::after {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(105deg, transparent 30%, color-mix(in srgb, var(--accent-gold) 32%, transparent) 50%, transparent 70%);
      background-size: 260% 100%;
      background-position: 130% 0;
    }
    .bubble.hint .kicker {
      display: flex;
      width: fit-content;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      padding: 2px 9px 2px 6px;
      border-radius: var(--radius-pill);
      background: var(--accent-amber);
      color: var(--on-accent);
      letter-spacing: 0.06em;
    }
    .bubble.hint .kicker svg { width: 12px; height: 12px; flex: none; }
    .pips { display: inline-flex; gap: 3px; margin-left: 2px; }
    .pip {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--on-accent) 30%, transparent);
    }
    .pip.on { background: var(--on-accent); }

    @keyframes pop-in { from { transform: scale(.7) translateY(8px); opacity: 0; } }
    @keyframes card-in {
      0% { transform: rotate(8deg) translateY(30px) scale(.6); opacity: 0; }
      60% { transform: rotate(-6deg) translateY(-4px) scale(1.05); opacity: 1; }
    }
    @keyframes spark {
      0% { transform: scale(.2) rotate(0deg); opacity: 0; }
      40% { transform: scale(1.2) rotate(40deg); opacity: 1; }
      100% { transform: scale(.8) rotate(90deg) translateY(-10px); opacity: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      :host, .dock, .bird { transition: none; }
      .bubble, .chip, .card { animation: none; }
      .spark { display: none; }
      .ask { animation: none; }
      .idea, .idea * { animation: none !important; }
      .idea .glass { fill: var(--accent-gold); }
      .idea .rays, .idea .dust { display: none; }
      .bubble.hint::after { display: none; }
      .bird.lean { transform: none; }
    }
  `;

  constructor() {
    super();
    this._visible = false;
    this._line = null;          // { text, kind } | null
    this._chip = null;          // { label, questionId, partId } | null
    this._toast = null;         // { label } | null
    this._lean = false;
    this._spark = 0;
    this._idea = 0;
    this._layout = 'dock';
    this._active = null;        // { questionId, lessonId, partId }
    this._fails = new Map();    // `${q}:${part}:${index}` -> invalid count
    this._goalSeen = new Set(); // questionIds that already fired math:goal
    this._valid = 0;            // valid steps on this question, for praise pacing
    this._timers = {};
    this._railBlocked = false;

    this._on = {
      'math:step-checked': (p) => this._onStep(p),
      'math:milestone': (p) => this._onMilestone(p),
      'math:stuck': (p) => this._onStuck(p),
      'math:hint': (p) => this._onHint(p),
      'math:goal': (p) => this._onGoal(p),
      'math:card-unlocked': (p) => this._onCard(p),
      'math:hello': (p) => this._onHello(p),
      'question:graded': (p) => this._onGraded(p),
      'lesson:beat-changed': (p) => this._onBeat(p),
      'lesson:complete': () => this._reset(),
    };
    // Inert unless the Quill look's reactor is running.
    for (const [ev, fn] of Object.entries(this._on)) {
      this._on[ev] = (p) => { if (quillStage.active) fn(p); };
    }
    this._onResize = () => this._pickLayout();
  }

  connectedCallback() {
    super.connectedCallback();
    for (const [ev, fn] of Object.entries(this._on)) EventBus.on(ev, fn);
    window.addEventListener('resize', this._onResize, { passive: true });
    this._pickLayout();
  }

  disconnectedCallback() {
    for (const [ev, fn] of Object.entries(this._on)) EventBus.off(ev, fn);
    window.removeEventListener('resize', this._onResize);
    Object.values(this._timers).forEach(clearTimeout);
    super.disconnectedCallback();
  }

  // ---- layout ---------------------------------------------------------

  _pickLayout() {
    // Lesson content spans min(1600px, 94vw) and math-workspace fills it, so
    // the rail only fits on very wide screens.
    const vw = window.innerWidth;
    const gutter = (vw - Math.min(1600, vw * 0.94)) / 2;
    const next = !this._railBlocked && gutter >= RAIL_MIN_GUTTER ? 'rail' : 'dock';
    if (next !== this._layout) this._layout = next;
    this.setAttribute('layout', this._layout);
  }

  /** Rail only: a working line under the rail means the plugin is wider than
   *  the usual column. Drop to the dock for the rest of this question. */
  _dodge(rect) {
    if (!rect) return;
    // Resting box (offset* ignore the slide-in transform).
    const el = this.renderRoot?.querySelector('.dock');
    if (!el || !el.offsetWidth) return;
    const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lesson-chrome-bottom')) || 0;
    const bottom = window.innerHeight - chrome - 12;
    const right = window.innerWidth - 16;
    const w = this._layout === 'rail' ? el.offsetWidth
      : (el.querySelector('.bird')?.offsetWidth || 0) + (el.querySelector('.talk')?.offsetWidth || 0) + 8;
    const dock = { left: right - w, right, top: bottom - el.offsetHeight, bottom };
    const hit = rect.x < dock.right && rect.x + rect.w > dock.left &&
      rect.y < dock.bottom && rect.y + rect.h > dock.top;
    if (hit && this._layout === 'rail') { this._railBlocked = true; this._pickLayout(); return; }
    // Dock: mid-page the working line can sit behind it. Tuck down to a
    // peeking head until the next event that does not collide.
    this.toggleAttribute('tucked', hit);
  }

  updated() {
    // Phones: with nothing to say he rests as a peeking head over the action
    // bar, so the dock covers the working only while it is talking.
    // The standing clue chip does not count: a resting Quill is still a clue
    // button (tap him; his "?" badge shows in the peek).
    const quiet = !this._line && !this._toast;
    this.toggleAttribute('resting', this._layout === 'dock' && window.innerWidth < 700 && quiet);
    if (this._layout !== 'dock' || !this._visible) return;
    const h = this.renderRoot.querySelector('.dock')?.offsetHeight;
    if (h) this.style.setProperty('--mwc-dock-h', `${h + 16}px`);
  }

  // ---- helpers --------------------------------------------------------

  get _bird() { return this.renderRoot?.querySelector('quill-mascot'); }

  _later(name, ms, fn) {
    clearTimeout(this._timers[name]);
    this._timers[name] = setTimeout(fn, ms);
  }

  /** Every math:* event goes through here first. Returns false to ignore. */
  _enter(p) {
    if (!p || p.mode === 'assess') return false;
    if (!this._active || this._active.questionId !== p.questionId) {
      this._active = { questionId: p.questionId, lessonId: p.lessonId, partId: p.partId };
      this._railBlocked = false;
      this._pickLayout();
    }
    if (p.partId) this._active.partId = p.partId;
    if (!this._visible) {
      this._visible = true;
      this.setAttribute('visible', '');
    }
    this.updateComplete.then(() => this._dodge(p.rect));
    return true;
  }

  _say(textStr, { kind = 'line', ms = LINE_MS, kicker = '', level = 0 } = {}) {
    this._line = { text: textStr, parts: richParts(textStr), kind, kicker, level };
    this._later('line', ms, () => { this._line = null; });
  }

  /** The clue chip. It stays until the question is solved. */
  _offerHint(label = 'Give me a clue') {
    if (!this._active || this._goalSeen.has(this._active.questionId)) return;
    const { questionId, partId } = this._active;
    this._chip = { label, questionId, partId };
  }

  _glance(rect) {
    const bird = this._bird;
    if (!bird || !rect) return;
    const b = bird.getBoundingClientRect();
    const dx = (rect.x + rect.w / 2) - (b.left + b.width / 2);
    const dy = (rect.y + rect.h / 2) - (b.top + b.height * 0.35);
    const n = Math.hypot(dx, dy) || 1;
    bird.look?.(dx / n, dy / n);
    this._later('look', LOOK_RESET_MS, () => this._bird?.look?.(0, 0));
  }

  _brow(name, ms = 1800) {
    const bird = this._bird;
    if (!bird) return;
    bird.setExpression(name);
    if (name !== 'happy') this._later('brow', ms, () => this._bird?.setExpression('happy'));
  }

  _sparkle() {
    if (reduced()) return;
    // Drop the node for one frame so the CSS animation restarts.
    const n = (this._sparkSeq = (this._sparkSeq || 0) + 1);
    this._spark = 0;
    requestAnimationFrame(() => { this._spark = n; });
  }

  /**
   * The clue moment. A lightbulb switches on over his head (CSS, restarted by
   * dropping the node for a frame), he hops with a squash and stretch, and the
   * clue bubble grows out of him with a gold shine across it. The hop and the
   * growth use the Web Animations API so that they replay for every clue,
   * even when the bubble node is reused.
   */
  _eureka() {
    this._brow('surprised', 700);
    const n = (this._ideaSeq = (this._ideaSeq || 0) + 1);
    this._idea = 0;
    requestAnimationFrame(() => { this._idea = n; });
    this._later('idea', 1950, () => { this._idea = 0; });
    if (reduced()) return;
    this.updateComplete.then(() => requestAnimationFrame(() => {
      const bird = this.renderRoot.querySelector('.bird');
      bird?.animate?.([
        { transform: 'none' },
        { transform: 'scale(1.1, .84)', offset: 0.16 },
        { transform: 'translateY(-18px) scale(.93, 1.1)', offset: 0.46 },
        { transform: 'translateY(0) scale(1.08, .9)', offset: 0.7 },
        { transform: 'scale(.98, 1.03)', offset: 0.86 },
        { transform: 'none' },
      ], { duration: 760, easing: 'ease-out' });
      const b = this.renderRoot.querySelector('.bubble.hint');
      if (!b?.animate) return;
      b.animate([
        { transform: 'translate(18px, 10px) scale(.12) rotate(8deg)', opacity: 0 },
        { transform: 'scale(1.05) rotate(-1.5deg)', opacity: 1, offset: 0.62 },
        { transform: 'none', opacity: 1 },
      ], { duration: 560, delay: 300, easing: 'cubic-bezier(.2,.9,.3,1.15)', fill: 'backwards' });
      try {
        b.animate([{ backgroundPosition: '130% 0' }, { backgroundPosition: '-30% 0' }],
          { duration: 1100, delay: 820, easing: 'ease-in-out', pseudoElement: '::after' });
      } catch { /* no pseudo-element animation: the bubble still grows */ }
    }));
  }

  // ---- choreography ---------------------------------------------------

  /** The question arrives: come in with an opener and the clue chip. */
  _greet(item) {
    if (!item?.id || item.mode === 'assess') return;
    if (this._active?.questionId === item.id && this._visible) return;
    this._enter({ questionId: item.id, partId: item.parts?.[0]?.id, mode: item.mode });
    this._valid = 0;
    const shape = item.parts?.[0]?.shape;
    // Phones: the opener would sit over the keypad, so it is brief there.
    this._say(OPENERS[shape] || LINES.ready, { ms: window.innerWidth < 700 ? 4500 : 9000 });
    this._offerHint();
    EventBus.emit('math:coach-here', { questionId: item.id });
  }

  _onHello(p) {
    if (!p || p.mode === 'assess') return;
    EventBus.emit('math:coach-here', { questionId: p.questionId });
  }

  _onStep(p) {
    if (!this._enter(p)) return;
    if (p.valid) {
      this._brow('happy');
      this._sparkle();
      // A spoken clue is done with once the student moves on.
      if (this._line?.kind === 'hint' || this._line?.kind === 'line') this._line = null;
      this._valid += 1;
      if (this._valid === 1 || this._valid % 3 === 0) {
        const chain = p.shape === 'step-chain' || p.shape === 'two-sided';
        const list = chain ? PRAISE : PRAISE_ANSWER;
        this._say(list[(this._valid - 1) % list.length], { ms: 2600 });
      }
      return;
    }
    // An unreadable line is half-typed, not a wrong step: look, say nothing.
    if (p.kind === 'unparsable') { this._glance(p.rect); return; }
    this._glance(p.rect);
    this._brow('surprised');
    // The plugin may report one Enter twice (Enter + blur); count it once.
    const key = `${p.questionId}:${p.partId}:${p.index}`;
    const now = Date.now();
    const prev = this._fails.get(key) || { n: 0, at: 0 };
    if (now - prev.at < 1200) return;
    const n = prev.n + 1;
    this._fails.set(key, { n, at: now });
    // The plugin already explains the counterexample under the line, so
    // Quill points to it and offers the clue.
    if (n === 1) {
      const chain = p.shape === 'step-chain' || p.shape === 'two-sided';
      this._say(chain ? LINES.firstFail : LINES.firstMiss, { ms: LINE_MS + 2000 });
      this._offerHint();
    } else if (n === 2) {
      this._bird?.perform('snack');
      const chain = p.shape === 'step-chain' || p.shape === 'two-sided';
      this._say(chain ? LINES.secondFail : LINES.secondMiss, { ms: LINE_MS + 3000 });
      this._offerHint();
    }
  }

  _onMilestone(p) {
    if (!this._enter(p)) return;
    this._glance(p.rect);
    this._bird?.perform('hop');
    this._sparkle();
    const label = plain(text(p.label));
    if (label) this._say(`${label}. Good progress!`, { ms: 3200, kicker: 'Milestone' });
  }

  _onStuck(p) {
    if (!this._enter(p)) return;
    this._glance(p.rect);
    this._lean = true;
    this._later('lean', LEAN_MS, () => { this._lean = false; });
    this._say(LINES.stuck, { ms: LEAN_MS });
    this._offerHint();
  }

  _onHint(p) {
    if (!this._enter(p)) return;
    this._lean = false;
    if (p.none) {
      this._brow('surprised');
      this._say(LINES.noClue, { ms: LINE_MS + 2000 });
      return;
    }
    if (p.text) {
      this._say(text(p.text), { kind: 'hint', kicker: CLUE_KICKER[p.level] || 'Clue', level: p.level || 1, ms: HINT_LINE_MS });
      this._eureka();
    }
    this._offerHint(p.last ? 'Give me a clue' : 'More help');
  }

  async _onGoal(p) {
    if (!this._enter(p)) return;
    this._goalSeen.add(p.questionId);
    this._chip = null;
    this._lean = false;
    if ((p.hintsUsed ?? 0) > 0) this._say(LINES.goalHelped, { ms: 4000 });
    if ((p.hintsUsed ?? 0) === 0) {
      const ran = this._bird?.perform('cheer');   // cheer = three hops
      this._say(LINES.goalClean, { ms: 4000 });
      const b = this._bird?.getBoundingClientRect();
      if (b) burst(b.left + b.width / 2, b.top + b.height * 0.3, { angle: 120, spread: 70, particleCount: 60 });
      if (!(await ran)) this._brow('heart', 2400);
    } else {
      const ran = this._bird?.perform('hop');
      if (!(await ran)) this._brow('heart', 1800);
    }
  }

  _onCard(p) {
    if (!this._enter(p)) return;
    this._bird?.perform('love');
    this._toast = { label: plain(text(p.label)) || 'Formula card' };
    this._later('toast', TOAST_MS, () => { this._toast = null; });
  }

  _onGraded(p) {
    if (!p || !this._active || p.questionId !== this._active.questionId) return;
    if (p.correct) {
      if (!this._goalSeen.has(p.questionId)) this._bird?.perform('hop');
    } else {
      this._brow('surprised');
    }
  }

  _onBeat(p) {
    const cur = p?.current;
    const isMath = cur && String(cur.type || '').startsWith('math-workspace@');
    if (this._active && !(cur && cur.id === this._active.questionId)) this._reset();
    if (isMath) this._greet(cur);
  }

  _reset() {
    Object.values(this._timers).forEach(clearTimeout);
    this._timers = {};
    this._visible = false;
    this.removeAttribute('visible');
    this._active = null;
    this._line = null;
    this._chip = null;
    this._toast = null;
    this._lean = false;
    this._fails.clear();
    this._valid = 0;
    this.removeAttribute('tucked');
  }

  _requestHint() {
    const c = this._chip || (this._active && !this._goalSeen.has(this._active.questionId) ? this._active : null);
    if (!c) return;
    this._lean = false;
    EventBus.emit('math:hint-request', { questionId: c.questionId, partId: c.partId });
  }

  // ---- render ---------------------------------------------------------

  render() {
    const l = this._line;
    return html`
      <div class="dock">
        <div class="talk">
          ${this._toast ? html`
            <div class="card" role="status">
              <div class="kicker">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1l2 4.6 5 .5-3.8 3.3 1.1 4.9L8 11.8 3.7 14.3l1.1-4.9L1 6.1l5-.5z"/></svg>
                New formula card
              </div>
              <div class="label">${this._toast.label}</div>
            </div>
          ` : ''}
          ${l ? html`
            <div class="bubble ${l.kind}" role="status" aria-live="polite" title="Tap to close"
              @click=${() => { this._line = null; }}>
              ${l.kind === 'hint' ? html`
                <span class="kicker">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9zm-2 12h4v1.2a.8.8 0 0 1-.8.8H6.8a.8.8 0 0 1-.8-.8z"/></svg>
                  ${l.kicker}
                  ${l.level <= 3 ? html`<span class="pips" aria-hidden="true">${[1, 2, 3].map((i) => html`<span class="pip ${i <= l.level ? 'on' : ''}"></span>`)}</span>` : ''}
                </span>` : l.kicker ? html`<span class="kicker">${l.kicker}</span>` : ''}${l.parts}
            </div>
          ` : ''}
          ${this._chip ? html`
            <button class="chip" type="button" @click=${this._requestHint}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9zm-2 12h4v1.2a.8.8 0 0 1-.8.8H6.8a.8.8 0 0 1-.8-.8z"/></svg>
              ${this._chip.label}
            </button>
          ` : ''}
        </div>
        <div class="bird ${this._lean ? 'lean' : ''} ${this._chip ? 'askable' : ''}"
          title=${this._chip ? 'Tap Quill for a clue' : ''} @click=${() => this._chip && this._requestHint()}>
          <quill-mascot size="sm" expression="happy" ?idle=${this._visible}></quill-mascot>
          ${this._chip && !this._idea ? html`<span class="ask" aria-hidden="true">?</span>` : ''}
          ${this._idea ? html`
            <div class="idea" aria-hidden="true">
              <div class="glow"></div>
              <svg viewBox="0 0 48 48">
                <g class="rays">
                  <line x1="24" y1="4" x2="24" y2="-6"/>
                  <line x1="38" y1="9" x2="45" y2="2"/>
                  <line x1="10" y1="9" x2="3" y2="2"/>
                  <line x1="43" y1="21" x2="53" y2="21"/>
                  <line x1="5" y1="21" x2="-5" y2="21"/>
                  <line x1="40" y1="33" x2="47" y2="38"/>
                  <line x1="8" y1="33" x2="1" y2="38"/>
                </g>
                <g class="bulb">
                  <path class="glass" d="M24 6a14 14 0 0 0-8.4 25.2c1.3 1 2.1 2.4 2.1 4V37h12.6v-1.8c0-1.6.8-3 2.1-4A14 14 0 0 0 24 6z"/>
                  <path class="wire" d="M21 31v-5.5a3 3 0 0 1 6 0V31M19.5 22.5l1.5 1.5M28.5 22.5L27 24"/>
                  <path class="shine" d="M17 18a8 8 0 0 1 5-6"/>
                  <rect class="cap" x="17.2" y="37" width="13.6" height="4.4" rx="1.6"/>
                  <rect class="cap" x="19" y="41.4" width="10" height="4" rx="2"/>
                </g>
                <path class="dust d1" style="--dx: 18px; --dy: -16px" d="M40 6l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z"/>
                <path class="dust d2" style="--dx: -20px; --dy: -10px" d="M8 12l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z"/>
                <path class="dust d3" style="--dx: 14px; --dy: 10px" d="M44 28l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>
              </svg>
            </div>
          ` : ''}
          ${this._spark ? html`
            <svg class="spark" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z"/>
            </svg>
          ` : ''}
        </div>
      </div>
    `;
  }
}

customElements.define('quill-math-coach', QuillMathCoach);
