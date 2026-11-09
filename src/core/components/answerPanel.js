import { html, css } from 'lit';
import { EventBus } from '../EventBus.js';

/**
 * plain look: the question slide as an editorial spread (2026-11-05). The
 * prompt sits large on the left; the answer panel (a ruled box) on the right
 * holds the input or options, the Check button, the hint control with its
 * level, and the verdict. On a phone the panel stacks straight under the
 * prompt. Quill never renders any of this: a host only takes the plain
 * branch when it is under the plain look AND its host shell asked for the
 * panel (LessonSession sets `panelCheck` on a host whose class declares
 * `static PLAIN_PANEL = true`), so a nested or bank-preview question keeps
 * its stacked layout. Every rule is keyed on :host([data-look="plain"]).
 */
export const plainAnswerPanelStyles = css`
  :host([data-look="plain"]) .qp-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 1.05fr);
    grid-template-rows: auto 1fr;
    grid-template-areas: "prompt panel" "explain panel";
    column-gap: clamp(28px, 4.5vw, 64px);
    align-items: start;
  }
  :host([data-look="plain"]) .qp-layout.qp-stack {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto;
    grid-template-areas: "prompt" "panel" "explain";
    row-gap: 20px;
  }
  :host([data-look="plain"]) .qp-prompt { grid-area: prompt; min-width: 0; }
  :host([data-look="plain"]) .qp-explain { grid-area: explain; min-width: 0; }
  :host([data-look="plain"]) .qp-explain:empty { display: none; }
  /* Once the prompt's beats are all shown its "Show full" slot is empty; it
     would only hold the panel down (about 50px on a phone). */
  :host([data-look="plain"]) .qp-prompt .rv-more-hidden { display: none; }
  :host([data-look="plain"]) .qp-kicker {
    margin: 0 0 12px;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--card-kicker, var(--primary-text));
  }
  /* The prompt reads at a display-adjacent size in the text sans (the serif
     is for titles only). */
  :host([data-look="plain"]) .qp-prompt .stem,
  :host([data-look="plain"]) .qp-prompt .question-stem {
    font-size: clamp(1.2rem, 1.1rem + 0.45vw, 1.45rem);
    line-height: 1.5;
    font-weight: 400;
    color: var(--text-main);
    max-width: 38em;
    margin: 0;
  }

  :host([data-look="plain"]) .qp-panel {
    grid-area: panel;
    min-width: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 18px 20px 20px;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-top: 2px solid var(--rule-strong);
    border-radius: 0;
    position: sticky;
    top: calc(var(--lesson-sticky-header-h, 0px) + 12px);
  }
  :host([data-look="plain"]) .qp-panel-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  /* Options inside the panel: the list's own ink rule would double the
     panel's, so the rows start on a hairline. */
  :host([data-look="plain"]) .qp-panel .options-list { border-top: 1px solid var(--border-color); }
  :host([data-look="plain"]) .qp-panel .option { padding: 12px 6px; line-height: 1.45; }
  :host([data-look="plain"]) .qp-panel .option-text { flex-wrap: wrap; }

  /* The numeric field: wide, a reading size, figures in tabular lining. */
  :host([data-look="plain"]) .qp-panel .input-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: nowrap;
    margin: 0;
  }
  :host([data-look="plain"]) .qp-panel input[type="number"] {
    flex: 1 1 auto;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    padding: 10px 14px;
    font-family: var(--font-ui);
    font-size: 1.5rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums lining-nums;
    border: 1px solid var(--border-hover);
    border-radius: var(--radius-sm);
    background: var(--bg-base);
    color: var(--text-main);
    box-shadow: none;
  }
  :host([data-look="plain"]) .qp-panel input[type="number"]:focus {
    border-color: var(--primary-color);
    box-shadow: none;
    outline: var(--focus-ring);
    outline-offset: 1px;
  }
  :host([data-look="plain"]) .qp-panel input[type="number"]:disabled {
    background: transparent;
    color: var(--text-main);
    border-color: var(--border-color);
  }
  :host([data-look="plain"]) .qp-panel .unit {
    flex: none;
    max-width: 45%;
    font-size: 0.95rem;
    font-weight: 400;
    line-height: 1.3;
    color: var(--text-muted);
  }

  /* Check: the look's primary button, full width of the panel. */
  :host([data-look="plain"]) .qp-check {
    width: 100%;
    padding: 13px 20px;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.2;
    background: var(--btn-primary-bg, var(--primary-color));
    color: var(--btn-primary-ink, var(--on-primary));
    border: var(--btn-primary-border, none);
    border-radius: var(--radius-btn-lg);
    cursor: pointer;
    transition: background var(--motion-fast);
  }
  :host([data-look="plain"]) .qp-check:hover:not(:disabled) { background: var(--btn-primary-hover, var(--primary-hover)); }
  :host([data-look="plain"]) .qp-check:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
  :host([data-look="plain"]) .qp-check:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Hints: a text button with its level, then each opened hint on a rule. */
  :host([data-look="plain"]) .qp-hints { display: flex; flex-direction: column; gap: 10px; }
  :host([data-look="plain"]) .qp-hint-btn {
    align-self: flex-start;
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    padding: 2px 0;
    background: none;
    border: 0;
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--primary-text);
    cursor: pointer;
  }
  :host([data-look="plain"]) .qp-hint-word {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 4px;
  }
  :host([data-look="plain"]) .qp-hint-btn:hover .qp-hint-word { text-decoration-thickness: 2px; }
  :host([data-look="plain"]) .qp-hint-btn:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
  :host([data-look="plain"]) .qp-hint-level {
    font-size: 0.85rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  :host([data-look="plain"]) .qp-hint-card {
    margin: 0;
    padding: 2px 0 2px 14px;
    border-left: 2px solid var(--hint-rule, var(--warn-text));
    font-size: 0.95rem;
    line-height: 1.5;
    color: var(--text-main);
  }
  :host([data-look="plain"]) .qp-hint-label {
    display: block;
    margin-bottom: 2px;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--hint-ink, var(--warn-text));
  }

  /* The verdict: a word and a mark, not colour alone. */
  :host([data-look="plain"]) .qp-verdict {
    padding: 12px 14px;
    border-left: 3px solid var(--qp-v-ink);
    background: var(--qp-v-bg);
    color: var(--text-main);
    font-size: 0.95rem;
    line-height: 1.5;
    animation: qp-verdict-in var(--motion-reveal, 220ms) var(--motion-reveal-ease, ease-out) both;
  }
  :host([data-look="plain"]) .qp-verdict.good { --qp-v-ink: var(--success-text); --qp-v-bg: var(--success-bg); }
  :host([data-look="plain"]) .qp-verdict.bad { --qp-v-ink: var(--error-text); --qp-v-bg: var(--error-bg); }
  :host([data-look="plain"]) .qp-verdict.partial { --qp-v-ink: var(--warn-text); --qp-v-bg: var(--warn-bg); }
  :host([data-look="plain"]) .qp-verdict-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-ui);
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--qp-v-ink);
  }
  :host([data-look="plain"]) .qp-verdict-head svg { width: 20px; height: 20px; flex: none; }
  :host([data-look="plain"]) .qp-verdict-msg { margin-top: 4px; }
  @keyframes qp-verdict-in {
    from { opacity: 0; transform: translateY(var(--motion-reveal-rise, 6px)); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    :host([data-look="plain"]) .qp-verdict { animation: none; }
  }

  /* Phone (and a narrow column): one column, the panel right under the prompt. */
  @media (max-width: 760px) {
    :host([data-look="plain"]) .qp-layout {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto;
      grid-template-areas: "prompt" "panel" "explain";
      row-gap: 18px;
    }
    :host([data-look="plain"]) .qp-panel { position: static; padding: 14px 16px 16px; gap: 14px; }
    /* Check sits in place under the options. It used to ride sticky above
       the fixed footer, but on a short or narrow screen it then covered the
       first option (2026-11-09), so it stays in the flow. */
    /* Opaque disabled state: the same half-strength look as an opacity,
       mixed on the panel paper. */
    :host([data-look="plain"]) .qp-check:disabled {
      opacity: 1;
      background: color-mix(in srgb, var(--btn-primary-bg, var(--primary-color)) 50%, var(--bg-surface));
      color: color-mix(in srgb, var(--btn-primary-ink, var(--on-primary)) 50%, var(--bg-surface));
    }
    :host([data-look="plain"]) .qp-prompt .stem,
    :host([data-look="plain"]) .qp-prompt .question-stem { font-size: 1.15rem; }
  }
`;

const ICON_GOOD = html`<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="8.6"/><path d="M6 10.4l2.7 2.6L14.2 7.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_BAD = html`<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="8.6"/><path d="M7 7l6 6M13 7l-6 6" stroke-linecap="round"/></svg>`;
const ICON_PARTIAL = html`<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="8.6"/><path d="M6.5 10h7" stroke-linecap="round"/></svg>`;

/** Default scorer strings that only restate the verdict; the panel drops them. */
const BARE = new Set(['correct!', 'correct.', 'correct', 'incorrect.', 'incorrect', 'incorrect!']);

/** The verdict block: mark, word, and the scorer's own feedback if it says more. */
export function renderPanelVerdict(result) {
  if (!result) return '';
  const kind = result.isCorrect ? 'good' : (result.score > 0 ? 'partial' : 'bad');
  const word = kind === 'good' ? 'Correct' : kind === 'partial' ? 'Partly right' : 'Not quite';
  const icon = kind === 'good' ? ICON_GOOD : kind === 'partial' ? ICON_PARTIAL : ICON_BAD;
  const msg = String(result.feedback || '').trim();
  const showMsg = msg && !BARE.has(msg.toLowerCase());
  return html`
    <div class="qp-verdict ${kind}" role="status">
      <div class="qp-verdict-head">${icon}<span>${word}</span></div>
      ${showMsg ? html`<div class="qp-verdict-msg"><markdown-renderer inline .content=${msg}></markdown-renderer></div>` : ''}
    </div>
  `;
}

/** The hint control: "Show a hint" with its level, then the opened hints. */
export function renderPanelHints(hints, level, revealed, onMore) {
  if (!hints.length) return '';
  const n = hints.length;
  const more = !revealed && level < n;
  return html`
    <div class="qp-hints">
      ${hints.slice(0, level).map((text, i) => html`
        <div class="qp-hint-card">
          <span class="qp-hint-label">Hint ${i + 1} of ${n}</span>
          <markdown-renderer .content=${text}></markdown-renderer>
        </div>
      `)}
      ${more ? html`
        <button type="button" class="qp-hint-btn" @click=${onMore}>
          <span class="qp-hint-word">${level === 0 ? 'Show a hint' : 'Show the next hint'}</span>
          <span class="qp-hint-level">${level} of ${n} used</span>
        </button>
      ` : ''}
    </div>
  `;
}

/** The panel's Check button; asks the lesson shell to grade (same request
 *  math-workspace@1 uses), so scoring, cues and progress stay in one place. */
export function renderPanelCheck(questionId, ready) {
  return html`
    <button type="button" class="qp-check" ?disabled=${!ready}
      @click=${() => EventBus.emit('question:request-check', { questionId })}>Check answer</button>
  `;
}

/** Normalises authored hints ({ en } or string) to plain strings. */
export function hintTexts(data) {
  if (!Array.isArray(data?.hints) || data.hideHints) return [];
  return data.hints.map(h => (typeof h === 'object' && h !== null ? (h.en || '') : (h || ''))).filter(Boolean);
}
