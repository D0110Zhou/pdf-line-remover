/* js/core/table-detector.js — 依「被擦除的豎線」推算儲存格 */
import { CONFIG } from '../config.js';
import { log } from '../logger.js';

/** 多段橫線合併後，是否完整覆蓋 [x0, x1] */
function isCovered(spans, x0, x1) {
  const tol = CONFIG.detector.coverTol;
  let cur = x0;
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  for (const [a, b] of sorted) {
    if (a > cur + tol) return false;
    cur = Math.max(cur, b);
    if (cur >= x1 - tol) return true;
  }
  return cur >= x1 - tol;
}

/** 把擦除線依 X 相近 + Y 連續性分組 */
function clusterLines(eraseLines) {
  const { xTol, yGap } = CONFIG.detector;
  const sorted = [...eraseLines].sort((a, b) => a.x - b.x);
  const groups = [];

  for (const line of sorted) {
    let placed = false;
    for (const g of groups) {
      if (Math.abs(line.x - g.x) <= xTol) {
        const yMin = Math.min(...g.items.map(l => l.y0));
        const yMax = Math.max(...g.items.map(l => l.y1));
        if (line.y0 <= yMax + yGap && line.y1 >= yMin - yGap) {
          g.items.push(line);
          g.x = (g.x * (g.items.length - 1) + line.x) / g.items.length;
          placed = true;
          break;
        }
      }
    }
    if (!placed) groups.push({ x: line.x, items: [line] });
  }
  return groups;
}

/**
 * @param {Array} eraseLines  被標記擦除的豎線（PDF pt 座標）
 * @param {Array} hsegs       水平線段 [{y, x0, x1}]（PDF pt）
 * @param {Array} vsegs       垂直線段 [{x, y0, y1}]（PDF pt）
 * @returns {{ cells: Array, reason: string }}
 */
export function detectCells(eraseLines, hsegs, vsegs) {
  const { xMatch } = CONFIG.detector;
  const cells = [];
  let counter = 1;

  if (!eraseLines.length) {
    return {
      cells,
      reason: '本頁畫面上沒有任何紅線。\n注意：畫面上「剩下的紅線」才是會被擦除的；'
            + '「刪除選取線條」是把線移出擦除清單。',
    };
  }

  const reasons = [];
  const groups = clusterLines(eraseLines);

  for (const g of groups) {
    const ex = g.x;
    const ymin = Math.min(...g.items.map(l => l.y0));
    const ymax = Math.max(...g.items.map(l => l.y1));

    // 1. 找出不在此擦除組、且 Y 範圍重疊的豎線
    const kept = vsegs.filter(v =>
      v.y0 < ymax && v.y1 > ymin &&
      !eraseLines.some(e => Math.abs(v.x - e.x) <= xMatch)
    );
    const lefts  = kept.filter(v => v.x < ex).map(v => v.x);
    const rights = kept.filter(v => v.x > ex).map(v => v.x);

    // 2. 找穿過此欄的橫線
    const cross = hsegs.filter(h =>
      h.x0 - 2 <= ex && h.x1 + 2 >= ex &&
      h.y >= ymin - 1 && h.y <= ymax + 1
    );
    if (!cross.length) {
      reasons.push(`X=${ex.toFixed(0)}px 的紅線周邊找不到橫線`);
      continue;
    }

    const x0 = lefts.length  ? Math.max(...lefts)  : Math.min(...cross.map(c => c.x0));
    const x1 = rights.length ? Math.min(...rights) : Math.max(...cross.map(c => c.x1));
    if (x1 - x0 < CONFIG.cell.minWidth) {
      reasons.push(`X=${ex.toFixed(0)}px 兩側欄位過窄 (${(x1 - x0).toFixed(1)}px)`);
      continue;
    }

    // 3. 合併同一高度的橫線段，覆蓋整個 x0~x1 才算有效列分隔線
    const cand = hsegs
      .filter(h => h.y >= ymin - 1 && h.y <= ymax + 1 && h.x1 > x0 && h.x0 < x1)
      .sort((a, b) => a.y - b.y);

    const rows = [];
    for (const h of cand) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(h.y - last.y) <= 1) {
        last.spans.push([h.x0, h.x1]);
      } else {
        rows.push({ y: h.y, spans: [[h.x0, h.x1]] });
      }
    }
    const merged = rows.filter(r => isCovered(r.spans, x0, x1)).map(r => r.y);

    if (merged.length < 2) {
      reasons.push(`X=${ex.toFixed(0)}px 欄位內找不到至少 2 條完整覆蓋的橫線`);
      continue;
    }

    for (let i = 0; i < merged.length - 1; i++) {
      const y0 = merged[i];
      const y1 = merged[i + 1];
      if (y1 - y0 < CONFIG.cell.minHeight) continue;
      cells.push({
        id: `Cell #${counter++}`,
        x0, y0, x1, y1,
        width: x1 - x0,
        height: y1 - y0,
        text: '',
        hasText: false,
      });
    }
  }

  const reason = cells.length ? '' : (reasons.join('\n') || '紅線範圍內的橫線間距過小，切不出儲存格。');
  log.info(`偵測結果: ${cells.length} 個儲存格` + (reason ? `（原因: ${reason}）` : ''));
  return { cells, reason };
}
