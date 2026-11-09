// SimControls - the one place that knows which `static CONTROLS` types exist.
// No imports: the two plain-DOM preview pages (tests/simulation-showcase.html,
// simulations-kit/preview-harness.html), tools/sim-test (check-scene lint, probes,
// drive) and the two Lit hosts (content-block, simulationHost) all read it, so a
// new type is added here once and every consumer gets it.
//
// What the scene receives in onControlChange(id, value):
//   button            true
//   toggle, checkbox  true / false
//   slider, range, select, number, segmented   a STRING (the host never sends a number)
// segmented also sends a repeat tap on the selected option (kit/TapLight.js uses that to release), and
// tall: true draws it at least 44 px tall, for a row a finger uses.
// The current value shown is scene.getControlValue?.(id) ?? ctrl.value.

export const CONTROL_TYPES = ['button', 'slider', 'range', 'select', 'number', 'toggle', 'checkbox', 'segmented'];
export const STRING_TYPES = new Set(['slider', 'range', 'select', 'number', 'segmented']);
export const BOOL_TYPES = new Set(['toggle', 'checkbox']);
const NEEDS_OPTIONS = new Set(['select', 'segmented']);

export const optValue = (o) => (typeof o === 'string' ? o : o?.value);
export const optLabel = (o) => (typeof o === 'string' ? o : (o?.label ?? o?.value));

/** What the scene gets for a raw host value (a string for STRING_TYPES, a boolean for BOOL_TYPES). */
export function toControlValue(ctrl, raw) {
  if (ctrl.type === 'button') return true;
  if (BOOL_TYPES.has(ctrl.type)) return !!raw;
  return String(raw);
}

/** The value a control shows right now. */
export function controlCurrent(scene, ctrl) {
  const v = scene?.getControlValue?.(ctrl.id);
  return v !== undefined ? v : ctrl.value;
}

/** Problems with one CONTROLS entry: [{ code, id, detail }] (empty = fine). */
export function controlProblems(ctrl) {
  if (!ctrl || typeof ctrl !== 'object') return [{ code: 'shape', id: '?', detail: 'is not an object' }];
  const id = typeof ctrl.id === 'string' && ctrl.id ? ctrl.id : '?';
  const out = [];
  if (id === '?') out.push({ code: 'id', id, detail: 'has no string id' });
  if (!CONTROL_TYPES.includes(ctrl.type)) {
    out.push({ code: 'type', id, detail: ctrl.kind !== undefined && ctrl.type === undefined ? `found kind: '${ctrl.kind}'` : (ctrl.type !== undefined ? `found type: '${ctrl.type}'` : 'no type') });
  } else if (NEEDS_OPTIONS.has(ctrl.type)) {
    if (!Array.isArray(ctrl.options) || !ctrl.options.length) out.push({ code: 'options', id, detail: 'has no options[]' });
    else if (ctrl.options.some((o) => optValue(o) === undefined || optValue(o) === null)) out.push({ code: 'optvalue', id, detail: 'has an option with no value' });
  }
  return out;
}

const HINTS = {
  type: `have no valid type; the host draws only ${CONTROL_TYPES.join(', ')}, so each leaves an empty control bar. Use type: (not kind:)`,
  optvalue: 'have an option with no value: options are { value, label } or plain strings ({ id, label } renders value="undefined")',
  options: 'have no options[]',
  id: 'have no string id',
  shape: 'are not objects',
};

/** One message per kind of problem across a whole scene class (not one per control). */
export function controlsIssues(SceneClass) {
  const list = SceneClass?.CONTROLS;
  if (list === undefined) return [];
  if (!Array.isArray(list)) return ['static CONTROLS is not an array'];
  const byCode = new Map();
  for (const c of list) for (const p of controlProblems(c)) {
    if (!byCode.has(p.code)) byCode.set(p.code, []);
    byCode.get(p.code).push(p);
  }
  const out = [];
  for (const [code, ps] of byCode) {
    const items = ps.map((p) => (code === 'type' ? `'${p.id}' (${p.detail})` : `'${p.id}'`));
    out.push(`CONTROLS ${ps.length} entr${ps.length === 1 ? 'y' : 'ies'} ${HINTS[code].replace(/^have /, ps.length === 1 ? 'has ' : 'have ').replace(/^are /, ps.length === 1 ? 'is ' : 'are ')}: ${items.slice(0, 8).join(', ')}${items.length > 8 ? `, +${items.length - 8} more` : ''}`);
  }
  const seen = new Set(), dup = new Set();
  for (const c of list) { if (c && seen.has(c.id)) dup.add(c.id); seen.add(c?.id); }
  if (dup.size) out.push(`CONTROLS duplicate id(s): ${[...dup].map((d) => `'${d}'`).join(', ')}`);
  return out;
}

/**
 * Plain-DOM control bar for the preview pages. Rebuilds `box` from scratch; call it again
 * (`rerender`) after anything that can change hidden/disabled/value.
 * @param {HTMLElement} box
 * @param {Function} SceneClass
 * @param {object} scene
 * @param {{ rerender?: () => void }} [o]
 */
export function mountControlsDom(box, SceneClass, scene, o = {}) {
  const rerender = o.rerender || (() => mountControlsDom(box, SceneClass, scene, o));
  // A rebuild while a slider is held would swap the input out from under the pointer and end
  // the drag (a scene that calls requestUiUpdate() from onControlChange or a clock does that on
  // every input event). Hold the rebuild until the pointer is released.
  if (box.__simHeld) { box.__simHeld.pending = rerender; return; }
  const doc = typeof document !== 'undefined' ? document : null;
  const focusId = doc && box.contains?.(doc.activeElement) ? doc.activeElement?.dataset?.simCtrl : null;
  box.innerHTML = '';
  const send = (ctrl, raw) => scene?.onControlChange?.(ctrl.id, toControlValue(ctrl, raw));
  const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const labelled = (ctrl, child) => {
    const l = el('label', { textContent: `${ctrl.label || ctrl.id} ` });
    l.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-right:12px;';
    l.appendChild(child);
    return l;
  };
  for (const ctrl of SceneClass?.CONTROLS || []) {
    if (scene?.isControlHidden?.(ctrl.id)) continue;
    const disabled = !!scene?.isControlDisabled?.(ctrl.id);
    const cur = controlCurrent(scene, ctrl);
    let node = null;
    if (ctrl.type === 'button') {
      node = el('button', { textContent: ctrl.label || ctrl.id, disabled });
      node.onclick = () => { send(ctrl, true); rerender(); };
    } else if (ctrl.type === 'slider' || ctrl.type === 'range') {
      const input = el('input', { type: 'range', min: ctrl.min ?? 0, max: ctrl.max ?? 100, step: ctrl.step ?? 1, value: cur ?? 50, disabled });
      const val = el('span', { textContent: `${cur ?? 50}${ctrl.suffix ?? ''}` });
      input.addEventListener('pointerdown', () => holdRebuilds(box));
      input.oninput = (e) => { val.textContent = `${e.target.value}${ctrl.suffix ?? ''}`; send(ctrl, e.target.value); };
      const wrap = el('span'); wrap.append(input, val);
      node = labelled(ctrl, wrap);
    } else if (ctrl.type === 'select') {
      const select = el('select', { disabled });
      for (const opt of ctrl.options || []) select.appendChild(el('option', { value: optValue(opt), textContent: optLabel(opt), selected: String(optValue(opt)) === String(cur) }));
      select.onchange = (e) => { send(ctrl, e.target.value); rerender(); };
      node = labelled(ctrl, select);
    } else if (ctrl.type === 'number') {
      const input = el('input', { type: 'number', step: ctrl.step ?? 1, value: cur ?? '', disabled });
      if (ctrl.min != null) input.min = ctrl.min;
      if (ctrl.max != null) input.max = ctrl.max;
      input.onchange = (e) => send(ctrl, e.target.value);
      node = labelled(ctrl, input);
    } else if (ctrl.type === 'toggle' || ctrl.type === 'checkbox') {
      const input = el('input', { type: 'checkbox', checked: !!cur, disabled });
      input.onchange = (e) => { send(ctrl, e.target.checked); rerender(); };
      node = labelled(ctrl, input);
    } else if (ctrl.type === 'segmented') {
      const group = el('span');
      group.style.cssText = 'display:inline-flex;gap:2px;';
      for (const opt of ctrl.options || []) {
        const on = String(optValue(opt)) === String(cur);
        const b = el('button', { textContent: optLabel(opt), disabled });
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.style.fontWeight = on ? '700' : '400';
        if (ctrl.tall) b.style.minHeight = '44px';
        b.onclick = () => { send(ctrl, optValue(opt)); rerender(); };
        group.appendChild(b);
      }
      node = labelled(ctrl, group);
    }
    if (node) {
      const f = node.matches?.('input, select, button') ? node : node.querySelector?.('input, select');
      if (f?.dataset) f.dataset.simCtrl = ctrl.id;
      box.appendChild(node);
    }
  }
  // Keyboard users keep their place: the rebuilt control takes the focus back.
  if (focusId) {
    for (const n of box.querySelectorAll?.('[data-sim-ctrl]') ?? []) if (n.dataset.simCtrl === focusId) { n.focus({ preventScroll: true }); break; }
  }
}

/** Defer mountControlsDom rebuilds of `box` until the pointer goes up (then run the last one). */
function holdRebuilds(box) {
  if (box.__simHeld || typeof window === 'undefined') return;
  const held = { pending: null };
  box.__simHeld = held;
  const release = () => {
    window.removeEventListener('pointerup', release, true);
    window.removeEventListener('pointercancel', release, true);
    if (box.__simHeld === held) box.__simHeld = null;
    held.pending?.();
  };
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
}
