import { LitElement, html, css } from 'lit';
import '../../../../ui/components/MarkdownRenderer.js';
import { EventBus } from '../../../../core/EventBus.js';
import { ProgressiveDisclosureMixin, progressiveDisclosureStyles } from '../../../../core/mixins/ProgressiveDisclosureMixin.js';

/**
 * <poe-explain-v1> — Explain phase of the POE (Predict-Observe-Explain) cycle.
 *
 * Reveals the concept explanation, referencing the learner's own prediction
 * captured earlier in the sequence (via the 'poe:prediction-submitted' EventBus
 * event emitted by poe-predict-v1) per HighLevelDesign.md's POE description.
 *
 * Beats reveal progressively via ProgressiveDisclosureMixin (the same one
 * content-block@1 uses) rather than dumping the whole `prompt` markdown at
 * once — LessonEngine's Next/Prev already drive any mounted block generically
 * through `stepState()`/`advanceStep()`/`retreatStep()` (see its
 * `_consumeStep()`), so adopting the mixin is all that's needed; no
 * LessonEngine change required.
 */
export class PoeExplainPlugin extends ProgressiveDisclosureMixin(LitElement) {
  static properties = {
    _data:              { type: Object, state: true },
    _studentPrediction: { type: String,  state: true },
    _wasCorrect:        { type: Boolean, state: true },
  };

  static styles = [
    progressiveDisclosureStyles,
    css`
      :host {
        display: block;
        margin-bottom: 1.5rem;
        font-family: var(--font-family, system-ui, sans-serif);
      }
      .card {
        background: var(--bg-surface, #ffffff);
        border: 2px solid var(--primary-color, #6366f1);
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 4px 8px rgba(99, 102, 241, 0.1);
      }
      h3 {
        margin: 0 0 12px;
        color: var(--primary-text, #6366f1);
      }
      .recap {
        margin-bottom: 16px;
        padding: 12px 14px;
        background: var(--bg-card, #f8fafc);
        border-left: 4px solid var(--primary-color, #6366f1);
        border-radius: 6px;
        font-size: 0.9rem;
        color: var(--text-muted, #475569);
      }
      .recap strong { color: var(--text-main, #1e293b); }
      .recap .verdict.correct { color: var(--success-text, #00875a); font-weight: var(--fw-medium); }
      .recap .verdict.incorrect { color: var(--error-text, #de350b); font-weight: var(--fw-medium); }
    `,
  ];

  constructor() {
    super();
    this._data              = null;
    this._studentPrediction = '';
    this._wasCorrect        = null;
    this._handlePrediction  = this._handlePrediction.bind(this);
  }

  /** Plugin lifecycle. `ctx` (LessonEngine's per-mount `{ poe, blockIndex,
   *  initialStep, bundleId }`, see mountPlugin.js/LessonEngine.js's
   *  `_render()`) restores a resumed session's step position via
   *  `_initDisclosure()`, and — same fix as poe-observe-sim@1 — recalls a
   *  prediction from the immediately preceding poe-predict@1 block
   *  synchronously via `POEController.recall()`. The `poe:prediction-
   *  submitted` EventBus listener below can never catch this in practice:
   *  LessonEngine mounts one block at a time (`container.innerHTML = ''`
   *  between them), so by the time this block's `connectedCallback()`
   *  starts listening, the predict block is already gone and its event
   *  already fired. Kept as a harmless fallback for a caller that mounts
   *  this block without going through LessonEngine's ctx at all. */
  init(data, ctx) {
    if (!data || !data.prompt) {
      throw new Error("PoeExplain requires a 'prompt' payload.");
    }
    this._data = data;
    const prompt = data.prompt?.en ?? data.prompt;
    this._initDisclosure(prompt, data, ctx);

    const recalled = ctx?.poe?.recall(ctx?.blockIndex);
    if (recalled) {
      this._studentPrediction = recalled.predictionText || recalled.prediction || '';
      this._wasCorrect = !!recalled.isCorrect;
    }
  }

  connectedCallback() {
    super.connectedCallback();
    EventBus.on('poe:prediction-submitted', this._handlePrediction);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    EventBus.off('poe:prediction-submitted', this._handlePrediction);
  }

  _handlePrediction(payload) {
    this._studentPrediction = payload.predictionText || payload.prediction || '';
    this._wasCorrect = !!payload.isCorrect;
  }

  render() {
    if (!this._data) return html``;
    return html`
      <div class="card">
        <h3>Explain</h3>
        ${this._studentPrediction ? html`
          <div class="recap">
            <strong>You predicted:</strong> ${this._studentPrediction}
            ${this._wasCorrect !== null ? html`
              <span class="verdict ${this._wasCorrect ? 'correct' : 'incorrect'}">
                — ${this._wasCorrect ? 'correct!' : 'not quite.'}
              </span>
            ` : ''}
          </div>
        ` : ''}
        ${this._renderSteps()}
      </div>
    `;
  }
}

customElements.define('poe-explain-v1', PoeExplainPlugin);
