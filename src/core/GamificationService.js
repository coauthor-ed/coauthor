import { EventBus } from './EventBus.js';
import { ProgressStore } from './ProgressStore.js';
import { LookManager } from './LookManager.js';
import { CUES, emitCue } from './cues.js';

/**
 * GamificationService — the one and only caller of ProgressStore.awardXP().
 *
 * Lives in core/, not ui/, because "what is worth points" is business logic
 * (invariant 8), and it listens on the EventBus rather than being called from
 * views so nothing has to reach across a Shadow DOM boundary (invariant 4).
 *
 * Before this existed, awardXP() had ZERO call sites: XP was permanently 0 for
 * every student, and StreakBadge was listening for an event that never fired.
 *
 * Award table
 *   lesson:complete        +20   once per lesson
 *   question:graded        +5    once per question, only when correct
 *   test:complete          +2    per correct answer, once per attempt
 *   minigame:solved        +15   once per game (Phase 5)
 *
 * Every award carries a `sourceKey`, so replaying a lesson or re-answering a
 * question that already paid out is a no-op (migration 007).
 *
 * Recording and showing are separate: everything above always happens, while
 * visible() decides whether the learner sees any of it. Its toasts below are
 * dropped when off; views follow the same switch through GamificationMixin.
 */
const AWARD = {
  LESSON: 20,
  QUESTION: 5,
  TEST_PER_CORRECT: 2,
  MINIGAME: 15,
};

class GamificationServiceImpl {
  constructor() {
    this._started = false;
    this._profileId = null;
  }

  /** @param {() => string} getProfileId resolves the active profile at award time */
  start(getProfileId) {
    if (this._started) return;
    this._started = true;
    this._getProfileId = getProfileId;

    EventBus.on('lesson:complete', (p) => this._onLessonComplete(p));
    // question:graded is emitted by LessonSession where evaluate() resolves.
    // Deliberately NOT interaction:question - that fires on selection and
    // carries no verdict, so it would pay out for merely clicking an option.
    EventBus.on('question:graded', (p) => this._onQuestionGraded(p));
    EventBus.on('test:complete', (p) => this._onTestComplete(p));
    EventBus.on('minigame:solved', (p) => this._onMinigameSolved(p));
  }

  /** Whether XP, streaks and stars show: course manifest > site.json > look. */
  visible() {
    return LookManager.gamificationVisible();
  }

  _profile(payload) {
    return payload?.profileId || (this._getProfileId && this._getProfileId()) || null;
  }

  /** Every award funnels through here so streak + toast behaviour stays uniform. */
  async _award(profileId, points, reason, sourceKey, toast) {
    if (!profileId || !points) return null;
    // Decided now: the student may have left the course by the time the
    // award is written.
    const show = this.visible();
    let event;
    try {
      event = await ProgressStore.awardXP(profileId, points, reason, sourceKey);
    } catch (e) {
      console.warn('[Gamification] award failed', e);
      return null;
    }
    if (!event) return null;   // duplicate sourceKey, already paid out

    // Real activity happened, so the streak may advance. This is the only
    // place that writes it - a render path must never mutate it (P4.4).
    try {
      const before = await ProgressStore.readStreak(profileId);
      const after = await ProgressStore.touchStreak(profileId);
      if (after.streak !== before.streak && after.streak > 1 &&
          (after.streak === 7 || after.streak === 30 || after.streak % 50 === 0)) {
        if (show) {
          EventBus.emit('ui:toast', { icon: '🔥', text: `${after.streak} day streak` });
          emitCue(CUES.STREAK_MILESTONE, { days: after.streak });
        }
        EventBus.emit('streak:milestone', { profileId, streak: after.streak });
      }
    } catch { /* streak is decorative; never let it break an award */ }

    if (toast && show) EventBus.emit('ui:toast', { icon: '⚡', text: `+${points} XP - ${toast}` });
    return event;
  }

  _onLessonComplete(payload) {
    const id = payload?.lessonId;
    if (!id) return;
    return this._award(this._profile(payload), AWARD.LESSON, 'lesson',
      `lesson:${id}`, 'lesson finished');
  }

  _onQuestionGraded(payload) {
    if (!payload?.correct) return;          // wrong answers cost nothing, and earn nothing
    const qid = payload.questionId;
    if (!qid) return;                        // no stable id -> cannot dedupe -> do not pay
    return this._award(this._profile(payload), AWARD.QUESTION, 'question',
      `q:${payload.lessonId || ''}:${qid}`, null);
  }

  _onTestComplete(payload) {
    const { attemptId, totalScore } = payload || {};
    if (!attemptId || !totalScore) return;
    // totalScore sums per-question `score` (partial-credit types like
    // match-categorize@1/statement-judgment@1 report a fraction, e.g. 0.5),
    // so this product is a fraction too - round it, or XP shows up as
    // "5.6666666666 XP" (awardXP() also rounds defensively, but the intent
    // is decided here).
    const points = Math.round(totalScore * AWARD.TEST_PER_CORRECT);
    if (!points) return;
    return this._award(this._profile(payload), points,
      'test', `test:${attemptId}`, 'test submitted');
  }

  _onMinigameSolved(payload) {
    const src = payload?.src;
    if (!src) return;
    // `src` is bundle-relative (an author-written scene path) — not unique
    // across course bundles on its own, same reasoning as _onQuestionGraded's
    // `lessonId` scoping below. See mini-game/v1/index.js's emit site.
    return this._award(this._profile(payload), payload.xp || AWARD.MINIGAME,
      'minigame', `game:${payload.bundleId || ''}:${src}`, 'challenge solved');
  }
}

export const GamificationService = new GamificationServiceImpl();
