/**
 * SimQuill - Quill the penguin on canvas, for SimScene scenes (the arcade's
 * Quill's Catch first; any canvas scene after it).
 *
 * The shapes come from core/quill/quillShapes.js, the same table the SVG rig
 * (QuillRig.js, <quill-mascot>) is built from, and the colours from the same
 * --quill-* tokens, so the canvas Quill and the app's Quill are one bird.
 * Path2D objects are built once per page and reused.
 *
 * Use:
 *   import { QUILL_COLOR_MAP, drawQuill } from './SimQuill.js';
 *   static COLOR_MAP = { ...COLOR_TOKEN_MAP, ...QUILL_COLOR_MAP };
 *   drawQuill(ctx, this.colors, { x, y, h: 120, face: 'happy', lean: 0.1 });
 *
 * Options (all optional):
 *   x, y      where his feet touch the ground (design px)
 *   h         height of his 240x300 box in px (default 120)
 *   face      'happy' | 'surprised' | 'sad' | 'angry' | 'heart' (brows, and heart eyes)
 *   mouth     'closed' | 'open'
 *   blink     0..1 (1 = eyes shut)
 *   joy       0..1 (1 = the happy "^ ^" eyes of his cheer, over the open eyes)
 *   look      [dx, dy] pupil offset in rig units (about +-4)
 *   lean      tilt in radians about his feet (a lean into a run)
 *   squash    [sx, sy] about his feet (a landing squash, a jump stretch)
 *   wingL, wingR  wing turn in radians (negative lifts the right wing, positive the left)
 *   scarf     scarf-tail flutter in radians
 *   flip      true faces him the other way
 *   shadow    shadow strength 0..1 (default 1)
 *   cap       a colour: draws a small cap on his head (the orchard skin)
 *   alpha     overall opacity
 */
import { QUILL_PATHS as P, QUILL_PARTS as R, QUILL_BODY_Y, QUILL_BROWS } from '../../../core/quill/quillShapes.js';
import { alpha, darken, lighten } from './SimLook.js';
import { lookOf } from './lookProfile.js';

/** The --quill-* tokens (theme.css) as this.colors keys; fallbacks are the dark theme's. */
export const QUILL_COLOR_MAP = {
  qBodyHi: ['--quill-body-hi', '#6a6ee5'],
  qBodyMid: ['--quill-body-mid', '#4348bd'],
  qBodyLo: ['--quill-body-lo', '#1f2160'],
  qLimb: ['--quill-limb', '#1d2058'],
  qBelly: ['--quill-belly', '#ffffff'],
  qBellyLo: ['--quill-belly-lo', '#e8eeff'],
  qFoot: ['--quill-foot', '#ff9e45'],
  qFootLo: ['--quill-foot-lo', '#c45f12'],
  qBeak: ['--quill-beak', '#ff8f3f'],
  qBeakLo: ['--quill-beak-lo', '#c8631a'],
  qMouth: ['--quill-beak-mouth', '#5a1d12'],
  qTongue: ['--quill-tongue', '#ff7b93'],
  qScarf: ['--quill-scarf', '#ff6b8a'],
  qScarfLo: ['--quill-scarf-lo', '#c43d5e'],
  qScarfStripe: ['--quill-scarf-stripe', '#ffc9d8'],
  qScarfTail: ['--quill-scarf-tail', '#e8506f'],
  qCheek: ['--quill-cheek', 'rgba(255,158,192,0.45)'],
  qIris: ['--quill-iris', '#181240'],
  qHeart: ['--quill-heart', '#ff5ca8'],
};

const BOX_W = 240, BOX_H = 300, FEET_Y = 276;
// Pivots, matching the SVG rig's CSS transform-origins (fill-box percentages).
const PIV = {
  wingL: [60.4, 155.7], wingR: [179.6, 155.7],
  browL: [104, 80.5], browR: [136, 80.5],
  tail: [163.7, 193],
};

let PATHS = null;
function paths() {
  if (PATHS || typeof Path2D === 'undefined') return PATHS;
  PATHS = Object.fromEntries(Object.entries(P).map(([k, d]) => [k, new Path2D(d)]));
  return PATHS;
}

function ell(ctx, [cx, cy, rx, ry]) { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); }
function circ(ctx, [cx, cy, r]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }
function turn(ctx, [px, py], a) { ctx.translate(px, py); ctx.rotate(a); ctx.translate(-px, -py); }

/** Draw Quill. `c` is this.colors with QUILL_COLOR_MAP merged in. */
export function drawQuill(ctx, c, o = {}) {
  const ps = paths();
  if (!ps || !lookOf().mascot) return;
  const h = o.h ?? 120;
  const k = h / BOX_H;
  const white = lighten(c.qBelly, 1);
  const face = QUILL_BROWS[o.face] ? o.face : 'happy';
  const [browDy, browDeg] = QUILL_BROWS[face];
  const [sx, sy] = o.squash || [1, 1];

  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.translate(o.x ?? 0, o.y ?? 0);
  // shadow stays flat on the ground: drawn before the lean and the squash
  if ((o.shadow ?? 1) > 0) {
    ctx.save();
    ctx.scale(k * sx, k);
    ctx.fillStyle = alpha(darken(c.qBodyLo, 1), 0.28 * (o.shadow ?? 1));
    ell(ctx, [0, R.shadow[1] - FEET_Y, R.shadow[2], R.shadow[3]]);
    ctx.fill();
    ctx.restore();
  }
  ctx.rotate(o.lean || 0);
  ctx.scale(k * sx * (o.flip ? -1 : 1), k * sy);
  ctx.translate(-BOX_W / 2, -FEET_Y);

  // legs and feet
  ctx.fillStyle = c.qLimb;
  for (const leg of [R.legL, R.legR]) { ctx.beginPath(); roundRect(ctx, ...leg); ctx.fill(); }
  for (const f of [R.footL, R.footR]) {
    const g = ctx.createLinearGradient(0, f[1] - f[3], 0, f[1] + f[3]);
    g.addColorStop(0, c.qFoot); g.addColorStop(1, c.qFootLo);
    ctx.fillStyle = g; ell(ctx, f); ctx.fill();
  }

  // body, shine, belly
  const gb = ctx.createLinearGradient(0, QUILL_BODY_Y[0], 0, QUILL_BODY_Y[1]);
  gb.addColorStop(0, c.qBodyHi); gb.addColorStop(0.5, c.qBodyMid); gb.addColorStop(1, c.qBodyLo);
  ctx.fillStyle = gb; ctx.fill(ps.body);
  ctx.fillStyle = alpha(white, 0.18); ctx.fill(ps.shine);
  const gl = ctx.createLinearGradient(0, R.belly[1] - R.belly[3], 0, R.belly[1] + R.belly[3]);
  gl.addColorStop(0, c.qBelly); gl.addColorStop(1, c.qBellyLo);
  ctx.fillStyle = gl; ell(ctx, R.belly); ctx.fill();
  ctx.fillStyle = alpha(white, 0.6); ell(ctx, R.bellyShine); ctx.fill();

  // wings
  ctx.fillStyle = c.qLimb;
  ctx.save(); turn(ctx, PIV.wingL, o.wingL || 0); ctx.fill(ps.wingL); ctx.restore();
  ctx.save(); turn(ctx, PIV.wingR, o.wingR || 0); ctx.fill(ps.wingR); ctx.restore();

  // scarf
  ctx.fillStyle = c.qScarf; ctx.fill(ps.scarf);
  ctx.strokeStyle = c.qScarfStripe; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.stroke(ps.scarfStripes);
  ctx.strokeStyle = alpha(c.qScarfLo, 0.4); ctx.lineWidth = 2; ctx.stroke(ps.scarfEdge);
  ctx.save(); turn(ctx, PIV.tail, o.scarf || 0); ctx.fillStyle = c.qScarfTail; ctx.fill(ps.scarfTail); ctx.restore();

  // cheeks
  for (const ch of [R.cheekL, R.cheekR]) {
    const g = ctx.createRadialGradient(ch[0], ch[1], 0, ch[0], ch[1], ch[2]);
    g.addColorStop(0, c.qCheek); g.addColorStop(1, alpha(c.qCheek, 0));
    ctx.fillStyle = g; circ(ctx, ch); ctx.fill();
  }

  // brows
  ctx.fillStyle = c.qLimb;
  ctx.save(); ctx.translate(0, browDy); turn(ctx, PIV.browL, (browDeg * Math.PI) / 180); ctx.fill(ps.browL); ctx.restore();
  ctx.save(); ctx.translate(0, browDy); turn(ctx, PIV.browR, (-browDeg * Math.PI) / 180); ctx.fill(ps.browR); ctx.restore();

  // eyes (or hearts)
  const [lx, ly] = o.look || [0, 0];
  if (face === 'heart') {
    ctx.fillStyle = c.qHeart;
    for (const hp of [R.heartL, R.heartR]) {
      ctx.save(); ctx.translate(hp[0], hp[1]); ctx.scale(hp[2], hp[2]); ctx.fill(ps.heart); ctx.restore();
    }
  } else {
    const joy = Math.min(1, Math.max(0, o.joy || 0));
    const shut = Math.max(joy, Math.min(1, Math.max(0, o.blink || 0)));
    for (const [eye, iris, glint] of [[R.eyeL, R.irisL, R.glintL], [R.eyeR, R.irisR, R.glintR]]) {
      ctx.save();
      ctx.translate(eye[0], eye[1]); ctx.scale(1, 1 - shut * 0.95); ctx.translate(-eye[0], -eye[1]);
      ctx.fillStyle = white; ell(ctx, eye); ctx.fill();
      ctx.translate(lx, ly);
      ctx.fillStyle = c.qIris; circ(ctx, iris); ctx.fill();
      ctx.fillStyle = white; circ(ctx, glint); ctx.fill();
      ctx.restore();
    }
    if (joy > 0.05) {
      // the rig's q-joy arcs: two upturned curves over the shut eyes
      ctx.save();
      ctx.globalAlpha *= joy;
      ctx.strokeStyle = c.qIris; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(84, 112); ctx.quadraticCurveTo(100, 86, 116, 112);
      ctx.moveTo(124, 112); ctx.quadraticCurveTo(140, 86, 156, 112);
      ctx.stroke();
      ctx.restore();
    }
  }

  // beak
  if (o.mouth === 'open') {
    ctx.fillStyle = c.qMouth; ell(ctx, R.mouth); ctx.fill();
    ctx.fillStyle = c.qTongue; circ(ctx, R.tongue); ctx.fill();
    ctx.fillStyle = beakFill(ctx, c); ctx.fill(ps.beakOpenTop);
  } else {
    ctx.fillStyle = beakFill(ctx, c); ctx.fill(ps.beak);
    ctx.strokeStyle = c.qBeakLo; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.stroke(ps.beakLine);
  }

  // head tuft, or a cap
  if (o.cap) {
    ctx.fillStyle = darken(o.cap, 0.25);
    ctx.beginPath(); ctx.ellipse(150, 48, 44, 9, -0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = o.cap;
    ctx.beginPath(); ctx.moveTo(70, 52); ctx.quadraticCurveTo(76, 4, 124, 6); ctx.quadraticCurveTo(170, 8, 172, 44); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lighten(o.cap, 0.35);
    ctx.beginPath(); ctx.arc(122, 8, 7, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = c.qBodyHi; ctx.fill(ps.tuft);
  }
  ctx.restore();
}

function beakFill(ctx, c) {
  const g = ctx.createRadialGradient(120, 132, 0, 120, 142, 22);
  g.addColorStop(0, c.qBeak); g.addColorStop(1, c.qBeakLo);
  return g;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** His box in px for a given height: { w, h, headY } (headY: top of head above the feet). */
export function quillBox(h = 120) {
  const k = h / BOX_H;
  return { w: BOX_W * k, h, headY: (FEET_Y - 18) * k };
}
