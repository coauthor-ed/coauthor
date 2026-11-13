import { appUrl } from './basePath.js';

/**
 * One place that loads and configures the vendored MathLive.
 *
 * MathLive's default fontsDirectory is the relative "./fonts/". To resolve
 * a relative directory it first sends a HEAD request for its own module
 * URL; offline (or when that probe is aborted) the request fails and it
 * logs 'Invalid URL "./fonts/"' and may skip its fonts. An absolute URL
 * skips the probe entirely. The KaTeX font files live in vendor/fonts/,
 * next to vendor/mathlive.js, so the fonts are the same ones as before.
 */
export const MATHLIVE_FONTS_URL = appUrl('vendor/fonts/');

/** Applies the app's MathLive settings to a loaded module. Returns it. */
export function configureMathlive(mod) {
  try {
    const M = mod?.MathfieldElement || globalThis.MathfieldElement;
    if (M && M.fontsDirectory !== MATHLIVE_FONTS_URL) M.fontsDirectory = MATHLIVE_FONTS_URL;
  } catch { /* an older build without the static setter: keep its default */ }
  return mod;
}

let _loading = null;

/** Lazy-loads vendor/mathlive.js once, configured. */
export function loadMathlive() {
  if (!_loading) _loading = import('vendor/mathlive.js').then(configureMathlive);
  return _loading;
}
