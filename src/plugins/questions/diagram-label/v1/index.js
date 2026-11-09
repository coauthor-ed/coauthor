import { html, css } from 'lit';
import { QuestionBase } from '../../../../core/components/QuestionBase.js';
import { CourseSourceManager } from '../../../../core/CourseSourceManager.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';

export class DiagramLabelPlugin extends QuestionBase {
  // renderInput() already renders data.image itself (with the label
  // dropdowns overlaid) — without this, QuestionBase's generic render()
  // additionally renders a second, plain copy of the same image beside it.
  static rendersOwnMedia = true;

  static styles = [btn3dStyles, feedbackAnimStyles, 
    QuestionBase.styles,
    css`
      .diagram-container {
        position: relative;
        width: 100%;
        max-width: 700px;
        margin: 1rem auto;
      }
      .diagram-image {
        display: block;
        width: 100%;
        height: auto;
        border-radius: var(--radius-xs);
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .label-dropdown {
        position: absolute;
        transform: translate(-50%, -50%);
        background: var(--bg-surface);
        border: 2px solid var(--primary-color);
        border-radius: var(--radius-xs);
        padding: 4px;
        font-size: 0.9rem;
        color: var(--text-main);
        box-shadow: 0 4px 6px rgba(0,0,0,0.2);
        cursor: pointer;
        z-index: 10;
        outline: none;
      }
      .label-dropdown:focus {
        border-color: var(--primary-hover);
        box-shadow: 0 0 0 3px rgba(59,130,246,0.3);
      }
      .label-dropdown.correct {
        border-color: var(--success-text);
        background: var(--success-bg);
        color: var(--success-text);
      }
      .label-dropdown.incorrect {
        border-color: var(--error-text);
        background: var(--error-bg);
        color: var(--error-text);
      }
      .pin-point {
        position: absolute;
        width: 12px;
        height: 12px;
        background: var(--primary-color);
        border: 2px solid white;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 9;
      }
    `
  ];

  constructor() {
    super();
    this._answers = {}; // { hotspotId: selectedLabelId }
  }

  getState() {
    return { answers: { ...this._answers }, value: { ...this._answers } };
  }

  setState(state) {
    if (!state) return;
    if (state.answers) {
      this._answers = { ...state.answers };
    } else if (state.value && typeof state.value === 'object') {
      this._answers = { ...state.value };
    }
    this.requestUpdate();
  }

  _handleSelect(hotspotId, e) {
    this._answers = { ...this._answers, [hotspotId]: e.target.value };
    this.requestUpdate();
    import('../../../../core/EventBus.js').then(({ EventBus }) => {
      EventBus.emit('question:interaction', { id: this._data?.id });
    });
  }

  getResponse() {
    return this._answers;
  }

  static score(data, response) {
    const hotspots = data.hotspots || [];
    const total = hotspots.length;
    if (total === 0) return { isCorrect: true, score: 1, feedback: "No labels required." };

    let correctCount = 0;
    
    // Check if the user has answered all
    const answeredCount = Object.keys(response || {}).filter(k => response[k]).length;
    if (answeredCount < total) {
      return { 
        isCorrect: false, 
        score: 0, 
        feedback: "Please select a label for all parts of the diagram."
      };
    }

    hotspots.forEach(h => {
      if (response[h.id] === h.expectedLabelId) {
        correctCount++;
      }
    });

    const isCorrect = correctCount === total;
    const score = correctCount / total;

    let feedback = "";
    if (isCorrect) {
      feedback = "Excellent! You identified all parts correctly.";
    } else if (score > 0) {
      feedback = `You got ${correctCount} out of ${total} correct. Keep trying!`;
    } else {
      feedback = "None of the labels are correct. Review the material and try again.";
    }

    return { isCorrect, score, feedback };
  }

  /** Bank-preview: this type has no separate stem — the diagram itself is
   *  the question — so show it plainly, with no label dropdowns or pins. */
  _renderPreviewOnly() {
    const src = CourseSourceManager.resolveRef(this._data.image?.src || this._data.imageUrl, this._ctx?.bundleId);
    const alt = this._data.image?.alt || 'Diagram';
    return html`
      <div class="diagram-container"><img class="diagram-image" src="${src}" alt="${alt}"></div>
    `;
  }

  renderInput() {
    const src = CourseSourceManager.resolveRef(this._data.image?.src || this._data.imageUrl, this._ctx?.bundleId);
    const alt = this._data.image?.alt || "Interactive diagram";
    const labels = this._data.labels || [];
    const hotspots = this._data.hotspots || [];
    
    // If evaluated, style the dropdowns based on correctness
    const isEvaluated = this._isRevealed;

    return html`
      <div class="diagram-container">
        <img class="diagram-image" src="${src}" alt="${alt}">
        
        ${hotspots.map(h => {
          let statusClass = '';
          if (isEvaluated) {
             const isMatch = this._answers[h.id] === h.expectedLabelId;
             statusClass = isMatch ? 'correct' : 'incorrect';
          }
          const currentVal = this._answers[h.id] || '';
          
          return html`
            <div class="pin-point" style="left: ${h.x * 100}%; top: ${h.y * 100}%;"></div>
            <select 
              class="label-dropdown ${statusClass}" 
              style="left: ${h.x * 100}%; top: calc(${h.y * 100}% + 24px);"
              .value="${currentVal}"
              @change="${(e) => this._handleSelect(h.id, e)}"
              ?disabled="${isEvaluated}"
            >
              <option value="" disabled ?selected="${!currentVal}">Select label...</option>
              ${labels.map(l => html`
                <option value="${l.id}" ?selected="${currentVal === l.id}">
                  ${l.text?.en || l.text}
                </option>
              `)}
            </select>
          `;
        })}
      </div>
    `;
  }
}

customElements.define('diagram-label-v1', DiagramLabelPlugin);
