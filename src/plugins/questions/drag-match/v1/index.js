import { LitElement, html, css } from 'lit';
import { EventBus } from '../../../../core/EventBus.js';
import { btn3dStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';
import '../../../../core/components/QuestionExplanation.js';
import '../../../../ui/components/MarkdownRenderer.js';

/**
 * <drag-match-v1> — plugin entry for drag-match@1.
 *
 * Generic labeled-tile drag-and-drop matching: drag each `draggables[]`
 * tile onto the `targets[]` row it belongs to, scored against each
 * target's own `correctDraggableId`. Nothing here is subject-specific -
 * matching a term to a definition, an event to a date, a molecule name to
 * its structure, all use the exact same mechanism, just different label
 * text.
 *
 * Named `molecule-drag-match@1` until 2026-09-08 - that name stuck from
 * this type's first use case (matching molecule names to structures) even
 * though the implementation itself was always generic. Renamed for
 * clarity; `molecule-drag-match/v1/index.js` is now a thin backward-compat
 * alias (same class, registered under the old custom-element tag too) so
 * already-authored content referencing the old type string keeps loading
 * without a content migration.
 */
export class DragMatch extends LitElement {
  static get properties() {
    return {
      _data: { type: Object, state: true },
      _placements: { type: Object, state: true }, // { targetId: draggableId }
      _isRevealed: { type: Boolean, state: true }
    };
  }

  static get styles() {
    return [btn3dStyles, feedbackAnimStyles, css`
      :host {
        display: block;
        font-family: var(--font-family, system-ui, sans-serif);
      }
      .stem {
        font-size: 1.1rem;
        font-weight: 500;
        margin-bottom: 16px;
        color: var(--text-main);
      }

      .pool {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        min-height: 60px;
        padding: 16px;
        background: var(--bg-base);
        border: 2px dashed var(--border-color);
        border-radius: var(--radius-xs);
        margin-bottom: 24px;
      }
      .draggable {
        padding: 8px 16px;
        background: var(--bg-surface);
        border: 1px solid var(--border-hover);
        color: var(--text-main);
        border-radius: var(--radius-xs);
        cursor: grab;
        user-select: none;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
        transition: transform 0.1s, box-shadow 0.1s;
      }
      .draggable:active {
        cursor: grabbing;
        transform: scale(1.05);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.25);
      }
      .draggable[disabled] {
        cursor: not-allowed;
        opacity: 0.6;
        box-shadow: none;
      }

      .targets-container {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .target-row {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px;
        background: var(--bg-surface);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-xs);
      }
      .target-label {
        flex: 1;
        font-size: 1rem;
        color: var(--text-main);
      }
      .drop-zone {
        width: 150px;
        min-height: 42px;
        border: 2px dashed var(--border-hover);
        border-radius: var(--radius-xs);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-base);
        transition: background 0.2s, border-color 0.2s;
      }
      .drop-zone.drag-over {
        background: var(--success-bg);
        border-color: var(--success-text);
      }
      .drop-zone .draggable {
        margin: 0;
        width: 100%;
        text-align: center;
        box-sizing: border-box;
      }

      .feedback {
        margin-top: 16px;
        padding: 12px;
        border-radius: var(--radius-xs);
        font-size: 0.95rem;
      }
      .feedback.correct {
        background: var(--success-bg);
        color: var(--success-text);
        border: 1px solid var(--success-text);
      }
      .feedback.incorrect {
        background: var(--error-bg);
        color: var(--error-text);
        border: 1px solid var(--error-text);
      }
    `];
  }

  constructor() {
    super();
    this._data = null;
    this._placements = {};
    this._isRevealed = false;
    this._ctx = null;
  }

  init(data, prng, ctx) {
    this._data = data;
    this._placements = {};
    const isPrng = prng && typeof prng.shuffle === 'function';
    this._ctx = isPrng ? (ctx || null) : (prng || null);
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  getState() {
    return { placements: this._placements };
  }

  setState(state) {
    if (state && state.placements) {
      this._placements = { ...state.placements };
    }
  }

  getResponse() {
    return this._placements;
  }

  /** This plugin doesn't extend QuestionBase — `_isRevealed` here is its
   *  own property (same name as QuestionBase's, unrelated), flipped inside
   *  its own evaluate(). */
  isAnswered() { return this._isRevealed; }

  static score(itemData, response) {
    const placements = response || {};
    let correctCount = 0;
    const totalTargets = itemData.targets.length;

    for (const target of itemData.targets) {
      if (placements[target.id] === target.correctDraggableId) {
        correctCount++;
      }
    }

    const isCorrect = correctCount === totalTargets;
    const score = isCorrect ? 1 : 0; // Simple strict scoring for now

    return {
      isCorrect,
      score,
      feedback: isCorrect ? itemData.correctFeedback : itemData.incorrectFeedback
    };
  }

  evaluate() {
    this._isRevealed = true;
    const result = DragMatch.score(this._data, this._placements);
    this.requestUpdate();
    return result;
  }

  // Drag and drop handlers
  _onDragStart(e, draggableId) {
    if (this._isRevealed) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', draggableId);
    e.dataTransfer.effectAllowed = 'move';
  }

  _onDragOver(e) {
    if (this._isRevealed) return;
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
  }

  _onDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  }

  _onDropOnTarget(e, targetId) {
    if (this._isRevealed) return;
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const draggableId = e.dataTransfer.getData('text/plain');
    if (!draggableId) return;

    // Check if the draggable is already in another target, if so remove it
    const newPlacements = { ...this._placements };
    for (const [tId, dId] of Object.entries(newPlacements)) {
      if (dId === draggableId) {
        delete newPlacements[tId];
      }
    }

    newPlacements[targetId] = draggableId;
    this._placements = newPlacements;

    EventBus.emit('question:interaction', { id: this._data?.id });
  }

  _onDropOnPool(e) {
    if (this._isRevealed) return;
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const draggableId = e.dataTransfer.getData('text/plain');
    if (!draggableId) return;

    // Remove from any target
    const newPlacements = { ...this._placements };
    let changed = false;
    for (const [tId, dId] of Object.entries(newPlacements)) {
      if (dId === draggableId) {
        delete newPlacements[tId];
        changed = true;
      }
    }

    if (changed) {
      this._placements = newPlacements;
      EventBus.emit('question:interaction', { id: this._data?.id });
    }
  }

  render() {
    if (!this._data) return html``;

    // Bank-preview: stem plus the labels to be matched, no drag targets.
    if (this._ctx?.previewOnly) {
      return html`
        <div class="stem"><markdown-renderer .content=${this._data.stem?.en || this._data.stem}></markdown-renderer></div>
        <div class="pool">
          ${(this._data.draggables || []).map(d => html`<div class="draggable"><markdown-renderer inline .content=${d.label?.en || d.label}></markdown-renderer></div>`)}
        </div>
      `;
    }

    // Determine which draggables are in the pool
    const placedDraggableIds = Object.values(this._placements);
    const poolDraggables = this._data.draggables.filter(d => !placedDraggableIds.includes(d.id));

    let feedbackTemplate = '';
    if (this._isRevealed) {
      const result = DragMatch.score(this._data, this._placements);
      if (result.feedback) {
        feedbackTemplate = html`
          <div class="feedback ${result.isCorrect ? 'correct' : 'incorrect'}">
            <markdown-renderer inline .content=${result.feedback?.en || result.feedback}></markdown-renderer>
          </div>
        `;
      }
    }

    const renderDraggable = (d) => html`
      <div
        class="draggable"
        draggable=${this._isRevealed ? "false" : "true"}
        ?disabled=${this._isRevealed}
        @dragstart=${(e) => this._onDragStart(e, d.id)}
      >
        <markdown-renderer inline .content=${d.label?.en || d.label}></markdown-renderer>
      </div>
    `;

    return html`
      <div class="stem"><markdown-renderer .content=${this._data.stem?.en || this._data.stem}></markdown-renderer></div>

      <div
        class="pool"
        @dragover=${this._onDragOver}
        @dragleave=${this._onDragLeave}
        @drop=${this._onDropOnPool}
      >
        ${poolDraggables.length === 0 ? html`<span style="color:var(--text-muted);margin:auto;">All items placed</span>` : ''}
        ${poolDraggables.map(d => renderDraggable(d))}
      </div>

      <div class="targets-container">
        ${this._data.targets.map(target => {
          const placedId = this._placements[target.id];
          const placedItem = placedId ? this._data.draggables.find(d => d.id === placedId) : null;

          return html`
            <div class="target-row">
              <div class="target-label"><markdown-renderer inline .content=${target.label?.en || target.label}></markdown-renderer></div>
              <div
                class="drop-zone"
                @dragover=${this._onDragOver}
                @dragleave=${this._onDragLeave}
                @drop=${(e) => this._onDropOnTarget(e, target.id)}
              >
                ${placedItem ? renderDraggable(placedItem) : ''}
              </div>
            </div>
          `;
        })}
      </div>

      ${feedbackTemplate}
      <question-explanation
        .explanation=${this._data.explanation}
        .explanationSlide=${this._data.explanationSlide}
        .bundleId=${this._ctx?.bundleId}
        ?revealed=${this._isRevealed}
      ></question-explanation>
    `;
  }
}

customElements.define('drag-match-v1', DragMatch);
