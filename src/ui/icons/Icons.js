import { LitElement, html } from 'lit';
import { appUrl } from '../../core/basePath.js';

// Base class for Light DOM rendering so existing CSS targets work smoothly
class UIIconBase extends LitElement {
  createRenderRoot() {
    return this;
  }
}

export class UIIconCorrect extends UIIconBase {
  render() { return html`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--success-text)"><polyline points="20 6 9 17 4 12"></polyline></svg>`; }
}

export class UIIconWrong extends UIIconBase {
  render() { return html`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--error-text)"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`; }
}

export class UIIconLogo extends UIIconBase {
  render() { return html`<span style="display: inline-flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.18); padding: 2px; border-radius: 6px; margin-right: 6px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);"><img src="${appUrl('assets/icons/coauthor.png')}" alt="CoAuthor Logo" width="18" height="18" style="vertical-align:middle; object-fit:contain; display:block;" /></span>`; }
}

export class UIIconMenu extends UIIconBase {
  render() { return html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`; }
}

export class UIIconSidebar extends UIIconBase {
  render() { return html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>`; }
}

export class UIIconConsole extends UIIconBase {
  render() { return html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="15" x2="21" y2="15"></line></svg>`; }
}

export class UIIconMaximize extends UIIconBase {
  render() { return html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`; }
}

export class UIIconRestore extends UIIconBase {
  render() { return html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`; }
}

export class UIIconClear extends UIIconBase {
  render() { return html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`; }
}

export class UIIconTheme extends UIIconBase {
  render() { return html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`; }
}

export class UIIconMinimizeLeft extends UIIconBase {
  render() { return html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`; }
}

export class UIIconMinimizeDown extends UIIconBase {
  render() { return html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`; }
}

export class UIIconPlay extends UIIconBase {
  render() { return html`<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>`; }
}

export class UIIconPause extends UIIconBase {
  render() { return html`<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`; }
}

customElements.define('ui-icon-correct', UIIconCorrect);
customElements.define('ui-icon-wrong', UIIconWrong);
customElements.define('ui-icon-logo', UIIconLogo);
customElements.define('ui-icon-menu', UIIconMenu);
customElements.define('ui-icon-sidebar', UIIconSidebar);
customElements.define('ui-icon-console', UIIconConsole);
customElements.define('ui-icon-maximize', UIIconMaximize);
customElements.define('ui-icon-restore', UIIconRestore);
customElements.define('ui-icon-clear', UIIconClear);
customElements.define('ui-icon-theme', UIIconTheme);
customElements.define('ui-icon-minimize-left', UIIconMinimizeLeft);
customElements.define('ui-icon-minimize-down', UIIconMinimizeDown);
customElements.define('ui-icon-play', UIIconPlay);
customElements.define('ui-icon-pause', UIIconPause);
