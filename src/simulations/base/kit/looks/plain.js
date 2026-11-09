/**
 * The plain look's LookProfile: an editorial explainer (packs/look/plain/SPEC.md). Soft corners,
 * fine rims, a low shadow, flat paper, a quiet casefile (no desk, no folder fill), no decorative pop, no character (figures faceless), a quiet tick at a find (a stamp on
 * the casefile setting), annotations that draw on. settings 'course': only a course's own simSetting
 * from the plain list (casefile) is painted, never a subject default. Only
 * the keys that differ from quill.js; colours are tokens (src/looks/plain/look.css), never here.
 * The named faces are vendored for the app (Instrument Sans text, Antic Didone numeral: the slide shell's faces, 2026-11-05);
 * in a course repo the stack falls to the system. No monospace under plain (2026-11-05): fontMono is the sans.
 * Theme only, never machinery: the motion keys below calm decorative flourishes (chip and card pops,
 * find sparkles, screen shake, uiSpring() snaps). A model's springs, physics, camera, morph, stage,
 * rig and draw-on run at full power (outBack(t, s) / outElastic(t, true) / --motion: model keep their own).
 */
const SERIF = "'Antic Didone', 'Source Serif 4', Georgia, 'Times New Roman', serif";
const SANS = "'Instrument Sans', 'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Liberation Sans', Arial, sans-serif";

export default {
  id: 'plain',

  radius: 0.6, pill: 7, rim: 0.7, lip: 0, gloss: 0, cardShadow: 0,   // rules, not cards: no shadow under a card (2026-11-05)
  chipPadX: 20, chipPadY: 11, textWeight: 600,
  seriesDefault: [1, 2, 3, 8], rest: 'paper',
  corner: 10, flattenScenes: true,

  backdrop: 'flat', grain: false, settings: 'course', furniture: 'flat', faces: false,
  casefile: 'quiet',   // the casefile setting drawn quiet: the page paper, a hairline folder rule and tab (SPEC sec 8)
  figRim: 0.4, figShade: false, fabric: false,   // people and animals: fine rims, flat fills, plain cloth

  overshoot: 0, elastic: false, uiSpringDamp: 1, popS: 0.22, popSparkles: false, findPop: 1, shake: 0, reveal: 'fade',
  spring: 'cubic-bezier(0.2, 0, 0, 1)', springSoft: 'cubic-bezier(0.2, 0, 0, 1)',

  celebration: 'tick', mascot: null, fontDisplay: SANS, fontBody: SANS, fontMono: SANS,   // no typewriter: casefile labels and stamps in the sans
  fontNumeral: SERIF,   // the big serif reading (.sim-numeral), same face as the slide-head step number
};
