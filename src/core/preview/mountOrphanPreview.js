import { BlockRegistry } from '../../registry/BlockRegistry.js';
import { QuestionRegistry } from '../../registry/QuestionRegistry.js';
import { mountPlugin } from '../mountPlugin.js';
import { hydrateProseRefs } from '../hydrateProseRefs.js';
import { LookManager } from '../LookManager.js';

/**
 * Mounts a single block or question JSON payload through the real plugin
 * pipeline — same registries and mountPlugin() call LessonEngine/TestEngine
 * use to render production content — with no lesson/module/test wrapper
 * required. For previewing a slide or question that isn't wired into
 * anything yet.
 *
 * Stateless by design: everything it needs comes in as arguments, nothing
 * is read from or written to any shared session/app state (the opposite of
 * authoring-app's own mountPreview(), which also renders whole
 * lesson/test/course/module summaries by cross-referencing its in-editor
 * draft queue — a real need for that use case, irrelevant to a standalone
 * file that by definition has nothing to cross-reference). `bundleId` is
 * the only piece of context a standalone file can't carry itself — it's
 * what CourseSourceManager.resolveRef() (called from inside the mounted
 * plugin for image.src/simulation.src) anchors bundle-relative paths
 * against.
 *
 * @param {object} data - parsed block or question JSON (must have `type`)
 * @param {HTMLElement} container - mount target, cleared before mounting
 * @param {{ bundleId?: string, initialStep?: number, previewOnly?: boolean }} [opts] -
 *   `initialStep` is the same ctx field LessonEngine._render() passes for a
 *   `beat=N` deep link (see its own `initialStep` doc comment) — a
 *   progressive-disclosure block reads it to mount already at that beat,
 *   rather than the caller looping advanceStep() N times after the fact
 *   (which would also replay every intermediate beat's reveal animation/
 *   onBeatChange call). `previewOnly` is read by question plugins
 *   (QuestionBase._renderPreviewOnly() and its per-type overrides) to show
 *   just the question as posed — no input control, hints, companion sim/
 *   graph, or grading-only heavy work (model/vendor loads, manifest
 *   fetches) — for a caller that's browsing a question bank rather than
 *   actually previewing the full interactive experience (PracticeTestCreate's
 *   "Preview question" toggle; ContentPreview.js/authoring-app's own
 *   mountPreview() deliberately omit it to keep their full interactive
 *   preview).
 * @returns {Promise<HTMLElement>} the plugin-error-boundary mountPlugin() returns
 */
export async function mountOrphanPreview(data, container, { bundleId, initialStep, previewOnly } = {}) {
  if (!data?.type) throw new Error('mountOrphanPreview: data.type is required.');

  // Outside the student shell (the authoring app's inline preview), the
  // plugin's cues still need a reactor, or a mini-game never greets and a
  // POE recap never shows its face. No-op inside the app (LookManager is
  // initialised there); never touches the host page's look (invariant 10).
  await Promise.all([BlockRegistry.init(), QuestionRegistry.init(), LookManager.startPreviewReactor()]);

  const blockPath = BlockRegistry.getPath(data.type);
  const questionPath = blockPath ? null : QuestionRegistry.getPath(data.type);
  if (!blockPath && !questionPath) {
    throw new Error(`mountOrphanPreview: unknown plugin type "${data.type}".`);
  }

  const ctx = { bundleId, initialStep, previewOnly };
  container.innerHTML = '';
  // See LessonEngine._render()'s identical call for why this must happen
  // here (before the synchronous mountPlugin), not inside a plugin's own
  // init().
  const hydrated = await hydrateProseRefs(data, bundleId);
  if (blockPath) {
    await BlockRegistry.loadPlugin(data.type);
    return mountPlugin(data.type, hydrated, container, ctx);
  }
  await QuestionRegistry.loadPlugin(data.type);
  // NOT mountPlugin(..., undefined, ctx) - every question plugin's init(data,
  // prng, ctx) duck-types arg2 (real PRNG from TestEngine vs. a plain ctx
  // object from LessonEngine, see mcq-single@2's own comment on this) to
  // decide which slot ctx is in. Passing literal `undefined` for prng still
  // fails that PRNG check, but then makes the plugin read ctx from arg2
  // (`prng || null`) - which is `undefined` here, not the real ctx - so
  // `this._ctx`/`this.bundleId` came out null and every bundle-relative ref
  // (image.src, simulation.src, explanationSlide.blocks[].blockRef) 404'd.
  // One arg, matching the LessonEngine-block calling shape, fixes it.
  return mountPlugin(data.type, hydrated, container, ctx);
}
