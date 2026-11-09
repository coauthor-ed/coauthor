import { LitElement, html, css } from 'lit';
import * as Feedback from '../../../core/FeedbackService.js';
import { CourseSourceManager } from '../../../core/CourseSourceManager.js';
import { loadCourseManifest } from '../../../core/courseManifest.js';
import { tr, trn } from '../../../core/i18nProvider.js';
import { showConfirm } from '../dialogs.js';
import { btn3dStyles } from '../../sharedStyles.js';
import { parentStyles } from './parentStyles.js';
import { kindLabel } from '../SlideFeedbackSheet.js';
import { iconSend, iconCopy, iconMail, iconTrash, iconClose } from '../../icons/uiIcons.js';

/**
 * <feedback-outbox .profile>: the learner's flagged slides (W4), grouped by
 * course, for a grown-up to send on. Nothing leaves the device by itself:
 *   Send on GitHub  one new-issue tab per URL chunk (FeedbackService.
 *                   buildIssueUrls), then the items are marked sent 'github'
 *   Copy as text    clipboard, then "mark as sent?" ('copy')
 *   Email           mailto: to the course author, then "mark as sent?" ('email')
 * GitHub needs a route (manifest.repository.issues or a github.io source);
 * Email needs an author address. Copy always works.
 * All text renders through Lit bindings (escaped); never innerHTML.
 * Fires 'outbox-changed' {detail:{waiting}} after every load.
 */
export class FeedbackOutbox extends LitElement {
  static properties = {
    profile: { type: Object },
    _groups: { state: true },
    _showDone: { state: true },
    _busy: { state: true },
    _msg: { state: true },
  };

  static styles = [btn3dStyles, parentStyles, css`
    :host { display: block; }
    .empty { margin: 0; color: var(--text-muted); font-size: 0.92rem; line-height: 1.5; }
    .group + .group { margin-top: var(--space-5); }
    .g-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2) var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-3); }
    .g-head h3 { overflow-wrap: anywhere; }
    .g-count { font-size: 0.82rem; color: var(--text-muted); }
    .items { list-style: none; margin: 0 0 var(--space-3); padding: 0; display: grid; gap: var(--space-2); }
    .item {
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-md);
      background: var(--bg-base);
      padding: var(--space-3);
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-1) var(--space-2);
    }
    .item.done { opacity: 0.7; }
    .i-top { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; min-width: 0; }
    .kind {
      font-family: var(--font-ui);
      font-weight: var(--fw-heavy);
      font-size: 0.75rem;
      padding: 3px 10px;
      border-radius: var(--radius-pill);
      border: var(--rule-w) solid var(--border-color);
      background: var(--bg-surface);
      box-shadow: var(--lip) var(--lip-color);
      color: var(--text-main);
    }
    .where { font-size: 0.8rem; color: var(--text-muted); overflow-wrap: anywhere; min-width: 0; }
    .excerpt { grid-column: 1 / -1; margin: 0; font-size: 0.85rem; color: var(--text-soft); border-left: 3px solid var(--border-hover); padding-left: var(--space-2); overflow-wrap: anywhere; }
    .text { grid-column: 1 / -1; margin: 0; font-size: 0.92rem; line-height: 1.45; overflow-wrap: anywhere; white-space: pre-wrap; }
    .status { grid-column: 1 / -1; font-size: 0.78rem; color: var(--text-muted); }
    .i-actions { display: flex; gap: 2px; align-items: flex-start; }
    .icon-act {
      display: inline-grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: var(--radius-sm);
      background: none;
      color: var(--text-muted);
      cursor: pointer;
    }
    .icon-act:hover { background: var(--bg-panel); color: var(--text-main); }
    .icon-act.danger:hover { color: var(--error-text); }
    .icon-act:focus-visible { outline: var(--focus-ring); outline-offset: -2px; }
    .send { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .send .btn-3d { gap: var(--space-2); }
    .route-note { margin: var(--space-2) 0 0; font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; }
    .msg { margin: 0 0 var(--space-4); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--info-bg); color: var(--info-text); font-size: 0.86rem; }
    .toggle { margin-top: var(--space-5); background: none; border: none; padding: 8px 0; color: var(--primary-text); font: inherit; font-weight: var(--fw-heavy); font-size: 0.88rem; cursor: pointer; min-height: 44px; }
    .toggle:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
    @media (max-width: 600px) {
      .send .btn-3d { flex: 1 1 auto; }
    }
  `];

  constructor() {
    super();
    this.profile = null;
    this._groups = null;
    this._showDone = false;
    this._busy = false;
    this._msg = '';
  }

  updated(changed) {
    if (changed.has('profile')) this._load();
  }

  get _pid() { return this.profile?.profileId || null; }

  async _load() {
    if (!this._pid) { this._groups = []; return; }
    let rows = [];
    try { rows = await Feedback.list(this._pid); } catch (e) { console.error('Outbox load failed:', e); }
    rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    let sources = [];
    try { sources = await CourseSourceManager.listSources(); } catch { /* local only */ }
    const groups = [];
    for (const [bundleId, items] of Feedback.groupOutbox(rows)) {
      const manifest = bundleId ? await loadCourseManifest(bundleId) : null;
      const source = sources.find((s) => s.bundleId === bundleId);
      const route = Feedback.routeFor(manifest || source?.manifest, source?.sourceUrl || '');
      const t = manifest?.title;
      const title = (typeof t === 'string' ? t : t?.en) || bundleId || tr('outbox.other_course', 'Other');
      groups.push({ bundleId, title, route, items });
    }
    this._groups = groups;
    const waiting = rows.filter((r) => r.status === 'draft').length;
    this.dispatchEvent(new CustomEvent('outbox-changed', { detail: { waiting }, bubbles: true, composed: true }));
  }

  _say(text) { this._msg = text; }

  async _sendGithub(g, drafts) {
    const chunks = Feedback.buildIssueUrls(g.route.github, drafts);
    const sentIds = [];
    let blocked = 0;
    for (const c of chunks) {
      const w = window.open(c.url, '_blank');
      if (!w) { blocked++; continue; }
      try { w.opener = null; } catch { /* cross-origin */ }
      sentIds.push(...c.items.map((i) => i.feedbackId));
    }
    if (sentIds.length) await Feedback.markSent(this._pid, sentIds, 'github');
    this._say(blocked
      ? trn('outbox.blocked', blocked, 'Your browser blocked 1 tab. Press Send again for the rest.', 'Your browser blocked {n} tabs. Press Send again for the rest.')
      : trn('outbox.opened', chunks.length, 'Opened a GitHub page. Check it and press Submit there.', 'Opened {n} GitHub pages. Check each one and press Submit there.'));
    await this._load();
  }

  async _copyText(text) {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch { /* fall back below: plain-http LAN has no clipboard API */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    // Inside the open modal so the copy is not blocked by inertness.
    this.shadowRoot.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }

  async _askMarkSent(ids, via, lead) {
    const yes = await showConfirm(`${lead} ${tr('outbox.mark_q', 'Mark these as sent?')}`, tr('outbox.mark_t', 'Mark as sent'), tr('outbox.mark_yes', 'Mark sent'), tr('outbox.mark_no', 'Not yet'));
    if (yes) { await Feedback.markSent(this._pid, ids, via); await this._load(); }
  }

  async _copy(g, drafts) {
    const ok = await this._copyText(`${g.title}\n\n${Feedback.buildPlainText(drafts)}`);
    if (!ok) { this._say(tr('outbox.copy_fail', 'Could not copy on this browser.')); return; }
    await this._askMarkSent(drafts.map((i) => i.feedbackId), 'copy', tr('outbox.copied', 'Copied.'));
  }

  async _email(g, drafts) {
    const url = Feedback.buildMailto(g.route.email, drafts);
    if (!url) return;
    window.location.href = url;
    await this._askMarkSent(drafts.map((i) => i.feedbackId), 'email', tr('outbox.mailed', 'Your mail app should have opened.'));
  }

  async _run(fn) {
    if (this._busy) return;
    this._busy = true;
    this._msg = '';
    try { await fn(); } catch (e) { console.error('Outbox action failed:', e); this._say(tr('outbox.error', 'Something went wrong. Please try again.')); }
    finally { this._busy = false; }
  }

  async _dismiss(it) { await this._run(async () => { await Feedback.dismiss(this._pid, it.feedbackId); await this._load(); }); }

  async _delete(it) {
    const yes = await showConfirm(tr('outbox.delete_q', 'Delete this note for good?'), tr('outbox.delete_t', 'Delete'), tr('outbox.delete_yes', 'Delete'), tr('outbox.delete_no', 'Keep'));
    if (yes) await this._run(async () => { await Feedback.remove(this._pid, it.feedbackId); await this._load(); });
  }

  /** "<lesson title> \u00b7 slide N \u00b7 step M". Rows saved before
   *  lessonTitle/slideNumber existed fall back to the raw ids; the ids
   *  always stay in the issue body for the author. */
  _where(it) {
    const lesson = it.lessonTitle || String(it.lessonId || '').replace(/^lessons\//, '').replace(/\.json$/, '');
    const slide = Number.isInteger(it.slideNumber)
      ? tr('outbox.slide', 'slide {n}', { n: it.slideNumber })
      : it.blockId || String(it.blockRef || '').split('/').pop()?.replace(/\.json$/, '') || '';
    const beat = Number.isInteger(it.beatIndex) ? tr('outbox.step', 'step {n}', { n: it.beatIndex + 1 }) : '';
    return [lesson, slide, beat].filter(Boolean).join(' \u00b7 ');
  }

  _date(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  _item(it) {
    const done = it.status !== 'draft';
    const via = { github: 'GitHub', email: tr('outbox.via_email', 'email'), copy: tr('outbox.via_copy', 'copied text') }[it.sentVia] || '';
    return html`
      <li class="item ${done ? 'done' : ''}">
        <div class="i-top">
          <span class="kind">${kindLabel(it.kind)}</span>
          <span class="where">${this._where(it)}</span>
        </div>
        <div class="i-actions">
          ${done ? '' : html`<button class="icon-act" title="${tr('outbox.dismiss', 'Dismiss')}" aria-label="${tr('outbox.dismiss', 'Dismiss')}" ?disabled="${this._busy}" @click="${() => this._dismiss(it)}">${iconClose}</button>`}
          <button class="icon-act danger" title="${tr('outbox.delete', 'Delete')}" aria-label="${tr('outbox.delete', 'Delete')}" ?disabled="${this._busy}" @click="${() => this._delete(it)}">${iconTrash}</button>
        </div>
        ${it.beatExcerpt ? html`<p class="excerpt">${it.beatExcerpt}${it.beatExcerpt.length >= Feedback.MAX_EXCERPT ? '...' : ''}</p>` : ''}
        ${it.text ? html`<p class="text">${it.text}</p>` : ''}
        <div class="status">${it.status === 'sent'
          ? tr('outbox.sent_on', 'Sent {date} by {via}', { date: this._date(it.sentAt), via })
          : it.status === 'dismissed'
            ? tr('outbox.dismissed', 'Dismissed')
            : tr('outbox.flagged_on', 'Flagged {date}', { date: this._date(it.createdAt) })}</div>
      </li>`;
  }

  _group(g) {
    const drafts = g.items.filter((i) => i.status === 'draft');
    const shown = this._showDone ? g.items : drafts;
    if (!shown.length) return '';
    return html`
      <section class="group" aria-label="${g.title}">
        <div class="g-head">
          <h3>${g.title}</h3>
          <span class="g-count">${tr('outbox.waiting', '{n} waiting', { n: drafts.length })}</span>
        </div>
        <ul class="items">${shown.map((it) => this._item(it))}</ul>
        ${drafts.length ? html`
          <div class="send">
            ${g.route.github ? html`<button class="btn-3d btn-primary btn-sm" ?disabled="${this._busy}" @click="${() => this._run(() => this._sendGithub(g, drafts))}">${iconSend} ${tr('outbox.send_github', 'Send on GitHub')}</button>` : ''}
            <button class="btn-3d btn-secondary btn-sm" ?disabled="${this._busy}" @click="${() => this._run(() => this._copy(g, drafts))}">${iconCopy} ${tr('outbox.copy', 'Copy as text')}</button>
            ${g.route.email ? html`<button class="btn-3d btn-secondary btn-sm" ?disabled="${this._busy}" @click="${() => this._run(() => this._email(g, drafts))}">${iconMail} ${tr('outbox.email', 'Email')}</button>` : ''}
          </div>
          ${g.route.github ? html`<p class="route-note">${tr('outbox.github_note', 'Opens the course page on GitHub with the notes filled in. You need a GitHub account to post.')}</p>`
            : html`<p class="route-note">${g.route.email
              ? tr('outbox.email_note', 'This course has no GitHub page. Email the author, or copy the text and send it your own way.')
              : tr('outbox.copy_note', 'This course lists no GitHub page or email. Copy the text and send it your own way.')}</p>`}
        ` : ''}
      </section>`;
  }

  render() {
    if (!this._groups) return html`<p class="empty">${tr('outbox.loading', 'Loading...')}</p>`;
    const all = this._groups.flatMap((g) => g.items);
    const waiting = all.filter((i) => i.status === 'draft').length;
    const done = all.length - waiting;
    return html`
      ${this._msg ? html`<p class="msg" role="status">${this._msg}</p>` : ''}
      ${!waiting && !this._showDone ? html`<p class="empty">${tr('outbox.empty', 'Nothing waiting. When a learner flags a slide, it shows up here for you to send to the course author.')}</p>` : ''}
      ${this._groups.map((g) => this._group(g))}
      ${done ? html`<button class="toggle" aria-expanded="${this._showDone ? 'true' : 'false'}" @click="${() => { this._showDone = !this._showDone; }}">
        ${this._showDone ? tr('outbox.hide_done', 'Hide sent and dismissed') : tr('outbox.show_done', 'Show sent and dismissed ({n})', { n: done })}</button>` : ''}
    `;
  }
}
customElements.define('feedback-outbox', FeedbackOutbox);
