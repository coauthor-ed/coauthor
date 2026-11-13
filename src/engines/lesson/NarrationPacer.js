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
 * - `await: "interact"` holds after the audio, with a "Your turn" hint.
 *   By default (exploration, Q-90) it ends ONLY on the hint's Done or Skip:
 *   no timer, and no scene signal, ever moves it on (a learner who pressed
 *   one button is not done exploring). `free: true` says the same thing
 *   explicitly. A closed task whose end the scene can detect is marked
 *   `closed: true`: then the scene's DOM `scene-interact-done` event
 *   (CustomEvent, bubbles + composed) from the block, forwarded by
 *   LessonSession to interactDone(), or the older bus signals cue:found /
 *   cue:game-solved, continues it. The scene sends it only when the learner
 *   has FINISHED the task (end of the gesture, state settled, result on
 *   screen; spec W1 Q-41). The pacer then shows "Got it" in the hint for
 *   INTERACT_ACK_MS, so the result can be read, and only then goes on (also
 *   when the task was done during the audio and the audio ends inside that
 *   time). Skip goes on at once.
 * - Headings are never spoken: a segment marked `kind: "heading"` (or
 *   `heading: true`) is passed over at once, and the timed fallback reads the
 *   beat without its heading lines (LessonEngine.narrationPosition()).
 * - A breath between slides (Q-42): when the narration itself moves on to a
 *   new slide (audio end, "Got it", a short after-answer pause), the next
 *   slide's first beat starts SLIDE_BREATH_MS after the last one ended, so
 *   a slide change is never run straight into the next words. A move the
 *   learner makes (Next, Previous, the scrubber, Continue, Skip) starts at
 *   once.
 * - Voices (Q-43): a sidecar may offer several narrator voices
 *   (narrationModel sidecarVoices / segmentForVoice). setVoice() swaps the
 *   voice in place: the beat stays, a playing or paused beat resumes at the
 *   start of the same word in the new voice (mapped by char offset), and a
 *   wait (answer, interact, continue) or the breath stays exactly as it was.
 *   Cue marks already passed do not fire again. Scenes are told time in the
 *   DEFAULT voice's clock (mapVoiceMs), so a scene that logs cue times
 *   (seek(beat, ms)) never sees a jump when the voice changes.
 * - Presenter mode (Q-90, a lecturer in a classroom): `presenter` holds at
 *   the end of every beat (`waiting: 'beat'`, visuals at the beat's end
 *   state) until Next or Play; questions, exploration and feedback waits
 *   are the same as in self-study. presenterNext() finishes a beat at once
 *   (its remaining cues fire, the scene seeks to the beat's end) and asks
 *   the caller to move on; presenterPrev() restarts the beat when more than
 *   PREV_RESTART_MS in, else asks for the previous beat. `muted` silences
 *   the clip but keeps it playing, so word highlight, captions, cues and
 *   focus stay timed exactly as when audible. Presenter off: nothing here
 *   changes self-study narration.
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
  indexSegments, findSegment, wordIndexAt, timedSegment, dueCues, buildTimeline, timelineIndexOf, captionPhrases,
  sidecarVoices, pickVoice, segmentForVoice, mapVoiceMs,
} from '../../core/narration/narrationModel.js';

export const NARRATION_RATES = [0.85, 1, 1.15];
/** The DOM event a scene dispatches when the learner did what an
 *  `await: "interact"` beat asked (bubbles + composed; LessonSession forwards it). */
export const SCENE_INTERACT_DONE = 'scene-interact-done';
/** After a graded answer: long enough to see the verdict land. */
const AFTER_ANSWER_MS = { right: 1600, wrong: 3800 };
const TICK_MS = 120;
/** A resume within this of where the clip already is plays on without a seek (Q-90). */
const SEEK_SLACK_MS = 150;
/** After the scene reports the task finished: "Got it" shows this long, so the
 *  learner sees the outcome before the narration goes on (spec W1 Q-41). */
export const INTERACT_ACK_MS = 2000;
/** The narrator's breath between the last beat of a slide and the first of
 *  the next, when the narration moves on by itself (spec W1 Q-42, owner
 *  2026-11-10). Counted from the end of the last beat, so a slow slide load
 *  is part of it, not added to it. Not shortened under reduced motion. */
export const SLIDE_BREATH_MS = 700;
/** Presenter Previous (Q-90): further into the beat than this restarts it;
 *  nearer its start goes to the previous beat (as a media player does). */
export const PREV_RESTART_MS = 1500;

/** Cue ids that show a held question/predict card at their word (Q-90). */
export const PROMPT_SHOW_CUE = /^(?:show|focus)\.(?:[\w-]+\+)*(?:options|card)(?:\+[\w-]+)*$/;
/** Time (ms) of the earliest card-showing cue of a prompt beat, or null. */
export function promptShowCueMs(cues) {
  let best = null;
  for (const c of cues || []) {
    if (c && PROMPT_SHOW_CUE.test(String(c.id)) && Number.isFinite(c.t) && (best == null || c.t < best)) best = c.t;
  }
  return best;
}

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
   * @param {{ audioBase?: (rel: string) => string, env?: object, bus?: object, voice?: string }} [opts]
   *   audioBase resolves a segment's `audio` (relative to the sidecar).
   *   voice: the learner's stored voice id (the sidecar's default if it is not offered).
   *   bus: the EventBus, for question:graded / minigame:solved / poe:prediction-submitted /
   *   cue:found / cue:game-solved.
   */
  constructor(engine, sidecar, { audioBase = (p) => p, env = null, bus = null, voice = null, muted = false, presenter = false } = {}) {
    this.engine = engine;
    this.sidecar = sidecar;
    this.index = indexSegments(sidecar);
    this.voices = sidecarVoices(sidecar);
    this.voice = pickVoice(sidecar, voice);
    this.audioBase = audioBase;
    this.env = { ...browserEnv(), ...(env || {}) };
    this.bus = bus || this.env.bus;
    this.narrated = false;
    this.playing = false;
    this.rate = 1;
    this.muted = !!muted;         // Q-90: the clip plays silently; the timeline runs on
    this.presenter = !!presenter; // Q-90: hold at the end of every beat
    this.waiting = null;          // null | 'answer' | 'interact' | 'continue' | 'beat' (presenter hold)
    this.blocked = false;         // the browser refused to start audio
    this.ended = false;           // the lesson finished under narration
    this._key = null;             // `${blockIndex}:${step}` of the loaded beat
    this._pos = null;
    this._seg = null;             // segment (real or timed stand-in) of this beat, in this.voice
    this._baseSeg = null;         // the sidecar's own segment (default voice), or null
    this._breathFrom = null;      // {key, t}: the narration moved on by itself from block key at t
    this._breathUntil = 0;        // env.now() before which a new slide's first beat waits (Q-42)
    this._breathing = false;
    this._sceneFloor = 0;         // after a voice switch: scene time never steps back below this
    this._lastSceneMs = 0;
    this._offset = 0;             // media ms into this beat
    this._startedAt = 0;          // env.now() when the current run started
    this._fired = new Set();
    this._answered = false;
    this._holdAfter = false;      // answered, and the feedback wants reading
    this._interacted = false;
    this._ack = false;            // "Got it": the task was detected, dwelling before going on
    this._ackUntil = 0;           // env.now() until which a finished task still dwells
    this._ackTimer = null;
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
    // mini-game@1 announces a win as minigame:solved, never question:graded:
    // it answers the beat's 'answer' wait like a right answer.
    this._onGameSolved = () => this._onAnswer(true);
    if (this.bus) {
      this.bus.on('question:graded', this._onGraded);
      this.bus.on('minigame:solved', this._onGameSolved);
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
      ack: this._ack,
      // the "Your turn" box offers Done: every interact wait but a closed task (Q-90)
      free: !!seg && seg.await === 'interact' && !seg.closed,
      closed: !!seg?.closed,
      breathing: this._breathing,
      voice: this.voice,
      voices: this.voices,
      blocked: this.blocked,
      ended: this.ended,
      rate: this.rate,
      muted: this.muted,
      presenter: this.presenter,
      segment: seg,
      timed: !!seg?.timed,
      ms,
      durationMs: seg ? (seg.durationMs || 0) : 0,
      wordIndex: seg ? wordIndexAt(seg.words, ms) : -1,
      timeline,
      timelineIndex: pos ? timelineIndexOf(timeline, { blockIndex: pos.blockIndex, beatIndex: pos.step }) : -1,
      // 'held' = the card is hidden while its prompt is spoken; 'shown' = a
      // prompt beat whose card is on screen (its stem carries the words).
      prompt: !this._holdBeat || this._promptDone ? null
        : (this.narrated && this.playing && !this.waiting && ms < this._holdUntil) ? 'held' : 'shown',
    };
  }

  _emit() {
    const s = this.state();
    this._applyPromptHold(s);
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

  /** Hold while the prompt is being spoken: playing (a breath counts), no
   *  wait yet, unanswered, before its last phrase. Pause, Read instead, the
   *  last phrase or an answer shows the card; its staged parts all show then. */
  _applyPromptHold(s) {
    const hold = s.prompt === 'held';
    if (hold === !!this._promptHeld) return;
    this._promptHeld = hold;
    try { this.engine.setNarrationPromptHold?.(hold); } catch (e) { console.error('prompt hold', e); }
    if (!hold && this.narrated && this._holdBeat && !this._promptDone) this.engine.revealAllSteps?.();
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
      this._clearAck();
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
    this._breathUntil = 0; // resuming speaks at once
    this.playing = false;
    this._stopRun();
    this._clearAfter();
    this._emit();
  }

  toggle() {
    if (this.waiting === 'interact' || this.waiting === 'continue' || this.waiting === 'beat') { this.continueFromWait(); return; }
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

  /** Mute (Q-90): the clip keeps playing silently, so the word highlight,
   *  captions, cues and focus stay timed exactly as when audible. */
  setMuted(on) {
    on = !!on;
    if (on === this.muted) return;
    this.muted = on;
    if (this._audio) this._audio.muted = on;
    this._emit();
  }

  /** Presenter mode (Q-90). Off at a presenter hold goes on, as self-study would have. */
  setPresenter(on) {
    on = !!on;
    if (on === this.presenter) return;
    this.presenter = on;
    if (!on && this.waiting === 'beat' && this.playing) { this.continueFromWait(); return; }
    this._emit();
  }

  /**
   * Presenter Next (Q-90). Returns what the caller still has to do:
   * - 'navigate': the beat is finished (remaining cues fired, scene at the
   *   beat's end); move the cursor on (LessonSession's own Next, so a page
   *   turn and the end of the lesson behave as usual). Playing from there.
   * - 'handled': a wait was ended (hold, exploration Done, feedback
   *   Continue), the breath was cut short, or a question prompt was finished
   *   and now waits for its answer.
   * - 'none': a question waits for its answer; Next does nothing (the
   *   presenter answers on screen). A strip button may still skip it.
   */
  presenterNext() {
    if (!this.narrated || this.ended) return 'navigate';
    if (this.waiting === 'answer') return 'none';
    if (this.waiting) { this.continueFromWait(); return 'handled'; }
    if (this._breathing) {
      this._stopRun();
      this._breathUntil = 0;
      this.playing = true;
      this._run();
      return 'handled';
    }
    const seg = this._seg;
    if (!seg) { this.playing = true; return 'navigate'; }
    const needAnswer = (seg.await === 'answer' || this._pos?.needsAnswer) && !this._answered
      && this.engine.hasUnansweredQuestion?.() !== false;
    this.playing = true;
    if (needAnswer) { this._finish(); return 'handled'; }
    this._completeBeat();
    return 'navigate';
  }

  /**
   * Presenter Previous (Q-90): more than PREV_RESTART_MS into the beat (a
   * hold counts as its end), or on the lesson's first beat, restarts it;
   * else 'navigate' (the caller goes to the previous beat). A question's
   * answer or feedback wait also navigates. Plays from there.
   */
  presenterPrev({ canBack = true } = {}) {
    if (!this.narrated || this.ended) return 'navigate';
    if (this.waiting === 'answer' || this.waiting === 'continue') { this.playing = true; return 'navigate'; }
    if (this._mediaMs() > PREV_RESTART_MS || !canBack) {
      this._clearAck();
      this._clearAfter();
      this.waiting = null;
      this._interacted = false;
      this._ackUntil = 0;
      this._breathUntil = 0;
      this.playing = true;
      this.restartBeat();
      return 'handled';
    }
    this.playing = true;
    return 'navigate';
  }

  /** Ends the beat in place: its remaining cues fire, the scene is told the
   *  beat's end time, the clip stops. No wait, no advance. */
  _completeBeat() {
    const seg = this._seg;
    this._stopRun();
    this._breathUntil = 0;
    this._offset = seg?.durationMs || this._offset;
    for (const id of dueCues(seg?.cues, Infinity, this._fired)) {
      this._fired.add(id);
      this.engine.fireSceneCue?.(id);
    }
    this._seekScene(this._offset);
    this._emit();
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
    this._sceneFloor = 0;
    if (this.playing && !this.waiting) { this._stopRun(); this._run(); } else this._emit();
  }

  /**
   * The learner picked another narrator voice (Q-43). The beat stays: a
   * playing or paused beat goes on from the start of the word being spoken,
   * in the new voice; a beat already heard (a wait for an answer, an
   * interaction, Continue) keeps its wait, and the next beat speaks in the
   * new voice; during the breath the new voice simply starts after it.
   * Returns false when the id is not offered or already chosen.
   */
  setVoice(id) {
    if (!this.voices.some((v) => v.id === id) || id === this.voice) return false;
    const from = this._seg;
    const running = this.playing && !this.waiting && !this._breathing && !!from;
    const ms = this._mediaMs();
    if (running) this._stopRun();
    this.voice = id;
    if (this._baseSeg && from && !from.timed) {
      const to = segmentForVoice(this._baseSeg, id);
      const heard = !!this.waiting || this.needsWaitBeforeStart();
      this._offset = heard ? (to.durationMs || 0) : this._breathing ? 0 : mapVoiceMs(from, to, ms, { wordStart: true });
      this._sceneFloor = this._lastSceneMs;
      this._seg = to;
    }
    if (running) this._run(); else this._emit();
    return true;
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
    this._breathFrom = null;
    this.ended = true;
    this.playing = false;
    this.waiting = null;
    this._stopRun();
    this._clearAfter();
    this._clearAck();
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
    // A slide the narration moved on to by itself: a breath first (Q-42).
    const bf = this._breathFrom;
    this._breathFrom = null;
    if (bf && bf.key !== blockKey(pos)) this._breathUntil = bf.t + SLIDE_BREATH_MS;
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
    this._promptDone = false;
    this._holdAfter = false;
    this._interacted = false;
    this._ackUntil = 0;
    this._clearAck();
    this._breathUntil = 0;
    this._sceneFloor = 0;
    this._lastSceneMs = 0;
    const seg = findSegment(this.index, { block: pos.blockId, stepId: pos.stepId, stepIndex: pos.step });
    this._baseSeg = seg || null;
    this._seg = seg ? segmentForVoice(seg, this.voice) : timedSegment(pos.text || '', { block: pos.blockId, step: pos.stepId });
    this._promptBlock = (pos.needsAnswer || seg?.step === 'prompt') ? blockKey(pos) : null;
    // Prompt hold (spec W1 D29n, Q-77): while a question, predict, exercise or
    // game prompt is spoken the card stays hidden (the caption carries the
    // phrase); it shows from the start of the prompt's last phrase.
    this._holdBeat = !!seg && (pos.needsAnswer || seg.await === 'answer');
    const ph = this._holdBeat ? captionPhrases(this._seg) : [];
    const lastW = ph.length ? ph[ph.length - 1][0] : -1;
    this._holdUntil = lastW >= 0 ? (this._seg.words?.[lastW]?.[0] ?? 0) : 0;
    // Q-90: a prompt that points at its card ("On the screen are four
    // claims") marks the word with [[show.options]] (or show.card): the
    // card, a predict's options included, shows from there.
    const showAt = this._holdBeat ? promptShowCueMs(this._seg.cues) : null;
    if (showAt != null && showAt < this._holdUntil) this._holdUntil = showAt;
    // A question's stem may itself be staged; narrated, its whole card shows
    // at once. A predict shows its options when the prompt has been spoken.
    if (pos.needsAnswer && this.narrated && !isPredict(pos)) this.engine.revealAllSteps?.();
  }

  // ── running a beat ─────────────────────────────────────────────────────

  _mediaMs() {
    if (!this._seg) return 0;
    if (!this.playing || this.waiting || this._breathing) return this._offset;
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
    const breath = this._breathUntil - this.env.now();
    if (breath > 0 && this._offset === 0) {
      // the new slide is up; the narrator takes a breath before speaking (Q-42)
      this._breathing = true;
      this._timer = this.env.setTimeout(() => {
        this._timer = null;
        this._breathing = false;
        this._breathUntil = 0;
        this._run();
      }, breath);
      this._emit();
      return;
    }
    this._breathUntil = 0;
    this._seekScene(this._offset);
    if (!seg.timed && seg.audio) this._playAudio(seg);
    else this._playTimed(seg);
    this._tick = this.env.setInterval(() => this._onTick(), TICK_MS);
    this._emit();
  }

  /** Scenes keep time in the default voice's clock (Q-43), and never step
   *  back right after a voice switch (a scene reads a step back as a replay). */
  _seekScene(ms, opts) {
    const seg = this._seg;
    let t = seg?.defaultSeg ? mapVoiceMs(seg, seg.defaultSeg, ms) : ms;
    if (this._sceneFloor) { if (t < this._sceneFloor) t = this._sceneFloor; else this._sceneFloor = 0; }
    this._lastSceneMs = t;
    this.engine.seekScene?.(this._pos?.step ?? 0, t, opts);
  }

  /** A beat already fully heard (resumed at its end) goes straight to its wait/advance. */
  needsWaitBeforeStart() {
    const d = this._seg?.durationMs || 0;
    return d > 0 && this._offset >= d - 1;
  }

  _playAudio(seg) {
    if (!this._audio) {
      this._audio = this.env.createAudio();
      this._audio.addEventListener('ended', () => { if (this.playing && !this.waiting && !this._breathing) this._finish(); });
      this._audio.addEventListener('error', () => {
        // Missing or unplayable file: fall back to a timed read of the same beat.
        if (!this.playing || this._seg?.timed) return;
        const s = this._seg;
        this._seg = { ...timedSegment(s.text, { block: s.block, step: s.step }), await: s.await, closed: s.closed, free: s.free, hint: s.hint, cues: s.cues || [] };
        this._run();
      });
    }
    const a = this._audio;
    const src = this.audioBase(seg.audio);
    const fresh = this._audioSrc !== src;
    if (fresh) { a.src = src; this._audioSrc = src; }
    a.playbackRate = this.rate;
    a.muted = this.muted;
    // Resume (Q-90): a paused clip already sits at the offset, so it is not
    // sought again. A seek on a clip whose server ignores Range (no 206, so
    // not seekable) snaps it back to 0 s: the beat restarted on every resume.
    const at = fresh ? 0 : (a.currentTime || 0) * 1000;
    if (Math.abs(at - this._offset) > SEEK_SLACK_MS) {
      try { a.currentTime = this._offset / 1000; } catch { /* not seekable yet: starts at 0 */ }
    }
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
    this._breathing = false;
    if (this._audio && !this._audio.paused) this._audio.pause();
  }

  _onTick() {
    const ms = this._mediaMs();
    for (const id of dueCues(this._seg?.cues, ms, this._fired)) {
      this._fired.add(id);
      this.engine.fireSceneCue?.(id);
    }
    this._seekScene(ms, { tick: true });
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
    } else if (awaitKind === 'interact' && (!this._interacted || this.env.now() < this._ackUntil)) {
      // not done yet, or done so recently that the result still wants a look
      this.waiting = 'interact';
      if (this._interacted) this._startAck(this._ackUntil - this.env.now());
    } else if (this.presenter && !isHeading(this._seg)) {
      // Presenter (Q-90): hold on the beat's end state until Next or Play.
      this.waiting = 'beat';
      this._seekScene(this._offset);
    } else {
      this.waiting = null;
      this._emit();
      this._advance();
      return;
    }
    this._emit();
  }

  /** @param {{breath?: boolean}} [o]  breath: the narration moves on by itself
   *  (false for a learner's press: Continue, Skip). */
  _advance({ breath = true } = {}) {
    if (!this.narrated || !this.playing) return;
    this._breathFrom = breath && this._pos ? { key: blockKey(this._pos), t: this.env.now() } : null;
    this.engine.next?.({ auto: true });
  }

  _onAnswer(right) {
    if (!this.narrated) return;
    this._answered = true;
    this._promptDone = true;
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
    if (!this.narrated || this._interacted) return;
    // Q-90: only a closed task ends on the scene's word; exploration
    // (the default, or free) ends on Done or Skip alone.
    if (!this._seg?.closed || this._seg.free) return;
    this._interacted = true;
    this._ackUntil = this.env.now() + INTERACT_ACK_MS;
    if (this.waiting !== 'interact') return; // done during the audio: _finish dwells for what is left
    this._startAck(INTERACT_ACK_MS);
  }

  /** "Got it" in the hint for ms, then on (Skip / Continue still go at once). */
  _startAck(ms) {
    this._clearAck();
    this._ack = true;
    this._emit();
    this._ackTimer = this.env.setTimeout(() => {
      this._ackTimer = null;
      this._ack = false;
      if (this.waiting !== 'interact') { this._emit(); return; }
      this.waiting = null;
      this._emit();
      if (this.playing) this._advance();
    }, Math.max(0, ms));
  }

  _clearAck() {
    if (this._ackTimer != null) { this.env.clearTimeout(this._ackTimer); this._ackTimer = null; }
    this._ack = false;
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
    else if (this.waiting !== 'continue' && this.waiting !== 'beat') return;
    this._clearAfter();
    this._clearAck();
    this.waiting = null;
    this.playing = true;
    this._emit();
    this._advance({ breath: false });
  }

  _clearAfter() {
    if (this._afterTimer != null) { this.env.clearTimeout(this._afterTimer); this._afterTimer = null; }
  }

  destroy() {
    try { this.engine.narrationWord?.(null, -1); } catch { /* ignore */ }
    this._stopRun();
    this._clearAfter();
    this._clearAck();
    this.env.doc?.removeEventListener?.('visibilitychange', this._onVisibility);
    if (this.bus) {
      this.bus.off('question:graded', this._onGraded);
      this.bus.off('minigame:solved', this._onGameSolved);
      this.bus.off('poe:prediction-submitted', this._onPredict);
      this.bus.off('cue:found', this._onInteract);
      this.bus.off('cue:game-solved', this._onInteract);
    }
    if (this._audio) { try { this._audio.removeAttribute?.('src'); this._audio.load?.(); } catch { /* ignore */ } }
    this._audio = null;
    this._listeners.clear();
  }
}
