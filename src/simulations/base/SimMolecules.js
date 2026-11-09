import { SimDraw } from './SimDrawUtils.js';

/**
 * SimMolecules — a small, shared shape vocabulary for the recurring
 * molecules/energy-carriers these scenes show, so identity comes from
 * silhouette first and color/label second (design doc §3.1's "silhouette
 * test"). A letter inside a circle never means "glucose" here —
 * each concept gets a distinct flat icon. This module is that icon set,
 * shared across scenes rather than redrawn per-file.
 *
 * All icons are flat: one fill + one darker two-tone stroke (SimDraw.shade),
 * centered on (0,0) at the call site's translation, sized to roughly fill a
 * circle of radius `r`. See the Quill look
 * spec (packs/look/quill/SPEC.md in the kit).
 */

const KNOWN_KINDS = new Set(['glucose', 'sugar', 'oxygen', 'atp', 'co2', 'water']);

export function hasMoleculeIcon(kind) {
  return KNOWN_KINDS.has(kind);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} r        target radius (icon roughly fills a circle this size)
 * @param {string} kind     'glucose'|'sugar'|'oxygen'|'atp'|'co2'|'water'|anything else
 * @param {string} color    resolved fill color
 * @param {object} [opts]
 * @param {string} [opts.label]       fallback text label for unrecognized kinds
 * @param {string} [opts.strokeColor] override the derived two-tone stroke
 */
export function drawMoleculeIcon(ctx, x, y, r, kind, color, opts = {}) {
  const stroke = opts.strokeColor || SimDraw.shade(color, -0.35);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (kind) {
    case 'glucose':
    case 'sugar':
      drawRingIcon(ctx, r, color, stroke);
      break;
    case 'oxygen':
      drawDiatomicIcon(ctx, r, color, stroke);
      break;
    case 'atp':
      drawBoltIcon(ctx, r, color, stroke);
      break;
    case 'co2':
      drawTriatomicIcon(ctx, r, color, stroke);
      break;
    case 'water':
      drawDropletIcon(ctx, r, color, stroke);
      break;
    default:
      drawFallbackIcon(ctx, r, color, opts.label);
  }
  ctx.restore();
}

// ── Glucose / sugar: the 6-membered ring every student already recognizes
// from the textbook structural formula — a hexagon reads as "sugar" faster
// than a labeled circle ever could. ──────────────────────────────────────
function drawRingIcon(ctx, r, fill, stroke) {
  const pts = hexPoints(r);
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1.2, r * 0.14);
  ctx.stroke();
  // Two-tone facet: one lit edge instead of a gradient
  ctx.beginPath();
  ctx.moveTo(...pts[4]);
  ctx.lineTo(...pts[5]);
  ctx.lineTo(...pts[0]);
  ctx.strokeStyle = SimDraw.withAlpha(SimDraw.shade(fill, 0.4), 0.8);
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.stroke();
}

function hexPoints(r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + i * (Math.PI / 3);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

// ── O2: two touching spheres — the universal diatomic-molecule shorthand,
// no text required. ───────────────────────────────────────────────────────
function drawDiatomicIcon(ctx, r, fill, stroke) {
  const cr = r * 0.6;
  const off = r * 0.42;
  for (const sx of [-off, off]) {
    ctx.beginPath();
    ctx.arc(sx, 0, cr, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(-off * 0.4, -cr * 0.3, cr * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = SimDraw.withAlpha(SimDraw.shade(fill, 0.45), 0.6);
  ctx.fill();
}

// ── ATP: a bolt — the usual shorthand for "energy," and the fastest
// possible read for "this is the payoff." ───────────────────────────────────
function drawBoltIcon(ctx, r, fill, stroke) {
  const pts = [
    [0.28, -1.00], [-0.22, 0.05], [0.10, 0.05],
    [-0.28, 1.00], [0.78, -0.22], [0.18, -0.22],
  ].map(([px, py]) => [px * r, py * r]);
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.stroke();
}

// ── CO2: three spheres in a line — reads as "linear molecule," distinct
// silhouette from O2's pair. ─────────────────────────────────────────────
function drawTriatomicIcon(ctx, r, fill, stroke) {
  const cr = r * 0.46;
  const off = r * 0.62;
  ctx.strokeStyle = SimDraw.withAlpha(stroke, 0.7);
  ctx.lineWidth = Math.max(1.2, r * 0.12);
  ctx.beginPath();
  ctx.moveTo(-off, 0);
  ctx.lineTo(off, 0);
  ctx.stroke();
  for (const sx of [-off, 0, off]) {
    const rad = sx === 0 ? cr * 1.2 : cr;
    ctx.beginPath();
    ctx.arc(sx, 0, rad, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.stroke();
  }
}

// ── Water: a droplet — the universal water icon. ────────────────────────────
function drawDropletIcon(ctx, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.bezierCurveTo(r * 0.75, -r * 0.05, r * 0.85, r * 0.6, 0, r);
  ctx.bezierCurveTo(-r * 0.85, r * 0.6, -r * 0.75, -r * 0.05, 0, -r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-r * 0.22, -r * 0.05, r * 0.16, r * 0.26, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = SimDraw.withAlpha(SimDraw.shade(fill, 0.5), 0.55);
  ctx.fill();
}

/** Plain flat circle + label — used for anything not in the icon vocabulary yet. */
function drawFallbackIcon(ctx, r, fill, label) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (label) {
    ctx.font = `600 ${Math.max(8, r * 0.85)}px Inter, system-ui`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
  }
}
