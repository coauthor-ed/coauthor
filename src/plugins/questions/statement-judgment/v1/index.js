/**
 * statement-judgment@1 — True/False with optional correction.
 *
 * For each statement, student marks True or False.
 * When False is selected, a text field appears for the correction.
 * Scored: TF part is exact; correction part uses keyword heuristics.
 * (HLD Appendix C.11)
 */
import { QuestionBase } from '../../../../core/components/QuestionBase.js';
import { html, css } from 'lit';
import { A11yAnnouncer } from '../../../../core/A11yAnnouncer.js';
import '../../../../ui/components/MarkdownRenderer.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';

export class StatementJudgment extends QuestionBase {
  static styles = [btn3dStyles, feedbackAnimStyles, 
    QuestionBase.styles,
    css`
      .statements { display: flex; flex-direction: column; gap: 16px; }
      .stmt {
        border: 2px solid var(--border-color);
        border-radius: var(--radius-xs);
        padding: 14px;
        background: var(--bg-surface);
      }
      .stmt-text { margin-bottom: 10px; font-size: 1rem; color: var(--text-main); }
      .tf-group { display: flex; gap: 12px; margin-bottom: 8px; }
      .tf-btn {
        padding: 6px 18px;
        border: 2px solid var(--border-color);
        border-radius: var(--radius-xs);
        background: var(--bg-surface);
        color: var(--text-main);
        cursor: pointer;
        font-weight: var(--fw-medium);
        transition: all 0.15s;
      }
      .tf-btn.selected-true  { border-color: var(--success-text); background: var(--success-bg); color: var(--success-text); }
      .tf-btn.selected-false { border-color: var(--error-text); background: var(--error-bg); color: var(--error-text); }
      .tf-btn.correct-mark { border-color: var(--success-text); background: var(--success-bg); color: var(--success-text); }
      .tf-btn.incorrect-mark { border-color: var(--error-text); background: var(--error-bg); color: var(--error-text); }
      .answer-key {
        margin-top: 8px;
        padding: 8px 12px;
        background: var(--bg-surface);
        border: 1px solid var(--border-color);
        border-left: 4px solid var(--success-text);
        border-radius: var(--radius-xs);
        font-size: 0.85rem;
        line-height: 1.5;
      }
      .answer-key strong { color: var(--success-text); }
      .correction-area {
        margin-top: 8px;
        width: 100%;
        padding: 8px;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-xs);
        font-family: inherit;
        font-size: 0.95rem;
        background: var(--bg-surface);
        color: var(--text-main);
        resize: vertical;
      }
      .correction-label { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px; }
    `,
  ];

  static schema = {
    $id: 'statement-judgment@1',
    type: 'object',
    required: ['id', 'type', 'statements'],
    properties: {
      shuffle: { type: 'boolean' },
      statements: {
        type: 'array', minItems: 1,
        items: {
          type: 'object',
          required: ['id', 'text', 'isTrue'],
          properties: {
            id: { type: 'string' },
            text: { type: 'object', minProperties: 1 },
            isTrue: { type: 'boolean' },
            modelCorrection: { type: ['object', 'null'] },
          },
        },
      },
    },
  };

  init(data, prng, ctx) {
    this._data = data;
    const isPrng = prng && typeof prng.shuffle === 'function';
    this._ctx = isPrng ? (ctx || null) : (prng || null);
    this._prng = isPrng ? prng : null;

    // judgments: stmtId → { tfValue: true|false|null, correctionText: '' }
    this._judgments = {};
    (data.statements || []).forEach(s => {
      this._judgments[s.id] = { tfValue: null, correctionText: '' };
    });

    // Display order only — scoring (static score()) always walks
    // itemData.statements in authored order, keyed by s.id, so shuffling
    // this copy can't affect correctness.
    this._order = [...(data.statements || [])];
    if (data.shuffle !== false) this._shuffle();
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

  connectedCallback() { super.connectedCallback?.(); }
  disconnectedCallback() { super.disconnectedCallback?.(); }

  reset() { this.init(this._data, this._prng, this._ctx); this.requestUpdate(); }

  getResponse() { return { judgments: { ...this._judgments } }; }

  /**
   * QuestionBase's inherited getState()/setState() only round-trip `_value`
   * (a plain string), which this plugin never sets — the real answer lives
   * in `_judgments` (see getResponse()). Without these overrides, every
   * remount (Next/Previous, TestEngine.submit()'s headless scoring clone,
   * review) restarted from init()'s all-null judgments instead of what the
   * student actually picked, so True/False choices and corrections never
   * survived past the question they were entered on.
   */
  getState() { return { judgments: { ...this._judgments } }; }

  setState(s) {
    if (!s?.judgments) return;
    this._judgments = { ...this._judgments, ...s.judgments };
    // _judgments is a plain field, not a Lit reactive property — unlike
    // _setTf()/_setCorrection() (the live click/input handlers), this
    // assignment is invisible to Lit on its own, so the True/False buttons
    // keep showing unselected until something else forces a re-render.
    this.requestUpdate();
  }

  static score(itemData, response) {
    if (!response?.judgments) return { correct: false, score: 0, feedback: 'No answer.' };
    const stmts = itemData.statements || [];
    let totalWeight = 0;
    let earnedWeight = 0;

    stmts.forEach(s => {
      const j = response.judgments[s.id];
      if (!j) return;
      totalWeight += 1;

      const tfCorrect = j.tfValue === s.isTrue;
      if (s.isTrue) {
        // Correct=True: full point for correct TF
        if (tfCorrect) earnedWeight += 1;
      } else {
        // Correct=False: 0.5 for correct TF + 0.5 for correction
        if (tfCorrect) {
          earnedWeight += 0.5;
          if (s.modelCorrection) {
            const keywords = StatementJudgment._extractKeywords(s.modelCorrection.en || '');
            const matched = StatementJudgment._matchKeywords(j.correctionText || '', keywords);
            if (matched >= 1) earnedWeight += 0.5;
          } else {
            earnedWeight += 0.5;
          }
        }
      }
    });

    const score = totalWeight > 0 ? earnedWeight / totalWeight : 0;
    return {
      correct: null, // partial credit
      score,
      feedback: score >= 1 ? 'All correct!' : `Score: ${Math.round(score * 100)}%`,
    };
  }

  static _extractKeywords(text) {
    return text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3);
  }

  static _matchKeywords(response, keywords) {
    const lower = response.toLowerCase();
    return keywords.filter(kw => lower.includes(kw)).length;
  }

  _setTf(stmtId, value) {
    if (this._isRevealed) return;
    this._judgments = {
      ...this._judgments,
      [stmtId]: { ...this._judgments[stmtId], tfValue: value },
    };
    if (value === true) {
      A11yAnnouncer.announce('Marked True');
    } else {
      A11yAnnouncer.announce('Marked False — please provide the correction below');
    }
    this.requestUpdate();
  }

  _setCorrection(stmtId, text) {
    if (this._isRevealed) return;
    this._judgments = {
      ...this._judgments,
      [stmtId]: { ...this._judgments[stmtId], correctionText: text },
    };
  }

  /** Bank-preview: the statements themselves ARE the question here (there's
   *  no separate stem) — list them plainly, no True/False buttons or
   *  correction field. */
  _renderPreviewOnly() {
    return html`
      <div class="statements">
        ${(this._data?.statements || []).map(s => html`
          <div class="stmt"><div class="stmt-text"><markdown-renderer .content=${s.text?.en ?? s.id}></markdown-renderer></div></div>
        `)}
      </div>
    `;
  }

  renderInput() {
    if (!this._data) return html``;
    return html`
      <div class="statements">
        ${(this._order || this._data.statements || []).map(s => {
          const j = this._judgments[s.id];
          const trueClass = this._isRevealed
            ? (s.isTrue === true ? 'correct-mark' : (j.tfValue === true ? 'incorrect-mark' : ''))
            : (j.tfValue === true ? 'selected-true' : '');
          const falseClass = this._isRevealed
            ? (s.isTrue === false ? 'correct-mark' : (j.tfValue === false ? 'incorrect-mark' : ''))
            : (j.tfValue === false ? 'selected-false' : '');
          return html`
            <div class="stmt" role="group" aria-label="Statement: ${s.text?.en ?? s.id}">
              <div class="stmt-text"><markdown-renderer .content=${s.text?.en ?? s.id}></markdown-renderer></div>
              <div class="tf-group">
                <button
                  class="tf-btn ${trueClass}"
                  aria-pressed="${j.tfValue === true}"
                  ?disabled=${this._isRevealed}
                  @click=${() => this._setTf(s.id, true)}
                >True</button>
                <button
                  class="tf-btn ${falseClass}"
                  aria-pressed="${j.tfValue === false}"
                  ?disabled=${this._isRevealed}
                  @click=${() => this._setTf(s.id, false)}
                >False</button>
              </div>
              ${j.tfValue === false ? html`
                <div class="correction-label" id="corr-label-${s.id}">Write the corrected statement:</div>
                <textarea
                  class="correction-area"
                  rows="2"
                  aria-labelledby="corr-label-${s.id}"
                  .value=${j.correctionText}
                  ?readonly=${this._isRevealed}
                  @input=${e => this._setCorrection(s.id, e.target.value)}
                ></textarea>
              ` : ''}
              ${this._isRevealed ? html`
                <div class="answer-key">
                  <strong>Correct answer: ${s.isTrue ? 'True' : 'False'}.</strong>
                  ${s.isTrue === false && s.modelCorrection?.en ? html` <markdown-renderer inline .content=${s.modelCorrection.en}></markdown-renderer>` : ''}
                </div>
              ` : ''}
            </div>
          `;
        })}
      </div>
    `;
  }

  static get supportsHints() { return false; }
}

customElements.define('statement-judgment-v1', StatementJudgment);
