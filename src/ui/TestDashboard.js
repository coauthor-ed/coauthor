import './components/LookSlots.js';
import { LitElement, html, css } from 'lit';
import { ContentLoader } from '../core/ContentLoader.js';
import { CourseSourceManager } from '../core/CourseSourceManager.js';

export class TestDashboard extends LitElement {
  static properties = {
    tests: { type: Array },
    loading: { type: Boolean }
  };

  static styles = css`
    :host { display: block; padding: 2rem; max-width: 800px; margin: 0 auto; }
    .test-card { background: var(--bg-surface, #ffffff); padding: 1.5rem; border-radius: 8px; border: 1px solid #dfe1e6; margin-bottom: 1rem; }
    a { display: inline-block; background: var(--primary-color, #0052cc); color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; margin-top: 1rem; }
    .meta { color: var(--text-muted, #5e6c84); font-size: 0.9rem; margin-top: 0.5rem; }
  `;

  constructor() {
    super();
    this.tests = [];
    this.loading = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadCatalog();
  }

  async loadCatalog() {
    try {
      // No local content/catalog.json any more — see HomeDashboard.js's
      // firstUpdated() for the same swap to CourseSourceManager.
      const items = await CourseSourceManager.listCatalogItems();

      const testPaths = items
        .filter(item => item.type === 'test')
        .map(item => item.path);


      const loadedTests = await Promise.all(testPaths.map(async path => {
        try {
          const data = await ContentLoader.loadJSON(`/${path}`);
          return { path, ...data };
        } catch { return null; }
      }));
      
      this.tests = loadedTests.filter(t => t !== null);
    } catch (e) {
      console.error('Failed to load tests:', e);
    } finally {
      this.loading = false;
    }
  }

  render() {
    if (this.loading) {
      return html`<app-loader label="Loading tests..."></app-loader>`;
    }
    
    if (this.tests.length === 0) {
      return html`<p>No tests available.</p>`;
    }

    return html`
      <h2>Available Tests</h2>
      ${this.tests.map(test => html`
        <div class="test-card">
          <h3 style="margin-top:0">${test.title || 'Untitled Test'}</h3>
          <div class="meta">
            ${test.questions ? test.questions.length : 0} Questions • ${test.durationMinutes || 60} Minutes
          </div>
          <a href="#/test/${test.path.replace('content/', '')}">Start Test</a>
        </div>
      `)}
    `;
  }
}
customElements.define('test-dashboard', TestDashboard);
