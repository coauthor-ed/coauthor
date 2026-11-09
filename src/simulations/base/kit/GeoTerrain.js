/**
 * GeoTerrain - three.js builders for GeoScene. Every builder takes the scene
 * (for this.mat / this.tint / this.THREE), adds nothing to the scene graph
 * itself, and returns the object; call from build(). Colours follow the theme.
 *   heightfield(s, o)    lit terrain, vertex colours from the elevation ramp;
 *                        .userData.setHeight(fn) re-shapes it (time-varying land);
 *                        o.skirt = base y: block-diagram side walls banded strata1..6
 *   waterPlane(s, o)     sea / lake level plane; move .position.y to flood
 *   ribbon(s, pts, o)    river / lava ribbon along points; .userData.setPoints(pts)
 *   cutawayBlock(s, o)   layered block (strata side walls) with a deform(x, y, z)
 *                        -> [x, y, z]; foldDeform() / faultDeform() presets;
 *                        .userData.setDeform(fn) re-shapes it
 *   globe(s, o)          Earth sphere painted from SimGeo land + elevation layers;
 *                        India's border (if drawn) comes from the Survey of India layer
 *   overlaySphere(s, o)  transparent shell painted by o.draw(ctx, eq, c) (plates, arrows)
 *   o.cut = [phiStart, phiLength] on globe/overlay leaves a wedge gap (cutaway views)
 *   sphereGeo(T, r, seg, cut)      that geometry alone: reuse a globe's material on a cut copy
 *   lonLatToVec3(T, lon, lat, r)   a point on that globe
 *   arrow(s, from, to, o)          fat arrow (plate motion, flow)
 *   glowSprite(s, key, size)       additive halo (magma, sun)
 *   fbm(seed)                      seeded 2D fractal noise (x, z) -> [-1, 1]
 * Heights are world units; o.metres (default 1000) maps one unit to metres for colour.
 */
import { SimGeo } from 'simulations/base/SimGeo.js';
import { mulberry32 } from './SimLook.js';
import { elevColor } from './GeoLook.js';

// -- Noise ------------------------------------------------------------------------

export function fbm(seed = 1) {
  const rnd = mulberry32(seed);
  const P = new Uint8Array(512);
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [base[i], base[j]] = [base[j], base[i]]; }
  for (let i = 0; i < 512; i++) P[i] = base[i & 255];
  const G = Array.from({ length: 256 }, () => rnd() * 2 - 1);
  const fade = (t) => t * t * (3 - 2 * t);
  const val = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const h = (a, b) => G[P[(P[a & 255] + b) & 511]];
    const u = fade(xf), w = fade(zf);
    const a = h(xi, zi) + (h(xi + 1, zi) - h(xi, zi)) * u;
    const b = h(xi, zi + 1) + (h(xi + 1, zi + 1) - h(xi, zi + 1)) * u;
    return a + (b - a) * w;
  };
  return (x, z, oct = 4) => {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { s += val(x * f, z * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  };
}

// -- Terrain ----------------------------------------------------------------------


/** o: { size: [w, d], n (segments, halved on lowEnd), height: (x, z) => y, metres, seaLevel (m), top (m), skirt (base y) } */
export function heightfield(s, o = {}) {
  const T = s.THREE;
  const [w, d] = o.size ?? [10, 10];
  const n = Math.max(8, Math.round((o.n ?? 96) / (s.lowEnd ? 2 : 1)));
  const geo = new T.PlaneGeometry(w, d, n, n);
  geo.rotateX(-Math.PI / 2);
  geo.setAttribute('color', new T.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
  const mesh = new T.Mesh(geo, s.mat(null, { vertexColors: true, roughness: 0.95, flatShading: !!o.flat }));
  let hfn = o.height ?? (() => 0);
  const metres = o.metres ?? 1000;
  let lut = new Map();   // 10 m buckets -> THREE.Color (linear), rebuilt on theme change
  const paint = (fresh) => {
    if (fresh) lut = new Map();
    const pos = geo.attributes.position, col = geo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const b = Math.round(pos.getY(i) * metres / 10);
      let cc = lut.get(b);
      if (!cc) { cc = new T.Color(elevColor(s.c, b * 10, o)); lut.set(b, cc); }
      col.setXYZ(i, cc.r, cc.g, cc.b);
    }
    col.needsUpdate = true;
  };
  const setHeight = (fn) => {
    hfn = fn ?? hfn;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, hfn(pos.getX(i), pos.getZ(i)));
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    paint();
  };
  let walls = null;
  if (o.skirt != null) {
    walls = skirtWalls(s, w, d, n, o.skirt);
    mesh.add(walls.mesh);
  }
  const setAll = (fn) => { setHeight(fn); walls?.update(hfn); };
  setAll(hfn);
  s.tint(() => paint(true));
  mesh.userData.setHeight = setAll;
  return mesh;
}

// Side walls of a terrain block: 6 crisp strata bands from the surface down to base y.
function skirtWalls(s, w, d, n, base) {
  const T = s.THREE;
  const edges = [];   // [x, z] samples round the rim, per side
  for (const [x0, z0, x1, z1] of [[-w / 2, d / 2, w / 2, d / 2], [w / 2, d / 2, w / 2, -d / 2], [w / 2, -d / 2, -w / 2, -d / 2], [-w / 2, -d / 2, -w / 2, d / 2]]) {
    const side = [];
    for (let i = 0; i <= n; i++) side.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]);
    edges.push(side);
  }
  const B = 6;
  const quads = edges.reduce((a, e) => a + (e.length - 1), 0) * B;
  const pos = new Float32Array(quads * 4 * 3), col = new Float32Array(quads * 4 * 3), idx = [];
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('color', new T.BufferAttribute(col, 3));
  for (let q = 0; q < quads; q++) idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 2, q * 4 + 1, q * 4 + 3);
  geo.setIndex(idx);
  const mesh = new T.Mesh(geo, s.mat(null, { vertexColors: true, roughness: 1, flatShading: true, side: T.DoubleSide }));
  const paint = (c) => {
    let v = 0;
    for (const e of edges) for (let i = 0; i < e.length - 1; i++) for (let b = 0; b < B; b++) {
      const cc = new T.Color(c[`strata${b + 1}`]);
      for (let k = 0; k < 4; k++, v++) col.set([cc.r, cc.g, cc.b], v * 3);
    }
    geo.attributes.color.needsUpdate = true;
  };
  const update = (hfn) => {
    let v = 0;
    const frac = [0, 0.08, 0.22, 0.4, 0.6, 0.8, 1];   // thin soil on top, thick basement below
    for (const e of edges) for (let i = 0; i < e.length - 1; i++) {
      const [xa, za] = e[i], [xb, zb] = e[i + 1];
      const ha = hfn(xa, za), hb = hfn(xb, zb);
      for (let b = 0; b < B; b++) {
        const ya0 = ha - (ha - base) * frac[b], ya1 = ha - (ha - base) * frac[b + 1];
        const yb0 = hb - (hb - base) * frac[b], yb1 = hb - (hb - base) * frac[b + 1];
        pos.set([xa, ya0, za, xb, yb0, zb, xa, ya1, za, xb, yb1, zb], v * 3);
        v += 4;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };
  s.tint(paint);
  return { mesh, update };
}

/** o: { size: [w, d], level, key ('seaShallow'), opacity } */
export function waterPlane(s, o = {}) {
  const T = s.THREE;
  const [w, d] = o.size ?? [10, 10];
  const geo = new T.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  const m = s.mat(o.key ?? 'seaShallow', { transparent: true, opacity: o.opacity ?? 0.78, roughness: 0.25, metalness: 0.1, depthWrite: false });
  const mesh = new T.Mesh(geo, m);
  mesh.position.y = o.level ?? 0;
  mesh.renderOrder = 2;
  return mesh;
}

/** pts: [[x, y, z], ...] or Vector3s. o: { width, key ('seaShallow'), lift (above the points) } */
export function ribbon(s, pts, o = {}) {
  const T = s.THREE;
  const geo = new T.BufferGeometry();
  const mesh = new T.Mesh(geo, s.mat(o.key ?? 'seaShallow', { roughness: 0.3, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  const setPoints = (p) => {
    const v = p.map((q) => (q.isVector3 ? q : new T.Vector3(...q)));
    const pos = [];
    const idx = [];
    for (let i = 0; i < v.length; i++) {
      const a = v[Math.max(0, i - 1)], b = v[Math.min(v.length - 1, i + 1)];
      const dir = b.clone().sub(a).setY(0).normalize();
      const side = new T.Vector3(-dir.z, 0, dir.x).multiplyScalar((typeof o.width === 'function' ? o.width(i / (v.length - 1)) : o.width ?? 0.3) / 2);
      const y = v[i].y + (o.lift ?? 0.02);
      pos.push(v[i].x + side.x, y, v[i].z + side.z, v[i].x - side.x, y, v[i].z - side.z);
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
  };
  setPoints(pts);
  mesh.userData.setPoints = setPoints;
  return mesh;
}

// -- Cutaway block ---------------------------------------------------------------

/** Fold: layers bend up (a > 0, anticline) or down around x0 over a given width. */
export function foldDeform(a, width = 3, x0 = 0) {
  return (x, y, z) => [x, y + a * Math.exp(-(((x - x0) / width) ** 2)), z];
}

/** Fault: the block right of x0 (plane dipping by dip, 0 = vertical) drops by dy. */
export function faultDeform(dy, x0 = 0, dip = 0.3) {
  return (x, y, z) => [x, y + (x - x0 - dip * y > 0 ? -dy : 0), z];
}

/**
 * o: { w, d, strata: [{ key, thick }] top to bottom, seg (x segments), deform }.
 * Returns a Group of one mesh per layer (userData.layers), origin at the top centre.
 */
export function cutawayBlock(s, o = {}) {
  const T = s.THREE;
  const w = o.w ?? 8, d = o.d ?? 4;
  const seg = Math.max(8, Math.round((o.seg ?? 64) / (s.lowEnd ? 2 : 1)));
  const group = new T.Group();
  let y = 0;
  const layers = (o.strata ?? []).map((st) => {
    const geo = new T.BoxGeometry(w, st.thick, d, seg, 1, 1);
    geo.translate(0, y - st.thick / 2, 0);
    y -= st.thick;
    const mesh = new T.Mesh(geo, s.mat(st.key, { roughness: 0.9, flatShading: true }));
    mesh.userData.rest = Float32Array.from(geo.attributes.position.array);
    group.add(mesh);
    return mesh;
  });
  const setDeform = (fn) => {
    for (const m of layers) {
      const pos = m.geometry.attributes.position, rest = m.userData.rest;
      for (let i = 0; i < pos.count; i++) {
        const p = fn ? fn(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]) : [rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]];
        pos.setXYZ(i, p[0], p[1], p[2]);
      }
      pos.needsUpdate = true;
      m.geometry.computeVertexNormals();
    }
  };
  if (o.deform) setDeform(o.deform);
  group.userData.layers = layers;
  group.userData.setDeform = setDeform;
  return group;
}

// -- Globe -----------------------------------------------------------------------

export function lonLatToVec3(T, lon, lat, r = 1) {
  const phi = (lon + 180) * Math.PI / 180, th = (90 - lat) * Math.PI / 180;
  return new T.Vector3(-r * Math.cos(phi) * Math.sin(th), r * Math.cos(th), r * Math.sin(phi) * Math.sin(th));
}

/** Data for globe(): { land, elevation, india }. build() is sync, so await this in setup() before super.setup(). */
export async function loadGlobeData() {
  const [land, elevation, india] = await Promise.all([SimGeo.loadWorld('land'), SimGeo.loadLayer('elevation'), SimGeo.loadLayer('india')]);
  return { land, elevation, india };
}

export function sphereGeo(T, r, seg, cut) {
  if (!cut) return new T.SphereGeometry(r, seg, seg / 2);
  const g = new T.SphereGeometry(r, Math.max(8, Math.round(seg * cut[1] / (Math.PI * 2))), seg / 2, cut[0], cut[1]);
  const uv = g.attributes.uv;   // keep the full-sphere texture mapping on a partial sphere
  for (let i = 0; i < uv.count; i++) uv.setX(i, (cut[0] + uv.getX(i) * cut[1]) / (Math.PI * 2));
  return g;
}

/** o: { radius, tex, cut, draw(ctx, eq, c) where eq([lon, lat]) -> [x, y] on the texture, opacity } */
export function overlaySphere(s, o = {}) {
  const T = s.THREE;
  const tw = s.lowEnd ? 1024 : (o.tex ?? 2048), th = tw / 2;
  const cv = document.createElement('canvas');
  cv.width = tw; cv.height = th;
  const tex = new T.CanvasTexture(cv);
  if ('SRGBColorSpace' in T) tex.colorSpace = T.SRGBColorSpace;
  const mesh = new T.Mesh(sphereGeo(T, o.radius ?? 2.01, s.lowEnd ? 48 : 96, o.cut),
    s.mat(null, { map: tex, transparent: true, opacity: o.opacity ?? 1, depthWrite: false }, 'basic'));
  const eq = (ll) => [(ll[0] + 180) / 360 * tw, (90 - ll[1]) / 180 * th];
  s.tint((c) => {
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, tw, th);
    o.draw?.(ctx, eq, c, tw);
    tex.needsUpdate = true;
  });
  mesh.renderOrder = 3;
  return mesh;
}

/** o: { data (loadGlobeData()), radius, tex (width px, default 1024; 512 on lowEnd), india (outline), graticule, top (m), seg, cut } */
export function globe(s, o = {}) {
  const T = s.THREE;
  const r = o.radius ?? 2;
  const tw = s.lowEnd ? 512 : (o.tex ?? 1024), th = tw / 2;
  const cv = document.createElement('canvas');
  cv.width = tw; cv.height = th;
  const tex = new T.CanvasTexture(cv);
  if ('SRGBColorSpace' in T) tex.colorSpace = T.SRGBColorSpace;
  const seg = s.lowEnd ? 48 : (o.seg ?? 96);
  const mesh = new T.Mesh(sphereGeo(T, r, seg, o.cut), s.mat(null, { map: tex, roughness: 0.9, side: o.cut ? T.DoubleSide : T.FrontSide }));
  const paint = (c) => {
    const data = o.data;
    if (!data) return;
    const ctx = cv.getContext('2d');
    // land mask from the vector coastline (1-degree elevation is too coarse for coasts)
    const mask = document.createElement('canvas');
    mask.width = tw; mask.height = th;
    const mctx = mask.getContext('2d');
    const eq = (lonlat) => [(lonlat[0] + 180) / 360 * tw, (90 - lonlat[1]) / 180 * th];
    const trace = (g, cx) => {
      const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
      for (const poly of polys) for (const ring of poly) {
        ring.forEach((p, i) => {
          const [x, y] = eq(p);
          if (i && Math.abs(p[0] - ring[i - 1][0]) > 180) cx.moveTo(x, y); else if (i) cx.lineTo(x, y); else cx.moveTo(x, y);
        });
        cx.closePath();
      }
    };
    mctx.fillStyle = c.label;
    mctx.beginPath();
    for (const f of data.land.features ?? [data.land]) trace(f.geometry, mctx);
    mctx.fill('evenodd');
    const mk = mctx.getImageData(0, 0, tw, th).data;
    const img = ctx.createImageData(tw, th);
    const ramp = buildRamp(T, c, o);
    for (let y = 0; y < th; y++) {
      const lat = 90 - (y + 0.5) / th * 180;
      for (let x = 0; x < tw; x++) {
        const lon = (x + 0.5) / tw * 360 - 180;
        const i = (y * tw + x) * 4;
        let m = data.elevation.at(lon, lat);
        const land = mk[i + 3] > 127;
        if (land && m < 20) m = 20;
        if (!land && m > -20) m = -20;
        const p = ramp(m);
        img.data[i] = p[0]; img.data[i + 1] = p[1]; img.data[i + 2] = p[2]; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (o.graticule) {
      ctx.strokeStyle = c.label; ctx.globalAlpha = 0.12; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let lon = -180; lon <= 180; lon += 30) { const [x] = eq([lon, 0]); ctx.moveTo(x, 0); ctx.lineTo(x, th); }
      for (let lat = -60; lat <= 60; lat += 30) { const [, y] = eq([0, lat]); ctx.moveTo(0, y); ctx.lineTo(tw, y); }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (o.india && data.india) {
      ctx.strokeStyle = c.label; ctx.lineWidth = Math.max(1, tw / 1024); ctx.globalAlpha = 0.85;
      ctx.beginPath();
      trace(data.india.geometry, ctx);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    tex.needsUpdate = true;
  };
  s.tint(paint);
  mesh.userData.radius = r;
  return mesh;
}

// Elevation ramp as sRGB bytes, 25 m buckets.
function buildRamp(T, c, o) {
  const cache = new Map();
  return (m) => {
    const b = Math.round(m / 25);
    let v = cache.get(b);
    if (!v) {
      const s = elevColor(c, b * 25, { top: o.top ?? 5500 });
      const mm = /rgba?\(([\d.]+),([\d.]+),([\d.]+)/.exec(s.replace(/\s/g, ''));
      v = mm ? [+mm[1], +mm[2], +mm[3]] : hexBytes(s);
      cache.set(b, v);
    }
    return v;
  };
}

function hexBytes(s) {
  const h = s.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
}

// -- Markers ---------------------------------------------------------------------

/** o: { key ('warning'), radius (shaft), head (length) } */
export function arrow(s, from, to, o = {}) {
  const T = s.THREE;
  const a = from.isVector3 ? from : new T.Vector3(...from);
  const b = to.isVector3 ? to : new T.Vector3(...to);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const rad = o.radius ?? len * 0.06, head = Math.min(len * 0.45, o.head ?? rad * 4);
  const m = s.mat(o.key ?? 'warning', { roughness: 0.5, emissive: o.key ?? 'warning', emissiveIntensity: 0.25 });
  const g = new T.Group();
  const shaft = new T.Mesh(new T.CylinderGeometry(rad, rad, len - head, 12), m);
  shaft.position.y = (len - head) / 2;
  const tip = new T.Mesh(new T.ConeGeometry(rad * 2.4, head, 16), m);
  tip.position.y = len - head / 2;
  g.add(shaft, tip);
  g.position.copy(a);
  g.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
  return g;
}

let _disc = null;
/** Additive halo sprite tinted by a token (share one texture per page). */
export function glowSprite(s, key, size = 1) {
  const T = s.THREE;
  if (!_disc) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    // An alpha mask (the material's token tints it), not a displayed colour.
    g.addColorStop(0, 'white');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    _disc = cv;
  }
  const tex = new T.CanvasTexture(_disc);
  const m = s.tint(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: T.AdditiveBlending }), key);
  const sp = new T.Sprite(m);
  sp.scale.setScalar(size);
  return sp;
}
