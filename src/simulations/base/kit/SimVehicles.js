/**
 * SimVehicles - side-view vehicles for motion scenes (canvas). Pairs with
 * SimProps (one ground line) and SimFigure (the people who ride them).
 * Every vehicle faces right (o.flip = true faces left), stands on o.y (the
 * ground; the water line for the canoe), is centred on o.x and is sized from
 * o.length (design px, nose to tail). Wheels turn with o.roll (metres
 * travelled; o.pxPerM defaults from the real length), so a frame depends only
 * on its inputs. No faces, no text on the body except o.label.
 *
 *   drawBus(ctx, c, { x, y, length = 300, tone = 6, roll, inside, lean, label })
 *   drawBusStander(ctx, c, bus, look, { height, build, tilt })   the standing passenger, tilted about the feet, hand on the strap
 *   drawLedge(ctx, c, { x (edge), y (top), ground, w, facing, kind: 'building' | 'cliff' })  -> { top, front, rear, box, anchors: { edge, foot } }
 *   drawBarrier(ctx, c, { x, y, w = 120, h = 80, tone = 'bad', flip })   striped barricade -> { top, front, rear, box, anchors: { board } }
 *   drawCar(ctx, c, { x, y, length = 180, tone = 1, roll, label })
 *   drawTruck(ctx, c, { x, y, length = 260, tone = 8, kind: 'box' | 'open', roll, label })
 *   drawScooter(ctx, c, { x, y, length = 150, tone = 4, roll })
 *   drawCanoe(ctx, c, { x, y, length = 240, tone = 'gold', stroke = 0, part: 'all' | 'back' | 'front', water = true })
 *   drawRocket(ctx, c, { x, y (centre line), length = 200, tone = 6, thrust = 0, retro = false, angle = 0, t = 0 })
 *   drawBalloonOnThread(ctx, c, { x0, x1, y, at, r = 46, air = 1, jet, tone = 4, t = 0 })
 *
 * Each returns { x0, y0, w, h, box, ground, front, rear, f, pxPerM, anchors }
 * (box = { x0, y0, w, h } world px; f = 1 right, -1 left). Named anchors:
 *   bus outside: door, roof;  bus inside: standing, handle, seats[], floor, figureHeight, lean
 *   car: roof, door;  truck: bed { x0, x1, y } (top of the load), cab
 *   scooter: seat, handlebar, footrest, riderHeight
 *   canoe: seat, paddle { pivot, lower, blade }, paddlerHeight
 *   rocket: nose, nozzle, centre, plumeEnd;  balloon: straw, centre, neck, jetEnd
 * People: draw the vehicle, then the figure on its anchors (canoe: part 'back',
 * figure, part 'front'). tone: 1..8 (series) or a token key. ASCII only.
 */
import { MIN_PX, ellipse, rr, darken, lighten, alpha, mix, luma, inkOn, font, drawShadow } from './SimLook.js';
import { drawFigure } from './SimFigure.js';

const TAU = Math.PI * 2;
const toneOf = (c, t) => (typeof t === 'number' ? c['s' + (((Math.max(1, t | 0) - 1) % 8) + 1)] : (c[t] ?? t));
const paleOf = (c) => darken(luma(c.label) > luma(c.bgSurface) ? c.label : c.bgSurface, 0.06);   // a light metal, the same in day and night
const tyreOf = (c) => mix(c.bgDeep, c.label, 0.22);
const glassOf = (c) => mix(c.glass, c.bgDeep, 0.28);
const LABEL = 26;

// A rounded polygon: pts [[x, y, radius?], ...].
function rpoly(ctx, pts, r = 6) {
  const n = pts.length, a = pts[n - 1], b = pts[0];
  ctx.beginPath();
  ctx.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    ctx.arcTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, p[2] ?? r);
  }
  ctx.closePath();
}

// The Quill recipe on any path: lip, fill, shade band away from the light, highlight bean, darker rim.
// beanX is in 0..1 of the box; callers pass the mirrored value under a flip so the light stays top left.
function shell(ctx, path, bx, by, bw, bh, col, o = {}) {
  if (o.lip) { ctx.save(); ctx.translate(0, o.lip); path(); ctx.fillStyle = darken(col, 0.42); ctx.fill(); ctx.restore(); }
  path(); ctx.fillStyle = col; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.fillStyle = darken(col, 0.17);
  ctx.fillRect(bx - 4, by + bh * (o.shadeFrom ?? 0.62), bw + 8, bh + 8);
  if (o.bean !== false) {
    ctx.fillStyle = alpha(lighten(col, 0.4), 0.85);
    ellipse(ctx, bx + bw * (o.beanX ?? 0.22), by + bh * (o.beanY ?? 0.2), bw * (o.beanW ?? 0.12), Math.max(2, bh * 0.06));
    ctx.fill();
  }
  ctx.restore();
  path(); ctx.strokeStyle = o.rim ?? darken(col, 0.34); ctx.lineWidth = o.rimW ?? 2.5; ctx.lineJoin = 'round'; ctx.stroke();
}

// A pane of glass with one diagonal sheen; rim from the body colour.
function pane(ctx, c, path, bx, by, bw, bh, rimCol) {
  const g = glassOf(c);
  path(); ctx.fillStyle = g; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.fillStyle = darken(g, 0.14); ctx.fillRect(bx, by + bh * 0.6, bw, bh);
  ctx.fillStyle = alpha(lighten(g, 0.6), 0.55);
  ctx.beginPath();
  ctx.moveTo(bx + bw * 0.18, by); ctx.lineTo(bx + bw * 0.36, by); ctx.lineTo(bx + bw * 0.14, by + bh); ctx.lineTo(bx - bw * 0.04, by + bh);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  path(); ctx.strokeStyle = rimCol; ctx.lineWidth = 2.5; ctx.stroke();
}

function wheel(ctx, c, x, y, r, ang) {
  const tyre = tyreOf(c), hub = mix(c.bgSurface, c.label, 0.4);
  ctx.beginPath(); ctx.arc(x, y + 2, r, 0, TAU); ctx.fillStyle = darken(tyre, 0.4); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = tyre; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r * 0.58, 0, TAU); ctx.fillStyle = hub; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * 0.58, 0, TAU); ctx.clip();
  ctx.fillStyle = darken(hub, 0.2); ctx.fillRect(x - r, y + r * 0.18, r * 2, r);
  ctx.restore();
  ctx.strokeStyle = darken(hub, 0.38); ctx.lineWidth = Math.max(2, r * 0.16); ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) { const a = ang + (i * TAU) / 5; ctx.moveTo(x + Math.cos(a) * r * 0.16, y + Math.sin(a) * r * 0.16); ctx.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5); }
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, TAU); ctx.fillStyle = lighten(hub, 0.3); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r - 1.2, 0, TAU); ctx.strokeStyle = darken(tyre, 0.35); ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = alpha(lighten(tyre, 0.55), 0.55);
  ellipse(ctx, x - r * 0.45, y - r * 0.52, r * 0.26, r * 0.12, -0.7); ctx.fill();
}

// The dark well a wheel sits in.
function arch(ctx, col, x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r, Math.PI, 0); ctx.closePath(); ctx.fillStyle = darken(col, 0.55); ctx.fill();
}

function lamp(ctx, x, y, rx, ry, col) {
  ellipse(ctx, x, y, rx, ry); ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = darken(col, 0.35); ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = alpha(lighten(col, 0.6), 0.8); ellipse(ctx, x - rx * 0.3, y - ry * 0.3, rx * 0.35, ry * 0.3); ctx.fill();
}

function bodyLabel(ctx, c, text, x, y, maxH, fill, size) {
  if (text == null || text === '') return;
  ctx.save();
  ctx.font = font(c, 800, Math.max(MIN_PX, Math.min(size ?? LABEL, maxH * 0.8)), true);
  ctx.fillStyle = inkOn(c, fill); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(text), x, y);
  ctx.restore();
}

// Local frame: origin at (x, ground), +x toward the nose. Returns the helpers every vehicle shares.
function frame(o, Ldef, realM) {
  const L = o.length ?? Ldef, f = o.flip ? -1 : 1, x = o.x ?? 340, y = o.y ?? 420;
  const pxPerM = o.pxPerM ?? L / realM;
  const P = (lx, ly) => ({ x: x + f * lx, y: y + ly });
  const roll = ((o.roll ?? 0) * pxPerM);
  return { L, f, x, y, pxPerM, P, roll, bean: f > 0 ? 0.2 : 0.8 };
}

function result(F, top, bottom, anchors, extra = {}) {
  const box = { x0: F.x - F.L / 2, y0: F.y + top, w: F.L, h: bottom - top };
  return { ...box, box, ground: F.y, front: F.x + F.f * F.L / 2, rear: F.x - F.f * F.L / 2, f: F.f, pxPerM: F.pxPerM, anchors, ...extra };
}

// -- Bus ---------------------------------------------------------------------------------

/**
 * A city bus. o.inside = true: a cut-away (far wall with windows, seats front
 * and back, a standing space in the middle, a ceiling bar with hanging straps
 * that swing with o.lean). anchors.standing is the floor point for a standing
 * SimFigure of anchors.figureHeight px; anchors.handle is the strap grip above
 * it. o.lean (radians, + = toward the nose) comes back as anchors.lean; draw the
 * passenger with drawBusStander (tilts the whole figure about its feet).
 * o.label: a destination board above the windows (never on a door); none by
 * default. o.ground = true: a road strip under the wheels.
 */
export function drawBus(ctx, c, o = {}) {
  const F = frame(o, 300, 12), { L, f, P } = F, col = toneOf(c, o.tone ?? 6), rim = darken(col, 0.34);
  const r = 0.062 * L, xr = -0.3 * L, xf = 0.27 * L, yb = -0.75 * r, yt = (o.inside || o.label ? -0.4 : -0.34) * L, ang = F.roll / r;
  const lean = o.lean ?? 0;
  ctx.save();
  if (o.ground) roadStrip(ctx, c, F.x - 0.62 * L, F.x + 0.62 * L, F.y, Math.max(18, 0.06 * L));
  drawShadow(ctx, c, F.x, F.y + 2, L * 0.52, 7, 0.9);
  ctx.translate(F.x, F.y); ctx.scale(f, 1);
  const bodyPath = () => rpoly(ctx, [[-0.5 * L, yb, 6], [-0.5 * L, yt, 14], [0.44 * L, yt, 16], [0.5 * L, yt + 0.07 * L, 10], [0.5 * L, yb, 6]]);
  shell(ctx, bodyPath, -0.5 * L, yt, L, -yt, col, { lip: 4, beanX: F.bean, beanY: 0.08, shadeFrom: 0.7 });
  // Roof pod (the air unit) and bumpers.
  shell(ctx, () => rr(ctx, -0.22 * L, yt - 0.03 * L, 0.3 * L, 0.035 * L, 5), -0.22 * L, yt - 0.03 * L, 0.3 * L, 0.035 * L, paleOf(c), { bean: false, shadeFrom: 0.5 });
  const dark = darken(col, 0.5);
  for (const bx of [-0.51 * L, 0.47 * L]) { rr(ctx, bx, yb - 0.035 * L, 0.04 * L, 0.04 * L, 4); ctx.fillStyle = dark; ctx.fill(); }
  const board = !o.inside && o.label != null && o.label !== '', wy0 = yt + (board ? 0.1 : 0.04) * L, wy1 = wy0 + (board ? 0.12 : 0.11) * L, doorTop = wy0;
  if (board) {                                                                        // destination board above the windows
    const bx = -0.3 * L, by = yt + 0.018 * L, bw = 0.6 * L, bh = 0.07 * L;
    rr(ctx, bx, by, bw, bh, 6); ctx.fillStyle = mix(c.bgDeep, c.label, 0.12); ctx.fill(); ctx.strokeStyle = rim; ctx.lineWidth = 2.5; ctx.stroke();
  }
  const anchors = {};
  if (!o.inside) {
    // Window band between the doors, a windscreen at the nose.
    const runs = [[-0.465, -0.13], [0.01, 0.31]];
    for (const [a, b] of runs) {
      const n = Math.max(1, Math.round((b - a) / 0.085)), pw = ((b - a) * L) / n;
      for (let i = 0; i < n; i++) {
        const px = a * L + i * pw + 0.006 * L, w = pw - 0.012 * L;
        pane(ctx, c, () => rr(ctx, px, wy0, w, wy1 - wy0, 5), px, wy0, w, wy1 - wy0, rim);
      }
    }
    pane(ctx, c, () => rpoly(ctx, [[0.45 * L, wy0, 4], [0.49 * L, yt + 0.075 * L, 6], [0.49 * L, wy1 + 0.04 * L, 5], [0.45 * L, wy1 + 0.04 * L, 4]]), 0.45 * L, wy0, 0.04 * L, 0.15 * L, rim);
    for (const [a, b] of [[-0.12, -0.02], [0.335, 0.435]]) {      // doors: two glass leaves in a frame
      const dx = a * L, dw = (b - a) * L, dh = yb - 0.01 * L - doorTop;
      rr(ctx, dx, doorTop, dw, dh, 4); ctx.fillStyle = darken(col, 0.22); ctx.fill(); ctx.strokeStyle = rim; ctx.lineWidth = 2.5; ctx.stroke();
      for (const s of [0, 1]) { const lx = dx + 3 + s * dw / 2, lw = dw / 2 - 5; pane(ctx, c, () => rr(ctx, lx, doorTop + 4, lw, dh * 0.62, 3), lx, doorTop + 4, lw, dh * 0.62, rim); }
    }
    anchors.door = P(0.385 * L, yb);
  } else {
    // Cut-away: the near wall is gone; we see the far wall, its windows, seats and the bar.
    for (const wx of [xr, xf]) wheel(ctx, c, wx, -r, r, ang);                          // wheels sit under the floor
    const ix0 = -0.47 * L, ix1 = 0.47 * L, iy0 = yt + 0.025 * L, floor = -0.12 * L;
    const wall = mix(paleOf(c), col, 0.12);
    const inner = () => rr(ctx, ix0, iy0, ix1 - ix0, floor - iy0, 8);
    inner(); ctx.fillStyle = wall; ctx.fill();
    ctx.save(); inner(); ctx.clip();
    ctx.fillStyle = darken(wall, 0.1); ctx.fillRect(ix0, wy1 + 0.03 * L, ix1 - ix0, floor);   // lower wall in shade
    for (let i = 0; i < 9; i++) { const px = ix0 + 0.02 * L + i * 0.104 * L; pane(ctx, c, () => rr(ctx, px, wy0 + 0.01 * L, 0.084 * L, 0.1 * L, 5), px, wy0, 0.084 * L, 0.1 * L, darken(wall, 0.35)); }
    ctx.fillStyle = darken(wall, 0.3); ctx.fillRect(ix0, floor - 0.012 * L, ix1 - ix0, 0.012 * L);   // the floor strip
    ctx.restore();
    inner(); ctx.strokeStyle = darken(col, 0.45); ctx.lineWidth = 4; ctx.stroke();        // the cut edge of the shell
    // Seats (side view, facing the nose) at the back and the front; the middle is for standing.
    const seatCol = toneOf(c, o.seatTone ?? 1), seats = [];
    for (const sx of [-0.42, -0.31, -0.2, 0.22, 0.33]) {
      const cx = sx * L, sy = floor - 0.075 * L, cw = 0.07 * L;
      rr(ctx, cx - 0.004 * L, sy, 0.012 * L, floor - sy, 2); ctx.fillStyle = darken(wall, 0.4); ctx.fill();
      shell(ctx, () => rr(ctx, cx - cw / 2, sy - 0.02 * L, cw, 0.024 * L, 5), cx - cw / 2, sy - 0.02 * L, cw, 0.024 * L, seatCol, { bean: false });
      shell(ctx, () => rr(ctx, cx - cw / 2 - 0.016 * L, sy - 0.1 * L, 0.024 * L, 0.1 * L, 6), cx - cw / 2 - 0.016 * L, sy - 0.1 * L, 0.024 * L, 0.1 * L, seatCol, { beanX: 0.4, beanW: 0.3 });
      seats.push(P(cx, sy - 0.02 * L));
    }
    // Ceiling bar and straps; the straps swing by the same lean as the passenger.
    const figureHeight = 0.19 * L, barY = iy0 + 0.018 * L, strap = Math.max(0.02 * L, floor - 0.012 * L - 0.92 * figureHeight - 0.022 * L - barY), metal = mix(paleOf(c), c.label, 0.35);
    ctx.strokeStyle = darken(metal, 0.2); ctx.lineWidth = Math.max(3, 0.01 * L); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ix0 + 0.02 * L, barY); ctx.lineTo(ix1 - 0.02 * L, barY); ctx.stroke();
    let handle = null;
    for (const hx of [-0.36, -0.18, 0.02, 0.2, 0.36]) {
      const sx = hx * L, ex = sx + Math.sin(lean) * strap, ey = barY + Math.cos(lean) * strap;
      ctx.strokeStyle = darken(metal, 0.3); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx, barY); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex + Math.sin(lean) * 0.012 * L, ey + 0.012 * L, 0.013 * L, 0, TAU); ctx.strokeStyle = toneOf(c, 2); ctx.lineWidth = 4; ctx.stroke();
      if (hx === 0.02) handle = P(ex + Math.sin(lean) * 0.012 * L, ey + 0.022 * L);
    }
    Object.assign(anchors, { standing: P(0, floor - 0.012 * L), handle, seats, floor: F.y + floor - 0.012 * L, figureHeight, lean });
  }
  // Inner line along the waist, lamps, wheels.
  ctx.fillStyle = alpha(lighten(col, 0.35), 0.7); ctx.fillRect(-0.49 * L, wy1 + 0.035 * L, o.inside ? 0.02 * L : 0.98 * L, 3);
  lamp(ctx, 0.485 * L, yb - 0.06 * L, 0.012 * L, 0.018 * L, c.gold);
  lamp(ctx, -0.488 * L, yb - 0.07 * L, 0.009 * L, 0.02 * L, c.bad);
  if (!o.inside) for (const wx of [xr, xf]) { arch(ctx, col, wx, -r, r * 1.18); wheel(ctx, c, wx, -r, r, ang); }
  ctx.restore();
  anchors.roof = P(0, yt - 0.03 * L);
  if (board) bodyLabel(ctx, c, o.label, F.x, F.y + yt + 0.053 * L, 0.07 * L, mix(c.bgDeep, c.label, 0.12), o.labelSize);
  return result(F, yt - 0.035 * L, 2, anchors);
}

/** A road strip (asphalt slab with a lit edge and a kerb line) from x0 to x1, top at y. */
function roadStrip(ctx, c, x0, x1, y, h) {
  const base = mix(c.bgDeep, c.label, 0.24);
  ctx.save();
  rr(ctx, x0, y + 4, x1 - x0, h, 6); ctx.fillStyle = darken(base, 0.42); ctx.fill();
  rr(ctx, x0, y, x1 - x0, h, 6); ctx.fillStyle = base; ctx.fill();
  ctx.fillStyle = alpha(lighten(base, 0.45), 0.8); ctx.fillRect(x0 + 4, y + 2, x1 - x0 - 8, 3);
  ctx.fillStyle = alpha(c.gold, 0.9);
  for (let x = x0 + 14; x < x1 - 30; x += 52) { rr(ctx, x, y + h * 0.55, 28, 4, 2); ctx.fill(); }
  rr(ctx, x0, y, x1 - x0, h, 6); ctx.strokeStyle = darken(base, 0.4); ctx.lineWidth = 2.5; ctx.stroke();
  ctx.restore();
}

/**
 * The standing passenger of a drawBus({ inside: true }) result: the whole figure
 * tilts about its feet by the bus lean (clamped to +-0.26 rad, about 15 degrees,
 * + = toward the nose) and its near hand stays on the strap handle.
 * look: a figureLook. o: { height (anchors.figureHeight), build = 'adult', tilt (override, radians) }.
 * Returns the figure's sk (anchors in the tilted frame) plus { tilt }.
 */
export function drawBusStander(ctx, c, bus, look, o = {}) {
  const A = bus.anchors, f = bus.f, tilt = o.tilt ?? Math.max(-0.26, Math.min(0.26, A.lean ?? 0));
  const fx = A.standing.x, fy = A.standing.y, a = -f * tilt;                         // canvas angle that undoes the tilt
  const hx = A.handle.x - fx, hy = A.handle.y - fy;
  const hand = { x: fx + hx * Math.cos(a) - hy * Math.sin(a), y: fy + hx * Math.sin(a) + hy * Math.cos(a) };
  ctx.save();
  ctx.translate(fx, fy); ctx.rotate(f * tilt); ctx.translate(-fx, -fy);
  const sk = drawFigure(ctx, c, { x: fx, y: fy, height: o.height ?? A.figureHeight, build: o.build ?? 'adult', facing: f, pose: 'stand', hands: [hand, null] }, look);
  ctx.restore();
  return Object.assign(sk ?? {}, { tilt });
}

// -- Car ---------------------------------------------------------------------------------

export function drawCar(ctx, c, o = {}) {
  const F = frame(o, 180, 4.2), { L, f, P } = F, col = toneOf(c, o.tone ?? 1), rim = darken(col, 0.34);
  const r = 0.105 * L, ang = F.roll / r;
  ctx.save();
  drawShadow(ctx, c, F.x, F.y + 2, L * 0.5, 6, 0.9);
  ctx.translate(F.x, F.y); ctx.scale(f, 1);
  const body = () => rpoly(ctx, [[-0.5 * L, -0.1 * L, 8], [-0.5 * L, -0.3 * L, 10], [-0.31 * L, -0.33 * L, 8], [-0.22 * L, -0.52 * L, 12],
    [0.07 * L, -0.52 * L, 12], [0.24 * L, -0.34 * L, 8], [0.48 * L, -0.3 * L, 10], [0.5 * L, -0.1 * L, 8]]);
  shell(ctx, body, -0.5 * L, -0.52 * L, L, 0.42 * L, col, { lip: 3, beanX: F.f > 0 ? 0.3 : 0.6, beanY: 0.12, shadeFrom: 0.72 });
  pane(ctx, c, () => rpoly(ctx, [[-0.27 * L, -0.34 * L, 4], [-0.2 * L, -0.48 * L, 6], [-0.065 * L, -0.48 * L, 4], [-0.065 * L, -0.34 * L, 3]]), -0.27 * L, -0.48 * L, 0.2 * L, 0.14 * L, rim);
  pane(ctx, c, () => rpoly(ctx, [[-0.035 * L, -0.34 * L, 3], [-0.035 * L, -0.48 * L, 4], [0.06 * L, -0.48 * L, 6], [0.19 * L, -0.34 * L, 4]]), -0.035 * L, -0.48 * L, 0.22 * L, 0.14 * L, rim);
  // Inner lines: the waist crease and the door seams, one handle.
  ctx.strokeStyle = alpha(lighten(col, 0.4), 0.8); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-0.46 * L, -0.255 * L); ctx.lineTo(0.44 * L, -0.235 * L); ctx.stroke();
  ctx.strokeStyle = darken(col, 0.28); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-0.05 * L, -0.33 * L); ctx.lineTo(-0.05 * L, -0.13 * L); ctx.moveTo(0.2 * L, -0.31 * L); ctx.lineTo(0.18 * L, -0.13 * L); ctx.stroke();
  rr(ctx, 0.0, -0.29 * L, 0.06 * L, 0.018 * L, 3); ctx.fillStyle = darken(col, 0.35); ctx.fill();
  lamp(ctx, 0.475 * L, -0.255 * L, 0.025 * L, 0.02 * L, c.gold);
  lamp(ctx, -0.488 * L, -0.26 * L, 0.012 * L, 0.025 * L, c.bad);
  for (const bx of [-0.52 * L, 0.46 * L]) { rr(ctx, bx, -0.17 * L, 0.06 * L, 0.05 * L, 5); ctx.fillStyle = darken(col, 0.5); ctx.fill(); }
  for (const wx of [-0.31 * L, 0.31 * L]) { arch(ctx, col, wx, -r, r * 1.2); wheel(ctx, c, wx, -r, r, ang); }
  ctx.restore();
  bodyLabel(ctx, c, o.label, F.x - f * 0.05 * L, F.y - 0.2 * L, 0.12 * L, col, o.labelSize);
  return result(F, -0.52 * L, 2, { roof: P(-0.07 * L, -0.52 * L), door: P(0.07 * L, -0.25 * L) });
}

// -- Truck -------------------------------------------------------------------------------

export function drawTruck(ctx, c, o = {}) {
  const F = frame(o, 260, 7.5), { L, f, P } = F, col = toneOf(c, o.tone ?? 8), rim = darken(col, 0.34);
  const r = 0.075 * L, ang = F.roll / r, kind = o.kind === 'open' ? 'open' : 'box';
  const load = toneOf(c, o.loadTone ?? 'gold'), cabTop = -0.44 * L;
  ctx.save();
  drawShadow(ctx, c, F.x, F.y + 2, L * 0.52, 7, 0.9);
  ctx.translate(F.x, F.y); ctx.scale(f, 1);
  rr(ctx, -0.5 * L, -0.13 * L, 0.74 * L, 0.05 * L, 3); ctx.fillStyle = darken(tyreOf(c), 0.1); ctx.fill();   // chassis rail
  let bed;
  if (kind === 'box') {
    const bx = -0.5 * L, by = -0.47 * L, bw = 0.7 * L, bh = 0.34 * L;
    shell(ctx, () => rr(ctx, bx, by, bw, bh, 8), bx, by, bw, bh, load, { lip: 3, beanX: F.bean, shadeFrom: 0.72 });
    ctx.strokeStyle = darken(load, 0.22); ctx.lineWidth = 2.5;                           // panel ribs (inner lines)
    ctx.beginPath(); for (let i = 1; i < 7; i++) { const rx = bx + (bw * i) / 7; ctx.moveTo(rx, by + 8); ctx.lineTo(rx, by + bh - 8); } ctx.stroke();
    bed = { x0: P(bx, 0).x, x1: P(bx + bw, 0).x, y: F.y + by };
  } else {
    const bx = -0.5 * L, by = -0.27 * L, bw = 0.7 * L, bh = 0.14 * L;
    shell(ctx, () => rr(ctx, bx, by, bw, bh, 5), bx, by, bw, bh, load, { lip: 3, beanX: F.bean, beanY: 0.3 });
    ctx.strokeStyle = darken(load, 0.25); ctx.lineWidth = 2.5;                           // plank seams and stakes
    ctx.beginPath(); ctx.moveTo(bx + 6, by + bh / 2); ctx.lineTo(bx + bw - 6, by + bh / 2);
    for (let i = 1; i < 5; i++) { const sx = bx + (bw * i) / 5; ctx.moveTo(sx, by + 3); ctx.lineTo(sx, by + bh - 3); }
    ctx.stroke();
    bed = { x0: P(bx + 6, 0).x, x1: P(bx + bw - 6, 0).x, y: F.y + by + 4 };
  }
  const cab = () => rpoly(ctx, [[0.22 * L, -0.09 * L, 6], [0.22 * L, cabTop, 10], [0.39 * L, cabTop, 12], [0.48 * L, -0.3 * L, 8], [0.5 * L, -0.27 * L, 6], [0.5 * L, -0.09 * L, 6]]);
  shell(ctx, cab, 0.22 * L, cabTop, 0.28 * L, -cabTop, col, { lip: 3, beanX: F.f > 0 ? 0.3 : 0.7, beanY: 0.12 });
  pane(ctx, c, () => rpoly(ctx, [[0.265 * L, -0.405 * L, 4], [0.375 * L, -0.405 * L, 6], [0.44 * L, -0.3 * L, 4], [0.265 * L, -0.3 * L, 3]]), 0.265 * L, -0.405 * L, 0.18 * L, 0.105 * L, rim);
  ctx.strokeStyle = darken(col, 0.28); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0.255 * L, -0.28 * L); ctx.lineTo(0.255 * L, -0.12 * L); ctx.stroke();
  ctx.fillStyle = alpha(lighten(col, 0.4), 0.75); ctx.fillRect(0.23 * L, -0.27 * L, 0.26 * L, 2.5);
  lamp(ctx, 0.49 * L, -0.17 * L, 0.012 * L, 0.02 * L, c.gold);
  lamp(ctx, -0.495 * L, -0.15 * L, 0.008 * L, 0.016 * L, c.bad);
  rr(ctx, 0.47 * L, -0.12 * L, 0.045 * L, 0.035 * L, 4); ctx.fillStyle = darken(col, 0.5); ctx.fill();
  for (const wx of [-0.34 * L, -0.19 * L, 0.36 * L]) { arch(ctx, wx > 0 ? col : load, wx, -r, r * 1.16); wheel(ctx, c, wx, -r, r, ang); }
  ctx.restore();
  if (kind === 'box') bodyLabel(ctx, c, o.label, F.x - f * 0.15 * L, F.y - 0.3 * L, 0.3 * L, load, o.labelSize);
  return result(F, kind === 'box' ? -0.47 * L : cabTop, 2, { bed, cab: P(0.36 * L, cabTop) });
}

// -- Scooter -----------------------------------------------------------------------------

/** A scooter (step-through). The rider is a SimFigure: pose 'sit' on anchors.seat, hands on anchors.handlebar, feet on anchors.footrest. */
export function drawScooter(ctx, c, o = {}) {
  const F = frame(o, 150, 1.8), { L, f, P } = F, col = toneOf(c, o.tone ?? 4), rim = darken(col, 0.34);
  const r = 0.13 * L, ang = F.roll / r, xr = -0.33 * L, xw = 0.36 * L, metal = mix(paleOf(c), c.label, 0.3);
  ctx.save();
  drawShadow(ctx, c, F.x, F.y + 2, L * 0.5, 5, 0.9);
  ctx.translate(F.x, F.y); ctx.scale(f, 1);
  wheel(ctx, c, xr, -r, r, ang); wheel(ctx, c, xw, -r, r, ang);
  // Fork and steering column behind the apron.
  ctx.strokeStyle = darken(metal, 0.3); ctx.lineWidth = Math.max(4, 0.04 * L); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(xw, -r); ctx.lineTo(0.31 * L, -0.6 * L); ctx.lineTo(0.29 * L, -0.76 * L); ctx.stroke();
  // Floorboard.
  shell(ctx, () => rr(ctx, -0.08 * L, -0.19 * L, 0.34 * L, 0.06 * L, 5), -0.08 * L, -0.19 * L, 0.34 * L, 0.06 * L, darken(col, 0.25), { bean: false });
  // Rear cowl over the engine and the back wheel.
  const cowl = () => rpoly(ctx, [[-0.5 * L, -0.22 * L, 10], [-0.47 * L, -0.4 * L, 14], [-0.04 * L, -0.42 * L, 12], [0.02 * L, -0.2 * L, 8], [-0.16 * L, -0.15 * L, 8]]);
  shell(ctx, cowl, -0.5 * L, -0.42 * L, 0.52 * L, 0.27 * L, col, { lip: 3, beanX: F.f > 0 ? 0.3 : 0.7, beanY: 0.25 });
  // Leg shield (apron) and the front mudguard.
  const apron = () => rpoly(ctx, [[0.2 * L, -0.14 * L, 6], [0.27 * L, -0.62 * L, 8], [0.35 * L, -0.64 * L, 6], [0.38 * L, -0.3 * L, 10], [0.33 * L, -0.15 * L, 6]]);
  shell(ctx, apron, 0.2 * L, -0.64 * L, 0.18 * L, 0.5 * L, col, { beanX: 0.4, beanW: 0.25, beanY: 0.15 });
  ctx.beginPath(); ctx.arc(xw, -r, r * 1.22, Math.PI * 1.08, Math.PI * 1.9); ctx.strokeStyle = col; ctx.lineWidth = Math.max(5, 0.05 * L); ctx.stroke();
  ctx.strokeStyle = rim; ctx.lineWidth = 2; ctx.stroke();
  // Seat, headset with its lamp, the bar and grip.
  const seatCol = mix(c.bgDeep, c.label, 0.18);
  shell(ctx, () => rr(ctx, -0.42 * L, -0.48 * L, 0.36 * L, 0.075 * L, 8), -0.42 * L, -0.48 * L, 0.36 * L, 0.075 * L, seatCol, { beanX: 0.25, shadeFrom: 0.6 });
  shell(ctx, () => rr(ctx, 0.23 * L, -0.8 * L, 0.14 * L, 0.08 * L, 8), 0.23 * L, -0.8 * L, 0.14 * L, 0.08 * L, col, { bean: false });
  lamp(ctx, 0.36 * L, -0.76 * L, 0.022 * L, 0.03 * L, c.gold);
  lamp(ctx, -0.49 * L, -0.33 * L, 0.014 * L, 0.025 * L, c.bad);
  ctx.strokeStyle = darken(metal, 0.2); ctx.lineWidth = Math.max(4, 0.035 * L); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0.25 * L, -0.79 * L); ctx.lineTo(0.13 * L, -0.77 * L); ctx.stroke();
  ctx.restore();
  const riderHeight = F.pxPerM * 1.38;
  return result(F, -0.82 * L, 2, { seat: P(-0.17 * L, -0.48 * L), handlebar: P(0.13 * L, -0.77 * L), footrest: P(0.03 * L, -0.19 * L), riderHeight });
}

// -- Canoe -------------------------------------------------------------------------------

/**
 * A canoe on the water line o.y with its paddle. part 'back' draws the far wall
 * and the inside (draw the seated paddler after it), 'front' the near hull,
 * the paddle and the water over the submerged part; 'all' both. o.stroke 0..1:
 * the catch (blade forward) to the finish (blade back). Paddler: pose 'sit' on
 * anchors.seat, hands on anchors.paddle.pivot (top) and .lower.
 */
export function drawCanoe(ctx, c, o = {}) {
  const F = frame(o, 240, 4.6), { L, f, P } = F, col = toneOf(c, o.tone ?? 'gold'), part = o.part ?? 'all';
  const hull = darken(col, 0.15), tipY = -0.13 * L;
  const th = 0.55 - 0.95 * Math.max(0, Math.min(1, o.stroke ?? 0)), plen = 0.42 * L;
  const pivot = { x: 0.07 * L, y: -0.21 * L }, ux = Math.sin(th), uy = Math.cos(th);
  const at = (d) => ({ x: pivot.x + ux * d, y: pivot.y + uy * d });
  const hullPath = () => {
    ctx.beginPath(); ctx.moveTo(0.5 * L, tipY);
    ctx.bezierCurveTo(0.44 * L, -0.01 * L, 0.3 * L, 0.055 * L, 0, 0.055 * L);
    ctx.bezierCurveTo(-0.3 * L, 0.055 * L, -0.44 * L, -0.01 * L, -0.5 * L, tipY);
    ctx.quadraticCurveTo(0, -0.01 * L, 0.5 * L, tipY); ctx.closePath();
  };
  ctx.save();
  ctx.translate(F.x, F.y); ctx.scale(f, 1);
  if (part !== 'front') {                                                             // the far wall, seen over the near gunwale
    ctx.beginPath(); ctx.moveTo(0.49 * L, tipY - 0.01 * L); ctx.quadraticCurveTo(0, -0.05 * L, -0.49 * L, tipY - 0.01 * L);
    ctx.quadraticCurveTo(0, -0.01 * L, 0.49 * L, tipY - 0.01 * L); ctx.closePath();
    ctx.fillStyle = darken(col, 0.42); ctx.fill(); ctx.strokeStyle = darken(col, 0.55); ctx.lineWidth = 2.5; ctx.stroke();
  }
  if (part !== 'back') {
    shell(ctx, hullPath, -0.5 * L, tipY, L, 0.19 * L, hull, { beanX: F.bean + 0.05 * f, beanY: 0.35, shadeFrom: 0.55 });
    ctx.strokeStyle = alpha(lighten(hull, 0.35), 0.8); ctx.lineWidth = 2.5;            // gunwale rail (inner line) and one plank seam
    ctx.beginPath(); ctx.moveTo(0.46 * L, tipY + 0.012 * L); ctx.quadraticCurveTo(0, 0.0, -0.46 * L, tipY + 0.012 * L); ctx.stroke();
    ctx.strokeStyle = darken(hull, 0.25);
    ctx.beginPath(); ctx.moveTo(0.42 * L, -0.06 * L); ctx.quadraticCurveTo(0, 0.05 * L, -0.42 * L, -0.06 * L); ctx.stroke();
    // The paddle: shaft, T grip, blade.
    const wood = darken(c.gold, 0.32), tip = at(plen), bladeC = at(plen - 0.08 * L);
    ctx.strokeStyle = darken(wood, 0.3); ctx.lineWidth = Math.max(5, 0.024 * L); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pivot.x - ux * 0.03 * L, pivot.y - uy * 0.03 * L); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.strokeStyle = wood; ctx.lineWidth = Math.max(3, 0.016 * L); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pivot.x - ux * 0.03 * L - uy * 0.025 * L, pivot.y - uy * 0.03 * L + ux * 0.025 * L);
    ctx.lineTo(pivot.x - ux * 0.03 * L + uy * 0.025 * L, pivot.y - uy * 0.03 * L - ux * 0.025 * L);
    ctx.strokeStyle = darken(wood, 0.2); ctx.lineWidth = Math.max(5, 0.022 * L); ctx.stroke();
    ellipse(ctx, bladeC.x, bladeC.y, 0.03 * L, 0.085 * L, -th); ctx.fillStyle = wood; ctx.fill();
    ctx.strokeStyle = darken(wood, 0.35); ctx.lineWidth = 2.5; ctx.stroke();
    if (o.water !== false) {                                                        // the water over what is under it
      ctx.save(); ctx.beginPath(); ctx.rect(-0.6 * L, 0, 1.2 * L, 0.3 * L); ctx.clip();      // only what is under the line
      ctx.fillStyle = alpha(c.water, 0.5); hullPath(); ctx.fill();
      ellipse(ctx, bladeC.x, bladeC.y, 0.034 * L, 0.09 * L, -th); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = alpha(lighten(c.water, 0.5), 0.9); ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) { const wx = -0.5 * L + i * 0.2 * L; ctx.moveTo(wx, 0); ctx.quadraticCurveTo(wx + 0.05 * L, -0.012 * L, wx + 0.1 * L, 0); }
      ctx.stroke();
    }
  }
  ctx.restore();
  const paddle = { pivot: P(pivot.x, pivot.y), lower: P(at(0.12 * L).x, at(0.12 * L).y), blade: P(at(plen - 0.08 * L).x, at(plen - 0.08 * L).y) };
  return result(F, Math.min(-0.36 * L, pivot.y - 0.05 * L), 0.11 * L, { seat: P(-0.06 * L, -0.07 * L), paddle, paddlerHeight: F.pxPerM * 1.6 });
}

// -- Rocket ------------------------------------------------------------------------------

function plume(ctx, c, x, y, dir, len, wid, t) {
  if (len < 2) return;
  const k = 1 + 0.07 * Math.sin(t * 31) + 0.04 * Math.sin(t * 17 + 1.3);
  const layers = [[c.flame, 1, 0.9], [c.warning, 0.7, 1], [lighten(c.warning, 0.7), 0.4, 1]];
  for (const [col, s, a] of layers) {
    const l = len * k * (0.55 + 0.45 * s), w = wid * s;
    ctx.beginPath(); ctx.moveTo(x, y - w);
    ctx.quadraticCurveTo(x + dir * l * 0.45, y - w * 1.25, x + dir * l, y);
    ctx.quadraticCurveTo(x + dir * l * 0.45, y + w * 1.25, x, y + w); ctx.closePath();
    ctx.fillStyle = alpha(col, a); ctx.fill();
  }
}

/** A rocket pointing along o.angle (0 = right, -PI/2 = up; flip mirrors). thrust 0..1 sizes the plume; retro: the nose jets fire forward instead. */
export function drawRocket(ctx, c, o = {}) {
  const F = frame(o, 200, 20), { L, f } = F, col = toneOf(c, o.tone ?? 6), metal = paleOf(c);
  const R = 0.12 * L, ang = o.angle ?? 0, thrust = Math.max(0, Math.min(1, o.thrust ?? 0)), t = o.t ?? 0;
  const cx = F.x, cy = F.y;                                                            // o.y is the rocket's centre line, not a ground
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(ang * f); ctx.scale(f, 1);
  const pl = (0.15 + 0.6 * thrust) * L;
  if (thrust > 0 && !o.retro) plume(ctx, c, -0.47 * L, 0, -1, pl, R * 0.7, t);
  // Fins behind the body.
  for (const s of [-1, 1]) {
    rpoly(ctx, [[-0.4 * L, s * R * 0.6, 3], [-0.47 * L, s * R * 2, 4], [-0.32 * L, s * R * 1.9, 5], [-0.18 * L, s * R * 0.8, 4]]);
    ctx.fillStyle = s < 0 ? col : darken(col, 0.18); ctx.fill(); ctx.strokeStyle = darken(col, 0.38); ctx.lineWidth = 2.5; ctx.stroke();
  }
  rpoly(ctx, [[-0.44 * L, -R * 0.45, 2], [-0.38 * L, -R * 0.7, 3], [-0.38 * L, R * 0.7, 3], [-0.44 * L, R * 0.45, 2]]);   // nozzle bell
  ctx.fillStyle = mix(metal, c.bgDeep, 0.5); ctx.fill(); ctx.strokeStyle = darken(mix(metal, c.bgDeep, 0.5), 0.3); ctx.lineWidth = 2.5; ctx.stroke();
  const body = () => {
    ctx.beginPath(); ctx.moveTo(-0.39 * L, -R); ctx.lineTo(0.18 * L, -R);
    ctx.bezierCurveTo(0.36 * L, -R, 0.46 * L, -R * 0.4, 0.5 * L, 0);
    ctx.bezierCurveTo(0.46 * L, R * 0.4, 0.36 * L, R, 0.18 * L, R);
    ctx.lineTo(-0.39 * L, R); ctx.quadraticCurveTo(-0.41 * L, 0, -0.39 * L, -R); ctx.closePath();
  };
  shell(ctx, body, -0.4 * L, -R, 0.9 * L, 2 * R, metal, { beanX: 0.3, beanY: 0.22, beanW: 0.2, shadeFrom: 0.6 });
  ctx.save(); body(); ctx.clip();                                                     // nose cone and a band in the tone
  ctx.fillStyle = col; ctx.fillRect(0.3 * L, -R, 0.3 * L, 2 * R); ctx.fillRect(-0.06 * L, -R, 0.07 * L, 2 * R);
  ctx.fillStyle = darken(col, 0.17); ctx.fillRect(-0.06 * L, R * 0.24, 0.66 * L, R);
  ctx.restore();
  body(); ctx.strokeStyle = darken(metal, 0.4); ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = alpha(lighten(metal, 0.5), 0.8); ctx.fillRect(-0.34 * L, -R * 0.62, 0.5 * L, 3);   // inner line along the lit side
  if (thrust > 0 && o.retro) for (const s of [-1, 1]) {
    rr(ctx, 0.22 * L, s * R - 4, 0.05 * L, 8, 3); ctx.fillStyle = mix(metal, c.bgDeep, 0.5); ctx.fill();
    plume(ctx, c, 0.27 * L, s * R * 1.05, 1, pl * 0.45, R * 0.28, t + s);
  }
  ctx.restore();
  const W = (lx, ly) => { const ca = Math.cos(ang * f), sa = Math.sin(ang * f); return { x: cx + f * lx * ca - ly * sa, y: cy + f * lx * sa + ly * ca }; };
  const anchors = { nose: W(0.5 * L, 0), nozzle: W(-0.46 * L, 0), centre: W(0, 0), plumeEnd: W(o.retro ? 0.27 * L + pl * 0.45 : -0.47 * L - pl, 0) };
  const res = result(F, 0, 0, anchors);
  const xs = [anchors.nose.x, anchors.nozzle.x, W(-0.47 * L, R * 2).x, W(-0.47 * L, -R * 2).x], ys = [anchors.nose.y, anchors.nozzle.y, W(-0.47 * L, R * 2).y, W(-0.47 * L, -R * 2).y];
  res.x0 = Math.min(...xs); res.y0 = Math.min(...ys); res.w = Math.max(...xs) - res.x0; res.h = Math.max(...ys) - res.y0;
  res.box = { x0: res.x0, y0: res.y0, w: res.w, h: res.h };
  return res;
}

// -- Balloon on a thread -----------------------------------------------------------------

/**
 * The balloon rocket: a straight thread from x0 to x1 at y, a straw on it at
 * o.at, a balloon taped under the straw with its neck to the back. o.air 0..1
 * (1 full) sizes it; o.jet (default: 0 < air < 1) draws the air leaving the
 * neck, puffs moving with o.t. Faces right (moves right, jet left); flip mirrors.
 */
export function drawBalloonOnThread(ctx, c, o = {}) {
  const x0 = o.x0 ?? 40, x1 = o.x1 ?? 640, y = o.y ?? 160, f = o.flip ? -1 : 1, at = o.at ?? (x0 + x1) / 2;
  const R = o.r ?? 46, air = Math.max(0, Math.min(1, o.air ?? 1)), t = o.t ?? 0, col = toneOf(c, o.tone ?? 4);
  const rb = R * (0.35 + 0.65 * Math.cbrt(air)), rx = rb * 1.18, ry = rb * 0.92;
  const bx = at - f * rb * 0.15, by = y + 10 + ry;
  // Thread and its two clamps.
  ctx.save();
  ctx.strokeStyle = mix(c.labelMuted, c.label, 0.2); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  for (const px of [x0, x1]) shell(ctx, () => rr(ctx, px - 7, y - 16, 14, 32, 5), px - 7, y - 16, 14, 32, mix(paleOf(c), c.label, 0.3), { bean: false });
  // Air jet behind the neck.
  const neckX = bx - f * (rx + 4), jet = o.jet ?? (air > 0 && air < 1);
  let jetEnd = { x: neckX, y: by };
  if (jet) {
    const jl = 40 + 50 * (1 - air);
    ctx.strokeStyle = alpha(mix(c.glass, c.label, 0.3), 0.85); ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.setLineDash([10, 9]); ctx.lineDashOffset = -t * 60 * 1;
    ctx.beginPath();
    for (const s of [-1, 0, 1]) { ctx.moveTo(neckX - f * 8, by + s * 3); ctx.quadraticCurveTo(neckX - f * jl * 0.5, by + s * 12, neckX - f * jl, by + s * 20); }
    ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < 3; i++) {
      const u = ((t * 1.4 + i / 3) % 1 + 1) % 1, pr = 4 + 8 * u;
      ctx.beginPath(); ctx.arc(neckX - f * (12 + jl * u), by + (i - 1) * 10 * u, pr, 0, TAU);
      ctx.fillStyle = alpha(mix(c.glass, c.label, 0.3), 0.5 * (1 - u)); ctx.fill();
    }
    jetEnd = { x: neckX - f * jl, y: by };
  }
  // Balloon body, neck and knot.
  ctx.beginPath(); ctx.moveTo(bx - f * rx * 0.9, by - 5); ctx.lineTo(neckX, by - 4); ctx.lineTo(neckX, by + 4); ctx.lineTo(bx - f * rx * 0.9, by + 5); ctx.closePath();
  ctx.fillStyle = darken(col, 0.12); ctx.fill(); ctx.strokeStyle = darken(col, 0.38); ctx.lineWidth = 2; ctx.stroke();
  ellipse(ctx, neckX, by, 4, 6); ctx.fillStyle = darken(col, 0.25); ctx.fill();
  shell(ctx, () => ellipse(ctx, bx, by, rx, ry), bx - rx, by - ry, 2 * rx, 2 * ry, col, { beanX: 0.3, beanY: 0.24, beanW: 0.16, shadeFrom: 0.66 });
  ctx.fillStyle = alpha(lighten(col, 0.5), 0.5); ellipse(ctx, bx - rx * 0.1, by - ry * 0.62, rx * 0.4, ry * 0.08); ctx.fill();   // inner line: the lit crown
  // Straw on the thread, two strips of tape down to the balloon.
  const sw = Math.max(60, rx * 1.4), sx = at - sw / 2, strawCol = toneOf(c, o.strawTone ?? 1);
  for (const s of [-0.28, 0.28]) { rr(ctx, at + s * sw - 6, y - 2, 12, by - ry - y + 10, 3); ctx.fillStyle = alpha(paleOf(c), 0.85); ctx.fill(); ctx.strokeStyle = darken(paleOf(c), 0.25); ctx.lineWidth = 1.5; ctx.stroke(); }
  shell(ctx, () => rr(ctx, sx, y - 7, sw, 14, 7), sx, y - 7, sw, 14, strawCol, { bean: false, shadeFrom: 0.55 });
  ctx.strokeStyle = alpha(lighten(strawCol, 0.6), 0.9); ctx.lineWidth = 3;
  ctx.beginPath(); for (let i = 1; i < 5; i++) { const qx = sx + (sw * i) / 5; ctx.moveTo(qx - 4, y + 5); ctx.lineTo(qx + 4, y - 5); } ctx.stroke();
  ctx.restore();
  const box = { x0: Math.min(x0, x1) - 8, y0: y - 16, w: Math.abs(x1 - x0) + 16, h: by + ry - y + 16 };
  return { ...box, box, ground: y, front: at + f * sw / 2, rear: neckX, f, pxPerM: o.pxPerM ?? 1,
    anchors: { straw: { x: at, y }, centre: { x: bx, y: by }, neck: { x: neckX, y: by }, jetEnd, r: rb } };
}

// -- W1 additions: a ledge and a road barrier --------------------------------------------

/**
 * A building edge or a cliff ledge (side view). The edge is at o.x; the block
 * runs back o.w px (facing 1: to the left of the edge, so things leave it to the
 * right; -1 mirrors). o: { x, y (top surface), ground (y below, default y + 200),
 * w = 160, facing = 1, kind 'building' | 'cliff', tone }.
 * Returns { top, front (edge x), rear, box, anchors: { edge, foot } }.
 */
export function drawLedge(ctx, c, o = {}) {
  const x = o.x ?? 200, y = o.y ?? 200, g = o.ground ?? y + 200, w = o.w ?? 160, f = o.facing === -1 ? -1 : 1, kind = o.kind === 'cliff' ? 'cliff' : 'building';
  const x0 = Math.min(x, x - f * w), h = g - y;
  ctx.save();
  if (kind === 'building') {
    const col = o.tone != null ? toneOf(c, o.tone) : mix(paleOf(c), c.waste, 0.35);
    shell(ctx, () => rr(ctx, x0, y, w, h + 8, 4), x0, y, w, h, col, { beanX: 0.2, beanY: 0.05, shadeFrom: 0.85 });
    ctx.fillStyle = darken(col, 0.14); ctx.fillRect(f > 0 ? x - 12 : x0 + 2, y + 2, 10, h);     // the shade face at the edge
    const cols = Math.max(1, Math.floor((w - 24) / 46)), rows = Math.max(1, Math.floor((h - 30) / 56)), pw = 26, ph = 32;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const px = x0 + 14 + (cols > 1 ? (j * (w - 28 - pw)) / (cols - 1) : (w - 28 - pw) / 2), py = y + 26 + i * 56;
      pane(ctx, c, () => rr(ctx, px, py, pw, ph, 4), px, py, pw, ph, darken(col, 0.4));
    }
    shell(ctx, () => rr(ctx, x0 - 6, y - 12, w + 12, 16, 5), x0 - 6, y - 12, w + 12, 16, lighten(col, 0.12), { lip: 3, bean: false });   // parapet
  } else {
    const rock = o.tone != null ? toneOf(c, o.tone) : mix(c.waste, c.gold, 0.22), jag = [0, 10, -6, 14, -4, 12, -8, 6];
    const pts = [[x - f * w, y, 4], [x, y, 6]];
    for (let i = 1; i <= 7; i++) pts.push([x + f * jag[i] * 0.8 - f * i * 2, y + (h * i) / 7, 6]);
    pts.push([x - f * w, g + 6, 4]);
    shell(ctx, () => rpoly(ctx, f > 0 ? pts : pts.slice().reverse()), x0, y, w + 14, h, rock, { beanX: f > 0 ? 0.25 : 0.7, beanY: 0.12, shadeFrom: 0.7 });
    ctx.strokeStyle = alpha(darken(rock, 0.3), 0.7); ctx.lineWidth = 2.5; ctx.lineCap = 'round';   // strata
    ctx.beginPath();
    for (let i = 1; i < 5; i++) { const sy = y + (h * i) / 5; ctx.moveTo(x - f * (w - 10), sy); ctx.quadraticCurveTo(x - f * w * 0.5, sy + 8, x - f * 18, sy - 3); }
    ctx.stroke();
    const grass = darken(c.good, 0.15);
    rr(ctx, x0 - 4, y - 8, w + 10, 14, 7); ctx.fillStyle = grass; ctx.fill(); ctx.strokeStyle = darken(grass, 0.35); ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = alpha(lighten(grass, 0.5), 0.8); ctx.fillRect(x0 + 6, y - 5, w * 0.5, 3);
  }
  ctx.restore();
  return { top: y, front: x, rear: x - f * w, box: { x0: x0 - 6, y0: y - 12, w: w + 14, h: g - y + 12 }, anchors: { edge: { x, y }, foot: { x, y: g } } };
}

/**
 * A striped road barrier (a barricade board on two legs), standing on o.y.
 * o: { x (centre), y (ground), w = 120, h = 80, tone = 'bad', flip }. Traffic
 * comes from the left; front is the face it meets (flip: from the right).
 * Returns { top, front, rear, box, anchors: { board } }.
 */
export function drawBarrier(ctx, c, o = {}) {
  const x = o.x ?? 500, y = o.y ?? 420, w = o.w ?? 120, h = o.h ?? 80, col = toneOf(c, o.tone ?? 'bad'), white = paleOf(c), metal = mix(c.bgSurface, c.label, 0.45);
  ctx.save();
  drawShadow(ctx, c, x, y + 1, w * 0.55, 5, 0.8);
  for (const s of [-1, 1]) {
    const lx = x + s * w * 0.38;
    rr(ctx, lx - 4, y - h, 8, h, 3); ctx.fillStyle = metal; ctx.fill(); ctx.strokeStyle = darken(metal, 0.4); ctx.lineWidth = 2; ctx.stroke();
    shell(ctx, () => rr(ctx, lx - 16, y - 10, 32, 10, 4), lx - 16, y - 10, 32, 10, darken(metal, 0.2), { bean: false });
  }
  const board = (by, bh) => {
    const path = () => rr(ctx, x - w / 2, by, w, bh, 5);
    path(); ctx.fillStyle = white; ctx.fill();
    ctx.save(); path(); ctx.clip();
    ctx.fillStyle = col;
    for (let sx = x - w / 2 - bh; sx < x + w / 2 + bh; sx += 2 * bh * 0.8) { ctx.beginPath(); ctx.moveTo(sx, by + bh); ctx.lineTo(sx + bh * 0.8, by + bh); ctx.lineTo(sx + bh * 1.6, by); ctx.lineTo(sx + bh * 0.8, by); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = alpha(darken(col, 0.4), 0.25); ctx.fillRect(x - w / 2, by + bh * 0.65, w, bh);
    ctx.fillStyle = alpha(lighten(white, 0.5), 0.6); ctx.fillRect(x - w / 2 + 4, by + 2, w - 8, 2.5);
    ctx.restore();
    ctx.save(); ctx.translate(0, 3); path(); ctx.strokeStyle = darken(col, 0.45); ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    path(); ctx.strokeStyle = darken(col, 0.35); ctx.lineWidth = 2.5; ctx.stroke();
  };
  board(y - h, h * 0.34); board(y - h * 0.5, h * 0.2);
  ctx.restore();
  const front = o.flip ? x + w / 2 : x - w / 2;
  return { top: y - h, front, rear: o.flip ? x - w / 2 : x + w / 2, box: { x0: x - w / 2 - 16, y0: y - h, w: w + 32, h }, anchors: { board: { x, y: y - h * 0.83 } } };
}
