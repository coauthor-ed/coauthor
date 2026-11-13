import { EventBus } from '../../core/EventBus.js';
import { LookManager } from '../../core/LookManager.js';
import * as quillBrand from '../../looks/quill/brand.js';

/**
 * Neutral slots: the places a look's brand pieces appear, without naming
 * them (docs/sprints/wip/quill-look-pack-and-celebrations-2026-10-30.md,
 * step E3; contract in docs/ui-ux-design-system.md 1.1.1b).
 *
 *   <app-loader size="48" label="Loading...">     a loading indicator
 *   <app-logo>                                    the header brand mark
 *   <app-signature>                               the big lockup (onboarding)
 *   <companion-slot kind="companion" size="sm">   where a companion may stand
 *   <look-cover seed subject heading variant>      a course cover (plain only)
 *       kind: companion (default), coach, math-coach, stagehand
 *
 * Each renders, as its own light-DOM child, the element the active look's
 * brand module names for that kind (LookManager.brand().slots[kind].tag),
 * forwarding its attributes (and the few properties below) to it. The slot
 * itself is display: contents, so the child lays out exactly as if the view
 * had placed it: a view styles boxes with `companion-slot > *` (or
 * `.its-class > *`) and passes `slot.companion` (the child, or null) as a
 * cue's companion. When the look changes the child is replaced. A look
 * without a brand module (or without that kind) gets the neutral fallback:
 * a token-coloured spinner, the plain "coauthor" wordmark, and no companion.
 *
 * Quill is the built-in default and is imported here statically, so the
 * index.html overlay's <app-loader> and every first paint are Quill with no
 * flash; this also covers the authoring app, which never initialises
 * LookManager (invariant 10) and so always previews plugins with Quill.
 */

const QUILL_BRAND = 'src/looks/quill/brand.js';
LookManager.provideBrand(QUILL_BRAND, quillBrand);

const brandSpec = (kind) => LookManager.brand()?.slots?.[kind] || null;

/**
 * Loads the active brand's lazy pieces for these kinds. A view module that
 * places such a slot awaits it at the top level, so the piece is defined
 * before the view first renders (as its static import used to guarantee).
 */
export async function loadBrandPieces(...kinds) {
  await Promise.all(kinds.map((k) => brandSpec(k)?.load?.()).filter(Boolean));
}

/**
 * A string from the active brand's copy, or the fallback. {name} placeholders
 * in either are filled from `vars`, so a brand can word a sentence its own way.
 */
export function brandCopy(key, fallback = '', vars = null) {
  const v = LookManager.brand()?.copy?.[key];
  const text = typeof v === 'string' ? v : fallback;
  return vars ? text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : text;
}

/**
 * The active brand's mark for a key (a string, in Quill an emoji), or the
 * fallback (a uiIcons template, or nothing): a look without marks stays plain.
 */
export function brandIcon(key, fallback = '') {
  return LookManager.brand()?.icons?.[key] ?? fallback;
}

/** Does the active look place anything in this slot kind? */
export function hasBrandPiece(kind) {
  return !!brandSpec(kind);
}

// ── neutral fallbacks ────────────────────────────────────────────────────

const sheet = (text) => {
  const s = new CSSStyleSheet();
  s.replaceSync(text);
  return s;
};

const CONTENTS = sheet(':host { display: contents; }');

/** A token-coloured ring spinner; the caller's label (if any) under it. */
class AppSpinner extends HTMLElement {
  static observedAttributes = ['size', 'label', 'inline'];
  static styles = sheet(`
    :host { display: grid; justify-items: center; align-content: center; gap: 10px; padding: 12px; color: inherit; }
    :host([inline]) { display: inline-flex; align-items: center; gap: 8px; padding: 0; vertical-align: middle; }
    .ring {
      box-sizing: border-box; border-radius: 50%;
      border: 4px solid color-mix(in srgb, currentColor 14%, transparent);
      border-top-color: var(--primary-color);
      animation: spin 0.9s linear infinite;
    }
    .label { white-space: nowrap; font-weight: var(--fw-strong); font-size: 0.95em; opacity: 0.8; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .ring { animation-duration: 2.4s; } }
  `);
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).adoptedStyleSheets = [AppSpinner.styles];
  }
  connectedCallback() {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'status');
    this._paint();
  }
  attributeChangedCallback() { if (this.isConnected) this._paint(); }
  _paint() {
    const inline = this.hasAttribute('inline');
    const px = Number(this.getAttribute('size')) || (inline ? 22 : 64);
    const label = this.getAttribute('label') || '';
    this.setAttribute('aria-label', label || 'Loading');
    const root = this.shadowRoot;
    root.replaceChildren();
    const ring = document.createElement('div');
    ring.className = 'ring';
    ring.style.width = ring.style.height = `${px}px`;
    root.append(ring);
    if (label) {
      const span = document.createElement('span');
      span.className = 'label';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = label;
      root.append(span);
    }
  }
}

/** The plain "coauthor" wordmark, in the host's text colour. */
class AppWordmark extends HTMLElement {
  static styles = sheet(`
    :host { display: inline-block; font-family: var(--font-family); font-weight: var(--fw-heavy); line-height: 1; letter-spacing: -0.01em; white-space: nowrap; color: inherit; }
    :host([big]) { display: block; text-align: center; font-size: 2.6rem; }
  `);
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [AppWordmark.styles];
    root.textContent = 'coauthor';
  }
  /** <app-signature>'s big moment: nothing to play. */
  celebrate() { return Promise.resolve(); }
}

customElements.define('app-spinner', AppSpinner);
customElements.define('app-wordmark', AppWordmark);

// ── the slots ────────────────────────────────────────────────────────────

// Attributes passed through to the child (all the brand pieces' public ones).
const FORWARD = ['size', 'label', 'inline', 'expression', 'act', 'idle', 'track-pointer', 'rest-after', 'seed', 'subject', 'heading', 'variant'];
// The ones the neutral fallbacks understand.
const FALLBACK_FORWARD = ['size', 'label', 'inline'];
// Properties passed through (template property bindings, e.g. .lines=${...}).
const PROPS = ['lines', 'idle', 'expression', 'act'];

class BrandSlot extends HTMLElement {
  static observedAttributes = FORWARD;
  /** Fallback element tag for a look without this piece ('' = nothing). */
  static fallback = '';
  static fallbackAttrs = {};

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).adoptedStyleSheets = [CONTENTS];
    this.shadowRoot.append(document.createElement('slot'));
    this._el = null;
    this._tag = null;
    this._props = {};
    this._onBrand = () => this._render();
  }

  get kind() {
    return this.constructor.KIND || this.getAttribute('kind') || 'companion';
  }

  /** The element the look put here (null when the look has none). */
  get companion() {
    return this._el;
  }

  connectedCallback() {
    EventBus.on('look:brand', this._onBrand);
    this._render();
  }

  disconnectedCallback() {
    EventBus.off('look:brand', this._onBrand);
  }

  attributeChangedCallback(name, old, value) {
    if (!this._el) return;
    if (this._el.localName !== this._brandTag && !FALLBACK_FORWARD.includes(name)) return;
    if (value === null) this._el.removeAttribute(name);
    else this._el.setAttribute(name, value);
  }

  _render() {
    const spec = brandSpec(this.kind);
    const tag = spec?.tag || this.constructor.fallback || '';
    if (tag === this._tag) return;
    this._el?.remove();
    this._el = null;
    this._tag = tag;
    this._brandTag = spec?.tag || '';
    if (!tag) return;
    spec?.load?.()?.catch?.((e) => console.warn(`[LookSlots] Could not load "${tag}".`, e));
    const el = document.createElement(tag);
    if (spec) {
      for (const a of FORWARD) if (this.hasAttribute(a)) el.setAttribute(a, this.getAttribute(a));
      for (const [k, v] of Object.entries(this._props)) el[k] = v;
    } else {
      for (const a of FALLBACK_FORWARD) if (this.hasAttribute(a)) el.setAttribute(a, this.getAttribute(a));
      for (const [k, v] of Object.entries(this.constructor.fallbackAttrs)) el.setAttribute(k, v);
    }
    this._el = el;
    this.append(el);
  }
}

for (const p of PROPS) {
  Object.defineProperty(BrandSlot.prototype, p, {
    get() { return this._el && this._el.localName === this._brandTag ? this._el[p] : this._props[p]; },
    set(v) {
      this._props[p] = v;
      if (this._el && this._el.localName === this._brandTag) this._el[p] = v;
    },
  });
}

class AppLoader extends BrandSlot {
  static KIND = 'loader';
  static fallback = 'app-spinner';
}
class AppLogo extends BrandSlot {
  static KIND = 'logo';
  static fallback = 'app-wordmark';
}
class AppSignature extends BrandSlot {
  static KIND = 'signature';
  static fallback = 'app-wordmark';
  static fallbackAttrs = { big: '' };
}
class CompanionSlot extends BrandSlot {}
/** A course cover (seed subject heading variant); Quill places none. */
class LookCover extends BrandSlot {
  static KIND = 'cover';
}

customElements.define('app-loader', AppLoader);
customElements.define('app-logo', AppLogo);
customElements.define('app-signature', AppSignature);
customElements.define('companion-slot', CompanionSlot);
customElements.define('look-cover', LookCover);
