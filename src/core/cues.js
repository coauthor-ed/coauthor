import { EventBus } from './EventBus.js';

/**
 * Cues: what just happened to the learner, never how to show it.
 *
 * Views and plugins emit these on the EventBus; the active look's reactor
 * (registry/looks.json "reactor", started by LookManager) decides what the
 * learner sees. The Quill reactor (src/looks/quill/reactor.js) maps them to
 * Quill's acts, faces, lines and confetti per docs/ui-ux-design-system.md
 * 1.1.2; a look without a reactor shows nothing. An emitter never names an
 * act, an expression, a line or a celebration.
 * docs/sprints/wip/quill-look-pack-and-celebrations-2026-10-30.md, step E2.
 *
 * Payloads are plain objects. One field recurs:
 *   companion  what the look put in the emitter's <companion-slot>
 *              (slot.companion: for Quill a <quill-coach> or <quill-mascot>),
 *              or null when the look has none there. The reactor may drive
 *              it or ignore it; the emitter never does (step E3 slots,
 *              src/ui/components/LookSlots.js).
 *
 * The math-workspace@1 question has its own cue family, the math:* events of
 * docs/math-workspace/CONTRACTS.md section 3 (math:step-checked,
 * math:milestone, math:stuck, math:hint, math:goal, math:card-unlocked,
 * math:hello). They are already "what happened" events, so they stay as they
 * are; the Quill look answers them with <quill-math-coach>, which its
 * reactor arms.
 */
export const CUES = Object.freeze({
  /** A lesson's first block is on screen. { lessonId } */
  LESSON_START: 'cue:lesson-start',
  /** A lesson question graded right. { questionId, lessonId, questionType, companion, host, run }
   *  host: the mounted question (a look keeps off its answer area). run: right
   *  answers in a row so far this session.
   *  big: true marks a bigger success inside one question (semantic-descriptive's
   *  finished chain of blanks, "Masterpiece complete"); the look may celebrate more. */
  CORRECT: 'cue:correct',
  /** N right answers in a row, every third one, right after that CORRECT. { count, host } */
  STREAK: 'cue:streak',
  /** A first wrong answer on a question. Same payload as CORRECT, plus { misses: 1 } */
  WRONG: 'cue:wrong',
  /** A second (or later) consecutive wrong answer on the same question.
   *  Same payload as CORRECT, plus { misses } (>= 2). */
  WRONG_AGAIN: 'cue:wrong-again',
  /** A day streak reached a milestone (7, 30, every 50th), only while gamification
   *  shows. { days } */
  STREAK_MILESTONE: 'cue:streak-milestone',
  /** A POE prediction was submitted. { correct, host } (correct: the prediction
   *  matches the outcome, when the predict block knows it at submit time;
   *  host: the mounted block, so a look keeps off its answer area) */
  PREDICT: 'cue:predict',
  /** A POE recap shows the verdict on the earlier prediction. { correct, companion } */
  REVEAL: 'cue:reveal',
  /** The learner found the thing, in a scene (phase P2). Only on a real find:
   *  never on Run, never on a miss.
   *  { x, y, host, thing, key?, lookAt?, small? }
   *  x, y   viewport px of the thing found
   *  host   the scene's host element (the look stays on this stage)
   *  thing  what was found, for telling one find from a repeat, per beat of the
   *         scene: { x, y, el?, state?, beat?, vague? }. x, y: stage px. el: the
   *         element, an identity only, never read. state: a signature of what
   *         the scene says now. beat: the host's data-sim-beat. vague: the
   *         emitter named nothing, only the middle of the stage
   *  key    names this find, so it counts once however often it is emitted
   *  lookAt the find is a thing to look at: the look may direct the eye to x, y
   *  small  a small find, not a concept: the look answers it more lightly */
  FOUND: 'cue:found',
  /** Not "what happened": the one request cue. A look asks what is on screen,
   *  so it never has to read inside a component to find out. Sent synchronously:
   *  { host, reply(answer) }. host: the element a find named, or null. Each
   *  component owning a stage or page chrome answers from its own module, through
   *  src/core/components/stageAnswer.js, which documents `answer`, including the
   *  `companion` standing by a scene, for a cue that has no emitter to hand one
   *  over (a scene emits cue:found, and a scene owns no companion). */
  STAGE_QUERY: 'cue:stage-query',
  /** A mini-game is ready to play. { companion } */
  GAME_START: 'cue:game-start',
  /** A game solved for the first time. { companion, attempts, score, top?, host?, x?, y? }
   *  top: the game's top level. An arcade scene has no companion: it sends host
   *  (and x, y where the win happened), so a look can answer at the stage. */
  GAME_SOLVED: 'cue:game-solved',
  /** A mini-game check that did not solve it. { companion, reason: 'retry' | 'not-ready' } */
  GAME_RETRY: 'cue:game-retry',
  /** The lesson-complete screen is up. { lessonId, right, wrong, companion } */
  LESSON_COMPLETE: 'cue:lesson-complete',
  /** A test's results screen is up. { pct, perfect, live, companion }
   *  live: the attempt just ended (false when re-opening an old attempt). */
  TEST_RESULT: 'cue:test-result',
  /** Reserved: the learner has been idle. Nothing emits it yet. { ms, companion } */
  IDLE: 'cue:idle',
  /** Reserved: a hint was opened outside math-workspace. Nothing emits it yet. { level, host } */
  HINT: 'cue:hint',
  /** Reserved: a plugin failed and its error boundary is showing. Nothing emits it yet. { type } */
  ERROR: 'cue:error',
});

/** Emits a cue. A thin wrapper so call sites read as cues, not bus traffic. */
export function emitCue(name, payload = {}) {
  EventBus.emit(name, payload);
}

/**
 * Consecutive-miss bookkeeping for graded questions, shared by every emitter
 * of CORRECT / WRONG / WRONG_AGAIN so "again" means the same thing everywhere.
 * `key` must be unique across lessons (a bare question id is only unique in
 * its own course bundle): LessonSession uses `${lessonId}:${questionId}`.
 * grade() returns the cue name and the miss count after this answer.
 */
export function createMissTracker() {
  const misses = new Map();
  return {
    grade(key, correct) {
      if (correct) {
        misses.delete(key);
        return { cue: CUES.CORRECT, misses: 0 };
      }
      const n = (misses.get(key) || 0) + 1;
      misses.set(key, n);
      return { cue: n >= 2 ? CUES.WRONG_AGAIN : CUES.WRONG, misses: n };
    },
  };
}
