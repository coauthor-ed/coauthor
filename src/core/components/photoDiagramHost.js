import { PhotoDiagram } from './PhotoDiagram.js';
import { EventBus } from '../EventBus.js';

/**
 * photoDiagramHost — mount/render helper for a `photoDiagram` companion
 * field, the photo-relationship counterpart to diagramHost.js's
 * mountQuestionDiagram(). Currently wired only into `content-block@1`
 * (content-block.js) - written as its own host module anyway, not inlined
 * there, so attaching `photoDiagram` to a question type later (mirroring
 * how `diagram` already works today) needs no duplicated mount/resubscribe
 * logic, only a new call site.
 *
 * Same live-retheme reasoning as diagramHost.js: PhotoDiagram.plot() reads
 * `--text-main`/`--text-muted`/`--content-series-*` via getComputedStyle()
 * once, at draw time - plain attribute/style values once drawn, not live
 * `var(...)` references, so a light/dark toggle needs an explicit replot.
 * `destroy()` unsubscribes - the caller must invoke it from its own
 * teardown path or this listener leaks for the life of the page.
 *
 * Also tracks the current beat: PhotoDiagram's progressive reveal
 * (`revealAt` on a node/edge, see PhotoDiagram.js's own header) means a
 * replot must know which step it's replotting AT - `setStep()` is what
 * content-block.js calls on every beat change, and the closed-over
 * `currentStep` is what the `theme:changed` handler replots with too
 * (rather than whatever step happened to be current at mount time).
 */

/**
 * @param {HTMLElement} hostEl empty container the diagram should mount into
 * @param {object} photoDiagram see PhotoDiagram.js's own header for the shape
 * @param {string|null} bundleId resolves each photo node's bundle-relative src
 * @param {number} initialStep 0-indexed beat to plot at first
 * @returns {{ destroy: () => void, setStep: (step: number) => void }}
 */
export function mountPhotoDiagram(hostEl, photoDiagram, bundleId = null, initialStep = 0) {
  let currentStep = initialStep;
  PhotoDiagram.plot(hostEl, photoDiagram, bundleId, currentStep);
  const onThemeChanged = () => PhotoDiagram.plot(hostEl, photoDiagram, bundleId, currentStep);
  EventBus.on('theme:changed', onThemeChanged);
  return {
    destroy: () => EventBus.off('theme:changed', onThemeChanged),
    setStep: (step) => {
      if (step === currentStep) return;
      currentStep = step;
      PhotoDiagram.plot(hostEl, photoDiagram, bundleId, currentStep);
    },
  };
}
