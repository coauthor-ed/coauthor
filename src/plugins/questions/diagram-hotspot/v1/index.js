/**
 * diagram-hotspot@1 — Click/tap a region on a diagram to answer.
 *
 * Uses DiagramAnnotator core component for rendering.
 * (HLD Appendix C.7)
 */
import '../../../../ui/components/LookSlots.js';
import { QuestionBase } from '../../../../core/components/QuestionBase.js';
import { DiagramAnnotator } from '../../../../core/components/DiagramAnnotator.js';
import { html, css } from 'lit';
import { ContentLoader } from '../../../../core/ContentLoader.js';
import { CourseSourceManager } from '../../../../core/CourseSourceManager.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';

export class DiagramHotspot extends QuestionBase {
  static styles = [btn3dStyles, feedbackAnimStyles, 
    QuestionBase.styles,
    css`
      .diagram-container {
        position: relative;
        display: inline-block;
        max-width: 100%;
      }
      .diagram-container img {
        display: block;
        max-width: 100%;
        height: auto;
        border-radius: var(--radius-xs);
      }
      .no-diagram { color: var(--text-muted); font-style: italic; }
    `,
  ];

  static schema = {
    $id: 'diagram-hotspot@1',
    type: 'object',
    required: ['id', 'type', 'prompt', 'diagramRef', 'correctRegionId'],
    properties: {
      prompt: { type: 'object', minProperties: 1 },
      diagramRef: { type: 'string' },
      correctRegionId: { type: 'string' },
    },
  };

  init(data, prng, ctx) {
    this._data = data;
    // LessonEngine mounts plugins with a single trailing `ctx` arg (no
    // prng), while TestEngine always passes both — so `prng` here may
    // actually be the ctx object. Same detection mcq-single@2 already uses.
    const isPrng = prng && typeof prng.shuffle === 'function';
    this._ctx = isPrng ? (ctx || null) : (prng || null);
    this._selectedRegionId = null;
    this._manifest = null;
    this._annotator = null;
  }

  async connectedCallback() {
    super.connectedCallback?.();
    // Preview needs neither the region manifest fetch nor the annotator —
    // _renderPreviewOnly() below shows the prompt text only.
    if (this._ctx?.previewOnly) return;
    if (this._data?.diagramRef) {
      try {
        const refPath = CourseSourceManager.resolveRef(this._data.diagramRef, this._ctx?.bundleId);
        this._manifest = await ContentLoader.loadJSON(refPath);
      } catch (e) {
        console.warn('[DiagramHotspot] Failed to load manifest:', e);
      }
    }
    this.requestUpdate();
    await this.updateComplete;
    this._initAnnotator();
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this._annotator?.destroy();
    this._annotator = null;
  }

  _initAnnotator() {
    if (!this._manifest) return;
    const container = this.renderRoot.querySelector('.diagram-container');
    const img = this.renderRoot.querySelector('img');
    if (!container || !img) return;
    this._annotator = new DiagramAnnotator(img, container, this._manifest, { mode: 'question' });
    this._annotator.render();
    // setState() can run before this (async manifest fetch above) resolves —
    // TestEngine calls it right after mount, and init() being synchronous
    // means mountPlugin.js's pluginReady resolves before this ever awaits —
    // so a restored selection (Next/Previous navigation, review) would
    // otherwise be silently dropped: setState()'s this._annotator?.… was a
    // no-op against a still-null annotator, and nothing re-applied it once
    // the annotator finally existed.
    if (this._selectedRegionId) this._annotator.setSelectedRegionId(this._selectedRegionId);
    container.addEventListener('region-selected', e => {
      this._selectedRegionId = e.detail.regionId;
    });
  }

  reset() {
    this._selectedRegionId = null;
    this._annotator?.setSelectedRegionId(null);
  }

  getState() {
    return { selectedRegionId: this._selectedRegionId, value: { regionId: this._selectedRegionId } };
  }

  setState(state) {
    if (!state) return;
    const id = state.selectedRegionId || state.value?.regionId || (typeof state.value === 'string' ? state.value : null);
    if (id) {
      this._selectedRegionId = id;
      this._annotator?.setSelectedRegionId(id);
    }
  }

  getResponse() { return { regionId: this._selectedRegionId }; }

  static score(itemData, response) {
    if (!response?.regionId) return { correct: false, score: 0, feedback: 'No region selected.' };
    const correct = response.regionId === itemData.correctRegionId;
    return { correct, score: correct ? 1 : 0, feedback: correct ? 'Correct region!' : 'That is not the right part.' };
  }

  renderInput() {
    if (!this._manifest) {
      return html`<app-loader size="48" label="Loading diagram…"></app-loader>`;
    }
    const imgSrc = CourseSourceManager.resolveRef(this._manifest.image ?? '', this._ctx?.bundleId);
    return html`
      <div class="diagram-container">
        <img src="${imgSrc}" alt="Diagram" />
      </div>
    `;
  }

  static get supportsHints() { return false; }
}

customElements.define('diagram-hotspot-v1', DiagramHotspot);
