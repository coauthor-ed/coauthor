/** SimRigSvg.js
 * SimRigSvg - SimRig's limbs, muscles and mechanisms as SVG, for SvgScene and any withClock(DomSimulation).
 * The maths (ik2, reach, crankSlider, crankAngleAt, lever, pointSpring, stepPoint) is SimRig's, re-exported
 * here; SimRig.js needs no split (it is pure apart from its ctx-in path functions, and imports only
 * SimAnim). The outlines are SimRig's own: limbD / muscleD run traceLimb / muscle against a path
 * recorder, so the SVG capsule is exactly the canvas one (outward caps, no holes at the joints).
 * Adapted from (MIT; full notices in THIRD_PARTY.md beside the kit LICENSE), through SimRig.js:
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/rig.js (MIT, (c) 2026 alchaincyf) - ik2, limb outline
 *   Original code: the path recorder, the markup and live helpers, trackPoint, beamPoint, leverSvg, crankSvg.
 *
 *   limbD(a, b, w0, w1) -> d                   tapered round-capped capsule a -> b (traceLimb outline)
 *   muscleD(a, b, w0, w1, bulge, o) -> d       a capsule whose middle swells by bulge px (o.at: peak 0..1)
 *   limbSvg(a, b, w0, w1, col, o) -> markup    filled capsule. o = { lip (px: a darker copy under it),
 *                                              edge (stroke colour), lw (2.5) }
 *   muscleSvg(a, b, w0, w1, bulge, col, o)     the same for a muscle (o.at as muscleD)
 *   liveLimb(live, key, a, b, w0, w1, col, o) / liveMuscle(live, key, a, b, w0, w1, bulge, col, o)
 *                                              the same as keyed live paths (moved by d per pass)
 *   trackPoint(live, key, goal, o) -> { x, y, moving }   a dragged IK target smoothed on the clock with
 *                                              stepPoint (a SimAnim spring per axis). o = { preset ('snappy'),
 *                                              snap (true: jump to goal, e.g. while a script drives it) }.
 *                                              Calls live.more() while moving; skip() and reduced motion snap.
 *   beamPoint(fulcrum, angle, s, lift = 0) -> { x, y }   the point s px along a lever beam from the fulcrum
 *                                              (s > 0 toward the load end), lift px above its top face
 *   leverSvg(fulcrum, angle, effortArm, loadArm, o) -> { svg, L }   plank, triangular stand, pivot; L = lever().
 *                                              o = { tone (8), standTone (2), thick (18), floor (stand base y,
 *                                              default fulcrum.y + 100), unit (px: a mark every unit), over (10) }
 *   liveLever(live, key, fulcrum, angle, effortArm, loadArm, o) -> L   leverSvg on the live layer; only the
 *                                              plank's rotate() changes per pass
 *   crankSvg(centre, r, rod, angle, axis, o) -> { svg, k }   flywheel with turning spokes, crank arm, rod,
 *                                              piston on the axis, pins; k = crankSlider(). o = { wheel (r * 1.45),
 *                                              wheelTone (5), crankTone (2), rodTone (1), pistonTone (3),
 *                                              piston: { w (86), h (42) }, cylinder (true: walls round the
 *                                              piston's travel), headroom (34: cylinder space above the top),
 *                                              gas (a CSS colour filling the cylinder above the piston) }
 *   liveCrank(live, key, centre, r, rod, angle, axis, o) -> k    crankSvg on the live layer
 * Colours: tones are series numbers or token names ('accent', 'good'); col arguments are CSS colours.
 */
import { reducedMotion } from './SimAnim.js';
import { ik2, reach, traceLimb, muscle, pointSpring, stepPoint, crankSlider, crankAngleAt, lever } from './SimRig.js';
import { fill, shade, glossOf } from './SimSvg.js';

export { ik2, reach, pointSpring, stepPoint, crankSlider, crankAngleAt, lever };

const TAU = Math.PI * 2;
const f1 = (v) => (+v).toFixed(1);
const toneCss = (t) => (typeof t === 'number' ? `var(--sim-series-${((Math.max(1, t | 0) - 1) % 8) + 1})` : `var(--sim-${t})`);
const deg = (a) => (a * 180) / Math.PI;

// A ctx-shaped path recorder: SimRig's outline functions write SVG path data into it.
function recorder() {
  let d = '', has = false;
  const at = (x, y) => `${f1(x)} ${f1(y)}`;
  return {
    get d() { return d; },
    beginPath() { d = ''; has = false; },
    moveTo(x, y) { d += `M${at(x, y)}`; has = true; },
    lineTo(x, y) { d += `${has ? 'L' : 'M'}${at(x, y)}`; has = true; },
    quadraticCurveTo(cx, cy, x, y) { d += `Q${at(cx, cy)} ${at(x, y)}`; },
    arc(cx, cy, r, a0, a1, ccw = false) {
      let span = ccw ? a0 - a1 : a1 - a0;
      span = span >= TAU ? TAU : ((span % TAU) + TAU) % TAU;
      const sx = cx + Math.cos(a0) * r, sy = cy + Math.sin(a0) * r;
      d += `${has ? 'L' : 'M'}${at(sx, sy)}`;
      has = true;
      const dir = ccw ? -1 : 1, parts = span > Math.PI * 0.99 ? 2 : 1;
      for (let i = 1; i <= parts; i++) {
        const a = a0 + (dir * span * i) / parts;
        d += `A${f1(r)} ${f1(r)} 0 0 ${ccw ? 0 : 1} ${at(cx + Math.cos(a) * r, cy + Math.sin(a) * r)}`;
      }
    },
    closePath() { d += 'Z'; },
    fill() {}, stroke() {}, save() {}, restore() {},
  };
}

/** Tapered capsule a -> b as a path d (SimRig traceLimb outline). */
export function limbD(a, b, w0, w1) {
  const r = recorder();
  traceLimb(r, a, b, w0, w1);
  return r.d;
}

/** Muscle belly a -> b as a path d (SimRig muscle outline). o.at: where the belly peaks. */
export function muscleD(a, b, w0, w1, bulge, o = {}) {
  const r = recorder();
  muscle(r, a, b, w0, w1, bulge, null, { at: o.at });
  return r.d;
}

function shapeMarkup(d, dLip, col, o) {
  const edge = o.edge ? `;stroke:${o.edge};stroke-width:${o.lw ?? 2.5};stroke-linejoin:round` : '';
  return (dLip ? `<path d="${dLip}" ${fill(shade(col, 70))}/>` : '') + `<path d="${d}" ${fill(col, edge.slice(1))}/>`;
}
const down = (p, k) => ({ x: (Array.isArray(p) ? p[0] : p.x), y: (Array.isArray(p) ? p[1] : p.y) + k });

/** A filled capsule as markup (see the header). */
export function limbSvg(a, b, w0, w1, col, o = {}) {
  return shapeMarkup(limbD(a, b, w0, w1), o.lip ? limbD(down(a, o.lip), down(b, o.lip), w0, w1) : '', col, o);
}

/** A filled muscle as markup (see the header). */
export function muscleSvg(a, b, w0, w1, bulge, col, o = {}) {
  return shapeMarkup(muscleD(a, b, w0, w1, bulge, o), o.lip ? muscleD(down(a, o.lip), down(b, o.lip), w0, w1, bulge, o) : '', col, o);
}

function livePath(live, key, d, col, o) {
  const e = live.shape(key, 'path', { parent: o.parent });
  live.attrs(e, { d });
  live.css(e, { fill: col, stroke: o.edge ?? null, 'stroke-width': o.edge ? (o.lw ?? 2.5) : null, 'stroke-linejoin': o.edge ? 'round' : null });
  return e;
}

/** A capsule as a keyed live path (see the header). */
export function liveLimb(live, key, a, b, w0, w1, col, o = {}) {
  if (o.lip) livePath(live, `${key}|lip`, limbD(down(a, o.lip), down(b, o.lip), w0, w1), shade(col, 70), { parent: o.parent });
  return livePath(live, key, limbD(a, b, w0, w1), col, o);
}

/** A muscle as a keyed live path (see the header). */
export function liveMuscle(live, key, a, b, w0, w1, bulge, col, o = {}) {
  if (o.lip) livePath(live, `${key}|lip`, muscleD(down(a, o.lip), down(b, o.lip), w0, w1, bulge, o), shade(col, 70), { parent: o.parent });
  return livePath(live, key, muscleD(a, b, w0, w1, bulge, o), col, o);
}

/** A goal point smoothed on the clock (see the header). */
export function trackPoint(live, key, goal, o = {}) {
  const t = live.t ?? 0;
  const s = live.state(`rig|${key}`, () => ({ p: pointSpring(goal.x, goal.y), last: t }));
  const dt = Math.max(0, Math.min(0.05, t - s.last));
  s.last = t;
  let moving = false;
  if (o.snap || live.skipping || reducedMotion()) s.p = pointSpring(goal.x, goal.y);
  else moving = stepPoint(s.p, goal.x, goal.y, dt, o.preset ?? 'snappy');
  if (moving) live.more();
  return { x: s.p.x, y: s.p.y, moving };
}

/** The point s px along a lever beam from the fulcrum (s > 0 toward the load), lift px above its top. */
export function beamPoint(fulcrum, angle, s, lift = 0) {
  const fx = Array.isArray(fulcrum) ? fulcrum[0] : fulcrum.x, fy = Array.isArray(fulcrum) ? fulcrum[1] : fulcrum.y;
  const c = Math.cos(angle), sn = Math.sin(angle);
  return { x: fx + c * s + sn * lift, y: fy + sn * s - c * lift };
}

function leverParts(fulcrum, effortArm, loadArm, o) {
  const fx = fulcrum.x ?? fulcrum[0], fy = fulcrum.y ?? fulcrum[1];
  const col = toneCss(o.tone ?? 8), sc = toneCss(o.standTone ?? 2);
  const th = o.thick ?? 18, over = o.over ?? 10, floor = o.floor ?? fy + 100;
  const hw = Math.max(40, (floor - fy) * 0.55);
  const stand = `<path d="M${f1(fx)} ${f1(fy + 4)}L${f1(fx + hw + 6)} ${f1(floor + 4)}L${f1(fx - hw - 6)} ${f1(floor + 4)}Z" ${fill(shade(sc, 68))}/>`
    + `<path d="M${f1(fx)} ${f1(fy)}L${f1(fx + hw)} ${f1(floor)}L${f1(fx - hw)} ${f1(floor)}Z" ${fill(sc, 'stroke-linejoin:round')}/>`;
  const x0 = fx - effortArm - over, w = effortArm + loadArm + 2 * over;
  let plank = `<rect x="${f1(x0)}" y="${f1(fy - th / 2 + 4)}" width="${f1(w)}" height="${th}" rx="8" ${fill(shade(col, 66))}/>`
    + `<rect x="${f1(x0)}" y="${f1(fy - th / 2)}" width="${f1(w)}" height="${th}" rx="8" ${fill(col)}/>`
    + `<rect x="${f1(x0 + 10)}" y="${f1(fy - th / 2 + 3)}" width="${f1(w - 20)}" height="4" rx="2" ${fill(glossOf(col, 40), 'opacity:0.75')}/>`;
  if (o.unit > 0) {
    for (let s = -Math.floor(effortArm / o.unit); s <= Math.floor(loadArm / o.unit); s++) {
      if (!s) continue;
      plank += `<rect x="${f1(fx + s * o.unit - 1.5)}" y="${f1(fy - th / 2 + 6)}" width="3" height="${f1(th - 10)}" rx="1.5" ${fill(shade(col, 55), 'opacity:0.7')}/>`;
    }
  }
  const pivot = `<circle cx="${f1(fx)}" cy="${f1(fy)}" r="7" ${fill(shade(sc, 50))}/><circle cx="${f1(fx - 2)}" cy="${f1(fy - 2)}" r="2.5" ${fill(glossOf(sc, 40))}/>`;
  return { stand, plank, pivot, fx, fy };
}

/** A lever as markup (see the header). */
export function leverSvg(fulcrum, angle, effortArm, loadArm, o = {}) {
  const P = leverParts(fulcrum, effortArm, loadArm, o);
  return { svg: P.stand + `<g transform="rotate(${deg(angle).toFixed(2)} ${f1(P.fx)} ${f1(P.fy)})">${P.plank}</g>` + P.pivot, L: lever(fulcrum, angle, effortArm, loadArm) };
}

/** leverSvg on the live layer (see the header). */
export function liveLever(live, key, fulcrum, angle, effortArm, loadArm, o = {}) {
  const P = leverParts(fulcrum, effortArm, loadArm, o);
  const G = live.shape(key, 'g');
  live.shape(`${key}|stand`, 'g', { parent: G, html: P.stand });
  const pl = live.shape(`${key}|plank`, 'g', { parent: G, html: P.plank });
  live.attrs(pl, { transform: `rotate(${deg(angle).toFixed(2)} ${f1(P.fx)} ${f1(P.fy)})` });
  live.shape(`${key}|pivot`, 'g', { parent: G, html: P.pivot });
  return lever(fulcrum, angle, effortArm, loadArm);
}

/** A crank-slider as markup (see the header). */
export function crankSvg(centre, r, rod, angle, axis = -Math.PI / 2, o = {}) {
  const k = crankSlider(centre, r, rod, angle, axis);
  const cx = centre.x ?? centre[0], cy = centre.y ?? centre[1];
  const R = o.wheel ?? r * 1.45, wc = toneCss(o.wheelTone ?? 5), cc = toneCss(o.crankTone ?? 2);
  const rc = toneCss(o.rodTone ?? 1), pc = toneCss(o.pistonTone ?? 3);
  const pw = o.piston?.w ?? 86, ph = o.piston?.h ?? 42, rot = deg(axis) + 90;
  let svg = '';
  if (o.cylinder !== false) {
    const top = k.sMax + ph / 2 + (o.headroom ?? 34), bot = k.sMin - ph / 2 - 6;
    const wall = 'color-mix(in oklab, var(--sim-bg-surface) 82%, var(--sim-label))';
    svg += `<g transform="translate(${f1(cx)} ${f1(cy)}) rotate(${rot.toFixed(2)})">`
      + `<rect x="${f1(-pw / 2 - 16)}" y="${f1(-top - 14)}" width="${f1(pw + 32)}" height="${f1(top - bot + 14)}" rx="14" ${fill(wall)}/>`
      + `<rect x="${f1(-pw / 2 - 2)}" y="${f1(-top)}" width="${f1(pw + 4)}" height="${f1(top - bot)}" rx="6" ${fill('color-mix(in oklab, var(--sim-bg-deep) 82%, var(--sim-glass))')}/>`
      + (o.gas ? `<rect x="${f1(-pw / 2)}" y="${f1(-top + 2)}" width="${pw}" height="${f1(Math.max(0, top - 2 - k.s - ph / 2))}" rx="5" ${fill(o.gas)}/>` : '')
      + `<rect x="${f1(-pw / 2 - 16)}" y="${f1(-top - 22)}" width="${f1(pw + 32)}" height="14" rx="6" ${fill('var(--sim-stroke)')}/></g>`;
  }
  svg += `<circle cx="${f1(cx)}" cy="${f1(cy + 4)}" r="${f1(R)}" ${fill(shade(wc, 68))}/><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R)}" ${fill(wc)}/>`
    + `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R * 0.78)}" ${fill(shade(wc, 86))}/>`;
  for (let i = 0; i < 4; i++) {
    const a = angle + axis + (i * TAU) / 4 + Math.PI / 4;
    svg += limbSvg({ x: cx, y: cy }, { x: cx + Math.cos(a) * R * 0.78, y: cy + Math.sin(a) * R * 0.78 }, 12, 8, wc);
  }
  svg += limbSvg({ x: cx, y: cy }, k.pin, 30, 22, cc, { edge: shade(cc, 62) })
    + limbSvg(k.pin, k.slider, 20, 14, rc, { edge: shade(rc, 62) })
    + `<g transform="translate(${f1(k.slider.x)} ${f1(k.slider.y)}) rotate(${rot.toFixed(2)})">`
    + `<rect x="${f1(-pw / 2)}" y="${f1(-ph / 2 + 4)}" width="${pw}" height="${ph}" rx="9" ${fill(shade(pc, 68))}/>`
    + `<rect x="${f1(-pw / 2)}" y="${f1(-ph / 2)}" width="${pw}" height="${ph}" rx="9" ${fill(pc)}/>`
    + `<rect x="${f1(-pw / 2 + 6)}" y="${f1(-ph / 2 + 9)}" width="${pw - 12}" height="5" rx="2.5" ${fill(shade(pc, 80))}/>`
    + `<rect x="${f1(-pw / 2 + 6)}" y="${f1(-ph / 2 + 18)}" width="${pw - 12}" height="5" rx="2.5" ${fill(shade(pc, 80))}/></g>`
    + `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="9" ${fill(shade('var(--sim-stroke)', 70))}/>`
    + `<circle cx="${f1(k.pin.x)}" cy="${f1(k.pin.y)}" r="6" ${fill(glossOf(cc, 50))}/>`
    + `<circle cx="${f1(k.slider.x)}" cy="${f1(k.slider.y)}" r="6" ${fill(glossOf(rc, 50))}/>`;
  return { svg, k };
}

/** crankSvg on the live layer (see the header). */
export function liveCrank(live, key, centre, r, rod, angle, axis = -Math.PI / 2, o = {}) {
  const { svg, k } = crankSvg(centre, r, rod, angle, axis, o);
  live.shape(key, 'g', { html: svg });
  return k;
}
