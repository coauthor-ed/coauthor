/**
 * SimCivic - drawn civic and economy things (subject-free): buildings, objects and workplaces at scene size.
 * One spec per thing, two renderers (canvas and SVG/DOM), the same look. Flat Quill look: flat fills, a darker
 * rim, no gloss, no glow, no faces. No flags, emblems, party symbols, logos or banknotes: money is only ever a
 * number tag the scene adds (chip / pill), never drawn here. Promoted from the democracy course's CivicArt.js
 * (same export names, so a course can switch its import), plus economy kinds.
 *
 * Kinds (w x h design units; the ground is the bottom edge). CIVIC_KINDS lists them.
 *   civic:   booth  ballotBox  voteMachine  parliament  court  office  school  tree  square
 *            book  bookOpen  newspaper  phone  mike
 *   economy: shop (shop front, striped awning, goods on shelves, counter, door)
 *            stall (market cart: canopy on poles, heaps of produce, two wheels)
 *            workshop (small tailoring shop: shelf of cloth bolts, table with cloth, one sewing machine)
 *            factory (saw-tooth sheds, windows, roller door, chimney with smoke)
 *            sewingLine (one long table, 3 power sewing machines, motors and a power cable under it:
 *              the machine-heavy method)
 *            tailor (a single hand station: table top with cloth, needle and thread, scissors, tape, spool:
 *              the labour-heavy method)
 *            bank (stone block, barred windows, a round vault door)
 *            truck (goods truck, side view, facing right)
 *            report (a paper with a bar chart)
 *            planOffice (government building with a big plan sheet / chart board on its front)
 *            library (a bookcase: three shelves of books)
 *            shoe (one shoe, side view)   uniform (a folded school shirt)
 *   SimIcons has 48-unit icons for shop, truck, factory, book, school, newspaper, phone: use those for chips
 *   and lists; use these where the thing is the picture.
 *
 * Canvas:  drawCivic(ctx, c, 'court', x, y, { w, h, alpha, dim })   c = the scene's resolved colours
 *   (x, y) is the ground centre. Give w OR h; default is the kind's own size.
 *   Returns { x, y, w, h } of the drawn box, for hit tests and leader lines.
 * SVG:     civicSvg('court', x, y, { w, h, dim, cls })   a <g> string for an SvgScene stage, same anchor.
 * DOM:     civicHtml('court', { size, label, dim })      a self-sized <svg class="cv-art"> string; size is
 *   its width in px; label makes it role="img". Add CIVIC_CSS once.
 * Parts:   shapes carry a part name (CIVIC_PARTS[kind]). dim: a function part => true dims that part to 0.25,
 *   so a TapLight can light one part: dim: (p) => tl.off(p). In SVG each part is <g data-part="x">.
 * Size:    civicSize(kind) -> { w, h }.
 * Extras:  dayStage(ctx, c, { horizon, ground })  a daylight ground for a canvas scene;
 *          speech(ctx, c, text, x, y, tx, ty, o)   a chip with a tail to (tx, ty).
 *
 * Phone: at 390 the stage is about 0.68 of design width, so draw a kind at least 90 design px wide (60 px on
 * screen) and put its name in a chip under it (14+ px). Labels are the scene's, never drawn here.
 * Colours: tokens only (gold, water, waste, stroke, label, bg-surface, bg-deep, accent, series 1..8), mixed
 * the same way in both renderers (color-mix in srgb / SimLook mix). A paint is a key or [a, b, t] (t of the way
 * from a to b); a and b may themselves be paints. ASCII only.
 */
import { mix, alpha, pill } from './SimLook.js';

const VAR = {
  gold: '--sim-gold', water: '--sim-water', waste: '--sim-waste', stroke: '--sim-stroke', label: '--sim-label',
  bgSurface: '--sim-bg-surface', bgDeep: '--sim-bg-deep', accent: '--sim-accent',
  s1: '--sim-series-1', s2: '--sim-series-2', s3: '--sim-series-3', s4: '--sim-series-4',
  s5: '--sim-series-5', s6: '--sim-series-6', s7: '--sim-series-7', s8: '--sim-series-8',
};

// Daylight materials. Warm lime-wash and stone; no flag colours and no party colours.
const INK = ['label', 's8', 0.15];
const WASH = ['gold', 'bgSurface', 0.74];
const WASH2 = ['gold', 'bgSurface', 0.56];
const WASH3 = ['gold', 'bgSurface', 0.38];
const STONE = ['waste', 'bgSurface', 0.58];
const STONE2 = ['waste', 'bgSurface', 0.36];
const STONE3 = ['waste', 'bgSurface', 0.8];
const RIM = ['waste', 'label', 0.5];
const WOOD = ['s8', 'label', 0.46];
const WOOD2 = ['s8', 'label', 0.22];
const LEAF = ['s3', 's8', 0.22];
const LEAF2 = ['s3', 'label', 0.3];
const LEAF3 = ['s3', 'bgSurface', 0.3];
const SKYGLASS = ['s1', 'label', 0.28];
const PAPER = ['bgSurface', 'gold', 0.1];
const COVER = ['s5', 'label', 0.42];
const COVER2 = ['s5', 'label', 0.2];
const SHADOW = ['label', 'bgSurface', 0.55];
// Economy materials.
const ROOM = ['label', 'bgSurface', 0.74];
const AWN_A = ['s6', 'bgSurface', 0.18];
const AWN_B = ['bgSurface', 'gold', 0.08];
const CANOPY = ['s1', 'bgSurface', 0.2];
const MACH = [['s7', 'waste', 0.5], 'bgSurface', 0.12];
const MACH_BED = ['waste', 'bgSurface', 0.3];
const METAL = ['waste', 'bgSurface', 0.55];
const METAL_DK = 'waste';
const THREAD = ['s6', 'bgSurface', 0.15];
const CLOTH = [['s5', 'bgSurface', 0.3], ['s1', 'bgSurface', 0.3], ['s4', 'bgSurface', 0.3], ['s3', 'bgSurface', 0.35]];
const CLOTH_DK = ['s5', 'label', 0.15];
const BRICK = [[['s6', 's8', 0.5], 'waste', 0.3], 'bgSurface', 0.2];
const BRICK2 = [[['s6', 's8', 0.5], 'waste', 0.45], 'bgSurface', 0.35];
const SMOKE = ['waste', 'bgSurface', 0.62];
const TYRE = ['waste', 's5', 0.08];
const CARGO = ['s8', 'bgSurface', 0.28];
const CAB = ['s1', 'bgSurface', 0.3];
const BAR = ['s1', 'bgSurface', 0.15];
const PLAN = ['s3', 'label', 0.2];
const BACK = ['s8', 'label', 0.66];
const LEATHER = [['s8', 'waste', 0.55], 'label', 0.2];
const LEATHER2 = [['s8', 'waste', 0.4], 'bgSurface', 0.15];
const SOLE = ['waste', 's8', 0.12];
const SHIRT = ['s1', 'bgSurface', 0.72];
const SHIRT2 = ['s1', 'bgSurface', 0.6];
const TAPE = ['gold', 'bgSurface', 0.1];
const GOODS = [1, 2, 3, 5, 6, 8].map((n) => [`s${n}`, 'bgSurface', 0.22]);

const rect = (x, y, w, h, r, paint, o = {}) => ({ t: 'r', x, y, w, h, r, paint, ...o });
const path = (d, paint, o = {}) => ({ t: 'p', d, paint, ...o });
const line = (d, paint, lw = 3, o = {}) => ({ t: 'p', d, stroke: paint, lw, ...o });
const circ = (x, y, r, paint, o = {}) => ({ t: 'c', x, y, r, paint, ...o });
const oval = (x, y, rx, ry, paint, o = {}) => ({ t: 'e', x, y, rx, ry, paint, ...o });

const shade = (W, H, a = 0.2) => oval(W / 2, H - 2, W * 0.5, 7, SHADOW, { a, part: 'ground' });

const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));

// A striped awning: a trapezoid from (x0..x1, top) to (x0 - flare .. x1 + flare, bot), n stripes, scallops below.
function awning(x0, x1, top, bot, flare, n, a, b, part) {
  const out = [path(`M${x0} ${top} L${x1} ${top} L${x1 + flare} ${bot} L${x0 - flare} ${bot} Z`, b, { rim: RIM, part })];
  const tw = (x1 - x0) / n, bw = (x1 - x0 + 2 * flare) / n;
  for (let i = 0; i < n; i += 2) {
    const ta = x0 + i * tw, bb = x0 - flare + i * bw;
    out.push(path(`M${ta} ${top} L${ta + tw} ${top} L${bb + bw} ${bot} L${bb} ${bot} Z`, a, { part }));
  }
  for (let i = 0; i < n; i++) {
    const xa = x0 - flare + i * bw, r = bw / 2;
    out.push(path(`M${xa} ${bot} A${r} ${r} 0 0 0 ${xa + bw} ${bot} Z`, i % 2 ? b : a, { rim: RIM, rw: 1.6, part }));
  }
  out.push(path(`M${x0} ${top} L${x1} ${top} L${x1 + flare} ${bot} L${x0 - flare} ${bot} Z`, null, { rim: RIM, part }));
  return out;
}

// A power sewing machine standing on a table top; (x, y) the bed's bottom-left, k the scale (80 x 66 at k = 1).
function sewing(x, y, k, part) {
  const X = (u) => x + u * k, Y = (v) => y - v * k, S = (u) => u * k;
  return [
    rect(X(0), Y(10), S(80), S(10), S(3), MACH_BED, { rim: RIM, part }),
    rect(X(56), Y(52), S(18), S(44), S(5), MACH, { rim: RIM, part }),
    rect(X(6), Y(58), S(68), S(16), S(7), MACH, { rim: RIM, part }),
    rect(X(6), Y(58), S(20), S(34), S(5), MACH, { rim: RIM, part }),
    rect(X(30), Y(54), S(22), S(4), S(2), ['gold', 'bgSurface', 0.2], { part }),
    line(`M${X(16)} ${Y(24)}V${Y(10)}`, METAL_DK, Math.max(1.5, S(2.4)), { part }),
    circ(X(76), Y(38), S(8), METAL, { rim: RIM, part }),
    rect(X(36), Y(66), S(9), S(9), S(2), THREAD, { rim: RIM, rw: 1.4, part }),
  ];
}

// A cart or truck wheel: tyre, hub, spokes.
function wheel(x, y, r, part, spokes = 4) {
  const out = [circ(x, y, r, TYRE, { rim: RIM, part }), circ(x, y, r * 0.62, STONE3, { rim: RIM, rw: 1.6, part })];
  let d = '';
  for (let i = 0; i < spokes; i++) {
    const a = (i * Math.PI) / spokes, dx = Math.cos(a) * r * 0.6, dy = Math.sin(a) * r * 0.6;
    d += `M${(x - dx).toFixed(1)} ${(y - dy).toFixed(1)}L${(x + dx).toFixed(1)} ${(y + dy).toFixed(1)}`;
  }
  out.push(line(d, RIM, 2.2, { part }), circ(x, y, r * 0.18, RIM, { part }));
  return out;
}

const ART = {
  // A polling compartment: a folded screen on a table, the machine hidden behind it.
  booth: { w: 200, h: 200, shapes: () => [
    shade(200, 200),
    rect(16, 110, 168, 14, 4, WOOD, { rim: RIM, part: 'table' }),
    rect(28, 124, 12, 74, 3, WOOD2, { rim: RIM, part: 'table' }),
    rect(160, 124, 12, 74, 3, WOOD2, { rim: RIM, part: 'table' }),
    path('M34 12 L62 26 L62 112 L34 112 Z', STONE3, { rim: RIM, part: 'screen' }),
    path('M166 12 L138 26 L138 112 L166 112 Z', STONE3, { rim: RIM, part: 'screen' }),
    path('M62 26 L138 26 L138 112 L62 112 Z', PAPER, { rim: RIM, part: 'screen' }),
    path('M62 26 L138 26 L138 42 L62 42 Z', STONE, { part: 'screen' }),
    rect(78, 66, 44, 44, 4, ['s1', 'label', 0.5], { rim: RIM, part: 'machine' }),
    rect(84, 72, 32, 8, 2, ['s1', 'bgSurface', 0.5], { part: 'machine' }),
    ...range(3, (i) => rect(84, 84 + i * 7, 32, 4, 2, ['s1', 'bgSurface', 0.2], { part: 'machine' })),
  ] },

  // A metal box with a slot; the slip stands half in.
  ballotBox: { w: 170, h: 170, shapes: () => [
    shade(170, 170),
    rect(68, 8, 34, 52, 3, PAPER, { rim: RIM, part: 'slip' }),
    line('M76 20H94M76 30H94M76 40H88', STONE2, 3, { part: 'slip' }),
    path('M16 66 L34 46 L136 46 L154 66 Z', STONE2, { rim: RIM, part: 'box' }),
    rect(58, 52, 54, 7, 3, INK, { part: 'box' }),
    rect(16, 66, 138, 98, 8, STONE, { rim: RIM, part: 'box' }),
    rect(16, 66, 138, 16, 6, STONE3, { a: 0.55, part: 'box' }),
    rect(112, 66, 42, 98, 6, STONE2, { a: 0.55, part: 'box' }),
    rect(70, 96, 30, 26, 4, WASH2, { rim: RIM, part: 'box' }),
    circ(85, 109, 6, INK, { part: 'box' }),
  ] },

  // The balloting unit: a tall panel with rows of blue buttons, a lamp at each row. No names on it.
  voteMachine: { w: 150, h: 230, shapes: () => [
    shade(150, 230),
    rect(12, 6, 126, 220, 12, ['bgSurface', 'waste', 0.2], { rim: RIM, part: 'body' }),
    rect(12, 6, 26, 220, 10, ['bgSurface', 'label', 0.08], { a: 0.8, part: 'body' }),
    rect(28, 18, 94, 10, 4, STONE2, { part: 'body' }),
    ...range(4, (i) => rect(26, 42 + i * 44, 98, 36, 6, PAPER, { rim: STONE, part: `row${i + 1}` })),
    ...range(4, (i) => circ(112, 60 + i * 44, 9, ['s1', 'label', 0.3], { rim: ['s1', 'label', 0.6], part: `row${i + 1}` })),
    ...range(4, (i) => circ(92, 60 + i * 44, 4, ['s6', 'bgSurface', 0.2], { part: `row${i + 1}` })),
  ] },

  // A round chamber behind a ring of columns, a low dome over it. No flag.
  parliament: { w: 360, h: 190, shapes: () => [
    shade(360, 190),
    rect(6, 172, 348, 14, 4, STONE2, { rim: RIM, part: 'base' }),
    rect(22, 160, 316, 14, 3, STONE, { rim: RIM, part: 'base' }),
    path('M118 58 C138 18 222 18 242 58 Z', STONE, { rim: RIM, part: 'dome' }),
    path('M126 58 C144 26 186 24 200 24 C178 30 156 40 148 58 Z', STONE3, { a: 0.7, part: 'dome' }),
    rect(42, 56, 276, 20, 5, WASH, { rim: RIM, part: 'drum' }),
    rect(52, 76, 256, 86, 2, WASH3, { rim: RIM, part: 'drum' }),
    rect(52, 76, 256, 86, 2, ['label', 'bgSurface', 0.62], { a: 0.2, part: 'drum' }),
    ...range(15, (i) => {
      const u = (i - 7) / 7, x = 180 + Math.sin(u * 1.26) * 134, w = 7 + 7 * Math.cos(u * 1.26);
      return rect(x - w / 2, 76, w, 86, 2, WASH, { rim: RIM, rw: 1.2, part: 'columns' });
    }),
    rect(42, 66, 276, 4, 2, RIM, { a: 0.3, part: 'drum' }),
  ] },

  // Court: wide steps, four columns, a plain pediment. The scales are for a scene to add if it needs them.
  court: { w: 300, h: 230, shapes: () => [
    shade(300, 230),
    ...range(3, (i) => rect(26 - i * 11, 188 + i * 13, 248 + i * 22, 14, 3, i === 1 ? STONE3 : STONE, { rim: RIM, part: 'steps' })),
    path('M28 66 L150 8 L272 66 Z', WASH, { rim: RIM, part: 'roof' }),
    path('M64 60 L150 20 L236 60 Z', WASH2, { part: 'roof' }),
    rect(26, 66, 248, 16, 3, WASH, { rim: RIM, part: 'roof' }),
    rect(46, 82, 208, 106, 2, WASH3, { part: 'hall' }),
    rect(126, 112, 48, 76, 4, WOOD, { rim: RIM, part: 'hall' }),
    line('M150 112V188', RIM, 2.5, { part: 'hall' }),
    ...[52, 96, 186, 230].map((x) => rect(x, 82, 18, 106, 3, STONE3, { rim: RIM, part: 'columns' })),
    ...[52, 96, 186, 230].map((x) => rect(x + 12, 84, 6, 104, 2, STONE, { a: 0.7, part: 'columns' })),
  ] },

  // The executive's office block: rows of windows, a porch.
  office: { w: 280, h: 220, shapes: () => [
    shade(280, 220),
    rect(20, 16, 240, 200, 6, WASH2, { rim: RIM, part: 'block' }),
    rect(20, 16, 240, 16, 5, WASH, { rim: RIM, part: 'block' }),
    ...range(3, (r) => range(6, (c) => rect(38 + c * 36, 44 + r * 44, 24, 30, 3, SKYGLASS, { rim: RIM, rw: 1.5, part: 'windows' }))).flat(),
    rect(100, 170, 80, 46, 3, WOOD, { rim: RIM, part: 'porch' }),
    rect(88, 156, 104, 14, 4, WASH, { rim: RIM, part: 'porch' }),
    rect(94, 170, 8, 46, 2, STONE3, { rim: RIM, rw: 1.2, part: 'porch' }),
    rect(178, 170, 8, 46, 2, STONE3, { rim: RIM, rw: 1.2, part: 'porch' }),
  ] },

  // A government school: a long low block, a veranda, a bell, a ground in front.
  school: { w: 320, h: 180, shapes: () => [
    shade(320, 180),
    path('M10 62 L40 28 L280 28 L310 62 Z', ['s6', 's8', 0.45], { rim: RIM, part: 'roof' }),
    rect(22, 62, 276, 112, 3, WASH2, { rim: RIM, part: 'wall' }),
    rect(22, 150, 276, 24, 2, STONE, { rim: RIM, part: 'wall' }),
    ...[44, 106, 214, 256].map((x) => rect(x, 84, 40, 40, 3, SKYGLASS, { rim: RIM, part: 'windows' })),
    ...[44, 106, 214, 256].map((x) => line(`M${x + 20} 84V124M${x} 104H${x + 40}`, RIM, 2, { part: 'windows' })),
    rect(162, 86, 40, 88, 4, WOOD, { rim: RIM, part: 'door' }),
    rect(165, 14, 34, 14, 3, STONE, { rim: RIM, part: 'bell' }),
    circ(182, 8, 7, ['gold', 'label', 0.3], { rim: RIM, part: 'bell' }),
  ] },

  // A wide shade tree.
  tree: { w: 260, h: 240, shapes: () => [
    shade(260, 240),
    path('M116 236 C120 190 112 158 96 130 L126 136 L130 104 L146 138 L170 126 C150 160 146 196 150 236 Z', WOOD, { rim: RIM, part: 'trunk' }),
    line('M72 118V176M196 112V160', WOOD2, 3.5, { part: 'trunk' }),
    circ(62, 92, 52, LEAF2, { rim: LEAF2, part: 'crown' }),
    circ(196, 90, 56, LEAF2, { rim: LEAF2, part: 'crown' }),
    circ(128, 64, 64, LEAF, { rim: LEAF2, part: 'crown' }),
    circ(84, 72, 40, LEAF, { part: 'crown' }),
    circ(176, 68, 44, LEAF, { part: 'crown' }),
    circ(104, 44, 26, LEAF3, { a: 0.75, part: 'crown' }),
    circ(62, 72, 18, LEAF3, { a: 0.6, part: 'crown' }),
    circ(170, 48, 20, LEAF3, { a: 0.6, part: 'crown' }),
  ] },

  // The village square: a raised round platform under the tree. People go on it, drawn by the scene.
  square: { w: 340, h: 250, shapes: () => [
    shade(340, 250),
    path('M152 214 C156 180 148 150 132 124 L160 132 L164 100 L180 134 L204 120 C186 154 182 186 186 214 Z', WOOD, { rim: RIM, part: 'trunk' }),
    circ(96, 90, 56, LEAF2, { rim: LEAF2, part: 'crown' }),
    circ(240, 88, 60, LEAF2, { rim: LEAF2, part: 'crown' }),
    circ(168, 62, 68, LEAF, { rim: LEAF2, part: 'crown' }),
    circ(120, 72, 44, LEAF, { part: 'crown' }),
    circ(222, 66, 46, LEAF, { part: 'crown' }),
    circ(142, 42, 28, LEAF3, { a: 0.75, part: 'crown' }),
    circ(212, 46, 20, LEAF3, { a: 0.6, part: 'crown' }),
    oval(170, 234, 164, 13, STONE2, { part: 'platform' }),
    rect(6, 214, 328, 22, 11, STONE, { rim: RIM, part: 'platform' }),
    oval(170, 214, 164, 12, STONE3, { rim: RIM, part: 'platform' }),
  ] },

  // A thick bound book, plain cover, a gold rule. No emblem, no words: a scene adds a label.
  book: { w: 190, h: 240, shapes: () => [
    shade(190, 240),
    rect(30, 14, 148, 218, 6, PAPER, { rim: RIM, part: 'pages' }),
    line('M172 24V222M166 24V222', STONE, 1.6, { part: 'pages' }),
    rect(12, 8, 152, 224, 10, COVER, { rim: ['label', 's5', 0.2], part: 'cover' }),
    rect(12, 8, 22, 224, 8, COVER2, { part: 'cover' }),
    rect(46, 28, 102, 184, 6, ['gold', 's5', 0.1], { a: 0, rim: ['gold', 'bgSurface', 0.1], rw: 3, part: 'cover' }),
    rect(54, 36, 86, 168, 4, ['gold', 's5', 0.1], { a: 0, rim: ['gold', 'bgSurface', 0.1], rw: 1.5, part: 'cover' }),
  ] },

  // The same book lying open: two ruled pages. A slip or a label is the scene's.
  bookOpen: { w: 300, h: 190, shapes: () => [
    shade(300, 190),
    path('M8 34 C60 18 118 20 150 42 C182 20 240 18 292 34 L292 178 C240 164 182 164 150 186 C118 164 60 164 8 178 Z', COVER, { rim: ['label', 's5', 0.2], part: 'cover' }),
    path('M18 24 C66 10 122 12 150 34 L150 172 C122 152 66 150 18 164 Z', PAPER, { rim: RIM, part: 'left' }),
    path('M282 24 C234 10 178 12 150 34 L150 172 C178 152 234 150 282 164 Z', PAPER, { rim: RIM, part: 'right' }),
    line('M36 46C70 38 110 40 134 54M36 70C70 62 110 64 134 78M36 94C70 86 110 88 134 102M36 118C70 110 110 112 134 126', STONE, 3, { part: 'left' }),
    line('M264 46C230 38 190 40 166 54M264 70C230 62 190 64 166 78M264 94C230 86 190 88 166 102M264 118C230 110 190 112 166 126', STONE, 3, { part: 'right' }),
  ] },

  newspaper: { w: 170, h: 200, shapes: () => [
    shade(170, 200),
    rect(14, 10, 142, 186, 4, PAPER, { rim: RIM, part: 'sheet' }),
    rect(26, 22, 118, 20, 3, INK, { part: 'sheet' }),
    rect(26, 52, 62, 46, 3, STONE, { part: 'photo' }),
    line('M98 56H144M98 68H144M98 80H144M98 92H130', STONE2, 3, { part: 'sheet' }),
    line('M26 112H144M26 124H144M26 136H144M26 148H144M26 160H118M26 172H134', STONE2, 3, { part: 'sheet' }),
  ] },

  phone: { w: 110, h: 200, shapes: () => [
    rect(6, 4, 98, 192, 14, ['label', 'waste', 0.2], { rim: RIM, part: 'body' }),
    rect(13, 16, 84, 166, 6, ['s1', 'bgSurface', 0.82], { part: 'screen' }),
    rect(44, 8, 22, 4, 2, STONE, { part: 'body' }),
  ] },

  mike: { w: 90, h: 200, shapes: () => [
    shade(90, 200),
    rect(16, 186, 58, 10, 5, ['waste', 'label', 0.5], { rim: RIM, part: 'stand' }),
    rect(41, 54, 8, 134, 3, ['waste', 'label', 0.3], { rim: RIM, rw: 1.2, part: 'stand' }),
    rect(29, 6, 32, 56, 15, ['waste', 'label', 0.5], { rim: RIM, part: 'head' }),
    line('M33 20H57M33 30H57M33 40H57', STONE, 2, { part: 'head' }),
  ] },

  // ---------- economy ----------

  // A shop front: sign board, striped awning, goods on two shelves, a counter, a door.
  shop: { w: 240, h: 210, shapes: () => [
    shade(240, 210),
    rect(20, 60, 200, 138, 3, WASH2, { rim: RIM, part: 'wall' }),
    rect(32, 6, 176, 30, 6, PAPER, { rim: RIM, part: 'sign' }),
    rect(46, 15, 148, 12, 5, ['s6', 'bgSurface', 0.45], { part: 'sign' }),
    line('M60 36V44M180 36V44', RIM, 3, { part: 'sign' }),
    rect(30, 96, 128, 70, 3, ROOM, { rim: RIM, part: 'goods' }),
    ...[[36, 12, 16, 0], [52, 16, 22, 1], [72, 12, 14, 2], [88, 18, 18, 3], [110, 12, 20, 4], [128, 16, 14, 5], [146, 10, 16, 0]]
      .map(([x, w, h, k]) => rect(x, 120 - h, w, h, 2, GOODS[k], { rim: RIM, rw: 1.2, part: 'goods' })),
    ...[[38, 16, 18, 2], [58, 12, 12, 4], [74, 20, 16, 1], [100, 14, 20, 5], [118, 18, 12, 3], [140, 14, 16, 0]]
      .map(([x, w, h, k]) => rect(x, 146 - h, w, h, 2, GOODS[k], { rim: RIM, rw: 1.2, part: 'goods' })),
    line('M30 121H158M30 147H158', WOOD, 4, { part: 'goods' }),
    rect(22, 154, 144, 9, 3, WOOD2, { rim: RIM, part: 'counter' }),
    rect(26, 162, 136, 34, 3, WOOD, { rim: RIM, part: 'counter' }),
    rect(172, 96, 40, 100, 4, WOOD, { rim: RIM, part: 'door' }),
    circ(181, 150, 3.5, PAPER, { part: 'door' }),
    ...awning(16, 224, 44, 76, 10, 8, AWN_A, AWN_B, 'awning'),
    rect(8, 194, 224, 12, 3, STONE, { rim: RIM, part: 'base' }),
  ] },

  // A market cart: striped canopy on two poles, heaps of produce on the bed, two wheels, a handle.
  stall: { w: 230, h: 200, shapes: () => [
    shade(230, 200),
    rect(30, 50, 7, 72, 3, WOOD2, { rim: RIM, part: 'canopy' }),
    rect(193, 50, 7, 72, 3, WOOD2, { rim: RIM, part: 'canopy' }),
    ...awning(22, 208, 18, 50, 10, 8, CANOPY, AWN_B, 'canopy'),
    ...[[34, 108, 11], [54, 106, 12], [74, 108, 11], [44, 94, 10], [64, 93, 10]].map(([x, y, r]) => circ(x, y, r, GOODS[4], { rim: RIM, rw: 1.4, part: 'goods' })),
    ...[[100, 106, 14, 10], [124, 106, 14, 10], [112, 94, 13, 9]].map(([x, y, rx, ry]) => oval(x, y, rx, ry, ['s3', 'label', 0.15], { rim: RIM, rw: 1.4, part: 'goods' })),
    ...[[152, 108, 10], [172, 108, 10], [190, 108, 9], [162, 95, 9], [181, 95, 9]].map(([x, y, r]) => circ(x, y, r, GOODS[1], { rim: RIM, rw: 1.4, part: 'goods' })),
    rect(14, 116, 202, 28, 4, WOOD, { rim: RIM, part: 'cart' }),
    line('M20 130H210', WOOD2, 2.5, { part: 'cart' }),
    line('M214 124L228 108', WOOD, 6, { part: 'cart' }),
    ...wheel(62, 166, 28, 'wheels'),
    ...wheel(168, 166, 28, 'wheels'),
  ] },

  // A small tailoring shop: a shelf of cloth bolts, a pattern sheet, a table with cloth, one sewing machine.
  workshop: { w: 280, h: 210, shapes: () => [
    shade(280, 210),
    rect(12, 12, 256, 184, 4, WASH3, { rim: RIM, part: 'room' }),
    rect(12, 176, 256, 20, 3, STONE, { rim: RIM, part: 'room' }),
    rect(184, 24, 66, 42, 3, PAPER, { rim: RIM, part: 'room' }),
    line('M192 36H240M192 46H232M192 56H222', STONE2, 2.5, { part: 'room' }),
    ...[[30, 26], [58, 20], [82, 28], [108, 18]].map(([x, h], i) => rect(x, 48 - h, 24, h, 5, CLOTH[i], { rim: RIM, part: 'cloth' })),
    rect(24, 48, 116, 8, 3, WOOD, { rim: RIM, part: 'shelf' }),
    rect(24, 120, 232, 12, 3, WOOD, { rim: RIM, part: 'table' }),
    rect(36, 132, 10, 46, 3, WOOD2, { rim: RIM, part: 'table' }),
    rect(234, 132, 10, 46, 3, WOOD2, { rim: RIM, part: 'table' }),
    rect(34, 110, 90, 10, 3, CLOTH[0], { rim: RIM, part: 'cloth' }),
    path('M40 122 L120 122 L114 162 L46 156 Z', CLOTH[0], { rim: RIM, part: 'cloth' }),
    line('M60 126 L58 152M84 126 L84 158M104 126 L102 160', CLOTH_DK, 1.6, { a: 0.5, part: 'cloth' }),
    ...sewing(146, 120, 1.15, 'machine'),
  ] },

  // A factory: saw-tooth sheds, a row of windows, a roller door, a side shed and a chimney with smoke.
  factory: { w: 320, h: 220, shapes: () => [
    shade(320, 220),
    circ(286, 24, 13, SMOKE, { a: 0.75, part: 'smoke' }),
    circ(302, 12, 10, SMOKE, { a: 0.6, part: 'smoke' }),
    circ(274, 38, 10, SMOKE, { a: 0.85, part: 'smoke' }),
    rect(262, 40, 26, 130, 3, BRICK2, { rim: RIM, part: 'chimney' }),
    rect(262, 52, 26, 7, 2, STONE3, { part: 'chimney' }),
    path('M14 98 V58 L76 98 V58 L138 98 V58 L200 98 V58 L254 98 Z', STONE, { rim: RIM, part: 'sheds' }),
    ...[14, 76, 138, 200].map((x) => path(`M${x} 58 L${x + 10} 64.5 L${x + 10} 98 L${x} 98 Z`, SKYGLASS, { part: 'sheds' })),
    rect(14, 96, 240, 104, 3, BRICK, { rim: RIM, part: 'sheds' }),
    ...[30, 72, 114, 156].map((x) => rect(x, 116, 28, 32, 3, SKYGLASS, { rim: RIM, part: 'windows' })),
    rect(200, 132, 44, 68, 3, METAL, { rim: RIM, part: 'door' }),
    line('M200 146H244M200 160H244M200 174H244M200 188H244', RIM, 1.6, { part: 'door' }),
    rect(254, 128, 56, 72, 3, BRICK2, { rim: RIM, part: 'sheds' }),
    rect(250, 122, 64, 10, 3, STONE2, { rim: RIM, part: 'sheds' }),
    rect(270, 150, 24, 22, 3, SKYGLASS, { rim: RIM, part: 'windows' }),
    rect(6, 198, 308, 12, 3, STONE2, { rim: RIM, part: 'base' }),
  ] },

  // The machine-heavy method: one long table, four power sewing machines in a row, motors and a cable under it.
  sewingLine: { w: 300, h: 180, shapes: () => [
    shade(300, 180),
    line('M10 156 H290', ['s2', 'waste', 0.35], 4, { part: 'power' }),
    ...range(3, (i) => rect(64 + i * 92, 120, 28, 22, 4, METAL_DK, { rim: RIM, part: 'motors' })),
    ...range(3, (i) => line(`M${78 + i * 92} 142 V156`, ['s2', 'waste', 0.35], 3, { part: 'power' })),
    rect(6, 100, 288, 14, 3, WOOD, { rim: RIM, part: 'table' }),
    ...[16, 274].map((x) => rect(x, 114, 10, 60, 3, WOOD2, { rim: RIM, part: 'table' })),
    ...range(3, (i) => rect(2 + i * 92, 90, 20, 10, 2, CLOTH[i], { rim: RIM, rw: 1.2, part: 'cloth' })),
    ...range(3, (i) => sewing(20 + i * 92, 100, 0.98, 'machines')).flat(),
  ] },

  // The labour-heavy method: a single hand station. Table top seen from above: cloth, needle and thread,
  // scissors, a spool, and a tape hanging over the edge.
  tailor: { w: 220, h: 190, shapes: () => [
    shade(220, 190),
    rect(24, 114, 10, 70, 3, WOOD2, { rim: RIM, part: 'table' }),
    rect(186, 114, 10, 70, 3, WOOD2, { rim: RIM, part: 'table' }),
    path('M30 52 L190 52 L210 104 L10 104 Z', WOOD, { rim: RIM, part: 'table' }),
    rect(10, 104, 200, 12, 3, WOOD2, { rim: RIM, part: 'table' }),
    path('M36 60 L116 60 L124 98 L24 98 Z', CLOTH[0], { rim: RIM, part: 'cloth' }),
    line('M46 70 H110', PAPER, 2, { a: 0.7, part: 'cloth' }),
    line('M50 88 L80 78', METAL_DK, 2.8, { part: 'needle' }),
    line('M80 78 C92 72 98 86 110 82', THREAD, 2.2, { part: 'needle' }),
    rect(180, 26, 18, 24, 3, THREAD, { rim: RIM, part: 'spool' }),
    rect(177, 22, 24, 6, 2, WOOD, { rim: RIM, rw: 1.2, part: 'spool' }),
    rect(177, 48, 24, 6, 2, WOOD, { rim: RIM, rw: 1.2, part: 'spool' }),
    path('M150 80 L206 56 L210 63 L156 89 Z', METAL, { rim: RIM, rw: 2, part: 'scissors' }),
    path('M154 94 L210 84 L210 92 L156 101 Z', METAL, { rim: RIM, rw: 2, part: 'scissors' }),
    circ(152, 87, 4, RIM, { part: 'scissors' }),
    circ(138, 80, 11, null, { rim: ['s6', 'label', 0.2], rw: 5, part: 'scissors' }),
    circ(140, 102, 11, null, { rim: ['s6', 'label', 0.2], rw: 5, part: 'scissors' }),
    line('M128 98 C124 118 140 128 134 150', TAPE, 6, { part: 'tape' }),
    line('M126 108 l5 1M128 118 l5 1M133 128 l5 0M135 138 l5 -1', RIM, 1.4, { part: 'tape' }),
  ] },

  // A bank: a stone block, a sign plaque (no words), barred windows, a door and a round vault door.
  bank: { w: 290, h: 220, shapes: () => [
    shade(290, 220),
    rect(40, 22, 210, 20, 3, STONE, { rim: RIM, part: 'block' }),
    rect(72, 26, 146, 12, 4, ['s1', 'label', 0.4], { part: 'sign' }),
    rect(16, 40, 258, 16, 4, STONE, { rim: RIM, part: 'block' }),
    rect(24, 56, 242, 142, 3, STONE3, { rim: RIM, part: 'block' }),
    rect(38, 76, 46, 62, 3, SKYGLASS, { rim: RIM, part: 'windows' }),
    line('M47 76V138M56 76V138M65 76V138M74 76V138', RIM, 2, { part: 'windows' }),
    rect(98, 110, 50, 88, 4, WOOD, { rim: RIM, part: 'door' }),
    line('M123 110V198', RIM, 2, { part: 'door' }),
    circ(206, 120, 44, METAL, { rim: RIM, rw: 3, part: 'vault' }),
    circ(206, 120, 32, STONE3, { rim: RIM, part: 'vault' }),
    ...range(8, (i) => { const a = (i * Math.PI) / 4; return circ(206 + Math.cos(a) * 38, 120 + Math.sin(a) * 38, 3, RIM, { part: 'vault' }); }),
    line('M206 96V144M185 108L227 132M185 132L227 108', RIM, 4, { part: 'vault' }),
    circ(206, 120, 7, ['gold', 'label', 0.3], { rim: RIM, part: 'vault' }),
    rect(10, 196, 270, 14, 3, STONE, { rim: RIM, part: 'base' }),
  ] },

  // A goods truck, side view, facing right.
  truck: { w: 270, h: 160, shapes: () => [
    shade(270, 160),
    rect(10, 116, 238, 12, 3, METAL_DK, { rim: RIM, part: 'chassis' }),
    rect(10, 22, 170, 96, 6, CARGO, { rim: RIM, part: 'cargo' }),
    rect(10, 22, 170, 12, 5, ['s8', 'bgSurface', 0.5], { part: 'cargo' }),
    line('M52 34V112M94 34V112M136 34V112', ['s8', 'label', 0.35], 1.8, { part: 'cargo' }),
    path('M186 48 L230 48 L252 84 L256 118 L186 118 Z', CAB, { rim: RIM, part: 'cab' }),
    path('M196 56 L226 56 L242 84 L196 84 Z', SKYGLASS, { rim: RIM, part: 'cab' }),
    line('M196 92 H222', RIM, 2.2, { part: 'cab' }),
    circ(250, 104, 4.5, PAPER, { rim: RIM, rw: 1.4, part: 'cab' }),
    ...wheel(56, 130, 20, 'wheels', 3),
    ...wheel(212, 130, 20, 'wheels', 3),
  ] },

  // A report: a paper with a title bar, a bar chart and text lines.
  report: { w: 180, h: 220, shapes: () => [
    shade(180, 220),
    path('M16 8 L138 8 L168 38 L168 214 L16 214 Z', PAPER, { rim: RIM, part: 'sheet' }),
    path('M138 8 L138 38 L168 38 Z', STONE3, { rim: RIM, part: 'sheet' }),
    rect(30, 22, 92, 12, 4, INK, { part: 'sheet' }),
    line('M30 50H122M30 62H108', STONE2, 3, { part: 'sheet' }),
    rect(46, 140, 20, 30, 2, BAR, { rim: RIM, rw: 1.4, part: 'chart' }),
    rect(74, 118, 20, 52, 2, BAR, { rim: RIM, rw: 1.4, part: 'chart' }),
    rect(102, 100, 20, 70, 2, BAR, { rim: RIM, rw: 1.4, part: 'chart' }),
    rect(130, 86, 20, 84, 2, BAR, { rim: RIM, rw: 1.4, part: 'chart' }),
    line('M36 80 V170 H156', RIM, 2.5, { part: 'chart' }),
    line('M30 188H154M30 200H118', STONE2, 3, { part: 'sheet' }),
  ] },

  // The planning office: a government building with a big plan sheet on its front (grid and a rising line).
  planOffice: { w: 330, h: 240, shapes: () => [
    shade(330, 240),
    path('M100 56 L165 20 L230 56 Z', WASH, { rim: RIM, part: 'block' }),
    rect(10, 54, 310, 16, 4, WASH, { rim: RIM, part: 'block' }),
    rect(18, 70, 294, 146, 3, WASH2, { rim: RIM, part: 'block' }),
    ...[[30, 88], [66, 88], [30, 144], [66, 144], [236, 88], [272, 88], [236, 144], [272, 144]]
      .map(([x, y]) => rect(x, y, 28, 38, 3, SKYGLASS, { rim: RIM, rw: 1.5, part: 'windows' })),
    rect(106, 80, 118, 96, 5, PAPER, { rim: RIM, rw: 3.5, part: 'plan' }),
    line('M126 88V168M146 88V168M166 88V168M186 88V168M206 88V168M114 104H216M114 120H216M114 136H216M114 152H216', STONE, 1.3, { part: 'plan' }),
    ...[[124, 26], [148, 38], [172, 52], [196, 66]].map(([x, h]) => rect(x, 168 - h, 14, h, 2, ['s3', 'bgSurface', 0.45], { part: 'plan' })),
    line('M116 160 L142 140 L166 146 L190 116 L214 94', PLAN, 4.5, { part: 'plan' }),
    circ(214, 94, 5, PLAN, { part: 'plan' }),
    rect(146, 180, 38, 36, 3, WOOD, { rim: RIM, part: 'door' }),
    rect(4, 216, 322, 12, 3, STONE, { rim: RIM, part: 'base' }),
    rect(110, 210, 110, 8, 3, STONE3, { rim: RIM, part: 'base' }),
  ] },

  // A library: a bookcase with three shelves of books.
  library: { w: 290, h: 210, shapes: () => {
    const out = [shade(290, 210), rect(12, 8, 266, 196, 6, WOOD, { rim: RIM, part: 'case' }), rect(24, 20, 242, 172, 3, BACK, { part: 'case' })];
    [76, 132, 188].forEach((sy, j) => {
      let x = 28, i = 0;
      while (x < 254) {
        const w = 10 + ((i * 7 + j * 3) % 3) * 3, h = 34 + ((i * 5 + j) % 4) * 4, k = (i + j * 2) % GOODS.length;
        if (x + w > 262) break;
        if (i === 6 + j) { out.push(path(`M${x} ${sy} L${x + 12} ${sy} L${x + 30} ${sy - h + 4} L${x + 20} ${sy - h} Z`, GOODS[k], { rim: RIM, rw: 1.2, part: `shelf${j + 1}` })); x += 30; i++; continue; }
        out.push(rect(x, sy - h, w, h, 2, GOODS[k], { rim: RIM, rw: 1.2, part: `shelf${j + 1}` }));
        out.push(rect(x + 2, sy - h + 6, w - 4, 3, 1, PAPER, { a: 0.7, part: `shelf${j + 1}` }));
        x += w + 1.5; i++;
      }
      out.push(rect(20, sy, 250, 8, 2, WOOD2, { rim: RIM, part: 'case' }));
    });
    return out;
  } },

  // A shoe, side view, toe to the right.
  shoe: { w: 210, h: 120, shapes: () => [
    shade(210, 120),
    path('M14 92 C12 106 24 112 40 112 L180 112 C198 112 206 104 204 92 Z', SOLE, { rim: RIM, part: 'sole' }),
    line('M30 102 H188', STONE3, 1.6, { a: 0.7, part: 'sole' }),
    path('M16 94 C14 70 18 46 30 32 L70 30 C78 50 98 58 122 60 C154 62 186 70 200 88 C204 92 204 94 202 94 Z', LEATHER, { rim: RIM, part: 'upper' }),
    path('M150 63 C178 67 198 80 202 94 L164 94 C166 82 162 70 150 63 Z', LEATHER2, { rim: RIM, rw: 1.6, part: 'upper' }),
    path('M30 32 C42 26 60 26 70 30 C62 38 40 40 30 32 Z', ROOM, { part: 'upper' }),
    path('M68 34 C82 50 102 58 124 62 L118 70 C96 66 78 56 66 42 Z', LEATHER2, { rim: RIM, rw: 1.4, part: 'laces' }),
    line('M78 44 L90 56M90 50 L102 60M102 55 L114 63', PAPER, 3, { part: 'laces' }),
  ] },

  // A folded school shirt: collar, placket and buttons, sleeves folded behind, a pocket.
  uniform: { w: 210, h: 180, shapes: () => [
    shade(210, 180),
    rect(28, 28, 154, 144, 8, SHIRT, { rim: RIM, part: 'shirt' }),
    path('M28 58 L68 96 L68 122 L28 90 Z', SHIRT2, { rim: RIM, rw: 1.6, part: 'shirt' }),
    path('M182 58 L142 96 L142 122 L182 90 Z', SHIRT2, { rim: RIM, rw: 1.6, part: 'shirt' }),
    line('M105 46 V170', RIM, 2, { part: 'shirt' }),
    ...[70, 96, 122, 148].map((y) => circ(105, y, 3.6, PAPER, { rim: RIM, rw: 1.2, part: 'shirt' })),
    rect(122, 78, 32, 32, 3, SHIRT2, { rim: RIM, rw: 1.6, part: 'pocket' }),
    rect(84, 18, 42, 14, 6, SHIRT2, { rim: RIM, part: 'collar' }),
    path('M80 24 L105 30 L96 58 Z', PAPER, { rim: RIM, part: 'collar' }),
    path('M130 24 L105 30 L114 58 Z', PAPER, { rim: RIM, part: 'collar' }),
  ] },
};

/** Every kind name, civic first, then economy. */
export const CIVIC_KINDS = Object.keys(ART);

/** Parts by kind, for a scene's dim() or a TapLight's targets. */
export const CIVIC_PARTS = Object.fromEntries(Object.entries(ART).map(([k, a]) => [k, [...new Set(a.shapes().map((s) => s.part).filter((p) => p && p !== 'ground'))]]));

export const civicSize = (kind) => { const a = artOf(kind); return { w: a.w, h: a.h }; };

function artOf(kind) {
  const a = ART[kind];
  if (!a) throw new Error(`SimCivic: no kind "${kind}" (${Object.keys(ART).join(', ')})`);
  return a;
}

const scaleOf = (a, o) => (o.w ? o.w / a.w : o.h ? o.h / a.h : 1);

function resolve(c, p) {
  if (!p) return null;
  if (typeof p === 'string') return c[p];
  return mix(resolve(c, p[0]), resolve(c, p[1]), p[2]);
}
function css(p) {
  if (!p) return null;
  if (typeof p === 'string') return `var(${VAR[p]})`;
  const pct = Math.round((1 - p[2]) * 100);
  return `color-mix(in srgb, ${css(p[0])} ${pct}%, ${css(p[1])})`;
}

function shapesOf(kind) {
  const a = artOf(kind);
  a.cache ??= a.shapes();
  return a.cache;
}

/** Canvas. (x, y): ground centre. */
export function drawCivic(ctx, c, kind, x, y, o = {}) {
  const a = artOf(kind), k = scaleOf(a, o), list = shapesOf(kind), dim = o.dim;
  const box = { x: x - (a.w * k) / 2, y: y - a.h * k, w: a.w * k, h: a.h * k };
  if (typeof Path2D === 'undefined' || !Path2D.prototype?.roundRect) return box;   // a headless harness
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.translate(box.x, box.y);
  ctx.scale(k, k);
  for (const s of list) {
    ctx.save();
    const off = dim && s.part && dim(s.part);
    if (s.a != null) ctx.globalAlpha *= s.a;
    if (off) ctx.globalAlpha *= 0.25;
    const p = shapePath(s);
    if (s.paint) { ctx.fillStyle = resolve(c, s.paint); ctx.fill(p); }
    if (s.rim) { ctx.globalAlpha = (off ? 0.25 : 1) * (o.alpha ?? 1); ctx.strokeStyle = resolve(c, s.rim); ctx.lineWidth = s.rw ?? 2.4; ctx.lineJoin = 'round'; ctx.stroke(p); }
    if (s.stroke) { ctx.strokeStyle = resolve(c, s.stroke); ctx.lineWidth = s.lw ?? 3; ctx.lineCap = 'round'; ctx.stroke(p); }
    ctx.restore();
  }
  ctx.restore();
  return box;
}

function shapePath(s) {
  if (s.t === 'p') return new Path2D(s.d);
  const p = new Path2D();
  if (s.t === 'r') p.roundRect(s.x, s.y, s.w, s.h, s.r ?? 0);
  else if (s.t === 'c') p.arc(s.x, s.y, s.r, 0, Math.PI * 2);
  else p.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
  return p;
}

const f1 = (v) => (Number.isInteger(v) ? v : +v.toFixed(2));

function shapeSvg(s) {
  const st = [];
  st.push(`fill:${s.paint ? css(s.paint) : 'none'}`);
  if (s.a != null) st.push(`fill-opacity:${s.a}`);
  if (s.rim) st.push(`stroke:${css(s.rim)};stroke-width:${s.rw ?? 2.4};stroke-linejoin:round`);
  if (s.stroke) st.push(`stroke:${css(s.stroke)};stroke-width:${s.lw ?? 3};stroke-linecap:round`);
  if (s.stroke && s.a != null) st.push(`stroke-opacity:${s.a}`);
  const style = `style="${st.join(';')}"`;
  if (s.t === 'p') return `<path d="${s.d}" ${style}/>`;
  if (s.t === 'r') return `<rect x="${f1(s.x)}" y="${f1(s.y)}" width="${f1(s.w)}" height="${f1(s.h)}" rx="${f1(s.r ?? 0)}" ${style}/>`;
  if (s.t === 'c') return `<circle cx="${f1(s.x)}" cy="${f1(s.y)}" r="${f1(s.r)}" ${style}/>`;
  return `<ellipse cx="${f1(s.x)}" cy="${f1(s.y)}" rx="${f1(s.rx)}" ry="${f1(s.ry)}" ${style}/>`;
}

function inner(kind, dim) {
  let out = '', cur = null, open = false;
  for (const s of shapesOf(kind)) {
    if (s.part !== cur || !open) {
      if (open) out += '</g>';
      cur = s.part;
      const off = dim && cur && dim(cur);
      out += `<g data-part="${cur ?? ''}"${off ? ' opacity="0.25"' : ''}>`;
      open = true;
    }
    out += shapeSvg(s);
  }
  return out + (open ? '</g>' : '');
}

/** SVG stage. (x, y): ground centre. */
export function civicSvg(kind, x, y, o = {}) {
  const a = artOf(kind), k = scaleOf(a, o);
  return `<g${o.cls ? ` class="${o.cls}"` : ''} data-kind="${kind}" transform="translate(${(x - (a.w * k) / 2).toFixed(1)} ${(y - a.h * k).toFixed(1)}) scale(${k.toFixed(3)})">${inner(kind, o.dim)}</g>`;
}

/** DOM: a self-sized svg. size is the width in px; label makes it role="img". */
export function civicHtml(kind, o = {}) {
  const a = artOf(kind), w = o.size ?? a.w, h = Math.round((w * a.h) / a.w);
  const name = o.label ? `role="img" aria-label="${String(o.label).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  return `<svg class="cv-art" viewBox="0 0 ${a.w} ${a.h}" width="${w}" height="${h}" ${name}>${inner(kind, o.dim)}</svg>`;
}

/**
 * A daylight ground for a canvas scene: sky to the horizon, then ground. Same world in both themes:
 * the dark theme's surface makes it dusk. o: { horizon (default 340), ground: 'earth' | 'grass' | 'stone' }.
 */
export function dayStage(ctx, c, o = {}) {
  const H = o.horizon ?? 340, W = 680, B = 520;
  ctx.fillStyle = mix(c.s1, c.bgSurface, 0.66); ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = mix(c.s1, c.bgSurface, 0.8); ctx.fillRect(0, H * 0.55, W, H * 0.45);
  const g = { earth: mix(c.gold, c.bgSurface, 0.5), grass: mix(c.s3, c.bgSurface, 0.55), stone: mix(c.waste, c.bgSurface, 0.66) }[o.ground ?? 'earth'];
  ctx.fillStyle = g; ctx.fillRect(0, H, W, B - H);
  ctx.fillStyle = mix(g, c.label, 0.1); ctx.fillRect(0, H, W, 5);
}

/** A speech bubble: a chip with a tail to (tx, ty). (x, y) is the chip's centre. o as pill. */
export function speech(ctx, c, text, x, y, tx, ty, o = {}) {
  const bg = o.bg ?? c.bgSurface;
  ctx.beginPath(); ctx.moveTo(x - 16, y); ctx.lineTo(tx, ty); ctx.lineTo(x + 16, y); ctx.closePath();
  ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = c.stroke; ctx.stroke();
  pill(ctx, c, text, x, y, { size: 26, bg, ink: c.label, ...o });
}

export const CIVIC_CSS = '.cv-art { display: block; max-width: 100%; height: auto; }';

export { alpha };
