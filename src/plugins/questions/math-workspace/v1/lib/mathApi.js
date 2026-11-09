/**
 * mathApi.js - one door to the math core for the whole plugin.
 *
 * Loads src/core/math/index.js (workstream A, CONTRACTS.md section 2). If
 * that import fails, falls back to ./fallbackMath.js (clearly marked thin
 * stand-in) so the plugin still works. Every call is wrapped: a throw inside
 * the core never escapes into the UI, it becomes an "unparsable" result.
 */
import { ErrorReporter } from '../../../../../core/ErrorReporter.js';

let api = null;
let loading = null;
let fallback = false;

export function loadMathApi() {
  if (api) return Promise.resolve(api);
  if (!loading) {
    loading = (async () => {
      try {
        const m = await import('core/math/index.js');
        await m.loadMath();
        api = m;
      } catch (err) {
        console.warn('[math-workspace] math core unavailable, using thin fallback', err);
        const f = await import('./fallbackMath.js');
        await f.loadMath();
        api = f;
        fallback = true;
      }
      return api;
    })();
  }
  return loading;
}

export function mathReady() { return !!api; }
export function usingFallback() { return fallback; }

function guard(fn, failValue) {
  return (...args) => {
    if (!api) return failValue;
    try {
      const r = fn(...args);
      return r ?? failValue;
    } catch (err) {
      try { ErrorReporter.reportError?.(err, { component: 'math-workspace@1', where: 'math-core' }); } catch { /* ignore */ }
      return failValue;
    }
  };
}

const FAIL = { ok: false, error: 'math core error' };
const STEP_FAIL = { ok: false, kind: 'unparsable', reversible: false, message: 'This line could not be read.' };

export const M = {
  evalAt: guard((latex, point) => api.evalAt(latex, point || {}), NaN),
  sequenceValues: guard((latex, opts) => api.sequenceValues(latex, opts), []),
  equivalent: guard((a, b, o) => api.check.equivalent(a, b, o), FAIL),
  step: guard((a, b, o) => api.check.step(a, b, o), STEP_FAIL),
  solutionSet: guard((a, b, o) => api.check.solutionSet(a, b, o), FAIL),
  interval: guard((a, b, o) => api.check.interval(a, b, o), FAIL),
  upToConstant: guard((a, b, o) => api.check.upToConstant(a, b, o), FAIL),
  upToScalar: guard((a, b, o) => api.check.upToScalar(a, b, o), FAIL),
  onIntegers: guard((a, b, o) => api.check.onIntegers(a, b, o), FAIL),
  form: guard((latex, rule, o) => api.form(latex, rule, o), { ok: true }),
  diffTerms: guard((a, b) => api.diffTerms(a, b), { changed: [] }),
};

/** Compare by an expression-shape check mode named in content. */
export function checkBy(mode, a, b, opts) {
  switch (mode) {
    case 'upToConstant': return M.upToConstant(a, b, opts);
    case 'upToScalar': return M.upToScalar(a, b, opts);
    case 'onIntegers': return M.onIntegers(a, b, opts);
    default: return M.equivalent(a, b, opts);
  }
}
