/**
 * Which paper a scene stands on: 'graph' (maths: flat lavender squared paper, 24 px cells) or 'riso'
 * (every other subject: the world of its setting, see below; 'riso' is the historical name of the
 * non-maths paper and still the key SimLook / SimLookDom switch on). A scene's static PAPER
 * ('graph' | 'riso') wins; else the course subject its host passes down as the inherited CSS
 * custom property --sim-subject (the app sets it from the bundle's manifest.json subject; a harness
 * may set it on any ancestor). No subject means riso.
 */
export function paperKindOf(el, fixed) {
  if (fixed === 'graph' || fixed === 'riso') return fixed;
  let s = '';
  try { s = el ? getComputedStyle(el).getPropertyValue('--sim-subject').trim().toLowerCase() : ''; } catch { /* detached */ }
  return /^math/.test(s) ? 'graph' : 'riso';
}

/**
 * The settings the kit paints behind a scene (packs/look/quill/SPEC.md sec 5): the world the scene
 * stands in, night in the dark theme and day in the light one.
 *   sky        open sky over a low horizon (the default)
 *   lab        a lab wall on paper (chemistry)
 *   water      under water, light shafts, a sandy floor (biology)
 *   field      sky to ground, horizon at two thirds (geography)
 *   parchment  an evening wash over a parchment floor (history, civics)
 *   riso       the risograph paper with halftone corners (opt-in per course)
 *   casefile   a desk edge, a manila folder with a tab, a ruled paper card (opt-in per course; the plain
 *              look's one setting, packs/look/plain/SPEC.md sec 8; a dim desk lamp in the dark theme)
 *   none       the flat surface token, nothing else
 */
export const SETTINGS = ['sky', 'lab', 'water', 'field', 'parchment', 'riso', 'casefile', 'none'];
/** The settings a look with settings 'course' paints (only when the course names one; else flat). */
export const COURSE_SETTINGS = ['casefile'];
export const DEFAULT_SETTING = 'sky';

/**
 * Which setting the kit paints behind a scene: a scene's static SETTING wins; else the inherited
 * --sim-setting (the app sets it from the bundle manifest's optional "simSetting"); else the default
 * (sky). Unknown names are the default. Maths never has a setting: its graph paper wins in the painters.
 */
export function settingOf(el, fixed) {
  if (SETTINGS.includes(fixed)) return fixed;
  let s = '';
  try { s = el ? getComputedStyle(el).getPropertyValue('--sim-setting').trim().toLowerCase() : ''; } catch { /* detached */ }
  return SETTINGS.includes(s) ? s : DEFAULT_SETTING;
}

/**
 * What the kit paints for a setting under a LookProfile (kit/looks/<id>.js): 'graph' on the maths
 * paper; under settings 'course' (plain) the setting only if it is in COURSE_SETTINGS, else 'none'; 'none'
 * (the flat surface) for backdrop 'flat' or the setting none; under backdrop 'riso', or a look with no
 * settings, the paper ('lab' stays on it when the look keeps settings); else the setting.
 * SimLook (canvas), DomSimulation (data-sim-setting for the CSS) and SimSvg all resolve through here.
 */
export function resolveSetting(setting, look, paper = 'riso') {
  if (paper === 'graph') return 'graph';
  let s = SETTINGS.includes(setting) ? setting : DEFAULT_SETTING;
  if (look.settings === 'course') return COURSE_SETTINGS.includes(s) ? s : 'none';
  if (s === 'none' || look.backdrop === 'flat') return 'none';
  if (look.backdrop === 'riso') return s === 'lab' && look.settings ? 'lab' : 'riso';
  if (!look.settings) return 'riso';
  return s;
}
