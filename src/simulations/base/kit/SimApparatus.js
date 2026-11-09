/**
 * SimApparatus - more physics props for canvas scenes, a sibling of SimProps.js
 * (SimProps stays as it is; this file is new so no SimProps importer moves a pixel).
 * Each part draws a real silhouette with a light side, a shade side, an inner
 * line and a darker rim (Quill card rule 3), never a face, and returns its anchors.
 * All sizes are design px on the 680x520 stage. Labels are Fredoka at o.size
 * (default 21: the minimum that stays 12 px on screen when a 680 scene shows on a
 * 390 phone). tone: 'accent' | 'good' | ... | 1..8 (series), resolved against c.
 *
 *   drawSpring(ctx, c, o) -> { a, b, len, state, free, axis }
 *     o: { x1, y1, x2, y2 (the two ends) | x, y, len, angle = 0 (from one end),
 *          rest = len (the rest length: shorter is 'squashed', longer 'stretched', 4 px slack),
 *          coils = 11 (fixed: a squashed spring packs its coils, it never loses one),
 *          r = 13 (coil radius), wire = 3.5, plates = true, tone ('stroke' metal by default),
 *          wall: false | true (an L mount at end 1: wall slab + floor strip, book Fig 7.14),
 *          floorLen = 0 (wall: floor strip length past the spring, default the spring + 80),
 *          pushBack: false | true (small arrows at the free end: the way the spring pushes
 *          what is there; squashed pushes out, stretched pulls in; pushDir 'in'|'out' forces it) }
 *     e.g. drawSpring(ctx, c, { x: 60, y: 300, len: 110, rest: 160, wall: true, pushBack: true })
 *   drawPendulum(ctx, c, o) -> { pivot, bob: {x,y,r}, at(angle) -> {x,y} }
 *     o: { x, y (pivot), len = 200, angle = 0 (radians from straight down, + swings right),
 *          bobR = 17, tone = 6, support = true (a beam and clamp above the pivot),
 *          arc = 0 (amplitude: dashed arc from -arc to +arc), level = false (dashed level
 *          line through both arc ends), points: [{ angle, label }] (hollow marks + labels,
 *          caller's letters e.g. P Q R), size = 21 }
 *     e.g. drawPendulum(ctx, c, { x: 200, y: 60, len: 180, angle: 0.5, arc: 0.5, level: true,
 *            points: [{ angle: 0.5, label: 'P' }, { angle: 0, label: 'Q' }, { angle: -0.5, label: 'R' }] })
 *   drawLeverPlank(ctx, c, o) -> { effort, load, angle, at(d) -> {x,y} on the plank top, fulcrum }
 *     o: { x, y (fulcrum tip), angle = 0 (+ tips the right end down), left = 200, right = 200
 *          (arm lengths), thick = 16, tone = 'gold' (wood), groundY = y + 64 (fulcrum base),
 *          fulcrum = true, seats: [{ at (signed px from the fulcrum), label }] (bucket seats,
 *          book Fig 7.34), pans: [{ at, n (coins), drop = 70, label }] (beam balance pans hang
 *          plumb whatever the tilt), size = 21 }. Geometry from SimRig.lever().
 *     e.g. drawLeverPlank(ctx, c, { x: 340, y: 400, angle: 0.12, seats: [{ at: -180, label: 'A' }, { at: 90, label: 'D' }] })
 *   drawSack(ctx, c, o) -> { box, grip, grips: [near, far] }
 *     o: { x, y (bottom centre; ground contact), w = 74, h = 86, kind = 'sack' | 'bag',
 *          tone (sack: 'gold' jute, bag: 2), held = false (no contact shadow) }
 *     grip: the tied neck (sack) or the top handle (bag); grips: two hand points for a
 *     two-hand carry. Feed them to a SimFigure spec as hands.
 *   drawStairs(ctx, c, o) -> { top: {x,y}, steps: [{x0,x1,y}], ground(x) -> y, box }
 *     o: { x, y (foot of the first riser, ground), n = 6, rise = 26, run = 40, dir = 1 (up to the
 *          right, -1 up to the left), depth = 0 (block below: the solid under the flight goes
 *          to y), rail = false, bracket: null | { label, side: 'far' | 'near' } (height
 *          bracket from the ground to the top tread), tone = 'stroke' (stone), size = 21 }
 *     ground(x) is SimFigure's spec.ground: a foot at x lands on the tread under it.
 *   drawMagnet(ctx, c, o) -> { box, n: {x,y}, s: {x,y} }
 *     o: { x, y (centre), w = 128, h = 42, angle = 0, flip = false (N on the left by default),
 *          tones = [6, 1] (N, S), labels = ['N', 'S'] (null hides), size = 21 }
 *   drawBall(ctx, c, o) -> { x, y, r }   a plain ball or stone (o: { x, y, r = 18, tone = 6, shadowY })
 *   drawCharge(ctx, c, o) -> { x, y, r }
 *     o: { x, y, r = 22, sign = '+' | '-', tone (default 6 for +, 1 for -) }
 *     The sign is drawn as bars, not text, so it stays crisp at any size (r >= 14).
 *   displacementArrow(ctx, c, x1, y1, x2, y2, o) -> { x2, y2, len, box } | null (len < 6)
 *     The dashed displacement arrow: same weight and head as SimLook vectorArrow (width 4,
 *     head 12), dashed shaft, solid head, in a second tone so it never reads as a force.
 *     o: { tone = 2 | col, width = 4, head = 12, dash = [9, 7], label ('s', '1 m'),
 *          side = 1 (label right of the travel direction; -1 left), at = 0.5 (along the
 *          shaft), size = 21, frame = stage (label kept inside), alpha }
 *     e.g. displacementArrow(ctx, c, 262, 436, 262, 350, { label: '1 m' })
 *   drawCrate(ctx, c, o) -> { box, top, left, right, bottom }   (grip points, no face)
 *     o: { x, y (bottom centre; ground contact), w = 80, h = 64, kind = 'crate' | 'carton',
 *          tone (default warm wood; carton toned down to cardboard), held = false, alpha }
 *     crate: edge planks, plank lines, a diagonal brace, nails. carton: lid seam, tape.
 *     e.g. drawCrate(ctx, c, { x: 183, y: 492, w: 86, h: 78, kind: 'carton' })
 *   drawGulel(ctx, c, o) -> { pouch, rest, stone, grip, tips: [near, far], crotch, stretch }
 *     A Y-fork slingshot: handle with a leather wrap, two prongs (far one in shade), a band
 *     of two strands to a leather pouch. o: { x, y (handle bottom), h = 120, spread = 48,
 *          pull: null (pouch at rest) | {x, y} (pouch drawn back to there; the band thins
 *          and straightens as it stretches), stone = false, stoneR = 10, stoneTone,
 *          tone (wood), bandTone = 6, shadowY, alpha }. grip is where the holding hand goes.
 *     e.g. drawGulel(ctx, c, { x: 372, y: 488, pull: { x: 330, y: 452 }, stone: true })
 *   drawStairs o.shadow = true: false drops the contact shadow (a flight stacked on another
 *     part, e.g. stairs on a crate or a landing).
 *
 * SimFigure fit (hands and feet): figureFor/drawFigure take world hand grips
 * (spec.hands) and a ground(x) for feet. drawSack's grip/grips go straight into
 * spec.hands with pose 'carry' (in front, both hands) or 'stand' (one hand at the
 * side: use grip with the near hand, and draw the bag with held: true in `between`).
 * drawStairs' ground(x) goes into spec.ground with pose 'climb' or 'stand'.
 * There is no shoulder-carry pose (a sack on the back): hold it in front instead.
 * Sound apparatus (added 2026-11-03; full option lists at each function, label size 26):
 *   drawTuningFork -> { tips, stem, grip, box, pad }    drawBellJar -> { interior, bell, outlet, pump, wires }
 *   drawPistonTube -> { interior, face, tube, handle }  drawSpeaker -> { cone, wireIn, box }
 *   drawMicrophone -> { diaphragm, normal, grille, wireOut, grip }
 *   drawSignalWire -> { at(u), mid, strip }             drawStopwatch -> { center, tip, readout, box }
 *   They draw no sound arcs or air dots: SimWave adds those at the returned anchors.
 * ASCII only. Colours: resolved c.* tokens only.
 */
import { rr, ellipse, darken, lighten, alpha, font, mix, drawShadow, inkOn, pill, chipSize } from './SimLook.js';
import { lever } from './SimRig.js';

const TAU = Math.PI * 2;
const toneOf = (c, t = 'accent') => (typeof t === 'number' ? c['s' + (((Math.max(1, t | 0) - 1) % 8) + 1)] : (c[t] ?? t));
const metalOf = (c) => mix(c.labelMuted, c.bgSurface, 0.25);

// The recipe on any closed path: lip, body, shade side (lower right), light side
// (upper left), inner line, rim. box = { x, y, w, h } of the path.
function solid(ctx, path, b, col, o = {}) {
  if (o.lip !== false) { ctx.save(); ctx.translate(0, o.lip ?? 4); path(); ctx.fillStyle = darken(col, 0.42); ctx.fill(); ctx.restore(); }
  path(); ctx.fillStyle = col; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.fillStyle = darken(col, 0.2);
  if (o.shade === 'right') ctx.fillRect(b.x + b.w * 0.66, b.y - 2, b.w, b.h + 4);
  else ctx.fillRect(b.x - 2, b.y + b.h * 0.62, b.w + 4, b.h);
  ctx.fillStyle = alpha(lighten(col, 0.4), 0.85);
  if (o.shade === 'right') ctx.fillRect(b.x, b.y, b.w * 0.14, b.h);
  else ctx.fillRect(b.x, b.y, b.w, Math.min(5, b.h * 0.2));
  if (o.inner !== false) {
    ctx.strokeStyle = alpha(darken(col, 0.3), 0.7); ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    if (o.shade === 'right') { ctx.moveTo(b.x + b.w * 0.55, b.y + 6); ctx.lineTo(b.x + b.w * 0.55, b.y + b.h - 6); }
    else { ctx.moveTo(b.x + 6, b.y + b.h * 0.45); ctx.lineTo(b.x + b.w - 6, b.y + b.h * 0.45); }
    ctx.stroke();
  }
  ctx.restore();
  path(); ctx.strokeStyle = o.rim ?? darken(col, 0.34); ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
}

// A ball with a shade crescent, a highlight bean and a rim.
function ball(ctx, c, x, y, r, col) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = col; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 1.15, 0, TAU); ctx.rect(x + 2 * r, y - 2 * r, -4 * r, 4 * r);
  ctx.fillStyle = darken(col, 0.24); ctx.fill('evenodd');
  ctx.fillStyle = alpha(lighten(col, 0.55), 0.9); ellipse(ctx, x - r * 0.38, y - r * 0.42, r * 0.3, r * 0.18, -0.6); ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = darken(col, 0.34); ctx.lineWidth = 2.5; ctx.stroke();
}

function label(ctx, c, text, x, y, size, o = {}) {
  if (text == null || text === '') return;
  ctx.save();
  ctx.font = font(c, 700, size, true);
  ctx.textAlign = o.align ?? 'center'; ctx.textBaseline = 'middle';
  if (o.halo !== false) { ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = c.bgSurface; ctx.strokeText(String(text), x, y); }
  ctx.fillStyle = o.col ?? c.label; ctx.fillText(String(text), x, y);
  ctx.restore();
}

function arrowHead(ctx, x, y, ang, len, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(0, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-7, -5.5); ctx.lineTo(0, 0); ctx.lineTo(-7, 5.5); ctx.stroke();
  ctx.restore();
}

// -- Spring ---------------------------------------------------------------------

export function drawSpring(ctx, c, o = {}) {
  let x1 = o.x1 ?? o.x ?? 60, y1 = o.y1 ?? o.y ?? 300, x2, y2;
  if (o.x2 != null) { x2 = o.x2; y2 = o.y2 ?? y1; } else { const L = o.len ?? 140, a = o.angle ?? 0; x2 = x1 + Math.cos(a) * L; y2 = y1 + Math.sin(a) * L; }
  const dx = x2 - x1, dy = y2 - y1, len = Math.max(1, Math.hypot(dx, dy)), ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const rest = o.rest ?? len, state = len < rest - 4 ? 'squashed' : len > rest + 4 ? 'stretched' : 'rest';
  const coils = o.coils ?? 11, r = o.r ?? 13, wire = o.wire ?? 3.5, col = o.tone ? toneOf(c, o.tone) : metalOf(c);
  const plate = o.plates === false ? 0 : 7;
  ctx.save();
  if (o.wall) {                                                                   // L mount: wall slab at end 1 and a floor strip
    const wallH = r * 2 + 46, floorLen = o.floorLen || len + 80, wood = mix(toneOf(c, 'gold'), c.bgSurface, 0.35);
    const wx = x1 - 16, floorY = y1 + r + 4;
    solid(ctx, () => rr(ctx, wx - 4, floorY - wallH, 20, wallH + 14, 4), { x: wx - 4, y: floorY - wallH, w: 20, h: wallH + 14 }, wood, { shade: 'right', lip: false });
    solid(ctx, () => rr(ctx, wx - 4, floorY, floorLen + 20, 12, 4), { x: wx - 4, y: floorY, w: floorLen + 20, h: 12 }, wood, { lip: false });
  }
  // Coil points: a helix seen side-on. cos(phase) > 0 is the near half.
  const lead = plate + 3, body = len - lead * 2, N = coils * 18;
  const P = (i) => { const s = i / N, ph = s * coils * TAU; return { x: x1 + ux * (lead + s * body) + nx * r * Math.sin(ph), y: y1 + uy * (lead + s * body) + ny * r * Math.sin(ph), z: Math.cos(ph) }; };
  const pts = []; for (let i = 0; i <= N; i++) pts.push(P(i));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pass = (near, w, sc) => {
    ctx.strokeStyle = sc; ctx.lineWidth = w; ctx.beginPath();
    for (let i = 0; i < N; i++) { const p = pts[i], q = pts[i + 1]; if ((p.z + q.z > 0) === near) { ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); } }
    ctx.stroke();
  };
  pass(false, wire + 2, darken(col, 0.5)); pass(false, wire, darken(col, 0.28));     // far half: in shade
  pass(true, wire + 2.5, darken(col, 0.4)); pass(true, wire, col);                   // near half: rim then body
  pass(true, 1.4, alpha(lighten(col, 0.6), 0.9));                                     // light side: a thin lit line
  // Lead wires from the coil ends to the plates.
  ctx.strokeStyle = darken(col, 0.2); ctx.lineWidth = wire;
  ctx.beginPath(); ctx.moveTo(x1 + ux * plate, y1 + uy * plate); ctx.lineTo(pts[0].x, pts[0].y); ctx.moveTo(pts[N].x, pts[N].y); ctx.lineTo(x2 - ux * plate, y2 - uy * plate); ctx.stroke();
  if (plate) {
    for (const [px, py] of [[x1 + ux * plate / 2, y1 + uy * plate / 2], [x2 - ux * plate / 2, y2 - uy * plate / 2]]) {
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(uy, ux));
      solid(ctx, () => rr(ctx, -plate / 2, -r - 6, plate, r * 2 + 12, 3), { x: -plate / 2, y: -r - 6, w: plate, h: r * 2 + 12 }, darken(col, 0.08), { shade: 'right', lip: false, inner: false });
      ctx.restore();
    }
  }
  const free = { x: x2, y: y2 };
  if (o.pushBack && state !== 'rest' || o.pushDir) {
    const out = o.pushDir ? o.pushDir === 'out' : state === 'squashed', s = out ? 1 : -1, ac = c.label;
    for (const k of [-1, 1]) {
      const bx = x2 + ux * (out ? 10 : 34) + nx * k * (r + 26), by = y2 + uy * (out ? 10 : 34) + ny * k * (r + 26);
      arrowHead(ctx, bx + ux * s * 22, by + uy * s * 22, Math.atan2(uy * s, ux * s), 22, ac);
    }
  }
  ctx.restore();
  return { a: { x: x1, y: y1 }, b: free, len, state, free, axis: { x: ux, y: uy } };
}

// -- Pendulum -------------------------------------------------------------------

export function drawPendulum(ctx, c, o = {}) {
  const x = o.x ?? 200, y = o.y ?? 60, L = o.len ?? 200, bobR = o.bobR ?? 17, size = o.size ?? 21;
  const at = (a) => ({ x: x + Math.sin(a) * L, y: y + Math.cos(a) * L });
  const ang = o.angle ?? 0, bob = at(ang), col = toneOf(c, o.tone ?? 6);
  ctx.save();
  if (o.support !== false) {
    const wood = mix(toneOf(c, 'gold'), c.bgSurface, 0.35);
    solid(ctx, () => rr(ctx, x - 70, y - 22, 140, 16, 5), { x: x - 70, y: y - 22, w: 140, h: 16 }, wood, {});
    solid(ctx, () => rr(ctx, x - 9, y - 10, 18, 14, 3), { x: x - 9, y: y - 10, w: 18, h: 14 }, metalOf(c), { inner: false, lip: false });
  }
  const amp = o.arc ?? 0;
  ctx.setLineDash([6, 6]); ctx.lineCap = 'round'; ctx.lineWidth = 2.5; ctx.strokeStyle = alpha(c.labelMuted, 0.9);
  if (amp > 0) { ctx.beginPath(); ctx.arc(x, y, L, Math.PI / 2 - amp, Math.PI / 2 + amp); ctx.stroke(); }
  if (o.level && amp > 0) { const p = at(amp); ctx.beginPath(); ctx.moveTo(x - Math.sin(amp) * L - 40, p.y); ctx.lineTo(x + Math.sin(amp) * L + 40, p.y); ctx.stroke(); }
  ctx.setLineDash([]);
  for (const p of o.points ?? []) {
    const q = at(p.angle);
    ctx.beginPath(); ctx.arc(q.x, q.y, bobR * 0.75, 0, TAU); ctx.strokeStyle = c.labelMuted; ctx.lineWidth = 2.5; ctx.stroke();
    const below = Math.abs(p.angle) < 0.15;
    label(ctx, c, p.label, q.x + (below ? 0 : Math.sign(p.angle) * (bobR + 16)), q.y + (below ? bobR + 18 : 0), size);
  }
  // String, then a small hook cap, then the bob.
  ctx.strokeStyle = darken(c.labelMuted, 0.15); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bob.x - Math.sin(ang) * bobR, bob.y - Math.cos(ang) * bobR); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 4.5, 0, TAU); ctx.fillStyle = darken(metalOf(c), 0.3); ctx.fill();
  if (o.shadowY != null) drawShadow(ctx, c, bob.x, o.shadowY, bobR * 1.1);
  ball(ctx, c, bob.x, bob.y, bobR, col);
  ctx.restore();
  return { pivot: { x, y }, bob: { x: bob.x, y: bob.y, r: bobR }, at };
}

// -- Lever plank / beam balance ---------------------------------------------------

export function drawLeverPlank(ctx, c, o = {}) {
  const fx = o.x ?? 340, fy = o.y ?? 400, ang = o.angle ?? 0, Lf = o.left ?? 200, Rt = o.right ?? 200, th = o.thick ?? 16, size = o.size ?? 21;
  const g = lever({ x: fx, y: fy }, ang, Lf, Rt);
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const at = (d) => ({ x: fx + cs * d + sn * th, y: fy + sn * d - cs * th });   // plank top at signed distance d
  const wood = toneOf(c, o.tone ?? 'gold');
  const groundY = o.groundY ?? fy + 64;
  ctx.save();
  if (o.fulcrum !== false) {
    // The triangle scales with the plank: about 1/8 of its length tall (min 28 px). If the
    // ground is further down, it stands on a plinth; if nearer, it squats to the ground.
    const metal = metalOf(c), gap = Math.max(8, groundY - fy);
    const triH = Math.min(gap, Math.max(28, (Lf + Rt) / 8)), half = Math.max(triH * 0.72, 16), baseY = fy + triH;
    drawShadow(ctx, c, fx, groundY, half * 1.35);
    if (gap - triH > 3) {                                                                // plinth block under the triangle
      const pw = half * 2.3;
      solid(ctx, () => rr(ctx, fx - pw / 2, baseY - 1, pw, groundY - baseY + 1, 3), { x: fx - pw / 2, y: baseY, w: pw, h: groundY - baseY }, darken(metal, 0.08), { shade: 'right', lip: false, inner: false });
    }
    const path = () => { ctx.beginPath(); ctx.moveTo(fx, fy - 2); ctx.lineTo(fx + half, baseY); ctx.lineTo(fx - half, baseY); ctx.closePath(); };
    solid(ctx, path, { x: fx - half, y: fy, w: half * 2, h: triH }, metal, { shade: 'right', lip: false, inner: false });
    ctx.save(); path(); ctx.clip();                                                      // shade face: the right half, tip to base
    ctx.beginPath(); ctx.moveTo(fx, fy - 2); ctx.lineTo(fx + half + 2, baseY + 2); ctx.lineTo(fx + half * 0.12, baseY + 2); ctx.closePath();
    ctx.fillStyle = alpha(darken(metal, 0.26), 0.9); ctx.fill();
    ctx.strokeStyle = alpha(lighten(metal, 0.45), 0.9); ctx.lineWidth = 3;               // lit left edge
    ctx.beginPath(); ctx.moveTo(fx - 1, fy + 2); ctx.lineTo(fx - half + 3, baseY - 1); ctx.stroke();
    ctx.restore();
    path(); ctx.strokeStyle = darken(metal, 0.36); ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
  }
  // Pans hang plumb from the plank's underside, drawn before the plank.
  for (const p of o.pans ?? []) {
    const hx = fx + cs * p.at, hy = fy + sn * p.at, drop = p.drop ?? 70, pw = p.w ?? 70, py = hy + drop;
    ctx.strokeStyle = darken(c.labelMuted, 0.15); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - pw / 2 + 4, py); ctx.moveTo(hx, hy); ctx.lineTo(hx + pw / 2 - 4, py); ctx.stroke();
    for (let k = 0; k < (p.n ?? 0); k++) {                                             // coins stacked in the pan
      const cy = py - 4 - k * 6, gold = toneOf(c, 'gold');
      ellipse(ctx, hx, cy + 2, 15, 5); ctx.fillStyle = darken(gold, 0.35); ctx.fill();
      ellipse(ctx, hx, cy, 15, 5); ctx.fillStyle = gold; ctx.fill(); ctx.strokeStyle = darken(gold, 0.4); ctx.lineWidth = 1.5; ctx.stroke();
    }
    const dish = () => { ctx.beginPath(); ctx.moveTo(hx - pw / 2, py); ctx.quadraticCurveTo(hx, py + 26, hx + pw / 2, py); ctx.closePath(); };
    solid(ctx, dish, { x: hx - pw / 2, y: py, w: pw, h: 14 }, metalOf(c), { lip: false, inner: false });
    if (p.label) label(ctx, c, p.label, hx, py + 32, size);
  }
  // The plank in its own frame.
  ctx.save(); ctx.translate(fx, fy); ctx.rotate(ang);
  solid(ctx, () => rr(ctx, -Lf, -th, Lf + Rt, th, 6), { x: -Lf, y: -th, w: Lf + Rt, h: th }, wood, {});
  ctx.strokeStyle = alpha(darken(wood, 0.32), 0.6); ctx.lineWidth = 1.5;               // grain
  for (const [a, b, yy] of [[-Lf + 20, -Lf * 0.3, -th * 0.68], [Rt * 0.15, Rt - 30, -th * 0.7], [-Lf * 0.6, Rt * 0.4, -th * 0.3]]) { ctx.beginPath(); ctx.moveTo(a, yy); ctx.lineTo(b, yy); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, -th / 2, 4, 0, TAU); ctx.fillStyle = darken(metalOf(c), 0.35); ctx.fill();   // the pivot pin
  ctx.restore();
  const seatCol = toneOf(c, o.seatTone ?? 6);
  for (const s of o.seats ?? []) {
    const p = at(s.at);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
    const bucket = () => { ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-18, -14); ctx.quadraticCurveTo(0, -6, 18, -14); ctx.lineTo(20, 0); ctx.closePath(); };
    solid(ctx, bucket, { x: -20, y: -16, w: 40, h: 16 }, seatCol, { lip: false, inner: false });
    ctx.restore();
    if (s.label) label(ctx, c, s.label, p.x + sn * 34, p.y - cs * 34, size);
  }
  ctx.restore();
  return { effort: g.effort, load: g.load, advantage: g.advantage, angle: ang, at, fulcrum: { x: fx, y: fy, groundY } };
}

// -- Sack / school bag ------------------------------------------------------------

export function drawSack(ctx, c, o = {}) {
  const x = o.x ?? 200, y = o.y ?? 400, kind = o.kind ?? 'sack';
  const w = o.w ?? (kind === 'bag' ? 70 : 74), h = o.h ?? (kind === 'bag' ? 84 : 86);
  // Jute: gold toned down toward the muted ink, so it reads as sacking, not a yellow blob, in both themes.
  const col = o.tone != null || kind === 'bag' ? toneOf(c, o.tone ?? 2) : mix(toneOf(c, 'gold'), c.labelMuted, 0.34);
  const x0 = x - w / 2, y0 = y - h;
  ctx.save();
  if (!o.held) drawShadow(ctx, c, x, y, w * 0.6);
  let grip, grips;
  if (kind === 'bag') {
    const strap = darken(col, 0.35);
    ctx.strokeStyle = strap; ctx.lineWidth = 6; ctx.lineCap = 'round';                  // top handle
    ctx.beginPath(); ctx.moveTo(x - 13, y0 + 4); ctx.quadraticCurveTo(x, y0 - 20, x + 13, y0 + 4); ctx.stroke();
    solid(ctx, () => rr(ctx, x0, y0, w, h, 16), { x: x0, y: y0, w, h }, col, { shade: 'right', inner: false });
    // Flap with a seam line, a front pocket with a seam.
    solid(ctx, () => { ctx.beginPath(); ctx.moveTo(x0 + 3, y0 + 10); ctx.quadraticCurveTo(x0 + 3, y0 + 2, x0 + 16, y0 + 2); ctx.lineTo(x0 + w - 16, y0 + 2); ctx.quadraticCurveTo(x0 + w - 3, y0 + 2, x0 + w - 3, y0 + 10); ctx.lineTo(x0 + w - 3, y0 + h * 0.42); ctx.quadraticCurveTo(x, y0 + h * 0.52, x0 + 3, y0 + h * 0.42); ctx.closePath(); }, { x: x0, y: y0, w, h: h * 0.5 }, lighten(col, 0.08), { lip: false, shade: 'right', inner: false });
    ctx.setLineDash([4, 4]); ctx.strokeStyle = alpha(darken(col, 0.4), 0.8); ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(x0 + 9, y0 + h * 0.36); ctx.quadraticCurveTo(x, y0 + h * 0.45, x0 + w - 9, y0 + h * 0.36); ctx.stroke(); ctx.setLineDash([]);
    solid(ctx, () => rr(ctx, x0 + 12, y0 + h * 0.6, w - 24, h * 0.3, 7), { x: x0 + 12, y: y0 + h * 0.6, w: w - 24, h: h * 0.3 }, darken(col, 0.06), { lip: false, shade: 'right' });
    rr(ctx, x - 5, y0 + h * 0.43, 10, 9, 2); ctx.fillStyle = metalOf(c); ctx.fill();   // buckle
    grip = { x, y: y0 - 12 }; grips = [{ x: x0 + 6, y: y0 + h * 0.5 }, { x: x0 + w - 6, y: y0 + h * 0.5 }];
  } else {
    const neckY = y0 + h * 0.2;
    const sack = () => {
      ctx.beginPath(); ctx.moveTo(x - w * 0.16, neckY);
      ctx.bezierCurveTo(x - w * 0.62, neckY + h * 0.18, x - w * 0.58, y + 2, x - w * 0.3, y);
      ctx.lineTo(x + w * 0.3, y);
      ctx.bezierCurveTo(x + w * 0.58, y + 2, x + w * 0.62, neckY + h * 0.18, x + w * 0.16, neckY);
      ctx.closePath();
    };
    const ear = () => { ctx.beginPath(); ctx.moveTo(x - w * 0.15, neckY + 2); ctx.lineTo(x - w * 0.24, y0); ctx.quadraticCurveTo(x, y0 + 8, x + w * 0.24, y0); ctx.lineTo(x + w * 0.15, neckY + 2); ctx.closePath(); };
    solid(ctx, ear, { x: x - w * 0.24, y: y0, w: w * 0.48, h: neckY - y0 }, lighten(col, 0.04), { lip: false, inner: false, shade: 'right' });
    solid(ctx, sack, { x: x0 - w * 0.1, y: neckY, w: w * 1.2, h: y - neckY }, col, { shade: 'right', inner: false });
    ctx.save(); sack(); ctx.clip();
    const sx0 = x0 - w * 0.1, sw = w * 1.2, sh = y - neckY;
    // Shade side: a round belly shadow on the right and along the bottom, away from the key light.
    ctx.fillStyle = alpha(darken(col, 0.3), 0.75);
    ellipse(ctx, x + w * 0.5, y - sh * 0.3, w * 0.42, sh * 0.62, 0); ctx.fill();
    ctx.fillStyle = alpha(darken(col, 0.24), 0.6); ctx.fillRect(sx0, y - sh * 0.16, sw, sh * 0.2);
    // Light side: a soft lit bulge on the upper left.
    ctx.fillStyle = alpha(lighten(col, 0.32), 0.7);
    ellipse(ctx, x - w * 0.24, neckY + sh * 0.42, w * 0.17, sh * 0.3, -0.12); ctx.fill();
    // Weave: dark warp and weft threads with a lit thread beside each, so it shows on a dark page too.
    const step = 6;
    ctx.lineWidth = 1.3;
    for (let k = 0; k < sw + step; k += step) {
      ctx.strokeStyle = alpha(darken(col, 0.38), 0.42);
      ctx.beginPath(); ctx.moveTo(sx0 + k, neckY); ctx.lineTo(sx0 + k, y); ctx.stroke();
      ctx.strokeStyle = alpha(lighten(col, 0.3), 0.22);
      ctx.beginPath(); ctx.moveTo(sx0 + k + 1.6, neckY); ctx.lineTo(sx0 + k + 1.6, y); ctx.stroke();
    }
    for (let k = 0; k < sh + step; k += step) {
      ctx.strokeStyle = alpha(darken(col, 0.38), 0.36);
      ctx.beginPath(); ctx.moveTo(sx0, neckY + k); ctx.lineTo(sx0 + sw, neckY + k); ctx.stroke();
    }
    // A printed band of two stripes across the belly (a grain sack), shaded with the body.
    const bandY = neckY + sh * 0.44;
    ctx.fillStyle = alpha(darken(col, 0.42), 0.55); ctx.fillRect(sx0, bandY, sw, 4); ctx.fillRect(sx0, bandY + 9, sw, 4);
    // Stitched seams: the side seam and the bottom hem, dashed like thread.
    ctx.setLineDash([4, 3]); ctx.strokeStyle = alpha(darken(col, 0.5), 0.85); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + w * 0.1, neckY + 6); ctx.quadraticCurveTo(x + w * 0.24, (neckY + y) / 2, x + w * 0.16, y - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - w * 0.36, y - 6); ctx.quadraticCurveTo(x, y - 3, x + w * 0.36, y - 6); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    sack(); ctx.strokeStyle = darken(col, 0.45); ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();   // rim again over the texture
    const tie = darken(col, 0.45);                                                        // the tie at the neck
    rr(ctx, x - w * 0.19, neckY - 4, w * 0.38, 8, 4); ctx.fillStyle = tie; ctx.fill();
    ctx.strokeStyle = tie; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + w * 0.16, neckY); ctx.quadraticCurveTo(x + w * 0.3, neckY + 4, x + w * 0.26, neckY + 14); ctx.stroke();
    grip = { x, y: neckY }; grips = [{ x: x - w * 0.42, y: y - h * 0.42 }, { x: x + w * 0.42, y: y - h * 0.42 }];
  }
  ctx.restore();
  return { box: { x0, y0, w, h }, grip, grips };
}

// -- Stairs -----------------------------------------------------------------------

export function drawStairs(ctx, c, o = {}) {
  const x = o.x ?? 120, y = o.y ?? 420, n = Math.max(1, o.n ?? 6), rise = o.rise ?? 26, run = o.run ?? 40, d = o.dir === -1 ? -1 : 1, size = o.size ?? 21;
  const col = o.tone ? toneOf(c, o.tone) : mix(c.bgSurface, c.label, 0.28);
  const steps = [];
  for (let i = 0; i < n; i++) { const xa = x + d * i * run, xb = x + d * (i + 1) * run; steps.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), y: y - (i + 1) * rise }); }
  const xEnd = x + d * n * run, topY = y - n * rise;
  ctx.save();
  if (o.shadow !== false) drawShadow(ctx, c, (x + xEnd) / 2, y, Math.abs(xEnd - x) * 0.55);
  const flight = () => {
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let i = 0; i < n; i++) { ctx.lineTo(x + d * i * run, y - (i + 1) * rise); ctx.lineTo(x + d * (i + 1) * run, y - (i + 1) * rise); }
    ctx.lineTo(xEnd + d * 18, topY); ctx.lineTo(xEnd + d * 18, y); ctx.closePath();
  };
  const bx = Math.min(x, xEnd + d * 18), bw = Math.abs(xEnd + d * 18 - x);
  flight(); ctx.fillStyle = col; ctx.fill();
  ctx.save(); flight(); ctx.clip();
  for (let i = 0; i < n; i++) {                                                         // each riser: shade low, tread: lit lip
    const xa = x + d * i * run, ty = y - (i + 1) * rise;
    ctx.fillStyle = darken(col, 0.16); ctx.fillRect(Math.min(xa, xa + d * run) - 1, ty + rise * 0.55, run + 2, rise * 0.45 + 1);
    ctx.fillStyle = alpha(lighten(col, 0.4), 0.9); ctx.fillRect(Math.min(xa, xa + d * run), ty, run + 1, 4);
    ctx.strokeStyle = alpha(darken(col, 0.3), 0.6); ctx.lineWidth = 2;                  // inner line: the step edge
    ctx.beginPath(); ctx.moveTo(xa, ty); ctx.lineTo(xa, y); ctx.stroke();
  }
  ctx.fillStyle = darken(col, 0.22); ctx.fillRect(xEnd - (d > 0 ? 0 : 18), topY, 18, n * rise);   // the landing's shade side
  ctx.restore();
  flight(); ctx.strokeStyle = darken(col, 0.34); ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
  if (o.rail) {
    const railC = darken(metalOf(c), 0.1), hgt = 64;
    ctx.strokeStyle = darken(railC, 0.35); ctx.lineCap = 'round';
    for (let i = 0; i < n; i += 2) { const sx = x + d * (i + 0.5) * run, sy = y - (i + 1) * rise; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - hgt); ctx.stroke(); }
    const r0 = { x: x + d * 0.5 * run, y: y - rise - hgt }, r1 = { x: x + d * (n - 0.5) * run, y: y - n * rise - hgt };
    ctx.lineWidth = 9; ctx.strokeStyle = darken(railC, 0.4); ctx.beginPath(); ctx.moveTo(r0.x, r0.y + 2); ctx.lineTo(r1.x, r1.y + 2); ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = railC; ctx.beginPath(); ctx.moveTo(r0.x, r0.y); ctx.lineTo(r1.x, r1.y); ctx.stroke();
    ctx.lineWidth = 1.8; ctx.strokeStyle = alpha(lighten(railC, 0.5), 0.9); ctx.beginPath(); ctx.moveTo(r0.x, r0.y - 1.5); ctx.lineTo(r1.x, r1.y - 1.5); ctx.stroke();
  }
  if (o.bracket) {
    const far = (o.bracket.side ?? 'far') === 'far', bxx = far ? xEnd + d * 34 : x - d * 22;
    ctx.strokeStyle = c.label; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bxx, y); ctx.lineTo(bxx, topY); ctx.moveTo(bxx - 7, y); ctx.lineTo(bxx + 7, y); ctx.moveTo(bxx - 7, topY); ctx.lineTo(bxx + 7, topY); ctx.stroke();
    if (o.bracket.label) label(ctx, c, o.bracket.label, bxx + (far ? d : -d) * 12, (y + topY) / 2, size, { align: (far ? d : -d) > 0 ? 'left' : 'right' });
  }
  ctx.restore();
  const ground = (gx) => { const k = Math.floor(((gx - x) * d) / run); return k < 0 ? y : k >= n ? topY : y - (k + 1) * rise; };
  return { top: { x: xEnd, y: topY }, steps, ground, box: { x0: bx, y0: topY, w: bw, h: y - topY } };
}

// -- Magnet and charge --------------------------------------------------------------

export function drawMagnet(ctx, c, o = {}) {
  const x = o.x ?? 200, y = o.y ?? 200, w = o.w ?? 128, h = o.h ?? 42, size = o.size ?? 21;
  const tones = o.tones ?? [6, 1], labels = o.labels === null ? null : (o.labels ?? ['N', 'S']);
  const halves = o.flip ? [[1, tones[1], labels?.[1]], [0, tones[0], labels?.[0]]] : [[0, tones[0], labels?.[0]], [1, tones[1], labels?.[1]]];
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.angle ?? 0);
  halves.forEach(([, t], i) => {
    const hx = -w / 2 + i * w / 2, col = toneOf(c, t);
    const r = 7, path = () => { ctx.beginPath(); if (typeof ctx.roundRect === 'function') ctx.roundRect(hx, -h / 2, w / 2, h, i === 0 ? [r, 0, 0, r] : [0, r, r, 0]); else ctx.rect(hx, -h / 2, w / 2, h); };
    solid(ctx, path, { x: hx, y: -h / 2, w: w / 2, h }, col, { inner: false });
  });
  ctx.strokeStyle = alpha(darken(c.bgDeep, 0.2), 0.6); ctx.lineWidth = 2;               // the join between the halves
  ctx.beginPath(); ctx.moveTo(0, -h / 2 + 2); ctx.lineTo(0, h / 2 - 2); ctx.stroke();
  ctx.restore();
  const ca = Math.cos(o.angle ?? 0), sa = Math.sin(o.angle ?? 0);
  const pole = (k) => ({ x: x + ca * k * w / 4, y: y + sa * k * w / 4 });
  const nAt = pole(o.flip ? 1 : -1), sAt = pole(o.flip ? -1 : 1);
  if (labels) {
    halves.forEach(([, t, lb], i) => { const p = pole(i === 0 ? -1 : 1); label(ctx, c, lb, p.x, p.y, size, { col: inkOn(c, toneOf(c, t)), halo: false }); });
  }
  return { box: { x0: x - w / 2, y0: y - h / 2, w, h }, n: nAt, s: sAt };
}

export function drawCharge(ctx, c, o = {}) {
  const x = o.x ?? 200, y = o.y ?? 200, r = o.r ?? 22, plus = (o.sign ?? '+') !== '-';
  const col = toneOf(c, o.tone ?? (plus ? 6 : 1));
  ctx.save();
  ball(ctx, c, x, y, r, col);
  const ink = inkOn(c, col), bw = r * 0.95, bt = Math.max(3.5, r * 0.2);
  rr(ctx, x - bw / 2, y - bt / 2, bw, bt, bt / 2); ctx.fillStyle = ink; ctx.fill();
  if (plus) { rr(ctx, x - bt / 2, y - bw / 2, bt, bw, bt / 2); ctx.fill(); }
  ctx.restore();
  return { x, y, r };
}

export function drawBall(ctx, c, o = {}) {
  const x = o.x ?? 200, y = o.y ?? 200, r = o.r ?? 18;
  if (o.shadowY != null) drawShadow(ctx, c, x, o.shadowY, r * 1.1);
  ball(ctx, c, x, y, r, toneOf(c, o.tone ?? 6));
  return { x, y, r };
}

// -- Displacement arrow ---------------------------------------------------------------

export function displacementArrow(ctx, c, x1, y1, x2, y2, o = {}) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 6) return null;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len, ang = Math.atan2(uy, ux);
  const col = o.col ?? toneOf(c, o.tone ?? 2), wid = o.width ?? 4, head = o.head ?? 12;
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = wid; ctx.lineCap = 'round';
  ctx.setLineDash(o.dash ?? [9, 7]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - ux * head * 0.8, y2 - uy * head * 0.8); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(x2, y2);                                                  // the same head as vectorArrow
  ctx.lineTo(x2 - head * Math.cos(ang - 0.5), y2 - head * Math.sin(ang - 0.5));
  ctx.lineTo(x2 - head * Math.cos(ang + 0.5), y2 - head * Math.sin(ang + 0.5));
  ctx.closePath(); ctx.fill();
  ctx.restore();
  let box = null;
  if (o.label != null && o.label !== '') {
    const size = o.size ?? 21, side = o.side === -1 ? -1 : 1;
    const nx = -uy * side, ny = ux * side;                                              // side 1: right of the travel direction
    const sz = chipSize(ctx, c, String(o.label), size);
    const d = Math.abs(nx) * sz.w / 2 + Math.abs(ny) * sz.h / 2 + wid / 2 + 8;          // clear of the shaft, whatever its slope
    const f = o.frame ?? { x: 0, y: 0, w: 680, h: 520 };
    const at = o.at ?? 0.5;
    const px = Math.min(Math.max(x1 + (x2 - x1) * at + nx * d, f.x + sz.w / 2 + 4), f.x + f.w - sz.w / 2 - 4);
    const py = Math.min(Math.max(y1 + (y2 - y1) * at + ny * d, f.y + sz.h / 2 + 4), f.y + f.h - sz.h / 2 - 4);
    box = pill(ctx, c, String(o.label), px, py, { bg: col, size, alpha: o.alpha ?? 1 });
  }
  return { x2, y2, len, box };
}

// -- Crate / carton -------------------------------------------------------------------

export function drawCrate(ctx, c, o = {}) {
  const kind = o.kind === 'carton' ? 'carton' : 'crate';
  const x = o.x ?? 200, y = o.y ?? 400, w = o.w ?? 80, h = o.h ?? 64;
  const x0 = x - w / 2, y0 = y - h;
  const base = o.tone != null ? toneOf(c, o.tone) : mix(toneOf(c, 'gold'), c.flame ?? c.s8, 0.32);
  const col = kind === 'carton' ? mix(base, c.labelMuted, 0.3) : darken(base, 0.06);
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  if (!o.held) drawShadow(ctx, c, x, y, w * 0.62);
  const body = () => rr(ctx, x0, y0, w, h, kind === 'carton' ? 4 : 3);
  solid(ctx, body, { x: x0, y: y0, w, h }, col, { shade: 'right', inner: false });
  ctx.save(); body(); ctx.clip();
  ctx.fillStyle = alpha(lighten(col, 0.3), 0.85); ctx.fillRect(x0, y0, w, 5);           // lit top edge
  if (kind === 'carton') {
    ctx.strokeStyle = alpha(darken(col, 0.38), 0.8); ctx.lineWidth = 2;                // the lid flap seam
    ctx.beginPath(); ctx.moveTo(x0, y0 + h * 0.2); ctx.lineTo(x0 + w, y0 + h * 0.2); ctx.stroke();
    const tw = Math.max(10, w * 0.16), tape = mix(col, c.bgSurface, 0.3);               // tape over the seam, down the front
    ctx.fillStyle = alpha(tape, 0.9); ctx.fillRect(x - tw / 2, y0, tw, h * 0.42);
    ctx.fillStyle = alpha(darken(tape, 0.2), 0.9); ctx.fillRect(x + tw * 0.15, y0, tw * 0.35, h * 0.42);
    ctx.strokeStyle = alpha(darken(col, 0.3), 0.6); ctx.lineWidth = 1.5;                // tape end, a little torn
    ctx.beginPath(); ctx.moveTo(x - tw / 2, y0 + h * 0.42); ctx.lineTo(x - tw / 6, y0 + h * 0.4); ctx.lineTo(x + tw / 6, y0 + h * 0.44); ctx.lineTo(x + tw / 2, y0 + h * 0.42); ctx.stroke();
    ctx.strokeStyle = alpha(darken(col, 0.34), 0.5); ctx.lineWidth = 1.5;               // a crease near the shade side
    ctx.beginPath(); ctx.moveTo(x0 + w * 0.82, y0 + h * 0.3); ctx.lineTo(x0 + w * 0.84, y - 6); ctx.stroke();
  } else {
    const fr = Math.max(7, Math.min(w, h) * 0.13), frame = darken(col, 0.18);
    ctx.strokeStyle = alpha(darken(col, 0.4), 0.7); ctx.lineWidth = 1.6;                // plank lines
    const nP = Math.max(2, Math.round(h / 18));
    for (let k = 1; k < nP; k++) { const py = y0 + (h * k) / nP; ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(x0 + w, py); ctx.stroke(); }
    ctx.save();                                                                          // the diagonal brace
    ctx.beginPath(); ctx.moveTo(x0 + fr, y - fr - 2); ctx.lineTo(x0 + fr + 4, y - fr); ctx.lineTo(x0 + w - fr, y0 + fr + 2); ctx.lineTo(x0 + w - fr - 4, y0 + fr); ctx.closePath();
    ctx.lineWidth = fr * 0.9; ctx.strokeStyle = frame; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = frame;                                                               // the frame: four edge planks
    ctx.fillRect(x0, y0, w, fr); ctx.fillRect(x0, y - fr, w, fr); ctx.fillRect(x0, y0, fr, h); ctx.fillRect(x0 + w - fr, y0, fr, h);
    ctx.fillStyle = alpha(lighten(col, 0.28), 0.75); ctx.fillRect(x0, y0, w, 3); ctx.fillRect(x0, y0, 3, h);
    ctx.fillStyle = alpha(darken(col, 0.3), 0.6); ctx.fillRect(x0 + w - fr * 0.5, y0, fr * 0.5, h);
    ctx.strokeStyle = alpha(darken(col, 0.42), 0.7); ctx.lineWidth = 1.5;               // the frame's inner edges
    ctx.strokeRect(x0 + fr, y0 + fr, w - fr * 2, h - fr * 2);
    ctx.fillStyle = darken(metalOf(c), 0.3);                                             // nail heads
    for (const [nx, ny] of [[x0 + fr / 2, y0 + fr / 2], [x0 + w - fr / 2, y0 + fr / 2], [x0 + fr / 2, y - fr / 2], [x0 + w - fr / 2, y - fr / 2]]) { ctx.beginPath(); ctx.arc(nx, ny, 1.8, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
  body(); ctx.strokeStyle = darken(col, 0.42); ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.restore();
  return { box: { x0, y0, w, h }, top: { x, y: y0 }, left: { x: x0, y: y0 + h * 0.45 }, right: { x: x0 + w, y: y0 + h * 0.45 }, bottom: { x, y } };
}

// -- Gulel (Y-fork slingshot) -----------------------------------------------------------

// A round-ended wooden limb with a shade strip along its lower side and a rim.
function stick(ctx, x1, y1, x2, y2, wd, fill, shade) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  ctx.save(); ctx.translate((x1 + x2) / 2, (y1 + y2) / 2); ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
  rr(ctx, -len / 2 - wd / 2, -wd / 2, len + wd, wd, wd / 2); ctx.fillStyle = fill; ctx.fill();
  ctx.save(); rr(ctx, -len / 2 - wd / 2, -wd / 2, len + wd, wd, wd / 2); ctx.clip();
  ctx.fillStyle = shade; ctx.fillRect(-len / 2 - wd, wd * 0.12, len + wd * 2, wd);
  ctx.fillStyle = alpha(lighten(fill, 0.35), 0.8); ctx.fillRect(-len / 2 - wd, -wd / 2, len + wd * 2, wd * 0.18);
  ctx.restore();
  rr(ctx, -len / 2 - wd / 2, -wd / 2, len + wd, wd, wd / 2); ctx.strokeStyle = darken(fill, 0.42); ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

export function drawGulel(ctx, c, o = {}) {
  const x = o.x ?? 200, y = o.y ?? 400, h = o.h ?? 120, spread = o.spread ?? 48;
  const crotch = { x, y: y - h * 0.46 };
  const tipN = { x: x - spread / 2, y: y - h }, tipF = { x: x + spread / 2, y: y - h + h * 0.07 };
  const rest = { x: (tipN.x + tipF.x) / 2 - spread * 0.1, y: Math.max(tipN.y, tipF.y) + h * 0.16 };
  const pouch = o.pull ? { x: o.pull.x, y: o.pull.y } : rest;
  const reach = Math.hypot(pouch.x - rest.x, pouch.y - rest.y), u = Math.min(1, reach / (h * 0.9));
  const wood = o.tone != null ? toneOf(c, o.tone) : mix(c.s8, c.bgDeep, 0.3), shade = darken(wood, 0.34);
  const band = toneOf(c, o.bandTone ?? 6), leather = mix(c.s8, c.bgDeep, 0.52);
  const th = 8 - 4 * u, sag = 11 * (1 - u);
  const ang = Math.atan2(pouch.y - (tipN.y + tipF.y) / 2, pouch.x - (tipN.x + tipF.x) / 2) + Math.PI / 2;
  const strand = (tip, ex, ey, col) => {
    ctx.strokeStyle = darken(col, 0.3); ctx.lineWidth = th + 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.quadraticCurveTo((tip.x + ex) / 2, (tip.y + ey) / 2 + sag, ex, ey); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = th;
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.quadraticCurveTo((tip.x + ex) / 2, (tip.y + ey) / 2 + sag, ex, ey); ctx.stroke();
  };
  const pc = Math.cos(ang), ps = Math.sin(ang);
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  if (o.shadowY != null) drawShadow(ctx, c, x, o.shadowY, spread * 0.6);
  stick(ctx, crotch.x, crotch.y, tipF.x, tipF.y, h * 0.09, shade, darken(shade, 0.2));     // far prong, in shade
  strand(tipF, pouch.x + pc * 10, pouch.y + ps * 10, darken(band, 0.28));                  // far strand, behind the pouch
  stick(ctx, x, y, crotch.x, crotch.y, h * 0.12, wood, shade);                              // handle
  stick(ctx, crotch.x, crotch.y, tipN.x, tipN.y, h * 0.09, wood, shade);                    // near prong
  const gy = y - h * 0.2, gw = h * 0.17, gh = h * 0.26;                                     // leather wrap at the grip
  rr(ctx, x - gw / 2, gy - gh / 2, gw, gh, gw * 0.3); ctx.fillStyle = mix(c.s8, c.bgDeep, 0.58); ctx.fill();
  ctx.strokeStyle = alpha(darken(leather, 0.4), 0.8); ctx.lineWidth = 1.5;
  for (let k = 1; k < 4; k++) { const yy = gy - gh / 2 + (gh * k) / 4; ctx.beginPath(); ctx.moveTo(x - gw / 2 + 1, yy - 2); ctx.lineTo(x + gw / 2 - 1, yy + 2); ctx.stroke(); }
  rr(ctx, x - gw / 2, gy - gh / 2, gw, gh, gw * 0.3); ctx.strokeStyle = darken(leather, 0.45); ctx.lineWidth = 2; ctx.stroke();
  for (const t of [tipN, tipF]) { ctx.fillStyle = darken(band, 0.35); ctx.beginPath(); ctx.arc(t.x, t.y, th * 0.7, 0, TAU); ctx.fill(); }   // band knots on the tips
  ctx.save(); ctx.translate(pouch.x, pouch.y); ctx.rotate(ang);                            // the pouch
  const pw = 26, ph = 17;
  rr(ctx, -pw / 2, -ph / 2, pw, ph, 6); ctx.fillStyle = leather; ctx.fill();
  ctx.fillStyle = alpha(lighten(leather, 0.3), 0.6); rr(ctx, -pw / 2 + 2, -ph / 2 + 1, pw - 4, 4, 2); ctx.fill();
  ctx.fillStyle = alpha(darken(leather, 0.3), 0.7); rr(ctx, -pw / 2 + 2, ph / 2 - 6, pw - 4, 5, 2); ctx.fill();
  rr(ctx, -pw / 2, -ph / 2, pw, ph, 6); ctx.strokeStyle = darken(leather, 0.45); ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  let stone = null;
  if (o.stone) {
    const r = o.stoneR ?? 10;
    stone = { x: pouch.x + ps * 3, y: pouch.y - pc * 3, r };
    ball(ctx, c, stone.x, stone.y, r, o.stoneTone != null ? toneOf(c, o.stoneTone) : mix(c.labelMuted, c.bgSurface, 0.3));
  }
  strand(tipN, pouch.x - pc * 10, pouch.y - ps * 10, band);                                 // near strand, in front
  ctx.restore();
  return { pouch, rest, stone, grip: { x, y: gy }, tips: [tipN, tipF], crotch, stretch: u };
}

// -- Sound apparatus (added 2026-11-03, sound module) ---------------------------------
// drawTuningFork, drawBellJar, drawPistonTube, drawSpeaker, drawMicrophone,
// drawSignalWire, drawStopwatch. Each is pure on its inputs (time t comes in, in s)
// and draws no sound arcs and no air dots: it returns anchors (prong tips, bell,
// jar interior, tube interior, cone, diaphragm) where a scene adds SimWave arcs/dots.
// Label and readout size default 26 (11 px on a 390 phone).

const c01 = (v) => Math.max(0, Math.min(1, v));
const steelOf = (c) => mix(c.labelMuted, c.bgSurface, 0.15);
const rubberOf = (c) => darken(mix(c.s5, c.labelMuted, 0.5), 0.62);
const woodOf = (c) => mix(c.s8, c.bgDeep, 0.3);

function polyline(ctx, P, dx = 0, dy = 0) {
  ctx.beginPath();
  P.forEach((p, i) => (i ? ctx.lineTo(p.x + dx, p.y + dy) : ctx.moveTo(p.x + dx, p.y + dy)));
}

// Outline of a band of width wd (a number, or fn(s) with s = 0..1 along P) round centre line P.
function bandOf(ctx, P, wd) {
  const L = [], R = [], n = P.length;
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1, w = (typeof wd === 'function' ? wd(i / Math.max(1, n - 1)) : wd) / 2;
    const nx = (-(b.y - a.y) / l) * w, ny = ((b.x - a.x) / l) * w;
    L.push({ x: P[i].x + nx, y: P[i].y + ny }); R.push({ x: P[i].x - nx, y: P[i].y - ny });
  }
  return () => {
    ctx.beginPath(); ctx.moveTo(L[0].x, L[0].y);
    for (const p of L) ctx.lineTo(p.x, p.y);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y);
    ctx.closePath();
  };
}

// A lit rod along centre line P (bent or tapered): body, shade side (lower right),
// light side (upper left), inner line, darker rim. Shading offsets are in screen
// space and clipped to the band, so the key light stays top-left on any bend.
function rod(ctx, P, wd, col, o = {}) {
  const path = bandOf(ctx, P, wd), k = typeof wd === 'function' ? wd(0.5) : wd;
  ctx.save();
  path(); ctx.fillStyle = col; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  polyline(ctx, P, k * 0.42, k * 0.42); ctx.strokeStyle = darken(col, 0.24); ctx.lineWidth = k * 0.62; ctx.stroke();
  polyline(ctx, P, -k * 0.3, -k * 0.3); ctx.strokeStyle = alpha(lighten(col, 0.55), 0.9); ctx.lineWidth = Math.max(1.5, k * 0.2); ctx.stroke();
  if (k > 8) { polyline(ctx, P, k * 0.06, k * 0.06); ctx.strokeStyle = alpha(darken(col, 0.3), 0.45); ctx.lineWidth = 1.5; ctx.stroke(); }
  ctx.restore();
  path(); ctx.strokeStyle = o.rim ?? darken(col, 0.42); ctx.lineWidth = o.rimW ?? 2.2; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.restore();
}

const bez = (a, b, c2, d, n = 16) => Array.from({ length: n + 1 }, (_, i) => {
  const u = i / n, v = 1 - u;
  return { x: v * v * v * a.x + 3 * v * v * u * b.x + 3 * v * u * u * c2.x + u * u * u * d.x,
    y: v * v * v * a.y + 3 * v * v * u * b.y + 3 * v * u * u * c2.y + u * u * u * d.y };
});

/**
 * drawTuningFork(ctx, c, o) -> { tips: [left, right], stem, grip, box, pad }
 *   o: { x, y (stem bottom), h = 240 (stem bottom to prong tips), angle = 0 (radians,
 *        turns the whole fork about the stem bottom; PI points the prongs down),
 *        vib = 0 (0..1 how far the prongs swing), t = 0 (s), freq = 6 (visual Hz),
 *        pad: false | true | { x, y (bottom centre), w, h } (rubber pad block; true puts it
 *        to the right of the fork), tone (steel by default), shadowY }
 *   Both prongs swing apart and together, mirror images, by vib * sin(2 pi freq t);
 *   at vib > 0 a soft ghost shows both extremes. grip: where a holding hand goes.
 */
export function drawTuningFork(ctx, c, o = {}) {
  const x = o.x ?? 200, y = o.y ?? 440, h = o.h ?? 240, ang = o.angle ?? 0;
  const vib = c01(o.vib ?? 0), t = o.t ?? 0, freq = o.freq ?? 6;
  const pw = Math.max(9, h * 0.055), cx = h * 0.062 + pw / 2;
  const rootY = -h * 0.52, bendY = rootY + cx, swing = h * 0.05;
  const steel = o.tone != null ? toneOf(c, o.tone) : steelOf(c);
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const Wp = (p) => ({ x: x + p.x * cs - p.y * sn, y: y + p.x * sn + p.y * cs });
  const U = (d) => {
    const P = [];
    for (let i = 0; i <= 12; i++) { const s = 1 - i / 12; P.push({ x: -cx - d * s * s, y: rootY - s * (h + rootY) }); }
    for (let i = 1; i < 12; i++) { const a = Math.PI - (Math.PI * i) / 12; P.push({ x: cx * Math.cos(a), y: rootY + cx * Math.sin(a) }); }
    for (let i = 0; i <= 12; i++) { const s = i / 12; P.push({ x: cx + d * s * s, y: rootY - s * (h + rootY) }); }
    return P;
  };
  const d = vib * swing * Math.sin(TAU * freq * t);
  let pad = null;
  ctx.save();
  if (o.pad) {
    const pb = typeof o.pad === 'object' ? o.pad : { x: x + h * 0.34, y, w: h * 0.2, h: h * 0.3 };
    const pwd = pb.w ?? h * 0.2, phh = pb.h ?? h * 0.3;
    pad = { x: pb.x - pwd / 2, y: pb.y - phh, w: pwd, h: phh };
    drawShadow(ctx, c, pb.x, pb.y + 2, pwd * 0.7);
    solid(ctx, () => rr(ctx, pad.x, pad.y, pwd, phh, Math.min(10, pwd * 0.18)), pad, rubberOf(c), { shade: 'right', rim: darken(rubberOf(c), 0.5) });
  }
  if (o.shadowY != null) drawShadow(ctx, c, x, o.shadowY, h * 0.1);
  ctx.translate(x, y); ctx.rotate(ang);
  const sw = pw * 1.05, stemTop = bendY - 2;
  rod(ctx, [{ x: 0, y: 0 }, { x: 0, y: stemTop }], sw, steel);
  rod(ctx, [{ x: 0, y: -2 }, { x: 0, y: stemTop * 0.55 }], sw * 1.45, darken(steel, 0.12));
  if (vib > 0.05) {
    ctx.save(); ctx.globalAlpha *= 0.2;
    for (const g of [-1, 1]) { bandOf(ctx, U(g * vib * swing), pw)(); ctx.fillStyle = lighten(steel, 0.2); ctx.fill(); }
    ctx.restore();
  }
  rod(ctx, U(d), pw, steel);
  ctx.restore();
  const tips = [Wp({ x: -cx - d, y: -h }), Wp({ x: cx + d, y: -h })];
  const pts = [Wp({ x: -cx - swing, y: -h }), Wp({ x: cx + swing, y: -h }), Wp({ x: 0, y: 0 })];
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const bx = Math.min(...xs) - pw, by = Math.min(...ys) - pw;
  return { tips, stem: Wp({ x: 0, y: 0 }), grip: Wp({ x: 0, y: stemTop * 0.3 }), pad,
    box: { x: bx, y: by, w: Math.max(...xs) + pw - bx, h: Math.max(...ys) + pw - by } };
}

/**
 * drawBellJar(ctx, c, o) -> { interior, bell, outlet, pump, wires, plate }
 *   Glass bell jar on a plate on a tripod stand (book Fig 10.7), an electric bell inside
 *   (brass gong on a post, two coils, a hammer), two wires out through the plate to the
 *   left, an outlet pipe to a hand vacuum pump.
 *   o: { x (centre), y (bench top under the stand), w = 220 (dome width), h = 240 (dome
 *        height above the plate), standH = 62, hammer = 0 (0..1 phase; 0 = striking),
 *        ring = 1 (0..1 the strike glint), pump = 0 (0..1 handle phase; false = no pump),
 *        pumpSide = 1 (1 right, -1 left), pumpGap = 96, pumpTone = 1 }
 *   interior: { x, y, w, h, contains(px, py) } the air inside the dome (for air dots);
 *   bell: the gong centre; wires: the two free wire ends (to a supply).
 */
export function drawBellJar(ctx, c, o = {}) {
  const x = o.x ?? 240, y = o.y ?? 470, w = o.w ?? 220, h = o.h ?? 240, standH = o.standH ?? 62;
  const rx = w / 2, py = y - standH, prx = rx + 22, pry = 11, th = 10, capR = Math.min(h * 0.6, rx * 1.05);
  const steel = steelOf(c), dk = darken(steel, 0.42), glass = c.glass, brass = c.gold, copper = mix(c.s8, c.bad, 0.3);
  const hp = (((o.hammer ?? 0) % 1) + 1) % 1, swingA = 0.34 * (0.5 - 0.5 * Math.cos(TAU * hp));
  const top = py - h, sideTop = top + capR;
  ctx.save();
  drawShadow(ctx, c, x, y + 2, prx * 0.8);
  // the stand: a column and splayed feet
  rod(ctx, [{ x, y: py + th }, { x, y: y - 8 }], 14, dk);
  for (const s of [-1, 1]) rod(ctx, [{ x, y: y - 12 }, { x: x + s * prx * 0.5, y: y - 2 }], 10, dk);
  rod(ctx, [{ x, y: y - 10 }, { x: x + 10, y: y + 1 }], 10, dk);
  // the wires: up through the plate from the left
  const wires = [{ x: x - prx - 34, y: py + 38 }, { x: x - prx - 34, y: py + 54 }];
  [[x - 34, wires[0], c.s6], [x - 22, wires[1], rubberOf(c)]].forEach(([wx, e, col]) =>
    rod(ctx, bez({ x: wx, y: py + th }, { x: wx, y: e.y + 4 }, { x: e.x + 40, y: e.y }, e, 12), 5, col));
  // the plate: a rim band, then the top face
  ctx.beginPath(); ctx.ellipse(x, py, prx, pry, 0, 0, Math.PI); ctx.lineTo(x - prx, py + th);
  ctx.ellipse(x, py + th, prx, pry, 0, Math.PI, 0, true); ctx.closePath();
  ctx.fillStyle = darken(steel, 0.2); ctx.fill(); ctx.strokeStyle = darken(steel, 0.5); ctx.lineWidth = 2.2; ctx.stroke();
  ellipse(ctx, x, py, prx, pry); ctx.fillStyle = lighten(steel, 0.12); ctx.fill();
  ctx.strokeStyle = alpha(lighten(steel, 0.6), 0.9); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, py, prx - 4, pry - 3, 0, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
  ellipse(ctx, x, py, prx, pry); ctx.strokeStyle = darken(steel, 0.45); ctx.lineWidth = 2.2; ctx.stroke();
  // the dome's far edge, behind the bell
  ctx.strokeStyle = alpha(darken(glass, 0.2), 0.45); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(x, py, rx, pry * 0.9, 0, Math.PI, TAU); ctx.stroke();
  // the bell: base block, two coils, post, gong, hammer
  const bw = rx * 1.1;
  solid(ctx, () => rr(ctx, x - bw / 2, py - 16, bw, 16, 4), { x: x - bw / 2, y: py - 16, w: bw, h: 16 }, woodOf(c), { lip: false });
  for (let i = 0; i < 2; i++) {
    const cx0 = x - rx * 0.44 + i * 22;
    solid(ctx, () => rr(ctx, cx0, py - 50, 18, 34, 4), { x: cx0, y: py - 50, w: 18, h: 34 }, copper, { shade: 'right', lip: false, inner: false });
    ctx.strokeStyle = alpha(darken(copper, 0.45), 0.6); ctx.lineWidth = 1.2;
    for (let k = py - 46; k < py - 18; k += 4) { ctx.beginPath(); ctx.moveTo(cx0 + 2, k); ctx.lineTo(cx0 + 16, k); ctx.stroke(); }
  }
  const gr = rx * 0.42, G = { x: x - rx * 0.06, y: py - h * 0.55 };
  rod(ctx, [{ x: G.x, y: py - 16 }, { x: G.x, y: G.y }], 7, steel);
  const domeG = () => { ctx.beginPath(); ctx.ellipse(G.x, G.y, gr, gr * 0.92, 0, Math.PI, TAU); ctx.ellipse(G.x, G.y, gr, gr * 0.22, 0, 0, Math.PI); ctx.closePath(); };
  const gong = lighten(c.s2, 0.28);   // brass that reads gold in both themes (the gold token is dull in day light)
  solid(ctx, domeG, { x: G.x - gr, y: G.y - gr * 0.92, w: gr * 2, h: gr * 1.14 }, gong, { shade: 'right', lip: false, rim: darken(gong, 0.5) });
  ellipse(ctx, G.x, G.y + 1, gr * 0.86, gr * 0.15); ctx.fillStyle = darken(gong, 0.48); ctx.fill();
  ctx.strokeStyle = alpha(lighten(gong, 0.8), 0.95); ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(G.x, G.y, gr * 0.72, gr * 0.6, 0, Math.PI * 1.12, Math.PI * 1.42); ctx.stroke();
  ball(ctx, c, G.x, G.y - gr * 0.92, 5, steel);
  const Pv = { x: x + rx * 0.34, y: py - 24 }, S = { x: G.x + gr * 0.98, y: G.y + gr * 0.06 };
  const al = Math.hypot(S.x - Pv.x, S.y - Pv.y) - 6, a = Math.atan2(S.y - Pv.y, S.x - Pv.x) + swingA;
  const Hd = { x: Pv.x + al * Math.cos(a), y: Pv.y + al * Math.sin(a) };
  rod(ctx, [{ x: Pv.x, y: py - 16 }, Pv], 8, dk);
  rod(ctx, [Pv, Hd], 5, steel);
  ball(ctx, c, Hd.x, Hd.y, 8, steel);
  const near = (o.ring ?? 1) * Math.max(0, 1 - swingA / 0.06);
  if (near > 0.02) {
    const g = ctx.createRadialGradient(S.x, S.y, 0, S.x, S.y, 24);
    g.addColorStop(0, alpha(lighten(brass, 0.7), 0.9 * near)); g.addColorStop(1, alpha(brass, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(S.x, S.y, 24, 0, TAU); ctx.fill();
  }
  // the glass dome
  const dome = () => {
    ctx.beginPath(); ctx.moveTo(x - rx, py); ctx.lineTo(x - rx, sideTop);
    ctx.ellipse(x, sideTop, rx, capR, 0, Math.PI, TAU); ctx.lineTo(x + rx, py);
    ctx.ellipse(x, py, rx, pry * 0.9, 0, 0, Math.PI); ctx.closePath();
  };
  dome(); ctx.fillStyle = alpha(glass, 0.14); ctx.fill();
  ctx.save(); dome(); ctx.clip();
  ctx.fillStyle = alpha(darken(glass, 0.3), 0.14); ctx.fillRect(x + rx * 0.55, top - 4, rx, h + 8);
  ctx.lineCap = 'round';
  for (const [dx, wd, k, a1] of [[15, 8, 0.6, 0.95], [30, 3, 0.75, 0.6]]) {
    ctx.strokeStyle = alpha(lighten(glass, 0.75), k); ctx.lineWidth = wd;
    ctx.beginPath(); ctx.moveTo(x - rx + dx, py - 22); ctx.lineTo(x - rx + dx, sideTop);
    ctx.ellipse(x, sideTop, rx - dx, capR - dx, 0, Math.PI, Math.PI + a1); ctx.stroke();
  }
  ctx.fillStyle = alpha(lighten(glass, 0.8), 0.7); ellipse(ctx, x + rx * 0.42, top + capR * 0.3, 12, 6, 0.8); ctx.fill();
  ctx.restore();
  dome(); ctx.strokeStyle = alpha(darken(glass, 0.3), 0.95); ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = alpha(lighten(glass, 0.4), 0.8); ctx.lineWidth = 6;
  ctx.beginPath(); ctx.ellipse(x, py, rx + 2, pry, 0, 0.05, Math.PI - 0.05); ctx.stroke();
  // the knob
  solid(ctx, () => rr(ctx, x - 8, top - 14, 16, 16, 4), { x: x - 8, y: top - 14, w: 16, h: 16 }, mix(glass, c.labelMuted, 0.4), { lip: false, inner: false });
  ball(ctx, c, x, top - 22, 11, mix(glass, c.labelMuted, 0.35));
  // the outlet and the pump
  let outlet = null, pump = null;
  if (o.pump !== false) {
    const side = o.pumpSide === -1 ? -1 : 1, ph = ((((typeof o.pump === 'number' ? o.pump : 0)) % 1) + 1) % 1;
    outlet = { x: x + side * (prx + 10), y: py + th / 2 };
    rod(ctx, [{ x: x + side * (prx - 6), y: outlet.y }, outlet], 9, steel);
    const pX = x + side * (prx + (o.pumpGap ?? 96)), pwd = 48, pH = 112, pTop = y - pH;
    const inlet = { x: pX - side * (pwd / 2 + 2), y: y - 36 };
    rod(ctx, bez(outlet, { x: outlet.x + side * 50, y: outlet.y + 6 }, { x: inlet.x - side * 50, y: inlet.y }, inlet, 18), 11, mix(c.s6, c.bgDeep, 0.25));
    drawShadow(ctx, c, pX, y + 2, 50);
    solid(ctx, () => rr(ctx, pX - 46, y - 12, 92, 12, 4), { x: pX - 46, y: y - 12, w: 92, h: 12 }, dk, { lip: false });
    const bt = toneOf(c, o.pumpTone ?? 1);
    solid(ctx, () => rr(ctx, pX - pwd / 2, pTop, pwd, pH - 12, 10), { x: pX - pwd / 2, y: pTop, w: pwd, h: pH - 12 }, bt, { shade: 'right', lip: false });
    const gx = pX, gy = pTop + 36;
    ctx.beginPath(); ctx.arc(gx, gy, 15, 0, TAU); ctx.fillStyle = mix(c.bgSurface, c.label, 0.04); ctx.fill();
    ctx.strokeStyle = darken(bt, 0.45); ctx.lineWidth = 2.5; ctx.stroke();
    const na = -Math.PI * 0.8 + Math.PI * 0.6 * (0.5 - 0.5 * Math.cos(TAU * ph));
    ctx.strokeStyle = c.bad; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 11 * Math.cos(na), gy + 11 * Math.sin(na)); ctx.stroke();
    const rl = 18 + 44 * (0.5 + 0.5 * Math.cos(TAU * ph));
    rod(ctx, [{ x: pX, y: pTop + 4 }, { x: pX, y: pTop - rl }], 8, steel);
    solid(ctx, () => rr(ctx, pX - pwd / 2 - 4, pTop - 6, pwd + 8, 10, 4), { x: pX - pwd / 2 - 4, y: pTop - 6, w: pwd + 8, h: 10 }, darken(bt, 0.25), { lip: false, inner: false });
    rod(ctx, [{ x: pX - 32, y: pTop - rl }, { x: pX + 32, y: pTop - rl }], 13, woodOf(c));
    pump = { x: pX, y, handle: { x: pX, y: pTop - rl } };
  }
  ctx.restore();
  const ix = x - rx + 12, iy = top + 14, iw = 2 * rx - 24, ih = h - 24;
  const contains = (qx, qy) => qy < py - 6 && Math.abs(qx - x) < rx - 8 && (qy > sideTop || ((qx - x) / (rx - 8)) ** 2 + ((qy - sideTop) / (capR - 8)) ** 2 < 1);
  return { interior: { x: ix, y: iy, w: iw, h: ih, contains }, bell: G, strike: S, outlet, pump, wires, plate: { x, y: py } };
}

/**
 * drawPistonTube(ctx, c, o) -> { interior, face, tube, handle }
 *   A long horizontal glass tube with a piston at the LEFT end (book Fig 10.9): piston
 *   disc with two seal bands, a rod out of the left end and a T handle.
 *   o: { x (left end), y (tube centre line), len = 540, d = 110 (inside height), wall = 10,
 *        pos = 60 (piston face, px from the left end), rod = 140, open = true (far end) }
 *   interior: { x, y, w, h } the air in front of the piston (for air dots); face: x.
 *   Glass: pale fill, a light stripe along the top inside, a shade line along the bottom
 *   inside, thick rims at both ends. Piston: steel disc with a lit face and a rubber seal
 *   ring; shaped wooden handle (grip with two knobs). hand: { x, y } where a SimFigure hand
 *   grips the handle (also handle, kept for old callers).
 */
export function drawPistonTube(ctx, c, o = {}) {
  const x = o.x ?? 60, y = o.y ?? 260, len = o.len ?? 540, d = o.d ?? 110, wall = o.wall ?? 10;
  const pos = Math.max(24, Math.min(len - 10, o.pos ?? 60)), rodL = o.rod ?? 140;
  const glass = c.glass, steel = steelOf(c), top = y - d / 2, face = x + pos, pt = 20;
  ctx.save();
  ctx.fillStyle = alpha(glass, 0.14); ctx.fillRect(x, top, len, d);
  ctx.fillStyle = alpha(lighten(glass, 0.7), 0.55); ctx.fillRect(x + 8, top + 4, len - 16, 5);
  ctx.fillStyle = alpha(lighten(glass, 0.8), 0.35); ctx.fillRect(x + 8, top + 11, len - 16, 2);
  ctx.fillStyle = alpha(darken(glass, 0.35), 0.4); ctx.fillRect(x + 6, top + d - 7, len - 12, 4);
  const hx = face - pt - rodL, wood = woodOf(c);
  rod(ctx, [{ x: hx, y }, { x: face - pt + 2, y }], 10, steel);
  rod(ctx, [{ x: face - pt - 10, y }, { x: face - pt + 1, y }], 18, darken(steel, 0.1));
  // the handle: a turned wooden grip across the rod, fatter in the middle, a knob at each end
  rod(ctx, Array.from({ length: 11 }, (_, i) => ({ x: hx - 9, y: y - 32 + i * 6.4 })), (u) => 15 + 6 * Math.sin(Math.PI * u), wood);
  for (const s of [-1, 1]) ball(ctx, c, hx - 9, y + s * 36, 8, darken(wood, 0.08));
  rod(ctx, [{ x: hx - 2, y }, { x: hx + 8, y }], 14, darken(steel, 0.15));
  solid(ctx, () => rr(ctx, face - pt, top + 1, pt, d - 2, 5), { x: face - pt, y: top + 1, w: pt, h: d - 2 }, steel, { shade: 'right', lip: false });
  ctx.fillStyle = alpha(lighten(steel, 0.5), 0.9); ctx.fillRect(face - 4, top + 4, 2.5, d - 8);
  for (const k of [0.22, 0.62]) {
    const sx = face - pt + pt * k, rb = rubberOf(c);
    rr(ctx, sx - 3, top - 1, 6, d + 2, 3); ctx.fillStyle = rb; ctx.fill();
    ctx.fillStyle = alpha(lighten(rb, 0.5), 0.7); ctx.fillRect(sx - 2, top + 2, 1.5, d - 4);
  }
  for (const wy of [top - wall, y + d / 2]) {
    rr(ctx, x, wy, len, wall, 3); ctx.fillStyle = alpha(glass, 0.55); ctx.fill();
    ctx.fillStyle = alpha(darken(glass, 0.25), 0.55); ctx.fillRect(x + 3, wy + wall - 3.5, len - 6, 2.5);
    ctx.fillStyle = alpha(lighten(glass, 0.65), 0.9); ctx.fillRect(x + 5, wy + 2, len - 10, 2.5);
    rr(ctx, x, wy, len, wall, 3); ctx.strokeStyle = alpha(darken(glass, 0.38), 0.95); ctx.lineWidth = 2.2; ctx.stroke();
  }
  const endRim = (ex) => {
    ellipse(ctx, ex, y, 7, d / 2 + wall); ctx.strokeStyle = alpha(darken(glass, 0.42), 0.95); ctx.lineWidth = 6; ctx.stroke();
    ellipse(ctx, ex, y, 7, d / 2 + wall); ctx.strokeStyle = alpha(lighten(glass, 0.55), 0.9); ctx.lineWidth = 2.2; ctx.stroke();
  };
  endRim(x);
  if (o.open !== false) endRim(x + len);
  else solid(ctx, () => rr(ctx, x + len - 4, top - wall, 12, d + 2 * wall, 4), { x: x + len - 4, y: top - wall, w: 12, h: d + 2 * wall }, mix(glass, c.labelMuted, 0.4), { lip: false, inner: false });
  ctx.restore();
  return { interior: { x: face, y: top, w: x + len - face, h: d }, face, tube: { x, y: top, w: len, h: d }, handle: { x: hx - 8, y }, hand: { x: hx - 9, y: y + 4 } };
}

/**
 * drawSpeaker(ctx, c, o) -> { cone: { x, y, r }, wireIn, box }
 *   A loudspeaker cabinet with a round cone, a rubber surround and a dust cap (book Fig
 *   10.15b). o: { x, y (cone centre), r = 64 (cone radius), cone = 0 (-1..1 the cone's
 *   offset along its axis: its vibration), facing = 1 (1 right, -1 left), cutaway = false
 *   (side section: cone, voice coil and magnet inside the cabinet), tone (cabinet) }
 *   cone: the centre of the cone mouth (moves with o.cone): start SimWave arcs there.
 */
export function drawSpeaker(ctx, c, o = {}) {
  const x = o.x ?? 520, y = o.y ?? 250, r = o.r ?? 64, f = o.facing === -1 ? -1 : 1, cone = Math.max(-1, Math.min(1, o.cone ?? 0));
  const rub = rubberOf(c), steel = steelOf(c), cab = o.tone != null ? toneOf(c, o.tone) : woodOf(c);
  const paper = mix(c.labelMuted, rub, 0.45);
  const bh = r * 3.2, by = y - r * 1.35;
  ctx.save();
  if (!o.cutaway) {
    const bw = r * 2.4, bx = x - bw / 2, dep = r * 0.42, xe = x - (f * bw) / 2;
    drawShadow(ctx, c, x - f * dep * 0.5, by + bh + 2, bw * 0.62);
    ctx.beginPath(); ctx.moveTo(xe, by + 8); ctx.lineTo(xe - f * dep, by - dep * 0.45 + 8); ctx.lineTo(xe - f * dep, by + bh - dep * 0.45 - 4); ctx.lineTo(xe, by + bh);
    ctx.closePath(); ctx.fillStyle = darken(cab, 0.28); ctx.fill(); ctx.strokeStyle = darken(cab, 0.55); ctx.lineWidth = 2.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + 8, by); ctx.lineTo(bx + bw - 8, by); ctx.lineTo(bx + bw - 8 - f * dep, by - dep * 0.45); ctx.lineTo(bx + 8 - f * dep, by - dep * 0.45);
    ctx.closePath(); ctx.fillStyle = lighten(cab, 0.14); ctx.fill(); ctx.stroke();
    solid(ctx, () => rr(ctx, bx, by, bw, bh, 10), { x: bx, y: by, w: bw, h: bh }, cab, { lip: false, inner: false, shade: 'right', rim: darken(cab, 0.55) });
    const crx = r * 0.86, k = cone * r * 0.14 * f, cs = 1 + cone * 0.1;
    ellipse(ctx, x, y, crx + 8, r + 8); ctx.strokeStyle = steel; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = darken(steel, 0.45); ctx.lineWidth = 1.5; ellipse(ctx, x, y, crx + 11, r + 11); ctx.stroke();
    for (const a of [0.8, 2.35, 3.95, 5.5]) ball(ctx, c, x + (crx + 8) * Math.cos(a), y + (r + 8) * Math.sin(a), 3.5, steel);
    ellipse(ctx, x, y, crx, r); ctx.fillStyle = darken(rub, 0.1); ctx.fill();
    // the surround: a rubber roll, lit top-left
    ellipse(ctx, x + k * 0.3, y, crx * 0.93, r * 0.93); ctx.strokeStyle = lighten(rub, 0.18); ctx.lineWidth = r * 0.12; ctx.stroke();
    ctx.strokeStyle = alpha(lighten(rub, 0.6), 0.6); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(x + k * 0.3, y, crx * 0.93, r * 0.93, 0, Math.PI * 1.05, Math.PI * 1.5); ctx.stroke();
    // the cone: a paper funnel, light upper-left wall, shaded lower-right wall, radial pleats into the cap
    const cx2 = x + k * 0.6, cr = crx * 0.86 * cs, cR = r * 0.86 * cs;
    ellipse(ctx, cx2, y, cr, cR); ctx.fillStyle = paper; ctx.fill();
    ctx.save(); ellipse(ctx, cx2, y, cr, cR); ctx.clip();
    const gx = ctx.createLinearGradient(cx2 - cr, y - cR, cx2 + cr, y + cR);
    gx.addColorStop(0, alpha(lighten(paper, 0.4), 0.85)); gx.addColorStop(0.5, alpha(paper, 0)); gx.addColorStop(1, alpha(darken(paper, 0.45), 0.9));
    ctx.fillStyle = gx; ctx.fillRect(cx2 - cr, y - cR, 2 * cr, 2 * cR);
    const gr = ctx.createRadialGradient(x + k, y, crx * 0.2, x + k, y, cr);
    gr.addColorStop(0, alpha(darken(paper, 0.5), 0.75)); gr.addColorStop(0.45, alpha(darken(paper, 0.3), 0.2)); gr.addColorStop(1, alpha(paper, 0));
    ctx.fillStyle = gr; ctx.fillRect(cx2 - cr, y - cR, 2 * cr, 2 * cR);
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      ctx.strokeStyle = alpha(ca + sa < 0 ? lighten(paper, 0.5) : darken(paper, 0.45), 0.4);
      ctx.beginPath(); ctx.moveTo(x + k + ca * crx * 0.3, y + sa * r * 0.3); ctx.lineTo(cx2 + ca * cr, y + sa * cR); ctx.stroke();
    }
    ctx.restore();
    ellipse(ctx, cx2, y, cr, cR); ctx.strokeStyle = darken(paper, 0.5); ctx.lineWidth = 2; ctx.stroke();
    // the dust cap: a lit dome
    ball(ctx, c, x + k, y, crx * 0.27 * cs, lighten(rub, 0.22));
    ellipse(ctx, x, by + bh - r * 0.42, r * 0.3, r * 0.2); ctx.fillStyle = darken(cab, 0.6); ctx.fill();
    ctx.strokeStyle = darken(cab, 0.6); ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    return { cone: { x: x + k, y, r }, wireIn: { x: xe - f * dep * 0.5, y: by + bh - 18 }, box: { x: Math.min(bx, xe - f * dep) - 2, y: by - dep * 0.45, w: bw + dep + 4, h: bh + dep * 0.45 } };
  }
  // cutaway: a side section of the cabinet; cone axis along x, mouth at x
  const bd = r * 1.7, x0 = Math.min(x, x - f * bd), wl = 10, k = cone * r * 0.18 * f;
  drawShadow(ctx, c, x - f * bd * 0.5, by + bh + 2, bd * 0.62);
  solid(ctx, () => rr(ctx, x0 - (f > 0 ? 0 : wl), by, bd + wl, bh, 8), { x: x0 - (f > 0 ? 0 : wl), y: by, w: bd + wl, h: bh }, cab, { lip: false, inner: false, rim: darken(cab, 0.55) });
  ctx.fillStyle = darken(cab, 0.45);
  ctx.fillRect(x0 + (f > 0 ? wl : 0), by + wl, bd - wl, bh - 2 * wl);
  ctx.strokeStyle = alpha(darken(cab, 0.7), 0.5); ctx.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) { const yy = by + 6 + i * (bh / 9); ctx.beginPath(); ctx.moveTo(x - f * 2, yy); ctx.lineTo(x - f * 8, yy + 6); ctx.stroke(); }
  ctx.fillStyle = mix(c.bgDeep, c.bgSurface, 0.5);
  ctx.fillRect(x - (f > 0 ? wl : 0) - 1, y - r - 4, wl + 2, 2 * r + 8);
  const ax = x + k - f * r * 0.62, mx = ax - f * r * 0.22;
  const mw = r * 0.5, mh = r * 0.95, mX = f > 0 ? mx - mw : mx;
  solid(ctx, () => rr(ctx, mX, y - mh / 2, mw, mh, 5), { x: mX, y: y - mh / 2, w: mw, h: mh }, darken(steel, 0.5), { lip: false });
  ctx.fillStyle = darken(steel, 0.75); ctx.fillRect(mX + mw * 0.15, y - r * 0.08, mw * 0.7, r * 0.16);
  for (const s of [-1, 1]) {
    ctx.strokeStyle = darken(steel, 0.2); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x - f * 4, y + s * (r + 2)); ctx.lineTo(mx, y + s * mh * 0.45); ctx.stroke();
  }
  const cw = r * 0.2;
  solid(ctx, () => rr(ctx, f > 0 ? ax - cw : ax, y - r * 0.24, cw, r * 0.48, 3), { x: f > 0 ? ax - cw : ax, y: y - r * 0.24, w: cw, h: r * 0.48 }, copper(c), { lip: false, inner: false });
  // the cone in section: a solid paper V, upper wall lit, lower wall in shade, opening at the mouth
  const vPath = () => { ctx.beginPath(); ctx.moveTo(x + k, y - r * 0.92); ctx.lineTo(ax, y - r * 0.22); ctx.lineTo(ax, y + r * 0.22); ctx.lineTo(x + k, y + r * 0.92); ctx.closePath(); };
  vPath(); ctx.fillStyle = alpha(mix(c.bgDeep, c.bgSurface, 0.6), 0.92); ctx.fill();
  ctx.save(); vPath(); ctx.clip();
  ctx.fillStyle = alpha(darken(paper, 0.2), 0.35); ctx.fillRect(Math.min(x + k, ax) - 2, y, Math.abs(ax - x - k) + 4, r);
  ctx.restore();
  rod(ctx, [{ x: x + k, y: y - r * 0.92 }, { x: ax, y: y - r * 0.22 }], 9, lighten(paper, 0.15));
  rod(ctx, [{ x: x + k, y: y + r * 0.92 }, { x: ax, y: y + r * 0.22 }], 9, darken(paper, 0.12));
  for (const s of [-1, 1]) {
    ctx.strokeStyle = lighten(rub, 0.05); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x + k * 0.5, y + s * (r * 0.92 + 5), 6, f > 0 ? -Math.PI / 2 : Math.PI / 2, f > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(ax, y, r * 0.22, f > 0 ? -Math.PI / 2 : Math.PI / 2, f > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.closePath();
  ctx.fillStyle = lighten(rub, 0.2); ctx.fill(); ctx.strokeStyle = darken(rub, 0.4); ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  return { cone: { x: x + k, y, r }, wireIn: { x: x - f * bd * 0.85, y: by + bh - 14 }, box: { x: x0 - wl, y: by, w: bd + 2 * wl, h: bh } };
}
const copper = (c) => mix(c.s8, c.bad, 0.3);

/**
 * drawMicrophone(ctx, c, o) -> { diaphragm, normal, grille, wireOut, grip }
 *   A handheld microphone (book Fig 10.15a): round mesh grille, a collar, a tapered
 *   handle, a cable nub at the end. o: { x, y (grille centre), r = 28 (grille radius),
 *   len = 150 (handle), facing = -1 (the way it points: -1 left, 1 right), tilt = 0.45
 *   (radians the grille end is raised), cutaway = false (the front of the grille cut
 *   away: the thin diaphragm and the coil behind it), diaphragm = 0 (-1..1 its offset
 *   along the axis), stand = false (a short desk stand under the handle), standY }
 *   diaphragm: its centre; normal: the unit axis the mic points along.
 */
export function drawMicrophone(ctx, c, o = {}) {
  const x = o.x ?? 140, y = o.y ?? 240, r = o.r ?? 28, len = o.len ?? 150, f = o.facing === 1 ? 1 : -1, tilt = o.tilt ?? 0.45;
  const px = f * Math.cos(tilt), py = -Math.sin(tilt), qx = -py, qy = px;
  const steel = steelOf(c), dk = darken(steel, 0.45), dia = Math.max(-1, Math.min(1, o.diaphragm ?? 0));
  const h0 = { x: x - px * r * 0.8, y: y - py * r * 0.8 }, h1 = { x: x - px * (r * 0.8 + len), y: y - py * (r * 0.8 + len) };
  const hm = { x: (h0.x + h1.x) / 2, y: (h0.y + h1.y) / 2 };
  ctx.save();
  if (o.stand) {
    const sy = o.standY ?? hm.y + 90;
    drawShadow(ctx, c, hm.x, sy + 2, 44);
    rod(ctx, [hm, { x: hm.x, y: sy - 8 }], 7, dk);
    solid(ctx, () => { ctx.beginPath(); ctx.ellipse(hm.x, sy - 6, 40, 9, 0, 0, TAU); }, { x: hm.x - 40, y: sy - 15, w: 80, h: 18 }, dk, { lip: 4 });
  }
  const wireOut = { x: h1.x - px * 10, y: h1.y - py * 10 };
  rod(ctx, [h1, wireOut], 8, rubberOf(c));
  rod(ctx, [h0, h1], (s) => r * (1.2 - 0.52 * s), darken(steel, 0.06));
  rod(ctx, [{ x: h1.x + px * 22, y: h1.y + py * 22 }, { x: h1.x + px * 8, y: h1.y + py * 8 }], r * 0.7, rubberOf(c));
  if (o.stand) rod(ctx, [{ x: hm.x - qx * r * 0.5, y: hm.y - qy * r * 0.5 }, { x: hm.x + qx * r * 0.5, y: hm.y + qy * r * 0.5 }], 10, dk);
  rod(ctx, [{ x: h0.x - px * 6, y: h0.y - py * 6 }, { x: h0.x + px * 6, y: h0.y + py * 6 }], r * 1.42, darken(steel, 0.3));
  const mesh = (k) => {
    ctx.strokeStyle = alpha(darken(steel, 0.5), k); ctx.lineWidth = 1.4;
    for (let s = -r; s <= r; s += r * 0.2) {
      ctx.beginPath(); ctx.moveTo(x + s - r, y - r); ctx.lineTo(x + s + r, y + r); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + s + r, y - r); ctx.lineTo(x + s - r, y + r); ctx.stroke();
    }
  };
  let D = { x, y };
  if (!o.cutaway) {
    ball(ctx, c, x, y, r, lighten(steel, 0.1));
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r - 1, 0, TAU); ctx.clip(); mesh(0.55); ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = darken(steel, 0.45); ctx.lineWidth = 2.5; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = darken(steel, 0.6); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r - 1, 0, TAU); ctx.clip();
    ctx.beginPath(); ctx.rect(x - 2 * r, y - 2 * r, 4 * r, 4 * r); ctx.clip(); mesh(0.35); ctx.restore();
    D = { x: x + px * (r * 0.12 + dia * r * 0.14), y: y + py * (r * 0.12 + dia * r * 0.14) };
    rod(ctx, [{ x: D.x - px * r * 0.16, y: D.y - py * r * 0.16 }, { x: D.x - px * r * 0.6, y: D.y - py * r * 0.6 }], r * 0.5, copper(c));
    const e1 = { x: D.x - qx * r * 0.86, y: D.y - qy * r * 0.86 }, e2 = { x: D.x + qx * r * 0.86, y: D.y + qy * r * 0.86 };
    const cp = { x: D.x + px * dia * r * 0.3, y: D.y + py * dia * r * 0.3 };
    for (const [col, wd] of [[darken(c.accent, 0.45), 8], [c.accent, 4.5]]) {
      ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(e1.x, e1.y); ctx.quadraticCurveTo(cp.x, cp.y, e2.x, e2.y); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = steel; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = darken(steel, 0.45); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, TAU); ctx.stroke();
  }
  ctx.restore();
  return { diaphragm: D, normal: { x: px, y: py }, grille: { x, y, r }, wireOut, grip: hm };
}

/**
 * drawSignalWire(ctx, c, o) -> { at(u), mid, strip }
 *   A cable from a to b (a gentle sag) with the electrical signal riding on a strip
 *   beside it: "sound -> mic -> signal -> speaker -> sound".
 *   o: { a: {x,y}, b: {x,y}, sag = 40, t = 0, amp = 9 (px), cycles = 4 (along the wire),
 *        speed = 1 (cycles per s travelling a -> b), trace(u, t) -> -1..1 (replaces the sine),
 *        strip = true, offset = amp + 16 (strip centre above the wire), tone = 'accent',
 *        label, size = 26, style = 'trace' | 'pulse' }
 *   style 'pulse': no strip; the signal travels INSIDE the wire as bright pulses (the wire
 *   glows where the signal is high, one bead per crest; spacing from cycles / trace).
 */
export function drawSignalWire(ctx, c, o = {}) {
  const a = o.a ?? { x: 160, y: 300 }, b = o.b ?? { x: 480, y: 300 }, sag = o.sag ?? 40, t = o.t ?? 0;
  const amp = o.amp ?? 9, cyc = o.cycles ?? 4, sp = o.speed ?? 1, tone = toneOf(c, o.tone ?? 'accent');
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + sag };
  const at = (u) => ({ x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * m.x + u * u * b.x, y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * m.y + u * u * b.y });
  const nrm = (u) => {
    const dx = 2 * (1 - u) * (m.x - a.x) + 2 * u * (b.x - m.x), dy = 2 * (1 - u) * (m.y - a.y) + 2 * u * (b.y - m.y), l = Math.hypot(dx, dy) || 1;
    return dx / l >= 0 ? { x: dy / l, y: -dx / l } : { x: -dy / l, y: dx / l };
  };
  const N = 60, P = [], S = [], Q = [], off = o.offset ?? amp + 16;
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = at(u), n = nrm(u), v = o.trace ? o.trace(u, t) : Math.sin(TAU * (cyc * u - sp * t));
    P.push(p); S.push({ x: p.x + n.x * off, y: p.y + n.y * off }); Q.push({ x: p.x + n.x * (off + v * amp), y: p.y + n.y * (off + v * amp) });
  }
  ctx.save();
  rod(ctx, P, 7, rubberOf(c));
  const pulse = o.style === 'pulse';
  if (pulse) {
    const V = P.map((_, i) => { const u = i / N; return o.trace ? o.trace(u, t) : Math.sin(TAU * (cyc * u - sp * t)); });
    ctx.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const g = Math.max(0, (V[i] + V[i + 1]) / 2) ** 2;
      if (g < 0.03) continue;
      ctx.beginPath(); ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[i + 1].x, P[i + 1].y);
      ctx.strokeStyle = alpha(tone, 0.28 * g); ctx.lineWidth = 16; ctx.stroke();
      ctx.strokeStyle = alpha(lighten(tone, 0.35), 0.95 * g); ctx.lineWidth = 4.5; ctx.stroke();
    }
    for (let i = 1; i < N; i++) {
      if (!(V[i] > 0.6 && V[i] >= V[i - 1] && V[i] > V[i + 1])) continue;
      ctx.beginPath(); ctx.arc(P[i].x, P[i].y, 7.5, 0, TAU); ctx.fillStyle = darken(tone, 0.3); ctx.fill();
      ctx.beginPath(); ctx.arc(P[i].x, P[i].y, 5.5, 0, TAU); ctx.fillStyle = lighten(tone, 0.25); ctx.fill();
      ctx.beginPath(); ctx.arc(P[i].x - 1.6, P[i].y - 1.6, 2.2, 0, TAU); ctx.fillStyle = alpha(lighten(tone, 0.8), 0.95); ctx.fill();
    }
  }
  if (!pulse && o.strip !== false) {
    const band = bandOf(ctx, S, 2 * amp + 14);
    band(); ctx.fillStyle = alpha(tone, 0.13); ctx.fill(); ctx.strokeStyle = alpha(tone, 0.45); ctx.lineWidth = 2; ctx.stroke();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    polyline(ctx, Q); ctx.strokeStyle = darken(tone, 0.35); ctx.lineWidth = 6; ctx.stroke();
    polyline(ctx, Q); ctx.strokeStyle = tone; ctx.lineWidth = 3.5; ctx.stroke();
  }
  if (o.label) { const p = S[N >> 1], n = nrm(0.5); label(ctx, c, o.label, p.x + n.x * (amp + 10 + (o.size ?? 26) * 0.6), p.y + n.y * (amp + 10 + (o.size ?? 26) * 0.6), o.size ?? 26); }
  ctx.restore();
  return { at, mid: at(0.5), strip: { at: (u) => { const p = at(u), n = nrm(u); return { x: p.x + n.x * off, y: p.y + n.y * off }; } } };
}

/**
 * drawStopwatch(ctx, c, o) -> { center, tip, readout, box }
 *   A round stopwatch: steel case, crown button with a bow ring, a side pusher, a dial
 *   with 60 ticks (12 long), one hand, and a readout box below (or inside) with caller text.
 *   o: { x, y (dial centre), r = 62, seconds = 0, dialSeconds = 60 (one turn of the hand),
 *        text (default seconds to 2 places + ' s', e.g. '0.10 s'), readout = 'below' |
 *        'inside' | false, size = 26, tone (case) }
 */
export function drawStopwatch(ctx, c, o = {}) {
  const x = o.x ?? 540, y = o.y ?? 220, r = o.r ?? 62, sec = o.seconds ?? 0, per = o.dialSeconds ?? 60, size = o.size ?? 26;
  const steel = o.tone != null ? toneOf(c, o.tone) : steelOf(c);
  ctx.save();
  ctx.strokeStyle = darken(steel, 0.2); ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(x, y - r - 30, 11, 0, TAU); ctx.stroke();
  ctx.strokeStyle = alpha(lighten(steel, 0.5), 0.8); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - r - 30, 11, Math.PI, Math.PI * 1.6); ctx.stroke();
  solid(ctx, () => rr(ctx, x - 7, y - r - 14, 14, 18, 3), { x: x - 7, y: y - r - 14, w: 14, h: 18 }, darken(steel, 0.1), { lip: false, inner: false });
  solid(ctx, () => rr(ctx, x - 14, y - r - 22, 28, 12, 4), { x: x - 14, y: y - r - 22, w: 28, h: 12 }, steel, { lip: false, inner: false });
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
  solid(ctx, () => rr(ctx, -7, -r - 12, 14, 16, 3), { x: -7, y: -r - 12, w: 14, h: 16 }, steel, { lip: false, inner: false });
  ctx.restore();
  ball(ctx, c, x, y, r, steel);
  const fr = r * 0.82;
  ctx.beginPath(); ctx.arc(x, y, fr, 0, TAU); ctx.fillStyle = mix(c.bgSurface, c.label, 0.03); ctx.fill();
  ctx.strokeStyle = darken(steel, 0.4); ctx.lineWidth = 2.5; ctx.stroke();
  ctx.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const a = (TAU * i) / 60 - Math.PI / 2, big = i % 5 === 0, l = fr * (big ? 0.16 : 0.08);
    ctx.strokeStyle = big ? c.label : c.labelMuted; ctx.lineWidth = big ? 3 : 1.5;
    ctx.beginPath(); ctx.moveTo(x + (fr - 5) * Math.cos(a), y + (fr - 5) * Math.sin(a)); ctx.lineTo(x + (fr - 5 - l) * Math.cos(a), y + (fr - 5 - l) * Math.sin(a)); ctx.stroke();
  }
  const ha = (TAU * sec) / per - Math.PI / 2, tip = { x: x + fr * 0.82 * Math.cos(ha), y: y + fr * 0.82 * Math.sin(ha) };
  ctx.strokeStyle = darken(c.bad, 0.3); ctx.lineWidth = 5.5;
  ctx.beginPath(); ctx.moveTo(x - fr * 0.2 * Math.cos(ha), y - fr * 0.2 * Math.sin(ha)); ctx.lineTo(tip.x, tip.y); ctx.stroke();
  ctx.strokeStyle = c.bad; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x - fr * 0.2 * Math.cos(ha), y - fr * 0.2 * Math.sin(ha)); ctx.lineTo(tip.x, tip.y); ctx.stroke();
  ball(ctx, c, x, y, 6, c.bad);
  let readout = null;
  const text = o.text ?? sec.toFixed(2) + ' s';
  if (o.readout !== false) {
    ctx.font = font(c, 700, size, true);
    const tw = ctx.measureText(text).width, bw = Math.max(r * 1.4, tw + 28), bhh = size + 16;
    const inside = o.readout === 'inside', ry = inside ? y + fr * 0.32 : y + r + 14;
    readout = { x: x - bw / 2, y: ry, w: bw, h: bhh };
    if (!inside) {
      rr(ctx, readout.x, ry + 4, bw, bhh, 10); ctx.fillStyle = darken(c.stroke, 0.3); ctx.fill();
      rr(ctx, readout.x, ry, bw, bhh, 10); ctx.fillStyle = c.raised; ctx.fill();
      ctx.strokeStyle = c.stroke; ctx.lineWidth = 2.5; ctx.stroke();
    }
    label(ctx, c, text, x, ry + bhh / 2 + 1, size, { halo: inside });
  }
  ctx.restore();
  const bot = readout ? readout.y + readout.h + 4 : y + r;
  return { center: { x, y }, tip, readout, box: { x: x - Math.max(r, readout ? readout.w / 2 : 0), y: y - r - 42, w: 2 * Math.max(r, readout ? readout.w / 2 : 0), h: bot - (y - r - 42) } };
}
