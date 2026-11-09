import { LitElement, html, css } from 'lit';
import { UpdateManager } from '../core/UpdateManager.js';
import { btn3dStyles } from './sharedStyles.js';

export class UpdateToast extends LitElement {
  static styles = [btn3dStyles, css`
    :host {
      display: block;
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--success-text);
      color: var(--on-accent);
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      transform: translateY(150%);
      transition: transform 0.3s ease-out;
    }
    :host([visible]) {
      transform: translateY(0);
    }
    .flex { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  `];

  static properties = {
    visible: { type: Boolean, reflect: true }
  };

  constructor() {
    super();
    this.visible = false;
    window.addEventListener('app-update-available', () => {
      this.visible = true;
    });
  }

  _handleUpdate() {
    UpdateManager.applyUpdate();
  }

  render() {
    return html`
      <div class="flex">
        <span>A new version is available.</span>
        <button class="btn-3d btn-secondary btn-sm" @click="${this._handleUpdate}">Refresh</button>
      </div>
    `;
  }
}
customElements.define('update-toast', UpdateToast);
