/**
 * The plain look's brand module: a set-type wordmark and a thin loading rule.
 * No companion, no coach, no stagehand, no page turn: those kinds fall back
 * to nothing, and pages just change.
 *
 * It also asks for the faces up front, both unicode-range files of each: a
 * canvas scene draws its text once and only a loaded face can be drawn, so
 * the first frame must not race the font.
 */
if (typeof document !== 'undefined' && document.fonts?.load) {
  for (const face of ["600 16px 'Source Sans 3'", "600 16px 'Source Serif 4'"]) {
    document.fonts.load(face, 'a\u1E63').catch(() => {});
  }
}

const sheet = (text) => {
  const s = new CSSStyleSheet();
  s.replaceSync(text);
  return s;
};

class PlainWordmark extends HTMLElement {
  static styles = sheet(`
    :host { display: inline-block; font-family: var(--font-heading); font-weight: 600; font-size: 1.2rem; letter-spacing: -0.005em; line-height: 1; white-space: nowrap; color: inherit; }
    :host([big]) { display: block; text-align: center; font-size: 2.2rem; }
  `);
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [PlainWordmark.styles];
    root.textContent = 'CoAuthor';
  }
  celebrate() { return Promise.resolve(); }
}

/** A thin indeterminate rule; the label stays with assistive tech only. */
class PlainLoader extends HTMLElement {
  static observedAttributes = ['label', 'inline'];
  static styles = sheet(`
    :host { display: grid; justify-items: center; padding: 16px; color: inherit; }
    :host([inline]) { display: inline-grid; padding: 0; vertical-align: middle; }
    .track { position: relative; width: 120px; height: 2px; overflow: hidden; border-radius: 1px; background: var(--border-color); }
    :host([inline]) .track { width: 48px; }
    .bar { position: absolute; inset: 0 auto 0 0; width: 34%; border-radius: 1px; background: var(--accent-gold); animation: slide 1.4s ease-in-out infinite; }
    @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(300%); } }
    @media (prefers-reduced-motion: reduce) { .bar { animation: none; width: 100%; opacity: 0.5; } }
  `);
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [PlainLoader.styles];
    const track = document.createElement('div');
    track.className = 'track';
    const bar = document.createElement('div');
    bar.className = 'bar';
    track.append(bar);
    root.append(track);
  }
  connectedCallback() {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'status');
    this.setAttribute('aria-label', this.getAttribute('label') || 'Loading');
  }
  attributeChangedCallback() {
    if (this.isConnected) this.setAttribute('aria-label', this.getAttribute('label') || 'Loading');
  }
}


/**
 * <plain-cover>: a set-type course cover, the plain stand-in for an empty
 * icon tile. A tone (navy, slate, stone, paper) and a rule pattern picked
 * deterministically from `seed` (the course path), the course initials in
 * the serif, and the subject in small caps. Pure tokens (--cover-*, look.css),
 * so it follows light and dark. It lays itself out by its own box (a
 * container): wide is a card banner, tall a portrait cover; the host sizes it.
 */
const STOP = new Set(['a', 'an', 'and', 'the', 'of', 'for', 'to', 'in', 'on', 'with', 'from', 'by', 'at', 'into']);
export function coverInitials(heading) {
  const words = String(heading || '').replace(/\(.*?\)/g, ' ').split(/[^A-Za-z0-9\u00C0-\u024F]+/).filter(Boolean);
  const main = words.filter((w) => !STOP.has(w.toLowerCase()));
  const pick = (main.length ? main : words).slice(0, 2).map((w) => w[0].toUpperCase());
  return pick.join('') || 'C';
}
export function coverHash(seed) {
  // The same course reaches here as content/courses/<bundle>/... (the shelf),
  // courses/<bundle>/... (its own page) or a bare bundle id (Discover): key on
  // the bundle, so a course and its tests share one board in every place.
  const path = String(seed || '').replace(/^\/+/, '').replace(/^content\//, '');
  const key = path.match(/^courses\/([^/]+)\//)?.[1] || path;
  let h = 2166136261;
  for (const ch of key) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  // FNV's low bits are weak: finish with a murmur mix so tone and pattern vary.
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const NS = 'http://www.w3.org/2000/svg';
// Each pattern: [width, height, svg markup of one tile]. Strokes read
// currentColor (the tone's rule colour); a brass line reads var(--cover-accent).
const PATTERNS = [
  [8, 8, '<path d="M0 7.5H8" />'],
  [8, 8, '<path d="M-2 10 10 -2M-2 2 2 -2M6 10 10 6" />'],
  [10, 10, '<circle cx="5" cy="5" r="0.9" fill="currentColor" stroke="none" />'],
  [12, 12, '<path d="M0 0.5H12M0.5 0V12" />'],
  [14, 7, '<path d="M0 6.5Q3.5 0.5 7 3.5T14 0.5" />'],
  [6, 12, '<path d="M0.5 0V12" />'],
];

class PlainCover extends HTMLElement {
  static observedAttributes = ['seed', 'subject', 'heading'];
  static styles = sheet(`
    :host {
      --c-bg: var(--cover-1-bg); --c-ink: var(--cover-1-ink); --c-rule: var(--cover-1-rule); --c-sub: var(--cover-1-sub);
      display: block; position: relative; overflow: hidden; box-sizing: border-box;
      background: var(--c-bg); color: var(--c-ink); container-type: size;
    }
    :host([tone="2"]) { --c-bg: var(--cover-2-bg); --c-ink: var(--cover-2-ink); --c-rule: var(--cover-2-rule); --c-sub: var(--cover-2-sub); }
    :host([tone="3"]) { --c-bg: var(--cover-3-bg); --c-ink: var(--cover-3-ink); --c-rule: var(--cover-3-rule); --c-sub: var(--cover-3-sub); }
    :host([tone="4"]) { --c-bg: var(--cover-4-bg); --c-ink: var(--cover-4-ink); --c-rule: var(--cover-4-rule); --c-sub: var(--cover-4-sub); }
    .field { position: absolute; color: var(--c-rule); }
    .field svg { display: block; width: 100%; height: 100%; }
    .field path, .field circle { fill: none; stroke: currentColor; stroke-width: 0.75; }
    .frame { position: absolute; inset: 8px; border: 1px solid var(--c-rule); pointer-events: none; }
    .mark {
      position: absolute; font-family: var(--font-heading); font-weight: 600; line-height: 0.9;
      letter-spacing: -0.01em; color: var(--c-ink); font-feature-settings: 'lnum';
    }
    .sub {
      position: absolute; font-family: var(--font-family); font-weight: 600; font-size: 10px;
      letter-spacing: 0.16em; text-transform: uppercase; color: var(--c-sub);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .accent { position: absolute; background: var(--cover-accent); }

    /* Wide (a card banner): subject and initials on the left, the field on
       the right. Tall (the hero): subject over a short brass rule, the
       initials, the field across the foot. Small sizes drop the subject. */
    @container (min-aspect-ratio: 4/3) {
      .field { top: 8px; right: 8px; bottom: 8px; width: 46%; border-left: 1px solid var(--c-rule); }
      .mark { left: 22px; bottom: 18px; font-size: clamp(30px, 38cqh, 46px); }
      .sub { left: 22px; top: 20px; max-width: 46%; }
      .accent { left: 22px; top: 40px; width: 24px; height: 2px; }
    }
    @container (min-aspect-ratio: 4/3) and (max-height: 90px) {
      .frame { inset: 6px; }
      .field { top: 6px; right: 6px; bottom: 6px; }
      .mark { left: 18px; bottom: 14px; }
      .sub, .accent { display: none; }
    }
    @container (max-aspect-ratio: 4/3) {
      .field { left: 8px; right: 8px; bottom: 8px; height: 34%; border-top: 1px solid var(--c-rule); }
      .mark { left: 13%; top: 30%; font-size: clamp(30px, 30cqw, 76px); }
      .sub { left: 13%; right: 13%; top: 11%; }
      .accent { left: 13%; top: calc(11% + 20px); width: 28px; height: 2px; }
    }
    @container (max-aspect-ratio: 4/3) and (max-width: 130px) {
      .frame { inset: 5px; }
      .field { left: 5px; right: 5px; bottom: 5px; }
      .mark { top: 18%; }
      .sub, .accent { display: none; }
    }
  `);
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [PlainCover.styles];
  }
  connectedCallback() {
    this.setAttribute('aria-hidden', 'true');
    this._paint();
  }
  attributeChangedCallback() { if (this.isConnected) this._paint(); }
  _paint() {
    const seed = this.getAttribute('seed') || this.getAttribute('heading') || '';
    const h = coverHash(seed);
    const tone = String((h % 4) + 1);
    if (this.getAttribute('tone') !== tone) this.setAttribute('tone', tone);
    const [w, ht, tile] = PATTERNS[(h >>> 3) % PATTERNS.length];
    const id = `p${h.toString(36)}`;
    const root = this.shadowRoot;
    root.replaceChildren();
    const frame = document.createElement('div');
    frame.className = 'frame';
    const field = document.createElement('div');
    field.className = 'field';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('preserveAspectRatio', 'none');
    // Static, author-free markup: the tile strings above and a numeric id.
    svg.innerHTML = `<defs><pattern id="${id}" width="${w}" height="${ht}" patternUnits="userSpaceOnUse">${tile}</pattern></defs><rect width="100%" height="100%" fill="url(#${id})" stroke="none" />`;
    field.append(svg);
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = this.getAttribute('subject') || '';
    const accent = document.createElement('div');
    accent.className = 'accent';
    const mark = document.createElement('div');
    mark.className = 'mark';
    mark.textContent = coverInitials(this.getAttribute('heading'));
    root.append(field, frame, sub, accent, mark);
  }
}

customElements.define('plain-wordmark', PlainWordmark);
customElements.define('plain-cover', PlainCover);
customElements.define('plain-loader', PlainLoader);

export const slots = {
  loader: { tag: 'plain-loader' },
  logo: { tag: 'plain-wordmark' },
  signature: { tag: 'plain-wordmark' },
  cover: { tag: 'plain-cover' },
};

export const copy = { narrator: '' };
