/**
 * match-categorize@1 — Chip-to-column classification question.
 *
 * Students sort labelled chips into category columns: tap a chip then tap a
 * column, drag it (mouse), or use the keyboard. There is no custom touch drag:
 * this plugin adds no touch handlers, so a swipe that starts on it scrolls.
 * Partial credit scoring: fraction of correctly placed chips.
 * (HLD Appendix C.10)
 */
import { QuestionBase } from '../../../../core/components/QuestionBase.js';
import { html, css, nothing } from 'lit';
import '../../../../ui/components/MarkdownRenderer.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';

// Plugin UI text, keyed by locale the same way content strings are.
const STRINGS = {
  poolHint: { en: 'Available items — tap one, then tap a column, or drag it:' },
  poolDone: { en: 'Available items:' },
};

export class MatchCategorize extends QuestionBase {
  static styles = [btn3dStyles, feedbackAnimStyles, 
    QuestionBase.styles,
    css`
      .categories { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
      .category {
        flex: 1; min-width: 120px;
        border: 2px dashed var(--border-color);
        border-radius: var(--radius-sm);
        padding: 10px;
        min-height: 80px;
        transition: border-color 0.15s, background 0.15s;
      }
      .category.drag-over { border-color: var(--primary-color); background: var(--primary-light); }
      .category.armed { border-color: var(--primary-color); cursor: pointer; }
      .category, .chip { touch-action: manipulation; }
      .category .chip { margin-bottom: 6px; }
      .category-label { font-weight: var(--fw-medium); font-size: 0.85rem; margin-bottom: 8px; color: var(--text-muted); }
      .chips-pool { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
      .chip {
        display: inline-block;
        box-sizing: border-box;
        max-width: 100%;
        min-height: 44px;
        padding: 11px 14px;
        border: 2px solid var(--border-color);
        border-radius: var(--radius-md);
        background: var(--bg-surface);
        color: var(--text-main);
        cursor: grab;
        font-size: 0.9rem;
        line-height: 1.3;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
        user-select: none;
        transition: background 0.15s, opacity 0.15s;
      }
      .chip:focus-visible { outline: 3px solid var(--primary-color); }
      .chip[aria-grabbed="true"] { opacity: 0.5; }
      .chip[aria-pressed="true"] {
        border-color: var(--primary-color);
        background: var(--primary-light);
        box-shadow: 0 0 0 1px var(--primary-color);
      }
      /* The remove mark is its own 44px target, down the chip's right edge. */
      .chip.removable { position: relative; padding-right: 44px; }
      .chip-remove {
        position: absolute; top: 0; right: 0; bottom: 0; width: 44px;
        display: flex; align-items: center; justify-content: center;
        color: var(--text-muted);
        font-size: 1.3rem;
        line-height: 1;
        cursor: pointer;
      }
      .chip.correct-mark { border-color: var(--success-text); background: var(--success-bg); color: var(--success-text); cursor: default; }
      .chip.incorrect-mark { border-color: var(--error-text); background: var(--error-bg); color: var(--error-text); cursor: default; }
      .chip-answer { font-weight: 400; font-style: italic; }
      .pool-label { font-size: 0.8rem; font-weight: var(--fw-medium); color: var(--text-muted); margin-bottom: 6px; }
    `,
  ];

  static schema = {
    $id: 'match-categorize@1',
    type: 'object',
    required: ['id', 'type', 'stem', 'categories', 'chips'],
    properties: {
      stem: { type: 'object', minProperties: 1 },
      shuffle: { type: 'boolean' },
      categories: { type: 'array', minItems: 2, items: { type: 'object', required: ['id', 'label'] } },
      chips: { type: 'array', minItems: 1, items: { type: 'object', required: ['id', 'text', 'correctCategoryId'] } },
    },
  };

  init(data, prng, ctx) {
    super.init(data, prng, ctx);
    const isPrng = prng && typeof prng.shuffle === 'function';
    this._prng = isPrng ? prng : null;

    // placements: chipId → categoryId | null (null = pool)
    this._placements = {};
    (data.chips || []).forEach(c => { this._placements[c.id] = null; });
    this._dragChipId = null;
    this._selectedChipId = null;

    // Display order only — scoring (static score()) always walks
    // itemData.chips in authored order, keyed by chip id, so shuffling
    // these copies can't affect correctness.
    this._chipOrder = [...(data.chips || [])];
    this._categoryOrder = [...(data.categories || [])];
    if (data.shuffle !== false) {
      this._shuffle(this._chipOrder);
      this._shuffle(this._categoryOrder);
    }
  }

  _shuffle(arr) {
    if (this._prng) {
      this._prng.shuffle(arr);
      return;
    }
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  connectedCallback() { super.connectedCallback?.(); }
  disconnectedCallback() { super.disconnectedCallback?.(); }

  reset() {
    this.init(this._data, this._prng, this._ctx);
    this.requestUpdate();
  }

  getResponse() { return { placements: { ...this._placements } }; }

  /**
   * QuestionBase's inherited getState()/setState() only round-trip `_value`
   * (a plain string), which this plugin never sets — the actual answer
   * lives in `_placements` (see getResponse()). Without these overrides,
   * every remount (Next/Previous, TestEngine.submit()'s headless scoring
   * clone, and review) restarted from init()'s all-chips-in-the-pool state
   * instead of whatever the student actually dragged where — scoring (and
   * review) saw an unanswered question, never the real placements.
   */
  getState() { return { placements: { ...this._placements } }; }

  setState(s) {
    if (!s?.placements || !this._data?.chips) return;
    const validCategoryIds = new Set((this._data.categories || []).map((c) => c.id));
    const restored = {};
    for (const chip of this._data.chips) {
      const catId = s.placements[chip.id];
      restored[chip.id] = validCategoryIds.has(catId) ? catId : null;
    }
    this._placements = restored;
    // _placements is a plain field, not a Lit reactive property — unlike
    // _placeChip() (the live drag-drop handler), this assignment is
    // invisible to Lit on its own, so the DOM keeps showing init()'s
    // all-chips-in-the-pool render until something else forces a re-render.
    this.requestUpdate();
  }

  static score(itemData, response) {
    if (!response?.placements) return { correct: null, score: 0, feedback: 'No answer.' };
    const chips = itemData.chips || [];
    const correct = chips.filter(c => response.placements[c.id] === c.correctCategoryId).length;
    const score = chips.length > 0 ? correct / chips.length : 0;
    return {
      correct: null, // partial credit — no binary
      score,
      feedback: score === 1 ? 'All chips correctly sorted!' : `${correct} of ${chips.length} correct.`,
    };
  }

  _chipsInPool() {
    return (this._chipOrder || this._data?.chips || []).filter(c => !this._placements[c.id]);
  }

  _chipsInCategory(catId) {
    return (this._chipOrder || this._data?.chips || []).filter(c => this._placements[c.id] === catId);
  }

  /** Pick up a pool chip, or put it down again. Tap and keyboard share this. */
  _toggleSelected(chipId) {
    if (this._isRevealed) return;
    this._selectedChipId = this._selectedChipId === chipId ? null : chipId;
    this.requestUpdate();
  }

  _placeChip(chipId, catId) {
    if (this._isRevealed) return;
    this._placements = { ...this._placements, [chipId]: catId || null };
    this._dragChipId = null;
    this._selectedChipId = null;
    this.requestUpdate();
  }

  /** Bank-preview: stem plus the categories/chips to sort, shown as plain
   *  read-only lists — no drag handles, nothing placed. */
  _renderPreviewOnly() {
    return html`
      <div class="stem">${this._previewStemText()}</div>
      <div class="chips-pool" role="list" aria-label="Chips">
        ${(this._data.chips || []).map(chip => html`<span class="chip"><markdown-renderer inline .content=${chip.text?.en ?? chip.id}></markdown-renderer></span>`)}
      </div>
      <div class="categories">
        ${(this._data.categories || []).map(cat => html`
          <div class="category"><div class="category-label"><markdown-renderer inline .content=${cat.label?.en ?? cat.id}></markdown-renderer></div></div>
        `)}
      </div>
    `;
  }

  /** Once revealed, a chip's own category label — used to tell a student
   *  where a wrong (or still-unplaced) chip actually belonged. */
  _categoryLabel(catId) {
    return (this._data.categories || []).find(c => c.id === catId)?.label?.en ?? catId;
  }

  renderInput() {
    if (!this._data) return html``;
    const poolChips = this._chipsInPool();
    const selectedId = this._isRevealed ? null : this._selectedChipId;
    return html`
      <div>
        <div class="pool-label">${(this._isRevealed ? STRINGS.poolDone : STRINGS.poolHint).en}</div>
        <div class="chips-pool" role="group" aria-label="Available chips">
          ${poolChips.map(chip => html`
            <span
              class="chip ${this._isRevealed ? 'incorrect-mark' : ''}"
              role="button"
              tabindex="0"
              draggable="${!this._isRevealed}"
              aria-grabbed="false"
              aria-pressed=${this._isRevealed ? nothing : String(selectedId === chip.id)}
              aria-label="${chip.text?.en ?? chip.id}"
              @dragstart=${e => { if (this._isRevealed) { e.preventDefault(); return; } this._dragChipId = chip.id; e.currentTarget.setAttribute('aria-grabbed','true'); }}
              @dragend=${e => { e.currentTarget.setAttribute('aria-grabbed','false'); }}
              @click=${() => this._toggleSelected(chip.id)}
              @keydown=${e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  this._toggleSelected(chip.id);
                }
              }}
            ><markdown-renderer inline .content=${chip.text?.en ?? chip.id}></markdown-renderer>${this._isRevealed ? html`<span class="chip-answer"> (correct: <markdown-renderer inline .content=${this._categoryLabel(chip.correctCategoryId)}></markdown-renderer>)</span>` : ''}</span>
          `)}
        </div>
        <div class="categories">
          ${(this._categoryOrder || this._data.categories || []).map(cat => html`
            <div
              class="category ${selectedId ? 'armed' : ''}"
              tabindex="0"
              role="group"
              aria-label="${cat.label?.en ?? cat.id} column"
              @click=${() => { if (selectedId) this._placeChip(selectedId, cat.id); }}
              @dragover=${e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
              @dragleave=${e => e.currentTarget.classList.remove('drag-over')}
              @drop=${e => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); if (this._dragChipId) this._placeChip(this._dragChipId, cat.id); }}
              @keydown=${e => {
                if ((e.key === 'Enter' || e.key === ' ') && this._selectedChipId) {
                  e.preventDefault(); this._placeChip(this._selectedChipId, cat.id);
                }
              }}
            >
              <div class="category-label"><markdown-renderer inline .content=${cat.label?.en ?? cat.id}></markdown-renderer></div>
              ${this._chipsInCategory(cat.id).map(chip => {
                const isCorrect = chip.correctCategoryId === cat.id;
                const verdict = this._isRevealed ? (isCorrect ? 'correct-mark' : 'incorrect-mark') : '';
                return html`
                <span
                  class="chip ${verdict} ${this._isRevealed ? '' : 'removable'}"
                  tabindex="0"
                  aria-label="Remove ${chip.text?.en ?? chip.id} from ${cat.label?.en ?? cat.id}"
                  @click=${() => { if (!selectedId) this._placeChip(chip.id, null); }}
                  @keydown=${e => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this._placeChip(chip.id, null); }}}
                ><markdown-renderer inline .content=${chip.text?.en ?? chip.id}></markdown-renderer>${this._isRevealed ? '' : html`<span class="chip-remove" aria-hidden="true" @click=${e => { e.stopPropagation(); this._placeChip(chip.id, null); }}>×</span>`}${this._isRevealed && !isCorrect ? html`<span class="chip-answer"> (correct: <markdown-renderer inline .content=${this._categoryLabel(chip.correctCategoryId)}></markdown-renderer>)</span>` : ''}</span>
              `;})}
            </div>
          `)}
        </div>
      </div>
    `;
  }

  static get supportsHints() { return false; }
}

customElements.define('match-categorize-v1', MatchCategorize);
