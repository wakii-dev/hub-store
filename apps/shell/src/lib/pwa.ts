// SF-23 (FI-268) T1 — PWA bootstrap. Đăng ký SW sau khi window load xong để
// không cạnh tranh bandwidth với bootstrap. Môi trường không hỗ trợ (hoặc
// đăng ký lỗi) → silent no-op: KHÔNG console lỗi (acceptance "env trống sạch").
// E2E fix: MF dev bootstrap execute main.tsx SAU khi `load` đã fire → listener
// treo vĩnh viễn, SW không bao giờ đăng ký. readyState==='complete' → đăng ký
// NGAY (bandwidth cạnh tranh không còn là vấn đề khi load xong rồi).
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* env không hỗ trợ / đăng ký lỗi — no-op, không console lỗi */
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
