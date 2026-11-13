import { LitElement, html, css, svg } from 'lit';
import { btn3dStyles } from '../sharedStyles.js';
import { LookMixin } from '../../core/mixins/LookMixin.js';
import { appUrl } from '../../core/basePath.js';
import { CourseSourceManager } from '../../core/CourseSourceManager.js';
import { courseShareTarget } from '../../core/shareLinks.js';
import { iconCopy, iconShare, iconClose } from '../icons/uiIcons.js';

/**
 * <share-sheet>: a large QR code for a link, the link itself, Copy link, and
 * the phone's own share menu where there is one (Q-52, specs/W-share.md).
 *
 * Open it with openShareSheet({ url, heading, title }); it removes itself
 * when closed. The QR encoder (vendor/qrcode.js) is loaded on first open
 * only, never eagerly. The QR is always dark on light (--qr-dark on
 * --qr-light, theme.css) with its 4-module quiet zone, in both themes, so a
 * phone camera reads it. Every string arrives through Lit bindings (text and
 * attributes), never innerHTML.
 */

let qrModule = null;
function loadQr() {
  if (!qrModule) qrModule = import(appUrl('vendor/qrcode.js')).catch((e) => { qrModule = null; throw e; });
  return qrModule;
}

const QUIET = 4;

export class ShareSheet extends LookMixin(LitElement) {
  static properties = {
    url: { type: String },
    heading: { type: String },
    subtitle: { type: String },
    shareTitle: { type: String },
    note: { type: String },
    _qr: { state: true },
    _qrError: { state: true },
    _status: { state: true },
  };

  static styles = [btn3dStyles, css`
    :host { position: fixed; inset: 0; z-index: 2000; }
    *, *::before, *::after { box-sizing: border-box; }
    dialog {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--text-main);
      overflow: hidden;
      font-family: var(--font-family);
    }
    dialog::backdrop { background: transparent; }
    .scrim { position: absolute; inset: 0; background: var(--scrim); animation: fade var(--motion-base) ease-out both; }
    .panel {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(440px, calc(100% - 2 * var(--space-5)));
      max-height: calc(100% - 2 * var(--space-5));
      overflow-y: auto;
      overscroll-behavior: contain;
      background: var(--bg-surface);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-xl);
      box-shadow: var(--press-2) var(--lip-color), var(--shadow-lg);
      padding: var(--space-5);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-3);
      text-align: center;
      animation: sheet-in var(--motion-slow) var(--ease-spring) both;
    }
    @keyframes sheet-in {
      from { opacity: 0; transform: translate(-50%, calc(-50% + 16px)) scale(0.98); }
      to { opacity: 1; transform: translate(-50%, -50%); }
    }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    .close {
      position: absolute;
      top: var(--space-3);
      right: var(--space-3);
      width: 40px;
      height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-pill);
      border: var(--rule-w) solid var(--border-color);
      background: var(--bg-surface);
      color: var(--text-main);
      box-shadow: var(--lip) var(--lip-color);
      cursor: pointer;
    }
    .close:active { transform: translateY(var(--press-travel-sm, 3px)); box-shadow: none; }
    .close:focus-visible, .url:focus-visible { outline: var(--focus-ring, 3px solid var(--primary-color)); outline-offset: 2px; }
    .kicker {
      margin: 0;
      font-family: var(--font-ui);
      font-weight: var(--fw-heavy);
      font-size: var(--fs-kicker);
      letter-spacing: var(--kicker-tracking, 0.12em);
      text-transform: uppercase;
      color: var(--primary-text);
    }
    h2 {
      margin: 0;
      padding: 0 var(--space-6);
      font-family: var(--font-heading);
      font-size: var(--fs-h2);
      line-height: var(--lh-tight);
      overflow-wrap: anywhere;
    }
    .sub { margin: 0; color: var(--text-muted); font-size: var(--fs-small); overflow-wrap: anywhere; }
    /* The QR field: light in every theme; the SVG carries the quiet zone. */
    .qr {
      width: min(280px, 72vw);
      aspect-ratio: 1;
      margin: var(--space-2) 0 0;
      padding: 0;
      background: var(--qr-light);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-lg);
      box-shadow: var(--lip) var(--lip-color);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr svg { display: block; width: 100%; height: 100%; }
    .qr .field { fill: var(--qr-light); }
    .qr .mods { fill: var(--qr-dark); }
    .qr-wait { color: var(--qr-dark); font-size: var(--fs-small); padding: var(--space-4); }
    .scan { margin: 0; font-size: var(--fs-small); color: var(--text-muted); }
    .url {
      width: 100%;
      margin: 0;
      padding: var(--space-2) var(--space-3);
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 0.8rem;
      line-height: 1.45;
      color: var(--text-main);
      background: var(--bg-panel);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      overflow-wrap: anywhere;
      word-break: break-all;
      text-align: left;
      user-select: all;
      max-height: 6.5em;
      overflow-y: auto;
    }
    .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-3); width: 100%; }
    .actions .btn-3d { flex: 1 1 140px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); }
    .status { min-height: 1.3em; margin: 0; font-size: var(--fs-small); font-weight: var(--fw-strong); color: var(--success-text, var(--text-main)); }
    .note { margin: 0; font-size: var(--fs-small); color: var(--text-muted); }
    @media (max-width: 600px) {
      .panel {
        left: 0;
        right: 0;
        bottom: 0;
        top: auto;
        width: 100%;
        max-height: calc(100% - var(--space-5));
        transform: none;
        border-radius: var(--radius-xl) var(--radius-xl) 0 0;
        border-bottom: 0;
        box-shadow: var(--shadow-lg);
        padding: var(--space-5) var(--space-4) calc(var(--space-5) + env(safe-area-inset-bottom, 0px));
        animation-name: sheet-up;
      }
      @keyframes sheet-up { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
      .qr { width: min(260px, 70vw); }
    }
    @media (prefers-reduced-motion: reduce) { .panel, .scrim { animation: none; } }

    /* plain: an editorial card, hairline rules, no lip. */
    :host([data-look="plain"]) .panel { border-width: 1px; border-radius: 12px; box-shadow: var(--shadow-lg); animation-timing-function: ease-out; }
    :host([data-look="plain"]) .close { box-shadow: none; border-width: 1px; }
    :host([data-look="plain"]) .qr { border-width: 1px; border-radius: 8px; box-shadow: none; }
    :host([data-look="plain"]) h2 { font-weight: 600; }
    @media (max-width: 600px) {
      :host([data-look="plain"]) .panel { border-radius: 12px 12px 0 0; }
    }
  `];

  constructor() {
    super();
    this.url = '';
    this.heading = 'Share';
    this.subtitle = '';
    this.shareTitle = '';
    this.note = '';
    this._qr = null;
    this._qrError = false;
    this._status = '';
    this._opener = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._opener = document.activeElement;
  }

  firstUpdated() {
    const dlg = this.renderRoot.querySelector('dialog');
    try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
    this.renderRoot.querySelector('.close')?.focus();
    this._makeQr();
  }

  updated(changed) {
    if (changed.has('url') && changed.get('url') !== undefined) this._makeQr();
  }

  async _makeQr() {
    const url = this.url;
    this._qr = null;
    this._qrError = false;
    if (!url) return;
    try {
      const { encodeQR } = await loadQr();
      const q = encodeQR(url, { ecl: 'M' });
      if (url !== this.url) return;
      let d = '';
      for (let y = 0; y < q.size; y++) {
        let x = 0;
        while (x < q.size) {
          if (!q.modules[y][x]) { x++; continue; }
          let w = 1;
          while (x + w < q.size && q.modules[y][x + w]) w++;
          d += `M${x + QUIET} ${y + QUIET}h${w}v1h-${w}z`;
          x += w;
        }
      }
      this._qr = { n: q.size + QUIET * 2, d, version: q.version, modules: q.modules };
    } catch (e) {
      console.warn('[share-sheet] QR not drawn:', e);
      this._qrError = true;
    }
  }

  /** The module matrix on screen, for tests (modules[y][x], true = dark). */
  get qrMatrix() { return this._qr?.modules || null; }

  _close() {
    const dlg = this.renderRoot.querySelector('dialog');
    try { dlg?.close(); } catch { /* already closed */ }
    this.dispatchEvent(new CustomEvent('close'));
    const back = this._opener;
    this.remove();
    if (back && back.isConnected) back.focus?.();
  }

  async _copy() {
    const text = this.url;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); ok = true; }
    } catch { /* fall back below */ }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      this.renderRoot.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    if (!ok) {
      // Select the link so the learner can copy it by hand.
      const el = this.renderRoot.querySelector('.url');
      const sel = this.renderRoot.getSelection?.() || window.getSelection();
      try { const r = document.createRange(); r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r); } catch { /* ignore */ }
    }
    this._status = ok ? 'Link copied' : 'Press and hold the link to copy it';
    clearTimeout(this._statusT);
    this._statusT = setTimeout(() => { this._status = ''; }, 2600);
  }

  async _share() {
    try {
      await navigator.share({ title: this.shareTitle || 'CoAuthor', url: this.url });
    } catch { /* cancelled or not allowed: nothing to do */ }
  }

  render() {
    const q = this._qr;
    const canShare = typeof navigator.share === 'function';
    return html`<dialog aria-labelledby="share-h" @cancel=${(e) => { e.preventDefault(); this._close(); }}>
      <div class="scrim" @click=${() => this._close()}></div>
      <section class="panel">
        <button class="close" aria-label="Close" @click=${() => this._close()}>${iconClose}</button>
        <p class="kicker">Share</p>
        <h2 id="share-h">${this.heading}</h2>
        ${this.subtitle ? html`<p class="sub">${this.subtitle}</p>` : ''}
        <div class="qr" role="img" aria-label=${`QR code for ${this.url}`}>
          ${q ? html`<svg viewBox="0 0 ${q.n} ${q.n}" shape-rendering="crispEdges" aria-hidden="true">${svg`<rect class="field" width=${q.n} height=${q.n}></rect><path class="mods" d=${q.d}></path>`}</svg>`
            : html`<span class="qr-wait">${this._qrError ? 'The QR code could not be drawn. Copy the link instead.' : this.url ? 'Drawing the QR code...' : 'Getting the link...'}</span>`}
        </div>
        <p class="scan">Scan with a phone camera to open it.</p>
        <p class="url" tabindex="0">${this.url}</p>
        <div class="actions">
          <button class="btn-3d btn-secondary" ?disabled=${!this.url} @click=${() => this._copy()}>${iconCopy}<span>Copy link</span></button>
          ${canShare ? html`<button class="btn-3d btn-primary" ?disabled=${!this.url} @click=${() => this._share()}>${iconShare}<span>Share...</span></button>` : ''}
        </div>
        <p class="status" role="status" aria-live="polite">${this._status}</p>
        ${this.note ? html`<p class="note">${this.note}</p>` : ''}
      </section>
    </dialog>`;
  }
}

if (!customElements.get('share-sheet')) customElements.define('share-sheet', ShareSheet);

/**
 * Opens a share sheet over the page. Only one is open at a time.
 * @param {{url:string, heading?:string, title?:string, note?:string, shareTitle?:string}} opts
 *   title is the line under the heading; shareTitle names the link in the phone's share menu.
 * @returns {ShareSheet}
 */
export function openShareSheet({ url, heading = 'Share', title = '', note = '', shareTitle = 'CoAuthor' }) {
  document.querySelector('share-sheet')?.remove();
  const el = document.createElement('share-sheet');
  el.url = url;
  el.heading = heading;
  el.subtitle = title;
  el.shareTitle = shareTitle;
  el.note = note;
  document.body.appendChild(el);
  return el;
}

/**
 * "Share this course": the course repo's landing page when it has one, else
 * the #/add deep link (core/shareLinks.js courseShareTarget). Pass either an
 * added course's `bundleId` or a not-yet-added one's `manifestUrl`.
 * @param {{bundleId?:string, manifestUrl?:string, moduleId?:string, title?:string}} opts
 */
export async function shareCourse({ bundleId = null, manifestUrl = null, moduleId = null, title = '' }) {
  let viaAggregatorUrl = null;
  if (bundleId) {
    try {
      const row = (await CourseSourceManager.listSources()).find((r) => r.bundleId === bundleId);
      if (row) { manifestUrl = manifestUrl || row.sourceUrl; viaAggregatorUrl = row.viaAggregator?.url || null; }
    } catch { /* fall through */ }
  }
  if (!manifestUrl) return null;
  const sheet = openShareSheet({ url: '', heading: 'Share this course', title, shareTitle: title || 'CoAuthor' });
  const target = await courseShareTarget({ manifestUrl, viaAggregatorUrl, moduleId });
  sheet.url = target.url;
  sheet.note = target.kind === 'landing'
    ? 'This opens the course page. From there, one tap adds the course to CoAuthor.'
    : 'This opens CoAuthor and offers to add the course.';
  return sheet;
}
