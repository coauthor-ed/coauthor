import { createDialogOverlay, escHtml } from './dialogs.js';
import { A11yAnnouncer } from '../../core/A11yAnnouncer.js';
import { CourseSourceManager } from '../../core/CourseSourceManager.js';

/**
 * Full-size, pannable view of a slide image — the escape hatch for a
 * dense/baked-in-text infographic that `resolveImageLayout()`
 * (`src/core/components/blockImageLayout.js`) has had to shrink to fit a
 * constrained column or short viewport.
 *
 * Deliberately *not* a pinch/scale-past-natural-size zoom: these sources
 * only run ~1024×768 (see the extensive reasoning in blockImageLayout.js's
 * own comment on why deeper zoom doesn't help them), so the point is
 * *reaching* legible 1:1 size in a large-enough viewport, not scaling past
 * it. The `<img>` renders at its natural pixel size with no width/height
 * override; a plain `overflow: auto` wrapper does the panning, so there is
 * no transform math to keep in sync with anything.
 *
 * `openImageLightbox(image)` deliberately takes the bare image, never a
 * `focus` rect — this is intentionally the unmasked, unlabeled "see the
 * whole picture at full resolution" view, so no mask and no label callout
 * (`renderFocusCallout` in blockImageLayout.js) render here. Not an omission.
 */

let cssInjected = false;
function ensureCSS() {
  if (cssInjected || document.getElementById('image-lightbox-css')) return;
  cssInjected = true;
  const style = document.createElement('style');
  style.id = 'image-lightbox-css';
  style.textContent = `
    .il-dialog {
      max-width: 94vw;
      max-height: 94vh;
      width: auto;
      padding: 0;
      border: none;
      background: transparent;
      overflow: visible;
    }
    .il-dialog::backdrop { background: var(--reveal-scrim-strong); }
    .il-scroll {
      max-width: 94vw;
      max-height: 94vh;
      overflow: auto;
      display: flex;
      border-radius: 8px;
      background: var(--shell-bg);
    }
    .il-scroll img {
      display: block;
      /* Natural pixel size, deliberately unconstrained — see file header. */
    }
    .il-close {
      position: fixed;
      top: max(12px, env(safe-area-inset-top));
      right: max(12px, env(safe-area-inset-right));
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: none;
      background: var(--reveal-scrim-strong);
      color: var(--reveal-on-scrim);
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .il-close:focus-visible { outline: 2px solid var(--reveal-on-scrim); outline-offset: 2px; }
  `;
  document.head.appendChild(style);
}

export function openImageLightbox(image, bundleId = null) {
  if (!image?.src) return;
  ensureCSS();

  const dialog = createDialogOverlay();
  dialog.classList.add('il-dialog');
  dialog.innerHTML = `
    <button type="button" class="il-close" aria-label="Close expanded image">&#10005;</button>
    <div class="il-scroll">
      <img src="${escHtml(CourseSourceManager.resolveRef(image.src, bundleId))}" alt="${escHtml(image.alt || '')}">
    </div>
  `;

  // Escape and backdrop clicks both fire the dialog's native 'close'/'cancel'
  // sequence — routing cleanup through the single 'close' listener means the
  // button doesn't need its own duplicate teardown logic.
  dialog.addEventListener('close', () => {
    dialog.remove();
    A11yAnnouncer.announce('Image closed');
  });
  dialog.querySelector('.il-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  document.body.appendChild(dialog);
  dialog.showModal();
  A11yAnnouncer.announce('Image expanded. Press Escape to close.');
}
