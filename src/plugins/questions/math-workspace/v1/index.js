import { LitElement, html, css, nothing } from 'lit';
import { EventBus } from '../../../../core/EventBus.js';
import { ErrorReporter } from '../../../../core/ErrorReporter.js';
import { A11yAnnouncer } from '../../../../core/A11yAnnouncer.js';
import { GamificationMixin } from '../../../../core/mixins/GamificationMixin.js';
import { LookMixin } from '../../../../core/mixins/LookMixin.js';
import '../../../../ui/components/MarkdownRenderer.js';
import '../../../../core/components/FeedbackBanner.js';
import '../../../../core/components/QuestionExplanation.js';
import { loadMathApi } from './lib/mathApi.js';
import { loadMathLive, insertInto } from './lib/field.js';
import { scoreItem } from './lib/scoring.js';
import { keysFor, TOPIC_LABEL, TOPIC_TONE } from './lib/keypad.js';
import { visualFor, visualState } from './lib/visualState.js';
import { rich, loc } from './lib/rich.js';
import { mwBaseStyles } from './lib/styles.js';
import { icStar, icFlame, icCard, icLock, icKeys, icUndo, icRedo, icEraser, icClose } from './lib/icons.js';

const KEY_ICONS = { undo: icUndo, redo: icRedo, clear: icEraser };
/** Wait after a part's goal before asking the shell to grade, so the goal
 *  burst and Quill's cheer land first. */
const AUTO_CHECK_MS = 1400;

/**
 * <math-workspace-v1> - a game-board workspace for multi-step mathematics.
 *
 * Contract: docs/math-workspace/CONTRACTS.md. One item has one or more parts;
 * each part is a "shape" element (shapes/<shape>.js, lazily imported) that
 * edits its own slice of the response and reports through a bridge object.
 * This element owns the response, scoring, the math:* EventBus events, the
 * rewards HUD (XP, combo, stars, formula cards), the topic keypad and the
 * per-part visual (visuals/<kind>.js, workstream C).
 *
 * Modes: assess (sober: no live ticks, chips, hints, XP, events), practice
 * (live checking on Enter/blur), coach (practice + move chips and hints
 * open by default).
 *
 * No mascot code here (ui-ux-design-system.md 1.1.2): Quill reacts to the
 * math:* events in his own host. On connect the plugin says math:hello; a
 * coach that is listening answers math:coach-here, and from then on the
 * shapes leave the inline hint bubble to Quill (he says every hint).
 *
 * Solved means checked: when every part reaches its goal (practice and coach
 * modes), the plugin emits question:request-check and the lesson shell runs
 * its own Check, so no extra button press is needed.
 */

const SHAPES = ['expression', 'step-chain', 'two-sided', 'solution-set', 'interval', 'slots'];
const CARD_KEY = 'mw-cards';

function readCards() {
  try { return new Set(JSON.parse(localStorage.getItem(CARD_KEY) || '[]')); } catch { return new Set(); }
}
function writeCards(set) {
  try { localStorage.setItem(CARD_KEY, JSON.stringify([...set])); } catch { /* private mode */ }
}

function clone(o) {
  try { return JSON.parse(JSON.stringify(o ?? {})); } catch { return {}; }
}

export class MathWorkspacePlugin extends LookMixin(GamificationMixin(LitElement)) {
  static properties = {
    _data: { state: true },
    _result: { state: true },
    _isRevealed: { state: true },
    _ready: { state: true },
    _tick: { state: true },
  };

  static styles = [mwBaseStyles, css`
    :host { display: block; margin-bottom: 1.5rem; --mw-topic: var(--primary-color); }
    .ws { position: relative; display: flex; flex-direction: column; gap: 16px; }
    /* MathLive's full keyboard is fixed over the bottom of the screen. While
       it is up, the question gets room under it to scroll into, and the small
       keypad steps aside (the full one has every key). */
    :host([vk]) .ws { padding-bottom: var(--mw-vk, 0px); }
    :host([vk]) .keypad, :host([vk]) .keys-off { display: none; }

    /* HUD: topic chip, XP, combo, card tray */
    .hud { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
    .topic {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px 5px 8px;
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--mw-topic) 14%, var(--bg-surface));
      color: color-mix(in srgb, var(--mw-topic) 75%, var(--text-main));
      border: 2px solid color-mix(in srgb, var(--mw-topic) 40%, var(--bg-surface));
      font-family: var(--font-heading); font-weight: var(--fw-strong); font-size: 0.82rem;
    }
    .topic i { width: 12px; height: 12px; border-radius: 4px; background: var(--mw-topic); transform: rotate(45deg); }
    .spacer { flex: 1 1 auto; }
    .xp {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 12px 4px 6px; border-radius: var(--radius-pill);
      background: var(--mw-gold-fill); color: var(--mw-on-fill);
      box-shadow: 0 3px 0 var(--mw-gold-lip);
      font-family: var(--font-heading); font-weight: var(--fw-heavy); font-size: 0.92rem;
      min-width: 64px; justify-content: center;
    }
    .xp svg { width: 20px; height: 20px; }
    .xp.bump { animation: mw-pop 0.4s var(--ease-spring); }
    .combo {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 12px 4px 8px; border-radius: var(--radius-pill);
      background: var(--accent-coral); color: var(--on-accent);
      box-shadow: 0 3px 0 color-mix(in srgb, var(--accent-coral) 60%, var(--text-main));
      font-family: var(--font-heading); font-weight: var(--fw-heavy); font-size: 0.9rem;
      animation: mw-pop 0.45s var(--ease-spring) both;
    }
    .combo svg { width: 18px; height: 18px; }
    .tray { display: inline-flex; align-items: center; gap: 5px; }
    .tcard {
      display: inline-grid; place-items: center;
      width: 30px; height: 38px; border-radius: 7px;
      background: var(--bg-panel-2); color: var(--border-hover);
      border: 2px solid var(--border-color);
      box-shadow: 0 2px 0 var(--border-hover);
      cursor: default; padding: 0;
    }
    .tcard svg { width: 16px; height: 16px; }
    .tcard.on {
      background: var(--mw-gold-fill); color: var(--mw-on-fill);
      border-color: var(--mw-gold-lip); box-shadow: 0 3px 0 var(--mw-gold-lip);
      cursor: pointer;
    }
    .tcard.pop { animation: mw-pop 0.5s var(--ease-spring); }
    .card-peek {
      padding: 10px 14px; border-radius: var(--radius-sm);
      background: color-mix(in srgb, var(--mw-gold-fill) 18%, var(--bg-surface));
      border: 2px solid var(--mw-gold-fill);
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      font-size: 1.05rem;
    }
    .fly-card {
      position: fixed; z-index: 1000; pointer-events: none;
      width: 34px; height: 44px; border-radius: 8px;
      background: var(--mw-gold-fill); border: 2px solid var(--mw-gold-lip);
      box-shadow: 0 4px 0 var(--mw-gold-lip);
      display: grid; place-items: center; color: var(--mw-on-fill);
    }
    .fly-card svg { width: 18px; height: 18px; }

    .stem { font-size: 1.15rem; font-weight: var(--fw-medium); line-height: 1.4; color: var(--text-main); }

    .part { display: flex; flex-direction: column; gap: 10px; }
    .part-head { display: flex; align-items: center; gap: 10px; }
    .part-num {
      display: inline-grid; place-items: center; width: 30px; height: 30px; flex: none;
      border-radius: 10px; background: var(--mw-topic); color: var(--on-accent);
      font-family: var(--font-heading); font-weight: var(--fw-heavy);
      box-shadow: 0 3px 0 color-mix(in srgb, var(--mw-topic) 60%, var(--text-main));
    }
    .part-label { font-weight: var(--fw-strong); color: var(--text-soft); }
    .part-stars { display: inline-flex; gap: 2px; }
    .part-stars svg { width: 20px; height: 20px; color: var(--bg-panel-2); }
    .part-stars .on svg { color: var(--mw-gold-fill); }
    .part-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
    .part-body.with-visual { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); }
    .part-body.with-visual.wide { grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr); }
    .visual-card {
      position: sticky; top: 12px;
      padding: 10px; border-radius: var(--radius-lg);
      background: var(--bg-surface); border: 3px solid var(--border-color);
      box-shadow: var(--press-1) var(--border-hover);
      min-height: 160px;
    }
    .visual-host { width: 100%; }
    .visual-fail { color: var(--text-muted); font-size: 0.85rem; padding: 20px; text-align: center; }
    .skeleton {
      height: 120px; border-radius: var(--radius-lg);
      background: var(--mw-board-bg);
      background-image: radial-gradient(var(--mw-board-dot) 1.6px, transparent 1.7px);
      background-size: 22px 22px;
      display: grid; place-items: center; color: var(--text-muted); font-weight: var(--fw-strong);
    }
    .shape-host { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .shape-error { padding: 14px; border-radius: var(--radius-md); background: var(--warn-bg); color: var(--text-main); }

    /* Topic keypad: flat chip keys with a lip */
    /* Docked like a phone keyboard: when the working above it grows past the
       screen, the keypad stays pinned just above the lesson's sticky footer. */
    .keypad {
      position: sticky;
      bottom: calc(var(--lesson-chrome-bottom, 0px) + 8px);
      z-index: 5;
      box-shadow: var(--shadow-lg);
      scroll-margin-bottom: 128px;
      padding: 10px; border-radius: var(--radius-lg);
      background: var(--bg-panel); border: 2px solid var(--border-color);
      display: flex; flex-direction: column; gap: 8px;
      animation: mw-slide-in 0.25s var(--ease-settle) both;
    }
    .keyrow { display: flex; flex-wrap: wrap; gap: 6px; }
    .key {
      min-width: 44px; min-height: 42px; padding: 6px 10px;
      border-radius: 12px; border: 2px solid var(--border-hover);
      background: var(--bg-surface); color: var(--text-main);
      font-family: var(--font-heading); font-weight: var(--fw-strong); font-size: 1rem;
      box-shadow: 0 3px 0 var(--border-hover);
      cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    .key:active { transform: translateY(3px); box-shadow: none; }
    .key:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
    .key.topic {
      background: color-mix(in srgb, var(--mw-topic) 16%, var(--bg-surface));
      border-color: color-mix(in srgb, var(--mw-topic) 55%, var(--bg-surface));
      box-shadow: 0 3px 0 color-mix(in srgb, var(--mw-topic) 55%, var(--bg-surface));
      color: var(--text-main);
    }
    .key.nav { background: var(--bg-panel-2); color: var(--text-muted); }
    .key.full { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; font-size: 0.82rem; }
    .key.full svg { width: 20px; height: 20px; }
    .key.ico { display: inline-grid; place-items: center; }
    .key.ico svg { width: 20px; height: 20px; }
    .keypad-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
    .navkeys { display: inline-flex; flex-wrap: wrap; gap: 6px; }
    .navkeys .key { min-height: 34px; min-width: 38px; padding: 2px 8px; font-size: 0.85rem; box-shadow: 0 2px 0 var(--border-hover); }
    .keypad-title { font-family: var(--font-heading); font-weight: var(--fw-heavy); font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
    .keypad-head { padding-right: 42px; }
    .kp-close {
      position: absolute; top: 8px; right: 8px;
      width: 34px; height: 34px; border-radius: 50%; padding: 0; flex: none;
      display: grid; place-items: center; cursor: pointer;
      border: 2px solid var(--border-color); background: var(--bg-surface); color: var(--text-muted);
      box-shadow: 0 2px 0 var(--border-color);
    }
    .kp-close:hover { color: var(--text-main); border-color: var(--border-hover); }
    .kp-close:active { transform: translateY(2px); box-shadow: none; }
    .kp-close:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
    .kp-close svg { width: 18px; height: 18px; }
    .keys-off { display: flex; }
    .keys-off .chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; min-height: 32px; border-radius: var(--radius-pill);
      border: 2px solid var(--border-hover); background: var(--bg-surface); color: var(--text-muted); font-weight: var(--fw-strong); font-size: 0.82rem;
      box-shadow: 0 2px 0 var(--border-hover); cursor: pointer; }
    .keys-off .chip svg { width: 18px; height: 18px; }

    .result { display: flex; flex-direction: column; gap: 10px; }
    .fallback-note { font-size: 0.75rem; color: var(--text-muted); }

    @media (max-width: 760px) {
      .part-body.with-visual { grid-template-columns: minmax(0, 1fr); }
      .part-body.with-visual .visual-card { position: static; }
    }
    @media (max-width: 420px) {
      .key { min-width: 38px; min-height: 40px; padding: 4px 7px; font-size: 0.92rem; }
      .stem { font-size: 1.05rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      .xp.bump, .combo, .tcard.pop, .keypad { animation: none; }
    }
  `];

  constructor() {
    super();
    this._data = null;
    this._ctx = null;
    this._resp = { parts: {} };
    this._result = null;
    this._isRevealed = false;
    this._ready = false;
    this._tick = 0;
    this._shapeEls = {};
    this._shapeFailed = {};
    this._bridges = {};
    this._partInfo = {};
    this._visuals = {};
    this._xp = 0;
    this._combo = 0;
    this._focusPart = null;
    this._focusField = null;
    this._cards = readCards();
    this._peekCard = null;
    this._pendingState = null;
    this._coached = false;
    this._keysHidden = false;
  }

  get mode() {
    const m = this._data?.mode;
    return m === 'assess' || m === 'coach' ? m : 'practice';
  }
  get live() { return this.mode !== 'assess' && !this._isRevealed; }

  /* ------------------------------------------------------- lifecycle */

  init(data, prng, ctx) {
    this._data = data;
    const isPrng = prng && typeof prng.shuffle === 'function';
    this._ctx = isPrng ? (ctx || null) : (prng || null);
    this._resp = { parts: {} };
    if (this._ctx?.previewOnly) { this._ready = true; return Promise.resolve(); }
    const shapes = [...new Set((data?.parts || []).map((p) => p.shape))];
    const work = [
      loadMathApi(),
      loadMathLive(),
      ...shapes.map((s) => this._loadShape(s)),
    ];
    return Promise.all(work).then(() => { this._ready = true; this.requestUpdate(); }).catch((err) => {
      ErrorReporter.reportError(err, { component: 'math-workspace@1', phase: 'init' });
      this._ready = true;
    });
  }

  _loadShape(shape) {
    if (!SHAPES.includes(shape)) {
      this._shapeFailed[shape] = `Unknown shape "${shape}"`;
      return Promise.resolve();
    }
    return import(`./shapes/${shape}.js`).catch((err) => {
      this._shapeFailed[shape] = String(err?.message || err);
      ErrorReporter.reportError(err, { component: 'math-workspace@1', shape });
    });
  }

  connectedCallback() {
    super.connectedCallback();
    this._onCardsKey = (e) => { if (e.key === CARD_KEY) { this._cards = readCards(); this.requestUpdate(); } };
    window.addEventListener('storage', this._onCardsKey);
    // Quill's hint chip (CONTRACTS change log, D): open the next hint level
    // on the matching part exactly as the plugin's own Hint button does.
    this._onHintRequest = (p) => {
      if (!this.live || !p || p.questionId !== this._data?.id) return;
      const order = [p.partId, this._focusPart, ...(this._data?.parts || []).map((x) => x.id)].filter(Boolean);
      for (const pid of order) {
        if (this._shapeEls[pid]?.requestHint?.()) return;
      }
      this._emit('math:hint', p.partId || this._focusPart || null, { level: 0, text: null, none: true });
    };
    EventBus.on('math:hint-request', this._onHintRequest);
    this._onCoachHere = (p) => {
      if (this._coached || this.mode === 'assess' || (p?.questionId && p.questionId !== this._data?.id)) return;
      this._coached = true;
      for (const el of Object.values(this._shapeEls)) el.coached = true;
      this.requestUpdate();
    };
    EventBus.on('math:coach-here', this._onCoachHere);
    this._onKey = (e) => {
      if (e.key !== 'Escape' || this._keysHidden || !this._focusPart) return;
      this._hideKeys();
    };
    this.addEventListener('keydown', this._onKey);
    if (this._data && !this._ctx?.previewOnly) this._emit('math:hello', null, {});
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('storage', this._onCardsKey);
    EventBus.off('math:hint-request', this._onHintRequest);
    EventBus.off('math:coach-here', this._onCoachHere);
    this.removeEventListener('keydown', this._onKey);
    clearTimeout(this._autoCheckTimer);
    for (const v of Object.values(this._visuals)) { try { v.handle?.destroy?.(); } catch { /* ignore */ } }
    this._visuals = {};
    try { window.mathVirtualKeyboard?.hide(); } catch { /* ignore */ }
    try { window.mathVirtualKeyboard?.removeEventListener('geometrychange', this._onVk); } catch { /* ignore */ }
  }

  getState() { return clone(this._resp); }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    this._resp = { parts: clone(s.parts || {}) };
    this._pendingState = this._resp;
    this.requestUpdate();
  }

  getResponse() { return clone(this._resp); }

  isAnswered() { return this._isRevealed; }

  static async score(itemData, response) {
    if (!itemData) return { score: 0, isCorrect: false };
    await loadMathApi();
    const r = scoreItem(itemData, response);
    return { score: r.score, isCorrect: r.isCorrect, feedback: r.feedback };
  }

  async evaluate() {
    if (!this._data) return { score: 0, isCorrect: false };
    await loadMathApi();
    let r;
    try {
      r = scoreItem(this._data, this._resp);
    } catch (err) {
      ErrorReporter.reportError(err, { component: 'math-workspace@1', phase: 'evaluate' });
      r = { score: 0, isCorrect: false, feedback: 'This answer could not be checked.', parts: {} };
    }
    this._isRevealed = true;
    this._result = r;
    for (const p of this._data.parts || []) {
      const el = this._shapeEls[p.id];
      if (!el) continue;
      if (this.mode === 'assess') el.showGraded?.(r.parts?.[p.id]);
      else el.lock?.();
      this._partInfo[p.id] = { ...(this._partInfo[p.id] || {}), status: (r.parts?.[p.id]?.score ?? 0) >= 0.999 ? 'correct' : 'wrong' };
      this._updateVisual(p);
    }
    this._focusPart = null;
    try { A11yAnnouncer.announce?.(r.isCorrect ? 'Correct.' : r.feedback); } catch { /* ignore */ }
    this.requestUpdate();
    return { score: r.score, isCorrect: r.isCorrect, feedback: r.feedback };
  }

  getHint(level = 1) {
    for (const p of this._data?.parts || []) {
      const h = (p.hints || [])[Math.max(0, level - 1)] || (p.hints || [])[0];
      if (h?.strategy) return loc(h.strategy);
    }
    return '';
  }

  reset(_seed) {
    this._resp = { parts: {} };
    this._result = null;
    this._isRevealed = false;
    this._xp = 0;
    this._combo = 0;
    this._partInfo = {};
    clearTimeout(this._autoCheckTimer);
    for (const el of Object.values(this._shapeEls)) el.resetPart?.();
    for (const p of this._data?.parts || []) this._updateVisual(p);
    this.requestUpdate();
  }

  /* --------------------------------------------------------- events */

  _emit(name, partId, payload = {}) {
    if (this.mode === 'assess') return;
    const shape = (this._data?.parts || []).find((p) => p.id === partId)?.shape;
    const base = { questionId: this._data?.id ?? null, partId, mode: this.mode, ...(shape ? { shape } : {}) };
    if (this._ctx?.lessonId) base.lessonId = this._ctx.lessonId;
    try { EventBus.emit(name, { ...base, ...payload }); } catch (err) { ErrorReporter.reportError(err, { component: 'math-workspace@1', event: name }); }
    // A wrong step's note must not hide under the docked keypad.
    if (name === 'math:step-checked' && payload.valid === false && partId) {
      const el = this._shapeEls[partId];
      el?.updateComplete?.then(() => requestAnimationFrame(() => el.revealFeedback?.()));
    }
  }

  _bridgeFor(part) {
    if (this._bridges[part.id]) return this._bridges[part.id];
    const pid = part.id;
    const b = {
      change: (pr, { status } = {}) => {
        this._resp.parts[pid] = pr;
        this._partInfo[pid] = { ...(this._partInfo[pid] || {}), status };
        this._updateVisual(part);
        EventBus.emit('interaction:question', { questionId: this._data?.id, state: this.getState() });
      },
      event: (name, payload) => this._emit(name, pid, payload),
      validStep: (anchor, info, shapeEl) => {
        if (!this.live) return;
        this._xp += 2;
        this._combo += 1;
        this._partInfo[pid] = { ...(this._partInfo[pid] || {}), validSteps: (this._partInfo[pid]?.validSteps || 0) + 1 };
        if (this.gamified) shapeEl?.spawnXp?.(anchor, '+2 XP');
        this._bumpXp = true;
        this._updateVisual(part);
        this.requestUpdate();
      },
      brokeStep: () => { this._combo = 0; this.requestUpdate(); },
      hint: (level, text, { last = false } = {}) => {
        this._combo = 0;
        this._emit('math:hint', pid, { level, text: text || null, last });
        this.requestUpdate();
      },
      goal: ({ stars, hintsUsed, steps }) => {
        this._partInfo[pid] = { ...(this._partInfo[pid] || {}), stars, done: true, status: 'correct' };
        this._xp += 5 + stars * 2;
        this._bumpXp = true;
        this._emit('math:goal', pid, { stars, hintsUsed, steps });
        try { A11yAnnouncer.announce?.(this.gamified ? `Part done. ${stars} of 3 stars.` : 'Part done.'); } catch { /* ignore */ }
        this._updateVisual(part);
        this.requestUpdate();
        this._maybeAutoCheck();
      },
      cardUsed: (cardId, fromEl) => this._useCard(cardId, fromEl, pid),
      focusField: (mf) => {
        const changed = this._focusField !== mf;
        this._focusField = mf;
        if (this._focusPart !== pid || changed) {
          // 'nearest' scrolling only moves the page when the keypad or the
          // field is actually hidden, so this is calm on every focus.
          this._focusPart = pid;
          this._revealKeypad = this._keysHidden ? null : mf;
          this.requestUpdate();
        }
        this._watchVk();
        if (this._vkH) requestAnimationFrame(() => this._liftAboveVk());
      },
    };
    this._bridges[pid] = b;
    return b;
  }

  /** Every part solved: ask the lesson shell to run its Check. */
  _maybeAutoCheck() {
    if (!this.live) return;
    const parts = this._data?.parts || [];
    if (!parts.length || !parts.every((p) => this._partInfo[p.id]?.done)) return;
    clearTimeout(this._autoCheckTimer);
    this._autoCheckTimer = setTimeout(() => {
      if (!this.isConnected || !this.live) return;
      try { EventBus.emit('question:request-check', { questionId: this._data?.id ?? null }); } catch { /* ignore */ }
    }, AUTO_CHECK_MS);
  }

  _hideKeys() {
    this._keysHidden = true;
    try { window.mathVirtualKeyboard?.hide(); } catch { /* ignore */ }
    this.requestUpdate();
  }

  _showKeys() {
    this._keysHidden = false;
    this._revealKeypad = this._focusField;
    this.requestUpdate();
    try { this._focusField?.focus(); } catch { /* ignore */ }
  }

  /* --------------------------------------------------- formula cards */

  _useCard(cardId, fromEl, pid) {
    if (!this.live) return;
    const card = (this._data?.cards || []).find((c) => c.id === cardId);
    if (!card) return;
    const first = !this._cards.has(cardId);
    if (first) {
      this._cards.add(cardId);
      writeCards(this._cards);
      this._emit('math:card-unlocked', pid, { cardId, label: loc(card.label) });
    }
    this.requestUpdate();
    this.updateComplete.then(() => this._flyCard(cardId, fromEl));
  }

  _flyCard(cardId, fromEl) {
    const slot = this.shadowRoot?.querySelector(`.tcard[data-card="${cardId}"]`);
    if (!slot) return;
    const pop = () => { slot.classList.remove('pop'); void slot.offsetWidth; slot.classList.add('pop'); };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fromEl || reduced || !fromEl.getBoundingClientRect) { pop(); return; }
    const a = fromEl.getBoundingClientRect();
    const b = slot.getBoundingClientRect();
    const fly = document.createElement('div');
    fly.className = 'fly-card';
    fly.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3" fill="currentColor"/></svg>';
    this.shadowRoot.appendChild(fly);
    const x0 = a.left + a.width / 2 - 17;
    const y0 = a.top + a.height / 2 - 22;
    const x1 = b.left + b.width / 2 - 17;
    const y1 = b.top + b.height / 2 - 22;
    const mx = (x0 + x1) / 2;
    const my = Math.min(y0, y1) - 80;
    const anim = fly.animate([
      { transform: `translate(${x0}px, ${y0}px) rotate(0deg) scale(0.6)` },
      { transform: `translate(${mx}px, ${my}px) rotate(-14deg) scale(1.3)`, offset: 0.5 },
      { transform: `translate(${x1}px, ${y1}px) rotate(0deg) scale(0.9)` },
    ], { duration: 750, easing: 'cubic-bezier(.5,0,.3,1)' });
    fly.style.left = '0px';
    fly.style.top = '0px';
    anim.onfinish = () => { fly.remove(); pop(); };
  }

  /* --------------------------------------------------------- visuals */

  _updateVisual(part) {
    const v = this._visuals[part.id];
    if (!v?.handle) return;
    try {
      const info = this._partInfo[part.id] || {};
      const st = visualState(this._data, part, v.spec, this._resp.parts[part.id] || {}, info.status || 'idle', { validSteps: info.validSteps || 0 });
      // Answer-leak rule (CONTRACTS, WS C note): visuals draw what they are
      // given, so the expected answer is withheld until the part is solved
      // or revealed. Sequence terms are already in the stem, so they stay.
      const revealed = this._isRevealed || info.status === 'correct';
      if (!revealed && v.spec.kind !== 'sequence') st.expected = {};
      v.handle.update(st);
    } catch (err) {
      ErrorReporter.reportError(err, { component: 'math-workspace@1', visual: v.spec?.kind });
    }
  }

  /** Assess: no visual until reveal. Pascal shows nCr itself, so it waits
   *  until the part is correct or revealed. */
  _visualSpec(part) {
    const spec = visualFor(this._data, part);
    if (!spec) return null;
    if (this.mode === 'assess' && !this._isRevealed) return null;
    if (spec.kind === 'pascal' && !this._isRevealed && this._partInfo[part.id]?.status !== 'correct') return null;
    return spec;
  }

  _mountVisuals() {
    for (const part of this._data?.parts || []) {
      const spec = this._visualSpec(part);
      if (!spec || this._visuals[part.id]) continue;
      const host = this.shadowRoot?.getElementById(`vis-${part.id}`);
      if (!host) continue;
      this._visuals[part.id] = { spec, handle: null };
      import(`./visuals/${spec.kind}.js`).then((m) => {
        if (!this.isConnected) return;
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        this._visuals[part.id].handle = m.mount(host, spec.params || {}, { reducedMotion, look: this.look });
        this._updateVisual(part);
      }).catch((err) => {
        this._visuals[part.id].failed = true;
        host.innerHTML = '';
        const d = document.createElement('div');
        d.className = 'visual-fail';
        d.textContent = 'The picture for this part could not load.';
        host.appendChild(d);
        ErrorReporter.reportError(err, { component: 'math-workspace@1', visual: spec.kind });
      });
    }
  }

  /* ---------------------------------------------------------- render */

  _shapeEl(part) {
    let el = this._shapeEls[part.id];
    if (!el) {
      if (this._shapeFailed[part.shape] || !customElements.get(`mw-shape-${part.shape}`)) return null;
      el = document.createElement(`mw-shape-${part.shape}`);
      el.dataset.part = part.id;
      this._shapeEls[part.id] = el;
      el.item = this._data;
      el.part = part;
      el.bridge = this._bridgeFor(part);
      const saved = this._resp.parts[part.id];
      if (saved) el.setPartResponse?.(saved);
    }
    el.mode = this.mode;
    el.coached = this._coached;
    return el;
  }

  updated(changed) {
    super.updated?.(changed);
    if (this._pendingState) {
      const s = this._pendingState;
      this._pendingState = null;
      for (const p of this._data?.parts || []) {
        const el = this._shapeEls[p.id];
        if (el && s.parts?.[p.id]) el.setPartResponse?.(s.parts[p.id]);
      }
    }
    if (this._ready) this._mountVisuals();
    if (this._revealKeypad) {
      // The keypad appears under the part: bring it (and so the field above
      // it) clear of the lesson's sticky action bar.
      this._revealKeypad = null;
      const kp = this.shadowRoot?.querySelector('.keypad');
      const field = this._focusField;
      if (kp && field) {
        requestAnimationFrame(() => {
          try {
            // The keypad is docked above the footer, so the field being typed
            // in must sit above the keypad: scroll just enough, and never
            // past the top under the app bar.
            const r = field.getBoundingClientRect();
            const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lesson-chrome-bottom')) || 0;
            const limit = window.innerHeight - chrome - kp.offsetHeight - 20;
            if (r.bottom > limit) window.scrollBy({ top: Math.min(r.bottom - limit, r.top - 110) });
            else if (r.top < 96) window.scrollBy({ top: r.top - 110 });
          } catch { /* ignore */ }
        });
      }
    }
    // The docked keypad's height, so notes scroll clear of it (--mw-dock is
    // read by the shapes' scroll-margin, through the shadow boundary).
    const kp = this.shadowRoot?.querySelector('.keypad');
    const dock = kp ? kp.offsetHeight + 12 : 0;
    if (dock !== this._dockH) { this._dockH = dock; this.style.setProperty('--mw-dock', `${dock}px`); }
    if (this._bumpXp) {
      this._bumpXp = false;
      const x = this.shadowRoot?.querySelector('.xp');
      if (x) { x.classList.remove('bump'); void x.offsetWidth; x.classList.add('bump'); }
    }
  }

  render() {
    const d = this._data;
    if (!d) return html``;
    const stem = loc(d.stem);
    if (this._ctx?.previewOnly) {
      return html`<div class="stem">${stem ? html`<markdown-renderer .content=${stem}></markdown-renderer>` : ''}</div>`;
    }
    const tone = TOPIC_TONE[d.topic] || 'var(--primary-color)';
    const parts = Array.isArray(d.parts) ? d.parts : [];
    return html`
      <div class="ws" style="--mw-topic:${tone}">
        ${this._hud()}
        ${this._peekCard ? this._cardPeek() : nothing}
        ${stem ? html`<div class="stem"><markdown-renderer .content=${stem}></markdown-renderer></div>` : nothing}
        ${parts.map((p, i) => this._part(p, i, parts.length))}
        ${this._resultTpl()}
      </div>`;
  }

  _hud() {
    const d = this._data;
    const sober = this.mode === 'assess';
    const cards = d.cards || [];
    return html`
      <div class="hud">
        ${d.topic ? html`<span class="topic"><i></i>${TOPIC_LABEL[d.topic] || d.topic}</span>` : nothing}
        <span class="spacer"></span>
        ${!sober && this.gamified && this._combo >= 2 ? html`<span class="combo" aria-live="polite">${icFlame}${this._combo} in a row</span>` : nothing}
        ${!sober && cards.length ? html`
          <span class="tray" aria-label="Formula cards">
            ${cards.map((c) => {
              const on = this._cards.has(c.id);
              return html`<button class="tcard ${on ? 'on' : ''}" data-card="${c.id}"
                title="${on ? loc(c.label) : 'Locked formula card'}" aria-label="${on ? `Formula card: ${loc(c.label)}` : 'Locked formula card'}"
                @click=${() => { if (on) { this._peekCard = this._peekCard === c.id ? null : c.id; this.requestUpdate(); } }}>${on ? icCard : icLock}</button>`;
            })}
          </span>` : nothing}
        ${!sober && this.gamified ? html`<span class="xp" aria-label="${this._xp} XP">${icStar}${this._xp} XP</span>` : nothing}
      </div>`;
  }

  _cardPeek() {
    const c = (this._data.cards || []).find((x) => x.id === this._peekCard);
    if (!c) return nothing;
    if (this._peekKey !== c.id) {
      this._peekKey = c.id;
      this._peekEl = document.createElement('math-span');
      this._peekEl.textContent = c.latex || '';
    }
    return html`<div class="card-peek slide-in">${icCard}<strong>${loc(c.label)}</strong>${c.latex ? this._peekEl : nothing}</div>`;
  }

  _part(p, i, n) {
    const el = this._ready ? this._shapeEl(p) : null;
    const spec = this._visualSpec(p);
    const info = this._partInfo[p.id] || {};
    const label = loc(p.label);
    const showHead = n > 1 || label;
    const failed = this._shapeFailed[p.shape];
    return html`
      <section class="part" data-part="${p.id}">
        ${showHead ? html`
          <header class="part-head">
            ${n > 1 ? html`<span class="part-num">${i + 1}</span>` : nothing}
            ${label ? html`<span class="part-label">${rich(p.label, `pl-${p.id}`)}</span>` : nothing}
            <span class="spacer"></span>
            ${info.done && this.mode !== 'assess' && this.gamified ? html`<span class="part-stars" aria-label="${info.stars} of 3 stars">${[1, 2, 3].map((k) => html`<span class="${k <= info.stars ? 'on' : ''}">${icStar}</span>`)}</span>` : nothing}
          </header>` : nothing}
        <div class="part-body ${spec ? 'with-visual' : ''} ${p.shape === 'two-sided' ? 'wide' : ''}">
          <div class="shape-host">
            ${failed ? html`<div class="shape-error">This part could not load. (${failed})</div>`
              : el || html`<div class="skeleton">Setting up the board...</div>`}
            ${this._focusPart === p.id && !this._isRevealed ? (this._keysHidden ? this._keysChip() : this._keypad()) : nothing}
          </div>
          ${spec ? html`<div class="visual-card"><div class="visual-host" id="vis-${p.id}"></div></div>` : nothing}
        </div>
      </section>`;
  }

  _keyFace(tex) {
    this._keyFaces = this._keyFaces || new Map();
    if (!this._keyFaces.has(tex)) {
      const el = document.createElement('math-span');
      el.textContent = tex;
      this._keyFaces.set(tex, el);
    }
    return this._keyFaces.get(tex);
  }

  _keypad() {
    const { topic, common } = keysFor(this._data.topic);
    const face = (k) => (k.icon ? KEY_ICONS[k.icon] : k.tex ? this._keyFace(k.tex) : k.face);
    const key = (k) => html`<button class="key ${k.tone} ${k.icon ? 'ico' : ''}" title="${k.title}" aria-label="${k.title}"
      @pointerdown=${(e) => e.preventDefault()}
      @click=${() => insertInto(this._focusField, k.insert)}>${face(k)}</button>`;
    const nav = common.filter((k) => k.tone === 'nav');
    return html`
      <div class="keypad" role="group" aria-label="Maths keys">
        <div class="keypad-head">
          <span class="keypad-title">Maths keys</span>
          <span class="navkeys">${nav.map(key)}</span>
          <span class="spacer"></span>
          <button class="key nav full" title="Full keyboard" aria-label="Show or hide the full maths keyboard"
            @pointerdown=${(e) => e.preventDefault()}
            @click=${() => this._toggleFullKeyboard()}>${icKeys}<span>More keys</span></button>
          <button class="kp-close" title="Close the keys (Esc)" aria-label="Close the maths keys"
            @pointerdown=${(e) => e.preventDefault()}
            @click=${() => this._hideKeys()}>${icClose}</button>
        </div>
        <div class="keyrow">${topic.map(key)}</div>
        <div class="keyrow">${common.filter((k) => k.tone !== 'nav').map(key)}</div>
      </div>`;
  }

  _toggleFullKeyboard() {
    try {
      const vk = window.mathVirtualKeyboard;
      this._watchVk();
      if (vk?.visible) { vk.hide(); return; }
      this._focusField?.focus?.();
      vk?.show();
    } catch { /* ignore */ }
  }

  /** Follow MathLive's full keyboard: it is fixed over the bottom of the
   *  screen, so the field being typed in has to move up out from under it. */
  _watchVk() {
    const vk = window.mathVirtualKeyboard;
    if (!vk || this._onVk) return;
    themeFullKeyboard();
    this._onVk = () => {
      const h = vk.visible ? Math.round(vk.boundingRect?.height || 0) : 0;
      if (h === this._vkH) return;
      this._vkH = h;
      this.style.setProperty('--mw-vk', `${h + 24}px`);
      this.toggleAttribute('vk', h > 0);
      if (h) requestAnimationFrame(() => requestAnimationFrame(() => this._liftAboveVk()));
    };
    vk.addEventListener('geometrychange', this._onVk);
    this._onVk();
  }

  _liftAboveVk() {
    const vk = window.mathVirtualKeyboard;
    const f = this._focusField;
    if (!vk?.visible || !f?.isConnected) return;
    const top = vk.boundingRect?.top || (window.innerHeight - this._vkH);
    const r = f.getBoundingClientRect();
    const limit = top - 20;
    if (r.bottom > limit) window.scrollBy({ top: Math.min(r.bottom - limit, r.top - 110), behavior: 'smooth' });
  }

  _keysChip() {
    return html`<div class="keys-off"><button class="chip sm" @pointerdown=${(e) => e.preventDefault()} @click=${() => this._showKeys()}>${icKeys}<span>Show maths keys</span></button></div>`;
  }

  _resultTpl() {
    const r = this._isRevealed ? this._result : null;
    if (!r) return nothing;
    return html`
      <div class="result">
        <feedback-banner .type=${r.isCorrect ? 'correct' : (r.score > 0 ? 'partial' : 'incorrect')} .message=${r.feedback || ''}></feedback-banner>
        <question-explanation .explanation=${this._data.explanation} .explanationSlide=${this._data.explanationSlide}
          .bundleId=${this._ctx?.bundleId} ?revealed=${true}></question-explanation>
      </div>`;
  }
}

/**
 * MathLive's full keyboard lives in document.body, outside every shadow root,
 * and is styled only through its own --keyboard-* and --keycap-* variables.
 * Point them at the theme tokens (once per page) so it matches the keypad
 * instead of arriving as a grey slab. Token references only (invariant 9).
 */
function themeFullKeyboard() {
  if (document.getElementById('mw-vk-theme')) return;
  const st = document.createElement('style');
  st.id = 'mw-vk-theme';
  st.textContent = `
    .ML__keyboard {
      --keyboard-background: var(--bg-sunken);
      --keyboard-border: var(--border-color);
      --keyboard-horizontal-rule: 1px solid var(--border-color);
      --keyboard-accent-color: var(--primary-color);
      --keyboard-toolbar-text: var(--text-muted);
      --keyboard-toolbar-background: transparent;
      --keyboard-toolbar-background-hover: var(--bg-surface);
      --keyboard-toolbar-background-selected: var(--bg-surface);
      --keycap-background: var(--bg-surface);
      --keycap-background-hover: color-mix(in srgb, var(--primary-color) 12%, var(--bg-surface));
      --keycap-background-active: var(--primary-color);
      --keycap-background-pressed: var(--primary-color);
      --keycap-text: var(--text-main);
      --keycap-text-active: var(--on-primary);
      --keycap-text-pressed: var(--on-primary);
      --keycap-text-hover: var(--text-main);
      --keycap-border: var(--border-color);
      --keycap-border-bottom: var(--border-color);
      --keycap-secondary-background: color-mix(in srgb, var(--primary-color) 18%, var(--bg-surface));
      --keycap-secondary-background-hover: color-mix(in srgb, var(--primary-color) 28%, var(--bg-surface));
      --keycap-secondary-text: var(--text-main);
      --keycap-secondary-border: var(--border-color);
      --keycap-secondary-border-bottom: var(--border-color);
      --keycap-primary-background: var(--primary-color);
      --keycap-primary-background-hover: var(--primary-hover);
      --keycap-primary-text: var(--on-primary);
      --keycap-shift-color: var(--primary-color);
    }
    .ML__keyboard .MLK__backdrop { border-top: 2px solid var(--border-color); box-shadow: var(--shadow-lg); }
    .ML__keyboard .MLK__keycap { border-radius: 10px; border-bottom-width: 3px; }
  `;
  document.head.appendChild(st);
}

customElements.define('math-workspace-v1', MathWorkspacePlugin);
