/* js/canvas/canvas-view.js — 畫布 View：渲染 PDF 底圖 + 紅線 + 手柄 + 框選 */
import { CONFIG } from '../config.js';
import { log } from '../logger.js';
import { LineModel } from './interactive-line.js';

const L = CONFIG.line;
const C = CONFIG.cell;

export class CanvasView {
  /**
   * @param {HTMLCanvasElement} pdfCanvas      底圖
   * @param {HTMLCanvasElement} overlayCanvas  互動層
   * @param {HTMLElement}       viewport       滾動容器
   */
  constructor(pdfCanvas, overlayCanvas, viewport) {
    this.pdfCanvas = pdfCanvas;
    this.overlayCanvas = overlayCanvas;
    this.viewport = viewport;
    this.ctx = overlayCanvas.getContext('2d');

    /** @type {LineModel[]} */
    this.lines = [];
    this.selectedIds = new Set();

    this.hoverHandle = null;         // { lineId, isTop }
    this.mode = 'select';            // 'select' | 'pan'
    this.scale = CONFIG.render.initialScale;

    this._dragging = null;           // 拖曳手柄狀態
    this._band = null;               // 框選矩形
    this._panning = null;            // 平移狀態

    /** @type {Array} 儲存格疊層 */
    this.cells = [];
    this.highlightedCell = -1;

    /** 事件回呼 */
    this.onActionFinished = null;    // (linesSnapshot) => void
    this.onSelectionChanged = null;  // (selectedIds) => void

    this._bindEvents();
    this._renderLoop = this._renderLoop.bind(this);
    requestAnimationFrame(this._renderLoop);
  }

  // ────────────────────────── 對外 API ──────────────────────────

  /** 設定渲染倍率 */
  setScale(scale) {
    this.scale = Math.max(CONFIG.render.minScale,
                 Math.min(CONFIG.render.maxScale, scale));
  }

  /** 用新的線條資料重繪（座標為螢幕像素） */
  setLines(lines) {
    this.lines = lines.map(l => new LineModel(l.x, l.y0, l.y1, l.id));
    this.selectedIds.clear();
    this._emitSelection();
  }

  getLines() { return this.lines.map(l => l.toPlain()); }

  getSelectedLines() {
    return this.lines.filter(l => this.selectedIds.has(l.id));
  }

  clearSelection() {
    this.selectedIds.clear();
    this._emitSelection();
  }

  /** 設定畫布尺寸（跟隨 PDF 底圖） */
  resize(width, height) {
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;
    this.overlayCanvas.style.width = width + 'px';
    this.overlayCanvas.style.height = height + 'px';
  }

  /** 顯示儲存格疊層 */
  showCells(cells, scale, pageHeight) {
    this.cells = cells.map(c => ({ ...c }));
    this._cellScale = scale;
    this._pageHeight = pageHeight;
    this.highlightedCell = -1;
  }

  clearCells() {
    this.cells = [];
    this.highlightedCell = -1;
  }

  highlightCell(index) {
    this.highlightedCell = index;
  }

  setMode(mode) {
    this.mode = mode;
    this.viewport.classList.toggle('is-pan', mode === 'pan');
    this.overlayCanvas.style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
    log.debug(`畫布模式切換: ${mode === 'pan' ? '平移 (Pan)' : '框選 (Box Selection)'}`);
  }

  // ────────────────────────── 事件綁定 ──────────────────────────

  _bindEvents() {
    const cv = this.overlayCanvas;
    cv.addEventListener('mousedown', e => this._onMouseDown(e));
    cv.addEventListener('mousemove', e => this._onMouseMove(e));
    window.addEventListener('mouseup', e => this._onMouseUp(e));
    cv.addEventListener('dblclick', e => this._onDoubleClick(e));
    cv.addEventListener('wheel', e => this._onWheel(e), { passive: false });
  }

  _localPos(e) {
    const r = this.overlayCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.overlayCanvas.width  / r.width),
      y: (e.clientY - r.top)  * (this.overlayCanvas.height / r.height),
    };
  }

  _handleAt(px, py) {
    const r = L.handleRadius + 3;
    for (const line of this.lines) {
      if (Math.hypot(px - line.x, py - line.y0) <= r) return { line, isTop: true };
      if (Math.hypot(px - line.x, py - line.y1) <= r) return { line, isTop: false };
    }
    return null;
  }

  _lineAt(px, py) {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (this.lines[i].hitTest(px, py)) return this.lines[i];
    }
    return null;
  }

  _onMouseDown(e) {
    if (e.button !== 0) return;
    const p = this._localPos(e);

    // 平移模式
    if (this.mode === 'pan') {
      this._panning = {
        startX: e.clientX, startY: e.clientY,
        scrollLeft: this.viewport.scrollLeft,
        scrollTop: this.viewport.scrollTop,
      };
      this.viewport.classList.add('is-panning');
      return;
    }

    // 手柄拖曳
    const h = this._handleAt(p.x, p.y);
    if (h) {
      this._dragging = { line: h.line, isTop: h.isTop };
      return;
    }

    // 點選線條（Shift 加選）
    const line = this._lineAt(p.x, p.y);
    if (line) {
      if (!e.shiftKey) this.selectedIds.clear();
      if (this.selectedIds.has(line.id)) this.selectedIds.delete(line.id);
      else this.selectedIds.add(line.id);
      this._emitSelection();
      return;
    }

    // 空白處 → 開始框選
    if (!e.shiftKey) this.selectedIds.clear();
    this._band = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    this._emitSelection();
  }

  _onMouseMove(e) {
    const p = this._localPos(e);

    if (this._panning) {
      this.viewport.scrollLeft = this._panning.scrollLeft - (e.clientX - this._panning.startX);
      this.viewport.scrollTop  = this._panning.scrollTop  - (e.clientY - this._panning.startY);
      return;
    }

    if (this._dragging) {
      const { line, isTop } = this._dragging;
      if (isTop) line.setTop(p.y); else line.setBottom(p.y);
      return;
    }

    if (this._band) {
      this._band.x1 = p.x;
      this._band.y1 = p.y;
      return;
    }

    // 手柄 hover 效果
    const h = this._handleAt(p.x, p.y);
    this.hoverHandle = h;
    this.overlayCanvas.style.cursor =
      h ? 'ns-resize' : (this._lineAt(p.x, p.y) ? 'pointer' : (this.mode === 'pan' ? 'grab' : 'crosshair'));
  }

  _onMouseUp() {
    if (this._panning) {
      this._panning = null;
      this.viewport.classList.remove('is-panning');
      return;
    }

    if (this._dragging) {
      this._dragging = null;
      if (this.onActionFinished) this.onActionFinished(this.getLines());
      return;
    }

    if (this._band) {
      const b = this._band;
      this._band = null;
      const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1);
      const y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
      if (x1 - x0 < 3 && y1 - y0 < 3) return;

      for (const line of this.lines) {
        if (line.x >= x0 && line.x <= x1 && line.y1 >= y0 && line.y0 <= y1) {
          this.selectedIds.add(line.id);
        }
      }
      this._emitSelection();
    }
  }

  _onDoubleClick(e) {
    if (this.mode !== 'select') return;
    const p = this._localPos(e);
    if (this._lineAt(p.x, p.y)) return;  // 雙擊線條不新增

    // 在空白處新增一條線
    const h = this.overlayCanvas.height;
    const line = new LineModel(p.x, p.y - 60, p.y + 60);
    this.lines.push(line);
    this.selectedIds.clear();
    this.selectedIds.add(line.id);
    this._emitSelection();
    if (this.onActionFinished) this.onActionFinished(this.getLines());
    log.info(`新增線條 X=${p.x.toFixed(0)}`);
  }

  _onWheel(e) {
    if (!e.ctrlKey) return;   // Ctrl + 滾輪才縮放
    e.preventDefault();
    const factor = e.deltaY < 0 ? CONFIG.render.zoomStep : 1 / CONFIG.render.zoomStep;
    this.onZoomRequested?.(factor);
  }

  _emitSelection() {
    if (this.onSelectionChanged) this.onSelectionChanged([...this.selectedIds]);
  }

  // ────────────────────────── 渲染 ──────────────────────────

  _renderLoop() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

    this._drawCells(ctx);
    this._drawLines(ctx);
    this._drawHandles(ctx);
    this._drawBand(ctx);

    requestAnimationFrame(this._renderLoop);
  }

  _drawCells(ctx) {
    if (!this.cells.length) return;
    const s = this._cellScale || this.scale;

    this.cells.forEach((cell, idx) => {
      const x = cell.x0 * s;
      const y = (this._pageHeight - cell.y1) * s;
      const w = cell.width * s, h = cell.height * s;

      if (idx === this.highlightedCell) {
        ctx.fillStyle = C.hoverFill;
        ctx.fillRect(x, y, w, h);
      }

      ctx.save();
      ctx.strokeStyle = C.borderColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(C.dash);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();

      // Badge
      const label = cell.id;
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      const tw = ctx.measureText(label).width;
      const bw = tw + 10, bh = 16;
      ctx.fillStyle = C.badgeBg;
      ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = C.badgeText;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 5, y + bh / 2 + 1);

      // 有文字警告標記
      if (cell.hasText) {
        ctx.fillStyle = '#DD6B20';
        ctx.fillText('⚠', x + bw + 4, y + bh / 2 + 1);
      }
    });
  }

  _drawLines(ctx) {
    for (const line of this.lines) {
      const selected = this.selectedIds.has(line.id);
      ctx.save();
      ctx.strokeStyle = selected ? '#FFD700' : L.color;
      ctx.lineWidth = selected ? L.width + 1 : L.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(line.x, line.y0);
      ctx.lineTo(line.x, line.y1);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawHandles(ctx) {
    for (const line of this.lines) {
      if (!this.selectedIds.has(line.id)) continue;
      for (const [y, isTop] of [[line.y0, true], [line.y1, false]]) {
        const hovered = this.hoverHandle &&
                        this.hoverHandle.line.id === line.id &&
                        this.hoverHandle.isTop === isTop;
        ctx.beginPath();
        ctx.arc(line.x, y, L.handleRadius + (hovered ? 1.5 : 0), 0, Math.PI * 2);
        ctx.fillStyle = hovered ? '#3399FF' : L.handleColor;
        ctx.fill();
        ctx.strokeStyle = L.handleBorder;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  }

  _drawBand(ctx) {
    if (!this._band) return;
    const b = this._band;
    const x = Math.min(b.x0, b.x1);
    const y = Math.min(b.y0, b.y1);
    const w = Math.abs(b.x1 - b.x0);
    const h = Math.abs(b.y1 - b.y0);
    ctx.save();
    ctx.fillStyle = 'rgba(49,130,206,0.12)';
    ctx.strokeStyle = '#3182CE';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
}
