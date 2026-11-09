/**
 * sequence-order@1 — Drag-to-reorder list question.
 *
 * Students put items into the correct sequential order. Each row has Move up
 * and Move down buttons, which work on touch, mouse and keyboard. Dragging a
 * row and the keyboard's select-then-place (Enter/Space) also work, but HTML5
 * drag does not fire on touch screens, so the buttons are the main control.
 * (HLD Appendix C.9)
 */
import { QuestionBase } from '../../../../core/components/QuestionBase.js';
import { PRNG } from '../../../../core/PRNG.js';
import { A11yAnnouncer } from '../../../../core/A11yAnnouncer.js';
import { html, css } from 'lit';
import '../../../../ui/components/MarkdownRenderer.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';

export class SequenceOrder extends QuestionBase {
  static styles = [btn3dStyles, feedbackAnimStyles, 
    QuestionBase.styles,
    css`
      /* .input-row is a flex row: without this the hints sit beside the list. */
      .seq-wrap { flex: 1 1 100%; min-width: 0; }
      .sequence-list { max-width: 40rem; list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
      .seq-item {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 10px 10px 14px;
        border: 2px solid var(--border-color);
        border-radius: var(--radius-xs);
        background: var(--bg-surface);
        cursor: grab;
        transition: background 0.15s, border-color 0.15s, opacity 0.15s;
        user-select: none;
      }
      .seq-item:focus { outline: 3px solid var(--primary-color); }
      .seq-item[aria-grabbed="true"] { opacity: 0.5; border-color: var(--primary-color); }
      .seq-item.drag-over { border-color: var(--primary-color); background: var(--primary-light); }
      .seq-item.correct-mark { border-color: var(--success-text); background: var(--success-bg); cursor: default; }
      .seq-item.incorrect-mark { border-color: var(--error-text); background: var(--error-bg); cursor: default; }
      /* A drag cue only means something where dragging works. */
      .drag-handle { display: none; color: var(--text-muted); font-size: 1.2rem; cursor: grab; }
      .item-text { flex: 1; min-width: 0; }
      .seq-moves { display: flex; gap: var(--space-2); flex: none; }
      .btn-3d.seq-btn {
        width: 40px; height: 40px; padding: 0;
        border-radius: var(--radius-sm);
        touch-action: manipulation;
      }
      .keyboard-hint { font-size: 0.75rem; color: var(--text-muted); margin-top: 8px; }
      .fine-pointer-hint { display: none; }
      @media (pointer: fine) {
        .drag-handle { display: inline; }
        .fine-pointer-hint { display: block; margin-top: 2px; }
      }
      .correct-order-answer {
        margin-top: 10px;
        padding: 10px 14px;
        background: var(--bg-surface);
        border: 1px solid var(--border-color);
        border-left: 4px solid var(--success-text);
        border-radius: var(--radius-xs);
        font-size: 0.9rem;
        line-height: 1.5;
      }
      .correct-order-answer strong { color: var(--success-text); }
    `,
  ];

  static schema = {
    $id: 'sequence-order@1',
    type: 'object',
    required: ['id', 'type', 'stem', 'items', 'correctOrder'],
    properties: {
      stem: { type: 'object', minProperties: 1 },
      items: { type: 'array', minItems: 2, items: { type: 'object', required: ['id', 'text'] } },
      correctOrder: { type: 'array', items: { type: 'string' } },
    },
  };

  init(data, prng, ctx) {
    this._data = data;
    const isPrng = prng && typeof prng.shuffle === 'function';
    this._prng = isPrng ? prng : null;
    this._ctx = isPrng ? (ctx || null) : (prng || null);
    // Start in shuffled order, deterministically if a seeded PRNG was passed by the engine.
    this._order = [...(data.items || [])];
    this._shuffle();
    this._dragSrcIdx = null;
    this._selectedIdx = null;
  }

  connectedCallback() {
    super.connectedCallback?.();
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
  }

  _shuffle() {
    if (this._prng) {
      this._prng.shuffle(this._order);
      return;
    }
    for (let i = this._order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this._order[i], this._order[j]] = [this._order[j], this._order[i]];
    }
  }

  reset(seed) {
    if (seed !== undefined) this._prng = new PRNG(seed);
    this._order = [...(this._data?.items || [])];
    this._shuffle();
    this._dragSrcIdx = null;
    this._selectedIdx = null;
    this.requestUpdate();
  }

  getResponse() { return { order: this._order.map(i => i.id) }; }

  /**
   * QuestionBase's inherited getState()/setState() only round-trip
   * `_value` (a plain string) — this plugin never sets that, it keeps the
   * dragged order in `_order` instead, via getResponse() above. Without
   * these overrides, TestEngine's Next/Submit/review-remount cycle
   * (_syncMountedState() -> setState()) silently carried nothing: every
   * remount (including the headless clone TestEngine.submit() scores)
   * re-ran init()'s own seeded shuffle from scratch and scored/displayed
   * that starting order instead of whatever the student actually dragged
   * it into.
   */
  getState() { return { order: this._order.map(i => i.id) }; }

  setState(s) {
    if (!s?.order || !this._data?.items) return;
    const byId = new Map(this._data.items.map((i) => [i.id, i]));
    const restored = s.order.map((id) => byId.get(id)).filter(Boolean);
    // Only trust it if it accounts for every item (content could have
    // changed between save and restore) — otherwise keep the shuffled
    // order init() already produced rather than silently dropping items.
    if (restored.length === this._data.items.length) {
      this._order = restored;
      // _order is a plain field, not a Lit reactive property — unlike
      // _moveItem() (the live drag/keyboard handler), this assignment is
      // invisible to Lit on its own, so the list keeps showing init()'s
      // shuffled order until something else forces a re-render.
      this.requestUpdate();
    }
  }

  static score(itemData, response) {
    if (!response?.order) return { isCorrect: false, score: 0, feedback: 'No answer.' };
    const isCorrect = JSON.stringify(response.order) === JSON.stringify(itemData.correctOrder);
    return { isCorrect, score: isCorrect ? 1 : 0, feedback: isCorrect ? 'Correct order!' : 'Not quite right.' };
  }

  _onDragStart(e, idx) {
    if (this._isRevealed) { e.preventDefault(); return; }
    this._dragSrcIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.setAttribute('aria-grabbed', 'true');
  }

  _onDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.renderRoot.querySelectorAll('.seq-item').forEach((el, i) => {
      el.classList.toggle('drag-over', i === idx && i !== this._dragSrcIdx);
    });
  }

  _moveItem(fromIdx, toIdx) {
    if (fromIdx === null || fromIdx === undefined || fromIdx === toIdx) return;
    const newOrder = [...this._order];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    this._order = newOrder;
    this.requestUpdate();
  }

  /** The Move up / Move down buttons: same _moveItem as drag and keyboard. */
  async _onMoveBtn(idx, delta) {
    const to = idx + delta;
    if (this._isRevealed || to < 0 || to >= this._order.length) return;
    const item = this._order[idx];
    this.renderRoot.querySelectorAll('.seq-item').forEach(el => el.setAttribute('aria-grabbed', 'false'));
    this._selectedIdx = null;
    this._moveItem(idx, to);
    A11yAnnouncer.announce(`${item.text?.en ?? item.id} moved to position ${to + 1} of ${this._order.length}`);
    await this.updateComplete;
    // Rows are reused by index, so keep keyboard focus on the item that moved.
    const row = this.renderRoot.querySelectorAll('.seq-item')[to];
    const btns = [...(row?.querySelectorAll('.seq-btn') ?? [])];
    const same = btns[delta < 0 ? 0 : 1];
    (same && !same.disabled ? same : btns.find(b => !b.disabled))?.focus({ preventScroll: true });
  }

  _onDrop(e, idx) {
    e.preventDefault();
    if (this._isRevealed) return;
    this._moveItem(this._dragSrcIdx, idx);
    this._dragSrcIdx = null;
  }

  _onDragEnd(e) {
    e.currentTarget.setAttribute('aria-grabbed', 'false');
    this.renderRoot.querySelectorAll('.seq-item').forEach(el => el.classList.remove('drag-over'));
    this._dragSrcIdx = null;
  }

  // Keyboard select-then-place
  _onKeyDown(e, idx) {
    // Enter/Space on a Move button belongs to the button, not to the row.
    if (this._isRevealed || e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (this._selectedIdx === null) {
        this._selectedIdx = idx;
        this.renderRoot.querySelectorAll('.seq-item')[idx]?.setAttribute('aria-grabbed', 'true');
      } else {
        this._moveItem(this._selectedIdx, idx);
        this.renderRoot.querySelectorAll('.seq-item').forEach(el => el.setAttribute('aria-grabbed', 'false'));
        this._selectedIdx = null;
      }
    } else if (e.key === 'Escape' && this._selectedIdx !== null) {
      e.preventDefault();
      this.renderRoot.querySelectorAll('.seq-item').forEach(el => el.setAttribute('aria-grabbed', 'false'));
      this._selectedIdx = null;
    }
  }

  /** Bank-preview: stem plus the items to be reordered, listed in authored
   *  (not shuffled) order — no drag handles, nothing scrambled. */
  _renderPreviewOnly() {
    return html`
      <div class="stem">${this._previewStemText()}</div>
      <ul class="sequence-list">
        ${(this._data.items || []).map(item => html`
          <li class="seq-item"><span class="item-text"><markdown-renderer inline .content=${item.text?.en ?? item.id}></markdown-renderer></span></li>
        `)}
      </ul>
    `;
  }

  renderInput() {
    if (!this._data) return html``;
    return html`
      <div class="seq-wrap">
      <ul class="sequence-list" role="list" aria-label="Reorder the items">
        ${this._order.map((item, idx) => {
          const verdict = this._isRevealed
            ? (item.id === this._data.correctOrder?.[idx] ? 'correct-mark' : 'incorrect-mark')
            : '';
          return html`
          <li
            class="seq-item ${verdict}"
            draggable="${!this._isRevealed}"
            tabindex="0"
            role="listitem"
            aria-grabbed="false"
            aria-label="${item.text?.en ?? item.id}, position ${idx + 1}"
            @dragstart=${e => this._onDragStart(e, idx)}
            @dragover=${e => this._onDragOver(e, idx)}
            @drop=${e => this._onDrop(e, idx)}
            @dragend=${e => this._onDragEnd(e)}
            @keydown=${e => this._onKeyDown(e, idx)}
          >
            <span class="drag-handle" aria-hidden="true">⠿</span>
            <span class="item-text"><markdown-renderer inline .content=${item.text?.en ?? item.id}></markdown-renderer></span>
            ${this._isRevealed ? '' : html`
              <span class="seq-moves">
                <button type="button" class="btn-3d btn-secondary seq-btn"
                  aria-label="Move up: ${item.text?.en ?? item.id}"
                  ?disabled=${idx === 0}
                  @click=${() => this._onMoveBtn(idx, -1)}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5 10 7l5.5 5.5"/></svg>
                </button>
                <button type="button" class="btn-3d btn-secondary seq-btn"
                  aria-label="Move down: ${item.text?.en ?? item.id}"
                  ?disabled=${idx === this._order.length - 1}
                  @click=${() => this._onMoveBtn(idx, 1)}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7.5 10 13l5.5-5.5"/></svg>
                </button>
              </span>
            `}
          </li>
        `;
        })}
      </ul>
      ${this._isRevealed
        ? html`<p class="keyboard-hint">This is the order you submitted.</p>`
        : html`
          <p class="keyboard-hint">Use the up and down buttons on each row to put the items in order.</p>
          <p class="keyboard-hint fine-pointer-hint">You can also drag a row, or use Tab, then Enter or Space, to pick and place items.</p>
        `}
      ${this._isRevealed ? html`
        <div class="correct-order-answer">
          <strong>Correct order:</strong> ${(this._data.correctOrder || [])
            .map(id => this._data.items?.find(i => i.id === id)?.text?.en ?? id)
            .map((text, idx) => html`${idx > 0 ? ' → ' : ''}<markdown-renderer inline .content=${text}></markdown-renderer>`)}
        </div>
      ` : ''}
      </div>
    `;
  }

  static get supportsHints() { return false; }
}

customElements.define('sequence-order-v1', SequenceOrder);
