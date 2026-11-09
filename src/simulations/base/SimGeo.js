/**
 * SimGeo — shared world-map rendering for CanvasSimulation scenes (migration
 * routes, monsoon/climate maps, civics/geography lessons, discovery-site
 * timelines, etc).
 *
 * Deliberately built on the d3-geo + topojson-client + world-atlas stack
 * (already vendored — see vendor/d3.js, vendor/topojson-client.js,
 * vendor/world-atlas/*.json) instead of hand-digitized SVG polygon strings
 * baked into a scene file: d3-geo does real map projections (with correct
 * lon/lat -> px math for the chosen projection, not a linear stretch) and
 * `world-atlas`'s TopoJSON is the actual Natural-Earth-derived land/country
 * geometry, so a scene never needs its own `LAND_POLYGONS`-style coordinate
 * dump. That also means a site's position is authored as plain `{lon, lat}`
 * and reprojected live — the same content works at any canvas size or
 * projection, unlike pixel coordinates pre-baked for one fixed 800x500
 * equirectangular layout.
 *
 * All d3/topojson imports are dynamic and cached module-wide — this file
 * itself stays a cheap synchronous import (matches the "never add a heavy
 * vendor dep to the eager import map" rule; see CLAUDE.md hard invariant 2).
 */

import { appUrl } from '../../core/basePath.js';

const WORLD_DATA = {
  land: { url: appUrl('vendor/world-atlas/land-110m.json'), objectKey: 'land' },
  countries: { url: appUrl('vendor/world-atlas/countries-110m.json'), objectKey: 'countries' },
};

// Data layers in vendor/geo/ (sources and licences: vendor/geo/SOURCES.md).
// India's boundary comes ONLY from 'india' (Survey of India); see that file.
const LAYER_FILES = {
  india: 'india-soi.json', plates: 'plates.json', quakes: 'quakes.json',
  volcanoes: 'volcanoes.json', elevation: 'elevation-1deg.json', rivers: 'rivers.json',
};
const layerUrl = (f) => appUrl('vendor/geo/' + f);
const _layerCache = new Map();

// Colour maths on a resolved colour string (hex or rgb[a]); anything else comes back unchanged.
function rgbaOf(col) {
  const t = String(col || '').trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(t);
  if (m) {
    let h = m[1];
    if (h.length < 6) h = h.split('').map((ch) => ch + ch).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(t);
  if (m) return [+m[1], +m[2], +m[3], m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1];
  return null;
}
/** The fill moved toward white (k > 0) or black (k < 0) by |k|. */
function shade(col, k) {
  const p = rgbaOf(col);
  if (!p) return col;
  const to = k > 0 ? 255 : 0, t = Math.abs(k);
  const c = (v) => Math.round(v + (to - v) * t);
  return `rgba(${c(p[0])},${c(p[1])},${c(p[2])},${p[3]})`;
}
/** The shelf halo under a landmass: the land tone lightened, at low alpha. */
function shelfTone(fill) {
  const p = rgbaOf(fill);
  if (!p) return fill;
  const c = (v) => Math.round(v + (255 - v) * 0.35);
  return `rgba(${c(p[0])},${c(p[1])},${c(p[2])},0.28)`;
}

/** {fields, rows} -> FeatureCollection of Points (properties named by fields; lon/lat are the geometry). */
function rowsToPoints({ fields, rows }) {
  const features = rows.map((r) => {
    const properties = {};
    fields.forEach((k, i) => { if (k !== 'lon' && k !== 'lat') properties[k] = r[i]; });
    return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: [r[0], r[1]] } };
  });
  return { type: 'FeatureCollection', features };
}

/** 1-degree elevation grid: { w, h, data: Float32Array metres, at(lon, lat) bilinear }. */
function decodeElevation(g) {
  const bin = atob(g.data);
  const data = new Float32Array(g.w * g.h);
  for (let i = 0; i < data.length; i++) {
    const v = bin.charCodeAt(i);
    data[i] = v < 128 ? (v - 127) / 127 * 11000 : (v - 128) / 127 * 9000;
  }
  const cell = (c, r) => data[Math.max(0, Math.min(g.h - 1, r)) * g.w + ((c % g.w) + g.w) % g.w];
  const at = (lon, lat) => {
    const x = (lon - g.lon0) / g.step, y = (g.lat0 - lat) / g.step;
    const c = Math.floor(x), r = Math.floor(y), fx = x - c, fy = y - r;
    return (cell(c, r) * (1 - fx) + cell(c + 1, r) * fx) * (1 - fy) + (cell(c, r + 1) * (1 - fx) + cell(c + 1, r + 1) * fx) * fy;
  };
  return { w: g.w, h: g.h, lon0: g.lon0, lat0: g.lat0, step: g.step, data, at };
}

const PROJECTIONS = {
  naturalEarth: 'geoNaturalEarth1',
  equalEarth: 'geoEqualEarth',
  equirectangular: 'geoEquirectangular',
  mercator: 'geoMercator',
  orthographic: 'geoOrthographic',
};

let _d3Promise = null;
let _topojsonPromise = null;
const _worldCache = new Map(); // dataset key -> Promise<GeoJSON FeatureCollection>

function loadD3() {
  if (!_d3Promise) _d3Promise = import('vendor/d3.js');
  return _d3Promise;
}

function loadTopojson() {
  if (!_topojsonPromise) _topojsonPromise = import('vendor/topojson-client.js');
  return _topojsonPromise;
}

export const SimGeo = {
  /** The d3 module (lazy, cached): for d3-geo calls SimGeo does not wrap (fitExtent, invert). */
  d3() { return loadD3(); },

  /**
   * Loads + parses a bundled world-atlas dataset into a GeoJSON
   * FeatureCollection. Cached module-wide (by dataset name) — the same Earth
   * doesn't need re-fetching or re-parsing per scene instance.
   * @param {'land'|'countries'} dataset  'land' = continent silhouettes only
   *   (best for physical/historical maps); 'countries' = country-level
   *   polygons with `.id` = numeric ISO 3166-1 code (best when a lesson needs
   *   to highlight/color specific countries).
   * @returns {Promise<GeoJSON.FeatureCollection>}
   */
  loadWorld(dataset = 'land') {
    const spec = WORLD_DATA[dataset];
    if (!spec) {
      throw new Error(`[SimGeo] Unknown world dataset "${dataset}" — expected one of: ${Object.keys(WORLD_DATA).join(', ')}`);
    }
    if (!_worldCache.has(dataset)) {
      _worldCache.set(dataset, (async () => {
        const [topojson, res] = await Promise.all([loadTopojson(), fetch(spec.url)]);
        const topo = await res.json();
        return topojson.feature(topo, topo.objects[spec.objectKey]);
      })());
    }
    return _worldCache.get(dataset);
  },

  /**
   * Loads a vendor/geo layer (cached). Returns:
   *   'india'      Feature (MultiPolygon): Survey of India boundary. The ONLY legal source
   *                for India's border; credit "Boundary of India: Survey of India".
   *   'plates'     FeatureCollection: MultiLineStrings with properties.kind
   *                diverge | converge | subduct | transform, and Points with kind 'plate'
   *                { code, name, major, vEU: [east, north] mm/yr relative to Eurasia }.
   *   'quakes'     Points { depthKm, mag, year } (M >= 6, 2000-2024).
   *   'volcanoes'  Points { elevM, recent, name }.
   *   'rivers'     MultiLineStrings { name, rank }.
   *   'elevation'  grid { data, at(lon, lat) -> metres (sea negative) }.
   * @param {'india'|'plates'|'quakes'|'volcanoes'|'rivers'|'elevation'} name
   */
  loadLayer(name) {
    const f = LAYER_FILES[name];
    if (!f) throw new Error(`[SimGeo] Unknown layer "${name}" - expected one of: ${Object.keys(LAYER_FILES).join(', ')}`);
    if (!_layerCache.has(name)) {
      _layerCache.set(name, fetch(layerUrl(f)).then((r) => r.json()).then((j) => {
        if (name === 'elevation') return decodeElevation(j);
        return j.rows ? rowsToPoints(j) : j;
      }));
    }
    return _layerCache.get(name);
  },

  /**
   * Builds a d3-geo projection fitted so `fitTo` (usually the result of
   * `loadWorld()`) exactly fills `[width, height]` px.
   * @param {'naturalEarth'|'equalEarth'|'equirectangular'|'mercator'|'orthographic'} kind
   * @param {GeoJSON.GeoJSON} fitTo
   * @param {[number, number]} size  [width, height] in canvas px
   * @param {object} [opts]
   * @param {[number, number, number]} [opts.rotate]  [lambda, phi, gamma] in degrees
   * @param {number} [opts.clipAngle]  e.g. 90 for orthographic's visible hemisphere
   */
  async makeProjection(kind, fitTo, size, opts = {}) {
    const d3 = await loadD3();
    const fnName = PROJECTIONS[kind];
    if (!fnName || typeof d3[fnName] !== 'function') {
      throw new Error(`[SimGeo] Unknown projection "${kind}" — expected one of: ${Object.keys(PROJECTIONS).join(', ')}`);
    }
    const projection = d3[fnName]();
    if (opts.rotate) projection.rotate(opts.rotate);
    if (opts.clipAngle != null) projection.clipAngle(opts.clipAngle);
    projection.fitSize(size, fitTo);
    return projection;
  },

  /**
   * A d3-geo path generator bound directly to a Canvas 2D context: calling
   * `pathGen(feature)` issues moveTo/lineTo/etc. straight into `ctx`'s
   * current path — call `ctx.fill()`/`ctx.stroke()` yourself after (or use
   * `drawFeatures()` below for the common one-shot case).
   * @param {CanvasRenderingContext2D} ctx
   * @param {Function} projection
   */
  async makePath(ctx, projection) {
    const d3 = await loadD3();
    return d3.geoPath(projection).context(ctx);
  },

  /**
   * Fill+stroke one feature, a bare array of features, or a FeatureCollection, in one call.
   * A filled AND stroked feature is a landmass (the Quill look, card rule 3): it gets a soft shelf halo
   * under its coast (the fill, lightened, at low alpha, as a wide stroke), the flat fill, then a coast rim at
   * least 2 px wide; `shelf: false` turns the halo off. A stroke-only call (graticule, river, route) is
   * drawn exactly as asked.
   */
  drawFeatures(ctx, pathGen, features, { fill, stroke, lineWidth = 1, shelf = true } = {}) {
    const list = features?.type === 'FeatureCollection'
      ? features.features
      : (Array.isArray(features) ? features : [features]);
    ctx.beginPath();
    for (const f of list) pathGen(f);
    const land = fill && stroke;
    if (land && shelf) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = shelfTone(fill);
      ctx.lineWidth = Math.max(10, lineWidth * 8);
      ctx.stroke();
      ctx.restore();
    }
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = land ? Math.max(2, lineWidth) : lineWidth; ctx.lineJoin = 'round'; ctx.stroke(); }
  },

  /** A lat/lon graticule as a drawable GeoJSON MultiLineString geometry (draw via drawFeatures/pathGen, stroke only). */
  async makeGraticule(step = [20, 20]) {
    const d3 = await loadD3();
    return d3.geoGraticule().step(step)();
  },

  /**
   * A great-circle route between two [lon, lat] points, densified into a
   * GeoJSON LineString so it draws as a genuine curve once projected
   * (instead of a straight chord between the two projected endpoints).
   * @param {[number, number]} from  [lon, lat]
   * @param {[number, number]} to    [lon, lat]
   * @param {number} [steps]
   */
  async routeLine(from, to, steps = 32) {
    const d3 = await loadD3();
    const interpolate = d3.geoInterpolate(from, to);
    const coordinates = [];
    for (let i = 0; i <= steps; i++) coordinates.push(interpolate(i / steps));
    return { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} };
  },

  /** Projects a single [lon, lat] to canvas [x, y] px (null if behind the globe on a rotated/clipped projection). */
  project(projection, lonLat) {
    return projection(lonLat);
  },

  /**
   * Finds the nearest site to a canvas click point, projecting each site's
   * `{lon, lat}` live rather than requiring pre-baked pixel coordinates in
   * content JSON.
   * @param {number} px
   * @param {number} py
   * @param {Array<{lon: number, lat: number}>} sites
   * @param {Function} projection
   * @param {number} [radius]  hit-test radius in px
   * @returns {number} index of the hit site, or -1
   */
  hitTestSites(px, py, sites, projection, radius = 20) {
    for (let i = 0; i < sites.length; i++) {
      const p = projection([sites[i].lon, sites[i].lat]);
      if (!p) continue;
      if (Math.hypot(px - p[0], py - p[1]) <= radius) return i;
    }
    return -1;
  },

  /**
   * Small filled+stroked circle marker (site pin / discovery marker) at an already-projected [x, y], with a
   * solid lip under it so it stands on the map. Pass the scene's tokens (c.mapPin, c.label): the defaults are
   * only a fallback for a scene with no map colours.
   */
  drawPin(ctx, [x, y], { radius = 5, fill = '#ef4444', stroke = '#fff', lineWidth = 1.5 } = {}) {
    ctx.beginPath();
    ctx.arc(x, y + Math.max(1.5, radius * 0.3), radius, 0, Math.PI * 2);
    ctx.fillStyle = shade(fill, -0.4);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  },
};
