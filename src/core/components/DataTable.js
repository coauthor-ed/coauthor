/**
 * DataTable — native HTML table from a declarative config.
 *
 * Used for data-interpretation questions (physics tables, solubility charts, etc.)
 * Appendix C.2 in HLD.
 *
 * Config shape:
 *   { columns: string[], rows: (string|number)[][], caption?: string }
 */
export class DataTable extends HTMLElement {
  connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;
    this._render();
  }

  /**
   * @param {{ columns: string[], rows: any[][], caption?: string }} config
   */
  init(config) {
    this._config = config;
  }

  _render() {
    const { columns = [], rows = [], caption } = this._config || {};
    const style = document.createElement('style');
    style.textContent = `
      table { border-collapse: collapse; width: 100%; font-size: 0.95rem; }
      th, td { border: 1px solid var(--border-color); padding: 8px 12px; text-align: left; }
      th { background: var(--bg-base); font-weight: var(--fw-medium); }
      tr:nth-child(even) td { background: var(--bg-surface); }
      caption { caption-side: top; font-weight: var(--fw-medium); margin-bottom: 6px; text-align: left; }
    `;
    this.appendChild(style);

    const table = document.createElement('table');
    if (caption) {
      const cap = document.createElement('caption');
      cap.textContent = caption;
      table.appendChild(cap);
    }
    const thead = table.createTHead();
    const hRow = thead.insertRow();
    columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col;
      th.setAttribute('scope', 'col');
      hRow.appendChild(th);
    });
    const tbody = table.createTBody();
    rows.forEach(row => {
      const tr = tbody.insertRow();
      row.forEach(cell => {
        const td = tr.insertCell();
        td.textContent = cell;
      });
    });
    this.appendChild(table);
  }
}

customElements.define('data-table', DataTable);
