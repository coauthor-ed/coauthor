/**
 * DiagramAnnotator — image with fractional-coordinate hotspot regions.
 *
 * Renders a base image with an invisible overlay of hotspot regions
 * (circle or polygon) in fractional 0–1 coordinates so it scales
 * correctly to any container size. (HLD Appendix C.7)
 *
 * Usage:
 *   const da = new DiagramAnnotator(imgEl, containerEl, regionManifest, options);
 *   da.render();
 *   // listen for 'region-selected' custom event on containerEl
 *
 * Options:
 *   { mode: 'question' | 'explore', selectedRegionId?: string }
 */
export class DiagramAnnotator {
  /**
   * @param {HTMLImageElement} imgEl
   * @param {HTMLElement} containerEl  Must be position:relative
   * @param {{ id, regions: Array }} manifest  Region manifest object
   * @param {{ mode?: string }} opts
   */
  constructor(imgEl, containerEl, manifest, opts = {}) {
    this._img = imgEl;
    this._container = containerEl;
    this._manifest = manifest;
    this._mode = opts.mode ?? 'question';
    this._selectedId = null;
    this._overlay = null;
    this._hiddenList = null;
    this._onResize = this._resize.bind(this);
  }

  render() {
    this._buildOverlay();
    this._buildA11yList();
    window.addEventListener('resize', this._onResize);
    // Re-draw once image is loaded (natural dimensions needed)
    if (this._img.complete) {
      this._resize();
    } else {
      this._img.addEventListener('load', () => this._resize(), { once: true });
    }
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this._overlay?.remove();
    this._hiddenList?.remove();
  }

  /** Returns currently selected region id, or null */
  getSelectedRegionId() { return this._selectedId; }

  setSelectedRegionId(id) {
    this._selectedId = id;
    this._updateVisualState();
  }

  _buildOverlay() {
    this._overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(this._overlay.style, {
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      pointerEvents: 'none', overflow: 'visible',
    });
    this._container.style.position = 'relative';
    this._container.appendChild(this._overlay);
  }

  _buildA11yList() {
    // Visually hidden but focusable list so keyboard/SR users can select regions
    this._hiddenList = document.createElement('ul');
    Object.assign(this._hiddenList.style, {
      position: 'absolute', width: '1px', height: '1px',
      overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap',
    });
    this._hiddenList.setAttribute('aria-label', 'Diagram regions');
    this._hiddenList.setAttribute('role', 'listbox');

    (this._manifest.regions || []).forEach(region => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('tabindex', '0');
      li.setAttribute('aria-selected', 'false');
      li.dataset.regionId = region.id;
      li.textContent = region.label?.en ?? region.id;
      li.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._selectRegion(region.id);
        }
      });
      li.addEventListener('click', () => this._selectRegion(region.id));
      this._hiddenList.appendChild(li);
    });
    this._container.appendChild(this._hiddenList);
  }

  _resize() {
    const iw = this._img.clientWidth || this._img.naturalWidth;
    const ih = this._img.clientHeight || this._img.naturalHeight;
    if (!iw || !ih) return;

    this._overlay.setAttribute('viewBox', `0 0 ${iw} ${ih}`);
    this._overlay.setAttribute('width', iw);
    this._overlay.setAttribute('height', ih);
    this._drawRegions(iw, ih);
  }

  _drawRegions(W, H) {
    this._overlay.innerHTML = '';
    (this._manifest.regions || []).forEach(region => {
      let el;
      if (region.shape === 'circle') {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        el.setAttribute('cx', region.cx * W);
        el.setAttribute('cy', region.cy * H);
        el.setAttribute('r', region.r * Math.min(W, H));
      } else {
        // polygon
        const pts = (region.points || []).map(([x, y]) => `${x * W},${y * H}`).join(' ');
        el = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        el.setAttribute('points', pts);
      }
      el.setAttribute('fill', 'rgba(59,130,246,0.15)');
      el.setAttribute('stroke', '#3b82f6');
      el.setAttribute('stroke-width', '2');
      el.style.pointerEvents = 'all';
      el.style.cursor = 'pointer';
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', region.label?.en ?? region.id);
      el.dataset.regionId = region.id;

      el.addEventListener('click', () => this._selectRegion(region.id));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._selectRegion(region.id); }
      });

      if (this._mode === 'explore') {
        // Show label tooltip on hover
        el.addEventListener('mouseenter', () => this._showTooltip(region, el));
        el.addEventListener('mouseleave', () => this._hideTooltip());
      }

      this._overlay.appendChild(el);
      if (region.id === this._selectedId) {
        el.setAttribute('fill', 'rgba(59,130,246,0.4)');
      }
    });
  }

  _selectRegion(id) {
    this._selectedId = id;
    this._updateVisualState();
    this._container.dispatchEvent(new CustomEvent('region-selected', {
      detail: { regionId: id }, bubbles: true, composed: true,
    }));
  }

  _updateVisualState() {
    this._overlay.querySelectorAll('[data-region-id]').forEach(el => {
      const isSelected = el.dataset.regionId === this._selectedId;
      el.setAttribute('fill', isSelected ? 'rgba(59,130,246,0.4)' : 'rgba(59,130,246,0.15)');
    });
    this._hiddenList?.querySelectorAll('[data-region-id]').forEach(li => {
      li.setAttribute('aria-selected', li.dataset.regionId === this._selectedId ? 'true' : 'false');
    });
  }

  _showTooltip(region, el) {
    const label = region.label?.en ?? region.id;
    let tip = this._container.querySelector('.da-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'da-tooltip';
      Object.assign(tip.style, {
        position: 'absolute', background: '#1e293b', color: '#f8fafc',
        padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem',
        pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
      });
      this._container.appendChild(tip);
    }
    tip.textContent = label;
    const bbox = el.getBoundingClientRect();
    const cbbox = this._container.getBoundingClientRect();
    tip.style.left = `${bbox.left - cbbox.left + bbox.width / 2}px`;
    tip.style.top = `${bbox.top - cbbox.top - 30}px`;
    tip.style.display = 'block';
  }

  _hideTooltip() {
    this._container.querySelector('.da-tooltip')?.style.setProperty('display', 'none');
  }
}
