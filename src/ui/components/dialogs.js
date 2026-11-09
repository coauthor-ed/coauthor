export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createModalCSS() {
  if (document.getElementById('aa-dialog-css')) return;
  const style = document.createElement('style');
  style.id = 'aa-dialog-css';
  style.textContent = `
    .aa-dialog-box::backdrop {
      background: rgba(15, 23, 42, 0.65);
    }
    .aa-dialog-box {
      margin: auto;
      background: var(--bg-surface);
      color: var(--text-main);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
      width: 90%;
      max-width: 450px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .aa-dialog-title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: var(--fw-medium);
      color: var(--text-main);
    }
    .aa-dialog-message {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.5;
      color: var(--text-muted);
      white-space: pre-wrap;
    }
    .aa-dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 8px;
    }
    .aa-dialog-btn {
      font-family: var(--font-heading, 'Outfit', 'Inter', system-ui, sans-serif);
      font-weight: var(--fw-heavy);
      font-size: 14px;
      padding: 10px 16px;
      border-radius: 12px;
      border: 1px solid var(--border-color);
      background: var(--bg-base);
      color: var(--text-main);
      cursor: pointer;
      box-shadow: 0 5px 0 var(--border-color);
      transition: transform 0.08s;
      letter-spacing: 0.01em;
    }
    .aa-dialog-btn:active:not(:disabled) { transform: translateY(4px); box-shadow: none !important; }
    .aa-dialog-btn.primary { background: var(--primary-color); box-shadow: 0 5px 0 var(--primary-hover); color: var(--on-primary); border: none; }

    /* Authoring-app context (mounted under #aa-shell): swap the playful
       "3D press" student-runtime button for the flatter, mature style used
       throughout the rest of the authoring UI. See docs/ui-ux-design-system.md. */
    body:has(#aa-shell) .aa-dialog-btn {
      font-family: var(--font-family);
      font-weight: 500;
      font-size: 0.875rem;
      padding: 8px 16px;
      border-radius: 8px;
      box-shadow: none;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      letter-spacing: normal;
    }
    body:has(#aa-shell) .aa-dialog-btn:hover:not(:disabled) {
      background: var(--bg-panel);
      border-color: var(--primary-color);
      transform: translateY(-1px);
      box-shadow: var(--shadow-sm);
    }
    body:has(#aa-shell) .aa-dialog-btn:active:not(:disabled) { transform: translateY(0); }
    body:has(#aa-shell) .aa-dialog-btn.primary {
      background: linear-gradient(135deg, var(--primary-color) 0%, #6366f1 100%);
      box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3);
    }
    body:has(#aa-shell) .aa-dialog-btn.primary:hover:not(:disabled) {
      background: linear-gradient(135deg, var(--primary-hover) 0%, #4f46e5 100%);
      box-shadow: 0 4px 10px rgba(79, 70, 229, 0.4);
    }
    @keyframes aa-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

// Inject CSS immediately when module is loaded to prevent 1-frame FOUC
createModalCSS();

function createDialogEl() {
  const dialog = document.createElement('dialog');
  dialog.className = 'aa-dialog-box';
  return dialog;
}

export function createDialogOverlay() {
  return createDialogEl();
}

export function showAlert(message, title = 'Alert') {
  return new Promise(resolve => {
    setTimeout(() => {
      const dialog = createDialogEl();
    dialog.innerHTML = `
      <h3 class="aa-dialog-title" id="aa-dialog-title">${escHtml(title)}</h3>
      <p class="aa-dialog-message">${escHtml(message)}</p>
      <div class="aa-dialog-actions">
        <button class="aa-dialog-btn primary" id="aa-dialog-btn-ok">OK</button>
      </div>
    `;

    const close = () => {
      dialog.close();
      dialog.remove();
      resolve();
    };

    dialog.querySelector('#aa-dialog-btn-ok').addEventListener('click', close);
    // Native <dialog> already closes itself on Escape (via the browser's
    // close-watcher, independent of any keydown listener elsewhere in the
    // app — see the matching note in showConfirm below), but that alone
    // never resolves this promise, leaving the caller awaiting forever.
    // Drive it through the same close() as the OK button instead of letting
    // the default action run unaccompanied.
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    document.body.appendChild(dialog);
    dialog.showModal();
    }, 100);
  });
}

// `signal` (optional AbortSignal): aborting it cancels the dialog, resolving
// false. A view passes one it aborts on disconnect, because the dialog lives
// in document.body and outlives a route change; without it a stale confirm
// stays open over the next view, and its OK resumes the dead view's handler.
export function showConfirm(message, title = 'Confirm', confirmText = 'OK', cancelText = 'Cancel', { signal } = {}) {
  return new Promise(resolve => {
    setTimeout(() => {
      if (signal?.aborted) { resolve(false); return; }
      const dialog = createDialogEl();
    dialog.innerHTML = `
      <h3 class="aa-dialog-title" id="aa-dialog-title">${escHtml(title)}</h3>
      <p class="aa-dialog-message">${escHtml(message)}</p>
      <div class="aa-dialog-actions">
        <button class="aa-dialog-btn" id="aa-dialog-btn-cancel">${escHtml(cancelText)}</button>
        <button class="aa-dialog-btn primary" id="aa-dialog-btn-confirm">${escHtml(confirmText)}</button>
      </div>
    `;

    const close = (result) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    dialog.querySelector('#aa-dialog-btn-cancel').addEventListener('click', () => close(false));
    dialog.querySelector('#aa-dialog-btn-confirm').addEventListener('click', () => close(true));
    // Escape triggers the dialog's own native "cancel" close-watcher (this
    // is not a regular bubbling keydown — it fires even though nothing in
    // the app was listening for Escape). Without this listener the dialog
    // still visually closes on its own, but close(false) never runs, so the
    // caller's `await showConfirm(...)` hangs forever — treat it exactly
    // like clicking Cancel.
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
    signal?.addEventListener('abort', () => { if (dialog.isConnected) close(false); }, { once: true });
    document.body.appendChild(dialog);
    dialog.showModal();
    }, 100);
  });
}
