/**
 * escapeHtml — SF-24 (code-review P1): popupHtml là chuỗi HTML raw đi thẳng vào
 * Leaflet bindPopup → MỌI giá trị data nội suy (orderCode, address, tên, SĐT...)
 * phải escape trước khi nhét vào template, chống HTML/XSS injection.
 * Escape cả 5 ký tự nguy hiểm (& < > " ') — dùng được cho cả text node
 * lẫn attribute context (vd href="tel:...").
 */
const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}
