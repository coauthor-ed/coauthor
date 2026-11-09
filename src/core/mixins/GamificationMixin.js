import { EventBus } from '../EventBus.js';
import { LookManager } from '../LookManager.js';

/**
 * For a Lit component that shows gamified elements (XP, streaks, stars, a
 * decorative progress ring). Gives the host `gamified`, a reactive boolean
 * kept in step with LookManager.gamificationVisible(): course manifest >
 * site.json > the active look's default. Only display reads it; XP and
 * streaks are always recorded (GamificationService).
 * docs/ui-ux-design-system.md 1.1.1c.
 */
export const GamificationMixin = (Base) => class extends Base {
  static properties = {
    gamified: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.gamified = LookManager.gamificationVisible();
    this._onGamification = ({ visible }) => { this.gamified = visible; };
  }

  connectedCallback() {
    super.connectedCallback();
    // The switch may have changed while this element was detached.
    this.gamified = LookManager.gamificationVisible();
    EventBus.on('gamification:changed', this._onGamification);
  }

  disconnectedCallback() {
    EventBus.off('gamification:changed', this._onGamification);
    super.disconnectedCallback();
  }
};
