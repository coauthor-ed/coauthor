import '../components/LookSlots.js';
import { LitElement, html, css } from 'lit';
import { ContentLoader } from '../../core/ContentLoader.js';
import { ProgressStore } from '../../core/ProgressStore.js';
import { CourseSourceManager } from '../../core/CourseSourceManager.js';
import { gradeLabel } from '../../core/gradeLabel.js';
import { LookManager } from '../../core/LookManager.js';
import '../components/NeedsUpdateNotice.js';
import { loadCourseManifest, bundleNeedsNewerEngine } from '../../core/courseManifest.js';
import { GamificationMixin } from '../../core/mixins/GamificationMixin.js';
import { LookMixin } from '../../core/mixins/LookMixin.js';
import '../components/ModuleHeroCard.js';
import { moduleLessonRefs, courseProgress } from '../../core/lessonProgressRules.js';
import { iconCheck, iconArrowRight } from '../icons/uiIcons.js';

/**
 * <course-dashboard>: the page of a course bundle with several modules
 * (route #/course/<bundleId>). Home shows such a bundle as one card
 * (lessonProgressRules.groupShelf()); this page lists its modules, in
 * manifest order, as numbered parts that open the existing module page.
 * Everything is derived from the bundle manifest, the module JSON and
 * lessonProgress rows; nothing new is stored.
 */
export class CourseDashboard extends LookMixin(GamificationMixin(LitElement)) {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      max-width: 1060px;
      margin: 0 auto;
      width: 100%;
      box-sizing: border-box;
      padding: var(--space-4) var(--space-4) var(--space-7);
    }
    module-hero-card { margin-bottom: var(--space-6); }
    .section-title {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      font-family: var(--font-heading);
      font-size: 1.25rem;
      margin: 0 0 var(--space-4);
    }
    .section-title::after {
      content: '';
      flex: 1;
      height: 2px;
      border-radius: 2px;
      background: var(--border-color);
    }
    .part-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-3);
      animation: rise 550ms var(--motion-reveal-ease) 200ms both;
    }
    .part-row {
      display: grid;
      grid-template-columns: var(--lesson-num-size) 1fr auto;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4) 20px;
      background: var(--bg-surface);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-lg);
      box-shadow: var(--raise-rest, var(--press-1) var(--lip-color));
      color: var(--text-main);
      text-decoration: none;
      transition: transform 120ms, box-shadow 120ms, border-color var(--motion-fast);
    }
    .part-row:hover {
      border-color: var(--raise-hover-rule, var(--primary-color));
      transform: translateY(var(--hover-lift));
      box-shadow: var(--raise-hover, var(--raise-rest, var(--press-1) var(--lip-color)));
    }
    .part-row:active { transform: translateY(var(--press-travel-sm)); box-shadow: none; }
    .part-row:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }
    .part-num {
      width: var(--lesson-num-size);
      height: var(--lesson-num-size);
      border-radius: var(--radius-tile);
      display: grid;
      place-items: center;
      font-family: var(--font-heading);
      font-weight: var(--fw-strong);
      font-size: 1.25rem;
      background: var(--bg-panel);
      border: var(--rule-w-fixed) solid var(--border-hover);
      color: var(--text-main);
    }
    .part-row.done .part-num {
      background: var(--success-bg);
      border-color: var(--accent-teal);
      color: var(--accent-teal);
    }
    .part-row.current .part-num {
      background: var(--primary-color);
      border-color: var(--primary-hover);
      color: var(--on-primary);
      box-shadow: var(--lip-tile) var(--primary-hover);
    }
    .row-text { min-width: 0; display: grid; gap: 6px; }
    .row-kicker {
      font-size: 0.72rem;
      font-weight: var(--fw-heavy);
      letter-spacing: var(--kicker-tracking, 0.12em);
      text-transform: uppercase;
      color: var(--card-kicker, var(--primary-text));
    }
    .row-text h3 {
      margin: 0;
      font-family: var(--font-heading);
      font-size: 1.1rem;
      line-height: 1.25;
    }
    .row-sub {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-3);
      font-size: 0.82rem;
      font-weight: var(--fw-strong);
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
    .bar {
      position: relative;
      width: 120px;
      height: 6px;
      border-radius: 3px;
      background: var(--meter-track, var(--bg-panel-2));
      overflow: hidden;
    }
    .bar i { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: var(--meter-fill, var(--primary-color)); }
    .go {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-heading);
      font-weight: var(--fw-medium);
      font-size: 0.85rem;
      color: var(--primary-text);
      white-space: nowrap;
    }
    .go svg { width: 16px; height: 16px; }
    @keyframes rise { from { opacity: 0; transform: translateY(var(--rise-distance)); } }

    /* plain: the contents page of a book, as on the module page. */
    :host([data-look="plain"]) module-hero-card { margin-bottom: var(--space-7, 3rem); }
    :host([data-look="plain"]) .section-title {
      align-items: baseline;
      font-size: 1.35rem;
      padding-top: var(--space-3);
      border-top: 1px solid var(--rule-strong, var(--text-main));
    }
    :host([data-look="plain"]) .section-title::after { content: none; }
    .section-count {
      margin-left: auto;
      font-family: var(--font-family);
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
    :host([data-look="plain"]) .part-list {
      gap: 0;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      box-shadow: var(--raise-rest, none);
      overflow: hidden;
    }
    :host([data-look="plain"]) .part-list > li + li .part-row { border-top: 1px solid var(--rule-soft, var(--border-color)); }
    :host([data-look="plain"]) .part-row {
      position: relative;
      grid-template-columns: 3rem 1fr auto;
      padding: 18px 24px;
      background: none;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      transition: background var(--motion-fast);
    }
    :host([data-look="plain"]) .part-row:hover { transform: none; box-shadow: none; background: var(--bg-panel); }
    :host([data-look="plain"]) .part-row:focus-visible { outline-offset: -3px; }
    :host([data-look="plain"]) .part-row.current::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--primary-color);
    }
    :host([data-look="plain"]) .part-num,
    :host([data-look="plain"]) .part-row.done .part-num,
    :host([data-look="plain"]) .part-row.current .part-num {
      width: auto;
      height: auto;
      place-items: start;
      background: none;
      border: 0;
      box-shadow: none;
      border-radius: 0;
      font-size: 1.5rem;
      font-weight: 500;
      line-height: 1;
      color: var(--accent-coral);
      font-variant-numeric: lining-nums tabular-nums;
    }
    :host([data-look="plain"]) .part-row.done .part-num { color: var(--success-text); }
    :host([data-look="plain"]) .part-row.done .part-num svg { width: 22px; height: 22px; }
    :host([data-look="plain"]) .row-kicker { font-family: var(--font-family); font-weight: 600; color: var(--text-muted); }
    :host([data-look="plain"]) .row-text h3 { font-size: 1.12rem; font-weight: 600; }
    :host([data-look="plain"]) .row-sub { font-weight: 500; font-size: 0.8rem; }
    :host([data-look="plain"]) .bar { height: 2px; border-radius: 1px; }
    :host([data-look="plain"]) .go { font-family: var(--font-family); font-weight: 600; }

    @media (max-width: 640px) {
      :host { padding: var(--space-3) 0 var(--space-6); }
      .part-row { grid-template-columns: var(--lesson-num-size-sm) 1fr; padding: 13px 15px; gap: var(--space-3); }
      .part-num { width: var(--lesson-num-size-sm); height: var(--lesson-num-size-sm); border-radius: var(--radius-tile-sm); font-size: 1.05rem; }
      .go { display: none; }
      :host([data-look="plain"]) .part-row { grid-template-columns: 2.25rem 1fr; padding: 14px 16px; }
      :host([data-look="plain"]) .part-num,
      :host([data-look="plain"]) .part-row.done .part-num,
      :host([data-look="plain"]) .part-row.current .part-num { font-size: 1.3rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      .part-list { animation: none; }
      .part-row { transition: none; }
    }
    .error-msg {
      color: var(--error-text);
      background: var(--error-bg);
      padding: var(--space-4);
      border-radius: var(--radius-md);
    }
  `;

  static properties = {
    bundleId: { type: String },
    _needsUpdate: { type: Boolean, state: true },
    profileId: { type: String },
    _course: { type: Object, state: true },
    _byRef: { type: Object, state: true },
    _error: { type: String, state: true },
  };

  constructor() {
    super();
    this.bundleId = '';
    this.profileId = '';
    this._course = null;
    this._byRef = {};
    this._error = null;
  }

  updated(changed) {
    if (changed.has('bundleId')) this._load();
  }

  async _load() {
    const seq = (this._loadSeq = (this._loadSeq || 0) + 1);
    this._course = null;
    this._byRef = {};
    this._error = null;
    this._needsUpdate = false;
    try {
      if (!this.bundleId) throw new Error('No course id provided.');
      const manifest = await loadCourseManifest(this.bundleId);
      if (!manifest) throw new Error(`Course "${this.bundleId}" was not found.`);
      if (await bundleNeedsNewerEngine(this.bundleId)) { if (seq === this._loadSeq) this._needsUpdate = true; return; }
      const paths = (manifest.modules || []).map((rel) => `content/courses/${this.bundleId}/${String(rel).replace(/^\//, '')}`);
      const modules = await Promise.all(paths.map(async (path) => {
        try { return { ...(await ContentLoader.loadJSON('/' + path)), path }; } catch { return null; }
      }));
      if (seq !== this._loadSeq) return;
      const parts = modules.filter(Boolean);
      // The course look and accent, as on the module page.
      LookManager.setCourse(parts[0] || null);
      LookManager.followBundle(this.bundleId, loadCourseManifest);
      const byRef = {};
      if (this.profileId) {
        const rows = await ProgressStore.getAllFromIndex('lessonProgress', 'by_profile', this.profileId);
        for (const r of rows) byRef[String(r.lessonId).replace(/^\//, '')] = r;
      }
      if (seq !== this._loadSeq) return;
      this._byRef = byRef;
      this._course = { manifest, parts };
    } catch (err) {
      if (seq !== this._loadSeq) return;
      LookManager.setCourse(null);
      this._error = err.message;
    }
  }

  render() {
    if (this._needsUpdate) return html`<needs-update-notice></needs-update-notice>`;
    if (this._error) return html`<div class="error-msg">Error loading course: ${this._error}</div>`;
    if (!this._course) return html`<app-loader label="Loading course..."></app-loader>`;

    const { manifest, parts } = this._course;
    const expand = CourseSourceManager.expandRef.bind(CourseSourceManager);
    const partRefs = parts.map((m) => moduleLessonRefs(m, this.bundleId, expand));
    const { done, total, next } = courseProgress(partRefs, this._byRef);
    const at = next || { moduleIndex: 0, lessonIndex: 0 };
    const atPart = parts[at.moduleIndex];
    const atRef = partRefs[at.moduleIndex]?.[at.lessonIndex];
    const lessonTitle = atPart?.lessons?.[at.lessonIndex]?.title?.en || `Lesson ${at.lessonIndex + 1}`;
    const verb = !next ? 'Review' : (this._byRef[atRef]?.currentIndex > 0 ? 'Continue' : 'Start');
    const title = manifest.title?.en || manifest.title || this.bundleId;
    const subject = manifest.subject ? String(manifest.subject).charAt(0).toUpperCase() + String(manifest.subject).slice(1) : '';
    const plain = this.look === 'plain';
    const kicker = [subject, gradeLabel(manifest.grade), `${parts.length} parts`].filter(Boolean).join(' \u00b7 ');

    return html`
      <module-hero-card
        primary
        .kicker=${kicker}
        .heading=${title}
        .tagline=${manifest.description?.en || (typeof manifest.description === 'string' ? manifest.description : '')}
        .progress=${total ? done / total : 0}
        .done=${done}
        .total=${total}
        .ctaLabel=${atRef ? `${verb}: ${lessonTitle}` : ''}
        .ctaHref=${atRef ? `#/lesson/${atRef}?module=${encodeURIComponent(atPart.path)}` : ''}
        .coverSeed=${`course:${this.bundleId}`}
        .coverSubject=${subject}
      ></module-hero-card>

      <h2 class="section-title">${plain ? 'Contents' : 'Parts'}${plain ? html`<span class="section-count">${parts.length} parts</span>` : ''}</h2>
      <ol class="part-list">
        ${parts.map((m, index) => {
          const refs = partRefs[index];
          const n = refs.length;
          const partDone = refs.filter((r) => this._byRef[r]?.completed).length;
          const complete = n > 0 && partDone === n;
          const current = !!next && index === at.moduleIndex;
          const started = partDone > 0 || refs.some((r) => this._byRef[r]);
          const status = complete ? 'Completed' : current ? 'Up next' : started ? 'In progress' : 'Not started';
          const go = complete ? 'Review' : started ? 'Resume' : 'Open';
          const partTitle = m.title?.en || m.title || `Part ${index + 1}`;
          const pct = n ? Math.round((partDone / n) * 100) : 0;
          return html`
            <li>
              <a href="#/module/${m.path}"
                 class="part-row ${complete ? 'done' : ''} ${current ? 'current' : ''}"
                 aria-label="Part ${index + 1}: ${partTitle}, ${partDone} of ${n} lessons done, ${status}">
                <span class="part-num" aria-hidden="true">${complete ? iconCheck : plain ? String(index + 1).padStart(2, '0') : index + 1}</span>
                <span class="row-text">
                  <span class="row-kicker">Part ${index + 1} \u00b7 ${status}</span>
                  <h3>${partTitle}</h3>
                  <span class="row-sub">
                    <span>${partDone ? `${partDone} of ${n} lessons done` : `${n} ${n === 1 ? 'lesson' : 'lessons'}`}</span>
                    ${partDone ? html`<span class="bar" aria-hidden="true"><i style="width: ${pct}%"></i></span>` : ''}
                  </span>
                </span>
                <span class="go" aria-hidden="true">${go}${iconArrowRight}</span>
              </a>
            </li>
          `;
        })}
      </ol>
      ${!parts.length ? html`<p>No parts found in this course.</p>` : ''}
    `;
  }
}

customElements.define('course-dashboard', CourseDashboard);
