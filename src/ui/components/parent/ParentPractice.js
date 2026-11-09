import '../LookSlots.js';
import { LitElement, html, css } from 'lit';
import { LessonModeMixin } from '../../../core/mixins/LessonModeMixin.js';
import { PracticeTestBuilder } from '../../../core/PracticeTestBuilder.js';
import { showConfirm } from '../dialogs.js';
import { btn3dStyles } from '../../sharedStyles.js';
import { parentStyles, relTime } from './parentStyles.js';
import { iconPlus, iconTrash, iconClipboard } from '../../icons/uiIcons.js';
import '../PracticeTestWizard.js';

/**
 * Practice tests tab: the selected child's saved practice tests, created with
 * <practice-test-wizard> and deletable only here (parent-controls invariant).
 * Fires 'parent-toast' {text} for the shell's status line.
 */
export class ParentPractice extends LessonModeMixin(LitElement) {
  static properties = {
    profile: { type: Object },
    _tests: { state: true },
  };

  static styles = [btn3dStyles, parentStyles, css`
    .count { font-weight: var(--fw-strong); }
    @media (max-width: 600px) {
      .section-head .btn-3d { width: 100%; }
      .row .link-btn .lbl { display: none; }
    }
  `];

  constructor() {
    super();
    this.profile = null;
    this._tests = null;
  }

  updated(changed) {
    if (changed.has('profile')) this._load();
  }

  async _load() {
    const pid = this.profile?.profileId;
    if (!pid) { this._tests = []; return; }
    try {
      const rows = await PracticeTestBuilder.listPracticeTests(pid);
      this._tests = rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } catch (e) {
      console.warn('Error loading practice tests:', e);
      this._tests = [];
    }
  }

  _toast(text) {
    this.dispatchEvent(new CustomEvent('parent-toast', { detail: { text }, bubbles: true, composed: true }));
  }

  _create() {
    this.shadowRoot.getElementById('practiceTestWizard')?.openWizard();
  }

  _created() {
    this._load();
    this._toast('Practice test created.');
  }

  async _delete(pt) {
    const label = pt.title?.en || pt.title || 'this practice test';
    const ok = await showConfirm(`Delete "${label}"? This can't be undone.`, 'Delete practice test', 'Delete', 'Cancel');
    if (!ok) return;
    try {
      await PracticeTestBuilder.deletePracticeTest(this.profile.profileId, pt.practiceTestId);
      this._tests = this._tests.filter((p) => p.practiceTestId !== pt.practiceTestId);
      this._toast('Practice test deleted.');
    } catch (e) {
      console.error('Error deleting practice test:', e);
      this._toast('Could not delete that practice test.');
    }
  }

  render() {
    const name = this.profile?.name || 'this student';
    const tests = this._tests;
    return html`
      <section class="section" aria-labelledby="pt-h">
        <div class="section-head">
          <div>
            <h2 id="pt-h">Practice tests</h2>
            <p class="lede">Build a test for ${name} from the question banks of their courses. It appears on their home screen.</p>
          </div>
          <button class="btn-3d btn-primary btn-sm" @click="${this._create}">${iconPlus} Create practice test</button>
        </div>
        ${tests === null ? html`<app-loader size="48" label="Loading..."></app-loader>` : tests.length ? html`
          <ul class="card flush rows">${tests.map((pt) => html`
            <li class="row">
              <span class="row-icon primary">${iconClipboard}</span>
              <div class="row-main">
                <div class="row-title">${pt.title?.en || pt.title || 'Practice test'}</div>
                <div class="row-meta">${pt.questions?.length || 0} question${pt.questions?.length === 1 ? '' : 's'} · ${pt.source === 'auto' ? 'Built for you' : 'Hand-picked'}${pt.updatedAt ? ` · ${relTime(pt.updatedAt)}` : ''}</div>
              </div>
              <button class="link-btn danger" @click="${() => this._delete(pt)}" aria-label="Delete ${pt.title?.en || pt.title || 'practice test'}">${iconTrash}<span class="lbl">Delete</span></button>
            </li>`)}
          </ul>` : html`<div class="empty"><strong>No practice tests yet</strong>Create one and ${name} will find it on their home screen.</div>`}
      </section>
      <practice-test-wizard id="practiceTestWizard" .profileId="${this.profile?.profileId || ''}" @practice-test-created="${this._created}"></practice-test-wizard>
    `;
  }
}
customElements.define('parent-practice', ParentPractice);
