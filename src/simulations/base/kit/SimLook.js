/**
 * SimLook - the shared, subject-neutral canvas look for polished scenes
 * (docs/simulation-authoring.md 4.6 in the authoring kit). Not a scene: only
 * helpers plus the Burst effects class. Pair with SimScene.js (the skeleton).
 *
 * What is here:
 *   W, H, ZONES, heroBox         the 680x520 design space and its named zones
 *   SETTLE_MS, keepAwake         coming to rest (CONTINUOUS = false scenes)
 *   COLOR_TOKEN_MAP, loadColors  closed-palette colours (readSimColors)
 *   mix alpha lighten darken     colour maths on resolved tokens
 *   parseColor hslOf hsl         channels and HSL of a resolved colour
 *   contrast inkOn               WCAG ratio; the readable ink for a fill
 *   font, mulberry32             type, seeded random
 *   outBack outElastic inOutSine easing
 *   rr stadium ellipse blob sparkle star   the shape vocabulary (house style 4.5)
 *   pill chipSize chipRow chipColumn popAt leader speechBubble   chips and labels
 *   MIN_PX                       14px type floor (chips raise smaller sizes to it)
 *   wrapLines wrapText fitText captionBar   wrapped text that returns its size
 *   vectorArrow                  magnitude-scaled labelled vector (equal forces, equal arrows)
 *   placeLabels                  collision-free label boxes clamped to a frame
 *   clamp clamp01 lerp           numeric helpers (also on SimDraw)
 *   drawBackdrop drawDepth drawFloor drawSunbeam drawSpotlight drawVignette
 *   drawMotes drawTwinkles drawShadow drawShelf drawBench          the set
 *   drawCard drawReadout drawMeter drawBadge                         cards and readings
 *   drawFace                     big-eyed face for any character or object
 *   drawNoteLine                 default one-line note (SimScene NOTE_STAGE)
 *   drawNoteCard                 opt-in modal note card (NOTE_STYLE = 'card')
 *   Burst                        rings and twinkles
 *
 * Composition rule (the fix for the empty middle band): backdrop, depth and
 * floor first, then ONE hero object at least a third of the width in
 * ZONES.hero (heroBox gives its scale) standing in a spotlight on a contact
 * shadow, side cards for readings in ZONES.left / ZONES.right, chips at the
 * edges (ZONES.top / ZONES.bottom), never on top of the evidence.
 *
 * Look: flat fills, one darker cushion shade under each thing, one lighter
 * gloss highlight, a flat contact shadow under anything standing. Gradients
 * only for literal light (sunbeam, spotlight, vignette). The backdrop and floor
 * are kit-owned risograph paper (cached grain + halftone corners); a scene adds
 * no grain of its own. Every resolve moment
 * gets a celebration. Colours come from this.colors only; fallback hexes live
 * in COLOR_TOKEN_MAP and nowhere else. ASCII only (kit convention).
 * The shape and motion numbers a look owns come from lookOf() (lookProfile.js).
 */
import { readSimColors } from 'simulations/base/SimTheme.js';
import { reducedMotion } from './SimAnim.js';
import { lookOf, cornerOf } from './lookProfile.js';
import { SETTINGS, DEFAULT_SETTING, resolveSetting } from './paperKind.js';

export const W = 680;
export const H = 520;
const TAU = Math.PI * 2;

// -- Layout -------------------------------------------------------------------

/**
 * Named rects in the 680x520 design space. top/bottom are chip bands, left/right
 * hold reading cards, hero holds the one big object (42% of the width). heroWide
 * is the hero zone for a scene with no side cards.
 */
export const ZONES = {
  top:      { x: 16,  y: 12,  w: 648, h: 56 },
  left:     { x: 16,  y: 80,  w: 170, h: 360 },
  hero:     { x: 198, y: 80,  w: 284, h: 360 },
  right:    { x: 494, y: 80,  w: 170, h: 360 },
  bottom:   { x: 16,  y: 452, w: 648, h: 56 },
  heroWide: { x: 16,  y: 80,  w: 648, h: 360 },
};

/**
 * Place a hero object drawn in its own w x h units: returns the centred rect
 * { x, y, w, h, cx, cy, s } inside the zone (default ZONES.hero), where s is the
 * largest scale that fits (ctx.translate(x, y); ctx.scale(s, s); then draw in
 * the object's own units). o: { zone, pad, max }.
 */
export function heroBox(w, h, o = {}) {
  const z = o.zone ?? ZONES.hero;
  const pad = o.pad ?? 0;
  const s = Math.min((z.w - pad * 2) / w, (z.h - pad * 2) / h, o.max ?? Infinity);
  const bw = w * s, bh = h * s;
  const x = z.x + (z.w - bw) / 2, y = z.y + (z.h - bh) / 2;
  return { x, y, w: bw, h: bh, cx: x + bw / 2, cy: y + bh / 2, s };
}

// -- Coming to rest -----------------------------------------------------------

/**
 * A CONTINUOUS = false scene keeps its loop open while something that matters
 * is still moving (a run, a scripted sequence, an easing ball), then SETTLE_MS
 * more so verdict pops and ring tails finish, and parks. A beat, a control
 * or a pointer wakes it. Ambient flourish (drifting depth shapes, motes,
 * twinkles, a breathing hero) runs while the loop is awake and may freeze.
 * Under reduced motion (SimAnim.reducedMotion) the motes and twinkles helpers
 * freeze at t = 0 (the paper backdrop never moves).
 */
export const SETTLE_MS = 1500;

export function keepAwake(scene, moving) {
  if (moving) scene.animateFor(SETTLE_MS);
}

// -- Colours ------------------------------------------------------------------

export const COLOR_TOKEN_MAP = {
  bgDeep:      ['--sim-bg-deep',        '#0d0a22'],
  bgSurface:   ['--sim-bg-surface',     '#181134'],
  raised:      ['--sim-surface-raised', '#22184a'],
  label:       ['--sim-label',          '#fdfaff'],
  labelMuted:  ['--sim-label-muted',    '#b6abd8'],
  stroke:      ['--sim-stroke',         '#5b4f86'],
  accent:      ['--sim-accent',         '#57ccff'],
  good:        ['--sim-good',           '#54e6a5'],
  bad:         ['--sim-bad',            '#ff8f7a'],
  warning:     ['--sim-warning',        '#ffcf5c'],
  shape:       ['--sim-shape',          '#57ccff'],
  track:       ['--sim-track',          '#2a1f5e'],
  gold:        ['--sim-gold',           '#ffcf5c'],
  glass:       ['--sim-glass',          '#a8d8ff'],
  water:       ['--sim-water',          '#38bdf8'],
  flame:       ['--sim-flame',          '#ff8f3f'],
  electron:    ['--sim-electron',       '#57ccff'],
  proton:      ['--sim-proton',         '#ff6b5e'],
  neutron:     ['--sim-neutron',        '#b6abd8'],
  cation:      ['--sim-cation',         '#ff8f7a'],
  anion:       ['--sim-anion',          '#57ccff'],
  waste:       ['--sim-waste',          '#78716c'],
  // The setting (the world behind the scene; sim-theme.css "Settings"): night values here, day in the light theme.
  setSkyTop:   ['--sim-set-sky-top',    '#0c0924'],
  setSkyLow:   ['--sim-set-sky-low',    '#2a2160'],
  setAurora:   ['--sim-set-aurora',     '#3fd2b8'],
  setBand:     ['--sim-set-band',       '#c2603a'],
  setStar:     ['--sim-set-star',       '#fff9e6cc'],
  setPool:     ['--sim-set-pool',       '#6a5fb866'],
  setSun:      ['--sim-set-sun',        '#ffffff00'],
  setGround:   ['--sim-set-ground',     '#1b2b3f'],
  setGroundFar:['--sim-set-ground-far', '#262d55'],
  setWaterTop: ['--sim-set-water-top',  '#10406e'],
  setWaterDeep:['--sim-set-water-deep', '#0a1a3c'],
  setShaft:    ['--sim-set-shaft',      '#9fdcff'],
  setSand:     ['--sim-set-sand',       '#46415f'],
  setParchment:['--sim-set-parchment',  '#5c4836'],
  setWashTop:  ['--sim-set-wash-top',   '#2c1730'],
  setWashLow:  ['--sim-set-wash-low',   '#5a2f3e'],
  setDesk:     ['--sim-set-desk',       '#0c0a08'],
  setFolder:   ['--sim-set-folder',     '#2e2418'],
  setFolderEdge:['--sim-set-folder-edge','#1d170f'],
  setCard:     ['--sim-set-card',       '#3e372d'],
  setPaper:    ['--sim-set-paper',      '#4d4438'],
  setRule:     ['--sim-set-rule',       '#4a4237'],
  setShade:    ['--sim-set-shade',      '#0a070594'],
  // What the beat is about (SimAnnotate): the look's signature colour and its tint.
  annot:       ['--sim-annot',          '#ff7d93'],
  annotTint:   ['--sim-annot-tint',     '#ff7d9333'],
  s1:          ['--sim-series-1',       '#38bdf8'],
  s2:          ['--sim-series-2',       '#fbbf24'],
  s3:          ['--sim-series-3',       '#34d399'],
  s4:          ['--sim-series-4',       '#f472b6'],
  s5:          ['--sim-series-5',       '#a78bfa'],
  s6:          ['--sim-series-6',       '#f87171'],
  s7:          ['--sim-series-7',       '#22d3ee'],
  s8:          ['--sim-series-8',       '#fb923c'],
  // Text-safe versions of the series (readable as text on the backdrop in both themes).
  s1ink:       ['--sim-series-1-ink',   '#38bdf8'],
  s2ink:       ['--sim-series-2-ink',   '#fbbf24'],
  s3ink:       ['--sim-series-3-ink',   '#34d399'],
  s4ink:       ['--sim-series-4-ink',   '#f472b6'],
  s5ink:       ['--sim-series-5-ink',   '#a78bfa'],
  s6ink:       ['--sim-series-6-ink',   '#f87171'],
  s7ink:       ['--sim-series-7-ink',   '#22d3ee'],
  s8ink:       ['--sim-series-8-ink',   '#fb923c'],
  fontBody:    ['--sim-font',           "'Nunito', system-ui, sans-serif"],
  fontDisplay: ['--sim-font-display',   "'Fredoka', 'Nunito', system-ui, sans-serif"],
  fontMono:    ['--sim-font-mono',      "'Nunito Rupee', 'Courier Prime', 'Courier New', monospace"],
  fontNumeral: ['--sim-font-numeral',   "'Fredoka', 'Nunito', system-ui, sans-serif"],
};

/** Resolve COLOR_TOKEN_MAP (or a scene's own extension of it) against the container. */
export function loadColors(container, map = COLOR_TOKEN_MAP) {
  return readSimColors(container, map);
}

/** A resolved colour as { r, g, b, a } (hex or rgb[a] strings; anything else is mid grey). */
export function parseColor(col) {
  const s = String(col || '').trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((ch) => ch + ch).join('');
    return {
      r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(s);
  if (m) {
    let a = 1;
    if (m[4]) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  return { r: 128, g: 128, b: 128, a: 1 };
}

function toStr({ r, g, b, a }) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgba(${c(r)},${c(g)},${c(b)},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

/** Linear mix of two resolved colours, t = 0 gives c1. */
export function mix(c1, c2, t) {
  const a = parseColor(c1), b = parseColor(c2);
  return toStr({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: a.a + (b.a - a.a) * t });
}
export function alpha(col, k) {
  const p = parseColor(col);
  return toStr({ ...p, a: p.a * k });
}
/** Toward full brightness by t (0..1): a highlight that stays lighter than its fill in both themes. */
export function lighten(col, t) {
  const p = parseColor(col);
  return toStr({ r: p.r + (255 - p.r) * t, g: p.g + (255 - p.g) * t, b: p.b + (255 - p.b) * t, a: p.a });
}
/** Toward black by t (0..1): the flat two-tone cushion shade. */
export function darken(col, t) {
  const p = parseColor(col);
  return toStr({ r: p.r * (1 - t), g: p.g * (1 - t), b: p.b * (1 - t), a: p.a });
}
/** Relative luminance 0..1 of a resolved colour (to tell a light theme from a dark one). */
export function luma(col) {
  const p = parseColor(col);
  return (0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b) / 255;
}

/** WCAG contrast ratio of two resolved colours (1..21). */
export function contrast(a, b) {
  const L = (col) => {
    const p = parseColor(col);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(p.r) + 0.7152 * f(p.g) + 0.0722 * f(p.b);
  };
  const x = L(a), y = L(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Text colour for a fill: --sim-bg-deep or --sim-label, whichever reads better on it. */
export function inkOn(c, bg) {
  const a = contrast(bg, c.bgDeep), b = contrast(bg, c.label);
  // Near a tie the darker ink wins (reads better at chip text sizes).
  if (Math.abs(a - b) < 0.2 * Math.max(a, b)) return luma(c.bgDeep) < luma(c.label) ? c.bgDeep : c.label;
  return a >= b ? c.bgDeep : c.label;
}

/** Hue (degrees), saturation and lightness (0..1) of a resolved colour. */
export function hslOf(col) {
  const { r, g, b } = parseColor(col);
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-6) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === R ? ((G - B) / d + 6) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
}
/** A colour from hue (degrees) + fixed s, l (0..1): tones that must not drift between themes. */
export function hsl(h, s, l, a = 1) {
  const k = (n) => (n + h / 30) % 12;
  const q = s * Math.min(l, 1 - l);
  const f = (n) => 255 * (l - q * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
  return toStr({ r: f(0), g: f(8), b: f(4), a });
}

// -- Type, randomness, easing ---------------------------------------------------

export function font(c, weight, px, display = false) {
  return `${weight} ${px}px ${display ? c.fontDisplay : c.fontBody}`;
}

/** Seeded random in [0, 1): the same seed draws the same scene every mount. */
export function mulberry32(seed) {
  return function rnd() {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const clamp01 = (u) => Math.max(0, Math.min(1, u));
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Arrival easings for decorative pops (a chip, a card, a badge): the look sets the overshoot (plain 0).
 * A model's own overshoot is machinery: pass it (outBack(t, 1.70158), outElastic(t, true)) or use a
 * SimAnim spring, and no look touches it.
 */
export function outBack(t, overshoot = lookOf().overshoot) {
  const u = clamp01(t);
  const s = overshoot, x = u - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
}
/** Springy overshoot that settles: for a hero landing or a badge slam. */
export function outElastic(t, ring = lookOf().elastic) {
  const u = clamp01(t);
  if (u === 0 || u === 1) return u;
  if (!ring) return outBack(u);
  return Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * (TAU / 3)) + 1;
}
export function inOutSine(t) {
  return -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
}

// -- Shapes -------------------------------------------------------------------

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, cornerOf(r, w, h));
  else ctx.rect(x, y, w, h);
}

/** Full-stadium path from arcs (chip lifts and gloss: shapes, not containers). */
export function stadium(ctx, x, y, w, h) {
  const r = Math.min(h, w) / 2;
  ctx.beginPath();
  ctx.arc(x + r, y + h / 2, r, Math.PI / 2, Math.PI * 1.5);
  ctx.arc(x + w - r, y + h / 2, r, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
}

export function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
}

/** Low-control-point wobbly blob: quadratic curves through the midpoints of n wobbled points. */
export function blob(ctx, x, y, rx, ry, n, wob, phase) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + wob * Math.sin(phase + i * 2.3);
    pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]);
  }
  ctx.beginPath();
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], m = mid(p, pts[(i + 1) % n]);
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  ctx.closePath();
}

/** Four-point twinkle, filled. */
export function sparkle(ctx, x, y, r, col) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fillStyle = col;
  ctx.fill();
}

/** Rounded n-point star path (fill it yourself). inner: inner radius ratio. */
export function star(ctx, x, y, r, n = 5, inner = 0.5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const rr_ = i % 2 ? r * inner : r;
    const px = x + Math.cos(a) * rr_, py = y + Math.sin(a) * rr_;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

// -- Chips --------------------------------------------------------------------

/** Smallest type size any kit helper draws (px). Smaller requests are raised to this. */
export const MIN_PX = 14;
const floorPx = (size) => Math.max(MIN_PX, size);

/** Unscaled chip size for text at font size `size` (the box pill() draws). */
export function chipSize(ctx, c, text, size = 15, display = false) {
  size = floorPx(size);
  ctx.save();
  ctx.font = font(c, 800, size, display);
  const tw = ctx.measureText(String(text)).width;
  ctx.restore();
  const L = lookOf();
  return { w: tw + L.chipPadX, h: size + L.chipPadY };
}

// Three twinkles flying off a chip's corners while it pops in (u: pop progress 0..1.6).
function popSparkles(ctx, c, cx, cy, w, h, u, col) {
  if (u <= 0 || u >= 1.6 || !lookOf().popSparkles) return;
  const k = Math.sin((Math.PI * u) / 1.6);
  const d = 6 + u * 12;
  const spots = [[-w / 2 - d, -h / 2 - d * 0.4, 7], [w / 2 + d, -h / 2 - d * 0.5, 9], [w / 2 + d * 0.6, h / 2 + d * 0.3, 5]];
  for (const [dx, dy, r] of spots) sparkle(ctx, cx + dx, cy + dy, r * k, lighten(col, 0.35));
}

/**
 * The look's bold chip: flat solid fill, 3px darker lift (no gloss: it
 * matches the runtime buttons and the SVG/DOM chips), and ink from inkOn(): --sim-bg-deep or --sim-label, whichever contrasts more
 * with the fill (mid-tone light-theme series fills take the dark label).
 * o: { bg, ink, size, align: 'center'|'left'|'right', scale, alpha, display,
 *      icon(ctx, x, y, r)  a small glyph drawn left of the text,
 *      pop                 pop progress (popAt().u) for corner twinkles }
 * (x, y) is the chip's centre/left/right anchor at its vertical middle.
 * Returns the unscaled box { x0, y0, w, h }.
 *
 * The lift is an arc stadium, not roundRects: the headless legibility
 * check treats the smallest drawn rect under a text as its container. A scaled
 * chip scales its geometry and font size directly, never the text by transform.
 */
export function pill(ctx, c, text, x, y, o = {}) {
  const size = floorPx(o.size ?? 15);
  const bg = o.bg ?? c.accent;
  const ink = o.ink ?? inkOn(c, bg);
  const base = chipSize(ctx, c, text, size, o.display);
  const iconW = o.icon ? size + 4 : 0;
  const w = base.w + iconW, h = base.h;
  const x0 = o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2;
  const y0 = y - h / 2;
  const s = o.scale ?? 1;
  const a = o.alpha ?? 1;
  if (s <= 0.02 || a <= 0) return { x0, y0, w, h };
  const cx = x0 + w / 2;
  const sw = w * s, sh = h * s;
  ctx.save();
  ctx.globalAlpha *= a;
  const L = lookOf(), cr = Math.min(L.pill * s, sh / 2);
  if (L.lip > 0) {
    if (cr === sh / 2) stadium(ctx, cx - sw / 2, y - sh / 2 + 4.5 * s * L.lip, sw, sh);
    else rr(ctx, cx - sw / 2, y - sh / 2 + 4.5 * s * L.lip, sw, sh, cr);
    ctx.fillStyle = darken(bg, 0.38);
    ctx.fill();
  }
  rr(ctx, cx - sw / 2, y - sh / 2, sw, sh, cr);
  ctx.fillStyle = bg;
  ctx.fill();
  if (o.icon) o.icon(ctx, cx - sw / 2 + (13 + size / 2) * s, y + s * 0.5, (size / 2) * s);
  ctx.font = font(c, 800, size * s, o.display);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text), cx + (iconW / 2) * s, y + s);
  ctx.restore();
  if (o.pop != null) popSparkles(ctx, c, cx, y, sw, sh, o.pop, bg);
  return { x0, y0, w, h };
}

/**
 * Pop-in helper for a thing that appears `age` seconds after `at`: null before,
 * then { scale, alpha, u } (u = raw progress, > 1 once settled).
 */
export function popAt(age, at) {
  const u = (age - at) / lookOf().popS;
  if (u <= 0) return null;
  return { scale: outBack(u), alpha: Math.min(1, u * 2), u };
}

// An item's pop (explicit `pop`, or popAt(age, at)); undefined = fully shown, null = not yet.
function itemPop(it) {
  if (it.pop !== undefined) return it.pop;
  if (it.age != null && it.at != null) return popAt(it.age, it.at);
  return undefined;
}

// Draw one laid-out chip, capping the pop overshoot so it never crosses the gap.
function drawChip(ctx, c, it, x0, yMid, w, h, gap, o) {
  const p = itemPop(it);
  if (p === null) return;
  const cap = Math.min(1 + gap / w, 1 + gap / h);
  const scale = Math.min(p?.scale ?? it.scale ?? 1, cap);
  pill(ctx, c, it.text, x0, yMid, {
    bg: it.bg ?? o.bg, ink: it.ink ?? o.ink, size: it.size ?? o.size, display: it.display ?? o.display,
    icon: it.icon, align: 'left', scale, alpha: (p?.alpha ?? 1) * (it.alpha ?? 1), pop: p?.u,
  });
}

function itemSize(ctx, c, it, size, display) {
  const s = chipSize(ctx, c, it.text, it.size ?? size, it.display ?? display);
  if (it.icon) s.w += floorPx(it.size ?? size) + 4;
  return s;
}

/**
 * Chips left to right, chained by MEASURED width (never hand-typed x offsets:
 * the recurring overlap bug). Space is reserved for a chip that has not popped
 * in yet, so the row never jumps.
 *   items: [{ text, bg?, ink?, size?, display?, icon?, alpha?, pop? | age? + at? }]
 *   (x, y): row anchor at the vertical middle of the first line
 *   o: { gap = 8, lineGap = 8, size = 15, bg, ink, display,
 *        align: 'left'|'center'|'right' (x is the row's left / centre / right),
 *        wrapAt: max row width in px before starting a new line }
 * Returns the boxes [{ text, x0, y0, w, h }] in item order.
 */
export function chipRow(ctx, c, items, x, y, o = {}) {
  const gap = o.gap ?? 8;
  const lineGap = o.lineGap ?? 8;
  const size = floorPx(o.size ?? 15);
  const sized = items.map((it) => ({ it, ...itemSize(ctx, c, it, size, o.display) }));
  const lines = [];
  let line = [], lw = 0;
  for (const s of sized) {
    const add = (line.length ? gap : 0) + s.w;
    if (o.wrapAt && line.length && lw + add > o.wrapAt) { lines.push({ line, lw }); line = []; lw = 0; }
    lw += (line.length ? gap : 0) + s.w;
    line.push(s);
  }
  if (line.length) lines.push({ line, lw });
  const boxes = new Map();
  let cy = y;
  lines.forEach(({ line: ln, lw: width }, li) => {
    const lh = Math.max(...ln.map((s) => s.h));
    if (li > 0) cy += lh / 2;
    let cx = o.align === 'center' ? x - width / 2 : o.align === 'right' ? x - width : x;
    for (const s of ln) {
      drawChip(ctx, c, s.it, cx, cy, s.w, s.h, gap, { ...o, size });
      boxes.set(s, { text: s.it.text, x0: cx, y0: cy - s.h / 2, w: s.w, h: s.h });
      cx += s.w + gap;
    }
    cy += lh / 2 + lineGap;
  });
  return sized.map((s) => boxes.get(s));
}

/**
 * Chips stacked top to bottom, chained by measured height.
 *   (x, y): x is the column's left / centre / right (o.align), y the top edge.
 *   o: { gap = 8, size = 15, bg, ink, display, align = 'left' }
 * Returns the boxes in item order.
 */
export function chipColumn(ctx, c, items, x, y, o = {}) {
  const gap = o.gap ?? 8;
  const size = floorPx(o.size ?? 15);
  let top = y;
  return items.map((it) => {
    const { w, h } = itemSize(ctx, c, it, size, o.display);
    const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    drawChip(ctx, c, it, x0, top + h / 2, w, h, gap, { ...o, size });
    const box = { text: it.text, x0, y0: top, w, h };
    top += h + gap;
    return box;
  });
}

/**
 * Dashed leader from a chip to the thing it names: a soft curve, marching
 * dashes (pass t), and a ringed dot at the target. Ends are clamped to o.frame
 * ({ x, y, w, h }; default the design space) so a leader never leaves the scene.
 * o.arrow draws an arrowhead at the target instead of the ringed dot.
 */
export function leader(ctx, x1, y1, x2, y2, col, a = 1, t = 0, o = {}) {
  if (a <= 0) return;
  // o.frame { x, y, w, h }: both ends are pulled inside it (default: the 680x520 design space).
  const f = o.frame ?? { x: 0, y: 0, w: W, h: H };
  const pad = 7;
  x1 = clamp(x1, f.x + pad, f.x + f.w - pad); y1 = clamp(y1, f.y + pad, f.y + f.h - pad);
  x2 = clamp(x2, f.x + pad, f.x + f.w - pad); y2 = clamp(y2, f.y + pad, f.y + f.h - pad);
  ctx.save();
  ctx.globalAlpha *= a;
  const mx = (x1 + x2) / 2 + (y2 - y1) * 0.12, my = (y1 + y2) / 2 - (x2 - x1) * 0.12;
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.setLineDash([5, 6]);
  ctx.lineDashOffset = -t * 18;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(mx, my, x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (o.arrow) {
    const ang = Math.atan2(y2 - my, x2 - mx), hl = 11;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hl * Math.cos(ang - 0.45), y2 - hl * Math.sin(ang - 0.45));
    ctx.lineTo(x2 - hl * Math.cos(ang + 0.45), y2 - hl * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.arc(x2, y2, 7 + Math.sin(t * 4) * 1.2, 0, TAU);
  ctx.fillStyle = alpha(col, 0.28);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x2, y2, 4, 0, TAU);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.restore();
}

/**
 * A magnitude-scaled labelled vector: length = |magnitude| * scale (clamped to
 * minLen..maxLen) so equal forces draw equal arrows. The value pill sits just
 * past the head (the far side from the tail), pulled inside the frame.
 *   (x, y): the tail. o: { angle = 0 (radians, 0 = right, y down), magnitude, scale = 4,
 *   length (overrides magnitude), minLen = 22, maxLen = 200, tone/col (resolved colour, default c.accent),
 *   width = 4, head = 12 (px), label, frame, alpha }
 * Returns { x2, y2, len, box } (box: the pill's box, or null).
 */
export function vectorArrow(ctx, c, x, y, o = {}) {
  const ang = o.angle ?? 0, col = o.col ?? c.accent, wid = o.width ?? 4, head = o.head ?? 12;
  let len = o.length;
  if (len == null) len = o.magnitude != null ? clamp(Math.abs(o.magnitude) * (o.scale ?? 4), o.minLen ?? 22, o.maxLen ?? 200) : 60;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const x2 = x + ca * len, y2 = y + sa * len;
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = wid; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2 - ca * head * 0.6, y2 - sa * head * 0.6); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(ang - 0.5), y2 - head * Math.sin(ang - 0.5));
  ctx.lineTo(x2 - head * Math.cos(ang + 0.5), y2 - head * Math.sin(ang + 0.5));
  ctx.closePath(); ctx.fill();
  ctx.restore();
  let box = null;
  if (o.label != null) {
    const f = o.frame ?? { x: 0, y: 0, w: W, h: H };
    const sz = chipSize(ctx, c, String(o.label), MIN_PX);
    const px = clamp(x2 + ca * (head + sz.w / 2 + 4), f.x + sz.w / 2 + 4, f.x + f.w - sz.w / 2 - 4);
    const py = clamp(y2 + sa * (head + sz.h / 2 + 4), f.y + sz.h / 2 + 4, f.y + f.h - sz.h / 2 - 4);
    box = pill(ctx, c, String(o.label), px, py, { bg: col, size: MIN_PX, alpha: o.alpha ?? 1 });
  }
  return { x2, y2, len, box };
}

// -- Text and label placement ---------------------------------------------------

/**
 * Break text into lines no wider than maxW at the ctx's CURRENT font (set it
 * first). Never splits a word unless one word alone is wider than maxW (then
 * it is cut with an ellipsis). o.maxLines: past it the last line ends in "...".
 * Returns the line strings.
 */
export function wrapLines(ctx, text, maxW, o = {}) {
  const fit = (word) => {
    if (ctx.measureText(word).width <= maxW) return word;
    let w = word;
    while (w.length > 1 && ctx.measureText(w + '...').width > maxW) w = w.slice(0, -1);
    return w + '...';
  };
  const lines = [];
  let line = '';
  for (const raw of String(text).split(/\s+/).filter(Boolean)) {
    const test = line ? line + ' ' + raw : raw;
    if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = fit(raw); } else line = line ? test : fit(raw);
  }
  if (line) lines.push(line);
  const cap = o.maxLines;
  if (cap && lines.length > cap) {
    lines.length = cap;
    let last = lines[cap - 1];
    while (last.length > 1 && ctx.measureText(last + '...').width > maxW) last = last.slice(0, -1).trimEnd();
    lines[cap - 1] = last + '...';
  }
  return lines;
}

/**
 * Draw wrapped text with the ctx's CURRENT font and fillStyle. (x, y) is the
 * top-left corner of the block of width maxW for EVERY align: 'center' draws
 * each line centred on x + maxW / 2 and 'right' on x + maxW (so pass the block's
 * LEFT edge, as a hand-written _wrapText(ctx, text, x, y, maxW, lineH, align)
 * does). Returns { lines, w, h } so a card can size itself to the text.
 *   o: { lineH = 1.3 * font px, align = 'left', maxLines }
 */
export function wrapText(ctx, text, x, y, maxW, o = {}) {
  const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1]) || MIN_PX;
  const lineH = o.lineH ?? Math.round(px * 1.3);
  const align = o.align ?? 'left';
  const lines = wrapLines(ctx, text, maxW, o);
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  let w = 0;
  lines.forEach((ln, i) => {
    w = Math.max(w, ctx.measureText(ln).width);
    ctx.fillText(ln, align === 'center' ? x + maxW / 2 : align === 'right' ? x + maxW : x, y + i * lineH);
  });
  ctx.restore();
  return { lines, w, h: lines.length * lineH };
}

/**
 * Pick the largest font size (down to MIN_PX) at which text fits maxW x maxH
 * when wrapped, then draw it. Sets ctx.font itself (weight, c.fontBody).
 * Returns { lines, w, h, size }; text that still overflows at MIN_PX is cut
 * with an ellipsis, never clipped mid-word.
 *   o: { weight = 700, max = 20, align, display, lineH factor = 1.3 }
 */
export function fitText(ctx, c, text, x, y, maxW, maxH, o = {}) {
  const weight = o.weight ?? 700;
  const f = o.lineFactor ?? 1.3;
  let size = Math.max(MIN_PX, o.max ?? 20), cap;
  for (; ; size--) {
    ctx.font = font(c, weight, size, o.display);
    const lines = wrapLines(ctx, text, maxW);
    cap = Math.floor(maxH / Math.round(size * f));
    if (lines.length <= Math.max(1, cap) || size <= MIN_PX) break;
  }
  ctx.font = font(c, weight, size, o.display);
  const r = wrapText(ctx, text, x, y, maxW, { align: o.align, lineH: Math.round(size * f), maxLines: Math.max(1, cap) });
  return { ...r, size };
}

/**
 * A caption strip: a surface card sized to the wrapped text, centred on x,
 * its top edge at y. Returns the box { x0, y0, w, h }.
 *   o: { size = 15, maxW = 600, padX = 14, padY = 9, bg, ink, edge, maxLines = 3, display }
 */
export function captionBar(ctx, c, text, x, y, o = {}) {
  const size = floorPx(o.size ?? 15);
  const maxW = o.maxW ?? 600, padX = o.padX ?? 14, padY = o.padY ?? 9;
  ctx.save();
  ctx.font = font(c, 700, size, o.display);
  const lines = wrapLines(ctx, text, maxW - padX * 2, { maxLines: o.maxLines ?? 3 });
  const lineH = Math.round(size * 1.3);
  let tw = 0;
  for (const ln of lines) tw = Math.max(tw, ctx.measureText(ln).width);
  const w = tw + padX * 2, h = lines.length * lineH + padY * 2;
  const x0 = x - w / 2;
  const L = lookOf();
  rr(ctx, x0, y, w, h, 12 * L.radius);
  ctx.fillStyle = o.bg ?? c.bgSurface;
  ctx.fill();
  ctx.lineWidth = 2 * L.rim;
  ctx.strokeStyle = o.edge ?? c.stroke;
  ctx.stroke();
  ctx.fillStyle = o.ink ?? c.label;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + padY + i * lineH));
  ctx.restore();
  return { x0, y0: y, w, h };
}

/**
 * Collision-free label placement. items: [{ w, h, anchors: [[x, y], ...] }],
 * one list of candidate anchor points per label, in preference order (e.g.
 * points along the curve it names, east end first). For each label, in order,
 * tries the box to the right then to the left of every anchor, and takes the
 * first that stays inside o.frame and overlaps no placed box or o.avoid box.
 * If none fits it falls back to the first anchor, clamped into the frame.
 *   o: { frame = design space, gap = 13, pad = 3, avoid: [{x0,y0,w,h}] }
 * Returns [{ x0, y0, w, h, anchor: [x, y], placed }] in item order; draw the
 * chip at the box and leader() from it to box.anchor.
 */
export function placeLabels(items, o = {}) {
  const f = o.frame ?? { x: 0, y: 0, w: W, h: H };
  const gap = o.gap ?? 13, pad = o.pad ?? 3, m = 4;
  const taken = [...(o.avoid ?? [])];
  const hit = (b, t) => b.x0 < t.x0 + t.w + pad && t.x0 < b.x0 + b.w + pad && b.y0 < t.y0 + t.h + pad && t.y0 < b.y0 + b.h + pad;
  const inside = (b) => b.x0 >= f.x + m && b.x0 + b.w <= f.x + f.w - m && b.y0 >= f.y + m && b.y0 + b.h <= f.y + f.h - m;
  return items.map(({ w, h, anchors }) => {
    for (const [qx, qy] of anchors) {
      for (const x0 of [qx + gap, qx - w - gap]) {
        const b = { x0, y0: qy - h / 2, w, h };
        if (!inside(b) || taken.some((t) => hit(b, t))) continue;
        taken.push(b);
        return { ...b, anchor: [qx, qy], placed: true };
      }
    }
    const [qx, qy] = anchors[0] ?? [f.x + f.w / 2, f.y + f.h / 2];
    const b = {
      x0: clamp(qx + gap, f.x + m, f.x + f.w - w - m),
      y0: clamp(qy - h / 2, f.y + m, f.y + f.h - h - m), w, h,
    };
    taken.push(b);
    return { ...b, anchor: [qx, qy], placed: false };
  });
}

/**
 * A speech bubble whose tail points at (tx, ty): the way a character "says" a
 * short label (a verdict, a reaction; never an explanation).
 *   (x, y): bubble centre. o: { bg, ink, edge, size, scale, alpha, display }
 * Default: a surface card with label ink and an accent edge, right in both themes.
 * Returns the unscaled box.
 */
export function speechBubble(ctx, c, text, x, y, tx, ty, o = {}) {
  const size = o.size ?? 17;
  const bg = o.bg ?? c.bgSurface;
  const ink = o.ink ?? c.label;
  const edge = o.edge ?? c.accent;
  const { w: tw } = chipSize(ctx, c, text, size, o.display ?? true);
  const w = tw + 12, h = size + 26;
  const s = o.scale ?? 1;
  const a = o.alpha ?? 1;
  const box = { x0: x - w / 2, y0: y - h / 2, w, h };
  if (s <= 0.02 || a <= 0) return box;
  const sw = w * s, sh = h * s;
  const bx = x - sw / 2, by = y - sh / 2;
  // A short wedge tail leaving the bubble edge toward (tx, ty), at most 30px long.
  const ang = Math.atan2(ty - y, tx - x);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const reach = Math.min((sw / 2) / Math.max(1e-6, Math.abs(ux)), (sh / 2) / Math.max(1e-6, Math.abs(uy)));
  const tailX = x + ux * (reach - 6 * s), tailY = y + uy * (reach - 6 * s);
  const len = Math.min(30 * s, Math.max(0, Math.hypot(tx - tailX, ty - tailY) - 4));
  const L = lookOf();
  const shape = (dy, inset) => {
    const k = inset ? 0.55 : 1;
    const px = -uy * 11 * s * k, py = ux * 11 * s * k;
    const tl = len - (inset ? 5 * s : 0);
    rr(ctx, bx + inset, by + inset + dy, sw - inset * 2, sh - inset * 2, Math.max(2, 16 * L.radius * s - inset));
    ctx.moveTo(tailX + px, tailY + py + dy);
    ctx.lineTo(tailX + ux * (6 * s + tl), tailY + uy * (6 * s + tl) + dy);
    ctx.lineTo(tailX - px, tailY - py + dy);
    ctx.closePath();
  };
  ctx.save();
  ctx.globalAlpha *= a;
  shape(4 * s * L.lip, 0);
  ctx.fillStyle = darken(edge, 0.35);
  ctx.fill();
  shape(0, 0);
  ctx.fillStyle = edge;
  ctx.fill();
  shape(0, 3 * s * L.rim);
  ctx.fillStyle = bg;
  ctx.fill();
  stadium(ctx, bx + 14 * s, by + 6 * s, sw * 0.45, 5 * s);
  ctx.fillStyle = alpha(lighten(bg, 0.5), 0.5 * L.gloss);
  ctx.fill();
  ctx.font = font(c, 700, size * s, o.display ?? true);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text), x, y + s);
  ctx.restore();
  return box;
}

// -- Set ------------------------------------------------------------------------

/**
 * The frame the full-canvas helpers paint (drawBackdrop, drawDepth, drawFloor, drawVignette, the note card and line).
 * A SimScene sets it every frame from its static WIDTH x HEIGHT (setFrame); outside a SimScene it is read from the canvas
 * (backing store size over the current transform scale); with neither it is the 680 x 520 design space (W, H).
 */
let FRAME = null;
export function setFrame(w, h) { FRAME = w > 0 && h > 0 ? { w, h } : null; }
export function frameOf(ctx) {
  if (FRAME) return FRAME;
  const cv = ctx && ctx.canvas;
  if (cv && cv.width > 0 && cv.height > 0 && typeof ctx.getTransform === 'function') {
    const t = ctx.getTransform();
    return { w: cv.width / (t.a || 1), h: cv.height / (t.d || 1) };
  }
  return { w: W, h: H };
}

/**
 * The visual profile the set helpers paint for: 'lite' (default) or 'rich'
 * (docs/visual-profiles.md). A SimScene sets it every frame from its static
 * VISUAL_PROFILE (setProfile) and clears it after the draw; outside a SimScene
 * pass { profile: 'rich' } in the helper's options instead.
 */
let PROFILE = null;
export function setProfile(p) { PROFILE = p === 'rich' || p === 'lite' ? p : null; }
export function profileOf(o = {}) { return (o.profile ?? PROFILE) === 'rich' ? 'rich' : 'lite'; }

/**
 * The paper the set helpers paint: 'riso' (default) or 'graph' (maths squared paper; see paperKind.js).
 * A SimScene sets it every frame from paperKindOf() and clears it after the draw; outside a SimScene
 * pass { paper: 'graph' } in the helper's options instead.
 */
let PAPER = null;
export function setPaper(p) { PAPER = p === 'graph' || p === 'riso' ? p : null; }
export function paperKind(o = {}) { return (o.paper ?? PAPER) === 'graph' ? 'graph' : 'riso'; }

/**
 * The setting behind the scene (paperKind.js SETTINGS): the world it stands in, night in the dark theme
 * and day in the light one. 'sky' is the default; 'lab' is the lab wall on paper; 'water', 'field' and
 * 'parchment' are worlds; 'riso' is the paper with halftone corners (opt-in); 'none' the flat surface.
 * A SimScene sets it every frame from settingOf() and clears it after the draw; outside a SimScene pass
 * { setting: 'water' } to drawBackdrop / drawFloor. Never on the maths graph paper. The look's backdrop
 * key still rules: 'riso' keeps every scene on the paper, 'flat' paints the surface alone.
 */
let SETTING = null;
export function setSetting(v) { SETTING = SETTINGS.includes(v) ? v : null; }
export function settingKind(o = {}) { return resolveSetting(o.setting ?? SETTING ?? DEFAULT_SETTING, lookOf()); }
/** The settings painted as paper (grain, the paper tone) rather than as a lit world. */
export const isPaperSetting = (s) => s === 'riso' || s === 'lab';

// Static set layers are painted once into an offscreen canvas at the device
// scale and blitted every frame. Keyed by every input, so a theme switch or a
// different frame builds a new one; a small LRU keeps memory bounded.
const LAYERS = new Map();
const LAYER_MAX = 10;
function layerScale(ctx) {
  const t = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  const a = t ? Math.hypot(t.a || 0, t.b || 0) : 1;
  return Math.min(3, Math.max(1, Math.ceil((a || 1) - 0.01)));   // 1, 2 or 3: a camera zoom does not thrash the cache
}
function newCanvas(w, h) {
  try {
    if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
    if (typeof document !== 'undefined' && document.createElement) {
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      return cv;
    }
  } catch (_) { /* no canvas host: paint directly */ }
  return null;
}
/** Paint (g, scale) into a cached w x h layer and blit it at (x, y); with no canvas host, paint straight onto ctx. */
export function blitLayer(ctx, key, x, y, w, h, paint) {
  const s = layerScale(ctx);
  const k = `${key}|${w}x${h}@${s}`;
  let cv = LAYERS.get(k);
  if (cv === undefined) {
    cv = newCanvas(Math.ceil(w * s), Math.ceil(h * s));
    const g = cv && cv.getContext ? cv.getContext('2d') : null;
    if (g) {
      if (g.setTransform) g.setTransform(s, 0, 0, s, 0, 0);
      paint(g, s);
    } else cv = null;
    if (LAYERS.size >= LAYER_MAX) LAYERS.delete(LAYERS.keys().next().value);
    LAYERS.set(k, cv);
  } else {
    LAYERS.delete(k); LAYERS.set(k, cv);   // most recently used last
  }
  if (cv && typeof ctx.drawImage === 'function') {
    ctx.drawImage(cv, x, y, w, h);
  } else {
    ctx.save();
    ctx.translate(x, y);
    paint(ctx, 1);
    ctx.restore();
  }
}

// The paper (kit-owned look, 2026-10-27): a warm risograph paper with a cached grain and two
// halftone corners. The same look is painted three ways - here on canvas, in SimLookDom's
// .sl-backdrop CSS (kit/paper/grain.svg + halftone.svg) and, through that CSS, behind SimSvg stages.
// Keep the numbers in step: paper = bg-surface x (0.992, 0.976, 0.945); inks series-1 (top left) and series-4
// (bottom right) at 24%, R 320 (halftone.svg R 380 drawn at 640 px), 9 px grid scaled alike; floor = paper + 15% series-4.

function isLightTheme(c) { return luma(c.bgDeep) > 0.5; }

/** The key light: a broad pool high on the left (literal light, so a gradient). */
function paintLightPool(g, c, FW, FH, k) {
  const light = isLightTheme(c);
  const x = FW * 0.3, y = FH * 0.16, r = Math.max(FW, FH) * 0.78;
  const col = light ? lighten(c.bgDeep, 0.9) : mix(c.raised, c.s5, 0.22);
  const peak = (light ? 0.7 : 0.5) * k;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, alpha(col, peak));
  gr.addColorStop(0.45, alpha(col, peak * 0.42));
  gr.addColorStop(1, alpha(col, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, FW, FH);
}

/**
 * The paper colour: bg-surface multiplied by a warm paper tint (r 0.992, g 0.976, b 0.945), so the light
 * theme gets cream and the dark theme a deep indigo paper with no muddy brown. SimLookDom computes the
 * same value with CSS relative colour (rgb(from var(--sim-bg-surface) ...)).
 */
export function paperOf(c, o = {}) {
  if (paperKind(o) === 'graph') return c.bgDeep;
  if (settingKind(o) === 'casefile' && c.setCard) return c.setCard;
  if (lookOf().backdrop === 'flat') return c.bgSurface;
  const p = parseColor(c.bgSurface);
  return toStr({ r: p.r * 0.992, g: p.g * 0.976, b: p.b * 0.945, a: 1 });
}

// One paper tile per theme (device px): fine speckle of varied weight, a few soft clumps and a few
// longer curling fibres, wrapped at the edges so the repeat never shows a seam.
const PAPER_TILES = new Map();
function paperTile(paper, light) {
  const key = `${paper}|${light ? 'l' : 'd'}`;
  if (PAPER_TILES.has(key)) return PAPER_TILES.get(key);
  const N = 256;
  let cv = newCanvas(N, N);
  const g = cv && cv.getContext ? cv.getContext('2d') : null;
  if (g) {
    const dk = darken(paper, light ? 0.5 : 0.35), lt = lighten(paper, light ? 0.85 : 0.42);
    const main = light ? dk : lt, minor = light ? lt : dk;
    const rnd = mulberry32(2718);
    const wrap = (fn) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) fn(ox, oy); };
    for (let i = 0; i < 2300; i++) {
      // Speckle of uneven weight and size: mostly faint single pixels, some heavier specks and short flecks.
      const w8 = rnd();
      g.fillStyle = alpha(rnd() < 0.72 ? main : minor, w8 < 0.7 ? 0.15 + rnd() * 0.35 : 0.5 + rnd() * 0.5);
      const fw = w8 > 0.93 ? 2 : 1, fh = w8 > 0.97 ? 2 : 1;
      g.fillRect(Math.floor(rnd() * N), Math.floor(rnd() * N), fw, fh);
    }
    for (let i = 0; i < 70; i++) {
      const x = rnd() * N, y = rnd() * N, r = 0.8 + rnd() * 1.1, col = alpha(rnd() < 0.7 ? main : minor, 0.2 + rnd() * 0.25);
      wrap((ox, oy) => { g.beginPath(); g.arc(x + ox, y + oy, r, 0, TAU); g.fillStyle = col; g.fill(); });
    }
    for (let i = 0; i < 46; i++) {
      const x = rnd() * N, y = rnd() * N, a = rnd() * TAU, l = 10 + rnd() * 26, bend = (rnd() - 0.5) * 10;
      const col = alpha(rnd() < 0.75 ? main : minor, 0.18 + rnd() * 0.35), lw = 0.5 + rnd() * 0.6;
      const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l;
      const mx = (x + ex) / 2 - Math.sin(a) * bend, my = (y + ey) / 2 + Math.cos(a) * bend;
      wrap((ox, oy) => { g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(mx + ox, my + oy, ex + ox, ey + oy); g.strokeStyle = col; g.lineWidth = lw; g.stroke(); });
    }
  } else cv = false;
  if (PAPER_TILES.size > 6) PAPER_TILES.clear();
  PAPER_TILES.set(key, cv);
  return cv;
}

/** Paper grain over (0, 0, w, h) of a backdrop layer: soft low-frequency mottle, then the tile, at step 1..3. */
function paintPaperGrain(g, s, w, h, paper, light, step, seed = 5150) {
  const mk = [0, 1, 2, 3][step];
  const rnd = mulberry32(seed);
  for (let i = 0; i < Math.ceil(w * h / 3500); i++) {
    const x = rnd() * w, y = rnd() * h, r = 50 + rnd() * 150, up = rnd() < 0.5;
    const col = up ? lighten(paper, light ? 0.9 : 0.3) : darken(paper, light ? 0.25 : 0.3);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, alpha(col, (light ? 0.06 : 0.07) * mk));
    gr.addColorStop(1, alpha(col, 0));
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tile = paperTile(paper, light);
  if (!tile || typeof g.createPattern !== 'function') return;
  const pat = g.createPattern(tile, 'repeat');
  if (!pat) return;
  g.save();
  if (g.setTransform) g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = (light ? [0, 0.22, 0.48, 0.8] : [0, 0.2, 0.42, 0.72])[step];
  g.fillStyle = pat;
  g.fillRect(0, 0, Math.ceil(w * s), Math.ceil(h * s));
  g.restore();
}

/**
 * Halftone dots in one ink swelling toward (cx, cy) out to radius R (u = 1 - d / R; r = 4.6 u^2 + 0.4),
 * on a 9 px staggered grid; grid and dots scale with R / 380 (the halftone.svg disc's own radius).
 */
function paintHalftone(g, ink, cx, cy, R, FW, FH, k = 1) {
  const sc = R / 380;
  g.fillStyle = alpha(ink, 0.24 * k);
  g.beginPath();
  const step = 9 * sc;
  for (let y = step / 2, row = 0; y < FH; y += step, row++) {
    for (let x = (row % 2) * (step / 2); x <= FW; x += step) {
      const u = 1 - Math.hypot(x - cx, y - cy) / R;
      if (u <= 0.05) continue;
      const r = Math.min(4.2, 4.6 * u * u + 0.4) * sc;
      g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU);
    }
  }
  g.fill();
}

/**
 * Full-canvas backdrop: the scene's setting (settingKind: the world of the course subject, night or day
 * by theme), painted once to a cached layer. On the paper settings (riso, lab) it is the risograph
 * paper with a cached fibre grain and halftone corners (top left series-1, bottom right series-4);
 * there style is 'dots' (default) | 'diamond' (same) | 'grid' (adds a faint printed grid) | 'plain'
 * (lighter corners), and o: { tint, k, step, profile, setting }: tint inks both corners, k scales the
 * halftone, step is the grid spacing. On a world (sky, water, field, parchment) style 'plain' and k tone
 * the decoration (band, stars, shafts) down; the grid is not drawn. o.t is the scene clock: rich night
 * skies twinkle with it (still under reduced motion), everything else holds. Rich adds a soft key light.
 */
export function drawBackdrop(ctx, c, style = 'dots', o = {}) {
  const { w: FW, h: FH } = frameOf(ctx);
  ctx.fillStyle = c.bgDeep;
  ctx.fillRect(0, 0, FW, FH);
  const rich = profileOf(o) === 'rich';
  if (paperKind(o) === 'graph') { drawGraphPaper(ctx, c, style, rich, FW, FH); return; }
  const set = settingKind(o);
  if (set === 'none') { drawFlatPaper(ctx, c, style, o.step ?? 34, FW, FH); return; }
  if (set === 'casefile') { drawCasefile(ctx, c, FW, FH); return; }
  if (!isPaperSetting(set)) { drawWorld(ctx, c, set, style, o, rich, FW, FH); return; }
  const k = (o.k ?? 1) * (style === 'plain' ? 0.55 : style === 'grid' ? 0.75 : 1) * (set === 'lab' ? 0.5 : 1);
  const step = o.step ?? 34;
  const key = `paper|${style}|${k}|${step}|${o.tint ?? ''}|${rich ? 'r' : 'l'}|${set}|${c.bgSurface}|${c.s1}|${c.s2}|${c.s4}|${c.stroke}|${c.label}`;
  blitLayer(ctx, key, 0, 0, FW, FH, (g, s) => {
    const light = isLightTheme(c);
    const paper = paperOf(c);
    g.fillStyle = paper;
    g.fillRect(0, 0, FW, FH);
    const R = style === 'plain' ? 270 : 320;
    if (set !== 'lab') paintHalftone(g, o.tint ?? c.s1, 0, 0, R, FW, FH, k);   // the lab shelf takes that corner
    paintHalftone(g, o.tint ?? c.s4, FW, FH, R, FW, FH, k);
    if (style === 'grid') {
      g.strokeStyle = alpha(mix(c.stroke, c.s1, 0.4), light ? 0.16 : 0.2);
      g.lineWidth = 1;
      g.beginPath();
      for (let x = step / 2; x < FW; x += step) { g.moveTo(x, 0); g.lineTo(x, FH); }
      for (let y = step / 2; y < FH; y += step) { g.moveTo(0, y); g.lineTo(FW, y); }
      g.stroke();
    }
    if (set === 'lab') paintLabWall(g, c, FW, FH, paper, light, style === 'grid', rich);
    if (lookOf().grain) paintPaperGrain(g, s, FW, FH, paper, light, 2);
    if (rich || set === 'lab') paintLightPool(g, c, FW, FH, rich ? 0.6 : 0.35);
  });
}

// -- Worlds (the settings that are not paper) ------------------------------------------------------
// Each world is one cached layer: sky or water from the top, a floor plane from a horizon, 2-3 planes
// with the far ones cooler and lower in contrast, one key light top-left (day) or a pool behind the
// hero (night). Tones come from the --sim-set-* tokens, so DOM and SVG scenes paint the same world
// from CSS (SimLookDom). Nothing here uses a series colour: the setting never competes with the hero.

const WORLDS = {
  sky: (g, c, FW, FH, light, rich, k) => paintSkyWorld(g, c, FW, FH, light, rich, k, 0.78, false),
  field: (g, c, FW, FH, light, rich, k) => paintSkyWorld(g, c, FW, FH, light, rich, k, 0.66, true),
  water: paintWaterWorld,
  parchment: paintParchmentWorld,
};
/** Where a world's horizon sits (a fraction of the frame height); null for a world with no horizon. */
export function horizonOf(set) { return set === 'sky' ? 0.78 : set === 'field' ? 0.66 : set === 'water' ? 0.84 : set === 'parchment' ? 0.7 : null; }

function drawWorld(ctx, c, set, style, o, rich, FW, FH) {
  const light = isLightTheme(c);
  const k = (o.k ?? 1) * (style === 'plain' ? 0.7 : 1);
  const key = `world|${set}|${k}|${rich ? 'r' : 'l'}|${c.bgDeep}|${c.setSkyTop}|${c.setSkyLow}|${c.setBand}|${c.setAurora}|${c.setStar}|${c.setPool}|${c.setSun}|${c.setGround}|${c.setGroundFar}|${c.setWaterTop}|${c.setWaterDeep}|${c.setShaft}|${c.setSand}|${c.setParchment}|${c.setWashTop}|${c.setWashLow}`;
  blitLayer(ctx, key, 0, 0, FW, FH, (g, s) => WORLDS[set](g, c, FW, FH, light, rich, k, s));
  if (rich && !light && (set === 'sky' || set === 'field')) paintStarTwinkle(ctx, c, o.t ?? 0, FW, FH * horizonOf(set), k);
}

// A gently rolling ridge line from x0 to x1 about y (amplitude amp): two sines, seeded phases.
function ridgePath(g, FW, y, amp, seed, sharp = false) {
  const rnd = mulberry32(seed);
  const p1 = rnd() * TAU, p2 = rnd() * TAU, l1 = 150 + rnd() * 90, l2 = 60 + rnd() * 40;
  g.moveTo(-2, y);
  for (let x = -2; x <= FW + 2; x += 6) {
    let v = Math.sin(x / l1 + p1) * amp + Math.sin(x / l2 + p2) * amp * 0.45;
    if (sharp) v = Math.abs(v) * 1.6 - amp * 0.6;   // peaks, for a far mountain ridge
    g.lineTo(x, y - v);
  }
}

// A plane of ground from a ridge at y down to the bottom.
function paintPlane(g, FW, FH, y, amp, seed, col, sharp) {
  g.beginPath();
  ridgePath(g, FW, y, amp, seed, sharp);
  g.lineTo(FW + 2, FH + 2); g.lineTo(-2, FH + 2);
  g.closePath();
  g.fillStyle = col;
  g.fill();
}

// Seeded stars above yh: mostly faint single dots, a few larger with a soft halo.
function starField(seed, n, FW, yh) {
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: rnd() * FW, y: rnd() * yh * 0.92, r: 0.6 + rnd() * 1.1, a: 0.35 + rnd() * 0.65, big: rnd() > 0.88, ph: rnd() * TAU, sp: 0.6 + rnd() * 0.9 });
  return out;
}
function paintStars(g, c, FW, yh, k, seed = 9) {
  const star = c.setStar;
  if (parseColor(star).a <= 0.01) return;    // day
  for (const s of starField(seed, 54, FW, yh)) {
    if (s.big) {
      g.fillStyle = alpha(star, 0.12 * k);
      g.beginPath(); g.arc(s.x, s.y, s.r * 3.2, 0, TAU); g.fill();
    }
    g.fillStyle = alpha(star, s.a * k);
    g.beginPath(); g.arc(s.x, s.y, s.big ? s.r * 1.3 : s.r, 0, TAU); g.fill();
  }
}
// Rich, night: a handful of the big stars breathe with the clock (drawn over the cached layer).
function paintStarTwinkle(ctx, c, t, FW, yh, k) {
  if (reducedMotion()) t = 0;
  const star = c.setStar;
  if (parseColor(star).a <= 0.01) return;
  for (const s of starField(9, 54, FW, yh)) {
    if (!s.big) continue;
    const b = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
    sparkle(ctx, s.x, s.y, (2.2 + 3 * b) * (s.r / 1.2), alpha(star, 0.35 * b * k));
  }
}

// A soft cloud: a row of overlapping discs on a flat base, low contrast against the sky.
function paintCloud(g, x, y, w, col) {
  const h = w * 0.3;
  g.fillStyle = col;
  g.beginPath();
  ellipse(g, x, y, w / 2, h * 0.5);
  g.fill();
  for (const [dx, r] of [[-0.22, 0.3], [0.05, 0.42], [0.3, 0.26]]) {
    g.beginPath(); g.arc(x + dx * w, y - h * 0.25, w * r * 0.55, 0, TAU); g.fill();
  }
}

// The sun-side key light (day; the token is transparent by night): a broad pool high on the left.
function paintSun(g, c, FW, FH, k) {
  if (parseColor(c.setSun).a <= 0.01) return;
  const gr = g.createRadialGradient(FW * 0.18, FH * 0.08, 0, FW * 0.18, FH * 0.08, Math.max(FW, FH) * 0.7);
  gr.addColorStop(0, alpha(c.setSun, 0.9 * k)); gr.addColorStop(0.5, alpha(c.setSun, 0.3 * k)); gr.addColorStop(1, alpha(c.setSun, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, FW, FH);
}
// The pool of light behind the hero (night; the token is transparent by day).
function paintHeroPool(g, c, FW, FH, k) {
  if (parseColor(c.setPool).a <= 0.01) return;
  const x = FW * 0.5, y = FH * 0.5, r = Math.max(FW, FH) * 0.5;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, alpha(c.setPool, 1 * k)); gr.addColorStop(0.55, alpha(c.setPool, 0.3 * k)); gr.addColorStop(1, alpha(c.setPool, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, FW, FH);
}

// Open sky over a low horizon (sky: 78%; field: 66%, a far mountain ridge and rows on the plain).
function paintSkyWorld(g, c, FW, FH, light, rich, k, hz, field) {
  const yh = Math.round(FH * hz);
  const sky = g.createLinearGradient(0, 0, 0, yh);
  sky.addColorStop(0, c.setSkyTop); sky.addColorStop(1, c.setSkyLow);
  g.fillStyle = sky;
  g.fillRect(0, 0, FW, yh + 2);
  // Stars (night: the token is transparent by day).
  paintStars(g, c, FW, yh, k, field ? 11 : 9);
  // The aurora (night only: transparent by day): two soft ribbons across the upper sky.
  if (!field && parseColor(c.setAurora).a > 0.01) {
    for (const [y0, hh, a, seed] of [[0.14, 0.17, 0.2, 4], [0.24, 0.13, 0.13, 8]]) {
      g.save();
      g.beginPath();
      ridgePath(g, FW, FH * (y0 + hh / 2), FH * hh * 0.5, seed);
      for (let x = FW + 2; x >= -2; x -= 6) g.lineTo(x, FH * (y0 + hh / 2) - Math.sin(x / 180 + seed) * FH * hh * 0.4 + FH * hh);
      g.closePath();
      g.clip();
      const rib = g.createLinearGradient(0, FH * y0 - FH * hh * 0.3, 0, FH * (y0 + hh) + FH * hh * 0.5);
      rib.addColorStop(0, alpha(c.setAurora, 0)); rib.addColorStop(0.45, alpha(c.setAurora, a * k)); rib.addColorStop(1, alpha(c.setAurora, 0));
      g.fillStyle = rib;
      g.fillRect(0, 0, FW, yh);
      g.restore();
    }
  }
  // The band at the horizon: a warm dusk glow by night, the pale band by day.
  const bh = FH * (field ? 0.14 : 0.2);
  const band = g.createLinearGradient(0, yh - bh, 0, yh);
  band.addColorStop(0, alpha(c.setBand, 0)); band.addColorStop(1, alpha(c.setBand, (light ? 0.55 : 0.26) * k));
  g.fillStyle = band;
  g.fillRect(0, yh - bh, FW, bh + 2);
  // Light: the sun-side pool and the clouds by day, the pool behind the hero by night (each token is transparent in the other theme).
  paintSun(g, c, FW, FH, 0.8);
  if (parseColor(c.setSun).a > 0.01) {
    const cloud = alpha(c.setSun, 0.5 * k);
    const rnd = mulberry32(field ? 31 : 17);
    for (let i = 0; i < 3; i++) paintCloud(g, FW * (0.12 + i * 0.34 + rnd() * 0.1), FH * (0.14 + rnd() * 0.16) * (field ? 0.85 : 1), FW * (0.1 + rnd() * 0.08), cloud);
  }
  paintHeroPool(g, c, FW, FH, field ? 0.6 : 1);
  // The planes: a far ridge (cooler), then the near ground.
  const u = Math.max(0.6, Math.min(FW / 680, FH / 520));
  if (field) {
    paintPlane(g, FW, FH, yh - 4 * u, FH * 0.075, 23, c.setGroundFar, true);
    paintPlane(g, FW, FH, yh, FH * 0.012, 27, c.setGround, false);
    // Rows receding across the plain: closer together near the horizon.
    g.strokeStyle = alpha(light ? darken(c.setGround, 0.3) : lighten(c.setGround, 0.4), (light ? 0.22 : 0.18) * k);
    g.lineWidth = 1.2;
    g.beginPath();
    for (let i = 1; i <= 6; i++) {
      const t = Math.pow(i / 6, 1.55), y = yh + (FH - yh) * t;
      g.moveTo(-2, y + 6 * t); g.quadraticCurveTo(FW / 2, y - 10 * t, FW + 2, y + 6 * t);
    }
    g.stroke();
  } else {
    paintPlane(g, FW, FH, yh - FH * 0.035, FH * 0.03, 23, c.setGroundFar, false);
    paintPlane(g, FW, FH, yh, FH * 0.022, 29, c.setGround, false);
  }
  // Contact shade where the near ground meets the sky plane.
  const seam = g.createLinearGradient(0, yh - 2, 0, yh + 22 * u);
  seam.addColorStop(0, alpha(darken(c.setGround, 0.5), light ? 0.1 : 0.3)); seam.addColorStop(1, alpha(darken(c.setGround, 0.5), 0));
  g.fillStyle = seam;
  g.fillRect(0, yh - 2, FW, 22 * u + 2);
}

// Under water: the water from the surface down, light shafts from the top left, a sandy floor.
function paintWaterWorld(g, c, FW, FH, light, rich, k) {
  const ys = light ? Math.round(FH * 0.09) : 0;     // day: the surface is in view, with air above
  const yf = Math.round(FH * 0.84);
  const wat = g.createLinearGradient(0, ys, 0, FH);
  wat.addColorStop(0, c.setWaterTop); wat.addColorStop(1, c.setWaterDeep);
  g.fillStyle = wat;
  g.fillRect(0, 0, FW, FH);
  if (light) {
    g.fillStyle = lighten(c.setWaterTop, 0.6);
    g.fillRect(0, 0, FW, ys);
    g.beginPath();
    ridgePath(g, FW, ys, 3, 41);
    g.lineTo(FW + 2, 0); g.lineTo(-2, 0); g.closePath();
    g.fillStyle = lighten(c.setWaterTop, 0.75);
    g.fill();
    g.beginPath();
    ridgePath(g, FW, ys + 1.5, 3, 41);
    g.strokeStyle = alpha(c.setShaft, 0.9);
    g.lineWidth = 2.5;
    g.stroke();
    // Caustics: short bright arcs in the shallows.
    const rnd = mulberry32(43);
    g.strokeStyle = alpha(c.setShaft, 0.4 * k);
    g.lineWidth = 2;
    g.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const x = rnd() * FW, y = ys + 8 + rnd() * FH * 0.3, r = 12 + rnd() * 22, a0 = rnd() * TAU;
      g.beginPath(); g.arc(x, y, r, a0, a0 + 0.9 + rnd() * 0.8); g.stroke();
    }
  }
  // Shafts: three wedges from the top left, fading with depth (literal light, so a gradient).
  const shaft = g.createLinearGradient(0, ys, 0, FH * 0.8);
  shaft.addColorStop(0, alpha(c.setShaft, (light ? 0.3 : 0.16) * k)); shaft.addColorStop(1, alpha(c.setShaft, 0));
  g.fillStyle = shaft;
  for (const [x0, w0, x1, w1] of [[0.1, 0.06, 0.3, 0.16], [0.26, 0.05, 0.5, 0.13], [0.42, 0.04, 0.68, 0.1]]) {
    g.beginPath();
    g.moveTo(FW * x0, ys); g.lineTo(FW * (x0 + w0), ys); g.lineTo(FW * (x1 + w1), FH * 0.82); g.lineTo(FW * x1, FH * 0.82);
    g.closePath(); g.fill();
  }
  // Motes: still specks of light in the water.
  const rnd = mulberry32(47);
  for (let i = 0; i < 26; i++) {
    g.fillStyle = alpha(c.setShaft, (0.1 + rnd() * 0.2) * k);
    g.beginPath(); g.arc(rnd() * FW, ys + rnd() * (yf - ys), 1 + rnd() * 1.6, 0, TAU); g.fill();
  }
  // The sand: a wavy floor with a contact shade above it and a few pebbles.
  const ao = g.createLinearGradient(0, yf - 26, 0, yf);
  ao.addColorStop(0, alpha(c.setWaterDeep, 0)); ao.addColorStop(1, alpha(darken(c.setWaterDeep, 0.5), light ? 0.14 : 0.4));
  g.fillStyle = ao;
  g.fillRect(0, yf - 26, FW, 26);
  paintPlane(g, FW, FH, yf, 3.5, 53, c.setSand, false);
  g.fillStyle = alpha(lighten(c.setSand, 0.6), light ? 0.6 : 0.25);
  g.fillRect(0, yf + 1, FW, 2);
  const pr = mulberry32(59);
  for (let i = 0; i < 9; i++) {
    const x = pr() * FW, y = yf + 10 + pr() * (FH - yf - 14), r = 3 + pr() * 5;
    g.fillStyle = pr() < 0.6 ? darken(c.setSand, 0.22) : lighten(c.setSand, 0.25);
    ellipse(g, x, y, r, r * 0.6);
    g.fill();
  }
}

// A warm evening wash over a parchment floor (night), daylight parchment with a darker floor (day).
function paintParchmentWorld(g, c, FW, FH, light, rich, k, s) {
  const yf = Math.round(FH * 0.7);
  const wash = g.createLinearGradient(0, 0, 0, yf);
  wash.addColorStop(0, c.setWashTop); wash.addColorStop(1, c.setWashLow);
  g.fillStyle = wash;
  g.fillRect(0, 0, FW, yf + 2);
  if (light) {
    paintPaperGrain(g, s, FW, yf + 2, c.setWashLow, light, 1, 61);
    paintSun(g, c, FW, FH, 0.5);
  } else {
    const rnd = mulberry32(67);
    for (let i = 0; i < 16; i++) {     // dim embers in the evening air
      g.fillStyle = alpha(lighten(c.setBand, 0.5), (0.1 + rnd() * 0.25) * k);
      g.beginPath(); g.arc(rnd() * FW, rnd() * yf * 0.9, 0.8 + rnd() * 1.4, 0, TAU); g.fill();
    }
    const glow = g.createLinearGradient(0, yf - FH * 0.22, 0, yf);
    glow.addColorStop(0, alpha(c.setBand, 0)); glow.addColorStop(1, alpha(c.setBand, 0.22 * k));
    g.fillStyle = glow;
    g.fillRect(0, yf - FH * 0.22, FW, FH * 0.22 + 2);
    paintHeroPool(g, c, FW, FH, 0.6);
  }
  // The floor: parchment with a softly torn edge, grain on it, a contact shade under the edge.
  const floor = c.setParchment;
  g.save();
  g.beginPath();
  ridgePath(g, FW, yf, 5, 71);
  g.lineTo(FW + 2, FH + 2); g.lineTo(-2, FH + 2);
  g.closePath();
  g.clip();
  g.fillStyle = floor;
  g.fillRect(0, yf - 12, FW, FH - yf + 14);
  paintPaperGrain(g, s, FW, FH, floor, light, 2, 73);
  const ao = g.createLinearGradient(0, yf - 8, 0, yf + 18);
  ao.addColorStop(0, alpha(darken(floor, 0.5), light ? 0.12 : 0.35)); ao.addColorStop(1, alpha(darken(floor, 0.5), 0));
  g.fillStyle = ao;
  g.fillRect(0, yf - 8, FW, 26);
  g.restore();
  g.beginPath();
  ridgePath(g, FW, yf, 5, 71);
  g.strokeStyle = alpha(light ? lighten(floor, 0.8) : lighten(floor, 0.45), light ? 0.7 : 0.35);
  g.lineWidth = 1.5;
  g.stroke();
  if (light) drawVignetteOn(g, c, FW, FH, darken(c.setParchment, 0.55), 0.16);
}

// A soft darkening toward the frame edges on a layer (used by the day parchment, an old map's edge).
function drawVignetteOn(g, c, FW, FH, col, a) {
  const gr = g.createRadialGradient(FW / 2, FH * 0.5, FH * 0.3, FW / 2, FH * 0.5, FW * 0.72);
  gr.addColorStop(0, alpha(col, 0)); gr.addColorStop(1, alpha(col, a));
  g.fillStyle = gr;
  g.fillRect(0, 0, FW, FH);
}

// A look with backdrop 'flat': the surface token and nothing else, the printed grid if asked for it.
function drawFlatPaper(ctx, c, style, step, FW, FH) {
  ctx.fillStyle = paperOf(c);
  ctx.fillRect(0, 0, FW, FH);
  if (style !== 'grid') return;
  ctx.strokeStyle = mix(paperOf(c), c.label, 0.07);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = step / 2; x < FW; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, FH); }
  for (let y = step / 2; y < FH; y += step) { ctx.moveTo(0, y); ctx.lineTo(FW, y); }
  ctx.stroke();
}

/**
 * The casefile setting's layout (packs/look/plain/SPEC.md sec 8), in frame px: the desk edge d, the folder
 * tab top left, the folder, the ruled paper card on it. SimWorld's CSS uses the same numbers.
 */
export function casefileRects(FW, FH) {
  const d = 12, th = 18, pad = 9;
  const folder = { x: d, y: d + th, w: FW - 2 * d, h: FH - 2 * d - th };
  const tab = { x: d + 22, y: d, w: Math.min(190, Math.round(FW * 0.3)), h: th + 4 };
  const card = { x: folder.x + pad, y: folder.y + pad, w: folder.w - 2 * pad, h: folder.h - 2 * pad };
  return { d, tab, folder, card };
}

// The casefile: a desk round the edge, a manila folder with its tab, a ruled paper card. Flat fills; the
// only gradient is literal light (the dim lamp by night, through --sim-set-shade, transparent by day).
function drawCasefile(ctx, c, FW, FH) {
  if (lookOf().casefile === 'quiet') { drawCasefileQuiet(ctx, c, FW, FH); return; }
  const key = `casefile|${c.setDesk}|${c.setFolder}|${c.setFolderEdge}|${c.setCard}|${c.setRule}|${c.setShade}`;
  blitLayer(ctx, key, 0, 0, FW, FH, (g) => {
    const { tab, folder: f, card: k } = casefileRects(FW, FH);
    const light = isLightTheme(c);
    g.fillStyle = c.setDesk;
    g.fillRect(0, 0, FW, FH);
    // The folder: a soft shadow on the desk, the back flap peeking at the foot, the tab, the front.
    g.save();
    g.shadowColor = alpha(darken(c.setDesk, 0.6), light ? 0.45 : 0.7);
    g.shadowBlur = 14; g.shadowOffsetY = 5;
    g.fillStyle = c.setFolderEdge;
    rr(g, f.x, f.y, f.w, f.h, 5); g.fill();
    g.restore();
    g.fillStyle = c.setFolder;
    rr(g, tab.x, tab.y, tab.w, tab.h + 6, 5); g.fill();
    rr(g, f.x, f.y, f.w, f.h - 3, 5); g.fill();
    g.fillStyle = alpha(c.setFolderEdge, 0.9);
    g.fillRect(tab.x + 8, f.y - 0.5, tab.w - 16, 1);
    // The card: a low shadow, paper, faint rules from under the title band, a margin rule.
    g.save();
    g.shadowColor = alpha(darken(c.setFolderEdge, 0.5), light ? 0.28 : 0.5);
    g.shadowBlur = 5; g.shadowOffsetY = 1.5;
    g.fillStyle = c.setCard;
    g.fillRect(k.x, k.y, k.w, k.h);
    g.restore();
    g.fillStyle = c.setRule;
    for (let y = k.y + 54; y < k.y + k.h - 6; y += 28) g.fillRect(k.x + 10, Math.round(y), k.w - 20, 1);
    // Night: the lamp lights the middle of the card; the edges fall away into the desk.
    const R = Math.hypot(FW, FH) * 0.62;
    const lamp = g.createRadialGradient(FW * 0.5, FH * 0.36, R * 0.38, FW * 0.5, FH * 0.36, R);
    lamp.addColorStop(0, alpha(c.setShade, 0));
    lamp.addColorStop(1, c.setShade);
    g.fillStyle = lamp;
    g.fillRect(0, 0, FW, FH);
  });
}

// The quiet casefile (LookProfile casefile: 'quiet', the plain look since 2026-11-05): the same rects, so a
// scene lays out exactly as on the desk, but no desk, no folder fill, no shadow, no lamp. The paper, one
// hairline folder rule with its tab outlined on it, the card flat on the paper.
function drawCasefileQuiet(ctx, c, FW, FH) {
  const key = `casefile-quiet|${c.setDesk}|${c.setFolderEdge}|${c.setCard}`;
  blitLayer(ctx, key, 0, 0, FW, FH, (g) => {
    const { tab, folder: f, card: k } = casefileRects(FW, FH);
    g.fillStyle = c.setDesk;
    g.fillRect(0, 0, FW, FH);
    g.fillStyle = c.setCard;
    g.fillRect(k.x, k.y, k.w, k.h);
    const y = Math.round(f.y) + 0.5, t = Math.round(tab.y) + 0.5;
    const x0 = Math.round(tab.x) + 0.5, x1 = Math.round(tab.x + tab.w) - 0.5, r = 3;
    g.strokeStyle = c.setFolderEdge;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(f.x, y);
    g.lineTo(x0, y);
    g.lineTo(x0, t + r);
    g.arcTo(x0, t, x0 + r, t, r);
    g.lineTo(x1 - r, t);
    g.arcTo(x1, t, x1, t + r, r);
    g.lineTo(x1, y);
    g.lineTo(f.x + f.w, y);
    g.stroke();
  });
}

// The lab setting (2026-10-28, scene-polish plan part D, redrawn after review): an illustrated, quiet lab
// wall. A high shelf of reagent bottles and glassware top left, a periodic-table poster top right, a chair
// rail and tiled splashback low down (usually under the scene's bench). Everything sits high and at the
// edges so the middle band, where a scene puts its hero, stays plain paper. Inks are the paper pulled a
// small step toward label or a series colour, so it reads in both themes and never as content. Lite is
// flat fills with one shade step (the side away from the top-left key light); rich adds soft light and
// contact shadows. Silhouettes keep SimGlass proportions (bottle neck 0.4, flask neck 0.32).
function paintLabWall(g, c, FW, FH, paper, light, grid, rich) {
  const u = Math.max(0.55, Math.min(FW / 680, FH / 520));
  const ink = (t) => mix(paper, c.label, t);       // neutral wall ink, t of the way to label
  const tint = (col, t) => mix(paper, col, (light ? 0.8 : 0.7) * t);    // a muted series ink
  const shade = (col) => (light ? darken(col, 0.06) : darken(col, 0.12));
  // Splashback: a chair rail at 64%, staggered glazed tiles below it (hidden under most benches).
  const yr = Math.round(FH * 0.64), yt = yr + 7 * u;
  if (rich) {                                                   // the wall darkens a touch away from the light
    const gr = g.createLinearGradient(0, 0, 0, yr);
    gr.addColorStop(0, alpha(ink(0), 0)); gr.addColorStop(1, alpha(darken(paper, 0.4), light ? 0.05 : 0.12));
    g.fillStyle = gr;
    g.fillRect(0, 0, FW, yr);
  }
  g.fillStyle = ink(0.035);
  g.fillRect(0, yr, FW, FH - yr);
  if (!grid) {
    const TW = 56 * u, TH = 28 * u;
    g.strokeStyle = ink(0.1);
    g.lineWidth = 1;
    g.beginPath();
    for (let y = yt, n = 0; y < FH; y += TH, n++) {
      const yy = Math.round(y + TH) + 0.5;
      g.moveTo(0, yy); g.lineTo(FW, yy);
      for (let x = (n % 2 ? TW / 2 : 0) + TW; x < FW + TW; x += TW) { g.moveTo(Math.round(x) + 0.5, y); g.lineTo(Math.round(x) + 0.5, Math.min(FH, y + TH)); }
    }
    g.stroke();
    g.fillStyle = alpha(lighten(paper, 0.8), light ? 0.5 : 0.04);   // each glaze catches the key light
    for (let y = yt, n = 0; y < FH; y += TH, n++) {
      for (let x = (n % 2 ? TW / 2 : 0) - TW; x < FW; x += TW) g.fillRect(x + 5 * u, y + 4 * u, TW * 0.3, 1.5 * u);
    }
  }
  if (rich) {                                                   // soft shade under the rail
    const gr = g.createLinearGradient(0, yt, 0, yt + 16 * u);
    gr.addColorStop(0, alpha(darken(paper, 0.4), light ? 0.08 : 0.2)); gr.addColorStop(1, alpha(darken(paper, 0.4), 0));
    g.fillStyle = gr;
    g.fillRect(0, yt, FW, 16 * u);
  }
  g.fillStyle = ink(0.09);
  g.fillRect(0, yr, FW, 7 * u);
  g.fillStyle = alpha(lighten(paper, 0.7), light ? 0.7 : 0.08);
  g.fillRect(0, yr, FW, 1.5 * u);
  g.fillStyle = ink(0.13);
  g.fillRect(0, yr + 5.5 * u, FW, 1.5 * u);
  // The shelf, top left, and what stands on it.
  const sx = 16 * u, sw = Math.min(FW * 0.34, 214 * u), sy = Math.round(FH * 0.2);
  const row = [
    ['bottle', 26, 46, c.s8], ['flask', 36, 40, c.s1], ['jar', 24, 30, c.s3], ['round', 30, 38, c.s4],
    ['beaker', 30, 28, c.s7], ['bottle', 20, 34, c.s5],
  ];
  let x = sx + 10 * u;
  const gap = Math.max(3 * u, (sw - 20 * u - row.reduce((n, r) => n + r[1] * u, 0)) / (row.length - 1));
  for (const [kind, w, h, col] of row) {
    if (x + w * u > sx + sw - 6 * u) break;
    if (rich) {                                                 // contact shadow, cast down and right
      g.fillStyle = alpha(darken(paper, 0.5), light ? 0.08 : 0.22);
      g.beginPath(); g.ellipse(x + w * u * 0.6, sy - 0.5 * u, w * u * 0.55, 2.5 * u, 0, 0, TAU); g.fill();
    }
    paintLabVessel(g, kind, x, sy - h * u, w * u, h * u, paper, ink, tint(col, 0.32), light, rich);
    x += w * u + gap;
  }
  paintLabShelf(g, sx, sy, sw, u, ink, light, rich);
  // The periodic table, top right: 18 x 7 cells in the real shape, coloured by block.
  paintLabTable(g, c, FW, FH, u, paper, ink, tint, shade, light, rich);
}

/** A wall shelf: lit top face, front edge one shade down, two brackets, a soft shadow under it. */
function paintLabShelf(g, x, y, w, u, ink, light, rich) {
  if (rich) {
    const gr = g.createLinearGradient(0, y + 8 * u, 0, y + 30 * u);
    gr.addColorStop(0, ink(0.08)); gr.addColorStop(1, alpha(ink(0.08), 0));
    g.fillStyle = gr;
    g.fillRect(x + 4 * u, y + 8 * u, w - 8 * u, 22 * u);
  } else {
    g.fillStyle = ink(0.05);
    g.fillRect(x + 6 * u, y + 8 * u, w - 12 * u, 6 * u);
  }
  g.fillStyle = ink(0.12);
  for (const bx of [x + w * 0.16, x + w * 0.84 - 8 * u]) {
    g.beginPath(); g.moveTo(bx, y + 6 * u); g.lineTo(bx + 8 * u, y + 6 * u); g.lineTo(bx + 8 * u, y + 20 * u); g.closePath(); g.fill();
  }
  rr(g, x, y, w, 8 * u, 3 * u);
  g.fillStyle = ink(0.17);
  g.fill();
  rr(g, x, y, w, 3 * u, [3 * u, 3 * u, 0, 0]);
  g.fillStyle = ink(light ? 0.07 : 0.24);
  g.fill();
}

/** One vessel silhouette on a shelf: body ink, a liquid band, a cap or rim, a shade step on the right. */
function paintLabVessel(g, kind, x, y, w, h, paper, ink, liq, light, rich) {
  const path = () => {
    g.beginPath();
    if (kind === 'bottle') {
      const nw = w * 0.4, nx = x + (w - nw) / 2, nh = h * 0.14, sh = h * 0.32, r = w * 0.14;
      g.moveTo(nx, y); g.lineTo(nx, y + nh);
      g.bezierCurveTo(nx, y + sh * 0.85, x, y + nh + (sh - nh) * 0.3, x, y + sh);
      g.lineTo(x, y + h - r); g.quadraticCurveTo(x, y + h, x + r, y + h);
      g.lineTo(x + w - r, y + h); g.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
      g.lineTo(x + w, y + sh);
      g.bezierCurveTo(x + w, y + nh + (sh - nh) * 0.3, nx + nw, y + sh * 0.85, nx + nw, y + nh);
      g.lineTo(nx + nw, y);
    } else if (kind === 'flask') {
      const nw = w * 0.32, nx = x + (w - nw) / 2, nh = h * 0.32, r = w * 0.1;
      g.moveTo(nx, y); g.lineTo(nx, y + nh); g.lineTo(x, y + h - r);
      g.quadraticCurveTo(x, y + h, x + r, y + h); g.lineTo(x + w - r, y + h);
      g.quadraticCurveTo(x + w, y + h, x + w, y + h - r); g.lineTo(nx + nw, y + nh); g.lineTo(nx + nw, y);
    } else if (kind === 'round') {
      const nw = w * 0.32, rad = w / 2, cy = y + h - rad, nx = x + (w - nw) / 2;
      const a = Math.asin(Math.min(1, nw / 2 / rad));
      g.moveTo(nx, y); g.lineTo(nx, cy - Math.cos(a) * rad);
      g.arc(x + w / 2, cy, rad, -Math.PI / 2 - a, -Math.PI / 2 + a, true);
      g.lineTo(nx + nw, y);
    } else {
      const r = Math.min(w * 0.18, 5);
      g.moveTo(x, y); g.lineTo(x, y + h - r); g.quadraticCurveTo(x, y + h, x + r, y + h);
      g.lineTo(x + w - r, y + h); g.quadraticCurveTo(x + w, y + h, x + w, y + h - r); g.lineTo(x + w, y);
    }
    g.closePath();
  };
  const body = ink(0.1);
  path();
  g.fillStyle = body;
  g.fill();
  g.save();
  path();
  g.clip();
  const lv = kind === 'bottle' ? 0.62 : kind === 'jar' ? 0.7 : kind === 'round' ? 0.5 : 0.45;   // liquid share of the height
  g.fillStyle = liq;
  g.fillRect(x - 1, y + h * (1 - lv), w + 2, h * lv + 1);
  if (kind === 'bottle' || kind === 'jar') {                    // a paper label on the reagent bottle
    g.fillStyle = ink(light ? 0.02 : 0.2);
    rr(g, x + w * 0.18, y + h * (kind === 'jar' ? 0.42 : 0.52), w * 0.64, h * 0.2, 2);
    g.fill();
  }
  g.fillStyle = light ? alpha(ink(0.5), 0.1) : alpha(ink(0), 0.35);   // shade step: the side away from the light
  g.fillRect(x + w * 0.68, y, w * 0.4, h + 1);
  if (rich) {
    const gr = g.createLinearGradient(x, y, x + w * 0.5, y);
    gr.addColorStop(0, alpha(light ? lighten(paper, 0.8) : ink(0.4), 0.35)); gr.addColorStop(1, alpha(ink(0.4), 0));
    g.fillStyle = gr;
    g.fillRect(x, y, w * 0.5, h);
  }
  g.fillStyle = light ? alpha(lighten(paper, 0.9), 0.6) : alpha(ink(0.5), 0.3);   // the streak of the key light
  g.fillRect(x + w * 0.2, y + h * 0.38, Math.max(1.5, w * 0.08), h * 0.42);
  g.restore();
  if (kind === 'bottle' || kind === 'jar') {                    // a cap
    const cw = kind === 'jar' ? w * 1.04 : w * 0.5, ch = kind === 'jar' ? h * 0.16 : h * 0.13;
    rr(g, x + (w - cw) / 2, y - ch * (kind === 'jar' ? 0.4 : 0.85), cw, ch, 2);
    g.fillStyle = ink(0.2);
    g.fill();
  } else {
    const nw = kind === 'beaker' ? w + 3 : w * 0.32 + 3;        // the lip
    g.fillStyle = ink(0.18);
    rr(g, x + (w - nw) / 2, y - 1.5, nw, 3, 1.5);
    g.fill();
  }
}

/** The periodic table poster, top right: a pinned sheet, a title bar and 18 x 7 cells in muted block colours. */
function paintLabTable(g, c, FW, FH, u, paper, ink, tint, shade, light, rich) {
  const cs = 8.4 * u, gp = 1.6 * u, pad = 9 * u;
  const pw = 18 * cs + 17 * gp + pad * 2, ph = 7 * cs + 6 * gp + pad * 2 + 9 * u;
  const px = FW - pw - 18 * u, py = Math.round(FH * 0.045);
  if (px < FW * 0.5) return;                                    // a narrow frame: the shelf alone
  const sheet = light ? lighten(paper, 0.5) : ink(0.07);
  g.fillStyle = rich ? alpha(ink(0.2), 0.35) : ink(0.06);       // drop shadow, down and right of the light
  rr(g, px + 3 * u, py + 4 * u, pw, ph, 5 * u); g.fill();
  rr(g, px, py, pw, ph, 5 * u);
  g.fillStyle = sheet; g.fill();
  g.strokeStyle = ink(0.12); g.lineWidth = 1; g.stroke();
  g.fillStyle = ink(0.14);                                      // title bar
  rr(g, px + pad, py + pad * 0.7, pw * 0.42, 4 * u, 2 * u); g.fill();
  const blk = (col, r) => (col === 0 || (col === 1 && r > 0) ? c.s6 : col === 17 ? c.s5 : col >= 2 && col <= 11 ? c.s1 : c.s3);
  const has = (r, col) => (r === 0 ? col === 0 || col === 17 : r < 3 ? col < 2 || col > 11 : true);
  const y0 = py + pad + 9 * u;
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 18; col++) {
      if (!has(r, col)) continue;
      const x = px + pad + col * (cs + gp), y = y0 + r * (cs + gp);
      const f = tint(blk(col, r), light ? 0.26 : 0.2);      // muted: wall decor, never content
      rr(g, x, y, cs, cs, 1.5 * u);
      g.fillStyle = f; g.fill();
      g.fillStyle = shade(f);
      g.fillRect(x, y + cs * 0.7, cs, cs * 0.3);
    }
  }
  g.fillStyle = ink(0.24);                                      // the pin, catching the light
  g.beginPath(); g.arc(px + pw / 2, py + 3.5 * u, 2.6 * u, 0, TAU); g.fill();
}

// The maths paper (kit-owned look, 2026-10-27, from the math-polish prototype): flat bg-deep (lavender in
// light, deep indigo in dark) ruled in 24 px squares, lines = 8% label over the paper ('plain': 5%), no
// grain, no corners. SimLookDom's [data-sim-paper="graph"] .sl-backdrop paints the same; keep in step.
function drawGraphPaper(ctx, c, style, rich, FW, FH) {
  blitLayer(ctx, `graph|${style}|${rich ? 'r' : 'l'}|${c.bgDeep}|${c.label}`, 0, 0, FW, FH, (g) => {
    g.fillStyle = c.bgDeep;
    g.fillRect(0, 0, FW, FH);
    g.strokeStyle = mix(c.bgDeep, c.label, style === 'plain' ? 0.05 : 0.08);
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0.5; x < FW; x += 24) { g.moveTo(x, 0); g.lineTo(x, FH); }
    for (let y = 0.5; y < FH; y += 24) { g.moveTo(0, y); g.lineTo(FW, y); }
    g.stroke();
    if (rich) paintLightPool(g, c, FW, FH, 0.4);
  });
}

/**
 * Kept for the scenes that call it: the paper backdrop carries its own corners now, so the old
 * drifting far layer paints nothing. o: { seed, n, t, tint, k, profile } (ignored).
 */
export function drawDepth() {}

/**
 * A floor from y to the bottom: paper tinted 15% series-4 (or o.col), a soft contact shade where it
 * meets the wall, faint perspective seams, a lit lip, and the same paper grain. Rich adds a gentle
 * falloff toward the viewer and a pool of the key light. o: { col, seams, profile }
 */
export function drawFloor(ctx, c, y, o = {}) {
  const { w: FW, h: FH } = frameOf(ctx);
  const light = isLightTheme(c);
  const rich = profileOf(o) === 'rich';
  const graph = paperKind(o) === 'graph';
  if (lookOf().backdrop === 'flat' || settingKind(o) === 'casefile') {   // a plain band under a hairline, whatever tint the scene asked for
    if (settingKind(o) === 'casefile') {                  // on the casefile card only: the desk and the folder stay
      const k = casefileRects(FW, FH).card;
      ctx.fillStyle = mix(c.setCard, c.label, 0.05);
      ctx.fillRect(k.x, y, k.w, Math.max(0, k.y + k.h - y));
      ctx.fillStyle = mix(c.setCard, c.label, 0.28);
      ctx.fillRect(k.x, y - 0.5, k.w, 1);
      return;
    }
    ctx.fillStyle = mix(paperOf(c, o), c.label, 0.05);
    ctx.fillRect(0, y, FW, FH - y);
    ctx.fillStyle = mix(paperOf(c, o), c.label, 0.28);
    ctx.fillRect(0, y - 0.5, FW, 1);
    return;
  }
  const set = settingKind(o);
  const world = set === 'water' ? c.setSand : set === 'parchment' ? c.setParchment : set === 'sky' || set === 'field' ? c.setGround : null;
  const col = o.col ?? (graph ? mix(c.bgDeep, c.label, 0.05) : world ?? mix(paperOf(c), c.s4, 0.15));
  const fh = FH - y;
  ctx.fillStyle = col;
  ctx.fillRect(0, y, FW, fh);
  if (fh <= 0) return;
  const shade = darken(mix(col, c.s5, 0.15), light ? 0.22 : 0.45);
  // Wall contact: the wall darkens a touch just above the seam (ambient occlusion).
  if (rich) {
    const ao = ctx.createLinearGradient(0, y - 22, 0, y);
    ao.addColorStop(0, alpha(shade, 0));
    ao.addColorStop(1, alpha(shade, light ? 0.12 : 0.3));
    ctx.fillStyle = ao;
    ctx.fillRect(0, y - 22, FW, 22);
  } else {
    ctx.fillStyle = alpha(shade, light ? 0.03 : 0.1);
    ctx.fillRect(0, y - 12, FW, 12);
    ctx.fillStyle = alpha(shade, light ? 0.035 : 0.1);
    ctx.fillRect(0, y - 5, FW, 5);
  }
  if (rich) {
    // Falloff toward the viewer, then the key light's pool on the boards.
    const fo = ctx.createLinearGradient(0, y, 0, FH);
    fo.addColorStop(0, alpha(lighten(col, 0.5), light ? 0.1 : 0.06));
    fo.addColorStop(1, alpha(shade, light ? 0.12 : 0.28));
    ctx.fillStyle = fo;
    ctx.fillRect(0, y, FW, fh);
    ctx.save();
    ctx.translate(FW * 0.36, y + fh * 0.2);
    ctx.scale(1, 0.32);
    const R = FW * 0.5;
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    const pc = light ? lighten(col, 0.85) : mix(col, c.s5, 0.35);
    pool.addColorStop(0, alpha(pc, light ? 0.5 : 0.22));
    pool.addColorStop(1, alpha(pc, 0));
    ctx.fillStyle = pool;
    ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.restore();
  } else {
    // Two flat steps of contact shade under the lip, then the plain board.
    ctx.fillStyle = alpha(shade, light ? 0.05 : 0.1);
    ctx.fillRect(0, y, FW, Math.min(fh, 18));
    ctx.fillStyle = alpha(shade, light ? 0.04 : 0.08);
    ctx.fillRect(0, y, FW, Math.min(fh, 8));
  }
  if (o.seams !== false && fh > 24) {
    const cx = FW / 2;
    const gap = 92;
    const nSide = Math.ceil(cx / gap) + 1;
    ctx.strokeStyle = alpha(shade, light ? 0.13 : 0.32);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = -nSide; i <= nSide; i++) {
      const x = cx + i * gap;
      ctx.moveTo(x, y + 12);
      ctx.lineTo(x + (x - cx) * 0.45, FH);
    }
    ctx.stroke();
  }
  // The lip: the floor's front edge catching the key light, with a hairline seam above it.
  ctx.fillStyle = alpha(shade, light ? 0.22 : 0.5);
  ctx.fillRect(0, y - 1, FW, 1.5);
  ctx.fillStyle = light ? lighten(col, 0.55) : lighten(col, 0.17);
  ctx.fillRect(0, y + 0.5, FW, 3);
  if (!graph && lookOf().grain && (isPaperSetting(set) || set === 'parchment')) blitLayer(ctx, `fgrain|${col}`, 0, y, FW, fh, (g, s) => paintPaperGrain(g, s, FW, fh, col, light, 2, 77));
}

/** A sunbeam is literal light, so it earns a soft gradient (house style 4.5). */
export function drawSunbeam(ctx, c, x0, x1, bx0, bx1, yTop, yBot, k = 1) {
  const g = ctx.createLinearGradient(0, yTop, 0, yBot);
  g.addColorStop(0, alpha(c.warning, 0.16 * k));
  g.addColorStop(1, alpha(c.warning, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x0, yTop); ctx.lineTo(x1, yTop); ctx.lineTo(bx1, yBot); ctx.lineTo(bx0, yBot);
  ctx.closePath();
  ctx.fill();
}

/** A pool of light on the hero (literal light: a lamp on the stage). */
export function drawSpotlight(ctx, c, x, y, r, k = 1) {
  const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
  g.addColorStop(0, alpha(lighten(c.warning, 0.4), 0.2 * k));
  g.addColorStop(0.6, alpha(c.warning, 0.07 * k));
  g.addColorStop(1, alpha(c.warning, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Light falling off toward the frame edges (literal light). Draw after the set, before the chips. */
export function drawVignette(ctx, c, k = 1) {
  if (lookOf().backdrop === 'flat') return;
  const { w: FW, h: FH } = frameOf(ctx);
  const g = ctx.createRadialGradient(FW / 2, FH * 0.45, FH * 0.35, FW / 2, FH * 0.45, FW * 0.75);
  const edge = luma(c.bgDeep) > 0.5 ? darken(c.bgDeep, 0.12) : darken(c.bgDeep, 0.6);
  g.addColorStop(0, alpha(edge, 0));
  g.addColorStop(1, alpha(edge, 0.55 * k));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FW, FH);
}

/** Dust motes drifting in a light (rect { x, y, w, h }); literal light, so they may glow. */
export function drawMotes(ctx, c, t, rect, o = {}) {
  if (!lookOf().popSparkles) return;
  if (reducedMotion()) t = 0;   // ambient: frozen under reduced motion
  const rnd = mulberry32(o.seed ?? 11);
  const n = o.n ?? 18;
  for (let i = 0; i < n; i++) {
    const bx = rnd(), by = rnd(), sp = 0.02 + rnd() * 0.04, ph = rnd() * TAU, r = 1.2 + rnd() * 2;
    const u = (by - t * sp) % 1;
    const yy = rect.y + ((u + 1) % 1) * rect.h;
    const xx = rect.x + bx * rect.w + Math.sin(t * 0.8 + ph) * 8;
    ctx.beginPath();
    ctx.arc(xx, yy, r, 0, TAU);
    ctx.fillStyle = alpha(lighten(c.warning, 0.5), 0.35 + 0.3 * Math.sin(t * 2 + ph));
    ctx.fill();
  }
}

/** Twinkling four-point sparkles scattered in a rect, in the series colours. */
export function drawTwinkles(ctx, c, t, rect, o = {}) {
  if (!lookOf().popSparkles) return;
  if (reducedMotion()) t = 0;   // ambient: frozen under reduced motion
  const rnd = mulberry32(o.seed ?? 5);
  const n = o.n ?? 10;
  const cols = [c.s2, c.s1, c.s4, c.s3, c.s5];
  for (let i = 0; i < n; i++) {
    const x = rect.x + rnd() * rect.w, y = rect.y + rnd() * rect.h, ph = rnd() * TAU, r = 4 + rnd() * 5;
    const k = Math.max(0, Math.sin(t * (1.2 + rnd()) + ph));
    if (k < 0.05) continue;
    sparkle(ctx, x, y, r * k, alpha(cols[i % cols.length], 0.35 + 0.4 * k));
  }
}

/** Flat contact shadow under anything standing (an ellipse, no blur). */
export function drawShadow(ctx, c, x, y, rx, ry = rx * 0.22, k = 1) {
  ellipse(ctx, x, y, rx, ry);
  ctx.fillStyle = alpha(darken(c.bgDeep, 0.5), (luma(c.bgDeep) > 0.5 ? 0.14 : 0.45) * k);
  ctx.fill();
}

/** A thin shelf with a cushion shade and a highlight strip. o: { col } (default warm gold). */
export function drawShelf(ctx, c, x0, x1, y, o = {}) {
  if (lookOf().furniture === 'flat') { flatSlab(ctx, c, x0, x1, y, 8, o.col); return; }
  const wood = darken(o.col ?? c.gold, 0.3);
  drawShadow(ctx, c, (x0 + x1) / 2, y + 18, (x1 - x0) / 2, 5, 0.8);
  rr(ctx, x0, y + 4, x1 - x0, 14, 7);
  ctx.fillStyle = darken(wood, 0.35);
  ctx.fill();
  rr(ctx, x0, y, x1 - x0, 14, 7);
  ctx.fillStyle = woodFill(ctx, wood, x0, y, x1, 14);
  ctx.fill();
  woodGrain(ctx, wood, x0 + 6, y + 4, x1 - x0 - 12, 8, x0 * 7 + x1);
  ctx.fillStyle = alpha(lighten(wood, 0.45), 0.7);
  ctx.fillRect(x0 + 8, y + 1.5, x1 - x0 - 16, 1.5);
}

// A look with furniture 'flat': one slab, one outline, no grain and no light.
function flatSlab(ctx, c, x0, x1, y, h, col) {
  ctx.fillStyle = col ? mix(c.bgSurface, col, 0.35) : mix(c.bgSurface, c.label, 0.14);
  ctx.fillRect(x0, y, x1 - x0, h);
  ctx.strokeStyle = mix(c.bgSurface, c.label, 0.4);
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y + 0.5, x1 - x0 - 1, h - 1);
}

// Slab fill lit from the top left: lighter at the left end, darker to the right.
function woodFill(ctx, wood, x0, y, x1, h) {
  const g = ctx.createLinearGradient(x0, y, x1, y + h);
  g.addColorStop(0, lighten(wood, 0.12));
  g.addColorStop(0.55, wood);
  g.addColorStop(1, darken(wood, 0.12));
  return g;
}

// Faint seeded grain streaks along a slab (deterministic for one seed).
function woodGrain(ctx, wood, x, y, w, h, seed) {
  const rnd = mulberry32(Math.round(seed) >>> 0);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  const n = Math.max(3, Math.round(w / 60));
  for (let i = 0; i < n; i++) {
    const sx = x + rnd() * w * 0.85, len = w * (0.12 + rnd() * 0.25), sy = y + rnd() * h;
    ctx.strokeStyle = alpha(rnd() < 0.5 ? darken(wood, 0.3) : lighten(wood, 0.25), 0.35);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + len / 2, sy + (rnd() - 0.5) * 2.5, Math.min(x + w, sx + len), sy + (rnd() - 0.5) * 1.5);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A bench / table top to stand the hero on: top slab at y lit from the top left
 * with faint grain, a front apron, and two stubby legs down to y + h, all on a
 * contact shadow. o: { col, h }
 */
export function drawBench(ctx, c, x0, x1, y, o = {}) {
  const h = o.h ?? 60;
  if (lookOf().furniture === 'flat') {
    for (const lx of [x0 + 24, x1 - 32]) flatSlab(ctx, c, lx, lx + 8, y + 12, h - 12, o.col);
    flatSlab(ctx, c, x0, x1, y, 12, o.col);
    return;
  }
  const top = darken(o.col ?? c.gold, 0.25);
  const leg = darken(top, 0.35);
  drawShadow(ctx, c, (x0 + x1) / 2, y + h, (x1 - x0) / 2 + 10, 9);
  for (const lx of [x0 + 22, x1 - 42]) {
    rr(ctx, lx, y + 10, 20, h - 10, 6);
    const lg = ctx.createLinearGradient(lx, 0, lx + 20, 0);
    lg.addColorStop(0, lighten(leg, 0.12));
    lg.addColorStop(1, darken(leg, 0.15));
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.fillStyle = alpha(lighten(leg, 0.3), 0.5);
    ctx.fillRect(lx + 4, y + 14, 3, h - 22);
  }
  rr(ctx, x0 + 6, y + 14, x1 - x0 - 12, 18, 7);
  ctx.fillStyle = darken(top, 0.2);
  ctx.fill();
  ctx.fillStyle = alpha(darken(top, 0.5), 0.35);
  ctx.fillRect(x0 + 10, y + 21, x1 - x0 - 20, 3);
  rr(ctx, x0, y + 5, x1 - x0, 16, 8);
  ctx.fillStyle = darken(top, 0.35);
  ctx.fill();
  rr(ctx, x0, y, x1 - x0, 16, 8);
  ctx.fillStyle = woodFill(ctx, top, x0, y, x1, 16);
  ctx.fill();
  woodGrain(ctx, top, x0 + 8, y + 5, x1 - x0 - 16, 9, x0 * 13 + x1 * 3 + y);
  ctx.fillStyle = alpha(lighten(top, 0.45), 0.75);
  ctx.fillRect(x0 + 10, y + 1.5, x1 - x0 - 20, 2);
  ctx.fillStyle = alpha(darken(top, 0.25), 0.6);
  for (let i = 1; i < 4; i++) ctx.fillRect(x0 + ((x1 - x0) * i) / 4, y + 7, 2, 7);
}

// -- Cards and readings -----------------------------------------------------------

/**
 * Panel card: a soft drop shadow, the surface lit from the top left, a thin
 * highlight on the top edge, and an optional coloured header stripe. o: { accent, r }
 */
export function drawCard(ctx, c, x, y, w, h, a = 1, o = {}) {
  const L = lookOf();
  const r = (o.r ?? 14) * L.radius;
  const light = isLightTheme(c);
  const rim = o.accent ?? mix(c.bgSurface, c.stroke, light ? 0.75 : 0.9);
  ctx.save();
  ctx.globalAlpha *= a;
  // The lip: a solid step of the rim tone under the card (the same lip the DOM .sim-card wears), never a blur.
  if (L.lip > 0 || L.cardShadow > 0) {
    rr(ctx, x, y + 4 * Math.max(L.lip, L.cardShadow * 0.75), w, h, r);
    ctx.fillStyle = o.accent ? darken(o.accent, 0.3) : mix(rim, c.bgDeep, 0.3);
    ctx.fill();
  }
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = c.bgSurface;
  ctx.fill();
  if (o.accent) {
    ctx.save();
    rr(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.fillStyle = o.accent;
    ctx.fillRect(x, y, w, 7);
    ctx.restore();
  }
  rr(ctx, x, y, w, h, r);
  ctx.strokeStyle = rim;
  ctx.lineWidth = 2.5 * L.rim;
  ctx.stroke();
  ctx.restore();
}

/**
 * A progress meter: stadium track, filled part with gloss, optional target tick
 * and end cap bubble. o: { col, target, targetCol, t }
 */
export function drawMeter(ctx, c, x, y, w, h, v, o = {}) {
  const col = o.col ?? c.accent;
  const u = clamp01(v);
  const L = lookOf();
  if (L.lip > 0) {
    stadium(ctx, x, y + 2 * L.lip, w, h);
    ctx.fillStyle = darken(c.track, 0.3);
    ctx.fill();
  }
  stadium(ctx, x, y, w, h);
  ctx.fillStyle = c.track;
  ctx.fill();
  if (u > 0) {
    const fw = Math.max(h, w * u);
    stadium(ctx, x, y, fw, h);
    ctx.fillStyle = col;
    ctx.fill();
    if (L.gloss > 0) {
      stadium(ctx, x + h * 0.35, y + h * 0.18, Math.max(0, fw - h * 0.7), h * 0.26);
      ctx.fillStyle = alpha(lighten(col, 0.6), 0.6 * L.gloss);
      ctx.fill();
    }
  }
  if (o.target != null) {
    const tx = x + w * clamp01(o.target);
    rr(ctx, tx - 2, y - 5, 4, h + 10, 2);
    ctx.fillStyle = o.targetCol ?? c.label;
    ctx.fill();
  }
}

/**
 * A round state badge: 'check' | 'cross' | 'star' | 'dot', flat fill with a lift.
 * col defaults by kind (good / bad / warning / accent).
 */
export function drawBadge(ctx, c, kind, x, y, r, col) {
  const bg = col ?? { check: c.good, cross: c.bad, star: c.warning }[kind] ?? c.accent;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y + r * 0.18 * lookOf().lip, r, 0, TAU);
  ctx.fillStyle = darken(bg, 0.38);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = bg;
  ctx.fill();
  const ink = inkOn(c, bg);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(2, r * 0.26);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'check') {
    ctx.moveTo(x - r * 0.42, y + r * 0.02);
    ctx.lineTo(x - r * 0.1, y + r * 0.34);
    ctx.lineTo(x + r * 0.45, y - r * 0.3);
    ctx.stroke();
  } else if (kind === 'cross') {
    ctx.moveTo(x - r * 0.32, y - r * 0.32); ctx.lineTo(x + r * 0.32, y + r * 0.32);
    ctx.moveTo(x + r * 0.32, y - r * 0.32); ctx.lineTo(x - r * 0.32, y + r * 0.32);
    ctx.stroke();
  } else if (kind === 'star') {
    star(ctx, x, y + r * 0.04, r * 0.58, 5, 0.48);
    ctx.fill();
  } else {
    ctx.arc(x, y, r * 0.28, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A reading card: title tab, then label-left / value-right rows, each with an
 * optional meter or badge. rows: [{ label, value, col?, meter?, target?, badge? }]
 * o: { title, accent, a, rowH }. Returns the card's height (to chain cards).
 */
export function drawReadout(ctx, c, x, y, w, rows, o = {}) {
  const rowH = o.rowH ?? 30;
  const head = o.title ? 34 : 12;
  const extra = rows.reduce((s, r) => s + (r.meter != null ? 16 : 0), 0);
  const h = head + rows.length * rowH + extra + 10;
  const accent = o.accent ?? c.accent;
  drawCard(ctx, c, x, y, w, h, o.a ?? 1, { accent });
  ctx.save();
  ctx.globalAlpha *= o.a ?? 1;
  if (o.title) pill(ctx, c, o.title, x + 12, y + 22, { bg: accent, size: 14, align: 'left' });
  let ry = y + head + 4;
  for (const r of rows) {
    const my = ry + rowH / 2;
    let lx = x + 14;
    if (r.badge) { drawBadge(ctx, c, r.badge, x + 24, my, 10); lx = x + 42; }
    ctx.textBaseline = 'middle';
    ctx.font = font(c, 700, 15);
    ctx.fillStyle = c.label;
    ctx.textAlign = 'left';
    ctx.fillText(r.label, lx, my);
    ctx.font = font(c, 800, 18, true);
    ctx.fillStyle = r.col ?? c.label;
    ctx.textAlign = 'right';
    ctx.fillText(String(r.value), x + w - 14, my);
    ry += rowH;
    if (r.meter != null) {
      drawMeter(ctx, c, x + 14, ry - 4, w - 28, 12, r.meter, { col: r.col, target: r.target });
      ry += 16;
    }
  }
  ctx.restore();
  return h;
}

// -- Faces ----------------------------------------------------------------------

/**
 * A big-eyed face for any character or object (a cell, a beaker, a coin, a
 * planet): baby proportions - eyes low and wide, two sparkles in each, a
 * coloured iris - drawn on top of a body you have already filled. Characters
 * with faces are part of the look bar; give the hero one when it can carry a mood.
 *   (x, y): face centre (roughly the body's centre); r: the body radius it sits in
 *   o: { col     body fill it sits on (ink and whites are derived from it)
 *        c       this.colors: gives iris, blush, tongue, tear and sweat their hues
 *        mood    'smile' (default) | 'happy' | 'sad' | 'oops' | 'think' | 'squint'
 *        blush   true, or a colour, for cheek blush
 *        look    { x, y } in -1..1: where the pupils point
 *        t       scene clock, for the blink, tear and think dots }
 */
export function drawFace(ctx, x, y, r, o = {}) {
  if (!lookOf().faces) return;
  const col = o.col ?? o.c?.shape ?? '';
  const mood = o.mood ?? 'smile';
  const ink = o.ink ?? darken(col, 0.82);
  const white = lighten(col, 0.95);
  const iris = o.c ? mix(o.c.s5, ink, 0.35) : ink;
  const t = o.t ?? 0;
  const lx = Math.max(-1, Math.min(1, o.look?.x ?? 0));
  const ly = Math.max(-1, Math.min(1, o.look?.y ?? (mood === 'think' ? -0.8 : 0)));
  const ex = r * 0.38, ey = y + r * 0.04, er = r * 0.23;
  const wide = mood === 'oops' ? 1.12 : 1;
  const blinkPh = (t * 0.9 + (x % 7) * 0.13) % 4;
  const blink = mood === 'squint' || mood === 'happy' ? 1 : blinkPh < 0.12 ? 0.1 : 1;
  const lw = Math.max(2, r * 0.075);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of [-1, 1]) {
    const cx = x + s * ex;
    if (mood === 'squint' || mood === 'happy') {
      ctx.beginPath();
      ctx.arc(cx, ey + er * 0.35, er * 0.78, 1.12 * Math.PI, 1.88 * Math.PI);
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw * 1.1;
      ctx.stroke();
    } else {
      ellipse(ctx, cx, ey + er * 0.12, er * wide, er * 1.14 * wide * blink);
      ctx.fillStyle = darken(col, 0.25);
      ctx.fill();
      ellipse(ctx, cx, ey, er * wide, er * 1.14 * wide * blink);
      ctx.fillStyle = white;
      ctx.fill();
      if (blink === 1) {
        const pr = er * 0.66;
        const px = cx + lx * er * 0.3, py = ey + ly * er * 0.3 + er * 0.12;
        ellipse(ctx, px, py, pr, pr * 1.08);
        ctx.fillStyle = iris;
        ctx.fill();
        ellipse(ctx, px, py + pr * 0.08, pr * 0.62, pr * 0.66);
        ctx.fillStyle = ink;
        ctx.fill();
        ellipse(ctx, px - pr * 0.34, py - pr * 0.4, pr * 0.36, pr * 0.36);
        ctx.fillStyle = white;
        ctx.fill();
        ellipse(ctx, px + pr * 0.36, py + pr * 0.36, pr * 0.15, pr * 0.15);
        ctx.fill();
      }
    }
    // Brows carry most of the mood.
    const by = ey - er * 1.5;
    ctx.beginPath();
    if (mood === 'sad') {
      ctx.moveTo(cx - s * er * 0.8, by + er * 0.35);
      ctx.lineTo(cx + s * er * 0.5, by - er * 0.1);
    } else if (mood === 'oops') {
      ctx.arc(cx, by + er * 0.1, er * 0.7, 1.2 * Math.PI, 1.8 * Math.PI);
    } else if (mood === 'think') {
      const up = s > 0 ? -er * 0.3 : er * 0.05;
      ctx.moveTo(cx - er * 0.6, by + up);
      ctx.lineTo(cx + er * 0.6, by + up - s * er * 0.1);
    } else if (mood === 'happy' || mood === 'squint') {
      ctx.arc(cx, by + er * 0.35, er * 0.55, 1.2 * Math.PI, 1.8 * Math.PI);
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 0.9;
    ctx.stroke();
  }
  if (o.blush || mood === 'happy' || mood === 'squint') {
    const bc = typeof o.blush === 'string' ? o.blush : o.c ? alpha(mix(col, o.c.s4, 0.65), 0.7) : alpha(lighten(col, 0.35), 0.55);
    for (const s of [-1, 1]) {
      ellipse(ctx, x + s * r * 0.64, ey + er * 1.3, r * 0.15, r * 0.085);
      ctx.fillStyle = bc;
      ctx.fill();
    }
  }
  const my = ey + er * 1.65;
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = lw;
  ctx.beginPath();
  if (mood === 'smile') {
    ctx.arc(x, my - r * 0.07, r * 0.17, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else if (mood === 'squint' || mood === 'happy') {
    // Open D-mouth with a tongue.
    const mw = r * (mood === 'happy' ? 0.24 : 0.2);
    ctx.moveTo(x - mw, my - r * 0.04);
    ctx.quadraticCurveTo(x, my + r * 0.36, x + mw, my - r * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    ellipse(ctx, x, my + r * 0.2, mw * 0.62, r * 0.12);
    ctx.fillStyle = o.c ? mix(o.c.s6, o.c.s4, 0.5) : lighten(ink, 0.5);
    ctx.fill();
    ctx.restore();
  } else if (mood === 'sad') {
    ctx.arc(x, my + r * 0.14, r * 0.15, 1.2 * Math.PI, 1.8 * Math.PI);
    ctx.stroke();
  } else if (mood === 'oops') {
    ellipse(ctx, x, my + r * 0.05, r * 0.09, r * 0.12);
    ctx.fill();
  } else {
    ctx.moveTo(x - r * 0.12, my + r * 0.03);
    ctx.quadraticCurveTo(x, my - r * 0.03, x + r * 0.15, my - r * 0.02);
    ctx.stroke();
  }
  const drop = (dx, dy, s) => {
    ctx.beginPath();
    ctx.moveTo(dx, dy - r * 0.17 * s);
    ctx.quadraticCurveTo(dx + r * 0.11 * s, dy, dx, dy + r * 0.07 * s);
    ctx.quadraticCurveTo(dx - r * 0.11 * s, dy, dx, dy - r * 0.17 * s);
    ctx.fillStyle = o.c ? lighten(o.c.s1, 0.35) : white;
    ctx.fill();
  };
  if (mood === 'oops') drop(x + r * 0.8, y - r * 0.42 + ((t * 0.6) % 1) * r * 0.3, 1);
  if (mood === 'sad') drop(x - ex - er * 0.2, ey + er * 1.2 + ((t * 0.5) % 1) * r * 0.35, 0.8);
  if (mood === 'think') {
    [0, 1, 2].forEach((i) => {
      ctx.beginPath();
      ctx.arc(x + r * (0.5 + i * 0.17), y - r * (0.62 + i * 0.16), r * (0.035 + i * 0.018) * (1 + 0.18 * Math.sin(t * 3 + i)), 0, TAU);
      ctx.fillStyle = alpha(white, 0.9);
      ctx.fill();
    });
  }
  ctx.restore();
}

// -- Note card ------------------------------------------------------------------

/**
 * A centred note card (what the model leaves out). SimScene draws it on its
 * NOTE_STAGE; any scene may call it directly. o: {
 *   rows   [{ icon?(ctx, x, y, t), text, sub? }]  short lines only
 *   title  badge text ('' = no badge)
 *   glyph? (ctx, x, y) draws a small badge glyph left of the title
 *   age    seconds since the stage began (pop-in and row stagger)
 *   t      scene clock
 *   dim    true to darken the scene behind the card }
 * Labels only - the full wording belongs in the slide's own prose.
 */
export function drawNoteCard(ctx, c, o) {
  const { w: FW, h: FH } = frameOf(ctx);
  const rows = o.rows || [];
  const cw = 452;
  const ch = 70 + rows.length * 58;
  const cx = (FW - cw) / 2;
  const cy = Math.max(40, (FH - ch) / 2);
  const age = o.age ?? 1;
  if (o.dim) {
    ctx.fillStyle = alpha(c.bgDeep, 0.62 * Math.min(1, age / 0.3));
    ctx.fillRect(0, 0, FW, FH);
  }
  const s = outBack((age - 0.1) / 0.45);
  if (s < 0.05) return;                 // a near-zero card is invisible; skip degenerate frames
  ctx.save();
  ctx.translate(FW / 2, cy + ch / 2);
  ctx.rotate((1 - Math.min(1, s)) * -0.08);
  ctx.scale(s, s);
  ctx.translate(-FW / 2, -(cy + ch / 2));
  const L = lookOf(), cr = 16 * L.radius;
  rr(ctx, cx, cy + 7 * L.lip, cw, ch, cr);
  ctx.fillStyle = darken(c.accent, 0.45);
  ctx.fill();
  rr(ctx, cx, cy, cw, ch, cr);
  ctx.fillStyle = c.bgSurface;
  ctx.fill();
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 4 * L.rim;
  ctx.stroke();
  stadium(ctx, cx + 18, cy + 6, cw - 36, 3);
  ctx.fillStyle = alpha(lighten(c.bgSurface, 0.35), 0.5 * L.gloss);
  ctx.fill();
  if (o.title) {
    let tx = cx + 22;
    if (o.glyph) {
      ctx.beginPath();
      ctx.arc(cx + 34, cy + 2, 15, 0, TAU);
      ctx.fillStyle = c.accent;
      ctx.fill();
      o.glyph(ctx, cx + 34, cy + 2);
      tx = cx + 58;
    }
    pill(ctx, c, o.title, tx, cy + 2, { bg: c.accent, size: 15, align: 'left' });
  }
  sparkle(ctx, cx + cw - 20, cy + 2, 10 * Math.max(0, Math.sin((o.t ?? 0) * 2)), c.warning);
  rows.forEach((row, i) => {
    const ra = clamp01((age - 0.45 - i * 0.2) / 0.3);
    if (ra <= 0) return;
    const ry = cy + 62 + i * 58;
    const ix = cx + 52;
    ctx.save();
    ctx.globalAlpha *= ra;
    ctx.translate((1 - ra) * 14, 0);
    row.icon?.(ctx, ix, ry, o.t ?? 0);
    ctx.fillStyle = c.label;
    ctx.font = font(c, 800, 18);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(row.text, ix + 36, row.sub ? ry - 9 : ry);
    if (row.sub) {
      ctx.fillStyle = c.labelMuted;
      ctx.font = font(c, 700, 15);
      ctx.fillText(row.sub, ix + 36, ry + 12);
    }
    ctx.restore();
  });
  ctx.restore();
}

/**
 * The default note: ONE line of muted text as a small tag in the bottom-right
 * corner (inside the y 498-520 band, under ZONES.bottom), on a translucent
 * backing so it reads over any scene, never dimming or covering the scene, so a
 * beat the learner must touch stays touchable. Rows' `text` are joined with a
 * middle dot; `sub` is ignored. o: { rows, age (fade-in seconds) }. Keep the
 * joined text under ~70 characters; it is not wrapped or shrunk.
 */
export function drawNoteLine(ctx, c, o) {
  const { w: FW, h: FH } = frameOf(ctx);
  const text = (o.rows || []).map((r) => r.text).filter(Boolean).join(' \u00b7 ');
  if (!text) return;
  const a = Math.min(1, (o.age ?? 1) / 0.4);
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.font = font(c, 700, 14);
  const tw = Math.min(ctx.measureText(text).width, FW - 40);
  const x1 = FW - 10, y = FH - 11;
  stadium(ctx, x1 - tw - 20, y - 10, tw + 20, 20);
  ctx.fillStyle = alpha(c.bgDeep, 0.78);
  ctx.fill();
  ctx.fillStyle = c.labelMuted;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x1 - 10, y + 0.5, tw);
  ctx.restore();
}

// -- Effects ----------------------------------------------------------------------

/**
 * Celebration effects on one list: shockwave rings and gravity-free twinkles.
 * A find goes through celebrate() or burst() (SimFind.js), not through here.
 *   ring(x, y, col, r = 90, max = 0.55, lw = 6, still)   an expanding ring (still: at full size, fading)
 *   twinkle(x, y, colors, n = 8, r = 60)                 sparkles radiating out and fading
 *   fire(x, y, colors, n, spread)                        no confetti any more: a few twinkles
 *   tick(x, y, col, bg, r = 16, max = 0.9)               a small check in a thin circle on bg, fading (celebration 'tick')
 *   stamp(x, y, word, col, font, still)                  a rotated outlined word landing (the tick on the casefile setting)
 * Twinkles need the look's popSparkles.
 * busy while anything is alive (SimScene keeps the loop awake for it).
 */
export class Burst {
  constructor() { this.parts = []; this.rings = []; this.twinks = []; this.ticks = []; this.stamps = []; }   // parts: always empty, for scenes that clear it

  get alive() { return this.rings.length + this.twinks.length + this.ticks.length + this.stamps.length > 0; }

  stamp(x, y, word, col, font, still = false) {
    this.stamps.push({ x, y, word: String(word || 'CONFIRMED').toUpperCase(), col, font, still, life: still ? 0.2 : 0, max: 2.8 });
  }

  fire(x, y, colors, n = 24, spread = 1) {
    this.twinkle(x, y, colors, Math.min(8, n), 70 * spread);
  }

  ring(x, y, col, r = 90, max = 0.55, lw = 6, still = false) {
    this.rings.push({ x, y, col, r, max, lw, still, life: 0 });
  }

  tick(x, y, col, bg, r = 16, max = 0.9) {
    this.ticks.push({ x, y, col, bg, r, max, life: 0 });
  }

  twinkle(x, y, colors, n = 8, r = 60) {
    if (!lookOf().popSparkles) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.5;
      const d = r * (0.6 + Math.random() * 0.6);
      this.twinks.push({ x, y, dx: Math.cos(a) * d, dy: Math.sin(a) * d, col: colors[i % colors.length], life: 0, max: 0.7 + Math.random() * 0.3, r: 6 + Math.random() * 6 });
    }
  }

  update(dt) {
    for (const r of this.rings) r.life += dt;
    this.rings = this.rings.filter((r) => r.life < r.max);
    for (const k of this.twinks) k.life += dt;
    this.twinks = this.twinks.filter((k) => k.life < k.max);
    for (const k of this.ticks) k.life += dt;
    this.ticks = this.ticks.filter((k) => k.life < k.max);
    for (const k of this.stamps) k.life += dt;
    this.stamps = this.stamps.filter((k) => k.life < k.max);
  }

  draw(ctx) {
    for (const r of this.rings) {
      const u = r.life / r.max;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.still ? r.r : r.r * (0.2 + 0.8 * Math.sqrt(u)), 0, TAU);
      ctx.strokeStyle = alpha(r.col, 1 - u);
      ctx.lineWidth = r.still ? r.lw : r.lw * (1 - u) + 1;
      ctx.stroke();
    }
    for (const k of this.twinks) {
      const u = k.life / k.max;
      const e = 1 - (1 - u) * (1 - u);
      sparkle(ctx, k.x + k.dx * e, k.y + k.dy * e, k.r * Math.sin(Math.PI * u), k.col);
    }
    for (const k of this.ticks) {
      const u = k.life / k.max, a = u < 0.7 ? 1 : (1 - u) / 0.3, r = k.r;
      ctx.save();
      ctx.strokeStyle = alpha(k.col, a);
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.arc(k.x, k.y, r, 0, TAU);
      ctx.fillStyle = alpha(k.bg, a);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(k.x - r * 0.42, k.y + r * 0.04);
      ctx.lineTo(k.x - r * 0.1, k.y + r * 0.36);
      ctx.lineTo(k.x + r * 0.45, k.y - r * 0.32);
      ctx.stroke();
      ctx.restore();
    }
    for (const k of this.stamps) {
      // Lands in 0.18 s (from 1.25x, no bounce), rests, fades over the last 0.5 s.
      const land = Math.min(1, k.life / 0.18), e = 1 - (1 - land) * (1 - land);
      const a = 0.92 * (k.life < 0.18 ? e : k.life > k.max - 0.5 ? (k.max - k.life) / 0.5 : 1);
      const sc = 1.25 - 0.25 * e;
      ctx.save();
      ctx.translate(k.x, k.y);
      ctx.rotate(-0.14);
      ctx.scale(sc, sc);
      ctx.font = `700 18px ${k.font}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(k.word).width + 22, h = 34;
      ctx.strokeStyle = alpha(k.col, a);
      ctx.lineWidth = 2.5;
      rr(ctx, -w / 2, -h / 2, w, h, 4); ctx.stroke();
      ctx.lineWidth = 1;
      rr(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 2); ctx.stroke();
      ctx.fillStyle = alpha(k.col, a);
      ctx.fillText(k.word, 0, 1);
      ctx.restore();
    }
  }
}
