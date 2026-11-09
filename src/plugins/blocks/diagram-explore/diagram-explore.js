import { html, css } from 'lit';
import { DiagramAnnotator } from '../../../core/components/DiagramAnnotator.js';

export class DiagramExplorePlugin extends DiagramAnnotator {
  static styles = [
    DiagramAnnotator.styles,
    css`
      .info-box {
        margin-top: 1rem;
        padding: 16px;
        background: var(--primary-light, #e9f2ff);
        border: 1px solid #0052cc;
        border-radius: 8px;
        color: var(--text-main, #172b4d);
        min-height: 50px;
      }
      .info-title {
        font-weight: var(--fw-medium);
        margin-bottom: 8px;
        font-size: 1.05rem;
      }
    `
  ];

  render() {
    if (!this._data) return html``;
    
    // We get the base template from super.render()
    const baseTemplate = super.render();
    
    // Find the currently selected hotspot
    const selectedHotspot = this._data.hotspots.find(h => h.id === this._selectedHotspotId);

    return html`
      ${baseTemplate}
      ${selectedHotspot ? html`
        <div class="info-box" role="region" aria-live="polite">
          <div class="info-title">${selectedHotspot.title || "Information"}</div>
          <div>${selectedHotspot.description}</div>
        </div>
      ` : html`
        <div class="info-box" style="opacity: 0.7;">
          Select a point on the diagram to learn more.
        </div>
      `}
    `;
  }
}

customElements.define('diagram-explore-v1', DiagramExplorePlugin);
