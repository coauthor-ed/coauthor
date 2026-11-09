import { LitElement, html, css } from 'lit';
import { ProgressStore } from '../../core/ProgressStore.js';
import { ContentLoader } from '../../core/ContentLoader.js';
import { loadCourseManifest } from '../../core/courseManifest.js';
import { tr, trn } from '../../core/i18nProvider.js';
import { btn3dStyles } from '../sharedStyles.js';
import { subjectIcons, iconArrowRight } from '../icons/uiIcons.js';

/**
 * <practice-today-card .profileId>: "Today's practice" on the home screen (W2).
 *
 * - Off when the parent turned practice off (meta parent_settings_<id>,
 *   `practice: false`; ParentSettings.js). Default on.
 * - Daily plan (5-10 min) from core/practice generatePlan(); on a Sunday (local
 *   date), or once today's daily plan is done, the weekly plan instead (one
 *   per week, auto-weekly-<Monday>). Sunday falls back to the daily plan when
 *   this week's is already done.
 * - Start saves the plan as a practiceTests row keyed planId(plan)
 *   (docs/practice-scheduling.md) and opens #/test/practice:<planId>. A paused
 *   attempt is resumed as it is, never overwritten by a fresh plan.
 * - Empty pool: one quiet line, nothing else. Never a nag.
 * Results land in TestEngine's normal results view and questionAttempts.
 */
const ZERO = { state: 'loading' };

export class PracticeTodayCard extends LitElement {
  static properties = {
    profileId: { type: String },
    _s: { state: true },
  };

  static styles = [btn3dStyles, css`
    :host { display: block; }
    :host([hidden]) { display: none; }
    .today {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-3) var(--space-5);
      margin: 0 0 var(--space-6);
      padding: var(--space-4) var(--space-5);
      background: var(--surface-card);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-lg);
      box-shadow: var(--raise-rest, var(--press-1) var(--lip-color));
      animation: rise var(--motion-entrance, 550ms) var(--motion-reveal-ease) 80ms both;
    }
    @keyframes rise { from { opacity: 0; transform: translateY(var(--rise-distance)); } }
    .tile {
      width: 56px;
      height: 56px;
      border-radius: var(--radius-tile, var(--radius-md));
      display: grid;
      place-items: center;
      background: var(--primary-light);
      color: var(--primary-text);
    }
    .tile svg { width: 34px; height: 34px; }
    .main { min-width: 0; }
    .kicker {
      margin: 0;
      font-family: var(--font-ui);
      font-size: var(--fs-kicker);
      font-weight: var(--fw-heavy);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    h2 {
      margin: 2px 0 0;
      font-family: var(--font-heading);
      font-weight: var(--heading-weight);
      font-size: 1.25rem;
      line-height: var(--lh-tight);
      color: var(--text-main);
    }
    .chips { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-3) 0 0; padding: 0; list-style: none; }
    .chip {
      font-family: var(--font-ui);
      font-size: 0.8rem;
      font-weight: var(--fw-strong);
      padding: 4px 12px;
      border-radius: var(--radius-pill);
      border: var(--rule-w) solid var(--border-color);
      background: var(--bg-panel);
      color: var(--text-soft);
      box-shadow: var(--lip) var(--lip-color);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cta { white-space: nowrap; }
    .cta svg { width: 18px; height: 18px; }
    .quiet {
      margin: 0 0 var(--space-6);
      color: var(--text-muted);
      font-size: 0.92rem;
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .quiet a { color: var(--primary-text); font-weight: var(--fw-heavy); }
    @media (max-width: 600px) {
      .today { grid-template-columns: auto minmax(0, 1fr); padding: var(--space-4); }
      .tile { width: 44px; height: 44px; }
      .tile svg { width: 28px; height: 28px; }
      .cta { grid-column: 1 / -1; width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) { .today { animation: none; } }
  `];

  constructor() {
    super();
    this.profileId = '';
    this._s = ZERO;
  }

  updated(changed) {
    if (changed.has('profileId')) this._load();
  }

  async _load() {
    const pid = this.profileId;
    if (!pid) { this._s = { state: 'off' }; return; }
    const seq = (this._seq = (this._seq || 0) + 1);
    try {
      const setting = await ProgressStore.get('meta', `parent_settings_${pid}`).catch(() => null);
      if (setting?.value?.practice === false) { this._s = { state: 'off' }; return; }

      const P = await import('../../core/practice/index.js');
      const date = P.localDateString();
      const attempts = await ProgressStore.getAllFromIndex('testAttempts', 'by_profile', pid).catch(() => []);
      const statusOf = (id) => {
        const rows = attempts.filter((a) => a.testId === `practice:${id}`);
        return { done: rows.some((a) => a.completedAt), paused: rows.some((a) => !a.completedAt) };
      };
      // Weekly ids are per week (auto-weekly-<Monday>), daily ids per day.
      // Sunday leads with the weekly plan, other days with the daily one;
      // whichever is done gives way to the other.
      const order = new Date().getDay() === 0 ? ['weekly', 'daily'] : ['daily', 'weekly'];
      const kind = order.find((k) => !statusOf(P.planId({ kind: k, dateLocal: date })).done);
      if (!kind) {
        if (seq === this._seq) this._s = { state: 'done', id: P.planId({ kind: order[0], dateLocal: date }) };
        return;
      }
      const st = statusOf(P.planId({ kind, dateLocal: date }));
      const plan = await P.generatePlan({ kind, profileId: pid, dateLocal: date });
      if (seq !== this._seq) return;
      if (!plan || plan.empty) { this._s = { state: 'empty' }; return; }
      const labels = await this._labels(plan);
      if (seq === this._seq) this._s = { state: 'ready', kind, id: P.planId(plan), plan, labels, paused: st.paused, P };
    } catch (e) {
      console.warn('[practice] Today card could not build a plan:', e);
      if (seq === this._seq) this._s = { state: 'off' };
    }
  }

  /** Chapter names (curriculum.json for shared ids, a tidy id otherwise);
   *  with no chapter ids at all, the course titles the questions come from. */
  async _labels(plan) {
    const tidy = (id) => {
      const s = String(id).split('/').pop().replace(/[-_]+/g, ' ').trim();
      return s.charAt(0).toUpperCase() + s.slice(1);
    };
    if (plan.chapters.length) {
      const names = new Map();
      if (plan.chapters.some((c) => !c.includes('/'))) {
        try {
          const cur = await ContentLoader.loadJSON('/content/curriculum.json');
          for (const sub of cur?.subjects || []) for (const ch of sub.chapters || []) names.set(ch.id, ch.name?.en || ch.name);
        } catch { /* ids only */ }
      }
      return plan.chapters.map((c) => names.get(c) || tidy(c));
    }
    const bundles = [...new Set(plan.items.map((i) => i.bundleId).filter(Boolean))];
    const titles = await Promise.all(bundles.map(async (b) => {
      const m = await loadCourseManifest(b);
      const t = m?.title;
      return (typeof t === 'string' ? t : t?.en) || tidy(b);
    }));
    return titles;
  }

  async _start() {
    const s = this._s;
    if (s.state !== 'ready' || this._starting) return;
    this._starting = true;
    try {
      const existing = await ProgressStore.get('practiceTests', [this.profileId, s.id]).catch(() => null);
      if (!(existing && s.paused)) {
        const def = s.P.toPracticeTestDefinition(s.plan);
        const now = Date.now();
        await ProgressStore.put('practiceTests', {
          profileId: this.profileId,
          practiceTestId: s.id,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          ...def,
        });
      }
      window.location.hash = `#/test/practice:${s.id}`;
    } catch (e) {
      console.error('[practice] could not start today\'s practice:', e);
    } finally {
      this._starting = false;
    }
  }

  render() {
    const s = this._s;
    if (s.state === 'loading' || s.state === 'off') return '';
    if (s.state === 'empty') {
      return html`<p class="quiet">${tr('practice.empty', 'Finish a lesson to unlock practice.')}</p>`;
    }
    if (s.state === 'done') {
      return html`<p class="quiet">${tr('practice.done', 'Practice done for today.')}
        <a href="#/test/practice:${s.id}?review=1">${tr('practice.review', 'See how it went')}</a></p>`;
    }
    const weekly = s.kind === 'weekly';
    const n = s.plan.items.length;
    const mins = Math.max(1, Math.round(s.plan.estMinutes));
    const shown = s.labels.slice(0, 3);
    const more = s.labels.length - shown.length;
    return html`
      <section class="today" aria-labelledby="pt-h">
        <div class="tile" aria-hidden="true">${subjectIcons.target}</div>
        <div class="main">
          <p class="kicker">${weekly ? tr('practice.weekly_kicker', "This week's practice") : tr('practice.daily_kicker', "Today's practice")}</p>
          <h2 id="pt-h">${trn('practice.summary', n, 'About {mins} min \u00b7 1 question', 'About {mins} min \u00b7 {n} questions', { mins })}</h2>
          ${shown.length ? html`
            <ul class="chips" aria-label="${tr('practice.covers', 'Covers')}">
              ${shown.map((l) => html`<li class="chip" title="${l}">${l}</li>`)}
              ${more > 0 ? html`<li class="chip">${tr('practice.more', '+{n} more', { n: more })}</li>` : ''}
            </ul>` : ''}
        </div>
        <button class="btn-3d btn-primary cta" @click="${this._start}">
          ${s.paused ? tr('practice.continue', 'Continue') : tr('practice.start', 'Start')} ${iconArrowRight}
        </button>
      </section>
    `;
  }
}
customElements.define('practice-today-card', PracticeTodayCard);
