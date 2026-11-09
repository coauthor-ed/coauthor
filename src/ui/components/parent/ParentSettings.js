import { LitElement, html, css } from 'lit';
import { LessonModeMixin } from '../../../core/mixins/LessonModeMixin.js';
import { ProgressStore } from '../../../core/ProgressStore.js';
import { CourseSourceManager } from '../../../core/CourseSourceManager.js';
import { showConfirm } from '../dialogs.js';
import { btn3dStyles } from '../../sharedStyles.js';
import { parentStyles } from './parentStyles.js';
import { iconClock, iconGlobe, iconBackup, iconClose, iconChevronRight, iconFlag, iconClipboard } from '../../icons/uiIcons.js';
import { tr, trn } from '../../../core/i18nProvider.js';
import './FeedbackOutbox.js';
import '../CourseSourcesPanel.js';
import '../DataExportImportPanel.js';

/**
 * Settings tab, in the view-by-default / edit-via-modal pattern
 * (docs/ui-ux-design-system.md section 4): each group is one row with a
 * one-line summary of its current state and a single button that opens a
 * <dialog> holding the real controls.
 *
 *   Study goal   daily target + eye-rest reminder (meta parent_settings_<id>)
 *   Courses      <course-sources-panel> (remote course sources, aggregators)
 *   Backup       <data-export-import-panel> (export / import all stores)
 *   Practice     the home "Today's practice" card on/off (same meta row,
 *                field `practice`, default on; read by PracticeTodayCard.js)
 *   Feedback     <feedback-outbox>: flagged slides to send to course authors
 *
 * The study goal used to live only in component memory and "Save" only showed
 * a toast. It is stored now (meta store, key/value, no schema change), but
 * nothing in the app enforces it yet; the dialog says so.
 */
const DEFAULT_GOAL = { goalMins: 45, eyeRest: true, practice: true };

export class ParentSettings extends LessonModeMixin(LitElement) {
  static properties = {
    profile: { type: Object },
    _goal: { state: true },
    _draft: { state: true },
    _sourceCount: { state: true },
    _open: { state: true },
    _practiceDraft: { state: true },
    _outboxWaiting: { state: true },
    /** A dialog id to open once on arrival (ParentDashboard's ?open= deep link). */
    autoOpen: { type: String },
  };

  static styles = [btn3dStyles, parentStyles, css`
    .row-action { flex: none; }
    .row .row-icon { width: 44px; height: 44px; }
    .row-title { font-size: 1rem; }

    dialog {
      width: min(640px, calc(100vw - 32px));
      max-height: min(86dvh, 760px);
      padding: 0;
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-xl);
      background: var(--bg-surface);
      color: var(--text-main);
      box-shadow: var(--card-shadow);
      overflow: hidden;
    }
    dialog[open] { display: flex; flex-direction: column; animation: dlg-in 200ms var(--ease-settle) both; }
    dialog::backdrop { background: var(--scrim); }
    @keyframes dlg-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } }
    .dlg-head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-4) var(--space-4) var(--space-4) var(--space-5);
      border-bottom: var(--rule-w) solid var(--border-color);
    }
    .dlg-head h2 { flex: 1; font-size: 1.2rem; }
    .icon-close {
      display: inline-grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: none;
      border-radius: var(--radius-sm);
      background: none;
      color: var(--text-muted);
      cursor: pointer;
    }
    .icon-close:hover { background: var(--bg-panel); color: var(--text-main); }
    .icon-close:focus-visible { outline: var(--focus-ring); outline-offset: -2px; }
    .dlg-body { padding: var(--space-5); overflow-y: auto; flex: 1; }
    .dlg-body > p:first-child { margin-top: 0; }
    .dlg-foot {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3);
      padding: var(--space-4) var(--space-5);
      border-top: var(--rule-w) solid var(--border-color);
      background: var(--bg-panel);
    }

    .field { margin-bottom: var(--space-5); }
    .field-label { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); font-weight: var(--fw-heavy); margin-bottom: var(--space-3); }
    .field-val { font-family: var(--font-heading); font-weight: var(--heading-weight); color: var(--primary-text); font-size: 1.1rem; }
    input[type="range"] { width: 100%; height: 44px; margin: 0; accent-color: var(--primary-color); cursor: pointer; }
    .scale { display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-muted); }
    .switch-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); min-height: 48px; cursor: pointer; font-weight: var(--fw-heavy); }
    .switch-row small { display: block; font-weight: var(--fw-medium); color: var(--text-muted); margin-top: 2px; }
    .switch-row input { width: 22px; height: 22px; accent-color: var(--primary-color); flex: none; cursor: pointer; }
    .note { padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); background: var(--info-bg); color: var(--info-text); font-size: 0.86rem; line-height: 1.45; }
    .prose { color: var(--text-soft); font-size: 0.92rem; line-height: 1.55; }

    @media (max-width: 600px) {
      .row .row-icon { width: 38px; height: 38px; }
      dialog { width: 100vw; max-width: 100vw; max-height: 92dvh; margin: auto 0 0; border-radius: var(--radius-xl) var(--radius-xl) 0 0; border-bottom: none; }
      .dlg-foot .btn-3d { flex: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      dialog[open] { animation: none; }
    }
  `];

  constructor() {
    super();
    this.profile = null;
    this._goal = { ...DEFAULT_GOAL };
    this._draft = null;
    this._sourceCount = null;
    this._open = '';
    this._practiceDraft = null;
    this._outboxWaiting = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadSources();
  }

  updated(changed) {
    if (changed.has('profile')) { this._loadGoal(); this._loadOutboxCount(); }
    if (changed.has('autoOpen') && this.autoOpen && !this._open) {
      const id = this.autoOpen;
      this.dispatchEvent(new CustomEvent('parent-auto-opened', { bubbles: true, composed: true }));
      this._openDialog(id);
    }
  }

  get _goalKey() { return `parent_settings_${this.profile?.profileId || 'device'}`; }

  async _loadGoal() {
    try {
      const rec = await ProgressStore.get('meta', this._goalKey);
      this._goal = { ...DEFAULT_GOAL, ...(rec?.value || {}) };
    } catch { this._goal = { ...DEFAULT_GOAL }; }
  }

  async _loadOutboxCount() {
    try {
      const { list } = await import('../../../core/FeedbackService.js');
      this._outboxWaiting = this.profile?.profileId ? (await list(this.profile.profileId, { status: 'draft' })).length : 0;
    } catch { this._outboxWaiting = null; }
  }

  /** Writes the whole settings value, so the goal and practice fields never
   *  overwrite each other. */
  async _saveSettings(patch) {
    const value = { ...this._goal, ...patch };
    await ProgressStore.put('meta', { key: this._goalKey, value });
    this._goal = value;
  }

  async _savePractice() {
    try {
      await this._saveSettings({ practice: this._practiceDraft !== false });
      this._closeDialog('practice');
      this._toast(tr('settings.practice_saved', 'Practice setting saved.'));
    } catch (e) {
      console.error('Saving practice setting failed:', e);
      this._toast(tr('settings.practice_save_fail', 'Could not save the practice setting.'));
    }
  }

  async _loadSources() {
    try { this._sourceCount = (await CourseSourceManager.listSources()).length; } catch { this._sourceCount = null; }
  }

  _toast(text) {
    this.dispatchEvent(new CustomEvent('parent-toast', { detail: { text }, bubbles: true, composed: true }));
  }

  async _openDialog(id) {
    if (id === 'goal') this._draft = { ...this._goal };
    if (id === 'practice') this._practiceDraft = this._goal.practice !== false;
    this._open = id;
    await this.updateComplete;
    const dlg = this.shadowRoot.getElementById(`dlg-${id}`);
    if (dlg && !dlg.open) dlg.showModal();
  }

  _closeDialog(id) {
    const dlg = this.shadowRoot.getElementById(`dlg-${id}`);
    if (dlg?.open) dlg.close();
  }

  _onClosed(id) {
    this._open = '';
    this._draft = null;
    this._practiceDraft = null;
    if (id === 'sources') this._loadSources();
    if (id === 'outbox') this._loadOutboxCount();
    // Focus back to the row button that opened it.
    this.shadowRoot.querySelector(`[data-opens="${id}"]`)?.focus();
  }

  /** Esc / Cancel / close with unsaved goal changes asks first (the
   *  attachDirtyCheck behaviour, design-system section 4.1 step 4). */
  async _requestClose(id, e) {
    e?.preventDefault?.();
    if (id === 'goal' && this._draft && (this._draft.goalMins !== this._goal.goalMins || this._draft.eyeRest !== this._goal.eyeRest)) {
      const discard = await showConfirm('You have changes that are not saved.', 'Discard changes?', 'Discard', 'Keep editing');
      if (!discard) return;
    }
    this._closeDialog(id);
  }

  async _saveGoal() {
    try {
      await this._saveSettings({ goalMins: this._draft.goalMins, eyeRest: this._draft.eyeRest });
      this._draft = null;
      this._closeDialog('goal');
      this._toast('Study goal saved.');
    } catch (e) {
      console.error('Saving study goal failed:', e);
      this._toast('Could not save the study goal.');
    }
  }

  _dialog(id, title, body, foot) {
    return html`
      <dialog id="dlg-${id}" aria-labelledby="dlg-${id}-t" @cancel="${(e) => this._requestClose(id, e)}" @close="${() => this._onClosed(id)}">
        <div class="dlg-head">
          <h2 id="dlg-${id}-t">${title}</h2>
          <button class="icon-close" aria-label="Close" @click="${() => this._requestClose(id)}">${iconClose}</button>
        </div>
        <div class="dlg-body">${body}</div>
        ${foot ? html`<div class="dlg-foot">${foot}</div>` : ''}
      </dialog>`;
  }

  _goalDialog() {
    const d = this._draft || this._goal;
    const name = this.profile?.name || 'your child';
    return this._dialog('goal', 'Study goal', html`
      <div class="field">
        <div class="field-label"><label for="goal-range">Daily learning time</label><span class="field-val">${d.goalMins} min</span></div>
        <input id="goal-range" type="range" min="15" max="120" step="15" .value="${String(d.goalMins)}"
          @input="${(e) => { this._draft = { ...d, goalMins: parseInt(e.target.value, 10) }; }}">
        <div class="scale"><span>15 min</span><span>2 hours</span></div>
      </div>
      <label class="switch-row">
        <span>Eye-rest break reminder<small>Every 25 minutes of screen time</small></span>
        <input type="checkbox" .checked="${d.eyeRest}" @change="${(e) => { this._draft = { ...d, eyeRest: e.target.checked }; }}">
      </label>
      <p class="note">This is saved for ${name} on this device as a goal to talk about together. The app does not enforce it yet.</p>
    `, html`
      <button class="btn-3d btn-secondary btn-sm" @click="${() => this._requestClose('goal')}">Cancel</button>
      <button class="btn-3d btn-primary btn-sm" @click="${this._saveGoal}">Save</button>
    `);
  }

  render() {
    const g = this._goal;
    const n = this._sourceCount;
    return html`
      <section class="section" aria-labelledby="st-h">
        <div class="section-head"><div>
          <h2 id="st-h">Settings</h2>
          <p class="lede">Set once, change any time. Each opens on its own so nothing changes by accident.</p>
        </div></div>
        <ul class="card flush rows">
          <li class="row">
            <span class="row-icon primary">${iconClock}</span>
            <div class="row-main"><div class="row-title">Study goal</div><div class="row-meta">${g.goalMins} min a day${g.eyeRest ? ' · eye-rest reminder on' : ''}</div></div>
            <div class="row-action"><button class="link-btn" data-opens="goal" @click="${() => this._openDialog('goal')}">Edit ${iconChevronRight}</button></div>
          </li>
          <li class="row">
            <span class="row-icon primary">${iconClipboard}</span>
            <div class="row-main"><div class="row-title">${tr('settings.practice', 'Daily practice')}</div><div class="row-meta">${g.practice !== false ? tr('settings.practice_on', 'On: a short quiz on the home screen each day') : tr('settings.practice_off', 'Off')}</div></div>
            <div class="row-action"><button class="link-btn" data-opens="practice" @click="${() => this._openDialog('practice')}">Edit ${iconChevronRight}</button></div>
          </li>
          <li class="row">
            <span class="row-icon primary">${iconFlag}</span>
            <div class="row-main"><div class="row-title">${tr('settings.outbox', 'Feedback outbox')}</div><div class="row-meta">${this._outboxWaiting ? trn('settings.outbox_n', this._outboxWaiting, '1 flagged slide waiting to send', '{n} flagged slides waiting to send') : tr('settings.outbox_none', 'Flagged slides to send to course authors')}</div></div>
            <div class="row-action"><button class="link-btn" data-opens="outbox" @click="${() => this._openDialog('outbox')}">Open ${iconChevronRight}</button></div>
          </li>
          <li class="row">
            <span class="row-icon primary">${iconGlobe}</span>
            <div class="row-main"><div class="row-title">Course sources</div><div class="row-meta">${n == null ? 'Courses hosted on other websites' : n ? `${n} course${n === 1 ? '' : 's'} from other websites` : 'Only the built-in library'}</div></div>
            <div class="row-action"><button class="link-btn" data-opens="sources" @click="${() => this._openDialog('sources')}">Manage ${iconChevronRight}</button></div>
          </li>
          <li class="row">
            <span class="row-icon primary">${iconBackup}</span>
            <div class="row-main"><div class="row-title">Backup and restore</div><div class="row-meta">Progress lives only on this device. Keep a copy.</div></div>
            <div class="row-action"><button class="link-btn" data-opens="backup" @click="${() => this._openDialog('backup')}">Open ${iconChevronRight}</button></div>
          </li>
        </ul>
      </section>

      ${this._open === 'goal' ? this._goalDialog() : ''}
      ${this._open === 'practice' ? this._dialog('practice', tr('settings.practice', 'Daily practice'), html`
        <label class="switch-row">
          <span>${tr('settings.practice_switch', "Show today's practice")}<small>${tr('settings.practice_switch_sub', 'A 5 to 10 minute quiz on finished lessons, and a longer one on Sundays')}</small></span>
          <input type="checkbox" .checked="${this._practiceDraft !== false}" @change="${(e) => { this._practiceDraft = e.target.checked; }}">
        </label>
        <p class="note">${tr('settings.practice_note', 'Questions come only from lessons already finished. Nothing is sent anywhere, and there are no reminders.')}</p>
      `, html`
        <button class="btn-3d btn-secondary btn-sm" @click="${() => this._requestClose('practice')}">Cancel</button>
        <button class="btn-3d btn-primary btn-sm" @click="${this._savePractice}">Save</button>
      `) : ''}
      ${this._open === 'outbox' ? this._dialog('outbox', tr('settings.outbox', 'Feedback outbox'), html`
        <p class="prose">${tr('settings.outbox_lede', 'Slides a learner flagged as wrong, confusing or broken. Nothing is sent until you send it.')}</p>
        <feedback-outbox .profile="${this.profile}" @outbox-changed="${(e) => { this._outboxWaiting = e.detail.waiting; }}"></feedback-outbox>
      `) : ''}
      ${this._open === 'sources' ? this._dialog('sources', 'Course sources', html`
        <p class="prose">Add lessons, tests and simulations hosted outside this app by pasting their manifest URL. Built-in courses always load; they need nothing here.</p>
        <course-sources-panel></course-sources-panel>
      `) : ''}
      ${this._open === 'backup' ? this._dialog('backup', 'Backup and restore', html`
        <p class="prose">Download a copy of everything saved on this device, or restore from an earlier copy. There is no automatic cloud backup, so this file is the only spare.</p>
        <data-export-import-panel></data-export-import-panel>
      `) : ''}
    `;
  }
}
customElements.define('parent-settings', ParentSettings);
