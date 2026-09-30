/* js/ui/toast.js — 輕量通知 */
const root = () => document.getElementById('toast-root');

export function toast(message, type = 'info', duration = 2600) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  root().appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(16px)';
    setTimeout(() => el.remove(), 260);
  }, duration);
}
