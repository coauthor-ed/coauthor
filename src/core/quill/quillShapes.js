/**
 * Quill's shapes as plain data, in viewBox units (0 0 240 300, feet on
 * y 276). One table, two painters:
 *   - QuillRig.js builds the SVG markup from it (<quill-mascot>, DOM scenes);
 *   - simulations/base/kit/SimQuill.js builds Path2D objects from it (canvas
 *     scenes, e.g. the arcade's Quill's Catch).
 * Changing a shape here changes both, so the two Quills cannot drift apart.
 *
 * No DOM, no imports: safe under plain node.
 */

export const QUILL_PATHS = {
  body: 'M120 18C172 18 198 64 196 124 194 188 162 252 120 256 78 252 46 188 44 124 42 64 68 18 120 18Z',
  shine: 'M82 38C102 22 142 20 162 34 140 28 104 30 82 42Z',
  wingL: 'M52 150Q18 168 28 222 54 218 68 188Z',
  wingR: 'M188 150Q222 168 212 222 186 218 172 188Z',
  scarf: 'M64 168Q120 200 176 168L184 192Q120 222 56 192Z',
  scarfStripes: 'M74 178v16M96 184v18M120 187v18M144 184v18M166 177v16',
  scarfEdge: 'M64 168Q120 200 176 168',
  scarfTail: 'M168 182l22 10q13 30-8 46-6-18-21-36z',
  browL: 'M104 80 Q100 78 96 80 Q88 82 80 84 Q88 80 96 78 Q102 76 104 80 Z',
  browR: 'M136 80 Q140 78 144 80 Q152 82 160 84 Q152 80 144 78 Q138 76 136 80 Z',
  heart: 'M0 3C0-2 8-2 8 3 8 7 0 13 0 13 0 13-8 7-8 3-8-2 0-2 0 3Z',
  beak: 'M101 130Q120 148 139 130 134 154 120 154 106 154 101 130Z',
  beakLine: 'M109 142Q120 150 131 142',
  beakOpenTop: 'M99 128Q120 119 141 128L120 138Z',
  tuft: 'M110 22q-2-12 6-15-1 9 4 12zM126 21q3-11 12-10-6 6-3 11z',
};

/** Round parts: [cx, cy, rx, ry] for ellipses, [cx, cy, r] for circles. */
export const QUILL_PARTS = {
  shadow: [120, 296, 58, 6],
  legL: [86, 240, 13, 20, 5],          // rect x y w h rx
  legR: [141, 240, 13, 20, 5],
  footL: [92.5, 266, 20, 10],
  footR: [147.5, 266, 20, 10],
  belly: [120, 186, 48, 60],
  bellyShine: [108, 160, 10, 18],
  cheekL: [74, 130, 18],
  cheekR: [166, 130, 18],
  eyeL: [100, 104, 18, 20],
  eyeR: [140, 104, 18, 20],
  irisL: [102, 108, 8],
  irisR: [138, 108, 8],
  glintL: [99, 104, 3],
  glintR: [135, 104, 3],
  mouth: [120, 145, 14, 9],
  tongue: [120, 151, 6],
  heartL: [101, 104, 1.2],             // translate x y, scale
  heartR: [139, 104, 1.2],
};

/** Body-gradient bounds (the body path's y range), for painters that need it. */
export const QUILL_BODY_Y = [18, 256];

/** Brow pose per expression: lift (px, negative = up) and tilt (deg, left
 *  brow; the right brow mirrors it). */
export const QUILL_BROWS = {
  happy: [0, 0],
  surprised: [-3, -12],
  sad: [2, 10],
  angry: [2, 14],
  heart: [-2, -6],
};
