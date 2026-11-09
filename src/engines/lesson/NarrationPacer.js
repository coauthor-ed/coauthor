/**
 * NarrationPacer: narrated mode for a lesson that carries `narrationRef`
 * (PLAN.md W1, "one lesson, one cursor, two ways of moving it").
 *
 * There is no second renderer. Narrated mode is the normal lesson view plus
 * this pacer: it plays each beat's audio and, when the audio ends, moves the
 * one LessonEngine cursor on with the same `next({ auto: true })` the
 * autoplay timer uses. Switching between text and narrated mode never moves
 * the cursor and never remounts a block or a scene: it only starts or stops
 * the audio and tells the mounted block to swap its prose for captions
 * (`engine.setNarrated()`).
 *
 * - A beat with a segment plays its audio; word timings drive the captions;
 *   `cues` fire the scene's `onCue(id)` at their time (shared with the text
 *   mode's CUE anchors, so each cue fires once a beat in either mode).
 * - A beat with no segment is read on a timer (words / 3 per second), so a
 *   partly narrated lesson still flows.
 * - A question (`await: "answer"`, or any block still waiting for an answer)
 *   is one beat however its stem is staged: the prompt is spoken, its whole
 *   card is shown (a poe-predict's options appear when the prompt ends), and
 *   the pacer waits for the answer. Once graded it holds on the feedback
 *   (`waiting: 'continue'`) until the learner presses Continue; a predict
 *   with a deferred verdict has nothing to read, so it moves on after a short
 *   pause (the block's optional narrationHold(), via the engine).
 * - `await: "interact"` holds after the audio, with a "Your turn" hint and
 *   Skip, until the scene says the learner did it: a DOM
 *   `scene-interact-done` event (CustomEvent, bubbles + composed) from the
 *   block, forwarded by LessonSession to interactDone(), or the older bus
 *   signals cue:found / cue:game-solved.
 * - Headings are never spoken: a segment marked `kind: "heading"` (or
 *   `heading: true`) is passed over at once, and the timed fallback reads the
 *   beat without its heading lines (LessonEngine.narrationPosition()).
 * - Pause and resume; a hidden tab pauses. Audio is streamed by a plain
 *   media element, never precached (sw.js keeps a same-origin file once
 *   played, and answers its range requests from that copy).
 *
 * Business logic, so it lives with the engine (invariant 8): LessonSession
 * only renders the state this publishes and forwards the learner's presses.
 * Everything the browser provides arrives through `env`, so the unit tests
 * drive it with a fake clock and a fake audio element.
 */
import {
  indexSegments, findSegment, wordIndexAt, timedSegment, dueCues, buildTimeline, timelineIndexOf,
} from '../../core/narration/narrationModel.js';

export const NARRATION_RATES = [0.85, 1, 1.15];
/** The DOM event a scene dispatches when the learner did what an
 *  `await: "interact"` beat asked (bubbles + composed; LessonSession forwards it). */
export const SCENE_INTERACT_DONE = 'scene-interact-done';
/** After a graded answer: long enough to see the verdict land. */
const AFTER_ANSWER_MS = { right: 1600, wrong: 3800 };
const TICK_MS = 120;

/** One key per mounted block (linear index, or flow node). */
const blockKey = (pos) => `${pos.blockIndex ?? ''}|${pos.nodeId ?? ''}|${pos.blockId ?? ''}`;
const isPredict = (pos) => /^poe-predict@/.test(String(pos?.blockType || ''));
/** A segment that is only a heading: never spoken. */
const isHeading = (seg) => !!seg && (seg.kind === 'heading' || seg.heading === true);

function browserEnv() {
  return {
    createAudio: () => { const a = new Audio(); a.preload = 'auto'; return a; },
    setTimeout: (f, ms) => setTimeout(f, ms),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (f, ms) => setInterval(f, ms),
    clearInterval: (id) => clearInterval(id),
    now: () => performance.now(),
    doc: typeof document !== 'undefined' ? document : null,
    bus: null,
  };
}

export class NarrationPacer {
  /**
   * @param {object} engine  a LessonEngine (or a stand-in with the same calls:
   *   narrationPosition(), next({auto}), seekTo(pos), setNarrated(on),
   *   setAutoplay(on), revealAllSteps(), fireSceneCue(id), seekScene(beat, ms),
   *   hasUnansweredQuestion(), lessonData)
   * @param {object} sidecar  the parsed coauthor-narration@1 file
   * @param {{ audioBase?: (rel: string) => string, env?: object, bus?: object }} [opts]
   *   audioBase resolves a segment's `audio` (relative to the sidecar).
   *   bus: the EventBus, for question:graded / poe:prediction-submitted /
   *   cue:found / cue:game-solved.
   */
  constructor(engine, sidecar, { audioBase = (p) => p, env = null, bus = null } = {}) {
    this.engine = engine;
    this.sidecar = sidecar;
    this.index = indexSegments(sidecar);
    this.audioBase = audioBase;
    this.env = { ...browserEnv(), ...(env || {}) };
    this.bus = bus || this.env.bus;
    this.narrated = false;
    this.playing = false;
    this.rate = 1;
    this.waiting = null;          // null | 'answer' | 'interact' | 'continue'
    this.blocked = false;         // the browser refused to start audio
    this.ended = false;           // the lesson finished under narration
    this._key = null;             // `${blockIndex}:${step}` of the loaded beat
    this._pos = null;
    this._seg = null;             // segment (real or timed stand-in) of this beat
    this._offset = 0;             // media ms into this beat
    this._startedAt = 0;          // env.now() when the current run started
    this._fired = new Set();
    this._answered = false;
    this._holdAfter = false;      // answered, and the feedback wants reading
    this._interacted = false;
    this._promptBlock = null;     // block key of a question shown as one beat
    this._knownIds = new Map();
    this._listeners = new Set();
    this._timer = null;
    this._tick = null;
    this._afterTimer = null;
    this._audio = null;
    this._audioSrc = '';

    const doc = this.env.doc;
    this._onVisibility = () => { if (doc?.hidden && this.playing) this.pause(); };
    doc?.addEventListener?.('visibilitychange', this._onVisibility);

    this._onGraded = (p = {}) => {
      if (p.lessonId && engine.lessonId && p.lessonId !== engine.lessonId) return;
      this._onAnswer(!!p.correct);
    };
    this._onPredict = (p = {}) => this._onAnswer(!!p.isCorrect);
    this._onInteract = () => this._onInteracted();
    if (this.bus) {
      this.bus.on('question:graded', this._onGraded);
      this.bus.on('poe:prediction-submitted', this._onPredict);
      this.bus.on('cue:found', this._onInteract);
      this.bus.on('cue:game-solved', this._onInteract);
    }
  }

  // ── state out ──────────────────────────────────────────────────────────

  /** @param {(state: object) => void} fn  called on every change; returns an unsubscribe. */
  subscribe(fn) {
    this._listeners.add(fn);
    fn(this.state());
    return () => this._listeners.delete(fn);
  }

  state() {
    const seg = this._seg;
    const ms = this._mediaMs();
    const timeline = this.timeline();
    const pos = this._pos;
    return {
      narrated: this.narrated,
      playing: this.playing,
      waiting: this.waiting,
      blocked: this.blocked,
      ended: this.ended,
      rate: this.rate,
      segment: seg,
      timed: !!seg?.timed,
      ms,
      durationMs: seg ? (seg.durationMs || 0) : 0,
      wordIndex: seg ? wordIndexAt(seg.words, ms) : -1,
      timeline,
      timelineIndex: pos ? timelineIndexOf(timeline, { blockIndex: pos.blockIndex, beatIndex: pos.step }) : -1,
    };
  }

  _emit() {
    const s = this.state();
    // The spoken word, for a block that lights it in its own prose (a text slide).
    const hlSeg = this.narrated ? s.segment : null;
    const hlWi = hlSeg ? s.wordIndex : -1;
    if (hlSeg !== this._hlSeg || hlWi !== this._hlWi) {
      this._hlSeg = hlSeg;
      this._hlWi = hlWi;
      try { this.engine.narrationWord?.(hlSeg, hlWi); } catch (e) { console.error('narration word', e); }
    }
    for (const fn of this._listeners) {
      try { fn(s); } catch (e) { console.error('narration listener', e); }
    }
  }

  timeline() {
    if (!this._timelineCache || this._timelineIds !== this._knownIds.size) {
      this._timelineIds = this._knownIds.size;
      this._timelineCache = buildTimeline(this.engine.lessonData?.blocks || [], this.index, this._knownIds);
    }
    return this._timelineCache;
  }

  // ── mode switch (never moves the cursor) ────────────────────────────────

  setNarrated(on) {
    on = !!on;
    if (on === this.narrated) return;
    if (on) {
      this.narrated = true;
      this.ended = false;
      this.engine.setAutoplay?.(false);
      this.engine.setNarrated?.(true);
      this._sync(this.engine.narrationPosition?.());
      // Switched on while a question was already loaded: show its whole card now.
      if (this._pos?.needsAnswer && !isPredict(this._pos)) this.engine.revealAllSteps?.();
      this.play();
    } else {
      this.pause();
      this.narrated = false;
      this.waiting = null;
      this._clearAfter();
      this.engine.setNarrated?.(false);
      this._emit();
    }
  }

  // ── transport ──────────────────────────────────────────────────────────

  play() {
    if (!this.narrated) { this.setNarrated(true); return; }
    if (this.ended) return;
    this.playing = true;
    this.blocked = false;
    if (!this._seg) this._sync(this.engine.narrationPosition?.());
    if (this.waiting) { this._emit(); return; }
    this._run();
  }

  pause() {
    if (!this.playing) return;
    this._offset = this._mediaMs();
    this.playing = false;
    this._stopRun();
    this._clearAfter();
    this._emit();
  }

  toggle() {
    if (this.waiting === 'interact' || this.waiting === 'continue') { this.continueFromWait(); return; }
    if (this.playing) this.pause(); else this.play();
  }

  setRate(r) {
    const next = NARRATION_RATES.includes(r) ? r : 1;
    if (next === this.rate) return;
    const wasRunning = this.playing && !this.waiting;
    if (wasRunning) { this._offset = this._mediaMs(); this._stopRun(); }
    this.rate = next;
    if (this._audio) this._audio.playbackRate = next;
    if (wasRunning) this._run();
    else this._emit();
  }

  /** Scrubber: jump the cursor to timeline entry i (in place inside a block). */
  seekTimeline(i) {
    const e = this.timeline()[i];
    if (!e) return;
    this.engine.seekTo?.({ blockIndex: e.blockIndex, beatIndex: e.beatIndex, inPlace: true });
  }

  /** Back to the start of the current beat. */
  restartBeat() {
    this._offset = 0;
    this._fired = new Set();
    if (this.playing && !this.waiting) { this._stopRun(); this._run(); } else this._emit();
  }

  // ── cursor in ──────────────────────────────────────────────────────────

  /**
   * LessonSession forwards every engine position change here (block render
   * and beat step alike). A new beat loads its segment and, while playing,
   * starts it; a repeat of the same position is ignored.
   */
  onPosition(pos) {
    this._sync(pos);
  }

  /** The lesson finished (engine onComplete): narration stops there. */
  onComplete() {
    this.ended = true;
    this.playing = false;
    this.waiting = null;
    this._stopRun();
    this._clearAfter();
    this._emit();
  }

  _sync(pos) {
    if (!pos) return;
    if (pos.blockId) this._knownIds.set(pos.blockIndex, pos.blockId);
    const key = `${pos.blockIndex}:${pos.step}`;
    if (key === this._key) { this._pos = pos; return; }
    // A question is one beat: revealing its staged stem (or an answer that
    // changes its step) must not reload the prompt or read a stem part again.
    if (this._promptBlock != null && this._promptBlock === blockKey(pos)) { this._key = key; this._pos = pos; return; }
    this._key = key;
    this._pos = pos;
    this._load(pos);
    if (this.narrated && this.playing) this._run();
    else this._emit();
  }

  _load(pos) {
    this._stopRun();
    this._clearAfter();
    this.waiting = null;
    this._offset = 0;
    this._fired = new Set();
    this._answered = !pos.needsAnswer;
    this._holdAfter = false;
    this._interacted = false;
    const seg = findSegment(this.index, { block: pos.blockId, stepId: pos.stepId, stepIndex: pos.step });
    this._seg = seg || timedSegment(pos.text || '', { block: pos.blockId, step: pos.stepId });
    this._promptBlock = (pos.needsAnswer || seg?.step === 'prompt') ? blockKey(pos) : null;
    // A question's stem may itself be staged; narrated, its whole card shows
    // at once. A predict shows its options when the prompt has been spoken.
    if (pos.needsAnswer && this.narrated && !isPredict(pos)) this.engine.revealAllSteps?.();
  }

  // ── running a beat ─────────────────────────────────────────────────────

  _mediaMs() {
    if (!this._seg) return 0;
    if (!this.playing || this.waiting) return this._offset;
    if (this._seg.timed || !this._audio) {
      return Math.min(this._seg.durationMs || 0, this._offset + (this.env.now() - this._startedAt) * this.rate);
    }
    return (this._audio.currentTime || 0) * 1000;
  }

  _run() {
    const seg = this._seg;
    if (!seg) return;
    this._stopRun();
    if (this.needsWaitBeforeStart() || isHeading(seg)) { this._finish(); return; }
    this.engine.seekScene?.(this._pos?.step ?? 0, this._offset);
    if (!seg.timed && seg.audio) this._playAudio(seg);
    else this._playTimed(seg);
    this._tick = this.env.setInterval(() => this._onTick(), TICK_MS);
    this._emit();
  }

  /** A beat already fully heard (resumed at its end) goes straight to its wait/advance. */
  needsWaitBeforeStart() {
    const d = this._seg?.durationMs || 0;
    return d > 0 && this._offset >= d - 1;
  }

  _playAudio(seg) {
    if (!this._audio) {
      this._audio = this.env.createAudio();
      this._audio.addEventListener('ended', () => { if (this.playing && !this.waiting) this._finish(); });
      this._audio.addEventListener('error', () => {
        // Missing or unplayable file: fall back to a timed read of the same beat.
        if (!this.playing || this._seg?.timed) return;
        const s = this._seg;
        this._seg = { ...timedSegment(s.text, { block: s.block, step: s.step }), await: s.await, cues: s.cues || [] };
        this._run();
      });
    }
    const a = this._audio;
    const src = this.audioBase(seg.audio);
    if (this._audioSrc !== src) { a.src = src; this._audioSrc = src; }
    a.playbackRate = this.rate;
    try { a.currentTime = this._offset / 1000; } catch { /* not seekable yet: starts at 0 */ }
    const p = a.play?.();
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        if (err?.name === 'AbortError') return; // superseded by a newer src / pause
        // Autoplay refused (no gesture yet): stay narrated, show Play.
        this.blocked = true;
        this.playing = false;
        this._offset = this._mediaMs();
        this._stopRun();
        this._emit();
      });
    }
  }

  _playTimed(seg) {
    this._startedAt = this.env.now();
    const left = Math.max(0, (seg.durationMs || 0) - this._offset) / this.rate;
    this._timer = this.env.setTimeout(() => { this._timer = null; this._finish(); }, left);
  }

  _stopRun() {
    if (this._timer != null) { this.env.clearTimeout(this._timer); this._timer = null; }
    if (this._tick != null) { this.env.clearInterval(this._tick); this._tick = null; }
    if (this._audio && !this._audio.paused) this._audio.pause();
  }

  _onTick() {
    const ms = this._mediaMs();
    for (const id of dueCues(this._seg?.cues, ms, this._fired)) {
      this._fired.add(id);
      this.engine.fireSceneCue?.(id);
    }
    this.engine.seekScene?.(this._pos?.step ?? 0, ms, { tick: true });
    this._emit();
  }

  /** This beat's audio (or timed read) is over: wait, or move on. */
  _finish() {
    this._offset = this._seg?.durationMs || this._mediaMs();
    this._stopRun();
    for (const id of dueCues(this._seg?.cues, Infinity, this._fired)) {
      this._fired.add(id);
      this.engine.fireSceneCue?.(id);
    }
    const awaitKind = this._seg?.await;
    if ((awaitKind === 'answer' || this._pos?.needsAnswer) && !this._answered && this.engine.hasUnansweredQuestion?.() !== false) {
      // The prompt is spoken: the whole card (a predict's options) shows now.
      this.engine.revealAllSteps?.();
      this.waiting = 'answer';
    } else if (this._answered && this._holdAfter) {
      this.waiting = 'continue';
    } else if (awaitKind === 'interact' && !this._interacted) {
      this.waiting = 'interact';
    } else {
      this.waiting = null;
      this._emit();
      this._advance();
      return;
    }
    this._emit();
  }

  _advance() {
    if (!this.narrated || !this.playing) return;
    this.engine.next?.({ auto: true });
  }

  _onAnswer(right) {
    if (!this.narrated) return;
    this._answered = true;
    // Feedback or an explanation to read: hold until Continue (never jump on).
    // A block may say it has nothing to read (a predict with a deferred verdict).
    this._holdAfter = this.engine.narrationHoldAfterAnswer?.() !== false;
    if (this.waiting !== 'answer' && this.waiting !== 'continue') return;
    this._clearAfter();
    if (this._holdAfter) {
      this.waiting = 'continue';
      this._emit();
      return;
    }
    this._afterTimer = this.env.setTimeout(() => {
      this._afterTimer = null;
      if (this.waiting !== 'answer') return;
      this.waiting = null;
      this._emit();
      if (this.playing) this._advance();
    }, right ? AFTER_ANSWER_MS.right : AFTER_ANSWER_MS.wrong);
  }

  _onInteracted() {
    if (!this.narrated) return;
    this._interacted = true;
    if (this.waiting !== 'interact') return;
    this.waiting = null;
    this._emit();
    if (this.playing) this._advance();
  }

  /** The scene reports the learner did what the beat asked (a DOM
   *  `scene-interact-done` event, forwarded by LessonSession). */
  interactDone() { this._onInteracted(); }

  /** The learner pressed Continue (or Skip on the "Your turn" hint) while a
   *  wait is showing: a wait for an interaction may be skipped this way, and
   *  the hold on an answer's feedback ends. A question still unanswered must
   *  be answered (or skipped with the lesson's own Next). */
  continueFromWait() {
    if (this.waiting === 'interact') this._interacted = true;
    else if (this.waiting !== 'continue') return;
    this._clearAfter();
    this.waiting = null;
    this.playing = true;
    this._emit();
    this._advance();
  }

  _clearAfter() {
    if (this._afterTimer != null) { this.env.clearTimeout(this._afterTimer); this._afterTimer = null; }
  }

  destroy() {
    try { this.engine.narrationWord?.(null, -1); } catch { /* ignore */ }
    this._stopRun();
    this._clearAfter();
    this.env.doc?.removeEventListener?.('visibilitychange', this._onVisibility);
    if (this.bus) {
      this.bus.off('question:graded', this._onGraded);
      this.bus.off('poe:prediction-submitted', this._onPredict);
      this.bus.off('cue:found', this._onInteract);
      this.bus.off('cue:game-solved', this._onInteract);
    }
    if (this._audio) { try { this._audio.removeAttribute?.('src'); this._audio.load?.(); } catch { /* ignore */ } }
    this._audio = null;
    this._listeners.clear();
  }
}
