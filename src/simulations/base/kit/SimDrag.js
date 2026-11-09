/**
 * SimDrag - the grab-and-drag plumbing every draggable canvas scene re-writes:
 * a generous hit radius, a grab offset (the handle does not jump to the
 * pointer), snapping, and a commit on release. Not a widget: it draws nothing;
 * a scene draws its handle (markerCanvas, a chip, a dot) at h.pos().
 *
 *   const h = dragHandle({
 *     at: () => ({ x, y }),            where the handle is now (design px)
 *     radius: 18,                      grab radius (use >= 18 for touch)
 *     snap: (p) => p,                  p = wanted centre {x, y} -> snapped {x, y}
 *     bounds: { x, y, w, h },          optional clamp for the wanted centre
 *     onMove: (p) => {},               every move, with the snapped centre
 *     onCommit: (p) => {},             release, with the last centre
 *     onStart: () => {},
 *   });
 *   pointerDown(p) { return h.down(p); }  pointerMove(p) { return h.move(p); }  pointerUp(p) { h.up(p); }
 *   h.dragging  true between down and up;  h.hover(p) -> bool (for a cursor / ring)
 * Return values follow SimScene: down() true if it took the press, move() true
 * when the frame needs a refresh.
 */
export function dragHandle(o) {
  const radius = o.radius ?? 18;
  const h = {
    dragging: false,
    off: { x: 0, y: 0 },
    last: null,
    hover(p) {
      if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return false;
      const a = o.at();
      return Math.hypot(p.x - a.x, p.y - a.y) <= radius;
    },
    down(p) {
      if (!h.hover(p)) return false;
      const a = o.at();
      h.dragging = true;
      h.off = { x: a.x - p.x, y: a.y - p.y };
      h.last = a;
      o.onStart?.();
      return true;
    },
    move(p) {
      if (!h.dragging || !Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return false;
      let q = { x: p.x + h.off.x, y: p.y + h.off.y };
      const b = o.bounds;
      if (b) q = { x: Math.max(b.x, Math.min(b.x + b.w, q.x)), y: Math.max(b.y, Math.min(b.y + b.h, q.y)) };
      if (o.snap) q = o.snap(q);
      h.last = q;
      o.onMove?.(q);
      return true;
    },
    up() {
      if (!h.dragging) return;
      h.dragging = false;
      o.onCommit?.(h.last);
    },
  };
  return h;
}
