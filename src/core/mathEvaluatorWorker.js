/**
 * mathEvaluatorWorker.js — Web Worker that sandboxes mathjs formula evaluation.
 *
 * Runs mathjs inside an isolated thread. The main thread posts:
 *   { formula: string, scope: object }
 * and receives:
 *   { ok: true, value: number } | { ok: false, error: string }
 *
 * The 1000ms timeout is enforced on the main-thread call site via
 * evaluateWithTimeout() exported from this module as a helper.
 * (HLD §7.4, Appendix B.4)
 */

import { appUrl } from './basePath.js';

// Resolved once, in real module scope (this file, unlike the blob: worker
// below, has a real import.meta.url basePath.js can anchor against) — a
// blob: worker has no origin of its own to resolve a root-relative
// "/vendor/mathjs.js" against (see the comment inside WORKER_SRC), and
// `self.location.origin` alone drops the app's own subpath at a
// subdirectory deployment (cross-device-sync sprint, Stage 2), so the
// fully-qualified URL is baked into the worker source as a string instead.
const MATHJS_URL = appUrl('vendor/mathjs.js');

// ── Worker code (inline as a Blob so it stays a single file) ─────────────────
// Handles two message shapes, both keyed by the same `id`/timeout contract:
//   { id, formula, scope }   -> single evaluation, { id, ok, value } | { id, ok: false, error }
//   { id, formula, scopes }  -> batch evaluation (e.g. sampling a curve, or
//     scoring several plotted points in one round trip instead of one
//     postMessage per point) -> { id, ok: true, values: (number|null)[] },
//     one entry per scope, `null` for a scope that itself failed to
//     evaluate (a single bad point must never fail the whole batch).
const WORKER_SRC = `
// self.onmessage is assigned SYNCHRONOUSLY, before mathjs (a ~400KB module)
// has even started fetching — the opposite ordering (assigning onmessage
// only inside the import()'s .then()) is a real bug that shipped here
// once already: the very first postMessage from the main thread, sent
// immediately after 'new Worker()', arrives before any listener exists and
// is silently lost — the caller's own timeout then fires and reports a
// false "couldn't evaluate" failure on exactly the first call, working
// fine on every call after (once the import has resolved). Loading mathjs
// lazily on the first real message (cached after) keeps the same "nothing
// downloaded until actually needed" behavior without that race.
//
// A dynamic import() from a blob: worker cannot resolve a root-absolute
// specifier ("/vendor/mathjs.js") — blob: URLs have no origin for the
// resolver to anchor a root-relative path against, so that form throws
// "Failed to resolve module specifier" even though the exact same path
// resolves fine from the main thread. A fully-qualified absolute URL,
// computed on the main thread via appUrl() and interpolated in below,
// resolves correctly either way — and unlike a self.location.origin-based
// URL, it's still correct at a subdirectory deployment.
let _mathReady = null;
function getMath() {
  if (!_mathReady) {
    _mathReady = import('${MATHJS_URL}').then(({ create, all }) => create(all));
  }
  return _mathReady;
}
self.onmessage = async ({ data: { id, formula, scope, scopes } }) => {
  try {
    const math = await getMath();
    if (scopes) {
      const values = scopes.map((s) => {
        try { return Number(math.evaluate(formula, s)); }
        catch { return null; }
      });
      self.postMessage({ id, ok: true, values });
    } else {
      const value = math.evaluate(formula, scope);
      self.postMessage({ id, ok: true, value: Number(value) });
    }
  } catch (e) {
    self.postMessage({ id, ok: false, error: e.message });
  }
};
`;

let _worker = null;
let _pendingCalls = new Map();
let _nextId = 1;

function getWorker() {
  if (_worker) return _worker;
  const blob = new Blob([WORKER_SRC], { type: 'application/javascript' });
  _worker = new Worker(URL.createObjectURL(blob), { type: 'module' });
  _worker.onmessage = ({ data }) => {
    const resolve = _pendingCalls.get(data.id);
    if (resolve) { _pendingCalls.delete(data.id); resolve(data); }
  };
  _worker.onerror = (e) => {
    // Resolve all pending calls with error so nothing hangs
    for (const [id, resolve] of _pendingCalls) {
      resolve({ id, ok: false, error: e.message });
    }
    _pendingCalls.clear();
    _worker = null; // allow re-creation on next call
  };
  return _worker;
}

/** Shared by evaluateWithTimeout/evaluateManyWithTimeout — races one posted
 *  message against timeoutMs, resolving exactly once either way. */
function callWorker(message, timeoutMs) {
  return new Promise(resolve => {
    const id = _nextId++;
    const timer = setTimeout(() => {
      _pendingCalls.delete(id);
      resolve({ ok: false, error: 'timeout' });
    }, timeoutMs);

    _pendingCalls.set(id, result => {
      clearTimeout(timer);
      resolve(result);
    });

    try {
      getWorker().postMessage({ id, ...message });
    } catch (e) {
      clearTimeout(timer);
      _pendingCalls.delete(id);
      resolve({ ok: false, error: e.message });
    }
  });
}

/**
 * Evaluate a mathjs formula in the sandboxed worker with a timeout.
 * @param {string} formula  e.g. "a * t"
 * @param {object} scope    e.g. { a: 3.5, t: 7 }
 * @param {number} timeoutMs  Default 1000ms per HLD spec
 * @returns {Promise<{ok: boolean, value?: number, error?: string}>}
 */
export function evaluateWithTimeout(formula, scope, timeoutMs = 1000) {
  return callWorker({ formula, scope }, timeoutMs);
}

/**
 * Evaluate the same mathjs formula against many scopes in a single worker
 * round trip — used to sample a curve's points for plotting, or to score
 * several student-plotted points at once, instead of one postMessage per
 * point. A scope that itself fails to evaluate becomes `null` in `values`
 * (same position), never fails the whole batch.
 * @param {string} formula  e.g. "2*x + 3"
 * @param {object[]} scopes  e.g. [{x: 0}, {x: 1}, {x: 2}]
 * @param {number} timeoutMs  Default 1000ms per HLD spec — applies to the
 *   whole batch, not per-scope.
 * @returns {Promise<{ok: boolean, values?: (number|null)[], error?: string}>}
 */
export function evaluateManyWithTimeout(formula, scopes, timeoutMs = 1000) {
  return callWorker({ formula, scopes }, timeoutMs);
}

/**
 * Fire-and-forget: creates the worker and starts loading mathjs (~400KB)
 * ahead of time, so a plugin's first REAL evaluation isn't racing the
 * DoS-protection timeout above against a cold module download too — call
 * this as soon as a plugin that will need evaluation mounts (e.g.
 * plot-function@1's init(), a companion `data.graph`'s mount), not only
 * right before the student's answer needs scoring. Uses a generous 8s
 * timeout of its own (this is a one-time network+parse cost, not the
 * per-formula DoS budget evaluateWithTimeout/evaluateManyWithTimeout
 * enforce) and never throws — a failed warmup just means the first real
 * call pays the cold-start cost itself instead.
 */
export function warmup() {
  callWorker({ formula: '1', scope: {} }, 8000).catch(() => {});
}
