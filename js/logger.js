/* js/logger.js — 分級日誌（對應 Python logger.py） */
const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40, CRITICAL: 50 };
let currentLevel = LEVELS.DEBUG;

const stamp = () => {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.` +
         `${p(d.getMilliseconds(), 3)}`;
};

export const log = {
  setLevel(name) {
    const lv = LEVELS[String(name).toUpperCase()];
    if (lv) { currentLevel = lv; log.info(`日誌輸出層級已切換為: ${name.toUpperCase()}`); }
  },
  debug(...a) { if (currentLevel <= LEVELS.DEBUG) console.debug(`[${stamp()}] [DEBUG]`, ...a); },
  info(...a)  { if (currentLevel <= LEVELS.INFO)  console.info(`[${stamp()}] [INFO]`,  ...a); },
  warn(...a)  { if (currentLevel <= LEVELS.WARN)  console.warn(`[${stamp()}] [WARN]`,  ...a); },
  error(...a) { if (currentLevel <= LEVELS.ERROR) console.error(`[${stamp()}] [ERROR]`, ...a); },
};
