import { createDialogOverlay, escHtml } from './dialogs.js';
import './ParentalGateHold.js';

/**
 * Wraps the existing press-and-hold `<parental-gate-hold>` in a modal
 * dialog — the Discover section's "Ask a parent to add this" action needs
 * an on-demand gate, unlike ParentDashboard's own full-page use of the same
 * component. Kept out of dialogs.js on purpose: that file is deliberately
 * component-dependency-free (see its own `#aa-shell` shared-with-
 * authoring-app comment), and `<parental-gate-hold>` is student-runtime
 * only.
 *
 * Resolves `true` once the hold completes, `false` on cancel/dismiss — same
 * boolean-resolve contract as `showConfirm()`.
 */
export function showParentalGateHold(message = 'A parent needs to approve adding this course.') {
  return new Promise((resolve) => {
    setTimeout(() => {
      const dialog = createDialogOverlay();
      dialog.innerHTML = `
        <h3 class="aa-dialog-title">Parent approval needed</h3>
        <p class="aa-dialog-message">${escHtml(message)}</p>
        <div id="gate-hold-mount"></div>
        <div class="aa-dialog-actions">
          <button class="aa-dialog-btn" id="gate-hold-cancel">Cancel</button>
        </div>
      `;
      const gate = document.createElement('parental-gate-hold');
      gate.setAttribute('plain', ''); // the dialog is already the card
      dialog.querySelector('#gate-hold-mount').appendChild(gate);

      const close = (result) => {
        dialog.close();
        dialog.remove();
        resolve(result);
      };

      // A brief pause lets the gate's own "Unlocked! Entering…" state
      // actually flash before the dialog disappears out from under it.
      gate.addEventListener('parental-gate-unlocked', () => setTimeout(() => close(true), 400));
      dialog.querySelector('#gate-hold-cancel').addEventListener('click', () => close(false));
      dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });

      document.body.appendChild(dialog);
      dialog.showModal();
    }, 100);
  });
}
