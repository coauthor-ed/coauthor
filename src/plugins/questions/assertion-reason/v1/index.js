/**
 * assertion-reason@1 — CBSE-style Assertion/Reason question.
 *
 * Student is shown two labeled statements — Assertion (A) and Reason (R) —
 * and picks which of the standard relationship options holds between them.
 * Subclasses mcq-single@2 to reuse its option list, scoring, feedback
 * banner, explanation box, and companion image/simulation/graph support;
 * only the lead-in (stem) rendering and the option set differ.
 */
import { MCQSingle } from '../../mcq-single/v2/index.js';
import { html, css } from 'lit';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';

// Canonical CBSE option text — never authored per-question. This is the
// point of this plugin over authoring the same thing via mcq-single@2
// directly: fixed, correctly-worded options every time, letters (a)-(d/e)
// in the order CBSE students already expect.
const STANDARD_4 = [
  { id: 'a', text: { en: 'Both Assertion (A) and Reason (R) are true, and R is the correct explanation of A.' } },
  { id: 'b', text: { en: 'Both Assertion (A) and Reason (R) are true, but R is NOT the correct explanation of A.' } },
  { id: 'c', text: { en: 'Assertion (A) is true, but Reason (R) is false.' } },
  { id: 'd', text: { en: 'Assertion (A) is false, but Reason (R) is true.' } },
];
const OPTION_SETS = {
  standard4: STANDARD_4,
  standard5: [...STANDARD_4, { id: 'e', text: { en: 'Both Assertion (A) and Reason (R) are false.' } }],
};

export class AssertionReason extends MCQSingle {
  static schema = {
    $id: 'assertion-reason@1',
    type: 'object',
    required: ['id', 'type', 'assertion', 'reason', 'correctOptionId'],
    properties: {
      id: { type: 'string' },
      type: { const: 'assertion-reason@1' },
      assertion: { type: 'object' }, // { en: "..." }
      reason: { type: 'object' },    // { en: "..." }
      optionSet: { enum: ['standard4', 'standard5'] }, // default "standard4"
      correctOptionId: { enum: ['a', 'b', 'c', 'd', 'e'] },
      // Optional per-letter feedback shown in the banner when that option is
      // picked (mirrors mcq-single@2's per-option `feedback`) — e.g. picking
      // "c" (A true, R false) points at the specific misconception that R is
      // actually true, rather than the generic "Incorrect." fallback.
      optionFeedback: { type: 'object' }, // { a?: {en}, b?: {en}, c?: {en}, d?: {en}, e?: {en} }
      explanation: { type: 'object' }, // optional, { en: "..." }
      image: { type: 'object' },
      simulation: { type: 'object' },
      graph: { type: 'object' },
    },
  };

  static styles = [btn3dStyles, feedbackAnimStyles, 
    MCQSingle.styles,
    css`
      .ar-stem { margin-bottom: 1.1rem; }
      .ar-item { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
      .ar-item:last-child { margin-bottom: 0; }
      .ar-tag {
        flex-shrink: 0;
        font-weight: var(--fw-heavy);
        font-size: 0.8rem;
        letter-spacing: 0.3px;
        padding: 3px 10px;
        border-radius: var(--radius-pill);
        background: var(--primary-light);
        color: var(--primary-text);
        white-space: nowrap;
      }
      .ar-text { flex: 1; font-size: 1.05rem; font-weight: var(--fw-medium); line-height: 1.4; color: var(--text-main); }
    `,
  ];

  init(data, prng, ctx) {
    if (!data || !data.assertion || !data.reason || !data.correctOptionId) {
      throw new Error("AssertionReason requires 'assertion', 'reason', and 'correctOptionId'.");
    }
    // Map, not mutate — OPTION_SETS entries are shared module-level constants
    // reused across every question instance, so merging optionFeedback in
    // must produce new option objects rather than write onto the canonical
    // ones.
    const baseOptions = OPTION_SETS[data.optionSet] || OPTION_SETS.standard4;
    const options = baseOptions.map(opt => {
      const feedback = data.optionFeedback?.[opt.id];
      return feedback ? { ...opt, feedback } : opt;
    });
    // `stem` is required by MCQSingle.init() but never rendered (_renderStem
    // is overridden below) — an empty placeholder just satisfies the guard.
    // shuffle is always off: the whole point of the fixed lettered option
    // set is that students already know "(a) = both true, R explains A" —
    // shuffling would break that convention rather than test the content.
    super.init({ ...data, stem: { en: '' }, options, shuffle: false }, prng, ctx);
  }

  /** MCQSingle.score() (inherited, not overridden otherwise) reads
   *  `itemData.options` — this type never authors that field directly (see
   *  init() above, which synthesizes it from `optionSet` at mount time). A
   *  composite type like comprehension-set@1 calls `Ctor.score(item.question,
   *  response)` with the RAW authored JSON, never a mounted instance's own
   *  post-init() `_data` — so without this override, `itemData.options` is
   *  undefined there and scoring would throw/silently fail. Mirrors init()'s
   *  own options-derivation exactly, so a nested assertion-reason@1 scores
   *  identically to a live top-level one. */
  static score(itemData, response) {
    const baseOptions = OPTION_SETS[itemData?.optionSet] || OPTION_SETS.standard4;
    const options = baseOptions.map(opt => {
      const feedback = itemData?.optionFeedback?.[opt.id];
      return feedback ? { ...opt, feedback } : opt;
    });
    return super.score({ ...itemData, options }, response);
  }

  _renderStem() {
    return html`
      <div class="ar-stem">
        <div class="ar-item">
          <span class="ar-tag">Assertion (A)</span>
          <div class="ar-text"><markdown-renderer .content="${this._data.assertion?.en || this._data.assertion}"></markdown-renderer></div>
        </div>
        <div class="ar-item">
          <span class="ar-tag">Reason (R)</span>
          <div class="ar-text"><markdown-renderer .content="${this._data.reason?.en || this._data.reason}"></markdown-renderer></div>
        </div>
      </div>
    `;
  }
}

customElements.define('assertion-reason-v1', AssertionReason);
