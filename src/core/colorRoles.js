/**
 * SERIES_SUFFIX — shared "the Nth distinguishable thing" table.
 *
 * Single source of truth for turning a loose letter/number into one of the
 * 8 `--sim-series-N` colors (defined in `src/simulations/base/sim-theme.css`,
 * light + dark). Originally lived only in `SimTheme.js` (see that file for
 * the full role-alias resolver a *simulation* uses it through); lifted out
 * here so `src/core/markdown/mathColorize.js` can reuse the exact same
 * a→1, b→2, c→3… mapping to color-code equation variables in step with
 * whatever colors a diagram above them already uses — one convention, two
 * rendering surfaces, instead of two color systems that could drift apart.
 *
 * `src/core/` must not import from `src/simulations/` (layering would run
 * backwards — simulations depend on core, not the reverse), which is why
 * this plain data table lives here rather than being imported out of
 * SimTheme.js directly.
 */
export const SERIES_SUFFIX = {
  a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, x: 1, y: 2, z: 3,
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8,
};

/** `n` (1-8) -> the CSS custom property that resolves it. */
export function seriesToken(n) {
  return `--sim-series-${n}`;
}
