import { ContentLoader } from '../../core/ContentLoader.js';
import { CourseSourceManager } from '../../core/CourseSourceManager.js';
import { appUrl } from '../../core/basePath.js';
import { ProgressStore } from '../../core/ProgressStore.js';
import { QuestionRegistry } from '../../registry/QuestionRegistry.js';
import { mountPlugin } from '../../core/mountPlugin.js';
import { PRNG } from '../../core/PRNG.js';
import { EventBus } from '../../core/EventBus.js';
import { ErrorReporter } from '../../core/ErrorReporter.js';

/**
 * A question descriptor's mark value (see docs/content-authoring-guide.md's
 * Question Banks section: "`weight` is the same field ... `submit()` sums it
 * as the question's marks"). Shared by submit()'s scoring and
 * renderCurrentQuestion()'s onPositionChange so a student sees the same
 * mark value while answering that actually gets summed into maxScore —
 * every real descriptor authored so far omits weight, so this default-to-1
 * reproduces today's flat-count behavior until a descriptor sets a real one.
 */
export function resolveWeight(descriptor) {
  return typeof descriptor.weight === 'number' && descriptor.weight > 0 ? descriptor.weight : 1;
}

/**
 * The mark value to *show* the student for the current question — prefers a
 * question's own authored `marks` (e.g. structured-descriptive@1's
 * "this is a 3-mark question", the number its `rubricPoints` are sized to
 * per docs/content-authoring-guide.md's descriptive-marks convention, and
 * the same figure a real exam paper prints next to the question) since
 * that's the actual CBSE-style value, falling back to the scoring `weight`
 * above when a question doesn't author one of its own.
 */
export function resolveMarks(questionData) {
  if (typeof questionData.marks === 'number' && questionData.marks > 0) return questionData.marks;
  return resolveWeight(questionData);
}

export class TestEngine {
  constructor(profileId, testId, container) {
    this.profileId = profileId;
    this.testId = testId;
    this.container = container;
    
    this.testData = null;
    this.currentIndex = 0;
    this.attemptId = null;
    this.seed = null;
    this.prng = null;
    this.answers = {};
    this.mountedPlugins = new Map();
    this._resolvedQuestions = new Map(); // Cache for resolved 'fixed' type references

    // Set by _loadCompletedAttemptForReview() when init({reviewMode:true})
    // finds a past completed attempt — TestSession reads this right after
    // init() resolves and, if set, jumps straight to its results screen
    // instead of the normal in-progress question flow. `_isReviewOnly` is
    // the accompanying guard that keeps a reviewed attempt read-only (no
    // autosave, no live-interaction writes) — see _handleInteraction()/
    // saveProgress() below.
    this.reviewResults = null;
    this._isReviewOnly = false;

    this.onProgress = null;
    this.onComplete = null;
    // Fired from renderCurrentQuestion() with `{ itemIndex, marks }` — lets
    // TestSession keep the URL (`#/test/...?item=`) in sync (same pattern as
    // LessonEngine.onPositionChange) and show the current question's mark
    // value.
    this.onPositionChange = null;

    this._interactionHandler = this._handleInteraction.bind(this);
  }

  /**
   * @param {{itemIndex?: number}} [opts] An explicit deep-linked question
   *   index (from the URL) — applied after attempt-resume, so a URL a
   *   student was actually given wins over "resume where you left off".
   *   Ignored if out of range, same graceful-degradation spirit as
   *   LessonEngine.init()'s own opts.
   */
  async init(opts = {}) {
    // Same detection ContentLoader.loadJSON() already uses for the ai-draft
    // filter — reused here so previewing a draft test doesn't also silently
    // create/advance a real testAttempts record for this profile. See
    // saveProgress()/submit() below.
    this._isPreview = window.location.search.includes('preview=true') || window.location.hash.includes('preview=true');

    if (this.testId.startsWith('practice:')) {
      // A parent-built practice test: never published content, so there's
      // no manifest.json/bundle to fetch it from — it's a row this profile
      // itself wrote to the practiceTests store (see PracticeTestBuilder.js).
      // Its questions were pooled from possibly many different course
      // bundles, so — unlike every other test, which lives inside exactly
      // one bundle — there is no single `this._bundleId` for the whole
      // engine; each descriptor below carries its own instead (see
      // _resolveQuestion/_resolveRefPath/_describeNextQuestion and
      // renderCurrentQuestion's mountPlugin ctx).
      const practiceTestId = this.testId.slice('practice:'.length);
      const def = await ProgressStore.get('practiceTests', [this.profileId, practiceTestId]);
      if (!def || !def.questions || def.questions.length === 0) {
        throw new Error(`Practice test "${practiceTestId}" was not found for this profile.`);
      }
      this.testData = { id: this.testId, title: def.title, questions: def.questions };
      this._bundleId = null;
    } else {
      // 1. Fetch test payload
      const basePath = this.testId.replace(':', '/');
      const path = basePath.startsWith('/') ? basePath :
                   (basePath.startsWith('content/') ? `/${basePath}` : `/content/${basePath}`);
      const finalPath = path.endsWith('.json') ? path : `${path}.json`;
      // See LessonEngine's identical field for why — resolves a shared simId
      // to THIS test's own bundle rather than whichever bundle registered
      // first.
      this._bundleId = CourseSourceManager.deriveBundleId(finalPath);
      EventBus.emit('content:loading', { loading: true });
      try {
        this.testData = await ContentLoader.loadJSON(finalPath);
      } finally {
        EventBus.emit('content:loading', { loading: false });
      }
    }

    if (!this.testData || !this.testData.questions || this.testData.questions.length === 0) {
      throw new Error("Test data is invalid or empty.");
    }

    // Offline (D18): OfflinePrefetcher caches every question of this test
    // in the background, not only the ones answered while online.
    EventBus.emit('test:opened', {
      testId: this.testId,
      entries: this.testData.questions.map((d) => this._describeNextQuestion(d)),
    });

    // 2. Reviewing a past attempt (from a "Review results" link, never the
    // default) takes priority over the normal resume-or-start flow below —
    // it must not touch the active-attempt meta pointer or wipe anything.
    if (opts.reviewMode) {
      this._isReviewOnly = await this._loadCompletedAttemptForReview();
    }

    if (!this._isReviewOnly) {
      // Look for an active (in-progress) attempt in ProgressStore
      const activeAttemptKey = `active_${this.profileId}_${this.testId}`;
      const activeAttemptMeta = await ProgressStore.get('meta', activeAttemptKey);

      if (activeAttemptMeta && activeAttemptMeta.value) {
        // Resume
        this.attemptId = activeAttemptMeta.value.attemptId;
        const record = await ProgressStore.get('testAttempts', [this.profileId, this.attemptId]);
        if (record) {
          this.seed = record.seed;
          this.currentIndex = record.currentIndex || 0;
          this.answers = record.answers || {};
        }
      } else {
        // New attempt. Only one attempt per (profile, test) is ever kept —
        // "if they retake the test then history is wiped" — so a genuine
        // retake (as opposed to a first-ever attempt, where this is a
        // harmless no-op) clears out whatever completed attempt(s) already
        // exist for this test before starting the fresh one.
        if (!this._isPreview) {
          const priorAttempts = await ProgressStore.getAllFromIndex('testAttempts', 'by_profile_test', [this.profileId, this.testId]);
          for (const prior of priorAttempts) {
            if (prior.completedAt) await ProgressStore.delete('testAttempts', [this.profileId, prior.attemptId]);
          }
        }

        this.attemptId = `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        this.seed = (Math.random() * 4294967296) >>> 0;
        this.currentIndex = 0;
        this.answers = {};

        if (!this._isPreview) {
          await ProgressStore.put('meta', { key: activeAttemptKey, value: { attemptId: this.attemptId } });
        }
        await this.saveProgress();
      }
    }

    if (Number.isInteger(opts.itemIndex) && opts.itemIndex >= 0 && opts.itemIndex < this.testData.questions.length) {
      this.currentIndex = opts.itemIndex;
    }

    this.prng = new PRNG(this.seed);
    EventBus.on('interaction:question', this._interactionHandler);

    await this.renderCurrentQuestion();
  }

  /**
   * Finds this profile's most recently completed attempt at this test (via
   * the `by_profile_test` index — same store, no schema change needed) and,
   * if one exists, seeds this engine from it so renderCurrentQuestion()/
   * evaluate() reproduce exactly what was submitted. Returns whether one was
   * found; the caller (init()) falls back to the normal resume-or-start flow
   * when it wasn't (e.g. a stale "Review" link for a test never finished).
   */
  async _loadCompletedAttemptForReview() {
    const attempts = await ProgressStore.getAllFromIndex('testAttempts', 'by_profile_test', [this.profileId, this.testId]);
    const completed = attempts.filter((a) => a.completedAt).sort((a, b) => b.completedAt - a.completedAt)[0];
    if (!completed) return false;
    this.attemptId = completed.attemptId;
    this.seed = completed.seed;
    this.currentIndex = 0;
    this.answers = completed.answers || {};

    // Regrade against whatever content is live right now, rather than
    // trusting the `results`/`totalScore` this attempt was saved with — a
    // content fix (wrong answer-key field name, bad correctOrder, etc.)
    // shipped after this attempt was submitted must not leave the student's
    // review permanently showing the old, wrong verdict. Cheap: this is the
    // same per-question headless re-instantiation submit() already does,
    // just driven by the saved answers instead of a fresh submission.
    this.reviewResults = await this._computeResults();
    if (this.reviewResults.totalScore !== completed.totalScore || this.reviewResults.maxScore !== completed.maxScore) {
      await ProgressStore.put('testAttempts', { ...completed, ...this.reviewResults });
    }
    return true;
  }

  /**
   * Headless per-question scoring loop shared by submit() (a live
   * submission) and _loadCompletedAttemptForReview() (regrading a past one)
   * — both need exactly the same seeded-PRNG reinit + setState(saved
   * answer) + evaluate() sequence, against whatever `this.answers` holds.
   *
   * `results` is keyed by the question's *position* in `testData.questions`
   * (stringified index), NOT by the content's own `id` field. Two reasons,
   * both observed in production:
   *  1. A question bank's `id` (e.g. "q-bank-055") is only unique within its
   *     own course bundle — nothing namespaces it across bundles — so a
   *     practice test that pools questions from more than one bundle (the
   *     normal case) can easily draw two different questions that happen to
   *     share the same `id`. Keying by id let the second one's result
   *     silently overwrite the first's, so review would show one question's
   *     answer/verdict next to a completely unrelated question's score.
   *  2. A question whose ref fails to resolve was previously skipped
   *     entirely (`continue`, no entry), which shifted every later
   *     question's position in `Object.keys(results)` relative to its true
   *     `testData.questions` index (the index `TestEngine.jumpTo(idx)` and
   *     TestSession's review navigation actually use) — same
   *     wrong-score-next-to-right-question symptom, different trigger.
   * Indexing by position makes both classes of bug structurally impossible:
   * every question gets its own guaranteed-unique, guaranteed-in-order slot
   * regardless of what `id` it carries or whether it resolved at all. The
   * original content `id` still rides along inside each entry (`id: q.id`)
   * for display/debugging, just never as the key.
   */
  async _computeResults({ record = false } = {}) {
    let totalScore = 0;
    let maxScore = 0;
    const results = {};

    for (let i = 0; i < this.testData.questions.length; i++) {
      const descriptor = this.testData.questions[i];
      const q = await this._resolveQuestion(descriptor);
      const key = String(i);
      if (!q) {
        // Unresolvable reference — still occupies its slot instead of being
        // skipped (see doc comment above).
        const weight = resolveWeight(descriptor);
        maxScore += weight;
        results[key] = { score: 0, isCorrect: false, unresolved: true, maxMarks: weight, earnedMarks: 0 };
        continue;
      }
      const weight = resolveWeight(q);
      maxScore += weight;
      const localPrng = new PRNG(this.seed + i);

      await QuestionRegistry.loadPlugin(q.type);
      const tempEl = document.createElement(q.type.split('@')[0] + '-v' + q.type.split('@')[1]); // crude resolve
      if (typeof tempEl.init === 'function') {
        const initResult = tempEl.init(q, localPrng);
        if (initResult instanceof Promise) {
          await initResult;
        }
      }
      // Keyed by position, with a fallback to the old id-based key for an
      // attempt already in progress when this fix shipped — see
      // renderCurrentQuestion()'s identical fallback and _handleInteraction()'s
      // doc comment for why position (not `q.id`) is the correct key.
      const savedState = this.answers[key] ?? this.answers[q.id];
      if (typeof tempEl.setState === 'function' && savedState) {
        tempEl.setState(savedState);
      }

      let res = { score: 0, isCorrect: false };
      if (typeof tempEl.evaluate === 'function') {
         // `await` is a no-op for every existing plugin's synchronous
         // evaluate() — only benefits an async one (e.g. plot-function@1's
         // worker-sandboxed formula evaluation). Without it here, an async
         // evaluate() would resolve to a Promise object instead of a real
         // { score, isCorrect } result, silently corrupting totalScore
         // below (`+= undefined` → NaN) for the whole test attempt.
         res = await tempEl.evaluate();
      }

      // `maxMarks`/`earnedMarks` ride alongside the plugin's own raw
      // { score, isCorrect } result so TestSession's per-question review
      // breakdown can show each question's actual marks without having to
      // re-resolve `weight` itself or duplicate this multiplication. `id`
      // rides along too, for display/debugging only — see this method's doc
      // comment for why it's never the key.
      results[key] = { ...res, id: q.id, maxMarks: weight, earnedMarks: (res.score || 0) * weight };
      totalScore += res.score * weight;

      if (record) {
        // One row per graded question, written only on submit (review
        // re-computes results and must not double-count). Never breaks the test.
        try {
          const bundleId = descriptor.bundleId || q._bundleId || this._bundleId || null;
          const questionRef = descriptor.ref ?? q.id ?? null;
          const isPractice = this.testId.startsWith('practice:');
          await ProgressStore.recordQuestionAttempt({
            profileId: this.profileId,
            questionKey: `${bundleId}::${questionRef ?? q.id}`,
            bundleId,
            questionRef,
            questionId: q.id ?? null,
            chapterId: q.chapterId ?? descriptor.chapterId ?? this.testData.chapterId ?? null,
            topicId: q.topicId ?? descriptor.topicId ?? null,
            source: isPractice ? 'practice' : 'test',
            sourceId: this.testId,
            correct: !!res.isCorrect,
            score: (res.score || 0) * weight,
            maxScore: weight,
            firstTry: true,
          });
        } catch (e) {
          ErrorReporter.reportError(e, { component: 'TestEngine', op: 'recordQuestionAttempt' });
        }
      }
    }

    return { totalScore, maxScore, results };
  }

  _handleInteraction(payload) {
    if (this._isReviewOnly) return; // read-only — never overwrite a completed attempt's record
    if (!payload.questionId) return;
    // Keyed by this question's *position* in the test (this.currentIndex),
    // not `payload.questionId` (the content's own `id`) — see
    // _computeResults()'s doc comment: a bank id is only unique within its
    // own course bundle, so a practice test pooling from more than one
    // bundle can draw two different questions sharing the same id, and
    // keying by id let one's saved answer silently overwrite the other's.
    // Only the currently-mounted top-level question can ever fire this
    // event (mountedPlugins holds exactly one entry at a time, cleared on
    // every renderCurrentQuestion()), so `this.currentIndex` is always the
    // right slot regardless of what `payload.questionId` says.
    this.answers[String(this.currentIndex)] = payload.state;
    this.saveProgress(); // async fire and forget
  }

  async renderCurrentQuestion() {
    this.container.innerHTML = '';
    this.mountedPlugins.clear();

    if (this.currentIndex >= this.testData.questions.length) {
      // At the end, don't render, just wait for submit
      if (this.onProgress) {
        this.onProgress(this.testData.questions.length, this.testData.questions.length);
      }
      return;
    }

    let questionData = this.testData.questions[this.currentIndex];
    questionData = await this._resolveQuestion(questionData);
    if (!questionData) {
      // Same reasoning as LessonEngine's identical branch: a draft-status
      // question is the review pipeline working as intended, not a load
      // failure — surface that distinction instead of leaving a blank
      // container (the previous behavior) or an alarming generic message.
      this.container.innerHTML = this._lastResolveError?.code === 'draft-content'
        ? '<p role="status">This question is still in draft and hasn\'t been published yet.</p>'
        : '<p role="alert">Question could not be loaded.</p>';
      return;
    }
    questionData = { ...questionData, hideHints: true };
    
    // We must reset the PRNG to ensure the same question gets the same sequence
    // of random numbers every time it's visited, based on the global seed + question index
    const questionSeed = this.seed + this.currentIndex;
    const localPrng = new PRNG(questionSeed);

    await QuestionRegistry.loadPlugin(questionData.type);

    const boundary = mountPlugin(questionData.type, questionData, this.container, localPrng, { bundleId: questionData._bundleId || this._bundleId });
    const pluginEl = boundary.firstElementChild;

    // Some plugins lazy-load heavy vendors inside an async init() (e.g.
    // equation-input@1's ComputeEngine/MathLive) — wait for that before
    // this method's own promise resolves. Without this, TestSession's
    // review mode (_reviewGoto in TestSession.js) calls evaluate() on
    // pluginEl right after jumpTo() returns; evaluate() would find the
    // vendor not loaded yet, throw inside its ComputeEngine parse, and
    // silently fall back to a naive string compare that rejects any
    // mathematically-equivalent-but-differently-formatted answer (e.g.
    // \frac23 vs \frac{2}{3}) even though it's correct.
    await boundary.pluginReady;

    // Restore previous state if any — keyed by position (see
    // _handleInteraction()'s doc comment); the `?? this.answers[questionData.id]`
    // fallback is a one-time migration path for an attempt already in
    // progress when this fix shipped, whose saved answers still use the old
    // id-based keys.
    const posKey = String(this.currentIndex);
    const savedState = this.answers[posKey] ?? this.answers[questionData.id];
    if (savedState && typeof pluginEl.setState === 'function') {
      pluginEl.setState(savedState);
    }

    this.mountedPlugins.set(posKey, pluginEl);

    if (this.onProgress) {
      this.onProgress(this.currentIndex + 1, this.testData.questions.length);
    }
    if (this.onPositionChange) {
      // `marks` lets TestSession show "this question is worth N marks" —
      // see resolveMarks()'s doc comment for how it differs from the
      // scoring `weight` submit() sums into maxScore.
      this.onPositionChange({ itemIndex: this.currentIndex, marks: resolveMarks(questionData) });
    }

    // Lets AssetPrefetcher (src/core/AssetPrefetcher.js) warm the next
    // question's media/simulation while the student is still on this one —
    // see the matching 'lesson:beat-changed' in LessonEngine.js.
    const nextDescriptor = this.testData.questions[this.currentIndex + 1];
    EventBus.emit('test:beat-changed', {
      testId: this.testId,
      current: questionData,
      next: nextDescriptor ? [this._describeNextQuestion(nextDescriptor)] : [],
      // The next two questions (Q-45), fetched ahead by OfflinePrefetcher.
      ahead: this.testData.questions.slice(this.currentIndex + 1, this.currentIndex + 3).map((d) => this._describeNextQuestion(d)),
    });
  }

  /**
   * A bare "content/foo.json" (no leading slash, but already rooted at
   * content/) is a distinct legacy shorthand from a genuinely bundle-
   * relative ref like "questions/foo.json" — kept exactly as before, ahead
   * of the new resolver.
   *
   * `bundleId` is optional and falls back to `this._bundleId` — a practice
   * test has no single engine-wide bundle (see init()), so each descriptor
   * carries its own instead (a bank-pooled question ref is only meaningful
   * relative to whichever bundle's bank it came from).
   */
  _resolveRefPath(ref, bundleId = this._bundleId) {
    // The `content/`-prefixed branch is a legacy local-only shorthand,
    // deliberately kept separate from resolveRef()'s bundle-relative case
    // (which would instead try to resolve it against a remote bundle's own
    // origin — a different meaning entirely). Still root-absolute-shaped
    // internally though, which broke at a subdirectory deployment until
    // routed through appUrl() (cross-device-sync sprint, Stage 2).
    return ref.startsWith('content/') ? appUrl(ref) : CourseSourceManager.resolveRef(ref, bundleId);
  }

  /** Same `{ data }` / `{ ref }` shape LessonEngine._nextBlockEntries() uses. */
  _describeNextQuestion(descriptor) {
    const bundleId = descriptor.bundleId || this._bundleId;
    if (descriptor.type !== 'fixed' || !descriptor.ref) return { data: descriptor, bundleId };
    const refPath = this._resolveRefPath(descriptor.ref, bundleId);
    return { ref: refPath.endsWith('.json') ? refPath : `${refPath}.json`, bundleId };
  }

  async next() {
    // Before moving, save current state locally
    this._syncMountedState();
    
    if (this.currentIndex < this.testData.questions.length) {
      this.currentIndex++;
      await this.saveProgress();
      await this.renderCurrentQuestion();
    }
  }

  async previous() {
    this._syncMountedState();
    
    if (this.currentIndex > 0) {
      this.currentIndex--;
      await this.saveProgress();
      await this.renderCurrentQuestion();
    }
  }

  /** Jump to an arbitrary question index — used in review mode, and by
   *  TestSession when the browser's Back/Forward crosses a deep-linked item
   *  index during a still-live (not yet submitted) attempt. That second case
   *  used to sync the mounted plugin's state into memory and then never
   *  persist it, so a browser-nav jump away from a question could silently
   *  drop its answer (cross-device-sync sprint, Stage 1). saveProgress()
   *  already no-ops under `_isPreview`/`_isReviewOnly`, so this is safe to
   *  call unconditionally for both callers. */
  async jumpTo(idx) {
    if (!this.testData || idx < 0 || idx >= this.testData.questions.length) return;
    this._syncMountedState();
    await this.saveProgress();
    this.currentIndex = idx;
    await this.renderCurrentQuestion();
  }

  _syncMountedState() {
    // Keyed by position — see _handleInteraction()'s doc comment.
    // mountedPlugins only ever holds the one currently-rendered question
    // (cleared at the top of every renderCurrentQuestion()), keyed by that
    // same position since renderCurrentQuestion() sets it.
    for (const [posKey, plugin] of this.mountedPlugins.entries()) {
      if (typeof plugin.getState === 'function') {
        this.answers[posKey] = plugin.getState();
      }
    }
  }

  /**
   * Resolves a question descriptor — if it's a 'fixed' reference, fetches the real payload
   * and caches the result so submit() can use it without re-fetching.
   */
  async _resolveQuestion(descriptor) {
    if (descriptor.type !== 'fixed' || !descriptor.ref) return descriptor;
    const bundleId = descriptor.bundleId || this._bundleId;
    // Keyed by bundleId+ref, not ref alone: a practice test pools questions
    // from possibly many different course bundles (see init()'s own comment
    // above), and two bundles' banks can easily share the same relative ref
    // path (e.g. both authoring "questions/q1.json"). Keying by ref alone
    // let whichever bundle got resolved first for a given ref silently win
    // the cache for every other position sharing that ref — served as a
    // different/mismatched question depending on visitation order (e.g.
    // sequential play vs. a resume/deep-link landing on a later index).
    const cacheKey = `${bundleId}::${descriptor.ref}`;
    if (this._resolvedQuestions.has(cacheKey)) {
      return this._resolvedQuestions.get(cacheKey);
    }
    try {
      EventBus.emit('content:loading', { loading: true });
      const refPath = this._resolveRefPath(descriptor.ref, bundleId);
      const finalPath = refPath.endsWith('.json') ? refPath : `${refPath}.json`;
      const loadedQ = await ContentLoader.loadJSON(finalPath);
      // Stashed onto the resolved object (not just kept in this closure) so
      // renderCurrentQuestion() — which only ever sees the resolved question,
      // not the original descriptor — can still thread the right bundleId
      // into mountPlugin's ctx for its own image.src/explanationSlide refs.
      const resolved = { ...loadedQ, ...descriptor, type: loadedQ.type, _resolved: true, _bundleId: bundleId };
      this._resolvedQuestions.set(cacheKey, resolved);
      this._lastResolveError = null;
      return resolved;
    } catch (e) {
      console.error(`Failed to resolve question ref: ${descriptor.ref}`, e);
      // Stashed (rather than thrown) so renderCurrentQuestion() — the only
      // caller that needs to tell a student/reviewer apart a draft-status
      // question from a genuine load failure — can read it after the fact;
      // submit()'s own scoring loop just needs the null/skip behavior.
      this._lastResolveError = e;
      return null;
    } finally {
      EventBus.emit('content:loading', { loading: false });
    }
  }

  async submit() {
    this._syncMountedState();
    EventBus.off('interaction:question', this._interactionHandler);

    const { totalScore, maxScore, results } = await this._computeResults({ record: !this._isPreview });

    if (!this._isPreview) {
      // Save final record
      await ProgressStore.put('testAttempts', {
        profileId: this.profileId,
        attemptId: this.attemptId,
        testId: this.testId,
        seed: this.seed,
        currentIndex: this.currentIndex,
        answers: this.answers,
        results: results,
        totalScore: totalScore,
        maxScore: maxScore, // needed to reconstruct the score later — see _loadCompletedAttemptForReview()
        completedAt: Date.now(),
        // Both plain additive fields — no migration needed. lastUpdated was
        // missing on this final write even though saveProgress() already
        // sets it on every in-progress save, erasing it exactly when the
        // record is marked done (cross-device-sync sprint, Stage 1).
        // lastAccessedAt feeds HomeDashboard's Continue Learning rail
        // (bookshelf sprint).
        lastUpdated: Date.now(),
        lastAccessedAt: Date.now(),
      });

      // Clear active attempt meta
      const activeAttemptKey = `active_${this.profileId}_${this.testId}`;
      await ProgressStore.delete('meta', activeAttemptKey);
    }

    // From this point on, this engine instance is done — any further
    // navigation is the results screen letting the student look back over
    // their answers, never new editing. Without this, TestSession's own
    // results-screen mount immediately calls jumpTo() (to show the first
    // reviewed item), and jumpTo() calls saveProgress() (added in the
    // cross-device-sync sprint, Stage 1, to fix a *different* bug — losing
    // an answer on a live in-progress jump) — saveProgress()'s whole-record
    // put has no completedAt/results/totalScore/maxScore fields, so it
    // immediately overwrote the record this method just finished writing,
    // silently downgrading a just-submitted attempt back to "in progress"
    // and erasing its score forever. `_isReviewOnly` is exactly the
    // existing "never write to this attempt again" guard both
    // saveProgress() and _handleInteraction() already respect.
    this._isReviewOnly = true;

    // Mirrors LessonEngine's own 'lesson:complete'. GamificationService needs
    // attemptId so the award is idempotent per attempt (migration 007).
    EventBus.emit('test:complete', {
      profileId: this.profileId,
      testId: this.testId,
      attemptId: this.attemptId,
      totalScore,
      maxScore,
    });

    if (this.onComplete) {
      this.onComplete({ totalScore, maxScore, results });
    }

    return { totalScore, maxScore, results };
  }

  async saveProgress() {
    if (this._isPreview || this._isReviewOnly) return;
    await ProgressStore.put('testAttempts', {
      profileId: this.profileId,
      attemptId: this.attemptId,
      testId: this.testId,
      seed: this.seed,
      currentIndex: this.currentIndex,
      answers: this.answers,
      lastUpdated: Date.now(),
      lastAccessedAt: Date.now(),
    });
  }
}
