import { LitElement, html, css } from 'lit';
import { ProgressStore } from '../../core/ProgressStore.js';
import { AuthService } from '../../core/AuthService.js';
import { EventBus } from '../../core/EventBus.js';
import { iconFlame, iconBolt } from '../icons/uiIcons.js';

export class StreakBadge extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      position: relative;
    }
    /* Chip with a 3D lip (prototype v2 a/ .streak-chip). SVG glyphs instead
       of emoji, so they take a theme colour and render the same everywhere. */
    .stat-pill {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 7px 14px;
      background: var(--bg-surface);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-pill);
      font-weight: var(--fw-heavy);
      font-size: 0.9rem;
      color: var(--text-main);
      box-shadow: var(--lip) var(--lip-color);
    }
    .stat-pill b { font-family: var(--font-heading); font-weight: var(--fw-strong); }
    .pill-icon { display: inline-flex; }
    .streak-flame { color: var(--accent-coral); }
    .xp-star { color: var(--accent-gold); }
    .stat-pill.bump { animation: bump 450ms var(--ease-spring); }
    @keyframes bump { 40% { transform: scale(1.12); } }
    @media (prefers-reduced-motion: reduce) {
      .stat-pill.bump, .floating-popup { animation: none; }
    }
    .floating-popup {
      position: absolute;
      top: -20px;
      right: 0;
      font-family: var(--font-heading, sans-serif);
      font-weight: var(--fw-heavy);
      font-size: 1rem;
      color: var(--accent-amber);
      pointer-events: none;
      animation: floatUp 1.2s ease-out forwards;
    }
    @keyframes floatUp {
      0% { transform: translateY(0) scale(0.8); opacity: 1; }
      50% { transform: translateY(-20px) scale(1.2); opacity: 1; }
      100% { transform: translateY(-40px) scale(1); opacity: 0; }
    }
  `;

  static properties = {
    streak: { type: Number, state: true },
    xp: { type: Number, state: true },
    popups: { type: Array, state: true }
  };

  constructor() {
    super();
    this.streak = 1;
    this.xp = 0;
    this.popups = [];
    this.onXpAwarded = this.onXpAwarded.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadStats();
    // EventBus is the cross-component channel (invariant 4); the window event
    // is kept one release because awardXP() still fires both.
    EventBus.on('xp:awarded', this.onXpAwarded);
    EventBus.on('streak:changed', this.onXpAwarded);
    // NOT also the legacy window event: awardXP() currently fires both, and
    // listening to each would double-count every award.
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    EventBus.off('xp:awarded', this.onXpAwarded);
    EventBus.off('streak:changed', this.onXpAwarded);
  }

  async loadStats() {
    const user = await AuthService.getCurrentUser();
    const profileId = user?.profileId || 'default_student';
    // readStreak(), not getStreakInfo(): the old call PERSISTED a recomputed
    // streak on this render path, so simply opening the dashboard advanced or
    // reset it without the student doing anything (P4.4).
    const streakInfo = await ProgressStore.readStreak(profileId);
    const totalXP = await ProgressStore.getTotalXP(profileId);
    this.streak = streakInfo?.streak || 0;
    this.xp = totalXP || 0;
  }

  /**
   * Fed from two shapes: an EventBus payload (a plain object) and, for one more
   * release, the legacy `window` CustomEvent whose data sits under `.detail`.
   * Also handles 'streak:changed', which carries a streak and no points.
   */
  onXpAwarded(e) {
    const d = (e && e.detail) ? e.detail : (e || {});

    if (typeof d.streak === 'number') this.streak = d.streak;

    const points = Number(d.points) || 0;
    if (!points) return;                 // a streak-only update has nothing to float

    this.xp += points;
    const id = Date.now() + Math.random();
    this.popups = [...this.popups, { id, text: `+${points} XP` }];
    setTimeout(() => {
      this.popups = this.popups.filter(p => p.id !== id);
    }, 1200);
  }

  render() {
    return html`
      <div class="stat-pill" title="Daily activity streak">
        <span class="pill-icon streak-flame">${iconFlame}</span>
        <span><b>${this.streak}</b> day streak</span>
      </div>
      <div class="stat-pill ${this.popups.length ? 'bump' : ''}" title="Total knowledge points">
        <span class="pill-icon xp-star">${iconBolt}</span>
        <span><b>${this.xp}</b> XP</span>
      </div>
      ${this.popups.map(p => html`<div class="floating-popup">${p.text}</div>`)}
    `;
  }
}

customElements.define('streak-badge', StreakBadge);
