import { createDialogOverlay } from './dialogs.js';
import { KINDS, MAX_TEXT, submit } from '../../core/FeedbackService.js';
import { tr } from '../../core/i18nProvider.js';

/**
 * "Flag this slide" sheet (W4, learner side). A native <dialog> in the
 * document, built the way dialogs.js builds its own (same .aa-dialog-box
 * shell, same .aa-dialog-btn buttons, so both looks and the #aa-shell rule
 * apply unchanged). Every piece of text goes in through textContent, never
 * innerHTML: the beat excerpt is content and the note is learner text
 * (invariant 6). Saves through FeedbackService.submit, which sanitises again.
 *
 *   openSlideFeedback({ profileId, bundleId, lessonId, blockId, blockRef,
 *     beatIndex, beatExcerpt, contentVersion }) -> Promise<row|null>
 */
const KIND_LABELS = {
  typo: ['feedback.kind.typo', 'Typo'],
  confusing: ['feedback.kind.confusing', 'Confusing'],
  wrong: ['feedback.kind.wrong', 'Looks wrong'],
  broken: ['feedback.kind.broken', 'Broken'],
  idea: ['feedback.kind.idea', 'Idea'],
};
export const kindLabel = (k) => (KIND_LABELS[k] ? tr(...KIND_LABELS[k]) : k);

const NOTE_MAX = Math.min(500, MAX_TEXT);

function injectCss() {
  if (document.getElementById('sfb-css')) return;
  const style = document.createElement('style');
  style.id = 'sfb-css';
  style.textContent = `
    .aa-dialog-box.sfb { max-width: 460px; gap: var(--space-4); }
    .sfb .sfb-excerpt {
      margin: 0;
      padding: var(--space-2) var(--space-3);
      border-left: var(--rule-w-bold, 3px) solid var(--border-hover);
      background: var(--bg-panel);
      border-radius: var(--radius-xs);
      color: var(--text-muted);
      font-size: 0.88rem;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .sfb .sfb-legend {
      margin: 0 0 var(--space-2);
      padding: 0;
      font-weight: var(--fw-heavy);
      font-size: 0.95rem;
      color: var(--text-main);
    }
    .sfb fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
    .sfb .sfb-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .sfb .sfb-chip {
      font-family: var(--font-ui);
      font-weight: var(--fw-strong);
      font-size: 0.9rem;
      min-height: 40px;
      padding: 8px 14px;
      border-radius: var(--radius-pill);
      border: var(--rule-w) solid var(--border-color);
      background: var(--bg-surface);
      color: var(--text-main);
      box-shadow: var(--lip) var(--lip-color);
      cursor: pointer;
      transition: transform var(--motion-fast) var(--ease-settle);
    }
    .sfb .sfb-chip:hover { border-color: var(--border-hover); }
    .sfb .sfb-chip[aria-checked="true"] {
      background: var(--primary-light);
      border-color: var(--primary-color);
      color: var(--primary-text);
      box-shadow: var(--lip) var(--primary-color);
    }
    .sfb .sfb-chip:active { transform: translateY(var(--press-travel-sm, 2px)); box-shadow: none; }
    .sfb .sfb-chip:focus-visible, .sfb textarea:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
    .sfb label.sfb-legend { display: block; }
    .sfb .sfb-opt { font-weight: var(--fw-medium); color: var(--text-muted); }
    .sfb textarea {
      box-sizing: border-box;
      width: 100%;
      min-height: 84px;
      resize: vertical;
      padding: var(--space-2) var(--space-3);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-md);
      background: var(--bg-base);
      color: var(--text-main);
      font: inherit;
      font-size: 0.95rem;
      line-height: 1.45;
    }
    .sfb .sfb-note { margin: 0; color: var(--text-muted); font-size: 0.8rem; line-height: 1.4; }
    .sfb .sfb-err { margin: 0; color: var(--error-text); font-size: 0.85rem; }
    .sfb .aa-dialog-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    @media (max-width: 600px) {
      .aa-dialog-box.sfb {
        width: 100vw;
        max-width: 100vw;
        margin: auto 0 0;
        border-radius: var(--radius-xl) var(--radius-xl) 0 0;
        padding: var(--space-5) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom));
        max-height: 92dvh;
        overflow-y: auto;
      }
      .sfb .aa-dialog-actions .aa-dialog-btn { flex: 1; }
    }
    @media (prefers-reduced-motion: reduce) { .sfb .sfb-chip { transition: none; } }
  `;
  document.head.appendChild(style);
}

const el = (tag, attrs = {}, text) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

export function openSlideFeedback(ctx = {}) {
  injectCss();
  return new Promise((resolve) => {
    const dialog = createDialogOverlay();
    dialog.classList.add('sfb');
    dialog.setAttribute('aria-labelledby', 'sfb-title');

    const title = el('h3', { class: 'aa-dialog-title', id: 'sfb-title' }, tr('feedback.sheet.title', 'Flag this slide'));
    dialog.append(title);

    if (ctx.beatExcerpt) {
      dialog.append(el('p', { class: 'sfb-excerpt' }, ctx.beatExcerpt.length > 140 ? `${ctx.beatExcerpt.slice(0, 140).trimEnd()}...` : ctx.beatExcerpt));
    }

    const fs = el('fieldset');
    fs.append(el('legend', { class: 'sfb-legend', id: 'sfb-kind-l' }, tr('feedback.sheet.kind', 'What is the matter?')));
    const chips = el('div', { class: 'sfb-chips', role: 'radiogroup', 'aria-labelledby': 'sfb-kind-l' });
    let kind = null;
    const chipEls = KINDS.map((k, i) => {
      const b = el('button', { type: 'button', class: 'sfb-chip', role: 'radio', 'aria-checked': 'false', tabindex: i === 0 ? '0' : '-1', 'data-kind': k }, kindLabel(k));
      b.addEventListener('click', () => select(k, false));
      chips.append(b);
      return b;
    });
    fs.append(chips);
    dialog.append(fs);

    const wrap = el('div');
    const lab = el('label', { class: 'sfb-legend', for: 'sfb-text' }, tr('feedback.sheet.text', 'Tell us more '));
    lab.append(el('span', { class: 'sfb-opt' }, tr('feedback.sheet.optional', '(optional)')));
    const ta = el('textarea', { id: 'sfb-text', maxlength: String(NOTE_MAX), rows: '3' });
    ta.placeholder = tr('feedback.sheet.placeholder', 'One short sentence is plenty.');
    wrap.append(lab, ta);
    dialog.append(wrap);

    dialog.append(el('p', { class: 'sfb-note' }, tr('feedback.sheet.note', 'Saved on this device. A grown-up can send it to the course author later. Your name is not included.')));
    const err = el('p', { class: 'sfb-err', role: 'alert' });
    dialog.append(err);

    const actions = el('div', { class: 'aa-dialog-actions' });
    const cancel = el('button', { type: 'button', class: 'aa-dialog-btn' }, tr('feedback.sheet.cancel', 'Cancel'));
    const save = el('button', { type: 'button', class: 'aa-dialog-btn primary' }, tr('feedback.sheet.save', 'Save'));
    save.disabled = true;
    actions.append(cancel, save);
    dialog.append(actions);

    function select(k, focus) {
      kind = k;
      chipEls.forEach((b) => {
        const on = b.dataset.kind === k;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
      save.disabled = false;
      err.textContent = '';
    }
    // Roving radio keys inside the chip group.
    chips.addEventListener('keydown', (e) => {
      const i = Math.max(0, KINDS.indexOf(kind ?? document.activeElement?.dataset?.kind));
      let n = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % KINDS.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + KINDS.length) % KINDS.length;
      if (n != null) { e.preventDefault(); select(KINDS[n], true); }
    });

    let done = false;
    const close = (result) => {
      if (done) return;
      done = true;
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    cancel.addEventListener('click', () => close(null));
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    save.addEventListener('click', async () => {
      if (!kind) return;
      save.disabled = true;
      try {
        const row = await submit({ ...ctx, kind, text: ta.value });
        close(row);
      } catch (e) {
        console.error('Saving slide feedback failed:', e);
        err.textContent = tr('feedback.sheet.error', 'Could not save that. Please try again.');
        save.disabled = false;
      }
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    chipEls[0].focus();
  });
}
