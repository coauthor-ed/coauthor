import { LitElement, html, css } from 'lit';
import { ProgressStore } from '../../core/ProgressStore.js';
import { showConfirm } from './dialogs.js';
import { btn3dStyles } from '../sharedStyles.js';
import { iconDownload, iconUpload } from '../icons/uiIcons.js';
import './GuideHelp.js';

/**
 * <data-export-import-panel> — export/import of a profile's own IndexedDB
 * data (cross-device-sync sprint, Stage 5). Demoted from "migration blocker"
 * to "just a good feature to have" once the deployment decision landed that
 * existing LAN-server progress doesn't need to survive the move — but still
 * worth building, because after that move a single browser profile holds
 * the only copy of a child's work, with no server backing it up.
 *
 * Deliberately plain, uncompressed JSON, download/file-picker only — no
 * automated transport, no merge logic (see the sprint doc's own staged
 * ladder, Stage 7, parked).
 *
 * `courseSources`/`courseSourceAggregators` (TRUST_GATED_STORES below) are
 * exported like everything else, but held back on import behind their own
 * explicit confirmation, separate from the "you already have data on this
 * device" one — restoring a registered remote source hands its own JS the
 * same full IndexedDB access `addSource()`'s existing trust warning already
 * gates, so an import must ask the same question, not silently grant it
 * (see CourseSourceManager.js's own trust-boundary comment, and
 * cross-device-sync-and-public-deployment.md §6.1/§4.8: "suggestion
 * requiring confirmation, never a silent write"). An earlier version of
 * this file dropped these stores entirely instead of gating them, which
 * silently broke restoring any course a parent had actually registered —
 * fixed after a real cross-browser restore surfaced it.
 */
const TRUST_GATED_STORES = ['courseSources', 'courseSourceAggregators'];
export class DataExportImportPanel extends LitElement {
  static styles = [btn3dStyles, css`
    /* Shown inside the parent area's "Backup and restore" dialog. */
    :host { display: block; color: var(--text-main); font-family: var(--font-family); }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
    .action {
      display: flex; flex-direction: column; gap: var(--space-3);
      padding: var(--space-4); border: var(--rule-w) solid var(--border-color); border-radius: var(--radius-md);
      background: var(--bg-surface);
    }
    .action h3 { margin: 0; font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: 1rem; }
    .action p { margin: 0; flex: 1; font-size: 0.86rem; line-height: 1.45; color: var(--text-muted); }
    .action .btn-3d { width: 100%; min-height: 44px; }
    input[type="file"] { display: none; }
    .status { margin-top: var(--space-3); font-size: 0.88rem; font-weight: var(--fw-strong); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); }
    .status.ok { background: var(--success-bg); color: var(--success-text); }
    .status.err { background: var(--error-bg); color: var(--error-text); }
    @media (max-width: 600px) { .actions { grid-template-columns: 1fr; } }
  `];

  static properties = {
    _busy: { type: Boolean, state: true },
    _status: { type: Object, state: true },
  };

  constructor() {
    super();
    this._busy = false;
    this._status = null;
  }

  // Every store — the trust gate on TRUST_GATED_STORES applies at import
  // time, not export; there's no reason to leave your own data out of your
  // own backup.
  async _exportableStoreNames(db) {
    return [...db.objectStoreNames];
  }

  /** @returns {Promise<Blob>} */
  async _buildExportBlob() {
    const db = await ProgressStore.getDB();
    const stores = {};
    for (const name of await this._exportableStoreNames(db)) {
      stores[name] = await db.getAll(name);
    }
    const payload = {
      app: 'CoAuthor',
      schemaVersion: db.version,
      exportedAt: new Date().toISOString(),
      stores,
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  }

  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked after the click has had a chance to start the download —
    // revoking synchronously has been observed to race the navigation in
    // some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async _handleExport() {
    this._busy = true;
    this._status = null;
    try {
      const blob = await this._buildExportBlob();
      const stamp = new Date().toISOString().slice(0, 10);
      this._downloadBlob(blob, `coauthor-backup-${stamp}.json`);
      this._status = { type: 'ok', text: 'Backup downloaded.' };
    } catch (e) {
      this._status = { type: 'err', text: `Export failed: ${e.message}` };
    } finally {
      this._busy = false;
    }
  }

  _handlePickFile() {
    this.shadowRoot.getElementById('import-file-input').click();
  }

  async _handleFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-choosing the same file later
    if (!file) return;
    await this._runImport(file);
  }

  async _runImport(file) {
    this._busy = true;
    this._status = null;
    try {
      const text = await file.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('That file is not valid JSON.');
      }
      if (!payload || payload.app !== 'CoAuthor' || typeof payload.stores !== 'object') {
        throw new Error('That file is not a CoAuthor backup.');
      }

      const db = await ProgressStore.getDB();
      if (typeof payload.schemaVersion === 'number' && payload.schemaVersion > db.version) {
        throw new Error(
          `This backup was made by a newer version of the app (schema v${payload.schemaVersion}) than this device has (v${db.version}). Update the app first, then try importing again.`,
        );
      }

      // Auto-backup: if this device already has any data, download a
      // safety copy before writing anything through, so an import a parent
      // regrets can always be undone by re-importing the backup this just
      // produced.
      const exportable = await this._exportableStoreNames(db);
      let hasExistingData = false;
      for (const name of exportable) {
        // eslint-disable-next-line no-await-in-loop
        if ((await db.count(name)) > 0) { hasExistingData = true; break; }
      }
      if (hasExistingData) {
        const proceed = await showConfirm(
          'This device already has saved progress. Importing will overwrite matching records. A safety backup of what\'s currently on this device will download first — keep it somewhere safe.',
          'Import will overwrite existing data',
          'Back up & continue',
          'Cancel',
        );
        if (!proceed) { this._busy = false; return; }
        const backupBlob = await this._buildExportBlob();
        this._downloadBlob(backupBlob, `coauthor-backup-before-import-${new Date().toISOString().slice(0, 10)}.json`);
      }

      let written = 0;
      for (const [storeName, rows] of Object.entries(payload.stores)) {
        // Trust-gated stores are handled separately below, after their own
        // confirmation. Any store name from a future/newer export this
        // device's schema doesn't have is skipped rather than thrown on, so
        // an otherwise-compatible (older-or-equal schemaVersion) backup
        // still imports everything it can.
        if (TRUST_GATED_STORES.includes(storeName) || !db.objectStoreNames.contains(storeName)) continue;
        if (!Array.isArray(rows)) continue;
        const tx = db.transaction(storeName, 'readwrite');
        for (const row of rows) {
          // eslint-disable-next-line no-await-in-loop
          await tx.store.put(row);
        }
        // eslint-disable-next-line no-await-in-loop
        await tx.done;
        written += rows.length;
      }

      written += await this._maybeImportCourseSources(db, payload.stores);

      this._status = { type: 'ok', text: `Imported ${written} record${written === 1 ? '' : 's'}. Reloading…` };
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      this._status = { type: 'err', text: `Import failed: ${e.message}` };
    } finally {
      this._busy = false;
    }
  }

  /**
   * The trust-gate for TRUST_GATED_STORES (see this file's own doc
   * comment). A backup with no registered course sources at all — the
   * common case for a household that only ever uses the auto-seeded
   * defaults — skips this entirely, no dialog shown. Returns how many rows
   * were written (0 if declined or none present).
   */
  async _maybeImportCourseSources(db, stores) {
    const sourceRows = Array.isArray(stores.courseSources) ? stores.courseSources : [];
    const aggregatorRows = Array.isArray(stores.courseSourceAggregators) ? stores.courseSourceAggregators : [];
    if (!sourceRows.length && !aggregatorRows.length) return 0;

    const listText = sourceRows
      .map((r) => `• ${r.manifest?.title?.en || r.manifest?.title || r.bundleId} — ${r.sourceUrl || r.baseUrl || 'unknown URL'}`)
      .join('\n');
    const proceed = await showConfirm(
      `This backup includes ${sourceRows.length} registered course source${sourceRows.length === 1 ? '' : 's'}. Each one can run its own code with this app's full data access once added, the same as adding it fresh:\n\n${listText}\n\nOnly restore these if you added them yourself and trust them.`,
      'Restore registered course sources?',
      'Trust & restore',
      'Skip these',
    );
    if (!proceed) return 0;

    let written = 0;
    for (const storeName of TRUST_GATED_STORES) {
      const rows = stores[storeName];
      if (!Array.isArray(rows) || !db.objectStoreNames.contains(storeName)) continue;
      const tx = db.transaction(storeName, 'readwrite');
      for (const row of rows) {
        // eslint-disable-next-line no-await-in-loop
        await tx.store.put(row);
      }
      // eslint-disable-next-line no-await-in-loop
      await tx.done;
      written += rows.length;
    }
    return written;
  }

  render() {
    return html`
      <div class="actions">
        <div class="action">
          <h3>Save a backup</h3>
          <p>Downloads one file with every child's progress on this device.</p>
          <button class="btn-3d btn-primary btn-sm" ?disabled=${this._busy} @click=${this._handleExport}>${iconDownload} Export backup</button>
        </div>
        <div class="action">
          <h3>Restore a backup</h3>
          <p>Loads a backup file. If this device already has progress, a safety copy of it downloads first.</p>
          <button class="btn-3d btn-secondary btn-sm" ?disabled=${this._busy} @click=${this._handlePickFile}>${iconUpload} Import backup</button>
        </div>
        <input id="import-file-input" type="file" accept="application/json,.json" @change=${this._handleFileChosen}>
      </div>
      ${this._status ? html`<div class="status ${this._status.type}" role="status">${this._status.text}</div>` : ''}
      <guide-help slug="backing-up-progress" label="Backing up and moving progress"></guide-help>
    `;
  }
}

customElements.define('data-export-import-panel', DataExportImportPanel);
