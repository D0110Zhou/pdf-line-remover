/* js/core/line-detector.js — 從 PDF 內容流抽取水平/垂直線段（pt 座標） */
import { CONFIG } from '../config.js';
import { log } from '../logger.js';

/** 把 2D 仿射矩陣套用到點上 */
function applyMatrix(p, m) {
  return [ m[0] * p[0] + m[2] * p[1] + m[4],
           m[1] * p[0] + m[3] * p[1] + m[5] ];
}

/**
 * 解析 pdf.js 的 operator list，抽出所有直線段。
 * @param {Object} opList  pdf.js 的 getOperatorList() 結果
 * @param {Object} OPS     pdfjsLib.OPS
 * @returns {{ hsegs: Array, vsegs: Array }}  座標單位為 PDF pt
 */
export function extractSegments(opList, OPS) {
  const { tol, minLength } = CONFIG.line;
  const hsegs = [];
  const vsegs = [];

  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let pending = null;

  const pushSegment = (a, b, m) => {
    const p = applyMatrix(a, m);
    const q = applyMatrix(b, m);
    const dx = Math.abs(p[0] - q[0]);
    const dy = Math.abs(p[1] - q[1]);
    if (dy < tol && dx > minLength) {
      hsegs.push({ y: (p[1] + q[1]) / 2, x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]) });
    } else if (dx < tol && dy > minLength) {
      vsegs.push({ x: (p[0] + q[0]) / 2, y0: Math.min(p[1], q[1]), y1: Math.max(p[1], q[1]) });
    }
  };

  const processPath = (ops, coords, m) => {
    let ci = 0;
    let cur = null, start = null;
    const pop = () => [coords[ci++], coords[ci++]];

    for (const op of ops) {
      if (op === OPS.moveTo) {
        cur = pop(); start = cur;
      } else if (op === OPS.lineTo) {
        const next = pop();
        if (cur) pushSegment(cur, next, m);
        cur = next;
      } else if (op === OPS.curveTo)  { ci += 6; cur = null; }
      else if (op === OPS.curveTo2)   { ci += 4; cur = null; }
      else if (op === OPS.curveTo3)   { ci += 4; cur = null; }
      else if (op === OPS.closePath)  { if (cur && start) pushSegment(cur, start, m); cur = start; }
      else if (op === OPS.rectangle) {
        const x = coords[ci++], y = coords[ci++], w = coords[ci++], h = coords[ci++];
        const p1 = [x, y], p2 = [x + w, y], p3 = [x + w, y + h], p4 = [x, y + h];
        pushSegment(p1, p2, m); pushSegment(p2, p3, m);
        pushSegment(p3, p4, m); pushSegment(p4, p1, m);
      }
    }
  };

  const STROKE_OPS = new Set([
    OPS.stroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke,
    OPS.closeStroke, OPS.closeFillStroke, OPS.closeEOFillStroke,
  ].filter(v => v !== undefined));

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === OPS.save) {
      stack.push(ctm.slice());
    } else if (fn === OPS.restore) {
      if (stack.length) ctm = stack.pop();
    } else if (fn === OPS.transform) {
      ctm = pdfjsMatrixMul(ctm, args);
    } else if (fn === OPS.constructPath) {
      pending = { ops: args[0], coords: args[1], m: ctm.slice() };
    } else if (STROKE_OPS.has(fn)) {
      if (pending) { processPath(pending.ops, pending.coords, pending.m); pending = null; }
    }
  }

  log.info(`線段抽取: 橫線 ${hsegs.length} 條, 豎線 ${vsegs.length} 條`);
  return { hsegs, vsegs };
}

/** 複製 pdf.js Util.transform 的行為（避免依賴私有 API） */
function pdfjsMatrixMul(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}
