import { css } from 'lit';

export const btn3dStyles = css`
  .btn-3d {
    font-family: var(--font-ui);
    font-weight: var(--fw-heavy);
    font-size: 15px;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    padding: 14px 22px;
    color: var(--on-primary);
    transition: transform 0.08s;
    letter-spacing: 0.01em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    text-decoration: none;
    line-height: 1.2;
  }
  
  .btn-3d.btn-sm {
    padding: 10px 16px;
    font-size: 14px;
    border-radius: var(--radius-sm);
  }

  .btn-3d.btn-lg {
    padding: 16px 30px;
    font-size: 1.08rem;
    border-radius: var(--radius-btn-lg);
  }

  .btn-3d { gap: var(--space-2); }
  .btn-3d svg { flex: none; }
  .btn-primary:hover:not(:disabled),
  .btn-success:hover:not(:disabled) { filter: brightness(1.05); }

  .btn-3d:active:not(:disabled) { 
    transform: translateY(var(--press-travel)); 
    box-shadow: none !important; 
  }
  
  .btn-3d:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn-3d:focus-visible {
    outline: var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
  }
  
  /* --btn-primary-*: optional look tokens (unset under Quill; plain makes the
     primary button its highlighter with an ink rule). */
  .btn-primary {
    background: var(--btn-primary-bg, var(--primary-color));
    box-shadow: var(--press-2) var(--primary-hover);
    color: var(--btn-primary-ink, var(--on-primary));
    border: var(--btn-primary-border, none);
  }
  
  .btn-success {
    background: var(--accent-teal);
    box-shadow: var(--press-2) color-mix(in srgb, var(--accent-teal) 65%, var(--text-main));
    color: var(--on-accent);
  }
  
  .btn-warning { 
    background: var(--accent-amber); 
    color: var(--bg-surface); 
    box-shadow: var(--press-2) var(--warn-text); 
  }
  
  .btn-danger {
    background: var(--error-text);
    box-shadow: var(--press-2) var(--text-main);
    color: var(--on-accent);
  }
  
  /* The ghost button: a 2px rule plus a stronger lip than the rule itself,
     so it reads as pressable on warm paper (prototype v2 a/ .btn-ghost). */
  .btn-secondary {
    background: var(--bg-surface);
    color: var(--text-main);
    box-shadow: var(--press-1) var(--lip-color);
    border: var(--rule-w) solid var(--border-color);
  }
  .btn-secondary:hover:not(:disabled) { border-color: var(--border-hover); }

  @media (prefers-reduced-motion: reduce) {
    .btn-3d { transition: none; }
  }
`;

/**
 * feedbackAnimStyles — the correct/incorrect reaction, shared.
 *
 * These keyframes and the .pop-anim/.shake-anim classes were defined inside
 * mcq-single@2 and nowhere else, so every other question plugin graded in
 * silence. They cannot come from theme.css: `.anim-pop`/`.anim-shake`/
 * `.xp-float` there are light-DOM globals, and every plugin renders into its
 * own shadow root, which stylesheet rules do not cross (custom properties do).
 * A shared `css` object imported into `static styles` is the mechanism that
 * actually reaches a plugin.
 */
export const feedbackAnimStyles = css`
  @keyframes sd-option-thud {
    0%   { transform: translateY(calc(-4px * var(--bounce))); box-shadow: 0 calc(8px * var(--bounce)) 0 var(--error-text); }
    30%  { transform: translateY(calc(4px * var(--bounce)));  box-shadow: 0 0 0 var(--error-text); }
    50%  { transform: translateY(calc(-1px * var(--bounce))); box-shadow: 0 calc(5px * var(--bounce)) 0 var(--error-text); }
    70%  { transform: translateY(calc(2px * var(--bounce)));  box-shadow: 0 calc(2px * var(--bounce)) 0 var(--error-text); }
    100% { transform: translateY(0);    box-shadow: var(--press-1) var(--error-text); }
  }
  @keyframes sd-option-spring {
    0%   { transform: translateY(calc(4px * var(--bounce)));  box-shadow: 0 0 0 var(--success-text); }
    50%  { transform: translateY(calc(-2px * var(--bounce))); box-shadow: 0 calc(6px * var(--bounce)) 0 var(--success-text); }
    100% { transform: translateY(0);    box-shadow: var(--press-1) var(--success-text); }
  }
  .shake-anim {
    animation: sd-option-thud 0.5s ease-out both;
    transition: none !important;
  }
  .pop-anim {
    animation: sd-option-spring 0.4s var(--ease-spring) both;
    transition: none !important;
  }
  /* theme.css's global prefers-reduced-motion block selects * and stops at
     every shadow boundary, so it must be repeated inside each plugin. */
  @media (prefers-reduced-motion: reduce) {
    .shake-anim, .pop-anim { animation: none; }
  }
`;

/**
 * choiceSurfaceStyles — the chunky selectable card.
 *
 * The `.option` treatment from mcq-single@2, generalized as `.choice` so any
 * plugin with pickable items (sequence rows, match tiles, judgment buttons,
 * blanks) gets the same 3px border, 16px radius, 3D press and verdict marks
 * instead of re-deriving a flat 8px box.
 */
export const choiceSurfaceStyles = css`
  .choice {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 14px 18px;
    border: var(--rule-w-bold) solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-surface);
    color: var(--text-main);
    font-family: var(--font-family);
    font-weight: var(--fw-strong);
    cursor: pointer;
    box-shadow: var(--press-1) var(--border-color);
    transition: transform var(--motion-fast), border-color var(--motion-fast),
                background var(--motion-fast), box-shadow var(--motion-fast);
  }
  .choice:hover:not(.disabled) { background: var(--bg-base); border-color: var(--border-hover); }
  .choice:active:not(.disabled) { transform: translateY(var(--press-travel-sm)); box-shadow: none; }
  .choice.selected {
    border-color: var(--primary-color);
    background: var(--primary-light);
    box-shadow: var(--press-1) var(--primary-color);
  }
  .choice.disabled { cursor: default; }
  .choice.correct-mark {
    border-color: var(--verdict-rule-good, var(--success-text)) !important;
    background: var(--success-bg) !important;
    color: var(--success-text) !important;
    box-shadow: var(--press-1) var(--success-text) !important;
  }
  .choice.incorrect-mark {
    border-color: var(--verdict-rule-bad, var(--error-text)) !important;
    background: var(--error-bg) !important;
    color: var(--error-text) !important;
    box-shadow: var(--press-1) var(--error-text) !important;
  }
  @media (prefers-reduced-motion: reduce) {
    .choice { transition: none; }
  }
`;

/**
 * uwStyles — the hand-drawn squiggle underline from the reference designs.
 *
 * mask-image plus a token background, never a data URI with the colour baked
 * in: a data URI cannot read a CSS variable, so a baked colour would be a
 * hardcoded value in disguise and would not follow the theme.
 */
export const uwStyles = css`
  .uw {
    position: relative;
    padding-bottom: 10px;
  }
  .uw::after {
    content: '';
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: 9px;
    background: var(--accent-amber);
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='9'%3E%3Cpath d='M0 5q5-7 10 0t10 0 10 0 10 0' fill='none' stroke='%23000' stroke-width='2.6' stroke-linecap='round'/%3E%3C/svg%3E") repeat-x 0 100% / auto 9px;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='9'%3E%3Cpath d='M0 5q5-7 10 0t10 0 10 0 10 0' fill='none' stroke='%23000' stroke-width='2.6' stroke-linecap='round'/%3E%3C/svg%3E") repeat-x 0 100% / auto 9px;
  }
`;

/**
 * optionKeyStyles: the A/B/C key chip on single-choice option rows
 * (lesson-modes-plan.md, prototype v2 a/ .poe-opt .key). The native radio
 * stays in the DOM, visually hidden but focusable, so role=radiogroup keyboard
 * semantics and screen-reader names are unchanged; the chip is display-only
 * (aria-hidden). Letters follow DISPLAY order after any shuffle, so authored
 * text must still never say "option B" (see mcq-single@2's schema note).
 *
 * Expected markup inside an .option row:
 *   <input type="radio" class="opt-radio" ...>
 *   <span class="opt-key" aria-hidden="true">A</span>
 */
export const optionKeyStyles = css`
  .opt-radio {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .option { position: relative; gap: var(--space-3); }
  .option:hover:not(.disabled) { transform: rotate(var(--opt-hover-tilt)); }
  .option:has(.opt-radio:focus-visible) {
    outline: var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
  }
  .opt-key {
    flex: none;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--opt-key-radius);
    background: var(--opt-key-bg);
    border: 1.5px solid var(--border-hover);
    color: var(--opt-key-ink);
    font-family: var(--font-ui);
    font-weight: var(--fw-strong);
    font-size: 0.85rem;
    line-height: 1;
    transition: background var(--motion-fast), border-color var(--motion-fast), color var(--motion-fast);
  }
  .option.selected .opt-key {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: var(--on-primary);
  }
  .option.correct-mark .opt-key {
    background: var(--opt-key-correct, var(--accent-teal));
    border-color: var(--opt-key-correct, var(--accent-teal));
    color: var(--on-accent);
  }
  .option.incorrect-mark .opt-key {
    background: var(--error-text);
    border-color: var(--error-text);
    color: var(--on-accent);
  }
  /* After grading, rows that were neither picked nor right step back. */
  .option.dim { opacity: 0.55; }
  @media (prefers-reduced-motion: reduce) {
    .opt-key { transition: none; }
  }
`;

/** Display letter for the i-th option row (A, B, C ...). */
export const optionKeyLetter = (i) => String.fromCharCode(65 + (i % 26));

/**
 * plain look: single-choice options as ruled rows, not cards (plain SPEC
 * sec 4, 2026-11-05). One ink rule over the list, a hairline under each row,
 * no lip, no radius, no tilt; the picked row takes the signature tint and a
 * 3px signature edge. Keyed on :host([data-look="plain"]), so the host needs
 * LookMixin. Quill is untouched (rules only add under plain).
 */
export const plainChoiceStyles = css`
  :host([data-look="plain"]) .options-list { gap: 0; border-top: 1px solid var(--rule-strong); }
  :host([data-look="plain"]) .option {
    border: 0;
    border-bottom: 1px solid var(--border-color);
    border-radius: 0;
    box-shadow: none;
    background: transparent;
    padding: 12px 10px;
    font-weight: 400;
  }
  :host([data-look="plain"]) .option:hover:not(.disabled) { background: var(--bg-panel); transform: none; }
  :host([data-look="plain"]) .option:active:not(.disabled) { transform: none; }
  :host([data-look="plain"]) .option.selected {
    background: var(--primary-light);
    box-shadow: inset 3px 0 0 var(--primary-color);
  }
  :host([data-look="plain"]) .opt-key {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border-width: 1px;
    background: transparent;
    font-size: 0.78rem;
  }
  :host([data-look="plain"]) .option.selected .opt-key { background: var(--primary-color); }
`;
