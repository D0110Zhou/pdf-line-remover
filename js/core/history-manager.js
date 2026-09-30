/* js/core/history-manager.js — 每頁獨立 N 步 Undo/Redo */
import { CONFIG } from '../config.js';
import { log } from '../logger.js';

class PageHistory {
  constructor(maxLen) {
    this.maxLen = maxLen;
    this.undoStack = [];
    this.redoStack = [];
  }

  push(lines) {
    this.undoStack.push(lines.map(l => ({ x: l.x, y0: l.y0, y1: l.y1 })));
    if (this.undoStack.length > this.maxLen) this.undoStack.shift();
    this.redoStack.length = 0;
    log.debug(`歷史紀錄: 新增 1 步快照 (Undo 步數: ${this.undoStack.length})`);
  }

  undo(current) {
    if (!this.undoStack.length) { log.warn('Undo 失敗: 已無更早的操作紀錄'); return null; }
    this.redoStack.push(current.map(l => ({ x: l.x, y0: l.y0, y1: l.y1 })));
    const prev = this.undoStack.pop();
    log.info(`執行 Undo (剩餘 Undo: ${this.undoStack.length}, Redo: ${this.redoStack.length})`);
    return prev;
  }

  redo(current) {
    if (!this.redoStack.length) { log.warn('Redo 失敗: 已無可復原的操作紀錄'); return null; }
    this.undoStack.push(current.map(l => ({ x: l.x, y0: l.y0, y1: l.y1 })));
    const next = this.redoStack.pop();
    log.info(`執行 Redo (Undo: ${this.undoStack.length}, Redo: ${this.redoStack.length})`);
    return next;
  }
}

export class HistoryManager {
  constructor(maxLen = CONFIG.history.maxSteps) {
    this.maxLen = maxLen;
    this.pages = new Map();
  }

  _page(idx) {
    if (!this.pages.has(idx)) this.pages.set(idx, new PageHistory(this.maxLen));
    return this.pages.get(idx);
  }

  record(pageIdx, lines)              { this._page(pageIdx).push(lines); }
  undo(pageIdx, currentLines)         { return this._page(pageIdx).undo(currentLines); }
  redo(pageIdx, currentLines)         { return this._page(pageIdx).redo(currentLines); }
  reset()                             { this.pages.clear(); log.debug('歷史紀錄已重置'); }
}
