import { LitElement, html, css } from 'lit';
import { ProgressStore } from '../../core/ProgressStore.js';
import { btn3dStyles } from '../sharedStyles.js';
import { loadBrandPieces } from '../components/LookSlots.js';
import { LookManager } from '../../core/LookManager.js';
import { LookMixin } from '../../core/mixins/LookMixin.js';
import { readPendingAdd } from '../../core/shareLinks.js';

// The look's signature is defined before this view first renders.
await loadBrandPieces('signature');

/**
 * <onboarding-flow>: profile setup, the one step left of the old first-run
 * flow. The pitch carousel and the video tour it used to open with were
 * replaced by the landing page (#/welcome) and the guides
 * (docs/sprints/completed/landing-page-and-guides.md); "Start learning" on the
 * landing page brings a first-time visitor here (#/start).
 *
 * Drawn in the landing page's night sky (--landing-* tokens), so the step from
 * the landing page to here feels like one place. Quill signs the brand name
 * above the card: the one place the full signing lockup appears.
 */
const GRADES = ['8', '9', '10', '11', '12'];
// Who the profile is for. A school student gets a class and the Quill look; a
// college student or grown-up gets no grade and the plain look. The look is
// saved on the profile (profile.look, LookManager.setProfile) and can be
// changed later in the student menu.
const LEARNERS = [
  { id: 'school', label: 'School student', look: 'quill' },
  { id: 'adult', label: 'College or adult', look: 'plain' },
];

export class OnboardingFlow extends LookMixin(LitElement) {
  static styles = [btn3dStyles, css`
    :host {
      display: block;
      min-height: 100vh;
      font-family: var(--font-family);
      color: var(--landing-on-night);
      background:
        radial-gradient(ellipse 70% 50% at 50% 110%, var(--landing-sky-low), transparent 70%),
        linear-gradient(180deg, var(--landing-sky-top), var(--landing-sky-mid) 70%, var(--landing-sky-low));
    }
    .screen {
      min-height: 100vh;
      box-sizing: border-box;
      display: grid;
      place-items: center;
      padding: var(--space-6) var(--space-4);
    }
    .stack { display: grid; justify-items: center; gap: var(--space-4); width: min(460px, 100%); }
    app-signature > * { --signature-width: 340px; }
    .card {
      position: relative;
      width: min(460px, 100%);
      box-sizing: border-box;
      padding: var(--space-6);
      border-radius: var(--radius-xl);
      background: var(--landing-night-panel);
      border: 2px solid var(--landing-night-edge);
      box-shadow: 0 0 60px -10px var(--landing-glow);
    }
    .kicker {
      display: inline-block;
      font-family: var(--font-heading);
      font-weight: var(--fw-strong);
      font-size: var(--fs-small, 0.85rem);
      letter-spacing: 0.04em;
      padding: 4px 12px;
      border-radius: var(--radius-pill);
      background: var(--landing-explorer);
      color: var(--landing-on-cta);
    }
    h1 {
      font-family: var(--font-heading);
      font-size: clamp(1.7rem, 6vw, 2.2rem);
      line-height: 1.1;
      margin: var(--space-3) 0 var(--space-2);
    }
    .sub { margin: 0 0 var(--space-5); color: var(--landing-on-night-soft); line-height: 1.5; }
    label, .lbl { display: block; font-weight: var(--fw-heavy); margin-bottom: var(--space-2); }
    .field { margin-bottom: var(--space-4); }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 12px 14px;
      font: inherit;
      font-size: 1.05rem;
      border-radius: var(--radius-sm);
      border: 2px solid var(--landing-night-edge);
      background: var(--landing-sky-top);
      color: var(--landing-on-night);
    }
    input::placeholder { color: var(--landing-on-night-soft); opacity: 0.7; }
    input:focus-visible, .chip:focus-visible { outline: 3px solid var(--landing-display-grad-1); outline-offset: 2px; }
    .chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .chip {
      font: inherit;
      cursor: pointer;
      border: 2px solid var(--landing-night-edge);
      background: var(--landing-sky-top);
      color: var(--landing-on-night);
      box-shadow: 0 3px 0 var(--landing-night-edge);
      transition: transform 80ms;
    }
    .chip { font-weight: var(--fw-heavy); padding: 8px 14px; border-radius: var(--radius-pill); min-width: 48px; }
    .chip:active { transform: translateY(3px); box-shadow: none; }
    .chip[aria-pressed='true'] {
      background: var(--landing-explorer);
      border-color: var(--landing-explorer);
      color: var(--landing-on-cta);
    }
    .error { color: var(--landing-display-grad-2); font-weight: var(--fw-strong); margin: 0 0 var(--space-3); }
    .go {
      width: 100%;
      margin-top: var(--space-2);
      background: var(--landing-cta);
      color: var(--landing-on-cta);
      box-shadow: 0 4px 0 var(--landing-cta-lip);
    }
    .back {
      display: block;
      text-align: center;
      margin-top: var(--space-4);
      color: var(--landing-on-night-soft);
      font-weight: var(--fw-strong);
    }
    @media (max-width: 420px) { .card { padding: var(--space-5) var(--space-4); } }

    /* plain: the night sky gives way to the look's own paper. A title page:
       the wordmark, a white sheet under a navy head rule, quiet controls. */
    :host([data-look="plain"]) {
      color: var(--text-main);
      background: var(--paper-wash, none), var(--bg-base);
    }
    :host([data-look="plain"]) .stack { gap: var(--space-5); }
    :host([data-look="plain"]) app-signature > * { color: var(--text-main); }
    :host([data-look="plain"]) .card {
      padding: var(--space-6) var(--space-6) var(--space-5);
      border-radius: var(--radius-lg);
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-top: 3px solid var(--hero-head-rule, var(--primary-color));
      box-shadow: var(--shadow-lg);
    }
    :host([data-look="plain"]) .kicker {
      padding: 0;
      border-radius: 0;
      background: none;
      font-family: var(--font-family);
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: var(--kicker-tracking, 0.1em);
      text-transform: uppercase;
      color: var(--card-kicker, var(--text-muted));
    }
    :host([data-look="plain"]) h1 { font-size: clamp(1.7rem, 5vw, 2.1rem); letter-spacing: -0.01em; margin-top: var(--space-2); }
    :host([data-look="plain"]) .sub { color: var(--text-soft); padding-bottom: var(--space-5); border-bottom: 1px solid var(--rule-soft, var(--border-color)); }
    :host([data-look="plain"]) label, :host([data-look="plain"]) .lbl {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-soft);
    }
    :host([data-look="plain"]) input {
      border: 1px solid var(--border-hover);
      background: var(--bg-surface);
      color: var(--text-main);
    }
    :host([data-look="plain"]) input::placeholder { color: var(--text-muted); }
    :host([data-look="plain"]) input:focus-visible,
    :host([data-look="plain"]) .chip:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
    :host([data-look="plain"]) .chip {
      border: 1px solid var(--border-hover);
      border-radius: var(--radius-sm);
      background: var(--bg-surface);
      color: var(--text-main);
      box-shadow: none;
      font-weight: 500;
      transition: background var(--motion-fast), border-color var(--motion-fast);
    }
    :host([data-look="plain"]) .chip:hover { border-color: var(--primary-color); }
    :host([data-look="plain"]) .chip:active { transform: none; }
    :host([data-look="plain"]) .chip[aria-pressed='true'] {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: var(--on-primary);
    }
    :host([data-look="plain"]) .error { color: var(--error-text); }
    :host([data-look="plain"]) .go {
      background: var(--primary-color);
      color: var(--on-primary);
      box-shadow: none;
      border-radius: var(--radius-md);
    }
    :host([data-look="plain"]) .go:disabled { background: var(--bg-panel-2); color: var(--text-muted); opacity: 1; }
    :host([data-look="plain"]) .back { color: var(--text-muted); font-weight: 500; font-size: 0.9rem; }
  `];

  static properties = {
    studentName: { type: String, state: true },
    studentGrade: { type: String, state: true },
    learner: { type: String, state: true },
    errorMsg: { type: String, state: true },
    isProcessing: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.studentName = '';
    this.studentGrade = '9';
    this.learner = 'school';
    this.errorMsg = '';
    this.isProcessing = false;
  }

  connectedCallback() {
    super.connectedCallback();
    // Came from a shared college or adult course link (#/add): start on
    // "College or adult", the learner can still change it.
    const pending = readPendingAdd();
    if (pending && (pending.audience === 'college' || pending.audience === 'adult') && LEARNERS.some((l) => l.id === 'adult')) {
      this._setLearner('adult');
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Leaving without saving: the active profile decides the look again.
    if (!this.isProcessing) window.dispatchEvent(new Event('profile-changed'));
  }

  _learnerSpec() {
    return LEARNERS.find((l) => l.id === this.learner) || LEARNERS[0];
  }

  _setLearner(id) {
    this.learner = id;
    // Preview: the look this profile will get (the signature changes with it).
    LookManager.setProfile({ look: this._learnerSpec().look });
  }

  async _handleSetup(e) {
    e?.preventDefault();
    this.errorMsg = '';
    if (!this.studentName.trim()) { this.errorMsg = 'Please type a name.'; return; }
    await this._finalize();
  }

  async _finalize() {
    this.isProcessing = true;
    try {
      // AuthService.getCurrentUser() auto-creates and persists a real,
      // unnamed profile (`autoCreated: true`) the moment this device's very
      // first content interaction happens, including via a direct-content
      // route that bypasses onboarding. If this device already has one,
      // upgrade it in place with the real name/grade/avatar rather than
      // minting a second, disconnected profileId; otherwise any progress
      // written under the auto-created id would be orphaned.
      const existing = (await ProgressStore.getAll('profiles')).find((p) => p.autoCreated);
      const profileId = existing?.profileId || ('p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
      // personId: a stable, name-free identity separate from profileId.
      // Math.random-based, never crypto.randomUUID (undefined on this app's
      // plain-HTTP origin).
      const personId = existing?.personId || ('pn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9));
      await ProgressStore.put('profiles', {
        ...existing,
        profileId,
        personId,
        name: this.studentName.trim(),
        grade: this.learner === 'school' ? parseInt(this.studentGrade, 10) : null,
        look: this._learnerSpec().look,
        learner: this.learner,
        createdAt: existing?.createdAt ?? Date.now(),
        autoCreated: false,
      });
      await ProgressStore.put('meta', { key: 'active_profile', value: profileId });
      await ProgressStore.put('meta', { key: 'onboarding_complete', value: true });
      // The look's signature celebrates the new learner (Quill: a jump and
      // confetti) before the app reloads into home.
      await this.renderRoot.querySelector('app-signature')?.companion?.celebrate?.();
      // A shared course link waiting for this profile goes back to its own
      // page, which then adds the course without asking again.
      window.location.hash = readPendingAdd()?.hash || '#/';
      window.location.reload();
    } catch (err) {
      console.error(err);
      this.errorMsg = 'The profile could not be saved. Please try again.';
      this.isProcessing = false;
    }
  }

  render() {
    return html`
      <div class="screen"><div class="stack">
        <app-signature></app-signature>
        <form class="card" @submit=${this._handleSetup}>
          <span class="kicker">Last step</span>
          <h1>Who is learning?</h1>
          <p class="sub">Make a profile for this device. Your name and progress stay here, on this device only.</p>

          <div class="field">
            <label for="name">Name</label>
            <input id="name" type="text" autocomplete="given-name" .value=${this.studentName}
              @input=${(e) => { this.studentName = e.target.value; }} placeholder="First name">
          </div>
          <div class="field" role="group" aria-labelledby="learner-l">
            <span class="lbl" id="learner-l">Learner</span>
            <div class="chips">
              ${LEARNERS.map((l) => html`<button type="button" class="chip" aria-pressed=${this.learner === l.id ? 'true' : 'false'}
                @click=${() => this._setLearner(l.id)}>${l.label}</button>`)}
            </div>
          </div>
          ${this.learner === 'school' ? html`
            <div class="field" role="group" aria-labelledby="grade-l">
              <span class="lbl" id="grade-l">Class</span>
              <div class="chips">
                ${GRADES.map((g) => html`<button type="button" class="chip" aria-pressed=${this.studentGrade === g ? 'true' : 'false'}
                  @click=${() => { this.studentGrade = g; }}>${g}</button>`)}
              </div>
            </div>
          ` : ''}

          ${this.errorMsg ? html`<p class="error" role="alert">${this.errorMsg}</p>` : ''}
          <button class="btn-3d btn-lg go" type="submit" ?disabled=${this.isProcessing || !this.studentName.trim()}>
            ${this.isProcessing ? 'Setting up...' : 'Start learning'}
          </button>
          <a class="back" href="#/welcome">Back to the welcome page</a>
        </form>
      </div></div>
    `;
  }
}

customElements.define('onboarding-flow', OnboardingFlow);
