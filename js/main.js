/* js/main.js — 進入點 */
import { log } from './logger.js';
import { AppPresenter } from './presenter/app-presenter.js';
import { toast } from './ui/toast.js';

function boot() {
  const dom = {
    viewport:      document.getElementById('viewport'),
    pdfCanvas:     document.getElementById('pdf-canvas'),
    overlayCanvas: document.getElementById('overlay-canvas'),
    statusText:    document.getElementById('status-text'),
    zoomText:      document.getElementById('zoom-text'),
    floatingRoot:  document.getElementById('floating-root'),
  };

  log.info('PDF 分割線去除工具 V3 (Web) 啟動');
  log.info('操作提示：雙擊空白處新增線條；拖曳端點調整；框選後按 Delete 移除');

  try {
    window.__app = new AppPresenter(dom);
    toast('就緒 — 請先開啟一份 PDF', 'info', 3200);
  } catch (err) {
    log.error('初始化失敗:', err);
    toast(`初始化失敗：${err.message}`, 'error', 6000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
