import { SERIES_SUFFIX } from '../../core/colorRoles.js';

/**
 * readSimColors — resolves a scene's CSS custom-property color tokens into
 * plain color strings via getComputedStyle(), with per-key hex fallbacks.
 *
 * ── Migrating a scene off hardcoded `const COLORS = {...}` (engine repo only —
 * sim-theme.css is not reachable from a content bundle; see its own header) ──
 *   1. Map each color onto an EXISTING token in sim-theme.css's closed palette
 *      (backgrounds, text, structure, state, `--sim-map-*`, the biology nouns,
 *      or `--sim-series-1..8` for "N distinguishable colors for N parts").
 *      Do not add a new `--sim-<scene>-*` token — see sim-theme.css's header.
 *      If nothing fits, that's a signal the palette is missing a generic
 *      role: add the role there (with both a dark and light value), not a
 *      scene-named token.
 *   2. Implement `_reloadColors()` on the scene, calling
 *      `readSimColors(this.container, tokenMap)` to populate `this.colors`.
 *      Call it once in `setup()` (before any draw calls) — it also runs
 *      automatically on every theme change (SimulationBase's `theme:changed`
 *      subscription).
 *   3. Replace all `COLORS.x` references in draw code with `this.colors.x`.
 *   4. For Matter.js (PhysicsSimulation) scenes, also reapply live body
 *      render colors inside `_reloadColors()` (e.g. `this._bob.render.fillStyle
 *      = this.colors.bobFill`) — Matter reads render props fresh every frame.
 *   5. Verify in tests/simulation-showcase.html: toggle the theme button in
 *      both light/dark, and while the scene is mid-animation (not just at
 *      load).
 *
 * Canvas 2D (and Matter.js render options) cannot resolve `var(...)` — there's
 * no cascade context for a raw string assignment to fillStyle/strokeStyle.
 * This must be called in JS (typically once in setup(), and again whenever
 * the app theme changes) and the *resolved* values cached on the scene,
 * never the var(...) string itself.
 *
 * Fallbacks are intentionally per-scene, in JS — not solely relying on
 * sim-theme.css being loaded, since not every host page that mounts a
 * simulation is guaranteed to include it (getComputedStyle returns '' for an
 * undefined custom property, and ctx.fillStyle = '' is a silent
 * invisible-drawing bug).
 *
 * @param {HTMLElement} container
 * @param {Object.<string, [string, string]>} tokenMap  colorKey -> [cssVarName, hexFallback]
 * @returns {Object.<string, string>} colorKey -> resolved color string
 */

/**
 * ROLE_ALIASES — the rescue path for scene-named tokens.
 *
 * Course scenes reference 873 distinct `--sim-*` tokens; 856 of them are not
 * declared in sim-theme.css, so 1869 of 4747 references (39%) silently fell
 * through to their JS hex fallback and rendered the SAME colour in light and
 * dark. sim-theme.css's header forbids scene-named tokens for exactly this
 * reason, but the rule had no escape hatch, so authors kept inventing them
 * anyway: --sim-parallelogram-muted, --sim-motion-good, --sim-motion-shape,
 * --sim-squaring-circle, and so on.
 *
 * The invented names are almost always <scene>-<role>. So when a token does
 * not resolve, take its LAST hyphen segment and look up the generic role.
 * That turns the bulk of those dead references into real, theme-aware colours
 * without editing any of the 699 scene files.
 *
 * Second tier: a trailing a/b/c/x/y/z or 1-8 means "the Nth distinguishable
 * thing here", which is what --sim-series-N exists for.
 *
 * Anything still unresolved keeps the scene's own hex fallback, exactly as
 * before - this can only improve a scene, never break one.
 */
const ROLE_ALIASES = {
  muted: '--sim-muted',          faint: '--sim-muted',        dim: '--sim-muted',
  deep: '--sim-bg-deep',         bg: '--sim-bg-deep',
  panel: '--sim-bg-surface',     surface: '--sim-bg-surface',  card: '--sim-bg-surface',
  raised: '--sim-surface-raised',
  label: '--sim-label',          text: '--sim-label',          ink: '--sim-label',
  accent: '--sim-accent',        highlight: '--sim-accent',
  stroke: '--sim-stroke',        border: '--sim-border',       edge: '--sim-border',
  outline: '--sim-border',       line: '--sim-stroke',
  shape: '--sim-shape',          fill: '--sim-shape',          box: '--sim-shape',
  body: '--sim-shape',           alt: '--sim-shape-alt',
  wedge: '--sim-wedge',          slice: '--sim-wedge',         piece: '--sim-wedge',
  height: '--sim-height',        altitude: '--sim-height',     axis: '--sim-height',
  good: '--sim-good',            ok: '--sim-good',             success: '--sim-success',
  bad: '--sim-bad',              danger: '--sim-danger',       error: '--sim-error',
  warn: '--sim-warning',         warning: '--sim-warning',
  glow: '--sim-glow',            track: '--sim-track',         rail: '--sim-track',
  gold: '--sim-gold',            glass: '--sim-glass',
  electron: '--sim-electron',    proton: '--sim-proton',       neutron: '--sim-neutron',
  ion: '--sim-cation',           cation: '--sim-cation',       anion: '--sim-anion',
  force: '--sim-force',          tension: '--sim-force',       flame: '--sim-flame',
  wire: '--sim-wire',            water: '--sim-water',
  // Second pass, from measuring what was still falling through on the real
  // corpus after the first alias table shipped.
  pos: '--sim-proton',           neg: '--sim-electron',       charge: '--sim-accent',
  paper: '--sim-bg-surface',     sheet: '--sim-bg-surface',   shell: '--sim-stroke',
  ring: '--sim-border',          orbit: '--sim-border',       normal: '--sim-force',
  sugar: '--sim-glucose',        salt: '--sim-salt',          gas: '--sim-oxygen',
  tile: '--sim-shape',           grid: '--sim-track',         dot: '--sim-accent',
  bar: '--sim-shape',            arrow: '--sim-accent',       cap: '--sim-shape-alt',
  seg: '--sim-wedge',            segment: '--sim-wedge',      part: '--sim-wedge',
  base: '--sim-shape',           side: '--sim-shape',         apex: '--sim-shape-alt',
  square: '--sim-shape',         circle: '--sim-shape-alt',   tri: '--sim-shape',
  // Third pass, again from measuring what still fell through.
  gravity: '--sim-force',        weight: '--sim-force',       push: '--sim-force',
  pull: '--sim-force',           machine: '--sim-surface-raised',
  bulb: '--sim-warning',         lamp: '--sim-warning',       spark: '--sim-warning',
  alpha: '--sim-series-1',       beta: '--sim-series-2',      gamma: '--sim-series-3',
  off: '--sim-muted',            on: '--sim-good',            idle: '--sim-muted',
  hot: '--sim-error',            cold: '--sim-accent',        heat: '--sim-flame',
  air: '--sim-accent',           metal: '--sim-stroke',       wood: '--sim-wedge',
  plate: '--sim-shape',          rod: '--sim-stroke',         beam: '--sim-shape',
  mass: '--sim-shape',           block: '--sim-shape',        cart: '--sim-shape',
  person: '--sim-shape-alt',     hand: '--sim-shape-alt',     path: '--sim-track',
  // Earth materials (own tokens since 2026-09-29; sand/soil/rock used to fall onto wedge/stroke).
  sand: '--sim-strata-1',        silt: '--sim-strata-1',      soil: '--sim-strata-2',
  clay: '--sim-strata-3',        shale: '--sim-strata-4',     rock: '--sim-strata-5',
  magma: '--sim-magma',          lava: '--sim-magma',         ice: '--sim-ice',
  snow: '--sim-ice',             glacier: '--sim-ice',
};

/** Trailing enumerator -> --sim-series-N (1-based, wrapped to the 8 available).
 *  Lives in core/colorRoles.js now — shared with mathColorize.js, which color-
 *  codes equation variables through the exact same a/b/c… -> series-N mapping
 *  a scene's own token names already resolve through here. */

const warned = new Set();

/** Resolve a --sim-* token, falling back through its role alias. */
function resolveToken(styles, cssVar) {
  if (!styles) return '';
  const direct = styles.getPropertyValue(cssVar).trim();
  if (direct) return direct;
  if (!String(cssVar).startsWith('--sim-')) return '';   // the role aliases are for the closed --sim-* palette; any other token (theme.css --landing-*) falls back to its own hex

  // camelCase and digits both split cleanly on the last hyphen: a token like
  // --sim-challenge-trackB still yields "trackb" -> track.
  // Scene-named tokens are almost always <scene>-<role> or
  // <scene>-<role>-<qualifier> ('--sim-force-gravity', '--sim-bulb-off'), so
  // try the last segment, then the one before it.
  const parts = String(cssVar).toLowerCase().split('-').filter(Boolean).slice(1); // drop 'sim'
  const tail = parts[parts.length - 1] || '';
  const prev = parts[parts.length - 2] || '';
  const word = tail.replace(/[0-9]+$/, '');

  const role = ROLE_ALIASES[tail] || ROLE_ALIASES[word] || ROLE_ALIASES[prev];
  if (role) {
    const v = styles.getPropertyValue(role).trim();
    if (v) return v;
  }

  // Only a genuine enumerator tail ('--sim-quad-a', '--sim-ring-3'), never a
  // word that merely ends in one of these letters - otherwise '-blue' would
  // grab a series colour off its trailing 'e'.
  const n = tail.length === 1 ? SERIES_SUFFIX[tail] : undefined;
  if (n) {
    const v = styles.getPropertyValue(`--sim-series-${n}`).trim();
    if (v) return v;
  }

  if (!warned.has(cssVar)) {
    warned.add(cssVar);
    console.debug(`[SimTheme] no palette role for ${cssVar} - using the scene's own fallback`);
  }
  return '';
}

export function readSimColors(container, tokenMap) {
  let styles = null;
  try {
    styles = getComputedStyle(container);
  } catch {
    // container not attached / no window — fall through to fallbacks below
  }

  const out = {};
  for (const [key, entry] of Object.entries(tokenMap)) {
    const [cssVar, fallback] = entry;
    let value = '';
    try {
      value = resolveToken(styles, cssVar);
    } catch {
      value = '';
    }
    out[key] = value || fallback;
  }
  return out;
}
