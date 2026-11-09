import { css } from 'lit';

/**
 * Design tokens for semantic-descriptive@1, ported from coaching-poc-v5.html's
 * palette. Each `--sd-*` token defaults to the closest existing platform
 * theme token (src/ui/theme.css) so this plugin automatically follows the
 * app's light/dark toggle (CSS custom properties inherit through shadow
 * boundaries) instead of introducing a parallel hardcoded palette — the
 * platform's --primary-color already *is* the POC's indigo.
 */
export const sdTokens = css`
  :host {
    --sd-indigo: var(--primary-color);
    --sd-indigo-dark: var(--primary-hover);
    --sd-indigo-soft: var(--primary-light);
    --sd-emerald: var(--success-text);
    --sd-emerald-soft: var(--success-bg);
    --sd-amber: var(--accent-amber);
    --sd-amber-dark: var(--warn-text);
    --sd-amber-soft: var(--warn-bg);
    --sd-red: var(--error-text);
    --sd-red-dark: var(--text-main);
    --sd-red-soft: var(--error-bg);
    --sd-border: var(--border-color);
    --sd-ink: var(--text-main);
    --sd-ink-soft: var(--text-muted);
    --sd-ink-faint: var(--text-muted);
    --sd-card: var(--bg-surface);
    --sd-font: var(--font-family);
    --sd-font-display: var(--font-heading);
    display: block;
    font-family: var(--sd-font);
    color: var(--sd-ink);
  }
`;

export const sdButtons = css`
  /* Deliberately mirrors sharedStyles.js's .btn-3d token-for-token rather than
     re-deriving its own values, so this plugin presses, springs and rounds
     exactly like every other question type. It stays a separate class only
     because its call sites use the .sd-btn-* colour modifiers. */
  .sd-btn3d {
    font-family: var(--sd-font-display);
    font-weight: var(--fw-heavy);
    font-size: 15px;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    padding: 14px 22px;
    color: var(--on-primary);
    transition: transform var(--motion-fast);
    letter-spacing: 0.01em;
  }
  .sd-btn3d:active:not(:disabled) { transform: translateY(var(--press-travel)); box-shadow: none !important; }
  .sd-btn3d:disabled { opacity: 0.5; cursor: not-allowed; transform: translateY(2px); }
  .sd-btn3d:focus-visible { outline: 3px solid var(--sd-indigo-soft); outline-offset: 2px; }
  .sd-btn-indigo { background: var(--sd-indigo); box-shadow: var(--press-2) var(--sd-indigo-dark); }
  .sd-btn-emerald { background: var(--sd-emerald); box-shadow: var(--press-2) var(--text-main); }
  .sd-btn-amber { background: var(--sd-amber); color: var(--bg-surface); box-shadow: var(--press-2) var(--sd-amber-dark); }
  .sd-btn-wide { width: 100%; text-align: center; font-size: 16px; padding: 15px; }

  .sd-chip {
    font-family: var(--sd-font);
    font-weight: var(--fw-heavy);
    font-size: 13px;
    background: var(--sd-indigo-soft);
    color: var(--sd-indigo-dark);
    border: none;
    padding: 9px 16px;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .sd-chip:hover { filter: brightness(0.95); }
  .sd-chip:active { transform: translateY(2px); }
  .sd-chip:focus-visible { outline: 3px solid var(--sd-indigo-dark); outline-offset: 2px; }
`;

export const sdKeyframes = css`
  /* theme.css's global prefers-reduced-motion block selects * and stops at the
     shadow boundary, so every animating plugin repeats it locally. */
  @media (prefers-reduced-motion: reduce) {
    .sd-pulse, .sd-pop, .sd-shake,
    [class*='sd-'] { animation: none !important; }
  }
  @keyframes sd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  @keyframes sd-pop { 0% { transform: scale(0.3) rotate(-6deg); opacity: 0; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
  @keyframes sd-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }

  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
`;
