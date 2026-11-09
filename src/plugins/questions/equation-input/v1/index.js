import { LitElement, html, css } from 'lit';
import { EventBus } from '../../../../core/EventBus.js';
import '../../../../ui/components/MarkdownRenderer.js';
import '../../../../ui/components/GuideHelp.js';
import '../../../../core/components/FeedbackBanner.js';
import '../../../../core/components/QuestionExplanation.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';

/**
 * <equation-input-v1> — LaTeX math equation entry question plugin.
 *
 * Lazily loads heavy vendors (compute-engine, mathlive) only when init() is
 * called — satisfying the platform's no-eager-vendor-load invariant.
 */
export class EquationInputPlugin extends LitElement {
  static properties = {
    _data:   { type: Object, state: true },
    _value:  { type: String, state: true },
    _result: { type: Object, state: true },
  };

  static styles = [btn3dStyles, feedbackAnimStyles, css`
    :host {
      display: block;
      font-family: system-ui, sans-serif;
      margin-bottom: 2rem;
      color: var(--text-main);
    }
    .container {
      border: 2px solid var(--border-color);
      border-radius: var(--radius-xs);
      background: var(--bg-surface);
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(9, 30, 66, 0.05);
    }
    .prompt {
      padding: 16px 20px;
      font-size: 1.1rem;
      font-weight: 500;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-base);
    }
    .input-section { padding: 20px; }
    /* math-field is a form-associated custom element — Chromium ships it a
       default UA stylesheet (:host { color: fieldtext; background-color:
       field; }, both CSS4 system-color keywords tied to the OS/browser's
       own color scheme, not this app's [data-theme] toggle). An *explicit*
       declaration on the element beats an *inherited* one regardless of
       origin, so :host{color:var(--text-main)} above never reaches it —
       only overriding color here, the same way background already is,
       fixes it. Otherwise the typed math renders black-on-black in dark
       theme. */
    math-field {
      width: 100%;
      /* border-box: width 100% plus the padding and border below overflowed
         .input-section, and .container's overflow:hidden cut off the right
         edge (the keyboard toggle sat on the cut). */
      box-sizing: border-box;
      font-size: 1.4rem;
      padding: 12px;
      border: 2px solid var(--border-hover);
      border-radius: var(--radius-xs);
      background: var(--bg-surface);
      color: var(--text-main);
      transition: border-color 0.2s;
      /* MathLive's "you're inside this group" highlight (the whole fraction
         box, shown while the caret is in its denominator) and its text-
         selection highlight both default to a pale, fixed-lightness tint
         meant for a white field (mathlive.js's .ML__container rule:
         --_contains-highlight-background-color: var(--contains-highlight-background-color,
         hsl(var(--_hue), 40%, 95%)) — 95% lightness regardless of theme).
         .ML__container re-declares the underscore-prefixed internal name
         itself, so overriding *that* from out here has no effect — it only
         ever reads its own *public*, non-prefixed counterpart (no leading
         underscore, no ML__ prefix), which is what these set. Selection
         background needs its paired text color overridden too, since that
         one's fallback is a hardcoded black meant to sit on the same pale
         default — left alone, dark-theme's dark selection background would
         pair with black-on-black text same as the highlight bug did. */
      --contains-highlight-background-color: var(--primary-light);
      --selection-background-color: var(--primary-light);
      --selection-color: var(--text-main);
    }
    .type-help { margin-top: 6px; }
    math-field:focus-within {
      border-color: var(--primary-color);
      outline: none;
    }
    }
  `];

  constructor() {
    super();
    this._data   = null;
    this._value  = '';
    this._result = null;
    this._ce     = null;  // ComputeEngine instance, set after lazy load
    this._ctx    = null;
  }

  async init(data, prng, ctx) {
    if (!data?.expected) throw new Error("EquationInput requires 'expected' math expression.");
    this._data = data;
    // Same duck-typed arg2-is-ctx-or-prng detection QuestionBase.js/
    // mcq-single@2 use — LessonEngine passes a single trailing ctx arg,
    // TestEngine passes both.
    const isPrng = prng && typeof prng.shuffle === 'function';
    this._ctx = isPrng ? (ctx || null) : (prng || null);
    // Bank-preview: no math-field, so no compute-engine/mathlive to load.
    if (this._ctx?.previewOnly) return;
    // Lazy-load heavy vendors only when this plugin is actually mounted
    const [{ ComputeEngine }] = await Promise.all([
      import('vendor/compute-engine.js'),
      import('vendor/mathlive.js'),
    ]);
    this._ce = new ComputeEngine();
  }

  /** The on-screen math keyboard (math-virtual-keyboard-policy="auto") is a
   *  single global singleton MathLive attaches to `window`, shared by every
   *  `<math-field>` on the page — it does not belong to this element and
   *  isn't torn down with it automatically. TestEngine/LessonEngine replace
   *  this element's container wholesale on Next/Previous (`container.innerHTML
   *  = ''`), an abrupt removal with no ordinary blur event for MathLive to
   *  react to, so without this the keyboard stays open over the next
   *  question. Only one question is ever mounted at a time in this app, so
   *  hiding unconditionally on disconnect is always correct here. */
  disconnectedCallback() {
    super.disconnectedCallback();
    window.mathVirtualKeyboard?.hide();
  }

  getState()  { return { value: this._value }; }

  /** Restoring a saved/resumed answer needs to reach the live `<math-field>`
   *  imperatively — see the note on the template's `math-field` below for
   *  why it is never bound there. `updateComplete` covers the case where
   *  `setState()` runs immediately after mount (TestEngine.renderCurrentQuestion
   *  calls it right after `mountPlugin()`, before this element's first render
   *  has happened), not just a later resume. */
  setState(s) {
    if (s?.value === undefined) return;
    this._value = s.value;
    this.updateComplete.then(() => {
      const mf = this.shadowRoot?.querySelector('math-field');
      if (mf && mf.value !== this._value) mf.value = this._value;
    });
  }

  _handleInput(e) {
    this._value = e.target.value;
    EventBus.emit('interaction:question', { questionId: this._data.id, state: this.getState() });
  }

  /** This plugin has no boolean answered-state flag — _result is only ever
   *  set once graded (inside evaluate() below), which is the equivalent
   *  signal. */
  isAnswered() { return !!this._result; }

  /** Required response method — a nested composite type (e.g.
   *  comprehension-set@1) resolves this plugin's own registered class and
   *  calls `static score(itemData, response)` directly on it, no instance
   *  involved at all; without this, that path had nothing to pass in. */
  getResponse() {
    return { value: this._value };
  }

  /** The actual parse-and-compare, factored out so both a live evaluate()
   *  (reusing the already-loaded `this._ce`, no re-import needed) and the
   *  headless static score() below (which has no instance/`this._ce` to
   *  reuse) produce an identical verdict off the same one code path. */
  static _compare(ce, expected, value) {
    if (!value) return { score: 0, isCorrect: false, feedback: 'Unattempted (Incorrect).' };
    try {
      const student = ce.parse(value);
      const expectedParsed = ce.parse(expected);
      const isCorrect = student.isEqual(expectedParsed);
      return { score: isCorrect ? 1 : 0, isCorrect, feedback: isCorrect ? 'Correct!' : 'Incorrect expression.' };
    } catch (err) {
      console.warn('ComputeEngine evaluation failed, falling back to string match.', err);
      const norm = s => s.replace(/\s+/g, '');
      const isCorrect = norm(value) === norm(expected);
      return { score: isCorrect ? 1 : 0, isCorrect, feedback: isCorrect ? 'Correct!' : 'Incorrect expression.' };
    }
  }

  /** Pure, DOM-independent scoring for a caller with no live instance to
   *  reuse (e.g. comprehension-set@1's `static score()` resolving this
   *  class directly via QuestionRegistry) — has to load and construct its
   *  own throwaway ComputeEngine, since there's no `this._ce` here. */
  static async score(itemData, response) {
    if (!itemData) return { score: 0, isCorrect: false };
    const { ComputeEngine } = await import('vendor/compute-engine.js');
    const ce = new ComputeEngine();
    return EquationInputPlugin._compare(ce, itemData.expected, response?.value);
  }

  evaluate() {
    if (!this._data) return { score: 0, isCorrect: false };
    this._result = this.constructor._compare(this._ce, this._data.expected, this._value);
    this.requestUpdate();
    return this._result;
  }

  render() {
    if (!this._data) return html``;
    if (this._ctx?.previewOnly) {
      return html`
        <div class="container">
          <div class="prompt"><markdown-renderer .content=${this._data.stem}></markdown-renderer></div>
        </div>
      `;
    }
    return html`
      <div class="container">
        <div class="prompt">
          <markdown-renderer .content=${this._data.stem}></markdown-renderer>
        </div>
        <div class="input-section">
          <!-- Deliberately uncontrolled: no .value= binding here. this._value
               is only ever written FROM this element's own "input" event
               (below), and _handleInput setting it (a reactive property)
               schedules a Lit re-render — if that re-render fed the same
               value straight back via a .value= binding, MathLive's setter
               re-parses the whole LaTeX expression on every keystroke, which
               resets the caret and scrambles whatever the student is
               mid-typing (a fraction's denominator, say). Every character
               they type gets fought and lost, and evaluate() ends up scoring
               an effectively-empty answer even though the field looked
               populated moments earlier. setState() (above) is the only
               place that ever pushes a value onto the field, and it does so
               imperatively, once, never through this template. -->
          <math-field
            @input=${this._handleInput}
            math-virtual-keyboard-policy="auto"
            ?disabled=${!!this._result}
          ></math-field>
          ${this._result ? '' : html`<guide-help class="type-help" slug="typing-maths" label="How to type maths"></guide-help>`}
          ${this._result ? html`
            <feedback-banner
              .type=${this._result.isCorrect ? 'correct' : 'incorrect'}
              .message=${this._result.feedback || ''}
            ></feedback-banner>
          ` : ''}
        </div>
        <question-explanation
          .explanation=${this._data.explanation}
          .explanationSlide=${this._data.explanationSlide}
          .bundleId=${this._ctx?.bundleId}
          ?revealed=${!!this._result}
        ></question-explanation>
      </div>
    `;
  }
}

customElements.define('equation-input-v1', EquationInputPlugin);
