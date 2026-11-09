import { LitElement, html, css } from 'lit';
import { CourseSourceManager } from '../../core/CourseSourceManager.js';
import { ProgressStore } from '../../core/ProgressStore.js';
import { showConfirm } from './dialogs.js';
import './GuideHelp.js';

/**
 * Parent-dashboard panel for managing remote course sources — bundles
 * hosted somewhere other than this app's own origin, added by pointing at
 * their manifest.json (see CourseSourceManager). This app's own built-in
 * courses need no entry here; they always just work.
 *
 * A remote source can ship its own executable simulation JS, loaded via
 * `import()` from wherever it's hosted — so adding one is a real trust
 * decision, not just "point at some data". This panel makes that explicit
 * before addSource() is ever called, and never adds silently.
 *
 * A pasted URL ending in `bundle-manifest.json` is treated as an aggregator
 * (see CourseSourceManager.previewBundleManifest()) — a curated list of many
 * manifest.json URLs, possibly at different origins, so one paste can
 * register a whole subject's worth of chapters instead of one at a time.
 * Anything else is treated as today's single-course manifest.json. Either
 * path always resolves to a review list before anything is registered —
 * the review step is what carries the trust-warning obligation for however
 * many origins ended up involved.
 */
export class CourseSourcesPanel extends LitElement {
  static styles = css`
    /* Shown inside the parent area's "Course sources" dialog. Engine tokens
       only (invariant 9), matching src/ui/components/parent/parentStyles.js. */
    :host { display: block; color: var(--text-main); font-family: var(--font-family); }
    * { box-sizing: border-box; }
    .cs-list { display: flex; flex-direction: column; gap: var(--space-2); margin: 0 0 var(--space-4); }
    .cs-row, .cs-agg-row {
      display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
      padding: var(--space-3) var(--space-4); border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-md); background: var(--bg-surface);
    }
    .cs-agg-row { border-style: dashed; margin-bottom: var(--space-2); }
    .cs-row > div:first-child, .cs-agg-row > div:first-child { min-width: 0; }
    .cs-row-title { font-weight: var(--fw-heavy); font-size: 0.95rem; }
    .cs-row-meta { color: var(--text-muted); font-size: 0.78rem; margin-top: 2px; overflow-wrap: anywhere; }
    .cs-empty { color: var(--text-muted); font-size: 0.9rem; padding: var(--space-4); border: 2px dashed var(--border-hover); border-radius: var(--radius-md); text-align: center; }
    .cs-remove-btn, .cs-agg-btn {
      min-height: 44px; padding: 0 var(--space-3); flex: none;
      background: var(--bg-surface); border: var(--rule-w) solid var(--border-color); color: var(--text-main);
      border-radius: var(--radius-sm); font: inherit; font-weight: var(--fw-heavy); font-size: 0.82rem; cursor: pointer; white-space: nowrap;
      box-shadow: var(--lip) var(--lip-color);
    }
    .cs-remove-btn { color: var(--error-text); }
    .cs-remove-btn:hover, .cs-agg-btn:hover { border-color: var(--border-hover); }
    .cs-remove-btn:active, .cs-agg-btn:active { transform: translateY(var(--press-travel-sm)); box-shadow: none; }
    .cs-remove-btn:focus-visible, .cs-agg-btn:focus-visible, .cs-add-btn:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }
    .cs-add-row { display: flex; gap: var(--space-2); margin-top: var(--space-4); flex-wrap: wrap; }
    .cs-add-input {
      flex: 1 1 220px; min-width: 0; min-height: 44px; padding: 0 var(--space-3); border-radius: var(--radius-sm);
      border: var(--rule-w) solid var(--border-color); background: var(--bg-base);
      color: var(--text-main); font: inherit; font-size: 0.9rem;
    }
    .cs-add-input:focus { outline: var(--focus-ring); outline-offset: 0; }
    .cs-add-btn {
      min-height: 44px; padding: 0 var(--space-4); border-radius: var(--radius-sm); border: none;
      background: var(--primary-color); color: var(--on-primary); box-shadow: var(--press-1) var(--primary-hover);
      font-family: var(--font-heading); font-weight: var(--fw-heavy); font-size: 0.9rem; cursor: pointer;
    }
    .cs-add-btn:active:not(:disabled) { transform: translateY(var(--press-travel)); box-shadow: none; }
    .cs-add-btn:disabled, .cs-agg-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .cs-feedback { margin-top: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); font-size: 0.88rem; font-weight: var(--fw-strong); }
    .cs-feedback.err { background: var(--error-bg); color: var(--error-text); }
    .cs-feedback.ok { background: var(--success-bg); color: var(--success-text); }
    .cs-badge {
      display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: var(--radius-pill);
      font-size: 0.7rem; font-weight: var(--fw-strong); color: var(--text-muted); background: var(--bg-panel); vertical-align: middle;
    }
    .cs-agg-section { margin-top: var(--space-5); }
    .cs-agg-heading { font-size: var(--fs-kicker); font-weight: var(--fw-heavy); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: var(--space-2); }
    .cs-agg-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; justify-content: flex-end; }
    .cs-review {
      margin-top: var(--space-4); padding: var(--space-4); border: var(--rule-w) solid var(--warn-text);
      border-radius: var(--radius-md); background: var(--warn-bg);
    }
    .cs-review-title { font-weight: var(--fw-heavy); color: var(--warn-text); margin-bottom: 4px; }
    .cs-review-meta { font-size: 0.85rem; color: var(--text-soft); margin-bottom: var(--space-3); line-height: 1.45; }
    .cs-review-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: var(--space-2); max-height: 220px; overflow-y: auto; }
    .cs-review-row { font-size: 0.85rem; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .cs-review-row.ok { color: var(--text-main); }
    .cs-review-row.skip { color: var(--text-muted); }
    .cs-review-row.err { color: var(--error-text); }
    .cs-review-origin { color: var(--text-muted); font-size: 0.78rem; overflow-wrap: anywhere; }
    @media (max-width: 600px) {
      .cs-row, .cs-agg-row { flex-wrap: wrap; }
      .cs-remove-btn, .cs-add-btn { flex: 1 1 auto; }
      .cs-agg-actions { width: 100%; justify-content: stretch; }
      .cs-agg-actions .cs-agg-btn { flex: 1; }
    }
  `;

  static properties = {
    _sources: { type: Array, state: true },
    _aggregators: { type: Array, state: true },
    _url: { type: String, state: true },
    _busy: { type: Boolean, state: true },
    _feedback: { type: Object, state: true }, // { text, type: 'ok'|'err' }
    _pendingReview: { type: Object, state: true }, // { manifestUrl, manifest, entries, mode: 'add'|'refresh', aggregatorId? }
  };

  constructor() {
    super();
    this._sources = [];
    this._aggregators = [];
    this._url = '';
    this._busy = false;
    this._feedback = null;
    this._pendingReview = null;
  }

  async connectedCallback() {
    super.connectedCallback();
    await this._refresh();
    await this._refreshAggregators();
  }

  async _refresh() {
    this._sources = await CourseSourceManager.listSources();
  }

  async _refreshAggregators() {
    this._aggregators = await CourseSourceManager.listAggregators();
  }

  async _handleAdd() {
    const url = this._url.trim();
    if (!url) return;

    this._busy = true;
    this._feedback = null;
    try {
      if (/bundle-manifest\.json$/i.test(url)) {
        const preview = await CourseSourceManager.previewBundleManifest(url);
        this._pendingReview = { ...preview, mode: 'add' };
      } else {
        await this._addSingleSource(url);
      }
    } catch (e) {
      this._feedback = { text: e.message, type: 'err' };
    } finally {
      this._busy = false;
    }
  }

  async _addSingleSource(url) {
    const proceed = await showConfirm(
      `Adding this source lets it load lessons AND run its own simulation code inside this app, with the same access this app already has (including your child's saved progress data). Only add a source you trust.\n\nURL: ${url}`,
      'Add a remote course source?',
      'Add it', 'Cancel',
    );
    if (!proceed) return;

    const row = await CourseSourceManager.addSource(url);
    // Unlike Discover (bookshelf/identity-groundwork sprint), this flow has
    // always meant "visible to every child on this device" — once
    // HomeDashboard filters by enrollment, a source added here needs an
    // enrollment row for every existing profile or it would silently
    // disappear from all of them.
    await ProgressStore.enrollAllProfiles(row.bundleId, { source: 'course-sources-panel' });
    this._url = '';
    this._feedback = { text: `Added "${row.manifest?.title?.en || row.manifest?.title || row.bundleId}".`, type: 'ok' };
    await this._refresh();
  }

  _cancelReview() {
    this._pendingReview = null;
  }

  async _confirmReview() {
    const { manifestUrl, manifest, entries } = this._pendingReview;
    this._busy = true;
    this._feedback = null;
    try {
      const results = await CourseSourceManager.commitBundleManifest(manifestUrl, manifest, entries);
      // Same "visible to every child" compatibility fix as _addSingleSource()
      // above, for each bundle this aggregator just registered.
      for (const row of results.added) {
        await ProgressStore.enrollAllProfiles(row.bundleId, { source: 'course-sources-panel' });
      }
      this._pendingReview = null;
      this._url = '';
      const failedNote = results.failed.length ? `, ${results.failed.length} failed` : '';
      this._feedback = {
        text: `Added ${results.added.length} course${results.added.length === 1 ? '' : 's'}${failedNote}.`,
        type: results.failed.length ? 'err' : 'ok',
      };
      await this._refresh();
      await this._refreshAggregators();
    } catch (e) {
      this._feedback = { text: e.message, type: 'err' };
    } finally {
      this._busy = false;
    }
  }

  async _handleCheckAggregator(agg) {
    this._busy = true;
    this._feedback = null;
    try {
      const preview = await CourseSourceManager.refreshAggregator(agg.bundleManifestId);
      if (!preview.entries.length) {
        this._feedback = { text: `No new courses found in "${agg.title?.en || agg.title || agg.bundleManifestId}".`, type: 'ok' };
      } else {
        this._pendingReview = { ...preview, mode: 'refresh' };
      }
    } catch (e) {
      this._feedback = { text: e.message, type: 'err' };
    } finally {
      this._busy = false;
    }
  }

  async _handleForgetAggregator(agg) {
    const proceed = await showConfirm(
      `Stop tracking "${agg.title?.en || agg.title || agg.bundleManifestId}" as a bundle source? Courses already added from it stay installed — remove those individually below if you want them gone too.`,
      'Forget bundle source', 'Forget', 'Cancel',
    );
    if (!proceed) return;
    await CourseSourceManager.removeAggregator(agg.bundleManifestId);
    await this._refreshAggregators();
  }

  async _handleRemove(bundleId, title) {
    const proceed = await showConfirm(
      `Remove "${title}"? Lessons already downloaded/cached may still work offline until the cache is cleared, but new content from it won't load.`,
      'Remove course source', 'Remove', 'Cancel',
    );
    if (!proceed) return;
    await CourseSourceManager.removeSource(bundleId);
    await this._refresh();
  }

  _renderReviewPanel() {
    const { manifest, entries, mode } = this._pendingReview;
    const resolvable = entries.filter((e) => !e.error);
    const origins = new Set(resolvable.map((e) => { try { return new URL(e.manifestUrl).origin; } catch { return e.manifestUrl; } }));
    const addable = resolvable.filter((e) => !e.alreadyAdded);
    const already = resolvable.filter((e) => e.alreadyAdded);
    const failed = entries.filter((e) => e.error);
    const heading = mode === 'refresh'
      ? `New courses in "${manifest.title?.en || manifest.title || manifest.bundleManifestId}"`
      : `"${manifest.title?.en || manifest.title || manifest.bundleManifestId}"`;

    return html`
      <div class="cs-review">
        <div class="cs-review-title">Check before adding: ${heading}</div>
        <div class="cs-review-meta">
          This will register ${addable.length} course${addable.length === 1 ? '' : 's'} from
          ${origins.size} website${origins.size === 1 ? '' : 's'}. Each will be able to load lessons AND
          run its own code inside this app, with the same access this app already has. Only continue if
          you trust every website listed below.
        </div>
        <div class="cs-review-list">
          ${addable.map((e) => html`
            <div class="cs-review-row ok">
              <span>${e.manifest?.title?.en || e.manifest?.title || e.bundleId}</span>
              <span class="cs-review-origin">${new URL(e.manifestUrl).origin}</span>
            </div>
          `)}
          ${already.map((e) => html`
            <div class="cs-review-row skip">${e.manifest?.title?.en || e.bundleId} (already added)</div>
          `)}
          ${failed.map((e) => html`
            <div class="cs-review-row err">${e.manifestUrl || '(missing URL)'}: ${e.error}</div>
          `)}
        </div>
        <div class="cs-add-row">
          <button class="cs-remove-btn" @click=${() => this._cancelReview()}>Cancel</button>
          <button class="cs-add-btn" ?disabled=${this._busy || !addable.length} @click=${() => this._confirmReview()}>
            ${this._busy ? 'Adding…' : `Add ${addable.length} course${addable.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    `;
  }

  render() {
    const aggById = new Map(this._aggregators.map((a) => [a.bundleManifestId, a]));
    return html`
      <guide-help slug="adding-a-course-source" label="What a course source is, and when to trust one"></guide-help>
      <div class="cs-list">
        ${this._sources.length ? this._sources.map((s) => html`
          <div class="cs-row">
            <div>
              <div class="cs-row-title">
                ${s.manifest?.title?.en || s.manifest?.title || s.bundleId}
                ${s.viaAggregator ? html`<span class="cs-badge" title=${s.viaAggregator.url}>via ${aggById.get(s.viaAggregator.bundleManifestId)?.title?.en || aggById.get(s.viaAggregator.bundleManifestId)?.title || s.viaAggregator.bundleManifestId}</span>` : ''}
              </div>
              <div class="cs-row-meta">${s.bundleId} · ${s.baseUrl}</div>
            </div>
            <button class="cs-remove-btn" @click=${() => this._handleRemove(s.bundleId, s.manifest?.title?.en || s.bundleId)}>Remove</button>
          </div>
        `) : html`<div class="cs-empty">No courses from other websites yet. Built-in courses always load.</div>`}
      </div>

      ${this._aggregators.length ? html`
        <div class="cs-agg-section">
          <div class="cs-agg-heading">Bundle sources</div>
          ${this._aggregators.map((agg) => html`
            <div class="cs-agg-row">
              <div>
                <div class="cs-row-title">${agg.title?.en || agg.title || agg.bundleManifestId}</div>
                <div class="cs-row-meta">${(agg.memberBundleIds || []).length} course${(agg.memberBundleIds || []).length === 1 ? '' : 's'} · ${agg.url}</div>
              </div>
              <div class="cs-agg-actions">
                <button class="cs-agg-btn" ?disabled=${this._busy} @click=${() => this._handleCheckAggregator(agg)}>Check for new</button>
                <button class="cs-agg-btn" ?disabled=${this._busy} @click=${() => this._handleForgetAggregator(agg)}>Forget</button>
              </div>
            </div>
          `)}
        </div>
      ` : ''}

      <div class="cs-add-row">
        <input
          class="cs-add-input"
          type="url"
          placeholder="https://example.com/courses/some-bundle/manifest.json (or a bundle-manifest.json URL)"
          .value=${this._url}
          @input=${(e) => this._url = e.target.value}
          @keydown=${(e) => { if (e.key === 'Enter') this._handleAdd(); }}
          ?disabled=${this._busy}
        />
        <button class="cs-add-btn" @click=${() => this._handleAdd()} ?disabled=${this._busy || !this._url.trim()}>
          ${this._busy ? 'Working…' : 'Add source'}
        </button>
      </div>
      ${this._pendingReview ? this._renderReviewPanel() : ''}
      ${this._feedback ? html`<div class="cs-feedback ${this._feedback.type}">${this._feedback.text}</div>` : ''}
    `;
  }
}

customElements.define('course-sources-panel', CourseSourcesPanel);
