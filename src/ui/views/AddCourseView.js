import '../components/LookSlots.js';
import { LitElement, html, css } from 'lit';
import { CourseSourceManager } from '../../core/CourseSourceManager.js';
import { ProgressStore } from '../../core/ProgressStore.js';
import { AuthService } from '../../core/AuthService.js';
import { LookManager } from '../../core/LookManager.js';
import { EventBus } from '../../core/EventBus.js';
import { OfflinePrefetcher } from '../../core/OfflinePrefetcher.js';
import { InstallPrompt } from '../../core/InstallPrompt.js';
import { needsNewerEngine } from '../../core/engineVersion.js';
import { appUrl } from '../../core/basePath.js';
import { gradeLabel } from '../../core/gradeLabel.js';
import { LookMixin } from '../../core/mixins/LookMixin.js';
import {
  parseAddSrc, cleanModuleId, moduleIdOf, addLink, savePendingAdd, readPendingAdd, clearPendingAdd,
} from '../../core/shareLinks.js';
import { btn3dStyles } from '../sharedStyles.js';
import { subjectIcons, iconCheck, iconCopy, iconDownload, iconPhoneDown, iconArrowRight } from '../icons/uiIcons.js';

/**
 * <add-course-view>: route #/add?src=<bundle base URL>[&module=<module id>]
 * (Q-53b, specs/W-share.md). A shared link or a course landing page sends a
 * learner here. One page, four steps:
 *  1. consent: what the course is, who publishes it, the trust warning;
 *  2. add it to the active profile's shelf (onboarding first when this
 *     device has no profile yet, then this page resumes by itself);
 *  3. save it for offline (OfflinePrefetcher.prefetchCourse) with progress;
 *  4. offer to install the app (InstallPrompt), then open the course.
 * Everything from the link or the course's own files reaches the page only
 * through Lit text and attribute bindings, never innerHTML. A bad or
 * unreachable link adds nothing and says so plainly.
 */

const SAFE_ID = /^[A-Za-z0-9._-]{1,120}$/;
const SAFE_REL = /^(?!.*\.\.)[A-Za-z0-9._/-]{1,240}\.json$/;

const str = (v) => (typeof v === 'string' ? v : (v && typeof v.en === 'string' ? v.en : ''));
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function subjectKey(subject) {
  const s = String(subject || '').toLowerCase();
  if (s.includes('bio')) return 'biology';
  if (s.includes('phys')) return 'physics';
  if (s.includes('chem')) return 'chemistry';
  if (s.includes('math')) return 'math';
  if (s.includes('sci')) return 'science';
  return 'default';
}

export class AddCourseView extends LookMixin(LitElement) {
  static properties = {
    src: { type: String },
    moduleId: { type: String },
    onboarded: { type: Boolean },
    _state: { state: true },
    _error: { state: true },
    _info: { state: true },
    _busy: { state: true },
    _dl: { state: true },
    _install: { state: true },
    _copied: { state: true },
  };

  static styles = [btn3dStyles, css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font-family);
    }
    *, *::before, *::after { box-sizing: border-box; }
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      max-width: 620px;
      margin: 0 auto;
      padding: var(--space-4) var(--space-4) 0;
    }
    .bar a { color: inherit; text-decoration: none; display: inline-flex; }
    .bar .skip { font-size: var(--fs-small); font-weight: var(--fw-strong); color: var(--text-muted); }
    .bar .skip:hover { color: var(--primary-text); }
    main { max-width: 620px; margin: 0 auto; padding: var(--space-4) var(--space-4) var(--space-7); }
    .panel {
      background: var(--bg-surface);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-xl);
      box-shadow: var(--press-2) var(--lip-color), var(--shadow-lg);
      overflow: hidden;
      animation: rise var(--motion-slow) var(--ease-spring) both;
    }
    @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
    .cover {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      height: clamp(120px, 26vw, 170px);
      overflow: hidden;
      color: var(--card-banner-ink);
      background: var(--card-banner-bg, var(--gradient-banner));
      border-bottom: var(--rule-w) solid var(--border-color);
    }
    .cover.biology { background: var(--card-banner-bg, var(--gradient-teal)); }
    .cover.physics { background: var(--card-banner-bg, linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-violet) 100%)); }
    .cover.chemistry { background: var(--card-banner-bg, var(--gradient-gold)); }
    .cover.math { background: var(--card-banner-bg, linear-gradient(135deg, var(--accent-violet) 0%, var(--accent-coral) 100%)); }
    .cover look-cover > * { position: absolute; inset: 0; }
    .cover:has(look-cover > *) > .cover-icon { display: none; }
    .cover-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 76px;
      height: 76px;
      border-radius: var(--radius-lg);
      background: var(--card-banner-track);
      box-shadow: var(--lip) var(--card-banner-track);
    }
    .cover-icon svg { width: 44px; height: 44px; }
    .body { padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-4); }
    .kicker {
      margin: 0;
      font-family: var(--font-ui);
      font-weight: var(--fw-heavy);
      font-size: var(--fs-kicker);
      letter-spacing: var(--kicker-tracking, 0.12em);
      text-transform: uppercase;
      color: var(--primary-text);
    }
    h1 { margin: 0; font-family: var(--font-heading); font-size: var(--fs-h1); line-height: var(--lh-tight); overflow-wrap: anywhere; }
    .from { margin: 0; color: var(--text-muted); font-weight: var(--fw-strong); }
    .desc { margin: 0; line-height: var(--lh-body); }
    .facts { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
    .facts li {
      font-size: var(--fs-small);
      font-weight: var(--fw-strong);
      padding: 4px 12px;
      border-radius: var(--radius-pill);
      background: var(--bg-panel);
      border: 1px solid var(--border-color);
    }
    .trust {
      margin: 0;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      background: var(--warning-bg, var(--bg-panel));
      color: var(--warning-text, var(--text-main));
      font-size: var(--fs-small);
      line-height: var(--lh-body);
    }
    .trust b { display: block; margin-bottom: 2px; }
    .host { font-family: var(--font-mono, ui-monospace, monospace); overflow-wrap: anywhere; }
    .note {
      margin: 0;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      background: var(--info-bg);
      color: var(--info-text, var(--text-main));
      font-size: var(--fs-small);
      line-height: var(--lh-body);
    }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
    .row .btn-3d { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); }
    .row .grow { flex: 1 1 200px; }
    .link { background: none; border: 0; padding: 0; font: inherit; font-weight: var(--fw-strong); color: var(--primary-text); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
    .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
    .step { display: grid; grid-template-columns: 32px 1fr; gap: var(--space-3); align-items: start; }
    .dot {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-pill);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: var(--fw-heavy);
      background: var(--bg-panel);
      border: var(--rule-w) solid var(--border-color);
      color: var(--text-muted);
    }
    .step.done .dot { background: var(--success-color, var(--primary-color)); border-color: transparent; color: var(--on-primary); }
    .step.now .dot { border-color: var(--primary-color); color: var(--primary-text); }
    .dot svg { width: 18px; height: 18px; }
    .step-title { margin: 4px 0 2px; font-weight: var(--fw-heavy); }
    .step-sub { margin: 0; font-size: var(--fs-small); color: var(--text-muted); line-height: var(--lh-body); }
    .meter { height: 10px; border-radius: var(--radius-pill); background: var(--bg-panel); border: 1px solid var(--border-color); overflow: hidden; margin-top: var(--space-2); }
    .meter i { display: block; height: 100%; background: var(--primary-color); border-radius: inherit; transition: width var(--motion-base) ease-out; }
    .install { margin-top: var(--space-2); display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
    .error h1 { font-size: var(--fs-h2); }
    .loading { display: flex; justify-content: center; padding: var(--space-7) 0; }
    .status { min-height: 1.2em; margin: 0; font-size: var(--fs-small); font-weight: var(--fw-strong); color: var(--success-text, var(--text-main)); }
    @media (max-width: 480px) {
      .body { padding: var(--space-4); }
      h1 { font-size: var(--fs-h2); }
      .row .btn-3d { flex: 1 1 100%; }
    }
    @media (prefers-reduced-motion: reduce) { .panel { animation: none; } .meter i { transition: none; } }

    /* plain: editorial card, hairlines, no lip. */
    :host([data-look="plain"]) .panel { border-width: 1px; border-radius: 12px; box-shadow: var(--shadow-lg); animation-timing-function: ease-out; }
    :host([data-look="plain"]) .cover { border-bottom-width: 1px; }
    :host([data-look="plain"]) h1 { font-weight: 600; letter-spacing: -0.01em; }
    :host([data-look="plain"]) .dot { border-width: 1px; }
    :host([data-look="plain"]) .facts li { border-radius: 4px; }
  `];

  constructor() {
    super();
    this.src = '';
    this.moduleId = '';
    this.onboarded = false;
    this._state = 'loading';
    this._error = null;
    this._info = null;
    this._busy = false;
    this._dl = null;
    this._install = InstallPrompt.context();
    this._copied = '';
    this._onInstall = () => { this._install = InstallPrompt.context(); };
  }

  connectedCallback() {
    super.connectedCallback();
    EventBus.on('install:available', this._onInstall);
    EventBus.on('install:done', this._onInstall);
  }

  disconnectedCallback() {
    EventBus.off('install:available', this._onInstall);
    EventBus.off('install:done', this._onInstall);
    super.disconnectedCallback();
  }

  updated(changed) {
    if (changed.has('src') || changed.has('moduleId')) this._load();
  }

  _fail(title, text, { retry = false, whole = null } = {}) {
    this._error = { title, text, retry, whole };
    this._state = 'error';
  }

  async _load() {
    const seq = (this._seq = (this._seq || 0) + 1);
    this._state = 'loading';
    this._error = null;
    this._info = null;
    let parsed;
    try { parsed = parseAddSrc(this.src); } catch (e) { this._fail('This link does not work', e.message); return; }
    const wantModule = this.moduleId ? cleanModuleId(this.moduleId) : null;
    if (this.moduleId && !wantModule) { this._fail('This link does not work', 'The part of the course named in this link is not written correctly.', { whole: parsed.base }); return; }

    let bundle = null;
    let entries = [];
    let reachError = null;
    try {
      await CourseSourceManager.init();
      if (parsed.file !== 'manifest.json') {
        try {
          bundle = await CourseSourceManager.previewBundleManifest(`${parsed.base}bundle-manifest.json`);
          entries = bundle.entries.filter((e) => !e.error);
        } catch (e) { reachError = e; bundle = null; }
      }
      if (!bundle && parsed.file !== 'bundle-manifest.json') {
        const one = await CourseSourceManager.previewManifest(`${parsed.base}manifest.json`);
        if (!one.error) { entries = [one]; reachError = null; } else reachError = reachError || new Error(one.error);
      }
    } catch (e) { reachError = e; }
    if (seq !== this._seq) return;
    if (!entries.length) {
      console.warn('[add-course] could not load', parsed.base, reachError);
      const offline = !navigator.onLine;
      this._fail(offline ? 'You are offline' : 'We could not open this course',
        offline ? 'Connect to the internet, then try the link again.' : 'The course could not be reached, or the link is wrong. Check your internet connection and try again. If it still does not work, ask the person who shared it for a new link.',
        { retry: true });
      return;
    }
    // Ids that reach routes and storage keys must be plain.
    entries = entries.filter((e) => SAFE_ID.test(String(e.bundleId || '')));
    if (!entries.length) { this._fail('This course cannot be added', 'The course files are not in a form CoAuthor can use.'); return; }

    // A module link: find the module by its JSON id across every course of the bundle.
    let target = null;
    if (wantModule) {
      target = await this._findModule(entries, wantModule);
      if (seq !== this._seq) return;
      if (!target) {
        this._fail('This part was not found', 'The course is there, but the part named in this link is not in it any more. You can add the whole course instead.', { whole: parsed.base });
        return;
      }
    }
    const selected = target ? [target.entry] : entries;
    if (selected.some((e) => needsNewerEngine(e.manifest))) {
      this._fail('This course needs a newer CoAuthor', 'Close the app fully and open it again to get the newest version, then try the link again.', { retry: true });
      return;
    }

    // The look the course asks for (module JSON, else its manifest).
    let look = target?.json?.look || selected[0].manifest.look || null;
    let firstModule = target?.json || null;
    if (!look && !firstModule) {
      const rel = (selected[0].manifest.modules || [])[0];
      if (rel) { try { firstModule = await fetchJson(new URL(rel, selected[0].manifestUrl).href); look = firstModule?.look || null; } catch { /* default look */ } }
    }
    if (seq !== this._seq) return;
    if (typeof look === 'string' && look) LookManager.setCourseLook(look);

    const m0 = selected[0].manifest;
    const bundleTitle = str(bundle?.manifest?.title);
    const title = target ? (str(target.json?.title) || str(m0.title)) : (selected.length > 1 ? bundleTitle || str(m0.title) : str(m0.title));
    const partOf = target ? (str(m0.title) !== title ? str(m0.title) : bundleTitle) : (selected.length === 1 && bundleTitle && bundleTitle !== title ? bundleTitle : '');
    const description = target ? (str(target.json?.description) || str(m0.description)) : str(selected.length > 1 ? (bundle?.manifest?.description || m0.description) : m0.description);
    const moduleCount = target ? 1 : selected.reduce((n, e) => n + (e.manifest.modules?.length || 0), 0);
    const lessonCount = target ? (Array.isArray(target.json?.lessons) ? target.json.lessons.length : 0) : selected.reduce((n, e) => n + (e.manifest.lessons?.length || 0), 0);
    const authors = [...new Set(selected.flatMap((e) => (Array.isArray(e.manifest.authors) ? e.manifest.authors : []).map((a) => str(a?.name) || (typeof a === 'string' ? a : '')).filter(Boolean)))];
    let host = '';
    try { host = new URL(selected[0].manifestUrl).host; } catch { /* none */ }
    const audience = m0.audience || null;
    const subject = target?.json?.subject || m0.subject || (Array.isArray(m0.subjects) ? m0.subjects[0] : '') || '';
    const grade = target?.json?.grade ?? m0.grade;

    const sources = await CourseSourceManager.listSources().catch(() => []);
    const added = new Set(sources.map((r) => r.bundleId));
    let enrolled = new Set();
    try {
      const u = await AuthService.getCurrentUser();
      const pid = u?.profileId || u?.id;
      if (pid && this.onboarded) enrolled = new Set((await ProgressStore.listEnrollments(pid)).filter((r) => r.status !== 'removed').map((r) => r.courseId));
    } catch { /* best effort */ }
    if (seq !== this._seq) return;

    this._info = {
      base: parsed.base, bundle, entries, selected, target, title, partOf, description, moduleCount, lessonCount,
      authors, host, audience, subject, grade, look,
      allAdded: selected.every((e) => added.has(e.bundleId)),
      onShelf: selected.every((e) => enrolled.has(e.bundleId)),
    };
    this._state = 'consent';

    // Back from onboarding with this same link already accepted: carry on.
    const pending = readPendingAdd();
    if (pending && this.onboarded && pending.hash === window.location.hash) {
      clearPendingAdd();
      this._accept({ resumed: true });
    }
  }

  async _findModule(entries, id) {
    // Cheap pass: the file name usually is the id.
    for (const entry of entries) {
      for (const rel of entry.manifest.modules || []) {
        if (moduleIdOf(null, rel) !== id || !SAFE_REL.test(String(rel))) continue;
        try {
          const json = await fetchJson(new URL(rel, entry.manifestUrl).href);
          if (moduleIdOf(json, rel) === id) return { entry, rel, json };
        } catch { /* try the full pass */ }
      }
    }
    // Full pass: read every module JSON of the bundle.
    const jobs = [];
    for (const entry of entries) {
      for (const rel of entry.manifest.modules || []) {
        if (!SAFE_REL.test(String(rel))) continue;
        jobs.push(fetchJson(new URL(rel, entry.manifestUrl).href).then((json) => ({ entry, rel, json }), () => null));
      }
    }
    const all = await Promise.all(jobs);
    return all.find((r) => r && moduleIdOf(r.json, r.rel) === id) || null;
  }

  /** The learner said yes (or came back from making a profile). */
  async _accept({ resumed = false } = {}) {
    const info = this._info;
    if (!info || this._busy) return;
    if (!this.onboarded) {
      savePendingAdd({ hash: window.location.hash, audience: info.audience });
      window.location.hash = '#/start';
      return;
    }
    this._busy = true;
    try {
      const user = await AuthService.getCurrentUser();
      const profileId = user?.profileId || user?.id;
      if (!profileId) throw new Error('No profile on this device.');
      // A school learner asks a parent first, as in Discover; a learner
      // who made the profile a moment ago on this same link already said yes.
      if (!resumed && !info.allAdded && !AuthService.isAdult(user)) {
        const { showParentalGateHold } = await import('../components/GateHoldDialog.js');
        const ok = await showParentalGateHold(`Add "${info.title}" to ${user?.name || 'this student'}'s shelf?`);
        if (!ok) { this._busy = false; return; }
      }
      const sources = await CourseSourceManager.listSources();
      const byId = new Map(sources.map((r) => [r.bundleId, r]));
      if (info.bundle && !info.target) {
        const fresh = info.selected.filter((e) => !byId.has(e.bundleId));
        if (fresh.length) await CourseSourceManager.commitBundleManifest(info.bundle.manifestUrl, info.bundle.manifest, fresh);
      } else {
        for (const e of info.selected) {
          const row = byId.get(e.bundleId);
          if (!row || row.sourceUrl !== e.manifestUrl) await CourseSourceManager.addSource(e.manifestUrl);
        }
      }
      for (const e of info.selected) await ProgressStore.enroll(profileId, e.bundleId, { source: 'link' });
      this._state = 'done';
      this._saveOffline();
    } catch (e) {
      console.error('[add-course] could not add:', e);
      this._fail('The course was not added', 'Something went wrong while adding it. Check your internet connection and try again.', { retry: true });
    } finally {
      this._busy = false;
    }
  }

  async _saveOffline() {
    const info = this._info;
    const entries = [];
    const extra = [];
    for (const e of info.selected) {
      const rels = info.target ? [info.target.rel] : [...(e.manifest.modules || []), ...(e.manifest.tests || [])];
      for (const rel of rels) {
        if (typeof rel === 'string' && SAFE_REL.test(rel)) entries.push({ ref: `content/courses/${e.bundleId}/${rel}`, bundleId: e.bundleId });
      }
      if (typeof e.manifest.glossary === 'string' && SAFE_REL.test(e.manifest.glossary)) extra.push(CourseSourceManager.resolveRef(e.manifest.glossary, e.bundleId));
    }
    if (info.look) LookManager.warmLooks([info.look]);
    this._dl = { state: 'running', done: 0, total: 0 };
    let shown = 0;
    // The pages the course opens in, for a course never opened online.
    const views = ['src/ui/views/ModuleDashboard.js', 'src/ui/views/LessonSession.js', 'src/ui/views/CourseDashboard.js', 'src/ui/TestDashboard.js']
      .map((p) => new URL(appUrl(p), window.location.href).href);
    const r = await OfflinePrefetcher.prefetchCourse({
      entries,
      extra,
      modules: views,
      onProgress: ({ done, total }) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        if (pct < shown) return; // never step backwards while new files are found
        shown = pct;
        if (this._dl?.state === 'running') this._dl = { state: 'running', done, total, pct };
      },
    });
    this._dl = r.ok ? { state: 'done', done: r.done, total: r.total, pct: 100 } : { state: r.reason || 'failed' };
  }

  _openHref() {
    const info = this._info;
    if (!info) return '#/';
    if (info.target) {
      const { entry, rel } = info.target;
      return SAFE_REL.test(rel) ? `#/module/content/courses/${entry.bundleId}/${rel}` : '#/';
    }
    if (info.selected.length === 1) {
      const e = info.selected[0];
      const mods = e.manifest.modules || [];
      if (mods.length === 1 && SAFE_REL.test(mods[0])) return `#/module/content/courses/${e.bundleId}/${mods[0]}`;
      if (mods.length > 1) return `#/course/${encodeURIComponent(e.bundleId)}`;
    }
    return '#/';
  }

  async _copyLink() {
    const text = window.location.href;
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); ok = true; } } catch { /* fallback */ }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      this.renderRoot.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    this._copied = ok ? 'Link copied. Now paste it in Chrome or Safari.' : text;
  }

  async _installNow() {
    const outcome = await InstallPrompt.prompt();
    this._install = InstallPrompt.context();
    if (outcome === 'accepted') this._copied = '';
  }

  // ---------- render ----------

  _cover(info) {
    const key = subjectKey(info?.subject);
    const seed = info?.selected?.[0]?.bundleId || 'course';
    return html`<div class="cover ${key}">
      ${this.look === 'plain' ? html`<look-cover seed=${seed} subject=${cap(info?.subject)} heading=${info?.title || ''}></look-cover>` : ''}
      <span class="cover-icon" aria-hidden="true">${subjectIcons[key] || subjectIcons.default}</span>
    </div>`;
  }

  _inAppNote() {
    return html`<div class="note" data-inapp>
      <b>You opened this inside another app.</b> To keep the course and install CoAuthor, open this link in Chrome or Safari:
      tap the menu (the three dots or the share icon) and choose <b>Open in browser</b>. Or copy the link and paste it there.
      <div class="row" style="margin-top: var(--space-2)">
        <button class="btn-3d btn-secondary btn-sm" @click=${() => this._copyLink()}>${iconCopy}<span>Copy link</span></button>
      </div>
      ${this._copied ? html`<p class="status" role="status">${this._copied}</p>` : ''}
    </div>`;
  }

  _renderConsent() {
    const info = this._info;
    const facts = [];
    if (info.moduleCount > 1) facts.push(`${info.moduleCount} modules`);
    if (info.lessonCount) facts.push(`${info.lessonCount} ${info.lessonCount === 1 ? 'lesson' : 'lessons'}`);
    if (info.audience === 'college') facts.push('College');
    else if (info.audience === 'adult') facts.push('Adult learners');
    else if (info.grade != null && info.grade !== '') facts.push(gradeLabel(info.grade));
    facts.push('Works offline');
    const already = info.allAdded;
    const by = info.authors.length ? info.authors.join(', ') : info.host;
    const cta = already
      ? (info.onShelf ? 'Open the course' : 'Put it on my shelf')
      : (this.onboarded ? 'Add this course' : 'Add this course and start');
    return html`
      <article class="panel">
        ${this._cover(info)}
        <div class="body">
          <p class="kicker">${info.target ? 'Add a module' : 'Add a course'}</p>
          <h1>${info.title}</h1>
          ${info.partOf ? html`<p class="from">Part of ${info.partOf}</p>` : ''}
          ${by ? html`<p class="from">By ${by}</p>` : ''}
          ${info.description ? html`<p class="desc">${info.description}</p>` : ''}
          <ul class="facts">${facts.map((f) => html`<li>${f}</li>`)}</ul>
          ${this._install === 'in-app' ? this._inAppNote() : ''}
          ${already ? html`<p class="note">This course is already on this device.${info.onShelf ? '' : ' It will be put on your shelf.'}</p>` : html`
            <p class="trust"><b>Only add courses you trust.</b>
              A course can run its own interactive code inside CoAuthor, with the same access the app has, including saved progress on this device.
              This one comes from <span class="host">${info.host}</span>.</p>`}
          <div class="row">
            ${already && info.onShelf
              ? html`<a class="btn-3d btn-primary btn-lg grow" href=${this._openHref()} @click=${() => this._saveOffline()}>${cta}${iconArrowRight}</a>`
              : html`<button class="btn-3d btn-primary btn-lg grow" ?disabled=${this._busy} @click=${() => this._accept()}>${this._busy ? 'Adding...' : cta}</button>`}
          </div>
          ${this.onboarded ? '' : html`<p class="step-sub">Next you make a profile for this device (just a name). Then the course is added and saved for offline use.</p>`}
        </div>
      </article>`;
  }

  _renderInstall() {
    const c = this._install;
    if (c === 'installed') return '';
    let body;
    if (c === 'prompt') {
      body = html`<p class="step-sub">Put CoAuthor on your home screen, like an app. It opens without the browser bar and works offline.</p>
        <button class="btn-3d btn-secondary btn-sm" @click=${() => this._installNow()}>${iconPhoneDown}<span>Install app</span></button>`;
    } else if (c === 'ios') {
      body = html`<p class="step-sub">In Safari, tap the Share button (the square with an arrow), then <b>Add to Home Screen</b>.</p>`;
    } else if (c === 'firefox') {
      body = html`<p class="step-sub">Open the Firefox menu (the three dots), then tap <b>Install</b> or <b>Add to Home screen</b>.</p>`;
    } else if (c === 'in-app') {
      body = this._inAppNote();
    } else {
      body = html`<p class="step-sub">If you like, install CoAuthor from your browser menu: look for <b>Install app</b> or <b>Add to Home screen</b>.</p>`;
    }
    return html`<li class="step now"><span class="dot">${iconPhoneDown}</span><div>
      <p class="step-title">Install the app (if you like)</p>
      <div class="install">${body}</div>
    </div></li>`;
  }

  _renderDone() {
    const info = this._info;
    const dl = this._dl || { state: 'running', pct: 0 };
    const pct = dl.pct || 0;
    let dlTitle = 'Saving for offline use';
    let dlSub = dl.total ? `${pct}% (${dl.done} of ${dl.total} files)` : 'Starting...';
    let dlDone = false;
    if (dl.state === 'done') { dlTitle = 'Saved for offline use'; dlSub = 'The lessons now work without internet.'; dlDone = true; }
    else if (dl.state === 'offline') { dlTitle = 'Not saved for offline yet'; dlSub = 'You are offline. Each lesson is saved the first time you open it online.'; }
    else if (dl.state === 'no-worker') { dlTitle = 'Offline saving is not available here'; dlSub = 'This browser cannot keep lessons offline at this address. The course still works online.'; }
    else if (dl.state !== 'running') { dlTitle = 'Not saved for offline yet'; dlSub = 'Each lesson is saved the first time you open it.'; }
    return html`
      <article class="panel">
        ${this._cover(info)}
        <div class="body">
          <p class="kicker">${info.target ? 'Module added' : 'Course added'}</p>
          <h1>${info.title}</h1>
          <ol class="steps">
            <li class="step done"><span class="dot">${iconCheck}</span><div>
              <p class="step-title">On your shelf</p>
              <p class="step-sub">Find it on the home page any time.</p>
            </div></li>
            <li class="step ${dlDone ? 'done' : 'now'}"><span class="dot">${dlDone ? iconCheck : iconDownload}</span><div>
              <p class="step-title">${dlTitle}</p>
              <p class="step-sub" role="status" aria-live="polite">${dlSub}</p>
              ${dl.state === 'running' ? html`<div class="meter" role="progressbar" aria-label="Saving for offline use" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${pct}><i style="width: ${pct}%"></i></div>` : ''}
            </div></li>
            ${this._renderInstall()}
          </ol>
          <div class="row">
            <a class="btn-3d btn-primary btn-lg grow" href=${this._openHref()}>Open the course${iconArrowRight}</a>
          </div>
          ${dl.state === 'running' ? html`<p class="step-sub">You can start now. Saving goes on in the background.</p>` : ''}
        </div>
      </article>`;
  }

  _renderError() {
    const e = this._error || {};
    return html`
      <article class="panel error">
        <div class="body">
          <p class="kicker">Add a course</p>
          <h1>${e.title}</h1>
          <p class="desc">${e.text}</p>
          <p class="step-sub">Nothing was added to this device.</p>
          <div class="row">
            ${e.retry ? html`<button class="btn-3d btn-primary" @click=${() => this._load()}>Try again</button>` : ''}
            ${e.whole ? html`<a class="btn-3d btn-primary" href=${addLink(e.whole).replace(/^[^#]*/, '')}>Add the whole course</a>` : ''}
            <a class="btn-3d btn-secondary" href=${this.onboarded ? '#/discover' : '#/welcome'}>${this.onboarded ? 'Find courses in Discover' : 'About CoAuthor'}</a>
          </div>
        </div>
      </article>`;
  }

  render() {
    let body;
    if (this._state === 'loading') body = html`<div class="loading"><app-loader label="Opening the course..."></app-loader></div>`;
    else if (this._state === 'error') body = this._renderError();
    else if (this._state === 'done') body = this._renderDone();
    else body = this._renderConsent();
    return html`
      <header class="bar">
        <a href=${this.onboarded ? '#/' : '#/welcome'} aria-label="CoAuthor home"><app-logo></app-logo></a>
        ${this._state === 'done' ? '' : html`<a class="skip" href=${this.onboarded ? '#/' : '#/welcome'}>Not now</a>`}
      </header>
      <main>${body}</main>`;
  }
}

if (!customElements.get('add-course-view')) customElements.define('add-course-view', AddCourseView);
