/**
 * SimPick - pick-and-place for DOM boards: pointer drag, tap-then-tap, and
 * keyboard (Tab to an item, Enter/Space picks, arrows move between targets,
 * Enter drops, Escape cancels). Never HTML5 drag events (no keyboard path,
 * unreliable on touch). Styling: sim-pick-* classes in SIM_UI_CSS.
 *
 *   const pick = simPick(this.root, {
 *     items: '[data-item]', targets: '[data-bin]',
 *     onDrop: (itemId, targetId, itemEl, targetEl) => this.place(itemId, targetId),
 *     canDrop: (itemId, targetId) => true,        // false: refused with a shake
 *     onPick: (itemId) => {}, onCancel: () => {},
 *     announce: (text) => {} });                  // default: a live region in root
 *   pick.selected       // picked item id or null
 *   pick.cancel(); pick.destroy();                // destroy() in the scene's destroy()
 * Ids: data-item / data-bin (else data-id). Items and targets may be re-rendered
 * freely (event delegation; tabindex/role are re-applied on DOM changes).
 *
 * Sort mode (track: true): the picker remembers where each item went, so a board
 * gets live per-target counts without bookkeeping of its own.
 *   pick.placed            Map itemId -> targetId (a re-drop moves the item)
 *   pick.count(targetId)   items now in that target;  pick.counts() -> { targetId: n }
 *   pick.unplace(itemId)   forget an item (it went back to the tray)
 *   [data-count="<targetId>"] elements in root are kept up to date with
 *   o.countText(n, targetId) (default: the number). A refused drop shakes the
 *   target (canDrop false) and changes no count. onDrop does NOT fire on a
 *   refused drop: canDrop is checked first and the drop returns.
 *
 * Custom hit-test (targetAt): a drop target need not be a rectangle, e.g. a Venn
 * region decided by circle maths. Called on every drag move, drag drop and
 * pointer tap-to-drop with pt = { x, y, clientX, clientY }: x, y in root-local
 * design px (the unscaled root), clientX/Y for getScreenCTM()-style SVG maths.
 *   targetAt: (pt) => targetId | null | undefined
 * null = no target there (a drag goes home); undefined = fall back to the usual
 * [data-bin] element hit-test. The id need not have an element: name/announce
 * then use the id, and a refused drop does not shake. If an element with that
 * id exists (matched by targetId(el)) it gets sim-pick--over and the shake.
 *   onOver: (targetId | null) => {}   // hover feedback for element-less regions
 *
 * Settle (settle: 'spring'): a dropped item glides from where it was let go to
 * its new place (FLIP: measured after onDrop re-renders, the new element is
 * found by its id), and a refused or off-target drag glides home, instead of
 * snapping. Tap and keyboard drops glide too. springPreset: a SimAnim SPRINGS
 * name or {period, zeta} (default 'smooth'). Reduced motion: snaps, as before.
 * One rAF loop runs only while something glides and stops when all land.
 *   pick.settling      true while any item glides (OR it into a scene's busy())
 * @opts items, targets, onDrop, canDrop, onPick, onCancel, announce, itemId, targetId, track, countText, targetAt, onOver, settle, springPreset
 */
import { springStep, uiSpring, reducedMotion, dur } from './SimAnim.js';

export function simPick(root, o = {}) {
  const ITEM = o.items ?? '[data-item]', TGT = o.targets ?? '[data-bin]';
  const itemId = o.itemId ?? ((el) => el.dataset.item ?? el.dataset.id);
  const targetId = o.targetId ?? ((el) => el.dataset.bin ?? el.dataset.target ?? el.dataset.id);
  const name = (el) => el?.getAttribute('aria-label') || el?.textContent.trim().replace(/\s+/g, ' ') || '';
  let live = null;
  const say = (t) => {
    if (o.announce) return o.announce(t);
    if (!live) {
      live = document.createElement('div');
      live.className = 'sim-pick-live';
      live.setAttribute('aria-live', 'polite');
      root.appendChild(live);
    }
    live.textContent = t;
  };
  let sel = null, drag = null, over = null;
  const placed = new Map();
  const counts = () => {
    const out = {};
    for (const t of placed.values()) out[t] = (out[t] ?? 0) + 1;
    return out;
  };
  const paintCounts = () => {
    if (!o.track) return;
    const n = counts();
    for (const el of root.querySelectorAll('[data-count]')) {
      const id = el.dataset.count, k = n[id] ?? 0;
      el.textContent = o.countText ? o.countText(k, id) : String(k);
    }
  };
  const targets = () => [...root.querySelectorAll(TGT)];
  const findTarget = (id) => targets().find((el) => targetId(el) === id) ?? null;
  const findItem = (id) => [...root.querySelectorAll(ITEM)].find((el) => itemId(el) === id) ?? null;
  const rootScale = () => {
    const r = root.getBoundingClientRect();
    return { r, k: r.width / (root.offsetWidth || r.width) || 1 };
  };

  // -- settle: spring glide (FLIP). glides: itemId -> { el, x, y, saved }.
  const SPRING = o.settle === 'spring';
  const glides = new Map();
  let raf = 0, lastT = 0;
  const unstyle = (g) => {
    if (!g.el) return;
    g.el.style.transform = '';
    g.el.style.transition = g.saved.transition;
    g.el.style.zIndex = g.saved.zIndex;
    g.el.style.position = g.saved.position;
  };
  const restyle = (g, el) => {
    g.el = el;
    g.saved = { transition: el.style.transition, zIndex: el.style.zIndex, position: el.style.position };
    el.style.transition = 'none';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.zIndex = '20';
  };
  const stopGlide = (id) => {
    const g = glides.get(id);
    if (!g) return null;
    glides.delete(id);
    unstyle(g);
    if (!glides.size && raf) { cancelAnimationFrame(raf); raf = 0; }
    return g;
  };
  const frame = (t) => {
    raf = 0;
    const dt = Math.min(Math.max((t - lastT) / 1000, 0), 1 / 30);
    lastT = t;
    for (const [id, g] of [...glides]) {
      let el = g.el?.isConnected ? g.el : findItem(id);
      if (!el) { glides.delete(id); continue; }
      if (el !== g.el) restyle(g, el);
      const a = springStep(g.x, 0, dt, uiSpring(o.springPreset ?? 'smooth'));
      const b = springStep(g.y, 0, dt, uiSpring(o.springPreset ?? 'smooth'));
      if (!a && !b) { stopGlide(id); continue; }
      el.style.transform = `translate(${g.x.x}px, ${g.y.x}px)`;
    }
    if (glides.size) raf = requestAnimationFrame(frame);
  };
  // Glide item id from client rect `from` to wherever its element now lays out.
  const glide = (id, from) => {
    if (!SPRING || !from || reducedMotion() || dur(1) === 0 || typeof requestAnimationFrame !== 'function') return;
    const old = glides.get(id);
    stopGlide(id);
    const el = findItem(id);
    if (!el) return;
    const to = el.getBoundingClientRect(), { k } = rootScale();
    const dx = (from.left - to.left) / k, dy = (from.top - to.top) / k;
    if (Math.hypot(dx, dy) < 0.5) return;
    const g = { el: null, x: { x: dx, v: old?.x.v ?? 0 }, y: { x: dy, v: old?.y.v ?? 0 }, saved: null };
    restyle(g, el);
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    glides.set(id, g);
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
  };
  const rectOf = (el) => (SPRING && el ? el.getBoundingClientRect() : null);

  const decorate = () => {
    for (const el of root.querySelectorAll(ITEM)) {
      if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-pressed', el === sel ? 'true' : 'false');
      el.classList.add('sim-pick-item');
    }
    for (const el of targets()) {
      el.classList.add('sim-pick-target');
      el.classList.toggle('sim-pick--armed', !!sel);
      if (sel) { el.tabIndex = 0; el.setAttribute('role', 'button'); }
      else if (el.getAttribute('role') === 'button' && !el.matches(ITEM)) { el.removeAttribute('tabindex'); el.removeAttribute('role'); }
    }
  };
  let queued = false;
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; if (sel && !sel.isConnected) sel = null; decorate(); });
  }) : null;
  mo?.observe(root, { childList: true, subtree: true });

  const setOver = (el) => {
    if (over === el) return;
    over?.classList.remove('sim-pick--over');
    over = el;
    over?.classList.add('sim-pick--over');
  };
  const pick = (el) => {
    sel?.classList.remove('sim-pick--picked');
    sel = el;
    sel.classList.add('sim-pick--picked');
    decorate();
    o.onPick?.(itemId(el));
    say(`Picked ${name(el)}. Choose where it goes.`);
  };
  const cancel = (quiet) => {
    if (!sel) return;
    sel.classList.remove('sim-pick--picked');
    sel = null;
    hover(null);
    decorate();
    o.onCancel?.();
    if (!quiet) say('Put back.');
  };
  // tgt: the target element (may be null when targetAt names an element-less region); id: its id.
  // from: the item's client rect before the drop (settle), else measured here.
  const drop = (el, tgt, id = targetId(tgt), from = rectOf(el)) => {
    const a = itemId(el), b = id;
    const where = name(tgt) || String(b);
    if (o.canDrop && !o.canDrop(a, b)) {
      if (tgt) {
        tgt.classList.remove('sim-pick--no');
        void tgt.offsetWidth;                     // restart the shake
        tgt.classList.add('sim-pick--no');
      }
      say(`${name(el)} cannot go in ${where}.`);
      return false;
    }
    const label = name(el);
    cancel(true);
    if (o.track) { placed.set(a, b); paintCounts(); }
    o.onDrop?.(a, b, el, tgt);
    glide(a, from);
    say(`${label} placed in ${where}.`);
    return true;
  };

  // Target under a point -> { id, el } or null. o.targetAt first (see header).
  const hitAt = (x, y, skip) => {
    if (o.targetAt) {
      const { r, k } = rootScale();
      const id = o.targetAt({ x: (x - r.left) / k, y: (y - r.top) / k, clientX: x, clientY: y });
      if (id === null) return null;
      if (id !== undefined) return { id, el: findTarget(id) };
    }
    const el = targetAt(x, y, skip);
    return el ? { id: targetId(el), el } : null;
  };
  let overId = null;
  const hover = (hit) => {
    setOver(hit?.el ?? null);
    const id = hit ? hit.id : null;
    if (id !== overId) { overId = id; o.onOver?.(id); }
  };

  // Target element under a point, skipping the dragged element itself.
  const targetAt = (x, y, skip) => {
    const doc = root.getRootNode?.() ?? document;
    const list = doc.elementsFromPoint ? doc.elementsFromPoint(x, y) : document.elementsFromPoint(x, y);   // bound call: unbound threw Illegal invocation
    for (const el of list) {
      if (skip && (el === skip || skip.contains(el))) continue;
      const t = el.closest?.(TGT);
      if (t && root.contains(t)) return t;
    }
    return null;
  };

  const onDown = (e) => {
    const it = e.target.closest(ITEM);
    if (!it || !root.contains(it) || it.getAttribute('aria-disabled') === 'true' || e.button > 0) return;
    const g = stopGlide(itemId(it));              // grabbed mid-glide: carry on from where it is
    drag = { el: it, x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId, scale: rootScale().k, bx: g?.x.x ?? 0, by: g?.y.x ?? 0 };
    if (g) it.style.transform = `translate(${drag.bx}px, ${drag.by}px)`;
    try { it.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ }
  };
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x0) / drag.scale, dy = (e.clientY - drag.y0) / drag.scale;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      if (sel !== drag.el) pick(drag.el);
      drag.el.classList.add('sim-pick--dragging');
    }
    drag.el.style.transform = `translate(${dx + drag.bx}px, ${dy + drag.by}px)`;
    hover(hitAt(e.clientX, e.clientY, drag.el));
    e.preventDefault();
  };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    const rect0 = d.moved || d.bx || d.by ? rectOf(d.el) : null;
    d.el.classList.remove('sim-pick--dragging');
    if (SPRING) {                               // clear the drag offset with no CSS tween fighting the glide
      const keep = d.el.style.transition;
      d.el.style.transition = 'none';
      d.el.style.transform = '';
      void d.el.offsetWidth;
      d.el.style.transition = keep;
    } else d.el.style.transform = '';
    if (!d.moved) {
      glide(itemId(d.el), rect0);
      // With a card picked, tapping a card that sits in another target drops there (a full bin stays droppable).
      const home = d.el.parentElement?.closest(TGT), from = sel?.parentElement?.closest(TGT);
      if (sel === d.el) cancel();
      else if (sel && home && home !== from && root.contains(home)) drop(sel, home);
      else pick(d.el);
      return;
    }
    const hit = e.type === 'pointerup' ? hitAt(e.clientX, e.clientY, d.el) : null;
    hover(null);
    if (!hit || !drop(d.el, hit.el, hit.id, rect0)) {
      cancel(true);
      glide(itemId(d.el), rect0);
    }
  };
  const onClick = (e) => {
    if (!sel || e.target.closest(ITEM)) return;
    if (o.targetAt && e.detail > 0) {             // a real pointer click (keyboard clicks have detail 0)
      const hit = hitAt(e.clientX, e.clientY, null);
      if (hit) { drop(sel, hit.el, hit.id); return; }
      if (hit === null && !e.target.closest(TGT)) return;
    }
    const tgt = e.target.closest(TGT);
    if (tgt && root.contains(tgt)) drop(sel, tgt);
  };
  const onKey = (e) => {
    const it = e.target.closest?.(ITEM), tgt = e.target.closest?.(TGT);
    if (e.key === 'Escape' && sel) { const back = sel; cancel(); back.focus?.(); e.preventDefault(); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      if (it && e.target === it) {
        const home = it.parentElement?.closest(TGT), from = sel?.parentElement?.closest(TGT);
        if (sel === it) cancel();
        else if (sel && home && home !== from) drop(sel, home);
        else { pick(it); targets()[0]?.focus?.(); }
        e.preventDefault();
        return;
      }
      if (tgt && sel && e.target === tgt) { drop(sel, tgt); e.preventDefault(); }
      return;
    }
    if (sel && tgt && /^Arrow/.test(e.key)) {
      const list = targets(), i = list.indexOf(tgt);
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      list[(i + step + list.length) % list.length]?.focus?.();
      e.preventDefault();
    }
  };
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  decorate();
  paintCounts();

  return {
    placed,
    count: (id) => counts()[id] ?? 0,
    counts,
    unplace(id) { placed.delete(id); paintCounts(); },
    get selected() { return sel ? itemId(sel) : null; },
    get settling() { return glides.size > 0; },
    cancel: () => cancel(true),
    refresh: decorate,
    destroy() {
      for (const id of [...glides.keys()]) stopGlide(id);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      mo?.disconnect();
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKey);
      live?.remove();
    },
  };
}
