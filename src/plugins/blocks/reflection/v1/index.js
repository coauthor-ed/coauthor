import { LitElement, html, css } from 'lit';
import '../../../../ui/components/MarkdownRenderer.js';
import { ProgressStore } from '../../../../core/ProgressStore.js';
import { btn3dStyles } from '../../../../ui/sharedStyles.js';

/**
 * <reflection-v1> — an ungraded, draft-first free-text reflection block.
 *
 * Unlike semantic-descriptive@1/2 (a *graded* question type with a rubric),
 * this block never scores anything and never writes to analyticsEvents
 * (data-model.md §7 forbids free text there) or testAttempts. It exists for
 * open-ended "what do you think, and why" beats that still want the learner
 * to commit to a written answer before seeing other viewpoints — draft
 * first, then compare, never graded against them.
 *
 * Optionally bridges two lessons — possibly in different modules, possibly
 * far apart — via ProgressStore's courseNotes store (data-model.md §9a):
 * `saveResponseAs` persists this block's answer under a key; a later
 * block's `showSavedNote` reads that key back and displays it read-only,
 * unedited. Both are scoped to `ctx.profileId` + `ctx.bundleId`, which
 * LessonEngine now includes on every block's mount ctx.
 *
 * data shape:
 *   prompt: {en} | string          - required, the reflection question
 *   saveResponseAs?: string        - persist this answer under this key
 *   showSavedNote?: string         - render a prior saved note (read-only,
 *                                    no input box) instead of a fresh prompt
 *   viewpoints?: [{en} | string]   - shown only after the learner submits
 */
export class ReflectionPlugin extends LitElement {
  static properties = {
    _data:        { type: Object, state: true },
    _draft:       { type: String, state: true },
    _submitted:   { type: Boolean, state: true },
    _savedNote:   { type: Object, state: true },
  };

  static styles = [
    btn3dStyles,
    css`
      :host {
        display: block;
        margin-bottom: 1.5rem;
        font-family: var(--font-family, system-ui, sans-serif);
      }
      .card {
        background: var(--bg-surface);
        border: 2px solid var(--primary-color);
        border-radius: var(--radius-xs);
        padding: 20px;
      }
      .badge {
        display: inline-block;
        font-size: 0.75rem;
        font-weight: var(--fw-strong);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-muted);
        margin-bottom: 10px;
      }
      .prompt { margin: 0 0 14px; color: var(--text-main); }
      textarea {
        width: 100%;
        min-height: 110px;
        box-sizing: border-box;
        border: 2px solid var(--border-color);
        border-radius: var(--radius-sm);
        padding: 12px 14px;
        font-family: inherit;
        font-size: 15px;
        color: var(--text-main);
        background: var(--bg-card, var(--bg-surface));
        resize: vertical;
      }
      textarea:focus { outline: none; border-color: var(--primary-color); }
      textarea[readonly] { background: var(--bg-card, var(--bg-surface)); color: var(--text-muted); }
      .row { margin-top: 12px; }
      .viewpoints {
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px solid var(--border-color);
      }
      .viewpoint {
        padding: 10px 14px;
        margin-bottom: 8px;
        background: var(--bg-card, var(--bg-surface));
        border-left: 4px solid var(--primary-color);
        border-radius: 6px;
        color: var(--text-main);
      }
      .saved-label { font-weight: var(--fw-strong); color: var(--text-main); margin-bottom: 6px; }
    `,
  ];

  constructor() {
    super();
    this._data = null;
    this._draft = '';
    this._submitted = false;
    this._savedNote = null;
    this._ctx = null;
  }

  /** Plugin lifecycle (mountPlugin.js contract). `ctx.profileId` is absent
   *  when mounted through mountOrphanPreview.js (authoring-time preview,
   *  no logged-in learner) — persistence is skipped rather than attempted
   *  with an incomplete IndexedDB key, which idb would reject outright. */
  async init(data, ctx) {
    if (!data || !data.prompt) {
      throw new Error("Reflection requires a 'prompt' payload.");
    }
    this._data = data;
    this._ctx = ctx || {};

    if (data.showSavedNote && this._ctx.profileId) {
      const note = await ProgressStore.getNote(this._ctx.profileId, this._ctx.bundleId, data.showSavedNote);
      this._savedNote = note;
    }
  }

  _onInput(e) {
    this._draft = e.target.value;
  }

  async _onSubmit() {
    if (!this._draft.trim()) return;
    if (this._data.saveResponseAs && this._ctx.profileId) {
      await ProgressStore.saveNote(this._ctx.profileId, this._ctx.bundleId, this._data.saveResponseAs, this._draft.trim());
    }
    this._submitted = true;
  }

  _renderPrompt() {
    const prompt = this._data.prompt?.en ?? this._data.prompt;
    return html`<markdown-renderer class="prompt" .content=${prompt}></markdown-renderer>`;
  }

  _renderSavedNote() {
    const text = this._savedNote?.text;
    return html`
      <div class="card">
        <span class="badge">Reflection</span>
        ${this._renderPrompt()}
        <div class="saved-label">What you wrote:</div>
        <textarea readonly .value=${text || '(nothing was saved here)'}></textarea>
      </div>
    `;
  }

  _renderComposer() {
    return html`
      <div class="card">
        <span class="badge">Reflection — ungraded</span>
        ${this._renderPrompt()}
        <textarea
          placeholder="Write what you think…"
          aria-label="Your reflection"
          .value=${this._draft}
          ?readonly=${this._submitted}
          @input=${this._onInput}
        ></textarea>
        ${!this._submitted ? html`
          <div class="row">
            <button class="btn-3d btn-primary" ?disabled=${!this._draft.trim()} @click=${this._onSubmit}>
              I've written my answer
            </button>
          </div>
        ` : ''}
        ${this._submitted && this._data.viewpoints?.length ? html`
          <div class="viewpoints">
            ${this._data.viewpoints.map((v) => html`
              <div class="viewpoint">${v?.en ?? v}</div>
            `)}
          </div>
        ` : ''}
      </div>
    `;
  }

  render() {
    if (!this._data) return html``;
    return this._data.showSavedNote ? this._renderSavedNote() : this._renderComposer();
  }
}

customElements.define('reflection-v1', ReflectionPlugin);
