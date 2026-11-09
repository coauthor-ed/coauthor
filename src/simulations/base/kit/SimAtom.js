// SimAtom.js - atoms, nuclei, ions and bonds, drawn from data (canvas, SimScene).
//
// One material for every particle in the kit, so an atom in one lesson and a nucleus in the next
// read as the same object under the same light (key light top left). A scene says WHAT is there
// (11 protons, shells 2,8,1, a Cl- of radius 12); this file decides how it looks. A later look
// change is then a kit edit only.
//
//   drawAtom(ctx, c, x, y, { p, n, shells: [2, 8, 1], radius: 150, focusShell: 'outer' });
//   drawNucleus(ctx, c, x, y, { p: 2, n: 2, r: 30 });
//   drawIon(ctx, c, x, y, { sym: 'Na', charge: 1, r: 40 });
//   drawMolecule(ctx, c, x, y, { ...MOLECULES.H2O, r: 90 });
//   drawSharedPair(ctx, c, x0, y0, x1, y1, { pull: 1 });
//
// The parts: drawBall (the material under everything), drawElectron, drawNucleon, drawCharge,
// drawSeat, nucleusLayout, drawNucleus, drawShell, shellPoints, atomLayout, drawAtom, drawIon,
// drawBond, drawSharedPair, MOLECULES, atomTone, drawMolecule, drawFocus, drawDepthField.
//
// Sizes: every part reads at a hero size and a small one, and simplifies below it: an atom under
// SMALL_ATOM px has a solid nucleus, no shell band and evenly spread electrons; an ion under
// ION_TEXT_R px loses its symbol and keeps a bold sign; no text is ever drawn under 14 px.
// Geometry: atomLayout and nucleusLayout are pure. drawAtom returns the same record in stage px,
// so a scene can aim a leader or a tap at a shell or an electron.
// Colours: palette keys only, one colour for one kind of particle everywhere: proton and cation
// warm, neutron neutral, electron and anion cool. No faces, ever (card rule 8).
// Motion: drawing is pure, so `phase` is the scene's job. Reduced motion: pass a fixed phase.
// Look: the rim and highlight weights come from the LookProfile (rim, gloss); a look with gloss 0
// (plain) has no highlight and no glow, and marks a focus with a clean ring. Profile: lite is flat
// with one shade; rich adds bounce light along the shaded edge and a slow drift in the depth field.

import { alpha, mix, lighten, darken, luma, contrast, font, inkOn, mulberry32, rr, ellipse, pill, paperKind, frameOf, drawBackdrop, blitLayer, profileOf } from './SimLook.js';
import { lookOf } from './lookProfile.js';
import { reducedMotion } from './SimAnim.js';

const TAU = Math.PI * 2;
const LIGHT = Math.PI / 4;      // the side away from the key light (canvas y runs down)
const MIN_TEXT = 14;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isDay = (c) => luma(c.bgDeep) > 0.5;

export const SMALL_ATOM = 72;   // px: drawAtom simplifies under this radius
export const ION_TEXT_R = 16;   // px: drawIon drops its symbol under this radius
const PACK_MAX = 48;            // nucleons: above this a nucleus is one ball
const PACK_MIN_BALL = 3.2;      // px: a packed nucleon smaller than this reads as noise

/** The particle tones. Falls back through the series for a scene with its own short COLOR_MAP. */
function tones(c) {
  return {
    proton: c.proton ?? c.s6, neutron: c.neutron ?? c.labelMuted, electron: c.electron ?? c.accent,
    cation: c.cation ?? c.s8, anion: c.anion ?? c.s1,
  };
}

const glows = () => lookOf().gloss > 0;
const ground = (c) => c.bgSurface;
const faded = (c, col, dim) => (dim ? mix(col, ground(c), clamp(dim, 0, 0.92)) : col);
const rimTone = (c, col) => (isDay(c) ? darken(col, 0.3) : lighten(col, 0.18));
const rimWidth = (r) => Math.max(1.25, clamp(r * 0.09, 1.5, 3.5) * lookOf().rim);

/**
 * What the beat is about: a halo at night, a tinted shadow and a gold edge by day, a clean ring in a
 * look with no glow. k: strength 0..1. Draw it before the thing it surrounds.
 */
export function drawFocus(ctx, c, x, y, r, k = 1) {
  if (k <= 0) return;
  ctx.save();
  if (!glows()) {
    if (r >= 14) {                                          // a bead needs no ring of its own
      ctx.strokeStyle = alpha(c.accent, k);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r + 4, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const day = isDay(c), col = day ? c.gold : (c.glow ?? c.accent), R = r * 1.5 + 10;
  const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, R);
  g.addColorStop(0, alpha(col, (day ? 0.34 : 0.5) * k));
  g.addColorStop(1, alpha(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
  if (day && r >= 14) {                                     // a small bead is tint enough
    ctx.strokeStyle = alpha(c.gold, 0.9 * k);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r + 3, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

/** Centred display text, leaving the context as it found it. */
function write(ctx, c, text, x, y, size, col) {
  ctx.save();
  ctx.font = font(c, 700, size, true);
  ctx.fillStyle = col;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + size * 0.04);
  ctx.restore();
}

/** The body minus the same disc moved toward the light: the crescent on the far side. */
function crescent(ctx, x, y, r, k) {
  const d = r * k, h = Math.acos(k / 2);
  const ox = x - Math.cos(LIGHT) * d, oy = y - Math.sin(LIGHT) * d;
  ctx.beginPath();
  ctx.arc(x, y, r, LIGHT - (Math.PI - h), LIGHT + (Math.PI - h));
  ctx.arc(ox, oy, r, LIGHT + h, LIGHT - h, true);
  ctx.closePath();
}

// Letters on a ball. inkOn leans dark near a tie, which leaves a saturated red ball with a dark
// O that reads as a ring; on a ball the lighter ink wins whenever it is legible.
function ballInk(c, bg) {
  const light = luma(c.label) > luma(c.bgDeep) ? c.label : c.bgDeep;
  return contrast(bg, light) >= 2.6 ? light : inkOn(c, bg);
}

/**
 * The one material: flat fill, one cushion crescent, one highlight, one rim. Everything round in
 * this file is this. o: { dim (0..1, toward the ground), focus (0..1), shade = 0.18, rimDark, profile }
 */
export function drawBall(ctx, c, x, y, r, col, o = {}) {
  if (!(r > 0.4)) return;
  if (o.focus) drawFocus(ctx, c, x, y, r, o.focus);
  const L = lookOf();
  const fill = faded(c, col, o.dim);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  if (r >= 2.5) {
    crescent(ctx, x, y, r, 0.34);
    ctx.fillStyle = darken(fill, o.shade ?? 0.18);
    ctx.fill();
  }
  if (r >= 9 && profileOf(o) === 'rich') {                  // bounce light inside the shaded edge
    ctx.save();
    ctx.strokeStyle = alpha(lighten(fill, 0.3), 0.4);
    ctx.lineWidth = Math.max(1.5, r * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r * 0.8, LIGHT - 0.6, LIGHT + 0.6); ctx.stroke();
    ctx.restore();
  }
  if (r >= 3.5 && L.gloss > 0) {
    ellipse(ctx, x - r * 0.36, y - r * 0.4, r * 0.28, r * 0.17, -LIGHT);
    ctx.fillStyle = alpha(lighten(fill, 0.55), Math.min(1, 0.95 * L.gloss));
    ctx.fill();
  }
  const w = rimWidth(r);
  ctx.beginPath(); ctx.arc(x, y, Math.max(0, r - w / 2), 0, TAU);
  ctx.strokeStyle = o.rimDark ? darken(fill, 0.3) : rimTone(c, fill);
  ctx.lineWidth = w;
  ctx.stroke();
}

/** A small bright bead. o: { dim, focus, profile }. Under 3 px it is a plain dot with a rim. */
export function drawElectron(ctx, c, x, y, r, o = {}) {
  drawBall(ctx, c, x, y, r, tones(c).electron, o);
}

/**
 * An empty place for an electron: a hollow ring. A seat is not a particle, so it has no shade.
 * o: { dim, focus }
 */
export function drawSeat(ctx, c, x, y, r, o = {}) {
  if (o.focus) drawFocus(ctx, c, x, y, r, o.focus);
  ctx.beginPath(); ctx.arc(x, y, Math.max(0, r - 1.25), 0, TAU);
  ctx.fillStyle = ground(c);
  ctx.fill();
  ctx.strokeStyle = faded(c, tones(c).electron, o.dim);
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

/**
 * A plus or minus of rounded bars, centred at (x, y), s across; text would fail at this size.
 * sign: +1 or -1, col: its ink.
 */
export function drawCharge(ctx, c, x, y, s, sign, col) {
  const t = Math.max(2, s * 0.26);
  ctx.fillStyle = col;
  rr(ctx, x - s / 2, y - t / 2, s, t, t / 2);
  ctx.fill();
  if (sign > 0) {
    rr(ctx, x - t / 2, y - s / 2, t, s, t / 2);
    ctx.fill();
  }
}

/** A chunky proton (warm, a plus mark from r 4.5) or neutron (neutral, plain). kind: 'proton' | 'neutron'. */
export function drawNucleon(ctx, c, x, y, r, kind = 'proton', o = {}) {
  const proton = kind === 'proton';
  const col = proton ? tones(c).proton : tones(c).neutron;
  drawBall(ctx, c, x, y, r, col, o);
  if (proton && r >= 4.5) drawCharge(ctx, c, x, y, r * 0.95, 1, inkOn(c, faded(c, col, o.dim)));
}

// Unit packings, kept per (p, n, seed): the same nucleus is the same picture on every frame.
const PACKS = new Map();

function unitPack(p, n, seed) {
  const key = `${p}|${n}|${seed}`;
  let pk = PACKS.get(key);
  if (pk) return pk;
  const N = p + n, rnd = mulberry32(seed + p * 131 + n * 17);
  const pts = [];
  let b = 1;
  if (N > 1 && N <= 7) {                                    // a ring, with a middle ball from six up
    const mid = N >= 6 ? 1 : 0, m = N - mid;
    const s = 1.15 * Math.sin(Math.PI / m);
    b = s / (1 + s);
    const a0 = rnd() * TAU;
    for (let i = 0; i < m; i++) {
      const a = a0 + (i * TAU) / m;
      pts.push({ x: Math.cos(a) * (1 - b), y: Math.sin(a) * (1 - b) });
    }
    if (mid) pts.push({ x: 0, y: 0 });
  } else if (N > 7) {                                       // a sunflower: even, round, never random-looking
    b = 1 / (0.65 + 0.95 * Math.sqrt(N));
    const a0 = rnd() * TAU, golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const rho = Math.sqrt((N - i - 0.5) / N) * (1 - b), a = a0 + i * golden;
      pts.push({ x: Math.cos(a) * rho, y: Math.sin(a) * rho });
    }
  } else pts.push({ x: 0, y: 0 });
  // Protons and neutrons mixed evenly: each ball takes the kind its placed neighbours have least of,
  // the seed breaking ties. Worked out once per nucleus, so the same picture every frame.
  const left = { proton: p, neutron: n };
  const near = (b * 3) ** 2;
  const pack = [];
  for (const q of pts) {
    let bias = 0;
    for (const m of pack) if ((m.x - q.x) ** 2 + (m.y - q.y) ** 2 < near) bias += m.kind === 'proton' ? 1 : -1;
    const lean = bias + (rnd() - 0.5) * 0.9 + (left.neutron - left.proton) * 0.25;
    const kind = !left.neutron ? 'proton' : !left.proton ? 'neutron' : lean > 0 ? 'neutron' : 'proton';
    left[kind] -= 1;
    pack.push({ ...q, kind, sh: Math.max(0, (q.x + q.y) * 0.1) });
  }
  pk = { b, pack };
  if (PACKS.size > 300) PACKS.clear();
  PACKS.set(key, pk);
  return pk;
}

/**
 * The packed nucleus as data, r the cluster's radius: { solid, r, b (ball radius), balls: [{ x, y,
 * kind }] } with balls in draw order, the centre last. solid: too many or too small to pack.
 * Stable: the same p, n and seed give the same layout. o: { solid, seed }
 */
export function nucleusLayout(p, n, r, o = {}) {
  const N = p + n;
  const { b, pack } = unitPack(p, n, o.seed ?? 1);
  const solid = !!o.solid || N > PACK_MAX || b * r < PACK_MIN_BALL;
  return { solid, r, b: b * r, balls: solid ? [] : pack.map((q) => ({ x: q.x * r, y: q.y * r, kind: q.kind })) };
}

/**
 * A nucleus: a packed cluster of nucleons, or one large ball above the size threshold or with
 * o.solid. A solid one carries o.label (default +p) when 14 px text fits inside it.
 * o: { p, n, r, solid, label, seed, dim, focus, profile }. Returns its radius.
 */
export function drawNucleus(ctx, c, x, y, o = {}) {
  const p = o.p ?? 1, n = o.n ?? 0, r = o.r ?? 30;
  const lay = nucleusLayout(p, n, r, o);
  if (lay.solid) {
    const col = tones(c).proton;
    drawBall(ctx, c, x, y, r, col, o);
    const label = o.label ?? `+${p}`;
    const size = Math.max(MIN_TEXT, Math.round(r * 0.78));
    ctx.save();
    ctx.font = font(c, 700, size, true);
    const fits = label && ctx.measureText(label).width <= r * 1.7;
    ctx.restore();
    if (fits) write(ctx, c, label, x, y, size, ballInk(c, faded(c, col, o.dim)));
    return r;
  }
  if (o.focus) drawFocus(ctx, c, x, y, r, o.focus);
  const { pack } = unitPack(p, n, o.seed ?? 1);
  // One ball's rim is the shadow on the next: a dark rim packs tighter than a lit one.
  const b = lay.b;
  for (const q of pack) {
    drawNucleon(ctx, c, x + q.x * r, y + q.y * r, b, q.kind, { dim: o.dim, rimDark: true, shade: 0.18 + q.sh, profile: o.profile });
  }
  return r;
}

/**
 * A shell: a soft ring with a fill band. o: { active, dim, band (px, 0 for none), line, fill (share: a flat disc inside it, for mass) }.
 * active lifts the band to the electron tone and adds the focus light.
 */
export function drawShell(ctx, c, x, y, radius, o = {}) {
  if (radius <= 0) return;
  const day = isDay(c);
  const band = o.band ?? radius * 0.14 + 4;
  const line = o.line ?? clamp(radius * 0.024, 2.5, 4.5);
  const e = tones(c).electron;
  const base = mix(mix(c.label, e, 0.22), ground(c), day ? 0.55 : 0.42);
  const tone = faded(c, o.active ? mix(base, e, 0.8) : base, o.dim);
  const soft = glows();
  const keep = 1 - (o.dim ?? 0) * 0.7;
  const arc = (r, w, col) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  };
  if (o.fill && soft) {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU);
    ctx.fillStyle = alpha(base, o.fill * keep);
    ctx.fill();
  }
  if (o.active && soft && band > 0) {
    if (day) arc(radius + band / 2 + 1, 2.5, alpha(c.gold, 0.85));
    else arc(radius, band * 1.7, alpha(c.glow ?? c.accent, 0.1));
  }
  if (band > 0 && soft) arc(radius, band, alpha(o.active ? e : base, (o.active ? 0.2 : 0.15) * keep));
  if (soft) arc(radius, line + 2, alpha(darken(tone, 0.3), 0.35));
  arc(radius, line, tone);
}

/**
 * Where count electrons sit on a shell, as offsets from the centre: [{ x, y, a }], the first at the
 * top. One to four spread evenly; five to eight take the four sides and then pair up, as an octet is
 * drawn; above eight they spread evenly. phase turns them all.
 * o: { even (no pairing), er (electron radius, sets the pair gap), capacity (also return the empty
 * places, marked empty: true, filling side by side so a lone electron sits beside its seat) }
 */
export function shellPoints(radius, count, phase = 0, o = {}) {
  const a0 = -Math.PI / 2 + phase;
  const gap = (Math.max(3, o.er ?? radius * 0.05) * 2.7) / Math.max(1, radius);
  const at = (a, empty) => ({ x: Math.cos(a) * radius, y: Math.sin(a) * radius, a, ...(empty ? { empty } : null) });
  const cap = o.capacity;
  if (cap === 8 && !o.even) {
    const out = [];
    for (let i = 0; i < 8; i++) {
      const side = i % 4, second = i >= 4;
      out.push(at(a0 + (side * Math.PI) / 2 + (second ? gap / 2 : -gap / 2), i >= count));
    }
    return out;
  }
  const total = cap ?? count;
  if (o.even || total <= 4 || total > 8) {
    const out = [];
    for (let i = 0; i < total; i++) out.push(at(a0 + (i * TAU) / Math.max(1, total), i >= count));
    return out;
  }
  const out = [];
  const pairs = total - 4;
  for (let s = 0; s < 4; s++) {
    const a = a0 + (s * Math.PI) / 2;
    if (s < pairs) out.push(at(a - gap / 2), at(a + gap / 2));
    else out.push(at(a));
  }
  return out;
}

const outerIndex = (o) => (o.focusShell === 'outer' || (o.dimInner && o.focusShell == null)
  ? (o.shells?.length ?? 1) - 1 : o.focusShell ?? -1);

/**
 * The atom as data, no drawing, offsets from its centre: { radius, small, nr, er, focus,
 * shells: [{ r, pts: [{ x, y, a, empty? }] }] }. Takes drawAtom's options.
 */
export function atomLayout(o = {}) {
  const radius = o.radius ?? 150;
  const small = radius < SMALL_ATOM;
  const list = o.shells ?? [];
  const nr = o.nucleusR ?? radius * 0.3;
  const er = o.er ?? Math.max(3.2, radius * 0.058);
  const k = list.length;
  const r1 = radius - er;
  const r0 = Math.min(r1, nr + er * 2.3);
  const shells = list.map((count, i) => {
    const r = k > 1 ? r0 + ((r1 - r0) * i) / (k - 1) : r1;
    const phase = (o.phase ?? 0) / (i + 1) + i * 0.42;      // inner shells turn faster, and do not line up
    const capacity = o.seats?.[i];
    return { r, pts: shellPoints(r, count, phase, { er, even: small, capacity }) };
  });
  return { radius, small, nr, er, focus: outerIndex(o), shells };
}

/**
 * The Bohr atom, radius px to the outer electrons.
 * o: { sym, z, p, n, shells: [2, 8, 1], radius, phase, focusShell (index or 'outer'), dimInner,
 *      seats (capacity per shell: shows empty places), label (a chip under the atom), solid,
 *      nucleusR, er, seed, dim, profile }
 * p defaults to z, then to the electron count; n to p. Under SMALL_ATOM the nucleus is one ball
 * carrying sym, the rings lose their band and the electrons spread evenly.
 * Returns atomLayout's record with x, y and every point in stage px.
 */
export function drawAtom(ctx, c, x, y, o = {}) {
  const lay = atomLayout(o);
  const { small, nr, er, focus } = lay;
  const p = o.p ?? o.z ?? (o.shells ?? []).reduce((a, b) => a + b, 0), n = o.n ?? p;
  const inner = (i) => (o.dimInner && focus >= 0 && i < focus ? 0.45 : 0) || o.dim || 0;
  const nDim = o.dimInner ? 0.35 : o.dim;
  const hero = focus >= 0 && !small;
  for (let i = lay.shells.length - 1; i >= 0; i--) {
    drawShell(ctx, c, x, y, lay.shells[i].r, { active: i === focus, dim: inner(i), band: small ? 0 : undefined, line: small ? 2 : undefined, fill: small ? 0 : 0.08 });
  }
  drawNucleus(ctx, c, x, y, { p, n, r: nr, solid: o.solid ?? small, label: o.sym ?? null, seed: o.seed, dim: nDim, profile: o.profile });
  lay.shells.forEach((s, i) => {
    for (const q of s.pts) {
      q.x += x; q.y += y;
      if (q.empty) drawSeat(ctx, c, q.x, q.y, er, { dim: inner(i), focus: i === focus && glows() ? 0.7 : 0 });
      else drawElectron(ctx, c, q.x, q.y, er, { dim: inner(i), focus: i === focus && hero ? 0.8 : 0, profile: o.profile });
    }
  });
  if (o.label) pill(ctx, c, o.label, x, y + lay.radius + 24, { bg: c.raised, ink: c.label, size: 15 });
  lay.x = x; lay.y = y;
  return lay;
}

/**
 * An ion: a chunky ball, warm for a cation and cool for an anion, with its charge. From ION_TEXT_R up
 * it carries sym and a charge badge; under it a bold sign in the middle, which is what reads in a
 * big lattice. o: { sym, charge, r, dim, focus, profile }
 */
export function drawIon(ctx, c, x, y, o = {}) {
  const r = o.r ?? 24, q = o.charge ?? 0;
  const col = q > 0 ? tones(c).cation : q < 0 ? tones(c).anion : tones(c).neutron;
  const ink = ballInk(c, faded(c, col, o.dim));
  drawBall(ctx, c, x, y, r, col, o);
  const mag = Math.abs(q);
  if (r < ION_TEXT_R || !o.sym) {
    if (!q) return;
    if (mag > 1 && r >= 11) {
      write(ctx, c, String(mag), x - 5, y, MIN_TEXT, ink);
      drawCharge(ctx, c, x + 6, y, 9, Math.sign(q), ink);
    } else drawCharge(ctx, c, x, y, r * 1.05, Math.sign(q), ink);
    return;
  }
  const size = Math.max(MIN_TEXT, Math.round(r * 0.74));
  write(ctx, c, o.sym, x, y, size, ink);
  if (!q) return;
  // The badge: flat and rimmed, sized to the ion, up and right where it never covers the symbol.
  const br = Math.max(8.5, r * 0.34), bx = x + r * 0.74, by = y - r * 0.74;
  const two = mag > 1 && br >= 11;
  const w = two ? br * 2 + br * 1.1 : br * 2;
  const bg = faded(c, c.bgSurface, o.dim), mark = faded(c, isDay(c) ? darken(col, 0.1) : col, o.dim);
  rr(ctx, bx - w / 2, by - br, w, br * 2, br);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = mark;
  ctx.lineWidth = Math.max(1.5, 2.5 * lookOf().rim);
  ctx.stroke();
  if (two) {
    write(ctx, c, String(mag), bx - br * 0.42, by, Math.max(MIN_TEXT, Math.round(br * 1.25)), mark);
    drawCharge(ctx, c, bx + br * 0.62, by, br * 0.95, Math.sign(q), mark);
  } else drawCharge(ctx, c, bx, by, br * 1.15, Math.sign(q), mark);
}

/** Run fn in the bond's own frame: x along it from 0 to its length, y across it, centre 0. */
function bondFrame(ctx, x0, y0, x1, y1, fn) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) return;
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
  fn(len);
  ctx.restore();
}

/**
 * A stick between two atoms, (x0, y0) to (x1, y1): chunky, rounded, lit along its top. Order 2 or 3
 * draws that many sticks side by side. o: { order = 1, w, dim }
 */
export function drawBond(ctx, c, x0, y0, x1, y1, o = {}) {
  const order = clamp(o.order ?? 1, 1, 3), w = o.w ?? 9;
  const sw = order === 1 ? w : w * 0.7, step = sw * 1.5;
  const body = faded(c, mix(c.label, ground(c), 0.42), o.dim);
  const L = lookOf();
  bondFrame(ctx, x0, y0, x1, y1, (len) => {
    for (let i = 0; i < order; i++) {
      const yy = (i - (order - 1) / 2) * step - sw / 2;
      rr(ctx, 0, yy, len, sw, sw / 2);
      ctx.fillStyle = body;
      ctx.fill();
      ctx.strokeStyle = rimTone(c, body);
      ctx.lineWidth = Math.max(1.25, 2 * L.rim);
      ctx.stroke();
      if (L.gloss > 0 && sw >= 6) {
        rr(ctx, 3, yy + sw * 0.2, len - 6, Math.max(1.5, sw * 0.18), 1);
        ctx.fillStyle = alpha(lighten(body, 0.55), 0.6 * L.gloss);
        ctx.fill();
      }
    }
  });
}

/**
 * A covalent bond shown as what it is: the shared electrons sit BETWEEN the two nuclei and attract
 * both, at once. (x0, y0) and (x1, y1) are the nuclei. The electrons lie across the bond at its
 * middle in a soft shared cloud; order 2 draws a second pair beside the first.
 * o: { order = 1, r (electron radius), at = 0.5, pull (0..1: a chevron toward each nucleus), dim, focus, profile }
 * Returns the pair's centre { x, y }.
 */
export function drawSharedPair(ctx, c, x0, y0, x1, y1, o = {}) {
  const order = clamp(o.order ?? 1, 1, 3), r = o.r ?? 7, at = clamp(o.at ?? 0.5, 0.1, 0.9);
  const e = tones(c).electron;
  const mx = x0 + (x1 - x0) * at, my = y0 + (y1 - y0) * at;
  bondFrame(ctx, x0, y0, x1, y1, (len) => {
    const cx = len * at;
    if (glows()) {
      ellipse(ctx, cx, 0, Math.min(len * 0.36, r * (3.2 + order * 1.1)), r * 2.5, 0);
      ctx.fillStyle = alpha(e, (isDay(c) ? 0.16 : 0.2) * (1 - (o.dim ?? 0)));
      ctx.fill();
    }
    if (o.pull > 0) {
      const col = alpha(faded(c, e, o.dim), o.pull);
      const h = r * 1.15, d = r * (2.4 + order * 1.2);
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(2.5, r * 0.5);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const s of [-1, 1]) {
        const tip = cx + s * (d + h);
        ctx.beginPath();
        ctx.moveTo(tip - s * h, -h);
        ctx.lineTo(tip, 0);
        ctx.lineTo(tip - s * h, h);
        ctx.stroke();
      }
    }
  });
  // In stage px, so each bead keeps its light from the top left whatever the bond's angle.
  const len = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  for (let i = 0; i < order; i++) {
    const d = (i - (order - 1) / 2) * r * 2.5;
    for (const s of [-1, 1]) {
      drawElectron(ctx, c, mx + ux * d - uy * s * r * 1.08, my + uy * d + ux * s * r * 1.08, r, { dim: o.dim, focus: o.focus, profile: o.profile });
    }
  }
  return { x: mx, y: my };
}

// Ball-and-stick molecules, in units where a carbon has radius 0.85. Bonds are [i, j, order].
const SUGAR = (() => {
  const atoms = [], bonds = [];
  const ring = 6;
  for (let i = 0; i < ring; i++) {
    const a = -Math.PI / 2 + (i * TAU) / ring;
    atoms.push({ sym: i === 1 ? 'O' : 'C', x: Math.cos(a) * 2.5, y: Math.sin(a) * 2.5 });
  }
  for (let i = 0; i < ring; i++) bonds.push([i, (i + 1) % ring, 1]);
  for (let i = 0; i < ring; i++) {                          // an OH on each carbon, one CH2OH: schematic
    if (i === 1) continue;
    const a = -Math.PI / 2 + (i * TAU) / ring;
    const out = (d, t = 0) => ({ x: Math.cos(a + t) * d, y: Math.sin(a + t) * d });
    if (i === 0) {
      const ci = atoms.push({ sym: 'C', ...out(4.5) }) - 1;
      const oi = atoms.push({ sym: 'O', ...out(6.3, -0.28) }) - 1;
      const hi = atoms.push({ sym: 'H', ...out(7.6, -0.08) }) - 1;
      bonds.push([i, ci, 1], [ci, oi, 1], [oi, hi, 1]);
    } else {
      const oi = atoms.push({ sym: 'O', ...out(4.45) }) - 1;
      const hi = atoms.push({ sym: 'H', ...out(5.7, 0.2) }) - 1;
      bonds.push([i, oi, 1], [oi, hi, 1]);
    }
  }
  return { atoms, bonds };
})();

/** Spread into drawMolecule: { ...MOLECULES.H2O, r: 90 }. */
export const MOLECULES = {
  H2:  { atoms: [{ sym: 'H', x: -1.05, y: 0 }, { sym: 'H', x: 1.05, y: 0 }], bonds: [[0, 1, 1]] },
  Cl2: { atoms: [{ sym: 'Cl', x: -1.5, y: 0 }, { sym: 'Cl', x: 1.5, y: 0 }], bonds: [[0, 1, 1]] },
  O2:  { atoms: [{ sym: 'O', x: -1.3, y: 0 }, { sym: 'O', x: 1.3, y: 0 }], bonds: [[0, 1, 2]] },
  N2:  { atoms: [{ sym: 'N', x: -1.3, y: 0 }, { sym: 'N', x: 1.3, y: 0 }], bonds: [[0, 1, 3]] },
  HCl: { atoms: [{ sym: 'H', x: -1.55, y: 0 }, { sym: 'Cl', x: 1.05, y: 0 }], bonds: [[0, 1, 1]] },
  H2O: { atoms: [{ sym: 'O', x: 0, y: -0.55 }, { sym: 'H', x: -1.55, y: 0.65 }, { sym: 'H', x: 1.55, y: 0.65 }], bonds: [[0, 1, 1], [0, 2, 1]] },
  CO2: { atoms: [{ sym: 'C', x: 0, y: 0 }, { sym: 'O', x: -2.5, y: 0 }, { sym: 'O', x: 2.5, y: 0 }], bonds: [[0, 1, 2], [0, 2, 2]] },
  sugar: SUGAR,
};

const ATOM_R = { H: 0.62, C: 0.85, N: 0.82, O: 0.8, Na: 1.05, Mg: 1, S: 1, Cl: 1 };

/** The ball colour of an element in a molecule: one colour per element, everywhere. */
export function atomTone(c, sym) {
  switch (sym) {
    case 'H': return mix(c.label, c.bgSurface, isDay(c) ? 0.88 : 0.08);
    case 'C': return mix(c.label, c.bgSurface, isDay(c) ? 0.12 : 0.62);
    case 'O': return mix(c.s6, c.s8, 0.2);
    case 'N': return c.s1;
    case 'Cl': return mix(c.s3, c.s7, 0.3);
    case 'Na': return mix(c.s5, c.s4, 0.2);
    case 'S': return mix(c.s2, c.s3, 0.2);
    case 'Mg': return mix(c.s8, c.s2, 0.35);
    default: return tones(c).neutron;
  }
}

/**
 * Ball and stick. atoms: [{ sym, x, y, r? }] in any units, bonds: [[i, j, order]]; MOLECULES has the
 * common ones. The whole thing fits a circle of radius r at (x, y). A ball big enough for 14 px text
 * carries its symbol. o: { atoms, bonds, r, rot, labels = true, shared (draw the bond's electron
 * pairs), dim, focus (an atom index, or true for all), profile }
 * Returns { s, atoms: [{ x, y, r, sym }] } in stage px.
 */
export function drawMolecule(ctx, c, x, y, o = {}) {
  const atoms = o.atoms ?? [], bonds = o.bonds ?? [];
  const rot = o.rot ?? 0, ca = Math.cos(rot), sa = Math.sin(rot);
  const R = (a) => a.r ?? ATOM_R[a.sym] ?? 0.9;
  let ext = 0.01;
  for (const a of atoms) ext = Math.max(ext, Math.hypot(a.x, a.y) + R(a));
  const s = (o.r ?? 80) / ext;
  const pts = atoms.map((a) => ({ x: x + (a.x * ca - a.y * sa) * s, y: y + (a.x * sa + a.y * ca) * s, r: R(a) * s, sym: a.sym }));
  const w = clamp(s * 0.34, 4, 14);
  for (const [i, j, order] of bonds) {
    const A = pts[i], B = pts[j];
    drawBond(ctx, c, A.x, A.y, B.x, B.y, { order, w, dim: o.dim });
    if (o.shared) drawSharedPair(ctx, c, A.x, A.y, B.x, B.y, { order, r: clamp(s * 0.17, 3.2, 7), dim: o.dim, profile: o.profile });
  }
  pts.forEach((p, i) => {
    const col = atomTone(c, p.sym);
    const on = o.focus === true || o.focus === i;
    drawBall(ctx, c, p.x, p.y, p.r, col, { dim: o.dim, focus: on ? 1 : 0, profile: o.profile });
    if (o.labels === false || p.r < 11) return;
    const size = Math.max(MIN_TEXT, Math.round(p.r * 0.8));
    ctx.save();
    ctx.font = font(c, 700, size, true);
    const fits = ctx.measureText(p.sym).width <= p.r * 1.8;
    ctx.restore();
    if (fits) write(ctx, c, p.sym, p.x, p.y, size, ballInk(c, faded(c, col, o.dim)));
  });
  return { s, atoms: pts };
}

/**
 * The quiet world of a microscopic subject (card rule 1): the scene's paper, a soft pool of light
 * behind the hero, the frame falling off into shade, and a few out-of-focus particles far away.
 * It replaces the backdrop and the floor. Maths paper and a flat look stay as they are.
 * o: { x, y (the hero, default the frame's centre), seed, n = 12, t (rich: slow drift), profile }
 */
export function drawDepthField(ctx, c, o = {}) {
  if (lookOf().backdrop === 'flat' || paperKind(o) === 'graph') { drawBackdrop(ctx, c, 'plain', { setting: 'none', paper: o.paper, profile: o.profile }); return; }
  const { w: FW, h: FH } = frameOf(ctx);
  const day = isDay(c), rich = profileOf(o) === 'rich', deep = c.bgDeep;
  const px = o.x ?? FW / 2, py = o.y ?? FH * 0.48, seed = o.seed ?? 7, n = o.n ?? 12;
  blitLayer(ctx, `atomfield|${px}|${py}|${deep}|${c.bgSurface}|${c.glass}`, 0, 0, FW, FH, (g) => {
    const R = Math.hypot(FW, FH) * 0.66;
    const pool = day ? lighten(deep, 0.8) : mix(mix(deep, c.bgSurface, 0.8), c.glass, 0.12);
    const edge = day ? mix(deep, c.stroke, 0.16) : darken(deep, 0.35);
    const gr = g.createRadialGradient(px, py, 30, px, py, R);
    gr.addColorStop(0, pool);
    gr.addColorStop(0.4, mix(pool, deep, 0.55));
    gr.addColorStop(0.72, deep);
    gr.addColorStop(1, edge);
    g.fillStyle = gr;
    g.fillRect(0, 0, FW, FH);
  });
  const tt = rich && o.t != null && !reducedMotion() ? o.t : 0;
  const dx = Math.sin(tt * 0.11) * 7, dy = Math.cos(tt * 0.09) * 5;
  blitLayer(ctx, `atomspecks|${seed}|${n}|${deep}|${c.glass}|${c.label}`, dx, dy, FW, FH, (g) => {
    const rnd = mulberry32(seed);
    const tone = day ? mix(deep, c.stroke, 0.3) : mix(deep, c.glass, 0.2);
    for (let i = 0; i < n; i++) {                           // far particles, out of focus
      const a = rnd() * TAU, u = 0.55 + rnd() * 0.45;
      const x = px + Math.cos(a) * u * FW * 0.52, y = py + Math.sin(a) * u * FH * 0.46;
      const r = 14 + rnd() * rnd() * 40;
      const gr = g.createRadialGradient(x, y, r * 0.5, x, y, r);
      gr.addColorStop(0, alpha(tone, day ? 0.13 : 0.3));
      gr.addColorStop(1, alpha(tone, 0));
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    if (day) return;
    g.fillStyle = alpha(c.label, 0.28);                     // night: a few dim specks
    for (let i = 0; i < 26; i++) {
      g.beginPath(); g.arc(rnd() * FW, rnd() * FH, 0.8 + rnd() * 0.9, 0, TAU); g.fill();
    }
  });
}
