import { CourseSourceManager } from './CourseSourceManager.js';
import { EventBus } from './EventBus.js';

/**
 * GlossaryService - per-bundle glossary of hard words (tap-to-gloss).
 *
 * A course bundle may ship `glossary.json` at its root (listed as `glossary`
 * in manifest.json, but not required there - the file is simply looked up by
 * name, once per bundle, and a 404 means "no glossary": nothing is marked).
 * Shape: `{ "terms": [ { id, term, match?, cs?, plain?, roots?, means?, face? } ] }`
 * (see content-repo-template/docs/glossary.md). Every learner-facing string is
 * `{ en }` like the rest of the content.
 *
 * Consumers:
 *   - <markdown-renderer glossaryBundle="..."> marks matching words in prose
 *     (Glossary.mark()) and asks for a card via open().
 *   - <glossary-popover> (mounted on first open) shows the card.
 *   - Scenes get `config.glossaryTerm(id)` from their host (content-block).
 * Scenes and prose never fetch the file themselves.
 */

const _byBundle = new Map(); // bundleId -> Promise<Glossary|null>
const _ready = new Map();    // bundleId -> Glossary|null (settled)

const text = (v) => (v && typeof v === 'object' ? v.en : v) || '';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Elements whose text must never be marked: headings (a term in a title is
// already prominent), code, links, math, and anything already marked.
const SKIP = 'h1,h2,h3,h4,h5,h6,a,code,pre,button,[role=button],math-span,math-div,mark,.gl-term';

export class Glossary {
  constructor(raw) {
    this.terms = [];
    this._byId = new Map();
    const forms = [];
    for (const t of raw?.terms || []) {
      if (!t?.id || !t?.term) continue;
      const term = {
        id: t.id,
        term: t.term,
        plain: text(t.plain),
        means: text(t.means),
        roots: (t.roots || []).map((r) => ({ part: r.part, means: text(r.means) })),
        face: t.face || null,
        group: t.group || '',
        lesson: t.lesson ?? null,
      };
      this.terms.push(term);
      this._byId.set(term.id, term);
      const cs = !!t.cs;
      for (const f of new Set([t.term, ...(t.match || [])])) forms.push({ f, id: t.id, cs });
    }
    // Longest surface form first so "cell wall" wins over "cell".
    forms.sort((a, b) => b.f.length - a.f.length);
    this._form = new Map(forms.map((x) => [x.cs ? x.f : x.f.toLowerCase(), x]));
    const alt = forms.map((x) => esc(x.f)).join('|');
    // A hyphen before the form means it is a compound ("non-chordate"), and a
    // letter either side means it is part of a longer word.
    this._re = alt ? new RegExp(`(?<![\\p{L}\\p{N}-])(?:${alt})(?![\\p{L}\\p{N}])`, 'giu') : null;
  }

  get(id) { return this._byId.get(id) || null; }

  /** id for a matched surface form, or null when a case-sensitive form
   *  matched in the wrong case. */
  _idFor(word) {
    const hit = this._form.get(word) || this._form.get(word.toLowerCase());
    if (!hit) return null;
    if (hit.cs && hit.f !== word) return null;
    return hit.id;
  }

  /**
   * Wraps the first occurrence of each known term inside `root` in a
   * `<span class="gl-term" data-gl="id" role="button">`. One mark per term per call: a
   * word underlined every time it occurs is noise, and each reveal step is
   * its own renderer, so a term is marked again in every beat that uses it.
   * Returns the number of marks.
   */
  mark(root) {
    if (!this._re) return 0;
    const seen = new Set();
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement?.closest(SKIP)) continue;
      nodes.push(n);
    }
    let count = 0;
    for (const node of nodes) {
      const value = node.nodeValue;
      this._re.lastIndex = 0;
      let last = 0;
      let frag = null;
      for (let m = this._re.exec(value); m; m = this._re.exec(value)) {
        const id = this._idFor(m[0]);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        frag = frag || document.createDocumentFragment();
        if (m.index > last) frag.append(value.slice(last, m.index));
        // A span, not a <button>: a button is always inline-block, so a
        // two-word term ("cell wall") could not wrap across lines.
        const b = document.createElement('span');
        b.className = 'gl-term';
        b.dataset.gl = id;
        b.tabIndex = 0;
        b.setAttribute('role', 'button');
        b.setAttribute('aria-haspopup', 'dialog');
        b.textContent = m[0];
        frag.append(b);
        last = m.index + m[0].length;
        count++;
      }
      if (frag) {
        if (last < value.length) frag.append(value.slice(last));
        node.replaceWith(frag);
      }
    }
    return count;
  }
}

export const GlossaryService = {
  /** Loads (once) and returns the bundle's Glossary, or null when it has none. */
  load(bundleId) {
    if (!bundleId) return Promise.resolve(null);
    if (!_byBundle.has(bundleId)) {
      _byBundle.set(bundleId, (async () => {
        let g = null;
        try {
          await CourseSourceManager.init();
          const res = await fetch(CourseSourceManager.resolveRef('glossary.json', bundleId));
          if (res.ok) g = new Glossary(await res.json());
        } catch { /* no glossary, or unreadable: the lesson works without one */ }
        _ready.set(bundleId, g);
        return g;
      })());
    }
    return _byBundle.get(bundleId);
  },

  /** The Glossary if load() has already settled, else null. */
  peek(bundleId) { return _ready.get(bundleId) || null; },

  /** Ask the (lazily mounted) popover to show a term's card near `anchor`. */
  async open(bundleId, id, anchor) {
    const term = (await this.load(bundleId))?.get(id);
    if (!term) return;
    if (!customElements.get('glossary-popover')) await import('../ui/components/GlossaryPopover.js');
    if (!document.querySelector('glossary-popover')) document.body.appendChild(document.createElement('glossary-popover'));
    EventBus.emit('glossary:open', { term, anchor });
  },
};
