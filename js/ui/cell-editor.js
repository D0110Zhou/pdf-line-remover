/* js/ui/cell-editor.js — 儲存格文字編輯面板（Modeless） */
import { CONFIG } from '../config.js';
import { log } from '../logger.js';

export class CellEditor {
  /**
   * @param {HTMLElement} mountRoot  掛載點（#floating-root）
   * @param {{ onSelect:(i:number)=>void, onApply:()=>void, onCommit:()=>void }} handlers
   */
  constructor(mountRoot, handlers) {
    this.handlers = handlers;
    this.visible = false;
    this.cells = [];
    this.pageIdx = -1;
    this._build(mountRoot);
  }

  _build(root) {
    const el = document.createElement('div');
    el.className = 'cell-editor';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="cell-editor__header" data-drag>
        <span>V3 表格文字編輯器</span>
        <button class="cell-editor__close" data-close>×</button>
      </div>
      <div class="cell-editor__info" data-info></div>
      <div class="cell-editor__hint">
        填入之文字將置中寫入 PDF（預設字型
        <b>${CONFIG.font.latin} ${CONFIG.font.size}pt</b>，
        含中文時自動改用中文字型）
      </div>
      <div class="cell-editor__body">
        <table class="cell-table">
          <thead>
            <tr><th>儲存格</th><th>替換 / 填補內容</th></tr>
          </thead>
          <tbody data-tbody></tbody>
        </table>
      </div>
      <div class="cell-editor__footer">
        <button class="btn" data-close2>關閉 (Close)</button>
        <button class="btn btn--primary" data-apply>確認套用 (Apply)</button>
      </div>
    `;
    root.appendChild(el);

    this.root = el;
    this.tbody   = el.querySelector('[data-tbody]');
    this.infoEl  = el.querySelector('[data-info]');

    el.querySelector('[data-close]').addEventListener('click', () => this.hide());
    el.querySelector('[data-close2]').addEventListener('click', () => {
      this.commit(); this.hide();
    });
    el.querySelector('[data-apply]').addEventListener('click', () => {
      this.commit();
      const filled = this.cells.filter(c => (c.text || '').trim()).length;
      log.info(`點擊 [確認套用]：本頁 ${filled}/${this.cells.length} 格已填文字`);
      this.handlers.onApply?.();
      this.hide();
    });

    this._makeDraggable(el, el.querySelector('[data-drag]'));
  }

  _makeDraggable(panel, handle) {
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    handle.addEventListener('mousedown', e => {
      if (e.target.closest('[data-close]')) return;
      dragging = true;
      const r = panel.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      panel.style.right = 'auto';
      panel.style.left = ox + 'px';
      panel.style.top  = oy + 'px';
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      panel.style.left = (ox + e.clientX - sx) + 'px';
      panel.style.top  = (oy + e.clientY - sy) + 'px';
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }

  // ───────── 對外 API ─────────

  show()   { this.root.style.display = 'flex'; this.visible = true; }
  hide()   { this.root.style.display = 'none';  this.visible = false; }
  isVisible() { return this.visible; }

  /**
   * 載入某一頁的儲存格
   * @param {number} pageIdx
   * @param {Array}  cells
   */
  loadCells(pageIdx, cells) {
    this.commit();
    this.pageIdx = pageIdx;
    this.cells = cells;

    this.infoEl.innerHTML = `<b>PDF 第 ${pageIdx + 1} 頁</b>：共 ${cells.length} 個儲存格`;

    this.tbody.innerHTML = '';
    cells.forEach((cell, row) => {
      const tr = document.createElement('tr');
      tr.dataset.row = String(row);

      const td1 = document.createElement('td');
      td1.innerHTML = cell.id + (cell.hasText ? ' <span class="has-text">⚠</span>' : '');
      if (cell.hasText) td1.title = '此格原本已有 PDF 文字，寫入可能會疊字';

      const td2 = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = cell.text || '';
      input.dataset.row = String(row);
      td2.appendChild(input);

      tr.appendChild(td1);
      tr.appendChild(td2);

      tr.addEventListener('click', () => {
        this._markSelected(row);
        this.handlers.onSelect?.(row);
      });

      this.tbody.appendChild(tr);
    });
  }

  /** 把面板輸入寫回 cells（換頁 / 匯出前呼叫） */
  commit() {
    if (!this.cells.length) return;
    this.tbody.querySelectorAll('input[data-row]').forEach(inp => {
      const row = Number(inp.dataset.row);
      if (this.cells[row]) this.cells[row].text = inp.value;
    });
  }

  _markSelected(row) {
    this.tbody.querySelectorAll('tr').forEach(tr => {
      tr.classList.toggle('is-selected', Number(tr.dataset.row) === row);
    });
  }
}
