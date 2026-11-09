import { createEmbedder } from 'core/evaluators/semanticSimilarityEvaluator.js';
import { ErrorReporter } from 'core/ErrorReporter.js';
import { appUrl } from 'core/basePath.js';

let sharedEmbedPromise = null;

/**
 * Lazily loads the vendored transformers.js pipeline + the on-device
 * Xenova/all-MiniLM-L6-v2 model, entirely from /vendor/ (no network — see
 * tools/vendor-setup.sh). Shared across every mounted instance of this
 * plugin on the page so the ~23MB model is only fetched/parsed once; this is
 * a resource cache (like a module's own memoized singleton), not the kind of
 * cross-component *interaction* state the "no global mutable state" rule is
 * about — each plugin instance still owns its own answer/coaching state.
 *
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<(text: string) => Promise<Float32Array>>} embed function
 */
export function loadEmbedder(onProgress) {
  if (!sharedEmbedPromise) {
    sharedEmbedPromise = (async () => {
      const { pipeline, env } = await import('vendor/transformers/transformers.web.js');

      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = appUrl('vendor/models/');
      env.backends.onnx.wasm.wasmPaths = appUrl('vendor/transformers/ort/');
      env.backends.onnx.wasm.numThreads = 1;

      const extractor = await pipeline('feature-extraction', 'all-minilm-l6-v2', {
        dtype: 'q8',
        progress_callback: (p) => {
          if (p.status === 'progress' && p.total && typeof onProgress === 'function') {
            onProgress(Math.round((p.loaded / p.total) * 100));
          }
        },
      });

      return createEmbedder(async (text) => {
        const out = await extractor(text, { pooling: 'mean', normalize: true });
        return Float32Array.from(out.data);
      });
    })().catch((err) => {
      sharedEmbedPromise = null; // allow retry on next mount
      ErrorReporter.reportError(err, { source: 'semantic-descriptive@1', phase: 'model-load' });
      throw err;
    });
  }
  return sharedEmbedPromise;
}

let confettiPromise = null;
export function loadConfetti() {
  if (!confettiPromise) {
    confettiPromise = import('vendor/confetti/confetti.module.mjs').then((m) => m.default);
  }
  return confettiPromise;
}
