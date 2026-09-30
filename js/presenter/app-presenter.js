/* js/presenter/app-presenter.js — Presenter：串接 Model 與 View */
import { PDFDocument } from 'pdf-lib';
import { CONFIG } from '../config.js';
import { log } from '../logger.js';
import { PDFProcessor } from '../core/pdf-processor.js';
import { detectCells } from '../core/table-detector.js';
import { TextWriter } from '../core/text-writer.js';
import { HistoryManager } from '../core/history-manager.js';
import { CanvasView } from '../canvas/canvas-view.js';
import { Toolbar } from '../ui/toolbar.js';
import { StatusBar } from '../ui/status-bar.js';
import { CellEditor } from '../ui/cell-editor.js';
import { toast } from '../ui/toast.js';

export class AppPresenter {
  constructor(dom) {
    this.pdf = new PDFProcessor();
    this.history = new HistoryManager(CONFIG.history.maxSteps);

    this.targetPages = [];        // 使用者選定的頁碼（0-based）
    this.seqIdx = 0;              // 目前在第幾個 targetPages
    this.pageLines = new Map();   // { pageIdx: [linePlain, ...] }
    this.pageGeometry = new Map(); // { pageIdx: { hsegs, vsegs } } in PDF points
    this.pageHeights = new Map(); // { pageIdx: page height in PDF points }
    this.cellsPerPage = new Map();// { pageIdx: [cell, ...] }

    this.originalPdfBytes = null; // 匯出時用

    // ── View ──
    this.view = new CanvasView(dom.pdfCanvas, dom.overlayCanvas, dom.viewport);
    this.statusBar = new StatusBar(dom.statusText, dom.zoomText);

    this.toolbar = new Toolbar({
      onOpenFile:  f => this.openFile(f),
      onApplyPages: v => this.applyPageFilter(v),
      onMode:      m => { this.view.setMode(m); this.toolbar.setModeActive(m); },
      onPrev:      () => this.gotoPage(this.seqIdx - 1),
      onNext:      () => this.gotoPage(this.seqIdx + 1),
      onDelete:    () => this.deleteSelected(),
      onCells:     () => this.openCellEditor(),
      onExport:    () => this.exportPdf(),
    });

    this.cellEditor = new CellEditor(dom.floatingRoot, {
      onSelect: idx => this.view.highlightCell(idx),
      onApply:  () => { this.view.highlightCell(-1); toast('文字已套用，匯出時寫入 PDF', 'success'); },
    });

    this.view.onActionFinished   = () => this.recordHistory();
    this.view.onSelectionChanged = ids => {
      this.statusBar.setText(ids.length
        ? `已選取 ${ids.length} 條線（按 Delete 移除）`
        : '就緒');
    };
    this.view.onZoomRequested = factor => this.zoomBy(factor);

    this.toolbar.setEnabled(false);
    this._bindShortcuts();
  }

  _bindShortcuts() {
    window.addEventListener('keydown', e => {
      // Ctrl+Z / Ctrl+Y
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? this.redo() : this.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault(); this.redo(); return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement?.tagName === 'INPUT') return;
        e.preventDefault(); this.deleteSelected();
      }
    });
  }

  // ───────────────────── 檔案 / 頁碼 ─────────────────────

  async openFile(file) {
    try {
      this.statusBar.setText('正在載入 PDF…');
      this.originalPdfBytes = await file.arrayBuffer();

      // 重置狀態
      this.targetPages = [];
      this.seqIdx = 0;
      this.pageLines.clear();
      this.pageGeometry.clear();
      this.pageHeights.clear();
      this.cellsPerPage.clear();
      this.history.reset();
      this.view.setLines([]);
      this.view.clearCells();
      this.cellEditor.hide();

      await this.pdf.open(file.slice ? file : new File([this.originalPdfBytes], file.name));
      // PDFProcessor.open 需要 File；這裡直接餵原始 bytes 給 pdfjs
      // （實際已在 open 內完成，下面套用頁碼）
      this.toolbar.setEnabled(true);
      this.applyPageFilter('');
      toast(`已開啟 ${file.name}（共 ${this.pdf.numPages} 頁）`, 'success');
    } catch (err) {
      log.error('開啟 PDF 失敗:', err);
      toast(`開啟失敗：${err.message}`, 'error', 5000);
      this.statusBar.setText('開啟失敗');
    }
  }

  /** 解析 "1,3-5" → [0,2,3,4]（0-based） */
  _parsePageRange(str, total) {
    if (!str || !str.trim()) return Array.from({ length: total }, (_, i) => i);
    const out = new Set();
    for (const part of str.split(',')) {
      const s = part.trim();
      if (!s) continue;
      const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        let a = Number(m[1]), b = Number(m[2]);
        if (a > b) [a, b] = [b, a];
        for (let i = a; i <= b; i++) if (i >= 1 && i <= total) out.add(i - 1);
      } else if (/^\d+$/.test(s)) {
        const n = Number(s);
        if (n >= 1 && n <= total) out.add(n - 1);
      }
    }
    return [...out].sort((a, b) => a - b);
  }

  applyPageFilter(rangeStr) {
    if (!this.pdf.doc) return;
    this.saveCurrentLines();

    const pages = this._parsePageRange(rangeStr, this.pdf.numPages);
    if (!pages.length) { toast('未匹配到任何有效頁碼！', 'warn'); return; }

    this.targetPages = pages;
    this.seqIdx = 0;
    this.loadCurrentPage();
  }

  // ───────────────────── 換頁 ─────────────────────

  async loadCurrentPage() {
    if (!this.targetPages.length) return;
    const pageIdx = this.targetPages[this.seqIdx];
    this.statusBar.setText(`正在渲染第 ${pageIdx + 1} 頁…`);

    const scale = CONFIG.render.initialScale;
    this.view.setScale(scale);

    const { canvas } = await this.pdf.renderPage(pageIdx, scale);

    // 把渲染結果貼到底圖 canvas
    const pdfCv = document.getElementById('pdf-canvas');
    pdfCv.width = canvas.width;
    pdfCv.height = canvas.height;
    pdfCv.getContext('2d').drawImage(canvas, 0, 0);

    this.view.resize(canvas.width, canvas.height);
    document.getElementById('page-stack').style.width  = canvas.width + 'px';
    document.getElementById('page-stack').style.height = canvas.height + 'px';

    // 保留 PDF 座標供偵測使用；畫布座標原點在左上，需轉換垂直位置。
    const geom = await this.pdf.getPageGeometry(pageIdx);
    const { height: pageHeight } = await this.pdf.getPageSize(pageIdx);
    this.pageGeometry.set(pageIdx, geom);
    this.pageHeights.set(pageIdx, pageHeight);

    // 線條
    if (!this.pageLines.has(pageIdx)) {
      this.pageLines.set(pageIdx, geom.lines.map(l => ({
        x: l.x * scale,
        y0: (pageHeight - l.y1) * scale,
        y1: (pageHeight - l.y0) * scale,
      })));
    }
    this.view.setLines(this.pageLines.get(pageIdx));

    // 儲存格疊層
    const cells = this.cellsPerPage.get(pageIdx);
    if (cells && cells.length) {
      this.view.showCells(cells, scale, pageHeight);
      if (this.cellEditor.isVisible()) this.cellEditor.loadCells(pageIdx, cells);
    } else {
      this.view.clearCells();
    }

    this.toolbar.setPageInfo(
      `第 ${this.seqIdx + 1} / ${this.targetPages.length} 頁 (PDF 第 ${pageIdx + 1} 頁)`
    );
    this.statusBar.setText(`第 ${pageIdx + 1} 頁 — 紅線 ${this.pageLines.get(pageIdx).length} 條`);
    this.statusBar.setZoom(1);
  }

  gotoPage(idx) {
    if (idx < 0 || idx >= this.targetPages.length) return;
    this.saveCurrentLines();
    this.seqIdx = idx;
    this.loadCurrentPage();
  }

  // ───────────────────── 線條編輯 ─────────────────────

  saveCurrentLines() {
    this.cellEditor.commit();
    const pageIdx = this.currentPageIdx();
    if (pageIdx === null) return;
    this.pageLines.set(pageIdx, this.view.getLines());
  }

  currentPageIdx() {
    if (!this.targetPages.length) return null;
    return this.targetPages[this.seqIdx];
  }

  recordHistory() {
    const pageIdx = this.currentPageIdx();
    if (pageIdx === null) return;
    this.history.record(pageIdx, this.view.getLines());
    this.pageLines.set(pageIdx, this.view.getLines());
  }

  undo() {
    const pageIdx = this.currentPageIdx();
    if (pageIdx === null) return;
    const prev = this.history.undo(pageIdx, this.view.getLines());
    if (!prev) { toast('沒有更早的操作紀錄', 'warn'); return; }
    this.view.setLines(prev);
    this.pageLines.set(pageIdx, prev);
    toast('已復原 (Undo)', 'info', 1400);
  }

  redo() {
    const pageIdx = this.currentPageIdx();
    if (pageIdx === null) return;
    const next = this.history.redo(pageIdx, this.view.getLines());
    if (!next) { toast('沒有可重做的操作', 'warn'); return; }
    this.view.setLines(next);
    this.pageLines.set(pageIdx, next);
    toast('已重做 (Redo)', 'info', 1400);
  }

  deleteSelected() {
    const selected = this.view.getSelectedLines();
    if (!selected.length) { toast('請先選取線條', 'warn'); return; }

    this.recordHistory();
    const ids = new Set(selected.map(l => l.id));
    this.view.lines = this.view.lines.filter(l => !ids.has(l.id));
    this.view.clearSelection();

    const pageIdx = this.currentPageIdx();
    if (pageIdx !== null) this.pageLines.set(pageIdx, this.view.getLines());
    log.info(`成功刪除 ${selected.length} 條選取線條`);
    toast(`已移除 ${selected.length} 條線`, 'success', 1600);
  }

  zoomBy(factor) {
    const next = Math.max(CONFIG.render.minScale,
                 Math.min(CONFIG.render.maxScale, this.view.scale * factor));
    // 簡化：只更新狀態列，實際縮放需重繪整頁，這裡提示使用者
    this.statusBar.setZoom(next / CONFIG.render.initialScale);
  }

  // ───────────────────── 儲存格 ─────────────────────

  openCellEditor() {
    const pageIdx = this.currentPageIdx();
    if (pageIdx === null) { toast('請先開啟 PDF', 'warn'); return; }

    this.saveCurrentLines();
    const geom = this.pageGeometry.get(pageIdx) || { hsegs: [], vsegs: [] };
    const pageHeight = this.pageHeights.get(pageIdx);
    const scale = CONFIG.render.initialScale;
    const eraseLines = (this.pageLines.get(pageIdx) || []).map(line => ({
      x: line.x / scale,
      y0: pageHeight - line.y1 / scale,
      y1: pageHeight - line.y0 / scale,
    }));

    const { cells, reason } = detectCells(eraseLines, geom.hsegs, geom.vsegs);

    if (!cells.length) {
      toast('本頁無法推算儲存格', 'warn', 4000);
      log.warn('儲存格偵測失敗:', reason);
      alert(`本頁無法推算儲存格：\n${reason}`);
      return;
    }

    // 用座標對應保留已輸入文字
    const old = new Map(
      (this.cellsPerPage.get(pageIdx) || []).map(c =>
        [`${Math.round(c.x0)},${Math.round(c.y0)}`, c.text])
    );
    for (const c of cells) {
      const key = `${Math.round(c.x0)},${Math.round(c.y0)}`;
      c.text = old.get(key) || '';
    }

    this.cellsPerPage.set(pageIdx, cells);
    this.view.showCells(cells, scale, pageHeight);

    this.cellEditor.loadCells(pageIdx, cells);
    this.cellEditor.show();
    toast(`偵測到 ${cells.length} 個儲存格`, 'success');
  }

  // ───────────────────── 匯出 ─────────────────────

  async exportPdf() {
    if (!this.pdf.doc) { toast('請先開啟 PDF', 'warn'); return; }
    this.saveCurrentLines();

    try {
      this.statusBar.setText('正在產生 PDF…');
      const srcDoc = await PDFDocument.load(this.originalPdfBytes);
      const pages = srcDoc.getPages();

      // 1) 擦除紅線：用白色矩形覆蓋（簡化策略）
      //    真正的「移除線條」需要改寫 content stream，這裡採視覺覆蓋。
      const scale = CONFIG.render.initialScale;
      for (const [pageIdx, lines] of this.pageLines.entries()) {
        const pdfPage = pages[pageIdx];
        if (!pdfPage) continue;
        const { height: pageH } = pdfPage.getSize();

        for (const l of lines) {
          const x = l.x / scale;
          const y0 = pageH - (l.y0 / scale);
          const y1 = pageH - (l.y1 / scale);
          const top = Math.max(y0, y1);
          const bottom = Math.min(y0, y1);

          pdfPage.drawRectangle({
            x: x - 1.5,
            y: bottom,
            width: 3,
            height: top - bottom,
            color: (await import('pdf-lib')).rgb(1, 1, 1),
          });
        }
      }

      // 2) 寫入儲存格文字
      const textCount = await TextWriter.writeAll(srcDoc, this.cellsPerPage);

      const bytes = await srcDoc.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'cleaned_output.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      this.statusBar.setText(`匯出完成 — 文字儲存格 ${textCount} 格`);
      toast(`匯出完成！寫入文字 ${textCount} 格`, 'success', 4000);
    } catch (err) {
      log.error('匯出失敗:', err);
      toast(`匯出失敗：${err.message}`, 'error', 5000);
      this.statusBar.setText('匯出失敗');
    }
  }
}
