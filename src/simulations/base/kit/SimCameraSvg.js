/** SimCameraSvg.js
 * SimCameraSvg - the deterministic 2D camera (recipe R10) for SvgScene and any withClock(DomSimulation): the
 * same camera { x, y, z, r } and maths as SimCamera.js (re-exported here), written as an SVG transform on a
 * world <g>, or as a CSS transform on an HTML world box. Original code; the camera maths it calls is ported
 * in SimCamera.js (MIT notices there and in THIRD_PARTY.md beside the kit LICENSE).
 *
 * The centre is a parameter, as on canvas; on an svg stage it is stageCentre(st) = [st.W / 2, st.H / 2]
 * (the stage size changes with the host width and portrait). Pass coverZoom the stage size too.
 *
 *   cameraTransform(cam, centre) -> 'translate(..) rotate(..) scale(..) translate(..)'   SVG transform attribute
 *   cameraCss(cam, centre) -> 'translate(..px, ..px) rotate(..rad) scale(..) translate(..)'   CSS transform
 *                                (the element needs transform-origin: 0 0; cameraEl sets it)
 *   layerCam(cam, d, centre) -> cam   the camera of a parallax layer at depth d (1 subject, < 1 far: SimCamera.layer)
 *   stageCentre(st) -> [x, y]   pointWorld(cam, p, centre) -> { x, y }   (pointer in stage px -> world; hit tests)
 *   cameraG(live, key, cam, o) -> g   a live <g> under the camera. o = { html (the world markup: set when it
 *                                changes, so paint it once and only the transform moves per frame), depth (parallax),
 *                                centre, parent, cls }. Put live shapes in it with { parent: g }.
 *   cameraEl(live, key, cam, o) -> el   the same for an HTML world box on the live overlay (o as cameraG)
 *   cameraLive(live, base, events, centre) -> { cam, moving, end }   SimCamera.cameraAt at the pass time live.t
 *                                (skip(): the end); a move still running calls live.more(), so the clock runs to
 *                                its end even past a play() that was too short. Start it with this.play(end).
 *   hairStyle(col, w = HAIR, extra) -> style="..."   a stroke that stays w screen px at any zoom
 *                                (vector-effect: non-scaling-stroke; SimCamera.hair on canvas). Inside a world box
 *                                moved by cameraCss it does NOT see the CSS zoom: divide by cam.z there.
 * Rules as SimCamera.js: log zoom (zlerp) only; put a world point on a screen point (anchor, pushTo), never zoom
 * about a point; captions and chips at screen size on the overlay, placed with toScreen; pushes come paired
 * with a pull or a glide; reduced motion is a cut.
 */
import {
  HAIR, toScreen, toWorld, zlerp, coverZoom, anchor, camOf, pushTo, cameraAt, cameraEnd,
} from './SimCamera.js';

export { HAIR, toScreen, toWorld, zlerp, coverZoom, anchor, camOf, pushTo, cameraAt, cameraEnd };

const f3 = (v) => (Math.abs(v) < 5e-4 ? '0' : v.toFixed(3));
const f5 = (v) => v.toFixed(5);
const DEG = 180 / Math.PI;

function norm(cam, centre) {
  const c = cam || {};
  return { x: c.x ?? centre[0], y: c.y ?? centre[1], z: c.z ?? 1, r: c.r || 0 };
}

const DEF_CENTRE = [340, 260];

/** The middle of an svg stage (or of any { W, H }). */
export function stageCentre(st) {
  return st && st.W > 0 ? [st.W / 2, st.H / 2] : DEF_CENTRE;
}

/** The camera as an SVG transform attribute (same order as SimCamera.apply). */
export function cameraTransform(cam, centre = DEF_CENTRE) {
  const k = norm(cam, centre);
  return `translate(${f3(centre[0])} ${f3(centre[1])})${k.r ? ` rotate(${f5(k.r * DEG)})` : ''} scale(${f5(k.z)}) translate(${f3(-k.x)} ${f3(-k.y)})`;
}

/** The camera as a CSS transform (transform-origin 0 0). */
export function cameraCss(cam, centre = DEF_CENTRE) {
  const k = norm(cam, centre);
  return `translate(${f3(centre[0])}px, ${f3(centre[1])}px)${k.r ? ` rotate(${f5(k.r)}rad)` : ''} scale(${f5(k.z)}) translate(${f3(-k.x)}px, ${f3(-k.y)}px)`;
}

/** Camera of a parallax layer at depth d (SimCamera.layer). */
export function layerCam(cam, d, centre = DEF_CENTRE) {
  const k = norm(cam, centre);
  return { x: centre[0] + (k.x - centre[0]) * d, y: centre[1] + (k.y - centre[1]) * d, z: Math.pow(k.z, d), r: k.r };
}

/** A pointer in stage px -> world { x, y }. */
export function pointWorld(cam, p, centre = DEF_CENTRE) {
  const [x, y] = toWorld(cam, p.x, p.y, centre);
  return { x, y };
}

/** A live <g> under the camera (see the header). */
export function cameraG(live, key, cam, o = {}) {
  const centre = o.centre ?? DEF_CENTRE;
  const c = o.depth != null && o.depth !== 1 ? layerCam(cam, o.depth, centre) : cam;
  const g = live.shape(key, 'g', { cls: o.cls, parent: o.parent, html: o.html });
  live.attrs(g, { transform: cameraTransform(c, centre) });
  return g;
}

/** An HTML world box on the live overlay under the camera (see the header). */
export function cameraEl(live, key, cam, o = {}) {
  const centre = o.centre ?? DEF_CENTRE;
  const c = o.depth != null && o.depth !== 1 ? layerCam(cam, o.depth, centre) : cam;
  const e = live.el(key, { cls: o.cls, parent: o.parent, html: o.html });
  live.css(e, { 'transform-origin': '0 0', transform: cameraCss(c, centre) });
  return e;
}

/** cameraAt at the pass time (see the header). */
export function cameraLive(live, base, events, centre = DEF_CENTRE) {
  const end = cameraEnd(events);
  const t = live.skipping ? Math.max(live.t ?? 0, end) : (live.t ?? 0);
  const r = cameraAt(base, events, t, centre);
  if (r.moving) live.more();
  return { cam: r.cam, moving: r.moving, end };
}

/** style="..." for a hairline that stays w screen px at any zoom. */
export function hairStyle(col, w = HAIR, extra = '') {
  return `style="fill:none;stroke:${col};stroke-width:${w};stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke${extra ? ';' + extra : ''}"`;
}
