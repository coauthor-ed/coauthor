/**
 * The Quill look's LookProfile: the settings the kit's drawing code reads
 * (content-repo-template/packs/look/quill/SPEC.md). A second look is a sibling file
 * <id>.js exporting only the keys it changes; the rest come from here. It may import
 * nothing: it travels with the kit copy in every course repo.
 *
 * radius, rim, lip, gloss and cardShadow are multipliers on the kit's base sizes (the
 * base sizes stay at their sites, in canvas code and in CSS, so 1 draws them unchanged
 * and 0 removes a lip, a gloss or a shadow).
 */
export default {
  id: 'quill',

  // Shape
  radius: 1,        // every corner: cards, panels, buttons (canvas; DOM --sim-radius-sm/md/lg)
  pill: 999,        // chip and tag corners in px; 999 is a full stadium
  rim: 1,           // card and box rims (canvas; DOM --sim-border)
  lip: 1,           // the solid lip under chips, cards and buttons (DOM --sim-lift)
  gloss: 1,         // highlights: card top edge and light, meter fill, cushion gloss
  cardShadow: 1,    // the canvas card's soft drop shadow
  chipPadX: 26,     // chip width past its text, px
  chipPadY: 15,     // chip height past its font size, px
  textWeight: null, // weight of SVG and table text (--look-text-weight); null keeps the kit's 800
  corner: null,     // px: a cap on every drawn corner, scene-drawn ones too (a disc and an upright capsule stay round); null = no cap
  flattenScenes: false,  // true: a scene's own CSS and SVG obey the look too (radii to corner, overshoot curves to spring except rules with --motion: model and @keyframes *-model, solid lips off); the file is not touched

  // Set
  backdrop: 'world',// 'world': the course's setting (kit/paperKind.js SETTINGS: sky by default; lab, water, field, parchment; riso paper opt-in)
                    // | 'riso': every scene on the warm paper with halftone corners (the 2026-10 look) | 'flat': the surface token, a hairline floor.
                    // Maths stays graph paper either way
  grain: true,      // paper fibre and mottle on the paper settings (riso, lab, parchment); never on graph paper or a world
  settings: true,   // the subject setting (simSetting); false keeps every scene on the paper; 'course': only a course's own
                    // simSetting from the look's list (plain: casefile), never a subject default; everything else flat
  furniture: 'wood',// drawBench, drawShelf: 'wood' | 'flat' (a plain slab)
  faces: true,      // drawFace on objects; SimFigure and drawPersonGlyph faces; SimAnimal eye and mouth (false: faceless, an animal keeps a dot eye)
  figRim: 1,        // SimFigure, drawPersonGlyph and SimAnimal: multiplier on the dark rim round each part and silhouette
  figShade: true,   // the same figures: cushion fill (core shadow, rim light, back gloss); false fills each part flat
  fabric: true,     // SimFigure prints (stripes, check, dots); false keeps every top plain

  // Colour use (never values: those are tokens)
  seriesDefault: null, // series numbers a part takes when the scene names none (Venn rings, histogram); null keeps each part's own
  rest: 'ink',         // 'the rest' in a population (unmarked dots): 'ink' leans to the label, 'paper' recedes toward the surface

  // Motion
  overshoot: 1.70158,   // outBack's default overshoot (decorative pops); 0 arrives with no bounce. outBack(t, s) passes a model's own
  elastic: true,        // outElastic's default (decorative pops) rings; false settles like outBack. outElastic(t, true) keeps a model's ring
  uiSpringDamp: 0,      // floor on the damping of SimAnim uiSpring() flourishes only; 1 stops them ringing. A model's springs are never touched
  popS: 0.35,           // popAt arrival, seconds
  popSparkles: true,    // twinkles off a chip's corners as it pops in, off a find, drawTwinkles, drawMotes
  shake: 1,             // multiplier on screen shake (a miss); 0 keeps the frame still
  reveal: 'iris',       // a canvas scene's first frame: 'iris' opens from the centre | 'fade'
  findPop: 1.15,        // how far a found DOM or SVG element pops, as a scale; 1 keeps it still. Not canvas: ring and twinkles only
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',      // CSS arrivals (DOM, SVG)
  springSoft: 'cubic-bezier(0.34, 1.3, 0.64, 1)',   // CSS growth: bars, stacks
  annotDraw: 0.24,      // SimAnnotate: a leader line or a ring drawing on to its target, seconds
  annotSweep: 0.3,      // SimAnnotate: a highlighter or an underline sweeping left to right, seconds

  // Character
  celebration: 'quill', // 'quill' | 'tick' | 'none': what a scene's find does
  mascot: 'quill',      // the kit's character, or null for none
  fontDisplay: null,    // CSS family for --sim-font-display; null keeps sim-theme.css
  fontBody: null,       // CSS family for --sim-font; null keeps sim-theme.css
  casefile: 'desk',     // the casefile setting: 'desk' (desk, manila folder, ruled card) or 'quiet' (paper, a hairline folder rule)
  fontMono: null,       // CSS family for --sim-font-mono (labels and kickers on the casefile setting); null keeps sim-theme.css
  fontNumeral: null,    // CSS family for --sim-font-numeral (one big reading, the .sim-numeral class); null keeps sim-theme.css
};
