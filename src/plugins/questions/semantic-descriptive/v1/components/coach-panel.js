import { LitElement, html, css } from 'lit';
import { sdTokens, sdButtons } from '../styles.js';
import { scoreBlank } from 'core/evaluators/semanticSimilarityEvaluator.js';
import { blankInsideMath } from 'core/markdown/mathMask.js';
import { A11yAnnouncer } from 'core/A11yAnnouncer.js';
import { ErrorReporter } from 'core/ErrorReporter.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../../ui/sharedStyles.js';
import { brandIcon } from '../../../../../ui/components/LookSlots.js';
import '../../../../../ui/components/MarkdownRenderer.js';

/**
 * <sd-coach-panel> — one rubric row's tier 1 (nudge) / 1.5 (stronger clue) /
 * 2 (standalone fill-in-the-blank) scaffold, ported from coaching-poc-v5.html's
 * buildCoachPanel(). Owns its own level/pass state (scoped Lit properties,
 * not a shared `state.perQuestion[...]` object).
 */
export class CoachPanel extends LitElement {
  static properties = {
    rubricId: { type: String },
    rubricLabel: { type: String },
    level1: { type: String },
    clue: { type: String },
    level2Template: { type: String },
    accepted: { type: Array },
    embed: { attribute: false },
    thresholds: { attribute: false },
    _level: { state: true },
    _blankValue: { state: true },
    _checking: { state: true },
    _passed: { state: true },
    _feedback: { state: true },
  };

  static styles = [btn3dStyles, feedbackAnimStyles, 
    sdTokens,
    sdButtons,
    css`
      :host { display: block; }
      .sd-coach-panel { border-top: 3px solid rgba(0, 0, 0, 0.05); padding: 16px; background: rgba(0, 0, 0, 0.015); }
      .sd-coach-stage { font-family: monospace; font-size: 10px; color: var(--sd-indigo); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; font-weight: var(--fw-strong); }
      .sd-coach-text { font-size: 13.5px; font-weight: var(--fw-strong); margin-bottom: 10px; }
      .sd-blank-slot { display: inline-block; min-width: 60px; height: 1.1em; background: var(--sd-border); border-bottom: 4px solid var(--sd-ink-faint); border-radius: var(--radius-xs); vertical-align: middle; margin: 0 4px; }
      /* See chained-blank-builder.js's identical rule — a blank inside a
         $...$ span renders as one combined equation (blankInsideMath()),
         so there's no separate decorative box to style; a dashed outline
         around the whole typeset expression stands in for it instead. */
      .sd-blank-slot-inline { display: inline-block; margin: 0 4px; padding: 2px 8px; border-radius: var(--radius-sm); border: 2px dashed var(--sd-ink-faint); }
      .sd-blank-input {
        border: 3px solid var(--sd-border); border-radius: var(--radius-sm); padding: 9px 12px; font-size: 14px; font-weight: var(--fw-strong);
        font-family: var(--sd-font); width: min(300px, 100%); color: var(--sd-ink); background: var(--sd-card);
      }
      .sd-blank-input:focus { outline: none; border-color: var(--sd-indigo); }
      .sd-feedback { font-weight: var(--fw-heavy); font-size: 12.5px; margin-top: 8px; }
      .sd-feedback.pass { color: var(--sd-emerald); }
      .sd-feedback.retry { color: var(--sd-red-dark); }
    `,
  ];

  constructor() {
    super();
    this.rubricId = '';
    this.rubricLabel = '';
    this.level1 = '';
    this.clue = '';
    this.level2Template = '';
    this.accepted = [];
    this._level = 1;
    this._blankValue = '';
    this._checking = false;
    this._passed = false;
    this._feedback = '';
  }

  connectedCallback() {
    super.connectedCallback();
    // Opening "Need a hand?" already shows the level-1 nudge — that's the
    // first hint level used, same as the POC setting qs.coachLevel[r.id]=1 on open.
    A11yAnnouncer.announce(this.level1);
    this.dispatchEvent(new CustomEvent('sd-hint-shown', { detail: { rubricId: this.rubricId, level: 1 }, bubbles: true, composed: true }));
  }

  _advance(level) {
    this._level = level;
    A11yAnnouncer.announce(level === 1.5 ? this.clue : this.level2Template.replace('___', 'a blank'));
    this.dispatchEvent(new CustomEvent('sd-hint-shown', { detail: { rubricId: this.rubricId, level }, bubbles: true, composed: true }));
  }

  async _checkBlank() {
    const val = this._blankValue.trim();
    if (!val || this._checking) return;
    this._checking = true;
    let sim = 0;
    try {
      ({ sim } = await scoreBlank(this.embed, val, this.accepted));
    } catch (err) {
      this._checking = false;
      this._feedback = 'Something went wrong checking that — please try again.';
      ErrorReporter.reportError(err, { source: 'semantic-descriptive@1', phase: 'tier2-check', rubricId: this.rubricId });
      this.requestUpdate();
      return;
    }
    this._checking = false;
    if (sim >= this.thresholds.blank) {
      this._passed = true;
      this._feedback = `✓ That works! (${sim.toFixed(2)})`;
      A11yAnnouncer.announce(`Correct. ${this.rubricLabel} resolved.`);
    } else {
      this._feedback = `Not quite (${sim.toFixed(2)}) — think about the hints and try again.`;
    }
    this.dispatchEvent(new CustomEvent('sd-blank-checked', {
      detail: { rubricId: this.rubricId, passed: this._passed, sim },
      bubbles: true, composed: true,
    }));
  }

  render() {
    return html`
      <div class="sd-coach-panel">
        ${this._level === 1 ? html`
          <div class="sd-coach-stage">Nudge</div>
          <div class="sd-coach-text"><markdown-renderer inline .content=${this.level1}></markdown-renderer></div>
          <button class="sd-chip" @click=${() => this._advance(1.5)}>Still stuck? Bigger hint ${brandIcon('hint')}</button>
        ` : this._level === 1.5 ? html`
          <div class="sd-coach-stage">Stronger clue</div>
          <div class="sd-coach-text"><markdown-renderer inline .content=${this.clue}></markdown-renderer></div>
          <button class="sd-chip" @click=${() => this._advance(2)}>Still stuck? Try filling a blank ${brandIcon('write')}</button>
        ` : html`
          <div class="sd-coach-stage">Fill in the blank</div>
          <div class="sd-coach-text">
            ${blankInsideMath(this.level2Template) ? html`
              <span class="sd-blank-slot-inline" aria-hidden="true"><markdown-renderer inline .content=${this.level2Template.replace('___', '\\square')}></markdown-renderer></span>
            ` : html`
              <markdown-renderer inline .content=${this.level2Template.split('___')[0]}></markdown-renderer><span class="sd-blank-slot" aria-hidden="true"></span><markdown-renderer inline .content=${this.level2Template.split('___')[1] || ''}></markdown-renderer>
            `}
          </div>
          <input
            type="text"
            class="sd-blank-input"
            placeholder="Type your answer…"
            aria-label="Fill in the blank for ${this.rubricLabel}"
            .value=${this._blankValue}
            @input=${(e) => { this._blankValue = e.target.value; }}
            @keydown=${(e) => { if (e.key === 'Enter') this._checkBlank(); }}
            ?disabled=${this._passed}
          >
          <button class="sd-chip" style="margin-left:8px;" @click=${this._checkBlank} ?disabled=${this._passed || this._checking}>
            ${this._checking ? 'Checking…' : 'Check ✅'}
          </button>
          <div class="sd-feedback ${this._passed ? 'pass' : this._feedback ? 'retry' : ''}" role="status">${this._feedback}</div>
        `}
      </div>
    `;
  }
}

customElements.define('sd-coach-panel', CoachPanel);
