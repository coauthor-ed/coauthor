/**
 * Base-path independence primitive (cross-device-sync sprint, Stage 2). This
 * app hard-assumed the origin root everywhere — 82+ files carried root-
 * absolute paths (`/src/...`, `/content/...`) — which breaks outright at a
 * subdirectory deployment (e.g. `https://username.github.io/coauthor/`):
 * `register('/sw.js')` resolves to the origin root, 404s, and the app gets
 * no Service Worker, no offline, no installability at all until every such
 * path is fixed.
 *
 * `APP_BASE` is computed from this module's own URL rather than
 * `location.pathname`, so it's correct regardless of which route/hash the
 * page happens to be on: this file always lives at `<APP_ROOT>/src/core/
 * basePath.js`, so climbing two directories up from it is always the app's
 * actual root, whether that's `/` or `/coauthor/`.
 */
export const APP_BASE = new URL('../../', import.meta.url).href;

/**
 * Resolves an app-root-relative path (e.g. `'sw.js'`, `'/manifest.webmanifest'`
 * — a leading slash is stripped, not required) against `APP_BASE`. Every
 * "no resolver at all" call site the Stage 2 audit found (BlockRegistry.js,
 * QuestionRegistry.js, AppShell.js, Icons.js, OnboardingFlow.js,
 * mathEvaluatorWorker.js, app.js, modelLoader.js, SimGeo.js,
 * ParentDashboard.js) routes through this instead of a literal `/...` path.
 */
export function appUrl(path) {
  return new URL(String(path ?? '').replace(/^\/+/, ''), APP_BASE).href;
}
