/* js/canvas/interactive-line.js — 線條資料模型 */
import { CONFIG } from '../config.js';

let SEQ = 0;

export class LineModel {
  /**
   * @param {number} x   豎線的 X 座標（螢幕像素）
   * @param {number} y0  上端 Y
   * @param {number} y1  下端 Y
   */
  constructor(x, y0, y1, id = null) {
    this.id = id || `L${++SEQ}`;
    this.x  = x;
    this.y0 = Math.min(y0, y1);
    this.y1 = Math.max(y0, y1);
  }

  clone() { return new LineModel(this.x, this.y0, this.y1, this.id); }

  setTop(y)    { if (y < this.y1 - CONFIG.line.minGap) this.y0 = y; }
  setBottom(y) { if (y > this.y0 + CONFIG.line.minGap) this.y1 = y; }

  /** 命中測試：點 (px, py) 是否落在這條線附近 */
  hitTest(px, py, tolerance = 6) {
    if (px < this.x - tolerance || px > this.x + tolerance) return false;
    return py >= this.y0 - tolerance && py <= this.y1 + tolerance;
  }

  toPlain() { return { x: this.x, y0: this.y0, y1: this.y1 }; }
}
