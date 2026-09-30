/* js/ui/status-bar.js — 底部狀態列 */
export class StatusBar {
  constructor(textEl, zoomEl) {
    this.textEl = textEl;
    this.zoomEl = zoomEl;
  }
  setText(text) { this.textEl.textContent = text; }
  setZoom(ratio) { this.zoomEl.textContent = `${Math.round(ratio * 100)}%`; }
}
