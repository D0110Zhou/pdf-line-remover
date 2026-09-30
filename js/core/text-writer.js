/* js/core/text-writer.js — 把使用者輸入的文字寫進 PDF（依 pdf-lib） */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { CONFIG } from '../config.js';
import { log } from '../logger.js';

const CJK_RE = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;

export class TextWriter {
  /**
   * 在已載入的 pdf-lib 文件上，把 cells 內有填字的儲存格寫入文字。
   * @param {PDFDocument} pdfDoc
   * @param {Map<number, Array>} cellsPerPage
   * @returns {Promise<number>} 寫入的儲存格數量
   */
  static async writeAll(pdfDoc, cellsPerPage) {
    const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    let written = 0;

    for (const [pageIdx, cells] of cellsPerPage.entries()) {
      const pdfPage = pages[pageIdx];
      if (!pdfPage) continue;

      for (const cell of cells) {
        const text = (cell.text || '').trim();
        if (!text) continue;

        if (CJK_RE.test(text)) {
          log.warn(`儲存格 ${cell.id} 含中日韓字元，內建 Helvetica 無法顯示，已略過`);
          continue;
        }

        // 偵測器保留 PDF 座標（原點在左下），可直接寫回原儲存格。
        const boxLeft = cell.x0;
        const boxRight = cell.x1;
        const boxBottom = cell.y0;
        const boxTop = cell.y1;

        const pad = CONFIG.cell.padding;
        const maxW = (boxRight - boxLeft) - pad * 2;
        const maxH = (boxTop - boxBottom) - pad * 2;
        if (maxW <= 0 || maxH <= 0) continue;

        // 自動縮字級
        let fs = CONFIG.font.size;
        let lines = TextWriter._wrap(text, latinFont, fs, maxW);
        let lineH = fs * 1.2;
        while (lineH * lines.length > maxH && fs > CONFIG.font.minSize) {
          fs -= 0.5;
          lines = TextWriter._wrap(text, latinFont, fs, maxW);
          lineH = fs * 1.2;
        }

        const totalH = lineH * lines.length;
        const startY = boxBottom + (boxTop - boxBottom + totalH) / 2 - fs * 0.85;

        lines.forEach((line, i) => {
          const lw = latinFont.widthOfTextAtSize(line, fs);
          const tx = boxLeft + (boxRight - boxLeft - lw) / 2;
          const ty = startY - i * lineH;
          pdfPage.drawText(line, {
            x: tx, y: ty, size: fs, font: latinFont, color: rgb(0, 0, 0),
          });
        });
        written++;
      }
    }

    log.info(`共寫入 ${written} 個儲存格的文字`);
    return written;
  }

  static _wrap(text, font, size, maxWidth) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let cur = '';
      for (const ch of para) {
        const next = cur + ch;
        if (!cur || font.widthOfTextAtSize(next, size) <= maxWidth) {
          cur = next;
        } else {
          out.push(cur);
          cur = ch;
        }
      }
      out.push(cur);
    }
    return out;
  }
}
