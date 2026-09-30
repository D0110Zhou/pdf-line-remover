/* js/core/pdf-processor.js — PDF 載入、渲染、線段抽取 */
import * as pdfjsLib from 'pdfjs-dist';
import { log } from '../logger.js';
import { CONFIG } from '../config.js';
import { extractSegments } from './line-detector.js';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).toString();

export class PDFProcessor {
  constructor() {
    this.doc = null;
    this.fileName = '';
    this._pageCache = new Map();   // { pageIdx: { lines, hsegs, vsegs } }
  }

  get numPages() { return this.doc ? this.doc.numPages : 0; }

  async open(file) {
    const buf = await file.arrayBuffer();
    this.doc = await pdfjsLib.getDocument({ data: buf }).promise;
    this.fileName = file.name;
    this._pageCache.clear();
    log.info(`PDF 已載入: ${file.name} (${this.doc.numPages} 頁)`);
    return this.doc.numPages;
  }

  close() {
    if (this.doc) { try { this.doc.destroy(); } catch (_) {} }
    this.doc = null;
    this._pageCache.clear();
  }

  /**
   * 渲染某一頁到離屏 canvas。
   * @returns {Promise<{canvas:HTMLCanvasElement, viewport:Object}>}
   */
  async renderPage(pageIdx, scale = CONFIG.render.initialScale) {
    const page = await this.doc.getPage(pageIdx + 1);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width  = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    return { canvas, viewport };
  }

  /**
   * 取得某一頁的向量線段（pt 座標），含快取。
   * @returns {Promise<{lines:Array, hsegs:Array, vsegs:Array}>}
   */
  async getPageGeometry(pageIdx) {
    if (this._pageCache.has(pageIdx)) return this._pageCache.get(pageIdx);

    const page = await this.doc.getPage(pageIdx + 1);
    const opList = await page.getOperatorList();
    const { hsegs, vsegs } = extractSegments(opList, pdfjsLib.OPS);

    const lines = vsegs
      .filter(s => s.y1 - s.y0 > CONFIG.line.minLength)
      .map(s => ({ x: s.x, y0: s.y0, y1: s.y1 }));

    const result = { lines, hsegs, vsegs };
    this._pageCache.set(pageIdx, result);
    log.info(`第 ${pageIdx + 1} 頁幾何: 豎線 ${lines.length} 條`);
    return result;
  }

  /** 取得某一頁的原始尺寸（pt） */
  async getPageSize(pageIdx) {
    const page = await this.doc.getPage(pageIdx + 1);
    const vp = page.getViewport({ scale: 1 });
    return { width: vp.width, height: vp.height };
  }
}
