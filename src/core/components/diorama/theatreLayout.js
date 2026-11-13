/**
 * Pure geometry for the Story diorama theatre (StoryTheatre.js) and its camera
 * (DioramaCamera.js). No DOM here, so every rule is unit-tested on its own
 * (test/unit/theatreLayout.test.js).
 *
 * Vocabulary:
 * - "tall" theatre: story above (docked) or below (full view) the scene;
 *   "wide": story beside it. Decided by the theatre box's own shape.
 * - span: the length the story and the scene share along that axis.
 * - natural: how much of the span the scene can actually use at its aspect
 *   ratio. Anything past that is only empty bands around it.
 */

/** Design aspect (w/h) below which a scene skips the phone's theatre: the stage
 *  there is about 230 px tall, which would leave it under about 190 px wide. */
export const PHONE_STAGE_MIN_ASPECT = 0.8;

/** Largest w x h box of `aspect` (w/h) inside aw x ah. */
export function fitAspect(aw, ah, aspect) {
  if (!(aw > 0) || !(ah > 0) || !(aspect > 0)) return { w: 0, h: 0 };
  let w = aw;
  let h = aw / aspect;
  if (h > ah) { h = ah; w = ah * aspect; }
  return { w: Math.floor(w), h: Math.floor(h) };
}

/**
 * Story column width on a wide theatre: never narrower than a readable
 * measure, never wider than about 40rem (long lines are hard to read).
 */
export function readRange(span, rem = 16) {
  return {
    min: Math.round(Math.min(Math.max(200, span * 0.26), 22 * rem)),
    max: Math.round(40 * rem),
  };
}

/**
 * Bounds for the story's share of the span. The scene always keeps at least
 * 40% (and a usable minimum) plus its window's chrome, whatever the beat or
 * the learner's drag.
 */
export function splitLimits({ tall, span, rem = 16, reserve = 0, sceneFloor = 0 }) {
  // reserve: the scene window's own chrome (head strip, controls bar), which
  // must not eat into the scene's minimum. sceneFloor (Q-84, docked tall): the
  // scene's own full-width length, so long beat text scrolls in its pane
  // instead of squeezing the scene narrow (capped by the caller).
  const minScene = Math.max((tall ? Math.max(150, span * 0.4) : Math.max(260, span * 0.4)) + reserve, sceneFloor);
  const r = readRange(span, rem);
  const min = tall ? 70 : r.min;
  // ...but in a small box with a big controls bar the story still keeps 30%.
  return { min, max: Math.max(min, span * 0.3, span - minScene), read: r.max };
}

/**
 * The automatic split for one beat.
 * - need: what the beat's text needs (tall: its height; wide: the narrowest
 *   column at which it fits the height).
 * - natural: the scene's usable length along the span.
 * - fillRest (full view, tall): the story also takes whatever the scene can't
 *   use. Docked tall leaves that to the scene's frame instead.
 * Wide: the story takes what the scene can't use, up to a readable width,
 * and widens past that only if the beat needs it.
 */
export function autoSplit({ tall, span, need, natural, limits, fillRest = false }) {
  const rest = span - natural;
  let want;
  if (tall) want = fillRest ? Math.max(need, rest) : need;
  else want = Math.max(need, Math.min(rest, limits.read));
  return clampSplit(want, limits);
}

export function clampSplit(px, limits) {
  return Math.round(Math.max(limits.min, Math.min(limits.max, px)));
}

/**
 * Smallest x in [lo, hi] with fits(x) true, assuming fits is monotonic
 * (a wider column never needs more height). Seven halvings: within ~1% of
 * the range, enough for a column width. Returns hi if nothing fits.
 */
export function searchNarrowest(lo, hi, fits, steps = 7) {
  if (hi <= lo) return lo;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

// ── scene controls placement ────────────────────────────────────────────

/**
 * Where the scene's CONTROLS bar goes: 'below' the scene, in a column
 * 'side' of it, or in the strip's 'tray' (menu). Picks the visible place
 * that leaves the scene biggest; in auto mode the bar goes to the tray only
 * when even that place shrinks the scene by more than `cost` (10%).
 *
 * - sw, sh: the box the scene window may fill; head: its strip; rule: the
 *   stage border; aspect: the scene's w/h.
 * - belowH(w): the bar's height laid out as a strip w wide.
 * - sideH(cw): its height as a list cw wide (side column and tray).
 * - mode: 'auto' | 'below' (always visible) | 'menu'; allowSide: false for a
 *   floating window, whose width the learner sets.
 * - current: the present placement, which gets a little slack so a bar near
 *   the line does not flip back and forth.
 * Returns { place, w } with w the scene's resulting width.
 */
export function placeControls({ sw, sh, head, rule, aspect, belowH, sideH, mode = 'auto', allowSide = true, current = 'below', cost = 0.1, minWin = 340 }) {
  const fit = (w, h) => fitAspect(w - 2 * rule, h - head - rule, aspect);
  const none = fit(sw, sh);
  if (mode === 'menu') return { place: 'tray', w: none.w };
  // below: the bar's width is the window's, which is the scene's (or the strip's minimum)
  const winW = (w) => Math.min(sw, Math.max(w + 2 * rule, minWin));
  let below = fit(sw, sh - belowH(winW(none.w)));
  below = fit(sw, sh - belowH(winW(below.w)));
  let best = { place: 'below', w: below.w };
  if (allowSide) {
    const cw = sideWidth(sw);
    const side = fit(sw - cw, sh);
    if (sw - cw >= 240 && sideH(cw) <= side.h + 8 && side.w > best.w) best = { place: 'side', w: side.w };
  }
  if (mode === 'below') return best;
  const keep = current === 'tray' ? cost - 0.02 : current === best.place ? cost + 0.02 : cost;
  return best.w >= none.w * (1 - keep) ? best : { place: 'tray', w: none.w };
}

/** Width of the side controls column for a scene box sw wide. */
export function sideWidth(sw) {
  return Math.round(Math.min(280, Math.max(200, sw * 0.24)));
}

// ── floating windows ─────────────────────────────────────────────────────

/** Keeps a w x h window inside area {left, top, right, bottom}. */
export function clampToArea(x, y, w, h, area) {
  const maxX = Math.max(area.left, area.right - w);
  const maxY = Math.max(area.top, area.bottom - h);
  return { x: Math.max(area.left, Math.min(maxX, x)), y: Math.max(area.top, Math.min(maxY, y)) };
}

export const CORNERS = ['tl', 'tr', 'bl', 'br'];

/** Top-left position of a w x h window parked in `corner` of area. */
export function cornerPos(corner, w, h, area) {
  const x = corner[1] === 'l' ? area.left : Math.max(area.left, area.right - w);
  const y = corner[0] === 't' ? area.top : Math.max(area.top, area.bottom - h);
  return { x, y };
}

/** The corner nearest to a window's centre. */
export function nearestCorner(rect, area) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const v = cy < (area.top + area.bottom) / 2 ? 't' : 'b';
  const h = cx < (area.left + area.right) / 2 ? 'l' : 'r';
  return v + h;
}

export function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * The corner where a w x h window covers least of `avoid` (the part of the
 * scene the current beat is about). Ties keep `prefer`, so the card does not
 * hop corners for nothing.
 */
export function cornerAwayFrom(avoid, w, h, area, prefer = 'tr') {
  let best = prefer;
  let bestOv = Infinity;
  for (const c of [prefer, ...CORNERS.filter((k) => k !== prefer)]) {
    const p = cornerPos(c, w, h, area);
    const ov = overlap({ x: p.x, y: p.y, w, h }, avoid);
    if (ov < bestOv - 1) { best = c; bestOv = ov; }
  }
  return best;
}

// ── camera (fractions of the scene, 0..1) ────────────────────────────────

/**
 * A camera view is { x, y, z }: the visible part of the scene starts at
 * (x, y) and is z of its width AND z of its height (uniform zoom, so the
 * scene never stretches). z = 1 shows the whole scene; minZ caps the zoom.
 */
export function clampView(v, minZ = 0.2) {
  const z = Math.max(minZ, Math.min(1, v.z));
  return {
    x: Math.max(0, Math.min(1 - z, v.x)),
    y: Math.max(0, Math.min(1 - z, v.y)),
    z,
  };
}

/**
 * The view that frames an authored focus rect {x, y, w, h} (fractions),
 * with a little margin, centred on it.
 */
export function viewForFocus(f, minZ = 0.2, pad = 1.12) {
  if (!f || !(f.w > 0) || !(f.h > 0)) return { x: 0, y: 0, z: 1 };
  const z = Math.max(f.w, f.h) * pad;
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  return clampView({ x: cx - z / 2, y: cy - z / 2, z }, minZ);
}

/** Zoom by `factor` (>1 = in) keeping the point at viewport fraction (px, py) fixed. */
export function zoomAround(v, factor, px = 0.5, py = 0.5, minZ = 0.2) {
  const z = Math.max(minZ, Math.min(1, v.z / factor));
  const sx = v.x + px * v.z;
  const sy = v.y + py * v.z;
  return clampView({ x: sx - px * z, y: sy - py * z, z }, minZ);
}

/** Pan by a viewport-fraction delta (dx, dy): dragging right moves the scene right. */
export function panBy(v, dx, dy, minZ = 0.2) {
  return clampView({ x: v.x - dx * v.z, y: v.y - dy * v.z, z: v.z }, minZ);
}

export function sameView(a, b, eps = 0.001) {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps;
}

/** The scene rect (fractions) a view shows, for overlap tests against windows. */
export function viewToRect(v) {
  return { x: v.x, y: v.y, w: v.z, h: v.z };
}
