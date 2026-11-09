import { LitElement, html, css } from 'lit';
import { LessonModeMixin } from '../core/mixins/LessonModeMixin.js';
import { ParentAnalytics } from '../core/ParentAnalytics.js';
import { btn3dStyles } from './sharedStyles.js';
import { iconGrid, iconChart, iconClipboard, iconSliders, iconLock, iconPrint, iconGuide, iconNib, iconCompass } from './icons/uiIcons.js';
import './components/ParentalGateHold.js';
import './components/parent/ParentOverview.js';
import './components/parent/ParentProgress.js';
import './components/parent/ParentPractice.js';
import './components/parent/ParentSettings.js';
import { gradeLabel } from '../core/gradeLabel.js';
import { AuthService } from '../core/AuthService.js';

/**
 * <parent-dashboard>: the parent area (route #/parent, reached from the
 * student menu). Behind the press-and-hold parental gate.
 *
 * Four tabs, so nothing is one long page:
 *   Overview   per-child at-a-glance cards           components/parent/ParentOverview.js
 *   Progress   one child's details (notes, 7 days,   components/parent/ParentProgress.js
 *              tests, subjects, lessons)
 *   Practice   that child's practice tests           components/parent/ParentPractice.js
 *   Settings   study goal, course sources, backup    components/parent/ParentSettings.js
 *              (each behind its own dialog)
 * Header actions: Print report (opens Progress, then window.print) and Lock
 * (back to the gate). Numbers come from src/core/ParentAnalytics.js.
 */
const TABS = [
  { id: 'overview', label: 'Overview', icon: iconGrid },
  { id: 'progress', label: 'Progress', icon: iconChart },
  { id: 'practice', label: 'Practice', icon: iconClipboard },
  { id: 'settings', label: 'Settings', icon: iconSliders },
];

export class ParentDashboard extends LessonModeMixin(LitElement) {
  static styles = [btn3dStyles, css`
    :host {
      display: block;
      width: 100%;
      max-width: 980px;
      margin: 0 auto;
      color: var(--text-main);
      font-family: var(--font-family);
      padding: var(--space-3) 0 var(--space-8);
      box-sizing: border-box;
    }
    * { box-sizing: border-box; }

    .gate-wrap { padding: var(--space-6) 0; }

    .page-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-4);
      flex-wrap: wrap;
      margin-bottom: var(--space-5);
    }
    .sub { margin: 6px 0 0; color: var(--text-muted); font-size: 0.92rem; }
    h1 {
      margin: 0;
      font-family: var(--font-heading);
      font-weight: var(--heading-weight);
      font-size: clamp(1.6rem, 3.2vw, 2.2rem);
      line-height: var(--lh-tight);
      letter-spacing: -0.02em;
    }
    .head-actions { display: flex; gap: var(--space-3); }
    .links { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: var(--space-2); }
    .links a { display: inline-flex; align-items: center; gap: 6px; font-weight: var(--fw-heavy); font-size: var(--fs-small, 0.9rem); color: var(--primary-text); text-decoration: none; }
    .links a:hover { text-decoration: underline; text-underline-offset: 3px; }
    .links svg { width: 17px; height: 17px; }
    .head-actions .btn-3d { min-height: 44px; }

    /* Child picker: only when there is more than one child, and not on
       Overview (which shows every child already). */
    .kids {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
      margin: calc(-1 * var(--space-2)) 0 var(--space-6);
    }
    .kids-label { font-size: 0.85rem; font-weight: var(--fw-strong); color: var(--text-muted); margin-right: var(--space-1); }
    .kid {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      padding: 0 var(--space-4) 0 6px;
      border-radius: var(--radius-pill);
      border: var(--rule-w) solid var(--border-color);
      background: var(--bg-surface);
      color: var(--text-main);
      font: inherit;
      font-weight: var(--fw-heavy);
      font-size: 0.9rem;
      cursor: pointer;
    }
    .kid:hover { border-color: var(--border-hover); }
    .kid:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }
    .kid .av {
      display: inline-grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--bg-panel-2);
      font-family: var(--font-heading);
      font-weight: var(--heading-weight);
      font-size: 0.85rem;
    }
    .kid .grade { color: var(--text-muted); font-weight: var(--fw-strong); font-size: 0.8rem; }
    .kid[aria-checked="true"] { border-color: var(--primary-color); background: var(--primary-light); }
    .kid[aria-checked="true"] .av { background: var(--primary-color); color: var(--on-primary); }

    /* Tabs: a segmented control on a sunken track; the selected tab is a
       raised card with the mode's lip. */
    [role="tablist"] {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      padding: 5px;
      margin-bottom: var(--space-6);
      border-radius: var(--radius-md);
      background: var(--bg-panel);
      border: var(--rule-w) solid var(--border-color);
    }
    [role="tab"] {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 44px;
      padding: 0 var(--space-2);
      border: var(--rule-w) solid transparent;
      border-radius: var(--radius-sm);
      background: none;
      color: var(--text-muted);
      font: inherit;
      font-weight: var(--fw-heavy);
      font-size: 0.92rem;
      cursor: pointer;
      white-space: nowrap;
      transition: background var(--motion-fast), color var(--motion-fast);
    }
    [role="tab"]:hover { color: var(--text-main); }
    [role="tab"]:focus-visible { outline: var(--focus-ring); outline-offset: 1px; }
    [role="tab"][aria-selected="true"] {
      background: var(--bg-surface);
      color: var(--text-main);
      border-color: var(--border-color);
      box-shadow: var(--lip) var(--lip-color);
    }
    [role="tab"][aria-selected="true"] svg { color: var(--primary-text); }
    :host([data-lesson-mode="story"]) [role="tab"][aria-selected="true"] { background: var(--accent-gold); color: var(--opt-key-ink); }
    :host([data-lesson-mode="story"]) [role="tab"][aria-selected="true"] svg { color: currentColor; }

    [role="tabpanel"] { animation: panel-in 220ms var(--ease-settle) both; }
    [role="tabpanel"]:focus-visible { outline: var(--focus-ring); outline-offset: 6px; border-radius: var(--radius-sm); }
    @keyframes panel-in { from { opacity: 0; transform: translateY(6px); } }

    .status {
      position: fixed;
      left: 50%;
      bottom: var(--space-5);
      z-index: 50;
      transform: translateX(-50%);
      max-width: calc(100vw - 32px);
      padding: var(--space-3) var(--space-5);
      border-radius: var(--radius-pill);
      background: var(--text-main);
      color: var(--bg-base);
      font-weight: var(--fw-heavy);
      font-size: 0.92rem;
      box-shadow: var(--shadow-lg);
      animation: status-in 220ms var(--ease-settle) both;
    }
    @keyframes status-in { from { opacity: 0; transform: translate(-50%, 10px); } }

    @media (max-width: 600px) {
      :host { padding: var(--space-2) var(--space-2) var(--space-7); }
      .kids-label { display: none; }
      .page-head { align-items: flex-start; }
      .head-actions { width: 100%; }
      .head-actions .btn-3d { flex: 1; }
      [role="tab"] { font-size: 0.85rem; padding: 0 2px; }
      [role="tab"] svg { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      [role="tab"] { transition: none; }
      [role="tabpanel"], .status { animation: none; }
    }
    @media print {
      .head-actions, [role="tablist"], .kids, .status, .links { display: none; }
    }
  `];

  static properties = {
    _authenticated: { state: true },
    _adult: { state: true },
    _profiles: { state: true },
    _selectedId: { state: true },
    _summaries: { state: true },
    _details: { state: true },
    _tab: { state: true },
    _toast: { state: true },
    _autoOpen: { state: true },
  };

  constructor() {
    super();
    this._authenticated = false;
    this._adult = false;
    this._profiles = [];
    this._selectedId = null;
    this._summaries = {};
    this._details = null;
    this._tab = 'overview';
    this._toast = '';
  }

  async connectedCallback() {
    super.connectedCallback();
    // An adult profile is its own grown-up: no hold gate, no Lock.
    const user = await AuthService.getCurrentUser().catch(() => null);
    this._adult = AuthService.isAdult(user);
    if (this._adult && !this._authenticated) await this._unlock();
  }

  async _unlock() {
    this._authenticated = true;
    // Deep link from Home's feedback nudge: #/parent?open=outbox opens the
    // Settings tab with the outbox dialog. The param is dropped from the URL
    // once read, so Back or a reload does not reopen it.
    const open = new URLSearchParams(window.location.hash.split('?')[1] || '').get('open');
    if (open === 'outbox') {
      this._tab = 'settings';
      this._autoOpen = open;
      history.replaceState(null, '', '#/parent');
    }
    await this._load();
  }

  async _load() {
    try {
      let profiles = await ParentAnalytics.listProfiles();
      if (!profiles.length) profiles = [{ profileId: 'default_student', name: 'Student' }];
      this._profiles = profiles;
      if (!profiles.some((p) => p.profileId === this._selectedId)) this._selectedId = profiles[0].profileId;
      const entries = await Promise.all(profiles.map(async (p) => [p.profileId, await ParentAnalytics.summary(p.profileId)]));
      this._summaries = Object.fromEntries(entries);
      await this._loadDetails();
    } catch (e) {
      console.error('Error loading parent dashboard data:', e);
    }
  }

  async _loadDetails() {
    const p = this._selected;
    if (!p) return;
    this._details = null;
    this._details = await ParentAnalytics.details(p.profileId, p.name || 'Your child');
  }

  get _selected() {
    return this._profiles.find((p) => p.profileId === this._selectedId) || this._profiles[0] || null;
  }

  _selectChild(profileId) {
    if (profileId === this._selectedId) return;
    this._selectedId = profileId;
    this._loadDetails();
  }

  async _setTab(id, focus = false) {
    this._tab = id;
    if (focus) {
      await this.updateComplete;
      this.shadowRoot.getElementById(`tab-${id}`)?.focus();
    }
  }

  _onTabKey(e) {
    const i = TABS.findIndex((t) => t.id === this._tab);
    let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TABS.length - 1;
    if (n != null) { e.preventDefault(); this._setTab(TABS[n].id, true); }
  }

  _onKidKey(e) {
    const ids = this._profiles.map((p) => p.profileId);
    const i = ids.indexOf(this._selectedId);
    let n = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % ids.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + ids.length) % ids.length;
    if (n != null) {
      e.preventDefault();
      this._selectChild(ids[n]);
      this.updateComplete.then(() => this.shadowRoot.querySelector('.kid[aria-checked="true"]')?.focus());
    }
  }

  _onOpenChild(e) {
    this._selectChild(e.detail.profileId);
    this._setTab('progress');
    window.scrollTo({ top: 0 });
  }

  _showToast(text) {
    this._toast = text;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this._toast = ''; }, 3000);
  }

  async _print() {
    await this._setTab('progress');
    if (!this._details) await this._loadDetails();
    await this.updateComplete;
    setTimeout(() => window.print(), 50);
  }

  _lock() {
    this._authenticated = false;
    this._tab = 'overview';
  }

  _panel() {
    const p = this._selected;
    switch (this._tab) {
      case 'progress': return html`<parent-progress .profile="${p}" .details="${this._details}"></parent-progress>`;
      case 'practice': return html`<parent-practice .profile="${p}"></parent-practice>`;
      case 'settings': return html`<parent-settings .profile="${p}" .autoOpen="${this._autoOpen || ''}"
        @parent-auto-opened="${() => { this._autoOpen = ''; }}"></parent-settings>`;
      default: return html`<parent-overview .profiles="${this._profiles}" .summaries="${this._summaries}"></parent-overview>`;
    }
  }

  render() {
    if (!this._authenticated) {
      return html`<div class="gate-wrap"><parental-gate-hold @parental-gate-unlocked="${this._unlock}"></parental-gate-hold></div>`;
    }
    const showKids = this._profiles.length > 1 && this._tab !== 'overview';
    return html`
      <div class="page-head">
        <div>
          <h1>${this._adult ? 'Progress and settings' : 'Parent area'}</h1>
          ${this._adult ? '' : html`<p class="sub">Lock it again before you hand the device back.</p>`}
          <nav class="links" aria-label="Help for grown-ups">
            ${this._adult ? '' : html`<a href="#/guides?for=parent">${iconGuide} Parent guides</a>`}
            <a href="#/guides?for=author">${iconNib} Author guides</a>
            <a href="#/welcome">${iconCompass} About CoAuthor</a>
          </nav>
        </div>
        <div class="head-actions">
          <button class="btn-3d btn-secondary btn-sm" @click="${this._print}">${iconPrint} Print report</button>
          ${this._adult ? '' : html`<button class="btn-3d btn-secondary btn-sm" @click="${this._lock}" title="Lock the parent area">${iconLock} Lock</button>`}
        </div>
      </div>

      <div role="tablist" aria-label="${this._adult ? 'Progress and settings sections' : 'Parent area sections'}" data-parent-tabs @keydown="${this._onTabKey}">
        ${TABS.map((t) => html`
          <button role="tab" id="tab-${t.id}" aria-controls="panel" aria-selected="${this._tab === t.id ? 'true' : 'false'}"
            tabindex="${this._tab === t.id ? '0' : '-1'}" @click="${() => this._setTab(t.id)}">${t.icon}<span>${t.label}</span></button>
        `)}
      </div>

      ${showKids ? html`
        <div class="kids" role="radiogroup" aria-label="Child" @keydown="${this._onKidKey}">
          <span class="kids-label">Showing</span>
          ${this._profiles.map((p) => html`
            <button class="kid" role="radio" aria-checked="${p.profileId === this._selectedId ? 'true' : 'false'}"
              tabindex="${p.profileId === this._selectedId ? '0' : '-1'}" @click="${() => this._selectChild(p.profileId)}">
              <span class="av" aria-hidden="true">${(p.name || 'S').trim()[0]?.toUpperCase()}</span>${p.name || 'Student'}${gradeLabel(p.grade) ? html`<span class="grade">${gradeLabel(p.grade)}</span>` : ''}
            </button>`)}
        </div>` : ''}

      <div role="tabpanel" id="panel" aria-labelledby="tab-${this._tab}" tabindex="0"
        @parent-open-child="${this._onOpenChild}" @parent-toast="${(e) => this._showToast(e.detail.text)}">
        ${this._panel()}
      </div>

      <div role="status" aria-live="polite">${this._toast ? html`<div class="status">${this._toast}</div>` : ''}</div>
    `;
  }
}
customElements.define('parent-dashboard', ParentDashboard);
