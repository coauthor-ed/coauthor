import { SAY_TOKEN_RE, SAY_TOKEN_GLOBAL_RE } from './castData.js';
import { ErrorReporter } from '../ErrorReporter.js';
import { BUBBLE_BOX, BUBBLE_NAME } from './bubbleStyle.js';

/**
 * The DOM half of `<!-- SAY id [mood] -->` (castData.js markSay() is the
 * text half): run by <markdown-renderer> on its already-sanitised HTML.
 * Each <p> that starts with a SAY token becomes a speech bubble from that
 * character of the open course's cast: portrait (the cast's element for that
 * character, at that mood) and name, then the paragraph itself, moved, not
 * re-parsed. No HTML strings: DOM APIs and textContent only, so nothing here
 * can bring markup in (invariant 6).
 *
 * Without a cast, or for an id the cast does not know, the token is removed
 * and the paragraph stays a paragraph; ErrorReporter hears about it once per
 * course and id. Any token left anywhere else (a marker not before a
 * paragraph) is removed too.
 *
 * The narrator speaks from the left, everyone else from the right, so two
 * characters talking read as a conversation.
 */

const warned = new Set();

function warnOnce(bundleId, id, why) {
  const key = `${bundleId || ''}\n${id}`;
  if (warned.has(key)) return;
  warned.add(key);
  ErrorReporter.reportError(new Error(`SAY "${id}": ${why}; shown as a plain paragraph.`), { bundleId: bundleId || null });
}

const CSS = `
  .say { display: flex; align-items: flex-end; gap: 10px; margin: 0.35rem 0 1rem; }
  .say:last-child { margin-bottom: 0.2rem; }
  .say[data-side="right"] { flex-direction: row-reverse; }
  .say-face {
    flex: none; width: 54px; height: 54px; border-radius: 50%; overflow: hidden;
    background: var(--bg-sunken); border: 2.5px solid var(--bubble-ink);
    box-shadow: var(--shadow-sm); line-height: 0;
  }
  .say-face > * { display: block; width: 100%; height: 100%; }
  .say-bubble {
    position: relative; flex: 0 1 auto; min-width: 0;
    padding: 9px 14px 11px;
    ${BUBBLE_BOX}
  }
  .say[data-side="left"] .say-bubble { border-bottom-left-radius: 6px; }
  .say[data-side="right"] .say-bubble { border-bottom-right-radius: 6px; }
  .say-bubble::before {
    content: ''; position: absolute; bottom: 14px; width: 12px; height: 12px;
    background: var(--bubble-fill); border: 0 solid var(--bubble-ink);
  }
  .say[data-side="left"] .say-bubble::before { left: -8.5px; border-left-width: 2.5px; border-bottom-width: 2.5px; transform: rotate(45deg); }
  .say[data-side="right"] .say-bubble::before { right: -8.5px; border-right-width: 2.5px; border-top-width: 2.5px; transform: rotate(45deg); }
  .say-name {
    ${BUBBLE_NAME}
  }
  .say[data-side="right"] .say-name { color: var(--accent-teal); }
  .say-bubble > p { margin: 0; }
  @media (max-width: 480px) {
    .say { gap: 8px; }
    .say-face { width: 44px; height: 44px; }
    .say-bubble { padding: 8px 12px 10px; }
  }

  /* The plain look: a quiet quotation, no balloon. */
  :host([data-look="plain"]) .say { align-items: flex-start; gap: 12px; }
  :host([data-look="plain"]) .say[data-side="right"] { flex-direction: row; }
  :host([data-look="plain"]) .say-face { width: 40px; height: 40px; border-width: 1px; border-color: var(--border-color); box-shadow: none; }
  :host([data-look="plain"]) .say-bubble {
    background: none; border: 0; border-left: 2px solid var(--border-color);
    border-radius: 0; box-shadow: none; padding: 0 0 0 14px;
  }
  :host([data-look="plain"]) .say-bubble::before { display: none; }
  :host([data-look="plain"]) .say-name,
  :host([data-look="plain"]) .say[data-side="right"] .say-name {
    font-family: inherit; font-weight: 600; letter-spacing: 0.06em; font-size: 0.72rem; color: var(--text-muted);
  }
`;

let _sheet = null;
function ensureStyles(root) {
  if (!root || !('adoptedStyleSheets' in root)) return;
  if (!_sheet) {
    _sheet = new CSSStyleSheet();
    _sheet.replaceSync(CSS);
  }
  if (!root.adoptedStyleSheets.includes(_sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, _sheet];
}

function firstText(el) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) if (n.nodeValue.trim()) return n;
  return null;
}

function stripLeftovers(container) {
  const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const hits = [];
  let n;
  while ((n = w.nextNode())) if (n.nodeValue.includes('%%%SAY')) hits.push(n);
  for (const t of hits) t.nodeValue = t.nodeValue.replace(SAY_TOKEN_GLOBAL_RE, '');
}

/**
 * @param {Element} container  the renderer's content container
 * @param {Array<{id: string, mood: string|null}>} says  markSay()'s list
 * @param {object|null} cast  CourseCast.active()
 */
export function applySay(container, says, cast) {
  if (!container || !says?.length) return;
  let styled = false;
  for (const p of container.querySelectorAll('p')) {
    const t = firstText(p);
    const m = t && SAY_TOKEN_RE.exec(t.nodeValue);
    if (!m || t.nodeValue.slice(0, m.index).trim()) continue;
    t.nodeValue = t.nodeValue.slice(m.index + m[0].length).replace(/^\s+/, '');
    const say = says[Number(m[1])];
    if (!say) continue;
    const ch = cast?.chars?.[say.id];
    if (!ch) {
      warnOnce(cast?.bundleId, say.id, cast ? 'not a character of this course\'s cast' : 'this course has no story cast');
      continue;
    }
    if (!styled) { ensureStyles(container.getRootNode()); styled = true; }

    const wrap = document.createElement('div');
    wrap.className = 'say';
    wrap.dataset.say = say.id;
    wrap.dataset.side = say.id === cast.narrator ? 'left' : 'right';
    const face = document.createElement('span');
    face.className = 'say-face';
    face.setAttribute('aria-hidden', 'true');
    const fig = document.createElement(cast.tags[say.id]);
    fig.setAttribute('framing', 'portrait');
    if (say.mood) fig.setAttribute('mood', say.mood);
    face.append(fig);
    const bubble = document.createElement('div');
    bubble.className = 'say-bubble';
    const name = document.createElement('span');
    name.className = 'say-name';
    name.textContent = ch.label;
    p.replaceWith(wrap);
    bubble.append(name, p);
    wrap.append(face, bubble);
  }
  stripLeftovers(container);
}
