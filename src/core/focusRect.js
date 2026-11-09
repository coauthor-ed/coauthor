/**
 * The geometry behind image focus — where the spotlight goes, and how far the
 * image may be nudged under it.
 *
 * Separate from `blockImageLayout.js`, which renders it, for two reasons:
 * that file imports `/vendor/lit.js` and so cannot be reached by
 * `test/unit/run.js` (plain node), and the authoring editor needs the same
 * normalisation for the rects an author drags out — two implementations of a
 * clamp that must agree is how a rect ends up rendering differently from where
 * it was drawn.
 *
 * Rects are fractional 0–1 in the image's own coordinate space — the same
 * convention as the existing point-pin editor
 * (`authoring-app/modules/forms/diagram-hotspot-editor.js`), extended from a
 * point to a rect. The repo now carries three coordinate vocabularies
 * (`{x,y}` + `shape:'circle'`, `{points:[[x,y]…]}` polygons, and this
 * `{x,y,w,h}`); the rect form earns its place because it describes a *viewport
 * crop* rather than a hit target, and neither of the others can express one.
 *
 * Fractions rather than pixels is also what lets the mask be positioned with
 * no natural dimensions at all: `renderBlockImage` sets `loading="lazy"`, so a
 * below-the-fold image can report `naturalWidth === 0` indefinitely, and any
 * pixel-based rect would have to wait for a `load` that may never come.
 */

/** Rounded the way diagram-hotspot-editor.js rounds its points. */
export const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Clamp a stored `{x,y,w,h}` into the unit square, or return null if it is
 * missing, malformed or degenerate. Callers treat null as "no focus for this
 * step", which renders the plain unmasked image.
 */
export function normalizeFocusRect(focus) {
  if (!focus) return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const x = num(focus.x), y = num(focus.y), w = num(focus.w), h = num(focus.h);
  if (x === null || y === null || w === null || h === null) return null;
  if (!(w > 0) || !(h > 0)) return null;
  const cx = Math.min(Math.max(x, 0), 1);
  const cy = Math.min(Math.max(y, 0), 1);
  const cw = Math.min(w, 1 - cx);
  const ch = Math.min(h, 1 - cy);
  if (!(cw > 0) || !(ch > 0)) return null;
  return { x: round3(cx), y: round3(cy), w: round3(cw), h: round3(ch) };
}

/**
 * Build a rect from two corners in fractional space — what a drag produces.
 * Either corner may be the "first" one, so this normalises the ordering.
 */
export function rectFromCorners(ax, ay, bx, by) {
  return normalizeFocusRect({
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  });
}

/**
 * The 2x2 auto-slice — the only panel preset that survives both the arithmetic
 * and the tooling.
 *
 * A row of N does not: framing a whole band needs a viewport aspect equal to
 * the band's, i.e. a 16:3 (4096x768) source for four 4:3 panels, and no
 * generator in the authoring loop emits that (ChatGPT offers 1024², 1536x1024,
 * 1024x1536; Imagen/Gemini offer 1:1, 3:4, 4:3, 9:16, 16:9). A 2x2 grid on a
 * 1024x1024 image is four 512x512 panels, each 1:1, in a 1:1 viewport —
 * exactly s = 2, no crop and no gutter.
 *
 * Reading order, so the ids line up with the beats as an author would write
 * them: top-left, top-right, bottom-left, bottom-right.
 */
export function sliceGrid2x2() {
  return [
    { x: 0,   y: 0,   w: 0.5, h: 0.5 },
    { x: 0.5, y: 0,   w: 0.5, h: 0.5 },
    { x: 0,   y: 0.5, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
  ];
}

export function sliceGrid1x2() {
  return [
    { x: 0,   y: 0, w: 0.5, h: 1 },
    { x: 0.5, y: 0, w: 0.5, h: 1 },
  ];
}

export function sliceGrid2x1() {
  return [
    { x: 0, y: 0,   w: 1, h: 0.5 },
    { x: 0, y: 0.5, w: 1, h: 0.5 },
  ];
}

/** How far past 1 the accent zoom may go. See focusScale. */
export const MAX_FOCUS_SCALE = 1.6;

/**
 * The scale that would *cover* the focus rect, capped.
 *
 * Cover (`max`), not contain (`min`): `min(1/w, 1/h)` fits the focus while
 * keeping its neighbours visible, which is the opposite of the intent. Worked
 * against the canonical case — a row of four, first band `{x:0,y:0,w:0.25,h:1}` —
 * contain gives `min(4, 1) = 1`, i.e. no zoom at all.
 *
 * The cap is about resolution, not taste. Shipped sources top out near 1029px
 * wide; at s=2 a 700 CSS-px column on a 2x-DPR phone asks 2800 device px of
 * 512 source px, a 5.5x upscale. s=2 is already soft and s=4 is mush, so the
 * zoom stays an accent and the mask does the work.
 */
export function focusScale(rect, opaque = false) {
  if (!rect) return 1;
  // When opaque (Clean Cut) is true, use contain logic (min) so the focus area 
  // is fully visible without cropping. Otherwise, use cover logic (max).
  const zoom = opaque 
    ? Math.min(1 / rect.w, 1 / rect.h)
    : Math.max(1 / rect.w, 1 / rect.h);
  return Math.min(MAX_FOCUS_SCALE, Math.max(1, zoom));
}

/**
 * The translate, in fractions of the element's own box, that centres `rect` —
 * clamped so the image never walks off its own viewport.
 *
 * With `transform-origin: 50% 50%` and the transform written
 * `scale(s) translate(t)`, the composition is S·T and CSS translate
 * percentages resolve against the element's *own* border box, unaffected by
 * the outer scale. So a point at fraction `u` lands at `s·(u - 0.5 + t)`.
 * Requiring `u = 0` to stay at or left of the viewport edge and `u = 1` at or
 * right of it gives `|t| <= 0.5 - 0.5/s`.
 *
 * Taking `t = 0.5 - c` literally — which is what centring wants — exceeds that
 * bound for any focus near an edge, and the result is a blank gutter across
 * part of the viewport with the rest of the image still on show: the precise
 * failure this whole design is a response to. Clamping puts the focus
 * off-centre instead of off-screen. The mask lives inside the same transformed
 * group, so it follows either way and cannot desync.
 *
 * The order matters: `translate(…) scale(s)` would need `t = -s·c` instead.
 */
/**
 * The window, in the *full image's own* fractional coordinate space, that
 * `object-fit: cover` actually displays when an image of `imageAspect`
 * (width/height) is forced to fill a box of `boxAspect` — i.e. what a viewer
 * sees is not the whole image, but this crop, centered (`object-position`'s
 * default `50% 50%`).
 *
 * Standard cover-crop derivation: the box's shorter relative dimension is
 * fully covered (no gutter), the image's longer relative dimension overflows
 * and is cropped symmetrically. When `imageAspect > boxAspect` (the image is
 * relatively wider than the box), the box's height is fully covered and the
 * width overflows — a horizontal crop of fractional width
 * `boxAspect / imageAspect`, full height. Otherwise it's the mirror: a
 * vertical crop of fractional height `imageAspect / boxAspect`, full width.
 *
 * Returns the identity window `{x:0,y:0,w:1,h:1}` (no crop) for
 * missing/invalid aspects, so a caller with unknown dimensions degrades to
 * "assume no crop" rather than throwing.
 */
export function coverCropWindow(imageAspect, boxAspect) {
  if (!(imageAspect > 0) || !(boxAspect > 0)) return { x: 0, y: 0, w: 1, h: 1 };
  if (imageAspect > boxAspect) {
    const w = boxAspect / imageAspect;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = imageAspect / boxAspect;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

/**
 * Remaps a focus rect authored in the *full image's* fractional coordinate
 * space into the coordinate space of a box that displays it via
 * `object-fit: cover` — the fix for the spotlight landing on the wrong part
 * of a `position: "background"` block's image on any viewport whose aspect
 * ratio differs from the image's own (which `focusMaskStyle()`/
 * `focusTransform()` in blockImageLayout.js otherwise assume never happens,
 * an assumption only `object-fit: cover` violates). A rect that falls partly
 * or fully outside the visible crop window is clamped by
 * `normalizeFocusRect`, same as any other out-of-bounds rect.
 *
 * No-ops (returns `rect` unchanged) when the aspect ratios are close enough
 * that `cover` crops essentially nothing, both to avoid float noise and so a
 * caller with only one of the two aspects known can pass the other as `null`
 * safely.
 */
export function remapRectForCover(rect, imageAspect, boxAspect) {
  if (!rect) return null;
  const crop = coverCropWindow(imageAspect, boxAspect);
  if (crop.w >= 0.999 && crop.h >= 0.999) return rect;
  return normalizeFocusRect({
    x: (rect.x - crop.x) / crop.w,
    y: (rect.y - crop.y) / crop.h,
    w: rect.w / crop.w,
    h: rect.h / crop.h,
  });
}

export function focusTranslate(rect, scale, opaque = false) {
  if (!rect) return { tx: 0, ty: 0 };
  if (!opaque && !(scale > 1)) return { tx: 0, ty: 0 };
  
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  
  // When opaque (Clean Cut) is true, we WANT the image to walk off its viewport
  // to perfectly center the focus rect. The opaque mask will fill the resulting gutter.
  if (opaque) {
    return {
      tx: 0.5 - cx,
      ty: 0.5 - cy,
    };
  }
  
  const limit = 0.5 - 0.5 / scale;
  const clamp = (v) => Math.min(limit, Math.max(-limit, v));
  return {
    tx: clamp(0.5 - cx),
    ty: clamp(0.5 - cy),
  };
}

/**
 * The fraction-space point on one edge of `rect`, midway along that edge —
 * where a label callout anchored to that side connects to the spotlighted
 * region. `anchor` defaults to `'right'`, matching `renderFocusCallout`'s own
 * default in blockImageLayout.js.
 */
export function focusAnchorPoint(rect, anchor = 'right') {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  switch (anchor) {
    case 'left':   return { ux: rect.x, uy: cy };
    case 'top':    return { ux: cx, uy: rect.y };
    case 'bottom': return { ux: cx, uy: rect.y + rect.h };
    case 'right':
    default:       return { ux: rect.x + rect.w, uy: cy };
  }
}

/** How close an edge may sit to the image's own edge before a callout
 *  anchored there is flipped to the opposite side instead. Deliberately
 *  generous (not just "touching the edge") — there is no DOM measurement of
 *  the callout's actual box width to clamp against (see the "known
 *  limitation" note on `.cb-image-capped` in blockImageLayout.js), so this
 *  has to assume a typically-sized label and leave itself margin for error. */
const FLIP_MARGIN = 0.18;

/**
 * Whether `anchor` gives a callout anchored to `rect` enough room to render,
 * purely from the rect's own fractional coordinates — no DOM measurement, so
 * this is a heuristic, not a guarantee (see `FLIP_MARGIN`).
 *
 * Picks the side with the *most* room, not just the literal opposite of what
 * was requested — a rect that spans nearly the whole image on one axis (e.g.
 * a tall column, `h` close to 1) has no good `top` *or* `bottom` option
 * regardless of which one was asked for, so flipping within the same axis
 * would just trade one cramped edge for another. Falling back to whichever
 * of all four sides has the most room switches axis when that's what's
 * actually needed.
 */
export function resolveCalloutAnchor(rect, anchor = 'right') {
  const room = {
    right:  1 - (rect.x + rect.w),
    left:   rect.x,
    bottom: 1 - (rect.y + rect.h),
    top:    rect.y,
  };
  if (room[anchor] >= FLIP_MARGIN) return anchor;
  let best = anchor;
  for (const side of ['right', 'left', 'bottom', 'top']) {
    if (room[side] > room[best]) best = side;
  }
  return best;
}

/** How far in from the viewport edge (0-100 scale) a projected callout point
 *  is allowed to sit on the side its box does *not* grow toward — it only
 *  has to clear the anchor dot itself, not the callout's own width. */
const CALLOUT_NEAR_INSET_PCT = 4;
/** Same, but for the side the callout box *does* grow toward (the CSS
 *  `transform: translate(10px, ...)` gap plus the label's own rendered
 *  width, both unknown here — this has to assume a typically-short label,
 *  same reasoning as `FLIP_MARGIN`, and is not a guarantee for a long one). */
const CALLOUT_FAR_INSET_PCT = 14;

/**
 * Projects a fraction-space point through the *exact same* transform
 * `.cb-focus-group` actually renders with (`focusTransform()` in
 * blockImageLayout.js: `scale(s) translate(tx, ty)`, `transform-origin: 50%
 * 50%`) — so a callout anchored to a point on the rect tracks wherever the
 * pan/zoom actually put that point on screen, in the *unscaled*
 * `.cb-image-viewport` frame the callout itself renders in. Same
 * `0.5 + s*(u - 0.5 + t)` composition documented on `focusTranslate` above,
 * applied per axis, then clamped into a safe inset band — asymmetric per
 * `anchor`, since the callout's box only extends *away* from the anchor
 * point on one side (e.g. `anchor:"right"` grows rightward), so that side
 * needs more margin than the other. Still just a heuristic — see
 * `CALLOUT_FAR_INSET_PCT`'s own caveat — not a guarantee for every label
 * length, since there is no DOM measurement of the box itself here.
 */
export function projectFocusPoint(point, scale, translate, anchor = 'right') {
  const project = (u, t) => 50 + scale * (u - 0.5 + t) * 100;
  const minX = anchor === 'left'  ? CALLOUT_FAR_INSET_PCT : CALLOUT_NEAR_INSET_PCT;
  const maxX = anchor === 'right' ? 100 - CALLOUT_FAR_INSET_PCT : 100 - CALLOUT_NEAR_INSET_PCT;
  const minY = anchor === 'top'    ? CALLOUT_FAR_INSET_PCT : CALLOUT_NEAR_INSET_PCT;
  const maxY = anchor === 'bottom' ? 100 - CALLOUT_FAR_INSET_PCT : 100 - CALLOUT_NEAR_INSET_PCT;
  return {
    xPct: Math.min(maxX, Math.max(minX, project(point.ux, translate.tx))),
    yPct: Math.min(maxY, Math.max(minY, project(point.uy, translate.ty))),
  };
}
