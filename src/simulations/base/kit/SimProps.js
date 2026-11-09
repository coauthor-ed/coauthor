/**
 * SimProps - apparatus props for physics-style canvas scenes on ONE ground line
 * and ONE scale: a cart, a block, a ramp, a pulley, a spring balance, the
 * ground. Lifted from the best course-local kit (PhysicsSceneKit) and themed
 * from the scene's colours, so every prop in a scene agrees on where the
 * ground is and how big a metre is. Each draw returns the prop's box (and
 * anchors) so arrows and labels attach to it instead of guessing pixels.
 *
 *   const rig = propRig({ x0: 40, x1: 640, groundY: 400, scale: 60 });   scale: px per unit
 *   rig.x(m)                       unit -> design px along the ground
 *   drawGround(ctx, c, rig, { kind: 'solid' | 'ice' | 'rough' | 'table' })
 *   drawCart(ctx, c, rig, m, { w, h, tone, wheelAngle, label })    -> box + { top: {x,y}, left, right }
 *   drawBlock(ctx, c, rig, m, { w, h, tone, label, y })            -> box (y: bottom edge, default the ground)
 *   drawRamp(ctx, c, rig, { from, to, rise })  -> { surface(t) -> { x, y, angle }, angle } t in 0..1 up the slope
 *   drawPulley(ctx, c, x, y, r)                                    -> { x, y, r, top, left, right }
 *   drawSpringBalance(ctx, c, x, y, { reading, max, len, tone })   -> box; hook at (x, box.y0 + box.h)
 * Seats and a bicycle, sized from the person who uses them (forHeight px, build;
 * see SimFigure figureMetrics), each returning the anchors the figure takes:
 *   drawChair(ctx, c, { x, y, forHeight, build, facing, view, tone })   -> { seat, box, back }
 *   drawSeatBench(ctx, c, { x0, x1, y, forHeight, build, tone })     -> { y, seat(x), box }
 *   drawDesk(ctx, c, { x0, x1, y, forHeight, build, view, tone })     -> { top, box, hands(x, facing) }
 *   bicycleRig({ x, y, forHeight, build, facing, dist, view }) -> rig (pure; rig.rider is the figure spec part)
 *   drawBicycle(ctx, c, rig | opts, { part: 'all' | 'back' | 'front' })   -> rig; wheels turn with dist
 *     const bike = bicycleRig({ x, y: GROUND, forHeight: 160, facing: 1, dist });
 *     drawFigure(ctx, c, { ...bike.rider, pose: 'cycle' }, look,
 *       { behind: () => drawBicycle(ctx, c, bike, { part: 'back' }), between: () => drawBicycle(ctx, c, bike, { part: 'front' }) });
 *   SimLook's drawBench is a table top to stand things on; drawSeatBench is for sitting.
 * tone: 'accent' | 'good' | ... | 1..8 (series), resolved against the scene's colours. ASCII only.
 */
import { MIN_PX, rr, ellipse, darken, lighten, alpha, font, mix, inkOn, hsl, hslOf, drawShadow } from './SimLook.js';
import { figureMetrics } from './SimFigure.js';

const TAU = Math.PI * 2;
const toneOf = (c, t = 'accent') => (typeof t === 'number' ? c['s' + (((Math.max(1, t | 0) - 1) % 8) + 1)] : (c[t] ?? t));

export function propRig(o = {}) {
  const x0 = o.x0 ?? 40, x1 = o.x1 ?? 640, groundY = o.groundY ?? 400, scale = o.scale ?? 60;
  return { x0, x1, groundY, scale, x: (m) => x0 + m * scale };
}

// The apparatus look (Quill card rule 3): flat fill, one cushion shade on the side away from the top-left
// key light, one highlight bean, a darker rim, a contact shadow under anything standing. No hairlines.
const neutralOf = (c) => mix(c.bgSurface, c.label, 0.22);                       // metal, stone, a case
const groundOf = (c) => mix(c.setGround ?? mix(c.bgSurface, c.label, 0.16), c.label, 0.1);   // the setting's ground tone, a step lighter so the slab reads on it

// A body with the recipe: shade band low, highlight bean top left, rim. Path drawn by `path()`.
function body(ctx, path, x, y, w, h, col, o = {}) {
  const rim = o.rim ?? darken(col, 0.3);
  if (o.lip !== false) { ctx.save(); ctx.translate(0, Math.min(5, h * 0.12)); path(); ctx.fillStyle = darken(col, 0.42); ctx.fill(); ctx.restore(); }
  path(); ctx.fillStyle = col; ctx.fill();
  ctx.save();
  path(); ctx.clip();
  ctx.fillStyle = darken(col, 0.18);                                              // cushion shade: the lower part, away from the light
  ctx.fillRect(x - 2, y + h * (o.shadeFrom ?? 0.62), w + 4, h);
  ctx.fillStyle = alpha(lighten(col, 0.35), 0.9);                                 // highlight bean
  ellipse(ctx, x + w * 0.22, y + h * 0.2, w * 0.14, h * 0.07 + 1.5);
  ctx.fill();
  ctx.restore();
  path(); ctx.strokeStyle = rim; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
}

export function drawGround(ctx, c, rig, o = {}) {
  const kind = o.kind ?? 'solid', y = rig.groundY, { x0, x1 } = rig, w = x1 - x0;
  const base = kind === 'ice' ? mix(c.water ?? c.accent, c.bgSurface, 0.6) : kind === 'table' ? darken(c.gold, 0.28) : groundOf(c);
  const h = kind === 'table' ? 26 : 18;
  ctx.save();
  // The slab: lit top lip, body, darker underside.
  rr(ctx, x0, y, w, h, 5); ctx.fillStyle = base; ctx.fill();
  ctx.save(); rr(ctx, x0, y, w, h, 5); ctx.clip();
  ctx.fillStyle = darken(base, 0.22); ctx.fillRect(x0, y + h * 0.6, w, h);
  ctx.fillStyle = alpha(lighten(base, 0.45), 0.9); ctx.fillRect(x0 + 4, y + 1.5, w - 8, 3);
  if (kind === 'rough') {                                                          // pebbles pressed into the surface
    ctx.fillStyle = darken(base, 0.35);
    for (let x = x0 + 10; x < x1 - 6; x += 17) { ellipse(ctx, x + ((x / 17) % 3) * 2, y + 9 + ((x / 17) % 2) * 3, 3.2, 2.1); ctx.fill(); }
  } else if (kind === 'solid') {                                                   // a few darker blocks, a kerb
    ctx.fillStyle = alpha(darken(base, 0.3), 0.55);
    for (let x = x0 + 26; x < x1 - 20; x += 64) ctx.fillRect(x, y + 6, 2.5, h - 6);
  } else if (kind === 'ice') {                                                     // glossy streaks
    ctx.fillStyle = alpha(lighten(base, 0.8), 0.7);
    for (const f of [0.18, 0.5, 0.78]) { const x = x0 + w * f; rr(ctx, x, y + 6, 36, 2.5, 1.25); ctx.fill(); }
  } else if (kind === 'table') {                                                   // wood grain, an apron shade
    ctx.strokeStyle = alpha(darken(base, 0.3), 0.4); ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const f of [0.1, 0.42, 0.7]) { const x = x0 + w * f; ctx.moveTo(x, y + 9); ctx.quadraticCurveTo(x + 40, y + 7, x + 80, y + 10); }
    ctx.stroke();
  }
  ctx.restore();
  rr(ctx, x0, y, w, h, 5); ctx.strokeStyle = darken(base, 0.35); ctx.lineWidth = 2.5; ctx.stroke();
  ctx.restore();
}

function wheel(ctx, c, x, y, r, ang) {
  const tyre = mix(c.bgDeep, c.label, 0.28), rimCol = mix(c.bgSurface, c.label, 0.35);
  ctx.beginPath(); ctx.arc(x, y + 2, r, 0, TAU); ctx.fillStyle = darken(tyre, 0.4); ctx.fill();   // contact lip
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = tyre; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, TAU); ctx.fillStyle = rimCol; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, TAU); ctx.clip();
  ctx.fillStyle = darken(rimCol, 0.2); ctx.fillRect(x - r, y + r * 0.2, r * 2, r);
  ctx.restore();
  ctx.strokeStyle = darken(rimCol, 0.35); ctx.lineWidth = Math.max(2, r * 0.18); ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 3; i++) { const a = ang + (i * TAU) / 3; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5); }
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.18, 0, TAU); ctx.fillStyle = lighten(rimCol, 0.3); ctx.fill();
  ctx.fillStyle = alpha(lighten(tyre, 0.5), 0.5);                                 // highlight on the tyre, top left
  ellipse(ctx, x - r * 0.45, y - r * 0.5, r * 0.28, r * 0.14, -0.7); ctx.fill();
}

function labelIn(ctx, c, text, cx, cy, fill) {
  if (text == null) return;
  const ink = inkOn(c, fill);
  ctx.save();
  ctx.font = font(c, 800, MIN_PX + 1);
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(text), cx, cy);
  ctx.restore();
}

export function drawCart(ctx, c, rig, m, o = {}) {
  const w = o.w ?? 110, h = o.h ?? 40, col = toneOf(c, o.tone), r = 11;
  const cx = rig.x(m), x = cx - w / 2, wy = rig.groundY - r, y = wy - r * 0.6 - h;
  ctx.save();
  drawShadow(ctx, c, cx, rig.groundY + 2, w * 0.5, 5, 0.9);
  body(ctx, () => rr(ctx, x, y, w, h, 9), x, y, w, h, col, { lip: false });
  ctx.fillStyle = alpha(lighten(col, 0.5), 0.6);                                  // the deck's top edge
  rr(ctx, x + 10, y + 2, w - 20, 2.5, 1.25); ctx.fill();
  ctx.fillStyle = darken(col, 0.3);                                               // axle mounts
  for (const f of [0.24, 0.76]) { rr(ctx, x + w * f - 7, y + h - 4, 14, r * 0.8 + 4, 3); ctx.fill(); }
  const ang = o.wheelAngle ?? 0;
  wheel(ctx, c, x + w * 0.24, wy, r, ang); wheel(ctx, c, x + w * 0.76, wy, r, ang);
  ctx.restore();
  labelIn(ctx, c, o.label, cx, y + h / 2, col);
  return { x0: x, y0: y, w, h, top: { x: cx, y }, left: { x, y: y + h / 2 }, right: { x: x + w, y: y + h / 2 } };
}

export function drawBlock(ctx, c, rig, m, o = {}) {
  const w = o.w ?? 70, h = o.h ?? 70, col = toneOf(c, o.tone), cx = rig.x(m), x = cx - w / 2;
  const y = (o.y ?? rig.groundY) - h;
  ctx.save();
  drawShadow(ctx, c, cx, y + h + 1, w * 0.5, 4, 0.8);
  body(ctx, () => rr(ctx, x, y, w, h, 8), x, y, w, h, col, { lip: false, shadeFrom: 0.7 });
  ctx.fillStyle = alpha(lighten(col, 0.45), 0.55);                                // the top face catches the light
  rr(ctx, x + 6, y + 3, w - 12, Math.max(3, h * 0.08), 2); ctx.fill();
  ctx.restore();
  labelIn(ctx, c, o.label, cx, y + h / 2, col);
  return { x0: x, y0: y, w, h, top: { x: cx, y }, left: { x, y: y + h / 2 }, right: { x: x + w, y: y + h / 2 } };
}

/** A wedge from ground level at `from` up to height `rise` px at `to` (units along the ground). */
export function drawRamp(ctx, c, rig, o = {}) {
  const xa = rig.x(o.from ?? 1), xb = rig.x(o.to ?? 6), rise = o.rise ?? 120, g = rig.groundY;
  const rising = xb >= xa, angle = Math.atan2(rise, Math.abs(xb - xa)) * (rising ? -1 : 1);
  const col = o.tone != null ? toneOf(c, o.tone) : neutralOf(c);
  const hx = rising ? xb : xa, lx = rising ? xa : xb;                               // high end, low end
  const path = () => { ctx.beginPath(); ctx.moveTo(lx, g); ctx.lineTo(hx, g); ctx.lineTo(hx, g - rise); ctx.closePath(); };
  ctx.save();
  path(); ctx.fillStyle = col; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.fillStyle = darken(col, 0.18); ctx.fillRect(Math.min(xa, xb) - 2, g - rise * 0.3, Math.abs(xb - xa) + 4, rise);   // shade low down
  ctx.fillStyle = darken(col, 0.3); ctx.fillRect(Math.min(xa, xb) - 2, g - 7, Math.abs(xb - xa) + 4, 9);                 // the underside
  ctx.restore();
  // The slope face catches the light: a lit strip just under the top edge.
  ctx.save(); path(); ctx.clip();
  ctx.strokeStyle = alpha(lighten(col, 0.45), 0.85); ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(lx, g - 1); ctx.lineTo(hx, g - rise - 1); ctx.stroke();
  ctx.restore();
  path(); ctx.strokeStyle = darken(col, 0.32); ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.restore();
  const sx = rising ? xa : xb, ex = rising ? xb : xa;
  return {
    angle: Math.abs(angle),
    surface: (t) => ({ x: sx + (ex - sx) * t, y: g - rise * t, angle }),
  };
}

export function drawPulley(ctx, c, x, y, r = 22) {
  const col = neutralOf(c), hub = lighten(col, 0.3);
  ctx.save();
  rr(ctx, x - r * 0.18, y - r - 14, r * 0.36, r + 14, r * 0.18); ctx.fillStyle = darken(col, 0.3); ctx.fill();   // the bracket it hangs from
  ctx.beginPath(); ctx.arc(x, y + 2.5, r, 0, TAU); ctx.fillStyle = darken(col, 0.42); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = col; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  ctx.fillStyle = darken(col, 0.18); ctx.fillRect(x - r, y + r * 0.3, r * 2, r);
  ctx.fillStyle = alpha(lighten(col, 0.4), 0.9); ellipse(ctx, x - r * 0.35, y - r * 0.4, r * 0.3, r * 0.14, -0.7); ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, TAU); ctx.strokeStyle = darken(col, 0.28); ctx.lineWidth = Math.max(2, r * 0.14); ctx.stroke();   // the groove
  ctx.beginPath(); ctx.arc(x, y, r * 0.26, 0, TAU); ctx.fillStyle = hub; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = darken(col, 0.32); ctx.lineWidth = 2.5; ctx.stroke();
  ctx.restore();
  return { x, y, r, top: { x, y: y - r }, left: { x: x - r, y }, right: { x: x + r, y } };
}

/** Hung from (x, y) downwards: coil, case with a scale, a needle. reading/max drive stretch and needle together. */
export function drawSpringBalance(ctx, c, x, y, o = {}) {
  const max = o.max ?? 10, k = Math.max(0, Math.min(1, (o.reading ?? 0) / max)), col = toneOf(c, o.tone);
  const coilH = 30 + k * 40, caseW = 34, caseH = 90, coilTop = y, coilBot = y + coilH;
  const metal = neutralOf(c), shell = c.bgSurface;
  ctx.save();
  // The coil: a shaded run under a lit one.
  const turns = 7;
  const coil = (dx, dy) => { ctx.beginPath(); ctx.moveTo(x + dx, coilTop + dy); for (let i = 1; i <= turns; i++) ctx.lineTo(x + dx + (i % 2 ? 9 : -9), coilTop + dy + (coilH * i) / (turns + 1)); ctx.lineTo(x + dx, coilBot + dy); ctx.stroke(); };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = darken(metal, 0.4); ctx.lineWidth = 4.5; coil(0, 1.5);
  ctx.strokeStyle = metal; ctx.lineWidth = 4; coil(0, 0);
  ctx.strokeStyle = alpha(lighten(metal, 0.5), 0.6); ctx.lineWidth = 1.5; coil(-1, -1);
  // The case: a rimmed shell with a lip and a scale window.
  rr(ctx, x - caseW / 2, coilBot + 4, caseW, caseH, 8); ctx.fillStyle = darken(metal, 0.3); ctx.fill();
  rr(ctx, x - caseW / 2, coilBot, caseW, caseH, 8); ctx.fillStyle = shell; ctx.fill();
  rr(ctx, x - caseW / 2 + 5, coilBot + 7, caseW - 10, caseH - 14, 4); ctx.fillStyle = mix(shell, c.bgDeep, 0.5); ctx.fill();
  rr(ctx, x - caseW / 2, coilBot, caseW, caseH, 8); ctx.strokeStyle = darken(metal, 0.2); ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = c.labelMuted; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 5; i++) { const ty = coilBot + 12 + i * 12; ctx.moveTo(x - caseW / 2 + 8, ty); ctx.lineTo(x - caseW / 2 + (i % 5 ? 13 : 18), ty); }
  ctx.stroke();
  const ny = coilBot + 12 + k * 60;
  ctx.beginPath(); ctx.moveTo(x - caseW / 2 + 7, ny); ctx.lineTo(x + caseW / 2 - 7, ny);
  ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke();
  ctx.beginPath(); ctx.arc(x + caseW / 2 - 9, ny, 3.5, 0, TAU); ctx.fillStyle = col; ctx.fill();
  // The hook below the case.
  ctx.strokeStyle = metal; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(x, coilBot + caseH); ctx.lineTo(x, coilBot + caseH + 4); ctx.arc(x, coilBot + caseH + 9, 5, -Math.PI / 2, Math.PI * 0.9); ctx.stroke();
  ctx.restore();
  return { x0: x - caseW / 2, y0: coilTop, w: caseW, h: coilH + caseH, hook: { x, y: coilBot + caseH } };
}

// -- Seats, desk, bicycle ------------------------------------------------------------

const woodOf = (c, o) => (o.tone != null ? toneOf(c, o.tone) : darken(c.gold, 0.28));

// A flat slab with a darker lip under it and a light strip on top (the house cushion).
function slab(ctx, x, y, w, h, col, r = Math.min(4, h / 2)) {
  rr(ctx, x, y + Math.max(1.5, h * 0.35), w, h, r); ctx.fillStyle = darken(col, 0.35); ctx.fill();
  rr(ctx, x, y, w, h, r); ctx.fillStyle = col; ctx.fill();
  ctx.fillStyle = lighten(col, 0.25); ctx.fillRect(x + Math.min(6, w * 0.1), y + Math.max(1, h * 0.18), Math.max(0, w - Math.min(12, w * 0.2)), Math.max(1, h * 0.18));
}
function post(ctx, x, y0, y1, w, col) {
  rr(ctx, x - w / 2, Math.min(y0, y1), w, Math.abs(y1 - y0), w / 2); ctx.fillStyle = col; ctx.fill();
}

/**
 * A chair sized for its sitter: side view (back on the side the sitter's back is)
 * or front view (facing 0 / view 'front'). Draw it before the figure, then give the
 * figure { pose: 'sit', seat: chair.seat, facing }. x is where the pelvis sits.
 */
export function drawChair(ctx, c, o = {}) {
  const H = o.forHeight ?? 170, M = figureMetrics(H, o.build), x = o.x ?? 200, y = o.y ?? 400;
  const front = o.view === 'front' || o.facing === 0, f = o.facing === -1 ? -1 : 1;
  const col = woodOf(c, o), legCol = darken(col, 0.3), t = Math.max(4, 0.03 * H), lw = Math.max(3, 0.026 * H);
  const sy = y - M.seatSit;
  ctx.save();
  drawShadow(ctx, c, x, y, 0.17 * H, 0.03 * H + 1.5);
  let box, back;
  if (front) {
    const hw = 0.16 * H;
    back = { x, y: sy - 0.32 * H };
    for (const s of [-1, 1]) post(ctx, x + s * hw * 0.82, sy, y, lw * 0.8, darken(legCol, 0.2));
    rr(ctx, x - hw * 0.86, back.y, hw * 1.72, 0.2 * H, 0.05 * H); ctx.fillStyle = darken(col, 0.12); ctx.fill();
    ctx.fillStyle = lighten(col, 0.18); ctx.fillRect(x - hw * 0.7, back.y + 0.03 * H, hw * 1.4, Math.max(1.5, 0.012 * H));
    for (const s of [-1, 1]) post(ctx, x + s * hw * 0.78, back.y + 0.1 * H, sy, lw, col);
    slab(ctx, x - hw, sy, hw * 2, t, col);
    for (const s of [-1, 1]) post(ctx, x + s * hw * 0.92, sy + t * 0.6, y, lw, legCol);
    box = { x0: x - hw, y0: back.y, w: hw * 2, h: y - back.y };
  } else {
    const xf = x + f * 0.12 * H, xb = x - f * 0.14 * H, x0 = Math.min(xf, xb), w = Math.abs(xf - xb);
    back = { x: xb + f * lw * 0.5, y: sy - 0.32 * H };
    post(ctx, xf - f * lw, sy, y, lw * 0.85, darken(legCol, 0.18));     // far legs peek out
    post(ctx, xb + f * lw * 1.6, sy, y, lw * 0.85, darken(legCol, 0.18));
    post(ctx, back.x, back.y + 0.02 * H, sy, lw * 1.1, col);
    rr(ctx, back.x - f * lw * 0.2 - (f > 0 ? 0 : 0.035 * H), back.y, 0.035 * H, 0.2 * H, 0.0175 * H); ctx.fillStyle = darken(col, 0.1); ctx.fill();
    slab(ctx, x0, sy, w, t, col);
    post(ctx, xf - f * lw * 0.6, sy + t * 0.6, y, lw, legCol);
    post(ctx, xb + f * lw * 0.6, sy + t * 0.6, y, lw, legCol);
    box = { x0: Math.min(x0, back.x - 0.04 * H), y0: back.y, w: w + 0.04 * H, h: y - back.y };
  }
  ctx.restore();
  return { seat: { x, y: sy }, box, back };
}

/** A plain bench for a row of sitters: seat(x) gives each one's seat anchor. */
export function drawSeatBench(ctx, c, o = {}) {
  const H = o.forHeight ?? 170, M = figureMetrics(H, o.build), y = o.y ?? 400;
  const x0 = o.x0 ?? 40, x1 = o.x1 ?? 640, sy = y - M.seatSit;
  const col = woodOf(c, o), legCol = darken(col, 0.3), t = Math.max(4, 0.035 * H), lw = Math.max(3, 0.03 * H);
  ctx.save();
  drawShadow(ctx, c, (x0 + x1) / 2, y, (x1 - x0) / 2 + 6, 0.025 * H + 1.5);
  const n = Math.max(2, Math.round((x1 - x0) / (0.9 * H)) + 1);
  for (let i = 0; i < n; i++) post(ctx, x0 + 0.05 * H + ((x1 - x0 - 0.1 * H) * i) / (n - 1), sy + t * 0.5, y, lw, legCol);
  slab(ctx, x0, sy, x1 - x0, t, col);
  ctx.restore();
  return { y: sy, seat: (x) => ({ x, y: sy }), box: { x0, y0: sy, w: x1 - x0, h: y - sy } };
}

/**
 * A desk at seated elbow height. Front view: a top and a modesty panel that hides
 * the sitters' legs (draw it in drawFigureRow's `between`, so hands land on top).
 * hands(x, facing) -> [near, far] grips on the top for a sitter at x.
 */
export function drawDesk(ctx, c, o = {}) {
  const H = o.forHeight ?? 170, M = figureMetrics(H, o.build), y = o.y ?? 400;
  const x0 = o.x0 ?? 40, x1 = o.x1 ?? 640, top = y - M.deskTop, front = (o.view ?? 'front') === 'front';
  const col = woodOf(c, o), t = Math.max(5, 0.04 * H), lw = Math.max(3, 0.03 * H);
  ctx.save();
  drawShadow(ctx, c, (x0 + x1) / 2, y, (x1 - x0) / 2 + 6, 0.025 * H + 1.5);
  if (front && o.panel !== false) {
    rr(ctx, x0 + 0.02 * H, top + t * 0.5, x1 - x0 - 0.04 * H, y - top - 0.04 * H - t * 0.5, 0.02 * H);
    ctx.fillStyle = darken(col, 0.18); ctx.fill();
    ctx.fillStyle = alpha(lighten(col, 0.2), 0.7);
    ctx.fillRect(x0 + 0.05 * H, top + t + 0.03 * H, x1 - x0 - 0.1 * H, Math.max(1.5, 0.01 * H));
  }
  for (const lx of [x0 + 0.03 * H, x1 - 0.03 * H]) post(ctx, lx, top + t * 0.5, y, lw, darken(col, 0.3));
  slab(ctx, x0, top, x1 - x0, t, col);
  ctx.restore();
  const hy = top - 0.012 * H;
  return {
    top, box: { x0, y0: top, w: x1 - x0, h: y - top },
    hands: (x, facing = 0) => {
      if (!facing) return [{ x: x + 0.09 * H, y: hy }, { x: x - 0.09 * H, y: hy }];
      const edge = facing > 0 ? x0 : x1;
      return [{ x: edge + facing * 0.07 * H, y: hy }, { x: edge + facing * 0.035 * H, y: hy }];
    },
  };
}

/**
 * Pure bicycle geometry fitted to its rider. x: midway between the axles, y: the
 * ground, dist: px travelled (wheels roll dist / r: no skid; cranks follow).
 * -> { view, f, r, wheels, bb, crankR, crank, pedals[2], saddle, hip, bar, grips[2], head, box, rider }
 * rider = { x, y, height, build, facing, hip, hands, feet } for drawFigure with pose 'cycle'.
 */
export function bicycleRig(o = {}) {
  const H = o.forHeight ?? 170, build = o.build ?? 'adult', M = figureMetrics(H, build), C = M.cycle;
  const x = o.x ?? 300, y = o.y ?? 420, dist = o.dist ?? 0;
  const front = o.view === 'front' || o.facing === 0, f = o.facing === -1 ? -1 : 1;
  const r = 0.19 * H, gear = 2.4, roll = dist / r, crank = dist / (r * gear);
  const bb = { x: front ? x : x - f * 0.04 * H, y: y - C.bbH };
  const hip = { x: front ? x : bb.x - f * C.hipBack, y: bb.y - C.hipUp };
  const lean = 28 * Math.PI / 180, sh = { x: hip.x + f * 0.86 * M.torso * Math.sin(lean), y: hip.y - 0.86 * M.torso * Math.cos(lean) };
  const ga = 70 * Math.PI / 180;
  // Head-on the reach to the bars is foreshortened: they show at the rider's waist.
  const bar = front ? { x, y: hip.y - 0.02 * H } : { x: sh.x + f * 0.88 * M.reach * Math.sin(ga), y: sh.y + 0.88 * M.reach * Math.cos(ga) };
  const pT = Math.max(2, 0.014 * H);
  const pedals = [0, 1].map((i) => {
    const a = crank + (i ? Math.PI : 0);
    return front ? { x: x + (i ? -1 : 1) * 0.075 * H, y: bb.y + C.crankR * Math.sin(a) } : { x: bb.x + f * C.crankR * Math.cos(a), y: bb.y + C.crankR * Math.sin(a) };
  });
  const grips = front ? [{ x: x + 0.15 * H, y: bar.y }, { x: x - 0.15 * H, y: bar.y }] : [{ x: bar.x + f * 0.004 * H, y: bar.y }, { x: bar.x - f * 0.012 * H, y: bar.y - 0.006 * H }];
  const wheels = front ? [{ x, y: y - r, r }, { x, y: y - r, r }] : [{ x: x - f * 0.31 * H, y: y - r, r }, { x: x + f * 0.31 * H, y: y - r, r }];
  const head = front ? { x, y: bar.y + 0.05 * H } : { x: wheels[1].x - f * 0.07 * H, y: bar.y + 0.05 * H };
  const saddle = { x: hip.x, y: hip.y + (front ? M.seatDropFront : M.seatDrop) };
  const xs = front ? [x - 0.2 * H, x + 0.2 * H] : [wheels[0].x - r, wheels[1].x + r];
  return {
    __bike: true, view: front ? 'front' : 'side', f, H, x, y, r, roll, crank, crankR: C.crankR, pT, bb, hip, saddle, bar, grips, head, wheels, pedals,
    tone: o.tone, box: { x0: Math.min(...xs), y0: bar.y - 0.03 * H, w: Math.abs(xs[1] - xs[0]), h: y - bar.y + 0.03 * H },
    rider: { x: hip.x, y, height: H, build, facing: front ? 0 : f, hip: { ...hip }, hands: grips.map((g) => ({ ...g })), feet: pedals.map((p) => ({ x: p.x, y: p.y - pT / 2 })) },
  };
}

/**
 * Draw a bicycle (a rig from bicycleRig, or its options). part: 'back' (all of a
 * side view; head-on: cranks and pedals) | 'front' (head-on: wheel, fork, bars) | 'all'.
 */
export function drawBicycle(ctx, c, rigOrOpts = {}, o = {}) {
  const R = rigOrOpts.__bike ? rigOrOpts : bicycleRig(rigOrOpts);
  const part = o.part ?? 'all', H = R.H, f = R.f;
  const frame = toneOf(c, R.tone ?? 6);
  const hue = hslOf(c.stroke).h;
  const tyre = hsl(hue, 0.12, 0.2), rim = hsl(hue, 0.1, 0.62), metal = hsl(hue, 0.08, 0.5);
  const tw = Math.max(3, 0.026 * H), fw = Math.max(3, 0.028 * H);
  const tube = (a, b, w = fw, col = frame) => {
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y + w * 0.3); ctx.lineTo(b.x, b.y + w * 0.3); ctx.strokeStyle = darken(col, 0.35); ctx.lineWidth = w; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  };
  const pedal = (p, dk = 0) => { rr(ctx, p.x - 0.03 * H, p.y - R.pT / 2, 0.06 * H, R.pT, R.pT / 2); ctx.fillStyle = darken(metal, 0.2 + dk); ctx.fill(); };
  ctx.save();
  if (R.view === 'side') {
    if (part === 'front') { ctx.restore(); return R; }
    drawShadow(ctx, c, R.x, R.y, 0.48 * H, 0.03 * H + 1.5);
    const [rw, fwh] = R.wheels;
    // Far crank and pedal, behind everything.
    tube(R.bb, R.pedals[1], Math.max(2, 0.018 * H), darken(metal, 0.3)); pedal(R.pedals[1], 0.25);
    for (const wh of R.wheels) {
      ctx.beginPath(); ctx.arc(wh.x, wh.y, wh.r - tw / 2, 0, TAU); ctx.strokeStyle = tyre; ctx.lineWidth = tw; ctx.stroke();
      ctx.beginPath(); ctx.arc(wh.x, wh.y, wh.r - tw * 1.15, 0, TAU); ctx.strokeStyle = rim; ctx.lineWidth = Math.max(1.5, tw * 0.35); ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = R.roll + (k * Math.PI) / 4;
        ctx.moveTo(wh.x, wh.y); ctx.lineTo(wh.x + f * Math.cos(a) * (wh.r - tw * 1.2), wh.y + Math.sin(a) * (wh.r - tw * 1.2));
      }
      ctx.strokeStyle = alpha(rim, 0.8); ctx.lineWidth = Math.max(1, 0.006 * H); ctx.stroke();
      ctx.beginPath(); ctx.arc(wh.x, wh.y, Math.max(2, 0.018 * H), 0, TAU); ctx.fillStyle = metal; ctx.fill();
    }
    const seatTop = { x: R.saddle.x + f * 0.01 * H, y: R.saddle.y + 0.025 * H };
    const st = { x: R.bb.x + (seatTop.x - R.bb.x) * 0.78, y: R.bb.y + (seatTop.y - R.bb.y) * 0.78 };
    const ht0 = R.head, ht1 = { x: ht0.x + (fwh.x - ht0.x) * 0.22, y: ht0.y + (fwh.y - ht0.y) * 0.22 };
    tube(rw, R.bb); tube(rw, st);                                  // chain stay, seat stay
    tube(ht1, fwh, fw * 0.9);                                      // fork
    tube(R.bb, ht1); tube(st, { x: ht0.x + (ht1.x - ht0.x) * 0.3, y: ht0.y + (ht1.y - ht0.y) * 0.3 }); tube(R.bb, seatTop);
    tube(ht0, ht1, fw * 1.25);                                     // head tube
    tube(ht0, R.bar, Math.max(2.5, 0.022 * H), metal);             // stem
    tube({ x: R.bar.x - f * 0.03 * H, y: R.bar.y - 0.012 * H }, { x: R.bar.x + f * 0.025 * H, y: R.bar.y + 0.01 * H }, Math.max(3, 0.026 * H), tyre);
    // Saddle.
    ctx.beginPath();
    ctx.ellipse(R.saddle.x + f * 0.012 * H, R.saddle.y + 0.012 * H, 0.06 * H, 0.016 * H, 0, 0, TAU);
    ctx.fillStyle = tyre; ctx.fill();
    // Chainring, near crank and pedal.
    ctx.beginPath(); ctx.arc(R.bb.x, R.bb.y, 0.045 * H, 0, TAU); ctx.strokeStyle = metal; ctx.lineWidth = Math.max(2, 0.014 * H); ctx.stroke();
    tube(R.bb, R.pedals[0], Math.max(2.5, 0.02 * H), darken(metal, 0.1)); pedal(R.pedals[0]);
  } else {
    const wh = R.wheels[1];
    if (part !== 'front') {
      drawShadow(ctx, c, R.x, R.y, 0.2 * H, 0.03 * H + 1.5);
      for (const i of [1, 0]) { tube({ x: R.x + (i ? -1 : 1) * 0.03 * H, y: R.bb.y }, R.pedals[i], Math.max(2.5, 0.02 * H), darken(metal, 0.1)); pedal(R.pedals[i]); }
    }
    if (part !== 'back') {
      rr(ctx, wh.x - 0.024 * H, wh.y - wh.r, 0.048 * H, wh.r * 2, 0.024 * H); ctx.fillStyle = tyre; ctx.fill();
      ctx.fillStyle = alpha(rim, 0.5); ctx.fillRect(wh.x - 0.005 * H, wh.y - wh.r + 0.03 * H, 0.01 * H, wh.r * 2 - 0.06 * H);
      for (const s of [-1, 1]) tube({ x: wh.x + s * 0.03 * H, y: wh.y }, { x: wh.x + s * 0.03 * H, y: R.head.y + 0.02 * H }, fw * 0.8);
      tube({ x: wh.x - 0.035 * H, y: R.head.y + 0.02 * H }, { x: wh.x + 0.035 * H, y: R.head.y + 0.02 * H }, fw);
      tube({ x: wh.x, y: R.head.y + 0.02 * H }, { x: wh.x, y: R.bar.y }, fw * 1.1);
      tube(R.grips[1], R.grips[0], Math.max(3, 0.022 * H), metal);
      for (const g of R.grips) tube({ x: g.x - 0.02 * H, y: g.y }, { x: g.x + 0.02 * H, y: g.y }, Math.max(4, 0.03 * H), tyre);
      ctx.beginPath(); ctx.arc(wh.x, R.head.y + 0.045 * H, 0.025 * H, 0, TAU); ctx.fillStyle = lighten(c.warning, 0.3); ctx.fill();
    }
  }
  ctx.restore();
  return R;
}
