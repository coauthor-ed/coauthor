/**
 * ChallengeMode - turns a scene into a mini-game: an objective plus a verdict. Opt-in; other scenes are unaffected.
 * A scene extends withChallenge(Base), sets static OBJECTIVE and SCORING, and implements checkObjective() only
 * (usage: docs/mini-games.md). evaluate() turns that into { solved, score, feedback } and tracks attempts; mini-game@1
 * calls it. Scoring lives here, not in the plugin, so a scene can be checked headlessly with no DOM host.
 */

export const SCORING_DEFAULTS = { mode: 'accuracy', tolerance: 0.02, maxAttempts: Infinity };

export function withChallenge(Base) {
  return class ChallengeScene extends Base {
    constructor(container, config = {}) {
      super(container, config);
      this.attempts = 0;
      this.solved = false;
      this._bestScore = 0;
    }

    /** Merged scoring config, so a scene only overrides what it cares about. */
    get scoring() {
      return { ...SCORING_DEFAULTS, ...(this.constructor.SCORING || {}) };
    }

    get objective() {
      return this.constructor.OBJECTIVE || null;
    }

    /**
     * Override in the scene. Return either:
     *   { value, target }  - numeric closeness, judged against `tolerance`
     *   { ok: boolean }    - a plain pass/fail
     * Returning null means "cannot be judged yet" (nothing placed, no input).
     */
    checkObjective() {
      return null;
    }

    /** @returns {{solved:boolean, score:number, attempts:number, feedback:string}} */
    evaluate() {
      const raw = this.checkObjective();
      if (!raw) {
        return { solved: false, score: 0, attempts: this.attempts, feedback: 'not-ready' };
      }
      this.attempts += 1;

      let score, solved;
      if (typeof raw.ok === 'boolean') {
        solved = raw.ok;
        score = raw.ok ? 1 : 0;
      } else {
        const { value = 0, target = 1 } = raw;
        // Normalised distance from target, so a scene can hand back any units.
        const spread = Math.abs(target) > 1e-9 ? Math.abs(target) : 1;
        const err = Math.abs(value - target) / spread;
        score = Math.max(0, 1 - err);
        solved = err <= this.scoring.tolerance;
      }

      this._bestScore = Math.max(this._bestScore, score);
      if (solved) this.solved = true;

      return {
        solved,
        score,
        best: this._bestScore,
        attempts: this.attempts,
        // Retries are unlimited and unpenalised on purpose: the point is to let
        // a student converge on the idea, not to grade their first guess.
        feedback: solved ? 'solved' : (raw.hint || 'retry'),
      };
    }

    /** Lets a scene reset its own state without losing the attempt history. */
    resetChallenge() {
      this.solved = false;
    }
  };
}

/** True when a scene class opted into challenge mode. */
export function isChallengeScene(Cls) {
  return !!(Cls && (Cls.OBJECTIVE || Cls.prototype?.checkObjective));
}
