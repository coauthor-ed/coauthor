import '../LookSlots.js';
import { LitElement, html, css } from 'lit';
import { LessonModeMixin } from '../../../core/mixins/LessonModeMixin.js';
import { GamificationMixin } from '../../../core/mixins/GamificationMixin.js';
import { btn3dStyles } from '../../sharedStyles.js';
import { parentStyles, relTime, scoreTone } from './parentStyles.js';
import { iconLessonDone, iconStar, iconFlame, iconClock, iconClipboard, iconArrowRight, iconBookOpen } from '../../icons/uiIcons.js';
import { gradeLabel } from '../../../core/gradeLabel.js';
import { LookMixin } from '../../../core/mixins/LookMixin.js';

/**
 * Overview tab: one at-a-glance card per child on this device (lessons done,
 * stars, streak, time, then the latest few things they did). Each card's one
 * action opens the Progress tab for that child ('parent-open-child').
 */
export class ParentOverview extends LookMixin(GamificationMixin(LessonModeMixin(LitElement))) {
  static properties = {
    profiles: { type: Array },
    summaries: { type: Object },
  };

  static styles = [btn3dStyles, parentStyles, css`
    .kids { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: var(--space-5); }
    .kid { display: flex; flex-direction: column; gap: var(--space-5); }
    .kid-head { display: flex; align-items: center; gap: var(--space-4); }
    .avatar {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: var(--primary-color);
      color: var(--on-primary);
      font-family: var(--font-heading);
      font-weight: var(--heading-weight);
      font-size: 1.35rem;
      box-shadow: var(--lip) var(--lip-color);
    }
    :host([data-lesson-mode="story"]) .avatar { background: var(--accent-gold); color: var(--opt-key-ink); border: var(--rule-w) solid var(--border-color); }
    .kid-name { font-size: 1.3rem; overflow-wrap: anywhere; }
    .kid-meta { margin-top: 3px; font-size: 0.85rem; color: var(--text-muted); }

    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-3); }
    .stats.no-streak { grid-template-columns: repeat(3, 1fr); }
    /* plain has no stars (a game score): lessons and time only. */
    .stats.no-streak.no-stars { grid-template-columns: repeat(2, 1fr); }
    .stat {
      padding: var(--space-3);
      border-radius: var(--radius-md);
      background: var(--bg-panel);
      min-width: 0;
    }
    .stat-icon { display: inline-flex; color: var(--text-muted); margin-bottom: 6px; }
    .stat-icon.star { color: var(--accent-gold); }
    .stat-icon.flame { color: var(--accent-coral); }
    .stat-icon.lesson { color: var(--accent-teal); }
    .stat-icon.time { color: var(--accent-blue); }
    .stat-val {
      font-family: var(--font-heading);
      font-weight: var(--heading-weight);
      font-size: 1.4rem;
      line-height: 1.1;
      white-space: nowrap;
    }
    .stat-val small { font-size: 0.8rem; font-family: var(--font-family); font-weight: var(--fw-strong); color: var(--text-muted); margin-left: 2px; }
    .stat-label { margin-top: 2px; font-size: 0.78rem; font-weight: var(--fw-strong); color: var(--text-muted); }

    .recent { display: flex; flex-direction: column; gap: var(--space-2); }
    .recent .rows { border: var(--rule-w) solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; }
    .recent .row { padding: var(--space-3) var(--space-4); min-height: 56px; }
    .recent .row-icon { width: 34px; height: 34px; border-radius: 10px; }
    .quiet { margin: 0; font-size: 0.9rem; color: var(--text-muted); }

    .kid-foot { margin-top: auto; display: flex; justify-content: flex-end; }

    @media (max-width: 600px) {
      .stats, .stats.no-streak { grid-template-columns: repeat(2, 1fr); }
      .kid-foot .btn-3d { width: 100%; }
    }
  `];

  constructor() {
    super();
    this.profiles = [];
    this.summaries = {};
  }

  _open(profileId) {
    this.dispatchEvent(new CustomEvent('parent-open-child', { detail: { profileId }, bubbles: true, composed: true }));
  }

  /** Compact time for a stat tile: 39 min / 1.5 h, unit in small type. */
  _time(ms) {
    const m = Math.round((ms || 0) / 60e3);
    return m < 60 ? html`${m}<small>min</small>` : html`${(m / 60).toFixed(m < 600 ? 1 : 0)}<small>h</small>`;
  }

  _stars(n) {
    return html`<span class="stars" aria-label="${n} of 3 stars">${[0, 1, 2].map((i) => html`<span class="${i < n ? '' : 'off'}">${iconStar(i < n)}</span>`)}</span>`;
  }

  _recentRow(r) {
    if (r.kind === 'test') {
      return html`<li class="row">
        <span class="row-icon test">${iconClipboard}</span>
        <div class="row-main"><div class="row-title">${r.title}</div><div class="row-meta">Test · ${relTime(r.at)}</div></div>
        <span class="chip ${scoreTone(r.pct)}">${r.score}/${r.max}</span>
      </li>`;
    }
    return html`<li class="row">
      <span class="row-icon ${r.completed ? 'done' : ''}">${r.completed ? iconLessonDone : iconBookOpen}</span>
      <div class="row-main"><div class="row-title">${r.title}</div><div class="row-meta">${r.completed ? 'Finished' : 'In progress'} · ${relTime(r.at)}</div></div>
      ${r.completed && r.stars && this.look !== 'plain' ? this._stars(r.stars) : ''}
    </li>`;
  }

  _kid(p) {
    const s = this.summaries?.[p.profileId];
    const name = p.name || 'Student';
    const initial = (name.trim()[0] || 'S').toUpperCase();
    return html`
      <article class="card kid" aria-label="${name}">
        <div class="kid-head">
          <span class="avatar" aria-hidden="true">${initial}</span>
          <div>
            <h3 class="kid-name">${name}</h3>
            <div class="kid-meta">${gradeLabel(p.grade) ? `${gradeLabel(p.grade)} · ` : ''}${s?.lastActive ? `Last active ${relTime(s.lastActive)}` : 'Not started yet'}</div>
          </div>
        </div>
        ${s ? html`
          <div class="stats ${this.gamified ? '' : 'no-streak'} ${this.look === 'plain' ? 'no-stars' : ''}">
            <div class="stat"><span class="stat-icon lesson">${iconLessonDone}</span><div class="stat-val">${s.lessonsDone}</div><div class="stat-label">Lessons</div></div>
            ${this.look === 'plain' ? '' : html`<div class="stat"><span class="stat-icon star">${iconStar(true)}</span><div class="stat-val">${s.stars}</div><div class="stat-label">Stars</div></div>`}
            ${this.gamified ? html`<div class="stat"><span class="stat-icon flame">${iconFlame}</span><div class="stat-val">${s.streak}<small>day${s.streak === 1 ? '' : 's'}</small></div><div class="stat-label">Streak</div></div>` : ''}
            <div class="stat"><span class="stat-icon time">${iconClock}</span><div class="stat-val">${this._time(s.timeMs)}</div><div class="stat-label">Time</div></div>
          </div>
          <div class="recent">
            <span class="kicker">Recently</span>
            ${s.recent.length ? html`<ul class="rows">${s.recent.map((r) => this._recentRow(r))}</ul>`
              : html`<p class="quiet">Nothing yet. Lessons and tests ${name} finishes will show up here.</p>`}
          </div>
        ` : html`<app-loader size="48" label="Loading..."></app-loader>`}
        <div class="kid-foot">
          <button class="btn-3d btn-secondary btn-sm" @click="${() => this._open(p.profileId)}">See ${name}'s progress ${iconArrowRight}</button>
        </div>
      </article>
    `;
  }

  render() {
    return html`
      <section class="section" aria-labelledby="ov-h">
        <div class="section-head"><div>
          <h2 id="ov-h">At a glance</h2>
          <p class="lede">${this.profiles.length > 1 ? 'How each child has been doing lately.' : 'How things have been going lately.'} Details are in Progress.</p>
        </div></div>
        <div class="kids">${this.profiles.map((p) => this._kid(p))}</div>
      </section>
    `;
  }
}
customElements.define('parent-overview', ParentOverview);
