/**
 * POEController — the "small shared service" docs/HighLevelDesign.md §8
 * describes for the Predict-Observe-Explain cycle: a `predict` block records
 * the learner's guess here, and whichever block is tagged as the reveal
 * point (`poeRole: "observe"|"explain"` on content-block@1 — see
 * lesson-to-blocks.js, which sets this at AI Studio conversion time) recalls
 * it and shows the verdict there instead of the predict block revealing it
 * inline.
 *
 * One instance per LessonEngine/lesson session (see LessonEngine.js), passed
 * to each mounted block via the `mountPlugin(..., ctx)` extra-arg mechanism
 * already used for e.g. PRNG in TestEngine.js. Single-slot by design: a
 * lesson only ever has one *unrevealed* prediction pending at a time in a
 * linear read-through, and `recall()`'s adjacency check (the predict block
 * must be exactly one index before the recalling block) is what keeps a
 * stray/older prediction from surfacing somewhere it doesn't belong.
 */
export class POEController {
  constructor() {
    this._pending = null; // { blockIndex, blockId, prediction, predictionText, isCorrect }
  }

  /** Called by poe-predict@1 on submit. */
  recordPrediction(payload) {
    this._pending = payload;
  }

  /**
   * Called by a `poeRole`-tagged block on mount. Returns the pending
   * prediction only if it was made by the block immediately before
   * `blockIndex` — i.e. this recalling block is truly the *next* block after
   * the predict, not some other, unrelated one later in the lesson.
   */
  recall(blockIndex) {
    if (!this._pending || blockIndex == null) return null;
    if (this._pending.blockIndex !== blockIndex - 1) return null;
    return this._pending;
  }
}
