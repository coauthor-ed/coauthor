/**
 * diagram-explore@1 v1 — Explorable labeled diagram block.
 *
 * Tap/click a region to reveal its label/explanation.
 * Uses DiagramAnnotator in 'explore' mode.
 * (HLD Appendix C.7)
 */
import '../../../../ui/components/LookSlots.js';
import { html, css, LitElement } from 'lit';
import { DiagramAnnotator } from '../../../../core/components/DiagramAnnotator.js';
import { ContentLoader } from '../../../../core/ContentLoader.js';
import { CourseSourceManager } from '../../../../core/CourseSourceManager.js';

export class DiagramExploreBlock extends LitElement {
  static styles = css`
    :host { display: block; }
    .diagram-container { position: relative; display: inline-block; max-width: 100%; }
    .diagram-container img { display: block; max-width: 100%; height: auto; border-radius: 6px; }
    .info-box {
      margin-top: 12px; padding: 14px;
      background: var(--primary-light, #e9f2ff);
      border: 1px solid #0052cc; border-radius: 8px;
      color: var(--text-main, #172b4d); min-height: 44px;
      transition: all 0.2s;
    }
    .info-title { font-weight: var(--fw-medium); margin-bottom: 6px; }
    .hint { opacity: 0.7; font-style: italic; }
  `;

  static properties = {
    _manifest: { state: true },
    _selectedLabel: { state: true },
    _selectedDesc: { state: true },
  };

  constructor() {
    super();
    this._manifest = null;
    this._selectedLabel = null;
    this._selectedDesc = null;
    this._annotator = null;
  }

  init(data, ctx) { this._blockData = data; this._ctx = ctx || null; }

  async connectedCallback() {
    super.connectedCallback();
    if (this._blockData?.diagramRef) {
      try {
        const refPath = CourseSourceManager.resolveRef(this._blockData.diagramRef, this._ctx?.bundleId);
        this._manifest = await ContentLoader.loadJSON(refPath);
      } catch (e) {
        console.warn('[DiagramExplore] Failed to load manifest:', e);
      }
    }
    await this.updateComplete;
    this._initAnnotator();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._annotator?.destroy();
    this._annotator = null;
  }

  _initAnnotator() {
    if (!this._manifest) return;
    const container = this.shadowRoot.querySelector('.diagram-container');
    const img = this.shadowRoot.querySelector('img');
    if (!container || !img) return;
    this._annotator = new DiagramAnnotator(img, container, this._manifest, { mode: 'explore' });
    this._annotator.render();
    container.addEventListener('region-selected', e => {
      const region = (this._manifest.regions || []).find(r => r.id === e.detail.regionId);
      this._selectedLabel = region?.label?.en ?? e.detail.regionId;
      this._selectedDesc = region?.description?.en ?? '';
    });
  }

  reportProgress(cb) {
    cb({ completed: false, timeSpentMs: 0, interactionCount: 0 });
  }

  render() {
    if (!this._manifest) return html`<app-loader size="48" label="Loading diagram…"></app-loader>`;
    return html`
      <div class="diagram-container">
        <img src="${CourseSourceManager.resolveRef(this._manifest.image ?? '', this._ctx?.bundleId)}" alt="Explorable diagram" />
      </div>
      <div class="info-box" role="region" aria-live="polite">
        ${this._selectedLabel
          ? html`<div class="info-title">${this._selectedLabel}</div><div>${this._selectedDesc}</div>`
          : html`<div class="hint">Tap a region on the diagram to learn more.</div>`}
      </div>
    `;
  }
}

customElements.define('diagram-explore-v1', DiagramExploreBlock);
