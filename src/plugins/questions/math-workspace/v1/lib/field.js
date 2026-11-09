/**
 * field.js - creates MathLive <math-field> elements imperatively.
 *
 * Fields are created once per line and kept on the line object; templates
 * render the element node itself. Never bind .value from a template:
 * MathLive re-parses on every set and the caret jumps (see equation-input@1).
 */

let mathlivePromise = null;

export function loadMathLive() {
  if (!mathlivePromise) {
    mathlivePromise = import('vendor/mathlive.js').then((m) => {
      try {
        // Our own topic keypad covers the common keys; MathLive's virtual
        // keyboard still shows on touch devices (policy auto) for the rest.
        m.MathfieldElement.soundsDirectory = null;
        m.MathfieldElement.plonkSound = null;
      } catch { /* older builds */ }
      return m;
    });
  }
  return mathlivePromise;
}

/**
 * @param {object} o
 * @param {string} [o.value]
 * @param {string} [o.placeholder]  LaTeX placeholder (shown when empty)
 * @param {string} [o.label]        aria-label
 * @param {(latex:string)=>void} [o.onInput]
 * @param {(latex:string, how:'enter'|'blur')=>void} [o.onCommit]
 * @param {(el:HTMLElement)=>void} [o.onFocus]
 */
export function createField(o = {}) {
  const mf = document.createElement('math-field');
  mf.setAttribute('math-virtual-keyboard-policy', 'auto');
  if (o.placeholder) mf.setAttribute('placeholder', o.placeholder);
  if (o.label) mf.setAttribute('aria-label', o.label);
  mf.setAttribute('smart-fence', '');
  if (o.value) {
    // Before upgrade the property may not exist yet; setting the text
    // content is how MathLive reads an initial value.
    mf.textContent = o.value;
  }
  let lastCommitted = o.value || '';
  // MathLive fires 'change' BEFORE the 'insertLineBreak' input on Enter, and
  // again on blur. A change is therefore held for a moment: if an Enter
  // arrives in that window, only the Enter commit runs (one check, one event).
  let enterAt = 0;
  mf.addEventListener('input', (ev) => {
    if (ev.inputType === 'insertLineBreak') {
      enterAt = Date.now();
      const v = mf.value;
      lastCommitted = v;
      o.onCommit?.(v, 'enter');
      return;
    }
    o.onInput?.(mf.value);
  });
  mf.addEventListener('change', () => {
    const at = Date.now();
    setTimeout(() => {
      if (enterAt >= at - 5) return;
      const v = mf.value;
      if (v === lastCommitted) return;
      lastCommitted = v;
      o.onCommit?.(v, 'blur');
    }, 40);
  });
  mf.addEventListener('focus', () => o.onFocus?.(mf));
  mf.addEventListener('focusin', () => o.onFocus?.(mf));
  try { mf.menuItems = []; } catch { /* set after upgrade below */ }
  customElements.whenDefined('math-field').then(() => {
    try { mf.menuItems = []; } catch { /* ignore */ }
  });
  mf.setValueQuiet = (latex) => {
    lastCommitted = latex || '';
    if (typeof mf.setValue === 'function') mf.setValue(latex || '', { silenceNotifications: true });
    else mf.textContent = latex || '';
  };
  return mf;
}

/** A fresh static math-span (MathLive renders it once on connect). */
export function mathSpan(latex, cls = '') {
  const el = document.createElement('math-span');
  if (cls) el.className = cls;
  el.textContent = latex || '';
  return el;
}

/** Plain-text spelling of a keypad insert, for a plain <input> target
 *  (the interval builder's end boxes). Null when it has no plain form. */
const PLAIN = { '\\infty': '\u221e', '-\\infty': '-\u221e', '\\pi': '\u03c0', '=': '=', ',': ',', 'x': 'x', '\\pm': '\u00b1' };
function plainOf(latex) {
  if (PLAIN[latex] !== undefined) return PLAIN[latex];
  if (/^[-0-9.,()[\]<>a-z]$/i.test(latex)) return latex;
  return null;
}

function insertIntoInput(el, latex) {
  el.focus();
  const a = el.selectionStart ?? el.value.length;
  const b = el.selectionEnd ?? a;
  if (latex === '#clear') el.value = '';
  else if (latex === '#backspace') {
    const from = a === b ? Math.max(0, a - 1) : a;
    el.value = el.value.slice(0, from) + el.value.slice(b);
    el.setSelectionRange(from, from);
  } else if (latex === '#left' || latex === '#right') {
    const p = Math.max(0, Math.min(el.value.length, a + (latex === '#left' ? -1 : 1)));
    el.setSelectionRange(p, p);
    return;
  } else if (latex === '#undo' || latex === '#redo') {
    try { document.execCommand(latex.slice(1)); } catch { /* not supported */ }
  } else {
    const t = plainOf(latex);
    if (t === null) return;
    el.value = el.value.slice(0, a) + t + el.value.slice(b);
    el.setSelectionRange(a + t.length, a + t.length);
  }
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

/** Insert from the keypad into a field, keeping focus in it. */
export function insertInto(mf, latex) {
  if (!mf) return;
  try {
    if (mf instanceof HTMLInputElement) { insertIntoInput(mf, latex); return; }
    mf.focus();
    if (latex === '#backspace') mf.executeCommand('deleteBackward');
    else if (latex === '#left') mf.executeCommand('moveToPreviousChar');
    else if (latex === '#right') mf.executeCommand('moveToNextChar');
    else if (latex === '#undo') mf.executeCommand('undo');
    else if (latex === '#redo') mf.executeCommand('redo');
    else if (latex === '#clear') { mf.executeCommand('selectAll'); mf.executeCommand('deleteBackward'); }
    else mf.insert(latex, { focus: true, scrollIntoView: true, format: 'latex', selectionMode: 'placeholder' });
    mf.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
  } catch (err) {
    console.warn('[math-workspace] keypad insert failed', err);
  }
}
