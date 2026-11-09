import '../LookSlots.js';
import { LitElement, html, css } from 'lit';
import { LessonModeMixin } from '../../../core/mixins/LessonModeMixin.js';
import { GamificationMixin } from '../../../core/mixins/GamificationMixin.js';
import { parentStyles, relTime, fmtDuration, scoreTone } from './parentStyles.js';
import { LookMixin } from '../../../core/mixins/LookMixin.js';
import { iconLessonDone, iconBookOpen, iconClipboard, iconStar, iconCheck, iconInfo, iconHeart } from '../../icons/uiIcons.js';

/**
 * Progress tab: the details for one child. Notes first (plain language), then
 * the last 7 days, tests with a per-subject average, and every lesson touched.
 * Data comes from ParentAnalytics.details(); this file only renders it.
 */
export class ParentProgress extends LookMixin(GamificationMixin(LessonModeMixin(LitElement))) {
  static properties = {
    profile: { type: Object },
    details: { type: Object },
  };

  static styles = [parentStyles, css`
    .notes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: var(--space-4); }
    .note { display: flex; gap: var(--space-3); align-items: flex-start; padding: var(--space-4); }
    .note .row-icon { width: 36px; height: 36px; }
    .note.good .row-icon { background: var(--success-bg); color: var(--success-text); }
    .note.focus .row-icon { background: var(--warn-bg); color: var(--warn-text); }
    .note.info .row-icon { background: var(--info-bg); color: var(--info-text); }
    .note-title { font-weight: var(--fw-heavy); font-size: 0.95rem; line-height: 1.3; }
    .note-text { margin-top: 3px; font-size: 0.86rem; color: var(--text-muted); line-height: 1.45; }

    /* Last 7 days: one column per day, bar height = XP that day. */
    .week { display: grid; grid-template-columns: repeat(7, 1fr); gap: var(--space-2); align-items: end; height: 150px; }
    .day { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 6px; height: 100%; min-width: 0; }
    .day-xp { font-size: 0.75rem; font-weight: var(--fw-heavy); color: var(--text-muted); min-height: 1em; }
    .bar-track { flex: 1; width: 100%; max-width: 44px; display: flex; align-items: flex-end; border-radius: 10px; background: var(--bg-panel); overflow: hidden; }
    .bar { display: block; width: 100%; background: var(--primary-color); border-radius: 10px 10px 0 0; min-height: 0; }
    .day.today .bar { background: var(--accent-teal); }
    /* plain: a printed bar chart, square-ended bars on a hairline base. */
    :host([data-look="plain"]) .bar-track { border-radius: var(--radius-xs); }
    :host([data-look="plain"]) .bar { border-radius: var(--radius-xs) var(--radius-xs) 0 0; }
    .day-label { font-size: 0.78rem; font-weight: var(--fw-strong); color: var(--text-muted); }
    .day.today .day-label { color: var(--text-main); }
    .week-foot { margin-top: var(--space-4); font-size: 0.85rem; color: var(--text-muted); }

    .two { display: grid; grid-template-columns: 3fr 2fr; gap: var(--space-5); align-items: start; }
    @media (max-width: 860px) { .two { grid-template-columns: 1fr; } }
    .two .section { margin-bottom: 0; }

    .subj { display: flex; flex-direction: column; gap: var(--space-4); }
    .subj-row { display: grid; grid-template-columns: 1fr auto; gap: 6px var(--space-3); align-items: center; }
    .subj-name { font-weight: var(--fw-heavy); font-size: 0.92rem; }
    .subj-val { font-weight: var(--fw-heavy); font-size: 0.92rem; }
    .subj-track { grid-column: 1 / -1; height: 10px; border-radius: var(--radius-pill); background: var(--bg-panel-2); overflow: hidden; }
    .subj-fill { display: block; height: 100%; border-radius: inherit; }
    .subj-fill.good { background: var(--accent-teal); }
    .subj-fill.ok { background: var(--accent-gold); }
    .subj-fill.low { background: var(--accent-coral); }
    .subj-count { grid-column: 1 / -1; margin-top: -2px; font-size: 0.78rem; color: var(--text-muted); }

    .stars { margin-right: 2px; }
    .score { text-align: right; }
    .score .row-meta { margin-top: 3px; }
  `];

  _stars(n) {
    return html`<span class="stars" aria-label="${n} of 3 stars">${[0, 1, 2].map((i) => html`<span class="${i < n ? '' : 'off'}">${iconStar(i < n)}</span>`)}</span>`;
  }

  /** With gamification off the bars just mark the active days, no XP. */
  _weekPlain(d) {
    return html`
      <section class="section" aria-labelledby="wk-h">
        <div class="section-head"><div>
          <h2 id="wk-h">The last 7 days</h2>
          <p class="lede">Days with any lesson or test activity.</p>
        </div></div>
        <div class="card">
          <div class="week" role="img" aria-label="${d.week.map((x) => `${x.label} ${x.active ? 'active' : 'no activity'}`).join(', ')}">
            ${d.week.map((x) => html`
              <div class="day ${x.today ? 'today' : ''}">
                <span class="day-xp"></span>
                <span class="bar-track"><span class="bar" style="height:${x.active ? 100 : 0}%"></span></span>
                <span class="day-label">${x.today ? 'Today' : x.label}</span>
              </div>`)}
          </div>
          <div class="week-foot">Active on ${d.activeDays} of 7 days</div>
        </div>
      </section>`;
  }

  _week(d) {
    if (!this.gamified) return this._weekPlain(d);
    const max = Math.max(10, ...d.week.map((x) => x.xp));
    const total = d.week.reduce((s, x) => s + x.xp, 0);
    return html`
      <section class="section" aria-labelledby="wk-h">
        <div class="section-head"><div>
          <h2 id="wk-h">The last 7 days</h2>
          <p class="lede">XP earned each day. Every lesson step and test answer earns some.</p>
        </div></div>
        <div class="card">
          <div class="week" role="img" aria-label="${d.week.map((x) => `${x.label} ${x.xp} XP`).join(', ')}">
            ${d.week.map((x) => html`
              <div class="day ${x.today ? 'today' : ''}">
                <span class="day-xp">${x.xp || ''}</span>
                <span class="bar-track"><span class="bar" style="height:${Math.round((x.xp / max) * 100)}%"></span></span>
                <span class="day-label">${x.today ? 'Today' : x.label}</span>
              </div>`)}
          </div>
          <div class="week-foot">${total} XP this week · active on ${d.activeDays} of 7 days</div>
        </div>
      </section>`;
  }

  render() {
    const d = this.details;
    const name = this.profile?.name || 'Your child';
    if (!d) return html`<app-loader size="48" label="Loading..."></app-loader>`;
    const nothing = !d.tests.length && !d.lessons.length;
    if (nothing) {
      return html`<div class="empty"><strong>No activity yet</strong>When ${name} starts lessons or takes a test, their progress shows up here.</div>`;
    }
    const noteIcon = { good: iconHeart, focus: iconInfo, info: iconCheck };
    return html`
      ${d.notes.length ? html`
        <section class="section" aria-labelledby="nt-h">
          <div class="section-head"><div><h2 id="nt-h">Things to notice</h2></div></div>
          <div class="notes">${d.notes.map((n) => html`
            <div class="card note ${n.tone}">
              <span class="row-icon">${noteIcon[n.tone] || iconInfo}</span>
              <div><div class="note-title">${n.title}</div>${n.text ? html`<div class="note-text">${n.text}</div>` : ''}</div>
            </div>`)}
          </div>
        </section>` : ''}

      ${this._week(d)}

      <div class="two section">
        <section class="section" aria-labelledby="ts-h">
          <div class="section-head"><div><h2 id="ts-h">Tests</h2><p class="lede">Latest results first.</p></div></div>
          ${d.tests.length ? html`
            <ul class="card flush rows">${d.tests.map((t) => html`
              <li class="row">
                <span class="row-icon test">${iconClipboard}</span>
                <div class="row-main"><div class="row-title">${t.title}</div><div class="row-meta">${relTime(t.at)}${t.durationMins ? ` · ${t.durationMins} min` : ''}</div></div>
                <div class="score"><span class="chip ${scoreTone(t.pct)}">${t.pct}%</span><div class="row-meta">${t.score} of ${t.max}</div></div>
              </li>`)}
            </ul>` : html`<div class="empty">No tests finished yet.</div>`}
        </section>
        <section class="section" aria-labelledby="sb-h">
          <div class="section-head"><div><h2 id="sb-h">By subject</h2><p class="lede">Average test score.</p></div></div>
          ${d.subjects.length ? html`
            <div class="card subj">${d.subjects.map((s) => html`
              <div class="subj-row">
                <span class="subj-name">${s.subject}</span><span class="subj-val">${s.score}%</span>
                <span class="subj-track"><span class="subj-fill ${scoreTone(s.score)}" style="width:${s.score}%"></span></span>
                <span class="subj-count">${s.count} test${s.count === 1 ? '' : 's'}</span>
              </div>`)}
            </div>` : html`<div class="empty">Shows once a test is finished.</div>`}
        </section>
      </div>

      <section class="section" aria-labelledby="ls-h">
        <div class="section-head"><div><h2 id="ls-h">Lessons</h2><p class="lede">Most recent first.${this.look === 'plain' ? '' : ' Stars: 3 = every question right first time.'}</p></div></div>
        ${d.lessons.length ? html`
          <ul class="card flush rows">${d.lessons.map((l) => html`
            <li class="row">
              <span class="row-icon ${l.completed ? 'done' : ''}">${l.completed ? iconLessonDone : iconBookOpen}</span>
              <div class="row-main"><div class="row-title">${l.title}</div><div class="row-meta">${l.completed ? 'Finished' : 'In progress'} · ${relTime(l.at)}${l.timeMs ? ` · ${fmtDuration(l.timeMs)}` : ''}</div></div>
              ${l.completed ? (l.stars && this.look !== 'plain' ? this._stars(l.stars) : '') : html`<span class="chip">Started</span>`}
            </li>`)}
          </ul>` : html`<div class="empty">No lessons started yet.</div>`}
      </section>
    `;
  }
}
customElements.define('parent-progress', ParentProgress);
