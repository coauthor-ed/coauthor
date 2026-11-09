import { LitElement, html, css } from 'lit';
import { classify } from 'core/evaluators/semanticSimilarityEvaluator.js';
import { sdTokens, sdButtons } from '../styles.js';
import './coach-panel.js';
import '../../../../../ui/components/SafeMathText.js';
import '../../../../../ui/components/MarkdownRenderer.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../../ui/sharedStyles.js';
import { brandIcon } from '../../../../../ui/components/LookSlots.js';
import { iconCheck, iconClose, iconInfo } from '../../../../../ui/icons/uiIcons.js';

function statusIcon(status, numericMismatch) {
  if (numericMismatch) return brandIcon('rubricNumeric', iconInfo);
  if (status === 'addressed') return brandIcon('rubricMet', iconCheck);
  return status === 'partial' ? brandIcon('rubricPartial', iconInfo) : brandIcon('rubricMissing', iconClose);
}
function statusTag(status, numericMismatch) {
  if (numericMismatch) return 'Check your arithmetic';
  return status === 'addressed' ? 'Nailed it' : status === 'partial' ? 'Almost' : 'Missing';
}

/**
 * <sd-rubric-checklist> — step 1 results, ported from coaching-poc-v5.html's
 * renderResults(). Student-authored quotes (`matchedSentence`) can contain
 * the student's own `$...$` LaTeX spans (a math-mode answer quoted back
 * verbatim by scoreFullAnswer's bestWin.text) — rendered through
 * <safe-math-text>, which escapes everything outside `$...$` spans itself
 * before it ever reaches innerHTML (unlike <markdown-renderer>/marked.js,
 * which passes raw inline HTML straight through by design — safe only for
 * author-authored content, not student free text), so a quote never reaches
 * innerHTML unsanitized (rule 6) while still rendering any equation instead
 * of showing raw LaTeX source.
 */
export class RubricChecklist extends LitElement {
  static properties = {
    rubric: { type: Array },
    answerSims: { type: Object },
    matchedSentence: { type: Object },
    numericMismatch: { type: Object },
    thresholds: { attribute: false },
    embed: { attribute: false },
    _coachOpen: { state: true },
  };

  static styles = [btn3dStyles, feedbackAnimStyles, 
    sdTokens,
    sdButtons,
    css`
      .sd-score-line { font-weight: var(--fw-black); font-size: 15px; color: var(--sd-ink-soft); margin-bottom: 16px; }
      .sd-score-line b { color: var(--sd-indigo); }
      .sd-rubric-row { border-radius: var(--radius-lg); margin-bottom: 12px; overflow: hidden; border: 3px solid var(--sd-border); background: var(--sd-card); }
      .sd-rubric-row.addressed { border-color: var(--success-text); background: var(--sd-emerald-soft); }
      .sd-rubric-row.partial, .sd-rubric-row.numeric-mismatch { border-color: var(--warn-text); background: var(--sd-amber-soft); }
      .sd-rubric-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; gap: 10px; flex-wrap: wrap; }
      .sd-rubric-left { display: flex; align-items: center; gap: 10px; }
      .sd-rubric-icon { font-size: 22px; }
      .sd-rubric-icon svg { width: 1em; height: 1em; }
      .sd-rubric-label { font-size: 14.5px; font-weight: var(--fw-heavy); }
      .sd-rubric-meta { display: flex; align-items: center; gap: 10px; }
      .sd-tag { font-size: 10.5px; font-weight: var(--fw-black); text-transform: uppercase; letter-spacing: 0.04em; padding: 4px 11px; border-radius: var(--radius-sm); }
      .sd-tag.addressed { background: var(--sd-emerald); color: var(--on-primary); }
      .sd-tag.partial, .sd-tag.numeric-mismatch { background: var(--sd-amber); color: var(--warn-text); }
      .sd-tag.missing { background: var(--sd-border); color: var(--sd-ink-soft); }
      .sd-sim-score { font-family: monospace; font-size: 10.5px; color: var(--sd-ink-faint); }
      .sd-matched-sentence { font-size: 13px; font-weight: var(--fw-strong); color: var(--sd-ink-soft); padding: 0 16px 14px 48px; font-style: italic; }
      .sd-mismatch-note { font-size: 12.5px; font-weight: var(--fw-strong); color: var(--warn-text); padding: 0 16px 14px 48px; }
      .sd-help-btn { margin: 0 16px 14px; }
    `,
  ];

  constructor() {
    super();
    this.rubric = [];
    this.answerSims = {};
    this.matchedSentence = {};
    this.numericMismatch = {};
    this._coachOpen = {};
  }

  _toggleCoach(rubricId) {
    this._coachOpen = { ...this._coachOpen, [rubricId]: !this._coachOpen[rubricId] };
  }

  /** Closes every open coach panel — a fresh <sd-coach-panel> mount on next open means fresh tier-2 state. */
  reset() {
    this._coachOpen = {};
  }

  render() {
    const addressedCount = this.rubric.filter((r) => classify(this.answerSims[r.id] ?? -1, this.thresholds) === 'addressed').length;
    return html`
      <div class="sd-score-line">🎯 <b>${addressedCount} / ${this.rubric.length}</b> rubric points nailed</div>
      ${this.rubric.map((r) => {
        const score = this.answerSims[r.id] ?? -1;
        const status = classify(score, this.thresholds);
        const quote = this.matchedSentence[r.id];
        // A numeric mismatch only ever applies to an otherwise-'missing'
        // point (see numbersConsistent()'s doc comment — the penalty always
        // lands well below `low`) — it's a *reason* for that verdict, not a
        // fourth tier alongside it, so it's only meaningful to check here
        // when status is already 'missing'.
        const isNumericMismatch = status === 'missing' && !!this.numericMismatch[r.id];
        const rowClass = isNumericMismatch ? 'numeric-mismatch' : status;
        return html`
          <div class="sd-rubric-row ${rowClass}">
            <div class="sd-rubric-head">
              <span class="sd-rubric-left">
                <span class="sd-rubric-icon" aria-hidden="true">${statusIcon(status, isNumericMismatch)}</span>
                <span class="sd-rubric-label"><markdown-renderer inline .content=${r.label}></markdown-renderer></span>
              </span>
              <span class="sd-rubric-meta">
                <span class="sd-sim-score">${score.toFixed(2)}</span>
                <span class="sd-tag ${rowClass}">${statusTag(status, isNumericMismatch)}</span>
              </span>
            </div>
            ${score > -1 && quote && (status !== 'missing' || isNumericMismatch) ? html`
              <div class="sd-matched-sentence">"<safe-math-text inline .content=${quote}></safe-math-text>"</div>
            ` : ''}
            ${isNumericMismatch ? html`
              <p class="sd-mismatch-note">Your approach here is right, but the number doesn't check out — look again at this step's calculation.</p>
            ` : ''}
            ${status !== 'addressed' ? html`
              <button
                class="sd-chip sd-help-btn"
                aria-expanded=${this._coachOpen[r.id] ? 'true' : 'false'}
                @click=${() => this._toggleCoach(r.id)}
              >${this._coachOpen[r.id] ? 'Hide help' : 'Need a hand? 🙋'}</button>
              ${this._coachOpen[r.id] ? html`
                <sd-coach-panel
                  .rubricId=${r.id}
                  .rubricLabel=${r.label}
                  .level1=${r.level1}
                  .clue=${r.clue}
                  .level2Template=${r.level2Template}
                  .accepted=${r.accepted}
                  .embed=${this.embed}
                  .thresholds=${this.thresholds}
                ></sd-coach-panel>
              ` : ''}
            ` : ''}
          </div>
        `;
      })}
    `;
  }
}

customElements.define('sd-rubric-checklist', RubricChecklist);
