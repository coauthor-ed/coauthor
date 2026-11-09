import { LitElement, html, css } from 'lit';
import { EventBus } from '../EventBus.js';

// CortexJS Compute Engine for evaluation
import { ComputeEngine } from 'vendor/compute-engine.js';
// MathLive for the <math-field> Web Component
import 'vendor/mathlive.js';
import '../../ui/components/MarkdownRenderer.js';

const ce = new ComputeEngine();

export class EquationInput extends LitElement {
  static styles = css`
    :host { 
      display: block; 
      font-family: system-ui, sans-serif; 
      margin-bottom: 2rem; 
      color: var(--text-main, #172b4d);
    }
    .container { 
      border: 2px solid var(--border-color, #dfe1e6); 
      border-radius: 8px; 
      background: var(--bg-surface, #ffffff); 
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(9, 30, 66, 0.05);
    }
    .prompt {
      padding: 16px 20px;
      font-size: 1.1rem;
      font-weight: 500;
      border-bottom: 1px solid #dfe1e6;
      background: var(--bg-base, #fafbfc);
    }
    .input-section {
      padding: 20px;
    }
    math-field {
      width: 100%;
      font-size: 1.4rem;
      padding: 12px;
      border: 2px solid #c1c7d0;
      border-radius: 8px;
      background: var(--bg-surface, #ffffff);
      transition: border-color 0.2s;
    }
    math-field:focus-within {
      border-color: var(--primary-color, #0052cc);
      outline: none;
    }
    /* We can style the internal parts of math-field via CSS variables if needed */
  `;

  static properties = {
    _data: { type: Object, state: true },
    _value: { type: String, state: true }
  };

  constructor() {
    super();
    this._data = null;
    this._value = '';
  }

  init(data) {
    if (!data || !data.expected) throw new Error("EquationInput requires 'expected' math expression.");
    this._data = data;
  }

  getState() {
    return { value: this._value };
  }

  setState(state) {
    if (state && state.value !== undefined) {
      this._value = state.value;
    }
  }

  _handleInput(e) {
    // math-field emits standard 'input' events, and its .value is a LaTeX string
    this._value = e.target.value;
    EventBus.emit('interaction:question', { questionId: this._data.id, state: this.getState() });
  }

  evaluate() {
    if (!this._data || !this._value) return { score: 0, isCorrect: false };

    try {
      // Parse the student's LaTeX input and the expected LaTeX answer
      const studentExpr = ce.parse(this._value);
      const expectedExpr = ce.parse(this._data.expected);

      // Use Compute Engine to determine if they are mathematically/algebraically equal
      const isCorrect = studentExpr.isEqual(expectedExpr);

      return {
        score: isCorrect ? 1 : 0,
        isCorrect: isCorrect,
        feedback: isCorrect ? null : "Incorrect expression."
      };
    } catch (e) {
      console.warn("ComputeEngine evaluation failed, falling back to string match.", e);
      // Fallback: robust whitespace-stripped string comparison
      const valNormal = this._value.replace(/\\s+/g, '');
      const expNormal = this._data.expected.replace(/\\s+/g, '');
      const isCorrect = valNormal === expNormal;
      return {
        score: isCorrect ? 1 : 0,
        isCorrect,
        error: isCorrect ? null : e.message
      };
    }
  }

  render() {
    if (!this._data) return html``;
    return html`
      <div class="container">
        <markdown-renderer class="prompt" content=${this._data.stem}></markdown-renderer>
        <div class="input-section">
          <math-field 
            @input=${this._handleInput} 
            .value=${this._value}
            math-virtual-keyboard-policy="auto"
          ></math-field>
        </div>
      </div>
    `;
  }
}

customElements.define('equation-input', EquationInput);
