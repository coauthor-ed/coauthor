/**
 * LessonEngine — Renders a lesson using either a linear block list or a
 * directed flow graph (per HLD §8).
 *
 * Supports:
 *  - Sequential mode: lesson.blocks[] array
 *  - Flow-graph mode: lesson.flow + lesson.flowStart
 *  - POE state (delegates to POEController via EventBus)
 *  - Progress tracking to ProgressStore (interaction-driven, debounced)
 *  - PluginErrorBoundary wrapping via mountPlugin
 */
import { ContentLoader } from '../../core/ContentLoader.js';
import { CourseSourceManager } from '../../core/CourseSourceManager.js';
import { hydrateProseRefs } from '../../core/hydrateProseRefs.js';
import { ProgressStore } from '../../core/ProgressStore.js';
import { mountPlugin } from '../../core/mountPlugin.js';
import { BlockRegistry } from '../../registry/BlockRegistry.js';
import { QuestionRegistry } from '../../registry/QuestionRegistry.js';
import { EventBus } from '../../core/EventBus.js';
import { ErrorReporter } from '../../core/ErrorReporter.js';
import { A11yAnnouncer } from '../../core/A11yAnnouncer.js';
import { POEController } from './POEController.js';
import { LessonModeManager } from '../../core/LessonModeManager.js';
import { LookManager } from '../../core/LookManager.js';
import { lessonStars } from '../../core/lessonProgressRules.js';

const SAVE_DEBOUNCE_MS = 500;

/**
 * "Resume at the last beat, whatever that turns out to be." Blocks clamp the
 * `initialStep` they are handed, because the content may have been edited
 * since — so a number past any real step count means the end.
 */
const LAST_STEP = Number.MAX_SAFE_INTEGER;

export class LessonEngine {
  /**
   * @param {string} profileId
   * @param {string} lessonId
   * @param {HTMLElement} container
   */
  constructor(profileId, lessonId, container) {
    this.profileId = profileId || 'default_student';
    this.lessonId = lessonId;
    this.container = container;

    this.lessonData = null;
    this._mode = 'linear';          // 'linear' | 'flow'
    this._currentIndex = 0;         // linear mode
    this._currentNodeId = null;     // flow mode
    this._mountedEl = null;
    this._saveTimer = null;
    this._startTime = Date.now();
    this._advancing = false;        // re-entrancy guard around async navigation
    this._pendingStep = null;       // reveal step to hand the next mounted block
    this._blockData = null;         // the block currently mounted, for reveal.*
    // Set by the host before init(): whether its lesson head shows each
    // slide's title (a look may then hoist it out of the slide), and the
    // lesson's number in its module (figure numbers). Both ride on ctx.
    this.slideHead = false;
    this.lessonNumber = null;
    this._completed = false;        // preserved across saves — see _saveProgress
    this._stars = 0;                // best stars earned; preserved the same way
    this._completedAt = null;
    this._autoplay = false;
    this._autoTimer = null;
    this.onAutoplayChange = null;
    // Narrated mode (NarrationPacer.js): the mounted block shows captions in
    // place of its prose. Only ever true for a lesson with narrationRef.
    this._narrated = false;
    this._sceneStates = new Map(); // block index -> scene getState(), narrated only

    // A backgrounded tab must not keep advancing slides. Also guards the
    // authoring app's full-preview iframe, which loads this same runtime.
    this._visibilityListener = () => { if (document.hidden) this._clearAutoTimer(); else this._scheduleAuto(); };
    document.addEventListener('visibilitychange', this._visibilityListener);
    // One per lesson session — the predict->observe/explain hand-off
    // (docs/HighLevelDesign.md §8). Flow mode has no linear blockIndex, so
    // recall() there simply never matches (see _render()'s ctx.blockIndex).
    this._poe = new POEController();

    this.onProgress = null;
    this.onComplete = null;
    // Fired every render with `{ mode, blockIndex, nodeId, step }` — lets
    // LessonSession keep the URL (`#/lesson/...?block=&beat=`/`?node=&beat=`)
    // in sync without it having to know linear-vs-flow internals itself.
    this.onPositionChange = null;
  }

  /**
   * @param {{startAtEnd?: boolean, blockIndex?: number, nodeId?: string,
   *   beatIndex?: number}} [opts] `startAtEnd: true` — used when arriving
   *   here by navigating *backward* out of the next lesson (see
   *   `LessonSession._handleStartPrev()`) — lands on the last beat of the
   *   last block instead of wherever saved progress or the default start
   *   would otherwise put the student, so "go to the previous lesson" reads
   *   as continuing backward through it, not restarting it. Linear mode
   *   only: a flow-mode lesson's directed graph has no well-defined "last"
   *   node to land on.
   *
   *   `blockIndex`/`nodeId`/`beatIndex` — an explicit deep-linked position
   *   (from the URL), applied *after* saved-progress restore and
   *   `startAtEnd` below, so a URL a student was actually given always wins
   *   over whatever's in IndexedDB or the "resume where you left off"
   *   default. Each is validated and silently ignored if it doesn't resolve
   *   against the loaded lesson (out-of-range index, unknown node id) —
   *   never throws on a stale/bad deep link, same spirit as `LAST_STEP`
   *   clamping below.
   *
   *   `blockRef` — an alternate, linear-mode-only way to spell `blockIndex`:
   *   a `blockRef` path (as authored on `lessonData.blocks[]`) rather than a
   *   position, so a deep link survives the lesson being reordered and lets
   *   an agent/author target a slide by the file it just edited. Resolved
   *   here (once, against the freshly-loaded `lessonData`) to whichever
   *   index currently carries that ref; ignored (falls through to
   *   `blockIndex`/resumed progress) if nothing matches — e.g. an inline
   *   block, which has no ref to match against.
   */
  async init(opts = {}) {
    // First-try grading per question, for the lesson's stars (see _complete()).
    // LessonSession broadcasts 'question:graded' on every Check; only the
    // first verdict per question counts.
    this._firstTry = new Map();
    this._gradedListener = ({ questionId, lessonId, correct, score }) => {
      if (lessonId !== this.lessonId) return;
      const key = questionId ?? `idx:${this._currentIndex}`;
      const firstTry = !this._firstTry.has(key);
      if (firstTry) this._firstTry.set(key, !!correct);
      this._recordAttempt({ correct: !!correct, score, firstTry });
    };
    EventBus.on('question:graded', this._gradedListener);

    // Same detection ContentLoader.loadJSON() already uses to decide whether
    // to serve ai-draft content — reused here so a preview session (viewing
    // draft content that was never meant to count) doesn't also silently
    // advance/complete this profile's real lessonProgress record. See
    // _saveProgress()/_complete() below, the only two places this matters.
    this._isPreview = window.location.search.includes('preview=true') || window.location.hash.includes('preview=true');
    await Promise.all([BlockRegistry.init(), QuestionRegistry.init()]);
    try {
      const basePath = this.lessonId.replace(':', '/');
      const path = basePath.startsWith('/') ? basePath : 
                   (basePath.startsWith('content/') ? `/${basePath}` : `/content/${basePath}`);
      const finalPath = path.endsWith('.json') ? path : `${path}.json`;
      // Which bundle this lesson's own blocks/simulations should resolve
      // against — threaded down to CourseSourceManager.resolveRef() so a
      // bundle-relative `simulation.src` anchors at THIS lesson's own
      // bundle, not this app's local /content/courses/ origin.
      this._bundleId = CourseSourceManager.deriveBundleId(finalPath);
      EventBus.emit('content:loading', { loading: true });
      this.lessonData = await ContentLoader.loadJSON(finalPath);
    } catch (e) {
      ErrorReporter.reportError(e, { component: 'LessonEngine', lessonId: this.lessonId });
      this.container.innerHTML = '<p role="alert">Lesson could not be loaded. Please try again.</p>';
      return;
    } finally {
      EventBus.emit('content:loading', { loading: false });
    }

    if (!this.lessonData) {
      this.container.innerHTML = '<p role="alert">Lesson data is empty.</p>';
      return;
    }

    // Determine mode
    if (this.lessonData.flow && this.lessonData.flowStart) {
      this._mode = 'flow';
      this._currentNodeId = this.lessonData.flowStart;
    } else {
      this._mode = 'linear';
      this._currentIndex = 0;
    }

    // Restore progress
    const saved = await ProgressStore.get('lessonProgress', [this.profileId, this.lessonId]);
    if (saved) {
      // Carried so that _saveProgress()'s whole-record put cannot erase them.
      this._completed = !!saved.completed;
      this._completedAt = saved.completedAt ?? null;
      this._stars = saved.stars || 0;
      this._savedRecord = saved;
      if (!saved.completed) {
        if (this._mode === 'linear' && typeof saved.currentIndex === 'number') {
          this._currentIndex = saved.currentIndex;
          // currentBlockId wins when still present: inserting a slide before
          // the resume point must not shift it.
          const savedBlockIdx = saved.currentBlockId
            ? (this.lessonData.blocks || []).findIndex((b, i) => this._blockIdOf(b, i) === saved.currentBlockId)
            : -1;
          if (savedBlockIdx !== -1) this._currentIndex = savedBlockIdx;
        } else if (this._mode === 'flow' && saved.currentNodeId) {
          this._currentNodeId = saved.currentNodeId;
        }
        // Resume inside the block too, not just at its start. The block clamps
        // this, because the content may have been edited since it was written.
        if (typeof saved.currentStep === 'number') this._pendingStep = saved.currentStep;
      }
    }

    if (opts.startAtEnd && this._mode === 'linear') {
      const blocks = this.lessonData.blocks || [];
      if (blocks.length) {
        this._currentIndex = blocks.length - 1;
        this._pendingStep = LAST_STEP;
      }
    }

    // Explicit deep-linked position wins over everything above — see this
    // method's own doc comment.
    let deepLinkedBlockIndex = opts.blockIndex;
    if (this._mode === 'linear' && opts.blockRef && !Number.isInteger(deepLinkedBlockIndex)) {
      const resolved = this._resolveBlockRefIndex(opts.blockRef);
      if (resolved !== -1) deepLinkedBlockIndex = resolved;
    }
    if (this._mode === 'linear' && Number.isInteger(deepLinkedBlockIndex)) {
      const blocks = this.lessonData.blocks || [];
      if (deepLinkedBlockIndex >= 0 && deepLinkedBlockIndex < blocks.length) {
        this._currentIndex = deepLinkedBlockIndex;
      }
    } else if (this._mode === 'flow' && opts.nodeId && this.lessonData.flow?.[opts.nodeId]) {
      this._currentNodeId = opts.nodeId;
    }
    if (Number.isInteger(opts.beatIndex) && opts.beatIndex >= 0) {
      this._pendingStep = opts.beatIndex;
    }

    await this._render();
  }

  /**
   * Resolves a `blockRef` path (as authored on `lessonData.blocks[]`) to its
   * current index — linear mode only, shared by `init()`'s and `seekTo()`'s
   * `blockRef` handling. Normalizes a leading `/` since both root-absolute
   * and bundle-relative refs are seen in authored content (see
   * `CourseSourceManager.resolveRef()`'s own doc comment on that split).
   * @returns {number} the matching index, or -1 if nothing matches (e.g. an
   *   inline block with no ref, or a stale ref no longer in the lesson).
   */
  _resolveBlockRefIndex(ref) {
    if (this._mode !== 'linear' || !ref) return -1;
    const blocks = this.lessonData?.blocks || [];
    const normalize = (r) => String(r || '').replace(/^\//, '');
    return blocks.findIndex((b) => b?.blockRef && normalize(b.blockRef) === normalize(ref));
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  /**
   * @param {{auto?: boolean}} [opts] `auto: true` marks this as the autoplay
   *   timer's own advance. Anything else is the student taking over, and takes
   *   autoplay off — with the toggle visibly flipping, so the handover is not
   *   a surprise.
   */
  async next(opts = {}) {
    if (!opts.auto) this.setAutoplay(false);

    // Re-entrancy. `next()` is async and `LessonSession._handleNext()` does not
    // await it, so two fast clicks used to run two navigations concurrently.
    // Already latent for `blockRef` blocks, which await a fetch inside
    // `_render()`; sub-steps make it easy to hit.
    if (this._advancing) return;

    // A block that stages its own content consumes the click first. The plugin
    // returns false once it is exhausted, and only then does the lesson move
    // on. Feature-detected, so a question plugin mounted as a lesson block
    // (`_render()` below permits that) behaves exactly as it did before.
    if (this._consumeStep('advanceStep')) return;

    this._advancing = true;
    try {
      if (this._mode === 'linear') {
        const blocks = this.lessonData.blocks || [];
        if (this._currentIndex < blocks.length - 1) {
          this._currentIndex++;
          await this._saveProgress();
          await this._render();
        } else {
          await this._complete();
        }
      }
      // Flow mode: next is handled by branch events
    } finally {
      this._advancing = false;
    }
  }

  async previous() {
    this.setAutoplay(false);
    if (this._advancing) return;
    if (this._consumeStep('retreatStep')) return;

    this._advancing = true;
    try {
      if (this._mode === 'linear' && this._currentIndex > 0) {
        this._currentIndex--;
        // Land on the *last* beat of the block behind us, not its first: going
        // back means re-reading something already seen, and replaying five
        // clicks to get to it is not that. The plugin clamps, so "past the
        // end" resolves to the end.
        this._pendingStep = LAST_STEP;
        await this._saveProgress();
        await this._render();
      }
    } finally {
      this._advancing = false;
    }
  }

  /**
   * Jump directly to a block/node + beat already known to exist in the
   * loaded lesson — the browser Back/Forward button landing back on this
   * same lesson (see `LessonSession.updated()`'s `seekTo()` branch), or a
   * fresh `blockRef`/`blockIndex` handed to an already-mounted lesson (e.g.
   * two same-tab fragment navigations in a row, which browsers treat as an
   * in-page hash change rather than a full reload — so `lessonId` never
   * actually changes and `init()` is never re-run). Unlike `init()`, this
   * never re-fetches `lessonData` — it's already loaded, so this is a cheap
   * in-memory jump, not a network round trip.
   * @param {{blockIndex?: number, nodeId?: string, beatIndex?: number, blockRef?: string}} pos
   */
  async seekTo(pos = {}) {
    if (!this.lessonData) return;
    this.setAutoplay(false);
    if (this._advancing) return;
    // The narration scrubber (`inPlace: true`) moving within the mounted
    // block steps it in place instead of remounting it. Opt-in, so a URL
    // Back/Forward seek keeps behaving exactly as before.
    if (pos.inPlace && this._mode === 'linear' && pos.blockIndex === this._currentIndex
        && Number.isInteger(pos.beatIndex) && typeof this._mountedEl?.goToStep === 'function') {
      if (this._mountedEl.goToStep(pos.beatIndex)) {
        this._notifyProgress();
        this._notifyPosition();
        this._scheduleSave();
      }
      return;
    }

    this._advancing = true;
    try {
      let blockIndex = pos.blockIndex;
      if (this._mode === 'linear' && pos.blockRef && !Number.isInteger(blockIndex)) {
        const resolved = this._resolveBlockRefIndex(pos.blockRef);
        if (resolved !== -1) blockIndex = resolved;
      }
      if (this._mode === 'linear' && Number.isInteger(blockIndex)) {
        const blocks = this.lessonData.blocks || [];
        if (blockIndex < 0 || blockIndex >= blocks.length) return;
        this._currentIndex = blockIndex;
      } else if (this._mode === 'flow' && pos.nodeId) {
        if (!this.lessonData.flow?.[pos.nodeId]) return;
        this._currentNodeId = pos.nodeId;
      } else {
        return;
      }
      this._pendingStep = Number.isInteger(pos.beatIndex) && pos.beatIndex >= 0 ? pos.beatIndex : 0;
      await this._saveProgress();
      await this._render();
    } finally {
      this._advancing = false;
    }
  }

  /**
   * Try to spend a Next/Previous on an intra-block reveal step.
   * @param {'advanceStep'|'retreatStep'} method
   * @returns {boolean} true if the click was consumed by the block.
   */
  _consumeStep(method) {
    const el = this._mountedEl;
    if (typeof el?.[method] !== 'function' || !el[method]()) return false;

    // Announce what appeared, not "Block N of M" — the block did not change.
    if (method === 'advanceStep' && typeof el.stepText === 'function') {
      const text = el.stepText();
      if (text) A11yAnnouncer.announce(text);
    }
    this._notifyProgress();
    this._notifyPosition();
    // Debounced, NOT a full record write per click. `_saveProgress()` is a
    // whole-record `db.put`; five beats a block would be five times the
    // IndexedDB writes on the low-end devices this app targets.
    this._scheduleSave();
    return true;
  }

  // ── Button state (business logic belongs here, not in the shell) ─────────

  /**
   * Whether Previous would do anything. `LessonSession` used to test
   * `_currentBlockIndex <= 1` itself, which is engine business logic living in
   * a shell component (invariant 8) — and would have left Previous disabled
   * for every beat of the first block, making `retreatStep()` unreachable
   * there entirely.
   */
  canGoBack() {
    const el = this._mountedEl;
    if (typeof el?.stepState === 'function' && el.stepState().step > 0) return true;
    return this._mode === 'linear' && this._currentIndex > 0;
  }

  /** Whether Next would do anything — advance a beat, a block, or complete. */
  canGoForward() {
    return true;
  }

  /**
   * Whether the currently-mounted block is a question/prediction the
   * student has not yet answered — Next skipping past it should be
   * confirmed by the shell, not silent. `isAnswered()` is an optional
   * plugin-contract method (`QuestionBase`/`ChoiceListBase` provide a
   * default; a handful of plugins that track their own submit state
   * independently override it — see the plugins themselves); feature-detected
   * the same way `evaluate`/`advanceStep` already are, so a plugin that
   * doesn't implement it is simply never gated.
   */
  hasUnansweredQuestion() {
    const el = this._mountedEl;
    return typeof el?.isAnswered === 'function' && !el.isAnswered();
  }

  /**
   * Submits an answer the student picked but has not submitted yet, through
   * the mounted block's optional `commitPending()` (feature-detected, like
   * `isAnswered()`). True if that happened: the shell then stays on the block
   * so the student sees it land, and the next Next moves on.
   */
  commitPendingAnswer() {
    const el = this._mountedEl;
    return typeof el?.commitPending === 'function' && el.commitPending() === true;
  }

  /**
   * The mounted block's reveal position, or a single-step stand-in for a
   * plugin that does not stage. Handed to `onProgress` so the shell has one
   * changing value to re-render on.
   */
  stepState() {
    const el = this._mountedEl;
    if (typeof el?.stepState !== 'function') return { step: 0, steps: 1, done: true };
    return el.stepState();
  }

  // ── Autoplay ─────────────────────────────────────────────────────────────
  //
  // Lives in the engine, not in LessonSession: pacing is lesson business
  // logic, and invariant 8 keeps that out of the shell. Off by default —
  // clicking is the primary verb, and this is an assist, not the design.

  /** @param {boolean} on */
  setAutoplay(on) {
    const next = !!on && this._canAutoplay();
    const changed = next !== this._autoplay;
    this._autoplay = next;
    this._clearAutoTimer();
    if (next) this._scheduleAuto();
    if (changed && this.onAutoplayChange) this.onAutoplayChange(this._autoplay);
    return this._autoplay;
  }

  isAutoplaying() { return this._autoplay; }

  /**
   * A timer must never carry a student past something they were meant to
   * answer, so autoplay refuses to run on any block that asks for input —
   * anything exposing `evaluate()` — and on anything with no steps to reveal.
   */
  _canAutoplay() {
    const el = this._mountedEl;
    if (!el) return false;
    if (typeof el.evaluate === 'function') return false;
    // Deliberately NOT gated on `prefers-reduced-motion`. It was, and the
    // result was a toggle that did nothing at all for anyone with the OS
    // setting on — no timer, no animation, no explanation. The preference is
    // about things moving across the screen, and it is honoured where that
    // actually applies (the entry animation drops to a plain cross-fade, the
    // image stops panning). Advancing a beat on a timer is pacing, the same
    // category as stepping by click, which this design has never disabled.
    return typeof el.advanceStep === 'function';
  }

  _clearAutoTimer() {
    clearTimeout(this._autoTimer);
    this._autoTimer = null;
  }

  _scheduleAuto() {
    this._clearAutoTimer();
    if (!this._autoplay || document.hidden) return;
    if (!this._canAutoplay()) { this.setAutoplay(false); return; }
    this._autoTimer = setTimeout(() => this._autoTick(), this._dwellMs());
  }

  async _autoTick() {
    if (!this._autoplay) return;
    if (this._consumeStep('advanceStep')) {
      this._scheduleAuto();
      return;
    }
    // Out of beats: cross into the next block. Continuing rather than stopping
    // at the boundary is what dissolves the slide edge — but `_render()` will
    // switch autoplay back off if what lands there wants an answer.
    await this.next({ auto: true });
    if (this._autoplay) this._scheduleAuto();
  }

  /**
   * How long to dwell on the beat now showing. The author's own
   * `reveal.autoAdvanceMs` wins; otherwise it is read at roughly 350 ms a word
   * and clamped, because one-line beats still need time to land and a long one
   * should not stall the lesson.
   */
  _dwellMs() {
    const authored = Number(this._blockData?.reveal?.autoAdvanceMs);
    if (Number.isFinite(authored) && authored > 0) return authored;

    const el = this._mountedEl;
    const text = typeof el?.stepText === 'function' ? el.stepText() : '';
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const estimate = words * 350;
    const dwell = Math.min(12000, Math.max(3500, estimate));
    // A longer beat at a block boundary, so the seam is felt as a pause rather
    // than as a slide being skipped.
    return this.stepState().done ? dwell + 1200 : dwell;
  }

  // ── Narration hooks (NarrationPacer.js) ────────────────────────────────
  //
  // All feature-detected on the mounted block, like advanceStep: a block that
  // knows nothing about narration simply keeps showing itself as it is.

  /** Prose -> captions (or back) on the mounted block; new blocks mount in the same state. */
  setNarrated(on) {
    this._narrated = !!on;
    if (!this._narrated) this._sceneStates.clear();
    this._mountedEl?.setNarrated?.(this._narrated);
  }

  isNarrated() { return this._narrated; }

  /** Where the cursor is, in the terms a narration sidecar addresses. */
  narrationPosition() {
    if (!this.lessonData) return null;
    const el = this._mountedEl;
    const { step, steps } = this.stepState();
    const entry = this._mode === 'linear' ? (this.lessonData.blocks || [])[this._currentIndex] : null;
    const ref = entry?.blockRef || '';
    const blockId = this._blockData?.id ?? entry?.id ?? (ref ? String(ref).split('/').pop().replace(/\.json$/i, '') : null);
    const needsAnswer = typeof el?.isAnswered === 'function' ? !el.isAnswered() : typeof el?.evaluate === 'function';
    return {
      blockIndex: this._mode === 'linear' ? this._currentIndex : null,
      nodeId: this._mode === 'flow' ? this._currentNodeId : null,
      blockId,
      step,
      steps,
      stepId: typeof el?.stepId === 'function' ? el.stepId() : null,
      // Headings are never spoken (a beat with no audio is read without them).
      text: typeof el?.stepText === 'function' ? el.stepText({ headings: false }) : '',
      needsAnswer,
      blockType: this._blockData?.type || null,
    };
  }

  /**
   * After an answer under narration: true (the default) holds on the
   * feedback until the learner continues; a block with nothing to read after
   * its answer (a predict whose verdict is deferred) says false through its
   * optional narrationHold().
   */
  narrationHoldAfterAnswer() {
    const el = this._mountedEl;
    return typeof el?.narrationHold === 'function' ? el.narrationHold() !== false : true;
  }

  /** Shows every staged beat of the mounted block (a question's whole card). */
  revealAllSteps() {
    const el = this._mountedEl;
    if (typeof el?.revealAll === 'function' && el.revealAll()) {
      this._notifyProgress();
      this._notifyPosition();
    }
  }

  /** A narration cue reached its word: the mounted scene's onCue(id), once a beat. */
  fireSceneCue(id) {
    this._mountedEl?.fireCue?.(id);
  }

  /** The spoken word of the beat (segment, word index), for a block that lights it in its prose. */
  narrationWord(seg, wi) {
    this._mountedEl?.narrationWord?.(seg, wi);
  }

  /** Beat time for a SEEKABLE scene (`seek(beat, ms)`), if the block has one. */
  seekScene(beat, ms, opts) {
    this._mountedEl?.narrationSeek?.(beat, ms, opts);
  }

  /** Flow mode: navigate to a specific node id */
  async navigateToNode(nodeId) {
    if (this._mode !== 'flow') return;
    if (!this.lessonData.flow[nodeId]) {
      await this._complete();
      return;
    }
    this._currentNodeId = nodeId;
    await this._saveProgress();
    await this._render();
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  async _render() {
    // Narrated: a scene's control values survive leaving and coming back
    // (optional getState()/setState(), feature-detected by the block).
    if (this._narrated && this._mode === 'linear' && typeof this._mountedEl?.sceneState === 'function') {
      try {
        const st = this._mountedEl.sceneState();
        if (st !== undefined && st !== null) this._sceneStates.set(this._mountedBlockIndex, st);
      } catch { /* a scene's getState() failing must not stop navigation */ }
    }
    // Teardown previous
    if (this._mountedEl && typeof this._mountedEl.disconnectedCallback === 'function') {
      // disconnectedCallback fires automatically when removed from DOM,
      // but clear our ref
    }
    this.container.innerHTML = '';
    this._mountedEl = null;

    let blockData;
    let loadError = null;
    if (this._mode === 'linear') {
      const blocks = this.lessonData.blocks || [];
      if (this._currentIndex >= blocks.length) { await this._complete(); return; }
      blockData = blocks[this._currentIndex];

      // Resolve external reference if it's not inline
      if (blockData && blockData.blockRef) {
        try {
          EventBus.emit('content:loading', { loading: true });
          const refPath = CourseSourceManager.resolveRef(blockData.blockRef, this._bundleId);
          const finalPath = refPath.endsWith('.json') ? refPath : `${refPath}.json`;
          const loadedBlock = await ContentLoader.loadJSON(finalPath);
          blockData = { ...loadedBlock, ...blockData, type: loadedBlock.type, _resolved: true };
        } catch (e) {
          ErrorReporter.reportError(e, { component: 'LessonEngine', blockRef: blockData.blockRef });
          blockData = null;
          loadError = e;
        } finally {
          EventBus.emit('content:loading', { loading: false });
        }
      }
    } else {
      const node = this.lessonData.flow[this._currentNodeId];
      if (!node) { await this._complete(); return; }
      // Load block by reference
      try {
        EventBus.emit('content:loading', { loading: true });
        // The compact "bundle:blocks/foo" shorthand is a distinct legacy
        // convention from bundle-relative refs (colon instead of a `/`
        // marker) — kept exactly as before. Anything else goes through the
        // same resolver as blockRef.
        const path = node.block.includes(':')
          ? (() => { const basePath = node.block.replace(':', '/'); return node.block.startsWith('/') ? node.block : `/content/${basePath}${basePath.endsWith('.json') ? '' : '.json'}`; })()
          : (() => { const r = CourseSourceManager.resolveRef(node.block, this._bundleId); return r.endsWith('.json') ? r : `${r}.json`; })();
        blockData = await ContentLoader.loadJSON(path);
      } catch (e) {
        ErrorReporter.reportError(e, { component: 'LessonEngine', nodeId: this._currentNodeId });
        blockData = null;
        loadError = e;
      } finally {
        EventBus.emit('content:loading', { loading: false });
      }
    }

    if (!blockData) {
      // A draft-status block (see ContentLoader.js) isn't a load failure —
      // it's the review pipeline correctly withholding unpublished content.
      // Telling a reviewer/parent "could not be loaded" reads as a bug to
      // go chase, when the accurate story is "this slide hasn't been
      // approved yet" — a very different, non-alarming next step.
      this.container.innerHTML = loadError?.code === 'draft-content'
        ? '<p role="status">This slide is still in draft and hasn\'t been published yet.</p>'
        : '<p role="alert">Block could not be loaded.</p>';
      return;
    }

    try {
      if (BlockRegistry._registry?.[blockData.type]) {
        await BlockRegistry.loadPlugin(blockData.type);
      } else if (QuestionRegistry._registry?.[blockData.type]) {
        await QuestionRegistry.loadPlugin(blockData.type);
      } else {
        throw new Error(`Unknown plugin type: "${blockData.type}" (not found in Block or Question registries)`);
      }
      
      // `initialStep` rides on the ctx rather than being written into
      // `blockData` — the block data is content and must not be mutated by
      // playback state.
      const ctx = {
        poe: this._poe,
        blockIndex: this._mode === 'linear' ? this._currentIndex : null,
        initialStep: this._pendingStep,
        bundleId: this._bundleId,
        // reflection@1's saveResponseAs/showSavedNote need this to scope
        // ProgressStore.saveNote()/getNote() per learner.
        profileId: this.profileId,
        // 'classic' | 'story' at mount time. A plugin whose STRUCTURE differs
        // between modes reads this, then follows 'lesson-mode:changed'
        // (docs/sprints/wip/lesson-modes-plan.md); token-only styling needs
        // neither, the html[data-lesson-mode] token blocks reach it already.
        lessonMode: LessonModeManager.getMode(),
        slideHead: this.slideHead === true,
        lessonNumber: Number.isInteger(this.lessonNumber) && this.lessonNumber > 0 ? this.lessonNumber : null,
        // Narrated mode: the block mounts already showing captions, and a
        // scene gets back its own saved state (both absent otherwise).
        ...(this._narrated ? { narrated: true } : {}),
        ...(this._narrated && this._mode === 'linear' && this._sceneStates.has(this._currentIndex)
          ? { sceneState: this._sceneStates.get(this._currentIndex) } : {}),
      };
      this._pendingStep = null;
      // Resolves markdownRef/promptRef (docs/sprints/wip/dom-simulations-md-
      // prose-and-explanation-slides.md §6) before the synchronous
      // mountPlugin below — must happen here, not inside a plugin's own
      // init(), because ProgressiveDisclosureMixin's _initDisclosure() calls
      // splitSteps() synchronously and LessonEngine immediately drives the
      // block through the synchronous advanceStep/retreatStep/stepState
      // contract; an async init() would report steps:0 on the first frame.
      this._blockData = await hydrateProseRefs(blockData.data ?? blockData, this._bundleId, blockData.type);
      const boundary = mountPlugin(blockData.type, this._blockData, this.container, ctx);
      this._mountedEl = boundary?.firstElementChild ?? null;
      this._mountedBlockIndex = this._mode === 'linear' ? this._currentIndex : null;

      // Hook into block's onAnswer for flow branching
      if (this._mode === 'flow' && this._mountedEl?.onAnswer) {
        this._mountedEl.onAnswer(({ branchTag }) => {
          const node = this.lessonData.flow[this._currentNodeId];
          const next = node?.branches?.[branchTag] ?? node?.next;
          if (next) this.navigateToNode(next);
          else this._complete();
        });
      }

      // Auto-advance for flow mode without decision blocks
      if (this._mode === 'flow') {
        const node = this.lessonData.flow[this._currentNodeId];
        if (node?.next && !node.branches) {
          // Leaf node — advance after reportProgress says complete
          if (this._mountedEl?.reportProgress) {
            this._mountedEl.reportProgress(({ completed }) => {
              if (completed) setTimeout(() => this.navigateToNode(node.next), 400);
            });
          }
        }
      }
    } catch (e) {
      ErrorReporter.reportError(e, { component: 'LessonEngine', blockType: blockData.type });
    }

    // A new block may be one autoplay must not run on — a question, or
    // anything with no steps. `setAutoplay` re-checks and switches itself off,
    // telling the shell so the toggle flips rather than lying.
    if (this._autoplay) {
      if (this._canAutoplay()) this._scheduleAuto();
      else this.setAutoplay(false);
    }

    this._notifyProgress();
    A11yAnnouncer.announce(`Block ${this._progressCurrent()} of ${this._progressTotal()}`);

    // Lets AssetPrefetcher (src/core/AssetPrefetcher.js) warm the *next*
    // block's media/simulation module while the student is still looking
    // at this one, so navigating forward doesn't visibly stall on a fetch
    // — see the matching 'test:beat-changed' in TestEngine.js. Purely
    // additive: nothing here changes behavior if no listener is attached.
    EventBus.emit('lesson:beat-changed', {
      lessonId: this.lessonId,
      current: this._blockData,
      next: this._nextBlockEntries(),
    });

    this._notifyPosition();
  }

  /** See `onPositionChange`'s own doc comment — called on both a full
   *  block/node render and an intra-block beat step. */
  _notifyPosition() {
    if (this.onPositionChange) {
      this.onPositionChange({
        mode: this._mode,
        blockIndex: this._mode === 'linear' ? this._currentIndex : null,
        nodeId: this._mode === 'flow' ? this._currentNodeId : null,
        step: this.stepState().step,
      });
    }
  }

  /**
   * The block(s) that could come after the one just rendered, in the same
   * `{ data }` (already resolved, e.g. an inline block) or `{ ref }` (a
   * blockRef/flow-node path still needing a fetch) shape `_render()`
   * itself resolves from — mirrors its own blockRef/node.block resolution
   * exactly so prefetching a path always agrees with what actually loads.
   * Flow mode can have more than one reachable next node (branches), so
   * this returns an array; linear mode's array is 0 or 1 long.
   */
  _nextBlockEntries() {
    if (this._mode === 'linear') {
      const next = (this.lessonData.blocks || [])[this._currentIndex + 1];
      if (!next) return [];
      if (next.blockRef) {
        const refPath = CourseSourceManager.resolveRef(next.blockRef, this._bundleId);
        return [{ ref: refPath.endsWith('.json') ? refPath : `${refPath}.json`, bundleId: this._bundleId }];
      }
      return [{ data: next, bundleId: this._bundleId }];
    }
    const node = this.lessonData.flow?.[this._currentNodeId];
    if (!node) return [];
    const nextNodeIds = node.branches ? Object.values(node.branches) : (node.next ? [node.next] : []);
    return nextNodeIds
      .map((nodeId) => this.lessonData.flow?.[nodeId]?.block)
      .filter(Boolean)
      .map((blockRef) => {
        const path = blockRef.includes(':')
          ? (() => { const basePath = blockRef.replace(':', '/'); return blockRef.startsWith('/') ? blockRef : `/content/${basePath}${basePath.endsWith('.json') ? '' : '.json'}`; })()
          : (() => { const r = CourseSourceManager.resolveRef(blockRef, this._bundleId); return r.endsWith('.json') ? r : `${r}.json`; })();
        return { ref: path, bundleId: this._bundleId };
      });
  }

  async _complete() {
    this.setAutoplay(false);
    const mark = LookManager.brand()?.icons?.party;
    this.container.innerHTML = `<div role="status" style="text-align:center;padding:2rem"><strong>${mark ? `${mark} ` : ''}Lesson complete!</strong></div>`;
    this._completed = true;
    this._completedAt = this._completedAt ?? Date.now();
    if (!this._isPreview) {
      // Stars keep the best result across replays; an additive field on the
      // existing record, so no migration (data-model.md section 12).
      this._stars = Math.max(this._stars || 0, lessonStars(this._firstTry?.values() || []));
      await ProgressStore.put('lessonProgress', {
        ...this._progressStamp(),
        profileId: this.profileId,
        lessonId: this.lessonId,
        stars: this._stars,
        completed: true,
        completedAt: this._completedAt,
        currentIndex: this._currentIndex,
        currentNodeId: this._currentNodeId,
        timeSpentMs: Date.now() - this._startTime,
        // Both plain additive fields on an existing record — no migration
        // needed (see _saveProgress()'s own comment on this). lastUpdated
        // was missing here even though _saveProgress() already sets it,
        // erasing it exactly when a record is marked done (cross-device-sync
        // sprint, Stage 1). lastAccessedAt feeds HomeDashboard's Continue
        // Learning rail (bookshelf sprint) — a lesson finished in the same
        // visit it was opened still needs a timestamp to sort by.
        lastUpdated: Date.now(),
        lastAccessedAt: Date.now(),
      });
    }
    EventBus.emit('lesson:complete', { profileId: this.profileId, lessonId: this.lessonId });
    if (this.onComplete) this.onComplete();
  }

  // ── Progress ─────────────────────────────────────────────────────────────────

  _blockIdOf(b) {
    return b?.id ?? b?.blockRef ?? null;
  }

  /**
   * Identity fields stamped on every lessonProgress write. The writes are
   * whole-record puts, so the previously stored record is spread first to
   * keep fields this engine does not know about.
   */
  _progressStamp() {
    const d = this.lessonData || {};
    const m = String(this.lessonId || '').match(/courses\/(.+?)\//);
    const prev = this._savedRecord || {};
    const topicIds = Array.isArray(d.topicIds) ? d.topicIds : (d.topicId ? [d.topicId] : []);
    const block = this._mode === 'linear' ? (d.blocks || [])[this._currentIndex] : null;
    return {
      ...prev,
      bundleId: this._bundleId ?? (m ? m[1] : null),
      moduleId: this.moduleId ?? prev.moduleId ?? null,
      chapterId: d.chapterId ?? null,
      topicIds,
      currentBlockId: block ? this._blockIdOf(block) : (prev.currentBlockId ?? null),
    };
  }

  /** One questionAttempts row per graded answer; never throws into the lesson. */
  async _recordAttempt({ correct, score, firstTry }) {
    if (this._isPreview) return;
    try {
      const d = this.lessonData || {};
      const q = this._mountedEl?._data || {};
      const block = this._mode === 'linear' ? (d.blocks || [])[this._currentIndex] : null;
      const questionRef = block?.blockRef ?? block?.ref ?? q.id ?? null;
      const bundleId = this._bundleId ?? null;
      await ProgressStore.recordQuestionAttempt({
        profileId: this.profileId,
        questionKey: `${bundleId}::${questionRef ?? q.id ?? 'unknown'}`,
        bundleId,
        questionRef,
        questionId: q.id ?? null,
        chapterId: q.chapterId ?? d.chapterId ?? null,
        topicId: q.topicId ?? d.topicIds?.[0] ?? d.topicId ?? null,
        source: 'lesson',
        sourceId: this.lessonId,
        correct,
        score: typeof score === 'number' ? score : (correct ? 1 : 0),
        maxScore: 1,
        firstTry,
      });
    } catch (e) {
      ErrorReporter.reportError(e, { component: 'LessonEngine', op: 'recordQuestionAttempt' });
    }
  }

  _progressCurrent() {
    if (this._mode === 'linear') return this._currentIndex + 1;
    return 1; // flow mode — indeterminate
  }

  _progressTotal() {
    if (this._mode === 'linear') return (this.lessonData?.blocks || []).length;
    return null;
  }

  /**
   * Progress stays *integral*. The tempting `current = blockIndex + (step+1)/steps`
   * breaks two things at once: `ProgressBar` would render
   * `aria-valuenow="0.67"` and read out "0.67 out of 12", and any
   * `index <= 1` button test leaves Previous disabled at 0.67. The reveal
   * position travels alongside as its own value instead.
   *
   * It has to be a fresh object every call: `onProgress` assigns to Lit
   * properties, and Lit only schedules an update when a value actually
   * changes — with an integer `current` an intra-block step is three no-op
   * assignments, so the buttons and `_canCheck()` would never re-evaluate.
   */
  _notifyProgress() {
    if (this.onProgress) {
      this.onProgress(this._progressCurrent(), this._progressTotal(), {
        ...this.stepState(),
        canGoBack: this.canGoBack(),
        canGoForward: this.canGoForward(),
      });
    }
  }

  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._saveProgress(), SAVE_DEBOUNCE_MS);
  }

  async _saveProgress() {
    clearTimeout(this._saveTimer);
    if (this._isPreview) return;
    await ProgressStore.put('lessonProgress', {
      ...this._progressStamp(),
      profileId: this.profileId,
      lessonId: this.lessonId,
      currentIndex: this._currentIndex,
      currentNodeId: this._currentNodeId,
      // Plain fields on an existing record — no new store, index or keyPath,
      // so no migration is required (invariant 5 covers schema changes).
      currentStep: this.stepState().step,
      // `ProgressStore.put` is a whole-record replace, so anything omitted here
      // is *deleted*. Leaving these out meant simply re-opening a finished
      // lesson silently un-completed it.
      completed: this._completed,
      completedAt: this._completedAt,
      // Best stars so far, carried for the same whole-record-replace reason.
      ...(this._stars ? { stars: this._stars } : {}),
      lastUpdated: Date.now(),
      lastAccessedAt: Date.now(),
      timeSpentMs: Date.now() - this._startTime,
    });
  }

  destroy() {
    if (this._gradedListener) EventBus.off('question:graded', this._gradedListener);
    clearTimeout(this._saveTimer);
    this._clearAutoTimer();
    document.removeEventListener('visibilitychange', this._visibilityListener);
    this.container.innerHTML = '';
  }
}
