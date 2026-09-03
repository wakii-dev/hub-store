// SF-23 (FI-268) T1 — PWA bootstrap. Đăng ký SW sau khi window load xong để
// không cạnh tranh bandwidth với bootstrap. Môi trường không hỗ trợ (hoặc
// đăng ký lỗi) → silent no-op: KHÔNG console lỗi (acceptance "env trống sạch").
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* env không hỗ trợ / đăng ký lỗi — no-op, không console lỗi */
    });
  });
}
