import { InteractiveSceneBase } from './InteractiveSceneBase.js';

export class DragDropSimulation extends InteractiveSceneBase {
  constructor(container, config) {
    super(container, config);
    this.palette = [];
    this.dropZones = [];
    this.placed = new Map();
    this.connections = [];
  }

  async setup() {
    await super.setup();
    this.container.style.position = 'relative';
    this.container.style.width = '100%';
    this.container.style.minHeight = '400px';
    this.container.style.display = 'flex';
    
    const paletteContainer = document.createElement('div');
    paletteContainer.className = 'dd-palette';
    paletteContainer.style.cssText = 'flex: 1; padding: 10px; border-right: 1px solid var(--border-color);';
    this.createPaletteUI(paletteContainer);
    
    const zoneContainer = document.createElement('div');
    zoneContainer.className = 'dd-zones';
    zoneContainer.style.cssText = 'flex: 2; position: relative; padding: 10px;';
    this.createDropZoneUI(zoneContainer);
    
    this.container.appendChild(paletteContainer);
    this.container.appendChild(zoneContainer);
  }

  createPaletteUI(container) {
    // Basic implementation for DOM draggable elements
    for (const item of this.palette) {
      const el = document.createElement('div');
      el.className = 'dd-item';
      el.draggable = true;
      el.dataset.id = item.id;
      el.textContent = item.label || item.id;
      el.style.cssText = 'padding: 8px; margin-bottom: 8px; background: var(--sim-accent); color: white; border-radius: 4px; cursor: grab; text-align: center;';
      
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
      });
      container.appendChild(el);
    }
  }

  createDropZoneUI(container) {
    for (const zone of this.dropZones) {
      const el = document.createElement('div');
      el.className = 'dd-zone';
      el.dataset.zoneId = zone.id;
      el.textContent = zone.label || `Zone: ${zone.id}`;
      el.style.cssText = `position: absolute; left: ${zone.x}px; top: ${zone.y}px; width: ${zone.w || 100}px; height: ${zone.h || 50}px; border: 2px dashed var(--sim-label); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--sim-label);`;
      
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.style.borderColor = 'var(--sim-accent)';
      });
      
      el.addEventListener('dragleave', () => {
        el.style.borderColor = 'var(--sim-label)';
      });
      
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.style.borderColor = 'var(--sim-label)';
        const itemId = e.dataTransfer.getData('text/plain');
        
        const { valid, feedback } = this.validatePlacement(itemId, zone.id);
        if (valid) {
          this.placed.set(zone.id, itemId);
          el.textContent = this.palette.find(i => i.id === itemId)?.label || itemId;
          el.style.background = 'var(--sim-accent)';
          el.style.color = 'white';
          el.style.borderStyle = 'solid';
          this._onPlacementComplete();
        } else {
          this._renderFeedback(feedback || 'Incorrect placement', true);
        }
      });
      container.appendChild(el);
    }
  }

  validatePlacement(itemId, zoneId) {
    const validMap = this._getValidPlacements();
    const validItems = validMap.get(zoneId);
    if (validItems && validItems.has(itemId)) {
      return { valid: true };
    }
    return { valid: false, feedback: 'That component does not belong there.' };
  }

  drawConnection(fromId, toId) {
    // SVG rendering hook
  }

  _getValidPlacements() {
    return new Map();
  }

  _onPlacementComplete() {
    // Check if all zones are filled
    if (this.placed.size === this.dropZones.length) {
      this._renderFeedback('Assembly complete!', false);
    }
  }

  _renderFeedback(msg, isError) {
    console.log(isError ? 'Error:' : 'Success:', msg);
  }

  destroy() {
    this.container.innerHTML = '';
    super.destroy();
  }
}
