import { LitElement, html, css } from 'lit';
import '../../ui/components/MarkdownRenderer.js';

/**
 * <feedback-banner> — Reusable feedback display component for question plugins.
 *
 * @attr {'correct'|'incorrect'|'partial'} type - Semantic type, controls colour.
 * @attr {string} message - The feedback text to display.
 *
 * @example
 *   <feedback-banner type="correct" message="Well done!"></feedback-banner>
 */
export class FeedbackBanner extends LitElement {
  static properties = {
    type:    { type: String },
    message: { type: String },
  };

  static styles = css`
    :host {
      display: block;
      font-family: var(--font-family, 'Nunito', system-ui, sans-serif);
    }

    .banner {
      margin: 14px 3px 0;
      padding: 14px 18px;
      border-radius: var(--radius-tile);
      font-size: 0.95rem;
      font-weight: var(--fw-feedback);
      line-height: 1.5;
      border: var(--rule-w-fixed) solid transparent;
      transform-origin: center;
    }
    @keyframes sd-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes sd-spring-up {
      0%   { transform: translateY(calc(8px * var(--bounce))); box-shadow: 0 0 0 var(--success-text); opacity: 0; }
      50%  { transform: translateY(calc(-2px * var(--bounce))); box-shadow: 0 calc(6px * var(--bounce)) 0 var(--success-text); opacity: 1; }
      100% { transform: translateY(0); box-shadow: var(--lip-fixed) var(--success-text); opacity: 1; }
    }
    @keyframes sd-thud-error {
      0%   { transform: translateY(calc(-8px * var(--bounce))); opacity: 0; }
      30%  { transform: translateY(calc(4px * var(--bounce))); box-shadow: 0 0 0 var(--error-text); opacity: 1; }
      50%  { transform: translateY(calc(-2px * var(--bounce))); box-shadow: 0 calc(6px * var(--bounce)) 0 var(--error-text); }
      70%  { transform: translateY(calc(2px * var(--bounce))); box-shadow: 0 calc(2px * var(--bounce)) 0 var(--error-text); }
      100% { transform: translateY(0); box-shadow: var(--lip-fixed) var(--error-text); }
    }

    .banner.correct {
      background: var(--success-bg);
      color:      var(--success-text);
      border-color: var(--verdict-rule-good, var(--success-text));
      box-shadow: var(--lip-fixed) var(--success-text);
      animation: sd-spring-up 0.4s var(--ease-pop) forwards;
    }
    .banner.incorrect {
      background: var(--error-bg);
      color:      var(--error-text);
      border-color: var(--verdict-rule-bad, var(--error-text));
      box-shadow: var(--lip-fixed) var(--error-text);
      animation: sd-thud-error 0.5s ease-out forwards;
    }
    .banner.partial {
      background: var(--warn-bg);
      color:      var(--warn-text);
      border-color: var(--verdict-rule-warn, var(--warn-text));
      box-shadow: var(--lip-fixed) var(--warn-text);
      animation: sd-fade-in 0.2s ease forwards;
    }
  `;

  constructor() {
    super();
    this.type    = 'incorrect';
    this.message = '';
  }

  render() {
    if (!this.message) return html``;
    return html`<div class="banner ${this.type}"><markdown-renderer inline .content=${this.message}></markdown-renderer></div>`;
  }
}

customElements.define('feedback-banner', FeedbackBanner);
