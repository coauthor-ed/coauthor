/**
 * GeoMap - Canvas2D map and cross-section helpers for SimScene geography scenes
 * (globe with layers, India map, plate block). Data comes from SimGeo layers
 * (vendor/geo/SOURCES.md), never from coordinates typed into a scene.
 *   loadMap(names)            { land, india, plates, quakes, volcanoes, rivers, elevation }
 *   makeView(ctx, o)          fitted projection: o.kind ('orthographic' | 'mercator' |
 *                             'equalEarth' | 'naturalEarth'), o.box, o.rotate, o.extent
 *                             [[lon0, lat0], [lon1, lat1]] (default: whole sphere).
 *                             view.at([lon, lat]) -> [x, y] | null (behind the globe),
 *                             view.setRotate(r) re-aims a globe (cheap, per frame ok)
 *   drawGlobeBase(ctx, v, c)  ocean disc, rim light, graticule
 *   drawLand(ctx, v, c, land, o)      flat land (o.fill), or o.relief = reliefImage()
 *   reliefImage(v, c, map)    elevation-shaded land+sea offscreen canvas (slow: build once
 *                             per view, not per frame)
 *   drawIndia(ctx, v, c, india, o)    India from the Survey of India layer + credit chip.
 *                             The ONLY legal way to draw India's border. o: { fill, credit }
 *   drawPlates(ctx, v, c, plates, o)  boundaries by kind; o.kinds, o.alpha, o.width
 *   drawQuakes / drawVolcanoes(ctx, v, c, fc, o)    point layers (o.alpha, o.max)
 *   drawRivers(ctx, v, c, rivers, o)  o.names: only these (e.g. ['Ganges', 'Brahmaputra'])
 *   PLATE_KEYS                colour key per boundary kind (for a legend chipRow)
 *   drawStrataBlock(ctx, c, box, o)   2.5D cutaway block: o.layers [{ key, thick }],
 *                             o.deform(x, y) in block units (x 0..1, y 0 top..1 bottom)
 *   layerCache()              cache(ctx, key, paint): paint the static layers once per key
 *                             (stage, rotation, colours) and blit them; redraw only on change
 *   streamlines(field, box, o) / drawStreamlines(ctx, lines, color, t)   wind or currents
 *                             as marching-dash lines; pure (same field -> same lines)
 */
import { SimGeo } from 'simulations/base/SimGeo.js';
import { alpha, lighten, darken, pill, mulberry32 } from './SimLook.js';
import { elevColor } from './GeoLook.js';

export const CREDIT_INDIA = 'Boundary of India: Survey of India';
export const PLATE_KEYS = { diverge: 'good', converge: 'bad', subduct: 'bad', transform: 'warning' };

export async function loadMap(names = ['land']) {
  const out = {};
  await Promise.all(names.map(async (n) => { out[n] = n === 'land' ? await SimGeo.loadWorld('land') : await SimGeo.loadLayer(n); }));
  return out;
}

/** Fitted projection in o.box: o.kind, o.rotate, o.extent [[lon0, lat0], [lon1, lat1]], o.pad. view.at(ll) -> [x, y] | null. */
export async function makeView(ctx, o = {}) {
  const d3 = await SimGeo.d3();
  // Design px: a HiDPI SimScene canvas is k x larger with a k x base transform.
  const k = ctx.getTransform?.()?.a || 1;
  const box = o.box ?? { x: 0, y: 0, w: ctx.canvas.width / k, h: ctx.canvas.height / k };
  const fn = { orthographic: 'geoOrthographic', mercator: 'geoMercator', equalEarth: 'geoEqualEarth', naturalEarth: 'geoNaturalEarth1' }[o.kind ?? 'orthographic'];
  const proj = d3[fn]();
  if (o.rotate) proj.rotate(o.rotate);
  if ((o.kind ?? 'orthographic') === 'orthographic') proj.clipAngle(90);
  const pad = o.pad ?? 0;
  const ext = [[box.x + pad, box.y + pad], [box.x + box.w - pad, box.y + box.h - pad]];
  if (o.extent) {
    const [[a, b], [c2, d]] = o.extent;
    proj.fitExtent(ext, { type: 'MultiPoint', coordinates: [[a, b], [c2, d], [a, d], [c2, b]] });
  } else proj.fitExtent(ext, { type: 'Sphere' });
  const path = d3.geoPath(proj).context(ctx);
  const graticule = d3.geoGraticule().step(o.graticule ?? [30, 30])();
  const v = {
    proj, path, box, graticule, d3,
    at(ll) {
      if (proj.clipAngle() && d3.geoDistance(ll, [-proj.rotate()[0], -proj.rotate()[1]]) > Math.PI / 2) return null;
      return proj(ll);
    },
    setRotate(r) { proj.rotate(r); },
    centre() { const t = proj.translate(); return { x: t[0], y: t[1], r: proj.scale() }; },
  };
  return v;
}

export function drawGlobeBase(ctx, v, c, o = {}) {
  const { x, y, r } = v.centre();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r + 10, 0, Math.PI * 2);
  ctx.fillStyle = alpha(c.accent, 0.12);
  ctx.fill();
  ctx.beginPath();
  v.path.context(ctx)({ type: 'Sphere' });
  ctx.fillStyle = o.ocean ?? c.seaDeep;
  ctx.fill();
  ctx.beginPath();
  v.path.context(ctx)(v.graticule);
  ctx.strokeStyle = alpha(c.label, 0.1);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** Rim light + night side: call after the layers, over the globe. */
export function drawGlobeShade(ctx, v, c) {
  const { x, y, r } = v.centre();
  ctx.save();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, alpha(lighten(c.skyDay, 0.6), 0.16));
  g.addColorStop(0.7, alpha(c.bgDeep, 0));
  g.addColorStop(1, alpha(c.bgDeep, 0.4));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = alpha(c.accent, 0.45);
  ctx.stroke();
  ctx.restore();
}

export function drawLand(ctx, v, c, land, o = {}) {
  ctx.save();
  if (o.relief) {
    ctx.drawImage(o.relief, v.box.x, v.box.y, v.box.w, v.box.h);
  } else {
    ctx.beginPath();
    v.path.context(ctx)(land);
    ctx.fillStyle = o.fill ?? c.elevLow;
    ctx.fill();
  }
  ctx.beginPath();
  v.path.context(ctx)(land);
  ctx.strokeStyle = o.stroke ?? alpha(darken(c.elevLow, 0.35), 0.8);
  ctx.lineWidth = o.lineWidth ?? 1;
  ctx.stroke();
  ctx.restore();
}

/** Elevation-shaded view box (land from the coastline, height from the 1-degree grid). */
export function reliefImage(v, c, map, o = {}) {
  const step = o.step ?? 2;
  const w = Math.ceil(v.box.w / step), h = Math.ceil(v.box.h / step);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const mask = document.createElement('canvas');
  mask.width = w; mask.height = h;
  const m = mask.getContext('2d');
  m.setTransform(1 / step, 0, 0, 1 / step, -v.box.x / step, -v.box.y / step);
  m.beginPath();
  v.d3.geoPath(v.proj).context(m)(map.land);
  m.fillStyle = c.label;
  m.fill();
  const mk = m.getImageData(0, 0, w, h)?.data;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData?.(w, h);
  if (!mk || !img?.data) return null;   // no pixel access (Node test host): callers draw flat land
  const cache = new Map();
  const rgb = (metres) => {
    const b = Math.round(metres / 40);
    let p = cache.get(b);
    if (!p) {
      const s = elevColor(c, b * 40, { top: o.top ?? 5500 });
      const mm = /rgba?\(([\d.]+),([\d.]+),([\d.]+)/.exec(s.replace(/\s/g, ''));
      p = mm ? [+mm[1], +mm[2], +mm[3]] : [0, 2, 4].map((i) => parseInt(s.slice(1 + i, 3 + i), 16) || 0);
      cache.set(b, p);
    }
    return p;
  };
  const disc = v.proj.clipAngle() ? v.centre() : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = v.box.x + (x + 0.5) * step, py = v.box.y + (y + 0.5) * step;
    if (disc && (px - disc.x) ** 2 + (py - disc.y) ** 2 > disc.r * disc.r) continue;
    const ll = v.proj.invert([px, py]);
    if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) continue;
    const i = (y * w + x) * 4;
    const land = mk[i + 3] > 127;
    let e = map.elevation.at(ll[0], ll[1]);
    if (land && e < 30) e = 30;
    if (!land && e > -30) e = -30;
    const p = rgb(e);
    img.data[i] = p[0]; img.data[i + 1] = p[1]; img.data[i + 2] = p[2]; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** India from the Survey of India layer (the only legal source of its border) + credit chip. o: { fill, stroke, lineWidth, credit }. */
export function drawIndia(ctx, v, c, india, o = {}) {
  ctx.save();
  ctx.beginPath();
  v.path.context(ctx)(india);
  if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
  ctx.strokeStyle = o.stroke ?? c.label;
  ctx.lineWidth = o.lineWidth ?? 1.6;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
  if (o.credit !== false) {
    const b = v.box;
    pill(ctx, c, CREDIT_INDIA, b.x + b.w - 6, b.y + b.h - 14, { align: 'right', size: 13, bg: alpha(c.bgSurface, 0.85), ink: c.labelMuted });
  }
}

export function drawPlates(ctx, v, c, plates, o = {}) {
  const kinds = o.kinds ?? ['diverge', 'transform', 'converge', 'subduct'];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const k of kinds) {
    const f = plates.features.find((q) => q.properties.kind === k);
    if (!f) continue;
    const col = c[PLATE_KEYS[k]];
    const w = (o.width ?? 2.2) * (k === 'subduct' ? 1.5 : 1);
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.beginPath();
    v.path.context(ctx)(f);
    ctx.strokeStyle = alpha(c.bgDeep, 0.55);
    ctx.lineWidth = w + 2.5;
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.setLineDash(k === 'transform' ? [4, 5] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

export function drawQuakes(ctx, v, c, quakes, o = {}) {
  // Two batched paths (shallow, deep): thousands of points stay one fill each.
  const paths = [new Path2D(), new Path2D()];
  let n = 0;
  for (const f of quakes.features) {
    if (o.max && n >= o.max) break;
    const p = v.at(f.geometry.coordinates);
    if (!p) continue;
    const r = Math.max(1.5, (f.properties.mag - 5.5) * (o.scale ?? 3));
    const path = paths[f.properties.depthKm > 70 ? 1 : 0];
    path.moveTo(p[0] + r, p[1]);
    path.arc(p[0], p[1], r, 0, Math.PI * 2);
    n++;
  }
  ctx.save();
  ctx.fillStyle = alpha(c.warning, o.alpha ?? 0.55);
  ctx.fill(paths[0]);
  ctx.fillStyle = alpha(c.s5, o.alpha ?? 0.55);
  ctx.fill(paths[1]);
  ctx.restore();
}

export function drawVolcanoes(ctx, v, c, volcanoes, o = {}) {
  const path = new Path2D();
  const s = o.size ?? 4.5;
  for (const f of volcanoes.features) {
    if (o.recentOnly && !f.properties.recent) continue;
    const p = v.at(f.geometry.coordinates);
    if (!p) continue;
    path.moveTo(p[0], p[1] - s);
    path.lineTo(p[0] + s * 0.9, p[1] + s * 0.6);
    path.lineTo(p[0] - s * 0.9, p[1] + s * 0.6);
    path.closePath();
  }
  ctx.save();
  ctx.fillStyle = alpha(c.magma, o.alpha ?? 0.95);
  ctx.fill(path);
  ctx.restore();
}

export function drawRivers(ctx, v, c, rivers, o = {}) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const f of rivers.features) {
    if (o.names && !o.names.includes(f.properties.name)) continue;
    ctx.beginPath();
    v.path.context(ctx)(f);
    ctx.strokeStyle = o.color ?? c.seaShallow;
    ctx.lineWidth = o.width ?? 2;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * const cache = layerCache();  ...  cache(ctx, [stage, rot[0], rot[1], c], (o) => { drawLand(o, ...) })
 * Re-paints when any key part changes (compared with ===), else one drawImage.
 */
export function layerCache() {
  let cv = null, key = null;
  return (ctx, k, paint) => {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const m = ctx.getTransform?.();
    const sx = m?.a || 1, sy = m?.d || 1;
    if (!cv || cv.width !== w || cv.height !== h) {
      cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      key = null;
    }
    if (!key || key.length !== k.length || k.some((x, i) => x !== key[i])) {
      const o = cv.getContext('2d');
      o.setTransform?.(1, 0, 0, 1, 0, 0);
      o.clearRect(0, 0, w, h);
      o.setTransform?.(sx, 0, 0, sy, 0, 0);
      paint(o);
      key = k.slice();
    }
    ctx.drawImage(cv, 0, 0, w / sx, h / sy);
  };
}

// -- Cross-section --------------------------------------------------------------

/**
 * A 2.5D cutaway block in box {x, y, w, h} (front face + top + right side).
 * o: { layers: [{ key, thick }] (thick in block units, sum ~1), depth (px, oblique
 * offset, default 0.18 w), deform(x, y) -> [x, y] in block units, n (samples) }.
 * Extras (all optional, all off by default):
 *   o.endLines: true   dark edge lines down both ends of the front face and along every layer boundary
 *   o.grain: n         n speckle dots per unit of layer thickness, seeded (same dots every frame)
 *   o.voids: [{ layer, x, y, rx, ry }]   holes (caves, pores): x 0..1 across, y 0..1 within the layer, rx/ry in px
 *   o.fault: { x, slip }   shear: everything right of block-x `x` drops by `slip` (block units), a fault line is drawn
 * Returns the front-face mapper f(x, y) -> [px, py] for placing labels.
 */
export function drawStrataBlock(ctx, c, box, o = {}) {
  const n = o.n ?? 48;
  const dx = o.depth ?? box.w * 0.18, dy = -dx * 0.55;
  const fw = box.w - dx, fh = box.h + dy;
  const fault = o.fault;
  const map = (x, y) => {
    let [xx, yy] = o.deform ? o.deform(x, y) : [x, y];
    if (fault && x >= fault.x) yy += fault.slip;
    return [box.x + xx * fw, box.y - dy + yy * fh];
  };
  const layers = o.layers ?? [];
  let y0 = 0;
  const bounds = [Array.from({ length: n + 1 }, (_, i) => map(i / n, 0))];
  for (const l of layers) {
    y0 += l.thick;
    bounds.push(Array.from({ length: n + 1 }, (_, i) => map(i / n, Math.min(1, y0))));
  }
  ctx.save();
  ctx.lineJoin = 'round';
  // front faces
  layers.forEach((l, i) => {
    const top = bounds[i], bot = bounds[i + 1];
    ctx.beginPath();
    top.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    for (let j = bot.length - 1; j >= 0; j--) ctx.lineTo(bot[j][0], bot[j][1]);
    ctx.closePath();
    ctx.fillStyle = c[l.key];
    ctx.fill();
    // texture: a few soft stripes inside each band
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = alpha(darken(c[l.key], 0.25), 0.35);
    ctx.lineWidth = 1.2;
    for (let s = 1; s < 3; s++) {
      ctx.beginPath();
      for (let j = 0; j <= n; j++) {
        const p = top[j], q = bot[j];
        const px = p[0] + (q[0] - p[0]) * s / 3, py = p[1] + (q[1] - p[1]) * s / 3;
        j ? ctx.lineTo(px, py + Math.sin(j * 0.9 + i) * 1.2) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    if (o.grain) {
      const rnd = mulberry32(1000 + i * 77);
      ctx.fillStyle = alpha(darken(c[l.key], 0.35), 0.45);
      const dots = Math.round(o.grain * l.thick);
      for (let k = 0; k < dots; k++) {
        const j = Math.floor(rnd() * n), t = rnd();
        const p = top[j], q = bot[j];
        ctx.beginPath();
        ctx.arc(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, 0.9 + rnd() * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    if (o.endLines) {
      ctx.strokeStyle = alpha(darken(c[l.key], 0.5), 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(top[0][0], top[0][1]); ctx.lineTo(bot[0][0], bot[0][1]);
      ctx.moveTo(top[n][0], top[n][1]); ctx.lineTo(bot[n][0], bot[n][1]);
      bot.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
    }
    ctx.beginPath();
    top.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.strokeStyle = alpha(darken(c[l.key], 0.4), 0.8);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  for (const v of o.voids ?? []) {
    const l0 = layers.slice(0, v.layer).reduce((a, l) => a + l.thick, 0), l = layers[v.layer];
    if (!l) continue;
    const [vx, vy] = map(v.x, l0 + v.y * l.thick);
    ctx.beginPath();
    ctx.ellipse(vx, vy, v.rx, v.ry ?? v.rx * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = alpha(c.bgDeep, 0.9);
    ctx.fill();
    ctx.strokeStyle = alpha(darken(c[l.key], 0.5), 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (fault) {
    const a2 = map(fault.x - 1e-4, 0), b2 = map(fault.x - 1e-4, 1);
    ctx.beginPath();
    ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b2[0], b2[1]);
    ctx.strokeStyle = alpha(c.bgDeep, 0.85);
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // top face (the top layer's surface seen from above)
  const top = bounds[0];
  if (layers[0]) {
    ctx.beginPath();
    top.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    for (let j = top.length - 1; j >= 0; j--) ctx.lineTo(top[j][0] + dx, top[j][1] + dy);
    ctx.closePath();
    ctx.fillStyle = lighten(c[layers[0].key], 0.18);
    ctx.fill();
    ctx.strokeStyle = alpha(darken(c[layers[0].key], 0.35), 0.9);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // right side, darker
  layers.forEach((l, i) => {
    const a = bounds[i][n], b = bounds[i + 1][n];
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0] + dx, a[1] + dy); ctx.lineTo(b[0] + dx, b[1] + dy); ctx.lineTo(b[0], b[1]);
    ctx.closePath();
    ctx.fillStyle = darken(c[l.key], 0.22);
    ctx.fill();
  });
  ctx.restore();
  return map;
}

// -- Flow (wind, currents) --------------------------------------------------------

/**
 * Streamlines of field(x, y) -> [vx, vy] (px units, any scale) from a seed grid in box.
 * Pure: same field, same lines (resume-safe); rebuild only when the field changes.
 * o: { step (seed spacing px, 46), len (points, 14), h (px per point, 6), skip(x, y) }
 */
export function streamlines(field, box, o = {}) {
  const step = o.step ?? 46, len = o.len ?? 14, h = o.h ?? 6;
  const lines = [];
  for (let y = box.y + step / 2; y < box.y + box.h; y += step) {
    for (let x = box.x + step / 2 + ((y / step) % 2) * step / 2; x < box.x + box.w; x += step) {
      if (o.skip?.(x, y)) continue;
      const pts = [[x, y]];
      let px = x, py = y;
      for (let i = 0; i < len; i++) {
        const [vx, vy] = field(px, py);
        const m = Math.hypot(vx, vy);
        if (m < 1e-6) break;
        px += vx / m * h; py += vy / m * h;
        if (px < box.x || px > box.x + box.w || py < box.y || py > box.y + box.h) break;
        pts.push([px, py]);
      }
      if (pts.length > 3) lines.push({ pts, speed: Math.hypot(...field(x, y)) });
    }
  }
  return lines;
}

/** Marching-dash streamlines with an arrowhead each (t = scene clock; motion freezes when parked). */
export function drawStreamlines(ctx, lines, color, t = 0, o = {}) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = o.width ?? 3;
  ctx.globalAlpha = o.alpha ?? 0.9;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -t * (o.speed ?? 28);
  for (const l of lines) {
    ctx.beginPath();
    l.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const l of lines) {
    const [x1, y1] = l.pts[l.pts.length - 1], [x0, y0] = l.pts[l.pts.length - 2];
    const a = Math.atan2(y1 - y0, x1 - x0), r = (o.width ?? 3) * 2.6;
    ctx.beginPath();
    ctx.moveTo(x1 + Math.cos(a) * r, y1 + Math.sin(a) * r);
    ctx.lineTo(x1 + Math.cos(a + 2.5) * r, y1 + Math.sin(a + 2.5) * r);
    ctx.lineTo(x1 + Math.cos(a - 2.5) * r, y1 + Math.sin(a - 2.5) * r);
    ctx.fill();
  }
  ctx.restore();
}
