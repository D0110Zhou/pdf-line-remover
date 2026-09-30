/* js/config.js — 全域設定（對應 Python config.py） */
export const CONFIG = {
  render: {
    initialScale: 1.5,
    minScale: 0.25,
    maxScale: 5.0,
    zoomStep: 1.15,
  },

  line: {
    color: '#FF0000',
    width: 2.5,
    handleRadius: 5,
    handleColor: '#0078FF',
    handleBorder: '#FFFFFF',
    /** 判定「水平/垂直」的容許誤差（pt） */
    tol: 2.0,
    /** 過短的線視為雜訊（pt） */
    minLength: 5.0,
    /** 細矩形視為線的厚度上限（pt） */
    thin: 3.0,
    /** 拖曳手柄時，兩端點最小間距（像素） */
    minGap: 5,
  },

  cell: {
    minWidth: 10,
    minHeight: 8,
    padding: 3,
    badgeBg: '#3182CE',
    badgeText: '#FFFFFF',
    hoverFill: 'rgba(43,108,176,0.22)',
    borderColor: '#4299E1',
    dash: [5, 4],
  },

  font: {
    latin: 'Calibri, Carlito, "Helvetica Neue", Arial, sans-serif',
    cjk: '"Microsoft JhengHei", "PingFang TC", "Noto Sans CJK TC", "Heiti TC", sans-serif',
    size: 12,
    minSize: 6,
  },

  history: { maxSteps: 10 },

  detector: {
    /** 聚類：兩條線 X 相差多少以內視為同一欄 */
    xTol: 3.0,
    /** 聚類：Y 間隔超過多少視為不同表格區塊 */
    yGap: 5.0,
    /** 判斷兩條豎線是否為同一條的 X 容許誤差 */
    xMatch: 2.0,
    /** 覆蓋判定容許的縫隙（pt） */
    coverTol: 2.0,
  },
};
