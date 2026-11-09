/**
 * TapLight - tap to light: a row of chips written as notation or terms ("A U B", "condenser", "F = ma").
 * A chip names plain-string targets the scene defines. The part says which targets are lit; the scene draws
 * that (dim and line width, never glow). It knows nothing about any subject.
 *
 *   class X extends SvgScene {                       // the same on any DomSimulation
 *     tl = tapLight({ label: 'Parts of the apparatus', chips: CHIPS, onChange: () => this.repaint() });
 *     async setup() { await super.setup(); this.tl.mount(this.root, this); }   // under the figure, in the scene
 *     paint(st) { const o = (t) => (this.tl.off(t) ? 'opacity:0.22' : ''); ... }
 *     destroy() { this.tl.destroy(); super.destroy(); }
 *   }
 *   CHIPS = [{ id: 'arm', label: 'side arm', targets: ['arm', 'vapour'], tone: 2 }, ...]
 *     id       stable string (default: label)
 *     label    plain text, escaped. html instead for sup/sub: html: supHtml('x', 2) (SimText; trusted scene markup, never content)
 *     say      spoken form, when label is notation: 'A union B'
 *     targets  strings the scene knows
 *     tone     series number (so A in the chip matches ring A) or token name; default the app's primary colour
 *
 *   tapLight(o)        o: label (the group's name), chips, onChange(lit, chip), announce(text)
 *                      announce: the scene's own a11y line; without it the row keeps an aria-live span
 *   .mount(host, scene)  scene injects TAP_LIGHT_CSS and gets relayout() when chips grow. Keep host out of what
 *                      the scene rewrites (SvgScene: this.root, not over or head). A scene that rewrites host
 *                      anyway writes innerHTML (not render({ html }), which measures the frame without the row) and
 *                      calls mount(newHost, this) after each write: lock and keyboard focus come back.
 *   .lit() -> targets  .has(t)  .any()  .off(t) (something is lit and t is not)  .chip()  .locked()  .disabled()
 *                      Safe in any paint, before mount too. Preview shows here as well as the lock.
 *   .set({ chips, lit, disabled })   for a beat: new list (same ids keep their buttons), preset a lock (null: none),
 *                      lock the row. Silent: no onChange, the scene repaints itself. Passing lit ends any preview, so
 *                      the beat's own state shows: see Behaviour.
 *   .reset()           nothing lit, and ends any preview the same way
 *   .destroy()         listeners and observers gone
 *
 * Behaviour: tap, click, Enter or Space locks; again releases; another chip moves the lock. Keyboard focus
 * previews, and so does a real mouse hover (pointerType mouse only; touch never previews). A preview
 * ending shows the lock again. A beat preset beats a resting mouse and a chip left focused from an earlier beat:
 * after set({ lit }) or reset() a preview shows only on a new pointer move, on Tab, or on a key on the row, not on the events a
 * browser sends when a row changes under a still mouse, and not when a rewrite or the host puts focus on a chip. One Tab stop, arrows and Home/End move, Escape releases. A swipe on the row is
 * the row's (touch-action: pan-y); clicks and pointer events stop at the row, so the scene underneath never
 * sees them. Chips stay at least 44 screen px tall, with 15 px text, under any scene scale.
 *
 * Canvas scenes (controls outside):
 *   static CONTROLS = [tapLightControl({ id: 'lit', label: 'Show', chips: CHIPS })];   // segmented + a None option
 *   static CONTROLS_IN_SIGHT = true;
 *   tl = tapLight({ chips: CHIPS });                  // never mounted
 *   getControlValue(id) { return id === 'lit' ? this.tl.controlValue() : undefined; }
 *   onControlChange(id, v) { if (id === 'lit') this.tl.fromControl(v); }
 *   isControlDisabled(id) { return id === 'lit' && this.tl.disabled(); }
 * Same lit targets, tap again releases. Labels are plain text there. No preview: the host's buttons report clicks only.
 *
 * Notation: chips use the body font (never the display font) over 'Sim Math' (vendor/fonts/app-fonts.css), a vendored
 * face that holds only maths operators, so set symbols, angle and congruence signs need no system font.
 * Colours are tokens only. Shape and motion come from the look. ASCII only.
 */

const MIN_PX = 44;
const MIN_TEXT = 15;        // screen px: a shrunk side panel must not shrink the words a finger aims at
const NONE = 'none';

export const TAP_LIGHT_CSS = `
.tl-row { position: relative; display: flex; flex-wrap: wrap; justify-content: center; align-items: stretch; gap: var(--sim-space-2);
  width: 100%; min-width: 0; box-sizing: border-box; padding: var(--sim-space-2) 0 var(--sim-space-1); touch-action: pan-y; }
.tl-chip { --tl-c: var(--primary-color, var(--sim-accent)); --tl-rim: var(--sim-stroke);
  appearance: none; box-sizing: border-box; min-height: var(--tl-h, 44px); min-width: var(--tl-h, 44px); max-width: 100%; margin: 0;
  padding: var(--sim-space-1) var(--sim-space-3); border: calc(2px * var(--look-rim)) solid var(--tl-rim); border-radius: var(--look-pill);
  background: var(--sim-bg-surface); color: var(--sim-label); cursor: pointer; touch-action: pan-y; -webkit-tap-highlight-color: transparent;
  font: 800 max(var(--sim-text-md), var(--tl-text, 0px))/1.2 'Sim Math', var(--sim-font), sans-serif;
  text-align: center; white-space: normal; overflow-wrap: anywhere;
  box-shadow: 0 calc(3px * var(--look-lip)) 0 color-mix(in oklab, var(--tl-rim) 62%, var(--sim-bg-deep));
  transition: background-color 0.12s ease, transform 0.12s var(--look-spring), box-shadow 0.12s ease; }
.tl-chip[data-tl-toned] { --tl-rim: var(--tl-c); }
.tl-chip[data-tl-preview] { background: color-mix(in oklab, var(--tl-c) 16%, var(--sim-bg-surface)); }
.tl-chip[aria-pressed="true"] { background: color-mix(in oklab, var(--tl-c) 34%, var(--sim-bg-surface)); transform: translateY(calc(2px * var(--look-lip)));
  box-shadow: inset 0 0 0 2px var(--tl-c), 0 calc(1px * var(--look-lip)) 0 color-mix(in oklab, var(--tl-rim) 62%, var(--sim-bg-deep)); }
.tl-chip .sim-sup, .tl-chip .sim-sub { font-size: max(14px, 0.75em); }
.tl-not { position: relative; display: inline-block; }
.tl-not::after { content: '/'; position: absolute; inset: 0; text-align: center; font-family: var(--sim-font); }
.tl-chip:active { transform: translateY(calc(2px * var(--look-lip))); }
.tl-chip:focus-visible { outline: 3px solid var(--sim-accent); outline-offset: 2px; }
.tl-chip[aria-disabled="true"] { cursor: default; }
.tl-chip[aria-disabled="true"]:not([aria-pressed="true"]) { opacity: 0.6; }
.tl-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .tl-chip { transition: none; } }
`;

// 'Sim Math' has no negated forms (KaTeX composes them), so the chip does: the plain sign under a stroke.
const NEGATED = { '\u2209': '\u2208', '\u2284': '\u2282', '\u2288': '\u2286', '\u2204': '\u2203' };
const NEGATED_RE = /([\u2209\u2284\u2288\u2204])/;

const toneCss = (t) => (typeof t === 'number' ? `var(--sim-series-${((Math.max(1, t | 0) - 1) % 8) + 1})` : `var(--sim-${t})`);

const norm = (list) => (list ?? []).map((c) => ({
  id: String(c.id ?? c.label), label: c.label ?? '', html: c.html ?? null, say: c.say ?? '', targets: [...(c.targets ?? [])], tone: c.tone ?? null,
}));

/** The host CONTROLS entry for a canvas scene (see the header): a tall segmented control with a none option. */
export function tapLightControl({ id = 'lit', label = 'Show', chips = [], noneLabel = 'None' } = {}) {
  return { type: 'segmented', tall: true, id, label, value: NONE, options: [{ value: NONE, label: noneLabel }, ...norm(chips).map((c) => ({ value: c.id, label: c.label }))] };
}

/** One row of chips and the lit state behind it (see the header). */
export function tapLight(o = {}) {
  let chips = norm(o.chips);
  let locked = null, hover = null, focused = null;   // lit = hover, else keyboard focus, else the lock
  let frozen = false, tabStop = null, keep = null;   // keep: the chip holding focus, to give it back after a rewrite
  let pointerAt = '';
  let muted = null;                                  // just released: no preview from it until the pointer or focus has left
  let held = false, quiet = false;                  // beat preset: held waits for a real pointer move, quiet for Tab or a key on the row
  let row = null, live = null, scene = null, ro = null, raf = 0, timer = 0, heightPx = 0, sent = '';
  const buttons = new Map();

  const find = (id) => (id === null ? null : chips.find((c) => c.id === id) ?? null);
  const current = () => find(hover ?? focused ?? locked);
  const lit = () => current()?.targets.slice() ?? [];
  const stamp = () => { const c = current(); return c ? `${c.id}\n${c.targets.join('\n')}` : ''; };

  function paint() {
    if (!row) return;
    const preview = hover ?? focused;
    const stop = find(tabStop) ? tabStop : (locked ?? chips[0]?.id);
    for (const [id, b] of buttons) {
      b.setAttribute('aria-pressed', id === locked ? 'true' : 'false');
      b.setAttribute('tabindex', id === stop ? '0' : '-1');
      if (frozen) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
      if (preview === id && locked !== id) b.setAttribute('data-tl-preview', ''); else b.removeAttribute('data-tl-preview');
    }
  }

  function changed() {
    paint();
    const s = stamp();
    if (s === sent) return;
    sent = s;
    o.onChange?.(lit(), current());
  }

  const say = (text) => { if (o.announce) o.announce(text); else if (live) live.textContent = text; };
  const nameOf = (c) => c.say || c.label || c.id;

  function release() {
    const c = find(locked);
    muted = hover ?? focused ?? locked;
    locked = null; hover = null; focused = null;
    if (c) say(`Released: ${nameOf(c)}.`);
    changed();
  }

  function press(id) {
    if (frozen) return;
    if (id === locked) { release(); return; }
    locked = id;
    say(`Lit: ${nameOf(find(id))}.`);
    changed();
  }

  const chipOf = (t) => t?.closest?.('.tl-chip') ?? null;
  const idOf = (b) => b?.getAttribute('data-tl-id') ?? null;
  const activeChip = () => { const a = row?.getRootNode?.().activeElement; return a && row.contains(a) ? chipOf(a) : null; };
  const stopHere = (e) => e.stopPropagation();

  const onClick = (e) => { e.stopPropagation(); const b = chipOf(e.target); if (b) press(idOf(b)); };

  // A scene that rewrites its row under a still mouse gets pointer events with no movement: those are not a hover.
  const moved = (e) => `${e.clientX},${e.clientY}` !== pointerAt;

  const preview = (e) => {
    const b = chipOf(e.target);
    if (!b || idOf(b) === hover) return;
    if (idOf(b) === muted) return;
    muted = null;
    hover = idOf(b);
    changed();
  };

  const onOver = (e) => {
    if (e.pointerType !== 'mouse' || frozen || held || !moved(e)) return;
    pointerAt = `${e.clientX},${e.clientY}`;
    preview(e);
  };

  // A row that changes under a still mouse gets pointer events too, with no movement in them.
  const onMove = (e) => {
    if (e.pointerType !== 'mouse' || frozen || !moved(e) || !(e.movementX || e.movementY)) return;
    held = false;
    pointerAt = `${e.clientX},${e.clientY}`;
    preview(e);
  };

  const onOut = (e) => {
    if (e.pointerType !== 'mouse' || !moved(e)) return;
    const to = chipOf(e.relatedTarget), id = hover ?? muted;
    if (to && idOf(to) === id) return;
    muted = null;
    if (hover === null) return;
    hover = null;
    changed();
  };

  const onFocusIn = (e) => {
    const b = chipOf(e.target);
    if (!b) return;
    keep = idOf(b); tabStop = keep;
    // :focus-visible: the keyboard only. A click focuses the button too, and that must not preview.
    if (keep !== muted) muted = null;
    const fresh = !frozen && !quiet && keep !== muted && e.target.matches?.(':focus-visible') ? keep : null;
    if (fresh !== focused) { focused = fresh; changed(); } else paint();
  };

  // Blur fires inside a scene's own innerHTML write, so nothing here runs until that write is over.
  const onFocusOut = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!row?.isConnected || activeChip()) return;
      keep = null; muted = null;
      if (focused !== null) { focused = null; changed(); }
    }, 0);
  };

  const onTab = (e) => { if (e.key === 'Tab') quiet = false; };   // Tab into the row counts; focus put there by code does not

  const onKey = (e) => {
    const b = chipOf(e.target);
    if (!b) return;
    quiet = false;
    const swallow = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'Escape') {
      if (locked === null && focused === null && hover === null) return;
      swallow();
      release();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.repeat) { e.preventDefault(); return; }
    const list = chips.map((c) => buttons.get(c.id)), i = list.indexOf(b), n = list.length;
    const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1 + n, ArrowUp: i - 1 + n, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    swallow();     // LessonSession turns the slide on an arrow nobody claimed
    list[to % n].focus({ preventScroll: true });
  };

  function fill(b, c) {
    const composed = c.html == null && NEGATED_RE.test(c.label);
    if (c.html != null) b.innerHTML = c.html;
    else if (!composed) b.textContent = c.label;
    else {
      b.textContent = '';
      for (const part of c.label.split(NEGATED_RE)) {
        const span = document.createElement('span');
        span.textContent = NEGATED[part] ?? part;
        if (NEGATED[part]) span.className = 'tl-not';
        b.appendChild(span);
      }
    }
    if (c.say || composed) b.setAttribute('aria-label', c.say || c.label); else b.removeAttribute('aria-label');
    if (c.tone != null) { b.setAttribute('data-tl-toned', ''); b.style.setProperty('--tl-c', toneCss(c.tone)); }
    else { b.removeAttribute('data-tl-toned'); b.style.removeProperty('--tl-c'); }
  }

  function endPreview() {
    hover = null; focused = null; muted = null;
    held = true; quiet = true;
  }

  function syncButtons() {
    if (!row) return;
    const kept = activeChip();
    for (const [id, b] of buttons) if (!find(id)) { b.remove(); buttons.delete(id); }
    chips.forEach((c, i) => {
      let b = buttons.get(c.id);
      if (!b) {
        b = document.createElement('button');
        b.className = 'tl-chip';
        b.setAttribute('type', 'button');
        b.setAttribute('data-tl-id', c.id);
        buttons.set(c.id, b);
      }
      fill(b, c);
      // Moving a focused node blurs it: touch the order only when it is wrong.
      const at = row.children?.[i];
      if (at !== b) row.insertBefore(b, at ?? live ?? null);
    });
    if (kept && !kept.isConnected) buttons.get(chips[0]?.id)?.focus({ preventScroll: true });
    paint();
    scene?.relayout?.();
  }

  function build() {
    row = document.createElement('div');
    row.className = 'tl-row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', o.label ?? 'Light a part of the figure');
    row.addEventListener('click', onClick);
    for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick']) row.addEventListener(t, stopHere);
    row.addEventListener('pointerover', onOver);
    row.addEventListener('pointermove', onMove);
    row.addEventListener('pointerout', onOut);
    row.addEventListener('focusin', onFocusIn);
    row.addEventListener('focusout', onFocusOut);
    row.addEventListener('keydown', onKey);
    globalThis.addEventListener?.('keydown', onTab, true);
    if (!o.announce) {
      live = document.createElement('span');
      live.className = 'tl-live';
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      row.appendChild(live);
    }
    syncButtons();
  }

  // Design px for 44 screen px: scenes are scaled to the host, and a phone scales them down.
  function fit() {
    raf = 0;
    if (!row?.isConnected) { unwatch(); return; }
    const w = row.offsetWidth, r = row.getBoundingClientRect().width;
    if (!w || !r) return;
    const k = Math.min(1, r / w), px = Math.ceil(MIN_PX / k);
    if (px === heightPx) return;
    heightPx = px;
    row.style.setProperty('--tl-h', `${px}px`);
    row.style.setProperty('--tl-text', `${Math.ceil(MIN_TEXT / k)}px`);
    scene?.relayout?.();
  }

  function unwatch() {
    ro?.disconnect();
    ro = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function watch() {
    unwatch();
    if (typeof ResizeObserver !== 'function') return;
    ro = new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(fit); });
    ro.observe(row.closest?.('.sim-dom-scale-wrap') ?? row);
  }

  return {
    mount(host, sc) {
      scene = sc ?? scene;
      scene?.injectStyle?.(TAP_LIGHT_CSS);
      if (!row) build();
      if (row.parentNode !== host) {
        host.appendChild(row);
        if (keep !== null) buttons.get(keep)?.focus({ preventScroll: true });
      }
      watch();
      scene?.relayout?.();
      return row;
    },
    lit,
    has: (t) => current()?.targets.includes(t) ?? false,
    any: () => (current()?.targets.length ?? 0) > 0,
    off(t) { const c = current(); return !!c && c.targets.length > 0 && !c.targets.includes(t); },
    chip: () => current(),
    locked: () => locked,
    disabled: () => frozen,
    set({ chips: next, lit: preset, disabled } = {}) {
      if (next) {
        chips = norm(next);
        if (!find(locked)) locked = null;
        if (!find(hover)) hover = null;
        if (!find(focused)) focused = null;
        syncButtons();
      }
      if (preset !== undefined) {
        locked = preset === null ? null : (find(String(preset))?.id ?? null);
        endPreview();
      }
      if (disabled !== undefined) {
        frozen = !!disabled;
        if (frozen) { hover = null; focused = null; }
      }
      paint();
      sent = stamp();
    },
    reset() { locked = null; endPreview(); paint(); sent = stamp(); },
    controlValue: () => locked ?? NONE,
    /** A host control's value: none releases, the locked chip again releases, another chip moves the lock. */
    fromControl(v) { if (String(v) === NONE) { if (locked !== null && !frozen) release(); } else if (find(String(v))) press(String(v)); },
    destroy() {
      unwatch();
      clearTimeout(timer);
      if (row) {
        row.removeEventListener('click', onClick);
        for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick']) row.removeEventListener(t, stopHere);
        row.removeEventListener('pointerover', onOver);
        row.removeEventListener('pointermove', onMove);
        row.removeEventListener('pointerout', onOut);
        row.removeEventListener('focusin', onFocusIn);
        row.removeEventListener('focusout', onFocusOut);
        row.removeEventListener('keydown', onKey);
        globalThis.removeEventListener?.('keydown', onTab, true);
        row.remove();
      }
      row = null; live = null; scene = null; keep = null; heightPx = 0;
      buttons.clear();
    },
  };
}
