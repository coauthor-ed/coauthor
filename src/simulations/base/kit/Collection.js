// The learner's saved game progress for one course: museum medals, owned cards
// and unopened packs. Storage-agnostic: the app wires `persist` to IndexedDB
// (core/CollectionService.js), the kit harness wires it to localStorage, and a
// scene only ever sees this API through `config.collection`.
//
// state: { v, medals: { organismId: 'bronze'|'silver'|'gold' }, cards: { organismId: n },
//          packs: n, sets: { groupId: true }, stats: { name: n } }
const RANK = { bronze: 1, silver: 2, gold: 3 };
export const MEDALS = ['bronze', 'silver', 'gold'];

export class Collection {
  constructor(state, persist) {
    const s = state && typeof state === 'object' ? state : {};
    this.s = { v: 1, medals: s.medals || {}, cards: s.cards || {}, packs: s.packs || 0, sets: s.sets || {}, stats: s.stats || {} };
    this._persist = persist || null;
    this._subs = new Set();
  }

  /** A collection kept in localStorage (kit harness; also a fallback). */
  static local(key) {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* private window */ }
    return new Collection(raw, (s) => { try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* ignore */ } });
  }

  get packs() { return this.s.packs; }
  medal(id) { return this.s.medals[id] || null; }
  /** Keeps the best medal. Returns 'new', 'up' or null (nothing changed). */
  award(id, medal) {
    if (!RANK[medal]) return null;
    const cur = this.s.medals[id];
    if (cur && RANK[cur] >= RANK[medal]) return null;
    this.s.medals[id] = medal;
    this._changed();
    return cur ? 'up' : 'new';
  }
  /** Museum points: bronze 1, silver 2, gold 3. */
  points() { return Object.values(this.s.medals).reduce((n, m) => n + RANK[m], 0); }
  count() { return Object.keys(this.s.medals).length; }

  cards(id) { return this.s.cards[id] || 0; }
  addCard(id) { this.s.cards[id] = (this.s.cards[id] || 0) + 1; this._changed(); }
  ownedCards() { return Object.keys(this.s.cards).filter((k) => this.s.cards[k] > 0); }

  addPack(n = 1) { this.s.packs += n; this._changed(); }
  takePack() { if (this.s.packs < 1) return false; this.s.packs -= 1; this._changed(); return true; }

  hasSet(id) { return !!this.s.sets[id]; }
  markSet(id) { this.s.sets[id] = true; this._changed(); }

  stat(name) { return this.s.stats[name] || 0; }
  bump(name, n = 1) { this.s.stats[name] = (this.s.stats[name] || 0) + n; this._changed(); }

  onChange(fn) { this._subs.add(fn); return () => this._subs.delete(fn); }
  _changed() {
    try { this._persist?.(this.s); } catch { /* the game still works unsaved */ }
    this._subs.forEach((fn) => { try { fn(this); } catch { /* ignore */ } });
  }
}
