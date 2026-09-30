/* js/ui/toolbar.js — 工具列：只負責 DOM 抓取與事件轉發 */
export class Toolbar {
  constructor(handlers) {
    this.el = {
      open:      document.getElementById('btn-open'),
      file:      document.getElementById('file-input'),
      pages:     document.getElementById('input-pages'),
      apply:     document.getElementById('btn-apply-pages'),
      modeSel:   document.getElementById('btn-mode-select'),
      modePan:   document.getElementById('btn-mode-pan'),
      prev:      document.getElementById('btn-prev'),
      next:      document.getElementById('btn-next'),
      pageInfo:  document.getElementById('page-info'),
      del:       document.getElementById('btn-delete'),
      cells:     document.getElementById('btn-cells'),
      export:    document.getElementById('btn-export'),
    };

    this.el.open.addEventListener('click', () => this.el.file.click());
    this.el.file.addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) handlers.onOpenFile(f);
      e.target.value = '';
    });
    this.el.apply.addEventListener('click', () => handlers.onApplyPages(this.el.pages.value));
    this.el.modeSel.addEventListener('click', () => handlers.onMode('select'));
    this.el.modePan.addEventListener('click', () => handlers.onMode('pan'));
    this.el.prev.addEventListener('click', () => handlers.onPrev());
    this.el.next.addEventListener('click', () => handlers.onNext());
    this.el.del.addEventListener('click', () => handlers.onDelete());
    this.el.cells.addEventListener('click', () => handlers.onCells());
    this.el.export.addEventListener('click', () => handlers.onExport());
  }

  setModeActive(mode) {
    this.el.modeSel.classList.toggle('is-active', mode === 'select');
    this.el.modePan.classList.toggle('is-active', mode === 'pan');
  }

  setPageInfo(text) { this.el.pageInfo.textContent = text; }

  setEnabled(enabled) {
    Object.values(this.el).forEach(el => {
      if (el && el.tagName === 'BUTTON') el.disabled = !enabled;
    });
    this.el.open.disabled = false;
    if (!enabled) this.el.modeSel.disabled = this.el.modePan.disabled = true;
  }

  getPagesInput() { return this.el.pages.value; }
  setPagesInput(v) { this.el.pages.value = v; }
}
