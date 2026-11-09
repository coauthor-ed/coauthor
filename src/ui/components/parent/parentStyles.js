import { css } from 'lit';

/**
 * Shared look for the parent portal (ParentDashboard.js and the tab panels
 * beside this file). The engine's Classic / Story card language, one notch
 * quieter than the student screens: the same card, rule, lip and type tokens,
 * smaller buttons, no bounce. Tokens only (invariant 9); Story re-values the
 * same names, so nothing here branches on the mode except the few
 * :host([data-lesson-mode="story"]) accents each component adds.
 */
export const parentStyles = css`
  :host { display: block; color: var(--text-main); font-family: var(--font-family); }
  * { box-sizing: border-box; }

  .section { margin: 0 0 var(--space-7); }
  .section:last-child { margin-bottom: 0; }
  .section-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-3) var(--space-4);
    flex-wrap: wrap;
    margin-bottom: var(--space-4);
  }
  .section-head > div { min-width: 0; flex: 1 1 260px; }
  h2, h3 {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: var(--heading-weight);
    letter-spacing: -0.01em;
    line-height: var(--lh-tight);
  }
  h2 { font-size: 1.3rem; }
  h3 { font-size: 1.05rem; }
  .lede { margin: 6px 0 0; color: var(--text-muted); font-size: 0.92rem; line-height: 1.5; max-width: 60ch; }

  .card {
    background: var(--bg-surface);
    border: var(--rule-w) solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--lip) var(--lip-color);
    padding: var(--space-5);
  }
  .card.flush { padding: 0; overflow: hidden; }

  .kicker {
    font-size: var(--fs-kicker);
    font-weight: var(--fw-heavy);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .muted { color: var(--text-muted); }

  /* Rows inside a flush card, split by hairline rules. */
  .rows { list-style: none; margin: 0; padding: 0; }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3) var(--space-4);
    padding: var(--space-4) var(--space-5);
    min-height: 64px;
  }
  .row + .row { border-top: 1px solid var(--border-color); }
  .row-main { flex: 1; min-width: 0; }
  .row-title { font-weight: var(--fw-heavy); font-size: 0.95rem; line-height: 1.3; overflow-wrap: anywhere; }
  .row-meta { margin-top: 2px; font-size: 0.82rem; color: var(--text-muted); }
  .row-icon {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--bg-panel);
    color: var(--text-soft);
  }
  .row-icon.done { background: var(--success-bg); color: var(--success-text); }
  .row-icon.test { background: var(--info-bg); color: var(--info-text); }
  .row-icon.primary { background: var(--primary-light); color: var(--primary-text); }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: var(--radius-pill);
    font-size: 0.78rem;
    font-weight: var(--fw-heavy);
    white-space: nowrap;
    background: var(--bg-panel);
    color: var(--text-soft);
  }
  .chip.good { background: var(--success-bg); color: var(--success-text); }
  .chip.ok { background: var(--warn-bg); color: var(--warn-text); }
  .chip.low { background: var(--error-bg); color: var(--error-text); }

  .stars { display: inline-flex; gap: 1px; color: var(--accent-gold); }
  .stars .off { color: var(--border-hover); }
  .stars svg { width: 14px; height: 14px; }

  .empty {
    padding: var(--space-6) var(--space-5);
    text-align: center;
    color: var(--text-muted);
    font-size: 0.92rem;
    line-height: 1.5;
    border: 2px dashed var(--border-hover);
    border-radius: var(--radius-lg);
    background: var(--bg-surface);
  }
  .empty strong { display: block; color: var(--text-main); font-size: 1rem; margin-bottom: 4px; }

  /* A plain text-ish button for secondary row actions. */
  .link-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 var(--space-3);
    border: var(--rule-w) solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-surface);
    color: var(--text-main);
    font: inherit;
    font-weight: var(--fw-heavy);
    font-size: 0.85rem;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: var(--lip) var(--lip-color);
    transition: transform 80ms, box-shadow 80ms, border-color var(--motion-fast);
  }
  .link-btn:hover { border-color: var(--border-hover); }
  .link-btn:active { transform: translateY(var(--press-travel-sm)); box-shadow: none; }
  .link-btn:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }
  .link-btn.danger { color: var(--error-text); }
  .link-btn.danger:hover { border-color: var(--error-text); }

  @media (max-width: 600px) {
    .card { padding: var(--space-4); }
    .row { padding: var(--space-3) var(--space-4); }
    .section { margin-bottom: var(--space-6); }
  }
  @media (prefers-reduced-motion: reduce) {
    .link-btn { transition: none; }
  }
`;

/** "2 hours ago" / "Yesterday" / "3 Oct". */
export function relTime(t) {
  if (!t) return 'never';
  const diff = Date.now() - t;
  const min = Math.round(diff / 60e3);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** 39 min / 1 h 20 min. */
export function fmtDuration(ms) {
  const m = Math.round((ms || 0) / 60e3);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export const scoreTone = (p) => (p >= 80 ? 'good' : p >= 50 ? 'ok' : 'low');
