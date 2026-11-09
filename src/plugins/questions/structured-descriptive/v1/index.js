/**
 * structured-descriptive@1 — Rubric-decomposed descriptive answer question.
 *
 * Two orthogonal modes:
 *   presentationMode: "split-inputs" | "single-input"
 *   evaluationMode:   "coached" | "assessed"
 *
 * Partial credit via per-rubric-point keyword matching (negation-aware).
 * Remedy scaffold shown inline when coached + low confidence.
 * (HLD Appendix C.12)
 */
import { QuestionBase } from '../../../../core/components/QuestionBase.js';
import { html, css } from 'lit';
import { A11yAnnouncer } from '../../../../core/A11yAnnouncer.js';
import { matchPoint } from './scoring.js';
import '../../../../ui/components/MarkdownRenderer.js';
import '../../../../ui/components/GuideHelp.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';
import { brandIcon } from '../../../../ui/components/LookSlots.js';

export class StructuredDescriptive extends QuestionBase {
  static styles = [btn3dStyles, feedbackAnimStyles, 
    QuestionBase.styles,
    css`
      .rp-group { margin-bottom: 16px; }
      .rp-label { font-weight: var(--fw-medium); font-size: 0.9rem; margin-bottom: 6px; color: var(--text-main); }
      textarea {
        width: 100%; box-sizing: border-box; padding: 10px; border: 2px solid var(--border-color);
        border-radius: var(--radius-xs); font-family: inherit; font-size: 0.95rem; resize: vertical;
        background: var(--bg-surface); color: var(--text-main);
        transition: border-color 0.15s;
      }
      textarea:focus { border-color: var(--primary-color); outline: none; }
      .single-textarea { min-height: 120px; }
      .remedy-box {
        background: var(--warn-bg); border: 1px solid var(--warn-text); border-radius: var(--radius-xs);
        padding: 12px; margin-top: 8px; color: var(--warn-text);
      }
      .remedy-title { font-size: 0.8rem; font-weight: var(--fw-medium); color: var(--warn-text); margin-bottom: 6px; }
      .submit-btn {
        margin-top: 12px; padding: 8px 20px;
        background: var(--primary-color); color: var(--on-primary);
        border: none; border-radius: var(--radius-xs); cursor: pointer; font-size: 0.9rem;
        transition: background 0.15s;
      }
      .submit-btn:hover { background: var(--primary-hover); }
      .disclaimer { font-size: 0.75rem; color: var(--text-muted); margin-top: 6px; }
    `,
  ];

  static schema = {
    $id: 'structured-descriptive@1',
    type: 'object',
    required: ['id', 'type', 'prompt', 'rubricPoints'],
    properties: {
      prompt: { type: 'object', minProperties: 1 },
      marks: { type: 'number' },
      presentationMode: { enum: ['split-inputs', 'single-input'] },
      evaluationMode: { enum: ['coached', 'assessed'] },
      rubricPoints: {
        type: 'array', minItems: 1,
        items: {
          type: 'object',
          required: ['id', 'weight', 'keywordPatterns'],
          properties: {
            id: { type: 'string' },
            weight: { type: 'number' },
            uiLabel: { type: 'object' },
            keywordPatterns: { type: 'array', items: { type: 'string' } },
            remedyScaffold: { type: 'object' },
          },
        },
      },
    },
  };

  init(data) {
    // Map prompt to stem so QuestionBase renders it using MarkdownRenderer
    const mappedData = { ...data, stem: data.prompt };
    super.init(mappedData);
    this._data = mappedData;
    this._presentationMode = data.presentationMode ?? 'split-inputs';
    this._evaluationMode = data.evaluationMode ?? 'assessed';
    this._texts = {}; // rpId → text
    this._singleText = '';
    this._submitted = false;
    this._pointResults = {}; // rpId → { confidence, remedyVisible }
    (data.rubricPoints || []).forEach(rp => { this._texts[rp.id] = ''; });
  }

  connectedCallback() { super.connectedCallback?.(); }
  disconnectedCallback() { super.disconnectedCallback?.(); }

  reset() { this.init(this._data); this.requestUpdate(); }

  getResponse() {
    if (this._presentationMode === 'split-inputs') {
      return { texts: { ...this._texts } };
    }
    return { singleText: this._singleText };
  }

  /** Overrides QuestionBase's default: this plugin tracks its own submit
   *  state (_submitted, via its own inline Submit button) independently of
   *  the inherited _isRevealed, which nothing here ever sets. */
  isAnswered() { return this._submitted; }

  /**
   * QuestionBase's inherited getState()/setState() only round-trip `_value`
   * (a plain string), which this plugin never sets — the real answer lives
   * in `_texts`/`_singleText` (see getResponse()), plus its own `_submitted`/
   * `_pointResults` local UI state. Without these overrides, every remount
   * (Next/Previous, TestEngine.submit()'s headless scoring clone, review)
   * restarted blank instead of restoring what the student actually typed
   * and had already submitted.
   */
  getState() {
    return {
      texts: { ...this._texts },
      singleText: this._singleText,
      submitted: this._submitted,
      pointResults: { ...this._pointResults },
    };
  }

  setState(s) {
    if (!s) return;
    this._texts = { ...this._texts, ...(s.texts || {}) };
    if (typeof s.singleText === 'string') this._singleText = s.singleText;
    this._submitted = !!s.submitted;
    this._pointResults = { ...(s.pointResults || {}) };
  }

  static score(itemData, response) {
    const rps = itemData.rubricPoints || [];
    const pm = itemData.presentationMode ?? 'split-inputs';
    let totalWeight = 0;
    let earnedWeight = 0;

    rps.forEach(rp => {
      const text = pm === 'split-inputs'
        ? (response?.texts?.[rp.id] ?? '')
        : (response?.singleText ?? '');
      totalWeight += rp.weight;
      const conf = matchPoint(text, rp.keywordPatterns);
      earnedWeight += conf * rp.weight;
    });

    const score = totalWeight > 0 ? earnedWeight / totalWeight : 0;
    return { correct: null, score, feedback: `Auto-graded score: ${Math.round(score * 100)}% (approximate)` };
  }

  _submit() {
    if (this._submitted) return;
    const rps = this._data?.rubricPoints || [];
    this._pointResults = {};
    let anyLow = false;

    rps.forEach(rp => {
      const text = this._presentationMode === 'split-inputs'
        ? this._texts[rp.id]
        : this._singleText;
      const conf = matchPoint(text, rp.keywordPatterns);
      const low = conf < 0.5;
      this._pointResults[rp.id] = { confidence: conf, remedyVisible: this._evaluationMode === 'coached' && low };
      if (low && this._evaluationMode === 'coached') anyLow = true;
    });

    if (!anyLow || this._evaluationMode === 'assessed') {
      this._submitted = true;
    }
    A11yAnnouncer.announce(anyLow && this._evaluationMode === 'coached'
      ? 'Some points need improvement. Please review the hints shown.'
      : 'Answer submitted.');
    this.requestUpdate();
  }

  renderInput() {
    if (!this._data) return html``;
    const rps = this._data.rubricPoints || [];

    return html`
      <div>
        ${this._presentationMode === 'split-inputs' ? html`
          ${rps.map((rp, i) => html`
            <div class="rp-group">
              <label class="rp-label" for="rp-input-${i}"><markdown-renderer inline .content=${rp.uiLabel?.en ?? `Point ${i + 1}`}></markdown-renderer></label>
              <textarea
                id="rp-input-${i}"
                rows="3"
                ?disabled=${this._submitted}
                .value=${this._texts[rp.id]}
                @input=${e => { this._texts = { ...this._texts, [rp.id]: e.target.value }; }}
                aria-label="${rp.uiLabel?.en ?? `Rubric point ${i + 1}`}"
              ></textarea>
              ${this._pointResults[rp.id]?.remedyVisible ? html`
                <div class="remedy-box" role="alert">
                  <div class="remedy-title">${brandIcon('hint')} Hint for this point</div>
                  <div><markdown-renderer inline .content=${rp.remedyScaffold?.prompt?.en ?? 'Review this concept and try again.'}></markdown-renderer></div>
                </div>
              ` : ''}
            </div>
          `)}
        ` : html`
          <textarea
            class="single-textarea"
            rows="6"
            ?disabled=${this._submitted}
            .value=${this._singleText}
            @input=${e => { this._singleText = e.target.value; }}
            aria-label="${this._data.prompt?.en ?? 'Your answer'}"
          ></textarea>
        `}
        ${!this._submitted ? html`
          <button class="submit-btn" @click=${() => this._submit()}>
            ${this._evaluationMode === 'coached' ? 'Check & Submit' : 'Submit'}
          </button>
        ` : ''}
        <p class="disclaimer">Note: This is auto-graded using keyword matching and may be approximate. A parent or teacher may review.</p>
        <guide-help slug="answering-descriptive-questions" label="How answers are checked"></guide-help>
      </div>
    `;
  }

  static get supportsHints() { return false; }
}

customElements.define('structured-descriptive-v1', StructuredDescriptive);
