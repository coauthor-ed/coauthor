/** SimIso.js
 * SimIso - isometric blocks with three-tone flat shading, and an exploded view
 * (recipe R12; exploded diagrams of apparatus, machines and models).
 * Adapted from (MIT; full notices in THIRD_PARTY.md beside the kit LICENSE):
 *   Adapted from anatomy@e6600ff kit/iso-kit.mjs (MIT, (c) 2026 Ryan)
 *   Adapted from anatomy@e6600ff kit/lathe.mjs (MIT, (c) 2026 Ryan)
 *   Adapted from anatomy@e6600ff examples/raptor-engine/live.js (MIT, (c) 2026 Ryan)
 *   Adapted from huashu-art-motion@64cb272 scripts/engine/lib/toon.js (MIT, (c) 2026 alchaincyf)
 *   Original code: isoDelta, toneLadder, boxRing, prismRing, solidOf (Path2D cache),
 *   drawSolid, footprint, flatOffsets, the second clip in flatFaces.
 *
 * What is here:
 *   camera(P)            { sinA, cosA, sinE, cosE, k } for a projection P =
 *                        { origin: [x, y], scale, azimuth = 45, elevation = 30 }
 *   iso(p, P)            world [x, y, z] (z up) -> screen [x, y]
 *   isoDelta(d, P)       a world offset -> a screen offset (iso without the origin)
 *   depthOf(p, P)        larger = nearer the viewer; paint in ascending order
 *   towardViewer(P)      the floor-plane direction that faces the viewer
 *   fit(points, o)       a projection that fits the points into a ZONES rect
 *   lightOf, bandOf, toneOf, BANDS   the one-colour, four-band light rule
 *   toneLadder(base)     the four band colours, all derived from ONE token
 *   boxRing, prismRing   floor rings (a rectangle, a regular n-gon)
 *   convexHull, runsOf   ring helpers used by extrude
 *   extrude(ring, z, h, P, o)   pure geometry: sides (with band), top, hull, outline, crease
 *   solidOf(ring, z, h, P)      extrude at the origin, cached with lazy Path2Ds
 *   drawSolid(ctx, solid, P, base, o)   paint it (offset by a world vector o.offset)
 *   footprint(ring, z, P)       screen polygon of a ring on a floor (for a drop shadow)
 *   flatOffsets, flatFaces      2D three-tone flat fill (shadow band + highlight rim)
 *   explode(order, o)           staggered, reversible exploded-view springs
 *
 * World units are free; fit() picks the scale. The sqrt(1.6) in camera() makes
 * an isometric cube read square on screen - keep it. Every Path2D is cached by
 * (ring, z, height, scale, azimuth, elevation) at the origin and placed with
 * ctx.translate, so a moving part never rebuilds its path. Colours: only the
 * one base token a caller passes, shaded with SimLook darken/lighten. Reduced
 * motion: explode() jumps to its end state. ASCII only.
 *
 * The pure half (camera, bands, rings, extrude, the solid cache, footprint, flatOffsets, explode) lives
 * in SimIsoSpec.js and is re-exported here unchanged; SimIsoSvg.js is the SVG counterpart.
 */
import { darken, lighten, alpha } from './SimLook.js';
import {
  AZIMUTH, ELEVATION, SHADES, BANDS, camera, iso, isoDelta, towardViewer, depthOf, fit,
  lightOf, bandOf, toneOf, boxRing, prismRing, convexHull, runsOf, extrude, solidOf, solidCacheSize,
  footprint, flatOffsets, EXPLODE, explode, LADDER_STEPS, RIM,
} from './SimIsoSpec.js';

export {
  AZIMUTH, ELEVATION, SHADES, BANDS, camera, iso, isoDelta, towardViewer, depthOf, fit,
  lightOf, bandOf, toneOf, boxRing, prismRing, convexHull, runsOf, extrude, solidOf, solidCacheSize,
  footprint, flatOffsets, EXPLODE, explode,
};

// -- Tone ladder (canvas: resolved colours) -------------------------------------------

const LADDER = new Map();
/**
 * The four band colours of ONE resolved token: darkest side, mid side, the
 * token itself, a lighter top. Cached per base string (call it per frame freely).
 */
export function toneLadder(base) {
  let l = LADDER.get(base);
  if (!l) {
    if (LADDER.size > 64) LADDER.clear();
    l = LADDER_STEPS.map((k) => (k < 0 ? darken(base, -k) : k > 0 ? lighten(base, k) : base));
    LADDER.set(base, l);
  }
  return l;
}

// -- Paths (Path2D on the cached solids) ----------------------------------------------

function pathOf(pts, closed) {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  if (closed) p.closePath();
  return p;
}


function pathsOf(s) {
  if (!s.paths) {
    s.paths = {
      hull: s.hull ? pathOf(s.hull, true) : null,
      sides: s.sides.map((f) => pathOf(f.pts, true)),
      top: pathOf(s.top, true),
      crease: s.crease.map((run) => pathOf(run, false)),
    };
  }
  return s.paths;
}

/**
 * Paint a solid from solidOf() at projection P, moved by a world offset.
 * base: ONE resolved colour token (the four bands derive from it).
 * o: { offset: [dx, dy, dz], alpha = 1, rim = true (a light edge along the
 *      viewer-facing top creases), topBase (another token for the top face) }
 */
export function drawSolid(ctx, solid, P, base, o = {}) {
  const ladder = toneLadder(base);
  const p = pathsOf(solid);
  const [dx, dy] = o.offset ? isoDelta(o.offset, P) : [0, 0];
  const org = P.origin || [0, 0];
  ctx.save();
  ctx.translate(org[0] + dx, org[1] + dy);
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  // Hull first in the darkest band: hides anti-alias seams between faces.
  if (p.hull) { ctx.fillStyle = ladder[0]; ctx.fill(p.hull); }
  for (let i = 0; i < p.sides.length; i++) {
    ctx.fillStyle = ladder[solid.sides[i].band];
    ctx.fill(p.sides[i]);
  }
  ctx.fillStyle = o.topBase ? toneLadder(o.topBase)[solid.topBand] : ladder[solid.topBand];
  ctx.fill(p.top);
  if (o.rim !== false && p.crease.length) {
    ctx.strokeStyle = alpha(lighten(base, RIM.lighten), RIM.alpha);
    ctx.lineWidth = RIM.width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const c of p.crease) ctx.stroke(c);
  }
  ctx.restore();
}

// -- Flat three-tone faces (toon.js:10-16) ----------------------------------------------

/**
 * The look's flat fill: no stroke, no gradient. Inside path: a highlight rim
 * along the upper left (width w), a shadow band along the lower right (width v),
 * the base in between. box { w, h } sizes the bands.
 * o: { shade = darken(base, .22), hi = lighten(base, .3), v, w } (v, w as in flatOffsets).
 * Deviation from TOON.flat: the source's three translated fills leave almost
 * no highlight on a convex shape (w nearly parallel to v); a second clip to
 * the path moved by w keeps the rim.
 */
export function flatFaces(ctx, path, box, base, o = {}) {
  const shade = o.shade ?? darken(base, 0.22);
  const hi = o.hi ?? lighten(base, 0.3);
  const { v, w } = flatOffsets(box, o.v, o.w);
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = hi;
  ctx.fill(path);
  ctx.save();
  ctx.translate(w[0], w[1]);
  ctx.clip(path);
  ctx.translate(-w[0], -w[1]);
  ctx.fillStyle = shade;
  ctx.fill(path);
  ctx.translate(-v[0], -v[1]);
  ctx.fillStyle = base;
  ctx.fill(path);
  ctx.restore();
  ctx.restore();
}

