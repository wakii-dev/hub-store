// SF-25 (FI-270) T3 — PWA bootstrap. COPY pattern shell SF-23 (readyState
// fast-path: app standalone nên `load` thường fire trước main.tsx xong — nhưng
// giữ cả hai nhánh cho an toàn). Lỗi đăng ký → silent no-op, không console lỗi.
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
