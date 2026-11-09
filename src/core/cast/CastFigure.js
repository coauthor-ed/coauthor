import { moodFor } from './castData.js';
import { BUBBLE_BOX, BUBBLE_NAME } from './bubbleStyle.js';

/**
 * A story cast character as an element (src/core/cast/CourseCast.js defines
 * one tag per character of the open course, e.g. <cast-flame-and-seed-kabir>).
 *
 * It stands where the look's companion would (the companion slot, while the
 * course is open) and as the portrait of a SAY bubble. It shows the pose
 * image for its mood: the `mood` attribute, else the expression the look's
 * reactor asked for (setExpression(), `expression`), else `default`; an
 * unknown mood falls back to `default` (castData.js moodFor()).
 *
 * It answers the calls a look's reactor makes on a companion (setExpression,
 * perform, act, speak, hide, show, celebrate), so a cue never throws; it
 * answers them simply: a pose and a small hop.
 *
 * Attributes: mood, expression, size (mini | sm | lg), framing ("portrait":
 * crop to the face area, for a round frame).
 */

const _characters = new Map(); // tag -> resolved character (poses are URLs)

/** Binds a tag to the character it stands for (any cast element). */
export function bindCharacter(tag, character) {
  _characters.set(String(tag).toLowerCase(), character);
}

/** The resolved character a cast tag stands for (null when unknown). */
export function characterOf(tag) {
  return _characters.get(String(tag || '').toLowerCase()) || null;
}

const sheet = (text) => {
  const s = new CSSStyleSheet();
  s.replaceSync(text);
  return s;
};

const FIGURE_STYLES = sheet(`
  :host { display: inline-block; position: relative; flex: none; width: 96px; aspect-ratio: 1 / 1; line-height: 0; }
  :host([size="mini"]) { width: 36px; }
  :host([size="sm"]) { width: 72px; }
  :host([size="lg"]) { width: 160px; }
  .fig { display: block; width: 100%; height: 100%; object-fit: contain; object-position: 50% 100%; user-select: none; -webkit-user-drag: none; }
  :host([framing="portrait"]) .fig { object-fit: cover; object-position: 50% 12%; }
  .init { display: none; }
  :host([data-noimg]) .fig { display: none; }
  :host([data-noimg]) .init {
    display: grid; place-items: center; width: 100%; height: 100%; border-radius: 50%;
    background: var(--bg-sunken); color: var(--text-muted);
    font-family: var(--font-heading); font-weight: var(--fw-heavy); font-size: 1.1rem; line-height: 1;
  }
  .line {
    position: absolute; left: 82%; bottom: 72%; z-index: 2;
    width: max-content; max-width: min(240px, 62vw); padding: 7px 12px 8px;
    font-family: var(--font-family); font-weight: var(--fw-strong); font-size: var(--fs-small); line-height: 1.35;
    ${BUBBLE_BOX}
    border-bottom-left-radius: 6px;
    pointer-events: none; opacity: 0; transform: translateY(6px) scale(0.96); transform-origin: 0 100%;
    transition: opacity var(--motion-base, 200ms) ease, transform var(--motion-base, 200ms) ease;
  }
  .line[hidden] { display: none; }
  .line.on { opacity: 1; transform: none; }
  .hop { animation: cast-hop 560ms var(--ease-spring, ease-out); }
  @keyframes cast-hop { 0%, 100% { transform: translateY(0); } 35% { transform: translateY(-10%) scale(1.03); } 70% { transform: translateY(2%) scale(0.99); } }
  @media (prefers-reduced-motion: reduce) { .hop { animation: none; } .line { transition: none; } }
`);

// What the look's acts mean for a pose, briefly. Anything else just hops.
const ACT_MOODS = {
  think: 'think', cheer: 'proud', twirl: 'proud', dance: 'proud', clap: 'proud',
  backflip: 'proud', bow: 'proud', wow: 'oops', shrug: 'oops', snack: 'oops',
};
const ACT_HOLD_MS = 1600;

export class CastFigure extends HTMLElement {
  static observedAttributes = ['mood', 'expression'];

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [FIGURE_STYLES];
    this._img = document.createElement('img');
    this._img.className = 'fig';
    this._img.alt = '';
    this._img.decoding = 'async';
    this._img.draggable = false;
    this._img.addEventListener('error', () => this._onError());
    this._init = document.createElement('span');
    this._init.className = 'init';
    this._line = document.createElement('span');
    this._line.className = 'line';
    this._line.setAttribute('role', 'status');
    this._line.hidden = true;
    root.append(this._img, this._init, this._line);
    this._lineTimer = 0;
    this._expr = null;
    this._act = '';
    this._actMood = null;
    this._actTimer = 0;
  }

  /** The character this tag stands for. */
  get character() {
    return characterOf(this.localName);
  }

  /** The mood on screen now. */
  get mood() {
    return moodFor(this.character, this.getAttribute('mood') || this._actMood || this._expr);
  }

  connectedCallback() { this._paint(); }
  disconnectedCallback() { clearTimeout(this._actTimer); clearTimeout(this._lineTimer); }
  attributeChangedCallback(name, old, value) {
    if (name === 'expression') this._expr = value;
    if (this.isConnected) this._paint();
  }

  get expression() { return this._expr; }
  set expression(v) { this._expr = v || null; this._paint(); }
  setExpression(v) { this.expression = v; }

  get act() { return this._act; }
  set act(v) {
    this._act = v || '';
    if (v) this.perform(v);
  }

  /** A look's act: the pose it suggests for a moment, and a hop. */
  perform(act) {
    clearTimeout(this._actTimer);
    this._actMood = ACT_MOODS[act] || null;
    this._paint();
    this._img.classList.remove('hop');
    void this._img.offsetWidth;
    this._img.classList.add('hop');
    this._actTimer = setTimeout(() => { this._actMood = null; this._paint(); }, ACT_HOLD_MS);
    return Promise.resolve();
  }

  /** Says a short line in a small bubble beside the figure (a mini-game
   *  intro), for `ms`, the cast's bubble look (bubbleStyle.js). */
  speak(line, ms = 3600) {
    clearTimeout(this._lineTimer);
    const text = typeof line === 'string' ? line.trim() : '';
    if (!text) { this.hush(); return; }
    this._line.textContent = text;
    this._line.hidden = false;
    requestAnimationFrame(() => this._line.classList.add('on'));
    this._lineTimer = setTimeout(() => this.hush(), Math.max(800, Number(ms) || 3600));
  }

  hush() {
    clearTimeout(this._lineTimer);
    this._line.classList.remove('on');
    this._line.hidden = true;
  }

  hide() { this.hush(); }
  show() {}
  celebrate() { return this.perform('cheer'); }

  _paint() {
    const ch = this.character;
    if (!ch) return;
    const mood = this.mood;
    const url = ch.poses[mood] || ch.poses.default;
    this.dataset.mood = mood;
    this._init.textContent = (ch.label || ch.name || '?').slice(0, 1).toUpperCase();
    if (this._img.getAttribute('src') !== url) {
      this.removeAttribute('data-noimg');
      this._img.setAttribute('src', url);
    }
  }

  _onError() {
    const ch = this.character;
    const src = this._img.getAttribute('src');
    if (ch && src !== ch.poses.default) this._img.setAttribute('src', ch.poses.default);
    else this.setAttribute('data-noimg', '');
  }
}

const COACH_STYLES = sheet(`
  :host {
    position: fixed; left: var(--space-4); z-index: 300;
    bottom: calc(var(--lesson-chrome-bottom, 0px) + var(--space-2));
    display: none; align-items: flex-end; gap: var(--space-3); pointer-events: none;
  }
  :host([visible]) { display: flex; animation: coach-in var(--motion-base, 200ms) ease both; }
  .fig { width: 72px; }
  .line { max-width: 260px; padding: var(--space-3) var(--space-4); font-family: var(--font-family); font-weight: var(--fw-strong); font-size: var(--fs-small); ${BUBBLE_BOX} border-bottom-left-radius: 4px; box-shadow: var(--shadow-lg); }
  .name { ${BUBBLE_NAME} }
  @keyframes coach-in { from { opacity: 0; transform: translateY(12px); } }
  @media (max-width: 600px) { .line { max-width: 180px; } }
  @media (prefers-reduced-motion: reduce) { :host([visible]) { animation: none; } }
`);

/**
 * The cast's coach: the narrator, with a line, at the lesson's lower left,
 * standing in for the look's coach (slot kind "coach") while a cast course is
 * open. Same API as <quill-coach>: show(line, ms), hide(), `mascot` (the
 * figure, for faces and acts), and the `visible` attribute while shown.
 */
export class CastCoach extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [COACH_STYLES];
    this._fig = null;
    this._box = document.createElement('div');
    this._box.className = 'line';
    this._box.setAttribute('role', 'status');
    this._name = document.createElement('span');
    this._name.className = 'name';
    this._text = document.createElement('span');
    this._box.append(this._name, this._text);
    root.append(this._box);
    this._timer = 0;
  }

  connectedCallback() {
    const ch = characterOf(this.localName);
    if (!this._fig && ch?.figureTag) {
      this._fig = document.createElement(ch.figureTag);
      this._fig.className = 'fig';
      this._fig.setAttribute('aria-hidden', 'true');
      this.shadowRoot.prepend(this._fig);
    }
    this._name.textContent = ch?.label || '';
  }

  disconnectedCallback() { clearTimeout(this._timer); }

  get mascot() { return this._fig; }

  show(line, ms = 7000) {
    this._text.textContent = String(line ?? '');
    this.setAttribute('visible', '');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.hide(), ms);
  }

  hide() {
    clearTimeout(this._timer);
    this.removeAttribute('visible');
  }
}

/** Defines (once) the coach tag for a cast's narrator. */
export function defineCoach(tag, character) {
  bindCharacter(tag, character);
  if (!customElements.get(tag)) customElements.define(tag, class extends CastCoach {});
  return tag;
}

const LOGO_STYLES = sheet(`
  :host { display: inline-flex; align-items: center; gap: var(--logo-gap, 0.45em); line-height: 1; white-space: nowrap; vertical-align: middle; }
  .tile {
    width: var(--logo-size, 36px); height: var(--logo-size, 36px); flex: none; overflow: hidden;
    border-radius: 30%; background: var(--bg-sunken); box-shadow: inset 0 0 0 2px var(--border-color);
  }
  .tile > * { width: 100%; height: 100%; }
  .word { font-family: var(--font-heading); font-weight: var(--fw-heavy); letter-spacing: -0.01em; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`);

/**
 * The header mark while a cast course is open (slot kind "logo"): the
 * narrator's portrait on a tile, then the plain wordmark. The word is
 * part="word", so a host hides it on narrow screens exactly as it hides the
 * look's own logo's word.
 */
export class CastLogo extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).adoptedStyleSheets = [LOGO_STYLES];
  }

  connectedCallback() {
    if (this.shadowRoot.childNodes.length) return;
    const ch = characterOf(this.localName);
    const tile = document.createElement('span');
    tile.className = 'tile';
    tile.setAttribute('aria-hidden', 'true');
    if (ch?.figureTag) {
      const fig = document.createElement(ch.figureTag);
      fig.setAttribute('framing', 'portrait');
      tile.append(fig);
    }
    const word = document.createElement('span');
    word.className = 'word';
    word.setAttribute('part', 'word');
    word.setAttribute('aria-hidden', 'true');
    word.textContent = 'coauthor';
    const sr = document.createElement('span');
    sr.className = 'sr';
    sr.textContent = 'CoAuthor';
    this.shadowRoot.append(tile, word, sr);
  }
}

/** Defines (once) the header mark tag for a cast's narrator. */
export function defineLogo(tag, character) {
  bindCharacter(tag, character);
  if (!customElements.get(tag)) customElements.define(tag, class extends CastLogo {});
  return tag;
}

/** Defines (once) the pose figure tag for a character, and (re)binds the
 *  character it stands for. */
export function defineFigure(tag, character) {
  _characters.set(tag, character);
  if (!customElements.get(tag)) customElements.define(tag, class extends CastFigure {});
  return tag;
}

/**
 * Defines a bundle's own element module for a character: its default export
 * (or `element`) is a custom element class, defined under `tag`; a module
 * that defines itself and exports its `tag` keeps that one. Returns the tag
 * to use, or null (the caller falls back to the pose figure).
 */
export function defineElement(tag, mod, character) {
  if (typeof mod?.tag === 'string' && customElements.get(mod.tag)) {
    _characters.set(mod.tag.toLowerCase(), character);
    return mod.tag.toLowerCase();
  }
  const Ctor = mod?.default || mod?.element;
  if (typeof Ctor !== 'function' || !(Ctor.prototype instanceof HTMLElement)) return null;
  _characters.set(tag, character);
  if (customElements.get(tag)) return tag;
  try {
    customElements.define(tag, Ctor);
    return tag;
  } catch {
    return null;
  }
}
